/* Borion Finance — Journal imutável no Google Drive (V6.42.0)
   current.json continua sendo o snapshot consolidado. operationId é a verdade
   idempotente; horário serve somente para ordenação e diagnóstico. */
const BORION_SYNC_FOLDER_NAME='Borion_Sync';
const BORION_OPS_FOLDER_NAME='operations';
const BORION_APPLIED_FOLDER_NAME='applied';
const BORION_SNAPSHOTS_FOLDER_NAME='snapshots';
const BORION_CONFLICTS_FOLDER_NAME='conflicts';
const BORION_OPERATION_RETENTION_MS=30*24*60*60*1000;
const BORION_OPERATION_MAX_BYTES=15*1024*1024;
const BORION_CANONICAL_FOLDER_PREFIX='borion_journal_canonical_v6401_';
const BORION_TOPOLOGY_CACHE_PREFIX='borion_journal_topology_v642_';

const BorionDriveJournal640={
  _topologyCache:new Map(),
  _folderSort(a,b){return String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id));},
  _canonicalKey(mainFolderId,kind){return BORION_CANONICAL_FOLDER_PREFIX+mainFolderId+'_'+kind;},
  _readPersisted(mainFolderId,kind){try{return localStorage.getItem(this._canonicalKey(mainFolderId,kind));}catch(e){return null;}},
  _persist(mainFolderId,kind,id){try{if(id)localStorage.setItem(this._canonicalKey(mainFolderId,kind),id);}catch(e){}},
  _topologyKey(mainFolderId){return BORION_TOPOLOGY_CACHE_PREFIX+mainFolderId;},
  _readTopology(mainFolderId){try{return JSON.parse(localStorage.getItem(this._topologyKey(mainFolderId))||'null');}catch(e){return null;}},
  _persistTopology(mainFolderId,t){try{localStorage.setItem(this._topologyKey(mainFolderId),JSON.stringify({sync:t.canonicalSyncFolder.id,operations:t.canonicalOpsFolder.id,applied:t.canonicalAppliedFolder&&t.canonicalAppliedFolder.id,snapshots:t.canonicalSnapshotsFolder.id,conflicts:t.canonicalConflictsFolder.id,duplicates:Object.fromEntries(Object.entries(t.duplicates||{}).map(([k,v])=>[k,(v||[]).map(x=>x.id)])),savedAt:Date.now()}));}catch(e){}},

  operationIdFromFileName(name){
    const m=/^op_([A-Za-z0-9][A-Za-z0-9._-]{0,199})\.json$/.exec(String(name||''));
    return m?m[1]:null;
  },
  compactTimestamp(iso){return String(iso||'').replace(/[-:]/g,'').replace('.','');},
  operationFileName(op){return 'op_'+String(op.operationId)+'.json';},

  async _discoverFolders(parentId,name,createIfMissing){
    let folders=await GoogleDriveFS.findChildren(parentId,name,'application/vnd.google-apps.folder');
    if(!folders.length&&createIfMissing){
      const created=await GoogleDriveFS.createFolder(parentId,name);
      const relisted=await GoogleDriveFS.findChildren(parentId,name,'application/vnd.google-apps.folder');
      folders=relisted.slice();
      if(created&&created.id&&!folders.some(f=>f.id===created.id))folders.push(Object.assign({parents:[parentId]},created));
    }
    const seen=new Set();
    return folders.filter(f=>f&&f.id&&!seen.has(f.id)&&(seen.add(f.id),true)).sort((a,b)=>this._folderSort(a,b));
  },

  _fastTopology(mainFolderId){
    const saved=this._readTopology(mainFolderId);
    const sync=(saved&&saved.sync)||this._readPersisted(mainFolderId,'sync');
    const operations=(saved&&saved.operations)||this._readPersisted(mainFolderId,'operations');
    const snapshots=(saved&&saved.snapshots)||this._readPersisted(mainFolderId,'snapshots');
    const conflicts=(saved&&saved.conflicts)||this._readPersisted(mainFolderId,'conflicts');
    const applied=(saved&&saved.applied)||this._readPersisted(mainFolderId,'applied');
    if(!sync||!operations||!snapshots||!conflicts)return null;
    const f=(id,name,parent)=>({id,name,parents:parent?[parent]:[]});
    const dupIds=(saved&&saved.duplicates)||{};
    const duplicates={sync:(dupIds.sync||[]).map(id=>f(id,BORION_SYNC_FOLDER_NAME,mainFolderId)),operations:(dupIds.operations||[]).map(id=>f(id,BORION_OPS_FOLDER_NAME,sync)),applied:(dupIds.applied||[]).map(id=>f(id,BORION_APPLIED_FOLDER_NAME,operations)),snapshots:(dupIds.snapshots||[]).map(id=>f(id,BORION_SNAPSHOTS_FOLDER_NAME,sync)),conflicts:(dupIds.conflicts||[]).map(id=>f(id,BORION_CONFLICTS_FOLDER_NAME,sync))};
    const topology={mainFolderId,syncFolders:[f(sync,BORION_SYNC_FOLDER_NAME,mainFolderId),...duplicates.sync],opsFolders:[f(operations,BORION_OPS_FOLDER_NAME,sync),...duplicates.operations],appliedFolders:applied?[f(applied,BORION_APPLIED_FOLDER_NAME,operations),...duplicates.applied]:[],snapshotFolders:[f(snapshots,BORION_SNAPSHOTS_FOLDER_NAME,sync),...duplicates.snapshots],conflictFolders:[f(conflicts,BORION_CONFLICTS_FOLDER_NAME,sync),...duplicates.conflicts],canonicalSyncFolder:f(sync,BORION_SYNC_FOLDER_NAME,mainFolderId),canonicalOpsFolder:f(operations,BORION_OPS_FOLDER_NAME,sync),canonicalAppliedFolder:applied?f(applied,BORION_APPLIED_FOLDER_NAME,operations):null,canonicalSnapshotsFolder:f(snapshots,BORION_SNAPSHOTS_FOLDER_NAME,sync),canonicalConflictsFolder:f(conflicts,BORION_CONFLICTS_FOLDER_NAME,sync),duplicates,discoveredAt:Date.now(),fastPath:true};
    return topology;
  },

  async discoverTopology(mainFolderId,options={}){
    const cached=this._topologyCache.get(mainFolderId);
    if(cached&&!options.force){if(window.BorionPerf)BorionPerf.count('topologyCacheHits',1);return cached;}
    if(!options.force){const fast=this._fastTopology(mainFolderId);if(fast){this._topologyCache.set(mainFolderId,fast);if(window.BorionPerf)BorionPerf.count('topologyCacheHits',1);return fast;}}
    if(window.BorionPerf)BorionPerf.count('topologyFullDiscoveries',1);
    const syncFolders=await this._discoverFolders(mainFolderId,BORION_SYNC_FOLDER_NAME,true);
    if(!syncFolders.length)throw new Error('Não foi possível criar ou localizar Borion_Sync.');
    const persistedSync=this._readPersisted(mainFolderId,'sync');
    const canonicalSync=syncFolders.find(f=>f.id===persistedSync)||syncFolders[0];
    this._persist(mainFolderId,'sync',canonicalSync.id);
    const opsFolders=[],snapshotFolders=[],conflictFolders=[];
    for(const sf of syncFolders){const create=sf.id===canonicalSync.id;opsFolders.push(...await this._discoverFolders(sf.id,BORION_OPS_FOLDER_NAME,create));snapshotFolders.push(...await this._discoverFolders(sf.id,BORION_SNAPSHOTS_FOLDER_NAME,create));conflictFolders.push(...await this._discoverFolders(sf.id,BORION_CONFLICTS_FOLDER_NAME,create));}
    const choose=(list,kind,parentId)=>{const sorted=list.slice().sort((a,b)=>this._folderSort(a,b));const persisted=this._readPersisted(mainFolderId,kind);const inParent=sorted.filter(f=>(f.parents||[]).includes(parentId));const selected=inParent.find(f=>f.id===persisted)||inParent[0]||sorted.find(f=>f.id===persisted)||sorted[0];if(!selected)throw new Error('Estrutura do journal incompleta: pasta '+kind+' ausente.');this._persist(mainFolderId,kind,selected.id);return selected;};
    const canonicalOps=choose(opsFolders,'operations',canonicalSync.id);
    const appliedFolders=[];
    for(const ofolder of opsFolders){appliedFolders.push(...await this._discoverFolders(ofolder.id,BORION_APPLIED_FOLDER_NAME,ofolder.id===canonicalOps.id));}
    const canonicalApplied=appliedFolders.length?choose(appliedFolders,'applied',canonicalOps.id):null;
    const topology={mainFolderId,syncFolders,opsFolders,appliedFolders,snapshotFolders,conflictFolders,canonicalSyncFolder:canonicalSync,canonicalOpsFolder:canonicalOps,canonicalAppliedFolder:canonicalApplied,canonicalSnapshotsFolder:choose(snapshotFolders,'snapshots',canonicalSync.id),canonicalConflictsFolder:choose(conflictFolders,'conflicts',canonicalSync.id),duplicates:{sync:syncFolders.filter(f=>f.id!==canonicalSync.id),operations:opsFolders.filter(f=>f.id!==canonicalOps.id),applied:canonicalApplied?appliedFolders.filter(f=>f.id!==canonicalApplied.id):[],snapshots:[],conflicts:[]},discoveredAt:Date.now(),fastPath:false};
    topology.duplicates.snapshots=snapshotFolders.filter(f=>f.id!==topology.canonicalSnapshotsFolder.id);
    topology.duplicates.conflicts=conflictFolders.filter(f=>f.id!==topology.canonicalConflictsFolder.id);
    this._topologyCache.set(mainFolderId,topology);this._persistTopology(mainFolderId,topology);return topology;
  },

  invalidateTopology(mainFolderId){this._topologyCache.delete(mainFolderId);try{localStorage.removeItem(this._topologyKey(mainFolderId));}catch(e){}},
  async ensureOperationsFolder(mainFolderId){return (await this.discoverTopology(mainFolderId)).canonicalOpsFolder.id;},

  /* Estruturas 6.40/6.41 não tinham a pasta applied. Ela é criada fora do
     caminho crítico do boot e passa a ser reutilizada pelo cache canônico. */
  async ensureAppliedFolder(mainFolderId){
    let topology=await this.discoverTopology(mainFolderId);
    if(topology.canonicalAppliedFolder&&topology.canonicalAppliedFolder.id)return topology.canonicalAppliedFolder;
    const parent=topology.canonicalOpsFolder;
    if(!parent||!parent.id)throw Object.assign(new Error('Pasta de operações canônica indisponível.'),{code:'JOURNAL_TOPOLOGY_INVALID'});
    let folders=await GoogleDriveFS.findChildren(parent.id,BORION_APPLIED_FOLDER_NAME,'application/vnd.google-apps.folder');
    if(!folders.length){
      const created=await GoogleDriveFS.createFolder(parent.id,BORION_APPLIED_FOLDER_NAME);
      const relisted=await GoogleDriveFS.findChildren(parent.id,BORION_APPLIED_FOLDER_NAME,'application/vnd.google-apps.folder');
      folders=relisted.slice();
      if(created&&created.id&&!folders.some(f=>f.id===created.id))folders.push(Object.assign({name:BORION_APPLIED_FOLDER_NAME,parents:[parent.id]},created));
    }
    folders=folders.filter(f=>f&&f.id).sort((a,b)=>this._folderSort(a,b));
    if(!folders.length)throw Object.assign(new Error('Não foi possível preparar a pasta de operações aplicadas.'),{code:'JOURNAL_APPLIED_FOLDER_UNAVAILABLE'});
    const selected=folders.find(f=>f.id===this._readPersisted(mainFolderId,'applied'))||folders[0];
    this._persist(mainFolderId,'applied',selected.id);
    topology=Object.assign({},topology,{canonicalAppliedFolder:selected,appliedFolders:folders,duplicates:Object.assign({},topology.duplicates||{},{applied:folders.filter(f=>f.id!==selected.id)})});
    this._topologyCache.set(mainFolderId,topology);this._persistTopology(mainFolderId,topology);
    return selected;
  },

  async _findOperationByName(topology,name){
    const existing=[];
    for(const folder of topology.opsFolders)existing.push(...await GoogleDriveFS.findChildren(folder.id,name));
    return existing.sort((a,b)=>this._folderSort(a,b));
  },

  async _validateStoredOperationFile(file,operation){
    const stored=await GoogleDriveFS.readFile(file.id);await this._validateOperation(stored,file);
    const expectedNameId=this.operationIdFromFileName(file.name);
    if(!expectedNameId||String(stored.operationId)!==String(expectedNameId))throw Object.assign(new Error('O operationId interno não corresponde ao nome do arquivo '+file.name+'.'),{code:'JOURNAL_OPERATION_NAME_MISMATCH',fileId:file.id});
    if(operation){const expectedBody=operation.format==='account-delta-v2'?operation.delta:operation.payload,storedBody=stored.format==='account-delta-v2'?stored.delta:stored.payload;const expectedChecksum=operation.checksum||await BorionSyncCore.checksumOf(expectedBody);const storedChecksum=stored.checksum||await BorionSyncCore.checksumOf(storedBody);if(String(stored.operationId)!==String(operation.operationId)||storedChecksum!==expectedChecksum)throw Object.assign(new Error('Colisão/adulteração no operationId '+operation.operationId+'.'),{code:'OPERATION_ID_COLLISION',operationId:operation.operationId,fileId:file.id});}
    return stored;
  },

  async writeOperation(mainFolderId,operation){
    if(!operation||!operation.operationId)throw new Error('Operação sem operationId.');
    operation.format=operation.format||'full-snapshot-v1';
    const raw=JSON.stringify(operation),bytes=typeof TextEncoder!=='undefined'?new TextEncoder().encode(raw).byteLength:raw.length;
    if(bytes>BORION_OPERATION_MAX_BYTES)throw Object.assign(new Error('Operação excedeu o limite seguro de '+BORION_OPERATION_MAX_BYTES+' bytes.'),{code:'OPERATION_TOO_LARGE',bytes});
    operation.sizeBytes=bytes;
    const topology=await this.discoverTopology(mainFolderId),name=this.operationFileName(operation);
    let queueRecord=null;
    if(window.BorionDurableQueue&&typeof BorionDurableQueue.get==='function')queueRecord=await BorionDurableQueue.get(operation.operationId).catch(()=>null);
    if(queueRecord&&queueRecord.remoteFileId&&GoogleDriveFS.getFileMeta){
      try{const meta=await GoogleDriveFS.getFileMeta(queueRecord.remoteFileId);if(meta&&meta.name===name){await this._validateStoredOperationFile(meta,operation);return Object.assign({alreadyExisted:true},meta);}}
      catch(e){if(!(e&&e.status===404))throw e;}
    }
    const repeated=!queueRecord||(queueRecord.attempts||0)>0||['UPLOADING_OPERATION','ERROR','DRIVE_PROTECTED'].includes(queueRecord.state);
    if(repeated){const existing=await this._findOperationByName(topology,name);if(existing.length){for(const file of existing)await this._validateStoredOperationFile(file,operation);const first=Object.assign({alreadyExisted:true},existing[0]);if(window.BorionDurableQueue)await BorionDurableQueue.markDriveProtected(operation.operationId,first.id).catch(()=>{});return first;}}
    if(window.BorionDurableQueue)await BorionDurableQueue.setState(operation.operationId,'UPLOADING_OPERATION').catch(()=>{});
    try{
      const created=await GoogleDriveFS.createFile(topology.canonicalOpsFolder.id,name,operation);
      if(window.BorionDurableQueue)await BorionDurableQueue.markDriveProtected(operation.operationId,created.id).catch(()=>{});
      return created;
    }catch(error){
      if(window.BorionDurableQueue)await BorionDurableQueue.markAttempt(operation.operationId,error).catch(()=>{});
      // O POST pode ter sido concluído no Drive e a resposta perdida. Procura pelo
      // nome antes de repetir para impedir operação duplicada.
      const existing=await this._findOperationByName(topology,name).catch(()=>[]);
      if(existing.length){for(const file of existing)await this._validateStoredOperationFile(file,operation);const first=Object.assign({alreadyExisted:true,recoveredAfterError:true},existing[0]);if(window.BorionDurableQueue)await BorionDurableQueue.markDriveProtected(operation.operationId,first.id).catch(()=>{});return first;}
      throw error;
    }
  },

  async listPendingOperationFiles(mainFolderId,options={}){
    const topology=options.topology||await this.discoverTopology(mainFolderId);
    const all=[],seen=new Set();
    for(const folder of topology.opsFolders){
      let files;
      try{files=await GoogleDriveFS.listChildren(folder.id,{maxItems:250000,maxPages:1000});}
      catch(e){if(e&&[403,404].includes(Number(e.status))){this.invalidateTopology(mainFolderId);}throw e;}
      for(const f of files){if(!f||!f.id||seen.has(f.id))continue;seen.add(f.id);const operationId=this.operationIdFromFileName(f.name);if(!operationId){if(/^op_/i.test(String(f.name||'')))throw Object.assign(new Error('Nome de operação inválido: '+f.name),{code:'JOURNAL_FILENAME_INVALID',fileId:f.id});continue;}all.push(Object.assign({},f,{operationIdFromName:operationId,journalFolderId:folder.id}));}
    }
    if(window.BorionPerf)BorionPerf.count('operationsListed',all.length);
    return all.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))||String(a.id).localeCompare(String(b.id)));
  },

  async listAppliedOperationFiles(mainFolderId,options={}){
    const topology=options.topology||await this.discoverTopology(mainFolderId),folders=topology.appliedFolders||[];
    const all=[],seen=new Set();
    for(const folder of folders){
      const files=await GoogleDriveFS.listChildren(folder.id,{maxItems:250000,maxPages:1000});
      for(const f of files){if(!f||!f.id||seen.has(f.id))continue;const operationId=this.operationIdFromFileName(f.name);if(!operationId)continue;seen.add(f.id);all.push(Object.assign({},f,{operationIdFromName:operationId,appliedFolderId:folder.id}));}
    }
    return all.sort((a,b)=>String(b.createdTime||b.modifiedTime||'').localeCompare(String(a.createdTime||a.modifiedTime||''))||String(b.name||'').localeCompare(String(a.name||'')));
  },

  async _validateOperation(op,file){
    if(!op||typeof op!=='object'||!op.operationId||!(op.payload||op.delta))throw Object.assign(new Error('Operação inválida em '+(file&&file.name||'arquivo desconhecido')+'.'),{code:'JOURNAL_OPERATION_INVALID'});
    if(op.checksum){const started=Date.now();const body=op.format==='account-delta-v2'?op.delta:op.payload;const actual=await BorionSyncCore.checksumOf(body);if(window.BorionPerf)BorionPerf.count('checksumMs',Date.now()-started);if(actual!==op.checksum)throw Object.assign(new Error('Checksum inválido na operação '+op.operationId+'.'),{code:'JOURNAL_OPERATION_TAMPERED',operationId:op.operationId});}
    return true;
  },

  async consolidate(mainFolderId,remoteCurrentPayload){
    const consolidateStarted=Date.now();
    if(window.BorionPerf)BorionPerf.startStage('journal_consolidate');
    const topology=await this.discoverTopology(mainFolderId);
    const meta=(remoteCurrentPayload&&remoteCurrentPayload.__syncMeta640)||{};
    const applied=new Set(Array.isArray(meta.appliedOperationIds)?meta.appliedOperationIds.map(String):Object.keys(meta.appliedOperationIds||{}).map(String));
    const pendingFiles=await this.listPendingOperationFiles(mainFolderId,{topology});
    const operations=[],seenNames=new Set();let skippedByName=0,downloaded=0;
    for(const f of pendingFiles){
      const nameId=String(f.operationIdFromName||'');
      if(applied.has(nameId)||seenNames.has(nameId)){skippedByName++;continue;}
      seenNames.add(nameId);
      let op;
      try{op=await GoogleDriveFS.readFile(f.id);downloaded++;if(window.BorionPerf)BorionPerf.count('operationsDownloaded',1);await this._validateOperation(op,f);}
      catch(e){e.fileId=f.id;e.fileName=f.name;throw e;}
      if(String(op.operationId)!==nameId)throw Object.assign(new Error('O operationId interno não corresponde ao nome '+f.name+'.'),{code:'JOURNAL_OPERATION_NAME_MISMATCH',fileId:f.id,operationId:op.operationId,nameOperationId:nameId});
      if(applied.has(nameId)){skippedByName++;continue;}
      operations.push({file:f,op});
    }
    if(window.BorionPerf)BorionPerf.count('operationsSkippedByName',skippedByName);
    operations.sort((a,b)=>String(a.op.createdAt||'').localeCompare(String(b.op.createdAt||''))||String(a.op.operationId).localeCompare(String(b.op.operationId))||String(a.file.id).localeCompare(String(b.file.id)));
    let acc=remoteCurrentPayload||{profiles:[],dataByProfile:{},config:{}};const newlyApplied=[];
    const mergeStarted=Date.now();
    for(const item of operations){const op=item.op,id=String(op.operationId);if(applied.has(id))continue;acc=op.format==='account-delta-v2'?BorionSyncCore.mergeAccountDelta(op.delta,acc):BorionSyncCore.mergeAccountPayload(op.basePayload||null,op.payload,acc);applied.add(id);newlyApplied.push({fileId:item.file.id,name:item.file.name,operationId:id,createdAt:op.createdAt||null,journalFolderId:item.file.journalFolderId});}
    if(window.BorionPerf)BorionPerf.count('mergeMs',Date.now()-mergeStarted);
    const previousMeta=acc.__syncMeta640&&typeof acc.__syncMeta640==='object'?acc.__syncMeta640:{};
    acc.__syncMeta640=Object.assign({},previousMeta,{schemaVersion:BorionSyncCore.BORION_DATA_SCHEMA_VERSION,appliedOperationIds:Array.from(applied).sort(),consolidatedThrough:operations.reduce((m,x)=>String(x.op.createdAt||'')>m?String(x.op.createdAt||''):m,String(previousMeta.consolidatedThrough||'')),lastConsolidatedAt:new Date().toISOString(),journalFolderDuplicates:Object.fromEntries(Object.entries(topology.duplicates||{}).map(([kind,items])=>[kind,(items||[]).map(x=>x&&x.id).filter(Boolean).sort()]))});
    const canonical=JSON.parse(JSON.stringify(acc));delete canonical.integrity;const checksumStarted=Date.now();
    acc.integrity=Object.assign({},acc.integrity||{},{algorithm:'SHA-256',checksum:await BorionSyncCore.checksumOf(canonical),schemaVersion:BorionSyncCore.BORION_DATA_SCHEMA_VERSION,generatedAt:new Date().toISOString(),recordCount:(window.BorionDataGuard?BorionDataGuard.countAccountRecords(acc).__total:undefined),profileCount:(acc.profiles||[]).length});
    if(window.BorionPerf){BorionPerf.count('checksumMs',Date.now()-checksumStarted);BorionPerf.endStage('journal_consolidate',{listed:pendingFiles.length,skippedByName,downloaded,totalMs:Date.now()-consolidateStarted});}
    return {consolidated:acc,newlyApplied,topology,stats:{listed:pendingFiles.length,skippedByName,downloaded}};
  },

  async validateSnapshot(snapshot,requiredOperationId){
    if(!snapshot||!snapshot.integrity||!snapshot.integrity.checksum)return {valid:false,reason:'checksum_ausente'};
    const canonical=JSON.parse(JSON.stringify(snapshot));delete canonical.integrity;const started=Date.now();const actual=await BorionSyncCore.checksumOf(canonical);if(window.BorionPerf)BorionPerf.count('checksumMs',Date.now()-started);
    if(actual!==snapshot.integrity.checksum)return {valid:false,reason:'checksum_divergente',actual};
    const ids=new Set((snapshot.__syncMeta640&&snapshot.__syncMeta640.appliedOperationIds||[]).map(String));
    if(requiredOperationId&&!ids.has(String(requiredOperationId)))return {valid:false,reason:'operacao_nao_confirmada'};
    return {valid:true,checksum:actual};
  },

  async archiveConfirmedOperations(mainFolderId,snapshot,items=[]){
    const valid=await this.validateSnapshot(snapshot);if(!valid.valid)return {archived:0,blocked:'snapshot_invalid',errors:[]};
    const applied=new Set((snapshot.__syncMeta640&&snapshot.__syncMeta640.appliedOperationIds||[]).map(String));
    const appliedFolder=await this.ensureAppliedFolder(mainFolderId).catch(()=>null);const topology=await this.discoverTopology(mainFolderId);if(!appliedFolder||!GoogleDriveFS.moveFile)return {archived:0,blocked:'applied_folder_unavailable',errors:[]};
    let archived=0;const errors=[];
    for(const item of items||[]){if(!item||!item.fileId||!applied.has(String(item.operationId)))continue;try{if(window.BorionDurableQueue)await BorionDurableQueue.setState(item.operationId,'ARCHIVING_OPERATION').catch(()=>{});await GoogleDriveFS.moveFile(item.fileId,appliedFolder.id,item.journalFolderId||topology.canonicalOpsFolder.id);archived++;if(window.BorionPerf)BorionPerf.count('operationsArchived',1);if(window.BorionDurableQueue)await BorionDurableQueue.complete(item.operationId,{archivedAt:new Date().toISOString(),remoteFileId:item.fileId}).catch(()=>{});}catch(e){errors.push({fileId:item.fileId,operationId:item.operationId,error:String(e&&e.message||e)});}}
    return {archived,errors};
  },

  async cleanupAppliedOperations(mainFolderId,snapshot,options={}){
    const valid=await this.validateSnapshot(snapshot);if(!valid.valid)return {trashed:0,blocked:'snapshot_invalid'};
    if(!options.backupValidated)return {trashed:0,blocked:'backup_not_validated'};
    if(!options.deviceGraceSatisfied)return {trashed:0,blocked:'device_grace_not_satisfied'};
    const appliedIds=new Set((snapshot.__syncMeta640&&snapshot.__syncMeta640.appliedOperationIds||[]).map(String));
    const maxKeep=Math.max(20,Number(options.maxKeep)||200),retentionMs=Number(options.retentionMs)||7*24*60*60*1000,cutoff=Date.now()-retentionMs;
    let files=await this.listAppliedOperationFiles(mainFolderId);if(!files.length)files=await this.listPendingOperationFiles(mainFolderId);const errors=[];let trashed=0;
    for(let index=0;index<files.length;index++){
      const f=files[index],opId=String(f.operationIdFromName||'');if(!appliedIds.has(opId))continue;
      const t=Date.parse(f.createdTime||f.modifiedTime||'');const beyondCount=index>=maxKeep,older=Number.isFinite(t)&&t<cutoff;
      if(!beyondCount&&!older)continue;
      try{await GoogleDriveFS.trashFile(f.id);trashed++;}catch(e){errors.push({fileId:f.id,operationId:opId,error:String(e&&e.message||e)});break;}
    }
    return {trashed,kept:files.length-trashed,retentionDays:Math.round(retentionMs/86400000),maxKeep,errors,interrupted:errors.length>0};
  },

  async compactAppliedOperationIds(snapshot,options={}){
    const valid=await this.validateSnapshot(snapshot);if(!valid.valid)return {compacted:false,blocked:'snapshot_invalid'};
    if(!options.backupValidated||!options.archiveValidated||!options.deviceGraceSatisfied||!options.verifiedNoPendingForRemovedIds)return {compacted:false,blocked:'safety_preconditions_missing'};
    const ids=(snapshot.__syncMeta640&&snapshot.__syncMeta640.appliedOperationIds||[]).map(String).sort();const max=Math.max(1000,Number(options.maxIds)||10000);if(ids.length<=max)return {compacted:false,removed:0};
    const removed=ids.slice(0,ids.length-max),kept=ids.slice(-max),removedChecksum=await BorionSyncCore.checksumOf(removed);
    snapshot.__syncMeta640.appliedOperationIds=kept;snapshot.__syncMeta640.appliedOperationCheckpoint={removedCount:removed.length,removedChecksum,compactedAt:new Date().toISOString(),preconditions:'backup+archive+device-grace+no-pending'};
    const canonical=JSON.parse(JSON.stringify(snapshot));delete canonical.integrity;snapshot.integrity=Object.assign({},snapshot.integrity,{checksum:await BorionSyncCore.checksumOf(canonical),generatedAt:new Date().toISOString()});
    return {compacted:true,removed:removed.length,kept:kept.length,removedChecksum};
  }
};
window.BorionDriveJournal640=BorionDriveJournal640;
