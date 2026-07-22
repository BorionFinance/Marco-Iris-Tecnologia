/* Borion Finance — Filtro multibancos do topo e busca global. */

/* ---------------- Filtro Multi-Bancos (topo do app) ---------------- */
const BankFilter = {
  panelOpen:false,
  togglePanel(evt){
    if(evt) evt.stopPropagation();
    this.panelOpen = !this.panelOpen;
    this.renderPanel();
  },
  renderPanel(){
    let panel = document.getElementById('bank-filter-panel');
    if(!this.panelOpen){ if(panel) panel.remove(); return; }
    if(!panel){ panel = document.createElement('div'); panel.id='bank-filter-panel'; panel.className='bank-filter-panel'; document.body.appendChild(panel); }
    const banks = bankFilterNames();
    const sel = S.bankFilter;
    const validKeys = new Set(banks.map(normalizeAccountName));
    const selectedKeys = new Set(Array.from(sel||[]).map(normalizeAccountName).filter(k=>validKeys.has(k)));
    const allSelected = selectedKeys.size===0;
    panel.innerHTML = `
      <div class="bf-head">Filtrar por banco</div>
      <label class="bf-row"><input type="checkbox" id="bf_all" ${allSelected?'checked':''}/> <b>Todos</b></label>
      ${banks.length? banks.map(b=>`<label class="bf-row"><input type="checkbox" class="bf-bank" value="${esc(b)}" ${(!allSelected && selectedKeys.has(normalizeAccountName(b)))?'checked':''}/> <span class="bf-dot" style="background:${bankColor(b)}"></span>${esc(b)}</label>`).join('') : '<div class="bf-empty">Cadastre bancos/contas em "Cartões e Contas".</div>'}
      <div class="bf-actions">
        <button class="btn-secondary btn-sm" id="bf_clear" style="flex:1;">Limpar</button>
        <button class="btn btn-primary btn-sm" id="bf_apply" style="flex:1;">Aplicar</button>
      </div>`;
    panel.onclick = e=>e.stopPropagation();
    const allCb = panel.querySelector('#bf_all');
    const bankCbs = panel.querySelectorAll('.bf-bank');
    allCb.onchange = ()=>{ if(allCb.checked) bankCbs.forEach(cb=>cb.checked=false); };
    bankCbs.forEach(cb=>{ cb.onchange = ()=>{ if(cb.checked) allCb.checked=false; }; });
    panel.querySelector('#bf_clear').onclick = ()=>{ S.bankFilter=null; this.panelOpen=false; this.renderPanel(); renderApp(); };
    const applyBtn = panel.querySelector('#bf_apply');
    if(applyBtn) applyBtn.onclick = ()=>{
      const checked = Array.from(bankCbs).filter(cb=>cb.checked).map(cb=>cb.value);
      S.bankFilter = checked.length ? new Set(checked) : null;
      this.panelOpen=false; this.renderPanel(); renderApp();
    };
  },
  closePanelOnOutsideClick(){
    document.addEventListener('click', ()=>{ if(BankFilter.panelOpen){ BankFilter.panelOpen=false; BankFilter.renderPanel(); } });
  }
};

function checkOverdueModal(){
  const overdue = S.data.agenda.filter(a=>!a.pago && dateDiffDays(a.data, todayISO())<=-1);
  if(!overdue.length) return;
  const box = el(`
    <div class="modal-overlay">
      <div class="modal-box" style="max-width:400px;text-align:center;">
        <div style="font-size:38px;">⚠️</div>
        <h2 style="margin:10px 0 6px;">Atenção: contas em aberto</h2>
        <p class="modal-sub">Você tem ${overdue.length} lembrete(s) vencido(s) e ainda não marcados como pagos.</p>
        <div class="row-btns">
          <button class="btn btn-secondary" id="ov_close" style="flex:1;">Fechar</button>
          <button class="btn btn-primary" id="ov_goto" style="flex:1;">Ir para a agenda</button>
        </div>
      </div>
    </div>`);
  $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box);
  attachModalGuard(box);
  $('#ov_close').onclick = closeModal;
  $('#ov_goto').onclick = ()=>{ closeModal(); Nav.go('agenda'); };
}

/* ---------------- Busca global ---------------- */
const GlobalSearch = {
  onInput(){
    const input = $('#global_search');
    const box = $('#global_search_results');
    if(!input || !box) return;
    const q = input.value.trim().toLowerCase();
    if(!q){ box.classList.add('hidden'); box.innerHTML=''; return; }
    const results = this.search(q);
    box.innerHTML = results.length
      ? results.map(r=>`<button type="button" class="search-result-item" data-view="${r.view}" data-tab="${r.tab||''}"><span class="sri-type">${esc(r.type)}</span>${esc(r.text)}</button>`).join('')
      : '<div class="search-result-item">Nada encontrado.</div>';
    box.querySelectorAll('.search-result-item[data-view]').forEach(btn=>{
      btn.onclick = ()=> GlobalSearch.goTo(btn.dataset.view, btn.dataset.tab);
    });
    box.classList.remove('hidden');
  },
  search(q){
    const out = [];
    S.data.transacoes.forEach(t=>{
      if(t.nome.toLowerCase().includes(q) || t.categoria.toLowerCase().includes(q)){
        out.push({type:t.tipo==='receita'?'Receita':'Despesa variável', text:t.nome+' — '+brl(t.valor), view:'budget', tab:t.tipo});
      }
    });
    S.data.fixas.forEach(f=>{
      if(f.nome.toLowerCase().includes(q) || f.categoria.toLowerCase().includes(q)){
        out.push({type:'Despesa fixa', text:f.nome+' — '+brl(f.valor), view:'budget', tab:'fixa'});
      }
    });
    S.data.cartoes.forEach(c=>{
      if(c.banco.toLowerCase().includes(q)) out.push({type:'Cartão', text:c.banco, view:'cards'});
      c.parcelas.forEach(p=>{
        if(p.descricao.toLowerCase().includes(q) || (p.local||'').toLowerCase().includes(q)){
          out.push({type:'Compra parcelada · '+c.banco, text:p.descricao+' — '+brl(p.valorParcela)+'/mês', view:'cards'});
        }
      });
    });
    S.data.contas.forEach(a=>{ if((a.nome||'').toLowerCase().includes(q)) out.push({type:'Conta bancária', text:a.nome+' — '+brl(contaSaldoAtual(a)), view:'cards'}); });
    Object.keys(S.data.categorias).forEach(tipo=>{
      S.data.categorias[tipo].forEach(c=>{ if(c.toLowerCase().includes(q)) out.push({type:'Categoria', text:c, view:'budget', tab:tipo}); });
    });
    S.data.agenda.forEach(a=>{ if(a.titulo.toLowerCase().includes(q)) out.push({type:'Agenda', text:a.titulo+' — '+a.data.slice(8,10)+'/'+a.data.slice(5,7), view:'agenda'}); });
    saldoContasDetalhe().filter(l=>l.tipo==='manual').forEach(l=>{ if(l.nome.toLowerCase().includes(q)) out.push({type:'Saldo em contas', text:l.nome+' — '+brl(l.valor), view:'patrimony'}); });
    S.data.bens.forEach(b=>{ if(b.nome.toLowerCase().includes(q)) out.push({type:'Bem', text:b.nome+' — '+brl(b.valor), view:'patrimony'}); });
    (S.data.metas||[]).forEach(mt=>{ if(mt.nome.toLowerCase().includes(q)) out.push({type:'Meta', text:mt.nome+' — '+brl(mt.valorAtual)+' / '+brl(mt.valorMeta), view:'patrimony'}); });
    S.data.investimentos.ativos.forEach(a=>{ if(a.nome.toLowerCase().includes(q)) out.push({type:'Investimento', text:a.nome+' — '+brl(a.atual), view:'investments'}); });
    return out.slice(0,20);
  },
  goTo(view, tab){
    const box = $('#global_search_results'); if(box){ box.classList.add('hidden'); }
    const input = $('#global_search'); if(input) input.value='';
    S.view = view;
    if(tab && view==='budget') S.budgetTab = tab;
    renderApp();
  },
  outsideClickHandler(e){
    const box = $('#global_search_results');
    const input = $('#global_search');
    if(!box || !input) return;
    if(e.target!==input && !box.contains(e.target)) box.classList.add('hidden');
  }
};
