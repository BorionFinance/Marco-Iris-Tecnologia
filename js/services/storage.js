(() => {
  'use strict';

  /*
   * Marco Iris Cloud-Only Storage (v2.5.1)
   * ---------------------------------------
   * Nenhum dado de negócio é persistido no navegador. Clientes, OSVs,
   * lançamentos, exclusões, rascunhos e mídias existem apenas em memória até
   * serem confirmados no Google Drive. localStorage continua reservado apenas
   * para credenciais técnicas do Google e IDs da pasta escolhida.
   */
  const DATA_FILE='Marco_Iris_Dados.json';
  const LEGACY_DATABASES=[
    'marco_iris_tecnologia_db_v240_clean',
    'marco_iris_tecnologia_db',
    'marco_iris_tecnologia'
  ];
  let syncBaseMemory=null;
  const mediaMemory=new Map();
  const draftMemory=new Map();

  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));

  async function load(){
    return clone(window.MARCO_INITIAL_DATA);
  }

  async function save(state,{touch=true}={}){
    if(touch&&state)state.updatedAt=new Date().toISOString();
    return state;
  }

  async function loadSyncBase(){return syncBaseMemory?clone(syncBaseMemory):null;}
  async function saveSyncBase(state){syncBaseMemory=state?clone(state):null;return state;}
  async function clearSyncBase(){syncBaseMemory=null;return true;}

  async function createBackup(state,reason='manual'){
    if(!navigator.onLine)throw new Error('Internet obrigatória para criar backup no Google Drive.');
    if(!window.GoogleDriveMarco?.isConfigured?.())throw new Error('Conecte o Google Drive antes de criar backup.');
    await window.GoogleDriveMarco.writeForceSave(state);
    return {id:`drive_${Date.now()}`,createdAt:new Date().toISOString(),reason,cloud:true};
  }
  async function listBackups(){return [];}
  async function restoreBackup(){return null;}

  async function putMedia(blob,meta={}){
    if(!(blob instanceof Blob))throw new Error('O arquivo selecionado não pôde ser processado.');
    if(blob.size<=0)throw new Error(`O arquivo ${meta.name||'selecionado'} está vazio ou não pôde ser lido.`);
    if(!navigator.onLine)throw new Error('Internet obrigatória para adicionar arquivos.');
    const id=meta.id||`memory_media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    const record={id,blob,name:meta.name||'arquivo',type:meta.type||blob.type||'application/octet-stream',size:blob.size,createdAt:meta.createdAt||new Date().toISOString()};
    mediaMemory.set(id,record);
    return record;
  }
  async function getMedia(id){return id?mediaMemory.get(id)||null:null;}
  async function deleteMedia(id){if(id)mediaMemory.delete(id);}

  async function saveDraft(key,draft){
    if(!key)throw new Error('Chave de rascunho inválida.');
    const record={...clone(draft||{}),key,updatedAt:draft?.updatedAt||new Date().toISOString()};
    draftMemory.set(key,record);
    return clone(record);
  }
  async function getDraft(key){const record=key?draftMemory.get(key):null;return record?clone(record):null;}
  async function deleteDraft(key){if(key)draftMemory.delete(key);}
  async function listDrafts(){return [...draftMemory.values()].map(clone).sort((a,b)=>String(b.updatedAt||'').localeCompare(String(a.updatedAt||'')));}
  async function putDraftMedia(blob,meta={}){return await putMedia(blob,{...meta,id:meta.id||`memory_draft_media_${Date.now()}_${Math.random().toString(36).slice(2,8)}`});}
  async function deleteDraftMedia(id){return await deleteMedia(id);}

  async function connectFolder(){throw new Error('O modo nuvem obrigatória não usa pasta local.');}
  async function getFolderHandle(){return null;}
  async function forgetFolder(){return true;}
  async function ensurePermission(){return false;}
  async function saveToFolder(){throw new Error('O modo nuvem obrigatória não salva dados em pasta local.');}
  async function readFromFolder(){throw new Error('O modo nuvem obrigatória carrega dados somente do Google Drive.');}

  function stamp(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  function downloadJson(state,filename=`Marco_Iris_Backup_${stamp()}.json`){downloadBlob(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}),filename);}
  function downloadBlob(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  async function readUploadedJson(file){const obj=JSON.parse(await file.text());if(obj?.appId!=='marco-iris-tecnologia'||!obj.dataByProfile)throw new Error('Arquivo incompatível com o sistema Marco Iris.');return obj;}

  async function deleteLegacyDatabase(name){
    if(!globalThis.indexedDB)return false;
    return await new Promise(resolve=>{
      const request=indexedDB.deleteDatabase(name);
      request.onsuccess=()=>resolve(true);
      request.onerror=()=>resolve(false);
      request.onblocked=()=>resolve(false);
    });
  }

  async function purgeLegacyData(){
    mediaMemory.clear();draftMemory.clear();syncBaseMemory=null;
    await Promise.all(LEGACY_DATABASES.map(deleteLegacyDatabase));
    for(let i=localStorage.length-1;i>=0;i--){
      const key=localStorage.key(i)||'';
      /* Preserve somente autenticação, configuração e IDs técnicos do Drive. */
      if((key.startsWith('marco_iris_')||key.startsWith('marco-iris-'))&&!key.startsWith('marco_iris_v240_gdrive_')&&!key.startsWith('marco_iris_device_id_'))localStorage.removeItem(key);
    }
    for(let i=sessionStorage.length-1;i>=0;i--){
      const key=sessionStorage.key(i)||'';
      if(key.startsWith('marco_iris_')||key.startsWith('marco-iris-'))sessionStorage.removeItem(key);
    }
    return true;
  }

  async function wipeAll(){return await purgeLegacyData();}

  window.MarcoStorage={
    load,save,loadSyncBase,saveSyncBase,clearSyncBase,
    createBackup,listBackups,restoreBackup,
    putMedia,getMedia,deleteMedia,
    saveDraft,getDraft,deleteDraft,listDrafts,putDraftMedia,deleteDraftMedia,
    connectFolder,getFolderHandle,forgetFolder,ensurePermission,saveToFolder,readFromFolder,
    downloadJson,downloadBlob,readUploadedJson,wipeAll,purgeLegacyData,
    DATA_FILE,DB_NAME:'cloud-only-no-indexeddb',cloudOnly:true
  };
})();
