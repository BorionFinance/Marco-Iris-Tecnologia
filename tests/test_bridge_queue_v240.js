'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const assert=(c,m)=>{if(!c)throw new Error('FALHOU: '+m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const store=new Map([['marco_iris_device_id_v240_clean','device-queue-test']]);
  let remote=null,writes=0,delayNext=false;
  const context={console,setTimeout,clearTimeout,setInterval:()=>1,clearInterval,crypto:global.crypto,Blob,TextEncoder};
  context.window=context;context.globalThis=context;context.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
  context.document={hidden:false,addEventListener(){}};context.addEventListener=()=>{};
  context.MarcoStorage={save:async()=>{},getFolderHandle:async()=>null,ensurePermission:async()=>false};
  context.GoogleDriveMarco={
    isConfigured:()=>true,
    readIntegrationJson:async name=>name==='marco-iris.bridge.json'?(remote&&JSON.parse(JSON.stringify(remote))):null,
    writeIntegrationJson:async(name,obj)=>{if(name!=='marco-iris.bridge.json')return;if(delayNext){delayNext=false;await sleep(90);}writes++;remote=JSON.parse(JSON.stringify(obj));}
  };
  vm.createContext(context);vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../js/services/borion-interop-source.js'),'utf8'),context);
  const api=context.MarcoBorionInterop;
  const state={activeProfileId:'p1',profiles:[{id:'p1'}],dataByProfile:{p1:{clients:[],serviceOrders:[],payments:[{id:'REC-1',code:'REC-1',type:'Receita',value:10,paymentDate:'2026-07-21',status:'Pago',paymentMethod:'Pix'}]}}};
  api.start(()=>state);api.setReady(state);await sleep(100);
  assert(remote&&remote.recordCount===1,'publicação inicial deve criar o bridge');
  state.dataByProfile.p1.payments.push({id:'REC-2',code:'REC-2',type:'Receita',value:20,paymentDate:'2026-07-21',status:'Pago',paymentMethod:'Pix'});
  delayNext=true;const p1=api.publish(state);
  await sleep(15);
  state.dataByProfile.p1.payments.push({id:'REC-3',code:'REC-3',type:'Receita',value:30,paymentDate:'2026-07-21',status:'Pago',paymentMethod:'Pix'});
  const p2=api.publish(state);
  await Promise.all([p1,p2]);
  assert(remote.recordCount===3,'alteração ocorrida durante uma publicação precisa ser republicada na mesma fila');
  const status=api.getRuntimeStatus();
  assert(status.publishCompleted===status.publishRequested,'fila deve terminar sem alteração pendente escondida');
  assert(writes>=3,'deve haver publicação inicial, publicação intermediária e publicação final atualizada');
  console.log('OK: uma alteração feita enquanto o bridge está sendo gravado não se perde; a fila republica o estado mais novo.');
})().catch(e=>{console.error(e);process.exit(1)});
