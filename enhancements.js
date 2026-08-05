/* Marco Iris v2.8.6 — módulos funcionais consolidados e otimizados. */

/* Marco Iris v2.8.6 — perfil de renderização automático */
(() => {
  'use strict';
  const apply = () => {
    const memory = Number(navigator.deviceMemory || 0);
    const cores = Number(navigator.hardwareConcurrency || 0);
    const coarse = matchMedia?.('(pointer:coarse)')?.matches || false;
    const lite = coarse || (memory > 0 && memory <= 8) || (cores > 0 && cores <= 8);
    const ultra = (memory > 0 && memory <= 4) || (cores > 0 && cores <= 4);
    document.body?.classList.toggle('perf-lite', lite);
    document.body?.classList.toggle('perf-ultra-lite', ultra);
  };
  if (document.body) apply();
  else document.addEventListener('DOMContentLoaded', apply, { once: true });
})();

/* ===== js/legacy-migration-v253.js ===== */
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

/* ===== js/personalization-v221.js ===== */
(() => {
  'use strict';
  const VERSION='2.6.6';
  const SCHEMA=9;
  const SNAP_DISTANCE=8;
  const HISTORY_LIMIT=30;
  const MAX_TEMPLATE_IMAGE_BYTES=5*1024*1024;
  const MAX_TEMPLATE_IMPORT_BYTES=25*1024*1024;
  const MAX_TEMPLATE_EMBEDDED_BYTES=20*1024*1024;
  const DEFAULT_MESSAGE='Olá, {{cliente_nome}}!\n\nSegue em anexo o documento referente à {{osv_codigo}}.\n\nObrigado pela preferência! Qualquer dúvida, fico à disposição.';
  const VARS={
    '{{cliente_nome}}':'Nome do cliente','{{osv_codigo}}':'Código da OSV','{{empresa_nome}}':'Nome da empresa','{{equipamento}}':'Equipamento','{{data}}':'Data atual'
  };
  const PDF_VARS=[
    ['{{empresa.nome}}','Empresa — Nome'],['{{empresa.cnpj}}','Empresa — CNPJ'],['{{empresa.telefone}}','Empresa — Telefone'],['{{empresa.email}}','Empresa — E-mail'],['{{empresa.endereco}}','Empresa — Endereço'],
    ['{{osv.codigo}}','OSV — Código'],['{{osv.data}}','OSV — Data'],['{{osv.status}}','OSV — Status'],['{{osv.problema}}','OSV — Problema'],['{{osv.laudo}}','OSV — Laudo'],['{{osv.servicoRealizado}}','OSV — Serviço realizado'],['{{osv.observacoes}}','OSV — Observações'],['{{osv.desconto}}','Financeiro — Desconto'],['{{osv.total}}','Financeiro — Total'],
    ['{{cliente.nome}}','Cliente — Nome'],['{{cliente.telefone}}','Cliente — Telefone'],['{{cliente.email}}','Cliente — E-mail'],['{{cliente.endereco}}','Cliente — Endereço'],['{{equipamento.nome}}','Equipamento — Nome'],['{{equipamento.marca}}','Equipamento — Marca'],['{{equipamento.modelo}}','Equipamento — Modelo'],['{{equipamento.numeroSerie}}','Equipamento — Número de série'],['{{equipamento.serie}}','Equipamento — Série'],['{{financeiro.subtotal}}','Financeiro — Subtotal'],['{{financeiro.desconto}}','Financeiro — Desconto'],['{{financeiro.total}}','Financeiro — Total'],['{{pagina.numero}}','Sistema — Página atual'],['{{pagina.total}}','Sistema — Total de páginas'],['{{sistema.dataGeracao}}','Sistema — Data de geração']
  ];
  const FIELD_DEFS=[
    ['clientField','Cliente','client-selector',24,24,560,66,280,50,false,true],
    ['equipmentField','Equipamento','equipment-selector',600,24,560,66,250,50,false,true],
    ['openedAtField','Data de abertura','date',24,126,260,56,160,46,false,true],
    ['completedAtField','Data de conclusão','date',300,126,260,56,160,46,false,false],
    ['statusField','Status operacional','select',576,126,280,56,180,46,false,true],
    ['brandModelField','Marca / Modelo','text',872,126,288,56,200,46,false,false],
    ['serialNumberField','Número de série','text',24,218,260,56,180,46,false,false],
    ['accessPasswordField','Senha de acesso','text',300,218,260,56,180,46,false,false],
    ['accessoriesField','Acessórios deixados','text',576,218,584,56,240,46,false,false],
    ['reportedIssueField','Defeito relatado','textarea',24,316,560,108,300,76,true,true],
    ['technicalReportField','Laudo técnico','textarea',600,316,560,108,300,76,true,false],
    ['clientNotesField','Observações para o cliente','textarea',24,482,560,98,300,72,true,false],
    ['internalNotesField','Observação interna','textarea',600,482,560,98,300,72,true,false],
    ['itemsField','Itens e Serviços','dynamic-section',24,634,1136,390,480,240,true,true],
    ['paymentsField','Pagamentos','dynamic-section',24,1046,1136,310,480,220,true,false],
    ['photosField','Fotos','media-section',24,1378,1136,310,300,220,true,false],
    ['actionButtons','Ações finais','actions',24,1710,1136,152,420,120,true,true]
  ];
  const CLIENT_FIELD_DEFS=[
    ['identifier','Identificador do cliente','identifier',16,16,1168,58,220,46,true,true],
    ['name','Nome','text',16,104,1168,60,220,48,true,true],
    ['phone','Telefone','tel',16,202,568,60,180,48,true,false],
    ['document','CPF/CNPJ','text',600,202,584,60,180,48,true,false],
    ['address','Rua / Endereço','text',16,300,760,60,240,48,true,false],
    ['zip','CEP','text',792,300,392,60,160,48,true,false],
    ['addressTools','Busca de endereço e resultados','dynamic-section',16,398,1168,118,300,88,true,false],
    ['number','Número','text',16,532,240,60,140,48,true,false],
    ['city','Cidade','text',272,532,456,60,180,48,true,false],
    ['state','Estado','select',744,532,184,60,120,48,true,false],
    ['neighborhood','Bairro','text',944,532,240,60,160,48,true,false],
    ['complement','Complemento','text',16,630,568,60,180,48,true,false],
    ['notes','Observação interna','textarea',600,630,584,102,260,72,true,false],
    ['actions','Ações do formulário','actions',16,778,1168,72,360,58,true,true]
  ];
  const CLIENT_NODE_SELECTORS={identifier:'.osv-code-preview',name:'.client-name',phone:'[name="phone"]',document:'[name="document"]',address:'[name="address"]',zip:'[name="zip"]',addressTools:'.cep-helper',number:'[name="number"]',city:'.city-large',state:'.state-small',neighborhood:'[name="neighborhood"]',complement:'[name="complement"]',notes:'[name="notes"]',actions:'.form-actions'};
  const PDF_COMPONENT_LIBRARY={
    text:{label:'Texto',width:70,height:12,text:'Novo texto',fontSize:10},
    title:{label:'Título',width:150,height:16,text:'Título do documento',fontSize:18,bold:true},
    subtitle:{label:'Subtítulo',width:150,height:12,text:'Subtítulo',fontSize:12,bold:true},
    line:{label:'Linha',width:170,height:2},
    rect:{label:'Retângulo',width:80,height:30},
    gradient:{label:'Fundo em degradê',width:210,height:297,startColor:'#031a35',endColor:'#137bc2',gradientDirection:'vertical'},
    logo:{label:'Logo principal',width:42,height:24,assetUrl:'assets/marco-symbol.png',fit:'contain',lockAspectRatio:true},
    image:{label:'Imagem',width:55,height:35,fit:'contain',lockAspectRatio:true},
    field:{label:'Campo da OSV',width:170,height:12,text:'{{osv.codigo}}',fontSize:10},
    'table-items':{label:'Tabela de itens',width:190,height:65},
    'table-products':{label:'Tabela de produtos',width:190,height:65},
    'table-services':{label:'Tabela de serviços',width:190,height:65},
    'table-payments':{label:'Tabela de pagamentos',width:190,height:55},
    'photos-grid':{label:'Grade de fotos',width:190,height:100,columns:2,perPage:4},
    signature:{label:'Assinatura',width:75,height:28,text:'Assinatura do cliente'},
    'page-number':{label:'Número da página',width:55,height:8,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:8},
    'generation-date':{label:'Data de geração',width:55,height:8,text:'{{sistema.dataGeracao}}',fontSize:8}
  };
  let installed=false;
  let orderLayoutEditor=null;
  let pdfEditor=null;
  let whatsappObserver=null;
  let orderFormObserver=null;
  let clientFormObserver=null;
  const openFormResizeObservers={order:null,client:null};
  const ACTION_INFLIGHT_221=new Set();
  const cloneValue=v=>JSON.parse(JSON.stringify(v));
  const uid=prefix=>`${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
  const roundGrid=(v,size)=>Math.round(v/size)*size;
  const viewportBand=()=>innerWidth<700?'mobile':innerWidth<1000?'tablet':'desktop';
  const settings=()=>data().settings;
  const activeTemplates=()=>settings().pdfTemplates||[];
  const defaultTemplate=()=>activeTemplates().find(x=>x.id===settings().defaultPdfTemplateId)||activeTemplates().find(x=>x.isDefault)||activeTemplates()[0];
  const escapeRegExp=s=>String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');

  function buildVisualLayout221(definitions,{id,name}){
    let tabletY=16;
    const components=definitions.map((d,index)=>{
      const tabletHeight=Math.max(d[8],Math.min(d[6],260));
      const component={id:d[0],label:d[1],type:d[2],visible:true,locked:false,required:d[10],allowHeight:d[9],minWidth:d[7],minHeight:d[8],desktop:{x:d[3],y:d[4],width:d[5],height:d[6]},tablet:{x:16,y:tabletY,width:736,height:tabletHeight},mobile:{order:index,span:2,height:Math.max(d[8],Math.min(d[6],300))}};
      tabletY+=tabletHeight+16;
      return component;
    });
    return {id,name,schemaVersion:2,layoutSchemaVersion:2,revision:1,gridSize:8,snapEnabled:true,showGrid:false,autoMobile:true,updatedAt:new Date().toISOString(),canvas:{desktopWidth:1200,tabletWidth:768,mobileWidth:393},components};
  }
  function defaultOrderLayout(){return buildVisualLayout221(FIELD_DEFS,{id:'osv-layout-default',name:'Layout padrão da OSV'});}
  function defaultClientLayout(){return buildVisualLayout221(CLIENT_FIELD_DEFS,{id:'client-form-layout-default',name:'Layout padrão do Novo Cliente'});}

  function normalizeVisualLayout221(current,official){
    let changed=false;
    const known=new Map((current.components||[]).map(c=>[c.id,c]));
    current.components=(current.components||[]).filter(c=>official.components.some(x=>x.id===c.id));
    for(const def of official.components){
      let c=known.get(def.id);
      if(!c){c=cloneValue(def);current.components.push(c);changed=true;continue;}
      for(const key of ['label','type','required','allowHeight','minWidth','minHeight'])if(c[key]!==def[key]){c[key]=def[key];changed=true;}
      if(c.required&&c.visible===false){c.visible=true;changed=true;}
      for(const band of ['desktop','tablet']){
        if(!c[band]||!['x','y','width','height'].every(k=>Number.isFinite(Number(c[band][k])))){c[band]=cloneValue(def[band]);changed=true;}
      }
      if(!c.mobile||!Number.isFinite(Number(c.mobile.order))||![1,2].includes(Number(c.mobile.span))||!Number.isFinite(Number(c.mobile.height))){c.mobile=cloneValue(def.mobile);changed=true;}
    }
    current.schemaVersion=2;current.layoutSchemaVersion=2;current.revision=Math.max(1,Number(current.revision)||1);
    current.canvas={...official.canvas,...(current.canvas||{})};
    current.gridSize=Math.max(2,Number(current.gridSize)||8);current.snapEnabled=current.snapEnabled!==false;current.showGrid=!!current.showGrid;current.autoMobile=current.autoMobile!==false;
    return changed;
  }

  function migrateClientLayout221(s){
    const official=defaultClientLayout(),legacy=s.clientFormLayout;
    if(legacy&&Number(legacy.schemaVersion)>=2&&Array.isArray(legacy.components))return normalizeVisualLayout221(legacy,official);
    if(legacy&&Array.isArray(legacy.components))s.clientFormLayoutLegacyBackupV227={migratedAt:new Date().toISOString(),schemaVersion:legacy.schemaVersion||1,layout:cloneValue(legacy)};
    const next=official;
    if(legacy&&Array.isArray(legacy.components)){
      const legacyOrdered=legacy.components.slice().sort((a,b)=>(Number(a.desktop?.order)||0)-(Number(b.desktop?.order)||0));
      const legacyById=new Map(legacyOrdered.map(item=>[item.id,item]));
      // O esquema antigo só descrevia os campos personalizados. Para impedir que os componentes
      // adicionados na v2 ocupem as mesmas coordenadas, todos são refluídos em uma única sequência:
      // primeiro a ordem legada preservada, depois os componentes novos na ordem oficial.
      const orderedIds=[...legacyOrdered.map(item=>item.id),...next.components.map(c=>c.id).filter(id=>!legacyById.has(id))];
      let y=16,col=0,rowHeight=0;
      orderedIds.forEach(id=>{
        const c=next.components.find(x=>x.id===id),old=legacyById.get(id);if(!c)return;
        if(old){c.visible=c.required?true:old.visible!==false;c.locked=!!old.locked;}
        const inferredFull=Number(c.desktop?.width)>=900;
        const span=old?(Number(old.desktop?.span)===1?1:2):(inferredFull?2:1);
        const requestedHeight=old?Number(old.desktop?.height):Number(c.desktop?.height);
        const height=Math.max(c.minHeight,Math.min(600,requestedHeight||c.minHeight));
        if(span===2&&col){y+=rowHeight+16;col=0;rowHeight=0;}
        c.desktop={x:col?600:16,y,width:span===2?1168:568,height};rowHeight=Math.max(rowHeight,height);
        if(span===2){y+=rowHeight+16;col=0;rowHeight=0;}else if(col===0)col=1;else{y+=rowHeight+16;col=0;rowHeight=0;}
        if(old)c.mobile={order:Number.isFinite(Number(old.mobile?.order))?Number(old.mobile.order):c.mobile.order,span:Number(old.mobile?.span)===1?1:2,height:Math.max(c.minHeight,Math.min(600,Number(old.mobile?.height)||height))};
      });
      let tabletY=16;next.components.slice().sort((a,b)=>(a.mobile.order||0)-(b.mobile.order||0)).forEach(c=>{c.tablet={x:16,y:tabletY,width:736,height:Math.max(c.minHeight,Math.min(c.mobile.height||c.desktop.height,360))};tabletY+=c.tablet.height+16;});
      next.revision=2;next.updatedAt=new Date().toISOString();
    }
    const legacyKeys=Object.keys(s.formLayouts||{}).filter(k=>k==='client'||k.startsWith('client:'));
    if(legacyKeys.length){s.clientFormLayoutLegacyGridBackupV227={migratedAt:new Date().toISOString(),entries:Object.fromEntries(legacyKeys.map(k=>[k,cloneValue(s.formLayouts[k])]))};legacyKeys.forEach(k=>delete s.formLayouts[k]);}
    s.clientFormLayout=next;s.migrations=s.migrations||{};s.migrations.clientLayoutV227={completedAt:new Date().toISOString(),targetSchema:2};return true;
  }


  function defaultPdfTemplate(name='Projeto PDF 1',id='pdf-template-default'){
    const now=new Date().toISOString();
    return {
      id,name,description:'Modelo principal com dados, itens, pagamentos e fotos',isDefault:id==='pdf-template-default',version:1,schemaVersion:1,engine:'visual',quality:'standard',createdAt:now,updatedAt:now,
      page:{size:'A4',orientation:'portrait',margins:{top:10,right:10,bottom:10,left:10}},assets:[],versions:[],
      pages:[{id:'page-main',name:'Dados principais',dynamic:false,components:[
        {id:uid('pdfc'),type:'logo',label:'Logo principal',x:10,y:8,width:34,height:20,assetUrl:'assets/marco-symbol.png',locked:false,zIndex:1,opacity:1},
        {id:uid('pdfc'),type:'title',label:'Título',x:50,y:10,width:150,height:12,text:'ORDEM DE SERVIÇO — {{osv.codigo}}',fontSize:18,bold:true,align:'right',color:'#092b52',zIndex:2},
        {id:uid('pdfc'),type:'line',label:'Linha',x:10,y:31,width:190,height:1,color:'#2d72b8',zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Empresa',x:10,y:36,width:190,height:20,text:'{{empresa.nome}}\n{{empresa.telefone}} • {{empresa.email}}\n{{empresa.endereco}}',fontSize:9,color:'#26394d',zIndex:1},
        {id:uid('pdfc'),type:'subtitle',label:'Dados do cliente',x:10,y:60,width:190,height:9,text:'DADOS DO CLIENTE',fontSize:12,bold:true,color:'#092b52',zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Cliente',x:10,y:71,width:190,height:24,text:'Cliente: {{cliente.nome}}\nTelefone: {{cliente.telefone}}\nEndereço: {{cliente.endereco}}',fontSize:9,zIndex:1},
        {id:uid('pdfc'),type:'subtitle',label:'Equipamento',x:10,y:98,width:190,height:9,text:'EQUIPAMENTO E DIAGNÓSTICO',fontSize:12,bold:true,color:'#092b52',zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Diagnóstico',x:10,y:109,width:190,height:52,text:'Equipamento: {{equipamento.nome}}\nMarca / Modelo: {{equipamento.modelo}}\nNúmero de série: {{equipamento.serie}}\nProblema relatado: {{osv.problema}}\nLaudo técnico: {{osv.laudo}}',fontSize:9,zIndex:1,overflow:'next-page'},
        {id:uid('pdfc'),type:'table-items',label:'Tabela de itens',x:10,y:165,width:190,height:58,fontSize:8,overflow:'next-page',hideWhenEmpty:false,zIndex:1},
        {id:uid('pdfc'),type:'table-payments',label:'Tabela de pagamentos',x:10,y:227,width:190,height:34,fontSize:8,overflow:'next-page',hideWhenEmpty:true,zIndex:1},
        {id:uid('pdfc'),type:'text',label:'Totais',x:115,y:264,width:85,height:18,text:'Desconto geral: {{osv.desconto}}\nTotal final: {{osv.total}}',fontSize:11,bold:true,align:'right',zIndex:1},
        {id:uid('pdfc'),type:'generation-date',label:'Data de geração',x:10,y:286,width:70,height:6,text:'Gerado em {{sistema.dataGeracao}}',fontSize:7,color:'#647487',zIndex:1},
        {id:uid('pdfc'),type:'page-number',label:'Número da página',x:150,y:286,width:50,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:'#647487',zIndex:1}
      ]},{id:'page-photos',name:'Fotos',dynamic:true,components:[
        {id:uid('pdfc'),type:'title',label:'Fotos',x:10,y:10,width:190,height:12,text:'REGISTRO FOTOGRÁFICO — {{osv.codigo}}',fontSize:16,bold:true,color:'#092b52'},
        {id:uid('pdfc'),type:'photos-grid',label:'Grade de fotos',x:10,y:28,width:190,height:245,columns:2,perPage:4,showCaption:true,hideWhenEmpty:true,overflow:'next-page'},
        {id:uid('pdfc'),type:'page-number',label:'Número da página',x:150,y:286,width:50,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:'#647487'}
      ]}]
    };
  }

  function clonePdfComponent221(c){return {id:uid('pdfc'),locked:false,zIndex:1,opacity:1,...cloneValue(c)};}
  function gradientPdfComponent221(label,startColor,endColor,direction='vertical',zIndex=-100){
    return clonePdfComponent221({type:'gradient',label,x:0,y:0,width:210,height:297,startColor,endColor,gradientDirection:direction,locked:true,zIndex});
  }
  function rectPdfComponent221(label,x,y,width,height,color,zIndex=-20,locked=true){
    return clonePdfComponent221({type:'rect',label,x,y,width,height,color,backgroundColor:color,locked,zIndex});
  }
  function linePdfComponent221(label,x,y,width,color,zIndex=2,strokeWidth=1){
    return clonePdfComponent221({type:'line',label,x,y,width,height:.4,color,zIndex,strokeWidth,locked:true});
  }
  function baseMainComponents221(style){
    const text=style.text||'#17304b',muted=style.muted||'#5f7388',accent=style.accent||'#55b8f0',panel=style.panel||'#f7fbff',titleColor=style.titleColor||'#ffffff';
    const components=[
      gradientPdfComponent221('Fundo azul em degradê',style.gradientStart,style.gradientEnd,style.gradientDirection||'vertical'),
      rectPdfComponent221('Painel principal',8,42,194,238,panel,-40,true),
      rectPdfComponent221('Faixa de destaque',8,42,4,238,accent,-30,true),
      clonePdfComponent221({type:'logo',label:'Logo principal',x:14,y:9,width:28,height:20,assetUrl:'assets/marco-symbol.png',fit:'contain',lockAspectRatio:true,zIndex:4}),
      clonePdfComponent221({type:'title',label:'Título da OSV',x:48,y:9,width:148,height:12,text:'ORDEM DE SERVIÇO — {{osv.codigo}}',fontSize:17,bold:true,align:'right',color:titleColor,zIndex:4}),
      clonePdfComponent221({type:'text',label:'Resumo da OSV',x:48,y:23,width:148,height:8,text:'Data: {{osv.data}}  •  Status: {{osv.status}}',fontSize:8.5,bold:true,align:'right',color:style.headerMuted||'#cfeaff',zIndex:4}),
      clonePdfComponent221({type:'text',label:'Dados da empresa',x:14,y:31,width:182,height:8,text:'{{empresa.nome}}  •  {{empresa.telefone}}  •  {{empresa.email}}',fontSize:7.5,align:'center',color:style.headerMuted||'#d7efff',zIndex:4}),
      clonePdfComponent221({type:'subtitle',label:'Título — Cliente',x:15,y:50,width:180,height:8,text:'DADOS DO CLIENTE',fontSize:10.5,bold:true,color:style.sectionColor||style.gradientEnd,zIndex:3}),
      linePdfComponent221('Linha — Cliente',15,58,180,accent,2,.8),
      clonePdfComponent221({type:'text',label:'Dados do cliente',x:15,y:62,width:180,height:23,text:'Cliente: {{cliente.nome}}\nTelefone: {{cliente.telefone}}  •  E-mail: {{cliente.email}}\nEndereço: {{cliente.endereco}}',fontSize:8.2,lineHeight:1.22,color:text,zIndex:3}),
      clonePdfComponent221({type:'subtitle',label:'Título — Equipamento',x:15,y:89,width:180,height:8,text:'EQUIPAMENTO E DIAGNÓSTICO',fontSize:10.5,bold:true,color:style.sectionColor||style.gradientEnd,zIndex:3}),
      linePdfComponent221('Linha — Equipamento',15,97,180,accent,2,.8),
      clonePdfComponent221({type:'text',label:'Equipamento e diagnóstico',x:15,y:101,width:180,height:55,text:'Equipamento: {{equipamento.nome}}\nMarca / Modelo: {{equipamento.modelo}}\nNúmero de série: {{equipamento.numeroSerie}}\nProblema relatado: {{osv.problema}}\nLaudo técnico: {{osv.laudo}}',fontSize:8.2,lineHeight:1.22,color:text,zIndex:3,overflow:'next-page'}),
      clonePdfComponent221({type:'table-items',label:'Itens e serviços',x:15,y:162,width:180,height:64,fontSize:7.6,overflow:'next-page',hideWhenEmpty:false,zIndex:3}),
      rectPdfComponent221('Resumo financeiro',116,232,79,28,style.totalPanel||'#eaf4fb',1,true),
      clonePdfComponent221({type:'text',label:'Totais',x:121,y:237,width:69,height:17,text:'Subtotal: {{financeiro.subtotal}}\nDesconto: {{financeiro.desconto}}\nTOTAL: {{financeiro.total}}',fontSize:9.3,lineHeight:1.18,bold:true,align:'right',color:style.totalColor||style.gradientEnd,zIndex:3}),
      clonePdfComponent221({type:'text',label:'Observações do cliente',x:15,y:234,width:94,height:24,text:'{{osv.observacoes}}',fontSize:7.8,lineHeight:1.2,color:muted,zIndex:3,hideWhenEmpty:true}),
      clonePdfComponent221({type:'generation-date',label:'Data de geração',x:12,y:282,width:90,height:6,text:'Gerado em {{sistema.dataGeracao}}',fontSize:7,color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true}),
      clonePdfComponent221({type:'page-number',label:'Número da página',x:145,y:282,width:53,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true})
    ];
    if(style.headerBlock)components.splice(1,0,rectPdfComponent221('Cabeçalho sólido',0,0,210,40,style.headerBlock,-60,true));
    if(style.sideGlow)components.splice(3,0,rectPdfComponent221('Detalhe lateral',198,0,12,297,style.sideGlow,-50,true));
    if(style.circuit){
      [[10,6,22],[34,14,18],[152,5,22],[170,19,25],[18,37,30]].forEach((item,index)=>components.push(linePdfComponent221(`Conexão ${index+1}`,item[0],item[1],item[2],accent,-10,.55)));
    }
    return components;
  }
  function basePhotoComponents221(style){
    const accent=style.accent||'#55b8f0',panel=style.panel||'#f7fbff',titleColor=style.titleColor||'#ffffff';
    const components=[
      gradientPdfComponent221('Fundo azul em degradê',style.gradientStart,style.gradientEnd,style.gradientDirection||'vertical'),
      rectPdfComponent221('Painel de fotografias',8,42,194,238,panel,-40,true),
      rectPdfComponent221('Faixa de destaque',8,42,4,238,accent,-30,true),
      clonePdfComponent221({type:'logo',label:'Logo principal',x:14,y:9,width:28,height:20,assetUrl:'assets/marco-symbol.png',fit:'contain',lockAspectRatio:true,zIndex:4}),
      clonePdfComponent221({type:'title',label:'Título das fotos',x:48,y:10,width:148,height:12,text:'REGISTRO FOTOGRÁFICO — {{osv.codigo}}',fontSize:15.5,bold:true,align:'right',color:titleColor,zIndex:4}),
      clonePdfComponent221({type:'photos-grid',label:'Grade de fotos',x:15,y:51,width:180,height:218,columns:2,perPage:4,showCaption:true,hideWhenEmpty:true,overflow:'next-page',zIndex:3}),
      clonePdfComponent221({type:'generation-date',label:'Data de geração',x:12,y:282,width:90,height:6,text:'Gerado em {{sistema.dataGeracao}}',fontSize:7,color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true}),
      clonePdfComponent221({type:'page-number',label:'Número da página',x:145,y:282,width:53,height:6,text:'Página {{pagina.numero}} de {{pagina.total}}',fontSize:7,align:'right',color:style.footerColor||'#d6ebfa',zIndex:5,repeatOnEveryPage:true})
    ];
    if(style.headerBlock)components.splice(1,0,rectPdfComponent221('Cabeçalho sólido',0,0,210,40,style.headerBlock,-60,true));
    if(style.sideGlow)components.splice(3,0,rectPdfComponent221('Detalhe lateral',198,0,12,297,style.sideGlow,-50,true));
    if(style.circuit){
      [[10,6,22],[34,14,18],[152,5,22],[170,19,25]].forEach((item,index)=>components.push(linePdfComponent221(`Conexão ${index+1}`,item[0],item[1],item[2],accent,-10,.55)));
    }
    return components;
  }
  function createProfessionalPdfTemplate221(style,index){
    const id=`pdf-template-professional-${index+1}`,now=new Date().toISOString();
    return {
      id,name:style.name,description:style.description,designKey:style.key,builtinPackVersion:2,isDefault:false,version:1,schemaVersion:3,engine:'visual',quality:'high',createdAt:now,updatedAt:now,
      page:{size:'A4',orientation:'portrait',margins:{top:8,right:8,bottom:8,left:8}},assets:[],versions:[],
      pages:[
        {id:`${id}-main`,name:'OSV completa',dynamic:false,components:baseMainComponents221(style)},
        {id:`${id}-photos`,name:'Registro fotográfico',dynamic:true,components:basePhotoComponents221(style)}
      ]
    };
  }
  function professionalTemplates221(){
    const standard=defaultPdfTemplate('PDF padrão — Marco Iris','pdf-template-default');
    standard.designKey='standard';standard.description='Modelo padrão original preservado, com dados da OSV, itens, totais e registro fotográfico.';standard.builtinPackVersion=2;standard.schemaVersion=3;standard.isDefault=true;
    const styles=[
      {key:'horizon',name:'Azul Horizonte',description:'Degradê azul vertical, painel claro e leitura elegante para impressão e envio digital.',gradientStart:'#031a35',gradientEnd:'#137bc2',gradientDirection:'vertical',accent:'#70d0ff',panel:'#f8fcff',sectionColor:'#0b5f9f',totalPanel:'#e5f3fc',totalColor:'#074d82'},
      {key:'cobalt',name:'Cobalto Executivo',description:'Degradê horizontal profundo, cabeçalho sólido e acabamento corporativo com alto contraste.',gradientStart:'#07152b',gradientEnd:'#0c619f',gradientDirection:'horizontal',accent:'#8ad8ff',panel:'#f6faff',headerBlock:'#06172c',sectionColor:'#0a558e',totalPanel:'#e8f3fa',totalColor:'#073f6b'},
      {key:'connected',name:'Conexão Digital',description:'Visual tecnológico com degradê azul-escuro, linhas de conexão discretas e conteúdo organizado.',gradientStart:'#010b1d',gradientEnd:'#0a5590',gradientDirection:'vertical',accent:'#61c8ff',panel:'#f5faff',headerBlock:'#03162b',sectionColor:'#075b98',totalPanel:'#e3f2fb',totalColor:'#064676',circuit:true},
      {key:'crystal',name:'Azul Cristal',description:'Degradê azul-claro luminoso, painel branco e tipografia escura para máxima legibilidade.',gradientStart:'#d9f3ff',gradientEnd:'#3e9dd4',gradientDirection:'vertical',accent:'#0c6fae',panel:'#ffffff',titleColor:'#062d50',headerMuted:'#174f76',footerColor:'#073d65',sectionColor:'#0a649f',totalPanel:'#e7f4fb',totalColor:'#064b7b',sideGlow:'#d5f2ff'},
      {key:'technical',name:'Noite Técnica',description:'Degradê azul noturno, detalhes ciano e composição premium para laudos e serviços técnicos.',gradientStart:'#010817',gradientEnd:'#183e61',gradientDirection:'vertical',accent:'#49c7ff',panel:'#f4f9fd',headerBlock:'#020b18',sectionColor:'#075c98',totalPanel:'#dff1fb',totalColor:'#053f6a',circuit:true,sideGlow:'#0d6a9d'}
    ];
    return [standard,...styles.map((style,index)=>createProfessionalPdfTemplate221(style,index+1))];
  }

  function ensureState221(){
    if(!STATE?.dataByProfile)return false;
    let changed=false;
    STATE.schemaVersion=Math.max(SCHEMA,Number(STATE.schemaVersion)||0);
    const defaults=professionalTemplates221();
    Object.values(STATE.dataByProfile).forEach(d=>{
      if(!d||typeof d!=='object')return;
      d.settings=d.settings||{};const s=d.settings;
      if(!s.osvLayout||Number(s.osvLayout.schemaVersion||0)<2){s.osvLayout=defaultOrderLayout();changed=true;}
      else{
        const removed=(s.osvLayout.components||[]).filter(c=>['attachmentsField','pixField'].includes(c.id));
        if(removed.length&&!s.osvLayoutLegacyRemovedComponentsV226)s.osvLayoutLegacyRemovedComponentsV226=cloneValue(removed);
        if(removed.length){s.osvLayout.components=(s.osvLayout.components||[]).filter(c=>!['attachmentsField','pixField'].includes(c.id));changed=true;}
        const official=defaultOrderLayout(),known=new Set((s.osvLayout.components||[]).map(c=>c.id));
        for(const component of official.components)if(!known.has(component.id)){s.osvLayout.components.push(component);changed=true;}
        s.osvLayout.schemaVersion=2;s.osvLayout.layoutSchemaVersion=2;
        s.osvLayout.revision=Math.max(1,Number(s.osvLayout.revision)||1);
      }
      if(migrateLegacyOrderFormLayout221(s))changed=true;
      if(migrateClientLayout221(s))changed=true;
      if(!Array.isArray(s.pdfTemplates)||!s.pdfTemplates.length){s.pdfTemplates=defaults;changed=true;}
      if(Number(s.professionalTemplatePackVersion||0)<2){
        const byId=new Map(s.pdfTemplates.map(t=>[t.id,t]));
        for(const official of defaults){
          const current=byId.get(official.id);
          if(!current){s.pdfTemplates.push(official);byId.set(official.id,official);changed=true;continue;}
          if(official.id==='pdf-template-default')continue; // O PDF padrão do usuário é preservado exatamente como está.
          const untouched=(Number(current.version)||1)<=1&&!(current.versions||[]).length&&(!current.updatedAt||!current.createdAt||current.updatedAt===current.createdAt);
          if(untouched){const replacement=cloneValue(official);Object.keys(current).forEach(k=>delete current[k]);Object.assign(current,replacement);changed=true;}
        }
        s.professionalTemplatePackVersion=2;changed=true;
      }
      if(!s.defaultPdfTemplateId||!s.pdfTemplates.some(x=>x.id===s.defaultPdfTemplateId)){const t=s.pdfTemplates.find(x=>x.isDefault)||s.pdfTemplates[0];s.defaultPdfTemplateId=t.id;t.isDefault=true;changed=true;}
      s.pdfTemplates.forEach(t=>{t.schemaVersion=Math.max(3,Number(t.schemaVersion)||1);t.pages=Array.isArray(t.pages)?t.pages:[];t.versions=Array.isArray(t.versions)?t.versions:[];t.isDefault=t.id===s.defaultPdfTemplateId;for(const page of t.pages){page.components=Array.isArray(page.components)?page.components:[];const legacy=page.components.filter(c=>String(c?.type||'').startsWith('pix-'));if(legacy.length){s.legacyPixPdfComponentsV226=s.legacyPixPdfComponentsV226||[];if(!s.legacyPixPdfComponentsV226.some(x=>x.templateId===t.id&&x.pageId===page.id))s.legacyPixPdfComponentsV226.push({templateId:t.id,pageId:page.id,components:cloneValue(legacy)});page.components=page.components.filter(c=>!String(c?.type||'').startsWith('pix-'));changed=true;}}});
      if(!Array.isArray(s.pixConfigurations)){s.pixConfigurations=[];changed=true;}
      if(s.defaultPixConfigurationId&&!s.pixConfigurations.some(x=>x.id===s.defaultPixConfigurationId)){s.defaultPixConfigurationId=s.pixConfigurations[0]?.id||'';changed=true;}
      s.pixConfigurations.forEach((x,i)=>{x.active=x.active!==false;x.isDefault=x.id===s.defaultPixConfigurationId||(!s.defaultPixConfigurationId&&i===0);});
      if(!s.pdfEditorPreferences||typeof s.pdfEditorPreferences!=='object'){s.pdfEditorPreferences={zoomMode:'fit-page',zoom:1,leftPanelCollapsed:false,rightPanelCollapsed:false,showGrid:false,showGuides:true,viewMode:'page',handTool:false};changed=true;}
      if(typeof s.whatsappMessageTemplate!=='string'||!s.whatsappMessageTemplate.trim()){s.whatsappMessageTemplate=DEFAULT_MESSAGE;changed=true;}
      if(s.personalizationSchemaVersion!==5){s.personalizationSchemaVersion=5;changed=true;}
      s.migrations=s.migrations||{};
      if(!s.migrations.personalizationV224){s.migrations.personalizationV224={completedAt:new Date().toISOString(),source:'2.2.3',target:'2.2.4'};changed=true;}
      (d.serviceOrders||[]).forEach(o=>{if(!o.pdfTemplateId||!s.pdfTemplates.some(t=>t.id===o.pdfTemplateId)){o.pdfTemplateId=s.defaultPdfTemplateId;changed=true;}});
    });
    return changed;
  }

  // Até a 2.2.4 existiam duas persistências para o mesmo layout: settings().osvLayout (editor de
  // Configurações) e settings().formLayouts['order:<faixa>'] (editor legado do modal). Só a primeira
  // continua valendo. A segunda é arquivada em osvLayoutLegacyBackup — nada é apagado antes da cópia.
  const LEGACY_ORDER_LAYOUT_IDS={clientId:'clientField',openedAt:'openedAtField',completedAt:'completedAtField',status:'statusField',equipmentType:'equipmentField',brandModel:'brandModelField',serialNumber:'serialNumberField',accessPassword:'accessPasswordField',accessories:'accessoriesField',reportedIssue:'reportedIssueField',technicalReport:'technicalReportField',clientNotes:'clientNotesField',internalNotes:'internalNotesField'};
  function migrateLegacyOrderFormLayout221(s){
    if(!s.formLayouts||typeof s.formLayouts!=='object')return false;
    const legacyKeys=Object.keys(s.formLayouts).filter(k=>k==='order'||k.startsWith('order:'));
    if(!legacyKeys.length)return false;
    const backup={};legacyKeys.forEach(k=>{backup[k]=cloneValue(s.formLayouts[k]);});
    s.osvLayoutLegacyBackup={migratedAt:new Date().toISOString(),from:'formLayouts',entries:backup};
    // A ordem dos campos do editor legado é preservada na faixa mobile, que também é baseada em ordem.
    // Desktop e tablet usam coordenadas e não têm equivalente no formato antigo, então permanecem intactos.
    const mobileSource=backup['order:mobile']?.fields||backup['order']?.fields;
    if(Array.isArray(mobileSource)){
      let next=0;
      mobileSource.slice().sort((a,b)=>(a.order||0)-(b.order||0)).forEach(item=>{
        const component=s.osvLayout.components.find(c=>c.id===LEGACY_ORDER_LAYOUT_IDS[item.id]);
        if(!component)return;
        component.mobile=component.mobile||{};
        component.mobile.order=next++;
        component.mobile.span=item.span==='full'?2:1;
      });
      s.osvLayout.revision=Math.max(2,(Number(s.osvLayout.revision)||1)+1);
      s.osvLayout.updatedAt=new Date().toISOString();
    }
    legacyKeys.forEach(k=>{delete s.formLayouts[k];});
    return true;
  }

  function renderVariableTemplate(template,order){
    const client=findClient(order?.clientId)||{name:order?.clientName||'cliente',phone:''};
    const map={
      '{{cliente_nome}}':client.name||'cliente','{{osv_codigo}}':order?.id||'OSV','{{empresa_nome}}':company().name||'Marco Iris Soluções em Tecnologia',
      '{{equipamento}}':order?.equipmentType||'equipamento','{{data}}':new Intl.DateTimeFormat('pt-BR').format(new Date())
    };
    return Object.entries(map).reduce((text,[token,value])=>text.split(token).join(value),String(template||DEFAULT_MESSAGE));
  }
  function templatizeMessage(text,order){
    const client=findClient(order?.clientId)||{name:order?.clientName||''};
    let out=String(text||'').trim();
    const replacements=[[client.name,'{{cliente_nome}}'],[order?.id,'{{osv_codigo}}'],[company().name,'{{empresa_nome}}'],[order?.equipmentType,'{{equipamento}}'],[new Intl.DateTimeFormat('pt-BR').format(new Date()),'{{data}}']];
    replacements.filter(x=>x[0]).sort((a,b)=>String(b[0]).length-String(a[0]).length).forEach(([value,token])=>{out=out.replace(new RegExp(escapeRegExp(value),'g'),token);});
    return out||settings().whatsappMessageTemplate||DEFAULT_MESSAGE;
  }

  function personalizationCards(){
    const s=settings(),templates=activeTemplates(),layout=s.osvLayout||defaultOrderLayout(),template=defaultTemplate();
    return `<section class="card full-settings-card personalization-hub-v221"><div class="card-header"><div><h2>Personalização e módulos</h2><p>Layouts, modelos de PDF, mensagem do WhatsApp e preferências visuais.</p></div><span class="badge blue">Editor v${VERSION}</span></div><div class="personalization-cards-v221">
      <article><div class="kpi-icon blue">${icon('grid')}</div><div><strong>Layout da Nova OSV</strong><small>${layout.components.length} componentes · grade ${layout.gridSize}px · ${layout.snapEnabled?'encaixe ativo':'encaixe livre'}</small></div><button class="btn primary compact" data-action="open-osv-layout-editor">Editar layout</button></article>
      <article><div class="kpi-icon blue">${icon('clients')}</div><div><strong>Layout do Novo Cliente</strong><small>Layout fixo e padronizado, seguindo o design do app.</small></div></article>
      <article><div class="kpi-icon orange">${icon('pdf')}</div><div><strong>Modelos de PDF</strong><small>${templates.length} modelo(s) · padrão: ${esc(template?.name||'—')}</small></div><button class="btn primary compact" data-action="open-pdf-templates">Gerenciar modelos</button></article>
      <article><div class="kpi-icon green">${icon('phone')}</div><div><strong>Mensagem padrão do WhatsApp</strong><small>Persistida neste perfil e aplicada com variáveis em cada OSV.</small></div><button class="btn secondary compact" data-action="open-whatsapp-template">Editar mensagem</button></article>
      <article><div class="kpi-icon red">${icon('warning')}</div><div><strong>Restaurar configurações visuais</strong><small>Cria backup antes de restaurar layout e modelo padrão.</small></div><button class="btn danger compact" data-action="restore-personalization-defaults">Restaurar</button></article>
    </div></section>`;
  }

  function activePixConfigurations221(){return (settings().pixConfigurations||[]).filter(x=>x.active!==false);}
  function defaultPixConfiguration221(){return activePixConfigurations221().find(x=>x.id===settings().defaultPixConfigurationId)||activePixConfigurations221()[0]||null;}
  function ensurePixOrderSection221(form){
    form?.querySelectorAll?.('[data-osv-pix-section], .osv-pix-section-v224, [data-action="copy-order-pix"]').forEach(node=>node.remove());
  }
  function snapshotPixFromForm221(form,previous=null){
    return {...(previous&&typeof previous==='object'?cloneValue(previous):{}),enabled:false,savedAt:new Date().toISOString()};
  }


  // Botão compacto que mostra apenas "+", mantendo a ação, o rótulo acessível e o foco por teclado.
  function normalizeInlineAddButton221(button,label){
    if(!button)return null;
    button.type='button';
    button.classList.remove('field-inline-action');
    button.classList.add('btn','secondary','compact','inline-add-button');
    button.innerHTML=icon('plus');
    button.setAttribute('aria-label',label);
    button.setAttribute('title',label);
    return button;
  }

  function mapOrderNodes(form){
    const getField=name=>form.elements[name]?.closest('.field');
    const sections=[...form.querySelectorAll(':scope > .form-section')];
    return {
      clientField:form.querySelector('.client-picker'),openedAtField:getField('openedAt'),completedAtField:getField('completedAt'),statusField:getField('status'),equipmentField:getField('equipmentType'),brandModelField:getField('brandModel'),serialNumberField:getField('serialNumber'),accessPasswordField:getField('accessPassword'),accessoriesField:getField('accessories'),
      reportedIssueField:getField('reportedIssue'),technicalReportField:getField('technicalReport'),clientNotesField:getField('clientNotes'),internalNotesField:getField('internalNotes'),
      itemsField:sections.find(x=>x.querySelector('#order-items-editor')),paymentsField:sections.find(x=>x.querySelector('#order-payments-editor')),photosField:sections.find(x=>x.querySelector('[data-photo-stage]')),actionButtons:form.querySelector('.osv-form-actions')
    };
  }

  function clientNode221(form,id){
    let node=form.querySelector(CLIENT_NODE_SELECTORS[id]||'__missing__');if(!node)return null;
    if(node.matches('input,textarea,select'))node=node.closest('.field')||node;
    if(id==='phone'){const hint=form.querySelector('[data-phone-hint]');if(hint&&!node.contains(hint))node.appendChild(hint);}
    return node;
  }
  function mapClientNodes221(form){return Object.fromEntries(Object.keys(CLIENT_NODE_SELECTORS).map(id=>[id,clientNode221(form,id)]));}
  // Editor de layout do Novo Cliente desativado a pedido: a tela de cliente agora usa sempre
  // o layout fixo definido em openClientForm (pts-completo.js), sem o motor de posicionamento
  // livre nem o botão "Editar layout". Função mantida como no-op para não quebrar chamadas
  // existentes (observer, resume de rascunho, listeners de resize/evento).
  function hydrateClientForm221(form=document.querySelector('#modal-root form[data-form="client"]')){
    return;
  }
  function watchClientForm221(){
    clientFormObserver?.disconnect?.();const root=document.getElementById('modal-root');if(!root)return;
    clientFormObserver=new MutationObserver(()=>{const form=root.querySelector('form[data-form="client"]');if(form)hydrateClientForm221(form);});
    clientFormObserver.observe(root,{childList:true,subtree:true});
  }

  function hydrateOrderForm221(){
    const form=document.querySelector('#modal-root form[data-form="order"]');if(!form||form.dataset.personalized221==='1')return;
    form.dataset.personalized221='1';
    normalizeInlineAddButton221(form.querySelector('[data-action="new-client-from-order"]'),'Adicionar novo cliente');
    const equipButton=form.querySelector('[data-action="new-equipment-type"]');
    normalizeInlineAddButton221(equipButton,'Adicionar novo tipo de equipamento');
    // O botão "+" do tipo precisa ficar ao lado do seletor, nunca em uma linha própria abaixo dele.
    const equipSelect=form.elements.equipmentType;
    if(equipButton&&equipSelect&&!equipButton.closest('.inline-add-row')){
      const row=document.createElement('div');row.className='inline-add-row';
      equipSelect.before(row);row.appendChild(equipSelect);row.appendChild(equipButton);
      equipSelect.closest('.field')?.classList.add('equipment-type-field');
    }
    const preview=form.querySelector('.osv-code-preview');
    if(preview&&!preview.querySelector('[data-pdf-template-select]')){
      const order=form.dataset.id?findOrder(form.dataset.id):null,selected=order?.pdfTemplateId||settings().defaultPdfTemplateId;
      preview.insertAdjacentHTML('beforeend',`<label class="osv-template-picker-v221"><span>Modelo do PDF</span><select name="pdfTemplateId" data-pdf-template-select>${activeTemplates().map(t=>`<option value="${attr(t.id)}" ${t.id===selected?'selected':''}>${esc(t.name)}${t.id===settings().defaultPdfTemplateId?' — Padrão':''}</option>`).join('')}</select></label>`);
    }
    ensurePixOrderSection221(form);
    const nodes=mapOrderNodes(form),surface=document.createElement('div');surface.className='osv-custom-layout-surface-v221';surface.dataset.layoutSurface='order';
    const firstGrid=form.querySelector('.order-general');firstGrid?.before(surface);
    Object.entries(nodes).forEach(([id,node])=>{if(!node)return;node.dataset.osvComponent=id;if(id!=='actionButtons')surface.appendChild(node);});
    if(nodes.actionButtons)surface.after(nodes.actionButtons);
    form.querySelectorAll(':scope > .form-grid').forEach(g=>{if(!g.children.length)g.remove();});
    if(window.MarcoV256?.decorateModal)requestAnimationFrame(()=>window.MarcoV256.decorateModal());
    else applyOrderLayout221(form);
  }

  function watchOrderForm221(){
    orderFormObserver?.disconnect?.();
    const root=document.getElementById('modal-root');if(!root)return;
    orderFormObserver=new MutationObserver(()=>{
      const form=root.querySelector('form[data-form="order"]');
      if(form&&form.dataset.personalized221!=='1')hydrateOrderForm221();
    });
    orderFormObserver.observe(root,{childList:true,subtree:true});
  }

  function applyVisualSurfaceLayout221(surface,layout,attribute,entity){
    if(!surface)return;const band=layout.autoMobile?viewportBand():'desktop';surface.dataset.band=band;surface.classList.toggle('show-grid',!!layout.showGrid);surface.style.setProperty('--layout-grid',`${layout.gridSize||8}px`);
    const selector=id=>`[${attribute}="${CSS.escape(id)}"]`;
    layout.components.forEach(c=>{const el=surface.querySelector(selector(c.id));if(!el)return;const hidden=c.visible===false;el.hidden=hidden;if(hidden)el.style.setProperty('display','none','important');else el.style.removeProperty('display');});
    const components=layout.components.filter(c=>c.visible!==false);
    const growsWithContent=c=>entity==='order'&&['dynamic-section','media-section'].includes(c.type);
    if(band==='mobile'){
      openFormResizeObservers[entity]?.disconnect?.();openFormResizeObservers[entity]=null;
      surface.style.height='auto';surface.style.width='100%';surface.classList.add('responsive-flow');
      components.slice().sort((a,b)=>(a.mobile?.order??0)-(b.mobile?.order??0)).forEach(c=>{const el=surface.querySelector(selector(c.id));if(!el)return;const fluid=growsWithContent(c);el.hidden=false;el.style.cssText='';el.style.order=String(c.mobile?.order??0);el.style.gridColumn=`span ${clamp(Number(c.mobile?.span)||2,1,2)}`;el.style.minHeight=`${Math.max(c.minHeight||44,c.mobile?.height||0)}px`;el.style.height=fluid?'auto':(c.allowHeight&&c.mobile?.height?`${Math.max(c.minHeight||44,c.mobile.height)}px`:'auto');el.style.maxHeight=fluid?'none':'';el.style.overflow=fluid?'visible':(c.allowHeight?'auto':'visible');});
    }else{
      surface.classList.remove('responsive-flow');const key=band==='tablet'?'tablet':'desktop',canvasWidth=key==='tablet'?(layout.canvas?.tabletWidth||768):(layout.canvas?.desktopWidth||1200);surface.style.width='100%';surface.dataset.canvasWidth=String(canvasWidth);
      components.forEach(c=>{const p=c[key]||c.desktop,el=surface.querySelector(selector(c.id));if(!el)return;const fluid=growsWithContent(c);el.hidden=false;el.style.cssText='';el.style.position='absolute';el.style.left=`${(p.x/canvasWidth)*100}%`;el.style.top=`${p.y}px`;el.style.width=`${(p.width/canvasWidth)*100}%`;el.style.minWidth='0';el.style.minHeight=`${Math.max(c.minHeight||44,p.height||0)}px`;el.style.height=fluid?'auto':(c.allowHeight&&p.height?`${p.height}px`:'auto');el.style.maxHeight=fluid?'none':'';el.style.overflow=fluid?'visible':(c.allowHeight&&p.height?'auto':'visible');});
      requestAnimationFrame(()=>reflowVisualSurface221(surface,components,key,canvasWidth,attribute));
      openFormResizeObservers[entity]?.disconnect?.();openFormResizeObservers[entity]=new ResizeObserver(()=>reflowVisualSurface221(surface,components,key,canvasWidth,attribute));components.forEach(c=>{const el=surface.querySelector(selector(c.id));if(el)openFormResizeObservers[entity].observe(el);});
    }
  }
  function reflowVisualSurface221(surface,components,key,canvasWidth,attribute){
    if(!surface?.isConnected||surface.classList.contains('responsive-flow'))return;const selector=id=>`[${attribute}="${CSS.escape(id)}"]`;
    const sorted=components.map(c=>({c,p:c[key]||c.desktop,el:surface.querySelector(selector(c.id))})).filter(x=>x.el).sort((a,b)=>a.p.y-b.p.y||a.p.x-b.p.x);
    const rows=[];sorted.forEach(item=>{let row=rows.find(r=>Math.abs(r.sourceY-item.p.y)<=14);if(!row){row={sourceY:item.p.y,items:[]};rows.push(row);}row.items.push(item);});rows.sort((a,b)=>a.sourceY-b.sourceY);
    let cursor=16,previousSource=0,previousDeclared=0;rows.forEach((row,index)=>{const sourceGap=index?Math.max(12,row.sourceY-previousSource-previousDeclared):Math.max(0,row.sourceY-16);cursor+=sourceGap;let rowHeight=0;row.items.forEach(item=>{item.el.style.top=`${cursor}px`;item.el.style.left=`${(item.p.x/canvasWidth)*100}%`;item.el.style.width=`${(item.p.width/canvasWidth)*100}%`;rowHeight=Math.max(rowHeight,item.el.scrollHeight,item.el.offsetHeight,item.p.height||0);});previousSource=row.sourceY;previousDeclared=Math.max(...row.items.map(x=>x.p.height||0));cursor+=rowHeight;});surface.style.height=`${Math.max(260,cursor+24)}px`;
  }
  function applyOrderLayout221(form){if(window.MarcoV256){const modal=form?.closest('.modal');const surface=form?.querySelector('[data-layout-surface="order"]');if(surface&&!surface.dataset.layoutGridV256)window.MarcoV256.decorateModal?.();else window.MarcoV256.refreshModalGrid?.(modal,false);return;}applyVisualSurfaceLayout221(form?.querySelector('[data-layout-surface="order"]'),settings().osvLayout||defaultOrderLayout(),'data-osv-component','order');}
  function applyClientLayout221(form=document.querySelector('#modal-root form[data-form="client"]')){applyVisualSurfaceLayout221(form?.querySelector('[data-layout-surface="client"]'),settings().clientFormLayout||defaultClientLayout(),'data-client-component','client');}


  function layoutConfig221(entity='order'){
    return entity==='client'?{entity:'client',settingsKey:'clientFormLayout',title:'Editor de layout do Novo Cliente',defaultLayout:defaultClientLayout,event:'client-form-layout-updated',audit:'Layout do Novo Cliente salvo',backup:'antes-salvar-layout-cliente-v2.2.13',resetPrompt:'Restaurar o layout padrão do Novo Cliente? O layout atual ficará disponível para desfazer até salvar.',resume:ticket=>window.MarcoClientFormBridge?.resume?.(ticket)}:{entity:'order',settingsKey:'osvLayout',title:'Editor de layout da Nova OSV',defaultLayout:defaultOrderLayout,event:'service-order-layout-updated',audit:'Layout da Nova OSV salvo',backup:'antes-salvar-layout-osv-v2.2.13',resetPrompt:'Restaurar o layout padrão da Nova OSV? O layout atual ficará disponível para desfazer até salvar.',resume:resumeOrderForm221};
  }
  function currentLayoutConfig221(){return layoutConfig221(orderLayoutEditor?.entity||'order');}
  function layoutForEditor(entity='order'){const cfg=layoutConfig221(entity);return cloneValue(settings()[cfg.settingsKey]||cfg.defaultLayout());}
  function pushLayoutHistory(){if(!orderLayoutEditor)return;orderLayoutEditor.history.push(cloneValue(orderLayoutEditor.layout));if(orderLayoutEditor.history.length>HISTORY_LIMIT)orderLayoutEditor.history.shift();orderLayoutEditor.future=[];}
  function selectedLayoutComponents(){return orderLayoutEditor?.layout.components.filter(c=>orderLayoutEditor.selected.has(c.id))||[];}
  function editorPosition(c){const view=orderLayoutEditor.view;if(view==='mobile'){const width=orderLayoutEditor.layout.canvas.mobileWidth||393,span=c.mobile?.span||2;return {x:span===1?8:8,y:16+(c.mobile?.order||0)*96,width:span===1?(width-24)/2:width-16,height:c.mobile?.height||Math.max(c.minHeight,74)};}return c[view]||c.desktop;}
  function setEditorPosition(c,p){const view=orderLayoutEditor.view;if(view==='mobile'){c.mobile=c.mobile||{};c.mobile.order=Math.max(0,Math.round((p.y-16)/96));c.mobile.span=p.width<(orderLayoutEditor.layout.canvas.mobileWidth||393)*.75?1:2;c.mobile.height=Math.max(c.minHeight||44,p.height);return;}c[view]={...c[view],...p};}

  // Ponto de entrada único do editor de layout da Nova OSV.
  // Chamado por Configurações → Personalização → Layout da Nova OSV e por Nova OSV → Editar layout.
  // returnTo é o bilhete de volta para a OSV que estava aberta (null quando vem das Configurações).
  function openVisualLayoutEditor221(entity='order',returnTo=null){
    const cfg=layoutConfig221(entity);orderLayoutEditor={entity,layout:layoutForEditor(entity),selected:new Set(),view:viewportBand(),history:[],future:[],dirty:false,preview:false,interaction:null,multiSelect:false,backupCreated:false,returnTo};
    openModal(cfg.title,`<div class="layout-editor-v221" data-layout-editor-entity="${attr(entity)}"><div class="layout-toolbar-v221">
      <button class="btn secondary compact" data-action="layout-undo" disabled>Desfazer</button><button class="btn secondary compact" data-action="layout-redo" disabled>Refazer</button>
      <button class="btn ghost compact" data-action="layout-toggle-grid">Exibir grade</button><button class="btn ghost compact active" data-action="layout-toggle-snap">Encaixe automático</button>
      <button class="btn ghost compact" data-action="layout-toggle-multi" aria-pressed="false">Selecionar vários</button><button class="btn ghost compact" data-action="layout-lock-all">Bloquear todos</button><button class="btn ghost compact" data-action="layout-unlock-all">Desbloquear todos</button>
      <div class="editor-tool-group-v221"><button class="btn ghost compact" data-action="layout-align" data-align="left">Esquerda</button><button class="btn ghost compact" data-action="layout-align" data-align="center">Centro H</button><button class="btn ghost compact" data-action="layout-align" data-align="right">Direita</button><button class="btn ghost compact" data-action="layout-align" data-align="top">Topo</button><button class="btn ghost compact" data-action="layout-align" data-align="middle">Centro V</button><button class="btn ghost compact" data-action="layout-align" data-align="bottom">Embaixo</button></div><div class="editor-tool-group-v221"><button class="btn ghost compact" data-action="layout-distribute" data-axis="horizontal">Distribuir H</button><button class="btn ghost compact" data-action="layout-distribute" data-axis="vertical">Distribuir V</button></div>
      <div class="segmented-v221"><button class="active" data-action="layout-view" data-view="desktop">Desktop</button><button data-action="layout-view" data-view="tablet">Tablet</button><button data-action="layout-view" data-view="mobile">Mobile</button></div>
      <button class="btn ghost compact" data-action="layout-preview">Visualizar formulário</button>
    </div><div class="layout-workspace-v221"><div class="layout-canvas-scroll-v221"><div class="layout-canvas-v221" data-layout-editor-canvas><div class="layout-guide-v221 vertical" data-guide-x hidden></div><div class="layout-guide-v221 horizontal" data-guide-y hidden></div></div></div><aside class="layout-properties-v221" data-layout-properties><div class="empty compact-empty">Selecione um campo para editar posição, tamanho e bloqueio.</div></aside></div><footer class="editor-footer-v221"><button class="btn danger" data-action="layout-reset">Restaurar padrão</button><span class="muted" data-layout-validation>Layout ainda não alterado.</span><div><button class="btn secondary" data-action="layout-cancel">Cancelar</button><button class="btn primary" data-action="layout-save">Salvar alterações</button></div></footer></div>`,true);
    requestAnimationFrame(()=>{document.querySelector('#modal-root .modal')?.classList.add('visual-layout-modal-v227',`${entity}-layout-modal-v227`);renderOrderLayoutEditor221();});
  }
  function openOrderLayoutEditor221(returnTo=null){openVisualLayoutEditor221('order',returnTo);}
  function openClientLayoutEditor221(returnTo=null){openVisualLayoutEditor221('client',returnTo);}

  function renderOrderLayoutEditor221(){
    if(!orderLayoutEditor)return;const canvas=document.querySelector('[data-layout-editor-canvas]');if(!canvas)return;const l=orderLayoutEditor.layout,view=orderLayoutEditor.view,width=view==='mobile'?(l.canvas.mobileWidth||393):view==='tablet'?(l.canvas.tabletWidth||768):(l.canvas.desktopWidth||1200);
    canvas.style.width=`${width}px`;canvas.style.height=`${Math.max(700,...l.components.map(c=>{const p=editorPosition(c);return p.y+p.height+60;}))}px`;canvas.classList.toggle('show-grid',!!l.showGrid);canvas.classList.toggle('preview-mode',!!orderLayoutEditor.preview);canvas.style.setProperty('--layout-grid',`${l.gridSize||8}px`);
    canvas.querySelectorAll('.layout-component-v221').forEach(x=>x.remove());
    l.components.filter(c=>c.visible!==false).sort((a,b)=>(editorPosition(a).y-editorPosition(b).y)||(editorPosition(a).x-editorPosition(b).x)).forEach(c=>{
      const p=editorPosition(c),el=document.createElement('article');el.className=`layout-component-v221 ${orderLayoutEditor.selected.has(c.id)?'selected':''} ${c.locked?'locked':''}`;el.dataset.componentId=c.id;el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.style.width=`${p.width}px`;el.style.height=`${p.height}px`;el.tabIndex=0;el.innerHTML=`<div class="layout-component-drag-v221"><strong>${esc(c.label)}</strong><small>${Math.round(p.width)} × ${Math.round(p.height)} · X ${Math.round(p.x)} · Y ${Math.round(p.y)}</small>${c.required?'<span>Obrigatório</span>':''}${c.locked?'<b>Bloqueado</b>':''}</div><div class="layout-demo-field-v221">${c.type.includes('section')||c.type==='actions'?`<div>${esc(c.label)}</div><div class="demo-lines-v221"></div>`:`<label>${esc(c.label)}</label><div class="demo-input-v221"></div>`}</div>${orderLayoutEditor.preview?'':resizeHandlesHtml(c)}`;canvas.appendChild(el);
    });
    renderLayoutProperties221();updateLayoutToolbar221();
  }
  function updateLayoutComponentVisual221(c){
    const el=document.querySelector(`[data-component-id="${CSS.escape(c.id)}"]`);if(!el)return;const p=editorPosition(c);el.style.left=`${p.x}px`;el.style.top=`${p.y}px`;el.style.width=`${p.width}px`;el.style.height=`${p.height}px`;el.classList.toggle('selected',orderLayoutEditor.selected.has(c.id));el.classList.toggle('locked',!!c.locked);const small=el.querySelector('.layout-component-drag-v221 small');if(small)small.textContent=`${Math.round(p.width)} × ${Math.round(p.height)} · X ${Math.round(p.x)} · Y ${Math.round(p.y)}`;
  }
  function resizeHandlesHtml(c){if(c.locked)return '';const dirs=c.allowHeight?['n','s','e','w','ne','nw','se','sw']:['e','w'];return dirs.map(d=>`<i class="resize-handle-v221 ${d}" data-resize-dir="${d}"></i>`).join('');}
  function pdfResizeHandlesHtml221(c){if(c.locked)return '';return ['n','s','e','w','ne','nw','se','sw'].map(d=>`<i class="resize-handle-v221 ${d}" data-pdf-resize="${d}"></i>`).join('');}
  function renderLayoutProperties221(){const panel=document.querySelector('[data-layout-properties]'),selected=selectedLayoutComponents();if(!panel)return;if(!selected.length){panel.innerHTML='<div class="empty compact-empty">Selecione um campo. Use Ctrl/Shift para selecionar vários.</div>';return;}if(selected.length>1){panel.innerHTML=`<h3>${selected.length} campos selecionados</h3><button class="btn secondary full" data-action="layout-lock-selected">${selected.every(c=>c.locked)?'Desbloquear':'Bloquear'} selecionados</button><button class="btn secondary full" data-action="layout-equal-width">Igualar largura</button><button class="btn secondary full" data-action="layout-equal-height">Igualar altura</button>`;return;}const c=selected[0],p=editorPosition(c);panel.innerHTML=`<h3>${esc(c.label)}</h3><p class="muted">${esc(c.id)} · ${esc(c.type)}</p><div class="property-grid-v221"><label>X<input type="number" data-layout-prop="x" value="${Math.round(p.x)}"></label><label>Y<input type="number" data-layout-prop="y" value="${Math.round(p.y)}"></label><label>Largura<input type="number" data-layout-prop="width" min="${c.minWidth}" value="${Math.round(p.width)}"></label><label>Altura<input type="number" data-layout-prop="height" min="${c.minHeight}" value="${Math.round(p.height)}" ${c.allowHeight?'':'disabled'}></label></div><label class="list-row compact"><div class="list-row-main"><strong>Bloquear posição</strong></div><input type="checkbox" data-layout-prop-check="locked" ${c.locked?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Visível</strong></div><input type="checkbox" data-layout-prop-check="visible" ${c.visible!==false?'checked':''} ${c.required?'disabled':''}></label>${orderLayoutEditor.view==='mobile'?`<label class="field"><span>Largura no mobile</span><select data-layout-mobile-span><option value="2" ${c.mobile?.span!==1?'selected':''}>Largura total</option><option value="1" ${c.mobile?.span===1?'selected':''}>Meia largura</option></select></label>`:''}`;}
  function updateLayoutToolbar221(){const root=document.querySelector('.layout-editor-v221');if(!root)return;root.querySelector('[data-action="layout-undo"]').disabled=!orderLayoutEditor.history.length;root.querySelector('[data-action="layout-redo"]').disabled=!orderLayoutEditor.future.length;root.querySelector('[data-action="layout-toggle-grid"]').classList.toggle('active',!!orderLayoutEditor.layout.showGrid);root.querySelector('[data-action="layout-toggle-snap"]').classList.toggle('active',!!orderLayoutEditor.layout.snapEnabled);const multi=root.querySelector('[data-action="layout-toggle-multi"]');if(multi){multi.classList.toggle('active',!!orderLayoutEditor.multiSelect);multi.setAttribute('aria-pressed',String(!!orderLayoutEditor.multiSelect));}root.querySelectorAll('[data-action="layout-view"]').forEach(b=>b.classList.toggle('active',b.dataset.view===orderLayoutEditor.view));const status=root.querySelector('[data-layout-validation]');if(status)status.textContent=orderLayoutEditor.dirty?'Alterações não salvas.':'Layout ainda não alterado.';}

  function selectLayoutComponent221(id,event,shouldRender=true){if(!orderLayoutEditor)return;const modifier=event.ctrlKey||event.metaKey||event.shiftKey,additive=modifier||orderLayoutEditor.multiSelect;if(!additive)orderLayoutEditor.selected.clear();if((event.ctrlKey||event.metaKey)&&orderLayoutEditor.selected.has(id))orderLayoutEditor.selected.delete(id);else orderLayoutEditor.selected.add(id);if(shouldRender)renderOrderLayoutEditor221();}
  function snapPosition221(component,next,mode){const l=orderLayoutEditor.layout,view=orderLayoutEditor.view;if(!l.snapEnabled)return next;const grid=l.gridSize||8,nextOut={...next};nextOut.x=roundGrid(nextOut.x,grid);nextOut.y=roundGrid(nextOut.y,grid);nextOut.width=roundGrid(nextOut.width,grid);nextOut.height=roundGrid(nextOut.height,grid);const width=view==='mobile'?l.canvas.mobileWidth:view==='tablet'?l.canvas.tabletWidth:l.canvas.desktopWidth;const xTargets=[0,width/2,width],yTargets=[0],excluded=new Set(orderLayoutEditor.interaction?.starts?.map(x=>x.id)||[component.id]);l.components.filter(c=>!excluded.has(c.id)&&c.visible!==false).forEach(c=>{const p=editorPosition(c);xTargets.push(p.x,p.x+p.width,p.x+p.width/2);yTargets.push(p.y,p.y+p.height,p.y+p.height/2);});const edgesX=[nextOut.x,nextOut.x+nextOut.width,nextOut.x+nextOut.width/2],edgesY=[nextOut.y,nextOut.y+nextOut.height,nextOut.y+nextOut.height/2];let sx=null,sy=null;for(const t of xTargets)for(let i=0;i<edgesX.length;i++)if(Math.abs(edgesX[i]-t)<=SNAP_DISTANCE){const delta=t-edgesX[i];if(mode!=='resize'||i===0)nextOut.x+=delta;else if(i===1)nextOut.width+=delta;else nextOut.x+=delta; sx=t;break;}for(const t of yTargets)for(let i=0;i<edgesY.length;i++)if(Math.abs(edgesY[i]-t)<=SNAP_DISTANCE){const delta=t-edgesY[i];if(mode!=='resize'||i===0)nextOut.y+=delta;else if(i===1)nextOut.height+=delta;else nextOut.y+=delta;sy=t;break;}showGuides221(sx,sy);return nextOut;}
  function showGuides221(x,y){const gx=document.querySelector('[data-guide-x]'),gy=document.querySelector('[data-guide-y]');if(gx){gx.hidden=x===null;gx.style.left=`${x||0}px`;}if(gy){gy.hidden=y===null;gy.style.top=`${y||0}px`;}}
  function startLayoutInteraction221(event,el,dir=''){if(!orderLayoutEditor||orderLayoutEditor.preview)return;const c=orderLayoutEditor.layout.components.find(x=>x.id===el.dataset.componentId);if(!c||c.locked)return;event.preventDefault();if(!orderLayoutEditor.selected.has(c.id)){orderLayoutEditor.selected.clear();orderLayoutEditor.selected.add(c.id);}pushLayoutHistory();const p=cloneValue(editorPosition(c)),starts=!dir?selectedLayoutComponents().filter(x=>!x.locked).map(x=>({id:x.id,p:cloneValue(editorPosition(x))})):null;orderLayoutEditor.interaction={id:c.id,dir,startX:event.clientX,startY:event.clientY,start:p,starts};try{el.setPointerCapture?.(event.pointerId);}catch(_){}orderLayoutEditor.dirty=true;}
  function moveLayoutInteraction221(event){const it=orderLayoutEditor?.interaction;if(!it)return;const c=orderLayoutEditor.layout.components.find(x=>x.id===it.id),rawDx=event.clientX-it.startX,rawDy=event.clientY-it.startY,width=orderLayoutEditor.view==='mobile'?orderLayoutEditor.layout.canvas.mobileWidth:orderLayoutEditor.view==='tablet'?orderLayoutEditor.layout.canvas.tabletWidth:orderLayoutEditor.layout.canvas.desktopWidth;if(!it.dir&&it.starts?.length>1){const bounds={minX:Math.min(...it.starts.map(x=>x.p.x)),minY:Math.min(...it.starts.map(x=>x.p.y)),maxX:Math.max(...it.starts.map(x=>x.p.x+x.p.width))};let dx=clamp(rawDx,-bounds.minX,width-bounds.maxX),dy=Math.max(rawDy,-bounds.minY);let anchor={...it.start,x:it.start.x+dx,y:it.start.y+dy};anchor=snapPosition221(c,anchor,'move');dx=anchor.x-it.start.x;dy=anchor.y-it.start.y;it.starts.forEach(item=>{const target=orderLayoutEditor.layout.components.find(x=>x.id===item.id);if(!target)return;const p={...item.p,x:item.p.x+dx,y:item.p.y+dy};setEditorPosition(target,p);updateLayoutComponentVisual221(target);});updateLayoutToolbar221();return;}let p={...it.start};if(it.dir){if(it.dir.includes('e'))p.width=it.start.width+rawDx;if(it.dir.includes('s'))p.height=it.start.height+rawDy;if(it.dir.includes('w')){p.x=it.start.x+rawDx;p.width=it.start.width-rawDx;}if(it.dir.includes('n')){p.y=it.start.y+rawDy;p.height=it.start.height-rawDy;}}else{p.x=it.start.x+rawDx;p.y=it.start.y+rawDy;}p.width=clamp(p.width,c.minWidth||100,Math.max(c.minWidth||100,width-p.x));p.height=clamp(p.height,c.minHeight||44,900);p.x=clamp(p.x,0,Math.max(0,width-p.width));p.y=Math.max(0,p.y);p=snapPosition221(c,p,it.dir?'resize':'move');p.width=clamp(p.width,c.minWidth||100,width);p.height=clamp(p.height,c.minHeight||44,900);p.x=clamp(p.x,0,Math.max(0,width-p.width));p.y=Math.max(0,p.y);setEditorPosition(c,p);updateLayoutComponentVisual221(c);updateLayoutToolbar221();}
  function endLayoutInteraction221(){if(!orderLayoutEditor?.interaction)return;orderLayoutEditor.interaction=null;showGuides221(null,null);if(orderLayoutEditor.view==='mobile'){orderLayoutEditor.layout.components.sort((a,b)=>(a.mobile?.order||0)-(b.mobile?.order||0)).forEach((c,i)=>{c.mobile.order=i;});}renderOrderLayoutEditor221();}

  function validateLayout221(layout){
    const issues=[];
    for(const c of layout.components){
      if(c.required&&c.visible===false)issues.push(`${c.label} é obrigatório.`);
      for(const key of ['desktop','tablet']){
        const p=c[key],max=key==='desktop'?layout.canvas.desktopWidth:layout.canvas.tabletWidth;
        if(!p){issues.push(`${c.label} não possui configuração para ${key}.`);continue;}
        const values=[p.x,p.y,p.width,p.height].map(Number);
        if(!values.every(Number.isFinite)){issues.push(`${c.label} possui medidas inválidas em ${key}.`);continue;}
        if(p.x<0||p.y<0||p.x+p.width>max+1)issues.push(`${c.label} está fora da área ${key}.`);
        if(p.width<(c.minWidth||0)-1||p.height<(c.minHeight||0)-1)issues.push(`${c.label} está menor que o limite mínimo.`);
      }
      const mobile=c.mobile||{};
      if(!Number.isFinite(Number(mobile.order))||![1,2].includes(Number(mobile.span))||!Number.isFinite(Number(mobile.height))||Number(mobile.height)<(c.minHeight||44)-1)issues.push(`${c.label} possui configuração mobile inválida.`);
    }
    for(const key of ['desktop','tablet']){
      const visible=layout.components.filter(c=>c.visible!==false&&c[key]);
      for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
        const a=visible[i][key],b=visible[j][key],overlapW=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),overlapH=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);
        if(overlapW>8&&overlapH>8)issues.push(`${visible[i].label} está sobrepondo ${visible[j].label} em ${key}.`);
      }
    }
    return [...new Set(issues)];
  }
  async function saveOrderLayout221(){
    const cfg=currentLayoutConfig221(),issues=validateLayout221(orderLayoutEditor.layout);if(issues.length){toast(issues[0],'error');return;}
    if(orderLayoutEditor.dirty&&!orderLayoutEditor.backupCreated){await MarcoStorage.createBackup(STATE,cfg.backup);orderLayoutEditor.backupCreated=true;}
    const stored=settings()[cfg.settingsKey],previousRevision=Math.max(Number(stored?.revision)||0,Number(orderLayoutEditor.layout?.revision)||0),next=cloneValue(orderLayoutEditor.layout);next.layoutId=next.layoutId||next.id||`${cfg.entity}-layout-default`;next.schemaVersion=2;next.layoutSchemaVersion=2;next.revision=Math.max(2,previousRevision+1);next.updatedAt=new Date().toISOString();
    const previousLayout=cloneValue(stored||cfg.defaultLayout());settings()[cfg.settingsKey]=next;
    try{await persist(cfg.audit,`${next.components.length} componentes · revisão ${next.revision}`);}catch(e){settings()[cfg.settingsKey]=previousLayout;console.error(`Falha ao salvar ${cfg.audit}:`,e);const status=document.querySelector('[data-layout-validation]');if(status)status.textContent='Não foi possível salvar. As alterações continuam nesta tela.';toast('Não foi possível salvar o layout. Suas alterações continuam aqui.','error');return;}
    window.dispatchEvent(new CustomEvent(cfg.event,{detail:{layoutId:next.layoutId,revision:next.revision,updatedAt:next.updatedAt}}));const ticket=orderLayoutEditor.returnTo,entity=cfg.entity;orderLayoutEditor=null;closeModal();const resumed=!!cfg.resume?.(ticket);if(!resumed)renderView();toast(entity==='client'?'Layout do Novo Cliente salvo e aplicado.':'Layout da Nova OSV salvo e aplicado.');
  }


  function resumeOrderForm221(ticket){
    if(!ticket)return false;
    return !!window.MarcoOrderFormBridge?.resume?.(ticket);
  }

  function openWhatsappTemplate221(){const value=settings().whatsappMessageTemplate||DEFAULT_MESSAGE;openModal('Mensagem padrão do WhatsApp',`<form data-form="whatsapp-template-v221"><div class="field full"><label>Mensagem padrão</label><textarea name="template" rows="10" required>${esc(value)}</textarea><small>Variáveis são substituídas em cada OSV. A mensagem só é alterada ao salvar.</small></div><div class="variable-toolbar-v221">${Object.entries(VARS).map(([v,l])=>`<button type="button" class="btn ghost compact" data-action="insert-whatsapp-variable" data-variable="${attr(v)}">${esc(l)}</button>`).join('')}</div><div class="form-actions"><button type="button" class="btn danger" data-action="restore-whatsapp-template">Restaurar padrão</button><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar mensagem</button></div></form>`);}

  function pdfTemplateCards221(){return activeTemplates().map(t=>{const key=t.designKey||'custom',colors={standard:['#f4f8fc','#2d72b8'],horizon:['#031a35','#137bc2'],cobalt:['#07152b','#0c619f'],connected:['#010b1d','#61c8ff'],crystal:['#d9f3ff','#3e9dd4'],technical:['#010817','#49c7ff'],custom:['#153d67','#7fb8e8']}[key]||['#153d67','#7fb8e8'];return `<article class="pdf-template-card-v221 ${t.id===settings().defaultPdfTemplateId?'default':''}" data-template-id="${attr(t.id)}"><div class="pdf-template-thumb-v221 template-${attr(key)}" style="--thumb-primary:${colors[0]};--thumb-accent:${colors[1]}"><div class="thumb-page-v221"><div class="thumb-header-v224"><span></span><i></i></div><div class="thumb-content-v224"><b></b><b></b><b></b><em></em></div><div class="thumb-footer-v224"><small>${t.pages.length} pág.</small><i></i></div></div></div><div class="pdf-template-copy-v224"><h3>${esc(t.name)} ${t.id===settings().defaultPdfTemplateId?'<span class="badge green">Padrão</span>':''}</h3><p>${esc(t.description||'Modelo personalizado')}</p><small>Alterado em ${formatDateTime(t.updatedAt)}</small></div><div class="pdf-template-actions-v221"><button class="btn primary compact" data-action="edit-pdf-template" data-id="${attr(t.id)}">Editar</button><button class="btn secondary compact" data-action="preview-pdf-template" data-id="${attr(t.id)}">Visualizar</button><button class="btn secondary compact" data-action="duplicate-pdf-template" data-id="${attr(t.id)}">Duplicar</button><button class="btn ghost compact" data-action="set-default-pdf-template" data-id="${attr(t.id)}" ${t.id===settings().defaultPdfTemplateId?'disabled':''}>Definir padrão</button><button class="btn ghost compact" data-action="rename-pdf-template" data-id="${attr(t.id)}">Renomear</button><button class="btn ghost compact" data-action="pdf-template-history" data-id="${attr(t.id)}" ${t.versions?.length?'':'disabled'}>Histórico</button><button class="btn ghost compact" data-action="export-pdf-template" data-id="${attr(t.id)}">Exportar</button><button class="btn danger compact" data-action="delete-pdf-template" data-id="${attr(t.id)}" ${activeTemplates().length===1?'disabled':''}>Excluir</button></div></article>`;}).join('');}

  function openPdfTemplates221(){openModal('Modelos de PDF',`<div class="pdf-template-manager-v221"><div class="card-header"><div><h2>Projetos de PDF</h2><p>Crie, edite, duplique e escolha o modelo usado nas OSVs.</p></div><div class="toolbar-left"><button class="btn primary" data-action="create-pdf-template" data-mode="default">+ Novo a partir do padrão</button><button class="btn secondary" data-action="create-pdf-template" data-mode="blank">Criar em branco</button><button class="btn secondary" data-action="import-pdf-template">Importar</button></div></div><div class="pdf-template-list-v221">${pdfTemplateCards221()}</div><div class="form-actions"><button class="btn secondary" data-action="close-modal">Fechar</button></div></div>`,true);}

  function createBlankPdfTemplate221(name,id){const t=defaultPdfTemplate(name,id);t.description='Modelo em branco';t.pages=[{id:'page-1',name:'Página 1',dynamic:false,components:[]}];t.isDefault=false;return t;}
  function sanitizePdfTemplate221(raw){
    if(!raw||typeof raw!=='object'||!Array.isArray(raw.pages))throw new Error('Modelo de PDF inválido.');
    const allowed=new Set(Object.keys(PDF_COMPONENT_LIBRARY)),pageSize=['A4','Carta','Ofício'].includes(raw.page?.size)?raw.page.size:'A4',orientation=raw.page?.orientation==='landscape'?'landscape':'portrait';
    const safeColor=value=>/^#[0-9a-f]{6}$/i.test(String(value||''))?String(value):'';
    const finiteOr=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
    const safeAsset=value=>{const url=String(value||'').trim();if(url.includes('..')||url.includes('\\')||url.startsWith('/'))return '';if(/^assets\/[a-z0-9_./-]+\.(png|jpe?g|webp)$/i.test(url))return url;if(/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(url)&&url.length<7_000_000)return url;return '';};
    const pages=raw.pages.slice(0,30).map((page,index)=>({id:uid('page'),name:String(page?.name||`Página ${index+1}`).slice(0,120),dynamic:!!page?.dynamic,components:(Array.isArray(page?.components)?page.components:[]).slice(0,300).filter(c=>allowed.has(String(c?.type||''))).map(c=>({
      id:uid('pdfc'),type:String(c.type),label:String(c.label||PDF_COMPONENT_LIBRARY[c.type]?.label||c.type).slice(0,120),x:clamp(Number(c.x)||0,0,356),y:clamp(Number(c.y)||0,0,356),width:clamp(Number(c.width)||20,5,356),height:clamp(Number(c.height)||10,3,356),text:String(c.text||'').slice(0,20000),fontSize:clamp(Number(c.fontSize)||10,6,48),lineHeight:clamp(Number(c.lineHeight)||1.28,.8,3),align:['left','center','right','justify'].includes(c.align)?c.align:'left',color:safeColor(c.color)||'#17304b',backgroundColor:safeColor(c.backgroundColor),startColor:safeColor(c.startColor)||'#031a35',endColor:safeColor(c.endColor)||'#137bc2',gradientDirection:['vertical','horizontal'].includes(c.gradientDirection)?c.gradientDirection:'vertical',strokeWidth:clamp(Number(c.strokeWidth)||1,.2,12),bold:!!c.bold,italic:!!c.italic,underline:!!c.underline,hideWhenEmpty:!!c.hideWhenEmpty,repeatOnEveryPage:!!c.repeatOnEveryPage,locked:!!c.locked,lockAspectRatio:c.lockAspectRatio!==false,zIndex:clamp(Number(c.zIndex)||1,-1000,1000),opacity:clamp(Number(c.opacity)||1,.1,1),columns:clamp(Number(c.columns)||2,1,3),perPage:clamp(Number(c.perPage)||4,1,9),assetLocalKey:String(c.assetLocalKey||'').replace(/[^a-z0-9_.:-]/gi,'').slice(0,180),assetName:String(c.assetName||'').slice(0,180),assetUrl:safeAsset(c.assetUrl),overflow:c.overflow==='next-page'?'next-page':'',fit:c.fit==='cover'?'cover':'contain'
    }))}));
    if(!pages.length)pages.push({id:uid('page'),name:'Página 1',dynamic:false,components:[]});
    return {id:uid('pdf-template'),name:String(raw.name||'Modelo importado').slice(0,120),description:String(raw.description||'').slice(0,500),isDefault:false,version:1,schemaVersion:3,engine:'visual',quality:['optimized','standard','high'].includes(raw.quality)?raw.quality:'standard',page:{size:pageSize,orientation,margins:{top:clamp(finiteOr(raw.page?.margins?.top,10),0,40),right:clamp(finiteOr(raw.page?.margins?.right,10),0,40),bottom:clamp(finiteOr(raw.page?.margins?.bottom,10),0,40),left:clamp(finiteOr(raw.page?.margins?.left,10),0,40)}},pages,assets:[],versions:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  }
  function cloneTemplateWithoutVersions(t){const copy=cloneValue(t);copy.versions=[];(copy.pages||[]).forEach(page=>(page.components||[]).forEach(c=>{delete c.previewUrl;if(String(c.assetUrl||'').startsWith('blob:'))delete c.assetUrl;}));return copy;}
  function templateAssetKeys221(template){const keys=new Set(),visit=t=>{for(const page of t?.pages||[])for(const c of page?.components||[])if(c.assetLocalKey)keys.add(c.assetLocalKey);for(const version of t?.versions||[])if(version?.template)visit(version.template);};visit(template);return keys;}
  function allTemplateAssetKeys221(){const keys=new Set();for(const template of activeTemplates())for(const key of templateAssetKeys221(template))keys.add(key);return keys;}
  async function cleanupUnreferencedTemplateMedia221(candidateKeys){const referenced=allTemplateAssetKeys221();for(const key of candidateKeys||[])if(key&&!referenced.has(key))await MarcoStorage.deleteMedia(key).catch(error=>console.warn('Falha ao limpar mídia órfã do modelo:',error));}
  function blobToDataUrl221(blob){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(reader.error||new Error('Não foi possível converter a imagem.'));reader.readAsDataURL(blob);});}
  function dataUrlToBlob221(value){const match=/^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=]+)$/i.exec(String(value||''));if(!match)throw new Error('A imagem incorporada ao modelo é inválida.');const bytes=atob(match[2]),buffer=new Uint8Array(bytes.length);for(let i=0;i<bytes.length;i++)buffer[i]=bytes.charCodeAt(i);return new Blob([buffer],{type:match[1].toLowerCase()});}
  async function hydratePdfEditorAssets221(){if(!pdfEditor)return;for(const page of pdfEditor.template.pages||[])for(const c of page.components||[]){if(!c.assetLocalKey||c.previewUrl)continue;const rec=await MarcoStorage.getMedia(c.assetLocalKey).catch(()=>null);if(!rec?.blob)continue;const url=URL.createObjectURL(rec.blob);pdfEditor.objectUrls.add(url);c.previewUrl=url;c.assetName=c.assetName||rec.name||'';}}
  async function exportPdfTemplate221(template){const exported=cloneTemplateWithoutVersions(template);let embedded=0;for(const page of exported.pages||[])for(const c of page.components||[]){if(!c.assetLocalKey)continue;const rec=await MarcoStorage.getMedia(c.assetLocalKey);if(!rec?.blob)throw new Error(`A imagem ${c.assetName||c.label||'do modelo'} não foi encontrada no armazenamento local.`);if(rec.blob.size>MAX_TEMPLATE_IMAGE_BYTES)throw new Error(`A imagem ${rec.name||c.label||'do modelo'} ultrapassa 5 MB.`);embedded+=rec.blob.size;if(embedded>MAX_TEMPLATE_EMBEDDED_BYTES)throw new Error('As imagens deste modelo ultrapassam o limite de 20 MB para exportação em JSON.');c.assetUrl=await blobToDataUrl221(rec.blob);c.assetName=c.assetName||rec.name||'';delete c.assetLocalKey;}return {format:'marco-iris-pdf-template',version:2,template:exported};}
  function pushPdfHistory221(){if(!pdfEditor)return;pdfEditor.history.push(cloneValue(pdfEditor.template));if(pdfEditor.history.length>HISTORY_LIMIT)pdfEditor.history.shift();pdfEditor.future=[];pdfEditor.dirty=true;}
  function ensureInputHistory221(target,kind){if(!target||target.dataset.history221==='1')return;target.dataset.history221='1';if(kind==='layout')pushLayoutHistory();else pushPdfHistory221();}
  function currentPdfPage221(){return pdfEditor?.template.pages[pdfEditor.pageIndex];}
  function currentPdfComponent221(){return currentPdfPage221()?.components.find(x=>x.id===pdfEditor.selectedId)||null;}
  function pageMm221(){const p=pdfEditor.template.page,size=p.size==='Carta'?{w:216,h:279}:p.size==='Ofício'?{w:216,h:356}:{w:210,h:297};return p.orientation==='landscape'?{w:size.h,h:size.w}:size;}

  function defaultPdfEditorPreferences221(){return {zoomMode:'fit-page',zoom:1,leftPanelCollapsed:false,rightPanelCollapsed:false,showGrid:false,showGuides:true,viewMode:'page',handTool:false};}
  function pdfEditorPreferences221(){return {...defaultPdfEditorPreferences221(),...(settings().pdfEditorPreferences||{})};}
  function storePdfEditorPreferences221(){if(!pdfEditor)return;settings().pdfEditorPreferences={zoomMode:pdfEditor.zoomMode,zoom:pdfEditor.manualZoom,leftPanelCollapsed:pdfEditor.leftPanelCollapsed,rightPanelCollapsed:pdfEditor.rightPanelCollapsed,showGrid:pdfEditor.showGrid,showGuides:pdfEditor.showGuides,viewMode:pdfEditor.viewMode,handTool:pdfEditor.handTool};clearTimeout(pdfEditor.prefTimer);pdfEditor.prefTimer=setTimeout(()=>MarcoStorage.save(STATE).catch(()=>{}),180);}
  function actualPdfScale221(){return 96/25.4;}
  function computePdfScale221(mode=pdfEditor?.zoomMode){
    const viewport=document.querySelector('[data-pdf-viewport]'),mm=pageMm221();if(!viewport)return pdfEditor?.scale||actualPdfScale221();const widthPad=pdfEditor?.viewMode==='all'?52:44,heightPad=pdfEditor?.viewMode==='all'?64:96,availableWidth=Math.max(160,viewport.clientWidth-widthPad),availableHeight=Math.max(180,viewport.clientHeight-heightPad);if(mode==='fit-width')return clamp(availableWidth/mm.w,.35,8);if(mode==='actual')return actualPdfScale221();if(mode==='manual')return clamp(actualPdfScale221()*(pdfEditor.manualZoom||1),.25,8);return clamp(Math.min(availableWidth/mm.w,availableHeight/mm.h),.25,8);
  }
  function zoomPercent221(){return Math.round((pdfEditor.scale/actualPdfScale221())*100);}
  function applyPdfZoom221(mode,value=null,{render=true,store=true}={}){if(!pdfEditor)return;if(mode==='manual'&&Number.isFinite(Number(value)))pdfEditor.manualZoom=clamp(Number(value),.25,4);pdfEditor.zoomMode=mode;pdfEditor.scale=computePdfScale221(mode);if(store)storePdfEditorPreferences221();if(render)renderPdfEditor221();}
  function updatePdfModalClasses221(){const modal=document.querySelector('#modal-root .modal'),backdrop=document.querySelector('#modal-root .modal-backdrop'),root=document.querySelector('.pdf-editor-v221');if(!modal||!root)return;modal.classList.add('pdf-editor-modal-v224');backdrop?.classList.add('pdf-editor-backdrop-v224');modal.classList.toggle('pdf-editor-fullscreen-v224',!!pdfEditor.fullscreen);backdrop?.classList.toggle('pdf-editor-backdrop-fullscreen-v224',!!pdfEditor.fullscreen);root.classList.toggle('is-fullscreen',!!pdfEditor.fullscreen);root.classList.toggle('left-collapsed',!!pdfEditor.leftPanelCollapsed);root.classList.toggle('right-collapsed',!!pdfEditor.rightPanelCollapsed);root.classList.toggle('hand-active',!!pdfEditor.handTool);}
  async function openPdfEditor221(id){
    const source=activeTemplates().find(x=>x.id===id);if(!source)return;const prefs=pdfEditorPreferences221();
    const compactViewport=globalThis.matchMedia?.('(max-width: 900px)')?.matches===true;
    pdfEditor={template:cloneValue(source),sourceId:id,pageIndex:0,selectedId:'',history:[],future:[],dirty:false,scale:1,manualZoom:Number(prefs.zoom)||1,zoomMode:prefs.zoomMode||'fit-page',viewMode:prefs.viewMode==='all'?'all':'page',preview:false,interaction:null,snapEnabled:true,showGrid:!!prefs.showGrid,showGuides:prefs.showGuides!==false,leftPanelCollapsed:compactViewport?true:!!prefs.leftPanelCollapsed,rightPanelCollapsed:compactViewport?true:!!prefs.rightPanelCollapsed,handTool:!!prefs.handTool,fullscreen:false,objectUrls:new Set(),stagedMediaKeys:new Set(),backupCreated:false,panning:null,spacePressed:false,needsInitialFit:true};
    await hydratePdfEditorAssets221();
    openModal(`Editor de PDF — ${source.name}`,`<div class="pdf-editor-v221"><div class="pdf-editor-toolbar-v221">
      <button class="btn secondary compact" data-action="pdf-cancel">Voltar</button><strong class="pdf-editor-name-v224">${esc(source.name)}</strong>
      <button class="btn secondary compact" data-action="pdf-undo" disabled>Desfazer</button><button class="btn secondary compact" data-action="pdf-redo" disabled>Refazer</button>
      <div class="editor-tool-group-v221"><button class="btn ghost compact" data-action="pdf-fit-page">Ajustar página</button><button class="btn ghost compact" data-action="pdf-fit-width">Ajustar à largura</button><button class="btn ghost compact" data-action="pdf-actual-size">Tamanho real</button></div>
      <div class="pdf-zoom-controls-v224"><button class="btn ghost compact" data-action="pdf-zoom-out" aria-label="Diminuir zoom">−</button><select data-pdf-zoom-select aria-label="Zoom"><option value="fit-page">Ajustar página</option><option value="fit-width">Ajustar à largura</option><option value="actual">Tamanho real</option>${[50,75,100,125,150,200].map(v=>`<option value="${v/100}">${v}%</option>`).join('')}</select><button class="btn ghost compact" data-action="pdf-zoom-in" aria-label="Aumentar zoom">+</button><button class="btn ghost compact" data-action="pdf-zoom-reset">Restaurar zoom</button></div>
      <button class="btn ghost compact" data-action="pdf-toggle-grid">Exibir grade</button><button class="btn ghost compact active" data-action="pdf-toggle-guides">Exibir guias</button><button class="btn ghost compact" data-action="pdf-toggle-snap">Encaixe</button><button class="btn ghost compact" data-action="pdf-hand-tool">Mão</button><button class="btn ghost compact" data-action="pdf-center-page">Centralizar</button>
      <button class="btn ghost compact" data-action="pdf-toggle-left-panel">Ocultar painel esquerdo</button><button class="btn ghost compact" data-action="pdf-toggle-right-panel">Ocultar painel direito</button><button class="btn ghost compact" data-action="pdf-show-panels">Mostrar painéis</button>
      <label class="pdf-preview-source-v221"><span>Dados da prévia</span><select data-pdf-preview-order><option value="">Dados de exemplo</option>${(data().serviceOrders||[]).slice().sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||''))).slice(0,30).map(o=>`<option value="${attr(o.id)}">${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></label>
      <button class="btn ghost compact" data-action="pdf-preview">Pré-visualização limpa</button><button class="btn ghost compact" data-action="pdf-toggle-fullscreen">Tela cheia</button><button class="btn primary compact" data-action="pdf-save">Salvar</button>
    </div><div class="pdf-editor-shell-v221"><aside class="pdf-components-panel-v221"><div class="pdf-panel-heading-v224"><h3>Páginas</h3><button class="icon-btn" data-action="pdf-toggle-left-panel" aria-label="Ocultar painel esquerdo">×</button></div><div class="pdf-page-mode-v224"><button data-action="pdf-view-mode" data-mode="page">Editar página</button><button data-action="pdf-view-mode" data-mode="all">Visualizar todas</button></div><div class="pdf-page-list-v224" data-pdf-page-list></div><div class="pdf-page-actions-v224"><button data-action="pdf-add-page">+ Adicionar página</button><button data-action="pdf-duplicate-page">Duplicar página</button><button data-action="pdf-move-page" data-direction="-1">Mover antes</button><button data-action="pdf-move-page" data-direction="1">Mover depois</button><button data-action="pdf-delete-page">Excluir página</button></div><hr><h3>Componentes</h3><div class="pdf-component-library-v224">${Object.entries(PDF_COMPONENT_LIBRARY).map(([type,c])=>`<button data-action="pdf-add-component" data-type="${type}">${esc(c.label)}</button>`).join('')}</div></aside><main class="pdf-page-work-v221"><div class="pdf-work-header-v224"><div class="pdf-page-tabs-v221" data-pdf-page-tabs></div><div class="pdf-page-status-v224"><button class="btn ghost compact" data-action="pdf-prev-page">←</button><span data-pdf-page-status>Página 1 de 1</span><button class="btn ghost compact" data-action="pdf-next-page">→</button><strong data-pdf-zoom-label>100%</strong></div></div><div class="pdf-page-scroll-v221" data-pdf-viewport tabindex="0"><div class="pdf-pages-stage-v224" data-pdf-pages-host></div></div></main><aside class="pdf-properties-v221" data-pdf-properties><div class="empty compact-empty">Selecione um elemento.</div></aside></div><footer class="editor-footer-v221"><button class="btn secondary" data-action="pdf-cancel">Cancelar</button><span class="muted" data-pdf-editor-hint>Barra de espaço + arrastar move a área de trabalho.</span><div><button class="btn secondary" data-action="pdf-preview">Visualizar PDF</button><button class="btn secondary" data-action="pdf-save-as">Salvar como novo modelo</button><button class="btn primary" data-action="pdf-save">Salvar alterações</button></div></footer></div>`,true);
    updatePdfModalClasses221();renderPdfEditor221();
    requestAnimationFrame(()=>{if(!pdfEditor)return;pdfEditor.scale=computePdfScale221(pdfEditor.zoomMode);pdfEditor.needsInitialFit=false;renderPdfEditor221();});
    pdfEditor.resizeObserver=new ResizeObserver(()=>{if(!pdfEditor||!['fit-page','fit-width'].includes(pdfEditor.zoomMode))return;const next=computePdfScale221(pdfEditor.zoomMode);if(Math.abs(next-pdfEditor.scale)>.02){pdfEditor.scale=next;renderPdfEditor221();}});const viewport=document.querySelector('[data-pdf-viewport]');if(viewport)pdfEditor.resizeObserver.observe(viewport);
  }
  function renderPdfPageCanvas221(page,pageIndex,host){
    const mm=pageMm221(),scale=pdfEditor.scale,wrap=document.createElement('section');wrap.className=`pdf-page-wrap-v224 ${pageIndex===pdfEditor.pageIndex?'current':''}`;wrap.dataset.pdfPageIndex=String(pageIndex);wrap.innerHTML=`<div class="pdf-page-caption-v224"><strong>Página ${pageIndex+1}</strong><span>${esc(page.name||'Sem nome')}</span></div>`;const canvas=document.createElement('div');canvas.className=`pdf-page-canvas-v221 ${pdfEditor.showGrid?'show-grid':''}`;canvas.dataset.pdfCanvas='1';canvas.dataset.pdfPageIndex=String(pageIndex);canvas.style.width=`${mm.w*scale}px`;canvas.style.height=`${mm.h*scale}px`;canvas.style.setProperty('--pdf-grid',`${5*scale}px`);const margins=pdfEditor.template.page.margins||{top:10,right:10,bottom:10,left:10};if(pdfEditor.showGuides)canvas.insertAdjacentHTML('beforeend',`<div class="pdf-safe-area-v224" style="left:${margins.left*scale}px;top:${margins.top*scale}px;right:${margins.right*scale}px;bottom:${margins.bottom*scale}px" title="Área segura de impressão"></div>`);
    [...page.components].sort((a,b)=>(a.zIndex||0)-(b.zIndex||0)).forEach(c=>{const el=document.createElement('article');const outside=!c.locked&&(c.x<margins.left||c.y<margins.top||c.x+c.width>mm.w-margins.right||c.y+c.height>mm.h-margins.bottom);el.className=`pdf-component-v221 type-${c.type} ${c.id===pdfEditor.selectedId&&pageIndex===pdfEditor.pageIndex?'selected':''} ${c.locked?'locked':''} ${outside?'outside-safe':''}`;el.dataset.pdfComponentId=c.id;el.tabIndex=0;el.setAttribute('aria-label',`${c.label}, posição ${c.x} por ${c.y} milímetros`);el.innerHTML=`<div class="pdf-component-content-v221">${pdfComponentPreviewHtml221(c)}</div>${c.locked||pdfEditor.viewMode==='all'?'':pdfResizeHandlesHtml221(c)}`;canvas.appendChild(el);updatePdfComponentVisual221(c,canvas);});
    if(pageIndex===pdfEditor.pageIndex)canvas.insertAdjacentHTML('beforeend','<div class="pdf-guide-v221 vertical" data-pdf-guide-x hidden></div><div class="pdf-guide-v221 horizontal" data-pdf-guide-y hidden></div>');wrap.appendChild(canvas);host.appendChild(wrap);
  }
  function renderPdfEditor221(){
    if(!pdfEditor)return;const host=document.querySelector('[data-pdf-pages-host]'),tabs=document.querySelector('[data-pdf-page-tabs]'),list=document.querySelector('[data-pdf-page-list]');if(!host)return;updatePdfModalClasses221();host.innerHTML='';
    const pages=pdfEditor.viewMode==='all'?pdfEditor.template.pages:[currentPdfPage221()];pages.forEach(page=>renderPdfPageCanvas221(page,pdfEditor.template.pages.indexOf(page),host));
    const pageButtons=pdfEditor.template.pages.map((p,i)=>`<button class="${i===pdfEditor.pageIndex?'active':''}" data-action="pdf-page-select" data-index="${i}">${i+1}. ${esc(p.name||`Página ${i+1}`)}</button>`).join('');if(tabs)tabs.innerHTML=pageButtons;if(list)list.innerHTML=pdfEditor.template.pages.map((p,i)=>`<button class="pdf-page-thumb-v224 ${i===pdfEditor.pageIndex?'active':''}" data-action="pdf-page-select" data-index="${i}"><span class="pdf-mini-page-v224 design-${attr(pdfEditor.template.designKey||'custom')}"><i></i><b></b><em></em></span><span><strong>Página ${i+1}</strong><small>${esc(p.name||'Sem nome')}</small></span></button>`).join('');
    renderPdfProperties221();const root=document.querySelector('.pdf-editor-v221');root?.querySelector('[data-action="pdf-undo"]')?.toggleAttribute('disabled',!pdfEditor.history.length);root?.querySelector('[data-action="pdf-redo"]')?.toggleAttribute('disabled',!pdfEditor.future.length);root?.querySelector('[data-action="pdf-toggle-snap"]')?.classList.toggle('active',pdfEditor.snapEnabled!==false);root?.querySelector('[data-action="pdf-toggle-grid"]')?.classList.toggle('active',pdfEditor.showGrid);root?.querySelector('[data-action="pdf-toggle-guides"]')?.classList.toggle('active',pdfEditor.showGuides);root?.querySelector('[data-action="pdf-hand-tool"]')?.classList.toggle('active',pdfEditor.handTool);root?.querySelectorAll('[data-action="pdf-view-mode"]').forEach(b=>b.classList.toggle('active',b.dataset.mode===pdfEditor.viewMode));const status=root?.querySelector('[data-pdf-page-status]');if(status)status.textContent=`Página ${pdfEditor.pageIndex+1} de ${pdfEditor.template.pages.length}`;const zoom=root?.querySelector('[data-pdf-zoom-label]');if(zoom)zoom.textContent=`${zoomPercent221()}%`;const select=root?.querySelector('[data-pdf-zoom-select]');if(select){const value=pdfEditor.zoomMode==='manual'?String([.5,.75,1,1.25,1.5,2].find(v=>Math.abs(v-pdfEditor.manualZoom)<.01)||pdfEditor.manualZoom):pdfEditor.zoomMode;select.value=String(value);}const full=root?.querySelector('[data-action="pdf-toggle-fullscreen"]');if(full)full.textContent=pdfEditor.fullscreen?'Sair da tela cheia':'Tela cheia';
  }
  function updatePdfComponentVisual221(c,scope=document){const el=scope.querySelector?.(`[data-pdf-component-id="${CSS.escape(c.id)}"]`)||document.querySelector(`[data-pdf-component-id="${CSS.escape(c.id)}"]`),scale=pdfEditor?.scale||actualPdfScale221();if(!el)return;el.style.left=`${c.x*scale}px`;el.style.top=`${c.y*scale}px`;el.style.width=`${c.width*scale}px`;el.style.height=`${c.height*scale}px`;el.style.zIndex=String(c.zIndex||1);el.style.opacity=String(c.opacity??1);el.classList.toggle('selected',c.id===pdfEditor.selectedId);el.classList.toggle('locked',!!c.locked);const content=el.querySelector('.pdf-component-content-v221');if(content)content.innerHTML=pdfComponentPreviewHtml221(c);}
  function showPdfGuides221(x=null,y=null){if(!pdfEditor.showGuides)return;const gx=document.querySelector('[data-pdf-guide-x]'),gy=document.querySelector('[data-pdf-guide-y]'),scale=pdfEditor?.scale||actualPdfScale221();if(gx){gx.hidden=x===null;gx.style.left=`${(x||0)*scale}px`;}if(gy){gy.hidden=y===null;gy.style.top=`${(y||0)*scale}px`;}}

  function snapPdfPosition221(component,next,mode='move'){
    if(pdfEditor?.snapEnabled===false)return next;const mm=pageMm221(),threshold=2.5,out={...next},step=.5;out.x=Math.round(out.x/step)*step;out.y=Math.round(out.y/step)*step;out.width=Math.round(out.width/step)*step;out.height=Math.round(out.height/step)*step;
    const xTargets=[0,mm.w/2,mm.w],yTargets=[0,mm.h/2,mm.h];currentPdfPage221().components.filter(c=>c.id!==component.id).forEach(c=>{xTargets.push(c.x,c.x+c.width,c.x+c.width/2);yTargets.push(c.y,c.y+c.height,c.y+c.height/2);});
    const edgesX=[out.x,out.x+out.width,out.x+out.width/2],edgesY=[out.y,out.y+out.height,out.y+out.height/2];let guideX=null,guideY=null;
    outerX:for(const target of xTargets)for(let i=0;i<edgesX.length;i++)if(Math.abs(edgesX[i]-target)<=threshold){const delta=target-edgesX[i];if(mode==='resize'&&i===1)out.width+=delta;else out.x+=delta;guideX=target;break outerX;}
    outerY:for(const target of yTargets)for(let i=0;i<edgesY.length;i++)if(Math.abs(edgesY[i]-target)<=threshold){const delta=target-edgesY[i];if(mode==='resize'&&i===1)out.height+=delta;else out.y+=delta;guideY=target;break outerY;}
    showPdfGuides221(guideX,guideY);return out;
  }
  function closePdfEditorAssets221(){pdfEditor?.resizeObserver?.disconnect?.();clearTimeout(pdfEditor?.prefTimer);for(const url of pdfEditor?.objectUrls||[])try{URL.revokeObjectURL(url);}catch(_){}if(pdfEditor)pdfEditor.objectUrls?.clear?.();document.querySelector('#modal-root .modal')?.classList.remove('pdf-editor-modal-v224','pdf-editor-fullscreen-v224');document.querySelector('#modal-root .modal-backdrop')?.classList.remove('pdf-editor-backdrop-v224','pdf-editor-backdrop-fullscreen-v224');}
  async function cleanupStagedPdfMedia221(keepReferenced=false){if(!pdfEditor?.stagedMediaKeys?.size)return;const referenced=new Set();if(keepReferenced){for(const page of pdfEditor.template.pages||[])for(const c of page.components||[])if(c.assetLocalKey)referenced.add(c.assetLocalKey);}for(const key of [...pdfEditor.stagedMediaKeys]){if(keepReferenced&&referenced.has(key))continue;await MarcoStorage.deleteMedia(key).catch(error=>console.warn('Falha ao limpar imagem temporária do modelo:',error));}pdfEditor.stagedMediaKeys.clear();}

  function pdfComponentPreviewHtml221(c){
    if(c.type==='line')return `<span class="preview-line-v221" style="border-color:${attr(c.color||'#2d72b8')}"></span>`;
    if(c.type==='rect')return `<span class="preview-rect-v221" style="background:${attr(c.backgroundColor||'transparent')};border-color:${attr(c.color||'#2d72b8')}"></span>`;
    if(c.type==='gradient'){const direction=c.gradientDirection==='horizontal'?'90deg':'180deg';return `<span class="preview-gradient-v221" style="background:linear-gradient(${direction},${attr(c.startColor||'#031a35')},${attr(c.endColor||'#137bc2')})"></span>`;}
    if(c.type==='pix-qr'){const config=defaultPixConfiguration221(),code=pixCodeFor221(config);if(code&&window.MarcoQr){try{return `<img src="${attr(MarcoQr.toDataURL(code,{size:320,margin:4,level:'Q'}))}" alt="QR Code Pix">`;}catch(_){}}return '<div class="preview-qr-v224"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>';}
    if(c.type==='logo'||c.type==='image'){const src=c.previewUrl||c.assetUrl;return src?`<img src="${attr(src)}" alt="${attr(c.label||'Imagem')}">`:`<div class="image-placeholder-v221">Imagem</div>`;}
    if(c.type.startsWith('table-'))return `<strong>${esc(c.label)}</strong><div class="preview-table-v221"><i></i><i></i><i></i></div>`;
    if(c.type==='photos-grid')return `<strong>Fotos</strong><div class="preview-photos-v221"><i></i><i></i><i></i><i></i></div>`;
    return `<span style="font-size:${Math.max(8,(c.fontSize||10)*.9)}px;font-weight:${c.bold?'800':'400'};text-align:${c.align||'left'};color:${c.color||'#17304b'}">${esc(c.text||c.label)}</span>`;
  }
  function renderPdfProperties221(){
    const panel=document.querySelector('[data-pdf-properties]'),c=currentPdfComponent221();if(!panel)return;
    if(!c){const m=pdfEditor.template.page.margins||{top:10,right:10,bottom:10,left:10};panel.innerHTML=`<h3>Documento</h3><label class="field"><span>Nome do modelo</span><input data-pdf-template-prop="name" value="${attr(pdfEditor.template.name)}"></label><div class="property-grid-v221"><label>Tamanho<select data-pdf-template-prop="size"><option ${pdfEditor.template.page.size==='A4'?'selected':''}>A4</option><option ${pdfEditor.template.page.size==='Carta'?'selected':''}>Carta</option><option ${pdfEditor.template.page.size==='Ofício'?'selected':''}>Ofício</option></select></label><label>Orientação<select data-pdf-template-prop="orientation"><option value="portrait" ${pdfEditor.template.page.orientation==='portrait'?'selected':''}>Retrato</option><option value="landscape" ${pdfEditor.template.page.orientation==='landscape'?'selected':''}>Paisagem</option></select></label><label>Qualidade<select data-pdf-template-prop="quality"><option value="optimized" ${pdfEditor.template.quality==='optimized'?'selected':''}>Otimizado</option><option value="standard" ${!pdfEditor.template.quality||pdfEditor.template.quality==='standard'?'selected':''}>Padrão</option><option value="high" ${pdfEditor.template.quality==='high'?'selected':''}>Alta qualidade</option></select></label></div><h4>Margens (mm)</h4><div class="property-grid-v221"><label>Superior<input type="number" min="0" max="40" data-pdf-margin="top" value="${m.top||0}"></label><label>Direita<input type="number" min="0" max="40" data-pdf-margin="right" value="${m.right||0}"></label><label>Inferior<input type="number" min="0" max="40" data-pdf-margin="bottom" value="${m.bottom||0}"></label><label>Esquerda<input type="number" min="0" max="40" data-pdf-margin="left" value="${m.left||0}"></label></div>`;return;}
    const textType=!['line','rect','gradient','image','logo','table-items','table-products','table-services','table-payments','photos-grid','pix-qr'].includes(c.type);
    panel.innerHTML=`<h3>${esc(c.label)}</h3><p class="muted">${esc(c.type)}</p>${textType?`<label class="field"><span>Conteúdo</span><textarea data-pdf-prop="text" rows="4">${esc(c.text||'')}</textarea></label><div class="insert-variable-v221"><select data-pdf-variable-select><option value="">Inserir campo…</option>${PDF_VARS.map(([token,label])=>`<option value="${attr(token)}">${esc(label)}</option>`).join('')}</select><button class="btn secondary compact" data-action="pdf-insert-variable">Inserir</button></div>`:''}<div class="property-grid-v221"><label>X<input type="number" step="0.5" data-pdf-prop="x" value="${c.x}"></label><label>Y<input type="number" step="0.5" data-pdf-prop="y" value="${c.y}"></label><label>Largura<input type="number" step="0.5" min="5" data-pdf-prop="width" value="${c.width}"></label><label>Altura<input type="number" step="0.5" min="3" data-pdf-prop="height" value="${c.height}"></label></div>${c.fontSize?`<div class="property-grid-v221"><label>Fonte<input type="number" min="6" max="48" data-pdf-prop="fontSize" value="${c.fontSize}"></label><label>Entrelinhas<input type="number" min="0.8" max="3" step="0.1" data-pdf-prop="lineHeight" value="${c.lineHeight||1.28}"></label><label>Alinhamento<select data-pdf-prop="align"><option value="left" ${c.align==='left'?'selected':''}>Esquerda</option><option value="center" ${c.align==='center'?'selected':''}>Centro</option><option value="right" ${c.align==='right'?'selected':''}>Direita</option><option value="justify" ${c.align==='justify'?'selected':''}>Justificado</option></select></label><label>Cor<input type="color" data-pdf-prop="color" value="${/^#[0-9a-f]{6}$/i.test(c.color||'')?c.color:'#17304b'}"></label></div>`:''}<div class="property-grid-v221"><label>Opacidade<input type="number" min="0.1" max="1" step="0.05" data-pdf-prop="opacity" value="${c.opacity??1}"></label>${['rect','text','title','subtitle','field'].includes(c.type)?`<label>Fundo<input type="color" data-pdf-prop="backgroundColor" value="${/^#[0-9a-f]{6}$/i.test(c.backgroundColor||'')?c.backgroundColor:'#ffffff'}"></label>`:''}</div>${c.type==='gradient'?`<div class="property-grid-v221"><label>Cor inicial<input type="color" data-pdf-prop="startColor" value="${/^#[0-9a-f]{6}$/i.test(c.startColor||'')?c.startColor:'#031a35'}"></label><label>Cor final<input type="color" data-pdf-prop="endColor" value="${/^#[0-9a-f]{6}$/i.test(c.endColor||'')?c.endColor:'#137bc2'}"></label><label>Direção<select data-pdf-prop="gradientDirection"><option value="vertical" ${c.gradientDirection!=='horizontal'?'selected':''}>Vertical</option><option value="horizontal" ${c.gradientDirection==='horizontal'?'selected':''}>Horizontal</option></select></label></div>`:''}${c.type==='photos-grid'?`<div class="property-grid-v221"><label>Colunas<input type="number" min="1" max="3" data-pdf-prop="columns" value="${c.columns||2}"></label><label>Fotos por página<input type="number" min="1" max="9" data-pdf-prop="perPage" value="${c.perPage||4}"></label></div>`:''}${c.fontSize?`<label class="list-row compact"><div class="list-row-main"><strong>Negrito</strong></div><input type="checkbox" data-pdf-prop-check="bold" ${c.bold?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Itálico</strong></div><input type="checkbox" data-pdf-prop-check="italic" ${c.italic?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Sublinhado</strong></div><input type="checkbox" data-pdf-prop-check="underline" ${c.underline?'checked':''}></label>`:''}<label class="list-row compact"><div class="list-row-main"><strong>Ocultar quando vazio</strong></div><input type="checkbox" data-pdf-prop-check="hideWhenEmpty" ${c.hideWhenEmpty?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Repetir em continuações</strong></div><input type="checkbox" data-pdf-prop-check="repeatOnEveryPage" ${c.repeatOnEveryPage?'checked':''}></label><label class="list-row compact"><div class="list-row-main"><strong>Bloquear</strong></div><input type="checkbox" data-pdf-prop-check="locked" ${c.locked?'checked':''}></label><div class="pdf-layer-actions-v221"><button class="btn secondary compact" data-action="pdf-bring-front">Trazer para frente</button><button class="btn secondary compact" data-action="pdf-send-back">Enviar para trás</button><button class="btn secondary compact" data-action="pdf-duplicate-component">Duplicar</button><button class="btn danger compact" data-action="pdf-delete-component">Excluir</button></div>${c.type==='image'||c.type==='logo'?`<div class="property-grid-v221"><label>Ajuste<select data-pdf-prop="fit"><option value="contain" ${c.fit!=='cover'?'selected':''}>Conter sem deformar</option><option value="cover" ${c.fit==='cover'?'selected':''}>Preencher e recortar</option></select></label></div><label class="list-row compact"><div class="list-row-main"><strong>Manter proporção</strong></div><input type="checkbox" data-pdf-prop-check="lockAspectRatio" ${c.lockAspectRatio!==false?'checked':''}></label><button class="btn primary full" data-action="pdf-choose-image">Escolher imagem</button>`:''}`;
  }

  function validatePdfTemplate221(template){
    const issues=[],allowed=new Set(Object.keys(PDF_COMPONENT_LIBRARY)),knownVars=new Set(PDF_VARS.map(([token])=>token)),pageIds=new Set(),componentIds=new Set();
    if(!template||typeof template!=='object')return ['Modelo de PDF inválido.'];
    if(!String(template.name||'').trim())issues.push('Informe o nome do modelo.');
    if(!Array.isArray(template.pages)||!template.pages.length)issues.push('O modelo precisa ter pelo menos uma página.');
    const pageSize=template.page?.size==='Carta'?{w:216,h:279}:template.page?.size==='Ofício'?{w:216,h:356}:{w:210,h:297},mm=template.page?.orientation==='landscape'?{w:pageSize.h,h:pageSize.w}:pageSize;
    for(const [pageIndex,page] of (template.pages||[]).entries()){
      if(!page?.id||pageIds.has(page.id))issues.push(`A página ${pageIndex+1} possui identificador ausente ou duplicado.`);else pageIds.add(page.id);
      for(const component of page?.components||[]){
        if(!component?.id||componentIds.has(component.id))issues.push(`Existe componente com identificador ausente ou duplicado na página ${pageIndex+1}.`);else componentIds.add(component.id);
        if(!allowed.has(component?.type))issues.push(`Componente não autorizado na página ${pageIndex+1}.`);
        const x=Number(component?.x),y=Number(component?.y),width=Number(component?.width),height=Number(component?.height);
        const minHeight=component?.type==='line'?.2:3;if(![x,y,width,height].every(Number.isFinite)||width<5||height<minHeight)issues.push(`${component?.label||'Componente'} possui medidas inválidas.`);
        else if(x<0||y<0||x+width>mm.w+.1||y+height>mm.h+.1)issues.push(`${component?.label||'Componente'} está fora dos limites da página ${pageIndex+1}.`);
        const tokens=String(component?.text||'').match(/\{\{[^{}]+\}\}/g)||[];
        for(const token of tokens)if(!knownVars.has(token))issues.push(`A variável ${token} não existe na lista controlada.`);
        if(['image','logo'].includes(component?.type)&&!component.assetLocalKey&&!component.assetUrl&&!component.previewUrl)issues.push(`${component?.label||'Imagem'} está sem arquivo.`);
        if(component?.type==='gradient'&&(!/^#[0-9a-f]{6}$/i.test(component.startColor||'')||!/^#[0-9a-f]{6}$/i.test(component.endColor||'')))issues.push(`${component?.label||'Degradê'} possui cores inválidas.`);
        if(component?.type==='gradient'&&!['vertical','horizontal'].includes(component.gradientDirection))issues.push(`${component?.label||'Degradê'} possui direção inválida.`);
      }
    }
    return [...new Set(issues)];
  }
  async function savePdfTemplate221(){const source=activeTemplates().find(x=>x.id===pdfEditor.sourceId);if(!source)return;const issues=validatePdfTemplate221(pdfEditor.template);if(issues.length){toast(issues[0],'error');return;}const mm=pageMm221(),m=pdfEditor.template.page?.margins||{top:10,right:10,bottom:10,left:10},unsafe=(pdfEditor.template.pages||[]).flatMap((page,pageIndex)=>(page.components||[]).filter(c=>!c.locked&&(c.x<m.left||c.y<m.top||c.x+c.width>mm.w-m.right||c.y+c.height>mm.h-m.bottom)).map(c=>`${pageIndex+1}: ${c.label||c.type}`));if(unsafe.length&&!await confirmAction(`Há ${unsafe.length} componente(s) fora da área segura de impressão e eles poderão ser cortados. Salvar mesmo assim?`))return;if(pdfEditor.dirty&&!pdfEditor.backupCreated){await MarcoStorage.createBackup(STATE,'antes-salvar-modelo-pdf-v2.2.4');pdfEditor.backupCreated=true;}const previousAssetKeys=templateAssetKeys221(source),snapshot=cloneTemplateWithoutVersions(source);source.versions=Array.isArray(source.versions)?source.versions:[];source.versions.unshift({id:uid('pdfver'),version:source.version||1,createdAt:new Date().toISOString(),template:snapshot});source.versions=source.versions.slice(0,10);const next=cloneTemplateWithoutVersions(pdfEditor.template);next.version=(Number(source.version)||1)+1;next.updatedAt=new Date().toISOString();next.versions=source.versions;Object.keys(source).forEach(k=>delete source[k]);Object.assign(source,next);await persist('Modelo de PDF salvo',`${source.name} · versão ${source.version}`);await cleanupStagedPdfMedia221(true);await cleanupUnreferencedTemplateMedia221(previousAssetKeys);closePdfEditorAssets221();pdfEditor=null;closeModal();renderView();toast('Modelo de PDF salvo.');}

  function pdfDemoOrder221(){const selected=document.querySelector('[data-pdf-preview-order]')?.value,found=selected?findOrder(selected):null,order=found||{id:'OSV-000001',openedAt:today(),status:'Em andamento',clientId:'',clientName:'João da Silva',equipmentType:'Notebook',brandModel:'Modelo demonstrativo',serialNumber:'ABC123',reportedIssue:'Equipamento não liga e apresenta falha intermitente.',technicalReport:'Diagnóstico técnico de demonstração com conteúdo suficiente para validar a quebra de linhas.',discount:25,total:475,photos:[]};return cloneValue(order);}
  async function generatePdfPreview221(download=false){const order=pdfDemoOrder221(),client=findClient(order.clientId)||{name:order.clientName||'João da Silva',phone:'+55 (17) 99778-2226',address:'Rua de Exemplo, 100'};const result=await MarcoPdf.generate(order,{template:pdfEditor.template,client,company:company(),items:orderItems(order.id)||[],payments:orderPayments(order.id)||[],itemName:itemDescription,getPhotoBlob:getMediaBlob});if(download){MarcoStorage.downloadBlob(result.blob,`TESTE_${pdfEditor.template.name.replace(/[^\wÀ-ÿ-]+/g,'-')}_${today()}.pdf`);toast('PDF de teste gerado sem alterar a OSV.');return;}const url=URL.createObjectURL(result.blob),overlay=document.createElement('div');overlay.className='pdf-preview-overlay-v221';overlay.dataset.pdfPreviewOverlay='1';overlay.innerHTML=`<section class="pdf-preview-dialog-v221" role="dialog" aria-modal="true" aria-label="Pré-visualização do PDF"><header><h2>Pré-visualização do PDF</h2><button class="modal-close" data-action="pdf-close-preview" aria-label="Fechar pré-visualização">×</button></header><iframe title="Pré-visualização do PDF" src="${attr(url)}"></iframe><footer><button class="btn secondary" data-action="pdf-close-preview">Voltar para edição</button></footer></section>`;overlay.dataset.objectUrl=url;document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add('is-open'));}

  function captureWhatsappTemplate221(btn){const root=btn.closest('.whatsapp-review-modal'),textarea=root?.querySelector('[data-whatsapp-message]');if(!textarea||!textarea.value.trim())return false;const code=(textarea.value.match(/OSV-\d{6}/i)||[])[0],orderId=root?.dataset.orderId||code||'',order=orderId?findOrder(String(orderId).toUpperCase()):null;if(!order)return false;const template=templatizeMessage(textarea.value,order);if(!template.trim())return false;settings().whatsappMessageTemplate=template;settings().whatsappMessageUpdatedAt=new Date().toISOString();return true;}
  function watchWhatsappReview221(){whatsappObserver?.disconnect?.();const root=document.getElementById('confirm-root');if(!root)return;whatsappObserver=new MutationObserver(()=>{const modal=root.querySelector('.whatsapp-review-modal'),textarea=modal?.querySelector('[data-whatsapp-message]');if(!textarea||textarea.dataset.template221==='1')return;const current=modal?.dataset.orderId||(textarea.value.match(/OSV-\d{6}/i)||[])[0],order=current?findOrder(String(current).toUpperCase()):null;if(!order)return;textarea.dataset.template221='1';textarea.value=renderVariableTemplate(settings().whatsappMessageTemplate||DEFAULT_MESSAGE,order);});whatsappObserver.observe(root,{childList:true,subtree:true});}

  function pixManagerCards221(){
    const list=settings().pixConfigurations||[];
    return list.map(x=>`<article class="pix-config-card-v224 ${x.id===settings().defaultPixConfigurationId?'default':''}"><div><h3>${esc(x.name||'Configuração Pix')} ${x.id===settings().defaultPixConfigurationId?'<span class="badge green">Padrão</span>':''}</h3><p><strong>${esc(x.beneficiary||'Favorecido não informado')}</strong><br>${esc(x.keyType||'Chave')}: ${esc(x.pixKey||'—')}<br>${esc(x.bankName||'Instituição não informada')}</p><small>${x.active===false?'Inativa':'Ativa'} · alterada em ${formatDateTime(x.updatedAt||x.createdAt)}</small></div><div class="pix-config-actions-v224"><button class="btn primary compact" data-action="edit-pix-config" data-id="${attr(x.id)}">Editar</button><button class="btn secondary compact" data-action="test-pix-config" data-id="${attr(x.id)}">Testar QR Code</button><button class="btn ghost compact" data-action="copy-pix-code" data-id="${attr(x.id)}">Copiar</button><button class="btn ghost compact" data-action="set-default-pix" data-id="${attr(x.id)}" ${x.id===settings().defaultPixConfigurationId?'disabled':''}>Definir padrão</button><button class="btn danger compact" data-action="delete-pix-config" data-id="${attr(x.id)}">Excluir</button></div></article>`).join('')||'<div class="empty">Nenhuma configuração Pix cadastrada.</div>';
  }
  function mountPixOverlay221(html,title='Dados de pagamento e Pix'){
    document.querySelector('[data-pix-overlay]')?.remove();const overlay=document.createElement('div');overlay.className='pix-overlay-v224';overlay.dataset.pixOverlay='1';overlay.innerHTML=`<section class="pix-dialog-v224" role="dialog" aria-modal="true" aria-label="${attr(title)}"><header><div><h2>${esc(title)}</h2><p>Configurações comerciais salvas no perfil atual e usadas localmente.</p></div><button class="modal-close" data-action="pix-overlay-close" aria-label="Fechar">×</button></header><div class="pix-dialog-body-v224">${html}</div></section>`;document.body.appendChild(overlay);requestAnimationFrame(()=>overlay.classList.add('is-open'));return overlay;
  }
  function openPixManager221(){
    mountPixOverlay221(`<div class="pix-manager-v224"><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-pix-config">+ Nova configuração Pix</button></div></div><div class="pix-config-list-v224">${pixManagerCards221()}</div><div class="form-actions"><button class="btn secondary" data-action="pix-overlay-close">Fechar</button></div></div>`);
  }
  function openPixConfigForm221(id=''){
    const x=(settings().pixConfigurations||[]).find(v=>v.id===id)||{id:'',name:'Pix principal',beneficiary:'',beneficiaryDocument:'',bankName:'',keyType:'CPF',pixKey:'',city:'',description:'Pagamento de ordem de serviço',copyPasteCode:'',active:true};
    mountPixOverlay221(`<form data-form="pix-config-v224" data-id="${attr(id)}"><div class="form-grid two"><div class="field"><label>Nome da configuração *</label><input name="name" required maxlength="80" value="${attr(x.name||'')}"></div><div class="field"><label>Nome do favorecido *</label><input name="beneficiary" required maxlength="120" value="${attr(x.beneficiary||'')}"></div><div class="field"><label>Documento do favorecido</label><input name="beneficiaryDocument" maxlength="30" value="${attr(x.beneficiaryDocument||'')}"></div><div class="field"><label>Banco ou instituição</label><input name="bankName" maxlength="100" value="${attr(x.bankName||'')}"></div><div class="field"><label>Tipo de chave Pix</label><select name="keyType">${['CPF','CNPJ','Telefone','E-mail','Chave aleatória','Pix Copia e Cola'].map(v=>`<option ${v===x.keyType?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Chave Pix *</label><input name="pixKey" required maxlength="180" value="${attr(x.pixKey||'')}"></div><div class="field"><label>Cidade</label><input name="city" maxlength="80" value="${attr(x.city||'')}"></div><div class="field"><label>Descrição padrão</label><input name="description" maxlength="140" value="${attr(x.description||'')}"></div><div class="field full"><label>Código Pix Copia e Cola *</label><textarea name="copyPasteCode" rows="5" required maxlength="1200">${esc(x.copyPasteCode||'')}</textarea><small>O QR Code é gerado no próprio aparelho, sem API externa.</small></div><label class="check-field full"><input type="checkbox" name="active" ${x.active!==false?'checked':''}><span>Configuração ativa</span></label></div><div class="form-actions"><button type="button" class="btn secondary" data-action="open-pix-settings">Cancelar</button><button type="button" class="btn secondary" data-action="test-pix-form">Testar QR Code</button><button class="btn primary">Salvar configuração</button></div></form>`,id?'Editar configuração Pix':'Nova configuração Pix');
  }
  function normalizePixPayload221(value){return String(value||'').replace(/[\r\n\t]+/g,'').trim();}
  function pixCrc16Ccitt221(value){let crc=0xffff;for(let i=0;i<value.length;i++){crc^=value.charCodeAt(i)<<8;for(let b=0;b<8;b++)crc=(crc&0x8000)?((crc<<1)^0x1021):(crc<<1);crc&=0xffff;}return crc.toString(16).toUpperCase().padStart(4,'0');}
  function isValidPixPayload221(value){const code=normalizePixPayload221(value),marker=code.lastIndexOf('6304');if(code.length<30||!code.startsWith('000201')||marker<0||marker+8!==code.length||!code.includes('5802BR'))return false;return pixCrc16Ccitt221(code.slice(0,marker+4))===code.slice(marker+4).toUpperCase();}
  function pixCodeFor221(config){return normalizePixPayload221(config?.copyPasteCode||config?.pixKey||'');}
  async function copyText221(value){
    const text=String(value||'');if(!text)throw new Error('Não existe código Pix para copiar.');
    try{await navigator.clipboard.writeText(text);}catch(_){const ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();if(!document.execCommand('copy'))throw new Error('O navegador bloqueou a cópia.');ta.remove();}
    toast('Código Pix copiado.');
  }
  function showPixTest221(config){
    const code=pixCodeFor221(config);if(!code)throw new Error('Informe um código Pix válido antes de gerar o QR Code.');if(!window.MarcoQr)throw new Error('O gerador local de QR Code não foi carregado.');
    const dataUrl=MarcoQr.toDataURL(code,{size:520,margin:4,level:'Q'});mountPixOverlay221(`<div class="pix-test-v224"><div class="pix-qr-frame-v224"><img src="${attr(dataUrl)}" alt="QR Code Pix"></div><h3>${esc(config.name||'Teste do Pix')}</h3><p><strong>Favorecido:</strong> ${esc(config.beneficiary||'—')}<br><strong>Chave:</strong> ${esc(config.pixKey||'—')}</p><label class="field"><span>Código Pix Copia e Cola</span><textarea readonly rows="5">${esc(code)}</textarea></label><div class="form-actions"><button class="btn secondary" data-action="open-pix-settings">Voltar</button><button class="btn primary" data-action="copy-pix-raw" data-code="${attr(code)}">Copiar código Pix</button></div></div>`,'Testar QR Code');
  }


  async function restorePersonalization221(){if(!await confirmAction('Restaurar o layout da Nova OSV, a mensagem do WhatsApp e o modelo PDF padrão? Um backup será criado antes.'))return;const previousAssetKeys=allTemplateAssetKeys221();await MarcoStorage.createBackup(STATE,'antes-restaurar-personalizacao-v2.2.4');settings().osvLayout=defaultOrderLayout();settings().clientFormLayout=defaultClientLayout();settings().whatsappMessageTemplate=DEFAULT_MESSAGE;const preserved=activeTemplates().filter(t=>t.id!=='pdf-template-default');settings().pdfTemplates=[professionalTemplates221()[0],...preserved];settings().defaultPdfTemplateId='pdf-template-default';settings().pdfTemplates.forEach(t=>t.isDefault=t.id==='pdf-template-default');await persist('Personalização restaurada ao padrão','Layouts, mensagem e modelo PDF');await cleanupUnreferencedTemplateMedia221(previousAssetKeys);renderView();toast('Configurações visuais restauradas.');}

  async function handleAction221(btn,base){const a=btn.dataset.action;
    if(a==='close-modal'&&pdfEditor){if(pdfEditor.dirty&&!await confirmAction('Descartar as alterações deste modelo?'))return;await cleanupStagedPdfMedia221(false);closePdfEditorAssets221();pdfEditor=null;return await base(btn);}
    if(a==='close-modal'&&orderLayoutEditor){if(orderLayoutEditor.dirty&&!await confirmAction('Descartar as alterações deste layout?'))return;const cfg=currentLayoutConfig221(),ticket=orderLayoutEditor.returnTo;orderLayoutEditor=null;const result=await base(btn);cfg.resume?.(ticket);return result;}
    if(a==='open-osv-layout-editor'){
      // Mesmo editor, mesmo estado, mesma persistência nos dois acessos. A única diferença é que,
      // vindo da Nova OSV, o formulário é preservado no rascunho e reaberto ao fechar o editor.
      const insideOrder=!!btn.closest('.modal')?.querySelector('form[data-form="order"]');
      if(!insideOrder){openOrderLayoutEditor221(null);return;}
      // openModal reescreve #modal-root: sem a ponte, o formulário da OSV seria descartado sem
      // rascunho. Melhor não abrir o editor do que perder o que já foi preenchido.
      if(typeof window.MarcoOrderFormBridge?.suspend!=='function')throw new Error('Não foi possível preservar os dados da OSV. O editor não foi aberto.');
      const ticket=await window.MarcoOrderFormBridge.suspend();
      openOrderLayoutEditor221(ticket||null);
      return;
    }
    if(a==='open-client-layout-editor'){
      const insideClient=!!btn.closest('.modal')?.querySelector('form[data-form="client"]');
      if(!insideClient){openClientLayoutEditor221(null);return;}
      if(typeof window.MarcoClientFormBridge?.suspend!=='function')throw new Error('Não foi possível preservar os dados do cliente. O editor não foi aberto.');
      const ticket=await window.MarcoClientFormBridge.suspend();openClientLayoutEditor221(ticket||null);return;
    }
    if(a==='open-pdf-templates'){openPdfTemplates221();return;}
    if(a==='open-pix-settings'){openPixManager221();return;}
    if(a==='pix-overlay-close'){btn.closest('[data-pix-overlay]')?.remove();return;}
    if(a==='new-pix-config'){openPixConfigForm221();return;}
    if(a==='edit-pix-config'){openPixConfigForm221(btn.dataset.id);return;}
    if(a==='copy-pix-code'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);await copyText221(pixCodeFor221(config));return;}
    if(a==='copy-pix-raw'){await copyText221(btn.dataset.code||'');return;}
    if(a==='test-pix-config'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);if(config)showPixTest221(config);return;}
    if(a==='test-pix-form'){const form=btn.closest('form'),values=Object.fromEntries(new FormData(form));showPixTest221(values);return;}
    if(a==='set-default-pix'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);if(!config)return;settings().defaultPixConfigurationId=config.id;(settings().pixConfigurations||[]).forEach(x=>x.isDefault=x.id===config.id);await persist('Pix padrão alterado',config.name||config.beneficiary||config.id);openPixManager221();return;}
    if(a==='delete-pix-config'){const config=(settings().pixConfigurations||[]).find(x=>x.id===btn.dataset.id);if(!config)return;if(!await confirmAction('Excluir esta configuração Pix? OSVs antigas manterão a cópia já salva.'))return;settings().pixConfigurations=settings().pixConfigurations.filter(x=>x.id!==config.id);if(settings().defaultPixConfigurationId===config.id)settings().defaultPixConfigurationId=settings().pixConfigurations[0]?.id||'';await persist('Configuração Pix excluída',config.name||config.id);openPixManager221();return;}
    if(a==='open-whatsapp-template'){openWhatsappTemplate221();return;}
    if(a==='restore-personalization-defaults'){await restorePersonalization221();return;}
    if(a==='insert-whatsapp-variable'){const area=btn.closest('form')?.elements.template;if(area){const start=area.selectionStart||area.value.length,end=area.selectionEnd||start;area.setRangeText(btn.dataset.variable,start,end,'end');area.focus();}return;}
    if(a==='restore-whatsapp-template'){const area=btn.closest('form')?.elements.template;if(area)area.value=DEFAULT_MESSAGE;return;}
    if(a==='layout-view'){orderLayoutEditor.view=btn.dataset.view;orderLayoutEditor.selected.clear();renderOrderLayoutEditor221();return;}
    if(a==='layout-toggle-grid'){pushLayoutHistory();orderLayoutEditor.layout.showGrid=!orderLayoutEditor.layout.showGrid;orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-toggle-snap'){pushLayoutHistory();orderLayoutEditor.layout.snapEnabled=!orderLayoutEditor.layout.snapEnabled;orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-toggle-multi'){orderLayoutEditor.multiSelect=!orderLayoutEditor.multiSelect;if(!orderLayoutEditor.multiSelect&&orderLayoutEditor.selected.size>1){const keep=[...orderLayoutEditor.selected].at(-1);orderLayoutEditor.selected.clear();if(keep)orderLayoutEditor.selected.add(keep);}renderOrderLayoutEditor221();return;}
    if(a==='layout-lock-all'||a==='layout-unlock-all'){pushLayoutHistory();const lock=a==='layout-lock-all';orderLayoutEditor.layout.components.forEach(c=>c.locked=lock);orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-preview'){orderLayoutEditor.preview=!orderLayoutEditor.preview;renderOrderLayoutEditor221();return;}
    if(a==='layout-undo'){if(orderLayoutEditor.history.length){orderLayoutEditor.future.push(cloneValue(orderLayoutEditor.layout));orderLayoutEditor.layout=orderLayoutEditor.history.pop();orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();}return;}
    if(a==='layout-redo'){if(orderLayoutEditor.future.length){orderLayoutEditor.history.push(cloneValue(orderLayoutEditor.layout));orderLayoutEditor.layout=orderLayoutEditor.future.pop();orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();}return;}
    if(a==='layout-reset'){const cfg=currentLayoutConfig221();if(!await confirmAction(cfg.resetPrompt))return;if(!orderLayoutEditor.backupCreated){await MarcoStorage.createBackup(STATE,`antes-restaurar-layout-${cfg.entity}-v2.2.13`);orderLayoutEditor.backupCreated=true;}pushLayoutHistory();orderLayoutEditor.layout=cfg.defaultLayout();orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-cancel'){if(orderLayoutEditor.dirty&&!await confirmAction('Descartar as alterações deste layout?'))return;const cfg=currentLayoutConfig221(),ticket=orderLayoutEditor.returnTo;orderLayoutEditor=null;closeModal();cfg.resume?.(ticket);return;}
    if(a==='layout-save'){await saveOrderLayout221();return;}
    if(a==='layout-lock-selected'){pushLayoutHistory();const selected=selectedLayoutComponents(),lock=!selected.every(c=>c.locked);selected.forEach(c=>c.locked=lock);orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-equal-width'||a==='layout-equal-height'){const selected=selectedLayoutComponents();if(selected.length<2)return;pushLayoutHistory();const ref=editorPosition(selected[0]);selected.slice(1).forEach(c=>{const p=editorPosition(c);if(a==='layout-equal-width')p.width=ref.width;else if(c.allowHeight)p.height=ref.height;setEditorPosition(c,p);});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-align'){const selected=selectedLayoutComponents();if(selected.length<2)return;pushLayoutHistory();const ps=selected.map(editorPosition),mode=btn.dataset.align;const targets={left:Math.min(...ps.map(p=>p.x)),right:Math.max(...ps.map(p=>p.x+p.width)),center:(Math.min(...ps.map(p=>p.x))+Math.max(...ps.map(p=>p.x+p.width)))/2,top:Math.min(...ps.map(p=>p.y)),bottom:Math.max(...ps.map(p=>p.y+p.height)),middle:(Math.min(...ps.map(p=>p.y))+Math.max(...ps.map(p=>p.y+p.height)))/2};selected.forEach(c=>{const p=editorPosition(c);if(mode==='left')p.x=targets.left;if(mode==='right')p.x=targets.right-p.width;if(mode==='center')p.x=targets.center-p.width/2;if(mode==='top')p.y=targets.top;if(mode==='bottom')p.y=targets.bottom-p.height;if(mode==='middle')p.y=targets.middle-p.height/2;setEditorPosition(c,p);});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='layout-distribute'){const selected=selectedLayoutComponents(),axis=btn.dataset.axis;if(selected.length<3)return;pushLayoutHistory();selected.sort((x,y)=>axis==='vertical'?editorPosition(x).y-editorPosition(y).y:editorPosition(x).x-editorPosition(y).x);const first=editorPosition(selected[0]),last=editorPosition(selected.at(-1)),size=c=>axis==='vertical'?editorPosition(c).height:editorPosition(c).width,total=selected.reduce((sum,c)=>sum+size(c),0),start=axis==='vertical'?first.y:first.x,end=axis==='vertical'?last.y+last.height:last.x+last.width,gap=(end-start-total)/(selected.length-1);let cursor=start;selected.forEach(c=>{const p=editorPosition(c);if(axis==='vertical')p.y=cursor;else p.x=cursor;setEditorPosition(c,p);cursor+=size(c)+gap;});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
    if(a==='create-pdf-template'){const id=uid('pdf-template'),name=`Projeto PDF ${activeTemplates().length+1}`,t=btn.dataset.mode==='blank'?createBlankPdfTemplate221(name,id):cloneValue(professionalTemplates221()[0]);t.id=id;t.name=name;t.isDefault=false;t.createdAt=t.updatedAt=new Date().toISOString();t.pages.forEach(page=>{page.id=uid('page');page.components.forEach(c=>c.id=uid('pdfc'));});settings().pdfTemplates.push(t);await persist('Modelo de PDF criado',name);await openPdfEditor221(id);return;}
    if(a==='edit-pdf-template'){await openPdfEditor221(btn.dataset.id);return;}
    if(a==='preview-pdf-template'){await openPdfEditor221(btn.dataset.id);requestAnimationFrame(()=>document.querySelector('[data-action="pdf-preview"]')?.click());return;}
    if(a==='duplicate-pdf-template'){const src=activeTemplates().find(x=>x.id===btn.dataset.id);if(!src)return;const t=cloneTemplateWithoutVersions(src);t.id=uid('pdf-template');t.name=`${src.name} — Cópia`;t.isDefault=false;t.version=1;t.createdAt=t.updatedAt=new Date().toISOString();settings().pdfTemplates.push(t);await persist('Modelo de PDF duplicado',t.name);openPdfTemplates221();return;}
    if(a==='set-default-pdf-template'){const target=activeTemplates().find(t=>t.id===btn.dataset.id);if(!target)throw new Error('O modelo selecionado não existe mais.');settings().defaultPdfTemplateId=target.id;activeTemplates().forEach(t=>t.isDefault=t.id===target.id);await persist('Modelo PDF padrão alterado',target.name);openPdfTemplates221();return;}
    if(a==='rename-pdf-template'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t)return;openModal('Renomear modelo',`<form data-form="rename-pdf-template-v221" data-id="${attr(t.id)}"><div class="field"><label>Novo nome</label><input name="name" value="${attr(t.name)}" required></div><div class="form-actions"><button type="button" class="btn secondary" data-action="open-pdf-templates">Cancelar</button><button class="btn primary">Renomear</button></div></form>`);return;}
    if(a==='delete-pdf-template'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t||activeTemplates().length===1)return;if(t.id===settings().defaultPdfTemplateId)throw new Error('Defina outro modelo como padrão antes de excluir este.');const removedAssetKeys=templateAssetKeys221(t),linked=data().serviceOrders.filter(o=>o.pdfTemplateId===t.id).length;if(!await confirmAction(`${linked?`Este modelo é usado por ${linked} OSV(s). `:''}Os PDFs já gerados não serão alterados. Excluir para novas gerações?`))return;settings().pdfTemplates=settings().pdfTemplates.filter(x=>x.id!==t.id);data().serviceOrders.filter(o=>o.pdfTemplateId===t.id).forEach(o=>o.pdfTemplateId=settings().defaultPdfTemplateId);await persist('Modelo de PDF excluído',t.name);await cleanupUnreferencedTemplateMedia221(removedAssetKeys);openPdfTemplates221();return;}
    if(a==='pdf-template-history'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t)return;openModal(`Histórico — ${t.name}`,`<div class="version-history-v221">${(t.versions||[]).map((v,index)=>`<article><div><strong>Versão ${v.version}</strong><small>${formatDateTime(v.createdAt)}</small></div><button class="btn secondary compact" data-action="pdf-restore-version" data-id="${attr(t.id)}" data-index="${index}">Restaurar</button></article>`).join('')||'<div class="empty">Nenhuma versão anterior.</div>'}<div class="form-actions"><button class="btn secondary" data-action="open-pdf-templates">Voltar</button></div></div>`,true);return;}
    if(a==='pdf-restore-version'){const t=activeTemplates().find(x=>x.id===btn.dataset.id),entry=t?.versions?.[Number(btn.dataset.index)];if(!t||!entry)return;if(!await confirmAction(`Restaurar a versão ${entry.version} de ${t.name}?`))return;const current=cloneTemplateWithoutVersions(t),restored=cloneTemplateWithoutVersions(entry.template);const versions=[{id:uid('pdfver'),version:t.version||1,createdAt:new Date().toISOString(),template:current},...(t.versions||[])].slice(0,10);Object.assign(t,restored,{id:t.id,name:t.name,isDefault:t.isDefault,version:(Number(t.version)||1)+1,updatedAt:new Date().toISOString(),versions});await persist('Versão de modelo PDF restaurada',`${t.name} · versão ${entry.version}`);openPdfTemplates221();return;}
    if(a==='export-pdf-template'){const t=activeTemplates().find(x=>x.id===btn.dataset.id);if(!t)return;const exported=await exportPdfTemplate221(t),json=JSON.stringify(exported,null,2);MarcoStorage.downloadBlob(new Blob([json],{type:'application/json'}),`Marco-Iris_Modelo-PDF_${t.name.replace(/[^\wÀ-ÿ-]+/g,'-')}.json`);toast('Modelo exportado com imagens incorporadas.');return;}
    if(a==='import-pdf-template'){const input=document.createElement('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const importedKeys=[];try{const file=input.files?.[0];if(!file)return;if(file.size>MAX_TEMPLATE_IMPORT_BYTES)throw new Error('O modelo deve ter no máximo 25 MB.');const parsed=JSON.parse(await file.text()),incoming=sanitizePdfTemplate221(parsed.template||parsed);for(const page of incoming.pages||[])for(const c of page.components||[]){if(/^data:image\//i.test(c.assetUrl||'')){const blob=dataUrlToBlob221(c.assetUrl);if(blob.size>MAX_TEMPLATE_IMAGE_BYTES)throw new Error(`A imagem ${c.assetName||c.label||'do modelo'} ultrapassa 5 MB.`);const rec=await MarcoStorage.putMedia(blob,{name:c.assetName||`${c.label||'imagem'}.png`,type:blob.type});importedKeys.push(rec.id);c.assetLocalKey=rec.id;c.assetUrl='';}else if(c.assetLocalKey&&!await MarcoStorage.getMedia(c.assetLocalKey))c.assetLocalKey='';}const issues=validatePdfTemplate221(incoming);if(issues.length)throw new Error(`Modelo importado inválido: ${issues[0]}`);incoming.name=`${incoming.name||'Modelo importado'} — Importado`;settings().pdfTemplates.push(incoming);await persist('Modelo de PDF importado',incoming.name);openPdfTemplates221();}catch(error){for(const key of importedKeys)await MarcoStorage.deleteMedia(key).catch(()=>{});console.error('Falha ao importar modelo de PDF:',error);toast(error.message||'Não foi possível importar o modelo.','error');}finally{input.value='';}};input.click();return;}
    if(a==='pdf-toggle-snap'){pdfEditor.snapEnabled=!pdfEditor.snapEnabled;renderPdfEditor221();return;}
    if(a==='pdf-fit-page'){applyPdfZoom221('fit-page');return;}
    if(a==='pdf-fit-width'){applyPdfZoom221('fit-width');return;}
    if(a==='pdf-actual-size'){applyPdfZoom221('actual');return;}
    if(a==='pdf-zoom-reset'){pdfEditor.manualZoom=1;applyPdfZoom221('fit-page');return;}
    if(a==='pdf-zoom-in'||a==='pdf-zoom-out'){const current=pdfEditor.scale/actualPdfScale221(),delta=a==='pdf-zoom-in'?.1:-.1;applyPdfZoom221('manual',clamp(current+delta,.25,4));return;}
    if(a==='pdf-toggle-grid'){pdfEditor.showGrid=!pdfEditor.showGrid;storePdfEditorPreferences221();renderPdfEditor221();return;}
    if(a==='pdf-toggle-guides'){pdfEditor.showGuides=!pdfEditor.showGuides;storePdfEditorPreferences221();renderPdfEditor221();return;}
    if(a==='pdf-hand-tool'){pdfEditor.handTool=!pdfEditor.handTool;storePdfEditorPreferences221();renderPdfEditor221();return;}
    if(a==='pdf-center-page'){const viewport=document.querySelector('[data-pdf-viewport]'),current=document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`);if(viewport&&current){viewport.scrollTo({left:Math.max(0,current.offsetLeft-(viewport.clientWidth-current.offsetWidth)/2),top:Math.max(0,current.offsetTop-(viewport.clientHeight-current.offsetHeight)/2),behavior:'smooth'});}return;}
    if(a==='pdf-toggle-left-panel'){pdfEditor.leftPanelCollapsed=!pdfEditor.leftPanelCollapsed;storePdfEditorPreferences221();updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-toggle-right-panel'){pdfEditor.rightPanelCollapsed=!pdfEditor.rightPanelCollapsed;storePdfEditorPreferences221();updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-show-panels'){pdfEditor.leftPanelCollapsed=false;pdfEditor.rightPanelCollapsed=false;storePdfEditorPreferences221();updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-toggle-fullscreen'){pdfEditor.fullscreen=!pdfEditor.fullscreen;updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
    if(a==='pdf-view-mode'){pdfEditor.viewMode=btn.dataset.mode==='all'?'all':'page';storePdfEditorPreferences221();if(pdfEditor.viewMode==='all'&&pdfEditor.zoomMode==='fit-page')pdfEditor.zoomMode='fit-width';pdfEditor.scale=computePdfScale221(pdfEditor.zoomMode);renderPdfEditor221();return;}
    if(a==='pdf-prev-page'||a==='pdf-next-page'){const delta=a==='pdf-prev-page'?-1:1;pdfEditor.pageIndex=clamp(pdfEditor.pageIndex+delta,0,pdfEditor.template.pages.length-1);pdfEditor.selectedId='';renderPdfEditor221();requestAnimationFrame(()=>document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`)?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}));return;}
    if(a==='pdf-align-page'){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();const mm=pageMm221(),mode=btn.dataset.align;if(mode==='left')c.x=0;if(mode==='center')c.x=(mm.w-c.width)/2;if(mode==='right')c.x=mm.w-c.width;if(mode==='top')c.y=0;if(mode==='middle')c.y=(mm.h-c.height)/2;if(mode==='bottom')c.y=mm.h-c.height;pdfEditor.dirty=true;renderPdfEditor221();return;}
    if(a==='pdf-insert-variable'){const c=currentPdfComponent221(),select=document.querySelector('[data-pdf-variable-select]'),token=select?.value;if(!c||!token)return;pushPdfHistory221();c.text=`${c.text||''}${c.text?' ':''}${token}`;pdfEditor.dirty=true;renderPdfEditor221();return;}
    if(a==='pdf-page-select'){pdfEditor.pageIndex=Number(btn.dataset.index)||0;pdfEditor.selectedId='';renderPdfEditor221();requestAnimationFrame(()=>document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`)?.scrollIntoView({block:'center',inline:'center',behavior:'smooth'}));return;}
    if(a==='pdf-add-page'){pushPdfHistory221();pdfEditor.template.pages.push({id:uid('page'),name:`Página ${pdfEditor.template.pages.length+1}`,dynamic:false,components:[]});pdfEditor.pageIndex=pdfEditor.template.pages.length-1;renderPdfEditor221();return;}
    if(a==='pdf-duplicate-page'){pushPdfHistory221();const p=cloneValue(currentPdfPage221());p.id=uid('page');p.name=`${p.name} — Cópia`;p.components.forEach(c=>c.id=uid('pdfc'));pdfEditor.template.pages.splice(pdfEditor.pageIndex+1,0,p);pdfEditor.pageIndex++;renderPdfEditor221();return;}
    if(a==='pdf-move-page'){const direction=Number(btn.dataset.direction)||0,next=pdfEditor.pageIndex+direction;if(next<0||next>=pdfEditor.template.pages.length)return;pushPdfHistory221();const [page]=pdfEditor.template.pages.splice(pdfEditor.pageIndex,1);pdfEditor.template.pages.splice(next,0,page);pdfEditor.pageIndex=next;renderPdfEditor221();return;}
    if(a==='pdf-delete-page'){if(pdfEditor.template.pages.length===1)throw new Error('O modelo precisa ter pelo menos uma página.');if(!await confirmAction('Excluir esta página do modelo?'))return;pushPdfHistory221();pdfEditor.template.pages.splice(pdfEditor.pageIndex,1);pdfEditor.pageIndex=Math.max(0,pdfEditor.pageIndex-1);pdfEditor.selectedId='';renderPdfEditor221();return;}
    if(a==='pdf-add-component'){pushPdfHistory221();const type=btn.dataset.type,def=PDF_COMPONENT_LIBRARY[type],mm=pageMm221(),isGradient=type==='gradient',c={id:uid('pdfc'),type,label:def.label,x:isGradient?0:15,y:isGradient?0:15,width:isGradient?mm.w:def.width,height:isGradient?mm.h:def.height,locked:isGradient,zIndex:isGradient?Math.min(-100,...currentPdfPage221().components.map(x=>Number(x.zIndex)||0))-1:currentPdfPage221().components.length+1,opacity:1,...cloneValue(def)};if(isGradient){c.x=0;c.y=0;c.width=mm.w;c.height=mm.h;c.locked=true;}currentPdfPage221().components.push(c);pdfEditor.selectedId=c.id;renderPdfEditor221();return;}
    if(a==='pdf-delete-component'){if(!currentPdfComponent221())return;pushPdfHistory221();currentPdfPage221().components=currentPdfPage221().components.filter(c=>c.id!==pdfEditor.selectedId);pdfEditor.selectedId='';renderPdfEditor221();return;}
    if(a==='pdf-duplicate-component'){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();const copy=cloneValue(c);copy.id=uid('pdfc');copy.x+=5;copy.y+=5;copy.zIndex=(Math.max(0,...currentPdfPage221().components.map(x=>x.zIndex||0))+1);currentPdfPage221().components.push(copy);pdfEditor.selectedId=copy.id;renderPdfEditor221();return;}
    if(a==='pdf-bring-front'||a==='pdf-send-back'){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();c.zIndex=a==='pdf-bring-front'?Math.max(...currentPdfPage221().components.map(x=>x.zIndex||0))+1:Math.min(...currentPdfPage221().components.map(x=>x.zIndex||0))-1;renderPdfEditor221();return;}
    if(a==='pdf-choose-image'){const c=currentPdfComponent221();if(!c)return;const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.onchange=async()=>{try{const file=input.files?.[0];if(!file)return;if(file.size>MAX_TEMPLATE_IMAGE_BYTES)throw new Error('A imagem deve ter no máximo 5 MB.');if(!/^image\/(png|jpeg|webp)$/i.test(file.type))throw new Error('Use uma imagem PNG, JPEG ou WebP.');const rec=await MarcoStorage.putMedia(file,{name:file.name,type:file.type});pushPdfHistory221();if(c.assetLocalKey&&pdfEditor.stagedMediaKeys.has(c.assetLocalKey)){await MarcoStorage.deleteMedia(c.assetLocalKey).catch(error=>console.warn(error));pdfEditor.stagedMediaKeys.delete(c.assetLocalKey);}if(c.previewUrl){try{URL.revokeObjectURL(c.previewUrl);}catch(_){}pdfEditor.objectUrls.delete(c.previewUrl);}const url=URL.createObjectURL(file);pdfEditor.objectUrls.add(url);pdfEditor.stagedMediaKeys.add(rec.id);c.assetLocalKey=rec.id;c.assetName=file.name;c.previewUrl=url;delete c.assetUrl;pdfEditor.dirty=true;renderPdfEditor221();}catch(error){console.error('Falha ao adicionar imagem ao modelo:',error);toast(error.message||'Não foi possível adicionar a imagem.','error');}finally{input.value='';}};input.click();return;}
    if(a==='pdf-undo'){if(pdfEditor.history.length){pdfEditor.future.push(cloneValue(pdfEditor.template));pdfEditor.template=pdfEditor.history.pop();pdfEditor.pageIndex=Math.min(pdfEditor.pageIndex,pdfEditor.template.pages.length-1);renderPdfEditor221();}return;}
    if(a==='pdf-redo'){if(pdfEditor.future.length){pdfEditor.history.push(cloneValue(pdfEditor.template));pdfEditor.template=pdfEditor.future.pop();renderPdfEditor221();}return;}
    if(a==='pdf-reset'){if(!await confirmAction('Voltar este modelo ao padrão oficial? A versão atual permanecerá no histórico ao salvar.'))return;if(!pdfEditor.backupCreated){await MarcoStorage.createBackup(STATE,'antes-restaurar-modelo-pdf-v2.2.4');pdfEditor.backupCreated=true;}pushPdfHistory221();const official=professionalTemplates221().find(t=>t.designKey===pdfEditor.template.designKey)||professionalTemplates221()[0],restored=cloneValue(official);restored.id=pdfEditor.template.id;restored.name=pdfEditor.template.name;restored.isDefault=pdfEditor.template.isDefault;restored.versions=pdfEditor.template.versions||[];restored.pages.forEach(page=>{page.id=uid('page');page.components.forEach(c=>c.id=uid('pdfc'));});pdfEditor.template=restored;pdfEditor.pageIndex=0;pdfEditor.selectedId='';renderPdfEditor221();return;}
    if(a==='pdf-close-preview'){const overlay=btn.closest('[data-pdf-preview-overlay]');if(overlay){try{URL.revokeObjectURL(overlay.dataset.objectUrl||'');}catch(_){}overlay.remove();}return;}
    if(a==='pdf-preview'){await generatePdfPreview221(false);return;}
    if(a==='pdf-test'){await generatePdfPreview221(true);return;}
    if(a==='pdf-cancel'){if(pdfEditor.dirty&&!await confirmAction('Descartar as alterações deste modelo?'))return;await cleanupStagedPdfMedia221(false);closePdfEditorAssets221();pdfEditor=null;openPdfTemplates221();return;}
    if(a==='pdf-save-as'){const issues=validatePdfTemplate221(pdfEditor.template);if(issues.length){toast(issues[0],'error');return;}const copy=cloneTemplateWithoutVersions(pdfEditor.template);copy.id=uid('pdf-template');copy.name=`${pdfEditor.template.name} — Novo`;copy.isDefault=false;copy.version=1;copy.createdAt=copy.updatedAt=new Date().toISOString();copy.versions=[];settings().pdfTemplates.push(copy);await persist('Modelo de PDF salvo como novo',copy.name);await cleanupStagedPdfMedia221(true);closePdfEditorAssets221();pdfEditor=null;openPdfTemplates221();toast('Novo modelo criado.');return;}
    if(a==='pdf-save'){await savePdfTemplate221();return;}
    if(a==='whatsapp-review-copy'||a==='whatsapp-review-ok'){const captured=captureWhatsappTemplate221(btn);let result;try{result=await base(btn);}finally{if(captured)await persist('Mensagem do WhatsApp atualizada','Modelo confirmado pelo usuário',{folder:false,google:true});}return result;}
    return await base(btn);
  }

  async function handleSubmit221(form,base){if(form.dataset.form==='pix-config-v224'){const v=Object.fromEntries(new FormData(form)),id=form.dataset.id||uid('pix'),old=(settings().pixConfigurations||[]).find(x=>x.id===id),code=String(v.copyPasteCode||'').trim();if(!String(v.name||'').trim()||!String(v.beneficiary||'').trim()||!String(v.pixKey||'').trim()||!code)throw new Error('Preencha nome, favorecido, chave e código Pix Copia e Cola.');if(!isValidPixPayload221(code))throw new Error('O código Pix Copia e Cola é inválido. Revise o payload completo antes de salvar.');const item={id,name:String(v.name).trim(),beneficiary:String(v.beneficiary).trim(),beneficiaryDocument:String(v.beneficiaryDocument||'').trim(),bankName:String(v.bankName||'').trim(),keyType:String(v.keyType||'').trim(),pixKey:String(v.pixKey).trim(),city:String(v.city||'').trim(),description:String(v.description||'').trim(),copyPasteCode:normalizePixPayload221(code),active:v.active==='on',createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};settings().pixConfigurations=settings().pixConfigurations||[];if(old)Object.assign(old,item);else settings().pixConfigurations.push(item);if(!settings().defaultPixConfigurationId)settings().defaultPixConfigurationId=id;settings().pixConfigurations.forEach(x=>x.isDefault=x.id===settings().defaultPixConfigurationId);await persist(old?'Configuração Pix atualizada':'Configuração Pix criada',item.name);openPixManager221();toast('Configuração Pix salva.');return;}if(form.dataset.form==='whatsapp-template-v221'){const value=String(form.elements.template.value||'').trim();if(!value)throw new Error('A mensagem não pode ficar vazia.');settings().whatsappMessageTemplate=value;settings().whatsappMessageUpdatedAt=new Date().toISOString();await persist('Mensagem padrão do WhatsApp salva','Personalização');closeModal();renderView();toast('Mensagem padrão salva.');return;}if(form.dataset.form==='rename-pdf-template-v221'){const t=activeTemplates().find(x=>x.id===form.dataset.id),name=String(form.elements.name.value||'').trim();if(!t||!name)throw new Error('Informe um nome válido.');t.name=name;t.updatedAt=new Date().toISOString();await persist('Modelo de PDF renomeado',name);openPdfTemplates221();return;}return await base(form);}

  function installEventHandlers221(){
    document.addEventListener('pointerdown',event=>{
      const layoutEl=event.target.closest('.layout-component-v221');
      if(layoutEl&&orderLayoutEditor){
        const dir=event.target.closest('[data-resize-dir]')?.dataset.resizeDir||'';
        selectLayoutComponent221(layoutEl.dataset.componentId,event,false);startLayoutInteraction221(event,layoutEl,dir);
        document.querySelectorAll('.layout-component-v221').forEach(el=>el.classList.toggle('selected',orderLayoutEditor.selected.has(el.dataset.componentId)));
        renderLayoutProperties221();updateLayoutToolbar221();return;
      }
      if(orderLayoutEditor&&event.target.matches('[data-layout-editor-canvas]')){orderLayoutEditor.selected.clear();renderOrderLayoutEditor221();return;}
      const viewport=event.target.closest('[data-pdf-viewport]');
      const pdfEl=event.target.closest('.pdf-component-v221');
      if(pdfEditor&&viewport&&!pdfEl&&(pdfEditor.handTool||pdfEditor.spacePressed)){
        pdfEditor.panInteraction={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,startLeft:viewport.scrollLeft,startTop:viewport.scrollTop};
        viewport.classList.add('is-panning');
        try{viewport.setPointerCapture?.(event.pointerId);}catch(_){}event.preventDefault();return;
      }
      if(pdfEl&&pdfEditor){
        const pageWrap=pdfEl.closest('[data-pdf-page-index]');
        if(pageWrap)pdfEditor.pageIndex=clamp(Number(pageWrap.dataset.pdfPageIndex)||0,0,pdfEditor.template.pages.length-1);
        pdfEditor.selectedId=pdfEl.dataset.pdfComponentId;document.querySelectorAll('.pdf-component-v221').forEach(el=>el.classList.toggle('selected',el===pdfEl));renderPdfProperties221();
        const c=currentPdfComponent221();if(c?.locked)return;pushPdfHistory221();const dir=event.target.closest('[data-pdf-resize]')?.dataset.pdfResize||'';
        pdfEditor.interaction={id:c.id,dir,startX:event.clientX,startY:event.clientY,start:cloneValue(c),pageIndex:pdfEditor.pageIndex};
        try{pdfEl.setPointerCapture?.(event.pointerId);}catch(_){}event.preventDefault();
      }
    },true);
    document.addEventListener('pointermove',event=>{
      if(orderLayoutEditor?.interaction){moveLayoutInteraction221(event);return;}
      if(pdfEditor?.panInteraction){
        const viewport=document.querySelector('[data-pdf-viewport]'),it=pdfEditor.panInteraction;if(!viewport)return;
        viewport.scrollLeft=it.startLeft-(event.clientX-it.startX);viewport.scrollTop=it.startTop-(event.clientY-it.startY);event.preventDefault();return;
      }
      if(pdfEditor?.interaction){
        const it=pdfEditor.interaction;if(Number.isInteger(it.pageIndex))pdfEditor.pageIndex=it.pageIndex;
        const c=currentPdfComponent221();if(!c)return;const scale=Math.max(.01,pdfEditor.scale),dx=(event.clientX-it.startX)/scale,dy=(event.clientY-it.startY)/scale,mm=pageMm221();let next={...it.start};
        if(it.dir){
          const dir=it.dir;
          if(dir.includes('e'))next.width=it.start.width+dx;
          if(dir.includes('s'))next.height=it.start.height+dy;
          if(dir.includes('w')){next.x=it.start.x+dx;next.width=it.start.width-dx;}
          if(dir.includes('n')){next.y=it.start.y+dy;next.height=it.start.height-dy;}
          if(c.lockAspectRatio!==false&&['image','logo','pix-qr'].includes(c.type)){
            const ratio=Math.max(.01,it.start.width/Math.max(.01,it.start.height));
            if(Math.abs(dx/Math.max(1,it.start.width))>=Math.abs(dy/Math.max(1,it.start.height))){next.height=next.width/ratio;if(dir.includes('n'))next.y=it.start.y+(it.start.height-next.height);}else{next.width=next.height*ratio;if(dir.includes('w'))next.x=it.start.x+(it.start.width-next.width);}
          }
        }else{next.x=it.start.x+dx;next.y=it.start.y+dy;}
        const minW=c.type==='pix-qr'?30:5,minH=c.type==='pix-qr'?30:3;
        if(next.width<minW){if(it.dir?.includes('w'))next.x-=minW-next.width;next.width=minW;}
        if(next.height<minH){if(it.dir?.includes('n'))next.y-=minH-next.height;next.height=minH;}
        next.x=clamp(next.x,0,Math.max(0,mm.w-minW));next.y=clamp(next.y,0,Math.max(0,mm.h-minH));
        next.width=clamp(next.width,minW,mm.w-next.x);next.height=clamp(next.height,minH,mm.h-next.y);
        next=snapPdfPosition221(c,next,it.dir?'resize':'move');Object.assign(c,next);updatePdfComponentVisual221(c,document.querySelector(`.pdf-page-wrap-v224[data-pdf-page-index="${pdfEditor.pageIndex}"]`));return;
      }
    },true);
    document.addEventListener('pointerup',event=>{
      endLayoutInteraction221();
      if(pdfEditor?.panInteraction){document.querySelector('[data-pdf-viewport]')?.classList.remove('is-panning');pdfEditor.panInteraction=null;}
      if(pdfEditor?.interaction){pdfEditor.interaction=null;pdfEditor.dirty=true;showPdfGuides221();renderPdfEditor221();}
    },true);
    document.addEventListener('input',event=>{
      if(orderLayoutEditor&&event.target.matches('[data-layout-prop]')){
        const c=selectedLayoutComponents()[0];if(!c)return;const p=editorPosition(c),key=event.target.dataset.layoutProp,value=Number(event.target.value);if(Number.isFinite(value)){ensureInputHistory221(event.target,'layout');p[key]=value;setEditorPosition(c,p);orderLayoutEditor.dirty=true;updateLayoutComponentVisual221(c);updateLayoutToolbar221();}return;
      }
      if(pdfEditor&&event.target.matches('[data-pdf-prop]')){
        const c=currentPdfComponent221();if(!c)return;const key=event.target.dataset.pdfProp,value=event.target.type==='number'?Number(event.target.value):event.target.value;if(event.target.type!=='number'||Number.isFinite(value)){ensureInputHistory221(event.target,'pdf');c[key]=value;pdfEditor.dirty=true;updatePdfComponentVisual221(c);}return;
      }
      if(pdfEditor&&event.target.matches('[data-pdf-template-prop]')){
        const key=event.target.dataset.pdfTemplateProp,value=event.target.value;ensureInputHistory221(event.target,'pdf');if(key==='name')pdfEditor.template.name=value;else if(key==='quality')pdfEditor.template.quality=value;else pdfEditor.template.page[key]=value;pdfEditor.dirty=true;return;
      }
      if(pdfEditor&&event.target.matches('[data-pdf-margin]')){
        ensureInputHistory221(event.target,'pdf');pdfEditor.template.page.margins=pdfEditor.template.page.margins||{};pdfEditor.template.page.margins[event.target.dataset.pdfMargin]=Number(event.target.value)||0;pdfEditor.dirty=true;
      }
    },true);
    document.addEventListener('change',event=>{
      if(pdfEditor&&event.target.matches('[data-pdf-zoom-select]')){const raw=String(event.target.value||'');if(['fit-page','fit-width','actual'].includes(raw))applyPdfZoom221(raw);else{const value=Number(raw);if(Number.isFinite(value))applyPdfZoom221('manual',value);}return;}
      if(event.target.matches('[data-include-pix]')){const options=event.target.closest('form')?.querySelector('[data-pix-order-options]');if(options)options.hidden=!event.target.checked;return;}
      if(orderLayoutEditor&&event.target.matches('[data-layout-prop-check]')){const c=selectedLayoutComponents()[0];if(!c)return;pushLayoutHistory();c[event.target.dataset.layoutPropCheck]=event.target.checked;orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
      if(orderLayoutEditor&&event.target.matches('[data-layout-mobile-span]')){const c=selectedLayoutComponents()[0];if(!c)return;pushLayoutHistory();c.mobile.span=Number(event.target.value);orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
      if(pdfEditor&&event.target.matches('[data-pdf-prop-check]')){const c=currentPdfComponent221();if(!c)return;pushPdfHistory221();c[event.target.dataset.pdfPropCheck]=event.target.checked;pdfEditor.dirty=true;renderPdfEditor221();return;}
      if(pdfEditor&&event.target.matches('[data-pdf-template-prop="size"],[data-pdf-template-prop="orientation"]')){ensureInputHistory221(event.target,'pdf');const key=event.target.dataset.pdfTemplateProp;pdfEditor.template.page[key]=event.target.value;pdfEditor.dirty=true;renderPdfEditor221();return;}
      if(pdfEditor&&event.target.matches('select[data-pdf-prop]')){const c=currentPdfComponent221();if(!c)return;ensureInputHistory221(event.target,'pdf');c[event.target.dataset.pdfProp]=event.target.value;pdfEditor.dirty=true;renderPdfEditor221();return;}
    },true);
    document.addEventListener('focusout',event=>{if(event.target?.dataset?.history221)delete event.target.dataset.history221;},true);
    document.addEventListener('keydown',event=>{
      if(orderLayoutEditor){
        if((event.ctrlKey||event.metaKey)&&['z','y'].includes(event.key.toLowerCase())){event.preventDefault();const redo=event.key.toLowerCase()==='y'||event.shiftKey;document.querySelector(`[data-action="${redo?'layout-redo':'layout-undo'}"]`)?.click();return;}
        const selected=selectedLayoutComponents();if(selected.length&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&!event.target.matches('input,textarea,select')){event.preventDefault();pushLayoutHistory();const step=event.shiftKey?10:1;selected.forEach(c=>{const p=editorPosition(c);if(event.key==='ArrowLeft')p.x-=step;if(event.key==='ArrowRight')p.x+=step;if(event.key==='ArrowUp')p.y-=step;if(event.key==='ArrowDown')p.y+=step;setEditorPosition(c,p);});orderLayoutEditor.dirty=true;renderOrderLayoutEditor221();return;}
      }
      if(pdfEditor){
        const editing=event.target.matches('input,textarea,select,[contenteditable="true"]'),mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase(),c=currentPdfComponent221();
        if(event.key==='Escape'&&pdfEditor.fullscreen&&!editing){event.preventDefault();event.stopImmediatePropagation();pdfEditor.fullscreen=false;updatePdfModalClasses221();requestAnimationFrame(()=>applyPdfZoom221(pdfEditor.zoomMode,null,{store:false}));return;}
        if(event.code==='Space'&&!editing){event.preventDefault();pdfEditor.spacePressed=true;document.querySelector('[data-pdf-viewport]')?.classList.add('space-pan-ready');return;}
        if(mod&&['z','y'].includes(key)){event.preventDefault();const redo=key==='y'||event.shiftKey;document.querySelector(`[data-action="${redo?'pdf-redo':'pdf-undo'}"]`)?.click();return;}
        if(mod&&key==='d'&&c){event.preventDefault();document.querySelector('[data-action="pdf-duplicate-component"]')?.click();return;}
        if(mod&&key==='c'&&c){event.preventDefault();pdfEditor.clipboard=cloneValue(c);return;}
        if(mod&&key==='v'&&pdfEditor.clipboard){event.preventDefault();pushPdfHistory221();const copy=cloneValue(pdfEditor.clipboard);copy.id=uid('pdfc');copy.x+=4;copy.y+=4;copy.zIndex=Math.max(0,...currentPdfPage221().components.map(x=>x.zIndex||0))+1;currentPdfPage221().components.push(copy);pdfEditor.selectedId=copy.id;renderPdfEditor221();return;}
        if(c&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)&&!event.target.matches('input,textarea,select')){event.preventDefault();pushPdfHistory221();const step=event.shiftKey?5:.5;if(event.key==='ArrowLeft')c.x-=step;if(event.key==='ArrowRight')c.x+=step;if(event.key==='ArrowUp')c.y-=step;if(event.key==='ArrowDown')c.y+=step;const mm=pageMm221();c.x=clamp(c.x,0,mm.w-c.width);c.y=clamp(c.y,0,mm.h-c.height);pdfEditor.dirty=true;renderPdfEditor221();return;}
        if(event.key==='Delete'&&c&&!event.target.matches('input,textarea,select')){event.preventDefault();document.querySelector('[data-action="pdf-delete-component"]')?.click();}
      }
    },true);
    document.addEventListener('keyup',event=>{if(pdfEditor&&event.code==='Space'){pdfEditor.spacePressed=false;document.querySelector('[data-pdf-viewport]')?.classList.remove('space-pan-ready');}},true);
    document.addEventListener('wheel',event=>{if(!pdfEditor||(event.ctrlKey||event.metaKey)===false)return;const viewport=event.target.closest('[data-pdf-viewport]');if(!viewport)return;event.preventDefault();const current=(pdfEditor.scale||actualPdfScale221())/actualPdfScale221(),next=clamp(current+(event.deltaY<0?.1:-.1),.25,4);applyPdfZoom221('manual',next);},{capture:true,passive:false});
    document.addEventListener('touchstart',event=>{if(!pdfEditor||event.touches.length!==2||!event.target.closest('[data-pdf-viewport]'))return;const [a,b]=event.touches;pdfEditor.pinch={distance:Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY),zoom:(pdfEditor.scale||actualPdfScale221())/actualPdfScale221()};},{capture:true,passive:true});
    document.addEventListener('touchmove',event=>{if(!pdfEditor?.pinch||event.touches.length!==2||!event.target.closest('[data-pdf-viewport]'))return;const [a,b]=event.touches,distance=Math.hypot(b.clientX-a.clientX,b.clientY-a.clientY);if(!distance||!pdfEditor.pinch.distance)return;event.preventDefault();const next=clamp(pdfEditor.pinch.zoom*(distance/pdfEditor.pinch.distance),.25,4);if(!pdfEditor.pinchFrame)pdfEditor.pinchFrame=requestAnimationFrame(()=>{pdfEditor.pinchFrame=0;applyPdfZoom221('manual',next);});},{capture:true,passive:false});
    document.addEventListener('touchend',event=>{if(pdfEditor&&event.touches.length<2)pdfEditor.pinch=null;},{capture:true,passive:true});
    window.addEventListener('service-order-layout-updated',()=>{const form=document.querySelector('#modal-root form[data-form="order"]');if(form)requestAnimationFrame(()=>applyOrderLayout221(form));});
    window.addEventListener('client-form-layout-updated',()=>{const form=document.querySelector('#modal-root form[data-form="client"]');if(form)requestAnimationFrame(()=>applyClientLayout221(form));});
    let resizeFrame=0;window.addEventListener('resize',()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{const order=document.querySelector('#modal-root form[data-form="order"]'),client=document.querySelector('#modal-root form[data-form="client"]');if(order)applyOrderLayout221(order);if(client)applyClientLayout221(client);});},{passive:true});
  }

  function install(){if(installed)return;installed=true;
    const baseNormalize=normalizeState;normalizeState=function(){baseNormalize();return ensureState221();};
    const baseRenderSettings=renderSettings;renderSettings=function(){ensureState221();return baseRenderSettings();};
    // openOrderForm resolve o rascunho de forma assíncrona (MarcoStorage.getDraft), então um único
    // requestAnimationFrame depois da chamada não encontra o formulário e o layout salvo nunca era aplicado.
    // O observer garante a hidratação assim que o formulário existir, seja no caminho síncrono ou no assíncrono.
    const baseOpenOrderForm=openOrderForm;openOrderForm=function(id='',prefill={}){baseOpenOrderForm(id,prefill);requestAnimationFrame(hydrateOrderForm221);};
    const baseOpenClientForm=openClientForm;openClientForm=function(id=''){baseOpenClientForm(id);requestAnimationFrame(()=>hydrateClientForm221());};
    watchOrderForm221();watchClientForm221();
    const baseSaveOrderForm=saveOrderForm;saveOrderForm=async function(form){return await baseSaveOrderForm(form);};
    const baseHandleAction=handleAction;handleAction=async function(btn){const action=btn?.dataset?.action||'',guarded=new Set(['create-pdf-template','duplicate-pdf-template','set-default-pdf-template','delete-pdf-template','export-pdf-template','import-pdf-template','pdf-restore-version','pdf-save','pdf-save-as','pdf-reset','layout-save','layout-reset','restore-personalization-defaults']),key=`${action}:${btn?.dataset?.id||''}`;if(guarded.has(action)&&ACTION_INFLIGHT_221.has(key))return;if(guarded.has(action)){ACTION_INFLIGHT_221.add(key);if(btn?.isConnected)btn.disabled=true;}try{return await handleAction221(btn,baseHandleAction);}catch(e){console.error('Ação v2.2.13 falhou:',e);toast(e.message||'Não foi possível concluir a ação.','error');}finally{if(guarded.has(action)){ACTION_INFLIGHT_221.delete(key);if(btn?.isConnected)btn.disabled=false;}}};
    const baseHandleSubmit=handleSubmit;handleSubmit=async function(form){try{return await handleSubmit221(form,baseHandleSubmit);}catch(e){console.error('Formulário v2.2.13 falhou:',e);toast(e.message||'Não foi possível salvar.','error');}};
    installEventHandlers221();watchWhatsappReview221();
    window.MarcoPersonalization221={version:VERSION,defaultOrderLayout,defaultClientLayout,defaultPdfTemplate,professionalTemplates:professionalTemplates221,ensureState:ensureState221,renderPersonalizationCards:personalizationCards,renderMessage:renderVariableTemplate,validateLayout:validateLayout221,validatePdfTemplate:validatePdfTemplate221,sanitizePdfTemplate:sanitizePdfTemplate221,openLayoutEditor:openOrderLayoutEditor221,openClientLayoutEditor:openClientLayoutEditor221,hydrateClientForm:hydrateClientForm221,applyClientLayout:applyClientLayout221,openPdfTemplates:openPdfTemplates221,snapshotPixFromForm:snapshotPixFromForm221,openPixSettings:openPixManager221,validatePixPayload:isValidPixPayload221};
  }

  window.MarcoPersonalization221={install,version:VERSION,defaultOrderLayout,defaultClientLayout,defaultPdfTemplate,professionalTemplates:professionalTemplates221};
})();

/* ===== js/pts-completo.js ===== */
'use strict';

/* Marco Iris - PTS completo 15/07/2026
 * Camada integrada de regras, telas e migração. Executada antes do boot.
 */
(() => {
  const PTS_VERSION = '2.8.4';
  const OPERATIONAL_STATUSES = ['Orçamento','Em andamento','Aguardando peça','Concluída','Cancelada'];
  const PAYMENT_METHODS = ['Pix','Dinheiro','Débito','Crédito (À vista)','Crédito 2x','Crédito 3x','Crédito 4x','Crédito 5x','Crédito 6x','Crédito 7x','Crédito 8x','Crédito 9x','Crédito 10x','Crédito 11x','Crédito 12x','Boleto','Transferência','Outro'];
  const EQUIPMENT_TYPES = ['Computador Gamer','Computador de Escritório','Notebook Gamer','Notebook','Celular','Monitor','Impressora','Console','Game Stick','Rack','Teclado','Roteador','Mouse'];
  const MENU_DEFAULT = ['dashboard','orders','agenda','clients','finance','catalog','documents','settings'];
  const MENU_LABELS = {dashboard:'Visão geral',orders:'Ordens de serviço',agenda:'Agenda',clients:'Clientes',finance:'Financeiro',catalog:'Catálogo e Estoque',documents:'Documentos',settings:'Configurações'};
  const ENTITY_PREFIXES = new Set(['OSV','CLI','PRD','SRV','INS','ITM','MOV','REC','DES','AGE','TER']);
  const STATUS_MAP = {
    'em analise':'Orçamento','aguardando aprovacao':'Orçamento','orcamento':'Orçamento',
    'em andamento':'Em andamento','aguardando peca':'Aguardando peça','pronto para retirada':'Concluída',
    'concluido':'Concluída','concluida':'Concluída','cancelado':'Cancelada','cancelada':'Cancelada'
  };
  const FINANCIAL_MAP = {'pendente':'Em aberto','em aberto':'Em aberto','atrasado':'Vencido','vencido':'Vencido','parcial':'Parcial','pago':'Pago','cancelado':'Cancelado'};
  const UF_OPTIONS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const VALID_DDDS = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);
  const CITY_SEED = {
    SP:['Catanduva','Ariranha','São José do Rio Preto','Bebedouro','Barretos','Novo Horizonte','Pindorama','Santa Adélia','São Paulo','Campinas','Ribeirão Preto'],
    MG:['Belo Horizonte','Uberlândia','Uberaba'],RJ:['Rio de Janeiro','Niterói'],PR:['Curitiba','Londrina','Maringá']
  };

  let ORDER_FILTERS = {status:'Todos',mode:'Nenhum',day:today(),month:today().slice(0,7),year:String(new Date().getFullYear())};
  let FINANCE_FILTER = {month:today().slice(0,7)};
  let DOCUMENT_FILTER = {date:''};
  let DASHBOARD_LAYOUT_EDIT = false;
  let DASHBOARD_LAYOUT_SNAPSHOT = null;
  let PENDING_ORDER_DRAFT = null;
  let MIGRATION_SESSION = null;
  let FORM_LAYOUT_SNAPSHOT = null;
  let FORM_LAYOUT_HISTORY = [];
  let DASHBOARD_LAYOUT_HISTORY = [];
  let CEP_SUGGESTIONS = [];
  let ADDRESS_LOOKUP_TIMER = 0;
  let PROMPT_RESOLVE = null;
  let PRODUCT_SORT = {key:null,direction:'default'};
  let SETTINGS_CATEGORY = 'personalization';
  const SETTINGS_CATEGORIES = [
    ['personalization','Personalização e módulos','Layouts, PDF, WhatsApp, preferências e módulos.','grid'],
    ['organization','Organização','Menu, Visão Geral e disposição dos elementos.','menu'],
    ['company','Dados da empresa e proteção','Cadastro da empresa e segurança deste dispositivo.','clients'],
    ['backup','Backup e migração','AppSheet, Google Drive e exportações.','cloud'],
    ['system','Histórico e sistema','Auditoria, diagnóstico, integridade e informações técnicas.','history']
  ];

  const baseNormalizeState = normalizeState;
  const baseOpenModal = openModal;
  const baseHandleAction = handleAction;
  const baseHandleSubmit = handleSubmit;
  const baseRenderView = renderView;
  const baseNavigateTo = navigateTo;
  const baseDeletePaymentAction = null;
  const baseRealizedPaymentValue = realizedPaymentValue;
  const basePersistPts = persist;

  function digitsOnly(value){return String(value ?? '').replace(/\D/g,'');}
  function normalizeText(value){return norm(value).replace(/[^a-z0-9]+/g,' ').trim();}
  function parseSequence(value){const parsed=window.MarcoIdentifiers?.parseEntityCode(value);return parsed?.sequence??window.MarcoIdentifiers?.sequenceFrom(value)??0;}
  function groupedCode(prefix,sequence){return MarcoIdentifiers.formatEntityCode(prefix,Math.max(0,Number(sequence)||0));}
  function canonicalCode(value,prefix){return MarcoIdentifiers.normalizeEntityCode(value,prefix)||String(value||'').trim();}
  function importedCode(value,prefix,list=[]){
    const raw=String(value||'').trim();
    if(!raw)return nextCode(prefix,list);
    const canonical=MarcoIdentifiers.normalizeEntityCode(raw,prefix);
    return canonical||nextCode(prefix,list);
  }
  function normalizeBrazilianPhone(value){return MarcoPhone.normalizeBrazilianPhone(value);}
  function normalizedBrPhone(value){const result=normalizeBrazilianPhone(value);return result.valid?result.normalizedDigits:'';}
  function phoneFields(value){const result=normalizeBrazilianPhone(value);return result.valid?{phone:result.formatted,phoneNormalized:result.normalizedDigits,phoneE164:result.e164,phoneReviewRequired:false}:{phone:String(value||''),phoneNormalized:'',phoneE164:'',phoneReviewRequired:!!String(value||'').trim()};}
  function canonicalOperationalStatus(value){return STATUS_MAP[normalizeText(value)]||OPERATIONAL_STATUSES.find(x=>normalizeText(x)===normalizeText(value))||'Orçamento';}
  function isCancelledOrder(order){return normalizeText(order?.status)==='cancelada';}
  realizedPaymentValue = function(orderId){const order=findOrder(orderId);return order&&isCancelledOrder(order)?0:baseRealizedPaymentValue(orderId);};
  function paymentIsCancelled(payment){return normalizeText(payment?.status)==='cancelado'||!!payment?.cancelledAt;}
  function paymentIsPaid(payment){return !paymentIsCancelled(payment)&&!!payment?.paymentDate;}
  function recordFinancialStatus(payment){
    return window.MarcoFinanceStatus?.effectiveStatus(payment)||(!payment?.paymentDate&&payment?.dueDate&&payment.dueDate<today()?'Vencido':payment?.paymentDate?'Pago':paymentIsCancelled(payment)?'Cancelado':'Em aberto');
  }
  function orderFinancialInfo(order){
    if(!order||isCancelledOrder(order))return {status:'Cancelado',paid:0,balance:0,dueDate:'',overdue:false};
    const total=num(order.total);
    const payments=orderPayments(order.id).filter(p=>normalizeText(p.type)==='receita'&&!paymentIsCancelled(p));
    const paid=payments.filter(paymentIsPaid).reduce((sum,p)=>sum+num(p.value),0);
    const unpaid=payments.filter(p=>!paymentIsPaid(p));
    const overdue=unpaid.some(p=>p.dueDate&&p.dueDate<today());
    const dueDate=unpaid.map(p=>p.dueDate).filter(Boolean).sort()[0]||'';
    const balance=Math.max(0,total-paid);
    let status='Em aberto';
    if(total>0&&paid>=total-.005)status='Pago';
    else if(paid>0)status='Parcial';
    else if(overdue)status='Vencido';
    return {status,paid,balance,dueDate,overdue};
  }
  function paidActiveOrderPayments(orderId){return orderPayments(orderId).filter(p=>normalizeText(p.type)==='receita'&&paymentIsPaid(p));}
  async function planOrderCancellation(orderId,items=[]){
    const paid=paidActiveOrderPayments(orderId),decision={abort:false,paymentAction:'none',paymentIds:paid.map(p=>p.id),reverseStock:true,hadPaid:paid.length>0,hadAutomaticStock:false};
    if(paid.length){
      const total=paid.reduce((sum,p)=>sum+num(p.value),0),keep=await confirmAction(`A OSV possui ${currency(total)} recebido(s).\n\nOK = manter os pagamentos ativos no histórico.\nCancelar = abrir a opção de estorno lógico.`);
      if(keep)decision.paymentAction='preserve';
      else{const reverse=await confirmAction('Estornar/cancelar logicamente os pagamentos recebidos?\n\nOK = estornar, manter os IDs REC e registrar a auditoria.\nCancelar = interromper o cancelamento da OSV.');if(!reverse){decision.abort=true;return decision;}decision.paymentAction='cancel';}
    }
    const itemIds=new Set((items||[]).map(x=>x.id));
    decision.hadAutomaticStock=data().stockMovements.some(m=>m.orderId===orderId&&itemIds.has(m.sourceItemId)&&normalizeText(m.movementType)==='saida');
    if(decision.hadAutomaticStock)decision.reverseStock=await confirmAction('Esta OSV possui baixas automáticas de estoque.\n\nOK = reverter as baixas com MOV compensatória.\nCancelar = manter as baixas e continuar o cancelamento da OSV.');
    return decision;
  }
  function applyCancellationPaymentDecision(decision,orderId){
    if(decision?.paymentAction!=='cancel')return;
    const ids=new Set(decision.paymentIds||[]);
    data().payments.filter(p=>ids.has(p.id)).forEach(p=>{p.status='Cancelado';p.cancelledAt=nowIso();p.cancelReason=`Estorno lógico pelo cancelamento da ${orderId}`;p.updatedAt=nowIso();});
  }
  function cancellationAuditText(decision){
    if(!decision)return '';
    const pay=decision.paymentAction==='cancel'?'pagamentos estornados':decision.paymentAction==='preserve'?'pagamentos preservados':'sem pagamentos recebidos';
    const stock=decision.hadAutomaticStock?(decision.reverseStock?'estoque revertido':'estoque mantido'):'sem baixa automática';
    return `${pay}; ${stock}`;
  }
  function safeJson(value){try{return JSON.parse(JSON.stringify(value));}catch(_){return null;}}
  function findByAnyCode(list,code){const c=String(code||'').toUpperCase();return list.find(x=>String(x.id||x.code||'').toUpperCase()===c);}
  function activeItems(list){return list.filter(x=>normalizeText(x.status)!=='inativo');}
  function orderNotCancelled(order){return order&&order.registrationStatus!=='Inativo'&&!isCancelledOrder(order);}
  function currentProfileSettings(){return data().settings;}
  lowStockItems = function(){
    const rows=[];
    for(const x of data().products){if(normalizeText(x.status)==='inativo')continue;const health=MarcoStockHealth.getStockHealth(stockOf('Produto',x.id),x.minimumStock);if(['critical','warning'].includes(health.level))rows.push({type:'Produto',id:x.id,name:x.description,stock:stockOf('Produto',x.id),min:x.minimumStock,health});}
    for(const x of data().supplies){if(normalizeText(x.status)==='inativo')continue;const health=MarcoStockHealth.getStockHealth(stockOf('Insumo',x.id),x.minimumStock);if(['critical','warning'].includes(health.level))rows.push({type:'Insumo',id:x.id,name:x.description,stock:stockOf('Insumo',x.id),min:x.minimumStock,health});}
    return rows.sort((a,b)=>a.health.priority-b.health.priority||a.stock-b.stock||String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  };

  function migrateIdsAndLinks(d){
    const previous=d?.settings?.migrations?.identifiersPhonesV220;
    if(previous&&!needsV220Migration(d))return previous;
    const specs=[
      {key:'serviceOrders',prefix:'OSV',map:'orders'},
      {key:'clients',prefix:'CLI',map:'clients'},
      {key:'products',prefix:'PRD',map:'products'},
      {key:'services',prefix:'SRV',map:'services'},
      {key:'supplies',prefix:'INS',map:'supplies'},
      {key:'orderItems',prefix:'ITM',map:'items'},
      {key:'stockMovements',prefix:'MOV',map:'movements'},
      {key:'appointments',prefix:'AGE',map:'appointments'},
      {key:'consents',prefix:'TER',map:'consents'}
    ];
    const maps={orders:new Map(),clients:new Map(),products:new Map(),services:new Map(),supplies:new Map(),items:new Map(),movements:new Map(),appointments:new Map(),consents:new Map(),payments:new Map()};
    const conflicts=[];let changed=0;
    const migrateList=(list,prefix,map,label)=>{
      list=Array.isArray(list)?list:[];
      const parsed=list.map(item=>MarcoIdentifiers.parseEntityCode(item?.id||item?.code,prefix));
      let high=Math.max(num(d.settings?.nextIds?.[prefix]),...parsed.map(x=>x?.sequence||0));
      const used=new Set();
      list.forEach((item,index)=>{
        const old=String(item?.id||item?.code||'').trim(),info=parsed[index];let next=info?.canonical||'';
        if(!next||used.has(next)){
          do{high++;next=groupedCode(prefix,high);}while(used.has(next));
          conflicts.push({entity:label,oldId:old||'(vazio)',newId:next,reason:info?'colisão de identificador':'identificador ausente ou inválido'});
        }else high=Math.max(high,info.sequence);
        used.add(next);
        if(old&&!map.has(old))map.set(old,next);
        if(old!==next)changed++;
        item.id=next;if(Object.prototype.hasOwnProperty.call(item,'code'))item.code=next;
      });
      d.settings.nextIds[prefix]=Math.max(num(d.settings.nextIds[prefix]),high);
    };

    d.settings=d.settings||{};d.settings.nextIds=d.settings.nextIds||{};
    for(const spec of specs)migrateList(d[spec.key],spec.prefix,maps[spec.map],spec.key);
    migrateList((d.payments||[]).filter(p=>normalizeText(p.type)!=='despesa'),'REC',maps.payments,'payments/REC');
    migrateList((d.payments||[]).filter(p=>normalizeText(p.type)==='despesa'),'DES',maps.payments,'payments/DES');

    const remap=(value,map,prefix)=>{
      if(value===null||value===undefined||value==='')return value||'';
      const raw=String(value);return map.get(raw)||MarcoIdentifiers.normalizeEntityCode(raw,prefix)||raw;
    };
    for(const order of d.serviceOrders||[]){
      order.clientId=remap(order.clientId,maps.clients,'CLI');
      for(const media of [...(order.photos||[]),...(order.pdfs||[]),...(order.attachments||[])])media.orderId=order.id;
    }
    for(const item of d.orderItems||[]){
      item.orderId=remap(item.orderId,maps.orders,'OSV');
      item.productId=remap(item.productId,maps.products,'PRD');
      item.serviceId=remap(item.serviceId,maps.services,'SRV');
      item.supplyId=remap(item.supplyId,maps.supplies,'INS');
    }
    for(const payment of d.payments||[]){payment.orderId=remap(payment.orderId,maps.orders,'OSV');payment.clientId=remap(payment.clientId,maps.clients,'CLI');payment.code=payment.id;}
    for(const movement of d.stockMovements||[]){
      movement.orderId=remap(movement.orderId,maps.orders,'OSV');
      movement.productId=remap(movement.productId,maps.products,'PRD');
      movement.supplyId=remap(movement.supplyId,maps.supplies,'INS');
      movement.sourceItemId=remap(movement.sourceItemId,maps.items,'ITM');
    }
    for(const appointment of d.appointments||[]){appointment.orderId=remap(appointment.orderId,maps.orders,'OSV');appointment.clientId=remap(appointment.clientId,maps.clients,'CLI');}
    for(const consent of d.consents||[]){consent.orderId=remap(consent.orderId,maps.orders,'OSV');consent.clientId=remap(consent.clientId,maps.clients,'CLI');}
    for(const attachment of d.attachments||[])attachment.orderId=remap(attachment.orderId,maps.orders,'OSV');
    for(const history of d.priceHistory||[]){
      history.orderId=remap(history.orderId,maps.orders,'OSV');history.clientId=remap(history.clientId,maps.clients,'CLI');history.itemId=remap(history.itemId,maps.items,'ITM');
      if(normalizeText(history.type)==='produto')history.catalogId=remap(history.catalogId,maps.products,'PRD');
      else if(normalizeText(history.type)==='servico')history.catalogId=remap(history.catalogId,maps.services,'SRV');
      else if(normalizeText(history.type)==='insumo')history.catalogId=remap(history.catalogId,maps.supplies,'INS');
    }
    for(const history of d.costHistory||[]){
      if(normalizeText(history.catalogType)==='produto')history.catalogId=remap(history.catalogId,maps.products,'PRD');
      else if(normalizeText(history.catalogType)==='servico')history.catalogId=remap(history.catalogId,maps.services,'SRV');
      else if(normalizeText(history.catalogType)==='insumo')history.catalogId=remap(history.catalogId,maps.supplies,'INS');
    }

    const replacements=[];for(const map of Object.values(maps))for(const [old,next] of map.entries())if(old&&old!==next)replacements.push([old,next]);
    const replaceStructured=value=>{
      if(Array.isArray(value)){value.forEach(replaceStructured);return value;}
      if(value&&typeof value==='object'){for(const key of Object.keys(value))value[key]=replaceStructured(value[key]);return value;}
      if(typeof value==='string'){let text=value;for(const [old,next] of replacements)text=text.split(old).join(next);return text;}
      return value;
    };
    replaceStructured(d.migrationHistory||[]);replaceStructured(d.migrationLog||[]);replaceStructured(d.audit||[]);

    let phonesNormalized=0,phonesForReview=0;
    for(const client of d.clients||[]){
      const source=client.phoneNormalized||client.phone||'',result=normalizeBrazilianPhone(source);
      if(result.valid){
        if(client.phone!==result.formatted||client.phoneNormalized!==result.normalizedDigits||client.phoneE164!==result.e164)phonesNormalized++;
        Object.assign(client,{phone:result.formatted,phoneNormalized:result.normalizedDigits,phoneE164:result.e164,phoneReviewRequired:false});
      }else if(String(source).trim()){
        client.phone=client.phone||String(source);client.phoneNormalized='';client.phoneE164='';client.phoneReviewRequired=true;phonesForReview++;
      }else Object.assign(client,{phone:'',phoneNormalized:'',phoneE164:'',phoneReviewRequired:false});
    }

    const completedAt=nowIso(),report={version:'2.2.0',completedAt,changedIds:changed,phonesNormalized,phonesForReview,conflicts};
    d.settings.migrations=d.settings.migrations||{};d.settings.migrations.identifiersPhonesV220=report;
    d.migrationLog=d.migrationLog||[];d.migrationLog.push({id:`migration_v220_${Date.now()}`,date:completedAt,action:'Migração de identificadores concluída',detail:`${changed} identificador(es), ${phonesNormalized} telefone(s), ${phonesForReview} para revisão`,conflicts});
    d.audit=d.audit||[];d.audit.unshift({id:`audit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date:completedAt,action:'Migração de identificadores concluída',detail:`Formato AAA-000000 aplicado; ${phonesForReview} telefone(s) requerem revisão.`});
    return report;
  }

  function needsV220Migration(d){
    const checks=[['serviceOrders','OSV'],['clients','CLI'],['products','PRD'],['services','SRV'],['supplies','INS'],['orderItems','ITM'],['stockMovements','MOV'],['appointments','AGE'],['consents','TER']];
    for(const [key,prefix] of checks)for(const item of d[key]||[])if(!MarcoIdentifiers.parseEntityCode(item?.id,prefix)?.official||MarcoIdentifiers.normalizeEntityCode(item?.id,prefix)!==item?.id)return true;
    for(const payment of d.payments||[]){const prefix=normalizeText(payment.type)==='despesa'?'DES':'REC';if(MarcoIdentifiers.normalizeEntityCode(payment.id||payment.code,prefix)!==payment.id)return true;}
    for(const client of d.clients||[]){
      const source=client.phoneNormalized||client.phone||'',result=normalizeBrazilianPhone(source);
      if(result.valid&&(client.phone!==result.formatted||client.phoneNormalized!==result.normalizedDigits||client.phoneE164!==result.e164))return true;
      if(!result.valid&&String(source).trim()&&!client.phoneReviewRequired)return true;
    }
    return false;
  }

  function migrateInitialStock(d){
    const migrate=(item,type)=>{
      const initial=num(item.initialStock);
      const hasInitial=d.stockMovements.some(m=>m.origin==='initial-stock'&&((type==='Produto'&&m.productId===item.id)||(type==='Insumo'&&m.supplyId===item.id)));
      if(initial&&!hasInitial){
        const configuredNext=Math.max(1,num(d.settings?.nextIds?.MOV)||1);
        const maxExisting=(d.stockMovements||[]).reduce((max,m)=>Math.max(max,parseSequence(m?.id),parseSequence(m?.code)),0);
        const id=groupedCode('MOV',Math.max(configuredNext,maxExisting+1));
        d.stockMovements.push({id,itemType:type,productId:type==='Produto'?item.id:'',supplyId:type==='Insumo'?item.id:'',movementType:'Entrada',quantity:initial,date:item.createdAt?.slice?.(0,10)||today(),orderId:'',notes:'Estoque inicial do cadastro',stockBefore:0,stockAfter:initial,sourceItemId:'',origin:'initial-stock'});
        d.settings.nextIds.MOV=parseSequence(id)+1;
      }
      if(hasInitial||initial)item.initialStock=0;
    };
    d.products.forEach(x=>migrate(x,'Produto'));d.supplies.forEach(x=>migrate(x,'Insumo'));
  }

  function syncHighWatermarks(d=data()){
    /* nextIds representa o PRÓXIMO número livre — nunca o último já usado.
       Isso impede que a prévia de um formulário pule uma numeração. */
    d.settings=d.settings||{};d.settings.nextIds=d.settings.nextIds||{};
    const groups={OSV:d.serviceOrders,CLI:d.clients,PRD:d.products,SRV:d.services,INS:d.supplies,ITM:d.orderItems,MOV:d.stockMovements,AGE:d.appointments,TER:d.consents};
    for(const [prefix,list] of Object.entries(groups)){
      const max=(list||[]).reduce((m,x)=>Math.max(m,parseSequence(x?.id),parseSequence(x?.code)),0);
      d.settings.nextIds[prefix]=Math.max(1,num(d.settings.nextIds[prefix])||1,max+1);
    }
    for(const prefix of ['REC','DES']){
      const max=(d.payments||[]).filter(x=>(normalizeText(x.type)==='despesa'?'DES':'REC')===prefix).reduce((m,x)=>Math.max(m,parseSequence(x?.id),parseSequence(x?.code)),0);
      // Financeiro segue a base real: uma exclusão definitiva do último lançamento libera o número novamente.
      d.settings.nextIds[prefix]=Math.max(1,max+1);
    }
    return d.settings.nextIds;
  }

  normalizeState = function(){
    baseNormalizeState();
    const sourceSchema=num(STATE.schemaVersion),profileData=Object.values(STATE.dataByProfile||{});
    for(const pd of profileData){
      if(!pd||typeof pd!=='object')continue;
      ['clients','serviceOrders','orderItems','payments','products','services','supplies','stockMovements','appointments','attachments','consents','audit','priceHistory','costHistory','migrationHistory','migrationLog'].forEach(k=>{if(!Array.isArray(pd[k]))pd[k]=[];});
      pd.settings=pd.settings||{};pd.settings.nextIds=pd.settings.nextIds||{};
      if(sourceSchema<5||needsV220Migration(pd)){migrateIdsAndLinks(pd);migrateInitialStock(pd);}
      pd.clients.forEach(client=>{const source=client.phoneNormalized||client.phone||'',result=normalizeBrazilianPhone(source);if(result.valid)Object.assign(client,{phone:result.formatted,phoneNormalized:result.normalizedDigits,phoneE164:result.e164,phoneReviewRequired:false});else if(String(source).trim())client.phoneReviewRequired=true;});
      pd.serviceOrders.forEach(o=>{o.status=canonicalOperationalStatus(o.status);o.discount=num(o.discount);o.total=num(o.total);});
      pd.payments.forEach(p=>{p.status=recordFinancialStatus(p);p.fee=num(p.fee);p.grossValue=num(p.grossValue)||num(p.value)+num(p.fee);});
      pd.products.forEach(p=>{if(p.margin>1)p.margin=p.margin/100;p.status=p.status||'Ativo';p.costHistory=undefined;});
      pd.services.forEach(s=>s.status=s.status||'Ativo');pd.supplies.forEach(s=>s.status=s.status||'Ativo');
      syncHighWatermarks(pd);
    }
    STATE.schemaVersion=5;
    const d=data();
    ['priceHistory','costHistory','migrationHistory','migrationLog'].forEach(k=>{if(!Array.isArray(d[k]))d[k]=[];});
    d.settings.modules={agenda:d.settings.modules?.agenda===true,terms:d.settings.modules?.terms===true};
    d.settings.menuOrder=Array.isArray(d.settings.menuOrder)?d.settings.menuOrder.filter(x=>MENU_DEFAULT.includes(x)):MENU_DEFAULT.slice();
    MENU_DEFAULT.forEach(x=>{if(!d.settings.menuOrder.includes(x))d.settings.menuOrder.push(x);});
    d.settings.dashboardLayout=d.settings.dashboardLayout||{};
    d.settings.dashboardLayouts=d.settings.dashboardLayouts||{};
    if(!Object.keys(d.settings.dashboardLayouts).length&&Object.keys(d.settings.dashboardLayout).length)d.settings.dashboardLayouts.desktop=clone(d.settings.dashboardLayout);
    d.settings.formLayouts=d.settings.formLayouts||{};
    d.settings.equipmentTypes=Array.isArray(d.settings.equipmentTypes)?d.settings.equipmentTypes:[];
    d.settings.migrationKeys=Array.isArray(d.settings.migrationKeys)?d.settings.migrationKeys:[];
    d.settings.migrationTemplates=d.settings.migrationTemplates||{};
    syncHighWatermarks(d);
    NAV.splice(0,NAV.length,...MENU_DEFAULT.map(id=>[id,MENU_LABELS[id]]));
    Object.assign(VIEW_TITLES,MENU_LABELS,{stock:'Catálogo e Estoque'});
  };

  const integrityReportV220Base=integrityReport;
  integrityReport=function(){
    const report=integrityReportV220Base();
    const issues=Array.isArray(report.issues)?report.issues:[];
    const add=(type,label,count,detail)=>{if(count)issues.push({type,label,count,detail});};
    const d=data();
    add('warn','Telefones para revisão',(d.clients||[]).filter(client=>client.phoneReviewRequired).length,'O valor antigo foi preservado, mas o WhatsApp fica bloqueado até a correção.');
    const specs=[['serviceOrders','OSV'],['clients','CLI'],['products','PRD'],['services','SRV'],['supplies','INS'],['orderItems','ITM'],['stockMovements','MOV'],['appointments','AGE'],['consents','TER']];
    let legacyIds=0;for(const [key,prefix] of specs)for(const item of d[key]||[])if(MarcoIdentifiers.normalizeEntityCode(item?.id,prefix)!==item?.id)legacyIds++;
    for(const payment of d.payments||[]){const prefix=normalizeText(payment.type)==='despesa'?'DES':'REC';if(MarcoIdentifiers.normalizeEntityCode(payment?.id||payment?.code,prefix)!==payment?.id)legacyIds++;}
    add('danger','Identificadores fora do padrão',legacyIds,'Execute a migração para aplicar AAA-000000 e reparar os vínculos.');
    report.issues=issues;report.total=issues.reduce((sum,item)=>sum+num(item.count),0);report.checkedAt=nowIso();return report;
  };

  nextCode = function(prefix,list,width=6,field='id'){
    const normalized=MarcoIdentifiers.normalizePrefix(prefix);
    const configuredNext=ENTITY_PREFIXES.has(normalized)?Math.max(1,num(currentProfileSettings()?.nextIds?.[normalized])||1):1;
    let maxExisting=0;
    for(const item of list||[]){
      if((normalized==='REC'||normalized==='DES')&&((normalizeText(item?.type)==='despesa'?'DES':'REC')!==normalized))continue;
      maxExisting=Math.max(maxExisting,parseSequence(item?.[field]||item?.id||item?.code));
    }
    const isFinancial=normalized==='REC'||normalized==='DES';
    const sequence=isFinancial?Math.max(maxExisting+1,1):Math.max(configuredNext,maxExisting+1,1);
    return ENTITY_PREFIXES.has(normalized)?groupedCode(normalized,sequence):`${normalized}-${String(sequence).padStart(width,'0')}`;
  };

  persist = async function(action='',detail='',opts={}){
    syncHighWatermarks();
    return await basePersistPts(action,detail,opts);
  };

  realizedPaymentValue = function(orderId){const order=findOrder(orderId);if(order&&isCancelledOrder(order))return 0;return orderPayments(orderId).filter(p=>normalizeText(p.type)==='receita'&&paymentIsPaid(p)).reduce((s,p)=>s+num(p.value),0);};
  paymentStatus = function(order){return orderFinancialInfo(order).status;};
  statusBadge = function(value){
    const label=String(value||'Em aberto'),n=normalizeText(label);
    const tone=['concluida','pago','ativo','confirmado','entrada'].some(x=>n.includes(x))?'ok':['cancelada','cancelado','vencido','inativo','saida'].some(x=>n.includes(x))?'danger':['em andamento','parcial','orcamento'].some(x=>n.includes(x))?'blue':'warn';
    return `<span class="badge ${tone}"><span class="status-dot"></span>${esc(label)}</span>`;
  };
  stockOf = function(type,id){
    const item=type==='Produto'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id);
    const movements=data().stockMovements.filter(m=>(type==='Produto'&&m.productId===id)||(type==='Insumo'&&m.supplyId===id));
    const hasInitial=movements.some(m=>m.origin==='initial-stock');
    const legacyBase=hasInitial?0:num(item?.initialStock);
    return movements.reduce((s,m)=>s+movementSign(m)*num(m.quantity),legacyBase);
  };
  lowStockItems = function(){
    const build=(type,list)=>list.filter(x=>x.status!=='Inativo').map(x=>{const stock=stockOf(type,x.id),health=MarcoStockHealth.getStockHealth(stock,x.minimumStock);return {type,id:x.id,name:x.description,stock,min:x.minimumStock,health};});
    return [...build('Produto',data().products),...build('Insumo',data().supplies)].filter(x=>['critical','warning'].includes(x.health.level)).sort((a,b)=>a.health.priority-b.health.priority||a.stock-b.stock||String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  };

  function visibleMenu(){
    const s=currentProfileSettings(),enabled=id=>id!=='agenda'||s.modules.agenda;
    return s.menuOrder.filter(id=>MENU_DEFAULT.includes(id)&&enabled(id)).map(id=>[id,MENU_LABELS[id]]);
  }

  renderShell = function(entry=''){
    stopLockNetwork();document.body.classList.remove('login-page');const p=activeProfile();
    const nav=visibleMenu();
    $('#root').innerHTML=`<div class="app-bg ${entry==='right'?'screen-enter-right':''}"><div class="app-shell"><aside class="sidebar" aria-label="Menu principal"><div class="brand"><img src="icon-192.png" alt=""><div><strong>Marco Iris</strong><small>Soluções em Tecnologia</small></div></div><div class="nav-section">Gestão</div>${nav.map(([id,label])=>`<button class="nav-btn ${CURRENT_VIEW===id?'active':''}" data-action="navigate" data-view="${id}">${icon(id)}<span>${label}</span></button>`).join('')}<div class="sidebar-footer"><div class="save-status" id="save-status" data-tone="ok">Google Drive conectado</div><button class="nav-btn" data-action="manual-save">${icon('save')}<span>Backup no Google Drive</span></button><button class="nav-btn lock-sidebar-btn" data-action="lock-now">${icon('lock')}<span>Bloquear tela</span></button></div></aside><button class="sidebar-scrim" type="button" data-action="close-menu" aria-label="Fechar menu"></button><main class="main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="toggle-menu" aria-label="Abrir menu">${icon('menu')}</button><div class="view-heading"><h1 id="view-title">${VIEW_TITLES[CURRENT_VIEW]}</h1><small>${esc(p.name)} · ${esc(p.role||'Administrador')}</small></div><label class="global-search">${icon('search')}<input id="global-search" value="${attr(SEARCH)}" placeholder="Pesquisar nesta tela"></label><div class="top-actions"><button class="icon-btn desktop-only" title="Ocultar ou mostrar valores" data-action="toggle-privacy">${icon('eye')}</button><button class="icon-btn" title="Salvar" data-action="manual-save">${icon('save')}</button><button class="icon-btn lock-top-btn" title="Bloquear tela" data-action="lock-now">${icon('lock')}</button></div></header><section class="content" id="view-root"></section></main></div></div>`;
    renderView('none');
  };

  navigateTo = function(view){
    if(view==='stock'){ACTIVE_TAB.catalog='movements';view='catalog';}
    if(view==='agenda'&&!currentProfileSettings().modules.agenda)view='dashboard';
    return baseNavigateTo(view);
  };

  renderView = function(entry='soft'){
    if(CURRENT_VIEW==='stock'){CURRENT_VIEW='catalog';ACTIVE_TAB.catalog='movements';}
    if(CURRENT_VIEW==='agenda'&&!currentProfileSettings().modules.agenda)CURRENT_VIEW='dashboard';
    return baseRenderView(entry);
  };

  function screenBand(){return window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';}
  function dashboardLayoutStore(){
    const settings=currentProfileSettings();settings.dashboardLayouts=settings.dashboardLayouts||{};
    const band=screenBand();if(!settings.dashboardLayouts[band])settings.dashboardLayouts[band]=band==='desktop'&&Object.keys(settings.dashboardLayout||{}).length?clone(settings.dashboardLayout):{};
    return settings.dashboardLayouts[band];
  }
  function formLayoutKey(base){return `${base}:${screenBand()}`;}
  function widgetLayout(id,index){
    const saved=dashboardLayoutStore()[id]||{};
    const defaultSpan=Math.max(3,Math.round(12/dashboardColumnCount()));
    return {order:Number.isFinite(saved.order)?saved.order:index,span:saved.span||defaultSpan,height:saved.height||'auto'};
  }
  function pushDashboardHistory(){DASHBOARD_LAYOUT_HISTORY.push(clone(dashboardLayoutStore()));if(DASHBOARD_LAYOUT_HISTORY.length>30)DASHBOARD_LAYOUT_HISTORY.shift();}
  function widgetControls(id){return `<div class="widget-edit-controls"><button type="button" data-action="widget-move" data-id="${id}" data-dir="-1" title="Mover para cima">↑</button><button type="button" data-action="widget-move" data-id="${id}" data-dir="1" title="Mover para baixo">↓</button><button type="button" data-action="widget-width" data-id="${id}" data-dir="-1" title="Diminuir largura">− L</button><button type="button" data-action="widget-width" data-id="${id}" data-dir="1" title="Aumentar largura">+ L</button><button type="button" data-action="widget-height" data-id="${id}" data-dir="1" title="Alternar altura">↕</button></div>`;}
  function dashboardWidget(id,title,subtitle,body,index){const l=widgetLayout(id,index);return `<section class="card dashboard-widget" draggable="${DASHBOARD_LAYOUT_EDIT?'true':'false'}" data-widget-id="${id}" style="--widget-order:${l.order};--widget-span:${l.span};--widget-height:${l.height}">${widgetControls(id)}<div class="card-header"><div><h2>${title}</h2><p>${subtitle}</p></div></div><div class="widget-scroll">${body}</div></section>`;}

  function dashboardColumnCount(){
    const s=currentProfileSettings(),band=screenBand();s.dashboardColumns=s.dashboardColumns||{};
    const fallback=band==='mobile'?1:band==='tablet'?2:3;
    return Math.max(1,Math.min(4,num(s.dashboardColumns[band])||fallback));
  }
  function revenueBucketKey(date,period){
    const raw=String(date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return '';
    if(period==='year')return raw.slice(0,4);
    if(period==='day')return raw;
    return raw.slice(0,7);
  }
  function revenueBucketLabel(key,period){
    if(period==='year')return key;
    if(period==='day')return String(key).slice(8,10);
    const [y,m]=String(key).split('-');return m&&y?new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(Number(y),Number(m)-1,1)).replace('.',''):key;
  }
  function revenueMonthLongLabel(key){
    const [y,m]=String(key||'').split('-');
    return m&&y?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(Number(y),Number(m)-1,1)):String(key||'');
  }
  function revenueRangeYears255(years){
    const current=Number(today().slice(0,4)),parsed=years.map(Number).filter(Number.isFinite).sort((a,b)=>a-b);
    if(!parsed.length)return [String(current)];
    const first=parsed[0],last=parsed.at(-1),result=[];
    for(let year=first;year<=last;year++)result.push(String(year));
    return result;
  }
  function dashboardRevenueModel(){
    const s=currentProfileSettings(),period=['day','month','year'].includes(s.dashboardRevenuePeriod)?s.dashboardRevenuePeriod:'month';
    const eligible=(data().payments||[]).filter(payment=>!paymentIsCancelled(payment)&&paymentIsPaid(payment));
    const dateOf=payment=>String(payment.paymentDate||payment.dueDate||payment.createdAt||'').slice(0,10);
    const validDates=eligible.map(dateOf).filter(date=>/^\d{4}-\d{2}-\d{2}$/.test(date));
    const years=revenueRangeYears255([...new Set(validDates.map(date=>date.slice(0,4)))]);
    const currentYear=today().slice(0,4);
    const selectedYear=years.includes(String(s.dashboardRevenueYear||''))?String(s.dashboardRevenueYear):years.includes(currentYear)?currentYear:years.at(-1);
    const dataMonths=[...new Set(validDates.filter(date=>date.startsWith(`${selectedYear}-`)).map(date=>date.slice(0,7)))].sort();
    const currentMonth=today().slice(0,7);
    let selectedMonth=String(s.dashboardRevenueMonth||'');
    if(!selectedMonth.startsWith(`${selectedYear}-`))selectedMonth=dataMonths.includes(currentMonth)?currentMonth:(dataMonths.at(-1)||`${selectedYear}-01`);
    const daysInMonth=new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7)),0).getDate()||31;
    let selectedDay=String(s.dashboardRevenueDay||'');
    const currentDay=today();
    if(!selectedDay.startsWith(`${selectedMonth}-`))selectedDay=currentDay.startsWith(`${selectedMonth}-`)?currentDay:`${selectedMonth}-01`;
    if(Number(selectedDay.slice(8,10))>daysInMonth)selectedDay=`${selectedMonth}-${String(daysInMonth).padStart(2,'0')}`;

    s.dashboardRevenuePeriod=period;s.dashboardRevenueYear=selectedYear;s.dashboardRevenueMonth=selectedMonth;s.dashboardRevenueDay=selectedDay;
    const keys=period==='year'?years:period==='month'?Array.from({length:12},(_,index)=>`${selectedYear}-${String(index+1).padStart(2,'0')}`):Array.from({length:daysInMonth},(_,index)=>`${selectedMonth}-${String(index+1).padStart(2,'0')}`);
    const receiptMap=new Map(),expenseMap=new Map(),taxMap=new Map(),serviceMap=new Map(),productMap=new Map(),methodMap=new Map(),serviceMethodMap=new Map();
    const add=(map,key,value)=>{if(key)map.set(key,(map.get(key)||0)+num(value));};
    const addMethod=(map,key,method,value)=>{if(!key)return;const methods=map.get(key)||new Map(),label=String(method||'Não informado').trim()||'Não informado';methods.set(label,(methods.get(label)||0)+num(value));map.set(key,methods);};
    for(const payment of eligible){
      const date=dateOf(payment);if(!/^\d{4}-\d{2}-\d{2}$/.test(date))continue;
      if(period==='month'&&date.slice(0,4)!==selectedYear)continue;
      if(period==='day'&&date.slice(0,7)!==selectedMonth)continue;
      const key=revenueBucketKey(date,period);if(!keys.includes(key))continue;
      const type=normalizeText(payment.type),value=num(payment.value),fee=num(payment.fee);
      if(type==='despesa'){if(/imposto|taxa|tribut/.test(normalizeText(payment.category||payment.notes)))add(taxMap,key,value);else add(expenseMap,key,value);continue;}
      add(receiptMap,key,value);add(taxMap,key,fee);addMethod(methodMap,key,payment.paymentMethod||payment.method||payment.form,value);
      const order=findOrder(payment.orderId),items=order?orderItems(order.id):[];
      const serviceTotal=items.filter(x=>normalizeText(x.type)==='servico').reduce((sum,x)=>sum+num(x.subtotal),0);
      const productTotal=items.filter(x=>normalizeText(x.type)==='produto').reduce((sum,x)=>sum+num(x.subtotal),0);
      const base=serviceTotal+productTotal,serviceValue=base>0?value*(serviceTotal/base):value;
      if(base>0){add(serviceMap,key,serviceValue);add(productMap,key,value*(productTotal/base));}else add(serviceMap,key,serviceValue);
      addMethod(serviceMethodMap,key,payment.paymentMethod||payment.method||payment.form,serviceValue);
    }
    const preferred=period==='year'?selectedYear:period==='month'?selectedMonth:selectedDay;
    const selected=keys.includes(preferred)?preferred:keys.at(-1)||'';
    s.dashboardRevenueSelected=selected;
    const points=keys.map(key=>({key,label:revenueBucketLabel(key,period),revenue:receiptMap.get(key)||0,service:serviceMap.get(key)||0,product:productMap.get(key)||0,expenses:expenseMap.get(key)||0,taxes:taxMap.get(key)||0,methods:[...(methodMap.get(key)||new Map()).entries()].sort((a,b)=>b[1]-a[1]),serviceMethods:[...(serviceMethodMap.get(key)||new Map()).entries()].sort((a,b)=>b[1]-a[1])}));
    const selectedPoint=points.find(x=>x.key===selected)||{key:'',label:'Sem dados',revenue:0,service:0,product:0,expenses:0,taxes:0,methods:[],serviceMethods:[]};
    const context=period==='year'?'Selecione um ano para abrir os meses.':period==='month'?`Ano selecionado: ${selectedYear}`:`Mês selecionado: ${revenueMonthLongLabel(selectedMonth)}`;
    return {period,selected,selectedYear,selectedMonth,selectedDay,points,selectedPoint,context};
  }
  function compositionRows255(parts){const max=Math.max(1,...parts.map(x=>num(x[1])));return parts.map(([label,value])=>`<div class="composition-row-v255"><span>${esc(label)}</span><div><i style="--composition-width:${Math.round(num(value)/max*100)}%"></i></div><b>${currency(value)}</b></div>`).join('');}
  function servicePaymentRows255(entries=[]){
    const standard=new Map([['Pix',0],['Débito',0],['Dinheiro',0],['Crédito',0]]),extras=new Map();
    for(const [rawLabel,rawValue] of entries||[]){
      const label=String(rawLabel||'Não informado').trim()||'Não informado',key=normalizeText(label),value=num(rawValue);
      const canonical=key.includes('pix')?'Pix':key.includes('debito')?'Débito':key.includes('dinheiro')||key.includes('especie')?'Dinheiro':key.includes('credito')?'Crédito':'';
      if(canonical)standard.set(canonical,(standard.get(canonical)||0)+value);else extras.set(label,(extras.get(label)||0)+value);
    }
    return [...standard.entries(),...extras.entries()].sort((a,b)=>{const base=['Pix','Débito','Dinheiro','Crédito'],ai=base.indexOf(a[0]),bi=base.indexOf(b[0]);if(ai>=0||bi>=0)return (ai<0?99:ai)-(bi<0?99:bi);return num(b[1])-num(a[1])||String(a[0]).localeCompare(String(b[0]),'pt-BR');});
  }
  function dashboardRevenueBody(){
    const model=dashboardRevenueModel(),max=Math.max(1,...model.points.map(x=>x.revenue));
    const chart=model.points.length?`<div class="revenue-chart-v255" role="group" aria-label="Gráfico de faturamento">${model.points.map(x=>`<button type="button" class="revenue-bar-column-v255 ${x.key===model.selected?'is-selected':''}" data-action="dashboard-revenue-select" data-key="${attr(x.key)}" title="${attr(x.key)} · ${attr(currency(x.revenue))}"><span class="revenue-bar-v255" style="--revenue-height:${Math.max(4,Math.round(x.revenue/max*100))}%"></span><small>${esc(x.label)}</small></button>`).join('')}</div>`:'<div class="empty">Ainda não existem lançamentos para o período.</div>';
    const p=model.selectedPoint,categories=[['Receita de Serviços',p.service],['Receita de Produtos',p.product],['Despesas',p.expenses],['Impostos',p.taxes]],methods=servicePaymentRows255(p.serviceMethods);
    return `<div class="revenue-widget-v255"><div class="revenue-period-tabs-v255">${[['year','Ano'],['month','Mês'],['day','Dia']].map(([id,label])=>`<button type="button" class="${model.period===id?'active':''}" data-action="dashboard-revenue-period" data-period="${id}">${label}</button>`).join('')}</div><div class="revenue-filter-context-v260">${esc(model.context)}</div>${chart}<div class="revenue-scroll-controls-v260" aria-label="Navegar pelo gráfico"><button type="button" data-action="dashboard-revenue-scroll" data-dir="-1" title="Rolar gráfico para a esquerda" aria-label="Rolar gráfico para a esquerda">${icon('chevronLeft')}</button><button type="button" data-action="dashboard-revenue-scroll" data-dir="1" title="Rolar gráfico para a direita" aria-label="Rolar gráfico para a direita">${icon('chevronRight')}</button></div><div class="revenue-breakdowns-v255"><div class="revenue-composition-v255 revenue-breakdown-v255"><div class="composition-heading-v255"><strong>Composição financeira</strong><span>${currency(p.revenue)}</span></div>${compositionRows255(categories)}</div><div class="revenue-composition-v255 revenue-breakdown-v255"><div class="composition-heading-v255"><strong>Formas de pagamento</strong><span>${currency(p.service)}</span></div>${compositionRows255(methods)}</div></div></div>`;
  }


  renderDashboard = function(){
    const d=data(),month=today().slice(0,7),orders=d.serviceOrders.filter(orderNotCancelled),open=orders.filter(o=>!['concluida','cancelada'].includes(normalizeText(o.status)));
    const paidMonth=d.payments.filter(p=>normalizeText(p.type)==='receita'&&paymentIsPaid(p)&&monthKey(p.paymentDate)===month&&!isCancelledOrder(findOrder(p.orderId))).reduce((sum,p)=>sum+num(p.value),0);
    const expenses=d.payments.filter(p=>normalizeText(p.type)==='despesa'&&paymentIsPaid(p)&&monthKey(p.paymentDate)===month).reduce((sum,p)=>sum+num(p.value),0);
    const receivables=orders.map(o=>({order:o,client:findClient(o.clientId),...orderFinancialInfo(o)})).filter(x=>x.balance>.005).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    const receivableTotal=receivables.reduce((sum,x)=>sum+x.balance,0),receivableClients=new Set(receivables.map(x=>x.order.clientId||x.order.clientName).filter(Boolean)).size;
    const low=lowStockItems(),critical=low.filter(x=>x.health.level==='critical').length,warning=low.filter(x=>x.health.level==='warning').length,agendaOn=currentProfileSettings().modules.agenda;
    const appts=agendaOn?d.appointments.filter(a=>a.date===today()&&normalizeText(a.status)!=='cancelado').sort((a,b)=>(a.time||'').localeCompare(b.time||'')):[];
    const recent=[...orders].sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||'')).slice(0,8);
    const kpis=[
      `<div class="card kpi"><div class="kpi-icon blue">${icon('orders')}</div><div><small>Ordens abertas</small><strong>${privacy(open.length)}</strong><div class="delta">${orders.length} OSVs ativas</div></div></div>`,
      `<div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receitas no mês</small><strong>${privacy(currency(paidMonth))}</strong><div class="delta">Saldo ${privacy(currency(paidMonth-expenses))}</div></div></div>`,
      `<div class="card kpi"><div class="kpi-icon orange">${icon('finance')}</div><div><small>Valores a receber</small><strong>${privacy(currency(receivableTotal))}</strong><div class="delta">${receivableClients} ${receivableClients===1?'cliente':'clientes'}</div></div></div>`,
      `<div class="card kpi"><div class="kpi-icon red">${icon('stock')}</div><div><small>Estoque crítico</small><strong>${privacy(critical)}</strong><div class="delta">${warning} em atenção</div></div></div>`,
      agendaOn?`<div class="card kpi"><div class="kpi-icon blue">${icon('agenda')}</div><div><small>Agenda de hoje</small><strong>${privacy(appts.length)}</strong><div class="delta">${appts.filter(a=>normalizeText(a.status)==='confirmado').length} confirmados</div></div></div>`:''
    ].filter(Boolean).join('');
    const recentBody=recent.length?`<div class="list">${recent.map(o=>`<button class="list-row" data-action="view-order" data-id="${attr(o.id)}"><div class="list-row-main"><strong>${esc(o.id)} · ${esc(o.clientName||findClient(o.clientId)?.name||'Cliente')}</strong><small>${esc(o.equipmentType||'Equipamento não informado')} · ${esc(o.brandModel||'Sem marca/modelo')}</small></div><div class="list-row-side">${statusBadge(o.status)}<small>${currency(o.total)}</small></div></button>`).join('')}</div>`:'<div class="empty">Nenhuma OSV cadastrada.</div>';
    const receiveBody=receivables.length?`<div class="list">${receivables.slice(0,12).map(x=>`<div class="list-row clickable-dashboard-row-v255" data-action="view-order" data-id="${attr(x.order.id)}"><div class="list-row-main"><strong>${esc(x.order.id)} · ${esc(x.client?.name||x.order.clientName||'Cliente')}</strong><small>${x.dueDate?`Vencimento ${formatDate(x.dueDate)}`:'Sem vencimento combinado'} · saldo ${currency(x.balance)}</small></div>${statusBadge(x.status==='Parcial'&&x.overdue?'Parcial - vencido':x.status)}<div class="actions dashboard-row-actions-v255"><button data-action="new-payment" data-order="${attr(x.order.id)}" title="Adicionar pagamento">${icon('plus')}</button><button data-action="view-current-pdf" data-id="${attr(x.order.id)}" title="Visualizar PDF">${icon('pdf')}</button><button data-action="share-order" data-id="${attr(x.order.id)}" title="Enviar PDF pelo WhatsApp">${icon('phone')}</button><button data-action="view-client" data-id="${attr(x.order.clientId)}" title="Abrir cliente">${icon('clients')}</button></div></div>`).join('')}</div>`:'<div class="empty">Nenhum cliente com saldo pendente.</div>';
    const stockBody=low.length?`<div class="list">${low.slice(0,12).map(x=>{const item=x.type==='Produto'?d.products.find(p=>p.id===x.id):d.supplies.find(p=>p.id===x.id);const action=x.type==='Produto'?'edit-product':'edit-supply';return `<button class="list-row stock-alert-row-v255" data-action="${action}" data-id="${attr(x.id)}"><div class="list-row-main"><strong>${esc(x.name)}</strong><small>${esc(x.type)} · ${esc(item?.supplier||'Fornecedor não informado')}</small><small>Mínimo ${num(x.min)} · Estoque ${num(x.stock)} <span class="stock-health-badge ${x.health.tone}">${esc(x.health.label)}</span></small></div></button>`;}).join('')}</div>`:'<div class="empty">Nenhum item em nível crítico ou de atenção.</div>';
    const agendaBody=agendaOn?(appts.length?appts.map(a=>`<div class="list-row"><div class="badge blue">${esc(a.time||'--:--')}</div><div class="list-row-main"><strong>${esc(a.title||a.clientName||'Compromisso')}</strong><small>${esc(a.location||'Sem local')}</small></div>${statusBadge(a.status||'Agendado')}</div>`).join(''):'<div class="empty">Nenhum compromisso para hoje.</div>'):'';
    const widgets=[dashboardWidget('recent','Ordens recentes','Últimas movimentações da assistência.',recentBody,0),dashboardWidget('receivables','Clientes a receber','Saldos em aberto, vencidos e parciais.',receiveBody,1),dashboardWidget('stock-alerts','Alertas de estoque','Produtos e insumos no mínimo.',stockBody,2),dashboardWidget('revenue','Faturamento','Análise por período e composição financeira.',dashboardRevenueBody(),3)];
    if(agendaOn)widgets.splice(1,0,dashboardWidget('today-agenda','Agenda de hoje','Compromissos e visitas técnicas.',agendaBody,1));
    const columns=dashboardColumnCount();
    const editButton=!DASHBOARD_LAYOUT_EDIT?`<div class="hero-clock-actions-v255"><button class="dashboard-edit-icon-v255" data-action="toggle-dashboard-layout" title="Editar módulos" aria-label="Editar módulos">${icon('edit')}</button></div>`:'';
    const editToolbar=DASHBOARD_LAYOUT_EDIT?`<div class="dashboard-layout-toolbar dashboard-toolbar-v255"><button class="btn primary compact" data-action="save-dashboard-layout">Salvar</button><button class="btn secondary compact" data-action="cancel-dashboard-layout">Cancelar</button><button class="btn ghost compact" data-action="undo-dashboard-layout" ${DASHBOARD_LAYOUT_HISTORY.length?'':'disabled'}>Desfazer</button><button class="btn ghost compact" data-action="reset-dashboard-layout">Restaurar padrão</button><label class="dashboard-columns-select-v255">Colunas <select data-dashboard-columns><option value="1" ${columns===1?'selected':''}>1</option><option value="2" ${columns===2?'selected':''}>2</option><option value="3" ${columns===3?'selected':''}>3</option><option value="4" ${columns===4?'selected':''}>4</option></select></label><span class="muted">Arraste ou use os controles.</span></div>`:'';
    return `<section class="hero hero-compact-v255"><div class="hero-content"><div><h2>Olá, ${esc(activeProfile().name)}.</h2><p>OSVs, clientes a receber e estoque em um só fluxo.</p></div><div class="hero-clock"><strong id="live-clock">--:--</strong><small id="live-date"></small>${editButton}</div></div></section>${editToolbar}<div class="grid kpis pts-kpis">${kpis}</div><div class="dashboard-widget-grid ${DASHBOARD_LAYOUT_EDIT?'layout-editing':''}" data-layout-container="dashboard" style="--dashboard-columns:${columns}">${widgets.join('')}</div>`;
  };

  function periodState(section){
    const s=currentProfileSettings();s.periodFilters=s.periodFilters||{};
    s.periodFilters[section]=s.periodFilters[section]||{month:'',days:''};
    return s.periodFilters[section];
  }
  function parsedDayRange(value){
    const raw=String(value||'').trim();if(!raw)return null;
    const match=raw.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);if(!match)return null;
    const start=Math.max(1,Math.min(31,num(match[1]))),end=Math.max(start,Math.min(31,num(match[2]||match[1])));
    return {start,end};
  }
  function matchesUnifiedPeriod(value,section){
    const filter=periodState(section),date=String(value||'').slice(0,10);
    if(!filter.month)return true;if(date.slice(0,7)!==filter.month)return false;
    const range=parsedDayRange(filter.days);if(!range)return true;
    const day=num(date.slice(8,10));return day>=range.start&&day<=range.end;
  }
  function unifiedPeriodControls(section){
    const filter=periodState(section);
    return `<div class="period-filter-v255" data-period-section="${attr(section)}"><span class="period-filter-label-v255">${icon('agenda',17)}<b>Data</b></span><input class="filter-control" type="month" data-period-month="${attr(section)}" value="${attr(filter.month)}" aria-label="Mês e ano"><input class="filter-control period-days-v255" type="text" inputmode="numeric" data-period-days="${attr(section)}" value="${attr(filter.days)}" placeholder="Dias 10-31" aria-label="Intervalo opcional de dias"><button type="button" class="icon-btn period-clear-v255" data-action="clear-unified-period" data-section="${attr(section)}" title="Limpar período" aria-label="Limpar período">🧹</button></div>`;
  }
  function orderMatchesTemporal(order){return matchesUnifiedPeriod(order.openedAt||order.createdAt,'orders');}
  function temporalControls(){return unifiedPeriodControls('orders');}
  function quickOrderActions(order){
    return `<details class="quick-actions"><summary aria-label="Ações rápidas">${icon('menu',18)}</summary><div class="quick-actions-menu"><button data-action="new-payment" data-order="${attr(order.id)}">${icon('finance',16)} Adicionar pagamento</button><button data-action="generate-pdf-background" data-id="${attr(order.id)}">${icon('pdf',16)} Gerar PDF</button><button data-action="view-current-pdf" data-id="${attr(order.id)}">${icon('eye',16)} Visualizar PDF</button><button data-action="share-order" data-id="${attr(order.id)}">${icon('phone',16)} Enviar PDF</button><button data-action="view-client" data-id="${attr(order.clientId)}">${icon('clients',16)} Abrir cliente</button><button data-action="edit-order" data-id="${attr(order.id)}">${icon('edit',16)} Editar OSV</button></div></details>`;
  }
  renderOrders = function(){
    const mode=getViewMode('orders'),all=[...data().serviceOrders].filter(o=>matches(o.id,o.clientName,findClient(o.clientId)?.name,o.equipmentType,o.brandModel,o.status,o.reportedIssue));
    const rows=all.filter(o=>(SHOW_ARCHIVED.orders?o.registrationStatus==='Inativo':o.registrationStatus!=='Inativo')&&orderMatchesTemporal(o)).sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||''));
    const filtered=ORDER_FILTERS.status==='Todos'?rows:rows.filter(o=>normalizeText(o.status)===normalizeText(ORDER_FILTERS.status));
    const archived=all.filter(o=>o.registrationStatus==='Inativo').length;
    return `<div class="toolbar orders-toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-order">+ Nova OSV</button><div class="mobile-filter-panel"><select id="order-status-filter" class="filter-control"><option>Todos</option>${OPERATIONAL_STATUSES.map(v=>`<option ${v===ORDER_FILTERS.status?'selected':''}>${v}</option>`).join('')}</select>${temporalControls()}</div><button class="btn secondary" data-action="toggle-archived-orders">${SHOW_ARCHIVED.orders?'Ver ativas':`Arquivadas (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('orders',mode)}<span class="badge blue">${filtered.length} OSVs</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="orders"><div class="table-wrap"><table class="table osv-table"><thead><tr><th>OSV</th><th>Abertura</th><th>Cliente</th><th>Equipamento</th><th>Financeiro</th><th>Status</th><th class="text-right">Valor</th><th>Ações</th></tr></thead><tbody>${filtered.map(o=>{const f=orderFinancialInfo(o);return `<tr><td><button class="code-link" data-action="view-order" data-id="${attr(o.id)}"><strong>${esc(o.id)}</strong></button>${o.registrationStatus==='Inativo'?'<small class="muted">Arquivada</small>':''}</td><td>${formatDate(o.openedAt)}</td><td><button class="text-link" data-action="view-client" data-id="${attr(o.clientId)}">${esc(o.clientName||findClient(o.clientId)?.name||'—')}</button></td><td><strong>${esc(o.equipmentType||'—')}</strong><small class="muted">${esc(o.brandModel||'')}</small></td><td>${statusBadge(f.status==='Parcial'&&f.overdue?'Parcial - vencido':f.status)}<small class="muted">${f.balance>0?currency(f.balance)+' pendente':''}</small></td><td><div class="inline-status-shell" data-status-tone="${attr(normalizeText(o.status))}"><select class="inline-status" data-quick-order-status="${attr(o.id)}" aria-label="Status operacional da OSV ${attr(o.id)}">${OPERATIONAL_STATUSES.map(s=>`<option value="${attr(s)}" ${s===o.status?'selected':''}>${esc(s)}</option>`).join('')}</select><span class="inline-status-chevron" aria-hidden="true">${icon('arrow',14)}</span><span class="inline-status-saving" aria-hidden="true"></span></div></td><td class="text-right"><strong>${currency(o.total)}</strong></td><td>${quickOrderActions(o)}</td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhuma OSV encontrada.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function firstName(name){return normalizeText(name).split(' ')[0]||'';}
  function sortedActiveClients(query=''){
    const q=normalizeText(query);
    return activeItems(data().clients).slice().sort((a,b)=>{
      if(q){const af=firstName(a.name),bf=firstName(b.name),ae=af===q,be=bf===q;if(ae!==be)return ae?-1:1;const ap=af.startsWith(q),bp=bf.startsWith(q);if(ap!==bp)return ap?-1:1;}
      return String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'});
    });
  }
  function clientSelectOptions(selected=''){return `<option value="__new__">+ Adicionar novo cliente</option><option value="" ${selected?'':'selected'}>Selecione um cliente</option>${sortedActiveClients().map(c=>`<option value="${attr(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)} · ${esc(c.id)}</option>`).join('')}`;}
  function equipmentTypeOptions(selected=''){return [...EQUIPMENT_TYPES,...currentProfileSettings().equipmentTypes.filter(x=>!EQUIPMENT_TYPES.some(y=>normalizeText(y)===normalizeText(x)))].map(x=>`<option value="${attr(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('');}

  itemReferenceOptions = function(type,selected=''){
    const list=type==='Produto'?data().products:type==='Insumo'?data().supplies:data().services;
    return `<option value="">Selecione</option>${activeItems(list).sort((a,b)=>String(a.description||a.name||'').localeCompare(String(b.description||b.name||''),'pt-BR')).map(x=>`<option value="${attr(x.id)}" ${x.id===selected?'selected':''}>${esc(x.description||x.name||x.id)}</option>`).join('')}`;
  };
  orderItemRow = function(it={}){
    const type=it.type==='Produto'?'Produto':'Serviço',ref=it.productId||it.serviceId||'';
    const unit=window.MarcoMoney?.formatNumber(num(it.unitPrice))||currency(num(it.unitPrice));
    const subtotal=window.MarcoMoney?.formatNumber(num(it.subtotal)||num(it.quantity)*num(it.unitPrice))||currency(num(it.subtotal)||num(it.quantity)*num(it.unitPrice));
    return `<div class="item-editor-row" draggable="false" data-item-id="${attr(it.id||'')}" data-table-price="${attr(num(it.tablePrice)||itemTablePrice(type,ref))}" data-unit-cost="${attr(type==='Produto'?(Number.isFinite(Number(it.unitCost))?num(it.unitCost):num(data().products.find(product=>product.id===ref)?.cost)):0)}"><div class="item-reorder-controls" aria-label="Reordenar item pelas setas"><button type="button" data-action="move-item-row" data-dir="-1" title="Mover para cima" aria-label="Mover item para cima">↑</button><button type="button" data-action="move-item-row" data-dir="1" title="Mover para baixo" aria-label="Mover item para baixo">↓</button></div><div class="field item-type"><label>Tipo</label><select data-item-field="type"><option ${type==='Serviço'?'selected':''}>Serviço</option><option ${type==='Produto'?'selected':''}>Produto</option></select></div><div class="field item-name"><label>Item</label><select data-item-field="ref">${itemReferenceOptions(type,ref)}</select></div><div class="field item-qty"><label>Qtd.</label><input type="number" step="${type==='Produto'?'1':'0.01'}" min="${type==='Produto'?'1':'0.01'}" data-item-field="qty" value="${attr(it.quantity||1)}"></div><div class="field item-price money-field"><label>Valor unit.</label><input type="text" inputmode="numeric" data-money="true" data-item-field="price" value="${attr(unit)}"></div><div class="field item-subtotal money-field"><label>Subtotal</label><input type="text" inputmode="numeric" data-money="true" readonly data-item-field="subtotal" value="${attr(subtotal)}"></div><label class="stock-check ${type==='Serviço'?'is-hidden':''}"><span>Baixar<br>estoque</span><input type="checkbox" data-item-field="stock" ${it.lowerStock?'checked':''} ${type==='Serviço'?'disabled':''}></label><button type="button" class="icon-btn danger item-remove" data-action="remove-item-row" title="Remover item">${icon('trash')}</button></div>`;
  };
  updateItemReference = function(row){
    const type=$('[data-item-field="type"]',row).value,ref=$('[data-item-field="ref"]',row),stockWrap=$('.stock-check',row),stock=$('[data-item-field="stock"]',row),qty=$('[data-item-field="qty"]',row);
    ref.innerHTML=itemReferenceOptions(type);stockWrap?.classList.toggle('is-hidden',type==='Serviço');stock.disabled=type==='Serviço';if(type==='Serviço')stock.checked=false;if(qty){qty.step=type==='Produto'?'1':'0.01';qty.min=type==='Produto'?'1':'0.01';if(type==='Produto'&&num(qty.value)<1)qty.value='1';}updateItemPrice(row);
  };
  updateItemPrice = function(row){
    const type=$('[data-item-field="type"]',row).value,id=$('[data-item-field="ref"]',row).value,price=$('[data-item-field="price"]',row);let value=0;
    if(type==='Produto')value=num(data().products.find(x=>x.id===id)?.salePrice);else value=num(data().services.find(x=>x.id===id)?.price);
    row.dataset.tablePrice=String(value);row.dataset.unitCost=String(type==='Produto'?num(data().products.find(product=>product.id===id)?.cost):0);if(id)window.MarcoMoney?.setValue(price,value);updateOrderFormTotal();
  };
  function itemTablePrice(type,ref){const catalog=type==='Produto'?data().products.find(x=>x.id===ref):data().services.find(x=>x.id===ref);return type==='Produto'?num(catalog?.salePrice):num(catalog?.price);}
  function orderFormFinancialBreakdown(form=document.querySelector('form[data-form="order"]')){
    const out={services:0,products:0,productCost:0,productGrossProfit:0,itemDiscount:0,generalDiscount:0,total:0};
    if(!form)return out;
    $$('.item-editor-row',form).forEach(row=>{const type=$('[data-item-field="type"]',row)?.value==='Produto'?'Produto':'Serviço',ref=$('[data-item-field="ref"]',row)?.value||'',q=Math.max(0,num($('[data-item-field="qty"]',row)?.value)),sold=Math.max(0,num($('[data-item-field="price"]',row)?.value)),table=Math.max(0,num(row.dataset.tablePrice)||itemTablePrice(type,ref));const subtotal=q*sold;if(type==='Produto'){const rawUnitCost=Number(row.dataset.unitCost),unitCost=Math.max(0,Number.isFinite(rawUnitCost)?rawUnitCost:num(data().products.find(x=>x.id===ref)?.cost));out.products+=subtotal;out.productCost+=q*unitCost;out.productGrossProfit+=subtotal-q*unitCost;}else out.services+=subtotal;out.itemDiscount+=Math.max(0,(table-sold)*q);});
    out.generalDiscount=Math.max(0,num(form.elements.discount?.value));out.total=Math.max(0,out.services+out.products-out.generalDiscount);return out;
  }
  function orderFormFinalValue(form=document.querySelector('form[data-form="order"]')){return orderFormFinancialBreakdown(form).total;}
  function paymentRowsValue(form,exclude=null){return $$('.payment-editor-row',form).filter(row=>row!==exclude).reduce((sum,row)=>sum+Math.max(0,num($('[data-payment-field="value"]',row)?.value)),0);}
  function suggestedPaymentValue(form,exclude=null){return Math.max(0,orderFormFinalValue(form)-paymentRowsValue(form,exclude));}
  function syncSuggestedPaymentRows(form=document.querySelector('form[data-form="order"]')){$$('.payment-editor-row[data-payment-auto-suggested="true"]',form).forEach(row=>{if(row.dataset.paymentManual==='true'||row.dataset.paymentId)return;const input=$('[data-payment-field="value"]',row);window.MarcoMoney?.setValue(input,suggestedPaymentValue(form,row));});refreshPaymentRows();}
  updateOrderFormTotal = function(){
    const form=$('form[data-form="order"]');if(!form)return;
    $$('.item-editor-row',form).forEach(row=>{const q=num($('[data-item-field="qty"]',row)?.value),p=num($('[data-item-field="price"]',row)?.value),sub=q*p;const el=$('[data-item-field="subtotal"]',row);if(el)window.MarcoMoney?.setValue(el,sub);});
    const f=orderFormFinancialBreakdown(form),gross=f.services+f.products;
    const set=(id,value)=>{const el=$(id);if(el)el.textContent=currency(value);};
    set('#order-form-services',f.services);set('#order-form-products',f.products);set('#order-form-product-cost',f.productCost);set('#order-form-product-profit',f.productGrossProfit);set('#order-form-item-discount',f.itemDiscount);set('#order-form-general-discount',f.generalDiscount);set('#order-form-gross',gross);set('#order-form-total',f.total);
    const itemHint=$('#items-empty-hint');if(itemHint)itemHint.classList.toggle('is-hidden',$$('.item-editor-row',form).length>0);
    syncSuggestedPaymentRows(form);
  };

  function paymentEditorRow(p={}){
    const method=p.paymentMethod||'Pix',status=recordFinancialStatus(p),planned=!!p.dueDate&&!p.paymentDate,auto=p.__suggested===true&&!p.id;
    const paymentDate=p.paymentDate||(!p.id&&!p.dueDate?today():'');
    const value=window.MarcoMoney?.formatNumber(num(p.value))||currency(num(p.value)),grossValue=Math.max(num(p.value),num(p.grossValue)||num(p.value)+num(p.fee)),gross=window.MarcoMoney?.formatNumber(grossValue)||currency(grossValue);
    return `<div class="payment-editor-row" data-payment-id="${attr(p.id||'')}" data-payment-auto-suggested="${auto?'true':'false'}" data-payment-manual="${p.id?'true':'false'}"><div class="payment-row-main"><div class="field money-field"><label>Valor líquido</label><input type="text" inputmode="numeric" data-money="true" data-payment-field="value" value="${attr(value)}"></div><div class="field"><label>Forma de pagamento</label><select data-payment-field="method">${PAYMENT_METHODS.map(x=>`<option ${x===method?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Data do pagamento</label><input type="date" data-payment-field="paymentDate" value="${attr(paymentDate)}"></div><label class="check-field"><input type="checkbox" data-payment-field="planned" ${planned?'checked':''}><span>Pagamento com data combinada</span></label><div class="field due-field ${planned?'':'is-hidden'}"><label>Data de vencimento</label><input type="date" data-payment-field="dueDate" value="${attr(p.dueDate||'')}"><small class="inline-field-error" data-payment-due-error hidden>Informe a data de vencimento do pagamento combinado.</small></div></div><div class="payment-row-secondary"><div class="field money-field fee-field ${/débito|crédito|outro/i.test(method)?'':'is-hidden'}"><label>Valor com taxa</label><input type="text" inputmode="numeric" data-money="true" data-payment-field="fee" data-gross-value-input="true" value="${attr(gross)}"></div><div class="field payment-note"><label>Observação</label><input data-payment-field="notes" value="${attr(p.notes||'')}"></div><div class="payment-status-box"><small>Status</small><span data-payment-status>${statusBadge(status)}</span></div><div class="payment-gross-box"><small>Valor com taxa</small><strong data-payment-gross>${currency(grossValue)}</strong></div><button type="button" class="icon-btn danger payment-delete" data-action="remove-payment-row" title="Cancelar/remover pagamento">${icon('trash')}</button></div></div>`;
  }
  function orderDraftFromForm(form){
    const values=Object.fromEntries(new FormData(form));
    values.items=$$('.item-editor-row',form).map(row=>({id:row.dataset.itemId,type:$('[data-item-field="type"]',row).value,ref:$('[data-item-field="ref"]',row).value,quantity:$('[data-item-field="qty"]',row).value,unitPrice:$('[data-item-field="price"]',row).value,lowerStock:$('[data-item-field="stock"]',row)?.checked}));
    values.payments=$$('.payment-editor-row',form).map(row=>readPaymentRow(row));values.paymentDeleteIds=[...(form.__pendingPaymentDeletes||[])];values.__draft=true;values.__id=form.dataset.id||form.dataset.reservedCode||'';values.clientSearch=form.querySelector('[data-client-search]')?.value||'';return values;
  }
  function readPaymentRow(row){
    const g=key=>$(`[data-payment-field="${key}"]`,row);
    const paymentMethod=g('method')?.value||'Pix';
    const value=num(g('value')?.value),hasMachineFee=/d[eé]bito|cr[eé]dito|outro/i.test(paymentMethod),enteredGross=hasMachineFee?num(g('fee')?.value):value,grossValue=hasMachineFee?Math.max(value,enteredGross||value):value,fee=Math.max(0,grossValue-value);
    return {id:row.dataset.paymentId||'',value,paymentMethod,paymentDate:g('paymentDate')?.value||'',dueDate:g('planned')?.checked?(g('dueDate')?.value||''):'',fee,grossValue,notes:g('notes')?.value||''};
  }
  function renderPaymentRows(orderId,prefill){
    const list=prefill?.payments||(!prefill?.__draft&&orderId?orderPayments(orderId).filter(p=>normalizeText(p.type)==='receita'&&!paymentIsCancelled(p)):[]);
    return list.map(paymentEditorRow).join('');
  }

  function existingPhotoEditorHtml219(photos,orderId){
    if(!photos.length)return '<div class="empty compact-empty" data-existing-photo-empty>Nenhuma foto vinculada.</div>';
    return photos.map(meta=>`<article class="media-card edit-media-card" data-existing-media-card data-media-id="${attr(meta.id)}" data-media-kind="photo"><div class="edit-media-image-shell"><span class="media-loading" data-media-loading>Carregando…</span><img data-edit-media-image data-media-id="${attr(meta.id)}" alt="Foto vinculada à ${attr(orderId)}"></div><div class="edit-media-caption"><strong>${esc(meta.fileName||'Foto')}</strong><small>${meta.createdAt?formatDate(String(meta.createdAt).slice(0,10)):'Data não informada'}</small></div><div class="edit-media-actions"><button type="button" class="icon-btn" data-action="view-existing-media" data-media="${attr(meta.id)}" title="Visualizar foto" aria-label="Visualizar foto">${icon('eye',16)}</button><button type="button" class="icon-btn danger" data-action="stage-delete-existing-media" data-media="${attr(meta.id)}" title="Excluir foto" aria-label="Excluir foto">${icon('trash',16)}</button></div></article>`).join('');
  }
  function existingAttachmentEditorHtml219(attachments){
    if(!attachments.length)return '<div class="empty compact-empty" data-existing-attachment-empty>Nenhum anexo técnico vinculado.</div>';
    return attachments.map(meta=>`<div class="existing-attachment-row" data-existing-media-card data-media-id="${attr(meta.id)}" data-media-kind="attachment"><div><strong>${esc(meta.fileName||'Anexo técnico')}</strong><small>${meta.createdAt?formatDate(String(meta.createdAt).slice(0,10)):'Data não informada'}</small></div><div class="existing-attachment-actions"><button type="button" class="btn ghost compact" data-action="view-existing-media" data-media="${attr(meta.id)}">Visualizar</button><button type="button" class="btn secondary compact danger-text" data-action="stage-delete-existing-media" data-media="${attr(meta.id)}">Excluir</button></div></div>`).join('');
  }
  async function hydrateOrderFormMedia219(form){
    if(!form)return;form.__mediaObjectUrls=form.__mediaObjectUrls||[];
    for(const img of form.querySelectorAll('[data-edit-media-image]')){
      const card=img.closest('[data-existing-media-card]'),loading=card?.querySelector('[data-media-loading]'),found=findMedia(img.dataset.mediaId);
      try{
        const blob=found?await getMediaBlob(found.meta):null;
        if(!blob)throw new Error('Arquivo não disponível localmente nem no Drive.');
        const url=URL.createObjectURL(blob);form.__mediaObjectUrls.push(url);img.src=url;img.hidden=false;if(loading)loading.hidden=true;
      }catch(error){if(loading){loading.textContent='Não foi possível carregar';loading.dataset.error='true';}card?.classList.add('media-load-error');console.warn('Falha ao carregar miniatura:',error);}
    }
  }
  function releaseOrderFormMediaUrls219(form){for(const url of [...(form?.__mediaObjectUrls||[]),...(form?.__stagedPhotoUrls||[])])URL.revokeObjectURL(url);if(form){form.__mediaObjectUrls=[];form.__stagedPhotoUrls=[];}}
  async function stageExistingMediaDeletion219(form,mediaId){
    const found=findMedia(mediaId);if(!form||!found)return;
    const kind=found.meta.kind==='photo'?'foto':'anexo';
    if(!await confirmAction(`Remover esta ${kind} da OSV? A exclusão será confirmada quando a OSV for salva.`))return;
    form.__pendingMediaDeletes=form.__pendingMediaDeletes||new Set();form.__pendingMediaDeletes.add(mediaId);
    const card=form.querySelector(`[data-existing-media-card][data-media-id="${CSS.escape(mediaId)}"]`);if(card){card.hidden=true;card.dataset.pendingDelete='true';}
    const pending=form.querySelector('[data-pending-media-deletes]');if(pending){pending.hidden=false;pending.textContent=`${form.__pendingMediaDeletes.size} arquivo(s) marcado(s) para exclusão ao salvar.`;}
    markOrderPdfDirty219(form);scheduleOrderDraft219(form);
  }
  async function finalizePendingMediaDeletes219(order,removed){
    if(!removed.length)return {removed:0,pendingDrive:0};
    let pendingDrive=0;data().settings.pendingDriveCleanup=Array.isArray(data().settings.pendingDriveCleanup)?data().settings.pendingDriveCleanup:[];
    for(const meta of removed){
      if(meta.localKey)await MarcoStorage.deleteMedia(meta.localKey).catch(error=>console.warn('Falha ao excluir mídia local:',error));
      if(meta.driveFileId&&GoogleDriveMarco.isConfigured()){
        try{await GoogleDriveMarco.trash(meta.driveFileId);}
        catch(error){pendingDrive++;data().settings.pendingDriveCleanup.push({id:`cleanup_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,orderId:order.id,mediaId:meta.id,driveFileId:meta.driveFileId,fileName:meta.fileName||'',createdAt:nowIso(),error:String(error?.message||error)});}
      }
    }
    await persist(removed.some(x=>x.kind==='photo')?'Foto removida':'Anexo removido',`${order.id} · ${removed.length} arquivo(s) removido(s)${pendingDrive?` · ${pendingDrive} limpeza(s) do Drive pendente(s)`:''}`);
    if(pendingDrive)toast('A mídia foi removida da OSV, mas a limpeza no Google Drive ficou pendente.','warn');
    return {removed:removed.length,pendingDrive};
  }

  openOrderForm = function(id='',prefill={}){
    const existing=id?findOrder(id):null,draft=prefill?.__draft?prefill:null,o=existing||draft||prefill||{};
    const code=id||prefill.__id||nextCode('OSV',data().serviceOrders),selectedClient=o.clientId||'';
    const items=draft?.items?.map(x=>({id:x.id,type:x.type,productId:x.type==='Produto'?x.ref:'',serviceId:x.type==='Serviço'?x.ref:'',quantity:x.quantity,unitPrice:x.unitPrice,subtotal:num(x.quantity)*num(x.unitPrice),lowerStock:x.lowerStock}))||(existing?orderItems(id):[]);
    const photos=existing?.photos||[],attachments=existing?.attachments||[];
    const clientSearch=selectedClient?findClient(selectedClient)?.name||'':'';
    const viewPdfButton=existing?`<button type="button" class="btn secondary" data-action="view-current-pdf" data-id="${attr(existing.id)}">${icon('eye')} Visualizar PDF</button>`:`<button type="button" class="btn secondary" data-action="save-order-followup" data-followup="view-pdf">${icon('eye')} Visualizar PDF</button>`;
    openModal(existing?'Editar OSV':'Nova OSV',`<form class="osv-form" data-form="order" data-id="${attr(existing?.id||'')}" data-reserved-code="${attr(code)}"><input type="hidden" name="sourceAppointmentId" value="${attr(o.sourceAppointmentId||'')}"><div class="osv-code-preview"><span>Número reservado</span><strong>${esc(code)}</strong><button type="button" class="icon-btn" data-action="copy-code" data-code="${attr(code)}" title="Copiar código">${icon('documents')}</button></div><div class="form-grid order-general"><div class="field full client-picker"><label>Cliente *</label><div class="client-search-row"><input type="search" data-client-search role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="client-suggestions-${attr(code)}" autocomplete="off" placeholder="Digite o primeiro nome" value="${attr(clientSearch)}"><input type="hidden" name="clientId" value="${attr(selectedClient)}" data-client-id><div class="client-suggestions" id="client-suggestions-${attr(code)}" role="listbox" hidden></div><button type="button" class="btn secondary compact inline-add-button" data-action="new-client-from-order" aria-label="Adicionar novo cliente" title="Adicionar novo cliente">${icon('plus')}</button></div></div>${field('Data de abertura','openedAt',o.openedAt||today(),'date','required')}${field('Data de conclusão','completedAt',o.completedAt||'','date')}${selectField('Status operacional','status',OPERATIONAL_STATUSES,canonicalOperationalStatus(o.status||'Orçamento'))}<div class="field equipment-type-field"><label>Tipo de equipamento</label><div class="inline-add-row"><select name="equipmentType"><option value="">Selecione</option>${equipmentTypeOptions(o.equipmentType||'')}</select><button type="button" class="btn secondary compact inline-add-button add-new-type-button" data-action="new-equipment-type" aria-label="Adicionar novo tipo de equipamento" title="Adicionar novo tipo de equipamento">${icon('plus')}</button></div></div>${field('Marca / Modelo','brandModel',o.brandModel||'')}${field('Número de série','serialNumber',o.serialNumber||'')}${field('Senha de acesso','accessPassword',o.accessPassword||'','text','autocomplete="off"')}${field('Acessórios deixados','accessories',o.accessories||'')}</div><div class="form-grid technical-fields">${textarea('Defeito relatado','reportedIssue',o.reportedIssue||'',true)}${textarea('Laudo técnico','technicalReport',o.technicalReport||'',true)}${textarea('Observações para o cliente','clientNotes',o.clientNotes||'',true)}${textarea('Observação interna','internalNotes',o.internalNotes||'',true)}</div><section class="form-section"><div class="section-heading"><div><h3>Itens e Serviços</h3><p>Serviços e produtos cobrados do cliente.</p></div><div class="section-heading-actions"><button type="button" class="btn secondary compact" data-action="add-item-row">${icon('plus')} Adicionar item/serviço</button></div></div><div class="item-editor-head"><span>Tipo</span><span>Item</span><span>Quantidade</span><span>Valor unitário</span><span>Subtotal</span><span>Baixar estoque</span><span></span></div><div id="order-items-editor">${items.map(orderItemRow).join('')}</div>${items.length?'':'<div class="empty compact-empty" id="items-empty-hint">Nenhum item adicionado. O total começa em R$ 0,00.</div>'}<div class="order-financial-breakdown"><h4>Resumo financeiro</h4><div><span>Total em Serviços</span><strong id="order-form-services">${currency(items.filter(it=>it.type==='Serviço').reduce((s,it)=>s+num(it.subtotal),0))}</strong></div><div><span>Total em Produtos</span><strong id="order-form-products">${currency(items.filter(it=>it.type==='Produto').reduce((s,it)=>s+num(it.subtotal),0))}</strong></div><div><span>Custo dos Produtos Vendidos</span><strong id="order-form-product-cost">${currency(items.filter(it=>it.type==='Produto').reduce((s,it)=>s+num(it.quantity)*num(Number.isFinite(Number(it.unitCost))?it.unitCost:data().products.find(p=>p.id===it.productId)?.cost),0))}</strong></div><div><span>Lucro Bruto dos Produtos</span><strong id="order-form-product-profit">${currency(items.filter(it=>it.type==='Produto').reduce((sum,it)=>sum+num(it.subtotal)-num(it.quantity)*num(Number.isFinite(Number(it.unitCost))?it.unitCost:data().products.find(p=>p.id===it.productId)?.cost),0))}</strong></div><div><span>Desconto por Item</span><strong id="order-form-item-discount">${currency(items.reduce((s,it)=>s+Math.max(0,((num(it.tablePrice)||itemTablePrice(it.type,it.productId||it.serviceId))-num(it.unitPrice))*num(it.quantity)),0))}</strong></div><label class="money-field"><span>Desconto Geral</span><input class="discount-input" data-field="general-discount" name="discount" type="text" inputmode="numeric" data-money="true" value="${attr((window.MarcoMoney?.formatNumber(num(o.discount))||currency(num(o.discount))))}"></label><div><span>Total Bruto</span><strong id="order-form-gross">${currency(items.reduce((s,it)=>s+num(it.subtotal),0))}</strong></div><div class="final"><span>Total Final</span><strong id="order-form-total">${currency(o.total||0)}</strong></div><strong id="order-form-general-discount" hidden>${currency(num(o.discount))}</strong></div></section><section class="form-section"><div class="section-heading"><div><h3>Pagamentos</h3><p>Vários meios de pagamento, vencimentos e taxas sem duplicidade.</p></div><button type="button" class="btn secondary compact" data-action="add-payment-row">${icon('plus')} Adicionar pagamento</button></div><div id="order-payments-editor">${renderPaymentRows(existing?.id,draft)}</div><div class="empty compact-empty ${renderPaymentRows(existing?.id,draft)?'is-hidden':''}" id="payments-empty-hint">Nenhum pagamento informado.</div></section><section class="form-section"><div class="section-heading"><div><h3>Fotos</h3><p>${photos.length} foto(s) já vinculada(s).</p></div></div><div class="field full photo-add-field"><div class="toolbar"><div class="toolbar-left"><label class="btn secondary compact file-button">${icon('camera')} Tirar foto<input type="file" accept="image/*" capture="environment" data-photo-input="camera" hidden></label><label class="btn ghost compact file-button">${icon('upload')} Da galeria<input type="file" accept="image/*" multiple data-photo-input="gallery" hidden></label></div></div><div class="media-grid existing-media-editor" data-existing-photo-stage>${existingPhotoEditorHtml219(photos,code)}</div><div class="media-grid staged-media-editor" data-photo-stage></div><div class="pending-media-delete-note" data-pending-media-deletes hidden></div><input type="file" name="photos" multiple hidden data-photos-merged></div></section><section class="form-section compact-attachments osv-technical-attachments"><div class="section-heading"><div><h3>Anexos técnicos</h3><p>${attachments.length} anexo(s) já vinculado(s).</p></div><label class="btn secondary compact file-button">${icon('upload')} Anexar laudo<input name="attachments" type="file" multiple hidden></label></div><div class="existing-attachments-editor" data-existing-attachment-stage>${existingAttachmentEditorHtml219(attachments)}</div></section><footer class="form-actions osv-form-actions"><div class="pdf-state-indicator" data-pdf-state="idle" data-pdf-status role="status" aria-live="polite"><span class="pdf-state-icon" aria-hidden="true"></span><span data-pdf-status-text>Gere o PDF quando a OSV estiver pronta.</span></div><button type="button" class="btn secondary action-generate-pdf" data-action="save-order-followup" data-followup="pdf" data-pdf-generate>${icon('pdf')} <span>Gerar PDF</span></button>${viewPdfButton}<button type="button" class="btn success action-whatsapp" data-action="save-order-followup" data-followup="share">${icon('phone')} Enviar WhatsApp</button><button type="button" class="btn secondary action-cancel" data-action="cancel-order-form">Cancelar</button><button type="submit" class="btn primary action-save">Salvar OSV</button></footer></form>`,true);
    const orderForm=$('form[data-form="order"]');if(orderForm)orderForm.__pendingPaymentDeletes=new Set(draft?.paymentDeleteIds||[]);
    requestAnimationFrame(()=>{updateOrderFormTotal();refreshPaymentRows();});
  };

  function refreshPaymentRows(){
    $$('.payment-editor-row').forEach(row=>{
      const method=$('[data-payment-field="method"]',row)?.value||'',planned=$('[data-payment-field="planned"]',row)?.checked,paymentDate=$('[data-payment-field="paymentDate"]',row)?.value||'',dueDate=planned?($('[data-payment-field="dueDate"]',row)?.value||''):'';
      $('.due-field',row)?.classList.toggle('is-hidden',!planned);$('.fee-field',row)?.classList.toggle('is-hidden',!/débito|crédito|outro/i.test(method));
      const dueField=$('.due-field',row),dueError=$('[data-payment-due-error]',row);dueField?.classList.toggle('has-error',!!planned&&!dueDate);if(dueError)dueError.hidden=!planned||!!dueDate;
      const value=num($('[data-payment-field="value"]',row)?.value),hasMachineFee=/débito|crédito|outro/i.test(method),enteredGross=hasMachineFee?num($('[data-payment-field="fee"]',row)?.value):value,grossValue=hasMachineFee?Math.max(value,enteredGross||value):value,fee=Math.max(0,grossValue-value),gross=$('[data-payment-gross]',row),status=$('[data-payment-status]',row);if(gross)gross.textContent=currency(grossValue);const feeSummary=$('[data-payment-calculated-fee]',row);if(feeSummary)feeSummary.textContent=currency(fee);if(status)status.innerHTML=statusBadge(recordFinancialStatus({paymentDate,dueDate,status:'Em aberto'}));
    });
    const payHint=$('#payments-empty-hint');if(payHint)payHint.classList.toggle('is-hidden',$$('.payment-editor-row').length>0);
    const itemHint=$('#items-empty-hint');if(itemHint)itemHint.classList.toggle('is-hidden',$$('.item-editor-row').length>0);
    window.MarcoMoney?.bindAll?.(document.querySelector('#order-payments-editor'));
  }
  function syncPriceHistory(order,newItems){
    const existingByKey=new Map(data().priceHistory.filter(h=>h.orderId===order.id).map(h=>[h.itemId,h]));
    const keep=new Set();
    newItems.forEach(it=>{const catalog=catalogItem(it),key=it.id,record={id:existingByKey.get(key)?.id||`HIS-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,itemId:key,orderId:order.id,clientId:order.clientId,clientName:order.clientName,date:order.openedAt,type:it.type,catalogId:it.productId||it.serviceId,description:catalog?.description||it.description||'',quantity:num(it.quantity),unitPrice:num(it.unitPrice),subtotal:num(it.subtotal),standardPrice:it.type==='Produto'?num(catalog?.salePrice):num(catalog?.price),updatedAt:nowIso()};const old=existingByKey.get(key);if(old)Object.assign(old,record);else data().priceHistory.push(record);keep.add(key);});
    data().priceHistory=data().priceHistory.filter(h=>h.orderId!==order.id||keep.has(h.itemId));
  }
  function collectOrderPayments(form,orderId,clientId){
    const rows=$$('.payment-editor-row',form),values=rows.map(row=>({row,value:readPaymentRow(row)})),created=[];
    const incomingExistingIds=new Set(values.map(entry=>entry.value.id).filter(Boolean));
    const deleteIds=form.__pendingPaymentDeletes||new Set();
    const current=(data().payments||[]).filter(p=>p.orderId===orderId&&normalizeText(p.type)==='receita'&&!paymentIsCancelled(p));
    const missing=current.filter(p=>!incomingExistingIds.has(p.id));
    for(const payment of missing){
      if(deleteIds.has(payment.id)&&canPermanentlyDeletePayment(payment)){
        markPendingPaymentDeletion(activeProfile().id,payment.id);
        data().payments=data().payments.filter(item=>item.id!==payment.id&&item.code!==payment.id);
      }else{
        payment.status='Cancelado';payment.cancelledAt=payment.cancelledAt||nowIso();payment.cancelReason=payment.cancelReason||'Removido da OSV após a janela de exclusão definitiva';payment.updatedAt=nowIso();
      }
    }
    for(const entry of values){
      const row=entry.row,v=entry.value,planned=$('[data-payment-field="planned"]',row)?.checked;
      if(v.value<=0)continue;
      if(planned&&!v.dueDate){const field=$('.due-field',row),error=$('[data-payment-due-error]',row);field?.classList.add('has-error');if(error)error.hidden=false;$('[data-payment-field="dueDate"]',row)?.focus();throw new Error('Informe a data de vencimento do pagamento combinado.');}
      let id=v.id;
      if(!id||!data().payments.some(x=>x.id===id))id=nextCode('REC',[...data().payments,...created]);
      const old=data().payments.find(x=>x.id===id);
      const item={id,code:id,orderId,clientId,type:'Receita',paymentMethod:v.paymentMethod,value:num(v.value),fee:num(v.fee),grossValue:num(v.value)+num(v.fee),paymentDate:v.paymentDate,dueDate:v.dueDate,planned:!!v.dueDate&&!v.paymentDate,notes:v.notes,status:'Em aberto',cancelledAt:'',cancelReason:'',updatedAt:nowIso(),createdAt:old?.createdAt||nowIso()};
      item.status=recordFinancialStatus(item);
      if(old)Object.assign(old,item);else{clearPendingPaymentDeletion(activeProfile().id,id);data().payments.push(item);created.push(item);}
    }
  }
  function collectOrderItems(form,orderId,oldItems){
    const items=[];
    $$('.item-editor-row',form).forEach(row=>{const type=$('[data-item-field="type"]',row).value==='Produto'?'Produto':'Serviço',ref=$('[data-item-field="ref"]',row).value,q=num($('[data-item-field="qty"]',row).value),p=num($('[data-item-field="price"]',row).value);if(!ref||q<=0)return;const previous=oldItems.find(x=>x.id===row.dataset.itemId),previousRef=previous?.productId||previous?.serviceId||'';let itemId=row.dataset.itemId;if(previous&&(previous.type!==type||previousRef!==ref))itemId='';const tablePrice=Math.max(0,num(row.dataset.tablePrice)||itemTablePrice(type,ref));const currentCost=type==='Produto'?num(data().products.find(product=>product.id===ref)?.cost):0,rawUnitCost=Number(row.dataset.unitCost);const unitCost=type==='Produto'?Math.max(0,Number.isFinite(rawUnitCost)?rawUnitCost:currentCost):0;items.push({id:itemId||nextCode('ITM',[...data().orderItems,...items]),orderId,type,productId:type==='Produto'?ref:'',serviceId:type==='Serviço'?ref:'',supplyId:'',quantity:q,tablePrice,unitCost,unitPrice:p,subtotal:q*p,itemDiscount:Math.max(0,(tablePrice-p)*q),lowerStock:type==='Produto'&&!!$('[data-item-field="stock"]',row)?.checked});});
    return items;
  }
  saveOrderForm = async function(form){
    const editingId=form.dataset.id||'';let id=editingId||form.dataset.reservedCode||nextCode('OSV',data().serviceOrders);
    if(!editingId&&findOrder(id)){id=nextCode('OSV',data().serviceOrders);form.dataset.reservedCode=id;const preview=form.querySelector('.osv-code-preview strong');if(preview)preview.textContent=id;}
    const old=editingId?findOrder(editingId):null,oldItems=old?clone(orderItems(id)):[],v=Object.fromEntries(new FormData(form)),client=findClient(v.clientId);if(!client)throw new Error('Selecione um cliente ativo.');
    if(v.completedAt&&v.openedAt&&v.completedAt<v.openedAt)throw new Error('A data de conclusão não pode ser anterior à data de abertura.');
    const status=canonicalOperationalStatus(v.status);if(status==='Concluída'&&!v.completedAt)v.completedAt=today();
    const newItems=collectOrderItems(form,id,oldItems),gross=newItems.reduce((s,it)=>s+num(it.subtotal),0),discount=num(v.discount);if(discount>gross+.005&&!await confirmAction('O desconto é maior que o total bruto. O total final ficará em R$ 0,00. Continuar?'))return;
    let cancellation=null;if(status==='Cancelada'&&old&&canonicalOperationalStatus(old.status)!=='Cancelada'){cancellation=await planOrderCancellation(id,oldItems);if(cancellation.abort)return;const hasNewPayment=$$('.payment-editor-row',form).some(row=>!row.dataset.paymentId&&readPaymentRow(row).value>0);if(hasNewPayment)throw new Error('Não adicione um novo pagamento no mesmo salvamento que cancela a OSV. Salve ou cancele o lançamento separadamente.');}
    const total=Math.max(0,gross-discount),proposedPaid=$$('.payment-editor-row',form).map(readPaymentRow).filter(p=>p.paymentDate).reduce((sum,p)=>sum+num(p.value),0);if(proposedPaid>total+.005&&!await confirmAction(`Os pagamentos somam ${currency(proposedPaid)}, acima do total final de ${currency(total)}. Manter mesmo assim?`))return;
    const storedStockDecision=old?.cancellationEffects?.stock,reverseStock=status==='Cancelada'?(cancellation?cancellation.reverseStock:storedStockDecision!=='mantido'):false;
    const pendingMediaDeletes=new Set(form.__pendingMediaDeletes||[]),oldPhotos=old?.photos||[],oldAttachments=old?.attachments||[];
    const removedMedia=[...oldPhotos,...oldAttachments].filter(meta=>pendingMediaDeletes.has(meta.id));
    if(removedMedia.length)await MarcoStorage.createBackup(STATE,'antes-de-excluir-midia-osv-v2.2.0');
    const orderBreakdown={services:newItems.filter(x=>x.type==='Serviço').reduce((sum,x)=>sum+num(x.subtotal),0),products:newItems.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.subtotal),0),productCost:newItems.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.quantity)*num(x.unitCost),0),itemDiscount:newItems.reduce((sum,x)=>sum+num(x.itemDiscount),0)};const item={id,openedAt:v.openedAt||today(),completedAt:v.completedAt||'',clientId:client.id,clientName:client.name,financialBreakdown:{...orderBreakdown,productGrossProfit:orderBreakdown.products-orderBreakdown.productCost,generalDiscount:discount,total},pdfTemplateId:v.pdfTemplateId||old?.pdfTemplateId||currentProfileSettings().defaultPdfTemplateId||'',pixPayment:window.MarcoPersonalization221?.snapshotPixFromForm?.(form,old?.pixPayment)||old?.pixPayment||{enabled:false},equipmentType:v.equipmentType,brandModel:v.brandModel,serialNumber:v.serialNumber,accessPassword:v.accessPassword,accessories:v.accessories,reportedIssue:v.reportedIssue,technicalReport:v.technicalReport,status,discount,total,clientNotes:v.clientNotes,internalNotes:v.internalNotes,registrationStatus:old?.registrationStatus||'Ativo',photos:oldPhotos.filter(meta=>!pendingMediaDeletes.has(meta.id)),pdfs:old?.pdfs||[],attachments:oldAttachments.filter(meta=>!pendingMediaDeletes.has(meta.id)),sourceAppointmentId:old?.sourceAppointmentId||v.sourceAppointmentId||'',cancellationEffects:old?.cancellationEffects||null,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};
    if(cancellation)item.cancellationEffects={date:nowIso(),payments:cancellation.paymentAction==='cancel'?'estornados':cancellation.paymentAction==='preserve'?'preservados':'nenhum',stock:cancellation.hadAutomaticStock?(cancellation.reverseStock?'revertido':'mantido'):'nenhum'};
    const stockPlan=status==='Cancelada'&&reverseStock?newItems.map(x=>({...x,lowerStock:false})):newItems;
    validateStockPlan(oldItems,stockPlan);if(old)Object.assign(old,item);else data().serviceOrders.push(item);data().orderItems=data().orderItems.filter(x=>x.orderId!==id).concat(newItems);reconcileStock(id,oldItems,stockPlan);syncPriceHistory(item,newItems);collectOrderPayments(form,id,client.id);applyCancellationPaymentDecision(cancellation,id);
    await persist(old?'OSV atualizada':'OSV criada',`${id} · ${client.name}${cancellation?` · ${cancellationAuditText(cancellation)}`:''}`);
    const photos=[...(form.elements.photos?.files||[])],attachments=[...(form.elements.attachments?.files||[])];if(photos.length)await addPhotosToOrder(item,photos);if(attachments.length)await addAttachmentsToOrder(item,attachments);
    if(removedMedia.length)await finalizePendingMediaDeletes219(item,removedMedia);
    form.__pendingMediaDeletes=new Set();
    if(item.sourceAppointmentId){const appt=data().appointments.find(a=>a.id===item.sourceAppointmentId);if(appt){appt.orderId=id;appt.status='Concluído';await persist('Agendamento convertido em OSV',`${appt.id} → ${id}`);}}
    const followup=form.dataset.followup||'';
    await clearOrderDraftAfterSave219(form,id);
    form.dataset.id=id;form.dataset.reservedCode=id;form.dataset.draftKey=orderDraftKey219(id);form.dataset.followup='';
    form.__stagedPhotos=[];const mergedPhotos=form.querySelector('[data-photos-merged]');if(mergedPhotos&&typeof DataTransfer!=='undefined')mergedPhotos.files=new DataTransfer().files;
    if(form.elements.attachments)form.elements.attachments.value='';
    const latestPdf=latestOfficialPdfMeta219(id),currentFingerprint=orderPdfFingerprint219(id);
    setPdfState219(form,latestPdf&&latestPdf.sourceFingerprint===currentFingerprint?'ready':latestPdf?'dirty':'idle');
    toast(`${id} salva com sucesso.`);
    if(followup){
      const viewBtn=form.querySelector('[data-followup="view-pdf"]');if(viewBtn){viewBtn.dataset.action='view-current-pdf';viewBtn.dataset.id=id;delete viewBtn.dataset.followup;}
      if(followup==='pdf')await generatePdfForOrder(id,false);
      else if(followup==='view-pdf')await viewCurrentOrderPdf(id);
      else if(followup==='share')await openOrderShareReview219(id);
      return;
    }
    closeModal({reason:'saved'});renderView();
  };

  function maskDocument(value){const d=digitsOnly(value).slice(0,14);if(d.length<=11)return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');return d.replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');}
  function maskPhone(value){const result=normalizeBrazilianPhone(value);return result.valid?result.formatted:String(value||'');}
  function maskZip(value){return digitsOnly(value).slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');}
  function validCpf(value){const d=digitsOnly(value);if(d.length!==11||/^(\d)\1+$/.test(d))return false;let sum=0;for(let i=0;i<9;i++)sum+=Number(d[i])*(10-i);let r=(sum*10)%11;if(r===10)r=0;if(r!==Number(d[9]))return false;sum=0;for(let i=0;i<10;i++)sum+=Number(d[i])*(11-i);r=(sum*10)%11;if(r===10)r=0;return r===Number(d[10]);}
  function validCnpj(value){const d=digitsOnly(value);if(d.length!==14||/^(\d)\1+$/.test(d))return false;const calc=len=>{const weights=len===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const sum=weights.reduce((s,w,i)=>s+Number(d[i])*w,0),r=sum%11;return r<2?0:11-r;};return calc(12)===Number(d[12])&&calc(13)===Number(d[13]);}
  function cityOptions(uf,selected=''){const cities=CITY_SEED[uf]||[];return cities.map(x=>`<option value="${attr(x)}">${esc(x)}</option>`).join('');}

  openClientForm = function(id=''){
    const c=id?findClient(id):null,uf=c?.state||String(c?.city||'').match(/-\s*([A-Z]{2})$/)?.[1]||'SP',city=c?(c.city||'').replace(/\s*-\s*[A-Z]{2}$/,''):'Catanduva';
    openModal(c?'Editar cliente':'Novo cliente',`<form data-form="client" data-id="${attr(id)}"><div class="osv-code-preview"><span>Identificador</span><strong>${esc(c?.id||nextCode('CLI',data().clients))}</strong></div><div class="form-grid client-form-grid"><div class="field client-name"><label>Nome *</label><input name="name" value="${attr(c?.name||'')}" required></div><div class="field client-phone"><label>Telefone</label><input name="phone" type="tel" value="${attr(c?.phone||'')}" inputmode="tel" autocomplete="tel" data-phone-input><small class="phone-field-hint" data-phone-hint hidden></small></div><div class="field client-document"><label>CPF/CNPJ</label><input name="document" value="${attr(c?.document||'')}" inputmode="numeric" data-mask="document"></div><div class="field client-address"><label>Rua / Endereço</label><input name="address" value="${attr(c?.address||'')}" autocomplete="off" data-address-fast></div><div class="field client-number"><label>Número</label><input name="number" value="${attr(c?.number||'')}" inputmode="numeric" data-number-fast></div><div class="field client-zip"><label>CEP</label><input name="zip" value="${attr(c?.zip||'')}" inputmode="numeric" data-mask="zip" data-zip-fast></div><div class="field full cep-helper"><div class="cep-suggestion-list" data-cep-results></div></div><div class="field client-complement"><label>Complemento</label><input name="complement" value="${attr(c?.complement||'')}"></div><div class="field client-neighborhood"><label>Bairro</label><input name="neighborhood" value="${attr(c?.neighborhood||'')}"></div><div class="field client-city"><label>Cidade</label><input name="city" list="city-options" value="${attr(city)}" data-client-city><datalist id="city-options">${cityOptions(uf,city)}</datalist></div><div class="field client-state"><label>Estado</label><select name="state" data-client-state>${UF_OPTIONS.map(x=>`<option ${x===uf?'selected':''}>${x}</option>`).join('')}</select></div>${textarea('Observação interna','notes',c?.notes||'',true)}</div><div class="form-actions client-form-actions">${id?`<button type="button" class="icon-btn danger" data-action="archive-client-from-form" data-id="${attr(id)}" title="Arquivar cliente (o código ${esc(id)} fica reservado e não é reutilizado)" aria-label="Arquivar cliente">${icon('trash')}</button>`:''}<button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar cliente</button></div></form>`,true);
    requestAnimationFrame(()=>{loadCitiesForState(uf,city);$('form[data-form="client"] [name="name"]')?.focus();});
  };
  async function loadCitiesForState(uf,selected=''){
    const list=$('#city-options');if(!list)return;const fallback=CITY_SEED[uf]||[];list.innerHTML=fallback.map(x=>`<option value="${attr(x)}"></option>`).join('');
    try{const response=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,{cache:'force-cache'});if(!response.ok)return;const cities=await response.json();if(!Array.isArray(cities))return;list.innerHTML=cities.map(x=>`<option value="${attr(x.nome)}"></option>`).join('');}catch(_){/* fallback manual */}
  }
  saveClientForm = async function(form){
    const id=form.dataset.id||nextCode('CLI',data().clients),old=findClient(id),v=Object.fromEntries(new FormData(form)),name=String(v.name||'').trim();if(!name)throw new Error('Informe o nome do cliente.');
    const doc=digitsOnly(v.document);if(doc&&!(doc.length===11?validCpf(doc):doc.length===14?validCnpj(doc):false)&&!await confirmAction('CPF/CNPJ inválido. Salvar mesmo assim com confirmação administrativa?'))throw new Error('Revise o CPF/CNPJ.');
    if(doc&&data().clients.some(c=>c.id!==id&&digitsOnly(c.document)===doc))throw new Error('Este CPF/CNPJ já está cadastrado para outro cliente.');
    const phoneInput=String(v.phone||'').trim(),phoneResult=phoneInput?normalizeBrazilianPhone(phoneInput):null;if(phoneInput&&!phoneResult.valid)throw new Error(phoneResult.error||'Revise o telefone informado.');
    const zipDigits=digitsOnly(v.zip);if(zipDigits&&zipDigits.length!==8)throw new Error('O CEP precisa conter 8 dígitos.');
    const city=String(v.city||'').trim(),cityOptionsNow=[...form.querySelectorAll('#city-options option')].map(x=>normalizeText(x.value));if(city&&cityOptionsNow.length&&!cityOptionsNow.includes(normalizeText(city))&&!await confirmAction('A cidade informada não foi encontrada na lista da UF selecionada. Salvar como entrada manual?'))throw new Error('Revise Cidade e Estado.');
    const item={id,name,document:doc?maskDocument(doc):'',...(phoneResult?{phone:phoneResult.formatted,phoneNormalized:phoneResult.normalizedDigits,phoneE164:phoneResult.e164,phoneReviewRequired:false}:{phone:'',phoneNormalized:'',phoneE164:'',phoneReviewRequired:false}),state:v.state||'SP',city:[city,v.state].filter(Boolean).join(' - '),address:v.address,number:v.number,neighborhood:v.neighborhood,complement:v.complement,zip:maskZip(zipDigits),notes:v.notes,createdAt:old?.createdAt||today(),status:old?.status||'Ativo'};if(old)Object.assign(old,item);else data().clients.push(item);await persist(old?'Cliente atualizado':'Cliente criado',`${item.id} · ${item.name}`);
    if(PENDING_ORDER_DRAFT){const memoryDraft=PENDING_ORDER_DRAFT;PENDING_ORDER_DRAFT=null;const storedDraft=await MarcoStorage.getDraft?.(orderDraftKey219('new')).catch(()=>null);const draft={...(storedDraft||memoryDraft),clientId:id,clientSearch:item.name,__draft:true};closeModal({reason:'replace-modal'});openOrderForm('',draft);toast('Cliente criado e selecionado na OSV.');return;}
    closeModal();renderView();toast('Cliente salvo.');
  };

  function refreshStandalonePaymentType(form){
    if(!form)return;
    const isExpense=form.elements.type?.value==='Despesa';
    form.querySelectorAll('[data-payment-expense-only]').forEach(field=>{field.hidden=!isExpense;field.style.display=isExpense?'':'none';field.querySelectorAll('input,select,textarea').forEach(input=>input.disabled=!isExpense);});
    const preview=form.querySelector('[data-payment-id-preview]');
    if(preview&&!form.dataset.id)preview.value=nextCode(isExpense?'DES':'REC',data().payments);
  }
  openPaymentForm = function(id='',orderId=''){
    const p=id?data().payments.find(x=>x.id===id):null,o=orderId?findOrder(orderId):findOrder(p?.orderId),suggested=o?orderFinancialInfo(o).balance:0,base=p||{orderId,type:'Receita',value:suggested,paymentMethod:'Pix',paymentDate:today(),dueDate:'',fee:0,notes:''};
    const isExpense=base.type==='Despesa',previewId=p?.id||nextCode(isExpense?'DES':'REC',data().payments),expenseStyle=isExpense?'':'display:none';
    openModal(p?'Editar lançamento':'Novo lançamento',`<form data-form="payment" data-layout-key="payment" data-id="${attr(id)}"><div class="form-grid payment-form-grid"><div class="field" data-layout-component="paymentId"><label>ID do lançamento</label><input readonly data-payment-id-preview value="${attr(previewId)}"></div>${selectField('Tipo','type',['Receita','Despesa'],base.type||'Receita')}<div class="field full"><label>OSV vinculada</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(x=>x.registrationStatus!=='Inativo').sort((a,b)=>String(b.openedAt||'').localeCompare(a.openedAt||'')).map(x=>`<option value="${attr(x.id)}" ${x.id===base.orderId?'selected':''}>${esc(x.id)} · ${esc(x.clientName||'Cliente')}</option>`).join('')}</select></div>${field('Valor líquido','value',window.MarcoMoney?.formatNumber(num(base.value))||currency(num(base.value)),'text','inputmode="numeric" data-money="true" required')}${selectField('Forma de pagamento','paymentMethod',PAYMENT_METHODS,base.paymentMethod||'Pix')}${field('Data do pagamento','paymentDate',base.paymentDate||today(),'date')}<label class="check-field"><input type="checkbox" name="planned" ${base.dueDate&&!base.paymentDate?'checked':''}><span>Pagamento com data combinada</span></label><div class="field payment-due ${base.dueDate&&!base.paymentDate?'':'is-hidden'}"><label>Data de vencimento</label><input name="dueDate" type="date" value="${attr(base.dueDate||'')}"><small class="inline-field-error" data-payment-due-error hidden>Informe a data de vencimento do pagamento combinado.</small></div><div class="field money-field payment-fee ${/débito|crédito|outro/i.test(base.paymentMethod||'')?'':'is-hidden'}"><label>Valor com taxa</label><input name="fee" type="text" inputmode="numeric" data-money="true" data-gross-value-input="true" value="${attr(window.MarcoMoney?.formatNumber(Math.max(num(base.value),num(base.grossValue)||num(base.value)+num(base.fee)))||currency(Math.max(num(base.value),num(base.grossValue)||num(base.value)+num(base.fee))))}"></div><div class="field"><label>Situação</label><select name="settlementState" data-payment-settlement><option value="open" ${paymentIsPaid(base)?'':'selected'}>Em aberto</option><option value="paid" ${paymentIsPaid(base)?'selected':''}>Pago</option></select><small data-payment-status-preview>${esc(recordFinancialStatus(base))}</small></div><div class="field" data-payment-expense-only style="${expenseStyle}" ${isExpense?'':'hidden'}><label>Nome da despesa</label><input name="expenseName" value="${attr(base.expenseName||'')}" placeholder="Ex.: Compra de peça"></div><div class="field" data-payment-expense-only style="${expenseStyle}" ${isExpense?'':'hidden'}><label>Local da compra</label><input name="localPurchase" value="${attr(base.localPurchase||'')}" placeholder="Fornecedor, loja ou estabelecimento"></div><div class="field" data-payment-expense-only style="${expenseStyle}" ${isExpense?'':'hidden'}><label>Categoria da despesa</label><input name="expenseCategory" value="${attr(base.expenseCategory||'Outro')}"></div>${textarea('Observação','notes',base.notes||'',true)}${p?`<label class="check-field full"><input type="checkbox" name="cancelled" ${paymentIsCancelled(p)?'checked':''}><span>Cancelar lançamento mantendo histórico</span></label>`:''}</div><div class="payment-summary"><span>Valor líquido: <strong data-payment-net>${currency(base.value)}</strong></span><span>Taxa: <strong data-payment-fee-total>${currency(base.fee)}</strong></span><span>Valor com taxa: <strong data-payment-gross-total>${currency(num(base.value)+num(base.fee))}</strong></span></div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar lançamento</button></div></form>`,true);
    requestAnimationFrame(()=>refreshStandalonePaymentType($('form[data-form="payment"]')));
  };
  savePaymentForm = async function(form){
    const v=Object.fromEntries(new FormData(form)),type=v.type==='Despesa'?'Despesa':'Receita',prefix=type==='Despesa'?'DES':'REC',id=form.dataset.id||nextCode(prefix,data().payments),old=data().payments.find(x=>x.id===id),order=findOrder(v.orderId);
    const settlementState=v.settlementState==='paid'?'paid':'open';let paymentDate=settlementState==='paid'?(v.paymentDate||today()):'';if(type==='Despesa'&&settlementState==='paid'&&!paymentDate)paymentDate=today();const dueDate=v.planned?v.dueDate||'':'';const value=num(v.value);if(value<=0)throw new Error('Informe um valor líquido maior que zero.');if(v.planned&&!dueDate){const due=form.elements.dueDate,field=due?.closest('.field'),error=field?.querySelector('[data-payment-due-error]');field?.classList.add('has-error');if(error)error.hidden=false;due?.focus();throw new Error('Informe a data de vencimento do pagamento combinado.');}if(order&&isCancelledOrder(order)&&!v.cancelled)throw new Error('Não é possível adicionar pagamento ativo a uma OSV cancelada.');if(old&&paymentIsCancelled(old)&&v.cancelled&&settlementState==='paid')throw new Error('Remova o cancelamento antes de marcar este lançamento como Pago.');
    if(type==='Receita'&&order&&paymentDate&&!v.cancelled){const paidWithoutCurrent=orderPayments(order.id).filter(p=>p.id!==id&&normalizeText(p.type)==='receita'&&paymentIsPaid(p)).reduce((sum,p)=>sum+num(p.value),0);if(paidWithoutCurrent+value>num(order.total)+.005&&!await confirmAction(`O pagamento ultrapassa o saldo da ${order.id}. Confirmar valor acima do total?`))return;}
    const priorCancellation=old?.cancelledAt?{cancelledAt:old.cancelledAt,cancelReason:old.cancelReason||'',restoredAt:nowIso()}:null;const cancellationHistory=Array.isArray(old?.cancellationHistory)?old.cancellationHistory.slice():[];if(priorCancellation&&!v.cancelled&&!cancellationHistory.some(x=>x.cancelledAt===priorCancellation.cancelledAt))cancellationHistory.push(priorCancellation);const hasMachineFee=/débito|crédito|outro/i.test(v.paymentMethod),enteredGross=hasMachineFee?num(v.fee):value,grossValue=hasMachineFee?Math.max(value,enteredGross||value):value,calculatedFee=Math.max(0,grossValue-value);const item={id,code:old?.code||id,orderId:v.orderId||'',clientId:order?.clientId||old?.clientId||'',type,paymentMethod:v.paymentMethod,value,fee:calculatedFee,grossValue,paymentDate,dueDate,planned:!!dueDate&&!paymentDate,expenseName:type==='Despesa'?String(v.expenseName||'').trim():'',localPurchase:type==='Despesa'?String(v.localPurchase||'').trim():'',expenseCategory:type==='Despesa'?(String(v.expenseCategory||'Outro').trim()||'Outro'):'',notes:v.notes,externalReference:old?.externalReference||`${v.orderId||'AVULSO'}:${id}`,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso(),cancelledAt:v.cancelled?old?.cancelledAt||nowIso():'',cancelReason:v.cancelled?(old?.cancelReason||'Cancelado pelo usuário'):'',cancellationHistory,status:'Em aberto'};item.status=v.cancelled?'Cancelado':recordFinancialStatus(item);if(old)Object.assign(old,item);else{clearPendingPaymentDeletion(activeProfile().id,id);data().payments.push(item);}await persist(old?'Lançamento atualizado':'Lançamento criado',`${item.id} · ${currency(item.value)}`);closeModal();renderView();toast('Lançamento salvo e vínculos recalculados.');
  };
  function mitOrderBreakdown(order){
    const stored=order?.financialBreakdown;
    if(stored&&typeof stored==='object'){
      const services=num(stored.services),products=num(stored.products),productCost=num(stored.productCost),itemDiscount=num(stored.itemDiscount),generalDiscount=num(stored.generalDiscount??order.discount),total=num(stored.total??order.total);
      return {services,products,productCost,productGrossProfit:num(stored.productGrossProfit??(products-productCost)),itemDiscount,generalDiscount,total};
    }
    const items=orderItems(order.id),services=items.filter(x=>x.type==='Serviço').reduce((sum,x)=>sum+num(x.subtotal),0),products=items.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.subtotal),0),productCost=items.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.quantity)*num(Number.isFinite(Number(x.unitCost))?x.unitCost:data().products.find(p=>p.id===x.productId)?.cost),0),itemDiscount=items.reduce((sum,x)=>sum+Math.max(0,((num(x.tablePrice)||itemTablePrice(x.type,x.productId||x.serviceId))-num(x.unitPrice))*num(x.quantity)),0);
    return {services,products,productCost,productGrossProfit:products-productCost,itemDiscount,generalDiscount:num(order.discount),total:num(order.total)};
  }
  function mitFinanceIndicators(){
    const completed=data().serviceOrders.filter(orderNotCancelled).filter(o=>canonicalOperationalStatus(o.status)==='Concluída').filter(o=>matchesUnifiedPeriod(o.completedAt||o.openedAt||o.createdAt,'finance'));
    const breakdowns=completed.map(mitOrderBreakdown);
    const serviceRevenue=breakdowns.reduce((sum,row)=>sum+row.services,0);
    const productRevenue=breakdowns.reduce((sum,row)=>sum+row.products,0);
    const rows=data().payments.filter(p=>!paymentIsCancelled(p)).filter(p=>matchesUnifiedPeriod(p.paymentDate||p.dueDate||p.createdAt,'finance'));
    const paidExpenses=rows.filter(p=>normalizeText(p.type)==='despesa'&&paymentIsPaid(p));
    const isTax=p=>/imposto|tribut|taxa|darf|das\b|icms|iss|ipi|pis|cofins/i.test([p.expenseCategory,p.expenseName,p.notes].filter(Boolean).join(' '));
    const taxes=paidExpenses.filter(isTax).reduce((sum,p)=>sum+num(p.value),0);
    const expenses=paidExpenses.filter(p=>!isTax(p)).reduce((sum,p)=>sum+num(p.value),0);
    const receivable=data().serviceOrders.filter(orderNotCancelled).filter(o=>matchesUnifiedPeriod(orderFinancialInfo(o).dueDate||o.openedAt||o.createdAt,'finance')).reduce((sum,o)=>sum+orderFinancialInfo(o).balance,0);
    const totalRevenue=serviceRevenue+productRevenue;
    return {serviceRevenue,productRevenue,totalRevenue,expenses,taxes,balance:totalRevenue-expenses-taxes,receivable};
  }
  renderFinance = function(){
    const mode=getViewMode('finance');
    data().payments.forEach(p=>{if(!paymentIsCancelled(p))p.status=recordFinancialStatus(p);});
    const list=[...data().payments].filter(p=>matches(p.id,p.code,p.type,p.paymentMethod,p.status,p.notes,p.orderId,findOrder(p.orderId)?.clientName)).filter(p=>matchesUnifiedPeriod(p.paymentDate||p.dueDate||p.createdAt,'finance')).sort((a,b)=>String(b.paymentDate||b.dueDate||b.createdAt||'').localeCompare(String(a.paymentDate||a.dueDate||a.createdAt||'')));
    const k=mitFinanceIndicators();
    return `<div class="grid kpis mit-finance-kpis"><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receita de Serviços</small><strong>${currency(k.serviceRevenue)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('stock')}</div><div><small>Receita de Produtos</small><strong>${currency(k.productRevenue)}</strong></div></div><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receita Total</small><strong>${currency(k.totalRevenue)}</strong></div></div><div class="card kpi"><div class="kpi-icon red">${icon('finance')}</div><div><small>Despesas</small><strong>${currency(k.expenses)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('documents')}</div><div><small>Impostos</small><strong>${currency(k.taxes)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('finance')}</div><div><small>Saldo</small><strong>${currency(k.balance)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('agenda')}</div><div><small>Valores a Receber</small><strong>${currency(k.receivable)}</strong></div></div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-payment">${icon('plus')} Novo lançamento</button><button class="btn secondary" data-action="export-finance">${icon('download')} Exportar CSV</button>${unifiedPeriodControls('finance')}</div><div class="toolbar-right">${viewModeSwitcher('finance',mode)}<span class="badge blue">${list.length} lançamentos</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="finance"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>ID</th><th>Tipo</th><th>Cliente / OSV</th><th>Forma</th><th>Status</th><th>Taxa</th><th class="text-right">Valor líquido</th><th></th></tr></thead><tbody>${list.map(p=>{const o=findOrder(p.orderId),st=recordFinancialStatus(p);return `<tr><td>${formatDate(p.paymentDate||p.dueDate)}</td><td><strong>${esc(p.code||p.id)}</strong></td><td>${statusBadge(p.type)}</td><td>${o?`<button class="text-link" data-action="view-client" data-id="${attr(o.clientId)}">${esc(o.clientName||'Cliente')}</button><button class="code-link" data-action="view-order" data-id="${attr(o.id)}">${esc(o.id)}</button>`:esc(p.notes||'Sem OSV vinculada')}</td><td>${esc(p.paymentMethod||'—')}</td><td>${statusBadge(st)}</td><td>${currency(p.fee)}</td><td class="text-right"><strong class="${normalizeText(p.type)==='despesa'?'danger-text':'success-text'}">${normalizeText(p.type)==='despesa'?'- ':''}${currency(p.value)}</strong></td><td><div class="actions"><button data-action="edit-payment" data-id="${attr(p.id)}">${icon('edit')}</button><button title="Cancelar mantendo histórico" data-action="cancel-payment" data-id="${attr(p.id)}">${icon('warning')}</button>${canPermanentlyDeletePayment(p)?`<button title="Excluir definitivamente" data-action="delete-payment" data-id="${attr(p.id)}">${icon('trash')}</button>`:''}</div></td></tr>`;}).join('')||'<tr><td colspan="9"><div class="empty">Nenhum lançamento encontrado.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function historyForCatalog(kind,id){return data().priceHistory.filter(h=>h.catalogId===id&&normalizeText(h.type)===normalizeText(kind)).sort((a,b)=>String(b.date||'').localeCompare(a.date||''));}
  openServiceForm = function(id=''){const x=id?data().services.find(v=>v.id===id):null,h=x?historyForCatalog('Serviço',id):[];openModal(x?'Editar serviço':'Novo serviço',`<form data-form="service" data-layout-key="service" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(x?.id||nextCode('SRV',data().services))}</strong></div><div class="form-grid one-column">${field('Descrição do serviço *','description',x?.description||'','text','required')}${field('Preço padrão','price',num(x?.price).toFixed(2),'number','step="0.01" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div>${x?`<section class="form-section"><h3>Histórico de preços e execuções</h3>${h.slice(0,12).map(r=>`<div class="list-row"><div class="list-row-main"><strong>${currency(r.unitPrice)} · ${esc(r.clientName||'Cliente')}</strong><small>${formatDate(r.date)} · ${esc(r.orderId)}</small></div></div>`).join('')||'<div class="empty compact-empty">Sem execuções registradas.</div>'}</section>`:''}<div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar serviço</button></div></form>`,true);};
  saveServiceForm = async function(form){const id=form.dataset.id||nextCode('SRV',data().services),old=data().services.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),item={id,description:String(v.description||'').trim(),price:num(v.price),status:v.status||'Ativo',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(!item.description)throw new Error('Informe a descrição do serviço.');if(old)Object.assign(old,item);else data().services.push(item);await persist(old?'Serviço atualizado':'Serviço criado',`${id} · ${item.description}`);closeModal();renderView();toast('Serviço salvo.');};
  function marginPrice(cost,margin){return margin>=.99?cost/.01:cost/(1-Math.max(0,margin));}
  openProductForm = function(id=''){const x=id?data().products.find(v=>v.id===id):null,margin=Math.round(num(x?.margin??.5)*10000)/100,current=x?stockOf('Produto',x.id):0,h=x?historyForCatalog('Produto',id):[];openModal(x?'Editar produto':'Novo produto',`<form data-form="product" data-layout-key="product" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(x?.id||nextCode('PRD',data().products))}</strong></div><div class="form-grid product-form-grid">${field('Descrição *','description',x?.description||'','text','required')}${field('Marca','brand',x?.brand||'')}${field('Fornecedor','supplier',x?.supplier||'')}${field('Custo','cost',num(x?.cost).toFixed(2),'number','step="0.01" min="0" data-product-cost') }<div class="field full margin-slider"><label>Margem bruta: <strong data-margin-label>${margin}%</strong></label><input name="margin" type="range" min="0" max="99" step="0.01" value="${margin}" data-product-margin><small>Preço = custo / (1 - margem). 100% é matematicamente impossível.</small></div>${field('Preço de venda','salePrice',num(x?.salePrice||marginPrice(num(x?.cost),margin/100)).toFixed(2),'number','step="0.01" min="0" data-product-price')}${x?`<div class="field"><label>Estoque atual</label><input readonly value="${attr(current)}"></div>`:field('Estoque inicial','initialStock',0,'number','step="1" min="0"')}${field('Estoque mínimo (opcional)','minimumStock',x?.minimumStock??'','number','step="1" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}<div class="field"><label>Última atualização</label><input readonly value="${attr(formatDate(x?.costUpdatedAt||today()))}"></div></div>${x?`<section class="form-section"><h3>Histórico de preços e vendas</h3><p class="muted">Preço efetivamente cobrado e preço padrão vigente em cada OSV.</p>${h.slice(0,20).map(r=>`<div class="list-row"><div class="list-row-main"><strong>${currency(r.unitPrice)} cobrado · ${esc(r.clientName||'Cliente')}</strong><small>${formatDate(r.date)} · ${esc(r.orderId)} · padrão ${currency(r.standardPrice)} · qtd. ${num(r.quantity)}</small></div><button type="button" class="code-link" data-action="view-order" data-id="${attr(r.orderId)}">Abrir OSV</button></div>`).join('')||'<div class="empty compact-empty">Sem vendas registradas.</div>'}</section>`:''}<div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar produto</button></div></form>`,true);};
  saveProductForm = async function(form){const id=form.dataset.id||nextCode('PRD',data().products),old=data().products.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),cost=num(v.cost),margin=Math.min(.99,Math.max(0,num(v.margin)/100)),salePrice=num(v.salePrice),item={id,description:String(v.description||'').trim(),brand:v.brand,supplier:v.supplier,cost,margin,suggestedPrice:marginPrice(cost,margin),salePrice,initialStock:0,minimumStock:v.minimumStock===''?'':num(v.minimumStock),costUpdatedAt:today(),priceUpdatedAt:today(),status:v.status||'Ativo',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(!item.description)throw new Error('Informe a descrição do produto.');if(old&&Math.abs(num(old.cost)-cost)>.005)data().costHistory.push({id:`CST-${Date.now()}`,catalogType:'Produto',catalogId:id,date:nowIso(),oldCost:num(old.cost),newCost:cost});if(old)Object.assign(old,item);else{data().products.push(item);const initial=num(v.initialStock);if(initial>0)data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:'Produto',productId:id,supplyId:'',movementType:'Entrada',quantity:initial,date:today(),orderId:'',notes:'Estoque inicial do cadastro',stockBefore:0,stockAfter:initial,sourceItemId:'',origin:'initial-stock'});}await persist(old?'Produto atualizado':'Produto criado',`${id} · ${item.description}`);closeModal();renderView();toast('Produto salvo.');};
  openSupplyForm = function(id=''){const x=id?data().supplies.find(v=>v.id===id):null,current=x?stockOf('Insumo',x.id):0;openModal(x?'Editar insumo':'Novo insumo',`<form data-form="supply" data-layout-key="supply" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(x?.id||nextCode('INS',data().supplies))}</strong></div><div class="form-grid one-column">${field('Descrição *','description',x?.description||'','text','required')}${field('Marca','brand',x?.brand||'')}${field('Fornecedor','supplier',x?.supplier||'')}${field('Custo','cost',num(x?.cost).toFixed(2),'number','step="0.01" min="0"')}${x?`<div class="field"><label>Estoque atual</label><input readonly value="${attr(current)}"></div>`:field('Estoque inicial','initialStock',0,'number','step="1" min="0"')}${field('Estoque mínimo (opcional)','minimumStock',x?.minimumStock??'','number','step="1" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar insumo</button></div></form>`,true);};
  saveSupplyForm = async function(form){const id=form.dataset.id||nextCode('INS',data().supplies),old=data().supplies.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),cost=num(v.cost),item={id,description:String(v.description||'').trim(),brand:v.brand,supplier:v.supplier,cost,initialStock:0,minimumStock:v.minimumStock===''?'':num(v.minimumStock),costUpdatedAt:today(),status:v.status||'Ativo',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(!item.description)throw new Error('Informe a descrição do insumo.');if(old&&Math.abs(num(old.cost)-cost)>.005)data().costHistory.push({id:`CST-${Date.now()}`,catalogType:'Insumo',catalogId:id,date:nowIso(),oldCost:num(old.cost),newCost:cost});if(old)Object.assign(old,item);else{data().supplies.push(item);const initial=num(v.initialStock);if(initial>0)data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:'Insumo',productId:'',supplyId:id,movementType:'Entrada',quantity:initial,date:today(),orderId:'',notes:'Estoque inicial do cadastro',stockBefore:0,stockAfter:initial,sourceItemId:'',origin:'initial-stock'});}await persist(old?'Insumo atualizado':'Insumo criado',`${id} · ${item.description}`);closeModal();renderView();toast('Insumo salvo.');};

  openStockMovementForm = function(id=''){
    const m=id?data().stockMovements.find(x=>x.id===id):null;
    if(m?.sourceItemId)throw new Error('Movimentações automáticas devem ser ajustadas editando a OSV de origem.');
    const base=m||{itemType:'Produto',movementType:'Entrada',quantity:1,date:today(),orderId:'',notes:''},selected=base.productId||base.supplyId||'',code=m?.id||nextCode('MOV',data().stockMovements);
    openModal(m?'Editar movimentação':'Movimentar estoque',`<form data-form="stock-movement" data-layout-key="stock-movement" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID da movimentação</span><strong>${esc(code)}</strong></div><div class="form-grid movement-form-grid">${selectField('Tipo do item','itemType',['Produto','Insumo'],base.itemType||'Produto','data-stock-type')}<div class="field"><label>Item *</label><select name="itemId" required data-stock-item>${itemReferenceOptions(base.itemType||'Produto',selected)}</select></div>${selectField('Tipo de movimento','movementType',['Entrada','Saída'],base.movementType||'Entrada')}${field('Quantidade *','quantity',base.quantity||1,'number','step="0.01" min="0.01" required')}${field('Data','date',base.date||today(),'date')}<div class="field full"><label>OSV vinculada</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(o=>o.registrationStatus!=='Inativo').slice().reverse().map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></div>${textarea('Observação','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">${m?'Salvar alteração':'Registrar movimentação'}</button></div></form>`,true);
  };

  function catalogServicesPts(){const mode=getViewMode('catalog'),list=data().services.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.price)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table"><thead><tr><th>Serviço</th><th>Preço padrão</th><th>Execuções</th><th>Status</th><th></th></tr></thead><tbody>${list.map(x=>`<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)}</small></td><td>${currency(x.price)}</td><td>${historyForCatalog('Serviço',x.id).length}</td><td>${statusBadge(x.status)}</td><td><div class="actions"><button data-action="edit-service" data-id="${attr(x.id)}">${icon('edit')}</button><button data-action="toggle-catalog-status" data-kind="service" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button></div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Nenhum serviço cadastrado.</div></td></tr>'}</tbody></table></div></section>`;}
  function productSortStorageKey(){let id='default';try{id=activeProfile()?.id||STATE?.activeProfileId||'default';}catch(_){}return `marco-product-sort:${id}`;}
  function hydrateProductSort(){try{const saved=JSON.parse(sessionStorage.getItem(productSortStorageKey())||'null');if(saved&&['product','supplier','cost','margin','sale','stock','minimum'].includes(saved.key)&&['default','desc','asc'].includes(saved.direction))PRODUCT_SORT=saved;}catch(_){}return PRODUCT_SORT;}
  function saveProductSort(){try{sessionStorage.setItem(productSortStorageKey(),JSON.stringify(PRODUCT_SORT));}catch(_){}}
  function productSortHeader(key,label){const state=hydrateProductSort(),active=state.key===key&&state.direction!=='default',direction=active?state.direction:'default',aria=direction==='desc'?'descending':direction==='asc'?'ascending':'none',indicator=direction==='desc'?'↓':direction==='asc'?'↑':'⇅',title=direction==='default'?`Ordenar ${label}: maior para menor`:`${label}: ${direction==='desc'?'maior para menor':'menor para maior'}. Clique para ${direction==='desc'?'menor para maior':'voltar ao padrão'}.`;return `<th aria-sort="${aria}"><button type="button" class="product-sort-button ${active?'is-active':''}" data-action="product-sort" data-sort-key="${attr(key)}" title="${attr(title)}"><span>${esc(label)}</span><span class="product-sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;}
  function productTextCompare(a,b,key,direction){const av=String(a[key]||'').trim(),bv=String(b[key]||'').trim();if(key==='supplier'){if(!av&&!bv)return 0;if(!av)return 1;if(!bv)return -1;}const cmp=av.localeCompare(bv,'pt-BR',{sensitivity:'base',numeric:true});return direction==='desc'?-cmp:cmp;}
  function numericWithMissing(a,b,getter,direction){const av=getter(a),bv=getter(b),am=av===''||av==null||!Number.isFinite(Number(av)),bm=bv===''||bv==null||!Number.isFinite(Number(bv));if(am&&bm)return 0;if(am)return 1;if(bm)return -1;const diff=Number(av)-Number(bv);return direction==='desc'?-diff:diff;}
  function stockHealthCompare(a,b,direction){const stockA=stockOf('Produto',a.id),stockB=stockOf('Produto',b.id),healthA=MarcoStockHealth.getStockHealth(stockA,a.minimumStock),healthB=MarcoStockHealth.getStockHealth(stockB,b.minimumStock),urgent={critical:0,warning:1,normal:2,unset:3},healthy={normal:0,warning:1,critical:2,unset:3},rank=direction==='desc'?urgent:healthy,rankDiff=(rank[healthA.level]??9)-(rank[healthB.level]??9);if(rankDiff)return rankDiff;if(healthA.level==='unset')return String(a.description||'').localeCompare(String(b.description||''),'pt-BR',{sensitivity:'base'});const stockDiff=Number(stockA)-Number(stockB);return direction==='desc'?stockDiff:-stockDiff;}
  function sortedProductsForCatalog(source){return source.slice();}
  function catalogProductsPts(){const mode=getViewMode('catalog'),base=data().products.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.brand,x.supplier)),list=sortedProductsForCatalog(base);return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table product-table-v227"><thead><tr>${productSortHeader('product','Produto')}${productSortHeader('supplier','Fornecedor')}${productSortHeader('cost','Custo')}${productSortHeader('margin','Margem')}${productSortHeader('sale','Venda')}${productSortHeader('stock','Estoque')}${productSortHeader('minimum','Mínimo')}<th>Ações</th></tr></thead><tbody>${list.map(x=>{const stock=stockOf('Produto',x.id),hasMin=x.minimumStock!==''&&x.minimumStock!=null,health=MarcoStockHealth.getStockHealth(stock,x.minimumStock);return `<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)} · ${esc(x.brand||'Sem marca')}</small></td><td>${esc(x.supplier||'—')}</td><td>${currency(x.cost)}</td><td>${(num(x.margin)*100).toFixed(1).replace('.',',')}%</td><td>${currency(x.salePrice)}</td><td><span class="stock-health-badge ${health.tone}">${esc(health.label)}</span><small class="muted">${stock}</small></td><td>${hasMin?num(x.minimumStock):'—'}</td><td><div class="actions"><button title="Atualizar custo" data-action="update-cost" data-kind="product" data-id="${attr(x.id)}">${icon('finance')}</button><button title="Editar produto" data-action="edit-product" data-id="${attr(x.id)}">${icon('edit')}</button><button title="${x.status==='Inativo'?'Restaurar':'Arquivar'} produto" data-action="toggle-catalog-status" data-kind="product" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhum produto cadastrado.</div></td></tr>'}</tbody></table></div></section>`;}

  function catalogSuppliesPts(){const mode=getViewMode('catalog'),list=data().supplies.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.brand,x.supplier)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table"><thead><tr><th>Insumo</th><th>Fornecedor</th><th>Custo</th><th>Estoque</th><th>Mínimo</th><th></th></tr></thead><tbody>${list.map(x=>{const stock=stockOf('Insumo',x.id),hasMin=x.minimumStock!==''&&x.minimumStock!=null,health=MarcoStockHealth.getStockHealth(stock,x.minimumStock);return `<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)} · ${esc(x.brand||'Sem marca')}</small></td><td>${esc(x.supplier||'—')}</td><td>${currency(x.cost)}</td><td><span class="stock-health-badge ${health.tone}">${esc(health.label)}</span><small class="muted">${stock}</small></td><td>${hasMin?num(x.minimumStock):'—'}</td><td><div class="actions"><button title="Atualizar custo" data-action="update-cost" data-kind="supply" data-id="${attr(x.id)}">${icon('finance')}</button><button data-action="edit-supply" data-id="${attr(x.id)}">${icon('edit')}</button><button data-action="toggle-catalog-status" data-kind="supply" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="6"><div class="empty">Nenhum insumo cadastrado.</div></td></tr>'}</tbody></table></div></section>`;}
  function movementsPts(){
    const mode=getViewMode('catalog'),list=[...data().stockMovements].filter(m=>matches(m.id,m.itemType,m.movementType,m.orderId,m.notes,itemForMovement(m)?.description)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table movements-table-v255"><thead><tr><th>ID</th><th>Data</th><th>Item</th><th>Tipo</th><th>Quantidade</th><th>Estoque Antes → Estoque Depois</th><th>OSV</th><th>Observação</th><th>Ações</th></tr></thead><tbody>${list.map(m=>`<tr><td><strong>${esc(m.id)}</strong></td><td>${formatDate(m.date)}</td><td><strong>${esc(itemForMovement(m)?.description||m.productId||m.supplyId||'—')}</strong><small class="muted">${esc(m.itemType)} · ${m.sourceItemId?'Automática':'Manual'}</small></td><td>${statusBadge(m.movementType)}</td><td>${num(m.quantity)}</td><td><strong>${Number.isFinite(Number(m.stockBefore))?num(m.stockBefore):'—'} → ${Number.isFinite(Number(m.stockAfter))?num(m.stockAfter):'—'}</strong></td><td>${m.orderId?`<button class="code-link" data-action="view-order" data-id="${attr(m.orderId)}">${esc(m.orderId)}</button>`:'—'}</td><td>${esc(m.notes||'—')}</td><td><div class="actions">${m.sourceItemId?`<button data-action="view-order" data-id="${attr(m.orderId)}" title="Abrir OSV">${icon('link')}</button>`:`<button data-action="edit-stock-movement" data-id="${attr(m.id)}" title="Editar movimentação">${icon('edit')}</button><button data-action="delete-stock-movement" data-id="${attr(m.id)}" title="Excluir movimentação">${icon('trash')}</button>`}</div></td></tr>`).join('')||'<tr><td colspan="9"><div class="empty">Nenhuma movimentação cadastrada.</div></td></tr>'}</tbody></table></div></section>`;
  }
  renderCatalog = function(){const tab=ACTIVE_TAB.catalog||'services',mode=getViewMode('catalog'),archived=[...data().products,...data().services,...data().supplies].filter(x=>x.status==='Inativo').length;return `<div class="toolbar"><div class="toolbar-left"><div class="tabs"><button class="${tab==='services'?'active':''}" data-action="catalog-tab" data-tab="services">Serviços</button><button class="${tab==='products'?'active':''}" data-action="catalog-tab" data-tab="products">Produtos</button><button class="${tab==='supplies'?'active':''}" data-action="catalog-tab" data-tab="supplies">Insumos</button><button class="${tab==='movements'?'active':''}" data-action="catalog-tab" data-tab="movements">Movimentações</button></div><button class="btn secondary" data-action="toggle-archived-catalog">${SHOW_ARCHIVED.catalog?'Ver ativos':`Inativos (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('catalog',mode)}${tab==='movements'?`<button class="btn primary" data-action="new-stock-movement">${icon('plus')} Movimentar estoque</button>`:`<button class="btn primary" data-action="new-catalog-item">${icon('plus')} Novo cadastro</button>`}</div></div>${tab==='services'?catalogServicesPts():tab==='products'?catalogProductsPts():tab==='supplies'?catalogSuppliesPts():movementsPts()}`;};
  renderStock = renderCatalog;
  openCatalogCreateForActiveTab = function(){if(ACTIVE_TAB.catalog==='services')openServiceForm();else if(ACTIVE_TAB.catalog==='products')openProductForm();else if(ACTIVE_TAB.catalog==='supplies')openSupplyForm();else openStockMovementForm();};

  function openCostUpdate(kind,id){
    const item=kind==='product'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id);if(!item)return;
    const currentMargin=Math.max(0,Math.min(.99,num(item.margin??.5))),currentPrice=num(item.salePrice)||marginPrice(num(item.cost),currentMargin);
    openModal('Atualizar custo',`<form data-form="cost-update" data-kind="${attr(kind)}" data-id="${attr(id)}" data-price-touched="false"><div class="form-grid one-column"><div class="field"><label>Cadastro</label><input readonly aria-readonly="true" value="${attr(item.description)}"></div><div class="field money-field"><label>Custo atual</label><input readonly aria-readonly="true" value="${attr(currency(item.cost))}"></div>${field('Novo custo','newCost',num(item.cost).toFixed(2),'number','step="0.01" min="0" required data-cost-new')}<div class="field margin-field-v255"><div class="field-label-row-v255"><label for="cost-margin-v255">Nova margem bruta</label><strong data-cost-margin-label>${(currentMargin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%</strong></div><input id="cost-margin-v255" name="newMargin" type="range" min="0" max="99" step="0.1" value="${attr((currentMargin*100).toFixed(2))}" data-cost-margin></div><div class="field"><label>Novo preço de venda</label><input name="newPrice" type="number" step="0.01" min="0" value="${attr(currentPrice.toFixed(2))}" data-cost-price required></div><small class="muted">Margem e preço estão interligados: alterar um recalcula o outro.</small></div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Atualizar custo</button></div></form>`);
  }
  async function saveCostUpdate(form){
    const kind=form.dataset.kind,id=form.dataset.id,item=kind==='product'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id),v=Object.fromEntries(new FormData(form));if(!item)throw new Error('Cadastro não encontrado.');
    const oldCost=num(item.cost),newCost=num(v.newCost);
    data().costHistory.push({id:`CST-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,catalogType:kind==='product'?'Produto':'Insumo',catalogId:id,date:nowIso(),oldCost,newCost});
    item.cost=newCost;item.costUpdatedAt=today();
    item.salePrice=Math.max(0,num(v.newPrice));
    item.margin=item.salePrice>0?Math.max(0,Math.min(.99,(item.salePrice-newCost)/item.salePrice)):0;
    item.priceUpdatedAt=today();
    await persist('Custo atualizado',`${id}: ${currency(oldCost)} → ${currency(newCost)}`);closeModal();renderView();toast('Custo, preço de venda e histórico atualizados.','ok');
  }

  openStockMovementForm = function(id=''){const m=id?data().stockMovements.find(x=>x.id===id):null;if(m?.sourceItemId)throw new Error('Movimentações automáticas devem ser ajustadas pela OSV de origem.');const base=m||{itemType:'Produto',movementType:'Entrada',quantity:1,date:today(),orderId:'',notes:''},selected=base.productId||base.supplyId||'';openModal(m?'Editar movimentação':'Movimentar estoque',`<form data-form="stock-movement" data-layout-key="movement" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(m?.id||nextCode('MOV',data().stockMovements))}</strong></div><div class="form-grid movement-grid">${selectField('Tipo do item','itemType',['Produto','Insumo'],base.itemType||'Produto','data-stock-type')}<div class="field"><label>Item *</label><select name="itemId" required data-stock-item>${itemReferenceOptions(base.itemType||'Produto',selected)}</select></div>${selectField('Tipo de movimento','movementType',['Entrada','Saída'],base.movementType||'Entrada')}${field('Quantidade','quantity',base.quantity||1,'number','step="0.01" min="0.01" required')}${field('Data','date',base.date||today(),'date')}<div class="field"><label>OSV vinculada</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(o=>o.registrationStatus!=='Inativo').map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></div>${textarea('Observação','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Registrar movimentação</button></div></form>`,true);};
  saveStockMovement = async function(form){
    const v=Object.fromEntries(new FormData(form)),type=v.itemType==='Insumo'?'Insumo':'Produto',itemId=v.itemId,qty=num(v.quantity),old=form.dataset.id?data().stockMovements.find(x=>x.id===form.dataset.id):null;if(old?.sourceItemId)throw new Error('Movimentação automática só pode ser alterada pela OSV.');if(qty<=0)throw new Error('Informe uma quantidade maior que zero.');const ref={itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:''};if(!itemId||!itemForMovement(ref))throw new Error('Selecione um item válido.');if(v.orderId&&!findOrder(v.orderId))throw new Error('A OSV vinculada não existe.');
    const oldRef=old?(old.itemType==='Produto'?old.productId:old.supplyId):'',sameRef=!!old&&old.itemType===type&&oldRef===itemId,oldEffect=sameRef?(normalizeText(old.movementType)==='entrada'?num(old.quantity):-num(old.quantity)):0,available=stockOf(type,itemId)-oldEffect;if(v.movementType==='Saída'&&qty>available){if(currentProfileSettings().preventNegativeStock)throw new Error(`Saída maior que o estoque disponível (${available}).`);if(!await confirmAction(`Esta saída deixará o estoque negativo (${available-qty}). Continuar?`))return;}
    const item={id:old?.id||nextCode('MOV',data().stockMovements),itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:v.movementType==='Saída'?'Saída':'Entrada',quantity:qty,date:v.date||today(),orderId:v.orderId||'',notes:v.notes,stockBefore:available,stockAfter:available+(v.movementType==='Saída'?-qty:qty),sourceItemId:'',origin:old?.origin||'manual',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(old)Object.assign(old,item);else data().stockMovements.push(item);recalculateMovementBalances(type,itemId);await persist(old?'Movimentação atualizada':'Estoque movimentado',`${item.movementType} ${qty} · ${itemForMovement(item)?.description||itemId}`);closeModal();renderView();toast('Movimentação salva.');
  };

  renderDocuments = function(){const mode=getViewMode('documents'),termsOn=currentProfileSettings().modules.terms,official=data().serviceOrders.flatMap(o=>{const all=(o.pdfs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))),latest=all.find(m=>m.official!==false&&!isHistoricalPdf219(m))||all.find(m=>m.official!==false&&isHistoricalPdf219(m))||all[0];return latest?[{...latest,order:o}]:[];}).filter(x=>matches(x.fileName,x.order.id,x.order.clientName)).filter(x=>matchesUnifiedPeriod(x.createdAt,'documents'));return `<div class="toolbar"><div class="toolbar-left"><h2>PDFs das OSVs</h2>${unifiedPeriodControls('documents')}${termsOn?`<button class="btn secondary" data-action="new-consent">${icon('signature')} Novo termo</button>`:''}</div><div class="toolbar-right">${viewModeSwitcher('documents',mode)}<span class="badge blue">${official.length} PDFs oficiais</span></div></div><section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table"><thead><tr><th>OSV</th><th>Cliente</th><th>Data/hora</th><th>Arquivo</th><th>Ações</th></tr></thead><tbody>${official.map(x=>`<tr><td><button class="code-link" data-action="view-order" data-id="${attr(x.order.id)}">${esc(x.order.id)}</button></td><td><button class="text-link" data-action="view-client" data-id="${attr(x.order.clientId)}">${esc(x.order.clientName||'Cliente')}</button></td><td>${formatDateTime(x.createdAt)}</td><td><strong>${esc(x.fileName||'Documento.pdf')}</strong></td><td><div class="actions"><button title="Abrir PDF" data-action="open-order-file" data-order="${attr(x.order.id)}" data-media="${attr(x.id)}">${icon('eye')}</button><button title="Enviar ao cliente" data-action="share-order" data-id="${attr(x.order.id)}">${icon('phone')}</button><button title="Abrir cliente" data-action="view-client" data-id="${attr(x.order.clientId)}">${icon('clients')}</button><button title="Abrir OSV" data-action="view-order" data-id="${attr(x.order.id)}">${icon('orders')}</button></div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Nenhum PDF oficial gerado.</div></td></tr>'}</tbody></table></div></section>${termsOn?`<section class="card" style="margin-top:18px"><div class="card-header"><div><h3>Termos e Autorizações</h3><p>Módulo opcional ativo. Registros legados permanecem preservados.</p></div><button class="btn ghost" data-action="documents-terms">Abrir termos</button></div></section>`:''}`;};

  openOrderDetail = function(id){
    const o=findOrder(id);if(!o)return;const c=findClient(o.clientId)||{id:o.clientId,name:o.clientName},items=orderItems(id),payments=orderPayments(id).filter(p=>normalizeText(p.type)==='receita'),f=orderFinancialInfo(o),breakdown=mitOrderBreakdown(o),photos=o.photos||[],pdfs=(o.pdfs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))),attachments=o.attachments||[];
    const paymentHtml=payments.length?payments.map(p=>`<div class="list-row"><div class="list-row-main"><strong>${currency(p.value)} · ${esc(p.paymentMethod||'—')}</strong><small>${p.paymentDate?`Pago em ${formatDate(p.paymentDate)}`:p.dueDate?`Vence em ${formatDate(p.dueDate)}`:'Sem data'}${num(p.fee)?` · taxa ${currency(p.fee)} · valor com taxa ${currency(p.grossValue)}`:''}</small></div>${statusBadge(recordFinancialStatus(p))}<div class="actions"><button data-action="edit-payment" data-id="${attr(p.id)}">${icon('edit')}</button><button title="Cancelar mantendo histórico" data-action="cancel-payment" data-id="${attr(p.id)}">${icon('warning')}</button>${canPermanentlyDeletePayment(p)?`<button title="Excluir definitivamente" data-action="delete-payment" data-id="${attr(p.id)}">${icon('trash')}</button>`:''}</div></div>`).join(''):'<div class="empty">Nenhum pagamento vinculado.</div>';
    const mediaList=(list,empty)=>list.length?list.map(m=>`<div class="list-row"><div class="list-row-main"><strong>${esc(m.fileName||'Arquivo')}</strong><small>${formatDateTime(m.createdAt)}</small></div><div class="actions"><button data-action="open-order-file" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('eye')}</button><button data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash')}</button></div></div>`).join(''):`<div class="empty">${empty}</div>`;
    const photosHtml=photos.length?`<div class="media-grid">${photos.map(m=>`<div class="media-card"><img alt="${attr(m.fileName||'Foto da OSV')}" data-media-id="${attr(m.id)}"><div class="media-overlay">${esc(m.fileName||'Foto')}</div><button data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash',15)}</button></div>`).join('')}</div>`:'<div class="empty">Nenhuma foto vinculada.</div>';
    openModal(`OSV ${o.id}`,`<div class="detail-hero"><div class="toolbar"><div><h2>${esc(o.id)} · ${esc(c.name||o.clientName||'Cliente')}</h2><p>${esc(o.equipmentType||'Equipamento não informado')} ${o.brandModel?`· ${esc(o.brandModel)}`:''}</p></div><div>${statusBadge(o.status)} ${statusBadge(f.status==='Parcial'&&f.overdue?'Parcial - vencido':f.status)}</div></div><div class="detail-meta"><span>Abertura ${formatDate(o.openedAt)}</span><span>${items.length} item(ns)</span><span>Total ${currency(o.total)}</span><span>Pago ${currency(f.paid)}</span><span>Saldo ${currency(f.balance)}</span></div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="edit-order" data-id="${attr(o.id)}">${icon('edit')} Editar OSV</button><button class="btn secondary" data-action="new-payment" data-order="${attr(o.id)}">${icon('plus')} Pagamento</button><button class="btn secondary" data-action="generate-pdf" data-id="${attr(o.id)}">${icon('pdf')} Gerar PDF</button><button class="btn success" data-action="share-order" data-id="${attr(o.id)}">${icon('phone')} WhatsApp</button><button class="btn secondary" data-action="add-order-photos" data-mode="camera" data-id="${attr(o.id)}">${icon('camera')} Tirar foto</button><button class="btn ghost" data-action="add-order-photos" data-mode="gallery" data-id="${attr(o.id)}">${icon('upload')} Galeria</button><button class="btn secondary" data-action="add-order-files" data-id="${attr(o.id)}">${icon('upload')} Anexar laudo</button></div></div><div class="detail-grid"><div><section class="card"><div class="card-header"><h3>Equipamento e diagnóstico</h3></div><dl class="definition-list"><dt>Cliente</dt><dd><button class="text-link" data-action="view-client" data-id="${attr(c.id||'')}">${esc(c.name||o.clientName||'—')}</button></dd><dt>Equipamento</dt><dd>${esc(o.equipmentType||'—')}</dd><dt>Marca / Modelo</dt><dd>${esc(o.brandModel||'—')}</dd><dt>Número de série</dt><dd>${esc(o.serialNumber||'—')}</dd><dt>Senha de acesso</dt><dd>${esc(o.accessPassword||'—')} <small class="muted">(não é enviada no PDF)</small></dd><dt>Acessórios</dt><dd>${esc(o.accessories||'—')}</dd><dt>Defeito relatado</dt><dd>${esc(o.reportedIssue||'—')}</dd><dt>Laudo técnico</dt><dd>${esc(o.technicalReport||'—')}</dd><dt>Observações para o cliente</dt><dd>${esc(o.clientNotes||'—')}</dd><dt>Observação interna</dt><dd>${esc(o.internalNotes||'—')} <small class="muted">(não é enviada no PDF)</small></dd></dl></section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>Itens e Serviços</h3><p>Preço efetivamente praticado nesta OSV.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Subtotal</th></tr></thead><tbody>${items.map(it=>`<tr><td><strong>${esc(itemDescription(it))}</strong><small class="muted">${esc(it.type)}${it.lowerStock?' · baixa de estoque':''}</small></td><td>${num(it.quantity)}</td><td>${currency(it.unitPrice)}</td><td>${currency(it.subtotal)}</td></tr>`).join('')||'<tr><td colspan="4">Nenhum item.</td></tr>'}</tbody></table></div><div class="order-detail-totals detailed"><span>Serviços <b>${currency(breakdown.services)}</b></span><span>Produtos <b>${currency(breakdown.products)}</b></span><span>Custo dos produtos <b>${currency(breakdown.productCost)}</b></span><span>Lucro bruto dos produtos <b>${currency(breakdown.productGrossProfit)}</b></span><span>Desconto por item <b>${currency(breakdown.itemDiscount)}</b></span><span>Desconto geral <b>${currency(breakdown.generalDiscount)}</b></span><strong>Total final ${currency(breakdown.total)}</strong></div></section><section class="card" style="margin-top:16px"><div class="card-header"><h3>Fotos</h3></div>${photosHtml}</section></div><div><section class="card"><div class="card-header"><div><h3>Financeiro</h3><p>${currency(f.paid)} realizado · ${currency(f.balance)} restante.</p></div></div>${paymentHtml}</section><section class="card" style="margin-top:16px"><div class="card-header"><h3>PDF oficial e históricos</h3></div>${mediaList(pdfs,'Nenhum PDF gerado.')}</section><section class="card" style="margin-top:16px"><div class="card-header"><h3>Anexos técnicos</h3></div>${mediaList(attachments,'Nenhum anexo técnico.')}</section><section class="card" style="margin-top:16px"><div class="card-header"><h3>Movimentações de estoque</h3></div>${data().stockMovements.filter(m=>m.orderId===o.id).map(m=>`<div class="list-row"><div class="list-row-main"><strong>${esc(m.id)} · ${esc(itemForMovement(m)?.description||'Item')}</strong><small>${esc(m.movementType)} ${num(m.quantity)} · ${esc(m.notes||'')}</small></div></div>`).join('')||'<div class="empty">Nenhuma movimentação vinculada.</div>'}</section></div></div>`,true);hydrateMediaImages();
  };

  function timestampFile(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  generatePdfForOrder = async function(){throw new Error('O fluxo de PDF v2.2.13 ainda não foi inicializado.');};


  async function viewCurrentOrderPdf(orderId){
    const order=findOrder(orderId);if(!order)throw new Error('OSV não encontrada.');
    const latest=latestOfficialPdfMeta219(orderId);
    if(!latest)throw new Error('Gere o PDF antes de visualizar.');
    if(!isHistoricalPdf219(latest)&&latest.sourceFingerprint!==orderPdfFingerprint219(orderId))throw new Error('PDF desatualizado — gere novamente.');
    const blob=await getMediaBlob(latest);if(!blob)throw new Error('O PDF não está disponível neste dispositivo.');
    const url=URL.createObjectURL(blob),pixCode='';
    document.querySelector('[data-order-pdf-preview]')?.remove();const overlay=document.createElement('div');overlay.className='pdf-preview-overlay-v221 is-open order-pdf-preview-v224';overlay.dataset.orderPdfPreview='1';overlay.dataset.objectUrl=url;overlay.innerHTML=`<section class="pdf-preview-dialog-v221" role="dialog" aria-modal="true" aria-label="Visualização do PDF da ${attr(order.id)}"><header><div><h2>${esc(order.id)} — PDF oficial</h2>${pixCode?'<p>O código Pix pode ser copiado abaixo; o QR Code também está impresso no documento.</p>':''}</div><button class="modal-close" data-action="close-order-pdf-preview" aria-label="Fechar visualização">×</button></header><iframe title="PDF oficial da ${attr(order.id)}" src="${attr(url)}"></iframe><footer>${pixCode?`<button class="btn secondary" data-action="copy-order-pix" data-order="${attr(order.id)}">Copiar código Pix</button>`:''}<button class="btn secondary" data-action="download-order-pdf" data-order="${attr(order.id)}" data-media="${attr(latest.id)}">Baixar PDF</button><button class="btn primary" data-action="close-order-pdf-preview">Fechar</button></footer></section>`;document.body.appendChild(overlay);
  }

  function menuRow(id,index){const enabled=id!=='agenda'||currentProfileSettings().modules.agenda;return `<div class="menu-order-row" draggable="true" data-menu-id="${id}"><span class="drag-handle">⋮⋮</span><div class="list-row-main"><strong>${esc(MENU_LABELS[id])}</strong><small>${enabled?'Ativo no menu':'Módulo desativado'}</small></div><button class="icon-btn" data-action="move-menu" data-id="${id}" data-dir="-1" ${index===0?'disabled':''}>↑</button><button class="icon-btn" data-action="move-menu" data-id="${id}" data-dir="1" ${index===currentProfileSettings().menuOrder.length-1?'disabled':''}>↓</button></div>`;}
  function settingsCategoryStorageKey(){let id='default';try{id=activeProfile()?.id||STATE?.activeProfileId||'default';}catch(_){}return `marco-settings-category:${id}`;}
  function activeSettingsCategory(){try{const saved=sessionStorage.getItem(settingsCategoryStorageKey());if(SETTINGS_CATEGORIES.some(x=>x[0]===saved))SETTINGS_CATEGORY=saved;}catch(_){}return SETTINGS_CATEGORY;}
  function setSettingsCategory(id){if(!SETTINGS_CATEGORIES.some(x=>x[0]===id))id='personalization';SETTINGS_CATEGORY=id;try{sessionStorage.setItem(settingsCategoryStorageKey(),id);}catch(_){}return id;}
  function settingsNavigation(active){return `<nav class="settings-category-nav" aria-label="Categorias de configurações">${SETTINGS_CATEGORIES.map(([id,title,description,iconName])=>`<button type="button" class="settings-category-button ${id===active?'is-active':''}" data-action="settings-category" data-settings-category="${attr(id)}" aria-current="${id===active?'page':'false'}"><span class="settings-category-icon">${icon(iconName,18)}</span><span><strong>${esc(title)}</strong><small>${esc(description)}</small></span></button>`).join('')}</nav>`;}
  function settingsModulesCard(s){return `<section class="card"><div class="card-header"><div><h2>Módulos</h2><p>Desative módulos sem apagar dados.</p></div></div><label class="list-row"><div class="list-row-main"><strong>Agenda</strong><small>Remove menu e cartões da Visão Geral.</small></div><input type="checkbox" data-module-setting="agenda" ${s.modules.agenda?'checked':''}></label><label class="list-row"><div class="list-row-main"><strong>Termos e Autorizações</strong><small>Oculta o acesso, preservando registros legados.</small></div><input type="checkbox" data-module-setting="terms" ${s.modules.terms?'checked':''}></label></section>`;}
  function settingsPreferencesCard(s){return `<section class="card"><div class="card-header"><div><h2>Preferências visuais e operacionais</h2><p>Persistidas por perfil e separadas dos registros do sistema.</p></div></div><label class="list-row"><div class="list-row-main"><strong>Ocultar valores no painel</strong><small>Mostra •••• no lugar de valores.</small></div><input type="checkbox" data-setting="dashboardPrivacy" ${s.dashboardPrivacy?'checked':''}></label><label class="list-row"><div class="list-row-main"><strong>Impedir estoque negativo</strong><small>Exige confirmação ou bloqueia saída acima do saldo.</small></div><input type="checkbox" data-setting="preventNegativeStock" ${s.preventNegativeStock?'checked':''}></label><div class="list-row"><div class="list-row-main"><strong>Google Drive obrigatório</strong><small>Toda alteração é confirmada na nuvem.</small></div>${statusBadge('Sempre ativo')}</div><div class="list-row"><div class="list-row-main"><strong>Base local</strong><small>Desativada para impedir conflitos entre dispositivos.</small></div>${statusBadge('Desativada')}</div><button class="btn ghost" data-action="reset-all-layouts">Restaurar todos os layouts padrão</button></section>`;}
  // V2.4.0 — perfis de teste: cria uma base 100% em branco (clientes, OSVs,
  // lançamentos, tudo) para testar sem misturar com os dados reais, e evita que a
  // integração com o Borion herde o companyInstanceId/shadow/tombstones do perfil
  // anterior ("lançamentos de outras versões sujando o sistema"). Um "estoque"
  // (stash) por perfil guarda o bridge de cada um, então voltar para o perfil
  // original restaura a conexão dele com o Borion intacta — só o perfil novo
  // nasce realmente zerado, como um CD virgem.
  function blankProfileData(){return clone(window.MARCO_INITIAL_DATA.dataByProfile.marco);}
  function stashCurrentBridge(){
    const activeId=STATE.activeProfileId;if(!activeId)return;
    STATE.profileBridgeStash=STATE.profileBridgeStash||{};
    STATE.profileBridgeStash[activeId]=clone(STATE.interconnections||{});
  }
  function restoreOrResetBridge(profileId,{reset=false}={}){
    STATE.profileBridgeStash=STATE.profileBridgeStash||{};
    if(reset){STATE.interconnections={};return;}
    const stash=STATE.profileBridgeStash[profileId];
    STATE.interconnections=stash?clone(stash):{};
  }
  function createBlankTestProfile(name){
    const id='perfil_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
    const base=activeProfile();
    const profile={id,name:name||'Teste',role:'Teste',color:base?.color||'#ff642f',pin:'',company:clone(base?.company||{}),createdAt:nowIso()};
    STATE.profiles.push(profile);
    STATE.dataByProfile[id]=blankProfileData();
    return profile;
  }

  // V2.4.0 — "resetar aplicativo por completo": um jeito seguro de zerar TUDO
  // deste dispositivo (todos os perfis, dados e a conexão com o Google Drive)
  // pelo próprio app, em vez de mexer manualmente nas pastas do Drive. Mexer na
  // mão deixa referências de pasta/arquivo velhas presas no navegador (é o que
  // causou os conflitos de reconexão) — resetar por aqui limpa tudo de uma vez,
  // de um jeito que o próprio app sabe recuperar sozinho depois.
  async function factoryResetApp(){
    if(!await confirmAction('Isso vai apagar TUDO deste dispositivo: perfis, clientes, OSVs, lançamentos, fotos locais, rascunhos, backups locais, cache e conexão com o Google Drive. Nada já salvo na nuvem será apagado. Continuar?',{confirmLabel:'Continuar',tone:'danger'}))return;
    if(!await confirmAction('Confirmação final: baixe e guarde o JSON que será criado. Depois do reset, este navegador voltará como uma instalação nova.',{confirmLabel:'Sim, criar backup e resetar',tone:'danger'}))return;
    setSaveStatus('Criando backup de segurança…','warn');
    try{await MarcoStorage.createBackup(STATE,'antes-do-reset-completo');}catch(e){console.warn(e);}
    try{MarcoStorage.downloadJson(STATE,`Marco_Iris_Backup_Antes_Reset_${Date.now()}.json`);}catch(e){console.warn(e);}
    if(GoogleDriveMarco.isConfigured()){
      try{await serializeCloudWrite(()=>flushCloudState('antes-reset-completo',{backup:true,retryMedia:true}));}catch(e){console.warn('Backup na nuvem antes do reset não foi confirmado:',e);}
    }
    try{window.MarcoBorionInterop?.stop?.();}catch(e){console.warn(e);}
    try{GoogleDriveMarco.disconnect();}catch(e){console.warn(e);}
    try{await MarcoStorage.forgetFolder();}catch(e){console.warn(e);}
    try{for(const registration of await navigator.serviceWorker?.getRegistrations?.()||[])await registration.unregister();}catch(e){console.warn(e);}
    try{for(const name of await caches.keys())if(name.startsWith('marco-iris-'))await caches.delete(name);}catch(e){console.warn(e);}
    await MarcoStorage.wipeAll();
    toast('Instalação local apagada. Recarregando como aplicativo novo…');
    setTimeout(()=>location.replace(`./?instalacao=nova&cache=${Date.now()}`),700);
  }

  function settingsContent(active,{c,drive,diag,s,lastMigration,activeMigration}){
    if(active==='personalization'){const hub=window.MarcoPersonalization221?.renderPersonalizationCards?.()||'';return `<div class="settings-category-content settings-grid">${hub}${settingsModulesCard(s)}${settingsPreferencesCard(s)}</div>`;}
    if(active==='organization')return `<div class="settings-category-content settings-grid"><section class="card full-settings-card"><div class="card-header"><div><h2>Organização do menu lateral</h2><p>Use as setas para definir a ordem. Configurações permanece sempre acessível.</p></div><button class="btn ghost compact" data-action="reset-menu">Restaurar padrão</button></div><div class="menu-order-list" data-menu-order>${s.menuOrder.map(menuRow).join('')}</div></section><section class="card"><div class="card-header"><div><h2>Organização da Visão Geral</h2><p>Os widgets podem ser movidos e redimensionados diretamente no painel.</p></div></div><button class="btn primary" data-action="navigate" data-view="dashboard">Abrir Visão Geral</button></section><section class="card"><div class="card-header"><div><h2>Restauração de organização</h2><p>Retorna os layouts visuais ao padrão sem apagar clientes, OSVs ou lançamentos.</p></div></div><button class="btn danger" data-action="reset-all-layouts">Restaurar layouts padrão</button></section></div>`;
    if(active==='company')return `<div class="settings-category-content settings-grid"><section class="card"><div class="card-header"><div><h2>Dados da empresa</h2><p>Usados nas OSVs, termos e PDFs.</p></div><button class="btn secondary compact" data-action="edit-company">${icon('edit')} Editar</button></div><dl class="definition-list"><dt>Nome</dt><dd><strong>${esc(c.name||'Marco Iris Soluções em Tecnologia')}</strong></dd><dt>Telefone</dt><dd>${esc(c.phone||'—')}</dd><dt>E-mail</dt><dd>${esc(c.email||'—')}</dd><dt>Instagram</dt><dd>${esc(c.instagram||'—')}</dd><dt>Endereço</dt><dd>${esc([c.address,c.number,c.neighborhood,c.city].filter(Boolean).join(', ')||'—')}</dd></dl></section><section class="card"><div class="card-header"><div><h2>Proteção por PIN</h2><p>Trava a interface deste dispositivo sem alterar os dados da conta.</p></div>${activeProfile().pin?statusBadge('PIN ativo'):statusBadge('Sem PIN')}</div><div class="toolbar"><div class="toolbar-left"><button class="btn secondary" data-action="set-pin">${icon('lock')} ${activeProfile().pin?'Alterar PIN':'Definir PIN'}</button>${activeProfile().pin?`<button class="btn secondary" data-action="lock-now">Bloquear agora</button><button class="btn danger" data-action="remove-pin">Remover PIN</button>`:''}</div></div></section></div>`;
    if(active==='backup')return `<div class="settings-category-content settings-grid"><section class="card migration-card" style="border-color:#ff7a45"><div class="card-header"><div><h2>Migração histórica preparada</h2><p>Importa o pacote privado reconciliado sem publicar dados no GitHub.</p></div>${statusBadge('Pacote privado')}</div><div class="migration-actions"><button class="btn primary" style="background:#ff642f;border-color:#ff642f" data-action="open-legacy-migration">${icon('upload')} Selecionar pacote privado e migrar</button></div><div class="migration-summary"><span>290 OSVs</span><span>142 clientes</span><span>824 itens</span><span>295 pagamentos históricos bloqueados no Borion</span></div></section><section class="card migration-card"><div class="card-header"><div><h2>Migração genérica do AppSheet</h2><p>Use apenas para outras importações manuais; não use no pacote histórico preparado.</p></div>${lastMigration?statusBadge(lastMigration.rolledBack?'Desfeita':'Última importação concluída'):statusBadge('Pronta')}</div><div class="migration-actions"><button class="btn primary" data-action="open-migration-picker">${icon('upload')} Selecionar arquivos genéricos</button>${activeMigration?`<button class="btn danger" data-action="rollback-migration">Desfazer última migração ativa</button>`:''}<button class="btn secondary" data-action="export-migration-log">Exportar log técnico</button></div><div class="migration-summary"><span>${data().migrationHistory.length} execução(ões)</span><span>${s.migrationKeys.length} chave(s) idempotentes</span><span>Backup automático antes da gravação</span></div></section><section class="card full-settings-card"><div class="card-header"><div><h2>Google Drive e backups oficiais</h2><p>Dados, fotos, PDFs, anexos e integração em pastas oficiais do Drive.</p></div>${drive?statusBadge('Google conectado'):statusBadge('Google desconectado')}</div><div class="toolbar"><div class="toolbar-left">${drive?`<button class="btn primary" data-action="sync-google">${icon('cloud')} Sincronizar</button><button class="btn secondary" data-action="load-google">Carregar Drive</button><button class="btn danger" data-action="disconnect-google">Desconectar</button>`:`<button class="btn primary" data-action="connect-google">${icon('cloud')} Conectar Google</button>`}<button class="btn secondary" data-action="manual-save">${icon('save')} Salvar tudo</button><button class="btn secondary" data-action="diagnose-drive">${icon('check')} Testar instalação</button><button class="btn secondary" data-action="export-json">${icon('download')} Exportar JSON</button></div></div><div class="migration-summary"><span>Base local: desativada</span><span>Google Drive: obrigatório</span><span>Backups Drive: autosave-1…20 e forcesave-1…20</span><span>Integração: Borion_Integracoes/marco-iris.bridge.json</span></div></section></div>`;
    return `<div class="settings-category-content settings-grid"><section class="card"><div class="card-header"><div><h2>Diagnóstico e integridade</h2><p>Vínculos, totais, estoque e IDs.</p></div>${diag.total?statusBadge(`${diag.total} alerta(s)`):statusBadge('Tudo íntegro')}</div>${diag.issues.length?`<div class="diagnostic-list">${diag.issues.map(i=>`<div class="diagnostic-row ${i.type}"><div>${icon(i.type==='danger'?'warning':'link')}</div><div><strong>${i.count} · ${esc(i.label)}</strong><small>${esc(i.detail)}</small></div></div>`).join('')}</div>`:'<div class="empty compact-empty">Nenhuma inconsistência estrutural encontrada.</div>'}<button class="btn primary" data-action="repair-links">${icon('check')} Corrigir vínculos seguros</button></section><section class="card full-settings-card"><div class="card-header"><div><h2>Perfis de teste</h2><p>Crie uma base 100% em branco — sem clientes, OSVs ou lançamentos, e com a integração do Borion reiniciada — para testar sem misturar com os dados reais.</p></div><span class="badge blue">${STATE.profiles.length} perfil(is)</span></div><div class="list">${STATE.profiles.map(p=>{const isActive=p.id===STATE.activeProfileId,count=(STATE.dataByProfile[p.id]?.payments||[]).length;return `<div class="list-row"><div class="list-row-main"><strong>${esc(p.name)}</strong><small>${isActive?'Ativo agora · ':''}${count} lançamento(s) · criado em ${formatDate((p.createdAt||'').slice(0,10))}</small></div>${isActive?statusBadge('Ativo'):`<div class="actions"><button class="btn secondary compact" data-action="switch-profile" data-id="${attr(p.id)}">Trocar para este</button>${STATE.profiles.length>1?`<button class="icon-btn danger" data-action="delete-profile" data-id="${attr(p.id)}" title="Excluir perfil">${icon('trash')}</button>`:''}</div>`}</div>`;}).join('')}</div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-test-profile">${icon('plus')} Criar perfil de teste em branco</button></div></div><p class="small muted">Cada perfil guarda sua própria conexão com o Borion. Trocar de perfil não afeta a integração do perfil anterior — ao voltar, ela continua como estava.</p></section><section class="card full-settings-card danger-zone-card"><div class="card-header"><div><h2>Zona de risco</h2><p>Apaga tudo deste dispositivo (todos os perfis, clientes, OSVs, lançamentos) e desconecta o Google Drive daqui — sem apagar nada que já esteja salvo na nuvem. Use quando um reset manual pelas pastas do Drive causar conflitos.</p></div></div><button class="btn danger" data-action="factory-reset-app">${icon('warning')} Resetar aplicativo por completo</button><p class="small muted">Baixa um backup automaticamente antes de apagar. Depois de resetar, o app recarrega do zero e você escolhe a pasta do Google Drive de novo (pode ser uma pasta nova ou a mesma de antes).</p></section><section class="card full-settings-card"><div class="card-header"><div><h2>Histórico de ações</h2><p>Últimas alterações registradas com data, hora e detalhes.</p></div><span class="badge blue">${data().audit.length} registro(s)</span></div><div class="audit-list">${data().audit.slice(0,120).map(a=>`<div class="audit-row"><time>${formatDateTime(a.date)}</time><div><strong>${esc(a.action)}</strong><small>${esc(a.detail||'')}</small></div></div>`).join('')||'<div class="empty">Sem histórico.</div>'}</div></section><section class="card"><div class="card-header"><div><h2>Informações do sistema</h2><p>Dados técnicos úteis para suporte e atualização.</p></div></div><dl class="definition-list"><dt>Versão</dt><dd>${PTS_VERSION}</dd><dt>Perfil</dt><dd>${esc(activeProfile()?.name||'—')}</dd><dt>Modo</dt><dd>${navigator.onLine?'Online':'Offline'}</dd></dl></section></div>`;
  }
  renderSettings = function(){const active=setSettingsCategory(activeSettingsCategory()),c=company(),drive=GoogleDriveMarco.cachedUser(),diag=integrityReport(),s=currentProfileSettings(),lastMigration=data().migrationHistory[0],activeMigration=data().migrationHistory.find(x=>!x.rolledBack);return `<div class="settings-shell-v227">${settingsNavigation(active)}<main class="settings-category-panel" data-settings-panel="${attr(active)}">${settingsContent(active,{c,drive,diag,s,lastMigration,activeMigration})}</main></div>`;};


  function detectCsvDelimiter(text){
    const sample=String(text||'').split(/\r?\n/).filter(Boolean).slice(0,8),candidates=[',',';','\t'];let best=',',score=-1;
    for(const delimiter of candidates){const counts=sample.map(line=>{let q=false,n=0;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"')i++;else q=!q;}else if(!q&&line[i]===delimiter)n++;}return n;});const positive=counts.filter(x=>x>0),consistent=positive.length?positive.filter(x=>x===positive[0]).length:0,current=consistent*100+(positive[0]||0);if(current>score){score=current;best=delimiter;}}
    return best;
  }
  function parseCsv(text){
    const delimiter=detectCsvDelimiter(text),rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell.trim());cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];}else cell+=ch;}if(quoted)throw new Error('CSV inválido: aspas não foram fechadas.');if(cell||row.length){row.push(cell.trim());if(row.some(Boolean))rows.push(row);}if(rows.length<2)return [];const headers=rows.shift().map(h=>h.replace(/^\uFEFF/,'').trim());if(headers.some((h,i)=>!h||headers.indexOf(h)!==i))throw new Error('CSV inválido: cabeçalhos vazios ou duplicados.');return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));}
  function inferEntity(fileName,rows){const name=normalizeText(fileName),headers=normalizeText(Object.keys(rows?.[0]||{}).join(' '));const text=`${name} ${headers}`;if(/cliente|customer/.test(text))return 'clients';if(/ordem|osv|order|defeito|equipamento/.test(text))return 'orders';if(/pagamento|receita|despesa|finance/.test(text))return 'payments';if(/movimenta|movement/.test(text))return 'movements';if(/servico|service/.test(text))return 'services';if(/produto|product/.test(text))return 'products';if(/insumo|supply/.test(text))return 'supplies';return 'unknown';}
  async function sha256File(file){const bytes=await file.arrayBuffer();if(!crypto?.subtle)return `${file.name}:${file.size}:${file.lastModified}`;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function decodePdfLiteral(value){
    return String(value||'').replace(/\\([nrtbf()\\])/g,(_,c)=>({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','(':'(',')':')','\\':'\\'}[c]||c)).replace(/\\([0-7]{1,3})/g,(_,o)=>String.fromCharCode(parseInt(o,8))).replace(/\\\r?\n/g,'');
  }
  function decodePdfHex(value){
    const clean=String(value||'').replace(/\s+/g,'');if(!clean)return '';const bytes=[];for(let i=0;i<clean.length;i+=2)bytes.push(parseInt(clean.slice(i,i+2).padEnd(2,'0'),16)||0);
    if(bytes[0]===0xFE&&bytes[1]===0xFF){let out='';for(let i=2;i+1<bytes.length;i+=2)out+=String.fromCharCode((bytes[i]<<8)|bytes[i+1]);return out;}return String.fromCharCode(...bytes);
  }
  function pdfTextOperators(text){
    const out=[];
    for(const m of String(text||'').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))out.push(decodePdfLiteral(m[1]));
    for(const m of String(text||'').matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g))out.push(decodePdfHex(m[1]));
    for(const m of String(text||'').matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g))for(const part of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g))out.push(part[1]!==undefined?decodePdfLiteral(part[1]):decodePdfHex(part[2]));
    return out.join(' ');
  }
  async function inflatePdfStream(bytes){
    if(typeof DecompressionStream!=='function')return '';for(const format of ['deflate','deflate-raw']){try{const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)),buffer=await new Response(stream).arrayBuffer();return new TextDecoder('latin1').decode(buffer);}catch(_){}}return '';
  }
  async function extractLegacyPdfText(file){
    const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),raw=new TextDecoder('latin1').decode(bytes),parts=[pdfTextOperators(raw)];let cursor=0,streams=0;
    while(streams<80){const marker=raw.indexOf('stream',cursor);if(marker<0)break;let start=marker+6;if(raw[start]==='\r'&&raw[start+1]==='\n')start+=2;else if(raw[start]==='\n'||raw[start]==='\r')start+=1;const end=raw.indexOf('endstream',start);if(end<0)break;const dictStart=raw.lastIndexOf('<<',marker),dict=dictStart>=0?raw.slice(dictStart,marker):'',chunk=bytes.slice(start,end);let decoded='';if(/FlateDecode/i.test(dict))decoded=await inflatePdfStream(chunk);else if(!/DCTDecode|JPXDecode|CCITTFaxDecode/i.test(dict))decoded=new TextDecoder('latin1').decode(chunk);if(decoded)parts.push(pdfTextOperators(decoded));cursor=end+9;streams++;}
    return parts.join(' ').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,20000);
  }
  function inferOrderCodeFromText(value){const match=String(value||'').match(/(?:OSV|OAS|OS)[-_ \/:]*(\d+(?:[-_ ]\d+)*)/i);return match?canonicalCode(match[0],'OSV'):'';}
  async function analyzeLegacyMedia(file){
    const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),fromName=inferOrderCodeFromText(file.name),result={inferredOrderId:fromName,inferenceSource:fromName?'nome do arquivo':'',textPreview:'',textConfidence:'none',reviewWarnings:[]};
    if(!isPdf)return result;try{const text=await extractLegacyPdfText(file);result.textPreview=text.slice(0,700);const fromText=inferOrderCodeFromText(text);if(fromText){result.inferredOrderId=fromText;result.inferenceSource=fromName&&fromName===fromText?'nome e conteúdo do PDF':'conteúdo do PDF';}result.textConfidence=fromText&&text.length>80?'alta':text.length>80?'média':text?'baixa':'nenhuma';if(/item|servi[cç]o|produto|subtotal|valor unit[aá]rio/i.test(text))result.reviewWarnings.push('O PDF contém possíveis itens/serviços. Compare com os dados estruturados antes da importação; o texto não será gravado automaticamente.');if(!text)result.reviewWarnings.push('Não foi possível extrair texto confiável deste PDF. Ele será preservado como evidência e exige vínculo manual pela OSV.');}catch(e){result.textConfidence='erro';result.reviewWarnings.push(`Leitura textual do PDF falhou: ${e.message||'erro desconhecido'}. O arquivo original será preservado.`);}return result;
  }
  async function analyzeMigrationFiles(files){
    const analyzed=[];for(const file of files){const lower=file.name.toLowerCase(),isMedia=file.type.startsWith('image/')||/\.(pdf|jpg|jpeg|png|webp|docx?|xlsx?)$/i.test(lower);let rows=[],error='';if(!isMedia||/\.(csv|json)$/i.test(lower)){try{if(/\.csv$/i.test(lower))rows=parseCsv(await file.text());else if(/\.json$/i.test(lower)){const obj=JSON.parse(await file.text());rows=Array.isArray(obj)?obj:Array.isArray(obj.rows)?obj.rows:Array.isArray(obj.data)?obj.data:[obj];}}catch(e){error=e.message;}}const type=isMedia&&!/\.(csv|json)$/i.test(lower)?'media':inferEntity(file.name,rows),mediaInfo=type==='media'?await analyzeLegacyMedia(file):{};analyzed.push({file,hash:await sha256File(file),rows,type,error,...mediaInfo});}return analyzed;
  }
  function migrationCounts(files){const counts={clients:0,orders:0,items:0,payments:0,services:0,products:0,supplies:0,movements:0,media:0,unknown:0,errors:0};files.forEach(x=>{counts[x.type]=(counts[x.type]||0)+(x.type==='media'?1:x.rows.length);if(x.error)counts.errors++;});return counts;}
  function openMigrationReview(){const counts=migrationCounts(MIGRATION_SESSION.files);openModal('Pré-análise da migração',`<div class="migration-review"><div class="grid kpis migration-kpis">${[['clients','Clientes'],['orders','OSVs'],['items','Itens'],['payments','Pagamentos'],['media','Arquivos'],['unknown','Não reconhecidos'],['errors','Erros']].map(([k,l])=>`<div class="card kpi"><div><small>${l}</small><strong>${counts[k]||0}</strong></div></div>`).join('')}</div><section class="card"><div class="card-header"><div><h3>Arquivos reconhecidos</h3><p>Origem à esquerda; destino editável à direita.</p></div></div><div class="migration-file-list">${MIGRATION_SESSION.files.map((x,i)=>`<div class="migration-file-row"><div class="list-row-main"><strong>${esc(x.file.name)}</strong><small>${x.rows.length?`${x.rows.length} linha(s)`:`${Math.round(x.file.size/1024)} KB`}${x.error?` · erro: ${esc(x.error)}`:''}</small></div><select data-migration-file-type="${i}">${[['clients','Clientes'],['orders','OSVs'],['payments','Pagamentos'],['items','Itens das OSVs'],['services','Serviços'],['products','Produtos'],['supplies','Insumos'],['movements','Movimentações'],['media','Fotos/PDFs/Anexos'],['unknown','Ignorar / revisar']].map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div>`).join('')}</div></section><div class="migration-warning">Nenhum registro será gravado nesta etapa. A simulação é obrigatória antes da importação definitiva.</div><div class="form-actions"><button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary" data-action="simulate-migration">Simular importação</button></div></div>`,true);}
  function rowValue(row,...aliases){const entries=Object.entries(row||{}),wanted=aliases.map(normalizeText);for(const [k,v] of entries){const nk=normalizeText(k);if(wanted.includes(nk)||wanted.some(w=>nk.includes(w)))return v;}return '';}
  function legacyKey(entity,id,sourceHash,index){return `${entity}:${String(id||'').trim()||`${sourceHash}:${index}`}`;}
  function clientByLegacy(row){const id=canonicalCode(rowValue(row,'id','cliente id','codigo cliente'),'CLI'),name=String(rowValue(row,'nome','cliente','name')||'').trim();return findClient(id)||data().clients.find(c=>normalizeText(c.name)===normalizeText(name));}
  function buildMigrationPlan(){
    const plan={creates:[],updates:[],media:[],ignored:[],conflicts:[],keys:[]};
    MIGRATION_SESSION.files.forEach(source=>{if(source.type==='media'){plan.media.push(source);return;}if(source.type==='unknown'){plan.ignored.push({source,reason:'Tipo não reconhecido'});return;}source.rows.forEach((row,index)=>{const entity=source.type,rawId=rowValue(row,'id','codigo','código','key','_rownumber'),key=legacyKey(entity,rawId,source.hash,index);if(currentProfileSettings().migrationKeys.includes(key)){plan.ignored.push({source,row,reason:'Já importado'});return;}let record=null,targetList=null;
      if(entity==='clients'){const id=importedCode(rawId,'CLI',[...data().clients,...plan.creates.filter(x=>x.entity==='clients').map(x=>x.record)]);record={id,name:String(rowValue(row,'nome','cliente','name')||'Cliente importado').trim(),document:maskDocument(rowValue(row,'cpf','cnpj','documento','cpf cnpj')),...phoneFields(rowValue(row,'telefone','celular','phone')),city:rowValue(row,'cidade','city'),state:rowValue(row,'estado','uf')||'SP',address:rowValue(row,'endereco','rua','address'),number:rowValue(row,'numero','número'),neighborhood:rowValue(row,'bairro'),complement:rowValue(row,'complemento'),zip:maskZip(rowValue(row,'cep')),notes:rowValue(row,'observacao','observação'),status:'Ativo',createdAt:nowIso(),legacyKey:key};targetList=data().clients;}
      else if(entity==='orders'){const id=importedCode(rawId||rowValue(row,'os','oas','osv'),'OSV',[...data().serviceOrders,...plan.creates.filter(x=>x.entity==='orders').map(x=>x.record)]),client=clientByLegacy(row),clientName=rowValue(row,'cliente','nome cliente');if(!client&&!clientName){plan.conflicts.push({source,row,index,reason:'OSV sem cliente identificável'});return;}record={id,openedAt:String(rowValue(row,'data abertura','abertura','data')||today()).slice(0,10),completedAt:String(rowValue(row,'data conclusao','conclusão')||'').slice(0,10),clientId:client?.id||'',clientName:client?.name||clientName,equipmentType:rowValue(row,'tipo equipamento','equipamento'),brandModel:rowValue(row,'marca modelo','modelo','marca'),serialNumber:rowValue(row,'numero serie','serial'),accessPassword:rowValue(row,'senha'),accessories:rowValue(row,'acessorios'),reportedIssue:rowValue(row,'defeito','defeito relatado'),technicalReport:rowValue(row,'laudo','laudo tecnico'),status:canonicalOperationalStatus(rowValue(row,'status')),discount:num(rowValue(row,'desconto')),total:num(rowValue(row,'total','valor')),clientNotes:rowValue(row,'observacao cliente'),internalNotes:rowValue(row,'observacao interna'),registrationStatus:'Ativo',photos:[],pdfs:[],attachments:[],createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};targetList=data().serviceOrders;}
      else if(entity==='payments'){const type=normalizeText(rowValue(row,'tipo'))==='despesa'?'Despesa':'Receita',prefix=type==='Despesa'?'DES':'REC',id=importedCode(rawId,prefix,[...data().payments,...plan.creates.filter(x=>x.entity==='payments').map(x=>x.record)]),orderId=canonicalCode(rowValue(row,'os','oas','osv','ordem'),'OSV'),methodRaw=rowValue(row,'forma pagamento','pagamento','metodo'),method=PAYMENT_METHODS.find(x=>normalizeText(x)===normalizeText(methodRaw))||methodRaw||'Outro';record={id,code:id,orderId,type,paymentMethod:method,value:num(rowValue(row,'valor liquido','valor','total')),fee:num(rowValue(row,'taxa')),grossValue:num(rowValue(row,'valor bruto'))||num(rowValue(row,'valor'))+num(rowValue(row,'taxa')),paymentDate:String(rowValue(row,'data pagamento','pago em')||'').slice(0,10),dueDate:String(rowValue(row,'vencimento','data vencimento')||'').slice(0,10),notes:rowValue(row,'observacao'),status:'Em aberto',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};record.status=recordFinancialStatus(record);targetList=data().payments;}
      else if(entity==='services'){const id=importedCode(rawId,'SRV',[...data().services,...plan.creates.filter(x=>x.entity==='services').map(x=>x.record)]);record={id,description:rowValue(row,'descricao','servico','nome'),price:num(rowValue(row,'preco','valor')),status:'Ativo',legacyKey:key};targetList=data().services;}
      else if(entity==='products'){const id=importedCode(rawId,'PRD',[...data().products,...plan.creates.filter(x=>x.entity==='products').map(x=>x.record)]),cost=num(rowValue(row,'custo')),sale=num(rowValue(row,'preco venda','venda','preco'));record={id,description:rowValue(row,'descricao','produto','nome'),brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost,margin:sale>0?(sale-cost)/sale:.5,salePrice:sale||marginPrice(cost,.5),initialStock:0,minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:'Ativo',legacyKey:key};targetList=data().products;}
      else if(entity==='supplies'){const id=importedCode(rawId,'INS',[...data().supplies,...plan.creates.filter(x=>x.entity==='supplies').map(x=>x.record)]);record={id,description:rowValue(row,'descricao','insumo','nome'),brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost:num(rowValue(row,'custo')),initialStock:0,minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:'Ativo',legacyKey:key};targetList=data().supplies;}
      else if(entity==='movements'){const id=importedCode(rawId,'MOV',[...data().stockMovements,...plan.creates.filter(x=>x.entity==='movements').map(x=>x.record)]),type=/insumo/i.test(rowValue(row,'tipo item'))?'Insumo':'Produto',itemId=canonicalCode(rowValue(row,'item id','produto id','insumo id'),type==='Produto'?'PRD':'INS');record={id,itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:/saida|saída/i.test(rowValue(row,'movimento','tipo'))?'Saída':'Entrada',quantity:num(rowValue(row,'quantidade','qtd')),date:String(rowValue(row,'data')||today()).slice(0,10),orderId:canonicalCode(rowValue(row,'os','oas','osv'),'OSV'),notes:rowValue(row,'observacao'),sourceItemId:'',legacyKey:key};targetList=data().stockMovements;}
      if(!record){plan.ignored.push({source,row,reason:'Sem conversor'});return;}const existing=targetList.find(x=>x.id===record.id||x.legacyKey===key);if(existing)plan.updates.push({entity,record,existing,key});else plan.creates.push({entity,record,key});plan.keys.push(key);
    });});return plan;
  }
  function showMigrationSimulation(){const plan=MIGRATION_SESSION.plan=buildMigrationPlan();openModal('Simulação da migração',`<div class="migration-review"><div class="grid kpis migration-kpis">${[['Inclusões',plan.creates.length],['Atualizações',plan.updates.length],['Arquivos',plan.media.length],['Ignorados',plan.ignored.length],['Conflitos',plan.conflicts.length]].map(([l,v])=>`<div class="card kpi"><div><small>${l}</small><strong>${v}</strong></div></div>`).join('')}</div>${plan.conflicts.length?`<section class="card conflict-card"><h3>Conflitos que exigem revisão</h3>${plan.conflicts.slice(0,20).map(c=>`<div class="list-row"><div class="list-row-main"><strong>${esc(c.source.file.name)} · linha ${c.index+2}</strong><small>${esc(c.reason)}</small></div></div>`).join('')}<p>Corrija o arquivo ou altere o tipo inferido e simule novamente. Conflitos não serão gravados.</p></section>`:'<div class="migration-ok">Nenhum conflito impeditivo foi encontrado.</div>'}<section class="card"><h3>Amostra da conversão</h3>${plan.creates.slice(0,12).map(x=>`<div class="list-row"><div class="list-row-main"><strong>${esc(x.entity)} → ${esc(x.record.id||x.record.fileName||'registro')}</strong><small>${esc(x.record.name||x.record.description||x.record.clientName||'')}</small></div></div>`).join('')||'<div class="empty">Nenhuma inclusão nova.</div>'}</section><div class="form-actions"><button class="btn secondary" data-action="migration-back-analysis">Voltar à análise</button><button class="btn primary" data-action="apply-migration" ${plan.conflicts.length?'disabled':''}>Importar definitivamente</button></div></div>`,true);}

  function entityList(entity){const map={clients:data().clients,orders:data().serviceOrders,items:data().orderItems,payments:data().payments,services:data().services,products:data().products,supplies:data().supplies,movements:data().stockMovements};return map[entity];}
  async function importMigrationMedia(mediaSources,history){
    let linked=0,orphans=0;
    for(const source of mediaSources){
      const file=source.file,match=file.name.match(/(?:OSV|OAS|OS)[-_ ]*(\d+(?:-\d+)*)/i),orderId=canonicalCode(source.targetOrderId||(match?match[0]:''),'OSV'),order=findOrder(orderId);
      if(!order){orphans++;history.mediaOrphans.push({file:file.name,reason:'OSV de destino não encontrada',requestedOrderId:orderId||''});continue;}
      const key=`media:${source.hash}`;
      if(currentProfileSettings().migrationKeys.includes(key))continue;
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isImage=file.type.startsWith('image/')||/\.(jpg|jpeg|png|webp)$/i.test(file.name),kind=isPdf?'pdf':isImage?'photo':'attachment',blob=await materializeBlob(isImage?await optimizeImage(file):file),record=await MarcoStorage.putMedia(blob,{name:file.name,type:blob.type||file.type}),meta={id:`${kind}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,orderId:order.id,kind,fileName:file.name,localKey:record.id,driveFileId:'',webViewLink:'',createdAt:nowIso(),legacy:true,official:isPdf?false:undefined,migrationKey:key};
      const target=isPdf?(order.pdfs=order.pdfs||[]):isImage?(order.photos=order.photos||[]):(order.attachments=order.attachments||[]);
      target.push(meta);history.media.push({orderId:order.id,id:meta.id,localKey:record.id,key,fileName:file.name,kind});currentProfileSettings().migrationKeys.push(key);linked++;
    }
    return {linked,orphans};
  }
  function importedInitialStockCandidate(type,id,quantity){
    return data().stockMovements.find(m=>m.itemType===type&&(type==='Produto'?m.productId===id:m.supplyId===id)&&normalizeText(m.movementType)==='entrada'&&!m.orderId&&Math.abs(num(m.quantity)-num(quantity))<.0001&&(m.origin==='initial-stock'||/inicial|abertura|saldo inicial/i.test(m.notes||'')));
  }
  function recalculateMovementBalances(type,id){
    const rows=data().stockMovements.filter(m=>m.itemType===type&&(type==='Produto'?m.productId===id:m.supplyId===id)).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true}));
    let balance=0;for(const m of rows){m.stockBefore=balance;balance+=movementSign(m)*num(m.quantity);m.stockAfter=balance;}
  }
  async function applyMigration(){
    if(!MIGRATION_SESSION?.plan)throw new Error('Execute a simulação antes de importar.');
    const signature=plan=>JSON.stringify([plan.creates.length,plan.updates.length,plan.ignored.length,plan.conflicts.length,plan.media.length]);
    const baseline=signature(MIGRATION_SESSION.plan);for(let i=0;i<5;i++){const check=buildMigrationPlan();if(signature(check)!==baseline)throw new Error('A simulação não foi consistente entre os cinco ciclos de validação.');}
    if(MIGRATION_SESSION.plan.conflicts.length)throw new Error('Resolva os conflitos antes da importação definitiva.');
    await MarcoStorage.createBackup(STATE,'antes-da-migracao-appsheet');
    const history={id:`MIG-${Date.now()}`,createdAt:nowIso(),rolledBack:false,sourceFiles:MIGRATION_SESSION.files.map(x=>({name:x.file.name,hash:x.hash,type:x.type,rows:x.rows.length,inferredOrderId:x.inferredOrderId||'',textConfidence:x.textConfidence||'none'})),created:[],updatedBefore:[],media:[],mediaOrphans:[],keys:[],validationCycles:5,summary:{},warnings:[],affectedOrderIds:[],priceHistoryBefore:[]};
    for(const source of MIGRATION_SESSION.files)for(const message of source.reviewWarnings||[])history.warnings.push({type:'pdf-review',file:source.file.name,orderId:source.inferredOrderId||'',message});
    const preItems=clone(data().orderItems),entityOrder=['clients','services','products','supplies','orders','items','payments','movements'],pendingInitial=[];
    const creates=MIGRATION_SESSION.plan.creates.slice().sort((a,b)=>entityOrder.indexOf(a.entity)-entityOrder.indexOf(b.entity));
    for(const x of creates){
      const list=entityList(x.entity);if(!list)continue;
      if(x.entity==='orders'&&!x.record.clientId&&x.record.clientName){const c=data().clients.find(c=>normalizeText(c.name)===normalizeText(x.record.clientName));if(c)x.record.clientId=c.id;}
      if((x.entity==='products'||x.entity==='supplies')&&num(x.record.initialStock)>0){pendingInitial.push({entity:x.entity,id:x.record.id,quantity:num(x.record.initialStock),key:x.key});x.record.initialStock=0;}
      list.push(x.record);history.created.push({entity:x.entity,id:x.record.id});history.keys.push(x.key);if(!currentProfileSettings().migrationKeys.includes(x.key))currentProfileSettings().migrationKeys.push(x.key);
    }
    for(const x of MIGRATION_SESSION.plan.updates){
      history.updatedBefore.push({entity:x.entity,id:x.existing.id,before:safeJson(x.existing)});
      if((x.entity==='products'||x.entity==='supplies')&&num(x.record.initialStock)>0){pendingInitial.push({entity:x.entity,id:x.record.id,quantity:num(x.record.initialStock),key:x.key});x.record.initialStock=0;}
      Object.assign(x.existing,x.record);history.keys.push(x.key);if(!currentProfileSettings().migrationKeys.includes(x.key))currentProfileSettings().migrationKeys.push(x.key);
    }
    for(const entry of pendingInitial){
      const type=entry.entity==='products'?'Produto':'Insumo',candidate=importedInitialStockCandidate(type,entry.id,entry.quantity);
      if(candidate){candidate.origin='initial-stock';candidate.notes=candidate.notes||'Estoque inicial importado';continue;}
      const id=nextCode('MOV',data().stockMovements),movement={id,itemType:type,productId:type==='Produto'?entry.id:'',supplyId:type==='Insumo'?entry.id:'',movementType:'Entrada',quantity:entry.quantity,date:today(),orderId:'',notes:'Estoque inicial importado do AppSheet',stockBefore:0,stockAfter:entry.quantity,sourceItemId:'',origin:'initial-stock',legacyKey:`${entry.key}:initial-stock`};
      data().stockMovements.push(movement);history.created.push({entity:'movements',id});
    }
    const affectedOrderIds=new Set();for(const x of [...creates,...MIGRATION_SESSION.plan.updates]){if(x.entity==='orders')affectedOrderIds.add(x.record.id);if(x.entity==='items')affectedOrderIds.add(x.record.orderId);if(x.entity==='payments'&&x.record.orderId)affectedOrderIds.add(x.record.orderId);}
    for(const orderId of affectedOrderIds){
      const order=findOrder(orderId);if(!order)continue;
      const oldItems=preItems.filter(x=>x.orderId===orderId),newItems=orderItems(orderId),plannedItems=isCancelledOrder(order)?newItems.map(x=>({...x,lowerStock:false})):newItems;
      for(const item of plannedItems.filter(x=>x.lowerStock&&x.productId)){
        if(data().stockMovements.some(m=>m.sourceItemId===item.id))continue;
        const candidate=data().stockMovements.find(m=>!m.sourceItemId&&m.orderId===orderId&&m.productId===item.productId&&normalizeText(m.movementType)==='saida'&&Math.abs(num(m.quantity)-num(item.quantity))<.0001);
        if(candidate){candidate.sourceItemId=item.id;candidate.origin=candidate.origin||'migration-linked';candidate.notes=candidate.notes||`Baixa automática da ${orderId}`;}
      }
      const beforeMovementIds=new Set(data().stockMovements.map(m=>m.id));reconcileStock(orderId,oldItems,plannedItems);for(const m of data().stockMovements)if(!beforeMovementIds.has(m.id))history.created.push({entity:'movements',id:m.id});
      history.priceHistoryBefore.push(...data().priceHistory.filter(h=>h.orderId===orderId).map(safeJson));syncPriceHistory(order,newItems);
      if(newItems.length){const gross=newItems.reduce((sum,it)=>sum+num(it.subtotal),0),calculated=Math.max(0,gross-num(order.discount)),legacy=num(order.total);if(Math.abs(legacy-calculated)>.01)history.warnings.push({type:'total-divergence',orderId,legacyTotal:legacy,calculatedTotal:calculated,message:'Total legado divergente dos itens estruturados; o total calculado foi adotado.'});order.legacyTotal=legacy;order.total=calculated;}
    }
    history.affectedOrderIds=[...affectedOrderIds];
    const affectedCatalog=new Set();for(const x of [...creates,...MIGRATION_SESSION.plan.updates]){if(x.entity==='products')affectedCatalog.add(`Produto:${x.record.id}`);if(x.entity==='supplies')affectedCatalog.add(`Insumo:${x.record.id}`);if(x.entity==='movements')affectedCatalog.add(`${x.record.itemType}:${x.record.productId||x.record.supplyId}`);}for(const key of affectedCatalog){const [type,id]=key.split(':');recalculateMovementBalances(type,id);}
    const mediaResult=await importMigrationMedia(MIGRATION_SESSION.plan.media,history);
    history.summary={created:history.created.length,updated:history.updatedBefore.length,mediaLinked:mediaResult.linked,mediaOrphans:mediaResult.orphans,ignored:MIGRATION_SESSION.plan.ignored.length,conflicts:0,warnings:history.warnings.length};data().migrationHistory.unshift(history);data().migrationLog.unshift({date:nowIso(),action:'Importação AppSheet concluída',detail:JSON.stringify(history.summary),migrationId:history.id});
    await persist('Migração do AppSheet concluída',`${history.summary.created} inclusões, ${history.summary.updated} atualizações, ${history.summary.mediaLinked} arquivos vinculados.`);MIGRATION_SESSION=null;closeModal();renderView();toast(history.warnings.length?`Migração concluída com ${history.warnings.length} divergência(s) registrada(s).`:'Migração concluída após cinco ciclos de validação.',history.warnings.length?'warn':'ok');
  }
  async function rollbackLastMigration(){
    const h=data().migrationHistory.find(x=>!x.rolledBack);if(!h)throw new Error('Não existe migração ativa para desfazer.');if(!await confirmAction('Desfazer somente os registros e arquivos criados/alterados pela última migração? Dados criados depois permanecerão.'))return;
    await MarcoStorage.createBackup(STATE,'antes-do-rollback-migracao');
    for(const x of h.created){const list=entityList(x.entity);if(list){const idx=list.findIndex(v=>v.id===x.id);if(idx>=0)list.splice(idx,1);}}
    for(const x of h.updatedBefore){const list=entityList(x.entity),current=list?.find(v=>v.id===x.id);if(current)Object.assign(current,x.before);}
    if(Array.isArray(h.affectedOrderIds)){const ids=new Set(h.affectedOrderIds);data().priceHistory=data().priceHistory.filter(x=>!ids.has(x.orderId)).concat((h.priceHistoryBefore||[]).map(safeJson));}
    for(const m of h.media||[]){const order=findOrder(m.orderId);if(order){for(const key of ['photos','pdfs','attachments'])order[key]=(order[key]||[]).filter(x=>x.id!==m.id);}if(m.localKey)await MarcoStorage.deleteMedia(m.localKey);}
    const remove=new Set([...(h.keys||[]),...(h.media||[]).map(x=>x.key)]);currentProfileSettings().migrationKeys=currentProfileSettings().migrationKeys.filter(k=>!remove.has(k));h.rolledBack=true;h.rolledBackAt=nowIso();data().migrationLog.unshift({date:nowIso(),action:'Rollback de migração',detail:h.id,migrationId:h.id});await persist('Migração desfeita',h.id);renderView();toast('Última migração desfeita de forma auditável.');
  }
  function exportMigrationLog(){const payload={exportedAt:nowIso(),history:data().migrationHistory,log:data().migrationLog};MarcoStorage.downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`Marco_Iris_Log_Migracao_${Date.now()}.json`);}

  /* Assistente completo de vínculos da migração AppSheet */
  const MIGRATION_FIELD_TARGETS={
    clients:[['id','ID legado'],['nome','Nome'],['cpf','CPF/CNPJ'],['telefone','Telefone'],['cidade','Cidade'],['estado','Estado/UF'],['endereco','Rua/Endereço'],['numero','Número'],['bairro','Bairro'],['complemento','Complemento'],['cep','CEP'],['observacao','Observação']],
    orders:[['id','ID/OSV'],['cliente','Cliente'],['data abertura','Data de abertura'],['data conclusao','Data de conclusão'],['tipo equipamento','Tipo de equipamento'],['marca modelo','Marca/Modelo'],['numero serie','Número de série'],['senha','Senha de acesso'],['acessorios','Acessórios'],['defeito','Defeito relatado'],['laudo','Laudo técnico'],['status','Status'],['desconto','Desconto'],['total','Total'],['observacao cliente','Observação para o cliente'],['observacao interna','Observação interna']],
    payments:[['id','ID legado'],['tipo','Tipo'],['osv','OSV vinculada'],['valor liquido','Valor líquido'],['taxa','Taxa'],['valor bruto','Valor com taxa'],['forma pagamento','Forma de pagamento'],['data pagamento','Data do pagamento'],['vencimento','Data de vencimento'],['observacao','Observação']],
    services:[['id','ID legado'],['descricao','Descrição'],['preco','Preço padrão'],['status','Status']],
    products:[['id','ID legado'],['descricao','Descrição'],['marca','Marca'],['fornecedor','Fornecedor'],['custo','Custo'],['preco venda','Preço de venda'],['estoque inicial','Estoque inicial'],['estoque minimo','Estoque mínimo'],['status','Status']],
    supplies:[['id','ID legado'],['descricao','Descrição'],['marca','Marca'],['fornecedor','Fornecedor'],['custo','Custo'],['estoque inicial','Estoque inicial'],['estoque minimo','Estoque mínimo'],['status','Status']],
    movements:[['id','ID legado'],['tipo item','Tipo do item'],['item id','Item'],['movimento','Entrada/Saída'],['quantidade','Quantidade'],['data','Data'],['osv','OSV vinculada'],['observacao','Observação']],
    items:[['id','ID legado'],['osv','OSV vinculada'],['tipo','Tipo Serviço/Produto'],['item id','ID do serviço/produto'],['descricao','Descrição do item'],['quantidade','Quantidade'],['valor unitario','Valor unitário'],['subtotal','Subtotal'],['baixar estoque','Baixar estoque']]
  };
  inferEntity=function(fileName,rows){
    const name=normalizeText(fileName),headers=normalizeText(Object.keys(rows?.[0]||{}).join(' '));
    if(/item|itens|items|detalhe/.test(name)&&/ordem|osv|oas|item/.test(name))return 'items';
    if(/ordem|ordens|osv|oas/.test(name))return 'orders';
    if(/pagamento|pagamentos|receita|receitas|despesa|finance/.test(name))return 'payments';
    if(/movimenta|movement/.test(name))return 'movements';
    if(/servico|servicos|service/.test(name))return 'services';
    if(/produto|produtos|product/.test(name))return 'products';
    if(/insumo|insumos|supply/.test(name))return 'supplies';
    if(/cliente|clientes|customer/.test(name))return 'clients';
    if(/quantidade|valor unitario|subtotal/.test(headers)&&/item|produto|servico/.test(headers)&&/\bos\b|\boas\b|\bosv\b|ordem/.test(headers))return 'items';
    if(/defeito|equipamento|data abertura|numero serie|\bos\b|\boas\b|\bosv\b/.test(headers))return 'orders';
    if(/forma pagamento|data pagamento|valor recebido|vencimento/.test(headers))return 'payments';
    if(/cliente|cpf|cnpj|telefone|bairro|cep/.test(headers))return 'clients';
    return 'unknown';
  };
  const baseAnalyzeMigrationFilesPts=analyzeMigrationFiles;
  analyzeMigrationFiles=async function(files){
    const result=await baseAnalyzeMigrationFilesPts(files);
    result.forEach(source=>{
      if(source.type!=='media'){
        const name=normalizeText(source.file?.name||''),headers=normalizeText(Object.keys(source.rows?.[0]||{}).join(' '));
        if((/item|itens|items|detalhe/.test(name)&&/ordem|osv|oas|item/.test(name))||(/quantidade|valor unitario|subtotal/.test(headers)&&/item|produto|servico/.test(headers)&&/(^| )(os|oas|osv)( |$)|ordem/.test(headers)))source.type='items';
        else if(/ordem|ordens|osv|oas/.test(name)||/defeito|equipamento|data abertura|numero serie/.test(headers))source.type='orders';
        else if(/pagamento|pagamentos|receita|receitas|despesa|finance/.test(name)||/forma pagamento|data pagamento|valor recebido|vencimento/.test(headers))source.type='payments';
        else if(/movimenta|movement/.test(name))source.type='movements';
        else if(/servico|servicos|service/.test(name))source.type='services';
        else if(/produto|produtos|product/.test(name))source.type='products';
        else if(/insumo|insumos|supply/.test(name))source.type='supplies';
        else if(/cliente|clientes|customer/.test(name)||/cliente|cpf|cnpj|telefone|bairro|cep/.test(headers))source.type='clients';
      }
      (source.rows||[]).forEach(row=>{try{Object.defineProperty(row,'__migrationSourceHash',{value:source.hash,enumerable:false,configurable:true});}catch(_){row.__migrationSourceHash=source.hash;}});
    });
    return result;
  };
  function emptyMigrationMappings(){return {fields:{},ignoredFields:{},clients:{},catalog:{},media:{},orderStatus:{},paymentMethod:{},itemType:{}};}
  function migrationSchemaKey(source){const headers=Object.keys(source.rows?.[0]||{}).filter(x=>x!=='__migrationSourceHash').map(normalizeText).sort().join('|');return `${source.type}:${headers}`;}
  function loadMigrationMappings(files){
    const maps=emptyMigrationMappings(),templates=currentProfileSettings().migrationTemplates||{},global=templates.__global||{};
    for(const key of ['clients','catalog','orderStatus','paymentMethod','itemType'])Object.assign(maps[key],safeJson(global[key])||{});
    for(const source of files||[]){const tpl=templates[migrationSchemaKey(source)];if(!tpl)continue;maps.fields[source.hash]=safeJson(tpl.fields)||{};maps.ignoredFields[source.hash]=safeJson(tpl.ignoredFields)||[];}
    return maps;
  }
  async function saveMigrationMappingTemplate(){
    if(!MIGRATION_SESSION)throw new Error('Nenhuma migração em análise.');const maps=migrationMaps(),templates=currentProfileSettings().migrationTemplates=currentProfileSettings().migrationTemplates||{};
    templates.__global={clients:safeJson(maps.clients)||{},catalog:safeJson(maps.catalog)||{},orderStatus:safeJson(maps.orderStatus)||{},paymentMethod:safeJson(maps.paymentMethod)||{},itemType:safeJson(maps.itemType)||{}};
    for(const source of MIGRATION_SESSION.files||[])templates[migrationSchemaKey(source)]={savedAt:nowIso(),fields:safeJson(maps.fields[source.hash])||{},ignoredFields:safeJson(maps.ignoredFields[source.hash])||[]};
    await persist('Mapeamento da migração salvo','Será reaplicado a arquivos com a mesma estrutura.',{folder:false,google:false});toast('Mapeamento salvo no perfil.');
  }
  function migrationMaps(){
    if(!MIGRATION_SESSION)return emptyMigrationMappings();
    MIGRATION_SESSION.mappings=MIGRATION_SESSION.mappings||emptyMigrationMappings();
    for(const key of ['fields','ignoredFields','clients','catalog','media','orderStatus','paymentMethod','itemType'])MIGRATION_SESSION.mappings[key]=MIGRATION_SESSION.mappings[key]||{};
    return MIGRATION_SESSION.mappings;
  }
  const baseRowValuePts=rowValue;
  rowValue=function(row,...aliases){
    const hash=row?.__migrationSourceHash,key=normalizeText(aliases[0]||''),mapped=hash&&migrationMaps().fields?.[hash]?.[key];
    if(mapped&&mapped!=='__ignore__')return row[mapped]??'';
    if(mapped==='__ignore__')return '';
    const ignored=new Set(hash&&migrationMaps().ignoredFields?.[hash]||[]),entries=Object.entries(row||{}).filter(([k])=>k!=='__migrationSourceHash'&&!ignored.has(k)),wanted=aliases.map(normalizeText).filter(Boolean);
    for(const [k,v] of entries)if(wanted.includes(normalizeText(k)))return v;
    const broad=wanted.filter(x=>x.length>=4).sort((a,b)=>b.length-a.length);
    for(const [k,v] of entries){const nk=normalizeText(k);if(broad.some(w=>nk.includes(w)))return v;}
    return '';
  };
  function sourceDistinct(type,...aliases){
    const out=new Map();
    for(const source of MIGRATION_SESSION?.files||[]){if(source.type!==type)continue;for(const row of source.rows||[]){const raw=String(rowValue(row,...aliases)||'').trim();if(raw&&!out.has(normalizeText(raw)))out.set(normalizeText(raw),raw);}}
    return [...out.values()];
  }
  function migrationFieldMappingHtml(source,index){
    if(!source.rows?.length||!MIGRATION_FIELD_TARGETS[source.type])return '';
    const headers=Object.keys(source.rows[0]||{}).filter(k=>k!=='__migrationSourceHash'),targets=MIGRATION_FIELD_TARGETS[source.type],map=migrationMaps().fields[source.hash]||{};
    return `<details class="migration-map-details"><summary>Mapear colunas deste arquivo</summary><div class="migration-map-grid"><div class="migration-map-head">Origem no AppSheet</div><div class="migration-map-head">Destino no sistema novo</div>${headers.map(header=>{const selected=Object.entries(map).find(([,v])=>v===header)?.[0]||'';return `<label>${esc(header)}</label><select data-migration-field-source="${attr(header)}" data-migration-source-hash="${attr(source.hash)}"><option value="">Automático</option><option value="__ignore__">Ignorar coluna</option>${targets.map(([v,l])=>`<option value="${attr(v)}" ${selected===normalizeText(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;}).join('')}</div></details>`;
  }
  function migrationOrderIdsAvailable(){
    const ids=new Set(data().serviceOrders.map(o=>o.id));
    for(const source of MIGRATION_SESSION?.files||[]){if(source.type!=='orders')continue;for(const row of source.rows||[]){const id=canonicalCode(rowValue(row,'os','oas','osv','id','codigo'),'OSV');if(id)ids.add(id);}}
    return [...ids].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  }
  function legacyBoolean(value){const v=normalizeText(value);return ['1','sim','true','verdadeiro','yes','x','marcado'].includes(v);}
  function migrationValueMappingHtml(){
    const maps=migrationMaps(),statusValues=sourceDistinct('orders','status'),methodValues=sourceDistinct('payments','forma pagamento','pagamento','metodo'),itemTypeValues=sourceDistinct('items','tipo','tipo item');
    const importedClientNames=new Set(sourceDistinct('clients','nome','cliente','name').map(normalizeText));
    const unresolvedNames=sourceDistinct('orders','cliente','nome cliente').filter(name=>!data().clients.some(c=>normalizeText(c.name)===normalizeText(name))&&!importedClientNames.has(normalizeText(name)));
    statusValues.forEach(raw=>{const key=normalizeText(raw);if(!maps.orderStatus[key])maps.orderStatus[key]=canonicalOperationalStatus(raw);});
    methodValues.forEach(raw=>{const key=normalizeText(raw);if(!maps.paymentMethod[key])maps.paymentMethod[key]=PAYMENT_METHODS.find(x=>normalizeText(x)===key)||'Outro';});
    itemTypeValues.forEach(raw=>{const key=normalizeText(raw);if(!maps.itemType[key])maps.itemType[key]=/produto/.test(key)?'Produto':/servico/.test(key)?'Serviço':'';});
    const sections=[];
    if(statusValues.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Vínculo de status das OSVs</h3><p>A nomenclatura original permanece visível para conferência.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${statusValues.map(raw=>`<label>${esc(raw)}</label><select data-migration-map-order-status="${attr(normalizeText(raw))}">${OPERATIONAL_STATUSES.map(v=>`<option ${maps.orderStatus[normalizeText(raw)]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`).join('')}</div></section>`);
    if(methodValues.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Vínculo de formas de pagamento</h3><p>Padronização compartilhada com OSV e Financeiro.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${methodValues.map(raw=>`<label>${esc(raw)}</label><select data-migration-map-payment-method="${attr(normalizeText(raw))}">${PAYMENT_METHODS.map(v=>`<option ${maps.paymentMethod[normalizeText(raw)]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`).join('')}</div></section>`);
    if(itemTypeValues.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Tipos dos itens legados</h3><p>Insumos internos não entram na OSV; mapeie cada nomenclatura para Serviço ou Produto, ou ignore.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${itemTypeValues.map(raw=>{const key=normalizeText(raw),value=maps.itemType[key]||'';return `<label>${esc(raw)}</label><select data-migration-map-item-type="${attr(key)}"><option value="" ${!value?'selected':''}>Resolver antes de importar</option><option value="Serviço" ${value==='Serviço'?'selected':''}>Serviço</option><option value="Produto" ${value==='Produto'?'selected':''}>Produto</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar item</option></select>`;}).join('')}</div></section>`);
    if(unresolvedNames.length)sections.push(`<section class="card migration-mapping-card conflict-card"><div class="card-header"><div><h3>Clientes que exigem vínculo</h3><p>Escolha um cadastro existente, crie um novo durante a migração ou ignore com registro no relatório.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${unresolvedNames.map(raw=>{const key=normalizeText(raw),value=maps.clients[key]||'',ranked=data().clients.slice().sort((a,b)=>{const aa=normalizeText(a.name),bb=normalizeText(b.name);return Number(!aa.startsWith(key.slice(0,2)))-Number(!bb.startsWith(key.slice(0,2)))||a.name.localeCompare(b.name,'pt-BR');});return `<label>${esc(raw)}</label><select data-migration-map-client="${attr(key)}"><option value="" ${!value?'selected':''}>Resolver antes de importar</option><option value="__create__" ${value==='__create__'?'selected':''}>Criar novo cliente “${esc(raw)}”</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar registros deste cliente</option>${ranked.map(c=>`<option value="${attr(c.id)}" ${value===c.id?'selected':''}>Vincular a ${esc(c.name)} · ${esc(c.id)}</option>`).join('')}</select>`;}).join('')}</div></section>`);

    const importedServices=new Set(sourceDistinct('services','descricao','servico','nome').map(normalizeText)),importedProducts=new Set(sourceDistinct('products','descricao','produto','nome').map(normalizeText)),catalogNeeds=new Map();
    for(const source of MIGRATION_SESSION?.files||[]){if(source.type!=='items')continue;for(const row of source.rows||[]){const rawType=String(rowValue(row,'tipo','tipo item')||'').trim(),type=maps.itemType[normalizeText(rawType)]||(/produto/i.test(rawType)?'Produto':/servi/i.test(rawType)?'Serviço':''),rawId=String(rowValue(row,'item id','produto id','servico id','serviço id')||'').trim(),description=String(rowValue(row,'descricao','item','produto','servico','serviço')||'').trim();if(!type||type==='__ignore__')continue;const prefix=type==='Produto'?'PRD':'SRV',id=canonicalCode(rawId,prefix),list=type==='Produto'?data().products:data().services,imported=type==='Produto'?importedProducts:importedServices;if((id&&list.some(x=>x.id===id))||(description&&(list.some(x=>normalizeText(x.description)===normalizeText(description))||imported.has(normalizeText(description)))))continue;const key=`${type}:${normalizeText(description||rawId)}`;if(description||rawId)catalogNeeds.set(key,{key,type,description:description||rawId});}}
    if(catalogNeeds.size)sections.push(`<section class="card migration-mapping-card conflict-card"><div class="card-header"><div><h3>Serviços e produtos não encontrados</h3><p>Vincule a um cadastro existente, crie durante a migração ou ignore o item com registro.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${[...catalogNeeds.values()].map(info=>{const value=maps.catalog[info.key]||'',list=info.type==='Produto'?data().products:data().services;return `<label>${esc(info.description)} <small>(${esc(info.type)})</small></label><select data-migration-map-catalog="${attr(info.key)}"><option value="" ${!value?'selected':''}>Resolver antes de importar</option><option value="__create__" ${value==='__create__'?'selected':''}>Criar novo ${esc(info.type.toLowerCase())}</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar este item</option>${list.map(x=>`<option value="${attr(x.id)}" ${value===x.id?'selected':''}>Vincular a ${esc(x.description)} · ${esc(x.id)}</option>`).join('')}</select>`;}).join('')}</div></section>`);

    const media=(MIGRATION_SESSION?.files||[]).filter(x=>x.type==='media'),orderIds=migrationOrderIdsAvailable();
    if(media.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Vínculo de fotos, PDFs e anexos</h3><p>O arquivo original é preservado. PDFs legados são históricos e não substituem o PDF oficial novo.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Arquivo de origem</div><div class="migration-map-head">OSV de destino</div>${media.map(source=>{const value=maps.media[source.hash]||'',auto=source.inferredOrderId||inferOrderCodeFromText(source.file.name),warnings=source.reviewWarnings||[];return `<label>${esc(source.file.name)}${auto?` <small>· reconhecido ${esc(auto)} por ${esc(source.inferenceSource||'nome')}</small>`:''}${source.textConfidence&&source.textConfidence!=='none'?`<small class="migration-confidence">Leitura do PDF: confiança ${esc(source.textConfidence)}</small>`:''}${warnings.map(w=>`<small class="migration-review-warning">${esc(w)}</small>`).join('')}${source.textPreview?`<details class="migration-pdf-preview"><summary>Conferir texto extraído</summary><p>${esc(source.textPreview)}</p></details>`:''}</label><select data-migration-map-media="${attr(source.hash)}"><option value="" ${!value?'selected':''}>Automático pela evidência disponível</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar com registro</option>${orderIds.map(id=>`<option value="${attr(id)}" ${value===id?'selected':''}>${esc(id)}</option>`).join('')}</select>`;}).join('')}</div></section>`);
    return sections.join('');
  }

  openMigrationReview=function(){
    migrationMaps();const counts=migrationCounts(MIGRATION_SESSION.files);
    openModal('Pré-análise, conflitos e vínculos',`<div class="migration-review"><div class="grid kpis migration-kpis">${[['clients','Clientes'],['orders','OSVs'],['items','Itens'],['payments','Pagamentos'],['media','Arquivos'],['unknown','Não reconhecidos'],['errors','Erros']].map(([k,l])=>`<div class="card kpi"><div><small>${l}</small><strong>${counts[k]||0}</strong></div></div>`).join('')}</div><section class="card"><div class="card-header"><div><h3>Arquivos reconhecidos</h3><p>Origem à esquerda; destino e colunas editáveis à direita.</p></div></div><div class="migration-file-list">${MIGRATION_SESSION.files.map((x,i)=>`<div class="migration-file-block"><div class="migration-file-row"><div class="list-row-main"><strong>${esc(x.file.name)}</strong><small>${x.rows.length?`${x.rows.length} linha(s)`:`${Math.round(x.file.size/1024)} KB`}${x.error?` · erro: ${esc(x.error)}`:''}</small></div><select data-migration-file-type="${i}">${[['clients','Clientes'],['orders','OSVs'],['payments','Pagamentos'],['items','Itens das OSVs'],['services','Serviços'],['products','Produtos'],['supplies','Insumos'],['movements','Movimentações'],['media','Fotos/PDFs/Anexos'],['unknown','Ignorar / revisar']].map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div>${migrationFieldMappingHtml(x,i)}</div>`).join('')}</div></section>${migrationValueMappingHtml()}<div class="migration-warning">Nenhum registro será gravado nesta etapa. A simulação é obrigatória, conflitos impedem a importação e o mapeamento pode ser revisto.</div><div class="form-actions"><button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn secondary" data-action="save-migration-mapping">Salvar mapeamento</button><button class="btn secondary" data-action="refresh-migration-analysis">Atualizar vínculos</button><button class="btn primary" data-action="simulate-migration">Simular importação</button></div></div>`,true);
  };
  function migrationCurrentOrPlanned(plan,entity,id,name=''){
    const list=entityList(entity)||[],planned=plan.creates.filter(x=>x.entity===entity).map(x=>x.record);
    return [...list,...planned].find(x=>(id&&x.id===id)||(name&&normalizeText(x.name||x.description||'')===normalizeText(name)));
  }
  buildMigrationPlan=function(){
    const plan={creates:[],updates:[],media:[],ignored:[],conflicts:[],keys:[]},maps=migrationMaps(),entityRank={clients:0,services:1,products:2,supplies:3,orders:4,items:5,payments:6,movements:7,media:8,unknown:9};
    const sources=(MIGRATION_SESSION.files||[]).slice().sort((a,b)=>(entityRank[a.type]??99)-(entityRank[b.type]??99));
    for(const source of sources){
      if(source.type==='media'){const choice=maps.media[source.hash]||'',targetOrderId=choice&&choice!=='__ignore__'?canonicalCode(choice,'OSV'):source.inferredOrderId||inferOrderCodeFromText(source.file.name);if(choice==='__ignore__'){plan.ignored.push({source,reason:'Arquivo ignorado por decisão do usuário'});continue;}if(!targetOrderId||!migrationCurrentOrPlanned(plan,'orders',targetOrderId)){plan.conflicts.push({source,index:0,reason:`Arquivo ${source.file.name} sem OSV de destino confirmada`});continue;}plan.media.push({...source,targetOrderId});continue;}
      if(source.type==='unknown'){plan.ignored.push({source,reason:'Tipo não reconhecido'});continue;}
      for(let index=0;index<(source.rows||[]).length;index++){
        const row=source.rows[index],entity=source.type,rawId=rowValue(row,'id','codigo','código','key','_rownumber'),key=legacyKey(entity,rawId,source.hash,index);
        if(currentProfileSettings().migrationKeys.includes(key)){plan.ignored.push({source,row,index,reason:'Já importado'});continue;}
        let record=null,targetList=null;
        if(entity==='clients'){
          const id=importedCode(rawId,'CLI',[...data().clients,...plan.creates.filter(x=>x.entity==='clients').map(x=>x.record)]),name=String(rowValue(row,'nome','cliente','name')||'').trim();
          if(!name){plan.conflicts.push({source,row,index,reason:'Cliente sem nome'});continue;}
          record={id,name,document:maskDocument(rowValue(row,'cpf','cnpj','documento','cpf cnpj')),...phoneFields(rowValue(row,'telefone','celular','phone')),city:rowValue(row,'cidade','city'),state:rowValue(row,'estado','uf')||'SP',address:rowValue(row,'endereco','rua','address'),number:rowValue(row,'numero','número'),neighborhood:rowValue(row,'bairro'),complement:rowValue(row,'complemento'),zip:maskZip(rowValue(row,'cep')),notes:rowValue(row,'observacao','observação'),status:'Ativo',createdAt:nowIso(),legacyKey:key};targetList=data().clients;
        }else if(entity==='services'){
          const id=importedCode(rawId,'SRV',[...data().services,...plan.creates.filter(x=>x.entity==='services').map(x=>x.record)]),description=String(rowValue(row,'descricao','servico','nome')||'').trim();if(!description){plan.conflicts.push({source,row,index,reason:'Serviço sem descrição'});continue;}record={id,description,price:num(rowValue(row,'preco','valor')),status:/inativ/i.test(rowValue(row,'status'))?'Inativo':'Ativo',legacyKey:key};targetList=data().services;
        }else if(entity==='products'){
          const id=importedCode(rawId,'PRD',[...data().products,...plan.creates.filter(x=>x.entity==='products').map(x=>x.record)]),cost=num(rowValue(row,'custo')),sale=num(rowValue(row,'preco venda','venda','preco')),description=String(rowValue(row,'descricao','produto','nome')||'').trim();if(!description){plan.conflicts.push({source,row,index,reason:'Produto sem descrição'});continue;}record={id,description,brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost,margin:sale>0?(sale-cost)/sale:.5,salePrice:sale||marginPrice(cost,.5),initialStock:num(rowValue(row,'estoque inicial','estoque','quantidade')),minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:/inativ/i.test(rowValue(row,'status'))?'Inativo':'Ativo',legacyKey:key};targetList=data().products;
        }else if(entity==='supplies'){
          const id=importedCode(rawId,'INS',[...data().supplies,...plan.creates.filter(x=>x.entity==='supplies').map(x=>x.record)]),description=String(rowValue(row,'descricao','insumo','nome')||'').trim();if(!description){plan.conflicts.push({source,row,index,reason:'Insumo sem descrição'});continue;}record={id,description,brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost:num(rowValue(row,'custo')),initialStock:num(rowValue(row,'estoque inicial','estoque','quantidade')),minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:/inativ/i.test(rowValue(row,'status'))?'Inativo':'Ativo',legacyKey:key};targetList=data().supplies;
        }else if(entity==='orders'){
          const id=importedCode(rawId||rowValue(row,'os','oas','osv'),'OSV',[...data().serviceOrders,...plan.creates.filter(x=>x.entity==='orders').map(x=>x.record)]),rawClientName=String(rowValue(row,'cliente','nome cliente')||'').trim(),rawClientId=canonicalCode(rowValue(row,'cliente id','id cliente'),'CLI');
          let client=migrationCurrentOrPlanned(plan,'clients',rawClientId,rawClientName),clientChoice=maps.clients[normalizeText(rawClientName)];
          if(clientChoice&&clientChoice!=='__create__'&&clientChoice!=='__ignore__')client=migrationCurrentOrPlanned(plan,'clients',clientChoice);
          if(clientChoice==='__ignore__'){plan.ignored.push({source,row,index,reason:`Cliente ${rawClientName} ignorado por decisão do usuário`});continue;}
          if(!client&&clientChoice==='__create__'&&rawClientName){const autoKey=`clients:auto:${normalizeText(rawClientName)}`,autoId=nextCode('CLI',[...data().clients,...plan.creates.filter(x=>x.entity==='clients').map(x=>x.record)]),auto={id:autoId,name:rawClientName,document:'',phone:'',phoneNormalized:'',city:'',state:'SP',address:'',number:'',neighborhood:'',complement:'',zip:'',notes:'Criado automaticamente durante vínculo da migração',status:'Ativo',createdAt:nowIso(),legacyKey:autoKey};plan.creates.push({entity:'clients',record:auto,key:autoKey});plan.keys.push(autoKey);client=auto;}
          if(!client){plan.conflicts.push({source,row,index,reason:rawClientName?`Cliente “${rawClientName}” ainda não foi vinculado`:'OSV sem cliente identificável'});continue;}
          const rawStatus=rowValue(row,'status'),status=maps.orderStatus[normalizeText(rawStatus)]||canonicalOperationalStatus(rawStatus);
          record={id,openedAt:String(rowValue(row,'data abertura','abertura','data')||today()).slice(0,10),completedAt:String(rowValue(row,'data conclusao','conclusão')||'').slice(0,10),clientId:client.id,clientName:client.name,equipmentType:rowValue(row,'tipo equipamento','equipamento'),brandModel:rowValue(row,'marca modelo','modelo','marca'),serialNumber:rowValue(row,'numero serie','serial'),accessPassword:rowValue(row,'senha'),accessories:rowValue(row,'acessorios'),reportedIssue:rowValue(row,'defeito','defeito relatado'),technicalReport:rowValue(row,'laudo','laudo tecnico'),status,discount:num(rowValue(row,'desconto')),total:num(rowValue(row,'total','valor')),clientNotes:rowValue(row,'observacao cliente'),internalNotes:rowValue(row,'observacao interna'),registrationStatus:'Ativo',photos:[],pdfs:[],attachments:[],createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};targetList=data().serviceOrders;
        }else if(entity==='items'){
          const orderId=canonicalCode(rowValue(row,'osv','os','oas','ordem'),'OSV');if(!orderId||!migrationCurrentOrPlanned(plan,'orders',orderId)){plan.conflicts.push({source,row,index,reason:'Item sem OSV válida'});continue;}
          const rawType=String(rowValue(row,'tipo','tipo item')||'').trim(),mappedType=maps.itemType[normalizeText(rawType)]||(/produto/i.test(rawType)?'Produto':/servi/i.test(rawType)?'Serviço':'');if(mappedType==='__ignore__'){plan.ignored.push({source,row,index,reason:`Tipo de item “${rawType}” ignorado`});continue;}if(!mappedType){plan.conflicts.push({source,row,index,reason:`Tipo de item “${rawType||'vazio'}” não mapeado`});continue;}
          const prefix=mappedType==='Produto'?'PRD':'SRV',entityCatalog=mappedType==='Produto'?'products':'services',rawCatalogId=canonicalCode(rowValue(row,'item id','produto id','servico id','serviço id'),prefix),description=String(rowValue(row,'descricao','item','produto','servico','serviço')||'').trim(),catalogKey=`${mappedType}:${normalizeText(description||rawCatalogId)}`;let catalog=migrationCurrentOrPlanned(plan,entityCatalog,rawCatalogId,description),choice=maps.catalog[catalogKey];
          if(choice&&choice!=='__create__'&&choice!=='__ignore__')catalog=migrationCurrentOrPlanned(plan,entityCatalog,choice);
          if(choice==='__ignore__'){plan.ignored.push({source,row,index,reason:`Item “${description||rawCatalogId}” ignorado`});continue;}
          const unitPrice=num(rowValue(row,'valor unitario','preco','valor'));
          if(!catalog&&choice==='__create__'){const autoKey=`${entityCatalog}:auto:${normalizeText(description||rawCatalogId)}`,list=entityCatalog==='products'?[...data().products,...plan.creates.filter(x=>x.entity==='products').map(x=>x.record)]:[...data().services,...plan.creates.filter(x=>x.entity==='services').map(x=>x.record)],id=nextCode(prefix,list);catalog=entityCatalog==='products'?{id,description:description||`Produto importado ${id}`,brand:'',supplier:'',cost:0,margin:0,salePrice:unitPrice,initialStock:0,minimumStock:'',status:'Ativo',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:autoKey}:{id,description:description||`Serviço importado ${id}`,price:unitPrice,status:'Ativo',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:autoKey};plan.creates.push({entity:entityCatalog,record:catalog,key:autoKey});plan.keys.push(autoKey);}
          if(!catalog){plan.conflicts.push({source,row,index,reason:`${mappedType} “${description||rawCatalogId}” não encontrado nem vinculado`});continue;}
          const quantity=Math.max(.01,num(rowValue(row,'quantidade','qtd'))||1),subtotal=num(rowValue(row,'subtotal'))||quantity*unitPrice,id=String(rawId||'').trim()||nextCode('ITM',[...data().orderItems,...plan.creates.filter(x=>x.entity==='items').map(x=>x.record)]);
          record={id,orderId,type:mappedType,productId:mappedType==='Produto'?catalog.id:'',serviceId:mappedType==='Serviço'?catalog.id:'',supplyId:'',quantity,unitPrice,subtotal,lowerStock:mappedType==='Produto'&&legacyBoolean(rowValue(row,'baixar estoque','estoque','baixa')),legacyKey:key};targetList=data().orderItems;
        }else if(entity==='payments'){
          const type=normalizeText(rowValue(row,'tipo'))==='despesa'?'Despesa':'Receita',prefix=type==='Despesa'?'DES':'REC',id=importedCode(rawId,prefix,[...data().payments,...plan.creates.filter(x=>x.entity==='payments').map(x=>x.record)]),rawOrder=rowValue(row,'osv','os','oas','ordem'),orderId=canonicalCode(rawOrder,'OSV');
          if(orderId&&!migrationCurrentOrPlanned(plan,'orders',orderId)){plan.conflicts.push({source,row,index,reason:`Pagamento vinculado à ${orderId}, mas a OSV não foi encontrada`});continue;}
          const methodRaw=String(rowValue(row,'forma pagamento','pagamento','metodo')||'').trim(),method=maps.paymentMethod[normalizeText(methodRaw)]||PAYMENT_METHODS.find(x=>normalizeText(x)===normalizeText(methodRaw))||'Outro',value=num(rowValue(row,'valor liquido','valor','total')),fee=num(rowValue(row,'taxa'));
          record={id,code:id,orderId,type,paymentMethod:method,value,fee,grossValue:num(rowValue(row,'valor bruto'))||value+fee,paymentDate:String(rowValue(row,'data pagamento','pago em')||'').slice(0,10),dueDate:String(rowValue(row,'vencimento','data vencimento')||'').slice(0,10),notes:rowValue(row,'observacao'),status:'Em aberto',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};record.status=recordFinancialStatus(record);targetList=data().payments;
        }else if(entity==='movements'){
          const id=importedCode(rawId,'MOV',[...data().stockMovements,...plan.creates.filter(x=>x.entity==='movements').map(x=>x.record)]),type=/insumo/i.test(rowValue(row,'tipo item'))?'Insumo':'Produto',prefix=type==='Produto'?'PRD':'INS',itemId=canonicalCode(rowValue(row,'item id','produto id','insumo id','item'),prefix),itemEntity=type==='Produto'?'products':'supplies',orderId=canonicalCode(rowValue(row,'osv','os','oas'),'OSV');
          if(!itemId||!migrationCurrentOrPlanned(plan,itemEntity,itemId)){plan.conflicts.push({source,row,index,reason:`Movimentação sem ${type.toLowerCase()} válido`});continue;}if(orderId&&!migrationCurrentOrPlanned(plan,'orders',orderId)){plan.conflicts.push({source,row,index,reason:`Movimentação vinculada à ${orderId}, mas a OSV não foi encontrada`});continue;}
          record={id,itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:/saida|saída/i.test(rowValue(row,'movimento','tipo'))?'Saída':'Entrada',quantity:num(rowValue(row,'quantidade','qtd')),date:String(rowValue(row,'data')||today()).slice(0,10),orderId,notes:rowValue(row,'observacao'),sourceItemId:'',legacyKey:key};targetList=data().stockMovements;
        }
        if(!record){plan.ignored.push({source,row,index,reason:'Sem conversor'});continue;}
        const existing=targetList.find(x=>x.id===record.id||x.legacyKey===key);if(existing)plan.updates.push({entity,record,existing,key});else plan.creates.push({entity,record,key});plan.keys.push(key);
      }
    }
    return plan;
  };

  const MONEY_NAMES=new Set(['price','cost','salePrice','newCost','newPrice','value','fee','discount','unitPrice','subtotal','grossValue']);
  function isMoneyInput(input){return window.MarcoMoney?.isMoneyInput?.(input)||false;}
  function formatMoneyEditor(input){window.MarcoMoney?.bind?.(input);}
  function hydrateMoneyInputs(root=document){window.MarcoMoney?.bindAll?.(root);}
  function editMoneyValue(input){window.MarcoMoney?.bind?.(input);}

  function captureFormLayout(grid){return [...grid.children].filter(x=>x.dataset.layoutField).map((el,order)=>({id:el.dataset.layoutField,order,span:el.dataset.layoutSpan||'half',height:el.dataset.layoutHeight||'auto'}));}
  function restoreFormLayout(grid,layout){const byId=new Map([...grid.children].filter(x=>x.dataset.layoutField).map(x=>[x.dataset.layoutField,x]));(layout||[]).slice().sort((a,b)=>a.order-b.order).forEach(item=>{const el=byId.get(item.id);if(el){grid.appendChild(el);el.dataset.layoutSpan=item.span||'half';el.dataset.layoutHeight=item.height||'auto';}});}
  function applyFormLayout(form){
    const key=form.dataset.layoutKey,grid=form.querySelector('.form-grid');if(!key||!grid)return;const fields=[...grid.children].filter(x=>x.classList.contains('field')||x.classList.contains('check-field'));fields.forEach((el,i)=>{const control=el.querySelector('[name]'),id=control?.name||`field-${i}`;el.dataset.layoutField=id;});
    fields.forEach(el=>{if(!el.dataset.layoutSpan)el.dataset.layoutSpan=screenBand()==='mobile'?'full':el.classList.contains('full')?'full':'half';if(!el.dataset.layoutHeight)el.dataset.layoutHeight='auto';});
    if(!form.dataset.defaultLayout)form.dataset.defaultLayout=JSON.stringify(captureFormLayout(grid));
    const saved=currentProfileSettings().formLayouts[formLayoutKey(key)]||currentProfileSettings().formLayouts[key];if(saved?.fields)restoreFormLayout(grid,saved.fields);
  }
  function hydrateFormLayout(){
    const header=$('#modal-root .modal-header');
    // A Nova/Editar OSV tem uma única fonte de verdade (settings().osvLayout) e um único editor: o
    // mesmo de Configurações → Personalização → Layout da Nova OSV. O formulário da OSV não carrega
    // data-layout-key justamente para que nenhum seletor do editor legado consiga alcançá-lo.
    const orderForm=$('#modal-root form[data-form="order"]');
    if(orderForm){
      // Só oferece o botão se o editor único estiver instalado: melhor não ter botão do que ter um morto.
      if(typeof window.MarcoPersonalization221?.openLayoutEditor!=='function')return;
      if(header&&!header.querySelector('[data-action="open-osv-layout-editor"]'))header.querySelector('h2')?.insertAdjacentHTML('afterend',`<button class="btn ghost compact modal-layout-button" type="button" data-action="open-osv-layout-editor">${icon('edit',16)} Editar layout</button>`);
      return;
    }
    // O editor legado (arrastar campos dentro do .form-grid) continua valendo para os demais cadastros.
    const form=$('#modal-root form[data-layout-key]');if(!form)return;
    applyFormLayout(form);
    if(header&&!header.querySelector('[data-action="toggle-form-layout"]'))header.querySelector('h2')?.insertAdjacentHTML('afterend',`<button class="btn ghost compact modal-layout-button" type="button" data-action="toggle-form-layout">${icon('edit',16)} Editar layout</button>`);
  }
  function normalizeModalActionFlow(root=document.getElementById('modal-root')){
    const body=root?.querySelector?.('.modal-body'),modal=body?.closest?.('.modal'),form=body?.querySelector?.(':scope > form');
    if(!body||!form)return;
    const legacyScroll=form.querySelector(':scope > .modal-form-scroll');
    if(legacyScroll){
      [...legacyScroll.children].forEach(child=>form.insertBefore(child,legacyScroll));
      legacyScroll.remove();
    }
    const actions=form.querySelector(':scope > .form-actions');
    body.classList.remove('has-docked-actions');
    modal?.classList.remove('has-docked-actions');
    actions?.classList.remove('modal-action-dock','sticky-actions');
    actions?.querySelectorAll('button:not([type])').forEach(button=>button.type=button.classList.contains('primary')?'submit':'button');
  }
  openModal = function(title,content,wide=false){baseOpenModal(title,content,wide);requestAnimationFrame(()=>{normalizeModalActionFlow();hydrateFormLayout();hydrateMoneyInputs($('#modal-root'));});};
  function setFormLayoutEditing(editing){
    const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;form.classList.toggle('form-layout-editing',editing);$$(':scope > .field, :scope > .check-field',grid).forEach(el=>{el.draggable=editing;if(editing&&!el.querySelector('.field-layout-controls'))el.insertAdjacentHTML('afterbegin',`<div class="field-layout-controls"><span class="drag-handle" title="Arraste para reposicionar" aria-label="Mover campo">⋮⋮</span><div><button type="button" data-action="form-field-width" title="Alternar largura">↔</button><button type="button" data-action="form-field-height" title="Alternar altura">↕</button></div></div>`);else if(!editing)el.querySelector('.field-layout-controls')?.remove();});
    const header=$('#modal-root .modal-header'),btn=header?.querySelector('[data-action="toggle-form-layout"]');if(btn)btn.innerHTML=editing?'Salvar layout':`${icon('edit',16)} Editar layout`;
    header?.querySelector('.form-layout-toolbar')?.remove();if(editing)btn?.insertAdjacentHTML('afterend',`<div class="form-layout-toolbar"><button type="button" class="btn secondary compact" data-action="cancel-form-layout">Cancelar</button><button type="button" class="btn ghost compact" data-action="undo-form-layout" ${FORM_LAYOUT_HISTORY.length?'':'disabled'}>Desfazer</button><button type="button" class="btn ghost compact" data-action="reset-form-layout">Restaurar padrão</button><small>${screenBand()}</small></div>`);
  }
  function startFormLayoutEditing(){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;if(form.classList.contains('form-layout-editing')){saveCurrentFormLayout(form);setFormLayoutEditing(false);return;}FORM_LAYOUT_SNAPSHOT=captureFormLayout(grid);FORM_LAYOUT_HISTORY=[];setFormLayoutEditing(true);}
  function pushFormLayoutHistory(grid){FORM_LAYOUT_HISTORY.push(captureFormLayout(grid));if(FORM_LAYOUT_HISTORY.length>30)FORM_LAYOUT_HISTORY.shift();setFormLayoutEditing(true);}
  async function saveCurrentFormLayout(form){const base=form.dataset.layoutKey,grid=form.querySelector('.form-grid');if(!base||!grid)return;currentProfileSettings().formLayouts[formLayoutKey(base)]={fields:captureFormLayout(grid),screenBand:screenBand(),updatedAt:nowIso()};await persist('Layout de formulário salvo',`${base} · ${screenBand()}`,{folder:false,google:false});FORM_LAYOUT_SNAPSHOT=null;FORM_LAYOUT_HISTORY=[];}

  reconcileStock = function(orderId,oldItems,newItems){
    const map=new Map([...oldItems,...newItems].map(x=>[x.id,x]));for(const [itemId,item] of map){const latest=newItems.find(x=>x.id===itemId),desired=latest?.lowerStock&&latest.productId?num(latest.quantity):0,applied=data().stockMovements.filter(m=>m.sourceItemId===itemId).reduce((s,m)=>s+(normalizeText(m.movementType)==='saida'?num(m.quantity):-num(m.quantity)),0),delta=desired-applied;if(Math.abs(delta)<.0001)continue;const ref=latest||item;if(!ref.productId)continue;const stockBefore=stockOf('Produto',ref.productId),movementType=delta>0?'Saída':'Entrada',qty=Math.abs(delta);data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:'Produto',productId:ref.productId,supplyId:'',movementType,quantity:qty,date:today(),orderId,notes:delta>0?`Baixa automática da ${orderId}`:`Reversão automática da ${orderId}`,stockBefore,stockAfter:stockBefore+(movementType==='Entrada'?qty:-qty),sourceItemId:itemId,origin:'osv-auto'});}
  };

  async function changeOrderStatusQuick(id,status){const o=findOrder(id);if(!o)return;const next=canonicalOperationalStatus(status),oldItems=clone(orderItems(id));let cancellation=null;if(next==='Cancelada'&&canonicalOperationalStatus(o.status)!=='Cancelada'){cancellation=await planOrderCancellation(id,oldItems);if(cancellation.abort){renderView();return;}}const reverseStock=next==='Cancelada'?(cancellation?cancellation.reverseStock:o.cancellationEffects?.stock!=='mantido'):false,newPlan=next==='Cancelada'&&reverseStock?oldItems.map(x=>({...x,lowerStock:false})):oldItems;o.status=next;if(next==='Concluída'&&!o.completedAt)o.completedAt=today();if(cancellation)o.cancellationEffects={date:nowIso(),payments:cancellation.paymentAction==='cancel'?'estornados':cancellation.paymentAction==='preserve'?'preservados':'nenhum',stock:cancellation.hadAutomaticStock?(cancellation.reverseStock?'revertido':'mantido'):'nenhum'};reconcileStock(id,oldItems,newPlan);applyCancellationPaymentDecision(cancellation,id);await persist('Status da OSV atualizado',`${id} → ${next}${cancellation?` · ${cancellationAuditText(cancellation)}`:''}`);renderView();toast('Status atualizado em todos os módulos.');}
  async function cancelPayment(id){const p=data().payments.find(x=>x.id===id);if(!p)return;if(paymentIsCancelled(p)){toast('Este lançamento já está cancelado.','warn');return;}if(!await confirmAction(`Cancelar ${p.id} mantendo o histórico e recalculando a OSV?`))return;p.status='Cancelado';p.cancelledAt=nowIso();p.cancelReason='Cancelado pelo usuário';await persist('Lançamento cancelado',p.id,{immediate:true});closeModal();renderView();toast('Lançamento cancelado e totais recalculados.');}
  async function lookupAddressCep(auto=false){
    const form=$('form[data-form="client"]');if(!form)throw new Error('Formulário de cliente não encontrado.');
    const uf=String(form.elements.state?.value||'').trim(),city=String(form.elements.city?.value||'').replace(/\s*-\s*[A-Z]{2}$/,'').trim(),street=String(form.elements.address?.value||'').trim();
    if(!uf||city.length<2||street.length<3){if(auto)return;throw new Error('Informe Estado, Cidade e ao menos 3 letras da Rua/Endereço.');}
    const box=$('[data-cep-results]',form);if(box)box.innerHTML='<small>Consultando endereço…</small>';
    let response;try{response=await fetch(`https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`);}catch(_){if(box)box.innerHTML='';if(auto)return;throw new Error('Serviço de endereço indisponível. Preencha CEP e bairro manualmente.');}
    if(!response.ok){if(box)box.innerHTML='';if(auto)return;throw new Error('Serviço de endereço indisponível. Preencha manualmente.');}
    const result=await response.json();
    if(!Array.isArray(result)||!result.length){if(box)box.innerHTML=auto?'<small>Nenhum endereço encontrado ainda. Continue digitando ou use o CEP.</small>':'';if(auto)return;throw new Error('Nenhum endereço correspondente foi encontrado.');}
    CEP_SUGGESTIONS=result.filter(x=>x.cep).slice(0,20);
    if(!CEP_SUGGESTIONS.length){if(box)box.innerHTML='';if(auto)return;throw new Error('Nenhum CEP confiável foi encontrado.');}
    renderCepSuggestions();
    if(!auto)toast(CEP_SUGGESTIONS.length>1?'Vários bairros encontrados para esta rua. Toque no bairro correto.':'CEP e bairro sugeridos. Revise antes de salvar.');
  }
  function renderCepSuggestions(){
    const form=$('form[data-form="client"]'),box=$('[data-cep-results]',form);if(!box)return;
    if(!CEP_SUGGESTIONS.length){box.innerHTML='';return;}
    if(CEP_SUGGESTIONS.length===1){applyCepSuggestion(0);return;}
    const title=`<div class="cep-results-title">${CEP_SUGGESTIONS.length} bairros encontrados para esta rua — toque no bairro correto:</div>`;
    const items=CEP_SUGGESTIONS.map((x,i)=>`<button type="button" class="cep-result" data-action="apply-cep-suggestion" data-index="${i}"><strong>${esc(x.bairro||'Bairro não informado')}</strong><small>${esc(x.logradouro||'')} · ${esc(maskZip(x.cep))} · ${esc(x.localidade||'')}/${esc(x.uf||'')}</small></button>`).join('');
    box.innerHTML=title+items;
  }
  function applyCepSuggestion(index){const form=$('form[data-form="client"]'),x=CEP_SUGGESTIONS[num(index)];if(!form||!x)return;form.elements.address.value=x.logradouro||form.elements.address.value;form.elements.neighborhood.value=x.bairro||form.elements.neighborhood.value;form.elements.city.value=x.localidade||form.elements.city.value;form.elements.state.value=x.uf||form.elements.state.value;form.elements.zip.value=maskZip(x.cep);const box=$('[data-cep-results]',form);if(box)box.innerHTML=`<small>Endereço preenchido: ${esc(x.logradouro||'—')} · ${esc(maskZip(x.cep))}. Falta só o número.</small>`;loadCitiesForState(x.uf,x.localidade);form.elements.number?.focus();}
  async function lookupCep(auto=false){
    const form=$('form[data-form="client"]'),cep=digitsOnly(form?.elements.zip?.value);
    if(!form||cep.length!==8){if(auto)return;throw new Error('Informe um CEP com 8 dígitos.');}
    let response;try{response=await fetch(`https://viacep.com.br/ws/${cep}/json/`);}catch(_){if(auto)return;throw new Error('Serviço de CEP indisponível. Preencha manualmente.');}
    if(!response.ok){if(auto)return;throw new Error('Serviço de CEP indisponível. Preencha manualmente.');}
    const result=await response.json();if(result.erro){if(auto)return;throw new Error('CEP não encontrado.');}
    form.elements.address.value=result.logradouro||form.elements.address.value;form.elements.neighborhood.value=result.bairro||form.elements.neighborhood.value;form.elements.city.value=result.localidade||form.elements.city.value;form.elements.state.value=result.uf||form.elements.state.value;form.elements.zip.value=maskZip(cep);
    await loadCitiesForState(result.uf,result.localidade);
    const box=$('[data-cep-results]',form);if(box)box.innerHTML=`<small>Endereço preenchido pelo CEP. Falta só o número.</small>`;
    if(!auto)toast('Endereço sugerido. Revise antes de salvar.');
    form.elements.number?.focus();
  }
  function openTermsList(){const terms=data().consents;openModal('Termos e Autorizações',`<div class="toolbar"><button class="btn primary" data-action="new-consent">${icon('plus')} Novo termo</button></div><div class="list">${terms.map(t=>`<div class="list-row"><div class="list-row-main"><strong>${esc(t.title||'Autorização')}</strong><small>${esc(t.clientName||'Cliente')} · ${esc(t.orderId||'Sem OSV')}</small></div>${statusBadge(t.accepted?'Aceito':t.status||'Pendente')}<div class="actions"><button data-action="edit-consent" data-id="${attr(t.id)}">${icon('edit')}</button><button data-action="print-consent" data-id="${attr(t.id)}">${icon('pdf')}</button></div></div>`).join('')||'<div class="empty">Nenhum termo cadastrado.</div>'}</div>`,true);}

  function renderStagedPhotoPreview(form){
    const box=form?.querySelector('[data-photo-stage]');if(!box)return;
    for(const url of form.__stagedPhotoUrls||[])URL.revokeObjectURL(url);
    const files=form.__stagedPhotos||[],urls=files.map(file=>URL.createObjectURL(file));form.__stagedPhotoUrls=urls;
    box.innerHTML=files.map((f,i)=>`<div class="media-card"><img src="${urls[i]}" alt="Foto pronta para salvar"><div class="media-overlay">Pronta para salvar</div><button type="button" data-action="remove-staged-photo" data-index="${i}">${icon('trash',15)}</button></div>`).join('');
  }

  function appPrompt(title,label,defaultValue='',{multiline=false}={}){
    return new Promise(resolve=>{
      let settled=false,obs=null;
      const settle=v=>{if(settled)return;settled=true;PROMPT_RESOLVE=null;obs?.disconnect();resolve(v);};
      PROMPT_RESOLVE=settle;
      const field=multiline?textarea(label,'value',defaultValue,true):`<div class="field full"><label>${esc(label)}</label><input name="value" value="${attr(defaultValue)}" autocomplete="off"></div>`;
      openModal(title,`<form data-form="app-prompt">${field}<div class="form-actions"><button type="button" class="btn secondary" data-action="cancel-app-prompt">Cancelar</button><button class="btn primary">OK</button></div></form>`);
      requestAnimationFrame(()=>{const el=$('form[data-form="app-prompt"] [name="value"]');el?.focus();if(!multiline)el?.select();});
      const root=document.getElementById('modal-root');
      obs=new MutationObserver(()=>{if(!root.querySelector('form[data-form="app-prompt"]'))settle(null);});
      obs.observe(root,{childList:true,subtree:true});
    });
  }

  handleAction = async function(btn){
    const a=btn.dataset.action;
    try{
      if(a==='settings-category'){setSettingsCategory(btn.dataset.settingsCategory);renderView();return;}
      if(a==='factory-reset-app'){await factoryResetApp();return;}
      if(a==='new-test-profile'){
        const suggested='Teste '+(STATE.profiles.length+1);
        const name=await appPrompt('Novo perfil de teste','Nome do perfil (só para identificar neste dispositivo):',suggested);
        if(name===null)return;
        const clean=String(name||'').trim()||suggested;
        if(!await confirmAction(`Criar o perfil "${clean}" totalmente em branco (sem clientes, OSVs ou lançamentos) e trocar para ele agora? A integração com o Borion também reinicia do zero neste perfil novo — a integração do perfil atual fica guardada e volta intacta se você trocar de volta.`,{confirmLabel:'Criar perfil em branco'}))return;
        await MarcoStorage.createBackup(STATE,'antes-de-criar-perfil-teste');
        stashCurrentBridge();
        const profile=createBlankTestProfile(clean);
        STATE.activeProfileId=profile.id;
        restoreOrResetBridge(profile.id,{reset:true});
        await persist('Perfil de teste criado',clean,{immediate:true});
        renderShell();
        toast(`Perfil "${clean}" criado e ativo — comece os testes.`);
        return;
      }
      if(a==='switch-profile'){
        const target=STATE.profiles.find(p=>p.id===btn.dataset.id);if(!target||target.id===STATE.activeProfileId)return;
        if(!await confirmAction(`Trocar para o perfil "${target.name}"?`))return;
        stashCurrentBridge();
        STATE.activeProfileId=target.id;
        restoreOrResetBridge(target.id,{reset:false});
        await persist('Perfil trocado',target.name,{immediate:true});
        renderShell();
        toast(`Perfil "${target.name}" está ativo agora.`);
        return;
      }
      if(a==='delete-profile'){
        const target=STATE.profiles.find(p=>p.id===btn.dataset.id);if(!target)return;
        if(target.id===STATE.activeProfileId){toast('Troque para outro perfil antes de excluir este.','warn');return;}
        if(STATE.profiles.length<=1)return;
        if(!await confirmAction(`Excluir definitivamente o perfil "${target.name}" e todos os seus dados (clientes, OSVs, lançamentos)? Não pode ser desfeito.`,{confirmLabel:'Excluir perfil',tone:'danger'}))return;
        await MarcoStorage.createBackup(STATE,'antes-de-excluir-perfil');
        STATE.profiles=STATE.profiles.filter(p=>p.id!==target.id);
        delete STATE.dataByProfile[target.id];
        if(STATE.profileBridgeStash)delete STATE.profileBridgeStash[target.id];
        await persist('Perfil excluído',target.name,{immediate:true});
        renderView();
        toast('Perfil excluído.');
        return;
      }
      if(a==='product-sort'){const key=btn.dataset.sortKey;if(!['product','supplier','cost','margin','sale','stock','minimum'].includes(key))return;if(PRODUCT_SORT.key!==key)PRODUCT_SORT={key,direction:'desc'};else PRODUCT_SORT={key,direction:PRODUCT_SORT.direction==='default'?'desc':PRODUCT_SORT.direction==='desc'?'asc':'default'};if(PRODUCT_SORT.direction==='default')PRODUCT_SORT.key=null;saveProductSort();renderView();return;}
      if(a==='view-current-pdf'){await viewCurrentOrderPdf(btn.dataset.id);return;}
      if(a==='clear-order-filters'){ORDER_FILTERS.status='Todos';periodState('orders').month='';periodState('orders').days='';renderView();return;}
      if(a==='clear-finance-filter'){periodState('finance').month='';periodState('finance').days='';renderView();return;}
      if(a==='toggle-dashboard-layout'){DASHBOARD_LAYOUT_SNAPSHOT=clone(dashboardLayoutStore());DASHBOARD_LAYOUT_HISTORY=[];DASHBOARD_LAYOUT_EDIT=true;renderView();return;}
      if(a==='save-dashboard-layout'){DASHBOARD_LAYOUT_EDIT=false;await persist('Layout da Visão Geral salvo',screenBand(),{folder:false,google:false});DASHBOARD_LAYOUT_SNAPSHOT=null;DASHBOARD_LAYOUT_HISTORY=[];renderView();return;}
      if(a==='cancel-dashboard-layout'){const store=dashboardLayoutStore();Object.keys(store).forEach(k=>delete store[k]);Object.assign(store,clone(DASHBOARD_LAYOUT_SNAPSHOT||{}));DASHBOARD_LAYOUT_EDIT=false;DASHBOARD_LAYOUT_SNAPSHOT=null;DASHBOARD_LAYOUT_HISTORY=[];renderView();return;}
      if(a==='undo-dashboard-layout'){const previous=DASHBOARD_LAYOUT_HISTORY.pop();if(previous){const store=dashboardLayoutStore();Object.keys(store).forEach(k=>delete store[k]);Object.assign(store,previous);}renderView();return;}
      if(a==='reset-dashboard-layout'){pushDashboardHistory();const store=dashboardLayoutStore();Object.keys(store).forEach(k=>delete store[k]);renderView();return;}
      if(a==='widget-move'){pushDashboardHistory();const store=dashboardLayoutStore(),cards=$$('.dashboard-widget').sort((x,y)=>num(getComputedStyle(x).order)-num(getComputedStyle(y).order)),ids=cards.map(x=>x.dataset.widgetId),i=ids.indexOf(btn.dataset.id),j=Math.max(0,Math.min(ids.length-1,i+num(btn.dataset.dir)));[ids[i],ids[j]]=[ids[j],ids[i]];ids.forEach((id,order)=>{const l=store[id]||{};store[id]={...l,order};});renderView();return;}
      if(a==='widget-width'){pushDashboardHistory();const store=dashboardLayoutStore(),id=btn.dataset.id,l=store[id]||widgetLayout(id,0),spans=screenBand()==='mobile'?[12]:[3,4,6,8,12],i=Math.max(0,spans.indexOf(l.span));l.span=spans[Math.max(0,Math.min(spans.length-1,i+num(btn.dataset.dir)))];store[id]=l;renderView();return;}
      if(a==='widget-height'){pushDashboardHistory();const store=dashboardLayoutStore(),id=btn.dataset.id,l=store[id]||widgetLayout(id,0),heights=['auto','260px','420px'],i=heights.indexOf(l.height);l.height=heights[(i+1)%heights.length];store[id]=l;renderView();return;}
      if(a==='cancel-app-prompt'){PROMPT_RESOLVE?.(null);closeModal();return;}
      if(a==='remove-staged-photo'){const form=btn.closest('form[data-form="order"]');if(!form)return;form.__stagedPhotos=(form.__stagedPhotos||[]).filter((_,i)=>i!==num(btn.dataset.index));const dt=new DataTransfer();form.__stagedPhotos.forEach(f=>dt.items.add(f));const hidden=form.querySelector('[data-photos-merged]');if(hidden)hidden.files=dt.files;renderStagedPhotoPreview(form);return;}
      if(a==='new-client-from-order'){const form=btn.closest('form[data-form="order"]');PENDING_ORDER_DRAFT=orderDraftFromForm(form);openClientForm();return;}
      if(a==='new-equipment-type'){const value=await appPrompt('Novo tipo de equipamento','Nome do novo tipo de equipamento:','');if(!value)return;const clean=value.trim();if(!clean)return;if([...EQUIPMENT_TYPES,...currentProfileSettings().equipmentTypes].some(x=>normalizeText(x)===normalizeText(clean)))throw new Error('Este tipo de equipamento já existe.');currentProfileSettings().equipmentTypes.push(clean);await persist('Tipo de equipamento criado',clean);const select=btn.closest('.field')?.querySelector('select');if(select){select.insertAdjacentHTML('beforeend',`<option selected>${esc(clean)}</option>`);}toast('Tipo salvo para as próximas OSVs.');return;}
      if(a==='toggle-quick-catalog-create'||a==='cancel-quick-catalog-create'){const form=btn.closest('form[data-form="order"]'),panel=form?.querySelector('[data-quick-catalog-panel]');if(!panel)return;const opening=a==='toggle-quick-catalog-create'&&panel.hidden;panel.hidden=!opening;if(opening){panel.querySelector('[data-quick-catalog-description]')?.focus();panel.scrollIntoView({block:'nearest',behavior:'smooth'});}return;}
      if(a==='save-quick-catalog-item'){
        const form=btn.closest('form[data-form="order"]'),panel=form?.querySelector('[data-quick-catalog-panel]');if(!form||!panel)return;
        const type=panel.querySelector('[data-quick-catalog-type]')?.value==='Produto'?'Produto':'Serviço';
        const description=String(panel.querySelector('[data-quick-catalog-description]')?.value||'').trim();
        const price=Math.max(0,num(panel.querySelector('[data-quick-catalog-price]')?.value));
        const cost=Math.max(0,num(panel.querySelector('[data-quick-catalog-cost]')?.value));
        if(description.length<2)throw new Error('Informe o nome do serviço ou produto.');
        const list=type==='Produto'?data().products:data().services;
        if(list.some(item=>item.status!=='Inativo'&&normalizeText(item.description)===normalizeText(description)))throw new Error(`Já existe ${type.toLowerCase()} com esse nome.`);
        let item;
        if(type==='Produto'){
          const id=nextCode('PRD',data().products),margin=price>0?Math.max(0,Math.min(.99,(price-cost)/price)):0;
          item={id,description,brand:'',supplier:'',cost,margin,suggestedPrice:price,salePrice:price,initialStock:0,minimumStock:0,costUpdatedAt:today(),priceUpdatedAt:today(),status:'Ativo'};
          data().products.push(item);
        }else{
          const id=nextCode('SRV',data().services);
          item={id,description,price,status:'Ativo',createdAt:nowIso(),updatedAt:nowIso()};
          data().services.push(item);
        }
        await persist(type==='Produto'?'Produto criado na OSV':'Serviço criado na OSV',`${item.id} · ${description}`);
        const host=form.querySelector('#order-items-editor');host?.insertAdjacentHTML('beforeend',orderItemRow({type,[type==='Produto'?'productId':'serviceId']:item.id,quantity:1,unitPrice:price,subtotal:price}));
        panel.hidden=true;panel.querySelector('[data-quick-catalog-description]').value='';window.MarcoMoney?.setValue(panel.querySelector('[data-quick-catalog-price]'),0);window.MarcoMoney?.setValue(panel.querySelector('[data-quick-catalog-cost]'),0);
        updateOrderFormTotal();scheduleOrderDraft219(form);host?.lastElementChild?.scrollIntoView({block:'nearest',behavior:'smooth'});toast(`${type} criado e selecionado.`,'ok');return;
      }
      if(a==='copy-code'){await navigator.clipboard?.writeText(btn.dataset.code||'');toast('Código copiado.');return;}
      if(a==='apply-cep-suggestion'){applyCepSuggestion(btn.dataset.index);return;}
      if(a==='add-payment-row'){const host=$('#order-payments-editor'),form=host?.closest('form[data-form="order"]'),remaining=suggestedPaymentValue(form);host?.insertAdjacentHTML('beforeend',paymentEditorRow({value:remaining,paymentMethod:'Pix',paymentDate:today(),__suggested:true}));refreshPaymentRows();scheduleOrderDraft219(form);return;}
      if(a==='remove-payment-row'){
        const row=btn.closest('.payment-editor-row'),form=row?.closest('form[data-form="order"]'),paymentId=row?.dataset.paymentId||'',payment=paymentId?data().payments.find(x=>x.id===paymentId):null;
        if(payment){
          const definitive=canPermanentlyDeletePayment(payment),message=definitive?'Excluir definitivamente este pagamento ao salvar a OSV? Ele sairá do histórico e o número poderá ser reutilizado se for o último da sequência.':'Cancelar este pagamento ao salvar a OSV? Como já passou de 24 horas, o ID e o histórico serão mantidos.';
          if(!await confirmAction(message,{confirmLabel:definitive?'Excluir definitivamente':'Cancelar mantendo histórico',tone:'danger'}))return;
          if(definitive){form.__pendingPaymentDeletes=form.__pendingPaymentDeletes||new Set();form.__pendingPaymentDeletes.add(paymentId);}
        }
        row?.remove();refreshPaymentRows();scheduleOrderDraft219(form);return;
      }
      if(a==='save-order-followup'){const form=btn.closest('form[data-form="order"]');form.dataset.followup=btn.dataset.followup;form.requestSubmit();return;}
      if(a==='cancel-payment'){await cancelPayment(btn.dataset.id);return;}
      if(a==='update-cost'){openCostUpdate(btn.dataset.kind,btn.dataset.id);return;}
      if(a==='lookup-address-cep'){await lookupAddressCep();return;}
      if(a==='apply-cep-suggestion'){applyCepSuggestion(btn.dataset.index);return;}
      if(a==='lookup-cep'){await lookupCep();return;}
      if(a==='move-menu'){const order=currentProfileSettings().menuOrder,id=btn.dataset.id,i=order.indexOf(id),j=Math.max(0,Math.min(order.length-1,i+num(btn.dataset.dir)));if(i>=0&&i!==j){[order[i],order[j]]=[order[j],order[i]];await persist('Menu lateral reordenado',id,{folder:false,google:false});renderView();}return;}
      if(a==='reset-menu'){currentProfileSettings().menuOrder=MENU_DEFAULT.slice();await persist('Ordem do menu restaurada','',{folder:false,google:false});renderView();return;}
      if(a==='reset-all-layouts'){if(!await confirmAction('Restaurar layouts da Visão Geral e janelas sem apagar dados?'))return;currentProfileSettings().dashboardLayout={};currentProfileSettings().dashboardLayouts={};currentProfileSettings().formLayouts={};await persist('Layouts restaurados ao padrão','',{folder:false,google:false});renderView();return;}
      if(a==='move-item-row'){const row=btn.closest('.item-editor-row'),host=row?.parentElement,form=row?.closest('form[data-form="order"]'),rows=host?[...host.querySelectorAll('.item-editor-row')]:[],i=rows.indexOf(row),j=Math.max(0,Math.min(rows.length-1,i+num(btn.dataset.dir)));if(i>=0&&i!==j){if(j>i)host.insertBefore(row,rows[j].nextSibling);else host.insertBefore(row,rows[j]);scheduleOrderDraft219(form);updateOrderFormTotal();row.scrollIntoView({block:'nearest',behavior:'smooth'});}return;}
      if(a==='toggle-form-layout'){startFormLayoutEditing();return;}
      if(a==='cancel-form-layout'){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(grid&&FORM_LAYOUT_SNAPSHOT)restoreFormLayout(grid,FORM_LAYOUT_SNAPSHOT);FORM_LAYOUT_SNAPSHOT=null;FORM_LAYOUT_HISTORY=[];setFormLayoutEditing(false);return;}
      if(a==='undo-form-layout'){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid'),previous=FORM_LAYOUT_HISTORY.pop();if(grid&&previous)restoreFormLayout(grid,previous);setFormLayoutEditing(true);return;}
      if(a==='reset-form-layout'){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;pushFormLayoutHistory(grid);const key=formLayoutKey(form.dataset.layoutKey);delete currentProfileSettings().formLayouts[key];let defaults=[];try{defaults=JSON.parse(form.dataset.defaultLayout||'[]');}catch(_){defaults=[];}restoreFormLayout(grid,defaults);setFormLayoutEditing(true);return;}
      if(a==='form-field-width'){const field=btn.closest('[data-layout-field]'),grid=field?.parentElement;if(!field||!grid)return;pushFormLayoutHistory(grid);const order=screenBand()==='mobile'?['full']:['compact','half','full'],i=Math.max(0,order.indexOf(field.dataset.layoutSpan));field.dataset.layoutSpan=order[(i+1)%order.length];return;}
      if(a==='form-field-height'){const field=btn.closest('[data-layout-field]'),grid=field?.parentElement;if(!field||!grid)return;pushFormLayoutHistory(grid);const order=['auto','compact','tall'],i=Math.max(0,order.indexOf(field.dataset.layoutHeight));field.dataset.layoutHeight=order[(i+1)%order.length];return;}
      if(a==='open-legacy-migration'){if(!window.MarcoLegacyMigration?.open)throw new Error('O módulo de migração histórica não foi carregado. Atualize a página com Ctrl+F5.');await window.MarcoLegacyMigration.open();return;}
      if(a==='open-migration-picker'){const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.csv,.json,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';input.onchange=async()=>{const files=[...(input.files||[])];if(!files.length)return;setSaveStatus('Analisando migração…','warn');const analyzed=await analyzeMigrationFiles(files);MIGRATION_SESSION={files:analyzed,createdAt:nowIso(),plan:null,mappings:loadMigrationMappings(analyzed)};setSaveStatus('Pré-análise concluída','ok');openMigrationReview();};input.click();return;}
      if(a==='save-migration-mapping'){await saveMigrationMappingTemplate();return;}
      if(a==='refresh-migration-analysis'){openMigrationReview();return;}
      if(a==='simulate-migration'){MIGRATION_SESSION.files.forEach((x,i)=>{const select=$(`[data-migration-file-type="${i}"]`);if(select)x.type=select.value;});showMigrationSimulation();return;}
      if(a==='migration-back-analysis'){openMigrationReview();return;}
      if(a==='apply-migration'){await applyMigration();return;}
      if(a==='rollback-migration'){await rollbackLastMigration();return;}
      if(a==='export-migration-log'){exportMigrationLog();return;}
      if(a==='clear-documents-filter'){DOCUMENT_FILTER.date='';renderView();return;}
      if(a==='documents-terms'){openTermsList();return;}
      const result=await baseHandleAction(btn);requestAnimationFrame(()=>hydrateMoneyInputs($('#modal-root')));return result;
    }catch(e){console.error(e);setSaveStatus('Ação pendente','warn');toast(e.message||'Não foi possível concluir a ação.','error');}
  };

  handleSubmit = async function(form){
    if(form.dataset.form==='app-prompt'){const v=String(form.elements.value?.value||'').trim();PROMPT_RESOLVE?.(v||null);closeModal();return;}
    if(form.dataset.submitInflight==='1')return;
    const submit=form.querySelector('[type="submit"],button:not([type])');form.dataset.submitInflight='1';if(submit)submit.disabled=true;
    try{if(form.dataset.form==='cost-update'){await saveCostUpdate(form);return;}return await baseHandleSubmit(form);}
    catch(e){console.error(e);toast(e.message||'Não foi possível salvar.','error');}
    finally{delete form.dataset.submitInflight;if(submit?.isConnected)submit.disabled=false;}
  };

  function refreshStandalonePaymentForm(form){if(!form)return;const value=num(form.elements.value?.value),method=form.elements.paymentMethod?.value||'',hasMachineFee=/débito|crédito|outro/i.test(method),enteredGross=hasMachineFee?num(form.elements.fee?.value):value,grossValue=hasMachineFee?Math.max(value,enteredGross||value):value,fee=Math.max(0,grossValue-value),paymentDate=form.elements.paymentDate?.value||'',dueDate=form.elements.planned?.checked?(form.elements.dueDate?.value||''):'';const preview=form.querySelector('[data-payment-status-preview]');if(preview)preview.textContent=recordFinancialStatus({value,paymentDate,dueDate,status:'Em aberto'});form.querySelector('[data-payment-net]')?.replaceChildren(document.createTextNode(currency(value)));form.querySelector('[data-payment-fee-total]')?.replaceChildren(document.createTextNode(currency(fee)));form.querySelector('[data-payment-gross-total]')?.replaceChildren(document.createTextNode(currency(grossValue)));}
  document.addEventListener('keydown',async e=>{
    if(e.key!=='Enter'||e.shiftKey)return;
    const t=e.target;if(!t.matches)return;
    const isAddr=t.matches('form[data-form="client"] [data-address-fast]'),isZip=t.matches('form[data-form="client"] [data-zip-fast]');
    if(!isAddr&&!isZip)return;
    e.preventDefault();e.stopImmediatePropagation();
    clearTimeout(ADDRESS_LOOKUP_TIMER);
    if(isAddr)await lookupAddressCep(true).catch(()=>{});else await lookupCep(true).catch(()=>{});
    if(document.activeElement===t){const form=t.closest('form');if(isAddr)form?.elements?.zip?.focus();else form?.elements?.number?.focus();}
  });
  document.addEventListener('focusin',e=>{if(isMoneyInput(e.target))MarcoMoney?.bind?.(e.target);});
  document.addEventListener('input',e=>{
    const t=e.target;if(t.closest?.('form[data-form="cost-update"]')){const form=t.closest('form'),cost=num(form.elements.newCost?.value),marginInput=form.elements.newMargin,priceInput=form.elements.newPrice,label=form.querySelector('[data-cost-margin-label]');if(t.matches('[data-cost-margin],[data-cost-new]')&&marginInput&&priceInput){const margin=Math.max(0,Math.min(.99,num(marginInput.value)/100));window.MarcoMoney?.setValue(priceInput,marginPrice(cost,margin));if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}if(t.matches('[data-cost-price]')&&marginInput){const price=num(priceInput.value),margin=price>0?Math.max(0,Math.min(.99,(price-cost)/price)):0;marginInput.value=(margin*100).toFixed(2);if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}}if(t.dataset.mask==='document')t.value=maskDocument(t.value);if(t.dataset.mask==='phone')t.value=maskPhone(t.value);if(t.dataset.mask==='zip')t.value=maskZip(t.value);
    if(t.matches('form[data-form="client"] [data-address-fast]')){clearTimeout(ADDRESS_LOOKUP_TIMER);const val=t.value.trim();if(val.length>=3)ADDRESS_LOOKUP_TIMER=setTimeout(()=>{lookupAddressCep(true).catch(()=>{});},650);}
    if(t.matches('form[data-form="client"] [data-zip-fast]')){clearTimeout(ADDRESS_LOOKUP_TIMER);if(digitsOnly(t.value).length===8)ADDRESS_LOOKUP_TIMER=setTimeout(()=>{lookupCep(true).catch(()=>{});},200);}
    if(t.matches('[data-client-search]')){const select=t.closest('.client-search-row')?.querySelector('select[name="clientId"]'),current=select?.value||'';if(select){select.innerHTML=`<option value="__new__">+ Adicionar novo cliente</option><option value="" ${current?'':'selected'}>Selecione um cliente</option>${sortedActiveClients(t.value).filter(c=>!t.value||normalizeText(c.name).includes(normalizeText(t.value))).map(c=>`<option value="${attr(c.id)}" ${c.id===current?'selected':''}>${esc(c.name)} · ${esc(c.id)}</option>`).join('')}`;}}
    if(t.matches('select[name="clientId"]')&&t.value==='__new__'&&t.closest('form[data-form="order"]')){const form=t.closest('form[data-form="order"]');PENDING_ORDER_DRAFT=orderDraftFromForm(form);openClientForm();return;}
    if(t.matches('[data-product-cost],[data-product-margin]')){const form=t.closest('form[data-form="product"]'),cost=num(form?.elements.cost?.value),margin=num(form?.elements.margin?.value)/100,price=form?.elements.salePrice;if(price)window.MarcoMoney?.setValue(price,marginPrice(cost,margin));const label=form?.querySelector('[data-margin-label]');if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}
    if(t.matches('[data-product-price]')){const form=t.closest('form[data-form="product"]'),cost=num(form?.elements.cost?.value),price=num(form?.elements.salePrice?.value),margin=price>0?Math.max(0,Math.min(.99,(price-cost)/price)):0;if(form?.elements.margin)form.elements.margin.value=(margin*100).toFixed(2);const label=form?.querySelector('[data-margin-label]');if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}
    if(t.matches('[data-payment-field="value"]')&&t.closest('.payment-editor-row')&&e.isTrusted){const row=t.closest('.payment-editor-row');row.dataset.paymentManual='true';row.dataset.paymentAutoSuggested='false';}
    if(t.closest('.payment-editor-row'))refreshPaymentRows();
    if(t.closest('form[data-form="payment"]'))refreshStandalonePaymentForm(t.closest('form'));
  });
  document.addEventListener('change',async e=>{
    const t=e.target;
    if(t.matches('[data-quick-catalog-type]')){
      const panel=t.closest('[data-quick-catalog-panel]'),product=t.value==='Produto';
      const cost=panel?.querySelector('.quick-catalog-cost'),label=panel?.querySelector('[data-quick-catalog-price-label]');
      if(cost)cost.hidden=!product;if(label)label.textContent=product?'Preço de venda':'Valor do serviço';
      return;
    }
    if(t.matches('[data-photo-input]')){
      const form=t.closest('form[data-form="order"]');if(!form)return;
      const files=[...(t.files||[])].filter(f=>f.type.startsWith('image/'));
      if(files.length){
        form.__stagedPhotos=[...(form.__stagedPhotos||[]),...files];
        const dt=new DataTransfer();form.__stagedPhotos.forEach(f=>dt.items.add(f));
        const hidden=form.querySelector('[data-photos-merged]');if(hidden)hidden.files=dt.files;
        renderStagedPhotoPreview(form);
        if(MobileMarco?.isMobile?.())MobileMarco.haptic(6);
        toast(`${files.length} foto(s) pronta(s). Salve a OSV para gravar.`,'ok');
      }
      t.value='';
      return;
    }
    if(t.matches('[data-period-month]')){const section=t.dataset.periodMonth;periodState(section).month=t.value;renderView();return;}
    if(t.matches('[data-period-days]')){const section=t.dataset.periodDays;periodState(section).days=t.value;renderView();return;}
    if(t.id==='order-status-filter'){ORDER_FILTERS.status=t.value;renderView();return;}
    if(t.matches('[data-quick-order-status]')){await changeOrderStatusQuick(t.dataset.quickOrderStatus,t.value);return;}
    if(t.matches('[data-module-setting]')){currentProfileSettings().modules[t.dataset.moduleSetting]=t.checked;if(!t.checked&&CURRENT_VIEW===t.dataset.moduleSetting)CURRENT_VIEW='dashboard';await persist('Módulo atualizado',`${t.dataset.moduleSetting}: ${t.checked?'ativo':'inativo'}`);renderShell();return;}
    if(t.matches('[data-client-state]')){await loadCitiesForState(t.value);return;}
    if(t.matches('.payment-editor-row [data-payment-field]')){const row=t.closest('.payment-editor-row');if(t.matches('[data-payment-field="planned"]')&&t.checked){const paid=$('[data-payment-field="paymentDate"]',row);if(paid)paid.value='';}refreshPaymentRows();return;}
    if(t.closest('form[data-form="payment"]')&&t.name==='type'){const form=t.closest('form');refreshStandalonePaymentType(form);refreshStandalonePaymentForm(form);return;}
    if(t.closest('form[data-form="payment"]')&&(t.name==='planned'||t.name==='paymentMethod')){const form=t.closest('form'),planned=form.elements.planned?.checked;if(t.name==='planned'&&planned)form.elements.paymentDate.value='';form.querySelector('.payment-due')?.classList.toggle('is-hidden',!planned);form.querySelector('.payment-fee')?.classList.toggle('is-hidden',!/débito|crédito|outro/i.test(form.elements.paymentMethod.value));refreshStandalonePaymentForm(form);return;}
    if(t.matches('[data-migration-field-source]')&&MIGRATION_SESSION){const hash=t.dataset.migrationSourceHash,source=t.dataset.migrationFieldSource,map=migrationMaps().fields[hash]=migrationMaps().fields[hash]||{};for(const key of Object.keys(map))if(map[key]===source)delete map[key];if(t.value&&t.value!=='__ignore__')map[normalizeText(t.value)]=source;const ignored=migrationMaps().ignoredFields[hash]=migrationMaps().ignoredFields[hash]||[];migrationMaps().ignoredFields[hash]=ignored.filter(x=>x!==source);if(t.value==='__ignore__')migrationMaps().ignoredFields[hash].push(source);MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-order-status]')&&MIGRATION_SESSION){migrationMaps().orderStatus[t.dataset.migrationMapOrderStatus]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-payment-method]')&&MIGRATION_SESSION){migrationMaps().paymentMethod[t.dataset.migrationMapPaymentMethod]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-client]')&&MIGRATION_SESSION){migrationMaps().clients[t.dataset.migrationMapClient]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-item-type]')&&MIGRATION_SESSION){migrationMaps().itemType[t.dataset.migrationMapItemType]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-catalog]')&&MIGRATION_SESSION){migrationMaps().catalog[t.dataset.migrationMapCatalog]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-media]')&&MIGRATION_SESSION){migrationMaps().media[t.dataset.migrationMapMedia]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-file-type]')&&MIGRATION_SESSION){MIGRATION_SESSION.files[num(t.dataset.migrationFileType)].type=t.value;MIGRATION_SESSION.plan=null;return;}
  });

  let dragSource=null;
  document.addEventListener('dragstart',e=>{const el=e.target.closest('[data-widget-id],[data-menu-id],[data-layout-field]');if(!el)return;dragSource=el;if(el.dataset.layoutField&&el.closest('form[data-layout-key]')?.classList.contains('form-layout-editing'))pushFormLayoutHistory(el.parentElement);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',el.dataset.widgetId||el.dataset.menuId||el.dataset.layoutField||el.dataset.itemId||'');});
  document.addEventListener('dragover',e=>{if(dragSource&&e.target.closest('[data-widget-id],[data-menu-id],[data-layout-field]'))e.preventDefault();});
  document.addEventListener('drop',async e=>{const target=e.target.closest('[data-widget-id],[data-menu-id],[data-layout-field]');if(!dragSource||!target||dragSource===target)return;const sameKind=(dragSource.dataset.widgetId&&target.dataset.widgetId)||(dragSource.dataset.menuId&&target.dataset.menuId)||(dragSource.dataset.layoutField&&target.dataset.layoutField);if(!sameKind||dragSource.parentElement!==target.parentElement){dragSource=null;return;}e.preventDefault();target.parentElement.insertBefore(dragSource,target);if(dragSource.dataset.widgetId){pushDashboardHistory();const store=dashboardLayoutStore();[...target.parentElement.children].filter(x=>x.dataset.widgetId).forEach((x,order)=>{const l=store[x.dataset.widgetId]||{};store[x.dataset.widgetId]={...l,order};});renderView();}else if(dragSource.dataset.menuId){currentProfileSettings().menuOrder=[...target.parentElement.querySelectorAll('[data-menu-id]')].map(x=>x.dataset.menuId);await persist('Menu lateral reordenado','arrastar e soltar',{folder:false,google:false});renderView();}else if(dragSource.dataset.layoutField){const form=target.closest('form[data-layout-key]');if(form?.classList.contains('form-layout-editing'))setFormLayoutEditing(true);}dragSource=null;});

  const baseOpenClientDetail = openClientDetail;
  openClientDetail = function(id){baseOpenClientDetail(id);requestAnimationFrame(()=>{const body=$('#modal-root .modal-body');if(!body)return;body.innerHTML=body.innerHTML.replace(/Nova OS(?!V)/g,'Nova OSV').replace(/\bOS\b/g,'OSV');const history=data().priceHistory.filter(h=>h.clientId===id).sort((a,b)=>String(b.date||'').localeCompare(a.date||''));if(history.length&&!body.querySelector('[data-client-price-history]'))body.insertAdjacentHTML('beforeend',`<section class="card" data-client-price-history style="margin-top:16px"><div class="card-header"><div><h3>Histórico de preços praticados</h3><p>Valores efetivamente cobrados deste cliente, sem alterar o catálogo.</p></div></div>${history.slice(0,30).map(r=>`<div class="list-row"><div class="list-row-main"><strong>${esc(r.description||r.type)} · ${currency(r.unitPrice)}</strong><small>${formatDate(r.date)} · ${esc(r.orderId)} · padrão ${currency(r.standardPrice)} · qtd. ${num(r.quantity)}</small></div><button class="code-link" data-action="view-order" data-id="${attr(r.orderId)}">Abrir OSV</button></div>`).join('')}</section>`);});};

  /* Modo nuvem obrigatória: nenhum atalho de entrada sem Google é criado. */


  /* =========================================================
     v2.2.0 — identificadores, telefones, mídia, WhatsApp, autocomplete,
     PDF, rascunhos e concorrência da OSV.
     ========================================================= */
  const QUICK_STATUS_INFLIGHT_219=new Map();
  const PDF_INFLIGHT_219=new Map();
  const SHARE_INFLIGHT_219=new Map();
  const DRAFT_FLUSH_INFLIGHT_219=new Map();
  const PAYMENT_SAVE_INFLIGHT_219=new Map();
  let ORDER_DRAFT_TIMER_219=0;
  let ORDER_DRAFT_RESTORING_219=false;
  let WHATSAPP_REVIEW_219=null;
  let SUPPRESS_QUICK_ACTION_CLICK_219=false;

  function orderDraftKey219(target='new'){
    const profileId=activeProfile()?.id||STATE?.activeProfileId||'default';
    let suffix='new';
    if(target&&typeof target==='object'&&target.dataset){suffix=target.dataset.id||'new';}
    else if(typeof target==='string'&&target)suffix=target;
    return `osv:${profileId}:${suffix}`;
  }
  function draftFileSignature219(file){return [file?.name||'',file?.size||0,file?.type||'',file?.lastModified||0].join('|');}
  async function persistDraftFiles219(files,previousRefs,key,kind){
    const oldBySignature=new Map((previousRefs||[]).map(ref=>[ref.signature,ref]));
    const next=[];
    for(const file of files||[]){
      if(!(file instanceof Blob)||file.size<=0)continue;
      const signature=draftFileSignature219(file),old=oldBySignature.get(signature);
      if(old){next.push(old);oldBySignature.delete(signature);continue;}
      const record=await MarcoStorage.putDraftMedia(file,{name:file.name||`${kind}.bin`,type:file.type||'application/octet-stream',draftKey:key});
      next.push({id:record.id,signature,name:file.name||record.name,type:file.type||record.type,size:file.size,lastModified:file.lastModified||0,kind});
    }
    for(const stale of oldBySignature.values())await MarcoStorage.deleteDraftMedia(stale.id).catch(e=>console.warn('Falha ao limpar mídia temporária do rascunho:',e));
    return next;
  }
  async function flushOrderDraft219(form=$('form[data-form="order"]')){
    if(!form||ORDER_DRAFT_RESTORING_219||!form.isConnected)return null;
    const key=form.dataset.draftKey||orderDraftKey219(form);
    if(DRAFT_FLUSH_INFLIGHT_219.has(key))return DRAFT_FLUSH_INFLIGHT_219.get(key);
    const task=(async()=>{
      const previous=await MarcoStorage.getDraft(key).catch(()=>null);
      const draft=orderDraftFromForm(form);
      draft.key=key;
      draft.schemaVersion=1;
      draft.reservedCode=form.dataset.reservedCode||draft.__id||'';
      draft.__id=form.dataset.id||draft.reservedCode||'';
      draft.clientSearch=form.querySelector('[data-client-search]')?.value||'';
      draft.updatedAt=nowIso();
      const stagedPhotos=form.__stagedPhotos||[...(form.elements.photos?.files||[])];
      const stagedAttachments=[...(form.elements.attachments?.files||[])];
      draft.photoMedia=await persistDraftFiles219(stagedPhotos,previous?.photoMedia,key,'photo');
      draft.attachmentMedia=await persistDraftFiles219(stagedAttachments,previous?.attachmentMedia,key,'attachment');
      await MarcoStorage.saveDraft(key,draft);
      const status=form.querySelector('[data-draft-status]');
      if(status){status.textContent='Rascunho salvo';status.dataset.tone='ok';}
      return draft;
    })().catch(e=>{console.error('Falha ao salvar rascunho da OSV:',{key,error:e});const status=form.querySelector('[data-draft-status]');if(status){status.textContent='Rascunho pendente';status.dataset.tone='warn';}throw e;}).finally(()=>DRAFT_FLUSH_INFLIGHT_219.delete(key));
    DRAFT_FLUSH_INFLIGHT_219.set(key,task);
    return task;
  }
  function scheduleOrderDraft219(form){
    if(!form||ORDER_DRAFT_RESTORING_219)return;
    clearTimeout(ORDER_DRAFT_TIMER_219);
    const status=form.querySelector('[data-draft-status]');
    if(status){status.textContent='Salvando rascunho…';status.dataset.tone='saving';}
    ORDER_DRAFT_TIMER_219=setTimeout(()=>flushOrderDraft219(form).catch(()=>{}),420);
  }
  async function deleteDraftRecord219(key){
    if(!key)return;
    const draft=await MarcoStorage.getDraft(key).catch(()=>null);
    for(const ref of [...(draft?.photoMedia||[]),...(draft?.attachmentMedia||[])])await MarcoStorage.deleteDraftMedia(ref.id).catch(e=>console.warn('Falha ao remover mídia temporária:',e));
    await MarcoStorage.deleteDraft(key).catch(e=>console.warn('Falha ao excluir rascunho:',e));
  }
  async function discardOrderDraft219(form){
    clearTimeout(ORDER_DRAFT_TIMER_219);
    const key=form?.dataset.draftKey||orderDraftKey219(form||'new');
    await deleteDraftRecord219(key);
    if(form?.dataset.id)await deleteDraftRecord219(orderDraftKey219(form.dataset.id));
    closeModal({reason:'cancelled'});
    toast('Rascunho descartado.','ok');
  }
  async function clearOrderDraftAfterSave219(form,id){
    clearTimeout(ORDER_DRAFT_TIMER_219);
    const keys=new Set([form?.dataset.draftKey,orderDraftKey219('new'),orderDraftKey219(id)].filter(Boolean));
    for(const key of keys)await deleteDraftRecord219(key);
  }
  async function fileFromDraftRef219(ref){
    const record=await MarcoStorage.getMedia(ref.id);if(!record?.blob)return null;
    try{return new File([record.blob],ref.name||record.name||'arquivo',{type:ref.type||record.type||record.blob.type,lastModified:ref.lastModified||Date.now()});}
    catch(_){const blob=record.blob;blob.name=ref.name||record.name||'arquivo';blob.lastModified=ref.lastModified||Date.now();return blob;}
  }
  async function restoreDraftMedia219(form,draft){
    if(!form||!draft)return;
    const photos=(await Promise.all((draft.photoMedia||[]).map(fileFromDraftRef219))).filter(Boolean);
    const attachments=(await Promise.all((draft.attachmentMedia||[]).map(fileFromDraftRef219))).filter(Boolean);
    form.__stagedPhotos=photos;
    if(typeof DataTransfer!=='undefined'){
      const photoDt=new DataTransfer();photos.forEach(f=>photoDt.items.add(f));const photoInput=form.querySelector('[data-photos-merged]');if(photoInput)photoInput.files=photoDt.files;
      const attachmentDt=new DataTransfer();attachments.forEach(f=>attachmentDt.items.add(f));if(form.elements.attachments)form.elements.attachments.files=attachmentDt.files;
    }
    renderStagedPhotoPreview(form);
    if(attachments.length){
      const section=form.querySelector('.osv-technical-attachments');
      if(section&&!section.querySelector('[data-draft-attachments]'))section.insertAdjacentHTML('beforeend',`<div class="compact-file-list" data-draft-attachments>${attachments.map(f=>`<span>${esc(f.name||'Anexo temporário')} · rascunho</span>`).join('')}</div>`);
    }
  }

  function stableHash219(value){
    const walk=v=>Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,walk(v[k])])):v;
    const text=JSON.stringify(walk(value));let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return `fp-${(hash>>>0).toString(16).padStart(8,'0')}`;
  }
  function orderPdfFingerprint219(orderId){
    const o=findOrder(orderId);if(!o)return '';
    const fields=['id','clientId','clientName','pdfTemplateId','openedAt','completedAt','status','equipmentType','brandModel','serialNumber','accessPassword','accessories','reportedIssue','technicalReport','clientNotes','internalNotes','discount','total'];
    const order=Object.fromEntries(fields.map(k=>[k,o[k]??'']));
    const items=orderItems(orderId).map(x=>({id:x.id,type:x.type,productId:x.productId||'',serviceId:x.serviceId||'',quantity:num(x.quantity),unitPrice:num(x.unitPrice),subtotal:num(x.subtotal),lowerStock:!!x.lowerStock})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const payments=orderPayments(orderId).filter(p=>!paymentIsCancelled(p)).map(p=>({id:p.id,value:num(p.value),fee:num(p.fee),paymentMethod:p.paymentMethod||'',paymentDate:p.paymentDate||'',dueDate:p.dueDate||'',notes:p.notes||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const photos=(o.photos||[]).map(m=>({id:m.id,fileName:m.fileName||'',createdAt:m.createdAt||''}));
    const attachments=(o.attachments||[]).map(m=>({id:m.id,fileName:m.fileName||'',createdAt:m.createdAt||''}));
    const template=(currentProfileSettings().pdfTemplates||[]).find(t=>t.id===(o.pdfTemplateId||currentProfileSettings().defaultPdfTemplateId));
    const templateState=template?{id:template.id,version:template.version||1,updatedAt:template.updatedAt||'',schemaVersion:template.schemaVersion||1}:null;
    return stableHash219({order,items,payments,photos,attachments,template:templateState});
  }
  function isHistoricalPdf219(meta){
    return !!(meta?.legacy||meta?.legacyImported||meta?.importedLegacy||meta?.historicalImported||meta?.generatedByCurrentApp===false);
  }
  function latestOfficialPdfMeta219(orderId){
    const order=findOrder(orderId),all=(order?.pdfs||[]).filter(m=>m.official!==false).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return all.find(m=>!isHistoricalPdf219(m))||all.find(isHistoricalPdf219)||null;
  }
  function setPdfState219(form,state,message=''){
    if(!form)return;
    form.dataset.pdfState=state;
    const box=form.querySelector('[data-pdf-status]'),text=form.querySelector('[data-pdf-status-text]'),button=form.querySelector('[data-pdf-generate]');
    if(box){box.dataset.pdfState=state;box.setAttribute('aria-busy',state==='generating'?'true':'false');}
    const labels={idle:'Gere o PDF quando a OSV estiver pronta.',dirty:'PDF desatualizado — gere novamente.',generating:'Gerando PDF…',ready:'PDF pronto',error:'Não foi possível gerar o PDF.'};
    if(text)text.textContent=message||labels[state]||labels.idle;
    if(button){button.disabled=state==='generating';button.setAttribute('aria-busy',state==='generating'?'true':'false');button.innerHTML=state==='generating'?`<span class="pdf-button-spinner" aria-hidden="true"></span><span>Gerando PDF…</span>`:`${icon('pdf')} <span>Gerar PDF</span>`;}
  }
  function markOrderPdfDirty219(form){
    if(!form||ORDER_DRAFT_RESTORING_219||form.dataset.pdfState==='generating')return;
    const hasPdf=form.dataset.hadPdf==='1'||form.dataset.pdfState==='ready';
    if(hasPdf)setPdfState219(form,'dirty','PDF desatualizado — gere novamente.');
  }
  async function setupOrderForm219(form,draft=null){
    if(!form)return;
    ORDER_DRAFT_RESTORING_219=true;
    try{
      form.dataset.draftKey=orderDraftKey219(form.dataset.id||'new');
      form.__pendingMediaDeletes=form.__pendingMediaDeletes||new Set();
      await hydrateOrderFormMedia219(form);
      const preview=form.querySelector('.osv-code-preview');
      if(preview&&!preview.querySelector('[data-draft-status]'))preview.insertAdjacentHTML('beforeend','<span class="draft-save-state" data-draft-status data-tone="idle">Rascunho automático</span>');
      if(draft?.clientSearch&&form.querySelector('[data-client-search]'))form.querySelector('[data-client-search]').value=draft.clientSearch;
      await restoreDraftMedia219(form,draft);
      const orderId=form.dataset.id||'';
      const latest=orderId?latestOfficialPdfMeta219(orderId):null,historical=latest&&isHistoricalPdf219(latest),current=latest&&(historical||latest.sourceFingerprint===orderPdfFingerprint219(orderId));
      form.dataset.hadPdf=latest?'1':'0';
      setPdfState219(form,current?'ready':latest?'dirty':'idle',historical?'PDF histórico preservado e disponível.':current?'PDF pronto':latest?'PDF desatualizado — gere novamente.':'Gere o PDF quando a OSV estiver pronta.');
    }finally{ORDER_DRAFT_RESTORING_219=false;}
  }

  const openOrderForm218=openOrderForm;
  openOrderForm=function(id='',prefill={}){
    const openWith=(payload,draft)=>{
      openOrderForm218(id,payload||{});
      requestAnimationFrame(()=>setupOrderForm219($('form[data-form="order"]'),draft).catch(e=>console.error('Falha ao restaurar rascunho:',e)));
      if(draft&&!draft.__restoredToastShown){draft.__restoredToastShown=true;toast('Rascunho da OSV restaurado.','ok');}
    };
    if(prefill?.__draft||prefill?.__skipStoredDraft){openWith(prefill,prefill?.__draft?prefill:null);return;}
    const key=orderDraftKey219(id||'new');
    MarcoStorage.getDraft(key).then(draft=>openWith(draft?{...draft,__draft:true}:prefill,draft)).catch(e=>{console.error('Falha ao consultar rascunho:',e);openWith(prefill,null);});
  };

  const closeModal218=closeModal;
  closeModal=function(options=false){
    const opts=typeof options==='object'&&options!==null?options:{immediate:options===true,reason:'dismiss'};
    const reason=opts.reason||'dismiss',form=$('#modal-root form[data-form="order"]');
    releaseOrderFormMediaUrls219(form);
    if(form&&!['saved','cancelled','replace-modal'].includes(reason)){
      clearTimeout(ORDER_DRAFT_TIMER_219);
      return flushOrderDraft219(form).catch(()=>{}).finally(()=>closeModal218(!!opts.immediate));
    }
    return closeModal218(!!opts.immediate);
  };

  function clientSuggestionRows219(query){
    const q=normalizeText(query);if(!q)return [];
    return activeItems(data().clients).map(c=>{const name=normalizeText(c.name),first=firstName(c.name);let priority=4;if(first===q)priority=0;else if(first.startsWith(q))priority=1;else if(name.startsWith(q))priority=2;else if(name.includes(q))priority=3;return {c,priority};}).filter(x=>x.priority<4).sort((a,b)=>a.priority-b.priority||String(a.c.name||'').localeCompare(String(b.c.name||''),'pt-BR',{sensitivity:'base'})).slice(0,10).map(x=>x.c);
  }
  function closeClientSuggestions219(input=$('[data-client-search]')){const row=input?.closest('.client-search-row'),list=row?.querySelector('.client-suggestions');if(list){list.hidden=true;list.innerHTML='';}row?.classList.remove('suggestions-open');if(input){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.dataset.activeIndex='-1';}}
  function renderClientSuggestions219(input){
    const list=input?.closest('.client-search-row')?.querySelector('.client-suggestions');if(!list)return;
    const query=input.value.trim();if(!query){closeClientSuggestions219(input);return;}
    const rows=clientSuggestionRows219(query);
    list.innerHTML=(rows.length?rows.map((c,i)=>`<button type="button" role="option" aria-selected="false" id="client-option-${attr(c.id)}" class="client-suggestion" data-client-option-id="${attr(c.id)}" data-option-index="${i}"><strong>${esc(c.name)}</strong><small>${esc(c.id)}</small></button>`).join(''):'<div class="client-suggestion-empty">Nenhum cliente encontrado.</div>')+`<button type="button" class="client-suggestion add-client" data-action="new-client-from-order">${icon('plus',16)} Adicionar novo cliente</button>`;
    list.hidden=false;input.closest('.client-search-row')?.classList.add('suggestions-open');input.setAttribute('aria-expanded','true');input.dataset.activeIndex='-1';
  }
  function chooseClientSuggestion219(input,id){
    const client=findClient(id),form=input?.closest('form[data-form="order"]');if(!client||!form)return;
    input.value=client.name;form.elements.clientId.value=client.id;input.dataset.selectedClientId=client.id;closeClientSuggestions219(input);input.classList.add('has-valid-client');scheduleOrderDraft219(form);markOrderPdfDirty219(form);
  }
  function moveClientSuggestion219(input,delta){
    const list=input.closest('.client-search-row')?.querySelector('.client-suggestions'),options=[...(list?.querySelectorAll('[data-client-option-id]')||[])];if(!options.length)return;
    let index=Number(input.dataset.activeIndex||-1);index=(index+delta+options.length)%options.length;input.dataset.activeIndex=String(index);options.forEach((opt,i)=>opt.setAttribute('aria-selected',i===index?'true':'false'));options[index].scrollIntoView({block:'nearest'});input.setAttribute('aria-activedescendant',options[index].id);
  }

  async function copyTextToClipboard219(text){
    const value=String(text??'');
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);return true;}catch(e){console.warn('Clipboard API indisponível; usando fallback.',e);}}
    const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';area.style.pointerEvents='none';document.body.appendChild(area);area.select();let copied=false;try{copied=document.execCommand('copy');}finally{area.remove();}if(!copied)throw new Error('Não foi possível copiar a mensagem.');return true;
  }
  async function getLatestOfficialPdf219(orderId){
    const order=findOrder(orderId);if(!order)throw new Error('OSV não encontrada.');
    const meta=latestOfficialPdfMeta219(orderId);if(!meta)return null;
    const blob=await getMediaBlob(meta);if(!blob)return null;
    const file=blob instanceof File?blob:new File([blob],meta.fileName||`${orderId}.pdf`,{type:'application/pdf'});
    return {order,meta,blob,file,current:isHistoricalPdf219(meta)||meta.sourceFingerprint===orderPdfFingerprint219(orderId),historical:isHistoricalPdf219(meta)};
  }
  async function ensureCurrentOrderPdf219(orderId){
    const latest=await getLatestOfficialPdf219(orderId);
    if(!latest)throw new Error('Gere o PDF antes de enviar pelo WhatsApp.');
    if(!latest.current)throw new Error('O PDF precisa ser gerado novamente.');
    return latest;
  }
  function closeWhatsAppReview219(){const root=$('#confirm-root');root?.querySelector('.whatsapp-review-backdrop')?.remove();WHATSAPP_REVIEW_219=null;}
  function openWhatsAppReview219({orderId,pdfFile,message}){
    const order=findOrder(orderId),client=findClient(order?.clientId)||{name:order?.clientName||'cliente'};WHATSAPP_REVIEW_219={orderId,pdfFile,client,sharing:false};
    const root=$('#confirm-root');root.innerHTML=`<div class="whatsapp-review-backdrop"><section class="whatsapp-review-modal" data-order-id="${attr(orderId)}" role="dialog" aria-modal="true" aria-labelledby="whatsapp-review-title"><header><h2 id="whatsapp-review-title">Revisar mensagem</h2><p>Edite o texto. O PDF será compartilhado e a mensagem ficará copiada; alguns celulares/WhatsApp não aceitam abrir um contato específico com o arquivo já anexado.</p></header><textarea data-whatsapp-message>${esc(message)}</textarea><div class="whatsapp-review-actions"><button type="button" class="btn secondary" data-action="whatsapp-review-cancel">Cancelar</button><button type="button" class="btn secondary" data-action="whatsapp-review-copy">Copiar texto</button><button type="button" class="btn primary" data-action="whatsapp-review-ok">OK</button></div></section></div>`;
    requestAnimationFrame(()=>root.querySelector('[data-whatsapp-message]')?.focus());
  }
  async function openOrderShareReview219(orderId){
    if(SHARE_INFLIGHT_219.has(orderId))return SHARE_INFLIGHT_219.get(orderId);
    const task=(async()=>{
      const latest=await ensureCurrentOrderPdf219(orderId),client=findClient(latest.order.clientId)||{name:latest.order.clientName||'cliente',phone:'',phoneNormalized:''};
      if(!whatsappNumber(client.phoneNormalized||client.phone))throw new Error('Cadastre um telefone válido com DDD para enviar pelo WhatsApp.');
      const message=`Olá, ${client.name||'cliente'}!\n\nSegue em anexo o pedido do serviço realizado, referente à ${latest.order.id}.\n\nObrigado pela preferência! Qualquer dúvida, fico à disposição.`;
      openWhatsAppReview219({orderId,pdfFile:latest.file,message});
    })().finally(()=>SHARE_INFLIGHT_219.delete(orderId));
    SHARE_INFLIGHT_219.set(orderId,task);return task;
  }
  async function shareOrderPdfWithMessage219({orderId,pdfFile,message}){
    const order=findOrder(orderId),client=findClient(order?.clientId)||{phone:'',phoneNormalized:''};if(!order)throw new Error('OSV não encontrada.');
    const phone=whatsappNumber(client.phoneNormalized||client.phone);if(!phone)throw new Error('Cadastre um telefone válido com DDD para enviar pelo WhatsApp.');
    if(!(pdfFile instanceof File)||pdfFile.type!=='application/pdf')pdfFile=new File([pdfFile],`${order.id}_${timestampFile()}.pdf`,{type:'application/pdf'});
    let canNative=false;
    try{canNative=!!navigator.share&&!!navigator.canShare&&navigator.canShare({files:[pdfFile]});}
    catch(e){console.warn('navigator.canShare rejeitou o arquivo; usando fallback:',e);}
    if(canNative){
      try{
        await copyTextToClipboard219(message).catch(()=>false);
        await navigator.share({files:[pdfFile],title:order.id,text:message});
        addAudit('Compartilhamento iniciado',`${order.id} · confirmação depende do usuário`);await persist('', '', {media:false});
        toast('PDF compartilhado. A mensagem também ficou copiada para colar caso o WhatsApp não a inclua.','ok');closeWhatsAppReview219();return {mode:'native'};
      }catch(e){
        if(e?.name==='AbortError'){toast('Compartilhamento cancelado. A mensagem continua disponível para nova tentativa.','warn');return {mode:'cancelled'};}
        console.warn('Compartilhamento nativo falhou; usando fallback:',e);
      }
    }
    await copyTextToClipboard219(message).catch(e=>{console.warn('Não foi possível copiar automaticamente:',e);return false;});
    MarcoStorage.downloadBlob(pdfFile,pdfFile.name||`${order.id}_${timestampFile()}.pdf`);
    const whatsappUrl=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl,'_blank','noopener');
    addAudit('WhatsApp aberto para envio',`${order.id} · PDF baixado para anexação manual`);await persist('', '', {media:false});
    toast('Este navegador não permite anexar o PDF automaticamente. A conversa foi aberta, a mensagem foi preenchida e o PDF foi baixado para anexação manual.','warn');closeWhatsAppReview219();return {mode:'fallback'};
  }

  generatePdfForOrder=async function(orderId,share=false){
    if(share)return await openOrderShareReview219(orderId);
    if(PDF_INFLIGHT_219.has(orderId))return PDF_INFLIGHT_219.get(orderId);
    const task=(async()=>{
      const order=findOrder(orderId);if(!order)throw new Error('OSV não encontrada.');const client=findClient(order.clientId)||{name:order.clientName,phone:''};const form=$('form[data-form="order"]');
      setPdfState219(form,'generating');setSaveStatus('Gerando PDF…','warn');
      let record=null,newMeta=null;const previousPdfs=clone(order.pdfs||[]);
      try{
        const result=await MarcoPdf.generate(order,{client,company:company(),items:orderItems(order.id),payments:orderPayments(order.id).filter(p=>!paymentIsCancelled(p)),itemName:itemDescription,getPhotoBlob:getMediaBlob});
        const fileName=`${order.id}_${timestampFile()}.pdf`,pdfFile=new File([result.blob],fileName,{type:'application/pdf'});record=await MarcoStorage.putMedia(pdfFile,{name:fileName,type:'application/pdf'});
        newMeta={id:`pdf_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,orderId:order.id,kind:'pdf',official:true,legacy:false,generatedByCurrentApp:true,fileName,localKey:record.id,driveFileId:'',webViewLink:'',createdAt:nowIso(),sourceFingerprint:orderPdfFingerprint219(order.id),schemaVersion:3,templateId:result.templateId||order.pdfTemplateId||currentProfileSettings().defaultPdfTemplateId||'',templateVersion:result.templateVersion||1,pageCount:result.pageCount||0};
        if(!navigator.onLine||!GoogleDriveMarco.isConfigured())throw new Error('Internet e Google Drive são obrigatórios para gerar o PDF oficial.');
        const remote=await GoogleDriveMarco.uploadBlob(pdfFile,'pdfs',fileName);newMeta.driveFileId=remote.id;newMeta.webViewLink=remote.webViewLink||'';
        const generatedOfficial=(order.pdfs||[]).filter(m=>m.official!==false&&!isHistoricalPdf219(m));
        generatedOfficial.forEach(old=>{old.official=false;old.supersededAt=nowIso();});
        order.pdfs=Array.isArray(order.pdfs)?order.pdfs:[];order.pdfs.push(newMeta);
        await persist('PDF oficial gerado',`${order.id} · ${fileName}`);
        /* PDFs históricos e versões anteriores são preservados. A limpeza destrutiva
           não ocorre no mesmo clique, evitando perda durante uma falha de nuvem. */
        setSaveStatus('PDF atualizado','ok');if(form){form.dataset.hadPdf='1';setPdfState219(form,'ready','PDF pronto');}
        toast('PDF pronto para visualizar, salvar ou enviar.','ok');return newMeta;
      }catch(e){console.error('Falha ao gerar PDF oficial:',{orderId,error:e});order.pdfs=previousPdfs;if(record?.id)await MarcoStorage.deleteMedia(record.id).catch(()=>{});if(newMeta?.driveFileId)await GoogleDriveMarco.trash(newMeta.driveFileId).catch(()=>{});setPdfState219(form,'error','Não foi possível gerar o PDF.');setSaveStatus('Falha ao gerar PDF','warn');toast('Não foi possível gerar o PDF.','error');throw e;}
    })().finally(()=>PDF_INFLIGHT_219.delete(orderId));
    PDF_INFLIGHT_219.set(orderId,task);return task;
  };

  const changeOrderStatusQuick218=changeOrderStatusQuick;
  changeOrderStatusQuick=async function(id,status){
    if(QUICK_STATUS_INFLIGHT_219.has(id))return QUICK_STATUS_INFLIGHT_219.get(id);
    const task=(async()=>{
      const order=findOrder(id);if(!order)return;const previous=canonicalOperationalStatus(order.status),select=document.querySelector(`[data-quick-order-status="${CSS.escape(id)}"]`),shell=select?.closest('.inline-status-shell'),profileId=activeProfile().id,snapshot=clone(data());
      if(select){select.value=previous;select.disabled=true;}shell?.classList.add('is-saving');
      try{await changeOrderStatusQuick218(id,status);}
      catch(e){console.error('Falha ao alterar status rápido:',{id,status,error:e});STATE.dataByProfile[profileId]=snapshot;await MarcoStorage.save(STATE).catch(()=>{});renderView();toast('Não foi possível alterar o status. O valor anterior foi restaurado.','error');}
      finally{const current=document.querySelector(`[data-quick-order-status="${CSS.escape(id)}"]`);if(current)current.disabled=false;current?.closest('.inline-status-shell')?.classList.remove('is-saving');}
    })().finally(()=>QUICK_STATUS_INFLIGHT_219.delete(id));
    QUICK_STATUS_INFLIGHT_219.set(id,task);return task;
  };

  const ORDER_SAVE_INFLIGHT_219=new Map();
  const CLIENT_SAVE_INFLIGHT_219=new Map();
  const saveOrderForm219Base=saveOrderForm;
  saveOrderForm=async function(form){
    const key=form?.dataset.id||form?.dataset.reservedCode||'new';
    if(ORDER_SAVE_INFLIGHT_219.has(key))return ORDER_SAVE_INFLIGHT_219.get(key);
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const task=Promise.resolve(saveOrderForm219Base(form)).finally(()=>{ORDER_SAVE_INFLIGHT_219.delete(key);if(submit?.isConnected)submit.disabled=false;});
    ORDER_SAVE_INFLIGHT_219.set(key,task);return task;
  };

  const saveClientForm219Base=saveClientForm;
  saveClientForm=async function(form){
    const key=form?.dataset.id||'new';
    if(CLIENT_SAVE_INFLIGHT_219.has(key))return CLIENT_SAVE_INFLIGHT_219.get(key);
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const task=Promise.resolve(saveClientForm219Base(form)).finally(()=>{CLIENT_SAVE_INFLIGHT_219.delete(key);if(submit?.isConnected)submit.disabled=false;});
    CLIENT_SAVE_INFLIGHT_219.set(key,task);return task;
  };

  const savePaymentForm218=savePaymentForm;
  savePaymentForm=async function(form){
    const key=form?.dataset.id||'new';if(PAYMENT_SAVE_INFLIGHT_219.has(key))return PAYMENT_SAVE_INFLIGHT_219.get(key);
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const task=Promise.resolve(savePaymentForm218(form)).finally(()=>{PAYMENT_SAVE_INFLIGHT_219.delete(key);if(submit?.isConnected)submit.disabled=false;});PAYMENT_SAVE_INFLIGHT_219.set(key,task);return task;
  };

  /* =========================================================
     CAMPOS DE DATA — 2.2.6
     O tema desenha o ícone do calendário com background-image em "right 14px center" e deixa o
     indicador nativo invisível. Como o indicador nativo vive dentro da caixa de conteúdo, o
     padding-right de 48px empurrava a área realmente clicável para longe do ícone desenhado — daí
     o clique em região invisível e o pop-up nativo ancorado fora do lugar.
     Agora o indicador nativo é removido (css/pts-completo.css) e o próprio campo aciona
     showPicker(), que ancora o calendário no componente exibido, em qualquer largura.
     ========================================================= */
  const DATE_MIN_YEAR_225=1900;
  const DATE_MAX_YEAR_225=2100;
  const DATE_INPUT_SELECTOR_225='input[type="date"],input[type="month"]';
  let DATE_PICKER_FALLBACK_225=false;

  function openDatePicker225(input){
    if(!input||input.disabled||input.readOnly)return;
    input.focus({preventScroll:true});
    if(typeof input.showPicker==='function'){
      try{input.showPicker();return;}
      catch(e){console.warn('showPicker indisponível neste contexto, usando o indicador nativo:',e);}
    }
    // Fallback para navegadores sem showPicker: reemite o clique no próprio input, com trava
    // de reentrância para não recursar dentro do nosso próprio ouvinte.
    if(DATE_PICKER_FALLBACK_225)return;
    DATE_PICKER_FALLBACK_225=true;
    try{input.click();}finally{DATE_PICKER_FALLBACK_225=false;}
  }

  function dateValueIsSane225(input){
    const raw=String(input.value||'');
    if(!raw)return true;
    const year=Number(raw.slice(0,4));
    if(!Number.isFinite(year)||year<DATE_MIN_YEAR_225||year>DATE_MAX_YEAR_225)return false;
    if(input.type==='month')return /^\d{4}-\d{2}$/.test(raw);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
    // Data local, sem Date.parse de string — nada de deslocamento de um dia por causa de UTC.
    const [y,m,d]=raw.split('-').map(Number);
    const probe=new Date(y,m-1,d);
    return probe.getFullYear()===y&&probe.getMonth()===m-1&&probe.getDate()===d;
  }

  // Anos incompletos e datas inexistentes (o caso 15/05/1551) nunca chegam ao estado.
  function sanitizeDateInput225(input){
    if(dateValueIsSane225(input))return true;
    input.value='';
    input.classList.add('date-input-rejected');
    setTimeout(()=>input.classList.remove('date-input-rejected'),900);
    toast('Data inválida. Escolha a data pelo calendário.','error');
    return false;
  }

  document.addEventListener('click',event=>{
    if(DATE_PICKER_FALLBACK_225)return;
    const input=event.target.closest?.(DATE_INPUT_SELECTOR_225);
    if(!input)return;
    openDatePicker225(input);
  },true);

  // Entrada manual bloqueada, navegação por teclado preservada (Tab, Enter, Espaço, setas, limpar).
  document.addEventListener('keydown',event=>{
    const input=event.target.closest?.(DATE_INPUT_SELECTOR_225);
    if(!input)return;
    if(event.key==='Enter'||event.key===' '||event.key==='Spacebar'){event.preventDefault();openDatePicker225(input);return;}
    const navigational=['Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Backspace','Delete','F5'];
    if(navigational.includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key.length===1)event.preventDefault();
  },true);

  document.addEventListener('change',event=>{
    const input=event.target.closest?.(DATE_INPUT_SELECTOR_225);
    if(!input)return;
    if(!sanitizeDateInput225(input))return;
    const form=input.closest('form[data-form="order"]');
    if(!form||input.name!=='completedAt')return;
    const openedAt=form.elements.openedAt?.value||'';
    if(openedAt&&input.value&&input.value<openedAt){
      input.value='';
      toast('A data de conclusão não pode ser anterior à data de abertura.','error');
    }
  },true);

  function closeQuickActions219(except=null){document.querySelectorAll('details.quick-actions[open]').forEach(details=>{if(details!==except)details.open=false;});}

  /* =========================================================
     COLUNA AÇÕES — 2.2.6
     O menu era position:absolute dentro de .table-wrap{overflow:auto}, então era recortado pelo
     container e ficava parcialmente escondido. position:fixed sozinho não resolve: .card usa
     backdrop-filter, que cria bloco contentor e reancora elementos fixos. Por isso o menu é movido
     para o body enquanto está aberto e devolvido ao <details> ao fechar — o overflow e o
     backdrop-filter deixam de alcançá-lo, sem sticky, sem sobreposição de coluna e sem borda dupla.
     ========================================================= */
  const QUICK_MENU_GAP_225=7;
  const QUICK_MENU_EDGE_225=10;
  let QUICK_MENU_PORTAL_225=null;

  function portalQuickActionsMenu225(details){
    const menu=details.querySelector(':scope > .quick-actions-menu');
    if(!menu)return null;
    const placeholder=document.createComment('quick-actions-menu');
    menu.after(placeholder);
    menu.dataset.quickMenuPortal='1';
    document.body.appendChild(menu);
    QUICK_MENU_PORTAL_225={details,menu,placeholder};
    return menu;
  }
  function restoreQuickActionsMenu225(){
    const portal=QUICK_MENU_PORTAL_225;
    if(!portal)return;
    QUICK_MENU_PORTAL_225=null;
    delete portal.menu.dataset.quickMenuPortal;
    portal.menu.removeAttribute('style');
    // Se a listagem foi re-renderizada enquanto o menu estava aberto, o lugar de origem já não
    // existe: o menu é descartado em vez de ficar órfão no body.
    if(portal.placeholder.isConnected)portal.placeholder.replaceWith(portal.menu);
    else portal.menu.remove();
  }
  function openQuickActionsDetails225(){return QUICK_MENU_PORTAL_225?.details||null;}
  function quickActionsMenuOf225(details){
    if(QUICK_MENU_PORTAL_225?.details===details)return QUICK_MENU_PORTAL_225.menu;
    return details.querySelector(':scope > .quick-actions-menu');
  }

  function positionQuickActionsMenu225(details){
    const summary=details.querySelector('summary'),menu=quickActionsMenuOf225(details);
    if(!summary||!menu||!details.isConnected)return;
    menu.style.position='fixed';
    menu.style.right='auto';menu.style.bottom='auto';menu.style.left='0px';menu.style.top='0px';
    menu.style.maxHeight='';
    const anchor=summary.getBoundingClientRect(),size=menu.getBoundingClientRect();
    const vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
    // Alinha pela direita do botão; abre para a esquerda quando não há espaço à direita.
    let left=anchor.right-size.width;
    if(left<QUICK_MENU_EDGE_225)left=Math.min(anchor.left,vw-size.width-QUICK_MENU_EDGE_225);
    left=Math.max(QUICK_MENU_EDGE_225,Math.min(left,vw-size.width-QUICK_MENU_EDGE_225));
    // Abre acima quando não couber abaixo, e nunca ultrapassa a viewport.
    let top=anchor.bottom+QUICK_MENU_GAP_225;
    if(top+size.height>vh-QUICK_MENU_EDGE_225){
      const above=anchor.top-QUICK_MENU_GAP_225-size.height;
      top=above>=QUICK_MENU_EDGE_225?above:Math.max(QUICK_MENU_EDGE_225,vh-size.height-QUICK_MENU_EDGE_225);
    }
    menu.style.left=`${Math.round(left)}px`;
    menu.style.top=`${Math.round(top)}px`;
    menu.style.maxHeight=`${Math.round(vh-top-QUICK_MENU_EDGE_225)}px`;
  }

  document.addEventListener('toggle',event=>{
    const details=event.target.closest?.('details.quick-actions');
    if(!details)return;
    if(details.open){
      restoreQuickActionsMenu225();
      if(!portalQuickActionsMenu225(details))return;
      requestAnimationFrame(()=>{if(details.open)positionQuickActionsMenu225(details);});
      return;
    }
    if(QUICK_MENU_PORTAL_225?.details===details)restoreQuickActionsMenu225();
  },true);
  // Rolar ou redimensionar desancoraria o menu, então ele acompanha o botão.
  document.addEventListener('scroll',()=>{const open=openQuickActionsDetails225();if(open)positionQuickActionsMenu225(open);},{capture:true,passive:true});
  window.addEventListener?.('resize',()=>{const open=openQuickActionsDetails225();if(open)positionQuickActionsMenu225(open);},{passive:true});
  document.addEventListener('pointerdown',event=>{
    // Com o menu portado para o body ele não é mais descendente do <details>: os dois pontos contam como "dentro".
    const opened=document.querySelector('details.quick-actions[open]');
    const inside=event.target.closest?.('details.quick-actions')||(event.target.closest?.('.quick-actions-menu')?openQuickActionsDetails225():null);
    if(opened&&!inside){closeQuickActions219();SUPPRESS_QUICK_ACTION_CLICK_219=true;return;}
    if(inside)closeQuickActions219(inside);
  },true);
  document.addEventListener('click',event=>{
    if(SUPPRESS_QUICK_ACTION_CLICK_219){SUPPRESS_QUICK_ACTION_CLICK_219=false;event.preventDefault();event.stopImmediatePropagation();return;}
    const actionButton=event.target.closest?.('details.quick-actions [data-action],.quick-actions-menu [data-action]');
    if(actionButton){const details=actionButton.closest('details.quick-actions')||openQuickActionsDetails225();if(details)details.open=false;}
    const option=event.target.closest?.('[data-client-option-id]');if(option){event.preventDefault();const input=option.closest('.client-search-row')?.querySelector('[data-client-search]');chooseClientSuggestion219(input,option.dataset.clientOptionId);}
  },true);
  document.addEventListener('keydown',event=>{
    const quick=document.querySelector('details.quick-actions[open]');if(event.key==='Escape'&&quick){event.preventDefault();event.stopImmediatePropagation();quick.open=false;return;}
    const input=event.target.closest?.('[data-client-search]');if(!input)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopImmediatePropagation();if(input.getAttribute('aria-expanded')!=='true')renderClientSuggestions219(input);moveClientSuggestion219(input,event.key==='ArrowDown'?1:-1);return;}
    if(event.key==='Enter'){const list=input.closest('.client-search-row')?.querySelector('.client-suggestions'),active=list?.querySelector('[aria-selected="true"][data-client-option-id]');if(active){event.preventDefault();event.stopImmediatePropagation();chooseClientSuggestion219(input,active.dataset.clientOptionId);}return;}
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeClientSuggestions219(input);}
  },true);
  document.addEventListener('pointerdown',event=>{const input=$('[data-client-search]');if(input&&input.getAttribute('aria-expanded')==='true'&&!event.target.closest('.client-search-row'))closeClientSuggestions219(input);},true);
  document.addEventListener('input',event=>{
    const input=event.target.closest?.('[data-client-search]');
    if(input){const form=input.closest('form[data-form="order"]'),hidden=form?.elements.clientId;if(hidden&&input.value!==findClient(hidden.value)?.name){hidden.value='';input.dataset.selectedClientId='';input.classList.remove('has-valid-client');}renderClientSuggestions219(input);}
    const form=event.target.closest?.('form[data-form="order"]');if(form){scheduleOrderDraft219(form);markOrderPdfDirty219(form);}
  },true);
  document.addEventListener('change',event=>{
    const form=event.target.closest?.('form[data-form="order"]');if(form){scheduleOrderDraft219(form);markOrderPdfDirty219(form);}
    const paymentForm=event.target.closest?.('form[data-form="payment"]');if(paymentForm&&event.target.matches('[name="settlementState"]')){if(event.target.value==='paid'&&!paymentForm.elements.paymentDate.value)paymentForm.elements.paymentDate.value=today();if(event.target.value==='open')paymentForm.elements.paymentDate.value='';refreshStandalonePaymentForm(paymentForm);}
    if(paymentForm&&event.target.matches('[name="paymentDate"]')){const settlement=paymentForm.elements.settlementState;if(settlement)settlement.value=event.target.value?'paid':'open';refreshStandalonePaymentForm(paymentForm);}
  },true);
  document.addEventListener('focusout',event=>{
    const input=event.target.closest?.('[data-phone-input]');if(!input)return;
    const hint=input.closest('form')?.querySelector('[data-phone-hint]'),value=String(input.value||'').trim();
    if(!value){if(hint){hint.textContent='';hint.hidden=true;hint.dataset.tone='idle';}return;}
    const result=normalizeBrazilianPhone(value);
    if(result.valid){input.value=result.formatted;if(hint){hint.textContent='Telefone válido.';hint.hidden=false;hint.dataset.tone='ok';}}
    else if(hint){hint.textContent=result.error||'Revise o telefone informado.';hint.hidden=false;hint.dataset.tone='error';}
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(ORDER_DRAFT_TIMER_219);flushOrderDraft219().catch(()=>{});}});
  window.addEventListener?.('pagehide',()=>{clearTimeout(ORDER_DRAFT_TIMER_219);flushOrderDraft219().catch(()=>{});});

  const handleAction219Base=handleAction;
  handleAction=async function(btn){
    const action=btn?.dataset?.action;
    try{
      if(action==='open-osv-layout-editor'){window.MarcoPersonalization221?.openLayoutEditor?.();return;}
      if(action==='cancel-order-form'){const form=btn.closest('form[data-form="order"]');await discardOrderDraft219(form);return;}
      if(action==='new-client-from-order'){const form=btn.closest('form[data-form="order"]');if(!form)return;await flushOrderDraft219(form);PENDING_ORDER_DRAFT=orderDraftFromForm(form);openClientForm();return;}
      if(action==='view-existing-media'){const found=findMedia(btn.dataset.media);if(!found)throw new Error('Arquivo não encontrado.');await openPdfMedia(found.order?.id||'',btn.dataset.media);return;}
      if(action==='close-order-pdf-preview'){const overlay=btn.closest('[data-order-pdf-preview]');if(overlay){try{URL.revokeObjectURL(overlay.dataset.objectUrl||'');}catch(_){}overlay.remove();}return;}
      if(action==='copy-order-pix'){const order=findOrder(btn.dataset.order),code=String(order?.pixPayment?.copyPasteCode||order?.pixPayment?.pixKey||'').trim();if(!code)throw new Error('Esta OSV não possui código Pix.');await copyTextToClipboard219(code);toast('Código Pix copiado.','ok');return;}
      if(action==='download-order-pdf'){const found=findMedia(btn.dataset.media);if(!found)throw new Error('Arquivo não encontrado.');const blob=await getMediaBlob(found.meta);if(!blob)throw new Error('O PDF não está disponível neste dispositivo.');MarcoStorage.downloadBlob(blob,found.meta.fileName||`${btn.dataset.order}.pdf`);return;}
      if(action==='stage-delete-existing-media'){await stageExistingMediaDeletion219(btn.closest('form[data-form="order"]'),btn.dataset.media);return;}
      if(action==='whatsapp-review-cancel'){closeWhatsAppReview219();return;}
      if(action==='whatsapp-review-copy'){const root=btn.closest('.whatsapp-review-modal'),text=root?.querySelector('[data-whatsapp-message]')?.value||'';await copyTextToClipboard219(text);const original='Copiar texto';btn.textContent='Copiado ✓';toast('Mensagem copiada para a área de transferência.','ok');setTimeout(()=>{if(btn.isConnected)btn.textContent=original;},1800);return;}
      if(action==='whatsapp-review-ok'){const state=WHATSAPP_REVIEW_219,modal=btn.closest('.whatsapp-review-modal'),message=modal?.querySelector('[data-whatsapp-message]')?.value||'';if(!state||state.sharing)return;state.sharing=true;btn.disabled=true;btn.setAttribute('aria-busy','true');try{await shareOrderPdfWithMessage219({...state,message});}finally{if(WHATSAPP_REVIEW_219===state)state.sharing=false;if(btn.isConnected){btn.disabled=false;btn.removeAttribute('aria-busy');}}return;}
      return await handleAction219Base(btn);
    }catch(e){console.error('Ação v2.2.13 falhou:',{action,error:e});if(btn?.isConnected)btn.disabled=false;toast(e.message||'Não foi possível concluir a ação.','error');}
  };

  // #modal-root tem um único modal (root.innerHTML é reescrito a cada openModal). Para abrir o editor
  // de layout de dentro da Nova OSV sem perder nada, o formulário é gravado no rascunho antes de sair
  // e restaurado depois pelo mesmo caminho já usado em "novo cliente a partir da OSV". O número
  // reservado vem do rascunho, então não é sorteado de novo nem duplica a OSV.
  const renderView225=renderView;
  renderView=function(...args){
    // Evita menu de ações órfão no body quando a tela é reconstruída com ele aberto.
    if(QUICK_MENU_PORTAL_225)restoreQuickActionsMenu225();
    return renderView225(...args);
  };

  window.MarcoClientFormBridge={
    current(){return $('#modal-root form[data-form="client"]');},
    async suspend(){const form=this.current();if(!form)return null;const modalBody=form.closest('.modal-body'),fields=[...form.querySelectorAll('input,select,textarea')].filter(el=>el.name).map(el=>({name:el.name,type:el.type,value:el.value,checked:el.checked})),results=form.querySelector('[data-cep-results]')?.innerHTML||'',ticket={id:form.dataset.id||'',fields,results,suggestions:clone(CEP_SUGGESTIONS),scrollTop:modalBody?.scrollTop||0,openedAt:nowIso(),fromOrder:!!PENDING_ORDER_DRAFT};closeModal({reason:'replace-modal',immediate:true});return ticket;},
    resume(ticket){if(!ticket)return false;openClientForm(ticket.id||'');let attempts=0;const restore=async()=>{const form=this.current();if(!form&&attempts++<30){requestAnimationFrame(restore);return;}if(!form)return;const stateRecord=ticket.fields.find(x=>x.name==='state'),cityRecord=ticket.fields.find(x=>x.name==='city');if(stateRecord){const stateEl=form.elements.state;if(stateEl)stateEl.value=stateRecord.value;loadCitiesForState(stateRecord.value,cityRecord?.value||'').catch(()=>{});}for(const record of ticket.fields){const nodes=form.querySelectorAll(`[name="${CSS.escape(record.name)}"]`);for(const node of nodes){if(['checkbox','radio'].includes(record.type))node.checked=record.checked;else node.value=record.value;}}CEP_SUGGESTIONS=clone(ticket.suggestions||[]);const results=form.querySelector('[data-cep-results]');if(results)results.innerHTML=ticket.results||'';window.MarcoPersonalization221?.hydrateClientForm?.(form);requestAnimationFrame(()=>{const body=form.closest('.modal-body');if(body)body.scrollTop=Number(ticket.scrollTop)||0;});};requestAnimationFrame(restore);return true;}
  };

  window.MarcoOrderFormBridge={
    current(){return $('#modal-root form[data-form="order"]');},
    async suspend(){
      const form=this.current();if(!form)return null;
      clearTimeout(ORDER_DRAFT_TIMER_219);
      await flushOrderDraft219(form).catch(e=>{console.error('Falha ao preservar o rascunho da OSV antes do editor:',e);throw new Error('Não foi possível preservar os dados da OSV. O editor não foi aberto.');});
      const ticket={id:form.dataset.id||'',reservedCode:form.dataset.reservedCode||'',openedAt:nowIso()};
      closeModal({reason:'replace-modal',immediate:true});
      return ticket;
    },
    resume(ticket){
      if(!ticket)return false;
      openOrderForm(ticket.id||'');
      return true;
    }
  };

  window.MarcoPersonalization221?.install?.();
  window.MarcoPTS={version:PTS_VERSION,runIntegrity:integrityReport,buildMigrationPlan:()=>MIGRATION_SESSION?buildMigrationPlan():null,financialInfo:id=>orderFinancialInfo(findOrder(id)),lowStock:()=>lowStockItems(),setOrderStatus:changeOrderStatusQuick,screenBand};
  window.MarcoPTSReady=true;
})();

/* ===== js/mobile-experience.js ===== */
'use strict';

/* Marco Iris Tecnologia v2.2.13 — experiência mobile refinada e rolagem centralizada. */
(() => {
  const MobileMarco = {
    initialized:false,
    navPatched:false,
    originalNavigate:null,
    viewStack:[],
    scrollByView:new Map(),
    modalObserver:null,
    rootObserver:null,
    layerObserver:null,
    guardArmed:false,
    allowExit:false,
    networkTimer:0,
    lastHaptic:0,
    swipe:null,
    viewportBaseline:0,
    viewportWidth:0,
    viewportRaf:0,
    viewportNavPending:false,
    focusScrollTimer:0,

    isMobile(){return window.matchMedia('(max-width:900px)').matches;},
    currentView(){try{return CURRENT_VIEW||'dashboard';}catch(_){return 'dashboard';}},
    scroller(){return document.scrollingElement||document.documentElement;},
    scrollTop(){return window.scrollY||this.scroller()?.scrollTop||0;},
    setScroll(top=0){
      window.scrollTo({top,behavior:'auto'});
      requestAnimationFrame(()=>window.scrollTo({top,behavior:'auto'}));
    },
    haptic(pattern=7){
      if(!this.isMobile()||!navigator.vibrate)return;
      const now=Date.now();if(now-this.lastHaptic<35)return;
      this.lastHaptic=now;
      try{navigator.vibrate(pattern);}catch(_){ }
    },

    syncScrollLock(){
      window.MarcoScrollLock?.sync?.();
    },

    syncMenuLayer(){
      let layer=document.querySelector('body > .mobile-menu-layer');
      if(this.isMobile()){
        if(!layer){
          layer=document.createElement('div');
          layer.className='mobile-menu-layer';
          layer.setAttribute('aria-hidden','true');
          document.body.appendChild(layer);
        }
        const sidebar=document.querySelector('#root .sidebar');
        const scrim=document.querySelector('#root .sidebar-scrim');
        if(sidebar&&scrim){
          layer.querySelector('.sidebar')?.remove();
          layer.querySelector('.sidebar-scrim')?.remove();
          layer.append(scrim,sidebar);
        }
        layer.setAttribute('aria-hidden',document.body.classList.contains('menu-open')?'false':'true');
        return;
      }
      if(layer){
        const shell=document.querySelector('#root .app-shell'),main=shell?.querySelector(':scope > .main');
        const sidebar=layer.querySelector('.sidebar'),scrim=layer.querySelector('.sidebar-scrim');
        if(shell&&main){
          if(sidebar)shell.insertBefore(sidebar,main);
          if(scrim)shell.insertBefore(scrim,main);
        }
        layer.remove();
      }
    },

    queueViewport(withNav=false){
      this.viewportNavPending=this.viewportNavPending||withNav;
      if(this.viewportRaf)return;
      this.viewportRaf=requestAnimationFrame(()=>{
        this.viewportRaf=0;
        const updateNav=this.viewportNavPending;
        this.viewportNavPending=false;
        this.setViewport();
        if(updateNav)this.ensureBottomNav();
      });
    },

    keepActiveFieldVisible(){
      if(!this.isMobile())return;
      const active=document.activeElement;
      if(!active||!/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
      const scroll=active.closest?.('#modal-root .modal-body');
      if(!scroll)return;
      const field=active.closest?.('.field')||active;
      const area=scroll.getBoundingClientRect();
      const rect=field.getBoundingClientRect();
      if(rect.top<area.top+8||rect.bottom>area.bottom-8){
        field.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
      }
    },

    setViewport(){
      this.syncScrollLock();
      const vv=window.visualViewport;
      const active=document.activeElement;
      const editing=!!active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      const modalEditing=editing&&!!active.closest?.('#modal-root .modal');
      const visualHeight=Math.max(320,Math.round(vv?.height||window.innerHeight));
      const width=Math.round(vv?.width||window.innerWidth);
      if(!this.viewportBaseline||Math.abs(width-this.viewportWidth)>80){this.viewportBaseline=visualHeight;this.viewportWidth=width;}
      else if(!editing&&visualHeight>this.viewportBaseline)this.viewportBaseline=visualHeight;
      const keyboard=editing?Math.max(0,Math.round(this.viewportBaseline-visualHeight-(vv?.offsetTop||0))):0;
      document.documentElement.style.setProperty('--marco-app-vh',`${visualHeight}px`);
      document.documentElement.style.setProperty('--marco-modal-vh',`${visualHeight}px`);
      document.documentElement.style.setProperty('--marco-keyboard',`${keyboard}px`);
      document.documentElement.classList.toggle('marco-mobile-ui',this.isMobile());
      this.syncMenuLayer();
      document.body.classList.toggle('keyboard-open',keyboard>90);
      document.body.classList.toggle('modal-field-active',this.isMobile()&&modalEditing);
      if(this.isMobile()&&modalEditing){
        clearTimeout(this.focusScrollTimer);
        this.focusScrollTimer=setTimeout(()=>this.keepActiveFieldVisible(),70);
      }
    },

    showNetwork(online=navigator.onLine){
      if(!this.isMobile())return;
      let banner=document.getElementById('marco-network-banner');
      if(!banner){
        banner=document.createElement('div');
        banner.id='marco-network-banner';
        banner.className='marco-network-banner';
        banner.setAttribute('role','status');
        banner.setAttribute('aria-live','polite');
        document.body.appendChild(banner);
      }
      clearTimeout(this.networkTimer);
      banner.className=`marco-network-banner ${online?'is-online':'is-offline'} is-visible`;
      banner.innerHTML=online
        ? '<span class="network-dot"></span><strong>Conexão restaurada</strong><small>Recarregue para buscar a base oficial do Google Drive.</small>'
        : '<span class="network-dot"></span><strong>Internet indisponível</strong><small>O aplicativo foi bloqueado e não permite alterações offline.</small>';
      if(online)this.networkTimer=setTimeout(()=>banner.classList.remove('is-visible'),2600);
    },

    ensureBottomNav(){
      let nav=document.querySelector('.mobile-bottom-nav');
      const shouldShow=this.isMobile()&&!document.body.classList.contains('login-page')&&!!document.querySelector('.app-bg');
      if(!shouldShow){
        nav?.remove();
        return;
      }
      const labels={dashboard:'Início',orders:'OSV',agenda:'Agenda',clients:'Clientes',finance:'Financeiro',catalog:'Catálogo',documents:'Documentos',settings:'Ajustes'};
      const icons={dashboard:'dashboard',orders:'orders',agenda:'agenda',clients:'clients',finance:'finance',catalog:'catalog',documents:'documents',settings:'settings'};
      let settings=null;
      try{settings=typeof data==='function'?data()?.settings:null;}catch(_){settings=null;}
      const fallback=['dashboard','orders','agenda','clients','finance','catalog','documents','settings'];
      const ordered=Array.isArray(settings?.menuOrder)?settings.menuOrder.filter(view=>labels[view]):fallback.slice();
      fallback.forEach(view=>{if(!ordered.includes(view))ordered.push(view);});
      const visible=ordered.filter(view=>view!=='agenda'||settings?.modules?.agenda!==false);
      const items=visible.slice(0,4).map(view=>[view,icons[view]||view,labels[view]||view]);
      const signature=items.map(item=>item[0]).join('|');
      if(!nav){
        nav=document.createElement('nav');
        nav.className='mobile-bottom-nav';
        nav.setAttribute('aria-label','Navegação principal mobile');
        document.body.appendChild(nav);
      }
      if(nav.dataset.orderSignature!==signature){
        nav.dataset.orderSignature=signature;
        nav.innerHTML=items.map(([view,ico,label])=>`<button type="button" data-action="navigate" data-view="${view}" aria-label="${label}">${icon(ico,22)}<span>${label}</span></button>`).join('')+
          `<button type="button" data-action="toggle-menu" aria-label="Mais opções">${icon('menu',22)}<span>Mais</span></button>`;
      }
      nav.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===this.currentView()));
    },

    patchNavigation(){
      if(this.navPatched||typeof window.navigateTo!=='function')return;
      this.navPatched=true;
      this.originalNavigate=window.navigateTo;
      const self=this;
      window.navigateTo=function(view){
        const from=self.currentView();
        if(self.isMobile()&&view&&view!==from&&!self._backNavigation){
          self.scrollByView.set(from,self.scrollTop());
          self.viewStack.push(from);
          if(self.viewStack.length>30)self.viewStack.shift();
          self.haptic(6);
        }
        const result=self.originalNavigate.call(this,view);
        window.MarcoMenu?.close?.();
        if(self.isMobile()&&!self._backNavigation)self.setScroll(0);
        setTimeout(()=>self.ensureBottomNav(),40);
        return result;
      };
    },

    armBackGuard(url=location.href){
      if(!this.isMobile()||this.allowExit)return;
      history.pushState({...(history.state||{}),__marcoMobileGuard:true},'',url);
      this.guardArmed=true;
    },

    setupBackGuard(){
      if(!this.isMobile()||this.guardArmed)return;
      history.replaceState({...(history.state||{}),__marcoMobileBase:true},'',location.href);
      this.armBackGuard();
      window.addEventListener('popstate',async()=>{
        if(this.allowExit||!this.isMobile())return;
        if(this.closeTopLayer()){this.armBackGuard();return;}
        const previous=this.viewStack.pop();
        if(previous&&this.originalNavigate){
          this.armBackGuard();
          this._backNavigation=true;
          this.originalNavigate(previous);
          this._backNavigation=false;
          const top=this.scrollByView.get(previous)||0;
          setTimeout(()=>this.setScroll(top),250);
          this.ensureBottomNav();
          this.haptic(7);
          return;
        }
        if(this.currentView()!=='dashboard'&&this.originalNavigate){
          this.armBackGuard();
          this._backNavigation=true;
          this.originalNavigate('dashboard');
          this._backNavigation=false;
          this.setScroll(0);
          this.ensureBottomNav();
          this.haptic(7);
          return;
        }
        const leave=await confirmAction('Deseja sair do Marco Iris Tecnologia?', {title:'Sair do aplicativo',confirmLabel:'Sair',tone:'danger'});
        if(leave){this.allowExit=true;history.back();return;}
        this.armBackGuard();
      });
    },

    closeTopLayer(){
      const confirmation=document.querySelector('#confirm-root .app-confirm-backdrop, #confirm-root .whatsapp-review-backdrop');
      if(confirmation){
        const cancel=confirmation.querySelector('[data-confirm-choice="cancel"], [data-action="whatsapp-review-cancel"]');
        if(cancel)cancel.click();else confirmation.remove();
        return true;
      }
      const quickAction=document.querySelector('details.quick-actions[open]');
      if(quickAction){quickAction.open=false;return true;}
      if(document.querySelector('#modal-root .modal-backdrop')){
        try{closeModal({reason:'back'});}catch(_){document.getElementById('modal-root')?.replaceChildren();}
        return true;
      }
      if(document.body.classList.contains('menu-open')){
        window.MarcoMenu?.close?.();
        return true;
      }
      return false;
    },

    decorateModal(backdrop){
      if(!this.isMobile()||!backdrop||backdrop.dataset.marcoMobileSheet==='1')return;
      const modal=backdrop.querySelector('.modal');
      if(!modal)return;
      backdrop.dataset.marcoMobileSheet='1';
      backdrop.classList.add('mobile-sheet-backdrop');
      modal.classList.add('mobile-bottom-sheet');

      const handle=document.createElement('button');
      handle.type='button';
      handle.className='mobile-sheet-handle';
      handle.setAttribute('aria-label','Arraste para baixo para fechar');
      handle.innerHTML='<span></span>';
      modal.insertBefore(handle,modal.firstChild);

      const appRoot=document.getElementById('root');
      if(appRoot)appRoot.inert=true;

      const markDirty=e=>{if(e.target.matches('input,select,textarea'))modal.dataset.sheetDirty='1';};
      modal.addEventListener('input',markDirty,{passive:true});
      modal.addEventListener('change',markDirty,{passive:true});
      backdrop.addEventListener('click',e=>{
        if(e.target!==backdrop||modal.dataset.sheetDirty==='1')return;
        try{closeModal({reason:'backdrop'});}catch(_){ }
      });

      let pointerId=null,startY=0,lastY=0,lastAt=0;
      const reset=()=>{
        modal.classList.remove('is-sheet-dragging');
        modal.style.removeProperty('--sheet-y');
        backdrop.style.removeProperty('--sheet-overlay-opacity');
        pointerId=null;
      };
      handle.addEventListener('pointerdown',e=>{
        if(e.button!=null&&e.button!==0)return;
        pointerId=e.pointerId;
        startY=lastY=e.clientY;
        lastAt=performance.now();
        modal.classList.add('is-sheet-dragging');
        try{handle.setPointerCapture(pointerId);}catch(_){ }
      },{passive:true});
      handle.addEventListener('pointermove',e=>{
        if(e.pointerId!==pointerId)return;
        const dy=Math.max(0,e.clientY-startY);
        if(!dy)return;
        e.preventDefault();
        const resisted=dy/(1+dy/680);
        modal.style.setProperty('--sheet-y',`${resisted}px`);
        backdrop.style.setProperty('--sheet-overlay-opacity',String(Math.max(.18,.54-resisted/900)));
        lastY=e.clientY;
        lastAt=performance.now();
      },{passive:false});
      const finish=e=>{
        if(e.pointerId!==pointerId)return;
        const dy=Math.max(0,e.clientY-startY);
        const velocity=(e.clientY-lastY)/Math.max(1,performance.now()-lastAt);
        const dirty=modal.dataset.sheetDirty==='1';
        const close=dy>(dirty?170:92)||(velocity>.78&&dy>(dirty?100:44));
        try{handle.releasePointerCapture(pointerId);}catch(_){ }
        if(close){
          this.haptic(9);
          modal.classList.add('is-sheet-closing');
          modal.style.setProperty('--sheet-y','110%');
          backdrop.style.setProperty('--sheet-overlay-opacity','0');
          setTimeout(()=>{try{closeModal({reason:'swipe'});}catch(_){ }},170);
        }else{
          if(dirty&&dy>90){
            this.haptic([7,25,7]);
            try{toast('Há alterações não salvas. Puxe mais para fechar.','warn');}catch(_){ }
          }
          reset();
        }
      };
      handle.addEventListener('pointerup',finish,{passive:true});
      handle.addEventListener('pointercancel',reset,{passive:true});
    },

    observeModals(){
      const root=document.getElementById('modal-root');
      if(!root||this.modalObserver)return;
      this.modalObserver=new MutationObserver(()=>{
        const backdrop=root.querySelector('.modal-backdrop');
        if(backdrop)this.decorateModal(backdrop);
        else{
          const appRoot=document.getElementById('root');
          if(appRoot)appRoot.inert=false;
        }
      });
      this.modalObserver.observe(root,{childList:true,subtree:true});
      const existing=root.querySelector('.modal-backdrop');
      if(existing)this.decorateModal(existing);
    },

    observeLayerState(){
      if(this.layerObserver)return;
      this.layerObserver=new MutationObserver(()=>{this.syncScrollLock();this.syncMenuLayer();});
      this.layerObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
      this.syncScrollLock();
    },

    observeRoot(){
      const root=document.getElementById('root');
      if(!root||this.rootObserver)return;
      this.rootObserver=new MutationObserver(()=>{
        if(document.body.classList.contains('login-page')){
          this.viewStack.length=0;
          window.MarcoMenu?.close?.();
        }
        this.setViewport();
        this.patchNavigation();
        this.ensureBottomNav();
      });
      this.rootObserver.observe(root,{childList:true,subtree:true});
    },

    installTouchFeedback(){
      document.addEventListener('pointerdown',e=>{
        if(!this.isMobile())return;
        const el=e.target.closest('button,.btn,.nav-btn,.list-row,.calendar-day,.card');
        if(el&&!el.closest('.mobile-bottom-nav'))el.classList.add('is-touching');
      },{passive:true});
      const clear=e=>{
        const el=e.target?.closest?.('.is-touching');
        if(el)setTimeout(()=>el.classList.remove('is-touching'),75);
      };
      document.addEventListener('pointerup',clear,{passive:true});
      document.addEventListener('pointercancel',clear,{passive:true});
      document.addEventListener('click',e=>{
        if(this.isMobile()&&e.target.closest('button,.btn,[data-action]')){
          this.haptic(5);
          setTimeout(()=>this.ensureBottomNav(),30);
        }
      },{passive:true});
    },

    installSwipeNavigation(){
      const views=['dashboard','orders','agenda','clients'];
      document.addEventListener('pointerdown',e=>{
        if(!this.isMobile()||!e.isPrimary||e.button!==0)return;
        if(!e.target.closest('#view-root')||e.target.closest('input,select,textarea,button,a,[contenteditable],.table-wrap,.modal,.sidebar'))return;
        this.swipe={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()};
      },{passive:true});
      document.addEventListener('pointerup',e=>{
        const s=this.swipe;
        this.swipe=null;
        if(!s||s.id!==e.pointerId)return;
        const dx=e.clientX-s.x,dy=e.clientY-s.y,elapsed=performance.now()-s.time;
        if(elapsed>620||Math.abs(dx)<78||Math.abs(dx)<Math.abs(dy)*1.35)return;
        const index=views.indexOf(this.currentView());
        if(index<0)return;
        const next=dx<0?views[index+1]:views[index-1];
        if(next&&typeof window.navigateTo==='function'){
          window.navigateTo(next);
          this.haptic(8);
        }
      },{passive:true});
    },

    installEnterNavigation(){
      document.addEventListener('keydown',e=>{
        if(e.key!=='Enter'||e.shiftKey)return;
        const t=e.target;
        if(!(t instanceof HTMLElement))return;
        if(t.tagName==='TEXTAREA')return;
        if(t.tagName!=='INPUT'&&t.tagName!=='SELECT')return;
        if(t.tagName==='INPUT'&&['checkbox','radio','file','button','submit','reset'].includes(t.type))return;
        const form=t.closest('form');
        if(!form)return;
        const focusable=[...form.querySelectorAll('input,select,textarea')].filter(el=>!el.disabled&&el.type!=='hidden'&&el.offsetParent!==null);
        const index=focusable.indexOf(t);
        if(index===-1)return;
        e.preventDefault();
        const next=focusable[index+1];
        if(next){
          next.focus();
          if(next.tagName==='INPUT'&&typeof next.select==='function'){try{next.select();}catch(_){ }}
          this.haptic(4);
        }else{
          this.haptic(8);
          if(typeof form.requestSubmit==='function')form.requestSubmit();
          else form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
        }
      });
    },

    installFocusTrap(){
      document.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&document.body.classList.contains('menu-open')){
          window.MarcoMenu?.close?.();
          return;
        }
        if(e.key!=='Tab')return;
        const modal=document.querySelector('#modal-root .modal');
        if(!modal)return;
        const focusable=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      });
    },

    init(){
      if(this.initialized)return;
      this.initialized=true;
      this.setViewport();
      this.patchNavigation();
      this.setupBackGuard();
      this.observeModals();
      this.observeLayerState();
      this.observeRoot();
      this.ensureBottomNav();
      this.installTouchFeedback();
      this.installSwipeNavigation();
      this.installFocusTrap();
      this.installEnterNavigation();

      window.addEventListener('resize',()=>this.queueViewport(true),{passive:true});
      window.addEventListener('orientationchange',()=>setTimeout(()=>this.queueViewport(true),120),{passive:true});
      window.visualViewport?.addEventListener('resize',()=>this.queueViewport(false),{passive:true});
      window.addEventListener('online',()=>this.showNetwork(true));
      window.addEventListener('offline',()=>this.showNetwork(false));
      document.addEventListener('focusin',()=>this.queueViewport(false),{passive:true});
      document.addEventListener('focusout',()=>setTimeout(()=>this.queueViewport(false),80),{passive:true});
      document.addEventListener('visibilitychange',()=>{
        if(!document.hidden){
          this.setViewport();
          this.ensureBottomNav();
        }
      });
    }
  };

  window.MobileMarco=MobileMarco;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>MobileMarco.init(),{once:true});
  else MobileMarco.init();
})();

/* ===== js/borion-hub.js ===== */
(function(){
  'use strict';
  const APP = "marco";
  const HUB_URL = "https://borionfinance.github.io/Borion-Hub/";
  const LOGIN_SELECTOR = ".login-screen";
  const SETTINGS_SELECTOR = ".nav-btn[data-view=\"settings\"]";
  const MENU_CLASS = "nav-btn";
  const HOUSE = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3.5 10.8 12 3.9l8.5 6.9\"/><path d=\"M5.8 9.5v10.1h12.4V9.5\"/><path d=\"M9.6 19.6v-5.9h4.8v5.9\"/></svg>";

  document.documentElement.dataset.borionApp = APP;

  function makeLoginLink(){
    const a=document.createElement('a');
    a.className='borion-hub-entry borion-hub-entry--login';
    a.href=HUB_URL;
    a.target='_self';
    a.setAttribute('aria-label','Abrir Hub Borion');
    a.title='Abrir Hub Borion';
    a.innerHTML=HOUSE+'<span>Hub Borion</span>';
    return a;
  }

  function makeMenuLink(){
    const a=document.createElement('a');
    a.className=MENU_CLASS+' borion-hub-entry borion-hub-menu';
    a.href=HUB_URL;
    a.target='_self';
    a.setAttribute('aria-label','Abrir Hub Borion');
    a.title='Abrir Hub Borion';
    if(APP==='borion') a.innerHTML='<span class="ic">'+HOUSE+'</span><span class="sb-label borion-hub-menu-label">Hub Borion</span>';
    else a.innerHTML=HOUSE+'<span class="borion-hub-menu-label">Hub Borion</span>';
    return a;
  }

  function inject(){
    const login=document.querySelector(LOGIN_SELECTOR);
    if(login && !document.querySelector('.borion-hub-entry--login')) login.appendChild(makeLoginLink());

    const settings=document.querySelector(SETTINGS_SELECTOR);
    if(settings && !document.querySelector('.borion-hub-menu')) settings.insertAdjacentElement('afterend',makeMenuLink());
  }

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;inject();});
  };
  const root=document.getElementById('root');
  if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();

/* ===== js/v227-corrections.js ===== */
(() => {
  'use strict';
  const VERSION='2.2.13', FINANCE_CUTOFF='2026-04-10';
  let migrationRunning=false,lastLocalDay=localDay();
  const html=v=>typeof window.esc==='function'?window.esc(v):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const profileData=()=>{try{return typeof data==='function'?data():window.STATE?.dataByProfile?.[window.STATE?.activeProfileId];}catch(_){return null;}};
  const settings=()=>profileData()?.settings||null;
  function localDay(date=new Date()){const p=n=>String(n).padStart(2,'0');return `${date.getFullYear()}-${p(date.getMonth()+1)}-${p(date.getDate())}`;}
  function dateOnly(value){const raw=String(value||'').trim();const iso=raw.match(/^(\d{4})-(\d{2})-(\d{2})/);if(iso)return `${iso[1]}-${iso[2]}-${iso[3]}`;const br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);return br?`${br[3]}-${br[2]}-${br[1]}`:'';}
  function attachmentFiles(form){return [...(form?.elements?.attachments?.files||[])];}
  function existingAttachmentCount(form){return form?.querySelectorAll('[data-existing-attachment-stage] [data-existing-media-card]:not([hidden])').length||0;}
  function refreshAttachments(form){if(!form)return;const manager=form.querySelector('[data-attachment-manager-v227]');if(!manager)return;const files=attachmentFiles(form),count=files.length+existingAttachmentCount(form);const counter=form.querySelector('[data-attachment-count]');if(counter)counter.textContent=String(count);const list=manager.querySelector('[data-staged-attachment-list]');if(list)list.innerHTML=files.length?files.map((file,index)=>`<div class="attachment-manager-row is-new"><div><strong>${html(file.name)}</strong><small>Novo — ainda não salvo · ${(file.size/1024).toFixed(1)} KB</small></div><div class="actions"><button class="btn ghost compact" data-action="view-staged-attachment" data-index="${index}">Visualizar</button><button class="btn danger compact" data-action="remove-staged-attachment" data-index="${index}">Excluir</button></div></div>`).join(''):'<div class="empty compact-empty">Nenhum arquivo novo selecionado.</div>';}
  function enhanceOrderAttachments(form=document.querySelector('form[data-form="order"]')){if(!form||form.dataset.attachmentsV227==='true')return;const section=form.querySelector('.osv-technical-attachments')||[...form.querySelectorAll('.form-section')].find(x=>/Anexos técnicos/i.test(x.querySelector('h3')?.textContent||'')),footer=form.querySelector('.osv-form-actions')||form.querySelector('.form-actions');if(!section||!footer)return;const manager=document.createElement('div');manager.className='attachment-manager-overlay-v227';manager.dataset.attachmentManagerV227='1';manager.hidden=true;section.classList.add('attachment-manager-panel-v227');const heading=section.querySelector('.form-section-title,.section-heading');if(heading&&!heading.querySelector('[data-action="close-attachments-manager"]'))heading.insertAdjacentHTML('beforeend','<button type="button" class="btn secondary compact" data-action="close-attachments-manager">Fechar</button>');if(!section.querySelector('[data-staged-attachment-list]'))section.insertAdjacentHTML('beforeend','<div class="staged-attachments-v227"><h4>Arquivos novos</h4><div data-staged-attachment-list></div></div>');manager.appendChild(section);form.appendChild(manager);const button=document.createElement('button');button.type='button';button.className='btn secondary action-attachments-v227';button.dataset.action='open-attachments-manager';button.innerHTML=`${typeof icon==='function'?icon('upload'):''}<span>Anexos técnicos (<b data-attachment-count>0</b>)</span>`;footer.insertBefore(button,footer.querySelector('.action-cancel,[data-action="cancel-order-form"],[data-action="close-modal"]')||footer.firstChild);form.elements.attachments?.addEventListener('change',()=>refreshAttachments(form));form.dataset.attachmentsV227='true';refreshAttachments(form);}
  function removeStaged(form,index){if(!form||typeof DataTransfer==='undefined')return;const dt=new DataTransfer();attachmentFiles(form).forEach((file,i)=>{if(i!==index)dt.items.add(file);});form.elements.attachments.files=dt.files;refreshAttachments(form);}
  function viewStaged(form,index){const file=attachmentFiles(form)[index];if(!file)return;const url=URL.createObjectURL(file);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),60000);}
  function removePixUi(root=document){const selector='[data-osv-pix-section],.osv-pix-section-v224,[data-action="copy-order-pix"],.pix-block,[data-pix-card]';if(root?.matches?.(selector)){root.remove();return;}root.querySelectorAll?.(selector).forEach(n=>n.remove());}
  function enhanceLayoutEditor(){const editor=document.querySelector('.layout-editor-v221');if(!editor||editor.dataset.zoomV227==='true')return;editor.dataset.zoomV227='true';const toolbar=editor.querySelector('.layout-toolbar-v221,header');if(!toolbar)return;toolbar.insertAdjacentHTML('beforeend','<div class="layout-zoom-controls-v227"><label>Zoom <select data-visual-layout-zoom><option value="fit-page">Ajustar à página</option><option value="fit-width">Ajustar à largura</option><option value="0.75">75%</option><option value="0.9">90%</option><option value="1">100%</option><option value="1.1">110%</option><option value="1.25">125%</option></select></label></div>');applyLayoutZoom(editor,'fit-page');}
  function applyLayoutZoom(editor,value){const canvas=editor?.querySelector('[data-layout-editor-canvas],.layout-canvas-v221'),host=canvas?.parentElement;if(!canvas||!host)return;let scale=Number(value);const naturalWidth=Math.max(canvas.scrollWidth,canvas.offsetWidth,1200),naturalHeight=Math.max(canvas.scrollHeight,canvas.offsetHeight,1600);if(value==='fit-width')scale=Math.min(1.25,Math.max(.35,(host.clientWidth-32)/naturalWidth));if(value==='fit-page')scale=Math.min(1,Math.max(.32,Math.min((host.clientWidth-32)/naturalWidth,(host.clientHeight-32)/naturalHeight)));if(!Number.isFinite(scale))scale=1;canvas.style.transform=`scale(${scale})`;canvas.style.transformOrigin='top left';canvas.style.marginRight=`${Math.max(0,(scale-1)*naturalWidth)}px`;canvas.style.marginBottom=`${Math.max(0,(scale-1)*naturalHeight)}px`;host.style.setProperty('--layout-canvas-scale',scale);host.dataset.layoutZoom=String(scale);}
  function postProcess(root=document){removePixUi(root);window.MarcoMoney?.bindAll?.(root);const client=root.matches?.('form[data-form="client"]')?root:root.querySelector?.('form[data-form="client"]'),order=root.matches?.('form[data-form="order"]')?root:root.querySelector?.('form[data-form="order"]');if(client)window.MarcoPersonalization221?.hydrateClientForm?.(client);enhanceOrderAttachments(order);enhanceLayoutEditor();}
  function paymentReferenceDate(p){return dateOnly(p.paymentDate)||dateOnly(p.dueDate)||dateOnly(p.createdAt)||dateOnly(p.updatedAt);}
  function paymentPrefix(p){return /despesa/i.test(String(p.type||''))?'DES':'REC';}
  async function migrateFinanceCodes(){if(migrationRunning)return false;const d=profileData(),target=settings();if(!d||!target||target.migrations?.financeCodesV226?.completedAt)return false;migrationRunning=true;try{const affected=(d.payments||[]).filter(p=>paymentReferenceDate(p)>=FINANCE_CUTOFF);target.migrations=target.migrations||{};target.financeCodesV226Backup=target.financeCodesV226Backup||{createdAt:new Date().toISOString(),cutoff:FINANCE_CUTOFF,records:affected.map(p=>({id:p.id,code:p.code,type:p.type,paymentDate:p.paymentDate,dueDate:p.dueDate,createdAt:p.createdAt,updatedAt:p.updatedAt}))};try{await window.MarcoStorage?.createBackup?.(typeof STATE!=='undefined'?STATE:window.STATE,'antes-migracao-codigos-financeiros-v2.2.6');}catch(error){console.warn('Backup pré-migração pendente:',error);}let changed=false;for(const prefix of ['REC','DES']){const records=affected.filter(p=>paymentPrefix(p)===prefix).sort((a,b)=>paymentReferenceDate(a).localeCompare(paymentReferenceDate(b))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))||String(a.id||'').localeCompare(String(b.id||''))),recordSet=new Set(records),used=new Set(),pending=[];for(const existing of d.payments||[]){if(recordSet.has(existing)||paymentPrefix(existing)!==prefix)continue;const parsed=window.MarcoIdentifiers?.parseEntityCode?.(existing.code||existing.id,prefix);if(parsed?.sequence>=1)used.add(parsed.sequence);}for(const p of records){const parsed=window.MarcoIdentifiers?.parseEntityCode?.(p.code,prefix);if(parsed&&parsed.sequence>=1&&!used.has(parsed.sequence)){used.add(parsed.sequence);if(p.code!==parsed.canonical){p.code=parsed.canonical;changed=true;}}else pending.push(p);}let seq=1;for(const p of pending){while(used.has(seq))seq++;const code=window.MarcoIdentifiers?.formatEntityCode?.(prefix,seq)||`${prefix}-${String(seq).padStart(6,'0')}`;used.add(seq++);if(p.code!==code){p.code=code;changed=true;}}}target.migrations.financeCodesV226={completedAt:new Date().toISOString(),cutoff:FINANCE_CUTOFF,processed:affected.length};if(typeof persist==='function')await persist('Migração financeira legada v2.2.6',`${affected.length} lançamento(s) revisado(s)`,{folder:false,google:false});return changed;}finally{migrationRunning=false;}}
  function wrapGlobals(){
    if(typeof window.openOrderForm==='function'&&!window.openOrderForm.__v227){const base=window.openOrderForm,wrapped=function(...args){const result=base.apply(this,args);requestAnimationFrame(()=>enhanceOrderAttachments());setTimeout(()=>enhanceOrderAttachments(),120);return result;};wrapped.__v227=true;window.openOrderForm=wrapped;}
    if(typeof window.renderView==='function'&&!window.renderView.__v227){const base=window.renderView,wrapped=function(...args){const result=base.apply(this,args);requestAnimationFrame(()=>postProcess(document));return result;};wrapped.__v227=true;window.renderView=wrapped;}
    if(typeof window.handleAction==='function'&&!window.handleAction.__v227){const base=window.handleAction,wrapped=async function(btn,event){const action=btn?.dataset?.action||'';if(action==='open-attachments-manager'){const form=btn.closest('form[data-form="order"]'),manager=form?.querySelector('[data-attachment-manager-v227]');if(manager){manager.hidden=false;requestAnimationFrame(()=>manager.classList.add('is-open'));refreshAttachments(form);}return;}if(action==='close-attachments-manager'){const manager=btn.closest('[data-attachment-manager-v227]');manager?.classList.remove('is-open');if(manager)setTimeout(()=>manager.hidden=true,170);return;}if(action==='remove-staged-attachment'){removeStaged(btn.closest('form[data-form="order"]'),Number(btn.dataset.index));return;}if(action==='view-staged-attachment'){viewStaged(btn.closest('form[data-form="order"]'),Number(btn.dataset.index));return;}if(action==='open-pix-settings'||action==='copy-order-pix'){toast?.('Dados de Pix foram desativados. Pix continua disponível como forma de pagamento.','warn');return;}const result=await base.call(this,btn,event);if(action==='stage-delete-existing-media')refreshAttachments(btn?.closest('form[data-form="order"]'));return result;};wrapped.__v227=true;window.handleAction=wrapped;}
  }
  document.addEventListener('change',event=>{if(event.target.matches('[data-visual-layout-zoom]'))applyLayoutZoom(event.target.closest('.layout-editor-v221'),event.target.value);const form=event.target.closest('form[data-form="order"]');if(form&&event.target.name==='attachments')refreshAttachments(form);},true);
  const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{if(node instanceof Element)postProcess(node);})));function init(){wrapGlobals();const target=settings();if(target){target.specialPixEnabled=false;target.pixUiDisabled=true;}postProcess(document);observer.observe(document.documentElement,{childList:true,subtree:true});setTimeout(()=>migrateFinanceCodes().catch(error=>{const message=String(error?.message||error||'');if(/Google Drive desconectado|Entre novamente/i.test(message))console.warn('Migração financeira legada aguardando conexão com o Google Drive.');else console.error('Migração financeira legada falhou:',error);}),1200);setInterval(()=>{const now=localDay();if(now!==lastLocalDay){lastLocalDay=now;dispatchEvent(new CustomEvent('marco-local-day-changed',{detail:{date:now}}));renderView?.();}},60000);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.MarcoV227={version:VERSION,migrateFinanceCodes,enhanceOrderAttachments};
})();

/* ===== js/v255-marco-review.js ===== */
'use strict';

/* Marco Iris v2.5.5 — revisão pós-migração solicitada por Marco
 * - numeração sem saltos;
 * - salvamento otimista em segundo plano com fila serial;
 * - preferências visuais por tela/perfil;
 * - ordenação de três estados em todas as tabelas operacionais;
 * - correções de dados e compatibilidade com PDFs históricos.
 */
(() => {
  const VERSION='2.5.5';
  const ENTITY_GROUPS={OSV:'serviceOrders',CLI:'clients',PRD:'products',SRV:'services',INS:'supplies',ITM:'orderItems',MOV:'stockMovements',AGE:'appointments',TER:'consents'};
  const SORT_SCHEMAS={
    orders:{labels:['OSV','Abertura','Cliente','Equipamento','Financeiro','Status','Valor'],types:['code','date','text','text','text','text','currency']},
    clients:{labels:['ID','Cliente','Contato','Cidade','Data de cadastro','Ordens','Total movimentado'],types:['code','text','text','text','date','number','currency']},
    finance:{labels:['Data','ID','Tipo','Cliente / OSV','Forma','Status','Taxa','Valor líquido'],types:['date','code','text','text','text','text','currency','currency']},
    'catalog.services':{labels:['ID','Serviço','Preço padrão','Execuções','Status'],types:['code','text','currency','number','text']},
    'catalog.products':{labels:['ID','Produto','Marca','Fornecedor','Custo','Margem','Venda','Estoque','Mínimo'],types:['code','text','text','text','currency','number','currency','number','number']},
    'catalog.supplies':{labels:['ID','Insumo','Marca','Fornecedor','Custo','Estoque','Mínimo'],types:['code','text','text','text','currency','number','number']},
    'catalog.movements':{labels:['ID','Data','Item','Tipo','Quantidade','Antes → Depois','OSV','Observação'],types:['code','date','text','text','number','number','code','text']},
    documents:{labels:['OSV','Cliente','Data/hora','Arquivo'],types:['code','text','date','text']}
  };
  const SAVE={requested:0,confirmed:0,running:false,retryTimer:0,retryDelay:5000,lastError:null,pending:[]};
  const PDF_TASKS=new Map();

  const sequenceFrom=value=>{
    const parsed=window.MarcoIdentifiers?.parseEntityCode?.(value);
    if(parsed?.sequence)return parsed.sequence;
    const match=String(value||'').match(/(\d+)(?!.*\d)/);return match?Number(match[1])||0:0;
  };
  const profileSettings=()=>{const d=data();d.settings=d.settings||{};return d.settings;};
  const paymentPrefix=p=>/despesa/i.test(String(p?.type||''))?'DES':'REC';
  const paymentCancelled=p=>/cancelad/i.test(String(p?.status||''))||!!p?.cancelledAt||p?.active===false;

  function reconcileNextIds(pd=data(),{allowLower=false}={}){
    if(!pd)return {};
    pd.settings=pd.settings||{};pd.settings.nextIds=pd.settings.nextIds||{};
    for(const [prefix,key] of Object.entries(ENTITY_GROUPS)){
      const max=(pd[key]||[]).reduce((m,x)=>Math.max(m,sequenceFrom(x?.id),sequenceFrom(x?.code)),0);
      const wanted=Math.max(1,max+1),current=Math.max(1,Number(pd.settings.nextIds[prefix])||1);
      pd.settings.nextIds[prefix]=allowLower?wanted:Math.max(current,wanted);
    }
    for(const prefix of ['REC','DES']){
      const max=(pd.payments||[]).filter(p=>paymentPrefix(p)===prefix).reduce((m,x)=>Math.max(m,sequenceFrom(x?.id),sequenceFrom(x?.code)),0);
      const wanted=Math.max(1,max+1);
      pd.settings.nextIds[prefix]=wanted;
    }
    return pd.settings.nextIds;
  }

  function historicalPdf(meta){
    return !!(meta?.legacy||meta?.legacyImported||meta?.importedLegacy||meta?.historicalImported||meta?.generatedByCurrentApp===false);
  }

  function patchMovementSnapshots(pd){
    const groups=new Map();
    for(const movement of pd.stockMovements||[]){
      const key=movement.productId?`Produto:${movement.productId}`:movement.supplyId?`Insumo:${movement.supplyId}`:'';
      if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(movement);
    }
    for(const [key,list] of groups){
      const [type,id]=key.split(':'),item=type==='Produto'?(pd.products||[]).find(x=>x.id===id):(pd.supplies||[]).find(x=>x.id===id);
      let stock=Number(item?.initialStock)||0;
      list.sort((a,b)=>String(a.date||a.createdAt||'').localeCompare(String(b.date||b.createdAt||''))||sequenceFrom(a.id)-sequenceFrom(b.id));
      for(const movement of list){
        const qty=Number(movement.quantity)||0,sign=/sa[ií]da/i.test(String(movement.movementType||''))?-1:1;
        if(Number.isFinite(Number(movement.stockBefore))&&Number.isFinite(Number(movement.stockAfter))){stock=Number(movement.stockAfter);continue;}
        movement.stockBefore=stock;stock+=sign*qty;movement.stockAfter=stock;
      }
    }
  }

  function repairProfile(pd){
    if(!pd||typeof pd!=='object')return;
    pd.settings=pd.settings||{};pd.settings.migrations=pd.settings.migrations||{};
    for(const order of pd.serviceOrders||[])for(const meta of order.pdfs||[]){
      if(meta.legacyImported||meta.importedLegacy||meta.generatedByCurrentApp===false){meta.legacy=true;meta.historicalImported=true;}
    }
    if(!pd.settings.migrations.marcoReviewV255?.completedAt){
      const has291=(pd.serviceOrders||[]).some(o=>o.id==='OSV-000291'),has292=(pd.serviceOrders||[]).some(o=>o.id==='OSV-000292');
      if(has292&&!has291){
        const removedMedia=[];
        for(const order of pd.serviceOrders.filter(o=>o.id==='OSV-000292'))removedMedia.push(...(order.photos||[]),...(order.pdfs||[]),...(order.attachments||[]));
        pd.serviceOrders=pd.serviceOrders.filter(o=>o.id!=='OSV-000292');
        const itemIds=new Set((pd.orderItems||[]).filter(i=>i.orderId==='OSV-000292').map(i=>i.id));
        pd.orderItems=(pd.orderItems||[]).filter(i=>i.orderId!=='OSV-000292');
        pd.payments=(pd.payments||[]).filter(p=>p.orderId!=='OSV-000292');
        pd.stockMovements=(pd.stockMovements||[]).filter(m=>m.orderId!=='OSV-000292'&&!itemIds.has(m.sourceItemId));
        pd.attachments=(pd.attachments||[]).filter(a=>a.orderId!=='OSV-000292');
        pd.settings.pendingDriveCleanup=Array.isArray(pd.settings.pendingDriveCleanup)?pd.settings.pendingDriveCleanup:[];
        for(const media of removedMedia)if(media?.driveFileId)pd.settings.pendingDriveCleanup.push({id:`cleanup_v255_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,orderId:'OSV-000292',mediaId:media.id||'',driveFileId:media.driveFileId,fileName:media.fileName||'',createdAt:new Date().toISOString(),reason:'OSV de teste removida pela revisão v2.5.5'});
      }
      const osv2=(pd.serviceOrders||[]).find(o=>o.id==='OSV-000002');
      if(osv2){osv2.status='Cancelada';osv2.total=0;osv2.updatedAt=new Date().toISOString();}
      for(const payment of pd.payments||[])if(payment.orderId==='OSV-000002'){
        payment.value=0;payment.grossValue=0;payment.fee=0;payment.status='Cancelado';payment.active=false;payment.cancelledAt=payment.cancelledAt||new Date().toISOString();payment.cancelReason='OSV-000002 marcada como cancelada na revisão v2.5.5';
      }
      const osv57=(pd.serviceOrders||[]).find(o=>o.id==='OSV-000057');
      if(osv57){
        const items=(pd.orderItems||[]).filter(i=>i.orderId==='OSV-000057').sort((a,b)=>sequenceFrom(a.id)-sequenceFrom(b.id));
        items.forEach((item,index)=>{item.quantity=Number(item.quantity)||1;item.unitPrice=index===0?4000:0;item.subtotal=index===0?4000:0;});
        osv57.total=4000;osv57.discount=0;osv57.status='Concluída';osv57.completedAt=osv57.completedAt||osv57.openedAt||new Date().toISOString().slice(0,10);osv57.updatedAt=new Date().toISOString();
        const payments=(pd.payments||[]).filter(p=>p.orderId==='OSV-000057'&&paymentPrefix(p)==='REC').sort((a,b)=>sequenceFrom(a.id)-sequenceFrom(b.id));
        if(payments[0]){payments[0].value=4000;payments[0].grossValue=4000;payments[0].fee=0;payments[0].status='Pago';payments[0].active=true;payments[0].paymentDate=payments[0].paymentDate||osv57.completedAt;delete payments[0].cancelledAt;delete payments[0].cancelReason;}
        payments.slice(1).forEach(p=>{p.value=0;p.grossValue=0;});
      }
      pd.settings.migrations.marcoReviewV255={completedAt:new Date().toISOString(),version:VERSION,notes:'OSV de teste removida condicionalmente; OSV-000002 e OSV-000057 reparadas; PDFs históricos marcados.'};
      reconcileNextIds(pd,{allowLower:true});
    }else reconcileNextIds(pd);
    patchMovementSnapshots(pd);
    pd.settings.modules={agenda:pd.settings.modules?.agenda===true,terms:pd.settings.modules?.terms===true};
    pd.settings.tableSorts=pd.settings.tableSorts||{};
    pd.settings.periodFilters=pd.settings.periodFilters||{};
    pd.settings.dashboardColumns=pd.settings.dashboardColumns||{};
  }

  const normalizeBase=normalizeState;
  normalizeState=function(){
    normalizeBase();
    for(const pd of Object.values(STATE?.dataByProfile||{}))repairProfile(pd);
    return STATE;
  };

  const getViewModeBase=getViewMode,setViewModeBase=setViewMode;
  const catalogSection=section=>section==='catalog'?`catalog.${ACTIVE_TAB.catalog||'services'}`:section;
  getViewMode=function(section,fallback){return getViewModeBase(catalogSection(section),fallback);};
  setViewMode=function(section,mode){return setViewModeBase(catalogSection(section),mode);};

  function savePending(){return SAVE.pending.length>0||SAVE.running||!!SAVE.retryTimer;}
  function setPendingFlag(){CLOUD_ONLY_COMMITTING=savePending();CLOUD_PENDING_LOCAL=savePending();}
  function scheduleFullRetry(){
    clearTimeout(SAVE.retryTimer);SAVE.retryTimer=setTimeout(()=>{SAVE.retryTimer=0;setPendingFlag();runSaveQueue().catch(error=>console.error('[V255_SAVE_RETRY]',error));},SAVE.retryDelay);
    setPendingFlag();
  }
  function latestPending(){return SAVE.pending[SAVE.pending.length-1]||null;}
  function discardConfirmed(revision){SAVE.pending=SAVE.pending.filter(item=>item.revision>revision);}
  async function runSaveQueue(){
    if(SAVE.running)return;SAVE.running=true;setPendingFlag();
    try{
      while(SAVE.pending.length){
        let target=latestPending();
        const covered=SAVE.pending.filter(item=>item.revision<=target.revision);
        const saveOptions={
          backup:covered.some(item=>item.options?.backup===true),
          media:covered.some(item=>item.options?.media!==false),
          reason:String(target.action||'fila-v255')
        };
        try{
          // Mídias pendentes podem atualizar o estado; quando nenhuma edição nova entrou
          // durante o upload, atualizamos o snapshot desta revisão antes de gravá-lo.
          if(saveOptions.media)await syncPendingMedia();
          if(SAVE.requested===target.revision){
            target={...target,stateSnapshot:clone(STATE)};
            const index=SAVE.pending.findIndex(item=>item.revision===target.revision);if(index>=0)SAVE.pending[index]=target;
          }
          const result=await serializeCloudWrite(()=>flushCloudState(saveOptions.reason,{backup:saveOptions.backup,retryMedia:false,stateSnapshot:target.stateSnapshot}));
          SAVE.confirmed=Math.max(SAVE.confirmed,target.revision);SAVE.lastError=null;discardConfirmed(target.revision);
          LAST_CONFIRMED_STATE=clone(result.stateSnapshot||target.stateSnapshot);await MarcoStorage.saveSyncBase?.(LAST_CONFIRMED_STATE);
          confirmPendingPaymentDeletions(LAST_CONFIRMED_STATE);
          clearTimeout(SAVE.retryTimer);SAVE.retryTimer=0;
          setSaveStatus(result.bridge&&!result.bridge.skipped?'Drive + Borion_Integracoes confirmados':'Google Drive confirmado','ok');
        }catch(error){
          SAVE.lastError=error;
          if(error?.baseCommitted){
            const committed=error.stateSnapshot||target.stateSnapshot;
            SAVE.confirmed=Math.max(SAVE.confirmed,target.revision);discardConfirmed(target.revision);LAST_CONFIRMED_STATE=clone(committed);await MarcoStorage.saveSyncBase?.(committed);
            confirmPendingPaymentDeletions(committed);
            setSaveStatus('Dados no Drive · integração com Borion pendente','warn');scheduleCloudRetry(saveOptions.reason);continue;
          }
          setSaveStatus('Alteração aguardando Google Drive · nova tentativa em 5 s','warn');scheduleFullRetry();break;
        }
      }
    }finally{SAVE.running=false;setPendingFlag();}
  }

  persist=async function(action='',detail='',opts={}){
    const rollback=message=>{
      if(LAST_CONFIRMED_STATE){STATE=clone(LAST_CONFIRMED_STATE);normalizeState();if(!LOCKED)renderView('none');}
      throw new Error(message);
    };
    if(!navigator.onLine)return rollback('Sem internet. A alteração não foi aceita porque o Google Drive é obrigatório.');
    if(!GoogleDriveMarco?.isConfigured?.())return rollback('Google Drive desconectado. Entre novamente antes de alterar dados.');
    if(action)addAudit(action,detail);
    reconcileNextIds(data());STATE.updatedAt=new Date().toISOString();window.MarcoBorionInterop?.prepareState?.(STATE);
    const revision=++SAVE.requested;
    SAVE.pending.push({revision,stateSnapshot:clone(STATE),action:String(action||'alteracao'),options:{backup:!!opts.backup,media:opts.media!==false}});
    setSaveStatus('Salvando em segundo plano…','warn');setPendingFlag();queueMicrotask(()=>runSaveQueue().catch(error=>console.error('[V255_BACKGROUND_SAVE]',error)));
    return {queued:true,revision,cloud:true,drive:'pending',errors:[]};
  };
  hasUnsyncedLocalState=function(){return savePending()||BACKGROUND_SAVE_COMPLETED<BACKGROUND_SAVE_REQUESTED||PENDING_PAYMENT_DELETIONS.size>0;};
  window.addEventListener('beforeunload',event=>{if(!savePending())return;event.preventDefault();event.returnValue='Há alterações aguardando confirmação no Google Drive.';});

  const generatePdfBase=generatePdfForOrder;
  generatePdfForOrder=function(orderId,share=false){
    if(share)return generatePdfBase(orderId,true);
    if(PDF_TASKS.has(orderId))return Promise.resolve({queued:true,reused:true});
    setSaveStatus(`Gerando PDF ${orderId} em segundo plano…`,'warn');toast('PDF sendo gerado em segundo plano. Você pode continuar usando o aplicativo.','ok');
    const task=Promise.resolve().then(()=>generatePdfBase(orderId,false)).catch(error=>{console.error('[V255_PDF]',error);toast(error?.message||'Não foi possível gerar o PDF.','error');}).finally(()=>PDF_TASKS.delete(orderId));
    PDF_TASKS.set(orderId,task);return Promise.resolve({queued:true});
  };

  const openOrderDetailBase=openOrderDetail,openClientDetailBase=openClientDetail;
  function hideRedundantDetailHeader(){requestAnimationFrame(()=>{const modal=document.querySelector('#modal-root .modal');if(modal?.querySelector('.detail-hero'))modal.classList.add('detail-modal-v255');});}
  openOrderDetail=function(...args){const result=openOrderDetailBase.apply(this,args);hideRedundantDetailHeader();return result;};
  openClientDetail=function(...args){const result=openClientDetailBase.apply(this,args);hideRedundantDetailHeader();return result;};

  function currentSortSection(){
    if(CURRENT_VIEW==='catalog')return `catalog.${ACTIVE_TAB.catalog||'services'}`;
    return ['orders','clients','finance','documents'].includes(CURRENT_VIEW)?CURRENT_VIEW:'';
  }
  function parseDateCell(text){
    const raw=String(text||'').trim(),br=raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[^\d]+(\d{1,2}):(\d{2}))?/);
    if(br){const year=Number(br[3])<100?2000+Number(br[3]):Number(br[3]);return new Date(year,Number(br[2])-1,Number(br[1]),Number(br[4]||0),Number(br[5]||0)).getTime();}
    const iso=Date.parse(raw);return Number.isNaN(iso)?0:iso;
  }
  function parseLocaleNumber(text){
    const raw=String(text||'').replace(/[^\d,.-]/g,'').trim();if(!raw)return Number.NEGATIVE_INFINITY;
    const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const value=Number(normalized);return Number.isFinite(value)?value:Number.NEGATIVE_INFINITY;
  }
  function sortValue(cell,type){
    const text=cell?.innerText?.replace(/\s+/g,' ').trim()||'';
    if(type==='code')return sequenceFrom(text);
    if(type==='date')return parseDateCell(text);
    if(type==='currency'||type==='number')return parseLocaleNumber(text);
    return text.toLocaleLowerCase('pt-BR');
  }
  function compareValues(a,b,type){
    if(type==='text')return String(a).localeCompare(String(b),'pt-BR',{sensitivity:'base',numeric:true});
    return (Number(a)||0)-(Number(b)||0);
  }
  function enhanceTableSorting(root=document){
    const section=currentSortSection(),schema=SORT_SCHEMAS[section];if(!schema)return;
    const table=root.querySelector?.('#view-root table');if(!table)return;
    table.dataset.sortSection=section;
    const headers=[...table.querySelectorAll('thead th')],settings=profileSettings(),state=settings.tableSorts?.[section]||{column:-1,direction:'default'};
    schema.labels.forEach((label,index)=>{
      const th=headers[index];if(!th)return;const active=Number(state.column)===index&&state.direction!=='default',indicator=!active?'⇅':state.direction==='desc'?'↓':'↑';
      th.setAttribute('aria-sort',active?(state.direction==='desc'?'descending':'ascending'):'none');
      th.innerHTML=`<button type="button" class="table-sort-button-v255 ${active?'is-active':''}" data-action="table-sort-v255" data-section="${attr(section)}" data-column="${index}" title="${attr(!active?`Ordenar ${label}: maior para menor`:state.direction==='desc'?`${label}: maior para menor. Clique para menor para maior.`:`${label}: menor para maior. Clique para voltar ao padrão.`)}"><span>${esc(label)}</span><span aria-hidden="true">${indicator}</span></button>`;
    });
    if(state.direction==='default'||Number(state.column)<0)return;
    const tbody=table.tBodies[0],rows=[...(tbody?.rows||[])].filter(row=>!row.querySelector('.empty'));
    const indexed=rows.map((row,index)=>({row,index,value:sortValue(row.cells[Number(state.column)],schema.types[Number(state.column)]||'text')}));
    indexed.sort((a,b)=>{const cmp=compareValues(a.value,b.value,schema.types[Number(state.column)]||'text');return (state.direction==='desc'?-cmp:cmp)||a.index-b.index;});
    indexed.forEach(item=>tbody.appendChild(item.row));
  }

  const renderViewBase=renderView;
  renderView=function(...args){const result=renderViewBase.apply(this,args);requestAnimationFrame(()=>enhanceTableSorting(document));return result;};

  const handleActionBase=handleAction;
  handleAction=async function(btn,...rest){
    const action=btn?.dataset?.action||'';
    if(action==='table-sort-v255'){
      const section=btn.dataset.section,column=Number(btn.dataset.column),settings=profileSettings();settings.tableSorts=settings.tableSorts||{};
      const old=settings.tableSorts[section]||{column:-1,direction:'default'};let direction='desc';
      if(Number(old.column)===column)direction=old.direction==='default'?'desc':old.direction==='desc'?'asc':'default';
      settings.tableSorts[section]={column:direction==='default'?-1:column,direction};
      await persist('Ordenação de tabela atualizada',`${section} · coluna ${column} · ${direction}`,{media:false});renderView();return;
    }
    if(action==='clear-unified-period'){
      const section=btn.dataset.section,settings=profileSettings();settings.periodFilters=settings.periodFilters||{};settings.periodFilters[section]={month:'',days:''};
      await persist('Filtro de período limpo',section,{media:false});renderView();return;
    }
    if(action==='dashboard-revenue-period'){
      const settings=profileSettings(),period=btn.dataset.period;if(!['year','month','day'].includes(period))return;
      settings.dashboardRevenuePeriod=period;await persist('Período do faturamento atualizado',period,{media:false});renderView();return;
    }
    if(action==='dashboard-revenue-select'){
      const settings=profileSettings(),key=String(btn.dataset.key||''),period=settings.dashboardRevenuePeriod||'month';
      settings.dashboardRevenueSelected=key;
      if(period==='year'){settings.dashboardRevenueYear=key;}
      else if(period==='month'){settings.dashboardRevenueMonth=key;settings.dashboardRevenueYear=key.slice(0,4);}
      else if(period==='day'){settings.dashboardRevenueDay=key;settings.dashboardRevenueMonth=key.slice(0,7);settings.dashboardRevenueYear=key.slice(0,4);}
      await persist('Período do gráfico selecionado',key,{media:false});renderView();return;
    }
    if(action==='dashboard-revenue-scroll'){
      const chart=btn.closest('.revenue-widget-v255')?.querySelector('.revenue-chart-v255');if(!chart)return;
      chart.scrollBy({left:(Number(btn.dataset.dir)||1)*Math.max(260,chart.clientWidth*.72),behavior:'smooth'});return;
    }
    if(action==='generate-pdf-background'){await generatePdfForOrder(btn.dataset.id,false);return;}
    return await handleActionBase.call(this,btn,...rest);
  };

  document.addEventListener('change',event=>{
    const select=event.target.closest?.('[data-dashboard-columns]');if(!select)return;
    const count=Math.max(1,Math.min(4,Number(select.value)||3)),settings=profileSettings(),band=window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';
    settings.dashboardColumns=settings.dashboardColumns||{};settings.dashboardColumns[band]=count;
    settings.dashboardLayouts=settings.dashboardLayouts||{};const store=settings.dashboardLayouts[band]||(settings.dashboardLayouts[band]={}),span=Math.max(3,Math.round(12/count));
    Object.values(store).forEach(layout=>{if(layout&&typeof layout==='object')layout.span=band==='mobile'?12:span;});
    persist('Quantidade de colunas do painel atualizada',`${band}: ${count}`,{media:false}).catch(error=>toast(error.message,'error'));renderView();
  },true);

  window.MarcoV255={version:VERSION,reconcileNextIds,repairProfile,enhanceTableSorting,saveStatus:()=>({...SAVE}),pdfTasks:PDF_TASKS};
  window.MarcoAppBoot?.();
})();

/* ===== js/v256-final-adjustments.js ===== */
'use strict';

/* Marco Iris Tecnologia v2.7.5 — ajustes finais solicitados após a migração.
 * Esta camada é carregada por último para preservar a base histórica e substituir
 * somente apresentação, filtros, cliques e personalização visual.
 */
(() => {
  const VERSION='2.8.3';
  const ORDER_STATUSES=['Orçamento','Em andamento','Aguardando peça','Concluída','Cancelada'];
  const INTERACTIVE_SELECTOR='button,a,input,select,textarea,label,summary,details,[role="button"],[contenteditable="true"]';
  const ENTITY_EDIT_ACTION={service:'edit-service',product:'edit-product',supply:'edit-supply',movement:'edit-stock-movement'};
  const MODAL_LAYOUT={editing:false,key:'',snapshot:null,drag:null};
  const PRIVACY_TEXT_ORIGINALS=new WeakMap();
  const PRIVACY_TITLE_ORIGINALS=new WeakMap();
  let RESIZE_SESSION=null;

  if(typeof ICONS!=='undefined'&&!ICONS['eye-off'])ICONS['eye-off']='<path d="M3 3l18 18"/><path d="M10.6 10.7a2 2 0 0 0 2.7 2.7"/><path d="M9.9 4.3A10.7 10.7 0 0 1 12 4c6 0 10 8 10 8a18.2 18.2 0 0 1-2.1 3.1"/><path d="M6.6 6.6C3.8 8.5 2 12 2 12s4 8 10 8a9.7 9.7 0 0 0 4.1-.9"/>';
  if(typeof ICONS!=='undefined'&&!ICONS.archive)ICONS.archive='<path d="M4 4h16v4H4z"/><path d="M6 8v12h12V8"/><path d="M10 12h4"/>';
  if(typeof ICONS!=='undefined'&&!ICONS.power)ICONS.power='<path d="M12 2v10"/><path d="M6.3 5.7a8 8 0 1 0 11.4 0"/>';

  const settings=()=>{const d=data();d.settings=d.settings||{};return d.settings;};
  const screenBand256=()=>window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';
  const parseSequence=value=>Number(String(value||'').match(/(\d+)(?!.*\d)/)?.[1]||0);
  const isCancelledPayment=p=>norm(p?.status).includes('cancel')||!!p?.cancelledAt||p?.active===false;
  const isPaidPayment=p=>!isCancelledPayment(p)&&!!p?.paymentDate;
  const orderNotArchived=o=>o?.registrationStatus!=='Inativo';
  const orderNotCancelled=o=>!norm(o?.status).includes('cancel');
  const currentOrderStatus=()=>settings().orderStatusFilterV256||'Todos';

  function orderFinance256(order){
    if(!order||!orderNotCancelled(order))return {status:'Cancelado',paid:0,balance:0,overdue:false,dueDate:''};
    const receipts=orderPayments(order.id).filter(p=>norm(p.type)==='receita'&&!isCancelledPayment(p));
    const paid=receipts.filter(isPaidPayment).reduce((sum,p)=>sum+num(p.value),0);
    const unpaid=receipts.filter(p=>!isPaidPayment(p));
    const dueDate=unpaid.map(p=>p.dueDate).filter(Boolean).sort()[0]||'';
    const overdue=unpaid.some(p=>p.dueDate&&String(p.dueDate).slice(0,10)<today());
    const balance=Math.max(0,num(order.total)-paid);
    const status=balance<=.005&&num(order.total)>0?'Pago':paid>0?'Parcial':overdue?'Vencido':'Em aberto';
    return {status,paid,balance,overdue,dueDate};
  }

  function periodState256(section){
    const s=settings();s.periodFilters=s.periodFilters||{};
    const state=s.periodFilters[section]||(s.periodFilters[section]={month:'',fromDay:'',toDay:''});
    if(state.days&&!state.fromDay){
      const match=String(state.days).match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);
      if(match){state.fromDay=match[1];state.toDay=match[2]||'';}
      delete state.days;
    }
    state.month=String(state.month||'');state.fromDay=String(state.fromDay||'');state.toDay=String(state.toDay||'');
    return state;
  }
  function clampDay(value){const parsed=Number(value);return Number.isFinite(parsed)&&parsed>0?Math.max(1,Math.min(31,Math.trunc(parsed))):0;}
  function matchesPeriod256(value,section){
    const state=periodState256(section),date=String(value||'').slice(0,10);
    if(state.month&&date.slice(0,7)!==state.month)return false;
    const from=clampDay(state.fromDay),to=clampDay(state.toDay),day=clampDay(date.slice(8,10));
    if(!from&&!to)return true;
    if(from&&!to)return day===from;
    if(!from&&to)return day===to;
    return day>=Math.min(from,to)&&day<=Math.max(from,to);
  }
  function periodControls256(section){
    const state=periodState256(section);
    return `<div class="period-filter-v256" data-period-section="${attr(section)}"><input class="filter-control period-month-v256" type="month" data-period-month-v256="${attr(section)}" value="${attr(state.month)}" aria-label="Selecionar mês e ano"><label class="period-day-v256"><span>De</span><input class="filter-control" type="number" min="1" max="31" inputmode="numeric" data-period-from-v256="${attr(section)}" value="${attr(state.fromDay)}" placeholder="Dia" aria-label="Dia inicial"></label><label class="period-day-v256"><span>Até</span><input class="filter-control" type="number" min="1" max="31" inputmode="numeric" data-period-to-v256="${attr(section)}" value="${attr(state.toDay)}" placeholder="Dia" aria-label="Dia final"></label><button type="button" class="icon-btn control-square-v256" data-action="clear-period-v256" data-section="${attr(section)}" title="Limpar período" aria-label="Limpar período">🧹</button></div>`;
  }
  function iconButton(action,title,iconName,extra=''){
    return `<button type="button" class="icon-btn control-square-v256" data-action="${attr(action)}" title="${attr(title)}" aria-label="${attr(title)}" ${extra}>${icon(iconName)}</button>`;
  }
  function archivedButton(action,title,count,showArchived){
    const visibleTitle=showArchived?'Ver ativos':`${title}${Number.isFinite(count)?` (${count})`:''}`;
    return iconButton(action,visibleTitle,showArchived?'check':'archive',`data-count="${attr(count)}"`);
  }
  function quickOrderActions256(order){
    return `<details class="quick-actions"><summary aria-label="Ações rápidas">${icon('menu',18)}</summary><div class="quick-actions-menu"><button data-action="new-payment" data-order="${attr(order.id)}">${icon('finance',16)} Adicionar pagamento</button><button data-action="generate-pdf-background" data-id="${attr(order.id)}">${icon('pdf',16)} Gerar PDF</button><button data-action="view-current-pdf" data-id="${attr(order.id)}">${icon('eye',16)} Visualizar PDF</button><button data-action="share-order" data-id="${attr(order.id)}">${icon('phone',16)} Enviar PDF</button><button data-action="view-client" data-id="${attr(order.clientId)}">${icon('clients',16)} Abrir cliente</button><button data-action="edit-order" data-id="${attr(order.id)}">${icon('edit',16)} Editar OSV</button></div></details>`;
  }

  function ensureDefaults256(){
    if(typeof STATE==='undefined'||!STATE?.dataByProfile)return;
    const s=settings();s.migrations=s.migrations||{};s.dashboardLayouts=s.dashboardLayouts||{};
    const normalRowsById=(id)=>{
      id=String(id||'');
      if(id==='clientId')return 4;
      if(['openedAt','completedAt','status','equipmentType','brandModel','serialNumber','accessPassword','accessories','name','phone','document','address','zip','number','city','state','neighborhood','complement'].includes(id))return 4;
      if(['reportedIssue','technicalReport','clientNotes','internalNotes','notes'].includes(id))return 8;
      return 0;
    };
    if(!s.migrations.layoutNormalDefaultsV263){
      const layouts=s.unifiedLayoutsV256||{};
      for(const band of Object.keys(layouts)){
        for(const key of Object.keys(layouts[band]||{})){
          const store=layouts[band][key]||{};
          for(const gridKey of Object.keys(store)){
            const gridStore=store[gridKey]||{};
            for(const itemId of Object.keys(gridStore)){
              const target=normalRowsById(itemId);
              if(target&&Number(gridStore[itemId]?.rows||0)<target)gridStore[itemId].rows=target;
            }
          }
        }
      }
      s.migrations.layoutNormalDefaultsV263={version:VERSION,appliedAt:new Date().toISOString()};
    }
    // v2.6.6: corrige somente o editor do Novo/Editar lançamento.
    // Layouts antigos desse formulário podiam guardar coordenadas quebradas; os demais editores não são tocados.
    if(!s.migrations.paymentLayoutRepairV265){
      const layouts=s.unifiedLayoutsV256||{};
      for(const band of ['desktop','tablet','mobile']){
        if(layouts[band]&&Object.prototype.hasOwnProperty.call(layouts[band],'form:payment'))delete layouts[band]['form:payment'];
      }
      s.migrations.paymentLayoutRepairV265={version:VERSION,appliedAt:new Date().toISOString()};
    }
    if(!s.migrations.revenueExpandedV257){
      for(const band of ['desktop','tablet','mobile']){
        const store=s.dashboardLayouts[band]||(s.dashboardLayouts[band]={}),existing=store.revenue||{},hadSaved=!!store.revenue;
        const oldSpan=Number(existing.span),oldRows=Number(existing.rows),oldOrder=Number(existing.order);
        store.revenue={...existing,span:Math.max(hadSaved&&band==='desktop'?8:12,Number.isFinite(oldSpan)?oldSpan:0),rows:Math.max(26,Number.isFinite(oldRows)?oldRows:0),order:Number.isFinite(oldOrder)?oldOrder:3};
      }
      s.migrations.revenueExpandedV257={version:VERSION,appliedAt:new Date().toISOString()};
    }
    if(!s.migrations.finalAdjustmentsV256)s.migrations.finalAdjustmentsV256={version:VERSION,appliedAt:new Date().toISOString()};
    if(!s.migrations.recheckV257)s.migrations.recheckV257={version:VERSION,appliedAt:new Date().toISOString()};
  }

  const renderShellBase256=renderShell;
  renderShell=function(entry=''){
    ensureDefaults256();
    renderShellBase256(entry);
    const sidebarFooter=document.querySelector('.sidebar-footer');
    if(sidebarFooter){
      sidebarFooter.querySelectorAll('.nav-btn').forEach(button=>button.remove());
      if(!sidebarFooter.querySelector('.sidebar-quick-actions-v256'))sidebarFooter.insertAdjacentHTML('beforeend',`<div class="sidebar-quick-actions-v256"><button class="icon-btn" title="Ocultar ou mostrar valores" aria-label="Ocultar ou mostrar valores" data-action="toggle-privacy">${icon(settings().dashboardPrivacy?'eye-off':'eye')}</button><button class="icon-btn" title="Salvar no Google Drive" aria-label="Salvar no Google Drive" data-action="manual-save">${icon('save')}</button><button class="icon-btn lock-sidebar-btn" title="Bloquear tela" aria-label="Bloquear tela" data-action="lock-now">${icon('lock')}</button></div>`);
    }
    const topPrivacy=document.querySelector('.top-actions [data-action="toggle-privacy"]');
    if(topPrivacy)topPrivacy.classList.remove('desktop-only');
    updatePrivacyButtons256();
  };

  renderOrders=function(){
    const mode=getViewMode('orders'),all=[...data().serviceOrders].filter(o=>matches(o.id,o.clientName,findClient(o.clientId)?.name,o.equipmentType,o.brandModel,o.status,o.reportedIssue));
    const rows=all.filter(o=>(SHOW_ARCHIVED.orders?o.registrationStatus==='Inativo':o.registrationStatus!=='Inativo')&&matchesPeriod256(o.openedAt||o.createdAt,'orders')).sort((a,b)=>String(b.openedAt||'').localeCompare(String(a.openedAt||'')));
    const status=currentOrderStatus(),filtered=status==='Todos'?rows:rows.filter(o=>norm(o.status)===norm(status)),archived=all.filter(o=>o.registrationStatus==='Inativo').length;
    return `<div class="toolbar unified-toolbar-v256 orders-toolbar"><div class="toolbar-left"><button class="btn primary control-main-v256" data-action="new-order">${icon('plus')} Nova OSV</button>${periodControls256('orders')}<select class="filter-control control-status-v256" data-order-status-v256 aria-label="Filtrar por status"><option>Todos</option>${ORDER_STATUSES.map(value=>`<option ${value===status?'selected':''}>${esc(value)}</option>`).join('')}</select>${archivedButton('toggle-archived-orders','Arquivadas',archived,SHOW_ARCHIVED.orders)}</div><div class="toolbar-right">${viewModeSwitcher('orders',mode)}<span class="badge blue">${filtered.length} OSVs</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="orders"><div class="table-wrap"><table class="table osv-table"><thead><tr><th>OSV</th><th>Abertura</th><th>Cliente</th><th>Equipamento</th><th>Financeiro</th><th>Status</th><th class="text-right">Valor</th><th>Ações</th></tr></thead><tbody>${filtered.map(order=>{const f=orderFinance256(order);return `<tr class="clickable-row-v256" data-row-action="view-order" data-id="${attr(order.id)}"><td><strong>${esc(order.id)}</strong>${order.registrationStatus==='Inativo'?'<small class="muted">Arquivada</small>':''}</td><td>${formatDate(order.openedAt)}</td><td><button class="text-link" data-action="view-client" data-id="${attr(order.clientId)}">${esc(order.clientName||findClient(order.clientId)?.name||'—')}</button></td><td><strong>${esc(order.equipmentType||'—')}</strong>${order.brandModel?`<small class="muted"> · ${esc(order.brandModel)}</small>`:''}</td><td>${statusBadge(f.status==='Parcial'&&f.overdue?'Parcial - vencido':f.status)}<small class="muted">${f.balance>0?currency(f.balance)+' pendente':''}</small></td><td><div class="inline-status-shell" data-status-tone="${attr(norm(order.status))}"><select class="inline-status" data-quick-order-status="${attr(order.id)}" aria-label="Status operacional da OSV ${attr(order.id)}">${ORDER_STATUSES.map(value=>`<option value="${attr(value)}" ${value===order.status?'selected':''}>${esc(value)}</option>`).join('')}</select><span class="inline-status-chevron" aria-hidden="true">${icon('arrow',14)}</span><span class="inline-status-saving" aria-hidden="true"></span></div></td><td class="text-right"><strong>${currency(order.total)}</strong></td><td>${quickOrderActions256(order)}</td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhuma OSV encontrada.</div></td></tr>'}</tbody></table></div></section>`;
  };

  renderClients=function(){
    const mode=getViewMode('clients'),all=[...data().clients].filter(c=>matches(c.id,c.name,c.document,c.phone,c.city,c.address,c.notes));
    const clients=all.filter(c=>SHOW_ARCHIVED.clients?c.status==='Inativo':c.status!=='Inativo').sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'pt-BR')),archived=all.filter(c=>c.status==='Inativo').length;
    return `<div class="toolbar unified-toolbar-v256"><div class="toolbar-left"><button class="btn primary control-main-v256" data-action="new-client">${icon('plus')} Novo cliente</button>${archivedButton('toggle-archived-clients','Clientes arquivados',archived,SHOW_ARCHIVED.clients)}</div><div class="toolbar-right">${viewModeSwitcher('clients',mode)}<span class="badge blue">${clients.length} clientes</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="clients"><div class="table-wrap"><table class="table clients-table-v256"><thead><tr><th>ID</th><th>Cliente</th><th>Contato</th><th>Cidade</th><th>Data de cadastro</th><th>Ordens</th><th>Total movimentado</th><th>Ações</th></tr></thead><tbody>${clients.map(client=>{const orders=data().serviceOrders.filter(order=>order.clientId===client.id&&order.registrationStatus!=='Inativo'),total=orders.reduce((sum,order)=>sum+num(order.total),0);return `<tr class="clickable-row-v256" data-row-action="view-client" data-id="${attr(client.id)}"><td><strong>${esc(client.id)}</strong></td><td><strong>${esc(client.name)}</strong>${client.document?`<small class="muted">${esc(client.document)}</small>`:''}${client.status==='Inativo'?'<small class="muted">Arquivado</small>':''}</td><td>${whatsappNumber(client.phoneNormalized||client.phone)?`<a href="${phoneLink(client.phoneNormalized||client.phone)}" target="_blank">${esc(client.phone)}</a>`:'—'}</td><td>${esc(client.city||'—')}</td><td>${formatDate(client.createdAt)}</td><td>${orders.length}</td><td><strong>${currency(total)}</strong></td><td><div class="actions"><button title="Editar" data-action="edit-client" data-id="${attr(client.id)}">${icon('edit')}</button><button title="${client.status==='Inativo'?'Restaurar':'Arquivar'}" data-action="toggle-client-status" data-id="${attr(client.id)}">${icon(client.status==='Inativo'?'check':'folder')}</button><button title="Excluir definitivamente" data-action="delete-client" data-id="${attr(client.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhum cliente encontrado.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function financeIndicators256(){
    const paid=(data().payments||[]).filter(p=>isPaidPayment(p)),activeOrders=(data().serviceOrders||[]).filter(orderNotCancelled);
    let service=0,product=0,expenses=0,taxes=0;
    for(const p of paid){
      const value=num(p.value);if(norm(p.type)==='despesa'){if(/imposto|taxa|tribut/.test(norm(`${p.category||''} ${p.expenseCategory||''} ${p.notes||''}`)))taxes+=value;else expenses+=value;continue;}
      const order=findOrder(p.orderId),items=order?orderItems(order.id):[],serviceBase=items.filter(i=>norm(i.type)==='servico').reduce((s,i)=>s+num(i.subtotal),0),productBase=items.filter(i=>norm(i.type)==='produto').reduce((s,i)=>s+num(i.subtotal),0),base=serviceBase+productBase;
      if(base>0){service+=value*(serviceBase/base);product+=value*(productBase/base);}else service+=value;
      taxes+=num(p.fee);
    }
    const total=service+product,receivable=activeOrders.reduce((sum,o)=>sum+orderFinance256(o).balance,0);
    return {service,product,total,expenses,taxes,balance:total-expenses-taxes,receivable};
  }
  renderFinance=function(){
    const mode=getViewMode('finance'),list=[...data().payments].filter(p=>matches(p.id,p.code,p.type,p.paymentMethod,p.status,p.notes,p.orderId,findOrder(p.orderId)?.clientName)).filter(p=>matchesPeriod256(p.paymentDate||p.dueDate||p.createdAt,'finance')).sort((a,b)=>String(b.paymentDate||b.dueDate||b.createdAt||'').localeCompare(String(a.paymentDate||a.dueDate||a.createdAt||''))),k=financeIndicators256();
    const effective=p=>isCancelledPayment(p)?'Cancelado':p.paymentDate?'Pago':p.dueDate&&String(p.dueDate).slice(0,10)<today()?'Vencido':num(p.value)>0?'Em aberto':'Em aberto';
    return `<div class="grid kpis mit-finance-kpis"><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receita de Serviços</small><strong>${currency(k.service)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('stock')}</div><div><small>Receita de Produtos</small><strong>${currency(k.product)}</strong></div></div><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receita Total</small><strong>${currency(k.total)}</strong></div></div><div class="card kpi"><div class="kpi-icon red">${icon('finance')}</div><div><small>Despesas</small><strong>${currency(k.expenses)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('documents')}</div><div><small>Impostos</small><strong>${currency(k.taxes)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('finance')}</div><div><small>Saldo</small><strong>${currency(k.balance)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('agenda')}</div><div><small>Valores a Receber</small><strong>${currency(k.receivable)}</strong></div></div></div><div class="toolbar unified-toolbar-v256"><div class="toolbar-left"><button class="btn primary control-main-v256" data-action="new-payment">${icon('plus')} Novo lançamento</button>${periodControls256('finance')}${iconButton('export-finance','Exportar CSV','download')}</div><div class="toolbar-right">${viewModeSwitcher('finance',mode)}<span class="badge blue">${list.length} lançamentos</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="finance"><div class="table-wrap"><table class="table finance-table-v256"><thead><tr><th>Data</th><th>ID</th><th>Tipo</th><th>Cliente / OSV</th><th>Forma</th><th>Status</th><th>Taxa</th><th class="text-right">Valor líquido</th><th>Ações</th></tr></thead><tbody>${list.map(payment=>{const order=findOrder(payment.orderId),status=effective(payment);return `<tr class="clickable-row-v256" data-row-action="edit-payment" data-id="${attr(payment.id)}"><td>${formatDate(payment.paymentDate||payment.dueDate)}</td><td><strong>${esc(payment.code||payment.id)}</strong></td><td>${statusBadge(payment.type)}</td><td>${order?`<button class="text-link" data-action="view-client" data-id="${attr(order.clientId)}">${esc(order.clientName||'Cliente')}</button><button class="code-link" data-action="view-order" data-id="${attr(order.id)}">${esc(order.id)}</button>`:esc(payment.notes||'Sem OSV vinculada')}</td><td>${esc(payment.paymentMethod||'—')}</td><td>${statusBadge(status)}</td><td>${currency(payment.fee)}</td><td class="text-right"><strong class="${norm(payment.type)==='despesa'?'danger-text':'success-text'}">${norm(payment.type)==='despesa'?'- ':''}${currency(payment.value)}</strong></td><td><div class="actions"><button title="Editar lançamento" data-action="edit-payment" data-id="${attr(payment.id)}">${icon('edit')}</button><button title="Cancelar mantendo histórico" data-action="cancel-payment" data-id="${attr(payment.id)}">${icon('warning')}</button>${canPermanentlyDeletePayment(payment)?`<button title="Excluir definitivamente" data-action="delete-payment" data-id="${attr(payment.id)}">${icon('trash')}</button>`:''}</div></td></tr>`;}).join('')||'<tr><td colspan="9"><div class="empty">Nenhum lançamento encontrado.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function catalogCount(kind,id){return (data().priceHistory||[]).filter(row=>norm(row.type)===norm(kind)&&String(row.catalogId||row.itemId||row.serviceId||row.productId||row.supplyId)===String(id)).length;}
  function healthBadge256(type,item){const stock=stockOf(type,item.id),health=window.MarcoStockHealth?.getStockHealth?.(stock,item.minimumStock)||{tone:'ok',label:String(stock)};return {stock,html:`<span class="stock-health-badge ${attr(health.tone)}">${esc(health.label)}</span><small class="muted">${stock}</small>`};}
  function renderCatalogTable256(tab){
    const mode=getViewMode('catalog');
    if(tab==='services'){
      const list=data().services.filter(item=>(SHOW_ARCHIVED.catalog?item.status==='Inativo':item.status!=='Inativo')&&matches(item.id,item.description,item.price)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));
      return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table catalog-services-v256"><thead><tr><th>ID</th><th>Serviço</th><th>Preço padrão</th><th>Execuções</th><th>Status</th><th>Ações</th></tr></thead><tbody>${list.map(item=>`<tr class="clickable-row-v256" data-row-action="edit-service" data-id="${attr(item.id)}"><td><strong>${esc(item.id)}</strong></td><td><strong>${esc(item.description)}</strong></td><td>${currency(item.price)}</td><td>${catalogCount('Serviço',item.id)}</td><td>${statusBadge(item.status)}</td><td><div class="actions"><button title="Editar serviço" data-action="edit-service" data-id="${attr(item.id)}">${icon('edit')}</button><button title="${item.status==='Inativo'?'Restaurar':'Arquivar'} serviço" data-action="toggle-catalog-status" data-kind="service" data-id="${attr(item.id)}">${icon(item.status==='Inativo'?'check':'folder')}</button></div></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhum serviço cadastrado.</div></td></tr>'}</tbody></table></div></section>`;
    }
    if(tab==='products'){
      const list=data().products.filter(item=>(SHOW_ARCHIVED.catalog?item.status==='Inativo':item.status!=='Inativo')&&matches(item.id,item.description,item.brand,item.supplier)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));
      return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table catalog-products-v256"><thead><tr><th>ID</th><th>Produto</th><th>Marca</th><th>Fornecedor</th><th>Custo</th><th>Margem</th><th>Venda</th><th>Estoque</th><th>Mínimo</th><th>Ações</th></tr></thead><tbody>${list.map(item=>{const stock=healthBadge256('Produto',item);return `<tr class="clickable-row-v256" data-row-action="edit-product" data-id="${attr(item.id)}"><td><strong>${esc(item.id)}</strong></td><td><strong>${esc(item.description)}</strong></td><td>${esc(item.brand||'—')}</td><td>${esc(item.supplier||'—')}</td><td>${currency(item.cost)}</td><td>${(num(item.margin)*100).toFixed(1).replace('.',',')}%</td><td>${currency(item.salePrice)}</td><td>${stock.html}</td><td>${item.minimumStock===''||item.minimumStock==null?'—':num(item.minimumStock)}</td><td><div class="actions"><button title="Atualizar custo" data-action="update-cost" data-kind="product" data-id="${attr(item.id)}">${icon('finance')}</button><button title="Editar produto" data-action="edit-product" data-id="${attr(item.id)}">${icon('edit')}</button><button title="${item.status==='Inativo'?'Restaurar':'Arquivar'} produto" data-action="toggle-catalog-status" data-kind="product" data-id="${attr(item.id)}">${icon(item.status==='Inativo'?'check':'folder')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="10"><div class="empty">Nenhum produto cadastrado.</div></td></tr>'}</tbody></table></div></section>`;
    }
    if(tab==='supplies'){
      const list=data().supplies.filter(item=>(SHOW_ARCHIVED.catalog?item.status==='Inativo':item.status!=='Inativo')&&matches(item.id,item.description,item.brand,item.supplier)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));
      return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table catalog-supplies-v256"><thead><tr><th>ID</th><th>Insumo</th><th>Marca</th><th>Fornecedor</th><th>Custo</th><th>Estoque</th><th>Mínimo</th><th>Ações</th></tr></thead><tbody>${list.map(item=>{const stock=healthBadge256('Insumo',item);return `<tr class="clickable-row-v256" data-row-action="edit-supply" data-id="${attr(item.id)}"><td><strong>${esc(item.id)}</strong></td><td><strong>${esc(item.description)}</strong></td><td>${esc(item.brand||'—')}</td><td>${esc(item.supplier||'—')}</td><td>${currency(item.cost)}</td><td>${stock.html}</td><td>${item.minimumStock===''||item.minimumStock==null?'—':num(item.minimumStock)}</td><td><div class="actions"><button title="Atualizar custo" data-action="update-cost" data-kind="supply" data-id="${attr(item.id)}">${icon('finance')}</button><button title="Editar insumo" data-action="edit-supply" data-id="${attr(item.id)}">${icon('edit')}</button><button title="${item.status==='Inativo'?'Restaurar':'Arquivar'} insumo" data-action="toggle-catalog-status" data-kind="supply" data-id="${attr(item.id)}">${icon(item.status==='Inativo'?'check':'folder')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhum insumo cadastrado.</div></td></tr>'}</tbody></table></div></section>`;
    }
    const list=[...data().stockMovements].filter(m=>matches(m.id,m.date,m.movementType,m.orderId,m.notes,itemForMovement(m)?.description)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||parseSequence(b.id)-parseSequence(a.id));
    return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table catalog-movements-v256"><thead><tr><th>ID</th><th>Data</th><th>Item</th><th>Tipo</th><th>Quantidade</th><th>Antes → Depois</th><th>OSV</th><th>Observação</th><th>Ações</th></tr></thead><tbody>${list.map(movement=>{const item=itemForMovement(movement);return `<tr class="clickable-row-v256" data-row-action="edit-stock-movement" data-id="${attr(movement.id)}"><td><strong>${esc(movement.id)}</strong></td><td>${formatDate(movement.date)}</td><td><strong>${esc(item?.description||'Item não encontrado')}</strong><small class="muted">${esc(movement.itemType||'')}</small></td><td>${statusBadge(movement.movementType)}</td><td>${num(movement.quantity)}</td><td><strong>${num(movement.stockBefore)} → ${num(movement.stockAfter)}</strong></td><td>${movement.orderId?`<button class="code-link" data-action="view-order" data-id="${attr(movement.orderId)}">${esc(movement.orderId)}</button>`:'—'}</td><td>${esc(movement.notes||'—')}</td><td><div class="actions"><button title="Editar movimentação" data-action="edit-stock-movement" data-id="${attr(movement.id)}">${icon('edit')}</button><button title="Excluir movimentação" data-action="delete-stock-movement" data-id="${attr(movement.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="9"><div class="empty">Nenhuma movimentação encontrada.</div></td></tr>'}</tbody></table></div></section>`;
  }
  renderCatalog=function(){
    const tab=ACTIVE_TAB.catalog||'services',mode=getViewMode('catalog'),archived=[...data().products,...data().services,...data().supplies].filter(item=>item.status==='Inativo').length;
    return `<div class="toolbar unified-toolbar-v256 catalog-toolbar-v256"><div class="toolbar-left"><div class="tabs"><button class="${tab==='services'?'active':''}" data-action="catalog-tab" data-tab="services">Serviços</button><button class="${tab==='products'?'active':''}" data-action="catalog-tab" data-tab="products">Produtos</button><button class="${tab==='supplies'?'active':''}" data-action="catalog-tab" data-tab="supplies">Insumos</button><button class="${tab==='movements'?'active':''}" data-action="catalog-tab" data-tab="movements">Movimentações</button></div>${iconButton('toggle-archived-catalog',SHOW_ARCHIVED.catalog?'Ver ativos':`Inativos (${archived})`,SHOW_ARCHIVED.catalog?'check':'power')}</div><div class="toolbar-right">${viewModeSwitcher('catalog',mode)}${tab==='movements'?`<button class="btn primary control-main-v256" data-action="new-stock-movement">${icon('plus')} Movimentar estoque</button>`:`<button class="btn primary control-main-v256" data-action="new-catalog-item">${icon('plus')} Novo cadastro</button>`}</div></div>${renderCatalogTable256(tab)}`;
  };

  renderDocuments=function(){
    const mode=getViewMode('documents'),official=data().serviceOrders.flatMap(order=>{const pdfs=(order.pdfs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))),latest=pdfs.find(file=>file.official!==false)||pdfs[0];return latest?[{...latest,order}]:[];}).filter(row=>matches(row.fileName,row.order.id,row.order.clientName)).filter(row=>matchesPeriod256(row.createdAt,'documents'));
    return `<div class="toolbar unified-toolbar-v256 documents-toolbar-v256"><div class="toolbar-left"><h2>PDFs das OSVs</h2>${periodControls256('documents')}</div><div class="toolbar-right">${viewModeSwitcher('documents',mode)}<span class="badge blue">${official.length} PDFs oficiais</span></div></div><section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table documents-table-v256"><thead><tr><th>OSV</th><th>Cliente</th><th>Data/hora</th><th>Arquivo</th><th>Ações</th></tr></thead><tbody>${official.map(row=>`<tr class="clickable-row-v256" data-row-action="open-document" data-order="${attr(row.order.id)}" data-media="${attr(row.id)}"><td><button class="code-link" data-action="view-order" data-id="${attr(row.order.id)}">${esc(row.order.id)}</button></td><td><button class="text-link" data-action="view-client" data-id="${attr(row.order.clientId)}">${esc(row.order.clientName||'Cliente')}</button></td><td>${formatDateTime(row.createdAt)}</td><td><strong>${esc(row.fileName||'Documento.pdf')}</strong></td><td><div class="actions"><button title="Abrir PDF" data-action="open-order-file" data-order="${attr(row.order.id)}" data-media="${attr(row.id)}">${icon('eye')}</button><button title="Enviar ao cliente" data-action="share-order" data-id="${attr(row.order.id)}">${icon('phone')}</button><button title="Abrir cliente" data-action="view-client" data-id="${attr(row.order.clientId)}">${icon('clients')}</button><button title="Abrir OSV" data-action="view-order" data-id="${attr(row.order.id)}">${icon('orders')}</button></div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Nenhum PDF oficial gerado.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function updatePrivacyButtons256(){
    const hidden=!!settings().dashboardPrivacy;
    document.querySelectorAll('[data-action="toggle-privacy"]').forEach(button=>{button.innerHTML=icon(hidden?'eye-off':'eye');button.title=hidden?'Mostrar valores':'Ocultar valores';button.setAttribute('aria-label',button.title);button.setAttribute('aria-pressed',String(hidden));});
  }
  function maskPrivacy256(root=document){
    const hidden=!!settings().dashboardPrivacy;updatePrivacyButtons256();if(!root)return;
    root.classList?.toggle('privacy-values-hidden-v256',hidden);
    root.querySelectorAll?.('input[data-money="true"]').forEach(input=>{
      if(hidden){
        if(!input.dataset.privacyOriginalTypeV256)input.dataset.privacyOriginalTypeV256=input.type||'text';
        if(['text','search','tel','url'].includes(input.type))input.type='password';
        input.setAttribute('data-privacy-masked-v256','true');
      }else{
        if(input.dataset.privacyOriginalTypeV256)input.type=input.dataset.privacyOriginalTypeV256;
        delete input.dataset.privacyOriginalTypeV256;input.removeAttribute('data-privacy-masked-v256');
      }
    });
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode(node){const parent=node.parentElement;if(!parent||parent.closest('script,style,textarea,input,select,option'))return NodeFilter.FILTER_REJECT;return NodeFilter.FILTER_ACCEPT;}}),nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    for(const node of nodes){
      if(hidden){
        const current=String(node.nodeValue||'');
        if(/R\$\s*-?[\d.]+,\d{2}|\b\d{1,3}(?:[.,]\d+)?%/.test(current)){
          PRIVACY_TEXT_ORIGINALS.set(node,current);
          node.nodeValue=current.replace(/R\$\s*-?[\d.]+,\d{2}/g,'••••').replace(/\b\d{1,3}(?:[.,]\d+)?%/g,'••••');
        }
      }else if(PRIVACY_TEXT_ORIGINALS.has(node)){
        node.nodeValue=PRIVACY_TEXT_ORIGINALS.get(node);PRIVACY_TEXT_ORIGINALS.delete(node);
      }
    }
    root.querySelectorAll?.('[title]').forEach(element=>{
      if(hidden){
        const current=String(element.title||'');
        if(/R\$\s*-?[\d.]+,\d{2}/.test(current)){
          PRIVACY_TITLE_ORIGINALS.set(element,current);element.title=current.replace(/R\$\s*-?[\d.]+,\d{2}/g,'••••');
        }
      }else if(PRIVACY_TITLE_ORIGINALS.has(element)){
        element.title=PRIVACY_TITLE_ORIGINALS.get(element);PRIVACY_TITLE_ORIGINALS.delete(element);
      }
    });
  }

  function dashboardLayoutStore256(){
    const s=settings(),band=screenBand256();s.dashboardLayouts=s.dashboardLayouts||{};s.dashboardLayouts[band]=s.dashboardLayouts[band]||{};return s.dashboardLayouts[band];
  }
  function decorateDashboard256(){
    ensureDefaults256();
    const grid=document.querySelector('.dashboard-widget-grid');if(!grid)return;
    const store=dashboardLayoutStore256();grid.classList.add('dashboard-masonry-v256');
    const hint=document.querySelector('.dashboard-toolbar-v255 .muted');
    if(hint)hint.textContent='Arraste os módulos e use o canto inferior direito para redimensionar.';
    [...grid.querySelectorAll('.dashboard-widget')].forEach((widget,index)=>{
      const id=widget.dataset.widgetId,saved=store[id]||{},computedSpan=Number(saved.span)||Number(String(widget.style.getPropertyValue('--widget-span')).trim())||(id==='revenue'?12:6);
      const defaultRows=id==='revenue'?26:14,rows=Number(saved.rows)||Math.max(8,Math.round(parseFloat(saved.height)||0)/22)||defaultRows;
      widget.style.setProperty('--widget-span-v256',Math.max(3,Math.min(12,computedSpan)));
      widget.style.setProperty('--widget-rows-v256',Math.max(8,Math.min(60,Math.round(rows))));
      widget.style.setProperty('--widget-order-v256',Number.isFinite(saved.order)?saved.order:index);
      if(grid.classList.contains('layout-editing')){
        widget.querySelector('.widget-edit-controls')?.remove();
        if(!widget.querySelector('.widget-resize-handle-v256'))widget.insertAdjacentHTML('beforeend','<button type="button" class="widget-resize-handle-v256" title="Arraste para redimensionar" aria-label="Arraste para redimensionar"></button>');
      }else widget.querySelector('.widget-resize-handle-v256')?.remove();
    });
  }

  const MODAL_GRID_COLUMNS=12;
  const MODAL_GRID_ROW=22;
  const MODAL_GRID_GAP=6;

  function modalLayoutKey256(modal){
    const form=modal?.querySelector('form[data-form]');
    if(form){
      const kind=String(form.dataset.form||'').trim();
      if(!kind||['app-prompt','login','pin'].includes(kind))return '';
      return `form:${kind}`;
    }
    const titles=[...modal?.querySelectorAll('.detail-hero h2,.modal-body h2')||[]].map(x=>x.textContent.trim()).join(' ');
    if(/OSV-|ordem de serviço/i.test(titles))return 'detail:order';
    if(modal?.querySelector('[data-client-price-history],.definition-list'))return 'detail:client';
    return '';
  }
  function layoutStore256(key){
    const s=settings(),band=screenBand256();s.unifiedLayoutsV256=s.unifiedLayoutsV256||{};s.unifiedLayoutsV256[band]=s.unifiedLayoutsV256[band]||{};s.unifiedLayoutsV256[band][key]=s.unifiedLayoutsV256[band][key]||{};return s.unifiedLayoutsV256[band][key];
  }
  function itemId256(item,index){return item.dataset.layoutItemV256||item.dataset.osvComponent||item.dataset.clientComponent||item.dataset.layoutComponent||item.querySelector('[name]')?.name||item.querySelector('h3')?.textContent.trim()||`item-${index}`;}
  function modalRectOverlaps256(a,b){return a.x<b.x+b.span&&a.x+a.span>b.x&&a.y<b.y+b.rows&&a.y+a.rows>b.y;}
  function modalCanPlace256(rect,placed,ignoreId=''){
    if(rect.x<1||rect.y<1||rect.span<1||rect.rows<1||rect.x+rect.span-1>MODAL_GRID_COLUMNS)return false;
    return !placed.some(other=>other.id!==ignoreId&&modalRectOverlaps256(rect,other));
  }
  function modalFirstFree256(span,rows,placed){
    for(let y=1;y<=500;y++)for(let x=1;x<=MODAL_GRID_COLUMNS-span+1;x++)if(modalCanPlace256({x,y,span,rows},placed))return {x,y};
    return {x:1,y:Math.max(1,...placed.map(item=>item.y+item.rows))};
  }
  function modalDefaultSpan256(item,key,grid){
    if(screenBand256()==='mobile')return 12;
    const componentId=String(item.dataset.osvComponent||item.dataset.layoutItemV256||item.dataset.layoutComponent||'');
    // Itens, pagamentos, fotos e ações finais foram concebidos como módulos de largura total.
    // A correção vale apenas para o padrão/restauração; depois o usuário ainda pode redimensionar
    // normalmente no Editar Layout e o tamanho salvo continua sendo respeitado.
    if(key==='form:order'&&['itemsField','paymentsField','photosField','actionButtons'].includes(componentId))return 12;
    if(item.classList.contains('full')||grid.classList.contains('one-column'))return 12;
    if(grid.classList.contains('three'))return 4;
    if(item.matches('section.card')){
      const title=item.querySelector('h3')?.textContent||'';
      if(key==='detail:order'&&/^(Equipamento|Itens|Fotos)/i.test(title))return 7;
      if(key==='detail:order')return 5;
      return 6;
    }
    return 6;
  }
  function modalDefaultRows256(item){
    const id=String(item.dataset.osvComponent||item.dataset.clientComponent||item.dataset.layoutComponent||item.dataset.layoutItemV256||'');
    // Campos comuns começam baixos; o usuário continua podendo aumentar pelo canto.
    if(id==='clientId')return 4;
    if(['openedAt','completedAt','status','equipmentType','brandModel','serialNumber','accessPassword','accessories'].includes(id))return 4;
    if(['reportedIssue','technicalReport','clientNotes','internalNotes'].includes(id))return 8;
    if(id==='itemsField')return 22;
    if(['paymentsField','photosField'].includes(id))return 16;
    const isField=item.matches('.field'),isCheck=item.matches('.check-field'),hasTextarea=!!item.querySelector('textarea');
    if(isCheck)return 4;
    if(isField)return hasTextarea?8:4;
    if(item.matches('.form-section,section.card')){
      if(item.querySelector('table,[data-photo-stage],[data-order-items-editor],#order-items-editor,#order-payments-editor'))return 18;
      return 12;
    }
    return 8;
  }
  function modalItemRect256(item,index=0){
    const id=item.dataset.layoutItemV256||`item-${index}`;
    const span=Math.max(2,Math.min(12,Number(item.style.getPropertyValue('--layout-span-v256'))||6));
    const rows=Math.max(2,Math.min(60,Number(item.style.getPropertyValue('--layout-rows-v256'))||modalDefaultRows256(item)));
    const x=Math.max(1,Math.min(13-span,Number(item.style.getPropertyValue('--layout-x-v260'))||1));
    const y=Math.max(1,Number(item.style.getPropertyValue('--layout-y-v260'))||1);
    const order=Number(item.style.getPropertyValue('--layout-order-v256'));
    return {id,x,y,span,rows,order:Number.isFinite(order)?order:index};
  }
  function applyModalRect256(item,rect){
    item.style.setProperty('--layout-x-v260',rect.x);
    item.style.setProperty('--layout-y-v260',rect.y);
    item.style.setProperty('--layout-span-v256',rect.span);
    item.style.setProperty('--layout-rows-v256',rect.rows);
    item.style.setProperty('--layout-order-v256',Number.isFinite(Number(rect.order))?Number(rect.order):0);
    item.style.order=Number.isFinite(Number(rect.order))?Number(rect.order):0;
    item.classList.add('has-custom-layout-v256');
  }
  function updateModalGridHeight256(grid){
    const items=[...grid.children].filter(item=>item.dataset.layoutItemV256);
    const last=Math.max(1,...items.map((item,index)=>{const rect=modalItemRect256(item,index);return rect.y+rect.rows-1;}));
    const editing=!!grid.closest('.layout-editing-v256');
    grid.style.setProperty('--layout-grid-rows-v260',Math.max(last+(editing?7:1),editing?42:1));
  }
  function refreshModalGrid256(modal=document.querySelector('#modal-root .modal'),repair=false){
    if(!modal)return;
    modal.querySelectorAll('[data-layout-grid-v256]').forEach(grid=>{
      const items=[...grid.children].filter(item=>item.dataset.layoutItemV256);
      const placed=[];
      items.map((item,index)=>({item,index,rect:modalItemRect256(item,index)}))
        .sort((a,b)=>(a.rect.order-b.rect.order)||(a.index-b.index))
        .forEach(({item,index,rect})=>{
          let normalized={...rect,span:Math.max(2,Math.min(12,rect.span)),rows:Math.max(2,Math.min(60,rect.rows))};
          normalized.x=Math.max(1,Math.min(13-normalized.span,normalized.x));normalized.y=Math.max(1,normalized.y);
          if(repair&&!modalCanPlace256(normalized,placed,normalized.id))normalized={...normalized,...modalFirstFree256(normalized.span,normalized.rows,placed)};
          applyModalRect256(item,{...normalized,order:Number.isFinite(normalized.order)?normalized.order:index});
          placed.push(normalized);
        });
      updateModalGridHeight256(grid);
    });
  }
  function prepareDetailGrid256(modal,key){
    const body=modal.querySelector('.modal-body');if(!body)return [];
    if(key==='detail:order'){
      modal.classList.add('order-detail-modal-v256','detail-modal-v256');
      const legacy=body.querySelector('.detail-grid');if(legacy&&!body.querySelector('.detail-grid-v256')){
        const sections=[...legacy.querySelectorAll(':scope > div > section')];
        const orderRank=title=>/equipamento/i.test(title)?1:/itens/i.test(title)?2:/fotos/i.test(title)?3:/financeiro/i.test(title)?4:/pdf/i.test(title)?5:/movimenta/i.test(title)?6:/anexos/i.test(title)?7:99;
        sections.sort((a,b)=>orderRank(a.querySelector('h3')?.textContent||'')-orderRank(b.querySelector('h3')?.textContent||''));
        const grid=document.createElement('div');grid.className='detail-grid-v256';legacy.replaceWith(grid);sections.forEach(section=>grid.appendChild(section));
      }
    }else if(key==='detail:client'){
      modal.classList.add('client-detail-modal-v256','detail-modal-v256');
      const grid=[...body.querySelectorAll('.grid.two')].find(candidate=>candidate.querySelector(':scope > section.card'));if(grid)grid.classList.add('detail-grid-v256');
    }
    return [...body.querySelectorAll('.detail-grid-v256')];
  }
  function paymentDefaultRect256(id,index=0,item=null){
    const form=item?.closest?.('form[data-form="payment"]');
    const isExpense=norm(form?.elements?.type?.value)==='despesa';
    const notesY=isExpense?25:17;
    const map={
      paymentId:{x:1,y:1,span:6,rows:4},
      type:{x:7,y:1,span:6,rows:4},
      orderId:{x:1,y:5,span:12,rows:4},
      value:{x:1,y:9,span:4,rows:4},
      paymentMethod:{x:5,y:9,span:4,rows:4},
      paymentDate:{x:9,y:9,span:4,rows:4},
      planned:{x:1,y:13,span:2,rows:4},
      dueDate:{x:1,y:13,span:4,rows:4},
      fee:{x:5,y:13,span:4,rows:4},
      settlementState:{x:9,y:13,span:4,rows:4},
      expenseName:{x:1,y:17,span:6,rows:4},
      localPurchase:{x:7,y:17,span:6,rows:4},
      expenseCategory:{x:1,y:21,span:6,rows:4},
      notes:{x:1,y:notesY,span:12,rows:8},
      cancelled:{x:1,y:notesY+8,span:12,rows:4}
    };
    const rect=map[id];
    return rect?{...rect,order:rect.y*100+rect.x}:null;
  }
  function prepareModalItems256(modal,key,{applySaved=true,forceDefaults=false}={}){
    const store=layoutStore256(key),grids=[];
    const form=modal.querySelector('form[data-form]');
    if(form){
      form.dataset.layoutKeyV256=key;
      const surfaces=[...form.querySelectorAll('[data-layout-surface]')];
      let candidates=surfaces.length
        ? [...surfaces,...form.querySelectorAll(':scope > .form-grid')].filter((grid,index,list)=>(grid.matches('[data-layout-surface]')||!grid.closest('[data-layout-surface]'))&&list.indexOf(grid)===index)
        : [...form.querySelectorAll('.form-grid')];
      if(!candidates.length){
        const loose=[...form.children].filter(item=>item.matches('.field,.check-field,section.card,.form-section,[data-layout-component]'));
        if(loose.length){
          const fallback=document.createElement('div');fallback.className='form-grid unified-form-grid-v260';
          loose[0].before(fallback);loose.forEach(item=>fallback.appendChild(item));candidates=[fallback];
        }
      }
      candidates.forEach((grid,index)=>{
        const surfaceName=String(grid.dataset.layoutSurface||'').trim();
        grid.dataset.layoutGridV256=surfaceName?`surface-${surfaceName}`:`grid-${index}`;
        if(!grids.includes(grid))grids.push(grid);
      });
    }else prepareDetailGrid256(modal,key).forEach((grid,index)=>{grid.dataset.layoutGridV256=`detail-${index}`;grids.push(grid);});
    grids.forEach(grid=>{
      const gridKey=grid.dataset.layoutGridV256,gridStore=store[gridKey]||{};
      const items=[...grid.children].filter(item=>item.matches('.field,.check-field,section.card,.form-section,[data-osv-component],[data-client-component],[data-layout-component]'));
      grid.classList.add('layout-grid-v256');
      const placed=[];
      items.map((item,index)=>({item,index,id:itemId256(item,index)}))
        .sort((a,b)=>{
          const sa=gridStore[a.id],sb=gridStore[b.id];
          return ((Number(sa?.order)-Number(sb?.order))||0)||(a.index-b.index);
        })
        .forEach(({item,index,id})=>{
          item.dataset.layoutItemV256=id;
          const saved=!forceDefaults&&applySaved?gridStore[id]:null;
          const preserveCurrent=!applySaved&&!forceDefaults&&!!item.style.getPropertyValue('--layout-x-v260');
          const current=preserveCurrent?modalItemRect256(item,index):null;
          const paymentDefault=key==='form:payment'&&!saved&&!current?paymentDefaultRect256(id,index,item):null;
          const span=Math.max(2,Math.min(12,Number(saved?.span)||Number(current?.span)||Number(paymentDefault?.span)||modalDefaultSpan256(item,key,grid)));
          const rows=Math.max(2,Math.min(60,Number(saved?.rows)||Number(current?.rows)||Number(paymentDefault?.rows)||modalDefaultRows256(item)));
          let x=Number(saved?.x)||Number(current?.x)||Number(paymentDefault?.x)||0,y=Number(saved?.y)||Number(current?.y)||Number(paymentDefault?.y)||0;
          const proposed={id,x,y,span,rows,order:Number.isFinite(Number(saved?.order))?Number(saved.order):Number.isFinite(Number(current?.order))?Number(current.order):Number.isFinite(Number(paymentDefault?.order))?Number(paymentDefault.order):index};
          if(!x||!y||!modalCanPlace256(proposed,placed,id))({x,y}=modalFirstFree256(span,rows,placed));
          const rect={...proposed,x,y};applyModalRect256(item,rect);placed.push(rect);
        });
      if(isModularOrderGrid256(grid))normalizeModularOrder256(grid);
      updateModalGridHeight256(grid);
    });
    return grids;
  }
  function captureModalLayout256(modal,key){
    const result={};
    prepareModalItems256(modal,key,{applySaved:false}).forEach(grid=>{
      result[grid.dataset.layoutGridV256]={};
      [...grid.children].filter(item=>item.dataset.layoutItemV256).forEach((item,index)=>{
        const rect=modalItemRect256(item,index);
        result[grid.dataset.layoutGridV256][item.dataset.layoutItemV256]={order:rect.y*100+rect.x,x:rect.x,y:rect.y,span:rect.span,rows:rect.rows};
      });
    });
    return result;
  }
  function applyModalLayout256(modal){
    const key=modalLayoutKey256(modal);if(!key)return;
    modal.dataset.layoutKeyV256=key;prepareModalItems256(modal,key,{applySaved:true});
    const header=modal.querySelector('.modal-header');if(!header)return;
    header.querySelectorAll('[data-action="toggle-form-layout"],[data-action="open-osv-layout-editor"]').forEach(button=>button.remove());
    if(!header.querySelector('[data-action="toggle-layout-v256"]'))header.querySelector('h2')?.insertAdjacentHTML('afterend',`<button type="button" class="btn ghost compact modal-layout-button-v256" data-action="toggle-layout-v256">${icon('edit',16)} Editar layout</button>`);
    requestAnimationFrame(()=>refreshModalGrid256(modal,true));
  }
  function setModalEditing256(editing){
    const modal=document.querySelector('#modal-root .modal'),key=modal?.dataset.layoutKeyV256||modalLayoutKey256(modal);if(!modal||!key)return;
    MODAL_LAYOUT.editing=editing;MODAL_LAYOUT.key=key;modal.classList.toggle('layout-editing-v256',editing);
    const button=modal.querySelector('[data-action="toggle-layout-v256"]');if(button)button.innerHTML=editing?`${icon('save',16)} Salvar layout`:`${icon('edit',16)} Editar layout`;
    modal.querySelector('.layout-toolbar-v256')?.remove();
    if(editing){
      if(!MODAL_LAYOUT.snapshot)MODAL_LAYOUT.snapshot=captureModalLayout256(modal,key);
      const layoutHelp=modal.querySelector('form[data-form="order"]')?'Layout modular: arraste um módulo para cima ou para baixo; os demais se reorganizam automaticamente.':'Grade livre: arraste para qualquer espaço vazio e redimensione pelo canto.';button?.insertAdjacentHTML('afterend',`<div class="layout-toolbar-v256"><button type="button" class="btn secondary compact" data-action="cancel-layout-v256">Cancelar</button><button type="button" class="btn ghost compact" data-action="reset-layout-v256">Restaurar padrão</button><small>${layoutHelp}</small></div>`);
      modal.querySelectorAll('[data-layout-item-v256]').forEach(item=>{item.draggable=screenBand256()!=='mobile';if(!item.querySelector(':scope > .layout-resize-handle-v256'))item.insertAdjacentHTML('beforeend','<button type="button" class="layout-resize-handle-v256" title="Arraste para redimensionar" aria-label="Arraste para redimensionar"></button>');});
    }else modal.querySelectorAll('[data-layout-item-v256]').forEach(item=>{item.draggable=false;item.querySelector(':scope > .layout-resize-handle-v256')?.remove();});
    refreshModalGrid256(modal,false);
  }
  async function saveModalLayout256(){
    const modal=document.querySelector('#modal-root .modal'),key=MODAL_LAYOUT.key||modal?.dataset.layoutKeyV256;if(!modal||!key)return false;
    const target=layoutStore256(key),previous=clone(target),captured=captureModalLayout256(modal,key);
    Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,captured);
    try{
      await persist('Layout visual atualizado',`${key} · ${screenBand256()}`,{media:false});
      MODAL_LAYOUT.snapshot=null;setModalEditing256(false);toast('Layout salvo no Google Drive.','ok');return true;
    }catch(error){
      Object.keys(target).forEach(k=>delete target[k]);Object.assign(target,previous);
      console.warn('[V260_LAYOUT_SAVE]',error);setModalEditing256(true);toast(error.message||'Não foi possível salvar o layout. Tente novamente.','error');return false;
    }
  }
  function restoreSnapshot256(snapshot){
    const modal=document.querySelector('#modal-root .modal');if(!modal||!snapshot)return;
    modal.querySelectorAll('[data-layout-grid-v256]').forEach(grid=>{
      const saved=snapshot[grid.dataset.layoutGridV256]||{};
      [...grid.children].filter(item=>item.dataset.layoutItemV256).forEach((item,index)=>{
        const layout=saved[item.dataset.layoutItemV256];if(!layout)return;
        applyModalRect256(item,{id:item.dataset.layoutItemV256,order:Number(layout.order)||index,x:Number(layout.x)||1,y:Number(layout.y)||1,span:Number(layout.span)||6,rows:Number(layout.rows)||modalDefaultRows256(item)});
      });
      updateModalGridHeight256(grid);
    });
  }
  async function resetModalLayout256(){
    const modal=document.querySelector('#modal-root .modal'),key=modal?.dataset.layoutKeyV256;if(!modal||!key)return;
    const store=layoutStore256(key),previous=clone(store);Object.keys(store).forEach(k=>delete store[k]);
    modal.querySelectorAll('[data-layout-item-v256]').forEach(item=>{['--layout-x-v260','--layout-y-v260','--layout-span-v256','--layout-rows-v256','--layout-order-v256'].forEach(name=>item.style.removeProperty(name));item.classList.remove('has-custom-layout-v256');});
    prepareModalItems256(modal,key,{applySaved:false,forceDefaults:true});MODAL_LAYOUT.snapshot=captureModalLayout256(modal,key);
    try{await persist('Layout visual restaurado',`${key} · ${screenBand256()}`,{media:false});setModalEditing256(false);toast('Layout restaurado ao padrão.','ok');}
    catch(error){Object.keys(store).forEach(k=>delete store[k]);Object.assign(store,previous);console.warn('[V260_LAYOUT_RESET]',error);toast(error.message||'Não foi possível restaurar o layout.','error');}
  }
  function decorateModal256(){
    const modal=document.querySelector('#modal-root .modal');if(!modal)return;applyModalLayout256(modal);maskPrivacy256(modal);
    if(modal.classList.contains('layout-editing-v256')){
      modal.querySelectorAll('[data-layout-item-v256]').forEach(item=>{
        item.draggable=screenBand256()!=='mobile';
        if(!item.querySelector(':scope > .layout-resize-handle-v256'))item.insertAdjacentHTML('beforeend','<button type="button" class="layout-resize-handle-v256" title="Arraste para redimensionar" aria-label="Arraste para redimensionar"></button>');
      });
    }
    if(modal.dataset.layoutKeyV256==='detail:order'){
      modal.querySelectorAll('.actions button,.list-row>.icon-btn').forEach(button=>button.classList.add('detail-action-v256'));
      const close=modal.querySelector('.modal-close');if(close)close.title='Fechar';
    }
  }

  function resetModalLayoutSession256(){MODAL_LAYOUT.editing=false;MODAL_LAYOUT.snapshot=null;MODAL_LAYOUT.key='';}
  const openModalBase256=openModal;
  openModal=function(...args){
    resetModalLayoutSession256();
    const result=openModalBase256.apply(this,args);
    // Decora imediatamente para evitar a primeira abertura sem classe/botão de layout.
    decorateModal256();
    requestAnimationFrame(decorateModal256);
    return result;
  };
  const openOrderDetailBase256=openOrderDetail;
  openOrderDetail=function(...args){
    const result=openOrderDetailBase256.apply(this,args);
    decorateModal256();
    requestAnimationFrame(decorateModal256);
    return result;
  };
  const openClientDetailBase256=openClientDetail;
  openClientDetail=function(...args){
    const result=openClientDetailBase256.apply(this,args);
    decorateModal256();
    requestAnimationFrame(decorateModal256);
    return result;
  };

  function decorateView256(){
    decorateDashboard256();
    document.querySelectorAll('[data-row-action]').forEach(row=>{
      if(!row.hasAttribute('tabindex'))row.tabIndex=0;
      if(!row.hasAttribute('role'))row.setAttribute('role','button');
    });
    maskPrivacy256(document.getElementById('root'));
  }
  const renderViewBase256=renderView;
  renderView=function(...args){const result=renderViewBase256.apply(this,args);requestAnimationFrame(decorateView256);return result;};

  const handleActionBase256=handleAction;
  handleAction=async function(button,...rest){
    const action=button?.dataset?.action||'';
    if(action==='toggle-privacy'){const result=await handleActionBase256.call(this,button,...rest);requestAnimationFrame(()=>{maskPrivacy256(document.getElementById('root'));maskPrivacy256(document.querySelector('#modal-root .modal'));});return result;}
    if(action==='clear-period-v256'){const state=periodState256(button.dataset.section);state.month='';state.fromDay='';state.toDay='';renderView();return;}
    if(action==='toggle-layout-v256'){if(MODAL_LAYOUT.editing)await saveModalLayout256();else{MODAL_LAYOUT.snapshot=captureModalLayout256(document.querySelector('#modal-root .modal'),document.querySelector('#modal-root .modal')?.dataset.layoutKeyV256);setModalEditing256(true);}return;}
    if(action==='cancel-layout-v256'){restoreSnapshot256(MODAL_LAYOUT.snapshot);MODAL_LAYOUT.snapshot=null;setModalEditing256(false);return;}
    if(action==='reset-layout-v256'){await resetModalLayout256();return;}
    return handleActionBase256.call(this,button,...rest);
  };

  document.addEventListener('change',event=>{
    const target=event.target;
    if(target.matches('[data-period-month-v256]')){periodState256(target.dataset.periodMonthV256).month=target.value;renderView();return;}
    if(target.matches('[data-period-from-v256]')){periodState256(target.dataset.periodFromV256).fromDay=String(clampDay(target.value)||'');renderView();return;}
    if(target.matches('[data-period-to-v256]')){periodState256(target.dataset.periodToV256).toDay=String(clampDay(target.value)||'');renderView();return;}
    if(target.matches('[data-order-status-v256]')){settings().orderStatusFilterV256=target.value;renderView();return;}
  },true);

  function activateRow256(row){
    if(!row)return;
    const action=row.dataset.rowAction,id=row.dataset.id;
    if(action==='view-order')openOrderDetail(id);
    else if(action==='view-client')openClientDetail(id);
    else if(action==='edit-payment')openPaymentForm(id);
    else if(action==='edit-service')openServiceForm(id);
    else if(action==='edit-product')openProductForm(id);
    else if(action==='edit-supply')openSupplyForm(id);
    else if(action==='edit-stock-movement')openStockMovementForm(id);
    else if(action==='open-document')openPdfMedia(row.dataset.order,row.dataset.media).catch(error=>toast(error.message,'error'));
  }
  document.addEventListener('click',event=>{
    const row=event.target.closest?.('[data-row-action]'),interactive=event.target.closest?.(INTERACTIVE_SELECTOR);if(!row||(interactive&&interactive!==row))return;
    event.preventDefault();activateRow256(row);
  },true);
  document.addEventListener('keydown',event=>{
    if(!['Enter',' '].includes(event.key))return;
    const row=event.target.closest?.('[data-row-action]'),interactive=event.target.closest?.(INTERACTIVE_SELECTOR);if(!row||(interactive&&interactive!==row))return;
    event.preventDefault();activateRow256(row);
  },true);

  function modalGridMetrics256(grid){
    const style=getComputedStyle(grid),rect=grid.getBoundingClientRect();
    const columnGap=parseFloat(style.columnGap)||12,rowGap=parseFloat(style.rowGap)||MODAL_GRID_GAP,columns=screenBand256()==='mobile'?1:MODAL_GRID_COLUMNS;
    const cell=(grid.clientWidth-columnGap*(columns-1))/columns;
    return {rect,columnGap,rowGap,columns,cell,stepX:cell+columnGap,stepY:MODAL_GRID_ROW+rowGap};
  }
  function modalDropRect256(event,item,grid){
    const current=modalItemRect256(item),metrics=modalGridMetrics256(grid),span=metrics.columns===1?12:current.span;
    const rawX=metrics.columns===1?1:Math.floor((event.clientX-metrics.rect.left)/metrics.stepX)+1;
    const rawY=Math.floor((event.clientY-metrics.rect.top)/metrics.stepY)+1;
    return {...current,span,x:Math.max(1,Math.min(MODAL_GRID_COLUMNS-span+1,rawX)),y:Math.max(1,rawY),metrics};
  }
  function modalGridRects256(grid){return [...grid.children].filter(item=>item.dataset.layoutItemV256).map((item,index)=>modalItemRect256(item,index));}
  function showModalDropPreview256(grid,rect,valid){
    let preview=grid.querySelector(':scope > .layout-drop-preview-v260');
    if(!preview){preview=document.createElement('div');preview.className='layout-drop-preview-v260';grid.appendChild(preview);}
    preview.classList.toggle('is-invalid',!valid);
    preview.style.setProperty('--layout-preview-x-v260',rect.x);preview.style.setProperty('--layout-preview-y-v260',rect.y);preview.style.setProperty('--layout-preview-span-v260',rect.span);preview.style.setProperty('--layout-preview-rows-v260',rect.rows);
  }
  function removeModalDropPreview256(){document.querySelectorAll('.layout-drop-preview-v260').forEach(node=>node.remove());}
  function isModularOrderGrid256(grid){return !!grid?.closest('form[data-form="order"]')&&grid.matches('[data-layout-surface="order"],.osv-custom-layout-surface-v221');}
  function clearModularDropTarget256(){document.querySelectorAll('.modular-drop-target-v275').forEach(node=>node.classList.remove('modular-drop-target-v275','modular-drop-after-v275'));}
  function normalizeModularOrder256(grid){
    if(!isModularOrderGrid256(grid))return;
    const items=[...grid.children].filter(item=>item.dataset.layoutItemV256);
    items.forEach((item,index)=>{
      item.style.setProperty('--layout-order-v256',index);
      item.style.setProperty('--layout-y-v260',index+1);
      item.style.order=index;
    });
    grid.style.setProperty('--layout-grid-rows-v260',Math.max(1,items.length));
  }
  function beginResize256(event,item,grid,kind){
    event.preventDefault();event.stopPropagation();const rect=item.getBoundingClientRect(),gridRect=grid.getBoundingClientRect(),columns=kind==='modal'?(screenBand256()==='mobile'?1:MODAL_GRID_COLUMNS):(screenBand256()==='mobile'?1:12),gap=parseFloat(getComputedStyle(grid).columnGap)||12,cell=(gridRect.width-gap*(columns-1))/columns,rowUnit=MODAL_GRID_ROW;
    RESIZE_SESSION={pointerId:event.pointerId,item,grid,kind,startX:event.clientX,startY:event.clientY,startWidth:rect.width,startHeight:rect.height,cell,gap,columns,rowUnit};
    item.classList.add('is-resizing-v256');event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveResize256(event){
    const session=RESIZE_SESSION;if(!session||session.pointerId!==event.pointerId)return;const width=Math.max(session.cell,session.startWidth+(event.clientX-session.startX)),height=Math.max(session.rowUnit*2,session.startHeight+(event.clientY-session.startY));
    if(session.kind==='dashboard'){
      const span=session.columns===1?12:Math.max(3,Math.min(12,Math.round((width+session.gap)/(session.cell+session.gap))));session.item.style.setProperty('--widget-span-v256',span);session.item.style.setProperty('--widget-rows-v256',Math.max(8,Math.min(60,Math.round(height/session.rowUnit))));
    }else{
      const current=modalItemRect256(session.item),span=session.columns===1?12:Math.max(2,Math.min(12,Math.round((width+session.gap)/(session.cell+session.gap)))),rows=Math.max(2,Math.min(60,Math.round(height/session.rowUnit)));
      const candidate={...current,span,x:Math.min(current.x,MODAL_GRID_COLUMNS-span+1),rows};
      if(modalCanPlace256(candidate,modalGridRects256(session.grid),candidate.id)){applyModalRect256(session.item,candidate);updateModalGridHeight256(session.grid);}
    }
  }
  async function endResize256(event){
    const session=RESIZE_SESSION;if(!session||session.pointerId!==event.pointerId)return;session.item.classList.remove('is-resizing-v256');RESIZE_SESSION=null;
    if(session.kind==='dashboard'){
      const store=dashboardLayoutStore256(),id=session.item.dataset.widgetId,existing=store[id]||{};store[id]={...existing,span:Number(session.item.style.getPropertyValue('--widget-span-v256'))||6,rows:Number(session.item.style.getPropertyValue('--widget-rows-v256'))||14,order:Number(session.item.style.getPropertyValue('--widget-order-v256'))||0};
    }else updateModalGridHeight256(session.grid);
  }
  document.addEventListener('pointerdown',event=>{
    const dashboardHandle=event.target.closest('.widget-resize-handle-v256');if(dashboardHandle){const item=dashboardHandle.closest('.dashboard-widget'),grid=item?.closest('.dashboard-widget-grid');if(item&&grid)beginResize256(event,item,grid,'dashboard');return;}
    const modalHandle=event.target.closest('.layout-resize-handle-v256');if(modalHandle){const item=modalHandle.closest('[data-layout-item-v256]'),grid=item?.closest('[data-layout-grid-v256]');if(item&&grid)beginResize256(event,item,grid,'modal');}
  },true);
  document.addEventListener('pointermove',moveResize256,true);
  document.addEventListener('pointerup',endResize256,true);
  document.addEventListener('pointercancel',endResize256,true);

  document.addEventListener('dragstart',event=>{
    if(!MODAL_LAYOUT.editing||screenBand256()==='mobile')return;const item=event.target.closest('[data-layout-item-v256]'),grid=item?.closest('[data-layout-grid-v256]');if(!item||!grid)return;
    MODAL_LAYOUT.drag={item,grid};item.classList.add('is-dragging-v260');event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',item.dataset.layoutItemV256||'layout-item');
  },true);
  document.addEventListener('dragover',event=>{
    const session=MODAL_LAYOUT.drag;if(!session)return;const grid=event.target.closest('[data-layout-grid-v256]');if(!grid||grid!==session.grid)return;
    event.preventDefault();
    if(isModularOrderGrid256(grid)){
      removeModalDropPreview256();clearModularDropTarget256();
      const target=event.target.closest('[data-layout-item-v256]');
      if(target&&target!==session.item){
        const rect=target.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2;
        target.classList.add('modular-drop-target-v275');target.classList.toggle('modular-drop-after-v275',after);
      }
      event.dataTransfer.dropEffect='move';return;
    }
    const rect=modalDropRect256(event,session.item,grid),valid=modalCanPlace256(rect,modalGridRects256(grid),rect.id);event.dataTransfer.dropEffect=valid?'move':'none';showModalDropPreview256(grid,rect,valid);
  },true);
  document.addEventListener('drop',event=>{
    const session=MODAL_LAYOUT.drag;if(!session)return;const grid=event.target.closest('[data-layout-grid-v256]');if(!grid||grid!==session.grid)return;
    event.preventDefault();
    if(isModularOrderGrid256(grid)){
      const target=event.target.closest('[data-layout-item-v256]');
      if(target&&target!==session.item){
        const rect=target.getBoundingClientRect(),after=event.clientY>rect.top+rect.height/2;
        grid.insertBefore(session.item,after?target.nextSibling:target);
      }else grid.appendChild(session.item);
      normalizeModularOrder256(grid);updateModalGridHeight256(grid);
    }else{
      const rect=modalDropRect256(event,session.item,grid),valid=modalCanPlace256(rect,modalGridRects256(grid),rect.id);
      if(valid){applyModalRect256(session.item,{...rect,order:rect.y*100+rect.x});updateModalGridHeight256(grid);}else toast('Esse espaço da grade já está ocupado.','warn');
    }
    session.item.classList.remove('is-dragging-v260');MODAL_LAYOUT.drag=null;removeModalDropPreview256();clearModularDropTarget256();
  },true);
  document.addEventListener('dragend',()=>{MODAL_LAYOUT.drag?.item?.classList.remove('is-dragging-v260');MODAL_LAYOUT.drag=null;removeModalDropPreview256();clearModularDropTarget256();},true);

  window.MarcoV256={version:VERSION,periodState:periodState256,matchesPeriod:matchesPeriod256,maskPrivacy:maskPrivacy256,ensureDefaults:ensureDefaults256,decorateView:decorateView256,decorateModal:decorateModal256,captureModalLayout:captureModalLayout256,refreshModalGrid:refreshModalGrid256,layoutStore:layoutStore256,canPlaceModal:modalCanPlace256};
  requestAnimationFrame(()=>{if(!LOCKED){renderShell();decorateView256();}});
})();

/* ===== js/v259-layout-livre.js ===== */
'use strict';

/* Marco Iris Tecnologia v2.6.6 — coordenadas livres e correções estruturais. */
(() => {
  const VERSION='2.6.6';
  const GRID_COLUMNS=12;
  const GRID_ROW=22;
  const GRID_ROW_GAP=4;
  const DASH_HISTORY=[];
  let DASH_DRAG=null;
  let DASH_SNAPSHOT=null;
  let MODAL_STABILIZE_FRAME=0;

  const clone259=value=>JSON.parse(JSON.stringify(value||{}));
  const clamp259=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||min));
  const band259=()=>window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';
  function settings259(){
    try{const d=data();d.settings=d.settings||{};return d.settings;}catch(_){return {};}
  }
  function dashboardStore259(){
    const settings=settings259(),band=band259();
    settings.dashboardLayouts=settings.dashboardLayouts||{};
    settings.dashboardLayouts[band]=settings.dashboardLayouts[band]||{};
    return settings.dashboardLayouts[band];
  }
  function numberVar259(element,name,fallback){
    const raw=Number(String(element?.style?.getPropertyValue(name)||'').trim());
    return Number.isFinite(raw)&&raw>0?raw:fallback;
  }
  function overlaps259(a,b){
    return a.x<a.x+a.span&&b.x<b.x+b.span&&a.x<b.x+b.span&&a.x+a.span>b.x&&a.y<b.y+b.rows&&a.y+a.rows>b.y;
  }
  function canPlace259(rect,placed,ignoreId=''){
    if(rect.x<1||rect.y<1||rect.span<1||rect.rows<1||rect.x+rect.span-1>GRID_COLUMNS)return false;
    return !placed.some(item=>item.id!==ignoreId&&overlaps259(rect,item));
  }
  function firstFree259(span,rows,placed){
    for(let y=1;y<=260;y++)for(let x=1;x<=GRID_COLUMNS-span+1;x++){
      const rect={x,y,span,rows};if(canPlace259(rect,placed))return {x,y};
    }
    return {x:1,y:Math.max(1,...placed.map(item=>item.y+item.rows))};
  }
  function widgetRect259(widget,store){
    const id=widget.dataset.widgetId,saved=store[id]||{};
    const span=clamp259(saved.span||numberVar259(widget,'--widget-span-v256',numberVar259(widget,'--widget-span',6)),3,12);
    const rows=clamp259(saved.rows||numberVar259(widget,'--widget-rows-v256',id==='revenue'?26:14),8,60);
    return {id,span,rows,x:Number(saved.x)||0,y:Number(saved.y)||0,order:Number.isFinite(Number(saved.order))?Number(saved.order):0};
  }
  function decorateDashboard259(){
    const grid=document.querySelector('.dashboard-widget-grid.dashboard-masonry-v256');
    if(!grid)return;
    const store=dashboardStore259(),widgets=[...grid.querySelectorAll(':scope > .dashboard-widget')];
    if(window.innerWidth<=900){
      grid.style.removeProperty('--dashboard-grid-rows-v259');
      widgets.forEach(widget=>{widget.style.removeProperty('--widget-x-v259');widget.style.removeProperty('--widget-y-v259');});
      return;
    }
    const placed=[];
    widgets.map((widget,index)=>({widget,index,rect:widgetRect259(widget,store)}))
      .sort((a,b)=>(a.rect.order-b.rect.order)||(a.index-b.index))
      .forEach(({widget,index,rect})=>{
        let x=clamp259(rect.x||1,1,GRID_COLUMNS-rect.span+1),y=Math.max(1,Number(rect.y)||1);
        if(!rect.x||!rect.y||!canPlace259({...rect,x,y},placed))({x,y}=firstFree259(rect.span,rect.rows,placed));
        const normalized={...store[rect.id],order:Number.isFinite(Number(store[rect.id]?.order))?Number(store[rect.id].order):index,span:rect.span,rows:rect.rows,x,y};
        store[rect.id]=normalized;
        placed.push({id:rect.id,x,y,span:rect.span,rows:rect.rows});
        widget.style.setProperty('--widget-x-v259',x);
        widget.style.setProperty('--widget-y-v259',y);
        widget.style.setProperty('--widget-span-v256',rect.span);
        widget.style.setProperty('--widget-rows-v256',rect.rows);
      });
    const lastRow=Math.max(1,...placed.map(item=>item.y+item.rows-1));
    const editing=grid.classList.contains('layout-editing');
    grid.style.setProperty('--dashboard-grid-rows-v259',Math.max(lastRow+(editing?6:0),editing?46:1));
  }
  function gridMetrics259(grid){
    const style=getComputedStyle(grid),rect=grid.getBoundingClientRect();
    const columnGap=parseFloat(style.columnGap)||14,rowGap=parseFloat(style.rowGap)||GRID_ROW_GAP;
    const cell=(grid.clientWidth-columnGap*(GRID_COLUMNS-1))/GRID_COLUMNS;
    return {rect,columnGap,rowGap,cell,stepX:cell+columnGap,stepY:GRID_ROW+rowGap};
  }
  function dropRect259(event,widget,grid){
    const store=dashboardStore259(),saved=store[widget.dataset.widgetId]||{},metrics=gridMetrics259(grid);
    const span=clamp259(saved.span||numberVar259(widget,'--widget-span-v256',6),3,12),rows=clamp259(saved.rows||numberVar259(widget,'--widget-rows-v256',14),8,60);
    const rawX=Math.floor((event.clientX-metrics.rect.left)/metrics.stepX)+1;
    const rawY=Math.floor((event.clientY-metrics.rect.top)/metrics.stepY)+1;
    return {id:widget.dataset.widgetId,x:clamp259(rawX,1,GRID_COLUMNS-span+1),y:Math.max(1,rawY),span,rows,metrics};
  }
  function allRects259(grid){
    const store=dashboardStore259();
    return [...grid.querySelectorAll(':scope > .dashboard-widget')].map(widget=>{
      const saved=store[widget.dataset.widgetId]||{};
      return {id:widget.dataset.widgetId,x:Number(saved.x)||1,y:Number(saved.y)||1,span:clamp259(saved.span||6,3,12),rows:clamp259(saved.rows||14,8,60)};
    });
  }
  function showDropPreview259(grid,rect,valid){
    let preview=grid.querySelector(':scope > .dashboard-drop-preview-v259');
    if(!preview){preview=document.createElement('div');preview.className='dashboard-drop-preview-v259';grid.appendChild(preview);}
    const {cell,columnGap,rowGap}=rect.metrics;
    preview.classList.toggle('is-invalid',!valid);
    preview.style.setProperty('--drop-left-v259',`${(rect.x-1)*(cell+columnGap)}px`);
    preview.style.setProperty('--drop-top-v259',`${(rect.y-1)*(GRID_ROW+rowGap)}px`);
    preview.style.setProperty('--drop-width-v259',`${rect.span*cell+(rect.span-1)*columnGap}px`);
    preview.style.setProperty('--drop-height-v259',`${rect.rows*GRID_ROW+(rect.rows-1)*rowGap}px`);
  }
  function removeDropPreview259(){document.querySelectorAll('.dashboard-drop-preview-v259').forEach(node=>node.remove());}
  function pushDashboardHistory259(){
    DASH_HISTORY.push(clone259(dashboardStore259()));
    if(DASH_HISTORY.length>30)DASH_HISTORY.shift();
    const undo=document.querySelector('[data-action="undo-dashboard-layout"]');if(undo)undo.disabled=false;
  }
  function restoreDashboardStore259(snapshot){
    const store=dashboardStore259();Object.keys(store).forEach(key=>delete store[key]);Object.assign(store,clone259(snapshot));
  }

  document.addEventListener('dragstart',event=>{
    const widget=event.target.closest?.('.dashboard-widget[data-widget-id]'),grid=widget?.closest('.dashboard-widget-grid.layout-editing');
    if(!widget||!grid||window.innerWidth<=900)return;
    DASH_DRAG={widget,grid};widget.classList.add('is-dragging-v259');
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',widget.dataset.widgetId);
    event.stopImmediatePropagation();
  },true);
  document.addEventListener('dragover',event=>{
    if(!DASH_DRAG)return;
    const grid=event.target.closest?.('.dashboard-widget-grid.layout-editing');if(!grid||grid!==DASH_DRAG.grid)return;
    event.preventDefault();event.stopImmediatePropagation();
    const rect=dropRect259(event,DASH_DRAG.widget,grid),valid=canPlace259(rect,allRects259(grid),rect.id);
    event.dataTransfer.dropEffect=valid?'move':'none';showDropPreview259(grid,rect,valid);
  },true);
  document.addEventListener('drop',event=>{
    if(!DASH_DRAG)return;
    const grid=event.target.closest?.('.dashboard-widget-grid.layout-editing');if(!grid||grid!==DASH_DRAG.grid)return;
    event.preventDefault();event.stopImmediatePropagation();
    const rect=dropRect259(event,DASH_DRAG.widget,grid),valid=canPlace259(rect,allRects259(grid),rect.id);
    if(valid){
      pushDashboardHistory259();
      const store=dashboardStore259(),old=store[rect.id]||{};store[rect.id]={...old,x:rect.x,y:rect.y,span:rect.span,rows:rect.rows};
      decorateDashboard259();
    }else if(typeof toast==='function')toast('Esse espaço já está ocupado. Solte o módulo em uma área vazia.','warn');
    DASH_DRAG.widget.classList.remove('is-dragging-v259');DASH_DRAG=null;removeDropPreview259();
  },true);
  document.addEventListener('dragend',event=>{
    if(!DASH_DRAG)return;
    event.stopImmediatePropagation();DASH_DRAG.widget.classList.remove('is-dragging-v259');DASH_DRAG=null;removeDropPreview259();
  },true);

  document.addEventListener('pointerdown',event=>{
    if(event.target.closest?.('.widget-resize-handle-v256')&&event.target.closest?.('.dashboard-widget-grid.layout-editing'))pushDashboardHistory259();
  },true);

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-action]');if(!button)return;
    const action=button.dataset.action;
    if(action==='toggle-dashboard-layout'){
      DASH_SNAPSHOT=clone259(dashboardStore259());DASH_HISTORY.length=0;
      requestAnimationFrame(decorateDashboard259);
    }else if(action==='undo-dashboard-layout'&&DASH_HISTORY.length){
      event.preventDefault();event.stopImmediatePropagation();
      restoreDashboardStore259(DASH_HISTORY.pop());renderView();
      requestAnimationFrame(()=>{decorateDashboard259();const undo=document.querySelector('[data-action="undo-dashboard-layout"]');if(undo)undo.disabled=DASH_HISTORY.length===0;});
    }else if(action==='cancel-dashboard-layout'){
      DASH_HISTORY.length=0;DASH_SNAPSHOT=null;requestAnimationFrame(decorateDashboard259);
    }else if(action==='save-dashboard-layout'){
      DASH_HISTORY.length=0;DASH_SNAPSHOT=null;
    }else if(action==='reset-dashboard-layout'){
      DASH_HISTORY.length=0;requestAnimationFrame(decorateDashboard259);
    }
    if(['toggle-layout-v256','cancel-layout-v256','reset-layout-v256'].includes(action))scheduleModalStabilize259();
  },true);

  function stabilizeModal259(){
    const modal=document.querySelector('#modal-root .modal.layout-editing-v256');if(!modal)return;
    modal.querySelectorAll('[data-layout-item-v256]').forEach(item=>{
      const isField=item.matches('.field'),isCheck=item.matches('.check-field');
      item.classList.toggle('layout-field-v259',isField);
      item.classList.toggle('layout-check-v259',isCheck);
      item.classList.toggle('layout-section-v259',!isField&&!isCheck);
      item.classList.add('has-custom-layout-v256');
    });
    window.MarcoV256?.refreshModalGrid?.(modal,false);
    const body=modal.querySelector(':scope > .modal-body');if(body&&body.scrollTop<4)body.scrollTop=0;
  }
  function scheduleModalStabilize259(){
    cancelAnimationFrame(MODAL_STABILIZE_FRAME);
    MODAL_STABILIZE_FRAME=requestAnimationFrame(()=>requestAnimationFrame(stabilizeModal259));
  }
  const modalRoot=document.getElementById('modal-root');
  if(modalRoot)new MutationObserver(mutations=>{
    if(mutations.some(m=>m.type==='childList')){
      const modal=modalRoot.querySelector('.modal');
      const unpreparedSurface=modal?.querySelector('[data-layout-surface]:not([data-layout-grid-v256])');
      if(unpreparedSurface)requestAnimationFrame(()=>window.MarcoV256?.decorateModal?.());
    }
    if(mutations.some(m=>m.type==='childList'||(m.type==='attributes'&&m.target.classList?.contains('layout-editing-v256'))))scheduleModalStabilize259();
  }).observe(modalRoot,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  const renderViewBase259=window.renderView;
  if(typeof renderViewBase259==='function')window.renderView=function(...args){const result=renderViewBase259.apply(this,args);requestAnimationFrame(decorateDashboard259);return result;};
  const renderShellBase259=window.renderShell;
  if(typeof renderShellBase259==='function')window.renderShell=function(...args){const result=renderShellBase259.apply(this,args);requestAnimationFrame(decorateDashboard259);return result;};

  window.MarcoV259={version:VERSION,decorateDashboard:decorateDashboard259,stabilizeModal:stabilizeModal259,dashboardStore:dashboardStore259,canPlace:canPlace259};
  requestAnimationFrame(()=>{decorateDashboard259();scheduleModalStabilize259();});
})();

/* ===== js/v275-osv-modular.js ===== */
/* Marco Iris Tecnologia v2.7.5 — interação da Nova OSV modular. */
(()=>{
  'use strict';
  const VERSION='2.8.3';
  const ORDER_FORM='form[data-form="order"]';
  const INTERNAL_SCROLL='.client-suggestions:not([hidden]),[role="listbox"]:not([hidden]),.quick-actions-menu,[data-dropdown-panel]:not([hidden]),.select-options:not([hidden])';

  function orderForm(root=document){return root.querySelector?.(ORDER_FORM)||null;}
  function orderModalFrom(node){return node?.closest?.('#modal-root .modal:has(form[data-form="order"])')||null;}
  function canConsumeWheel(element,deltaY){
    if(!element||element.scrollHeight<=element.clientHeight+1)return false;
    if(deltaY<0)return element.scrollTop>0;
    if(deltaY>0)return element.scrollTop+element.clientHeight<element.scrollHeight-1;
    return false;
  }
  function growTextarea(textarea){
    if(!textarea?.closest?.(ORDER_FORM))return;
    const previous=textarea.style.height;
    textarea.style.height='auto';
    textarea.style.height=`${Math.max(92,textarea.scrollHeight+2)}px`;
    if(previous!==textarea.style.height)textarea.closest('[data-layout-surface="order"]')?.style.setProperty('--osv-content-updated-v275',Date.now());
  }
  function growAllTextareas(root=document){root.querySelectorAll?.(`${ORDER_FORM} textarea`).forEach(growTextarea);}

  function updateReorderButtons(root=document){
    root.querySelectorAll?.(`${ORDER_FORM} #order-items-editor`).forEach(host=>{
      const rows=[...host.querySelectorAll(':scope > .item-editor-row')];
      rows.forEach((row,index)=>{
        const up=row.querySelector('[data-action="move-item-row"][data-dir="-1"]');
        const down=row.querySelector('[data-action="move-item-row"][data-dir="1"]');
        if(up)up.disabled=index===0;
        if(down)down.disabled=index===rows.length-1;
        row.draggable=false;
        row.removeAttribute('data-order-item');
      });
    });
  }

  function updateClientLayer(root=document){
    root.querySelectorAll?.(`${ORDER_FORM} [data-osv-component="clientField"],${ORDER_FORM} .client-picker`).forEach(component=>{
      component.classList.toggle('client-suggestions-active-v275',!!component.querySelector('.client-search-row.suggestions-open .client-suggestions:not([hidden])'));
    });
  }

  function hydrate(root=document){
    growAllTextareas(root);
    updateReorderButtons(root);
    updateClientLayer(root);
  }

  document.addEventListener('input',event=>{
    if(event.target.matches?.(`${ORDER_FORM} textarea`))growTextarea(event.target);
  },true);

  document.addEventListener('click',event=>{
    if(event.target.closest?.(`${ORDER_FORM} [data-action="move-item-row"],${ORDER_FORM} [data-action="add-item-row"],${ORDER_FORM} [data-action="remove-item-row"],${ORDER_FORM} [data-action="save-quick-catalog-item"]`)){
      queueMicrotask(()=>updateReorderButtons(document));
    }
  },true);

  document.addEventListener('wheel',event=>{
    if(event.ctrlKey)return;
    const modal=orderModalFrom(event.target);if(!modal)return;
    const internal=event.target.closest?.(INTERNAL_SCROLL);
    if(internal&&canConsumeWheel(internal,event.deltaY)){
      event.stopPropagation();
      return;
    }
    const body=modal.querySelector(':scope > .modal-body');
    if(!body||body.scrollHeight<=body.clientHeight+1||!event.deltaY)return;
    if(event.cancelable)event.preventDefault();
    body.scrollTop+=event.deltaY;
  },{capture:true,passive:false});

  const observer=new MutationObserver(records=>{
    let needsHydrate=false;
    for(const record of records){
      if(record.type==='childList'&&([...record.addedNodes].some(node=>node.nodeType===1)))needsHydrate=true;
      if(record.type==='attributes'&&(record.attributeName==='hidden'||record.attributeName==='class'))needsHydrate=true;
      if(needsHydrate)break;
    }
    if(needsHydrate)requestAnimationFrame(()=>hydrate(document));
  });
  const modalRoot=document.getElementById('modal-root');
  if(modalRoot)observer.observe(modalRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});

  window.addEventListener('resize',()=>requestAnimationFrame(()=>growAllTextareas(document)),{passive:true});
  document.addEventListener('DOMContentLoaded',()=>hydrate(document),{once:true});
  requestAnimationFrame(()=>hydrate(document));

  window.MarcoOSVModular275={version:VERSION,hydrate,updateReorderButtons,growAllTextareas};
})();

/* ===== js/v280-marco-solicitacoes.js ===== */
/*
 * Marco Iris Tecnologia v2.8.4
 * Revisao solicitada pelo Marco: pagamentos, itens, rodape de OSV,
 * separadores, modais, scroll, exclusao definitiva e seguranca do cofre.
 */
(() => {
  'use strict';

  const VERSION = '2.8.4';
  const PAYMENT_WITH_FEE = /d[eé]bito|cr[eé]dito|outro/i;
  const PAYMENT_WITHOUT_FEE = /pix|dinheiro|boleto|transfer[eê]ncia/i;
  const parseSequenceV280 = value => Number(String(value || '').match(/(\d+)(?!.*\d)/)?.[1] || 0);
  const observedScrollable = new WeakSet();
  const scrollState = new WeakMap();
  const scrollResizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    for (const entry of entries) evaluateScrollable(entry.target);
  }) : null;
  let patchQueued = false;

  const q = (selector, root = document) => root?.querySelector?.(selector) || null;
  const qa = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
  const schedulePatch = () => {
    if (patchQueued) return;
    patchQueued = true;
    requestAnimationFrame(() => {
      patchQueued = false;
      patchAll();
    });
  };
  const setIconOnly = (button, iconName, title) => {
    if (!button) return;
    const isAlreadyIconOnly = button.dataset.v280Icon === iconName && button.textContent.trim() === '';
    if (!isAlreadyIconOnly) button.innerHTML = icon(iconName, 19);
    button.dataset.v280Icon = iconName;
    button.title = title;
    button.setAttribute('aria-label', title);
    button.classList.add('icon-only-v280');
  };
  const paymentHasFee = method => PAYMENT_WITH_FEE.test(String(method || '')) && !PAYMENT_WITHOUT_FEE.test(String(method || ''));

  function paymentLiquidText(row) {
    const input = q('[data-payment-field="value"]', row);
    const value = typeof num === 'function' ? num(input?.value) : Number(input?.value || 0);
    return typeof currency === 'function' ? currency(value) : String(value);
  }

  function patchPaymentRow(row) {
    if (!row || row.dataset.v280Payment === '1') {
      updatePaymentRow(row);
      return;
    }
    const main = q('.payment-row-main', row);
    const secondary = q('.payment-row-secondary', row);
    if (!main || !secondary) return;

    const plannedLabel = q('[data-payment-field="planned"]', row)?.closest('label');
    const planned = q('[data-payment-field="planned"]', row);
    const paymentDateField = q('[data-payment-field="paymentDate"]', row)?.closest('.field');
    const dueField = q('.due-field', row);
    const feeField = q('.fee-field', row);
    const noteField = q('.payment-note', row);
    const statusBox = q('.payment-status-box', row);
    const grossBox = q('.payment-gross-box', row);
    const removeButton = q('.payment-delete', row);

    if (plannedLabel && planned) {
      plannedLabel.classList.add('planned-source-v280');
      plannedLabel.hidden = true;
      const scheduleButton = document.createElement('button');
      scheduleButton.type = 'button';
      scheduleButton.className = 'icon-btn schedule-payment-v280';
      scheduleButton.dataset.action = 'toggle-payment-schedule-v280';
      scheduleButton.title = 'Agendar data de vencimento';
      scheduleButton.setAttribute('aria-label', 'Agendar data de vencimento');
      scheduleButton.setAttribute('aria-pressed', String(planned.checked));
      scheduleButton.innerHTML = icon('agenda', 18);
      (paymentDateField || plannedLabel).insertAdjacentElement('afterend', scheduleButton);
    }
    if (dueField) main.appendChild(dueField);

    if (noteField) {
      const input = q('[data-payment-field="notes"]', noteField);
      if (input && input.tagName !== 'TEXTAREA') {
        const textarea = document.createElement('textarea');
        [...input.attributes].forEach(attribute => textarea.setAttribute(attribute.name, attribute.value));
        textarea.value = input.value;
        textarea.rows = 2;
        textarea.className = `${input.className || ''} payment-notes-textarea-v280`.trim();
        input.replaceWith(textarea);
      }
    }

    const left = document.createElement('div');
    left.className = 'payment-secondary-left-v280';
    if (feeField) left.appendChild(feeField);
    if (noteField) left.appendChild(noteField);

    const summary = document.createElement('div');
    summary.className = 'payment-summary-box-v280';
    const liquid = document.createElement('div');
    liquid.className = 'payment-summary-line-v280';
    liquid.innerHTML = '<small>Valor líquido</small><strong data-payment-liquid-summary></strong>';
    summary.appendChild(liquid);
    if (grossBox) {
      const label = q('small', grossBox);
      if (label) label.textContent = 'Valor com taxa';
      grossBox.classList.add('payment-summary-line-v280', 'payment-gross-line-v280');
      summary.appendChild(grossBox);
    }
    if (statusBox) {
      statusBox.classList.add('payment-summary-line-v280');
      summary.appendChild(statusBox);
    }

    secondary.replaceChildren(left, summary);
    secondary.classList.add('payment-row-secondary-v280');
    if (removeButton) {
      row.appendChild(removeButton);
      removeButton.title = 'Excluir pagamento';
      removeButton.setAttribute('aria-label', 'Excluir pagamento');
    }
    row.dataset.v280Payment = '1';
    updatePaymentRow(row);
  }

  function updatePaymentRow(row) {
    if (!row) return;
    const method = q('[data-payment-field="method"]', row)?.value || 'Pix';
    const hasFee = paymentHasFee(method);
    const feeField = q('.fee-field', row);
    const grossLine = q('.payment-gross-line-v280', row);
    if (feeField) {
      feeField.hidden = !hasFee;
      feeField.classList.toggle('is-hidden', !hasFee);
      qa('input,select,textarea', feeField).forEach(control => { control.disabled = !hasFee; });
    }
    if (grossLine) {
      grossLine.hidden = !hasFee;
      grossLine.classList.toggle('is-hidden', !hasFee);
    }
    const liquid = q('[data-payment-liquid-summary]', row);
    if (liquid) { const text = paymentLiquidText(row); if (liquid.textContent !== text) liquid.textContent = text; }
    const schedule = q('[data-action="toggle-payment-schedule-v280"]', row);
    const planned = q('[data-payment-field="planned"]', row);
    const dueField = q('.due-field', row);
    if (dueField) dueField.classList.toggle('is-hidden', !planned?.checked);
    if (schedule && planned) {
      schedule.classList.toggle('is-active', planned.checked);
      schedule.setAttribute('aria-pressed', String(planned.checked));
      schedule.title = planned.checked ? 'Remover agendamento de vencimento' : 'Agendar data de vencimento';
      schedule.setAttribute('aria-label', schedule.title);
    }
  }

  function patchStandalonePayment(form) {
    if (!form) return;
    const band = window.innerWidth <= 720 ? 'mobile' : window.innerWidth <= 1100 ? 'tablet' : 'desktop';
    const savedPaymentLayout = typeof data === 'function' ? data()?.settings?.unifiedLayoutsV256?.[band]?.['form:payment'] : null;
    const hasSavedPaymentLayout = !!savedPaymentLayout && Object.values(savedPaymentLayout).some(grid => grid && Object.keys(grid).length);
    form.classList.toggle('payment-default-compact-v281', !hasSavedPaymentLayout);
    const planned = form.elements?.planned;
    const paymentDate = form.elements?.paymentDate;
    const due = form.elements?.dueDate?.closest('.field');
    const plannedLabel = planned?.closest('label');
    if (planned && plannedLabel && !q('[data-action="toggle-standalone-schedule-v280"]', form)) {
      plannedLabel.hidden = true;
      plannedLabel.classList.add('planned-source-v280');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'icon-btn schedule-payment-v280 standalone-schedule-v280';
      button.dataset.action = 'toggle-standalone-schedule-v280';
      button.innerHTML = icon('agenda', 18);
      const dateField = paymentDate?.closest('.field');
      if (dateField && paymentDate) {
        let control = q('.payment-date-control-v281', dateField);
        if (!control) {
          control = document.createElement('div');
          control.className = 'payment-date-control-v281';
          paymentDate.before(control);
          control.appendChild(paymentDate);
        }
        control.appendChild(button);
      }
    }
    const method = form.elements?.paymentMethod?.value || 'Pix';
    const hasFee = paymentHasFee(method);
    const fee = q('.payment-fee', form);
    if (fee) {
      fee.hidden = !hasFee;
      fee.classList.toggle('is-hidden', !hasFee);
      qa('input,select,textarea', fee).forEach(control => { control.disabled = !hasFee; });
    }
    const summary = q('.payment-summary', form);
    if (summary) {
      const spans = qa(':scope > span', summary);
      const feeLine = spans.find(span => /^Taxa:/i.test(span.textContent.trim()));
      const grossLine = spans.find(span => /Valor (total cobrado na maquininha|com taxa)/i.test(span.textContent));
      if (grossLine) {
        if (grossLine.childNodes[0]?.textContent !== 'Valor com taxa: ') grossLine.childNodes[0].textContent = 'Valor com taxa: ';
        grossLine.hidden = !hasFee;
      }
      if (feeLine) feeLine.hidden = !hasFee;
      let statusLine = q('[data-payment-summary-status-v280]', summary);
      if (!statusLine) {
        statusLine = document.createElement('span');
        statusLine.dataset.paymentSummaryStatusV280 = '1';
        statusLine.innerHTML = 'Status: <strong></strong>';
        summary.appendChild(statusLine);
      }
      const statusPreview = q('[data-payment-status-preview]', form)?.textContent?.trim() || 'Em aberto';
      const statusValue = q('strong', statusLine);
      if (statusValue && statusValue.textContent !== statusPreview) statusValue.textContent = statusPreview;
      summary.classList.add('payment-summary-v280');
    }
    const notes = form.elements?.notes;
    if (notes) notes.classList.add('payment-notes-standalone-v280');
    const schedule = q('[data-action="toggle-standalone-schedule-v280"]', form);
    if (schedule && planned) {
      schedule.classList.toggle('is-active', planned.checked);
      schedule.setAttribute('aria-pressed', String(planned.checked));
      schedule.title = planned.checked ? 'Remover agendamento de vencimento' : 'Agendar data de vencimento';
      schedule.setAttribute('aria-label', schedule.title);
    }
    if (due) due.classList.toggle('is-hidden', !planned?.checked);

    if (form.dataset.id && !q('[data-action="delete-payment"]', form)) {
      const actions = q(':scope > .form-actions', form);
      if (actions) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'icon-btn danger permanent-delete-v280';
        remove.dataset.action = 'delete-payment';
        remove.dataset.id = form.dataset.id;
        remove.title = 'Excluir definitivamente';
        remove.setAttribute('aria-label', 'Excluir definitivamente');
        remove.innerHTML = icon('trash', 19);
        actions.prepend(remove);
      }
    }
  }

  function patchFinancialSummary(form) {
    const summary = q('.order-financial-breakdown', form);
    if (!summary) return;
    summary.classList.add('order-financial-breakdown-v280');
    const rows = {
      services: q('#order-form-services', summary)?.parentElement,
      products: q('#order-form-products', summary)?.parentElement,
      productCost: q('#order-form-product-cost', summary)?.parentElement,
      productProfit: q('#order-form-product-profit', summary)?.parentElement,
      itemDiscount: q('#order-form-item-discount', summary)?.parentElement,
      gross: q('#order-form-gross', summary)?.parentElement,
      generalDiscount: q('[data-field="general-discount"]', summary)?.closest('label'),
      final: q('#order-form-total', summary)?.parentElement
    };
    const hasProducts = qa('.item-editor-row', form).some(row => q('[data-item-field="type"]', row)?.value === 'Produto');
    [rows.productCost, rows.productProfit].forEach(row => {
      if (!row) return;
      row.hidden = !hasProducts;
      row.classList.toggle('is-hidden', !hasProducts);
    });
    if (summary.dataset.v280Summary === '1') return;
    Object.entries(rows).forEach(([name, row]) => {
      if (!row) return;
      row.classList.add('financial-summary-row-v280', `financial-${name}-v280`);
    });
    [rows.services, rows.products, rows.productCost, rows.productProfit, rows.itemDiscount, rows.gross, rows.generalDiscount, rows.final]
      .filter(Boolean).forEach(row => summary.appendChild(row));
    summary.dataset.v280Summary = '1';
  }

  function patchOrderItems(form) {
    qa('.item-editor-row', form).forEach(row => row.classList.add('item-editor-row-v280'));
    patchFinancialSummary(form);
  }

  function orderForForm(form) {
    const id = form?.dataset?.id || form?.dataset?.reservedCode || '';
    return id && typeof findOrder === 'function' ? findOrder(id) : null;
  }

  function patchOrderFooter(form) {
    const footer = q('.osv-form-actions', form);
    if (!footer) return;
    const order = orderForForm(form);
    const pdfs = Array.isArray(order?.pdfs) ? order.pdfs : [];
    const isHistoricalPdf = meta => !!(meta?.legacy || meta?.legacyImported || meta?.importedLegacy || meta?.historicalImported || meta?.generatedByCurrentApp === false);
    const officialPdfs = pdfs.filter(meta => meta?.official !== false);
    const hasCurrentPdf = officialPdfs.some(meta => !isHistoricalPdf(meta));
    const historyOnly = officialPdfs.length > 0 && !hasCurrentPdf;
    const status = q('[data-pdf-status]', footer);
    const state = status?.dataset?.pdfState || 'idle';
    if (status) {
      let label = 'Nenhum PDF';
      let tone = 'none';
      if (historyOnly) { label = 'PDF Histórico'; tone = 'history'; }
      else if (state === 'ready' && hasCurrentPdf) { label = 'PDF Atualizado'; tone = 'ready'; }
      else if (state === 'dirty' && officialPdfs.length) { label = 'PDF Desatualizado'; tone = 'dirty'; }
      else if (officialPdfs.length) { label = hasCurrentPdf ? 'PDF Atualizado' : 'PDF Histórico'; tone = hasCurrentPdf ? 'ready' : 'history'; }
      const text = q('[data-pdf-status-text]', status);
      if (text && text.textContent !== label) text.textContent = label;
      status.dataset.pdfToneV280 = tone;
      status.classList.add('pdf-status-v280');
    }

    const generate = q('[data-pdf-generate]', footer) || q('[data-followup="pdf"]', footer);
    const view = q('[data-action="view-current-pdf"], [data-followup="view-pdf"]', footer);
    const whatsapp = q('[data-followup="share"]', footer);
    setIconOnly(generate, 'pdf', 'Gerar PDF');
    setIconOnly(view, 'eye', 'Visualizar PDF');
    setIconOnly(whatsapp, 'whatsapp', 'Enviar pelo WhatsApp');
    if (view) {
      view.disabled = officialPdfs.length === 0;
      view.classList.toggle('is-disabled-v280', view.disabled);
    }

    const count = (order?.attachments || []).length;
    const nativeAttach = q('[data-action="open-attachments-manager"]', footer);
    let customAttach = q('[data-action="focus-technical-attachments-v280"]', footer);
    if (nativeAttach) {
      if (customAttach && customAttach !== nativeAttach) {
        customAttach.remove();
        customAttach = null;
      }
      setIconOnly(nativeAttach, 'paperclip', `Anexos Técnicos (${count})`);
    } else if (!customAttach) {
      const attach = document.createElement('button');
      attach.type = 'button';
      attach.className = 'btn secondary icon-only-v280';
      attach.dataset.action = 'focus-technical-attachments-v280';
      setIconOnly(attach, 'paperclip', `Anexos Técnicos (${count})`);
      const cancel = q('.action-cancel', footer);
      footer.insertBefore(attach, cancel || null);
    } else {
      setIconOnly(customAttach, 'paperclip', `Anexos Técnicos (${count})`);
    }
    if (order && !q('[data-action="delete-order"]', footer)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn danger permanent-delete-v280';
      remove.dataset.action = 'delete-order';
      remove.dataset.id = order.id;
      remove.title = 'Excluir definitivamente';
      remove.setAttribute('aria-label', 'Excluir definitivamente');
      remove.innerHTML = icon('trash', 19);
      footer.insertBefore(remove, q('.action-cancel', footer) || null);
    }
    footer.classList.add('osv-form-actions-v280');
  }

  function patchOrderForm(form) {
    if (!form) return;
    qa('.payment-editor-row', form).forEach(patchPaymentRow);
    patchOrderItems(form);
    patchOrderFooter(form);
  }

  function patchOrderDetail(modal) {
    if (!modal || q('form[data-form="order"]', modal)) return;
    const title = q('.modal-header h2', modal)?.textContent || '';
    if (!/^OSV\b/i.test(title)) return;
    modal.classList.add('order-detail-v280');
    const orderId = title.replace(/^OSV\s*/i, '').trim();
    const order = typeof findOrder === 'function' ? findOrder(orderId) : null;
    const actionToolbar = qa('.modal-body > .toolbar', modal)[0];
    const actionHost = q('.toolbar-left', actionToolbar);
    if (!actionHost) return;
    const morePayment = q('[data-action="new-payment"]', actionHost);
    if (morePayment && morePayment.dataset.v280PaymentLabel !== '1') {
      morePayment.innerHTML = `${icon('plus', 18)} <span>Pagamento</span>`;
      morePayment.title = 'Pagamento';
      morePayment.setAttribute('aria-label', 'Pagamento');
      morePayment.dataset.v280PaymentLabel = '1';
    }
    setIconOnly(q('[data-action="generate-pdf"]', actionHost), 'pdf', 'Gerar PDF');
    setIconOnly(q('[data-action="share-order"]', actionHost), 'whatsapp', 'Enviar pelo WhatsApp');
    setIconOnly(q('[data-action="add-order-photos"][data-mode="camera"]', actionHost), 'camera', 'Tirar Foto');
    const gallery = q('[data-action="add-order-photos"][data-mode="gallery"]', actionHost);
    setIconOnly(gallery, 'image', 'Anexar Foto');
    gallery?.classList.remove('ghost');
    gallery?.classList.add('secondary');
    setIconOnly(q('[data-action="add-order-files"]', actionHost), 'upload', 'Anexar Laudo');
    if (order && !q('[data-action="view-current-pdf"]', actionHost)) {
      const view = document.createElement('button');
      view.type = 'button';
      view.className = 'btn secondary';
      view.dataset.action = 'view-current-pdf';
      view.dataset.id = order.id;
      setIconOnly(view, 'eye', 'Visualizar PDF');
      view.disabled = !(order.pdfs || []).length;
      const generate = q('[data-action="generate-pdf"]', actionHost);
      generate?.insertAdjacentElement('afterend', view);
    }
    if (order && !q('[data-action="delete-order"]', actionHost)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'icon-btn danger permanent-delete-v280';
      remove.dataset.action = 'delete-order';
      remove.dataset.id = order.id;
      remove.title = 'Excluir definitivamente';
      remove.setAttribute('aria-label', remove.title);
      remove.innerHTML = icon('trash', 19);
      actionHost.appendChild(remove);
    }

    const totalBox = q('.order-detail-totals.detailed', modal);
    if (totalBox) {
      totalBox.classList.add('order-detail-totals-v280');
      qa(':scope > span', totalBox).forEach(span => span.classList.add('financial-summary-row-v280'));
      const productRows = qa(':scope > span', totalBox).filter(span => /Custo dos produtos|Lucro bruto dos produtos/i.test(span.textContent));
      const hasProducts = order && typeof orderItems === 'function' && orderItems(order.id).some(item => item.type === 'Produto');
      productRows.forEach(row => { row.hidden = !hasProducts; });
      const total = q(':scope > strong', totalBox);
      total?.classList.add('financial-final-v280');
    }
  }

  function patchModalHeader(modal) {
    const header = q('.modal-header', modal);
    if (!header) return;
    header.classList.add('modal-header-v280');
    qa('[data-action="toggle-layout-v256"], [data-action="toggle-form-layout"], [data-action="open-osv-layout-editor"]', header).forEach(button => {
      const saving = /salvar/i.test(button.textContent);
      setIconOnly(button, saving ? 'save' : 'edit', saving ? 'Salvar layout' : 'Editar Layout');
      button.classList.add('modal-layout-icon-v280');
    });
    const close = q('[data-action="close-modal"]', header);
    if (close) {
      close.title = 'Fechar';
      close.setAttribute('aria-label', 'Fechar');
      close.classList.add('modal-close-v280');
    }
  }


  function patchClientDetailHeader(modal) {
    if (!modal?.classList.contains('client-detail-modal-v256')) return;
    const header = q(':scope > .modal-header', modal);
    const body = q(':scope > .modal-body', modal);
    if (!body) return;
    let controls = q(':scope > .modal-floating-controls-v281', body);
    if (!controls) {
      controls = document.createElement('div');
      controls.className = 'modal-floating-controls-v281';
      body.prepend(controls);
    }
    const layout = q('[data-action="toggle-layout-v256"]', header || modal) || q('[data-action="toggle-layout-v256"]', modal);
    const close = q('[data-action="close-modal"]', header || modal) || q('[data-action="close-modal"]', modal);
    if (layout) {
      setIconOnly(layout, /salvar/i.test(layout.title || '') ? 'save' : 'edit', /salvar/i.test(layout.title || '') ? 'Salvar layout' : 'Editar Layout');
      layout.classList.remove('modal-layout-icon-v280');
      layout.classList.add('modal-floating-layout-v281');
      controls.appendChild(layout);
    }
    if (close) {
      close.title = 'Fechar';
      close.setAttribute('aria-label', 'Fechar');
      close.classList.remove('modal-close-v280');
      close.classList.add('modal-floating-close-v281');
      controls.appendChild(close);
    }
    const heroTitle = q('.detail-hero h2', body);
    if (heroTitle) {
      if (!heroTitle.id) heroTitle.id = 'client-detail-title-v281';
      modal.setAttribute('aria-labelledby', heroTitle.id);
    }
    header?.remove();
    modal.classList.add('client-detail-header-removed-v281');
  }

  function patchSeparators(root = document) {
    qa('.finance-table-v256 tbody tr, [data-view-content="finance"] tbody tr', root).forEach(row => {
      const cell = row.children?.[3];
      if (!cell || cell.dataset.v280Separator === '1') return;
      const client = q('.text-link', cell);
      const osv = q('.code-link', cell);
      if (client && osv) {
        const dot = document.createElement('span');
        dot.className = 'inline-dot-v280';
        dot.textContent = '•';
        client.insertAdjacentElement('afterend', dot);
        cell.classList.add('inline-information-v280');
      }
      cell.dataset.v280Separator = '1';
    });
    qa('.clients-table-v256 thead th', root).forEach(th => {
      const label = qa('span', th).find(span => span.textContent.trim() === 'Ordens');
      if (label) label.textContent = 'OSVs';
      else if (/^Ordens(?:\s|⇅|↑|↓)*$/.test(th.textContent.trim())) {
        const textNode = [...th.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent.includes('Ordens'));
        if (textNode) textNode.textContent = textNode.textContent.replace('Ordens', 'OSVs');
        else th.textContent = th.textContent.replace('Ordens', 'OSVs');
      }
    });
    qa('.clients-table-v256 tbody tr', root).forEach(row => {
      const cell = row.children?.[1];
      if (!cell || cell.dataset.v280Separator === '1') return;
      const strong = q(':scope > strong', cell);
      const small = q(':scope > small.muted', cell);
      if (strong && small && !/Arquivado/i.test(small.textContent)) {
        const dot = document.createElement('span');
        dot.className = 'inline-dot-v280';
        dot.textContent = '•';
        strong.insertAdjacentElement('afterend', dot);
        cell.classList.add('inline-information-v280');
      }
      cell.dataset.v280Separator = '1';
    });
    qa('tbody td', root).forEach(cell => {
      if (cell.classList.contains('inline-information-v280')) return;
      const strong = q(':scope > strong', cell);
      const small = q(':scope > small.muted', cell);
      if (!strong || !small || /arquivad|pendente|manual|autom[aá]tica/i.test(small.textContent)) return;
      const dot = document.createElement('span');
      dot.className = 'inline-dot-v280';
      dot.textContent = '•';
      strong.insertAdjacentElement('afterend', dot);
      cell.classList.add('inline-information-v280');
    });
  }

  function patchPermanentDeleteButtons(root = document) {
    qa('[data-action="delete-payment"]', root).forEach(button => {
      button.title = 'Excluir definitivamente';
      button.setAttribute('aria-label', 'Excluir definitivamente');
      button.classList.add('permanent-delete-v280', 'danger');
    });
    qa('[data-action="delete-order"]', root).forEach(button => {
      button.title = 'Excluir definitivamente';
      button.setAttribute('aria-label', 'Excluir definitivamente');
      button.classList.add('permanent-delete-v280', 'danger');
    });
  }

  function patchSettingsSecurity(root = document) {
    if (typeof CURRENT_VIEW !== 'undefined' && CURRENT_VIEW !== 'settings') return;
    const host = q('#view-root .settings-category-content', root) || q('#view-root .settings-grid', root) || q('#view-root', root);
    if (!host || q('[data-vault-security-card-v280]', host)) return;
    const card = document.createElement('section');
    card.className = 'card full-settings-card vault-security-card-v280';
    card.dataset.vaultSecurityCardV280 = '1';
    card.innerHTML = `<div class="card-header"><div><h2>Criptografia vinculada ao Google</h2><p>Os dados continuam criptografados antes de serem enviados ao Drive, mas o desbloqueio agora acontece automaticamente após a confirmação da conta autorizada.</p></div>${typeof statusBadge === 'function' ? statusBadge('Google protegido') : ''}</div><div class="list-row"><div class="list-row-main"><strong>Entrada sem senha adicional</strong><small>O login Google é a única etapa de acesso ao Marco Iris.</small></div>${icon('cloud')}</div>`;
    host.appendChild(card);
  }

  function evaluateScrollable(element) {
    if (!element || !element.isConnected) return;
    const overflow = element.scrollHeight > element.clientHeight + 2;
    if (scrollState.get(element) === overflow) return;
    scrollState.set(element, overflow);
    element.classList.toggle('has-inner-scroll-v280', overflow);
    element.classList.toggle('no-inner-scroll-v280', !overflow);
  }

  function markScrollable(element) {
    if (!element) return;
    if (!observedScrollable.has(element)) {
      observedScrollable.add(element);
      scrollResizeObserver?.observe(element);
    }
    evaluateScrollable(element);
  }

  function patchScroll(root = document) {
    qa('#modal-root [data-layout-item-v256], #modal-root section.card, #modal-root .form-section', root).forEach(markScrollable);
  }

  function patchAll() {
    const modal = q('#modal-root .modal');
    if (modal) {
      patchModalHeader(modal);
      patchOrderForm(q('form[data-form="order"]', modal));
      patchStandalonePayment(q('form[data-form="payment"]', modal));
      patchOrderDetail(modal);
      patchClientDetailHeader(modal);
    }
    patchSeparators(document);
    patchPermanentDeleteButtons(document);
    patchSettingsSecurity(document);
    patchScroll(document);
  }

  async function permanentlyDeletePaymentV280(id) {
    const payment = data().payments.find(item => String(item.id) === String(id) || String(item.code) === String(id));
    if (!payment) return;
    const label = payment.code || payment.id;
    const confirmed = await confirmAction(
      `Deseja excluir definitivamente este lançamento financeiro?

Esta ação não poderá ser desfeita.`,
      { confirmLabel: 'Excluir definitivamente', tone: 'danger' }
    );
    if (!confirmed) return;
    await MarcoStorage.createBackup(STATE, 'antes-de-excluir-lancamento-definitivamente');
    const profileId = activeProfile().id;
    if (typeof markPendingPaymentDeletion === 'function') markPendingPaymentDeletion(profileId, String(payment.id));
    data().payments = data().payments.filter(item => item !== payment);
    data().settings.nextIds = data().settings.nextIds || {};
    const prefix = /despesa/i.test(String(payment.type || '')) ? 'DES' : 'REC';
    const maxExisting = data().payments.reduce((max, item) => {
      const itemPrefix = /despesa/i.test(String(item.type || '')) ? 'DES' : 'REC';
      return itemPrefix === prefix ? Math.max(max, parseSequenceV280(item.code || item.id)) : max;
    }, 0);
    data().settings.nextIds[prefix] = maxExisting + 1;
    STATE.updatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    try { window.MarcoBorionInterop?.prepareState?.(STATE); } catch (error) { console.warn('[V280_DELETE_PAYMENT_TOMBSTONE]', error); }
    await persist('Lançamento financeiro excluído definitivamente', label, { immediate: true, backup: true, media: false });
    closeModal();
    renderView();
    toast(`${label} excluído definitivamente. A numeração final foi liberada para reutilização.`);
  }

  async function permanentlyDeleteOrderV280(id) {
    const order = typeof findOrder === 'function' ? findOrder(id) : null;
    if (!order) return;
    const items = orderItems(id);
    const payments = orderPayments(id);
    const terms = orderConsentItems(id);
    const media = [...(order.photos || []), ...(order.pdfs || []), ...(order.attachments || [])];
    const confirmed = await confirmAction(
      `Deseja excluir definitivamente esta Ordem de Serviço?\n\nEsta ação não poderá ser desfeita.\n\nTambém serão removidos:\n• todos os pagamentos vinculados;\n• todos os PDFs e anexos vinculados;\n• todos os registros relacionados exclusivamente à ${id}.`,
      { confirmLabel: 'Excluir definitivamente', tone: 'danger' }
    );
    if (!confirmed) return;
    await MarcoStorage.createBackup(STATE, 'antes-de-excluir-os-definitivamente');
    let pendingDriveCleanup = 0;
    data().settings.pendingDriveCleanup = Array.isArray(data().settings.pendingDriveCleanup) ? data().settings.pendingDriveCleanup : [];
    for (const file of media) {
      if (file.localKey) {
        try { await MarcoStorage.deleteMedia(file.localKey); }
        catch (error) { console.warn('[V282_DELETE_ORDER_LOCAL_MEDIA]', error); }
      }
      if (file.driveFileId) {
        let driveError = '';
        if (GoogleDriveMarco.isConfigured()) {
          try { await GoogleDriveMarco.trash(file.driveFileId); }
          catch (error) { driveError = String(error?.message || error); }
        } else {
          driveError = 'Google Drive não configurado no momento da exclusão.';
        }
        if (driveError) {
          pendingDriveCleanup += 1;
          data().settings.pendingDriveCleanup.push({
            id: `cleanup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            orderId: id,
            mediaId: file.id || '',
            driveFileId: file.driveFileId,
            fileName: file.fileName || '',
            createdAt: typeof nowIso === 'function' ? nowIso() : new Date().toISOString(),
            error: driveError,
            reason: 'Exclusão definitiva de OSV'
          });
          console.warn('[V282_DELETE_ORDER_DRIVE_PENDING]', driveError);
        }
      }
    }
    const itemIds = new Set(items.map(item => item.id));
    data().stockMovements = data().stockMovements.filter(movement => {
      if (itemIds.has(movement.sourceItemId) || (movement.orderId === id && movement.sourceItemId)) return false;
      if (movement.orderId === id) {
        movement.orderId = '';
        movement.notes = [movement.notes, `Vínculo removido após exclusão da ${id}`].filter(Boolean).join(' · ');
      }
      return true;
    });
    const profileId = activeProfile().id;
    for (const payment of payments) {
      if (typeof markPendingPaymentDeletion === 'function') {
        markPendingPaymentDeletion(profileId, String(payment.id || payment.code || ''));
      }
    }
    data().orderItems = data().orderItems.filter(item => item.orderId !== id);
    data().payments = data().payments.filter(payment => payment.orderId !== id);
    data().consents = data().consents.filter(term => term.orderId !== id);
    data().appointments.forEach(appointment => { if (appointment.orderId === id) appointment.orderId = ''; });
    data().serviceOrders = data().serviceOrders.filter(item => item.id !== id);
    const maxExisting = data().serviceOrders.reduce((max, item) => Math.max(max, parseSequenceV280(item.id)), 0);
    data().settings.nextIds = data().settings.nextIds || {};
    data().settings.nextIds.OSV = maxExisting + 1;
    STATE.updatedAt = typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
    try { window.MarcoBorionInterop?.prepareState?.(STATE); } catch (error) { console.warn('[V281_DELETE_ORDER_TOMBSTONES]', error); }
    await persist('OSV excluída definitivamente', `${id} · ${items.length} item(ns) · ${payments.length} pagamento(s) · ${terms.length} termo(s)${pendingDriveCleanup ? ` · ${pendingDriveCleanup} limpeza(s) do Drive pendente(s)` : ''}`, { immediate: true, backup: true, media: false });
    closeModal();
    renderView();
    toast(`${id} excluída definitivamente. A numeração final foi liberada para reutilização.${pendingDriveCleanup ? ` ${pendingDriveCleanup} arquivo(s) ficaram na fila segura de limpeza do Drive.` : ''}`, pendingDriveCleanup ? 'warn' : 'success');
  }

  async function handleVaultAction() {
    return false;
  }

  // A exclusao financeira definitiva deve ficar disponivel em qualquer idade.
  if (typeof canPermanentlyDeletePayment === 'function') {
    canPermanentlyDeletePayment = () => true;
  }
  if (typeof deleteOrder === 'function') {
    deleteOrder = permanentlyDeleteOrderV280;
  }
  if (typeof handleAction === 'function') {
    const handleActionBeforeV280 = handleAction;
    handleAction = async button => {
      if (button?.dataset?.action === 'delete-payment') return await permanentlyDeletePaymentV280(button.dataset.id);
      return await handleActionBeforeV280(button);
    };
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest?.('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    if (action === 'toggle-payment-schedule-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const row = button.closest('.payment-editor-row');
      const planned = q('[data-payment-field="planned"]', row);
      if (planned) {
        planned.checked = !planned.checked;
        planned.dispatchEvent(new Event('change', { bubbles: true }));
        if (planned.checked) q('[data-payment-field="dueDate"]', row)?.focus();
      }
      updatePaymentRow(row);
      return;
    }
    if (action === 'toggle-standalone-schedule-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const form = button.closest('form[data-form="payment"]');
      const planned = form?.elements?.planned;
      if (planned) {
        planned.checked = !planned.checked;
        planned.dispatchEvent(new Event('change', { bubbles: true }));
        if (planned.checked) form.elements.dueDate?.focus();
      }
      patchStandalonePayment(form);
      return;
    }
    if (action === 'focus-technical-attachments-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      const section = button.closest('form')?.querySelector('.osv-technical-attachments');
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      section?.querySelector('input[type="file"]')?.click();
      return;
    }
    if (action === 'vault-save-recovery-v280' || action === 'vault-change-password-v280') {
      event.preventDefault();
      event.stopImmediatePropagation();
      button.disabled = true;
      try { await handleVaultAction(action.includes('password') ? 'password' : 'recovery'); }
      catch (error) { toast(error.message || 'A proteção é gerenciada automaticamente pela conta Google.', 'error'); }
      finally { button.disabled = false; }
      return;
    }
  }, true);

  document.addEventListener('input', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) queueMicrotask(() => updatePaymentRow(row));
    if (event.target.closest?.('form[data-form="order"]')) schedulePatch();
    if (event.target.closest?.('form[data-form="payment"]')) schedulePatch();
  }, true);
  document.addEventListener('change', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) queueMicrotask(() => updatePaymentRow(row));
    schedulePatch();
  }, true);

  document.addEventListener('wheel', event => {
    const modalBody = event.target.closest?.('#modal-root .modal-body');
    if (!modalBody) return;
    const internal = event.target.closest?.('.has-inner-scroll-v280');
    if (internal) {
      const canDown = event.deltaY > 0 && internal.scrollTop + internal.clientHeight < internal.scrollHeight - 1;
      const canUp = event.deltaY < 0 && internal.scrollTop > 0;
      if (canDown || canUp) return;
    }
    if (modalBody.scrollHeight > modalBody.clientHeight + 2) {
      event.preventDefault();
      modalBody.scrollBy({ top: event.deltaY, behavior: 'auto' });
    }
  }, { capture: true, passive: false });

  const patchObserver = new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length || record.removedNodes.length)) schedulePatch();
  });
  [document.getElementById('root'), document.getElementById('modal-root'), document.getElementById('confirm-root')]
    .filter(Boolean)
    .forEach(target => patchObserver.observe(target, { childList: true, subtree: true }));
  window.addEventListener('resize', schedulePatch, { passive: true });
  window.MarcoV280 = Object.freeze({ version: VERSION, patchAll, paymentHasFee });
  schedulePatch();
})();

/* ===== js/v284-marco-ajustes.js ===== */
/*
 * Marco Iris Tecnologia v2.8.4
 * Ajustes finais de OSV, pagamentos, catálogo, estoque, PDF e responsividade.
 */
(() => {
  'use strict';

  const q = (selector, root = document) => root?.querySelector?.(selector) || null;
  const qa = (selector, root = document) => [...(root?.querySelectorAll?.(selector) || [])];
  const numberValue = value => typeof num === 'function' ? num(value) : Number(String(value || '').replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.')) || 0;
  const isoNow = () => typeof nowIso === 'function' ? nowIso() : new Date().toISOString();
  const currentDate = () => typeof today === 'function' ? today() : new Date().toISOString().slice(0, 10);
  const moneyText = value => typeof currency === 'function' ? currency(value) : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const hasMachineFee = method => /d[eé]bito|cr[eé]dito|outro/i.test(String(method || '')) && !/pix|dinheiro|boleto|transfer[eê]ncia/i.test(String(method || ''));
  const dispatch = (control, type = 'change') => control?.dispatchEvent(new Event(type, { bubbles: true }));
  const waitFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
  const deepClone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));

  let pendingCatalog = null;
  let pendingStockExpense = null;
  let patchScheduled = false;

  function schedulePatch() {
    if (patchScheduled) return;
    patchScheduled = true;
    requestAnimationFrame(() => {
      patchScheduled = false;
      patchAll();
    });
  }

  function patchModalHeader(modal) {
    const header = q(':scope > .modal-header', modal);
    if (!header) return;
    header.classList.add('modal-header-v284');
    const title = q(':scope > h2', header);
    if (title) title.classList.add('modal-title-v284');
    qa('[data-action="toggle-layout-v256"], [data-action="toggle-form-layout"], [data-action="open-osv-layout-editor"]', header)
      .forEach(button => button.classList.add('modal-layout-v284'));
    const close = q('[data-action="close-modal"]', header);
    if (close) close.classList.add('modal-close-v284');
  }

  function patchOrderDetail(modal) {
    if (!modal?.classList.contains('order-detail-v280')) return;
    const heroToolbar = q('.detail-hero > .toolbar', modal);
    const statusHost = heroToolbar?.lastElementChild;
    if (statusHost && statusHost !== heroToolbar?.firstElementChild) statusHost.classList.add('order-hero-status-v284');

    const paymentButton = q('[data-action="new-payment"]', modal);
    if (paymentButton && paymentButton.dataset.v284PaymentLabel !== '1') {
      paymentButton.innerHTML = `${typeof icon === 'function' ? icon('plus', 18) : '+'} <span>Pagamento</span>`;
      paymentButton.title = 'Pagamento';
      paymentButton.setAttribute('aria-label', 'Pagamento');
      paymentButton.dataset.v284PaymentLabel = '1';
    }
    refreshPdfButtons(modal);
  }

  function refreshPdfButtons(root = document) {
    qa('[data-action="view-current-pdf"]', root).forEach(button => {
      const orderId = button.dataset.id;
      if (!orderId || typeof findOrder !== 'function') return;
      const order = findOrder(orderId);
      const hasPdf = Array.isArray(order?.pdfs) && order.pdfs.some(pdf => pdf && pdf.official !== false);
      button.disabled = !hasPdf;
      button.classList.toggle('is-disabled', !hasPdf);
      button.title = hasPdf ? 'Visualizar PDF' : 'Gere o PDF para visualizar';
      button.setAttribute('aria-label', button.title);
    });
  }

  function patchOrderTable(root = document) {
    qa('.osv-table tbody td:nth-child(4)', root).forEach(cell => {
      qa(':scope > .inline-dot-v280', cell).forEach(dot => dot.remove());
      const small = q(':scope > small.muted', cell);
      if (small) {
        const cleaned = small.textContent.replace(/^\s*[•●·]\s*/, ' · ');
        if (cleaned !== small.textContent) small.textContent = cleaned;
      }
      cell.dataset.v280Separator = '1';
    });
  }

  function patchStockCheck(row) {
    const label = q('.stock-check', row);
    const input = q('[data-item-field="stock"]', label);
    if (!label || !input) return;
    label.title = 'Baixar estoque';
    label.setAttribute('aria-label', 'Baixar estoque');
    label.classList.add('stock-check-v284');
    if (q('.stock-check-content-v284', label)) return;
    const content = document.createElement('span');
    content.className = 'stock-check-content-v284';
    content.innerHTML = `${typeof icon === 'function' ? icon('stock', 17) : '↧'}<span>Baixar estoque</span>`;
    label.replaceChildren(input, content);
  }

  function patchOrderItem(row) {
    if (!row) return;
    patchStockCheck(row);
    const field = q('.item-name', row);
    const select = q('[data-item-field="ref"]', field);
    if (!field || !select || q('[data-action="open-full-catalog-v284"]', field)) return;
    field.classList.add('item-name-v284');
    const control = document.createElement('div');
    control.className = 'item-select-control-v284';
    select.before(control);
    control.appendChild(select);
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn secondary compact item-catalog-add-v284';
    add.dataset.action = 'open-full-catalog-v284';
    add.title = 'Cadastrar e selecionar no catálogo';
    add.setAttribute('aria-label', add.title);
    add.innerHTML = typeof icon === 'function' ? icon('plus', 17) : '+';
    control.appendChild(add);
  }

  function addCalculatedFeeLine(row) {
    const summary = q('.payment-summary-box-v280', row);
    if (!summary || q('[data-payment-calculated-fee]', summary)) return;
    const line = document.createElement('div');
    line.className = 'payment-summary-line-v280 payment-fee-line-v284';
    line.innerHTML = `<small>Taxa calculada</small><strong data-payment-calculated-fee>${moneyText(0)}</strong>`;
    const gross = q('.payment-gross-line-v280', summary);
    summary.insertBefore(line, gross || summary.lastElementChild);
  }

  function updatePaymentRow(row) {
    const method = q('[data-payment-field="method"]', row)?.value || '';
    const value = numberValue(q('[data-payment-field="value"]', row)?.value);
    const grossInput = q('[data-payment-field="fee"]', row);
    const machine = hasMachineFee(method);
    let enteredGross = machine ? numberValue(grossInput?.value) : value;
    if (machine && grossInput && enteredGross < value) {
      if (window.MarcoMoney?.setValue) window.MarcoMoney.setValue(grossInput, value);
      else grossInput.value = String(value.toFixed(2)).replace('.', ',');
      enteredGross = value;
    }
    const gross = machine ? Math.max(value, enteredGross || value) : value;
    const fee = Math.max(0, gross - value);
    const grossOutput = q('[data-payment-gross]', row);
    const feeOutput = q('[data-payment-calculated-fee]', row);
    if (grossOutput) { const text = moneyText(gross); if (grossOutput.textContent !== text) grossOutput.textContent = text; }
    if (feeOutput) { const text = moneyText(fee); if (feeOutput.textContent !== text) feeOutput.textContent = text; }
    const feeLine = q('.payment-fee-line-v284', row);
    if (feeLine) feeLine.hidden = !machine;
    const label = grossInput?.closest('.fee-field')?.querySelector('label');
    if (label && label.textContent !== 'Valor com taxa') label.textContent = 'Valor com taxa';
  }

  function patchOrderForm(form) {
    if (!form) return;
    q('[data-action="toggle-quick-catalog-create"]', form)?.remove();
    q('[data-quick-catalog-panel]', form)?.remove();
    qa('.item-editor-row', form).forEach(patchOrderItem);
    qa('.payment-editor-row', form).forEach(row => {
      const input = q('[data-payment-field="fee"]', row);
      const label = input?.closest('.fee-field')?.querySelector('label');
      if (label && label.textContent !== 'Valor com taxa') label.textContent = 'Valor com taxa';
      addCalculatedFeeLine(row);
      updatePaymentRow(row);
    });
  }

  function patchProductForm(form) {
    if (!form || form.dataset.id || q('[name="generateInitialStockExpense"]', form)) return;
    const grid = q('.product-form-grid', form) || q('.form-grid', form);
    if (!grid) return;
    const option = document.createElement('label');
    option.className = 'field full linked-expense-option-v284';
    option.innerHTML = `<span class="linked-expense-control-v284"><input type="checkbox" name="generateInitialStockExpense"><span><strong>Gerar despesa da compra do estoque inicial</strong><small>Ao salvar, o lançamento completo de despesa será aberto e ficará vinculado ao produto e à movimentação.</small></span></span>`;
    grid.appendChild(option);
  }

  function patchStockMovementForm(form) {
    if (!form || form.dataset.id || q('[name="generateStockExpense"]', form)) return;
    const grid = q('.movement-grid', form) || q('.form-grid', form);
    if (!grid) return;
    const option = document.createElement('label');
    option.className = 'field full linked-expense-option-v284';
    option.innerHTML = `<span class="linked-expense-control-v284"><input type="checkbox" name="generateStockExpense"><span><strong>Gerar despesa desta compra de estoque</strong><small>Disponível para entradas. A despesa será criada e vinculada a esta movimentação.</small></span></span>`;
    grid.appendChild(option);
    const movementType = form.elements.movementType;
    const sync = () => {
      const isEntry = movementType?.value !== 'Saída';
      option.hidden = !isEntry;
      option.classList.toggle('is-hidden', !isEntry);
      option.querySelector('input').disabled = !isEntry;
      if (!isEntry) option.querySelector('input').checked = false;
    };
    movementType?.addEventListener('change', sync);
    sync();
  }

  function patchStandalonePayment(form) {
    if (!form) return;
    const field = q('.payment-fee', form);
    const label = q('label', field);
    if (label && label.textContent !== 'Valor com taxa') label.textContent = 'Valor com taxa';
    const input = form.elements?.fee;
    if (input) input.dataset.grossValueInput = 'true';
  }

  function patchAll() {
    qa('#modal-root .modal').forEach(modal => {
      patchModalHeader(modal);
      patchOrderDetail(modal);
    });
    qa('form[data-form="order"]').forEach(patchOrderForm);
    qa('form[data-form="product"]').forEach(patchProductForm);
    qa('form[data-form="stock-movement"]').forEach(patchStockMovementForm);
    qa('form[data-form="payment"]').forEach(patchStandalonePayment);
    patchOrderTable(document);
    refreshPdfButtons(document);
  }

  async function findOrderForm(attempts = 80) {
    for (let index = 0; index < attempts; index += 1) {
      const form = q('#modal-root form[data-form="order"]');
      if (form) return form;
      await waitFrame();
    }
    return null;
  }

  async function resumeCatalogSelection(context, newId) {
    if (!context || !newId || !window.MarcoOrderFormBridge?.resume) return;
    window.MarcoOrderFormBridge.resume(context.ticket);
    const form = await findOrderForm();
    if (!form) {
      typeof toast === 'function' && toast('O item foi salvo, mas não foi possível reabrir a OSV automaticamente.', 'warn');
      return;
    }
    let rows = qa('.item-editor-row', form);
    while (rows.length <= context.rowIndex) {
      q('[data-action="add-item-row"]', form)?.click();
      await waitFrame();
      rows = qa('.item-editor-row', form);
    }
    const row = rows[context.rowIndex] || rows.at(-1);
    const type = q('[data-item-field="type"]', row);
    if (type) {
      type.value = context.type;
      dispatch(type);
    }
    await waitFrame();
    const ref = q('[data-item-field="ref"]', row);
    if (ref) {
      ref.value = newId;
      dispatch(ref);
    }
    patchOrderItem(row);
    if (typeof updateOrderFormTotal === 'function') updateOrderFormTotal();
    row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    typeof toast === 'function' && toast(`${context.type} cadastrado e selecionado na OSV.`, 'ok');
  }

  async function openCatalogForRow(button) {
    const row = button.closest('.item-editor-row');
    const form = button.closest('form[data-form="order"]');
    if (!row || !form || !window.MarcoOrderFormBridge?.suspend) return;
    const type = q('[data-item-field="type"]', row)?.value === 'Produto' ? 'Produto' : 'Serviço';
    const rowIndex = qa('.item-editor-row', form).indexOf(row);
    const ticket = await window.MarcoOrderFormBridge.suspend();
    if (!ticket) return;
    pendingCatalog = { type, rowIndex, ticket };
    if (type === 'Produto') openProductForm('');
    else openServiceForm('');
    schedulePatch();
  }

  function setMoney(input, value) {
    if (!input) return;
    if (window.MarcoMoney?.setValue) window.MarcoMoney.setValue(input, value, { touch: true });
    else input.value = String(value.toFixed(2)).replace('.', ',');
    dispatch(input, 'input');
  }

  function catalogRecord(type, itemId) {
    const store = typeof data === 'function' ? data() : null;
    return type === 'Insumo'
      ? store?.supplies?.find(item => item.id === itemId)
      : store?.products?.find(item => item.id === itemId);
  }

  function stockBalance(type, itemId) {
    const store = typeof data === 'function' ? data() : null;
    return (store?.stockMovements || [])
      .filter(movement => movement.itemType === type && (type === 'Produto' ? movement.productId === itemId : movement.supplyId === itemId))
      .reduce((balance, movement) => balance + (/entrada/i.test(movement.movementType || '') ? 1 : -1) * numberValue(movement.quantity), 0);
  }

  function recalculateStock(type, itemId) {
    const store = typeof data === 'function' ? data() : null;
    const rows = (store?.stockMovements || [])
      .filter(movement => movement.itemType === type && (type === 'Produto' ? movement.productId === itemId : movement.supplyId === itemId))
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true }));
    let balance = 0;
    rows.forEach(movement => {
      movement.stockBefore = balance;
      balance += (/entrada/i.test(movement.movementType || '') ? 1 : -1) * numberValue(movement.quantity);
      movement.stockAfter = balance;
    });
  }

  function productPayloadFromForm(form) {
    const values = Object.fromEntries(new FormData(form));
    const description = String(values.description || '').trim();
    const cost = Math.max(0, numberValue(values.cost));
    const initialStock = Math.max(0, numberValue(values.initialStock));
    if (!description) throw new Error('Informe a descrição do produto.');
    if (initialStock <= 0) throw new Error('Informe um estoque inicial maior que zero para gerar a despesa.');
    if (cost <= 0) throw new Error('Informe o custo do produto para calcular a despesa do estoque inicial.');
    return { values, description, cost, initialStock };
  }

  function movementPayloadFromForm(form) {
    const values = Object.fromEntries(new FormData(form));
    const type = values.itemType === 'Insumo' ? 'Insumo' : 'Produto';
    const item = catalogRecord(type, values.itemId);
    const quantity = Math.max(0, numberValue(values.quantity));
    if (values.movementType === 'Saída') throw new Error('A geração de despesa está disponível apenas para entradas de estoque.');
    if (!item) throw new Error('Selecione um item válido.');
    if (quantity <= 0) throw new Error('Informe uma quantidade maior que zero.');
    const cost = Math.max(0, numberValue(item.cost));
    if (cost <= 0) throw new Error('O item precisa ter custo cadastrado para gerar a despesa.');
    return { values, type, item, quantity, cost };
  }

  function openStockExpense(flow) {
    pendingStockExpense = flow;
    openPaymentForm('', flow.orderId || '');
    requestAnimationFrame(() => {
      const form = q('#modal-root form[data-form="payment"]');
      if (!form || pendingStockExpense !== flow) return;
      form.dataset.stockExpenseFlowV284 = 'true';
      const modalTitle = q('#modal-root .modal-header h2');
      if (modalTitle) modalTitle.textContent = 'Despesa da compra de estoque';
      const type = form.elements.type;
      if (type) { type.value = 'Despesa'; dispatch(type); }
      const method = form.elements.paymentMethod;
      if (method) { method.value = 'Pix'; dispatch(method); }
      const paymentDate = form.elements.paymentDate;
      if (paymentDate) paymentDate.value = currentDate();
      const settlement = form.elements.settlementState;
      if (settlement) { settlement.value = 'paid'; dispatch(settlement); }
      if (form.elements.planned) form.elements.planned.checked = false;
      setMoney(form.elements.value, flow.totalCost);
      setMoney(form.elements.fee, flow.totalCost);
      if (form.elements.expenseName) form.elements.expenseName.value = `Compra de estoque — ${flow.description}`;
      if (form.elements.localPurchase) form.elements.localPurchase.value = flow.supplier || '';
      if (form.elements.expenseCategory) form.elements.expenseCategory.value = 'Estoque';
      if (form.elements.notes) form.elements.notes.value = flow.notes || '';
      const grid = q('.payment-form-grid', form) || q('.form-grid', form);
      if (grid && !q('.stock-expense-callout-v284', form)) {
        const callout = document.createElement('div');
        callout.className = 'field full stock-expense-callout-v284';
        callout.innerHTML = `<strong>Compra vinculada ao estoque</strong><span>${flow.quantity} unidade(s) · custo total ${moneyText(flow.totalCost)}. Ao salvar, produto/movimentação/despesa serão gravados e vinculados.</span>`;
        grid.prepend(callout);
      }
      dispatch(form.elements.value, 'input');
      schedulePatch();
    });
  }

  function createPendingStockRecords(flow, paymentId) {
    const store = data();
    if (flow.kind === 'new-product') {
      const values = flow.payload.values;
      const margin = Math.min(0.99, Math.max(0, numberValue(values.margin) / 100));
      const productId = flow.productId;
      if (store.products.some(product => product.id === productId)) throw new Error('O código do produto já foi utilizado. Reabra o cadastro e tente novamente.');
      const product = {
        id: productId,
        description: flow.payload.description,
        brand: values.brand || '',
        supplier: values.supplier || '',
        cost: flow.payload.cost,
        margin,
        suggestedPrice: margin >= 0.99 ? flow.payload.cost / 0.01 : flow.payload.cost / (1 - margin),
        salePrice: numberValue(values.salePrice),
        initialStock: 0,
        minimumStock: values.minimumStock === '' ? '' : numberValue(values.minimumStock),
        costUpdatedAt: currentDate(),
        priceUpdatedAt: currentDate(),
        status: values.status || 'Ativo',
        createdAt: isoNow(),
        updatedAt: isoNow(),
        initialStockExpenseId: paymentId
      };
      const movement = {
        id: flow.movementId,
        itemType: 'Produto',
        productId,
        supplyId: '',
        movementType: 'Entrada',
        quantity: flow.quantity,
        date: currentDate(),
        orderId: '',
        notes: 'Estoque inicial do cadastro com despesa vinculada',
        stockBefore: 0,
        stockAfter: flow.quantity,
        sourceItemId: '',
        origin: 'initial-stock-purchase',
        expenseId: paymentId,
        createdAt: isoNow(),
        updatedAt: isoNow()
      };
      store.products.push(product);
      store.stockMovements.push(movement);
      return { product, movement, itemType: 'Produto', itemId: productId };
    }

    const type = flow.payload.type;
    const itemId = flow.payload.values.itemId;
    const before = stockBalance(type, itemId);
    const movement = {
      id: flow.movementId,
      itemType: type,
      productId: type === 'Produto' ? itemId : '',
      supplyId: type === 'Insumo' ? itemId : '',
      movementType: 'Entrada',
      quantity: flow.quantity,
      date: flow.payload.values.date || currentDate(),
      orderId: flow.payload.values.orderId || '',
      notes: flow.payload.values.notes || 'Compra de estoque com despesa vinculada',
      stockBefore: before,
      stockAfter: before + flow.quantity,
      sourceItemId: '',
      origin: 'stock-purchase',
      expenseId: paymentId,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };
    store.stockMovements.push(movement);
    recalculateStock(type, itemId);
    return { movement, itemType: type, itemId };
  }

  function patchPaymentLink(payment, records, flow) {
    if (!payment) return;
    payment.stockPurchase = true;
    payment.origin = 'stock-purchase';
    payment.stockMovementId = records.movement.id;
    payment.stockProductId = records.itemType === 'Produto' ? records.itemId : '';
    payment.stockSupplyId = records.itemType === 'Insumo' ? records.itemId : '';
    payment.updatedAt = isoNow();
    records.movement.expenseId = payment.id;
    if (records.product) records.product.initialStockExpenseId = payment.id;
    payment.notes = String(payment.notes || flow.notes || '').trim();
  }

  const baseSaveServiceForm = window.saveServiceForm;
  if (typeof baseSaveServiceForm === 'function') {
    window.saveServiceForm = async function saveServiceFormV284(form) {
      const isNew = !form.dataset.id;
      const expectedId = isNew ? (q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('SRV', data().services)) : form.dataset.id;
      const context = isNew && pendingCatalog?.type === 'Serviço' ? pendingCatalog : null;
      const result = await baseSaveServiceForm(form);
      if (context) {
        pendingCatalog = null;
        await resumeCatalogSelection(context, expectedId);
      }
      return result;
    };
  }

  const baseSaveProductForm = window.saveProductForm;
  if (typeof baseSaveProductForm === 'function') {
    window.saveProductForm = async function saveProductFormV284(form) {
      const isNew = !form.dataset.id;
      const generateExpense = isNew && !!form.elements.generateInitialStockExpense?.checked;
      if (generateExpense) {
        const payload = productPayloadFromForm(form);
        const productId = q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('PRD', data().products);
        const movementId = nextCode('MOV', data().stockMovements);
        const catalogContext = pendingCatalog?.type === 'Produto' ? pendingCatalog : null;
        pendingCatalog = null;
        openStockExpense({
          kind: 'new-product',
          payload,
          productId,
          movementId,
          quantity: payload.initialStock,
          totalCost: payload.cost * payload.initialStock,
          description: payload.description,
          supplier: payload.values.supplier || '',
          orderId: '',
          notes: `Compra do estoque inicial de ${payload.description} (${payload.initialStock} unidade(s)).`,
          catalogContext
        });
        return;
      }
      const expectedId = isNew ? (q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('PRD', data().products)) : form.dataset.id;
      const context = isNew && pendingCatalog?.type === 'Produto' ? pendingCatalog : null;
      const result = await baseSaveProductForm(form);
      if (context) {
        pendingCatalog = null;
        await resumeCatalogSelection(context, expectedId);
      }
      return result;
    };
  }

  const baseSaveStockMovement = window.saveStockMovement;
  if (typeof baseSaveStockMovement === 'function') {
    window.saveStockMovement = async function saveStockMovementV284(form) {
      const generateExpense = !form.dataset.id && !!form.elements.generateStockExpense?.checked;
      if (!generateExpense) return baseSaveStockMovement(form);
      const payload = movementPayloadFromForm(form);
      const movementId = q('.osv-code-preview strong', form)?.textContent.trim() || nextCode('MOV', data().stockMovements);
      openStockExpense({
        kind: 'stock-entry',
        payload,
        movementId,
        quantity: payload.quantity,
        totalCost: payload.cost * payload.quantity,
        description: payload.item.description || payload.item.name || payload.item.id,
        supplier: payload.item.supplier || '',
        orderId: payload.values.orderId || '',
        notes: payload.values.notes || `Compra de estoque de ${payload.item.description || payload.item.id}.`,
        catalogContext: null
      });
    };
  }

  const baseSavePaymentForm = window.savePaymentForm;
  if (typeof baseSavePaymentForm === 'function') {
    window.savePaymentForm = async function savePaymentFormV284(form) {
      const flow = pendingStockExpense;
      if (!flow || form.dataset.stockExpenseFlowV284 !== 'true') return baseSavePaymentForm(form);
      const profileId = typeof activeProfile === 'function' ? activeProfile().id : null;
      const snapshot = deepClone(data());
      const paymentId = q('[data-payment-id-preview]', form)?.value || nextCode('DES', data().payments);
      let records = null;
      let baseCompleted = false;
      try {
        records = createPendingStockRecords(flow, paymentId);
        const result = await baseSavePaymentForm(form);
        baseCompleted = true;
        const payment = data().payments.find(item => item.id === paymentId);
        if (!payment) throw new Error('A despesa foi salva, mas o vínculo com o estoque não foi encontrado.');
        patchPaymentLink(payment, records, flow);
        await persist('Compra de estoque vinculada', `${payment.id} · ${records.movement.id} · ${flow.description}`);
        pendingStockExpense = null;
        if (typeof renderView === 'function') renderView();
        typeof toast === 'function' && toast('Produto, estoque e despesa salvos e vinculados.', 'ok');
        if (flow.catalogContext) await resumeCatalogSelection(flow.catalogContext, flow.productId);
        return result;
      } catch (error) {
        if (!baseCompleted && profileId && typeof STATE === 'object' && STATE?.dataByProfile) {
          STATE.dataByProfile[profileId] = snapshot;
        }
        throw error;
      }
    };
  }

  const baseGeneratePdf = window.generatePdfForOrder;
  if (typeof baseGeneratePdf === 'function') {
    window.generatePdfForOrder = async function generatePdfForOrderV284(...args) {
      const result = await baseGeneratePdf(...args);
      refreshPdfButtons(document);
      schedulePatch();
      return result;
    };
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('button,[data-action]');
    if (!button) return;
    if (button.dataset.action === 'open-full-catalog-v284') {
      event.preventDefault();
      event.stopImmediatePropagation();
      try { await openCatalogForRow(button); }
      catch (error) { typeof toast === 'function' && toast(error.message || 'Não foi possível abrir o cadastro.', 'error'); }
      return;
    }

    if (button.dataset.action === 'close-modal') {
      const paymentForm = button.closest('form[data-form="payment"][data-stock-expense-flow-v284="true"]');
      const catalogForm = button.closest('form[data-form="service"], form[data-form="product"]');
      if (paymentForm && pendingStockExpense) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const context = pendingStockExpense.catalogContext;
        pendingStockExpense = null;
        await Promise.resolve(closeModal({ reason: 'replace-modal', immediate: true }));
        if (context) window.MarcoOrderFormBridge?.resume?.(context.ticket);
        return;
      }
      if (catalogForm && pendingCatalog) {
        event.preventDefault();
        event.stopImmediatePropagation();
        const context = pendingCatalog;
        pendingCatalog = null;
        await Promise.resolve(closeModal({ reason: 'replace-modal', immediate: true }));
        window.MarcoOrderFormBridge?.resume?.(context.ticket);
      }
    }
  }, true);

  document.addEventListener('input', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) updatePaymentRow(row);
  }, true);
  document.addEventListener('change', event => {
    const row = event.target.closest?.('.payment-editor-row');
    if (row) {
      updatePaymentRow(row);
      schedulePatch();
    }
    if (event.target.matches?.('[data-item-field="type"]')) schedulePatch();
  }, true);

  const observer = new MutationObserver(records => {
    if (records.some(record => record.addedNodes.length || record.removedNodes.length)) schedulePatch();
  });
  [document.getElementById('root'), document.getElementById('modal-root')]
    .filter(Boolean)
    .forEach(target => observer.observe(target, { subtree: true, childList: true }));
  window.addEventListener('resize', schedulePatch, { passive: true });
  window.addEventListener('load', schedulePatch, { once: true });
  schedulePatch();

  window.MarcoV284 = { version: '2.8.4', patchAll, refreshPdfButtons };
})();
