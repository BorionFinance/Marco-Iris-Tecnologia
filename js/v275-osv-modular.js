/* Marco Iris Tecnologia v2.7.5 — interação da Nova OSV modular. */
(()=>{
  'use strict';
  const VERSION='2.8.8';
  const ORDER_FORM='form[data-form="order"]';
  const INTERNAL_SCROLL='.client-suggestions:not([hidden]),[role="listbox"]:not([hidden]),.quick-actions-menu,[data-dropdown-panel]:not([hidden]),.select-options:not([hidden])';

  function orderForm(root=document){return root.querySelector?.(ORDER_FORM)||null;}
  function orderModalFrom(node){return node?.closest?.('#modal-root .modal:has(form[data-form="order"])')||null;}
  function canConsumeWheel(element,deltaY){
    if(!element||element.scrollHeight<=element.clientHeight+1)return false;
    if(deltaY<0)return element.scrollTop>0;
    if(deltaY>0)return element.scrollTop+element.clientHeight<element.scrollHeight-1;
    return false;
  }
  function growTextarea(textarea){
    if(!textarea?.closest?.(ORDER_FORM))return;
    const previous=textarea.style.height;
    textarea.style.height='auto';
    textarea.style.height=`${Math.max(92,textarea.scrollHeight+2)}px`;
    if(previous!==textarea.style.height)textarea.closest('[data-layout-surface="order"]')?.style.setProperty('--osv-content-updated-v275',Date.now());
  }
  function growAllTextareas(root=document){root.querySelectorAll?.(`${ORDER_FORM} textarea`).forEach(growTextarea);}

  function updateReorderButtons(root=document){
    root.querySelectorAll?.(`${ORDER_FORM} #order-items-editor`).forEach(host=>{
      const rows=[...host.querySelectorAll(':scope > .item-editor-row')];
      rows.forEach((row,index)=>{
        const up=row.querySelector('[data-action="move-item-row"][data-dir="-1"]');
        const down=row.querySelector('[data-action="move-item-row"][data-dir="1"]');
        if(up)up.disabled=index===0;
        if(down)down.disabled=index===rows.length-1;
        row.draggable=false;
        row.removeAttribute('data-order-item');
      });
    });
  }

  function updateClientLayer(root=document){
    root.querySelectorAll?.(`${ORDER_FORM} [data-osv-component="clientField"],${ORDER_FORM} .client-picker`).forEach(component=>{
      component.classList.toggle('client-suggestions-active-v275',!!component.querySelector('.client-search-row.suggestions-open .client-suggestions:not([hidden])'));
    });
  }

  function hydrate(root=document){
    growAllTextareas(root);
    updateReorderButtons(root);
    updateClientLayer(root);
  }

  document.addEventListener('input',event=>{
    if(event.target.matches?.(`${ORDER_FORM} textarea`))growTextarea(event.target);
  },true);

  document.addEventListener('click',event=>{
    if(event.target.closest?.(`${ORDER_FORM} [data-action="move-item-row"],${ORDER_FORM} [data-action="add-item-row"],${ORDER_FORM} [data-action="remove-item-row"],${ORDER_FORM} [data-action="save-quick-catalog-item"]`)){
      queueMicrotask(()=>updateReorderButtons(document));
    }
  },true);


  let hydrateFrame=0;
  const scheduleHydrate=root=>{
    if(hydrateFrame)return;
    hydrateFrame=requestAnimationFrame(()=>{hydrateFrame=0;hydrate(root||document);});
  };
  const observer=new MutationObserver(records=>{
    let structuralRoot=null,layerOnly=false;
    for(const record of records){
      if(record.type==='childList'){
        for(const node of record.addedNodes){
          if(node.nodeType!==1)continue;
          if(node.matches?.(ORDER_FORM+',.item-editor-row')||node.querySelector?.(ORDER_FORM+',.item-editor-row')){
            structuralRoot=node.closest?.(ORDER_FORM)||node.querySelector?.(ORDER_FORM)||record.target.closest?.(ORDER_FORM)||document;
            break;
          }
        }
      }else if(record.type==='attributes'&&record.attributeName==='hidden')layerOnly=true;
      if(structuralRoot)break;
    }
    if(structuralRoot)scheduleHydrate(structuralRoot);
    else if(layerOnly)requestAnimationFrame(()=>updateClientLayer(document));
  });
  const modalRoot=document.getElementById('modal-root');
  if(modalRoot)observer.observe(modalRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});

  let resizeTimer=0;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>growAllTextareas(document),120);},{passive:true});
  document.addEventListener('DOMContentLoaded',()=>hydrate(document),{once:true});
  requestAnimationFrame(()=>hydrate(document));

  window.MarcoOSVModular275={version:VERSION,hydrate,updateReorderButtons,growAllTextareas};
})();
