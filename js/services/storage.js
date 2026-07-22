(() => {
  'use strict';
  const DB='marco_iris_tecnologia_db_v240_clean';
  const VERSION=4;
  const STATE='state';
  const BACKUPS='backups';
  const MEDIA='media';
  const HANDLES='handles';
  const DRAFTS='drafts';
  const KEY='main';
  const SYNC_BASE_KEY='sync-base-v1';
  const DATA_FILE='Marco_Iris_Dados.json';

  function clone(v){return JSON.parse(JSON.stringify(v));}
  function openDb(){
    return new Promise((resolve,reject)=>{
      const req=indexedDB.open(DB,VERSION);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains(STATE))db.createObjectStore(STATE);
        if(!db.objectStoreNames.contains(BACKUPS))db.createObjectStore(BACKUPS,{keyPath:'id'});
        if(!db.objectStoreNames.contains(MEDIA))db.createObjectStore(MEDIA,{keyPath:'id'});
        if(!db.objectStoreNames.contains(HANDLES))db.createObjectStore(HANDLES);
        if(!db.objectStoreNames.contains(DRAFTS))db.createObjectStore(DRAFTS,{keyPath:'key'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
  }
  async function tx(store,mode,action){
    const db=await openDb();
    return await new Promise((resolve,reject)=>{
      const t=db.transaction(store,mode),s=t.objectStore(store),req=action(s);let result;
      req.onsuccess=()=>{result=req.result;};
      req.onerror=()=>reject(req.error||new Error('Falha ao acessar o armazenamento local.'));
      t.oncomplete=()=>{db.close();resolve(result);};
      t.onerror=()=>{db.close();reject(t.error||new Error('Falha na transação do armazenamento local.'));};
      t.onabort=()=>{db.close();reject(t.error||new Error('A transação do armazenamento local foi cancelada.'));};
    });
  }
  const get=(s,k)=>tx(s,'readonly',x=>x.get(k));
  const put=(s,v,k)=>tx(s,'readwrite',x=>k===undefined?x.put(v):x.put(v,k));
  const del=(s,k)=>tx(s,'readwrite',x=>x.delete(k));
  const all=s=>tx(s,'readonly',x=>x.getAll());

  async function load(){return clone((await get(STATE,KEY))||window.MARCO_INITIAL_DATA);}
  async function loadSyncBase(){const state=await get(STATE,SYNC_BASE_KEY);return state?clone(state):null;}
  async function saveSyncBase(state){if(!state)return null;await put(STATE,clone(state),SYNC_BASE_KEY);return state;}
  async function clearSyncBase(){await del(STATE,SYNC_BASE_KEY);return true;}
  async function save(state,{touch=true}={}){
    if(touch)state.updatedAt=new Date().toISOString();
    await put(STATE,clone(state),KEY);
    return state;
  }
  async function createBackup(state,reason='manual'){
    const item={id:`bkp_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,createdAt:new Date().toISOString(),reason,state:clone(state)};
    await put(BACKUPS,item);
    if(reason==='auto'){
      const autoList=(await all(BACKUPS)).filter(b=>b.reason==='auto').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
      for(const old of autoList.slice(20))await del(BACKUPS,old.id);
    }else{
      const list=(await all(BACKUPS)).filter(b=>b.reason!=='auto').sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
      for(const old of list.slice(30))await del(BACKUPS,old.id);
    }
    return item;
  }
  async function listBackups(){return (await all(BACKUPS)).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));}
  async function restoreBackup(id){const b=await get(BACKUPS,id);return b?clone(b.state):null;}

  async function putMedia(blob,meta={}){
    if(!(blob instanceof Blob))throw new Error('O arquivo selecionado não pôde ser processado.');
    if(blob.size<=0)throw new Error(`O arquivo ${meta.name||'selecionado'} está vazio ou não pôde ser lido.`);
    const id=meta.id||`media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const record={id,blob,name:meta.name||'arquivo',type:meta.type||blob.type||'application/octet-stream',size:blob.size,createdAt:meta.createdAt||new Date().toISOString()};
    await put(MEDIA,record);return record;
  }
  async function getMedia(id){return id?await get(MEDIA,id):null;}
  async function deleteMedia(id){if(id)await del(MEDIA,id);}

  async function saveDraft(key,draft){
    if(!key)throw new Error('Chave de rascunho inválida.');
    const record={...clone(draft||{}),key,updatedAt:draft?.updatedAt||new Date().toISOString()};
    await put(DRAFTS,record);
    return clone(record);
  }
  async function getDraft(key){const record=key?await get(DRAFTS,key):null;return record?clone(record):null;}
  async function deleteDraft(key){if(key)await del(DRAFTS,key);}
  async function listDrafts(){return (await all(DRAFTS)).map(clone).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
  async function putDraftMedia(blob,meta={}){
    return await putMedia(blob,{...meta,id:meta.id||`draft_media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,draftKey:meta.draftKey||''});
  }
  async function deleteDraftMedia(id){return await deleteMedia(id);}


  async function connectFolder(){
    if(!window.showDirectoryPicker)throw new Error('Este navegador não permite conexão direta com pastas. Use Chrome ou Edge no computador.');
    const handle=await window.showDirectoryPicker({mode:'readwrite'});await put(HANDLES,handle,'folder');return handle;
  }
  async function getFolderHandle(){return await get(HANDLES,'folder');}
  async function forgetFolder(){await del(HANDLES,'folder');}
  async function ensurePermission(handle,request=false){
    if(!handle)return false;const opts={mode:'readwrite'};
    if(await handle.queryPermission(opts)==='granted')return true;
    return request&&(await handle.requestPermission(opts)==='granted');
  }
  async function getOrCreateDir(parent,name){return await parent.getDirectoryHandle(name,{create:true});}
  async function writeFile(dir,name,blob){const h=await dir.getFileHandle(name,{create:true}),w=await h.createWritable();await w.write(blob);await w.close();return h;}
  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  async function saveToFolder(state,{handle,requestPermission=false,backup=false,reason='manual'}={}){
    handle=handle||await getFolderHandle();if(!handle)throw new Error('Nenhuma pasta local foi conectada.');
    if(!(await ensurePermission(handle,requestPermission)))throw new Error('Acesso à pasta não autorizado.');
    const dataDir=await getOrCreateDir(handle,'Dados');
    await writeFile(dataDir,DATA_FILE,new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
    if(backup){const b=await getOrCreateDir(handle,'Backups');await writeFile(b,`Marco_Iris_${reason}_${stamp()}.json`,new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));}
    return true;
  }
  async function readFromFolder({handle,requestPermission=false}={}){
    handle=handle||await getFolderHandle();if(!handle)throw new Error('Nenhuma pasta local foi conectada.');
    if(!(await ensurePermission(handle,requestPermission)))throw new Error('Acesso à pasta não autorizado.');
    const dataDir=await handle.getDirectoryHandle('Dados'),fh=await dataDir.getFileHandle(DATA_FILE),file=await fh.getFile();return {state:JSON.parse(await file.text()),file};
  }
  function downloadJson(state,filename=`Marco_Iris_Backup_${stamp()}.json`){const b=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});downloadBlob(b,filename);}
  function downloadBlob(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function readUploadedJson(file){const obj=JSON.parse(await file.text());if(obj?.appId!=='marco-iris-tecnologia'||!obj.dataByProfile)throw new Error('Arquivo incompatível com o sistema Marco Iris.');return obj;}
  async function wipeAll(){
    await new Promise((resolve,reject)=>{
      const req=indexedDB.deleteDatabase(DB);let blockedTimer=0;
      req.onsuccess=()=>{clearTimeout(blockedTimer);resolve(true);};
      req.onerror=()=>{clearTimeout(blockedTimer);reject(req.error||new Error('Não foi possível apagar o banco local.'));};
      req.onblocked=()=>{clearTimeout(blockedTimer);blockedTimer=setTimeout(()=>reject(new Error('O reset foi bloqueado por outra aba do Marco Iris. Feche as outras abas e tente novamente.')),1800);};
    });
    for(let i=localStorage.length-1;i>=0;i--){const key=localStorage.key(i)||'';if(key.startsWith('marco_iris_')||key.startsWith('marco-iris-'))localStorage.removeItem(key);}
    for(let i=sessionStorage.length-1;i>=0;i--){const key=sessionStorage.key(i)||'';if(key.startsWith('marco_iris_')||key.startsWith('marco-iris-'))sessionStorage.removeItem(key);}
    return true;
  }

  window.MarcoStorage={load,save,loadSyncBase,saveSyncBase,clearSyncBase,createBackup,listBackups,restoreBackup,putMedia,getMedia,deleteMedia,saveDraft,getDraft,deleteDraft,listDrafts,putDraftMedia,deleteDraftMedia,connectFolder,getFolderHandle,forgetFolder,ensurePermission,saveToFolder,readFromFolder,downloadJson,downloadBlob,readUploadedJson,wipeAll,DATA_FILE,DB_NAME:DB};
})();
