/* Borion Finance — Tela Contas, Cartões, Boletos e parcelas. */

/* ---------------- Ordenação da fatura (mais antigo ⇄ mais recente) ----------------
   Camada leve e independente, só de exibição: guarda por cartão (escopo conta+perfil, igual
   ao OrderPreferences) se a lista de compras ativas da fatura deve aparecer da mais antiga
   para a mais nova ou o contrário. Nunca altera parcelas, valores ou saldos — só a ordem em
   que as linhas da fatura do mês aparecem na tela. */
const FaturaSort = {
  storageKey(cartaoId){
    const userId = (window.CloudStorage && CloudStorage.user && CloudStorage.user.id) ? CloudStorage.user.id : 'anon';
    const profileId = (typeof S!=='undefined' && S.currentProfile && S.currentProfile.id) ? S.currentProfile.id : 'sem_perfil';
    return 'borion_faturasort_' + userId + '_' + profileId + '_' + cartaoId;
  },
  get(cartaoId){
    const v = readJSON(this.storageKey(cartaoId), 'old');
    return v==='recent' ? 'recent' : 'old';
  },
  toggle(cartaoId){
    writeJSON(this.storageKey(cartaoId), this.get(cartaoId)==='old' ? 'recent' : 'old');
    if(typeof renderView==='function') renderView();
  },
  /* Chave de data aproximada: mês/ano da 1ª parcela (dataCompra) + dia em que ela entra na
     fatura (diaEntrada), quando existir. É o dado mais preciso disponível por parcela. */
  sortKey(p){
    return String(p.dataCompraCompleta || ((p.dataCompra||'') + '-' + String(p.diaEntrada||1).padStart(2,'0')));
  }
};
window.FaturaSort = FaturaSort;

/* V6.27 — a categoria da compra espelhada acompanha o tipo escolhido em Despesas.
   Ao alternar entre "variável" e "fixa" no modal da parcela, a lista de categorias é
   reconstruída na hora usando exatamente o cadastro e a ordenação daquele tipo. */
function wireParcelaCategoriaPorTipo(preferredCategory){
  const tipoEl=document.getElementById('mf_despesaTipo');
  const categoriaEl=document.getElementById('mf_categoria');
  if(!tipoEl||!categoriaEl) return;
  const refresh=()=>{
    const tipo=tipoEl.value==='fixa'?'fixa':'variavel';
    const cats=typeof orderedCategories==='function'
      ? orderedCategories(tipo)
      : (((S.data.categorias&&S.data.categorias[tipo])||[]).slice());
    const current=categoriaEl.value||preferredCategory||'';
    categoriaEl.innerHTML=cats.map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('');
    categoriaEl.value=cats.includes(current)?current:(cats[0]||'');
  };
  tipoEl.addEventListener('change',refresh);
  refresh();
}

/* V6.27.4 — Cartões e Contas usa o mesmo botão compacto de Lançamentos:
   ✔ para marcar como pago e ↺ para voltar para em aberto. O estado continua único e
   sincronizado; só a apresentação voltou ao formato simples. */
function compactPaymentPillHTML(status){
  const paid=status==='Pago';
  return ` <span class="cheque-status ${paid?'ok':'neutral'}" style="margin-left:5px;">${paid?'PAGO':'EM ABERTO'}</span>`;
}
function compactPaymentButtonHTML(status, action, subject='lançamento'){
  const paid=status==='Pago';
  return `<button type="button" onclick="${action}" title="${paid?'Marcar '+subject+' em aberto':'Marcar '+subject+' como pago'}">${paid?'↺':'✔'}</button>`;
}

/* ---------------- VIEW: CARDS & ACCOUNTS ---------------- */
function renderCards(){
  /* Organização visual (opcional): quando o modo Organizar está ligado (Configurações →
     Módulos), mostra alça de arrastar + setas nos cards de conta/cartão em vez do botão de
     editar (evita abrir o cadastro sem querer no meio da reorganização). Sem filtro de banco
     ativo, para nunca gravar uma ordem baseada só na lista filtrada. */
  const orgActive = !!(window.OrderPreferences && OrderPreferences.active);
  const canReorderNow = !!(window.OrderPreferences && OrderPreferences.canReorderNow());
  const showReorderContas = orgActive && canReorderNow;
  const contasBase = activeAccounts().filter(a=>bankMatches(a.nome,a.id));
  const contasOrdered = window.OrderPreferences ? OrderPreferences.applyOrder('contas', contasBase, {idKey:'id', labelKey:'nome'}) : contasBase;
  const contasNaturalIds = contasOrdered.map(a=>a.id);
  const accRows = contasOrdered.map(a=>`
    <div class="card-entity" data-order-id="${esc(a.id)}">
      <div class="card-entity-head">
        <div class="cehl">
          <div class="bank-badge" style="background:${a.cor||bankColor(a.nome)}">${esc(a.icone||(a.nome||'?')[0])}</div>
          <div class="info"><div>${esc(a.nome)} <span style="font-weight:400;color:var(--muted);font-size:11.5px;">· ${a.isCarteira?'(dinheiro físico)':esc(a.tipo||'Conta')}</span></div><div><b style="color:#22c55e;">Saldo atual: ${brl(contaSaldoAtual(a))}</b> · Saldo inicial: ${brl(a.saldoInicial||0)}${a.rende?` · Rende ${pct(a.percentualRendimento||0)} a.m.`:' · Não rende'}${a.isCarteira?' · Não pode ser excluída':''}</div></div>
        </div>
        ${showReorderContas ? OrderPreferences.reorderRowControlsHTML('contas', a.id, a.nome, contasNaturalIds) : `<button class="btn-outline btn-sm" onclick="Cards.editConta('${a.id}')">✎ Editar</button>`}
      </div>
    </div>`).join('');

  const cartoesBase = S.data.cartoes.filter(c=>bankMatches(c.banco));
  const cartoesOrdered = window.OrderPreferences ? OrderPreferences.applyOrder('cartoes', cartoesBase, {idKey:'id', labelKey:'banco'}) : cartoesBase;
  const cartoesNaturalIds = cartoesOrdered.map(c=>c.id);
  const showReorderCartoes = orgActive && canReorderNow;
  const cardBlocks = cartoesOrdered.map(c=>{
    const active=[], inactive=[];
    c.parcelas.forEach(p=>{
      const st = parcelaStatus(p, S.month.y, S.month.m);
      if(st.ativo) active.push({...p, atual:st.atual});
      else inactive.push(p);
    });
    const fatura = cartaoFaturaDoMes(c.id, S.month.y, S.month.m);
    const faturaSortDir = FaturaSort.get(c.id);
    active.sort((a,b)=>{
      const ka = FaturaSort.sortKey(a), kb = FaturaSort.sortKey(b);
      return faturaSortDir==='old' ? ka.localeCompare(kb) : kb.localeCompare(ka);
    });
    /* Botão de ícone único (mesmo padrão do ✎/↺ já usados nas linhas da fatura) para caber na
       coluna estreita do cabeçalho — o title explica o estado atual e o toque inverte. */
    const faturaSortBtn = active.length>1
      ? `<button type="button" onclick="FaturaSort.toggle('${c.id}')" title="${faturaSortDir==='old'?'Mostrando do mais antigo ao mais recente — toque para inverter':'Mostrando do mais recente ao mais antigo — toque para inverter'}" aria-label="Inverter ordem da fatura">${faturaSortDir==='old' ? '↑' : '↓'}</button>`
      : '';
    const activeRows = active.map(p=>{
      const paymentStatus=parcelaFaturaStatus(c.id,p,fatura.competencia);
      const paymentPill=compactPaymentPillHTML(paymentStatus);
      const paymentButton=compactPaymentButtonHTML(
        paymentStatus,
        `Cards.toggleParcelaPagamento('${c.id}','${p.id}','${fatura.competencia}')`,
        p.apareceDespesas?'esta despesa':'este item da fatura'
      );
      return `<div class="installment-row">
        <span>${esc(p.descricao)}${p.local?` <span style="color:var(--muted)">(${esc(p.local)})</span>`:''}${p.categoria?` <span class="cat-pill" style="margin-left:4px;"><span class="dot" style="background:${catColor(p.categoria)}"></span>${esc(p.categoria)}</span>`:''}${p.apareceDespesas?` <span class="cat-pill" style="opacity:.85;"><span class="dot" style="background:var(--gold-bright)"></span>Também em Despesas (${p.despesaTipo==='fixa'?'fixa':'variável'})</span>`:''}${paymentPill}</span>
        <span>${brl(p.valorParcela)}/mês</span>
        <span>${p.atual} de ${p.parcelaTotal}</span>
        <span>Dia ${p.diaEntrada || '—'}</span>
        <span style="display:flex;gap:5px;justify-content:flex-end;">${paymentButton}<button onclick="Cards.editParcela('${c.id}','${p.id}')" title="Editar compra">✎</button></span>
      </div>`;
    }).join('');
    const inactiveRows = inactive.map(p=>{
      const fim = shiftYM(p.dataCompra, p.parcelaTotal-1);
      return `<div class="installment-row muted">
        <span>${esc(p.descricao)}${p.local?` <span style="color:var(--muted)">(${esc(p.local)})</span>`:''}</span>
        <span>${brl(p.valorParcela)}/mês</span>
        <span>Compra ${shortMonthLabel(p.dataCompra)}</span>
        <span>Fim ${shortMonthLabel(fim)}</span>
        <button onclick="Cards.editParcela('${c.id}','${p.id}')">✎</button>
      </div>`;
    }).join('');
    const faturaHTML = fatura.paga
      ? `<div class="installment-row" style="color:#22c55e;"><span>Fatura de ${monthLabel(S.month.y,S.month.m)} — <b>PAGA</b></span><span>${brl(fatura.pagamento.valor)}</span><span>via ${esc(fatura.pagamento.banco)}</span><span>${fatura.pagamento.data?fatura.pagamento.data.slice(8,10)+'/'+fatura.pagamento.data.slice(5,7):''}</span><button onclick="Cards.undoFaturaPagamento('${c.id}','${fatura.pagamento.id}')" title="Marcar fatura em aberto">↺</button></div>`
      : (fatura.total>0 ? `<div class="installment-row"><span>Fatura de ${monthLabel(S.month.y,S.month.m)}: <b style="color:#ef4444">${brl(fatura.total)}</b></span><span></span><span></span><span></span><button onclick="Cards.payFatura('${c.id}')" title="Marcar fatura como paga">✔</button></div>` : '');
    return `
    <div class="card-entity" data-order-id="${esc(c.id)}">
      <div class="card-entity-head">
        <div class="cehl">
          <div class="bank-badge" style="background:${bankColor(c.banco)}">${esc((c.banco||'?')[0])}</div>
          <div class="info"><div>${esc(c.banco)}</div><div>Limite: ${c.limite?brl(c.limite):'não definido'} · Dívida total em cartão a partir de ${monthLabel(S.month.y,S.month.m)}: <b style="color:#ef4444">${brl(computeCardsDebtForCartao(c,S.month.y,S.month.m))}</b> · ${active.length} compra(s) ativa(s)</div></div>
        </div>
        <div style="display:flex;gap:8px;">
          ${showReorderCartoes ? OrderPreferences.reorderRowControlsHTML('cartoes', c.id, c.banco, cartoesNaturalIds) : `
          <button class="btn-outline btn-sm" onclick="Cards.editCartao('${c.id}')">✎ Editar cartão</button>
          <button class="btn-outline btn-sm" onclick="Cards.addParcela('${c.id}')">+ Compra parcelada</button>`}
        </div>
      </div>
      ${faturaHTML}
      <div class="installment-row ih"><span>Descrição</span><span>Valor</span><span>Parcela</span><span>Dia</span><span>${faturaSortBtn}</span></div>
      ${activeRows || '<div class="empty-note">Nenhuma parcela ativa neste mês.</div>'}
      ${inactive.length? `<details><summary>Ver compras fora deste período (${inactive.length})</summary>${inactiveRows}</details>` : ''}
    </div>`;
  }).join('');

  const boletoBlocks = (S.data.boletos||[]).filter(b=>bankMatches(b.banco,b.accountId)).map(b=>{
    const st = boletoRestanteValor(b, S.month.y, S.month.m);
    const fim = shiftYM(b.dataInicio || monthKey(S.month.y,S.month.m), Number(b.parcelaTotal||1)-1);
    const statusAtual=b.status==='Quitado'?'Pago':(b.status==='Ativo'||!b.status?'Em Aberto':b.status);
    const statusColor=statusAtual==='Pago'?'#22c55e':(statusAtual==='Cancelado'?'#ef4444':'var(--gold-bright)');
    const mesRef = boletoParcelaDoMes(b.id, S.month.y, S.month.m);
    const linkedStatus=mesRef.total>0?boletoDespesaStatus(b,mesRef.competencia):null;
    const linkedButton=linkedStatus
      ? compactPaymentButtonHTML(linkedStatus,`Cards.toggleBoletoPagamento('${b.id}','${mesRef.competencia}')`,'este boleto')
      : '';
    const mesHTML = linkedStatus
      ? `<div class="installment-row ${linkedStatus==='Pago'?'linked-paid-row':''}"><span>Parcela de ${monthLabel(S.month.y,S.month.m)} — ${compactPaymentPillHTML(linkedStatus)}</span><span>${brl(mesRef.pagamento?mesRef.pagamento.valor:mesRef.total)}</span><span>${mesRef.pagamento?'via '+esc(mesRef.pagamento.banco):'Vinculada a Lançamentos'}</span><span>${mesRef.pagamento&&mesRef.pagamento.data?mesRef.pagamento.data.slice(8,10)+'/'+mesRef.pagamento.data.slice(5,7):''}</span><span style="display:flex;justify-content:flex-end;">${linkedButton}</span></div>`
      : (mesRef.paga
        ? `<div class="installment-row" style="color:#22c55e;"><span>Parcela de ${monthLabel(S.month.y,S.month.m)} — <b>PAGA</b></span><span>${brl(mesRef.pagamento.valor)}</span><span>via ${esc(mesRef.pagamento.banco)}</span><span>${mesRef.pagamento.data?mesRef.pagamento.data.slice(8,10)+'/'+mesRef.pagamento.data.slice(5,7):''}</span><button onclick="Cards.undoBoletoPagamento('${b.id}','${mesRef.pagamento.id}')" title="Marcar boleto em aberto">↺</button></div>`
        : (mesRef.total>0 ? `<div class="installment-row"><span>Parcela de ${monthLabel(S.month.y,S.month.m)}: <b style="color:#ef4444">${brl(mesRef.total)}</b></span><span></span><span></span><span></span><button onclick="Cards.payBoletoParcela('${b.id}')" title="Marcar boleto como pago">✔</button></div>` : ''));
    return `
    <div class="card-entity boleto-entity">
      <div class="card-entity-head">
        <div class="cehl">
          <div class="bank-badge boleto-badge" style="background:${bankColor(b.banco||b.credor||'Boleto')}">▧</div>
          <div class="info"><div>${esc(b.descricao||'Boleto')} <span style="font-weight:400;color:var(--muted);font-size:11.5px;">· ${esc(b.credor||'Sem credor')}</span>${b.categoria?` <span class="cat-pill" style="margin-left:4px;"><span class="dot" style="background:${catColor(b.categoria)}"></span>${esc(b.categoria)}</span>`:''}${b.apareceDespesas?` <span class="cat-pill" style="opacity:.85;"><span class="dot" style="background:var(--gold-bright)"></span>Também em Despesas (${b.despesaTipo==='fixa'?'fixa':'variável'})</span>`:''}</div><div>${esc(b.banco||'Sem banco')} · ${Number(b.parcelaTotal||1)} boleto(s) · ${st.ativo?`${st.atual} de ${b.parcelaTotal}`:'fora do mês'} · <b style="color:${statusColor}">${esc(statusAtual)}</b></div></div>
        </div>
        <button class="btn-outline btn-sm" onclick="Cards.editBoleto('${b.id}')">✎ Editar boleto</button>
      </div>
      ${mesHTML}
      <div class="installment-row boleto-row"><span>Valor mensal</span><span>${brl(b.valorParcela||0)}</span><span>Restante</span><span>${st.ativo?brl(st.restante):'—'}</span><span></span></div>
      <div class="installment-row muted"><span>Primeiro boleto: ${shortMonthLabel(b.dataInicio||monthKey(S.month.y,S.month.m))}</span><span>Fim: ${shortMonthLabel(fim)}</span><span>Vencimento</span><span>Dia ${b.diaVencimento||'—'}</span><button onclick="Cards.editBoleto('${b.id}')">✎</button></div>
    </div>`;
  }).join('');

  const orgFilterNoticeContas = orgActive && !canReorderNow ? OrderPreferences.filterBlockedNoticeHTML() : '';
  const orgFilterNoticeCartoes = orgActive && !canReorderNow ? OrderPreferences.filterBlockedNoticeHTML() : '';
  return `
    <div class="toolbar"><div class="toolbar-left">Bancos e contas</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${window.OrderPreferences?OrderPreferences.sortSelectHTML('contas'):''}<button class="btn-outline" onclick="Cards.addConta()">+ Adicionar conta</button></div></div>
    <p style="font-size:11.5px;color:var(--muted-2);margin:-6px 0 12px;">Cadastre aqui cada banco/conta. Eles ficam disponíveis para vincular em receitas, despesas, parcelas, investimentos, metas, agenda, reserva e filtro por banco.</p>
    ${orgFilterNoticeContas}
    <div data-order-list="contas" style="display:contents;">${accRows || '<div class="empty-note" style="margin-bottom:20px;">Nenhuma conta cadastrada ainda.</div>'}</div>
    <div class="toolbar" style="margin-top:10px;"><div class="toolbar-left">Cartões de crédito</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">${window.OrderPreferences?OrderPreferences.sortSelectHTML('cartoes'):''}<button class="btn-outline" onclick="Cards.addCartao()">+ Adicionar cartão</button></div></div>
    <p style="font-size:11.5px;color:var(--muted-2);margin:-6px 0 12px;">Compras no cartão viram parcelas dentro da fatura e não mexem no saldo do banco. O saldo só muda quando você marcar a fatura como paga.</p>
    ${orgFilterNoticeCartoes}
    <div data-order-list="cartoes" style="display:contents;">${cardBlocks || '<div class="empty-note">Nenhum cartão cadastrado ainda.</div>'}</div>
    <div class="toolbar" style="margin-top:18px;"><div class="toolbar-left">Boletos</div><button class="btn-outline" onclick="Cards.addBoleto()">+ Adicionar boleto</button></div>
    <p style="font-size:11.5px;color:var(--muted-2);margin:-6px 0 12px;">Use para boletos parcelados, carnês, financiamentos curtos ou cobranças recorrentes. Entram como dívida no patrimônio separado do cartão de crédito.</p>
    ${boletoBlocks || '<div class="empty-note">Nenhum boleto cadastrado ainda.</div>'}
  `;
}
function computeCardsDebtForCartao(c, y, m){
  let total=0;
  (c.parcelas||[]).forEach(p=>{ const st=parcelaRestanteValor(p,c.id,y,m); if(st.ativo) total+=st.restante; });
  return Math.round(total*100)/100;
}
const Cards = {
  addConta(){
    openModal({title:'Adicionar conta bancária', fields:[
      {key:'nome',label:'Nome do banco/conta',type:'text'},
      {key:'tipo',label:'Tipo',type:'select',options:['Conta corrente','Conta poupança','Carteira digital','Investimento','Outro'],default:'Conta corrente'},
      {key:'saldoInicial',label:'Saldo inicial (R$)',type:'money'},
      {key:'rende',label:'Rende / aplica automaticamente?',type:'checkbox'},
      {key:'percentualRendimento',label:'Rendimento (% ao mês, opcional)',type:'number',step:'0.01'},
      {key:'cor',label:'Cor',type:'color'},
      {key:'icone',label:'Símbolo/ícone',type:'text',default:'◈'},
    ], onSave(v){
      S.data.contas.push({id:uid(), accountKind:'bank', active:true, createdAt:Date.now(), nome:(v.nome||'Conta').trim(), tipo:v.tipo, saldoInicial:Number(v.saldoInicial)||0, rende:!!v.rende, percentualRendimento:Number(v.percentualRendimento)||0, cor:v.cor, icone:v.icone||'◈'});
      saveCurrentData(); closeModal(); renderView();
    }});
  },
  editConta(id){
    const a = S.data.contas.find(x=>x.id===id);
    if(!a) return;
    /* V5.36.0 — a Carteira (dinheiro físico) é uma conta fixa: nome e existência não
       podem ser alterados pelo usuário, só saldo/aparência. Nunca tem botão de excluir. */
    if(a.isCarteira){
      openModal({title:'Editar Carteira', sub:'A Carteira representa seu dinheiro físico (cédulas). Ela é fixa e não pode ser excluída — assim você sempre consegue lançar receitas e despesas mesmo sem cadastrar nenhum banco.', fields:[
        {key:'saldoInicial',label:'Saldo inicial em dinheiro (R$)',type:'money'},
        {key:'cor',label:'Cor',type:'color'},
        {key:'icone',label:'Símbolo/ícone',type:'text'},
      ], values:a,
      onSave(v){ Object.assign(a,{saldoInicial:Number(v.saldoInicial)||0, cor:v.cor||a.cor, icone:v.icone||a.icone}); saveCurrentData(); closeModal(); renderView(); }});
      return;
    }
    openModal({title:'Editar conta bancária', fields:[
      {key:'nome',label:'Nome do banco/conta',type:'text'},
      {key:'tipo',label:'Tipo',type:'select',options:['Conta corrente','Conta poupança','Carteira digital','Investimento','Outro']},
      {key:'saldoInicial',label:'Saldo inicial (R$)',type:'money'},
      {key:'rende',label:'Rende / aplica automaticamente?',type:'checkbox'},
      {key:'percentualRendimento',label:'Rendimento (% ao mês, opcional)',type:'number',step:'0.01'},
      {key:'cor',label:'Cor',type:'color'},
      {key:'icone',label:'Símbolo/ícone',type:'text'},
    ], values:a,
    onDelete(){
      const linked=accountLinkedRecordCount(id);
      openConfirmModal({title:'Excluir conta bancária?',text:linked?`Esta conta possui ${linked} lançamento(s) vinculado(s). Ela será removida das contas ativas, mas o histórico será preservado. Uma nova conta com o mesmo nome não herdará essas movimentações.`:'A conta será removida das contas ativas. O identificador histórico será preservado para impedir herança acidental de dados.',confirmLabel:'Arquivar conta',variant:'danger',onConfirm(){
        a.active=false; a.archivedAt=Date.now(); a.deletedAt=a.archivedAt;
        closeModal(); saveCurrentData(); renderView(); toast('Conta arquivada. Histórico e accountId preservados.');
      }});
      return false;
    },
    onSave(v){ Object.assign(a,{nome:v.nome||a.nome, tipo:v.tipo, saldoInicial:Number(v.saldoInicial)||0, rende:!!v.rende, percentualRendimento:Number(v.percentualRendimento)||0, cor:v.cor, icone:v.icone||a.icone}); saveCurrentData(); closeModal(); renderView(); }});
  },
  addCartao(){
    openModal({title:'Adicionar cartão de crédito', fields:[
      {key:'banco',label:'Banco / nome do cartão',type:'text'},{key:'limite',label:'Limite de crédito (R$)',type:'money'},
    ], onSave(v){
      const banco = (v.banco||'').trim();
      if(!banco){ alert('Digite o banco/nome do cartão.'); return; }
      S.data.cartoes.push({id:uid(),banco,limite:Number(v.limite)||0,parcelas:[],faturasPagas:[]}); saveCurrentData(); closeModal(); renderView();
    }});
  },
  editCartao(id){
    const c = S.data.cartoes.find(x=>x.id===id);
    openModal({title:'Editar cartão', fields:[
      {key:'banco',label:'Banco / nome do cartão',type:'text'},{key:'limite',label:'Limite de crédito (R$)',type:'money'},
    ], values:c,
    onDelete(){ S.data.cartoes = S.data.cartoes.filter(x=>x.id!==id); saveCurrentData(); closeModal(); renderView(); },
    onSave(v){
      const banco = (v.banco||'').trim();
      if(!banco){ alert('Digite o banco/nome do cartão.'); return; }
      Object.assign(c,{banco,limite:Number(v.limite)||0});
      /* V5.39.1 — renomear o cartão precisa atualizar o banco gravado nas despesas
         espelhadas (Cartões e Contas → Despesas), senão elas ficam com o nome antigo. */
      (c.parcelas||[]).forEach(p=>{ if(p.apareceDespesas) linkParcelaToDespesa(c,p); });
      saveCurrentData(); closeModal(); renderView();
    }});
  },
  addParcela(cartaoId){
    openModal({title:'Adicionar compra parcelada', sub:'A parcela atual é calculada automaticamente de acordo com o mês da compra e o mês selecionado no calendário. Compras no cartão não mudam o saldo do banco — só a fatura paga muda.', fields:[
      {key:'descricao',label:'O que foi comprado',type:'text'},
      {key:'local',label:'Onde comprou (loja)',type:'text'},
      {key:'categoria',label:'Categoria',type:'select',options:S.data.categorias.variavel,default:S.data.categorias.variavel[0]},
      {key:'valorParcela',label:'Valor de cada parcela (R$)',type:'money'},
      {key:'parcelaTotal',label:'Total de parcelas (1x = compra à vista neste mês)',type:'number',step:'1',default:1},
      {key:'dataCompra',label:'Data da compra (1ª parcela)',type:'date',default:todayISO()},
      {key:'diaEntrada',label:'Dia do mês que entra na fatura',type:'number',step:'1'},
      {key:'apareceDespesas',label:'Aparecer também em Despesas?',type:'checkbox'},
      {key:'despesaTipo',label:'Aparecer como',type:'segmented',default:'variavel',options:[{value:'variavel',label:'Despesa variável'},{value:'fixa',label:'Despesa fixa'}],visibleWhen:{key:'apareceDespesas',value:true}},
    ], onSave(v){
      const c = S.data.cartoes.find(x=>x.id===cartaoId);
      const dataCompraCompleta=v.dataCompra||todayISO();
      /* V6.35.4 — mesma prioridade de editParcela: a data escolhida manda no dia. */
      const diaCompra=Math.max(1,Math.min(31,parseInt(dataCompraCompleta.slice(8,10),10)||Number(v.diaEntrada)||1));
      const p = {id:uid(), descricao:v.descricao, local:v.local, categoria:v.categoria||'Outro', valorParcela:Number(v.valorParcela)||0, parcelaTotal:Math.max(1,Math.round(v.parcelaTotal)||1), dataCompra:dataCompraCompleta.slice(0,7), dataCompraCompleta, diaEntrada:diaCompra, apareceDespesas:!!v.apareceDespesas, despesaTipo:v.despesaTipo||'variavel', statusFaturaPorCompetencia:{}, despesaTransacaoId:null, despesaTransacaoIds:[], despesaFixaId:null};
      c.parcelas.push(p);
      linkParcelaToDespesa(c, p);
      saveCurrentData(); closeModal(); renderView();
      toast(p.apareceDespesas ? 'Compra adicionada ao cartão e em Despesas.' : 'Compra adicionada ao cartão.');
    }});
    wireParcelaCategoriaPorTipo((S.data.categorias.variavel||[])[0]);
  },
  editParcela(cartaoId, parcelaId){
    const c = S.data.cartoes.find(x=>x.id===cartaoId);
    const p = c.parcelas.find(x=>x.id===parcelaId);
    openModal({title:'Editar parcela', sub:'A parcela atual é calculada automaticamente de acordo com o mês da compra e o mês selecionado no calendário.', fields:[
      {key:'descricao',label:'O que foi comprado',type:'text'},
      {key:'local',label:'Onde comprou (loja)',type:'text'},
      {key:'categoria',label:'Categoria',type:'select',options:S.data.categorias.variavel},
      {key:'valorParcela',label:'Valor de cada parcela (R$)',type:'money'},
      {key:'parcelaTotal',label:'Total de parcelas',type:'number',step:'1'},
      {key:'dataCompra',label:'Data da compra (1ª parcela)',type:'date'},
      {key:'diaEntrada',label:'Dia do mês que entra na fatura',type:'number',step:'1'},
      {key:'apareceDespesas',label:'Aparecer também em Despesas?',type:'checkbox'},
      {key:'despesaTipo',label:'Aparecer como',type:'segmented',options:[{value:'variavel',label:'Despesa variável'},{value:'fixa',label:'Despesa fixa'}],visibleWhen:{key:'apareceDespesas',value:true}},
    ], values:Object.assign({},p,{dataCompra:p.dataCompraCompleta||(p.dataCompra?(p.dataCompra+'-'+pad2(p.diaEntrada||1)): '')}),
    onDelete(){ unlinkParcelaFromDespesa(p); c.parcelas = c.parcelas.filter(x=>x.id!==parcelaId); saveCurrentData(); closeModal(); renderView(); },
    onSave(v){
      const dataCompraCompleta=v.dataCompra||p.dataCompraCompleta||(p.dataCompra?(p.dataCompra+'-'+pad2(p.diaEntrada||1)):'');
      /* V6.35.4 — "Data da compra" e "Dia do mês que entra na fatura" são dois campos
         para a mesma informação (o dia). Antes, o dia digitado em "Dia da fatura"
         (pré-preenchido com o valor ANTIGO ao abrir para editar) sempre vencia, mesmo
         quando o usuário só mexia em "Data da compra". Resultado: mudar a data de dia 15
         para dia 16 e salvar continuava mostrando dia 15, porque o campo numérico
         nunca tinha sido tocado e ainda carregava o valor antigo. Agora o dia é extraído
         primeiro da própria data escolhida — que é o campo que o usuário efetivamente
         está editando — e só cai para "Dia da fatura" se a data vier vazia. */
      const diaCompra=Math.max(1,Math.min(31,parseInt(dataCompraCompleta.slice(8,10),10)||Number(v.diaEntrada)||p.diaEntrada||1));
      Object.assign(p,{descricao:v.descricao, local:v.local, categoria:v.categoria||p.categoria||'Outro', valorParcela:Number(v.valorParcela)||0, parcelaTotal:Math.max(1,Math.round(v.parcelaTotal)||1), dataCompra:dataCompraCompleta.slice(0,7), dataCompraCompleta, diaEntrada:diaCompra, apareceDespesas:!!v.apareceDespesas, despesaTipo:v.despesaTipo||'variavel'});
      linkParcelaToDespesa(c, p);
      saveCurrentData(); closeModal(); renderView();
    }});
    wireParcelaCategoriaPorTipo(p.categoria);
  },
  /* Marca a fatura do mês selecionado como paga: debita o banco escolhido e some da dívida em aberto. */
  payFatura(cartaoId){
    const c = S.data.cartoes.find(x=>x.id===cartaoId);
    if(!c) return;
    const info = cartaoFaturaDoMes(cartaoId, S.month.y, S.month.m);
    if(info.paga){ toast('A fatura deste mês já está marcada como paga.'); return; }
    if(info.total<=0){ toast('Não há valor de fatura neste mês.'); return; }
    openModal({title:'Marcar fatura como paga', sub:'Escolha o banco usado para pagar a fatura de '+monthLabel(S.month.y,S.month.m)+'. O valor sai do saldo (liquidez) desse banco.', fields:[
      {key:'valor',label:'Valor pago (R$)',type:'money',default:info.total},
      accountSelectField('faturapg','',{key:'accountId'}),
      {key:'data',label:'Data do pagamento',type:'date',default:todayISO()},
    ], onSave(v){
      const accountId = requireAccountId(v.accountId,'Escolha a conta usada para pagar a fatura.');
      if(!accountId) return;
      const banco = accountNameSnapshot(accountId);
      const valor = Number(v.valor)||info.total;
      if(!c.faturasPagas) c.faturasPagas=[];
      /* V6.27.3 — ao pagar a fatura, as despesas variáveis espelhadas daquele mês
         também ficam pagas em Lançamentos. Guardamos o estado anterior para desfazer
         a fatura sem apagar uma baixa individual feita antes. */
      const linkedExpenseStatuses=[];
      (c.parcelas||[]).forEach(parcela=>{
        const st=parcelaStatus(parcela,S.month.y,S.month.m);
        if(!st.ativo||!parcela.apareceDespesas||parcela.despesaTipo==='fixa')return;
        const tx=linkedParcelaTransactionForCompetencia(parcela.id,info.competencia);
        if(!tx)return;
        linkedExpenseStatuses.push({txId:tx.id,statusPagamento:variavelStatus(tx)});
        tx.statusPagamento='Pago';
      });
      c.faturasPagas.push({id:uid(), competencia:info.competencia, valor, accountId, banco, data:v.data||todayISO(), linkedExpenseStatuses, createdAt:Date.now()});
      adjustLiquidez(accountId, -valor);
      saveCurrentData(); closeModal(); renderView(); toast('Fatura marcada como paga. Saldo de '+banco+' atualizado.');
    }});
  },
  undoFaturaPagamento(cartaoId, pagamentoId){
    const c = S.data.cartoes.find(x=>x.id===cartaoId);
    if(!c || !Array.isArray(c.faturasPagas)) return;
    const idx = c.faturasPagas.findIndex(f=>f.id===pagamentoId);
    if(idx<0) return;
    openConfirmModal({title:'Desfazer pagamento de fatura', text:'Desfazer este pagamento de fatura? O valor volta a aparecer como dívida e o saldo do banco é devolvido.', confirmLabel:'Desfazer pagamento', variant:'danger', onConfirm(){
      const pg = c.faturasPagas[idx];
      adjustLiquidez(pg.accountId||resolveAccountId(pg.banco,{includeArchived:true}), pg.valor);
      (pg.linkedExpenseStatuses||[]).forEach(saved=>{
        const tx=(S.data.transacoes||[]).find(t=>t.id===saved.txId&&t.tipo==='variavel');
        if(tx)tx.statusPagamento=saved.statusPagamento==='Em aberto'?'Em aberto':'Pago';
      });
      c.faturasPagas.splice(idx,1);
      saveCurrentData(); renderView(); toast('Pagamento da fatura desfeito.');
    }});
  },
  /* Para itens integrados, mantém a rotina financeira existente. Para itens sem vínculo,
     alterna somente o marcador visual salvo na própria parcela. */
  toggleParcelaPagamento(cartaoId,parcelaId,competencia){
    const c=(S.data.cartoes||[]).find(x=>x.id===cartaoId);
    const p=c&&(c.parcelas||[]).find(x=>x.id===parcelaId);
    if(!c||!p)return;
    if(!p.apareceDespesas){
      const atual=parcelaFaturaStatusIndependente(p,competencia);
      setParcelaFaturaStatusIndependente(p,competencia,atual==='Pago'?'Em aberto':'Pago');
      saveCurrentData({skipPatrimonioSnapshot:true});renderView();
      toast(atual==='Pago'?'Item marcado como em aberto somente na fatura.':'Item marcado como pago somente na fatura.');
      return;
    }
    if(p.despesaTipo==='fixa'){
      let f=(S.data.fixas||[]).find(x=>x.id===p.despesaFixaId)||(S.data.fixas||[]).find(x=>x.viaCartaoId===c.id&&x.viaParcelaId===p.id);
      if(!f){linkParcelaToDespesa(c,p);f=(S.data.fixas||[]).find(x=>x.id===p.despesaFixaId);}
      if(f)Budget.toggleFixaPago(f.id);
      return;
    }
    let tx=linkedParcelaTransactionForCompetencia(p.id,competencia);
    if(!tx){linkParcelaToDespesa(c,p);tx=linkedParcelaTransactionForCompetencia(p.id,competencia);}
    if(tx)Budget.toggleVariavelPago(tx.id);
  },
  toggleBoletoPagamento(boletoId,competencia){
    const b=(S.data.boletos||[]).find(x=>x.id===boletoId);
    if(!b||!b.apareceDespesas)return;
    if(b.despesaTipo==='fixa'){
      const f=(S.data.fixas||[]).find(x=>x.id===b.despesaFixaId)||(S.data.fixas||[]).find(x=>x.viaBoletoId===b.id);
      if(f)Budget.toggleFixaPago(f.id);
      return;
    }
    const tx=linkedBoletoTransactionForCompetencia(b.id,competencia);
    if(tx)Budget.toggleVariavelPago(tx.id);
  },
  addBoleto(){ Cards.editBoleto(null); },
  editBoleto(id){
    const isEdit=!!id;
    const b=isEdit?(S.data.boletos||[]).find(x=>x.id===id):{descricao:'',credor:'',accountId:null,banco:'',categoria:'Outro',valorParcela:0,parcelaTotal:1,dataInicio:monthKey(S.month.y,S.month.m),diaVencimento:'',status:'Em Aberto',obs:'',apareceDespesas:false,despesaTipo:'variavel',origemPagamento:'conta'};
    if(!b)return;
    const normalizedStatus=b.status==='Quitado'?'Pago':(b.status==='Ativo'||!b.status?'Em Aberto':b.status);
    const origemAtual=b.origemPagamento||(b.accountId===CARTEIRA_CONTA_ID?'carteira':'conta');
    const accountOpts=accountSelectOptions({excludeCarteira:true});
    const categoriaTipo=b.despesaTipo==='fixa'?'fixa':'variavel';
    const categorias=typeof orderedCategories==='function'?orderedCategories(categoriaTipo):(((S.data.categorias&&S.data.categorias[categoriaTipo])||[]).slice());
    openModal({title:isEdit?'Editar boleto':'Adicionar boleto',sub:'Use para boleto parcelado ou carnê. Ele entra em Dívidas no Patrimônio, separado do cartão de crédito.',fields:[
      {key:'descricao',label:'Descrição do boleto',type:'text',placeholder:'Ex: Notebook, seguro, carnê...'},
      {key:'credor',label:'Para quem / Empresa',type:'text',placeholder:'Ex: Loja, financeira, pessoa...'},
      {key:'origemPagamento',label:'Origem do pagamento',type:'segmented',options:[{value:'carteira',label:'Carteira'},{value:'conta',label:'Conta'}],default:origemAtual},
      {key:'accountId',label:'Conta',type:'select',options:accountOpts.length?accountOpts:[{value:'',label:'Cadastre uma conta em Cartões e Contas'}],default:b.accountId&&b.accountId!==CARTEIRA_CONTA_ID?b.accountId:'',visibleWhen:{key:'origemPagamento',value:'conta'}},
      {key:'categoria',label:'Categoria',type:'select',options:categorias.length?categorias:['Outro'],default:b.categoria||categorias[0]||'Outro'},
      {key:'valorParcela',label:'Valor de cada boleto',type:'money'},
      {key:'parcelaTotal',label:'Quantidade de boletos',type:'number',step:'1',default:1},
      {key:'dataInicio',label:'Mês do primeiro boleto',type:'month',default:monthKey(todayYM().y,todayYM().m)},
      {key:'diaVencimento',label:'Dia de vencimento',type:'number',step:'1'},
      {key:'status',label:'Status',type:'select',options:['Em Aberto','Pago','Cancelado'],default:normalizedStatus},
      {key:'obs',label:'Observação',type:'text'},
      {key:'apareceDespesas',label:'Aparecer também em Despesas',type:'checkbox'},
      {key:'despesaTipo',label:'Aparecer como',type:'segmented',default:categoriaTipo,options:[{value:'variavel',label:'Despesa variável'},{value:'fixa',label:'Despesa fixa'}],visibleWhen:{key:'apareceDespesas',value:true}}
    ],values:Object.assign({},b,{status:normalizedStatus,origemPagamento:origemAtual}),
    onDelete:isEdit?()=>{unlinkBoletoFromDespesa(b);S.data.boletos=(S.data.boletos||[]).filter(x=>x.id!==id);saveCurrentData();closeModal();renderView();}:null,
    onSave(v){
      const origemPagamento=v.origemPagamento==='carteira'?'carteira':'conta';
      const accountId=origemPagamento==='carteira'?requireAccountId(CARTEIRA_CONTA_ID,'A Carteira precisa estar disponível.'):requireAccountId(v.accountId,'Escolha a conta vinculada a este boleto.');
      if(!accountId)return;
      const banco=accountNameSnapshot(accountId);
      if(!S.data.boletos)S.data.boletos=[];
      const obj={descricao:v.descricao||'Boleto',credor:v.credor||'',origemPagamento,accountId,banco,categoria:v.categoria||'Outro',valorParcela:Number(v.valorParcela)||0,parcelaTotal:Math.max(1,Math.round(v.parcelaTotal)||1),dataInicio:v.dataInicio||monthKey(S.month.y,S.month.m),diaVencimento:v.diaVencimento||'',status:['Em Aberto','Pago','Cancelado'].includes(v.status)?v.status:'Em Aberto',obs:v.obs||'',apareceDespesas:!!v.apareceDespesas,despesaTipo:v.despesaTipo==='fixa'?'fixa':'variavel'};
      let alvo;
      if(isEdit){Object.assign(b,obj);alvo=b;}else{alvo=Object.assign({id:uid(),createdAt:Date.now(),pagamentos:[],despesaTransacaoId:null,despesaTransacaoIds:[],despesaFixaId:null},obj);S.data.boletos.push(alvo);}
      linkBoletoToDespesa(alvo);saveCurrentData();closeModal();renderView();
      toast(alvo.apareceDespesas?(isEdit?'Boleto atualizado e em Despesas.':'Boleto cadastrado e em Despesas.'):(isEdit?'Boleto atualizado.':'Boleto cadastrado.'));
    }});
    wireParcelaCategoriaPorTipo(b.categoria);
  },
  /* Marca a parcela do mês selecionado como paga: debita o banco escolhido e some da dívida em aberto. */
  payBoletoParcela(boletoId,competenciaOverride){
    const b = (S.data.boletos||[]).find(x=>x.id===boletoId);
    if(!b) return;
    const competencia=competenciaOverride||monthKey(S.month.y,S.month.m);
    const parts=competencia.split('-').map(Number);
    const info = boletoParcelaDoMes(boletoId, parts[0]||S.month.y, (parts[1]||S.month.m+1)-1);
    if(info.paga){ toast('Esta parcela já está marcada como paga.'); return; }
    if(info.total<=0){ toast('Não há parcela ativa neste mês.'); return; }
    openModal({title:'Marcar boleto como pago', sub:'Escolha o banco usado para pagar a parcela de '+monthLabel(parts[0]||S.month.y,(parts[1]||S.month.m+1)-1)+'. O valor sai do saldo (liquidez) desse banco.', fields:[
      {key:'valor',label:'Valor pago (R$)',type:'money',default:info.total},
      accountSelectField('boletopg', b.accountId||b.banco,{key:'accountId'}),
      {key:'data',label:'Data do pagamento',type:'date',default:todayISO()},
    ], onSave(v){
      const accountId = requireAccountId(v.accountId,'Escolha a conta usada para pagar o boleto.');
      if(!accountId) return;
      const banco = accountNameSnapshot(accountId);
      const valor = Number(v.valor)||info.total;
      if(!Array.isArray(b.pagamentos)) b.pagamentos=[];
      b.pagamentos.push({id:uid(), competencia:info.competencia, valor, accountId, banco, data:v.data||todayISO(), createdAt:Date.now()});
      const linkedTx=linkedBoletoTransactionForCompetencia(b.id,info.competencia);
      if(linkedTx)linkedTx.statusPagamento='Pago';
      adjustLiquidez(accountId, -valor);
      saveCurrentData(); closeModal(); renderView(); toast('Boleto marcado como pago. Saldo de '+banco+' atualizado.');
    }});
  },
  undoBoletoPagamento(boletoId, pagamentoId){
    const b = (S.data.boletos||[]).find(x=>x.id===boletoId);
    if(!b || !Array.isArray(b.pagamentos)) return;
    const idx = b.pagamentos.findIndex(p=>p.id===pagamentoId);
    if(idx<0) return;
    openConfirmModal({title:'Desfazer pagamento', text:'Desfazer este pagamento? O valor volta a aparecer como dívida e o saldo do banco é devolvido.', confirmLabel:'Desfazer pagamento', variant:'danger', onConfirm(){
      const pg = b.pagamentos[idx];
      adjustLiquidez(pg.accountId||resolveAccountId(pg.banco,{includeArchived:true}), pg.valor);
      const linkedTx=linkedBoletoTransactionForCompetencia(b.id,pg.competencia);
      if(linkedTx)linkedTx.statusPagamento='Em aberto';
      b.pagamentos.splice(idx,1);
      saveCurrentData(); renderView(); toast('Pagamento do boleto desfeito.');
    }});
  },
  /* ---------------- V6.28 — Transferências unificadas em Lançamentos ----------------
     Esta é a única janela de movimentação usada por Lançamentos → Transferências e por
     Reserva → + Movimentação. Carteira, Contas e Reservas compartilham os mesmos vínculos. */
  addTransferencia(options={}){ Cards.editTransferencia(null,options); },
  editTransferencia(id,options={}){
    const isEdit=!!id;
    const t=isEdit?(S.data.transferencias||[]).find(x=>x.id===id):null;
    if(isEdit&&!t){toast('Transferência não encontrada.');return;}
    const bankAccounts=accountSelectOptions({excludeCarteira:true});
    const boxes=reservasEnabled()?((S.data.reservas&&S.data.reservas.boxes)||[]):[];
    if(!bankAccounts.length&&!boxes.length){showBankRequiredModal();return;}
    const boxById=boxId=>boxes.find(r=>r.id===boxId)||null;
    const boxAccountId=box=>box&&(box.accountId||resolveAccountId(box.banco,{includeArchived:false}))||null;
    const boxLabel=box=>`${box.nome}${box.banco?' · '+box.banco:''}`;
    const initialSource=options.originBoxId?'reserva':(isEdit?(t.origemTipo==='reserva'?'reserva':((t.origemAccountId||t.origemId)===CARTEIRA_CONTA_ID?'carteira':'conta')):(bankAccounts.length?'conta':(boxes.length?'reserva':'carteira')));
    const initialOriginAccount=isEdit&&t.origemTipo==='conta'&&(t.origemAccountId||t.origemId)!==CARTEIRA_CONTA_ID?(t.origemAccountId||t.origemId):((bankAccounts[0]||{}).value||'');
    const initialDestAccount=isEdit&&t.destinoTipo==='conta'?(t.destinoAccountId||t.destinoId):((bankAccounts.find(o=>o.value!==initialOriginAccount)||bankAccounts[0]||{}).value||'');
    const initialOriginBox=boxById(options.originBoxId)||(isEdit&&t.origemTipo==='reserva'?boxById(t.origemId):null)||boxes[0]||null;
    const initialDestBox=isEdit&&t.destinoTipo==='reserva'?boxById(t.destinoId):(boxes.find(r=>!initialOriginBox||r.id!==initialOriginBox.id)||boxes[0]||null);
    let initialAccountDestType=isEdit&&t.destinoTipo==='reserva'?'reserva':'conta';
    let initialReserveAction='resgatar';
    if(isEdit){
      if(t.kind==='rendimento_reserva')initialReserveAction='rendimento';
      else if(t.kind==='ajuste_reserva')initialReserveAction='ajuste';
      else if(t.origemTipo==='reserva'&&t.destinoTipo==='reserva')initialReserveAction='enviar';
      else if(t.origemTipo==='reserva'&&t.destinoTipo==='conta')initialReserveAction='resgatar';
    }else if(options.initialType==='Rendimento')initialReserveAction='rendimento';
    else if(options.initialType==='Ajuste manual')initialReserveAction='ajuste';
    else if(options.initialType==='Enviar para outra reserva')initialReserveAction='enviar';

    const accountOptions=bankAccounts.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
    const boxOptions=boxes.map(r=>`<option value="${esc(r.id)}">${esc(boxLabel(r))}</option>`).join('');
    const box=el(`<div class="modal-overlay"><div class="modal-box transfer-modal-box">
      <div class="modal-head"><h2>${isEdit?'Editar transferência':'Nova transferência'}</h2><button id="tr_close">&times;</button></div>
      <p class="modal-sub">A mesma janela é usada em Lançamentos e em Reserva. O Borion limita automaticamente os destinos para preservar o vínculo entre cada Cofrinho e sua conta.</p>
      <div class="field"><label>Origem do dinheiro</label><div class="segmented-toggle payment-source-toggle" id="tr_source_group">
        <button type="button" class="seg-btn ${initialSource==='carteira'?'active':''}" data-value="carteira">Carteira</button>
        <button type="button" class="seg-btn ${initialSource==='conta'?'active':''}" data-value="conta" ${bankAccounts.length?'':'disabled'}>Conta</button>
        <button type="button" class="seg-btn ${initialSource==='reserva'?'active':''}" data-value="reserva" ${boxes.length?'':'disabled'}>Reserva</button>
      </div><input type="hidden" id="tr_source" value="${initialSource}"/></div>

      <div id="tr_wallet_panel" class="payment-source-panel ${initialSource==='carteira'?'':'hidden'}">
        <div class="info-box">A Carteira representa dinheiro em espécie. Neste fluxo ela pode enviar dinheiro apenas para uma Conta.</div>
        <div class="field"><label>Conta de destino</label><select id="tr_wallet_dest">${accountOptions||'<option value="">Cadastre uma conta bancária</option>'}</select></div>
      </div>

      <div id="tr_account_panel" class="payment-source-panel ${initialSource==='conta'?'':'hidden'}">
        <div class="field"><label>Conta de origem</label><select id="tr_origin_account">${accountOptions||'<option value="">Cadastre uma conta bancária</option>'}</select></div>
        <div class="field"><label>Destino</label><div class="segmented-toggle" id="tr_account_dest_type_group">
          <button type="button" class="seg-btn ${initialAccountDestType==='conta'?'active':''}" data-value="conta">Conta</button>
          <button type="button" class="seg-btn ${initialAccountDestType==='reserva'?'active':''}" data-value="reserva" ${boxes.length?'':'disabled'}>Reserva</button>
        </div><input type="hidden" id="tr_account_dest_type" value="${initialAccountDestType}"/></div>
        <div id="tr_account_to_account" class="payment-source-panel ${initialAccountDestType==='conta'?'':'hidden'}"><div class="field"><label>Conta de destino</label><select id="tr_dest_account">${accountOptions||'<option value="">Cadastre outra conta bancária</option>'}</select></div></div>
        <div id="tr_account_to_reserve" class="payment-source-panel reserve-destination-box ${initialAccountDestType==='reserva'?'':'hidden'}"><div class="field"><label>Reserva de destino</label><select id="tr_dest_reserve"></select></div><p class="modal-sub reserve-hint" id="tr_linked_reserve_hint"></p></div>
      </div>

      <div id="tr_reserve_panel" class="payment-source-panel ${initialSource==='reserva'?'':'hidden'}">
        <div class="field"><label>Reserva de origem</label><select id="tr_origin_reserve">${boxOptions||'<option value="">Crie uma reserva primeiro</option>'}</select></div>
        <div class="field"><label>Tipo de movimentação</label><div class="segmented-toggle transfer-action-toggle" id="tr_reserve_action_group">
          <button type="button" class="seg-btn ${initialReserveAction==='resgatar'?'active':''}" data-value="resgatar">Resgatar</button>
          <button type="button" class="seg-btn ${initialReserveAction==='rendimento'?'active':''}" data-value="rendimento">Rendimento</button>
          <button type="button" class="seg-btn ${initialReserveAction==='ajuste'?'active':''}" data-value="ajuste">Ajuste manual</button>
          <button type="button" class="seg-btn ${initialReserveAction==='enviar'?'active':''}" data-value="enviar">Enviar para outra reserva</button>
        </div><input type="hidden" id="tr_reserve_action" value="${initialReserveAction}"/></div>
        <div id="tr_resgate_fields" class="payment-source-panel ${initialReserveAction==='resgatar'?'':'hidden'}"><div class="info-box" id="tr_resgate_account_info"></div></div>
        <div id="tr_rendimento_fields" class="payment-source-panel ${initialReserveAction==='rendimento'?'':'hidden'}"><div class="info-box">O rendimento será acrescentado diretamente ao saldo desta Reserva.</div></div>
        <div id="tr_ajuste_fields" class="payment-source-panel ${initialReserveAction==='ajuste'?'':'hidden'}"><div class="info-box">O valor informado será o novo saldo da própria Reserva. Nenhuma Conta ou outra Reserva será alterada.</div></div>
        <div id="tr_enviar_fields" class="payment-source-panel reserve-destination-box ${initialReserveAction==='enviar'?'':'hidden'}"><div class="field"><label>Reserva de destino</label><select id="tr_reserve_dest"></select></div></div>
      </div>

      <div class="field"><label>Data</label><input type="date" id="tr_data" value="${esc(isEdit?(t.data||''):todayISO())}"/></div>
      <div class="field"><label id="tr_value_label">${initialReserveAction==='ajuste'&&initialSource==='reserva'?'Novo saldo da reserva (R$)':'Valor (R$)'}</label><input type="text" inputmode="numeric" class="money-input" id="tr_valor" placeholder="0,00"/></div>
      <div class="field"><label>Descrição</label><input type="text" id="tr_descricao" value="${esc((t&&t.descricao)||'')}" placeholder="Ex: transferência para pagamento, resgate ou ajuste"/></div>
      <div class="row-btns"><button class="btn btn-primary btn-block" id="tr_save">${isEdit?'Salvar transferência':'Adicionar transferência'}</button></div>
      ${isEdit?'<div class="row-btns" style="margin-top:8px;"><button class="btn btn-danger btn-block" id="tr_delete">Excluir transferência</button></div>':''}
    </div></div>`);
    $('#modal-root').innerHTML='';$('#modal-root').appendChild(box);attachModalGuard(box);$('#tr_close').onclick=closeModal;
    attachMoneyMask($('#tr_valor'),t?Number(t.valor)||0:0);
    if($('#tr_origin_account'))$('#tr_origin_account').value=initialOriginAccount;
    if($('#tr_dest_account'))$('#tr_dest_account').value=initialDestAccount;
    if($('#tr_wallet_dest'))$('#tr_wallet_dest').value=initialDestAccount;
    if($('#tr_origin_reserve')&&initialOriginBox)$('#tr_origin_reserve').value=initialOriginBox.id;

    const wireSegmented=(groupId,inputId,onChange)=>{const group=$(groupId),hidden=$(inputId);if(!group||!hidden)return;group.querySelectorAll('.seg-btn:not([disabled])').forEach(btn=>btn.onclick=()=>{group.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');hidden.value=btn.dataset.value;if(onChange)onChange(hidden.value);});};
    const setOptions=(select,items,selected,emptyLabel)=>{if(!select)return;select.innerHTML=items.length?items.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join(''):`<option value="">${esc(emptyLabel)}</option>`;if(items.some(o=>o.value===selected))select.value=selected;};
    function syncAccountReserveOptions(){
      const accountId=$('#tr_origin_account')&&$('#tr_origin_account').value;
      const linked=boxes.filter(r=>boxAccountId(r)===accountId).map(r=>({value:r.id,label:boxLabel(r)}));
      setOptions($('#tr_dest_reserve'),linked,(isEdit&&t.destinoTipo==='reserva'?t.destinoId:''),'Nenhuma reserva vinculada a esta conta');
      const hint=$('#tr_linked_reserve_hint');if(hint)hint.textContent=linked.length?'Somente Reservas vinculadas à conta de origem são exibidas.':'Esta conta ainda não possui Reserva vinculada.';
    }
    function syncReserveDestinationOptions(){
      const originId=$('#tr_origin_reserve')&&$('#tr_origin_reserve').value;
      const available=boxes.filter(r=>r.id!==originId).map(r=>({value:r.id,label:boxLabel(r)}));
      setOptions($('#tr_reserve_dest'),available,(isEdit&&t.destinoTipo==='reserva'?t.destinoId:(initialDestBox&&initialDestBox.id)),'Não há outra reserva disponível');
      const origin=boxById(originId),accountId=boxAccountId(origin),account=accountById(accountId,{includeArchived:true});
      const info=$('#tr_resgate_account_info');if(info)info.innerHTML=account?`O resgate voltará automaticamente para a conta vinculada: <b>${esc(account.nome)}</b>.`:'A conta vinculada a esta Reserva não está disponível. Corrija o vínculo antes de resgatar.';
    }
    function syncSourceUI(source){
      ['carteira','conta','reserva'].forEach(k=>{const node=$('#tr_'+(k==='carteira'?'wallet':k)+'_panel');if(node)node.classList.toggle('hidden',source!==k);});
      syncValueLabel();
    }
    function syncAccountDestUI(dest){
      if($('#tr_account_to_account'))$('#tr_account_to_account').classList.toggle('hidden',dest!=='conta');
      if($('#tr_account_to_reserve'))$('#tr_account_to_reserve').classList.toggle('hidden',dest!=='reserva');
      if(dest==='reserva')syncAccountReserveOptions();
    }
    function syncReserveActionUI(action){
      ['resgatar','rendimento','ajuste','enviar'].forEach(k=>{const node=$('#tr_'+k+'_fields');if(node)node.classList.toggle('hidden',action!==k);});
      if(action==='enviar')syncReserveDestinationOptions();
      if(action==='resgatar')syncReserveDestinationOptions();
      syncValueLabel();
    }
    function syncValueLabel(){
      const source=$('#tr_source')&&$('#tr_source').value,action=$('#tr_reserve_action')&&$('#tr_reserve_action').value;
      const label=$('#tr_value_label');if(label)label.textContent=source==='reserva'&&action==='ajuste'?'Novo saldo da reserva (R$)':'Valor (R$)';
    }
    wireSegmented('#tr_source_group','#tr_source',syncSourceUI);
    wireSegmented('#tr_account_dest_type_group','#tr_account_dest_type',syncAccountDestUI);
    wireSegmented('#tr_reserve_action_group','#tr_reserve_action',syncReserveActionUI);
    if($('#tr_origin_account'))$('#tr_origin_account').onchange=syncAccountReserveOptions;
    if($('#tr_origin_reserve'))$('#tr_origin_reserve').onchange=()=>{syncReserveDestinationOptions();syncReserveActionUI($('#tr_reserve_action').value);};
    syncAccountReserveOptions();syncReserveDestinationOptions();syncSourceUI(initialSource);syncAccountDestUI(initialAccountDestType);syncReserveActionUI(initialReserveAction);

    $('#tr_save').onclick=()=>{
      const source=$('#tr_source').value,data=$('#tr_data').value||(isEdit?(t.data||''):todayISO()),descricao=($('#tr_descricao').value||'').trim();
      const valor=parseInt($('#tr_valor').dataset.cents||'0',10)/100;
      const reserveAction=source==='reserva'&&$('#tr_reserve_action')?$('#tr_reserve_action').value:'';
      const adjustment=reserveAction==='ajuste',reserveYield=reserveAction==='rendimento';
      if((adjustment&&valor<0)||(reserveYield&&valor===0)||(!adjustment&&!reserveYield&&valor<=0)){
        alert(adjustment?'O novo saldo não pode ser negativo.':(reserveYield?'O rendimento não pode ser zero.':'Digite um valor maior que zero.'));return;
      }
      let obj=null;
      if(source==='carteira'){
        const destinoId=$('#tr_wallet_dest').value;if(!destinoId){alert('Escolha a conta de destino.');return;}
        obj={kind:'transferencia',origemTipo:'conta',origemId:CARTEIRA_CONTA_ID,origemAccountId:CARTEIRA_CONTA_ID,origemNome:accountNameSnapshot(CARTEIRA_CONTA_ID,'Carteira'),destinoTipo:'conta',destinoId,destinoAccountId:destinoId,destinoNome:accountNameSnapshot(destinoId),reservaAction:null,valor,data,descricao};
      }else if(source==='conta'){
        const origemId=$('#tr_origin_account').value,destType=$('#tr_account_dest_type').value;if(!origemId){alert('Escolha a conta de origem.');return;}
        if(destType==='conta'){
          const destinoId=$('#tr_dest_account').value;if(!destinoId){alert('Escolha a conta de destino.');return;}if(origemId===destinoId){alert('A conta de origem e a conta de destino precisam ser diferentes.');return;}
          obj={kind:'transferencia',origemTipo:'conta',origemId,origemAccountId:origemId,origemNome:accountNameSnapshot(origemId),destinoTipo:'conta',destinoId,destinoAccountId:destinoId,destinoNome:accountNameSnapshot(destinoId),reservaAction:null,valor,data,descricao};
        }else{
          const destino=boxById($('#tr_dest_reserve').value);if(!destino){alert('Esta conta não possui uma reserva disponível para receber o dinheiro.');return;}if(boxAccountId(destino)!==origemId){alert('A reserva escolhida não pertence à conta de origem.');return;}
          obj={kind:'transferencia',origemTipo:'conta',origemId,origemAccountId:origemId,origemNome:accountNameSnapshot(origemId),destinoTipo:'reserva',destinoId:destino.id,destinoAccountId:null,destinoNome:destino.nome,reservaAction:null,valor,data,descricao};
        }
      }else{
        const origem=boxById($('#tr_origin_reserve').value);if(!origem){alert('Escolha a reserva de origem.');return;}
        const action=$('#tr_reserve_action').value;
        if(action==='resgatar'){
          const destinoId=boxAccountId(origem);if(!destinoId){alert('A Reserva não possui uma conta vinculada válida.');return;}
          obj={kind:'transferencia',origemTipo:'reserva',origemId:origem.id,origemAccountId:null,origemNome:origem.nome,destinoTipo:'conta',destinoId,destinoAccountId:destinoId,destinoNome:accountNameSnapshot(destinoId),reservaAction:'resgatar',valor,data,descricao};
        }else if(action==='enviar'){
          const destino=boxById($('#tr_reserve_dest').value);if(!destino){alert('Escolha outra reserva para receber o dinheiro.');return;}if(destino.id===origem.id){alert('A Reserva de destino precisa ser diferente da origem.');return;}
          obj={kind:'transferencia',origemTipo:'reserva',origemId:origem.id,origemAccountId:null,origemNome:origem.nome,destinoTipo:'reserva',destinoId:destino.id,destinoAccountId:null,destinoNome:destino.nome,reservaAction:'enviar',valor,data,descricao};
        }else if(action==='rendimento'){
          obj={kind:'rendimento_reserva',origemTipo:'reserva',origemId:origem.id,origemAccountId:null,origemNome:origem.nome,destinoTipo:null,destinoId:null,destinoAccountId:null,destinoNome:'Rendimento',reservaAction:'rendimento',valor,data,descricao};
        }else{
          obj={kind:'ajuste_reserva',origemTipo:'reserva',origemId:origem.id,origemAccountId:null,origemNome:origem.nome,destinoTipo:null,destinoId:null,destinoAccountId:null,destinoNome:'Ajuste manual',reservaAction:'ajuste',valor,data,descricao};
        }
      }
      obj.origemBanco=obj.origemTipo==='reserva'?(boxById(obj.origemId)||{}).banco||'':obj.origemNome;
      obj.destinoBanco=obj.destinoTipo==='reserva'?(boxById(obj.destinoId)||{}).banco||'':(obj.destinoNome||'');
      const ok=runAtomicFinancialMutation(()=>{
        if(isEdit)Cards.reverseTransferenciaEffect(t);
        if(obj.origemTipo==='reserva'&&obj.kind!=='rendimento_reserva'&&obj.kind!=='ajuste_reserva'){
          const origem=boxById(obj.origemId);if(!reservaTemSaldo(origem,obj.valor))throw new Error('saldo_reserva_insuficiente');
        }
        let alvo=t;
        if(isEdit){Object.assign(t,obj);delete t.origemMoveId;delete t.destinoMoveId;}
        else{alvo=Object.assign({id:uid(),createdAt:Date.now()},obj);(S.data.transferencias||(S.data.transferencias=[])).push(alvo);}
        if(!Cards.applyTransferenciaEffect(alvo))throw new Error('efeito_transferencia_invalido');
      },err=>{
        if(String(err&&err.message)==='saldo_reserva_insuficiente')showReservaInsuficienteModal(boxById(obj.origemId),obj.valor);
        else alert('Não foi possível salvar a transferência. O estado anterior foi preservado.');
      });
      if(!ok)return;
      saveCurrentData();closeModal();renderView();toast(isEdit?'Transferência atualizada.':'Transferência registrada.');
    };
    if(isEdit)$('#tr_delete').onclick=()=>openConfirmModal({title:'Excluir transferência',text:'A movimentação será desfeita nos dois lados e os saldos voltarão ao estado anterior.',confirmLabel:'Excluir transferência',variant:'danger',onConfirm:()=>{const ok=runAtomicFinancialMutation(()=>{Cards.reverseTransferenciaEffect(t);S.data.transferencias=(S.data.transferencias||[]).filter(x=>x.id!==t.id);},()=>alert('Não foi possível excluir.'));if(!ok)return;saveCurrentData();renderView();toast('Transferência excluída.');}});
  },
  applyTransferenciaEffect(t){
    if(!t)return false;
    if(t.kind==='rendimento_reserva'){
      const bx=(S.data.reservas.boxes||[]).find(r=>r.id===t.origemId);if(!bx)return false;
      const mv={id:uid(),boxId:bx.id,tipo:'Rendimento',data:t.data||todayISO(),valor:Number(t.valor)||0,banco:bx.banco||'',descricao:t.descricao||'Rendimento da reserva',transferenciaId:t.id,createdAt:Date.now()};
      S.data.reservas.moves.push(mv);Reservas.applyMoveEffect(mv);t.origemMoveId=mv.id;return true;
    }
    if(t.kind==='ajuste_reserva'){
      const bx=(S.data.reservas.boxes||[]).find(r=>r.id===t.origemId);if(!bx)return false;
      const before=Number(bx.valorAtual)||0,after=Math.max(0,Number(t.valor)||0);
      const mv={id:uid(),boxId:bx.id,tipo:'Ajuste manual',data:t.data||todayISO(),valor:Math.abs(after-before),saldoAntes:before,saldoDepois:after,banco:bx.banco||'',descricao:t.descricao||'Ajuste manual do saldo',transferenciaId:t.id,createdAt:Date.now()};
      bx.valorAtual=after;if(typeof syncMetaFromReserva==='function')syncMetaFromReserva(bx);S.data.reservas.moves.push(mv);t.origemMoveId=mv.id;return true;
    }
    if(t.origemTipo==='reserva'){
      const bx=(S.data.reservas.boxes||[]).find(r=>r.id===t.origemId);if(!bx)return false;
      const tipo=t.reservaAction==='resgatar'?'Resgatar':'Transferência enviada';
      const mv={id:uid(),boxId:bx.id,tipo,data:t.data||todayISO(),valor:t.valor,banco:bx.banco||'',descricao:t.descricao||('Transferência para '+(t.destinoNome||'')),transferenciaId:t.id,createdAt:Date.now()};
      S.data.reservas.moves.push(mv);Reservas.applyMoveEffect(mv);t.origemMoveId=mv.id;
    }else if(!adjustLiquidez(t.origemAccountId||t.origemId,-t.valor))return false;
    if(t.destinoTipo==='reserva'){
      const bx=(S.data.reservas.boxes||[]).find(r=>r.id===t.destinoId);if(!bx)return false;
      const mv={id:uid(),boxId:bx.id,tipo:'Transferência recebida',data:t.data||todayISO(),valor:t.valor,banco:bx.banco||'',descricao:t.descricao||('Transferência de '+(t.origemNome||'')),transferenciaId:t.id,createdAt:Date.now()};
      S.data.reservas.moves.push(mv);Reservas.applyMoveEffect(mv);t.destinoMoveId=mv.id;
    }else if(t.destinoTipo==='conta'&&!adjustLiquidez(t.destinoAccountId||t.destinoId,t.valor))return false;
    return true;
  },
  reverseTransferenciaEffect(t){
    if(!t)return false;
    if(t.kind==='ajuste_reserva'&&t.origemMoveId){
      const idx=(S.data.reservas.moves||[]).findIndex(m=>m.id===t.origemMoveId);if(idx>=0){const mv=S.data.reservas.moves[idx],bx=(S.data.reservas.boxes||[]).find(r=>r.id===mv.boxId);if(bx){const delta=(Number(mv.saldoDepois)||0)-(Number(mv.saldoAntes)||0);bx.valorAtual=Math.max(0,(Number(bx.valorAtual)||0)-delta);if(typeof syncMetaFromReserva==='function')syncMetaFromReserva(bx);}S.data.reservas.moves.splice(idx,1);}t.origemMoveId=null;return true;
    }
    if(t.origemTipo==='reserva'){
      if(t.origemMoveId){const idx=(S.data.reservas.moves||[]).findIndex(m=>m.id===t.origemMoveId);if(idx>=0){Reservas.reverseMoveEffect(S.data.reservas.moves[idx]);S.data.reservas.moves.splice(idx,1);}t.origemMoveId=null;}
    }else adjustLiquidez(t.origemAccountId||t.origemId,t.valor);
    if(t.destinoTipo==='reserva'){
      if(t.destinoMoveId){const idx=(S.data.reservas.moves||[]).findIndex(m=>m.id===t.destinoMoveId);if(idx>=0){Reservas.reverseMoveEffect(S.data.reservas.moves[idx]);S.data.reservas.moves.splice(idx,1);}t.destinoMoveId=null;}
    }else if(t.destinoTipo==='conta')adjustLiquidez(t.destinoAccountId||t.destinoId,-t.valor);
    return true;
  }
};

/* V5.36.0 — expõe Cards para modais internos que abrem cadastro de banco. */
window.Cards = Cards;
