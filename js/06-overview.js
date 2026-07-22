/* Borion Finance — Tela Visão Geral, cards, resumos, gráficos e cálculos auxiliares da visão geral. */

/* ---------------- VIEW: OVERVIEW ---------------- */

/* ---------------- Visão Geral: cálculos auxiliares ---------------- */
function caixaDisponivel(){ return liquidezTotal() + sumBy(S.data.investimentos.emCaixa.filter(c=>bankMatches(c.banco,c.accountId)),'valor'); }
function patrimonioLiquido(){ return liquidezTotal() + reservasTotal() + investAtualTotal(); }

function fluxoMensalData(){
  const keys = last12MonthsKeys();
  const labels = keys.map(k=>shortMonthLabel(k));
  const receitas = keys.map(k=>{ const [y,mm]=k.split('-').map(Number); return receitaMes(y,mm-1); });
  const despesas = keys.map(k=>{ const [y,mm]=k.split('-').map(Number); return despesasMes(y,mm-1); });
  return {labels, receitas, despesas};
}
function evolucaoPatrimonioData(){
  const keys = last12MonthsKeys();
  const labels = keys.map(k=>shortMonthLabel(k));
  const raw = keys.map(k=> S.data.patrimonioHistorico[k]);
  const firstKnown = raw.find(v=>v!=null);
  if(firstKnown==null) return {labels, values:null};
  let last = firstKnown;
  const values = raw.map(v=>{ if(v!=null){ last=v; return v; } return last; });
  return {labels, values};
}
function evolucaoDividasData(){
  const keys = last12MonthsKeys();
  const labels = keys.map(k=>shortMonthLabel(k));
  const values = keys.map(k=>{ const [y,mm]=k.split('-').map(Number); return computeCardsDebt(y,mm-1).total; });
  return {labels, values};
}
function gastosPorCategoriaSegments(y=S.month.y, m=S.month.m){
  const totals = {};
  fixasAtivasNoMes(y,m).forEach(f=> totals[f.categoria]=(totals[f.categoria]||0)+Number(f.valor||0));
  txInMonth(S.data.transacoes.filter(t=>t.tipo==='variavel'&&bankMatches(t.banco,t.accountId)), y, m).forEach(t=> totals[t.categoria]=(totals[t.categoria]||0)+Number(t.valor||0));
  const assinaturaPeriod=monthKey(y,m);
  assinaturasAtivasNoMes(y,m).filter(a=>!assinaturaTemDespesaNoMes(a.assinaturaId||a.id,assinaturaPeriod)).forEach(a=> totals[a.categoria]=(totals[a.categoria]||0)+Number(a.valor||0));
  return Object.keys(totals).map(k=>({label:k, value:totals[k], color:catColor(k)}));
}
function gastosPorCartaoSegments(y=S.month.y, m=S.month.m){
  return S.data.cartoes.filter(c=>bankMatches(c.banco)).map(c=>{
    let total=0;
    c.parcelas.forEach(p=>{ const st=parcelaStatus(p,y,m); if(st.ativo) total+=p.valorParcela; });
    return {label:c.banco, value:total, color:bankColor(c.banco)};
  }).filter(s=>s.value>0);
}
function bankDistribuicaoSegments(){
  return allBankNames().map(bn=>{
    const saldo = saldoBancoNome(bn)
      + (reservasEnabled() ? sumBy((S.data.reservas.boxes||[]).filter(r=>r.banco===bn),'valorAtual') : 0)
      + sumBy(S.data.investimentos.emCaixa.filter(c=>c.banco===bn),'valor')
      + sumBy(S.data.investimentos.ativos.filter(a=>a.banco===bn),'atual');
    return {label:bn, value:saldo, color:bankColor(bn)};
  }).filter(s=>s.value>0);
}
function bankSummaryList(y=S.month.y, m=S.month.m){
  return allBankNames().map(bn=>{
    const saldoAtual = saldoBancoNome(bn)
      + (reservasEnabled() ? sumBy((S.data.reservas.boxes||[]).filter(r=>r.banco===bn),'valorAtual') : 0)
      + sumBy(S.data.investimentos.emCaixa.filter(c=>c.banco===bn),'valor')
      - S.data.cartoes.filter(c=>c.banco===bn).reduce((acc,c)=>{
          let d=0; c.parcelas.forEach(p=>{ const st=parcelaStatus(p,y,m); if(st.ativo) d+=Math.round((p.valorParcela*(p.parcelaTotal-st.atual+1))*100)/100; });
          return acc+d;
        },0);
    const receitas = sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='receita'&&t.banco===bn), y, m),'valor');
    const despesasFixas = sumBy(fixasAtivasNoMes(y,m).filter(f=>f.banco===bn),'valor');
    const despesasVar = sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='variavel'&&t.banco===bn), y, m),'valor');
    const despesas = despesasFixas+despesasVar;
    const investVinc = sumBy(S.data.investimentos.ativos.filter(a=>a.banco===bn),'atual');
    const reservas = reservasEnabled() ? sumBy((S.data.reservas.boxes||[]).filter(r=>r.banco===bn),'valorAtual') : 0;
    return {nome:bn, cor:bankColor(bn), saldoAtual, receitas, despesas, saldoLiquido:receitas-despesas, investVinc, reservas};
  });
}
function healthPercent(value){ return Number.isFinite(value) ? Math.round(value*10)/10 : 0; }
function healthClamp(value,min=0,max=100){ return Math.max(min,Math.min(max,Number(value)||0)); }
function monthlyDebtCommitment(y=S.month.y,m=S.month.m){
  const debt=computeCardsDebt(y,m);
  return Math.round((debt.detail||[]).reduce((sum,item)=>sum+(Number(item.valorParcela)||0),0)*100)/100;
}
function monthlyYields(y=S.month.y,m=S.month.m){
  const key=monthKey(y,m);
  const yieldTx=(S.data.transacoes||[]).filter(t=>t.tipo==='receita'&&t.origem==='rendimento'&&bankMatches(t.banco,t.accountId));
  const income=sumBy(txInMonth(yieldTx,y,m),'valor');
  const linkedIds=new Set(yieldTx.map(t=>t.id));
  const reserve=((S.data.reservas&&S.data.reservas.moves)||[]).filter(mv=>mv&&mv.tipo==='Rendimento'&&String(mv.data||'').startsWith(key)&&bankMatches(mv.banco)&&!linkedIds.has(mv.transacaoId)).reduce((sum,mv)=>sum+(Number(mv.valor)||0),0);
  return Math.round((income+reserve)*100)/100;
}
function healthYearMonths(y){
  const selected=Number(y); const now=todayYM();
  if(selected<now.y) return 12;
  if(selected>now.y) return Math.max(1,S.month.m+1);
  return Math.max(1,Math.min(12,Math.max(now.m,S.month.m)+1));
}
function annualFlow(y=S.month.y){
  const months=healthYearMonths(y); let income=0,expenses=0,debtCommitment=0,yields=0;
  for(let m=0;m<months;m+=1){ income+=receitaMes(y,m); expenses+=despesasMes(y,m); debtCommitment+=monthlyDebtCommitment(y,m); yields+=monthlyYields(y,m); }
  return {months,income:Math.round(income*100)/100,expenses:Math.round(expenses*100)/100,debtCommitment:Math.round(debtCommitment*100)/100,yields:Math.round(yields*100)/100};
}
function patrimonioTrendPercent(months=4){
  const keys=last12MonthsKeys();
  const points=keys.map(k=>({key:k,value:S.data.patrimonioHistorico&&S.data.patrimonioHistorico[k]})).filter(p=>Number.isFinite(Number(p.value)));
  const current={key:monthKey(S.month.y,S.month.m),value:patrimonioTotal()};
  if(!points.some(p=>p.key===current.key)) points.push(current);
  points.sort((a,b)=>a.key.localeCompare(b.key));
  const slice=points.slice(-Math.max(2,months));
  if(slice.length<2||Math.abs(Number(slice[0].value)||0)<0.01) return 0;
  return ((Number(slice[slice.length-1].value)-Number(slice[0].value))/Math.abs(Number(slice[0].value)))*100;
}
function healthStatus(score){
  if(score>=85) return {label:'Excelente',tone:'excellent'};
  if(score>=70) return {label:'Saudável',tone:'good'};
  if(score>=50) return {label:'Atenção',tone:'attention'};
  return {label:'Crítica',tone:'critical'};
}
function healthAnalysis(kind='monthly'){
  const monthly=kind==='monthly';
  const year=S.month.y;
  const annual=annualFlow(year);
  const income=monthly?receitaMes():annual.income;
  const expenses=monthly?despesasMes():annual.expenses;
  const result=income-expenses;
  const debtCommitment=monthly?monthlyDebtCommitment():annual.debtCommitment;
  const yields=monthly?monthlyYields():annual.yields;
  const available=disponivelEmConta();
  const reserves=reservasTotal();
  const patrimony=patrimonioTotal();
  const debt=computeCardsDebt().total;
  const savingsPct=income>0?(result/income)*100:(result<0?-100:0);
  const commitmentPct=income>0?(expenses/income)*100:(expenses>0?100:0);
  const debtIncomePct=income>0?(debtCommitment/income)*100:(debtCommitment>0?100:0);
  const avgMonthlyExpense=monthly?expenses:(annual.months?expenses/annual.months:0);
  const emergencyMonths=avgMonthlyExpense>0?(available+reserves)/avgMonthlyExpense:((available+reserves)>0?12:0);
  const incomeBasis=monthly?income*12:income;
  const debtStockPct=incomeBasis>0?(debt/incomeBasis)*100:(debt>0?100:0);
  const trendPct=patrimonioTrendPercent(monthly?4:12);

  let score=0;
  score += result>=0 ? 15 : healthClamp(15+(result/(expenses||1))*15,0,15);
  score += savingsPct>=20?20:savingsPct>=10?15:savingsPct>0?8:0;
  score += commitmentPct<=70?15:commitmentPct<=90?8:commitmentPct<=100?3:0;
  score += debtIncomePct<=20?15:debtIncomePct<=35?10:debtIncomePct<=50?4:0;
  score += emergencyMonths>=6?15:emergencyMonths>=3?12:emergencyMonths>=1?6:0;
  score += debtStockPct<=50?10:debtStockPct<=100?6:debtStockPct<=200?2:0;
  score += trendPct>2?10:trendPct>=0?7:trendPct>-5?3:0;
  score=Math.round(healthClamp(score));

  const positives=[]; const alerts=[];
  if(result>=0) positives.push(`Resultado positivo de ${brl(result)} no período.`); else alerts.push(`Déficit de ${brl(Math.abs(result))}: as despesas superaram a renda.`);
  if(savingsPct>=20) positives.push(`Economia forte: ${healthPercent(savingsPct)}% da renda permaneceu livre.`);
  else if(savingsPct<10) alerts.push(`Percentual economizado baixo (${healthPercent(savingsPct)}%).`);
  if(emergencyMonths>=3) positives.push(`Liquidez e reservas cobrem cerca de ${healthPercent(emergencyMonths)} meses de despesas.`);
  else alerts.push(`Proteção financeira cobre apenas ${healthPercent(emergencyMonths)} mês(es) de despesas.`);
  if(debtIncomePct>35) alerts.push(`Parcelas e boletos comprometem ${healthPercent(debtIncomePct)}% da renda do período.`);
  else positives.push(`Comprometimento com dívidas está em ${healthPercent(debtIncomePct)}% da renda.`);
  if(trendPct<0) alerts.push(`Patrimônio em tendência de queda (${healthPercent(trendPct)}%).`);
  else if(trendPct>0) positives.push(`Patrimônio em tendência de crescimento (${healthPercent(trendPct)}%).`);

  return {
    kind,score,status:healthStatus(score),period:monthly?monthLabel(S.month.y,S.month.m):`${year} · ${annual.months} mês(es) analisado(s)`,
    income,expenses,result,patrimony,available,reserves,yields,debt,trendPct,
    commitmentPct,debtIncomePct,savingsPct,emergencyMonths,debtStockPct,
    positives:positives.slice(0,3),alerts:alerts.slice(0,3)
  };
}
function financialHealthCardHTML(analysis){
  const metrics=[
    ['Receita',analysis.income],['Despesas',analysis.expenses],['Resultado',analysis.result],['Rendimentos',analysis.yields]
  ];
  return `<article class="health-analysis-card ${analysis.status.tone}">
    <div class="health-card-head"><div><small>${analysis.kind==='monthly'?'SAÚDE MENSAL':'SAÚDE ANUAL'}</small><h4>${esc(analysis.period)}</h4></div><div class="health-score"><strong>${analysis.score}</strong><span>/100</span><em>${analysis.status.label}</em></div></div>
    <div class="health-progress"><span style="width:${analysis.score}%"></span></div>
    <div class="health-metrics">${metrics.map(([label,value])=>`<div><span>${label}</span><b class="${label==='Resultado'&&value<0?'negative':''}">${brl(value)}</b></div>`).join('')}</div>
    <div class="health-ratios">
      <div><span>Renda comprometida</span><b>${healthPercent(analysis.commitmentPct)}%</b></div>
      <div><span>Dívidas / renda</span><b>${healthPercent(analysis.debtIncomePct)}%</b></div>
      <div><span>Percentual economizado</span><b>${healthPercent(analysis.savingsPct)}%</b></div>
      <div><span>Proteção financeira</span><b>${healthPercent(analysis.emergencyMonths)} meses</b></div>
      <div><span>Evolução patrimonial</span><b class="${analysis.trendPct<0?'negative':''}">${analysis.trendPct>=0?'+':''}${healthPercent(analysis.trendPct)}%</b></div>
      <div><span>Dívida total</span><b>${brl(analysis.debt)}</b></div>
    </div>
    <div class="health-findings">${analysis.positives.map(text=>`<p class="positive">✔ ${esc(text)}</p>`).join('')}${analysis.alerts.map(text=>`<p class="warning">⚠ ${esc(text)}</p>`).join('')||'<p class="positive">✔ Nenhum alerta relevante neste período.</p>'}</div>
  </article>`;
}


/* ---------------- VIEW: OVERVIEW ---------------- */
function dashboardWidgetKeys(){
  const saved = (S.data.dashboard && Array.isArray(S.data.dashboard.widgets)) ? S.data.dashboard.widgets : DEFAULT_DASHBOARD_WIDGETS.slice();
  const keys=saved.filter(k=>DEFAULT_DASHBOARD_WIDGETS.includes(k));
  return window.ModuleLayout?ModuleLayout.applyOrder('overview_modules',keys.map(id=>({id}))).map(item=>item.id):keys;
}
function dashboardWidgetHTML(key, ctx){
  if(key==='fluxoMensal') return `<div class="panel-box"><div class="panel-title">Fluxo mensal — receitas x despesas (12 meses)</div>${renderBarChart({labels:ctx.fluxo.labels, series:[{name:'Receita', color:iconColor('receita'), values:ctx.fluxo.receitas},{name:'Despesa', color:iconColor('despesas'), values:ctx.fluxo.despesas}]})}</div>`;
  if(key==='evolucaoPatrimonio') return `<div class="panel-box"><div class="panel-title">Evolução do patrimônio</div>${ctx.evolPat.values ? renderLineChart({labels:ctx.evolPat.labels, series:[{name:'Patrimônio', color:iconColor('investimentos'), values:ctx.evolPat.values}]}) : '<div class="empty-note">O histórico começa a partir de agora — volte em alguns meses para ver a evolução.</div>'}</div>`;
  if(key==='evolucaoDividasCartao') return `<div class="panel-box"><div class="panel-title">Evolução das dívidas (cartões + boletos)</div>${renderLineChart({labels:ctx.evolDiv.labels, series:[{name:'Dívida', color:iconColor('dividas'), values:ctx.evolDiv.values}]})}</div>`;
  if(key==='distribuicaoPatrimonio') return `<div class="panel-box"><div class="panel-title">Distribuição do patrimônio</div>${renderDonut(ctx.composicaoSegs)}</div>`;
  if(key==='gastosCategoria') return `<div class="panel-box"><div class="panel-title">Gastos por categoria (${monthLabel(S.month.y,S.month.m)})</div>${renderDonut(ctx.gastosCat)}</div>`;
  if(key==='gastosCartao') return `<div class="panel-box"><div class="panel-title">Gastos por cartão (${monthLabel(S.month.y,S.month.m)})</div>${ctx.gastosCartao.length ? renderBarChart({labels:ctx.gastosCartao.map(g=>g.label), series:[{name:'Fatura do mês', color:iconColor('dividas'), values:ctx.gastosCartao.map(g=>g.value)}]}) : '<div class="empty-note">Nenhuma parcela ativa em cartão neste mês.</div>'}</div>`;
  if(key==='distribuicaoBanco') return `<div class="panel-box"><div class="panel-title">Distribuição por banco</div>${ctx.bankSegs.length ? renderDonut(ctx.bankSegs) : '<div class="empty-note">Cadastre bancos/contas e vincule lançamentos a eles para ver esta distribuição.</div>'}</div>`;
  if(key==='resumoBanco') return `<div class="panel-box"><div class="panel-title">Resumo por banco</div>${ctx.bankSummary.length ? `
        <table>
          <thead><tr><th>Banco</th><th>Saldo atual</th><th>Receitas (mês)</th><th>Despesas (mês)</th><th>Saldo líq. (mês)</th><th>Investido</th><th>Reservas</th></tr></thead>
          <tbody>
            ${ctx.bankSummary.map(b=>`<tr>
              <td><span class="cat-pill"><span class="dot" style="background:${b.cor}"></span>${esc(b.nome)}</span></td>
              <td style="font-weight:700">${brl(b.saldoAtual)}</td>
              <td class="val-pos">${brl(b.receitas)}</td>
              <td>${brl(b.despesas)}</td>
              <td class="${b.saldoLiquido>=0?'val-pos':''}">${brl(b.saldoLiquido)}</td>
              <td>${brl(b.investVinc)}</td>
              <td>${brl(b.reservas)}</td>
            </tr>`).join('')}
          </tbody>
        </table>` : '<div class="empty-note">Cadastre bancos/contas em "Cartões e Contas" e vincule seus lançamentos a eles para ver o resumo por banco.</div>'}</div>`;
  return '';
}
function renderOverview(){
  const pt = patrimonioTotal();
  const inv = investAtualTotal();
  const desp = despesasMes();
  const rec = receitaMes();
  const saldo = saldoMes();
  const resultado = resultadoPeriodo();
  const disponivel = disponivelEmConta();
  const dividasDebt = computeCardsDebt();
  const divCartao = dividasDebt.cartoesTotal;
  const divBoletos = dividasDebt.boletosTotal;
  const patLiq = patrimonioLiquido();
  const caixa = caixaDisponivel();
  const reservas = reservasTotal();
  const entradasExtra = receitaExtraMes();

  const ctx = {
    fluxo: fluxoMensalData(),
    evolPat: evolucaoPatrimonioData(),
    evolDiv: evolucaoDividasData(),
    composicaoSegs: patrimonioComposicaoSegments(),
    gastosCat: gastosPorCategoriaSegments(),
    gastosCartao: gastosPorCartaoSegments(),
    bankSegs: bankDistribuicaoSegments(),
    bankSummary: bankSummaryList()
  };
  const saudeMensal = healthAnalysis('monthly');
  const saudeAnual = healthAnalysis('annual');
  const widgets = dashboardWidgetKeys();
  const wideWidgets=new Set(['fluxoMensal','gastosCartao','resumoBanco']);
  const widgetsHTML = widgets.map(k=>{const defaultW=wideWidgets.has(k)?4:2;return `<div class="module-layout-slot ${window.ModuleLayout&&ModuleLayout.isActive('overview_modules')?'organizing':''}" data-module-id="${esc(k)}" style="${window.ModuleLayout?ModuleLayout.slotStyle('overview_modules',k,defaultW):'--module-span:'+defaultW+';'}">${window.ModuleLayout?ModuleLayout.slotControlsHTML('overview_modules',k,k,defaultW):''}<div class="module-layout-content">${dashboardWidgetHTML(k, ctx)}</div></div>`;}).join('');
  if(window.ModuleLayout) ModuleLayout.schedule('overview_modules');

  return `
    <div class="indicators-grid">
      <div class="card card-sm hero-gold"><div class="clabel">Patrimônio Total</div><div class="cval">${brl(pt)}</div></div>
      <div class="card card-sm hero-green"><div class="clabel">Disponível em Conta</div><div class="cval">${brl(disponivel)}</div></div>
      <div class="card card-sm"><div class="clabel">Receitas do período</div><div class="cval" style="color:${iconColor('receita')}">${brl(rec)}</div></div>
      <div class="card card-sm"><div class="clabel">Despesas do período</div><div class="cval" style="color:${iconColor('despesas')}">${brl(desp)}</div></div>
    </div>
    <div class="indicators-grid">
      <div class="card card-sm hero-blue"><div class="clabel">Resultado do período</div><div class="cval" style="color:${resultado>=0?iconColor('receita'):iconColor('despesas')}">${brl(resultado)}</div></div>
      <div class="card card-sm"><div class="clabel">Total investido</div><div class="cval">${brl(inv)}</div></div>
      <div class="card card-sm"><div class="clabel">Total em reserva</div><div class="cval" style="color:var(--gold-bright)">${brl(reservas)}</div></div>
      <div class="card card-sm"><div class="clabel">Patrimônio líquido</div><div class="cval">${brl(patLiq)}</div></div>
    </div>

    <div class="overview-top-grid">
      <div class="panel-box">
        <div class="panel-title">Resumo rápido de ${monthLabel(S.month.y,S.month.m)}</div>
        <div class="list-row"><span class="lname">Receitas do período</span><span class="lval val-pos">${brl(rec)}</span></div>
        <div class="list-row"><span class="lname">Despesas do período</span><span class="lval" style="color:${iconColor('despesas')}">- ${brl(desp)}</span></div>
        <div class="list-row"><span class="lname">Resultado do período</span><span class="lval ${resultado>=0?'val-pos':''}" style="${resultado<0?'color:'+iconColor('despesas'):''}">${brl(resultado)}</span></div>
        <div class="list-row"><span class="lname">Crédito usado em cartões</span><span class="lval" style="color:${iconColor('dividas')}">- ${brl(divCartao)}</span></div>
        <div class="list-row"><span class="lname">Boletos a pagar</span><span class="lval" style="color:${iconColor('dividas')}">- ${brl(divBoletos)}</span></div>
        <div class="list-row"><span class="lname">Reserva (patrimônio guardado)</span><span class="lval" style="color:var(--gold-bright)">${brl(reservas)}</span></div>
        <div class="list-row"><span class="lname">Disponível em conta (fora das reservas)</span><span class="lval">${brl(disponivel)}</span></div>
        ${entradasExtra>0?`<div class="list-row"><span class="lname">Reembolsos/repasses recebidos (não é renda)</span><span class="lval" style="color:var(--gold-bright)">${brl(entradasExtra)}</span></div>`:''}
      </div>

      <div class="panel-box financial-health-panel">
        <div class="panel-title">◆ Saúde financeira</div>
        <p class="financial-health-copy">Duas leituras independentes, calculadas com renda, despesas, patrimônio, liquidez, reservas, rendimentos, dívidas, economia e tendência patrimonial.</p>
        <div class="financial-health-grid">${financialHealthCardHTML(saudeMensal)}${financialHealthCardHTML(saudeAnual)}</div>
      </div>
    </div>

    ${widgets.length ? `${window.ModuleLayout?ModuleLayout.toolbarHTML('overview_modules','Organização da Visão Geral'):''}<div class="module-layout-grid dashboard-module-grid ${window.ModuleLayout&&ModuleLayout.isActive('overview_modules')?'module-grid-organizer':''}" data-module-layout="overview_modules" style="--module-columns:${window.ModuleLayout?ModuleLayout.get('overview_modules').columns:4};">${widgetsHTML}</div>` : `<div class="panel-box"><div class="empty-note">Todos os blocos da visão geral estão desativados. Ative os gráficos em Configurações → Dashboard.</div></div>`}
  `;
}
