'use strict';

let STATE=null;
let CURRENT_VIEW='dashboard';
let SEARCH='';
let ACTIVE_TAB={stock:'products',catalog:'services',documents:'consents'};
let SHOW_ARCHIVED={orders:false,clients:false,catalog:false};
const VIEW_MODE_DEFAULTS={orders:'list',agenda:'cards',clients:'list',finance:'list',stock:'list',catalog:'list',documents:'list'};
let AGENDA_CURSOR='';
let AGENDA_SELECTED='';
let NAVIGATION_BUSY=false;
let CLOCK_TIMER=null;
let AUTOSAVE_TIMER=null;
let GOOGLE_TIMER=null;
let CLOUD_RETRY_TIMER=null;
let CLOUD_PENDING_LOCAL=false;
let LAST_CONFIRMED_STATE=null;
let CLOUD_ONLY_COMMITTING=false;
let AUTO_BACKUP_TIMER=null;
let REMOTE_REFRESH_TIMER=null;
let REMOTE_REFRESH_INFLIGHT=null;
let REMOTE_REFRESH_FOCUS_HANDLER=null;
let REMOTE_REFRESH_VISIBILITY_HANDLER=null;
const REMOTE_REFRESH_INTERVAL_MS=8000;
let LAST_AUTO_BACKUP_AT='';
let LOCKED=true;
let LOCK_NETWORK=null;
let BACKGROUND_SAVE_REQUESTED=0;
let BACKGROUND_SAVE_COMPLETED=0;
let BACKGROUND_SAVE_PROMISE=null;
let BACKGROUND_SAVE_OPTIONS={};
let BACKGROUND_SAVE_WAITERS=[];

const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const clone=v=>JSON.parse(JSON.stringify(v));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const attr=esc;
const num=v=>window.MarcoMoney?.parseNumber?window.MarcoMoney.parseNumber(v):(()=>{const raw=String(v??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');if(!raw)return 0;const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;return Number(normalized)||0;})();
const bool=v=>v===true||v==='true'||v==='on'||v==='Sim';
const nowIso=()=>new Date().toISOString();
const today=()=>{const d=new Date();const y=d.getFullYear();const m=String(d.getMonth()+1).padStart(2,'0');const day=String(d.getDate()).padStart(2,'0');return `${y}-${m}-${day}`;};
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const currency=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(num(v));
const formatDate=v=>{if(!v)return '—';const d=new Date(String(v).length===10?`${v}T12:00:00`:v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR').format(d);};
const formatDateTime=v=>{if(!v)return '—';const d=new Date(v);return Number.isNaN(d.getTime())?'—':new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(d);};
const monthKey=v=>String(v||'').slice(0,7);
const activeProfile=()=>STATE.profiles.find(p=>p.id===STATE.activeProfileId)||STATE.profiles[0];
const data=()=>STATE.dataByProfile[activeProfile().id];
const company=()=>activeProfile().company||{};

const ICONS={
  dashboard:'<path d="M3 13h8V3H3v10Zm0 8h8v-6H3v6Zm10 0h8V11h-8v10Zm0-18v6h8V3h-8Z"/>',
  orders:'<path d="M6 2h9l5 5v15H6V2Zm8 1v5h5M9 12h8M9 16h8M9 8h2"/>',
  agenda:'<path d="M5 3v3M19 3v3M3 9h18M5 5h14a2 2 0 0 1 2 2v14H3V7a2 2 0 0 1 2-2Z"/>',
  clients:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  finance:'<path d="M3 6h18v12H3zM7 10h.01M17 14h.01M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/>',
  stock:'<path d="m21 8-9-5-9 5 9 5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
  catalog:'<path d="M4 4h16v16H4zM8 8h8M8 12h8M8 16h5"/>',
  settings:'<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1v.09h-4v-.09a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4h-.09v-4H3a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1v-.09h4V3a1.7 1.7 0 0 0 1.1 1.6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.25.36.46.74.6 1 .14.32.21.66.21 1s-.07.68-.21 1c-.14.26-.35.64-.6 1Z"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',save:'<path d="M4 3h14l3 3v15H3V3h1Zm3 0v6h9V3M7 21v-8h10v8"/>',
  close:'<path d="m6 6 12 12M18 6 6 18"/>',edit:'<path d="m14 4 6 6M4 20l4-1 11-11-4-4L4 15v5Z"/>',
  eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  trash:'<path d="M3 6h18M8 6V3h8v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  cloud:'<path d="M17.5 19H7a5 5 0 1 1 1.5-9.77A6 6 0 0 1 20 12a3.5 3.5 0 0 1-2.5 7Z"/>',
  folder:'<path d="M3 5h7l2 2h9v12H3V5Z"/>',download:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  upload:'<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>',camera:'<path d="M4 7h3l2-3h6l2 3h3v13H4V7Z"/><circle cx="12" cy="13" r="4"/>',
  pdf:'<path d="M6 2h9l5 5v15H6V2Zm8 1v5h5M9 13h6M9 17h4"/>',phone:'<path d="M22 16.9v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L8 9.73a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 22 16.9Z"/>',
  arrow:'<path d="m9 18 6-6-6-6"/>',check:'<path d="m5 12 4 4L19 6"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  filter:'<path d="M4 5h16M7 12h10M10 19h4"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01"/>',
  columns:'<rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/>',
  chevronLeft:'<path d="m15 18-6-6 6-6"/>',chevronRight:'<path d="m9 18 6-6-6-6"/>',
  lock:'<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4"/>',
  documents:'<path d="M6 2h9l5 5v15H6V2Zm8 1v5h5M9 12h7M9 16h7"/><path d="m9 20 2-2 4 4"/>',
  signature:'<path d="M3 17c3-4 5-8 7-8 2 0 0 6 2 6 1 0 2-3 3-3s0 3 2 3c1 0 2-1 4-3M3 21h18"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.15 1.15"/><path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.15-1.15"/>',
  warning:'<path d="M10.3 2.9 1.8 17a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 2.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>'
};
function icon(name,size=20){return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]||ICONS.catalog}</svg>`;}
const NAV=[['dashboard','Visão geral'],['orders','Ordens de serviço'],['agenda','Agenda'],['clients','Clientes'],['finance','Financeiro'],['stock','Estoque'],['catalog','Catálogos'],['documents','Documentos'],['settings','Configurações']];
const VIEW_TITLES={dashboard:'Visão geral',orders:'Ordens de serviço',agenda:'Agenda',clients:'Clientes',finance:'Financeiro',stock:'Estoque',catalog:'Catálogos',documents:'Documentos',settings:'Configurações'};

function normalizeState(){
  STATE=STATE&&STATE.appId==='marco-iris-tecnologia'?STATE:clone(window.MARCO_INITIAL_DATA);
  STATE.schemaVersion=Math.max(2,num(STATE.schemaVersion));
  STATE.profiles=Array.isArray(STATE.profiles)&&STATE.profiles.length?STATE.profiles:clone(window.MARCO_INITIAL_DATA.profiles);
  STATE.activeProfileId=STATE.activeProfileId||STATE.profiles[0].id;STATE.dataByProfile=STATE.dataByProfile||{};
  if(!STATE.dataByProfile[STATE.activeProfileId])STATE.dataByProfile[STATE.activeProfileId]=clone(window.MARCO_INITIAL_DATA.dataByProfile.marco);
  const d=data();['clients','serviceOrders','orderItems','payments','products','services','supplies','stockMovements','appointments','attachments','consents','audit'].forEach(k=>{if(!Array.isArray(d[k]))d[k]=[];});
  d.settings=d.settings||{};Object.assign(d.settings,{autosaveFolder:false,autosaveGoogle:true,cloudOnly:true,interfaceMode:d.settings.interfaceMode||'auto',dashboardPrivacy:!!d.settings.dashboardPrivacy,generatePaymentOnComplete:!!d.settings.generatePaymentOnComplete,preventNegativeStock:d.settings.preventNegativeStock!==false,nextIds:d.settings.nextIds||{}});
  d.settings.viewModesBySection={...VIEW_MODE_DEFAULTS,...(d.settings.viewModesBySection||{})};
  if(!AGENDA_CURSOR)AGENDA_CURSOR=today().slice(0,7);
  if(!AGENDA_SELECTED)AGENDA_SELECTED=today();
  d.clients.forEach(c=>{c.status=c.status||'Ativo';});d.orderItems.forEach(i=>{if(i.type==='Serviço')i.lowerStock=false;});
  d.serviceOrders.forEach(o=>{o.registrationStatus=o.registrationStatus||'Ativo';o.photos=Array.isArray(o.photos)?o.photos:[];o.pdfs=Array.isArray(o.pdfs)?o.pdfs:[];o.attachments=Array.isArray(o.attachments)?o.attachments:[];});
  d.appointments.forEach(a=>{a.status=a.status||'Agendado';a.orderId=a.orderId||'';});
  d.consents.forEach(c=>{c.status=c.status||(c.accepted?'Aceito':'Pendente');c.accepted=!!c.accepted;});
  STATE.updatedAt=STATE.updatedAt||nowIso();
}
function addAudit(action,detail=''){data().audit.unshift({id:`audit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date:nowIso(),action,detail});data().audit=data().audit.slice(0,300);}
function cloudReason(action=''){return String(action||'alteracao').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9_-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)||'alteracao';}
async function publishBridgeConfirmed(){
  if(!window.MarcoBorionInterop?.publish)return {skipped:true};
  const status=window.MarcoBorionInterop.getRuntimeStatus?.();
  if(!status?.ready||!status?.initialSyncComplete)return {skipped:true,blocked:true,message:status?.reason||'Integração ainda não liberada.'};
  const result=await window.MarcoBorionInterop.publish(STATE);
  const confirmed=Array.isArray(result?.destinations)&&result.destinations.some(x=>x==='google-drive'||x==='google-unchanged');
  if(result?.blocked||!confirmed)throw new Error(result?.message||result?.errors?.join(' · ')||'O arquivo marco-iris.bridge.json não foi confirmado no Google Drive.');
  return result;
}
async function flushCloudState(reason='alteracao',{backup=false,retryMedia=true}={}){
  if(!navigator.onLine)throw new Error('Internet obrigatória. A alteração não foi salva.');
  if(!window.GoogleDriveMarco?.isConfigured?.())throw new Error('Google Drive desconectado. Entre novamente antes de alterar dados.');
  if(retryMedia)await syncPendingMedia();
  window.MarcoBorionInterop?.prepareState?.(STATE);
  let baseCommitted=false;
  try{
    await GoogleDriveMarco.enqueueSave(STATE,{backup,reason:cloudReason(reason)});
    baseCommitted=true;
    CLOUD_PENDING_LOCAL=false;
    const bridge=await publishBridgeConfirmed();
    return {saved:true,bridge};
  }catch(error){
    error.baseCommitted=baseCommitted;
    throw error;
  }
}
function scheduleCloudRetry(reason='alteracao'){
  clearTimeout(CLOUD_RETRY_TIMER);
  CLOUD_RETRY_TIMER=setTimeout(async()=>{
    if(!navigator.onLine||!STATE||!GoogleDriveMarco.isConfigured())return;
    try{
      window.MarcoBorionInterop?.prepareState?.(STATE);
      await publishBridgeConfirmed();
      setSaveStatus('Google Drive e integração com Borion confirmados','ok');
    }catch(error){
      console.warn('[BRIDGE_RETRY]',error);
      setSaveStatus('Dados no Drive · integração com Borion pendente','warn');
      scheduleCloudRetry(reason);
    }
  },5000);
}
function mergeBackgroundSaveOptions(current,next){
  return {
    folder:current.folder===true||next.folder!==false,
    google:current.google===true||next.google!==false,
    backup:!!(current.backup||next.backup),
    media:current.media===true||next.media!==false,
    reason:String(next.reason||current.reason||'alteracao')
  };
}
function settleBackgroundSaveWaiters(target,result,error){
  const keep=[];
  for(const waiter of BACKGROUND_SAVE_WAITERS){
    if(waiter.seq<=target){error?waiter.reject(error):waiter.resolve(result);}else keep.push(waiter);
  }
  BACKGROUND_SAVE_WAITERS=keep;
}
async function runBackgroundSaveQueue(){
  if(BACKGROUND_SAVE_PROMISE)return await BACKGROUND_SAVE_PROMISE;
  BACKGROUND_SAVE_PROMISE=(async()=>{
    let lastResult={local:true,folder:false,drive:false,bridge:false,errors:[]};
    while(BACKGROUND_SAVE_COMPLETED<BACKGROUND_SAVE_REQUESTED){
      const target=BACKGROUND_SAVE_REQUESTED;
      const opts=BACKGROUND_SAVE_OPTIONS;
      BACKGROUND_SAVE_OPTIONS={};
      const result={local:true,folder:false,drive:false,bridge:false,errors:[]};
      try{
        if(data().settings.autosaveFolder&&opts.folder!==false){
          try{const h=await MarcoStorage.getFolderHandle();if(h&&await MarcoStorage.ensurePermission(h,false)){await MarcoStorage.saveToFolder(STATE,{handle:h});result.folder=true;}}
          catch(error){console.warn('[BACKGROUND_FOLDER]',error);result.errors.push(`Pasta local: ${error.message}`);}
        }
        if(data().settings.autosaveGoogle&&opts.google!==false&&GoogleDriveMarco.isConfigured()){
          try{
            const cloud=await flushCloudState(opts.reason||'alteracao',{backup:!!opts.backup,retryMedia:opts.media!==false});
            result.drive=!!cloud?.saved;
            result.bridge=!!cloud?.bridge&&!cloud.bridge.skipped;
            clearTimeout(CLOUD_RETRY_TIMER);
          }catch(error){
            console.warn('[BACKGROUND_CLOUD]',error);result.errors.push(`Google Drive/integração: ${error.message}`);scheduleCloudRetry(opts.reason||'alteracao');
          }
        }
        if(result.errors.length)setSaveStatus('Google Drive pendente · nova tentativa em 5 s','warn');
        else if(result.bridge)setSaveStatus('Drive + Borion_Integracoes confirmados','ok');
        else if(result.drive)setSaveStatus('Google Drive confirmado','ok');
        else setSaveStatus('Nenhuma alteração pendente no Google Drive','ok');
        BACKGROUND_SAVE_COMPLETED=target;
        lastResult=result;
        settleBackgroundSaveWaiters(target,result,null);
      }catch(error){
        BACKGROUND_SAVE_COMPLETED=target;
        settleBackgroundSaveWaiters(target,null,error);
        throw error;
      }
    }
    return lastResult;
  })().finally(()=>{
    BACKGROUND_SAVE_PROMISE=null;
    if(BACKGROUND_SAVE_COMPLETED<BACKGROUND_SAVE_REQUESTED)runBackgroundSaveQueue().catch(error=>console.warn('[BACKGROUND_SAVE_QUEUE]',error));
  });
  return await BACKGROUND_SAVE_PROMISE;
}
function queueBackgroundSave(opts={}){
  BACKGROUND_SAVE_OPTIONS=mergeBackgroundSaveOptions(BACKGROUND_SAVE_OPTIONS,{...opts,reason:cloudReason(opts.reason||'alteracao')});
  const seq=++BACKGROUND_SAVE_REQUESTED;
  const promise=new Promise((resolve,reject)=>BACKGROUND_SAVE_WAITERS.push({seq,resolve,reject}));
  queueMicrotask(()=>runBackgroundSaveQueue().catch(error=>console.warn('[BACKGROUND_SAVE]',error)));
  return promise;
}
async function persist(action='',detail='',opts={}){
  const confirmedBefore=LAST_CONFIRMED_STATE?clone(LAST_CONFIRMED_STATE):null;
  const rollback=()=>{
    if(!confirmedBefore)return;
    STATE=clone(confirmedBefore);
    normalizeState();
    if(!LOCKED)renderView('none');
  };
  if(!navigator.onLine){rollback();throw new Error('Sem internet. O Marco Iris funciona somente conectado ao Google Drive e nenhuma alteração foi salva.');}
  if(!GoogleDriveMarco.isConfigured()){rollback();throw new Error('Google Drive desconectado. Entre novamente antes de alterar dados.');}
  if(action)addAudit(action,detail);
  window.MarcoBorionInterop?.prepareState?.(STATE);
  CLOUD_PENDING_LOCAL=true;
  CLOUD_ONLY_COMMITTING=true;
  setSaveStatus('Enviando alteração ao Google Drive…','warn');
  try{
    const result=await flushCloudState(action||detail||'alteracao',{backup:!!opts.backup,retryMedia:opts.media!==false});
    LAST_CONFIRMED_STATE=clone(STATE);
    await MarcoStorage.saveSyncBase?.(STATE);
    clearTimeout(CLOUD_RETRY_TIMER);
    setSaveStatus(result.bridge&&!result.bridge.skipped?'Drive + Borion_Integracoes confirmados':'Google Drive confirmado','ok');
    return {cloud:true,drive:true,bridge:!!result.bridge&&!result.bridge.skipped,errors:[]};
  }catch(error){
    if(error.baseCommitted){
      /* A base principal já está segura no Drive. Mantemos o estado confirmado e
         repetimos somente a publicação do bridge, sem recriar ou perder registros. */
      LAST_CONFIRMED_STATE=clone(STATE);
      await MarcoStorage.saveSyncBase?.(STATE);
      CLOUD_PENDING_LOCAL=false;
      setSaveStatus('Dados no Drive · integração com Borion pendente','warn');
      scheduleCloudRetry(action||detail||'alteracao');
      return {cloud:true,drive:true,bridge:false,warning:error.message,errors:[error.message]};
    }
    rollback();
    CLOUD_PENDING_LOCAL=false;
    setSaveStatus('Alteração cancelada · Google Drive não confirmou','danger');
    throw error;
  }finally{
    CLOUD_ONLY_COMMITTING=false;
  }
}

function hasUnsyncedLocalState(){
  return !!CLOUD_ONLY_COMMITTING;
}
async function refreshFromDriveIfNewer({reason='intervalo'}={}){
  if(LOCKED||document.hidden||!STATE||!window.GoogleDriveMarco?.isConfigured?.())return {skipped:true,reason:'indisponivel'};
  if(REMOTE_REFRESH_INFLIGHT)return await REMOTE_REFRESH_INFLIGHT;
  /* Nunca troca o estado enquanto o Marco está preenchendo uma janela nem enquanto
     existe alteração local esperando confirmação. A próxima rodada ocorre em 8 s. */
  if(document.querySelector('#modal-root .modal')||hasUnsyncedLocalState())return {skipped:true,reason:'edicao-local'};
  REMOTE_REFRESH_INFLIGHT=(async()=>{
    try{
      const result=await GoogleDriveMarco.pullIfNewer(STATE,{interactive:false});
      if(!result?.updated)return result||{updated:false};
      normalizeState();
      window.MarcoBorionInterop?.prepareState?.(STATE);
      LAST_CONFIRMED_STATE=clone(STATE);
      await MarcoStorage.saveSyncBase?.(STATE);
      if(!LOCKED)renderView('none');
      CLOUD_PENDING_LOCAL=false;
      setSaveStatus('Atualizado do Google Drive','ok');
      return result;
    }catch(error){
      /* Polling é silencioso: falhas temporárias não interrompem o trabalho nem
         acionam o bridge. A sincronização manual continua disponível. */
      console.warn(`[REMOTE_REFRESH:${reason}]`,error);
      return {updated:false,error};
    }finally{REMOTE_REFRESH_INFLIGHT=null;}
  })();
  return await REMOTE_REFRESH_INFLIGHT;
}
function startRemoteRefresh(){
  clearInterval(REMOTE_REFRESH_TIMER);
  REMOTE_REFRESH_TIMER=setInterval(()=>refreshFromDriveIfNewer({reason:'intervalo-8s'}),REMOTE_REFRESH_INTERVAL_MS);
  if(REMOTE_REFRESH_FOCUS_HANDLER)window.removeEventListener('focus',REMOTE_REFRESH_FOCUS_HANDLER);
  if(REMOTE_REFRESH_VISIBILITY_HANDLER)document.removeEventListener('visibilitychange',REMOTE_REFRESH_VISIBILITY_HANDLER);
  REMOTE_REFRESH_FOCUS_HANDLER=()=>setTimeout(()=>refreshFromDriveIfNewer({reason:'foco'}),350);
  REMOTE_REFRESH_VISIBILITY_HANDLER=()=>{if(!document.hidden)setTimeout(()=>refreshFromDriveIfNewer({reason:'retorno-a-aba'}),350);};
  window.addEventListener('focus',REMOTE_REFRESH_FOCUS_HANDLER,{passive:true});
  document.addEventListener('visibilitychange',REMOTE_REFRESH_VISIBILITY_HANDLER,{passive:true});
}
function setSaveStatus(text,tone=''){const el=$('#save-status');if(el){el.textContent=text;el.dataset.tone=tone;}}
function getViewMode(section,fallback=VIEW_MODE_DEFAULTS[section]||'list'){
  const mode=data()?.settings?.viewModesBySection?.[section];
  return ['list','cards','compact'].includes(mode)?mode:fallback;
}
function setViewMode(section,mode){
  if(!Object.prototype.hasOwnProperty.call(VIEW_MODE_DEFAULTS,section)||!['list','cards','compact'].includes(mode))return false;
  data().settings.viewModesBySection={...VIEW_MODE_DEFAULTS,...(data().settings.viewModesBySection||{}),[section]:mode};
  return true;
}
function viewModeSwitcher(section,current=getViewMode(section)){
  const opts=[['list','list','Linha'],['cards','columns','Colunas'],['compact','grid','Quadrados']];
  const selected=opts.find(x=>x[0]===current)||opts[0];
  return `<div class="expandable-filter view-switcher-expandable" data-expandable-filter data-section="${attr(section)}" data-filter-value="${attr(current)}" role="group" aria-label="Modo de visualização">
    <button type="button" class="expandable-filter-trigger" data-action="toggle-expandable-filter" aria-expanded="false" title="${selected[2]}"><span data-expandable-current-icon>${icon(selected[1],18)}</span><span class="sr-only">${selected[2]}</span></button>
    <div class="expandable-filter-options">${opts.map(([value,ico,label])=>`<button type="button" class="expandable-filter-option ${value===current?'active':''}" data-action="set-view-mode" data-section="${attr(section)}" data-mode="${value}" aria-pressed="${value===current?'true':'false'}" title="${label}"><span>${icon(ico,17)}</span><span>${label}</span></button>`).join('')}</div>
  </div>`;
}
function toggleExpandableFilter(control){
  if(!control)return;
  const open=!control.classList.contains('is-open');
  document.querySelectorAll('[data-expandable-filter].is-open').forEach(other=>{if(other!==control){other.classList.remove('is-open');other.querySelector('.expandable-filter-trigger')?.setAttribute('aria-expanded','false');}});
  control.classList.toggle('is-open',open);
  control.querySelector('.expandable-filter-trigger')?.setAttribute('aria-expanded',open?'true':'false');
}
function collapseExpandableFilter(control){
  if(!control)return;
  control.classList.remove('is-open');
  control.querySelector('.expandable-filter-trigger')?.setAttribute('aria-expanded','false');
  control.classList.add('is-suppressed');
  setTimeout(()=>control.classList.remove('is-suppressed'),320);
}
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let SEARCH_RENDER_TIMER=0;
function decorateViewContent(){
  document.querySelectorAll('.view-mode-content .table').forEach(table=>{
    const labels=[...table.querySelectorAll('thead th')].map(th=>th.textContent.trim()||'Ações');
    table.querySelectorAll('tbody tr').forEach((row,index)=>{
      row.style.setProperty('--row-index',String(index));
      [...row.children].forEach((cell,i)=>cell.dataset.label=labels[i]||'');
    });
  });
}
function animateViewEntrance(root,entry='soft'){
  if(!root||entry==='none')return;
  const cls=entry==='right'?'page-enter-right':entry==='left'?'page-enter-left':'page-enter-soft';
  root.classList.remove('page-enter-right','page-enter-left','page-enter-soft','page-exit-left','page-exit-right');
  requestAnimationFrame(()=>{
    if(!root.isConnected)return;
    root.classList.add(cls);
    root.addEventListener('animationend',()=>root.classList.remove(cls),{once:true});
  });
}

const MarcoScrollLock=(()=>{
  let active=false,scrollY=0;
  function sync(){
    const body=document.body,html=document.documentElement,root=document.getElementById('root');
    if(!body||!html)return;
    const modalOpen=body.classList.contains('modal-open'),menuOpen=body.classList.contains('menu-open'),locked=modalOpen||menuOpen;
    body.classList.toggle('menu-scroll-locked',menuOpen);
    html.classList.toggle('marco-scroll-locked',locked);
    if(root){if(locked)root.setAttribute('inert','');else root.removeAttribute('inert');}
    if(locked&&!active){scrollY=window.scrollY||document.scrollingElement?.scrollTop||0;body.style.position='fixed';body.style.top=`-${scrollY}px`;body.style.left='0';body.style.right='0';body.style.width='100%';active=true;}
    else if(!locked&&active){body.style.position='';body.style.top='';body.style.left='';body.style.right='';body.style.width='';active=false;requestAnimationFrame(()=>window.scrollTo(0,scrollY));}
  }
  function forceRelease(){document.body?.classList.remove('modal-open','menu-open','menu-scroll-locked');sync();}
  return {sync,forceRelease,get locked(){return active;}};
})();
window.MarcoScrollLock=MarcoScrollLock;
function openMobileMenu(){if(document.body.classList.contains('menu-open'))return;document.body.classList.add('menu-open');MarcoScrollLock.sync();}
function closeMobileMenu(){const wasOpen=document.body.classList.contains('menu-open');document.body.classList.remove('menu-open');MarcoScrollLock.sync();return wasOpen;}

function toggleMobileMenu(){
  if(document.body.classList.contains('menu-open'))closeMobileMenu();
  else openMobileMenu();
}
window.MarcoMenu={open:openMobileMenu,close:closeMobileMenu,toggle:toggleMobileMenu};

function navigateTo(view){
  if(NAVIGATION_BUSY||!VIEW_TITLES[view]||view===CURRENT_VIEW)return;
  NAVIGATION_BUSY=true;
  const oldIndex=NAV.findIndex(([id])=>id===CURRENT_VIEW),newIndex=NAV.findIndex(([id])=>id===view),forward=newIndex>=oldIndex;
  CURRENT_VIEW=view;
  closeMobileMenu();
  renderView(forward?'right':'left');
  requestAnimationFrame(()=>{NAVIGATION_BUSY=false;});
}
function dateIsoLocal(date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
function monthShift(key,delta){const [y,m]=key.split('-').map(Number),d=new Date(y,m-1+delta,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;}
function monthTitle(key){const [y,m]=key.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1));}
function stopLockNetwork(){
  if(!LOCK_NETWORK)return;
  cancelAnimationFrame(LOCK_NETWORK.raf||0);
  if(LOCK_NETWORK.resizeHandler)window.removeEventListener('resize',LOCK_NETWORK.resizeHandler);
  if(LOCK_NETWORK.visibilityHandler)document.removeEventListener('visibilitychange',LOCK_NETWORK.visibilityHandler);
  LOCK_NETWORK=null;
}
function startLockNetwork(){
  stopLockNetwork();
  const canvas=$('#lock-network-canvas');
  if(!canvas)return;
  const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
  if(!ctx)return;

  const reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const lowPower=window.innerWidth<760||((navigator.hardwareConcurrency||8)<=4)||((navigator.deviceMemory||8)<=4);
  const frameInterval=1000/(lowPower?30:60);
  const state={
    canvas,ctx,points:[],raf:0,resizeHandler:null,visibilityHandler:null,
    dpr:1,width:0,height:0,lastTime:0,lastDraw:0,running:false,maxDist:0
  };

  const createPoints=()=>{
    const count=window.innerWidth<680?20:window.innerWidth<1100?30:42;
    const speed=lowPower?0.17:0.22;
    state.points=Array.from({length:count},(_,i)=>({
      x:Math.random()*state.width,
      y:Math.random()*state.height,
      vx:(Math.random()-.5)*speed,
      vy:(Math.random()-.5)*speed,
      r:1.1+Math.random()*1.9,
      pulse:Math.random()*Math.PI*2,
      accent:i%9===0
    }));
  };

  const draw=(time=performance.now(),staticFrame=false)=>{
    const elapsed=state.lastTime?Math.min(34,time-state.lastTime):16.67;
    state.lastTime=time;
    const step=elapsed/16.67;
    ctx.clearRect(0,0,state.width,state.height);

    const maxDistSq=state.maxDist*state.maxDist;
    ctx.lineWidth=lowPower?.9:1;

    for(let i=0;i<state.points.length;i++){
      const p=state.points[i];
      if(!staticFrame&&!reduced){
        p.x+=p.vx*step;
        p.y+=p.vy*step;
        p.pulse+=.018*step;
        if(p.x<0){p.x=0;p.vx=Math.abs(p.vx);}else if(p.x>state.width){p.x=state.width;p.vx=-Math.abs(p.vx);}
        if(p.y<0){p.y=0;p.vy=Math.abs(p.vy);}else if(p.y>state.height){p.y=state.height;p.vy=-Math.abs(p.vy);}
      }
      for(let j=i+1;j<state.points.length;j++){
        const q=state.points[j];
        const dx=p.x-q.x,dy=p.y-q.y,distSq=dx*dx+dy*dy;
        if(distSq>=maxDistSq)continue;
        const dist=Math.sqrt(distSq);
        const alpha=(1-dist/state.maxDist)*(lowPower?0.17:0.25);
        ctx.strokeStyle=`rgba(104,176,255,${alpha.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p.x,p.y);
        ctx.lineTo(q.x,q.y);
        ctx.stroke();
      }
    }

    for(const p of state.points){
      const pulse=staticFrame||reduced?1:1+Math.sin(p.pulse)*.10;
      ctx.fillStyle=p.accent?'rgba(255,126,76,.10)':'rgba(74,150,255,.10)';
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r*3.4*pulse,0,Math.PI*2);
      ctx.fill();

      ctx.fillStyle=p.accent?'rgba(255,154,112,.86)':'rgba(152,212,255,.92)';
      ctx.beginPath();
      ctx.arc(p.x,p.y,p.r*pulse,0,Math.PI*2);
      ctx.fill();
    }
  };

  const loop=time=>{
    if(!state.running)return;
    if(!state.lastDraw||time-state.lastDraw>=frameInterval){
      draw(time,false);
      state.lastDraw=time;
    }
    state.raf=requestAnimationFrame(loop);
  };

  const resize=()=>{
    state.width=window.innerWidth;
    state.height=window.innerHeight;
    state.dpr=lowPower?1:Math.min(1.25,window.devicePixelRatio||1);
    state.maxDist=window.innerWidth<680?165:window.innerWidth<1100?185:215;
    canvas.width=Math.max(1,Math.round(state.width*state.dpr));
    canvas.height=Math.max(1,Math.round(state.height*state.dpr));
    canvas.style.width=state.width+'px';
    canvas.style.height=state.height+'px';
    ctx.setTransform(state.dpr,0,0,state.dpr,0,0);
    createPoints();
    state.lastTime=0;
    state.lastDraw=0;
    draw(performance.now(),true);
  };

  const startLoop=()=>{
    if(reduced||state.running||document.hidden)return;
    state.running=true;
    state.lastTime=0;
    state.lastDraw=0;
    state.raf=requestAnimationFrame(loop);
  };
  const pauseLoop=()=>{
    state.running=false;
    cancelAnimationFrame(state.raf||0);
    state.raf=0;
  };

  let resizeRaf=0;
  state.resizeHandler=()=>{
    cancelAnimationFrame(resizeRaf);
    resizeRaf=requestAnimationFrame(()=>{resize();startLoop();});
  };
  state.visibilityHandler=()=>{
    if(document.hidden)pauseLoop();
    else startLoop();
  };

  LOCK_NETWORK=state;
  resize();
  window.addEventListener('resize',state.resizeHandler,{passive:true});
  document.addEventListener('visibilitychange',state.visibilityHandler);
  startLoop();
}
function toast(message,tone='ok'){const root=$('#toast-root'),el=document.createElement('div');el.className=`toast ${tone}`;el.innerHTML=`<strong>${tone==='error'?'!':tone==='warn'?'•':'✓'}</strong><div>${esc(message)}</div>`;root.appendChild(el);requestAnimationFrame(()=>el.classList.add('show'));setTimeout(()=>{el.classList.remove('show');setTimeout(()=>el.remove(),230);},3400);}
let APP_CONFIRM_ACTIVE=null;
function confirmAction(message,{title='Confirmar ação',confirmLabel='Confirmar',cancelLabel='Cancelar',tone='danger'}={}){
  // Sem DOM utilizável, usa somente um adaptador explícito; nunca recorre a diálogo nativo.
  if(!document?.getElementById||!document?.body?.appendChild){
    const adapter=globalThis?.MarcoConfirmAdapter;
    if(typeof adapter==='function')return Promise.resolve(adapter({message,title,confirmLabel,cancelLabel,tone})).then(Boolean);
    console.warn('[Marco Iris] Confirmação visual indisponível; ação cancelada por segurança.',{title,message});
    return Promise.resolve(false);
  }
  if(APP_CONFIRM_ACTIVE)APP_CONFIRM_ACTIVE(false);
  let root=document.getElementById('confirm-root');
  if(!root){root=document.createElement('div');root.id='confirm-root';document.body.appendChild(root);}
  return new Promise(resolve=>{
    let settled=false;
    const finish=value=>{
      if(settled)return;
      settled=true;
      APP_CONFIRM_ACTIVE=null;
      document.removeEventListener('keydown',onKey,true);
      const backdrop=root.querySelector('.app-confirm-backdrop');
      backdrop?.classList.add('is-closing');
      setTimeout(()=>{if(root.contains(backdrop))root.replaceChildren();resolve(Boolean(value));},170);
    };
    APP_CONFIRM_ACTIVE=finish;
    const safeMessage=esc(String(message||'')).replace(/\n/g,'<br>');
    root.innerHTML=`<div class="app-confirm-backdrop" role="presentation"><section class="app-confirm-dialog ${attr(tone)}" role="alertdialog" aria-modal="true" aria-labelledby="app-confirm-title" aria-describedby="app-confirm-message"><div class="app-confirm-icon" aria-hidden="true">${icon(tone==='danger'?'warning':'check',24)}</div><div class="app-confirm-copy"><h2 id="app-confirm-title">${esc(title)}</h2><p id="app-confirm-message">${safeMessage}</p></div><div class="app-confirm-actions"><button type="button" class="btn secondary" data-confirm-choice="cancel">${esc(cancelLabel)}</button><button type="button" class="btn ${tone==='danger'?'danger':'primary'}" data-confirm-choice="ok">${esc(confirmLabel)}</button></div></section></div>`;
    const backdrop=root.querySelector('.app-confirm-backdrop');
    requestAnimationFrame(()=>backdrop?.classList.add('is-open'));
    root.querySelector('[data-confirm-choice="cancel"]')?.addEventListener('click',()=>finish(false));
    root.querySelector('[data-confirm-choice="ok"]')?.addEventListener('click',()=>finish(true));
    backdrop?.addEventListener('click',event=>{if(event.target===backdrop)finish(false);});
    const onKey=event=>{
      if(event.key==='Escape'){event.preventDefault();finish(false);}
      if(event.key==='Enter'&&!event.target.closest('button')){event.preventDefault();finish(true);}
    };
    document.addEventListener('keydown',onKey,true);
    setTimeout(()=>root.querySelector('[data-confirm-choice="cancel"]')?.focus(),0);
  });
}
function nextCode(prefix,list,width=6,field='id'){
  const normalized=String(prefix||'').toUpperCase(),settings=data()?.settings||(data().settings={}),nextIds=settings.nextIds||(settings.nextIds={}),high=Math.max(0,Number(nextIds[normalized])||0);
  if(window.MarcoIdentifiers){
    const code=window.MarcoIdentifiers.getNextEntityCode(normalized,list,field,high),parsed=window.MarcoIdentifiers.parseEntityCode(code,normalized);
    if(parsed)nextIds[normalized]=Math.max(high,parsed.sequence);
    return code;
  }
  let max=high;for(const x of list){const digits=String(x?.[field]||'').replace(/\D/g,'');if(digits)max=Math.max(max,Number(digits)||0);}
  nextIds[normalized]=max+1;
  return `${normalized}-${String(max+1).padStart(width,'0')}`;
}
function matches(...values){
  if(!SEARCH)return true;const q=norm(SEARCH);
  if(values.some(v=>norm(v).includes(q)))return true;
  if(!window.MarcoIdentifiers)return false;
  return values.some(v=>['OSV','CLI','PRD','SRV','INS','ITM','MOV','REC','DES','AGE','TER'].some(prefix=>window.MarcoIdentifiers.codeMatches(v,SEARCH,prefix)));
}
function findClient(id){const canonical=window.MarcoIdentifiers?.normalizeEntityCode(id,'CLI')||String(id||'');return data().clients.find(x=>(window.MarcoIdentifiers?.normalizeEntityCode(x.id,'CLI')||x.id)===canonical);}
function findOrder(id){const canonical=window.MarcoIdentifiers?.normalizeEntityCode(id,'OSV')||String(id||'');return data().serviceOrders.find(x=>(window.MarcoIdentifiers?.normalizeEntityCode(x.id,'OSV')||x.id)===canonical);}
function orderItems(id){return data().orderItems.filter(x=>x.orderId===id);}
function orderPayments(id){return data().payments.filter(x=>x.orderId===id);}
function isPaymentCancelled(payment){return norm(payment?.status).includes('cancel')||!!payment?.cancelledAt;}
function catalogItem(it){if(it.type==='Produto')return data().products.find(x=>x.id===it.productId);if(it.type==='Serviço')return data().services.find(x=>x.id===it.serviceId);return data().supplies.find(x=>x.id===it.supplyId);}
function itemDescription(it){return catalogItem(it)?.description||it.description||it.productId||it.serviceId||it.supplyId||'Item sem descrição';}
function realizedPaymentValue(orderId){return orderPayments(orderId).filter(p=>['pago','parcial'].includes(norm(p.status))&&norm(p.type)==='receita').reduce((s,p)=>s+num(p.value),0);}
function paymentStatus(order){const paid=realizedPaymentValue(order.id);if(paid>=num(order.total)&&num(order.total)>0)return 'Pago';if(paid>0)return 'Parcial';return 'Pendente';}
function statusBadge(value){const n=norm(value);const tone=n.includes('conclu')||n==='pago'||n==='ativo'||n.includes('confirm')?'ok':n.includes('cancel')||n.includes('atras')||n.includes('vencid')||n.includes('inativo')?'danger':n.includes('andamento')||n.includes('analise')||n.includes('parcial')?'blue':'warn';return `<span class="badge ${tone}"><span class="status-dot"></span>${esc(value||'Pendente')}</span>`;}
function movementSign(m){return norm(m.movementType).startsWith('entrada')?1:-1;}
function stockOf(type,id){const base=type==='Produto'?num(data().products.find(x=>x.id===id)?.initialStock):num(data().supplies.find(x=>x.id===id)?.initialStock);return data().stockMovements.reduce((s,m)=>{if((type==='Produto'&&m.productId===id)||(type==='Insumo'&&m.supplyId===id))return s+movementSign(m)*num(m.quantity);return s;},base);}
function lowStockItems(){const p=data().products.map(x=>({type:'Produto',id:x.id,name:x.description,stock:stockOf('Produto',x.id),min:num(x.minimumStock)}));const s=data().supplies.map(x=>({type:'Insumo',id:x.id,name:x.description,stock:stockOf('Insumo',x.id),min:num(x.minimumStock)}));return [...p,...s].filter(x=>x.stock<=x.min);}
function privacy(v){return data().settings.dashboardPrivacy?'••••':v;}
function whatsappNumber(phone){return window.MarcoPhone?.whatsappDigits(phone)||'';}
function phoneLink(phone){const digits=whatsappNumber(phone);return digits?`https://wa.me/${digits}`:'#';}
function duplicateIds(list){const seen=new Set(),dupes=new Set();for(const x of list){if(!x?.id)continue;if(seen.has(x.id))dupes.add(x.id);seen.add(x.id);}return [...dupes];}
function orderConsentItems(orderId){return data().consents.filter(c=>c.orderId===orderId);}
function integrityReport(){const d=data(),issues=[];const add=(type,label,count,detail)=>{if(count)issues.push({type,label,count,detail});};add('danger','OSV sem cliente',d.serviceOrders.filter(o=>o.clientId&&!findClient(o.clientId)).length,'A OSV aponta para um cliente inexistente.');add('danger','Itens sem OSV',d.orderItems.filter(i=>!findOrder(i.orderId)).length,'Item órfão fora de uma ordem.');add('danger','Itens sem catálogo',d.orderItems.filter(i=>!catalogItem(i)).length,'Produto, serviço ou insumo foi removido do catálogo.');add('warn','Pagamentos com OSV inexistente',d.payments.filter(p=>p.orderId&&!findOrder(p.orderId)).length,'Lançamento financeiro órfão.');add('warn','Agendamentos sem cliente',d.appointments.filter(a=>a.clientId&&!findClient(a.clientId)).length,'Agendamento aponta para cliente inexistente.');add('warn','Termos sem cliente',d.consents.filter(c=>c.clientId&&!findClient(c.clientId)).length,'Termo aponta para cliente inexistente.');add('warn','Termos com OSV inexistente',d.consents.filter(c=>c.orderId&&!findOrder(c.orderId)).length,'Termo aponta para OSV inexistente.');add('danger','Movimentos sem item',d.stockMovements.filter(m=>!itemForMovement(m)).length,'Movimentação aponta para produto ou insumo inexistente.');add('warn','Movimentos automáticos órfãos',d.stockMovements.filter(m=>m.sourceItemId&&(!m.orderId||!findOrder(m.orderId))).length,'Ajuste automático sem uma OSV de origem válida.');add('danger','Estoque negativo',lowStockItems().filter(x=>x.stock<0).length,'Há itens com saldo abaixo de zero.');add('warn','Recebimentos acima do total',d.serviceOrders.filter(o=>realizedPaymentValue(o.id)>num(o.total)+.01).length,'Revise adiantamentos, valores extras ou lançamentos duplicados.');const totalMismatch=d.serviceOrders.filter(o=>{const items=orderItems(o.id).filter(i=>catalogItem(i));return items.length&&Math.abs(num(o.total)-Math.max(0,items.reduce((s,i)=>s+num(i.quantity)*num(i.unitPrice),0)-num(o.discount)))>.01;}).length;add('warn','Totais de OSV divergentes',totalMismatch,'O total não confere com itens menos desconto.');const groups=[['clientes',d.clients],['OSV',d.serviceOrders],['itens',d.orderItems],['financeiro',d.payments],['produtos',d.products],['serviços',d.services],['insumos',d.supplies],['estoque',d.stockMovements],['agenda',d.appointments],['termos',d.consents]];for(const [label,list] of groups)add('danger',`IDs duplicados em ${label}`,duplicateIds(list).length,'Dois registros usam o mesmo código.');return {issues,total:issues.reduce((s,x)=>s+x.count,0),checkedAt:nowIso()};}
async function repairSafeLinks(){const d=data();let names=0,totals=0,codes=0;for(const o of d.serviceOrders){const c=findClient(o.clientId);if(c&&o.clientName!==c.name){o.clientName=c.name;names++;}const linked=orderItems(o.id).filter(i=>catalogItem(i));if(linked.length){const expected=Math.max(0,linked.reduce((s,i)=>{i.subtotal=num(i.quantity)*num(i.unitPrice);return s+i.subtotal;},0)-num(o.discount));if(Math.abs(num(o.total)-expected)>.01){o.total=expected;totals++;}}}for(const a of d.appointments){const c=findClient(a.clientId);if(c&&a.clientName!==c.name){a.clientName=c.name;names++;}}for(const cns of d.consents){const c=findClient(cns.clientId);if(c&&cns.clientName!==c.name){cns.clientName=c.name;names++;}}for(const p of d.payments){if(!p.code){p.code=p.id;codes++;}}await persist('Diagnóstico e correção segura',`${names} nomes, ${totals} totais e ${codes} códigos ajustados.`);renderView();toast('Vínculos seguros revisados e corrigidos.');}
function fallbackPinHash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return `fnv1a:${(h>>>0).toString(16).padStart(8,'0')}`;}
async function sha256Pin(value){if(!globalThis.crypto?.subtle)return '';const bytes=new TextEncoder().encode(String(value)),digest=await crypto.subtle.digest('SHA-256',bytes);return `sha256:${[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')}`;}
async function hashPin(value){return (await sha256Pin(value))||fallbackPinHash(value);}
async function checkPin(value,stored){if(!stored)return true;const s=String(stored);if(s.startsWith('sha256:'))return (await sha256Pin(value))===s;if(s.startsWith('fnv1a:'))return fallbackPinHash(value)===s;return String(value)===s;}

let LOGIN_GOOGLE_INFLIGHT=null;

async function validateLoginPin(form,{offline=false}={}){
  const p=activeProfile();
  if(offline&&!p.pin)throw new Error('Para entrar sem Google, crie primeiro um PIN em Configurações.');
  const pin=form?.querySelector('#login-pin')?.value||'';
  if(!(await checkPin(pin,p.pin))){
    const input=form?.querySelector('#login-pin');
    input?.classList.remove('login-error');requestAnimationFrame(()=>input?.classList.add('login-error'));input?.focus();
    throw new Error('PIN incorreto. Confira os números e tente novamente.');
  }
}

async function completeLogin(authMode='google',authEmail=''){
  const screen=$('.login-screen');
  screen?.classList.add('screen-exit-left');
  await wait(230);
  sessionStorage.setItem('marco_iris_auth_mode',authMode);
  if(authEmail)sessionStorage.setItem('marco_iris_auth_email',authEmail);else sessionStorage.removeItem('marco_iris_auth_email');
  LOCKED=false;
  renderShell('right');
}

async function submitLogin(form){
  if(LOGIN_GOOGLE_INFLIGHT)return await LOGIN_GOOGLE_INFLIGHT;
  const button=form?.querySelector('.login-enter'),original=button?.innerHTML||'';
  const progress=text=>{if(button?.isConnected)button.innerHTML=`<span class="login-spinner" aria-hidden="true"></span> ${esc(text)}…`;setSaveStatus(text,'warn');};
  LOGIN_GOOGLE_INFLIGHT=(async()=>{
    if(!navigator.onLine)throw new Error('Sem internet. O Marco Iris depende 100% do Google Drive e não pode ser aberto offline.');
    await validateLoginPin(form);
    if(!window.GoogleDriveMarco?.initializeOfficialState)throw new Error('O login seguro do Google Drive ainda não está disponível. Atualize a página e tente novamente.');
    window.MarcoBorionInterop?.setNotReady?.('Aguardando carregamento da base oficial.');
    if(button){button.disabled=true;button.classList.add('is-loading');}
    progress('Conectando ao Google Drive');
    const result=await window.GoogleDriveMarco.initializeOfficialState(clone(window.MARCO_INITIAL_DATA),{interactive:true,onProgress:progress});
    progress('Validando dados oficiais');
    STATE=result.state;
    await backupStateBeforeV220Migration(STATE,'login-drive-oficial');
    normalizeState();
    LAST_CONFIRMED_STATE=clone(STATE);
    await MarcoStorage.saveSyncBase?.(STATE);
    CLOUD_PENDING_LOCAL=false;
    window.MarcoBorionInterop?.resume?.('offline-mode');
    window.MarcoBorionInterop?.prepareState?.(STATE);
    window.MarcoBorionInterop?.setReady?.(STATE,{companyInstanceId:STATE?.interconnections?.borion?.companyInstanceId||STATE?.interconnections?.borion?.instanceId});
    progress('Confirmando integração com o Borion');
    await publishBridgeConfirmed();
    progress('Abrindo aplicativo');
    await completeLogin('google',String(result.user?.email||''));
    setSaveStatus('Google Drive + Borion_Integracoes confirmados','ok');
    return result.user;
  })().catch(error=>{window.MarcoBorionInterop?.setNotReady?.(error.message||'Falha na sincronização inicial.');throw error;}).finally(()=>{
    if(button?.isConnected){button.disabled=false;button.classList.remove('is-loading');button.innerHTML=original;}
    LOGIN_GOOGLE_INFLIGHT=null;
  });
  return await LOGIN_GOOGLE_INFLIGHT;
}

async function submitOfflineLogin(){
  throw new Error('O modo offline foi removido. Entre com o Google e mantenha conexão com a internet.');
}
async function lockApp(){
  if(LOCKED)return;
  const shell=$('.app-bg');
  shell?.classList.add('screen-exit-right');
  await wait(230);
  LOCKED=true;
  window.MarcoBorionInterop?.setNotReady?.('Aplicativo bloqueado; nova carga oficial será exigida.');
  sessionStorage.removeItem('marco_iris_auth_mode');
  sessionStorage.removeItem('marco_iris_auth_email');
  closeMobileMenu();
  closeModal(true);
  renderLogin('left');
}
function renderLogin(entry=''){
  clearInterval(CLOCK_TIMER);
  stopLockNetwork();
  document.body.classList.add('login-page');
  const p=activeProfile();
  const hasPin=Boolean(p.pin);
  $('#root').innerHTML=`<main class="login-screen ${entry==='left'?'screen-enter-left':''}">
    <canvas id="lock-network-canvas" class="lock-network-canvas" aria-hidden="true"></canvas>
    <div class="lock-orb lock-orb-one"></div><div class="lock-orb lock-orb-two"></div>
    <section class="lock-shell">
      <div class="lock-brand-panel">
        <div class="lock-brand-top"><img src="assets/marco-symbol.png" alt="Símbolo Marco Iris"><div><h1 class="lock-title">Marco Iris</h1><span class="lock-subtitle">Soluções em Tecnologia</span></div></div>
        <p class="lock-tagline">Tecnologia que <strong>conecta</strong>, soluções que <strong>transformam</strong>.</p>
      </div>
      <form class="login-card login-card-compact" data-form="login" autocomplete="on">
        <div class="profile-option" aria-label="Perfil ${attr(p.name||'Marco')}"><div class="avatar">${esc((p.name||'M')[0])}</div><div class="spacer"><strong>${esc(p.name)}</strong><small>${esc(p.role||'Administrador')}</small></div><span class="profile-lock">${icon('lock')}</span></div>
        ${hasPin?`<label class="field login-pin-field"><span>PIN de acesso</span><input id="login-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" pattern="[0-9]*" placeholder="Digite seu PIN" required></label>`:''}
        <button class="btn primary login-enter" type="submit"><span class="google-entry-mark" aria-hidden="true">G</span> Entrar com Google</button>
        <p class="login-security-note">Internet e Google Drive são obrigatórios. Os dados não são salvos neste dispositivo.</p>
      </form>
      <div class="lock-feature-row">
        <div class="lock-feature"><div class="lock-feature-icon">${icon('settings')}</div><div><strong>Suporte técnico</strong><small>Ordens de serviço, diagnósticos, laudos e atendimento especializado.</small></div></div>
        <div class="lock-feature"><div class="lock-feature-icon">${icon('lock')}</div><div><strong>Segurança e confiabilidade</strong><small>Acesso obrigatório pelo Google Drive, sem base de dados local no dispositivo.</small></div></div>
        <div class="lock-feature"><div class="lock-feature-icon">${icon('cloud')}</div><div><strong>Soluções em nuvem</strong><small>Fotos, PDFs, anexos e dados organizados no Google Drive.</small></div></div>
      </div>
    </section>
    <footer class="lock-footer"><div class="lock-footer-cards"><div class="lock-footer-card"><strong><span class="status-dot-live"></span> Sistema operacional</strong><small>Interface pronta para uso.</small></div><div class="lock-footer-card"><strong>${icon('cloud')} Google Drive e backups</strong><small>Dados e arquivos em pastas separadas.</small></div><div class="lock-footer-card"><strong>${icon('download')} Aplicativo PWA</strong><small>Instalação no computador e celular.</small></div></div><div class="lock-footer-meta"><strong>Marco Iris Tecnologia © 2026</strong><span>v2.5.1</span></div></footer>
  </main>`;
  startLockNetwork();
}
function renderShell(entry=''){
  stopLockNetwork();
  document.body.classList.remove('login-page');
  const p=activeProfile();
  $('#root').innerHTML=`<div class="app-bg ${entry==='right'?'screen-enter-right':''}"><div class="app-shell"><aside class="sidebar" aria-label="Menu principal"><div class="brand"><img src="icon-192.png" alt=""><div><strong>Marco Iris</strong><small>Soluções em Tecnologia</small></div></div><div class="nav-section">Gestão</div>${NAV.map(([id,label])=>`<button class="nav-btn ${CURRENT_VIEW===id?'active':''}" data-action="navigate" data-view="${id}">${icon(id)}<span>${label}</span></button>`).join('')}<div class="sidebar-footer"><div class="save-status" id="save-status" data-tone="ok">Google Drive conectado</div><button class="nav-btn" data-action="manual-save">${icon('save')}<span>Backup no Google Drive</span></button><button class="nav-btn lock-sidebar-btn" data-action="lock-now">${icon('lock')}<span>Bloquear tela</span></button></div></aside><button class="sidebar-scrim" type="button" data-action="close-menu" aria-label="Fechar menu"></button><main class="main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="toggle-menu" aria-label="Abrir menu">${icon('menu')}</button><div class="view-heading"><h1 id="view-title">${VIEW_TITLES[CURRENT_VIEW]}</h1><small>${esc(p.name)} · ${esc(p.role||'Administrador')}</small></div><label class="global-search">${icon('search')}<input id="global-search" value="${attr(SEARCH)}" placeholder="Pesquisar nesta tela"></label><div class="top-actions"><button class="icon-btn desktop-only" title="Ocultar ou mostrar valores" data-action="toggle-privacy">${icon('eye')}</button><button class="icon-btn" title="Salvar" data-action="manual-save">${icon('save')}</button><button class="icon-btn lock-top-btn" title="Bloquear tela" data-action="lock-now">${icon('lock')}</button></div></header><section class="content" id="view-root"></section></main></div></div>`;
  renderView('none');
}
function renderView(entry='soft'){
  if(LOCKED)return renderLogin();
  const root=$('#view-root');if(!root)return renderShell();
  $('#view-title').textContent=VIEW_TITLES[CURRENT_VIEW];
  $$('.nav-btn[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===CURRENT_VIEW));
  const views={dashboard:renderDashboard,orders:renderOrders,agenda:renderAgenda,clients:renderClients,finance:renderFinance,stock:renderStock,catalog:renderCatalog,documents:renderDocuments,settings:renderSettings};
  root.innerHTML=(views[CURRENT_VIEW]||renderDashboard)();
  decorateViewContent();
  animateViewEntrance(root,entry);
  hydrateMediaImages();startClock();
}
function startClock(){clearInterval(CLOCK_TIMER);const update=()=>{const e=$('#live-clock');if(e)e.textContent=new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(new Date());const d=$('#live-date');if(d)d.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date());};update();CLOCK_TIMER=setInterval(update,30000);}

function renderDashboard(){
  const d=data(),todayKey=today(),month=todayKey.slice(0,7),orders=d.serviceOrders.filter(o=>o.registrationStatus!=='Inativo'),open=orders.filter(o=>!norm(o.status).includes('conclu')&&!norm(o.status).includes('cancel'));
  const activePayments=d.payments.filter(p=>!isPaymentCancelled(p)),finance=activePayments.filter(p=>monthKey(p.paymentDate||p.dueDate)===month);const income=finance.filter(p=>norm(p.type)==='receita'&&norm(p.status)==='pago').reduce((s,p)=>s+num(p.value),0);const expense=finance.filter(p=>norm(p.type)==='despesa'&&norm(p.status)==='pago').reduce((s,p)=>s+num(p.value),0);const pending=activePayments.filter(p=>norm(p.type)==='receita'&&norm(p.status)!=='pago').reduce((s,p)=>s+num(p.value),0);const low=lowStockItems();const appts=d.appointments.filter(a=>a.date===todayKey&&norm(a.status)!=='cancelado').sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  const recent=[...orders].sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||'')).slice(0,8);
  return `<section class="hero"><div class="hero-content"><div><h2>Olá, ${esc(activeProfile().name)}.</h2><p>Seu painel reúne o que precisa de atenção hoje: ordens abertas, agenda, recebimentos e estoque.</p></div><div class="hero-clock"><strong id="live-clock">--:--</strong><small id="live-date"></small></div></div></section><div class="grid kpis"><div class="card kpi"><div class="kpi-icon blue">${icon('orders')}</div><div><small>Ordens abertas</small><strong>${privacy(open.length)}</strong><div class="delta">${orders.length} ordens ativas</div></div></div><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receitas no mês</small><strong>${privacy(currency(income))}</strong><div class="delta">Saldo ${privacy(currency(income-expense))}</div></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('agenda')}</div><div><small>Agenda de hoje</small><strong>${privacy(appts.length)}</strong><div class="delta">${appts.filter(a=>norm(a.status)==='confirmado').length} confirmados</div></div></div><div class="card kpi"><div class="kpi-icon red">${icon('stock')}</div><div><small>Estoque em alerta</small><strong>${privacy(low.length)}</strong><div class="delta">Receber: ${privacy(currency(pending))}</div></div></div></div><div class="grid two"><section class="card"><div class="card-header"><div><h2>Agenda de hoje</h2><p>Compromissos e visitas técnicas.</p></div><button class="btn secondary compact" data-action="new-appointment">${icon('plus')} Agendar</button></div>${appts.length?`<div class="list">${appts.map(a=>{const c=findClient(a.clientId);return `<div class="list-row"><div class="badge blue">${esc(a.time||'--:--')}</div><div class="list-row-main"><strong>${esc(a.title||c?.name||'Compromisso')}</strong><small>${esc(c?.name||a.clientName||'Sem cliente')} · ${esc(a.location||'Sem local')}</small></div>${statusBadge(a.status||'Agendado')}<button class="icon-btn" data-action="edit-appointment" data-id="${attr(a.id)}">${icon('edit')}</button></div>`;}).join('')}</div>`:`<div class="empty">${icon('agenda',42)}<div>Nenhum compromisso para hoje.</div></div>`}</section><section class="card"><div class="card-header"><div><h2>Ordens recentes</h2><p>Últimas movimentações da assistência.</p></div><button class="btn secondary compact" data-action="new-order">${icon('plus')} Nova OSV</button></div>${recent.length?`<div class="list">${recent.map(o=>`<button class="list-row" style="width:100%;text-align:left" data-action="view-order" data-id="${attr(o.id)}"><div class="list-row-main"><strong>${esc(o.id)} · ${esc(o.clientName||findClient(o.clientId)?.name||'Cliente')}</strong><small>${esc(o.equipmentType||'Equipamento não informado')} · ${formatDate(o.openedAt)}</small></div><div class="list-row-side">${statusBadge(o.status)}<small>${currency(o.total)}</small></div></button>`).join('')}</div>`:`<div class="empty">Nenhuma ordem cadastrada.</div>`}</section></div><div class="grid two" style="margin-top:18px"><section class="card"><div class="card-header"><div><h2>Pendências financeiras</h2><p>Receitas ainda não quitadas.</p></div><button class="btn ghost compact" data-action="navigate" data-view="finance">Ver financeiro ${icon('arrow')}</button></div>${activePayments.filter(p=>norm(p.type)==='receita'&&norm(p.status)!=='pago').slice(0,7).map(p=>{const o=findOrder(p.orderId);return `<div class="list-row"><div class="list-row-main"><strong>${esc(o?.clientName||p.orderId||p.notes||'Receita')}</strong><small>${formatDate(p.dueDate)} · ${esc(p.paymentMethod||'Sem forma')}</small></div><div class="list-row-side"><strong>${currency(p.value)}</strong>${statusBadge(p.status)}</div></div>`;}).join('')||'<div class="empty">Nenhuma receita pendente.</div>'}</section><section class="card"><div class="card-header"><div><h2>Alertas de estoque</h2><p>Itens no mínimo ou abaixo dele.</p></div><button class="btn ghost compact" data-action="navigate" data-view="stock">Abrir estoque ${icon('arrow')}</button></div>${low.slice(0,7).map(x=>`<div class="list-row"><div class="list-row-main"><strong>${esc(x.name)}</strong><small>${esc(x.type)} · mínimo ${x.min}</small><div class="stock-meter low"><span style="width:${Math.max(4,Math.min(100,x.min>0?(x.stock/x.min)*100:4))}%"></span></div></div><div class="badge danger">${x.stock}</div></div>`).join('')||'<div class="empty">Nenhum item em nível crítico.</div>'}</section></div>`;
}

function renderOrders(){
  const mode=getViewMode('orders');
  const all=[...data().serviceOrders].filter(o=>matches(o.id,o.clientName,findClient(o.clientId)?.name,o.equipmentType,o.brandModel,o.status,o.reportedIssue));
  const rows=all.filter(o=>SHOW_ARCHIVED.orders?o.registrationStatus==='Inativo':o.registrationStatus!=='Inativo').sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||''));
  const statuses=['Todos','Em análise','Aguardando aprovação','Em andamento','Aguardando peça','Pronto para retirada','Concluído','Cancelado'];
  const active=$('#order-status-filter')?.value||'Todos',filtered=active==='Todos'?rows:rows.filter(o=>norm(o.status)===norm(active)),archived=all.filter(o=>o.registrationStatus==='Inativo').length;
  return `<div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-order">${icon('plus')} Nova OSV</button><select id="order-status-filter" class="filter-control">${statuses.map(v=>`<option ${v===active?'selected':''}>${v}</option>`).join('')}</select><button class="btn secondary" data-action="toggle-archived-orders">${SHOW_ARCHIVED.orders?'Ver ativas':`Arquivadas (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('orders',mode)}<span class="badge blue">${filtered.length} ordens</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="orders"><div class="table-wrap"><table class="table"><thead><tr><th>OSV</th><th>Abertura</th><th>Cliente</th><th>Equipamento</th><th>Status</th><th>Financeiro</th><th class="text-right">Valor</th><th></th></tr></thead><tbody>${filtered.map(o=>`<tr><td><strong>${esc(o.id)}</strong>${o.registrationStatus==='Inativo'?'<small class="muted">Arquivada</small>':''}</td><td>${formatDate(o.openedAt)}</td><td>${esc(o.clientName||findClient(o.clientId)?.name||'—')}</td><td><strong>${esc(o.equipmentType||'—')}</strong><small class="muted">${esc(o.brandModel||'')}</small></td><td>${statusBadge(o.status)}</td><td>${statusBadge(paymentStatus(o))}</td><td class="text-right"><strong>${currency(o.total)}</strong></td><td><div class="actions"><button title="Visualizar" data-action="view-order" data-id="${attr(o.id)}">${icon('eye')}</button><button title="Editar" data-action="edit-order" data-id="${attr(o.id)}">${icon('edit')}</button><button title="PDF" data-action="generate-pdf" data-id="${attr(o.id)}">${icon('pdf')}</button><button title="Enviar PDF no WhatsApp" data-action="share-order" data-id="${attr(o.id)}">${icon('phone')}</button><button title="${o.registrationStatus==='Inativo'?'Restaurar':'Arquivar'}" data-action="toggle-order-status" data-id="${attr(o.id)}">${icon(o.registrationStatus==='Inativo'?'check':'folder')}</button></div></td></tr>`).join('')||`<tr><td colspan="8"><div class="empty">${icon('orders',42)}<div>Nenhuma ordem encontrada.</div></div></td></tr>`}</tbody></table></div></section>`;
}
function renderAgenda(){
  const mode=getViewMode('agenda','cards');
  if(!AGENDA_CURSOR)AGENDA_CURSOR=today().slice(0,7);if(!AGENDA_SELECTED)AGENDA_SELECTED=today();
  const list=[...data().appointments].filter(a=>matches(a.title,a.clientName,findClient(a.clientId)?.name,a.location,a.notes,a.status)).sort((a,b)=>`${a.date||''}${a.time||''}`.localeCompare(`${b.date||''}${b.time||''}`));
  const selectedItems=list.filter(a=>a.date===AGENDA_SELECTED&&norm(a.status)!=='cancelado');
  const header=`<div class="toolbar agenda-toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-appointment" data-date="${attr(AGENDA_SELECTED)}">${icon('plus')} Novo agendamento</button><button class="btn secondary" data-action="agenda-today">${icon('agenda')} Hoje</button>${mode==='cards'?`<div class="calendar-nav"><button class="icon-btn" data-action="agenda-prev" title="Mês anterior">${icon('chevronLeft')}</button><strong>${esc(monthTitle(AGENDA_CURSOR))}</strong><button class="icon-btn" data-action="agenda-next" title="Próximo mês">${icon('chevronRight')}</button></div>`:''}</div><div class="toolbar-right">${viewModeSwitcher('agenda',mode)}<span class="badge blue">${list.filter(a=>(a.date||'')>=today()&&norm(a.status)!=='cancelado').length} próximos</span></div></div>`;
  if(mode==='list'){
    const groups={};list.forEach(a=>(groups[a.date||'Sem data']||=[]).push(a));
    return header+`<section class="agenda-list-view" data-view-content="agenda">${Object.entries(groups).length?Object.entries(groups).map(([date,items])=>`<article class="agenda-day-group"><header><div><span>${date===today()?'Hoje':date==='Sem data'?'Sem data':formatDate(date)}</span><strong>${items.length} compromisso${items.length!==1?'s':''}</strong></div><button class="icon-btn" data-action="new-appointment" data-date="${attr(date==='Sem data'?today():date)}">${icon('plus')}</button></header><div class="list">${items.map(appointmentRow).join('')}</div></article>`).join(''):'<div class="empty">Nenhum agendamento encontrado.</div>'}</section>`;
  }
  if(mode==='compact'){
    const upcoming=list.filter(a=>(a.date||'')>=today()).slice(0,60);
    return header+`<section class="agenda-compact-grid" data-view-content="agenda">${upcoming.map(a=>`<article class="agenda-compact-card"><div class="agenda-compact-date"><strong>${String((a.date||'').slice(8,10)||'--')}</strong><span>${a.date?new Intl.DateTimeFormat('pt-BR',{month:'short'}).format(new Date(`${a.date}T12:00:00`)):'sem data'}</span></div><div><small>${esc(a.time||'--:--')} · ${esc(a.location||'Sem local')}</small><h3>${esc(a.title||findClient(a.clientId)?.name||'Compromisso')}</h3><p>${esc(findClient(a.clientId)?.name||a.clientName||'Sem cliente')}</p>${statusBadge(a.status||'Agendado')}</div><div class="agenda-card-actions"><button class="icon-btn" data-action="edit-appointment" data-id="${attr(a.id)}">${icon('edit')}</button></div></article>`).join('')||'<div class="empty">Nenhum agendamento futuro.</div>'}</section>`;
  }
  const [year,month]=AGENDA_CURSOR.split('-').map(Number),first=new Date(year,month-1,1),gridStart=new Date(year,month-1,1-first.getDay()),byDate={};
  list.forEach(a=>(byDate[a.date]||=[]).push(a));
  const cells=Array.from({length:42},(_,i)=>{const d=new Date(gridStart);d.setDate(gridStart.getDate()+i);const key=dateIsoLocal(d),items=(byDate[key]||[]).slice(0,3),outside=d.getMonth()!==month-1,isToday=key===today(),selected=key===AGENDA_SELECTED;return `<button type="button" class="calendar-day ${outside?'outside':''} ${isToday?'today':''} ${selected?'selected':''}" data-action="agenda-select-day" data-date="${key}"><span class="calendar-day-number">${d.getDate()}</span><span class="calendar-events">${items.map(a=>`<span class="calendar-event ${norm(a.status).includes('cancel')?'cancelled':norm(a.status).includes('conclu')?'done':''}"><b>${esc(a.time||'')}</b> ${esc(a.title||a.clientName||'Compromisso')}</span>`).join('')}${(byDate[key]||[]).length>3?`<span class="calendar-more">+${(byDate[key]||[]).length-3} mais</span>`:''}</span></button>`;}).join('');
  return header+`<div class="google-calendar-layout" data-view-content="agenda"><section class="google-calendar card"><div class="calendar-weekdays">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></section><aside class="calendar-day-panel card"><div class="card-header"><div><h2>${AGENDA_SELECTED===today()?'Hoje':formatDate(AGENDA_SELECTED)}</h2><p>${selectedItems.length} compromisso${selectedItems.length!==1?'s':''} neste dia.</p></div><button class="icon-btn" data-action="new-appointment" data-date="${attr(AGENDA_SELECTED)}">${icon('plus')}</button></div>${selectedItems.length?`<div class="list">${selectedItems.map(appointmentRow).join('')}</div>`:`<div class="empty calendar-empty">${icon('agenda',36)}<div>Dia livre.</div><button class="btn secondary compact" data-action="new-appointment" data-date="${attr(AGENDA_SELECTED)}">Agendar atendimento</button></div>`}</aside></div>`;
}
function appointmentRow(a){const c=findClient(a.clientId),o=a.orderId?findOrder(a.orderId):null;return `<div class="list-row"><div class="badge blue">${formatDate(a.date)}<br>${esc(a.time||'')}</div><div class="list-row-main"><strong>${esc(a.title||c?.name||'Compromisso')}</strong><small>${esc(c?.name||a.clientName||'Sem cliente')} · ${esc(a.location||'Sem local')}${o?` · ${esc(o.id)}`:''}</small></div><div class="list-row-side">${statusBadge(a.status||'Agendado')}</div><div class="list-row-actions">${o?`<button class="icon-btn" title="Abrir OSV" data-action="view-order" data-id="${attr(o.id)}">${icon('orders')}</button>`:`<button class="icon-btn" title="Converter em OSV" data-action="appointment-to-order" data-id="${attr(a.id)}">${icon('orders')}</button>`}<button class="icon-btn" title="Editar" data-action="edit-appointment" data-id="${attr(a.id)}">${icon('edit')}</button><button class="icon-btn danger" title="Excluir" data-action="delete-appointment" data-id="${attr(a.id)}">${icon('trash')}</button></div></div>`;}
function renderClients(){
  const mode=getViewMode('clients');
  const all=[...data().clients].filter(c=>matches(c.id,c.name,c.document,c.phone,c.city,c.address,c.notes));
  const clients=all.filter(c=>SHOW_ARCHIVED.clients?c.status==='Inativo':c.status!=='Inativo').sort((a,b)=>(a.name||'').localeCompare(b.name||'')),archived=all.filter(c=>c.status==='Inativo').length;
  return `<div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-client">${icon('plus')} Novo Cliente</button><button class="btn secondary" data-action="toggle-archived-clients">${SHOW_ARCHIVED.clients?'Clientes Ativos':`Clientes Arquivados (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('clients',mode)}<span class="badge blue">${clients.length} clientes</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="clients"><div class="table-wrap"><table class="table"><thead><tr><th>Cliente</th><th>Contato</th><th>Cidade</th><th>Ordens</th><th>Total movimentado</th><th></th></tr></thead><tbody>${clients.map(c=>{const os=data().serviceOrders.filter(o=>o.clientId===c.id&&o.registrationStatus!=='Inativo'),total=os.reduce((sum,o)=>sum+num(o.total),0);return `<tr><td><strong>${esc(c.name)}</strong><small class="muted">${esc(c.id)}${c.document?` · ${esc(c.document)}`:''}${c.status==='Inativo'?' · Arquivado':''}</small></td><td>${whatsappNumber(c.phoneNormalized||c.phone)?`<a href="${phoneLink(c.phoneNormalized||c.phone)}" target="_blank">${esc(c.phone)}</a>`:'—'}</td><td>${esc(c.city||'—')}</td><td>${os.length}</td><td><strong>${currency(total)}</strong></td><td><div class="actions"><button title="Visualizar" data-action="view-client" data-id="${attr(c.id)}">${icon('eye')}</button><button title="Editar" data-action="edit-client" data-id="${attr(c.id)}">${icon('edit')}</button><button title="${c.status==='Inativo'?'Restaurar':'Arquivar'}" data-action="toggle-client-status" data-id="${attr(c.id)}">${icon(c.status==='Inativo'?'check':'folder')}</button><button title="Excluir definitivamente" data-action="delete-client" data-id="${attr(c.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||`<tr><td colspan="6"><div class="empty">${icon('clients',42)}<div>Nenhum cliente encontrado.</div></div></td></tr>`}</tbody></table></div></section>`;
}
function renderFinance(){
  const mode=getViewMode('finance'),d=data(),month=today().slice(0,7),list=[...d.payments].filter(p=>!isPaymentCancelled(p)&&matches(p.id,p.code,p.orderId,p.type,p.paymentMethod,p.status,p.notes,findOrder(p.orderId)?.clientName)).sort((a,b)=>(b.paymentDate||b.dueDate||'').localeCompare(a.paymentDate||a.dueDate||''));
  const monthRows=list.filter(p=>monthKey(p.paymentDate||p.dueDate)===month),paidIncome=monthRows.filter(p=>norm(p.type)==='receita'&&norm(p.status)==='pago').reduce((sum,p)=>sum+num(p.value),0),paidExpense=monthRows.filter(p=>norm(p.type)==='despesa'&&norm(p.status)==='pago').reduce((sum,p)=>sum+num(p.value),0),pending=list.filter(p=>norm(p.type)==='receita'&&norm(p.status)!=='pago').reduce((sum,p)=>sum+num(p.value),0);
  return `<div class="grid kpis"><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receitas pagas no mês</small><strong>${currency(paidIncome)}</strong></div></div><div class="card kpi"><div class="kpi-icon red">${icon('finance')}</div><div><small>Despesas pagas no mês</small><strong>${currency(paidExpense)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('finance')}</div><div><small>Saldo do mês</small><strong>${currency(paidIncome-paidExpense)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('agenda')}</div><div><small>A receber</small><strong>${currency(pending)}</strong></div></div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-payment">${icon('plus')} Novo lançamento</button><button class="btn secondary" data-action="export-finance">${icon('download')} Exportar CSV</button></div><div class="toolbar-right">${viewModeSwitcher('finance',mode)}<span class="badge blue">${list.length} lançamentos</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="finance"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Tipo</th><th>Referência</th><th>Forma</th><th>Status</th><th class="text-right">Valor</th><th></th></tr></thead><tbody>${list.map(p=>{const o=findOrder(p.orderId),income=norm(p.type)==='receita';return `<tr><td>${formatDate(p.paymentDate||p.dueDate)}</td><td>${statusBadge(p.type)}</td><td><strong>${esc(o?.clientName||p.orderId||p.notes||'Lançamento')}</strong><small class="muted">${esc(p.code||p.id)}</small></td><td>${esc(p.paymentMethod||'—')}</td><td>${statusBadge(p.status)}</td><td class="text-right"><strong class="${norm(p.type)==='despesa'?'danger-text':'success-text'}">${norm(p.type)==='despesa'?'- ':''}${currency(p.value)}</strong></td><td><div class="actions"><button title="Editar lançamento" data-action="edit-payment" data-id="${attr(p.id)}">${icon('edit')}</button>${income?`<button title="Cancelar venda e remover do Borion" data-action="cancel-payment" data-id="${attr(p.id)}">${icon('warning')}</button>`:''}<button title="Excluir venda definitivamente e remover do Borion" data-action="delete-payment" data-id="${attr(p.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||`<tr><td colspan="7"><div class="empty">Nenhum lançamento encontrado.</div></td></tr>`}</tbody></table></div></section>`;
}
function renderStock(){
  const tab=ACTIVE_TAB.stock,mode=getViewMode('stock');
  return `<div class="toolbar"><div class="toolbar-left"><div class="tabs" style="margin:0"><button class="${tab==='products'?'active':''}" data-action="stock-tab" data-tab="products">Produtos</button><button class="${tab==='supplies'?'active':''}" data-action="stock-tab" data-tab="supplies">Insumos</button><button class="${tab==='movements'?'active':''}" data-action="stock-tab" data-tab="movements">Movimentações</button></div></div><div class="toolbar-right">${viewModeSwitcher('stock',mode)}<button class="btn primary" data-action="new-stock-movement">${icon('plus')} Movimentar estoque</button></div></div>${tab==='products'?stockProducts('stock'):tab==='supplies'?stockSupplies('stock'):stockMovementsView()}`;
}
function stockProducts(section='stock'){
  const mode=getViewMode(section),list=data().products.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.brand,x.supplier)).sort((a,b)=>(a.description||'').localeCompare(b.description||''));
  return `<section class="card view-mode-content mode-${mode}" data-view-content="${attr(section)}"><div class="table-wrap"><table class="table"><thead><tr><th>Produto</th><th>Fornecedor</th><th>Custo</th><th>Venda</th><th>Estoque</th><th>Mínimo</th><th></th></tr></thead><tbody>${list.map(x=>{const st=stockOf('Produto',x.id),low=st<=num(x.minimumStock);return `<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)} · ${esc(x.brand||'Sem marca')}${x.status==='Inativo'?' · Arquivado':''}</small></td><td>${esc(x.supplier||'—')}</td><td>${currency(x.cost)}</td><td>${currency(x.salePrice)}</td><td>${statusBadge(low?`Baixo: ${st}`:`${st}`)}</td><td>${num(x.minimumStock)}</td><td><div class="actions"><button data-action="edit-product" data-id="${attr(x.id)}">${icon('edit')}</button><button title="${x.status==='Inativo'?'Restaurar':'Arquivar'}" data-action="toggle-catalog-status" data-kind="product" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button><button title="Excluir" data-action="delete-catalog-item" data-kind="product" data-id="${attr(x.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="7"><div class="empty">Nenhum produto cadastrado.</div></td></tr>'}</tbody></table></div></section>`;
}
function stockSupplies(section='stock'){
  const mode=getViewMode(section),list=data().supplies.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.brand,x.supplier)).sort((a,b)=>(a.description||'').localeCompare(b.description||''));
  return `<section class="card view-mode-content mode-${mode}" data-view-content="${attr(section)}"><div class="table-wrap"><table class="table"><thead><tr><th>Insumo</th><th>Fornecedor</th><th>Custo</th><th>Estoque</th><th>Mínimo</th><th></th></tr></thead><tbody>${list.map(x=>{const st=stockOf('Insumo',x.id),low=st<=num(x.minimumStock);return `<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)} · ${esc(x.brand||'Sem marca')}${x.status==='Inativo'?' · Arquivado':''}</small></td><td>${esc(x.supplier||'—')}</td><td>${currency(x.cost)}</td><td>${statusBadge(low?`Baixo: ${st}`:`${st}`)}</td><td>${num(x.minimumStock)}</td><td><div class="actions"><button data-action="edit-supply" data-id="${attr(x.id)}">${icon('edit')}</button><button title="${x.status==='Inativo'?'Restaurar':'Arquivar'}" data-action="toggle-catalog-status" data-kind="supply" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button><button title="Excluir" data-action="delete-catalog-item" data-kind="supply" data-id="${attr(x.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="6"><div class="empty">Nenhum insumo cadastrado.</div></td></tr>'}</tbody></table></div></section>`;
}
function stockMovementsView(){
  const mode=getViewMode('stock'),list=[...data().stockMovements].filter(m=>matches(m.id,m.itemType,m.movementType,m.orderId,m.notes,itemForMovement(m)?.description)).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return `<section class="card view-mode-content mode-${mode}" data-view-content="stock"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Item</th><th>Tipo</th><th>Quantidade</th><th>OSV</th><th>Observação</th><th></th></tr></thead><tbody>${list.map(m=>`<tr><td>${formatDate(m.date)}</td><td><strong>${esc(itemForMovement(m)?.description||m.productId||m.supplyId||'—')}</strong><small class="muted">${esc(m.itemType)}${m.sourceItemId?' · Automática':' · Manual'}</small></td><td>${statusBadge(m.movementType)}</td><td>${num(m.quantity)}</td><td>${m.orderId?`<button class="btn ghost compact" data-action="view-order" data-id="${attr(m.orderId)}">${esc(m.orderId)}</button>`:'—'}</td><td>${esc(m.notes||'—')}</td><td><div class="actions">${m.sourceItemId?`<button title="Edite a OSV de origem" data-action="view-order" data-id="${attr(m.orderId)}">${icon('link')}</button>`:`<button title="Editar" data-action="edit-stock-movement" data-id="${attr(m.id)}">${icon('edit')}</button><button title="Excluir" data-action="delete-stock-movement" data-id="${attr(m.id)}">${icon('trash')}</button>`}</div></td></tr>`).join('')||'<tr><td colspan="7"><div class="empty">Nenhuma movimentação cadastrada.</div></td></tr>'}</tbody></table></div></section>`;
}
function itemForMovement(m){return m.itemType==='Produto'?data().products.find(x=>x.id===m.productId):data().supplies.find(x=>x.id===m.supplyId);}
function renderCatalog(){
  const tab=ACTIVE_TAB.catalog,mode=getViewMode('catalog'),archived=[...data().products,...data().services,...data().supplies].filter(x=>x.status==='Inativo').length;
  return `<div class="toolbar"><div class="toolbar-left"><div class="tabs" style="margin:0"><button class="${tab==='services'?'active':''}" data-action="catalog-tab" data-tab="services">Serviços</button><button class="${tab==='products'?'active':''}" data-action="catalog-tab" data-tab="products">Produtos</button><button class="${tab==='supplies'?'active':''}" data-action="catalog-tab" data-tab="supplies">Insumos</button></div><button class="btn secondary" data-action="toggle-archived-catalog">${SHOW_ARCHIVED.catalog?'Ver ativos':`Arquivados (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('catalog',mode)}<button class="btn primary" data-action="new-catalog-item">${icon('plus')} Novo cadastro</button></div></div>${tab==='services'?catalogServices():tab==='products'?stockProducts('catalog'):stockSupplies('catalog')}`;
}
function catalogServices(){
  const mode=getViewMode('catalog'),list=data().services.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.price)).sort((a,b)=>(a.description||'').localeCompare(b.description||''));
  return `<section class="card view-mode-content mode-${mode}" data-view-content="catalog"><div class="table-wrap"><table class="table"><thead><tr><th>Serviço</th><th>Preço padrão</th><th>Status</th><th></th></tr></thead><tbody>${list.map(x=>`<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)}${x.status==='Inativo'?' · Arquivado':''}</small></td><td>${typeof x.price==='number'?currency(x.price):esc(x.price||'Orçamento individual')}</td><td>${statusBadge(x.status)}</td><td><div class="actions"><button data-action="edit-service" data-id="${attr(x.id)}">${icon('edit')}</button><button title="${x.status==='Inativo'?'Restaurar':'Arquivar'}" data-action="toggle-catalog-status" data-kind="service" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button><button title="Excluir" data-action="delete-catalog-item" data-kind="service" data-id="${attr(x.id)}">${icon('trash')}</button></div></td></tr>`).join('')||'<tr><td colspan="4"><div class="empty">Nenhum serviço cadastrado.</div></td></tr>'}</tbody></table></div></section>`;
}
function renderDocuments(){
  const d=data(),tab=ACTIVE_TAB.documents||'consents',mode=getViewMode('documents');
  const terms=[...d.consents].filter(c=>matches(c.id,c.clientName,c.title,c.orderId,c.status,c.text)).sort((a,b)=>(b.createdAt||b.date||'').localeCompare(a.createdAt||a.date||''));
  const docs=d.serviceOrders.flatMap(o=>[...(o.pdfs||[]).map(m=>({...m,orderId:o.id,clientName:o.clientName,kind:'PDF'})),...(o.attachments||[]).map(m=>({...m,orderId:o.id,clientName:o.clientName,kind:'Anexo'}))]).filter(m=>matches(m.fileName,m.orderId,m.clientName,m.kind));
  const table=tab==='consents'?`<section class="card view-mode-content mode-${mode}" data-view-content="documents"><div class="table-wrap"><table class="table"><thead><tr><th>Termo</th><th>Cliente</th><th>OSV</th><th>Data</th><th>Status</th><th></th></tr></thead><tbody>${terms.map(c=>`<tr><td><strong>${esc(c.title||'Autorização de serviço')}</strong><small class="muted">${esc(c.id)}</small></td><td>${esc(c.clientName||findClient(c.clientId)?.name||'—')}</td><td>${c.orderId?`<button class="btn ghost compact" data-action="view-order" data-id="${attr(c.orderId)}">${esc(c.orderId)}</button>`:'—'}</td><td>${formatDate(c.acceptedAt||c.createdAt)}</td><td>${statusBadge(c.accepted?'Aceito':c.status||'Pendente')}</td><td><div class="actions"><button title="Imprimir / salvar PDF" data-action="print-consent" data-id="${attr(c.id)}">${icon('pdf')}</button><button title="Editar" data-action="edit-consent" data-id="${attr(c.id)}">${icon('edit')}</button><button title="Excluir" data-action="delete-consent" data-id="${attr(c.id)}">${icon('trash')}</button></div></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhum termo cadastrado.</div></td></tr>'}</tbody></table></div></section>`:`<section class="card view-mode-content mode-${mode}" data-view-content="documents"><div class="table-wrap"><table class="table"><thead><tr><th>Arquivo</th><th>Tipo</th><th>OSV</th><th>Cliente</th><th>Data</th><th></th></tr></thead><tbody>${docs.map(m=>`<tr><td><strong>${esc(m.fileName||'Arquivo')}</strong><small class="muted">${m.driveFileId?'Google Drive':m.localKey?'Local':'Mídia pendente'}</small></td><td>${statusBadge(m.kind)}</td><td><button class="btn ghost compact" data-action="view-order" data-id="${attr(m.orderId)}">${esc(m.orderId)}</button></td><td>${esc(m.clientName||'—')}</td><td>${formatDate(m.createdAt)}</td><td><div class="actions"><button title="Abrir" data-action="open-order-file" data-order="${attr(m.orderId)}" data-media="${attr(m.id)}">${icon('eye')}</button><button title="Excluir" data-action="delete-media" data-order="${attr(m.orderId)}" data-media="${attr(m.id)}">${icon('trash')}</button></div></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty">Nenhum arquivo vinculado.</div></td></tr>'}</tbody></table></div></section>`;
  return `<div class="grid kpis"><div class="card kpi"><div class="kpi-icon orange">${icon('signature')}</div><div><small>Termos</small><strong>${terms.length}</strong><div class="delta">${terms.filter(x=>x.accepted).length} aceitos</div></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('pdf')}</div><div><small>PDFs e anexos</small><strong>${docs.length}</strong><div class="delta">Vinculados às ordens</div></div></div><div class="card kpi"><div class="kpi-icon green">${icon('check')}</div><div><small>Aceites registrados</small><strong>${terms.filter(x=>x.accepted).length}</strong></div></div><div class="card kpi"><div class="kpi-icon red">${icon('warning')}</div><div><small>Pendentes</small><strong>${terms.filter(x=>!x.accepted).length}</strong></div></div></div><div class="toolbar"><div class="toolbar-left"><div class="tabs" style="margin:0"><button class="${tab==='consents'?'active':''}" data-action="documents-tab" data-tab="consents">Termos e autorizações</button><button class="${tab==='files'?'active':''}" data-action="documents-tab" data-tab="files">Arquivos das OSVs</button></div></div><div class="toolbar-right">${viewModeSwitcher('documents',mode)}${tab==='consents'?`<button class="btn primary" data-action="new-consent">${icon('plus')} Novo termo</button>`:''}</div></div>${table}`;
}
function renderSettings(){
  const c=company(),drive=GoogleDriveMarco.cachedUser(),diag=integrityReport();
  return `<div class="grid two"><section class="card"><div class="card-header"><div><h2>Dados da empresa</h2><p>Usados nas ordens, termos e PDFs.</p></div><button class="btn secondary compact" data-action="edit-company">${icon('edit')} Editar</button></div><div class="definition-list"><dt>Nome</dt><dd><strong>${esc(c.name||'Marco Iris Soluções em Tecnologia')}</strong></dd><dt>Telefone</dt><dd>${esc(c.phone||'—')}</dd><dt>E-mail</dt><dd>${esc(c.email||'—')}</dd><dt>Instagram</dt><dd>${esc(c.instagram||'—')}</dd><dt>Endereço</dt><dd>${esc([c.address,c.number,c.neighborhood,c.city].filter(Boolean).join(', ')||'—')}</dd></div></section><section class="card"><div class="card-header"><div><h2>Diagnóstico do sistema</h2><p>Verifica vínculos, totais, estoque e IDs.</p></div>${diag.total?statusBadge(`${diag.total} alerta(s)`):statusBadge('Tudo íntegro')}</div>${diag.issues.length?`<div class="diagnostic-list">${diag.issues.map(i=>`<div class="diagnostic-row ${i.type}"><div>${icon(i.type==='danger'?'warning':'link')}</div><div><strong>${i.count} · ${esc(i.label)}</strong><small>${esc(i.detail)}</small></div></div>`).join('')}</div>`:'<div class="empty compact-empty">Nenhuma inconsistência estrutural encontrada.</div>'}<div class="toolbar" style="margin:16px 0 0"><div class="toolbar-left"><button class="btn primary" data-action="repair-links">${icon('check')} Corrigir vínculos seguros</button></div></div></section><section class="card"><div class="card-header"><div><h2>Google Drive</h2><p>Dados, fotos, PDFs e anexos organizados automaticamente.</p></div>${drive?statusBadge('Conectado'):statusBadge('Pronto para conectar')}</div><div class="cloud-folders">${[['data','Dados'],['backups','Backups'],['photos','Fotos_OSV'],['pdfs','Ordens de Serviço'],['attachments','Anexos']].map(([k,n])=>`<div class="cloud-folder">${icon('folder')}<strong>${n}</strong><small>${GoogleDriveMarco.cachedStructure()?.[k]?'Pronta':'Será criada'}</small></div>`).join('')}</div><div class="toolbar" style="margin:16px 0 0"><div class="toolbar-left">${drive?`<button class="btn secondary" data-action="sync-google">${icon('cloud')} Sincronizar</button><button class="btn secondary" data-action="load-google">${icon('download')} Carregar</button><button class="btn danger" data-action="disconnect-google">Desconectar</button>`:`<button class="btn primary" data-action="connect-google">${icon('cloud')} Conectar com Google</button>`}</div></div>${drive?`<p class="small muted">Conta: ${esc(drive.email)}</p>`:'<p class="small muted">Clique em conectar, escolha a conta Google do Marco e selecione a pasta principal do sistema.</p>'}</section><section class="card"><div class="card-header"><div><h2>Migração do AppSheet</h2><p>Importe primeiro o JSON privado e depois a pasta com fotos e PDFs.</p></div></div><div class="list"><button class="list-row" data-action="import-json"><div class="kpi-icon blue">${icon('upload')}</div><div class="list-row-main"><strong>Importar dados privados</strong><small>Clientes, OSVs, itens, pagamentos, produtos, serviços e estoque.</small></div>${icon('arrow')}</button><button class="list-row" data-action="import-media"><div class="kpi-icon orange">${icon('camera')}</div><div class="list-row-main"><strong>Importar fotos, PDFs e anexos</strong><small>Os arquivos serão vinculados pelo número da OSV.</small></div>${icon('arrow')}</button></div></section><section class="card"><div class="card-header"><div><h2>Base oficial na nuvem</h2><p>Clientes, OSVs, lançamentos, fotos e exclusões dependem 100% do Google Drive.</p></div>${statusBadge('Drive obrigatório')}</div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="manual-save">${icon('save')} Criar backup no Drive</button><button class="btn secondary" data-action="export-json">${icon('download')} Exportar cópia JSON</button></div></div><p class="small muted">Não existe base local nem modo offline. Sem internet o aplicativo é bloqueado.</p></section><section class="card"><div class="card-header"><div><h2>Proteção de acesso</h2><p>Trava a interface deste dispositivo com um PIN.</p></div>${activeProfile().pin?statusBadge('PIN ativo'):statusBadge('Sem PIN')}</div><div class="toolbar"><div class="toolbar-left"><button class="btn secondary" data-action="set-pin">${icon('lock')} ${activeProfile().pin?'Alterar PIN':'Definir PIN'}</button>${activeProfile().pin?`<button class="btn secondary" data-action="lock-now">Bloquear agora</button><button class="btn danger" data-action="remove-pin">Remover PIN</button>`:''}</div></div></section><section class="card"><div class="card-header"><div><h2>Preferências</h2><p>Comportamento deste perfil.</p></div></div><label class="list-row"><div class="list-row-main"><strong>Ocultar valores no painel</strong><small>Mostra •••• no lugar de valores e contagens.</small></div><input type="checkbox" data-setting="dashboardPrivacy" ${data().settings.dashboardPrivacy?'checked':''}></label><label class="list-row"><div class="list-row-main"><strong>Impedir estoque negativo</strong><small>Bloqueia saídas manuais acima do saldo disponível.</small></div><input type="checkbox" data-setting="preventNegativeStock" ${data().settings.preventNegativeStock?'checked':''}></label><div class="list-row"><div class="list-row-main"><strong>Google Drive obrigatório</strong><small>Toda alteração é confirmada na nuvem antes de permanecer no sistema.</small></div>${statusBadge('Sempre ativo')}</div><div class="list-row"><div class="list-row-main"><strong>Armazenamento local</strong><small>Desativado para impedir conflitos, dados antigos e registros ressuscitando.</small></div>${statusBadge('Desativado')}</div></section><section class="card"><div class="card-header"><div><h2>Histórico de ações</h2><p>Últimas alterações registradas.</p></div></div><div class="audit-list">${data().audit.slice(0,60).map(a=>`<div class="audit-row"><time>${formatDateTime(a.date)}</time><div><strong>${esc(a.action)}</strong><small>${esc(a.detail||'')}</small></div></div>`).join('')||'<div class="empty">Sem histórico.</div>'}</div></section></div>`;
}
function openModal(title,content,wide=false){
  const root=$('#modal-root');
  const active=document.activeElement;
  if(active&&active!==document.body&&active.closest?.('#modal-root'))active.blur();
  document.body.classList.remove('modal-field-active','keyboard-open');
  document.body.classList.add('modal-open');
  MarcoScrollLock.sync();
  const modalKind=/data-form=["']order["']/.test(content)?'order-modal':/data-form=["']pin["']/.test(content)?'pin-modal':'';
  root.innerHTML=`<div class="modal-backdrop"><section class="modal ${wide?'wide':''} ${modalKind}" role="dialog" aria-modal="true"><header class="modal-header"><h2>${esc(title)}</h2><button class="modal-close" data-action="close-modal">${icon('close')}</button></header><div class="modal-body">${content}</div></section></div>`;
  const backdrop=root.querySelector('.modal-backdrop');
  requestAnimationFrame(()=>backdrop?.classList.add('is-open'));
  setTimeout(()=>backdrop?.classList.add('is-open'),60);
  setTimeout(()=>{
    if(!backdrop||!backdrop.isConnected)return;
    const modal=backdrop.querySelector('.modal');
    if(Number.parseFloat(getComputedStyle(backdrop).opacity)<.05){
      backdrop.style.setProperty('opacity','1','important');
      modal?.style.setProperty('opacity','1','important');
      modal?.style.setProperty('transform','none','important');
    }
  },140);
}
function closeModal(immediate=false){
  const root=$('#modal-root'),backdrop=root.querySelector('.modal-backdrop');
  if(!backdrop)return;
  if(immediate){root.innerHTML='';document.body.classList.remove('modal-open','modal-field-active','keyboard-open');MarcoScrollLock.sync();return;}
  backdrop.style.removeProperty('opacity');
  const modal=backdrop.querySelector('.modal');modal?.style.removeProperty('opacity');modal?.style.removeProperty('transform');
  backdrop.classList.add('is-closing');
  setTimeout(()=>{if(root.firstElementChild===backdrop){root.innerHTML='';document.body.classList.remove('modal-open','modal-field-active','keyboard-open');MarcoScrollLock.sync();}},230);
}
function field(label,name,value='',type='text',extra=''){return `<div class="field"><label>${label}</label><input name="${name}" type="${type}" value="${attr(value)}" ${extra}></div>`;}
function textarea(label,name,value='',full=false){return `<div class="field ${full?'full':''}"><label>${label}</label><textarea name="${name}">${esc(value)}</textarea></div>`;}
function selectField(label,name,options,value='',extra=''){return `<div class="field"><label>${label}</label><select name="${name}" ${extra}>${options.map(o=>{const v=typeof o==='string'?o:o.value,l=typeof o==='string'?o:o.label;return `<option value="${attr(v)}" ${String(v)===String(value)?'selected':''}>${esc(l)}</option>`;}).join('')}</select></div>`;}

function openClientDetail(id){const c=findClient(id);if(!c)return;const orders=data().serviceOrders.filter(o=>o.clientId===id&&o.registrationStatus!=='Inativo').sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||''));const terms=data().consents.filter(x=>x.clientId===id),paid=data().payments.filter(p=>orders.some(o=>o.id===p.orderId)&&['pago','parcial'].includes(norm(p.status))&&norm(p.type)==='receita').reduce((s,p)=>s+num(p.value),0);openModal(c.name,`<div class="detail-hero"><h2>${esc(c.name)}</h2><p>${esc(c.id)} · ${esc(c.city||'Cidade não informada')}</p><div class="detail-meta"><span>${orders.length} ordens</span><span>${currency(paid)} recebidos</span><span>${terms.length} termo(s)</span><span>${esc(c.phone||'Sem telefone')}</span></div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-order" data-client="${attr(c.id)}">${icon('plus')} Nova OSV</button>${whatsappNumber(c.phoneNormalized||c.phone)?`<a class="btn success" href="${phoneLink(c.phoneNormalized||c.phone)}" target="_blank">${icon('phone')} WhatsApp</a>`:''}<button class="btn secondary" data-action="new-consent" data-client="${attr(c.id)}">${icon('signature')} Novo termo</button><button class="btn secondary" data-action="edit-client" data-id="${attr(c.id)}">${icon('edit')} Editar</button><button class="btn danger" data-action="delete-client" data-id="${attr(c.id)}">${icon('trash')} Excluir</button></div></div><div class="grid two"><section class="card"><div class="card-header"><h3>Dados cadastrais</h3></div><dl class="definition-list"><dt>Documento</dt><dd>${esc(c.document||'—')}</dd><dt>Telefone</dt><dd>${esc(c.phone||'—')}</dd><dt>Endereço</dt><dd>${esc([c.address,c.number,c.neighborhood,c.complement,c.city,c.zip].filter(Boolean).join(', ')||'—')}</dd><dt>Cadastro</dt><dd>${formatDate(c.createdAt)}</dd><dt>Observação</dt><dd>${esc(c.notes||'—')}</dd></dl></section><section class="card"><div class="card-header"><h3>Histórico de ordens</h3></div>${orders.length?`<div class="list">${orders.map(o=>`<button class="list-row" data-action="view-order" data-id="${attr(o.id)}" style="width:100%;text-align:left"><div class="list-row-main"><strong>${esc(o.id)} · ${esc(o.equipmentType||'Equipamento')}</strong><small>${formatDate(o.openedAt)} · ${esc(o.brandModel||'')}</small></div><div class="list-row-side"><strong>${currency(o.total)}</strong>${statusBadge(o.status)}</div></button>`).join('')}</div>`:'<div class="empty">Nenhuma OS deste cliente.</div>'}</section></div>`,true);}
function openOrderDetail(id){
  const o=findOrder(id);if(!o)return;const c=findClient(o.clientId)||{id:'',name:o.clientName};const items=orderItems(id),pays=orderPayments(id).filter(p=>!isPaymentCancelled(p)),terms=orderConsentItems(id);const paid=realizedPaymentValue(id),remaining=Math.max(0,num(o.total)-paid);
  const itemsHtml=items.length?items.map(it=>`<tr><td><strong>${esc(itemDescription(it))}</strong><small class="muted">${esc(it.type)}${it.lowerStock?' · Baixa de estoque':''}</small></td><td>${num(it.quantity)}</td><td>${currency(it.unitPrice)}</td><td><strong>${currency(it.subtotal)}</strong></td></tr>`).join(''):'<tr><td colspan="4">Nenhum item.</td></tr>';
  const paysHtml=pays.length?`<div class="list">${pays.map(p=>`<div class="list-row"><div class="list-row-main"><strong>${currency(p.value)} · ${esc(p.paymentMethod||'—')}</strong><small>Venc. ${formatDate(p.dueDate)} · Pag. ${formatDate(p.paymentDate)}</small></div>${statusBadge(p.status)}<button class="icon-btn" data-action="edit-payment" data-id="${attr(p.id)}">${icon('edit')}</button><button class="icon-btn danger" data-action="delete-payment" data-id="${attr(p.id)}">${icon('trash')}</button></div>`).join('')}</div>`:'<div class="empty">Nenhum pagamento vinculado.</div>';
  const photos=o.photos||[],pdfs=o.pdfs||[],attachments=o.attachments||[];
  const photosHtml=photos.length?`<div class="media-grid">${photos.map(m=>`<div class="media-card"><img alt="${attr(m.fileName||'Foto da OS')}" data-media-id="${attr(m.id)}"><div class="media-overlay">${esc(m.fileName||'Foto')}</div><button data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash',15)}</button></div>`).join('')}</div>`:`<div class="upload-zone"><div>${icon('camera',36)}</div><p>Nenhuma foto vinculada.</p><button class="btn secondary compact" data-action="add-order-photos" data-id="${attr(o.id)}">Adicionar fotos</button></div>`;
  const pdfsHtml=pdfs.length?`<div class="list">${pdfs.map(m=>`<div class="list-row"><div class="kpi-icon red">${icon('pdf')}</div><button class="list-row-main file-link" data-action="open-order-file" data-order="${attr(o.id)}" data-media="${attr(m.id)}"><strong>${esc(m.fileName||'Ordem de serviço.pdf')}</strong><small>${m.driveFileId?'Disponível no Drive':m.localKey?'Disponível localmente':'Aguardando importação'}</small></button><button class="icon-btn danger" data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash')}</button></div>`).join('')}</div>`:'<div class="empty">Nenhum PDF gerado.</div>';
  const attachmentsHtml=attachments.length?`<div class="list">${attachments.map(m=>`<div class="list-row"><div class="kpi-icon blue">${icon('documents')}</div><button class="list-row-main file-link" data-action="open-order-file" data-order="${attr(o.id)}" data-media="${attr(m.id)}"><strong>${esc(m.fileName||'Anexo')}</strong><small>${m.driveFileId?'Disponível no Drive':m.localKey?'Disponível localmente':'Aguardando envio'}</small></button><button class="icon-btn danger" data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash')}</button></div>`).join('')}</div>`:'<div class="empty">Nenhum anexo.</div>';
  const termsHtml=terms.length?`<div class="list">${terms.map(t=>`<div class="list-row"><div class="kpi-icon orange">${icon('signature')}</div><div class="list-row-main"><strong>${esc(t.title||'Autorização de serviço')}</strong><small>${t.accepted?'Aceito em '+formatDate(t.acceptedAt):'Pendente de aceite'}</small></div>${statusBadge(t.accepted?'Aceito':'Pendente')}<button class="icon-btn" data-action="print-consent" data-id="${attr(t.id)}">${icon('pdf')}</button><button class="icon-btn" data-action="edit-consent" data-id="${attr(t.id)}">${icon('edit')}</button><button class="icon-btn danger" data-action="delete-consent" data-id="${attr(t.id)}">${icon('trash')}</button></div>`).join('')}</div>`:'<div class="empty">Nenhum termo vinculado.</div>';
  const content=`<div class="detail-hero"><div class="toolbar" style="margin:0"><div><h2>${esc(o.id)} · ${esc(c.name||o.clientName||'Cliente')}</h2><p>${esc(o.equipmentType||'Equipamento não informado')} ${o.brandModel?`· ${esc(o.brandModel)}`:''}</p></div><div>${statusBadge(o.status)}</div></div><div class="detail-meta"><span>Abertura ${formatDate(o.openedAt)}</span><span>${items.length} itens</span><span>${currency(o.total)}</span><span>${paymentStatus(o)}</span>${o.registrationStatus==='Inativo'?'<span>Arquivada</span>':''}</div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="edit-order" data-id="${attr(o.id)}">${icon('edit')} Editar OS</button><button class="btn secondary" data-action="new-payment" data-order="${attr(o.id)}">${icon('plus')} Pagamento</button><button class="btn secondary" data-action="add-order-photos" data-id="${attr(o.id)}">${icon('camera')} Fotos</button><button class="btn secondary" data-action="add-order-files" data-id="${attr(o.id)}">${icon('upload')} Anexos</button><button class="btn secondary" data-action="new-consent" data-order="${attr(o.id)}" data-client="${attr(o.clientId)}">${icon('signature')} Termo</button><button class="btn secondary" data-action="generate-pdf" data-id="${attr(o.id)}">${icon('pdf')} Gerar PDF</button><button class="btn success" data-action="share-order" data-id="${attr(o.id)}">${icon('phone')} WhatsApp do cliente</button><button class="btn danger" data-action="delete-order" data-id="${attr(o.id)}">${icon('trash')} Excluir OS</button></div></div><div class="detail-grid"><div><section class="card"><div class="card-header"><h3>Equipamento e diagnóstico</h3></div><dl class="definition-list"><dt>Cliente</dt><dd><button class="btn ghost compact" data-action="view-client" data-id="${attr(c.id||'')}">${esc(c.name||o.clientName||'—')}</button></dd><dt>Equipamento</dt><dd>${esc(o.equipmentType||'—')}</dd><dt>Marca / Modelo</dt><dd>${esc(o.brandModel||'—')}</dd><dt>Número de série</dt><dd>${esc(o.serialNumber||'—')}</dd><dt>Senha de acesso</dt><dd>${esc(o.accessPassword||'—')}</dd><dt>Acessórios</dt><dd>${esc(o.accessories||'—')}</dd><dt>Defeito relatado</dt><dd>${esc(o.reportedIssue||'—')}</dd><dt>Laudo técnico</dt><dd>${esc(o.technicalReport||'—')}</dd><dt>Observação ao cliente</dt><dd>${esc(o.clientNotes||'—')}</dd><dt>Observação interna</dt><dd>${esc(o.internalNotes||'—')}</dd></dl></section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>Itens e serviços</h3><p>Total calculado menos descontos.</p></div></div><div class="table-wrap"><table class="table" style="min-width:600px"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Subtotal</th></tr></thead><tbody>${itemsHtml}</tbody></table></div><div style="text-align:right;margin-top:14px"><div class="muted">Descontos: ${currency(o.discount)}</div><strong style="font-size:1.35rem">Total: ${currency(o.total)}</strong></div></section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>Termos e autorizações</h3><p>${terms.length} termo(s) vinculado(s).</p></div></div>${termsHtml}</section></div><div><section class="card"><div class="card-header"><div><h3>Financeiro</h3><p>${currency(paid)} realizado · ${currency(remaining)} restante.</p></div></div>${paysHtml}</section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>Fotos</h3><p>${photos.length} arquivo(s) vinculado(s).</p></div></div>${photosHtml}</section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>PDFs da OS</h3><p>Documentos gerados ou migrados.</p></div></div>${pdfsHtml}</section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>Anexos técnicos</h3><p>Drivers, laudos, notas, arquivos e documentos.</p></div></div>${attachmentsHtml}</section></div></div>`;
  openModal(`Ordem ${o.id}`,content,true);hydrateMediaImages();
}
function openClientForm(id=''){const c=id?findClient(id):null;openModal(c?'Editar cliente':'Novo cliente',`<form data-form="client" data-id="${attr(id)}"><div class="form-grid three">${field('Nome *','name',c?.name||'','','required')}${field('CPF / CNPJ','document',c?.document||'')}${field('Telefone','phone',c?.phone||'','tel')}${field('Cidade','city',c?.city||'')}${field('Endereço','address',c?.address||'')}${field('Número','number',c?.number||'')}${field('Bairro','neighborhood',c?.neighborhood||'')}${field('Complemento','complement',c?.complement||'')}${field('CEP','zip',c?.zip||'')}${textarea('Observação interna','notes',c?.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar cliente</button></div></form>`,true);}
function clientOptions(selected=''){return `<option value="">Selecione um cliente</option>${data().clients.filter(c=>c.status!=='Inativo').sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(c=>`<option value="${attr(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)} · ${esc(c.phone||c.id)}</option>`).join('')}`;}
function itemReferenceOptions(type,selected=''){let list=type==='Produto'?data().products:type==='Insumo'?data().supplies:data().services;return `<option value="">Selecione</option>${list.filter(x=>x.status!=='Inativo').map(x=>`<option value="${attr(x.id)}" ${x.id===selected?'selected':''}>${esc(x.description||x.name||x.id)}</option>`).join('')}`;}
function orderItemRow(it={}){const type=it.type||'Serviço',ref=it.productId||it.serviceId||it.supplyId||'';return `<div class="item-editor-row" data-item-id="${attr(it.id||'')}"><div class="field"><label>Tipo</label><select data-item-field="type"><option ${type==='Serviço'?'selected':''}>Serviço</option><option ${type==='Produto'?'selected':''}>Produto</option><option ${type==='Insumo'?'selected':''}>Insumo</option></select></div><div class="field"><label>Item</label><select data-item-field="ref">${itemReferenceOptions(type,ref)}</select></div><div class="field"><label>Qtd.</label><input type="number" step="0.01" min="0" data-item-field="qty" value="${attr(it.quantity||1)}"></div><div class="field"><label>Valor unit.</label><input type="number" step="0.01" min="0" data-item-field="price" value="${attr(it.unitPrice||0)}"></div><div class="field"><label>Subtotal</label><input readonly data-item-field="subtotal" value="${attr(num(it.subtotal||num(it.quantity||1)*num(it.unitPrice||0)).toFixed(2))}"></div><label class="checkbox" title="Baixar estoque"><input type="checkbox" data-item-field="stock" ${it.lowerStock?'checked':''}> Estoque</label><button type="button" class="icon-btn" data-action="remove-item-row">${icon('trash')}</button></div>`;}
function openOrderForm(id='',prefill={}){const o=id?findOrder(id):null;const items=o?orderItems(id):[];const base=o||{openedAt:today(),status:'Em análise',clientId:prefill.clientId||'',clientName:prefill.clientName||'',equipmentType:prefill.equipmentType||'',reportedIssue:prefill.reportedIssue||'',internalNotes:prefill.internalNotes||'',sourceAppointmentId:prefill.sourceAppointmentId||''};const statuses=['Em análise','Aguardando aprovação','Em andamento','Aguardando peça','Pronto para retirada','Concluído','Cancelado'];openModal(o?`Editar ${o.id}`:'Nova OSV',`<form data-form="order" data-id="${attr(id)}"><input type="hidden" name="sourceAppointmentId" value="${attr(base.sourceAppointmentId||'')}"><div class="form-grid three"><div class="field"><label>Cliente *</label><select name="clientId" required>${clientOptions(base.clientId)}</select></div>${field('Data de abertura','openedAt',base.openedAt||today(),'date','required')}${field('Data de conclusão','completedAt',base.completedAt||'','date')}${selectField('Status','status',statuses,base.status||'Em análise')}${field('Tipo de equipamento','equipmentType',base.equipmentType||'')}${field('Marca / Modelo','brandModel',base.brandModel||'')}${field('Número de série','serialNumber',base.serialNumber||'')}${field('Senha de acesso','accessPassword',base.accessPassword||'')}${field('Acessórios deixados','accessories',base.accessories||'')}${field('Desconto','discount',base.discount||0,'number','step="0.01" min="0"')}${textarea('Defeito relatado','reportedIssue',base.reportedIssue||'',true)}${textarea('Laudo técnico','technicalReport',base.technicalReport||'',true)}${textarea('Observação para o cliente','clientNotes',base.clientNotes||'',true)}${textarea('Observação interna','internalNotes',base.internalNotes||'',true)}</div><div class="form-section"><div class="form-section-title"><div><h3>Itens e serviços</h3><small class="muted">Os subtotais calculam automaticamente o total da OSV.</small></div><button type="button" class="btn secondary compact" data-action="add-item-row">${icon('plus')} Adicionar item</button></div><div id="order-items-editor">${(items.length?items:[{}]).map(orderItemRow).join('')}</div><div style="text-align:right;margin-top:12px"><span class="muted">Total estimado: </span><strong id="order-form-total">${currency(base.total||0)}</strong></div></div><div class="form-section"><div class="form-section-title"><div><h3>Fotos</h3><small class="muted">As imagens são compactadas, guardadas localmente e enviadas para Fotos_OSV quando o Drive está conectado.</small></div></div><div class="field"><input name="photos" type="file" accept="image/*" multiple capture="environment"></div></div><div class="form-section"><div class="form-section-title"><div><h3>Anexos técnicos</h3><small class="muted">PDFs, laudos, notas, arquivos de configuração e outros documentos.</small></div></div><div class="field"><input name="attachments" type="file" multiple></div></div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar ordem</button></div></form>`,true);updateOrderFormTotal();}

function openPaymentForm(id='',orderId=''){const p=id?data().payments.find(x=>x.id===id):null;const base=p||{orderId,type:'Receita',value:orderId?Math.max(0,num(findOrder(orderId)?.total)-orderPayments(orderId).filter(x=>['pago','parcial'].includes(norm(x.status))).reduce((s,x)=>s+num(x.value),0)):0,dueDate:today(),paymentDate:'',status:'Pendente',paymentMethod:'PIX',paymentOrigin:'Carteira',expenseType:'Variável',expenseCategory:'',localPurchase:''};const despesaVisible=norm(base.type)==='despesa';const despesaStyle=despesaVisible?'':'display:none';openModal(p?'Editar lançamento':'Novo lançamento',`<form data-form="payment" data-id="${attr(id)}"><div class="form-grid three">${selectField('Tipo','type',['Receita','Despesa'],base.type,'onchange="toggleMitDespesaFields(this.value)"')}<div class="field"><label>Ordem de serviço</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.slice().reverse().map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||findClient(o.clientId)?.name||'Cliente')}</option>`).join('')}</select></div>${field('Valor *','value',base.value||0,'number','step="0.01" min="0" required')}${selectField('Forma de pagamento','paymentMethod',['PIX','Dinheiro','Débito','Crédito 1x (à Vista)','Crédito 2x','Crédito 3x','Crédito 4x','Boleto','Transferência','Outro'],base.paymentMethod||'PIX')}${field('Data de vencimento','dueDate',base.dueDate||today(),'date')}${field('Data do pagamento','paymentDate',base.paymentDate||'','date')}${selectField('Status','status',['Pendente','Pago','Parcial','Atrasado','Cancelado'],base.status||'Pendente')}<div class="field mit-despesa-only" style="${despesaStyle}"><label>De onde saiu</label><select name="paymentOrigin">${['Carteira','Pix','Débito','Crédito','Reserva'].map(o=>`<option value="${attr(o)}" ${o===(base.paymentOrigin||'Carteira')?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field mit-despesa-only" style="${despesaStyle}"><label>Tipo de despesa</label><select name="expenseType">${['Variável','Fixa'].map(o=>`<option value="${attr(o)}" ${o===(base.expenseType||'Variável')?'selected':''}>${esc(o)}</option>`).join('')}</select></div><div class="field mit-despesa-only" style="${despesaStyle}"><label>Categoria</label><input name="expenseCategory" list="mit-expense-categories" value="${attr(base.expenseCategory||'')}" placeholder="Ex.: Peças, Ferramentas..."></div><div class="field mit-despesa-only" style="${despesaStyle}"><label>Local da compra</label><input name="localPurchase" value="${attr(base.localPurchase||'')}" placeholder="Opcional"></div><datalist id="mit-expense-categories"><option value="Peças"><option value="Ferramentas"><option value="Combustível"><option value="Material de escritório"><option value="Manutenção"><option value="Outro"></datalist>${textarea('Observação','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar lançamento</button></div></form>`,true);}
function toggleMitDespesaFields(type){const show=norm(type)==='despesa';$$('.mit-despesa-only').forEach(el=>{el.style.display=show?'':'none';});}
function openAppointmentForm(id='',prefill={}){
  const a=id?data().appointments.find(x=>x.id===id):null,base=a||{date:prefill.date||AGENDA_SELECTED||today(),time:'09:00',status:'Agendado'};
  openModal(a?'Editar agendamento':'Novo agendamento',`<form data-form="appointment" data-id="${attr(id)}"><div class="form-grid three">${field('Título *','title',base.title||'','text','required')}<div class="field"><label>Cliente</label><select name="clientId">${clientOptions(base.clientId||'')}</select></div>${field('Data *','date',base.date||today(),'date','required')}${field('Horário','time',base.time||'09:00','time')}${selectField('Status','status',['Agendado','Confirmado','Concluído','Cancelado'],base.status||'Agendado')}${field('Local','location',base.location||'')}${textarea('Observações','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar agendamento</button></div></form>`,true);
}
function openProductForm(id=''){const x=id?data().products.find(v=>v.id===id):null;openModal(x?'Editar produto':'Novo produto',`<form data-form="product" data-id="${attr(id)}"><div class="form-grid three">${field('Descrição *','description',x?.description||'','text','required')}${field('Marca','brand',x?.brand||'')}${field('Fornecedor','supplier',x?.supplier||'')}${field('Custo','cost',x?.cost||0,'number','step="0.01" min="0"')}${field('Margem','margin',x?.margin??0.5,'number','step="0.01" min="0"')}${field('Preço de venda','salePrice',x?.salePrice||0,'number','step="0.01" min="0"')}${field('Estoque inicial','initialStock',x?.initialStock||0,'number','step="0.01"')}${field('Estoque mínimo','minimumStock',x?.minimumStock||0,'number','step="0.01" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar produto</button></div></form>`,true);}
function openServiceForm(id=''){const x=id?data().services.find(v=>v.id===id):null;openModal(x?'Editar serviço':'Novo serviço',`<form data-form="service" data-id="${attr(id)}"><div class="form-grid">${field('Descrição *','description',x?.description||'','text','required')}${field('Preço padrão','price',typeof x?.price==='number'?x.price:0,'number','step="0.01" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar serviço</button></div></form>`);}
function openSupplyForm(id=''){const x=id?data().supplies.find(v=>v.id===id):null;openModal(x?'Editar insumo':'Novo insumo',`<form data-form="supply" data-id="${attr(id)}"><div class="form-grid three">${field('Descrição *','description',x?.description||'','text','required')}${field('Marca','brand',x?.brand||'')}${field('Fornecedor','supplier',x?.supplier||'')}${field('Custo','cost',x?.cost||0,'number','step="0.01" min="0"')}${field('Estoque inicial','initialStock',x?.initialStock||0,'number','step="0.01"')}${field('Estoque mínimo','minimumStock',x?.minimumStock||0,'number','step="0.01" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar insumo</button></div></form>`,true);}
function openStockMovementForm(id=''){const m=id?data().stockMovements.find(x=>x.id===id):null;if(m?.sourceItemId)throw new Error('Movimentações automáticas devem ser ajustadas editando a OSV de origem.');const base=m||{itemType:'Produto',movementType:'Entrada',quantity:1,date:today(),orderId:'',notes:''},selected=base.productId||base.supplyId||'';openModal(m?'Editar movimentação':'Movimentar estoque',`<form data-form="stock-movement" data-id="${attr(id)}"><div class="form-grid three">${selectField('Tipo de item','itemType',['Produto','Insumo'],base.itemType||'Produto','data-stock-type')}<div class="field"><label>Item *</label><select name="itemId" required data-stock-item>${itemReferenceOptions(base.itemType||'Produto',selected)}</select></div>${selectField('Movimento','movementType',['Entrada','Saída'],base.movementType||'Entrada')}${field('Quantidade *','quantity',base.quantity||1,'number','step="0.01" min="0.01" required')}${field('Data','date',base.date||today(),'date')}<div class="field"><label>Ordem de serviço</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(o=>o.registrationStatus!=='Inativo').slice().reverse().map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></div>${textarea('Observação','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">${m?'Salvar alteração':'Registrar movimentação'}</button></div></form>`,true);}
function defaultConsentText(clientName,order){return `Eu, ${clientName||'cliente'}, declaro que autorizei a Marco Iris Soluções em Tecnologia a realizar diagnóstico, testes técnicos e os serviços descritos${order?` na ordem ${order.id}`:''}. Estou ciente de que o equipamento poderá ser ligado, desmontado e testado quando necessário. Autorizo o tratamento dos dados estritamente necessários para execução e registro do atendimento. Declaro ter informado os acessórios entregues e ter recebido orientação sobre valores, prazos e garantia aplicável ao serviço.`;}
function openConsentForm(id='',prefill={}){const existing=id?data().consents.find(x=>x.id===id):null,order=findOrder(existing?.orderId||prefill.orderId||''),client=findClient(existing?.clientId||prefill.clientId||order?.clientId||'');const base=existing||{clientId:client?.id||'',orderId:order?.id||'',title:'Termo de autorização e ciência do serviço técnico',text:defaultConsentText(client?.name,order),accepted:false,acceptedAt:'',acceptanceMethod:'Presencial',status:'Pendente',notes:''};openModal(existing?'Editar termo':'Novo termo',`<form data-form="consent" data-id="${attr(id)}"><div class="form-grid three"><div class="field"><label>Cliente *</label><select name="clientId" required>${clientOptions(base.clientId||'')}</select></div><div class="field"><label>Ordem de serviço</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(o=>o.registrationStatus!=='Inativo').slice().reverse().map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></div>${field('Título *','title',base.title||'','text','required')}${selectField('Método de aceite','acceptanceMethod',['Presencial','WhatsApp','E-mail','Assinatura física','Outro'],base.acceptanceMethod||'Presencial')}${field('Data do aceite','acceptedAt',base.acceptedAt?String(base.acceptedAt).slice(0,10):'','date')}${selectField('Status','status',['Pendente','Aceito','Revogado'],base.accepted?'Aceito':base.status||'Pendente')}${textarea('Texto do termo *','text',base.text||defaultConsentText(client?.name,order),true)}${textarea('Observações internas','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar termo</button></div></form>`,true);}
function printConsent(id){const c=data().consents.find(x=>x.id===id);if(!c)return;const client=findClient(c.clientId)||{name:c.clientName},order=findOrder(c.orderId),co=company(),w=window.open('','_blank');if(!w)throw new Error('Permita pop-ups para imprimir o termo.');w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(c.title||'Termo')} - ${esc(client.name||'Cliente')}</title><style>@page{size:A4;margin:18mm}body{font-family:Segoe UI,Arial,sans-serif;color:#17253a;line-height:1.55}header{border-bottom:3px solid #ff642f;padding-bottom:14px;margin-bottom:24px}h1{font-size:22px;color:#042344;margin:0 0 6px}.meta{color:#66758a;font-size:12px}.text{white-space:pre-wrap;text-align:justify}.sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:70px}.line{border-top:1px solid #17253a;text-align:center;padding-top:6px;font-size:12px}.status{display:inline-block;padding:5px 10px;border-radius:999px;background:${c.accepted?'#e1f6ed':'#fff2dd'};color:${c.accepted?'#14865e':'#8a5700'};font-weight:700}footer{margin-top:40px;border-top:1px solid #d7e0ea;padding-top:10px;font-size:11px;color:#66758a}</style></head><body><header><h1>${esc(co.name||'Marco Iris Soluções em Tecnologia')}</h1><div class="meta">${esc([co.phone,co.email,co.instagram].filter(Boolean).join(' · '))}</div></header><h1>${esc(c.title||'Termo de autorização')}</h1><p><strong>Cliente:</strong> ${esc(client.name||c.clientName||'—')}<br><strong>Documento:</strong> ${esc(client.document||'—')}<br><strong>Ordem de serviço:</strong> ${esc(order?.id||c.orderId||'Não vinculada')}<br><strong>Equipamento:</strong> ${esc(order?.equipmentType||'—')} ${esc(order?.brandModel||'')}</p><p class="text">${esc(c.text||'')}</p><p><span class="status">${esc(c.accepted?'Aceito':c.status||'Pendente')}</span> ${c.acceptedAt?`em ${formatDate(c.acceptedAt)} por ${esc(c.acceptanceMethod||'meio não informado')}`:''}</p><div class="sign"><div class="line">${esc(client.name||'Cliente')}<br>Cliente / responsável</div><div class="line">${esc(co.name||'Marco Iris')}<br>Responsável técnico</div></div><footer>Registro ${esc(c.id)} · gerado em ${formatDateTime(nowIso())}</footer><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
async function saveConsentForm(form){const id=form.dataset.id||nextCode('TER',data().consents),old=data().consents.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),client=findClient(v.clientId);if(!client)throw new Error('Selecione um cliente válido.');if(!v.title?.trim()||!v.text?.trim())throw new Error('Preencha o título e o texto do termo.');if(v.orderId){const o=findOrder(v.orderId);if(!o)throw new Error('A OSV vinculada não existe.');if(o.clientId!==client.id)throw new Error('A OSV selecionada pertence a outro cliente.');}const accepted=v.status==='Aceito',item={id,clientId:client.id,clientName:client.name,orderId:v.orderId,title:v.title.trim(),text:v.text.trim(),accepted,status:v.status,acceptedAt:accepted?(v.acceptedAt||today()):'',acceptanceMethod:v.acceptanceMethod,notes:v.notes,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(old)Object.assign(old,item);else data().consents.push(item);await persist(old?'Termo atualizado':'Termo criado',`${id} · ${client.name}`);closeModal();renderView();toast('Termo salvo.');}

function openCompanyForm(){const c=company();openModal('Dados da empresa',`<form data-form="company"><div class="form-grid three">${field('Nome da empresa','name',c.name||'')}${field('CPF / CNPJ','document',c.document||'')}${field('Telefone','phone',c.phone||'')}${field('E-mail','email',c.email||'','email')}${field('Instagram','instagram',c.instagram||'')}${field('Endereço','address',c.address||'')}${field('Número','number',c.number||'')}${field('Bairro','neighborhood',c.neighborhood||'')}${field('Cidade / UF','city',c.city||'')}${field('CEP','zip',c.zip||'')}${textarea('Mensagem padrão do PDF','defaultNote',c.defaultNote||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar empresa</button></div></form>`,true);}
function openPinForm(){openModal(activeProfile().pin?'Alterar PIN':'Definir PIN',`<form data-form="pin" class="pin-form"><div class="pin-modal-hero"><div class="pin-modal-chip">${icon('lock')}</div><div><strong>${activeProfile().pin?'Atualize a proteção local':'Ative a proteção local'}</strong><small>Use um PIN de 4 a 8 números. Ele será solicitado ao abrir ou bloquear o sistema neste dispositivo.</small></div></div><div class="notice pin-notice"><strong>Dica de segurança:</strong><br>Evite sequências simples como 1234, 0000 ou datas fáceis de adivinhar.</div><div class="form-grid pin-form-grid">${field('Novo PIN','pin','','password','inputmode="numeric" minlength="4" maxlength="8" pattern="[0-9]{4,8}" required placeholder="Digite de 4 a 8 números"')}${field('Confirmar PIN','confirmPin','','password','inputmode="numeric" minlength="4" maxlength="8" pattern="[0-9]{4,8}" required placeholder="Repita o PIN"')}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar PIN</button></div></form>`);}
async function openLocalBackups(){openModal('Backups no Google Drive','<div class="empty">O modo nuvem obrigatória não cria backups locais. Use <strong>Criar backup no Drive</strong>.</div>');}

function updateOrderFormTotal(){const form=$('form[data-form="order"]');if(!form)return;let total=0;$$('.item-editor-row',form).forEach(row=>{const q=num($('[data-item-field="qty"]',row)?.value),p=num($('[data-item-field="price"]',row)?.value),sub=q*p;const el=$('[data-item-field="subtotal"]',row);if(el)el.value=sub.toFixed(2);total+=sub;});total=Math.max(0,total-num(form.elements.discount?.value));const out=$('#order-form-total');if(out)out.textContent=currency(total);}
function updateItemReference(row){const type=$('[data-item-field="type"]',row).value,ref=$('[data-item-field="ref"]',row);ref.innerHTML=itemReferenceOptions(type);const stock=$('[data-item-field="stock"]',row);if(type==='Serviço'){stock.checked=false;stock.disabled=true;}else stock.disabled=false;updateItemPrice(row);}
function updateItemPrice(row){const type=$('[data-item-field="type"]',row).value,id=$('[data-item-field="ref"]',row).value,price=$('[data-item-field="price"]',row);let value=0;if(type==='Produto')value=num(data().products.find(x=>x.id===id)?.salePrice);else if(type==='Serviço'){const p=data().services.find(x=>x.id===id)?.price;value=typeof p==='number'?p:0;}else value=num(data().supplies.find(x=>x.id===id)?.cost);if(id)price.value=value.toFixed(2);updateOrderFormTotal();}

async function saveClientForm(form){const id=form.dataset.id||nextCode('CLI',data().clients);const old=findClient(id);const v=Object.fromEntries(new FormData(form));const item={id,name:v.name.trim(),document:v.document,phone:v.phone,city:v.city,address:v.address,number:v.number,neighborhood:v.neighborhood,complement:v.complement,zip:v.zip,notes:v.notes,createdAt:old?.createdAt||today(),status:old?.status||'Ativo'};if(old)Object.assign(old,item);else data().clients.push(item);await persist(old?'Cliente atualizado':'Cliente criado',`${item.id} · ${item.name}`);closeModal();renderView();toast('Cliente salvo.');}
async function saveOrderForm(form){
  const id=form.dataset.id||nextCode('OSV',data().serviceOrders);const old=findOrder(id),oldItems=old?clone(orderItems(id)):[];const v=Object.fromEntries(new FormData(form));const client=findClient(v.clientId);if(!client)throw new Error('Selecione um cliente.');
  const newItems=[];$$('.item-editor-row',form).forEach(row=>{const type=$('[data-item-field="type"]',row).value,ref=$('[data-item-field="ref"]',row).value,q=num($('[data-item-field="qty"]',row).value),p=num($('[data-item-field="price"]',row).value);if(!ref||q<=0)return;const previous=oldItems.find(x=>x.id===row.dataset.itemId),previousRef=previous?.productId||previous?.serviceId||previous?.supplyId||'';let itemId=row.dataset.itemId;if(previous&&(previous.type!==type||previousRef!==ref))itemId='';const it={id:itemId||nextCode('ITM',[...data().orderItems,...newItems]),orderId:id,type,productId:type==='Produto'?ref:'',serviceId:type==='Serviço'?ref:'',supplyId:type==='Insumo'?ref:'',quantity:q,unitPrice:p,subtotal:q*p,lowerStock:type!=='Serviço'&&$('[data-item-field="stock"]',row).checked};newItems.push(it);});
  const total=Math.max(0,newItems.reduce((sum,it)=>sum+num(it.subtotal),0)-num(v.discount));const selectedPdfTemplateId=(v.pdfTemplateId&&data().settings.pdfTemplates?.some(t=>t.id===v.pdfTemplateId))?v.pdfTemplateId:(old?.pdfTemplateId||data().settings.defaultPdfTemplateId||'');const item={id,openedAt:v.openedAt||today(),completedAt:v.completedAt||(norm(v.status).includes('conclu')?today():''),clientId:client.id,clientName:client.name,equipmentType:v.equipmentType,brandModel:v.brandModel,serialNumber:v.serialNumber,accessPassword:v.accessPassword,accessories:v.accessories,reportedIssue:v.reportedIssue,technicalReport:v.technicalReport,status:v.status,discount:num(v.discount),total,clientNotes:v.clientNotes,internalNotes:v.internalNotes,pdfTemplateId:selectedPdfTemplateId,pixPayment:window.MarcoPersonalization221?.snapshotPixFromForm?.(form,old?.pixPayment)||old?.pixPayment||{enabled:false},registrationStatus:old?.registrationStatus||'Ativo',photos:old?.photos||[],pdfs:old?.pdfs||[],attachments:old?.attachments||[],sourceAppointmentId:old?.sourceAppointmentId||v.sourceAppointmentId||'',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};
  validateStockPlan(oldItems,newItems);if(old)Object.assign(old,item);else data().serviceOrders.push(item);data().orderItems=data().orderItems.filter(x=>x.orderId!==id).concat(newItems);reconcileStock(id,oldItems,newItems);await persist(old?'Ordem atualizada':'Ordem criada',`${id} · ${client.name}`);
  const photos=[...(form.elements.photos?.files||[])],attachments=[...(form.elements.attachments?.files||[])];if(photos.length)await addPhotosToOrder(item,photos);if(attachments.length)await addAttachmentsToOrder(item,attachments);
  if(item.sourceAppointmentId){const appt=data().appointments.find(a=>a.id===item.sourceAppointmentId);if(appt){appt.orderId=id;appt.status='Concluído';await persist('Agendamento convertido em OSV',`${appt.id} → ${id}`);}}
  closeModal();renderView();toast(`${id} salva com sucesso.`);if(data().settings.generatePaymentOnComplete&&norm(item.status).includes('conclu')&&!orderPayments(id).length)openPaymentForm('',id);
}
function validateStockPlan(oldItems,newItems){if(!data().settings.preventNegativeStock)return;const deltas=new Map(),all=new Map([...oldItems,...newItems].map(x=>[x.id,x]));for(const [itemId,item] of all){const latest=newItems.find(x=>x.id===itemId),ref=latest||item;if(!ref||(!ref.productId&&!ref.supplyId))continue;const desired=latest?.lowerStock?num(latest.quantity):0,applied=data().stockMovements.filter(m=>m.sourceItemId===itemId).reduce((s,m)=>s+(norm(m.movementType).startsWith('saida')?num(m.quantity):-num(m.quantity)),0),delta=desired-applied,type=ref.productId?'Produto':'Insumo',id=ref.productId||ref.supplyId,key=`${type}:${id}`;deltas.set(key,(deltas.get(key)||0)+delta);}for(const [key,delta] of deltas){const [type,id]=key.split(':'),available=stockOf(type,id),after=available-delta;if(after<-.0001){const item=type==='Produto'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id);throw new Error(`Estoque insuficiente para ${item?.description||id}. Disponível: ${available}; saldo previsto: ${after}.`);}}}
function reconcileStock(orderId,oldItems,newItems){const map=new Map([...oldItems,...newItems].map(x=>[x.id,x]));for(const [itemId,item] of map){const latest=newItems.find(x=>x.id===itemId);const desired=latest?.lowerStock&&(latest.productId||latest.supplyId)?num(latest.quantity):0;const applied=data().stockMovements.filter(m=>m.sourceItemId===itemId).reduce((s,m)=>s+(norm(m.movementType).startsWith('saida')?num(m.quantity):-num(m.quantity)),0);const delta=desired-applied;if(Math.abs(delta)<0.0001)continue;const ref=latest||item,type=ref.productId?'Produto':'Insumo',stockBefore=stockOf(type,ref.productId||ref.supplyId),movementType=delta>0?'Saída':'Entrada',qty=Math.abs(delta);data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:type,productId:ref.productId||'',supplyId:ref.supplyId||'',movementType,quantity:qty,date:today(),orderId,notes:`Ajuste automático da ${orderId}`,stockBefore,stockAfter:stockBefore+(movementType==='Entrada'?qty:-qty),sourceItemId:itemId});}}
async function savePaymentForm(form){const id=form.dataset.id||nextCode(form.elements.type.value==='Despesa'?'DES':'REC',data().payments);const old=data().payments.find(x=>x.id===id),v=Object.fromEntries(new FormData(form));const isExpense=v.type==='Despesa',cancelled=norm(v.status).includes('cancel');const item={id,code:old?.code||id,orderId:v.orderId,type:v.type,paymentMethod:v.paymentMethod,paymentOrigin:isExpense?(v.paymentOrigin||'Carteira'):'',expenseType:isExpense?(norm(v.expenseType)==='fixa'?'Fixa':'Variável'):'',expenseCategory:isExpense?String(v.expenseCategory||'').trim():'',localPurchase:isExpense?String(v.localPurchase||'').trim():'',value:num(v.value),dueDate:v.dueDate,paymentDate:v.status==='Pago'?(v.paymentDate||today()):v.paymentDate,status:v.status,notes:v.notes,active:!cancelled,cancelledAt:cancelled?(old?.cancelledAt||nowIso()):'',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(old)Object.assign(old,item);else data().payments.push(item);await persist(old?'Lançamento atualizado':'Lançamento criado',`${item.code} · ${currency(item.value)}`);closeModal();renderView();toast(cancelled?'Lançamento cancelado e retirada do Borion programada.':'Lançamento salvo.');}
async function saveAppointmentForm(form){const id=form.dataset.id||nextCode('AGE',data().appointments);const old=data().appointments.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),c=findClient(v.clientId);const item={id,title:v.title,clientId:v.clientId,clientName:c?.name||'',date:v.date,time:v.time,status:v.status,location:v.location,notes:v.notes,orderId:old?.orderId||'',createdAt:old?.createdAt||nowIso()};if(old)Object.assign(old,item);else data().appointments.push(item);await persist(old?'Agendamento atualizado':'Agendamento criado',`${formatDate(item.date)} ${item.time} · ${item.title}`);closeModal();renderView();toast('Agendamento salvo.');}
async function saveProductForm(form){const id=form.dataset.id||nextCode('PRD',data().products),old=data().products.find(x=>x.id===id),v=Object.fromEntries(new FormData(form));const cost=num(v.cost),margin=num(v.margin),item={id,description:v.description,brand:v.brand,supplier:v.supplier,cost,margin,suggestedPrice:margin<1&&margin>=0?cost/(1-margin):cost*(1+margin),salePrice:num(v.salePrice),initialStock:num(v.initialStock),minimumStock:num(v.minimumStock),costUpdatedAt:today(),priceUpdatedAt:today(),status:v.status};if(old)Object.assign(old,item);else data().products.push(item);await persist(old?'Produto atualizado':'Produto criado',`${id} · ${item.description}`);closeModal();renderView();toast('Produto salvo.');}
async function saveServiceForm(form){const id=form.dataset.id||nextCode('SRV',data().services),old=data().services.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),item={id,description:v.description,price:num(v.price),status:v.status};if(old)Object.assign(old,item);else data().services.push(item);await persist(old?'Serviço atualizado':'Serviço criado',`${id} · ${item.description}`);closeModal();renderView();toast('Serviço salvo.');}
async function saveSupplyForm(form){const id=form.dataset.id||nextCode('INS',data().supplies),old=data().supplies.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),item={id,description:v.description,brand:v.brand,supplier:v.supplier,cost:num(v.cost),initialStock:num(v.initialStock),minimumStock:num(v.minimumStock),costUpdatedAt:today(),status:v.status};if(old)Object.assign(old,item);else data().supplies.push(item);await persist(old?'Insumo atualizado':'Insumo criado',`${id} · ${item.description}`);closeModal();renderView();toast('Insumo salvo.');}
async function saveStockMovement(form){const v=Object.fromEntries(new FormData(form)),type=v.itemType,itemId=v.itemId,qty=num(v.quantity),old=form.dataset.id?data().stockMovements.find(x=>x.id===form.dataset.id):null;if(old?.sourceItemId)throw new Error('Movimentação automática só pode ser alterada pela OSV.');if(!itemId||!itemForMovement({itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:''}))throw new Error('Selecione um item válido.');const oldRef=old?(old.itemType==='Produto'?old.productId:old.supplyId):'',sameRef=!!old&&old.itemType===type&&oldRef===itemId,oldEffect=sameRef?(old.movementType==='Entrada'?num(old.quantity):-num(old.quantity)):0,available=stockOf(type,itemId)-oldEffect;if(data().settings.preventNegativeStock&&v.movementType==='Saída'&&qty>available)throw new Error(`Saída maior que o estoque disponível (${available}).`);const item={id:old?.id||nextCode('MOV',data().stockMovements),itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:v.movementType,quantity:qty,date:v.date||today(),orderId:v.orderId,notes:v.notes,stockBefore:available,stockAfter:available+(v.movementType==='Entrada'?qty:-qty),sourceItemId:''};if(old)Object.assign(old,item);else data().stockMovements.push(item);await persist(old?'Movimentação atualizada':'Estoque movimentado',`${v.movementType} ${qty} · ${itemForMovement(item)?.description||itemId}`);closeModal();renderView();toast('Movimentação salva.');}
async function saveCompanyForm(form){Object.assign(activeProfile().company,Object.fromEntries(new FormData(form)));await persist('Dados da empresa atualizados');closeModal();renderView();toast('Dados da empresa salvos.');}
async function savePinForm(form){const v=Object.fromEntries(new FormData(form));if(!/^\d{4,8}$/.test(v.pin||''))throw new Error('O PIN deve conter de 4 a 8 números.');if(v.pin!==v.confirmPin)throw new Error('A confirmação do PIN não confere.');activeProfile().pin=await hashPin(v.pin);await persist('PIN de acesso atualizado','Proteção local ativada.');closeModal();renderView();toast('PIN salvo. Ele será solicitado na próxima abertura ou ao bloquear.');}

async function materializeBlob(blob){if(!(blob instanceof Blob))throw new Error('Arquivo inválido ou inacessível.');if(!blob.arrayBuffer)return blob;let bytes;try{bytes=await blob.arrayBuffer();}catch(_){throw new Error(`Não foi possível ler o arquivo ${blob.name||'selecionado'}. Se ele estiver em uma pasta sincronizada, aguarde o download local e tente novamente.`);}if(blob.size>0&&!bytes.byteLength)throw new Error(`O arquivo ${blob.name||'selecionado'} foi lido sem conteúdo.`);return new Blob([bytes],{type:blob.type||'application/octet-stream'});}
async function optimizeImage(file){try{const bmp=await createImageBitmap(file);const max=1800,scale=Math.min(1,max/Math.max(bmp.width,bmp.height));if(scale===1&&file.size<1_500_000){bmp.close?.();return file;}const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bmp.width*scale));canvas.height=Math.max(1,Math.round(bmp.height*scale));const ctx=canvas.getContext('2d');ctx.drawImage(bmp,0,0,canvas.width,canvas.height);bmp.close?.();return await new Promise(r=>canvas.toBlob(r,'image/jpeg',.84));}catch(_){return file;}}
function canonicalOrderMediaName(orderId,fileName){
  const clean=String(fileName||'arquivo').split(/[\\/]/).pop().replace(/[<>:"|?*\x00-\x1F]/g,'-').trim()||'arquivo';
  const legacy=/(?:OSV|OAS|OS)[\s_\-/:]*(?:\d[\s_\-]*){1,9}/i;
  if(legacy.test(clean))return clean.replace(legacy,orderId);
  if(clean.toUpperCase().startsWith(String(orderId||'').toUpperCase()))return clean;
  return `${orderId}_${clean}`;
}
async function addAttachmentsToOrder(order,files){
  if(!navigator.onLine||!GoogleDriveMarco.isConfigured())throw new Error('Internet e Google Drive são obrigatórios para adicionar anexos.');
  const created=[];
  try{
    for(const file of files){
      const fileName=canonicalOrderMediaName(order.id,file.name),blob=await materializeBlob(file),record=await MarcoStorage.putMedia(blob,{name:fileName,type:blob.type||file.type});
      const remote=await GoogleDriveMarco.uploadBlob(blob,'attachments',fileName);
      const meta={id:`attachment_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,orderId:order.id,kind:'attachment',fileName,localKey:record.id,driveFileId:remote.id,webViewLink:remote.webViewLink||'',createdAt:nowIso()};
      order.attachments=order.attachments||[];order.attachments.push(meta);created.push(meta);
    }
    if(created.length)await persist('Anexos adicionados',`${created.length} arquivo(s) na ${order.id}`);
    return created.length;
  }catch(error){
    order.attachments=(order.attachments||[]).filter(item=>!created.some(meta=>meta.id===item.id));
    for(const meta of created){if(meta.localKey)await MarcoStorage.deleteMedia(meta.localKey).catch(()=>{});if(meta.driveFileId)await GoogleDriveMarco.trash(meta.driveFileId).catch(()=>{});}
    throw error;
  }
}
async function addPhotosToOrder(order,files){
  if(!navigator.onLine||!GoogleDriveMarco.isConfigured())throw new Error('Internet e Google Drive são obrigatórios para adicionar fotos.');
  const created=[];
  try{
    for(const file of files){
      if(!file.type.startsWith('image/'))continue;
      const fileName=canonicalOrderMediaName(order.id,file.name),optimized=await optimizeImage(file),blob=await materializeBlob(optimized),record=await MarcoStorage.putMedia(blob,{name:fileName,type:blob.type});
      const remote=await GoogleDriveMarco.uploadBlob(blob,'photos',fileName);
      const meta={id:`photo_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,orderId:order.id,kind:'photo',fileName,localKey:record.id,driveFileId:remote.id,webViewLink:remote.webViewLink||'',createdAt:nowIso()};
      order.photos=order.photos||[];order.photos.push(meta);created.push(meta);
    }
    if(created.length)await persist('Fotos adicionadas',`${created.length} foto(s) na ${order.id}`);
    return created.length;
  }catch(error){
    order.photos=(order.photos||[]).filter(item=>!created.some(meta=>meta.id===item.id));
    for(const meta of created){if(meta.localKey)await MarcoStorage.deleteMedia(meta.localKey).catch(()=>{});if(meta.driveFileId)await GoogleDriveMarco.trash(meta.driveFileId).catch(()=>{});}
    throw error;
  }
}
function findMedia(mediaId){for(const o of data().serviceOrders){for(const m of [...(o.photos||[]),...(o.pdfs||[]),...(o.attachments||[])])if(m.id===mediaId)return {meta:m,order:o};}const m=data().attachments.find(x=>x.id===mediaId);return m?{meta:m,order:null}:null;}
async function getMediaBlob(meta){if(!meta)return null;if(meta.localKey){const rec=await MarcoStorage.getMedia(meta.localKey);if(rec?.blob)return rec.blob;}if(meta.driveFileId&&GoogleDriveMarco.isConfigured()){const blob=await GoogleDriveMarco.downloadBlob(meta.driveFileId);const rec=await MarcoStorage.putMedia(blob,{name:meta.fileName,type:blob.type});meta.localKey=rec.id;return blob;}if(meta.migrationPath){const response=await fetch(meta.migrationPath,{cache:'no-store'});if(response.ok){const blob=await response.blob();const rec=await MarcoStorage.putMedia(blob,{name:meta.fileName,type:blob.type});meta.localKey=rec.id;return blob;}}return null;}
async function hydrateMediaImages(){for(const img of $$('img[data-media-id]')){const found=findMedia(img.dataset.mediaId);if(!found)continue;try{const blob=await getMediaBlob(found.meta);if(blob){const url=URL.createObjectURL(blob);img.src=url;img.onload=()=>setTimeout(()=>URL.revokeObjectURL(url),1000);}else{img.removeAttribute('src');img.alt='Importe a mídia privada para visualizar esta foto.';}}catch(e){console.warn(e);}}}
async function importExistingMedia(files){
  if(!navigator.onLine||!GoogleDriveMarco.isConfigured())throw new Error('Internet e Google Drive são obrigatórios para importar mídias.');
  const selected=[...files];if(!selected.length)return;
  let linked=0,skipped=0,uploaded=0;const created=[];
  setSaveStatus(`Importando 0 de ${selected.length}…`,'warn');
  try{
    for(let i=0;i<selected.length;i++){
      const file=selected[i],orderCode=window.MarcoIdentifiers?.extractEntityCode(file.name,'OSV')||'';if(!orderCode){skipped++;continue;}
      const order=findOrder(orderCode);if(!order){skipped++;continue;}
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isImage=file.type.startsWith('image/')||/\.(jpg|jpeg|png|webp)$/i.test(file.name),kind=isPdf?'pdf':isImage?'photo':'attachment';
      const fileName=canonicalOrderMediaName(order.id,file.name),source=isImage?await optimizeImage(file):file,blob=await materializeBlob(source),record=await MarcoStorage.putMedia(blob,{name:fileName,type:blob.type||file.type});
      const folder=isPdf?'pdfs':isImage?'photos':'attachments',remote=await GoogleDriveMarco.uploadBlob(blob,folder,fileName);
      const target=isPdf?(order.pdfs=order.pdfs||[]):isImage?(order.photos=order.photos||[]):(order.attachments=order.attachments||[]);
      let meta=target.find(m=>m.fileName===fileName);
      if(!meta){meta={id:`${kind}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,orderId:order.id,kind,fileName,localKey:record.id,driveFileId:remote.id,webViewLink:remote.webViewLink||'',createdAt:nowIso(),legacy:isPdf};target.push(meta);created.push({target,meta});}
      else Object.assign(meta,{localKey:record.id,driveFileId:remote.id,webViewLink:remote.webViewLink||''});
      uploaded++;linked++;setSaveStatus(`Importando ${i+1} de ${selected.length}…`,'warn');
    }
    await persist('Mídias do AppSheet importadas',`${linked} vinculadas, ${uploaded} enviadas ao Drive, ${skipped} ignoradas`);
    setSaveStatus('Importação confirmada no Google Drive','ok');renderView();toast(`${linked} arquivos vinculados às ordens.${skipped?` ${skipped} ignorados.`:''}`,skipped?'warn':'ok');
  }catch(error){
    for(const item of created)item.target.splice(item.target.indexOf(item.meta),1);
    throw error;
  }
}
async function syncPendingMedia(){
  if(!GoogleDriveMarco.isConfigured())return 0;let count=0;
  for(const o of data().serviceOrders){for(const [list,folder] of [[o.photos||[],'photos'],[o.pdfs||[],'pdfs'],[o.attachments||[],'attachments']]){for(const m of list){if(!m.driveFileId&&(m.localKey||m.migrationPath)){const b=await getMediaBlob(m);if(b){const fileName=canonicalOrderMediaName(o.id,m.fileName||'arquivo');m.fileName=fileName;const r=await GoogleDriveMarco.uploadBlob(b,folder,fileName);m.driveFileId=r.id;m.webViewLink=r.webViewLink||'';count++;}}}}}
  return count;
}
async function generatePdfForOrder(orderId,share=false){
  if(share)throw new Error('O fluxo seguro de compartilhamento ainda não foi inicializado. Recarregue a aplicação.');
  if(!navigator.onLine||!GoogleDriveMarco.isConfigured())throw new Error('Internet e Google Drive são obrigatórios para gerar e registrar o PDF.');
  const o=findOrder(orderId);if(!o)throw new Error('Ordem de serviço não encontrada.');
  const c=findClient(o.clientId)||{name:o.clientName,phone:''};
  setSaveStatus('Gerando PDF…','warn');
  const result=await MarcoPdf.generate(o,{client:c,company:company(),items:orderItems(o.id),payments:orderPayments(o.id),itemName:itemDescription,getPhotoBlob:getMediaBlob});
  const record=await MarcoStorage.putMedia(result.blob,{name:result.fileName,type:'application/pdf'}),remote=await GoogleDriveMarco.uploadBlob(result.blob,'pdfs',result.fileName);
  const meta={id:`pdf_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,orderId:o.id,kind:'pdf',fileName:result.fileName,localKey:record.id,driveFileId:remote.id,webViewLink:remote.webViewLink||'',createdAt:nowIso()};
  o.pdfs=o.pdfs||[];o.pdfs.push(meta);
  try{await persist('PDF da OSV gerado',`${o.id} · ${result.fileName}`);}catch(error){o.pdfs=o.pdfs.filter(x=>x.id!==meta.id);await GoogleDriveMarco.trash(meta.driveFileId).catch(()=>{});throw error;}
  setSaveStatus('PDF confirmado no Google Drive','ok');MarcoStorage.downloadBlob(result.blob,result.fileName);toast('PDF gerado, salvo no Drive e baixado.');renderView();return meta;
}

async function openPdfMedia(orderId,mediaId){const found=findMedia(mediaId);if(!found)throw new Error('Arquivo não encontrado.');const blob=await getMediaBlob(found.meta);if(!blob)throw new Error('Este arquivo está mapeado, mas ainda não foi importado. Use Configurações → Importar fotos, PDFs e anexos.');const url=URL.createObjectURL(blob),win=window.open(url,'_blank');if(!win)MarcoStorage.downloadBlob(blob,found.meta.fileName||`${orderId}.pdf`);setTimeout(()=>URL.revokeObjectURL(url),120000);}
async function deleteMedia(orderId,mediaId){const o=findOrder(orderId),found=findMedia(mediaId);if(!o||!found||!await confirmAction(`Remover “${found.meta.fileName}” desta ordem?`))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-arquivo');if(found.meta.localKey)await MarcoStorage.deleteMedia(found.meta.localKey);if(found.meta.driveFileId&&GoogleDriveMarco.isConfigured()){try{await GoogleDriveMarco.trash(found.meta.driveFileId);}catch(e){console.warn(e);}}o.photos=(o.photos||[]).filter(x=>x.id!==mediaId);o.pdfs=(o.pdfs||[]).filter(x=>x.id!==mediaId);o.attachments=(o.attachments||[]).filter(x=>x.id!==mediaId);await persist('Mídia removida',`${orderId} · ${found.meta.fileName}`);openOrderDetail(orderId);toast('Arquivo removido.');}
function pickPhotosForOrder(orderId,mode='camera'){const input=document.createElement('input');input.type='file';input.accept='image/*';if(mode==='camera')input.capture='environment';else input.multiple=true;input.onchange=async()=>{const o=findOrder(orderId);if(o&&input.files.length){const count=input.files.length;await addPhotosToOrder(o,[...input.files]);openOrderDetail(orderId);toast(`${count} foto(s) adicionada(s).`);}};input.click();}
function exportFinanceCsv(){const rows=[['Código','OSV','Tipo','Forma de pagamento','Valor','Vencimento','Pagamento','Status','Observação']];data().payments.forEach(p=>rows.push([p.code||p.id,p.orderId,p.type,p.paymentMethod,p.value,p.dueDate,p.paymentDate,window.MarcoFinanceStatus?.effectiveStatus?.(p)||p.status,p.notes]));const csv='\ufeff'+rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';')).join('\n');MarcoStorage.downloadBlob(new Blob([csv],{type:'text/csv;charset=utf-8'}),`Financeiro_Marco_Iris_${today()}.csv`);}

let manualSaveInflight=null,connectGoogleInflight=null,syncGoogleInflight=null;
async function manualSave(){
  if(manualSaveInflight)return await manualSaveInflight;
  manualSaveInflight=(async()=>{
    if(!navigator.onLine)throw new Error('Internet obrigatória para salvar.');
    if(!GoogleDriveMarco.isConfigured())throw new Error('Google Drive desconectado.');
    setSaveStatus('Criando backup no Google Drive…','warn');
    const result=await flushCloudState('backup-manual',{backup:true,retryMedia:true});
    LAST_CONFIRMED_STATE=clone(STATE);
    await MarcoStorage.saveSyncBase?.(STATE);
    const diag=await GoogleDriveMarco.diagnose(STATE);
    if(!diag.ok)throw new Error('A base ou o marco-iris.bridge.json não pôde ser confirmado.');
    setSaveStatus('Backup no Drive + integração confirmados','ok');
    toast('Backup criado e confirmado no Google Drive.');
    return result;
  })().finally(()=>{manualSaveInflight=null;});
  return await manualSaveInflight;
}
async function connectGoogle(){
  if(connectGoogleInflight)return await connectGoogleInflight;
  const buttons=$$('[data-action="connect-google"]');
  buttons.forEach(button=>{button.disabled=true;button.dataset.originalText=button.innerHTML;button.innerHTML=`${icon('cloud')} Conectando…`;});
  connectGoogleInflight=(async()=>{
    if(!navigator.onLine)throw new Error('Internet obrigatória para conectar o Google Drive.');
    window.MarcoBorionInterop?.pause?.('connect-google');
    setSaveStatus('Carregando a base oficial do Drive…','warn');
    const result=await GoogleDriveMarco.initializeOfficialState(clone(window.MARCO_INITIAL_DATA),{interactive:true,onProgress:text=>setSaveStatus(text,'warn')});
    STATE=result.state;
    normalizeState();
    LAST_CONFIRMED_STATE=clone(STATE);
    await MarcoStorage.saveSyncBase?.(STATE);
    window.MarcoBorionInterop?.resume?.('connect-google');
    window.MarcoBorionInterop?.prepareState?.(STATE);
    window.MarcoBorionInterop?.setReady?.(STATE);
    await publishBridgeConfirmed();
    const diag=await GoogleDriveMarco.diagnose(STATE);
    if(!diag.ok)throw new Error('A base principal ou o marco-iris.bridge.json não foi confirmado.');
    setSaveStatus('Google Drive + Borion_Integracoes confirmados','ok');
    renderShell();
    toast(`Conta ${result.user?.email||''} conectada à base oficial.`);
  })().catch(e=>{window.MarcoBorionInterop?.setNotReady?.(e.message);throw e;}).finally(()=>{
    connectGoogleInflight=null;
    buttons.forEach(button=>{button.disabled=false;if(button.dataset.originalText)button.innerHTML=button.dataset.originalText;});
  });
  return await connectGoogleInflight;
}
async function syncGoogle(){
  if(syncGoogleInflight)return await syncGoogleInflight;
  syncGoogleInflight=(async()=>{
    if(!navigator.onLine)throw new Error('Internet obrigatória para sincronizar.');
    if(CLOUD_ONLY_COMMITTING)throw new Error('Aguarde a alteração atual ser confirmada no Google Drive.');
    window.MarcoBorionInterop?.pause?.('manual-sync');
    setSaveStatus('Carregando a base oficial do Google Drive…','warn');
    const remote=await GoogleDriveMarco.load({interactive:true});
    STATE=remote.state;
    await backupStateBeforeV220Migration(STATE,'google-remoto');
    normalizeState();
    LAST_CONFIRMED_STATE=clone(STATE);
    await MarcoStorage.saveSyncBase?.(STATE);
    CLOUD_PENDING_LOCAL=false;
    window.MarcoBorionInterop?.resume?.('manual-sync');
    window.MarcoBorionInterop?.prepareState?.(STATE);
    window.MarcoBorionInterop?.setReady?.(STATE);
    await publishBridgeConfirmed();
    setSaveStatus('Google Drive e integração confirmados','ok');
    renderShell();
    toast('Base oficial atualizada do Google Drive.');
  })().catch(e=>{window.MarcoBorionInterop?.setNotReady?.(e.message);throw e;}).finally(()=>{syncGoogleInflight=null;});
  return await syncGoogleInflight;
}
async function loadGoogle(){
  return await syncGoogle();
}
async function connectFolder(){
  throw new Error('O Marco Iris usa exclusivamente o Google Drive.');
}
async function diagnoseDriveInstallation(){
  if(!GoogleDriveMarco.isConfigured())throw new Error('Conecte o Google Drive antes de executar o diagnóstico.');
  setSaveStatus('Testando gravação e leitura da instalação…','warn');
  await flushCloudState('diagnostico-instalacao',{backup:false,retryMedia:true});
  const diag=await GoogleDriveMarco.diagnose(STATE);
  const folders=(diag.folders||[]).map(f=>`<li><strong>${esc(f.name)}</strong><br><small>${esc(f.id)}</small></li>`).join('');
  openModal('Diagnóstico da instalação',`<div class="diagnostic-summary"><p><strong>${diag.ok?'Instalação confirmada':'Instalação incompleta'}</strong></p><p>Conta: ${esc(diag.user?.email||'—')}<br>Base principal: ${diag.mainFile?esc(diag.mainFile.name||'Marco_Iris_Dados.json'):'não encontrada'}<br>Bridge: ${diag.bridgeFile?`${diag.bridgeFile.recordCount} registro(s) · revisão ${diag.bridgeFile.revision}`:'não encontrado'}<br>Instância: ${esc(diag.companyInstanceId||'—')}</p><ul>${folders}</ul></div>`);
  setSaveStatus(diag.ok?'Instalação confirmada por leitura':'Diagnóstico encontrou pendências',diag.ok?'ok':'warn');
  if(!diag.ok)throw new Error('O diagnóstico não confirmou todos os arquivos obrigatórios.');
  return diag;
}

async function deleteConsent(id){const c=data().consents.find(x=>x.id===id);if(!c||!await confirmAction(`Excluir definitivamente o termo ${c.id}?`))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-termo');data().consents=data().consents.filter(x=>x.id!==id);await persist('Termo excluído',`${c.id} · ${c.clientName}`);closeModal();renderView();toast('Termo excluído.');}
async function deleteAppointment(id){const a=data().appointments.find(x=>x.id===id);if(!a||!await confirmAction(`Excluir o agendamento “${a.title}”?`))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-agendamento');if(a.orderId){const o=findOrder(a.orderId);if(o)o.sourceAppointmentId='';}data().appointments=data().appointments.filter(x=>x.id!==id);await persist('Agendamento excluído',`${id} · ${a.title}`);renderView();toast('Agendamento excluído.');}
async function deleteClient(id){const c=findClient(id);if(!c)return;const deps={orders:data().serviceOrders.filter(o=>o.clientId===id).length,appointments:data().appointments.filter(a=>a.clientId===id).length,consents:data().consents.filter(t=>t.clientId===id).length};if(deps.orders||deps.appointments||deps.consents)throw new Error(`Cliente não pode ser excluído: possui ${deps.orders} OSV(s), ${deps.appointments} agendamento(s) e ${deps.consents} termo(s). Arquive o cliente ou remova os vínculos primeiro.`);if(!await confirmAction(`Excluir definitivamente ${c.name}?`))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-cliente');data().clients=data().clients.filter(x=>x.id!==id);await persist('Cliente excluído',`${id} · ${c.name}`);closeModal();renderView();toast('Cliente excluído.');}
async function toggleClientStatus(id){const c=findClient(id);if(!c)return;c.status=c.status==='Inativo'?'Ativo':'Inativo';await persist(c.status==='Ativo'?'Cliente restaurado':'Cliente arquivado',`${id} · ${c.name}`);renderView();toast(c.status==='Ativo'?'Cliente restaurado.':'Cliente arquivado.');}
async function toggleOrderStatus(id){const o=findOrder(id);if(!o)return;o.registrationStatus=o.registrationStatus==='Inativo'?'Ativo':'Inativo';await persist(o.registrationStatus==='Ativo'?'OSV restaurada':'OSV arquivada',id);renderView();toast(o.registrationStatus==='Ativo'?'OSV restaurada.':'OSV arquivada.');}
async function deleteOrder(id){const o=findOrder(id);if(!o)return;const items=orderItems(id),payments=orderPayments(id),terms=orderConsentItems(id),media=[...(o.photos||[]),...(o.pdfs||[]),...(o.attachments||[])];if(!await confirmAction(`Excluir definitivamente ${id}? Serão removidos ${items.length} item(ns), ${payments.length} lançamento(s), ${terms.length} termo(s) e ${media.length} arquivo(s). O estoque automático será revertido.`))return;if(!await confirmAction('Esta é a confirmação final. Um backup no Google Drive será criado antes da exclusão. Continuar?'))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-os');for(const m of media){if(m.localKey)await MarcoStorage.deleteMedia(m.localKey);if(m.driveFileId&&GoogleDriveMarco.isConfigured()){try{await GoogleDriveMarco.trash(m.driveFileId);}catch(e){console.warn(e);}}}const itemIds=new Set(items.map(i=>i.id));data().stockMovements=data().stockMovements.filter(m=>{if(itemIds.has(m.sourceItemId)||(m.orderId===id&&m.sourceItemId))return false;if(m.orderId===id){m.orderId='';m.notes=[m.notes,`Vínculo removido após exclusão da ${id}`].filter(Boolean).join(' · ');}return true;});data().orderItems=data().orderItems.filter(i=>i.orderId!==id);data().payments=data().payments.filter(p=>p.orderId!==id);data().consents=data().consents.filter(t=>t.orderId!==id);data().appointments.forEach(a=>{if(a.orderId===id)a.orderId='';});data().serviceOrders=data().serviceOrders.filter(x=>x.id!==id);await persist('OSV excluída com vínculos',id);closeModal();renderView();toast(`${id} excluída e vínculos tratados.`);}
async function toggleCatalogStatus(kind,id){const list=kind==='product'?data().products:kind==='service'?data().services:data().supplies,item=list.find(x=>x.id===id);if(!item)return;item.status=item.status==='Inativo'?'Ativo':'Inativo';await persist(item.status==='Ativo'?'Cadastro restaurado':'Cadastro arquivado',`${id} · ${item.description}`);renderView();toast(item.status==='Ativo'?'Cadastro restaurado.':'Cadastro arquivado.');}
async function deleteCatalogItem(kind,id){const list=kind==='product'?data().products:kind==='service'?data().services:data().supplies,item=list.find(x=>x.id===id);if(!item)return;const refs=data().orderItems.filter(i=>(kind==='product'&&i.productId===id)||(kind==='service'&&i.serviceId===id)||(kind==='supply'&&i.supplyId===id)).length,moves=data().stockMovements.filter(m=>(kind==='product'&&m.productId===id)||(kind==='supply'&&m.supplyId===id)).length;if(refs||moves)throw new Error(`Não é possível excluir: ${refs} item(ns) de OSV e ${moves} movimentação(ões) usam este cadastro. Arquive-o para manter o histórico.`);if(!await confirmAction(`Excluir definitivamente “${item.description}”?`))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-catalogo');if(kind==='product')data().products=data().products.filter(x=>x.id!==id);else if(kind==='service')data().services=data().services.filter(x=>x.id!==id);else data().supplies=data().supplies.filter(x=>x.id!==id);await persist('Cadastro de catálogo excluído',`${id} · ${item.description}`);renderView();toast('Cadastro excluído.');}
async function deleteStockMovement(id){const m=data().stockMovements.find(x=>x.id===id);if(!m)return;if(m.sourceItemId)throw new Error('Movimentação automática: edite a OSV de origem.');if(!await confirmAction(`Excluir a movimentação ${id}? O saldo será recalculado automaticamente.`))return;await MarcoStorage.createBackup(STATE,'antes-de-excluir-movimento');data().stockMovements=data().stockMovements.filter(x=>x.id!==id);await persist('Movimentação de estoque excluída',id);renderView();toast('Movimentação excluída e saldo recalculado.');}
function pickAttachmentsForOrder(orderId){const o=findOrder(orderId);if(!o)return;const input=document.createElement('input');input.type='file';input.multiple=true;input.onchange=async()=>{try{const count=await addAttachmentsToOrder(o,[...(input.files||[])]);openOrderDetail(orderId);toast(`${count} anexo(s) adicionado(s).`);}catch(e){toast(e.message,'error');}};input.click();}

function openCatalogCreateForActiveTab(){if(ACTIVE_TAB.catalog==='services')openServiceForm();else if(ACTIVE_TAB.catalog==='products')openProductForm();else if(ACTIVE_TAB.catalog==='supplies')openSupplyForm();else openStockMovementForm();}

async function handleAction(btn){
  const a=btn.dataset.action;
  try{
    if(a==='login'){await submitLogin(btn.closest('form[data-form="login"]'));return;}
    if(a==='login-offline'){await submitOfflineLogin(btn.closest('form[data-form="login"]'));return;}
    if(a==='navigate'){await navigateTo(btn.dataset.view);return;}
    if(a==='toggle-menu'){toggleMobileMenu();return;}
    if(a==='close-menu'){closeMobileMenu();return;}
    if(a==='close-modal'){closeModal();return;}
    if(a==='toggle-expandable-filter'){toggleExpandableFilter(btn.closest('[data-expandable-filter]'));return;}
    if(a==='set-view-mode'){if(setViewMode(btn.dataset.section,btn.dataset.mode)){collapseExpandableFilter(btn.closest('[data-expandable-filter]'));await persist('Modo de visualização atualizado',`${btn.dataset.section}: ${btn.dataset.mode}`,{folder:false,google:false});renderView('soft');}return;}
    if(a==='new-client'){openClientForm();return;}if(a==='edit-client'){openClientForm(btn.dataset.id);return;}if(a==='view-client'){openClientDetail(btn.dataset.id);return;}if(a==='delete-client'){await deleteClient(btn.dataset.id);return;}if(a==='toggle-client-status'){await toggleClientStatus(btn.dataset.id);return;}if(a==='archive-client-from-form'){const id=btn.dataset.id,c=findClient(id);if(!c)return;if(!await confirmAction(`Arquivar ${c.name}? O cadastro fica inativo e o código ${id} não é reutilizado. Você pode restaurá-lo depois em "Clientes Arquivados".`,{confirmLabel:'Arquivar'}))return;await toggleClientStatus(id);closeModal();return;}if(a==='toggle-archived-clients'){SHOW_ARCHIVED.clients=!SHOW_ARCHIVED.clients;renderView();return;}
    if(a==='new-order'){openOrderForm('',{clientId:btn.dataset.client||''});return;}if(a==='edit-order'){openOrderForm(btn.dataset.id);return;}if(a==='view-order'){openOrderDetail(btn.dataset.id);return;}if(a==='delete-order'){await deleteOrder(btn.dataset.id);return;}if(a==='toggle-order-status'){await toggleOrderStatus(btn.dataset.id);return;}if(a==='toggle-archived-orders'){SHOW_ARCHIVED.orders=!SHOW_ARCHIVED.orders;renderView();return;}
    if(a==='new-payment'){openPaymentForm('',btn.dataset.order||'');return;}if(a==='edit-payment'){openPaymentForm(btn.dataset.id);return;}
    if(a==='cancel-payment'){const p=data().payments.find(x=>x.id===btn.dataset.id);if(p&&await confirmAction(`Cancelar a venda ${p.code||p.id}? Ela sairá da lista e, se já estiver no Borion, será removida na próxima sincronização.`,{confirmLabel:'Cancelar venda',tone:'danger'})){await MarcoStorage.createBackup(STATE,'antes-de-cancelar-lancamento');p.status='Cancelado';p.active=false;p.cancelledAt=nowIso();p.updatedAt=nowIso();await persist('Venda cancelada',p.code||p.id,{immediate:true});renderView();toast('Venda cancelada. A remoção no Borion foi programada.');}return;}
    if(a==='delete-payment'){const p=data().payments.find(x=>x.id===btn.dataset.id);if(p&&await confirmAction(`Excluir definitivamente o lançamento ${p.code||p.id}? Ao contrário de cancelar, ele sai completamente da lista (sem manter histórico) e, se já estiver no Borion, será removido na próxima sincronização.`,{confirmLabel:'Excluir definitivamente',tone:'danger'})){await MarcoStorage.createBackup(STATE,'antes-de-excluir-lancamento');data().payments=data().payments.filter(x=>x.id!==p.id);await persist('Lançamento excluído definitivamente',p.code||p.id,{immediate:true});renderView();toast('Lançamento excluído. A remoção no Borion foi programada.');}return;}
    if(a==='new-appointment'){openAppointmentForm('',{date:btn.dataset.date||AGENDA_SELECTED||today()});return;}
    if(a==='agenda-prev'){AGENDA_CURSOR=monthShift(AGENDA_CURSOR,-1);renderView('left');return;}
    if(a==='agenda-next'){AGENDA_CURSOR=monthShift(AGENDA_CURSOR,1);renderView('right');return;}
    if(a==='agenda-today'){AGENDA_CURSOR=today().slice(0,7);AGENDA_SELECTED=today();renderView('soft');return;}
    if(a==='agenda-select-day'){AGENDA_SELECTED=btn.dataset.date;AGENDA_CURSOR=String(btn.dataset.date).slice(0,7);renderView('soft');return;}if(a==='edit-appointment'){openAppointmentForm(btn.dataset.id);return;}if(a==='delete-appointment'){await deleteAppointment(btn.dataset.id);return;}
    if(a==='appointment-to-order'){const x=data().appointments.find(v=>v.id===btn.dataset.id);if(x)openOrderForm('',{clientId:x.clientId,reportedIssue:x.notes,internalNotes:`Criada a partir do agendamento ${x.id} de ${formatDate(x.date)} ${x.time||''}.`,sourceAppointmentId:x.id});return;}
    if(a==='stock-tab'){ACTIVE_TAB.stock=btn.dataset.tab;renderView();return;}if(a==='catalog-tab'){ACTIVE_TAB.catalog=btn.dataset.tab;renderView();return;}if(a==='documents-tab'){ACTIVE_TAB.documents=btn.dataset.tab;renderView();return;}if(a==='toggle-archived-catalog'){SHOW_ARCHIVED.catalog=!SHOW_ARCHIVED.catalog;renderView();return;}
    if(a==='new-stock-movement'){openStockMovementForm();return;}if(a==='edit-stock-movement'){openStockMovementForm(btn.dataset.id);return;}if(a==='delete-stock-movement'){await deleteStockMovement(btn.dataset.id);return;}if(a==='new-catalog-item'){openCatalogCreateForActiveTab();return;}
    if(a==='edit-product'){openProductForm(btn.dataset.id);return;}if(a==='edit-service'){openServiceForm(btn.dataset.id);return;}if(a==='edit-supply'){openSupplyForm(btn.dataset.id);return;}if(a==='toggle-catalog-status'){await toggleCatalogStatus(btn.dataset.kind,btn.dataset.id);return;}if(a==='delete-catalog-item'){await deleteCatalogItem(btn.dataset.kind,btn.dataset.id);return;}
    if(a==='add-item-row'){const host=$('#order-items-editor');host.insertAdjacentHTML('beforeend',orderItemRow({}));updateOrderFormTotal();return;}
    if(a==='remove-item-row'){btn.closest('.item-editor-row')?.remove();updateOrderFormTotal();return;}
    if(a==='add-order-photos'){pickPhotosForOrder(btn.dataset.id,btn.dataset.mode||'camera');return;}if(a==='add-order-files'){pickAttachmentsForOrder(btn.dataset.id);return;}
    if(a==='generate-pdf'){await generatePdfForOrder(btn.dataset.id,false);return;}if(a==='share-order'){await generatePdfForOrder(btn.dataset.id,true);return;}
    if(a==='open-pdf'||a==='open-order-file'){await openPdfMedia(btn.dataset.order,btn.dataset.media);return;}if(a==='delete-media'){await deleteMedia(btn.dataset.order,btn.dataset.media);return;}
    if(a==='new-consent'){openConsentForm('',{clientId:btn.dataset.client||'',orderId:btn.dataset.order||''});return;}if(a==='edit-consent'){openConsentForm(btn.dataset.id);return;}if(a==='print-consent'){printConsent(btn.dataset.id);return;}if(a==='delete-consent'){await deleteConsent(btn.dataset.id);return;}if(a==='repair-links'){await repairSafeLinks();return;}if(a==='export-finance'){exportFinanceCsv();return;}if(a==='manual-save'){await manualSave();return;}if(a==='export-json'){MarcoStorage.downloadJson(STATE);return;}
    if(a==='import-json'){$('#json-import').click();return;}if(a==='import-media'){$('#media-import').click();return;}
    if(a==='local-backups'){await openLocalBackups();return;}if(a==='restore-backup'){const restored=await MarcoStorage.restoreBackup(btn.dataset.id);if(restored&&await confirmAction('Restaurar este backup e substituir os dados atuais?')){await MarcoStorage.createBackup(STATE,'antes-de-restaurar-backup');STATE=restored;await backupStateBeforeV220Migration(STATE,'restauracao');normalizeState();await MarcoStorage.save(STATE);closeModal();renderShell();toast('Backup restaurado.');}return;}
    if(a==='connect-google'){await connectGoogle();return;}if(a==='sync-google'){await syncGoogle();return;}if(a==='load-google'){await loadGoogle();return;}if(a==='diagnose-drive'){await diagnoseDriveInstallation();return;}
    if(a==='disconnect-google'){if(await confirmAction('Desconectar esta conta e esquecer a pasta neste navegador? Nenhum arquivo será apagado.')){GoogleDriveMarco.disconnect();renderView();toast('Conta Google desconectada.');}return;}
    if(a==='connect-folder'){await connectFolder();return;}if(a==='edit-company'){openCompanyForm();return;}if(a==='set-pin'){openPinForm();return;}if(a==='lock-now'){await lockApp();return;}if(a==='remove-pin'){if(await confirmAction('Remover a proteção por PIN deste perfil?')){activeProfile().pin='';await persist('PIN de acesso removido','Proteção local desativada.');renderView();toast('PIN removido.');}return;}
    if(a==='toggle-privacy'){data().settings.dashboardPrivacy=!data().settings.dashboardPrivacy;await persist('Privacidade do painel alterada','',{folder:false,google:false});renderView();return;}
  }catch(e){console.error(e);setSaveStatus('Ação pendente','warn');toast(e.message||'Não foi possível concluir a ação.','error');}
}

async function handleSubmit(form){try{if(form.dataset.form==='login')await submitLogin(form);else if(form.dataset.form==='client')await saveClientForm(form);else if(form.dataset.form==='order')await saveOrderForm(form);else if(form.dataset.form==='payment')await savePaymentForm(form);else if(form.dataset.form==='appointment')await saveAppointmentForm(form);else if(form.dataset.form==='product')await saveProductForm(form);else if(form.dataset.form==='service')await saveServiceForm(form);else if(form.dataset.form==='supply')await saveSupplyForm(form);else if(form.dataset.form==='stock-movement')await saveStockMovement(form);else if(form.dataset.form==='consent')await saveConsentForm(form);else if(form.dataset.form==='company')await saveCompanyForm(form);else if(form.dataset.form==='pin')await savePinForm(form);}catch(e){console.error(e);toast(e.message||'Não foi possível salvar.','error');}}

document.addEventListener('click',e=>{const btn=e.target.closest('[data-action]');if(btn){e.preventDefault();handleAction(btn);return;}if(!e.target.closest('[data-expandable-filter]'))document.querySelectorAll('[data-expandable-filter].is-open').forEach(c=>collapseExpandableFilter(c));});
document.addEventListener('submit',e=>{const form=e.target.closest('form[data-form]');if(form){e.preventDefault();handleSubmit(form);}});
document.addEventListener('input',e=>{
  if(e.target.id==='global-search'){SEARCH=e.target.value;clearTimeout(SEARCH_RENDER_TIMER);SEARCH_RENDER_TIMER=setTimeout(()=>renderView('none'),90);return;}
  if(e.target.closest('form[data-form="order"]')&&(e.target.matches('[data-item-field="qty"],[data-item-field="price"],[name="discount"]')))updateOrderFormTotal();
});
document.addEventListener('change',async e=>{
  if(e.target.id==='order-status-filter'){renderView('soft');return;}
  if(e.target.matches('[data-item-field="type"]')){updateItemReference(e.target.closest('.item-editor-row'));return;}
  if(e.target.matches('[data-item-field="ref"]')){updateItemPrice(e.target.closest('.item-editor-row'));return;}
  if(e.target.matches('[data-stock-type]')){const form=e.target.closest('form'),type=e.target.value;form.querySelector('[data-stock-item]').innerHTML=itemReferenceOptions(type);return;}
  if(e.target.matches('[data-setting]')){const key=e.target.dataset.setting;if(key==='autosaveGoogle'||key==='autosaveFolder'){data().settings.autosaveGoogle=true;data().settings.autosaveFolder=false;e.target.checked=key==='autosaveGoogle';toast('O modo nuvem obrigatória não pode ser desativado.','warn');renderView();return;}data().settings[key]=e.target.checked;await persist('Preferência atualizada',key);renderView();return;}
});
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();manualSave();}if(e.key==='Escape'&&$('#modal-root').children.length)closeModal();});

$('#json-import')?.addEventListener('change',async e=>{const input=e.target,file=input.files?.[0];if(!file)return;try{if(!navigator.onLine)throw new Error('Internet obrigatória para importar dados.');const incoming=await MarcoStorage.readUploadedJson(file);if(!await confirmAction('Importar este arquivo substituirá a base oficial do Google Drive. Um backup na nuvem será criado antes. Continuar?'))return;await MarcoStorage.createBackup(STATE,'antes-da-importacao');STATE=incoming;normalizeState();await persist('Dados privados importados','Importação JSON confirmada no Google Drive',{backup:true});renderShell();toast('Dados importados e confirmados no Google Drive. Agora importe fotos, PDFs e anexos.');}catch(err){toast(err.message,'error');}finally{input.value='';}});
$('#media-import')?.addEventListener('change',async e=>{const input=e.target,files=[...(input.files||[])];if(!files.length)return;try{await importExistingMedia(files);}catch(err){console.error(err);toast(err.message||'Falha na importação de mídias.','error');}finally{input.value='';}});

function startAutoBackupRotation(){
  clearInterval(AUTO_BACKUP_TIMER);
  AUTO_BACKUP_TIMER=setInterval(async()=>{
    try{
      if(!STATE||LOCKED||!navigator.onLine||!GoogleDriveMarco.isConfigured())return;
      if(STATE.updatedAt===LAST_AUTO_BACKUP_AT)return;
      await GoogleDriveMarco.writeAutosave(STATE,{force:false});
      await publishBridgeConfirmed();
      LAST_AUTO_BACKUP_AT=STATE.updatedAt;
    }catch(e){console.warn('Backup automático no Drive falhou:',e);setSaveStatus('Base no Drive · backup automático pendente','warn');}
  },60000);
}

function stateNeedsV220Migration(state){
  if(!state||Number(state.schemaVersion||0)<5)return true;
  const specs=[['serviceOrders','OSV'],['clients','CLI'],['products','PRD'],['services','SRV'],['supplies','INS'],['orderItems','ITM'],['stockMovements','MOV'],['appointments','AGE'],['consents','TER']];
  for(const d of Object.values(state.dataByProfile||{})){
    if(!d||typeof d!=='object')continue;
    for(const [key,prefix] of specs)for(const item of d[key]||[])if(window.MarcoIdentifiers?.normalizeEntityCode(item?.id,prefix)!==item?.id)return true;
    for(const payment of d.payments||[]){const prefix=norm(payment.type)==='despesa'?'DES':'REC';if(window.MarcoIdentifiers?.normalizeEntityCode(payment.id||payment.code,prefix)!==payment.id)return true;}
    for(const client of d.clients||[]){const source=client.phoneNormalized||client.phone||'',result=window.MarcoPhone?.normalizeBrazilianPhone(source);if(result?.valid&&(client.phone!==result.formatted||client.phoneNormalized!==result.normalizedDigits||client.phoneE164!==result.e164))return true;if(result&&!result.valid&&String(source).trim()&&!client.phoneReviewRequired)return true;}
  }
  return false;
}
function v220MigrationInventory(state){
  const inventory={profiles:0,clients:0,serviceOrders:0,orderItems:0,payments:0,products:0,services:0,supplies:0,stockMovements:0,appointments:0,consents:0};
  for(const d of Object.values(state?.dataByProfile||{})){if(!d||typeof d!=='object')continue;inventory.profiles++;for(const key of Object.keys(inventory)){if(key!=='profiles')inventory[key]+=Array.isArray(d[key])?d[key].length:0;}}
  return inventory;
}
async function backupStateBeforeV220Migration(state,reason='carregamento'){
  if(!state||!stateNeedsV220Migration(state))return false;
  const sourceVersion=String(state.schemaVersion||'desconhecida'),preparedAt=nowIso(),snapshot=clone(state);
  snapshot.migrationPreparation={targetVersion:'2.2.0',sourceVersion,preparedAt,reason,inventory:v220MigrationInventory(state)};
  if(window.GoogleDriveMarco?.isConfigured?.()&&navigator.onLine){
    await GoogleDriveMarco.writeForceSave(snapshot);
  }
  return true;
}

function renderCloudRequired(message='Sem internet. O Marco Iris depende 100% do Google Drive.'){
  LOCKED=true;
  window.MarcoBorionInterop?.setNotReady?.(message);
  document.body.classList.add('login-page');
  const root=$('#root');
  if(root)root.innerHTML=`<main class="login-screen"><section class="lock-shell"><div class="lock-brand-panel"><div class="lock-brand-top"><img src="assets/marco-symbol.png" alt="Símbolo Marco Iris"><div><h1 class="lock-title">Marco Iris</h1><span class="lock-subtitle">Nuvem obrigatória</span></div></div><p class="lock-tagline">${esc(message)}</p></div><div class="login-card login-card-compact"><div class="profile-option"><div class="avatar">!</div><div class="spacer"><strong>Conexão necessária</strong><small>Nenhum dado é carregado ou salvo neste dispositivo.</small></div>${icon('cloud')}</div><button class="btn primary" type="button" onclick="location.reload()">Tentar novamente</button></div></section></main>`;
}

async function boot(){
  await MarcoStorage.purgeLegacyData?.();
  STATE=clone(window.MARCO_INITIAL_DATA);
  normalizeState();
  LAST_CONFIRMED_STATE=null;
  LOCKED=true;
  if(!navigator.onLine){renderCloudRequired();return;}
  renderLogin();
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('./sw.js?v=2.5.1').then(reg=>reg?.update?.()).catch(e=>console.warn('Service worker:',e));
  }
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();window.__installPrompt=e;});
  window.addEventListener('offline',()=>renderCloudRequired('A internet caiu. O aplicativo foi bloqueado para evitar qualquer alteração fora do Google Drive.'));
  window.addEventListener('online',()=>{if(LOCKED)location.reload();});
  startAutoBackupRotation();
  startRemoteRefresh();
}
window.MarcoAppBoot=()=>boot().catch(e=>{console.error(e);document.body.innerHTML=`<div class="empty"><h2>Não foi possível iniciar o sistema.</h2><p>${esc(e.message)}</p></div>`;});
