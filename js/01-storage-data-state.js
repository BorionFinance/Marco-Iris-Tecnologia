/* Borion Finance — Storage/localStorage, perfis, categorias padrão, dados iniciais, migração e estado global. */

/* ---------------- Storage layer ---------------- */
const LS_CONFIG = 'mc_config';
const LS_PROFILES = 'mc_profiles';
const LS_SESSION = 'mc_session';
const LS_DATA_PREFIX = 'mc_data_';
const LS_EXIT_SAVE_PREFIX = 'borion_exit_save_confirm_';
/* V6.3.0 — modo de armazenamento escolhido pela pessoa: 'offline' (usar sem conta,
   só neste dispositivo) ou 'cloud' (login Supabase). null = ainda não escolheu, mantém
   o comportamento de sempre mostrar a tela de login Supabase primeiro. Ver storageProvider
   em js/01b-storage-provider.js e o bypass em boot() (14-events-boot-pwa.js). */
const LS_STORAGE_MODE = 'borion_storage_mode';
function getStorageMode(){ return readJSON(LS_STORAGE_MODE, null); }
function setStorageMode(mode){ writeJSON(LS_STORAGE_MODE, mode); }

const APP_NAME = 'Borion Finance';
/* V5.36.0 — id fixo da conta "Carteira" (dinheiro físico). Nunca muda entre migrações,
   nunca é excluída pelo usuário e serve para diferenciar dinheiro físico de banco/cartão. */
const CARTEIRA_CONTA_ID = 'carteira-fixa';
const FORMAS_PAGAMENTO = ['Dinheiro','Pix','Débito','Crédito','Transferência'];
const DEFAULT_ICON_COLORS = { liquidez:'#22c55e', bens:'#3b6bf0', investimentos:'#cca160', dividas:'#ef4444', receita:'#22c55e', despesas:'#ef4444', investir:'#3b6bf0', saldo:'#eef1f4' };
const ICON_COLOR_LABELS = { liquidez:'Saldo em Contas', bens:'Bens', investimentos:'Investimentos', dividas:'Dívidas', receita:'Receita', despesas:'Despesas', investir:'Investir', saldo:'Saldo' };
const FONT_STACKS = {
  default: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
  elegante: 'Georgia,"Times New Roman",serif',
  moderna: '"Trebuchet MS",Verdana,sans-serif',
  arredondada: 'Verdana,Geneva,sans-serif',
  mono: 'Consolas,"Courier New",monospace'
};
const FONT_LABELS = { default:'Padrão', elegante:'Elegante (serifada)', moderna:'Moderna', arredondada:'Arredondada', mono:'Monoespaçada' };

/* Tipos de origem de receita: separa dinheiro próprio de reembolso/repasse de terceiros. */
const TX_ORIGEM_LABELS = { propria:'Receita própria', rendimento:'Rendimento', reembolso:'Reembolso recebido', repasse:'Repasse de terceiros' };
const TX_ORIGEM_OPTIONS = ['Receita própria','Rendimento','Reembolso recebido','Repasse de terceiros'];
function txOrigemToKey(label){
  if(label==='Rendimento') return 'rendimento';
  if(label==='Reembolso recebido') return 'reembolso';
  if(label==='Repasse de terceiros') return 'repasse';
  return 'propria';
}
function txOrigemToLabel(key){ return TX_ORIGEM_LABELS[key] || TX_ORIGEM_LABELS.propria; }

const DEFAULT_PROFILE_COLORS = ['#1f8a5b','#7c5cff','#c9a45c','#2563eb','#be123c','#0f766e','#9333ea','#ea580c'];
const DEFAULT_MODULES = { reserves:true, imports:true, investments:true, agenda:true };
const DEFAULT_DASHBOARD_WIDGETS = ['fluxoMensal','evolucaoPatrimonio','evolucaoDividasCartao','distribuicaoPatrimonio','gastosCategoria','gastosCartao','distribuicaoBanco','resumoBanco'];
const DASHBOARD_WIDGET_LABELS = {
  fluxoMensal:'Fluxo mensal',
  evolucaoPatrimonio:'Evolução do patrimônio',
  evolucaoDividasCartao:'Evolução das dívidas (cartões + boletos)',
  distribuicaoPatrimonio:'Distribuição de patrimônio',
  gastosCategoria:'Gastos por categoria',
  gastosCartao:'Gastos por cartão',
  distribuicaoBanco:'Distribuição por banco',
  resumoBanco:'Resumo por banco'
};

function readJSON(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    if(raw==null) return fallback;
    return JSON.parse(raw);
  }catch(e){ return fallback; }
}
function writeJSON(key, val){
  try{ localStorage.setItem(key, JSON.stringify(val)); return true; }
  catch(e){ console.error('Storage error', e); return false; }
}

function getConfig(){
  const stored = readJSON(LS_CONFIG, {});
  return {
    iconColors: Object.assign({}, DEFAULT_ICON_COLORS, stored.iconColors||{}),
    font: stored.font || 'default',
    theme: stored.theme || 'dark',
    /* V6.23.5 — interface adaptativa. "auto" usa Smartphone Mode até 820 px e
       mantém o Modo Pro em telas maiores. O usuário também pode forçar um dos modos. */
    uiMode: ['auto','pro','smartphone'].includes(stored.uiMode) ? stored.uiMode : 'auto',
    popupNotifs: Object.assign({enabled:true, durationMs:40000}, stored.popupNotifs||{})
  };
}
function setConfig(cfg){ writeJSON(LS_CONFIG, cfg); }
function applyFont(){ document.body.style.fontFamily = FONT_STACKS[S.config.font] || FONT_STACKS.default; }
function resolvedInterfaceMode(){
  const pref=(S&&S.config&&S.config.uiMode)||'auto';
  if(pref==='smartphone') return 'smartphone';
  if(pref==='pro') return 'pro';
  return (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) ? 'smartphone' : 'pro';
}
function isSmartphoneMode(){ return resolvedInterfaceMode()==='smartphone'; }
function applyInterfaceMode(){
  const mode=resolvedInterfaceMode();
  document.documentElement.setAttribute('data-interface-mode',mode);
  if(document.body){
    document.body.classList.toggle('smartphone-mode',mode==='smartphone');
    document.body.classList.toggle('pro-mode',mode==='pro');
  }
  if(typeof window.syncGlobalScrollLockState==='function')
    window.syncGlobalScrollLockState({source:'applyInterfaceMode'});
  return mode;
}
function applyTheme(){
  const choice = (S && S.config && S.config.theme) || 'dark';
  const resolved = choice==='system'
    ? ((window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark')
    : choice;
  document.documentElement.setAttribute('data-theme', resolved==='light'?'light':'dark');
  document.documentElement.setAttribute('data-theme-choice', choice);
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', resolved==='light' ? '#f7f2e7' : '#060a10');
}
function iconColor(key){ return (S.config.iconColors && S.config.iconColors[key]) || '#8b969f'; }
function hexToRgba(hex, alpha){
  hex = String(hex).replace('#','');
  if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
  const r=parseInt(hex.substr(0,2),16)||0, g=parseInt(hex.substr(2,2),16)||0, b=parseInt(hex.substr(4,2),16)||0;
  return `rgba(${r},${g},${b},${alpha})`;
}
function badgeHTML(key, emoji){
  const c = iconColor(key);
  return `<span class="badge" style="background:${hexToRgba(c,.15)};color:${c}">${emoji}</span>`;
}
/* Etiqueta translúcida colorida usada nos cards de destaque (Patrimônio, Lançamentos) no lugar
   de um ícone pequeno isolado. Usa a cor configurável de iconColor(key) para manter o mesmo
   padrão visual em todas as telas que exibem cards de indicadores. */
function tagBadgeHTML(key, label){
  const c = iconColor(key);
  return `<span class="tag-badge" style="color:${c};background:${hexToRgba(c,.14)};border-color:${hexToRgba(c,.36)};box-shadow:0 0 0 1px ${hexToRgba(c,.08)} inset,0 6px 16px ${hexToRgba(c,.16)};">${esc(label)}</span>`;
}

function profileAvatarBg(profile){ return (profile && profile.avatarColor) || avatarColor((profile && profile.name) || 'Perfil'); }
function profileAvatarHTML(profile, extraClass=''){
  const p = profile || {};
  const cls = ('profile-avatar '+extraClass).trim();
  if(p.avatarImage){
    const img = String(p.avatarImage).replace(/"/g,'&quot;');
    return `<div class="${cls} has-photo" style="background-image:url(&quot;${img}&quot;)"></div>`;
  }
  return `<div class="${cls}" style="background:${profileAvatarBg(p)}">${esc(initials(p.name||'Perfil'))}</div>`;
}

const LS_PROFILE_TOMBSTONES_6401='borion_profile_tombstones_v6401';
function getProfiles(){ return readJSON(LS_PROFILES, []); }
function setProfiles(list){ writeJSON(LS_PROFILES, list); }
function getProfileTombstones6401(){ const v=readJSON(LS_PROFILE_TOMBSTONES_6401,{}); return v&&typeof v==='object'&&!Array.isArray(v)?v:{}; }
function setProfileTombstones6401(v){ writeJSON(LS_PROFILE_TOMBSTONES_6401,v||{}); }
function recordProfileDeletion6401(profileId,reason='user_delete'){
  if(!profileId) return null;
  const all=getProfileTombstones6401();
  const provider=window.GoogleDriveProvider||null;
  let opId=provider&&provider._queueOperationId;
  if(!opId) opId=(window.BorionSyncCore&&BorionSyncCore.uuid640?BorionSyncCore.uuid640():uid());
  // A marca de exclusão e o arquivo imutável enviado ao Drive precisam carregar
  // exatamente o mesmo operationId. Sem isto, a exclusão podia ficar registrada
  // com um ID e a fila durável criar outro, dificultando confirmação e recuperação.
  if(provider&&provider.isConnected&&provider.isConnected()&&!provider._queueOperationId) provider._queueOperationId=opId;
  const deviceId=(provider&&provider._deviceId)||null;
  const tomb={profileId:String(profileId),deletedAt:new Date().toISOString(),deviceId,operationId:opId,reason};
  all[String(profileId)]=tomb; setProfileTombstones6401(all); return tomb;
}
function applyProfileTombstones6401(v){ if(v&&typeof v==='object'&&!Array.isArray(v)) setProfileTombstones6401(v); }
function clearProfileDeletion6401(profileId){ const all=getProfileTombstones6401(); delete all[String(profileId)]; setProfileTombstones6401(all); }

function getSession(){ return readJSON(LS_SESSION, null); }
function setSession(s){ if(s) writeJSON(LS_SESSION, s); else localStorage.removeItem(LS_SESSION); }

function exitSaveProfileId(){ return (S && S.currentProfile && S.currentProfile.id) ? S.currentProfile.id : 'sem_perfil'; }
function exitSaveKey(profileId){ return LS_EXIT_SAVE_PREFIX + (profileId || exitSaveProfileId()); }
function markExitSavePending(profileId){
  try{ writeJSON(exitSaveKey(profileId), {pending:true, updatedAt:Date.now()}); }catch(e){}
  if(window.ExitSaveGuard && typeof ExitSaveGuard.refresh==='function'){ ExitSaveGuard.dismissed=false; ExitSaveGuard.refresh(); }
}
function clearExitSavePending(profileId){
  try{ localStorage.removeItem(exitSaveKey(profileId)); }catch(e){}
  if(window.ExitSaveGuard && typeof ExitSaveGuard.refresh==='function') ExitSaveGuard.refresh();
}
function hasExitSavePending(profileId){
  const info = readJSON(exitSaveKey(profileId), null);
  return !!(info && info.pending);
}

function getProfileData(id){ return readJSON(LS_DATA_PREFIX+id, null); }
function setProfileData(id, data){
  writeJSON(LS_DATA_PREFIX+id, data);
  // V5.34.1 — os dados financeiros do perfil agora também são gravados "de
  // verdade" no IndexedDB (armazenamento durável e com mais espaço). O
  // localStorage continua recebendo a mesma escrita para servir de cache
  // rápido/síncrono para a UI, mas deixa de ser o único lugar onde os dados existem.
  idbSetProfileData(id, data);
}

/* ---------------- IndexedDB: armazenamento principal dos dados financeiros por perfil ----------------
   Config simples (mc_config, mc_session, mc_profiles) permanecem só no localStorage.
   Os dados financeiros de cada perfil (antes só em mc_data_<id> no localStorage) agora
   são persistidos no IndexedDB via write-through: toda chamada de setProfileData grava
   nos dois lugares. A leitura da UI continua síncrona via localStorage (getProfileData)
   para não travar a renderização, mas nos pontos de entrada de um perfil (login local,
   troca de perfil, carregamento offline da nuvem) o app tenta primeiro hidratar a partir
   do IndexedDB com hydrateProfileDataFromIDB(id), que é a fonte mais durável. */
const BORION_IDB_DATA_NAME = 'borion_findata_v1';
const BORION_IDB_DATA_STORE = 'profile_data';
function borionDataIdbOpen(){
  return new Promise((resolve, reject)=>{
    if(!('indexedDB' in window)){ reject(new Error('IndexedDB indisponível neste navegador.')); return; }
    const req = indexedDB.open(BORION_IDB_DATA_NAME, 1);
    req.onupgradeneeded = ()=>{ if(!req.result.objectStoreNames.contains(BORION_IDB_DATA_STORE)) req.result.createObjectStore(BORION_IDB_DATA_STORE); };
    req.onsuccess = ()=> resolve(req.result);
    req.onerror = ()=> reject(req.error);
  });
}
async function idbGetProfileData(id){
  if(!id) return null;
  try{
    const db = await borionDataIdbOpen();
    return await new Promise((resolve, reject)=>{
      const tx = db.transaction(BORION_IDB_DATA_STORE, 'readonly');
      const rq = tx.objectStore(BORION_IDB_DATA_STORE).get(id);
      rq.onsuccess = ()=> resolve(rq.result!=null ? rq.result : null);
      rq.onerror = ()=> reject(rq.error);
    });
  }catch(e){ console.warn('IndexedDB (leitura) indisponível, usando localStorage:', e); return null; }
}
async function idbSetProfileData(id, data){
  if(!id) return false;
  try{
    const db = await borionDataIdbOpen();
    let safe; try{ safe = JSON.parse(JSON.stringify(data)); }catch(e){ safe = data; }
    return await new Promise((resolve, reject)=>{
      const tx = db.transaction(BORION_IDB_DATA_STORE, 'readwrite');
      tx.objectStore(BORION_IDB_DATA_STORE).put(safe, id);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }catch(e){ console.warn('IndexedDB (escrita) indisponível — os dados continuam salvos no localStorage:', e); return false; }
}
async function idbDeleteProfileData(id){
  if(!id) return false;
  try{
    const db = await borionDataIdbOpen();
    return await new Promise((resolve, reject)=>{
      const tx = db.transaction(BORION_IDB_DATA_STORE, 'readwrite');
      tx.objectStore(BORION_IDB_DATA_STORE).delete(id);
      tx.oncomplete = ()=> resolve(true);
      tx.onerror = ()=> reject(tx.error);
    });
  }catch(e){ return false; }
}
/* Tenta trazer os dados mais atuais do IndexedDB para um perfil. Se existir,
   também atualiza o cache síncrono do localStorage. Retorna os dados já
   migrados (migrateData) ou null se não houver nada gravado ainda no IndexedDB. */
async function hydrateProfileDataFromIDB(id){
  const idbData = await idbGetProfileData(id);
  if(idbData){
    writeJSON(LS_DATA_PREFIX+id, idbData);
    return migrateData(idbData, {profileId:id});
  }
  return null;
}

/* ---------------- Password hashing (client-side, basic) ---------------- */
async function sha256Hex(str){
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function randomSalt(){return Array.from(crypto.getRandomValues(new Uint8Array(12))).map(b=>b.toString(16).padStart(2,'0')).join('');}
async function hashPassword(pw, salt){ return sha256Hex(salt+'::'+pw); }

/* ---------------- Default categories & empty initial data ---------------- */
function defaultCategories(){
  return {
    receita: ['Salário','Renda Extra','Investimentos','Reembolsos','Outro'],
    fixa: ['Moradia','Contas Fixas','Assinaturas','Educação','Saúde','Transporte','Seguros','Impostos','Outro'],
    variavel: ['Alimentação','Mercado','Lazer','Transporte','Saúde','Compras','Roupas','Educação','Casa','Veículo','Presentes','Viagens','Outro']
  };
}

/* Dados de demonstração removidos: todo perfil novo começa em branco. */

function emptyData(){
  return {
    categorias: defaultCategories(),
    categoryColors: {receita:{}, fixa:{}, variavel:{}},
    investirPlanejado: {},
    transacoes: [],
    fixas: [],
    /* V6.1 — estado de pagamento de cada ocorrência mensal de uma despesa fixa. Uma
       despesa fixa (S.data.fixas) é só o "cadastro" (o compromisso recorrente); cada mês
       em que ela está ativa é uma ocorrência independente, com seu próprio pago/pendente.
       Marcar uma ocorrência como paga NUNCA marca outra ocorrência (outro mês) como paga. */
    fixaPagamentos: [],
    /* V6.1 — log leve e só-para-consulta de estornos (desfazer pagamento por reserva,
       redução de valor de despesa já paga, etc.). Não participa de nenhum cálculo de saldo:
       serve apenas para o filtro "Estornos" em Lançamentos e no extrato da reserva. */
    estornos: [],
    liquidez: [],
    bens: [],
    investimentos:{emCaixa:[],ativos:[]},
    contas: [],
    cartoes: [],
    boletos: [],
    transferencias: [],
    agenda: [],
    metas: [],
    notificacoes: [],
    patrimonioHistorico: {},
    cheques: { enabled:false, items:[] },
    modules: Object.assign({}, DEFAULT_MODULES),
    dashboard: { widgets: DEFAULT_DASHBOARD_WIDGETS.slice() },
    reservas: { enabled:true, boxes:[], moves:[], monthlyReports:[] },
    /* V6.22 — Assinaturas (seção 9 do pedido): despesas recorrentes mensais ou anuais, com
       pausar/retomar. assinaturas = o cadastro; assinaturaCobrancas = idempotência + histórico
       de cada período já efetivamente cobrado (nunca cobra o mesmo período duas vezes). */
    assinaturas: [],
    assinaturaCobrancas: [],
    /* V6.23.1 — auditoria defensiva da migração para accountId. Não participa de cálculos. */
    accountMigrationReview: [],
    migrationBackups: [],
    /* V6.35.0 — preferências e histórico do importador inteligente por print.
       Permanecem dentro do perfil atual e nunca armazenam Blob, File, base64 ou pixels. */
    importPreferences: { reserveMappings:{}, merchantRules:{} },
    importBatches: [],
    uiPreferences:{budgetDateSort:{receita:'desc',fixa:'desc',variavel:'desc',transferencias:'desc'},floatingNotes:{enabled:false,text:'',minimized:true,x:null,y:null}}
  };
}
function migrateData(d, migrationContext={}){
  if(!d) return emptyData();
  const _migrationProfileId = migrationContext.profileId || (d.__syncMeta&&d.__syncMeta.profileId) || ((typeof S!=='undefined'&&S.currentProfile&&S.currentProfile.id)||null) || 'unknown-profile';
  const _migrationOccurrences = new Map();
  const migrationUid6401 = (kind,stable,forcedOccurrence)=>{
    const canonical=(window.BorionSyncCore&&BorionSyncCore.canonicalStringify)?BorionSyncCore.canonicalStringify(stable):JSON.stringify(stable);
    const fp=String(kind)+'|'+canonical;
    const occurrence=forcedOccurrence==null?(_migrationOccurrences.get(fp)||0):forcedOccurrence;
    if(forcedOccurrence==null)_migrationOccurrences.set(fp,occurrence+1);
    const seed=['legacy-generated-v6401',_migrationProfileId,kind,canonical,String(occurrence)].join('|');
    return window.BorionSyncCore?'legacy_'+BorionSyncCore.sha256Sync640(seed).slice(0,40):uid();
  };
  if(!d.categorias) d.categorias=defaultCategories();
  const _defaultCats = defaultCategories();
  ['receita','fixa','variavel'].forEach(k=>{
    if(!Array.isArray(d.categorias[k])) d.categorias[k]=(_defaultCats[k]||['Outro']).slice();
    if(!d.categorias[k].includes('Outro')) d.categorias[k].push('Outro');
  });
  if(!d.categoryColors) d.categoryColors={};
  ['receita','fixa','variavel'].forEach(k=>{
    if(!d.categoryColors[k]) d.categoryColors[k]={};
    d.categorias[k].forEach(c=>{
      d.categoryColors[k][c]=normalizeHexColor(d.categoryColors[k][c], baseCatColor(c));
    });
    Object.keys(d.categoryColors[k]).forEach(c=>{ if(!d.categorias[k].includes(c)) delete d.categoryColors[k][c]; });
  });
  if(!d.fixas) d.fixas=[];
  if(!Array.isArray(d.fixaPagamentos)) d.fixaPagamentos=[];
  if(!Array.isArray(d.estornos)) d.estornos=[];
  if(!d.agenda) d.agenda=[];
  if(!d.metas) d.metas=[];
  if(!d.notificacoes) d.notificacoes=[];
  if(!d.patrimonioHistorico) d.patrimonioHistorico={};
  if(!d.cheques) d.cheques={enabled:false,items:[]};
  if(Array.isArray(d.cheques)) d.cheques={enabled:false,items:d.cheques};
  if(d.cheques.enabled==null) d.cheques.enabled=false;
  if(!Array.isArray(d.cheques.items)) d.cheques.items=[];
  if(!d.modules) d.modules=Object.assign({}, DEFAULT_MODULES);
  d.modules = Object.assign({}, DEFAULT_MODULES, d.modules||{});
  if(!d.dashboard) d.dashboard={widgets:DEFAULT_DASHBOARD_WIDGETS.slice()};
  if(!Array.isArray(d.dashboard.widgets)) d.dashboard.widgets=DEFAULT_DASHBOARD_WIDGETS.slice();
  d.dashboard.widgets = d.dashboard.widgets.filter(k=>DEFAULT_DASHBOARD_WIDGETS.includes(k));
  if(!d.reservas) d.reservas={enabled:d.modules.reserves!==false, boxes:[], moves:[], monthlyReports:[]};
  if(Array.isArray(d.reservas)) d.reservas={enabled:d.modules.reserves!==false, boxes:d.reservas, moves:[], monthlyReports:[]};
  if(d.reservas.enabled==null) d.reservas.enabled = d.modules.reserves!==false;
  if(!Array.isArray(d.reservas.boxes)) d.reservas.boxes=[];
  if(!Array.isArray(d.reservas.moves)) d.reservas.moves=[];
  /* V6.23.2 — snapshots mensais imutáveis dos Cofrinhos/Reservas. Cada relatório pertence
     ao perfil atual porque fica dentro de S.data. Não participa de nenhum cálculo e não
     altera valores atuais; serve somente para consulta e comparação histórica. */
  if(!Array.isArray(d.reservas.monthlyReports)) d.reservas.monthlyReports=[];
  /* V6.35.0 — migração defensiva, sem tocar em saldos ou IDs financeiros. */
  if(!d.importPreferences || typeof d.importPreferences!=='object' || Array.isArray(d.importPreferences)) d.importPreferences={};
  if(!d.importPreferences.reserveMappings || typeof d.importPreferences.reserveMappings!=='object' || Array.isArray(d.importPreferences.reserveMappings)) d.importPreferences.reserveMappings={};
  if(!d.importPreferences.merchantRules || typeof d.importPreferences.merchantRules!=='object' || Array.isArray(d.importPreferences.merchantRules)) d.importPreferences.merchantRules={};
  if(!Array.isArray(d.importBatches)) d.importBatches=[];
  if(d.importBatches.length>100) d.importBatches=d.importBatches.slice(-100);
  if(!d.uiPreferences || typeof d.uiPreferences!=='object') d.uiPreferences={};
  if(!d.uiPreferences.budgetSummary || !Array.isArray(d.uiPreferences.budgetSummary.order)) d.uiPreferences.budgetSummary={order:['receita','investir','despesas','saldo'],visible:['receita','investir','despesas','saldo']};
  if(!d.uiPreferences.budgetDateSort || typeof d.uiPreferences.budgetDateSort!=='object') d.uiPreferences.budgetDateSort={};
  if(!d.uiPreferences.floatingNotes || typeof d.uiPreferences.floatingNotes!=='object') d.uiPreferences.floatingNotes={enabled:false,text:'',minimized:true,x:null,y:null};
  if(typeof d.uiPreferences.floatingNotes.enabled!=='boolean') d.uiPreferences.floatingNotes.enabled=false;
  if(typeof d.uiPreferences.floatingNotes.text!=='string') d.uiPreferences.floatingNotes.text='';
  if(typeof d.uiPreferences.floatingNotes.minimized!=='boolean') d.uiPreferences.floatingNotes.minimized=true;
  if(typeof d.uiPreferences.floatingNotes.x!=='number') d.uiPreferences.floatingNotes.x=null;
  if(typeof d.uiPreferences.floatingNotes.y!=='number') d.uiPreferences.floatingNotes.y=null;
  ['receita','fixa','variavel','transferencias'].forEach(k=>{d.uiPreferences.budgetDateSort[k]=d.uiPreferences.budgetDateSort[k]==='asc'?'asc':'desc';});
  /* Mantém apenas o primeiro fechamento válido de cada competência. Isso protege o relatório
     original inclusive após importações/mesclagens antigas que possam ter duplicado arrays. */
  const _reportMonths=new Set();
  d.reservas.monthlyReports = d.reservas.monthlyReports
    .filter(r=>r && /^\d{4}-(0[1-9]|1[0-2])$/.test(r.monthKey||''))
    .sort((a,b)=>String(a.closedAt||'').localeCompare(String(b.closedAt||'')))
    .filter(r=>{ if(_reportMonths.has(r.monthKey)) return false; _reportMonths.add(r.monthKey); return true; })
    .map((r,i)=>Object.assign({id:migrationUid6401('reservas.monthlyReports',{monthKey:r.monthKey,closedAt:r.closedAt||null,total:r.total||0},i),monthLabel:'',closedAt:null,total:0,metaTotal:0,activeCount:0,boxCount:0,summary:{entradas:0,saidas:0,rendimentos:0,movimentacoes:0},boxes:[],moves:[]},r,{boxes:Array.isArray(r.boxes)?r.boxes:[],moves:Array.isArray(r.moves)?r.moves:[],summary:Object.assign({entradas:0,saidas:0,rendimentos:0,movimentacoes:0},r.summary||{})}));
  d.modules.reserves = d.reservas.enabled!==false;
  if(!d.contas) d.contas=[];
  if(!Array.isArray(d.contas)) d.contas=[];
  if(!Array.isArray(d.assinaturas)) d.assinaturas=[];
  if(!Array.isArray(d.assinaturaCobrancas)) d.assinaturaCobrancas=[];
  if(!d.boletos) d.boletos=[];
  if(!Array.isArray(d.boletos)) d.boletos=[];
  if(!d.transferencias) d.transferencias=[];
  if(!Array.isArray(d.transferencias)) d.transferencias=[];
  // V6.0 — Transferências deixam de ser só "conta → conta": agora qualquer transferência
  // guarda o tipo de origem/destino ('conta' ou 'reserva'). Dados antigos (só contaOrigem/
  // contaDestino, sempre conta → conta) recebem os campos novos sem perder nada.
  d.transferencias.forEach(t=>{
    if(t.origemTipo==null) t.origemTipo='conta';
    if(t.destinoTipo==null) t.destinoTipo='conta';
    if(t.origemId==null) t.origemId = t.contaOrigem||'';
    if(t.destinoId==null) t.destinoId = t.contaDestino||'';
    if(t.origemNome==null) t.origemNome = t.contaOrigem||t.origemId||'';
    if(t.destinoNome==null) t.destinoNome = t.contaDestino||t.destinoId||'';
    if(t.origemBanco==null) t.origemBanco = t.origemTipo==='conta' ? (t.origemId||'') : '';
    if(t.destinoBanco==null) t.destinoBanco = t.destinoTipo==='conta' ? (t.destinoId||'') : '';
  });
  /* O backup defensivo precisa existir antes de criar IDs, Carteira ou qualquer vínculo.
     Ele fica dentro do próprio perfil e não participa de nenhum cálculo financeiro. */
  if(!Array.isArray(d.accountMigrationReview)) d.accountMigrationReview=[];
  if(!Array.isArray(d.migrationBackups)) d.migrationBackups=[];
  const _legacyArrays=[d.liquidez,d.transacoes,d.fixas,d.fixaPagamentos,d.bens,d.metas,d.agenda,(d.cheques&&d.cheques.items),d.boletos,(d.investimentos&&d.investimentos.ativos),(d.investimentos&&d.investimentos.emCaixa),d.transferencias,d.assinaturas,d.assinaturaCobrancas];
  const _legacyRefsPresent=_legacyArrays.some(arr=>Array.isArray(arr)&&arr.some(x=>x&&(!x.accountId||!x.id)&&(x.banco||x.account||x.accountName||x.bank||x.bankName||x.conta||x.origemId||x.destinoId)));
  if(_legacyRefsPresent&&!d.migrationBackups.some(b=>b&&b.kind==='before_account_id_v6231')){
    const snapshot={};
    ['contas','liquidez','transacoes','fixas','fixaPagamentos','bens','metas','agenda','boletos','transferencias','assinaturas','assinaturaCobrancas','cartoes'].forEach(k=>{try{snapshot[k]=JSON.parse(JSON.stringify(d[k]));}catch(_){}});
    d.migrationBackups.push({id:migrationUid6401('migrationBackup',{kind:'before_account_id_v6231',snapshot}),kind:'before_account_id_v6231',createdAt:0,snapshot});
  }
  // V5.36.0 — "Carteira" (dinheiro físico) é uma conta fixa que sempre precisa existir,
  // não pode ser excluída e nunca pode ser confundida com cartão de crédito. Migração
  // defensiva: cria a Carteira se ainda não existir (dado antigo) e garante a flag
  // isCarteira mesmo se o registro já existia com outro formato.
  (function ensureCarteira(){
    let carteira = d.contas.find(c=>c && (c.isCarteira || c.id===CARTEIRA_CONTA_ID));
    if(!carteira){
      carteira = { id:CARTEIRA_CONTA_ID, nome:'Carteira', tipo:'Carteira (dinheiro físico)', saldoInicial:0, rende:false, percentualRendimento:0, cor:'#cca160', icone:'💵', isCarteira:true };
      d.contas.unshift(carteira);
    } else {
      carteira.isCarteira = true;
      if(!carteira.nome) carteira.nome = 'Carteira';
      if(carteira.tipo==null) carteira.tipo = 'Carteira (dinheiro físico)';
    }
  })();
  // upgrade contas registry with the new bank/account fields
  const usedAccountIds = new Set();
  d.contas.forEach((c,accountIndex)=>{
    if(!c.id || usedAccountIds.has(String(c.id))) c.id = migrationUid6401('contas',c,accountIndex);
    usedAccountIds.add(String(c.id));
    if(c.nome==null) c.nome = c.banco || 'Conta';
    if(c.tipo==null) c.tipo = 'Conta corrente';
    if(c.saldoInicial==null) c.saldoInicial = 0;
    if(c.rende==null) c.rende = false;
    if(c.percentualRendimento==null) c.percentualRendimento = 0;
    if(c.cor==null) c.cor = bankColor(c.nome);
    if(c.icone==null) c.icone = c.isCarteira ? '💵' : '◈';
    if(c.accountKind==null) c.accountKind = c.isCarteira ? 'wallet' : 'bank';
    if(c.active==null) c.active = !c.archivedAt;
    if(c.createdAt==null) c.createdAt = 0; // legado: desconhecido, nunca inventa uma data financeira
  });

  /* V6.23.1 — migração defensiva de vínculos textuais para accountId.
     - nome/banco continua só como fotografia para exibição;
     - somente uma correspondência exata é migrada;
     - duplicidade ou ausência vira revisão, sem alterar valor/saldo;
     - contas arquivadas continuam no registro para impedir que uma conta nova homônima
       herde o histórico da excluída. */
  const normalizeAccountName = v=>String(v||'').trim().toLocaleLowerCase('pt-BR');
  const accountByIdLocal = id=>d.contas.find(c=>c && String(c.id)===String(id));
  const accountCandidatesLocal = name=>{
    const n=normalizeAccountName(name);
    return n ? d.contas.filter(c=>c && normalizeAccountName(c.nome)===n) : [];
  };
  function recordAccountReview(entityType, entity, field, legacyValue, candidates){
    if(!entity) return;
    const rid=entity.id||entity.fixaId||entity.assinaturaId||migrationUid6401('accountMigrationReview.entity',entity);
    const key=[entityType,rid,field,String(legacyValue||'')].join('|');
    if(!d.accountMigrationReview.some(r=>r&&r.key===key)){
      d.accountMigrationReview.push({key,entityType,entityId:rid,field,legacyValue:legacyValue||'',candidateAccountIds:(candidates||[]).map(c=>c.id),status:(candidates||[]).length>1?'ambiguous':'unresolved',createdAt:0});
    }
    entity.accountMigrationStatus=(candidates||[]).length>1?'ambiguous':'unresolved';
  }
  function migrateAccountRef(entity, entityType, idField='accountId', textFields=['banco','account','accountName','bank','bankName','conta']){
    if(!entity) return null;
    const existing=entity[idField];
    if(existing && accountByIdLocal(existing)){ entity.accountMigrationStatus='resolved'; return existing; }
    let legacy='';
    for(const f of textFields){ if(entity[f]){ legacy=entity[f]; break; } }
    if(!legacy) return null;
    if(accountByIdLocal(legacy)){ entity[idField]=String(legacy); entity.accountMigrationStatus='resolved'; return entity[idField]; }
    const candidates=accountCandidatesLocal(legacy);
    if(candidates.length===1){ entity[idField]=candidates[0].id; entity.accountMigrationStatus='resolved'; return entity[idField]; }
    recordAccountReview(entityType,entity,idField,legacy,candidates);
    return null;
  }
  (d.liquidez||[]).forEach(l=>{
    if(l && (l.ledgerType==='account_delta' || (l.nome && l.banco && normalizeAccountName(l.nome)===normalizeAccountName(l.banco)))){
      l.ledgerType='account_delta'; migrateAccountRef(l,'liquidez');
    }
  });
  (d.transacoes||[]).forEach(x=>{
    if(x.formaPagamento==='Crédito'||x.viaCartaoId){x.accountId=null;return;}
    migrateAccountRef(x,'transacoes');
  });
  (d.fixas||[]).forEach(x=>{if(x.viaCartaoId){x.accountId=null;return;}migrateAccountRef(x,'fixas');});
  [['fixaPagamentos',d.fixaPagamentos],['bens',d.bens],['metas',d.metas],['agenda',d.agenda],['cheques',d.cheques&&d.cheques.items],['boletos',d.boletos],['investimentosAtivos',d.investimentos&&d.investimentos.ativos],['investimentosCaixa',d.investimentos&&d.investimentos.emCaixa]].forEach(([type,arr])=>{
    (arr||[]).forEach(x=>migrateAccountRef(x,type));
  });
  (d.assinaturas||[]).forEach(x=>{if(x.formaPagamento==='Crédito'){x.accountId=null;return;}migrateAccountRef(x,'assinaturas');});
  (d.assinaturaCobrancas||[]).forEach(x=>{if(x.formaPagamento==='Crédito'){x.accountId=null;return;}migrateAccountRef(x,'assinaturaCobrancas');});
  (d.cartoes||[]).forEach(c=>(c.faturasPagas||[]).forEach(pg=>migrateAccountRef(pg,'faturaPagamento')));
  (d.boletos||[]).forEach(b=>(b.pagamentos||[]).forEach(pg=>migrateAccountRef(pg,'boletoPagamento')));
  (d.transferencias||[]).forEach(t=>{
    if(t.origemTipo==='conta'){
      const id=migrateAccountRef(t,'transferencia-origem','origemAccountId',['origemId','contaOrigem','origemNome','origemBanco']);
      if(id){ t.origemAccountId=id; t.origemId=id; const c=accountByIdLocal(id); if(c){t.origemNome=c.nome;t.origemBanco=c.nome;t.contaOrigem=c.nome;} }
    }
    if(t.destinoTipo==='conta'){
      const id=migrateAccountRef(t,'transferencia-destino','destinoAccountId',['destinoId','contaDestino','destinoNome','destinoBanco']);
      if(id){ t.destinoAccountId=id; t.destinoId=id; const c=accountByIdLocal(id); if(c){t.destinoNome=c.nome;t.destinoBanco=c.nome;t.contaDestino=c.nome;} }
    }
  });
  // ensure banco tag field exists on every entity that can be filtered by bank
  (d.transacoes||[]).forEach(t=>{
    if(t.banco==null) t.banco='';
    // V5.29 — separa receita própria de reembolso/repasse de terceiros (não conta como renda).
    if(t.tipo==='receita' && t.origem==null) t.origem='propria';
    // V5.36.0 — forma de pagamento das despesas (dinheiro/pix/débito). Compras no crédito
    // não viram transação aqui — elas passam a existir como parcela vinculada ao cartão.
    if(t.tipo==='variavel' && t.formaPagamento==null) t.formaPagamento='Dinheiro';
    // V6.26 — toda despesa variável possui estado explícito. Dados antigos continuam pagos,
    // preservando exatamente os saldos que já existiam antes da atualização.
    if(t.tipo==='variavel' && !['Pago','Em aberto'].includes(t.statusPagamento)) t.statusPagamento='Pago';
    if(t.tipo==='variavel' && t.localCompra==null) t.localCompra=t.local||'';
    // V6.0 — despesa variável agora pode ser paga direto de uma Reserva, sem passar por
    // Receita. origemPagamento indica de onde saiu o dinheiro ('conta' = fluxo normal via
    // banco/carteira/cartão, 'reserva' = pagamento direto de uma reserva/cofrinho).
    if(t.tipo==='variavel' && t.origemPagamento==null) t.origemPagamento='conta';
    if(t.reservaOrigemId===undefined) t.reservaOrigemId=null;
    if(t.reservaOrigemMoveId===undefined) t.reservaOrigemMoveId=null;
  });
  (d.fixas||[]).forEach(f=>{
    if(f.banco==null) f.banco='';
    // V6.1 — despesa fixa paga por Conta/carteira OU por Reserva/cofrinho. Continua sendo
    // só o "cadastro" da recorrência: a origem aqui é o padrão herdado por cada ocorrência
    // nova, mas o desconto de verdade só acontece quando a ocorrência do mês é marcada como
    // paga (ver fixaPagamentos). Nunca retira dinheiro só por a despesa existir no mês.
    if(f.origemPagamento==null) f.origemPagamento='conta';
    if(f.reservaOrigemId===undefined) f.reservaOrigemId=null;
  });
  // V6.1 — defensivo: remove ocorrências de despesa fixa cujo cadastro (fixas) não existe
  // mais (ex.: backup antigo restaurado fora de ordem). Nunca movimenta saldo aqui — é só
  // limpeza de referências órfãs; qualquer devolução de reserva já acontece no momento da
  // exclusão real da despesa fixa dentro do app.
  d.fixaPagamentos = (d.fixaPagamentos||[]).filter(r=> r && (d.fixas||[]).some(f=>f.id===r.fixaId));
  (d.fixaPagamentos||[]).forEach(r=>{
    if(r.origemPagamento==null) r.origemPagamento='conta';
    if(r.reservaId===undefined) r.reservaId=null;
    if(r.reservaMoveId===undefined) r.reservaMoveId=null;
    if(r.pago==null) r.pago=true;
  });
  (d.liquidez||[]).forEach(l=>{ if(l.banco==null) l.banco=''; });
  (d.bens||[]).forEach(b=>{ if(b.banco==null) b.banco=''; });
  (d.metas||[]).forEach(mt=>{ if(mt.banco==null) mt.banco=''; if(mt.reservaId===undefined) mt.reservaId=null; });
  (d.agenda||[]).forEach(a=>{ if(a.banco==null) a.banco=''; });
  (d.cheques.items||[]).forEach(ch=>{ if(ch.banco==null) ch.banco=''; });
  (d.boletos||[]).forEach(b=>{
    if(b.banco==null) b.banco='';
    if(b.status==null||b.status==='Ativo') b.status='Em Aberto';
    if(b.status==='Quitado') b.status='Pago';
    if(!b.origemPagamento) b.origemPagamento=b.accountId===CARTEIRA_CONTA_ID?'carteira':'conta';
    if(b.parcelaTotal==null) b.parcelaTotal=1;
    if(b.valorParcela==null) b.valorParcela=0;
    if(b.dataInicio==null){ const _ym=todayYM(); b.dataInicio=monthKey(_ym.y,_ym.m); }
    if(b.categoria==null) b.categoria='Outro';
    // V5.29 — histórico de pagamentos por competência (mês), para não negativar/duplicar dívida já paga.
    if(!Array.isArray(b.pagamentos)) b.pagamentos=[];
  });
  (d.reservas.boxes||[]).forEach(r=>{ if(r.banco==null) r.banco=''; if(r.valorAtual==null) r.valorAtual=0; if(r.valorMeta==null) r.valorMeta=0; if(r.status==null) r.status='Ativa'; if(r.metaId===undefined) r.metaId=null; if(r.corValor==null) r.corValor='#e8c98a'; });
  // V6.0 — novos tipos de movimentação da reserva: 'Pagamento direto' (despesa paga direto
  // da reserva, sem virar receita) e 'Transferência enviada'/'Transferência recebida'
  // (movimentações genéricas entre conta/reserva). despesaTransacaoId liga o pagamento
  // direto à despesa correspondente em Orçamento > Despesas.
  (d.reservas.moves||[]).forEach(m=>{
    if(m.banco==null) m.banco='';
    if(m.data==null) m.data=todayISO();
    if(m.tipo==null) m.tipo='Reservar';
    if(m.valor==null) m.valor=0;
    if(m.despesaTransacaoId===undefined) m.despesaTransacaoId=null;
    if(m.transferenciaId===undefined) m.transferenciaId=null;
    // V6.1 — mesmo mecanismo de vínculo, agora para despesa fixa paga direto da reserva.
    // despesaFixaId liga ao cadastro da despesa fixa; fixaOcorrenciaId liga à ocorrência
    // (mês) específica em fixaPagamentos — nunca à despesa fixa como um todo.
    if(m.despesaFixaId===undefined) m.despesaFixaId=null;
    if(m.fixaOcorrenciaId===undefined) m.fixaOcorrenciaId=null;
  });
  if(d.investimentos){
    (d.investimentos.ativos||[]).forEach(a=>{ if(a.banco==null) a.banco=''; });
    (d.investimentos.emCaixa||[]).forEach(c=>{ if(c.banco==null) c.banco=''; });
  }
  // V5.29 — cartões: categoria por compra parcelada e histórico de faturas marcadas como pagas.
  (d.cartoes||[]).forEach(c=>{
    if(!Array.isArray(c.faturasPagas)) c.faturasPagas=[];
    (c.parcelas||[]).forEach(p=>{
      if(p.categoria==null) p.categoria='Outro';
      // V5.39.0 — vínculo opcional da compra no cartão com Orçamento > Despesas.
      if(p.apareceDespesas==null) p.apareceDespesas=false;
      if(p.despesaTipo==null) p.despesaTipo='variavel';
      if(p.despesaTransacaoId===undefined) p.despesaTransacaoId=null;
      if(p.despesaTransacaoIds===undefined) p.despesaTransacaoIds=[];
      if(p.despesaFixaId===undefined) p.despesaFixaId=null;
      /* V6.33.4 — preserva a data original aproximada de registros antigos e cria o
         armazenamento independente do status da fatura sem gerar qualquer despesa. */
      if(!p.dataCompraCompleta && /^\d{4}-(0[1-9]|1[0-2])$/.test(String(p.dataCompra||'')))
        p.dataCompraCompleta=p.dataCompra+'-'+pad2(Math.max(1,Math.min(31,Number(p.diaEntrada)||1)));
      if(!p.statusFaturaPorCompetencia||typeof p.statusFaturaPorCompetencia!=='object'||Array.isArray(p.statusFaturaPorCompetencia))
        p.statusFaturaPorCompetencia={};
      const _legacyFaturaStatus=p.statusFatura!==undefined?p.statusFatura:p.pagoNaFatura;
      if(_legacyFaturaStatus!==undefined){
        const _comp=String(p.dataCompra||'');
        if(/^\d{4}-(0[1-9]|1[0-2])$/.test(_comp)&&p.statusFaturaPorCompetencia[_comp]===undefined)
          p.statusFaturaPorCompetencia[_comp]=(_legacyFaturaStatus==='Pago'||_legacyFaturaStatus==='pago'||_legacyFaturaStatus===true)?'Pago':'Em aberto';
      }
      /* V6.27.1 — baixa mensal individual de compras fixas no cartão. Dados da V6.27.0
         que usavam status global Pago são convertidos somente para o mês da primeira parcela. */
      if(!Array.isArray(p.pagamentosIndividuais)) p.pagamentosIndividuais=[];
      if(p.despesaTipo==='fixa' && p.statusPagamento==='Pago'){
        const competencia=p.dataCompra||monthKey(todayYM().y,todayYM().m);
        if(!p.pagamentosIndividuais.some(r=>r&&r.competencia===competencia&&r.pago!==false))
          p.pagamentosIndividuais.push({id:migrationUid6401('cartoes.parcelas.pagamentosIndividuais',{parcelaId:p.id||null,competencia}),competencia,pago:true,data:null,updatedAt:0,migrado:true});
        p.statusPagamento='Em aberto';
      }
    });
  });
  /* Alguns backups da V6.27.0 guardaram o Pago no espelho de despesa fixa, não na compra.
     Transfere esse estado para a parcela correspondente sem marcar os meses seguintes. */
  (d.fixas||[]).forEach(f=>{
    if(!f||!f.viaParcelaId||f.statusPagamento!=='Pago') return;
    const cartao=(d.cartoes||[]).find(c=>c.id===f.viaCartaoId);
    const parcela=cartao&&(cartao.parcelas||[]).find(p=>p.id===f.viaParcelaId);
    if(parcela){
      if(!Array.isArray(parcela.pagamentosIndividuais)) parcela.pagamentosIndividuais=[];
      const competencia=f.startMonth||parcela.dataCompra||monthKey(todayYM().y,todayYM().m);
      if(!parcela.pagamentosIndividuais.some(r=>r&&r.competencia===competencia&&r.pago!==false))
        parcela.pagamentosIndividuais.push({id:migrationUid6401('cartoes.parcelas.pagamentosIndividuais',{parcelaId:parcela.id||null,competencia}),competencia,pago:true,data:null,updatedAt:0,migrado:true});
    }
    f.statusPagamento='Em aberto';
  });
  // V5.39.1 — boletos: vínculo opcional com Orçamento > Despesas (mesmo mecanismo do cartão).
  (d.boletos||[]).forEach(b=>{
    if(b.apareceDespesas==null) b.apareceDespesas=false;
    if(b.despesaTipo==null) b.despesaTipo='variavel';
    if(b.despesaTransacaoId===undefined) b.despesaTransacaoId=null;
    if(b.despesaTransacaoIds===undefined) b.despesaTransacaoIds=[];
    if(b.despesaFixaId===undefined) b.despesaFixaId=null;
  });
  // V5.39.1 — correção defensiva: despesas espelhadas de compra parcelada gravadas com
  // banco:'' (bug da V5.39.0) somem da lista/total sempre que o filtro de banco/cartão
  // está ativo. Preenche o banco correto usando o cartão de origem (viaCartaoId).
  (d.transacoes||[]).forEach(t=>{
    if(t.viaParcelaId && t.viaCartaoId && !t.banco){
      const cartao = (d.cartoes||[]).find(c=>c.id===t.viaCartaoId);
      if(cartao && cartao.banco) t.banco = cartao.banco;
    }
  });
  (d.fixas||[]).forEach(f=>{
    if(f.viaParcelaId && f.viaCartaoId && !f.banco){
      const cartao = (d.cartoes||[]).find(c=>c.id===f.viaCartaoId);
      if(cartao && cartao.banco) f.banco = cartao.banco;
    }
  });
  /* V5.39.2 — corrige dados já salvos pela V5.39.0/5.39.1: compra parcelada
     espelhada como despesa variável não pode aparecer como valor total no primeiro
     mês. A migração reconstrói o espelho variável como uma transação por mês,
     cada uma com o valor da parcela. */
  (function rebuildLinkedVariableInstallments(){
    if(!Array.isArray(d.transacoes)) d.transacoes=[];
    function normalizeLinkedTxIds(owner, matchFn, buildFn, total, valorParcela){
      const existing = d.transacoes.filter(matchFn).sort((a,b)=>String(a.data||'').localeCompare(String(b.data||'')));
      const cents = Math.round((Number(valorParcela)||0)*100);
      const ok = existing.length===total && existing.every(t=>Math.round((Number(t.valor)||0)*100)===cents);
      if(ok){
        owner.despesaTransacaoIds = existing.map(t=>t.id);
        owner.despesaTransacaoId = owner.despesaTransacaoIds[0] || null;
        return;
      }
      const oldIds = new Set([...(Array.isArray(owner.despesaTransacaoIds)?owner.despesaTransacaoIds:[]), owner.despesaTransacaoId].filter(Boolean));
      d.transacoes = d.transacoes.filter(t=>!(oldIds.has(t.id) || matchFn(t)));
      owner.despesaTransacaoIds = [];
      for(let i=0;i<total;i++){
        const tx = buildFn(i);
        d.transacoes.push(tx);
        owner.despesaTransacaoIds.push(tx.id);
      }
      owner.despesaTransacaoId = owner.despesaTransacaoIds[0] || null;
    }
    (d.cartoes||[]).forEach(c=>{
      (c.parcelas||[]).forEach(p=>{
        if(p.despesaTransacaoIds===undefined) p.despesaTransacaoIds = [];
        if(!p.apareceDespesas || p.despesaTipo==='fixa') return;
        const total = Math.max(1, Math.round(Number(p.parcelaTotal)||1));
        const valorParcela = Number(p.valorParcela)||0;
        const startMonth = p.dataCompra || monthKey(todayYM().y,todayYM().m);
        const nomeBase = p.descricao || 'Compra no cartão';
        normalizeLinkedTxIds(p, t=>t && t.viaParcelaId===p.id, i=>{
          const ym = shiftYM(startMonth, i);
          const nome = total>1 ? `${nomeBase} (${i+1}/${total})` : nomeBase;
          return {id:migrationUid6401('transacoes.cartaoParcela',{cartaoId:c.id||null,parcelaId:p.id||null,ym,indice:i}), tipo:'variavel', nome, data:ym+'-01', categoria:p.categoria||'Outro', valor:valorParcela, banco:c.banco||'', formaPagamento:'Crédito', viaCartaoId:c.id, viaParcelaId:p.id, parcelaAtual:i+1, parcelaTotal:total};
        }, total, valorParcela);
      });
    });
    (d.boletos||[]).forEach(b=>{
      if(b.despesaTransacaoIds===undefined) b.despesaTransacaoIds = [];
      if(!b.apareceDespesas || b.despesaTipo==='fixa') return;
      const total = Math.max(1, Math.round(Number(b.parcelaTotal)||1));
      const valorParcela = Number(b.valorParcela)||0;
      const startMonth = b.dataInicio || monthKey(todayYM().y,todayYM().m);
      const nomeBase = b.descricao || 'Boleto';
      normalizeLinkedTxIds(b, t=>t && t.viaBoletoId===b.id, i=>{
        const ym = shiftYM(startMonth, i);
        const nome = total>1 ? `${nomeBase} (${i+1}/${total})` : nomeBase;
        return {id:migrationUid6401('transacoes.boletoParcela',{boletoId:b.id||null,ym,indice:i}), tipo:'variavel', nome, data:ym+'-01', categoria:b.categoria||'Outro', valor:valorParcela, banco:b.banco||'', formaPagamento:'Boleto', viaBoletoId:b.id, parcelaAtual:i+1, parcelaTotal:total};
      }, total, valorParcela);
    });
  })();
  /* ---------------- V6.0 — migração automática e conservadora: "Retirada de reserva" ----------------
     Antes da V6.0, retirar dinheiro de uma reserva exigia lançar uma Receita falsa (ex: nome
     "Retirada de reserva") para depois lançar a Despesa de verdade. Isso nunca deveria ter
     contado como Receita. Aqui o Borion procura, entre as receitas antigas, aquelas cujo nome
     bate com um padrão claro e inequívoco de retirada de reserva. Quando consegue identificar
     com segurança qual reserva era (só existe uma reserva no perfil, ou o nome da reserva
     aparece no texto do lançamento), converte o registro em uma Transferência histórica
     (Reserva → Conta) e remove da lista de Receitas — assim ela nunca mais entra em
     receitaMes()/nos gráficos. Nada é apagado de verdade: o lançamento original inteiro fica
     guardado dentro da transferência (migratedFromTransacao), e a conversão NUNCA mexe no saldo
     atual da reserva ou da conta (ela só reclassifica um registro histórico — o saldo que você
     já vê hoje continua exatamente o mesmo antes e depois desta migração). Quando não dá pra
     identificar com segurança, o lançamento antigo é mantido exatamente como estava.
     Reversível: como nada é apagado, dá pra revisar migradas em Lançamentos → Transferências. */
  (function migrateRetiradaDeReservaParaTransferencia(){
    if(!Array.isArray(d.transacoes) || !d.transacoes.length) return;
    if(!d.reservas || !Array.isArray(d.reservas.boxes) || !d.reservas.boxes.length) return;
    const padraoRetirada = /\b(retirada|retirado|resgate|resgatado|saque)\b[\s\S]{0,25}\breserva\b|\breserva\b[\s\S]{0,25}\b(retirada|retirado|resgate|resgatado|saque)\b/i;
    function normalizeTxt(s){ return String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase(); }
    function resolveBox(nome){
      const boxes = d.reservas.boxes;
      if(boxes.length===1) return boxes[0];
      const nrm = normalizeTxt(nome);
      const matches = boxes.filter(bx=> bx.nome && nrm.includes(normalizeTxt(bx.nome)));
      return matches.length===1 ? matches[0] : null;
    }
    const keep = [];
    d.transacoes.forEach(t=>{
      if(t.tipo!=='receita' || t.migradoV6 || !padraoRetirada.test(normalizeTxt(t.nome))){ keep.push(t); return; }
      const box = resolveBox(t.nome);
      if(!box){ keep.push(t); return; } // não deu pra identificar com segurança — mantém como estava
      d.transferencias.push({
        id: migrationUid6401('transferencias.retiradaReserva',{sourceId:t.id||null,nome:t.nome||'',data:t.data||'',boxId:box.id||null}), origemTipo:'reserva', origemId:box.id, origemNome:box.nome, origemBanco:'',
        destinoTipo:'conta', destinoId:t.banco||box.banco||'', destinoNome:t.banco||box.banco||'', destinoBanco:t.banco||box.banco||'',
        valor: Number(t.valor)||0, data: t.data||todayISO(),
        descricao: (t.nome||'Retirada de reserva')+' — migrado automaticamente de uma receita antiga (V6.0). Saldo não foi alterado por esta migração.',
        createdAt: t.createdAt||t.data||0, historico:true, migratedFromTransacaoId: t.id, migratedFromTransacao: JSON.parse(JSON.stringify(t))
      });
      // não entra em "keep": some da lista de Receitas, mas o lançamento original
      // continua preservado dentro da transferência acima (migratedFromTransacao).
    });
    d.transacoes = keep;
  })();
  // V6.40 — item 11/25 do pedido: adiciona id/createdAt/updatedAt/revision
  // estáveis a registros antigos que ainda não têm (nunca troca um ID já
  // existente, nunca mexe em nenhum campo que a interface já usa). Puramente
  // síncrono e idempotente — ver js/01e-sync-core-v640.js. Isolado em try/catch
  // por segurança: se por algum motivo o módulo 01e ainda não tiver carregado
  // (ordem de scripts), a migração de identidade só é adiada, nunca quebra o
  // carregamento normal dos dados.
  try{
    if(window.BorionSyncCore){
      let _deviceIdSync = null;
      try{ _deviceIdSync = localStorage.getItem('borion_device_id_v640'); }catch(_e){}
      const _profileIdSync = _migrationProfileId;
      BorionSyncCore.migrateDataToSchema640(d, _deviceIdSync, _profileIdSync);
    }
  }catch(e){ console.warn('[BORION][SCHEMA_640_MIGRATION_WARN]', e); }
  return d;
}
/* V6.3.0 — validação central de um JSON de backup/importação do Borion, antes de
   qualquer tela chamar handleImport(). Não substitui handleImport() nem sua lógica de
   escolha (novo perfil/substituir/mesclar) — só garante, cedo, que o arquivo tem o
   mínimo necessário pra não gerar um perfil quebrado. Retorna {valid, errors[]}. */
const BORION_JSON_TYPES = ['borion-account-backup','multicap-full-backup','borion-profile-backup','multicap-profile-backup'];
function validateBorionJson(obj){
  const errors = [];
  if(!obj || typeof obj!=='object' || Array.isArray(obj)){
    return {valid:false, errors:['Arquivo vazio, inválido ou corrompido.']};
  }
  if(!obj.type || !BORION_JSON_TYPES.includes(obj.type)){
    errors.push('Formato não reconhecido: o campo "type" está ausente ou não é um formato de backup do Borion.');
    return {valid:false, errors};
  }
  if(obj.type==='borion-account-backup' || obj.type==='multicap-full-backup'){
    if(!Array.isArray(obj.profiles) || !obj.profiles.length) errors.push('Backup completo sem nenhum perfil dentro de "profiles".');
    if(!obj.dataByProfile || typeof obj.dataByProfile!=='object' || Array.isArray(obj.dataByProfile)) errors.push('Backup completo sem dados de perfil em "dataByProfile".');
    else if(Array.isArray(obj.profiles)){
      const missing = obj.profiles.filter(p=>p && p.id && !(p.id in obj.dataByProfile));
      if(missing.length) errors.push('Existem '+missing.length+' perfil(is) em "profiles" sem dados correspondentes em "dataByProfile".');
    }
  } else if(obj.type==='borion-profile-backup' || obj.type==='multicap-profile-backup'){
    if(!obj.data || typeof obj.data!=='object' || Array.isArray(obj.data)) errors.push('Backup de perfil sem dados em "data".');
  }
  return {valid: errors.length===0, errors};
}

function normalizeAccountName(v){ return String(v||'').trim().toLocaleLowerCase('pt-BR'); }
function activeAccounts(data){
  const d=data || (S&&S.data);
  return d&&Array.isArray(d.contas) ? d.contas.filter(c=>c && c.active!==false && !c.archivedAt && (c.accountKind==='bank'||c.accountKind==='wallet'||c.isCarteira)) : [];
}
function accountById(id, opts={}){
  if(!id || !S.data) return null;
  const c=(S.data.contas||[]).find(x=>x&&String(x.id)===String(id));
  if(!c) return null;
  if(!opts.includeArchived && (c.active===false||c.archivedAt)) return null;
  return c;
}
function resolveAccountId(ref, opts={}){
  if(!ref || !S.data) return null;
  const direct=accountById(ref,{includeArchived:!!opts.includeArchived});
  if(direct) return direct.id;
  const list=(opts.includeArchived?(S.data.contas||[]):activeAccounts()).filter(c=>normalizeAccountName(c.nome)===normalizeAccountName(ref));
  return list.length===1 ? list[0].id : null;
}
function accountNameSnapshot(accountId, fallback=''){ const c=accountById(accountId,{includeArchived:true}); return c?c.nome:(fallback||''); }
function accountLinkedRecordCount(accountId){
  if(!S.data||!accountId) return 0;
  let n=0; const arrays=[S.data.transacoes,S.data.fixas,S.data.fixaPagamentos,S.data.bens,S.data.metas,S.data.agenda,S.data.boletos,S.data.assinaturas,S.data.assinaturaCobrancas];
  arrays.forEach(arr=>(arr||[]).forEach(x=>{if(x&&x.accountId===accountId)n++;}));
  (S.data.transferencias||[]).forEach(t=>{if(t&&(t.origemAccountId===accountId||t.destinoAccountId===accountId||t.origemId===accountId||t.destinoId===accountId))n++;});
  (S.data.liquidez||[]).forEach(l=>{if(l&&l.accountId===accountId)n++;});
  (S.data.cartoes||[]).forEach(c=>(c.faturasPagas||[]).forEach(pg=>{if(pg&&pg.accountId===accountId)n++;}));
  (S.data.boletos||[]).forEach(b=>(b.pagamentos||[]).forEach(pg=>{if(pg&&pg.accountId===accountId)n++;}));
  return n;
}
function accountSelectOptions(opts={}){
  let list=activeAccounts();
  if(opts.excludeCarteira) list=list.filter(c=>!c.isCarteira);
  if(opts.excludeId) list=list.filter(c=>c.id!==opts.excludeId);
  const counts={}; list.forEach(c=>{const k=normalizeAccountName(c.nome);counts[k]=(counts[k]||0)+1;});
  const out=list.map(c=>({value:c.id,label:counts[normalizeAccountName(c.nome)]>1?`${c.nome} · ${String(c.id).slice(0,8)}`:c.nome}));
  return opts.includeNone ? [{value:'',label:'— Nenhum —'},...out] : out;
}
function allBankNames(){
  const names = new Set(); activeAccounts().forEach(c=>{if(c.nome)names.add(c.nome);});
  (S.data.cartoes||[]).forEach(c=>{ if(c.banco) names.add(c.banco); });
  return Array.from(names).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

/* V6.25.1 — O filtro superior representa instituições financeiras, não registros.
   Portanto: ignora Carteira/dinheiro físico e unifica nomes como Nubank/NUBANK. */
function bankFilterNames(){
  const preferred = new Map();
  const score = value => {
    const text=String(value||'').trim();
    if(!text) return -1;
    const letters=text.replace(/[^A-Za-zÀ-ÿ]/g,'');
    if(!letters) return 0;
    const allUpper=letters===letters.toLocaleUpperCase('pt-BR');
    const allLower=letters===letters.toLocaleLowerCase('pt-BR');
    return (!allUpper && !allLower) ? 2 : (allLower ? 1 : 0);
  };
  const add = value => {
    const label=String(value||'').trim();
    const key=normalizeAccountName(label);
    if(!key) return;
    const current=preferred.get(key);
    if(!current || score(label)>score(current)) preferred.set(key,label);
  };
  activeAccounts().filter(c=>!c.isCarteira && c.accountKind!=='wallet').forEach(c=>add(c.nome));
  (S.data.cartoes||[]).forEach(c=>add(c&&c.banco));
  return Array.from(preferred.values()).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function bankMatches(itemBanco, itemAccountId){
  if(!S.bankFilter || S.bankFilter.size===0) return true;
  const name=itemAccountId?accountNameSnapshot(itemAccountId,itemBanco):itemBanco;
  if(!name) return false;
  const wanted=normalizeAccountName(name);
  return Array.from(S.bankFilter).some(selected=>normalizeAccountName(selected)===wanted);
}
function bankSelectField(idPrefix, selected, opts={}){
  const selectedId=resolveAccountId(selected)||selected||'';
  return {key:opts.key||'accountId', label:opts.label||'Banco/Conta', type:'select', options:accountSelectOptions({includeNone:true}), default:selectedId};
}

/* Banco/Conta e Cartão são registros distintos. Nomes são apenas rótulos. */
function getCarteiraConta(){ return activeAccounts().find(c=>c&&c.isCarteira)||null; }
function accountSelectNames(){ return activeAccounts().map(c=>c.nome); } // compatibilidade de exibição
function accountSelectField(idPrefix, selected, opts={}){
  const selectedId=resolveAccountId(selected)||selected||'';
  return {key:opts.key||'accountId', label:opts.label||'Banco/Conta', type:'select', options:accountSelectOptions(), default:selectedId||((accountSelectOptions()[0]||{}).value||'')};
}
function nonCarteiraAccountNames(){ return activeAccounts().filter(c=>!c.isCarteira).map(c=>c.nome); }
function allCardNames(){ return (S.data.cartoes||[]).filter(c=>c&&c.banco).map(c=>c.banco); }
function cardSelectOptions(){
  const cards=(S.data.cartoes||[]).filter(c=>c&&c.id&&c.banco); const counts={};cards.forEach(c=>counts[normalizeAccountName(c.banco)]=(counts[normalizeAccountName(c.banco)]||0)+1);
  return cards.map(c=>({value:c.id,label:counts[normalizeAccountName(c.banco)]>1?`${c.banco} · ${String(c.id).slice(0,8)}`:c.banco}));
}
function cardSelectField(idPrefix, selected){
  const byName=(S.data.cartoes||[]).filter(c=>normalizeAccountName(c.banco)===normalizeAccountName(selected));
  const selectedId=(S.data.cartoes||[]).some(c=>c.id===selected)?selected:(byName.length===1?byName[0].id:'');
  return {key:'cartaoId',label:'Cartão de crédito',type:'select',options:cardSelectOptions(),default:selectedId||((cardSelectOptions()[0]||{}).value||'')};
}
function showBankRequiredModal(msg){
  const text = msg || 'Todo lançamento precisa de um banco/conta vinculado.';
  if(!document.getElementById('modal-root') || typeof el!=='function'){ alert(text); return; }
  const box = el(`
    <div class="modal-overlay">
      <div class="modal-box bank-required-modal">
        <div class="modal-head"><h2>Banco/conta obrigatório</h2><button id="br_close">&times;</button></div>
        <p class="confirm-text">${esc(text)}</p>
        <div class="info-box">Essa conta não se conecta ao banco real. Ela serve só como referência dentro do Borion para você lançar receitas, despesas, pagamentos e rastrear suas movimentações com facilidade.</div>
        <div class="row-btns" style="margin-top:12px;"><button class="btn btn-primary btn-block" id="br_add">Adicionar conta do banco</button></div>
        <button class="link-btn" id="br_cancel" style="width:100%;margin-top:10px;">Cancelar</button>
      </div>
    </div>`);
  $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
  $('#br_close').onclick=closeModal;
  $('#br_cancel').onclick=closeModal;
  $('#br_add').onclick=()=>{
    closeModal();
    S.view='cards';
    renderApp();
    setTimeout(()=>{ if(typeof Cards!=='undefined' && Cards.addConta) Cards.addConta(); }, 80);
  };
}
function requireBanco(bancoVal, msg){
  const banco = bancoVal==='— Nenhum —' ? '' : (bancoVal||'');
  if(!banco){ showBankRequiredModal(msg||'Escolha um banco/conta/cartão para este lançamento.'); return null; }
  return banco;
}
function requireAccountId(accountRef, msg){
  const id=resolveAccountId(accountRef);
  if(!id){ showBankRequiredModal(msg||'Escolha uma conta bancária ativa.'); return null; }
  return id;
}

/* ---------------- V6.0 — proteção: reserva nunca pode ficar negativa ----------------
   Usado por qualquer fluxo que tire dinheiro de uma reserva (despesa paga direto da
   reserva, transferência com origem reserva, resgate manual). */
function reservaTemSaldo(box, valor){
  return !!box && (Number(box.valorAtual)||0) >= (Number(valor)||0) - 1e-9;
}
function showReservaInsuficienteModal(box, valorNecessario){
  const disponivel = Number(box && box.valorAtual || 0);
  if(!document.getElementById('modal-root') || typeof el!=='function'){
    alert('Saldo insuficiente na reserva.'); return;
  }
  const boxNome = box ? box.nome : 'Reserva';
  const boxEl = el(`
    <div class="modal-overlay">
      <div class="modal-box bank-required-modal">
        <div class="modal-head"><h2>Saldo insuficiente na reserva</h2><button id="ri_close">&times;</button></div>
        <p class="confirm-text">A reserva "${esc(boxNome)}" tem ${brl(disponivel)} disponível, mas o valor informado é ${brl(valorNecessario)}.</p>
        <div class="info-box">Uma reserva nunca pode ficar negativa. Reduza o valor, escolha outra reserva ou reserve mais dinheiro antes de continuar.</div>
        <button class="link-btn" id="ri_ok" style="width:100%;margin-top:10px;">Entendi</button>
      </div>
    </div>`);
  $('#modal-root').innerHTML=''; $('#modal-root').appendChild(boxEl); attachModalGuard(boxEl);
  $('#ri_close').onclick=closeModal;
  $('#ri_ok').onclick=closeModal;
}

/* ---------------- Liquidez: ajuste de saldo por banco (usado por fatura paga, boleto pago,
   transferências e, a partir da V6.22, receitas/despesas ligadas a uma conta) ----------------
   V6.22 — o "ativo de liquidez" deixou de ser algo digitado à mão: cada conta cadastrada em
   Cartões e Contas tem uma entrada dedicada aqui (nome===banco), que funciona só como um
   acumulador de ajustes (delta) a partir do saldo inicial da conta. Para nunca confundir esse
   acumulador com um "ativo de liquidez" antigo que o usuário tenha criado à mão com outro nome
   (ex.: "Dinheiro guardado em casa"), o match exige nome===banco — só a própria entrada da
   conta é reaproveitada; entradas manuais antigas nunca são tocadas por adjustLiquidez. */
function findLiquidezEntry(accountRef, createIfMissing){
  const accountId=resolveAccountId(accountRef,{includeArchived:true});
  if(!accountId) return null;
  if(!Array.isArray(S.data.liquidez)) S.data.liquidez=[];
  let l=S.data.liquidez.find(x=>x&&x.ledgerType==='account_delta'&&x.accountId===accountId);
  if(!l && createIfMissing){
    const c=accountById(accountId,{includeArchived:true});
    l={id:uid(),accountId,ledgerType:'account_delta',nome:c?c.nome:'Conta',banco:c?c.nome:'',valor:0,createdAt:Date.now()};
    S.data.liquidez.push(l);
  }
  return l;
}
function adjustLiquidez(accountRef, delta){
  const amount=Number(delta)||0; if(!accountRef||!amount) return false;
  const l=findLiquidezEntry(accountRef,true);
  if(!l) return false;
  l.valor=Math.round(((Number(l.valor)||0)+amount)*100)/100; return true;
}
function contaSaldoAtual(conta){
  if(!conta) return 0;
  const ledger=(S.data.liquidez||[]).find(l=>l&&l.ledgerType==='account_delta'&&l.accountId===conta.id);
  return Math.round(((Number(conta.saldoInicial)||0)+(ledger?Number(ledger.valor)||0:0))*100)/100;
}
function saldoContasDetalhe(){
  const rows=activeAccounts().filter(c=>bankMatches(c.nome,c.id)).map(c=>({id:'conta:'+c.id,contaId:c.id,tipo:'conta',nome:c.nome,valor:contaSaldoAtual(c),isCarteira:!!c.isCarteira}));
  (S.data.liquidez||[]).forEach(l=>{
    const isLedger=l&&l.ledgerType==='account_delta'&&!!l.accountId;
    if(!isLedger&&bankMatches(l.banco,l.accountId)) rows.push({id:l.id,tipo:'manual',nome:l.nome,valor:Number(l.valor)||0});
  });
  return rows;
}
function saldoEmContasTotal(){ return Math.round(saldoContasDetalhe().reduce((s,r)=>s+(Number(r.valor)||0),0)*100)/100; }
function saldoBancoNome(bn){
  if(!bn) return 0; let total=0;
  activeAccounts().filter(c=>normalizeAccountName(c.nome)===normalizeAccountName(bn)).forEach(c=>{total+=contaSaldoAtual(c);});
  (S.data.liquidez||[]).forEach(l=>{if(l&&l.ledgerType!=='account_delta'&&normalizeAccountName(l.banco)===normalizeAccountName(bn))total+=Number(l.valor)||0;});
  return Math.round(total*100)/100;
}
function txContaDelta(tx){
  if(!tx||!tx.accountId) return 0;
  if(tx.tipo==='receita') return (Number(tx.valor)||0)-(Number(tx.reservaValor)||0);
  if(tx.tipo==='variavel'&&tx.statusPagamento!=='Em aberto'&&tx.origemPagamento!=='reserva'&&tx.formaPagamento!=='Crédito') return -(Number(tx.valor)||0);
  return 0;
}
function applyTxSaldoEffect(tx){const d=txContaDelta(tx);if(d)return adjustLiquidez(tx.accountId,d);return true;}
function reverseTxSaldoEffect(tx){const d=txContaDelta(tx);if(d)return adjustLiquidez(tx.accountId,-d);return true;}
function runAtomicFinancialMutation(mutator,onError){
  const before=JSON.parse(JSON.stringify(S.data));
  try{ mutator(); return true; }
  catch(err){
    S.data=before;
    try{ if(typeof saveCurrentData==='function') saveCurrentData(); }catch(_){}
    console.error('[BORION][FINANCIAL_ROLLBACK]',err);
    if(typeof onError==='function') onError(err);
    return false;
  }
}

/* ---------------- Global App State ---------------- */
const S = {
  config: getConfig(),
  profiles: getProfiles(),
  currentProfile: null,
  data: null,
  view: 'overview',
  budgetTab: 'receita',
  invMercado: 'BR',
  month: todayYM(),
  filters: {
    receita:{busca:'',categorias:[],dataDe:'',dataAte:'',dateSort:'asc'},
    fixa:{busca:'',categorias:[],dataDe:'',dataAte:'',dateSort:'asc'},
    variavel:{busca:'',categorias:[],dataDe:'',dataAte:'',dateSort:'asc'},
    /* V6.1 — filtros da aba "Central" de Lançamentos (consulta unificada de todas as
       movimentações do perfil). Não afeta os filtros das abas Receita/Fixa/Variável acima. */
    central:{tipo:'todos', origem:'todas', reservaId:'', contaId:'', periodo:'todos', dataDe:'', dataAte:'', status:'todos', categoria:'', busca:'', sort:'data_desc'}
  },
  centralPageSize: 30,
  gate: { mode:'list', selectedProfileId:null, error:'' },
  valuesHidden: readJSON('mc_values_hidden', false),
  bankFilter: null,
  patrView: { dividasCollapsed:false, reservasCollapsed:true, reservaRendimentosCollapsed:true },
  chequeTab: 'resumo',
  importState: null,
  settingsTab: 'modules'
};
function toggleValuesHidden(){
  S.valuesHidden = !S.valuesHidden;
  writeJSON('mc_values_hidden', S.valuesHidden);
  renderView();
}

const BorionDataActions6401 = {
  _deviceId(){ return (window.GoogleDriveProvider&&GoogleDriveProvider._deviceId)||null; },
  _operationId(){
    if(window.GoogleDriveProvider){
      if(!GoogleDriveProvider._queueOperationId && window.BorionSyncCore) GoogleDriveProvider._queueOperationId=BorionSyncCore.uuid640();
      if(GoogleDriveProvider._queueOperationId) return GoogleDriveProvider._queueOperationId;
    }
    return window.BorionSyncCore?BorionSyncCore.uuid640():uid();
  },
  captureImplicitDeletions(previous,current,profileId){
    if(!previous||!current||!window.BorionSyncCore) return {entities:0,primitives:0};
    BorionSyncCore.migrateDataToSchema640(previous,this._deviceId(),profileId);
    BorionSyncCore.migrateDataToSchema640(current,this._deviceId(),profileId);
    let entities=0,primitives=0;
    const opId=this._operationId(),deviceId=this._deviceId();
    for(const path of BorionSyncCore.BORION_SYNCABLE_COLLECTIONS){
      const before=BorionSyncCore.pathGet(previous,path),after=BorionSyncCore.pathGet(current,path);
      if(!Array.isArray(before)||!Array.isArray(after)) continue;
      const afterIds=new Set(after.filter(x=>x&&x.id).map(x=>String(x.id)));
      for(const rec of before){
        if(!rec||!rec.id||afterIds.has(String(rec.id))) continue;
        const key=BorionSyncCore.pathKey(path),meta=BorionSyncCore.ensureSyncMeta(current);
        if(meta.tombstones[key]&&meta.tombstones[key][String(rec.id)]) continue;
        BorionSyncCore.recordTombstone(current,path,String(rec.id),deviceId,opId,{reason:'captured_real_delete'}); entities++;
      }
    }
    for(const type of ['receita','fixa','variavel']){
      const path=['categorias',type],before=BorionSyncCore.pathGet(previous,path)||[],after=BorionSyncCore.pathGet(current,path)||[];
      const afterKeys=new Set(after.map(v=>BorionSyncCore.canonicalStringify(v)));
      for(const value of before){
        const ck=BorionSyncCore.canonicalStringify(value); if(afterKeys.has(ck)) continue;
        const id='primitive_'+BorionSyncCore.sha256Sync640(BorionSyncCore.pathKey(path)+'|'+ck).slice(0,40);
        const key=BorionSyncCore.pathKey(path),meta=BorionSyncCore.ensureSyncMeta(current);
        if(meta.tombstones[key]&&meta.tombstones[key][id]) continue;
        BorionSyncCore.recordTombstone(current,path,id,deviceId,opId,{reason:'captured_category_delete',value}); primitives++;
      }
    }
    return {entities,primitives};
  },
  deleteEntity({profileId,collection,entityId,reason='user_delete'}){
    const pid=profileId||(S.currentProfile&&S.currentProfile.id); if(!pid||!entityId) return false;
    const data=(S.currentProfile&&S.currentProfile.id===pid)?S.data:getProfileData(pid); if(!data) return false;
    const arr=BorionSyncCore.pathGet(data,collection); if(!Array.isArray(arr)) return false;
    const next=arr.filter(x=>!(x&&String(x.id)===String(entityId))); if(next.length===arr.length) return false;
    BorionSyncCore.pathSet(data,collection,next);
    BorionSyncCore.recordTombstone(data,collection,String(entityId),this._deviceId(),this._operationId(),{reason});
    if(S.currentProfile&&S.currentProfile.id===pid){ S.data=data; saveCurrentData(); }
    else setProfileData(pid,data);
    return true;
  },
  deleteProfile(profileId,reason='user_delete'){ return recordProfileDeletion6401(profileId,reason); },
  async deleteProfileAndSync(profileId,reason='user_delete'){
    const id=String(profileId||'');
    const profile=(S.profiles||[]).find(p=>p&&String(p.id)===id);
    if(!id||!profile) return {deleted:false,reason:'profile_not_found'};
    const wasCurrent=!!(S.currentProfile&&String(S.currentProfile.id)===id);
    const tombstone=this.deleteProfile(id,reason);

    S.profiles=(S.profiles||[]).filter(p=>p&&String(p.id)!==id);
    setProfiles(S.profiles);
    try{localStorage.removeItem(LS_DATA_PREFIX+id);}catch(e){}
    try{if(typeof idbDeleteProfileData==='function') await idbDeleteProfileData(id);}catch(e){console.warn('[BORION][PROFILE_DELETE][IDB_CLEANUP_WARN]',e);}
    try{if(typeof clearExitSavePending==='function') clearExitSavePending(id);}catch(e){}

    if(wasCurrent){
      if(typeof logout==='function') logout();
      else{S.currentProfile=null;S.data=null;S.gate={mode:'list',error:''};if(typeof renderGate==='function')renderGate();}
    }else if(typeof renderView==='function'&&S.currentProfile){
      renderView();
    }else if(typeof renderGate==='function'){
      renderGate();
    }

    let syncResult=null,syncError=null;
    const provider=window.GoogleDriveProvider||null;
    if(provider&&provider.isConnected&&provider.isConnected()){
      // queueSave() persiste a pendência e solicita a líder imediatamente. O
      // forceSyncNow() não cria outra operação: reutiliza o operationId já ligado
      // ao tombstone acima e tenta confirmar o snapshot sem esperar o debounce.
      provider.queueSave();
      if(typeof navigator==='undefined'||navigator.onLine!==false){
        try{syncResult=await provider.forceSyncNow({reason:'profile_delete',profileId:id});}
        catch(e){syncError=e;console.warn('[BORION][PROFILE_DELETE][SYNC_PENDING]',e);}
      }
    }
    return {deleted:true,profileId:id,profileName:profile.name||'Perfil',wasCurrent,tombstone,syncResult,syncError};
  }
};
window.BorionDataActions6401=BorionDataActions6401;

function saveCurrentData(options={}){
  if(S.currentProfile && S.data){
    const _previousProfileData = getProfileData(S.currentProfile.id);
    if(!options.skipPatrimonioSnapshot) recordPatrimonioSnapshot();
    try{ BorionDataActions6401.captureImplicitDeletions(_previousProfileData,S.data,S.currentProfile.id); }
    catch(e){ console.warn('[BORION][DELETE_CAPTURE_WARN]',e); }
    setProfileData(S.currentProfile.id, S.data);
    // V5.34.3 — isolamento entre perfis: o profileId é passado explicitamente
    // (o mesmo que acabou de receber os dados em setProfileData acima), em vez
    // de depender só da variável interna CloudStorage.activeProfileId. Isso
    // fecha qualquer janela em que os dois pudessem divergir e um perfil
    // acabasse sobrescrevendo a linha de outro no Supabase.
    if(window.CloudStorage && CloudStorage.user){ CloudStorage.queueSave(S.currentProfile.id, S.data); }
    if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected()){ GoogleDriveProvider.queueSave(); }
    if(!options.finalConfirmation) markExitSavePending(S.currentProfile.id);
  }
  BackupFS.markDirty();
}

function confirmFinalSave(reason='manual'){
  if(!S.currentProfile || !S.data) return false;
  saveCurrentData({finalConfirmation:true});
  clearExitSavePending(S.currentProfile.id);
  try{
    if(window.CloudStorage && CloudStorage.user && navigator.onLine){ CloudStorage.syncNow(); }
    if(window.BackupFS){ BackupFS.maybeAutoBackup(); }
  }catch(e){ console.warn('[BORION_EXIT_SAVE][FINAL_SAVE_WARN]', e); }
  return true;
}
