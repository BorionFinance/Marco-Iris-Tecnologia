'use strict';

/* Marco Iris Tecnologia v2.6.5 — coordenadas livres e correções estruturais. */
(() => {
  const VERSION='2.6.5';
  const GRID_COLUMNS=12;
  const GRID_ROW=22;
  const GRID_ROW_GAP=4;
  const DASH_HISTORY=[];
  let DASH_DRAG=null;
  let DASH_SNAPSHOT=null;
  let MODAL_STABILIZE_FRAME=0;

  const clone259=value=>JSON.parse(JSON.stringify(value||{}));
  const clamp259=(value,min,max)=>Math.max(min,Math.min(max,Number(value)||min));
  const band259=()=>window.innerWidth<=720?'mobile':window.innerWidth<=1100?'tablet':'desktop';
  function settings259(){
    try{const d=data();d.settings=d.settings||{};return d.settings;}catch(_){return {};}
  }
  function dashboardStore259(){
    const settings=settings259(),band=band259();
    settings.dashboardLayouts=settings.dashboardLayouts||{};
    settings.dashboardLayouts[band]=settings.dashboardLayouts[band]||{};
    return settings.dashboardLayouts[band];
  }
  function numberVar259(element,name,fallback){
    const raw=Number(String(element?.style?.getPropertyValue(name)||'').trim());
    return Number.isFinite(raw)&&raw>0?raw:fallback;
  }
  function overlaps259(a,b){
    return a.x<a.x+a.span&&b.x<b.x+b.span&&a.x<b.x+b.span&&a.x+a.span>b.x&&a.y<b.y+b.rows&&a.y+a.rows>b.y;
  }
  function canPlace259(rect,placed,ignoreId=''){
    if(rect.x<1||rect.y<1||rect.span<1||rect.rows<1||rect.x+rect.span-1>GRID_COLUMNS)return false;
    return !placed.some(item=>item.id!==ignoreId&&overlaps259(rect,item));
  }
  function firstFree259(span,rows,placed){
    for(let y=1;y<=260;y++)for(let x=1;x<=GRID_COLUMNS-span+1;x++){
      const rect={x,y,span,rows};if(canPlace259(rect,placed))return {x,y};
    }
    return {x:1,y:Math.max(1,...placed.map(item=>item.y+item.rows))};
  }
  function widgetRect259(widget,store){
    const id=widget.dataset.widgetId,saved=store[id]||{};
    const span=clamp259(saved.span||numberVar259(widget,'--widget-span-v256',numberVar259(widget,'--widget-span',6)),3,12);
    const rows=clamp259(saved.rows||numberVar259(widget,'--widget-rows-v256',id==='revenue'?26:14),8,60);
    return {id,span,rows,x:Number(saved.x)||0,y:Number(saved.y)||0,order:Number.isFinite(Number(saved.order))?Number(saved.order):0};
  }
  function decorateDashboard259(){
    const grid=document.querySelector('.dashboard-widget-grid.dashboard-masonry-v256');
    if(!grid)return;
    const store=dashboardStore259(),widgets=[...grid.querySelectorAll(':scope > .dashboard-widget')];
    if(window.innerWidth<=900){
      grid.style.removeProperty('--dashboard-grid-rows-v259');
      widgets.forEach(widget=>{widget.style.removeProperty('--widget-x-v259');widget.style.removeProperty('--widget-y-v259');});
      return;
    }
    const placed=[];
    widgets.map((widget,index)=>({widget,index,rect:widgetRect259(widget,store)}))
      .sort((a,b)=>(a.rect.order-b.rect.order)||(a.index-b.index))
      .forEach(({widget,index,rect})=>{
        let x=clamp259(rect.x||1,1,GRID_COLUMNS-rect.span+1),y=Math.max(1,Number(rect.y)||1);
        if(!rect.x||!rect.y||!canPlace259({...rect,x,y},placed))({x,y}=firstFree259(rect.span,rect.rows,placed));
        const normalized={...store[rect.id],order:Number.isFinite(Number(store[rect.id]?.order))?Number(store[rect.id].order):index,span:rect.span,rows:rect.rows,x,y};
        store[rect.id]=normalized;
        placed.push({id:rect.id,x,y,span:rect.span,rows:rect.rows});
        widget.style.setProperty('--widget-x-v259',x);
        widget.style.setProperty('--widget-y-v259',y);
        widget.style.setProperty('--widget-span-v256',rect.span);
        widget.style.setProperty('--widget-rows-v256',rect.rows);
      });
    const lastRow=Math.max(1,...placed.map(item=>item.y+item.rows-1));
    const editing=grid.classList.contains('layout-editing');
    grid.style.setProperty('--dashboard-grid-rows-v259',Math.max(lastRow+(editing?6:0),editing?46:1));
  }
  function gridMetrics259(grid){
    const style=getComputedStyle(grid),rect=grid.getBoundingClientRect();
    const columnGap=parseFloat(style.columnGap)||14,rowGap=parseFloat(style.rowGap)||GRID_ROW_GAP;
    const cell=(grid.clientWidth-columnGap*(GRID_COLUMNS-1))/GRID_COLUMNS;
    return {rect,columnGap,rowGap,cell,stepX:cell+columnGap,stepY:GRID_ROW+rowGap};
  }
  function dropRect259(event,widget,grid){
    const store=dashboardStore259(),saved=store[widget.dataset.widgetId]||{},metrics=gridMetrics259(grid);
    const span=clamp259(saved.span||numberVar259(widget,'--widget-span-v256',6),3,12),rows=clamp259(saved.rows||numberVar259(widget,'--widget-rows-v256',14),8,60);
    const rawX=Math.floor((event.clientX-metrics.rect.left)/metrics.stepX)+1;
    const rawY=Math.floor((event.clientY-metrics.rect.top)/metrics.stepY)+1;
    return {id:widget.dataset.widgetId,x:clamp259(rawX,1,GRID_COLUMNS-span+1),y:Math.max(1,rawY),span,rows,metrics};
  }
  function allRects259(grid){
    const store=dashboardStore259();
    return [...grid.querySelectorAll(':scope > .dashboard-widget')].map(widget=>{
      const saved=store[widget.dataset.widgetId]||{};
      return {id:widget.dataset.widgetId,x:Number(saved.x)||1,y:Number(saved.y)||1,span:clamp259(saved.span||6,3,12),rows:clamp259(saved.rows||14,8,60)};
    });
  }
  function showDropPreview259(grid,rect,valid){
    let preview=grid.querySelector(':scope > .dashboard-drop-preview-v259');
    if(!preview){preview=document.createElement('div');preview.className='dashboard-drop-preview-v259';grid.appendChild(preview);}
    const {cell,columnGap,rowGap}=rect.metrics;
    preview.classList.toggle('is-invalid',!valid);
    preview.style.setProperty('--drop-left-v259',`${(rect.x-1)*(cell+columnGap)}px`);
    preview.style.setProperty('--drop-top-v259',`${(rect.y-1)*(GRID_ROW+rowGap)}px`);
    preview.style.setProperty('--drop-width-v259',`${rect.span*cell+(rect.span-1)*columnGap}px`);
    preview.style.setProperty('--drop-height-v259',`${rect.rows*GRID_ROW+(rect.rows-1)*rowGap}px`);
  }
  function removeDropPreview259(){document.querySelectorAll('.dashboard-drop-preview-v259').forEach(node=>node.remove());}
  function pushDashboardHistory259(){
    DASH_HISTORY.push(clone259(dashboardStore259()));
    if(DASH_HISTORY.length>30)DASH_HISTORY.shift();
    const undo=document.querySelector('[data-action="undo-dashboard-layout"]');if(undo)undo.disabled=false;
  }
  function restoreDashboardStore259(snapshot){
    const store=dashboardStore259();Object.keys(store).forEach(key=>delete store[key]);Object.assign(store,clone259(snapshot));
  }

  document.addEventListener('dragstart',event=>{
    const widget=event.target.closest?.('.dashboard-widget[data-widget-id]'),grid=widget?.closest('.dashboard-widget-grid.layout-editing');
    if(!widget||!grid||window.innerWidth<=900)return;
    DASH_DRAG={widget,grid};widget.classList.add('is-dragging-v259');
    event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',widget.dataset.widgetId);
    event.stopImmediatePropagation();
  },true);
  document.addEventListener('dragover',event=>{
    if(!DASH_DRAG)return;
    const grid=event.target.closest?.('.dashboard-widget-grid.layout-editing');if(!grid||grid!==DASH_DRAG.grid)return;
    event.preventDefault();event.stopImmediatePropagation();
    const rect=dropRect259(event,DASH_DRAG.widget,grid),valid=canPlace259(rect,allRects259(grid),rect.id);
    event.dataTransfer.dropEffect=valid?'move':'none';showDropPreview259(grid,rect,valid);
  },true);
  document.addEventListener('drop',event=>{
    if(!DASH_DRAG)return;
    const grid=event.target.closest?.('.dashboard-widget-grid.layout-editing');if(!grid||grid!==DASH_DRAG.grid)return;
    event.preventDefault();event.stopImmediatePropagation();
    const rect=dropRect259(event,DASH_DRAG.widget,grid),valid=canPlace259(rect,allRects259(grid),rect.id);
    if(valid){
      pushDashboardHistory259();
      const store=dashboardStore259(),old=store[rect.id]||{};store[rect.id]={...old,x:rect.x,y:rect.y,span:rect.span,rows:rect.rows};
      decorateDashboard259();
    }else if(typeof toast==='function')toast('Esse espaço já está ocupado. Solte o módulo em uma área vazia.','warn');
    DASH_DRAG.widget.classList.remove('is-dragging-v259');DASH_DRAG=null;removeDropPreview259();
  },true);
  document.addEventListener('dragend',event=>{
    if(!DASH_DRAG)return;
    event.stopImmediatePropagation();DASH_DRAG.widget.classList.remove('is-dragging-v259');DASH_DRAG=null;removeDropPreview259();
  },true);

  document.addEventListener('pointerdown',event=>{
    if(event.target.closest?.('.widget-resize-handle-v256')&&event.target.closest?.('.dashboard-widget-grid.layout-editing'))pushDashboardHistory259();
  },true);

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-action]');if(!button)return;
    const action=button.dataset.action;
    if(action==='toggle-dashboard-layout'){
      DASH_SNAPSHOT=clone259(dashboardStore259());DASH_HISTORY.length=0;
      requestAnimationFrame(decorateDashboard259);
    }else if(action==='undo-dashboard-layout'&&DASH_HISTORY.length){
      event.preventDefault();event.stopImmediatePropagation();
      restoreDashboardStore259(DASH_HISTORY.pop());renderView();
      requestAnimationFrame(()=>{decorateDashboard259();const undo=document.querySelector('[data-action="undo-dashboard-layout"]');if(undo)undo.disabled=DASH_HISTORY.length===0;});
    }else if(action==='cancel-dashboard-layout'){
      DASH_HISTORY.length=0;DASH_SNAPSHOT=null;requestAnimationFrame(decorateDashboard259);
    }else if(action==='save-dashboard-layout'){
      DASH_HISTORY.length=0;DASH_SNAPSHOT=null;
    }else if(action==='reset-dashboard-layout'){
      DASH_HISTORY.length=0;requestAnimationFrame(decorateDashboard259);
    }
    if(['toggle-layout-v256','cancel-layout-v256','reset-layout-v256'].includes(action))scheduleModalStabilize259();
  },true);

  function stabilizeModal259(){
    const modal=document.querySelector('#modal-root .modal.layout-editing-v256');if(!modal)return;
    modal.querySelectorAll('[data-layout-item-v256]').forEach(item=>{
      const isField=item.matches('.field'),isCheck=item.matches('.check-field');
      item.classList.toggle('layout-field-v259',isField);
      item.classList.toggle('layout-check-v259',isCheck);
      item.classList.toggle('layout-section-v259',!isField&&!isCheck);
      item.classList.add('has-custom-layout-v256');
    });
    window.MarcoV256?.refreshModalGrid?.(modal,false);
    const body=modal.querySelector(':scope > .modal-body');if(body&&body.scrollTop<4)body.scrollTop=0;
  }
  function scheduleModalStabilize259(){
    cancelAnimationFrame(MODAL_STABILIZE_FRAME);
    MODAL_STABILIZE_FRAME=requestAnimationFrame(()=>requestAnimationFrame(stabilizeModal259));
  }
  const modalRoot=document.getElementById('modal-root');
  if(modalRoot)new MutationObserver(mutations=>{
    if(mutations.some(m=>m.type==='childList')){
      const modal=modalRoot.querySelector('.modal');
      const unpreparedSurface=modal?.querySelector('[data-layout-surface]:not([data-layout-grid-v256])');
      if(unpreparedSurface)requestAnimationFrame(()=>window.MarcoV256?.decorateModal?.());
    }
    if(mutations.some(m=>m.type==='childList'||(m.type==='attributes'&&m.target.classList?.contains('layout-editing-v256'))))scheduleModalStabilize259();
  }).observe(modalRoot,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});

  const renderViewBase259=window.renderView;
  if(typeof renderViewBase259==='function')window.renderView=function(...args){const result=renderViewBase259.apply(this,args);requestAnimationFrame(decorateDashboard259);return result;};
  const renderShellBase259=window.renderShell;
  if(typeof renderShellBase259==='function')window.renderShell=function(...args){const result=renderShellBase259.apply(this,args);requestAnimationFrame(decorateDashboard259);return result;};

  window.MarcoV259={version:VERSION,decorateDashboard:decorateDashboard259,stabilizeModal:stabilizeModal259,dashboardStore:dashboardStore259,canPlace:canPlace259};
  requestAnimationFrame(()=>{decorateDashboard259();scheduleModalStabilize259();});
})();
