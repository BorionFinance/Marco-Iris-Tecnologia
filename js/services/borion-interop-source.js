(() => {
  'use strict';

  /* BORION INTEROP SOURCE v3.0.0 — MIT -> BORION
     Segurança: identidade de empresa compartilhada, identidade de dispositivo,
     bloqueio de publicação antes da carga oficial e proteção contra snapshot vazio. */
  const SPEC = Object.freeze({
    schema: 'borion.interop.snapshot', schemaVersion: 2, bridgeVersion: '3.0.1',
    sourceAppId: 'marco-iris', sourceAppName: 'Marco Iris Tecnologia', sourceAppVersion: '2.5.1',
    targetProfileAlias: 'default', snapshotFile: 'marco-iris.bridge.json', ackFile: 'marco-iris.ack.json',
    integrationFolder: 'Borion_Integracoes'
  });
  const DEVICE_KEY='marco_iris_device_id_v240_clean';
  const runtime={started:false,ready:false,initialSyncComplete:false,paused:new Set(),status:'waiting-authentication',reason:'Aguardando autenticação e base oficial.'};
  let timer=null,interval=null,stateGetter=null,publishRequested=0,publishCompleted=0,publishState=null,publishLoopPromise=null,publishWaiters=[];

  function clone(value){ return value==null?value:JSON.parse(JSON.stringify(value)); }
  function nowIso(){ return new Date().toISOString(); }
  function todayIso(){ return nowIso().slice(0,10); }
  function randomId(){
    if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function')return globalThis.crypto.randomUUID();
    return 'id_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,12);
  }
  function getDeviceId(){
    try{let id=localStorage.getItem(DEVICE_KEY);if(!id){id=randomId();localStorage.setItem(DEVICE_KEY,id);}return id;}catch(_e){if(!runtime.deviceId)runtime.deviceId=randomId();return runtime.deviceId;}
  }
  function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();}
  function stableStringify(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stableStringify).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stableStringify(value[k])).join(',')+'}';
  }
  function hash(value){const text=typeof value==='string'?value:stableStringify(value);let h=2166136261;for(let i=0;i<text.length;i+=1){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return ('00000000'+(h>>>0).toString(16)).slice(-8);}
  function activeData(state){if(!state||!state.dataByProfile)return null;const id=state.activeProfileId||(state.profiles&&state.profiles[0]&&state.profiles[0].id);return id?state.dataByProfile[id]:null;}
  function isBridgeExcluded(item){return !!(item?.excludeFromBorion||item?.bridgeEligible===false||(item?.legacyImported&&item?.migrationOrigin==='MarcoIris-AppSheet-Legacy'));}
  function countSourceRecords(state){const data=activeData(state);return data&&Array.isArray(data.payments)?data.payments.filter(item=>!isBridgeExcluded(item)).length:0;}

  function ensureBridgeState(state){
    if(!state||typeof state!=='object')throw new Error('Estado do Marco Iris indisponível.');
    if(!state.interconnections||typeof state.interconnections!=='object')state.interconnections={};
    if(!state.interconnections.borion||typeof state.interconnections.borion!=='object')state.interconnections.borion={};
    const bridge=state.interconnections.borion;
    const previousSchemaVersion=Math.max(0,Number(bridge.schemaVersion)||0);
    /* Migração: o antigo instanceId da base oficial passa a ser companyInstanceId.
       Nunca é criado por navegador depois que a base remota foi carregada. */
    bridge.companyInstanceId=String(bridge.companyInstanceId||bridge.instanceId||'').trim();
    if(!bridge.companyInstanceId)bridge.companyInstanceId=randomId();
    bridge.instanceId=bridge.companyInstanceId; // alias legado, somente leitura conceitual
    bridge.deviceId=getDeviceId();
    bridge.schemaVersion=3;bridge.protectedBoundary=true;bridge.changePolicy='explicit-request-only';
    bridge.sourceAppId=SPEC.sourceAppId;bridge.targetProfileAlias=SPEC.targetProfileAlias;
    bridge.revision=Math.max(0,Number(bridge.revision)||0);bridge.shadow=bridge.shadow&&typeof bridge.shadow==='object'?bridge.shadow:{};
    if(previousSchemaVersion<3){
      /* As versões antigas indexavam shadow pelo aggregateId. O protocolo 2 usa
         sourceRecordId. Limpar somente o índice técnico evita gerar tombstones
         falsos durante a migração; os registros reais continuam intactos. */
      bridge.shadow={};bridge.tombstones=[];bridge.identityMigratedAt=bridge.identityMigratedAt||nowIso();
    }
    bridge.tombstones=Array.isArray(bridge.tombstones)?bridge.tombstones:[];bridge.recordAcks=bridge.recordAcks&&typeof bridge.recordAcks==='object'?bridge.recordAcks:{};
    bridge.lastContentHash=String(bridge.lastContentHash||'');bridge.lastPublishAt=String(bridge.lastPublishAt||'');
    bridge.lastPublishStatus=String(bridge.lastPublishStatus||'prepared-offline');bridge.lastError=String(bridge.lastError||'');
    bridge.lastAckAt=String(bridge.lastAckAt||'');bridge.lastAckRevision=Math.max(0,Number(bridge.lastAckRevision)||0);
    return bridge;
  }

  function statusCode(item){const s=normalize(item?.status);if(s.includes('cancel')||item?.cancelledAt)return 'cancelled';if(item?.paymentDate||s==='pago'||s==='recebido'||s==='realizado')return 'paid';if(s.includes('atras')||s.includes('vencid'))return 'overdue';return 'open';}
  function paymentMethodLabel(item){const raw=String(item?.paymentMethod||'').trim()||'Não informado';const n=Math.max(0,Number(item?.installments||item?.parcelas||item?.installmentCount||0)||0);if(normalize(raw).includes('credito')&&n>1&&!/\d+x/i.test(raw))return `Crédito ${n}x`;return raw;}
  function clientForPayment(data,item,order){if(order?.clientName)return order.clientName;const byId=(data.clients||[]).find(c=>String(c.id)===String(item.clientId));return byId?.name||item.clientName||'';}
  function expenseName(item,order){return String(item.expenseName||item.name||item.description||item.notes||(order?`Despesa vinculada à ${order.id}`:'Despesa MIT')).trim();}
  function externalReference(item,orderId){return String(item.externalReference||[orderId,item.id].filter(Boolean).join(':')||item.id);}

  function projectRecord(item,state,bridge){
    if(!item||!item.id||isBridgeExcluded(item))return null;const data=activeData(state)||{};const order=(data.serviceOrders||[]).find(x=>String(x.id)===String(item.orderId));
    const status=statusCode(item),direction=normalize(item.type)==='despesa'?'expense':'income',amount=Math.round((Number(item.value)||0)*100)/100;
    const entityId=String(item.code||item.id),receiptId=entityId,orderNumber=String(item.orderId||order?.id||''),clientName=clientForPayment(data,item,order),method=paymentMethodLabel(item),isIncome=direction==='income';
    const description=isIncome?`${orderNumber||'Sem OSV'} • ${clientName||'Cliente não informado'}`:expenseName(item,order);
    const date=(isIncome?item.paymentDate:(item.paymentDate||item.dueDate))||item.createdAt?.slice?.(0,10)||todayIso();
    const kind=isIncome?'receipt':'expense';const sourceRecordId=`marco:${kind}:${entityId}`;
    const aggregateId=`${SPEC.sourceAppId}:${bridge.companyInstanceId}:${kind}:${entityId}`;
    const payload={
      aggregateId,uniqueKey:`${isIncome?'REC':'DES'}:${entityId}`,idempotencyKey:sourceRecordId,
      sourceSystem:SPEC.sourceAppId,sourceRecordId,sourceEntityType:kind,operationType:status==='cancelled'?'cancel':'upsert',
      entityType:kind,entityId,receiptId,orderNumber,direction,amount,value:amount,currency:'BRL',date,dueDate:item.dueDate||'',paymentDate:item.paymentDate||'',status,
      active:status!=='cancelled'&&amount>0,settled:status==='paid',importPolicy:isIncome?'automatic-when-paid':'automatic-when-mapped',description,
      name:isIncome?description:expenseName(item,order),localPurchase:String(item.localPurchase||item.purchaseLocation||item.local||''),
      category:isIncome?'MIT':String(item.expenseCategory||item.category||'Outro'),paymentMethod:method,paymentOrigin:isIncome?'':String(item.paymentOrigin||'').trim(),
      expenseType:isIncome?'':(normalize(item.expenseType)==='fixa'?'fixa':'variavel'),installments:Math.max(1,Number(item.installments||item.parcelas||item.installmentCount||1)||1),
      clientName,origin:'MIT',sourceAppDisplayName:'Marco Iris Tec',notes:item.notes||'',externalReference:externalReference(item,orderNumber),
      sourceUpdatedAt:item.updatedAt||state.updatedAt||nowIso(),
      sourceLabels:{receiptId:'ID do recebimento',orderNumber:'Número da OSV',clientName:'Cliente',amount:'Valor',paymentDate:'Data do pagamento',paymentMethod:'Forma de pagamento',status:'Status',externalReference:'Referência externa',name:'Nome',localPurchase:'Local da compra',paymentOrigin:'Origem do pagamento',expenseType:'Tipo de despesa'},
      raw:{'ID do recebimento':receiptId,'Número da OSV':orderNumber,'Nome do cliente':clientName,'Nome':isIncome?description:expenseName(item,order),'Local da compra':String(item.localPurchase||item.purchaseLocation||item.local||''),'Valor':amount,'Data do pagamento':item.paymentDate||'','Data de vencimento':item.dueDate||'','Forma de pagamento':method,'Origem do pagamento':isIncome?'':String(item.paymentOrigin||''),'Tipo de despesa':isIncome?'':(normalize(item.expenseType)==='fixa'?'Fixa':'Variável'),'Status':status,'Referência externa':externalReference(item,orderNumber)}
    };
    payload.fingerprint=hash(payload);return payload;
  }
  function projectRecords(state){const bridge=ensureBridgeState(state),data=activeData(state),items=data&&Array.isArray(data.payments)?data.payments:[],dedupe=new Map();items.forEach(item=>{try{const r=projectRecord(item,state,bridge);if(r&&r.sourceRecordId)dedupe.set(r.sourceRecordId,r);}catch(e){console.warn('[BORION_INTEROP_SOURCE] Registro ignorado:',e);}});return [...dedupe.values()].sort((a,b)=>a.sourceRecordId.localeCompare(b.sourceRecordId));}

  function reconcileState(state){
    const bridge=ensureBridgeState(state),records=projectRecords(state),current=new Map(records.map(r=>[r.sourceRecordId,r])),previous=bridge.shadow||{};
    const tombstoneMap=new Map((bridge.tombstones||[]).map(t=>[String(t.sourceRecordId||t.aggregateId),t]));
    Object.keys(previous).forEach(id=>{if(!current.has(id)){const parts=String(id).split(':'),kind=parts[1]||'receipt',entityId=parts.slice(2).join(':')||parts[parts.length-1]||id,aggregateId=`${SPEC.sourceAppId}:${bridge.companyInstanceId}:${kind}:${entityId}`;tombstoneMap.set(id,{sourceRecordId:id,aggregateId,entityId,operationType:'delete',deletedAt:nowIso(),deviceId:bridge.deviceId,revision:bridge.revision+1,reason:'source-record-removed'});}});
    current.forEach((_r,id)=>tombstoneMap.delete(id));bridge.shadow=Object.fromEntries(records.map(r=>[r.sourceRecordId,r.fingerprint]));
    const cutoff=Date.now()-366*24*60*60*1000;bridge.tombstones=[...tombstoneMap.values()].filter(x=>!x.deletedAt||new Date(x.deletedAt).getTime()>=cutoff).sort((a,b)=>String(a.sourceRecordId||a.aggregateId).localeCompare(String(b.sourceRecordId||b.aggregateId))).slice(-4000);
    const content={companyInstanceId:bridge.companyInstanceId,records,tombstones:bridge.tombstones};const contentHash=hash(content);
    if(contentHash!==bridge.lastContentHash){bridge.revision+=1;bridge.lastContentHash=contentHash;}
    const generatedAt=nowIso();const snapshot={schema:SPEC.schema,schemaVersion:SPEC.schemaVersion,bridgeVersion:SPEC.bridgeVersion,sourceAppId:SPEC.sourceAppId,sourceAppName:SPEC.sourceAppName,sourceAppVersion:SPEC.sourceAppVersion,
      companyInstanceId:bridge.companyInstanceId,instanceId:bridge.companyInstanceId,deviceId:bridge.deviceId,targetProfileAlias:SPEC.targetProfileAlias,revision:bridge.revision,generatedAt,sourceUpdatedAt:state.updatedAt||generatedAt,
      recordCount:records.length,isCompleteSnapshot:true,completeSnapshot:true,contentHash,checksum:hash({companyInstanceId:bridge.companyInstanceId,revision:bridge.revision,contentHash,records,tombstones:bridge.tombstones}),records,tombstones:clone(bridge.tombstones)};
    return snapshot;
  }

  async function writeJsonToDirectory(rootHandle,filename,object){const dir=rootHandle.name===SPEC.integrationFolder?rootHandle:await rootHandle.getDirectoryHandle(SPEC.integrationFolder,{create:true});const fh=await dir.getFileHandle(filename,{create:true});const w=await fh.createWritable();await w.write(new Blob([JSON.stringify(object,null,2)],{type:'application/json'}));await w.close();return dir;}
  async function readJsonFromDirectory(rootHandle,filename){try{const dir=rootHandle.name===SPEC.integrationFolder?rootHandle:await rootHandle.getDirectoryHandle(SPEC.integrationFolder);const fh=await dir.getFileHandle(filename);return JSON.parse(await(await fh.getFile()).text());}catch(e){if(e&&(e.name==='NotFoundError'||e.name==='TypeMismatchError'))return null;throw e;}}
  function snapshotCompany(snapshot){return String(snapshot?.companyInstanceId||snapshot?.instanceId||'');}
  function validateCandidateAgainstRemote(candidate,remote){
    if(!remote)return {ok:true};const localCompany=snapshotCompany(candidate),remoteCompany=snapshotCompany(remote);
    if(remoteCompany&&localCompany!==remoteCompany)return {ok:false,code:'INSTANCE_CONFLICT',message:'A origem oficial da integração é diferente. A publicação foi bloqueada.'};
    const rr=Math.max(0,Number(remote.revision)||0),lr=Math.max(0,Number(candidate.revision)||0),remoteRecords=Array.isArray(remote.records)?remote.records:[],candidateRecords=Array.isArray(candidate.records)?candidate.records:[],remoteCount=Number(remote.recordCount??remoteRecords.length??0),localCount=Number(candidate.recordCount??candidateRecords.length??0);
    const tombstoneKeys=new Set((candidate.tombstones||[]).flatMap(item=>[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')]).filter(Boolean));
    const candidateKeys=new Set(candidateRecords.flatMap(item=>[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')]).filter(Boolean));
    const removedRemote=remoteRecords.filter(item=>{const keys=[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')].filter(Boolean);return keys.length&&!keys.some(key=>candidateKeys.has(key));});
    const explicitDeletionCoverage=removedRemote.length>0&&removedRemote.every(item=>[String(item?.sourceRecordId||''),String(item?.aggregateId||''),String(item?.entityId||'')].filter(Boolean).some(key=>tombstoneKeys.has(key)));
    if(remoteCount>0&&localCount===0&&!explicitDeletionCoverage)return {ok:false,code:'EMPTY_BASE_BLOCKED',message:'A base local está vazia, mas o Google Drive contém dados e não há exclusões explícitas suficientes. A publicação foi bloqueada.'};
    if(remoteCount>=4&&localCount<Math.ceil(remoteCount*.5)&&!explicitDeletionCoverage)return {ok:false,code:'SUSPICIOUS_DROP',message:'Redução anormal de registros sem exclusões explícitas. Publicação bloqueada.'};
    /* O bridge é um artefato derivado da base oficial. A revisão do bridge pode ficar
       à frente da revisão gravada dentro do current principal após uma aba ser fechada
       entre duas confirmações. Para a mesma empresa, um snapshot completo vindo da base
       oficial pode substituir o bridge antigo; a concorrência real continua protegida
       pelo arquivo principal do Drive. */
    return {ok:true,sameContent:remoteCompany===localCompany&&remote.contentHash===candidate.contentHash,remoteRevision:rr,localRevision:lr,explicitDeletionCoverage};
  }

  function applyAcknowledgement(state,ack){
    if(!ack||ack.schema!=='borion.interop.ack'||ack.sourceAppId!==SPEC.sourceAppId)return false;const bridge=ensureBridgeState(state),company=String(ack.companyInstanceId||ack.instanceId||'');
    if(company&&company!==bridge.companyInstanceId)return false;bridge.lastAckAt=ack.processedAt||nowIso();bridge.lastAckRevision=Number(ack.sourceRevision)||0;
    (ack.records||[]).forEach(item=>{const key=String(item.sourceRecordId||item.aggregateId||item.entityId||'');if(key)bridge.recordAcks[key]=item;});
    const data=activeData(state),items=data&&Array.isArray(data.payments)?data.payments:[];const byEntity=new Map((ack.records||[]).filter(x=>x.entityId).map(x=>[String(x.entityId),x]));
    items.forEach(item=>{const result=byEntity.get(String(item.code||item.id));if(!result)return;item.borionSync={status:result.result||result.status||'processed',borionTransactionId:result.borionId||result.borionTransactionId||'',targetProfileId:ack.targetProfileId||'',processedAt:result.processedAt||ack.processedAt||nowIso(),message:result.message||''};});
    return true;
  }

  function canPublish(){return runtime.started&&runtime.ready&&runtime.initialSyncComplete&&runtime.paused.size===0;}
  function setReady(state,context={}){if(state)ensureBridgeState(state);runtime.ready=true;runtime.initialSyncComplete=true;runtime.status='ready';runtime.reason='Base oficial carregada e validada.';if(context.companyInstanceId&&state){const b=ensureBridgeState(state);if(b.companyInstanceId!==context.companyInstanceId)throw new Error('companyInstanceId diverge da base oficial.');}schedule(state||stateGetter?.(),40);return getRuntimeStatus();}
  function setNotReady(reason='Sincronização inicial incompleta.'){runtime.ready=false;runtime.initialSyncComplete=false;runtime.status='blocked';runtime.reason=reason;clearTimeout(timer);return getRuntimeStatus();}
  function pause(reason='operation'){runtime.paused.add(String(reason));clearTimeout(timer);runtime.status='paused';runtime.reason=String(reason);return getRuntimeStatus();}
  function resume(reason='operation'){runtime.paused.delete(String(reason));if(canPublish()){runtime.status='ready';runtime.reason='Base oficial carregada e validada.';schedule(stateGetter?.(),60);}return getRuntimeStatus();}
  function getRuntimeStatus(){return {started:runtime.started,ready:runtime.ready,initialSyncComplete:runtime.initialSyncComplete,paused:[...runtime.paused],status:runtime.status,reason:runtime.reason,deviceId:getDeviceId(),publishRequested,publishCompleted,publishInFlight:!!publishLoopPromise};}

  async function publishOnce(state){
    const bridge=ensureBridgeState(state);let snapshot;const destinations=[],errors=[];
    try{
      snapshot=reconcileState(state);await MarcoStorage.save(state);
      try{const handle=await MarcoStorage.getFolderHandle();if(handle&&await MarcoStorage.ensurePermission(handle,false)){const remote=await readJsonFromDirectory(handle,SPEC.snapshotFile);const guard=validateCandidateAgainstRemote(snapshot,remote);if(!guard.ok)throw Object.assign(new Error(guard.message),{code:guard.code});if(!guard.sameContent){await writeJsonToDirectory(handle,SPEC.snapshotFile,snapshot);destinations.push('local-folder');}else destinations.push('local-unchanged');const ack=await readJsonFromDirectory(handle,SPEC.ackFile);if(ack&&applyAcknowledgement(state,ack))destinations.push('local-ack');}}catch(e){errors.push('Pasta local: '+(e.message||String(e)));if(['INSTANCE_CONFLICT','EMPTY_BASE_BLOCKED','SUSPICIOUS_DROP','REMOTE_NEWER'].includes(e.code))throw e;}
      try{const drive=window.GoogleDriveMarco;if(drive&&drive.isConfigured&&drive.isConfigured()&&drive.writeIntegrationJson){const remote=await drive.readIntegrationJson(SPEC.snapshotFile);const guard=validateCandidateAgainstRemote(snapshot,remote);if(!guard.ok)throw Object.assign(new Error(guard.message),{code:guard.code});if(!guard.sameContent){await drive.writeIntegrationJson(SPEC.snapshotFile,snapshot);const confirmed=await drive.readIntegrationJson(SPEC.snapshotFile);if(!confirmed||snapshotCompany(confirmed)!==bridge.companyInstanceId||confirmed.contentHash!==snapshot.contentHash||Number(confirmed.revision)!==Number(snapshot.revision))throw Object.assign(new Error('O bridge gravado não foi confirmado pelo Google Drive.'),{code:'BRIDGE_CONFIRMATION_FAILED'});destinations.push('google-drive');}else destinations.push('google-unchanged');const ack=await drive.readIntegrationJson(SPEC.ackFile);if(ack&&applyAcknowledgement(state,ack))destinations.push('google-ack');}}catch(e){errors.push('Google Drive: '+(e.message||String(e)));if(['INSTANCE_CONFLICT','EMPTY_BASE_BLOCKED','SUSPICIOUS_DROP','REMOTE_NEWER'].includes(e.code))throw e;}
      bridge.lastPublishAt=nowIso();bridge.lastPublishStatus=destinations.some(x=>x.includes('drive')||x.includes('folder'))?'published':(destinations.some(x=>x.includes('unchanged'))?'unchanged':'prepared-offline');bridge.lastError=errors.join(' | ');await MarcoStorage.save(state);return {snapshot,destinations,errors};
    }catch(error){bridge.lastPublishStatus='blocked';bridge.lastError=error.message||String(error);runtime.status='blocked';runtime.reason=bridge.lastError;await MarcoStorage.save(state).catch(()=>{});return {snapshot,blocked:true,code:error.code||'PUBLISH_FAILED',message:bridge.lastError,destinations,errors};}
  }
  function settlePublishWaiters(target,result,error){const keep=[];for(const waiter of publishWaiters){if(waiter.seq<=target){error?waiter.reject(error):waiter.resolve(result);}else keep.push(waiter);}publishWaiters=keep;}
  async function runPublishLoop(){
    if(publishLoopPromise)return await publishLoopPromise;
    publishLoopPromise=(async()=>{
      let lastResult=null;
      while(publishCompleted<publishRequested){
        if(!canPublish())break;
        const target=publishRequested,state=publishState||stateGetter?.();
        if(!state){publishCompleted=target;lastResult={blocked:true,code:'STATE_UNAVAILABLE',message:'Estado indisponível para publicar.'};settlePublishWaiters(target,lastResult,null);continue;}
        try{lastResult=await publishOnce(state);publishCompleted=target;settlePublishWaiters(target,lastResult,null);}
        catch(error){publishCompleted=target;settlePublishWaiters(target,null,error);throw error;}
      }
      return lastResult;
    })().finally(()=>{publishLoopPromise=null;if(canPublish()&&publishCompleted<publishRequested)runPublishLoop().catch(e=>console.warn('[BORION_INTEROP_SOURCE] Falha ao republicar:',e));});
    return await publishLoopPromise;
  }
  function requestPublish(state,{delay=0}={}){
    if(!state)return Promise.resolve({blocked:true,code:'STATE_UNAVAILABLE',message:'Estado indisponível para publicar.'});
    if(!canPublish())return Promise.resolve({blocked:true,code:'INITIAL_SYNC_REQUIRED',message:runtime.reason});
    publishState=state;const seq=++publishRequested;
    const promise=new Promise((resolve,reject)=>publishWaiters.push({seq,resolve,reject}));
    clearTimeout(timer);
    if(delay>0)timer=setTimeout(()=>runPublishLoop().catch(e=>console.warn('[BORION_INTEROP_SOURCE] Falha ao publicar:',e)),delay);else runPublishLoop().catch(()=>{});
    return promise;
  }
  function prepareState(state){return reconcileState(state||(stateGetter&&stateGetter()));}
  async function publish(state,options={}){return await requestPublish(state,{delay:0,forceAfterValidation:!!options.forceAfterValidation});}
  function schedule(state,delay=140){if(!state||!canPublish())return false;publishState=state;++publishRequested;clearTimeout(timer);timer=setTimeout(()=>runPublishLoop().catch(e=>console.warn('[BORION_INTEROP_SOURCE] Falha ao publicar:',e)),delay);return true;}
  function start(getter){if(typeof getter==='function')stateGetter=getter;if(runtime.started)return getRuntimeStatus();runtime.started=true;runtime.status='waiting-authentication';runtime.reason='Aguardando autenticação e carga da base oficial.';const tick=()=>{const state=stateGetter?stateGetter():null;if(state&&canPublish())schedule(state,20);};interval=setInterval(tick,5000);if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick();});if(typeof window!=='undefined'&&window.addEventListener){window.addEventListener('online',tick);window.addEventListener('pagehide',tick);}return getRuntimeStatus();}
  function stop(){clearTimeout(timer);clearInterval(interval);runtime.started=false;runtime.ready=false;runtime.initialSyncComplete=false;runtime.status='stopped';runtime.reason='Integração parada.';publishRequested=publishCompleted=0;publishState=null;publishWaiters=[];}

  window.MarcoBorionInterop=Object.freeze({spec:SPEC,start,stop,schedule,publish,prepareState,setReady,setNotReady,pause,resume,getRuntimeStatus,
    forceSync:state=>publish(state||(stateGetter&&stateGetter()),{forceAfterValidation:canPublish()}),getStatus(state){return clone(ensureBridgeState(state||(stateGetter&&stateGetter())));},
    __test:{hash,stableStringify,isBridgeExcluded,projectRecord,projectRecords,reconcileState,applyAcknowledgement,statusCode,paymentMethodLabel,validateCandidateAgainstRemote,ensureBridgeState,getDeviceId,canPublish,setReady,setNotReady,pause,resume,getRuntimeStatus,countSourceRecords,runPublishLoop,requestPublish,publishOnce}
  });
})();
