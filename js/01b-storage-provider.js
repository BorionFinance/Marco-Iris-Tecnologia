/* Borion Finance — storageProvider (V6.3.0)
   Camada fina pedida na FASE 1 da migração pra sair do Supabase. Não é um motor de
   armazenamento novo: cada método aqui só empresta um nome estável e chama a função que
   já existe no app (S, getProfileData/setProfileData, hydrateProfileDataFromIDB,
   buildCloudAccountBackupPayload, handleImport, validateBorionJson...). Se este arquivo
   fosse removido, o app continuaria funcionando exatamente como antes — nada aqui troca
   comportamento de telas existentes.

   Única parte de verdade nova: um histórico de backups 100% local (IndexedDB), porque
   hoje list/restore de backup só existe via Supabase (BackupFS.listCloudBackups). Sem
   isso, "listBackups"/"restoreBackup" não tinham como funcionar offline.

   Ordem de carregamento: depois de 00-utils.js e 01-storage-data-state.js. Todo o resto
   (buildCloudAccountBackupPayload, handleImport, CloudStorage) só é chamado de dentro de
   funções — não no carregamento do arquivo — então a ordem exata dos outros scripts não
   importa aqui. */

const BORION_LOCAL_BACKUPS_DB = 'borion_local_backups_v1';
const BORION_LOCAL_BACKUPS_STORE = 'backups';
/* Motivos que nunca são apagados automaticamente (mesmo espírito das regras de retenção
   já combinadas para o futuro backup no Google Drive). Só backups "auto" acima do limite
   entram na poda. */
const BORION_LOCAL_BACKUPS_KEEP_REASONS = ['manual', 'manual_quick', 'manual_drive_local', 'before_import', 'before_restore', 'before_schema_migration'];
const BORION_LOCAL_BACKUPS_MAX_AUTO = 50;

function localBackupsIdbOpen(){
  return new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB indisponível neste navegador.')); return; }
    const req = indexedDB.open(BORION_LOCAL_BACKUPS_DB, 1);
    req.onupgradeneeded = ()=>{
      if(!req.result.objectStoreNames.contains(BORION_LOCAL_BACKUPS_STORE)){
        const store = req.result.createObjectStore(BORION_LOCAL_BACKUPS_STORE, {keyPath:'id'});
        store.createIndex('createdAt', 'createdAt', {unique:false});
      }
    };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function localBackupsPut(entry){
  const db = await localBackupsIdbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(BORION_LOCAL_BACKUPS_STORE, 'readwrite');
    tx.objectStore(BORION_LOCAL_BACKUPS_STORE).put(entry);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}
async function localBackupsGetAll(){
  const db = await localBackupsIdbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(BORION_LOCAL_BACKUPS_STORE, 'readonly');
    const rq = tx.objectStore(BORION_LOCAL_BACKUPS_STORE).getAll();
    rq.onsuccess = ()=> resolve(rq.result || []);
    rq.onerror = ()=> reject(rq.error);
  });
}
async function localBackupsGet(id){
  const db = await localBackupsIdbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(BORION_LOCAL_BACKUPS_STORE, 'readonly');
    const rq = tx.objectStore(BORION_LOCAL_BACKUPS_STORE).get(id);
    rq.onsuccess = ()=> resolve(rq.result || null);
    rq.onerror = ()=> reject(rq.error);
  });
}
async function localBackupsDelete(id){
  const db = await localBackupsIdbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(BORION_LOCAL_BACKUPS_STORE, 'readwrite');
    tx.objectStore(BORION_LOCAL_BACKUPS_STORE).delete(id);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}
async function localBackupsPrune(){
  try{
    const all = await localBackupsGetAll();
    const prunable = all
      .filter(b=> !BORION_LOCAL_BACKUPS_KEEP_REASONS.includes(b.reasonType))
      .sort((a,b)=> a.createdAt - b.createdAt);
    const excess = prunable.length - BORION_LOCAL_BACKUPS_MAX_AUTO;
    if(excess > 0){
      for(const b of prunable.slice(0, excess)){ await localBackupsDelete(b.id); }
    }
  }catch(e){ console.warn('[storageProvider] falha ao limpar backups locais antigos (não crítico):', e); }
}

const storageProvider = {
  /* 'offline' | 'cloud' | null (ainda não escolheu — mostra a tela de login). */
  mode(){
    return getStorageMode() || ((window.CloudStorage && CloudStorage.user) ? 'cloud' : null);
  },

  /* Carrega os dados do perfil (IndexedDB é a fonte mais durável; localStorage é o
     cache síncrono). Sem profileId, usa o perfil ativo (S.currentProfile). */
  async loadUserData(profileId){
    const id = profileId || (S.currentProfile && S.currentProfile.id);
    if(!id) return null;
    const fromIdb = await hydrateProfileDataFromIDB(id);
    return fromIdb || migrateData(getProfileData(id), {profileId:id});
  },

  /* Grava no perfil ativo (localStorage + IndexedDB, e enfileira pro Supabase se
     estiver logado — mesmo caminho que qualquer tela do app já usa). */
  saveUserData(data, options){
    if(data) S.data = data;
    saveCurrentData(options || {});
    return true;
  },

  /* Lê um File (input type=file), valida e entrega pro fluxo de importação que já
     existe (handleImport já sabe decidir entre novo perfil/substituir/mesclar, e já
     funciona tanto logado no Supabase quanto 100% local). Cria um backup de segurança
     antes, sempre — local ou na nuvem, conforme o modo atual. */
  importJson(file){
    return new Promise((resolve, reject)=>{
      if(!file){ reject(new Error('Nenhum arquivo selecionado.')); return; }
      const reader = new FileReader();
      reader.onload = async ()=>{
        let obj;
        try{ obj = JSON.parse(reader.result); }
        catch(e){ reject(new Error('Arquivo inválido ou corrompido.')); return; }
        const check = validateBorionJson(obj);
        if(!check.valid){ reject(new Error(check.errors.join(' '))); return; }
        try{ await storageProvider.createBackup('before_import'); }
        catch(e){ console.warn('[storageProvider] backup before_import falhou — a importação segue mesmo assim:', e); }
        handleImport(obj);
        resolve(obj);
      };
      reader.onerror = ()=> reject(new Error('Falha ao ler o arquivo.'));
      reader.readAsText(file);
    });
  },

  /* JSON completo (todos os perfis + config), no mesmo formato que Configurações já
     exporta hoje — é o formato "mestre" que a FASE 2 pede. */
  async exportJson(){
    return await buildFullBackupPayload();
  },

  validateBorionJson,

  /* Gera o JSON completo e guarda uma cópia no histórico local (IndexedDB), pra
     listBackups()/restoreBackup() funcionarem sem depender do Supabase. */
  async createBackup(reason='manual', options={}){
    const reasonText = {
      manual: 'backup manual (storageProvider)',
      before_import: 'backup automático antes de importar JSON',
      before_restore: 'backup automático antes de restaurar backup local',
      manual_quick: 'backup manual rápido neste dispositivo',
      manual_drive_local: 'backup manual conjunto Drive e dispositivo',
      auto: 'backup automático'
    }[reason] || reason;
    const payload = options.payload ? options.payload : await buildSharedBackupSnapshot(reason, reasonText);
    const entry = {
      id: payload.snapshotId || ('bk_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8)),
      createdAt: Date.now(),
      reasonType: reason,
      appVersion: payload.appVersion || '',
      profileCount: payload.profileCount || 0,
      snapshotId: payload.snapshotId||null,
      snapshotChecksum: payload.snapshotChecksum||'',
      payload
    };
    await localBackupsPut(entry);
    localBackupsPrune();
    return entry;
  },

  /* Lista só os metadados (sem o JSON inteiro, pra não pesar a tela). Mais recente primeiro. */
  async listBackups(){
    const all = await localBackupsGetAll();
    return all
      .sort((a, b)=> b.createdAt - a.createdAt)
      .map(b=> ({id:b.id, createdAt:b.createdAt, reasonType:b.reasonType, appVersion:b.appVersion, profileCount:b.profileCount}));
  },

  /* Restaura um backup do histórico local. Sempre cria um backup do estado atual antes
     (nunca restaura "no escuro"), depois entrega pro handleImport — que já escolhe
     certo entre o fluxo logado/local e sempre pede confirmação antes de substituir. */
  async restoreBackup(backupId){
    const entry = await localBackupsGet(backupId);
    if(!entry) throw new Error('Backup não encontrado no histórico local.');
    await storageProvider.createBackup('before_restore');
    const check = validateBorionJson(entry.payload);
    if(!check.valid) throw new Error(check.errors.join(' '));
    handleImport(entry.payload);
    return entry.payload;
  },

  getStorageStatus(){
    return {
      mode: this.mode(),
      hasCloudUser: !!(window.CloudStorage && CloudStorage.user),
      online: navigator.onLine,
      profileCount: (S.profiles || []).length,
      activeProfileId: S.currentProfile ? S.currentProfile.id : null
    };
  }
};

window.storageProvider = storageProvider;
