'use strict';

/* Marco Iris Tecnologia v2.2.13 — experiência mobile refinada e rolagem centralizada. */
(() => {
  const MobileMarco = {
    initialized:false,
    navPatched:false,
    originalNavigate:null,
    viewStack:[],
    scrollByView:new Map(),
    modalObserver:null,
    rootObserver:null,
    layerObserver:null,
    guardArmed:false,
    allowExit:false,
    networkTimer:0,
    lastHaptic:0,
    swipe:null,
    viewportBaseline:0,
    viewportWidth:0,
    viewportRaf:0,
    viewportNavPending:false,
    focusScrollTimer:0,

    isMobile(){return window.matchMedia('(max-width:900px)').matches;},
    currentView(){try{return CURRENT_VIEW||'dashboard';}catch(_){return 'dashboard';}},
    scroller(){return document.scrollingElement||document.documentElement;},
    scrollTop(){return window.scrollY||this.scroller()?.scrollTop||0;},
    setScroll(top=0){
      window.scrollTo({top,behavior:'auto'});
      requestAnimationFrame(()=>window.scrollTo({top,behavior:'auto'}));
    },
    haptic(pattern=7){
      if(!this.isMobile()||!navigator.vibrate)return;
      const now=Date.now();if(now-this.lastHaptic<35)return;
      this.lastHaptic=now;
      try{navigator.vibrate(pattern);}catch(_){ }
    },

    syncScrollLock(){
      window.MarcoScrollLock?.sync?.();
    },

    syncMenuLayer(){
      let layer=document.querySelector('body > .mobile-menu-layer');
      if(this.isMobile()){
        if(!layer){
          layer=document.createElement('div');
          layer.className='mobile-menu-layer';
          layer.setAttribute('aria-hidden','true');
          document.body.appendChild(layer);
        }
        const sidebar=document.querySelector('#root .sidebar');
        const scrim=document.querySelector('#root .sidebar-scrim');
        if(sidebar&&scrim){
          layer.querySelector('.sidebar')?.remove();
          layer.querySelector('.sidebar-scrim')?.remove();
          layer.append(scrim,sidebar);
        }
        layer.setAttribute('aria-hidden',document.body.classList.contains('menu-open')?'false':'true');
        return;
      }
      if(layer){
        const shell=document.querySelector('#root .app-shell'),main=shell?.querySelector(':scope > .main');
        const sidebar=layer.querySelector('.sidebar'),scrim=layer.querySelector('.sidebar-scrim');
        if(shell&&main){
          if(sidebar)shell.insertBefore(sidebar,main);
          if(scrim)shell.insertBefore(scrim,main);
        }
        layer.remove();
      }
    },

    queueViewport(withNav=false){
      this.viewportNavPending=this.viewportNavPending||withNav;
      if(this.viewportRaf)return;
      this.viewportRaf=requestAnimationFrame(()=>{
        this.viewportRaf=0;
        const updateNav=this.viewportNavPending;
        this.viewportNavPending=false;
        this.setViewport();
        if(updateNav)this.ensureBottomNav();
      });
    },

    keepActiveFieldVisible(){
      if(!this.isMobile())return;
      const active=document.activeElement;
      if(!active||!/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName))return;
      const scroll=active.closest?.('#modal-root .modal-body');
      if(!scroll)return;
      const field=active.closest?.('.field')||active;
      const area=scroll.getBoundingClientRect();
      const rect=field.getBoundingClientRect();
      if(rect.top<area.top+8||rect.bottom>area.bottom-8){
        field.scrollIntoView({block:'center',inline:'nearest',behavior:'auto'});
      }
    },

    setViewport(){
      this.syncScrollLock();
      const vv=window.visualViewport;
      const active=document.activeElement;
      const editing=!!active&&/^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName);
      const modalEditing=editing&&!!active.closest?.('#modal-root .modal');
      const visualHeight=Math.max(320,Math.round(vv?.height||window.innerHeight));
      const width=Math.round(vv?.width||window.innerWidth);
      if(!this.viewportBaseline||Math.abs(width-this.viewportWidth)>80){this.viewportBaseline=visualHeight;this.viewportWidth=width;}
      else if(!editing&&visualHeight>this.viewportBaseline)this.viewportBaseline=visualHeight;
      const keyboard=editing?Math.max(0,Math.round(this.viewportBaseline-visualHeight-(vv?.offsetTop||0))):0;
      document.documentElement.style.setProperty('--marco-app-vh',`${visualHeight}px`);
      document.documentElement.style.setProperty('--marco-modal-vh',`${visualHeight}px`);
      document.documentElement.style.setProperty('--marco-keyboard',`${keyboard}px`);
      document.documentElement.classList.toggle('marco-mobile-ui',this.isMobile());
      this.syncMenuLayer();
      document.body.classList.toggle('keyboard-open',keyboard>90);
      document.body.classList.toggle('modal-field-active',this.isMobile()&&modalEditing);
      if(this.isMobile()&&modalEditing){
        clearTimeout(this.focusScrollTimer);
        this.focusScrollTimer=setTimeout(()=>this.keepActiveFieldVisible(),70);
      }
    },

    showNetwork(online=navigator.onLine){
      if(!this.isMobile())return;
      let banner=document.getElementById('marco-network-banner');
      if(!banner){
        banner=document.createElement('div');
        banner.id='marco-network-banner';
        banner.className='marco-network-banner';
        banner.setAttribute('role','status');
        banner.setAttribute('aria-live','polite');
        document.body.appendChild(banner);
      }
      clearTimeout(this.networkTimer);
      banner.className=`marco-network-banner ${online?'is-online':'is-offline'} is-visible`;
      banner.innerHTML=online
        ? '<span class="network-dot"></span><strong>Conexão restaurada</strong><small>Recarregue para buscar a base oficial do Google Drive.</small>'
        : '<span class="network-dot"></span><strong>Internet indisponível</strong><small>O aplicativo foi bloqueado e não permite alterações offline.</small>';
      if(online)this.networkTimer=setTimeout(()=>banner.classList.remove('is-visible'),2600);
    },

    ensureBottomNav(){
      let nav=document.querySelector('.mobile-bottom-nav');
      const shouldShow=this.isMobile()&&!document.body.classList.contains('login-page')&&!!document.querySelector('.app-bg');
      if(!shouldShow){
        nav?.remove();
        return;
      }
      const labels={dashboard:'Início',orders:'OSV',agenda:'Agenda',clients:'Clientes',finance:'Financeiro',catalog:'Catálogo',documents:'Documentos',settings:'Ajustes'};
      const icons={dashboard:'dashboard',orders:'orders',agenda:'agenda',clients:'clients',finance:'finance',catalog:'catalog',documents:'documents',settings:'settings'};
      let settings=null;
      try{settings=typeof data==='function'?data()?.settings:null;}catch(_){settings=null;}
      const fallback=['dashboard','orders','agenda','clients','finance','catalog','documents','settings'];
      const ordered=Array.isArray(settings?.menuOrder)?settings.menuOrder.filter(view=>labels[view]):fallback.slice();
      fallback.forEach(view=>{if(!ordered.includes(view))ordered.push(view);});
      const visible=ordered.filter(view=>view!=='agenda'||settings?.modules?.agenda!==false);
      const items=visible.slice(0,4).map(view=>[view,icons[view]||view,labels[view]||view]);
      const signature=items.map(item=>item[0]).join('|');
      if(!nav){
        nav=document.createElement('nav');
        nav.className='mobile-bottom-nav';
        nav.setAttribute('aria-label','Navegação principal mobile');
        document.body.appendChild(nav);
      }
      if(nav.dataset.orderSignature!==signature){
        nav.dataset.orderSignature=signature;
        nav.innerHTML=items.map(([view,ico,label])=>`<button type="button" data-action="navigate" data-view="${view}" aria-label="${label}">${icon(ico,22)}<span>${label}</span></button>`).join('')+
          `<button type="button" data-action="toggle-menu" aria-label="Mais opções">${icon('menu',22)}<span>Mais</span></button>`;
      }
      nav.querySelectorAll('[data-view]').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===this.currentView()));
    },

    patchNavigation(){
      if(this.navPatched||typeof window.navigateTo!=='function')return;
      this.navPatched=true;
      this.originalNavigate=window.navigateTo;
      const self=this;
      window.navigateTo=function(view){
        const from=self.currentView();
        if(self.isMobile()&&view&&view!==from&&!self._backNavigation){
          self.scrollByView.set(from,self.scrollTop());
          self.viewStack.push(from);
          if(self.viewStack.length>30)self.viewStack.shift();
          self.haptic(6);
        }
        const result=self.originalNavigate.call(this,view);
        window.MarcoMenu?.close?.();
        if(self.isMobile()&&!self._backNavigation)self.setScroll(0);
        setTimeout(()=>self.ensureBottomNav(),40);
        return result;
      };
    },

    armBackGuard(url=location.href){
      if(!this.isMobile()||this.allowExit)return;
      history.pushState({...(history.state||{}),__marcoMobileGuard:true},'',url);
      this.guardArmed=true;
    },

    setupBackGuard(){
      if(!this.isMobile()||this.guardArmed)return;
      history.replaceState({...(history.state||{}),__marcoMobileBase:true},'',location.href);
      this.armBackGuard();
      window.addEventListener('popstate',async()=>{
        if(this.allowExit||!this.isMobile())return;
        if(this.closeTopLayer()){this.armBackGuard();return;}
        const previous=this.viewStack.pop();
        if(previous&&this.originalNavigate){
          this.armBackGuard();
          this._backNavigation=true;
          this.originalNavigate(previous);
          this._backNavigation=false;
          const top=this.scrollByView.get(previous)||0;
          setTimeout(()=>this.setScroll(top),250);
          this.ensureBottomNav();
          this.haptic(7);
          return;
        }
        if(this.currentView()!=='dashboard'&&this.originalNavigate){
          this.armBackGuard();
          this._backNavigation=true;
          this.originalNavigate('dashboard');
          this._backNavigation=false;
          this.setScroll(0);
          this.ensureBottomNav();
          this.haptic(7);
          return;
        }
        const leave=await confirmAction('Deseja sair do Marco Iris Tecnologia?', {title:'Sair do aplicativo',confirmLabel:'Sair',tone:'danger'});
        if(leave){this.allowExit=true;history.back();return;}
        this.armBackGuard();
      });
    },

    closeTopLayer(){
      const confirmation=document.querySelector('#confirm-root .app-confirm-backdrop, #confirm-root .whatsapp-review-backdrop');
      if(confirmation){
        const cancel=confirmation.querySelector('[data-confirm-choice="cancel"], [data-action="whatsapp-review-cancel"]');
        if(cancel)cancel.click();else confirmation.remove();
        return true;
      }
      const quickAction=document.querySelector('details.quick-actions[open]');
      if(quickAction){quickAction.open=false;return true;}
      if(document.querySelector('#modal-root .modal-backdrop')){
        try{closeModal({reason:'back'});}catch(_){document.getElementById('modal-root')?.replaceChildren();}
        return true;
      }
      if(document.body.classList.contains('menu-open')){
        window.MarcoMenu?.close?.();
        return true;
      }
      return false;
    },

    decorateModal(backdrop){
      if(!this.isMobile()||!backdrop||backdrop.dataset.marcoMobileSheet==='1')return;
      const modal=backdrop.querySelector('.modal');
      if(!modal)return;
      backdrop.dataset.marcoMobileSheet='1';
      backdrop.classList.add('mobile-sheet-backdrop');
      modal.classList.add('mobile-bottom-sheet');

      const handle=document.createElement('button');
      handle.type='button';
      handle.className='mobile-sheet-handle';
      handle.setAttribute('aria-label','Arraste para baixo para fechar');
      handle.innerHTML='<span></span>';
      modal.insertBefore(handle,modal.firstChild);

      const appRoot=document.getElementById('root');
      if(appRoot)appRoot.inert=true;

      const markDirty=e=>{if(e.target.matches('input,select,textarea'))modal.dataset.sheetDirty='1';};
      modal.addEventListener('input',markDirty,{passive:true});
      modal.addEventListener('change',markDirty,{passive:true});
      backdrop.addEventListener('click',e=>{
        if(e.target!==backdrop||modal.dataset.sheetDirty==='1')return;
        try{closeModal({reason:'backdrop'});}catch(_){ }
      });

      let pointerId=null,startY=0,lastY=0,lastAt=0;
      const reset=()=>{
        modal.classList.remove('is-sheet-dragging');
        modal.style.removeProperty('--sheet-y');
        backdrop.style.removeProperty('--sheet-overlay-opacity');
        pointerId=null;
      };
      handle.addEventListener('pointerdown',e=>{
        if(e.button!=null&&e.button!==0)return;
        pointerId=e.pointerId;
        startY=lastY=e.clientY;
        lastAt=performance.now();
        modal.classList.add('is-sheet-dragging');
        try{handle.setPointerCapture(pointerId);}catch(_){ }
      },{passive:true});
      handle.addEventListener('pointermove',e=>{
        if(e.pointerId!==pointerId)return;
        const dy=Math.max(0,e.clientY-startY);
        if(!dy)return;
        e.preventDefault();
        const resisted=dy/(1+dy/680);
        modal.style.setProperty('--sheet-y',`${resisted}px`);
        backdrop.style.setProperty('--sheet-overlay-opacity',String(Math.max(.18,.54-resisted/900)));
        lastY=e.clientY;
        lastAt=performance.now();
      },{passive:false});
      const finish=e=>{
        if(e.pointerId!==pointerId)return;
        const dy=Math.max(0,e.clientY-startY);
        const velocity=(e.clientY-lastY)/Math.max(1,performance.now()-lastAt);
        const dirty=modal.dataset.sheetDirty==='1';
        const close=dy>(dirty?170:92)||(velocity>.78&&dy>(dirty?100:44));
        try{handle.releasePointerCapture(pointerId);}catch(_){ }
        if(close){
          this.haptic(9);
          modal.classList.add('is-sheet-closing');
          modal.style.setProperty('--sheet-y','110%');
          backdrop.style.setProperty('--sheet-overlay-opacity','0');
          setTimeout(()=>{try{closeModal({reason:'swipe'});}catch(_){ }},170);
        }else{
          if(dirty&&dy>90){
            this.haptic([7,25,7]);
            try{toast('Há alterações não salvas. Puxe mais para fechar.','warn');}catch(_){ }
          }
          reset();
        }
      };
      handle.addEventListener('pointerup',finish,{passive:true});
      handle.addEventListener('pointercancel',reset,{passive:true});
    },

    observeModals(){
      const root=document.getElementById('modal-root');
      if(!root||this.modalObserver)return;
      this.modalObserver=new MutationObserver(()=>{
        const backdrop=root.querySelector('.modal-backdrop');
        if(backdrop)this.decorateModal(backdrop);
        else{
          const appRoot=document.getElementById('root');
          if(appRoot)appRoot.inert=false;
        }
      });
      this.modalObserver.observe(root,{childList:true,subtree:true});
      const existing=root.querySelector('.modal-backdrop');
      if(existing)this.decorateModal(existing);
    },

    observeLayerState(){
      if(this.layerObserver)return;
      this.layerObserver=new MutationObserver(()=>{this.syncScrollLock();this.syncMenuLayer();});
      this.layerObserver.observe(document.body,{attributes:true,attributeFilter:['class']});
      this.syncScrollLock();
    },

    observeRoot(){
      const root=document.getElementById('root');
      if(!root||this.rootObserver)return;
      this.rootObserver=new MutationObserver(()=>{
        if(document.body.classList.contains('login-page')){
          this.viewStack.length=0;
          window.MarcoMenu?.close?.();
        }
        this.setViewport();
        this.patchNavigation();
        this.ensureBottomNav();
      });
      this.rootObserver.observe(root,{childList:true,subtree:true});
    },

    installTouchFeedback(){
      document.addEventListener('pointerdown',e=>{
        if(!this.isMobile())return;
        const el=e.target.closest('button,.btn,.nav-btn,.list-row,.calendar-day,.card');
        if(el&&!el.closest('.mobile-bottom-nav'))el.classList.add('is-touching');
      },{passive:true});
      const clear=e=>{
        const el=e.target?.closest?.('.is-touching');
        if(el)setTimeout(()=>el.classList.remove('is-touching'),75);
      };
      document.addEventListener('pointerup',clear,{passive:true});
      document.addEventListener('pointercancel',clear,{passive:true});
      document.addEventListener('click',e=>{
        if(this.isMobile()&&e.target.closest('button,.btn,[data-action]')){
          this.haptic(5);
          setTimeout(()=>this.ensureBottomNav(),30);
        }
      },{passive:true});
    },

    installSwipeNavigation(){
      const views=['dashboard','orders','agenda','clients'];
      document.addEventListener('pointerdown',e=>{
        if(!this.isMobile()||!e.isPrimary||e.button!==0)return;
        if(!e.target.closest('#view-root')||e.target.closest('input,select,textarea,button,a,[contenteditable],.table-wrap,.modal,.sidebar'))return;
        this.swipe={id:e.pointerId,x:e.clientX,y:e.clientY,time:performance.now()};
      },{passive:true});
      document.addEventListener('pointerup',e=>{
        const s=this.swipe;
        this.swipe=null;
        if(!s||s.id!==e.pointerId)return;
        const dx=e.clientX-s.x,dy=e.clientY-s.y,elapsed=performance.now()-s.time;
        if(elapsed>620||Math.abs(dx)<78||Math.abs(dx)<Math.abs(dy)*1.35)return;
        const index=views.indexOf(this.currentView());
        if(index<0)return;
        const next=dx<0?views[index+1]:views[index-1];
        if(next&&typeof window.navigateTo==='function'){
          window.navigateTo(next);
          this.haptic(8);
        }
      },{passive:true});
    },

    installEnterNavigation(){
      document.addEventListener('keydown',e=>{
        if(e.key!=='Enter'||e.shiftKey)return;
        const t=e.target;
        if(!(t instanceof HTMLElement))return;
        if(t.tagName==='TEXTAREA')return;
        if(t.tagName!=='INPUT'&&t.tagName!=='SELECT')return;
        if(t.tagName==='INPUT'&&['checkbox','radio','file','button','submit','reset'].includes(t.type))return;
        const form=t.closest('form');
        if(!form)return;
        const focusable=[...form.querySelectorAll('input,select,textarea')].filter(el=>!el.disabled&&el.type!=='hidden'&&el.offsetParent!==null);
        const index=focusable.indexOf(t);
        if(index===-1)return;
        e.preventDefault();
        const next=focusable[index+1];
        if(next){
          next.focus();
          if(next.tagName==='INPUT'&&typeof next.select==='function'){try{next.select();}catch(_){ }}
          this.haptic(4);
        }else{
          this.haptic(8);
          if(typeof form.requestSubmit==='function')form.requestSubmit();
          else form.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true}));
        }
      });
    },

    installFocusTrap(){
      document.addEventListener('keydown',e=>{
        if(e.key==='Escape'&&document.body.classList.contains('menu-open')){
          window.MarcoMenu?.close?.();
          return;
        }
        if(e.key!=='Tab')return;
        const modal=document.querySelector('#modal-root .modal');
        if(!modal)return;
        const focusable=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
        if(!focusable.length)return;
        const first=focusable[0],last=focusable[focusable.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      });
    },

    init(){
      if(this.initialized)return;
      this.initialized=true;
      this.setViewport();
      this.patchNavigation();
      this.setupBackGuard();
      this.observeModals();
      this.observeLayerState();
      this.observeRoot();
      this.ensureBottomNav();
      this.installTouchFeedback();
      this.installSwipeNavigation();
      this.installFocusTrap();
      this.installEnterNavigation();

      window.addEventListener('resize',()=>this.queueViewport(true),{passive:true});
      window.addEventListener('orientationchange',()=>setTimeout(()=>this.queueViewport(true),120),{passive:true});
      window.visualViewport?.addEventListener('resize',()=>this.queueViewport(false),{passive:true});
      window.addEventListener('online',()=>this.showNetwork(true));
      window.addEventListener('offline',()=>this.showNetwork(false));
      document.addEventListener('focusin',()=>this.queueViewport(false),{passive:true});
      document.addEventListener('focusout',()=>setTimeout(()=>this.queueViewport(false),80),{passive:true});
      document.addEventListener('visibilitychange',()=>{
        if(!document.hidden){
          this.setViewport();
          this.ensureBottomNav();
        }
      });
    }
  };

  window.MobileMarco=MobileMarco;
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>MobileMarco.init(),{once:true});
  else MobileMarco.init();
})();
