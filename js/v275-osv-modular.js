/* Marco Iris Tecnologia v2.7.5 — interação da Nova OSV modular. */
(()=>{
  'use strict';
  const VERSION='2.7.5';
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

  document.addEventListener('wheel',event=>{
    if(event.ctrlKey)return;
    const modal=orderModalFrom(event.target);if(!modal)return;
    const internal=event.target.closest?.(INTERNAL_SCROLL);
    if(internal&&canConsumeWheel(internal,event.deltaY)){
      event.stopPropagation();
      return;
    }
    const body=modal.querySelector(':scope > .modal-body');
    if(!body||body.scrollHeight<=body.clientHeight+1||!event.deltaY)return;
    if(event.cancelable)event.preventDefault();
    body.scrollTop+=event.deltaY;
  },{capture:true,passive:false});

  const observer=new MutationObserver(records=>{
    let needsHydrate=false;
    for(const record of records){
      if(record.type==='childList'&&([...record.addedNodes].some(node=>node.nodeType===1)))needsHydrate=true;
      if(record.type==='attributes'&&(record.attributeName==='hidden'||record.attributeName==='class'))needsHydrate=true;
      if(needsHydrate)break;
    }
    if(needsHydrate)requestAnimationFrame(()=>hydrate(document));
  });
  const modalRoot=document.getElementById('modal-root');
  if(modalRoot)observer.observe(modalRoot,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','class']});

  window.addEventListener('resize',()=>requestAnimationFrame(()=>growAllTextareas(document)),{passive:true});
  document.addEventListener('DOMContentLoaded',()=>hydrate(document),{once:true});
  requestAnimationFrame(()=>hydrate(document));

  window.MarcoOSVModular275={version:VERSION,hydrate,updateReorderButtons,growAllTextareas};
})();
