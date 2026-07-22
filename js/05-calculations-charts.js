/* Borion Finance — Cálculos financeiros, parcelas, gráficos SVG e histórico de patrimônio. */

/* ---------------- computations ---------------- */
function txInMonth(list, y, m){
  const key = monthKey(y,m);
  return list.filter(t=>t.data && t.data.startsWith(key));
}
function sumBy(list, key){ return list.reduce((a,b)=>a+(Number(b[key])||0),0); }

function fixasAtivasNoMes(y=S.month.y, m=S.month.m){
  const key = monthKey(y,m);
  return S.data.fixas.filter(f=> f.startMonth<=key && (!f.endMonth || key<=f.endMonth) && bankMatches(f.banco,f.accountId));
}
/* V5.37.0 — lista de {y,m,key} (y/m 0-indexados, no formato usado por S.month) entre
   duas datas ISO (yyyy-mm-dd), inclusive, cobrindo cada mês tocado pelo intervalo.
   Usado pelo filtro de período de Orçamento, que pode olhar vários meses (inclusive
   anteriores) de uma vez, sem depender do mês selecionado no calendário do topo. */
function monthsBetweenISO(fromISO, toISO){
  if(!fromISO || !toISO) return [];
  let a = fromISO.slice(0,7), b = toISO.slice(0,7);
  if(b<a){ const t=a; a=b; b=t; }
  const out=[];
  let cur=a, guard=0;
  while(cur<=b && guard<600){
    const [y,m] = cur.split('-').map(Number); // m aqui é 1-indexado (formato "YYYY-MM")
    out.push({y, m:m-1, key:cur});
    cur = shiftYM(cur, 1);
    guard++;
  }
  return out;
}
/* V6.1 — janela de meses (passado + futuro) em volta do mês atual real (não do mês
   selecionado no topo), usada pela Central de Lançamentos para listar ocorrências de
   despesa fixa sem precisar varrer todo o histórico. */
function monthsAroundToday(back=24, fwd=2){
  const baseKey = monthKey(todayYM().y, todayYM().m);
  const fromKey = shiftYM(baseKey, -back), toKey = shiftYM(baseKey, fwd);
  return monthsBetweenISO(fromKey+'-01', toKey+'-01');
}
/* V6.1 — ocorrência (mês) de uma despesa fixa: existe um registro em fixaPagamentos só
   quando a ocorrência já foi marcada como paga; sem registro = pendente (nunca retirou
   dinheiro de conta/reserva só por a despesa fixa estar cadastrada no mês). */
function fixaOcorrenciaFor(fixaId, mesKey){
  return (S.data.fixaPagamentos||[]).find(r=>r.fixaId===fixaId && r.mesKey===mesKey) || null;
}
function fixaOcorrenciaStatus(f, mesKey){
  /* V6.27.1 — o status da despesa fixa é único e compartilhado com Cartões e Contas.
     Cartão: acompanha o status individual da parcela no mês e também herda o pagamento
     da fatura inteira. Boleto: acompanha o pagamento da competência. Conta/Carteira/
     Reserva continuam usando fixaPagamentos. */
  if(f && f.viaParcelaId){
    const cartao=(S.data.cartoes||[]).find(c=>c.id===f.viaCartaoId);
    const parcela=cartao&&(cartao.parcelas||[]).find(p=>p.id===f.viaParcelaId);
    if(cartao&&parcela&&parcelaCompetenciaPaga(cartao.id,parcela,mesKey)) return 'Pago';
  }
  if(f && f.viaBoletoId && isBoletoCompetenciaPaga(f.viaBoletoId,mesKey)) return 'Pago';
  const rec = fixaOcorrenciaFor(f.id, mesKey);
  if(rec && rec.pago) return 'Pago';
  const dueDate = mesKey+'-'+pad2(f.dia||1);
  return dueDate < todayISO() ? 'Vencido' : 'Pendente';
}
function fixaMes(y=S.month.y, m=S.month.m){ return sumBy(fixasAtivasNoMes(y,m),'valor'); }
function variavelMes(y=S.month.y, m=S.month.m){ return sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='variavel'&&bankMatches(t.banco,t.accountId)), y, m),'valor'); }
/* Receita do mês = dinheiro próprio + rendimentos. Reembolso/repasse de terceiros não contam como renda. */
function receitaMes(y=S.month.y, m=S.month.m){ return sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='receita'&&(t.origem==null||t.origem==='propria'||t.origem==='rendimento')&&bankMatches(t.banco,t.accountId)), y, m),'valor'); }
/* Entradas que não são renda própria: reembolsos recebidos + repasses de terceiros (ex: alguém te manda dinheiro para pagar uma conta). */
function receitaExtraMes(y=S.month.y, m=S.month.m){ return sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='receita'&&(t.origem==='reembolso'||t.origem==='repasse')&&bankMatches(t.banco,t.accountId)), y, m),'valor'); }
function reembolsosMes(y=S.month.y, m=S.month.m){ return sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='receita'&&t.origem==='reembolso'&&bankMatches(t.banco,t.accountId)), y, m),'valor'); }
function repassesMes(y=S.month.y, m=S.month.m){ return sumBy(txInMonth(S.data.transacoes.filter(t=>t.tipo==='receita'&&t.origem==='repasse'&&bankMatches(t.banco,t.accountId)), y, m),'valor'); }
function despesasMes(y=S.month.y, m=S.month.m){ return fixaMes(y,m)+variavelMes(y,m)+assinaturasMes(y,m); }
function investirPlanejado(){ return S.data.investirPlanejado[monthKey(S.month.y,S.month.m)] || 0; }
function saldoMes(){ return receitaMes() - despesasMes() - investirPlanejado(); }
/* V6.0 — "Resultado do período" do novo Dashboard: Receitas - Despesas, sem descontar o
   valor planejado para investir (que é só uma intenção, não uma saída de dinheiro) e sem
   nunca contar Transferências (elas não são receita nem despesa em nenhum lugar do app). */
function resultadoPeriodo(y=S.month.y, m=S.month.m){ return receitaMes(y,m) - despesasMes(y,m); }
/* "Disponível em conta": quanto dinheiro está fora das reservas — só o saldo de
   contas/carteira (liquidez), sem reserva, investimento, bem ou dívida. No perfil de quem
   guarda quase tudo em reservas (ex: Mercado Pago), isso fica perto de zero — esperado. */
function disponivelEmConta(){ return liquidezTotal(); }

/* -- credit-card installments: status is computed relative to the selected calendar month -- */
function parcelaStatus(p, y=S.month.y, m=S.month.m){
  const selYM = monthKey(y,m);
  const atual = monthDiffYM(selYM, p.dataCompra) + 1;
  return { ativo: atual>=1 && atual<=p.parcelaTotal, atual };
}
function boletoParcelaStatus(b, y=S.month.y, m=S.month.m){
  const selYM = monthKey(y,m);
  const inicio = b.dataInicio || b.dataCompra || monthKey(y,m);
  const atual = monthDiffYM(selYM, inicio) + 1;
  const ativoStatus = !['Pago','Quitado','Cancelado'].includes(b.status||'Em Aberto');
  return { ativo: ativoStatus && atual>=1 && atual<=Number(b.parcelaTotal||1), atual };
}

/* ---- histórico de pagamentos: evita recontar/negativar dívida já paga ---- */
function isFaturaPaga(cartaoId, competencia){
  const c = (S.data.cartoes||[]).find(x=>x.id===cartaoId);
  if(!c || !Array.isArray(c.faturasPagas)) return false;
  return c.faturasPagas.some(f=>f.competencia===competencia);
}
function faturaPagamentoDe(cartaoId, competencia){
  const c = (S.data.cartoes||[]).find(x=>x.id===cartaoId);
  if(!c || !Array.isArray(c.faturasPagas)) return null;
  return c.faturasPagas.find(f=>f.competencia===competencia) || null;
}
function isBoletoCompetenciaPaga(boletoId, competencia){
  const b = (S.data.boletos||[]).find(x=>x.id===boletoId);
  if(!b || !Array.isArray(b.pagamentos)) return false;
  return b.pagamentos.some(p=>p.competencia===competencia);
}
function boletoPagamentoDe(boletoId, competencia){
  const b = (S.data.boletos||[]).find(x=>x.id===boletoId);
  if(!b || !Array.isArray(b.pagamentos)) return null;
  return b.pagamentos.find(p=>p.competencia===competencia) || null;
}

/* V6.27.1 — pagamento individual de uma compra fixa no cartão por competência.
   A fatura paga também torna todas as parcelas ativas daquele mês pagas, mas o marcador
   manual é separado para que desfazer a fatura não apague uma baixa feita individualmente. */
function parcelaPagamentoIndividualFor(parcela, competencia){
  if(!parcela || !Array.isArray(parcela.pagamentosIndividuais)) return null;
  return parcela.pagamentosIndividuais.find(r=>r&&r.competencia===competencia&&r.pago!==false) || null;
}
function parcelaCompetenciaPaga(cartaoId, parcela, competencia){
  return !!(parcelaPagamentoIndividualFor(parcela,competencia) || isFaturaPaga(cartaoId,competencia));
}
function setParcelaCompetenciaPagoManual(cartaoId, parcelaId, competencia, pago){
  const cartao=(S.data.cartoes||[]).find(c=>c.id===cartaoId);
  const parcela=cartao&&(cartao.parcelas||[]).find(p=>p.id===parcelaId);
  if(!cartao||!parcela) return false;
  if(!Array.isArray(parcela.pagamentosIndividuais)) parcela.pagamentosIndividuais=[];
  parcela.pagamentosIndividuais=parcela.pagamentosIndividuais.filter(r=>r&&r.competencia!==competencia);
  if(pago) parcela.pagamentosIndividuais.push({id:uid(),competencia,pago:true,data:todayISO(),updatedAt:Date.now()});
  return true;
}

/* V6.27.3 — localiza o lançamento mensal que representa uma parcela vinculada.
   Cartão, boleto e Lançamentos passam a ler exatamente o mesmo registro de status. */
function linkedParcelaTransactionForCompetencia(parcelaId, competencia){
  return (S.data.transacoes||[]).find(t=>t&&t.tipo==='variavel'&&t.viaParcelaId===parcelaId&&String(t.data||'').slice(0,7)===competencia) || null;
}
function linkedBoletoTransactionForCompetencia(boletoId, competencia){
  return (S.data.transacoes||[]).find(t=>t&&t.tipo==='variavel'&&t.viaBoletoId===boletoId&&String(t.data||'').slice(0,7)===competencia) || null;
}
function linkedVariableStatus(tx){
  return tx&&tx.statusPagamento==='Em aberto' ? 'Em aberto' : 'Pago';
}
function parcelaDespesaStatus(cartaoId, parcela, competencia){
  if(!parcela||!parcela.apareceDespesas) return null;
  if(parcelaCompetenciaPaga(cartaoId,parcela,competencia)) return 'Pago';
  if(parcela.despesaTipo==='fixa') return 'Em aberto';
  const tx=linkedParcelaTransactionForCompetencia(parcela.id,competencia);
  return tx?linkedVariableStatus(tx):'Em aberto';
}
/* V6.33.4 — itens de fatura sem espelho em Despesas têm um status mensal próprio.
   Ele é apenas informativo: nunca cria transação, nunca altera saldo e nunca participa
   de relatórios. O mapa por competência evita que marcar julho altere agosto. */
function parcelaFaturaStatusIndependente(parcela, competencia){
  if(!parcela) return 'Em aberto';
  const map=parcela.statusFaturaPorCompetencia;
  const raw=map&&typeof map==='object'&&!Array.isArray(map)?map[competencia]:null;
  return raw==='Pago'||raw==='pago'||raw===true?'Pago':'Em aberto';
}
function parcelaFaturaStatus(cartaoId, parcela, competencia){
  if(!parcela) return 'Em aberto';
  return parcela.apareceDespesas
    ? (parcelaDespesaStatus(cartaoId,parcela,competencia)||'Em aberto')
    : parcelaFaturaStatusIndependente(parcela,competencia);
}
function setParcelaFaturaStatusIndependente(parcela, competencia, status){
  if(!parcela||!competencia) return false;
  if(!parcela.statusFaturaPorCompetencia||typeof parcela.statusFaturaPorCompetencia!=='object'||Array.isArray(parcela.statusFaturaPorCompetencia))
    parcela.statusFaturaPorCompetencia={};
  parcela.statusFaturaPorCompetencia[competencia]=status==='Pago'?'Pago':'Em aberto';
  return true;
}
function boletoDespesaStatus(boleto, competencia){
  if(!boleto||!boleto.apareceDespesas) return null;
  if(boleto.despesaTipo==='fixa') return isBoletoCompetenciaPaga(boleto.id,competencia)?'Pago':'Em aberto';
  const tx=linkedBoletoTransactionForCompetencia(boleto.id,competencia);
  return tx?linkedVariableStatus(tx):null;
}

/* Valor restante de uma parcela de cartão a partir do mês selecionado, pulando meses cuja fatura já foi marcada como paga. */
function parcelaRestanteValor(p, cartaoId, y=S.month.y, m=S.month.m){
  const st = parcelaStatus(p,y,m);
  if(!st.ativo) return {ativo:false, atual:st.atual, restante:0};
  let restante = 0;
  for(let i=st.atual;i<=p.parcelaTotal;i++){
    const comp = shiftYM(p.dataCompra, i-1);
    if(cartaoId && isFaturaPaga(cartaoId, comp)) continue;
    restante += Number(p.valorParcela)||0;
  }
  return {ativo:true, atual:st.atual, restante:Math.round(restante*100)/100};
}
/* Valor restante de um boleto a partir do mês selecionado, pulando meses/parcelas já pagos. */
function boletoRestanteValor(b, y=S.month.y, m=S.month.m){
  const st = boletoParcelaStatus(b,y,m);
  if(!st.ativo) return {ativo:false, atual:st.atual, restante:0};
  const inicio = b.dataInicio || b.dataCompra || monthKey(y,m);
  let restante = 0;
  for(let i=st.atual;i<=Number(b.parcelaTotal||1);i++){
    const comp = shiftYM(inicio, i-1);
    if(isBoletoCompetenciaPaga(b.id, comp)) continue;
    restante += Number(b.valorParcela)||0;
  }
  return {ativo:true, atual:st.atual, restante:Math.round(restante*100)/100};
}
/* ---------------- V5.39.2 — vínculo opcional entre cartão/boleto e Despesas ----------------
   Compra parcelada nunca pode jogar o valor total em uma única despesa mensal.
   Se aparecer como despesa fixa, vira uma fixa temporária com valor da parcela.
   Se aparecer como despesa variável, vira uma transação por mês/parcela, também com
   valor da parcela. O valor total fica só como referência da compra/fatura. */
function parcelaDescricaoMensal(nome, atual, total){
  return total>1 ? `${nome} (${atual}/${total})` : nome;
}
function createParcelaDespesaVariavel({nome, categoria, valorParcela, totalParcelas, startMonth, banco, formaPagamento, extra}){
  const ids=[];
  const valor = Number(valorParcela)||0;
  /* V6.35.3 — antes, toda parcela virava uma despesa variável travada no dia 01 do
     mês (data:ym+'-01'), não importa que dia o usuário tivesse escolhido na compra.
     O dia certo (diaEntrada) já era calculado e guardado na parcela do cartão — ele
     só não era usado para montar a data desta despesa espelhada. Por isso uma compra
     no crédito à vista no dia 15/07, por exemplo, aparecia em Despesas variáveis como
     01/07. Agora usamos diaEntrada (quando existir em extra) para todas as parcelas. */
  const dia = Math.max(1,Math.min(31,parseInt((extra&&extra.diaEntrada)||1,10)||1));
  for(let i=0;i<totalParcelas;i++){
    const ym = shiftYM(startMonth, i);
    const t = Object.assign({
      id:uid(), tipo:'variavel', nome:parcelaDescricaoMensal(nome, i+1, totalParcelas),
      data:ym+'-'+pad2(dia), categoria, valor, banco:banco||'', formaPagamento,
      parcelaAtual:i+1, parcelaTotal:totalParcelas
    }, extra||{});
    S.data.transacoes.push(t);
    ids.push(t.id);
  }
  return ids;
}
function linkParcelaToDespesa(cartao, parcela){
  const previousStatusByMonth={};
  if(parcela){
    (S.data.transacoes||[]).filter(t=>t&&t.viaParcelaId===parcela.id&&t.tipo==='variavel').forEach(t=>{
      previousStatusByMonth[String(t.data||'').slice(0,7)]=linkedVariableStatus(t);
    });
  }
  unlinkParcelaFromDespesa(parcela);
  if(!parcela || !parcela.apareceDespesas) return;
  const nome = parcela.descricao || 'Compra no cartão';
  const categoria = parcela.categoria || 'Outro';
  const totalParcelas = Math.max(1, Math.round(parcela.parcelaTotal||1));
  const startMonth = parcela.dataCompra || monthKey(S.month.y,S.month.m);
  const valorParcela = Number(parcela.valorParcela)||0;
  /* A despesa espelhada herda o banco/nome do cartão para respeitar o filtro por banco/cartão. */
  if(parcela.despesaTipo==='fixa'){
    const endMonth = shiftYM(startMonth, totalParcelas-1);
    /* statusPagamento era global e marcava todas as parcelas como pagas. Convertemos apenas
       a competência inicial para o novo marcador mensal compartilhado. */
    if(parcela.statusPagamento==='Pago'){
      setParcelaCompetenciaPagoManual(cartao.id,parcela.id,startMonth,true);
      parcela.statusPagamento='Em aberto';
    }
    const f = {id:uid(), nome, localCompra:parcela.local||'', categoria, valor:valorParcela, dia:parcela.diaEntrada||1, startMonth, endMonth:totalParcelas>1?endMonth:startMonth, banco:cartao.banco||'', formaPagamento:'Crédito', viaCartaoId:cartao.id, viaParcelaId:parcela.id, parcelaTotal:totalParcelas};
    S.data.fixas.push(f);
    parcela.despesaFixaId = f.id;
    parcela.despesaTransacaoId = null;
    parcela.despesaTransacaoIds = [];
  } else {
    parcela.despesaTransacaoIds = createParcelaDespesaVariavel({
      nome, categoria, valorParcela, totalParcelas, startMonth, banco:cartao.banco||'', formaPagamento:'Crédito',
      extra:{viaCartaoId:cartao.id, viaParcelaId:parcela.id, localCompra:parcela.local||'', statusPagamento:parcela.statusPagamento==='Em aberto'?'Em aberto':'Pago', diaEntrada:parcela.diaEntrada||1, viaAssinaturaId:parcela.viaAssinaturaId||null, assinaturaCobrancaId:parcela.assinaturaCobrancaId||null}
    });
    parcela.despesaTransacaoId = parcela.despesaTransacaoIds[0] || null; // compatibilidade com dados antigos
    parcela.despesaTransacaoIds.forEach(id=>{
      const tx=(S.data.transacoes||[]).find(t=>t.id===id);
      const competencia=tx&&String(tx.data||'').slice(0,7);
      if(tx&&previousStatusByMonth[competencia])tx.statusPagamento=previousStatusByMonth[competencia];
    });
    parcela.despesaFixaId = null;
  }
}
function linkBoletoToDespesa(boleto){
  const previousStatusByMonth={};
  if(boleto){
    (S.data.transacoes||[]).filter(t=>t&&t.viaBoletoId===boleto.id&&t.tipo==='variavel').forEach(t=>{
      previousStatusByMonth[String(t.data||'').slice(0,7)]=linkedVariableStatus(t);
    });
  }
  unlinkBoletoFromDespesa(boleto);
  if(!boleto || !boleto.apareceDespesas) return;
  const nome = boleto.descricao || 'Boleto';
  const categoria = boleto.categoria || 'Outro';
  const totalParcelas = Math.max(1, Math.round(boleto.parcelaTotal||1));
  const startMonth = boleto.dataInicio || monthKey(S.month.y,S.month.m);
  const valorParcela = Number(boleto.valorParcela)||0;
  if(boleto.despesaTipo==='fixa'){
    const endMonth = shiftYM(startMonth, totalParcelas-1);
    const f = {id:uid(), nome, categoria, valor:valorParcela, dia:boleto.diaVencimento||1, startMonth, endMonth:totalParcelas>1?endMonth:startMonth, banco:boleto.banco||'', viaBoletoId:boleto.id, parcelaTotal:totalParcelas};
    S.data.fixas.push(f);
    boleto.despesaFixaId = f.id;
    boleto.despesaTransacaoId = null;
    boleto.despesaTransacaoIds = [];
  } else {
    boleto.despesaTransacaoIds = createParcelaDespesaVariavel({
      nome, categoria, valorParcela, totalParcelas, startMonth, banco:boleto.banco||'', formaPagamento:'Boleto',
      extra:{viaBoletoId:boleto.id}
    });
    boleto.despesaTransacaoId = boleto.despesaTransacaoIds[0] || null;
    boleto.despesaTransacaoIds.forEach(id=>{
      const tx=(S.data.transacoes||[]).find(t=>t.id===id);
      const competencia=tx&&String(tx.data||'').slice(0,7);
      if(!tx)return;
      if(isBoletoCompetenciaPaga(boleto.id,competencia))tx.statusPagamento='Pago';
      else if(previousStatusByMonth[competencia])tx.statusPagamento=previousStatusByMonth[competencia];
    });
    boleto.despesaFixaId = null;
  }
}
function unlinkBoletoFromDespesa(boleto){
  if(!boleto) return;
  const ids = new Set([...(Array.isArray(boleto.despesaTransacaoIds)?boleto.despesaTransacaoIds:[]), boleto.despesaTransacaoId].filter(Boolean));
  S.data.transacoes = S.data.transacoes.filter(t=>!(ids.has(t.id) || (t.viaBoletoId && t.viaBoletoId===boleto.id)));
  boleto.despesaTransacaoIds = [];
  boleto.despesaTransacaoId = null;
  if(boleto.despesaFixaId){
    S.data.fixas = S.data.fixas.filter(f=>f.id!==boleto.despesaFixaId);
    boleto.despesaFixaId = null;
  }
}
function unlinkParcelaFromDespesa(parcela){
  if(!parcela) return;
  const ids = new Set([...(Array.isArray(parcela.despesaTransacaoIds)?parcela.despesaTransacaoIds:[]), parcela.despesaTransacaoId].filter(Boolean));
  S.data.transacoes = S.data.transacoes.filter(t=>!(ids.has(t.id) || (t.viaParcelaId && t.viaParcelaId===parcela.id)));
  parcela.despesaTransacaoIds = [];
  parcela.despesaTransacaoId = null;
  if(parcela.despesaFixaId){
    S.data.fixas = S.data.fixas.filter(f=>f.id!==parcela.despesaFixaId);
    parcela.despesaFixaId = null;
  }
}

/* Fatura do cartão no mês selecionado: total das parcelas ativas + se já foi marcada como paga. */
function cartaoFaturaDoMes(cartaoId, y=S.month.y, m=S.month.m){
  const c = (S.data.cartoes||[]).find(x=>x.id===cartaoId);
  const competencia = monthKey(y,m);
  if(!c) return {total:0, competencia, paga:false, pagamento:null};
  let total=0;
  (c.parcelas||[]).forEach(p=>{ const st=parcelaStatus(p,y,m); if(st.ativo) total += Number(p.valorParcela)||0; });
  total = Math.round(total*100)/100;
  return {total, competencia, paga:isFaturaPaga(cartaoId, competencia), pagamento:faturaPagamentoDe(cartaoId, competencia)};
}
/* Boleto do mês selecionado: valor da parcela ativa + se já foi marcado como pago. */
function boletoParcelaDoMes(boletoId, y=S.month.y, m=S.month.m){
  const b = (S.data.boletos||[]).find(x=>x.id===boletoId);
  const competencia = monthKey(y,m);
  if(!b) return {total:0, competencia, paga:false, pagamento:null};
  const st = boletoParcelaStatus(b,y,m);
  const total = st.ativo ? Math.round((Number(b.valorParcela)||0)*100)/100 : 0;
  return {total, competencia, paga:isBoletoCompetenciaPaga(boletoId, competencia), pagamento:boletoPagamentoDe(boletoId, competencia)};
}

function computeBoletosDebt(y=S.month.y, m=S.month.m){
  let total=0;
  const detail=[];
  (S.data.boletos||[]).filter(b=>bankMatches(b.banco,b.accountId)).forEach(b=>{
    const st = boletoRestanteValor(b,y,m);
    if(st.ativo && st.restante>0){
      total += st.restante;
      detail.push({tipoDivida:'boleto', cartao:'Boleto', descricao:b.descricao||b.credor||'Boleto', local:b.credor||'', banco:b.banco||'', valorParcela:Number(b.valorParcela)||0, parcelaTotal:Number(b.parcelaTotal)||1, atualCalc:st.atual, restante:st.restante, id:b.id});
    }
  });
  return {total: Math.round(total*100)/100, detail};
}
function computeCardsDebt(y=S.month.y, m=S.month.m){
  let total=0;
  const detail=[];
  S.data.cartoes.filter(c=>bankMatches(c.banco)).forEach(c=>{
    c.parcelas.forEach(p=>{
      const st = parcelaRestanteValor(p, c.id, y, m);
      if(st.ativo && st.restante>0){
        total += st.restante;
        detail.push({tipoDivida:'cartao', cartao:c.banco, ...p, atualCalc:st.atual, restante:st.restante});
      }
    });
  });
  total = Math.round(total*100)/100;
  const bol = computeBoletosDebt(y,m);
  return {total: Math.round((total + bol.total)*100)/100, detail: detail.concat(bol.detail), cartoesTotal: total, boletosTotal: bol.total, boletosDetail: bol.detail};
}
function investAtualTotal(){
  const ativos = sumBy(S.data.investimentos.ativos.filter(a=>bankMatches(a.banco,a.accountId)),'atual');
  const caixa = sumBy(S.data.investimentos.emCaixa.filter(c=>bankMatches(c.banco,c.accountId)),'valor');
  return ativos+caixa;
}
function investInvestidoTotal(){
  const ativos = sumBy(S.data.investimentos.ativos.filter(a=>bankMatches(a.banco,a.accountId)),'investido');
  const caixa = sumBy(S.data.investimentos.emCaixa.filter(c=>bankMatches(c.banco,c.accountId)),'valor');
  return ativos+caixa;
}
/* V6.22 — "liquidez" agora é derivada (saldo real das contas cadastradas), nunca digitada à
   mão. Mantido com este nome de função só para não precisar tocar em todo o resto do código
   que já chama liquidezTotal() (patrimônio, visão geral, saúde financeira, gráficos etc.) —
   ver saldoEmContasTotal()/saldoContasDetalhe() em 01-storage-data-state.js. */
function liquidezTotal(){ return saldoEmContasTotal(); }
function reservasEnabled(){ return !!(S.data && S.data.modules && S.data.modules.reserves !== false && S.data.reservas && S.data.reservas.enabled !== false); }
function investmentsEnabled(){ return !!(S.data && S.data.modules && S.data.modules.investments !== false); }
function agendaEnabled(){ return !!(S.data && S.data.modules && S.data.modules.agenda !== false); }
function reservasTotal(){ return reservasEnabled() ? sumBy((S.data.reservas.boxes||[]).filter(r=>bankMatches(r.banco)),'valorAtual') : 0; }
function bensTotal(){ return sumBy(S.data.bens.filter(b=>bankMatches(b.banco,b.accountId)),'valor'); }
function patrimonioTotal(){
  return liquidezTotal() + reservasTotal() + bensTotal() + investAtualTotal() - computeCardsDebt().total;
}

/* ---------------- donut chart builder (SVG, com tooltip no hover) ---------------- */
function polarPoint(cx, cy, r, angleDeg){
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r*Math.cos(rad), y: cy + r*Math.sin(rad) };
}
function donutSlicePath(cx, cy, rOuter, rInner, f0, f1){
  if(f1 - f0 >= 0.9999) f1 = f0 + 0.9999; // evita arco degenerado quando é 100%
  const a0 = -90 + f0*360, a1 = -90 + f1*360;
  const largeArc = (a1-a0) > 180 ? 1 : 0;
  const o0 = polarPoint(cx,cy,rOuter,a0), o1 = polarPoint(cx,cy,rOuter,a1);
  const i0 = polarPoint(cx,cy,rInner,a0), i1 = polarPoint(cx,cy,rInner,a1);
  return `M ${o0.x.toFixed(2)},${o0.y.toFixed(2)} A ${rOuter},${rOuter} 0 ${largeArc} 1 ${o1.x.toFixed(2)},${o1.y.toFixed(2)} L ${i1.x.toFixed(2)},${i1.y.toFixed(2)} A ${rInner},${rInner} 0 ${largeArc} 0 ${i0.x.toFixed(2)},${i0.y.toFixed(2)} Z`;
}
function renderDonut(segments, centerTop, centerBottom){
  const filtered = segments.filter(s=>s.value>0);
  const total = filtered.reduce((a,b)=>a+b.value,0);
  let acc = 0;
  const paths = filtered.map((s,idx)=>{
    const f0 = total? acc/total : 0; acc += s.value; const f1 = total? acc/total : 0;
    const pctTxt = total? Math.round(s.value/total*100)+'%' : '0%';
    const d = donutSlicePath(100,100,90,54,f0,f1);
    return `<path d="${d}" fill="${s.color}" style="animation-delay:${(idx*0.05).toFixed(2)}s" data-label="${esc(s.label)}" data-pct="${pctTxt}" data-value="${esc(brl(s.value))}" onmousemove="ChartTooltip.showEl(event,this)" onmouseleave="ChartTooltip.hide()"></path>`;
  }).join('');
  const svg = filtered.length
    ? `<svg class="donut-svg" viewBox="0 0 200 200">${paths}</svg>`
    : `<svg class="donut-svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="72" fill="none" stroke="#232b33" stroke-width="36"/></svg>`;
  const legend = filtered.map((s,idx)=>{
    const pctTxt = total? Math.round(s.value/total*100)+'%' : '0%';
    return `
    <div class="legend-item" style="animation-delay:${(idx*0.06).toFixed(2)}s" data-label="${esc(s.label)}" data-pct="${pctTxt}" data-value="${esc(brl(s.value))}" onmousemove="ChartTooltip.showEl(event,this)" onmouseleave="ChartTooltip.hide()">
      <span class="dot" style="background:${s.color}"></span>
      <span class="lp">${pctTxt}</span>
      <span class="ln">${esc(s.label)}</span>
      <span class="lv">${brl(s.value)}</span>
    </div>`;
  }).join('');
  return `
    <div class="donut-wrap">
      <div class="donut-hole-wrap">
        ${svg}
        <div class="donut-hole">
          <div class="dtop">${centerTop!=null?centerTop:''}</div>
          <div class="dbot">${centerBottom!=null?centerBottom:''}</div>
        </div>
      </div>
      <div class="legend">${legend || '<div class="empty-note">Sem dados neste período</div>'}</div>
    </div>`;
}

/* ---------------- floating chart tooltip (usado por todos os gráficos) ---------------- */
const ChartTooltip = {
  showEl(evt, el){
    const label = el.dataset.label||'', pct = el.dataset.pct||'', value = el.dataset.value||'';
    let html = `<b>${esc(label)}</b>`;
    if(pct) html += ` : ${esc(pct)}`;
    if(value) html += ` - ${esc(value)}`;
    this.show(evt, html);
  },
  show(evt, html){
    let tt = document.getElementById('chart-tooltip');
    if(!tt){
      tt = document.createElement('div');
      tt.id = 'chart-tooltip';
      document.body.appendChild(tt);
    }
    tt.innerHTML = html;
    tt.style.display = 'block';
    const pad = 16;
    let x = evt.clientX + pad, y = evt.clientY + pad;
    const rect = tt.getBoundingClientRect();
    if(x + rect.width > window.innerWidth - 8) x = evt.clientX - rect.width - pad;
    if(y + rect.height > window.innerHeight - 8) y = evt.clientY - rect.height - pad;
    tt.style.left = x+'px';
    tt.style.top = y+'px';
  },
  hide(){
    const tt = document.getElementById('chart-tooltip');
    if(tt) tt.style.display = 'none';
  }
};

/* ---------------- bar / line chart builders (SVG, com tooltip) ---------------- */
function renderBarChart({series, labels, height=180, valueFormatter}){
  valueFormatter = valueFormatter || brl;
  const maxVal = Math.max(1, ...series.flatMap(s=>s.values));
  const W=640, H=height, padL=10, padR=10, padT=10, padB=26;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const n = Math.max(1, labels.length);
  const groupW = plotW/n;
  const barGap = 5;
  const barW = Math.max(3, (groupW - barGap*(series.length+1)) / series.length);
  let bars='';
  labels.forEach((lab,i)=>{
    const groupX = padL + i*groupW;
    series.forEach((s,si)=>{
      const val = s.values[i]||0;
      const bh = maxVal>0 ? (val/maxVal)*plotH : 0;
      const x = groupX + barGap + si*(barW+barGap);
      const y = padT + (plotH-Math.max(1,bh));
      bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.max(1,bh).toFixed(1)}" rx="2.5" fill="${s.color}" style="animation-delay:${(i*0.02+si*0.015).toFixed(2)}s" data-label="${esc(lab)}${series.length>1?' · '+esc(s.name):''}" data-value="${esc(valueFormatter(val))}" onmousemove="ChartTooltip.showEl(event,this)" onmouseleave="ChartTooltip.hide()"></rect>`;
    });
  });
  const step = Math.max(1, Math.ceil(n/7));
  const labelsHTML = labels.map((lab,i)=>{
    if(i%step!==0 && i!==n-1) return '';
    const x = padL + i*groupW + groupW/2;
    return `<text x="${x.toFixed(1)}" y="${H-8}" text-anchor="middle" class="chart-axis-label">${esc(lab)}</text>`;
  }).join('');
  const legendHTML = series.length>1 ? `<div class="chart-legend">${series.map(s=>`<span class="chart-legend-item"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<div class="chart-block"><svg class="bar-chart-svg" viewBox="0 0 ${W} ${H}">${bars}${labelsHTML}</svg>${legendHTML}</div>`;
}

function renderLineChart({series, labels, height=180, valueFormatter}){
  valueFormatter = valueFormatter || brl;
  const allVals = series.flatMap(s=>s.values);
  const maxVal = Math.max(1, ...allVals);
  const minVal = Math.min(0, ...allVals);
  const W=640, H=height, padL=10, padR=10, padT=14, padB=26;
  const plotW=W-padL-padR, plotH=H-padT-padB;
  const n = labels.length;
  const xStep = n>1 ? plotW/(n-1) : 0;
  const range = (maxVal-minVal)||1;
  function yFor(v){ return padT + plotH - ((v-minVal)/range)*plotH; }
  function xFor(i){ return padL + i*xStep; }
  let linesHTML='', pointsHTML='';
  series.forEach(s=>{
    const pts = s.values.map((v,i)=>`${xFor(i).toFixed(1)},${yFor(v).toFixed(1)}`).join(' ');
    linesHTML += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" style="animation:lineDraw .6s ease;"></polyline>`;
    s.values.forEach((v,i)=>{
      pointsHTML += `<circle cx="${xFor(i).toFixed(1)}" cy="${yFor(v).toFixed(1)}" r="4" fill="${s.color}" data-label="${esc(labels[i])}${series.length>1?' · '+esc(s.name):''}" data-value="${esc(valueFormatter(v))}" onmousemove="ChartTooltip.showEl(event,this)" onmouseleave="ChartTooltip.hide()"></circle>`;
    });
  });
  const step = Math.max(1, Math.ceil(n/7));
  const labelsHTML = labels.map((lab,i)=>{
    if(i%step!==0 && i!==n-1) return '';
    return `<text x="${xFor(i).toFixed(1)}" y="${H-8}" text-anchor="middle" class="chart-axis-label">${esc(lab)}</text>`;
  }).join('');
  const legendHTML = series.length>1 ? `<div class="chart-legend">${series.map(s=>`<span class="chart-legend-item"><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `<div class="chart-block"><svg class="line-chart-svg" viewBox="0 0 ${W} ${H}">${linesHTML}${pointsHTML}${labelsHTML}</svg>${legendHTML}</div>`;
}

/* ---------------- histórico de patrimônio (para o gráfico de evolução) ---------------- */
function recordPatrimonioSnapshot(){
  if(!S.data || !S.data.patrimonioHistorico) return;
  const key = monthKey(todayYM().y, todayYM().m);
  S.data.patrimonioHistorico[key] = patrimonioTotal();
}
function last12MonthsKeys(){
  const {y,m} = todayYM();
  const out = [];
  for(let i=11;i>=0;i--) out.push(shiftYM(monthKey(y,m), -i));
  return out;
}
