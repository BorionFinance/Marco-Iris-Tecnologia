/* Borion Finance — V6.24.6 — Assinaturas versionadas e ocorrências independentes.
   Cadastro recorrente, previsão e movimento financeiro são camadas diferentes:
   - assinaturas: regra + versões + períodos ativos/pausados;
   - assinaturaCobrancas: uma ocorrência imutável por assinatura/período;
   - somente status paga/cobrada altera conta ou cartão. */

function assinaturaDiaClamped(rule, mesKey){
  const [y,m]=String(mesKey).split('-').map(Number);
  const ultimoDia=new Date(y,m,0).getDate();
  return Math.min(Math.max(1,Number(rule.diaVencimento)||1),ultimoDia);
}
function assinaturaDataVencimento(rule, mesKey){ return mesKey+'-'+pad2(assinaturaDiaClamped(rule,mesKey)); }
function assinaturaTodayISO(){ return todayISO(); }
function assinaturaRuleSnapshot(source){
  const origemPagamento=source.origemPagamento || (source.formaPagamento==='Crédito'?'cartao':(source.reservaId?'reserva':(source.accountId===CARTEIRA_CONTA_ID?'carteira':'conta')));
  return {
    nome:source.nome||'Assinatura', local:source.local||'', categoria:source.categoria||'Outro', categoriaTipo:source.categoriaTipo==='fixa'?'fixa':'variavel',
    tipo:source.tipo==='anual'?'anual':'mensal', valor:Math.round((Number(source.valor)||0)*100)/100,
    diaVencimento:Math.min(31,Math.max(1,Number(source.diaVencimento)||1)),
    mesVencimento:source.tipo==='anual'?Math.max(0,Number(source.mesVencimento)||0):null,
    origemPagamento,
    formaPagamento:origemPagamento==='cartao'?'Crédito':(origemPagamento==='carteira'?'Dinheiro':(source.formaPagamento||'Pix')),
    accountId:origemPagamento==='carteira'?CARTEIRA_CONTA_ID:(source.accountId||null),
    banco:source.banco||accountNameSnapshot(source.accountId)||'', cartaoId:source.cartaoId||null, reservaId:source.reservaId||null
  };
}
function assinaturaEnsureModel(a){
  if(!a) return a;
  const createdKey=a.createdKey||monthKey(todayYM().y,todayYM().m); a.createdKey=createdKey;
  if(!Array.isArray(a.versions)||!a.versions.length){
    a.versions=[Object.assign({id:uid(),effectiveFrom:createdKey,createdAt:a.createdAt||Date.now()},assinaturaRuleSnapshot(a))];
  }
  a.versions.sort((x,y)=>String(x.effectiveFrom).localeCompare(String(y.effectiveFrom)));
  if(!Array.isArray(a.activityPeriods)||!a.activityPeriods.length){
    const first={from:createdKey,to:null};
    if(a.status==='pausada'&&a.pausedFromKey){ first.to=shiftYM(a.pausedFromKey,-1); }
    a.activityPeriods=[first];
  }
  if(!Array.isArray(a.pauseHistory)) a.pauseHistory=[];
  if(a.status==='pausada'&&a.pausedFromKey&&!a.pauseHistory.some(p=>p.from===a.pausedFromKey&&!p.to)) a.pauseHistory.push({from:a.pausedFromKey,to:null,createdAt:Date.now()});
  if(a.deletedFromKey) a.status='excluida';
  const latest=assinaturaVersionFor(a,monthKey(todayYM().y,todayYM().m))||a.versions[a.versions.length-1];
  Object.assign(a,assinaturaRuleSnapshot(latest));
  return a;
}
function assinaturaVersionFor(a,period){
  assinaturaEnsureModelShallow(a);
  let found=null;
  (a.versions||[]).forEach(v=>{if(v.effectiveFrom<=period&&(!found||v.effectiveFrom>=found.effectiveFrom))found=v;});
  return found;
}
function assinaturaEnsureModelShallow(a){
  if(!a.versions||!a.versions.length){
    const key=a.createdKey||monthKey(todayYM().y,todayYM().m);
    a.versions=[Object.assign({id:uid(),effectiveFrom:key,createdAt:a.createdAt||Date.now()},assinaturaRuleSnapshot(a))];
  }
}
function assinaturaActiveInPeriod(a,period){
  assinaturaEnsureModel(a);
  if(a.deletedFromKey&&period>=a.deletedFromKey) return false;
  return (a.activityPeriods||[]).some(p=>p.from<=period&&(!p.to||period<=p.to));
}
function assinaturaOcorreNoMes(a,period){
  if(!a||!assinaturaActiveInPeriod(a,period)) return false;
  const rule=assinaturaVersionFor(a,period); if(!rule) return false;
  return rule.tipo!=='anual'||(Number(period.slice(5,7))-1)===Number(rule.mesVencimento);
}
function assinaturaProjection(a,period){
  const rule=assinaturaVersionFor(a,period); return rule?Object.assign({id:a.id,assinaturaId:a.id,period,status:a.status},assinaturaRuleSnapshot(rule)):null;
}
function assinaturasAtivasNoMes(y=S.month.y,m=S.month.m){
  const key=monthKey(y,m);
  return (S.data.assinaturas||[]).filter(a=>assinaturaOcorreNoMes(a,key)).map(a=>assinaturaProjection(a,key)).filter(r=>r&&r.formaPagamento!=='Crédito'&&bankMatches(r.banco,r.accountId));
}
function assinaturasMes(y=S.month.y,m=S.month.m){
  const period=monthKey(y,m);
  return assinaturasAtivasNoMes(y,m)
    .filter(a=>!assinaturaTemDespesaNoMes(a.assinaturaId||a.id,period))
    .reduce((s,a)=>s+(Number(a.valor)||0),0);
}
function assinaturaCobrancaFor(assinaturaId,period){ return (S.data.assinaturaCobrancas||[]).find(c=>c&&c.assinaturaId===assinaturaId&&c.period===period)||null; }
function assinaturaPeriodsUntilCurrent(a){
  assinaturaEnsureModel(a);
  const hojeKey=monthKey(todayYM().y,todayYM().m), start=a.createdKey||hojeKey;
  if(start>hojeKey) return [];
  return monthsBetweenISO(start+'-01',hojeKey+'-01').map(x=>x.key).filter(k=>assinaturaOcorreNoMes(a,k));
}
function assinaturaProximaCobranca(a){
  assinaturaEnsureModel(a); if(a.status==='pausada'||a.status==='excluida')return null;
  const hojeKey=monthKey(todayYM().y,todayYM().m);
  for(let i=0;i<36;i++){
    const key=shiftYM(hojeKey,i);
    if(assinaturaOcorreNoMes(a,key)){
      const rule=assinaturaVersionFor(a,key), due=assinaturaDataVencimento(rule,key);
      if(due>=assinaturaTodayISO()) return due;
    }
  }
  return null;
}
function assinaturaOccurrenceStatusLabel(status){ return ({prevista:'Prevista',vencida:'Vencida',paga:'Paga',cobrada:'Cobrada',pausada:'Pausada',falhou:'Falhou'})[status]||status||'Prevista'; }

/* V6.27 — toda ocorrência de assinatura também possui uma representação financeira
   visível em Despesa variável. Conta = lançamento em aberto até o vencimento; crédito =
   compra criada imediatamente no cartão selecionado e espelhada em Despesas. */
function assinaturaTransacaoById(id){ return id ? (S.data.transacoes||[]).find(t=>t&&t.id===id) || null : null; }
function assinaturaParcelaRef(rec){
  if(!rec||!rec.parcelaId) return null;
  for(const card of (S.data.cartoes||[])){
    const parcela=(card.parcelas||[]).find(p=>p&&p.id===rec.parcelaId);
    if(parcela) return {card,parcela};
  }
  return null;
}
function assinaturaFindLinkedTx(rec){
  const direct=assinaturaTransacaoById(rec&&rec.transacaoId);
  if(direct) return direct;
  return (S.data.transacoes||[]).find(t=>t&&t.assinaturaCobrancaId===rec.id) || null;
}
function assinaturaEnsureAccountTx(rec){
  let tx=assinaturaFindLinkedTx(rec);
  const paid=!!(rec.balanceApplied||['paga','cobrada'].includes(rec.status));
  const isReserva=rec.origemPagamento==='reserva';
  const accountId=isReserva?null:resolveAccountId(rec.accountId,{includeArchived:true});
  const payload={
    tipo:'variavel',nome:rec.nome||'Assinatura',localCompra:rec.local||'',data:rec.dueDate||rec.data||rec.period+'-01',
    categoria:rec.categoria||'Outro',valor:Number(rec.valor)||0,accountId:accountId||rec.accountId||null,
    banco:isReserva?(rec.banco||''):accountNameSnapshot(accountId||rec.accountId,rec.banco||''),
    formaPagamento:isReserva?null:(rec.formaPagamento||'Pix'),origemPagamento:isReserva?'reserva':(rec.origemPagamento||'conta'),
    reservaOrigemId:isReserva?(rec.reservaId||null):null,statusPagamento:paid?'Pago':'Em aberto',viaAssinaturaId:rec.assinaturaId||null,
    assinaturaCobrancaId:rec.id
  };
  if(tx){Object.assign(tx,payload);rec.transacaoId=tx.id;return false;}
  tx=Object.assign({id:uid()},payload);S.data.transacoes.push(tx);rec.transacaoId=tx.id;return true;
}
function assinaturaEnsureCreditPurchase(rec){
  const card=(S.data.cartoes||[]).find(c=>c&&c.id===rec.cartaoId);
  if(!card){rec.status='falhou';rec.lastError='Cartão inexistente, removido ou inválido.';return false;}
  let ref=assinaturaParcelaRef(rec);
  if(ref){
    rec.cartaoId=ref.card.id;
    rec.transacaoId=ref.parcela.despesaTransacaoId||((ref.parcela.despesaTransacaoIds||[])[0])||rec.transacaoId||null;
    if(rec.status!=='cobrada'){rec.status='cobrada';rec.processedAt=rec.processedAt||Date.now();rec.lastError='';return true;}
    return false;
  }
  const valor=Math.round((Number(rec.valor)||0)*100)/100;
  const p={id:uid(),descricao:rec.nome||'Assinatura',local:rec.local||'',categoria:rec.categoria||'Outro',valorParcela:valor,parcelaTotal:1,dataCompra:rec.period,dataCompraCompleta:rec.dueDate||rec.data||rec.period+'-01',diaEntrada:Number(String(rec.dueDate||'').slice(8,10))||1,apareceDespesas:true,despesaTipo:'variavel',statusPagamento:'Pago',statusFaturaPorCompetencia:{},despesaTransacaoId:null,despesaTransacaoIds:[],despesaFixaId:null,viaAssinaturaId:rec.assinaturaId,assinaturaCobrancaId:rec.id};
  if(!Array.isArray(card.parcelas))card.parcelas=[];
  card.parcelas.push(p);linkParcelaToDespesa(card,p);
  rec.cartaoId=card.id;rec.parcelaId=p.id;rec.transacaoId=p.despesaTransacaoId;rec.status='cobrada';rec.processedAt=Date.now();rec.lastError='';
  return true;
}
function assinaturaRemovePendingMaterialization(rec){
  if(!rec||['paga','cobrada'].includes(rec.status)) return false;
  let changed=false;
  const ref=assinaturaParcelaRef(rec);
  if(ref){unlinkParcelaFromDespesa(ref.parcela);ref.card.parcelas=ref.card.parcelas.filter(p=>p.id!==ref.parcela.id);changed=true;}
  const tx=assinaturaFindLinkedTx(rec);
  if(tx){
    if(tx.reservaOrigemMoveId&&typeof removeLinkedReservaWithdrawalFromDespesa==='function') removeLinkedReservaWithdrawalFromDespesa(tx);
    S.data.transacoes=S.data.transacoes.filter(t=>t.id!==tx.id);changed=true;
  }
  rec.parcelaId=null;rec.transacaoId=null;rec.balanceApplied=false;
  return changed;
}
function assinaturaTemDespesaNoMes(assinaturaId,period){
  return (S.data.transacoes||[]).some(t=>t&&t.viaAssinaturaId===assinaturaId&&String(t.data||'').slice(0,7)===period);
}

const Assinaturas={
  cleanupDeletedGhosts(){
    if(!S.data||!Array.isArray(S.data.assinaturas)) return false;
    const deletedIds=new Set(S.data.assinaturas.filter(a=>a&&(a.status==='excluida'||a.deletedFromKey)).map(a=>a.id));
    if(!deletedIds.size) return false;

    S.data.assinaturas=S.data.assinaturas.filter(a=>!deletedIds.has(a.id));
    if(!Array.isArray(S.data.assinaturaCobrancas)) S.data.assinaturaCobrancas=[];
    S.data.assinaturaCobrancas=S.data.assinaturaCobrancas.filter(rec=>{
      if(!rec||!deletedIds.has(rec.assinaturaId)) return true;
      if(['paga','cobrada'].includes(rec.status)){
        rec.formerAssinaturaId=rec.assinaturaId;
        rec.assinaturaId=null;
        rec.subscriptionDeleted=true;
        rec.subscriptionNameSnapshot=rec.nome||((rec.snapshot&&rec.snapshot.nome)||'Assinatura');
        return true;
      }
      assinaturaRemovePendingMaterialization(rec);
      return false;
    });
    (S.data.cartoes||[]).forEach(card=>(card.parcelas||[]).forEach(parcela=>{
      if(parcela&&deletedIds.has(parcela.viaAssinaturaId)){
        parcela.formerAssinaturaId=parcela.viaAssinaturaId;
        delete parcela.viaAssinaturaId;
      }
    }));
    return true;
  },
  sync(){
    if(!S.data||!Array.isArray(S.data.assinaturas))return;
    if(!Array.isArray(S.data.assinaturaCobrancas))S.data.assinaturaCobrancas=[];
    let changed=this.cleanupDeletedGhosts();
    S.data.assinaturas.forEach(a=>{
      assinaturaEnsureModel(a);
      assinaturaPeriodsUntilCurrent(a).forEach(period=>{
        let rec=assinaturaCobrancaFor(a.id,period);
        if(!rec){ rec=this.createOccurrence(a,period);S.data.assinaturaCobrancas.push(rec);changed=true; }
        if(this.processOccurrence(a,rec))changed=true;
      });
    });
    if(changed)saveCurrentData();
  },
  createOccurrence(a,period){
    const rule=assinaturaVersionFor(a,period), snap=assinaturaRuleSnapshot(rule), due=assinaturaDataVencimento(rule,period);
    return Object.assign({id:uid(),assinaturaId:a.id,period,dueDate:due,data:due,status:'prevista',attemptCount:0,lastError:'',createdAt:Date.now(),processedAt:null,cartaoId:null,parcelaId:null,transacaoId:null},snap,{snapshot:snap});
  },
  processOccurrence(a,rec){
    if(!rec)return false;
    if(rec.formaPagamento==='Crédito'){
      if(['paga','cobrada'].includes(rec.status)) return assinaturaEnsureCreditPurchase(rec);
      return this.chargeOccurrence(rec);
    }
    let changed=assinaturaEnsureAccountTx(rec);
    if(['paga','cobrada'].includes(rec.status))return changed;
    if(!assinaturaActiveInPeriod(a,rec.period)){
      changed=assinaturaRemovePendingMaterialization(rec)||changed;
      if(rec.status!=='pausada'){rec.status='pausada';return true;} return changed;
    }
    const today=assinaturaTodayISO();
    if(rec.dueDate>today){ if(rec.status!=='prevista'){rec.status='prevista';rec.lastError='';return true;} return changed; }
    return this.chargeOccurrence(rec)||changed;
  },
  chargeOccurrence(rec){
    rec.attemptCount=(Number(rec.attemptCount)||0)+1; rec.lastAttemptAt=Date.now();
    const valor=Math.round((Number(rec.valor)||0)*100)/100;
    if(rec.formaPagamento==='Crédito'||rec.origemPagamento==='cartao'){
      return assinaturaEnsureCreditPurchase(rec);
    }
    if(rec.origemPagamento==='reserva'){
      const box=((S.data.reservas&&S.data.reservas.boxes)||[]).find(r=>r.id===rec.reservaId);
      if(!box){rec.status='falhou';rec.lastError='Reserva inexistente ou removida.';return true;}
      const tx=assinaturaFindLinkedTx(rec)||null;
      if(!tx){rec.status='falhou';rec.lastError='Lançamento vinculado à assinatura não foi encontrado.';return true;}
      if(!rec.balanceApplied){
        if(!reservaTemSaldo(box,valor)){rec.status='falhou';rec.lastError='Saldo insuficiente na reserva '+box.nome+'.';return true;}
        createLinkedReservaWithdrawalFromDespesa(tx,box,valor);rec.balanceApplied=true;
      }
      tx.statusPagamento='Pago';tx.origemPagamento='reserva';tx.reservaOrigemId=box.id;tx.accountId=null;tx.banco=box.banco||'';tx.formaPagamento=null;
      rec.reservaId=box.id;rec.banco=box.banco||'';rec.status='cobrada';rec.processedAt=Date.now();rec.lastError='';
      return true;
    }
    const accountId=resolveAccountId(rec.accountId,{includeArchived:false});
    if(!accountId){rec.status='falhou';rec.lastError='Conta bancária inexistente, arquivada ou inválida.';return true;}
    const tx=assinaturaFindLinkedTx(rec)||null;
    if(!rec.balanceApplied){ adjustLiquidez(accountId,-valor);rec.balanceApplied=true; }
    if(tx){tx.statusPagamento='Pago';tx.accountId=accountId;tx.banco=accountNameSnapshot(accountId,rec.banco);tx.formaPagamento=rec.formaPagamento||'Pix';tx.origemPagamento=rec.origemPagamento||'conta';}
    rec.accountId=accountId;rec.banco=accountNameSnapshot(accountId,rec.banco);rec.status='cobrada';rec.processedAt=Date.now();rec.lastError='';
    return true;
  },
  retry(occurrenceId){
    const rec=(S.data.assinaturaCobrancas||[]).find(x=>x.id===occurrenceId);if(!rec||rec.status!=='falhou')return;
    this.chargeOccurrence(rec);saveCurrentData();renderView();toast(rec.status==='falhou'?'A cobrança continua com falha: '+rec.lastError:'Cobrança processada sem duplicidade.');
  },
  tab(){S.budgetTab='assinaturas';renderView();}, add(){this.openForm(null);}, edit(id){this.openForm((S.data.assinaturas||[]).find(x=>x.id===id));},
  openForm(existing){
    const isEdit=!!existing;if(existing)assinaturaEnsureModel(existing);
    const currentKey=monthKey(S.month.y,S.month.m), currentRule=isEdit?(assinaturaVersionFor(existing,currentKey)||existing):{};
    const fixedCats=typeof orderedCategories==='function'?orderedCategories('fixa'):((S.data.categorias&&S.data.categorias.fixa)||[]);
    const variableCats=typeof orderedCategories==='function'?orderedCategories('variavel'):((S.data.categorias&&S.data.categorias.variavel)||['Outro']);
    const categoryOpts=[
      ...fixedCats.map(c=>({value:'fixa::'+c,label:'Despesas Fixas · '+c})),
      ...variableCats.map(c=>({value:'variavel::'+c,label:'Despesas Variáveis · '+c}))
    ];
    if(!categoryOpts.length) categoryOpts.push({value:'variavel::Outro',label:'Despesas Variáveis · Outro'});
    const accountOpts=accountSelectOptions({excludeCarteira:true}), cardOpts=cardSelectOptions();
    const reserveBoxes=reservasEnabled()?(S.data.reservas&&S.data.reservas.boxes||[]).filter(r=>bankMatches(r.banco)):[];
    const reserveOpts=reserveBoxes.map(r=>({value:r.id,label:reservaBoxLabel(r)}));
    const inferredOrigin=currentRule.origemPagamento || (currentRule.formaPagamento==='Crédito'?'cartao':(currentRule.reservaId?'reserva':(currentRule.accountId===CARTEIRA_CONTA_ID?'carteira':'conta')));
    const currentCategoryValue=(currentRule.categoriaTipo==='fixa'?'fixa':'variavel')+'::'+(currentRule.categoria||'Outro');
    const fields=[
      {key:'tipo',label:'Mensal / Anual',type:'segmented',options:[{value:'mensal',label:'Mensal'},{value:'anual',label:'Anual'}],default:currentRule.tipo||'mensal'},
      {key:'nome',label:'Nome',type:'text',default:currentRule.nome||''},
      {key:'local',label:'Local',type:'text',default:currentRule.local||'',placeholder:'Ex: Netflix, academia, aplicativo'},
      {key:'dataInicio',label:'Data de início',type:'date',default:isEdit?(currentRule.dataInicio||existing.dataInicio||(existing.createdKey?(existing.createdKey+'-'+pad2(currentRule.diaVencimento||existing.diaVencimento||1)) : '')):todayISO()},
      {key:'categoriaEscolhida',label:'Categoria',type:'select',options:categoryOpts,default:categoryOpts.some(o=>o.value===currentCategoryValue)?currentCategoryValue:categoryOpts[0].value},
      {key:'valorMensal',label:'Valor mensal',type:'money',default:currentRule.tipo==='mensal'?currentRule.valor:0,visibleWhen:{key:'tipo',value:'mensal'}},
      {key:'valorAnual',label:'Valor anual',type:'money',default:currentRule.tipo==='anual'?currentRule.valor:0,visibleWhen:{key:'tipo',value:'anual'}},
      {key:'dia',label:'Dia do vencimento',type:'select',options:Array.from({length:31},(_,i)=>String(i+1)),default:String(currentRule.diaVencimento||1)},
      {key:'mes',label:'Mês do vencimento',type:'select',options:MONTHS.slice(),default:MONTHS[currentRule.mesVencimento||0],visibleWhen:{key:'tipo',value:'anual'}},
      {key:'origem',label:'De onde será pago',type:'segmented',options:[{value:'carteira',label:'Carteira'},{value:'conta',label:'Conta'},...(reservasEnabled()?[{value:'reserva',label:'Reserva'}]:[]),{value:'cartao',label:'Crédito'}],default:inferredOrigin==='reserva'&&!reservasEnabled()?'conta':inferredOrigin},
      {key:'accountId',label:'Conta',type:'select',options:accountOpts.length?accountOpts:[{value:'',label:'Cadastre uma conta em Cartões e Contas'}],default:currentRule.accountId&&currentRule.accountId!==CARTEIRA_CONTA_ID?currentRule.accountId:'',visibleWhen:{key:'origem',value:'conta'}},
      {key:'forma',label:'Forma de pagamento',type:'select',options:['Pix','Débito'],default:['Pix','Débito'].includes(currentRule.formaPagamento)?currentRule.formaPagamento:'Pix',visibleWhen:{key:'origem',value:'conta'}},
      {key:'reservaId',label:'Reserva',type:'select',options:reserveOpts.length?reserveOpts:[{value:'',label:'Cadastre uma reserva primeiro'}],default:currentRule.reservaId||'',visibleWhen:{key:'origem',value:'reserva'}},
      {key:'cartaoId',label:'Cartão de crédito',type:'select',options:cardOpts.length?cardOpts:[{value:'',label:'Cadastre um cartão em Cartões e Contas'}],default:currentRule.cartaoId||'',visibleWhen:{key:'origem',value:'cartao'}}
    ];
    openModal({title:isEdit?'Editar assinatura':'Adicionar assinatura',sub:isEdit?'A alteração vale do mês selecionado em diante. Ocorrências consolidadas mantêm a fotografia original.':'Cadastre a regra recorrente; o saldo só muda quando a cobrança vencer e for processada.',fields,saveLabel:'Salvar assinatura',onDelete:isEdit?()=>{this.remove(existing.id);return false;}:null,deleteLabel:'Excluir assinatura',onSave:v=>{
      const nome=(v.nome||'').trim();if(!nome){alert('Dê um nome para a assinatura.');return;}
      const tipo=v.tipo==='anual'?'anual':'mensal',valor=Number(tipo==='anual'?v.valorAnual:v.valorMensal)||0;if(valor<=0){alert('Digite um valor maior que zero.');return;}
      const origem=['carteira','conta','reserva','cartao'].includes(v.origem)?v.origem:'conta';
      let accountId=null,card=null,reserva=null,banco='',formaPagamento='Pix';
      if(origem==='carteira'){
        accountId=requireAccountId(CARTEIRA_CONTA_ID,'A Carteira precisa estar disponível.');if(!accountId)return;banco=accountNameSnapshot(accountId);formaPagamento='Dinheiro';
      }else if(origem==='conta'){
        accountId=requireAccountId(v.accountId,'Escolha uma conta bancária ativa.');if(!accountId)return;banco=accountNameSnapshot(accountId);formaPagamento=v.forma||'Pix';
      }else if(origem==='reserva'){
        reserva=reserveBoxes.find(r=>r.id===v.reservaId);if(!reserva){alert('Escolha uma reserva válida.');return;}banco=reserva.banco||'';formaPagamento='Reserva';
      }else{
        card=(S.data.cartoes||[]).find(c=>c.id===v.cartaoId);if(!card){alert('Escolha um cartão de crédito válido.');return;}formaPagamento='Crédito';
      }
      const categoryRaw=String(v.categoriaEscolhida||'variavel::Outro');
      const separator=categoryRaw.indexOf('::');
      const categoriaTipo=separator>=0&&categoryRaw.slice(0,separator)==='fixa'?'fixa':'variavel';
      const categoria=separator>=0?categoryRaw.slice(separator+2):categoryRaw;
      const dataInicio=v.dataInicio||todayISO();
      const payload={nome,local:(v.local||'').trim(),dataInicio,categoria:categoria||'Outro',categoriaTipo,tipo,valor,diaVencimento:Math.min(31,Math.max(1,parseInt(v.dia,10)||1)),mesVencimento:tipo==='anual'?Math.max(0,MONTHS.indexOf(v.mes)):null,origemPagamento:origem,formaPagamento,accountId,banco,cartaoId:card?card.id:null,reservaId:reserva?reserva.id:null};
      if(isEdit){
        const version=Object.assign({id:uid(),effectiveFrom:currentKey,createdAt:Date.now()},payload);
        existing.versions=(existing.versions||[]).filter(x=>x.effectiveFrom!==currentKey);existing.versions.push(version);existing.versions.sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));Object.assign(existing,payload);
        const pending=assinaturaCobrancaFor(existing.id,currentKey);if(pending&&['prevista','vencida','falhou','pausada'].includes(pending.status)){assinaturaRemovePendingMaterialization(pending);Object.assign(pending,assinaturaRuleSnapshot(version),{snapshot:assinaturaRuleSnapshot(version),dueDate:assinaturaDataVencimento(version,currentKey),data:assinaturaDataVencimento(version,currentKey),status:'prevista',lastError:''});}
        toast('Nova versão criada. O passado consolidado foi preservado.');
      }else{
        const startKey=dataInicio.slice(0,7)||monthKey(todayYM().y,todayYM().m);
        const a=Object.assign({id:uid(),status:'ativa',createdKey:startKey,createdAt:Date.now(),versions:[],activityPeriods:[{from:startKey,to:null}],pauseHistory:[]},payload);a.versions=[Object.assign({id:uid(),effectiveFrom:startKey,createdAt:Date.now()},payload)];S.data.assinaturas.push(a);toast('Assinatura criada.');
      }
      saveCurrentData();this.sync();closeModal();renderView();
    }});
  },
  pause(id){
    const a=(S.data.assinaturas||[]).find(x=>x.id===id);if(!a)return;assinaturaEnsureModel(a);const key=monthKey(S.month.y,S.month.m);
    const open=(a.activityPeriods||[]).find(p=>!p.to);if(open&&open.from<=key)open.to=shiftYM(key,-1);
    a.pauseHistory.push({from:key,to:null,createdAt:Date.now()});a.status='pausada';a.pausedFromKey=key;
    (S.data.assinaturaCobrancas||[]).forEach(r=>{if(r.assinaturaId===id&&r.period>=key&&!['paga','cobrada'].includes(r.status)){assinaturaRemovePendingMaterialization(r);r.status='pausada';r.lastError='';}});
    saveCurrentData();renderView();toast('Assinatura pausada. Nenhum mês pausado será cobrado retroativamente.');
  },
  resume(id){
    const a=(S.data.assinaturas||[]).find(x=>x.id===id);if(!a)return;assinaturaEnsureModel(a);const key=monthKey(S.month.y,S.month.m);
    const pause=[...(a.pauseHistory||[])].reverse().find(p=>!p.to);if(pause)pause.to=shiftYM(key,-1);
    a.activityPeriods.push({from:key,to:null});a.status='ativa';a.pausedFromKey=null;a.resumedAt=Date.now();
    saveCurrentData();this.sync();renderView();toast('Assinatura retomada a partir deste mês, sem cobrança retroativa.');
  },
  remove(id){
    const a=(S.data.assinaturas||[]).find(x=>x.id===id);if(!a)return;
    const occurrences=(S.data.assinaturaCobrancas||[]).filter(r=>r&&r.assinaturaId===id);
    const consolidated=occurrences.filter(r=>['paga','cobrada'].includes(r.status));
    const text=consolidated.length
      ? 'O cadastro da assinatura será removido completamente e não aparecerá mais como “Excluída”. As cobranças que já aconteceram continuarão somente como registros financeiros normais.'
      : 'A assinatura e todas as previsões ligadas a ela serão removidas completamente. Ela não aparecerá no histórico como assinatura excluída.';
    openConfirmModal({title:'Excluir assinatura definitivamente?',text,confirmLabel:'Excluir definitivamente',variant:'danger',onConfirm:()=>{
      occurrences.forEach(rec=>{if(!['paga','cobrada'].includes(rec.status))assinaturaRemovePendingMaterialization(rec);});
      S.data.assinaturas=(S.data.assinaturas||[]).filter(x=>x&&x.id!==id);
      S.data.assinaturaCobrancas=(S.data.assinaturaCobrancas||[]).filter(rec=>{
        if(!rec||rec.assinaturaId!==id) return true;
        if(['paga','cobrada'].includes(rec.status)){
          rec.formerAssinaturaId=id;
          rec.assinaturaId=null;
          rec.subscriptionDeleted=true;
          rec.subscriptionNameSnapshot=rec.nome||((rec.snapshot&&rec.snapshot.nome)||a.nome||'Assinatura');
          return true;
        }
        return false;
      });
      (S.data.cartoes||[]).forEach(card=>(card.parcelas||[]).forEach(parcela=>{
        if(parcela&&parcela.viaAssinaturaId===id){
          parcela.formerAssinaturaId=id;
          delete parcela.viaAssinaturaId;
        }
      }));
      saveCurrentData();renderView();toast(consolidated.length?'Assinatura removida. Pagamentos anteriores permanecem apenas como lançamentos financeiros.':'Assinatura removida definitivamente.');
    }});
  }
};
window.Assinaturas=Assinaturas;

function renderAssinaturas(){
  const list=(S.data.assinaturas||[]).filter(a=>a&&a.status!=='excluida'&&!a.deletedFromKey).filter(a=>{assinaturaEnsureModel(a);const rule=assinaturaVersionFor(a,monthKey(S.month.y,S.month.m))||a;return bankMatches(rule.formaPagamento==='Crédito'?(((S.data.cartoes||[]).find(c=>c.id===rule.cartaoId)||{}).banco):rule.banco,rule.accountId);});
  const active=list.filter(a=>a.status==='ativa'&&!a.deletedFromKey), total=active.filter(a=>(assinaturaVersionFor(a,monthKey(S.month.y,S.month.m))||a).tipo==='mensal').reduce((s,a)=>s+Number((assinaturaVersionFor(a,monthKey(S.month.y,S.month.m))||a).valor||0),0);
  const rows=list.slice().sort((a,b)=>(a.nome||'').localeCompare(b.nome||'','pt-BR')).map(a=>{
    const key=monthKey(S.month.y,S.month.m),r=assinaturaVersionFor(a,key)||a,paused=a.status==='pausada';
    const card=r.formaPagamento==='Crédito'?(S.data.cartoes||[]).find(c=>c.id===r.cartaoId):null,account=r.accountId?accountById(r.accountId,{includeArchived:true}):null;
    const reserve=r.reservaId?((S.data.reservas&&S.data.reservas.boxes)||[]).find(x=>x.id===r.reservaId):null;
    const source=r.origemPagamento==='reserva'?('Reserva: '+(reserve?reserve.nome:'reserva removida')):(r.origemPagamento==='carteira'?'Carteira':(r.formaPagamento==='Crédito'?('Cartão: '+(card?card.banco:'cartão removido')):(r.formaPagamento+' · '+(account?account.nome:(r.banco||'conta removida')))));
    const next=assinaturaProximaCobranca(a), occ=assinaturaCobrancaFor(a.id,key), status=paused?'Pausada':occ?assinaturaOccurrenceStatusLabel(occ.status):'Ativa';
    const retry=occ&&occ.status==='falhou'?`<button class="btn-outline btn-sm" onclick="Assinaturas.retry('${occ.id}')">Tentar novamente</button>`:'';
    return `<div class="card-entity" style="${paused?'opacity:.65;':''}"><div class="card-entity-head"><div class="cehl"><div class="bank-badge" style="background:${catColor(r.nome)}">${esc((r.nome||'?')[0])}</div><div class="info"><div>${esc(r.nome)} <span class="cat-pill"><span class="dot" style="background:${catColor(r.categoria)}"></span>${esc(r.categoria)}</span> <span class="cat-pill">${status}</span></div><div>${brl(r.valor)}${r.tipo==='mensal'?'/mês':'/ano'} · ${r.tipo==='mensal'?'dia '+r.diaVencimento:'dia '+r.diaVencimento+' de '+MONTHS[r.mesVencimento||0]} · ${esc(source)}${next?' · Próxima: '+next.slice(8,10)+'/'+next.slice(5,7)+'/'+next.slice(0,4):''}${occ&&occ.lastError?' · '+esc(occ.lastError):''}</div></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;">${retry}<button class="btn-outline btn-sm" onclick="${paused?`Assinaturas.resume('${a.id}')`:`Assinaturas.pause('${a.id}')`}">${paused?'Ativar':'Pausar'}</button><button class="btn-outline btn-sm" onclick="Assinaturas.edit('${a.id}')">✎ Editar</button><button class="btn-outline btn-sm" onclick="Assinaturas.remove('${a.id}')">Excluir</button></div></div></div>`;
  }).join('');
  return `<div class="cards-row"><div class="card"><div class="clabel">${tagBadgeHTML('despesas','ASSINATURAS ATIVAS (MENSAL)')}</div><div class="cval">${brl(total)}</div></div></div><div class="tabs"><button class="tab-btn" onclick="Budget.tab('receita')">Receita</button><button class="tab-btn" onclick="Budget.tab('fixa')">Despesa fixa</button><button class="tab-btn" onclick="Budget.tab('variavel')">Despesa variável</button><button class="tab-btn active" onclick="Assinaturas.tab()">Assinaturas</button><button class="tab-btn" onclick="Budget.tab('reserva_transferencias')">Transferências</button><button class="tab-btn" onclick="Budget.tab('central')">⌕ Central</button></div><div class="panel-box"><div class="toolbar"><div class="toolbar-left">Assinaturas</div><button class="btn-outline" onclick="Assinaturas.add()">+ Adicionar</button></div>${rows||'<div class="empty-note">Nenhuma assinatura cadastrada ainda.</div>'}<p style="font-size:11px;color:var(--muted-2);margin-top:10px;">Previsões futuras aparecem no mês, mas somente ocorrências cobradas/pagas alteram saldo. Excluir remove o cadastro completamente; pagamentos já realizados permanecem apenas como registros financeiros.</p></div>`;
}
