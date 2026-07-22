/* Borion Finance — Núcleo de sincronização segura (V6.40.2 — Dados e Segurança)

   Lógica pura e testável: identidade determinística para dados legados,
   tombstones, merge de três vias e checksums. O Google Drive não oferece uma
   precondição transacional útil para files.update; por isso current.json é
   apenas snapshot consolidado e o journal imutável é a camada de durabilidade. */

const BORION_DATA_SCHEMA_VERSION = 6401;
const BORION_MIGRATION_ID_VERSION = 'legacy-id-v6401';
const BORION_DANGEROUS_KEYS = new Set(['__proto__','constructor','prototype']);

/* Inventário explícito das coleções de entidades. Toda coleção aqui recebe ID,
   tombstone e merge por identidade. */
const BORION_SYNCABLE_COLLECTIONS = [
  'transacoes','fixas','fixaPagamentos','estornos','liquidez','bens','contas',
  'cartoes','boletos','transferencias','agenda','metas','notificacoes',
  'assinaturas','assinaturaCobrancas','importBatches','accountMigrationReview',
  ['investimentos','emCaixa'], ['investimentos','ativos'],
  ['reservas','boxes'], ['reservas','moves'], ['reservas','monthlyReports'],
  ['cheques','items']
];

function bcorePathGet(obj, path){
  const parts = Array.isArray(path) ? path : [path];
  let cur = obj;
  for(const p of parts){ if(cur==null) return undefined; cur = cur[p]; }
  return cur;
}
function bcorePathSet(obj, path, value){
  const parts = Array.isArray(path) ? path : [path];
  let cur = obj;
  for(let i=0;i<parts.length-1;i++){
    const k=parts[i];
    if(!cur[k] || typeof cur[k]!=='object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  cur[parts[parts.length-1]] = value;
}
function bcorePathKey(path){ return Array.isArray(path) ? path.join('.') : path; }
function safeClone(value){ return value==null ? value : JSON.parse(JSON.stringify(value)); }
function ownKeysSafe(obj){ return Object.keys(obj||{}).filter(k=>!BORION_DANGEROUS_KEYS.has(k)); }
function sameValue(a,b){ return canonicalStringify(a)===canonicalStringify(b); }

function canonicalize(value){
  if(Array.isArray(value)) return value.map(canonicalize);
  if(value && typeof value==='object'){
    const out = {};
    ownKeysSafe(value).sort().forEach(k=>{ out[k] = canonicalize(value[k]); });
    return out;
  }
  return value;
}
function canonicalStringify(value){ return JSON.stringify(canonicalize(value)); }

async function sha256Hex640(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function checksumOf(value){ return await sha256Hex640(canonicalStringify(value)); }

/* SHA-256 síncrono usado somente para IDs legados durante migrateData(), que é
   historicamente síncrona. Não é usado para autenticação. */
function sha256Sync640(input){
  const bytes = typeof TextEncoder!=='undefined'
    ? Array.from(new TextEncoder().encode(String(input)))
    : Array.from(unescape(encodeURIComponent(String(input)))).map(c=>c.charCodeAt(0));
  const K=[
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
  ];
  const H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bitLen=bytes.length*8;
  bytes.push(0x80);
  while((bytes.length%64)!==56) bytes.push(0);
  const hi=Math.floor(bitLen/0x100000000), lo=bitLen>>>0;
  bytes.push((hi>>>24)&255,(hi>>>16)&255,(hi>>>8)&255,hi&255,(lo>>>24)&255,(lo>>>16)&255,(lo>>>8)&255,lo&255);
  const rotr=(x,n)=>(x>>>n)|(x<<(32-n));
  for(let off=0;off<bytes.length;off+=64){
    const w=new Array(64);
    for(let i=0;i<16;i++) w[i]=((bytes[off+i*4]<<24)|(bytes[off+i*4+1]<<16)|(bytes[off+i*4+2]<<8)|bytes[off+i*4+3])>>>0;
    for(let i=16;i<64;i++){
      const s0=(rotr(w[i-15],7)^rotr(w[i-15],18)^(w[i-15]>>>3))>>>0;
      const s1=(rotr(w[i-2],17)^rotr(w[i-2],19)^(w[i-2]>>>10))>>>0;
      w[i]=(w[i-16]+s0+w[i-7]+s1)>>>0;
    }
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const S1=(rotr(e,6)^rotr(e,11)^rotr(e,25))>>>0;
      const ch=((e&f)^((~e)&g))>>>0;
      const t1=(h+S1+ch+K[i]+w[i])>>>0;
      const S0=(rotr(a,2)^rotr(a,13)^rotr(a,22))>>>0;
      const maj=((a&b)^(a&c)^(b&c))>>>0;
      const t2=(S0+maj)>>>0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    H[0]=(H[0]+a)>>>0;H[1]=(H[1]+b)>>>0;H[2]=(H[2]+c)>>>0;H[3]=(H[3]+d)>>>0;
    H[4]=(H[4]+e)>>>0;H[5]=(H[5]+f)>>>0;H[6]=(H[6]+g)>>>0;H[7]=(H[7]+h)>>>0;
  }
  return H.map(x=>x.toString(16).padStart(8,'0')).join('');
}

function uuid640(){
  if(typeof crypto!=='undefined' && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if(typeof crypto!=='undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for(let i=0;i<16;i++) bytes[i]=Math.floor(Math.random()*256);
  bytes[6]=(bytes[6]&0x0f)|0x40; bytes[8]=(bytes[8]&0x3f)|0x80;
  const h=Array.from(bytes).map(b=>b.toString(16).padStart(2,'0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10,16).join('')}`;
}

function emptySyncMeta(){
  return {schemaVersion:BORION_DATA_SCHEMA_VERSION,revision:0,tombstones:{},conflicts:[],migrationVersion:BORION_MIGRATION_ID_VERSION};
}
function ensureSyncMeta(data){
  if(!data.__syncMeta || typeof data.__syncMeta!=='object' || Array.isArray(data.__syncMeta)) data.__syncMeta=emptySyncMeta();
  if(!data.__syncMeta.tombstones || typeof data.__syncMeta.tombstones!=='object') data.__syncMeta.tombstones={};
  if(!Array.isArray(data.__syncMeta.conflicts)) data.__syncMeta.conflicts=[];
  if(typeof data.__syncMeta.revision!=='number') data.__syncMeta.revision=0;
  data.__syncMeta.schemaVersion=BORION_DATA_SCHEMA_VERSION;
  data.__syncMeta.migrationVersion=BORION_MIGRATION_ID_VERSION;
  return data.__syncMeta;
}

/* V6.44.2 — importação manual autoritativa.
   Quando a pessoa escolhe "Substituir" em um JSON, o conteúdo importado vira um
   novo marco (epoch) do perfil. Esse marco impede que um snapshot antigo, uma aba
   esquecida ou uma operação do journal anterior à importação ressuscite registros
   que não existem no backup escolhido. Depois que os dois lados já conhecem o
   mesmo marco, o merge normal volta a funcionar para as novas edições. */
function normalizeAuthoritativeImportMarker(marker){
  if(!marker||typeof marker!=='object'||Array.isArray(marker)) return null;
  const generation=Math.max(0,Number(marker.generation)||0);
  const token=String(marker.token||'').trim();
  if(!generation||!token) return null;
  return {
    generation,
    token,
    importedAt:String(marker.importedAt||''),
    source:String(marker.source||'manual_json'),
    profileId:marker.profileId==null?null:String(marker.profileId),
    sourceProfileId:marker.sourceProfileId==null?null:String(marker.sourceProfileId)
  };
}
function getAuthoritativeImportMarker(data){
  return normalizeAuthoritativeImportMarker(data&&data.__syncMeta&&data.__syncMeta.authoritativeImport);
}
function compareAuthoritativeImportMarkers(a,b){
  const left=normalizeAuthoritativeImportMarker(a),right=normalizeAuthoritativeImportMarker(b);
  if(!left&&!right) return 0;
  if(!left) return -1;
  if(!right) return 1;
  if(left.generation!==right.generation) return left.generation-right.generation;
  if(left.importedAt!==right.importedAt) return left.importedAt>right.importedAt?1:-1;
  if(left.token!==right.token) return left.token>right.token?1:-1;
  return 0;
}
function sameAuthoritativeImportMarker(a,b){
  const left=normalizeAuthoritativeImportMarker(a),right=normalizeAuthoritativeImportMarker(b);
  if(!left||!right) return !left&&!right;
  return left.generation===right.generation&&left.token===right.token;
}
function markAuthoritativeImport(data,options={}){
  const out=safeClone(data)||{};
  const previous=[];
  if(Array.isArray(options.previousData)) previous.push(...options.previousData);
  else if(options.previousData) previous.push(options.previousData);
  previous.push(out);
  let maxGeneration=0;
  previous.forEach(item=>{
    const marker=getAuthoritativeImportMarker(item);
    if(marker) maxGeneration=Math.max(maxGeneration,marker.generation);
  });
  const meta=ensureSyncMeta(out);
  meta.authoritativeImport={
    generation:maxGeneration+1,
    token:options.token||uuid640(),
    importedAt:options.importedAt||new Date().toISOString(),
    source:options.source||'manual_json',
    profileId:options.profileId==null?(meta.profileId||null):String(options.profileId),
    sourceProfileId:options.sourceProfileId==null?null:String(options.sourceProfileId)
  };
  meta.revision=Math.max(0,Number(meta.revision)||0)+1;
  return out;
}
function authoritativeProfileWinner(base,local,remote){
  const markers={
    base:getAuthoritativeImportMarker(base),
    local:getAuthoritativeImportMarker(local),
    remote:getAuthoritativeImportMarker(remote)
  };
  const available=Object.values(markers).filter(Boolean);
  if(!available.length) return null;
  let top=available[0];
  for(let i=1;i<available.length;i++) if(compareAuthoritativeImportMarkers(available[i],top)>0) top=available[i];
  const baseTop=sameAuthoritativeImportMarker(markers.base,top);
  const localTop=sameAuthoritativeImportMarker(markers.local,top);
  const remoteTop=sameAuthoritativeImportMarker(markers.remote,top);
  // Os dois lados já estão no mesmo epoch: merge normal de edições posteriores.
  if(localTop&&remoteTop) return null;
  if(localTop) return {side:'local',data:local,marker:top,markers};
  if(remoteTop) return {side:'remote',data:remote,marker:top,markers};
  if(baseTop) return {side:'base',data:base,marker:top,markers};
  return null;
}
function recordTombstone(data,path,id,deviceId,operationId,reason){
  if(!data || !id) return null;
  const meta=ensureSyncMeta(data), key=bcorePathKey(path);
  if(!meta.tombstones[key] || typeof meta.tombstones[key]!=='object') meta.tombstones[key]={};
  const opts=(reason&&typeof reason==='object')?reason:{reason:reason};
  const tomb={
    entityId:String(id), collection:key, deletedAt:opts.deletedAt||new Date().toISOString(),
    deviceId:deviceId||null, deletedByDeviceId:deviceId||null,
    operationId:operationId||null, deletionOperationId:operationId||null,
    reason:opts.reason||'user_delete'
  };
  if(Object.prototype.hasOwnProperty.call(opts,'value')) tomb.value=safeClone(opts.value);
  meta.tombstones[key][String(id)]=tomb;
  return tomb;
}

function stableRecordForIdentity(record){
  const out={};
  ownKeysSafe(record).sort().forEach(k=>{
    if(['id','createdAt','updatedAt','revision','legacyMigrationVersion'].includes(k)) return;
    out[k]=record[k];
  });
  return out;
}
function deterministicLegacyId(profileId,collectionKey,record,occurrence,collisionSalt){
  const seed=[BORION_MIGRATION_ID_VERSION,profileId||'unknown-profile',collectionKey,canonicalStringify(stableRecordForIdentity(record)),String(occurrence||0),String(collisionSalt||0)].join('|');
  return 'legacy_'+sha256Sync640(seed).slice(0,40);
}
function migrateRecordIdentity(record,seedIndex,context={}){
  if(!record || typeof record!=='object') return record;
  if(!record.id){
    record.id=deterministicLegacyId(context.profileId,context.collectionKey||'unknown',record,context.occurrence==null?seedIndex:context.occurrence,context.collisionSalt||0);
    record.legacyMigrationVersion=BORION_MIGRATION_ID_VERSION;
  }
  if(!record.createdAt) record.createdAt=record.data||record.dataCriacao||record.date||record.created_at||'1970-01-01T00:00:00.000Z';
  if(!record.updatedAt) record.updatedAt=record.createdAt;
  if(typeof record.revision!=='number') record.revision=1;
  return record;
}
function migrateDataToSchema640(data,deviceId,profileId){
  if(!data) return data;
  BORION_SYNCABLE_COLLECTIONS.forEach(path=>{
    const arr=bcorePathGet(data,path); if(!Array.isArray(arr)) return;
    const key=bcorePathKey(path), occurrences=new Map(), used=new Set(arr.filter(r=>r&&r.id).map(r=>String(r.id)));
    arr.forEach((rec,i)=>{
      if(!rec || typeof rec!=='object') return;
      if(!rec.id){
        const fp=canonicalStringify(stableRecordForIdentity(rec));
        const occ=occurrences.get(fp)||0; occurrences.set(fp,occ+1);
        let salt=0, id;
        do{id=deterministicLegacyId(profileId,key,rec,occ,salt++);}while(used.has(id));
        rec.id=id; rec.legacyMigrationVersion=BORION_MIGRATION_ID_VERSION;
      }
      used.add(String(rec.id));
      migrateRecordIdentity(rec,i,{profileId,collectionKey:key});
    });
  });
  const meta=ensureSyncMeta(data);
  meta.profileId=profileId||meta.profileId||null;
  if(deviceId && !meta.migratedByDeviceId) meta.migratedByDeviceId=deviceId;
  if(!meta.migratedAt) meta.migratedAt='2026-07-20T00:00:00.000Z';
  return data;
}

function chooseEarlierTombstone(a,b){
  if(!a) return b; if(!b) return a;
  return String(a.deletedAt||'')<=String(b.deletedAt||'')?a:b;
}
function mergeCollection(collectionKey,baseArr,localArr,remoteArr,baseTombstones,localTombstones,remoteTombstones){
  const byId=new Map(), baseById=new Map((baseArr||[]).filter(r=>r&&r.id).map(r=>[String(r.id),r]));
  const localById=new Map((localArr||[]).filter(r=>r&&r.id).map(r=>[String(r.id),r]));
  const remoteById=new Map((remoteArr||[]).filter(r=>r&&r.id).map(r=>[String(r.id),r]));
  const baseTomb=baseTombstones||{}, localTomb=localTombstones||{}, remoteTomb=remoteTombstones||{};
  const allIds=new Set([...baseById.keys(),...localById.keys(),...remoteById.keys(),...ownKeysSafe(baseTomb),...ownKeysSafe(localTomb),...ownKeysSafe(remoteTomb)]);
  const mergedTombstones=Object.assign({},safeClone(baseTomb)||{}), conflicts=[];
  for(const id of allIds){
    const b=baseById.get(id), l=localById.get(id), r=remoteById.get(id);
    const tl=localTomb[id], tr=remoteTomb[id], tb=baseTomb[id];
    const tomb=chooseEarlierTombstone(chooseEarlierTombstone(tb,tl),tr);
    if(tomb){
      const surviving=l||r;
      // Relógio nunca decide edição x exclusão. Se o registro existia na base e
      // o lado sobrevivente realmente mudou seu conteúdo, preserve-o como
      // conflito para revisão. Registro inalterado ou reaparecido depois de um
      // tombstone já consolidado continua excluído, impedindo ressurreição por
      // dispositivo antigo.
      const survivorChanged=!!(surviving&&b&&!sameValue(surviving,b));
      if(survivorChanged&&(tl||tr)){
        conflicts.push({collection:collectionKey,id,kind:'edit_vs_delete',base:b||null,local:tl?null:l||null,remote:tr?null:r||null,tombstone:tomb});
        byId.set(id,safeClone(surviving));
        delete mergedTombstones[id];
      }else mergedTombstones[id]=tomb;
      continue;
    }
    if(l&&!r){ byId.set(id,l); continue; }
    if(r&&!l){ byId.set(id,r); continue; }
    if(!l&&!r) continue;
    if(!b){
      if(!sameValue(l,r)) conflicts.push({collection:collectionKey,id,kind:'id_collision',base:null,local:l,remote:r});
      byId.set(id,l); continue;
    }
    const merged=safeClone(b)||{};
    const fields=new Set([...ownKeysSafe(b),...ownKeysSafe(l),...ownKeysSafe(r)]);
    for(const f of fields){
      if(f==='id'){merged.id=id;continue;}
      if(f==='updatedAt'||f==='revision') continue;
      const bv=b[f],lv=l[f],rv=r[f],lc=!sameValue(lv,bv),rc=!sameValue(rv,bv);
      if(lc&&rc&&!sameValue(lv,rv)){
        merged[f]=safeClone(lv);
        conflicts.push({collection:collectionKey,id,field:f,kind:'field_conflict',base:bv,local:lv,remote:rv});
      }else if(lc) merged[f]=safeClone(lv);
      else if(rc) merged[f]=safeClone(rv);
      else merged[f]=safeClone(bv);
    }
    merged.updatedAt=[l.updatedAt,r.updatedAt,b.updatedAt].filter(Boolean).sort().slice(-1)[0]||merged.updatedAt;
    merged.revision=Math.max(Number(l.revision)||1,Number(r.revision)||1,Number(b.revision)||1);
    byId.set(id,merged);
  }
  ownKeysSafe(mergedTombstones).forEach(id=>byId.delete(id));
  return {merged:Array.from(byId.values()),tombstones:mergedTombstones,conflicts};
}

function mergePrimitiveArray(base,local,remote,path,conflicts){
  const lc=!sameValue(local,base), rc=!sameValue(remote,base);
  if(!lc&&!rc) return safeClone(base||[]);
  if(lc&&!rc) return safeClone(local||[]);
  if(!lc&&rc) return safeClone(remote||[]);
  if(sameValue(local,remote)) return safeClone(local||[]);
  const result=[],seen=new Set();
  for(const item of [...(local||[]),...(remote||[])]){
    const key=canonicalStringify(item); if(seen.has(key)) continue; seen.add(key); result.push(safeClone(item));
  }
  conflicts.push({kind:'array_conflict',path,base:safeClone(base||[]),local:safeClone(local||[]),remote:safeClone(remote||[]),resolved:'stable_union_local_then_remote'});
  return result;
}
function deepThreeWayMerge(base,local,remote,path='',conflicts=[]){
  if(sameValue(local,remote)) return safeClone(local);
  if(sameValue(local,base)) return safeClone(remote);
  if(sameValue(remote,base)) return safeClone(local);
  const arrays=[base,local,remote].some(Array.isArray);
  if(arrays){
    if(Array.isArray(local)&&Array.isArray(remote)) return mergePrimitiveArray(Array.isArray(base)?base:[],local,remote,path,conflicts);
    conflicts.push({kind:'type_conflict',path,base:safeClone(base),local:safeClone(local),remote:safeClone(remote)}); return safeClone(local);
  }
  const objects=[base,local,remote].every(v=>v==null||(typeof v==='object'&&!Array.isArray(v)));
  if(objects && ((local&&typeof local==='object')||(remote&&typeof remote==='object')||(base&&typeof base==='object'))){
    const out={};
    const keys=new Set([...ownKeysSafe(base),...ownKeysSafe(local),...ownKeysSafe(remote)]);
    for(const k of keys) out[k]=deepThreeWayMerge(base&&base[k],local&&local[k],remote&&remote[k],path?path+'.'+k:k,conflicts);
    return out;
  }
  conflicts.push({kind:'field_conflict',path,base:safeClone(base),local:safeClone(local),remote:safeClone(remote)});
  return safeClone(local);
}


function mergePrimitiveCollection(collectionKey,baseArr,localArr,remoteArr,baseTombstones,localTombstones,remoteTombstones,conflicts){
  const tombs=Object.assign({},baseTombstones||{},localTombstones||{},remoteTombstones||{});
  const merged=mergePrimitiveArray(baseArr||[],localArr||[],remoteArr||[],collectionKey,conflicts);
  const deletedValues=new Set();
  ownKeysSafe(tombs).forEach(id=>{
    const t=tombs[id];
    if(t&&Object.prototype.hasOwnProperty.call(t,'value')) deletedValues.add(canonicalStringify(t.value));
  });
  return {merged:merged.filter(v=>!deletedValues.has(canonicalStringify(v))),tombstones:tombs};
}

function mergeProfileData(baseData,localData,remoteData){
  const base=baseData||{},local=localData||{},remote=remoteData||{},genericConflicts=[];
  const authoritative=authoritativeProfileWinner(base,local,remote);
  if(authoritative){
    const chosen=safeClone(authoritative.data)||{};
    const meta=ensureSyncMeta(chosen);
    const competing=Object.entries(authoritative.markers)
      .filter(([,marker])=>marker&&!sameAuthoritativeImportMarker(marker,authoritative.marker))
      .map(([side,marker])=>({side,marker:safeClone(marker)}));
    if(competing.length){
      const prior=Array.isArray(meta.conflicts)?meta.conflicts:[];
      meta.conflicts=prior.concat([{
        kind:'authoritative_import_barrier',
        resolved:authoritative.side,
        winningMarker:safeClone(authoritative.marker),
        ignoredMarkers:competing
      }]);
    }
    meta.revision=Math.max(
      Number((base.__syncMeta||{}).revision)||0,
      Number((local.__syncMeta||{}).revision)||0,
      Number((remote.__syncMeta||{}).revision)||0,
      Number(meta.revision)||0
    )+1;
    return chosen;
  }
  const result=deepThreeWayMerge(base,local,remote,'',genericConflicts)||{};
  // Coleções com identidade e categorias são mescladas logo abaixo por regras
  // próprias. Descartar apenas os conflitos genéricos dessas mesmas rotas evita
  // registrar falsos conflitos de array (por exemplo, dois campos diferentes do
  // mesmo lançamento) antes do merge por ID ter a chance de resolvê-los.
  const managedPrefixes=[
    ...BORION_SYNCABLE_COLLECTIONS.map(bcorePathKey),
    'categorias.receita','categorias.fixa','categorias.variavel','__syncMeta'
  ];
  const conflicts=genericConflicts.filter(c=>{
    const path=String(c&&c.path||'');
    return !managedPrefixes.some(prefix=>path===prefix||path.startsWith(prefix+'.'));
  });
  const bm=ensureSyncMeta(safeClone(base)||{}),lm=ensureSyncMeta(safeClone(local)||{}),rm=ensureSyncMeta(safeClone(remote)||{});
  const mergedTombstones={};
  BORION_SYNCABLE_COLLECTIONS.forEach(path=>{
    const key=bcorePathKey(path);
    const out=mergeCollection(key,bcorePathGet(base,path)||[],bcorePathGet(local,path)||[],bcorePathGet(remote,path)||[],bm.tombstones[key],lm.tombstones[key],rm.tombstones[key]);
    bcorePathSet(result,path,out.merged); mergedTombstones[key]=out.tombstones; conflicts.push(...out.conflicts);
  });
  ['receita','fixa','variavel'].forEach(type=>{
    const path=['categorias',type],key=bcorePathKey(path);
    const out=mergePrimitiveCollection(key,bcorePathGet(base,path)||[],bcorePathGet(local,path)||[],bcorePathGet(remote,path)||[],bm.tombstones[key],lm.tombstones[key],rm.tombstones[key],conflicts);
    bcorePathSet(result,path,out.merged); mergedTombstones[key]=out.tombstones;
  });
  const meta=ensureSyncMeta(result);
  meta.tombstones=mergedTombstones;
  meta.revision=Math.max(bm.revision||0,lm.revision||0,rm.revision||0)+1;
  meta.conflicts=conflicts;
  return result;
}

function normalizeAccountMeta(payload){
  const meta=(payload&&payload.__syncMeta640&&typeof payload.__syncMeta640==='object')?safeClone(payload.__syncMeta640):{};
  if(!meta.profileTombstones||typeof meta.profileTombstones!=='object') meta.profileTombstones={};
  if(!Array.isArray(meta.accountConflicts)) meta.accountConflicts=[];
  return meta;
}
function mergeProfileTombstones6402(...sets){
  const out={};
  for(const set of sets){
    if(!set||typeof set!=='object') continue;
    for(const id of ownKeysSafe(set)){
      const candidate=set[id]; if(!candidate||typeof candidate!=='object') continue;
      const current=out[id];
      const candidateKey=String(candidate.deletedAt||'')+'|'+String(candidate.operationId||'');
      const currentKey=current?(String(current.deletedAt||'')+'|'+String(current.operationId||'')):'';
      if(!current||candidateKey>currentKey) out[id]=safeClone(candidate);
    }
  }
  return out;
}
function mergeProfileMetadata(base,local,remote,id,conflicts){
  const localConf=[];
  const out=deepThreeWayMerge(base||{},local||{},remote||{},'profiles.'+id,localConf)||{};
  out.id=id; conflicts.push(...localConf); return out;
}
function mergeAccountPayload(basePayload,localPayload,remotePayload){
  const base=basePayload||{profiles:[],dataByProfile:{}},local=localPayload||{profiles:[],dataByProfile:{}},remote=remotePayload||{profiles:[],dataByProfile:{}};
  const accountConflicts=[];
  const root=deepThreeWayMerge(base,local,remote,'account',accountConflicts)||{};
  const bp=new Map((base.profiles||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));
  const lp=new Map((local.profiles||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));
  const rp=new Map((remote.profiles||[]).filter(p=>p&&p.id).map(p=>[String(p.id),p]));
  const bm=normalizeAccountMeta(base),lm=normalizeAccountMeta(local),rm=normalizeAccountMeta(remote);
  const profileTombstones=mergeProfileTombstones6402(bm.profileTombstones,lm.profileTombstones,rm.profileTombstones);
  const ids=new Set([...bp.keys(),...lp.keys(),...rp.keys(),...Object.keys(base.dataByProfile||{}),...Object.keys(local.dataByProfile||{}),...Object.keys(remote.dataByProfile||{}),...ownKeysSafe(profileTombstones)]);
  const profiles=[],dataByProfile={};
  for(const id of ids){
    if(BORION_DANGEROUS_KEYS.has(id)) continue;
    const b=bp.get(id),l=lp.get(id),r=rp.get(id),t=profileTombstones[id];
    if(t){
      const survivor=l||r, changed=survivor&&b&&!sameValue(survivor,b);
      if(changed){
        // A edição não é descartada: fica inteira no conflito para recuperação.
        // Porém o perfil permanece excluído. Um dispositivo antigo nunca pode
        // reativá-lo apenas por enviar uma cópia local depois do tombstone.
        accountConflicts.push({kind:'profile_edit_vs_delete',profileId:id,base:b||null,local:l||null,remote:r||null,tombstone:t,preservedEdit:safeClone(survivor)});
      }
      continue;
    }
    const p=mergeProfileMetadata(b,l,r,id,accountConflicts); profiles.push(p);
    const bd=(base.dataByProfile||{})[id],ld=(local.dataByProfile||{})[id],rd=(remote.dataByProfile||{})[id];
    if(ld&&rd) dataByProfile[id]=mergeProfileData(bd,ld,rd);
    else if(ld) dataByProfile[id]=safeClone(ld);
    else if(rd) dataByProfile[id]=safeClone(rd);
    else if(bd) dataByProfile[id]=safeClone(bd);
  }
  root.profiles=profiles;
  root.dataByProfile=dataByProfile;
  root.profileCount=profiles.length;
  root.config=deepThreeWayMerge(base.config||{},local.config||{},remote.config||{},'config',accountConflicts)||{};
  root.__syncMeta640=Object.assign({},normalizeAccountMeta(root),{
    schemaVersion:BORION_DATA_SCHEMA_VERSION,
    profileTombstones,
    accountConflicts
  });
  return root;
}

function deltaValue(obj,key){return Object.prototype.hasOwnProperty.call(obj||{},key)?{present:true,value:safeClone(obj[key])}:{present:false};}
function isPlainObject640(value){return !!value&&typeof value==='object'&&!Array.isArray(value);}
function safeDeltaPath640(path){return Array.isArray(path)&&path.every(k=>typeof k==='string'&&k&&!BORION_DANGEROUS_KEYS.has(k));}
function deleteAtPath640(target,path){
  if(!safeDeltaPath640(path)||!path.length) return;
  let cur=target;
  for(let i=0;i<path.length-1;i++){
    if(!cur||typeof cur!=='object') return;
    cur=cur[path[i]];
  }
  if(cur&&typeof cur==='object') delete cur[path[path.length-1]];
}
function setPackedAtPath640(target,path,packed){
  if(!safeDeltaPath640(path)||!path.length) return;
  if(packed&&packed.present) bcorePathSet(target,path,safeClone(packed.value));
  else deleteAtPath640(target,path);
}
function entityArrayCompatible640(base,local){
  if(!Array.isArray(base)||!Array.isArray(local)) return false;
  const all=[...base,...local];
  return all.length>0&&all.every(item=>isPlainObject640(item)&&item.id!=null&&String(item.id).trim()&&!BORION_DANGEROUS_KEYS.has(String(item.id)));
}
function mapByStableId640(rows){
  const out=new Map();
  for(const row of rows||[]) if(row&&row.id!=null) out.set(String(row.id),row);
  return out;
}
function collectCompactDelta640(base,local,path,changes,volatileRoot){
  if(sameValue(base,local)) return;
  if(Array.isArray(base)&&Array.isArray(local)&&entityArrayCompatible640(base,local)){
    const bm=mapByStableId640(base),lm=mapByStableId640(local),ids=new Set([...bm.keys(),...lm.keys()]);
    for(const id of ids){
      const b=bm.has(id)?{present:true,value:safeClone(bm.get(id))}:{present:false};
      const l=lm.has(id)?{present:true,value:safeClone(lm.get(id))}:{present:false};
      if(!sameValue(b,l)) changes.push({kind:'entity',path:safeClone(path),id,base:b,local:l});
    }
    return;
  }
  if(isPlainObject640(base)&&isPlainObject640(local)){
    const keys=new Set([...ownKeysSafe(base),...ownKeysSafe(local)]);
    for(const key of keys){
      if(path.length===0&&volatileRoot.has(key)) continue;
      const bp=Object.prototype.hasOwnProperty.call(base,key),lp=Object.prototype.hasOwnProperty.call(local,key);
      if(bp&&lp) collectCompactDelta640(base[key],local[key],path.concat(key),changes,volatileRoot);
      else{
        const b=bp?{present:true,value:safeClone(base[key])}:{present:false};
        const l=lp?{present:true,value:safeClone(local[key])}:{present:false};
        if(!sameValue(b,l)) changes.push({kind:'value',path:path.concat(key),base:b,local:l});
      }
    }
    return;
  }
  changes.push({kind:'value',path:safeClone(path),base:{present:true,value:safeClone(base)},local:{present:true,value:safeClone(local)}});
}
function applyEntityPacked640(target,path,id,packed){
  if(!safeDeltaPath640(path)||!path.length||BORION_DANGEROUS_KEYS.has(String(id))) return;
  let list=bcorePathGet(target,path);
  if(!Array.isArray(list)){list=[];bcorePathSet(target,path,list);}
  const index=list.findIndex(item=>item&&String(item.id)===String(id));
  if(packed&&packed.present){
    const value=safeClone(packed.value);
    if(index>=0) list[index]=value; else list.push(value);
  }else if(index>=0) list.splice(index,1);
}
function createAccountDelta(basePayload,localPayload){
  const base=basePayload||{profiles:[],dataByProfile:{},config:{}},local=localPayload||{profiles:[],dataByProfile:{},config:{}};
  const volatile=new Set(['integrity','exportedAt','snapshotId','snapshotBaseDate','snapshotChecksum']);
  const changes=[];
  collectCompactDelta640(base,local,[],changes,volatile);
  return {schemaVersion:2,format:'compact-path-delta-v2',changes,createdAt:new Date().toISOString()};
}
function accountDeltaHasChanges(delta){
  if(!delta) return false;
  if(Array.isArray(delta.changes)) return delta.changes.length>0;
  return !!((delta.topLevel&&Object.keys(delta.topLevel).length)||(delta.profiles&&Object.keys(delta.profiles).length));
}
function mergeLegacyAccountDelta640(delta,remotePayload){
  const remote=remotePayload||{profiles:[],dataByProfile:{},config:{}},base=safeClone(remote),local=safeClone(remote);
  for(const [key,change] of Object.entries(delta?.topLevel||{})){
    if(change?.base?.present) base[key]=safeClone(change.base.value); else delete base[key];
    if(change?.local?.present) local[key]=safeClone(change.local.value); else delete local[key];
  }
  base.dataByProfile=base.dataByProfile||{};local.dataByProfile=local.dataByProfile||{};
  for(const [id,change] of Object.entries(delta?.profiles||{})){
    if(BORION_DANGEROUS_KEYS.has(id)) continue;
    if(change?.base?.present) base.dataByProfile[id]=safeClone(change.base.value); else delete base.dataByProfile[id];
    if(change?.local?.present) local.dataByProfile[id]=safeClone(change.local.value); else delete local.dataByProfile[id];
  }
  return mergeAccountPayload(base,local,remote);
}
function mergeAccountDelta(delta,remotePayload){
  if(!delta||!Array.isArray(delta.changes)) return mergeLegacyAccountDelta640(delta,remotePayload);
  const remote=remotePayload||{profiles:[],dataByProfile:{},config:{}},base=safeClone(remote),local=safeClone(remote);
  for(const change of delta.changes){
    if(!change||!safeDeltaPath640(change.path)||!change.path.length) continue;
    if(change.kind==='entity'){
      applyEntityPacked640(base,change.path,change.id,change.base);
      applyEntityPacked640(local,change.path,change.id,change.local);
    }else{
      setPackedAtPath640(base,change.path,change.base);
      setPackedAtPath640(local,change.path,change.local);
    }
  }
  return mergeAccountPayload(base,local,remote);
}

function recordProfileTombstone(payload,profileId,deviceId,operationId,reason){
  if(!payload.__syncMeta640||typeof payload.__syncMeta640!=='object') payload.__syncMeta640={};
  if(!payload.__syncMeta640.profileTombstones) payload.__syncMeta640.profileTombstones={};
  const t={profileId:String(profileId),deletedAt:new Date().toISOString(),deviceId:deviceId||null,operationId:operationId||null,reason:reason||'user_delete'};
  payload.__syncMeta640.profileTombstones[String(profileId)]=t; return t;
}

window.BorionSyncCore={
  BORION_DATA_SCHEMA_VERSION,BORION_MIGRATION_ID_VERSION,BORION_SYNCABLE_COLLECTIONS,
  canonicalize,canonicalStringify,sha256Hex640,sha256Sync640,checksumOf,uuid640,
  emptySyncMeta,ensureSyncMeta,recordTombstone,recordProfileTombstone,
  normalizeAuthoritativeImportMarker,getAuthoritativeImportMarker,compareAuthoritativeImportMarkers,sameAuthoritativeImportMarker,markAuthoritativeImport,
  deterministicLegacyId,migrateRecordIdentity,migrateDataToSchema640,
  mergeCollection,deepThreeWayMerge,mergeProfileData,mergeAccountPayload,createAccountDelta,accountDeltaHasChanges,mergeAccountDelta,
  pathGet:bcorePathGet,pathSet:bcorePathSet,pathKey:bcorePathKey
};
