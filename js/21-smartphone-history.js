/* Borion Finance V6.23.9 — Histórico insistente do botão Voltar no Smartphone Mode
   Ordem lógica:
   1) fecha a camada flutuante aberta;
   2) volta para a Visão geral;
   3) mostra a confirmação do Borion;
   4) só sai depois de “Sim, sair”.

   Para absorver gestos rápidos/repetidos do Android, o app mantém uma pequena reserva
   de entradas sentinela no History API. Um burst de vários “Voltar” em menos de 650 ms
   conta como uma única ação lógica. Um beforeunload nativo permanece como última rede
   de segurança caso o navegador tente atravessar toda a reserva de uma só vez. */

const SmartphoneHistory = {
  active:false,
  exitPromptOpen:false,
  lastLogicalBackAt:0,
  STACK:'borion-smartphone-stack-v2',
  BASE:'borion-smartphone-base-v2',
  GUARD:'borion-smartphone-guard-v2',
  GUARD_DEPTH:8,
  BACK_BURST_MS:650,
  _boundPop:null,
  _boundBeforeUnload:null,

  isAvailable(){
    return !!(window.history && history.pushState && history.replaceState);
  },

  stateDepth(state){
    const s=state||history.state;
    if(!s || s.__borionSmartStack!==this.STACK) return null;
    const depth=Number(s.__borionSmartDepth);
    return Number.isFinite(depth) ? depth : null;
  },

  makeState(depth){
    return {
      __borionSmartStack:this.STACK,
      __borionSmartHistory:depth===0?this.BASE:this.GUARD,
      __borionSmartDepth:depth
    };
  },

  activate(){
    if(!this.isAvailable() || !isSmartphoneMode()) return;
    if(!this.active){
      this.active=true;
      this._boundPop=this.onPopState.bind(this);
      this._boundBeforeUnload=this.onBeforeUnload.bind(this);
      window.addEventListener('popstate',this._boundPop);
      window.addEventListener('beforeunload',this._boundBeforeUnload);
      window.addEventListener('pageshow',()=>{ if(isSmartphoneMode() && !window.__borionConfirmedExit) this.ensureStack(); });
      document.addEventListener('visibilitychange',()=>{
        if(document.visibilityState==='visible' && isSmartphoneMode() && !window.__borionConfirmedExit) this.ensureStack();
      });
    }
    this.ensureStack();
  },

  ensureStack(){
    if(!this.isAvailable() || !isSmartphoneMode() || window.__borionConfirmedExit || window.__borionInternalReload) return;
    let depth=this.stateDepth();
    if(depth===null){
      history.replaceState(Object.assign({},history.state||{},this.makeState(0)),'',location.href);
      depth=0;
    }
    if(depth<0 || depth>this.GUARD_DEPTH){
      history.replaceState(this.makeState(0),'',location.href);
      depth=0;
    }
    /* pushState descarta qualquer ramo “para frente”. Portanto repor do nível atual
       até GUARD_DEPTH não faz o histórico crescer indefinidamente. */
    for(let i=depth+1;i<=this.GUARD_DEPTH;i++){
      history.pushState(this.makeState(i),'',location.href);
    }
  },

  prepareInternalReload(){
    window.__borionInternalReload=true;
  },

  hasOpenModal(){
    const root=document.getElementById('modal-root');
    return !!(root && root.children && root.children.length);
  },

  closeTopLayer(){
    if(this.exitPromptOpen) return true;
    if(window.SmartphoneMode && SmartphoneMode.savingAndReloading) return true;

    const root=document.getElementById('modal-root');
    if(root && root.querySelector('.modal-overlay')){
      closeModal();
      return true;
    }

    const sidebar=document.querySelector('.sidebar');
    if(sidebar && sidebar.classList.contains('open')){
      if(window.MobileMenu) MobileMenu.close();
      return true;
    }

    if(typeof Notifs!=='undefined' && Notifs.panelOpen){
      Notifs.panelOpen=false;
      Notifs.renderPanel();
      return true;
    }

    if(typeof BankFilter!=='undefined' && BankFilter.panelOpen){
      BankFilter.panelOpen=false;
      BankFilter.renderPanel();
      return true;
    }

    const search=document.getElementById('global_search_results');
    if(search && !search.classList.contains('hidden')){
      search.classList.add('hidden');
      search.innerHTML='';
      return true;
    }

    return false;
  },

  goHome(){
    if(!(typeof S!=='undefined' && S.currentProfile && S.data)) return false;
    if(S.view==='overview') return false;
    S.view='overview';
    if(window.MobileMenu) MobileMenu.close();
    renderApp();
    return true;
  },

  showExitPrompt(){
    if(this.exitPromptOpen) return;
    this.exitPromptOpen=true;
    const root=document.getElementById('modal-root');
    if(!root){
      this.exitPromptOpen=false;
      if(window.confirm('Deseja sair da página?')) this.confirmExit();
      return;
    }

    const exitIcon=(typeof navIconSVG==='function') ? navIconSVG('overview') : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="5" height="14" rx="1.15"/><rect x="14" y="5" width="5" height="14" rx="1.15"/></svg>';
    const box=el(`<div class="modal-overlay smartphone-exit-overlay">
      <div class="modal-box smartphone-exit-modal" role="dialog" aria-modal="true" aria-labelledby="smart_exit_title">
        <div class="smartphone-exit-icon" aria-hidden="true">${exitIcon}</div>
        <h2 id="smart_exit_title">Deseja sair da página?</h2>
        <p class="modal-sub">Você está no Início do Borion. O app só será fechado depois da sua confirmação.</p>
        <div class="row-btns smartphone-exit-actions">
          <button type="button" class="btn btn-secondary" id="smart_exit_stay">Continuar no Borion</button>
          <button type="button" class="btn btn-danger" id="smart_exit_confirm">Sim, sair</button>
        </div>
      </div>
    </div>`);
    root.replaceChildren(box);
    if(typeof attachModalGuard==='function') attachModalGuard(box);
    box.addEventListener('borion:modal-closing',()=>{ this.exitPromptOpen=false; },{once:true});

    const stay=document.getElementById('smart_exit_stay');
    const leave=document.getElementById('smart_exit_confirm');
    if(stay) stay.onclick=()=>{
      this.exitPromptOpen=false;
      closeModal();
      this.ensureStack();
    };
    if(leave) leave.onclick=()=>this.confirmExit();
  },

  confirmExit(){
    this.exitPromptOpen=false;
    const root=document.getElementById('modal-root');
    closeModal();
    window.__borionConfirmedExit=true;
    try{
      if(window.ExitSaveGuard) ExitSaveGuard.finalSaveSilently('confirmed_mobile_exit');
      if(window.CloudStorage && CloudStorage.user && CloudStorage.hasPendingSync && CloudStorage.hasPendingSync()) CloudStorage.syncNow();
    }catch(e){ console.warn('[BORION_SMART_HISTORY][EXIT_SAVE_WARN]',e); }

    /* Topo = depth 8; base = depth 0; a página anterior fica uma posição além da base. */
    setTimeout(()=>history.go(-(this.GUARD_DEPTH+1)),60);
    /* Se uma janela standalone não tiver página anterior e o navegador decidir não
       fechar, rearma a proteção em vez de deixar o app desprotegido. */
    setTimeout(()=>{
      if(document.visibilityState==='visible'){
        window.__borionConfirmedExit=false;
        this.ensureStack();
      }
    },1400);
  },

  onBeforeUnload(event){
    if(!this.active || !isSmartphoneMode()) return;
    if(window.__borionConfirmedExit || window.__borionInternalReload) return;
    /* Última barreira. O texto é definido pelo navegador, mas impede que um gesto
       muito agressivo pule diretamente para o Google sem nenhuma confirmação. */
    event.preventDefault();
    event.returnValue='';
    return '';
  },

  onPopState(){
    if(window.__borionConfirmedExit || window.__borionInternalReload || !isSmartphoneMode()) return;

    /* Rearma imediatamente a reserva. Vários popstates muito próximos ainda ficam
       dentro do Borion e são tratados como um único “Voltar” lógico. */
    this.ensureStack();
    const now=Date.now();
    if(now-this.lastLogicalBackAt<this.BACK_BURST_MS) return;
    this.lastLogicalBackAt=now;

    if(this.exitPromptOpen) return;
    if(this.closeTopLayer()) return;
    if(this.goHome()) return;
    this.showExitPrompt();
  }
};
window.SmartphoneHistory=SmartphoneHistory;
