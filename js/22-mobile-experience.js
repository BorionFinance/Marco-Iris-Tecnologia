/* Borion Finance V6.23.9 — Mobile Experience Layer
   Refinamentos de interação do Smartphone Mode sem alterar regras financeiras:
   - bottom sheets com gesto de puxar para baixo;
   - transições de navegação com View Transitions quando disponível;
   - feedback tátil leve;
   - tratamento do viewport/teclado/safe areas;
   - estado online/offline;
   - microinterações de toque e acessibilidade. */

const MobileExperience = {
  initialized:false,
  modalObserver:null,
  scrollPositions:new Map(),
  networkHideTimer:null,
  lastHapticAt:0,
  viewportRaf:0,

  isSmart(){
    try{return typeof isSmartphoneMode==='function' && isSmartphoneMode();}
    catch(e){return false;}
  },

  reducedMotion(){
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  },

  haptic(pattern=7){
    if(!this.isSmart() || !navigator.vibrate) return;
    const now=Date.now();
    if(now-this.lastHapticAt<34) return;
    this.lastHapticAt=now;
    try{navigator.vibrate(pattern);}catch(e){}
  },

  setViewportVars(){
    const vv=window.visualViewport;
    const height=Math.max(1,Math.round(vv?vv.height:window.innerHeight));
    const offsetTop=Math.max(0,Math.round(vv?vv.offsetTop:0));
    const keyboard=Math.max(0,Math.round(window.innerHeight-height-offsetTop));
    document.documentElement.style.setProperty('--borion-vh',`${height}px`);
    document.documentElement.style.setProperty('--borion-vv-top',`${offsetTop}px`);
    document.documentElement.style.setProperty('--borion-keyboard',`${keyboard}px`);
    document.documentElement.classList.toggle('keyboard-open',keyboard>120);
  },

  requestViewportUpdate(){
    if(this.viewportRaf) return;
    this.viewportRaf=requestAnimationFrame(()=>{
      this.viewportRaf=0;
      this.setViewportVars();
    });
  },

  showConnectivity(online=navigator.onLine){
    if(!this.isSmart()) return;
    let banner=document.getElementById('mobile-network-banner');
    if(!banner){
      banner=document.createElement('div');
      banner.id='mobile-network-banner';
      banner.className='mobile-network-banner';
      banner.setAttribute('role','status');
      banner.setAttribute('aria-live','polite');
      document.body.appendChild(banner);
    }
    clearTimeout(this.networkHideTimer);
    banner.className=`mobile-network-banner ${online?'is-online':'is-offline'} is-visible`;
    banner.innerHTML=online
      ? '<span class="mnb-dot"></span><strong>Conexão restaurada</strong><small>O Borion continuará sincronizando.</small>'
      : '<span class="mnb-dot"></span><strong>Você está offline</strong><small>Os dados continuam protegidos neste aparelho.</small>';
    if(online){
      this.networkHideTimer=setTimeout(()=>banner.classList.remove('is-visible'),2600);
    }
  },

  runViewTransition(update){
    if(!this.isSmart() || this.reducedMotion() || typeof document.startViewTransition!=='function'){
      update();
      return;
    }
    try{document.startViewTransition(update);}catch(e){update();}
  },

  restoreScroll(key){
    const top=this.scrollPositions.get(key)||0;
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo({top,behavior:'instant'})));
  },

  patchNavigation(){
    if(window.__borionMobileNavigationPatched) return;
    window.__borionMobileNavigationPatched=true;

    if(window.Nav && typeof Nav.go==='function'){
      const original=Nav.go.bind(Nav);
      Nav.go=(key)=>{
        if(!this.isSmart()){original(key);return;}
        const from=(window.S&&S.view)||'overview';
        this.scrollPositions.set(from,window.scrollY||0);
        this.haptic(6);
        this.runViewTransition(()=>original(key));
        this.restoreScroll(key);
      };
    }

    if(window.SmartphoneMode && typeof SmartphoneMode.goBudget==='function'){
      const original=SmartphoneMode.goBudget.bind(SmartphoneMode);
      SmartphoneMode.goBudget=(tab)=>{
        if(!this.isSmart()){original(tab);return;}
        const from=(window.S&&S.view)||'overview';
        this.scrollPositions.set(from,window.scrollY||0);
        this.haptic(6);
        this.runViewTransition(()=>original(tab));
        requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'instant'}));
      };
    }
  },

  decorateModalOverlay(overlay){
    if(!overlay || overlay.dataset.mobileSheetDecorated==='1' || !this.isSmart()) return;
    const box=overlay.querySelector('.modal-box');
    if(!box) return;
    if(box.matches('.smartphone-exit-modal,.smart-save-reload-modal,.reserve-report-modal')) return;
    overlay.dataset.mobileSheetDecorated='1';
    overlay.classList.add('mobile-sheet-overlay');
    box.classList.add('mobile-bottom-sheet');

    let handle=box.querySelector(':scope > .mobile-sheet-handle');
    if(!handle){
      handle=document.createElement('button');
      handle.type='button';
      handle.className='mobile-sheet-handle';
      handle.setAttribute('aria-label','Arraste para baixo para fechar');
      handle.innerHTML='<span></span>';
      box.insertBefore(handle,box.firstChild);
    }

    /* O sheet não é mais o próprio elemento rolável. Um contêiner dedicado mantém o
       gesto vertical estável no Android, inclusive com teclado aberto, inputs e selects. */
    let scroller=box.querySelector(':scope > .mobile-sheet-scroll');
    if(!scroller){
      scroller=document.createElement('div');
      scroller.className='mobile-sheet-scroll';
      const movable=Array.from(box.childNodes).filter(node=>node!==handle && node!==scroller);
      movable.forEach(node=>scroller.appendChild(node));
      box.appendChild(scroller);
    }

    /* Impede rolagem da página de fundo quando o gesto começa na área escura, sem
       cancelar os gestos que começam dentro do conteúdo rolável do formulário. */
    const eventStartedInsideSheet=e=>{
      const target=e.target && e.target.nodeType===1 ? e.target : e.target?.parentElement;
      return !!(target && target.closest('.mobile-bottom-sheet'));
    };
    overlay.addEventListener('touchmove',e=>{
      if(!eventStartedInsideSheet(e) && e.cancelable) e.preventDefault();
    },{passive:false});
    overlay.addEventListener('wheel',e=>{
      if(!eventStartedInsideSheet(e) && e.cancelable) e.preventDefault();
    },{passive:false});

    const markDirty=e=>{
      if(e.target.matches('input,select,textarea')) box.dataset.sheetDirty='1';
    };
    box.addEventListener('input',markDirty,{passive:true});
    box.addEventListener('change',markDirty,{passive:true});

    let pointerId=null,startY=0,lastY=0,startAt=0,lastAt=0;
    const reset=()=>{
      box.classList.remove('is-sheet-dragging');
      box.style.removeProperty('--sheet-y');
      overlay.style.removeProperty('--sheet-overlay-opacity');
      pointerId=null;
    };
    handle.addEventListener('pointerdown',e=>{
      if(e.button!=null&&e.button!==0) return;
      pointerId=e.pointerId;startY=lastY=e.clientY;startAt=lastAt=performance.now();
      box.classList.add('is-sheet-dragging');
      try{handle.setPointerCapture(pointerId);}catch(err){}
    },{passive:true});
    handle.addEventListener('pointermove',e=>{
      if(pointerId!==e.pointerId) return;
      const dy=Math.max(0,e.clientY-startY);
      if(dy<=0) return;
      e.preventDefault();
      const resisted=dy/(1+dy/700);
      box.style.setProperty('--sheet-y',`${resisted}px`);
      overlay.style.setProperty('--sheet-overlay-opacity',String(Math.max(.25,1-resisted/520)));
      lastY=e.clientY;lastAt=performance.now();
    },{passive:false});
    const finish=e=>{
      if(pointerId!==e.pointerId) return;
      const dy=Math.max(0,e.clientY-startY);
      const velocity=(e.clientY-lastY)/Math.max(1,performance.now()-lastAt);
      const dirty=box.dataset.sheetDirty==='1';
      const threshold=dirty?165:88;
      const shouldClose=dy>threshold || (velocity>.8 && dy>(dirty?90:42));
      try{handle.releasePointerCapture(pointerId);}catch(err){}
      if(shouldClose){
        this.haptic(9);
        box.classList.add('is-sheet-closing');
        box.style.setProperty('--sheet-y','110%');
        overlay.style.setProperty('--sheet-overlay-opacity','0');
        setTimeout(()=>{if(typeof closeModal==='function') closeModal();},170);
      }else{
        if(dirty&&dy>90){
          this.haptic([8,28,8]);
          if(typeof toast==='function') toast('Há alterações não salvas. Puxe mais para fechar.');
        }
        reset();
      }
      pointerId=null;
    };
    handle.addEventListener('pointerup',finish,{passive:true});
    handle.addEventListener('pointercancel',reset,{passive:true});
  },

  decorateNotificationPanel(panel){
    if(!panel || panel.dataset.mobileSheetGestures==='1' || !this.isSmart()) return;
    panel.dataset.mobileSheetGestures='1';
    const handle=panel.querySelector('.notif-panel-handle');
    if(!handle) return;
    let pointerId=null,startY=0,lastY=0,lastAt=0;
    const reset=()=>{
      panel.classList.remove('is-panel-dragging');
      panel.style.removeProperty('--notif-sheet-y');
      pointerId=null;
    };
    handle.addEventListener('pointerdown',e=>{
      pointerId=e.pointerId;startY=lastY=e.clientY;lastAt=performance.now();panel.classList.add('is-panel-dragging');
      try{handle.setPointerCapture(pointerId);}catch(err){}
    },{passive:true});
    handle.addEventListener('pointermove',e=>{
      if(pointerId!==e.pointerId)return;
      const dy=Math.max(0,e.clientY-startY);
      if(dy<=0)return;
      e.preventDefault();
      panel.style.setProperty('--notif-sheet-y',`${dy/(1+dy/650)}px`);
      lastY=e.clientY;lastAt=performance.now();
    },{passive:false});
    const finish=e=>{
      if(pointerId!==e.pointerId)return;
      const dy=Math.max(0,e.clientY-startY);
      const velocity=(e.clientY-lastY)/Math.max(1,performance.now()-lastAt);
      try{handle.releasePointerCapture(pointerId);}catch(err){}
      if(dy>82 || (velocity>.75&&dy>38)){
        this.haptic(7);
        panel.classList.add('is-panel-closing');
        panel.style.setProperty('--notif-sheet-y','110%');
        setTimeout(()=>{if(window.Notifs||typeof Notifs!=='undefined')Notifs.closePanel();},155);
      }else reset();
      pointerId=null;
    };
    handle.addEventListener('pointerup',finish,{passive:true});
    handle.addEventListener('pointercancel',reset,{passive:true});
  },

  decorateExistingModals(){
    document.querySelectorAll('#modal-root .modal-overlay').forEach(node=>this.decorateModalOverlay(node));
  },

  installModalObserver(){
    const root=document.getElementById('modal-root');
    if(!root||this.modalObserver)return;
    this.modalObserver=new MutationObserver(()=>this.decorateExistingModals());
    this.modalObserver.observe(root,{childList:true,subtree:true});
    this.decorateExistingModals();
  },

  installTouchFeedback(){
    if(window.__borionTouchFeedbackWired) return;
    window.__borionTouchFeedbackWired=true;
    document.addEventListener('pointerdown',e=>{
      if(!this.isSmart())return;
      const target=e.target.closest('button,.smart-quick-action,.sb-item,.list-row,.smart-recent-row');
      if(!target)return;
      target.classList.add('is-touching');
    },{passive:true});
    const clear=e=>{
      const target=e.target&&e.target.closest?e.target.closest('.is-touching'):null;
      if(target)setTimeout(()=>target.classList.remove('is-touching'),80);
    };
    document.addEventListener('pointerup',clear,{passive:true});
    document.addEventListener('pointercancel',clear,{passive:true});
    document.addEventListener('click',e=>{
      if(!this.isSmart())return;
      if(e.target.closest('.smart-bottom-nav button,.smart-quick-action,.btn-primary,.toggle-switch,.bell-btn'))this.haptic(5);
    },{passive:true});
  },

  installAccessibility(){
    const toastRoot=document.getElementById('toast-root');
    if(toastRoot){toastRoot.setAttribute('aria-live','polite');toastRoot.setAttribute('aria-atomic','true');}
    document.documentElement.classList.toggle('reduced-motion',this.reducedMotion());
  },

  init(){
    if(this.initialized)return;
    this.initialized=true;
    this.setViewportVars();
    this.patchNavigation();
    this.installModalObserver();
    this.installTouchFeedback();
    this.installAccessibility();
    window.addEventListener('resize',()=>this.requestViewportUpdate(),{passive:true});
    if(window.visualViewport){
      visualViewport.addEventListener('resize',()=>this.requestViewportUpdate(),{passive:true});
      visualViewport.addEventListener('scroll',()=>this.requestViewportUpdate(),{passive:true});
    }
    window.addEventListener('offline',()=>this.showConnectivity(false));
    window.addEventListener('online',()=>this.showConnectivity(true));
    if(!navigator.onLine)setTimeout(()=>this.showConnectivity(false),500);
  }
};
window.MobileExperience=MobileExperience;

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',()=>MobileExperience.init(),{once:true});
else MobileExperience.init();
