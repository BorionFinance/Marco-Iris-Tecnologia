/* Borion Finance — Tela Orçamento/Receitas/Despesas, filtros e modais de lançamentos. */

/* ---------------- VIEW: BUDGET ---------------- */
const BUDGET_SUMMARY_CARD_DEFS={
  receita:{label:'RECEITA',colorKey:'receita'}, investir:{label:'INVESTIR',colorKey:'investir'}, despesas:{label:'DESPESAS',colorKey:'despesas'}, saldo:{label:'SALDO',colorKey:'saldo'},
  patrimonio:{label:'PATRIMÔNIO',colorKey:'patrimonio'}, cofrinhos:{label:'COFRINHOS',colorKey:'reserva'}, variacaoCofrinhos:{label:'VARIAÇÃO DOS COFRINHOS',colorKey:'reserva'}, disponivel:{label:'VALOR DISPONÍVEL',colorKey:'saldo'}
};
const DEFAULT_BUDGET_SUMMARY_CARDS=['receita','investir','despesas','saldo'];

/* V6.32.2 — ordenação compacta e persistente por perfil.
   O padrão é sempre Mais recente → mais antigo (↓). Cada aba salva a preferência em
   S.data.uiPreferences, que pertence ao perfil atual e acompanha backup/sincronização. */
const BudgetDateSort={
  validTypes:['receita','fixa','variavel','transferencias'],
  preferenceRoot(create=false){
    if(!S.data) return null;
    if(create && (!S.data.uiPreferences || typeof S.data.uiPreferences!=='object')) S.data.uiPreferences={};
    if(!S.data.uiPreferences) return null;
    if(create && (!S.data.uiPreferences.budgetDateSort || typeof S.data.uiPreferences.budgetDateSort!=='object')) S.data.uiPreferences.budgetDateSort={};
    return S.data.uiPreferences.budgetDateSort||null;
  },
  get(type){
    const root=this.preferenceRoot(false);
    const saved=root&&root[type];
    return saved==='asc'?'asc':'desc';
  },
  toggle(type){
    if(!this.validTypes.includes(type)) return;
    const next=this.get(type)==='desc'?'asc':'desc';
    const root=this.preferenceRoot(true);
    if(root) root[type]=next;
    if(typeof saveCurrentData==='function') saveCurrentData();
    renderView();
  },
  compare(type,aDate,bDate,aCreated=0,bCreated=0){
    const dir=this.get(type)==='asc'?1:-1;
    const byDate=String(aDate||'').localeCompare(String(bDate||''));
    if(byDate) return byDate*dir;
    return (Number(aCreated||0)-Number(bCreated||0))*dir;
  },
  buttonHTML(type){
    const asc=this.get(type)==='asc';
    const label=asc?'Mais antigo → mais recente':'Mais recente → mais antigo';
    return `<button type="button" class="date-sort-toggle" onclick="Budget.toggleDateSort('${type}')" title="${label}" aria-label="Ordenação atual: ${label}. Clique para inverter."><span aria-hidden="true">${asc?'↑':'↓'}</span></button>`;
  }
};
window.BudgetDateSort=BudgetDateSort;

function budgetLinkedCard(entity){
  if(!entity) return null;
  return (S.data.cartoes||[]).find(c=>c.id===entity.viaCartaoId)
    || (entity.viaParcelaId ? (S.data.cartoes||[]).find(c=>(c.parcelas||[]).some(p=>p.id===entity.viaParcelaId)) : null);
}
function budgetExpenseSourceLabel(entity, occurrence=null){
  if(!entity) return 'Origem não informada';
  const card=budgetLinkedCard(entity);
  if(card) return 'Cartão: '+(card.nome||card.banco||'cartão removido');
  if(entity.viaBoletoId){
    const boleto=(S.data.boletos||[]).find(b=>b.id===entity.viaBoletoId);
    return 'Boleto: '+(boleto?(boleto.credor||boleto.descricao||boleto.banco||'boleto'):'boleto removido');
  }
  const origem=(occurrence&&occurrence.origemPagamento)||entity.origemPagamento||((entity.accountId===CARTEIRA_CONTA_ID||entity.formaPagamento==='Dinheiro')?'carteira':'conta');
  if(origem==='reserva'){
    const reservaId=(occurrence&&occurrence.reservaId)||entity.reservaOrigemId;
    const box=findReservaBoxById(reservaId);
    return '◈ Reserva: '+(box?box.nome:'reserva removida');
  }
  const accountId=(occurrence&&occurrence.accountId)||entity.accountId||resolveAccountId((occurrence&&occurrence.banco)||entity.banco,{includeArchived:true});
  const accountName=accountNameSnapshot(accountId,(occurrence&&occurrence.banco)||entity.banco||'conta removida');
  if(accountId===CARTEIRA_CONTA_ID || entity.formaPagamento==='Dinheiro' || normalizeAccountName(accountName)==='carteira') return 'Carteira';
  const forma=entity.formaPagamento && !['Crédito','Boleto','Dinheiro'].includes(entity.formaPagamento) ? ' · '+entity.formaPagamento : '';
  return 'Conta: '+(accountName||'conta removida')+forma;
}
function budgetRevenueDestinationLabel(tx){
  if(!tx) return 'Destino não informado';
  const accountName=accountNameSnapshot(tx.accountId,tx.banco||'conta removida');
  const box=tx.reservaBoxId?findReservaBoxById(tx.reservaBoxId):null;
  const total=Number(tx.valor)||0, reserve=Number(tx.reservaValor)||0;
  if(box && reserve>0){
    if(reserve<total || tx.destinoModo==='Dividir entre conta e reserva') return 'Conta: '+accountName+' + Reserva: '+box.nome;
    return 'Reserva: '+box.nome;
  }
  if(tx.accountId===CARTEIRA_CONTA_ID || normalizeAccountName(accountName)==='carteira') return 'Carteira';
  return 'Conta: '+(accountName||'conta removida');
}
function budgetLaunchNameHTML(name, options={}){
  const local=options.local?`<span class="launch-location-inline">⌂ ${esc(options.local)}</span>`:'';
  const inline=options.inline?`<span class="launch-destination-inline">${esc(options.inline)}</span>`:'';
  const source=options.source?`<div class="launch-source-line">${esc(options.source)}</div>`:'';
  const meta=(options.meta||[]).filter(Boolean).map(x=>`<span class="launch-meta-chip">${esc(x)}</span>`).join('');
  const recurrence=options.recurrence?`<div class="launch-recurrence">${esc(options.recurrence)}</div>`:'';
  return `<div class="launch-name-cell"><div class="launch-name-main"><span class="launch-name-text">${esc(name)}</span>${local}${inline}</div>${source}${recurrence}${meta?`<div class="launch-meta-row">${meta}</div>`:''}</div>`;
}
function budgetSummaryPreferences(){
  if(!S.data.uiPreferences) S.data.uiPreferences={};
  let p=S.data.uiPreferences.budgetSummary;
  if(!p||!Array.isArray(p.order)) p={order:DEFAULT_BUDGET_SUMMARY_CARDS.slice(),visible:DEFAULT_BUDGET_SUMMARY_CARDS.slice()};
  p.order=p.order.filter(k=>BUDGET_SUMMARY_CARD_DEFS[k]); Object.keys(BUDGET_SUMMARY_CARD_DEFS).forEach(k=>{if(!p.order.includes(k))p.order.push(k);});
  if(!Array.isArray(p.visible)) p.visible=DEFAULT_BUDGET_SUMMARY_CARDS.slice();
  p.visible=p.visible.filter(k=>BUDGET_SUMMARY_CARD_DEFS[k]); S.data.uiPreferences.budgetSummary=p; return p;
}
function budgetSummaryValues(rec,inv,desp,saldo){
  const cofrinhos=((S.data.reservas&&S.data.reservas.boxes)||[]).reduce((a,r)=>a+(Number(r.valorAtual)||0),0);
  const contas=(typeof activeAccounts==='function'?activeAccounts():(S.data.contas||[])).reduce((a,c)=>a+(typeof contaSaldoAtual==='function'?contaSaldoAtual(c):(Number(c.saldoInicial)||0)),0);
  const patrimonio=typeof patrimonioLiquido==='function'?Number(patrimonioLiquido())||0:contas+cofrinhos;
  const current=monthKey(S.month.y,S.month.m), rep=(S.data.reservas&&S.data.reservas.monthlyReports||[]).find(r=>r.monthKey===current);
  const moves=((S.data.reservas&&S.data.reservas.moves)||[]).filter(m=>m.data&&m.data.slice(0,7)===current);
  const variacao=rep?Number(rep.variation)||0:moves.reduce((a,m)=>a+(typeof reservaMoveDelta==='function'?reservaMoveDelta(m):0),0);
  return {receita:rec,investir:inv,despesas:desp,saldo,patrimonio,cofrinhos,variacaoCofrinhos:variacao,disponivel:contas};
}
function renderBudgetSummaryCards(rec,inv,desp,saldo){
  const pref=budgetSummaryPreferences(), vals=budgetSummaryValues(rec,inv,desp,saldo);
  const cards=pref.order.filter(k=>pref.visible.includes(k)).map(k=>{ const d=BUDGET_SUMMARY_CARD_DEFS[k], v=vals[k]||0; return `<div class="card"><div class="clabel">${tagBadgeHTML(d.colorKey,d.label)}</div><div class="cval" style="color:${iconColor(d.colorKey)}">${brl(v)}</div>${k==='investir'?'<div style="margin-top:8px;"><button class="adjust-link" onclick="Budget.adjustInvest()">Ajustar ✎</button></div>':''}</div>`; }).join('');
  return `<div class="cards-row budget-summary-cards">${cards||'<div class="empty-note">Todos os cards do resumo estão ocultos. Ative em Configurações → Personalização.</div>'}</div>`;
}

function renderBudget(){
  // V6.1 — aba "Central": consulta unificada de todas as movimentações do perfil (recursos
  // à parte, não toca nas abas Receita/Despesa fixa/Despesa variável já existentes abaixo).
  if(S.budgetTab==='central') return renderCentralLancamentos();
  if(S.budgetTab==='reserva_transferencias') return renderTransferenciasTab();
  // V6.22 — aba "Assinaturas": mesma ideia, view própria, não mexe nas abas já existentes.
  if(S.budgetTab==='assinaturas') return renderAssinaturas();
  const rec = receitaMes(), desp = despesasMes(), inv = investirPlanejado();
  const saldo = saldoMes();
  const tab = S.budgetTab;
  const filt = S.filters[tab];
  const hasDateRange = !!(filt.dataDe && filt.dataAte);
  const hasFilter = !!(filt.busca || filt.categorias.length || hasDateRange);
  let rows='', total=0, segments=[], listLength=0;

  function matchesFilter(nome, categoria){
    if(filt.categorias.length && !filt.categorias.includes(categoria)) return false;
    if(filt.busca && !nome.toLowerCase().includes(filt.busca.toLowerCase())) return false;
    return true;
  }

  let receitaPropriaTotal=0, receitaExtraTotal=0;
  let fixaColLabel = 'Venc.';
  if(tab==='fixa'){
    if(hasDateRange){
      /* V5.37.0 — período pode cobrir vários meses (inclusive anteriores ao mês
         selecionado no topo). Cada despesa fixa ativa em pelo menos um mês do período
         entra uma vez na lista, somando o valor de todas as ocorrências no período. */
      fixaColLabel = 'Ocorr.';
      const months = monthsBetweenISO(filt.dataDe, filt.dataAte);
      const agg = new Map();
      months.forEach(({y,m})=>{
        fixasAtivasNoMes(y,m).forEach(f=>{
          if(!agg.has(f.id)) agg.set(f.id, {f, total:0, ocorrencias:0});
          const e = agg.get(f.id); e.total += Number(f.valor||0); e.ocorrencias += 1;
        });
      });
      const allEntries = Array.from(agg.values());
      const catTotals={};
      allEntries.forEach(e=> catTotals[e.f.categoria]=(catTotals[e.f.categoria]||0)+e.total);
      segments = Object.keys(catTotals).map(k=>({label:k,value:catTotals[k],color:catColor(k)}));
      const list = allEntries.filter(e=>matchesFilter(e.f.nome,e.f.categoria)).sort((a,b)=>{ const ak=(a.f.startMonth||filt.dataDe.slice(0,7))+'-'+pad2(a.f.dia||1), bk=(b.f.startMonth||filt.dataDe.slice(0,7))+'-'+pad2(b.f.dia||1); return BudgetDateSort.compare('fixa',ak,bk,a.f.createdAt,b.f.createdAt); });
      total = list.reduce((a,e)=>a+e.total,0);
      rows = list.map(e=>{
        const nameHTML=budgetLaunchNameHTML(e.f.nome,{source:budgetExpenseSourceLabel(e.f),recurrence:'Recorrente desde '+shortMonthLabel(e.f.startMonth)});
        return `<tr>
          <td>${e.ocorrencias}x</td>
          <td>${nameHTML}</td>
          <td><span class="cat-pill"><span class="dot" style="background:${catColor(e.f.categoria)}"></span>${esc(e.f.categoria)}</span></td>
          <td class="val-neg">- ${brl(e.total)}</td>
          <td class="tbl-actions"><div class="launch-actions"><button onclick="Budget.edit('${e.f.id}')" title="Editar despesa fixa">✎</button></div></td>
        </tr>`;
      }).join('');
      listLength = list.length;
    } else {
      const allActive = fixasAtivasNoMes(S.month.y,S.month.m);
      const catTotals={};
      allActive.forEach(f=> catTotals[f.categoria]=(catTotals[f.categoria]||0)+Number(f.valor||0));
      segments = Object.keys(catTotals).map(k=>({label:k,value:catTotals[k],color:catColor(k)}));
      let list = hasFilter ? allActive.filter(f=>matchesFilter(f.nome,f.categoria)) : allActive.slice();
      list.sort((a,b)=>BudgetDateSort.compare('fixa',monthKey(S.month.y,S.month.m)+'-'+pad2(a.dia||1),monthKey(S.month.y,S.month.m)+'-'+pad2(b.dia||1),a.createdAt,b.createdAt));
      total = sumBy(list,'valor');
      const mesKeyAtual = monthKey(S.month.y,S.month.m);
      rows = list.map(f=>{
        const status = fixaOcorrenciaStatus(f, mesKeyAtual);
        const statusCls = status==='Pago'?'ok':status==='Vencido'?'bad':'neutral';
        const occurrence=fixaOcorrenciaFor(f.id,mesKeyAtual);
        const statusLabel=status==='Pago'?'Pago':(status==='Vencido'?'Em aberto · vencida':'Em aberto');
        const nameHTML=budgetLaunchNameHTML(f.nome,{source:budgetExpenseSourceLabel(f,occurrence),recurrence:'Recorrente desde '+shortMonthLabel(f.startMonth)});
        return `
        <tr>
          <td>Dia ${f.dia||1}</td>
          <td>${nameHTML}</td>
          <td><span class="cat-pill"><span class="dot" style="background:${catColor(f.categoria)}"></span>${esc(f.categoria)}</span></td>
          <td class="val-neg">- ${brl(f.valor)}</td>
          <td><span class="cheque-status ${statusCls}">${statusLabel}</span></td>
          <td class="tbl-actions"><div class="launch-actions"><button onclick="Budget.toggleFixaPago('${f.id}')" title="${status==='Pago'?'Marcar em aberto':'Marcar como paga'}">${status==='Pago'?'↺':'✔'}</button><button onclick="Budget.edit('${f.id}')" title="Editar despesa fixa">✎</button></div></td>
        </tr>`;
      }).join('');
      listLength = list.length;
    }
  } else {
    const source = hasDateRange
      ? S.data.transacoes.filter(t=>t.tipo===tab && bankMatches(t.banco,t.accountId) && t.data>=filt.dataDe && t.data<=filt.dataAte)
      : txInMonth(S.data.transacoes.filter(t=>t.tipo===tab), S.month.y, S.month.m).filter(t=>bankMatches(t.banco,t.accountId));
    const catTotals={};
    source.forEach(t=>catTotals[t.categoria]=(catTotals[t.categoria]||0)+Number(t.valor||0));
    segments = Object.keys(catTotals).map(k=>({label:k,value:catTotals[k],color:catColor(k)}));
    let list = hasFilter ? source.filter(t=>matchesFilter(t.nome,t.categoria)) : source.slice();
    list.sort((a,b)=>BudgetDateSort.compare(tab,a.data,b.data,a.createdAt,b.createdAt));
    total = sumBy(list,'valor');
    if(tab==='receita'){
      list.forEach(t=>{ if(t.origem==null||t.origem==='propria'||t.origem==='rendimento') receitaPropriaTotal+=Number(t.valor)||0; else receitaExtraTotal+=Number(t.valor)||0; });
    }
    rows = list.map(t=>{
      const origemKey = t.origem||'propria';
      const meta=[];
      if(tab==='receita' && origemKey!=='propria') meta.push(txOrigemToLabel(origemKey));
      if(tab==='variavel' && Number(t.parcelaTotal||0)>1 && Number(t.parcelaAtual||0)>0) meta.push('Parcela '+Number(t.parcelaAtual)+'/'+Number(t.parcelaTotal));
      const nameHTML=budgetLaunchNameHTML(t.nome,{
        local:tab==='variavel'?(t.localCompra||t.local||''):'',
        inline:tab==='receita'?budgetRevenueDestinationLabel(t):'',
        source:tab==='variavel'?budgetExpenseSourceLabel(t):'',
        meta
      });
      const status=tab==='variavel'?variavelStatus(t):'';
      const statusCls=status==='Pago'?'ok':'neutral';
      return `
      <tr>
        <td>${t.data.slice(8,10)}/${t.data.slice(5,7)}</td>
        <td>${nameHTML}</td>
        <td><span class="cat-pill"><span class="dot" style="background:${catColor(t.categoria)}"></span>${esc(t.categoria)}</span></td>
        <td class="${tab==='receita'?'val-pos':'val-neg'}">${tab==='receita'?'':'- '}${brl(t.valor)}</td>
        ${tab==='variavel'?`<td><span class="cheque-status ${statusCls}">${status}</span></td>`:''}
        <td class="tbl-actions"><div class="launch-actions">${tab==='variavel'?`<button onclick="Budget.toggleVariavelPago('${t.id}')" title="${status==='Pago'?'Marcar em aberto':'Marcar como pago'}">${status==='Pago'?'↺':'✔'}</button>`:''}<button onclick="Budget.edit('${t.id}')" title="Editar lançamento">✎</button></div></td>
      </tr>`;}).join('');
    listLength = list.length;
  }

  const filterCount = (filt.busca?1:0) + filt.categorias.length + (hasDateRange?1:0);
  const periodoLabel = hasDateRange ? `${filt.dataDe.slice(8,10)}/${filt.dataDe.slice(5,7)}/${filt.dataDe.slice(0,4)} até ${filt.dataAte.slice(8,10)}/${filt.dataAte.slice(5,7)}/${filt.dataAte.slice(0,4)}` : '';

  return `
    ${renderBudgetSummaryCards(rec,inv,desp,saldo)}
    <div class="tabs">
      <button class="tab-btn ${tab==='receita'?'active':''}" onclick="Budget.tab('receita')">Receita</button>
      <button class="tab-btn ${tab==='fixa'?'active':''}" onclick="Budget.tab('fixa')">Despesa fixa</button>
      <button class="tab-btn ${tab==='variavel'?'active':''}" onclick="Budget.tab('variavel')">Despesa variável</button>
      <button class="tab-btn" onclick="Assinaturas.tab()">Assinaturas</button>
      <button class="tab-btn" onclick="Budget.tab('reserva_transferencias')">Transferências</button>
      <button class="tab-btn" onclick="Budget.tab('central')">⌕ Central</button>
    </div>
    <div class="grid2">
      <div class="panel-box">
        <div class="toolbar">
          <div class="toolbar-left">${tab==='receita'?'Receita':tab==='fixa'?'Despesas fixas':'Despesas variáveis'}</div>
          <div class="toolbar-right central-toolbar-actions">
            <button class="btn-outline ${filterCount?'filter-active':''}" onclick="Budget.openFilter()">⌕ Filtro${filterCount?' ('+filterCount+')':''}</button>
            ${BudgetDateSort.buttonHTML(tab)}
            <button class="btn-outline" onclick="Budget.add()">+ Adicionar</button>
          </div>
        </div>
        ${hasDateRange?`<div class="tbl-foot" style="opacity:.85;margin-bottom:6px;"><span>📅 Período: ${periodoLabel}</span><button class="link-btn" style="padding:0;" onclick="Budget.clearPeriodo()">Limpar período</button></div>`:''}
        ${listLength? `
        <table class="budget-launch-table">
          <thead><tr><th>${tab==='fixa'?fixaColLabel:'Data'}</th><th>Nome</th><th>Categoria</th><th>Valor</th>${((tab==='fixa'&&!hasDateRange)||tab==='variavel')?'<th>Status</th>':''}<th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div class="tbl-foot"><span>Total${hasFilter?' filtrado':''}</span><span class="v">${brl(total)}</span></div>
        ${tab==='receita' && receitaExtraTotal>0 ? `
        <div class="tbl-foot" style="opacity:.85;"><span>· Receita própria + rendimento (contam como renda)</span><span class="v">${brl(receitaPropriaTotal)}</span></div>
        <div class="tbl-foot" style="opacity:.85;"><span>· Reembolso/repasse (não conta como renda)</span><span class="v">${brl(receitaExtraTotal)}</span></div>` : ''}
        ` : `<div class="empty-note">Nenhum lançamento encontrado${hasFilter?' com esse filtro':' neste mês'}.</div>`}
      </div>
      <div class="panel-box">
        <div class="panel-title">Composição por categoria</div>
        ${renderDonut(segments)}
      </div>
    </div>
  `;
}

function reservaTransferGroups(){
  const moves=((S.data.reservas&&S.data.reservas.moves)||[]).filter(m=>m&&m.reservaTransferId);
  const groups=new Map();
  moves.forEach(m=>{if(!groups.has(m.reservaTransferId))groups.set(m.reservaTransferId,[]);groups.get(m.reservaTransferId).push(m);});
  return Array.from(groups.entries()).map(([id,pair])=>{
    const saida=pair.find(m=>m.tipo==='Envio para outra reserva')||pair.find(m=>Reservas.NEGATIVE_TYPES.includes(m.tipo));
    const entrada=pair.find(m=>m.tipo==='Recebimento de outra reserva')||pair.find(m=>Reservas.POSITIVE_TYPES.includes(m.tipo));
    const origem=findReservaBoxById(saida&&saida.boxId),destino=findReservaBoxById(entrada&&entrada.boxId);
    return {id,pair,saida,entrada,origem,destino,data:(saida&&saida.data)||(entrada&&entrada.data)||'',valor:Number((saida&&saida.valor)||(entrada&&entrada.valor))||0,descricao:(saida&&saida.descricao)||(entrada&&entrada.descricao)||''};
  }).sort((a,b)=>String(b.data).localeCompare(String(a.data)));
}
function transferenciaFilterKey(t){
  if(!t) return 'outras';
  if(t.kind==='rendimento_reserva'||t.kind==='ajuste_reserva') return 'outras';
  const origem=t.origemTipo||'conta',destino=t.destinoTipo||'conta';
  if(origem==='conta'&&(t.origemAccountId||t.origemId)===CARTEIRA_CONTA_ID&&destino==='conta') return 'carteira_conta';
  if(origem==='conta'&&destino==='conta') return 'conta_conta';
  if(origem==='conta'&&destino==='reserva') return 'conta_reserva';
  if(origem==='reserva'&&destino==='reserva') return 'reserva_reserva';
  if(origem==='reserva'&&destino==='conta') return 'reserva_conta';
  return 'outras';
}
function transferenciaDisplayNames(t){
  if(t.kind==='rendimento_reserva') return {origem:t.origemNome||'Reserva',destino:'Rendimento'};
  if(t.kind==='ajuste_reserva') return {origem:t.origemNome||'Reserva',destino:'Ajuste da própria reserva'};
  return {origem:t.origemNome||accountNameSnapshot(t.origemAccountId||t.origemId)||'Origem',destino:t.destinoNome||accountNameSnapshot(t.destinoAccountId||t.destinoId)||'Destino'};
}
function renderTransferenciasTab(){
  const filter=S.transferFilter||'todos';
  const generic=(S.data.transferencias||[]).slice();
  const legacy=reservaTransferGroups().map(g=>({legacy:true,id:g.id,data:g.data,valor:g.valor,descricao:g.descricao,origemNome:g.origem?g.origem.nome:'Reserva removida',destinoNome:g.destino?g.destino.nome:'Reserva removida',filterKey:'reserva_reserva'}));
  const all=generic.concat(legacy).sort((a,b)=>BudgetDateSort.compare('transferencias',a.data,b.data,a.createdAt,b.createdAt));
  const visible=all.filter(t=>filter==='todos'||(t.filterKey||transferenciaFilterKey(t))===filter);
  const total=visible.reduce((sum,t)=>sum+(Number(t.valor)||0),0);
  const rows=visible.map(t=>{
    const names=t.legacy?{origem:t.origemNome,destino:t.destinoNome}:transferenciaDisplayNames(t);
    const type=t.filterKey||transferenciaFilterKey(t);
    const typeLabel=({carteira_conta:'Carteira → Conta',conta_conta:'Conta → Conta',conta_reserva:'Conta → Reserva',reserva_conta:'Reserva → Conta',reserva_reserva:'Reserva → Reserva',outras:t.kind==='rendimento_reserva'?'Rendimento':t.kind==='ajuste_reserva'?'Ajuste manual':'Movimentação'})[type]||'Movimentação';
    const actions=t.legacy
      ? `<button onclick="Reservas.editTransfer('${t.id}')" title="Editar transferência antiga">✎</button><button onclick="Reservas.deleteTransfer('${t.id}')" title="Excluir">×</button>`
      : `<button onclick="Cards.editTransferencia('${t.id}')" title="Editar transferência">✎</button>`;
    return `<tr><td>${t.data?reservaFmtDate(t.data):'—'}</td><td>${esc(names.origem)}</td><td>→</td><td>${esc(names.destino)}</td><td><span class="cat-pill">${esc(typeLabel)}</span></td><td>${brl(t.valor)}</td><td>${esc(t.descricao||'')}</td><td class="tbl-actions">${actions}</td></tr>`;
  }).join('');
  const filterOptions=[['todos','Todas'],['carteira_conta','Carteira → Conta'],['conta_conta','Conta → Conta'],['conta_reserva','Conta → Reserva'],['reserva_reserva','Reserva → Reserva']];
  return `<div class="cards-row"><div class="card hero-gold"><div class="clabel">VALOR MOVIMENTADO</div><div class="cval">${brl(total)}</div></div><div class="card"><div class="clabel">TRANSFERÊNCIAS</div><div class="cval">${visible.length}</div></div></div>
  <div class="tabs"><button class="tab-btn" onclick="Budget.tab('receita')">Receita</button><button class="tab-btn" onclick="Budget.tab('fixa')">Despesa fixa</button><button class="tab-btn" onclick="Budget.tab('variavel')">Despesa variável</button><button class="tab-btn" onclick="Assinaturas.tab()">Assinaturas</button><button class="tab-btn active">Transferências</button><button class="tab-btn" onclick="Budget.tab('central')">⌕ Central</button></div>
  <div class="panel-box"><div class="toolbar"><div class="toolbar-left">Transferências</div><div class="toolbar-right central-toolbar-actions">${BudgetDateSort.buttonHTML('transferencias')}<select class="order-sort-select" onchange="Budget.setTransferFilter(this.value)">${filterOptions.map(([v,l])=>`<option value="${v}" ${filter===v?'selected':''}>${l}</option>`).join('')}</select><button class="btn-outline" onclick="Cards.addTransferencia()">+ Nova transferência</button></div></div><p class="modal-sub">Movimente dinheiro entre Carteira, Contas e Reservas sem registrar receita ou despesa. As regras de vínculo das Reservas são aplicadas automaticamente.</p>${rows?`<div class="table-scroll"><table><thead><tr><th>Data</th><th>Origem</th><th></th><th>Destino</th><th>Tipo</th><th>Valor</th><th>Descrição</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`:'<div class="empty-note">Nenhuma transferência encontrada neste filtro.</div>'}</div>`;
}
function renderReservaTransfersTab(){ return renderTransferenciasTab(); }

/* =========================================================================================
   V6.1 — "Central" de Lançamentos: consulta unificada de receitas, despesas fixas,
   despesas variáveis, transferências, movimentações de reserva e estornos, com filtros
   completos. Não substitui nem altera as abas Receita/Despesa fixa/Despesa variável já
   existentes acima — é uma visão adicional, só de consulta (os botões de editar continuam
   levando ao formulário de origem de cada tipo, sem duplicar a lógica de edição).
========================================================================================= */
function centralAllCategorias(){
  const set = new Set();
  ['receita','fixa','variavel'].forEach(k=> (S.data.categorias[k]||[]).forEach(c=>set.add(c)));
  return Array.from(set).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}
function centralBuildEntries(){
  const boxesById = {}; ((S.data.reservas&&S.data.reservas.boxes)||[]).forEach(b=>boxesById[b.id]=b);
  const entries = [];
  (S.data.transacoes||[]).filter(t=>t.tipo==='receita').forEach(t=>{
    entries.push({id:'rc_'+t.id, tipo:'receita', data:t.data||'', nome:t.nome||'Receita', categoria:t.categoria||'', valor:Number(t.valor)||0, sinal:1, origem:'', reservaId:null, reservaNome:'', conta:t.banco||'', status:'Pago', descricao:t.nome||'', refType:'transacao', refId:t.id});
  });
  (S.data.transacoes||[]).filter(t=>t.tipo==='variavel').forEach(t=>{
    const isReserva = t.origemPagamento==='reserva';
    const box = isReserva && t.reservaOrigemId ? boxesById[t.reservaOrigemId] : null;
    entries.push({id:'vr_'+t.id, tipo:'variavel', data:t.data||'', nome:t.nome||'Despesa variável', categoria:t.categoria||'', valor:Number(t.valor)||0, sinal:-1, origem:isReserva?'reserva':'conta', reservaId:box?box.id:null, reservaNome:box?box.nome:'', conta:t.banco||'', status:variavelStatus(t), descricao:[t.nome,t.localCompra||t.local].filter(Boolean).join(' · '), refType:'transacao', refId:t.id});
  });
  // Ocorrências de despesa fixa: janela de 24 meses passados + 2 futuros a partir de hoje,
  // mais qualquer ocorrência já registrada em fixaPagamentos fora dessa janela (histórico).
  const janela = new Set(monthsAroundToday(24,2).map(mm=>mm.key));
  (S.data.fixaPagamentos||[]).forEach(r=>janela.add(r.mesKey));
  (S.data.fixas||[]).forEach(f=>{
    janela.forEach(key=>{
      if(!(f.startMonth<=key && (!f.endMonth || key<=f.endMonth))) return;
      const dueDate = key+'-'+pad2(f.dia||1);
      const rec = fixaOcorrenciaFor(f.id, key);
      const status = fixaOcorrenciaStatus(f, key);
      const valor = (rec&&rec.pago) ? (Number(rec.valorPago)||Number(f.valor)||0) : (Number(f.valor)||0);
      const origemUsada = rec ? rec.origemPagamento : (f.origemPagamento||'conta');
      const reservaIdUsada = origemUsada==='reserva' ? (rec?rec.reservaId:f.reservaOrigemId) : null;
      const box = reservaIdUsada ? boxesById[reservaIdUsada] : null;
      entries.push({id:'fx_'+f.id+'_'+key, tipo:'fixa', data:dueDate, nome:f.nome||'Despesa fixa', categoria:f.categoria||'', valor, sinal:-1, origem:origemUsada==='reserva'?'reserva':'conta', reservaId:box?box.id:null, reservaNome:box?box.nome:'', conta:f.banco||'', status, descricao:f.nome||'', refType:'fixa', refId:f.id, mesKey:key});
    });
  });
  (S.data.transferencias||[]).forEach(t=>{
    const envolveReserva = t.origemTipo==='reserva' || t.destinoTipo==='reserva';
    const reservaId = t.origemTipo==='reserva' ? t.origemId : (t.destinoTipo==='reserva' ? t.destinoId : null);
    entries.push({id:'tr_'+t.id, tipo:'transferencia', data:t.data||'', nome:(t.origemNome||t.origemId||'?')+' → '+(t.destinoNome||t.destinoId||'?'), categoria:'', valor:Number(t.valor)||0, sinal:0, origem:envolveReserva?'reserva':'conta', reservaId, reservaNome:reservaId&&boxesById[reservaId]?boxesById[reservaId].nome:'', conta:t.origemTipo==='conta'?t.origemId:(t.destinoTipo==='conta'?t.destinoId:''), status:'Transferido', descricao:t.descricao||'', refType:'transferencia', refId:t.id});
  });
  ((S.data.reservas&&S.data.reservas.moves)||[]).forEach(m=>{
    const box = boxesById[m.boxId];
    const positive = Reservas.POSITIVE_TYPES.includes(m.tipo);
    const negative = Reservas.NEGATIVE_TYPES.includes(m.tipo);
    entries.push({id:'mv_'+m.id, tipo:'reserva_mov', data:m.data||'', nome:m.tipo, categoria:'', valor:Number(m.valor)||0, sinal:positive?1:(negative?-1:0), origem:'reserva', reservaId:m.boxId, reservaNome:box?box.nome:'Reserva removida', conta:m.banco||'', status:'Transferido', descricao:m.descricao||'', refType:'reserva_move', refId:m.id});
  });
  (S.data.estornos||[]).forEach(e=>{
    entries.push({id:'es_'+e.id, tipo:'estorno', data:e.data||'', nome:e.nome||'Estorno', categoria:'', valor:Number(e.valor)||0, sinal:1, origem:'reserva', reservaId:e.reservaId||null, reservaNome:e.reservaNome||'', conta:e.banco||'', status:'Estornado', descricao:e.descricao||'', refType:'estorno', refId:e.refId||e.id});
  });
  return entries;
}
const CENTRAL_TIPO_LABELS = {receita:'Receita', fixa:'Despesa fixa', variavel:'Despesa variável', transferencia:'Transferência', reserva_mov:'Movimentação de reserva', estorno:'Estorno'};
function centralFilterAndSort(){
  const f = S.filters.central;
  let list = centralBuildEntries();
  if(f.tipo==='todos') list = list.filter(e=>e.tipo!=='reserva_mov');
  else if(f.tipo==='reserva') list = list.filter(e=>e.tipo==='reserva_mov');
  else list = list.filter(e=>e.tipo===f.tipo);
  if(f.origem!=='todas') list = list.filter(e=>e.origem===f.origem);
  if(f.reservaId) list = list.filter(e=>e.reservaId===f.reservaId);
  if(f.contaId) list = list.filter(e=>e.conta===f.contaId);
  if(f.status!=='todos') list = list.filter(e=>e.status===f.status);
  if(f.categoria) list = list.filter(e=>e.categoria && e.categoria===f.categoria); // sem categoria nunca é excluído por erro — só fica de fora quando o filtro pede uma categoria específica
  const range = computePeriodoRange(f.periodo, f.dataDe, f.dataAte);
  if(range.de) list = list.filter(e=>e.data && e.data>=range.de);
  if(range.ate) list = list.filter(e=>e.data && e.data<=range.ate);
  const q = (f.busca||'').trim().toLowerCase();
  if(q){
    list = list.filter(e=>{
      const haystack = [e.nome, e.descricao, e.categoria, e.reservaNome, e.conta].filter(Boolean).join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }
  const sortFns = {
    data_desc:(a,b)=>String(b.data).localeCompare(String(a.data)),
    data_asc:(a,b)=>String(a.data).localeCompare(String(b.data)),
    valor_desc:(a,b)=>b.valor-a.valor,
    valor_asc:(a,b)=>a.valor-b.valor,
    alfa:(a,b)=>a.nome.localeCompare(b.nome,'pt-BR')
  };
  list.sort(sortFns[f.sort] || sortFns.data_desc);
  return list;
}
function centralActiveFilterChips(){
  const f = S.filters.central;
  const chips = [];
  if(f.tipo!=='todos') chips.push({key:'tipo', label:'Tipo: '+(CENTRAL_TIPO_LABELS[f.tipo]||f.tipo)});
  if(f.origem!=='todas') chips.push({key:'origem', label:'Origem: '+(f.origem==='reserva'?'Reserva':'Conta')});
  if(f.reservaId){ const bx=findReservaBoxById(f.reservaId); chips.push({key:'reservaId', label:'Reserva: '+(bx?bx.nome:'—')}); }
  if(f.contaId) chips.push({key:'contaId', label:'Conta: '+f.contaId});
  if(f.status!=='todos') chips.push({key:'status', label:'Status: '+f.status});
  if(f.categoria) chips.push({key:'categoria', label:'Categoria: '+f.categoria});
  if(f.periodo!=='todos'){ const opt=PERIODO_QUICK_OPTIONS.find(o=>o.v===f.periodo); chips.push({key:'periodo', label:'Período: '+(opt?opt.l:f.periodo)}); }
  if(f.busca) chips.push({key:'busca', label:'Busca: "'+f.busca+'"'});
  return chips;
}
function renderCentralLancamentos(){
  const all = centralFilterAndSort();
  const pageSize = S.centralPageSize||30;
  const list = all.slice(0, pageSize);
  const chips = centralActiveFilterChips();
  // V6.1 — totais do filtro: transferências internas nunca somam como receita nem despesa
  // no resultado líquido (só aparecem no total "transferido" separado).
  let entradas=0, saidas=0, transferido=0;
  all.forEach(e=>{
    if(e.tipo==='transferencia') transferido += e.valor;
    else if(e.tipo==='receita') entradas += e.valor;
    else if((e.tipo==='fixa'||e.tipo==='variavel') && e.status==='Pago') saidas += e.valor;
  });
  const liquido = entradas - saidas;
  const categoriaOptions = centralAllCategorias();
  const reservaOptions = ((S.data.reservas&&S.data.reservas.boxes)||[]).filter(r=>bankMatches(r.banco));
  const contaOptions = allBankNames();
  const rows = list.map(e=>{
    const positive = e.sinal>0, negative = e.sinal<0;
    const statusCls = e.status==='Pago'?'ok':e.status==='Vencido'?'bad':e.status==='Estornado'?'warn':'neutral';
    const origemPill = e.origem ? ` <span class="cat-pill" style="opacity:.85;"><span class="dot" style="background:var(--gold-bright)"></span>${e.origem==='reserva'?'◈ Reserva'+(e.reservaNome?': '+esc(e.reservaNome):''):'Conta'}</span>` : '';
    const contaLabel = accountNameSnapshot(e.conta, e.conta||'') || '—';
    return `<tr>
      <td>${e.data?reservaFmtDate(e.data):'—'}</td>
      <td>${CENTRAL_TIPO_LABELS[e.tipo]||e.tipo}</td>
      <td>${esc(e.nome)}${origemPill}</td>
      <td>${e.categoria?esc(e.categoria):''}</td>
      <td class="${positive?'val-pos':negative?'val-neg':''}">${positive?'+ ':negative?'- ':''}${brl(e.valor)}</td>
      <td>${esc(contaLabel)}</td>
      <td><span class="cheque-status ${statusCls}">${e.status}</span></td>
      <td class="tbl-actions">${centralOpenButtonHTML(e)}</td>
    </tr>`;
  }).join('');
  const mobileRows = list.map(e=>{
    const positive = e.sinal>0, negative = e.sinal<0;
    const statusCls = e.status==='Pago'?'ok':e.status==='Vencido'?'bad':e.status==='Estornado'?'warn':'neutral';
    const contaLabel = accountNameSnapshot(e.conta, e.conta||'') || '—';
    const categoria = e.categoria ? `<span class="cat-pill"><span class="dot" style="background:${catColor(e.categoria)}"></span>${esc(e.categoria)}</span>` : `<span class="cat-pill"><span class="dot" style="background:rgba(148,163,184,.65)"></span>Sem categoria</span>`;
    const origem = e.origem ? `<span class="cat-pill" style="opacity:.85;"><span class="dot" style="background:var(--gold-bright)"></span>${e.origem==='reserva' ? '◈ Reserva'+(e.reservaNome?': '+esc(e.reservaNome):'') : 'Conta'}</span>` : '';
    return `<div class="central-mobile-row">
      <div class="central-mobile-head">
        <span class="central-mobile-type">${CENTRAL_TIPO_LABELS[e.tipo]||e.tipo}</span>
        <span class="cheque-status ${statusCls}">${e.status}</span>
      </div>
      <div class="central-mobile-title">${esc(e.nome||'Movimentação')}</div>
      <div class="central-mobile-tags">${categoria}${origem}</div>
      <div class="central-mobile-grid">
        <div><small>Data</small><strong>${e.data?reservaFmtDate(e.data):'—'}</strong></div>
        <div><small>Valor</small><strong class="${positive?'val-pos':negative?'val-neg':''}">${positive?'+ ':negative?'- ':''}${brl(e.valor)}</strong></div>
        <div><small>Conta/Banco</small><strong>${esc(contaLabel)}</strong></div>
      </div>
      <div class="central-mobile-actions">${centralOpenButtonHTML(e)}</div>
    </div>`;
  }).join('');
  return `
    <div class="cards-row">
      <div class="card"><div class="clabel">Entradas (filtro)</div><div class="cval val-pos">${brl(entradas)}</div></div>
      <div class="card"><div class="clabel">Saídas (filtro)</div><div class="cval">${brl(saidas)}</div></div>
      <div class="card"><div class="clabel">Transferências internas</div><div class="cval">${brl(transferido)}</div></div>
      <div class="card"><div class="clabel">Resultado líquido</div><div class="cval" style="color:${liquido>=0?'var(--green)':'#ef4444'}">${brl(liquido)}</div></div>
    </div>
    <div class="tabs">
      <button class="tab-btn" onclick="Budget.tab('receita')">Receita</button>
      <button class="tab-btn" onclick="Budget.tab('fixa')">Despesa fixa</button>
      <button class="tab-btn" onclick="Budget.tab('variavel')">Despesa variável</button>
      <button class="tab-btn" onclick="Assinaturas.tab()">Assinaturas</button>
      <button class="tab-btn" onclick="Budget.tab('reserva_transferencias')">Transferências</button>
      <button class="tab-btn active">⌕ Central</button>
    </div>
    <div class="panel-box">
      <div class="toolbar">
        <div class="toolbar-left">Central de lançamentos${chips.length?' — '+chips.length+' filtro'+(chips.length>1?'s':'')+' ativo'+(chips.length>1?'s':''):''}</div>
        <div class="toolbar-right central-toolbar-actions">
          <button class="btn-outline ${chips.length?'filter-active':''}" onclick="Budget.centralOpenFilters()">⌕ Filtros${chips.length?' ('+chips.length+')':''}</button>
          <select id="cnt_sort" class="btn-outline" style="padding:9px 10px;" onchange="Budget.centralSetSort(this.value)">
            ${[['data_desc','Data mais recente'],['data_asc','Data mais antiga'],['valor_desc','Maior valor'],['valor_asc','Menor valor'],['alfa','Ordem alfabética']].map(([v,l])=>`<option value="${v}" ${S.filters.central.sort===v?'selected':''}>${l}</option>`).join('')}
          </select>
          <button class="btn-outline" onclick="Budget.centralClear()">Limpar filtros</button>
        </div>
      </div>
      ${chips.length?`<div class="active-filter-chips">${chips.map(c=>`<span class="active-filter-chip">${esc(c.label)}<button onclick="Budget.centralRemoveChip('${c.key}')">&times;</button></span>`).join('')}</div>`:''}
      ${list.length?`
      ${isSmartphoneMode()
        ? `<div class="central-mobile-list">${mobileRows}</div>`
        : `<div class="table-scroll"><table>
            <thead><tr><th>Data</th><th>Tipo</th><th>Nome</th><th>Categoria</th><th>Valor</th><th>Conta/Banco</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows}</tbody>
          </table></div>`}
      <div class="tbl-foot"><span>Mostrando ${list.length} de ${all.length}</span>${all.length>list.length?`<button class="link-btn" onclick="Budget.centralLoadMore()">Carregar mais</button>`:''}</div>
      ` : `<div class="empty-note">Nenhuma movimentação encontrada com esse filtro.</div>`}
    </div>
  `;
}
function centralOpenButtonHTML(e){
  if(e.refType==='fixa') return `<button onclick="Budget.tab('fixa');setTimeout(()=>Budget.edit('${e.refId}'),0)">✎</button>`;
  if(e.refType==='transacao') return `<button onclick="Budget.tab('${e.tipo}');setTimeout(()=>Budget.edit('${e.refId}'),0)">✎</button>`;
  if(e.refType==='reserva_move') return `<button onclick="Reservas.editMove('${e.refId}')">✎</button>`;
  if(e.refType==='transferencia') return `<button onclick="S.view='cards';renderApp();">✎</button>`;
  return '';
}
function openCentralFilterModal(){
  const f = S.filters.central;
  const categoriaOptions = centralAllCategorias();
  const reservaOptions = ((S.data.reservas&&S.data.reservas.boxes)||[]).filter(r=>bankMatches(r.banco));
  const contaOptions = allBankNames();
  const box = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h2>Filtros — Central de lançamentos</h2><button id="cf_close">&times;</button></div>
        <div class="field"><label>Tipo de movimentação</label><select id="cf_tipo">
          <option value="todos" ${f.tipo==='todos'?'selected':''}>Todos</option>
          <option value="receita" ${f.tipo==='receita'?'selected':''}>Receitas</option>
          <option value="fixa" ${f.tipo==='fixa'?'selected':''}>Despesas fixas</option>
          <option value="variavel" ${f.tipo==='variavel'?'selected':''}>Despesas variáveis</option>
          <option value="transferencia" ${f.tipo==='transferencia'?'selected':''}>Transferências</option>
          <option value="reserva" ${f.tipo==='reserva'?'selected':''}>Movimentações de reservas</option>
          <option value="estorno" ${f.tipo==='estorno'?'selected':''}>Estornos</option>
        </select></div>
        <div class="field"><label>Origem do pagamento</label><select id="cf_origem">
          <option value="todas" ${f.origem==='todas'?'selected':''}>Todas</option>
          <option value="conta" ${f.origem==='conta'?'selected':''}>Conta bancária / carteira</option>
          <option value="reserva" ${f.origem==='reserva'?'selected':''}>Reserva / cofrinho</option>
        </select></div>
        <div class="field"><label>Reserva</label><select id="cf_reserva">
          <option value="">Todas as reservas</option>
          ${reservaOptions.map(r=>`<option value="${r.id}" ${f.reservaId===r.id?'selected':''}>${esc(r.nome)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Conta</label><select id="cf_conta">
          <option value="">Todas as contas</option>
          ${contaOptions.map(c=>`<option value="${esc(c)}" ${f.contaId===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Status</label><select id="cf_status">
          <option value="todos" ${f.status==='todos'?'selected':''}>Todos</option>
          <option value="Pago" ${f.status==='Pago'?'selected':''}>Pago</option>
          <option value="Pendente" ${f.status==='Pendente'?'selected':''}>Pendente</option>
          <option value="Em aberto" ${f.status==='Em aberto'?'selected':''}>Em aberto</option>
          <option value="Vencido" ${f.status==='Vencido'?'selected':''}>Vencido</option>
          <option value="Estornado" ${f.status==='Estornado'?'selected':''}>Estornado</option>
          <option value="Transferido" ${f.status==='Transferido'?'selected':''}>Transferido</option>
        </select></div>
        <div class="field"><label>Categoria</label><select id="cf_categoria">
          <option value="">Todas as categorias</option>
          ${categoriaOptions.map(c=>`<option value="${esc(c)}" ${f.categoria===c?'selected':''}>${esc(c)}</option>`).join('')}
        </select></div>
        <div class="field"><label>Período</label><select id="cf_periodo">${PERIODO_QUICK_OPTIONS.map(o=>`<option value="${o.v}" ${f.periodo===o.v?'selected':''}>${o.l}</option>`).join('')}</select></div>
        <div id="cf_custom_wrap" class="${f.periodo==='personalizado'?'':'hidden'}" style="display:flex;gap:8px;">
          <div class="field" style="flex:1;"><label>De</label><input type="date" id="cf_de" value="${esc(f.dataDe||'')}"/></div>
          <div class="field" style="flex:1;"><label>Até</label><input type="date" id="cf_ate" value="${esc(f.dataAte||'')}"/></div>
        </div>
        <div class="field"><label>Buscar</label><input type="text" id="cf_busca" value="${esc(f.busca||'')}" placeholder="Nome, descrição, categoria, reserva, conta..."/></div>
        <div class="row-btns">
          <button class="btn btn-secondary" id="cf_limpar" style="flex:1;">Limpar</button>
          <button class="btn btn-primary" id="cf_aplicar" style="flex:1;">Aplicar</button>
        </div>
      </div>
    </div>`);
  $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box);
  attachModalGuard(box);
  $('#cf_close').onclick = closeModal;
  $('#cf_periodo').onchange = ()=> $('#cf_custom_wrap').classList.toggle('hidden', $('#cf_periodo').value!=='personalizado');
  $('#cf_limpar').onclick = ()=>{
    S.filters.central = {tipo:'todos', origem:'todas', reservaId:'', contaId:'', periodo:'todos', dataDe:'', dataAte:'', status:'todos', categoria:'', busca:'', sort:S.filters.central.sort};
    S.centralPageSize = 30;
    closeModal(); renderView();
  };
  $('#cf_aplicar').onclick = ()=>{
    const dataDe = $('#cf_de').value||'', dataAte = $('#cf_ate').value||'';
    if($('#cf_periodo').value==='personalizado' && dataDe && dataAte && dataDe>dataAte){ alert('A data "de" não pode ser depois da data "até".'); return; }
    S.filters.central = Object.assign({}, S.filters.central, {
      tipo:$('#cf_tipo').value, origem:$('#cf_origem').value, reservaId:$('#cf_reserva').value,
      contaId:$('#cf_conta').value, status:$('#cf_status').value, categoria:$('#cf_categoria').value,
      periodo:$('#cf_periodo').value, dataDe, dataAte, busca:$('#cf_busca').value.trim()
    });
    S.centralPageSize = 30;
    closeModal(); renderView();
  };
}

const Budget = {
  tab(t){ S.budgetTab=t; renderView(); },
  setTransferFilter(value){ S.transferFilter=value||'todos'; renderView(); },
  toggleDateSort(type){ BudgetDateSort.toggle(type); },
  add(){
    if(S.budgetTab==='fixa') openFixaModal(null);
    else openTransactionModal({type:S.budgetTab});
  },
  edit(id){
    if(S.budgetTab==='fixa'){
      const f = S.data.fixas.find(x=>x.id===id);
      /* V5.39.0 — despesa fixa espelhada de uma compra no cartão: edita/remove pela
         compra no cartão, pra nunca dessincronizar os dois lados do vínculo. */
      if(f && f.viaParcelaId){
        const cartao=(S.data.cartoes||[]).find(c=>c.id===f.viaCartaoId)||(S.data.cartoes||[]).find(c=>(c.parcelas||[]).some(p=>p.id===f.viaParcelaId));
        const parcela=cartao&&(cartao.parcelas||[]).find(p=>p.id===f.viaParcelaId);
        if(cartao&&parcela&&window.Cards&&typeof Cards.editParcela==='function'){
          Cards.editParcela(cartao.id,parcela.id);
          return;
        }
        toast('A compra vinculada ao cartão não foi encontrada.');
        return;
      }
      if(f && f.viaBoletoId){
        toast('Essa despesa fixa vem de um boleto — edite ou remova em Cartões e Contas.');
        return;
      }
      openFixaModal(f);
    } else {
      const t = S.data.transacoes.find(x=>x.id===id);
      if(t && t.viaParcelaId){
        const cartao=(S.data.cartoes||[]).find(c=>c.id===t.viaCartaoId)||(S.data.cartoes||[]).find(c=>(c.parcelas||[]).some(p=>p.id===t.viaParcelaId));
        const parcela=cartao&&(cartao.parcelas||[]).find(p=>p.id===t.viaParcelaId);
        if(cartao&&parcela&&window.Cards&&typeof Cards.editParcela==='function'){
          Cards.editParcela(cartao.id,parcela.id);
          return;
        }
        toast('A compra vinculada ao cartão não foi encontrada.');
        return;
      }
      if(t && t.viaBoletoId){
        toast('Essa despesa vem de um boleto — edite ou remova em Cartões e Contas.');
        return;
      }
      openTransactionModal({type:t.tipo, existing:t});
    }
  },
  /* V6.27.3 — define explicitamente Pago ou Em aberto usando um único estado mensal.
     A mesma função é chamada tanto em Lançamentos quanto em Cartões e Contas. */
  setFixaStatus(fixaId, requestedStatus){
    const f=(S.data.fixas||[]).find(x=>x.id===fixaId);
    if(!f)return;
    const mesKey=monthKey(S.month.y,S.month.m);
    const atual=fixaOcorrenciaStatus(f,mesKey)==='Pago'?'Pago':'Em aberto';
    const alvo=requestedStatus==='Pago'?'Pago':'Em aberto';
    if(atual===alvo){toast(alvo==='Pago'?'Esta despesa já está paga.':'Esta despesa já está em aberto.');return;}

    if(f.viaParcelaId){
      const cartao=(S.data.cartoes||[]).find(c=>c.id===f.viaCartaoId);
      const parcela=cartao&&(cartao.parcelas||[]).find(p=>p.id===f.viaParcelaId);
      if(!cartao||!parcela){toast('A compra vinculada ao cartão não foi encontrada.');return;}
      if(alvo==='Em aberto'&&isFaturaPaga(cartao.id,mesKey)){
        toast('Esta despesa está paga porque a fatura inteira foi paga. Desfaça o pagamento da fatura em Cartões e Contas para reabrir.');
        return;
      }
      if(!setParcelaCompetenciaPagoManual(cartao.id,parcela.id,mesKey,alvo==='Pago')){toast('Não foi possível atualizar a parcela vinculada.');return;}
      saveCurrentData();renderView();toast(alvo==='Pago'?'Despesa fixa marcada como paga no cartão e em Lançamentos.':'Despesa fixa voltou para em aberto no cartão e em Lançamentos.');
      return;
    }

    if(f.viaBoletoId){
      const b=(S.data.boletos||[]).find(x=>x.id===f.viaBoletoId);
      if(!b){toast('O boleto vinculado não foi encontrado.');return;}
      const info=boletoParcelaDoMes(b.id,S.month.y,S.month.m);
      if(alvo==='Pago'){
        if(info.paga){saveCurrentData();renderView();return;}
        if(window.Cards&&typeof Cards.payBoletoParcela==='function') Cards.payBoletoParcela(b.id,mesKey);
      }else if(info.pagamento&&window.Cards&&typeof Cards.undoBoletoPagamento==='function'){
        Cards.undoBoletoPagamento(b.id,info.pagamento.id);
      }else{
        /* Compatibilidade com ocorrência antiga paga diretamente antes do vínculo completo. */
        undoFixaOcorrencia(f,mesKey);
      }
      return;
    }

    if(alvo==='Pago') payFixaOcorrencia(f,mesKey);
    else undoFixaOcorrencia(f,mesKey);
  },
  toggleFixaPago(fixaId){
    const f=(S.data.fixas||[]).find(x=>x.id===fixaId);
    if(!f)return;
    const atual=fixaOcorrenciaStatus(f,monthKey(S.month.y,S.month.m))==='Pago'?'Pago':'Em aberto';
    Budget.setFixaStatus(fixaId,atual==='Pago'?'Em aberto':'Pago');
  },

  setVariavelPago(id, requestedStatus){
    const tx=(S.data.transacoes||[]).find(t=>t.id===id&&t.tipo==='variavel');
    if(!tx)return;
    const alvo=requestedStatus==='Pago'?'Pago':'Em aberto';
    const atual=variavelStatus(tx);
    if(atual===alvo){toast(alvo==='Pago'?'Esta despesa já está paga.':'Esta despesa já está em aberto.');return;}

    /* Boleto usa o pagamento real da parcela como fonte de verdade. A baixa/estorno do
       boleto também atualiza este lançamento, evitando dois saldos independentes. */
    if(tx.viaBoletoId){
      const b=(S.data.boletos||[]).find(x=>x.id===tx.viaBoletoId);
      if(!b){toast('O boleto vinculado não foi encontrado.');return;}
      const competencia=String(tx.data||'').slice(0,7)||monthKey(S.month.y,S.month.m);
      const parts=competencia.split('-').map(Number);
      const info=boletoParcelaDoMes(b.id,parts[0]||S.month.y,(parts[1]||S.month.m+1)-1);
      if(alvo==='Pago'){
        if(info.paga){tx.statusPagamento='Pago';saveCurrentData();renderView();return;}
        if(window.Cards&&typeof Cards.payBoletoParcela==='function') Cards.payBoletoParcela(b.id,competencia);
      }else if(info.pagamento&&window.Cards&&typeof Cards.undoBoletoPagamento==='function'){
        Cards.undoBoletoPagamento(b.id,info.pagamento.id);
      }else{
        tx.statusPagamento='Em aberto';saveCurrentData();renderView();toast('Despesa voltou para em aberto em Boletos e em Lançamentos.');
      }
      return;
    }

    /* Compra no cartão pode ter status individual, mas não pode ficar em aberto enquanto
       a fatura inteira da competência estiver paga. */
    if(tx.viaParcelaId){
      const card=(S.data.cartoes||[]).find(c=>c.id===tx.viaCartaoId);
      const competencia=String(tx.data||'').slice(0,7)||monthKey(S.month.y,S.month.m);
      if(alvo==='Em aberto'&&card&&isFaturaPaga(card.id,competencia)){
        toast('Esta despesa está paga porque a fatura inteira foi paga. Desfaça o pagamento da fatura em Cartões e Contas para reabrir.');
        return;
      }
    }

    const ok=runAtomicFinancialMutation(()=>{if(!setVariavelStatus(tx,alvo))throw new Error('status_nao_alterado');},()=>{});
    if(!ok)return;
    saveCurrentData();renderView();toast(alvo==='Pago'?'Despesa marcada como paga.':'Despesa voltou para em aberto.');
  },
  toggleVariavelPago(id){
    const tx=(S.data.transacoes||[]).find(t=>t.id===id&&t.tipo==='variavel');
    if(!tx)return;
    Budget.setVariavelPago(id,variavelStatus(tx)==='Pago'?'Em aberto':'Pago');
  },

  adjustInvest(){
    const key = monthKey(S.month.y,S.month.m);
    const rec = receitaMes();
    const current = S.data.investirPlanejado[key]||0;
    const currentPct = rec>0 ? Math.min(100, Math.round(current/rec*100)) : 0;
    const box = el(`
      <div class="modal-overlay">
        <div class="modal-box">
          <div class="modal-head"><h2>Ajustar valor a investir</h2><button id="ai_close">&times;</button></div>
          <p class="modal-sub">Quanto você planeja investir em ${monthLabel(S.month.y,S.month.m)}? Arraste a barra como porcentagem da receita do mês (${brl(rec)}), ou digite o valor direto.</p>
          <div class="field">
            <label>Porcentagem da receita: <span id="ai_pct_label" style="color:var(--gold);font-weight:700;">${currentPct}%</span></label>
            <input type="range" id="ai_slider" min="0" max="100" step="1" value="${currentPct}" style="width:100%;"/>
          </div>
          <div class="field"><label>Valor (R$)</label><input type="text" inputmode="numeric" class="money-input" id="ai_valor" placeholder="0,00"/></div>
          <div class="row-btns"><button class="btn btn-primary btn-block" id="ai_save">Salvar</button></div>
        </div>
      </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box);
    attachModalGuard(box);
    $('#ai_close').onclick = closeModal;
    attachMoneyMask($('#ai_valor'), current);
    const slider = $('#ai_slider'), pctLabel = $('#ai_pct_label'), valorInput = $('#ai_valor');
    slider.oninput = ()=>{
      const p = Number(slider.value);
      pctLabel.textContent = p+'%';
      const cents = Math.round(rec * p/100 * 100);
      valorInput.dataset.cents = String(cents);
      valorInput.value = (cents/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
    };
    valorInput.addEventListener('input', ()=>{
      const cents = parseInt(valorInput.dataset.cents||'0',10);
      const valor = cents/100;
      const p = rec>0 ? Math.min(100, Math.round(valor/rec*100)) : 0;
      slider.value = String(p);
      pctLabel.textContent = p+'%';
    });
    $('#ai_save').onclick = ()=>{
      const cents = parseInt(valorInput.dataset.cents||'0',10);
      S.data.investirPlanejado[key]=cents/100;
      saveCurrentData(); closeModal(); renderView();
    };
  },
  openFilter(){ openFilterModal(S.budgetTab); },
  /* ---- V6.1 — Central de lançamentos: filtros, ordenação, paginação ---- */
  centralOpenFilters(){ openCentralFilterModal(); },
  centralSetSort(v){ S.filters.central.sort = v; renderView(); },
  centralClear(){
    S.filters.central = {tipo:'todos', origem:'todas', reservaId:'', contaId:'', periodo:'todos', dataDe:'', dataAte:'', status:'todos', categoria:'', busca:'', sort:S.filters.central.sort};
    S.centralPageSize = 30;
    renderView();
  },
  centralRemoveChip(key){
    const reset = {tipo:'todos', origem:'todas', reservaId:'', contaId:'', status:'todos', categoria:'', busca:''};
    if(key==='periodo'){ S.filters.central.periodo='todos'; S.filters.central.dataDe=''; S.filters.central.dataAte=''; }
    else if(key in reset) S.filters.central[key] = reset[key];
    renderView();
  },
  centralLoadMore(){ S.centralPageSize = (S.centralPageSize||30) + 30; renderView(); },
  clearPeriodo(){
    const tab = S.budgetTab;
    S.filters[tab] = Object.assign({}, S.filters[tab], {dataDe:'', dataAte:''});
    renderView();
  }
};

/* ---- modal de filtro: busca por nome + categorias (multi-seleção) + período (data de/até) ---- */
function openFilterModal(tab){
  const cats = S.data.categorias[tab];
  const current = S.filters[tab];
  const selected = new Set(current.categorias);
  const chipsHTML = cats.map(c=>`<button type="button" class="filter-chip-btn ${selected.has(c)?'active':''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
  const box = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h2>Filtrar</h2><button id="flt_close">&times;</button></div>
        <p class="modal-sub">Escolha as categorias, busque pelo nome e/ou filtre por período — o período pode incluir meses anteriores, sem depender do mês selecionado no topo.</p>
        <div class="field"><label>Buscar</label><input type="text" id="flt_busca" placeholder="Buscar por nome..." value="${esc(current.busca||'')}"/></div>
        <div class="field"><label>Categorias</label><div class="filter-chip-row" id="flt_chips">${chipsHTML}</div></div>
        <div class="field"><label>Período — de</label><input type="date" id="flt_data_de" value="${esc(current.dataDe||'')}"/></div>
        <div class="field"><label>Período — até</label><input type="date" id="flt_data_ate" value="${esc(current.dataAte||'')}"/></div>
        <div class="row-btns">
          <button class="btn btn-secondary" id="flt_limpar" style="flex:1;">Limpar</button>
          <button class="btn btn-secondary" id="flt_cancelar" style="flex:1;">Cancelar</button>
          <button class="btn btn-primary" id="flt_aplicar" style="flex:1;">Aplicar</button>
        </div>
      </div>
    </div>`);
  $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box);
  attachModalGuard(box);
  $('#flt_close').onclick = closeModal;
  $('#flt_cancelar').onclick = closeModal;
  box.querySelectorAll('.filter-chip-btn').forEach(btn=>{
    btn.onclick = ()=>{
      const c = btn.dataset.cat;
      if(selected.has(c)){ selected.delete(c); btn.classList.remove('active'); }
      else { selected.add(c); btn.classList.add('active'); }
    };
  });
  $('#flt_limpar').onclick = ()=>{
    S.filters[tab] = {busca:'', categorias:[], dataDe:'', dataAte:'', dateSort:BudgetDateSort.get(tab)};
    closeModal(); renderView();
  };
  $('#flt_aplicar').onclick = ()=>{
    const dataDe = $('#flt_data_de').value || '';
    const dataAte = $('#flt_data_ate').value || '';
    if(dataDe && dataAte && dataDe>dataAte){ alert('A data "de" não pode ser depois da data "até".'); return; }
    S.filters[tab] = { busca: $('#flt_busca').value.trim(), categorias: Array.from(selected), dataDe, dataAte, dateSort:BudgetDateSort.get(tab) };
    closeModal(); renderView();
  };
}

/* ---- dedicated modal: one-off transaction (receita / despesa variável) ---- */
function reservaBoxesForLancamento(){
  return reservasEnabled() ? ((S.data.reservas && S.data.reservas.boxes)||[]).filter(r=>bankMatches(r.banco)) : [];
}
function reservaBoxLabel(r){ return `${r.nome}${r.banco?' · '+r.banco:''}`; }
function findReservaBoxByLabel(label){
  const boxes = reservaBoxesForLancamento();
  return boxes.find(r=>reservaBoxLabel(r)===label) || boxes[0] || null;
}
function removeLinkedReservaMoveFromTransaction(tx){
  if(!tx || !tx.reservaMoveId || !S.data.reservas) return;
  const idx = (S.data.reservas.moves||[]).findIndex(m=>m.id===tx.reservaMoveId);
  if(idx>=0){
    const mv = S.data.reservas.moves[idx];
    const bx = (S.data.reservas.boxes||[]).find(r=>r.id===mv.boxId);
    if(bx){ bx.valorAtual = Math.max(0, Number(bx.valorAtual||0) - Number(mv.valor||0)); if(typeof syncMetaFromReserva==='function') syncMetaFromReserva(bx); }
    S.data.reservas.moves.splice(idx,1);
  }
  delete tx.reservaMoveId;
  delete tx.reservaBoxId;
  delete tx.reservaValor;
  delete tx.destinoReserva;
}
function createLinkedReservaMoveFromTransaction(tx, reservaBox, reservaValor){
  if(!tx || !reservaBox || !S.data.reservas) return;
  const valor = Number(reservaValor)||0;
  if(valor<=0) return;
  const mv = {
    id:uid(), boxId:reservaBox.id, tipo:'Receita direta', data:tx.data||todayISO(), valor,
    banco:reservaBox.banco||tx.banco||'', descricao:'Receita enviada direto para reserva: '+(tx.nome||'Sem nome'),
    origem:'receita', transacaoId:tx.id, createdAt:Date.now()
  };
  reservaBox.valorAtual = Number(reservaBox.valorAtual||0) + valor;
  if(typeof syncMetaFromReserva==='function') syncMetaFromReserva(reservaBox);
  S.data.reservas.moves.push(mv);
  tx.reservaMoveId = mv.id;
  tx.reservaBoxId = reservaBox.id;
  tx.reservaValor = valor;
  tx.destinoReserva = true;
}

/* ---------------- V6.0 — despesa variável paga direto de uma reserva ----------------
   Núcleo da nova arquitetura financeira: retirar dinheiro de uma reserva para pagar uma
   despesa NUNCA mais precisa passar por uma Receita. O usuário só escolhe "Origem do
   pagamento: Reserva" e o Borion, num único clique, desconta o valor da reserva e cria a
   despesa — ligadas uma à outra por reservaOrigemMoveId/despesaTransacaoId, no mesmo
   padrão já usado para "Receita direta". Espelha removeLinkedReservaMoveFromTransaction /
   createLinkedReservaMoveFromTransaction (acima), só que na direção contrária (saída). */
function removeLinkedReservaWithdrawalFromDespesa(tx){
  if(!tx || !tx.reservaOrigemMoveId || !S.data.reservas) return;
  const idx = (S.data.reservas.moves||[]).findIndex(m=>m.id===tx.reservaOrigemMoveId);
  if(idx>=0){
    const mv = S.data.reservas.moves[idx];
    Reservas.reverseMoveEffect(mv);
    S.data.reservas.moves.splice(idx,1);
  }
  tx.reservaOrigemId = null;
  tx.reservaOrigemMoveId = null;
}
function createLinkedReservaWithdrawalFromDespesa(tx, reservaBox, valor){
  if(!tx || !reservaBox || !S.data.reservas) return;
  const v = Number(valor)||0;
  if(v<=0) return;
  const mv = {
    id:uid(), boxId:reservaBox.id, tipo:'Pagamento direto', data:tx.data||todayISO(), valor:v,
    banco:reservaBox.banco||'', descricao:'Pagamento direto: '+(tx.nome||'Despesa'),
    despesaTransacaoId:tx.id, createdAt:Date.now()
  };
  S.data.reservas.moves.push(mv);
  Reservas.applyMoveEffect(mv);
  tx.reservaOrigemId = reservaBox.id;
  tx.reservaOrigemMoveId = mv.id;
}
/* ---------------- V6.1 — despesa fixa integrada com conta/reserva ----------------
   Mesma lógica já usada pela despesa variável (createLinkedReservaWithdrawalFromDespesa /
   removeLinkedReservaWithdrawalFromDespesa), adaptada para respeitar a diferença entre
   "despesa fixa cadastrada" (S.data.fixas, nunca move saldo) e "ocorrência paga" (um
   registro em S.data.fixaPagamentos por mês, só criado quando o usuário marca como paga).
   Todas as funções abaixo reaproveitam Reservas.applyMoveEffect/reverseMoveEffect (mesmo
   mecanismo do extrato da reserva) para nunca duplicar a lógica de débito/crédito. */
function findReservaBoxById(id){ return id ? ((S.data.reservas&&S.data.reservas.boxes)||[]).find(r=>r.id===id) || null : null; }
function logEstorno(entry){
  if(!Array.isArray(S.data.estornos)) S.data.estornos=[];
  S.data.estornos.push(Object.assign({id:uid(), data:todayISO(), createdAt:Date.now()}, entry));
}
/* Idempotência: sempre busca a ocorrência existente antes de criar uma nova — nunca há
   duas ocorrências para o mesmo (fixaId, mesKey), então marcar como paga duas vezes (ex.:
   duplo clique) nunca desconta duas vezes. */
function getOrPeekFixaOcorrencia(fixaId, mesKey){ return fixaOcorrenciaFor(fixaId, mesKey); }

function payFixaOcorrencia(f, mesKey, options={}){
  if(!f) return;
  const persist=options.persist!==false, notify=options.notify!==false;
  const jaExiste = fixaOcorrenciaFor(f.id, mesKey);
  if(jaExiste && jaExiste.pago){ if(notify)toast('Essa ocorrência já está marcada como paga.'); return true; } // proteção contra duplicidade
  const valor = Number(f.valor)||0;
  if((f.origemPagamento||'conta')==='reserva'){
    const box = findReservaBoxById(f.reservaOrigemId);
    if(!box){ if(notify)toast('A reserva vinculada a esta despesa fixa não existe mais. Edite a despesa e escolha outra reserva.'); return false; }
    if(!reservaTemSaldo(box, valor)){ if(notify)showReservaInsuficienteModal(box, valor); return false; }
    const mv = {id:uid(), boxId:box.id, tipo:'Pagamento de despesa fixa', data:todayISO(), valor, banco:box.banco||'', descricao:'Pagamento de despesa fixa — '+(f.nome||'Sem nome')+' — '+brlPlain(valor), despesaFixaId:f.id, fixaOcorrenciaId:null, createdAt:Date.now()};
    Reservas.applyMoveEffect(mv);
    S.data.reservas.moves.push(mv);
    const rec = jaExiste || {id:uid(), fixaId:f.id, mesKey};
    Object.assign(rec, {pago:true, origemPagamento:'reserva', reservaId:box.id, reservaMoveId:mv.id, valorPago:valor, banco:box.banco||'', pagoEm:Date.now()});
    mv.fixaOcorrenciaId = rec.id;
    if(!jaExiste) S.data.fixaPagamentos.push(rec);
    if(persist){saveCurrentData();renderView();}
    if(notify)toast('Despesa fixa paga com a reserva "'+box.nome+'".');
    return true;
  } else {
    const rec = jaExiste || {id:uid(), fixaId:f.id, mesKey};
    Object.assign(rec,{pago:true,origemPagamento:'conta',reservaId:null,reservaMoveId:null,valorPago:valor,accountId:f.accountId||resolveAccountId(f.banco),banco:accountNameSnapshot(f.accountId||resolveAccountId(f.banco),f.banco),pagoEm:Date.now()});
    if(!jaExiste) S.data.fixaPagamentos.push(rec);
    adjustLiquidez(rec.accountId||resolveAccountId(rec.banco,{includeArchived:true}),-valor); // V6.22 — desconta da conta usada para pagar
    if(persist){saveCurrentData();renderView();}
    if(notify)toast('Despesa fixa marcada como paga.');
    return true;
  }
}
function undoFixaOcorrencia(f, mesKey, options={}){
  if(!f) return;
  const persist=options.persist!==false, notify=options.notify!==false;
  const rec = fixaOcorrenciaFor(f.id, mesKey);
  if(!rec || !rec.pago) return true; // nada para desfazer — já pendente (idempotente)
  if(rec.origemPagamento==='reserva' && rec.reservaMoveId){
    const box = findReservaBoxById(rec.reservaId);
    const mv = (S.data.reservas.moves||[]).find(m=>m.id===rec.reservaMoveId);
    if(box && mv){
      Reservas.reverseMoveEffect(mv);
      logEstorno({tipo:'fixa', refId:f.id, nome:f.nome, valor:rec.valorPago, reservaId:box.id, reservaNome:box.nome, banco:box.banco, descricao:'Estorno — devolução de "'+f.nome+'" para a reserva '+box.nome});
    }
    S.data.reservas.moves = (S.data.reservas.moves||[]).filter(m=>m.id!==rec.reservaMoveId);
  } else if(rec.origemPagamento==='conta'){
    adjustLiquidez(rec.accountId||resolveAccountId(rec.banco,{includeArchived:true}),Number(rec.valorPago)||0); // V6.22 — devolve o valor à conta
  }
  S.data.fixaPagamentos = S.data.fixaPagamentos.filter(r=>r.id!==rec.id);
  if(persist){saveCurrentData();renderView();}
  if(notify)toast('Despesa fixa voltou a pendente'+(rec.origemPagamento==='reserva'?' — valor devolvido à reserva.':'.'));
  return true;
}
/* Ao excluir uma despesa fixa "a partir deste mês" (ou por completo), devolve à reserva
   qualquer ocorrência já paga por reserva a partir do mês afetado (fromMesKey==null =
   despesa inteira, todas as ocorrências) ANTES de remover o cadastro. */
function refundAndCleanFixaOcorrencias(fixaId, fromMesKey){
  const recs = (S.data.fixaPagamentos||[]).filter(r=>r.fixaId===fixaId && (fromMesKey==null || r.mesKey>=fromMesKey));
  recs.forEach(rec=>{
    if(rec.pago && rec.origemPagamento==='reserva' && rec.reservaMoveId){
      const box = findReservaBoxById(rec.reservaId);
      const mv = (S.data.reservas.moves||[]).find(m=>m.id===rec.reservaMoveId);
      if(box && mv) Reservas.reverseMoveEffect(mv);
      S.data.reservas.moves = (S.data.reservas.moves||[]).filter(m=>m.id!==rec.reservaMoveId);
    } else if(rec.pago && rec.origemPagamento==='conta'){
      adjustLiquidez(rec.accountId||resolveAccountId(rec.banco,{includeArchived:true}),Number(rec.valorPago)||0); // V6.22 — devolve o valor à conta
    }
  });
  const removeIds = new Set(recs.map(r=>r.id));
  S.data.fixaPagamentos = (S.data.fixaPagamentos||[]).filter(r=>!removeIds.has(r.id));
}
/* ---------------- V6.1 — editar despesa fixa já paga (valor e/ou origem) ----------------
   Padrão "validar antes de mutar qualquer coisa": se a nova reserva não tiver saldo
   suficiente, retorna {ok:false} SEM alterar nada — quem chamar deve abortar o salvamento
   inteiro (openFixaModal) antes de tocar em S.data.fixas. Se ok, retorna {ok:true, commit}
   e quem chamar decide quando aplicar (depois de já ter decidido o id da fixa do mês). */
function prepareFixaOcorrenciaEdit(oldFixaId, mesKeyAtual, novoValor, novoOrigem, novaReservaId, novoNomeParaDescricao){
  const rec = fixaOcorrenciaFor(oldFixaId, mesKeyAtual);
  if(!rec || !rec.pago) return {ok:true, noop:true, rec:null};
  const oldOrigem = rec.origemPagamento, oldReservaId = rec.reservaId, oldValor = Number(rec.valorPago)||0;
  const oldMv = rec.reservaMoveId ? (S.data.reservas.moves||[]).find(m=>m.id===rec.reservaMoveId) : null;
  if(novoOrigem==='conta'){
    return {ok:true, rec, commit(newFixaId, novoAccountRef){
      const accountIdFinal = resolveAccountId(novoAccountRef)||rec.accountId||resolveAccountId(rec.banco,{includeArchived:true});
      const bancoFinal = accountNameSnapshot(accountIdFinal, rec.banco);
      if(oldOrigem==='reserva' && oldMv){
        Reservas.reverseMoveEffect(oldMv);
        S.data.reservas.moves = (S.data.reservas.moves||[]).filter(m=>m.id!==oldMv.id);
      } else if(oldOrigem==='conta'){
        adjustLiquidez(rec.accountId||resolveAccountId(rec.banco,{includeArchived:true}), oldValor); // devolve à conta histórica pelo ID
      }
      adjustLiquidez(accountIdFinal, -novoValor); // desconta da conta selecionada pelo ID
      Object.assign(rec, {fixaId:newFixaId, origemPagamento:'conta', reservaId:null, reservaMoveId:null, valorPago:novoValor, accountId:accountIdFinal, banco:bancoFinal});
    }};
  }
  // novoOrigem === 'reserva'
  const targetBox = findReservaBoxById(novaReservaId);
  if(!targetBox) return {ok:false, reason:'reserva_invalida'};
  if(oldOrigem==='reserva' && oldReservaId===novaReservaId && oldMv){
    const diff = Math.round((novoValor-oldValor)*100)/100;
    if(diff===0) return {ok:true, rec, commit(newFixaId){ rec.fixaId=newFixaId; }};
    Reservas.reverseMoveEffect(oldMv);
    if(!reservaTemSaldo(targetBox, novoValor)){
      Reservas.applyMoveEffect(oldMv); // desfaz o reverse acima — preserva o estado anterior
      return {ok:false, reason:'saldo_insuficiente', box:targetBox, necessario:diff, disponivel:Number(targetBox.valorAtual)||0};
    }
    return {ok:true, rec, commit(newFixaId){
      oldMv.valor = novoValor;
      oldMv.descricao = 'Pagamento de despesa fixa — '+(novoNomeParaDescricao||'')+' — '+brlPlain(novoValor);
      Reservas.applyMoveEffect(oldMv);
      Object.assign(rec, {fixaId:newFixaId, valorPago:novoValor});
    }};
  }
  // trocou de reserva (ou estava na conta e passou a ser reserva)
  if(!reservaTemSaldo(targetBox, novoValor)) return {ok:false, reason:'saldo_insuficiente', box:targetBox, necessario:novoValor, disponivel:Number(targetBox.valorAtual)||0};
  return {ok:true, rec, commit(newFixaId){
    if(oldOrigem==='reserva' && oldMv){
      Reservas.reverseMoveEffect(oldMv);
      S.data.reservas.moves = (S.data.reservas.moves||[]).filter(m=>m.id!==oldMv.id);
    } else if(oldOrigem==='conta'){
      adjustLiquidez(rec.accountId||resolveAccountId(rec.banco,{includeArchived:true}), oldValor); // devolve à conta histórica pelo ID
    }
    const mv = {id:uid(), boxId:targetBox.id, tipo:'Pagamento de despesa fixa', data:todayISO(), valor:novoValor, banco:targetBox.banco||'', descricao:'Pagamento de despesa fixa — '+(novoNomeParaDescricao||'')+' — '+brlPlain(novoValor), despesaFixaId:newFixaId, fixaOcorrenciaId:rec.id, createdAt:Date.now()};
    Reservas.applyMoveEffect(mv);
    S.data.reservas.moves.push(mv);
    Object.assign(rec, {fixaId:newFixaId, origemPagamento:'reserva', reservaId:targetBox.id, reservaMoveId:mv.id, valorPago:novoValor});
  }};
}

function variavelStatus(tx){ return tx && tx.statusPagamento==='Em aberto' ? 'Em aberto' : 'Pago'; }
function setVariavelStatus(tx, novoStatus){
  if(!tx || tx.tipo!=='variavel') return false;
  const atual=variavelStatus(tx);
  const alvo=novoStatus==='Em aberto'?'Em aberto':'Pago';
  if(atual===alvo) return true;
  if(alvo==='Pago'){
    if(tx.origemPagamento==='reserva'){
      const box=findReservaBoxById(tx.reservaOrigemId);
      if(!box){ toast('A reserva vinculada não existe mais. Edite o lançamento e escolha outra reserva.'); return false; }
      if(!reservaTemSaldo(box,tx.valor)){ showReservaInsuficienteModal(box,tx.valor); return false; }
      tx.statusPagamento='Pago';
      createLinkedReservaWithdrawalFromDespesa(tx,box,tx.valor);
    }else{
      tx.statusPagamento='Pago';
      if(!applyTxSaldoEffect(tx)){ tx.statusPagamento=atual; toast('Não foi possível descontar o valor da conta vinculada.'); return false; }
    }
  }else{
    if(tx.origemPagamento==='reserva') removeLinkedReservaWithdrawalFromDespesa(tx);
    else reverseTxSaldoEffect(tx);
    tx.statusPagamento='Em aberto';
  }
  return true;
}

function openTransactionModal({type, existing}){
  const isEdit=!!existing;
  const isReceita=type==='receita';
  const isDespesaVariavel=type==='variavel';
  const reservaBoxes=reservaBoxesForLancamento();
  const carteira=getCarteiraConta();
  const linkedBox=isReceita&&isEdit&&existing.reservaBoxId?reservaBoxes.find(r=>r.id===existing.reservaBoxId):null;
  const initialDestino=isReceita&&isEdit
    ? (existing.reservaMoveId?((Number(existing.reservaValor)||0)<(Number(existing.valor)||0)?'dividir':'reserva'):(existing.accountId===CARTEIRA_CONTA_ID?'carteira':'conta'))
    : 'conta';
  const reservaOptions=reservaBoxes.map(r=>`<option value="${esc(r.id)}" ${((isEdit&&existing.reservaOrigemId===r.id)||(linkedBox&&linkedBox.id===r.id))?'selected':''}>${esc(reservaBoxLabel(r))}</option>`).join('');
  const initialPaymentSource=isDespesaVariavel&&isEdit
    ? (existing.origemPagamento==='reserva'?'reserva':(existing.formaPagamento==='Crédito'?'credito':(existing.formaPagamento==='Dinheiro'?'carteira':'conta')))
    : 'conta';
  const initialStatus=isDespesaVariavel&&isEdit?variavelStatus(existing):'Pago';
  const initialContaForma=isDespesaVariavel&&isEdit&&existing.formaPagamento==='Débito'?'Débito':'Pix';
  const accounts=accountSelectOptions({excludeCarteira:true});
  const cards=cardSelectOptions();
  const selectedAccount=isEdit?(existing.accountId||resolveAccountId(existing.banco,{includeArchived:true})):((accounts[0]||{}).value||'');
  const receitaSelectedAccount=(selectedAccount&&selectedAccount!==CARTEIRA_CONTA_ID)?selectedAccount:((accounts[0]||{}).value||'');
  const receitaOrigemInicial=isReceita&&isEdit?(existing.origem||'propria'):'propria';
  const importedNotice=isEdit&&existing.integrationAggregateId?`<div class="info-box interop-native-notice"><b>Importado de ${esc(window.BorionInterop?BorionInterop.sourceName(existing.integrationSourceAppId):'aplicativo externo')}.</b> Este lançamento agora é nativo do Borion: você pode editar normalmente e as alterações não voltam para o aplicativo de origem.</div>`:'';

  const variablePaymentHTML=isDespesaVariavel?`
    <div class="field"><label>De onde será pago</label>
      <div class="segmented-toggle payment-source-toggle" id="tm_pagamento_origem_group">
        <button type="button" class="seg-btn ${initialPaymentSource==='carteira'?'active':''}" data-value="carteira">Carteira</button>
        <button type="button" class="seg-btn ${initialPaymentSource==='conta'?'active':''}" data-value="conta">Conta</button>
        ${reservasEnabled()?`<button type="button" class="seg-btn ${initialPaymentSource==='reserva'?'active':''}" data-value="reserva" ${reservaBoxes.length?'':'disabled title="Crie uma reserva primeiro"'}>Reserva</button>`:''}
        <button type="button" class="seg-btn ${initialPaymentSource==='credito'?'active':''}" data-value="credito">Crédito</button>
      </div>
      <input type="hidden" id="tm_pagamento_origem" value="${initialPaymentSource}"/>
    </div>
    <div id="tm_carteira_fields" class="payment-source-panel ${initialPaymentSource==='carteira'?'':'hidden'}">
      <div class="info-box">Pagamento em <b>Dinheiro</b>, saindo automaticamente da <b>Carteira</b>${carteira?' ('+esc(carteira.nome)+')':''}.</div>
    </div>
    <div id="tm_conta_fields" class="payment-source-panel ${initialPaymentSource==='conta'?'':'hidden'}">
      <div class="field"><label>Forma de pagamento</label><div class="segmented-toggle" id="tm_conta_forma_group">
        <button type="button" class="seg-btn ${initialContaForma==='Pix'?'active':''}" data-value="Pix">Pix</button>
        <button type="button" class="seg-btn ${initialContaForma==='Débito'?'active':''}" data-value="Débito">Débito</button>
      </div><input type="hidden" id="tm_conta_forma" value="${initialContaForma}"/></div>
      <div class="field"><label>De onde sai o dinheiro</label><select id="tm_banco">${accounts.length?accounts.map(o=>`<option value="${esc(o.value)}" ${o.value===selectedAccount?'selected':''}>${esc(o.label)}</option>`).join(''):'<option value="">Cadastre uma conta bancária</option>'}</select></div>
    </div>
    ${reservasEnabled()?`<div id="tm_reserva_pg_wrap" class="payment-source-panel reserve-destination-box ${initialPaymentSource==='reserva'?'':'hidden'}">
      <div class="field"><label>Reserva que pagará</label><select id="tm_reserva_pg_box">${reservaOptions||'<option value="">Nenhuma reserva disponível</option>'}</select></div>
      <p class="modal-sub reserve-hint">Quando estiver como Pago, o valor sai diretamente desta reserva. Em aberto não altera o saldo.</p>
    </div>`:''}
    <div id="tm_credito_fields" class="payment-source-panel ${initialPaymentSource==='credito'?'':'hidden'}">
      <div class="field"><label>Cartão de crédito</label><select id="tm_cartao">${cards.length?cards.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join(''):'<option value="">Nenhum cartão cadastrado</option>'}</select></div>
      <div class="field"><label>Tipo de compra</label><select id="tm_credito_tipo"><option value="avista">Crédito à vista</option><option value="parcelado">Crédito parcelado</option></select></div>
      <div class="field hidden" id="tm_parcelas_wrap"><label>Quantidade de parcelas <span id="tm_parcela_preview" style="color:var(--muted);font-weight:600;"></span></label><input type="number" id="tm_parcelas" min="2" step="1" value="2"/></div>
      <p class="modal-sub" style="margin:4px 0 0;">O dia da data da compra será usado como dia de entrada na fatura.</p>
    </div>
    <div class="field"><label>Status do lançamento</label><div class="segmented-toggle" id="tm_status_group">
      <button type="button" class="seg-btn ${initialStatus==='Pago'?'active':''}" data-value="Pago">Pago</button>
      <button type="button" class="seg-btn ${initialStatus==='Em aberto'?'active':''}" data-value="Em aberto">Em aberto</button>
    </div><input type="hidden" id="tm_status" value="${initialStatus}"/>
    <p class="modal-sub" style="margin:4px 0 0;">Em aberto registra a despesa sem retirar dinheiro da conta ou da reserva.</p></div>`:'';

  const receitaFieldsHTML=isReceita?`
    <div class="field"><label>Origem da receita</label>
      <div class="segmented-toggle payment-source-toggle revenue-origin-toggle" id="tm_origem_group">
        <button type="button" class="seg-btn ${receitaOrigemInicial==='propria'?'active':''}" data-value="propria">Receita própria</button>
        <button type="button" class="seg-btn ${receitaOrigemInicial==='rendimento'?'active':''}" data-value="rendimento">Rendimento</button>
        <button type="button" class="seg-btn ${receitaOrigemInicial==='reembolso'?'active':''}" data-value="reembolso">Reembolso recebido</button>
        <button type="button" class="seg-btn ${receitaOrigemInicial==='repasse'?'active':''}" data-value="repasse">Repasse de terceiros</button>
      </div><input type="hidden" id="tm_origem" value="${receitaOrigemInicial}"/>
      <p class="modal-sub" style="margin:4px 0 0;">Receita própria e rendimento contam como renda. Reembolso e repasse de terceiros não entram na Receita do mês.</p>
    </div>
    <div class="field"><label>Onde a receita entra</label>
      <div class="segmented-toggle payment-source-toggle revenue-destination-toggle" id="tm_receita_destino_group">
        <button type="button" class="seg-btn ${initialDestino==='carteira'?'active':''}" data-value="carteira">Carteira</button>
        <button type="button" class="seg-btn ${initialDestino==='conta'?'active':''}" data-value="conta">Conta</button>
        ${reservasEnabled()?`<button type="button" class="seg-btn ${initialDestino==='reserva'?'active':''}" data-value="reserva" ${reservaBoxes.length?'':'disabled title="Crie uma reserva primeiro"'}>Reserva</button>`:''}
        ${reservasEnabled()?`<button type="button" class="seg-btn seg-btn-wide ${initialDestino==='dividir'?'active':''}" data-value="dividir" ${reservaBoxes.length?'':'disabled title="Crie uma reserva primeiro"'}>Dividir entre Conta e Reserva</button>`:''}
      </div><input type="hidden" id="tm_receita_destino" value="${initialDestino}"/>
    </div>
    <div id="tm_receita_carteira_fields" class="payment-source-panel ${initialDestino==='carteira'?'':'hidden'}"><div class="info-box">A receita entra automaticamente na <b>Carteira</b>, como dinheiro em espécie.</div></div>
    <div id="tm_receita_conta_fields" class="payment-source-panel ${initialDestino==='conta'?'':'hidden'}"><div class="field"><label>Conta que receberá</label><select id="tm_receita_conta">${accounts.length?accounts.map(o=>`<option value="${esc(o.value)}" ${o.value===receitaSelectedAccount?'selected':''}>${esc(o.label)}</option>`).join(''):'<option value="">Cadastre uma conta bancária</option>'}</select></div></div>
    ${reservasEnabled()?`<div id="tm_receita_reserva_fields" class="payment-source-panel reserve-destination-box ${initialDestino==='reserva'?'':'hidden'}"><div class="field"><label>Reserva que receberá</label><select id="tm_receita_reserva_box">${reservaOptions||'<option value="">Nenhuma reserva disponível</option>'}</select></div><p class="modal-sub reserve-hint">O vínculo com a conta da reserva é aplicado automaticamente.</p></div>`:''}
    ${reservasEnabled()?`<div id="tm_receita_dividir_fields" class="payment-source-panel reserve-destination-box ${initialDestino==='dividir'?'':'hidden'}">
      <div class="field"><label>Conta que receberá</label><select id="tm_receita_dividir_conta">${accounts.length?accounts.map(o=>`<option value="${esc(o.value)}" ${o.value===receitaSelectedAccount?'selected':''}>${esc(o.label)}</option>`).join(''):'<option value="">Cadastre uma conta bancária</option>'}</select></div>
      <div class="field"><label>Reserva que receberá</label><select id="tm_receita_dividir_reserva">${reservaOptions||'<option value="">Nenhuma reserva disponível</option>'}</select></div>
      <div class="field"><label>Quanto vai para a conta (R$)</label><input type="text" inputmode="numeric" id="tm_conta_valor" class="money-input" placeholder="0,00"/></div>
      <div class="field"><label>Quanto vai para a reserva (R$)</label><input type="text" inputmode="numeric" id="tm_reserva_valor" class="money-input" placeholder="0,00"/></div>
      <p class="modal-sub reserve-hint">Os dois valores precisam somar exatamente o valor total da receita.</p>
    </div>`:''}`:'';

  const modalTitle=isEdit
    ? (isReceita?'Editar receita':(isDespesaVariavel?'Editar despesa variável':'Editar lançamento'))
    : (isReceita?'Adicionar receita':(isDespesaVariavel?'Adicionar despesa variável':'Adicionar lançamento'));
  const fieldsHTML=isReceita?`
    <div class="field"><label>Nome</label><input type="text" id="tm_nome" value="${isEdit?esc(existing.nome):''}"/></div>
    ${categorySelectHTML('tm',type,isEdit?existing.categoria:null)}
    <div class="field"><label id="tm_valor_label">Valor (R$)</label><input type="text" inputmode="numeric" id="tm_valor" class="money-input" placeholder="0,00"/></div>
    <div class="field"><label>Data</label><input type="date" id="tm_data" value="${isEdit?esc(existing.data||''):todayISO()}"/></div>
    ${receitaFieldsHTML}`:`
    <div class="field"><label>Nome</label><input type="text" id="tm_nome" value="${isEdit?esc(existing.nome):''}"/></div>
    ${isDespesaVariavel?`<div class="field"><label>Local da compra</label><input type="text" id="tm_local" value="${isEdit?esc(existing.localCompra||existing.local||''):''}" placeholder="Ex: Mercado, farmácia, loja..."/></div>`:''}
    <div class="field"><label>Data</label><input type="date" id="tm_data" value="${isEdit?esc(existing.data||''):todayISO()}"/></div>
    ${categorySelectHTML('tm',type,isEdit?existing.categoria:null)}
    <div class="field"><label id="tm_valor_label">Valor (R$)</label><input type="text" inputmode="numeric" id="tm_valor" class="money-input" placeholder="0,00"/></div>
    ${variablePaymentHTML}`;

  const box=el(`<div class="modal-overlay transaction-modal-overlay"><div class="modal-box transaction-modal">
    <div class="modal-head"><h2>${modalTitle}</h2><button id="tm_close">&times;</button></div>
    ${importedNotice}
    ${fieldsHTML}
    <div class="row-btns"><button class="btn btn-primary btn-block" id="tm_save">${isEdit?'Salvar':'Adicionar'}</button></div>
    ${isEdit?'<div class="row-btns" style="margin-top:8px;"><button class="btn btn-danger btn-block" id="tm_delete">Excluir</button></div>':''}
  </div></div>`);
  $('#modal-root').innerHTML='';$('#modal-root').appendChild(box);attachModalGuard(box);$('#tm_close').onclick=closeModal;
  attachMoneyMask($('#tm_valor'),isEdit?existing.valor:0);
  if(isReceita&&$('#tm_conta_valor')) attachMoneyMask($('#tm_conta_valor'),isEdit?Math.max(0,(Number(existing.valor)||0)-(Number(existing.reservaValor)||0)):0);
  if(isReceita&&$('#tm_reserva_valor')) attachMoneyMask($('#tm_reserva_valor'),isEdit?(existing.reservaValor||0):0);
  wireQuickCategory($('#tm_categoria'),$('#tm_newcat_box'),$('#tm_newcat_input'),$('#tm_newcat_add'),type);

  function wireSegmented(groupId,inputId,onChange){
    const group=$(groupId), hidden=$(inputId); if(!group||!hidden)return;
    group.querySelectorAll('.seg-btn:not([disabled])').forEach(btn=>btn.onclick=()=>{group.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');hidden.value=btn.dataset.value;if(onChange)onChange(hidden.value);});
  }
  function syncPaymentSourceUI(source){
    ['carteira','conta','reserva','credito'].forEach(k=>{const node=$('#tm_'+(k==='reserva'?'reserva_pg_wrap':k+'_fields'));if(node)node.classList.toggle('hidden',source!==k);});
    const label=$('#tm_valor_label');if(label)label.textContent=source==='credito'?'Valor total da compra (R$)':'Valor (R$)';
    updateCreditoParcelPreview();
  }
  function syncRevenueDestinationUI(source){
    ['carteira','conta','reserva','dividir'].forEach(k=>{const node=$('#tm_receita_'+k+'_fields');if(node)node.classList.toggle('hidden',source!==k);});
    if(source==='dividir') syncRevenueSplitFromTotal();
  }
  function syncRevenueSplitFromTotal(){
    if(!isReceita||!$('#tm_conta_valor')||!$('#tm_reserva_valor'))return;
    const total=parseInt(($('#tm_valor')&&$('#tm_valor').dataset.cents)||'0',10);
    const conta=parseInt($('#tm_conta_valor').dataset.cents||'0',10),reserva=parseInt($('#tm_reserva_valor').dataset.cents||'0',10);
    if(conta+reserva===0&&total>0){$('#tm_conta_valor').dataset.cents=String(total);$('#tm_conta_valor').value=(total/100).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});}
  }
  wireSegmented('#tm_pagamento_origem_group','#tm_pagamento_origem',syncPaymentSourceUI);
  wireSegmented('#tm_conta_forma_group','#tm_conta_forma');
  wireSegmented('#tm_status_group','#tm_status');
  wireSegmented('#tm_origem_group','#tm_origem');
  wireSegmented('#tm_receita_destino_group','#tm_receita_destino',syncRevenueDestinationUI);
  function updateCreditoParcelPreview(){
    const tipo=$('#tm_credito_tipo'),wrap=$('#tm_parcelas_wrap'),preview=$('#tm_parcela_preview');
    if(!tipo)return;if(wrap)wrap.classList.toggle('hidden',tipo.value!=='parcelado');
    if(!preview||tipo.value!=='parcelado'){if(preview)preview.textContent='';return;}
    const total=parseInt(($('#tm_valor')&&$('#tm_valor').dataset.cents)||'0',10)/100,qtd=Math.max(2,Math.round(Number(($('#tm_parcelas')&&$('#tm_parcelas').value)||2)));
    preview.textContent=`(${brlPlain(Math.round((total/qtd)*100)/100)} cada)`;
  }
  if($('#tm_credito_tipo'))$('#tm_credito_tipo').onchange=updateCreditoParcelPreview;
  if($('#tm_parcelas'))$('#tm_parcelas').oninput=updateCreditoParcelPreview;
  if($('#tm_valor'))$('#tm_valor').addEventListener('input',()=>{updateCreditoParcelPreview();syncRevenueSplitFromTotal();});
  if(isDespesaVariavel)syncPaymentSourceUI(initialPaymentSource);
  if(isReceita)syncRevenueDestinationUI(initialDestino);

  $('#tm_save').onclick=()=>{
    const nome=$('#tm_nome').value.trim()||'Sem nome',data=$('#tm_data').value||(isEdit?(existing.data||''):todayISO()),categoria=$('#tm_categoria').value;
    if(categoria==='__new__'){alert('Confirme o nome da nova categoria antes de salvar.');return;}
    const valor=parseInt($('#tm_valor').dataset.cents||'0',10)/100;if(valor<=0){alert('Digite um valor maior que zero.');return;}
    const commitAtomic=fn=>runAtomicFinancialMutation(fn,()=>alert('Não foi possível salvar. O lançamento e o saldo anteriores foram preservados.'));

    if(isDespesaVariavel){
      const source=$('#tm_pagamento_origem').value,status=$('#tm_status').value==='Em aberto'?'Em aberto':'Pago',localCompra=($('#tm_local').value||'').trim();
      if(source==='credito'){
        const importedSource=isEdit&&window.BorionInterop?BorionInterop.captureImportReference(existing):null;
        const cartao=(S.data.cartoes||[]).find(c=>c.id===$('#tm_cartao').value);if(!cartao){alert('Escolha um cartão de crédito válido.');return;}
        const parcelaTotal=$('#tm_credito_tipo').value==='parcelado'?Math.max(2,Math.round(Number($('#tm_parcelas').value)||2)):1;
        const valorParcela=Math.round((valor/parcelaTotal)*100)/100,diaCompra=Math.max(1,Math.min(31,parseInt(data.slice(8,10),10)||1));
        if(!commitAtomic(()=>{
          if(isEdit){reverseTxSaldoEffect(existing);removeLinkedReservaMoveFromTransaction(existing);removeLinkedReservaWithdrawalFromDespesa(existing);S.data.transacoes=S.data.transacoes.filter(x=>x.id!==existing.id);}
          const p={id:uid(),descricao:nome,local:localCompra,categoria:categoria||'Outro',valorParcela,parcelaTotal,dataCompra:data.slice(0,7),dataCompraCompleta:data,diaEntrada:diaCompra,apareceDespesas:true,despesaTipo:'variavel',statusPagamento:status,statusFaturaPorCompetencia:{},despesaTransacaoId:null,despesaTransacaoIds:[],despesaFixaId:null};
          cartao.parcelas.push(p);linkParcelaToDespesa(cartao,p);
          if(importedSource&&window.BorionInterop)BorionInterop.transferImportReference(existing,p.despesaTransacaoIds||[],S.data);
        }))return;
        saveCurrentData();closeModal();renderView();toast('Compra no crédito lançada com loja e dia de entrada na fatura.');return;
      }
      let accountId=null,banco='',formaPagamento=null,reservaBox=null;
      if(source==='carteira'){
        accountId=requireAccountId(CARTEIRA_CONTA_ID,'A Carteira precisa estar disponível.');if(!accountId)return;banco=accountNameSnapshot(accountId);formaPagamento='Dinheiro';
      }else if(source==='conta'){
        accountId=requireAccountId($('#tm_banco').value,'Escolha a conta de onde sai o dinheiro.');if(!accountId)return;banco=accountNameSnapshot(accountId);formaPagamento=$('#tm_conta_forma').value==='Débito'?'Débito':'Pix';
      }else if(source==='reserva'){
        reservaBox=reservaBoxes.find(r=>r.id===$('#tm_reserva_pg_box').value);if(!reservaBox){toast('Escolha uma reserva válida.');return;}banco=reservaBox.banco||'';
        if(status==='Pago'&&!reservaTemSaldo(reservaBox,valor)){showReservaInsuficienteModal(reservaBox,valor);return;}
      }
      let tx;
      if(!commitAtomic(()=>{
        if(isEdit){reverseTxSaldoEffect(existing);removeLinkedReservaMoveFromTransaction(existing);removeLinkedReservaWithdrawalFromDespesa(existing);}
        const payload={nome,data,categoria,valor,localCompra,statusPagamento:status,accountId:source==='reserva'?null:accountId,banco,origemPagamento:source==='reserva'?'reserva':'conta',formaPagamento:source==='reserva'?null:formaPagamento,reservaOrigemId:source==='reserva'?reservaBox.id:null,reservaOrigemMoveId:null};
        if(isEdit){Object.assign(existing,payload);tx=existing;}else{tx=Object.assign({id:uid(),tipo:'variavel'},payload);S.data.transacoes.push(tx);}
        if(status==='Pago'){
          if(source==='reserva')createLinkedReservaWithdrawalFromDespesa(tx,reservaBox,valor);
          else if(!applyTxSaldoEffect(tx))throw new Error('Conta inválida para aplicar saldo.');
        }
      }))return;
      saveCurrentData();closeModal();renderView();toast(isEdit?'Despesa atualizada.':(status==='Pago'?'Despesa lançada como paga.':'Despesa lançada em aberto.'));return;
    }

    const destino=$('#tm_receita_destino').value;
    let accountId=null,reservaBox=null,reservaValor=0,destinoModo='Conta livre';
    if(destino==='carteira'){
      accountId=requireAccountId(CARTEIRA_CONTA_ID,'A Carteira precisa estar disponível.');if(!accountId)return;
    }else if(destino==='conta'){
      accountId=requireAccountId($('#tm_receita_conta').value,'Escolha a conta que receberá a receita.');if(!accountId)return;
    }else if(destino==='reserva'){
      reservaBox=reservaBoxes.find(r=>r.id===$('#tm_receita_reserva_box').value);if(!reservaBox){alert('Escolha uma reserva válida.');return;}
      accountId=requireAccountId(reservaBox.accountId||resolveAccountId(reservaBox.banco,{includeArchived:false}),'A conta vinculada a esta reserva não está disponível.');if(!accountId)return;
      reservaValor=valor;destinoModo='Direto para reserva';
    }else if(destino==='dividir'){
      accountId=requireAccountId($('#tm_receita_dividir_conta').value,'Escolha a conta que receberá parte da receita.');if(!accountId)return;
      reservaBox=reservaBoxes.find(r=>r.id===$('#tm_receita_dividir_reserva').value);if(!reservaBox){alert('Escolha uma reserva válida.');return;}
      const contaValor=parseInt($('#tm_conta_valor').dataset.cents||'0',10)/100;
      reservaValor=parseInt($('#tm_reserva_valor').dataset.cents||'0',10)/100;
      if(contaValor<=0||reservaValor<=0){alert('Informe um valor maior que zero para a conta e para a reserva.');return;}
      if(Math.round((contaValor+reservaValor)*100)!==Math.round(valor*100)){alert('O valor da conta e o valor da reserva precisam somar exatamente o total da receita.');return;}
      destinoModo='Dividir entre conta e reserva';
    }
    const banco=accountNameSnapshot(accountId),origem=$('#tm_origem').value||'propria';
    let tx;if(!commitAtomic(()=>{if(isEdit){reverseTxSaldoEffect(existing);removeLinkedReservaMoveFromTransaction(existing);}const payload={nome,data,categoria,valor,accountId,banco,origem,reservaValor:0,destinoModo:'Conta livre'};if(isEdit){Object.assign(existing,payload);tx=existing;}else{tx=Object.assign({id:uid(),tipo:'receita'},payload);S.data.transacoes.push(tx);}if(reservaBox){tx.destinoModo=destinoModo;createLinkedReservaMoveFromTransaction(tx,reservaBox,reservaValor);}if(!applyTxSaldoEffect(tx))throw new Error('Conta inválida para aplicar saldo.');}))return;
    saveCurrentData();closeModal();renderView();toast(isEdit?'Receita atualizada.':(reservaBox?'Receita adicionada com destino aplicado.':'Receita adicionada.'));
  };
  if(isEdit)$('#tm_delete').onclick=()=>{
    const performDelete=(integrationMode=null)=>{
      const idx=S.data.transacoes.findIndex(x=>x.id===existing.id);if(idx<0)return;
      const snapshot=JSON.parse(JSON.stringify(S.data));
      if(integrationMode&&window.BorionInterop)BorionInterop.markImportedDeletion(existing,integrationMode,S.data);
      reverseTxSaldoEffect(existing);removeLinkedReservaMoveFromTransaction(existing);removeLinkedReservaWithdrawalFromDespesa(existing);
      S.data.transacoes.splice(idx,1);saveCurrentData();
      const criticalSync=integrationMode&&window.BorionInterop?BorionInterop.persistCriticalChange?.('interop_imported_delete'):null;
      closeModal();renderView();
      const message=integrationMode?'Lançamento excluído definitivamente e bloqueado contra retorno.':'Lançamento excluído.';
      if(integrationMode){
        toast(message);
        Promise.resolve(criticalSync).then(result=>{
          if(result?.synced)toast('Exclusão confirmada no Google Drive.');
          else if(result?.pending)setTimeout(()=>toast('Exclusão salva neste dispositivo e pendente de confirmação no Drive.'),150);
        }).catch(error=>console.warn('[BORION][IMPORTED_DELETE_SYNC]',error));
      }else showUndoToast(message,()=>{S.data=snapshot;saveCurrentData();renderView();});
    };
    if(existing.integrationAggregateId&&window.BorionInterop){BorionInterop.openImportedDeleteDialog(existing,performDelete);return;}
    performDelete();
  };
}

/* ---- dedicated modal: recurring fixed expense (despesa fixa) ---- */
function openFixaModal(existing){
  const isEdit=!!existing;
  const monthKeyNow=monthKey(S.month.y,S.month.m);
  const fixedDateInitial=isEdit
    ? (existing.dataCadastro||((existing.startMonth||monthKeyNow)+'-'+pad2(existing.dia||1)))
    : todayISO();
  const carteira=getCarteiraConta();
  const reservaBoxesFixa=reservaBoxesForLancamento();
  const currentRec=isEdit?fixaOcorrenciaFor(existing.id,monthKeyNow):null;
  const initialStatus=currentRec&&currentRec.pago?'Pago':'Em aberto';
  const initialPaymentSource=isEdit
    ? (existing.origemPagamento==='reserva'&&reservasEnabled()?'reserva':(existing.formaPagamento==='Dinheiro'?'carteira':'conta'))
    : (accountSelectOptions({excludeCarteira:true}).length?'conta':'carteira');
  const initialContaForma=isEdit&&existing.formaPagamento==='Débito'?'Débito':'Pix';
  const accounts=accountSelectOptions({excludeCarteira:true});
  const cards=cardSelectOptions();
  const selectedAccount=isEdit?(existing.accountId||resolveAccountId(existing.banco,{includeArchived:true})):((accounts[0]||{}).value||'');
  const reservaOptions=reservaBoxesFixa.map(r=>`<option value="${esc(r.id)}" ${isEdit&&existing.reservaOrigemId===r.id?'selected':''}>${esc(reservaBoxLabel(r))}</option>`).join('');

  const paymentHTML=`
    <div class="field"><label>De onde será pago</label>
      <div class="segmented-toggle payment-source-toggle" id="fm_pagamento_origem_group">
        <button type="button" class="seg-btn ${initialPaymentSource==='carteira'?'active':''}" data-value="carteira">Carteira</button>
        <button type="button" class="seg-btn ${initialPaymentSource==='conta'?'active':''}" data-value="conta">Conta</button>
        ${reservasEnabled()?`<button type="button" class="seg-btn ${initialPaymentSource==='reserva'?'active':''}" data-value="reserva" ${reservaBoxesFixa.length?'':'disabled title="Crie uma reserva primeiro"'}>Reserva</button>`:''}
        <button type="button" class="seg-btn ${initialPaymentSource==='credito'?'active':''}" data-value="credito">Crédito</button>
      </div>
      <input type="hidden" id="fm_pagamento_origem" value="${initialPaymentSource}"/>
    </div>
    <div id="fm_carteira_fields" class="payment-source-panel ${initialPaymentSource==='carteira'?'':'hidden'}">
      <div class="info-box">Pagamento em <b>Dinheiro</b>, saindo automaticamente da <b>Carteira</b>${carteira?' ('+esc(carteira.nome)+')':''}.</div>
    </div>
    <div id="fm_conta_fields" class="payment-source-panel ${initialPaymentSource==='conta'?'':'hidden'}">
      <div class="field"><label>Forma de pagamento</label><div class="segmented-toggle" id="fm_conta_forma_group">
        <button type="button" class="seg-btn ${initialContaForma==='Pix'?'active':''}" data-value="Pix">Pix</button>
        <button type="button" class="seg-btn ${initialContaForma==='Débito'?'active':''}" data-value="Débito">Débito</button>
      </div><input type="hidden" id="fm_conta_forma" value="${initialContaForma}"/></div>
      <div class="field"><label>De onde sai o dinheiro</label><select id="fm_banco">${accounts.length?accounts.map(o=>`<option value="${esc(o.value)}" ${o.value===selectedAccount?'selected':''}>${esc(o.label)}</option>`).join(''):'<option value="">Cadastre uma conta bancária</option>'}</select></div>
    </div>
    ${reservasEnabled()?`<div id="fm_reserva_fields" class="payment-source-panel reserve-destination-box ${initialPaymentSource==='reserva'?'':'hidden'}">
      <div class="field"><label>Reserva que pagará</label><select id="fm_reserva_pg_box">${reservaOptions||'<option value="">Nenhuma reserva disponível</option>'}</select></div>
      <p class="modal-sub reserve-hint">Quando estiver como Pago, o valor sai diretamente desta reserva. Em aberto não altera o saldo.</p>
    </div>`:''}
    <div id="fm_credito_fields" class="payment-source-panel ${initialPaymentSource==='credito'?'':'hidden'}">
      <div class="field"><label>Cartão de crédito</label><select id="fm_cartao">${cards.length?cards.map(o=>`<option value="${esc(o.value)}">${esc(o.label)}</option>`).join(''):'<option value="">Nenhum cartão cadastrado</option>'}</select></div>
      <div class="field"><label>Tipo de compra</label><select id="fm_credito_tipo"><option value="avista">Crédito à vista</option><option value="parcelado">Crédito parcelado</option></select></div>
      <div class="field hidden" id="fm_parcelas_wrap"><label>Quantidade de parcelas <span id="fm_parcela_preview" style="color:var(--muted);font-weight:600;"></span></label><input type="number" id="fm_parcelas" min="2" step="1" value="2"/></div>
      <p class="modal-sub" style="margin:4px 0 0;">No crédito, o dia do vencimento será usado como dia de entrada na fatura.</p>
    </div>
    <div class="field"><label>Status deste mês</label><div class="segmented-toggle" id="fm_status_group">
      <button type="button" class="seg-btn ${initialStatus==='Pago'?'active':''}" data-value="Pago">Pago</button>
      <button type="button" class="seg-btn ${initialStatus==='Em aberto'?'active':''}" data-value="Em aberto">Em aberto</button>
    </div><input type="hidden" id="fm_status" value="${initialStatus}"/>
    <p class="modal-sub" style="margin:4px 0 0;">Em aberto cadastra a despesa sem retirar dinheiro. Pago aplica o pagamento somente no mês selecionado.</p></div>`;

  const box=el(`<div class="modal-overlay transaction-modal-overlay"><div class="modal-box transaction-modal fixed-expense-modal">
    <div class="modal-head"><h2>${isEdit?'Editar':'Adicionar'} despesa fixa</h2><button id="fm_close">&times;</button></div>
    <p class="modal-sub">${isEdit?'Alterações se aplicam a partir de '+monthLabel(S.month.y,S.month.m)+'; meses anteriores mantêm o histórico.':'Essa despesa se repete mensalmente a partir da data informada. O status Pago/Em aberto abaixo vale para o primeiro mês.'}</p>
    <div class="field"><label>Nome</label><input type="text" id="fm_nome" value="${isEdit?esc(existing.nome):''}"/></div>
    <div class="field"><label>Local da compra</label><input type="text" id="fm_local" value="${isEdit?esc(existing.localCompra||existing.local||''):''}" placeholder="Ex: Academia, aluguel, operadora..."/></div>
    ${categorySelectHTML('fm','fixa',isEdit?existing.categoria:null)}
    <div class="field"><label id="fm_valor_label">Valor mensal (R$)</label><input type="text" inputmode="numeric" id="fm_valor" class="money-input" placeholder="0,00"/></div>
    <div class="field"><label>Data do primeiro vencimento</label><input type="date" id="fm_data" value="${esc(fixedDateInitial)}"/></div>
    ${paymentHTML}
    <div class="row-btns"><button class="btn btn-primary btn-block" id="fm_save">${isEdit?'Salvar':'Adicionar'}</button></div>
    ${isEdit?'<div class="row-btns" style="margin-top:8px;"><button class="btn btn-danger btn-block" id="fm_delete">Remover a partir deste mês</button></div>':''}
  </div></div>`);
  $('#modal-root').innerHTML='';$('#modal-root').appendChild(box);attachModalGuard(box);$('#fm_close').onclick=closeModal;
  attachMoneyMask($('#fm_valor'),isEdit?existing.valor:0);
  wireQuickCategory($('#fm_categoria'),$('#fm_newcat_box'),$('#fm_newcat_input'),$('#fm_newcat_add'),'fixa');

  function wireSegmented(groupId,inputId,onChange){
    const group=$(groupId),hidden=$(inputId);if(!group||!hidden)return;
    group.querySelectorAll('.seg-btn:not([disabled])').forEach(btn=>btn.onclick=()=>{group.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');hidden.value=btn.dataset.value;if(onChange)onChange(hidden.value);});
  }
  function syncPaymentSourceUI(source){
    ['carteira','conta','reserva','credito'].forEach(k=>{const node=$('#fm_'+k+'_fields');if(node)node.classList.toggle('hidden',source!==k);});
    const label=$('#fm_valor_label');if(label)label.textContent=source==='credito'?'Valor total da compra (R$)':'Valor mensal (R$)';
    updateCreditoParcelPreview();
  }
  function updateCreditoParcelPreview(){
    const tipo=$('#fm_credito_tipo'),wrap=$('#fm_parcelas_wrap'),preview=$('#fm_parcela_preview');
    if(!tipo)return;if(wrap)wrap.classList.toggle('hidden',tipo.value!=='parcelado');
    if(!preview||tipo.value!=='parcelado'){if(preview)preview.textContent='';return;}
    const total=parseInt(($('#fm_valor')&&$('#fm_valor').dataset.cents)||'0',10)/100;
    const qtd=Math.max(2,Math.round(Number(($('#fm_parcelas')&&$('#fm_parcelas').value)||2)));
    preview.textContent=`(${brlPlain(Math.round((total/qtd)*100)/100)} cada)`;
  }
  wireSegmented('#fm_pagamento_origem_group','#fm_pagamento_origem',syncPaymentSourceUI);
  wireSegmented('#fm_conta_forma_group','#fm_conta_forma');
  wireSegmented('#fm_status_group','#fm_status');
  if($('#fm_credito_tipo'))$('#fm_credito_tipo').onchange=updateCreditoParcelPreview;
  if($('#fm_parcelas'))$('#fm_parcelas').oninput=updateCreditoParcelPreview;
  if($('#fm_valor'))$('#fm_valor').addEventListener('input',updateCreditoParcelPreview);
  syncPaymentSourceUI(initialPaymentSource);

  $('#fm_save').onclick=()=>{
    const nome=$('#fm_nome').value.trim()||'Sem nome';
    const localCompra=($('#fm_local').value||'').trim();
    const categoria=$('#fm_categoria').value;
    if(categoria==='__new__'){alert('Confirme o nome da nova categoria antes de salvar.');return;}
    const valor=parseInt($('#fm_valor').dataset.cents||'0',10)/100;
    if(valor<=0){alert('Digite um valor maior que zero.');return;}
    const dataCadastro=$('#fm_data').value||fixedDateInitial||todayISO();
    const dia=Math.min(31,Math.max(1,parseInt(dataCadastro.slice(8,10),10)||1));
    const newStartMonth=dataCadastro.slice(0,7)||monthKey(todayYM().y,todayYM().m);
    const source=$('#fm_pagamento_origem').value;
    const requestedStatus=$('#fm_status').value==='Pago'?'Pago':'Em aberto';
    const inPlace=isEdit&&existing.startMonth===monthKeyNow;

    if(source==='credito'){
      const cartao=(S.data.cartoes||[]).find(c=>c.id===$('#fm_cartao').value);
      if(!cartao){alert('Escolha um cartão de crédito válido.');return;}
      const parcelaTotal=$('#fm_credito_tipo').value==='parcelado'?Math.max(2,Math.round(Number($('#fm_parcelas').value)||2)):1;
      const valorParcela=Math.round((valor/parcelaTotal)*100)/100;
      const ok=runAtomicFinancialMutation(()=>{
        if(isEdit){
          refundAndCleanFixaOcorrencias(existing.id,inPlace?null:monthKeyNow);
          if(inPlace)S.data.fixas=S.data.fixas.filter(x=>x.id!==existing.id);else existing.endMonth=monthBeforeKey(monthKeyNow);
        }
        const p={id:uid(),descricao:nome,local:localCompra,categoria:categoria||'Outro',valorParcela,parcelaTotal,dataCompra:newStartMonth,dataCompraCompleta:dataCadastro,diaEntrada:dia,apareceDespesas:true,despesaTipo:'fixa',statusPagamento:requestedStatus,statusFaturaPorCompetencia:{},despesaTransacaoId:null,despesaTransacaoIds:[],despesaFixaId:null};
        cartao.parcelas.push(p);linkParcelaToDespesa(cartao,p);
      },()=>alert('Não foi possível salvar a compra no cartão. Os dados anteriores foram preservados.'));
      if(!ok)return;
      saveCurrentData();closeModal();renderView();toast('Compra fixa adicionada ao cartão '+cartao.banco+' e à aba Despesa fixa.');return;
    }

    let origemPagamento='conta',formaPagamento=null,accountId=null,banco='',reservaBox=null;
    if(source==='carteira'){
      accountId=requireAccountId(CARTEIRA_CONTA_ID,'A Carteira precisa estar disponível.');if(!accountId)return;
      banco=accountNameSnapshot(accountId);formaPagamento='Dinheiro';
    }else if(source==='conta'){
      accountId=requireAccountId($('#fm_banco').value,'Escolha a conta de onde sai o dinheiro.');if(!accountId)return;
      banco=accountNameSnapshot(accountId);formaPagamento=$('#fm_conta_forma').value==='Débito'?'Débito':'Pix';
    }else if(source==='reserva'){
      reservaBox=reservaBoxesFixa.find(r=>r.id===$('#fm_reserva_pg_box').value);
      if(!reservaBox){toast('Escolha uma reserva válida.');return;}
      origemPagamento='reserva';banco=reservaBox.banco||'';
      if(requestedStatus==='Pago'&&!(currentRec&&currentRec.pago)&&!reservaTemSaldo(reservaBox,valor)){showReservaInsuficienteModal(reservaBox,valor);return;}
    }

    let prepare={ok:true,noop:true};
    if(isEdit&&requestedStatus==='Pago'){
      prepare=prepareFixaOcorrenciaEdit(existing.id,monthKeyNow,valor,origemPagamento,reservaBox&&reservaBox.id,nome);
      if(!prepare.ok){
        if(prepare.reason==='saldo_insuficiente')showReservaInsuficienteModal(prepare.box,prepare.necessario);
        else toast('Não foi possível manter o pagamento com a origem escolhida.');
        return;
      }
    }

    let target=null;
    const ok=runAtomicFinancialMutation(()=>{
      if(isEdit&&requestedStatus==='Em aberto'&&currentRec&&currentRec.pago)undoFixaOcorrencia(existing,monthKeyNow,{persist:false,notify:false});
      const payload={nome,localCompra,categoria,valor,dia,dataCadastro,accountId:origemPagamento==='conta'?accountId:null,banco,formaPagamento:origemPagamento==='conta'?formaPagamento:null,origemPagamento,reservaOrigemId:origemPagamento==='reserva'?reservaBox.id:null};
      if(isEdit){
        const targetId=inPlace?existing.id:uid();
        if(inPlace){Object.assign(existing,payload);target=existing;}
        else{existing.endMonth=monthBeforeKey(monthKeyNow);target=Object.assign({id:targetId,startMonth:monthKeyNow,endMonth:null},payload);S.data.fixas.push(target);}
        if(requestedStatus==='Pago'){
          if(prepare.ok&&!prepare.noop)prepare.commit(targetId,accountId||banco);
          else if(!fixaOcorrenciaFor(targetId,monthKeyNow)&&!payFixaOcorrencia(target,monthKeyNow,{persist:false,notify:false}))throw new Error('Falha ao aplicar pagamento da despesa fixa.');
        }
      }else{
        target=Object.assign({id:uid(),startMonth:newStartMonth,endMonth:null},payload);S.data.fixas.push(target);
        if(requestedStatus==='Pago'&&!payFixaOcorrencia(target,newStartMonth,{persist:false,notify:false}))throw new Error('Falha ao aplicar pagamento da despesa fixa.');
      }
    },()=>alert('Não foi possível salvar. A despesa fixa e os saldos anteriores foram preservados.'));
    if(!ok)return;
    saveCurrentData();closeModal();renderView();toast(isEdit?'Despesa fixa atualizada.':(requestedStatus==='Pago'?'Despesa fixa adicionada como paga.':'Despesa fixa adicionada em aberto.'));
  };

  if(isEdit){
    $('#fm_delete').onclick=()=>{
      const snapshot=JSON.parse(JSON.stringify(S.data));
      const deletingEntirely=existing.startMonth===monthKeyNow;
      refundAndCleanFixaOcorrencias(existing.id,deletingEntirely?null:monthKeyNow);
      if(deletingEntirely)S.data.fixas=S.data.fixas.filter(x=>x.id!==existing.id);else existing.endMonth=monthBeforeKey(monthKeyNow);
      saveCurrentData();closeModal();renderView();
      showUndoToast('Despesa fixa removida a partir deste mês.',()=>{S.data=snapshot;saveCurrentData();renderView();});
    };
  }
}

