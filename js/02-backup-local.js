/* Borion Finance — Backup e segurança de dados V5.36.0
   Camadas:
   1) backup manual completo em arquivo JSON;
   2) backup em pasta local escolhida pelo usuário (File System Access API);
   3) snapshots no Supabase em public.borion_backups;
   4) backup automático antes de ações perigosas;
   5) aceite interno de proteção de dados por conta/dispositivo. */

/* ---------------- Backup em pasta local (File System Access API — Chrome/Edge) ---------------- */
const FS_ACCESS_SUPPORTED = typeof window!=='undefined' && 'showDirectoryPicker' in window;
const IDB_NAME = 'borion_handles', IDB_STORE = 'handles';
const BORION_APP_VERSION = '6.45.5';
const BORION_BACKUP_CONSENT_PREFIX = 'borion_backup_consent_v2_';
const BORION_BACKUP_LAST_CLOUD_PREFIX = 'borion_backup_last_cloud_v1_';
const BORION_BACKUP_SNOOZE_PREFIX = 'borion_backup_consent_snooze_v1_';

function idbOpen(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbGet(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readonly');
    const rq = tx.objectStore(IDB_STORE).get(key);
    rq.onsuccess = ()=> resolve(rq.result || null);
    rq.onerror = ()=> reject(rq.error);
  });
}
async function idbSet(key, val){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(val, key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}
async function idbDel(key){
  const db = await idbOpen();
  return new Promise((resolve, reject)=>{
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = ()=> resolve(true);
    tx.onerror = ()=> reject(tx.error);
  });
}

function backupDateSlug(){
  const d = new Date();
  const pad = n=>String(n).padStart(2,'0');
  const ms = String(d.getMilliseconds()).padStart(3,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}-${pad(d.getHours())}h${pad(d.getMinutes())}m${pad(d.getSeconds())}s${ms}`;
}
function backupFilename(prefix='borion-backup-conta'){
  return `${prefix}-${backupDateSlug()}.json`;
}
function backupUserKey(){
  const user = window.CloudStorage && CloudStorage.user;
  return user && user.id ? user.id : 'local';
}
function normalizeProfileForBackup(p){
  return {
    id:p.id,
    name:p.name||'Perfil',
    email:p.email||'',
    avatarColor:p.avatarColor||p.avatar_color||'#1f8a5b',
    avatarImage:p.avatarImage||p.avatar_image||'',
    passwordHash:p.passwordHash||p.password_hash||null,
    salt:p.salt||p.password_salt||null,
    createdAt:p.createdAt||p.created_at||null,
    updatedAt:p.updatedAt||p.updated_at||null,
    cloud:!!p.cloud
  };
}
function backupSafeClone(obj){ try{return JSON.parse(JSON.stringify(obj));}catch(e){return obj;} }
function backupProfileSelectColumns(){
  return (window.CloudStorage && CloudStorage.profilePasswordColumnsReady===false)
    ? 'id,name,avatar_color,avatar_image,created_at,updated_at'
    : 'id,name,avatar_color,avatar_image,password_hash,password_salt,created_at,updated_at';
}
async function buildLocalAccountBackupPayload(backupType='manual', reason=''){
  const profiles=(S.profiles||[]).map(normalizeProfileForBackup);
  const dataByProfile = {};
  for(const p of profiles){
    let d = (S.currentProfile && p.id===S.currentProfile.id && S.data) ? S.data : getProfileData(p.id);
    if(!d && typeof idbGetProfileData==='function') d = await idbGetProfileData(p.id);
    dataByProfile[p.id] = migrateData(d || emptyData(), {profileId:p.id});
  }
  const accountSyncMeta={schemaVersion:(window.BorionSyncCore&&BorionSyncCore.BORION_DATA_SCHEMA_VERSION)||6401,profileTombstones:(typeof getProfileTombstones6401==='function'?getProfileTombstones6401():{})};
  const compact = {profiles, dataByProfile, config:S.config||{}, __syncMeta640:accountSyncMeta};
  const hash = typeof sha256Hex==='function' ? await sha256Hex(JSON.stringify(compact)) : '';
  return {
    type:'borion-account-backup',
    backupSchema:5352,
    app:'Borion Finance',
    appVersion:BORION_APP_VERSION,
    backupType,
    reason:reason||'',
    source:'local_runtime',
    exportedAt:new Date().toISOString(),
    account:{
      userId:(window.CloudStorage&&CloudStorage.user&&CloudStorage.user.id)||null,
      email:(window.CloudStorage&&CloudStorage.user&&CloudStorage.user.email)||''
    },
    config:S.config||{},
    __syncMeta640:accountSyncMeta,
    profileCount:profiles.length,
    profiles,
    dataByProfile,
    integrity:{sha256:hash, profileIds:profiles.map(p=>p.id), dataProfileIds:Object.keys(dataByProfile)}
  };
}
async function buildCloudAccountBackupPayload(backupType='manual', reason=''){
  const cloud = window.CloudStorage;
  if(!cloud || !cloud.client || !cloud.user || !navigator.onLine) return await buildLocalAccountBackupPayload(backupType, reason);
  try{
    let {data:profileRows,error:profileError}=await cloud.client
      .from('profiles')
      .select(backupProfileSelectColumns())
      .eq('user_id',cloud.user.id)
      .order('created_at',{ascending:true});
    if(profileError && typeof cloudIsMissingProfilePasswordColumns==='function' && cloudIsMissingProfilePasswordColumns(profileError)){
      cloud.profilePasswordColumnsReady=false;
      const retry=await cloud.client
        .from('profiles')
        .select('id,name,avatar_color,avatar_image,created_at,updated_at')
        .eq('user_id',cloud.user.id)
        .order('created_at',{ascending:true});
      profileRows=retry.data; profileError=retry.error;
    }
    if(profileError) throw profileError;
    const profiles=(profileRows||[]).map(r=>normalizeProfileForBackup({
      id:r.id, name:r.name, email:cloud.user.email, avatarColor:r.avatar_color, avatarImage:r.avatar_image,
      passwordHash:r.password_hash||null, salt:r.password_salt||null,
      createdAt:r.created_at?Date.parse(r.created_at):null, updatedAt:r.updated_at?Date.parse(r.updated_at):null, cloud:true
    }));
    const {data:dataRows,error:dataError}=await cloud.client
      .from('borion_profile_data')
      .select('profile_id,data,updated_at,sync_version')
      .eq('user_id',cloud.user.id);
    if(dataError) throw dataError;
    const dataByProfile={};
    (dataRows||[]).forEach(r=>{ dataByProfile[r.profile_id]=migrateData(r.data||emptyData(), {profileId:r.profile_id}); });
    for(const p of profiles){
      if(!dataByProfile[p.id]){
        let local = (S.currentProfile && p.id===S.currentProfile.id && S.data) ? S.data : getProfileData(p.id);
        if(!local && typeof idbGetProfileData==='function') local = await idbGetProfileData(p.id);
        dataByProfile[p.id]=migrateData(local||emptyData(), {profileId:p.id});
      }
    }
    const accountSyncMeta={schemaVersion:(window.BorionSyncCore&&BorionSyncCore.BORION_DATA_SCHEMA_VERSION)||6401,profileTombstones:(typeof getProfileTombstones6401==='function'?getProfileTombstones6401():{})};
    const compact={profiles,dataByProfile,config:S.config||{},__syncMeta640:accountSyncMeta};
    const hash=typeof sha256Hex==='function' ? await sha256Hex(JSON.stringify(compact)) : '';
    return {
      type:'borion-account-backup',
      backupSchema:5352,
      app:'Borion Finance',
      appVersion:BORION_APP_VERSION,
      backupType,
      reason:reason||'',
      source:'supabase_fresh_read',
      exportedAt:new Date().toISOString(),
      account:{userId:cloud.user.id,email:cloud.user.email||''},
      config:S.config||{},
      __syncMeta640:accountSyncMeta,
      profileCount:profiles.length,
      profiles,
      dataByProfile,
      integrity:{sha256:hash, profileIds:profiles.map(p=>p.id), dataProfileIds:Object.keys(dataByProfile)}
    };
  }catch(e){
    console.warn('[BORION_BACKUP][BUILD_CLOUD_PAYLOAD][FALLBACK_LOCAL]', e);
    const fallback = await buildLocalAccountBackupPayload(backupType, reason||'fallback_local_after_cloud_error');
    fallback.source='local_runtime_after_cloud_error';
    fallback.cloudReadError=(typeof cloudErrorMessage==='function')?cloudErrorMessage(e):(e&&e.message?e.message:String(e));
    return fallback;
  }
}

async function finalizeBackupSnapshot(payload, backupType='manual', reason=''){
  const out=backupSafeClone(payload||{});
  const baseDate=out.exportedAt||new Date().toISOString();
  out.exportedAt=baseDate;
  out.backupType=backupType||out.backupType||'manual';
  out.reason=reason||out.reason||'';
  out.snapshotId=out.snapshotId||('snapshot_'+baseDate.replace(/[^0-9]/g,'')+'_'+Math.random().toString(36).slice(2,10));
  out.snapshotBaseDate=baseDate;
  const canonical=backupSafeClone(out); delete canonical.snapshotChecksum;
  if(canonical.integrity) delete canonical.integrity.snapshotSha256;
  const checksum=typeof sha256Hex==='function'?await sha256Hex(JSON.stringify(canonical)):((out.integrity&&out.integrity.sha256)||'');
  out.snapshotChecksum=checksum;
  out.integrity=Object.assign({},out.integrity||{},{snapshotSha256:checksum});
  return out;
}
async function buildSharedBackupSnapshot(backupType='manual',reason=''){
  const payload=await buildCloudAccountBackupPayload(backupType,reason);
  return await finalizeBackupSnapshot(payload,backupType,reason);
}

async function buildFullBackupPayload(){ return await buildSharedBackupSnapshot('manual','backup manual completo'); }

const BackupFS = {
  dirHandle: null,
  pendingHandle: null,
  needsReconnect: false,
  dirty: false,
  lastAutoBackupAt: 0,
  autoBackupTimer: null,
  autoBackupInFlight: false,
  dirtyRevision: 0,
  lastFolderWrite: null,
  startupFolderStatus: 'unchecked',
  startupFolderName: '',
  startupNoticeShown: false,
  initPromise: null,

  safeRefreshUI(){
    // V5.36.0 — a tela de aceite de backup pode aparecer antes de um perfil
    // financeiro estar aberto. Nesse estado S.data é null; portanto não podemos
    // chamar renderView(), que depende de notificacoes/transacoes do perfil.
    try{
      if(S.currentProfile && S.data && document.querySelector('#view-root')){ renderView(); return; }
      if(typeof renderGate==='function' && document.querySelector('#root')) renderGate();
    }catch(e){ console.warn('[BORION_BACKUP][SAFE_REFRESH_UI][SKIP]', e); }
  },

  markDirty(){
    this.dirty = true;
    this.dirtyRevision++;
    this.scheduleAutoBackup();
  },
  scheduleAutoBackup(delayOverride){
    if(!this.dirHandle || this.needsReconnect) return;
    clearTimeout(this.autoBackupTimer);
    const elapsed = this.lastAutoBackupAt ? Date.now()-this.lastAutoBackupAt : 60*1000;
    const delay = Number.isFinite(delayOverride) ? Math.max(2000,delayOverride) : Math.max(2000,60*1000-elapsed);
    this.autoBackupTimer = setTimeout(()=>{ this.autoBackupTimer=null; this.maybeAutoBackup(); }, delay);
  },
  consentKey(){ return BORION_BACKUP_CONSENT_PREFIX+backupUserKey(); },
  snoozeKey(){ return BORION_BACKUP_SNOOZE_PREFIX+backupUserKey(); },
  lastCloudKey(){ return BORION_BACKUP_LAST_CLOUD_PREFIX+backupUserKey(); },
  hasConsent(){ return readJSON(this.consentKey(), null); },
  setConsent(mode){ writeJSON(this.consentKey(), {accepted:true, mode:mode||'manual', acceptedAt:Date.now(), appVersion:BORION_APP_VERSION}); },
  snoozeConsent(){ writeJSON(this.snoozeKey(), {at:Date.now()}); },
  shouldShowConsent(){
    if(this.hasConsent()) return false;
    const s=readJSON(this.snoozeKey(), null);
    if(s && s.at && Date.now()-s.at < 24*60*60*1000) return false;
    return true;
  },

  async init(){
    if(this.initPromise) return this.initPromise;
    this.initPromise=(async()=>{
      if(!FS_ACCESS_SUPPORTED){ this.startupFolderStatus='unsupported'; return false; }
      try{
        const handle = await idbGet('backupDir');
        if(!handle){ this.startupFolderStatus='not_configured'; return false; }
        this.startupFolderName=handle.name||'Backups_Borion';
        const perm = await handle.queryPermission({mode:'readwrite'});
        if(perm === 'granted'){
          this.dirHandle = handle;
          this.pendingHandle = null;
          this.needsReconnect = false;
          this.startupFolderStatus='connected';
          if(this.dirty) this.scheduleAutoBackup(2500);
          return true;
        }
        this.pendingHandle = handle;
        this.dirHandle = null;
        this.needsReconnect = true;
        this.startupFolderStatus='reconnect';
        return false;
      }catch(e){
        this.startupFolderStatus='error';
        console.warn('Não foi possível restaurar a pasta de backups', e);
        return false;
      }
    })();
    return this.initPromise;
  },

  async verifyFolderConnection(interactive=false){
    await this.init();
    if(this.dirHandle){
      const ok=await this.ensureWritePermission(interactive);
      this.startupFolderStatus=ok?'connected':'reconnect';
      return ok;
    }
    if(this.needsReconnect && this.pendingHandle && interactive){
      const ok=await this.reconnect();
      this.startupFolderStatus=ok?'connected':'reconnect';
      return ok;
    }
    return false;
  },

  notifyStartupFolderStatus(){
    if(this.startupNoticeShown) return;
    this.startupNoticeShown=true;
    if(this.startupFolderStatus==='connected'){
      toast('Pasta local verificada e conectada para os backups JSON.');
    }else if(this.startupFolderStatus==='reconnect'){
      toast('A pasta local foi encontrada, mas precisa ser reconectada em Configurações → Backups. Até lá, o backup manual baixará o JSON pelo navegador.');
    }else if(this.startupFolderStatus==='error'){
      toast('Não foi possível verificar a pasta local. O backup manual continuará baixando o JSON pelo navegador.');
    }
  },

  async ensureWritePermission(interactive=false){
    if(!this.dirHandle) return false;
    try{
      let perm = await this.dirHandle.queryPermission({mode:'readwrite'});
      if(perm!=='granted' && interactive && this.dirHandle.requestPermission){
        perm = await this.dirHandle.requestPermission({mode:'readwrite'});
      }
      if(perm==='granted') return true;
      this.pendingHandle = this.dirHandle;
      this.dirHandle = null;
      this.needsReconnect = true;
      this.startupFolderStatus='reconnect';
      this.safeRefreshUI();
      return false;
    }catch(e){
      console.warn('[BORION_BACKUP][FOLDER_PERMISSION]',e);
      return false;
    }
  },

  async choose(){
    if(!FS_ACCESS_SUPPORTED){
      alert('Escolher uma pasta de backups funciona no Chrome ou Edge. Você ainda pode baixar backups manuais em JSON.');
      return false;
    }
    try{
      const rootHandle = await window.showDirectoryPicker({id:'borion-backup', mode:'readwrite'});
      const backupsHandle = await rootHandle.getDirectoryHandle('Backups_Borion', {create:true});
      await idbSet('backupDir', backupsHandle);
      this.dirHandle = backupsHandle;
      this.pendingHandle = null;
      this.needsReconnect = false;
      this.startupFolderStatus = 'connected';
      this.startupFolderName = backupsHandle.name||'Backups_Borion';
      this.setConsent('folder');
      if(this.dirty) this.scheduleAutoBackup(2000);
      toast('Pasta de backups configurada: '+rootHandle.name+'/Backups_Borion');
      this.safeRefreshUI();
      return true;
    }catch(e){
      if(e.name!=='AbortError') alert('Não foi possível configurar a pasta: '+e.message);
      return false;
    }
  },

  async reconnect(){
    if(!this.pendingHandle) return this.choose();
    try{
      const perm = await this.pendingHandle.requestPermission({mode:'readwrite'});
      if(perm==='granted'){
        this.dirHandle = this.pendingHandle;
        this.pendingHandle = null;
        this.needsReconnect = false;
        this.startupFolderStatus = 'connected';
        this.startupFolderName = this.dirHandle.name||'Backups_Borion';
        this.setConsent('folder');
        if(this.dirty) this.scheduleAutoBackup(2000);
        toast('Pasta de backups reconectada.');
        this.safeRefreshUI();
        return true;
      } else {
        toast('Permissão não concedida.');
        return false;
      }
    }catch(e){ alert('Não foi possível reconectar: '+e.message); }
  },

  async disconnect(){
    this.dirHandle = null; this.pendingHandle = null; this.needsReconnect = false; this.startupFolderStatus='not_configured';
    clearTimeout(this.autoBackupTimer); this.autoBackupTimer=null;
    await idbDel('backupDir');
    toast('Pasta de backups desconectada.');
    this.safeRefreshUI();
  },

  async writeToFolder(payload, prefix='borion-backup-conta', options={}){
    if(!this.dirHandle) return false;
    try{
      const allowed = await this.ensureWritePermission(options.interactive===true);
      if(!allowed) return false;
      const filename = options.filename || backupFilename(prefix);
      const fh = await this.dirHandle.getFileHandle(filename, {create:true});
      const w = await fh.createWritable();
      await w.write(JSON.stringify(payload, null, 2));
      await w.close();
      this.lastFolderWrite = {filename, at:Date.now(), snapshotId:payload&&payload.snapshotId||null};
      return this.lastFolderWrite;
    }catch(e){
      console.warn('Falha ao gravar backup na pasta', e);
      if(e && (e.name==='NotAllowedError' || e.name==='SecurityError')){
        this.pendingHandle=this.dirHandle; this.dirHandle=null; this.needsReconnect=true; this.startupFolderStatus='reconnect'; this.safeRefreshUI();
      }
      return false;
    }
  },

  async manualBackupNow(){
    const payload = await buildSharedBackupSnapshot('manual','backup manual baixado/salvo pelo usuário');
    const wroteFolder = this.dirHandle ? await this.writeToFolder(payload, 'borion-backup-conta', {interactive:true}) : false;
    if(wroteFolder){ this.dirty=false; this.lastAutoBackupAt=Date.now(); toast('Backup completo salvo em '+wroteFolder.filename+'.'); return payload; }
    downloadJSON(payload, backupFilename());
    toast('Backup completo baixado em JSON. Configure ou reconecte uma pasta para salvar automaticamente.');
    return payload;
  },

  async maybeAutoBackup(options={}){
    if(!this.dirHandle || (!this.dirty && !options.force)) return false;
    if(this.autoBackupInFlight) return false;
    const now = Date.now();
    if(!options.force && now-this.lastAutoBackupAt < 60*1000){
      this.scheduleAutoBackup(60*1000-(now-this.lastAutoBackupAt));
      return false;
    }
    this.autoBackupInFlight = true;
    const revision = this.dirtyRevision;
    try{
      const payload = options.payload || await buildSharedBackupSnapshot('auto_local','backup automático local por alteração');
      const result = await this.writeToFolder(payload, options.prefix||'borion-auto', {interactive:options.interactive===true});
      if(result){
        this.lastAutoBackupAt=Date.now();
        if(revision===this.dirtyRevision) this.dirty=false;
        return result;
      }
      return false;
    }finally{
      this.autoBackupInFlight=false;
      if(this.dirty && this.dirHandle && !this.autoBackupTimer) this.scheduleAutoBackup();
    }
  },

  /* ---------------- V6.40 — Dados e Segurança (itens 15.1, 15.3, 15.4) ---------------- */

  /* Item 15.1 / correção 6.44.2: backup EXATO dos bytes originais antes de
     qualquer migração de schema. O arquivo recém-criado é relido, tem o checksum
     conferido e precisa passar na validação de restauração. Qualquer falha mantém
     a base original intacta e bloqueia migração, persistência e sincronização até
     que o usuário entre em modo de recuperação ou o backup seja confirmado. */
  async ensureRawSchemaMigrationBackup(context={}){
    const rawText=String(context.rawText==null?'':context.rawText);
    const folderId=(window.GoogleDriveProvider&&GoogleDriveProvider.folderId)||'local';
    const key='borion_schema6401_raw_backup_done_'+backupUserKey()+'_'+folderId;
    if(!rawText) throw Object.assign(new Error('Não foi possível ler os bytes originais do current.json; migração bloqueada.'),{code:'MIGRATION_BACKUP_REQUIRED'});
    let parsed;
    try{ parsed=JSON.parse(rawText); }catch(e){ throw Object.assign(new Error('O current.json original é JSON inválido; migração bloqueada.'),{code:'MIGRATION_SOURCE_INVALID'}); }
    const check=validateBorionJson(parsed);
    if(!check.valid) throw Object.assign(new Error('A base original não passou na validação: '+check.errors.join(' ')),{code:'MIGRATION_SOURCE_INVALID'});

    // Não cria um novo "pré-migração" quando o snapshot já está integralmente no
    // schema 6401. Se qualquer perfil/entidade ainda estiver legado, falha fechado.
    let migrationRequired=!(parsed.__syncMeta640&&Number(parsed.__syncMeta640.schemaVersion)>=6401&&parsed.integrity&&parsed.integrity.checksum);
    if(window.BorionSyncCore){
      for(const p of (parsed.profiles||[])){
        const d=(parsed.dataByProfile||{})[p&&p.id];
        if(!d||!d.__syncMeta||Number(d.__syncMeta.schemaVersion)<6401||d.__syncMeta.migrationVersion!==BorionSyncCore.BORION_MIGRATION_ID_VERSION){migrationRequired=true;break;}
        for(const path of BorionSyncCore.BORION_SYNCABLE_COLLECTIONS){
          const arr=BorionSyncCore.pathGet(d,path);
          if(Array.isArray(arr)&&arr.some(x=>x&&typeof x==='object'&&!x.id)){migrationRequired=true;break;}
        }
        if(migrationRequired)break;
      }
    }else migrationRequired=true;
    if(!migrationRequired&&window.BorionDriveJournal640){
      try{const snapshotCheck=await BorionDriveJournal640.validateSnapshot(parsed);if(!snapshotCheck.valid)migrationRequired=true;}
      catch(e){migrationRequired=true;}
    }
    if(!migrationRequired) return {notRequired:true,schemaVersion:6401};

    const checksum=window.BorionSyncCore?await BorionSyncCore.sha256Hex640(rawText):await sha256Hex(rawText);
    const prior=readJSON(key,false);
    if(prior&&prior.fileId&&prior.checksum&&window.GoogleDriveProvider&&GoogleDriveProvider.isConnected()){
      try{
        const priorRaw=await GoogleDriveFS.readFileText(prior.fileId);
        const priorChecksum=window.BorionSyncCore?await BorionSyncCore.sha256Hex640(priorRaw):await sha256Hex(priorRaw);
        const priorParsed=JSON.parse(priorRaw),priorCheck=validateBorionJson(priorParsed);
        if(priorChecksum===prior.checksum&&priorChecksum===checksum&&priorCheck.valid) return {alreadyDone:true,backup:{id:prior.fileId},checksum:priorChecksum,exactBytes:true,verifiedAgain:true};
      }catch(e){ console.warn('[BORION_BACKUP][PRE_MIGRATION_REVERIFY_FAILED]',e); }
      try{localStorage.removeItem(key);}catch(e){}
    }else if(prior){try{localStorage.removeItem(key);}catch(e){}}
    if(!window.GoogleDriveProvider||!GoogleDriveProvider.isConnected()) throw Object.assign(new Error('Conecte o Google Drive para criar o backup pré-migração obrigatório.'),{code:'MIGRATION_BACKUP_REQUIRED'});
    const backupsFolderId=await GoogleDriveProvider.ensureBackupsFolder();
    const name='backup_original_pre_migracao_v6401_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
    const created=await GoogleDriveFS.createTextFile(backupsFolderId,name,rawText,'application/json');
    const reread=await GoogleDriveFS.readFileText(created.id);
    const rereadChecksum=window.BorionSyncCore?await BorionSyncCore.sha256Hex640(reread):await sha256Hex(reread);
    if(rereadChecksum!==checksum) throw Object.assign(new Error('O backup pré-migração foi criado, mas falhou na conferência de checksum.'),{code:'MIGRATION_BACKUP_VERIFY_FAILED'});
    let restored; try{restored=JSON.parse(reread);}catch(e){throw Object.assign(new Error('O backup pré-migração não pôde ser relido como JSON.'),{code:'MIGRATION_BACKUP_VERIFY_FAILED'});}
    const restoreCheck=validateBorionJson(restored);
    if(!restoreCheck.valid) throw Object.assign(new Error('O backup pré-migração não é restaurável: '+restoreCheck.errors.join(' ')),{code:'MIGRATION_BACKUP_VERIFY_FAILED'});
    writeJSON(key,{at:Date.now(),checksum,fileId:created.id,sourceFileId:context.sourceFileId||null,exactBytes:true});
    return {alreadyDone:false,backup:{id:created.id,name},checksum,exactBytes:true};
  },

  async ensureSchemaMigrationBackup(context={}){
    if(context&&context.rawText!=null) return await this.ensureRawSchemaMigrationBackup(context);
    const folderId=(window.GoogleDriveProvider&&GoogleDriveProvider.folderId)||'local';
    const key='borion_schema6401_raw_backup_done_'+backupUserKey()+'_'+folderId;
    if(readJSON(key,false)) return {alreadyDone:true};
    throw Object.assign(new Error('Backup pré-migração exato ainda não foi confirmado; migração bloqueada.'),{code:'MIGRATION_BACKUP_REQUIRED'});
  },

  /* Item 15.3: além dos 20 autosaves e 40 forcesaves rotativos (que se
     sobrescrevem), mantém um ponto IMUTÁVEL por dia (nunca sobrescrito),
     com retenção mínima de 30 dias — a limpeza remove só os mais antigos que
     já passaram da janela, nunca todos de uma vez. */
  async maybeDailyDriveSnapshot(){
    if(!window.GoogleDriveProvider || !GoogleDriveProvider.isConnected() || !navigator.onLine) return false;
    const todayKey = new Date().toISOString().slice(0,10); // AAAA-MM-DD
    const lsKey = 'borion_daily_snapshot_v640_' + GoogleDriveProvider.folderId;
    const last = localStorage.getItem(lsKey);
    if(last === todayKey) return false;
    try{
      const payload = await buildSharedBackupSnapshot('daily_immutable', 'ponto diário imutável (V6.40 — Dados e Segurança, item 15.3)');
      const created = await GoogleDriveProvider.createBackup('daily_'+todayKey, {payload});
      localStorage.setItem(lsKey, todayKey);
      await this._pruneDailySnapshots();
      return created;
    }catch(e){ console.warn('[BORION_BACKUP][DAILY_SNAPSHOT_FAILED]', e); return false; }
  },
  async _pruneDailySnapshots(retentionDays=30){
    if(!window.GoogleDriveProvider || !GoogleDriveProvider.isConnected()) return;
    try{
      const files = await GoogleDriveProvider.listBackups();
      const dailyFiles = files.filter(f=>/_daily_\d{4}-\d{2}-\d{2}_/.test(f.name)).sort((a,b)=> a.name<b.name?-1:1);
      const toRemove = dailyFiles.length>retentionDays ? dailyFiles.slice(0, dailyFiles.length-retentionDays) : [];
      for(const f of toRemove){
        try{ await GoogleDriveFS.trashFile(f.id); }
        catch(e){ console.warn('[BORION_BACKUP][DAILY_PRUNE_FAILED]', f.name, e); }
      }
    }catch(e){ console.warn('[BORION_BACKUP][DAILY_PRUNE_LIST_FAILED]', e); }
  },

  /* Item 15.4: NÃO aplica nada — só lê, valida JSON/schema/checksum, migra EM
     MEMÓRIA (nunca grava) e devolve um resumo (perfis, contagens por coleção,
     referências quebradas via BorionDataGuard) para a pessoa decidir se quer
     mesmo restaurar. Quem chama decide separadamente se/quando aplicar de
     verdade (fora desta função, com backup do estado atual antes — ver
     Settings.restoreFromBackupFile ou equivalente). */
  async simulateRestore(rawObjOrString){
    const result = { valid:false, errors:[], profiles:[], counts:null, integrityReport:null };
    let obj = rawObjOrString;
    if(typeof rawObjOrString==='string'){
      try{ obj = JSON.parse(rawObjOrString); }
      catch(e){ result.errors.push('JSON inválido: '+e.message); return result; }
    }
    const check = validateBorionJson(obj);
    if(!check.valid){ result.errors.push(...check.errors); return result; }
    if(obj.integrity && obj.integrity.sha256){
      const canonical = backupSafeClone(obj); delete canonical.integrity; delete canonical.snapshotChecksum;
      const recomputed = typeof sha256Hex==='function' ? await sha256Hex(JSON.stringify({profiles:canonical.profiles,dataByProfile:canonical.dataByProfile,config:canonical.config||{}})) : null;
      // Checksum antigo (backupSchema 5352) usa uma serialização específica de
      // {profiles,dataByProfile,config} — recalculado aqui só como conferência
      // best-effort; uma divergência gera aviso, não bloqueia a simulação (o
      // arquivo pode ser legítimo e só ter sido salvo por uma versão anterior
      // com uma ordem de campos diferente).
      if(recomputed && recomputed!==obj.integrity.sha256) result.errors.push('Aviso: o checksum salvo no arquivo não bateu com o recalculado — confira a origem do arquivo antes de aplicar.');
    }
    let migratedDataByProfile = {};
    try{
      Object.keys(obj.dataByProfile||{}).forEach(pid=>{
        migratedDataByProfile[pid] = migrateData(JSON.parse(JSON.stringify(obj.dataByProfile[pid]||{})), {profileId:pid});
      });
    }catch(e){ result.errors.push('Falha ao migrar os dados em memória para conferência: '+e.message); return result; }
    const migratedPayload = { profiles: obj.profiles||[], dataByProfile: migratedDataByProfile };
    result.profiles = (obj.profiles||[]).map(p=>({ id:p.id, name:p.name }));
    result.counts = window.BorionDataGuard ? BorionDataGuard.countAccountRecords(migratedPayload) : null;
    if(window.BorionDataGuard){
      result.integrityReport = BorionDataGuard.buildProfileIntegrityReport(migratedPayload, null, {});
    }
    result.valid = result.errors.length===0;
    return result;
  },

  async maybeDailyCloudBackup(){
    const cloud=window.CloudStorage;
    if(!cloud || !cloud.user || !navigator.onLine) return false;
    const last=readJSON(this.lastCloudKey(), null);
    if(last && last.at && Date.now()-last.at < 24*60*60*1000) return false;
    try{
      const row=await this.createCloudBackup('auto_daily','backup diário criado automaticamente quando o Borion abriu/sincronizou',{silent:true});
      if(row) writeJSON(this.lastCloudKey(), {at:Date.now(), rowId:row.id});
      return !!row;
    }catch(e){ console.warn('[BORION_BACKUP][AUTO_DAILY][ERROR]', e); return false; }
  },

  async createCloudBackup(backupType='manual', reason='backup manual', options={}){
    const cloud=window.CloudStorage;
    if(!cloud || !cloud.client || !cloud.user) throw new Error('Entre na conta Borion Cloud para salvar backup no Supabase.');
    if(!navigator.onLine) throw new Error('Sem internet. Não foi possível criar backup no Supabase agora.');
    if(S.currentProfile && S.data){ try{ await cloud.syncNow(); }catch(e){} }
    const payload=await buildCloudAccountBackupPayload(backupType, reason);
    const meta={
      user_id:cloud.user.id,
      backup_type:backupType,
      app_version:BORION_APP_VERSION,
      profile_count:payload.profileCount||((payload.profiles||[]).length),
      backup_json:payload,
      reason:reason||'',
      source:payload.source||'app',
      checksum:(payload.integrity&&payload.integrity.sha256)||'',
      created_at:new Date().toISOString()
    };
    console.log('[BORION_BACKUP][CREATE_CLOUD_BACKUP][START]', {backupType, reason, profileCount:meta.profile_count});
    const {data,error}=await cloud.client
      .from('borion_backups')
      .insert(meta)
      .select('id,created_at,backup_type,profile_count,app_version,reason,source,checksum')
      .single();
    if(error) throw new Error('CREATE_CLOUD_BACKUP: '+((typeof cloudErrorMessage==='function')?cloudErrorMessage(error):(error.message||String(error))));
    console.log('[BORION_BACKUP][CREATE_CLOUD_BACKUP][SUCCESS]', data);
    if(!options.silent) toast('Backup salvo no Supabase em borion_backups.');
    return data;
  },

  async listCloudBackups(){
    const cloud=window.CloudStorage;
    if(!cloud || !cloud.client || !cloud.user) throw new Error('Entre na conta Borion Cloud para ver backups.');
    const {data,error}=await cloud.client
      .from('borion_backups')
      .select('id,created_at,backup_type,profile_count,app_version,reason,source,checksum')
      .eq('user_id',cloud.user.id)
      .order('created_at',{ascending:false})
      .limit(30);
    if(error) throw new Error('LIST_CLOUD_BACKUPS: '+((typeof cloudErrorMessage==='function')?cloudErrorMessage(error):(error.message||String(error))));
    return data||[];
  },

  async readCloudBackup(id){
    const cloud=window.CloudStorage;
    if(!cloud || !cloud.client || !cloud.user) throw new Error('Entre na conta Borion Cloud para ler backups.');
    const {data,error}=await cloud.client
      .from('borion_backups')
      .select('id,created_at,backup_type,profile_count,app_version,reason,source,checksum,backup_json')
      .eq('id',id)
      .eq('user_id',cloud.user.id)
      .single();
    if(error) throw new Error('READ_CLOUD_BACKUP: '+((typeof cloudErrorMessage==='function')?cloudErrorMessage(error):(error.message||String(error))));
    return data;
  },

  async downloadCloudBackup(id){
    try{
      const row=await this.readCloudBackup(id);
      downloadJSON(row.backup_json, backupFilename('borion-backup-supabase'));
      toast('Backup do Supabase baixado em JSON.');
    }catch(e){ alert(e.message||String(e)); }
  },

  async restoreCloudBackup(id){
    try{
      const row=await this.readCloudBackup(id);
      this.confirmRestoreAccountPayload(row.backup_json, `backup salvo em ${new Date(row.created_at).toLocaleString('pt-BR')}`);
    }catch(e){ alert(e.message||String(e)); }
  },

  confirmRestoreAccountPayload(payload, label='arquivo de backup'){
    const count=(payload&&payload.profiles&&payload.profiles.length)||0;
    openConfirmModal({
      title:'Restaurar backup completo',
      text:`Você vai substituir os perfis e dados financeiros desta conta pelo ${label}. O Borion cria um backup de segurança antes da restauração. Perfis no backup: ${count}.`,
      confirmLabel:'Restaurar conta',
      cancelLabel:'Cancelar',
      variant:'danger',
      onConfirm:()=>this.restoreAccountPayloadToCloud(payload)
    });
  },

  async restoreAccountPayloadToCloud(payload){
    const cloud=window.CloudStorage;
    if(!cloud || !cloud.client || !cloud.user) throw new Error('Entre na conta Borion Cloud para restaurar backup completo.');
    if(!payload || !payload.profiles || !payload.dataByProfile) throw new Error('Backup completo inválido ou incompleto.');
    if((payload.profiles||[]).length>5) throw new Error('Este backup tem mais de 5 perfis. O Borion permite até 5 perfis por conta.');
    try{
      await this.createCloudBackup('before_restore_account','backup automático antes de restaurar conta',{silent:true});
      console.warn('[BORION_BACKUP][RESTORE_ACCOUNT][START]', {profiles:(payload.profiles||[]).length});
      const idMap={};
      const profileRows=(payload.profiles||[]).map(p=>{
        const newId=(typeof isValidUUID==='function' && isValidUUID(p.id)) ? p.id : uid();
        idMap[p.id]=newId;
        return {
          id:newId,
          user_id:cloud.user.id,
          name:p.name||'Perfil restaurado',
          avatar_color:p.avatarColor||p.avatar_color||'#1f8a5b',
          avatar_image:p.avatarImage||p.avatar_image||'',
          password_hash:p.passwordHash||p.password_hash||null,
          password_salt:p.salt||p.password_salt||null,
          updated_at:new Date().toISOString()
        };
      });
      const {error:delError}=await cloud.client.from('profiles').delete().eq('user_id',cloud.user.id);
      if(delError) throw new Error('RESTORE delete profiles: '+((typeof cloudErrorMessage==='function')?cloudErrorMessage(delError):(delError.message||String(delError))));
      const {data:insertedProfiles,error:insError}=await cloud.client
        .from('profiles')
        .insert(profileRows)
        .select('id,name');
      if(insError) throw new Error('RESTORE insert profiles: '+((typeof cloudErrorMessage==='function')?cloudErrorMessage(insError):(insError.message||String(insError))));
      const dataRows=profileRows.map(p=>{
        const originalId=Object.keys(idMap).find(k=>idMap[k]===p.id) || p.id;
        return {
          user_id:cloud.user.id,
          profile_id:p.id,
          data:migrateData((payload.dataByProfile||{})[originalId]||(payload.dataByProfile||{})[p.id]||emptyData(), {profileId:p.id}),
          sync_version:Date.now(),
          updated_at:new Date().toISOString()
        };
      });
      const {error:dataError}=await cloud.client.from('borion_profile_data').insert(dataRows);
      if(dataError) throw new Error('RESTORE insert borion_profile_data: '+((typeof cloudErrorMessage==='function')?cloudErrorMessage(dataError):(dataError.message||String(dataError))));
      if(payload.config){ S.config=payload.config; setConfig(S.config); applyFont(); applyTheme(); }
      await cloud.loadProfiles();
      S.data=null; S.currentProfile=null; S.gate={mode:'list',error:''};
      closeModal();
      renderGate();
      toast('Backup restaurado. Escolha o perfil para entrar.');
      console.log('[BORION_BACKUP][RESTORE_ACCOUNT][SUCCESS]', {insertedProfiles});
    }catch(e){
      console.error('[BORION_BACKUP][RESTORE_ACCOUNT][ERROR]', e);
      alert('Restauração não concluída:\n\n'+(e.message||String(e))+'\n\nSe algo ficou errado, restaure o backup before_restore_account em borion_backups.');
    }
  },

  async restoreAccountPayloadFromFile(payload){
    this.confirmRestoreAccountPayload(payload, 'arquivo JSON selecionado');
  },

  showConsentModal(){
    const userEmail=(window.CloudStorage&&CloudStorage.user&&CloudStorage.user.email)||'';
    const box = el(`
      <div class="modal-overlay">
        <div class="modal-box backup-consent-box">
          <div class="modal-head"><h2>Proteção de dados do Borion</h2><button id="bk_close">&times;</button></div>
          <p class="modal-sub">Dados financeiros são sensíveis. Antes de usar a nuvem com tranquilidade, configure sua política de backup.</p>
          <div class="backup-consent-list">
            <div><b>1. Backup completo</b><span>Inclui perfis, cores, senhas de perfil em hash e todos os dados financeiros.</span></div>
            <div><b>2. Supabase</b><span>Snapshots ficam em <code>public.borion_backups</code>, separados dos dados vivos.</span></div>
            <div><b>3. Computador</b><span>No Chrome/Edge você pode escolher uma pasta local, de preferência dentro do Google Drive/OneDrive.</span></div>
            <div><b>4. Segurança</b><span>Antes de excluir/restaurar dados, o Borion tenta criar um backup de segurança.</span></div>
          </div>
          <div class="info-box">Conta atual: <b>${esc(userEmail||'local')}</b>. O navegador só permite salvar em pasta fixa depois que você autoriza manualmente.</div>
          <div class="row-btns" style="margin-top:12px;">
            <button class="btn btn-primary btn-block" id="bk_accept_folder">Concordo e escolher pasta</button>
            <button class="btn-outline btn-block" id="bk_accept_cloud">Concordo, usar só Supabase/JSON</button>
          </div>
          <button class="link-btn" id="bk_later" style="width:100%;margin-top:10px;">Lembrar depois</button>
        </div>
      </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#bk_close').onclick=()=>{ this.snoozeConsent(); closeModal(); };
    $('#bk_later').onclick=()=>{ this.snoozeConsent(); closeModal(); };
    $('#bk_accept_folder').onclick=async ()=>{ this.setConsent('folder_requested'); closeModal(); await this.choose(); try{ await this.createCloudBackup('first_setup','backup inicial após aceite de proteção de dados',{silent:true}); }catch(e){ console.warn('[BORION_BACKUP][FIRST_SETUP][ERROR]', e); } };
    $('#bk_accept_cloud').onclick=async ()=>{ this.setConsent('cloud_json'); closeModal(); try{ await this.createCloudBackup('first_setup','backup inicial após aceite de proteção de dados'); }catch(e){ alert('Aceite salvo, mas o backup no Supabase falhou. Rode o SQL V5.35.1 e tente em Configurações > Backups.\n\n'+(e.message||String(e))); } };
  },

  maybeShowConsentOnLogin(){
    if(!this.shouldShowConsent()) { this.maybeDailyCloudBackup(); return; }
    setTimeout(()=>{ if(typeof openConfirmModal==='function') this.showConsentModal(); }, 650);
  }
};

window.BackupFS = BackupFS;
document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState==='hidden') BackupFS.maybeAutoBackup(); });
window.addEventListener('pagehide', ()=>{ BackupFS.maybeAutoBackup(); });
setInterval(()=> BackupFS.maybeAutoBackup(), 5*60*1000);
setInterval(()=> BackupFS.maybeDailyCloudBackup(), 60*60*1000);
