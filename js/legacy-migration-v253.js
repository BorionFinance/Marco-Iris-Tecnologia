(() => {
  'use strict';
  const VERSION='1.0.0';
  const runtime={bundle:null,simulation:null,running:false,button:null,overlay:null,privateFiles:new Map(),packageName:''};
  const clone=v=>v==null?v:JSON.parse(JSON.stringify(v));
  const isBlank=v=>v===undefined||v===null||v==='';
  const dataOf=state=>state?.dataByProfile?.[state.activeProfileId||state.profiles?.[0]?.id]||null;
  const byId=arr=>new Map((Array.isArray(arr)?arr:[]).map(x=>[String(x?.id||x?.code||''),x]));
  const maxCode=(items,prefix)=>Math.max(0,...(items||[]).map(x=>{const value=String(x?.code||x?.id||'');const m=value.match(new RegExp(`^${prefix}-(\\d{6})$`));return m?Number(m[1]):0;}));
  const sha256=async blob=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer()))].map(b=>b.toString(16).padStart(2,'0')).join('');

  function eligible(){
    try{return !runtime.running&&typeof STATE!=='undefined'&&STATE&&typeof LOCKED!=='undefined'&&!LOCKED&&window.GoogleDriveMarco?.isConfigured?.();}
    catch(_){return false;}
  }
  function migrationDone(){
    const d=typeof STATE!=='undefined'?dataOf(STATE):null;
    return Boolean(d?.settings?.migration?.historicalImportVersion===VERSION&&d?.settings?.migration?.completedAt);
  }
  function normalizePrivatePath(value){
    const raw=String(value||'').replace(/\\/g,'/').replace(/^\/+/, '');
    const lower=raw.toLowerCase();
    const marker='/migration/';
    const at=lower.lastIndexOf(marker);
    if(at>=0)return raw.slice(at+1);
    if(lower.startsWith('migration/'))return raw;
    const mediaAt=lower.lastIndexOf('/media/');
    if(mediaAt>=0)return `migration/${raw.slice(mediaAt+1)}`;
    const name=raw.split('/').pop()||raw;
    if(['marco_iris_dados.migrado.json','simulacao_migracao.json'].includes(name.toLowerCase()))return `migration/${name}`;
    return raw;
  }
  function privateFile(path){
    return runtime.privateFiles.get(normalizePrivatePath(path).toLowerCase())||null;
  }
  async function selectPrivatePackage(fileList){
    runtime.bundle=null;runtime.simulation=null;runtime.privateFiles.clear();runtime.packageName='';
    const files=Array.from(fileList||[]);
    if(!files.length)throw new Error('Nenhuma pasta foi selecionada.');
    for(const file of files){
      const rel=normalizePrivatePath(file.webkitRelativePath||file.name);
      runtime.privateFiles.set(rel.toLowerCase(),file);
    }
    const bundleFile=privateFile('migration/Marco_Iris_Dados.migrado.json');
    const simulationFile=privateFile('migration/SIMULACAO_MIGRACAO.json');
    if(!bundleFile||!simulationFile)throw new Error('Pasta inválida. Selecione a pasta extraída do PACOTE PRIVADO, que contém a subpasta migration.');
    runtime.bundle=JSON.parse(await bundleFile.text());
    runtime.simulation=JSON.parse(await simulationFile.text());
    const required=mediaList(runtime.bundle);
    const missing=required.filter(entry=>!privateFile(entry.meta?.migrationPath));
    if(missing.length)throw new Error(`Pacote privado incompleto: ${missing.length} mídia(s) não foram encontradas. Exemplo: ${missing[0]?.meta?.fileName||'arquivo ausente'}`);
    runtime.packageName=(files[0].webkitRelativePath||'').split('/')[0]||'pacote privado';
    return {bundle:runtime.bundle,simulation:runtime.simulation,files:files.length,media:required.length};
  }
  async function loadBundle(){
    if(runtime.bundle&&runtime.simulation)return {bundle:runtime.bundle,simulation:runtime.simulation};
    throw new Error('Selecione primeiro o pacote privado armazenado no computador. Nenhum dado histórico é carregado do GitHub.');
  }

  function mergeMissing(incoming,current){
    if(Array.isArray(incoming)||Array.isArray(current))return clone(current??incoming);
    const out=clone(incoming||{});
    for(const [key,value] of Object.entries(current||{})){
      if(value&&typeof value==='object'&&!Array.isArray(value)&&out[key]&&typeof out[key]==='object'&&!Array.isArray(out[key]))out[key]=mergeMissing(out[key],value);
      else if(!isBlank(value))out[key]=clone(value);
      else if(!(key in out))out[key]=clone(value);
    }
    return out;
  }
  function mergeMedia(incoming,current){
    const out=[],seen=new Set();
    for(const item of [...(current||[]),...(incoming||[])]){
      const key=String(item?.sha256||item?.id||item?.fileName||'');
      if(!key||seen.has(key))continue;seen.add(key);
      const old=(current||[]).find(x=>String(x?.sha256||x?.id||x?.fileName||'')===key);
      out.push(old?mergeMissing(item,old):clone(item));
    }
    return out;
  }
  function mergeCollection(incoming,current,{kind='generic'}={}){
    const cm=byId(current),out=[];
    for(const inc of incoming||[]){
      const key=String(inc?.id||inc?.code||''),cur=cm.get(key);
      if(!cur){out.push(clone(inc));continue;}
      cm.delete(key);
      if(kind==='payment'){
        // Um pagamento que já existia na base oficial não recebe bloqueio histórico novo.
        const merged=clone(cur);
        if(isBlank(merged.legacyTechnicalId)&&!isBlank(inc.legacyTechnicalId))merged.legacyTechnicalId=inc.legacyTechnicalId;
        out.push(merged);continue;
      }
      const merged=mergeMissing(inc,cur);
      if(kind==='order'){
        merged.photos=mergeMedia(inc.photos,cur.photos);
        merged.pdfs=mergeMedia(inc.pdfs,cur.pdfs);
        merged.attachments=mergeMedia(inc.attachments,cur.attachments);
        if(isBlank(cur.clientSnapshot)&&inc.clientSnapshot)merged.clientSnapshot=clone(inc.clientSnapshot);
        if(isBlank(cur.legacyReconciliation)&&inc.legacyReconciliation)merged.legacyReconciliation=clone(inc.legacyReconciliation);
      }
      out.push(merged);
    }
    for(const item of cm.values())out.push(clone(item));
    return out;
  }
  function mergeState(current,incoming){
    const merged=clone(current),currentData=dataOf(current),incomingData=dataOf(incoming);
    if(!currentData||!incomingData)throw new Error('A base atual ou o pacote migrado não possui um perfil de dados válido.');
    const profileId=current.activeProfileId||current.profiles?.[0]?.id;
    merged.dataByProfile=merged.dataByProfile||{};
    const target=merged.dataByProfile[profileId]||{};
    target.clients=mergeCollection(incomingData.clients,currentData.clients);
    target.serviceOrders=mergeCollection(incomingData.serviceOrders,currentData.serviceOrders,{kind:'order'});
    target.orderItems=mergeCollection(incomingData.orderItems,currentData.orderItems);
    target.payments=mergeCollection(incomingData.payments,currentData.payments,{kind:'payment'});
    target.products=mergeCollection(incomingData.products,currentData.products);
    target.services=mergeCollection(incomingData.services,currentData.services);
    target.supplies=mergeCollection(incomingData.supplies,currentData.supplies);
    target.stockMovements=mergeCollection(incomingData.stockMovements,currentData.stockMovements);
    target.appointments=mergeCollection(incomingData.appointments,currentData.appointments);
    target.consents=mergeCollection(incomingData.consents,currentData.consents);
    target.attachments=mergeCollection(incomingData.attachments,currentData.attachments);
    target.legacyUsers=clone(currentData.legacyUsers||incomingData.legacyUsers||[]);
    target.legacyDashboardFilters=clone(currentData.legacyDashboardFilters||incomingData.legacyDashboardFilters||[]);
    target.settings=mergeMissing(incomingData.settings||{},currentData.settings||{});
    target.settings.nextIds=target.settings.nextIds||{};
    const specs={OSV:'serviceOrders',CLI:'clients',ITM:'orderItems',REC:'payments',PRD:'products',SRV:'services',INS:'supplies',MOV:'stockMovements'};
    for(const [prefix,key] of Object.entries(specs))target.settings.nextIds[prefix]=Math.max(Number(target.settings.nextIds[prefix])||0,maxCode(target[key],prefix)+1);
    target.settings.migration={...(target.settings.migration||{}),historicalImportVersion:VERSION,completedAt:'',bridgeLock:'legacy-record-flags',nextOsv:`OSV-${String(target.settings.nextIds.OSV).padStart(6,'0')}`};
    target.audit=[{id:`audit_legacy_migration_${Date.now()}`,date:new Date().toISOString(),action:'Migração histórica integral preparada',detail:'Base consolidada reconciliada com planilhas, PDFs, fotos e anexos do sistema anterior.'},...(target.audit||[])].slice(0,300);
    merged.dataByProfile[profileId]=target;
    // Identidade e histórico da integração em uso sempre prevalecem sobre o pacote offline.
    merged.interconnections=clone(current.interconnections||incoming.interconnections||{});
    merged.migration={...(incoming.migration||{}),...(current.migration||{}),id:'marco-iris-legacy-integral-v1',version:VERSION,status:'uploading'};
    merged.updatedAt=new Date().toISOString();
    return merged;
  }

  function mediaList(state){
    const d=dataOf(state),out=[];
    for(const order of d?.serviceOrders||[]){
      for(const [field,folder] of [['photos','photos'],['pdfs','pdfs'],['attachments','attachments']]){
        for(const meta of order[field]||[])if(meta?.migrationPath)out.push({order,field,folder,meta});
      }
    }
    return out;
  }
  function counts(state){const d=dataOf(state)||{};return {clients:d.clients?.length||0,orders:d.serviceOrders?.length||0,items:d.orderItems?.length||0,payments:d.payments?.length||0,products:d.products?.length||0,services:d.services?.length||0,supplies:d.supplies?.length||0,movements:d.stockMovements?.length||0,media:mediaList(state).length};}
  function assertExpected(state){
    const c=counts(state),errors=[];
    if(c.orders<290)errors.push(`OSVs: ${c.orders}/290`);if(c.clients<142)errors.push(`Clientes: ${c.clients}/142`);if(c.items<824)errors.push(`Itens: ${c.items}/824`);if(c.payments<295)errors.push(`Pagamentos: ${c.payments}/295`);
    const d=dataOf(state),ids=new Set((d?.serviceOrders||[]).map(x=>x.id));if(!ids.has('OSV-000001')||!ids.has('OSV-000290'))errors.push('Faixa de OSVs incompleta.');
    const imported=(d?.payments||[]).filter(x=>x.legacyImported&&x.migrationOrigin==='MarcoIris-AppSheet-Legacy');if(imported.some(x=>x.bridgeEligible!==false||x.excludeFromBorion!==true))errors.push('Há pagamento histórico elegível para o Borion.');
    if(errors.length)throw new Error('Validação pré-gravação falhou: '+errors.join(' · '));
    return c;
  }

  function ensureUi(){
    if(runtime.overlay)return runtime.overlay;
    const root=document.createElement('div');root.id='legacy-migration-root';root.innerHTML=`<style>
      #legacy-migration-root{position:fixed;inset:0;z-index:100000;display:none;background:rgba(0,13,30,.78);backdrop-filter:blur(12px);padding:20px;overflow:auto}
      #legacy-migration-root.open{display:grid;place-items:center}.lm-card{width:min(820px,100%);background:#09294c;color:#eef7ff;border:1px solid #2f5f8d;border-radius:24px;padding:24px;box-shadow:0 28px 80px rgba(0,0,0,.45)}
      .lm-card h2{margin:0 0 8px}.lm-card p{color:#bed1e4;line-height:1.5}.lm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:18px 0}.lm-kpi{background:#061f3b;border:1px solid #244e77;border-radius:14px;padding:12px}.lm-kpi b{display:block;font-size:1.35rem}.lm-log{height:220px;overflow:auto;background:#03172d;border:1px solid #244e77;border-radius:14px;padding:12px;font:12px/1.5 Consolas,monospace;white-space:pre-wrap}.lm-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:16px}.lm-actions button{border:0;border-radius:12px;padding:12px 16px;font-weight:800;cursor:pointer}.lm-cancel{background:#dbe7f4;color:#06213e}.lm-select{background:#1b76dc;color:#fff}.lm-run{background:#ff6a32;color:#fff}.lm-run:disabled{opacity:.45;cursor:not-allowed}.lm-progress{height:10px;background:#03172d;border-radius:10px;overflow:hidden;margin:12px 0}.lm-progress span{display:block;height:100%;width:0;background:#ff6a32;transition:width .18s ease}.lm-note{font-size:.9rem}.lm-security{padding:12px 14px;border:1px solid #26745a;background:#082f31;border-radius:14px;color:#bff5dc!important}.lm-ok{color:#76e6ac}.lm-error{color:#ff9c9c}
      #legacy-migration-launch{position:fixed;right:18px;bottom:84px;z-index:99990;border:1px solid #ff8c61;border-radius:999px;padding:11px 16px;background:#ff642f;color:white;font-weight:800;box-shadow:0 12px 30px rgba(0,0,0,.28);cursor:pointer}
    </style><section class="lm-card" role="dialog" aria-modal="true"><h2>Migração histórica integral</h2><p class="lm-security"><strong>Privacidade:</strong> os dados históricos não estão no GitHub. Selecione a pasta privada no computador; o navegador lerá os arquivos localmente e enviará as mídias diretamente ao Google Drive.</p><p>Simulação, backup da base oficial, envio de mídias e gravação idempotente no Google Drive. A integração com o Borion fica pausada durante a operação.</p><div data-lm-summary><p class="lm-note">Nenhum pacote privado selecionado.</p></div><div class="lm-progress"><span data-lm-bar></span></div><div class="lm-log" data-lm-log>Selecione a pasta extraída do pacote privado.</div><input type="file" data-lm-folder webkitdirectory directory multiple hidden><div class="lm-actions"><button class="lm-cancel" data-lm-close>Fechar</button><button class="lm-select" data-lm-select>Selecionar pacote privado</button><button class="lm-run" data-lm-run disabled>Executar migração</button></div></section>`;
    document.body.appendChild(root);runtime.overlay=root;
    const folderInput=root.querySelector('[data-lm-folder]');
    root.querySelector('[data-lm-close]').onclick=()=>{if(!runtime.running)root.classList.remove('open');};
    root.querySelector('[data-lm-select]').onclick=()=>{if(!runtime.running){folderInput.value='';folderInput.click();}};
    folderInput.onchange=async()=>{
      const runBtn=root.querySelector('[data-lm-run]');runBtn.disabled=true;
      try{
        const selected=await selectPrivatePackage(folderInput.files);
        renderPackageSummary();
        log(`Pacote privado selecionado localmente: ${selected.files} arquivos; ${selected.media} mídias exigidas.`,'lm-ok');
        runBtn.disabled=false;
      }catch(error){runtime.bundle=null;runtime.simulation=null;log(error.message||String(error),'lm-error');}
    };
    root.querySelector('[data-lm-run]').onclick=()=>run().catch(()=>{});
    return root;
  }
  function log(text,tone=''){const el=ensureUi().querySelector('[data-lm-log]');const line=document.createElement('div');if(tone)line.className=tone;line.textContent=`[${new Date().toLocaleTimeString('pt-BR')}] ${text}`;el.appendChild(line);el.scrollTop=el.scrollHeight;}
  function progress(done,total){ensureUi().querySelector('[data-lm-bar]').style.width=`${total?Math.min(100,done/total*100):0}%`;}
  function renderPackageSummary(){
    const ui=ensureUi(),runBtn=ui.querySelector('[data-lm-run]');
    if(!runtime.bundle||!runtime.simulation){
      ui.querySelector('[data-lm-summary]').innerHTML='<p class="lm-note">Nenhum pacote privado selecionado.</p>';
      runBtn.disabled=true;return;
    }
    const c=counts(runtime.bundle),current=counts(STATE),simulation=runtime.simulation;
    ui.querySelector('[data-lm-summary]').innerHTML=`<div class="lm-grid"><div class="lm-kpi"><b>${c.orders}</b>OSVs no pacote</div><div class="lm-kpi"><b>${c.clients}</b>clientes</div><div class="lm-kpi"><b>${c.items}</b>itens</div><div class="lm-kpi"><b>${c.payments}</b>pagamentos</div><div class="lm-kpi"><b>${c.media}</b>mídias vinculadas</div><div class="lm-kpi"><b>${simulation.conflicts}</b>divergências registradas</div></div><p class="lm-note">Pacote local: ${runtime.packageName}. Base atual: ${current.orders} OSVs, ${current.clients} clientes e ${current.payments} pagamentos. Registros atuais prevalecem; o histórico preenche lacunas e adiciona o que estiver ausente.</p>`;
    log(`Simulação: ${simulation.status}. Erros estruturais: ${simulation.errors.length}. Pendências: ${simulation.pendingFiles}.`);
    if(simulation.status!=='ready'||simulation.errors.length){runBtn.disabled=true;throw new Error('A simulação contém erro estrutural e a execução foi bloqueada.');}
    runBtn.disabled=false;
  }
  async function open(){
    const ui=ensureUi();ui.classList.add('open');
    if(runtime.bundle){try{renderPackageSummary();}catch(error){log(error.message||String(error),'lm-error');}}
    else log('Nenhum dado privado foi carregado do site. Clique em “Selecionar pacote privado”.');
  }

  async function uploadMedia(state,journal=[]){
    const list=mediaList(state),cache=new Map();let done=0;
    for(const entry of list){
      const meta=entry.meta;if(meta.driveFileId){done++;progress(done,list.length);continue;}
      let remote=meta.sha256?cache.get(meta.sha256):null;
      if(!remote){
        const blob=privateFile(meta.migrationPath);if(!blob)throw new Error(`Arquivo privado não encontrado na pasta selecionada: ${meta.fileName}`);
        const digest=await sha256(blob);if(meta.sha256&&digest!==meta.sha256)throw new Error(`Hash divergente no arquivo local: ${meta.fileName}`);
        remote=await GoogleDriveMarco.uploadBlob(blob,entry.folder,meta.fileName,'',meta.sha256||'');
        if(remote?.created&&remote?.id)journal.push(remote.id);
        if(meta.sha256)cache.set(meta.sha256,remote);
      }
      meta.driveFileId=remote.id;meta.webViewLink=remote.webViewLink||'';meta.uploadedAt=new Date().toISOString();done++;progress(done,list.length);log(`Mídia ${done}/${list.length}: ${meta.fileName}`);
    }
    return done;
  }

  async function run(){
    if(runtime.running)return;runtime.running=true;const ui=ensureUi(),runBtn=ui.querySelector('[data-lm-run]'),closeBtn=ui.querySelector('[data-lm-close]');runBtn.disabled=true;closeBtn.disabled=true;
    const before=clone(STATE),uploadedDriveIds=[];let remoteCommitted=false,integrationBefore={bridge:null,ack:null},baseBackup=null,integrationBackup=null;window.MarcoBorionInterop?.pause?.('legacy-migration');
    try{
      const {bundle}=await loadBundle();log('Criando backup integral da base oficial e da integração…');
      integrationBefore.bridge=await GoogleDriveMarco.readIntegrationJson('marco-iris.bridge.json').catch(()=>null);integrationBefore.ack=await GoogleDriveMarco.readIntegrationJson('marco-iris.ack.json').catch(()=>null);
      baseBackup=await GoogleDriveMarco.writeForceSave(before);integrationBackup=await GoogleDriveMarco.writeBackupJson(`Borion_Integracoes_antes_migracao_${Date.now()}.json`,{schema:'marco.iris.migration.integration-backup',createdAt:new Date().toISOString(),companyInstanceId:before?.interconnections?.borion?.companyInstanceId||before?.interconnections?.borion?.instanceId||'',bridge:integrationBefore.bridge,ack:integrationBefore.ack});
      let merged=mergeState(before,bundle);const pre=assertExpected(merged);log(`Reconciliação concluída: ${pre.orders} OSVs, ${pre.items} itens, ${pre.payments} pagamentos.`,'lm-ok');
      log('Enviando PDFs, fotos e anexos ao Google Drive…');await uploadMedia(merged,uploadedDriveIds);
      const d=dataOf(merged);d.settings.migration.completedAt=new Date().toISOString();d.settings.migration.backup={baseFileId:baseBackup?.id||'',baseFileName:baseBackup?.name||'',integrationBackupFileId:integrationBackup?.file?.id||'',integrationBackupFileName:integrationBackup?.file?.name||'',createdAt:new Date().toISOString()};merged.migration.status='completed';merged.migration.completedAt=d.settings.migration.completedAt;merged.updatedAt=new Date().toISOString();
      assertExpected(merged);STATE=merged;normalizeState();
      log('Gravando a base migrada no arquivo oficial…');await GoogleDriveMarco.enqueueSave(STATE,{backup:true,reason:'migracao-historica-integral'});remoteCommitted=true;await MarcoStorage.save(STATE,{touch:false});
      const remote=await GoogleDriveMarco.load({interactive:false,rememberBase:true}),remoteCounts=assertExpected(remote.state);
      if(remoteCounts.orders!==counts(STATE).orders||remoteCounts.items!==counts(STATE).items||remoteCounts.payments!==counts(STATE).payments)throw new Error('A releitura do Google Drive não confirmou as contagens da migração.');
      STATE=remote.state;normalizeState();LAST_CONFIRMED_STATE=clone(STATE);log('Google Drive relido e contagens confirmadas.','lm-ok');
      window.MarcoBorionInterop?.resume?.('legacy-migration');renderShell();progress(1,1);log('Migração concluída. Os 295 pagamentos históricos permanecem fora do Borion.','lm-ok');
      if(runtime.button)runtime.button.remove();runtime.button=null;
    }catch(error){
      let rollbackError=null;
      if(remoteCommitted){
        try{log('Restaurando a base oficial anterior…','lm-error');const restored=await GoogleDriveMarco.restoreOfficialSnapshot(before,{reason:'rollback-migracao-historica'});STATE=restored.state;log('Rollback da base oficial confirmado no Google Drive.','lm-ok');}
        catch(failure){rollbackError=failure;STATE=before;log(`Falha no rollback remoto: ${failure.message||failure}`,'lm-error');}
      }else STATE=before;
      for(const fileId of [...uploadedDriveIds].reverse())await GoogleDriveMarco.trash(fileId).catch(()=>{});
      if(integrationBefore.bridge)await GoogleDriveMarco.writeIntegrationJson('marco-iris.bridge.json',integrationBefore.bridge).catch(failure=>{rollbackError=rollbackError||failure;});
      if(integrationBefore.ack)await GoogleDriveMarco.writeIntegrationJson('marco-iris.ack.json',integrationBefore.ack).catch(failure=>{rollbackError=rollbackError||failure;});
      normalizeState();await MarcoStorage.save(STATE,{touch:false}).catch(()=>{});window.MarcoBorionInterop?.resume?.('legacy-migration');log(`FALHA: ${error.message||error}`,'lm-error');
      log(rollbackError?'A restauração remota exige revisão manual pelo backup pré-migração.':'A sessão e a base oficial voltaram ao estado anterior; mídias criadas nesta tentativa foram removidas.','lm-error');
      if(rollbackError)error.rollbackError=rollbackError;throw error;
    }finally{runtime.running=false;closeBtn.disabled=false;runBtn.disabled=migrationDone();}
  }

  function ensureButton(){
    if(!eligible()||migrationDone()){if(runtime.button){runtime.button.remove();runtime.button=null;}return;}
    if(runtime.button)return;
    const b=document.createElement('button');b.id='legacy-migration-launch';b.type='button';b.textContent='Migrar dados históricos';b.onclick=open;document.body.appendChild(b);runtime.button=b;
  }
  setInterval(ensureButton,1200);
  window.MarcoLegacyMigration=Object.freeze({version:VERSION,open,run,mergeState,counts,assertExpected,selectPrivatePackage,__test:{mergeMissing,mergeMedia,mergeCollection,mediaList,normalizePrivatePath}});
})();
