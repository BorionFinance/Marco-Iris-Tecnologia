(() => {
  'use strict';

  /* ========================================================================
     BORION SMART IMPORT v2.0.0
     Entrada unidirecional: aplicativo externo -> Borion.
     Depois da conversão, o lançamento passa a ser nativo e editável no Borion.
     A referência externa existe somente para impedir duplicidades e controlar exclusões.
     ======================================================================== */
  const SPEC = Object.freeze({
    schemaVersion: 2,
    bridgeVersion: '3.0.0',
    mappingVersion: 3,
    folderName: 'Borion_Integracoes'
  });
  const SOURCES = Object.freeze({
    'amanda-estetica': {
      name: 'Amanda Estética',
      snapshotFile: 'amanda-estetica.bridge.json',
      ackFile: 'amanda-estetica.ack.json',
      expectedAlias: 'estetica'
    },
    'marco-iris': {
      name: 'Marco Iris Tecnologia',
      snapshotFile: 'marco-iris.bridge.json',
      ackFile: 'marco-iris.ack.json',
      expectedAlias: 'default'
    }
  });
  const HANDLE_DB = 'borion_interop_handles_v1';
  const HANDLE_STORE = 'handles';
  const EMPTY_KEY = '__empty__';
  let syncing = false;
  let syncingSourceAppId = '';
  let mitFormDirty = false;
  let uiSourceAppId = 'amanda-estetica';
  let uiTab = 'connection';

  function clone(value){ return JSON.parse(JSON.stringify(value)); }
  function normalize(value){
    return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }
  function mappingKey(value){ return normalize(value) || EMPTY_KEY; }
  function escHtml(value){
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]));
  }
  function nowIso(){ return new Date().toISOString(); }
  function stableStringify(value){
    if(value === null || typeof value !== 'object') return JSON.stringify(value);
    if(Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
  }
  function hash(value){
    const text = typeof value === 'string' ? value : stableStringify(value);
    let h = 2166136261;
    for(let i=0;i<text.length;i+=1){ h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ('00000000' + (h >>> 0).toString(16)).slice(-8);
  }
  function dateText(value){
    if(!value) return 'Nunca';
    try{
      return new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(new Date(value));
    }catch(_){ return String(value); }
  }
  // V6.44.3 — corte de importação: lançamentos da origem com data anterior a
  // config.importCutoffAt nunca entram sozinhos no Borion (nem viram receita
  // automática, nem viram pendência para revisão). Feito para testes e histórico
  // antigo do aplicativo de origem não baterem no Borion sem controle. Não afeta
  // nada que já tenha sido importado antes do corte ser definido.
  function toCutoffTimestamp(value){
    if(!value) return 0;
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  }
  function civilDateKey(value){
    const match=String(value||'').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T|\s)/);
    return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
  }
  function beforeImportCutoff(config, recordDateLike){
    const cutoffValue=config&&config.importCutoffAt;
    const cutoffDay=civilDateKey(cutoffValue),recordDay=civilDateKey(recordDateLike);
    // Datas civis vindas do MIT são comparadas pelo próprio YYYY-MM-DD. Isso evita
    // que UTC/fuso brasileiro desloque um pagamento para o dia anterior ou seguinte.
    if(cutoffDay&&recordDay) return recordDay<cutoffDay;
    const cutoff=toCutoffTimestamp(cutoffValue);
    if(!cutoff) return false;
    const recordTime=toCutoffTimestamp(recordDateLike);
    if(!recordTime) return false;
    return recordTime<cutoff;
  }
  function importCutoffControlHTML(sourceAppId, config, data){
    const cutoffAt = config && config.importCutoffAt ? String(config.importCutoffAt) : '';
    const inputValue = cutoffAt ? cutoffAt.slice(0,10) : '';
    const approvalMode = data ? ensureInterop(data).importApprovalMode : '';
    const isAsk = approvalMode === 'ask';
    return `<div class="gold-box interop-cutoff-box">
      <b>A partir de quando importar sozinho</b>
      <p>Lançamentos de ${escHtml(sourceName(sourceAppId))} com data anterior a este ponto nunca entram automaticamente no Borion — útil para testes e histórico antigo não baterem aqui. Nada do que já foi importado antes é afetado.</p>
      <div class="interop-cutoff-controls">
        <input type="date" id="interop_cutoff_${escHtml(sourceAppId)}" value="${escHtml(inputValue)}">
        <button type="button" class="btn btn-primary btn-sm" onclick="BorionInterop.setImportCutoff('${escHtml(sourceAppId)}', document.getElementById('interop_cutoff_${escHtml(sourceAppId)}').value)">Salvar data</button>
        <button type="button" class="btn-outline btn-sm" onclick="BorionInterop.setImportCutoffNow('${escHtml(sourceAppId)}')">Só a partir de agora</button>
        ${cutoffAt ? `<button type="button" class="btn-outline btn-sm" onclick="BorionInterop.clearImportCutoff('${escHtml(sourceAppId)}')">Importar todo o histórico</button>` : ''}
      </div>
      <small>${cutoffAt ? ('Somente registros a partir de ' + escHtml(new Date(cutoffAt).toLocaleDateString('pt-BR')) + ' serão considerados.') : 'Sem corte definido: todo o histórico pode ser importado automaticamente.'}</small>
      ${data ? `<div class="interop-approval-mode">
        <b>Como importar os lançamentos que passarem no corte</b>
        <p>${isAsk ? 'Perguntar sempre: nada é importado sozinho — o Borion avisa quando houver lançamentos novos disponíveis e só importa se você confirmar.' : 'Importar automaticamente: assim que um lançamento passa no corte acima, ele entra sozinho no Borion (comportamento de sempre).'}</p>
        <div class="interop-cutoff-controls">
          <button type="button" class="btn ${isAsk?'btn-outline':'btn-primary'} btn-sm" onclick="BorionInterop.setImportApprovalMode('auto')">Importar automaticamente</button>
          <button type="button" class="btn ${isAsk?'btn-primary':'btn-outline'} btn-sm" onclick="BorionInterop.setImportApprovalMode('ask')">Perguntar sempre antes de importar</button>
        </div>
      </div>` : ''}
    </div>`;
  }
  function sourceName(sourceAppId){ return SOURCES[sourceAppId]?.name || sourceAppId || 'aplicativo externo'; }
  function displaySourceValue(value){ return String(value || '').trim() || '(Sem informação)'; }

  /* V6.44.2 — vocabulário de usuário final para a tela de vínculos.
     As chaves originais continuam intactas internamente para não quebrar a integração. */
  const FRIENDLY_FIELD_LABELS = Object.freeze({
    amount:'Valor', value:'Valor', total:'Valor total', price:'Preço', cost:'Custo',
    category:'Categoria', clientname:'Cliente', customername:'Cliente', name:'Nome',
    date:'Data do lançamento', paymentdate:'Data do pagamento', createdat:'Data de criação', updatedat:'Última atualização',
    description:'Descrição', externalreference:'Referência do lançamento', paymentmethod:'Forma de pagamento',
    recordtype:'Tipo de registro', entitytype:'Tipo de registro', kind:'Tipo de registro', type:'Tipo de registro',
    status:'Status', direction:'Movimento financeiro', localpurchase:'Local da compra',
    receiptid:'Identificador do recebimento', ordernumber:'Número da ordem de serviço',
    serviceordernumber:'Número da ordem de serviço', aggregateid:'Identificador da integração',
    entityid:'Identificador do registro', settled:'Pagamento confirmado', active:'Registro ativo',
    installments:'Quantidade de parcelas', notes:'Observações', observation:'Observações'
  });
  const FRIENDLY_VALUE_LABELS = Object.freeze({
    income:'Entrada / Receita', entrada:'Entrada / Receita', revenue:'Entrada / Receita', receita:'Entrada / Receita',
    expense:'Saída / Despesa', saida:'Saída / Despesa', despesa:'Saída / Despesa',
    finance:'Lançamento financeiro', financial:'Lançamento financeiro',
    paid:'Pago / Recebido', pago:'Pago / Recebido', received:'Pago / Recebido', recebido:'Pago / Recebido',
    open:'Em aberto', aberto:'Em aberto', pending:'Pendente', pendente:'Pendente',
    cancelled:'Cancelado', canceled:'Cancelado', cancelado:'Cancelado',
    money:'Dinheiro', cash:'Dinheiro', dinheiro:'Dinheiro', pix:'Pix',
    debit:'Débito', debito:'Débito', credit:'Crédito', credito:'Crédito',
    true:'Sim', false:'Não', yes:'Sim', no:'Não'
  });
  function compactFieldKey(value){ return normalize(value).replace(/[^a-z0-9]/g,''); }
  function friendlyFieldName(value){
    const key=compactFieldKey(value);
    return FRIENDLY_FIELD_LABELS[key] || String(value || 'Informação recebida').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,ch=>ch.toUpperCase());
  }
  function friendlyDirection(value){ return normalize(value)==='expense'?'Saída / Despesa':'Entrada / Receita'; }
  function sourceNumber(value){
    let raw=String(value??'').trim().replace(/R\$/gi,'').replace(/\s/g,'');
    if(raw.includes(',')&&raw.includes('.')) raw=raw.replace(/\./g,'').replace(',','.');
    else if(raw.includes(',')) raw=raw.replace(',','.');
    const number=Number(raw);
    return Number.isFinite(number)?number:null;
  }
  function friendlySourceValue(value, fieldName=''){
    const raw=displaySourceValue(value);
    const field=compactFieldKey(fieldName);
    if(['amount','value','total','price','cost'].includes(field)){
      const number=sourceNumber(value);
      if(number!==null) return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(number);
    }
    if(['date','paymentdate','createdat','updatedat'].includes(field)){
      const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})/);
      if(match) return `${match[3]}/${match[2]}/${match[1]}`;
    }
    return FRIENDLY_VALUE_LABELS[normalize(raw)] || raw;
  }
  function sourceContextLabel(field, direction=''){
    const key=compactFieldKey(field);
    const labels={
      direction:'Movimento recebido', recordtype:'Tipo de registro recebido', entitytype:'Tipo de registro recebido',
      kind:'Tipo de registro recebido', type:'Tipo de registro recebido', category:'Categoria recebida',
      paymentmethod:'Forma de pagamento recebida', status:'Status recebido'
    };
    const base=labels[key]||friendlyFieldName(field);
    return direction?`${base} · ${direction==='income'?'Entrada':'Saída'}`:base;
  }

  const MIT_REVENUE_METHODS = Object.freeze([
    {key:'pix', label:'Pix', originalForm:'Pix'},
    {key:'money', label:'Dinheiro', originalForm:'Dinheiro', fixedDestination:'wallet'},
    {key:'debit', label:'Débito', originalForm:'Débito'},
    {key:'credit1', label:'Crédito (À Vista)', originalForm:'Crédito'},
    ...Array.from({length:11}, (_, index) => {
      const installments=index+2;
      return {key:`credit${installments}`,label:`Crédito ${installments}x`,originalForm:'Crédito'};
    })
  ]);
  function mitMethodDefinition(key){ return MIT_REVENUE_METHODS.find(method=>method.key===key)||MIT_REVENUE_METHODS[0]; }
  function defaultMitRevenueRules(config={}){
    return Object.fromEntries(MIT_REVENUE_METHODS.map(method => {
      const wallet=method.fixedDestination==='wallet';
      const accountId=wallet?CARTEIRA_CONTA_ID:String(config.accountId||'');
      return [method.key, {
        key:method.key,label:method.label,category:'Serviços Marco Iris',
        destinationKind:wallet?'wallet':'account',accountId:wallet?CARTEIRA_CONTA_ID:(accountId||null),reserveId:null,
        target:wallet?'wallet':(accountId?`account:${accountId}`:'__default__')
      }];
    }));
  }
  function mitLegacyDestination(current,method,config){
    const explicitKind=String(current.destinationKind||'').toLowerCase();
    if(['wallet','account','reserve'].includes(explicitKind)){
      if(explicitKind==='wallet') return {kind:'wallet',accountId:CARTEIRA_CONTA_ID,reserveId:null};
      if(explicitKind==='reserve') return {kind:'reserve',accountId:null,reserveId:String(current.reserveId||'')||null};
      return {kind:'account',accountId:String(current.accountId||config.accountId||'')||null,reserveId:null};
    }
    const target=String(current.target||'');
    if(target==='wallet'||target==='__carteira__') return {kind:'wallet',accountId:CARTEIRA_CONTA_ID,reserveId:null};
    if(target.startsWith('account:')) return {kind:'account',accountId:target.slice(8)||null,reserveId:null};
    if(target.startsWith('reserve:')) return {kind:'reserve',accountId:null,reserveId:target.slice(8)||null};
    if(target==='__default__'||target==='default') return {kind:'account',accountId:String(config.accountId||'')||null,reserveId:null};
    if(current.reserveId) return {kind:'reserve',accountId:null,reserveId:String(current.reserveId),};
    if(current.accountId&&current.accountId!=='__default__'){
      if(current.accountId==='__carteira__'||String(current.accountId)===String(CARTEIRA_CONTA_ID)) return {kind:'wallet',accountId:CARTEIRA_CONTA_ID,reserveId:null};
      return {kind:'account',accountId:String(current.accountId),reserveId:null};
    }
    if(method.fixedDestination==='wallet') return {kind:'wallet',accountId:CARTEIRA_CONTA_ID,reserveId:null};
    return {kind:'account',accountId:String(config.accountId||'')||null,reserveId:null};
  }
  function normalizeMitRevenueRules(input,config={}){
    const base=defaultMitRevenueRules(config),value=input&&typeof input==='object'?input:{};
    Object.keys(base).forEach(key=>{
      const method=mitMethodDefinition(key),current=value[key]&&typeof value[key]==='object'?value[key]:{};
      const destination=mitLegacyDestination(current,method,config);
      if(method.fixedDestination==='wallet'){
        destination.kind='wallet';destination.accountId=CARTEIRA_CONTA_ID;destination.reserveId=null;
      }
      const target=destination.kind==='wallet'?'wallet':(destination.kind==='reserve'?`reserve:${destination.reserveId||''}`:(destination.accountId?`account:${destination.accountId}`:'__default__'));
      base[key]={
        key,label:method.label,category:String(current.category||base[key].category||'').trim()||'Serviços Marco Iris',
        destinationKind:destination.kind,accountId:destination.accountId||null,reserveId:destination.reserveId||null,target
      };
    });
    return base;
  }
  /* V6.45.1 — DESPESAS AUTOMÁTICAS DO MARCO IRIS
     Mesmo espírito das receitas: a pessoa escolhe uma vez para onde cada origem de
     pagamento vai (Carteira/Pix/Débito/Reserva) e, depois de salvo, a despesa entra
     sozinha no ciclo de sincronização — sem abrir um formulário por lançamento.
     Crédito continua pedindo revisão manual porque a fatura do cartão depende de
     dados carregados apenas quando aquele perfil está aberto na tela; aplicar isso
     em segundo plano arriscaria mexer no cartão errado enquanto outro perfil está
     aberto no momento da sincronização automática. */
  const MIT_EXPENSE_METHODS = Object.freeze([
    {key:'carteira', label:'Carteira', fixedDestination:'wallet'},
    {key:'pix', label:'Pix'},
    {key:'debito', label:'Débito'},
    {key:'credito', label:'Crédito', fixedDestination:'card'},
    {key:'reserva', label:'Reserva', fixedDestination:'reserve'}
  ]);
  function mitExpenseMethodDefinition(key){ return MIT_EXPENSE_METHODS.find(method=>method.key===key)||MIT_EXPENSE_METHODS[0]; }
  function mitExpenseMethodKey(record){
    const origin=normalize(record?.paymentOrigin);
    if(origin.includes('carteira')) return 'carteira';
    if(origin.includes('pix')) return 'pix';
    if(origin.includes('debit')) return 'debito';
    if(origin.includes('credit')) return 'credito';
    if(origin.includes('reserv')) return 'reserva';
    // Compatibilidade com registros antigos que ainda não enviavam paymentOrigin:
    // tenta inferir a partir da forma de pagamento recebida.
    const method=normalize(record?.paymentMethod);
    if(method.includes('dinheiro')) return 'carteira';
    if(method.includes('debit')) return 'debito';
    if(method.includes('credit')) return 'credito';
    if(method.includes('reserv')) return 'reserva';
    return 'pix';
  }
  function defaultMitExpenseRules(config={}){
    return Object.fromEntries(MIT_EXPENSE_METHODS.map(method=>{
      const wallet=method.fixedDestination==='wallet',card=method.fixedDestination==='card',reserve=method.fixedDestination==='reserve';
      const accountId=wallet?CARTEIRA_CONTA_ID:(card||reserve?null:(String(config.accountId||'')||null));
      return [method.key,{
        key:method.key,label:method.label,category:'Compras Marco Iris',
        destinationKind:wallet?'wallet':(card?'card':(reserve?'reserve':'account')),
        accountId,cardId:null,reserveId:null
      }];
    }));
  }
  function normalizeMitExpenseRules(input,config={}){
    const base=defaultMitExpenseRules(config),value=input&&typeof input==='object'?input:{};
    Object.keys(base).forEach(key=>{
      const method=mitExpenseMethodDefinition(key),current=value[key]&&typeof value[key]==='object'?value[key]:{};
      base[key]={
        key,label:method.label,category:String(current.category||base[key].category||'').trim()||'Compras Marco Iris',
        destinationKind:base[key].destinationKind,
        accountId:method.fixedDestination==='wallet'?CARTEIRA_CONTA_ID:(current.accountId!=null?(String(current.accountId)||null):base[key].accountId),
        cardId:current.cardId!=null?(String(current.cardId)||null):base[key].cardId,
        reserveId:current.reserveId!=null?(String(current.reserveId)||null):base[key].reserveId
      };
    });
    return base;
  }
  function validateMitExpenseRules(data,config,rulesInput=config?.mitExpenseRules){
    const rules=normalizeMitExpenseRules(rulesInput,config||{});
    for(const method of MIT_EXPENSE_METHODS){
      if(method.fixedDestination==='card') continue; // Crédito nunca é aplicado sozinho — ver commitMitExpenseAuto.
      const rule=rules[method.key],label=method.label;
      if(!String(rule.category||'').trim()) throw new Error(`Escolha uma categoria para despesas via ${label}.`);
      if(method.fixedDestination==='wallet'){
        const wallet=accountByIdIn(data,CARTEIRA_CONTA_ID);
        if(!mitAccountActive(wallet)) throw new Error('A Carteira não está disponível no perfil de destino.');
        rule.accountId=CARTEIRA_CONTA_ID;rule.cardId=null;rule.reserveId=null;
      }else if(method.fixedDestination==='reserve'){
        if(!mitReservesEnabled(data)) throw new Error(`Ative o módulo de Reservas antes de usar despesas via ${label}.`);
        const reserve=reserveByIdIn(data,rule.reserveId);
        if(!mitReserveActive(reserve)) throw new Error(`Escolha a reserva usada para despesas via ${label}.`);
        const account=mitReserveLinkedAccount(data,reserve);
        if(!account) throw new Error(`A reserva escolhida para despesas via ${label} não possui uma conta vinculada válida.`);
        rule.reserveId=String(reserve.id);rule.accountId=null;rule.cardId=null;
      }else{
        const account=accountByIdIn(data,rule.accountId);
        if(!mitAccountActive(account)||mitWalletAccount(account)) throw new Error(`Escolha a conta usada para despesas via ${label}.`);
        rule.accountId=String(account.id);rule.cardId=null;rule.reserveId=null;
      }
    }
    return rules;
  }
  function mitOriginalInstallments(record,key=mitMethodKey(record)){
    const direct=Number(record?.installments);
    if(Number.isFinite(direct)&&direct>0) return Math.max(1,Math.min(12,Math.trunc(direct)));
    const match=String(key||'').match(/^credit(\d{1,2})$/);
    return match?Math.max(1,Math.min(12,Number(match[1])||1)):1;
  }
  function resolveMitEntryMethod(rule,record){
    if(rule?.destinationKind==='wallet') return 'Dinheiro';
    return paymentForm(record?.paymentMethod||mitMethodDefinition(mitMethodKey(record)).originalForm);
  }
  function mitAccountActive(account){ return !!(account&&!account.archivedAt&&account.active!==false); }
  function mitWalletAccount(account){ return !!(account&&(String(account.id)===String(CARTEIRA_CONTA_ID)||account.isCarteira)); }
  function mitReserveActive(reserve){ return !!(reserve&&!reserve.archivedAt&&reserve.active!==false); }
  function mitReservesEnabled(data){ return !!(data?.modules?.reserves!==false&&data?.reservas?.enabled!==false); }
  function mitReserveLinkedAccount(data,reserve){
    if(!reserve) return null;
    const direct=accountByIdIn(data,reserve.accountId);
    if(mitAccountActive(direct)&&!mitWalletAccount(direct)) return direct;
    const byName=(data.contas||[]).find(account=>mitAccountActive(account)&&!mitWalletAccount(account)&&normalize(account.nome)===normalize(reserve.banco));
    return byName||null;
  }
  function mitRuleTarget(rule){
    if(rule.destinationKind==='wallet') return {kind:'wallet',id:CARTEIRA_CONTA_ID};
    if(rule.destinationKind==='reserve') return {kind:'reserve',id:String(rule.reserveId||'')};
    return {kind:'account',id:String(rule.accountId||'')};
  }
  function validateMitRevenueRules(data,config,rulesInput=config?.mitRevenueRules){
    const rules=normalizeMitRevenueRules(rulesInput,config||{});
    const categories=Array.isArray(data?.categorias?.receita)?data.categorias.receita:[];
    for(const method of MIT_REVENUE_METHODS){
      const rule=rules[method.key],label=method.label;
      if(!categories.includes(rule.category)) throw new Error(`Escolha uma categoria válida para ${label}.`);
      if(method.fixedDestination==='wallet') rule.destinationKind='wallet';
      if(rule.destinationKind==='wallet'){
        const wallet=accountByIdIn(data,CARTEIRA_CONTA_ID);
        if(!mitAccountActive(wallet)) throw new Error('A Carteira não está disponível no perfil de destino.');
        rule.accountId=CARTEIRA_CONTA_ID;rule.reserveId=null;rule.target='wallet';
      }else if(rule.destinationKind==='account'){
        const account=accountByIdIn(data,rule.accountId);
        if(!mitAccountActive(account)||mitWalletAccount(account)) throw new Error(`Escolha a conta que receberá ${label}.`);
        rule.accountId=String(account.id);rule.reserveId=null;rule.target=`account:${account.id}`;
      }else if(rule.destinationKind==='reserve'){
        if(!mitReservesEnabled(data)) throw new Error(`Ative o módulo de Reservas antes de usar a reserva de ${label}.`);
        const reserve=reserveByIdIn(data,rule.reserveId);
        if(!mitReserveActive(reserve)) throw new Error(`Escolha a reserva que receberá ${label}.`);
        const account=mitReserveLinkedAccount(data,reserve);
        if(!account) throw new Error(`A reserva escolhida para ${label} não possui uma conta vinculada válida.`);
        rule.accountId=null;rule.reserveId=String(reserve.id);rule.target=`reserve:${reserve.id}`;
      }else{
        throw new Error(`Escolha onde o valor de ${label} entra no Borion.`);
      }
    }
    return rules;
  }
  function ensureMitState(data){
    const interop=ensureInterop(data);
    interop.mitImported ||= {receipts:{},expenses:{}};
    interop.mitImported.receipts ||= {};
    interop.mitImported.expenses ||= {};
    (data.transacoes||[]).forEach(tx=>{
      if(!tx||tx.integrationSourceAppId!=='marco-iris'||tx.tipo!=='receita') return;
      const receiptId=String(tx.integrationReceiptId||tx.integrationEntityId||'');
      if(!receiptId) return;
      interop.mitImported.receipts[receiptId] ||= {
        borionId:tx.id||'',aggregateId:tx.integrationAggregateId||'',importedAt:tx.integrationImportedAt||'',
        externalReference:tx.integrationExternalReference||''
      };
    });
    return interop.mitImported;
  }
  function mitMethodKey(record){
    const text=normalize(record?.paymentMethod);
    if(text.includes('dinheiro')) return 'money';
    if(text.includes('debito')) return 'debit';
    if(text.includes('credito')){
      const match=text.match(/(?:credito\s*)?(\d{1,2})\s*x/);
      const raw=match?Number(match[1]):(record?.installments!==undefined&&record?.installments!==null&&record?.installments!==''?Number(record.installments):1);
      if(!Number.isInteger(raw)||raw<1||raw>12) throw new Error('A quantidade de parcelas do Crédito deve estar entre 1 e 12.');
      return `credit${raw}`;
    }
    return 'pix';
  }
  function defaultMappings(){
    return {
      version: SPEC.mappingVersion,
      directions: {income:'receita', expense:'variavel'},
      transactionKinds: {},
      categories: {income:{}, expense:{}},
      paymentMethods: {},
      statuses: {},
      revenueOrigins: {}
    };
  }
  function normalizeMappings(input){
    const base = defaultMappings();
    const value = input && typeof input === 'object' ? input : {};
    base.directions = Object.assign(base.directions, value.directions || value.direction || {});
    base.transactionKinds = Object.assign({}, value.transactionKinds || {});
    base.categories.income = Object.assign({}, value.categories?.income || {});
    base.categories.expense = Object.assign({}, value.categories?.expense || {});
    base.paymentMethods = Object.assign({}, value.paymentMethods || {});
    base.statuses = Object.assign({}, value.statuses || {});
    base.revenueOrigins = Object.assign({}, value.revenueOrigins || {});
    return base;
  }
  function normalizeDiscovered(input){
    const value = input && typeof input === 'object' ? input : {};
    const directional = list => (Array.isArray(list) ? list : []).flatMap(item => item && item.direction ? [item] : ['income','expense'].map(direction => Object.assign({}, item || {}, {direction})));
    return {
      directions: Array.isArray(value.directions) ? value.directions : [],
      transactionKinds: Array.isArray(value.transactionKinds) ? value.transactionKinds : [],
      categories: Array.isArray(value.categories) ? value.categories : [],
      paymentMethods: directional(value.paymentMethods),
      statuses: directional(value.statuses),
      fields: Array.isArray(value.fields) ? value.fields : []
    };
  }
  function ensureInterop(data){
    if(!data.interconnections || typeof data.interconnections !== 'object') data.interconnections = {};
    const root = data.interconnections;
    root.schemaVersion = 2;
    root.importMode = 'smart-native-one-way';
    root.sources ||= {};
    root.imported ||= {};
    root.ignored ||= {};
    root.pending ||= [];
    root.audit ||= [];
    // V6.45.4 — modo de aprovação de importação: '' (ainda não decidido pelo usuário),
    // 'auto' (sincronização silenciosa importa sozinha, como sempre foi) ou 'ask'
    // (a sincronização automática nunca importa sozinha; ela só avisa que há
    // lançamentos novos disponíveis e espera confirmação explícita). Existe para
    // proteger uma importação em massa (ex.: centenas de lançamentos antigos do
    // Marco Iris) sem depender só da data de corte.
    root.importApprovalMode = root.importApprovalMode === 'ask' ? 'ask' : (root.importApprovalMode === 'auto' ? 'auto' : '');
    (data.transacoes || []).forEach(tx => {
      if(!tx || !tx.integrationAggregateId || !tx.integrationSourceAppId) return;
      tx.integrationImported = true;
      tx.integrationManaged = false;
      tx.integrationImportMode = 'native';
    });
    Object.entries(root.sources).forEach(([sourceAppId, config]) => {
      if(!config || typeof config !== 'object') return;
      config.sourceAppId = sourceAppId;
      config.mappings = normalizeMappings(config.mappings);
      config.discovered = normalizeDiscovered(config.discovered);
      config.mappingReady = config.mappingReady === true;
      config.importMode = 'smart-native';
    });
    return root;
  }
  function ensureSourceConfig(config){
    if(!config || typeof config !== 'object') return config;
    config.mappings = normalizeMappings(config.mappings);
    config.discovered = normalizeDiscovered(config.discovered);
    config.mappingReady = config.mappingReady === true;
    config.importMode = 'smart-native';
    if(config.sourceAppId === 'marco-iris'){
      config.mitRevenueRules = normalizeMitRevenueRules(config.mitRevenueRules,config);
      config.mitExpenseRules = normalizeMitExpenseRules(config.mitExpenseRules,config);
      config.mitExpenseMappingReady = config.mitExpenseMappingReady === true;
    }
    // V6.34 — padrão é excluir automaticamente aqui quando o registro some na
    // origem; só fica "preserve" se o usuário desligar explicitamente no toggle.
    config.deletionPolicy = config.deletionPolicy === 'preserve' ? 'preserve' : 'delete';
    // '' = sem corte, importa qualquer data. Preenchido = ignora tudo antes disso.
    config.importCutoffAt = config.importCutoffAt || '';
    return config;
  }
  function profileData(profileId){
    if(S.currentProfile && String(S.currentProfile.id) === String(profileId) && S.data) return S.data;
    return migrateData(getProfileData(profileId) || emptyData(), {profileId});
  }
  function saveProfileData(profileId, data){
    setProfileData(profileId, data);
    if(S.currentProfile && String(S.currentProfile.id) === String(profileId)) S.data = data;
    if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected()) GoogleDriveProvider.queueSave();
    if(window.CloudStorage && CloudStorage.user) CloudStorage.queueSave(profileId, data);
    try{ BackupFS.markDirty(); }catch(_){ }
  }
  function allSourceConfigs(){
    const rows = [];
    (S.profiles || []).forEach(profile => {
      const data = profileData(profile.id);
      const interop = ensureInterop(data);
      Object.entries(interop.sources || {}).forEach(([sourceAppId, config]) => {
        rows.push({sourceAppId, config:ensureSourceConfig(config), profile, data});
      });
    });
    return rows;
  }
  function findSourceConfig(sourceAppId){
    const rows=allSourceConfigs().filter(row=>row.sourceAppId===sourceAppId);
    const currentId=S.currentProfile?.id;
    return rows.find(row=>String(row.profile.id)===String(currentId))||rows[0]||null;
  }

  function openHandleDb(){
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(HANDLE_DB, 1);
      req.onupgradeneeded = () => {
        if(!req.result.objectStoreNames.contains(HANDLE_STORE)) req.result.createObjectStore(HANDLE_STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  async function handleTx(mode, key, value){
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(HANDLE_STORE, mode);
      const store = tx.objectStore(HANDLE_STORE);
      const req = value === undefined ? store.get(key) : store.put(value, key);
      let result;
      req.onsuccess = () => { result = req.result; };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => { db.close(); resolve(result); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }
  function handleKey(sourceAppId, profileId){ return `${sourceAppId}:${profileId}`; }
  async function putHandle(sourceAppId, profileId, handle){ return handleTx('readwrite', handleKey(sourceAppId, profileId), handle); }
  async function getHandle(sourceAppId, profileId){ return handleTx('readonly', handleKey(sourceAppId, profileId)); }

  async function readLocalSnapshot(row){
    const handle = await getHandle(row.sourceAppId, row.profile.id);
    if(!handle) throw new Error('A pasta local da integração ainda não foi conectada neste navegador.');
    const permission = await handle.queryPermission({mode:'readwrite'});
    if(permission !== 'granted' && await handle.requestPermission({mode:'readwrite'}) !== 'granted') throw new Error('Acesso à pasta local não autorizado.');
    const fh = await handle.getFileHandle(SOURCES[row.sourceAppId].snapshotFile);
    return JSON.parse(await (await fh.getFile()).text());
  }
  async function writeLocalAck(row, ack){
    const handle = await getHandle(row.sourceAppId, row.profile.id);
    if(!handle) return;
    const fh = await handle.getFileHandle(SOURCES[row.sourceAppId].ackFile, {create:true});
    const writable = await fh.createWritable();
    await writable.write(new Blob([JSON.stringify(ack, null, 2)], {type:'application/json'}));
    await writable.close();
  }
  async function readDriveSnapshot(row){
    if(!(window.GoogleDriveProvider && GoogleDriveProvider.isConnected())) throw new Error('Conecte primeiro o Borion ao Google Drive.');
    await GoogleDriveAuth.ensureFreshToken();
    const file = await GoogleDriveFS.findChild(row.config.folderId, SOURCES[row.sourceAppId].snapshotFile, 'application/json');
    if(!file) throw new Error('O arquivo de integração não foi encontrado na pasta selecionada. Abra o aplicativo de origem e faça ao menos um salvamento.');
    return await GoogleDriveFS.readFile(file.id);
  }
  async function writeDriveAck(row, ack){
    const name = SOURCES[row.sourceAppId].ackFile;
    const existing = await GoogleDriveFS.findChild(row.config.folderId, name, 'application/json');
    if(existing) await GoogleDriveFS.updateFile(existing.id, ack);
    else await GoogleDriveFS.createFile(row.config.folderId, name, ack);
  }
  async function readSnapshot(row){
    return row.config.transport === 'drive' ? readDriveSnapshot(row) : readLocalSnapshot(row);
  }

  function snapshotCompanyInstance(snapshot){ return String(snapshot?.companyInstanceId || snapshot?.instanceId || '').trim(); }
  function snapshotContentHash(snapshot){
    const company=snapshotCompanyInstance(snapshot);
    return Number(snapshot?.schemaVersion)>=2
      ? hash({companyInstanceId:company,records:snapshot.records||[],tombstones:snapshot.tombstones||[]})
      : hash({records:snapshot.records||[],tombstones:snapshot.tombstones||[]});
  }
  function sourceRecordKey(record){ return String(record?.sourceRecordId || record?.aggregateId || record?.entityId || '').trim(); }
  function validateSnapshot(snapshot, sourceAppId){
    if(!snapshot || snapshot.schema !== 'borion.interop.snapshot') throw new Error('Arquivo não é um snapshot de interconexão do Borion.');
    const protocol=Number(snapshot.schemaVersion);
    if(![1,2].includes(protocol)) throw new Error('Versão de protocolo incompatível.');
    if(snapshot.sourceAppId !== sourceAppId) throw new Error(`A pasta contém dados de ${snapshot.sourceAppId || 'outro aplicativo'}, não de ${sourceAppId}.`);
    const company=snapshotCompanyInstance(snapshot);
    if(!company || !Array.isArray(snapshot.records) || !Array.isArray(snapshot.tombstones)) throw new Error('Snapshot incompleto ou corrompido.');
    if(protocol>=2){
      if(!snapshot.deviceId) throw new Error('Snapshot seguro sem identificador do dispositivo.');
      if(Number(snapshot.recordCount)!==snapshot.records.length) throw new Error('Snapshot rejeitado: contagem de registros divergente.');
      if(snapshot.isCompleteSnapshot!==true) throw new Error('Snapshot rejeitado: publicação incompleta.');
    }
    const ids=new Set(),expectedPrefix=`${sourceAppId}:${company}:`;
    snapshot.records.forEach(record=>{
      const stableId=sourceRecordKey(record);
      if(!record.aggregateId || !record.entityId || !stableId) throw new Error('Existe um registro sem identificador permanente.');
      if(!String(record.aggregateId).startsWith(expectedPrefix)) throw new Error('Snapshot rejeitado: identificador fora da instância oficial.');
      if(ids.has(stableId)) throw new Error('Snapshot rejeitado: identificador de registro duplicado.');
      ids.add(stableId);
      if(!['income','expense'].includes(record.direction)) throw new Error('Direção financeira inválida.');
      if(!Number.isFinite(Number(record.amount)) || Number(record.amount)<0) throw new Error('Valor financeiro inválido.');
    });
    (snapshot.tombstones||[]).forEach(item=>{if(!sourceRecordKey(item))throw new Error('Snapshot rejeitado: exclusão sem identificador permanente.');});
    const calculatedHash=snapshotContentHash(snapshot);
    if(snapshot.contentHash && snapshot.contentHash!==calculatedHash) throw new Error('Snapshot rejeitado: conteúdo alterado ou incompleto.');
    if(protocol>=2&&snapshot.checksum){
      const expected=hash({companyInstanceId:company,revision:Number(snapshot.revision)||0,contentHash:calculatedHash,records:snapshot.records,tombstones:snapshot.tombstones});
      if(snapshot.checksum!==expected) throw new Error('Snapshot rejeitado: checksum divergente.');
    }
    return true;
  }

  function mergeUnique(list, item, identity){
    const key = identity(item);
    const existing = list.find(current => identity(current) === key);
    if(!existing) list.push(item);
    else if(item.label && (!existing.label || existing.label === existing.value)) existing.label = item.label;
  }
  function transactionKindValue(record){
    return record.recordType ?? record.entityType ?? record.kind ?? record.type ?? '';
  }
  function sourceBag(record){
    const candidates=[record?.raw,record?.sourceValues,record?.original,record?.source,record?.payload];
    return candidates.find(value=>value&&typeof value==='object'&&!Array.isArray(value))||{};
  }
  function sourceLabel(record, field, fallback){
    const aliases={
      category:['categoryLabel','categoriaLabel','sourceCategoryLabel'],
      paymentMethod:['paymentMethodLabel','formaPagamentoLabel','sourcePaymentMethodLabel'],
      status:['statusLabel','sourceStatusLabel'],
      recordType:['recordTypeLabel','typeLabel','tipoLabel','sourceTypeLabel'],
      direction:['directionLabel','sourceDirectionLabel']
    };
    const labels=record?.sourceLabels&&typeof record.sourceLabels==='object'?record.sourceLabels:{};
    const raw=sourceBag(record);
    const names=[field].concat(aliases[field]||[]);
    for(const name of names){
      if(labels[name]!==undefined&&labels[name]!==null&&String(labels[name]).trim()) return String(labels[name]).trim();
      if(raw[name]!==undefined&&raw[name]!==null&&String(raw[name]).trim()) return String(raw[name]).trim();
      if(record?.[name]!==undefined&&record?.[name]!==null&&String(record[name]).trim()&&name!==field) return String(record[name]).trim();
    }
    return String(fallback??record?.[field]??'').trim();
  }
  function sourceItem(value, record, field, extra={}){
    const rawValue=String(value??'').trim();
    return Object.assign({key:mappingKey(rawValue),value:rawValue,label:sourceLabel(record,field,rawValue),field},extra);
  }
  function discoverSourceFields(record, discovered){
    const raw=sourceBag(record);
    const entries=Object.keys(raw).length?Object.entries(raw):[
      ['recordType',transactionKindValue(record)],['category',record.category],['paymentMethod',record.paymentMethod],
      ['status',record.status],['description',record.description],['date',record.date],['amount',record.amount],
      ['clientName',record.clientName],['externalReference',record.externalReference]
    ];
    entries.forEach(([name,value])=>{
      if(value===undefined||value===null||typeof value==='object') return;
      mergeUnique(discovered.fields,{key:String(name),sourceName:String(name),sample:String(value),label:sourceLabel(record,String(name),String(name))},item=>item.key);
    });
  }
  function discoverSnapshot(snapshot, current){
    const discovered = normalizeDiscovered(clone(current || {}));
    snapshot.records.forEach(record => {
      if(!discovered.directions.includes(record.direction)) discovered.directions.push(record.direction);
      const categoryValue = String(record.category || '').trim();
      mergeUnique(discovered.categories, sourceItem(categoryValue,record,'category',{direction:record.direction}), item => `${item.direction}:${item.key}`);
      const paymentValue = String(record.paymentMethod || '').trim();
      mergeUnique(discovered.paymentMethods, sourceItem(paymentValue,record,'paymentMethod',{direction:record.direction}), item => `${item.direction}:${item.key}`);
      const statusValue = String(record.status || '').trim();
      mergeUnique(discovered.statuses, sourceItem(statusValue,record,'status',{direction:record.direction}), item => `${item.direction}:${item.key}`);
      const kindValue = String(transactionKindValue(record) || '').trim();
      if(kindValue) mergeUnique(discovered.transactionKinds, sourceItem(kindValue,record,'recordType',{direction:record.direction}), item => `${item.direction}:${item.key}`);
      discoverSourceFields(record,discovered);
    });
    discovered.directions.sort();
    discovered.categories.sort((a,b) => `${a.direction}:${a.label||a.value}`.localeCompare(`${b.direction}:${b.label||b.value}`, 'pt-BR'));
    discovered.paymentMethods.sort((a,b) => `${a.direction}:${a.label||a.value}`.localeCompare(`${b.direction}:${b.label||b.value}`, 'pt-BR'));
    discovered.statuses.sort((a,b) => `${a.direction}:${a.label||a.value}`.localeCompare(`${b.direction}:${b.label||b.value}`, 'pt-BR'));
    discovered.transactionKinds.sort((a,b) => `${a.direction}:${a.label||a.value}`.localeCompare(`${b.direction}:${b.label||b.value}`, 'pt-BR'));
    discovered.fields=discovered.fields.slice(0,60).sort((a,b)=>String(a.sourceName).localeCompare(String(b.sourceName),'pt-BR'));
    return discovered;
  }

  function accountByIdIn(data, accountId){ return (data.contas || []).find(account => String(account.id) === String(accountId)); }
  function accountName(data, accountId){ return accountByIdIn(data, accountId)?.nome || ''; }
  function reserveByIdIn(data,reserveId){ return (data.reservas?.boxes||[]).find(box=>String(box.id)===String(reserveId))||null; }
  function reserveAccountId(data,reserve,config){
    if(!reserve) return '';
    if(accountByIdIn(data,reserve.accountId)) return reserve.accountId;
    const byName=(data.contas||[]).find(account=>normalize(account.nome)===normalize(reserve.banco));
    if(byName) return byName.id;
    return accountByIdIn(data,config.accountId)?config.accountId:'';
  }
  function normalizeTarget(rule,form){
    if(rule?.target){
      const target=String(rule.target);
      if(target==='__default__'||target==='default') return {kind:'default',id:''};
      if(target==='__carteira__'||target==='wallet') return {kind:'wallet',id:CARTEIRA_CONTA_ID};
      if(target.startsWith('account:')) return {kind:'account',id:target.slice(8)};
      if(target.startsWith('reserve:')) return {kind:'reserve',id:target.slice(8)};
    }
    const legacy=rule?.accountId;
    if(legacy==='__carteira__') return {kind:'wallet',id:CARTEIRA_CONTA_ID};
    if(legacy&&legacy!=='__default__') return {kind:'account',id:legacy};
    return {kind:form==='Dinheiro'?'wallet':'default',id:form==='Dinheiro'?CARTEIRA_CONTA_ID:''};
  }
  function resolveFinancialTarget(data,config,record){
    const mapped=record._mappedTarget||{kind:'default',id:''};
    if(mapped.kind==='reserve'){
      const reserve=reserveByIdIn(data,mapped.id);
      return reserve?{kind:'reserve',id:reserve.id,reserve,accountId:reserveAccountId(data,reserve,config)}:null;
    }
    const candidate=mapped.kind==='wallet'?CARTEIRA_CONTA_ID:(mapped.kind==='account'?mapped.id:record._mappedAccountId||config.accountId);
    const account=accountByIdIn(data,candidate);
    return account?{kind:mapped.kind==='wallet'?'wallet':'account',id:account.id,accountId:account.id,account}:null;
  }
  function ensureLedger(data, accountId){
    data.liquidez = Array.isArray(data.liquidez) ? data.liquidez : [];
    let ledger = data.liquidez.find(item => item && item.ledgerType === 'account_delta' && String(item.accountId) === String(accountId));
    if(!ledger){
      const account = accountByIdIn(data, accountId);
      if(!account) return null;
      ledger = {id:'bridge-ledger-' + hash(accountId),accountId,ledgerType:'account_delta',nome:account.nome||'Conta',banco:account.nome||'',valor:0,createdAt:Date.now()};
      data.liquidez.push(ledger);
    }
    return ledger;
  }
  function txDelta(tx){
    if(!tx || !tx.accountId) return 0;
    if(tx.tipo === 'receita') return (Number(tx.valor) || 0) - (Number(tx.reservaValor) || 0);
    if(tx.tipo === 'variavel' && tx.statusPagamento !== 'Em aberto' && tx.origemPagamento !== 'reserva' && tx.formaPagamento !== 'Crédito') return -(Number(tx.valor) || 0);
    return 0;
  }
  function adjust(data, accountId, delta){
    if(!delta) return true;
    const ledger = ensureLedger(data, accountId);
    if(!ledger) return false;
    ledger.valor = Math.round(((Number(ledger.valor) || 0) + Number(delta)) * 100) / 100;
    return true;
  }
  function applyReserveLink(data,tx){
    if(!tx) return true;
    data.reservas ||= {boxes:[],moves:[]};
    data.reservas.boxes=Array.isArray(data.reservas.boxes)?data.reservas.boxes:[];
    data.reservas.moves=Array.isArray(data.reservas.moves)?data.reservas.moves:[];
    if(tx.tipo==='receita'&&tx.reservaBoxId){
      const box=reserveByIdIn(data,tx.reservaBoxId),value=Number(tx.reservaValor)||0;
      if(!box||value<=0) return false;
      if(data.reservas.moves.some(move=>move.transacaoId===tx.id)) return true;
      const move={id:'bridge-reserve-'+hash(tx.id),boxId:box.id,tipo:tx.origem==='rendimento'?'Rendimento':'Receita direta',data:tx.data,valor:value,banco:box.banco||tx.banco||'',descricao:(tx.origem==='rendimento'?'Rendimento integrado: ':'Receita enviada direto para reserva: ')+(tx.nome||'Sem nome'),origem:'receita',transacaoId:tx.id,createdAt:Date.now()};
      data.reservas.moves.push(move); box.valorAtual=Math.round(((Number(box.valorAtual)||0)+value)*100)/100; tx.reservaMoveId=move.id; tx.destinoReserva=true; return true;
    }
    if(tx.tipo==='variavel'&&tx.origemPagamento==='reserva'&&tx.statusPagamento!=='Em aberto'){
      const box=reserveByIdIn(data,tx.reservaOrigemId),value=Number(tx.valor)||0;
      if(!box||value<=0||(Number(box.valorAtual)||0)<value-1e-9) return false;
      if(data.reservas.moves.some(move=>move.despesaTransacaoId===tx.id)) return true;
      const move={id:'bridge-reserve-out-'+hash(tx.id),boxId:box.id,tipo:'Pagamento direto',data:tx.data,valor:value,banco:box.banco||'',descricao:'Pagamento direto integrado: '+(tx.nome||'Despesa'),despesaTransacaoId:tx.id,createdAt:Date.now()};
      data.reservas.moves.push(move); box.valorAtual=Math.round(((Number(box.valorAtual)||0)-value)*100)/100; tx.reservaOrigemMoveId=move.id; return true;
    }
    return true;
  }
  function applyNew(data, tx){
    if(!applyReserveLink(data,tx)) return false;
    const delta = txDelta(tx);
    return delta ? adjust(data, tx.accountId, delta) : true;
  }
  /* V6.45.1 — Equivalente a payFixaOcorrencia, mas só toca no parâmetro `data`.
     payFixaOcorrencia (07-budget.js) lê e grava em S.data/S.reservas — funciona no
     modal de revisão manual porque ali data===S.data sempre (perfil aberto é travado
     antes de abrir o modal). Mas a sincronização automática roda sobre um clone
     (draftData) que pode nem ser o perfil aberto no momento; usar payFixaOcorrencia
     ali aplicaria o pagamento no perfil errado. Esta versão nunca lê/grava S.*. */
  function applyMitFixedExpensePayment(data, fixed, mesKey){
    data.fixaPagamentos = Array.isArray(data.fixaPagamentos) ? data.fixaPagamentos : [];
    const existing = data.fixaPagamentos.find(rec => rec && rec.fixaId === fixed.id && rec.mesKey === mesKey);
    if(existing && existing.pago) return true;
    const valor = Number(fixed.valor) || 0;
    if((fixed.origemPagamento||'conta') === 'reserva'){
      const box = reserveByIdIn(data, fixed.reservaOrigemId);
      if(!box || (Number(box.valorAtual)||0) < valor - 1e-9) return false;
      data.reservas ||= {boxes:[],moves:[]};
      data.reservas.moves = Array.isArray(data.reservas.moves) ? data.reservas.moves : [];
      const move = {id:'bridge-fixa-'+hash(fixed.id+mesKey),boxId:box.id,tipo:'Pagamento de despesa fixa',data:todayISO(),valor,banco:box.banco||'',descricao:'Pagamento de despesa fixa integrada: '+(fixed.nome||'Sem nome'),despesaFixaId:fixed.id,fixaOcorrenciaId:null,createdAt:Date.now()};
      data.reservas.moves.push(move);
      box.valorAtual = Math.round(((Number(box.valorAtual)||0) - valor) * 100) / 100;
      const rec = existing || {id:uid(), fixaId:fixed.id, mesKey};
      Object.assign(rec, {pago:true, origemPagamento:'reserva', reservaId:box.id, reservaMoveId:move.id, valorPago:valor, banco:box.banco||'', pagoEm:Date.now()});
      move.fixaOcorrenciaId = rec.id;
      if(!existing) data.fixaPagamentos.push(rec);
      return true;
    }
    if(!adjust(data, fixed.accountId, -valor)) return false;
    const rec = existing || {id:uid(), fixaId:fixed.id, mesKey};
    Object.assign(rec, {pago:true, origemPagamento:'conta', reservaId:null, reservaMoveId:null, valorPago:valor, accountId:fixed.accountId||null, banco:accountName(data,fixed.accountId), pagoEm:Date.now()});
    if(!existing) data.fixaPagamentos.push(rec);
    return true;
  }
  /* V6.34 — EXCLUSÃO SINCRONIZADA COM TRAVA DE SEGURANÇA
     Assinatura dos campos que o usuário pode editar livremente no Borion depois
     que o lançamento vira nativo. Guardada no momento da criação e recalculada
     no momento em que a origem manda excluir: se bater, o lançamento nunca foi
     tocado manualmente e pode ser excluído com segurança; se não bater, alguém
     editou esse lançamento no Borion depois da importação e ele é preservado
     em vez de apagado, mesmo com a exclusão automática ligada. */
  function editableSnapshotHash(tx){
    return hash({
      nome:tx.nome||'', data:tx.data||'', categoria:tx.categoria||'', valor:Number(tx.valor)||0,
      accountId:tx.accountId||'', banco:tx.banco||'', formaPagamento:tx.formaPagamento||'',
      statusPagamento:tx.statusPagamento||'', origem:tx.origem||'', origemPagamento:tx.origemPagamento||'',
      reservaOrigemId:tx.reservaOrigemId||'', reservaBoxId:tx.reservaBoxId||'', destinoReserva:!!tx.destinoReserva
    });
  }
  function reverseReserveLink(data, tx){
    if(!tx || !data.reservas) return;
    data.reservas.moves = Array.isArray(data.reservas.moves) ? data.reservas.moves : [];
    if(tx.reservaMoveId){
      const idx = data.reservas.moves.findIndex(m => m.id === tx.reservaMoveId);
      if(idx >= 0){
        const mv = data.reservas.moves[idx];
        const box = reserveByIdIn(data, mv.boxId);
        if(box) box.valorAtual = Math.round(Math.max(0, (Number(box.valorAtual)||0) - (Number(mv.valor)||0)) * 100) / 100;
        data.reservas.moves.splice(idx, 1);
      }
    }
    if(tx.reservaOrigemMoveId){
      const idx = data.reservas.moves.findIndex(m => m.id === tx.reservaOrigemMoveId);
      if(idx >= 0){
        const mv = data.reservas.moves[idx];
        const box = reserveByIdIn(data, mv.boxId);
        if(box) box.valorAtual = Math.round(((Number(box.valorAtual)||0) + (Number(mv.valor)||0)) * 100) / 100;
        data.reservas.moves.splice(idx, 1);
      }
    }
  }
  function reverseImportedTransaction(data, tx){
    reverseReserveLink(data, tx);
    const delta = txDelta(tx);
    if(delta) adjust(data, tx.accountId, -delta);
    data.transacoes = (data.transacoes || []).filter(item => item.id !== tx.id);
  }
  function paymentForm(method){
    const m = normalize(method);
    if(m.includes('dinheiro')) return 'Dinheiro';
    if(m.includes('debito')) return 'Débito';
    if(m.includes('credito')) return 'Crédito';
    return 'Pix';
  }
  function inferRevenueOrigin(category){
    const value = normalize(category);
    if(value.includes('reembolso')) return 'reembolso';
    if(value.includes('rendimento') || value.includes('juros')) return 'rendimento';
    if(value.includes('repasse')) return 'repasse';
    return 'propria';
  }
  function mappedRecord(config, record){
    const mappings = normalizeMappings(config.mappings);
    const direction = record.direction;
    const kind = String(transactionKindValue(record) || '').trim();
    const kindTarget = kind ? mappings.transactionKinds[`${direction}:${mappingKey(kind)}`] : '';
    const targetType = kindTarget || mappings.directions[direction] || (direction === 'income' ? 'receita' : 'variavel');
    if(targetType === 'ignore') return {skip:true, reason:'Tipo configurado para ignorar'};

    const statusRule = mappings.statuses[`${direction}:${mappingKey(record.status)}`] || mappings.statuses[mappingKey(record.status)] || 'auto';
    if(statusRule === 'ignore') return {skip:true, reason:'Status configurado para ignorar'};
    const settled = statusRule === 'paid' ? true : (statusRule === 'open' ? false : record.settled === true);

    const categorySource = String(record.category || '').trim();
    const category = String(mappings.categories?.[direction]?.[mappingKey(categorySource)] || categorySource || 'Outro').trim() || 'Outro';
    const methodSource = String(record.paymentMethod || '').trim();
    const paymentRule = mappings.paymentMethods[`${direction}:${mappingKey(methodSource)}`] || mappings.paymentMethods[mappingKey(methodSource)] || {};
    const form = FORMAS_PAGAMENTO.includes(paymentRule.form) ? paymentRule.form : paymentForm(methodSource);
    const target=normalizeTarget(paymentRule,form);
    let accountId=target.kind==='wallet'?CARTEIRA_CONTA_ID:(target.kind==='account'?target.id:config.accountId);

    const revenueOrigin = mappings.revenueOrigins[mappingKey(categorySource)] || inferRevenueOrigin(categorySource);
    return Object.assign({}, record, {
      _borionType: targetType,_mappedCategory: category,_mappedPaymentForm: form,
      _mappedAccountId: accountId,_mappedTarget:target,_mappedRevenueOrigin: revenueOrigin,
      _mappedSettled: settled,_mappingVersion: SPEC.mappingVersion
    });
  }
  function ensureCategory(data, type, category){
    data.categorias ||= defaultCategories();
    const bucket = type === 'receita' ? 'receita' : 'variavel';
    data.categorias[bucket] = Array.isArray(data.categorias[bucket]) ? data.categorias[bucket] : [];
    const value = String(category || 'Outro').trim() || 'Outro';
    if(!data.categorias[bucket].includes(value)) data.categorias[bucket].push(value);
    data.categoryColors ||= {receita:{}, fixa:{}, variavel:{}};
    data.categoryColors[bucket] ||= {};
    if(!data.categoryColors[bucket][value]) data.categoryColors[bucket][value] = baseCatColor(value);
    return value;
  }
  function targetAccountId(data, config, record){
    const target=resolveFinancialTarget(data,config,record);
    return target?.accountId||'';
  }
  function makeTransaction(data, config, record){
    const target=resolveFinancialTarget(data,config,record);
    if(!target) throw new Error(`O destino vinculado ao campo “${record.paymentMethod || 'sem forma de pagamento'}” não existe mais no Borion.`);
    const isIncome = record._borionType === 'receita';
    const category = ensureCategory(data, isIncome ? 'receita' : 'variavel', record._mappedCategory);
    const amount=Math.round((Number(record.amount)||0)*100)/100;
    const reserve=target.kind==='reserve'?target.reserve:null;
    const accountId=reserve?(target.accountId||null):target.accountId;
    const bank=reserve?(reserve.banco||accountName(data,accountId)):accountName(data,accountId);
    const base = {
      id:'bridge-' + hash(record.aggregateId),nome:record.description || 'Lançamento integrado',
      data:record.date || new Date().toISOString().slice(0,10),categoria:category,valor:amount,
      accountId,banco:bank,integrationImported:true,integrationManaged:false,integrationImportMode:'native',
      integrationAggregateId:record.aggregateId,integrationSourceAppId:config.sourceAppId,integrationEntityId:record.entityId,
      integrationOriginalFingerprint:record.fingerprint || hash(record),integrationImportedAt:nowIso(),
      integrationSourceUpdatedAt:record.sourceUpdatedAt || '',integrationExternalReference:record.externalReference || '',
      integrationClientName:record.clientName || '',integrationNotes:record.notes || '',
      integrationOriginalCategory:record.category || '',integrationOriginalPaymentMethod:record.paymentMethod || '',
      integrationOriginalStatus:record.status || '',integrationOriginalSourceValues:clone(sourceBag(record)),integrationMappingVersion:SPEC.mappingVersion
    };
    const tx = isIncome
      ? Object.assign(base,{tipo:'receita',origem:record._mappedRevenueOrigin||'propria',reservaValor:reserve?amount:0,destinoModo:reserve?'Direto para reserva':'Conta livre',reservaBoxId:reserve?reserve.id:null,destinoReserva:!!reserve,formaPagamento:record._mappedPaymentForm})
      : Object.assign(base,{tipo:'variavel',accountId:reserve?null:accountId,statusPagamento:record._mappedSettled?'Pago':'Em aberto',origemPagamento:reserve?'reserva':'conta',formaPagamento:reserve?null:record._mappedPaymentForm,reservaOrigemId:reserve?reserve.id:null,reservaOrigemMoveId:null,localCompra:''});
    tx.integrationEditGuardHash = editableSnapshotHash(tx);
    return tx;
  }

  function importedState(data, sourceAppId){
    const interop=ensureInterop(data);
    const state=interop.imported[sourceAppId] ||= {companyInstanceId:'',instanceId:'',lastRevision:0,lastContentHash:'',records:{},lastSyncAt:'',lastError:''};
    state.companyInstanceId=String(state.companyInstanceId||state.instanceId||'');
    state.instanceId=state.companyInstanceId;
    state.records ||= {};
    return state;
  }
  function bindOrAssertCompanyInstance(data,config,snapshot,{allowBind=false}={}){
    const state=importedState(data,config.sourceAppId),incoming=snapshotCompanyInstance(snapshot);
    const bound=String(config.companyInstanceId||state.companyInstanceId||state.instanceId||'').trim();
    if(bound&&incoming!==bound){
      const error=new Error('A origem da integração mudou. Os dados não foram processados. Confirme a reconexão desta instalação do Marco Iris Tecnologia.');
      error.code='INSTANCE_CONFLICT';error.expectedCompanyInstanceId=bound;error.receivedCompanyInstanceId=incoming;throw error;
    }
    if(!bound){
      if(!allowBind){const error=new Error('A instalação oficial ainda não foi vinculada. Reconfigure a conexão antes de sincronizar.');error.code='INSTANCE_NOT_BOUND';throw error;}
      config.companyInstanceId=incoming;config.boundAt=nowIso();
    }
    state.companyInstanceId=incoming;state.instanceId=incoming;config.companyInstanceId=incoming;config.lastDeviceId=String(snapshot.deviceId||'');
    return incoming;
  }

  // V6.45.4 — troca de instalação somente com confirmação explícita. A base financeira
  // já importada permanece no Borion como lançamento nativo; apenas os vínculos técnicos
  // e filas da instalação antiga são encerrados para que IDs antigos não contaminem a
  // nova origem. Nenhum lançamento do snapshot novo é importado nesta etapa.
  function applyConfirmedInstanceRebind(data,config,snapshot){
    const sourceAppId=String(config?.sourceAppId||snapshot?.sourceAppId||'').trim();
    if(sourceAppId!=='marco-iris') throw new Error('A reconexão de instalação é exclusiva do Marco Iris Tecnologia.');
    validateSnapshot(snapshot,sourceAppId);
    const incoming=snapshotCompanyInstance(snapshot);
    if(!incoming) throw new Error('A nova instalação não informou um identificador válido.');
    const interop=ensureInterop(data),oldState=importedState(data,sourceAppId);
    const previous=String(config.companyInstanceId||oldState.companyInstanceId||oldState.instanceId||'').trim();
    interop.instanceHistory=Array.isArray(interop.instanceHistory)?interop.instanceHistory:[];
    interop.instanceHistory.unshift({
      sourceAppId,previousCompanyInstanceId:previous,newCompanyInstanceId:incoming,
      changedAt:nowIso(),previousRevision:Number(oldState.lastRevision||0),
      previousRecordCount:Object.keys(oldState.records||{}).length,
      previousPendingCount:(interop.pending||[]).filter(item=>item&&item.sourceAppId===sourceAppId).length,
      reason:'confirmed_reinstall'
    });
    interop.instanceHistory=interop.instanceHistory.slice(0,30);
    interop.pending=(interop.pending||[]).filter(item=>!item||item.sourceAppId!==sourceAppId);
    interop.ignored[sourceAppId]={};
    interop.imported[sourceAppId]={companyInstanceId:incoming,instanceId:incoming,lastRevision:0,lastContentHash:'',records:{},lastSyncAt:'',lastError:''};
    interop.mitImported={receipts:{},expenses:{}};
    config.companyInstanceId=incoming;
    config.boundAt=nowIso();
    config.reconfiguredAt=nowIso();
    config.lastDeviceId=String(snapshot.deviceId||'');
    config.lastRevision=0;
    config.lastContentHash='';
    config.lastSyncAt='';
    config.lastAttemptAt='';
    config.lastResult={created:0,createdReceipts:0,createdExpenses:0,deleted:0,unchanged:0,pendingExpenses:0,ignoredBeforeCutoff:0,errors:0,processed:0};
    config.lastError='';
    config.reconnectRequired=false;
    config.pendingCompanyInstanceId='';
    config.previousCompanyInstanceId='';
    config.reconnectDetectedAt='';
    return {previousCompanyInstanceId:previous,companyInstanceId:incoming};
  }
  function existingAckResults(data,state,snapshot){
    const pending=(ensureInterop(data).pending||[]).filter(x=>x.sourceAppId===snapshot.sourceAppId);
    const pendingKeys=new Set(pending.flatMap(x=>[String(x.aggregateId||''),String(x.sourceRecordId||''),String(x.entityId||'')]).filter(Boolean));
    return (snapshot.records||[]).map(record=>{
      const marker=state.records?.[record.aggregateId],key=sourceRecordKey(record);let result='already_processed',borionId=marker?.txId||'';
      if(marker?.status==='ignored')result=marker?.reason==='user_deleted_in_borion'||marker?.reason==='user_permanent_ignore'?'ignored_permanently':'ignored_by_cutoff';
      else if(marker?.status==='waiting'||pendingKeys.has(key)||pendingKeys.has(String(record.aggregateId))||pendingKeys.has(String(record.entityId)))result=record.direction==='expense'?'pending_review':'already_processed';
      else if(record.active===false||normalize(record.status).includes('cancel'))result='cancelled';
      return {sourceRecordId:key,aggregateId:record.aggregateId,entityId:record.entityId,result,status:result,processedRevision:Number(snapshot.revision)||0,borionId,borionTransactionId:borionId,processedAt:nowIso(),message:result==='pending_review'?'Registro continua aguardando revisão.':'Registro já processado; nenhuma duplicidade criada.'};
    });
  }

  function ignoredState(data, sourceAppId){
    const interop = ensureInterop(data);
    return interop.ignored[sourceAppId] ||= {};
  }
  function ignoredKeysForMit(recordOrTx){
    const entityId=String(recordOrTx?.receiptId||recordOrTx?.integrationReceiptId||recordOrTx?.integrationExpenseId||recordOrTx?.entityId||recordOrTx?.integrationEntityId||'').trim();
    const aggregateId=String(recordOrTx?.aggregateId||recordOrTx?.integrationAggregateId||'').trim();
    const sourceRecordId=String(recordOrTx?.sourceRecordId||recordOrTx?.integrationSourceRecordId||'').trim()||
      (entityId?`marco:${recordOrTx?.direction==='expense'||recordOrTx?.integrationExpenseId?'expense':'receipt'}:${entityId}`:'');
    return [...new Set([aggregateId,sourceRecordId,entityId].filter(Boolean))];
  }
  function findIgnoredMitRecord(data,record){
    const ignored=ignoredState(data,'marco-iris');
    for(const key of ignoredKeysForMit(record)){if(ignored[key])return ignored[key];}
    return null;
  }
  function findImportedTransaction(data, sourceAppId, aggregateId){
    return (data.transacoes || []).find(tx =>
      tx && tx.integrationAggregateId === aggregateId && tx.integrationSourceAppId === sourceAppId
    ) || null;
  }

  function findMitImportedIncome(data, receiptId){
    const wanted=String(receiptId||'');
    return (data.transacoes||[]).find(tx=>tx&&tx.integrationSourceAppId==='marco-iris'&&String(tx.integrationReceiptId||tx.integrationEntityId||'')===wanted)||null;
  }
  function mitRecordPaid(record){
    const status=normalize(record?.status);
    return record?.settled===true&&['paid','pago','received','recebido'].includes(status);
  }
  function findMitImportedMarker(state,receiptId){
    const wanted=String(receiptId||'');
    return Object.values(state?.records||{}).find(marker=>marker&&marker.status==='imported'&&String(marker.entityId||'')===wanted)||null;
  }
  function findMitMarkerByEntity(state,entityId){
    const wanted=String(entityId||'');
    const entry=Object.entries(state?.records||{}).find(([,marker])=>marker&&String(marker.entityId||'')===wanted);
    return entry?{aggregateId:entry[0],marker:entry[1]}:null;
  }
  function recordLocalDeletion(data,collection,id,reason='integration_source_deleted'){
    if(!id||!window.BorionSyncCore?.recordTombstone)return null;
    return BorionSyncCore.recordTombstone(data,collection,String(id),null,'interop-'+Date.now(),{reason});
  }
  function removeMitIncomeFromBorion(data,state,mitState,entityId,aggregateId,deletedAt,reason='source_cancelled'){
    const receiptId=String(entityId||''),markerEntry=findMitMarkerByEntity(state,receiptId),receiptState=mitState.receipts[receiptId]||{},nativeTx=findMitImportedIncome(data,receiptId)||((data.transacoes||[]).find(tx=>tx&&String(tx.id)===String(receiptState.borionId||markerEntry?.marker?.txId||''))||null);
    const previousTxId=String(nativeTx?.id||receiptState.borionId||markerEntry?.marker?.txId||'');
    if(nativeTx){reverseImportedTransaction(data,nativeTx);recordLocalDeletion(data,'transacoes',nativeTx.id,reason);}
    const officialAggregate=String(aggregateId||receiptState.aggregateId||markerEntry?.aggregateId||'');
    mitState.receipts[receiptId]=Object.assign({},receiptState,{borionId:'',previousBorionId:previousTxId,aggregateId:officialAggregate,cancelledAt:deletedAt||nowIso(),status:'cancelled'});
    if(officialAggregate)state.records[officialAggregate]={status:'cancelled',txId:'',previousTxId,entityId:receiptId,sourceRecordId:`marco:receipt:${receiptId}`,cancelledAt:deletedAt||nowIso(),reason};
    return {removed:!!nativeTx,previousTxId,aggregateId:officialAggregate};
  }
  function removeMitExpenseFromBorion(data,state,mitState,entityId,aggregateId,deletedAt,reason='source_cancelled'){
    const expenseId=String(entityId||''),markerEntry=findMitMarkerByEntity(state,expenseId),expenseState=mitState.expenses[expenseId]||{},borionId=String(expenseState.borionId||markerEntry?.marker?.txId||'');
    let removed=false;
    const tx=(data.transacoes||[]).find(item=>item&&String(item.id)===borionId);
    if(tx){reverseImportedTransaction(data,tx);recordLocalDeletion(data,'transacoes',tx.id,reason);removed=true;}
    const fixed=(data.fixas||[]).find(item=>item&&String(item.id)===borionId);
    if(fixed){
      const payments=(data.fixaPagamentos||[]).filter(item=>item&&String(item.fixaId)===String(fixed.id));
      payments.forEach(payment=>{
        if(payment.pago){
          if(payment.origemPagamento==='reserva'&&payment.reservaMoveId){const move=(data.reservas?.moves||[]).find(item=>item.id===payment.reservaMoveId),box=reserveByIdIn(data,payment.reservaId||move?.boxId);if(box)box.valorAtual=Math.round(((Number(box.valorAtual)||0)+(Number(payment.valorPago)||Number(fixed.valor)||0))*100)/100;if(data.reservas?.moves)data.reservas.moves=data.reservas.moves.filter(item=>item.id!==payment.reservaMoveId);}
          else adjust(data,payment.accountId||fixed.accountId,Number(payment.valorPago)||Number(fixed.valor)||0);
        }
        recordLocalDeletion(data,'fixaPagamentos',payment.id,reason);
      });
      data.fixaPagamentos=(data.fixaPagamentos||[]).filter(item=>String(item.fixaId)!==String(fixed.id));
      data.fixas=(data.fixas||[]).filter(item=>String(item.id)!==String(fixed.id));
      recordLocalDeletion(data,'fixas',fixed.id,reason);removed=true;
    }
    const officialAggregate=String(aggregateId||expenseState.aggregateId||markerEntry?.aggregateId||'');
    mitState.expenses[expenseId]=Object.assign({},expenseState,{borionId:'',previousBorionId:borionId,aggregateId:officialAggregate,cancelledAt:deletedAt||nowIso(),status:'cancelled'});
    if(officialAggregate)state.records[officialAggregate]={status:'cancelled',txId:'',previousTxId:borionId,entityId:expenseId,sourceRecordId:`marco:expense:${expenseId}`,cancelledAt:deletedAt||nowIso(),reason};
    return {removed,previousTxId:borionId,aggregateId:officialAggregate};
  }
  function makeMitIncomeTransaction(data,config,record){
    const key=mitMethodKey(record),rules=validateMitRevenueRules(data,config,config.mitRevenueRules),rule=rules[key];
    if(!rule) throw new Error('A forma de recebimento do Marco Iris não é suportada.');
    const target=mitRuleTarget(rule),entryMethod=resolveMitEntryMethod(rule,record);
    const converted=Object.assign({},record,{
      date:record.paymentDate,
      _borionType:'receita',_mappedCategory:rule.category,_mappedPaymentForm:entryMethod,
      _mappedAccountId:target.kind==='account'?target.id:config.accountId,_mappedTarget:target,
      _mappedRevenueOrigin:'propria',_mappedSettled:true,_mappingVersion:SPEC.mappingVersion
    });
    const tx=makeTransaction(data,config,converted);
    tx.nome=record.description||`${record.orderNumber||'Sem OSV'} • ${record.clientName||'Cliente não informado'}`;
    tx.integrationReceiptId=String(record.receiptId||record.entityId||'');
    tx.integrationOrderNumber=record.orderNumber||'';
    tx.integrationClientName=record.clientName||'';
    tx.integrationExternalReference=record.externalReference||'';
    tx.integrationPaymentMethodOriginal=record.paymentMethod||'';
    tx.integrationOriginalPaymentMethod=record.paymentMethod||'';
    tx.integrationOriginalInstallments=mitOriginalInstallments(record,key);
    tx.integrationPaymentDate=record.paymentDate||'';
    tx.integrationEntryMethod=entryMethod;
    tx.integrationEntryMethodDerived=true;
    tx.integrationDestinationKind=rule.destinationKind;
    return tx;
  }
  function mitExpenseAutoMeta(record){
    return {
      integrationImported:true,integrationManaged:false,integrationImportMode:'native-automatic',
      integrationAggregateId:record.aggregateId,integrationSourceAppId:'marco-iris',integrationEntityId:record.entityId,
      integrationExpenseId:record.entityId,integrationImportedAt:nowIso(),integrationExternalReference:record.externalReference||'',
      integrationOriginalStatus:record.status||'',integrationOriginalPaymentMethod:record.paymentMethod||'',
      integrationOriginalSourceValues:clone(sourceBag(record)),integrationMappingVersion:SPEC.mappingVersion
    };
  }
  /* V6.45.1 — Cria a despesa sozinha, sem passar pela revisão manual. Só cobre
     Carteira/Pix/Débito/Reserva: Crédito sempre lança um erro aqui de propósito
     (ver comentário de MIT_EXPENSE_METHODS) e cai na fila "Aguardando Revisão". */
  function commitMitExpenseAuto(data,config,record){
    const key=mitExpenseMethodKey(record),rules=validateMitExpenseRules(data,config,config.mitExpenseRules),rule=rules[key];
    if(!rule) throw new Error('A origem de pagamento da despesa do Marco Iris não é suportada.');
    if(rule.destinationKind==='card') throw new Error('Despesas no Crédito pedem revisão manual no Borion (fatura do cartão).');
    const type=normalize(record.expenseType)==='fixa'?'fixa':'variavel';
    const name=String(record.name||record.description||'Despesa do Marco Iris').trim();
    const localPurchase=String(record.localPurchase||'').trim();
    const category=ensureMitExpenseCategory(data,type,String(record.category||rule.category||'Outro').trim()||rule.category);
    const value=Math.round((Number(record.amount)||0)*100)/100;
    if(value<=0) throw new Error('Valor inválido para importar automaticamente.');
    const date=record.date||record.dueDate||todayISO();
    const status=mitRecordPaid(record)?'Pago':'Em aberto';
    const meta=mitExpenseAutoMeta(record);
    let accountId=null,banco='',origemPagamento='conta',formaPagamento=null,reserve=null;
    if(rule.destinationKind==='wallet'){
      accountId=CARTEIRA_CONTA_ID;
      if(!accountByIdIn(data,accountId)) throw new Error('A Carteira não está disponível.');
      banco=accountName(data,accountId);formaPagamento='Dinheiro';
    }else if(rule.destinationKind==='reserve'){
      reserve=reserveByIdIn(data,rule.reserveId);
      if(!reserve) throw new Error('A reserva configurada não está mais disponível.');
      origemPagamento='reserva';banco=reserve.banco||'';
    }else{
      accountId=rule.accountId;
      if(!accountByIdIn(data,accountId)) throw new Error('A conta configurada não está mais disponível.');
      banco=accountName(data,accountId);formaPagamento=key==='debito'?'Débito':'Pix';
    }
    let borionId='';
    if(type==='fixa'){
      const fixed=Object.assign({id:uid(),nome:name,localCompra:localPurchase,category,categoria:category,valor:value,dia:Math.max(1,Number(String(date).slice(8,10))||1),dataCadastro:date,startMonth:String(date).slice(0,7),endMonth:null,accountId:origemPagamento==='conta'?accountId:null,banco,formaPagamento:origemPagamento==='conta'?formaPagamento:null,origemPagamento,reservaOrigemId:reserve?.id||null},meta);
      data.fixas=Array.isArray(data.fixas)?data.fixas:[];data.fixaPagamentos=Array.isArray(data.fixaPagamentos)?data.fixaPagamentos:[];
      data.fixas.push(fixed);borionId=fixed.id;
      if(status==='Pago'&&!applyMitFixedExpensePayment(data,fixed,fixed.startMonth)){
        data.fixas=data.fixas.filter(f=>f.id!==fixed.id);
        throw new Error('Não foi possível aplicar o pagamento da despesa fixa (saldo insuficiente ou destino inválido).');
      }
    }else{
      const tx=Object.assign({id:uid(),tipo:'variavel',nome:name,localCompra:localPurchase,categoria:category,valor:value,data:date,statusPagamento:status,accountId:origemPagamento==='conta'?accountId:null,banco,origemPagamento,formaPagamento:origemPagamento==='conta'?formaPagamento:null,reservaOrigemId:reserve?.id||null,reservaOrigemMoveId:null},meta);
      data.transacoes=Array.isArray(data.transacoes)?data.transacoes:[];data.transacoes.push(tx);borionId=tx.id;
      if(status==='Pago'&&!applyNew(data,tx)){
        data.transacoes=data.transacoes.filter(item=>item.id!==tx.id);
        throw new Error('Não foi possível aplicar o saldo da despesa (saldo de reserva insuficiente ou destino inválido).');
      }
    }
    return borionId;
  }
  function reconcileMitSnapshotMutable(data,config,snapshot,{mode='manual'}={}){
    validateSnapshot(snapshot,config.sourceAppId);
    ensureSourceConfig(config);
    if(!config.mappingReady) throw new Error('Configure as receitas do Marco Iris antes de sincronizar esta integração.');
    config.mitRevenueRules=validateMitRevenueRules(data,config,config.mitRevenueRules);
    const interop=ensureInterop(data),state=importedState(data,config.sourceAppId),mitState=ensureMitState(data);
    bindOrAssertCompanyInstance(data,config,snapshot,{allowBind:true});
    const incomingRevision=Number(snapshot.revision)||0,incomingHash=snapshot.contentHash||snapshotContentHash(snapshot);
    if(incomingRevision<Number(state.lastRevision||0)){const error=new Error('Snapshot antigo rejeitado: a revisão recebida é inferior à última já processada.');error.code='STALE_REVISION';throw error;}
    if(incomingRevision===Number(state.lastRevision||0)&&incomingHash===state.lastContentHash){
      const results=existingAckResults(data,state,snapshot),pending=(interop.pending||[]).filter(x=>x.sourceAppId==='marco-iris');
      return {results,pending,summary:Object.assign({},config.lastResult||{},{processed:results.length,created:0,createdReceipts:0,createdExpenses:0,deleted:0,unchanged:results.length,pendingExpenses:pending.length,errors:0}),changed:false};
    }
    state.records ||= {};
    const results=[];
    const pendingEntries=(interop.pending||[]).filter(item=>item.sourceAppId==='marco-iris');
    const pendingById=new Map(pendingEntries.map(item=>[String(item.sourceRecordId||item.entityId||item.aggregateId),item]));
    function deletePending(record){const keys=[sourceRecordKey(record),String(record.entityId||''),String(record.receiptId||''),String(record.aggregateId||'')];for(const key of keys){if(!key)continue;pendingById.delete(key);for(const [stored,item] of pendingById){if([item.sourceRecordId,item.entityId,item.aggregateId].map(String).includes(key))pendingById.delete(stored);}}}
    (snapshot.records||[]).forEach(record=>{
      const entityId=String(record.receiptId||record.entityId||'').trim();
      if(!entityId) throw new Error('O Marco Iris enviou um registro sem identificador permanente. A sincronização foi cancelada sem alterar os dados.');
      const aggregateId=String(record.aggregateId||'').trim(),recordKey=sourceRecordKey(record);
      if(!aggregateId) throw new Error(`O registro ${entityId} não possui identificador agregado da integração.`);
      const ignoredEntry=findIgnoredMitRecord(data,record);
      if(ignoredEntry){
        deletePending(record);
        const removed=record.direction==='expense'
          ?removeMitExpenseFromBorion(data,state,mitState,entityId,aggregateId,ignoredEntry.ignoredAt||nowIso(),'ignored_permanently_in_borion')
          :removeMitIncomeFromBorion(data,state,mitState,entityId,aggregateId,ignoredEntry.ignoredAt||nowIso(),'ignored_permanently_in_borion');
        state.records[aggregateId]={status:'ignored',txId:'',entityId,sourceRecordId:recordKey,ignoredAt:ignoredEntry.ignoredAt||nowIso(),reason:'user_permanent_ignore'};
        results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'ignored',result:'ignored_permanently',borionTransactionId:'',message:removed.removed?'Lançamento removido e mantido na lista de ignorados permanentes.':'Ignorado permanentemente no Borion; não será importado novamente.'});
        return;
      }
      if(record.direction==='expense'){
        const importedExpense=mitState.expenses[entityId];
        if(record.active===false||['cancelled','canceled','cancelado'].includes(normalize(record.status))){
          deletePending(record);
          if(importedExpense){
            const removed=removeMitExpenseFromBorion(data,state,mitState,entityId,aggregateId,record.sourceUpdatedAt||snapshot.generatedAt||nowIso(),'source_cancelled');
            results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'cancelled',result:'cancelled',borionTransactionId:'',message:removed.removed?'Despesa cancelada na origem e removida do Borion com estorno do efeito financeiro.':'Despesa cancelada na origem; vínculo antigo encerrado.'});
          }else{
            state.records[aggregateId]={status:'cancelled',entityId,cancelledAt:record.sourceUpdatedAt||nowIso()};
            results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'cancelled',result:'cancelled',borionTransactionId:'',message:'Despesa cancelada na origem; retirada da revisão.'});
          }
          return;
        }
        if(importedExpense){
          deletePending(record);
          state.records[aggregateId]=Object.assign({},state.records[aggregateId]||{},{status:'imported',entityId,importedAt:importedExpense.importedAt||''});
          results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'unchanged',result:'already_processed',borionTransactionId:importedExpense.borionId||'',message:'Despesa já importada; duplicidade bloqueada.'});
          return;
        }
        if(beforeImportCutoff(config,record.date||record.dueDate)){
          deletePending(record);
          state.records[aggregateId]={status:'ignored',entityId,reason:'before_cutoff',updatedAt:record.sourceUpdatedAt||''};
          results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'ignored_before_cutoff',result:'ignored_by_cutoff',borionTransactionId:'',message:'Fora do período configurado para importação.'});
          return;
        }
        if(config.mitExpenseMappingReady){
          try{
            const borionId=commitMitExpenseAuto(data,config,record);deletePending(record);const importedAt=nowIso();
            mitState.expenses[entityId]={borionId,aggregateId,importedAt};state.records[aggregateId]={status:'imported',txId:borionId,entityId,importedAt,fingerprint:record.fingerprint||hash(record)};
            results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'expense_created',result:'imported',borionTransactionId:borionId,message:'Despesa recebida e importada automaticamente.'});return;
          }catch(_autoError){/* Crédito, destino removido ou regra incompleta: mantém revisão. */}
        }
        const previous=[...pendingById.values()].find(item=>[item.sourceRecordId,item.entityId,item.aggregateId].map(String).includes(recordKey)||String(item.entityId)===entityId);
        const pending={sourceAppId:'marco-iris',companyInstanceId:snapshotCompanyInstance(snapshot),sourceRecordId:recordKey,aggregateId,entityId,
          enteredAt:previous?.enteredAt||nowIso(),sourceRevision:incomingRevision,reason:'manual_review',decisionHistory:Array.isArray(previous?.decisionHistory)?previous.decisionHistory:[],
          name:record.name||record.description||'Despesa do Marco Iris',description:record.description||record.name||'Despesa do Marco Iris',localPurchase:record.localPurchase||'',category:record.category||'',amount:Number(record.amount)||0,
          date:record.date||record.dueDate||todayISO(),origin:'Marco Iris',status:(record.settled===true||mitRecordPaid(record))?'Pago':'Em aberto',paymentMethod:record.paymentMethod||'',externalReference:record.externalReference||'',mapping:clone(config.mitExpenseRules||{}),record:clone(record),updatedAt:record.sourceUpdatedAt||snapshot.generatedAt||nowIso()};
        deletePending(record);pendingById.set(recordKey,pending);state.records[aggregateId]={status:'waiting',entityId,sourceRecordId:recordKey,fingerprint:record.fingerprint||hash(record),updatedAt:pending.updatedAt};
        results.push({sourceRecordId:recordKey,aggregateId,entityId,status:'waiting_expense',result:'pending_review',borionTransactionId:'',message:'Aguardando revisão manual no Borion.'});
        return;
      }
      const receiptId=entityId,nativeTx=findMitImportedIncome(data,receiptId),receiptMarker=findMitImportedMarker(state,receiptId),receiptState=mitState.receipts[receiptId];
      const receiptCancelled=record.active===false||normalize(record.status).includes('cancel')||record.operationType==='cancel';
      if(receiptCancelled){
        const removed=removeMitIncomeFromBorion(data,state,mitState,receiptId,aggregateId,record.sourceUpdatedAt||nowIso(),'source_cancelled');
        results.push({sourceRecordId:recordKey,aggregateId,entityId:receiptId,status:'cancelled',result:'cancelled',borionTransactionId:'',message:removed.removed?'Recebimento cancelado na origem e removido do Borion com estorno do saldo.':'Recebimento cancelado na origem; nenhum lançamento ativo permaneceu no Borion.'});
        return;
      }
      if(nativeTx||receiptState||receiptMarker){
        const txId=nativeTx?.id||receiptState?.borionId||receiptMarker?.txId||'';
        mitState.receipts[receiptId] ||= {borionId:txId,aggregateId:nativeTx?.integrationAggregateId||aggregateId,importedAt:nativeTx?.integrationImportedAt||receiptMarker?.importedAt||nowIso()};
        state.records[aggregateId]={status:'imported',txId,entityId:receiptId,sourceRecordId:recordKey,importedAt:mitState.receipts[receiptId].importedAt};
        results.push({sourceRecordId:recordKey,aggregateId,entityId:receiptId,status:'unchanged',result:'already_processed',borionTransactionId:txId,message:'Recebimento já importado; duplicidade bloqueada.'});return;
      }
      if(beforeImportCutoff(config,record.paymentDate||record.date)){
        state.records[aggregateId]={status:'ignored',entityId:receiptId,sourceRecordId:recordKey,reason:'before_cutoff',updatedAt:record.sourceUpdatedAt||''};
        results.push({sourceRecordId:recordKey,aggregateId,entityId:receiptId,status:'ignored_before_cutoff',result:'ignored_by_cutoff',borionTransactionId:'',message:'Fora do período configurado para importação.'});return;
      }
      if(record.active===false||!mitRecordPaid(record)||!record.paymentDate){
        state.records[aggregateId]={status:'waiting',entityId:receiptId,sourceRecordId:recordKey,reason:'not-paid',updatedAt:record.sourceUpdatedAt||''};
        results.push({sourceRecordId:recordKey,aggregateId,entityId:receiptId,status:'waiting_receipt',result:'pending_review',borionTransactionId:'',message:'Recebimento ainda não está Pago com Data de Pagamento.'});return;
      }
      const tx=makeMitIncomeTransaction(data,config,record);data.transacoes=Array.isArray(data.transacoes)?data.transacoes:[];
      if(data.transacoes.some(item=>item.id===tx.id))tx.id+='-'+hash(receiptId+nowIso());data.transacoes.push(tx);
      if(!applyNew(data,tx)){data.transacoes=data.transacoes.filter(item=>item.id!==tx.id);throw new Error('Não foi possível aplicar o destino financeiro da receita '+receiptId+'.');}
      mitState.receipts[receiptId]={borionId:tx.id,aggregateId,importedAt:tx.integrationImportedAt,externalReference:record.externalReference||''};
      state.records[aggregateId]={status:'imported',txId:tx.id,entityId:receiptId,sourceRecordId:recordKey,importedAt:tx.integrationImportedAt,fingerprint:tx.integrationOriginalFingerprint};
      results.push({sourceRecordId:recordKey,aggregateId,entityId:receiptId,status:'created',result:'imported',borionTransactionId:tx.id,message:'Receita recebida e importada automaticamente.'});
    });
    /* Ausência simples nunca apaga nada. Tombstone explícito remove pendência e,
       quando houver importação concluída, exclui o lançamento nativo com estorno. */
    (snapshot.tombstones||[]).forEach(tomb=>{
      const key=sourceRecordKey(tomb),parts=String(key||'').split(':'),entityId=String(tomb.entityId||parts[parts.length-1]||''),isReceipt=String(key).includes(':receipt:'),candidate=[...pendingById.entries()].find(([,item])=>[item.sourceRecordId,item.aggregateId,item.entityId].map(String).includes(key)||String(item.entityId)===entityId);
      if(candidate)pendingById.delete(candidate[0]);
      const markerEntry=findMitMarkerByEntity(state,entityId),aggregateId=String((String(tomb.aggregateId||'').startsWith('marco-iris:')?tomb.aggregateId:'')||markerEntry?.aggregateId||candidate?.[1]?.aggregateId||'');
      const removed=isReceipt
        ?removeMitIncomeFromBorion(data,state,mitState,entityId,aggregateId,tomb.deletedAt||nowIso(),tomb.reason||'source_tombstone')
        :removeMitExpenseFromBorion(data,state,mitState,entityId,aggregateId,tomb.deletedAt||nowIso(),tomb.reason||'source_tombstone');
      results.push({sourceRecordId:key,aggregateId:removed.aggregateId||aggregateId,entityId,status:'cancelled',result:'cancelled',borionTransactionId:'',message:removed.removed?'Exclusão definitiva recebida da origem; lançamento removido do Borion com estorno.':'Exclusão definitiva recebida da origem; vínculo antigo encerrado.'});
    });
    interop.pending=(interop.pending||[]).filter(item=>item.sourceAppId!=='marco-iris').concat([...pendingById.values()]);
    state.companyInstanceId=snapshotCompanyInstance(snapshot);state.instanceId=state.companyInstanceId;state.lastRevision=incomingRevision;state.lastContentHash=incomingHash;state.lastSyncAt=nowIso();state.lastError='';
    config.companyInstanceId=state.companyInstanceId;config.lastDeviceId=String(snapshot.deviceId||'');config.lastSyncAt=state.lastSyncAt;config.lastRevision=state.lastRevision;config.lastContentHash=state.lastContentHash;config.lastError='';
    config.lastResult={processed:results.length,created:results.filter(x=>x.status==='created').length,createdReceipts:results.filter(x=>x.status==='created').length,createdExpenses:results.filter(x=>x.status==='expense_created').length,deleted:results.filter(x=>x.status==='cancelled').length,
      waiting:results.filter(x=>x.status==='waiting_receipt').length,waitingReceipts:results.filter(x=>x.status==='waiting_receipt').length,pendingExpenses:pendingById.size,unchanged:results.filter(x=>x.status==='unchanged').length,
      ignored:results.filter(x=>x.status==='ignored_before_cutoff').length,ignoredBeforeCutoff:results.filter(x=>x.status==='ignored_before_cutoff').length,sourceDeleted:results.filter(x=>x.status==='cancelled').length,errors:0};
    interop.audit.unshift({id:'interop-mit-'+Date.now(),at:state.lastSyncAt,sourceAppId:'marco-iris',companyInstanceId:state.companyInstanceId,deviceId:config.lastDeviceId,revision:state.lastRevision,mode:mode==='automatic'?'automatic':'manual',result:clone(config.lastResult)});interop.audit=interop.audit.slice(0,300);
    results.forEach(item=>{item.processedRevision=incomingRevision;item.processedAt=state.lastSyncAt;item.borionId=item.borionTransactionId||'';});
    return {results,pending:[...pendingById.values()],summary:config.lastResult,changed:true};
  }

  function replaceObjectContents(target,source){
    if(target===source) return target;
    Object.keys(target).forEach(key=>delete target[key]);
    Object.assign(target,source);
    return target;
  }
  function reconcileMitSnapshot(data,config,snapshot,options={}){
    const draftData=clone(data),draftConfig=clone(config);
    draftData.interconnections ||= {};
    draftData.interconnections.sources ||= {};
    draftData.interconnections.sources[config.sourceAppId||'marco-iris']=draftConfig;
    const result=reconcileMitSnapshotMutable(draftData,draftConfig,snapshot,options);
    replaceObjectContents(data,draftData);
    replaceObjectContents(config,draftConfig);
    const stored=data.interconnections?.sources?.[config.sourceAppId||'marco-iris'];
    if(stored&&stored!==config) replaceObjectContents(stored,draftConfig);
    return result;
  }

  function reconcileSnapshot(data, config, snapshot, options={}){
    if(config.sourceAppId === 'marco-iris') return reconcileMitSnapshot(data, config, snapshot, options);
    validateSnapshot(snapshot, config.sourceAppId);
    ensureSourceConfig(config);
    if(!config.mappingReady) throw new Error('Configure e salve a aba Vínculos antes de sincronizar esta integração.');

    const interop = ensureInterop(data);
    const state = importedState(data, config.sourceAppId);
    state.records ||= {};
    const ignored = ignoredState(data, config.sourceAppId);
    const results = [];
    const pending = [];
    const incomingIds = new Set(snapshot.records.map(item => item.aggregateId));
    const tombstones = new Set((snapshot.tombstones || []).map(item => item.aggregateId));

    const deletionPolicy = config.deletionPolicy === 'preserve' ? 'preserve' : 'delete';
    tombstones.forEach(aggregateId => {
      const marker = state.records[aggregateId];
      if(marker?.status === 'waiting') delete state.records[aggregateId];
      const nativeTx = findImportedTransaction(data, config.sourceAppId, aggregateId);

      if(!nativeTx){
        results.push({
          aggregateId, status:'source_deleted', borionTransactionId:marker?.txId || '',
          message:'Registro removido na origem antes da importação.'
        });
        return;
      }

      const editedSinceImport = !!nativeTx.integrationEditGuardHash && nativeTx.integrationEditGuardHash !== editableSnapshotHash(nativeTx);
      if(deletionPolicy === 'delete' && !editedSinceImport){
        try{
          reverseImportedTransaction(data, nativeTx);
          delete state.records[aggregateId];
          results.push({
            aggregateId, status:'deleted', borionTransactionId:nativeTx.id,
            message:'Excluído automaticamente: o registro foi removido na origem.'
          });
        }catch(error){
          results.push({
            aggregateId, status:'preserved', borionTransactionId:nativeTx.id,
            message:'Não foi possível excluir automaticamente (' + (error.message || error) + '). Lançamento preservado.'
          });
        }
        return;
      }

      results.push({
        aggregateId, status:'preserved', borionTransactionId:nativeTx.id,
        message:editedSinceImport
          ? 'O registro foi excluído na origem, mas este lançamento foi editado manualmente no Borion depois da importação — não foi excluído automaticamente.'
          : 'O registro foi excluído na origem, mas o lançamento nativo foi preservado no Borion (exclusão automática desativada para esta integração).'
      });
    });

    Object.keys(state.records).forEach(aggregateId => {
      if(state.records[aggregateId]?.status === 'waiting' && !incomingIds.has(aggregateId) && !tombstones.has(aggregateId)) delete state.records[aggregateId];
    });

    snapshot.records.forEach(record => {
      if(tombstones.has(record.aggregateId)) return;
      if(ignored[record.aggregateId]){
        results.push({aggregateId:record.aggregateId, entityId:record.entityId, status:'ignored', borionTransactionId:'', message:'Ignorado permanentemente pelo usuário.'});
        return;
      }

      const marker = state.records[record.aggregateId];
      const nativeTx = findImportedTransaction(data, config.sourceAppId, record.aggregateId);
      if(nativeTx || marker?.status === 'imported'){
        if(nativeTx){
          state.records[record.aggregateId] = Object.assign({}, marker || {}, {
            status:'imported', txId:nativeTx.id, entityId:record.entityId,
            fingerprint:marker?.fingerprint || nativeTx.integrationOriginalFingerprint || record.fingerprint || hash(record),
            importedAt:marker?.importedAt || nativeTx.integrationImportedAt || nowIso()
          });
        }
        results.push({
          aggregateId:record.aggregateId,
          entityId:record.entityId,
          status:'unchanged',
          borionTransactionId:nativeTx?.id || marker?.txId || '',
          message:'Já importado. Alterações locais do Borion foram preservadas.'
        });
        return;
      }

      if(record.active === false){
        state.records[record.aggregateId] = {status:'waiting', entityId:record.entityId, reason:'inactive', updatedAt:record.sourceUpdatedAt || ''};
        results.push({aggregateId:record.aggregateId, entityId:record.entityId, status:'cancelled', borionTransactionId:'', message:'Cancelado na origem antes da importação.'});
        return;
      }

      if(beforeImportCutoff(config, record.date)){
        state.records[record.aggregateId] = {status:'ignored', entityId:record.entityId, reason:'before_cutoff', updatedAt:record.sourceUpdatedAt || ''};
        results.push({aggregateId:record.aggregateId, entityId:record.entityId, status:'ignored_before_cutoff', borionTransactionId:'', message:'Fora do período configurado para importação automática.'});
        return;
      }

      const converted = mappedRecord(config, record);
      if(converted.skip){
        state.records[record.aggregateId] = {status:'waiting', entityId:record.entityId, reason:'mapping_ignore', updatedAt:record.sourceUpdatedAt || ''};
        results.push({aggregateId:record.aggregateId, entityId:record.entityId, status:'ignored_by_rule', borionTransactionId:'', message:converted.reason});
        return;
      }

      const shouldImport = converted._borionType === 'variavel' || converted._mappedSettled === true;
      if(!shouldImport){
        state.records[record.aggregateId] = {
          fingerprint:record.fingerprint || hash(record), status:'waiting', entityId:record.entityId,
          updatedAt:record.sourceUpdatedAt || ''
        };
        pending.push({
          sourceAppId:config.sourceAppId, aggregateId:record.aggregateId, entityId:record.entityId,
          description:record.description, status:record.status, direction:record.direction, amount:record.amount
        });
        results.push({aggregateId:record.aggregateId, entityId:record.entityId, status:'waiting', borionTransactionId:'', message:'Aguardando confirmação de recebimento na origem.'});
        return;
      }

      const tx = makeTransaction(data, config, converted);
      data.transacoes = Array.isArray(data.transacoes) ? data.transacoes : [];
      if(data.transacoes.some(item => item.id === tx.id)) tx.id = tx.id + '-' + hash(nowIso() + Math.random());
      data.transacoes.push(tx);
      if(!applyNew(data, tx)) throw new Error('Não foi possível aplicar o saldo do lançamento convertido.');
      state.records[record.aggregateId] = {
        fingerprint:tx.integrationOriginalFingerprint,
        status:'imported', txId:tx.id, entityId:record.entityId,
        importedAt:tx.integrationImportedAt, updatedAt:record.sourceUpdatedAt || ''
      };
      results.push({aggregateId:record.aggregateId, entityId:record.entityId, status:'created', borionTransactionId:tx.id, message:'Convertido e criado como lançamento nativo do Borion.'});
    });

    interop.pending = (interop.pending || []).filter(item => item.sourceAppId !== config.sourceAppId).concat(pending);
    state.instanceId = snapshot.instanceId;
    state.lastRevision = Number(snapshot.revision) || 0;
    state.lastContentHash = snapshot.contentHash || hash({records:snapshot.records, tombstones:snapshot.tombstones});
    state.lastSyncAt = nowIso();
    state.lastError = '';
    config.lastSyncAt = state.lastSyncAt;
    config.lastRevision = state.lastRevision;
    config.lastError = '';
    config.lastResult = {
      created:results.filter(x => x.status === 'created').length,
      deleted:results.filter(x => x.status === 'deleted').length,
      waiting:results.filter(x => x.status === 'waiting').length,
      unchanged:results.filter(x => x.status === 'unchanged' || x.status === 'preserved').length,
      ignored:results.filter(x => x.status === 'ignored' || x.status === 'ignored_by_rule').length,
      sourceDeleted:results.filter(x => x.status === 'source_deleted').length
    };
    interop.audit.unshift({
      id:'interop-' + Date.now(), at:state.lastSyncAt, sourceAppId:config.sourceAppId,
      revision:state.lastRevision, mode:'smart-native', result:clone(config.lastResult)
    });
    interop.audit = interop.audit.slice(0, 300);
    return {results, pending, summary:config.lastResult};
  }

  function setAsyncButtonState(button,busy,label){
    if(!button) return;
    if(busy){
      button.dataset ||= {};
      if(!button.dataset.idleText) button.dataset.idleText=button.textContent||'';
      button.disabled=true;button.setAttribute?.('aria-busy','true');
      if(label) button.textContent=label;
    }else{
      button.disabled=false;button.removeAttribute?.('aria-busy');
      if(button.dataset?.idleText) button.textContent=button.dataset.idleText;
    }
  }
  function markMitFormDirty(){ mitFormDirty=true; return true; }

  async function inspectSource(sourceAppId, {silent=false,button=null}={}){
    const row=findSourceConfig(sourceAppId);
    if(!row) throw new Error('Esta integração ainda não foi configurada.');
    setAsyncButtonState(button,true,'Atualizando…');
    try{
      const snapshot=await readSnapshot(row);
      validateSnapshot(snapshot,sourceAppId);
      row.config.discovered=discoverSnapshot(snapshot,row.config.discovered);
      row.config.lastInspectedAt=nowIso();
      row.config.lastSeenRevision=Number(snapshot.revision)||0;
      row.config.lastSeenContentHash=snapshot.contentHash||hash({records:snapshot.records,tombstones:snapshot.tombstones});
      saveProfileData(row.profile.id,row.data);
      uiSourceAppId=sourceAppId;uiTab='links';
      const preserveOpenMitDraft=sourceAppId==='marco-iris'&&mitFormDirty;
      if(typeof renderView==='function'&&!preserveOpenMitDraft) renderView();
      if(!silent&&typeof toast==='function'){
        const message=sourceAppId==='marco-iris'
          ?(preserveOpenMitDraft?'Dados da origem atualizados. Suas alterações ainda não salvas foram mantidas na tela.':'Dados do Marco Iris atualizados sem importar ou alterar saldos.')
          :`${sourceName(sourceAppId)}: campos da origem lidos. Configure os Vínculos.`;
        toast(message);
      }
      return snapshot;
    }finally{ setAsyncButtonState(button,false); }
  }

  async function syncSource(sourceAppId, {silent=false,button=null}={}){
    const row=findSourceConfig(sourceAppId);
    if(!row) throw new Error('Esta integração ainda não foi configurada.');
    if(sourceAppId==='marco-iris'&&row.config.reconnectRequired){
      const error=new Error('Existe uma nova instalação aguardando confirmação. Abra Configurações > Integrações > Marco Iris Tecnologia > Conexão e confirme a troca.');
      error.code='INSTANCE_RECONNECT_REQUIRED';
      if(!silent) await confirmInstanceReconnect(sourceAppId);
      throw error;
    }
    if(!row.config.mappingReady) throw new Error(sourceAppId==='marco-iris'?'Abra “Configurar receitas e revisar despesas”, escolha as categorias e os destinos financeiros e clique em “Salvar opções”.':'Abra a aba Vínculos, confira os mapeamentos e clique em “Salvar opções”.');
    if(sourceAppId==='marco-iris'&&!silent&&mitFormDirty){
      const error=new Error('Existem alterações não salvas. Clique em “Salvar opções” antes de sincronizar.');
      if(typeof alert==='function') alert(error.message);
      throw error;
    }
    if(syncing) throw new Error('Outra integração já está sincronizando.');
    syncing=true;syncingSourceAppId=sourceAppId;setAsyncButtonState(button,true,'Sincronizando…');
    try{
      const snapshot=await readSnapshot(row);
      validateSnapshot(snapshot,sourceAppId);
      /* O Drive pode demorar. Depois de cada espera buscamos novamente o perfil vivo.
         O primeiro rascunho serve para o ACK; o commit só acontece após o ACK ser
         confirmado e é recalculado sobre o estado mais recente, sem nenhum await entre
         a cópia final e a gravação. Assim não existe sobrescrita por cópia antiga. */
      const liveRow=findSourceConfig(sourceAppId)||row;
      if(!liveRow.config.mappingReady)throw new Error('As opções desta integração precisam ser salvas novamente antes de sincronizar.');
      const draftData=clone(liveRow.data),draftInterop=ensureInterop(draftData);
      draftInterop.sources ||= {};
      const draftConfig=ensureSourceConfig(clone(liveRow.config));
      draftConfig.discovered=discoverSnapshot(snapshot,draftConfig.discovered);
      draftInterop.sources[sourceAppId]=draftConfig;
      let result=reconcileSnapshot(draftData,draftConfig,snapshot,{mode:silent?'automatic':'manual'});
      const companyInstanceId=snapshotCompanyInstance(snapshot);
      const ack={
        schema:'borion.interop.ack',schemaVersion:2,bridgeVersion:SPEC.bridgeVersion,
        importMode:'smart-native',sourceAppId,companyInstanceId,instanceId:companyInstanceId,deviceId:snapshot.deviceId||'',
        sourceRevision:Number(snapshot.revision)||0,targetProfileId:liveRow.profile.id,targetProfileName:liveRow.profile.name,
        processedAt:nowIso(),summary:result.summary,records:result.results.map(item=>Object.assign({},item,{result:item.result||item.status,processedRevision:Number(snapshot.revision)||0,processedAt:item.processedAt||nowIso(),borionId:item.borionId||item.borionTransactionId||''}))
      };
      if(liveRow.config.transport==='drive') await writeDriveAck(liveRow,ack);
      else await writeLocalAck(liveRow,ack);

      const commitRow=findSourceConfig(sourceAppId)||liveRow;
      const commitData=clone(commitRow.data),commitInterop=ensureInterop(commitData);
      commitInterop.sources ||= {};
      const commitConfig=ensureSourceConfig(clone(commitRow.config));
      commitConfig.discovered=discoverSnapshot(snapshot,commitConfig.discovered);
      commitInterop.sources[sourceAppId]=commitConfig;
      result=reconcileSnapshot(commitData,commitConfig,snapshot,{mode:silent?'automatic':'manual'});
      if(result.changed!==false){
        replaceObjectContents(commitRow.data,commitData);
        saveProfileData(commitRow.profile.id,commitRow.data);
        if(S.currentProfile&&String(S.currentProfile.id)===String(commitRow.profile.id))saveCurrentData();
      }
      if(result.changed!==false&&S.currentProfile&&String(S.currentProfile.id)===String(commitRow.profile.id)){
        const editingIntegrationSettings=silent&&S.view==='settings'&&S.settingsTab==='integrations';
        if(typeof renderView==='function'&&!editingIntegrationSettings) renderView();
      }
      if(!silent&&typeof toast==='function'){
        const summary=result.summary||{};
        const expenseCreatedText=summary.createdExpenses?`, ${Number(summary.createdExpenses)} despesa(s) nova(s)`:'';
        toast(`${sourceName(sourceAppId)}: ${Number(summary.created||0)} receita(s) nova(s)${expenseCreatedText}, ${Number(summary.unchanged||0)} já processada(s), ${Number((summary.pendingExpenses??summary.waiting)||0)} despesa(s) em revisão.`);
      }
      return result;
    }catch(error){
      if(error?.code==='INSTANCE_CONFLICT'){
        try{
          const rejectedSnapshot=await readSnapshot(row),companyInstanceId=snapshotCompanyInstance(rejectedSnapshot);
          const rejected={schema:'borion.interop.ack',schemaVersion:2,bridgeVersion:SPEC.bridgeVersion,sourceAppId,companyInstanceId,instanceId:companyInstanceId,sourceRevision:Number(rejectedSnapshot.revision)||0,targetProfileId:row.profile.id,processedAt:nowIso(),summary:{errors:(rejectedSnapshot.records||[]).length},records:(rejectedSnapshot.records||[]).map(record=>({sourceRecordId:sourceRecordKey(record),aggregateId:record.aggregateId,entityId:record.entityId,result:'rejected_instance',status:'rejected_instance',processedRevision:Number(rejectedSnapshot.revision)||0,processedAt:nowIso(),borionId:'',message:error.message}))};
          if(row.config.transport==='drive')await writeDriveAck(row,rejected);else await writeLocalAck(row,rejected);
        }catch(_ackError){}
      }
      const current=findSourceConfig(sourceAppId)||row;
      current.config.lastError=error.message||String(error);
      current.config.lastAttemptAt=nowIso();
      if(error?.code==='INSTANCE_CONFLICT'){
        current.config.reconnectRequired=true;
        current.config.previousCompanyInstanceId=String(error.expectedCompanyInstanceId||'');
        current.config.pendingCompanyInstanceId=String(error.receivedCompanyInstanceId||'');
        current.config.reconnectDetectedAt=nowIso();
      }
      saveProfileData(current.profile.id,current.data);
      if(!silent){
        if(error?.code==='INSTANCE_CONFLICT') await confirmInstanceReconnect(sourceAppId);
        else if(typeof alert==='function') alert(current.config.lastError);
      }
      throw error;
    }finally{
      syncing=false;syncingSourceAppId='';setAsyncButtonState(button,false);
    }
  }

  async function configure(sourceAppId, transport, profileId, accountId){
    if(!SOURCES[sourceAppId]) throw new Error('Aplicativo de origem desconhecido.');
    const data = profileData(profileId);
    const interop = ensureInterop(data);
    if(!accountByIdIn(data, accountId) && accountId !== CARTEIRA_CONTA_ID) throw new Error('Escolha uma conta válida do perfil de destino.');
    let folderId = '';
    if(transport === 'local'){
      if(!window.showDirectoryPicker) throw new Error('Este navegador não permite escolher uma pasta local. Use Chrome ou Edge.');
      const handle = await window.showDirectoryPicker({mode:'readwrite'});
      let integrationHandle = handle;
      if(handle.name !== SPEC.folderName){
        try{ integrationHandle = await handle.getDirectoryHandle(SPEC.folderName); }
        catch(_){ throw new Error('Selecione a pasta Borion_Integracoes criada pelo aplicativo de origem.'); }
      }
      try{ await integrationHandle.getFileHandle(SOURCES[sourceAppId].snapshotFile); }
      catch(_){ throw new Error(`O arquivo ${SOURCES[sourceAppId].snapshotFile} não existe nessa pasta. Salve primeiro no aplicativo de origem.`); }
      await putHandle(sourceAppId, profileId, integrationHandle);
    }else if(transport === 'drive'){
      if(!(window.GoogleDriveProvider && GoogleDriveProvider.isConnected())) throw new Error('Conecte primeiro o Borion ao Google Drive.');
      await GoogleDriveAuth.ensureFreshToken();
      const selected = await openDriveFolderPicker();
      folderId = selected.id;
      let file = await GoogleDriveFS.findChild(folderId, SOURCES[sourceAppId].snapshotFile, 'application/json');
      if(!file){
        // A pessoa pode ter escolhido a pasta principal do aplicativo de origem em vez
        // da subpasta Borion_Integracoes que fica dentro dela — desce um nível antes de
        // desistir, igual já acontecia na conexão por pasta local (V6.44.5).
        const subfolder = await GoogleDriveFS.findChild(folderId, SPEC.folderName, 'application/vnd.google-apps.folder');
        if(subfolder){
          const nestedFile = await GoogleDriveFS.findChild(subfolder.id, SOURCES[sourceAppId].snapshotFile, 'application/json');
          if(nestedFile){ folderId = subfolder.id; file = nestedFile; }
        }
      }
      if(!file) throw new Error(`A pasta escolhida não contém ${SOURCES[sourceAppId].snapshotFile}. Selecione a pasta “${SPEC.folderName}” criada pelo ${sourceName(sourceAppId)} (ou a pasta que contém essa subpasta).`);
    }else throw new Error('Meio de sincronização inválido.');

    // Uma origem só pode apontar para um perfil por vez. Ao trocar o destino,
    // remove a configuração antiga sem tocar nos lançamentos que já viraram nativos.
    (S.profiles || []).forEach(profile => {
      if(String(profile.id) === String(profileId)) return;
      const otherData = profileData(profile.id);
      const otherInterop = ensureInterop(otherData);
      if(otherInterop.sources[sourceAppId]){
        delete otherInterop.sources[sourceAppId];
        saveProfileData(profile.id, otherData);
      }
    });
    const previous = interop.sources[sourceAppId] || {};
    interop.sources[sourceAppId] = ensureSourceConfig(Object.assign({}, previous, {
      sourceAppId, enabled:true, transport, folderId, accountId,
      targetProfileId:profileId, configuredAt:previous.configuredAt || nowIso(),
      reconfiguredAt:previous.configuredAt ? nowIso() : '',
      lastSyncAt:previous.lastSyncAt || '', lastError:'',
      mappingReady:previous.mappingReady === true,
      importMode:'smart-native'
    }));
    saveProfileData(profileId, data);
    uiSourceAppId = sourceAppId;
    uiTab = 'links';
    const inspectedSnapshot=await inspectSource(sourceAppId, {silent:true});
    const connectedRow=findSourceConfig(sourceAppId);
    if(sourceAppId==='marco-iris'&&connectedRow){
      const incoming=snapshotCompanyInstance(inspectedSnapshot);
      const state=importedState(connectedRow.data,sourceAppId);
      const bound=String(connectedRow.config.companyInstanceId||state.companyInstanceId||state.instanceId||'').trim();
      if(bound&&incoming&&incoming!==bound){
        connectedRow.config.reconnectRequired=true;
        connectedRow.config.previousCompanyInstanceId=bound;
        connectedRow.config.pendingCompanyInstanceId=incoming;
        connectedRow.config.reconnectDetectedAt=nowIso();
        connectedRow.config.lastError='A pasta selecionada pertence a uma nova instalação do Marco Iris Tecnologia. Confirme a troca antes de sincronizar.';
        saveProfileData(connectedRow.profile.id,connectedRow.data);
        uiTab='connection';
        if(typeof renderView==='function') renderView();
        if(typeof toast==='function') toast('Nova instalação encontrada. Confirme a reconexão na aba Conexão.');
        return;
      }
    }
    if(typeof toast === 'function') toast(`${sourceName(sourceAppId)} conectado. Agora confira e salve os Vínculos.`);
  }

  function accountOptions(profileId){
    const data = profileData(profileId);
    return (data.contas || []).filter(account => account && !account.archivedAt && account.active !== false).map(account => ({id:account.id, name:account.nome || 'Conta'}));
  }
  function setupDialog(sourceAppId, transport){
    const source = SOURCES[sourceAppId];
    const profiles = S.profiles || [];
    if(!profiles.length){ alert('Crie um perfil no Borion antes de configurar a integração.'); return; }
    const initialProfile = S.currentProfile?.id || profiles[0].id;
    const existing = findSourceConfig(sourceAppId);
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box"><div class="modal-head"><h2>Conectar ${escHtml(source.name)}</h2><button data-close>&times;</button></div><p class="modal-sub">Escolha o perfil que receberá os lançamentos convertidos. A conta abaixo será o destino padrão; depois você poderá criar vínculos diferentes por forma de pagamento.</p><label class="field"><span>Perfil de destino</span><select id="interop_profile">${profiles.map(p => `<option value="${escHtml(p.id)}" ${String(p.id) === String(existing?.profile.id || initialProfile) ? 'selected' : ''}>${escHtml(p.name)}</option>`).join('')}</select></label><label class="field"><span>Conta padrão</span><select id="interop_account"></select><small>Você poderá trocar a conta para cada forma de pagamento na aba Vínculos.</small></label><div class="form-actions"><button class="btn-outline" data-close>Cancelar</button><button class="btn btn-primary" id="interop_connect">Conectar ${transport === 'drive' ? 'Google Drive' : 'pasta local'}</button></div></div>`;
    const root = document.getElementById('modal-root');
    root.replaceChildren(overlay);
    if(typeof attachModalGuard==='function') attachModalGuard(overlay);
    const psel = overlay.querySelector('#interop_profile');
    const asel = overlay.querySelector('#interop_account');
    const refresh = () => {
      const options = accountOptions(psel.value);
      asel.innerHTML = options.map(a => `<option value="${escHtml(a.id)}" ${String(a.id) === String(existing?.config.accountId || '') ? 'selected' : ''}>${escHtml(a.name)}</option>`).join('');
    };
    refresh();
    psel.onchange = refresh;
    overlay.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => { closeModal(); });
    overlay.querySelector('#interop_connect').onclick = async () => {
      const btn = overlay.querySelector('#interop_connect');
      btn.disabled = true;
      btn.textContent = 'Conectando…';
      try{ await configure(sourceAppId, transport, psel.value, asel.value); closeModal(); }
      catch(error){ alert(error.message || String(error)); btn.disabled = false; btn.textContent = 'Tentar novamente'; }
    };
  }

  async function confirmInstanceReconnect(sourceAppId='marco-iris'){
    const row=findSourceConfig(sourceAppId);
    if(!row) throw new Error('Esta integração ainda não foi configurada.');
    if(sourceAppId!=='marco-iris') throw new Error('Esta confirmação só se aplica ao Marco Iris Tecnologia.');
    const snapshot=await readSnapshot(row);
    validateSnapshot(snapshot,sourceAppId);
    const incoming=snapshotCompanyInstance(snapshot);
    const state=importedState(row.data,sourceAppId);
    const previous=String(row.config.companyInstanceId||state.companyInstanceId||state.instanceId||'').trim();
    if(!incoming) throw new Error('A nova instalação não informou um identificador válido.');
    if(previous===incoming){
      row.config.reconnectRequired=false;row.config.pendingCompanyInstanceId='';row.config.previousCompanyInstanceId='';row.config.reconnectDetectedAt='';row.config.lastError='';
      saveProfileData(row.profile.id,row.data);
      if(typeof renderView==='function') renderView();
      if(typeof toast==='function') toast('Esta instalação já está vinculada ao Borion.');
      return true;
    }
    const perform=()=>{
      const live=findSourceConfig(sourceAppId)||row;
      applyConfirmedInstanceRebind(live.data,live.config,snapshot);
      saveProfileData(live.profile.id,live.data);
      if(S.currentProfile&&String(S.currentProfile.id)===String(live.profile.id)) saveCurrentData();
      forceImmediateSync();
      uiSourceAppId=sourceAppId;uiTab='connection';
      if(typeof renderView==='function') renderView();
      if(typeof toast==='function') toast('Nova instalação vinculada. Revise a data de corte e clique em Sincronizar agora.');
    };
    const text='O Borion confirmou que a pasta escolhida pertence a uma instalação nova do Marco Iris Tecnologia. Nenhum dado foi importado. Ao continuar, os lançamentos já existentes no Borion serão preservados, mas filas e vínculos técnicos da instalação antiga serão encerrados. A data de corte e as regras financeiras atuais serão mantidas.';
    if(typeof openConfirmModal==='function'){
      openConfirmModal({title:'Confirmar nova instalação',text,confirmLabel:'Vincular nova instalação',cancelLabel:'Cancelar',variant:'gold',onConfirm:perform});
    }else if(typeof confirm!=='function'||confirm(text)) perform();
    return true;
  }

  function disconnect(sourceAppId){
    const row = findSourceConfig(sourceAppId);
    if(!row) return;
    const confirmText = `Desconectar ${sourceName(sourceAppId)}? Os lançamentos já importados continuarão normalmente no Borion.`;
    const doDisconnect = ()=>{
      delete ensureInterop(row.data).sources[sourceAppId];
      saveProfileData(row.profile.id, row.data);
      if(typeof renderView === 'function') renderView();
    };
    if(typeof openConfirmModal==='function'){
      openConfirmModal({title:'Desconectar integração', text:confirmText, confirmLabel:'Desconectar', cancelLabel:'Cancelar', variant:'danger', onConfirm:doDisconnect});
    } else if(confirm(confirmText)){
      doDisconnect();
    }
  }

  function setSettingsSource(sourceAppId){
    if(!SOURCES[sourceAppId]) return;
    uiSourceAppId = sourceAppId;
    uiTab = 'connection';
    if(typeof renderView === 'function') renderView();
  }
  function setSettingsTab(tab){
    uiTab = tab === 'links' ? 'links' : 'connection';
    if(typeof renderView === 'function') renderView();
  }
  function setDeletionPolicy(sourceAppId, policy){
    const row = findSourceConfig(sourceAppId);
    if(!row) return;
    row.config.deletionPolicy = policy === 'preserve' ? 'preserve' : 'delete';
    saveProfileData(row.profile.id, row.data);
    if(typeof toast === 'function'){
      toast(row.config.deletionPolicy === 'delete'
        ? 'Exclusão automática ativada: lançamentos removidos na origem serão excluídos aqui (exceto os que você já editou).'
        : 'Exclusão automática desativada: lançamentos removidos na origem continuarão preservados aqui.');
    }
    if(typeof renderView === 'function') renderView();
  }
  // V6.44.3 — corte de importação (pedido do usuário): permite dizer "só importe
  // a partir de tal data/agora", pra testes e histórico antigo do aplicativo de
  // origem não virarem lançamento no Borion sozinhos. Nada do que já foi
  // importado antes é afetado — só passa a valer para os próximos lançamentos.
  function confirmCutoffChange(message){
    return typeof confirm!=='function' || confirm(message);
  }
  // V6.45.4 — além do saveProfileData (grava local na hora), força uma sincronização
  // imediata com o Drive em vez de esperar o debounce normal de fila (1.2s). Um
  // ajuste crítico como a data de corte não deve ficar nem um instante exposto a uma
  // atualização remota concorrente sobrescrever o que acabou de ser salvo.
  function forceImmediateSync(reason='interop_critical_setting'){
    return Promise.resolve().then(async()=>{
      try{
        if(!(window.GoogleDriveProvider&&GoogleDriveProvider.isConnected()))return {localOnly:true};
        GoogleDriveProvider.queueSave();
        const result=typeof GoogleDriveProvider.forceSyncNow==='function'
          ?await GoogleDriveProvider.forceSyncNow({reason})
          :await GoogleDriveProvider.syncNow({source:reason});
        return {synced:true,result};
      }catch(error){
        console.warn('[BORION_INTEROP][IMMEDIATE_SYNC_PENDING]',error);
        /* A pendência já ficou gravada localmente pela queueSave. Não rejeitar aqui
           evita tratar uma falha temporária de rede como perda da exclusão. */
        return {synced:false,pending:true,error:String(error?.message||error)};
      }
    });
  }
  function persistCriticalChange(reason='interop_critical_change'){return forceImmediateSync(reason);}
  function setImportCutoff(sourceAppId, dateValue){
    const row = findSourceConfig(sourceAppId);
    if(!row) return false;
    const trimmed = String(dateValue || '').trim();
    if(!trimmed){ return clearImportCutoff(sourceAppId); }
    const parsed = new Date(trimmed.length <= 10 ? trimmed + 'T00:00:00' : trimmed);
    if(isNaN(parsed.getTime())){ if(typeof alert === 'function') alert('Data inválida.'); return false; }
    const displayDate=parsed.toLocaleDateString('pt-BR');
    if(!confirmCutoffChange('Confirmar o corte de importação? Somente registros a partir de '+displayDate+' serão considerados.')) return false;
    row.config.importCutoffAt = parsed.toISOString();
    saveProfileData(row.profile.id, row.data);
    forceImmediateSync();
    if(typeof toast === 'function') toast('A partir de agora, só entram sozinhos lançamentos de ' + sourceName(sourceAppId) + ' a partir de ' + dateText(row.config.importCutoffAt) + '. O que já foi importado antes continua como está.');
    if(typeof renderView === 'function') renderView();
    return true;
  }
  function setImportCutoffNow(sourceAppId){
    const row = findSourceConfig(sourceAppId);
    if(!row) return false;
    if(!confirmCutoffChange('Confirmar o corte a partir de agora? Registros anteriores não serão importados automaticamente.')) return false;
    row.config.importCutoffAt = nowIso();
    saveProfileData(row.profile.id, row.data);
    forceImmediateSync();
    if(typeof toast === 'function') toast('Definido: a partir de agora, só entram sozinhos lançamentos novos de ' + sourceName(sourceAppId) + '. Testes e histórico anteriores a agora não serão importados automaticamente.');
    if(typeof renderView === 'function') renderView();
    return true;
  }
  function clearImportCutoff(sourceAppId){
    const row = findSourceConfig(sourceAppId);
    if(!row) return false;
    if(!confirmCutoffChange('Remover o corte e permitir que todo o histórico volte a ser considerado?')) return false;
    row.config.importCutoffAt = '';
    saveProfileData(row.profile.id, row.data);
    forceImmediateSync();
    if(typeof toast === 'function') toast('Corte removido: todo o histórico de ' + sourceName(sourceAppId) + ' volta a valer para importação automática.');
    if(typeof renderView === 'function') renderView();
    return true;
  }

  // V6.45.4 — modo de aprovação de importação (item pedido junto com a data de
  // corte): 'auto' mantém o comportamento de sempre (sincronização silenciosa
  // importa sozinha o que passar no corte); 'ask' faz a sincronização automática
  // nunca importar sozinha — ela só avisa que há lançamentos novos disponíveis e
  // aguarda confirmação explícita (ver checkAskModeSource/syncAll). É por perfil,
  // não por integração: vale para todas as origens conectadas àquele perfil.
  function setImportApprovalMode(mode, {silent=false}={}){
    const normalized = mode === 'ask' ? 'ask' : 'auto';
    if(!S.currentProfile || !S.data) return false;
    const interop = ensureInterop(S.data);
    interop.importApprovalMode = normalized;
    saveProfileData(S.currentProfile.id, S.data);
    forceImmediateSync();
    if(!silent && typeof toast === 'function'){
      toast(normalized==='ask'
        ? 'A partir de agora, o Borion sempre pergunta antes de importar novos lançamentos automaticamente.'
        : 'A partir de agora, novos lançamentos que passarem no corte são importados automaticamente.');
    }
    if(typeof renderView === 'function') renderView();
    return true;
  }
  // V6.45.4 — na primeira vez que o perfil tem alguma integração configurada e
  // ainda não decidiu entre "automático" e "perguntar sempre", pergunta uma única
  // vez ao abrir o app (ver postLoginSequence). Depois disso, a escolha fica salva
  // e só muda se a pessoa mudar explicitamente na tela de Integrações.
  function maybePromptImportMode(){
    if(!S.currentProfile || !S.data) return;
    const interop = ensureInterop(S.data);
    if(interop.importApprovalMode) return;
    const hasConfiguredSource = Object.values(interop.sources||{}).some(cfg => cfg && cfg.mappingReady);
    if(!hasConfiguredSource) return;
    if(typeof openChoiceModal !== 'function') return;
    openChoiceModal({
      title:'Importação automática de lançamentos',
      sub:'Este perfil tem uma integração conectada. Quando um lançamento novo estiver pronto para entrar no Borion, o que você prefere?',
      choices:[
        {label:'Importar automaticamente', desc:'Mantém o comportamento de sempre: assim que um lançamento passa no corte configurado, ele entra sozinho.', onClick:()=>setImportApprovalMode('auto')},
        {label:'Perguntar sempre antes de importar', desc:'Nada entra sozinho — o Borion avisa que há lançamentos novos e só importa se você confirmar. Você pode mudar isso depois em Integrações.', onClick:()=>setImportApprovalMode('ask')}
      ]
    });
  }

  function transactionTypeOptions(selected){
    const options = [
      ['receita','Receita'], ['variavel','Despesa variável'], ['ignore','Não importar']
    ];
    return options.map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }
  function statusOptions(selected){
    const options = [
      ['auto','Manter o status enviado pelo aplicativo'], ['paid','Marcar sempre como Pago/Recebido'],
      ['open','Marcar sempre como Em aberto'], ['ignore','Não importar lançamentos com este status']
    ];
    return options.map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }
  function paymentOptions(selected){
    return FORMAS_PAGAMENTO.map(value => `<option value="${escHtml(value)}" ${selected === value ? 'selected' : ''}>${escHtml(value)}</option>`).join('');
  }
  function financialTargetOptions(data, selected, fallbackForm){
    const selectedValue=String(selected||'__default__');
    const options=[
      ['__default__',fallbackForm==='Dinheiro'?'Automático (Carteira)':'Conta padrão da integração'],
      ['wallet','Carteira']
    ];
    (data.contas||[]).filter(account=>account&&!account.isCarteira&&!account.archivedAt&&account.active!==false).forEach(account=>options.push([`account:${account.id}`,`Conta · ${account.nome||'Sem nome'}`]));
    (data.reservas?.boxes||[]).filter(box=>box&&!box.archivedAt&&box.active!==false).forEach(box=>options.push([`reserve:${box.id}`,`Reserva · ${box.nome||'Sem nome'}${box.banco?' · '+box.banco:''}`]));
    return options.map(([value,label])=>`<option value="${escHtml(value)}" ${selectedValue===String(value)?'selected':''}>${escHtml(label)}</option>`).join('');
  }
  function paymentRuleTarget(rule,form){
    if(rule?.target) return rule.target;
    if(rule?.accountId==='__carteira__') return 'wallet';
    if(rule?.accountId&&rule.accountId!=='__default__') return `account:${rule.accountId}`;
    return '__default__';
  }
  function revenueOriginOptions(selected){
    const options = [
      ['propria','Receita própria'], ['rendimento','Rendimento'],
      ['reembolso','Reembolso recebido'], ['repasse','Repasse de terceiros']
    ];
    return options.map(([value,label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
  }
  function categoryDatalist(data, direction){
    const bucket = direction === 'income' ? 'receita' : 'variavel';
    return (data.categorias?.[bucket] || []).map(value => `<option value="${escHtml(value)}"></option>`).join('');
  }

  const MAPPING_HELP = Object.freeze({
    fields:{
      title:'Dados recebidos do aplicativo',
      summary:'Esta área é apenas uma conferência. Ela mostra uma amostra dos dados que chegaram da Amanda Estética ou do Marco Iris, já traduzidos para uma linguagem simples.',
      steps:['Confira se valor, cliente, data, descrição, forma de pagamento e status fazem sentido.','Nenhum dado é alterado nesta área. Ela serve somente para confirmar que a conexão está lendo o arquivo correto.','Caso os dados estejam antigos, use “Atualizar dados da origem” no final da página.'],
      example:['Valor: R$ 120,00','Cliente: Pedro Henrique Bardella','Status: Pago / Recebido']
    },
    types:{
      title:'Tipos de lançamento',
      summary:'Define em qual grupo do Borion Finance cada entrada ou saída será criada.',
      steps:['Na regra de Entrada, escolha Receita ou Não importar.','Na regra de Saída, escolha Despesa variável ou Não importar.','Quando aparecer um tipo específico, como “Lançamento financeiro”, você pode seguir a regra acima ou criar uma exceção somente para esse tipo.'],
      example:['Entrada / Receita → Receita','Saída / Despesa → Despesa variável','Lançamento financeiro → Seguir a regra de entrada/saída']
    },
    categories:{
      title:'Categorias e origem da receita',
      summary:'Converte a categoria enviada pelo outro aplicativo para a categoria que será usada dentro do Borion Finance.',
      steps:['Veja à esquerda a categoria recebida, por exemplo “Atendimento”.','Digite ou selecione a categoria correspondente do Borion.','Para entradas, escolha também se o dinheiro é Receita própria, Rendimento, Reembolso recebido ou Repasse de terceiros.'],
      example:['Atendimento → Categoria “Atendimento”','Origem da receita → Receita própria']
    },
    payments:{
      title:'Formas de pagamento e destino financeiro',
      summary:'Define como o pagamento será registrado e em qual conta, carteira ou reserva o valor entrará ou sairá.',
      steps:['Confira a forma recebida, como Pix ou Dinheiro.','Escolha a forma de pagamento equivalente no Borion.','Escolha o destino financeiro. “Conta padrão da integração” usa a conta escolhida na aba Conexão.','Dinheiro pode ser direcionado automaticamente para a Carteira; Pix pode ir para uma conta específica.'],
      example:['Dinheiro → Dinheiro → Carteira','Pix → Pix → Conta padrão da integração','Pix → Pix → Conta · Nubank']
    },
    status:{
      title:'Status',
      summary:'Define se o Borion deve respeitar o status recebido ou aplicar uma regra fixa.',
      steps:['“Manter o status enviado” preserva Pago/Recebido ou Em aberto conforme o aplicativo de origem.','“Marcar sempre como Pago/Recebido” força todos os itens desse status como concluídos.','“Marcar sempre como Em aberto” cria o lançamento sem baixa financeira.','“Não importar” ignora lançamentos que chegarem com esse status.'],
      example:['Pago / Recebido → Manter o status enviado pelo aplicativo','Pendente → Marcar sempre como Em aberto']
    },
    mitDestination:{
      title:'Onde o valor entra',
      summary:'Escolha se o valor será adicionado à Carteira, a uma conta bancária ou diretamente a uma reserva.',
      steps:['Carteira registra automaticamente como Dinheiro em espécie.','Conta exige a escolha de uma conta ativa do perfil de destino.','Reserva exige uma reserva ativa e usa a conta vinculada a ela.'],
      example:['Pix → Conta · Mercado Pago','Pix → Reserva · Casa','Dinheiro → Carteira']
    },
    mitReceipts:{
      title:'Receitas automáticas do Marco Iris',
      summary:'Cada pagamento confirmado no Marco Iris entra automaticamente no Borion Finance, sem esperar a ordem de serviço inteira ser quitada.',
      steps:['Escolha a categoria do Borion para cada forma recebida.','Dinheiro entra obrigatoriamente na Carteira.','Para Pix, Débito e Crédito, escolha a conta ou reserva de destino.','Salve a configuração. Os próximos recebimentos serão importados automaticamente e sem duplicidade.'],
      example:['Pix → Serviços Marco Iris → Conta · Nubank','Dinheiro → Serviços Marco Iris → Carteira']
    },
    mitExpenseRules:{
      title:'Despesas automáticas do Marco Iris',
      summary:'Escolha, uma única vez, para onde vai cada origem de pagamento das despesas. Depois de salvar, despesas via Carteira, Pix, Débito e Reserva entram sozinhas no Borion Finance a cada sincronização.',
      steps:['No Marco Iris, ao lançar uma despesa, escolha de onde o dinheiro saiu: Carteira, Pix, Débito, Crédito ou Reserva.','Aqui no Borion, escolha a categoria e o destino (conta ou reserva) de cada uma dessas origens.','Crédito não tem configuração aqui — despesas nesse meio sempre aparecem em “Aguardando Revisão”, porque a fatura do cartão depende do perfil estar aberto na tela.','Salve a configuração. As próximas despesas com essas origens são importadas automaticamente e sem duplicidade.'],
      example:['Pix → Compras Marco Iris → Conta · Nubank','Carteira → Compras Marco Iris → Carteira (Dinheiro)']
    },
    mitExpenses:{
      title:'Despesas aguardando revisão',
      summary:'Despesas no Crédito, e despesas de origens ainda não configuradas em “Como as despesas serão registradas”, ficam nesta lista até você revisar e confirmar.',
      steps:['Clique em Revisar na despesa desejada.','Confira nome, local da compra, categoria, valor e data.','Escolha se é despesa variável ou fixa, de onde será paga e o status.','Clique em Importar. Somente então a despesa será criada no Borion Finance.'],
      example:['Peça comprada no Crédito → Despesa variável → Categoria “Manutenção” → Cartão · Nubank']
    }
  });
  function interopSectionHeading(title, helpTopic, helpLabel=title){
    return `<div class="interop-section-title"><h5>${escHtml(title)}</h5><button type="button" class="interop-help-btn" onclick="BorionInterop.openMappingHelp('${escHtml(helpTopic)}')" aria-label="Ajuda sobre ${escHtml(helpLabel)}" title="Ver explicação e exemplos">?</button></div>`;
  }
  function openMappingHelp(topic){
    const content=MAPPING_HELP[topic];
    const root=document.getElementById('modal-root');
    if(!content||!root) return false;
    const close=()=>{ if(typeof closeModal==='function') closeModal(); else root.replaceChildren(); };
    const overlay=document.createElement('div');
    const titleId=`interop-help-${String(topic).replace(/[^a-z0-9_-]/gi,'')}`;
    overlay.className='modal-overlay interop-help-overlay';
    overlay.innerHTML=`<div class="modal-box interop-help-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}"><div class="modal-head"><div><span class="interop-help-kicker">Central de ajuda da integração</span><h2 id="${titleId}">${escHtml(content.title)}</h2></div><button type="button" data-close aria-label="Fechar">&times;</button></div><p class="modal-sub">${escHtml(content.summary)}</p><div class="interop-help-steps"><h3>Passo a passo</h3><ol>${content.steps.map(step=>`<li>${escHtml(step)}</li>`).join('')}</ol></div><div class="interop-help-example"><strong>Exemplo prático</strong>${content.example.map(line=>`<span>${escHtml(line)}</span>`).join('')}</div><div class="form-actions"><button type="button" class="btn btn-primary" data-close>Entendi</button></div></div>`;
    root.replaceChildren(overlay);
    if(typeof attachModalGuard==='function') attachModalGuard(overlay);
    overlay.querySelectorAll('[data-close]').forEach(button=>button.onclick=close);
    return true;
  }

  function renderConnectionTab(sourceAppId, row){
    const source = SOURCES[sourceAppId];
    if(!row){
      const intro=sourceAppId==='marco-iris'?'Conecte a pasta gerada pelo Marco Iris Tecnologia. Depois configure as categorias e os destinos das receitas; despesas sempre exigirão revisão.':'Conecte a pasta gerada pelo aplicativo. Nenhum lançamento será importado antes de você revisar e salvar os Vínculos.';
      return `<div class="interop-pane"><div class="interop-empty"><div class="interop-empty-icon">⇄</div><h4>${escHtml(source.name)} ainda não está conectado</h4><p>${intro}</p><div class="interop-actions"><button class="btn-outline btn-sm" onclick="BorionInterop.setupDialog('${sourceAppId}','local')">Conectar pasta local</button><button class="btn btn-primary btn-sm" onclick="BorionInterop.setupDialog('${sourceAppId}','drive')">Conectar Google Drive</button></div></div></div>`;
    }
    const c = row.config;
    if(sourceAppId==='marco-iris'){
      const r=c.lastResult||{},pending=(ensureInterop(row.data).pending||[]).filter(item=>item.sourceAppId==='marco-iris').length;
      const defaultAccount=accountByIdIn(row.data,c.accountId);
      let statusLabel='Ativa',statusClass='ok';
      if(syncing&&syncingSourceAppId==='marco-iris'){statusLabel='Sincronizando';statusClass='warn';}
      else if(c.reconnectRequired){statusLabel='Reconexão necessária';statusClass='warn';}
      else if(c.lastError){statusLabel='Erro na última sincronização';statusClass='danger';}
      else if(!c.mappingReady||!mitAccountActive(defaultAccount)){statusLabel='Configuração pendente';statusClass='warn';}
      const processed=Number(r.processed??(Number(r.created||0)+Number(r.unchanged||0)+Number(r.waiting||0)+Number(r.ignored||0)));
      const reconnectBox=c.reconnectRequired?`<div class="gold-box interop-sync-box"><b>Nova instalação encontrada</b><br><span>O Borion leu a nova pasta, mas bloqueou a importação para impedir que uma instalação diferente assumisse o vínculo sem autorização. Nenhum lançamento foi processado.</span><div class="interop-actions" style="margin-top:12px"><button class="btn btn-primary btn-sm" onclick="BorionInterop.confirmInstanceReconnect('marco-iris')">Confirmar nova instalação</button></div></div>`:'';
      const syncDisabled=!c.mappingReady||c.reconnectRequired;
      const syncTitle=c.reconnectRequired?'Confirme a nova instalação antes de sincronizar':'Configure as receitas primeiro';
      return `<div class="interop-pane"><div class="interop-status-grid mit-connection-status"><div><span>Perfil de destino</span><strong>${escHtml(row.profile.name)}</strong></div><div><span>Conta padrão</span><strong>${escHtml(accountName(row.data,c.accountId)||'Não definida')}</strong></div><div><span>Meio</span><strong>${c.transport==='drive'?'Google Drive':'Pasta local'}</strong></div><div><span>Última sincronização</span><strong>${escHtml(dateText(c.lastSyncAt))}</strong></div><div><span>Quantidade de registros processados</span><strong>${processed}</strong></div><div><span>Status da automação</span><strong><span class="pill ${statusClass}">${statusLabel}</span></strong></div></div>${reconnectBox}<div class="gold-box interop-sync-box"><b>Resumo da última sincronização</b><br><span>${Number(r.created||0)} receita(s) nova(s) · ${Number(r.createdExpenses||0)} despesa(s) nova(s) · ${Number(r.unchanged||0)} já processado(s) · ${Number(r.pendingExpenses??pending)} despesa(s) aguardando revisão · ${Number((r.ignoredBeforeCutoff??r.ignored)||0)} ignorado(s) pelo corte · ${Number(r.errors||0)} erro(s)</span>${c.lastError?`<br><b>Erro:</b> ${escHtml(c.lastError)}`:''}</div><div class="info-box"><b>Regra ativa:</b> cada pagamento Pago com Data de Pagamento entra individualmente; a OSV não precisa estar totalmente quitada. Despesas via Carteira, Pix, Débito e Reserva entram sozinhas quando configuradas em "Como as despesas serão registradas"; despesas no Crédito sempre pedem revisão rápida.</div><div class="interop-actions"><button class="btn btn-primary btn-sm" onclick="BorionInterop.syncSource('marco-iris',{button:this})" ${syncDisabled?`disabled title="${syncTitle}"`:''}>Sincronizar agora</button><button class="btn-outline btn-sm" onclick="BorionInterop.setupDialog('marco-iris','${c.transport}')">Reconfigurar conexão</button><button class="btn-outline btn-sm" onclick="BorionInterop.disconnect('marco-iris')">Desconectar</button></div>${!c.mappingReady?'<div class="interop-next-step"><b>Próximo passo:</b> abra a aba <b>Configurar receitas e revisar despesas</b>, escolha as categorias e os destinos financeiros e clique em <b>Salvar opções</b>.</div>':''}</div>`;
    }
    const r = c.lastResult || {};
    const mappingLabel = c.mappingReady ? '<span class="pill ok">Vínculos configurados</span>' : '<span class="pill warn">Vínculos pendentes</span>';
    const deletionOn = c.deletionPolicy !== 'preserve';
    return `<div class="interop-pane"><div class="interop-status-grid"><div><span>Perfil de destino</span><strong>${escHtml(row.profile.name)}</strong></div><div><span>Conta padrão</span><strong>${escHtml(accountName(row.data, c.accountId) || 'Carteira')}</strong></div><div><span>Meio</span><strong>${c.transport === 'drive' ? 'Google Drive' : 'Pasta local'}</strong></div><div><span>Mapeamento</span><strong>${mappingLabel}</strong></div></div><div class="gold-box interop-sync-box"><b>Última sincronização:</b> ${escHtml(dateText(c.lastSyncAt))}<br><span>${Number(r.created || 0)} novo(s) · ${Number(r.deleted || 0)} excluído(s) · ${Number(r.unchanged || 0)} já importado(s) · ${Number(r.waiting || 0)} aguardando · ${Number(r.ignored || 0)} ignorado(s)</span>${c.lastError ? `<br><b>Erro:</b> ${escHtml(c.lastError)}` : ''}</div><label class="interop-deletion-toggle"><input type="checkbox" ${deletionOn ? 'checked' : ''} onchange="BorionInterop.setDeletionPolicy('${sourceAppId}', this.checked ? 'delete' : 'preserve')"><span><b>Excluir aqui automaticamente</b> quando o lançamento for removido na origem<br><small>Lançamentos que você já editou manualmente no Borion (categoria, valor, conta...) nunca são excluídos automaticamente, mesmo com isto ligado.</small></span></label><div class="interop-actions"><button class="btn btn-primary btn-sm" onclick="BorionInterop.syncSource('${sourceAppId}')" ${c.mappingReady ? '' : 'disabled title="Configure os Vínculos primeiro"'}>Sincronizar agora</button><button class="btn-outline btn-sm" onclick="BorionInterop.inspectSource('${sourceAppId}')">Ler campos da origem</button><button class="btn-outline btn-sm" onclick="BorionInterop.setupDialog('${sourceAppId}','${c.transport}')">Reconfigurar conexão</button><button class="btn-outline btn-sm" onclick="BorionInterop.disconnect('${sourceAppId}')">Desconectar</button></div>${!c.mappingReady ? '<div class="interop-next-step"><b>Próximo passo:</b> abra a aba <b>Vínculos</b>, confira as conversões e salve. Só depois os lançamentos serão importados.</div>' : ''}</div>`;
  }

  function renderLinksTab(sourceAppId, row){
    if(!row){
      return `<div class="interop-pane"><div class="interop-empty"><h4>Conecte o aplicativo primeiro</h4><p>Os dados reais da origem precisam ser lidos antes que os vínculos possam ser configurados.</p><button class="btn btn-primary btn-sm" onclick="BorionInterop.setSettingsTab('connection')">Ir para Conexão</button></div></div>`;
    }
    const c=row.config,d=normalizeDiscovered(c.discovered),m=normalizeMappings(c.mappings);
    const hasFields=d.categories.length||d.paymentMethods.length||d.statuses.length||d.transactionKinds.length||d.directions.length||d.fields.length;
    if(!hasFields) return `<div class="interop-pane"><div class="interop-empty"><h4>Nenhum dado da origem foi lido</h4><p>Use o botão abaixo para analisar o arquivo atual sem importar lançamentos.</p><button class="btn btn-primary btn-sm" onclick="BorionInterop.inspectSource('${sourceAppId}')">Ler dados da origem</button></div></div>`;
    const sourceDisplay=item=>`<strong>${escHtml(friendlySourceValue(item.label||item.value,item.field))}</strong>`;
    const directionRows=(d.directions.length?d.directions:['income','expense']).map(direction=>{
      const target=m.directions[direction]||(direction==='income'?'receita':'variavel');
      return `<div class="interop-map-row"><div class="interop-source-value"><small>Movimento recebido</small><strong>${escHtml(friendlyDirection(direction))}</strong></div><div class="interop-arrow" aria-hidden="true">→</div><label><small>Como será salvo no Borion</small><select data-interop-direction="${direction}">${transactionTypeOptions(target)}</select></label></div>`;
    }).join('');
    const kindRows=d.transactionKinds.map(item=>{
      const mapId=`${item.direction}:${item.key}`,target=m.transactionKinds[mapId]||'';
      return `<div class="interop-map-row"><div class="interop-source-value"><small>${escHtml(sourceContextLabel(item.field||'recordType'))}</small>${sourceDisplay(item)}</div><div class="interop-arrow" aria-hidden="true">→</div><label><small>Regra para este tipo no Borion</small><select data-interop-kind="${escHtml(mapId)}"><option value="" ${!target?'selected':''}>Seguir a regra de entrada/saída definida acima</option>${transactionTypeOptions(target)}</select></label></div>`;
    }).join('');
    const categoryRows=d.categories.map(item=>{
      const target=m.categories?.[item.direction]?.[item.key]||item.label||item.value||'Outro';
      return `<div class="interop-map-row interop-map-row-category"><div class="interop-source-value"><small>Categoria recebida</small>${sourceDisplay(item)}</div><div class="interop-arrow" aria-hidden="true">→</div><label><small>Categoria no Borion</small><input type="text" list="interop-cat-${item.direction}" value="${escHtml(target)}" data-interop-category data-direction="${item.direction}" data-key="${escHtml(item.key)}" placeholder="Escolha ou digite uma categoria"></label>${item.direction==='income'?`<label><small>Origem da receita no Borion</small><select data-interop-revenue-origin data-key="${escHtml(item.key)}">${revenueOriginOptions(m.revenueOrigins[item.key]||inferRevenueOrigin(item.value))}</select></label>`:''}</div>`;
    }).join('');
    const paymentRows=d.paymentMethods.map(item=>{
      const mapId=`${item.direction}:${item.key}`,rule=m.paymentMethods[mapId]||m.paymentMethods[item.key]||{},form=FORMAS_PAGAMENTO.includes(rule.form)?rule.form:paymentForm(item.value),target=paymentRuleTarget(rule,form);
      return `<div class="interop-map-row interop-map-row-payment"><div class="interop-source-value"><small>${escHtml(sourceContextLabel(item.field||'paymentMethod',item.direction))}</small>${sourceDisplay(item)}</div><div class="interop-arrow" aria-hidden="true">→</div><label><small>Forma de pagamento no Borion</small><select data-interop-payment-form data-key="${escHtml(mapId)}">${paymentOptions(form)}</select></label><label><small>Conta, carteira ou reserva de destino</small><select data-interop-payment-target data-key="${escHtml(mapId)}">${financialTargetOptions(row.data,target,form)}</select></label></div>`;
    }).join('');
    const statusRows=d.statuses.map(item=>{
      const mapId=`${item.direction}:${item.key}`,target=m.statuses[mapId]||m.statuses[item.key]||'auto';
      return `<div class="interop-map-row"><div class="interop-source-value"><small>${escHtml(sourceContextLabel(item.field||'status',item.direction))}</small>${sourceDisplay(item)}</div><div class="interop-arrow" aria-hidden="true">→</div><label><small>Regra de status no Borion</small><select data-interop-status data-key="${escHtml(mapId)}">${statusOptions(target)}</select></label></div>`;
    }).join('');
    const fieldRows=d.fields.map(item=>`<div class="interop-field-preview"><div><small>Informação</small><strong>${escHtml(friendlyFieldName(item.sourceName))}</strong></div><div><small>Exemplo recebido</small><span>${escHtml(friendlySourceValue(item.sample,item.sourceName))}</span></div></div>`).join('');
    return `<div class="interop-pane interop-links-pane"><div class="interop-links-intro"><div><h4>Configuração da integração com ${escHtml(sourceName(sourceAppId))}</h4><p>Confira o que chega do aplicativo e escolha, à direita, como cada informação será registrada no Borion Finance. As regras são usadas na primeira importação de cada lançamento.</p></div><span class="pill ${c.mappingReady?'ok':'warn'}">${c.mappingReady?'Configurado':'Revisão necessária'}</span></div><div class="interop-map-legend"><div class="origin"><small>ORIGEM</small><b>${escHtml(sourceName(sourceAppId))}</b><span>Dados enviados pelo aplicativo, exibidos em linguagem simples.</span></div><div class="destination"><small>DESTINO</small><b>Borion Finance</b><span>Como o lançamento será salvo: tipo, categoria, status, forma e destino financeiro.</span></div></div>${importCutoffControlHTML(sourceAppId,c,row.data)}<datalist id="interop-cat-income">${categoryDatalist(row.data,'income')}</datalist><datalist id="interop-cat-expense">${categoryDatalist(row.data,'expense')}</datalist><section class="interop-map-section">${interopSectionHeading('Dados recebidos do aplicativo','fields')}<p>Somente leitura. Use esta amostra para confirmar que a conexão está trazendo as informações corretas.</p><div class="interop-field-grid">${fieldRows||'<div class="interop-map-empty">Nenhuma informação adicional identificada.</div>'}</div></section><section class="interop-map-section">${interopSectionHeading('Tipos de lançamento','types')}<p>Escolha se cada entrada ou saída será uma receita, uma despesa variável ou não será importada.</p>${directionRows}${kindRows}</section><section class="interop-map-section">${interopSectionHeading('Categorias e origem da receita','categories')}<p>Associe cada categoria recebida à categoria correspondente do Borion e defina a origem das receitas.</p>${categoryRows||'<div class="interop-map-empty">Nenhuma categoria encontrada.</div>'}</section><section class="interop-map-section">${interopSectionHeading('Formas de pagamento e destino financeiro','payments')}<p>Defina a forma usada no Borion e em qual conta, carteira ou reserva o valor será registrado.</p>${paymentRows||'<div class="interop-map-empty">Nenhuma forma de pagamento encontrada.</div>'}</section><section class="interop-map-section">${interopSectionHeading('Status','status')}<p>Escolha se o Borion deve manter o status recebido, forçar um status ou ignorar o lançamento.</p>${statusRows||'<div class="interop-map-empty">Nenhum status encontrado.</div>'}</section><div class="interop-save-bar"><button class="btn-outline btn-sm" onclick="BorionInterop.inspectSource('${sourceAppId}')">Atualizar dados da origem</button><button class="btn btn-primary" onclick="BorionInterop.saveMappings('${sourceAppId}')">Salvar opções</button><button class="btn-outline" onclick="BorionInterop.syncSource('${sourceAppId}')" ${c.mappingReady?'':'disabled title="Salve as opções antes de sincronizar"'}>Sincronizar agora</button></div></div>`;
  }

  function mitCategoryOptions(data,selected){
    const categories=Array.isArray(data.categorias?.receita)?data.categorias.receita:[];
    const missing=selected&&!categories.includes(selected)?`<option value="" selected disabled>Categoria removida — escolha outra</option>`:'';
    const placeholder=!selected?'<option value="" selected disabled>Escolha uma categoria</option>':'';
    return placeholder+missing+categories.map(category=>`<option value="${escHtml(category)}" ${selected===category?'selected':''}>${escHtml(category)}</option>`).join('');
  }
  function mitAccountOptions(data,selected){
    const accounts=(data.contas||[]).filter(account=>mitAccountActive(account)&&!mitWalletAccount(account));
    const missing=selected&&!accounts.some(account=>String(account.id)===String(selected))?'<option value="" selected disabled>Conta removida — escolha outra</option>':'';
    const placeholder=!selected?'<option value="" selected disabled>Escolha uma conta</option>':'';
    return placeholder+missing+accounts.map(account=>`<option value="${escHtml(account.id)}" ${String(account.id)===String(selected)?'selected':''}>${escHtml(account.nome||'Conta sem nome')}</option>`).join('');
  }
  function mitReserveOptions(data,selected){
    const reserves=(data.reservas?.boxes||[]).filter(reserve=>mitReserveActive(reserve)&&mitReserveLinkedAccount(data,reserve));
    const missing=selected&&!reserves.some(reserve=>String(reserve.id)===String(selected))?'<option value="" selected disabled>Reserva removida — escolha outra</option>':'';
    const placeholder=!selected?'<option value="" selected disabled>Escolha uma reserva</option>':'';
    return placeholder+missing+reserves.map(reserve=>`<option value="${escHtml(reserve.id)}" ${String(reserve.id)===String(selected)?'selected':''}>${escHtml((reserve.nome||'Reserva sem nome')+(reserve.banco?' — '+reserve.banco:''))}</option>`).join('');
  }
  function setMitDestination(button,key){
    const row=button?.closest?.(`[data-mit-rule="${key}"]`)||button?.closest?.('[data-mit-rule]');
    if(!row||button.disabled||button.getAttribute('aria-disabled')==='true') return false;
    const kind=button.dataset.value,hidden=row.querySelector('[data-mit-destination-kind]');
    if(row.dataset.mitFixedDestination&&kind!==row.dataset.mitFixedDestination) return false;
    row.querySelectorAll('[data-mit-destination-button]').forEach(item=>{const active=item===button;item.classList.toggle('active',active);item.setAttribute('aria-pressed',String(active));});
    if(hidden) hidden.value=kind;
    row.querySelectorAll('[data-mit-destination-panel]').forEach(panel=>panel.classList.toggle('hidden',panel.dataset.mitDestinationPanel!==kind));
    markMitFormDirty();
    return true;
  }
  function mitExpenseCategoryOptions(data){
    const categories=[...(data.categorias?.variavel||[]),...(data.categorias?.fixa||[])].filter((value,index,list)=>list.indexOf(value)===index);
    return categories.map(category=>`<option value="${escHtml(category)}"></option>`).join('');
  }
  function renderMitLinksTab(row){
    if(!row) return `<div class="interop-pane"><div class="interop-empty"><h4>Conecte o Marco Iris Tecnologia primeiro</h4><button class="btn btn-primary btn-sm" onclick="BorionInterop.setSettingsTab('connection')">Ir para Conexão</button></div></div>`;
    const rules=normalizeMitRevenueRules(row.config.mitRevenueRules,row.config);
    const expenseRules=normalizeMitExpenseRules(row.config.mitExpenseRules,row.config);
    const pending=(ensureInterop(row.data).pending||[]).filter(item=>item.sourceAppId==='marco-iris');
    const reservesEnabled=mitReservesEnabled(row.data);
    const validReserves=(row.data.reservas?.boxes||[]).filter(reserve=>mitReserveActive(reserve)&&mitReserveLinkedAccount(row.data,reserve));
    const revenueRows=MIT_REVENUE_METHODS.map(method=>{
      const rule=rules[method.key],fixedWallet=method.fixedDestination==='wallet',kind=fixedWallet?'wallet':(rule.destinationKind||'account');
      const reserveDisabled=!reservesEnabled||!validReserves.length;
      const catId=`mit-category-${method.key}`,accountId=`mit-account-${method.key}`,reserveId=`mit-reserve-${method.key}`;
      return `<tr class="mit-rule-table-row" data-mit-rule="${escHtml(method.key)}" ${fixedWallet?'data-mit-fixed-destination="wallet"':''}>
        <td class="mit-origin-cell"><strong>${escHtml(method.label)}</strong>${fixedWallet?'<small>Destino fixo: Carteira</small>':''}</td>
        <td class="mit-category-cell"><label class="sr-only" for="${catId}">Categoria de receita para ${escHtml(method.label)}</label><select id="${catId}" data-mit-category="${escHtml(method.key)}" aria-label="Categoria de receita para ${escHtml(method.label)}" onchange="BorionInterop.markMitFormDirty()">${mitCategoryOptions(row.data,rule.category)}</select></td>
        <td class="mit-destination-cell"><div class="segmented-toggle revenue-destination-toggle mit-destination-toggle" role="group" aria-label="Destino do valor de ${escHtml(method.label)}"><button type="button" class="seg-btn ${kind==='wallet'?'active':''}" data-mit-destination-button data-value="wallet" aria-pressed="${kind==='wallet'}" ${fixedWallet?'disabled aria-disabled="true"':''} onclick="BorionInterop.setMitDestination(this,'${escHtml(method.key)}')">Carteira</button><button type="button" class="seg-btn ${kind==='account'?'active':''}" data-mit-destination-button data-value="account" aria-pressed="${kind==='account'}" ${fixedWallet?'disabled aria-disabled="true"':''} onclick="BorionInterop.setMitDestination(this,'${escHtml(method.key)}')">Conta</button><button type="button" class="seg-btn ${kind==='reserve'?'active':''}" data-mit-destination-button data-value="reserve" aria-pressed="${kind==='reserve'}" aria-disabled="${fixedWallet||reserveDisabled}" ${(fixedWallet||reserveDisabled)?'disabled':''} title="${fixedWallet?'Dinheiro entra obrigatoriamente na Carteira':(!reservesEnabled?'Ative o módulo de Reservas':(!validReserves.length?'Crie uma reserva primeiro':''))}" onclick="BorionInterop.setMitDestination(this,'${escHtml(method.key)}')">Reserva</button></div><input type="hidden" data-mit-destination-kind="${escHtml(method.key)}" value="${escHtml(kind)}"><div class="mit-specific-destination"><div class="payment-source-panel ${kind==='account'?'':'hidden'}" data-mit-destination-panel="account"><label for="${accountId}"><small>Conta que receberá</small></label><select id="${accountId}" data-mit-account="${escHtml(method.key)}" aria-label="Conta que receberá ${escHtml(method.label)}" onchange="BorionInterop.markMitFormDirty()">${mitAccountOptions(row.data,rule.accountId)}</select></div><div class="payment-source-panel ${kind==='reserve'?'':'hidden'}" data-mit-destination-panel="reserve"><label for="${reserveId}"><small>Reserva que receberá</small></label><select id="${reserveId}" data-mit-reserve="${escHtml(method.key)}" aria-label="Reserva que receberá ${escHtml(method.label)}" onchange="BorionInterop.markMitFormDirty()">${mitReserveOptions(row.data,rule.reserveId)}</select></div><div class="payment-source-panel mit-wallet-panel ${kind==='wallet'?'':'hidden'}" data-mit-destination-panel="wallet"><strong>Carteira</strong><span>O valor será registrado automaticamente como Dinheiro.</span></div></div>${!fixedWallet&&!reservesEnabled&&kind==='reserve'?'<span class="mit-destination-warning">Reservas estão desativadas. A configuração antiga foi preservada, mas precisa ser corrigida antes de salvar.</span>':''}</td>
      </tr>`;
    }).join('');
    const expenseRows=MIT_EXPENSE_METHODS.filter(method=>method.fixedDestination!=='card').map(method=>{
      const rule=expenseRules[method.key],catId=`mit-expcategory-${method.key}`;
      let destinationCell;
      if(method.fixedDestination==='wallet'){
        destinationCell=`<strong>Carteira</strong><small>Sai sempre da Carteira (Dinheiro)</small>`;
      }else if(method.fixedDestination==='reserve'){
        const reserveDisabled=!reservesEnabled||!validReserves.length;
        destinationCell=reserveDisabled
          ? `<span class="mit-destination-warning">${!reservesEnabled?'Ative o módulo de Reservas primeiro.':'Crie uma reserva primeiro.'}</span>`
          : `<label class="sr-only" for="mit-expreserve-${method.key}">Reserva usada para despesas via ${escHtml(method.label)}</label><select id="mit-expreserve-${method.key}" data-mit-expense-reserve="${escHtml(method.key)}" onchange="BorionInterop.markMitFormDirty()">${mitReserveOptions(row.data,rule.reserveId)}</select>`;
      }else{
        destinationCell=`<label class="sr-only" for="mit-expaccount-${method.key}">Conta usada para despesas via ${escHtml(method.label)}</label><select id="mit-expaccount-${method.key}" data-mit-expense-account="${escHtml(method.key)}" onchange="BorionInterop.markMitFormDirty()">${mitAccountOptions(row.data,rule.accountId)}</select>`;
      }
      return `<tr class="mit-rule-table-row mit-expense-rule-row" data-mit-expense-rule="${escHtml(method.key)}">
        <td class="mit-origin-cell"><strong>${escHtml(method.label)}</strong></td>
        <td class="mit-category-cell"><label class="sr-only" for="${catId}">Categoria de despesa para ${escHtml(method.label)}</label><input id="${catId}" type="text" list="mit-exp-rule-categories" data-mit-expense-category="${escHtml(method.key)}" value="${escHtml(rule.category)}" oninput="BorionInterop.markMitFormDirty()"></td>
        <td class="mit-destination-cell">${destinationCell}</td>
      </tr>`;
    }).join('');
    const pendingRows=pending.length?pending.map(item=>`<div class="mit-pending-row"><div><strong>${escHtml(item.name||item.description)}</strong><small>${escHtml(item.localPurchase||'Sem local informado')}</small></div><span>${typeof brl==='function'?brl(Number(item.amount)||0):('R$ '+(Number(item.amount)||0).toFixed(2).replace('.',','))}</span><span>${escHtml(item.date||'')}</span><span>Marco Iris</span><span class="pill ${item.status==='Pago'?'ok':'warn'}">${escHtml(item.status||'Em aberto')}</span><button class="btn btn-primary btn-sm" onclick="BorionInterop.openMitExpenseImport('${escHtml(item.aggregateId)}')">Revisar</button></div>`).join(''):'<div class="interop-map-empty">Nenhuma despesa aguardando revisão.</div>';
    return `<div class="interop-pane mit-integration-pane"><div class="interop-links-intro"><div><h4>Receitas e despesas automáticas</h4><p>Cada pagamento Pago com Data de Pagamento é importado individualmente. A OSV não precisa estar totalmente quitada.</p></div><span class="pill ${row.config.mappingReady?'ok':'warn'}">${row.config.mappingReady?'Receitas configuradas':'Configuração necessária'}</span></div><div class="interop-map-legend"><div class="origin"><small>ORIGEM</small><b>Marco Iris Tecnologia</b><span>Forma recebida, parcelas, OSV, cliente e referência original.</span></div><div class="destination"><small>DESTINO</small><b>Borion Finance</b><span>Categoria e destino financeiro. A forma efetiva é calculada automaticamente.</span></div></div>${importCutoffControlHTML('marco-iris',row.config,row.data)}<section class="interop-map-section">${interopSectionHeading('Como as receitas serão registradas no Borion','mitReceipts','receitas automáticas do Marco Iris')}<p>Escolha a categoria e o destino financeiro de cada forma recebida. Pix, Débito e Crédito preservam sua natureza; Carteira é sempre registrada como Dinheiro.</p><div class="mit-rules-table-wrap"><table class="mit-rules-table"><thead><tr><th scope="col">Forma recebida do Marco Iris Tec</th><th scope="col">Categoria de receita no Borion</th><th scope="col">Destino do valor</th></tr></thead><tbody>${revenueRows}</tbody></table></div><div class="interop-save-bar"><button class="btn-outline btn-sm" onclick="BorionInterop.inspectSource('marco-iris',{button:this})">Atualizar dados da origem</button><button class="btn btn-primary" onclick="BorionInterop.saveMitSettings({button:this})">Salvar opções</button><button class="btn-outline" onclick="BorionInterop.syncSource('marco-iris',{button:this})" ${row.config.mappingReady?'':'disabled title="Salve as opções antes de sincronizar"'}>Sincronizar agora</button></div></section><section class="interop-map-section"><div class="mit-pending-head"><div>${interopSectionHeading('Como as despesas serão registradas no Borion','mitExpenseRules','despesas automáticas do Marco Iris')}<p>Escolha, na hora de lançar a despesa no Marco Iris, de onde o dinheiro saiu — Carteira, Pix, Débito ou Reserva entram sozinhas aqui em segundos, na categoria e destino abaixo. Despesas no <b>Crédito</b> sempre aparecem em "Aguardando Revisão", porque a fatura do cartão só pode ser calculada com o perfil aberto na tela.</p></div><span class="pill ${row.config.mitExpenseMappingReady?'ok':'warn'}">${row.config.mitExpenseMappingReady?'Configurado':'Ainda não configurado'}</span></div><datalist id="mit-exp-rule-categories">${mitExpenseCategoryOptions(row.data)}</datalist><div class="mit-rules-table-wrap"><table class="mit-rules-table"><thead><tr><th scope="col">De onde saiu no Marco Iris</th><th scope="col">Categoria de despesa no Borion</th><th scope="col">Destino</th></tr></thead><tbody>${expenseRows}</tbody></table></div><div class="interop-save-bar"><button class="btn btn-primary" onclick="BorionInterop.saveMitExpenseSettings({button:this})">Salvar opções de despesa</button></div></section><section class="interop-map-section"><div class="mit-pending-head"><div>${interopSectionHeading('Aguardando Revisão','mitExpenses','despesas aguardando revisão')}<p>Despesas no Crédito, ou despesas sem a configuração acima ainda salva, ficam aqui até você revisar.</p></div><span class="pill ${pending.length?'warn':'ok'}">${pending.length} pendente(s)</span></div><div class="mit-pending-labels"><span>Nome</span><span>Valor</span><span>Data</span><span>Origem</span><span>Status</span><span></span></div><div class="mit-pending-list">${pendingRows}</div></section></div>`;
  }
  async function saveMitSettings({button=null}={}){
    const row=findSourceConfig('marco-iris');
    if(!row) throw new Error('Integração com o Marco Iris não configurada.');
    setAsyncButtonState(button,true,'Salvando…');
    try{
      const draft=normalizeMitRevenueRules(row.config.mitRevenueRules,row.config);
      document.querySelectorAll('[data-mit-rule]').forEach(ruleRow=>{
        const key=ruleRow.dataset.mitRule,rule=draft[key],method=mitMethodDefinition(key);if(!rule)return;
        rule.category=String(ruleRow.querySelector('[data-mit-category]')?.value||'').trim();
        rule.destinationKind=method.fixedDestination==='wallet'?'wallet':String(ruleRow.querySelector('[data-mit-destination-kind]')?.value||'');
        if(rule.destinationKind==='wallet'){
          rule.accountId=CARTEIRA_CONTA_ID;rule.reserveId=null;rule.target='wallet';
        }else if(rule.destinationKind==='account'){
          rule.accountId=String(ruleRow.querySelector('[data-mit-account]')?.value||'')||null;rule.reserveId=null;rule.target=rule.accountId?`account:${rule.accountId}`:'__default__';
        }else if(rule.destinationKind==='reserve'){
          rule.reserveId=String(ruleRow.querySelector('[data-mit-reserve]')?.value||'')||null;rule.accountId=null;rule.target=rule.reserveId?`reserve:${rule.reserveId}`:'reserve:';
        }
      });
      const candidate=Object.assign({},row.config,{mitRevenueRules:draft});
      let validated;
      try{validated=validateMitRevenueRules(row.data,candidate,draft);}
      catch(error){
        const method=MIT_REVENUE_METHODS.find(item=>String(error.message||'').includes(item.label));
        const ruleRow=method?document.querySelector(`[data-mit-rule="${method.key}"]`):null;
        const selector=String(error.message||'').includes('categoria')?'[data-mit-category]':(String(error.message||'').includes('reserva')?'[data-mit-reserve]':'[data-mit-account]');
        ruleRow?.querySelector(selector)?.focus?.();
        if(typeof alert==='function') alert(error.message||String(error));
        return false;
      }
      row.config.mitRevenueRules=validated;row.config.mappingReady=true;row.config.mappingVersion=SPEC.mappingVersion;row.config.mappingSavedAt=nowIso();
      saveProfileData(row.profile.id,row.data);mitFormDirty=false;
      if(typeof toast==='function') toast('Opções salvas. A configuração permanece no perfil e será sincronizada pelo Google Drive. Nenhuma importação foi executada.');
      if(typeof renderView==='function') renderView();
      return true;
    }finally{setAsyncButtonState(button,false);}
  }
  async function saveMitExpenseSettings({button=null}={}){
    const row=findSourceConfig('marco-iris');
    if(!row) throw new Error('Integração com o Marco Iris não configurada.');
    setAsyncButtonState(button,true,'Salvando…');
    try{
      const draft=normalizeMitExpenseRules(row.config.mitExpenseRules,row.config);
      document.querySelectorAll('[data-mit-expense-rule]').forEach(ruleRow=>{
        const key=ruleRow.dataset.mitExpenseRule,rule=draft[key];if(!rule)return;
        const categoryInput=ruleRow.querySelector('[data-mit-expense-category]');
        if(categoryInput) rule.category=String(categoryInput.value||'').trim();
        const accountInput=ruleRow.querySelector('[data-mit-expense-account]');
        if(accountInput) rule.accountId=String(accountInput.value||'')||null;
        const reserveInput=ruleRow.querySelector('[data-mit-expense-reserve]');
        if(reserveInput) rule.reserveId=String(reserveInput.value||'')||null;
      });
      const candidate=Object.assign({},row.config,{mitExpenseRules:draft});
      let validated;
      try{validated=validateMitExpenseRules(row.data,candidate,draft);}
      catch(error){
        const method=MIT_EXPENSE_METHODS.find(item=>String(error.message||'').includes(item.label));
        const ruleRow=method?document.querySelector(`[data-mit-expense-rule="${method.key}"]`):null;
        const selector=String(error.message||'').includes('categoria')?'[data-mit-expense-category]':(String(error.message||'').includes('reserva')?'[data-mit-expense-reserve]':'[data-mit-expense-account]');
        ruleRow?.querySelector(selector)?.focus?.();
        if(typeof alert==='function') alert(error.message||String(error));
        return false;
      }
      row.config.mitExpenseRules=validated;row.config.mitExpenseMappingReady=true;
      saveProfileData(row.profile.id,row.data);mitFormDirty=false;
      if(typeof toast==='function') toast('Opções de despesa salvas. A partir de agora, despesas via Carteira, Pix, Débito e Reserva entram sozinhas na próxima sincronização.');
      if(typeof renderView==='function') renderView();
      return true;
    }finally{setAsyncButtonState(button,false);}
  }
  function mitExpenseIntegrationMeta(item){
    const record=item.record||{};
    return {
      integrationImported:true,integrationManaged:false,integrationImportMode:'native-assisted',
      integrationAggregateId:item.aggregateId,integrationSourceAppId:'marco-iris',integrationEntityId:item.entityId,
      integrationExpenseId:item.entityId,integrationImportedAt:nowIso(),integrationExternalReference:item.externalReference||record.externalReference||'',
      integrationOriginalStatus:item.status||record.status||'',integrationOriginalPaymentMethod:item.paymentMethod||record.paymentMethod||'',
      integrationOriginalSourceValues:clone(sourceBag(record)),integrationMappingVersion:SPEC.mappingVersion
    };
  }
  function ensureMitExpenseCategory(data,type,category){
    data.categorias ||= defaultCategories();
    const bucket=type==='fixa'?'fixa':'variavel';
    data.categorias[bucket]=Array.isArray(data.categorias[bucket])?data.categorias[bucket]:[];
    const value=String(category||'Outro').trim()||'Outro';
    if(!data.categorias[bucket].includes(value)) data.categorias[bucket].push(value);
    data.categoryColors ||= {receita:{},fixa:{},variavel:{}}; data.categoryColors[bucket] ||= {};
    if(!data.categoryColors[bucket][value]) data.categoryColors[bucket][value]=baseCatColor(value);
    return value;
  }
  function completeMitExpenseImport(row,item,borionId,options={}){
    const persist=options.persist!==false;
    const interop=ensureInterop(row.data),mitState=ensureMitState(row.data),state=importedState(row.data,'marco-iris');
    const importedAt=nowIso();
    mitState.expenses[String(item.entityId)]={borionId:borionId||'',aggregateId:item.aggregateId,importedAt};
    state.records[item.aggregateId]=Object.assign({},state.records[item.aggregateId]||{},{status:'imported',entityId:item.entityId,txId:borionId||'',importedAt});
    interop.pending=(interop.pending||[]).filter(pending=>!(pending.sourceAppId==='marco-iris'&&pending.aggregateId===item.aggregateId));
    if(!persist) return;
    if(S.currentProfile&&String(S.currentProfile.id)===String(row.profile.id)){
      S.data=row.data;
      saveCurrentData();
    }else{
      saveProfileData(row.profile.id,row.data);
    }
  }
  function mitReviewedExpenseCategories(data,type){
    data.categorias ||= defaultCategories();
    const bucket=type==='fixa'?'fixa':'variavel';
    const defaults=defaultCategories()[bucket]||['Outro'];
    const current=Array.isArray(data.categorias[bucket])?data.categorias[bucket]:[];
    data.categorias[bucket]=current.length?current:defaults.slice();
    if(!data.categorias[bucket].includes('Outro')) data.categorias[bucket].push('Outro');
    return data.categorias[bucket];
  }
  function validateMitReviewedExpenseViews(type){
    const previousTab=S.budgetTab;
    try{
      if(typeof renderBudget==='function'){
        S.budgetTab=type==='fixa'?'fixa':'variavel';
        const budgetHTML=renderBudget();
        if(typeof budgetHTML!=='string') throw new Error('A tela de Lançamentos não pôde ser validada.');
      }
      if(typeof renderOverview==='function'){
        const overviewHTML=renderOverview();
        if(typeof overviewHTML!=='string') throw new Error('A Visão geral não pôde ser validada.');
      }
      if(typeof renderInvestments==='function'&&investmentsEnabled?.()){
        const investmentsHTML=renderInvestments();
        if(typeof investmentsHTML!=='string') throw new Error('A tela de Investimentos não pôde ser validada.');
      }
    }finally{
      S.budgetTab=previousTab;
    }
  }
  function restoreMitExpenseSnapshot(target,snapshot){
    Object.keys(target).forEach(key=>delete target[key]);
    Object.assign(target,snapshot);
    S.data=target;
  }
  function openMitExpenseImport(aggregateId){
    const row=findSourceConfig('marco-iris');
    if(!row) return;
    if(!S.currentProfile||String(S.currentProfile.id)!==String(row.profile.id)){ if(typeof toast==='function')toast('Abra o perfil '+row.profile.name+' para revisar esta despesa.'); return; }
    const item=(ensureInterop(row.data).pending||[]).find(pending=>pending.sourceAppId==='marco-iris'&&pending.aggregateId===aggregateId);
    if(!item){ if(typeof toast==='function') toast('Esta despesa não está mais aguardando revisão.'); return; }

    const data=row.data;
    const accounts=(data.contas||[]).filter(a=>a&&!a.archivedAt&&a.active!==false);
    const reserves=(data.reservas?.boxes||[]).filter(r=>r&&!r.archivedAt&&r.active!==false);
    const cards=(data.cartoes||[]).filter(c=>c&&!c.archivedAt&&c.active!==false);
    const initialStatus=item.status==='Pago'?'Pago':'Em aberto';
    const initialCategory=String(item.category||item.record?.category||item.record?.categoria||'').trim();
    const returnScroll=window.scrollY||document.documentElement?.scrollTop||0;
    const root=document.getElementById('modal-root'),overlay=document.createElement('div');
    overlay.className='modal-overlay transaction-modal-overlay';
    overlay.innerHTML=`<div class="modal-box transaction-modal mit-expense-modal">
      <div class="modal-head"><h2>Importar Despesa</h2><button type="button" data-close>&times;</button></div>
      <p class="modal-sub">Revise os dados recebidos do Marco Iris. A despesa só será criada após clicar em Importar.</p>
      <div class="field"><label>Tipo</label><div class="segmented-toggle" id="mit_exp_type_group"><button type="button" class="seg-btn active" data-value="variavel">Despesa Variável</button><button type="button" class="seg-btn" data-value="fixa">Despesa Fixa</button></div><input type="hidden" id="mit_exp_type" value="variavel"></div>
      <div class="field"><label>Nome</label><input type="text" id="mit_exp_name" value="${escHtml(item.name||item.description||'Despesa do Marco Iris')}" placeholder="Nome da despesa"></div>
      <div class="field"><label>Local da compra</label><input type="text" id="mit_exp_local" value="${escHtml(item.localPurchase||'')}" placeholder="Ex: Mercado, fornecedor, loja..."></div>
      <div class="field"><label>Categoria</label><select id="mit_exp_category"></select><div id="mit_exp_newcat_box" class="quickcat-box hidden"><input type="text" id="mit_exp_newcat_input" placeholder="Nome da nova categoria"><button class="btn btn-primary btn-sm" id="mit_exp_newcat_add" type="button">Adicionar</button></div></div>
      <div class="field"><label>Valor (R$)</label><input type="text" inputmode="numeric" id="mit_exp_value" class="money-input" placeholder="0,00" autocomplete="off"></div>
      <div class="field"><label>Data</label><input type="date" id="mit_exp_date" value="${escHtml(item.date||todayISO())}"></div>
      <div class="field"><label>De onde será pago</label><div class="segmented-toggle payment-source-toggle" id="mit_exp_source_group"><button type="button" class="seg-btn active" data-value="carteira">Carteira</button><button type="button" class="seg-btn" data-value="conta">Conta</button><button type="button" class="seg-btn" data-value="reserva" ${reserves.length?'':'disabled'}>Reserva</button><button type="button" class="seg-btn" data-value="credito" ${cards.length?'':'disabled'}>Crédito</button></div><input type="hidden" id="mit_exp_source" value="carteira"></div>
      <div id="mit_exp_account_panel" class="payment-source-panel hidden"><div class="field"><label>Conta</label><select id="mit_exp_account">${accounts.filter(a=>!a.isCarteira&&String(a.id)!==String(CARTEIRA_CONTA_ID)).map(a=>`<option value="${escHtml(a.id)}">${escHtml(a.nome||'Conta')}</option>`).join('')}</select></div><div class="field"><label>Forma</label><select id="mit_exp_account_form"><option value="Pix">Pix</option><option value="Débito">Débito</option></select></div></div>
      <div id="mit_exp_reserve_panel" class="payment-source-panel hidden"><div class="field"><label>Reserva</label><select id="mit_exp_reserve">${reserves.map(r=>`<option value="${escHtml(r.id)}">${escHtml(r.nome||'Reserva')}</option>`).join('')}</select></div></div>
      <div id="mit_exp_credit_panel" class="payment-source-panel hidden"><div class="field"><label>Cartão de crédito</label><select id="mit_exp_card">${cards.map(c=>`<option value="${escHtml(c.id)}">${escHtml(c.banco||c.nome||'Cartão')}</option>`).join('')}</select></div></div>
      <div class="field"><label>Status deste mês</label><div class="segmented-toggle" id="mit_exp_status_group"><button type="button" class="seg-btn ${initialStatus==='Pago'?'active':''}" data-value="Pago">Pago</button><button type="button" class="seg-btn ${initialStatus==='Em aberto'?'active':''}" data-value="Em aberto">Em aberto</button></div><input type="hidden" id="mit_exp_status" value="${initialStatus}"></div>
      <div class="row-btns"><button type="button" class="btn btn-primary btn-block" id="mit_exp_import">Importar</button></div>
    </div>`;
    root.replaceChildren(overlay);
    if(typeof attachModalGuard==='function') attachModalGuard(overlay);

    const q=selector=>overlay.querySelector(selector);
    const wire=(group,hidden,change)=>q(group)?.querySelectorAll('.seg-btn:not([disabled])').forEach(btn=>btn.onclick=()=>{
      q(group).querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');q(hidden).value=btn.dataset.value;change?.(btn.dataset.value);
    });
    const categorySelect=q('#mit_exp_category'),newCategoryBox=q('#mit_exp_newcat_box'),newCategoryInput=q('#mit_exp_newcat_input');
    function fillCategorySelect(type,preferred=''){
      const categories=mitReviewedExpenseCategories(data,type);
      const selected=categories.includes(preferred)?preferred:(categories.includes('Outro')?'Outro':categories[0]);
      categorySelect.innerHTML=categories.map(category=>`<option value="${escHtml(category)}">${escHtml(category)}</option>`).join('')+'<option value="__new__">➕ Criar nova categoria...</option>';
      categorySelect.value=selected||'Outro';
      newCategoryBox.classList.add('hidden');newCategoryInput.value='';
    }
    categorySelect.onchange=()=>newCategoryBox.classList.toggle('hidden',categorySelect.value!=='__new__');
    q('#mit_exp_newcat_add').onclick=()=>{
      const type=q('#mit_exp_type').value;
      const category=String(newCategoryInput.value||'').trim();
      if(!category){newCategoryInput.focus();return;}
      ensureMitExpenseCategory(data,type,category);
      fillCategorySelect(type,category);
      if(typeof toast==='function')toast('Categoria criada.');
    };
    fillCategorySelect('variavel',initialCategory);
    attachMoneyMask(q('#mit_exp_value'),Number(item.amount)||0);

    overlay.querySelectorAll('[data-close]').forEach(btn=>btn.onclick=()=>closeModal());
    wire('#mit_exp_type_group','#mit_exp_type',type=>fillCategorySelect(type,''));
    wire('#mit_exp_status_group','#mit_exp_status');
    wire('#mit_exp_source_group','#mit_exp_source',source=>{
      q('#mit_exp_account_panel').classList.toggle('hidden',source!=='conta');
      q('#mit_exp_reserve_panel').classList.toggle('hidden',source!=='reserva');
      q('#mit_exp_credit_panel').classList.toggle('hidden',source!=='credito');
    });

    q('#mit_exp_import').onclick=()=>{
      const button=q('#mit_exp_import');
      if(button.disabled)return;
      const type=q('#mit_exp_type').value;
      const name=String(q('#mit_exp_name').value||'').trim();
      const localPurchase=String(q('#mit_exp_local').value||'').trim();
      const selectedCategory=q('#mit_exp_category').value;
      const value=Math.round((parseInt(q('#mit_exp_value').dataset.cents||'0',10)/100)*100)/100;
      const date=q('#mit_exp_date').value||todayISO();
      const source=q('#mit_exp_source').value;
      const status=q('#mit_exp_status').value==='Pago'?'Pago':'Em aberto';
      if(!name){alert('Informe o nome da despesa.');q('#mit_exp_name').focus();return;}
      if(selectedCategory==='__new__'){alert('Confirme o nome da nova categoria antes de importar.');newCategoryInput.focus();return;}
      if(value<=0){alert('Digite um valor maior que zero.');q('#mit_exp_value').focus();return;}
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)){alert('Informe uma data válida.');q('#mit_exp_date').focus();return;}

      button.disabled=true;button.textContent='Importando...';
      const beforeImport=clone(data);
      const category=ensureMitExpenseCategory(data,type,selectedCategory);
      const meta=mitExpenseIntegrationMeta(item);
      let borionId='';
      try{
        if(source==='credito'){
          const card=cards.find(c=>String(c.id)===String(q('#mit_exp_card').value));
          if(!card) throw new Error('Escolha um cartão válido.');
          card.parcelas=Array.isArray(card.parcelas)?card.parcelas:[];
          const parcel={id:uid(),descricao:name,local:localPurchase,categoria:category,valorParcela:value,parcelaTotal:1,dataCompra:date.slice(0,7),dataCompraCompleta:date,diaEntrada:Math.max(1,Number(date.slice(8,10))||1),apareceDespesas:true,despesaTipo:type,statusPagamento:status,statusFaturaPorCompetencia:{},despesaTransacaoId:null,despesaTransacaoIds:[],despesaFixaId:null,createdAt:Date.now()};
          card.parcelas.push(parcel);
          linkParcelaToDespesa(card,parcel);
          if(type==='fixa'){
            const fixed=(data.fixas||[]).find(f=>f.id===parcel.despesaFixaId);
            if(!fixed) throw new Error('Falha ao criar a despesa fixa no cartão.');
            Object.assign(fixed,meta,{localCompra:localPurchase,createdAt:fixed.createdAt||Date.now()});borionId=fixed.id;
          }else{
            const ids=Array.isArray(parcel.despesaTransacaoIds)&&parcel.despesaTransacaoIds.length?parcel.despesaTransacaoIds:[parcel.despesaTransacaoId].filter(Boolean);
            ids.forEach(id=>{const tx=(data.transacoes||[]).find(t=>t.id===id);if(tx)Object.assign(tx,meta,{localCompra:localPurchase,createdAt:tx.createdAt||Date.now()});});
            borionId=ids[0]||'';
            if(!borionId) throw new Error('Falha ao criar a despesa variável no cartão.');
          }
        }else if(type==='fixa'){
          let accountId=null,banco='',origemPagamento='conta',formaPagamento=null,reserve=null;
          if(source==='carteira'){
            accountId=CARTEIRA_CONTA_ID;if(!accountByIdIn(data,accountId))throw new Error('A Carteira não está disponível.');banco=accountName(data,accountId);formaPagamento='Dinheiro';
          }else if(source==='conta'){
            accountId=q('#mit_exp_account').value;if(!accountByIdIn(data,accountId))throw new Error('Escolha uma conta válida.');banco=accountName(data,accountId);formaPagamento=q('#mit_exp_account_form').value==='Débito'?'Débito':'Pix';
          }else{
            reserve=reserves.find(r=>String(r.id)===String(q('#mit_exp_reserve').value));if(!reserve)throw new Error('Escolha uma reserva válida.');origemPagamento='reserva';banco=reserve.banco||'';
          }
          const fixed=Object.assign({id:uid(),nome:name,localCompra:localPurchase,categoria:category,valor:value,dia:Math.max(1,Number(date.slice(8,10))||1),dataCadastro:date,startMonth:date.slice(0,7),endMonth:null,accountId:origemPagamento==='conta'?accountId:null,banco,formaPagamento:origemPagamento==='conta'?formaPagamento:null,origemPagamento,reservaOrigemId:reserve?.id||null,createdAt:Date.now()},meta);
          data.fixas=Array.isArray(data.fixas)?data.fixas:[];data.fixaPagamentos=Array.isArray(data.fixaPagamentos)?data.fixaPagamentos:[];data.fixas.push(fixed);borionId=fixed.id;
          if(status==='Pago'&&!applyMitFixedExpensePayment(data,fixed,fixed.startMonth)) throw new Error('Não foi possível aplicar o pagamento da despesa fixa. Confira o saldo e o destino selecionado.');
        }else{
          let accountId=null,banco='',origemPagamento='conta',formaPagamento=null,reserve=null;
          if(source==='carteira'){
            accountId=CARTEIRA_CONTA_ID;if(!accountByIdIn(data,accountId))throw new Error('A Carteira não está disponível.');banco=accountName(data,accountId);formaPagamento='Dinheiro';
          }else if(source==='conta'){
            accountId=q('#mit_exp_account').value;if(!accountByIdIn(data,accountId))throw new Error('Escolha uma conta válida.');banco=accountName(data,accountId);formaPagamento=q('#mit_exp_account_form').value==='Débito'?'Débito':'Pix';
          }else{
            reserve=reserves.find(r=>String(r.id)===String(q('#mit_exp_reserve').value));if(!reserve)throw new Error('Escolha uma reserva válida.');origemPagamento='reserva';banco=reserve.banco||'';
          }
          const tx=Object.assign({id:uid(),tipo:'variavel',nome:name,localCompra:localPurchase,categoria:category,valor:value,data:date,statusPagamento:status,accountId:origemPagamento==='conta'?accountId:null,banco,origemPagamento,formaPagamento:origemPagamento==='conta'?formaPagamento:null,reservaOrigemId:reserve?.id||null,reservaOrigemMoveId:null,createdAt:Date.now()},meta);
          data.transacoes=Array.isArray(data.transacoes)?data.transacoes:[];data.transacoes.push(tx);borionId=tx.id;
          if(status==='Pago'&&!applyNew(data,tx)) throw new Error('Não foi possível aplicar o saldo da despesa. Confira o saldo e o destino selecionado.');
        }

        completeMitExpenseImport(row,item,borionId,{persist:false});
        validateMitReviewedExpenseViews(type);
        S.data=data;
        saveCurrentData();

        closeModal();
        S.view='settings';uiSourceAppId='marco-iris';uiTab='links';
        if(typeof renderView==='function')renderView();
        requestAnimationFrame(()=>window.scrollTo({top:returnScroll,behavior:'auto'}));
        if(typeof toast==='function')toast('Despesa do Marco Iris importada com sucesso. Continue revisando as pendentes.');
      }catch(error){
        restoreMitExpenseSnapshot(data,beforeImport);
        button.disabled=false;button.textContent='Importar';
        console.error('[BORION][MIT_EXPENSE_REVIEW_IMPORT_ROLLBACK]',error);
        alert(error.message||String(error));
      }
    };
  }

  function renderSourceWorkspace(sourceAppId){
    const source = SOURCES[sourceAppId];
    const row = findSourceConfig(sourceAppId);
    const linksLabel=sourceAppId==='marco-iris'?'Configurar receitas e revisar despesas':'Vínculos';
    const linksContent=sourceAppId==='marco-iris'?renderMitLinksTab(row):renderLinksTab(sourceAppId,row);
    return `<div class="settings-section interop-workspace"><div class="interop-workspace-head"><div><h3>${escHtml(source.name)}</h3><p class="desc">Configurações específicas desta integração.</p></div>${row ? '<span class="pill ok">Conectado</span>' : '<span class="pill">Não conectado</span>'}</div><div class="interop-subtabs"><button class="${uiTab === 'connection' ? 'active' : ''}" onclick="BorionInterop.setSettingsTab('connection')">Conexão</button><button class="${uiTab === 'links' ? 'active' : ''}" onclick="BorionInterop.setSettingsTab('links')">${linksLabel}</button></div>${uiTab === 'links' ? linksContent : renderConnectionTab(sourceAppId, row)}</div>`;
  }

  function renderSettings(){
    if(!SOURCES[uiSourceAppId]) uiSourceAppId = 'amanda-estetica';
    return `<div class="settings-page interop-settings-page"><div class="settings-section settings-hero-section"><h3>Integrações inteligentes</h3><p class="desc">Receitas recebidas entram automaticamente. Despesas do Marco Iris ficam aguardando revisão; outras integrações continuam usando seus próprios vínculos.</p></div><div class="interop-app-tabs">${Object.entries(SOURCES).map(([id, source]) => {
      const row = findSourceConfig(id);
      return `<button class="interop-app-tab ${uiSourceAppId === id ? 'active' : ''}" onclick="BorionInterop.setSettingsSource('${id}')"><span>${escHtml(source.name)}</span><small>${row ? (row.config.mappingReady ? 'Conectado e configurado' : (id==='marco-iris'?'Conectado · configurar receitas':'Conectado · vínculos pendentes')) : 'Não conectado'}</small></button>`;
    }).join('')}</div>${renderSourceWorkspace(uiSourceAppId)}<div class="settings-section interop-rules-summary"><h3>Como a sincronização funciona</h3><div class="interop-rule-grid"><div><b>1. Identifica</b><span>Confere o ID permanente do registro externo.</span></div><div><b>2. Converte</b><span>Aplica tipos, categorias, status, formas e contas configuradas.</span></div><div><b>3. Torna nativo</b><span>O lançamento pode ser editado livremente no Borion.</span></div><div><b>4. Não duplica</b><span>O ID continua registrado mesmo após qualquer edição local.</span></div></div></div></div>`;
  }

  async function saveMappings(sourceAppId, {sync=false}={}){
    const row = findSourceConfig(sourceAppId);
    if(!row) throw new Error('Integração não configurada.');
    const mappings = normalizeMappings(row.config.mappings);

    document.querySelectorAll('[data-interop-direction]').forEach(select => {
      mappings.directions[select.dataset.interopDirection] = select.value;
    });
    document.querySelectorAll('[data-interop-kind]').forEach(select => {
      const key = select.dataset.interopKind;
      if(select.value) mappings.transactionKinds[key] = select.value;
      else delete mappings.transactionKinds[key];
    });
    document.querySelectorAll('[data-interop-category]').forEach(input => {
      const direction = input.dataset.direction;
      const key = input.dataset.key;
      const value = String(input.value || '').trim() || 'Outro';
      mappings.categories[direction] ||= {};
      mappings.categories[direction][key] = value;
    });
    document.querySelectorAll('[data-interop-revenue-origin]').forEach(select => {
      mappings.revenueOrigins[select.dataset.key] = select.value;
    });
    document.querySelectorAll('[data-interop-payment-form]').forEach(select => {
      const key = select.dataset.key;
      mappings.paymentMethods[key] ||= {};
      mappings.paymentMethods[key].form = select.value;
    });
    document.querySelectorAll('[data-interop-payment-target]').forEach(select => {
      const key = select.dataset.key;
      mappings.paymentMethods[key] ||= {};
      mappings.paymentMethods[key].target = select.value;
      delete mappings.paymentMethods[key].accountId;
    });
    document.querySelectorAll('[data-interop-status]').forEach(select => {
      mappings.statuses[select.dataset.key] = select.value;
    });

    row.config.mappings = mappings;
    row.config.mappingReady = true;
    row.config.mappingSavedAt = nowIso();
    saveProfileData(row.profile.id, row.data);
    if(typeof toast === 'function') toast('Opções salvas. Esta configuração continuará igual depois de sair e entrar novamente.');
    if(sync) return await syncSource(sourceAppId, {silent:false});
    if(typeof renderView === 'function') renderView();
    return true;
  }

  function markImportedDeletion(tx, mode='permanent', data=S.data){
    if(!tx?.integrationAggregateId || !tx?.integrationSourceAppId) return false;
    const sourceAppId=tx.integrationSourceAppId;
    const aggregateId=String(tx.integrationAggregateId);
    const entityId=String(tx.integrationReceiptId||tx.integrationExpenseId||tx.integrationEntityId||'');
    const state=importedState(data,sourceAppId);
    const ignored=ignoredState(data,sourceAppId);
    const permanent=mode!=='reimport';
    const ignoredAt=nowIso();
    const sourceRecordId=String(tx.integrationSourceRecordId||'')||
      (sourceAppId==='marco-iris'&&entityId?`marco:${tx.integrationExpenseId?'expense':'receipt'}:${entityId}`:'');
    if(permanent){
      const marker={ignoredAt,sourceAppId,aggregateId,sourceRecordId,entityId,txId:tx.id||'',reason:'user_deleted_in_borion'};
      [aggregateId,sourceRecordId,entityId].filter(Boolean).forEach(key=>{ignored[key]=clone(marker);});
      state.records[aggregateId]={status:'ignored',txId:'',entityId,sourceRecordId,ignoredAt,reason:'user_deleted_in_borion'};
      if(sourceAppId==='marco-iris'&&entityId){
        const mitState=ensureMitState(data),bucket=tx.integrationExpenseId?'expenses':'receipts';
        mitState[bucket][entityId]=Object.assign({},mitState[bucket][entityId]||{},{borionId:'',previousBorionId:tx.id||'',aggregateId,status:'ignored',ignoredAt});
      }
    }else{
      [aggregateId,sourceRecordId,entityId].filter(Boolean).forEach(key=>delete ignored[key]);
      delete state.records[aggregateId];
      if(sourceAppId==='marco-iris'&&entityId){const mitState=ensureMitState(data),bucket=tx.integrationExpenseId?'expenses':'receipts';delete mitState[bucket][entityId];}
    }
    const interop=ensureInterop(data);
    const keySet=new Set([aggregateId,sourceRecordId,entityId].filter(Boolean));
    interop.pending=(interop.pending||[]).filter(item=>!(item.sourceAppId===sourceAppId&&[item.aggregateId,item.sourceRecordId,item.entityId].map(String).some(key=>keySet.has(key))));
    interop.audit.unshift({id:'interop-delete-'+Date.now(),at:ignoredAt,sourceAppId,aggregateId,sourceRecordId,entityId,action:permanent?'delete-and-ignore':'delete-and-reimport'});
    interop.audit=interop.audit.slice(0,300);
    return true;
  }

  function openImportedDeleteDialog(tx, onChoice){
    const root = document.getElementById('modal-root');
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box interop-delete-modal"><div class="modal-head"><h2>Excluir lançamento importado</h2><button data-close>&times;</button></div><p class="modal-sub">Este lançamento veio de <b>${escHtml(sourceName(tx.integrationSourceAppId))}</b>. Ao excluir, o Borion gravará uma marca permanente para impedir que o mesmo lançamento volte na próxima sincronização.</p><button class="interop-delete-choice danger" data-choice="permanent"><strong>Excluir definitivamente</strong><span>Remove o lançamento, estorna o efeito financeiro e impede a reimportação deste mesmo ID.</span></button><button class="btn-outline btn-block" data-close>Cancelar</button></div>`;
    root.replaceChildren(overlay);
    if(typeof attachModalGuard==='function') attachModalGuard(overlay);
    overlay.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => { closeModal(); });
    overlay.querySelectorAll('[data-choice]').forEach(btn => btn.onclick = () => {
      const choice=btn.dataset.choice==='permanent'?'permanent':'reimport';
      closeModal();
      if(typeof onChoice==='function') onChoice(choice);
    });
  }

  function captureImportReference(tx){
    if(!tx?.integrationAggregateId || !tx?.integrationSourceAppId) return null;
    const out = {};
    Object.keys(tx).filter(key => key.startsWith('integration')).forEach(key => { out[key] = clone(tx[key]); });
    out.integrationImported = true;
    out.integrationManaged = false;
    out.integrationImportMode = 'native';
    return out;
  }
  function transferImportReference(sourceTx, targetIds, data=S.data){
    const reference = captureImportReference(sourceTx);
    if(!reference) return false;
    const ids = Array.isArray(targetIds) ? targetIds : [targetIds];
    const targets = (data.transacoes || []).filter(tx => ids.includes(tx.id));
    targets.forEach((tx, index) => Object.assign(tx, clone(reference), {integrationDerivedIndex:index + 1, integrationDerivedCount:targets.length}));
    const first = targets[0];
    if(first){
      const state = importedState(data, reference.integrationSourceAppId);
      const marker = state.records[reference.integrationAggregateId] || {};
      state.records[reference.integrationAggregateId] = Object.assign(marker, {status:'imported', txId:first.id});
    }
    return targets.length > 0;
  }

  // V6.45.4 — quando o perfil está em modo "perguntar sempre", a sincronização
  // automática nunca aplica os lançamentos: faz um cálculo "a seco" (clonando os
  // dados, sem gravar nada) usando a MESMA reconciliação de uma sincronização
  // real, só para descobrir quantos lançamentos novos existem dentro do corte.
  // Se houver algum, avisa (só quando a pessoa está de fato olhando aquele perfil
  // agora) e só importa de verdade se ela confirmar — "recusar" simplesmente não
  // faz nada, sem sujar o Borion.
  async function checkAskModeSource(row){
    try{
      const snapshot = await readSnapshot(row);
      validateSnapshot(snapshot, row.sourceAppId);
      const draftData = clone(row.data), draftConfig = ensureSourceConfig(clone(row.config));
      draftData.interconnections ||= {}; draftData.interconnections.sources ||= {};
      draftData.interconnections.sources[row.sourceAppId] = draftConfig;
      const dry = reconcileSnapshot(draftData, draftConfig, snapshot, {mode:'automatic'});
      const newCount = (dry.results||[]).filter(x => x.status==='created' || x.status==='expense_created').length;
      if(newCount<=0) return;
      const isCurrentProfile = S.currentProfile && String(S.currentProfile.id)===String(row.profile.id);
      if(!isCurrentProfile || typeof openConfirmModal!=='function') return;
      const revisionKey = String(snapshot.revision||'');
      if(String(row.config.lastAskPromptRevision||'')===revisionKey) return;
      const liveRow = findSourceConfig(row.sourceAppId) || row;
      liveRow.config.lastAskPromptRevision = revisionKey;
      saveProfileData(liveRow.profile.id, liveRow.data);
      openConfirmModal({
        title:'Novos lançamentos disponíveis',
        text: sourceName(row.sourceAppId)+' tem '+newCount+' lançamento(s) novo(s), dentro do período configurado, prontos para importar. Deseja importar agora?',
        confirmLabel:'Importar agora', cancelLabel:'Agora não', variant:'gold',
        onConfirm: () => { syncSource(row.sourceAppId, {silent:false}).catch(error => { if(typeof alert==='function') alert(error.message||String(error)); }); }
      });
    }catch(error){
      console.warn('[BORION_INTEROP] Verificação em modo "perguntar sempre":', error);
    }
  }
  async function syncAll({silent=true}={}){
    const rows = allSourceConfigs();
    const out = [];
    for(const row of rows){
      if(!row.config.mappingReady) continue;
      if(row.sourceAppId==='marco-iris'&&row.config.reconnectRequired) continue;
      if(silent && ensureInterop(row.data).importApprovalMode==='ask'){ await checkAskModeSource(row); continue; }
      try{ out.push(await syncSource(row.sourceAppId, {silent})); }
      catch(error){ console.warn('[BORION_INTEROP] Auto sync:', error); }
    }
    return out;
  }
  function start(){
    setTimeout(() => syncAll({silent:true}), 2500);
    setInterval(() => syncAll({silent:true}), 15000);
    document.addEventListener('visibilitychange', () => { if(!document.hidden) syncAll({silent:true}); });
    window.addEventListener('online', () => syncAll({silent:true}));
  }

  window.BorionInterop = Object.freeze({
    spec:SPEC, sources:SOURCES, sourceName,
    renderSettings, setSettingsSource, setSettingsTab, setDeletionPolicy, openMappingHelp,
    setupDialog, configure, inspectSource, saveMappings, saveMitSettings, saveMitExpenseSettings, setMitDestination, markMitFormDirty, openMitExpenseImport,
    syncSource, syncAll, disconnect, confirmInstanceReconnect,persistCriticalChange,
    setImportCutoff, setImportCutoffNow, clearImportCutoff,
    setImportApprovalMode, maybePromptImportMode,
    markImportedDeletion, openImportedDeleteDialog,
    captureImportReference, transferImportReference,
    start,
    __test:{
      hash, stableStringify, ensureInterop, validateSnapshot,
      discoverSnapshot, mappedRecord, reconcileSnapshot, reconcileMitSnapshot,markImportedDeletion,findIgnoredMitRecord,ignoredKeysForMit, makeMitIncomeTransaction, mitMethodKey, normalizeMitRevenueRules, validateMitRevenueRules, resolveMitEntryMethod, mitOriginalInstallments, mitRuleTarget, sourceLabel, friendlyFieldName, friendlySourceValue, normalizeTarget, resolveFinancialTarget,
      txDelta, adjust, applyReserveLink, paymentForm, targetAccountId, makeTransaction,
      markImportedDeletion, editableSnapshotHash, reverseImportedTransaction,
      beforeImportCutoff, checkAskModeSource, applyConfirmedInstanceRebind,
      mitExpenseMethodKey, normalizeMitExpenseRules, validateMitExpenseRules, commitMitExpenseAuto, applyMitFixedExpensePayment
    }
  });
})();
