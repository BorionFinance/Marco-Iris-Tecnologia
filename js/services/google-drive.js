(() => {
  'use strict';
  const DEFAULT_CLIENT_ID='946105310952-gp143h81mm3704lrq3877hsie49njgak.apps.googleusercontent.com';
  const DEFAULT_API_KEY='AIzaSyAMm_8CtFg_YP2ssG4XaiBbOc7wuJFq7xs';
  const DEFAULT_PROJECT_NUMBER='946105310952';
  const SCOPES='openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file';
  const ALLOWED_ACCOUNT_HASHES=new Set(['134e106b0600045a12cf9722057a06fad862df6d45b5fece1eb7180729569ea2','db9c91e0d2956a89a70d9683b4a2a4d048b9cde255f861425342fe877b48339c']);
  const DATA_FILE='Marco_Iris_Dados.json';
  const DATA_FILE_ID_PREFIX='marco_iris_v240_gdrive_data_file_';
  const USER_KEY='marco_iris_v240_gdrive_user';
  const ROOT_PREFIX='marco_iris_v240_gdrive_root_';
  const STRUCT_PREFIX='marco_iris_v240_gdrive_structure_';
  const LAST_SAVE='marco_iris_v240_last_google_save';
  const FOLDERS={data:'Dados',backups:'Backups',photos:'Fotos_OS',pdfs:'Ordens_de_Servico',attachments:'Anexos',integration:'Borion_Integracoes'};
  const AUTOSAVE_SLOTS=20;
  const FORCESAVE_SLOTS=20;
  const AUTOSAVE_INTERVAL_MS=60*1000;
  const BACKUP_SLOT_PREFIX='marco_iris_v240_backup_slot_';
  const INSTALLATION_FILE='Marco_Iris_Instalacao.json';
  let structurePromise=null;
  let connectionPromise=null;
  const integrationFileIds=new Map();
  const integrationFilePromises=new Map();
  const dataFilePromises=new Map();


  function jsonClone(value){return value==null?value:JSON.parse(JSON.stringify(value));}
  function canonical(value){if(Array.isArray(value))return value.map(canonical);if(value&&typeof value==='object'){const out={};Object.keys(value).sort().forEach(k=>{if(k!=='integrity')out[k]=canonical(value[k]);});return out;}return value;}
  async function stateChecksum(state){const text=JSON.stringify(canonical(state));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function contentChecksum(state){const clean=jsonClone(state||{});delete clean.driveSync;delete clean.updatedAt;delete clean.integrity;const bridge=clean?.interconnections?.borion;if(bridge&&typeof bridge==='object'){delete bridge.deviceId;delete bridge.lastPublishAt;delete bridge.lastPublishStatus;delete bridge.lastError;}const text=JSON.stringify(canonical(clean));const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');}
  function valueEqual(a,b){return JSON.stringify(canonical(a))===JSON.stringify(canonical(b));}
  function itemKey(item,index=0){return String(item?.id||item?.code||item?.key||item?.sourceRecordId||item?.aggregateId||`__index_${index}`);}
  function mergeArrayDelta(baseArr,localArr,remoteArr){
    const base=Array.isArray(baseArr)?baseArr:[],local=Array.isArray(localArr)?localArr:[],remote=Array.isArray(remoteArr)?remoteArr:[];
    const bm=new Map(base.map((item,index)=>[itemKey(item,index),item])),lm=new Map(local.map((item,index)=>[itemKey(item,index),item])),rm=new Map(remote.map((item,index)=>[itemKey(item,index),jsonClone(item)]));
    const order=remote.map((item,index)=>itemKey(item,index));
    for(const [key,baseItem] of bm){
      if(!lm.has(key)){rm.delete(key);continue;}
      const localItem=lm.get(key);if(!valueEqual(localItem,baseItem))rm.set(key,jsonClone(localItem));
    }
    for(const [key,localItem] of lm){if(!bm.has(key)){rm.set(key,jsonClone(localItem));if(!order.includes(key))order.push(key);}}
    return [...order.filter((key,index)=>order.indexOf(key)===index&&rm.has(key)).map(key=>rm.get(key)),...[...rm.entries()].filter(([key])=>!order.includes(key)).map(([,item])=>item)];
  }
  function mergeObjectDelta(base,local,remote){
    if(Array.isArray(base)||Array.isArray(local)||Array.isArray(remote))return mergeArrayDelta(base,local,remote);
    if(!local||typeof local!=='object'||!remote||typeof remote!=='object'||!base||typeof base!=='object')return !valueEqual(local,base)?jsonClone(local):jsonClone(remote);
    const out=jsonClone(remote);
    for(const key of new Set([...Object.keys(base),...Object.keys(local)])){
      if(!(key in local)){delete out[key];continue;}
      if(!(key in base)){out[key]=jsonClone(local[key]);continue;}
      if(valueEqual(local[key],base[key]))continue;
      if(local[key]&&typeof local[key]==='object'&&base[key]&&typeof base[key]==='object'&&remote[key]&&typeof remote[key]==='object')out[key]=mergeObjectDelta(base[key],local[key],remote[key]);
      else out[key]=jsonClone(local[key]);
    }
    return out;
  }
  function rebaseLocalChanges(baseState,localState,remoteState){
    if(!baseState||!localState||!remoteState)throw new Error('Não foi possível reconciliar as alterações entre dispositivos sem a base de sincronização.');
    const merged=mergeObjectDelta(baseState,localState,remoteState);
    merged.driveSync=jsonClone(remoteState.driveSync||{});
    merged.updatedAt=String(localState.updatedAt||remoteState.updatedAt||new Date().toISOString());
    ensureCompanyId(merged);
    return merged;
  }
  const SOURCE_COLLECTIONS=['clients','serviceOrders','orderItems','payments','products','services','supplies','stockMovements','appointments','consents'];
  function sourceCount(state){let total=0;for(const d of Object.values(state?.dataByProfile||{})){if(!d||typeof d!=='object')continue;for(const k of SOURCE_COLLECTIONS)total+=Array.isArray(d[k])?d[k].length:0;}return total;}
  function explicitLocalDeletionCoverage(localState,remoteState){
    const tombstones=localState?.interconnections?.borion?.tombstones;
    if(!Array.isArray(tombstones)||!tombstones.length)return false;
    const tombstoneKeys=new Set(tombstones.flatMap(item=>[String(item?.sourceRecordId||''),String(item?.entityId||''),String(item?.aggregateId||'')]).filter(Boolean));
    let missing=0;
    for(const [profileId,remoteData] of Object.entries(remoteState?.dataByProfile||{})){
      const localData=localState?.dataByProfile?.[profileId]||{};
      for(const collection of SOURCE_COLLECTIONS){
        const localIds=new Set((localData?.[collection]||[]).map(item=>String(item?.id||item?.code||'')).filter(Boolean));
        for(const item of (remoteData?.[collection]||[])){
          const entityId=String(item?.code||item?.id||'').trim();
          if(entityId&&localIds.has(entityId))continue;
          missing++;
          if(collection!=='payments'||!entityId)return false;
          const normalized=String(item?.type||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
          const kind=normalized==='despesa'?'expense':'receipt';
          const sourceRecordId=`marco:${kind}:${entityId}`;
          if(!tombstoneKeys.has(sourceRecordId)&&!tombstoneKeys.has(entityId))return false;
        }
      }
    }
    return missing>0;
  }
  function companyIdOf(state){return String(state?.interconnections?.borion?.companyInstanceId||state?.interconnections?.borion?.instanceId||'').trim();}
  function ensureCompanyId(state){
    if(!state.interconnections||typeof state.interconnections!=='object')state.interconnections={};
    if(!state.interconnections.borion||typeof state.interconnections.borion!=='object')state.interconnections.borion={};
    const b=state.interconnections.borion;let id=String(b.companyInstanceId||b.instanceId||'').trim();
    if(!id)id=(globalThis.crypto?.randomUUID?.()||('company_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)));
    b.companyInstanceId=id;b.instanceId=id;return id;
  }
  function validateOfficialState(state){
    const errors=[];
    if(!state||typeof state!=='object'||Array.isArray(state))errors.push('JSON raiz inválido.');
    if(!Array.isArray(state?.profiles))errors.push('Lista de perfis ausente.');
    if(!state?.dataByProfile||typeof state.dataByProfile!=='object')errors.push('dataByProfile ausente.');
    if(state?.profiles?.length&&!Object.keys(state.dataByProfile||{}).length)errors.push('Perfis sem base de dados correspondente.');
    return {valid:errors.length===0,errors,count:sourceCount(state)};
  }
  async function prepareOfficialState(state,remoteState=null){
    const next=jsonClone(state||{});ensureCompanyId(next);const currentRev=Math.max(0,Number(next?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
    next.driveSync=Object.assign({},next.driveSync||{},{schemaVersion:1,companyInstanceId:companyIdOf(next),revision:Math.max(currentRev,remoteRev)+1,previousRevision:remoteRev,updatedByDevice:window.MarcoBorionInterop?.getRuntimeStatus?.().deviceId||'',updatedAt:new Date().toISOString()});
    next.updatedAt=new Date().toISOString();next.driveSync.checksum=await stateChecksum(next);return next;
  }
  function assertSafeReplacement(sessionState,remoteState){
    const sessionCheck=validateOfficialState(sessionState),remoteCheck=validateOfficialState(remoteState);
    if(!sessionCheck.valid)throw new Error('A sessão atual é inválida: '+sessionCheck.errors.join(' '));
    if(!remoteCheck.valid)throw new Error('A base oficial do Drive é inválida: '+remoteCheck.errors.join(' '));
    const sc=companyIdOf(sessionState),rc=companyIdOf(remoteState);
    if(rc&&sc&&rc!==sc){const e=new Error('Conflito de instalação: o identificador oficial da empresa é diferente. Nenhum dado foi enviado.');e.code='COMPANY_INSTANCE_CONFLICT';throw e;}
    const known=Math.max(0,Number(sessionState?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
    if(remoteRev>known){const e=new Error('O Google Drive possui uma revisão mais nova. A alteração será conciliada com a base oficial.');e.code='REMOTE_NEWER';throw e;}
    return true;
  }

  function config(){
    return {clientId:DEFAULT_CLIENT_ID,apiKey:DEFAULT_API_KEY,projectNumber:DEFAULT_PROJECT_NUMBER};
  }
  function validateConfig(){const c=config();if(!c.clientId||!c.apiKey||!c.projectNumber)throw new Error('A conexão com o Google Drive não está disponível nesta versão do aplicativo.');return c;}
  const Auth={token:'',expiresAt:0,user:null,gisLoaded:false,pickerLoaded:false,tokenClient:null,
    loadScript(src){return new Promise((resolve,reject)=>{if(document.querySelector(`script[src="${src}"]`)){resolve();return;}const s=document.createElement('script');s.src=src;s.async=true;s.defer=true;s.onload=resolve;s.onerror=()=>reject(new Error('Não foi possível carregar os serviços do Google.'));document.head.appendChild(s);});},
    async libraries(){if(!this.gisLoaded){await this.loadScript('https://accounts.google.com/gsi/client');this.gisLoaded=true;}if(!this.pickerLoaded){await this.loadScript('https://apis.google.com/js/api.js');await new Promise(r=>gapi.load('picker',r));this.pickerLoaded=true;}},
    async request(interactive=false){const cfg=validateConfig();await this.libraries();return await new Promise((resolve,reject)=>{this.tokenClient=google.accounts.oauth2.initTokenClient({client_id:cfg.clientId,scope:SCOPES,callback:r=>{if(r.error){reject(new Error(`O Google recusou o acesso: ${r.error}`));return;}this.token=r.access_token;this.expiresAt=Date.now()+((r.expires_in||3300)*1000);resolve(this.token);},error_callback:e=>reject(new Error(e?.message||'Login com Google cancelado.'))});this.tokenClient.requestAccessToken({prompt:interactive?'select_account':''});});},
    async ensure(interactive=false){if(this.token&&Date.now()<this.expiresAt-60000)return this.token;return await this.request(interactive);},
    async fetchUser(){const r=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:`Bearer ${this.token}`}});if(!r.ok)throw new Error('Não foi possível confirmar a conta Google.');const i=await r.json();this.user={sub:i.sub,email:i.email,name:i.name||i.email,picture:i.picture||''};localStorage.setItem(USER_KEY,JSON.stringify(this.user));return this.user;},
    cached(){if(this.user)return this.user;try{this.user=JSON.parse(localStorage.getItem(USER_KEY)||'null');}catch(_){this.user=null;}return this.user;},
    signOut(){if(this.token){try{google.accounts.oauth2.revoke(this.token,()=>{});}catch(_){}}this.token='';this.expiresAt=0;this.user=null;localStorage.removeItem(USER_KEY);}
  };
  async function accountHash(email){const normalized=String(email||'').trim().toLowerCase();if(!normalized||!globalThis.crypto?.subtle)return '';const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(normalized));return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');}
  async function assertAuthorizedUser(user){const hash=await accountHash(user?.email);if(!hash||!ALLOWED_ACCOUNT_HASHES.has(hash)){Auth.signOut();throw new Error('Esta conta Google não está autorizada a acessar o Marco Iris Tecnologia.');}return user;}
  async function authenticateGoogle(interactive=true){await Auth.ensure(interactive);return await assertAuthorizedUser(await Auth.fetchUser());}
  async function headers(json=false){const token=await Auth.ensure(false);return json?{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}:{Authorization:`Bearer ${token}`};}
  function safeQuery(v){return String(v).replace(/'/g,"\\'");}
  async function findChildren(parentId,name,mimeType=''){
    let q=`'${parentId}' in parents and name='${safeQuery(name)}' and trashed=false`;if(mimeType)q+=` and mimeType='${mimeType}'`;
    const params=new URLSearchParams({q,orderBy:'createdTime asc',pageSize:'100',fields:'files(id,name,mimeType,createdTime,modifiedTime,size,parents,trashed,webViewLink,webContentLink,thumbnailLink)'});
    const r=await fetch(`https://www.googleapis.com/drive/v3/files?${params}`,{headers:await headers()});
    if(!r.ok)throw new Error('Falha ao consultar o Google Drive.');const result=await r.json();return Array.isArray(result.files)?result.files:[];
  }
  async function findChild(parentId,name,mimeType=''){
    const files=await findChildren(parentId,name,mimeType);if(files.length>1)console.warn(`[GOOGLE_DRIVE] Existem ${files.length} itens chamados “${name}”. O mais antigo será reutilizado.`);return files[0]||null;
  }
  async function createMetadata(meta){const r=await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,createdTime,modifiedTime,size,parents,trashed,webViewLink,webContentLink',{method:'POST',headers:await headers(true),body:JSON.stringify(meta)});if(!r.ok)throw new Error(`Falha ao criar “${meta.name}” no Google Drive.`);return await r.json();}
  async function createFolder(parentId,name){return await createMetadata({name,mimeType:'application/vnd.google-apps.folder',parents:[parentId]});}
  async function uploadMediaContent(fileId,blob){const r=await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&fields=id,name,mimeType,modifiedTime,size,webViewLink,webContentLink,thumbnailLink`,{method:'PATCH',headers:{...(await headers()),'Content-Type':blob.type||'application/octet-stream'},body:blob});if(!r.ok)throw new Error('Falha ao enviar o arquivo para o Google Drive.');return await r.json();}
  async function updateJson(fileId,obj){return await uploadMediaContent(fileId,new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}));}
  async function readJson(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers:await headers()});if(!r.ok)throw new Error('Falha ao carregar os dados do Google Drive.');return await r.json();}
  async function meta(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,createdTime,modifiedTime,size,parents,trashed,webViewLink,webContentLink,thumbnailLink`,{headers:await headers()});if(!r.ok){const e=new Error('Falha ao consultar o arquivo no Google Drive.');e.status=r.status;throw e;}return await r.json();}
  async function downloadBlob(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,{headers:await headers()});if(!r.ok)throw new Error('Falha ao baixar o arquivo do Google Drive.');return await r.blob();}
  async function trash(fileId){const r=await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`,{method:'PATCH',headers:await headers(true),body:JSON.stringify({trashed:true})});if(!r.ok)throw new Error('Falha ao mover o arquivo para a lixeira do Drive.');return true;}
  function rootKey(sub){return `${ROOT_PREFIX}${sub}`;}function structKey(root){return `${STRUCT_PREFIX}${root}`;}
  function rootId(){const u=Auth.cached();return u?localStorage.getItem(rootKey(u.sub))||'':'';}
  function setRoot(id){const u=Auth.cached();if(u)localStorage.setItem(rootKey(u.sub),id);}
  function clearRoot(){const u=Auth.cached(),root=rootId();if(u)localStorage.removeItem(rootKey(u.sub));if(root)localStorage.removeItem(structKey(root));}
  function cachedStructure(){const root=rootId();if(!root)return null;try{return JSON.parse(localStorage.getItem(structKey(root))||'null');}catch(_){return null;}}
  function setStructure(v){if(v?.rootId)localStorage.setItem(structKey(v.rootId),JSON.stringify(v));}
  function picker(){return new Promise((resolve,reject)=>{const cfg=validateConfig(),view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true).setMimeTypes('application/vnd.google-apps.folder');const p=new google.picker.PickerBuilder().setTitle('Escolha a pasta principal da Marco Iris').addView(view).setOAuthToken(Auth.token).setDeveloperKey(cfg.apiKey).setAppId(cfg.projectNumber).setCallback(d=>{if(d.action===google.picker.Action.PICKED)resolve(d.docs[0]);else if(d.action===google.picker.Action.CANCEL)reject(new Error('Nenhuma pasta foi selecionada.'));}).build();p.setVisible(true);});}
  function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
  async function withCrossTabLock(name,task){
    if(navigator?.locks?.request)return await navigator.locks.request(name,task);
    const key=`marco_iris_v240_mutex_${encodeURIComponent(name)}`,token=`${Date.now()}_${Math.random().toString(36).slice(2)}`,deadline=Date.now()+30000;
    while(Date.now()<deadline){let current=null;try{current=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
      if(!current||Number(current.expiresAt)<Date.now()){localStorage.setItem(key,JSON.stringify({token,expiresAt:Date.now()+30000}));let confirmed=null;try{confirmed=JSON.parse(localStorage.getItem(key)||'null');}catch(_){}
        if(confirmed?.token===token){try{return await task();}finally{try{const latest=JSON.parse(localStorage.getItem(key)||'null');if(latest?.token===token)localStorage.removeItem(key);}catch(_){localStorage.removeItem(key);}}}}
      await sleep(120+Math.floor(Math.random()*120));
    }
    throw new Error('Outra aba ainda está preparando as pastas do Google Drive. Feche as abas duplicadas e tente novamente.');
  }
  function validFolder(info,root,name){return !!info&&!info.trashed&&info.mimeType==='application/vnd.google-apps.folder'&&info.name===name&&(info.parents||[]).includes(root);}
  async function validateStructure(root,c){
    if(!c||c.rootId!==root)return null;const normalized={rootId:root};
    for(const [key,name] of Object.entries(FOLDERS)){const id=c[key];if(!id)return null;try{const info=await meta(id);if(!validFolder(info,root,name))return null;normalized[key]=id;}catch(_){return null;}}
    return normalized;
  }
  async function ensureStructure(force=false){
    const root=rootId();if(!root)throw new Error('Escolha primeiro uma pasta do Google Drive.');
    if(!force){const c=await validateStructure(root,cachedStructure());if(c)return c;}
    // V2.4.0 — antes, se a pasta RAIZ em si fosse excluída/movida pra lixeira (ex.:
    // reset manual pelo site do Drive), a referência nunca era invalidada sozinha:
    // toda tentativa de publicar falhava em silêncio pra sempre (o erro ficava só
    // em bridge.lastError, sem aviso claro). Agora confere a raiz primeiro; se ela
    // não existir mais, limpa a referência local e avisa com instrução clara.
    try{
      const rootInfo=await meta(root);
      if(rootInfo.trashed||rootInfo.mimeType!=='application/vnd.google-apps.folder'){
        clearRoot();
        throw new Error('A pasta principal do Google Drive foi excluída ou movida para a lixeira. Vá em Configurações → Backup e Migração, clique em "Desconectar" e depois "Conectar Google" de novo para escolher a pasta atual.');
      }
    }catch(error){
      if(error?.status===404){
        clearRoot();
        throw new Error('A pasta principal do Google Drive não foi encontrada (pode ter sido excluída). Vá em Configurações → Backup e Migração, clique em "Desconectar" e depois "Conectar Google" de novo para escolher a pasta atual.');
      }
      if(!Number.isFinite(error?.status))throw error;
    }
    if(structurePromise)return await structurePromise;
    structurePromise=withCrossTabLock(`marco-drive-structure:${root}`,async()=>{
      const stored=await validateStructure(root,cachedStructure());if(stored)return stored;
      const s={rootId:root};
      for(const [key,name] of Object.entries(FOLDERS)){
        let f=await findChild(root,name,'application/vnd.google-apps.folder');
        if(!f){for(const delay of [600,1400,2600]){await sleep(delay);f=await findChild(root,name,'application/vnd.google-apps.folder');if(f)break;}}
        if(!f)f=await createFolder(root,name);s[key]=f.id;setStructure(s);
      }
      setStructure(s);return s;
    }).finally(()=>{structurePromise=null;});
    return await structurePromise;
  }
  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  function integrationFileKey(folderId,name){const sub=Auth.cached()?.sub||'unknown';return `marco_iris_v240_gdrive_json_file_${sub}_${folderId}_${encodeURIComponent(name)}`;}
  async function resolveIntegrationFileUncached(folderId,name,create=false,obj=null){
    const memoryKey=`${folderId}:${name}`,storageKey=integrationFileKey(folderId,name);
    const cached=integrationFileIds.get(memoryKey)||localStorage.getItem(storageKey);
    if(cached){
      try{const info=await meta(cached);if(info.name===name&&info.mimeType==='application/json'){integrationFileIds.set(memoryKey,cached);return {id:cached,name};}}
      catch(_){integrationFileIds.delete(memoryKey);localStorage.removeItem(storageKey);}
    }
    let f=await findChild(folderId,name,'application/json');
    if(!f&&create){await sleep(450);f=await findChild(folderId,name,'application/json');if(!f)f=await createMetadata({name,mimeType:'application/json',parents:[folderId]});}
    if(f){integrationFileIds.set(memoryKey,f.id);localStorage.setItem(storageKey,f.id);}
    return f||null;
  }
  async function resolveIntegrationFile(folderId,name,create=false,obj=null){
    const memoryKey=`${folderId}:${name}`;if(integrationFilePromises.has(memoryKey))return await integrationFilePromises.get(memoryKey);
    const task=()=>resolveIntegrationFileUncached(folderId,name,create,obj);
    const promise=withCrossTabLock(`marco-drive-file:${folderId}:${name}`,task).finally(()=>integrationFilePromises.delete(memoryKey));
    integrationFilePromises.set(memoryKey,promise);return await promise;
  }

  function backupSlotKey(folderId,kind){return `${BACKUP_SLOT_PREFIX}${kind}_${folderId}`;}
  function readBackupSlot(folderId,kind,slots){const raw=Number(localStorage.getItem(backupSlotKey(folderId,kind))||0);return Number.isFinite(raw)&&raw>=0?raw%slots:0;}
  function writeBackupSlot(folderId,kind,slot){localStorage.setItem(backupSlotKey(folderId,kind),String(slot));}
  async function writeRotatingBackup(folderId,state,{kind='autosave',force=false}={}){
    if(!folderId||!state)return null;
    const slots=kind==='forcesave'?FORCESAVE_SLOTS:AUTOSAVE_SLOTS;
    const lastKey=`${BACKUP_SLOT_PREFIX}${kind}_last_${folderId}`;
    const lastAt=Number(localStorage.getItem(lastKey)||0);
    if(!force&&kind==='autosave'&&Date.now()-lastAt<AUTOSAVE_INTERVAL_MS)return null;
    const slot=readBackupSlot(folderId,kind,slots)+1;
    const name=`${kind}-${slot}.json`;
    const file=await resolveIntegrationFile(folderId,name,true,state);
    await updateJson(file.id,jsonClone(state));
    const confirmed=await readJson(file.id);
    const check=validateOfficialState(confirmed);
    if(!check.valid)throw new Error(`O backup ${name} não pôde ser confirmado no Google Drive.`);
    writeBackupSlot(folderId,kind,slot%slots);
    localStorage.setItem(lastKey,String(Date.now()));
    return {id:file.id,name,slot};
  }
  async function writeInstallationManifest(rootIdValue,structure,state,user){
    if(!rootIdValue||!structure||!state)return null;
    const manifest={schema:'marco.iris.installation',schemaVersion:1,appId:'marco-iris-tecnologia',appVersion:'2.5.4',createdOrUpdatedAt:new Date().toISOString(),companyInstanceId:companyIdOf(state),googleAccount:String(user?.email||''),rootFolderId:rootIdValue,folders:Object.fromEntries(Object.entries(FOLDERS).map(([key,name])=>[key,{name,id:structure[key]||''}]))};
    const file=await resolveIntegrationFile(rootIdValue,INSTALLATION_FILE,true,manifest);
    await updateJson(file.id,manifest);
    const confirmed=await readJson(file.id);
    if(confirmed?.companyInstanceId!==manifest.companyInstanceId)throw new Error('O manifesto da instalação não pôde ser confirmado no Google Drive.');
    return {file,manifest:confirmed};
  }

  function dataFileKey(folderId){return `${DATA_FILE_ID_PREFIX}${folderId}`;}
  function rememberDataFile(folderId,file){if(file?.id)localStorage.setItem(dataFileKey(folderId),file.id);return file||null;}
  function forgetDataFile(folderId){localStorage.removeItem(dataFileKey(folderId));}
  function validDataFile(info,folderId){return !!info&&!info.trashed&&info.name===DATA_FILE&&info.mimeType==='application/json'&&(info.parents||[]).includes(folderId);}
  async function resolveDataFileUncached(folderId){
    const cachedId=localStorage.getItem(dataFileKey(folderId));
    if(cachedId){
      try{const info=await meta(cachedId);if(validDataFile(info,folderId))return rememberDataFile(folderId,info);}catch(error){if(![403,404].includes(error?.status))console.warn('[GOOGLE_DRIVE] Arquivo principal em cache inválido:',error);}
      forgetDataFile(folderId);
    }
    const files=await findChildren(folderId,DATA_FILE,'application/json');
    if(!files.length)return null;
    const ordered=[...files].sort((a,b)=>{const modified=new Date(b.modifiedTime||0)-new Date(a.modifiedTime||0);if(modified)return modified;return new Date(a.createdTime||0)-new Date(b.createdTime||0);});
    if(ordered.length>1)console.warn(`[GOOGLE_DRIVE] Existem ${ordered.length} arquivos principais chamados “${DATA_FILE}”. O mais recentemente modificado será reutilizado.`);
    return rememberDataFile(folderId,ordered[0]);
  }
  async function resolveDataFile(folderId){
    if(dataFilePromises.has(folderId))return await dataFilePromises.get(folderId);
    const promise=withCrossTabLock(`marco-drive-main-file-resolve:${folderId}`,()=>resolveDataFileUncached(folderId)).finally(()=>dataFilePromises.delete(folderId));
    dataFilePromises.set(folderId,promise);return await promise;
  }
  async function saveDataFile(folderId,state,{allowCreate=true,reason='save'}={}){
    return await withCrossTabLock(`marco-drive-main-file-save:${folderId}`,async()=>{
      let file=await resolveDataFileUncached(folderId);
      if(!file){for(const delay of [500,1200,2400]){await sleep(delay);file=await resolveDataFileUncached(folderId);if(file)break;}}
      let remoteState=null;
      if(file){
        remoteState=await readJson(file.id);
        /* Abrir outro dispositivo não pode fabricar uma revisão nova. Se os dados
           funcionais são idênticos, adotamos a confirmação oficial existente. */
        if(await contentChecksum(state)===await contentChecksum(remoteState))return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true};
        /* No modo 100% nuvem, uma gravação só é aceita depois que esta aba carregou
           a base oficial do Drive para a memória. Se essa referência não existe,
           a nuvem vence automaticamente — jamais tentamos publicar uma base inicial
           vazia criada pelo navegador. */
        const sessionBase=await window.MarcoStorage?.loadSyncBase?.();
        if(!sessionBase){
          return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true,recoveredFromUninitializedSession:true};
        }
        const sessionCompany=companyIdOf(sessionBase),remoteCompany=companyIdOf(remoteState);
        if(sessionCompany&&remoteCompany&&sessionCompany!==remoteCompany){
          const e=new Error('A pasta selecionada pertence a outra instalação. Nenhum dado foi enviado.');e.code='COMPANY_INSTANCE_CONFLICT';throw e;
        }
        const sessionCount=sourceCount(state),remoteCount=sourceCount(remoteState);
        if(remoteCount>0&&sessionCount===0&&!explicitLocalDeletionCoverage(state,remoteState)){
          const reasonText=String(reason||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
          const destructive=/exclu|cancel|remov|reset|rollback|restaur|apag/.test(reasonText);
          if(!destructive){
            return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true,recoveredFromEmptySession:true};
          }
        }
        assertSafeReplacement(state,remoteState);
      }
      else if(!allowCreate)throw new Error('A base oficial não foi localizada no Google Drive.');
      const prepared=await prepareOfficialState(state,remoteState);
      if(remoteState){const remoteHash=remoteState?.driveSync?.checksum||await stateChecksum(remoteState);if(remoteHash===prepared.driveSync.checksum)return {file:rememberDataFile(folderId,file),state:remoteState,unchanged:true};
        /* Histórico curto, limitado e verificável: autosave-1.json ... autosave-20.json. */
        const structure=cachedStructure();if(structure?.backups)await writeRotatingBackup(structure.backups,remoteState,{kind:'autosave',force:false});
      }
      if(!file)file=await createMetadata({name:DATA_FILE,mimeType:'application/json',parents:[folderId]});
      file=await updateJson(file.id,prepared);const confirmed=await readJson(file.id);const check=validateOfficialState(confirmed);if(!check.valid||confirmed?.driveSync?.checksum!==prepared.driveSync.checksum)throw new Error('A gravação oficial não foi confirmada pelo Google Drive.');
      return {file:rememberDataFile(folderId,file),state:confirmed,unchanged:false};
    });
  }

  async function applyConfirmedState(localState,confirmedState,startedSnapshot=null){
    if(!localState||!confirmedState)return localState;
    const confirmed=jsonClone(confirmedState),snapshot=startedSnapshot&&typeof startedSnapshot==='object'?jsonClone(startedSnapshot):jsonClone(localState);
    const confirmedRev=Math.max(0,Number(confirmed?.driveSync?.revision)||0),currentRev=Math.max(0,Number(localState?.driveSync?.revision)||0);
    if(confirmedRev<currentRev)return localState;
    const changedWhileSaving=!valueEqual(localState,snapshot);
    const next=changedWhileSaving?rebaseLocalChanges(snapshot,localState,confirmed):confirmed;
    Object.keys(localState).forEach(key=>delete localState[key]);
    Object.assign(localState,next);
    if(window.MarcoStorage?.save)await window.MarcoStorage.save(localState,{touch:false});
    /* A base confirmada é o ponto comum usado num conflito posterior. Ela fica
       separada do estado local, que pode já conter uma edição ainda não enviada. */
    if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(confirmed);
    return localState;
  }

  // V2.4.0 — decisão pura (sem I/O) de qual base prevalece no login: só adota a
  // base do Drive quando ela é realmente mais nova (driveSync.revision maior).
  // Extraída à parte para poder ser testada sem precisar simular toda a API do
  // Google Drive — mesmo padrão já usado por applyConfirmedState/prepareOfficialState.
  function decideOfficialSource(localState,remoteState){
    const localCompany=companyIdOf(localState),remoteCompany=companyIdOf(remoteState);
    const foreignInstance=!!(localCompany&&remoteCompany&&localCompany!==remoteCompany);
    const localRev=Math.max(0,Number(localState?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
    const localCount=sourceCount(localState),remoteCount=sourceCount(remoteState);
    const explicitDeletionCoverage=explicitLocalDeletionCoverage(localState,remoteState);
    /* A base oficial nunca pode ficar inacessível só porque o navegador perdeu o
       cache local ou ficou com um número de revisão antigo/empatado. A única exceção
       é uma exclusão local explícita, já registrada por tombstone, cobrindo todos os
       registros que sumiram. */
    const localEmptyRemoteHasData=localCount===0&&remoteCount>0&&!explicitDeletionCoverage;
    const useRemote=foreignInstance||localEmptyRemoteHasData||remoteRev>localRev;
    return {useRemote,foreignInstance,localEmptyRemoteHasData,explicitDeletionCoverage,localRev,remoteRev,localCount,remoteCount};
  }

  let saveQueueRequested=0,saveQueueCompleted=0,saveQueueState=null,saveQueueOptions={},saveQueuePromise=null,saveQueueWaiters=[];
  function mergeSaveOptions(current,next){return {backup:!!(current?.backup||next?.backup),interactive:!!(current?.interactive||next?.interactive),reason:String(next?.reason||current?.reason||'alteracao')};}
  function settleSaveWaiters(target,error,result){const keep=[];for(const waiter of saveQueueWaiters){if(waiter.seq<=target){error?waiter.reject(error):waiter.resolve(result);}else keep.push(waiter);}saveQueueWaiters=keep;}
  async function runSaveQueue(){
    if(saveQueuePromise)return await saveQueuePromise;
    saveQueuePromise=(async()=>{
      let lastResult=null;
      while(saveQueueCompleted<saveQueueRequested){
        const target=saveQueueRequested,state=saveQueueState,options=saveQueueOptions;
        saveQueueOptions={};
        try{lastResult=await Drive.save(state,options);saveQueueCompleted=target;settleSaveWaiters(target,null,lastResult);}
        catch(error){saveQueueCompleted=target;settleSaveWaiters(target,error,null);throw error;}
      }
      return lastResult;
    })().finally(()=>{saveQueuePromise=null;if(saveQueueCompleted<saveQueueRequested)runSaveQueue().catch(()=>{});});
    return await saveQueuePromise;
  }
  function enqueueSave(state,options={}){
    if(!state)return Promise.reject(new Error('Estado indisponível para salvar.'));
    saveQueueState=state;saveQueueOptions=mergeSaveOptions(saveQueueOptions,options);const seq=++saveQueueRequested;
    const promise=new Promise((resolve,reject)=>saveQueueWaiters.push({seq,resolve,reject}));
    runSaveQueue().catch(()=>{});return promise;
  }
  function flushSaveQueue(){if(saveQueueCompleted>=saveQueueRequested)return Promise.resolve(null);return new Promise((resolve,reject)=>saveQueueWaiters.push({seq:saveQueueRequested,resolve,reject}));}

  const Drive={currentFile:null,
    cachedUser:()=>Auth.cached(),rootId,isConfigured:()=>!!(Auth.cached()&&rootId()),hasCredentials:()=>{const c=config();return !!(c.clientId&&c.apiKey&&c.projectNumber);},cachedStructure,
    async authenticate(interactive=true){return await authenticateGoogle(interactive);},
    async connect(interactive=true){if(connectionPromise)return await connectionPromise;connectionPromise=(async()=>{const user=await authenticateGoogle(interactive);let root=rootId();if(!root){const chosen=await picker();root=chosen.id;setRoot(root);}const structure=await ensureStructure(false);return {user,rootId:root,structure};})().finally(()=>{connectionPromise=null;});return await connectionPromise;},
    async ensureConnection(interactive=false){if(!this.isConfigured())return await this.connect(interactive);await Auth.ensure(interactive);const user=await assertAuthorizedUser(await Auth.fetchUser());return {user,rootId:rootId(),structure:await ensureStructure(false)};},
    async findDataFile(){const {structure}=await this.ensureConnection(false);this.currentFile=await resolveDataFile(structure.data);return this.currentFile;},
    async save(state,{backup=false,reason='manual',interactive=false}={}){
      const startedSnapshot=jsonClone(state),{structure,user,rootId:connectedRoot}=await this.ensureConnection(interactive);let result;
      try{result=await saveDataFile(structure.data,startedSnapshot,{reason});}
      catch(error){
        if(error?.code!=='REMOTE_NEWER')throw error;
        /* Outro dispositivo publicou primeiro. Em vez de travar numa repetição
           infinita, reaplicamos apenas as mudanças locais sobre a base remota. */
        const file=this.currentFile||await resolveDataFile(structure.data);if(!file)throw error;
        const remoteState=await readJson(file.id),baseState=await window.MarcoStorage?.loadSyncBase?.();
        if(!baseState){const e=new Error('O Google Drive foi alterado em outro dispositivo, mas a referência desta sessão não está disponível. Reabra o aplicativo para carregar novamente a base oficial.');e.code='SYNC_BASE_MISSING';throw e;}
        const rebased=rebaseLocalChanges(baseState,startedSnapshot,remoteState);
        result=await saveDataFile(structure.data,rebased,{reason:`reconciliado-${reason}`});
      }
      this.currentFile=result.file;await applyConfirmedState(state,result.state,startedSnapshot);localStorage.setItem(LAST_SAVE,new Date().toISOString());await writeInstallationManifest(connectedRoot,structure,result.state,user);if(backup){await writeRotatingBackup(structure.backups,result.state,{kind:'forcesave',force:true});const name=`Marco_Iris_${String(reason).replace(/[^a-zA-Z0-9_-]/g,'-')}_${stamp()}.json`;const bf=await createMetadata({name,mimeType:'application/json',parents:[structure.backups]});await updateJson(bf.id,result.state);}return result.file;
    },
    async load({interactive=false,rememberBase=true}={}){await this.ensureConnection(interactive);const f=this.currentFile||await this.findDataFile();if(!f)throw new Error('Ainda não existe um arquivo de dados nesta pasta.');const [state,info]=await Promise.all([readJson(f.id),meta(f.id)]);const check=validateOfficialState(state);if(!check.valid)throw new Error('A base oficial do Google Drive é inválida: '+check.errors.join(' '));ensureCompanyId(state);this.currentFile=info;if(rememberBase&&window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(state);return {state,meta:info};},
    async initializeOfficialState(initialState,{interactive=true,onProgress=()=>{}}={}){
      if(!navigator.onLine)throw new Error('Internet obrigatória para abrir o Marco Iris.');
      onProgress('Conectando ao Google Drive');
      const conn=await this.ensureConnection(interactive);
      onProgress('Localizando a base oficial');
      const file=this.currentFile||await this.findDataFile();
      if(!file){
        onProgress('Criando a primeira base oficial');
        const cleanState=jsonClone(initialState||window.MARCO_INITIAL_DATA);
        ensureCompanyId(cleanState);
        const result=await saveDataFile(conn.structure.data,cleanState,{reason:'primeira-base-oficial-cloud-only'});
        this.currentFile=result.file;
        if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(result.state);
        return {state:result.state,created:true,source:'drive-created',user:conn.user};
      }
      onProgress('Carregando dados oficiais da nuvem');
      const remote=await this.load({rememberBase:false});
      ensureCompanyId(remote.state);
      if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(remote.state);
      onProgress('Base oficial confirmada');
      return {state:remote.state,created:false,source:'drive',user:conn.user,discardedLocalInstance:true};
    },
    async sync(state,{interactive=false,backup=false,reason='sincronizacao'}={}){await this.ensureConnection(interactive);const f=this.currentFile||await this.findDataFile();if(!f){await this.save(state,{backup:true,reason:'primeira-sincronizacao'});return {direction:'local',created:true};}const previousSyncBase=await window.MarcoStorage?.loadSyncBase?.(),remote=await this.load({rememberBase:false});const localRev=Math.max(0,Number(state?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remote.state?.driveSync?.revision)||0);if(remoteRev>localRev){const localChanged=!!previousSyncBase&&await contentChecksum(state)!==await contentChecksum(previousSyncBase);if(localChanged){await this.save(state,{backup,reason:`reconciliado-${reason}`});return {direction:'merged',state,meta:this.currentFile};}if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(remote.state);return {direction:'remote',state:remote.state,meta:remote.meta};}await this.save(state,{backup,reason});return {direction:'local',meta:this.currentFile};},
    /* v2.5.0 — consulta passiva entre dispositivos. Lê a base oficial e só a aplica
       quando a revisão do Drive é maior; não salva, não incrementa revisão e não
       publica o bridge. Isso impede o computador ocioso de sobrescrever o celular. */
    async pullIfNewer(state,{interactive=false}={}){
      if(!state)throw new Error('Sessão atual indisponível para atualização.');
      await this.ensureConnection(interactive);
      const file=this.currentFile||await this.findDataFile();
      if(!file)throw new Error('Ainda não existe um arquivo de dados nesta pasta.');
      /* Consulta primeiro apenas os metadados. Na maioria das rodadas isso evita
         baixar o current.json inteiro e deixa o aplicativo leve mesmo aberto o dia todo. */
      const latestMeta=await meta(file.id),knownModified=String(this.currentFile?.modifiedTime||file.modifiedTime||''),latestModified=String(latestMeta.modifiedTime||'');
      if(knownModified&&latestModified&&knownModified===latestModified){this.currentFile=latestMeta;return {updated:false,unchanged:true,meta:latestMeta};}
      const remoteState=await readJson(file.id),check=validateOfficialState(remoteState);
      if(!check.valid)throw new Error('A base oficial do Google Drive é inválida: '+check.errors.join(' '));
      ensureCompanyId(remoteState);this.currentFile=latestMeta;
      const localCompany=companyIdOf(state),remoteCompany=companyIdOf(remoteState);
      if(localCompany&&remoteCompany&&localCompany!==remoteCompany){const error=new Error('A base remota pertence a outra instalação. A atualização automática foi bloqueada.');error.code='COMPANY_INSTANCE_CONFLICT';throw error;}
      const localRev=Math.max(0,Number(state?.driveSync?.revision)||0),remoteRev=Math.max(0,Number(remoteState?.driveSync?.revision)||0);
      if(remoteRev<=localRev)return {updated:false,localRev,remoteRev,meta:latestMeta};
      const startedSnapshot=jsonClone(state);
      await applyConfirmedState(state,remoteState,startedSnapshot);
      return {updated:true,localRev,remoteRev,meta:latestMeta,state};
    },
    async uploadBlob(blob,folderKey,fileName,existingId='',expectedSha256=''){
      const {structure}=await this.ensureConnection(false),parent=structure[folderKey];
      if(!parent)throw new Error('Pasta de nuvem inválida.');
      let f=existingId?await meta(existingId).catch(()=>null):await findChild(parent,fileName),created=false;
      if(f&&!existingId&&expectedSha256){
        const existingBlob=await downloadBlob(f.id),digest=await crypto.subtle.digest('SHA-256',await existingBlob.arrayBuffer());
        const existingHash=[...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
        if(existingHash===expectedSha256)return {...f,created:false,reused:true,sha256:existingHash};
        const error=new Error(`Já existe no Google Drive um arquivo diferente chamado “${fileName}”. A migração foi bloqueada para não sobrescrevê-lo.`);error.code='MEDIA_NAME_CONFLICT';throw error;
      }
      if(!f){f=await createMetadata({name:fileName,mimeType:blob.type||'application/octet-stream',parents:[parent]});created=true;}
      const uploaded=await uploadMediaContent(f.id,blob);return {...uploaded,created,reused:false};
    },
    async restoreOfficialSnapshot(snapshot,{reason='rollback'}={}){
      const clean=jsonClone(snapshot||{}),check=validateOfficialState(clean);if(!check.valid)throw new Error('O snapshot de rollback é inválido: '+check.errors.join(' '));
      const {structure}=await this.ensureConnection(false),file=this.currentFile||await resolveDataFile(structure.data);if(!file)throw new Error('A base oficial não foi localizada para rollback.');
      const remote=await readJson(file.id),remoteCheck=validateOfficialState(remote);if(!remoteCheck.valid)throw new Error('A base remota atual é inválida: '+remoteCheck.errors.join(' '));
      const localCompany=companyIdOf(clean),remoteCompany=companyIdOf(remote);if(localCompany&&remoteCompany&&localCompany!==remoteCompany){const error=new Error('O rollback pertence a outra instalação e foi bloqueado.');error.code='COMPANY_INSTANCE_CONFLICT';throw error;}
      await writeRotatingBackup(structure.backups,remote,{kind:'forcesave',force:true});
      const backupName=`Marco_Iris_antes_${String(reason||'rollback').replace(/[^a-zA-Z0-9_-]/g,'-')}_${stamp()}.json`,backupFile=await createMetadata({name:backupName,mimeType:'application/json',parents:[structure.backups]});await updateJson(backupFile.id,remote);
      const prepared=await prepareOfficialState(clean,remote);prepared.driveSync.rollbackReason=String(reason||'rollback');prepared.driveSync.rollbackAt=new Date().toISOString();
      const updated=await updateJson(file.id,prepared),confirmed=await readJson(file.id),confirmedCheck=validateOfficialState(confirmed);
      if(!confirmedCheck.valid||confirmed?.driveSync?.checksum!==prepared.driveSync.checksum)throw new Error('O rollback não foi confirmado pelo Google Drive.');
      this.currentFile=updated;if(window.MarcoStorage?.saveSyncBase)await window.MarcoStorage.saveSyncBase(confirmed);return {file:updated,state:confirmed,backupFile};
    },
    downloadBlob,meta,trash,
    async folderStatus(){const {structure}=await this.ensureConnection(false);return Object.entries(FOLDERS).map(([key,name])=>({key,name,id:structure[key],url:`https://drive.google.com/drive/folders/${structure[key]}`}));},
    /* BORION INTEROP v1.0.0 — protected transport seam. */
    async integrationFolderId(){const {structure}=await this.ensureConnection(false);return structure.integration;},
    async writeIntegrationJson(name,obj){const folderId=await this.integrationFolderId();const f=await resolveIntegrationFile(folderId,name,true,obj);return await updateJson(f.id,obj);},
    async readIntegrationJson(name){const folderId=await this.integrationFolderId();const f=await resolveIntegrationFile(folderId,name,false,null);return f?await readJson(f.id):null;},
    async writeBackupJson(name,obj){const {structure}=await this.ensureConnection(false);const safeName=String(name||`backup-${stamp()}.json`).replace(/[\\/:*?"<>|]/g,'-');const f=await createMetadata({name:safeName,mimeType:'application/json',parents:[structure.backups]});await updateJson(f.id,obj);const confirmed=await readJson(f.id);return {file:f,state:confirmed};},
    enqueueSave,flushSaveQueue,
    async writeAutosave(state,{force=false}={}){const {structure}=await this.ensureConnection(false);return await writeRotatingBackup(structure.backups,state,{kind:'autosave',force});},
    async writeForceSave(state){const {structure}=await this.ensureConnection(false);return await writeRotatingBackup(structure.backups,state,{kind:'forcesave',force:true});},
    async diagnose(state){const conn=await this.ensureConnection(false),main=await this.findDataFile(),bridge=await this.readIntegrationJson('marco-iris.bridge.json');return {ok:!!(main&&bridge),user:conn.user,rootId:conn.rootId,folders:await this.folderStatus(),mainFile:main||null,bridgeFile:bridge?{revision:Number(bridge.revision)||0,recordCount:Number(bridge.recordCount)||0,generatedAt:bridge.generatedAt||'',companyInstanceId:bridge.companyInstanceId||bridge.instanceId||''}:null,companyInstanceId:companyIdOf(state),lastSave:localStorage.getItem(LAST_SAVE)||''};},
    disconnect(){const u=Auth.cached(),root=rootId();if(u)localStorage.removeItem(rootKey(u.sub));if(root)localStorage.removeItem(structKey(root));for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i)||'';if(key.startsWith('marco_iris_v240_'))localStorage.removeItem(key);}window.MarcoStorage?.clearSyncBase?.().catch?.(()=>{});this.currentFile=null;structurePromise=null;connectionPromise=null;integrationFileIds.clear();integrationFilePromises.clear();dataFilePromises.clear();saveQueueRequested=saveQueueCompleted=0;saveQueueState=null;saveQueueOptions={};saveQueueWaiters=[];Auth.signOut();},
    __test:{applyConfirmedState,prepareOfficialState,assertSafeReplacement,validateOfficialState,decideOfficialSource,explicitLocalDeletionCoverage,contentChecksum,rebaseLocalChanges,mergeArrayDelta,writeRotatingBackup,enqueueSave,flushSaveQueue}
  };
  window.GoogleDriveMarco=Drive;
})();
