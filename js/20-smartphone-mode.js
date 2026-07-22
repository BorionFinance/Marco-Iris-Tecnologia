/* Borion Finance V6.24.6 — Smartphone Mode
   Interface compacta para o uso diário. Reaproveita exatamente os mesmos dados,
   formulários e cálculos do Modo Pro; muda apenas a navegação e a apresentação. */

function smartphoneQuickActionHTML(action, icon, label, sub){
  return `<button type="button" class="smart-quick-action" onclick="SmartphoneMode.launch('${action}')">
    <span class="smart-quick-icon" aria-hidden="true">${icon}</span>
    <span><strong>${esc(label)}</strong><small>${esc(sub||'')}</small></span>
  </button>`;
}

function smartNavIconHTML(kind){
  if(kind==='launch'){
    return `<span class="smart-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14"/><path d="M5 12h14"/></svg></span>`;
  }
  if(kind==='more'){
    return `<span class="smart-nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/></svg></span>`;
  }
  const fallback={
    overview:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="5" height="14" rx="1.15"/><rect x="14" y="5" width="5" height="14" rx="1.15"/></svg>',
    budget:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7H6"/><path d="M10 3 6 7l4 4"/><path d="M5 17h13"/><path d="M14 13l4 4-4 4"/></svg>',
    reservas:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5 20.5 12 12 20.5 3.5 12 12 3.5Z"/><path d="M12 8 16 12 12 16 8 12 12 8Z"/></svg>',
    patrimony:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5V12h8.5"/></svg>'
  };
  const svg=(typeof navIconSVG==='function') ? navIconSVG(kind) : (fallback[kind]||fallback.overview);
  return `<span class="smart-nav-icon" aria-hidden="true">${svg}</span>`;
}


function smartSaveReloadIconHTML(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 7v4h-4"/><path d="M5 17v-4h4"/><path d="M7.3 8.1A7 7 0 0 1 18.4 9"/><path d="M16.7 15.9A7 7 0 0 1 5.6 15"/><path d="M12 8.5v7"/><path d="m9.5 13 2.5 2.5 2.5-2.5"/></svg>`;
}

function smartQuickSaveIconHTML(){
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4.5h9l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 19Z"/><path d="M9 4.5V9h6V7.5"/><path d="M9 20.5v-6h6v6"/></svg>`;
}

function smartSaveReloadModalHTML(){
  return `<div class="modal-overlay smart-save-reload-overlay">
    <div class="modal-box smart-save-reload-modal" role="dialog" aria-modal="true" aria-labelledby="smart_save_reload_title">
      <div class="smart-save-reload-icon">${smartSaveReloadIconHTML()}</div>
      <h2 id="smart_save_reload_title">Salvando e atualizando...</h2>
      <p class="modal-sub" id="smart_save_reload_status">Guardando seus dados neste dispositivo.</p>
      <div class="smart-save-reload-progress"><span></span></div>
      <button type="button" class="btn btn-secondary hidden" id="smart_save_reload_close">Voltar ao Borion</button>
    </div>
  </div>`;
}

function renderSmartphoneOverview(){
  const receitas=receitaMes();
  const despesas=despesasMes();
  const saldo=saldoMes();
  const contas=saldoEmContasTotal();
  const reservas=reservasTotal();
  const monthPrefix=monthKey(S.month.y,S.month.m);
  const recent=(S.data.transacoes||[])
    .filter(t=>String(t.data||'').startsWith(monthPrefix) && bankMatches(t.banco,t.accountId))
    .slice()
    .sort((a,b)=>String(b.data||'').localeCompare(String(a.data||'')) || Number(b.createdAt||0)-Number(a.createdAt||0))
    .slice(0,6);
  const recentRows=recent.map(t=>{
    const isIncome=t.tipo==='receita';
    const date=String(t.data||'').slice(8,10)+'/'+String(t.data||'').slice(5,7);
    return `<button type="button" class="smart-recent-row" onclick="SmartphoneMode.editTransaction('${esc(t.id)}','${esc(t.tipo)}')">
      <span class="smart-recent-type ${isIncome?'income':'expense'}">${isIncome?'↑':'↓'}</span>
      <span class="smart-recent-info"><strong>${esc(t.nome||'Lançamento')}</strong><small>${esc(date)} · ${esc(t.categoria||'Sem categoria')}</small></span>
      <span class="smart-recent-value ${isIncome?'val-pos':'val-neg'}">${isIncome?'+ ':'- '}${brl(Number(t.valor)||0)}</span>
    </button>`;
  }).join('');
  const reserveAction=reservasEnabled()
    ? smartphoneQuickActionHTML('reserva','◇','Reserva','Movimentar cofrinho')
    : smartphoneQuickActionHTML('meta','◇','Meta','Criar objetivo');
  return `<div class="smartphone-home">
    <section class="smart-balance-hero">
      <div><small>Saldo em contas</small><strong>${brl(contas)}</strong></div>
      <span class="smart-mode-pill">SMARTPHONE</span>
      <div class="smart-month-balance ${saldo>=0?'positive':'negative'}"><small>Saldo de ${esc(monthLabel(S.month.y,S.month.m))}</small><b>${brl(saldo)}</b></div>
    </section>

    <section class="smart-quick-grid" aria-label="Ações rápidas">
      ${smartphoneQuickActionHTML('receita','＋','Receita','Entrada rápida')}
      ${smartphoneQuickActionHTML('despesa','−','Despesa','Saída rápida')}
      ${reserveAction}
      ${smartphoneQuickActionHTML('transferencia','⇄','Transferir','Entre contas')}
    </section>

    <section class="smart-summary-strip">
      <button onclick="SmartphoneMode.goBudget('receita')"><small>Receitas</small><strong class="val-pos">${brl(receitas)}</strong></button>
      <button onclick="SmartphoneMode.goBudget('variavel')"><small>Despesas</small><strong class="val-neg">${brl(despesas)}</strong></button>
      <button onclick="${reservasEnabled()?"Nav.go('reservas')":"Nav.go('patrimony')"}"><small>Reservado</small><strong>${brl(reservas)}</strong></button>
    </section>

    <section class="panel-box smart-recent-panel">
      <div class="toolbar"><div class="toolbar-left">Últimos lançamentos</div><button class="link-btn" onclick="SmartphoneMode.goBudget('central')">Ver todos</button></div>
      <div class="smart-recent-list">${recentRows||'<div class="empty-note">Nenhum lançamento neste mês.</div>'}</div>
    </section>

    <button type="button" class="smart-open-pro" onclick="SmartphoneMode.useProMode()">Abrir Modo Pro neste dispositivo</button>
  </div>`;
}

const SmartphoneMode={
  savingAndReloading:false,
  quickSaving:false,
  renderSidebarActions(){
    if(isSmartphoneMode()){
      return `<div class="smart-sidebar-actions">
        <button type="button" class="smart-sidebar-save-reload" onclick="SmartphoneMode.saveAndReload()">
          <span class="smart-sidebar-save-icon">${smartSaveReloadIconHTML()}</span>
          <span><strong>Salvar e atualizar</strong><small>Force save + recarregar</small></span>
        </button>
      </div>`;
    }
    return `<div class="pro-sidebar-actions">
      <button type="button" class="pro-sidebar-save-drive-local" id="pro_sidebar_quick_save" onclick="SmartphoneMode.quickSaveBoth()">
        <span class="pro-sidebar-save-icon">${smartQuickSaveIconHTML()}</span>
        <span><strong>FORCE SAVE</strong><small>Mesmo salvamento do Ctrl+S</small></span>
      </button>
    </div>`;
  },
  async quickSaveBoth(){
    if(this.quickSaving) return;
    this.quickSaving=true;
    const btn=document.getElementById('pro_sidebar_quick_save');
    const strong=btn?btn.querySelector('strong'):null;
    const small=btn?btn.querySelector('small'):null;
    const prevStrong=strong?strong.textContent:'';
    const prevSmall=small?small.textContent:'';
    try{
      if(btn){ btn.disabled=true; btn.classList.add('is-saving'); }
      if(strong) strong.textContent='Salvando...';
      if(small) small.textContent='Drive + dispositivo';
      if(typeof forceManualSave!=='function'){
        throw new Error('A rotina de force save não foi carregada.');
      }
      /* O botão fixo é literalmente o mesmo comando do Ctrl+S. Não existe uma segunda
         implementação nem uma lógica de backup paralela. */
      const result=await forceManualSave();
      if(!result || (!result.driveOk && !result.localOk)){
        throw new Error('Não foi possível confirmar o force save.');
      }
      if(result.driveOk && result.localOk){
        if(strong) strong.textContent='Force save concluído';
        if(small) small.textContent='Drive + local atualizados';
      }else{
        if(strong) strong.textContent='Salvo parcialmente';
        if(small) small.textContent=result.driveOk?'Drive salvo · local falhou':'Local salvo · Drive falhou';
      }
      setTimeout(()=>{
        const b=document.getElementById('pro_sidebar_quick_save');
        if(!b) return;
        const s1=b.querySelector('strong'); const s2=b.querySelector('small');
        if(s1) s1.textContent='FORCE SAVE';
        if(s2) s2.textContent='Mesmo salvamento do Ctrl+S';
      },1800);
    }catch(e){
      if(strong) strong.textContent='Falha ao salvar';
      if(small) small.textContent=(e&&e.message)?e.message:String(e);
    }finally{
      setTimeout(()=>{
        const b=document.getElementById('pro_sidebar_quick_save');
        if(b){ b.disabled=false; b.classList.remove('is-saving'); }
        const s1=b?b.querySelector('strong'):null; const s2=b?b.querySelector('small'):null;
        if(s1 && s1.textContent!=='Falha ao salvar') s1.textContent='FORCE SAVE';
        if(s2 && s2.textContent!=='Mesmo salvamento do Ctrl+S' && s1 && s1.textContent==='FORCE SAVE') s2.textContent='Mesmo salvamento do Ctrl+S';
        this.quickSaving=false;
      }, 1900);
      if(btn && !btn.isConnected) this.quickSaving=false;
    }
  },
  async saveAndReload(){
    if(this.savingAndReloading) return;
    this.savingAndReloading=true;
    if(window.MobileMenu) MobileMenu.close();

    const root=document.getElementById('modal-root');
    if(root){
      const overlay=el(smartSaveReloadModalHTML());
      root.replaceChildren(overlay);
      if(typeof attachModalGuard==='function') attachModalGuard(overlay);
    }
    const status=()=>document.getElementById('smart_save_reload_status');
    const title=()=>document.getElementById('smart_save_reload_title');
    const closeBtn=()=>document.getElementById('smart_save_reload_close');
    const setStatus=(value)=>{ const node=status(); if(node) node.textContent=value; };

    try{
      if(!(S && S.currentProfile && S.data)) throw new Error('Nenhum perfil financeiro está aberto.');

      saveCurrentData({finalConfirmation:true});
      clearExitSavePending(S.currentProfile.id);
      setStatus('Criando uma cópia protegida neste dispositivo...');
      if(window.storageProvider && storageProvider.createBackup){
        await storageProvider.createBackup('manual_quick');
      }

      if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected()){
        setStatus('Criando o force save no Google Drive...');
        const ok=await GoogleDriveProvider.forceSyncNow();
        if(!ok) throw new Error('O Google Drive não confirmou o force save. A página não foi atualizada.');
      } else if(window.CloudStorage && CloudStorage.user){
        if(!navigator.onLine) throw new Error('Sem internet para confirmar o salvamento na nuvem. A página não foi atualizada.');
        setStatus('Confirmando o salvamento na nuvem...');
        const ok=await CloudStorage.syncNow();
        if(ok===false) throw new Error('A nuvem não confirmou o salvamento. A página não foi atualizada.');
      } else {
        setStatus('Dados protegidos neste dispositivo. Preparando a atualização...');
      }

      if('serviceWorker' in navigator){
        setStatus('Procurando uma versão mais recente do Borion...');
        try{
          const registration=await navigator.serviceWorker.getRegistration();
          if(registration) await registration.update();
        }catch(e){ console.warn('[BORION_SMART_SAVE_RELOAD][SW_UPDATE_WARN]',e); }
      }

      setStatus('Tudo salvo. Atualizando o Borion...');
      if(title()) title().textContent='Salvo com sucesso';
      if(window.SmartphoneHistory && SmartphoneHistory.prepareInternalReload) SmartphoneHistory.prepareInternalReload();
      window.__borionInternalReload=true;
      setTimeout(()=>location.reload(),420);
    }catch(e){
      this.savingAndReloading=false;
      if(title()) title().textContent='Não atualizei a página';
      setStatus((e&&e.message)||String(e));
      const btn=closeBtn();
      if(btn){
        btn.classList.remove('hidden');
        btn.onclick=()=>closeModal();
      }
    }
  },
  renderBottomNav(){
    const reserves=reservasEnabled();
    const reserveKey=reserves?'reservas':'patrimony';
    return `<nav class="smart-bottom-nav" aria-label="Navegação do Smartphone Mode">
      <button class="${S.view==='overview'?'active':''}" onclick="Nav.go('overview')">${smartNavIconHTML('overview')}<small>Início</small></button>
      <button class="${S.view==='budget'?'active':''}" onclick="SmartphoneMode.goBudget('central')">${smartNavIconHTML('budget')}<small>Lançamentos</small></button>
      <button class="smart-bottom-launch" onclick="SmartphoneMode.openQuickLaunch()" aria-label="Novo lançamento">${smartNavIconHTML('launch')}<small>Lançar</small></button>
      <button class="${S.view===reserveKey?'active':''}" onclick="Nav.go('${reserveKey}')">${smartNavIconHTML(reserves?'reservas':'patrimony')}<small>${reserves?'Reservas':'Metas'}</small></button>
      <button onclick="MobileMenu.open()">${smartNavIconHTML('more')}<small>Mais</small></button>
    </nav>`;
  },
  openQuickLaunch(){
    const reserveButton=reservasEnabled()
      ? smartphoneQuickActionHTML('reserva','◇','Movimentar reserva','Reservar, resgatar ou ajustar')
      : smartphoneQuickActionHTML('meta','◇','Nova meta','Criar objetivo de patrimônio');
    const box=el(`<div class="modal-overlay smart-launch-overlay">
      <div class="modal-box smart-launch-modal">
        <div class="modal-head"><div><h2>Lançamento rápido</h2><p class="modal-sub">Escolha o que deseja registrar.</p></div><button id="smart_launch_close">&times;</button></div>
        <div class="smart-launch-grid">
          ${smartphoneQuickActionHTML('receita','＋','Receita','Dinheiro que entrou')}
          ${smartphoneQuickActionHTML('despesa','−','Despesa','Compra ou pagamento')}
          ${smartphoneQuickActionHTML('fixa','□','Despesa fixa','Compromisso mensal')}
          ${reserveButton}
          ${smartphoneQuickActionHTML('transferencia','⇄','Transferência','Entre contas e reservas')}
          ${smartphoneQuickActionHTML('contas','▦','Contas e cartões','Abrir gerenciamento')}
        </div>
      </div>
    </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#smart_launch_close').onclick=closeModal;
  },
  launch(action){
    closeModal();
    if(action==='receita' || action==='despesa'){
      S.view='budget'; S.budgetTab=action==='receita'?'receita':'variavel'; renderApp();
      setTimeout(()=>openTransactionModal({type:S.budgetTab}),60); return;
    }
    if(action==='fixa'){
      S.view='budget'; S.budgetTab='fixa'; renderApp(); setTimeout(()=>openFixaModal(null),60); return;
    }
    if(action==='reserva'){
      if(!reservasEnabled()){ this.launch('meta'); return; }
      S.view='reservas'; renderApp(); setTimeout(()=>Reservas.move(),60); return;
    }
    if(action==='meta'){
      S.view='patrimony'; renderApp(); setTimeout(()=>Metas.add(),60); return;
    }
    if(action==='transferencia'){
      S.view='cards'; renderApp(); setTimeout(()=>Cards.addTransferencia(),60); return;
    }
    if(action==='contas'){ Nav.go('cards'); }
  },
  goBudget(tab){ S.view='budget'; S.budgetTab=tab||'central'; renderApp(); },
  editTransaction(id,type){
    S.view='budget'; S.budgetTab=type==='receita'?'receita':'variavel'; renderApp();
    setTimeout(()=>Budget.edit(id),60);
  },
  useProMode(){
    S.config.uiMode='pro'; setConfig(S.config); applyInterfaceMode(); renderApp();
    toast('Modo Pro ativado neste dispositivo.');
  }
};
window.SmartphoneMode=SmartphoneMode;

/* Em modo automático, alterna entre Smartphone e Pro quando a largura cruza o limite.
   O debounce evita renderizações repetidas durante o redimensionamento. */
(function(){
  let timer=null,last=null;
  function check(){
    const current=resolvedInterfaceMode();
    if(last==null){ last=current; applyInterfaceMode(); return; }
    if(current===last){ applyInterfaceMode(); return; }
    last=current; applyInterfaceMode();
    if(S&&S.currentProfile&&S.data) renderApp();
  }
  if(window.addEventListener){
    window.addEventListener('resize',()=>{ clearTimeout(timer); timer=setTimeout(check,140); });
    window.addEventListener('orientationchange',()=>{ clearTimeout(timer); timer=setTimeout(check,160); });
  }
  check();
})();
