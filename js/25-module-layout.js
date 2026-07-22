/* Borion Finance — Grade dinâmica reutilizável para módulos personalizáveis.
   Usa CSS Grid denso + medição automática para preencher os espaços livres entre cards.
   Ordem, largura, altura e quantidade de colunas ficam salvas dentro do perfil. */
(() => {
  'use strict';
  const SCOPES={
    overview_modules:{label:'Módulos da Visão Geral',columns:4},
    patrimony_modules:{label:'Módulos do Patrimônio',columns:4}
  };
  const ModuleLayout={
    activeScope:null,
    root(create=false){
      if(typeof S==='undefined'||!S.data) return null;
      if(create&&!S.data.uiPreferences) S.data.uiPreferences={};
      if(create&&!S.data.uiPreferences.moduleLayouts) S.data.uiPreferences.moduleLayouts={};
      return S.data.uiPreferences&&S.data.uiPreferences.moduleLayouts||null;
    },
    normalize(scope,value){
      const cfg=SCOPES[scope]||{columns:4};
      const src=value&&typeof value==='object'?value:{};
      const columns=Math.max(2,Math.min(6,Number(src.columns)||cfg.columns||4));
      const order=Array.isArray(src.order)?src.order.map(String):[];
      const items=src.items&&typeof src.items==='object'?src.items:{};
      return {columns,order,items};
    },
    get(scope){
      const root=this.root(false); return this.normalize(scope,root&&root[scope]);
    },
    save(scope,layout,{quiet=false}={}){
      const root=this.root(true); if(!root) return;
      root[scope]=this.normalize(scope,layout);
      if(typeof saveCurrentData==='function') saveCurrentData();
      if(!quiet&&typeof toast==='function') toast('Organização dos módulos salva.');
    },
    reconcile(scope,ids){
      const layout=this.get(scope),valid=new Set(ids.map(String));
      const order=layout.order.filter(id=>valid.has(String(id)));
      const seen=new Set(order.map(String));
      ids.map(String).forEach(id=>{if(!seen.has(id)){order.push(id);seen.add(id);}});
      layout.order=order; return layout;
    },
    applyOrder(scope,items,{idKey='id'}={}){
      const layout=this.reconcile(scope,items.map(item=>item[idKey]));
      const pos=new Map(layout.order.map((id,index)=>[String(id),index]));
      return items.slice().sort((a,b)=>(pos.get(String(a[idKey]))??999999)-(pos.get(String(b[idKey]))??999999));
    },
    isActive(scope){ return this.activeScope===scope; },
    toggle(scope){ this.activeScope=this.activeScope===scope?null:scope; if(typeof renderView==='function') renderView(); },
    setColumns(scope,value){
      const layout=this.get(scope); layout.columns=Math.max(2,Math.min(6,Number(value)||4)); this.save(scope,layout,{quiet:true}); renderView();
    },
    itemSize(scope,id,defaults={}){
      const layout=this.get(scope),saved=layout.items[String(id)]||{};
      return {w:Math.max(1,Math.min(layout.columns,Number(saved.w)||Number(defaults.w)||2)),h:Math.max(0,Number(saved.h)||0)};
    },
    adjust(scope,id,axis,delta,defaultWidth=2){
      const layout=this.get(scope),key=String(id),current=this.itemSize(scope,key,{w:defaultWidth});
      layout.items[key]=Object.assign({},layout.items[key]||{});
      if(axis==='w') layout.items[key].w=Math.max(1,Math.min(layout.columns,current.w+Number(delta||0)));
      else layout.items[key].h=Math.max(160,(current.h||240)+(Number(delta||0)*80));
      this.save(scope,layout,{quiet:true}); renderView();
    },
    autoHeight(scope,id){
      const layout=this.get(scope),key=String(id); layout.items[key]=Object.assign({},layout.items[key]||{}); delete layout.items[key].h;
      this.save(scope,layout,{quiet:true}); renderView();
    },
    saveOrderFromDom(scope,container){
      const layout=this.get(scope);
      layout.order=Array.from(container.querySelectorAll(':scope > [data-module-id]')).map(el=>String(el.dataset.moduleId));
      this.save(scope,layout,{quiet:true});
    },
    reset(scope){
      const run=()=>{const root=this.root(true);delete root[scope];if(typeof saveCurrentData==='function')saveCurrentData();this.activeScope=null;renderView();if(typeof toast==='function')toast('Grade padrão restaurada.');};
      if(typeof openConfirmModal==='function') openConfirmModal({title:'Restaurar grade padrão',text:'A ordem, largura e altura personalizadas destes módulos serão removidas.',confirmLabel:'Restaurar',cancelLabel:'Cancelar',variant:'danger',onConfirm:run});
      else if(confirm('Restaurar a grade padrão destes módulos?')) run();
    },
    toolbarHTML(scope,title){
      const active=this.isActive(scope),layout=this.get(scope);
      return `<div class="module-layout-toolbar ${active?'active':''}"><div><strong>${esc(title||SCOPES[scope]?.label||'Organização dos módulos')}</strong><span>${active?'Arraste e redimensione. Os espaços livres são preenchidos automaticamente.':'Ordem, tamanho e encaixe dos módulos.'}</span></div><div class="module-layout-actions">${active?`<div class="module-column-picker"><span>COLUNAS</span>${[2,3,4,5,6].map(n=>`<button type="button" class="${layout.columns===n?'active':''}" onclick="ModuleLayout.setColumns('${scope}',${n})">${n}</button>`).join('')}</div><button class="btn-outline btn-sm" onclick="ModuleLayout.reset('${scope}')">Restaurar</button>`:''}<button class="btn ${active?'btn-primary':'btn-outline'} btn-sm" onclick="ModuleLayout.toggle('${scope}')">${active?'Concluir':'Organizar módulos'}</button></div></div>`;
    },
    slotControlsHTML(scope,id,label,defaultWidth=2){
      if(!this.isActive(scope)) return '';
      const size=this.itemSize(scope,id,{w:defaultWidth});
      return `<div class="module-slot-toolbar"><button type="button" class="module-drag-handle" data-module-drag-handle title="Arrastar ${esc(label||'módulo')}">⠿</button><span title="Largura atual">L ${size.w}</span><button type="button" onclick="ModuleLayout.adjust('${scope}','${esc(String(id))}','w',-1,${defaultWidth})" title="Diminuir largura">−</button><button type="button" onclick="ModuleLayout.adjust('${scope}','${esc(String(id))}','w',1,${defaultWidth})" title="Aumentar largura">+</button><span title="Altura atual">${size.h?Math.round(size.h)+' px':'Altura auto'}</span><button type="button" onclick="ModuleLayout.adjust('${scope}','${esc(String(id))}','h',-1,${defaultWidth})" title="Diminuir altura">−</button><button type="button" onclick="ModuleLayout.autoHeight('${scope}','${esc(String(id))}')" title="Altura automática">Auto</button><button type="button" onclick="ModuleLayout.adjust('${scope}','${esc(String(id))}','h',1,${defaultWidth})" title="Aumentar altura">+</button></div>`;
    },
    slotStyle(scope,id,defaultWidth=2){
      const size=this.itemSize(scope,id,{w:defaultWidth});
      return `--module-span:${size.w};${size.h?`--module-fixed-height:${size.h}px;`:''}`;
    },
    schedule(scope){ setTimeout(()=>this.refresh(scope),0); },
    refresh(scope){
      document.querySelectorAll(`[data-module-layout="${scope}"]`).forEach(grid=>{
        const row=8,gap=8;
        grid.querySelectorAll(':scope > [data-module-id]').forEach(slot=>{
          const content=slot.querySelector(':scope > .module-layout-content');
          if(!content) return;
          const fixed=getComputedStyle(slot).getPropertyValue('--module-fixed-height').trim();
          if(fixed){content.style.height=fixed;content.style.overflow='auto';}else{content.style.height='auto';content.style.overflow='visible';}
          slot.style.gridRowEnd='auto';
          const height=Math.max(40,content.getBoundingClientRect().height+(this.isActive(scope)?44:0));
          slot.style.gridRowEnd=`span ${Math.max(1,Math.ceil((height+gap)/(row+gap)))}`;
        });
      });
    }
  };
  window.ModuleLayout=ModuleLayout;

  document.addEventListener('pointerdown',event=>{
    const handle=event.target.closest('[data-module-drag-handle]');
    if(!handle) return;
    const slot=handle.closest('[data-module-id]'),grid=slot&&slot.closest('[data-module-layout]');
    if(!slot||!grid||!ModuleLayout.isActive(grid.dataset.moduleLayout)) return;
    event.preventDefault();
    const pointerId=event.pointerId;let target=null,active=true;
    slot.classList.add('module-dragging');grid.classList.add('module-grid-dragging');
    const clear=()=>{if(target)target.classList.remove('module-drop-target');target=null;};
    const cleanup=()=>{clear();slot.classList.remove('module-dragging');grid.classList.remove('module-grid-dragging');};
    const unbind=()=>{
      if(!active)return;active=false;
      document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',done);document.removeEventListener('pointercancel',cancel);
      document.removeEventListener('visibilitychange',visibilityCancel);window.removeEventListener('blur',blurCancel);handle.removeEventListener('lostpointercapture',lostCapture);
    };
    const move=ev=>{
      if(!active||ev.pointerId!==pointerId)return;
      if(!slot.isConnected||!grid.isConnected){cancel();return;}
      if(ev.cancelable)ev.preventDefault();
      const hit=document.elementFromPoint(ev.clientX,ev.clientY);const next=hit&&hit.closest('[data-module-id]');
      if(next&&next!==slot&&next.closest('[data-module-layout]')===grid){if(target!==next){clear();target=next;target.classList.add('module-drop-target');}}else clear();
    };
    const done=ev=>{
      if(!active||ev.pointerId!==pointerId)return;unbind();
      if(target&&target.isConnected&&slot.isConnected){const rect=target.getBoundingClientRect();const before=ev.clientY<rect.top+rect.height/2||ev.clientX<rect.left+rect.width/2;grid.insertBefore(slot,before?target:target.nextSibling);ModuleLayout.saveOrderFromDom(grid.dataset.moduleLayout,grid);}
      cleanup();renderView();
    };
    const cancel=ev=>{if(!active||(ev&&ev.pointerId!=null&&ev.pointerId!==pointerId))return;unbind();cleanup();};
    const blurCancel=()=>cancel();
    const visibilityCancel=()=>{if(document.hidden)cancel();};
    const lostCapture=ev=>cancel(ev);
    document.addEventListener('pointermove',move,{passive:false});document.addEventListener('pointerup',done);document.addEventListener('pointercancel',cancel);
    document.addEventListener('visibilitychange',visibilityCancel);window.addEventListener('blur',blurCancel);handle.addEventListener('lostpointercapture',lostCapture);
    try{handle.setPointerCapture(pointerId);}catch(err){}
  });
  let resizeTimer=0;
  window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{Object.keys(SCOPES).forEach(scope=>ModuleLayout.refresh(scope));},120);});
})();
