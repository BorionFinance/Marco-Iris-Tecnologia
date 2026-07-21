'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');
function assert(cond,msg){if(!cond)throw new Error('FALHOU: '+msg);}
const context={console,setTimeout,clearTimeout,setInterval,clearInterval,crypto:global.crypto};
context.window=context;context.globalThis=context;
context.document={addEventListener(){}};context.addEventListener=()=>{};
vm.createContext(context);
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/services/borion-interop-source.js'),'utf8'),context,{filename:'borion-interop-source.js'});
const api=context.MarcoBorionInterop.__test;
const state={
  activeProfileId:'p1',profiles:[{id:'p1'}],dataByProfile:{p1:{
    clients:[{id:'c1',name:'João da Silva'}],
    serviceOrders:[{id:'OSV-000286',clientId:'c1',clientName:'João da Silva'}],
    payments:[
      {id:'pay1',code:'REC-000001',orderId:'OSV-000286',clientId:'c1',type:'Receita',value:150,paymentDate:'2026-07-20',paymentMethod:'Pix',status:'Pago'},
      {id:'pay2',code:'REC-000002',orderId:'OSV-000286',clientId:'c1',type:'Receita',value:150,paymentDate:'2026-07-21',paymentMethod:'Crédito',installments:2,status:'Pago'},
      {id:'exp1',code:'DES-000001',type:'Despesa',value:80,dueDate:'2026-07-25',paymentMethod:'Pix',status:'Em aberto',expenseName:'Compra de peça',localPurchase:'Fornecedor X',paymentOrigin:'Pix',expenseType:'Variável',expenseCategory:'Peças'},
      {id:'exp2',code:'DES-000002',type:'Despesa',value:45,paymentDate:'2026-07-22',status:'Pago',expenseName:'Assinatura de ferramenta',paymentOrigin:'Carteira',expenseType:'Fixa'}
    ]
  }}
};
const records=api.projectRecords(state);
assert(records.length===4,'deve projetar dois recebimentos e duas despesas');
const incomes=records.filter(r=>r.direction==='income');
assert(incomes.length===2,'pagamentos parciais devem ser registros independentes');
assert(incomes.every(r=>r.description==='OSV-000286 • João da Silva'),'descrição deve manter OSV antes do cliente e usar •');
assert(incomes[0].receiptId&&incomes[0].orderNumber&&incomes[0].clientName,'campos obrigatórios devem ser enviados');
assert(incomes.some(r=>r.paymentMethod==='Crédito 2x'),'parcelamento do crédito deve ser explícito');
assert(incomes.every(r=>r.paymentOrigin===''&&r.expenseType===''),'receita não deve carregar campos exclusivos de despesa');
const expenses=records.filter(r=>r.direction==='expense');
assert(expenses.length===2,'as duas despesas devem ser projetadas');
const expense=expenses.find(r=>r.entityId==='DES-000001');
assert(expense.importPolicy==='automatic-when-mapped'&&!expense.settled,'despesa aberta deve informar a política ao Borion, que decide sozinho se aplica automaticamente');
assert(expense.localPurchase==='Fornecedor X','local da compra deve ser enviado ao Borion');
assert(expense.paymentOrigin==='Pix'&&expense.expenseType==='variavel','origem do pagamento e tipo de despesa escolhidos no Marco Iris devem ser enviados ao Borion');
assert(expense.category==='Peças','categoria digitada no Marco Iris deve ser enviada, sem cair para "Outro"');
const fixedExpense=expenses.find(r=>r.entityId==='DES-000002');
assert(fixedExpense.paymentOrigin==='Carteira'&&fixedExpense.expenseType==='fixa'&&fixedExpense.settled===true,'despesa fixa paga via Carteira deve chegar com origem e tipo corretos');
const snap=api.reconcileState(state);
assert(snap.records.length===4&&snap.contentHash,'snapshot deve ser íntegro e completo');
console.log('OK: MIT publica cada REC separadamente, usa OSV • Cliente e envia despesas com origem/tipo para o Borion decidir a automação.');

const profileData=state.dataByProfile.p1;
profileData.payments=profileData.payments.filter(item=>item.code!=='REC-000001');
profileData.payments.push({id:'pay3',code:'REC-000003',orderId:'OSV-000286',clientId:'c1',type:'Receita',value:220,paymentDate:'2026-07-21',paymentMethod:'Pix',status:'Pago'});
const afterDeleteAndRelaunch=api.reconcileState(state);
assert(afterDeleteAndRelaunch.records.some(r=>r.entityId==='REC-000003'&&r.orderNumber==='OSV-000286'),'novo lançamento da mesma OSV deve ser publicado como um novo REC independente');
assert(!afterDeleteAndRelaunch.records.some(r=>r.entityId==='REC-000001'),'REC excluído não pode continuar na lista ativa do snapshot');
assert(afterDeleteAndRelaunch.tombstones.some(t=>t.sourceRecordId==='marco:receipt:REC-000001'),'exclusão definitiva deve gerar tombstone explícito para o Borion');
assert(!afterDeleteAndRelaunch.tombstones.some(t=>t.sourceRecordId==='marco:receipt:REC-000003'),'novo REC não pode herdar tombstone nem vínculo do lançamento antigo');
console.log('OK: exclusão publica tombstone e um novo REC da mesma OSV nasce sem vínculo com o lançamento antigo.');
