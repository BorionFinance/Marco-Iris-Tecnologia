'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const assert=(condition,message)=>{if(!condition)throw new Error('FALHOU: '+message)};
(async()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../js/services/google-drive.js'),'utf8');
  const store=new Map(),writes=[];
  const context={console,crypto:global.crypto,TextEncoder,Blob,setTimeout,clearTimeout};
  context.window=context;context.globalThis=context;
  context.localStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
  context.MarcoStorage={async save(state,options){writes.push({state:JSON.parse(JSON.stringify(state)),options});return state;}};
  vm.createContext(context);vm.runInContext(source,context,{filename:'google-drive.js'});
  const apply=context.GoogleDriveMarco.__test.applyConfirmedState;

  const unchanged={appId:'marco-iris-tecnologia',updatedAt:'2026-07-21T10:00:00.000Z',driveSync:{revision:1},dataByProfile:{p:{payments:[{id:'REC-000001'}]}}};
  const confirmed={appId:'marco-iris-tecnologia',updatedAt:'2026-07-21T10:00:02.000Z',driveSync:{revision:2,checksum:'ok'},dataByProfile:{p:{payments:[{id:'REC-000001'}]}},interconnections:{borion:{companyInstanceId:'company-1',instanceId:'company-1'}}};
  await apply(unchanged,confirmed,'2026-07-21T10:00:00.000Z');
  assert(unchanged.driveSync.revision===2,'revisão confirmada pelo Drive deve voltar ao estado aberto');
  assert(unchanged.updatedAt===confirmed.updatedAt,'estado sem nova edição deve assumir exatamente a confirmação oficial');

  const edited={appId:'marco-iris-tecnologia',updatedAt:'2026-07-21T10:00:03.000Z',driveSync:{revision:2},dataByProfile:{p:{payments:[{id:'REC-000001'},{id:'REC-000002'}]}},localEdit:'não apagar'};
  const confirmedOlderView={appId:'marco-iris-tecnologia',updatedAt:'2026-07-21T10:00:02.500Z',driveSync:{revision:3,checksum:'ok3'},dataByProfile:{p:{payments:[{id:'REC-000001'}]}},interconnections:{borion:{companyInstanceId:'company-1',instanceId:'company-1'}}};
  await apply(edited,confirmedOlderView,'2026-07-21T10:00:02.000Z');
  assert(edited.driveSync.revision===3,'edição concorrente também deve receber a revisão oficial mais nova');
  assert(edited.dataByProfile.p.payments.length===2&&edited.localEdit==='não apagar','resposta atrasada do Drive não pode apagar edição feita durante o salvamento');
  assert(edited.updatedAt==='2026-07-21T10:00:03.000Z','timestamp da edição mais nova deve ser preservado');
  assert(writes.length===2&&writes.every(item=>item.options?.touch===false),'confirmação deve ser persistida localmente sem fabricar nova alteração');
  console.log('OK: revisão oficial volta ao estado local e resposta atrasada do Drive não apaga edição mais nova.');
})().catch(error=>{console.error(error);process.exit(1)});
