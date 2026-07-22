/* Borion Finance — Eventos dinâmicos, splash, inicialização e PWA/service worker. */

/* ---------------- Wire dynamic view-level events ---------------- */
function wireViewEvents(){
  const fontSel = $('#cfg_font');
  if(fontSel) fontSel.onchange = ()=>{
    S.config.font = fontSel.value;
    setConfig(S.config);
    applyFont();
    toast('Fonte atualizada.');
  };
  const themeSel = $('#cfg_theme');
  if(themeSel) themeSel.onchange = ()=>{
    S.config.theme = themeSel.value;
    setConfig(S.config);
    applyTheme();
    toast('Tema atualizado.');
  };
  const uiModeSel = $('#cfg_ui_mode');
  if(uiModeSel) uiModeSel.onchange = ()=>{
    S.config.uiMode = uiModeSel.value;
    setConfig(S.config);
    applyInterfaceMode();
    renderApp();
    toast(resolvedInterfaceMode()==='smartphone'?'Smartphone Mode ativado.':'Modo Pro ativado.');
  };
  const popupDur = $('#cfg_popup_duration');
  if(popupDur) popupDur.onchange = ()=>{
    if(!S.config.popupNotifs) S.config.popupNotifs={enabled:true,durationMs:40000};
    S.config.popupNotifs.durationMs = Number(popupDur.value)||40000;
    setConfig(S.config);
    toast('Tempo dos popups atualizado.');
  };
  Object.keys(ICON_COLOR_LABELS).forEach(key=>{
    const inp = $('#ic_'+key);
    if(inp) inp.onchange = ()=>{
      if(!S.config.iconColors) S.config.iconColors = Object.assign({}, DEFAULT_ICON_COLORS);
      S.config.iconColors[key] = inp.value;
      setConfig(S.config);
      renderView();
    };
  });
  ['import_file','import_file_backup','import_file_cloud'].forEach(fid=>{
    const input = $('#'+fid);
    if(!input) return;
    input.onchange = (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        try{
          const obj = JSON.parse(reader.result);
          handleImport(obj);
        }catch(err){ alert('Arquivo inválido ou corrompido.'); }
      };
      reader.readAsText(file);
      input.value='';
    };
  });
}

/* A implementação de handleImport() fica mais abaixo, perto do boot/PWA
   (função única, com o fluxo "logado na nuvem" ciente do perfil ativo). */

/* ---------------- BOOT VISUAL REAL ---------------- */
function showSplash(next){
  if(window.BootProgress)BootProgress.start({stage:'prepare'});
  Promise.resolve().then(next);
}

/* ---------------- Aviso de salvamento final ao sair ---------------- */
/* V6.19.0 — Ctrl+S: força um salvamento imediato, adaptado ao modo de armazenamento
   atual. No Google Drive, ignora de propósito a checagem de conflito (a pessoa está
   dizendo explicitamente "quero que a minha versão valha"). */
let forceManualSaveInFlight=null;
async function forceManualSave(){
  if(forceManualSaveInFlight) return forceManualSaveInFlight;
  forceManualSaveInFlight=(async()=>{
    try{
      const backupModule = window.Settings || (typeof Settings!=='undefined' ? Settings : null);
      if(backupModule && typeof backupModule.manualBackup==='function'){
        const result=await backupModule.manualBackup({targets:'both',reason:'manual_drive_local',interactive:true});
        if(!result || (!result.driveOk && !result.localOk)) throw new Error('nenhum destino confirmou o backup');
        return result;
      }
      throw new Error('o módulo de backup manual não foi carregado');
    }catch(e){
      toast('Falha ao salvar: '+(e&&e.message?e.message:String(e)));
      return null;
    }finally{
      forceManualSaveInFlight=null;
    }
  })();
  return forceManualSaveInFlight;
}

const ExitSaveGuard = {
  dismissed:false,
  saving:false,
  getEl(){ return document.getElementById('exit-save-banner'); },
  /* V6.16.0 — o banner "Confirme o salvamento" foi removido a pedido: o salvamento já
     é automático e silencioso (ver finalSaveSilently, chamado em beforeunload/
     visibilitychange/pagehide) — não faz sentido também pedir confirmação manual. O
     indicador visual agora é só o selo pequeno no topo do app ("salvando..."). */
  shouldShow(){ return false; },
  refresh(){
    const old = this.getEl();
    if(old) old.remove();
  },
  finalSaveSilently(reason='exit'){
    try{
      // V6.17.0 — bug real corrigido: isso rodava em TODO Alt-Tab (tab ficando
      // oculta), mesmo sem nada pra salvar — forçando uma checagem de token do
      // Google a cada vez, o que podia acabar abrindo/piscando a janela de login do
      // Google. Agora só faz alguma coisa se existir mesmo uma alteração pendente.
      if(!(S && S.currentProfile && S.data && hasExitSavePending(S.currentProfile.id))) return;
      confirmFinalSave(reason);
      if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected()) GoogleDriveProvider.syncNow();
    }catch(e){ console.warn('[BORION_EXIT_SAVE][SILENT_WARN]', e); }
  }
};
window.ExitSaveGuard = ExitSaveGuard;

window.addEventListener('beforeunload', e=>{
  if(!(S && S.currentProfile && S.data && hasExitSavePending(S.currentProfile.id))) return;
  ExitSaveGuard.finalSaveSilently('beforeunload');
  // V6.16.0 — removido o e.preventDefault()/returnValue que mostrava o diálogo nativo
  // "tem certeza que quer sair?" do navegador. O salvamento acima já é automático e
  // silencioso; a confirmação manual não faz mais sentido.
});
window.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState==='visible'){
    ExitSaveGuard.refresh();
    if(typeof window.syncGlobalScrollLockState==='function') window.syncGlobalScrollLockState({source:'boot.visibility'});
  }
  if(document.visibilityState==='hidden') ExitSaveGuard.finalSaveSilently('visibilitychange');
});
window.addEventListener('pagehide', ()=> ExitSaveGuard.finalSaveSilently('pagehide'));

/* V6.20.0 — bug real corrigido: "atualizar a página e voltar (botão Voltar do
   navegador) mostra uma versão antiga, atualizar de novo mostra a certa". Causa: o
   navegador pode restaurar a página inteira a partir do bfcache (back-forward cache)
   ao usar o botão Voltar depois de um F5 — isso NÃO reexecuta o boot() abaixo nem
   `loadFromDrive()`, só devolve o DOM/estado congelado de um instante anterior (que
   podia ser de antes do current.json terminar de sincronizar). Um F5 de verdade
   corrige na hora porque aí sim o boot roda de novo do zero e busca o current.json
   mais recente — daí a impressão de "só corrige na segunda vez". O evento `pageshow`
   com `event.persisted===true` é como o navegador avisa "essa página veio do
   bfcache" — usamos isso pra forçar um reload de verdade e garantir que o app sempre
   mostra o estado mais recente, nunca um congelado. */
window.addEventListener('pageshow', (e)=>{
  if(e.persisted) location.reload();
});

/* ---------------- BOOT ---------------- */
let borionServiceWorkerPromise=null;
function registerBorionServiceWorker642(){
  if(borionServiceWorkerPromise)return borionServiceWorkerPromise;
  if(!('serviceWorker' in navigator))return Promise.resolve(null);
  borionServiceWorkerPromise=navigator.serviceWorker.register('sw.js?v=6.45.5',{updateViaCache:'none'})
    .then(registration=>{registration.update().catch(()=>{});let lastCheck=Date.now();document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastCheck>30*60*1000){lastCheck=Date.now();registration.update().catch(()=>{});}});return registration;})
    .catch(err=>{console.warn('SW falhou:',err);return null;});
  return borionServiceWorkerPromise;
}

function borionBootTaskTimeout(promise,timeoutMs,code,message){
  let timer=null;
  return Promise.race([
    Promise.resolve(promise),
    new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error(message||'Uma etapa local demorou além do limite seguro.'),{code:code||'BOOT_TASK_TIMEOUT'})),timeoutMs);})
  ]).finally(()=>{if(timer)clearTimeout(timer);});
}

let borionBootRunning=false;
async function runBorionBoot642(){
  if(borionBootRunning)return;
  borionBootRunning=true;
  const storageMode=getStorageMode();
  const retry=()=>runBorionBoot642();
  const reconnect=async()=>{
    const result=await GoogleDriveProvider.connect(true,{suppressRender:true});
    if(window.BootProgress)await BootProgress.complete();
    if(result&&result.empty)renderGoogleDriveOnboarding();else{S.gate={mode:'list',error:''};renderGate();}
  };
  const back=()=>{if(window.returnToSimpleGoogleLogin)return window.returnToSimpleGoogleLogin();try{setStorageMode(null);}catch(e){}CloudAuth.mode='login';CloudAuth.error='';CloudAuth.info='';CloudAuth.emailExpanded=false;CloudAuth.render();};
  if(window.BootProgress)BootProgress.start({storageMode,stage:'prepare',retry,reconnect,back});
  try{
    applyFont();applyTheme();applyInterfaceMode();
    if(window.BootProgress)BootProgress.setStage('device');
    // Backup local e atualização do service worker são importantes, porém não
    // bloqueiam login nem seletor. As falhas ficam registradas e são retomadas depois.
    const backupFolderInit=Promise.resolve().then(()=>window.BackupFS&&BackupFS.init?BackupFS.init():null).catch(e=>{if(window.BorionPerf)BorionPerf.event('backup_init_deferred',{error:String(e&&e.message||e)});return null;});
    const swInit=registerBorionServiceWorker642();
    const deviceInit=borionBootTaskTimeout((async()=>{if(window.BorionDevice640){await BorionDevice640.getOrCreateDeviceId();BorionDevice640.newSessionId();}return true;})(),10000,'DEVICE_STORAGE_TIMEOUT','O identificador seguro deste dispositivo demorou além do limite.');
    const queueInit=borionBootTaskTimeout((async()=>{if(window.BorionDurableQueue){const stuck=await BorionDurableQueue.pendingOnly();if(stuck.length&&window.BorionPerf)BorionPerf.event('durable_queue_recovery',{count:stuck.length});}return true;})(),10000,'DURABLE_QUEUE_TIMEOUT','A fila segura de alterações demorou além do limite.');
    const localPrep=Promise.resolve(true);
    // Evita rejeições em tarefas de fundo sem bloquear o caminho crítico.
    backupFolderInit.catch(()=>{});swInit.catch(()=>{});queueInit.catch(()=>{});
    if(window.BootProgress)BootProgress.setStage('storage',{detail:'Preparando armazenamento local e verificando pendências'});

    if(storageMode==='google_drive'){
      // Identity, deviceId e IndexedDB são preparados em paralelo. BackupFS e SW
      // continuam em segundo plano e não seguram a conexão com o Google.
      const identity=GoogleDriveAuth.ensureIdentityLoaded();
      const prep=await Promise.allSettled([deviceInit,queueInit,localPrep,identity]);
      const criticalFailure=prep.find(x=>x.status==='rejected');
      if(criticalFailure)throw criticalFailure.reason;
      const result=await GoogleDriveProvider.connect(false,{suppressRender:true});
      if(window.BootProgress){BootProgress.setStage('render');await BootProgress.complete();}
      if(result&&result.empty)renderGoogleDriveOnboarding();else{S.gate={mode:'list',error:''};renderGate();}
      ExitSaveGuard.refresh();
      return;
    }

    if(storageMode==='offline'){
      await Promise.allSettled([deviceInit,localPrep]);
      if(window.BootProgress){BootProgress.setStage('render',{detail:'Preparando seus perfis deste dispositivo'});await BootProgress.complete();}
      enterLocalMode();return;
    }

    const recovery=/type=recovery|password_recovery|PASSWORD_RECOVERY/i.test(location.hash+location.search);
    if(storageMode==='cloud'||storageMode==='supabase'||recovery){
      await Promise.allSettled([deviceInit,localPrep]);
      if(window.BootProgress)BootProgress.setStage('google_identity',{label:'Conectando à nuvem Borion',detail:'Carregando o acesso do Supabase'});
      await CloudStorage.init({force:true});
      if(window.BootProgress)await BootProgress.complete();
      if(CloudStorage.user&&CloudStorage.recoveryMode){CloudAuth.mode='changePassword';CloudAuth.info='Digite uma nova senha para finalizar a recuperação.';CloudAuth.error='';CloudAuth.render();return;}
      if(CloudStorage.user){await enterCloudUser();ExitSaveGuard.refresh();if(CloudStorage.deleteEmailReturnPending&&window.Settings&&Settings.resumeDeleteAccountFromMagicLink)setTimeout(()=>Settings.resumeDeleteAccountFromMagicLink(),120);return;}
      CloudAuth.render();return;
    }

    // Primeira abertura: nenhum SDK remoto é baixado antes da escolha do usuário.
    await Promise.allSettled([deviceInit,localPrep]);
    if(window.BootProgress)await BootProgress.complete();
    CloudAuth.render();
  }catch(error){
    if(window.BootProgress)BootProgress.fail(error,{retry,reconnect,back,allowBack:true});
    else renderGoogleDriveReconnect(error&&error.message||String(error));
  }finally{borionBootRunning=false;}
}

(function boot(){
  Notifs.closePanelOnOutsideClick();
  BankFilter.closePanelOnOutsideClick();
  document.addEventListener('click',GlobalSearch.outsideClickHandler);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&window.MobileMenu)MobileMenu.close();});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S')){e.preventDefault();forceManualSave();}});
  window.addEventListener('resize',()=>{if(window.innerWidth>980&&window.MobileMenu)MobileMenu.close();else if(typeof window.syncGlobalScrollLockState==='function')window.syncGlobalScrollLockState({source:'boot.resize'});});
  if(window.matchMedia){const mq=window.matchMedia('(prefers-color-scheme: light)');const handler=()=>{if(S.config&&S.config.theme==='system')applyTheme();};if(mq.addEventListener)mq.addEventListener('change',handler);else if(mq.addListener)mq.addListener(handler);}
  runBorionBoot642();
})();

/* ---- PWA registrado de forma não bloqueante por registerBorionServiceWorker642(). ---- */

/* V6.9.0 — "Limpar dados deste navegador": zera qualquer perfil/estado salvo só
   neste dispositivo (perfis locais, conta Google/Supabase lembrada, cache do PWA) sem
   precisar de DevTools. NÃO apaga nada que já esteja salvo na nuvem, no Supabase ou no
   Google Drive — só o que está guardado neste navegador específico. Pensado pra
   resolver telas presas (ex: pasta do Drive excluída, sessão antiga confusa) em
   dispositivos de pessoas menos técnicas. */
async function resetDeviceState(){
  try{
    Object.keys(localStorage).forEach(k=>{
      if(k.startsWith('mc_') || k.startsWith('borion_')) localStorage.removeItem(k);
    });
  }catch(e){ console.warn('[resetDeviceState] falha ao limpar localStorage:', e); }
  try{
    if(window.indexedDB && indexedDB.databases){
      const dbs = await indexedDB.databases();
      await Promise.all(dbs.map(db=> db.name ? new Promise(res=>{ const req=indexedDB.deleteDatabase(db.name); req.onsuccess=res; req.onerror=res; req.onblocked=res; }) : Promise.resolve()));
    } else {
      ['borion_findata_v1','borion_local_backups_v1','borion_handles'].forEach(name=>{
        try{ indexedDB.deleteDatabase(name); }catch(e){}
      });
    }
  }catch(e){ console.warn('[resetDeviceState] falha ao limpar IndexedDB:', e); }
  try{
    if('serviceWorker' in navigator){
      const regs = await navigator.serviceWorker.getRegistrations();
      for(const r of regs){ await r.unregister(); }
    }
    if(window.caches){
      const keys = await caches.keys();
      for(const k of keys){ await caches.delete(k); }
    }
  }catch(e){ console.warn('[resetDeviceState] falha ao limpar cache do PWA:', e); }
  location.reload();
}

function confirmResetDeviceState(){
  openConfirmModal({
    title: 'Limpar dados deste navegador',
    text: 'Isso apaga perfis e configurações salvos SÓ NESTE NAVEGADOR, e desconecta qualquer conta Google/Supabase lembrada aqui. Não afeta nada que já esteja salvo na nuvem, no Supabase ou no Google Drive — só o que está neste dispositivo.',
    confirmLabel: 'Limpar e recarregar',
    cancelLabel: 'Cancelar',
    variant: 'danger',
    onConfirm: resetDeviceState
  });
}

/* ---------- V5.34.1: banner de instalação por plataforma (Android/desktop/iPhone) ---------- */
const PWA_INSTALL_DISMISS_KEY = 'borion_install_banner_dismissed_v1';
function isStandalonePWA(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
function isIOSDevice(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }
function isAndroidDevice(){ return /android/i.test(navigator.userAgent); }
function installBannerDismissed(){ return localStorage.getItem(PWA_INSTALL_DISMISS_KEY)==='1'; }
function dismissInstallBanner(){ localStorage.setItem(PWA_INSTALL_DISMISS_KEY,'1'); }

let deferredInstallPrompt = null;

function showAndroidInstallBanner(){
  if(isStandalonePWA() || installBannerDismissed()) return;
  if (document.getElementById('install-banner')) return;
  const label = isAndroidDevice() ? 'no seu celular Android' : 'neste computador';
  const b = document.createElement('div');
  b.id = 'install-banner';
  b.innerHTML = `Instalar o Borion Finance ${label}? <button class="ib-yes">Instalar</button> <button class="ib-no">&times;</button>`;
  document.body.appendChild(b);
  b.querySelector('.ib-yes').onclick = async () => {
    b.remove();
    if (deferredInstallPrompt) { deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; }
  };
  b.querySelector('.ib-no').onclick = () => { b.remove(); dismissInstallBanner(); };
}
function showIOSInstallBanner(){
  if(isStandalonePWA() || installBannerDismissed()) return;
  if (document.getElementById('install-banner')) return;
  const b = document.createElement('div');
  b.id = 'install-banner';
  b.className = 'install-banner-ios';
  b.innerHTML = 'Adicione o Borion à Tela de Início: toque em <b>Compartilhar</b> <span class="ios-share-ic">⬆</span> e depois em <b>“Adicionar à Tela de Início”</b>. <button class="ib-no">&times;</button>';
  document.body.appendChild(b);
  b.querySelector('.ib-no').onclick = () => { b.remove(); dismissInstallBanner(); };
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showAndroidInstallBanner();
});
window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  const b = document.getElementById('install-banner'); if (b) b.remove();
  dismissInstallBanner();
});
(function initIOSInstallBanner(){
  // iOS Safari nunca dispara beforeinstallprompt; a instrução manual aparece sozinha.
  if(isIOSDevice()) setTimeout(showIOSInstallBanner, 1800);
})();

/* ---------- V5.34.8: importação JSON ciente de nuvem/perfil ativo ---------- */
/* V6.6.0 — os fluxos de importação abaixo (novo perfil, substituir tudo, mesclar
   tudo) escrevem direto em setProfiles()/setProfileData(), sem passar por
   saveCurrentData() — que é onde normalmente o Google Drive é avisado pra sincronizar.
   Sem isso, um perfil importado só chegaria ao Drive na próxima vez que algo mais
   disparasse um save. Chamado no fim de cada fluxo de importação/mesclagem local. */
async function notifyGoogleDriveAfterImport(options={}){
  if(!(window.GoogleDriveProvider&&GoogleDriveProvider.isConnected())) return null;
  GoogleDriveProvider.queueSave();
  if(!options.authoritative) return null;
  // A redução de registros é esperada quando a pessoa escolheu um backup antigo.
  // Por isso esta sincronização específica confirma conscientemente a queda e usa
  // o marco autoritativo gravado no perfil, sem abrir brecha para saves comuns.
  return await GoogleDriveProvider.syncNow({
    source:'manual_json_authoritative_import',
    acknowledgeSuspicious:true
  });
}
function prepareManualJsonReplacement(rawData,targetProfileId,sourceProfileId,currentData){
  const migrated=migrateData(rawData||emptyData(),{profileId:targetProfileId||sourceProfileId||null});
  // V6.44.3 — mesma proteção de js/23-profile-import-review.js: preserva o estado
  // das integrações (config + registros já reconhecidos como importados) do
  // dispositivo atual, para que a sincronização automática (a cada 15s) não
  // recrie sozinha lançamentos que o JSON corretivo removeu de propósito.
  if(currentData && currentData.interconnections) migrated.interconnections = JSON.parse(JSON.stringify(currentData.interconnections));
  if(!window.BorionSyncCore||typeof BorionSyncCore.markAuthoritativeImport!=='function') return migrated;
  let remoteData=null;
  try{
    const snapshot=window.GoogleDriveProvider&&GoogleDriveProvider._lastConsolidatedPayload;
    remoteData=snapshot&&snapshot.dataByProfile&&snapshot.dataByProfile[String(targetProfileId)]||null;
  }catch(_e){}
  return BorionSyncCore.markAuthoritativeImport(migrated,{
    profileId:targetProfileId||null,
    sourceProfileId:sourceProfileId||null,
    previousData:[currentData,remoteData].filter(Boolean),
    source:'manual_json_replace'
  });
}

function handleImport(obj){
  const isCloud = !!(window.CloudStorage && CloudStorage.user);
  if(isCloud){
    if(!S.currentProfile){ alert('Entre em um perfil antes de importar.'); return; }
    if((obj.type==='borion-account-backup' || obj.type==='multicap-full-backup') && obj.profiles && obj.dataByProfile){
      openAccountImportReview(obj,{cloud:true});
      return;
    }
    let incomingData = null;
    let incomingProfile = obj.profile || {};
    if(obj.type==='borion-profile-backup' || obj.type==='multicap-profile-backup'){
      incomingData = obj.data || emptyData();
    } else if(obj.type==='multicap-full-backup' || obj.type==='borion-account-backup'){
      const keys = Object.keys(obj.dataByProfile||{});
      if(keys.length){
        const firstId = keys[0];
        incomingData = obj.dataByProfile[firstId] || emptyData();
        incomingProfile = (obj.profiles||[]).find(p=>p.id===firstId) || incomingProfile || {};
      }
    }
    if(!incomingData){ alert('Formato de backup não reconhecido.'); return; }
    incomingData = migrateData(incomingData, {profileId:(incomingProfile&&incomingProfile.id)||(S.currentProfile&&S.currentProfile.id)||null});
    const activeName = S.currentProfile.name;
    const importedName = (incomingProfile && incomingProfile.name) ? incomingProfile.name : 'Perfil importado';
    const importAsNew = async ()=>{
      try{
        const options={
          avatarColor: incomingProfile.avatarColor || incomingProfile.avatar_color || avatarColor(importedName),
          avatarImage: incomingProfile.avatarImage || incomingProfile.avatar_image || ''
        };
        await CloudStorage.createProfile(importedName, true, incomingData, options);
        closeModal();
        renderApp();
        toast('Perfil JSON importado como novo perfil e confirmado no Supabase.');
      }catch(e){ alert(e.message||String(e)); }
    };
    const replaceActive = async ()=>{
      try{
        if(window.BackupFS) await BackupFS.createCloudBackup('before_import_replace','backup automático antes de substituir perfil por JSON',{silent:true});
        S.data=prepareManualJsonReplacement(incomingData,S.currentProfile&&S.currentProfile.id,incomingProfile&&incomingProfile.id,S.data);
        setProfileData(S.currentProfile.id,S.data);
        saveCurrentData();
        const ok=await CloudStorage.syncNow();
        if(!ok) throw new Error(CloudStorage.pendingReason||'Supabase não confirmou a importação agora.');
        closeModal(); renderView(); toast('Perfil atual substituído pelo JSON e sincronizado.');
      }catch(e){ alert(e.message||String(e)); }
    };
    const mergeActive = async ()=>{
      try{
        if(window.BackupFS) await BackupFS.createCloudBackup('before_import_merge','backup automático antes de mesclar JSON no perfil',{silent:true});
        S.data=cloudMergeData(S.data,incomingData,S.currentProfile&&S.currentProfile.id);
        setProfileData(S.currentProfile.id,S.data);
        saveCurrentData();
        const ok=await CloudStorage.syncNow();
        if(!ok) throw new Error(CloudStorage.pendingReason||'Supabase não confirmou a importação agora.');
        closeModal(); renderView(); toast('JSON mesclado ao perfil atual e sincronizado.');
      }catch(e){ alert(e.message||String(e)); }
    };
    openChoiceModal({
      title:'Importar arquivo JSON',
      sub:'Arquivo: '+importedName+'. Perfil ativo: '+activeName+'. Escolha se cria um perfil novo ou usa o perfil atual.',
      choices:[
        {label:'Importar como novo perfil', desc:'Cria um perfil separado na sua conta e carrega os dados do JSON nele.', onClick:importAsNew},
        {label:'Substituir perfil atual', desc:'Substituição absoluta: o JSON vira a versão oficial e tudo o que não existir nele é removido.', variant:'danger', onClick:replaceActive},
        {label:'Mesclar com perfil atual', desc:'Mantém os dados atuais e adiciona o que veio do backup quando possível.', onClick:mergeActive},
        {label:'Cancelar', onClick:closeModal}
      ]
    });
    return;
  }
  if(obj.type==='multicap-profile-backup' || obj.type==='borion-profile-backup'){
    const incoming = obj.profile || {id:uid(),name:'Perfil importado'};
    const incomingData = migrateData(obj.data || emptyData(), {profileId:incoming.id});
    const existingIdx = S.profiles.findIndex(p=>p.id===incoming.id);
    const doImportAsNew = async ()=>{
      const newId=uid();
      const authoritativeData=prepareManualJsonReplacement(incomingData,newId,incoming.id,null);
      S.profiles.push({...incoming,id:newId,name:(incoming.name||'Perfil')+' (importado)'});
      setProfiles(S.profiles); setProfileData(newId,authoritativeData);
      const driveResult=await notifyGoogleDriveAfterImport({authoritative:true});
      closeModal(); toast(driveResult===false?'Perfil importado neste dispositivo; sincronização com o Drive pendente.':'Perfil importado e definido como versão oficial.'); if(S.currentProfile) renderView(); else renderGate();
    };
    if(existingIdx>-1){
      openChoiceModal({title:'Este perfil já existe', sub:'Já existe um perfil "'+S.profiles[existingIdx].name+'" neste app.', choices:[
        {label:'Substituir dados deste perfil', variant:'danger', onClick:async()=>{
          const targetId=incoming.id;
          const currentData=(S.currentProfile&&S.currentProfile.id===targetId&&S.data)?S.data:getProfileData(targetId);
          const authoritativeData=prepareManualJsonReplacement(incomingData,targetId,incoming.id,currentData);
          S.profiles[existingIdx]={...S.profiles[existingIdx],...incoming}; setProfiles(S.profiles); setProfileData(targetId,authoritativeData);
          if(S.currentProfile&&S.currentProfile.id===targetId) S.data=authoritativeData;
          const driveResult=await notifyGoogleDriveAfterImport({authoritative:true});
          closeModal(); renderView(); toast(driveResult===false?'Perfil substituído neste dispositivo; sincronização com o Drive pendente.':'Perfil substituído. O JSON importado é a versão oficial.');
        }},
        {label:'Importar como novo perfil', onClick:doImportAsNew},
        {label:'Cancelar', onClick:closeModal}
      ]});
    }else doImportAsNew();
  } else if(obj.type==='multicap-full-backup' || obj.type==='borion-account-backup'){
    openAccountImportReview(obj,{cloud:false});
  } else alert('Formato de backup não reconhecido.');
}
