'use strict';

/* Marco Iris - PTS completo 15/07/2026
 * Camada integrada de regras, telas e migração. Executada antes do boot.
 */
(() => {
  const PTS_VERSION = '2.5.4';
  const OPERATIONAL_STATUSES = ['Orçamento','Em andamento','Aguardando peça','Concluída','Cancelada'];
  const PAYMENT_METHODS = ['Pix','Dinheiro','Débito','Crédito (À vista)','Crédito 2x','Crédito 3x','Crédito 4x','Crédito 5x','Crédito 6x','Crédito 7x','Crédito 8x','Crédito 9x','Crédito 10x','Crédito 11x','Crédito 12x','Boleto','Transferência','Outro'];
  const EQUIPMENT_TYPES = ['Computador Gamer','Computador de Escritório','Notebook Gamer','Notebook','Celular','Monitor','Impressora','Console','Game Stick','Rack','Teclado','Roteador','Mouse'];
  const MENU_DEFAULT = ['dashboard','orders','agenda','clients','finance','catalog','documents','settings'];
  const MENU_LABELS = {dashboard:'Visão geral',orders:'Ordens de serviço',agenda:'Agenda',clients:'Clientes',finance:'Financeiro',catalog:'Catálogo e Estoque',documents:'Documentos',settings:'Configurações'};
  const ENTITY_PREFIXES = new Set(['OSV','CLI','PRD','SRV','INS','ITM','MOV','REC','DES','AGE','TER']);
  const STATUS_MAP = {
    'em analise':'Orçamento','aguardando aprovacao':'Orçamento','orcamento':'Orçamento',
    'em andamento':'Em andamento','aguardando peca':'Aguardando peça','pronto para retirada':'Concluída',
    'concluido':'Concluída','concluida':'Concluída','cancelado':'Cancelada','cancelada':'Cancelada'
  };
  const FINANCIAL_MAP = {'pendente':'Em aberto','em aberto':'Em aberto','atrasado':'Vencido','vencido':'Vencido','parcial':'Parcial','pago':'Pago','cancelado':'Cancelado'};
  const UF_OPTIONS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
  const VALID_DDDS = new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);
  const CITY_SEED = {
    SP:['Catanduva','Ariranha','São José do Rio Preto','Bebedouro','Barretos','Novo Horizonte','Pindorama','Santa Adélia','São Paulo','Campinas','Ribeirão Preto'],
    MG:['Belo Horizonte','Uberlândia','Uberaba'],RJ:['Rio de Janeiro','Niterói'],PR:['Curitiba','Londrina','Maringá']
  };

  let ORDER_FILTERS = {status:'Todos',mode:'Nenhum',day:today(),month:today().slice(0,7),year:String(new Date().getFullYear())};
  let FINANCE_FILTER = {month:today().slice(0,7)};
  let DOCUMENT_FILTER = {date:''};
  let DASHBOARD_LAYOUT_EDIT = false;
  let DASHBOARD_LAYOUT_SNAPSHOT = null;
  let PENDING_ORDER_DRAFT = null;
  let MIGRATION_SESSION = null;
  let FORM_LAYOUT_SNAPSHOT = null;
  let FORM_LAYOUT_HISTORY = [];
  let DASHBOARD_LAYOUT_HISTORY = [];
  let CEP_SUGGESTIONS = [];
  let ADDRESS_LOOKUP_TIMER = 0;
  let PROMPT_RESOLVE = null;
  let PRODUCT_SORT = {key:null,direction:'default'};
  let SETTINGS_CATEGORY = 'personalization';
  const SETTINGS_CATEGORIES = [
    ['personalization','Personalização e módulos','Layouts, PDF, WhatsApp, preferências e módulos.','grid'],
    ['organization','Organização','Menu, Visão Geral e disposição dos elementos.','menu'],
    ['company','Dados da empresa e proteção','Cadastro da empresa e segurança deste dispositivo.','clients'],
    ['backup','Backup e migração','AppSheet, Google Drive e exportações.','cloud'],
    ['system','Histórico e sistema','Auditoria, diagnóstico, integridade e informações técnicas.','history']
  ];

  const baseNormalizeState = normalizeState;
  const baseOpenModal = openModal;
  const baseHandleAction = handleAction;
  const baseHandleSubmit = handleSubmit;
  const baseRenderView = renderView;
  const baseNavigateTo = navigateTo;
  const baseDeletePaymentAction = null;
  const baseRealizedPaymentValue = realizedPaymentValue;
  const basePersistPts = persist;

  function digitsOnly(value){return String(value ?? '').replace(/\D/g,'');}
  function normalizeText(value){return norm(value).replace(/[^a-z0-9]+/g,' ').trim();}
  function parseSequence(value){const parsed=window.MarcoIdentifiers?.parseEntityCode(value);return parsed?.sequence??window.MarcoIdentifiers?.sequenceFrom(value)??0;}
  function groupedCode(prefix,sequence){return MarcoIdentifiers.formatEntityCode(prefix,Math.max(0,Number(sequence)||0));}
  function canonicalCode(value,prefix){return MarcoIdentifiers.normalizeEntityCode(value,prefix)||String(value||'').trim();}
  function importedCode(value,prefix,list=[]){
    const raw=String(value||'').trim();
    if(!raw)return nextCode(prefix,list);
    const canonical=MarcoIdentifiers.normalizeEntityCode(raw,prefix);
    return canonical||nextCode(prefix,list);
  }
  function normalizeBrazilianPhone(value){return MarcoPhone.normalizeBrazilianPhone(value);}
  function normalizedBrPhone(value){const result=normalizeBrazilianPhone(value);return result.valid?result.normalizedDigits:'';}
  function phoneFields(value){const result=normalizeBrazilianPhone(value);return result.valid?{phone:result.formatted,phoneNormalized:result.normalizedDigits,phoneE164:result.e164,phoneReviewRequired:false}:{phone:String(value||''),phoneNormalized:'',phoneE164:'',phoneReviewRequired:!!String(value||'').trim()};}
  function canonicalOperationalStatus(value){return STATUS_MAP[normalizeText(value)]||OPERATIONAL_STATUSES.find(x=>normalizeText(x)===normalizeText(value))||'Orçamento';}
  function isCancelledOrder(order){return normalizeText(order?.status)==='cancelada';}
  realizedPaymentValue = function(orderId){const order=findOrder(orderId);return order&&isCancelledOrder(order)?0:baseRealizedPaymentValue(orderId);};
  function paymentIsCancelled(payment){return normalizeText(payment?.status)==='cancelado'||!!payment?.cancelledAt;}
  function paymentIsPaid(payment){return !paymentIsCancelled(payment)&&!!payment?.paymentDate;}
  function recordFinancialStatus(payment){
    return window.MarcoFinanceStatus?.effectiveStatus(payment)||(!payment?.paymentDate&&payment?.dueDate&&payment.dueDate<today()?'Vencido':payment?.paymentDate?'Pago':paymentIsCancelled(payment)?'Cancelado':'Em aberto');
  }
  function orderFinancialInfo(order){
    if(!order||isCancelledOrder(order))return {status:'Cancelado',paid:0,balance:0,dueDate:'',overdue:false};
    const total=num(order.total);
    const payments=orderPayments(order.id).filter(p=>normalizeText(p.type)==='receita'&&!paymentIsCancelled(p));
    const paid=payments.filter(paymentIsPaid).reduce((sum,p)=>sum+num(p.value),0);
    const unpaid=payments.filter(p=>!paymentIsPaid(p));
    const overdue=unpaid.some(p=>p.dueDate&&p.dueDate<today());
    const dueDate=unpaid.map(p=>p.dueDate).filter(Boolean).sort()[0]||'';
    const balance=Math.max(0,total-paid);
    let status='Em aberto';
    if(total>0&&paid>=total-.005)status='Pago';
    else if(paid>0)status='Parcial';
    else if(overdue)status='Vencido';
    return {status,paid,balance,dueDate,overdue};
  }
  function paidActiveOrderPayments(orderId){return orderPayments(orderId).filter(p=>normalizeText(p.type)==='receita'&&paymentIsPaid(p));}
  async function planOrderCancellation(orderId,items=[]){
    const paid=paidActiveOrderPayments(orderId),decision={abort:false,paymentAction:'none',paymentIds:paid.map(p=>p.id),reverseStock:true,hadPaid:paid.length>0,hadAutomaticStock:false};
    if(paid.length){
      const total=paid.reduce((sum,p)=>sum+num(p.value),0),keep=await confirmAction(`A OSV possui ${currency(total)} recebido(s).\n\nOK = manter os pagamentos ativos no histórico.\nCancelar = abrir a opção de estorno lógico.`);
      if(keep)decision.paymentAction='preserve';
      else{const reverse=await confirmAction('Estornar/cancelar logicamente os pagamentos recebidos?\n\nOK = estornar, manter os IDs REC e registrar a auditoria.\nCancelar = interromper o cancelamento da OSV.');if(!reverse){decision.abort=true;return decision;}decision.paymentAction='cancel';}
    }
    const itemIds=new Set((items||[]).map(x=>x.id));
    decision.hadAutomaticStock=data().stockMovements.some(m=>m.orderId===orderId&&itemIds.has(m.sourceItemId)&&normalizeText(m.movementType)==='saida');
    if(decision.hadAutomaticStock)decision.reverseStock=await confirmAction('Esta OSV possui baixas automáticas de estoque.\n\nOK = reverter as baixas com MOV compensatória.\nCancelar = manter as baixas e continuar o cancelamento da OSV.');
    return decision;
  }
  function applyCancellationPaymentDecision(decision,orderId){
    if(decision?.paymentAction!=='cancel')return;
    const ids=new Set(decision.paymentIds||[]);
    data().payments.filter(p=>ids.has(p.id)).forEach(p=>{p.status='Cancelado';p.cancelledAt=nowIso();p.cancelReason=`Estorno lógico pelo cancelamento da ${orderId}`;p.updatedAt=nowIso();});
  }
  function cancellationAuditText(decision){
    if(!decision)return '';
    const pay=decision.paymentAction==='cancel'?'pagamentos estornados':decision.paymentAction==='preserve'?'pagamentos preservados':'sem pagamentos recebidos';
    const stock=decision.hadAutomaticStock?(decision.reverseStock?'estoque revertido':'estoque mantido'):'sem baixa automática';
    return `${pay}; ${stock}`;
  }
  function safeJson(value){try{return JSON.parse(JSON.stringify(value));}catch(_){return null;}}
  function findByAnyCode(list,code){const c=String(code||'').toUpperCase();return list.find(x=>String(x.id||x.code||'').toUpperCase()===c);}
  function activeItems(list){return list.filter(x=>normalizeText(x.status)!=='inativo');}
  function orderNotCancelled(order){return order&&order.registrationStatus!=='Inativo'&&!isCancelledOrder(order);}
  function currentProfileSettings(){return data().settings;}
  lowStockItems = function(){
    const rows=[];
    for(const x of data().products){if(normalizeText(x.status)==='inativo')continue;const health=MarcoStockHealth.getStockHealth(stockOf('Produto',x.id),x.minimumStock);if(['critical','warning'].includes(health.level))rows.push({type:'Produto',id:x.id,name:x.description,stock:stockOf('Produto',x.id),min:x.minimumStock,health});}
    for(const x of data().supplies){if(normalizeText(x.status)==='inativo')continue;const health=MarcoStockHealth.getStockHealth(stockOf('Insumo',x.id),x.minimumStock);if(['critical','warning'].includes(health.level))rows.push({type:'Insumo',id:x.id,name:x.description,stock:stockOf('Insumo',x.id),min:x.minimumStock,health});}
    return rows.sort((a,b)=>a.health.priority-b.health.priority||a.stock-b.stock||String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  };

  function migrateIdsAndLinks(d){
    const previous=d?.settings?.migrations?.identifiersPhonesV220;
    if(previous&&!needsV220Migration(d))return previous;
    const specs=[
      {key:'serviceOrders',prefix:'OSV',map:'orders'},
      {key:'clients',prefix:'CLI',map:'clients'},
      {key:'products',prefix:'PRD',map:'products'},
      {key:'services',prefix:'SRV',map:'services'},
      {key:'supplies',prefix:'INS',map:'supplies'},
      {key:'orderItems',prefix:'ITM',map:'items'},
      {key:'stockMovements',prefix:'MOV',map:'movements'},
      {key:'appointments',prefix:'AGE',map:'appointments'},
      {key:'consents',prefix:'TER',map:'consents'}
    ];
    const maps={orders:new Map(),clients:new Map(),products:new Map(),services:new Map(),supplies:new Map(),items:new Map(),movements:new Map(),appointments:new Map(),consents:new Map(),payments:new Map()};
    const conflicts=[];let changed=0;
    const migrateList=(list,prefix,map,label)=>{
      list=Array.isArray(list)?list:[];
      const parsed=list.map(item=>MarcoIdentifiers.parseEntityCode(item?.id||item?.code,prefix));
      let high=Math.max(num(d.settings?.nextIds?.[prefix]),...parsed.map(x=>x?.sequence||0));
      const used=new Set();
      list.forEach((item,index)=>{
        const old=String(item?.id||item?.code||'').trim(),info=parsed[index];let next=info?.canonical||'';
        if(!next||used.has(next)){
          do{high++;next=groupedCode(prefix,high);}while(used.has(next));
          conflicts.push({entity:label,oldId:old||'(vazio)',newId:next,reason:info?'colisão de identificador':'identificador ausente ou inválido'});
        }else high=Math.max(high,info.sequence);
        used.add(next);
        if(old&&!map.has(old))map.set(old,next);
        if(old!==next)changed++;
        item.id=next;if(Object.prototype.hasOwnProperty.call(item,'code'))item.code=next;
      });
      d.settings.nextIds[prefix]=Math.max(num(d.settings.nextIds[prefix]),high);
    };

    d.settings=d.settings||{};d.settings.nextIds=d.settings.nextIds||{};
    for(const spec of specs)migrateList(d[spec.key],spec.prefix,maps[spec.map],spec.key);
    migrateList((d.payments||[]).filter(p=>normalizeText(p.type)!=='despesa'),'REC',maps.payments,'payments/REC');
    migrateList((d.payments||[]).filter(p=>normalizeText(p.type)==='despesa'),'DES',maps.payments,'payments/DES');

    const remap=(value,map,prefix)=>{
      if(value===null||value===undefined||value==='')return value||'';
      const raw=String(value);return map.get(raw)||MarcoIdentifiers.normalizeEntityCode(raw,prefix)||raw;
    };
    for(const order of d.serviceOrders||[]){
      order.clientId=remap(order.clientId,maps.clients,'CLI');
      for(const media of [...(order.photos||[]),...(order.pdfs||[]),...(order.attachments||[])])media.orderId=order.id;
    }
    for(const item of d.orderItems||[]){
      item.orderId=remap(item.orderId,maps.orders,'OSV');
      item.productId=remap(item.productId,maps.products,'PRD');
      item.serviceId=remap(item.serviceId,maps.services,'SRV');
      item.supplyId=remap(item.supplyId,maps.supplies,'INS');
    }
    for(const payment of d.payments||[]){payment.orderId=remap(payment.orderId,maps.orders,'OSV');payment.clientId=remap(payment.clientId,maps.clients,'CLI');payment.code=payment.id;}
    for(const movement of d.stockMovements||[]){
      movement.orderId=remap(movement.orderId,maps.orders,'OSV');
      movement.productId=remap(movement.productId,maps.products,'PRD');
      movement.supplyId=remap(movement.supplyId,maps.supplies,'INS');
      movement.sourceItemId=remap(movement.sourceItemId,maps.items,'ITM');
    }
    for(const appointment of d.appointments||[]){appointment.orderId=remap(appointment.orderId,maps.orders,'OSV');appointment.clientId=remap(appointment.clientId,maps.clients,'CLI');}
    for(const consent of d.consents||[]){consent.orderId=remap(consent.orderId,maps.orders,'OSV');consent.clientId=remap(consent.clientId,maps.clients,'CLI');}
    for(const attachment of d.attachments||[])attachment.orderId=remap(attachment.orderId,maps.orders,'OSV');
    for(const history of d.priceHistory||[]){
      history.orderId=remap(history.orderId,maps.orders,'OSV');history.clientId=remap(history.clientId,maps.clients,'CLI');history.itemId=remap(history.itemId,maps.items,'ITM');
      if(normalizeText(history.type)==='produto')history.catalogId=remap(history.catalogId,maps.products,'PRD');
      else if(normalizeText(history.type)==='servico')history.catalogId=remap(history.catalogId,maps.services,'SRV');
      else if(normalizeText(history.type)==='insumo')history.catalogId=remap(history.catalogId,maps.supplies,'INS');
    }
    for(const history of d.costHistory||[]){
      if(normalizeText(history.catalogType)==='produto')history.catalogId=remap(history.catalogId,maps.products,'PRD');
      else if(normalizeText(history.catalogType)==='servico')history.catalogId=remap(history.catalogId,maps.services,'SRV');
      else if(normalizeText(history.catalogType)==='insumo')history.catalogId=remap(history.catalogId,maps.supplies,'INS');
    }

    const replacements=[];for(const map of Object.values(maps))for(const [old,next] of map.entries())if(old&&old!==next)replacements.push([old,next]);
    const replaceStructured=value=>{
      if(Array.isArray(value)){value.forEach(replaceStructured);return value;}
      if(value&&typeof value==='object'){for(const key of Object.keys(value))value[key]=replaceStructured(value[key]);return value;}
      if(typeof value==='string'){let text=value;for(const [old,next] of replacements)text=text.split(old).join(next);return text;}
      return value;
    };
    replaceStructured(d.migrationHistory||[]);replaceStructured(d.migrationLog||[]);replaceStructured(d.audit||[]);

    let phonesNormalized=0,phonesForReview=0;
    for(const client of d.clients||[]){
      const source=client.phoneNormalized||client.phone||'',result=normalizeBrazilianPhone(source);
      if(result.valid){
        if(client.phone!==result.formatted||client.phoneNormalized!==result.normalizedDigits||client.phoneE164!==result.e164)phonesNormalized++;
        Object.assign(client,{phone:result.formatted,phoneNormalized:result.normalizedDigits,phoneE164:result.e164,phoneReviewRequired:false});
      }else if(String(source).trim()){
        client.phone=client.phone||String(source);client.phoneNormalized='';client.phoneE164='';client.phoneReviewRequired=true;phonesForReview++;
      }else Object.assign(client,{phone:'',phoneNormalized:'',phoneE164:'',phoneReviewRequired:false});
    }

    const completedAt=nowIso(),report={version:'2.2.0',completedAt,changedIds:changed,phonesNormalized,phonesForReview,conflicts};
    d.settings.migrations=d.settings.migrations||{};d.settings.migrations.identifiersPhonesV220=report;
    d.migrationLog=d.migrationLog||[];d.migrationLog.push({id:`migration_v220_${Date.now()}`,date:completedAt,action:'Migração de identificadores concluída',detail:`${changed} identificador(es), ${phonesNormalized} telefone(s), ${phonesForReview} para revisão`,conflicts});
    d.audit=d.audit||[];d.audit.unshift({id:`audit_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,date:completedAt,action:'Migração de identificadores concluída',detail:`Formato AAA-000000 aplicado; ${phonesForReview} telefone(s) requerem revisão.`});
    return report;
  }

  function needsV220Migration(d){
    const checks=[['serviceOrders','OSV'],['clients','CLI'],['products','PRD'],['services','SRV'],['supplies','INS'],['orderItems','ITM'],['stockMovements','MOV'],['appointments','AGE'],['consents','TER']];
    for(const [key,prefix] of checks)for(const item of d[key]||[])if(!MarcoIdentifiers.parseEntityCode(item?.id,prefix)?.official||MarcoIdentifiers.normalizeEntityCode(item?.id,prefix)!==item?.id)return true;
    for(const payment of d.payments||[]){const prefix=normalizeText(payment.type)==='despesa'?'DES':'REC';if(MarcoIdentifiers.normalizeEntityCode(payment.id||payment.code,prefix)!==payment.id)return true;}
    for(const client of d.clients||[]){
      const source=client.phoneNormalized||client.phone||'',result=normalizeBrazilianPhone(source);
      if(result.valid&&(client.phone!==result.formatted||client.phoneNormalized!==result.normalizedDigits||client.phoneE164!==result.e164))return true;
      if(!result.valid&&String(source).trim()&&!client.phoneReviewRequired)return true;
    }
    return false;
  }

  function migrateInitialStock(d){
    const migrate=(item,type)=>{
      const initial=num(item.initialStock);
      const hasInitial=d.stockMovements.some(m=>m.origin==='initial-stock'&&((type==='Produto'&&m.productId===item.id)||(type==='Insumo'&&m.supplyId===item.id)));
      if(initial&&!hasInitial){
        const configuredNext=Math.max(1,num(d.settings?.nextIds?.MOV)||1);
        const maxExisting=(d.stockMovements||[]).reduce((max,m)=>Math.max(max,parseSequence(m?.id),parseSequence(m?.code)),0);
        const id=groupedCode('MOV',Math.max(configuredNext,maxExisting+1));
        d.stockMovements.push({id,itemType:type,productId:type==='Produto'?item.id:'',supplyId:type==='Insumo'?item.id:'',movementType:'Entrada',quantity:initial,date:item.createdAt?.slice?.(0,10)||today(),orderId:'',notes:'Estoque inicial do cadastro',stockBefore:0,stockAfter:initial,sourceItemId:'',origin:'initial-stock'});
        d.settings.nextIds.MOV=parseSequence(id)+1;
      }
      if(hasInitial||initial)item.initialStock=0;
    };
    d.products.forEach(x=>migrate(x,'Produto'));d.supplies.forEach(x=>migrate(x,'Insumo'));
  }

  function syncHighWatermarks(d=data()){
    /* nextIds representa o PRÓXIMO número livre — nunca o último já usado.
       Isso impede que a prévia de um formulário pule uma numeração. */
    d.settings=d.settings||{};d.settings.nextIds=d.settings.nextIds||{};
    const groups={OSV:d.serviceOrders,CLI:d.clients,PRD:d.products,SRV:d.services,INS:d.supplies,ITM:d.orderItems,MOV:d.stockMovements,AGE:d.appointments,TER:d.consents};
    for(const [prefix,list] of Object.entries(groups)){
      const max=(list||[]).reduce((m,x)=>Math.max(m,parseSequence(x?.id),parseSequence(x?.code)),0);
      d.settings.nextIds[prefix]=Math.max(1,num(d.settings.nextIds[prefix])||1,max+1);
    }
    for(const prefix of ['REC','DES']){
      const max=(d.payments||[]).filter(x=>(normalizeText(x.type)==='despesa'?'DES':'REC')===prefix).reduce((m,x)=>Math.max(m,parseSequence(x?.id),parseSequence(x?.code)),0);
      d.settings.nextIds[prefix]=Math.max(1,num(d.settings.nextIds[prefix])||1,max+1);
    }
    return d.settings.nextIds;
  }

  normalizeState = function(){
    baseNormalizeState();
    const sourceSchema=num(STATE.schemaVersion),profileData=Object.values(STATE.dataByProfile||{});
    for(const pd of profileData){
      if(!pd||typeof pd!=='object')continue;
      ['clients','serviceOrders','orderItems','payments','products','services','supplies','stockMovements','appointments','attachments','consents','audit','priceHistory','costHistory','migrationHistory','migrationLog'].forEach(k=>{if(!Array.isArray(pd[k]))pd[k]=[];});
      pd.settings=pd.settings||{};pd.settings.nextIds=pd.settings.nextIds||{};
      if(sourceSchema<5||needsV220Migration(pd)){migrateIdsAndLinks(pd);migrateInitialStock(pd);}
      pd.clients.forEach(client=>{const source=client.phoneNormalized||client.phone||'',result=normalizeBrazilianPhone(source);if(result.valid)Object.assign(client,{phone:result.formatted,phoneNormalized:result.normalizedDigits,phoneE164:result.e164,phoneReviewRequired:false});else if(String(source).trim())client.phoneReviewRequired=true;});
      pd.serviceOrders.forEach(o=>{o.status=canonicalOperationalStatus(o.status);o.discount=num(o.discount);o.total=num(o.total);});
      pd.payments.forEach(p=>{p.status=recordFinancialStatus(p);p.fee=num(p.fee);p.grossValue=num(p.grossValue)||num(p.value)+num(p.fee);});
      pd.products.forEach(p=>{if(p.margin>1)p.margin=p.margin/100;p.status=p.status||'Ativo';p.costHistory=undefined;});
      pd.services.forEach(s=>s.status=s.status||'Ativo');pd.supplies.forEach(s=>s.status=s.status||'Ativo');
      syncHighWatermarks(pd);
    }
    STATE.schemaVersion=5;
    const d=data();
    ['priceHistory','costHistory','migrationHistory','migrationLog'].forEach(k=>{if(!Array.isArray(d[k]))d[k]=[];});
    d.settings.modules={agenda:d.settings.modules?.agenda===true,terms:d.settings.modules?.terms===true};
    d.settings.menuOrder=Array.isArray(d.settings.menuOrder)?d.settings.menuOrder.filter(x=>MENU_DEFAULT.includes(x)):MENU_DEFAULT.slice();
    MENU_DEFAULT.forEach(x=>{if(!d.settings.menuOrder.includes(x))d.settings.menuOrder.push(x);});
    d.settings.dashboardLayout=d.settings.dashboardLayout||{};
    d.settings.dashboardLayouts=d.settings.dashboardLayouts||{};
    if(!Object.keys(d.settings.dashboardLayouts).length&&Object.keys(d.settings.dashboardLayout).length)d.settings.dashboardLayouts.desktop=clone(d.settings.dashboardLayout);
    d.settings.formLayouts=d.settings.formLayouts||{};
    d.settings.equipmentTypes=Array.isArray(d.settings.equipmentTypes)?d.settings.equipmentTypes:[];
    d.settings.migrationKeys=Array.isArray(d.settings.migrationKeys)?d.settings.migrationKeys:[];
    d.settings.migrationTemplates=d.settings.migrationTemplates||{};
    syncHighWatermarks(d);
    NAV.splice(0,NAV.length,...MENU_DEFAULT.map(id=>[id,MENU_LABELS[id]]));
    Object.assign(VIEW_TITLES,MENU_LABELS,{stock:'Catálogo e Estoque'});
  };

  const integrityReportV220Base=integrityReport;
  integrityReport=function(){
    const report=integrityReportV220Base();
    const issues=Array.isArray(report.issues)?report.issues:[];
    const add=(type,label,count,detail)=>{if(count)issues.push({type,label,count,detail});};
    const d=data();
    add('warn','Telefones para revisão',(d.clients||[]).filter(client=>client.phoneReviewRequired).length,'O valor antigo foi preservado, mas o WhatsApp fica bloqueado até a correção.');
    const specs=[['serviceOrders','OSV'],['clients','CLI'],['products','PRD'],['services','SRV'],['supplies','INS'],['orderItems','ITM'],['stockMovements','MOV'],['appointments','AGE'],['consents','TER']];
    let legacyIds=0;for(const [key,prefix] of specs)for(const item of d[key]||[])if(MarcoIdentifiers.normalizeEntityCode(item?.id,prefix)!==item?.id)legacyIds++;
    for(const payment of d.payments||[]){const prefix=normalizeText(payment.type)==='despesa'?'DES':'REC';if(MarcoIdentifiers.normalizeEntityCode(payment?.id||payment?.code,prefix)!==payment?.id)legacyIds++;}
    add('danger','Identificadores fora do padrão',legacyIds,'Execute a migração para aplicar AAA-000000 e reparar os vínculos.');
    report.issues=issues;report.total=issues.reduce((sum,item)=>sum+num(item.count),0);report.checkedAt=nowIso();return report;
  };

  nextCode = function(prefix,list,width=6,field='id'){
    const normalized=MarcoIdentifiers.normalizePrefix(prefix);
    const configuredNext=ENTITY_PREFIXES.has(normalized)?Math.max(1,num(currentProfileSettings()?.nextIds?.[normalized])||1):1;
    let maxExisting=0;
    for(const item of list||[]){
      if((normalized==='REC'||normalized==='DES')&&((normalizeText(item?.type)==='despesa'?'DES':'REC')!==normalized))continue;
      maxExisting=Math.max(maxExisting,parseSequence(item?.[field]||item?.id||item?.code));
    }
    const sequence=Math.max(configuredNext,maxExisting+1,1);
    return ENTITY_PREFIXES.has(normalized)?groupedCode(normalized,sequence):`${normalized}-${String(sequence).padStart(width,'0')}`;
  };

  persist = async function(action='',detail='',opts={}){
    syncHighWatermarks();
    return await basePersistPts(action,detail,opts);
  };

  realizedPaymentValue = function(orderId){const order=findOrder(orderId);if(order&&isCancelledOrder(order))return 0;return orderPayments(orderId).filter(p=>normalizeText(p.type)==='receita'&&paymentIsPaid(p)).reduce((s,p)=>s+num(p.value),0);};
  paymentStatus = function(order){return orderFinancialInfo(order).status;};
  statusBadge = function(value){
    const label=String(value||'Em aberto'),n=normalizeText(label);
    const tone=['concluida','pago','ativo','confirmado','entrada'].some(x=>n.includes(x))?'ok':['cancelada','cancelado','vencido','inativo','saida'].some(x=>n.includes(x))?'danger':['em andamento','parcial','orcamento'].some(x=>n.includes(x))?'blue':'warn';
    return `<span class="badge ${tone}"><span class="status-dot"></span>${esc(label)}</span>`;
  };
  stockOf = function(type,id){
    const item=type==='Produto'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id);
    const movements=data().stockMovements.filter(m=>(type==='Produto'&&m.productId===id)||(type==='Insumo'&&m.supplyId===id));
    const hasInitial=movements.some(m=>m.origin==='initial-stock');
    const legacyBase=hasInitial?0:num(item?.initialStock);
    return movements.reduce((s,m)=>s+movementSign(m)*num(m.quantity),legacyBase);
  };
  lowStockItems = function(){
    const build=(type,list)=>list.filter(x=>x.status!=='Inativo').map(x=>{const stock=stockOf(type,x.id),health=MarcoStockHealth.getStockHealth(stock,x.minimumStock);return {type,id:x.id,name:x.description,stock,min:x.minimumStock,health};});
    return [...build('Produto',data().products),...build('Insumo',data().supplies)].filter(x=>['critical','warning'].includes(x.health.level)).sort((a,b)=>a.health.priority-b.health.priority||a.stock-b.stock||String(a.name||'').localeCompare(String(b.name||''),'pt-BR'));
  };

  function visibleMenu(){
    const s=currentProfileSettings(),enabled=id=>id!=='agenda'||s.modules.agenda;
    return s.menuOrder.filter(id=>MENU_DEFAULT.includes(id)&&enabled(id)).map(id=>[id,MENU_LABELS[id]]);
  }

  renderShell = function(entry=''){
    stopLockNetwork();document.body.classList.remove('login-page');const p=activeProfile();
    const nav=visibleMenu();
    $('#root').innerHTML=`<div class="app-bg ${entry==='right'?'screen-enter-right':''}"><div class="app-shell"><aside class="sidebar" aria-label="Menu principal"><div class="brand"><img src="icon-192.png" alt=""><div><strong>Marco Iris</strong><small>Soluções em Tecnologia</small></div></div><div class="nav-section">Gestão</div>${nav.map(([id,label])=>`<button class="nav-btn ${CURRENT_VIEW===id?'active':''}" data-action="navigate" data-view="${id}">${icon(id)}<span>${label}</span></button>`).join('')}<div class="sidebar-footer"><div class="save-status" id="save-status" data-tone="ok">Google Drive conectado</div><button class="nav-btn" data-action="manual-save">${icon('save')}<span>Backup no Google Drive</span></button><button class="nav-btn lock-sidebar-btn" data-action="lock-now">${icon('lock')}<span>Bloquear tela</span></button></div></aside><button class="sidebar-scrim" type="button" data-action="close-menu" aria-label="Fechar menu"></button><main class="main"><header class="topbar"><button class="icon-btn mobile-menu" data-action="toggle-menu" aria-label="Abrir menu">${icon('menu')}</button><div class="view-heading"><h1 id="view-title">${VIEW_TITLES[CURRENT_VIEW]}</h1><small>${esc(p.name)} · ${esc(p.role||'Administrador')}</small></div><label class="global-search">${icon('search')}<input id="global-search" value="${attr(SEARCH)}" placeholder="Pesquisar nesta tela"></label><div class="top-actions"><button class="icon-btn desktop-only" title="Ocultar ou mostrar valores" data-action="toggle-privacy">${icon('eye')}</button><button class="icon-btn" title="Salvar" data-action="manual-save">${icon('save')}</button><button class="icon-btn lock-top-btn" title="Bloquear tela" data-action="lock-now">${icon('lock')}</button></div></header><section class="content" id="view-root"></section></main></div></div>`;
    renderView('none');
  };

  navigateTo = function(view){
    if(view==='stock'){ACTIVE_TAB.catalog='movements';view='catalog';}
    if(view==='agenda'&&!currentProfileSettings().modules.agenda)view='dashboard';
    return baseNavigateTo(view);
  };

  renderView = function(entry='soft'){
    if(CURRENT_VIEW==='stock'){CURRENT_VIEW='catalog';ACTIVE_TAB.catalog='movements';}
    if(CURRENT_VIEW==='agenda'&&!currentProfileSettings().modules.agenda)CURRENT_VIEW='dashboard';
    return baseRenderView(entry);
  };

  function screenBand(){return window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';}
  function dashboardLayoutStore(){
    const settings=currentProfileSettings();settings.dashboardLayouts=settings.dashboardLayouts||{};
    const band=screenBand();if(!settings.dashboardLayouts[band])settings.dashboardLayouts[band]=band==='desktop'&&Object.keys(settings.dashboardLayout||{}).length?clone(settings.dashboardLayout):{};
    return settings.dashboardLayouts[band];
  }
  function formLayoutKey(base){return `${base}:${screenBand()}`;}
  function widgetLayout(id,index){
    const saved=dashboardLayoutStore()[id]||{};
    const defaultSpan=Math.max(3,Math.round(12/dashboardColumnCount()));
    return {order:Number.isFinite(saved.order)?saved.order:index,span:saved.span||defaultSpan,height:saved.height||'auto'};
  }
  function pushDashboardHistory(){DASHBOARD_LAYOUT_HISTORY.push(clone(dashboardLayoutStore()));if(DASHBOARD_LAYOUT_HISTORY.length>30)DASHBOARD_LAYOUT_HISTORY.shift();}
  function widgetControls(id){return `<div class="widget-edit-controls"><button type="button" data-action="widget-move" data-id="${id}" data-dir="-1" title="Mover para cima">↑</button><button type="button" data-action="widget-move" data-id="${id}" data-dir="1" title="Mover para baixo">↓</button><button type="button" data-action="widget-width" data-id="${id}" data-dir="-1" title="Diminuir largura">− L</button><button type="button" data-action="widget-width" data-id="${id}" data-dir="1" title="Aumentar largura">+ L</button><button type="button" data-action="widget-height" data-id="${id}" data-dir="1" title="Alternar altura">↕</button></div>`;}
  function dashboardWidget(id,title,subtitle,body,index){const l=widgetLayout(id,index);return `<section class="card dashboard-widget" draggable="${DASHBOARD_LAYOUT_EDIT?'true':'false'}" data-widget-id="${id}" style="--widget-order:${l.order};--widget-span:${l.span};--widget-height:${l.height}">${widgetControls(id)}<div class="card-header"><div><h2>${title}</h2><p>${subtitle}</p></div></div><div class="widget-scroll">${body}</div></section>`;}

  function dashboardColumnCount(){
    const s=currentProfileSettings(),band=screenBand();s.dashboardColumns=s.dashboardColumns||{};
    const fallback=band==='mobile'?1:band==='tablet'?2:3;
    return Math.max(1,Math.min(4,num(s.dashboardColumns[band])||fallback));
  }
  function revenueBucketKey(date,period){
    const raw=String(date||'').slice(0,10);if(!raw)return '';
    if(period==='year')return raw.slice(0,4);
    if(period==='day')return raw;
    return raw.slice(0,7);
  }
  function revenueBucketLabel(key,period){
    if(period==='year')return key;
    if(period==='day')return formatDate(key);
    const [y,m]=String(key).split('-');return m&&y?new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit'}).format(new Date(Number(y),Number(m)-1,1)):key;
  }
  function dashboardRevenueModel(){
    const s=currentProfileSettings(),period=['day','month','year'].includes(s.dashboardRevenuePeriod)?s.dashboardRevenuePeriod:'month';
    const receiptMap=new Map(),expenseMap=new Map(),taxMap=new Map(),serviceMap=new Map(),productMap=new Map();
    const add=(map,key,value)=>{if(key)map.set(key,(map.get(key)||0)+num(value));};
    for(const payment of data().payments||[]){
      if(paymentIsCancelled(payment)||!paymentIsPaid(payment))continue;
      const date=payment.paymentDate||payment.dueDate||payment.createdAt,key=revenueBucketKey(date,period);if(!key)continue;
      const type=normalizeText(payment.type),value=num(payment.value),fee=num(payment.fee);
      if(type==='despesa'){add(expenseMap,key,value);if(/imposto|taxa|tribut/.test(normalizeText(payment.category||payment.notes)))add(taxMap,key,value);continue;}
      add(receiptMap,key,value);add(taxMap,key,fee);
      const order=findOrder(payment.orderId),items=order?orderItems(order.id):[];
      const serviceTotal=items.filter(x=>normalizeText(x.type)==='servico').reduce((sum,x)=>sum+num(x.subtotal),0);
      const productTotal=items.filter(x=>normalizeText(x.type)==='produto').reduce((sum,x)=>sum+num(x.subtotal),0);
      const base=serviceTotal+productTotal;
      if(base>0){add(serviceMap,key,value*(serviceTotal/base));add(productMap,key,value*(productTotal/base));}
      else add(serviceMap,key,value);
    }
    const keys=[...new Set([...receiptMap.keys(),...expenseMap.keys()])].sort();
    const limit=period==='day'?31:period==='month'?12:8,visible=keys.slice(-limit);
    const selected=visible.includes(s.dashboardRevenueSelected)?s.dashboardRevenueSelected:(visible.at(-1)||'');
    s.dashboardRevenuePeriod=period;s.dashboardRevenueSelected=selected;
    const points=visible.map(key=>({key,label:revenueBucketLabel(key,period),revenue:receiptMap.get(key)||0,service:serviceMap.get(key)||0,product:productMap.get(key)||0,expenses:expenseMap.get(key)||0,taxes:taxMap.get(key)||0}));
    return {period,selected,points,selectedPoint:points.find(x=>x.key===selected)||{key:'',label:'Sem dados',revenue:0,service:0,product:0,expenses:0,taxes:0}};
  }
  function dashboardRevenueBody(){
    const model=dashboardRevenueModel(),max=Math.max(1,...model.points.map(x=>x.revenue));
    const chart=model.points.length?`<div class="revenue-chart-v254" role="img" aria-label="Gráfico de faturamento">${model.points.map(x=>`<button type="button" class="revenue-bar-column-v254 ${x.key===model.selected?'is-selected':''}" data-action="dashboard-revenue-select" data-key="${attr(x.key)}" title="${attr(x.label)} · ${attr(currency(x.revenue))}"><span class="revenue-bar-v254" style="--revenue-height:${Math.max(4,Math.round(x.revenue/max*100))}%"></span><small>${esc(x.label)}</small></button>`).join('')}</div>`:'<div class="empty">Ainda não existem lançamentos para o período.</div>';
    const p=model.selectedPoint,parts=[['Receita de Serviços',p.service],['Receita de Produtos',p.product],['Despesas',p.expenses],['Impostos',p.taxes]],partMax=Math.max(1,...parts.map(x=>x[1]));
    return `<div class="revenue-widget-v254"><div class="revenue-period-tabs-v254">${[['day','Dia'],['month','Mês'],['year','Ano']].map(([id,label])=>`<button type="button" class="${model.period===id?'active':''}" data-action="dashboard-revenue-period" data-period="${id}">${label}</button>`).join('')}</div>${chart}<div class="revenue-composition-v254"><div class="composition-heading-v254"><strong>Composição · ${esc(p.label)}</strong><span>${currency(p.revenue)}</span></div>${parts.map(([label,value])=>`<div class="composition-row-v254"><span>${label}</span><div><i style="--composition-width:${Math.round(value/partMax*100)}%"></i></div><b>${currency(value)}</b></div>`).join('')}</div></div>`;
  }

  renderDashboard = function(){
    const d=data(),month=today().slice(0,7),orders=d.serviceOrders.filter(orderNotCancelled),open=orders.filter(o=>!['concluida','cancelada'].includes(normalizeText(o.status)));
    const paidMonth=d.payments.filter(p=>normalizeText(p.type)==='receita'&&paymentIsPaid(p)&&monthKey(p.paymentDate)===month&&!isCancelledOrder(findOrder(p.orderId))).reduce((sum,p)=>sum+num(p.value),0);
    const expenses=d.payments.filter(p=>normalizeText(p.type)==='despesa'&&paymentIsPaid(p)&&monthKey(p.paymentDate)===month).reduce((sum,p)=>sum+num(p.value),0);
    const receivables=orders.map(o=>({order:o,client:findClient(o.clientId),...orderFinancialInfo(o)})).filter(x=>x.balance>.005).sort((a,b)=>Number(b.overdue)-Number(a.overdue)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999'));
    const receivableTotal=receivables.reduce((sum,x)=>sum+x.balance,0),receivableClients=new Set(receivables.map(x=>x.order.clientId||x.order.clientName).filter(Boolean)).size;
    const low=lowStockItems(),critical=low.filter(x=>x.health.level==='critical').length,warning=low.filter(x=>x.health.level==='warning').length,agendaOn=currentProfileSettings().modules.agenda;
    const appts=agendaOn?d.appointments.filter(a=>a.date===today()&&normalizeText(a.status)!=='cancelado').sort((a,b)=>(a.time||'').localeCompare(b.time||'')):[];
    const recent=[...orders].sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||'')).slice(0,8);
    const kpis=[
      `<div class="card kpi"><div class="kpi-icon blue">${icon('orders')}</div><div><small>Ordens abertas</small><strong>${privacy(open.length)}</strong><div class="delta">${orders.length} OSVs ativas</div></div></div>`,
      `<div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receitas no mês</small><strong>${privacy(currency(paidMonth))}</strong><div class="delta">Saldo ${privacy(currency(paidMonth-expenses))}</div></div></div>`,
      `<div class="card kpi"><div class="kpi-icon orange">${icon('finance')}</div><div><small>Valores a receber</small><strong>${privacy(currency(receivableTotal))}</strong><div class="delta">${receivableClients} ${receivableClients===1?'cliente':'clientes'}</div></div></div>`,
      `<div class="card kpi"><div class="kpi-icon red">${icon('stock')}</div><div><small>Estoque crítico</small><strong>${privacy(critical)}</strong><div class="delta">${warning} em atenção</div></div></div>`,
      agendaOn?`<div class="card kpi"><div class="kpi-icon blue">${icon('agenda')}</div><div><small>Agenda de hoje</small><strong>${privacy(appts.length)}</strong><div class="delta">${appts.filter(a=>normalizeText(a.status)==='confirmado').length} confirmados</div></div></div>`:''
    ].filter(Boolean).join('');
    const recentBody=recent.length?`<div class="list">${recent.map(o=>`<button class="list-row" data-action="view-order" data-id="${attr(o.id)}"><div class="list-row-main"><strong>${esc(o.id)} · ${esc(o.clientName||findClient(o.clientId)?.name||'Cliente')}</strong><small>${esc(o.equipmentType||'Equipamento não informado')} · ${esc(o.brandModel||'Sem marca/modelo')}</small></div><div class="list-row-side">${statusBadge(o.status)}<small>${currency(o.total)}</small></div></button>`).join('')}</div>`:'<div class="empty">Nenhuma OSV cadastrada.</div>';
    const receiveBody=receivables.length?`<div class="list">${receivables.slice(0,12).map(x=>`<div class="list-row clickable-dashboard-row-v254" data-action="view-order" data-id="${attr(x.order.id)}"><div class="list-row-main"><strong>${esc(x.order.id)} · ${esc(x.client?.name||x.order.clientName||'Cliente')}</strong><small>${x.dueDate?`Vencimento ${formatDate(x.dueDate)}`:'Sem vencimento combinado'} · saldo ${currency(x.balance)}</small></div>${statusBadge(x.status==='Parcial'&&x.overdue?'Parcial - vencido':x.status)}<div class="actions dashboard-row-actions-v254"><button data-action="new-payment" data-order="${attr(x.order.id)}" title="Adicionar pagamento">${icon('plus')}</button><button data-action="view-current-pdf" data-id="${attr(x.order.id)}" title="Visualizar PDF">${icon('pdf')}</button><button data-action="share-order" data-id="${attr(x.order.id)}" title="Enviar PDF pelo WhatsApp">${icon('phone')}</button><button data-action="view-client" data-id="${attr(x.order.clientId)}" title="Abrir cliente">${icon('clients')}</button></div></div>`).join('')}</div>`:'<div class="empty">Nenhum cliente com saldo pendente.</div>';
    const stockBody=low.length?`<div class="list">${low.slice(0,12).map(x=>{const item=x.type==='Produto'?d.products.find(p=>p.id===x.id):d.supplies.find(p=>p.id===x.id);const action=x.type==='Produto'?'edit-product':'edit-supply';return `<button class="list-row stock-alert-row-v254" data-action="${action}" data-id="${attr(x.id)}"><div class="list-row-main"><strong>${esc(x.name)}</strong><small>${esc(x.type)} · ${esc(item?.supplier||'Fornecedor não informado')}</small><small>Mínimo ${num(x.min)} · Estoque ${num(x.stock)} <span class="stock-health-badge ${x.health.tone}">${esc(x.health.label)}</span></small></div></button>`;}).join('')}</div>`:'<div class="empty">Nenhum item em nível crítico ou de atenção.</div>';
    const agendaBody=agendaOn?(appts.length?appts.map(a=>`<div class="list-row"><div class="badge blue">${esc(a.time||'--:--')}</div><div class="list-row-main"><strong>${esc(a.title||a.clientName||'Compromisso')}</strong><small>${esc(a.location||'Sem local')}</small></div>${statusBadge(a.status||'Agendado')}</div>`).join(''):'<div class="empty">Nenhum compromisso para hoje.</div>'):'';
    const widgets=[dashboardWidget('recent','Ordens recentes','Últimas movimentações da assistência.',recentBody,0),dashboardWidget('receivables','Clientes a receber','Saldos em aberto, vencidos e parciais.',receiveBody,1),dashboardWidget('stock-alerts','Alertas de estoque','Produtos e insumos no mínimo.',stockBody,2),dashboardWidget('revenue','Faturamento','Análise por período e composição financeira.',dashboardRevenueBody(),3)];
    if(agendaOn)widgets.splice(1,0,dashboardWidget('today-agenda','Agenda de hoje','Compromissos e visitas técnicas.',agendaBody,1));
    const columns=dashboardColumnCount();
    return `<section class="hero hero-compact-v254"><div class="hero-content"><div><h2>Olá, ${esc(activeProfile().name)}.</h2><p>OSVs, clientes a receber e estoque em um só fluxo.</p></div><div class="hero-clock"><strong id="live-clock">--:--</strong><small id="live-date"></small></div></div></section><div class="dashboard-layout-toolbar dashboard-toolbar-v254">${DASHBOARD_LAYOUT_EDIT?`<button class="btn primary compact" data-action="save-dashboard-layout">Salvar</button><button class="btn secondary compact" data-action="cancel-dashboard-layout">Cancelar</button><button class="btn ghost compact" data-action="undo-dashboard-layout" ${DASHBOARD_LAYOUT_HISTORY.length?'':'disabled'}>Desfazer</button><button class="btn ghost compact" data-action="reset-dashboard-layout">Restaurar padrão</button><label class="dashboard-columns-select-v254">Colunas <select data-dashboard-columns><option value="1" ${columns===1?'selected':''}>1</option><option value="2" ${columns===2?'selected':''}>2</option><option value="3" ${columns===3?'selected':''}>3</option><option value="4" ${columns===4?'selected':''}>4</option></select></label><span class="muted">Arraste ou use os controles.</span>`:`<button class="dashboard-edit-icon-v254" data-action="toggle-dashboard-layout" title="Editar módulos" aria-label="Editar módulos">${icon('edit')}</button>`}</div><div class="grid kpis pts-kpis">${kpis}</div><div class="dashboard-widget-grid ${DASHBOARD_LAYOUT_EDIT?'layout-editing':''}" data-layout-container="dashboard" style="--dashboard-columns:${columns}">${widgets.join('')}</div>`;
  };

  function periodState(section){
    const s=currentProfileSettings();s.periodFilters=s.periodFilters||{};
    s.periodFilters[section]=s.periodFilters[section]||{month:'',days:''};
    return s.periodFilters[section];
  }
  function parsedDayRange(value){
    const raw=String(value||'').trim();if(!raw)return null;
    const match=raw.match(/^(\d{1,2})(?:\s*[-–]\s*(\d{1,2}))?$/);if(!match)return null;
    const start=Math.max(1,Math.min(31,num(match[1]))),end=Math.max(start,Math.min(31,num(match[2]||match[1])));
    return {start,end};
  }
  function matchesUnifiedPeriod(value,section){
    const filter=periodState(section),date=String(value||'').slice(0,10);
    if(!filter.month)return true;if(date.slice(0,7)!==filter.month)return false;
    const range=parsedDayRange(filter.days);if(!range)return true;
    const day=num(date.slice(8,10));return day>=range.start&&day<=range.end;
  }
  function unifiedPeriodControls(section){
    const filter=periodState(section);
    return `<div class="period-filter-v254" data-period-section="${attr(section)}"><span class="period-filter-label-v254">${icon('agenda',17)}<b>Data</b></span><input class="filter-control" type="month" data-period-month="${attr(section)}" value="${attr(filter.month)}" aria-label="Mês e ano"><input class="filter-control period-days-v254" type="text" inputmode="numeric" data-period-days="${attr(section)}" value="${attr(filter.days)}" placeholder="Dias 10-31" aria-label="Intervalo opcional de dias"><button type="button" class="icon-btn period-clear-v254" data-action="clear-unified-period" data-section="${attr(section)}" title="Limpar período" aria-label="Limpar período">🧹</button></div>`;
  }
  function orderMatchesTemporal(order){return matchesUnifiedPeriod(order.openedAt||order.createdAt,'orders');}
  function temporalControls(){return unifiedPeriodControls('orders');}
  function quickOrderActions(order){
    return `<details class="quick-actions"><summary aria-label="Ações rápidas">${icon('menu',18)}</summary><div class="quick-actions-menu"><button data-action="new-payment" data-order="${attr(order.id)}">${icon('finance',16)} Adicionar pagamento</button><button data-action="generate-pdf-background" data-id="${attr(order.id)}">${icon('pdf',16)} Gerar PDF</button><button data-action="view-current-pdf" data-id="${attr(order.id)}">${icon('eye',16)} Visualizar PDF</button><button data-action="share-order" data-id="${attr(order.id)}">${icon('phone',16)} Enviar PDF</button><button data-action="view-client" data-id="${attr(order.clientId)}">${icon('clients',16)} Abrir cliente</button><button data-action="edit-order" data-id="${attr(order.id)}">${icon('edit',16)} Editar OSV</button></div></details>`;
  }
  renderOrders = function(){
    const mode=getViewMode('orders'),all=[...data().serviceOrders].filter(o=>matches(o.id,o.clientName,findClient(o.clientId)?.name,o.equipmentType,o.brandModel,o.status,o.reportedIssue));
    const rows=all.filter(o=>(SHOW_ARCHIVED.orders?o.registrationStatus==='Inativo':o.registrationStatus!=='Inativo')&&orderMatchesTemporal(o)).sort((a,b)=>(b.openedAt||'').localeCompare(a.openedAt||''));
    const filtered=ORDER_FILTERS.status==='Todos'?rows:rows.filter(o=>normalizeText(o.status)===normalizeText(ORDER_FILTERS.status));
    const archived=all.filter(o=>o.registrationStatus==='Inativo').length;
    return `<div class="toolbar orders-toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-order">+ Nova OSV</button><div class="mobile-filter-panel"><select id="order-status-filter" class="filter-control"><option>Todos</option>${OPERATIONAL_STATUSES.map(v=>`<option ${v===ORDER_FILTERS.status?'selected':''}>${v}</option>`).join('')}</select>${temporalControls()}</div><button class="btn secondary" data-action="toggle-archived-orders">${SHOW_ARCHIVED.orders?'Ver ativas':`Arquivadas (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('orders',mode)}<span class="badge blue">${filtered.length} OSVs</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="orders"><div class="table-wrap"><table class="table osv-table"><thead><tr><th>OSV</th><th>Abertura</th><th>Cliente</th><th>Equipamento</th><th>Financeiro</th><th>Status</th><th class="text-right">Valor</th><th>Ações</th></tr></thead><tbody>${filtered.map(o=>{const f=orderFinancialInfo(o);return `<tr><td><button class="code-link" data-action="view-order" data-id="${attr(o.id)}"><strong>${esc(o.id)}</strong></button>${o.registrationStatus==='Inativo'?'<small class="muted">Arquivada</small>':''}</td><td>${formatDate(o.openedAt)}</td><td><button class="text-link" data-action="view-client" data-id="${attr(o.clientId)}">${esc(o.clientName||findClient(o.clientId)?.name||'—')}</button></td><td><strong>${esc(o.equipmentType||'—')}</strong><small class="muted">${esc(o.brandModel||'')}</small></td><td>${statusBadge(f.status==='Parcial'&&f.overdue?'Parcial - vencido':f.status)}<small class="muted">${f.balance>0?currency(f.balance)+' pendente':''}</small></td><td><div class="inline-status-shell" data-status-tone="${attr(normalizeText(o.status))}"><select class="inline-status" data-quick-order-status="${attr(o.id)}" aria-label="Status operacional da OSV ${attr(o.id)}">${OPERATIONAL_STATUSES.map(s=>`<option value="${attr(s)}" ${s===o.status?'selected':''}>${esc(s)}</option>`).join('')}</select><span class="inline-status-chevron" aria-hidden="true">${icon('arrow',14)}</span><span class="inline-status-saving" aria-hidden="true"></span></div></td><td class="text-right"><strong>${currency(o.total)}</strong></td><td>${quickOrderActions(o)}</td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhuma OSV encontrada.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function firstName(name){return normalizeText(name).split(' ')[0]||'';}
  function sortedActiveClients(query=''){
    const q=normalizeText(query);
    return activeItems(data().clients).slice().sort((a,b)=>{
      if(q){const af=firstName(a.name),bf=firstName(b.name),ae=af===q,be=bf===q;if(ae!==be)return ae?-1:1;const ap=af.startsWith(q),bp=bf.startsWith(q);if(ap!==bp)return ap?-1:1;}
      return String(a.name||'').localeCompare(String(b.name||''),'pt-BR',{sensitivity:'base'});
    });
  }
  function clientSelectOptions(selected=''){return `<option value="__new__">+ Adicionar novo cliente</option><option value="" ${selected?'':'selected'}>Selecione um cliente</option>${sortedActiveClients().map(c=>`<option value="${attr(c.id)}" ${c.id===selected?'selected':''}>${esc(c.name)} · ${esc(c.id)}</option>`).join('')}`;}
  function equipmentTypeOptions(selected=''){return [...EQUIPMENT_TYPES,...currentProfileSettings().equipmentTypes.filter(x=>!EQUIPMENT_TYPES.some(y=>normalizeText(y)===normalizeText(x)))].map(x=>`<option value="${attr(x)}" ${x===selected?'selected':''}>${esc(x)}</option>`).join('');}

  itemReferenceOptions = function(type,selected=''){
    const list=type==='Produto'?data().products:type==='Insumo'?data().supplies:data().services;
    return `<option value="">Selecione</option>${activeItems(list).sort((a,b)=>String(a.description||a.name||'').localeCompare(String(b.description||b.name||''),'pt-BR')).map(x=>`<option value="${attr(x.id)}" ${x.id===selected?'selected':''}>${esc(x.description||x.name||x.id)}</option>`).join('')}`;
  };
  orderItemRow = function(it={}){
    const type=it.type==='Produto'?'Produto':'Serviço',ref=it.productId||it.serviceId||'';
    const unit=window.MarcoMoney?.formatNumber(num(it.unitPrice))||currency(num(it.unitPrice));
    const subtotal=window.MarcoMoney?.formatNumber(num(it.subtotal)||num(it.quantity)*num(it.unitPrice))||currency(num(it.subtotal)||num(it.quantity)*num(it.unitPrice));
    return `<div class="item-editor-row" draggable="true" data-order-item="true" data-item-id="${attr(it.id||'')}" data-table-price="${attr(num(it.tablePrice)||itemTablePrice(type,ref))}" data-unit-cost="${attr(type==='Produto'?(Number.isFinite(Number(it.unitCost))?num(it.unitCost):num(data().products.find(product=>product.id===ref)?.cost)):0)}"><div class="item-reorder-controls" aria-label="Reordenar item"><button type="button" data-action="move-item-row" data-dir="-1" title="Mover para cima">↑</button><button type="button" data-action="move-item-row" data-dir="1" title="Mover para baixo">↓</button><span title="Arraste para reordenar">⋮⋮</span></div><div class="field item-type"><label>Tipo</label><select data-item-field="type"><option ${type==='Serviço'?'selected':''}>Serviço</option><option ${type==='Produto'?'selected':''}>Produto</option></select></div><div class="field item-name"><label>Item</label><select data-item-field="ref">${itemReferenceOptions(type,ref)}</select></div><div class="field item-qty"><label>Quantidade</label><input type="number" step="${type==='Produto'?'1':'0.01'}" min="${type==='Produto'?'1':'0.01'}" data-item-field="qty" value="${attr(it.quantity||1)}"></div><div class="field item-price money-field"><label>Valor unitário</label><input type="text" inputmode="numeric" data-money="true" data-item-field="price" value="${attr(unit)}"></div><div class="field item-subtotal money-field"><label>Subtotal</label><input type="text" inputmode="numeric" data-money="true" readonly data-item-field="subtotal" value="${attr(subtotal)}"></div><label class="stock-check ${type==='Serviço'?'is-hidden':''}"><span>Baixar<br>estoque</span><input type="checkbox" data-item-field="stock" ${it.lowerStock?'checked':''} ${type==='Serviço'?'disabled':''}></label><button type="button" class="icon-btn danger item-remove" data-action="remove-item-row" title="Remover item">${icon('trash')}</button></div>`;
  };
  updateItemReference = function(row){
    const type=$('[data-item-field="type"]',row).value,ref=$('[data-item-field="ref"]',row),stockWrap=$('.stock-check',row),stock=$('[data-item-field="stock"]',row),qty=$('[data-item-field="qty"]',row);
    ref.innerHTML=itemReferenceOptions(type);stockWrap?.classList.toggle('is-hidden',type==='Serviço');stock.disabled=type==='Serviço';if(type==='Serviço')stock.checked=false;if(qty){qty.step=type==='Produto'?'1':'0.01';qty.min=type==='Produto'?'1':'0.01';if(type==='Produto'&&num(qty.value)<1)qty.value='1';}updateItemPrice(row);
  };
  updateItemPrice = function(row){
    const type=$('[data-item-field="type"]',row).value,id=$('[data-item-field="ref"]',row).value,price=$('[data-item-field="price"]',row);let value=0;
    if(type==='Produto')value=num(data().products.find(x=>x.id===id)?.salePrice);else value=num(data().services.find(x=>x.id===id)?.price);
    row.dataset.tablePrice=String(value);row.dataset.unitCost=String(type==='Produto'?num(data().products.find(product=>product.id===id)?.cost):0);if(id)window.MarcoMoney?.setValue(price,value);updateOrderFormTotal();
  };
  function itemTablePrice(type,ref){const catalog=type==='Produto'?data().products.find(x=>x.id===ref):data().services.find(x=>x.id===ref);return type==='Produto'?num(catalog?.salePrice):num(catalog?.price);}
  function orderFormFinancialBreakdown(form=document.querySelector('form[data-form="order"]')){
    const out={services:0,products:0,productCost:0,productGrossProfit:0,itemDiscount:0,generalDiscount:0,total:0};
    if(!form)return out;
    $$('.item-editor-row',form).forEach(row=>{const type=$('[data-item-field="type"]',row)?.value==='Produto'?'Produto':'Serviço',ref=$('[data-item-field="ref"]',row)?.value||'',q=Math.max(0,num($('[data-item-field="qty"]',row)?.value)),sold=Math.max(0,num($('[data-item-field="price"]',row)?.value)),table=Math.max(0,num(row.dataset.tablePrice)||itemTablePrice(type,ref));const subtotal=q*sold;if(type==='Produto'){const rawUnitCost=Number(row.dataset.unitCost),unitCost=Math.max(0,Number.isFinite(rawUnitCost)?rawUnitCost:num(data().products.find(x=>x.id===ref)?.cost));out.products+=subtotal;out.productCost+=q*unitCost;out.productGrossProfit+=subtotal-q*unitCost;}else out.services+=subtotal;out.itemDiscount+=Math.max(0,(table-sold)*q);});
    out.generalDiscount=Math.max(0,num(form.elements.discount?.value));out.total=Math.max(0,out.services+out.products-out.generalDiscount);return out;
  }
  function orderFormFinalValue(form=document.querySelector('form[data-form="order"]')){return orderFormFinancialBreakdown(form).total;}
  function paymentRowsValue(form,exclude=null){return $$('.payment-editor-row',form).filter(row=>row!==exclude).reduce((sum,row)=>sum+Math.max(0,num($('[data-payment-field="value"]',row)?.value)),0);}
  function suggestedPaymentValue(form,exclude=null){return Math.max(0,orderFormFinalValue(form)-paymentRowsValue(form,exclude));}
  function syncSuggestedPaymentRows(form=document.querySelector('form[data-form="order"]')){$$('.payment-editor-row[data-payment-auto-suggested="true"]',form).forEach(row=>{if(row.dataset.paymentManual==='true'||row.dataset.paymentId)return;const input=$('[data-payment-field="value"]',row);window.MarcoMoney?.setValue(input,suggestedPaymentValue(form,row));});refreshPaymentRows();}
  updateOrderFormTotal = function(){
    const form=$('form[data-form="order"]');if(!form)return;
    $$('.item-editor-row',form).forEach(row=>{const q=num($('[data-item-field="qty"]',row)?.value),p=num($('[data-item-field="price"]',row)?.value),sub=q*p;const el=$('[data-item-field="subtotal"]',row);if(el)window.MarcoMoney?.setValue(el,sub);});
    const f=orderFormFinancialBreakdown(form),gross=f.services+f.products;
    const set=(id,value)=>{const el=$(id);if(el)el.textContent=currency(value);};
    set('#order-form-services',f.services);set('#order-form-products',f.products);set('#order-form-product-cost',f.productCost);set('#order-form-product-profit',f.productGrossProfit);set('#order-form-item-discount',f.itemDiscount);set('#order-form-general-discount',f.generalDiscount);set('#order-form-gross',gross);set('#order-form-total',f.total);
    const itemHint=$('#items-empty-hint');if(itemHint)itemHint.classList.toggle('is-hidden',$$('.item-editor-row',form).length>0);
    syncSuggestedPaymentRows(form);
  };

  function paymentEditorRow(p={}){
    const method=p.paymentMethod||'Pix',status=recordFinancialStatus(p),planned=!!p.dueDate&&!p.paymentDate,auto=p.__suggested===true&&!p.id;
    const value=window.MarcoMoney?.formatNumber(num(p.value))||currency(num(p.value)),fee=window.MarcoMoney?.formatNumber(num(p.fee))||currency(num(p.fee));
    return `<div class="payment-editor-row" data-payment-id="${attr(p.id||'')}" data-payment-auto-suggested="${auto?'true':'false'}" data-payment-manual="${p.id?'true':'false'}"><div class="payment-row-main"><div class="field money-field"><label>Valor líquido</label><input type="text" inputmode="numeric" data-money="true" data-payment-field="value" value="${attr(value)}"></div><div class="field"><label>Forma de pagamento</label><select data-payment-field="method">${PAYMENT_METHODS.map(x=>`<option ${x===method?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Data do pagamento</label><input type="date" data-payment-field="paymentDate" value="${attr(p.paymentDate||'')}"></div><label class="check-field"><input type="checkbox" data-payment-field="planned" ${planned?'checked':''}><span>Pagamento com data combinada</span></label><div class="field due-field ${planned?'':'is-hidden'}"><label>Data de vencimento</label><input type="date" data-payment-field="dueDate" value="${attr(p.dueDate||'')}"><small class="inline-field-error" data-payment-due-error hidden>Informe a data de vencimento do pagamento combinado.</small></div></div><div class="payment-row-secondary"><div class="field money-field fee-field ${/débito|crédito/i.test(method)?'':'is-hidden'}"><label>Taxa da maquininha</label><input type="text" inputmode="numeric" data-money="true" data-payment-field="fee" value="${attr(fee)}"></div><div class="field payment-note"><label>Observação</label><input data-payment-field="notes" value="${attr(p.notes||'')}"></div><div class="payment-status-box"><small>Status</small><span data-payment-status>${statusBadge(status)}</span></div><div class="payment-gross-box"><small>Valor bruto</small><strong data-payment-gross>${currency(num(p.value)+num(p.fee))}</strong></div><button type="button" class="icon-btn danger payment-delete" data-action="remove-payment-row" title="Cancelar/remover pagamento">${icon('trash')}</button></div></div>`;
  }
  function orderDraftFromForm(form){
    const values=Object.fromEntries(new FormData(form));
    values.items=$$('.item-editor-row',form).map(row=>({id:row.dataset.itemId,type:$('[data-item-field="type"]',row).value,ref:$('[data-item-field="ref"]',row).value,quantity:$('[data-item-field="qty"]',row).value,unitPrice:$('[data-item-field="price"]',row).value,lowerStock:$('[data-item-field="stock"]',row)?.checked}));
    values.payments=$$('.payment-editor-row',form).map(row=>readPaymentRow(row));values.__draft=true;values.__id=form.dataset.id||form.dataset.reservedCode||'';values.clientSearch=form.querySelector('[data-client-search]')?.value||'';return values;
  }
  function readPaymentRow(row){
    const g=key=>$(`[data-payment-field="${key}"]`,row);
    return {id:row.dataset.paymentId||'',value:num(g('value')?.value),paymentMethod:g('method')?.value||'Pix',paymentDate:g('paymentDate')?.value||'',dueDate:g('planned')?.checked?(g('dueDate')?.value||''):'',fee:num(g('fee')?.value),notes:g('notes')?.value||''};
  }
  function renderPaymentRows(orderId,prefill){
    const list=prefill?.payments||(!prefill?.__draft&&orderId?orderPayments(orderId).filter(p=>normalizeText(p.type)==='receita'&&!paymentIsCancelled(p)):[]);
    return list.map(paymentEditorRow).join('');
  }

  function existingPhotoEditorHtml219(photos,orderId){
    if(!photos.length)return '<div class="empty compact-empty" data-existing-photo-empty>Nenhuma foto vinculada.</div>';
    return photos.map(meta=>`<article class="media-card edit-media-card" data-existing-media-card data-media-id="${attr(meta.id)}" data-media-kind="photo"><div class="edit-media-image-shell"><span class="media-loading" data-media-loading>Carregando…</span><img data-edit-media-image data-media-id="${attr(meta.id)}" alt="Foto vinculada à ${attr(orderId)}"></div><div class="edit-media-caption"><strong>${esc(meta.fileName||'Foto')}</strong><small>${meta.createdAt?formatDate(String(meta.createdAt).slice(0,10)):'Data não informada'}</small></div><div class="edit-media-actions"><button type="button" class="icon-btn" data-action="view-existing-media" data-media="${attr(meta.id)}" title="Visualizar foto" aria-label="Visualizar foto">${icon('eye',16)}</button><button type="button" class="icon-btn danger" data-action="stage-delete-existing-media" data-media="${attr(meta.id)}" title="Excluir foto" aria-label="Excluir foto">${icon('trash',16)}</button></div></article>`).join('');
  }
  function existingAttachmentEditorHtml219(attachments){
    if(!attachments.length)return '<div class="empty compact-empty" data-existing-attachment-empty>Nenhum anexo técnico vinculado.</div>';
    return attachments.map(meta=>`<div class="existing-attachment-row" data-existing-media-card data-media-id="${attr(meta.id)}" data-media-kind="attachment"><div><strong>${esc(meta.fileName||'Anexo técnico')}</strong><small>${meta.createdAt?formatDate(String(meta.createdAt).slice(0,10)):'Data não informada'}</small></div><div class="existing-attachment-actions"><button type="button" class="btn ghost compact" data-action="view-existing-media" data-media="${attr(meta.id)}">Visualizar</button><button type="button" class="btn secondary compact danger-text" data-action="stage-delete-existing-media" data-media="${attr(meta.id)}">Excluir</button></div></div>`).join('');
  }
  async function hydrateOrderFormMedia219(form){
    if(!form)return;form.__mediaObjectUrls=form.__mediaObjectUrls||[];
    for(const img of form.querySelectorAll('[data-edit-media-image]')){
      const card=img.closest('[data-existing-media-card]'),loading=card?.querySelector('[data-media-loading]'),found=findMedia(img.dataset.mediaId);
      try{
        const blob=found?await getMediaBlob(found.meta):null;
        if(!blob)throw new Error('Arquivo não disponível localmente nem no Drive.');
        const url=URL.createObjectURL(blob);form.__mediaObjectUrls.push(url);img.src=url;img.hidden=false;if(loading)loading.hidden=true;
      }catch(error){if(loading){loading.textContent='Não foi possível carregar';loading.dataset.error='true';}card?.classList.add('media-load-error');console.warn('Falha ao carregar miniatura:',error);}
    }
  }
  function releaseOrderFormMediaUrls219(form){for(const url of [...(form?.__mediaObjectUrls||[]),...(form?.__stagedPhotoUrls||[])])URL.revokeObjectURL(url);if(form){form.__mediaObjectUrls=[];form.__stagedPhotoUrls=[];}}
  async function stageExistingMediaDeletion219(form,mediaId){
    const found=findMedia(mediaId);if(!form||!found)return;
    const kind=found.meta.kind==='photo'?'foto':'anexo';
    if(!await confirmAction(`Remover esta ${kind} da OSV? A exclusão será confirmada quando a OSV for salva.`))return;
    form.__pendingMediaDeletes=form.__pendingMediaDeletes||new Set();form.__pendingMediaDeletes.add(mediaId);
    const card=form.querySelector(`[data-existing-media-card][data-media-id="${CSS.escape(mediaId)}"]`);if(card){card.hidden=true;card.dataset.pendingDelete='true';}
    const pending=form.querySelector('[data-pending-media-deletes]');if(pending){pending.hidden=false;pending.textContent=`${form.__pendingMediaDeletes.size} arquivo(s) marcado(s) para exclusão ao salvar.`;}
    markOrderPdfDirty219(form);scheduleOrderDraft219(form);
  }
  async function finalizePendingMediaDeletes219(order,removed){
    if(!removed.length)return {removed:0,pendingDrive:0};
    let pendingDrive=0;data().settings.pendingDriveCleanup=Array.isArray(data().settings.pendingDriveCleanup)?data().settings.pendingDriveCleanup:[];
    for(const meta of removed){
      if(meta.localKey)await MarcoStorage.deleteMedia(meta.localKey).catch(error=>console.warn('Falha ao excluir mídia local:',error));
      if(meta.driveFileId&&GoogleDriveMarco.isConfigured()){
        try{await GoogleDriveMarco.trash(meta.driveFileId);}
        catch(error){pendingDrive++;data().settings.pendingDriveCleanup.push({id:`cleanup_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,orderId:order.id,mediaId:meta.id,driveFileId:meta.driveFileId,fileName:meta.fileName||'',createdAt:nowIso(),error:String(error?.message||error)});}
      }
    }
    await persist(removed.some(x=>x.kind==='photo')?'Foto removida':'Anexo removido',`${order.id} · ${removed.length} arquivo(s) removido(s)${pendingDrive?` · ${pendingDrive} limpeza(s) do Drive pendente(s)`:''}`);
    if(pendingDrive)toast('A mídia foi removida da OSV, mas a limpeza no Google Drive ficou pendente.','warn');
    return {removed:removed.length,pendingDrive};
  }

  openOrderForm = function(id='',prefill={}){
    const existing=id?findOrder(id):null,draft=prefill?.__draft?prefill:null,o=existing||draft||prefill||{};
    const code=id||prefill.__id||nextCode('OSV',data().serviceOrders),selectedClient=o.clientId||'';
    const items=draft?.items?.map(x=>({id:x.id,type:x.type,productId:x.type==='Produto'?x.ref:'',serviceId:x.type==='Serviço'?x.ref:'',quantity:x.quantity,unitPrice:x.unitPrice,subtotal:num(x.quantity)*num(x.unitPrice),lowerStock:x.lowerStock}))||(existing?orderItems(id):[]);
    const photos=existing?.photos||[],attachments=existing?.attachments||[];
    const clientSearch=selectedClient?findClient(selectedClient)?.name||'':'';
    const viewPdfButton=existing?`<button type="button" class="btn secondary" data-action="view-current-pdf" data-id="${attr(existing.id)}">${icon('eye')} Visualizar PDF</button>`:`<button type="button" class="btn secondary" data-action="save-order-followup" data-followup="view-pdf">${icon('eye')} Visualizar PDF</button>`;
    openModal(existing?'Editar OSV':'Nova OSV',`<form class="osv-form" data-form="order" data-id="${attr(existing?.id||'')}" data-reserved-code="${attr(code)}"><input type="hidden" name="sourceAppointmentId" value="${attr(o.sourceAppointmentId||'')}"><div class="osv-code-preview"><span>Número reservado</span><strong>${esc(code)}</strong><button type="button" class="icon-btn" data-action="copy-code" data-code="${attr(code)}" title="Copiar código">${icon('documents')}</button></div><div class="form-grid order-general"><div class="field full client-picker"><label>Cliente *</label><div class="client-search-row"><input type="search" data-client-search role="combobox" aria-expanded="false" aria-autocomplete="list" aria-controls="client-suggestions-${attr(code)}" autocomplete="off" placeholder="Digite o primeiro nome" value="${attr(clientSearch)}"><input type="hidden" name="clientId" value="${attr(selectedClient)}" data-client-id><div class="client-suggestions" id="client-suggestions-${attr(code)}" role="listbox" hidden></div><button type="button" class="btn secondary compact inline-add-button" data-action="new-client-from-order" aria-label="Adicionar novo cliente" title="Adicionar novo cliente">${icon('plus')}</button></div></div>${field('Data de abertura','openedAt',o.openedAt||today(),'date','required')}${field('Data de conclusão','completedAt',o.completedAt||'','date')}${selectField('Status operacional','status',OPERATIONAL_STATUSES,canonicalOperationalStatus(o.status||'Orçamento'))}<div class="field equipment-type-field"><label>Tipo de equipamento</label><div class="inline-add-row"><select name="equipmentType"><option value="">Selecione</option>${equipmentTypeOptions(o.equipmentType||'')}</select><button type="button" class="btn secondary compact inline-add-button add-new-type-button" data-action="new-equipment-type" aria-label="Adicionar novo tipo de equipamento" title="Adicionar novo tipo de equipamento">${icon('plus')}</button></div></div>${field('Marca / Modelo','brandModel',o.brandModel||'')}${field('Número de série','serialNumber',o.serialNumber||'')}${field('Senha de acesso','accessPassword',o.accessPassword||'','text','autocomplete="off"')}${field('Acessórios deixados','accessories',o.accessories||'')}</div><div class="form-grid technical-fields">${textarea('Defeito relatado','reportedIssue',o.reportedIssue||'',true)}${textarea('Laudo técnico','technicalReport',o.technicalReport||'',true)}${textarea('Observações para o cliente','clientNotes',o.clientNotes||'',true)}${textarea('Observação interna','internalNotes',o.internalNotes||'',true)}</div><section class="form-section"><div class="section-heading"><div><h3>Itens e Serviços</h3><p>Serviços e produtos cobrados do cliente.</p></div><button type="button" class="btn secondary compact" data-action="add-item-row">${icon('plus')} Adicionar item/serviço</button></div><div class="item-editor-head"><span>Tipo</span><span>Item</span><span>Quantidade</span><span>Valor unitário</span><span>Subtotal</span><span>Baixar estoque</span><span></span></div><div id="order-items-editor">${items.map(orderItemRow).join('')}</div>${items.length?'':'<div class="empty compact-empty" id="items-empty-hint">Nenhum item adicionado. O total começa em R$ 0,00.</div>'}<div class="order-financial-breakdown"><h4>Resumo financeiro</h4><div><span>Total em Serviços</span><strong id="order-form-services">${currency(items.filter(it=>it.type==='Serviço').reduce((s,it)=>s+num(it.subtotal),0))}</strong></div><div><span>Total em Produtos</span><strong id="order-form-products">${currency(items.filter(it=>it.type==='Produto').reduce((s,it)=>s+num(it.subtotal),0))}</strong></div><div><span>Custo dos Produtos Vendidos</span><strong id="order-form-product-cost">${currency(items.filter(it=>it.type==='Produto').reduce((s,it)=>s+num(it.quantity)*num(Number.isFinite(Number(it.unitCost))?it.unitCost:data().products.find(p=>p.id===it.productId)?.cost),0))}</strong></div><div><span>Lucro Bruto dos Produtos</span><strong id="order-form-product-profit">${currency(items.filter(it=>it.type==='Produto').reduce((sum,it)=>sum+num(it.subtotal)-num(it.quantity)*num(Number.isFinite(Number(it.unitCost))?it.unitCost:data().products.find(p=>p.id===it.productId)?.cost),0))}</strong></div><div><span>Desconto por Item</span><strong id="order-form-item-discount">${currency(items.reduce((s,it)=>s+Math.max(0,((num(it.tablePrice)||itemTablePrice(it.type,it.productId||it.serviceId))-num(it.unitPrice))*num(it.quantity)),0))}</strong></div><label class="money-field"><span>Desconto Geral</span><input class="discount-input" data-field="general-discount" name="discount" type="text" inputmode="numeric" data-money="true" value="${attr((window.MarcoMoney?.formatNumber(num(o.discount))||currency(num(o.discount))))}"></label><div><span>Total Bruto</span><strong id="order-form-gross">${currency(items.reduce((s,it)=>s+num(it.subtotal),0))}</strong></div><div class="final"><span>Total Final</span><strong id="order-form-total">${currency(o.total||0)}</strong></div><strong id="order-form-general-discount" hidden>${currency(num(o.discount))}</strong></div></section><section class="form-section"><div class="section-heading"><div><h3>Pagamentos</h3><p>Vários meios de pagamento, vencimentos e taxas sem duplicidade.</p></div><button type="button" class="btn secondary compact" data-action="add-payment-row">${icon('plus')} Adicionar pagamento</button></div><div id="order-payments-editor">${renderPaymentRows(existing?.id,draft)}</div><div class="empty compact-empty ${renderPaymentRows(existing?.id,draft)?'is-hidden':''}" id="payments-empty-hint">Nenhum pagamento informado.</div></section><section class="form-section"><div class="section-heading"><div><h3>Fotos</h3><p>${photos.length} foto(s) já vinculada(s).</p></div></div><div class="field full photo-add-field"><div class="toolbar"><div class="toolbar-left"><label class="btn secondary compact file-button">${icon('camera')} Tirar foto<input type="file" accept="image/*" capture="environment" data-photo-input="camera" hidden></label><label class="btn ghost compact file-button">${icon('upload')} Da galeria<input type="file" accept="image/*" multiple data-photo-input="gallery" hidden></label></div></div><div class="media-grid existing-media-editor" data-existing-photo-stage>${existingPhotoEditorHtml219(photos,code)}</div><div class="media-grid staged-media-editor" data-photo-stage></div><div class="pending-media-delete-note" data-pending-media-deletes hidden></div><input type="file" name="photos" multiple hidden data-photos-merged></div></section><section class="form-section compact-attachments osv-technical-attachments"><div class="section-heading"><div><h3>Anexos técnicos</h3><p>${attachments.length} anexo(s) já vinculado(s).</p></div><label class="btn secondary compact file-button">${icon('upload')} Anexar laudo<input name="attachments" type="file" multiple hidden></label></div><div class="existing-attachments-editor" data-existing-attachment-stage>${existingAttachmentEditorHtml219(attachments)}</div></section><footer class="form-actions osv-form-actions"><div class="pdf-state-indicator" data-pdf-state="idle" data-pdf-status role="status" aria-live="polite"><span class="pdf-state-icon" aria-hidden="true"></span><span data-pdf-status-text>Gere o PDF quando a OSV estiver pronta.</span></div><button type="button" class="btn secondary action-generate-pdf" data-action="save-order-followup" data-followup="pdf" data-pdf-generate>${icon('pdf')} <span>Gerar PDF</span></button>${viewPdfButton}<button type="button" class="btn success action-whatsapp" data-action="save-order-followup" data-followup="share">${icon('phone')} Enviar WhatsApp</button><button type="button" class="btn secondary action-cancel" data-action="cancel-order-form">Cancelar</button><button type="submit" class="btn primary action-save">Salvar OSV</button></footer></form>`,true);
    requestAnimationFrame(()=>{updateOrderFormTotal();refreshPaymentRows();});
  };

  function refreshPaymentRows(){
    $$('.payment-editor-row').forEach(row=>{
      const method=$('[data-payment-field="method"]',row)?.value||'',planned=$('[data-payment-field="planned"]',row)?.checked,paymentDate=$('[data-payment-field="paymentDate"]',row)?.value||'',dueDate=planned?($('[data-payment-field="dueDate"]',row)?.value||''):'';
      $('.due-field',row)?.classList.toggle('is-hidden',!planned);$('.fee-field',row)?.classList.toggle('is-hidden',!/débito|crédito/i.test(method));
      const dueField=$('.due-field',row),dueError=$('[data-payment-due-error]',row);dueField?.classList.toggle('has-error',!!planned&&!dueDate);if(dueError)dueError.hidden=!planned||!!dueDate;
      const value=num($('[data-payment-field="value"]',row)?.value),fee=/débito|crédito/i.test(method)?num($('[data-payment-field="fee"]',row)?.value):0,gross=$('[data-payment-gross]',row),status=$('[data-payment-status]',row);if(gross)gross.textContent=currency(value+fee);if(status)status.innerHTML=statusBadge(recordFinancialStatus({paymentDate,dueDate,status:'Em aberto'}));
    });
    const payHint=$('#payments-empty-hint');if(payHint)payHint.classList.toggle('is-hidden',$$('.payment-editor-row').length>0);
    const itemHint=$('#items-empty-hint');if(itemHint)itemHint.classList.toggle('is-hidden',$$('.item-editor-row').length>0);
    window.MarcoMoney?.bindAll?.(document.querySelector('#order-payments-editor'));
  }
  function syncPriceHistory(order,newItems){
    const existingByKey=new Map(data().priceHistory.filter(h=>h.orderId===order.id).map(h=>[h.itemId,h]));
    const keep=new Set();
    newItems.forEach(it=>{const catalog=catalogItem(it),key=it.id,record={id:existingByKey.get(key)?.id||`HIS-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,itemId:key,orderId:order.id,clientId:order.clientId,clientName:order.clientName,date:order.openedAt,type:it.type,catalogId:it.productId||it.serviceId,description:catalog?.description||it.description||'',quantity:num(it.quantity),unitPrice:num(it.unitPrice),subtotal:num(it.subtotal),standardPrice:it.type==='Produto'?num(catalog?.salePrice):num(catalog?.price),updatedAt:nowIso()};const old=existingByKey.get(key);if(old)Object.assign(old,record);else data().priceHistory.push(record);keep.add(key);});
    data().priceHistory=data().priceHistory.filter(h=>h.orderId!==order.id||keep.has(h.itemId));
  }
  function collectOrderPayments(form,orderId,clientId){
    const rows=$$('.payment-editor-row',form),seen=new Set(),created=[];
    rows.forEach(row=>{const v=readPaymentRow(row),planned=$('[data-payment-field="planned"]',row)?.checked;if(v.value<=0)return;if(planned&&!v.dueDate){const field=$('.due-field',row),error=$('[data-payment-due-error]',row);field?.classList.add('has-error');if(error)error.hidden=false;$('[data-payment-field="dueDate"]',row)?.focus();throw new Error('Informe a data de vencimento do pagamento combinado.');}let id=v.id;if(!id||!data().payments.some(x=>x.id===id))id=nextCode('REC',[...data().payments,...created]);seen.add(id);const old=data().payments.find(x=>x.id===id);const item={id,code:id,orderId,clientId,type:'Receita',paymentMethod:v.paymentMethod,value:num(v.value),fee:num(v.fee),grossValue:num(v.value)+num(v.fee),paymentDate:v.paymentDate,dueDate:v.dueDate,planned:!!v.dueDate&&!v.paymentDate,notes:v.notes,status:'Em aberto',cancelledAt:'',updatedAt:nowIso(),createdAt:old?.createdAt||nowIso()};item.status=recordFinancialStatus(item);if(old)Object.assign(old,item);else{data().payments.push(item);created.push(item);}});
    data().payments.filter(p=>p.orderId===orderId&&normalizeText(p.type)==='receita'&&!paymentIsCancelled(p)&&!seen.has(p.id)).forEach(p=>{p.status='Cancelado';p.cancelledAt=nowIso();p.cancelReason='Removido da OSV';});
  }
  function collectOrderItems(form,orderId,oldItems){
    const items=[];
    $$('.item-editor-row',form).forEach(row=>{const type=$('[data-item-field="type"]',row).value==='Produto'?'Produto':'Serviço',ref=$('[data-item-field="ref"]',row).value,q=num($('[data-item-field="qty"]',row).value),p=num($('[data-item-field="price"]',row).value);if(!ref||q<=0)return;const previous=oldItems.find(x=>x.id===row.dataset.itemId),previousRef=previous?.productId||previous?.serviceId||'';let itemId=row.dataset.itemId;if(previous&&(previous.type!==type||previousRef!==ref))itemId='';const tablePrice=Math.max(0,num(row.dataset.tablePrice)||itemTablePrice(type,ref));const currentCost=type==='Produto'?num(data().products.find(product=>product.id===ref)?.cost):0,rawUnitCost=Number(row.dataset.unitCost);const unitCost=type==='Produto'?Math.max(0,Number.isFinite(rawUnitCost)?rawUnitCost:currentCost):0;items.push({id:itemId||nextCode('ITM',[...data().orderItems,...items]),orderId,type,productId:type==='Produto'?ref:'',serviceId:type==='Serviço'?ref:'',supplyId:'',quantity:q,tablePrice,unitCost,unitPrice:p,subtotal:q*p,itemDiscount:Math.max(0,(tablePrice-p)*q),lowerStock:type==='Produto'&&!!$('[data-item-field="stock"]',row)?.checked});});
    return items;
  }
  saveOrderForm = async function(form){
    const editingId=form.dataset.id||'';let id=editingId||form.dataset.reservedCode||nextCode('OSV',data().serviceOrders);
    if(!editingId&&findOrder(id)){id=nextCode('OSV',data().serviceOrders);form.dataset.reservedCode=id;const preview=form.querySelector('.osv-code-preview strong');if(preview)preview.textContent=id;}
    const old=editingId?findOrder(editingId):null,oldItems=old?clone(orderItems(id)):[],v=Object.fromEntries(new FormData(form)),client=findClient(v.clientId);if(!client)throw new Error('Selecione um cliente ativo.');
    if(v.completedAt&&v.openedAt&&v.completedAt<v.openedAt)throw new Error('A data de conclusão não pode ser anterior à data de abertura.');
    const status=canonicalOperationalStatus(v.status);if(status==='Concluída'&&!v.completedAt)v.completedAt=today();
    const newItems=collectOrderItems(form,id,oldItems),gross=newItems.reduce((s,it)=>s+num(it.subtotal),0),discount=num(v.discount);if(discount>gross+.005&&!await confirmAction('O desconto é maior que o total bruto. O total final ficará em R$ 0,00. Continuar?'))return;
    let cancellation=null;if(status==='Cancelada'&&old&&canonicalOperationalStatus(old.status)!=='Cancelada'){cancellation=await planOrderCancellation(id,oldItems);if(cancellation.abort)return;const hasNewPayment=$$('.payment-editor-row',form).some(row=>!row.dataset.paymentId&&readPaymentRow(row).value>0);if(hasNewPayment)throw new Error('Não adicione um novo pagamento no mesmo salvamento que cancela a OSV. Salve ou cancele o lançamento separadamente.');}
    const total=Math.max(0,gross-discount),proposedPaid=$$('.payment-editor-row',form).map(readPaymentRow).filter(p=>p.paymentDate).reduce((sum,p)=>sum+num(p.value),0);if(proposedPaid>total+.005&&!await confirmAction(`Os pagamentos somam ${currency(proposedPaid)}, acima do total final de ${currency(total)}. Manter mesmo assim?`))return;
    const storedStockDecision=old?.cancellationEffects?.stock,reverseStock=status==='Cancelada'?(cancellation?cancellation.reverseStock:storedStockDecision!=='mantido'):false;
    const pendingMediaDeletes=new Set(form.__pendingMediaDeletes||[]),oldPhotos=old?.photos||[],oldAttachments=old?.attachments||[];
    const removedMedia=[...oldPhotos,...oldAttachments].filter(meta=>pendingMediaDeletes.has(meta.id));
    if(removedMedia.length)await MarcoStorage.createBackup(STATE,'antes-de-excluir-midia-osv-v2.2.0');
    const orderBreakdown={services:newItems.filter(x=>x.type==='Serviço').reduce((sum,x)=>sum+num(x.subtotal),0),products:newItems.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.subtotal),0),productCost:newItems.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.quantity)*num(x.unitCost),0),itemDiscount:newItems.reduce((sum,x)=>sum+num(x.itemDiscount),0)};const item={id,openedAt:v.openedAt||today(),completedAt:v.completedAt||'',clientId:client.id,clientName:client.name,financialBreakdown:{...orderBreakdown,productGrossProfit:orderBreakdown.products-orderBreakdown.productCost,generalDiscount:discount,total},pdfTemplateId:v.pdfTemplateId||old?.pdfTemplateId||currentProfileSettings().defaultPdfTemplateId||'',pixPayment:window.MarcoPersonalization221?.snapshotPixFromForm?.(form,old?.pixPayment)||old?.pixPayment||{enabled:false},equipmentType:v.equipmentType,brandModel:v.brandModel,serialNumber:v.serialNumber,accessPassword:v.accessPassword,accessories:v.accessories,reportedIssue:v.reportedIssue,technicalReport:v.technicalReport,status,discount,total,clientNotes:v.clientNotes,internalNotes:v.internalNotes,registrationStatus:old?.registrationStatus||'Ativo',photos:oldPhotos.filter(meta=>!pendingMediaDeletes.has(meta.id)),pdfs:old?.pdfs||[],attachments:oldAttachments.filter(meta=>!pendingMediaDeletes.has(meta.id)),sourceAppointmentId:old?.sourceAppointmentId||v.sourceAppointmentId||'',cancellationEffects:old?.cancellationEffects||null,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};
    if(cancellation)item.cancellationEffects={date:nowIso(),payments:cancellation.paymentAction==='cancel'?'estornados':cancellation.paymentAction==='preserve'?'preservados':'nenhum',stock:cancellation.hadAutomaticStock?(cancellation.reverseStock?'revertido':'mantido'):'nenhum'};
    const stockPlan=status==='Cancelada'&&reverseStock?newItems.map(x=>({...x,lowerStock:false})):newItems;
    validateStockPlan(oldItems,stockPlan);if(old)Object.assign(old,item);else data().serviceOrders.push(item);data().orderItems=data().orderItems.filter(x=>x.orderId!==id).concat(newItems);reconcileStock(id,oldItems,stockPlan);syncPriceHistory(item,newItems);collectOrderPayments(form,id,client.id);applyCancellationPaymentDecision(cancellation,id);
    await persist(old?'OSV atualizada':'OSV criada',`${id} · ${client.name}${cancellation?` · ${cancellationAuditText(cancellation)}`:''}`);
    const photos=[...(form.elements.photos?.files||[])],attachments=[...(form.elements.attachments?.files||[])];if(photos.length)await addPhotosToOrder(item,photos);if(attachments.length)await addAttachmentsToOrder(item,attachments);
    if(removedMedia.length)await finalizePendingMediaDeletes219(item,removedMedia);
    form.__pendingMediaDeletes=new Set();
    if(item.sourceAppointmentId){const appt=data().appointments.find(a=>a.id===item.sourceAppointmentId);if(appt){appt.orderId=id;appt.status='Concluído';await persist('Agendamento convertido em OSV',`${appt.id} → ${id}`);}}
    const followup=form.dataset.followup||'';
    await clearOrderDraftAfterSave219(form,id);
    form.dataset.id=id;form.dataset.reservedCode=id;form.dataset.draftKey=orderDraftKey219(id);form.dataset.followup='';
    form.__stagedPhotos=[];const mergedPhotos=form.querySelector('[data-photos-merged]');if(mergedPhotos&&typeof DataTransfer!=='undefined')mergedPhotos.files=new DataTransfer().files;
    if(form.elements.attachments)form.elements.attachments.value='';
    const latestPdf=latestOfficialPdfMeta219(id),currentFingerprint=orderPdfFingerprint219(id);
    setPdfState219(form,latestPdf&&latestPdf.sourceFingerprint===currentFingerprint?'ready':latestPdf?'dirty':'idle');
    toast(`${id} salva com sucesso.`);
    if(followup){
      const viewBtn=form.querySelector('[data-followup="view-pdf"]');if(viewBtn){viewBtn.dataset.action='view-current-pdf';viewBtn.dataset.id=id;delete viewBtn.dataset.followup;}
      if(followup==='pdf')await generatePdfForOrder(id,false);
      else if(followup==='view-pdf')await viewCurrentOrderPdf(id);
      else if(followup==='share')await openOrderShareReview219(id);
      return;
    }
    closeModal({reason:'saved'});renderView();
  };

  function maskDocument(value){const d=digitsOnly(value).slice(0,14);if(d.length<=11)return d.replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');return d.replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');}
  function maskPhone(value){const result=normalizeBrazilianPhone(value);return result.valid?result.formatted:String(value||'');}
  function maskZip(value){return digitsOnly(value).slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');}
  function validCpf(value){const d=digitsOnly(value);if(d.length!==11||/^(\d)\1+$/.test(d))return false;let sum=0;for(let i=0;i<9;i++)sum+=Number(d[i])*(10-i);let r=(sum*10)%11;if(r===10)r=0;if(r!==Number(d[9]))return false;sum=0;for(let i=0;i<10;i++)sum+=Number(d[i])*(11-i);r=(sum*10)%11;if(r===10)r=0;return r===Number(d[10]);}
  function validCnpj(value){const d=digitsOnly(value);if(d.length!==14||/^(\d)\1+$/.test(d))return false;const calc=len=>{const weights=len===12?[5,4,3,2,9,8,7,6,5,4,3,2]:[6,5,4,3,2,9,8,7,6,5,4,3,2];const sum=weights.reduce((s,w,i)=>s+Number(d[i])*w,0),r=sum%11;return r<2?0:11-r;};return calc(12)===Number(d[12])&&calc(13)===Number(d[13]);}
  function cityOptions(uf,selected=''){const cities=CITY_SEED[uf]||[];return cities.map(x=>`<option value="${attr(x)}">${esc(x)}</option>`).join('');}

  openClientForm = function(id=''){
    const c=id?findClient(id):null,uf=c?.state||String(c?.city||'').match(/-\s*([A-Z]{2})$/)?.[1]||'SP',city=c?(c.city||'').replace(/\s*-\s*[A-Z]{2}$/,''):'Catanduva';
    openModal(c?'Editar cliente':'Novo cliente',`<form data-form="client" data-id="${attr(id)}"><div class="osv-code-preview"><span>Identificador</span><strong>${esc(c?.id||nextCode('CLI',data().clients))}</strong></div><div class="form-grid client-form-grid"><div class="field client-name"><label>Nome *</label><input name="name" value="${attr(c?.name||'')}" required></div><div class="field client-phone"><label>Telefone</label><input name="phone" type="tel" value="${attr(c?.phone||'')}" inputmode="tel" autocomplete="tel" data-phone-input><small class="phone-field-hint" data-phone-hint hidden></small></div><div class="field client-document"><label>CPF/CNPJ</label><input name="document" value="${attr(c?.document||'')}" inputmode="numeric" data-mask="document"></div><div class="field client-address"><label>Rua / Endereço</label><input name="address" value="${attr(c?.address||'')}" autocomplete="off" data-address-fast></div><div class="field client-number"><label>Número</label><input name="number" value="${attr(c?.number||'')}" inputmode="numeric" data-number-fast></div><div class="field client-zip"><label>CEP</label><input name="zip" value="${attr(c?.zip||'')}" inputmode="numeric" data-mask="zip" data-zip-fast></div><div class="field full cep-helper"><div class="cep-suggestion-list" data-cep-results></div></div><div class="field client-complement"><label>Complemento</label><input name="complement" value="${attr(c?.complement||'')}"></div><div class="field client-neighborhood"><label>Bairro</label><input name="neighborhood" value="${attr(c?.neighborhood||'')}"></div><div class="field client-city"><label>Cidade</label><input name="city" list="city-options" value="${attr(city)}" data-client-city><datalist id="city-options">${cityOptions(uf,city)}</datalist></div><div class="field client-state"><label>Estado</label><select name="state" data-client-state>${UF_OPTIONS.map(x=>`<option ${x===uf?'selected':''}>${x}</option>`).join('')}</select></div>${textarea('Observação interna','notes',c?.notes||'',true)}</div><div class="form-actions client-form-actions">${id?`<button type="button" class="icon-btn danger" data-action="archive-client-from-form" data-id="${attr(id)}" title="Arquivar cliente (o código ${esc(id)} fica reservado e não é reutilizado)" aria-label="Arquivar cliente">${icon('trash')}</button>`:''}<button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar cliente</button></div></form>`,true);
    requestAnimationFrame(()=>{loadCitiesForState(uf,city);$('form[data-form="client"] [name="name"]')?.focus();});
  };
  async function loadCitiesForState(uf,selected=''){
    const list=$('#city-options');if(!list)return;const fallback=CITY_SEED[uf]||[];list.innerHTML=fallback.map(x=>`<option value="${attr(x)}"></option>`).join('');
    try{const response=await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,{cache:'force-cache'});if(!response.ok)return;const cities=await response.json();if(!Array.isArray(cities))return;list.innerHTML=cities.map(x=>`<option value="${attr(x.nome)}"></option>`).join('');}catch(_){/* fallback manual */}
  }
  saveClientForm = async function(form){
    const id=form.dataset.id||nextCode('CLI',data().clients),old=findClient(id),v=Object.fromEntries(new FormData(form)),name=String(v.name||'').trim();if(!name)throw new Error('Informe o nome do cliente.');
    const doc=digitsOnly(v.document);if(doc&&!(doc.length===11?validCpf(doc):doc.length===14?validCnpj(doc):false)&&!await confirmAction('CPF/CNPJ inválido. Salvar mesmo assim com confirmação administrativa?'))throw new Error('Revise o CPF/CNPJ.');
    if(doc&&data().clients.some(c=>c.id!==id&&digitsOnly(c.document)===doc))throw new Error('Este CPF/CNPJ já está cadastrado para outro cliente.');
    const phoneInput=String(v.phone||'').trim(),phoneResult=phoneInput?normalizeBrazilianPhone(phoneInput):null;if(phoneInput&&!phoneResult.valid)throw new Error(phoneResult.error||'Revise o telefone informado.');
    const zipDigits=digitsOnly(v.zip);if(zipDigits&&zipDigits.length!==8)throw new Error('O CEP precisa conter 8 dígitos.');
    const city=String(v.city||'').trim(),cityOptionsNow=[...form.querySelectorAll('#city-options option')].map(x=>normalizeText(x.value));if(city&&cityOptionsNow.length&&!cityOptionsNow.includes(normalizeText(city))&&!await confirmAction('A cidade informada não foi encontrada na lista da UF selecionada. Salvar como entrada manual?'))throw new Error('Revise Cidade e Estado.');
    const item={id,name,document:doc?maskDocument(doc):'',...(phoneResult?{phone:phoneResult.formatted,phoneNormalized:phoneResult.normalizedDigits,phoneE164:phoneResult.e164,phoneReviewRequired:false}:{phone:'',phoneNormalized:'',phoneE164:'',phoneReviewRequired:false}),state:v.state||'SP',city:[city,v.state].filter(Boolean).join(' - '),address:v.address,number:v.number,neighborhood:v.neighborhood,complement:v.complement,zip:maskZip(zipDigits),notes:v.notes,createdAt:old?.createdAt||today(),status:old?.status||'Ativo'};if(old)Object.assign(old,item);else data().clients.push(item);await persist(old?'Cliente atualizado':'Cliente criado',`${item.id} · ${item.name}`);
    if(PENDING_ORDER_DRAFT){const memoryDraft=PENDING_ORDER_DRAFT;PENDING_ORDER_DRAFT=null;const storedDraft=await MarcoStorage.getDraft?.(orderDraftKey219('new')).catch(()=>null);const draft={...(storedDraft||memoryDraft),clientId:id,clientSearch:item.name,__draft:true};closeModal({reason:'replace-modal'});openOrderForm('',draft);toast('Cliente criado e selecionado na OSV.');return;}
    closeModal();renderView();toast('Cliente salvo.');
  };

  openPaymentForm = function(id='',orderId=''){
    const p=id?data().payments.find(x=>x.id===id):null,o=orderId?findOrder(orderId):findOrder(p?.orderId),suggested=o?orderFinancialInfo(o).balance:0,base=p||{orderId,type:'Receita',value:suggested,paymentMethod:'Pix',paymentDate:today(),dueDate:'',fee:0,notes:''};
    openModal(p?'Editar lançamento':'Novo lançamento',`<form data-form="payment" data-layout-key="payment" data-id="${attr(id)}"><div class="form-grid payment-form-grid"><div class="field"><label>ID do lançamento</label><input readonly value="${attr(p?.id||'Gerado ao salvar')}"></div>${selectField('Tipo','type',['Receita','Despesa'],base.type||'Receita')}<div class="field full"><label>OSV vinculada</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(x=>x.registrationStatus!=='Inativo').sort((a,b)=>String(b.openedAt||'').localeCompare(a.openedAt||'')).map(x=>`<option value="${attr(x.id)}" ${x.id===base.orderId?'selected':''}>${esc(x.id)} · ${esc(x.clientName||'Cliente')}</option>`).join('')}</select></div>${field('Valor líquido','value',window.MarcoMoney?.formatNumber(num(base.value))||currency(num(base.value)),'text','inputmode="numeric" data-money="true" required')}${selectField('Forma de pagamento','paymentMethod',PAYMENT_METHODS,base.paymentMethod||'Pix')}${field('Data do pagamento','paymentDate',base.paymentDate||'','date')}<label class="check-field"><input type="checkbox" name="planned" ${base.dueDate&&!base.paymentDate?'checked':''}><span>Pagamento com data combinada</span></label><div class="field payment-due ${base.dueDate&&!base.paymentDate?'':'is-hidden'}"><label>Data de vencimento</label><input name="dueDate" type="date" value="${attr(base.dueDate||'')}"><small class="inline-field-error" data-payment-due-error hidden>Informe a data de vencimento do pagamento combinado.</small></div><div class="field money-field payment-fee ${/débito|crédito/i.test(base.paymentMethod||'')?'':'is-hidden'}"><label>Taxa da maquininha</label><input name="fee" type="text" inputmode="numeric" data-money="true" value="${attr(window.MarcoMoney?.formatNumber(num(base.fee))||currency(num(base.fee)))}"></div><div class="field"><label>Situação</label><select name="settlementState" data-payment-settlement><option value="open" ${paymentIsPaid(base)?'':'selected'}>Em aberto</option><option value="paid" ${paymentIsPaid(base)?'selected':''}>Pago</option></select><small data-payment-status-preview>${esc(recordFinancialStatus(base))}</small></div>${field('Nome da despesa','expenseName',base.expenseName||'','text','placeholder="Preenchido quando o tipo for Despesa"')}${field('Local da compra','localPurchase',base.localPurchase||'','text','placeholder="Fornecedor, loja ou estabelecimento"')}${field('Categoria da despesa','expenseCategory',base.expenseCategory||'Outro','text')}${textarea('Observação','notes',base.notes||'',true)}${p?`<label class="check-field full"><input type="checkbox" name="cancelled" ${paymentIsCancelled(p)?'checked':''}><span>Cancelar lançamento mantendo histórico</span></label>`:''}</div><div class="payment-summary"><span>Valor líquido: <strong data-payment-net>${currency(base.value)}</strong></span><span>Taxa: <strong data-payment-fee-total>${currency(base.fee)}</strong></span><span>Valor total cobrado na maquininha: <strong data-payment-gross-total>${currency(num(base.value)+num(base.fee))}</strong></span></div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar lançamento</button></div></form>`,true);
  };
  savePaymentForm = async function(form){
    const v=Object.fromEntries(new FormData(form)),type=v.type==='Despesa'?'Despesa':'Receita',prefix=type==='Despesa'?'DES':'REC',id=form.dataset.id||nextCode(prefix,data().payments),old=data().payments.find(x=>x.id===id),order=findOrder(v.orderId);
    const settlementState=v.settlementState==='paid'?'paid':'open';let paymentDate=settlementState==='paid'?(v.paymentDate||today()):'';if(type==='Despesa'&&settlementState==='paid'&&!paymentDate)paymentDate=today();const dueDate=v.planned?v.dueDate||'':'';const value=num(v.value);if(value<=0)throw new Error('Informe um valor líquido maior que zero.');if(v.planned&&!dueDate){const due=form.elements.dueDate,field=due?.closest('.field'),error=field?.querySelector('[data-payment-due-error]');field?.classList.add('has-error');if(error)error.hidden=false;due?.focus();throw new Error('Informe a data de vencimento do pagamento combinado.');}if(order&&isCancelledOrder(order)&&!v.cancelled)throw new Error('Não é possível adicionar pagamento ativo a uma OSV cancelada.');if(old&&paymentIsCancelled(old)&&v.cancelled&&settlementState==='paid')throw new Error('Remova o cancelamento antes de marcar este lançamento como Pago.');
    if(type==='Receita'&&order&&paymentDate&&!v.cancelled){const paidWithoutCurrent=orderPayments(order.id).filter(p=>p.id!==id&&normalizeText(p.type)==='receita'&&paymentIsPaid(p)).reduce((sum,p)=>sum+num(p.value),0);if(paidWithoutCurrent+value>num(order.total)+.005&&!await confirmAction(`O pagamento ultrapassa o saldo da ${order.id}. Confirmar valor acima do total?`))return;}
    const priorCancellation=old?.cancelledAt?{cancelledAt:old.cancelledAt,cancelReason:old.cancelReason||'',restoredAt:nowIso()}:null;const cancellationHistory=Array.isArray(old?.cancellationHistory)?old.cancellationHistory.slice():[];if(priorCancellation&&!v.cancelled&&!cancellationHistory.some(x=>x.cancelledAt===priorCancellation.cancelledAt))cancellationHistory.push(priorCancellation);const item={id,code:id,orderId:v.orderId||'',clientId:order?.clientId||old?.clientId||'',type,paymentMethod:v.paymentMethod,value,fee:/débito|crédito/i.test(v.paymentMethod)?num(v.fee):0,grossValue:value+(/débito|crédito/i.test(v.paymentMethod)?num(v.fee):0),paymentDate,dueDate,planned:!!dueDate&&!paymentDate,expenseName:String(v.expenseName||'').trim(),localPurchase:String(v.localPurchase||'').trim(),expenseCategory:String(v.expenseCategory||'Outro').trim()||'Outro',notes:v.notes,externalReference:old?.externalReference||`${v.orderId||'AVULSO'}:${id}`,createdAt:old?.createdAt||nowIso(),updatedAt:nowIso(),cancelledAt:v.cancelled?old?.cancelledAt||nowIso():'',cancelReason:v.cancelled?(old?.cancelReason||'Cancelado pelo usuário'):'',cancellationHistory,status:'Em aberto'};item.status=v.cancelled?'Cancelado':recordFinancialStatus(item);if(old)Object.assign(old,item);else data().payments.push(item);await persist(old?'Lançamento atualizado':'Lançamento criado',`${item.id} · ${currency(item.value)}`);closeModal();renderView();toast('Lançamento salvo e vínculos recalculados.');
  };
  function mitOrderBreakdown(order){
    const stored=order?.financialBreakdown;
    if(stored&&typeof stored==='object'){
      const services=num(stored.services),products=num(stored.products),productCost=num(stored.productCost),itemDiscount=num(stored.itemDiscount),generalDiscount=num(stored.generalDiscount??order.discount),total=num(stored.total??order.total);
      return {services,products,productCost,productGrossProfit:num(stored.productGrossProfit??(products-productCost)),itemDiscount,generalDiscount,total};
    }
    const items=orderItems(order.id),services=items.filter(x=>x.type==='Serviço').reduce((sum,x)=>sum+num(x.subtotal),0),products=items.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.subtotal),0),productCost=items.filter(x=>x.type==='Produto').reduce((sum,x)=>sum+num(x.quantity)*num(Number.isFinite(Number(x.unitCost))?x.unitCost:data().products.find(p=>p.id===x.productId)?.cost),0),itemDiscount=items.reduce((sum,x)=>sum+Math.max(0,((num(x.tablePrice)||itemTablePrice(x.type,x.productId||x.serviceId))-num(x.unitPrice))*num(x.quantity)),0);
    return {services,products,productCost,productGrossProfit:products-productCost,itemDiscount,generalDiscount:num(order.discount),total:num(order.total)};
  }
  function mitFinanceIndicators(){
    const completed=data().serviceOrders.filter(orderNotCancelled).filter(o=>canonicalOperationalStatus(o.status)==='Concluída').filter(o=>matchesUnifiedPeriod(o.completedAt||o.openedAt||o.createdAt,'finance'));
    const breakdowns=completed.map(mitOrderBreakdown);
    const serviceRevenue=breakdowns.reduce((sum,row)=>sum+row.services,0);
    const productRevenue=breakdowns.reduce((sum,row)=>sum+row.products,0);
    const rows=data().payments.filter(p=>!paymentIsCancelled(p)).filter(p=>matchesUnifiedPeriod(p.paymentDate||p.dueDate||p.createdAt,'finance'));
    const paidExpenses=rows.filter(p=>normalizeText(p.type)==='despesa'&&paymentIsPaid(p));
    const isTax=p=>/imposto|tribut|taxa|darf|das\b|icms|iss|ipi|pis|cofins/i.test([p.expenseCategory,p.expenseName,p.notes].filter(Boolean).join(' '));
    const taxes=paidExpenses.filter(isTax).reduce((sum,p)=>sum+num(p.value),0);
    const expenses=paidExpenses.filter(p=>!isTax(p)).reduce((sum,p)=>sum+num(p.value),0);
    const receivable=data().serviceOrders.filter(orderNotCancelled).filter(o=>matchesUnifiedPeriod(orderFinancialInfo(o).dueDate||o.openedAt||o.createdAt,'finance')).reduce((sum,o)=>sum+orderFinancialInfo(o).balance,0);
    const totalRevenue=serviceRevenue+productRevenue;
    return {serviceRevenue,productRevenue,totalRevenue,expenses,taxes,balance:totalRevenue-expenses-taxes,receivable};
  }
  renderFinance = function(){
    const mode=getViewMode('finance');
    data().payments.forEach(p=>{if(!paymentIsCancelled(p))p.status=recordFinancialStatus(p);});
    const list=[...data().payments].filter(p=>matches(p.id,p.code,p.type,p.paymentMethod,p.status,p.notes,p.orderId,findOrder(p.orderId)?.clientName)).filter(p=>matchesUnifiedPeriod(p.paymentDate||p.dueDate||p.createdAt,'finance')).sort((a,b)=>String(b.paymentDate||b.dueDate||b.createdAt||'').localeCompare(String(a.paymentDate||a.dueDate||a.createdAt||'')));
    const k=mitFinanceIndicators();
    return `<div class="grid kpis mit-finance-kpis"><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receita de Serviços</small><strong>${currency(k.serviceRevenue)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('stock')}</div><div><small>Receita de Produtos</small><strong>${currency(k.productRevenue)}</strong></div></div><div class="card kpi"><div class="kpi-icon green">${icon('finance')}</div><div><small>Receita Total</small><strong>${currency(k.totalRevenue)}</strong></div></div><div class="card kpi"><div class="kpi-icon red">${icon('finance')}</div><div><small>Despesas</small><strong>${currency(k.expenses)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('documents')}</div><div><small>Impostos</small><strong>${currency(k.taxes)}</strong></div></div><div class="card kpi"><div class="kpi-icon blue">${icon('finance')}</div><div><small>Saldo</small><strong>${currency(k.balance)}</strong></div></div><div class="card kpi"><div class="kpi-icon orange">${icon('agenda')}</div><div><small>Valores a Receber</small><strong>${currency(k.receivable)}</strong></div></div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-payment">${icon('plus')} Novo lançamento</button><button class="btn secondary" data-action="export-finance">${icon('download')} Exportar CSV</button>${unifiedPeriodControls('finance')}</div><div class="toolbar-right">${viewModeSwitcher('finance',mode)}<span class="badge blue">${list.length} lançamentos</span></div></div><section class="card view-mode-content mode-${mode}" data-view-content="finance"><div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>ID</th><th>Tipo</th><th>Cliente / OSV</th><th>Forma</th><th>Status</th><th>Taxa</th><th class="text-right">Valor líquido</th><th></th></tr></thead><tbody>${list.map(p=>{const o=findOrder(p.orderId),st=recordFinancialStatus(p);return `<tr><td>${formatDate(p.paymentDate||p.dueDate)}</td><td><strong>${esc(p.code||p.id)}</strong></td><td>${statusBadge(p.type)}</td><td>${o?`<button class="text-link" data-action="view-client" data-id="${attr(o.clientId)}">${esc(o.clientName||'Cliente')}</button><button class="code-link" data-action="view-order" data-id="${attr(o.id)}">${esc(o.id)}</button>`:esc(p.notes||'Sem OSV vinculada')}</td><td>${esc(p.paymentMethod||'—')}</td><td>${statusBadge(st)}</td><td>${currency(p.fee)}</td><td class="text-right"><strong class="${normalizeText(p.type)==='despesa'?'danger-text':'success-text'}">${normalizeText(p.type)==='despesa'?'- ':''}${currency(p.value)}</strong></td><td><div class="actions"><button data-action="edit-payment" data-id="${attr(p.id)}">${icon('edit')}</button><button title="Cancelar mantendo histórico" data-action="cancel-payment" data-id="${attr(p.id)}">${icon('warning')}</button><button title="Excluir definitivamente e remover do Borion" data-action="delete-payment" data-id="${attr(p.id)}">${icon('trash')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="9"><div class="empty">Nenhum lançamento encontrado.</div></td></tr>'}</tbody></table></div></section>`;
  };

  function historyForCatalog(kind,id){return data().priceHistory.filter(h=>h.catalogId===id&&normalizeText(h.type)===normalizeText(kind)).sort((a,b)=>String(b.date||'').localeCompare(a.date||''));}
  openServiceForm = function(id=''){const x=id?data().services.find(v=>v.id===id):null,h=x?historyForCatalog('Serviço',id):[];openModal(x?'Editar serviço':'Novo serviço',`<form data-form="service" data-layout-key="service" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(x?.id||nextCode('SRV',data().services))}</strong></div><div class="form-grid one-column">${field('Descrição do serviço *','description',x?.description||'','text','required')}${field('Preço padrão','price',num(x?.price).toFixed(2),'number','step="0.01" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div>${x?`<section class="form-section"><h3>Histórico de preços e execuções</h3>${h.slice(0,12).map(r=>`<div class="list-row"><div class="list-row-main"><strong>${currency(r.unitPrice)} · ${esc(r.clientName||'Cliente')}</strong><small>${formatDate(r.date)} · ${esc(r.orderId)}</small></div></div>`).join('')||'<div class="empty compact-empty">Sem execuções registradas.</div>'}</section>`:''}<div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar serviço</button></div></form>`,true);};
  saveServiceForm = async function(form){const id=form.dataset.id||nextCode('SRV',data().services),old=data().services.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),item={id,description:String(v.description||'').trim(),price:num(v.price),status:v.status||'Ativo',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(!item.description)throw new Error('Informe a descrição do serviço.');if(old)Object.assign(old,item);else data().services.push(item);await persist(old?'Serviço atualizado':'Serviço criado',`${id} · ${item.description}`);closeModal();renderView();toast('Serviço salvo.');};
  function marginPrice(cost,margin){return margin>=.99?cost/.01:cost/(1-Math.max(0,margin));}
  openProductForm = function(id=''){const x=id?data().products.find(v=>v.id===id):null,margin=Math.round(num(x?.margin??.5)*10000)/100,current=x?stockOf('Produto',x.id):0,h=x?historyForCatalog('Produto',id):[];openModal(x?'Editar produto':'Novo produto',`<form data-form="product" data-layout-key="product" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(x?.id||nextCode('PRD',data().products))}</strong></div><div class="form-grid product-form-grid">${field('Descrição *','description',x?.description||'','text','required')}${field('Marca','brand',x?.brand||'')}${field('Fornecedor','supplier',x?.supplier||'')}${field('Custo','cost',num(x?.cost).toFixed(2),'number','step="0.01" min="0" data-product-cost') }<div class="field full margin-slider"><label>Margem bruta: <strong data-margin-label>${margin}%</strong></label><input name="margin" type="range" min="0" max="99" step="0.01" value="${margin}" data-product-margin><small>Preço = custo / (1 - margem). 100% é matematicamente impossível.</small></div>${field('Preço de venda','salePrice',num(x?.salePrice||marginPrice(num(x?.cost),margin/100)).toFixed(2),'number','step="0.01" min="0" data-product-price')}${x?`<div class="field"><label>Estoque atual</label><input readonly value="${attr(current)}"></div>`:field('Estoque inicial','initialStock',0,'number','step="1" min="0"')}${field('Estoque mínimo (opcional)','minimumStock',x?.minimumStock??'','number','step="1" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}<div class="field"><label>Última atualização</label><input readonly value="${attr(formatDate(x?.costUpdatedAt||today()))}"></div></div>${x?`<section class="form-section"><h3>Histórico de preços e vendas</h3><p class="muted">Preço efetivamente cobrado e preço padrão vigente em cada OSV.</p>${h.slice(0,20).map(r=>`<div class="list-row"><div class="list-row-main"><strong>${currency(r.unitPrice)} cobrado · ${esc(r.clientName||'Cliente')}</strong><small>${formatDate(r.date)} · ${esc(r.orderId)} · padrão ${currency(r.standardPrice)} · qtd. ${num(r.quantity)}</small></div><button type="button" class="code-link" data-action="view-order" data-id="${attr(r.orderId)}">Abrir OSV</button></div>`).join('')||'<div class="empty compact-empty">Sem vendas registradas.</div>'}</section>`:''}<div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar produto</button></div></form>`,true);};
  saveProductForm = async function(form){const id=form.dataset.id||nextCode('PRD',data().products),old=data().products.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),cost=num(v.cost),margin=Math.min(.99,Math.max(0,num(v.margin)/100)),salePrice=num(v.salePrice),item={id,description:String(v.description||'').trim(),brand:v.brand,supplier:v.supplier,cost,margin,suggestedPrice:marginPrice(cost,margin),salePrice,initialStock:0,minimumStock:v.minimumStock===''?'':num(v.minimumStock),costUpdatedAt:today(),priceUpdatedAt:today(),status:v.status||'Ativo',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(!item.description)throw new Error('Informe a descrição do produto.');if(old&&Math.abs(num(old.cost)-cost)>.005)data().costHistory.push({id:`CST-${Date.now()}`,catalogType:'Produto',catalogId:id,date:nowIso(),oldCost:num(old.cost),newCost:cost});if(old)Object.assign(old,item);else{data().products.push(item);const initial=num(v.initialStock);if(initial>0)data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:'Produto',productId:id,supplyId:'',movementType:'Entrada',quantity:initial,date:today(),orderId:'',notes:'Estoque inicial do cadastro',stockBefore:0,stockAfter:initial,sourceItemId:'',origin:'initial-stock'});}await persist(old?'Produto atualizado':'Produto criado',`${id} · ${item.description}`);closeModal();renderView();toast('Produto salvo.');};
  openSupplyForm = function(id=''){const x=id?data().supplies.find(v=>v.id===id):null,current=x?stockOf('Insumo',x.id):0;openModal(x?'Editar insumo':'Novo insumo',`<form data-form="supply" data-layout-key="supply" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(x?.id||nextCode('INS',data().supplies))}</strong></div><div class="form-grid one-column">${field('Descrição *','description',x?.description||'','text','required')}${field('Marca','brand',x?.brand||'')}${field('Fornecedor','supplier',x?.supplier||'')}${field('Custo','cost',num(x?.cost).toFixed(2),'number','step="0.01" min="0"')}${x?`<div class="field"><label>Estoque atual</label><input readonly value="${attr(current)}"></div>`:field('Estoque inicial','initialStock',0,'number','step="1" min="0"')}${field('Estoque mínimo (opcional)','minimumStock',x?.minimumStock??'','number','step="1" min="0"')}${selectField('Status','status',['Ativo','Inativo'],x?.status||'Ativo')}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Salvar insumo</button></div></form>`,true);};
  saveSupplyForm = async function(form){const id=form.dataset.id||nextCode('INS',data().supplies),old=data().supplies.find(x=>x.id===id),v=Object.fromEntries(new FormData(form)),cost=num(v.cost),item={id,description:String(v.description||'').trim(),brand:v.brand,supplier:v.supplier,cost,initialStock:0,minimumStock:v.minimumStock===''?'':num(v.minimumStock),costUpdatedAt:today(),status:v.status||'Ativo',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(!item.description)throw new Error('Informe a descrição do insumo.');if(old&&Math.abs(num(old.cost)-cost)>.005)data().costHistory.push({id:`CST-${Date.now()}`,catalogType:'Insumo',catalogId:id,date:nowIso(),oldCost:num(old.cost),newCost:cost});if(old)Object.assign(old,item);else{data().supplies.push(item);const initial=num(v.initialStock);if(initial>0)data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:'Insumo',productId:'',supplyId:id,movementType:'Entrada',quantity:initial,date:today(),orderId:'',notes:'Estoque inicial do cadastro',stockBefore:0,stockAfter:initial,sourceItemId:'',origin:'initial-stock'});}await persist(old?'Insumo atualizado':'Insumo criado',`${id} · ${item.description}`);closeModal();renderView();toast('Insumo salvo.');};

  openStockMovementForm = function(id=''){
    const m=id?data().stockMovements.find(x=>x.id===id):null;
    if(m?.sourceItemId)throw new Error('Movimentações automáticas devem ser ajustadas editando a OSV de origem.');
    const base=m||{itemType:'Produto',movementType:'Entrada',quantity:1,date:today(),orderId:'',notes:''},selected=base.productId||base.supplyId||'',code=m?.id||nextCode('MOV',data().stockMovements);
    openModal(m?'Editar movimentação':'Movimentar estoque',`<form data-form="stock-movement" data-layout-key="stock-movement" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID da movimentação</span><strong>${esc(code)}</strong></div><div class="form-grid movement-form-grid">${selectField('Tipo do item','itemType',['Produto','Insumo'],base.itemType||'Produto','data-stock-type')}<div class="field"><label>Item *</label><select name="itemId" required data-stock-item>${itemReferenceOptions(base.itemType||'Produto',selected)}</select></div>${selectField('Tipo de movimento','movementType',['Entrada','Saída'],base.movementType||'Entrada')}${field('Quantidade *','quantity',base.quantity||1,'number','step="0.01" min="0.01" required')}${field('Data','date',base.date||today(),'date')}<div class="field full"><label>OSV vinculada</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(o=>o.registrationStatus!=='Inativo').slice().reverse().map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></div>${textarea('Observação','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">${m?'Salvar alteração':'Registrar movimentação'}</button></div></form>`,true);
  };

  function catalogServicesPts(){const mode=getViewMode('catalog'),list=data().services.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.price)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table"><thead><tr><th>Serviço</th><th>Preço padrão</th><th>Execuções</th><th>Status</th><th></th></tr></thead><tbody>${list.map(x=>`<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)}</small></td><td>${currency(x.price)}</td><td>${historyForCatalog('Serviço',x.id).length}</td><td>${statusBadge(x.status)}</td><td><div class="actions"><button data-action="edit-service" data-id="${attr(x.id)}">${icon('edit')}</button><button data-action="toggle-catalog-status" data-kind="service" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button></div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Nenhum serviço cadastrado.</div></td></tr>'}</tbody></table></div></section>`;}
  function productSortStorageKey(){let id='default';try{id=activeProfile()?.id||STATE?.activeProfileId||'default';}catch(_){}return `marco-product-sort:${id}`;}
  function hydrateProductSort(){try{const saved=JSON.parse(sessionStorage.getItem(productSortStorageKey())||'null');if(saved&&['product','supplier','cost','margin','sale','stock','minimum'].includes(saved.key)&&['default','desc','asc'].includes(saved.direction))PRODUCT_SORT=saved;}catch(_){}return PRODUCT_SORT;}
  function saveProductSort(){try{sessionStorage.setItem(productSortStorageKey(),JSON.stringify(PRODUCT_SORT));}catch(_){}}
  function productSortHeader(key,label){const state=hydrateProductSort(),active=state.key===key&&state.direction!=='default',direction=active?state.direction:'default',aria=direction==='desc'?'descending':direction==='asc'?'ascending':'none',indicator=direction==='desc'?'↓':direction==='asc'?'↑':'⇅',title=direction==='default'?`Ordenar ${label}: maior para menor`:`${label}: ${direction==='desc'?'maior para menor':'menor para maior'}. Clique para ${direction==='desc'?'menor para maior':'voltar ao padrão'}.`;return `<th aria-sort="${aria}"><button type="button" class="product-sort-button ${active?'is-active':''}" data-action="product-sort" data-sort-key="${attr(key)}" title="${attr(title)}"><span>${esc(label)}</span><span class="product-sort-indicator" aria-hidden="true">${indicator}</span></button></th>`;}
  function productTextCompare(a,b,key,direction){const av=String(a[key]||'').trim(),bv=String(b[key]||'').trim();if(key==='supplier'){if(!av&&!bv)return 0;if(!av)return 1;if(!bv)return -1;}const cmp=av.localeCompare(bv,'pt-BR',{sensitivity:'base',numeric:true});return direction==='desc'?-cmp:cmp;}
  function numericWithMissing(a,b,getter,direction){const av=getter(a),bv=getter(b),am=av===''||av==null||!Number.isFinite(Number(av)),bm=bv===''||bv==null||!Number.isFinite(Number(bv));if(am&&bm)return 0;if(am)return 1;if(bm)return -1;const diff=Number(av)-Number(bv);return direction==='desc'?-diff:diff;}
  function stockHealthCompare(a,b,direction){const stockA=stockOf('Produto',a.id),stockB=stockOf('Produto',b.id),healthA=MarcoStockHealth.getStockHealth(stockA,a.minimumStock),healthB=MarcoStockHealth.getStockHealth(stockB,b.minimumStock),urgent={critical:0,warning:1,normal:2,unset:3},healthy={normal:0,warning:1,critical:2,unset:3},rank=direction==='desc'?urgent:healthy,rankDiff=(rank[healthA.level]??9)-(rank[healthB.level]??9);if(rankDiff)return rankDiff;if(healthA.level==='unset')return String(a.description||'').localeCompare(String(b.description||''),'pt-BR',{sensitivity:'base'});const stockDiff=Number(stockA)-Number(stockB);return direction==='desc'?stockDiff:-stockDiff;}
  function sortedProductsForCatalog(source){return source.slice();}
  function catalogProductsPts(){const mode=getViewMode('catalog'),base=data().products.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.brand,x.supplier)),list=sortedProductsForCatalog(base);return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table product-table-v227"><thead><tr>${productSortHeader('product','Produto')}${productSortHeader('supplier','Fornecedor')}${productSortHeader('cost','Custo')}${productSortHeader('margin','Margem')}${productSortHeader('sale','Venda')}${productSortHeader('stock','Estoque')}${productSortHeader('minimum','Mínimo')}<th>Ações</th></tr></thead><tbody>${list.map(x=>{const stock=stockOf('Produto',x.id),hasMin=x.minimumStock!==''&&x.minimumStock!=null,health=MarcoStockHealth.getStockHealth(stock,x.minimumStock);return `<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)} · ${esc(x.brand||'Sem marca')}</small></td><td>${esc(x.supplier||'—')}</td><td>${currency(x.cost)}</td><td>${(num(x.margin)*100).toFixed(1).replace('.',',')}%</td><td>${currency(x.salePrice)}</td><td><span class="stock-health-badge ${health.tone}">${esc(health.label)}</span><small class="muted">${stock}</small></td><td>${hasMin?num(x.minimumStock):'—'}</td><td><div class="actions"><button title="Atualizar custo" data-action="update-cost" data-kind="product" data-id="${attr(x.id)}">${icon('finance')}</button><button title="Editar produto" data-action="edit-product" data-id="${attr(x.id)}">${icon('edit')}</button><button title="${x.status==='Inativo'?'Restaurar':'Arquivar'} produto" data-action="toggle-catalog-status" data-kind="product" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="8"><div class="empty">Nenhum produto cadastrado.</div></td></tr>'}</tbody></table></div></section>`;}

  function catalogSuppliesPts(){const mode=getViewMode('catalog'),list=data().supplies.filter(x=>(SHOW_ARCHIVED.catalog?x.status==='Inativo':x.status!=='Inativo')&&matches(x.id,x.description,x.brand,x.supplier)).sort((a,b)=>String(a.description||'').localeCompare(String(b.description||''),'pt-BR'));return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table"><thead><tr><th>Insumo</th><th>Fornecedor</th><th>Custo</th><th>Estoque</th><th>Mínimo</th><th></th></tr></thead><tbody>${list.map(x=>{const stock=stockOf('Insumo',x.id),hasMin=x.minimumStock!==''&&x.minimumStock!=null,health=MarcoStockHealth.getStockHealth(stock,x.minimumStock);return `<tr><td><strong>${esc(x.description)}</strong><small class="muted">${esc(x.id)} · ${esc(x.brand||'Sem marca')}</small></td><td>${esc(x.supplier||'—')}</td><td>${currency(x.cost)}</td><td><span class="stock-health-badge ${health.tone}">${esc(health.label)}</span><small class="muted">${stock}</small></td><td>${hasMin?num(x.minimumStock):'—'}</td><td><div class="actions"><button title="Atualizar custo" data-action="update-cost" data-kind="supply" data-id="${attr(x.id)}">${icon('finance')}</button><button data-action="edit-supply" data-id="${attr(x.id)}">${icon('edit')}</button><button data-action="toggle-catalog-status" data-kind="supply" data-id="${attr(x.id)}">${icon(x.status==='Inativo'?'check':'folder')}</button></div></td></tr>`;}).join('')||'<tr><td colspan="6"><div class="empty">Nenhum insumo cadastrado.</div></td></tr>'}</tbody></table></div></section>`;}
  function movementsPts(){
    const mode=getViewMode('catalog'),list=[...data().stockMovements].filter(m=>matches(m.id,m.itemType,m.movementType,m.orderId,m.notes,itemForMovement(m)?.description)).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
    return `<section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table movements-table-v254"><thead><tr><th>ID</th><th>Data</th><th>Item</th><th>Tipo</th><th>Quantidade</th><th>Estoque Antes → Estoque Depois</th><th>OSV</th><th>Observação</th><th>Ações</th></tr></thead><tbody>${list.map(m=>`<tr><td><strong>${esc(m.id)}</strong></td><td>${formatDate(m.date)}</td><td><strong>${esc(itemForMovement(m)?.description||m.productId||m.supplyId||'—')}</strong><small class="muted">${esc(m.itemType)} · ${m.sourceItemId?'Automática':'Manual'}</small></td><td>${statusBadge(m.movementType)}</td><td>${num(m.quantity)}</td><td><strong>${Number.isFinite(Number(m.stockBefore))?num(m.stockBefore):'—'} → ${Number.isFinite(Number(m.stockAfter))?num(m.stockAfter):'—'}</strong></td><td>${m.orderId?`<button class="code-link" data-action="view-order" data-id="${attr(m.orderId)}">${esc(m.orderId)}</button>`:'—'}</td><td>${esc(m.notes||'—')}</td><td><div class="actions">${m.sourceItemId?`<button data-action="view-order" data-id="${attr(m.orderId)}" title="Abrir OSV">${icon('link')}</button>`:`<button data-action="edit-stock-movement" data-id="${attr(m.id)}" title="Editar movimentação">${icon('edit')}</button><button data-action="delete-stock-movement" data-id="${attr(m.id)}" title="Excluir movimentação">${icon('trash')}</button>`}</div></td></tr>`).join('')||'<tr><td colspan="9"><div class="empty">Nenhuma movimentação cadastrada.</div></td></tr>'}</tbody></table></div></section>`;
  }
  renderCatalog = function(){const tab=ACTIVE_TAB.catalog||'services',mode=getViewMode('catalog'),archived=[...data().products,...data().services,...data().supplies].filter(x=>x.status==='Inativo').length;return `<div class="toolbar"><div class="toolbar-left"><div class="tabs"><button class="${tab==='services'?'active':''}" data-action="catalog-tab" data-tab="services">Serviços</button><button class="${tab==='products'?'active':''}" data-action="catalog-tab" data-tab="products">Produtos</button><button class="${tab==='supplies'?'active':''}" data-action="catalog-tab" data-tab="supplies">Insumos</button><button class="${tab==='movements'?'active':''}" data-action="catalog-tab" data-tab="movements">Movimentações</button></div><button class="btn secondary" data-action="toggle-archived-catalog">${SHOW_ARCHIVED.catalog?'Ver ativos':`Inativos (${archived})`}</button></div><div class="toolbar-right">${viewModeSwitcher('catalog',mode)}${tab==='movements'?`<button class="btn primary" data-action="new-stock-movement">${icon('plus')} Movimentar estoque</button>`:`<button class="btn primary" data-action="new-catalog-item">${icon('plus')} Novo cadastro</button>`}</div></div>${tab==='services'?catalogServicesPts():tab==='products'?catalogProductsPts():tab==='supplies'?catalogSuppliesPts():movementsPts()}`;};
  renderStock = renderCatalog;
  openCatalogCreateForActiveTab = function(){if(ACTIVE_TAB.catalog==='services')openServiceForm();else if(ACTIVE_TAB.catalog==='products')openProductForm();else if(ACTIVE_TAB.catalog==='supplies')openSupplyForm();else openStockMovementForm();};

  function openCostUpdate(kind,id){
    const item=kind==='product'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id);if(!item)return;
    const currentMargin=Math.max(0,Math.min(.99,num(item.margin))),currentPrice=num(item.salePrice)||marginPrice(num(item.cost),currentMargin);
    openModal('Atualizar custo',`<form data-form="cost-update" data-kind="${attr(kind)}" data-id="${attr(id)}" data-price-touched="false"><div class="form-grid one-column"><div class="field"><label>Cadastro</label><input readonly aria-readonly="true" value="${attr(item.description)}"></div><div class="field money-field"><label>Custo atual</label><input readonly aria-readonly="true" value="${attr(currency(item.cost))}"></div>${field('Novo custo','newCost',num(item.cost).toFixed(2),'number','step="0.01" min="0" required data-cost-new')}${kind==='product'?`<div class="field margin-field-v254"><div class="field-label-row-v254"><label for="cost-margin-v254">Nova margem bruta</label><strong data-cost-margin-label>${(currentMargin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%</strong></div><input id="cost-margin-v254" name="newMargin" type="range" min="0" max="99" step="0.1" value="${attr((currentMargin*100).toFixed(2))}" data-cost-margin></div><div class="field"><label>Novo preço de venda</label><input name="newPrice" type="number" step="0.01" min="0" value="${attr(currentPrice.toFixed(2))}" data-cost-price required></div><small class="muted">Margem e preço estão interligados: alterar um recalcula o outro.</small>`:''}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Atualizar custo</button></div></form>`);
  }
  async function saveCostUpdate(form){
    const kind=form.dataset.kind,id=form.dataset.id,item=kind==='product'?data().products.find(x=>x.id===id):data().supplies.find(x=>x.id===id),v=Object.fromEntries(new FormData(form));if(!item)throw new Error('Cadastro não encontrado.');
    const oldCost=num(item.cost),newCost=num(v.newCost);
    data().costHistory.push({id:`CST-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,catalogType:kind==='product'?'Produto':'Insumo',catalogId:id,date:nowIso(),oldCost,newCost});
    item.cost=newCost;item.costUpdatedAt=today();
    if(kind==='product'){
      item.salePrice=Math.max(0,num(v.newPrice));
      item.margin=item.salePrice>0?Math.max(0,Math.min(.99,(item.salePrice-newCost)/item.salePrice)):0;
      item.priceUpdatedAt=today();
    }
    await persist('Custo atualizado',`${id}: ${currency(oldCost)} → ${currency(newCost)}`);closeModal();renderView();toast('Custo, preço de venda e histórico atualizados.','ok');
  }

  openStockMovementForm = function(id=''){const m=id?data().stockMovements.find(x=>x.id===id):null;if(m?.sourceItemId)throw new Error('Movimentações automáticas devem ser ajustadas pela OSV de origem.');const base=m||{itemType:'Produto',movementType:'Entrada',quantity:1,date:today(),orderId:'',notes:''},selected=base.productId||base.supplyId||'';openModal(m?'Editar movimentação':'Movimentar estoque',`<form data-form="stock-movement" data-layout-key="movement" data-id="${attr(id)}"><div class="osv-code-preview"><span>ID</span><strong>${esc(m?.id||nextCode('MOV',data().stockMovements))}</strong></div><div class="form-grid movement-grid">${selectField('Tipo do item','itemType',['Produto','Insumo'],base.itemType||'Produto','data-stock-type')}<div class="field"><label>Item *</label><select name="itemId" required data-stock-item>${itemReferenceOptions(base.itemType||'Produto',selected)}</select></div>${selectField('Tipo de movimento','movementType',['Entrada','Saída'],base.movementType||'Entrada')}${field('Quantidade','quantity',base.quantity||1,'number','step="0.01" min="0.01" required')}${field('Data','date',base.date||today(),'date')}<div class="field"><label>OSV vinculada</label><select name="orderId"><option value="">Sem OSV vinculada</option>${data().serviceOrders.filter(o=>o.registrationStatus!=='Inativo').map(o=>`<option value="${attr(o.id)}" ${o.id===base.orderId?'selected':''}>${esc(o.id)} · ${esc(o.clientName||'Cliente')}</option>`).join('')}</select></div>${textarea('Observação','notes',base.notes||'',true)}</div><div class="form-actions"><button type="button" class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary">Registrar movimentação</button></div></form>`,true);};
  saveStockMovement = async function(form){
    const v=Object.fromEntries(new FormData(form)),type=v.itemType==='Insumo'?'Insumo':'Produto',itemId=v.itemId,qty=num(v.quantity),old=form.dataset.id?data().stockMovements.find(x=>x.id===form.dataset.id):null;if(old?.sourceItemId)throw new Error('Movimentação automática só pode ser alterada pela OSV.');if(qty<=0)throw new Error('Informe uma quantidade maior que zero.');const ref={itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:''};if(!itemId||!itemForMovement(ref))throw new Error('Selecione um item válido.');if(v.orderId&&!findOrder(v.orderId))throw new Error('A OSV vinculada não existe.');
    const oldRef=old?(old.itemType==='Produto'?old.productId:old.supplyId):'',sameRef=!!old&&old.itemType===type&&oldRef===itemId,oldEffect=sameRef?(normalizeText(old.movementType)==='entrada'?num(old.quantity):-num(old.quantity)):0,available=stockOf(type,itemId)-oldEffect;if(v.movementType==='Saída'&&qty>available){if(currentProfileSettings().preventNegativeStock)throw new Error(`Saída maior que o estoque disponível (${available}).`);if(!await confirmAction(`Esta saída deixará o estoque negativo (${available-qty}). Continuar?`))return;}
    const item={id:old?.id||nextCode('MOV',data().stockMovements),itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:v.movementType==='Saída'?'Saída':'Entrada',quantity:qty,date:v.date||today(),orderId:v.orderId||'',notes:v.notes,stockBefore:available,stockAfter:available+(v.movementType==='Saída'?-qty:qty),sourceItemId:'',origin:old?.origin||'manual',createdAt:old?.createdAt||nowIso(),updatedAt:nowIso()};if(old)Object.assign(old,item);else data().stockMovements.push(item);recalculateMovementBalances(type,itemId);await persist(old?'Movimentação atualizada':'Estoque movimentado',`${item.movementType} ${qty} · ${itemForMovement(item)?.description||itemId}`);closeModal();renderView();toast('Movimentação salva.');
  };

  renderDocuments = function(){const mode=getViewMode('documents'),termsOn=currentProfileSettings().modules.terms,official=data().serviceOrders.flatMap(o=>{const all=(o.pdfs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))),latest=all.find(m=>m.official!==false&&!isHistoricalPdf219(m))||all.find(m=>m.official!==false&&isHistoricalPdf219(m))||all[0];return latest?[{...latest,order:o}]:[];}).filter(x=>matches(x.fileName,x.order.id,x.order.clientName)).filter(x=>matchesUnifiedPeriod(x.createdAt,'documents'));return `<div class="toolbar"><div class="toolbar-left"><h2>PDFs das OSVs</h2>${unifiedPeriodControls('documents')}${termsOn?`<button class="btn secondary" data-action="new-consent">${icon('signature')} Novo termo</button>`:''}</div><div class="toolbar-right">${viewModeSwitcher('documents',mode)}<span class="badge blue">${official.length} PDFs oficiais</span></div></div><section class="card view-mode-content mode-${mode}"><div class="table-wrap"><table class="table"><thead><tr><th>OSV</th><th>Cliente</th><th>Data/hora</th><th>Arquivo</th><th>Ações</th></tr></thead><tbody>${official.map(x=>`<tr><td><button class="code-link" data-action="view-order" data-id="${attr(x.order.id)}">${esc(x.order.id)}</button></td><td><button class="text-link" data-action="view-client" data-id="${attr(x.order.clientId)}">${esc(x.order.clientName||'Cliente')}</button></td><td>${formatDateTime(x.createdAt)}</td><td><strong>${esc(x.fileName||'Documento.pdf')}</strong></td><td><div class="actions"><button title="Abrir PDF" data-action="open-order-file" data-order="${attr(x.order.id)}" data-media="${attr(x.id)}">${icon('eye')}</button><button title="Enviar ao cliente" data-action="share-order" data-id="${attr(x.order.id)}">${icon('phone')}</button><button title="Abrir cliente" data-action="view-client" data-id="${attr(x.order.clientId)}">${icon('clients')}</button><button title="Abrir OSV" data-action="view-order" data-id="${attr(x.order.id)}">${icon('orders')}</button></div></td></tr>`).join('')||'<tr><td colspan="5"><div class="empty">Nenhum PDF oficial gerado.</div></td></tr>'}</tbody></table></div></section>${termsOn?`<section class="card" style="margin-top:18px"><div class="card-header"><div><h3>Termos e Autorizações</h3><p>Módulo opcional ativo. Registros legados permanecem preservados.</p></div><button class="btn ghost" data-action="documents-terms">Abrir termos</button></div></section>`:''}`;};

  openOrderDetail = function(id){
    const o=findOrder(id);if(!o)return;const c=findClient(o.clientId)||{id:o.clientId,name:o.clientName},items=orderItems(id),payments=orderPayments(id).filter(p=>normalizeText(p.type)==='receita'),f=orderFinancialInfo(o),breakdown=mitOrderBreakdown(o),photos=o.photos||[],pdfs=(o.pdfs||[]).slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))),attachments=o.attachments||[];
    const paymentHtml=payments.length?payments.map(p=>`<div class="list-row"><div class="list-row-main"><strong>${currency(p.value)} · ${esc(p.paymentMethod||'—')}</strong><small>${p.paymentDate?`Pago em ${formatDate(p.paymentDate)}`:p.dueDate?`Vence em ${formatDate(p.dueDate)}`:'Sem data'}${num(p.fee)?` · taxa ${currency(p.fee)} · bruto ${currency(p.grossValue)}`:''}</small></div>${statusBadge(recordFinancialStatus(p))}<div class="actions"><button data-action="edit-payment" data-id="${attr(p.id)}">${icon('edit')}</button><button title="Cancelar mantendo histórico" data-action="cancel-payment" data-id="${attr(p.id)}">${icon('warning')}</button><button title="Excluir definitivamente e remover do Borion" data-action="delete-payment" data-id="${attr(p.id)}">${icon('trash')}</button></div></div>`).join(''):'<div class="empty">Nenhum pagamento vinculado.</div>';
    const mediaList=(list,empty)=>list.length?list.map(m=>`<div class="list-row"><div class="list-row-main"><strong>${esc(m.fileName||'Arquivo')}</strong><small>${formatDateTime(m.createdAt)}</small></div><div class="actions"><button data-action="open-order-file" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('eye')}</button><button data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash')}</button></div></div>`).join(''):`<div class="empty">${empty}</div>`;
    const photosHtml=photos.length?`<div class="media-grid">${photos.map(m=>`<div class="media-card"><img alt="${attr(m.fileName||'Foto da OSV')}" data-media-id="${attr(m.id)}"><div class="media-overlay">${esc(m.fileName||'Foto')}</div><button data-action="delete-media" data-order="${attr(o.id)}" data-media="${attr(m.id)}">${icon('trash',15)}</button></div>`).join('')}</div>`:'<div class="empty">Nenhuma foto vinculada.</div>';
    openModal(`OSV ${o.id}`,`<div class="detail-hero"><div class="toolbar"><div><h2>${esc(o.id)} · ${esc(c.name||o.clientName||'Cliente')}</h2><p>${esc(o.equipmentType||'Equipamento não informado')} ${o.brandModel?`· ${esc(o.brandModel)}`:''}</p></div><div>${statusBadge(o.status)} ${statusBadge(f.status==='Parcial'&&f.overdue?'Parcial - vencido':f.status)}</div></div><div class="detail-meta"><span>Abertura ${formatDate(o.openedAt)}</span><span>${items.length} item(ns)</span><span>Total ${currency(o.total)}</span><span>Pago ${currency(f.paid)}</span><span>Saldo ${currency(f.balance)}</span></div></div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="edit-order" data-id="${attr(o.id)}">${icon('edit')} Editar OSV</button><button class="btn secondary" data-action="new-payment" data-order="${attr(o.id)}">${icon('plus')} Pagamento</button><button class="btn secondary" data-action="generate-pdf" data-id="${attr(o.id)}">${icon('pdf')} Gerar PDF</button><button class="btn success" data-action="share-order" data-id="${attr(o.id)}">${icon('phone')} WhatsApp</button><button class="btn secondary" data-action="add-order-photos" data-mode="camera" data-id="${attr(o.id)}">${icon('camera')} Tirar foto</button><button class="btn ghost" data-action="add-order-photos" data-mode="gallery" data-id="${attr(o.id)}">${icon('upload')} Galeria</button><button class="btn secondary" data-action="add-order-files" data-id="${attr(o.id)}">${icon('upload')} Anexar laudo</button></div></div><div class="detail-grid"><div><section class="card"><div class="card-header"><h3>Equipamento e diagnóstico</h3></div><dl class="definition-list"><dt>Cliente</dt><dd><button class="text-link" data-action="view-client" data-id="${attr(c.id||'')}">${esc(c.name||o.clientName||'—')}</button></dd><dt>Equipamento</dt><dd>${esc(o.equipmentType||'—')}</dd><dt>Marca / Modelo</dt><dd>${esc(o.brandModel||'—')}</dd><dt>Número de série</dt><dd>${esc(o.serialNumber||'—')}</dd><dt>Senha de acesso</dt><dd>${esc(o.accessPassword||'—')} <small class="muted">(não é enviada no PDF)</small></dd><dt>Acessórios</dt><dd>${esc(o.accessories||'—')}</dd><dt>Defeito relatado</dt><dd>${esc(o.reportedIssue||'—')}</dd><dt>Laudo técnico</dt><dd>${esc(o.technicalReport||'—')}</dd><dt>Observações para o cliente</dt><dd>${esc(o.clientNotes||'—')}</dd><dt>Observação interna</dt><dd>${esc(o.internalNotes||'—')} <small class="muted">(não é enviada no PDF)</small></dd></dl></section><section class="card" style="margin-top:16px"><div class="card-header"><div><h3>Itens e Serviços</h3><p>Preço efetivamente praticado nesta OSV.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Descrição</th><th>Qtd.</th><th>Unitário</th><th>Subtotal</th></tr></thead><tbody>${items.map(it=>`<tr><td><strong>${esc(itemDescription(it))}</strong><small class="muted">${esc(it.type)}${it.lowerStock?' · baixa de estoque':''}</small></td><td>${num(it.quantity)}</td><td>${currency(it.unitPrice)}</td><td>${currency(it.subtotal)}</td></tr>`).join('')||'<tr><td colspan="4">Nenhum item.</td></tr>'}</tbody></table></div><div class="order-detail-totals detailed"><span>Serviços <b>${currency(breakdown.services)}</b></span><span>Produtos <b>${currency(breakdown.products)}</b></span><span>Custo dos produtos <b>${currency(breakdown.productCost)}</b></span><span>Lucro bruto dos produtos <b>${currency(breakdown.productGrossProfit)}</b></span><span>Desconto por item <b>${currency(breakdown.itemDiscount)}</b></span><span>Desconto geral <b>${currency(breakdown.generalDiscount)}</b></span><strong>Total final ${currency(breakdown.total)}</strong></div></section><section class="card" style="margin-top:16px"><div class="card-header"><h3>Fotos</h3></div>${photosHtml}</section></div><div><section class="card"><div class="card-header"><div><h3>Financeiro</h3><p>${currency(f.paid)} realizado · ${currency(f.balance)} restante.</p></div></div>${paymentHtml}</section><section class="card" style="margin-top:16px"><div class="card-header"><h3>PDF oficial e históricos</h3></div>${mediaList(pdfs,'Nenhum PDF gerado.')}</section><section class="card" style="margin-top:16px"><div class="card-header"><h3>Anexos técnicos</h3></div>${mediaList(attachments,'Nenhum anexo técnico.')}</section><section class="card" style="margin-top:16px"><div class="card-header"><h3>Movimentações de estoque</h3></div>${data().stockMovements.filter(m=>m.orderId===o.id).map(m=>`<div class="list-row"><div class="list-row-main"><strong>${esc(m.id)} · ${esc(itemForMovement(m)?.description||'Item')}</strong><small>${esc(m.movementType)} ${num(m.quantity)} · ${esc(m.notes||'')}</small></div></div>`).join('')||'<div class="empty">Nenhuma movimentação vinculada.</div>'}</section></div></div>`,true);hydrateMediaImages();
  };

  function timestampFile(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;}
  generatePdfForOrder = async function(){throw new Error('O fluxo de PDF v2.2.13 ainda não foi inicializado.');};


  async function viewCurrentOrderPdf(orderId){
    const order=findOrder(orderId);if(!order)throw new Error('OSV não encontrada.');
    const latest=latestOfficialPdfMeta219(orderId);
    if(!latest)throw new Error('Gere o PDF antes de visualizar.');
    if(!isHistoricalPdf219(latest)&&latest.sourceFingerprint!==orderPdfFingerprint219(orderId))throw new Error('PDF desatualizado — gere novamente.');
    const blob=await getMediaBlob(latest);if(!blob)throw new Error('O PDF não está disponível neste dispositivo.');
    const url=URL.createObjectURL(blob),pixCode='';
    document.querySelector('[data-order-pdf-preview]')?.remove();const overlay=document.createElement('div');overlay.className='pdf-preview-overlay-v221 is-open order-pdf-preview-v224';overlay.dataset.orderPdfPreview='1';overlay.dataset.objectUrl=url;overlay.innerHTML=`<section class="pdf-preview-dialog-v221" role="dialog" aria-modal="true" aria-label="Visualização do PDF da ${attr(order.id)}"><header><div><h2>${esc(order.id)} — PDF oficial</h2>${pixCode?'<p>O código Pix pode ser copiado abaixo; o QR Code também está impresso no documento.</p>':''}</div><button class="modal-close" data-action="close-order-pdf-preview" aria-label="Fechar visualização">×</button></header><iframe title="PDF oficial da ${attr(order.id)}" src="${attr(url)}"></iframe><footer>${pixCode?`<button class="btn secondary" data-action="copy-order-pix" data-order="${attr(order.id)}">Copiar código Pix</button>`:''}<button class="btn secondary" data-action="download-order-pdf" data-order="${attr(order.id)}" data-media="${attr(latest.id)}">Baixar PDF</button><button class="btn primary" data-action="close-order-pdf-preview">Fechar</button></footer></section>`;document.body.appendChild(overlay);
  }

  function menuRow(id,index){const enabled=id!=='agenda'||currentProfileSettings().modules.agenda;return `<div class="menu-order-row" draggable="true" data-menu-id="${id}"><span class="drag-handle">⋮⋮</span><div class="list-row-main"><strong>${esc(MENU_LABELS[id])}</strong><small>${enabled?'Ativo no menu':'Módulo desativado'}</small></div><button class="icon-btn" data-action="move-menu" data-id="${id}" data-dir="-1" ${index===0?'disabled':''}>↑</button><button class="icon-btn" data-action="move-menu" data-id="${id}" data-dir="1" ${index===currentProfileSettings().menuOrder.length-1?'disabled':''}>↓</button></div>`;}
  function settingsCategoryStorageKey(){let id='default';try{id=activeProfile()?.id||STATE?.activeProfileId||'default';}catch(_){}return `marco-settings-category:${id}`;}
  function activeSettingsCategory(){try{const saved=sessionStorage.getItem(settingsCategoryStorageKey());if(SETTINGS_CATEGORIES.some(x=>x[0]===saved))SETTINGS_CATEGORY=saved;}catch(_){}return SETTINGS_CATEGORY;}
  function setSettingsCategory(id){if(!SETTINGS_CATEGORIES.some(x=>x[0]===id))id='personalization';SETTINGS_CATEGORY=id;try{sessionStorage.setItem(settingsCategoryStorageKey(),id);}catch(_){}return id;}
  function settingsNavigation(active){return `<nav class="settings-category-nav" aria-label="Categorias de configurações">${SETTINGS_CATEGORIES.map(([id,title,description,iconName])=>`<button type="button" class="settings-category-button ${id===active?'is-active':''}" data-action="settings-category" data-settings-category="${attr(id)}" aria-current="${id===active?'page':'false'}"><span class="settings-category-icon">${icon(iconName,18)}</span><span><strong>${esc(title)}</strong><small>${esc(description)}</small></span></button>`).join('')}</nav>`;}
  function settingsModulesCard(s){return `<section class="card"><div class="card-header"><div><h2>Módulos</h2><p>Desative módulos sem apagar dados.</p></div></div><label class="list-row"><div class="list-row-main"><strong>Agenda</strong><small>Remove menu e cartões da Visão Geral.</small></div><input type="checkbox" data-module-setting="agenda" ${s.modules.agenda?'checked':''}></label><label class="list-row"><div class="list-row-main"><strong>Termos e Autorizações</strong><small>Oculta o acesso, preservando registros legados.</small></div><input type="checkbox" data-module-setting="terms" ${s.modules.terms?'checked':''}></label></section>`;}
  function settingsPreferencesCard(s){return `<section class="card"><div class="card-header"><div><h2>Preferências visuais e operacionais</h2><p>Persistidas por perfil e separadas dos registros do sistema.</p></div></div><label class="list-row"><div class="list-row-main"><strong>Ocultar valores no painel</strong><small>Mostra •••• no lugar de valores.</small></div><input type="checkbox" data-setting="dashboardPrivacy" ${s.dashboardPrivacy?'checked':''}></label><label class="list-row"><div class="list-row-main"><strong>Impedir estoque negativo</strong><small>Exige confirmação ou bloqueia saída acima do saldo.</small></div><input type="checkbox" data-setting="preventNegativeStock" ${s.preventNegativeStock?'checked':''}></label><div class="list-row"><div class="list-row-main"><strong>Google Drive obrigatório</strong><small>Toda alteração é confirmada na nuvem.</small></div>${statusBadge('Sempre ativo')}</div><div class="list-row"><div class="list-row-main"><strong>Base local</strong><small>Desativada para impedir conflitos entre dispositivos.</small></div>${statusBadge('Desativada')}</div><button class="btn ghost" data-action="reset-all-layouts">Restaurar todos os layouts padrão</button></section>`;}
  // V2.4.0 — perfis de teste: cria uma base 100% em branco (clientes, OSVs,
  // lançamentos, tudo) para testar sem misturar com os dados reais, e evita que a
  // integração com o Borion herde o companyInstanceId/shadow/tombstones do perfil
  // anterior ("lançamentos de outras versões sujando o sistema"). Um "estoque"
  // (stash) por perfil guarda o bridge de cada um, então voltar para o perfil
  // original restaura a conexão dele com o Borion intacta — só o perfil novo
  // nasce realmente zerado, como um CD virgem.
  function blankProfileData(){return clone(window.MARCO_INITIAL_DATA.dataByProfile.marco);}
  function stashCurrentBridge(){
    const activeId=STATE.activeProfileId;if(!activeId)return;
    STATE.profileBridgeStash=STATE.profileBridgeStash||{};
    STATE.profileBridgeStash[activeId]=clone(STATE.interconnections||{});
  }
  function restoreOrResetBridge(profileId,{reset=false}={}){
    STATE.profileBridgeStash=STATE.profileBridgeStash||{};
    if(reset){STATE.interconnections={};return;}
    const stash=STATE.profileBridgeStash[profileId];
    STATE.interconnections=stash?clone(stash):{};
  }
  function createBlankTestProfile(name){
    const id='perfil_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);
    const base=activeProfile();
    const profile={id,name:name||'Teste',role:'Teste',color:base?.color||'#ff642f',pin:'',company:clone(base?.company||{}),createdAt:nowIso()};
    STATE.profiles.push(profile);
    STATE.dataByProfile[id]=blankProfileData();
    return profile;
  }

  // V2.4.0 — "resetar aplicativo por completo": um jeito seguro de zerar TUDO
  // deste dispositivo (todos os perfis, dados e a conexão com o Google Drive)
  // pelo próprio app, em vez de mexer manualmente nas pastas do Drive. Mexer na
  // mão deixa referências de pasta/arquivo velhas presas no navegador (é o que
  // causou os conflitos de reconexão) — resetar por aqui limpa tudo de uma vez,
  // de um jeito que o próprio app sabe recuperar sozinho depois.
  async function factoryResetApp(){
    if(!await confirmAction('Isso vai apagar TUDO deste dispositivo: perfis, clientes, OSVs, lançamentos, fotos locais, rascunhos, backups locais, cache e conexão com o Google Drive. Nada já salvo na nuvem será apagado. Continuar?',{confirmLabel:'Continuar',tone:'danger'}))return;
    if(!await confirmAction('Confirmação final: baixe e guarde o JSON que será criado. Depois do reset, este navegador voltará como uma instalação nova.',{confirmLabel:'Sim, criar backup e resetar',tone:'danger'}))return;
    setSaveStatus('Criando backup de segurança…','warn');
    try{await MarcoStorage.createBackup(STATE,'antes-do-reset-completo');}catch(e){console.warn(e);}
    try{MarcoStorage.downloadJson(STATE,`Marco_Iris_Backup_Antes_Reset_${Date.now()}.json`);}catch(e){console.warn(e);}
    if(GoogleDriveMarco.isConfigured()){
      try{await flushCloudState('antes-reset-completo',{backup:true,retryMedia:true});}catch(e){console.warn('Backup na nuvem antes do reset não foi confirmado:',e);}
    }
    try{window.MarcoBorionInterop?.stop?.();}catch(e){console.warn(e);}
    try{GoogleDriveMarco.disconnect();}catch(e){console.warn(e);}
    try{await MarcoStorage.forgetFolder();}catch(e){console.warn(e);}
    try{for(const registration of await navigator.serviceWorker?.getRegistrations?.()||[])await registration.unregister();}catch(e){console.warn(e);}
    try{for(const name of await caches.keys())if(name.startsWith('marco-iris-'))await caches.delete(name);}catch(e){console.warn(e);}
    await MarcoStorage.wipeAll();
    toast('Instalação local apagada. Recarregando como aplicativo novo…');
    setTimeout(()=>location.replace(`./?instalacao=nova&cache=${Date.now()}`),700);
  }

  function settingsContent(active,{c,drive,diag,s,lastMigration,activeMigration}){
    if(active==='personalization'){const hub=window.MarcoPersonalization221?.renderPersonalizationCards?.()||'';return `<div class="settings-category-content settings-grid">${hub}${settingsModulesCard(s)}${settingsPreferencesCard(s)}</div>`;}
    if(active==='organization')return `<div class="settings-category-content settings-grid"><section class="card full-settings-card"><div class="card-header"><div><h2>Organização do menu lateral</h2><p>Use as setas para definir a ordem. Configurações permanece sempre acessível.</p></div><button class="btn ghost compact" data-action="reset-menu">Restaurar padrão</button></div><div class="menu-order-list" data-menu-order>${s.menuOrder.map(menuRow).join('')}</div></section><section class="card"><div class="card-header"><div><h2>Organização da Visão Geral</h2><p>Os widgets podem ser movidos e redimensionados diretamente no painel.</p></div></div><button class="btn primary" data-action="navigate" data-view="dashboard">Abrir Visão Geral</button></section><section class="card"><div class="card-header"><div><h2>Restauração de organização</h2><p>Retorna os layouts visuais ao padrão sem apagar clientes, OSVs ou lançamentos.</p></div></div><button class="btn danger" data-action="reset-all-layouts">Restaurar layouts padrão</button></section></div>`;
    if(active==='company')return `<div class="settings-category-content settings-grid"><section class="card"><div class="card-header"><div><h2>Dados da empresa</h2><p>Usados nas OSVs, termos e PDFs.</p></div><button class="btn secondary compact" data-action="edit-company">${icon('edit')} Editar</button></div><dl class="definition-list"><dt>Nome</dt><dd><strong>${esc(c.name||'Marco Iris Soluções em Tecnologia')}</strong></dd><dt>Telefone</dt><dd>${esc(c.phone||'—')}</dd><dt>E-mail</dt><dd>${esc(c.email||'—')}</dd><dt>Instagram</dt><dd>${esc(c.instagram||'—')}</dd><dt>Endereço</dt><dd>${esc([c.address,c.number,c.neighborhood,c.city].filter(Boolean).join(', ')||'—')}</dd></dl></section><section class="card"><div class="card-header"><div><h2>Proteção por PIN</h2><p>Trava a interface deste dispositivo sem alterar os dados da conta.</p></div>${activeProfile().pin?statusBadge('PIN ativo'):statusBadge('Sem PIN')}</div><div class="toolbar"><div class="toolbar-left"><button class="btn secondary" data-action="set-pin">${icon('lock')} ${activeProfile().pin?'Alterar PIN':'Definir PIN'}</button>${activeProfile().pin?`<button class="btn secondary" data-action="lock-now">Bloquear agora</button><button class="btn danger" data-action="remove-pin">Remover PIN</button>`:''}</div></div></section></div>`;
    if(active==='backup')return `<div class="settings-category-content settings-grid"><section class="card migration-card" style="border-color:#ff7a45"><div class="card-header"><div><h2>Migração histórica preparada</h2><p>Importa o pacote privado reconciliado sem publicar dados no GitHub.</p></div>${statusBadge('Pacote privado')}</div><div class="migration-actions"><button class="btn primary" style="background:#ff642f;border-color:#ff642f" data-action="open-legacy-migration">${icon('upload')} Selecionar pacote privado e migrar</button></div><div class="migration-summary"><span>290 OSVs</span><span>142 clientes</span><span>824 itens</span><span>295 pagamentos históricos bloqueados no Borion</span></div></section><section class="card migration-card"><div class="card-header"><div><h2>Migração genérica do AppSheet</h2><p>Use apenas para outras importações manuais; não use no pacote histórico preparado.</p></div>${lastMigration?statusBadge(lastMigration.rolledBack?'Desfeita':'Última importação concluída'):statusBadge('Pronta')}</div><div class="migration-actions"><button class="btn primary" data-action="open-migration-picker">${icon('upload')} Selecionar arquivos genéricos</button>${activeMigration?`<button class="btn danger" data-action="rollback-migration">Desfazer última migração ativa</button>`:''}<button class="btn secondary" data-action="export-migration-log">Exportar log técnico</button></div><div class="migration-summary"><span>${data().migrationHistory.length} execução(ões)</span><span>${s.migrationKeys.length} chave(s) idempotentes</span><span>Backup automático antes da gravação</span></div></section><section class="card full-settings-card"><div class="card-header"><div><h2>Google Drive e backups oficiais</h2><p>Dados, fotos, PDFs, anexos e integração em pastas oficiais do Drive.</p></div>${drive?statusBadge('Google conectado'):statusBadge('Google desconectado')}</div><div class="toolbar"><div class="toolbar-left">${drive?`<button class="btn primary" data-action="sync-google">${icon('cloud')} Sincronizar</button><button class="btn secondary" data-action="load-google">Carregar Drive</button><button class="btn danger" data-action="disconnect-google">Desconectar</button>`:`<button class="btn primary" data-action="connect-google">${icon('cloud')} Conectar Google</button>`}<button class="btn secondary" data-action="manual-save">${icon('save')} Salvar tudo</button><button class="btn secondary" data-action="diagnose-drive">${icon('check')} Testar instalação</button><button class="btn secondary" data-action="export-json">${icon('download')} Exportar JSON</button></div></div><div class="migration-summary"><span>Base local: desativada</span><span>Google Drive: obrigatório</span><span>Backups Drive: autosave-1…20 e forcesave-1…20</span><span>Integração: Borion_Integracoes/marco-iris.bridge.json</span></div></section></div>`;
    return `<div class="settings-category-content settings-grid"><section class="card"><div class="card-header"><div><h2>Diagnóstico e integridade</h2><p>Vínculos, totais, estoque e IDs.</p></div>${diag.total?statusBadge(`${diag.total} alerta(s)`):statusBadge('Tudo íntegro')}</div>${diag.issues.length?`<div class="diagnostic-list">${diag.issues.map(i=>`<div class="diagnostic-row ${i.type}"><div>${icon(i.type==='danger'?'warning':'link')}</div><div><strong>${i.count} · ${esc(i.label)}</strong><small>${esc(i.detail)}</small></div></div>`).join('')}</div>`:'<div class="empty compact-empty">Nenhuma inconsistência estrutural encontrada.</div>'}<button class="btn primary" data-action="repair-links">${icon('check')} Corrigir vínculos seguros</button></section><section class="card full-settings-card"><div class="card-header"><div><h2>Perfis de teste</h2><p>Crie uma base 100% em branco — sem clientes, OSVs ou lançamentos, e com a integração do Borion reiniciada — para testar sem misturar com os dados reais.</p></div><span class="badge blue">${STATE.profiles.length} perfil(is)</span></div><div class="list">${STATE.profiles.map(p=>{const isActive=p.id===STATE.activeProfileId,count=(STATE.dataByProfile[p.id]?.payments||[]).length;return `<div class="list-row"><div class="list-row-main"><strong>${esc(p.name)}</strong><small>${isActive?'Ativo agora · ':''}${count} lançamento(s) · criado em ${formatDate((p.createdAt||'').slice(0,10))}</small></div>${isActive?statusBadge('Ativo'):`<div class="actions"><button class="btn secondary compact" data-action="switch-profile" data-id="${attr(p.id)}">Trocar para este</button>${STATE.profiles.length>1?`<button class="icon-btn danger" data-action="delete-profile" data-id="${attr(p.id)}" title="Excluir perfil">${icon('trash')}</button>`:''}</div>`}</div>`;}).join('')}</div><div class="toolbar"><div class="toolbar-left"><button class="btn primary" data-action="new-test-profile">${icon('plus')} Criar perfil de teste em branco</button></div></div><p class="small muted">Cada perfil guarda sua própria conexão com o Borion. Trocar de perfil não afeta a integração do perfil anterior — ao voltar, ela continua como estava.</p></section><section class="card full-settings-card danger-zone-card"><div class="card-header"><div><h2>Zona de risco</h2><p>Apaga tudo deste dispositivo (todos os perfis, clientes, OSVs, lançamentos) e desconecta o Google Drive daqui — sem apagar nada que já esteja salvo na nuvem. Use quando um reset manual pelas pastas do Drive causar conflitos.</p></div></div><button class="btn danger" data-action="factory-reset-app">${icon('warning')} Resetar aplicativo por completo</button><p class="small muted">Baixa um backup automaticamente antes de apagar. Depois de resetar, o app recarrega do zero e você escolhe a pasta do Google Drive de novo (pode ser uma pasta nova ou a mesma de antes).</p></section><section class="card full-settings-card"><div class="card-header"><div><h2>Histórico de ações</h2><p>Últimas alterações registradas com data, hora e detalhes.</p></div><span class="badge blue">${data().audit.length} registro(s)</span></div><div class="audit-list">${data().audit.slice(0,120).map(a=>`<div class="audit-row"><time>${formatDateTime(a.date)}</time><div><strong>${esc(a.action)}</strong><small>${esc(a.detail||'')}</small></div></div>`).join('')||'<div class="empty">Sem histórico.</div>'}</div></section><section class="card"><div class="card-header"><div><h2>Informações do sistema</h2><p>Dados técnicos úteis para suporte e atualização.</p></div></div><dl class="definition-list"><dt>Versão</dt><dd>${PTS_VERSION}</dd><dt>Perfil</dt><dd>${esc(activeProfile()?.name||'—')}</dd><dt>Modo</dt><dd>${navigator.onLine?'Online':'Offline'}</dd></dl></section></div>`;
  }
  renderSettings = function(){const active=setSettingsCategory(activeSettingsCategory()),c=company(),drive=GoogleDriveMarco.cachedUser(),diag=integrityReport(),s=currentProfileSettings(),lastMigration=data().migrationHistory[0],activeMigration=data().migrationHistory.find(x=>!x.rolledBack);return `<div class="settings-shell-v227">${settingsNavigation(active)}<main class="settings-category-panel" data-settings-panel="${attr(active)}">${settingsContent(active,{c,drive,diag,s,lastMigration,activeMigration})}</main></div>`;};


  function detectCsvDelimiter(text){
    const sample=String(text||'').split(/\r?\n/).filter(Boolean).slice(0,8),candidates=[',',';','\t'];let best=',',score=-1;
    for(const delimiter of candidates){const counts=sample.map(line=>{let q=false,n=0;for(let i=0;i<line.length;i++){if(line[i]==='"'){if(q&&line[i+1]==='"')i++;else q=!q;}else if(!q&&line[i]===delimiter)n++;}return n;});const positive=counts.filter(x=>x>0),consistent=positive.length?positive.filter(x=>x===positive[0]).length:0,current=consistent*100+(positive[0]||0);if(current>score){score=current;best=delimiter;}}
    return best;
  }
  function parseCsv(text){
    const delimiter=detectCsvDelimiter(text),rows=[];let row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){const ch=text[i],next=text[i+1];if(ch==='"'){if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===delimiter&&!quoted){row.push(cell.trim());cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell.trim());cell='';if(row.some(Boolean))rows.push(row);row=[];}else cell+=ch;}if(quoted)throw new Error('CSV inválido: aspas não foram fechadas.');if(cell||row.length){row.push(cell.trim());if(row.some(Boolean))rows.push(row);}if(rows.length<2)return [];const headers=rows.shift().map(h=>h.replace(/^\uFEFF/,'').trim());if(headers.some((h,i)=>!h||headers.indexOf(h)!==i))throw new Error('CSV inválido: cabeçalhos vazios ou duplicados.');return rows.map(values=>Object.fromEntries(headers.map((h,i)=>[h,values[i]??''])));}
  function inferEntity(fileName,rows){const name=normalizeText(fileName),headers=normalizeText(Object.keys(rows?.[0]||{}).join(' '));const text=`${name} ${headers}`;if(/cliente|customer/.test(text))return 'clients';if(/ordem|osv|order|defeito|equipamento/.test(text))return 'orders';if(/pagamento|receita|despesa|finance/.test(text))return 'payments';if(/movimenta|movement/.test(text))return 'movements';if(/servico|service/.test(text))return 'services';if(/produto|product/.test(text))return 'products';if(/insumo|supply/.test(text))return 'supplies';return 'unknown';}
  async function sha256File(file){const bytes=await file.arrayBuffer();if(!crypto?.subtle)return `${file.name}:${file.size}:${file.lastModified}`;const hash=await crypto.subtle.digest('SHA-256',bytes);return [...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
  function decodePdfLiteral(value){
    return String(value||'').replace(/\\([nrtbf()\\])/g,(_,c)=>({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f','(':'(',')':')','\\':'\\'}[c]||c)).replace(/\\([0-7]{1,3})/g,(_,o)=>String.fromCharCode(parseInt(o,8))).replace(/\\\r?\n/g,'');
  }
  function decodePdfHex(value){
    const clean=String(value||'').replace(/\s+/g,'');if(!clean)return '';const bytes=[];for(let i=0;i<clean.length;i+=2)bytes.push(parseInt(clean.slice(i,i+2).padEnd(2,'0'),16)||0);
    if(bytes[0]===0xFE&&bytes[1]===0xFF){let out='';for(let i=2;i+1<bytes.length;i+=2)out+=String.fromCharCode((bytes[i]<<8)|bytes[i+1]);return out;}return String.fromCharCode(...bytes);
  }
  function pdfTextOperators(text){
    const out=[];
    for(const m of String(text||'').matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g))out.push(decodePdfLiteral(m[1]));
    for(const m of String(text||'').matchAll(/<([0-9A-Fa-f\s]+)>\s*Tj/g))out.push(decodePdfHex(m[1]));
    for(const m of String(text||'').matchAll(/\[((?:.|\n|\r)*?)\]\s*TJ/g))for(const part of m[1].matchAll(/\(((?:\\.|[^\\)])*)\)|<([0-9A-Fa-f\s]+)>/g))out.push(part[1]!==undefined?decodePdfLiteral(part[1]):decodePdfHex(part[2]));
    return out.join(' ');
  }
  async function inflatePdfStream(bytes){
    if(typeof DecompressionStream!=='function')return '';for(const format of ['deflate','deflate-raw']){try{const stream=new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format)),buffer=await new Response(stream).arrayBuffer();return new TextDecoder('latin1').decode(buffer);}catch(_){}}return '';
  }
  async function extractLegacyPdfText(file){
    const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer),raw=new TextDecoder('latin1').decode(bytes),parts=[pdfTextOperators(raw)];let cursor=0,streams=0;
    while(streams<80){const marker=raw.indexOf('stream',cursor);if(marker<0)break;let start=marker+6;if(raw[start]==='\r'&&raw[start+1]==='\n')start+=2;else if(raw[start]==='\n'||raw[start]==='\r')start+=1;const end=raw.indexOf('endstream',start);if(end<0)break;const dictStart=raw.lastIndexOf('<<',marker),dict=dictStart>=0?raw.slice(dictStart,marker):'',chunk=bytes.slice(start,end);let decoded='';if(/FlateDecode/i.test(dict))decoded=await inflatePdfStream(chunk);else if(!/DCTDecode|JPXDecode|CCITTFaxDecode/i.test(dict))decoded=new TextDecoder('latin1').decode(chunk);if(decoded)parts.push(pdfTextOperators(decoded));cursor=end+9;streams++;}
    return parts.join(' ').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,20000);
  }
  function inferOrderCodeFromText(value){const match=String(value||'').match(/(?:OSV|OAS|OS)[-_ \/:]*(\d+(?:[-_ ]\d+)*)/i);return match?canonicalCode(match[0],'OSV'):'';}
  async function analyzeLegacyMedia(file){
    const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),fromName=inferOrderCodeFromText(file.name),result={inferredOrderId:fromName,inferenceSource:fromName?'nome do arquivo':'',textPreview:'',textConfidence:'none',reviewWarnings:[]};
    if(!isPdf)return result;try{const text=await extractLegacyPdfText(file);result.textPreview=text.slice(0,700);const fromText=inferOrderCodeFromText(text);if(fromText){result.inferredOrderId=fromText;result.inferenceSource=fromName&&fromName===fromText?'nome e conteúdo do PDF':'conteúdo do PDF';}result.textConfidence=fromText&&text.length>80?'alta':text.length>80?'média':text?'baixa':'nenhuma';if(/item|servi[cç]o|produto|subtotal|valor unit[aá]rio/i.test(text))result.reviewWarnings.push('O PDF contém possíveis itens/serviços. Compare com os dados estruturados antes da importação; o texto não será gravado automaticamente.');if(!text)result.reviewWarnings.push('Não foi possível extrair texto confiável deste PDF. Ele será preservado como evidência e exige vínculo manual pela OSV.');}catch(e){result.textConfidence='erro';result.reviewWarnings.push(`Leitura textual do PDF falhou: ${e.message||'erro desconhecido'}. O arquivo original será preservado.`);}return result;
  }
  async function analyzeMigrationFiles(files){
    const analyzed=[];for(const file of files){const lower=file.name.toLowerCase(),isMedia=file.type.startsWith('image/')||/\.(pdf|jpg|jpeg|png|webp|docx?|xlsx?)$/i.test(lower);let rows=[],error='';if(!isMedia||/\.(csv|json)$/i.test(lower)){try{if(/\.csv$/i.test(lower))rows=parseCsv(await file.text());else if(/\.json$/i.test(lower)){const obj=JSON.parse(await file.text());rows=Array.isArray(obj)?obj:Array.isArray(obj.rows)?obj.rows:Array.isArray(obj.data)?obj.data:[obj];}}catch(e){error=e.message;}}const type=isMedia&&!/\.(csv|json)$/i.test(lower)?'media':inferEntity(file.name,rows),mediaInfo=type==='media'?await analyzeLegacyMedia(file):{};analyzed.push({file,hash:await sha256File(file),rows,type,error,...mediaInfo});}return analyzed;
  }
  function migrationCounts(files){const counts={clients:0,orders:0,items:0,payments:0,services:0,products:0,supplies:0,movements:0,media:0,unknown:0,errors:0};files.forEach(x=>{counts[x.type]=(counts[x.type]||0)+(x.type==='media'?1:x.rows.length);if(x.error)counts.errors++;});return counts;}
  function openMigrationReview(){const counts=migrationCounts(MIGRATION_SESSION.files);openModal('Pré-análise da migração',`<div class="migration-review"><div class="grid kpis migration-kpis">${[['clients','Clientes'],['orders','OSVs'],['items','Itens'],['payments','Pagamentos'],['media','Arquivos'],['unknown','Não reconhecidos'],['errors','Erros']].map(([k,l])=>`<div class="card kpi"><div><small>${l}</small><strong>${counts[k]||0}</strong></div></div>`).join('')}</div><section class="card"><div class="card-header"><div><h3>Arquivos reconhecidos</h3><p>Origem à esquerda; destino editável à direita.</p></div></div><div class="migration-file-list">${MIGRATION_SESSION.files.map((x,i)=>`<div class="migration-file-row"><div class="list-row-main"><strong>${esc(x.file.name)}</strong><small>${x.rows.length?`${x.rows.length} linha(s)`:`${Math.round(x.file.size/1024)} KB`}${x.error?` · erro: ${esc(x.error)}`:''}</small></div><select data-migration-file-type="${i}">${[['clients','Clientes'],['orders','OSVs'],['payments','Pagamentos'],['items','Itens das OSVs'],['services','Serviços'],['products','Produtos'],['supplies','Insumos'],['movements','Movimentações'],['media','Fotos/PDFs/Anexos'],['unknown','Ignorar / revisar']].map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div>`).join('')}</div></section><div class="migration-warning">Nenhum registro será gravado nesta etapa. A simulação é obrigatória antes da importação definitiva.</div><div class="form-actions"><button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn primary" data-action="simulate-migration">Simular importação</button></div></div>`,true);}
  function rowValue(row,...aliases){const entries=Object.entries(row||{}),wanted=aliases.map(normalizeText);for(const [k,v] of entries){const nk=normalizeText(k);if(wanted.includes(nk)||wanted.some(w=>nk.includes(w)))return v;}return '';}
  function legacyKey(entity,id,sourceHash,index){return `${entity}:${String(id||'').trim()||`${sourceHash}:${index}`}`;}
  function clientByLegacy(row){const id=canonicalCode(rowValue(row,'id','cliente id','codigo cliente'),'CLI'),name=String(rowValue(row,'nome','cliente','name')||'').trim();return findClient(id)||data().clients.find(c=>normalizeText(c.name)===normalizeText(name));}
  function buildMigrationPlan(){
    const plan={creates:[],updates:[],media:[],ignored:[],conflicts:[],keys:[]};
    MIGRATION_SESSION.files.forEach(source=>{if(source.type==='media'){plan.media.push(source);return;}if(source.type==='unknown'){plan.ignored.push({source,reason:'Tipo não reconhecido'});return;}source.rows.forEach((row,index)=>{const entity=source.type,rawId=rowValue(row,'id','codigo','código','key','_rownumber'),key=legacyKey(entity,rawId,source.hash,index);if(currentProfileSettings().migrationKeys.includes(key)){plan.ignored.push({source,row,reason:'Já importado'});return;}let record=null,targetList=null;
      if(entity==='clients'){const id=importedCode(rawId,'CLI',[...data().clients,...plan.creates.filter(x=>x.entity==='clients').map(x=>x.record)]);record={id,name:String(rowValue(row,'nome','cliente','name')||'Cliente importado').trim(),document:maskDocument(rowValue(row,'cpf','cnpj','documento','cpf cnpj')),...phoneFields(rowValue(row,'telefone','celular','phone')),city:rowValue(row,'cidade','city'),state:rowValue(row,'estado','uf')||'SP',address:rowValue(row,'endereco','rua','address'),number:rowValue(row,'numero','número'),neighborhood:rowValue(row,'bairro'),complement:rowValue(row,'complemento'),zip:maskZip(rowValue(row,'cep')),notes:rowValue(row,'observacao','observação'),status:'Ativo',createdAt:nowIso(),legacyKey:key};targetList=data().clients;}
      else if(entity==='orders'){const id=importedCode(rawId||rowValue(row,'os','oas','osv'),'OSV',[...data().serviceOrders,...plan.creates.filter(x=>x.entity==='orders').map(x=>x.record)]),client=clientByLegacy(row),clientName=rowValue(row,'cliente','nome cliente');if(!client&&!clientName){plan.conflicts.push({source,row,index,reason:'OSV sem cliente identificável'});return;}record={id,openedAt:String(rowValue(row,'data abertura','abertura','data')||today()).slice(0,10),completedAt:String(rowValue(row,'data conclusao','conclusão')||'').slice(0,10),clientId:client?.id||'',clientName:client?.name||clientName,equipmentType:rowValue(row,'tipo equipamento','equipamento'),brandModel:rowValue(row,'marca modelo','modelo','marca'),serialNumber:rowValue(row,'numero serie','serial'),accessPassword:rowValue(row,'senha'),accessories:rowValue(row,'acessorios'),reportedIssue:rowValue(row,'defeito','defeito relatado'),technicalReport:rowValue(row,'laudo','laudo tecnico'),status:canonicalOperationalStatus(rowValue(row,'status')),discount:num(rowValue(row,'desconto')),total:num(rowValue(row,'total','valor')),clientNotes:rowValue(row,'observacao cliente'),internalNotes:rowValue(row,'observacao interna'),registrationStatus:'Ativo',photos:[],pdfs:[],attachments:[],createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};targetList=data().serviceOrders;}
      else if(entity==='payments'){const type=normalizeText(rowValue(row,'tipo'))==='despesa'?'Despesa':'Receita',prefix=type==='Despesa'?'DES':'REC',id=importedCode(rawId,prefix,[...data().payments,...plan.creates.filter(x=>x.entity==='payments').map(x=>x.record)]),orderId=canonicalCode(rowValue(row,'os','oas','osv','ordem'),'OSV'),methodRaw=rowValue(row,'forma pagamento','pagamento','metodo'),method=PAYMENT_METHODS.find(x=>normalizeText(x)===normalizeText(methodRaw))||methodRaw||'Outro';record={id,code:id,orderId,type,paymentMethod:method,value:num(rowValue(row,'valor liquido','valor','total')),fee:num(rowValue(row,'taxa')),grossValue:num(rowValue(row,'valor bruto'))||num(rowValue(row,'valor'))+num(rowValue(row,'taxa')),paymentDate:String(rowValue(row,'data pagamento','pago em')||'').slice(0,10),dueDate:String(rowValue(row,'vencimento','data vencimento')||'').slice(0,10),notes:rowValue(row,'observacao'),status:'Em aberto',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};record.status=recordFinancialStatus(record);targetList=data().payments;}
      else if(entity==='services'){const id=importedCode(rawId,'SRV',[...data().services,...plan.creates.filter(x=>x.entity==='services').map(x=>x.record)]);record={id,description:rowValue(row,'descricao','servico','nome'),price:num(rowValue(row,'preco','valor')),status:'Ativo',legacyKey:key};targetList=data().services;}
      else if(entity==='products'){const id=importedCode(rawId,'PRD',[...data().products,...plan.creates.filter(x=>x.entity==='products').map(x=>x.record)]),cost=num(rowValue(row,'custo')),sale=num(rowValue(row,'preco venda','venda','preco'));record={id,description:rowValue(row,'descricao','produto','nome'),brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost,margin:sale>0?(sale-cost)/sale:.5,salePrice:sale||marginPrice(cost,.5),initialStock:0,minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:'Ativo',legacyKey:key};targetList=data().products;}
      else if(entity==='supplies'){const id=importedCode(rawId,'INS',[...data().supplies,...plan.creates.filter(x=>x.entity==='supplies').map(x=>x.record)]);record={id,description:rowValue(row,'descricao','insumo','nome'),brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost:num(rowValue(row,'custo')),initialStock:0,minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:'Ativo',legacyKey:key};targetList=data().supplies;}
      else if(entity==='movements'){const id=importedCode(rawId,'MOV',[...data().stockMovements,...plan.creates.filter(x=>x.entity==='movements').map(x=>x.record)]),type=/insumo/i.test(rowValue(row,'tipo item'))?'Insumo':'Produto',itemId=canonicalCode(rowValue(row,'item id','produto id','insumo id'),type==='Produto'?'PRD':'INS');record={id,itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:/saida|saída/i.test(rowValue(row,'movimento','tipo'))?'Saída':'Entrada',quantity:num(rowValue(row,'quantidade','qtd')),date:String(rowValue(row,'data')||today()).slice(0,10),orderId:canonicalCode(rowValue(row,'os','oas','osv'),'OSV'),notes:rowValue(row,'observacao'),sourceItemId:'',legacyKey:key};targetList=data().stockMovements;}
      if(!record){plan.ignored.push({source,row,reason:'Sem conversor'});return;}const existing=targetList.find(x=>x.id===record.id||x.legacyKey===key);if(existing)plan.updates.push({entity,record,existing,key});else plan.creates.push({entity,record,key});plan.keys.push(key);
    });});return plan;
  }
  function showMigrationSimulation(){const plan=MIGRATION_SESSION.plan=buildMigrationPlan();openModal('Simulação da migração',`<div class="migration-review"><div class="grid kpis migration-kpis">${[['Inclusões',plan.creates.length],['Atualizações',plan.updates.length],['Arquivos',plan.media.length],['Ignorados',plan.ignored.length],['Conflitos',plan.conflicts.length]].map(([l,v])=>`<div class="card kpi"><div><small>${l}</small><strong>${v}</strong></div></div>`).join('')}</div>${plan.conflicts.length?`<section class="card conflict-card"><h3>Conflitos que exigem revisão</h3>${plan.conflicts.slice(0,20).map(c=>`<div class="list-row"><div class="list-row-main"><strong>${esc(c.source.file.name)} · linha ${c.index+2}</strong><small>${esc(c.reason)}</small></div></div>`).join('')}<p>Corrija o arquivo ou altere o tipo inferido e simule novamente. Conflitos não serão gravados.</p></section>`:'<div class="migration-ok">Nenhum conflito impeditivo foi encontrado.</div>'}<section class="card"><h3>Amostra da conversão</h3>${plan.creates.slice(0,12).map(x=>`<div class="list-row"><div class="list-row-main"><strong>${esc(x.entity)} → ${esc(x.record.id||x.record.fileName||'registro')}</strong><small>${esc(x.record.name||x.record.description||x.record.clientName||'')}</small></div></div>`).join('')||'<div class="empty">Nenhuma inclusão nova.</div>'}</section><div class="form-actions"><button class="btn secondary" data-action="migration-back-analysis">Voltar à análise</button><button class="btn primary" data-action="apply-migration" ${plan.conflicts.length?'disabled':''}>Importar definitivamente</button></div></div>`,true);}

  function entityList(entity){const map={clients:data().clients,orders:data().serviceOrders,items:data().orderItems,payments:data().payments,services:data().services,products:data().products,supplies:data().supplies,movements:data().stockMovements};return map[entity];}
  async function importMigrationMedia(mediaSources,history){
    let linked=0,orphans=0;
    for(const source of mediaSources){
      const file=source.file,match=file.name.match(/(?:OSV|OAS|OS)[-_ ]*(\d+(?:-\d+)*)/i),orderId=canonicalCode(source.targetOrderId||(match?match[0]:''),'OSV'),order=findOrder(orderId);
      if(!order){orphans++;history.mediaOrphans.push({file:file.name,reason:'OSV de destino não encontrada',requestedOrderId:orderId||''});continue;}
      const key=`media:${source.hash}`;
      if(currentProfileSettings().migrationKeys.includes(key))continue;
      const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name),isImage=file.type.startsWith('image/')||/\.(jpg|jpeg|png|webp)$/i.test(file.name),kind=isPdf?'pdf':isImage?'photo':'attachment',blob=await materializeBlob(isImage?await optimizeImage(file):file),record=await MarcoStorage.putMedia(blob,{name:file.name,type:blob.type||file.type}),meta={id:`${kind}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,orderId:order.id,kind,fileName:file.name,localKey:record.id,driveFileId:'',webViewLink:'',createdAt:nowIso(),legacy:true,official:isPdf?false:undefined,migrationKey:key};
      const target=isPdf?(order.pdfs=order.pdfs||[]):isImage?(order.photos=order.photos||[]):(order.attachments=order.attachments||[]);
      target.push(meta);history.media.push({orderId:order.id,id:meta.id,localKey:record.id,key,fileName:file.name,kind});currentProfileSettings().migrationKeys.push(key);linked++;
    }
    return {linked,orphans};
  }
  function importedInitialStockCandidate(type,id,quantity){
    return data().stockMovements.find(m=>m.itemType===type&&(type==='Produto'?m.productId===id:m.supplyId===id)&&normalizeText(m.movementType)==='entrada'&&!m.orderId&&Math.abs(num(m.quantity)-num(quantity))<.0001&&(m.origin==='initial-stock'||/inicial|abertura|saldo inicial/i.test(m.notes||'')));
  }
  function recalculateMovementBalances(type,id){
    const rows=data().stockMovements.filter(m=>m.itemType===type&&(type==='Produto'?m.productId===id:m.supplyId===id)).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.id||'').localeCompare(String(b.id||''),undefined,{numeric:true}));
    let balance=0;for(const m of rows){m.stockBefore=balance;balance+=movementSign(m)*num(m.quantity);m.stockAfter=balance;}
  }
  async function applyMigration(){
    if(!MIGRATION_SESSION?.plan)throw new Error('Execute a simulação antes de importar.');
    const signature=plan=>JSON.stringify([plan.creates.length,plan.updates.length,plan.ignored.length,plan.conflicts.length,plan.media.length]);
    const baseline=signature(MIGRATION_SESSION.plan);for(let i=0;i<5;i++){const check=buildMigrationPlan();if(signature(check)!==baseline)throw new Error('A simulação não foi consistente entre os cinco ciclos de validação.');}
    if(MIGRATION_SESSION.plan.conflicts.length)throw new Error('Resolva os conflitos antes da importação definitiva.');
    await MarcoStorage.createBackup(STATE,'antes-da-migracao-appsheet');
    const history={id:`MIG-${Date.now()}`,createdAt:nowIso(),rolledBack:false,sourceFiles:MIGRATION_SESSION.files.map(x=>({name:x.file.name,hash:x.hash,type:x.type,rows:x.rows.length,inferredOrderId:x.inferredOrderId||'',textConfidence:x.textConfidence||'none'})),created:[],updatedBefore:[],media:[],mediaOrphans:[],keys:[],validationCycles:5,summary:{},warnings:[],affectedOrderIds:[],priceHistoryBefore:[]};
    for(const source of MIGRATION_SESSION.files)for(const message of source.reviewWarnings||[])history.warnings.push({type:'pdf-review',file:source.file.name,orderId:source.inferredOrderId||'',message});
    const preItems=clone(data().orderItems),entityOrder=['clients','services','products','supplies','orders','items','payments','movements'],pendingInitial=[];
    const creates=MIGRATION_SESSION.plan.creates.slice().sort((a,b)=>entityOrder.indexOf(a.entity)-entityOrder.indexOf(b.entity));
    for(const x of creates){
      const list=entityList(x.entity);if(!list)continue;
      if(x.entity==='orders'&&!x.record.clientId&&x.record.clientName){const c=data().clients.find(c=>normalizeText(c.name)===normalizeText(x.record.clientName));if(c)x.record.clientId=c.id;}
      if((x.entity==='products'||x.entity==='supplies')&&num(x.record.initialStock)>0){pendingInitial.push({entity:x.entity,id:x.record.id,quantity:num(x.record.initialStock),key:x.key});x.record.initialStock=0;}
      list.push(x.record);history.created.push({entity:x.entity,id:x.record.id});history.keys.push(x.key);if(!currentProfileSettings().migrationKeys.includes(x.key))currentProfileSettings().migrationKeys.push(x.key);
    }
    for(const x of MIGRATION_SESSION.plan.updates){
      history.updatedBefore.push({entity:x.entity,id:x.existing.id,before:safeJson(x.existing)});
      if((x.entity==='products'||x.entity==='supplies')&&num(x.record.initialStock)>0){pendingInitial.push({entity:x.entity,id:x.record.id,quantity:num(x.record.initialStock),key:x.key});x.record.initialStock=0;}
      Object.assign(x.existing,x.record);history.keys.push(x.key);if(!currentProfileSettings().migrationKeys.includes(x.key))currentProfileSettings().migrationKeys.push(x.key);
    }
    for(const entry of pendingInitial){
      const type=entry.entity==='products'?'Produto':'Insumo',candidate=importedInitialStockCandidate(type,entry.id,entry.quantity);
      if(candidate){candidate.origin='initial-stock';candidate.notes=candidate.notes||'Estoque inicial importado';continue;}
      const id=nextCode('MOV',data().stockMovements),movement={id,itemType:type,productId:type==='Produto'?entry.id:'',supplyId:type==='Insumo'?entry.id:'',movementType:'Entrada',quantity:entry.quantity,date:today(),orderId:'',notes:'Estoque inicial importado do AppSheet',stockBefore:0,stockAfter:entry.quantity,sourceItemId:'',origin:'initial-stock',legacyKey:`${entry.key}:initial-stock`};
      data().stockMovements.push(movement);history.created.push({entity:'movements',id});
    }
    const affectedOrderIds=new Set();for(const x of [...creates,...MIGRATION_SESSION.plan.updates]){if(x.entity==='orders')affectedOrderIds.add(x.record.id);if(x.entity==='items')affectedOrderIds.add(x.record.orderId);if(x.entity==='payments'&&x.record.orderId)affectedOrderIds.add(x.record.orderId);}
    for(const orderId of affectedOrderIds){
      const order=findOrder(orderId);if(!order)continue;
      const oldItems=preItems.filter(x=>x.orderId===orderId),newItems=orderItems(orderId),plannedItems=isCancelledOrder(order)?newItems.map(x=>({...x,lowerStock:false})):newItems;
      for(const item of plannedItems.filter(x=>x.lowerStock&&x.productId)){
        if(data().stockMovements.some(m=>m.sourceItemId===item.id))continue;
        const candidate=data().stockMovements.find(m=>!m.sourceItemId&&m.orderId===orderId&&m.productId===item.productId&&normalizeText(m.movementType)==='saida'&&Math.abs(num(m.quantity)-num(item.quantity))<.0001);
        if(candidate){candidate.sourceItemId=item.id;candidate.origin=candidate.origin||'migration-linked';candidate.notes=candidate.notes||`Baixa automática da ${orderId}`;}
      }
      const beforeMovementIds=new Set(data().stockMovements.map(m=>m.id));reconcileStock(orderId,oldItems,plannedItems);for(const m of data().stockMovements)if(!beforeMovementIds.has(m.id))history.created.push({entity:'movements',id:m.id});
      history.priceHistoryBefore.push(...data().priceHistory.filter(h=>h.orderId===orderId).map(safeJson));syncPriceHistory(order,newItems);
      if(newItems.length){const gross=newItems.reduce((sum,it)=>sum+num(it.subtotal),0),calculated=Math.max(0,gross-num(order.discount)),legacy=num(order.total);if(Math.abs(legacy-calculated)>.01)history.warnings.push({type:'total-divergence',orderId,legacyTotal:legacy,calculatedTotal:calculated,message:'Total legado divergente dos itens estruturados; o total calculado foi adotado.'});order.legacyTotal=legacy;order.total=calculated;}
    }
    history.affectedOrderIds=[...affectedOrderIds];
    const affectedCatalog=new Set();for(const x of [...creates,...MIGRATION_SESSION.plan.updates]){if(x.entity==='products')affectedCatalog.add(`Produto:${x.record.id}`);if(x.entity==='supplies')affectedCatalog.add(`Insumo:${x.record.id}`);if(x.entity==='movements')affectedCatalog.add(`${x.record.itemType}:${x.record.productId||x.record.supplyId}`);}for(const key of affectedCatalog){const [type,id]=key.split(':');recalculateMovementBalances(type,id);}
    const mediaResult=await importMigrationMedia(MIGRATION_SESSION.plan.media,history);
    history.summary={created:history.created.length,updated:history.updatedBefore.length,mediaLinked:mediaResult.linked,mediaOrphans:mediaResult.orphans,ignored:MIGRATION_SESSION.plan.ignored.length,conflicts:0,warnings:history.warnings.length};data().migrationHistory.unshift(history);data().migrationLog.unshift({date:nowIso(),action:'Importação AppSheet concluída',detail:JSON.stringify(history.summary),migrationId:history.id});
    await persist('Migração do AppSheet concluída',`${history.summary.created} inclusões, ${history.summary.updated} atualizações, ${history.summary.mediaLinked} arquivos vinculados.`);MIGRATION_SESSION=null;closeModal();renderView();toast(history.warnings.length?`Migração concluída com ${history.warnings.length} divergência(s) registrada(s).`:'Migração concluída após cinco ciclos de validação.',history.warnings.length?'warn':'ok');
  }
  async function rollbackLastMigration(){
    const h=data().migrationHistory.find(x=>!x.rolledBack);if(!h)throw new Error('Não existe migração ativa para desfazer.');if(!await confirmAction('Desfazer somente os registros e arquivos criados/alterados pela última migração? Dados criados depois permanecerão.'))return;
    await MarcoStorage.createBackup(STATE,'antes-do-rollback-migracao');
    for(const x of h.created){const list=entityList(x.entity);if(list){const idx=list.findIndex(v=>v.id===x.id);if(idx>=0)list.splice(idx,1);}}
    for(const x of h.updatedBefore){const list=entityList(x.entity),current=list?.find(v=>v.id===x.id);if(current)Object.assign(current,x.before);}
    if(Array.isArray(h.affectedOrderIds)){const ids=new Set(h.affectedOrderIds);data().priceHistory=data().priceHistory.filter(x=>!ids.has(x.orderId)).concat((h.priceHistoryBefore||[]).map(safeJson));}
    for(const m of h.media||[]){const order=findOrder(m.orderId);if(order){for(const key of ['photos','pdfs','attachments'])order[key]=(order[key]||[]).filter(x=>x.id!==m.id);}if(m.localKey)await MarcoStorage.deleteMedia(m.localKey);}
    const remove=new Set([...(h.keys||[]),...(h.media||[]).map(x=>x.key)]);currentProfileSettings().migrationKeys=currentProfileSettings().migrationKeys.filter(k=>!remove.has(k));h.rolledBack=true;h.rolledBackAt=nowIso();data().migrationLog.unshift({date:nowIso(),action:'Rollback de migração',detail:h.id,migrationId:h.id});await persist('Migração desfeita',h.id);renderView();toast('Última migração desfeita de forma auditável.');
  }
  function exportMigrationLog(){const payload={exportedAt:nowIso(),history:data().migrationHistory,log:data().migrationLog};MarcoStorage.downloadBlob(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),`Marco_Iris_Log_Migracao_${Date.now()}.json`);}

  /* Assistente completo de vínculos da migração AppSheet */
  const MIGRATION_FIELD_TARGETS={
    clients:[['id','ID legado'],['nome','Nome'],['cpf','CPF/CNPJ'],['telefone','Telefone'],['cidade','Cidade'],['estado','Estado/UF'],['endereco','Rua/Endereço'],['numero','Número'],['bairro','Bairro'],['complemento','Complemento'],['cep','CEP'],['observacao','Observação']],
    orders:[['id','ID/OSV'],['cliente','Cliente'],['data abertura','Data de abertura'],['data conclusao','Data de conclusão'],['tipo equipamento','Tipo de equipamento'],['marca modelo','Marca/Modelo'],['numero serie','Número de série'],['senha','Senha de acesso'],['acessorios','Acessórios'],['defeito','Defeito relatado'],['laudo','Laudo técnico'],['status','Status'],['desconto','Desconto'],['total','Total'],['observacao cliente','Observação para o cliente'],['observacao interna','Observação interna']],
    payments:[['id','ID legado'],['tipo','Tipo'],['osv','OSV vinculada'],['valor liquido','Valor líquido'],['taxa','Taxa'],['valor bruto','Valor bruto'],['forma pagamento','Forma de pagamento'],['data pagamento','Data do pagamento'],['vencimento','Data de vencimento'],['observacao','Observação']],
    services:[['id','ID legado'],['descricao','Descrição'],['preco','Preço padrão'],['status','Status']],
    products:[['id','ID legado'],['descricao','Descrição'],['marca','Marca'],['fornecedor','Fornecedor'],['custo','Custo'],['preco venda','Preço de venda'],['estoque inicial','Estoque inicial'],['estoque minimo','Estoque mínimo'],['status','Status']],
    supplies:[['id','ID legado'],['descricao','Descrição'],['marca','Marca'],['fornecedor','Fornecedor'],['custo','Custo'],['estoque inicial','Estoque inicial'],['estoque minimo','Estoque mínimo'],['status','Status']],
    movements:[['id','ID legado'],['tipo item','Tipo do item'],['item id','Item'],['movimento','Entrada/Saída'],['quantidade','Quantidade'],['data','Data'],['osv','OSV vinculada'],['observacao','Observação']],
    items:[['id','ID legado'],['osv','OSV vinculada'],['tipo','Tipo Serviço/Produto'],['item id','ID do serviço/produto'],['descricao','Descrição do item'],['quantidade','Quantidade'],['valor unitario','Valor unitário'],['subtotal','Subtotal'],['baixar estoque','Baixar estoque']]
  };
  inferEntity=function(fileName,rows){
    const name=normalizeText(fileName),headers=normalizeText(Object.keys(rows?.[0]||{}).join(' '));
    if(/item|itens|items|detalhe/.test(name)&&/ordem|osv|oas|item/.test(name))return 'items';
    if(/ordem|ordens|osv|oas/.test(name))return 'orders';
    if(/pagamento|pagamentos|receita|receitas|despesa|finance/.test(name))return 'payments';
    if(/movimenta|movement/.test(name))return 'movements';
    if(/servico|servicos|service/.test(name))return 'services';
    if(/produto|produtos|product/.test(name))return 'products';
    if(/insumo|insumos|supply/.test(name))return 'supplies';
    if(/cliente|clientes|customer/.test(name))return 'clients';
    if(/quantidade|valor unitario|subtotal/.test(headers)&&/item|produto|servico/.test(headers)&&/\bos\b|\boas\b|\bosv\b|ordem/.test(headers))return 'items';
    if(/defeito|equipamento|data abertura|numero serie|\bos\b|\boas\b|\bosv\b/.test(headers))return 'orders';
    if(/forma pagamento|data pagamento|valor recebido|vencimento/.test(headers))return 'payments';
    if(/cliente|cpf|cnpj|telefone|bairro|cep/.test(headers))return 'clients';
    return 'unknown';
  };
  const baseAnalyzeMigrationFilesPts=analyzeMigrationFiles;
  analyzeMigrationFiles=async function(files){
    const result=await baseAnalyzeMigrationFilesPts(files);
    result.forEach(source=>{
      if(source.type!=='media'){
        const name=normalizeText(source.file?.name||''),headers=normalizeText(Object.keys(source.rows?.[0]||{}).join(' '));
        if((/item|itens|items|detalhe/.test(name)&&/ordem|osv|oas|item/.test(name))||(/quantidade|valor unitario|subtotal/.test(headers)&&/item|produto|servico/.test(headers)&&/(^| )(os|oas|osv)( |$)|ordem/.test(headers)))source.type='items';
        else if(/ordem|ordens|osv|oas/.test(name)||/defeito|equipamento|data abertura|numero serie/.test(headers))source.type='orders';
        else if(/pagamento|pagamentos|receita|receitas|despesa|finance/.test(name)||/forma pagamento|data pagamento|valor recebido|vencimento/.test(headers))source.type='payments';
        else if(/movimenta|movement/.test(name))source.type='movements';
        else if(/servico|servicos|service/.test(name))source.type='services';
        else if(/produto|produtos|product/.test(name))source.type='products';
        else if(/insumo|insumos|supply/.test(name))source.type='supplies';
        else if(/cliente|clientes|customer/.test(name)||/cliente|cpf|cnpj|telefone|bairro|cep/.test(headers))source.type='clients';
      }
      (source.rows||[]).forEach(row=>{try{Object.defineProperty(row,'__migrationSourceHash',{value:source.hash,enumerable:false,configurable:true});}catch(_){row.__migrationSourceHash=source.hash;}});
    });
    return result;
  };
  function emptyMigrationMappings(){return {fields:{},ignoredFields:{},clients:{},catalog:{},media:{},orderStatus:{},paymentMethod:{},itemType:{}};}
  function migrationSchemaKey(source){const headers=Object.keys(source.rows?.[0]||{}).filter(x=>x!=='__migrationSourceHash').map(normalizeText).sort().join('|');return `${source.type}:${headers}`;}
  function loadMigrationMappings(files){
    const maps=emptyMigrationMappings(),templates=currentProfileSettings().migrationTemplates||{},global=templates.__global||{};
    for(const key of ['clients','catalog','orderStatus','paymentMethod','itemType'])Object.assign(maps[key],safeJson(global[key])||{});
    for(const source of files||[]){const tpl=templates[migrationSchemaKey(source)];if(!tpl)continue;maps.fields[source.hash]=safeJson(tpl.fields)||{};maps.ignoredFields[source.hash]=safeJson(tpl.ignoredFields)||[];}
    return maps;
  }
  async function saveMigrationMappingTemplate(){
    if(!MIGRATION_SESSION)throw new Error('Nenhuma migração em análise.');const maps=migrationMaps(),templates=currentProfileSettings().migrationTemplates=currentProfileSettings().migrationTemplates||{};
    templates.__global={clients:safeJson(maps.clients)||{},catalog:safeJson(maps.catalog)||{},orderStatus:safeJson(maps.orderStatus)||{},paymentMethod:safeJson(maps.paymentMethod)||{},itemType:safeJson(maps.itemType)||{}};
    for(const source of MIGRATION_SESSION.files||[])templates[migrationSchemaKey(source)]={savedAt:nowIso(),fields:safeJson(maps.fields[source.hash])||{},ignoredFields:safeJson(maps.ignoredFields[source.hash])||[]};
    await persist('Mapeamento da migração salvo','Será reaplicado a arquivos com a mesma estrutura.',{folder:false,google:false});toast('Mapeamento salvo no perfil.');
  }
  function migrationMaps(){
    if(!MIGRATION_SESSION)return emptyMigrationMappings();
    MIGRATION_SESSION.mappings=MIGRATION_SESSION.mappings||emptyMigrationMappings();
    for(const key of ['fields','ignoredFields','clients','catalog','media','orderStatus','paymentMethod','itemType'])MIGRATION_SESSION.mappings[key]=MIGRATION_SESSION.mappings[key]||{};
    return MIGRATION_SESSION.mappings;
  }
  const baseRowValuePts=rowValue;
  rowValue=function(row,...aliases){
    const hash=row?.__migrationSourceHash,key=normalizeText(aliases[0]||''),mapped=hash&&migrationMaps().fields?.[hash]?.[key];
    if(mapped&&mapped!=='__ignore__')return row[mapped]??'';
    if(mapped==='__ignore__')return '';
    const ignored=new Set(hash&&migrationMaps().ignoredFields?.[hash]||[]),entries=Object.entries(row||{}).filter(([k])=>k!=='__migrationSourceHash'&&!ignored.has(k)),wanted=aliases.map(normalizeText).filter(Boolean);
    for(const [k,v] of entries)if(wanted.includes(normalizeText(k)))return v;
    const broad=wanted.filter(x=>x.length>=4).sort((a,b)=>b.length-a.length);
    for(const [k,v] of entries){const nk=normalizeText(k);if(broad.some(w=>nk.includes(w)))return v;}
    return '';
  };
  function sourceDistinct(type,...aliases){
    const out=new Map();
    for(const source of MIGRATION_SESSION?.files||[]){if(source.type!==type)continue;for(const row of source.rows||[]){const raw=String(rowValue(row,...aliases)||'').trim();if(raw&&!out.has(normalizeText(raw)))out.set(normalizeText(raw),raw);}}
    return [...out.values()];
  }
  function migrationFieldMappingHtml(source,index){
    if(!source.rows?.length||!MIGRATION_FIELD_TARGETS[source.type])return '';
    const headers=Object.keys(source.rows[0]||{}).filter(k=>k!=='__migrationSourceHash'),targets=MIGRATION_FIELD_TARGETS[source.type],map=migrationMaps().fields[source.hash]||{};
    return `<details class="migration-map-details"><summary>Mapear colunas deste arquivo</summary><div class="migration-map-grid"><div class="migration-map-head">Origem no AppSheet</div><div class="migration-map-head">Destino no sistema novo</div>${headers.map(header=>{const selected=Object.entries(map).find(([,v])=>v===header)?.[0]||'';return `<label>${esc(header)}</label><select data-migration-field-source="${attr(header)}" data-migration-source-hash="${attr(source.hash)}"><option value="">Automático</option><option value="__ignore__">Ignorar coluna</option>${targets.map(([v,l])=>`<option value="${attr(v)}" ${selected===normalizeText(v)?'selected':''}>${esc(l)}</option>`).join('')}</select>`;}).join('')}</div></details>`;
  }
  function migrationOrderIdsAvailable(){
    const ids=new Set(data().serviceOrders.map(o=>o.id));
    for(const source of MIGRATION_SESSION?.files||[]){if(source.type!=='orders')continue;for(const row of source.rows||[]){const id=canonicalCode(rowValue(row,'os','oas','osv','id','codigo'),'OSV');if(id)ids.add(id);}}
    return [...ids].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  }
  function legacyBoolean(value){const v=normalizeText(value);return ['1','sim','true','verdadeiro','yes','x','marcado'].includes(v);}
  function migrationValueMappingHtml(){
    const maps=migrationMaps(),statusValues=sourceDistinct('orders','status'),methodValues=sourceDistinct('payments','forma pagamento','pagamento','metodo'),itemTypeValues=sourceDistinct('items','tipo','tipo item');
    const importedClientNames=new Set(sourceDistinct('clients','nome','cliente','name').map(normalizeText));
    const unresolvedNames=sourceDistinct('orders','cliente','nome cliente').filter(name=>!data().clients.some(c=>normalizeText(c.name)===normalizeText(name))&&!importedClientNames.has(normalizeText(name)));
    statusValues.forEach(raw=>{const key=normalizeText(raw);if(!maps.orderStatus[key])maps.orderStatus[key]=canonicalOperationalStatus(raw);});
    methodValues.forEach(raw=>{const key=normalizeText(raw);if(!maps.paymentMethod[key])maps.paymentMethod[key]=PAYMENT_METHODS.find(x=>normalizeText(x)===key)||'Outro';});
    itemTypeValues.forEach(raw=>{const key=normalizeText(raw);if(!maps.itemType[key])maps.itemType[key]=/produto/.test(key)?'Produto':/servico/.test(key)?'Serviço':'';});
    const sections=[];
    if(statusValues.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Vínculo de status das OSVs</h3><p>A nomenclatura original permanece visível para conferência.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${statusValues.map(raw=>`<label>${esc(raw)}</label><select data-migration-map-order-status="${attr(normalizeText(raw))}">${OPERATIONAL_STATUSES.map(v=>`<option ${maps.orderStatus[normalizeText(raw)]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`).join('')}</div></section>`);
    if(methodValues.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Vínculo de formas de pagamento</h3><p>Padronização compartilhada com OSV e Financeiro.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${methodValues.map(raw=>`<label>${esc(raw)}</label><select data-migration-map-payment-method="${attr(normalizeText(raw))}">${PAYMENT_METHODS.map(v=>`<option ${maps.paymentMethod[normalizeText(raw)]===v?'selected':''}>${esc(v)}</option>`).join('')}</select>`).join('')}</div></section>`);
    if(itemTypeValues.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Tipos dos itens legados</h3><p>Insumos internos não entram na OSV; mapeie cada nomenclatura para Serviço ou Produto, ou ignore.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${itemTypeValues.map(raw=>{const key=normalizeText(raw),value=maps.itemType[key]||'';return `<label>${esc(raw)}</label><select data-migration-map-item-type="${attr(key)}"><option value="" ${!value?'selected':''}>Resolver antes de importar</option><option value="Serviço" ${value==='Serviço'?'selected':''}>Serviço</option><option value="Produto" ${value==='Produto'?'selected':''}>Produto</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar item</option></select>`;}).join('')}</div></section>`);
    if(unresolvedNames.length)sections.push(`<section class="card migration-mapping-card conflict-card"><div class="card-header"><div><h3>Clientes que exigem vínculo</h3><p>Escolha um cadastro existente, crie um novo durante a migração ou ignore com registro no relatório.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${unresolvedNames.map(raw=>{const key=normalizeText(raw),value=maps.clients[key]||'',ranked=data().clients.slice().sort((a,b)=>{const aa=normalizeText(a.name),bb=normalizeText(b.name);return Number(!aa.startsWith(key.slice(0,2)))-Number(!bb.startsWith(key.slice(0,2)))||a.name.localeCompare(b.name,'pt-BR');});return `<label>${esc(raw)}</label><select data-migration-map-client="${attr(key)}"><option value="" ${!value?'selected':''}>Resolver antes de importar</option><option value="__create__" ${value==='__create__'?'selected':''}>Criar novo cliente “${esc(raw)}”</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar registros deste cliente</option>${ranked.map(c=>`<option value="${attr(c.id)}" ${value===c.id?'selected':''}>Vincular a ${esc(c.name)} · ${esc(c.id)}</option>`).join('')}</select>`;}).join('')}</div></section>`);

    const importedServices=new Set(sourceDistinct('services','descricao','servico','nome').map(normalizeText)),importedProducts=new Set(sourceDistinct('products','descricao','produto','nome').map(normalizeText)),catalogNeeds=new Map();
    for(const source of MIGRATION_SESSION?.files||[]){if(source.type!=='items')continue;for(const row of source.rows||[]){const rawType=String(rowValue(row,'tipo','tipo item')||'').trim(),type=maps.itemType[normalizeText(rawType)]||(/produto/i.test(rawType)?'Produto':/servi/i.test(rawType)?'Serviço':''),rawId=String(rowValue(row,'item id','produto id','servico id','serviço id')||'').trim(),description=String(rowValue(row,'descricao','item','produto','servico','serviço')||'').trim();if(!type||type==='__ignore__')continue;const prefix=type==='Produto'?'PRD':'SRV',id=canonicalCode(rawId,prefix),list=type==='Produto'?data().products:data().services,imported=type==='Produto'?importedProducts:importedServices;if((id&&list.some(x=>x.id===id))||(description&&(list.some(x=>normalizeText(x.description)===normalizeText(description))||imported.has(normalizeText(description)))))continue;const key=`${type}:${normalizeText(description||rawId)}`;if(description||rawId)catalogNeeds.set(key,{key,type,description:description||rawId});}}
    if(catalogNeeds.size)sections.push(`<section class="card migration-mapping-card conflict-card"><div class="card-header"><div><h3>Serviços e produtos não encontrados</h3><p>Vincule a um cadastro existente, crie durante a migração ou ignore o item com registro.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Origem</div><div class="migration-map-head">Destino</div>${[...catalogNeeds.values()].map(info=>{const value=maps.catalog[info.key]||'',list=info.type==='Produto'?data().products:data().services;return `<label>${esc(info.description)} <small>(${esc(info.type)})</small></label><select data-migration-map-catalog="${attr(info.key)}"><option value="" ${!value?'selected':''}>Resolver antes de importar</option><option value="__create__" ${value==='__create__'?'selected':''}>Criar novo ${esc(info.type.toLowerCase())}</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar este item</option>${list.map(x=>`<option value="${attr(x.id)}" ${value===x.id?'selected':''}>Vincular a ${esc(x.description)} · ${esc(x.id)}</option>`).join('')}</select>`;}).join('')}</div></section>`);

    const media=(MIGRATION_SESSION?.files||[]).filter(x=>x.type==='media'),orderIds=migrationOrderIdsAvailable();
    if(media.length)sections.push(`<section class="card migration-mapping-card"><div class="card-header"><div><h3>Vínculo de fotos, PDFs e anexos</h3><p>O arquivo original é preservado. PDFs legados são históricos e não substituem o PDF oficial novo.</p></div></div><div class="migration-map-grid"><div class="migration-map-head">Arquivo de origem</div><div class="migration-map-head">OSV de destino</div>${media.map(source=>{const value=maps.media[source.hash]||'',auto=source.inferredOrderId||inferOrderCodeFromText(source.file.name),warnings=source.reviewWarnings||[];return `<label>${esc(source.file.name)}${auto?` <small>· reconhecido ${esc(auto)} por ${esc(source.inferenceSource||'nome')}</small>`:''}${source.textConfidence&&source.textConfidence!=='none'?`<small class="migration-confidence">Leitura do PDF: confiança ${esc(source.textConfidence)}</small>`:''}${warnings.map(w=>`<small class="migration-review-warning">${esc(w)}</small>`).join('')}${source.textPreview?`<details class="migration-pdf-preview"><summary>Conferir texto extraído</summary><p>${esc(source.textPreview)}</p></details>`:''}</label><select data-migration-map-media="${attr(source.hash)}"><option value="" ${!value?'selected':''}>Automático pela evidência disponível</option><option value="__ignore__" ${value==='__ignore__'?'selected':''}>Ignorar com registro</option>${orderIds.map(id=>`<option value="${attr(id)}" ${value===id?'selected':''}>${esc(id)}</option>`).join('')}</select>`;}).join('')}</div></section>`);
    return sections.join('');
  }

  openMigrationReview=function(){
    migrationMaps();const counts=migrationCounts(MIGRATION_SESSION.files);
    openModal('Pré-análise, conflitos e vínculos',`<div class="migration-review"><div class="grid kpis migration-kpis">${[['clients','Clientes'],['orders','OSVs'],['items','Itens'],['payments','Pagamentos'],['media','Arquivos'],['unknown','Não reconhecidos'],['errors','Erros']].map(([k,l])=>`<div class="card kpi"><div><small>${l}</small><strong>${counts[k]||0}</strong></div></div>`).join('')}</div><section class="card"><div class="card-header"><div><h3>Arquivos reconhecidos</h3><p>Origem à esquerda; destino e colunas editáveis à direita.</p></div></div><div class="migration-file-list">${MIGRATION_SESSION.files.map((x,i)=>`<div class="migration-file-block"><div class="migration-file-row"><div class="list-row-main"><strong>${esc(x.file.name)}</strong><small>${x.rows.length?`${x.rows.length} linha(s)`:`${Math.round(x.file.size/1024)} KB`}${x.error?` · erro: ${esc(x.error)}`:''}</small></div><select data-migration-file-type="${i}">${[['clients','Clientes'],['orders','OSVs'],['payments','Pagamentos'],['items','Itens das OSVs'],['services','Serviços'],['products','Produtos'],['supplies','Insumos'],['movements','Movimentações'],['media','Fotos/PDFs/Anexos'],['unknown','Ignorar / revisar']].map(([v,l])=>`<option value="${v}" ${x.type===v?'selected':''}>${l}</option>`).join('')}</select></div>${migrationFieldMappingHtml(x,i)}</div>`).join('')}</div></section>${migrationValueMappingHtml()}<div class="migration-warning">Nenhum registro será gravado nesta etapa. A simulação é obrigatória, conflitos impedem a importação e o mapeamento pode ser revisto.</div><div class="form-actions"><button class="btn secondary" data-action="close-modal">Cancelar</button><button class="btn secondary" data-action="save-migration-mapping">Salvar mapeamento</button><button class="btn secondary" data-action="refresh-migration-analysis">Atualizar vínculos</button><button class="btn primary" data-action="simulate-migration">Simular importação</button></div></div>`,true);
  };
  function migrationCurrentOrPlanned(plan,entity,id,name=''){
    const list=entityList(entity)||[],planned=plan.creates.filter(x=>x.entity===entity).map(x=>x.record);
    return [...list,...planned].find(x=>(id&&x.id===id)||(name&&normalizeText(x.name||x.description||'')===normalizeText(name)));
  }
  buildMigrationPlan=function(){
    const plan={creates:[],updates:[],media:[],ignored:[],conflicts:[],keys:[]},maps=migrationMaps(),entityRank={clients:0,services:1,products:2,supplies:3,orders:4,items:5,payments:6,movements:7,media:8,unknown:9};
    const sources=(MIGRATION_SESSION.files||[]).slice().sort((a,b)=>(entityRank[a.type]??99)-(entityRank[b.type]??99));
    for(const source of sources){
      if(source.type==='media'){const choice=maps.media[source.hash]||'',targetOrderId=choice&&choice!=='__ignore__'?canonicalCode(choice,'OSV'):source.inferredOrderId||inferOrderCodeFromText(source.file.name);if(choice==='__ignore__'){plan.ignored.push({source,reason:'Arquivo ignorado por decisão do usuário'});continue;}if(!targetOrderId||!migrationCurrentOrPlanned(plan,'orders',targetOrderId)){plan.conflicts.push({source,index:0,reason:`Arquivo ${source.file.name} sem OSV de destino confirmada`});continue;}plan.media.push({...source,targetOrderId});continue;}
      if(source.type==='unknown'){plan.ignored.push({source,reason:'Tipo não reconhecido'});continue;}
      for(let index=0;index<(source.rows||[]).length;index++){
        const row=source.rows[index],entity=source.type,rawId=rowValue(row,'id','codigo','código','key','_rownumber'),key=legacyKey(entity,rawId,source.hash,index);
        if(currentProfileSettings().migrationKeys.includes(key)){plan.ignored.push({source,row,index,reason:'Já importado'});continue;}
        let record=null,targetList=null;
        if(entity==='clients'){
          const id=importedCode(rawId,'CLI',[...data().clients,...plan.creates.filter(x=>x.entity==='clients').map(x=>x.record)]),name=String(rowValue(row,'nome','cliente','name')||'').trim();
          if(!name){plan.conflicts.push({source,row,index,reason:'Cliente sem nome'});continue;}
          record={id,name,document:maskDocument(rowValue(row,'cpf','cnpj','documento','cpf cnpj')),...phoneFields(rowValue(row,'telefone','celular','phone')),city:rowValue(row,'cidade','city'),state:rowValue(row,'estado','uf')||'SP',address:rowValue(row,'endereco','rua','address'),number:rowValue(row,'numero','número'),neighborhood:rowValue(row,'bairro'),complement:rowValue(row,'complemento'),zip:maskZip(rowValue(row,'cep')),notes:rowValue(row,'observacao','observação'),status:'Ativo',createdAt:nowIso(),legacyKey:key};targetList=data().clients;
        }else if(entity==='services'){
          const id=importedCode(rawId,'SRV',[...data().services,...plan.creates.filter(x=>x.entity==='services').map(x=>x.record)]),description=String(rowValue(row,'descricao','servico','nome')||'').trim();if(!description){plan.conflicts.push({source,row,index,reason:'Serviço sem descrição'});continue;}record={id,description,price:num(rowValue(row,'preco','valor')),status:/inativ/i.test(rowValue(row,'status'))?'Inativo':'Ativo',legacyKey:key};targetList=data().services;
        }else if(entity==='products'){
          const id=importedCode(rawId,'PRD',[...data().products,...plan.creates.filter(x=>x.entity==='products').map(x=>x.record)]),cost=num(rowValue(row,'custo')),sale=num(rowValue(row,'preco venda','venda','preco')),description=String(rowValue(row,'descricao','produto','nome')||'').trim();if(!description){plan.conflicts.push({source,row,index,reason:'Produto sem descrição'});continue;}record={id,description,brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost,margin:sale>0?(sale-cost)/sale:.5,salePrice:sale||marginPrice(cost,.5),initialStock:num(rowValue(row,'estoque inicial','estoque','quantidade')),minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:/inativ/i.test(rowValue(row,'status'))?'Inativo':'Ativo',legacyKey:key};targetList=data().products;
        }else if(entity==='supplies'){
          const id=importedCode(rawId,'INS',[...data().supplies,...plan.creates.filter(x=>x.entity==='supplies').map(x=>x.record)]),description=String(rowValue(row,'descricao','insumo','nome')||'').trim();if(!description){plan.conflicts.push({source,row,index,reason:'Insumo sem descrição'});continue;}record={id,description,brand:rowValue(row,'marca'),supplier:rowValue(row,'fornecedor'),cost:num(rowValue(row,'custo')),initialStock:num(rowValue(row,'estoque inicial','estoque','quantidade')),minimumStock:rowValue(row,'estoque minimo')===''?'':num(rowValue(row,'estoque minimo')),status:/inativ/i.test(rowValue(row,'status'))?'Inativo':'Ativo',legacyKey:key};targetList=data().supplies;
        }else if(entity==='orders'){
          const id=importedCode(rawId||rowValue(row,'os','oas','osv'),'OSV',[...data().serviceOrders,...plan.creates.filter(x=>x.entity==='orders').map(x=>x.record)]),rawClientName=String(rowValue(row,'cliente','nome cliente')||'').trim(),rawClientId=canonicalCode(rowValue(row,'cliente id','id cliente'),'CLI');
          let client=migrationCurrentOrPlanned(plan,'clients',rawClientId,rawClientName),clientChoice=maps.clients[normalizeText(rawClientName)];
          if(clientChoice&&clientChoice!=='__create__'&&clientChoice!=='__ignore__')client=migrationCurrentOrPlanned(plan,'clients',clientChoice);
          if(clientChoice==='__ignore__'){plan.ignored.push({source,row,index,reason:`Cliente ${rawClientName} ignorado por decisão do usuário`});continue;}
          if(!client&&clientChoice==='__create__'&&rawClientName){const autoKey=`clients:auto:${normalizeText(rawClientName)}`,autoId=nextCode('CLI',[...data().clients,...plan.creates.filter(x=>x.entity==='clients').map(x=>x.record)]),auto={id:autoId,name:rawClientName,document:'',phone:'',phoneNormalized:'',city:'',state:'SP',address:'',number:'',neighborhood:'',complement:'',zip:'',notes:'Criado automaticamente durante vínculo da migração',status:'Ativo',createdAt:nowIso(),legacyKey:autoKey};plan.creates.push({entity:'clients',record:auto,key:autoKey});plan.keys.push(autoKey);client=auto;}
          if(!client){plan.conflicts.push({source,row,index,reason:rawClientName?`Cliente “${rawClientName}” ainda não foi vinculado`:'OSV sem cliente identificável'});continue;}
          const rawStatus=rowValue(row,'status'),status=maps.orderStatus[normalizeText(rawStatus)]||canonicalOperationalStatus(rawStatus);
          record={id,openedAt:String(rowValue(row,'data abertura','abertura','data')||today()).slice(0,10),completedAt:String(rowValue(row,'data conclusao','conclusão')||'').slice(0,10),clientId:client.id,clientName:client.name,equipmentType:rowValue(row,'tipo equipamento','equipamento'),brandModel:rowValue(row,'marca modelo','modelo','marca'),serialNumber:rowValue(row,'numero serie','serial'),accessPassword:rowValue(row,'senha'),accessories:rowValue(row,'acessorios'),reportedIssue:rowValue(row,'defeito','defeito relatado'),technicalReport:rowValue(row,'laudo','laudo tecnico'),status,discount:num(rowValue(row,'desconto')),total:num(rowValue(row,'total','valor')),clientNotes:rowValue(row,'observacao cliente'),internalNotes:rowValue(row,'observacao interna'),registrationStatus:'Ativo',photos:[],pdfs:[],attachments:[],createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};targetList=data().serviceOrders;
        }else if(entity==='items'){
          const orderId=canonicalCode(rowValue(row,'osv','os','oas','ordem'),'OSV');if(!orderId||!migrationCurrentOrPlanned(plan,'orders',orderId)){plan.conflicts.push({source,row,index,reason:'Item sem OSV válida'});continue;}
          const rawType=String(rowValue(row,'tipo','tipo item')||'').trim(),mappedType=maps.itemType[normalizeText(rawType)]||(/produto/i.test(rawType)?'Produto':/servi/i.test(rawType)?'Serviço':'');if(mappedType==='__ignore__'){plan.ignored.push({source,row,index,reason:`Tipo de item “${rawType}” ignorado`});continue;}if(!mappedType){plan.conflicts.push({source,row,index,reason:`Tipo de item “${rawType||'vazio'}” não mapeado`});continue;}
          const prefix=mappedType==='Produto'?'PRD':'SRV',entityCatalog=mappedType==='Produto'?'products':'services',rawCatalogId=canonicalCode(rowValue(row,'item id','produto id','servico id','serviço id'),prefix),description=String(rowValue(row,'descricao','item','produto','servico','serviço')||'').trim(),catalogKey=`${mappedType}:${normalizeText(description||rawCatalogId)}`;let catalog=migrationCurrentOrPlanned(plan,entityCatalog,rawCatalogId,description),choice=maps.catalog[catalogKey];
          if(choice&&choice!=='__create__'&&choice!=='__ignore__')catalog=migrationCurrentOrPlanned(plan,entityCatalog,choice);
          if(choice==='__ignore__'){plan.ignored.push({source,row,index,reason:`Item “${description||rawCatalogId}” ignorado`});continue;}
          const unitPrice=num(rowValue(row,'valor unitario','preco','valor'));
          if(!catalog&&choice==='__create__'){const autoKey=`${entityCatalog}:auto:${normalizeText(description||rawCatalogId)}`,list=entityCatalog==='products'?[...data().products,...plan.creates.filter(x=>x.entity==='products').map(x=>x.record)]:[...data().services,...plan.creates.filter(x=>x.entity==='services').map(x=>x.record)],id=nextCode(prefix,list);catalog=entityCatalog==='products'?{id,description:description||`Produto importado ${id}`,brand:'',supplier:'',cost:0,margin:0,salePrice:unitPrice,initialStock:0,minimumStock:'',status:'Ativo',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:autoKey}:{id,description:description||`Serviço importado ${id}`,price:unitPrice,status:'Ativo',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:autoKey};plan.creates.push({entity:entityCatalog,record:catalog,key:autoKey});plan.keys.push(autoKey);}
          if(!catalog){plan.conflicts.push({source,row,index,reason:`${mappedType} “${description||rawCatalogId}” não encontrado nem vinculado`});continue;}
          const quantity=Math.max(.01,num(rowValue(row,'quantidade','qtd'))||1),subtotal=num(rowValue(row,'subtotal'))||quantity*unitPrice,id=String(rawId||'').trim()||nextCode('ITM',[...data().orderItems,...plan.creates.filter(x=>x.entity==='items').map(x=>x.record)]);
          record={id,orderId,type:mappedType,productId:mappedType==='Produto'?catalog.id:'',serviceId:mappedType==='Serviço'?catalog.id:'',supplyId:'',quantity,unitPrice,subtotal,lowerStock:mappedType==='Produto'&&legacyBoolean(rowValue(row,'baixar estoque','estoque','baixa')),legacyKey:key};targetList=data().orderItems;
        }else if(entity==='payments'){
          const type=normalizeText(rowValue(row,'tipo'))==='despesa'?'Despesa':'Receita',prefix=type==='Despesa'?'DES':'REC',id=importedCode(rawId,prefix,[...data().payments,...plan.creates.filter(x=>x.entity==='payments').map(x=>x.record)]),rawOrder=rowValue(row,'osv','os','oas','ordem'),orderId=canonicalCode(rawOrder,'OSV');
          if(orderId&&!migrationCurrentOrPlanned(plan,'orders',orderId)){plan.conflicts.push({source,row,index,reason:`Pagamento vinculado à ${orderId}, mas a OSV não foi encontrada`});continue;}
          const methodRaw=String(rowValue(row,'forma pagamento','pagamento','metodo')||'').trim(),method=maps.paymentMethod[normalizeText(methodRaw)]||PAYMENT_METHODS.find(x=>normalizeText(x)===normalizeText(methodRaw))||'Outro',value=num(rowValue(row,'valor liquido','valor','total')),fee=num(rowValue(row,'taxa'));
          record={id,code:id,orderId,type,paymentMethod:method,value,fee,grossValue:num(rowValue(row,'valor bruto'))||value+fee,paymentDate:String(rowValue(row,'data pagamento','pago em')||'').slice(0,10),dueDate:String(rowValue(row,'vencimento','data vencimento')||'').slice(0,10),notes:rowValue(row,'observacao'),status:'Em aberto',createdAt:nowIso(),updatedAt:nowIso(),legacyKey:key};record.status=recordFinancialStatus(record);targetList=data().payments;
        }else if(entity==='movements'){
          const id=importedCode(rawId,'MOV',[...data().stockMovements,...plan.creates.filter(x=>x.entity==='movements').map(x=>x.record)]),type=/insumo/i.test(rowValue(row,'tipo item'))?'Insumo':'Produto',prefix=type==='Produto'?'PRD':'INS',itemId=canonicalCode(rowValue(row,'item id','produto id','insumo id','item'),prefix),itemEntity=type==='Produto'?'products':'supplies',orderId=canonicalCode(rowValue(row,'osv','os','oas'),'OSV');
          if(!itemId||!migrationCurrentOrPlanned(plan,itemEntity,itemId)){plan.conflicts.push({source,row,index,reason:`Movimentação sem ${type.toLowerCase()} válido`});continue;}if(orderId&&!migrationCurrentOrPlanned(plan,'orders',orderId)){plan.conflicts.push({source,row,index,reason:`Movimentação vinculada à ${orderId}, mas a OSV não foi encontrada`});continue;}
          record={id,itemType:type,productId:type==='Produto'?itemId:'',supplyId:type==='Insumo'?itemId:'',movementType:/saida|saída/i.test(rowValue(row,'movimento','tipo'))?'Saída':'Entrada',quantity:num(rowValue(row,'quantidade','qtd')),date:String(rowValue(row,'data')||today()).slice(0,10),orderId,notes:rowValue(row,'observacao'),sourceItemId:'',legacyKey:key};targetList=data().stockMovements;
        }
        if(!record){plan.ignored.push({source,row,index,reason:'Sem conversor'});continue;}
        const existing=targetList.find(x=>x.id===record.id||x.legacyKey===key);if(existing)plan.updates.push({entity,record,existing,key});else plan.creates.push({entity,record,key});plan.keys.push(key);
      }
    }
    return plan;
  };

  const MONEY_NAMES=new Set(['price','cost','salePrice','newCost','newPrice','value','fee','discount','unitPrice','subtotal','grossValue']);
  function isMoneyInput(input){return window.MarcoMoney?.isMoneyInput?.(input)||false;}
  function formatMoneyEditor(input){window.MarcoMoney?.bind?.(input);}
  function hydrateMoneyInputs(root=document){window.MarcoMoney?.bindAll?.(root);}
  function editMoneyValue(input){window.MarcoMoney?.bind?.(input);}

  function captureFormLayout(grid){return [...grid.children].filter(x=>x.dataset.layoutField).map((el,order)=>({id:el.dataset.layoutField,order,span:el.dataset.layoutSpan||'half',height:el.dataset.layoutHeight||'auto'}));}
  function restoreFormLayout(grid,layout){const byId=new Map([...grid.children].filter(x=>x.dataset.layoutField).map(x=>[x.dataset.layoutField,x]));(layout||[]).slice().sort((a,b)=>a.order-b.order).forEach(item=>{const el=byId.get(item.id);if(el){grid.appendChild(el);el.dataset.layoutSpan=item.span||'half';el.dataset.layoutHeight=item.height||'auto';}});}
  function applyFormLayout(form){
    const key=form.dataset.layoutKey,grid=form.querySelector('.form-grid');if(!key||!grid)return;const fields=[...grid.children].filter(x=>x.classList.contains('field')||x.classList.contains('check-field'));fields.forEach((el,i)=>{const control=el.querySelector('[name]'),id=control?.name||`field-${i}`;el.dataset.layoutField=id;});
    fields.forEach(el=>{if(!el.dataset.layoutSpan)el.dataset.layoutSpan=screenBand()==='mobile'?'full':el.classList.contains('full')?'full':'half';if(!el.dataset.layoutHeight)el.dataset.layoutHeight='auto';});
    if(!form.dataset.defaultLayout)form.dataset.defaultLayout=JSON.stringify(captureFormLayout(grid));
    const saved=currentProfileSettings().formLayouts[formLayoutKey(key)]||currentProfileSettings().formLayouts[key];if(saved?.fields)restoreFormLayout(grid,saved.fields);
  }
  function hydrateFormLayout(){
    const header=$('#modal-root .modal-header');
    // A Nova/Editar OSV tem uma única fonte de verdade (settings().osvLayout) e um único editor: o
    // mesmo de Configurações → Personalização → Layout da Nova OSV. O formulário da OSV não carrega
    // data-layout-key justamente para que nenhum seletor do editor legado consiga alcançá-lo.
    const orderForm=$('#modal-root form[data-form="order"]');
    if(orderForm){
      // Só oferece o botão se o editor único estiver instalado: melhor não ter botão do que ter um morto.
      if(typeof window.MarcoPersonalization221?.openLayoutEditor!=='function')return;
      if(header&&!header.querySelector('[data-action="open-osv-layout-editor"]'))header.querySelector('h2')?.insertAdjacentHTML('afterend',`<button class="btn ghost compact modal-layout-button" type="button" data-action="open-osv-layout-editor">${icon('edit',16)} Editar layout</button>`);
      return;
    }
    // O editor legado (arrastar campos dentro do .form-grid) continua valendo para os demais cadastros.
    const form=$('#modal-root form[data-layout-key]');if(!form)return;
    applyFormLayout(form);
    if(header&&!header.querySelector('[data-action="toggle-form-layout"]'))header.querySelector('h2')?.insertAdjacentHTML('afterend',`<button class="btn ghost compact modal-layout-button" type="button" data-action="toggle-form-layout">${icon('edit',16)} Editar layout</button>`);
  }
  function normalizeModalActionFlow(root=document.getElementById('modal-root')){
    const body=root?.querySelector?.('.modal-body'),modal=body?.closest?.('.modal'),form=body?.querySelector?.(':scope > form');
    if(!body||!form)return;
    const legacyScroll=form.querySelector(':scope > .modal-form-scroll');
    if(legacyScroll){
      [...legacyScroll.children].forEach(child=>form.insertBefore(child,legacyScroll));
      legacyScroll.remove();
    }
    const actions=form.querySelector(':scope > .form-actions');
    body.classList.remove('has-docked-actions');
    modal?.classList.remove('has-docked-actions');
    actions?.classList.remove('modal-action-dock','sticky-actions');
    actions?.querySelectorAll('button:not([type])').forEach(button=>button.type=button.classList.contains('primary')?'submit':'button');
  }
  openModal = function(title,content,wide=false){baseOpenModal(title,content,wide);requestAnimationFrame(()=>{normalizeModalActionFlow();hydrateFormLayout();hydrateMoneyInputs($('#modal-root'));});};
  function setFormLayoutEditing(editing){
    const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;form.classList.toggle('form-layout-editing',editing);$$(':scope > .field, :scope > .check-field',grid).forEach(el=>{el.draggable=editing;if(editing&&!el.querySelector('.field-layout-controls'))el.insertAdjacentHTML('afterbegin',`<div class="field-layout-controls"><span class="drag-handle" title="Arraste para reposicionar">⋮⋮ Arraste</span><div><button type="button" data-action="form-field-width" title="Alternar largura">↔</button><button type="button" data-action="form-field-height" title="Alternar altura">↕</button></div></div>`);else if(!editing)el.querySelector('.field-layout-controls')?.remove();});
    const header=$('#modal-root .modal-header'),btn=header?.querySelector('[data-action="toggle-form-layout"]');if(btn)btn.innerHTML=editing?'Salvar layout':`${icon('edit',16)} Editar layout`;
    header?.querySelector('.form-layout-toolbar')?.remove();if(editing)btn?.insertAdjacentHTML('afterend',`<div class="form-layout-toolbar"><button type="button" class="btn secondary compact" data-action="cancel-form-layout">Cancelar</button><button type="button" class="btn ghost compact" data-action="undo-form-layout" ${FORM_LAYOUT_HISTORY.length?'':'disabled'}>Desfazer</button><button type="button" class="btn ghost compact" data-action="reset-form-layout">Restaurar padrão</button><small>${screenBand()}</small></div>`);
  }
  function startFormLayoutEditing(){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;if(form.classList.contains('form-layout-editing')){saveCurrentFormLayout(form);setFormLayoutEditing(false);return;}FORM_LAYOUT_SNAPSHOT=captureFormLayout(grid);FORM_LAYOUT_HISTORY=[];setFormLayoutEditing(true);}
  function pushFormLayoutHistory(grid){FORM_LAYOUT_HISTORY.push(captureFormLayout(grid));if(FORM_LAYOUT_HISTORY.length>30)FORM_LAYOUT_HISTORY.shift();setFormLayoutEditing(true);}
  async function saveCurrentFormLayout(form){const base=form.dataset.layoutKey,grid=form.querySelector('.form-grid');if(!base||!grid)return;currentProfileSettings().formLayouts[formLayoutKey(base)]={fields:captureFormLayout(grid),screenBand:screenBand(),updatedAt:nowIso()};await persist('Layout de formulário salvo',`${base} · ${screenBand()}`,{folder:false,google:false});FORM_LAYOUT_SNAPSHOT=null;FORM_LAYOUT_HISTORY=[];}

  reconcileStock = function(orderId,oldItems,newItems){
    const map=new Map([...oldItems,...newItems].map(x=>[x.id,x]));for(const [itemId,item] of map){const latest=newItems.find(x=>x.id===itemId),desired=latest?.lowerStock&&latest.productId?num(latest.quantity):0,applied=data().stockMovements.filter(m=>m.sourceItemId===itemId).reduce((s,m)=>s+(normalizeText(m.movementType)==='saida'?num(m.quantity):-num(m.quantity)),0),delta=desired-applied;if(Math.abs(delta)<.0001)continue;const ref=latest||item;if(!ref.productId)continue;const stockBefore=stockOf('Produto',ref.productId),movementType=delta>0?'Saída':'Entrada',qty=Math.abs(delta);data().stockMovements.push({id:nextCode('MOV',data().stockMovements),itemType:'Produto',productId:ref.productId,supplyId:'',movementType,quantity:qty,date:today(),orderId,notes:delta>0?`Baixa automática da ${orderId}`:`Reversão automática da ${orderId}`,stockBefore,stockAfter:stockBefore+(movementType==='Entrada'?qty:-qty),sourceItemId:itemId,origin:'osv-auto'});}
  };

  async function changeOrderStatusQuick(id,status){const o=findOrder(id);if(!o)return;const next=canonicalOperationalStatus(status),oldItems=clone(orderItems(id));let cancellation=null;if(next==='Cancelada'&&canonicalOperationalStatus(o.status)!=='Cancelada'){cancellation=await planOrderCancellation(id,oldItems);if(cancellation.abort){renderView();return;}}const reverseStock=next==='Cancelada'?(cancellation?cancellation.reverseStock:o.cancellationEffects?.stock!=='mantido'):false,newPlan=next==='Cancelada'&&reverseStock?oldItems.map(x=>({...x,lowerStock:false})):oldItems;o.status=next;if(next==='Concluída'&&!o.completedAt)o.completedAt=today();if(cancellation)o.cancellationEffects={date:nowIso(),payments:cancellation.paymentAction==='cancel'?'estornados':cancellation.paymentAction==='preserve'?'preservados':'nenhum',stock:cancellation.hadAutomaticStock?(cancellation.reverseStock?'revertido':'mantido'):'nenhum'};reconcileStock(id,oldItems,newPlan);applyCancellationPaymentDecision(cancellation,id);await persist('Status da OSV atualizado',`${id} → ${next}${cancellation?` · ${cancellationAuditText(cancellation)}`:''}`);renderView();toast('Status atualizado em todos os módulos.');}
  async function cancelPayment(id){const p=data().payments.find(x=>x.id===id);if(!p)return;if(paymentIsCancelled(p)){toast('Este lançamento já está cancelado.','warn');return;}if(!await confirmAction(`Cancelar ${p.id} mantendo o histórico e recalculando a OSV?`))return;p.status='Cancelado';p.cancelledAt=nowIso();p.cancelReason='Cancelado pelo usuário';await persist('Lançamento cancelado',p.id,{immediate:true});closeModal();renderView();toast('Lançamento cancelado e totais recalculados.');}
  async function lookupAddressCep(auto=false){
    const form=$('form[data-form="client"]');if(!form)throw new Error('Formulário de cliente não encontrado.');
    const uf=String(form.elements.state?.value||'').trim(),city=String(form.elements.city?.value||'').replace(/\s*-\s*[A-Z]{2}$/,'').trim(),street=String(form.elements.address?.value||'').trim();
    if(!uf||city.length<2||street.length<3){if(auto)return;throw new Error('Informe Estado, Cidade e ao menos 3 letras da Rua/Endereço.');}
    const box=$('[data-cep-results]',form);if(box)box.innerHTML='<small>Consultando endereço…</small>';
    let response;try{response=await fetch(`https://viacep.com.br/ws/${encodeURIComponent(uf)}/${encodeURIComponent(city)}/${encodeURIComponent(street)}/json/`);}catch(_){if(box)box.innerHTML='';if(auto)return;throw new Error('Serviço de endereço indisponível. Preencha CEP e bairro manualmente.');}
    if(!response.ok){if(box)box.innerHTML='';if(auto)return;throw new Error('Serviço de endereço indisponível. Preencha manualmente.');}
    const result=await response.json();
    if(!Array.isArray(result)||!result.length){if(box)box.innerHTML=auto?'<small>Nenhum endereço encontrado ainda. Continue digitando ou use o CEP.</small>':'';if(auto)return;throw new Error('Nenhum endereço correspondente foi encontrado.');}
    CEP_SUGGESTIONS=result.filter(x=>x.cep).slice(0,20);
    if(!CEP_SUGGESTIONS.length){if(box)box.innerHTML='';if(auto)return;throw new Error('Nenhum CEP confiável foi encontrado.');}
    renderCepSuggestions();
    if(!auto)toast(CEP_SUGGESTIONS.length>1?'Vários bairros encontrados para esta rua. Toque no bairro correto.':'CEP e bairro sugeridos. Revise antes de salvar.');
  }
  function renderCepSuggestions(){
    const form=$('form[data-form="client"]'),box=$('[data-cep-results]',form);if(!box)return;
    if(!CEP_SUGGESTIONS.length){box.innerHTML='';return;}
    if(CEP_SUGGESTIONS.length===1){applyCepSuggestion(0);return;}
    const title=`<div class="cep-results-title">${CEP_SUGGESTIONS.length} bairros encontrados para esta rua — toque no bairro correto:</div>`;
    const items=CEP_SUGGESTIONS.map((x,i)=>`<button type="button" class="cep-result" data-action="apply-cep-suggestion" data-index="${i}"><strong>${esc(x.bairro||'Bairro não informado')}</strong><small>${esc(x.logradouro||'')} · ${esc(maskZip(x.cep))} · ${esc(x.localidade||'')}/${esc(x.uf||'')}</small></button>`).join('');
    box.innerHTML=title+items;
  }
  function applyCepSuggestion(index){const form=$('form[data-form="client"]'),x=CEP_SUGGESTIONS[num(index)];if(!form||!x)return;form.elements.address.value=x.logradouro||form.elements.address.value;form.elements.neighborhood.value=x.bairro||form.elements.neighborhood.value;form.elements.city.value=x.localidade||form.elements.city.value;form.elements.state.value=x.uf||form.elements.state.value;form.elements.zip.value=maskZip(x.cep);const box=$('[data-cep-results]',form);if(box)box.innerHTML=`<small>Endereço preenchido: ${esc(x.logradouro||'—')} · ${esc(maskZip(x.cep))}. Falta só o número.</small>`;loadCitiesForState(x.uf,x.localidade);form.elements.number?.focus();}
  async function lookupCep(auto=false){
    const form=$('form[data-form="client"]'),cep=digitsOnly(form?.elements.zip?.value);
    if(!form||cep.length!==8){if(auto)return;throw new Error('Informe um CEP com 8 dígitos.');}
    let response;try{response=await fetch(`https://viacep.com.br/ws/${cep}/json/`);}catch(_){if(auto)return;throw new Error('Serviço de CEP indisponível. Preencha manualmente.');}
    if(!response.ok){if(auto)return;throw new Error('Serviço de CEP indisponível. Preencha manualmente.');}
    const result=await response.json();if(result.erro){if(auto)return;throw new Error('CEP não encontrado.');}
    form.elements.address.value=result.logradouro||form.elements.address.value;form.elements.neighborhood.value=result.bairro||form.elements.neighborhood.value;form.elements.city.value=result.localidade||form.elements.city.value;form.elements.state.value=result.uf||form.elements.state.value;form.elements.zip.value=maskZip(cep);
    await loadCitiesForState(result.uf,result.localidade);
    const box=$('[data-cep-results]',form);if(box)box.innerHTML=`<small>Endereço preenchido pelo CEP. Falta só o número.</small>`;
    if(!auto)toast('Endereço sugerido. Revise antes de salvar.');
    form.elements.number?.focus();
  }
  function openTermsList(){const terms=data().consents;openModal('Termos e Autorizações',`<div class="toolbar"><button class="btn primary" data-action="new-consent">${icon('plus')} Novo termo</button></div><div class="list">${terms.map(t=>`<div class="list-row"><div class="list-row-main"><strong>${esc(t.title||'Autorização')}</strong><small>${esc(t.clientName||'Cliente')} · ${esc(t.orderId||'Sem OSV')}</small></div>${statusBadge(t.accepted?'Aceito':t.status||'Pendente')}<div class="actions"><button data-action="edit-consent" data-id="${attr(t.id)}">${icon('edit')}</button><button data-action="print-consent" data-id="${attr(t.id)}">${icon('pdf')}</button></div></div>`).join('')||'<div class="empty">Nenhum termo cadastrado.</div>'}</div>`,true);}

  function renderStagedPhotoPreview(form){
    const box=form?.querySelector('[data-photo-stage]');if(!box)return;
    for(const url of form.__stagedPhotoUrls||[])URL.revokeObjectURL(url);
    const files=form.__stagedPhotos||[],urls=files.map(file=>URL.createObjectURL(file));form.__stagedPhotoUrls=urls;
    box.innerHTML=files.map((f,i)=>`<div class="media-card"><img src="${urls[i]}" alt="Foto pronta para salvar"><div class="media-overlay">Pronta para salvar</div><button type="button" data-action="remove-staged-photo" data-index="${i}">${icon('trash',15)}</button></div>`).join('');
  }

  function appPrompt(title,label,defaultValue='',{multiline=false}={}){
    return new Promise(resolve=>{
      let settled=false,obs=null;
      const settle=v=>{if(settled)return;settled=true;PROMPT_RESOLVE=null;obs?.disconnect();resolve(v);};
      PROMPT_RESOLVE=settle;
      const field=multiline?textarea(label,'value',defaultValue,true):`<div class="field full"><label>${esc(label)}</label><input name="value" value="${attr(defaultValue)}" autocomplete="off"></div>`;
      openModal(title,`<form data-form="app-prompt">${field}<div class="form-actions"><button type="button" class="btn secondary" data-action="cancel-app-prompt">Cancelar</button><button class="btn primary">OK</button></div></form>`);
      requestAnimationFrame(()=>{const el=$('form[data-form="app-prompt"] [name="value"]');el?.focus();if(!multiline)el?.select();});
      const root=document.getElementById('modal-root');
      obs=new MutationObserver(()=>{if(!root.querySelector('form[data-form="app-prompt"]'))settle(null);});
      obs.observe(root,{childList:true,subtree:true});
    });
  }

  handleAction = async function(btn){
    const a=btn.dataset.action;
    try{
      if(a==='settings-category'){setSettingsCategory(btn.dataset.settingsCategory);renderView();return;}
      if(a==='factory-reset-app'){await factoryResetApp();return;}
      if(a==='new-test-profile'){
        const suggested='Teste '+(STATE.profiles.length+1);
        const name=await appPrompt('Novo perfil de teste','Nome do perfil (só para identificar neste dispositivo):',suggested);
        if(name===null)return;
        const clean=String(name||'').trim()||suggested;
        if(!await confirmAction(`Criar o perfil "${clean}" totalmente em branco (sem clientes, OSVs ou lançamentos) e trocar para ele agora? A integração com o Borion também reinicia do zero neste perfil novo — a integração do perfil atual fica guardada e volta intacta se você trocar de volta.`,{confirmLabel:'Criar perfil em branco'}))return;
        await MarcoStorage.createBackup(STATE,'antes-de-criar-perfil-teste');
        stashCurrentBridge();
        const profile=createBlankTestProfile(clean);
        STATE.activeProfileId=profile.id;
        restoreOrResetBridge(profile.id,{reset:true});
        await persist('Perfil de teste criado',clean,{immediate:true});
        renderShell();
        toast(`Perfil "${clean}" criado e ativo — comece os testes.`);
        return;
      }
      if(a==='switch-profile'){
        const target=STATE.profiles.find(p=>p.id===btn.dataset.id);if(!target||target.id===STATE.activeProfileId)return;
        if(!await confirmAction(`Trocar para o perfil "${target.name}"?`))return;
        stashCurrentBridge();
        STATE.activeProfileId=target.id;
        restoreOrResetBridge(target.id,{reset:false});
        await persist('Perfil trocado',target.name,{immediate:true});
        renderShell();
        toast(`Perfil "${target.name}" está ativo agora.`);
        return;
      }
      if(a==='delete-profile'){
        const target=STATE.profiles.find(p=>p.id===btn.dataset.id);if(!target)return;
        if(target.id===STATE.activeProfileId){toast('Troque para outro perfil antes de excluir este.','warn');return;}
        if(STATE.profiles.length<=1)return;
        if(!await confirmAction(`Excluir definitivamente o perfil "${target.name}" e todos os seus dados (clientes, OSVs, lançamentos)? Não pode ser desfeito.`,{confirmLabel:'Excluir perfil',tone:'danger'}))return;
        await MarcoStorage.createBackup(STATE,'antes-de-excluir-perfil');
        STATE.profiles=STATE.profiles.filter(p=>p.id!==target.id);
        delete STATE.dataByProfile[target.id];
        if(STATE.profileBridgeStash)delete STATE.profileBridgeStash[target.id];
        await persist('Perfil excluído',target.name,{immediate:true});
        renderView();
        toast('Perfil excluído.');
        return;
      }
      if(a==='product-sort'){const key=btn.dataset.sortKey;if(!['product','supplier','cost','margin','sale','stock','minimum'].includes(key))return;if(PRODUCT_SORT.key!==key)PRODUCT_SORT={key,direction:'desc'};else PRODUCT_SORT={key,direction:PRODUCT_SORT.direction==='default'?'desc':PRODUCT_SORT.direction==='desc'?'asc':'default'};if(PRODUCT_SORT.direction==='default')PRODUCT_SORT.key=null;saveProductSort();renderView();return;}
      if(a==='view-current-pdf'){await viewCurrentOrderPdf(btn.dataset.id);return;}
      if(a==='clear-order-filters'){ORDER_FILTERS.status='Todos';periodState('orders').month='';periodState('orders').days='';renderView();return;}
      if(a==='clear-finance-filter'){periodState('finance').month='';periodState('finance').days='';renderView();return;}
      if(a==='toggle-dashboard-layout'){DASHBOARD_LAYOUT_SNAPSHOT=clone(dashboardLayoutStore());DASHBOARD_LAYOUT_HISTORY=[];DASHBOARD_LAYOUT_EDIT=true;renderView();return;}
      if(a==='save-dashboard-layout'){DASHBOARD_LAYOUT_EDIT=false;await persist('Layout da Visão Geral salvo',screenBand(),{folder:false,google:false});DASHBOARD_LAYOUT_SNAPSHOT=null;DASHBOARD_LAYOUT_HISTORY=[];renderView();return;}
      if(a==='cancel-dashboard-layout'){const store=dashboardLayoutStore();Object.keys(store).forEach(k=>delete store[k]);Object.assign(store,clone(DASHBOARD_LAYOUT_SNAPSHOT||{}));DASHBOARD_LAYOUT_EDIT=false;DASHBOARD_LAYOUT_SNAPSHOT=null;DASHBOARD_LAYOUT_HISTORY=[];renderView();return;}
      if(a==='undo-dashboard-layout'){const previous=DASHBOARD_LAYOUT_HISTORY.pop();if(previous){const store=dashboardLayoutStore();Object.keys(store).forEach(k=>delete store[k]);Object.assign(store,previous);}renderView();return;}
      if(a==='reset-dashboard-layout'){pushDashboardHistory();const store=dashboardLayoutStore();Object.keys(store).forEach(k=>delete store[k]);renderView();return;}
      if(a==='widget-move'){pushDashboardHistory();const store=dashboardLayoutStore(),cards=$$('.dashboard-widget').sort((x,y)=>num(getComputedStyle(x).order)-num(getComputedStyle(y).order)),ids=cards.map(x=>x.dataset.widgetId),i=ids.indexOf(btn.dataset.id),j=Math.max(0,Math.min(ids.length-1,i+num(btn.dataset.dir)));[ids[i],ids[j]]=[ids[j],ids[i]];ids.forEach((id,order)=>{const l=store[id]||{};store[id]={...l,order};});renderView();return;}
      if(a==='widget-width'){pushDashboardHistory();const store=dashboardLayoutStore(),id=btn.dataset.id,l=store[id]||widgetLayout(id,0),spans=screenBand()==='mobile'?[12]:[3,4,6,8,12],i=Math.max(0,spans.indexOf(l.span));l.span=spans[Math.max(0,Math.min(spans.length-1,i+num(btn.dataset.dir)))];store[id]=l;renderView();return;}
      if(a==='widget-height'){pushDashboardHistory();const store=dashboardLayoutStore(),id=btn.dataset.id,l=store[id]||widgetLayout(id,0),heights=['auto','260px','420px'],i=heights.indexOf(l.height);l.height=heights[(i+1)%heights.length];store[id]=l;renderView();return;}
      if(a==='cancel-app-prompt'){PROMPT_RESOLVE?.(null);closeModal();return;}
      if(a==='remove-staged-photo'){const form=btn.closest('form[data-form="order"]');if(!form)return;form.__stagedPhotos=(form.__stagedPhotos||[]).filter((_,i)=>i!==num(btn.dataset.index));const dt=new DataTransfer();form.__stagedPhotos.forEach(f=>dt.items.add(f));const hidden=form.querySelector('[data-photos-merged]');if(hidden)hidden.files=dt.files;renderStagedPhotoPreview(form);return;}
      if(a==='new-client-from-order'){const form=btn.closest('form[data-form="order"]');PENDING_ORDER_DRAFT=orderDraftFromForm(form);openClientForm();return;}
      if(a==='new-equipment-type'){const value=await appPrompt('Novo tipo de equipamento','Nome do novo tipo de equipamento:','');if(!value)return;const clean=value.trim();if(!clean)return;if([...EQUIPMENT_TYPES,...currentProfileSettings().equipmentTypes].some(x=>normalizeText(x)===normalizeText(clean)))throw new Error('Este tipo de equipamento já existe.');currentProfileSettings().equipmentTypes.push(clean);await persist('Tipo de equipamento criado',clean);const select=btn.closest('.field')?.querySelector('select');if(select){select.insertAdjacentHTML('beforeend',`<option selected>${esc(clean)}</option>`);}toast('Tipo salvo para as próximas OSVs.');return;}
      if(a==='copy-code'){await navigator.clipboard?.writeText(btn.dataset.code||'');toast('Código copiado.');return;}
      if(a==='apply-cep-suggestion'){applyCepSuggestion(btn.dataset.index);return;}
      if(a==='add-payment-row'){const host=$('#order-payments-editor'),form=host?.closest('form[data-form="order"]'),remaining=suggestedPaymentValue(form);host?.insertAdjacentHTML('beforeend',paymentEditorRow({value:remaining,paymentMethod:'Pix',paymentDate:'',__suggested:true}));refreshPaymentRows();return;}
      if(a==='remove-payment-row'){const row=btn.closest('.payment-editor-row');if(row?.dataset.paymentId&&!await confirmAction('Cancelar este pagamento ao salvar a OSV? O ID e o histórico serão mantidos.'))return;row?.remove();refreshPaymentRows();return;}
      if(a==='save-order-followup'){const form=btn.closest('form[data-form="order"]');form.dataset.followup=btn.dataset.followup;form.requestSubmit();return;}
      if(a==='cancel-payment'){await cancelPayment(btn.dataset.id);return;}
      if(a==='update-cost'){openCostUpdate(btn.dataset.kind,btn.dataset.id);return;}
      if(a==='lookup-address-cep'){await lookupAddressCep();return;}
      if(a==='apply-cep-suggestion'){applyCepSuggestion(btn.dataset.index);return;}
      if(a==='lookup-cep'){await lookupCep();return;}
      if(a==='move-menu'){const order=currentProfileSettings().menuOrder,id=btn.dataset.id,i=order.indexOf(id),j=Math.max(0,Math.min(order.length-1,i+num(btn.dataset.dir)));if(i>=0&&i!==j){[order[i],order[j]]=[order[j],order[i]];await persist('Menu lateral reordenado',id,{folder:false,google:false});renderView();}return;}
      if(a==='reset-menu'){currentProfileSettings().menuOrder=MENU_DEFAULT.slice();await persist('Ordem do menu restaurada','',{folder:false,google:false});renderView();return;}
      if(a==='reset-all-layouts'){if(!await confirmAction('Restaurar layouts da Visão Geral e janelas sem apagar dados?'))return;currentProfileSettings().dashboardLayout={};currentProfileSettings().dashboardLayouts={};currentProfileSettings().formLayouts={};await persist('Layouts restaurados ao padrão','',{folder:false,google:false});renderView();return;}
      if(a==='move-item-row'){const row=btn.closest('.item-editor-row'),host=row?.parentElement,rows=host?[...host.querySelectorAll('.item-editor-row')]:[],i=rows.indexOf(row),j=Math.max(0,Math.min(rows.length-1,i+num(btn.dataset.dir)));if(i>=0&&i!==j){if(j>i)host.insertBefore(row,rows[j].nextSibling);else host.insertBefore(row,rows[j]);}return;}
      if(a==='toggle-form-layout'){startFormLayoutEditing();return;}
      if(a==='cancel-form-layout'){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(grid&&FORM_LAYOUT_SNAPSHOT)restoreFormLayout(grid,FORM_LAYOUT_SNAPSHOT);FORM_LAYOUT_SNAPSHOT=null;FORM_LAYOUT_HISTORY=[];setFormLayoutEditing(false);return;}
      if(a==='undo-form-layout'){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid'),previous=FORM_LAYOUT_HISTORY.pop();if(grid&&previous)restoreFormLayout(grid,previous);setFormLayoutEditing(true);return;}
      if(a==='reset-form-layout'){const form=$('#modal-root form[data-layout-key]'),grid=form?.querySelector('.form-grid');if(!form||!grid)return;pushFormLayoutHistory(grid);const key=formLayoutKey(form.dataset.layoutKey);delete currentProfileSettings().formLayouts[key];let defaults=[];try{defaults=JSON.parse(form.dataset.defaultLayout||'[]');}catch(_){defaults=[];}restoreFormLayout(grid,defaults);setFormLayoutEditing(true);return;}
      if(a==='form-field-width'){const field=btn.closest('[data-layout-field]'),grid=field?.parentElement;if(!field||!grid)return;pushFormLayoutHistory(grid);const order=screenBand()==='mobile'?['full']:['compact','half','full'],i=Math.max(0,order.indexOf(field.dataset.layoutSpan));field.dataset.layoutSpan=order[(i+1)%order.length];return;}
      if(a==='form-field-height'){const field=btn.closest('[data-layout-field]'),grid=field?.parentElement;if(!field||!grid)return;pushFormLayoutHistory(grid);const order=['auto','compact','tall'],i=Math.max(0,order.indexOf(field.dataset.layoutHeight));field.dataset.layoutHeight=order[(i+1)%order.length];return;}
      if(a==='open-legacy-migration'){if(!window.MarcoLegacyMigration?.open)throw new Error('O módulo de migração histórica não foi carregado. Atualize a página com Ctrl+F5.');await window.MarcoLegacyMigration.open();return;}
      if(a==='open-migration-picker'){const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='.csv,.json,.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';input.onchange=async()=>{const files=[...(input.files||[])];if(!files.length)return;setSaveStatus('Analisando migração…','warn');const analyzed=await analyzeMigrationFiles(files);MIGRATION_SESSION={files:analyzed,createdAt:nowIso(),plan:null,mappings:loadMigrationMappings(analyzed)};setSaveStatus('Pré-análise concluída','ok');openMigrationReview();};input.click();return;}
      if(a==='save-migration-mapping'){await saveMigrationMappingTemplate();return;}
      if(a==='refresh-migration-analysis'){openMigrationReview();return;}
      if(a==='simulate-migration'){MIGRATION_SESSION.files.forEach((x,i)=>{const select=$(`[data-migration-file-type="${i}"]`);if(select)x.type=select.value;});showMigrationSimulation();return;}
      if(a==='migration-back-analysis'){openMigrationReview();return;}
      if(a==='apply-migration'){await applyMigration();return;}
      if(a==='rollback-migration'){await rollbackLastMigration();return;}
      if(a==='export-migration-log'){exportMigrationLog();return;}
      if(a==='clear-documents-filter'){DOCUMENT_FILTER.date='';renderView();return;}
      if(a==='documents-terms'){openTermsList();return;}
      const result=await baseHandleAction(btn);requestAnimationFrame(()=>hydrateMoneyInputs($('#modal-root')));return result;
    }catch(e){console.error(e);setSaveStatus('Ação pendente','warn');toast(e.message||'Não foi possível concluir a ação.','error');}
  };

  handleSubmit = async function(form){
    if(form.dataset.form==='app-prompt'){const v=String(form.elements.value?.value||'').trim();PROMPT_RESOLVE?.(v||null);closeModal();return;}
    if(form.dataset.submitInflight==='1')return;
    const submit=form.querySelector('[type="submit"],button:not([type])');form.dataset.submitInflight='1';if(submit)submit.disabled=true;
    try{if(form.dataset.form==='cost-update'){await saveCostUpdate(form);return;}return await baseHandleSubmit(form);}
    catch(e){console.error(e);toast(e.message||'Não foi possível salvar.','error');}
    finally{delete form.dataset.submitInflight;if(submit?.isConnected)submit.disabled=false;}
  };

  function refreshStandalonePaymentForm(form){if(!form)return;const value=num(form.elements.value?.value),method=form.elements.paymentMethod?.value||'',fee=/débito|crédito/i.test(method)?num(form.elements.fee?.value):0,paymentDate=form.elements.paymentDate?.value||'',dueDate=form.elements.planned?.checked?(form.elements.dueDate?.value||''):'';const preview=form.querySelector('[data-payment-status-preview]');if(preview)preview.textContent=recordFinancialStatus({value,paymentDate,dueDate,status:'Em aberto'});form.querySelector('[data-payment-net]')?.replaceChildren(document.createTextNode(currency(value)));form.querySelector('[data-payment-fee-total]')?.replaceChildren(document.createTextNode(currency(fee)));form.querySelector('[data-payment-gross-total]')?.replaceChildren(document.createTextNode(currency(value+fee)));}
  document.addEventListener('keydown',async e=>{
    if(e.key!=='Enter'||e.shiftKey)return;
    const t=e.target;if(!t.matches)return;
    const isAddr=t.matches('form[data-form="client"] [data-address-fast]'),isZip=t.matches('form[data-form="client"] [data-zip-fast]');
    if(!isAddr&&!isZip)return;
    e.preventDefault();e.stopImmediatePropagation();
    clearTimeout(ADDRESS_LOOKUP_TIMER);
    if(isAddr)await lookupAddressCep(true).catch(()=>{});else await lookupCep(true).catch(()=>{});
    if(document.activeElement===t){const form=t.closest('form');if(isAddr)form?.elements?.zip?.focus();else form?.elements?.number?.focus();}
  });
  document.addEventListener('focusin',e=>{if(isMoneyInput(e.target))MarcoMoney?.bind?.(e.target);});
  document.addEventListener('input',e=>{
    const t=e.target;if(t.closest?.('form[data-form="cost-update"]')){const form=t.closest('form'),cost=num(form.elements.newCost?.value),marginInput=form.elements.newMargin,priceInput=form.elements.newPrice,label=form.querySelector('[data-cost-margin-label]');if(t.matches('[data-cost-margin],[data-cost-new]')&&marginInput&&priceInput){const margin=Math.max(0,Math.min(.99,num(marginInput.value)/100));window.MarcoMoney?.setValue(priceInput,marginPrice(cost,margin));if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}if(t.matches('[data-cost-price]')&&marginInput){const price=num(priceInput.value),margin=price>0?Math.max(0,Math.min(.99,(price-cost)/price)):0;marginInput.value=(margin*100).toFixed(2);if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}}if(t.dataset.mask==='document')t.value=maskDocument(t.value);if(t.dataset.mask==='phone')t.value=maskPhone(t.value);if(t.dataset.mask==='zip')t.value=maskZip(t.value);
    if(t.matches('form[data-form="client"] [data-address-fast]')){clearTimeout(ADDRESS_LOOKUP_TIMER);const val=t.value.trim();if(val.length>=3)ADDRESS_LOOKUP_TIMER=setTimeout(()=>{lookupAddressCep(true).catch(()=>{});},650);}
    if(t.matches('form[data-form="client"] [data-zip-fast]')){clearTimeout(ADDRESS_LOOKUP_TIMER);if(digitsOnly(t.value).length===8)ADDRESS_LOOKUP_TIMER=setTimeout(()=>{lookupCep(true).catch(()=>{});},200);}
    if(t.matches('[data-client-search]')){const select=t.closest('.client-search-row')?.querySelector('select[name="clientId"]'),current=select?.value||'';if(select){select.innerHTML=`<option value="__new__">+ Adicionar novo cliente</option><option value="" ${current?'':'selected'}>Selecione um cliente</option>${sortedActiveClients(t.value).filter(c=>!t.value||normalizeText(c.name).includes(normalizeText(t.value))).map(c=>`<option value="${attr(c.id)}" ${c.id===current?'selected':''}>${esc(c.name)} · ${esc(c.id)}</option>`).join('')}`;}}
    if(t.matches('select[name="clientId"]')&&t.value==='__new__'&&t.closest('form[data-form="order"]')){const form=t.closest('form[data-form="order"]');PENDING_ORDER_DRAFT=orderDraftFromForm(form);openClientForm();return;}
    if(t.matches('[data-product-cost],[data-product-margin]')){const form=t.closest('form[data-form="product"]'),cost=num(form?.elements.cost?.value),margin=num(form?.elements.margin?.value)/100,price=form?.elements.salePrice;if(price)window.MarcoMoney?.setValue(price,marginPrice(cost,margin));const label=form?.querySelector('[data-margin-label]');if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}
    if(t.matches('[data-product-price]')){const form=t.closest('form[data-form="product"]'),cost=num(form?.elements.cost?.value),price=num(form?.elements.salePrice?.value),margin=price>0?Math.max(0,Math.min(.99,(price-cost)/price)):0;if(form?.elements.margin)form.elements.margin.value=(margin*100).toFixed(2);const label=form?.querySelector('[data-margin-label]');if(label)label.textContent=`${(margin*100).toFixed(2).replace(/\.?0+$/,'').replace('.',',')}%`;}
    if(t.matches('[data-payment-field="value"]')&&t.closest('.payment-editor-row')&&e.isTrusted){const row=t.closest('.payment-editor-row');row.dataset.paymentManual='true';row.dataset.paymentAutoSuggested='false';}
    if(t.closest('.payment-editor-row'))refreshPaymentRows();
    if(t.closest('form[data-form="payment"]'))refreshStandalonePaymentForm(t.closest('form'));
  });
  document.addEventListener('change',async e=>{
    const t=e.target;
    if(t.matches('[data-photo-input]')){
      const form=t.closest('form[data-form="order"]');if(!form)return;
      const files=[...(t.files||[])].filter(f=>f.type.startsWith('image/'));
      if(files.length){
        form.__stagedPhotos=[...(form.__stagedPhotos||[]),...files];
        const dt=new DataTransfer();form.__stagedPhotos.forEach(f=>dt.items.add(f));
        const hidden=form.querySelector('[data-photos-merged]');if(hidden)hidden.files=dt.files;
        renderStagedPhotoPreview(form);
        if(MobileMarco?.isMobile?.())MobileMarco.haptic(6);
        toast(`${files.length} foto(s) pronta(s). Salve a OSV para gravar.`,'ok');
      }
      t.value='';
      return;
    }
    if(t.matches('[data-period-month]')){const section=t.dataset.periodMonth;periodState(section).month=t.value;renderView();return;}
    if(t.matches('[data-period-days]')){const section=t.dataset.periodDays;periodState(section).days=t.value;renderView();return;}
    if(t.id==='order-status-filter'){ORDER_FILTERS.status=t.value;renderView();return;}
    if(t.matches('[data-quick-order-status]')){await changeOrderStatusQuick(t.dataset.quickOrderStatus,t.value);return;}
    if(t.matches('[data-module-setting]')){currentProfileSettings().modules[t.dataset.moduleSetting]=t.checked;if(!t.checked&&CURRENT_VIEW===t.dataset.moduleSetting)CURRENT_VIEW='dashboard';await persist('Módulo atualizado',`${t.dataset.moduleSetting}: ${t.checked?'ativo':'inativo'}`);renderShell();return;}
    if(t.matches('[data-client-state]')){await loadCitiesForState(t.value);return;}
    if(t.matches('.payment-editor-row [data-payment-field]')){const row=t.closest('.payment-editor-row');if(t.matches('[data-payment-field="planned"]')&&t.checked){const paid=$('[data-payment-field="paymentDate"]',row);if(paid)paid.value='';}refreshPaymentRows();return;}
    if(t.closest('form[data-form="payment"]')&&(t.name==='planned'||t.name==='paymentMethod')){const form=t.closest('form'),planned=form.elements.planned?.checked;if(t.name==='planned'&&planned)form.elements.paymentDate.value='';form.querySelector('.payment-due')?.classList.toggle('is-hidden',!planned);form.querySelector('.payment-fee')?.classList.toggle('is-hidden',!/débito|crédito/i.test(form.elements.paymentMethod.value));refreshStandalonePaymentForm(form);return;}
    if(t.matches('[data-migration-field-source]')&&MIGRATION_SESSION){const hash=t.dataset.migrationSourceHash,source=t.dataset.migrationFieldSource,map=migrationMaps().fields[hash]=migrationMaps().fields[hash]||{};for(const key of Object.keys(map))if(map[key]===source)delete map[key];if(t.value&&t.value!=='__ignore__')map[normalizeText(t.value)]=source;const ignored=migrationMaps().ignoredFields[hash]=migrationMaps().ignoredFields[hash]||[];migrationMaps().ignoredFields[hash]=ignored.filter(x=>x!==source);if(t.value==='__ignore__')migrationMaps().ignoredFields[hash].push(source);MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-order-status]')&&MIGRATION_SESSION){migrationMaps().orderStatus[t.dataset.migrationMapOrderStatus]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-payment-method]')&&MIGRATION_SESSION){migrationMaps().paymentMethod[t.dataset.migrationMapPaymentMethod]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-client]')&&MIGRATION_SESSION){migrationMaps().clients[t.dataset.migrationMapClient]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-item-type]')&&MIGRATION_SESSION){migrationMaps().itemType[t.dataset.migrationMapItemType]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-catalog]')&&MIGRATION_SESSION){migrationMaps().catalog[t.dataset.migrationMapCatalog]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-map-media]')&&MIGRATION_SESSION){migrationMaps().media[t.dataset.migrationMapMedia]=t.value;MIGRATION_SESSION.plan=null;return;}
    if(t.matches('[data-migration-file-type]')&&MIGRATION_SESSION){MIGRATION_SESSION.files[num(t.dataset.migrationFileType)].type=t.value;MIGRATION_SESSION.plan=null;return;}
  });

  let dragSource=null;
  document.addEventListener('dragstart',e=>{const el=e.target.closest('[data-widget-id],[data-menu-id],[data-layout-field],[data-order-item]');if(!el)return;dragSource=el;if(el.dataset.layoutField&&el.closest('form[data-layout-key]')?.classList.contains('form-layout-editing'))pushFormLayoutHistory(el.parentElement);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',el.dataset.widgetId||el.dataset.menuId||el.dataset.layoutField||el.dataset.itemId||'');});
  document.addEventListener('dragover',e=>{if(dragSource&&e.target.closest('[data-widget-id],[data-menu-id],[data-layout-field],[data-order-item]'))e.preventDefault();});
  document.addEventListener('drop',async e=>{const target=e.target.closest('[data-widget-id],[data-menu-id],[data-layout-field],[data-order-item]');if(!dragSource||!target||dragSource===target)return;const sameKind=(dragSource.dataset.widgetId&&target.dataset.widgetId)||(dragSource.dataset.menuId&&target.dataset.menuId)||(dragSource.dataset.layoutField&&target.dataset.layoutField)||(dragSource.dataset.orderItem&&target.dataset.orderItem);if(!sameKind||dragSource.parentElement!==target.parentElement){dragSource=null;return;}e.preventDefault();target.parentElement.insertBefore(dragSource,target);if(dragSource.dataset.widgetId){pushDashboardHistory();const store=dashboardLayoutStore();[...target.parentElement.children].filter(x=>x.dataset.widgetId).forEach((x,order)=>{const l=store[x.dataset.widgetId]||{};store[x.dataset.widgetId]={...l,order};});renderView();}else if(dragSource.dataset.menuId){currentProfileSettings().menuOrder=[...target.parentElement.querySelectorAll('[data-menu-id]')].map(x=>x.dataset.menuId);await persist('Menu lateral reordenado','arrastar e soltar',{folder:false,google:false});renderView();}else if(dragSource.dataset.layoutField){const form=target.closest('form[data-layout-key]');if(form?.classList.contains('form-layout-editing'))setFormLayoutEditing(true);}dragSource=null;});

  const baseOpenClientDetail = openClientDetail;
  openClientDetail = function(id){baseOpenClientDetail(id);requestAnimationFrame(()=>{const body=$('#modal-root .modal-body');if(!body)return;body.innerHTML=body.innerHTML.replace(/Nova OS(?!V)/g,'Nova OSV').replace(/\bOS\b/g,'OSV');const history=data().priceHistory.filter(h=>h.clientId===id).sort((a,b)=>String(b.date||'').localeCompare(a.date||''));if(history.length&&!body.querySelector('[data-client-price-history]'))body.insertAdjacentHTML('beforeend',`<section class="card" data-client-price-history style="margin-top:16px"><div class="card-header"><div><h3>Histórico de preços praticados</h3><p>Valores efetivamente cobrados deste cliente, sem alterar o catálogo.</p></div></div>${history.slice(0,30).map(r=>`<div class="list-row"><div class="list-row-main"><strong>${esc(r.description||r.type)} · ${currency(r.unitPrice)}</strong><small>${formatDate(r.date)} · ${esc(r.orderId)} · padrão ${currency(r.standardPrice)} · qtd. ${num(r.quantity)}</small></div><button class="code-link" data-action="view-order" data-id="${attr(r.orderId)}">Abrir OSV</button></div>`).join('')}</section>`);});};

  /* Modo nuvem obrigatória: nenhum atalho de entrada sem Google é criado. */


  /* =========================================================
     v2.2.0 — identificadores, telefones, mídia, WhatsApp, autocomplete,
     PDF, rascunhos e concorrência da OSV.
     ========================================================= */
  const QUICK_STATUS_INFLIGHT_219=new Map();
  const PDF_INFLIGHT_219=new Map();
  const SHARE_INFLIGHT_219=new Map();
  const DRAFT_FLUSH_INFLIGHT_219=new Map();
  const PAYMENT_SAVE_INFLIGHT_219=new Map();
  let ORDER_DRAFT_TIMER_219=0;
  let ORDER_DRAFT_RESTORING_219=false;
  let WHATSAPP_REVIEW_219=null;
  let SUPPRESS_QUICK_ACTION_CLICK_219=false;

  function orderDraftKey219(target='new'){
    const profileId=activeProfile()?.id||STATE?.activeProfileId||'default';
    let suffix='new';
    if(target&&typeof target==='object'&&target.dataset){suffix=target.dataset.id||'new';}
    else if(typeof target==='string'&&target)suffix=target;
    return `osv:${profileId}:${suffix}`;
  }
  function draftFileSignature219(file){return [file?.name||'',file?.size||0,file?.type||'',file?.lastModified||0].join('|');}
  async function persistDraftFiles219(files,previousRefs,key,kind){
    const oldBySignature=new Map((previousRefs||[]).map(ref=>[ref.signature,ref]));
    const next=[];
    for(const file of files||[]){
      if(!(file instanceof Blob)||file.size<=0)continue;
      const signature=draftFileSignature219(file),old=oldBySignature.get(signature);
      if(old){next.push(old);oldBySignature.delete(signature);continue;}
      const record=await MarcoStorage.putDraftMedia(file,{name:file.name||`${kind}.bin`,type:file.type||'application/octet-stream',draftKey:key});
      next.push({id:record.id,signature,name:file.name||record.name,type:file.type||record.type,size:file.size,lastModified:file.lastModified||0,kind});
    }
    for(const stale of oldBySignature.values())await MarcoStorage.deleteDraftMedia(stale.id).catch(e=>console.warn('Falha ao limpar mídia temporária do rascunho:',e));
    return next;
  }
  async function flushOrderDraft219(form=$('form[data-form="order"]')){
    if(!form||ORDER_DRAFT_RESTORING_219||!form.isConnected)return null;
    const key=form.dataset.draftKey||orderDraftKey219(form);
    if(DRAFT_FLUSH_INFLIGHT_219.has(key))return DRAFT_FLUSH_INFLIGHT_219.get(key);
    const task=(async()=>{
      const previous=await MarcoStorage.getDraft(key).catch(()=>null);
      const draft=orderDraftFromForm(form);
      draft.key=key;
      draft.schemaVersion=1;
      draft.reservedCode=form.dataset.reservedCode||draft.__id||'';
      draft.__id=form.dataset.id||draft.reservedCode||'';
      draft.clientSearch=form.querySelector('[data-client-search]')?.value||'';
      draft.updatedAt=nowIso();
      const stagedPhotos=form.__stagedPhotos||[...(form.elements.photos?.files||[])];
      const stagedAttachments=[...(form.elements.attachments?.files||[])];
      draft.photoMedia=await persistDraftFiles219(stagedPhotos,previous?.photoMedia,key,'photo');
      draft.attachmentMedia=await persistDraftFiles219(stagedAttachments,previous?.attachmentMedia,key,'attachment');
      await MarcoStorage.saveDraft(key,draft);
      const status=form.querySelector('[data-draft-status]');
      if(status){status.textContent='Rascunho salvo';status.dataset.tone='ok';}
      return draft;
    })().catch(e=>{console.error('Falha ao salvar rascunho da OSV:',{key,error:e});const status=form.querySelector('[data-draft-status]');if(status){status.textContent='Rascunho pendente';status.dataset.tone='warn';}throw e;}).finally(()=>DRAFT_FLUSH_INFLIGHT_219.delete(key));
    DRAFT_FLUSH_INFLIGHT_219.set(key,task);
    return task;
  }
  function scheduleOrderDraft219(form){
    if(!form||ORDER_DRAFT_RESTORING_219)return;
    clearTimeout(ORDER_DRAFT_TIMER_219);
    const status=form.querySelector('[data-draft-status]');
    if(status){status.textContent='Salvando rascunho…';status.dataset.tone='saving';}
    ORDER_DRAFT_TIMER_219=setTimeout(()=>flushOrderDraft219(form).catch(()=>{}),420);
  }
  async function deleteDraftRecord219(key){
    if(!key)return;
    const draft=await MarcoStorage.getDraft(key).catch(()=>null);
    for(const ref of [...(draft?.photoMedia||[]),...(draft?.attachmentMedia||[])])await MarcoStorage.deleteDraftMedia(ref.id).catch(e=>console.warn('Falha ao remover mídia temporária:',e));
    await MarcoStorage.deleteDraft(key).catch(e=>console.warn('Falha ao excluir rascunho:',e));
  }
  async function discardOrderDraft219(form){
    clearTimeout(ORDER_DRAFT_TIMER_219);
    const key=form?.dataset.draftKey||orderDraftKey219(form||'new');
    await deleteDraftRecord219(key);
    if(form?.dataset.id)await deleteDraftRecord219(orderDraftKey219(form.dataset.id));
    closeModal({reason:'cancelled'});
    toast('Rascunho descartado.','ok');
  }
  async function clearOrderDraftAfterSave219(form,id){
    clearTimeout(ORDER_DRAFT_TIMER_219);
    const keys=new Set([form?.dataset.draftKey,orderDraftKey219('new'),orderDraftKey219(id)].filter(Boolean));
    for(const key of keys)await deleteDraftRecord219(key);
  }
  async function fileFromDraftRef219(ref){
    const record=await MarcoStorage.getMedia(ref.id);if(!record?.blob)return null;
    try{return new File([record.blob],ref.name||record.name||'arquivo',{type:ref.type||record.type||record.blob.type,lastModified:ref.lastModified||Date.now()});}
    catch(_){const blob=record.blob;blob.name=ref.name||record.name||'arquivo';blob.lastModified=ref.lastModified||Date.now();return blob;}
  }
  async function restoreDraftMedia219(form,draft){
    if(!form||!draft)return;
    const photos=(await Promise.all((draft.photoMedia||[]).map(fileFromDraftRef219))).filter(Boolean);
    const attachments=(await Promise.all((draft.attachmentMedia||[]).map(fileFromDraftRef219))).filter(Boolean);
    form.__stagedPhotos=photos;
    if(typeof DataTransfer!=='undefined'){
      const photoDt=new DataTransfer();photos.forEach(f=>photoDt.items.add(f));const photoInput=form.querySelector('[data-photos-merged]');if(photoInput)photoInput.files=photoDt.files;
      const attachmentDt=new DataTransfer();attachments.forEach(f=>attachmentDt.items.add(f));if(form.elements.attachments)form.elements.attachments.files=attachmentDt.files;
    }
    renderStagedPhotoPreview(form);
    if(attachments.length){
      const section=form.querySelector('.osv-technical-attachments');
      if(section&&!section.querySelector('[data-draft-attachments]'))section.insertAdjacentHTML('beforeend',`<div class="compact-file-list" data-draft-attachments>${attachments.map(f=>`<span>${esc(f.name||'Anexo temporário')} · rascunho</span>`).join('')}</div>`);
    }
  }

  function stableHash219(value){
    const walk=v=>Array.isArray(v)?v.map(walk):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,walk(v[k])])):v;
    const text=JSON.stringify(walk(value));let hash=2166136261;
    for(let i=0;i<text.length;i++){hash^=text.charCodeAt(i);hash=Math.imul(hash,16777619);}
    return `fp-${(hash>>>0).toString(16).padStart(8,'0')}`;
  }
  function orderPdfFingerprint219(orderId){
    const o=findOrder(orderId);if(!o)return '';
    const fields=['id','clientId','clientName','pdfTemplateId','openedAt','completedAt','status','equipmentType','brandModel','serialNumber','accessPassword','accessories','reportedIssue','technicalReport','clientNotes','internalNotes','discount','total'];
    const order=Object.fromEntries(fields.map(k=>[k,o[k]??'']));
    const items=orderItems(orderId).map(x=>({id:x.id,type:x.type,productId:x.productId||'',serviceId:x.serviceId||'',quantity:num(x.quantity),unitPrice:num(x.unitPrice),subtotal:num(x.subtotal),lowerStock:!!x.lowerStock})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const payments=orderPayments(orderId).filter(p=>!paymentIsCancelled(p)).map(p=>({id:p.id,value:num(p.value),fee:num(p.fee),paymentMethod:p.paymentMethod||'',paymentDate:p.paymentDate||'',dueDate:p.dueDate||'',notes:p.notes||''})).sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    const photos=(o.photos||[]).map(m=>({id:m.id,fileName:m.fileName||'',createdAt:m.createdAt||''}));
    const attachments=(o.attachments||[]).map(m=>({id:m.id,fileName:m.fileName||'',createdAt:m.createdAt||''}));
    const template=(currentProfileSettings().pdfTemplates||[]).find(t=>t.id===(o.pdfTemplateId||currentProfileSettings().defaultPdfTemplateId));
    const templateState=template?{id:template.id,version:template.version||1,updatedAt:template.updatedAt||'',schemaVersion:template.schemaVersion||1}:null;
    return stableHash219({order,items,payments,photos,attachments,template:templateState});
  }
  function isHistoricalPdf219(meta){
    return !!(meta?.legacy||meta?.legacyImported||meta?.importedLegacy||meta?.historicalImported||meta?.generatedByCurrentApp===false);
  }
  function latestOfficialPdfMeta219(orderId){
    const order=findOrder(orderId),all=(order?.pdfs||[]).filter(m=>m.official!==false).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
    return all.find(m=>!isHistoricalPdf219(m))||all.find(isHistoricalPdf219)||null;
  }
  function setPdfState219(form,state,message=''){
    if(!form)return;
    form.dataset.pdfState=state;
    const box=form.querySelector('[data-pdf-status]'),text=form.querySelector('[data-pdf-status-text]'),button=form.querySelector('[data-pdf-generate]');
    if(box){box.dataset.pdfState=state;box.setAttribute('aria-busy',state==='generating'?'true':'false');}
    const labels={idle:'Gere o PDF quando a OSV estiver pronta.',dirty:'PDF desatualizado — gere novamente.',generating:'Gerando PDF…',ready:'PDF pronto',error:'Não foi possível gerar o PDF.'};
    if(text)text.textContent=message||labels[state]||labels.idle;
    if(button){button.disabled=state==='generating';button.setAttribute('aria-busy',state==='generating'?'true':'false');button.innerHTML=state==='generating'?`<span class="pdf-button-spinner" aria-hidden="true"></span><span>Gerando PDF…</span>`:`${icon('pdf')} <span>Gerar PDF</span>`;}
  }
  function markOrderPdfDirty219(form){
    if(!form||ORDER_DRAFT_RESTORING_219||form.dataset.pdfState==='generating')return;
    const hasPdf=form.dataset.hadPdf==='1'||form.dataset.pdfState==='ready';
    if(hasPdf)setPdfState219(form,'dirty','PDF desatualizado — gere novamente.');
  }
  async function setupOrderForm219(form,draft=null){
    if(!form)return;
    ORDER_DRAFT_RESTORING_219=true;
    try{
      form.dataset.draftKey=orderDraftKey219(form.dataset.id||'new');
      form.__pendingMediaDeletes=form.__pendingMediaDeletes||new Set();
      await hydrateOrderFormMedia219(form);
      const preview=form.querySelector('.osv-code-preview');
      if(preview&&!preview.querySelector('[data-draft-status]'))preview.insertAdjacentHTML('beforeend','<span class="draft-save-state" data-draft-status data-tone="idle">Rascunho automático</span>');
      if(draft?.clientSearch&&form.querySelector('[data-client-search]'))form.querySelector('[data-client-search]').value=draft.clientSearch;
      await restoreDraftMedia219(form,draft);
      const orderId=form.dataset.id||'';
      const latest=orderId?latestOfficialPdfMeta219(orderId):null,historical=latest&&isHistoricalPdf219(latest),current=latest&&(historical||latest.sourceFingerprint===orderPdfFingerprint219(orderId));
      form.dataset.hadPdf=latest?'1':'0';
      setPdfState219(form,current?'ready':latest?'dirty':'idle',historical?'PDF histórico preservado e disponível.':current?'PDF pronto':latest?'PDF desatualizado — gere novamente.':'Gere o PDF quando a OSV estiver pronta.');
    }finally{ORDER_DRAFT_RESTORING_219=false;}
  }

  const openOrderForm218=openOrderForm;
  openOrderForm=function(id='',prefill={}){
    const openWith=(payload,draft)=>{
      openOrderForm218(id,payload||{});
      requestAnimationFrame(()=>setupOrderForm219($('form[data-form="order"]'),draft).catch(e=>console.error('Falha ao restaurar rascunho:',e)));
      if(draft&&!draft.__restoredToastShown){draft.__restoredToastShown=true;toast('Rascunho da OSV restaurado.','ok');}
    };
    if(prefill?.__draft||prefill?.__skipStoredDraft){openWith(prefill,prefill?.__draft?prefill:null);return;}
    const key=orderDraftKey219(id||'new');
    MarcoStorage.getDraft(key).then(draft=>openWith(draft?{...draft,__draft:true}:prefill,draft)).catch(e=>{console.error('Falha ao consultar rascunho:',e);openWith(prefill,null);});
  };

  const closeModal218=closeModal;
  closeModal=function(options=false){
    const opts=typeof options==='object'&&options!==null?options:{immediate:options===true,reason:'dismiss'};
    const reason=opts.reason||'dismiss',form=$('#modal-root form[data-form="order"]');
    releaseOrderFormMediaUrls219(form);
    if(form&&!['saved','cancelled','replace-modal'].includes(reason)){
      clearTimeout(ORDER_DRAFT_TIMER_219);
      return flushOrderDraft219(form).catch(()=>{}).finally(()=>closeModal218(!!opts.immediate));
    }
    return closeModal218(!!opts.immediate);
  };

  function clientSuggestionRows219(query){
    const q=normalizeText(query);if(!q)return [];
    return activeItems(data().clients).map(c=>{const name=normalizeText(c.name),first=firstName(c.name);let priority=4;if(first===q)priority=0;else if(first.startsWith(q))priority=1;else if(name.startsWith(q))priority=2;else if(name.includes(q))priority=3;return {c,priority};}).filter(x=>x.priority<4).sort((a,b)=>a.priority-b.priority||String(a.c.name||'').localeCompare(String(b.c.name||''),'pt-BR',{sensitivity:'base'})).slice(0,10).map(x=>x.c);
  }
  function closeClientSuggestions219(input=$('[data-client-search]')){const row=input?.closest('.client-search-row'),list=row?.querySelector('.client-suggestions');if(list){list.hidden=true;list.innerHTML='';}row?.classList.remove('suggestions-open');if(input){input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.dataset.activeIndex='-1';}}
  function renderClientSuggestions219(input){
    const list=input?.closest('.client-search-row')?.querySelector('.client-suggestions');if(!list)return;
    const query=input.value.trim();if(!query){closeClientSuggestions219(input);return;}
    const rows=clientSuggestionRows219(query);
    list.innerHTML=(rows.length?rows.map((c,i)=>`<button type="button" role="option" aria-selected="false" id="client-option-${attr(c.id)}" class="client-suggestion" data-client-option-id="${attr(c.id)}" data-option-index="${i}"><strong>${esc(c.name)}</strong><small>${esc(c.id)}</small></button>`).join(''):'<div class="client-suggestion-empty">Nenhum cliente encontrado.</div>')+`<button type="button" class="client-suggestion add-client" data-action="new-client-from-order">${icon('plus',16)} Adicionar novo cliente</button>`;
    list.hidden=false;input.closest('.client-search-row')?.classList.add('suggestions-open');input.setAttribute('aria-expanded','true');input.dataset.activeIndex='-1';
  }
  function chooseClientSuggestion219(input,id){
    const client=findClient(id),form=input?.closest('form[data-form="order"]');if(!client||!form)return;
    input.value=client.name;form.elements.clientId.value=client.id;input.dataset.selectedClientId=client.id;closeClientSuggestions219(input);input.classList.add('has-valid-client');scheduleOrderDraft219(form);markOrderPdfDirty219(form);
  }
  function moveClientSuggestion219(input,delta){
    const list=input.closest('.client-search-row')?.querySelector('.client-suggestions'),options=[...(list?.querySelectorAll('[data-client-option-id]')||[])];if(!options.length)return;
    let index=Number(input.dataset.activeIndex||-1);index=(index+delta+options.length)%options.length;input.dataset.activeIndex=String(index);options.forEach((opt,i)=>opt.setAttribute('aria-selected',i===index?'true':'false'));options[index].scrollIntoView({block:'nearest'});input.setAttribute('aria-activedescendant',options[index].id);
  }

  async function copyTextToClipboard219(text){
    const value=String(text??'');
    if(navigator.clipboard?.writeText){try{await navigator.clipboard.writeText(value);return true;}catch(e){console.warn('Clipboard API indisponível; usando fallback.',e);}}
    const area=document.createElement('textarea');area.value=value;area.setAttribute('readonly','');area.style.position='fixed';area.style.opacity='0';area.style.pointerEvents='none';document.body.appendChild(area);area.select();let copied=false;try{copied=document.execCommand('copy');}finally{area.remove();}if(!copied)throw new Error('Não foi possível copiar a mensagem.');return true;
  }
  async function getLatestOfficialPdf219(orderId){
    const order=findOrder(orderId);if(!order)throw new Error('OSV não encontrada.');
    const meta=latestOfficialPdfMeta219(orderId);if(!meta)return null;
    const blob=await getMediaBlob(meta);if(!blob)return null;
    const file=blob instanceof File?blob:new File([blob],meta.fileName||`${orderId}.pdf`,{type:'application/pdf'});
    return {order,meta,blob,file,current:isHistoricalPdf219(meta)||meta.sourceFingerprint===orderPdfFingerprint219(orderId),historical:isHistoricalPdf219(meta)};
  }
  async function ensureCurrentOrderPdf219(orderId){
    const latest=await getLatestOfficialPdf219(orderId);
    if(!latest)throw new Error('Gere o PDF antes de enviar pelo WhatsApp.');
    if(!latest.current)throw new Error('O PDF precisa ser gerado novamente.');
    return latest;
  }
  function closeWhatsAppReview219(){const root=$('#confirm-root');root?.querySelector('.whatsapp-review-backdrop')?.remove();WHATSAPP_REVIEW_219=null;}
  function openWhatsAppReview219({orderId,pdfFile,message}){
    const order=findOrder(orderId),client=findClient(order?.clientId)||{name:order?.clientName||'cliente'};WHATSAPP_REVIEW_219={orderId,pdfFile,client,sharing:false};
    const root=$('#confirm-root');root.innerHTML=`<div class="whatsapp-review-backdrop"><section class="whatsapp-review-modal" data-order-id="${attr(orderId)}" role="dialog" aria-modal="true" aria-labelledby="whatsapp-review-title"><header><h2 id="whatsapp-review-title">Revisar mensagem</h2><p>Edite o texto. No Android compatível, ele seguirá junto com o PDF no mesmo compartilhamento.</p></header><textarea data-whatsapp-message>${esc(message)}</textarea><div class="whatsapp-review-actions"><button type="button" class="btn secondary" data-action="whatsapp-review-cancel">Cancelar</button><button type="button" class="btn secondary" data-action="whatsapp-review-copy">Copiar texto</button><button type="button" class="btn primary" data-action="whatsapp-review-ok">OK</button></div></section></div>`;
    requestAnimationFrame(()=>root.querySelector('[data-whatsapp-message]')?.focus());
  }
  async function openOrderShareReview219(orderId){
    if(SHARE_INFLIGHT_219.has(orderId))return SHARE_INFLIGHT_219.get(orderId);
    const task=(async()=>{
      const latest=await ensureCurrentOrderPdf219(orderId),client=findClient(latest.order.clientId)||{name:latest.order.clientName||'cliente',phone:'',phoneNormalized:''};
      if(!whatsappNumber(client.phoneNormalized||client.phone))throw new Error('Cadastre um telefone válido com DDD para enviar pelo WhatsApp.');
      const message=`Olá, ${client.name||'cliente'}!\n\nSegue em anexo o pedido do serviço realizado, referente à ${latest.order.id}.\n\nObrigado pela preferência! Qualquer dúvida, fico à disposição.`;
      openWhatsAppReview219({orderId,pdfFile:latest.file,message});
    })().finally(()=>SHARE_INFLIGHT_219.delete(orderId));
    SHARE_INFLIGHT_219.set(orderId,task);return task;
  }
  async function shareOrderPdfWithMessage219({orderId,pdfFile,message}){
    const order=findOrder(orderId),client=findClient(order?.clientId)||{phone:'',phoneNormalized:''};if(!order)throw new Error('OSV não encontrada.');
    const phone=whatsappNumber(client.phoneNormalized||client.phone);if(!phone)throw new Error('Cadastre um telefone válido com DDD para enviar pelo WhatsApp.');
    if(!(pdfFile instanceof File)||pdfFile.type!=='application/pdf')pdfFile=new File([pdfFile],`${order.id}_${timestampFile()}.pdf`,{type:'application/pdf'});
    let canNative=false;
    try{canNative=!!navigator.share&&!!navigator.canShare&&navigator.canShare({files:[pdfFile]});}
    catch(e){console.warn('navigator.canShare rejeitou o arquivo; usando fallback:',e);}
    if(canNative){
      try{
        await navigator.share({files:[pdfFile],title:order.id,text:message});
        addAudit('Compartilhamento iniciado',`${order.id} · confirmação depende do usuário`);await persist('', '', {media:false});
        toast('Compartilhamento com PDF e mensagem iniciado.','ok');closeWhatsAppReview219();return {mode:'native'};
      }catch(e){
        if(e?.name==='AbortError'){toast('Compartilhamento cancelado. A mensagem continua disponível para nova tentativa.','warn');return {mode:'cancelled'};}
        console.warn('Compartilhamento nativo falhou; usando fallback:',e);
      }
    }
    await copyTextToClipboard219(message).catch(e=>{console.warn('Não foi possível copiar automaticamente:',e);return false;});
    MarcoStorage.downloadBlob(pdfFile,pdfFile.name||`${order.id}_${timestampFile()}.pdf`);
    const whatsappUrl=`https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl,'_blank','noopener');
    addAudit('WhatsApp aberto para envio',`${order.id} · PDF baixado para anexação manual`);await persist('', '', {media:false});
    toast('Este navegador não permite anexar o PDF automaticamente. A conversa foi aberta, a mensagem foi preenchida e o PDF foi baixado para anexação manual.','warn');closeWhatsAppReview219();return {mode:'fallback'};
  }

  generatePdfForOrder=async function(orderId,share=false){
    if(share)return await openOrderShareReview219(orderId);
    if(PDF_INFLIGHT_219.has(orderId))return PDF_INFLIGHT_219.get(orderId);
    const task=(async()=>{
      const order=findOrder(orderId);if(!order)throw new Error('OSV não encontrada.');const client=findClient(order.clientId)||{name:order.clientName,phone:''};const form=$('form[data-form="order"]');
      setPdfState219(form,'generating');setSaveStatus('Gerando PDF…','warn');
      let record=null,newMeta=null;const previousPdfs=clone(order.pdfs||[]);
      try{
        const result=await MarcoPdf.generate(order,{client,company:company(),items:orderItems(order.id),payments:orderPayments(order.id).filter(p=>!paymentIsCancelled(p)),itemName:itemDescription,getPhotoBlob:getMediaBlob});
        const fileName=`${order.id}_${timestampFile()}.pdf`,pdfFile=new File([result.blob],fileName,{type:'application/pdf'});record=await MarcoStorage.putMedia(pdfFile,{name:fileName,type:'application/pdf'});
        newMeta={id:`pdf_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,orderId:order.id,kind:'pdf',official:true,legacy:false,generatedByCurrentApp:true,fileName,localKey:record.id,driveFileId:'',webViewLink:'',createdAt:nowIso(),sourceFingerprint:orderPdfFingerprint219(order.id),schemaVersion:3,templateId:result.templateId||order.pdfTemplateId||currentProfileSettings().defaultPdfTemplateId||'',templateVersion:result.templateVersion||1,pageCount:result.pageCount||0};
        if(!navigator.onLine||!GoogleDriveMarco.isConfigured())throw new Error('Internet e Google Drive são obrigatórios para gerar o PDF oficial.');
        const remote=await GoogleDriveMarco.uploadBlob(pdfFile,'pdfs',fileName);newMeta.driveFileId=remote.id;newMeta.webViewLink=remote.webViewLink||'';
        const generatedOfficial=(order.pdfs||[]).filter(m=>m.official!==false&&!isHistoricalPdf219(m));
        generatedOfficial.forEach(old=>{old.official=false;old.supersededAt=nowIso();});
        order.pdfs=Array.isArray(order.pdfs)?order.pdfs:[];order.pdfs.push(newMeta);
        await persist('PDF oficial gerado',`${order.id} · ${fileName}`);
        /* PDFs históricos e versões anteriores são preservados. A limpeza destrutiva
           não ocorre no mesmo clique, evitando perda durante uma falha de nuvem. */
        setSaveStatus('PDF atualizado','ok');if(form){form.dataset.hadPdf='1';setPdfState219(form,'ready','PDF pronto');}
        toast('PDF pronto para visualizar, salvar ou enviar.','ok');return newMeta;
      }catch(e){console.error('Falha ao gerar PDF oficial:',{orderId,error:e});order.pdfs=previousPdfs;if(record?.id)await MarcoStorage.deleteMedia(record.id).catch(()=>{});if(newMeta?.driveFileId)await GoogleDriveMarco.trash(newMeta.driveFileId).catch(()=>{});setPdfState219(form,'error','Não foi possível gerar o PDF.');setSaveStatus('Falha ao gerar PDF','warn');toast('Não foi possível gerar o PDF.','error');throw e;}
    })().finally(()=>PDF_INFLIGHT_219.delete(orderId));
    PDF_INFLIGHT_219.set(orderId,task);return task;
  };

  const changeOrderStatusQuick218=changeOrderStatusQuick;
  changeOrderStatusQuick=async function(id,status){
    if(QUICK_STATUS_INFLIGHT_219.has(id))return QUICK_STATUS_INFLIGHT_219.get(id);
    const task=(async()=>{
      const order=findOrder(id);if(!order)return;const previous=canonicalOperationalStatus(order.status),select=document.querySelector(`[data-quick-order-status="${CSS.escape(id)}"]`),shell=select?.closest('.inline-status-shell'),profileId=activeProfile().id,snapshot=clone(data());
      if(select){select.value=previous;select.disabled=true;}shell?.classList.add('is-saving');
      try{await changeOrderStatusQuick218(id,status);}
      catch(e){console.error('Falha ao alterar status rápido:',{id,status,error:e});STATE.dataByProfile[profileId]=snapshot;await MarcoStorage.save(STATE).catch(()=>{});renderView();toast('Não foi possível alterar o status. O valor anterior foi restaurado.','error');}
      finally{const current=document.querySelector(`[data-quick-order-status="${CSS.escape(id)}"]`);if(current)current.disabled=false;current?.closest('.inline-status-shell')?.classList.remove('is-saving');}
    })().finally(()=>QUICK_STATUS_INFLIGHT_219.delete(id));
    QUICK_STATUS_INFLIGHT_219.set(id,task);return task;
  };

  const ORDER_SAVE_INFLIGHT_219=new Map();
  const CLIENT_SAVE_INFLIGHT_219=new Map();
  const saveOrderForm219Base=saveOrderForm;
  saveOrderForm=async function(form){
    const key=form?.dataset.id||form?.dataset.reservedCode||'new';
    if(ORDER_SAVE_INFLIGHT_219.has(key))return ORDER_SAVE_INFLIGHT_219.get(key);
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const task=Promise.resolve(saveOrderForm219Base(form)).finally(()=>{ORDER_SAVE_INFLIGHT_219.delete(key);if(submit?.isConnected)submit.disabled=false;});
    ORDER_SAVE_INFLIGHT_219.set(key,task);return task;
  };

  const saveClientForm219Base=saveClientForm;
  saveClientForm=async function(form){
    const key=form?.dataset.id||'new';
    if(CLIENT_SAVE_INFLIGHT_219.has(key))return CLIENT_SAVE_INFLIGHT_219.get(key);
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const task=Promise.resolve(saveClientForm219Base(form)).finally(()=>{CLIENT_SAVE_INFLIGHT_219.delete(key);if(submit?.isConnected)submit.disabled=false;});
    CLIENT_SAVE_INFLIGHT_219.set(key,task);return task;
  };

  const savePaymentForm218=savePaymentForm;
  savePaymentForm=async function(form){
    const key=form?.dataset.id||'new';if(PAYMENT_SAVE_INFLIGHT_219.has(key))return PAYMENT_SAVE_INFLIGHT_219.get(key);
    const submit=form?.querySelector('[type="submit"]');if(submit)submit.disabled=true;
    const task=Promise.resolve(savePaymentForm218(form)).finally(()=>{PAYMENT_SAVE_INFLIGHT_219.delete(key);if(submit?.isConnected)submit.disabled=false;});PAYMENT_SAVE_INFLIGHT_219.set(key,task);return task;
  };

  /* =========================================================
     CAMPOS DE DATA — 2.2.6
     O tema desenha o ícone do calendário com background-image em "right 14px center" e deixa o
     indicador nativo invisível. Como o indicador nativo vive dentro da caixa de conteúdo, o
     padding-right de 48px empurrava a área realmente clicável para longe do ícone desenhado — daí
     o clique em região invisível e o pop-up nativo ancorado fora do lugar.
     Agora o indicador nativo é removido (css/pts-completo.css) e o próprio campo aciona
     showPicker(), que ancora o calendário no componente exibido, em qualquer largura.
     ========================================================= */
  const DATE_MIN_YEAR_225=1900;
  const DATE_MAX_YEAR_225=2100;
  const DATE_INPUT_SELECTOR_225='input[type="date"],input[type="month"]';
  let DATE_PICKER_FALLBACK_225=false;

  function openDatePicker225(input){
    if(!input||input.disabled||input.readOnly)return;
    input.focus({preventScroll:true});
    if(typeof input.showPicker==='function'){
      try{input.showPicker();return;}
      catch(e){console.warn('showPicker indisponível neste contexto, usando o indicador nativo:',e);}
    }
    // Fallback para navegadores sem showPicker: reemite o clique no próprio input, com trava
    // de reentrância para não recursar dentro do nosso próprio ouvinte.
    if(DATE_PICKER_FALLBACK_225)return;
    DATE_PICKER_FALLBACK_225=true;
    try{input.click();}finally{DATE_PICKER_FALLBACK_225=false;}
  }

  function dateValueIsSane225(input){
    const raw=String(input.value||'');
    if(!raw)return true;
    const year=Number(raw.slice(0,4));
    if(!Number.isFinite(year)||year<DATE_MIN_YEAR_225||year>DATE_MAX_YEAR_225)return false;
    if(input.type==='month')return /^\d{4}-\d{2}$/.test(raw);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))return false;
    // Data local, sem Date.parse de string — nada de deslocamento de um dia por causa de UTC.
    const [y,m,d]=raw.split('-').map(Number);
    const probe=new Date(y,m-1,d);
    return probe.getFullYear()===y&&probe.getMonth()===m-1&&probe.getDate()===d;
  }

  // Anos incompletos e datas inexistentes (o caso 15/05/1551) nunca chegam ao estado.
  function sanitizeDateInput225(input){
    if(dateValueIsSane225(input))return true;
    input.value='';
    input.classList.add('date-input-rejected');
    setTimeout(()=>input.classList.remove('date-input-rejected'),900);
    toast('Data inválida. Escolha a data pelo calendário.','error');
    return false;
  }

  document.addEventListener('click',event=>{
    if(DATE_PICKER_FALLBACK_225)return;
    const input=event.target.closest?.(DATE_INPUT_SELECTOR_225);
    if(!input)return;
    openDatePicker225(input);
  },true);

  // Entrada manual bloqueada, navegação por teclado preservada (Tab, Enter, Espaço, setas, limpar).
  document.addEventListener('keydown',event=>{
    const input=event.target.closest?.(DATE_INPUT_SELECTOR_225);
    if(!input)return;
    if(event.key==='Enter'||event.key===' '||event.key==='Spacebar'){event.preventDefault();openDatePicker225(input);return;}
    const navigational=['Tab','Escape','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End','Backspace','Delete','F5'];
    if(navigational.includes(event.key)||event.ctrlKey||event.metaKey||event.altKey)return;
    if(event.key.length===1)event.preventDefault();
  },true);

  document.addEventListener('change',event=>{
    const input=event.target.closest?.(DATE_INPUT_SELECTOR_225);
    if(!input)return;
    if(!sanitizeDateInput225(input))return;
    const form=input.closest('form[data-form="order"]');
    if(!form||input.name!=='completedAt')return;
    const openedAt=form.elements.openedAt?.value||'';
    if(openedAt&&input.value&&input.value<openedAt){
      input.value='';
      toast('A data de conclusão não pode ser anterior à data de abertura.','error');
    }
  },true);

  function closeQuickActions219(except=null){document.querySelectorAll('details.quick-actions[open]').forEach(details=>{if(details!==except)details.open=false;});}

  /* =========================================================
     COLUNA AÇÕES — 2.2.6
     O menu era position:absolute dentro de .table-wrap{overflow:auto}, então era recortado pelo
     container e ficava parcialmente escondido. position:fixed sozinho não resolve: .card usa
     backdrop-filter, que cria bloco contentor e reancora elementos fixos. Por isso o menu é movido
     para o body enquanto está aberto e devolvido ao <details> ao fechar — o overflow e o
     backdrop-filter deixam de alcançá-lo, sem sticky, sem sobreposição de coluna e sem borda dupla.
     ========================================================= */
  const QUICK_MENU_GAP_225=7;
  const QUICK_MENU_EDGE_225=10;
  let QUICK_MENU_PORTAL_225=null;

  function portalQuickActionsMenu225(details){
    const menu=details.querySelector(':scope > .quick-actions-menu');
    if(!menu)return null;
    const placeholder=document.createComment('quick-actions-menu');
    menu.after(placeholder);
    menu.dataset.quickMenuPortal='1';
    document.body.appendChild(menu);
    QUICK_MENU_PORTAL_225={details,menu,placeholder};
    return menu;
  }
  function restoreQuickActionsMenu225(){
    const portal=QUICK_MENU_PORTAL_225;
    if(!portal)return;
    QUICK_MENU_PORTAL_225=null;
    delete portal.menu.dataset.quickMenuPortal;
    portal.menu.removeAttribute('style');
    // Se a listagem foi re-renderizada enquanto o menu estava aberto, o lugar de origem já não
    // existe: o menu é descartado em vez de ficar órfão no body.
    if(portal.placeholder.isConnected)portal.placeholder.replaceWith(portal.menu);
    else portal.menu.remove();
  }
  function openQuickActionsDetails225(){return QUICK_MENU_PORTAL_225?.details||null;}
  function quickActionsMenuOf225(details){
    if(QUICK_MENU_PORTAL_225?.details===details)return QUICK_MENU_PORTAL_225.menu;
    return details.querySelector(':scope > .quick-actions-menu');
  }

  function positionQuickActionsMenu225(details){
    const summary=details.querySelector('summary'),menu=quickActionsMenuOf225(details);
    if(!summary||!menu||!details.isConnected)return;
    menu.style.position='fixed';
    menu.style.right='auto';menu.style.bottom='auto';menu.style.left='0px';menu.style.top='0px';
    menu.style.maxHeight='';
    const anchor=summary.getBoundingClientRect(),size=menu.getBoundingClientRect();
    const vw=document.documentElement.clientWidth,vh=document.documentElement.clientHeight;
    // Alinha pela direita do botão; abre para a esquerda quando não há espaço à direita.
    let left=anchor.right-size.width;
    if(left<QUICK_MENU_EDGE_225)left=Math.min(anchor.left,vw-size.width-QUICK_MENU_EDGE_225);
    left=Math.max(QUICK_MENU_EDGE_225,Math.min(left,vw-size.width-QUICK_MENU_EDGE_225));
    // Abre acima quando não couber abaixo, e nunca ultrapassa a viewport.
    let top=anchor.bottom+QUICK_MENU_GAP_225;
    if(top+size.height>vh-QUICK_MENU_EDGE_225){
      const above=anchor.top-QUICK_MENU_GAP_225-size.height;
      top=above>=QUICK_MENU_EDGE_225?above:Math.max(QUICK_MENU_EDGE_225,vh-size.height-QUICK_MENU_EDGE_225);
    }
    menu.style.left=`${Math.round(left)}px`;
    menu.style.top=`${Math.round(top)}px`;
    menu.style.maxHeight=`${Math.round(vh-top-QUICK_MENU_EDGE_225)}px`;
  }

  document.addEventListener('toggle',event=>{
    const details=event.target.closest?.('details.quick-actions');
    if(!details)return;
    if(details.open){
      restoreQuickActionsMenu225();
      if(!portalQuickActionsMenu225(details))return;
      requestAnimationFrame(()=>{if(details.open)positionQuickActionsMenu225(details);});
      return;
    }
    if(QUICK_MENU_PORTAL_225?.details===details)restoreQuickActionsMenu225();
  },true);
  // Rolar ou redimensionar desancoraria o menu, então ele acompanha o botão.
  document.addEventListener('scroll',()=>{const open=openQuickActionsDetails225();if(open)positionQuickActionsMenu225(open);},{capture:true,passive:true});
  window.addEventListener?.('resize',()=>{const open=openQuickActionsDetails225();if(open)positionQuickActionsMenu225(open);},{passive:true});
  document.addEventListener('pointerdown',event=>{
    // Com o menu portado para o body ele não é mais descendente do <details>: os dois pontos contam como "dentro".
    const opened=document.querySelector('details.quick-actions[open]');
    const inside=event.target.closest?.('details.quick-actions')||(event.target.closest?.('.quick-actions-menu')?openQuickActionsDetails225():null);
    if(opened&&!inside){closeQuickActions219();SUPPRESS_QUICK_ACTION_CLICK_219=true;return;}
    if(inside)closeQuickActions219(inside);
  },true);
  document.addEventListener('click',event=>{
    if(SUPPRESS_QUICK_ACTION_CLICK_219){SUPPRESS_QUICK_ACTION_CLICK_219=false;event.preventDefault();event.stopImmediatePropagation();return;}
    const actionButton=event.target.closest?.('details.quick-actions [data-action],.quick-actions-menu [data-action]');
    if(actionButton){const details=actionButton.closest('details.quick-actions')||openQuickActionsDetails225();if(details)details.open=false;}
    const option=event.target.closest?.('[data-client-option-id]');if(option){event.preventDefault();const input=option.closest('.client-search-row')?.querySelector('[data-client-search]');chooseClientSuggestion219(input,option.dataset.clientOptionId);}
  },true);
  document.addEventListener('keydown',event=>{
    const quick=document.querySelector('details.quick-actions[open]');if(event.key==='Escape'&&quick){event.preventDefault();event.stopImmediatePropagation();quick.open=false;return;}
    const input=event.target.closest?.('[data-client-search]');if(!input)return;
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopImmediatePropagation();if(input.getAttribute('aria-expanded')!=='true')renderClientSuggestions219(input);moveClientSuggestion219(input,event.key==='ArrowDown'?1:-1);return;}
    if(event.key==='Enter'){const list=input.closest('.client-search-row')?.querySelector('.client-suggestions'),active=list?.querySelector('[aria-selected="true"][data-client-option-id]');if(active){event.preventDefault();event.stopImmediatePropagation();chooseClientSuggestion219(input,active.dataset.clientOptionId);}return;}
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeClientSuggestions219(input);}
  },true);
  document.addEventListener('pointerdown',event=>{const input=$('[data-client-search]');if(input&&input.getAttribute('aria-expanded')==='true'&&!event.target.closest('.client-search-row'))closeClientSuggestions219(input);},true);
  document.addEventListener('input',event=>{
    const input=event.target.closest?.('[data-client-search]');
    if(input){const form=input.closest('form[data-form="order"]'),hidden=form?.elements.clientId;if(hidden&&input.value!==findClient(hidden.value)?.name){hidden.value='';input.dataset.selectedClientId='';input.classList.remove('has-valid-client');}renderClientSuggestions219(input);}
    const form=event.target.closest?.('form[data-form="order"]');if(form){scheduleOrderDraft219(form);markOrderPdfDirty219(form);}
  },true);
  document.addEventListener('change',event=>{
    const form=event.target.closest?.('form[data-form="order"]');if(form){scheduleOrderDraft219(form);markOrderPdfDirty219(form);}
    const paymentForm=event.target.closest?.('form[data-form="payment"]');if(paymentForm&&event.target.matches('[name="settlementState"]')){if(event.target.value==='paid'&&!paymentForm.elements.paymentDate.value)paymentForm.elements.paymentDate.value=today();if(event.target.value==='open')paymentForm.elements.paymentDate.value='';refreshStandalonePaymentForm(paymentForm);}
    if(paymentForm&&event.target.matches('[name="paymentDate"]')){const settlement=paymentForm.elements.settlementState;if(settlement)settlement.value=event.target.value?'paid':'open';refreshStandalonePaymentForm(paymentForm);}
  },true);
  document.addEventListener('focusout',event=>{
    const input=event.target.closest?.('[data-phone-input]');if(!input)return;
    const hint=input.closest('form')?.querySelector('[data-phone-hint]'),value=String(input.value||'').trim();
    if(!value){if(hint){hint.textContent='';hint.hidden=true;hint.dataset.tone='idle';}return;}
    const result=normalizeBrazilianPhone(value);
    if(result.valid){input.value=result.formatted;if(hint){hint.textContent='Telefone válido.';hint.hidden=false;hint.dataset.tone='ok';}}
    else if(hint){hint.textContent=result.error||'Revise o telefone informado.';hint.hidden=false;hint.dataset.tone='error';}
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(ORDER_DRAFT_TIMER_219);flushOrderDraft219().catch(()=>{});}});
  window.addEventListener?.('pagehide',()=>{clearTimeout(ORDER_DRAFT_TIMER_219);flushOrderDraft219().catch(()=>{});});

  const handleAction219Base=handleAction;
  handleAction=async function(btn){
    const action=btn?.dataset?.action;
    try{
      if(action==='open-osv-layout-editor'){window.MarcoPersonalization221?.openLayoutEditor?.();return;}
      if(action==='cancel-order-form'){const form=btn.closest('form[data-form="order"]');await discardOrderDraft219(form);return;}
      if(action==='new-client-from-order'){const form=btn.closest('form[data-form="order"]');if(!form)return;await flushOrderDraft219(form);PENDING_ORDER_DRAFT=orderDraftFromForm(form);openClientForm();return;}
      if(action==='view-existing-media'){const found=findMedia(btn.dataset.media);if(!found)throw new Error('Arquivo não encontrado.');await openPdfMedia(found.order?.id||'',btn.dataset.media);return;}
      if(action==='close-order-pdf-preview'){const overlay=btn.closest('[data-order-pdf-preview]');if(overlay){try{URL.revokeObjectURL(overlay.dataset.objectUrl||'');}catch(_){}overlay.remove();}return;}
      if(action==='copy-order-pix'){const order=findOrder(btn.dataset.order),code=String(order?.pixPayment?.copyPasteCode||order?.pixPayment?.pixKey||'').trim();if(!code)throw new Error('Esta OSV não possui código Pix.');await copyTextToClipboard219(code);toast('Código Pix copiado.','ok');return;}
      if(action==='download-order-pdf'){const found=findMedia(btn.dataset.media);if(!found)throw new Error('Arquivo não encontrado.');const blob=await getMediaBlob(found.meta);if(!blob)throw new Error('O PDF não está disponível neste dispositivo.');MarcoStorage.downloadBlob(blob,found.meta.fileName||`${btn.dataset.order}.pdf`);return;}
      if(action==='stage-delete-existing-media'){await stageExistingMediaDeletion219(btn.closest('form[data-form="order"]'),btn.dataset.media);return;}
      if(action==='whatsapp-review-cancel'){closeWhatsAppReview219();return;}
      if(action==='whatsapp-review-copy'){const root=btn.closest('.whatsapp-review-modal'),text=root?.querySelector('[data-whatsapp-message]')?.value||'';await copyTextToClipboard219(text);const original='Copiar texto';btn.textContent='Copiado ✓';toast('Mensagem copiada para a área de transferência.','ok');setTimeout(()=>{if(btn.isConnected)btn.textContent=original;},1800);return;}
      if(action==='whatsapp-review-ok'){const state=WHATSAPP_REVIEW_219,modal=btn.closest('.whatsapp-review-modal'),message=modal?.querySelector('[data-whatsapp-message]')?.value||'';if(!state||state.sharing)return;state.sharing=true;btn.disabled=true;btn.setAttribute('aria-busy','true');try{await shareOrderPdfWithMessage219({...state,message});}finally{if(WHATSAPP_REVIEW_219===state)state.sharing=false;if(btn.isConnected){btn.disabled=false;btn.removeAttribute('aria-busy');}}return;}
      return await handleAction219Base(btn);
    }catch(e){console.error('Ação v2.2.13 falhou:',{action,error:e});if(btn?.isConnected)btn.disabled=false;toast(e.message||'Não foi possível concluir a ação.','error');}
  };

  // #modal-root tem um único modal (root.innerHTML é reescrito a cada openModal). Para abrir o editor
  // de layout de dentro da Nova OSV sem perder nada, o formulário é gravado no rascunho antes de sair
  // e restaurado depois pelo mesmo caminho já usado em "novo cliente a partir da OSV". O número
  // reservado vem do rascunho, então não é sorteado de novo nem duplica a OSV.
  const renderView225=renderView;
  renderView=function(...args){
    // Evita menu de ações órfão no body quando a tela é reconstruída com ele aberto.
    if(QUICK_MENU_PORTAL_225)restoreQuickActionsMenu225();
    return renderView225(...args);
  };

  window.MarcoClientFormBridge={
    current(){return $('#modal-root form[data-form="client"]');},
    async suspend(){const form=this.current();if(!form)return null;const modalBody=form.closest('.modal-body'),fields=[...form.querySelectorAll('input,select,textarea')].filter(el=>el.name).map(el=>({name:el.name,type:el.type,value:el.value,checked:el.checked})),results=form.querySelector('[data-cep-results]')?.innerHTML||'',ticket={id:form.dataset.id||'',fields,results,suggestions:clone(CEP_SUGGESTIONS),scrollTop:modalBody?.scrollTop||0,openedAt:nowIso(),fromOrder:!!PENDING_ORDER_DRAFT};closeModal({reason:'replace-modal',immediate:true});return ticket;},
    resume(ticket){if(!ticket)return false;openClientForm(ticket.id||'');let attempts=0;const restore=async()=>{const form=this.current();if(!form&&attempts++<30){requestAnimationFrame(restore);return;}if(!form)return;const stateRecord=ticket.fields.find(x=>x.name==='state'),cityRecord=ticket.fields.find(x=>x.name==='city');if(stateRecord){const stateEl=form.elements.state;if(stateEl)stateEl.value=stateRecord.value;loadCitiesForState(stateRecord.value,cityRecord?.value||'').catch(()=>{});}for(const record of ticket.fields){const nodes=form.querySelectorAll(`[name="${CSS.escape(record.name)}"]`);for(const node of nodes){if(['checkbox','radio'].includes(record.type))node.checked=record.checked;else node.value=record.value;}}CEP_SUGGESTIONS=clone(ticket.suggestions||[]);const results=form.querySelector('[data-cep-results]');if(results)results.innerHTML=ticket.results||'';window.MarcoPersonalization221?.hydrateClientForm?.(form);requestAnimationFrame(()=>{const body=form.closest('.modal-body');if(body)body.scrollTop=Number(ticket.scrollTop)||0;});};requestAnimationFrame(restore);return true;}
  };

  window.MarcoOrderFormBridge={
    current(){return $('#modal-root form[data-form="order"]');},
    async suspend(){
      const form=this.current();if(!form)return null;
      clearTimeout(ORDER_DRAFT_TIMER_219);
      await flushOrderDraft219(form).catch(e=>{console.error('Falha ao preservar o rascunho da OSV antes do editor:',e);throw new Error('Não foi possível preservar os dados da OSV. O editor não foi aberto.');});
      const ticket={id:form.dataset.id||'',reservedCode:form.dataset.reservedCode||'',openedAt:nowIso()};
      closeModal({reason:'replace-modal',immediate:true});
      return ticket;
    },
    resume(ticket){
      if(!ticket)return false;
      openOrderForm(ticket.id||'');
      return true;
    }
  };

  window.MarcoPersonalization221?.install?.();
  window.MarcoPTS={version:PTS_VERSION,runIntegrity:integrityReport,buildMigrationPlan:()=>MIGRATION_SESSION?buildMigrationPlan():null,financialInfo:id=>orderFinancialInfo(findOrder(id)),lowStock:()=>lowStockItems(),setOrderStatus:changeOrderStatusQuick,screenBand};
  window.MarcoPTSReady=true;
})();
