/* Borion Finance — Organização visual (módulos e itens): camada leve, independente e opcional.
   IMPORTANTE: este arquivo NUNCA participa de cálculos financeiros, saldos, lançamentos,
   sincronização de dados, perfis ou autenticação. Ele só guarda listas de IDs (a ordem
   escolhida pelo usuário) e decide em que ordem exibir itens que já existem em S.data.
   Nada aqui cria, apaga ou modifica bancos, cartões, reservas, transações ou perfis.

   Onde é salvo:
   - Local (sempre): localStorage, em chaves isoladas por conta (user_id) + perfil (profile_id)
     + tipo de lista: borion_order_<userId>_<profileId>_<tipo>.
   - Nuvem (quando há Supabase conectado e usuário logado): tabela borion_ui_preferences,
     via upsert (user_id, profile_id, preference_key, preference_value, updated_at),
     reaproveitando o client já inicializado por CloudStorage (17-borion-cloud.js). Nunca
     mexe nas tabelas financeiras (profiles, borion_profile_data, borion_backups, etc.). */

const ORDER_PREF_TABLE = 'borion_ui_preferences';
const ORDER_TYPES = {
  modules: { label: 'Módulos do menu' },
  contas:  { label: 'Bancos e contas' },
  cartoes: { label: 'Cartões' },
  reservas:{ label: 'Reservas e cofrinhos' },
  patrimony_modules:{ label: 'Módulos do patrimônio' },
  cat_receita:{ label: 'Categorias de receita' },
  cat_fixa:{ label: 'Categorias de despesa fixa' },
  cat_variavel:{ label: 'Categorias de despesa variável' }
};

const OrderPreferences = {
  active: false,      // modo Organizar ligado/desligado — só em memória (sessão atual)
  activeType: null,    // lista que abriu o modo por seu botão local; null quando ativado por Configurações
  controlSelection: {},// seleção visual temporária dos menus; vazia = mostra sempre o rótulo neutro ORDEM
  pending: {},         // {tipo: [ids...]} — mudanças feitas desde que o modo foi ligado, ainda não salvas
  pendingReservaColumns: null, // 2, 3 ou 4 — só é confirmado ao clicar em OK
  pendingPatrimonyColumns: null, // 1, 2 ou 3 — só é confirmado ao clicar em OK
  _hydrated: {},        // {escopoDoPerfil: true} — evita buscar na nuvem mais de uma vez por perfil

  /* ---------------- Escopo: conta + perfil ---------------- */
  effectiveUserId(){ return (window.CloudStorage && CloudStorage.user && CloudStorage.user.id) ? CloudStorage.user.id : 'anon'; },
  effectiveProfileId(){ return (typeof S !== 'undefined' && S.currentProfile && S.currentProfile.id) ? S.currentProfile.id : 'sem_perfil'; },
  profileScopeKey(){ return this.effectiveUserId() + '_' + this.effectiveProfileId(); },
  storageKey(type){ return 'borion_order_' + this.effectiveUserId() + '_' + this.effectiveProfileId() + '_' + type; },
  modeStorageKey(type){ return 'borion_ordermode_' + this.effectiveUserId() + '_' + this.effectiveProfileId() + '_' + type; },
  reservaColumnsStorageKey(){ return 'borion_reserva_columns_' + this.effectiveUserId() + '_' + this.effectiveProfileId(); },
  patrimonyColumnsStorageKey(){ return 'borion_patrimony_columns_' + this.effectiveUserId() + '_' + this.effectiveProfileId(); },
  pendingCloudKey(type){ return 'borion_orderpending_' + this.profileScopeKey() + '_' + type; },

  /* ---------------- Leitura/gravação local + perfil ---------------- */
  profilePreferenceRoot(create=false){
    if(typeof S==='undefined'||!S.data) return null;
    if(create&&!S.data.uiPreferences) S.data.uiPreferences={};
    if(create&&!S.data.uiPreferences.orderPreferences) S.data.uiPreferences.orderPreferences={orders:{},sortModes:{},reservaColumns:3,patrimonyColumns:2};
    const root=S.data.uiPreferences&&S.data.uiPreferences.orderPreferences;
    if(root&&create){if(!root.orders)root.orders={};if(!root.sortModes)root.sortModes={};}
    return root||null;
  },
  getSavedOrder(type){
    const root=this.profilePreferenceRoot(false),profileValue=root&&root.orders&&root.orders[type];
    if(Array.isArray(profileValue)) return profileValue.slice();
    const v=readJSON(this.storageKey(type),[]);return Array.isArray(v)?v:[];
  },
  saveOrderLocal(type,ids){
    const safe=Array.isArray(ids)?ids.slice():[];writeJSON(this.storageKey(type),safe);
    const root=this.profilePreferenceRoot(true);if(root)root.orders[type]=safe.slice();
  },
  clampReservaColumns(value){const n=Number(value);return [2,3,4].includes(n)?n:3;},
  clampPatrimonyColumns(value){const n=Number(value);return [1,2,3].includes(n)?n:2;},
  getReservaColumns(){const root=this.profilePreferenceRoot(false);return this.clampReservaColumns(root&&root.reservaColumns!=null?root.reservaColumns:readJSON(this.reservaColumnsStorageKey(),3));},
  getPatrimonyColumns(){const root=this.profilePreferenceRoot(false);return this.clampPatrimonyColumns(root&&root.patrimonyColumns!=null?root.patrimonyColumns:readJSON(this.patrimonyColumnsStorageKey(),2));},
  workingReservaColumns(){return (this.active&&this.activeType==='reservas'&&this.pendingReservaColumns!=null)?this.clampReservaColumns(this.pendingReservaColumns):this.getReservaColumns();},
  workingPatrimonyColumns(){return (this.active&&this.activeType==='patrimony_modules'&&this.pendingPatrimonyColumns!=null)?this.clampPatrimonyColumns(this.pendingPatrimonyColumns):this.getPatrimonyColumns();},
  saveReservaColumnsLocal(value){const safe=this.clampReservaColumns(value);writeJSON(this.reservaColumnsStorageKey(),safe);const root=this.profilePreferenceRoot(true);if(root)root.reservaColumns=safe;},
  savePatrimonyColumnsLocal(value){const safe=this.clampPatrimonyColumns(value);writeJSON(this.patrimonyColumnsStorageKey(),safe);const root=this.profilePreferenceRoot(true);if(root)root.patrimonyColumns=safe;},
  setReservaColumns(value){if(!(this.active&&this.activeType==='reservas'))return;this.pendingReservaColumns=this.clampReservaColumns(value);this.notify();},
  setPatrimonyColumns(value){if(!(this.active&&this.activeType==='patrimony_modules'))return;this.pendingPatrimonyColumns=this.clampPatrimonyColumns(value);this.notify();},
  getSortMode(type){const root=this.profilePreferenceRoot(false);const profileValue=root&&root.sortModes&&root.sortModes[type];const v=profileValue||readJSON(this.modeStorageKey(type),'manual');return ['manual','az','za','recent','old'].includes(v)?v:'manual';},
  setSortMode(type,mode){writeJSON(this.modeStorageKey(type),mode);const root=this.profilePreferenceRoot(true);if(root)root.sortModes[type]=mode;if(typeof saveCurrentData==='function')saveCurrentData();this.notify();},

  /* Ordem "de trabalho": se o modo Organizar está ligado e o usuário já mexeu nessa lista
     nesta sessão, usa o rascunho em memória (pending); senão usa a ordem salva. */
  workingOrder(type){
    if(this.active && this.pending[type]) return this.pending[type].slice();
    return this.getSavedOrder(type);
  },

  /* Remove da ordem salva qualquer ID que não exista mais na lista atual (item excluído) e
     acrescenta no final qualquer ID novo que ainda não estava na ordem (item recém-criado).
     Nunca falha e nunca duplica — sempre devolve exatamente os IDs de currentIds, uma vez cada. */
  reconcile(type, currentIds){
    const saved = this.workingOrder(type);
    const validSet = new Set(currentIds);
    const cleaned = saved.filter(id=>validSet.has(id));
    const already = new Set(cleaned);
    const missing = currentIds.filter(id=>!already.has(id));
    return cleaned.concat(missing);
  },

  /* Calcula a ordem de exibição de uma lista de objetos, SEM alterar os objetos originais nem
     o array original (sempre devolve uma cópia). 'recent'/'old' usam a posição original do
     array (S.data.* é sempre preenchido com push, então o índice já é a ordem de criação). */
  applyOrder(type, items, opts={}){
    const idKey = opts.idKey || 'id';
    const labelKey = opts.labelKey || 'nome';
    const wrapped = items.map((item, idx)=>({item, idx}));
    const mode = this.getSortMode(type);
    if(mode==='az'){
      wrapped.sort((a,b)=>String((a.item&&a.item[labelKey])||'').localeCompare(String((b.item&&b.item[labelKey])||''), 'pt-BR'));
    } else if(mode==='za'){
      wrapped.sort((a,b)=>String((b.item&&b.item[labelKey])||'').localeCompare(String((a.item&&a.item[labelKey])||''), 'pt-BR'));
    } else if(mode==='recent'){
      wrapped.sort((a,b)=>b.idx-a.idx);
    } else if(mode==='old'){
      wrapped.sort((a,b)=>a.idx-b.idx);
    } else {
      const currentIds = items.map(x=>x[idKey]);
      const order = this.reconcile(type, currentIds);
      const pos = new Map(order.map((id,i)=>[id,i]));
      wrapped.sort((a,b)=>{
        const pa = pos.has(a.item[idKey]) ? pos.get(a.item[idKey]) : 999999;
        const pb = pos.has(b.item[idKey]) ? pos.get(b.item[idKey]) : 999999;
        if(pa!==pb) return pa-pb;
        return a.idx-b.idx;
      });
    }
    return wrapped.map(x=>x.item);
  },

  /* ---------------- Movimentação (setas e drag) — tudo fica em memória até Salvar ---------------- */
  arrayMove(arr, from, to){
    const a = arr.slice();
    const [item] = a.splice(from,1);
    a.splice(to,0,item);
    return a;
  },
  currentWorkingIds(type, naturalIds){
    if(this.pending[type]) return this.pending[type].slice();
    return this.reconcile(type, naturalIds);
  },
  moveItem(type, naturalIds, id, direction){
    let ids = this.currentWorkingIds(type, naturalIds);
    const idx = ids.indexOf(id);
    if(idx<0) return;
    let newIdx;
    if(direction==='top') newIdx=0;
    else if(direction==='bottom') newIdx=ids.length-1;
    else newIdx = Math.max(0, Math.min(ids.length-1, idx+direction));
    if(newIdx===idx) return;
    this.pending[type] = this.arrayMove(ids, idx, newIdx);
    writeJSON(this.modeStorageKey(type),'manual');const root=this.profilePreferenceRoot(true);if(root)root.sortModes[type]='manual';
    this.notify();
  },
  reorderFromDom(type, idsInDomOrder){
    this.pending[type] = idsInDomOrder.slice();
    writeJSON(this.modeStorageKey(type),'manual');const root=this.profilePreferenceRoot(true);if(root)root.sortModes[type]='manual';
    this.notify();
  },

  /* ---------------- Modo Organizar: ligar/desligar/salvar/cancelar/restaurar ---------------- */
  setActive(val, type=null){
    this.active = !!val;
    this.activeType = this.active ? (type || null) : null;
    this.pending = {};
    this.pendingReservaColumns = null;
    this.pendingPatrimonyColumns = null;
    if(!this.active) this.controlSelection = {};
    this.notify();
  },
  toggleActive(){ this.setActive(!this.active); },
  saveAll(){
    const types=Object.keys(this.pending);
    types.forEach(type=>{const ids=this.pending[type];this.saveOrderLocal(type,ids);this.syncToCloud(type,ids);});
    if(this.pendingReservaColumns!=null){const cols=this.clampReservaColumns(this.pendingReservaColumns);this.saveReservaColumnsLocal(cols);this.syncPreferenceToCloud('reservas_columns',cols);}
    if(this.pendingPatrimonyColumns!=null){const cols=this.clampPatrimonyColumns(this.pendingPatrimonyColumns);this.savePatrimonyColumnsLocal(cols);this.syncPreferenceToCloud('patrimony_columns',cols);}
    if(typeof saveCurrentData==='function')saveCurrentData();
    this.pending={};this.pendingReservaColumns=null;this.pendingPatrimonyColumns=null;this.active=false;this.activeType=null;this.controlSelection={};this.notify();
    if(typeof toast==='function')toast('Organização salva com sucesso.');
  },
  cancelAll(){
    this.pending = {};
    this.pendingReservaColumns = null;
    this.pendingPatrimonyColumns = null;
    this.active = false;
    this.activeType = null;
    this.controlSelection = {};
    this.notify();
    if(typeof toast==='function') toast('Alterações de organização descartadas.');
  },
  resetType(type){
    localStorage.removeItem(this.storageKey(type));
    delete this.pending[type];
    writeJSON(this.modeStorageKey(type), 'manual');
    this.syncToCloud(type, []);
    const root=this.profilePreferenceRoot(true);if(root){delete root.orders[type];delete root.sortModes[type];}
    if(type==='reservas'){localStorage.removeItem(this.reservaColumnsStorageKey());this.pendingReservaColumns=null;this.saveReservaColumnsLocal(3);this.syncPreferenceToCloud('reservas_columns',3);}
    if(type==='patrimony_modules'){localStorage.removeItem(this.patrimonyColumnsStorageKey());this.pendingPatrimonyColumns=null;this.savePatrimonyColumnsLocal(2);this.syncPreferenceToCloud('patrimony_columns',2);}
    if(typeof saveCurrentData==='function')saveCurrentData();
  },
  resetAllVisible(types){
    (types || Object.keys(ORDER_TYPES)).forEach(t=>this.resetType(t));
    this.notify();
    if(typeof toast==='function') toast('Ordem padrão restaurada.');
  },

  /* ---------------- Sincronização com Supabase (opcional, com fallback local) ----------------
     Usa o client já criado por CloudStorage.init() — não cria outro client nem outra tabela
     financeira. Escreve/lê só em borion_ui_preferences. Se estiver offline ou a tabela ainda
     não existir (SQL não rodado), a organização continua funcionando 100% localmente. */
  async syncPreferenceToCloud(type, value){
    try{
      if(!(window.CloudStorage && CloudStorage.user && CloudStorage.client)){ return; }
      if(!navigator.onLine){ this.markPendingCloud(type, value); return; }
      const payload = {
        user_id: CloudStorage.user.id,
        profile_id: this.effectiveProfileId(),
        preference_key: type,
        preference_value: value,
        updated_at: new Date().toISOString()
      };
      const { error } = await CloudStorage.client
        .from(ORDER_PREF_TABLE)
        .upsert(payload, { onConflict: 'user_id,profile_id,preference_key' });
      if(error){ this.markPendingCloud(type, value); console.warn('[BORION_ORDER][SYNC_WARN]', error); }
      else { this.clearPendingCloud(type); }
    }catch(e){
      this.markPendingCloud(type, value);
      console.warn('[BORION_ORDER][SYNC_ERROR]', e);
    }
  },
  syncToCloud(type, ids){ return this.syncPreferenceToCloud(type, Array.isArray(ids)?ids:[]); },
  markPendingCloud(type, value){ writeJSON(this.pendingCloudKey(type), { value, savedAt: Date.now() }); },
  clearPendingCloud(type){ try{ localStorage.removeItem(this.pendingCloudKey(type)); }catch(e){} },
  retryPendingCloudSync(){
    if(!(window.CloudStorage && CloudStorage.user && navigator.onLine)) return;
    [...Object.keys(ORDER_TYPES),'reservas_columns','patrimony_columns'].forEach(type=>{
      const pend = readJSON(this.pendingCloudKey(type), null);
      if(!pend) return;
      if(Object.prototype.hasOwnProperty.call(pend,'value')) this.syncPreferenceToCloud(type, pend.value);
      else if(Array.isArray(pend.ids)) this.syncPreferenceToCloud(type, pend.ids); // compatibilidade com versões antigas
    });
  },
  /* Busca a organização salva na nuvem uma única vez por perfil (não faz polling nem chamada
     a cada movimento). Só grava no cache local se ainda não houver nada salvo neste dispositivo,
     para nunca sobrescrever uma organização feita offline que ainda não sincronizou. */
  async hydrateFromCloud(){
    const scopeKey = this.profileScopeKey();
    if(this._hydrated[scopeKey]) return;
    this._hydrated[scopeKey] = true;
    try{
      if(!(window.CloudStorage && CloudStorage.user && CloudStorage.client && navigator.onLine)) return;
      const { data, error } = await CloudStorage.client
        .from(ORDER_PREF_TABLE)
        .select('preference_key,preference_value,updated_at')
        .eq('user_id', CloudStorage.user.id)
        .eq('profile_id', this.effectiveProfileId());
      if(error || !Array.isArray(data)) return;
      let changed = false;
      data.forEach(row=>{
        if(!row || !row.preference_key) return;
        if(row.preference_key==='reservas_columns'){const localKey=this.reservaColumnsStorageKey();if(localStorage.getItem(localKey)==null){this.saveReservaColumnsLocal(row.preference_value);changed=true;}return;}
        if(row.preference_key==='patrimony_columns'){const localKey=this.patrimonyColumnsStorageKey();if(localStorage.getItem(localKey)==null){this.savePatrimonyColumnsLocal(row.preference_value);changed=true;}return;}
        if(!Array.isArray(row.preference_value)) return;
        const localKey = this.storageKey(row.preference_key);
        if(localStorage.getItem(localKey)==null){ this.saveOrderLocal(row.preference_key, row.preference_value); changed = true; }
      });
      if(changed){if(typeof saveCurrentData==='function')saveCurrentData();this.notify();}
    }catch(e){ console.warn('[BORION_ORDER][HYDRATE_WARN]', e); }
  },

  /* ---------------- Re-render leve ----------------
     Reaproveita renderView(), já usado pelo app inteiro após qualquer mudança de estado —
     não recalcula saldos nem lançamentos, só redesenha o HTML da tela atual. */
  notify(){
    this.ensureBanner();
    if(typeof renderView==='function' && typeof S!=='undefined' && S.currentProfile && S.data){
      try{ renderView(); }catch(e){ console.warn('[BORION_ORDER][RENDER_WARN]', e); }
    }
  },

  /* ---------------- Indicação visual do modo ativo (banner fixo, some quando OFF) ---------------- */
  ensureBanner(){
    let bar = document.getElementById('order_mode_banner');
    if(!this.active){ if(bar) bar.classList.remove('show'); return; }
    if(!bar){
      bar = document.createElement('div');
      bar.id = 'order_mode_banner';
      bar.className = 'order-mode-banner';
      document.body.appendChild(bar);
    }
    const isReservaGrid=this.activeType==='reservas'&&!(typeof isSmartphoneMode==='function'&&isSmartphoneMode());
    const isPatrimonyGrid=this.activeType==='patrimony_modules';
    bar.innerHTML = `
      <div class="omb-text">
        <strong>${isReservaGrid?'Organização visual das Reservas ativa.':(isPatrimonyGrid?'Organização visual do Patrimônio ativa.':'Modo de organização ativo.')}</strong>
        <span>${isReservaGrid?'Escolha 2, 3 ou 4 colunas e arraste os Cofrinhos entre os slots.':(isPatrimonyGrid?'Escolha 1, 2 ou 3 colunas e arraste os módulos do Patrimônio.':'Arraste os itens ou use as setas para definir a ordem desejada.')}</span>
      </div>
      <div class="omb-actions">
        <button class="btn-outline btn-sm" id="omb_reset" type="button">Restaurar ordem padrão</button>
        <button class="btn-outline btn-sm" id="omb_cancel" type="button">Cancelar alterações</button>
        <button class="btn btn-primary btn-sm" id="omb_save" type="button" title="Salvar organização" aria-label="Salvar organização">OK</button>
      </div>`;
    bar.classList.add('show');
    const resetBtn = document.getElementById('omb_reset');
    const cancelBtn = document.getElementById('omb_cancel');
    const saveBtn = document.getElementById('omb_save');
    if(resetBtn) resetBtn.onclick = ()=>{
      const doReset = ()=>{ OrderPreferences.resetAllVisible(Object.keys(ORDER_TYPES)); OrderPreferences.active=false; OrderPreferences.activeType=null; OrderPreferences.controlSelection={}; OrderPreferences.notify(); };
      if(typeof openConfirmModal==='function'){
        openConfirmModal({
          title:'Restaurar ordem padrão',
          text:'Deseja restaurar a ordem padrão? A organização personalizada deste perfil será substituída.',
          confirmLabel:'Restaurar ordem padrão', cancelLabel:'Cancelar', variant:'danger',
          onConfirm: doReset
        });
      } else if(confirm('Deseja restaurar a ordem padrão? A organização personalizada deste perfil será substituída.')){
        doReset();
      }
    };
    if(cancelBtn) cancelBtn.onclick = ()=> OrderPreferences.cancelAll();
    if(saveBtn) saveBtn.onclick = ()=> OrderPreferences.saveAll();
  },

  /* ---------------- Peças de UI reutilizáveis (handle, setas, seletor de ordenação) ---------------- */
  handleSVG(){
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg>`;
  },
  reorderRowControlsHTML(type, id, label, naturalIds){
    const idsAttr = esc((naturalIds||[]).join(','));
    const safeId = esc(String(id));
    const safeLabel = esc(label||'item');
    return `<div class="order-controls" data-order-type="${esc(type)}">
      <button type="button" class="order-handle" title="Arrastar para reordenar" aria-label="Arrastar ${safeLabel} para reordenar">${this.handleSVG()}</button>
      <span class="order-arrow-group">
        <button type="button" class="order-arrow-btn" data-order-action="top" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover para o início" aria-label="Mover ${safeLabel} para o início">⤒</button>
        <button type="button" class="order-arrow-btn" data-order-action="up" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover para cima" aria-label="Mover ${safeLabel} para cima">▲</button>
        <button type="button" class="order-arrow-btn" data-order-action="down" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover para baixo" aria-label="Mover ${safeLabel} para baixo">▼</button>
        <button type="button" class="order-arrow-btn" data-order-action="bottom" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover para o final" aria-label="Mover ${safeLabel} para o final">⤓</button>
      </span>
    </div>`;
  },
  reservaLayoutControlsHTML(){
    if(!(this.active && this.activeType==='reservas')) return '';
    if(typeof isSmartphoneMode==='function' && isSmartphoneMode()) return '';
    const current=this.workingReservaColumns();
    return `<div class="reserva-layout-organizer" role="group" aria-label="Quantidade de colunas das Reservas">
      <div class="reserva-layout-copy"><strong>Grade personalizada</strong><span>Arraste cada Cofrinho para o slot desejado.</span></div>
      <div class="reserva-column-picker"><span>COLUNAS</span>${[2,3,4].map(n=>`<button type="button" class="reserva-column-btn ${current===n?'active':''}" data-reserva-columns="${n}" aria-pressed="${current===n?'true':'false'}" title="Usar ${n} colunas">${n}</button>`).join('')}</div>
    </div>`;
  },
  patrimonyLayoutControlsHTML(){
    if(!(this.active&&this.activeType==='patrimony_modules'))return '';
    const current=this.workingPatrimonyColumns();
    return `<div class="reserva-layout-organizer patrimony-layout-organizer" role="group" aria-label="Quantidade de colunas do Patrimônio">
      <div class="reserva-layout-copy"><strong>Organização do Patrimônio</strong><span>Arraste os módulos e escolha a quantidade de colunas.</span></div>
      <div class="reserva-column-picker"><span>COLUNAS</span>${[1,2,3].map(n=>`<button type="button" class="reserva-column-btn ${current===n?'active':''}" data-patrimony-columns="${n}" aria-pressed="${current===n?'true':'false'}" title="Usar ${n} colunas">${n}</button>`).join('')}</div>
    </div>`;
  },
  reservaSlotHandleHTML(slotNumber, label){
    return `<div class="reserva-slot-toolbar"><span class="reserva-slot-label">SLOT ${String(slotNumber).padStart(2,'0')}</span><span class="reserva-slot-help">Arraste para mover</span><button type="button" class="order-handle reserva-slot-handle" title="Arrastar ${esc(label||'Cofrinho')} para outro slot" aria-label="Arrastar ${esc(label||'Cofrinho')} para outro slot">${this.handleSVG()}</button></div>`;
  },
  sortSelectHTML(type){
    const label = (ORDER_TYPES[type] && ORDER_TYPES[type].label) || 'lista';
    const selected = this.controlSelection[type] || '';
    const opts = [
      ['az','A a Z'],
      ['za','Z a A'],
      ['recent','Mais recente primeiro'],
      ['old','Mais antigo primeiro'],
      ['manual','Ordem personalizada']
    ];
    /* O menu abre sempre com o rótulo neutro ORDEM. A ordenação aplicada continua salva
       separadamente, mas o controle não fica parecendo permanentemente um botão de edição. */
    const select = `<select class="order-sort-select" data-order-sort-type="${esc(type)}" title="Ordenar ${esc(label)}" aria-label="Ordenar ${esc(label)}"><option value="" ${selected===''?'selected':''} disabled>ORDEM</option>${opts.map(([v,l])=>`<option value="${v}" ${selected===v?'selected':''}>${l}</option>`).join('')}</select>`;
    /* O botão só existe depois de a pessoa escolher explicitamente "Ordem personalizada".
       Ao salvar/cancelar, controlSelection é limpo, o menu volta para ORDEM e o botão some. */
    const organizeBtn = selected==='manual' && !(this.active && this.activeType===type)
      ? `<button type="button" class="btn-outline btn-sm order-organize-btn" data-order-organize-type="${esc(type)}" title="Organizar ordem personalizada de ${esc(label)}" aria-label="Organizar ordem personalizada de ${esc(label)}">${this.handleSVG()} Organizar ordem</button>`
      : '';
    return `<span class="order-sort-wrap" style="display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;">${select}${organizeBtn}</span>`;
  },
  /* Mensagem exibida no lugar dos controles quando um filtro de banco está ativo — reordenar
     com a lista filtrada corromperia a ordem completa, então a reorganização fica bloqueada
     até o filtro ser removido (o resto do app continua funcionando normalmente). */
  filterBlockedNoticeHTML(){
    return `<div class="empty-note order-filter-blocked" style="margin:-4px 0 12px;">Remova o filtro de banco (ícone ☷ no topo) para reorganizar esta lista — a ordem personalizada considera sempre a lista completa.</div>`;
  },
  canReorderNow(){ return !(typeof S!=='undefined' && S.bankFilter && S.bankFilter.size>0); },

  /* ---------------- Painel "Organizar módulos e itens" (Configurações → Personalização) ---------------- */
  renderModulesOrganizePanel(){
    const active=this.active&&(!this.activeType||this.activeType==='modules');
    const navList = (typeof NAV!=='undefined') ? NAV : [];
    const ordered = this.applyOrder('modules', navList, {idKey:'key', labelKey:'label'});
    const naturalIds = ordered.map(n=>n.key);
    const enabledKeys = (typeof getNavItems==='function') ? new Set(getNavItems().map(x=>x.key)) : new Set(navList.map(n=>n.key));
    const rows = ordered.map(n=>{
      const isEnabled = enabledKeys.has(n.key);
      return `<div class="order-row module-order-row" data-order-id="${esc(n.key)}">
        <div class="order-row-main">
          <span class="order-row-status ${isEnabled?'on':'off'}">${isEnabled?'Ativo':'Desativado'}</span>
          <span class="order-row-label">${esc(n.label)}</span>
        </div>
        ${active ? this.reorderRowControlsHTML('modules', n.key, n.label, naturalIds) : ''}
      </div>`;
    }).join('');
    return `
      <div class="settings-section settings-hero-section order-organize-section">
        <div class="order-organize-head">
          <div>
            <h3>Organizar módulos e itens</h3>
            <p class="desc">Ative para reordenar os módulos do menu lateral e os itens de bancos, cartões e reservas — por arraste ou pelas setas. Desativado, o Borion funciona normalmente e nada pode ser movido sem querer.</p>
          </div>
          <button class="toggle-switch ${active?'on':''}" onclick="OrderPreferences.setActive(!(${active?'true':'false'}),'modules')" aria-label="${active?'Desativar':'Ativar'} modo de organização"><span></span></button>
        </div>
        ${active?`<div class="order-active-hint">Modo de organização ativo. Arraste os itens ou use as setas para definir a ordem desejada. Este modo também vale nas telas de Cartões e Contas e Reserva — use os botões no rodapé da tela para salvar, cancelar ou restaurar.</div>`:''}
        <div class="order-list" data-order-list="modules">${rows}</div>
        ${active?'<p class="desc" style="margin-top:10px;">Um módulo desativado continua aqui para você reorganizar; quando reativado, ele volta na posição definida.</p>':''}
      </div>`;
  }
};
window.OrderPreferences = OrderPreferences;

/* ---------------- Delegação de eventos (um único listener, sem duplicar) ----------------
   Clique nas setas / mudança no seletor de ordenação. Cobre qualquer lista renderizada agora
   ou no futuro, sem precisar religar listeners a cada renderView(). */
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-order-action]');
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const type = btn.getAttribute('data-order-type');
  const id = btn.getAttribute('data-order-id');
  const action = btn.getAttribute('data-order-action');
  const idsAttr = btn.getAttribute('data-order-ids') || '';
  const naturalIds = idsAttr ? idsAttr.split(',') : [];
  if(action==='up') OrderPreferences.moveItem(type, naturalIds, id, -1);
  else if(action==='down') OrderPreferences.moveItem(type, naturalIds, id, 1);
  else if(action==='top') OrderPreferences.moveItem(type, naturalIds, id, 'top');
  else if(action==='bottom') OrderPreferences.moveItem(type, naturalIds, id, 'bottom');
});
document.addEventListener('change', function(e){
  const sel = e.target.closest('[data-order-sort-type]');
  if(!sel) return;
  const type = sel.getAttribute('data-order-sort-type');
  const mode = sel.value;
  if(!mode) return;
  OrderPreferences.controlSelection[type] = mode;
  if(mode!=='manual'){
    delete OrderPreferences.pending[type];
    if(OrderPreferences.active && (!OrderPreferences.activeType || OrderPreferences.activeType===type)){
      OrderPreferences.active = false;
      OrderPreferences.activeType = null;
      OrderPreferences.pending = {};
      OrderPreferences.pendingReservaColumns = null;
      OrderPreferences.pendingPatrimonyColumns = null;
    }
  }
  OrderPreferences.setSortMode(type, mode);
  /* Ordem personalizada apenas revela o botão ao lado. O modo de edição só começa quando
     a pessoa clicar em "Organizar ordem", evitando ativação acidental ao abrir o menu. */
});
/* Botão "Organizar ordem": aparece somente após selecionar "Ordem personalizada" e então
   liga o modo de arrastar/setas para aquela lista. */
document.addEventListener('click', function(e){
  const btn = e.target.closest('[data-order-organize-type]');
  if(!btn) return;
  e.preventDefault();
  const type = btn.getAttribute('data-order-organize-type');
  OrderPreferences.controlSelection[type] = 'manual';
  if(OrderPreferences.getSortMode(type)!=='manual') OrderPreferences.setSortMode(type, 'manual');
  OrderPreferences.setActive(true, type);
  if(typeof toast==='function') toast('Modo de organização ativado. Arraste os itens ou use as setas para definir a ordem.');
  setTimeout(function(){
    const list = document.querySelector('[data-order-list="'+type+'"]');
    if(list && typeof list.scrollIntoView==='function') list.scrollIntoView({behavior:'smooth', block:'center'});
  }, 60);
});
document.addEventListener('click', function(e){
  const btn=e.target.closest('[data-reserva-columns]');
  if(!btn) return;
  e.preventDefault();
  OrderPreferences.setReservaColumns(Number(btn.getAttribute('data-reserva-columns')));
});
document.addEventListener('click',function(e){
  const btn=e.target.closest('[data-patrimony-columns]');if(!btn)return;e.preventDefault();
  OrderPreferences.setPatrimonyColumns(Number(btn.getAttribute('data-patrimony-columns')));
});
window.addEventListener('online', function(){ try{ OrderPreferences.retryPendingCloudSync(); }catch(e){} });

/* ---------------- Arrastar (Pointer Events nativos — sem biblioteca) ----------------
   Os listeners de pointermove/pointerup só existem durante um arraste ativo e são sempre
   removidos ao soltar, então não há acúmulo de listeners entre uma reorganização e outra. */
document.addEventListener('pointerdown', function(e){
  const touchLike=e.pointerType==='touch' || (window.matchMedia&&window.matchMedia('(pointer:coarse)').matches);
  const patrimonySlot=e.target.closest('.patrimony-grid-organizer > .patrimony-module-slot[data-order-id]');
  const patrimonyContainer=patrimonySlot&&patrimonySlot.closest('[data-order-list="patrimony_modules"]');
  /* Mouse pode arrastar pela superfície do slot. Em touch, somente a alça inicia o
     arraste; assim o gesto vertical sobre cards permanece reservado ao scroll nativo. */
  if(!touchLike&&patrimonySlot&&patrimonyContainer&&!e.target.closest('button:not(.order-handle),a,input,select,textarea')){
    e.preventDefault();borionStartPatrimonySlotDrag(patrimonySlot,patrimonyContainer,e);return;
  }
  const organizerSlot=e.target.closest('.reserva-grid-organizer > .reserva-slot[data-order-id]');
  const organizerContainer=organizerSlot&&organizerSlot.closest('[data-order-list="reservas"]');
  if(!touchLike&&organizerSlot&&organizerContainer&&!e.target.closest('button:not(.order-handle),a,input,select,textarea')){
    e.preventDefault();borionStartReservaSlotDrag(organizerSlot,organizerContainer,e);return;
  }
  const handle=e.target.closest('.order-handle');
  if(!handle) return;
  const row = handle.closest('[data-order-id]');
  const container = handle.closest('[data-order-list]');
  if(!row || !container) return;
  e.preventDefault();
  if(container.classList.contains('reserva-grid-organizer')) borionStartReservaSlotDrag(row, container, e);
  else borionStartOrderDrag(handle, row, container, e);
});
/* Listeners de arraste existem apenas durante o gesto ativo. A limpeza cobre
   pointerup, pointercancel, perda de captura, blur, aba oculta e remoção por render. */
function borionBindTransientDrag(pointerId,{onMove,onFinish,onCancel,captureTarget}){
  let active=true;
  const pointerMatches=ev=>!ev || ev.pointerId==null || ev.pointerId===pointerId;
  const unbind=()=>{
    if(!active)return;
    active=false;
    document.removeEventListener('pointermove',move);
    document.removeEventListener('pointerup',finish);
    document.removeEventListener('pointercancel',cancel);
    document.removeEventListener('visibilitychange',visibilityCancel);
    window.removeEventListener('blur',blurCancel);
    if(captureTarget)captureTarget.removeEventListener('lostpointercapture',lostCapture);
  };
  const move=ev=>{
    if(!active||!pointerMatches(ev))return;
    if(captureTarget&&!captureTarget.isConnected){cancel();return;}
    onMove(ev);
  };
  const finish=ev=>{if(!active||!pointerMatches(ev))return;unbind();onFinish(ev);};
  const cancel=ev=>{if(!active||!pointerMatches(ev))return;unbind();onCancel(ev);};
  const blurCancel=()=>cancel();
  const visibilityCancel=()=>{if(document.hidden)cancel();};
  const lostCapture=ev=>cancel(ev);
  document.addEventListener('pointermove',move,{passive:false});
  document.addEventListener('pointerup',finish);
  document.addEventListener('pointercancel',cancel);
  document.addEventListener('visibilitychange',visibilityCancel);
  window.addEventListener('blur',blurCancel);
  if(captureTarget){
    captureTarget.addEventListener('lostpointercapture',lostCapture);
    try{captureTarget.setPointerCapture(pointerId);}catch(err){}
  }
}
function borionStartPatrimonySlotDrag(slot,container,startEvent){
  if(!(OrderPreferences.active&&OrderPreferences.activeType==='patrimony_modules'))return;
  const pointerId=startEvent.pointerId;let target=null;
  slot.classList.add('order-dragging');container.classList.add('order-dragging-active');
  function clearTarget(){if(target)target.classList.remove('patrimony-slot-target');target=null;}
  function onMove(ev){
    if(ev.cancelable)ev.preventDefault();
    const hit=document.elementFromPoint(ev.clientX,ev.clientY);
    const next=hit&&hit.closest?hit.closest('.patrimony-grid-organizer > .patrimony-module-slot[data-order-id]'):null;
    if(next&&next!==slot&&next.closest('[data-order-list="patrimony_modules"]')===container){if(target!==next){clearTarget();target=next;target.classList.add('patrimony-slot-target');}}else clearTarget();
  }
  function finish(ev){
    if(target&&slot.isConnected&&target.isConnected){const marker=document.createComment('patrimony-slot-swap');slot.parentNode.insertBefore(marker,slot);target.parentNode.insertBefore(slot,target);marker.parentNode.insertBefore(target,marker);marker.remove();}
    if(container.isConnected){
      const ids=Array.from(container.querySelectorAll(':scope > .patrimony-module-slot[data-order-id]')).map(x=>x.getAttribute('data-order-id'));
      OrderPreferences.pending.patrimony_modules=ids;writeJSON(OrderPreferences.modeStorageKey('patrimony_modules'),'manual');const root=OrderPreferences.profilePreferenceRoot(true);if(root)root.sortModes.patrimony_modules='manual';
    }
    cleanup();OrderPreferences.notify();
  }
  function cancel(){cleanup();}
  function cleanup(){clearTarget();slot.classList.remove('order-dragging');container.classList.remove('order-dragging-active');}
  borionBindTransientDrag(pointerId,{onMove,onFinish:finish,onCancel:cancel,captureTarget:startEvent.target.closest('.order-handle')||slot});
}
function borionStartReservaSlotDrag(slot, container, startEvent){
  if(!(OrderPreferences.active && OrderPreferences.activeType==='reservas')) return;
  const pointerId=startEvent.pointerId;
  const card=slot.querySelector('.reserva-card');
  if(!card) return;
  const rect=card.getBoundingClientRect();
  const offsetX=startEvent.clientX-rect.left;
  const offsetY=startEvent.clientY-rect.top;
  const ghost=card.cloneNode(true);
  ghost.className='reserva-card reserva-drag-ghost';
  ghost.removeAttribute('data-order-id');
  ghost.querySelectorAll('button').forEach(b=>b.setAttribute('tabindex','-1'));
  Object.assign(ghost.style,{width:rect.width+'px',height:rect.height+'px',left:rect.left+'px',top:rect.top+'px'});
  document.body.appendChild(ghost);
  slot.classList.add('reserva-slot-dragging');
  container.classList.add('reserva-grid-dragging-active');
  document.body.classList.add('reserva-layout-dragging');
  let targetSlot=null,cleaned=false;
  function moveGhost(ev){ghost.style.transform=`translate3d(${ev.clientX-offsetX-rect.left}px,${ev.clientY-offsetY-rect.top}px,0) rotate(.45deg) scale(1.025)`;}
  function clearTarget(){ if(targetSlot) targetSlot.classList.remove('reserva-slot-target'); targetSlot=null; }
  function onMove(ev){
    if(ev.cancelable)ev.preventDefault();
    moveGhost(ev);
    const hit=document.elementFromPoint(ev.clientX,ev.clientY);
    const next=hit && hit.closest ? hit.closest('.reserva-grid-organizer > .reserva-slot[data-order-id]') : null;
    if(next && next.closest('[data-order-list="reservas"]')===container && next!==slot){
      if(targetSlot!==next){ clearTarget(); targetSlot=next; targetSlot.classList.add('reserva-slot-target'); }
    }else clearTarget();
  }
  function finish(){
    if(targetSlot&&slot.isConnected&&targetSlot.isConnected){
      const marker=document.createComment('reserva-slot-swap');
      slot.parentNode.insertBefore(marker,slot);targetSlot.parentNode.insertBefore(slot,targetSlot);marker.parentNode.insertBefore(targetSlot,marker);marker.remove();
      const ids=Array.from(container.querySelectorAll(':scope > .reserva-slot[data-order-id]')).map(x=>x.getAttribute('data-order-id'));
      OrderPreferences.pending.reservas=ids;writeJSON(OrderPreferences.modeStorageKey('reservas'),'manual');
    }
    cleanup();OrderPreferences.notify();
  }
  function cancel(){cleanup();}
  function cleanup(){
    if(cleaned)return;cleaned=true;
    clearTarget();slot.classList.remove('reserva-slot-dragging');container.classList.remove('reserva-grid-dragging-active');document.body.classList.remove('reserva-layout-dragging');
    ghost.classList.add('reserva-drag-ghost-out');setTimeout(()=>ghost.remove(),120);
  }
  moveGhost(startEvent);
  borionBindTransientDrag(pointerId,{onMove,onFinish:finish,onCancel:cancel,captureTarget:startEvent.target.closest('.order-handle')||slot});
}
function borionStartOrderDrag(handle, row, container, startEvent){
  const type = container.getAttribute('data-order-list');
  const pointerId = startEvent.pointerId;
  row.classList.add('order-dragging');container.classList.add('order-dragging-active');
  function getRows(){ return Array.from(container.querySelectorAll(':scope > [data-order-id]')); }
  function onMove(ev){
    if(ev.cancelable)ev.preventDefault();
    const y = ev.clientY;const rows = getRows();let target = null;
    for(const r of rows){if(r===row) continue;const rect = r.getBoundingClientRect();if(y < rect.top + rect.height/2){ target = r; break; }}
    if(target) container.insertBefore(row, target);else container.appendChild(row);
  }
  function finish(){
    cleanup();
    if(container.isConnected)OrderPreferences.reorderFromDom(type, getRows().map(r=>r.getAttribute('data-order-id')));
  }
  function cancel(){cleanup();}
  function cleanup(){row.classList.remove('order-dragging');container.classList.remove('order-dragging-active');}
  borionBindTransientDrag(pointerId,{onMove,onFinish:finish,onCancel:cancel,captureTarget:handle});
}
