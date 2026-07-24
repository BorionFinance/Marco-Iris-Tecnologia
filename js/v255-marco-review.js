'use strict';

/* Marco Iris v2.5.5 — revisão pós-migração solicitada por Marco
 * - numeração sem saltos;
 * - salvamento otimista em segundo plano com fila serial;
 * - preferências visuais por tela/perfil;
 * - ordenação de três estados em todas as tabelas operacionais;
 * - correções de dados e compatibilidade com PDFs históricos.
 */
(() => {
  const VERSION='2.5.5';
  const ENTITY_GROUPS={OSV:'serviceOrders',CLI:'clients',PRD:'products',SRV:'services',INS:'supplies',ITM:'orderItems',MOV:'stockMovements',AGE:'appointments',TER:'consents'};
  const SORT_SCHEMAS={
    orders:{labels:['OSV','Abertura','Cliente','Equipamento','Financeiro','Status','Valor'],types:['code','date','text','text','text','text','currency']},
    clients:{labels:['ID','Cliente','Contato','Cidade','Data de cadastro','Ordens','Total movimentado'],types:['code','text','text','text','date','number','currency']},
    finance:{labels:['Data','ID','Tipo','Cliente / OSV','Forma','Status','Taxa','Valor líquido'],types:['date','code','text','text','text','text','currency','currency']},
    'catalog.services':{labels:['ID','Serviço','Preço padrão','Execuções','Status'],types:['code','text','currency','number','text']},
    'catalog.products':{labels:['ID','Produto','Marca','Fornecedor','Custo','Margem','Venda','Estoque','Mínimo'],types:['code','text','text','text','currency','number','currency','number','number']},
    'catalog.supplies':{labels:['ID','Insumo','Marca','Fornecedor','Custo','Estoque','Mínimo'],types:['code','text','text','text','currency','number','number']},
    'catalog.movements':{labels:['ID','Data','Item','Tipo','Quantidade','Antes → Depois','OSV','Observação'],types:['code','date','text','text','number','number','code','text']},
    documents:{labels:['OSV','Cliente','Data/hora','Arquivo'],types:['code','text','date','text']}
  };
  const SAVE={requested:0,confirmed:0,running:false,retryTimer:0,retryDelay:5000,lastError:null,pending:[]};
  const PDF_TASKS=new Map();

  const sequenceFrom=value=>{
    const parsed=window.MarcoIdentifiers?.parseEntityCode?.(value);
    if(parsed?.sequence)return parsed.sequence;
    const match=String(value||'').match(/(\d+)(?!.*\d)/);return match?Number(match[1])||0:0;
  };
  const profileSettings=()=>{const d=data();d.settings=d.settings||{};return d.settings;};
  const paymentPrefix=p=>/despesa/i.test(String(p?.type||''))?'DES':'REC';
  const paymentCancelled=p=>/cancelad/i.test(String(p?.status||''))||!!p?.cancelledAt||p?.active===false;

  function reconcileNextIds(pd=data(),{allowLower=false}={}){
    if(!pd)return {};
    pd.settings=pd.settings||{};pd.settings.nextIds=pd.settings.nextIds||{};
    for(const [prefix,key] of Object.entries(ENTITY_GROUPS)){
      const max=(pd[key]||[]).reduce((m,x)=>Math.max(m,sequenceFrom(x?.id),sequenceFrom(x?.code)),0);
      const wanted=Math.max(1,max+1),current=Math.max(1,Number(pd.settings.nextIds[prefix])||1);
      pd.settings.nextIds[prefix]=allowLower?wanted:Math.max(current,wanted);
    }
    for(const prefix of ['REC','DES']){
      const max=(pd.payments||[]).filter(p=>paymentPrefix(p)===prefix).reduce((m,x)=>Math.max(m,sequenceFrom(x?.id),sequenceFrom(x?.code)),0);
      const wanted=Math.max(1,max+1),current=Math.max(1,Number(pd.settings.nextIds[prefix])||1);
      pd.settings.nextIds[prefix]=allowLower?wanted:Math.max(current,wanted);
    }
    return pd.settings.nextIds;
  }

  function historicalPdf(meta){
    return !!(meta?.legacy||meta?.legacyImported||meta?.importedLegacy||meta?.historicalImported||meta?.generatedByCurrentApp===false);
  }

  function patchMovementSnapshots(pd){
    const groups=new Map();
    for(const movement of pd.stockMovements||[]){
      const key=movement.productId?`Produto:${movement.productId}`:movement.supplyId?`Insumo:${movement.supplyId}`:'';
      if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(movement);
    }
    for(const [key,list] of groups){
      const [type,id]=key.split(':'),item=type==='Produto'?(pd.products||[]).find(x=>x.id===id):(pd.supplies||[]).find(x=>x.id===id);
      let stock=Number(item?.initialStock)||0;
      list.sort((a,b)=>String(a.date||a.createdAt||'').localeCompare(String(b.date||b.createdAt||''))||sequenceFrom(a.id)-sequenceFrom(b.id));
      for(const movement of list){
        const qty=Number(movement.quantity)||0,sign=/sa[ií]da/i.test(String(movement.movementType||''))?-1:1;
        if(Number.isFinite(Number(movement.stockBefore))&&Number.isFinite(Number(movement.stockAfter))){stock=Number(movement.stockAfter);continue;}
        movement.stockBefore=stock;stock+=sign*qty;movement.stockAfter=stock;
      }
    }
  }

  function repairProfile(pd){
    if(!pd||typeof pd!=='object')return;
    pd.settings=pd.settings||{};pd.settings.migrations=pd.settings.migrations||{};
    for(const order of pd.serviceOrders||[])for(const meta of order.pdfs||[]){
      if(meta.legacyImported||meta.importedLegacy||meta.generatedByCurrentApp===false){meta.legacy=true;meta.historicalImported=true;}
    }
    if(!pd.settings.migrations.marcoReviewV255?.completedAt){
      const has291=(pd.serviceOrders||[]).some(o=>o.id==='OSV-000291'),has292=(pd.serviceOrders||[]).some(o=>o.id==='OSV-000292');
      if(has292&&!has291){
        const removedMedia=[];
        for(const order of pd.serviceOrders.filter(o=>o.id==='OSV-000292'))removedMedia.push(...(order.photos||[]),...(order.pdfs||[]),...(order.attachments||[]));
        pd.serviceOrders=pd.serviceOrders.filter(o=>o.id!=='OSV-000292');
        const itemIds=new Set((pd.orderItems||[]).filter(i=>i.orderId==='OSV-000292').map(i=>i.id));
        pd.orderItems=(pd.orderItems||[]).filter(i=>i.orderId!=='OSV-000292');
        pd.payments=(pd.payments||[]).filter(p=>p.orderId!=='OSV-000292');
        pd.stockMovements=(pd.stockMovements||[]).filter(m=>m.orderId!=='OSV-000292'&&!itemIds.has(m.sourceItemId));
        pd.attachments=(pd.attachments||[]).filter(a=>a.orderId!=='OSV-000292');
        pd.settings.pendingDriveCleanup=Array.isArray(pd.settings.pendingDriveCleanup)?pd.settings.pendingDriveCleanup:[];
        for(const media of removedMedia)if(media?.driveFileId)pd.settings.pendingDriveCleanup.push({id:`cleanup_v255_${Date.now()}_${Math.random().toString(36).slice(2,7)}`,orderId:'OSV-000292',mediaId:media.id||'',driveFileId:media.driveFileId,fileName:media.fileName||'',createdAt:new Date().toISOString(),reason:'OSV de teste removida pela revisão v2.5.5'});
      }
      const osv2=(pd.serviceOrders||[]).find(o=>o.id==='OSV-000002');
      if(osv2){osv2.status='Cancelada';osv2.total=0;osv2.updatedAt=new Date().toISOString();}
      for(const payment of pd.payments||[])if(payment.orderId==='OSV-000002'){
        payment.value=0;payment.grossValue=0;payment.fee=0;payment.status='Cancelado';payment.active=false;payment.cancelledAt=payment.cancelledAt||new Date().toISOString();payment.cancelReason='OSV-000002 marcada como cancelada na revisão v2.5.5';
      }
      const osv57=(pd.serviceOrders||[]).find(o=>o.id==='OSV-000057');
      if(osv57){
        const items=(pd.orderItems||[]).filter(i=>i.orderId==='OSV-000057').sort((a,b)=>sequenceFrom(a.id)-sequenceFrom(b.id));
        items.forEach((item,index)=>{item.quantity=Number(item.quantity)||1;item.unitPrice=index===0?4000:0;item.subtotal=index===0?4000:0;});
        osv57.total=4000;osv57.discount=0;osv57.status='Concluída';osv57.completedAt=osv57.completedAt||osv57.openedAt||new Date().toISOString().slice(0,10);osv57.updatedAt=new Date().toISOString();
        const payments=(pd.payments||[]).filter(p=>p.orderId==='OSV-000057'&&paymentPrefix(p)==='REC').sort((a,b)=>sequenceFrom(a.id)-sequenceFrom(b.id));
        if(payments[0]){payments[0].value=4000;payments[0].grossValue=4000;payments[0].fee=0;payments[0].status='Pago';payments[0].active=true;payments[0].paymentDate=payments[0].paymentDate||osv57.completedAt;delete payments[0].cancelledAt;delete payments[0].cancelReason;}
        payments.slice(1).forEach(p=>{p.value=0;p.grossValue=0;});
      }
      pd.settings.migrations.marcoReviewV255={completedAt:new Date().toISOString(),version:VERSION,notes:'OSV de teste removida condicionalmente; OSV-000002 e OSV-000057 reparadas; PDFs históricos marcados.'};
      reconcileNextIds(pd,{allowLower:true});
    }else reconcileNextIds(pd);
    patchMovementSnapshots(pd);
    pd.settings.modules={agenda:pd.settings.modules?.agenda===true,terms:pd.settings.modules?.terms===true};
    pd.settings.tableSorts=pd.settings.tableSorts||{};
    pd.settings.periodFilters=pd.settings.periodFilters||{};
    pd.settings.dashboardColumns=pd.settings.dashboardColumns||{};
  }

  const normalizeBase=normalizeState;
  normalizeState=function(){
    normalizeBase();
    for(const pd of Object.values(STATE?.dataByProfile||{}))repairProfile(pd);
    return STATE;
  };

  const getViewModeBase=getViewMode,setViewModeBase=setViewMode;
  const catalogSection=section=>section==='catalog'?`catalog.${ACTIVE_TAB.catalog||'services'}`:section;
  getViewMode=function(section,fallback){return getViewModeBase(catalogSection(section),fallback);};
  setViewMode=function(section,mode){return setViewModeBase(catalogSection(section),mode);};

  function savePending(){return SAVE.pending.length>0||SAVE.running||!!SAVE.retryTimer;}
  function setPendingFlag(){CLOUD_ONLY_COMMITTING=savePending();CLOUD_PENDING_LOCAL=savePending();}
  function scheduleFullRetry(){
    clearTimeout(SAVE.retryTimer);SAVE.retryTimer=setTimeout(()=>{SAVE.retryTimer=0;setPendingFlag();runSaveQueue().catch(error=>console.error('[V255_SAVE_RETRY]',error));},SAVE.retryDelay);
    setPendingFlag();
  }
  function latestPending(){return SAVE.pending[SAVE.pending.length-1]||null;}
  function discardConfirmed(revision){SAVE.pending=SAVE.pending.filter(item=>item.revision>revision);}
  async function runSaveQueue(){
    if(SAVE.running)return;SAVE.running=true;setPendingFlag();
    try{
      while(SAVE.pending.length){
        let target=latestPending();
        try{
          // Mídias pendentes podem atualizar o estado; quando nenhuma edição nova entrou
          // durante o upload, atualizamos o snapshot desta revisão antes de gravá-lo.
          await syncPendingMedia();
          if(SAVE.requested===target.revision){
            target={...target,stateSnapshot:clone(STATE)};
            const index=SAVE.pending.findIndex(item=>item.revision===target.revision);if(index>=0)SAVE.pending[index]=target;
          }
          const result=await flushCloudState('fila-v255',{backup:false,retryMedia:false,stateSnapshot:target.stateSnapshot});
          SAVE.confirmed=Math.max(SAVE.confirmed,target.revision);SAVE.lastError=null;discardConfirmed(target.revision);
          LAST_CONFIRMED_STATE=clone(result.stateSnapshot||target.stateSnapshot);await MarcoStorage.saveSyncBase?.(LAST_CONFIRMED_STATE);
          clearTimeout(SAVE.retryTimer);SAVE.retryTimer=0;
          setSaveStatus(result.bridge&&!result.bridge.skipped?'Drive + Borion_Integracoes confirmados':'Google Drive confirmado','ok');
        }catch(error){
          SAVE.lastError=error;
          if(error?.baseCommitted){
            const committed=error.stateSnapshot||target.stateSnapshot;
            SAVE.confirmed=Math.max(SAVE.confirmed,target.revision);discardConfirmed(target.revision);LAST_CONFIRMED_STATE=clone(committed);await MarcoStorage.saveSyncBase?.(committed);
            setSaveStatus('Dados no Drive · integração com Borion pendente','warn');scheduleCloudRetry('fila-v255');continue;
          }
          setSaveStatus('Alteração aguardando Google Drive · nova tentativa em 5 s','warn');scheduleFullRetry();break;
        }
      }
    }finally{SAVE.running=false;setPendingFlag();}
  }

  persist=async function(action='',detail='',opts={}){
    const rollback=message=>{
      if(LAST_CONFIRMED_STATE){STATE=clone(LAST_CONFIRMED_STATE);normalizeState();if(!LOCKED)renderView('none');}
      throw new Error(message);
    };
    if(!navigator.onLine)return rollback('Sem internet. A alteração não foi aceita porque o Google Drive é obrigatório.');
    if(!GoogleDriveMarco?.isConfigured?.())return rollback('Google Drive desconectado. Entre novamente antes de alterar dados.');
    if(action)addAudit(action,detail);
    reconcileNextIds(data());STATE.updatedAt=new Date().toISOString();window.MarcoBorionInterop?.prepareState?.(STATE);
    const revision=++SAVE.requested;
    SAVE.pending.push({revision,stateSnapshot:clone(STATE),action:String(action||'alteracao')});
    setSaveStatus('Salvando em segundo plano…','warn');setPendingFlag();queueMicrotask(()=>runSaveQueue().catch(error=>console.error('[V255_BACKGROUND_SAVE]',error)));
    return {queued:true,revision,cloud:true,drive:'pending',errors:[]};
  };
  hasUnsyncedLocalState=function(){return savePending();};
  window.addEventListener('beforeunload',event=>{if(!savePending())return;event.preventDefault();event.returnValue='Há alterações aguardando confirmação no Google Drive.';});

  const generatePdfBase=generatePdfForOrder;
  generatePdfForOrder=function(orderId,share=false){
    if(share)return generatePdfBase(orderId,true);
    if(PDF_TASKS.has(orderId))return Promise.resolve({queued:true,reused:true});
    setSaveStatus(`Gerando PDF ${orderId} em segundo plano…`,'warn');toast('PDF sendo gerado em segundo plano. Você pode continuar usando o aplicativo.','ok');
    const task=Promise.resolve().then(()=>generatePdfBase(orderId,false)).catch(error=>{console.error('[V255_PDF]',error);toast(error?.message||'Não foi possível gerar o PDF.','error');}).finally(()=>PDF_TASKS.delete(orderId));
    PDF_TASKS.set(orderId,task);return Promise.resolve({queued:true});
  };

  const openOrderDetailBase=openOrderDetail,openClientDetailBase=openClientDetail;
  function hideRedundantDetailHeader(){requestAnimationFrame(()=>{const modal=document.querySelector('#modal-root .modal');if(modal?.querySelector('.detail-hero'))modal.classList.add('detail-modal-v255');});}
  openOrderDetail=function(...args){const result=openOrderDetailBase.apply(this,args);hideRedundantDetailHeader();return result;};
  openClientDetail=function(...args){const result=openClientDetailBase.apply(this,args);hideRedundantDetailHeader();return result;};

  function currentSortSection(){
    if(CURRENT_VIEW==='catalog')return `catalog.${ACTIVE_TAB.catalog||'services'}`;
    return ['orders','clients','finance','documents'].includes(CURRENT_VIEW)?CURRENT_VIEW:'';
  }
  function parseDateCell(text){
    const raw=String(text||'').trim(),br=raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[^\d]+(\d{1,2}):(\d{2}))?/);
    if(br){const year=Number(br[3])<100?2000+Number(br[3]):Number(br[3]);return new Date(year,Number(br[2])-1,Number(br[1]),Number(br[4]||0),Number(br[5]||0)).getTime();}
    const iso=Date.parse(raw);return Number.isNaN(iso)?0:iso;
  }
  function parseLocaleNumber(text){
    const raw=String(text||'').replace(/[^\d,.-]/g,'').trim();if(!raw)return Number.NEGATIVE_INFINITY;
    const normalized=raw.includes(',')?raw.replace(/\./g,'').replace(',','.'):raw;const value=Number(normalized);return Number.isFinite(value)?value:Number.NEGATIVE_INFINITY;
  }
  function sortValue(cell,type){
    const text=cell?.innerText?.replace(/\s+/g,' ').trim()||'';
    if(type==='code')return sequenceFrom(text);
    if(type==='date')return parseDateCell(text);
    if(type==='currency'||type==='number')return parseLocaleNumber(text);
    return text.toLocaleLowerCase('pt-BR');
  }
  function compareValues(a,b,type){
    if(type==='text')return String(a).localeCompare(String(b),'pt-BR',{sensitivity:'base',numeric:true});
    return (Number(a)||0)-(Number(b)||0);
  }
  function enhanceTableSorting(root=document){
    const section=currentSortSection(),schema=SORT_SCHEMAS[section];if(!schema)return;
    const table=root.querySelector?.('#view-root table');if(!table)return;
    table.dataset.sortSection=section;
    const headers=[...table.querySelectorAll('thead th')],settings=profileSettings(),state=settings.tableSorts?.[section]||{column:-1,direction:'default'};
    schema.labels.forEach((label,index)=>{
      const th=headers[index];if(!th)return;const active=Number(state.column)===index&&state.direction!=='default',indicator=!active?'⇅':state.direction==='desc'?'↓':'↑';
      th.setAttribute('aria-sort',active?(state.direction==='desc'?'descending':'ascending'):'none');
      th.innerHTML=`<button type="button" class="table-sort-button-v255 ${active?'is-active':''}" data-action="table-sort-v255" data-section="${attr(section)}" data-column="${index}" title="${attr(!active?`Ordenar ${label}: maior para menor`:state.direction==='desc'?`${label}: maior para menor. Clique para menor para maior.`:`${label}: menor para maior. Clique para voltar ao padrão.`)}"><span>${esc(label)}</span><span aria-hidden="true">${indicator}</span></button>`;
    });
    if(state.direction==='default'||Number(state.column)<0)return;
    const tbody=table.tBodies[0],rows=[...(tbody?.rows||[])].filter(row=>!row.querySelector('.empty'));
    const indexed=rows.map((row,index)=>({row,index,value:sortValue(row.cells[Number(state.column)],schema.types[Number(state.column)]||'text')}));
    indexed.sort((a,b)=>{const cmp=compareValues(a.value,b.value,schema.types[Number(state.column)]||'text');return (state.direction==='desc'?-cmp:cmp)||a.index-b.index;});
    indexed.forEach(item=>tbody.appendChild(item.row));
  }

  const renderViewBase=renderView;
  renderView=function(...args){const result=renderViewBase.apply(this,args);requestAnimationFrame(()=>enhanceTableSorting(document));return result;};

  const handleActionBase=handleAction;
  handleAction=async function(btn,...rest){
    const action=btn?.dataset?.action||'';
    if(action==='table-sort-v255'){
      const section=btn.dataset.section,column=Number(btn.dataset.column),settings=profileSettings();settings.tableSorts=settings.tableSorts||{};
      const old=settings.tableSorts[section]||{column:-1,direction:'default'};let direction='desc';
      if(Number(old.column)===column)direction=old.direction==='default'?'desc':old.direction==='desc'?'asc':'default';
      settings.tableSorts[section]={column:direction==='default'?-1:column,direction};
      await persist('Ordenação de tabela atualizada',`${section} · coluna ${column} · ${direction}`,{media:false});renderView();return;
    }
    if(action==='clear-unified-period'){
      const section=btn.dataset.section,settings=profileSettings();settings.periodFilters=settings.periodFilters||{};settings.periodFilters[section]={month:'',days:''};
      await persist('Filtro de período limpo',section,{media:false});renderView();return;
    }
    if(action==='dashboard-revenue-period'){
      const settings=profileSettings(),period=btn.dataset.period;if(!['year','month','day'].includes(period))return;
      settings.dashboardRevenuePeriod=period;await persist('Período do faturamento atualizado',period,{media:false});renderView();return;
    }
    if(action==='dashboard-revenue-select'){
      const settings=profileSettings(),key=String(btn.dataset.key||''),period=settings.dashboardRevenuePeriod||'month';
      settings.dashboardRevenueSelected=key;
      if(period==='year'){settings.dashboardRevenueYear=key;}
      else if(period==='month'){settings.dashboardRevenueMonth=key;settings.dashboardRevenueYear=key.slice(0,4);}
      else if(period==='day'){settings.dashboardRevenueDay=key;settings.dashboardRevenueMonth=key.slice(0,7);settings.dashboardRevenueYear=key.slice(0,4);}
      await persist('Período do gráfico selecionado',key,{media:false});renderView();return;
    }
    if(action==='dashboard-revenue-scroll'){
      const chart=btn.closest('.revenue-widget-v255')?.querySelector('.revenue-chart-v255');if(!chart)return;
      chart.scrollBy({left:(Number(btn.dataset.dir)||1)*Math.max(260,chart.clientWidth*.72),behavior:'smooth'});return;
    }
    if(action==='generate-pdf-background'){await generatePdfForOrder(btn.dataset.id,false);return;}
    return await handleActionBase.call(this,btn,...rest);
  };

  document.addEventListener('change',event=>{
    const select=event.target.closest?.('[data-dashboard-columns]');if(!select)return;
    const count=Math.max(1,Math.min(4,Number(select.value)||3)),settings=profileSettings(),band=window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';
    settings.dashboardColumns=settings.dashboardColumns||{};settings.dashboardColumns[band]=count;
    settings.dashboardLayouts=settings.dashboardLayouts||{};const store=settings.dashboardLayouts[band]||(settings.dashboardLayouts[band]={}),span=Math.max(3,Math.round(12/count));
    Object.values(store).forEach(layout=>{if(layout&&typeof layout==='object')layout.span=band==='mobile'?12:span;});
    persist('Quantidade de colunas do painel atualizada',`${band}: ${count}`,{media:false}).catch(error=>toast(error.message,'error'));renderView();
  },true);

  window.MarcoV255={version:VERSION,reconcileNextIds,repairProfile,enhanceTableSorting,saveStatus:()=>({...SAVE}),pdfTasks:PDF_TASKS};
  window.MarcoAppBoot?.();
})();
