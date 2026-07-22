/* Borion Finance — Sistema de modais, formulário genérico e criação rápida de categorias. */

/* ---------------- Modal system (generic CRUD forms) ---------------- */
/* V6.35.0 — controle central e defensivo da rolagem global preservado.
   As classes de bloqueio passam a refletir o DOM real: modal visível e menu lateral
   realmente aberto. Fechamentos legados, re-renderizações e retorno do BFCache não
   conseguem mais deixar html/body travados sem uma camada visual correspondente. */
function borionPrimaryScrollElement(){
  const html=document.documentElement;
  const smartphone=!!(html && html.getAttribute('data-interface-mode')==='smartphone');
  const main=smartphone ? document.getElementById('view-root') : null;
  return (main && main.isConnected) ? main : document.scrollingElement;
}

function borionDocumentScrollTop(){
  const scrolling=borionPrimaryScrollElement();
  return Math.max(0,Number(scrolling&&scrolling.scrollTop)||Number(window.scrollY)||0);
}

function borionHasVisibleModal(){
  const root=document.getElementById('modal-root');
  return !!(root && root.querySelector('.modal-overlay'));
}

function borionMobileMenuIsActuallyOpen(){
  const sidebar=document.querySelector('.sidebar.open');
  const backdrop=document.querySelector('.mobile-menu-backdrop.show');
  return !!(sidebar && backdrop && sidebar.isConnected && backdrop.isConnected);
}

function releaseModalBodyLock({restoreScroll=true}={}){
  const html=document.documentElement;
  const body=document.body;
  if(!html || !body) return;
  const wasLocked=body.classList.contains('modal-scroll-locked');
  const savedY=Math.max(0,Number(html.dataset.modalScrollY)||0);
  body.classList.remove('modal-scroll-locked');
  body.style.removeProperty('--modal-lock-top');
  delete html.dataset.modalScrollY;
  if(wasLocked && restoreScroll){
    requestAnimationFrame(()=>{
      const scrolling=borionPrimaryScrollElement();
      if(scrolling) scrolling.scrollTop=savedY;
      else window.scrollTo(0,savedY);
    });
  }
}

function setModalDocumentState(open,{restoreScroll=true}={}){
  const html=document.documentElement;
  const body=document.body;
  if(!html || !body) return;
  const smartphone=html.getAttribute('data-interface-mode')==='smartphone';
  html.classList.toggle('modal-open',!!open);

  if(open && smartphone){
    if(body.classList.contains('modal-scroll-locked')) return;
    const y=borionDocumentScrollTop();
    html.dataset.modalScrollY=String(y);
    /* No Smartphone Mode o scroll pertence a #view-root. Não fixar o body: isso cria
       um segundo proprietário de rolagem e trava wheel/touch em WebViews Android. */
    body.classList.add('modal-scroll-locked');
    return;
  }

  /* Ao trocar Smartphone -> Pro com modal aberto, o html continua modal-open,
     porém o body não pode permanecer fixed. */
  releaseModalBodyLock({restoreScroll});
}

function syncGlobalScrollLockState({restoreScroll=true,source='sync'}={}){
  const html=document.documentElement;
  const body=document.body;
  if(!html || !body) return {modalOpen:false,mobileMenuOpen:false};
  const modalOpen=borionHasVisibleModal();
  const sidebar=document.querySelector('.sidebar');
  const backdrop=document.querySelector('.mobile-menu-backdrop');
  const mobileMenuOpen=borionMobileMenuIsActuallyOpen();
  const notifPanel=document.getElementById('notif-panel');
  const notificationPanelOpen=!!(notifPanel && notifPanel.isConnected);

  /* Se apenas uma metade do menu sobreviveu a um render/erro, remova também a classe
     visual órfã. Um backdrop .show sem sidebar continuaria interceptando wheel/touch. */
  if(!mobileMenuOpen){
    if(sidebar) sidebar.classList.remove('open');
    if(backdrop) backdrop.classList.remove('show');
  }

  setModalDocumentState(modalOpen,{restoreScroll});
  body.classList.toggle('mobile-menu-open',mobileMenuOpen);
  /* A classe de notificações também precisa refletir o DOM real. */
  body.classList.toggle('notif-panel-open',notificationPanelOpen);

  if(window.BORION_SCROLL_DEBUG===true){
    const scrolling=borionPrimaryScrollElement();
    console.debug('[SCROLL_LOCK]',{
      source,modalOpen,mobileMenuOpen,notificationPanelOpen,
      htmlOverflow:getComputedStyle(html).overflowY,
      bodyOverflow:getComputedStyle(body).overflowY,
      bodyTouchAction:getComputedStyle(body).touchAction,
      modalCount:document.querySelectorAll('#modal-root .modal-overlay').length,
      sidebarOpen:!!document.querySelector('.sidebar.open'),
      scrollHeight:scrolling&&scrolling.scrollHeight,
      clientHeight:scrolling&&scrolling.clientHeight,
      scrollTop:scrolling&&scrolling.scrollTop
    });
  }
  return {modalOpen,mobileMenuOpen,notificationPanelOpen};
}
window.syncGlobalScrollLockState=syncGlobalScrollLockState;

function closeModal(){
  const root=document.getElementById('modal-root');
  try{
    if(root){
      const current=root.querySelector('.modal-overlay');
      if(current) current.dispatchEvent(new CustomEvent('borion:modal-closing'));
      root.replaceChildren();
    }
  }finally{
    syncGlobalScrollLockState({source:'closeModal'});
  }
}

function attachModalGuard(overlay){
  if(!overlay) return;
  if(overlay.dataset.modalGuardAttached!=='1'){
    overlay.dataset.modalGuardAttached='1';
    overlay.addEventListener('click', e=>{
      if(e.target===overlay){
        e.preventDefault();
        e.stopPropagation();
        const modal=overlay.querySelector('.modal-box');
        if(modal){
          modal.classList.remove('modal-nudge');
          void modal.offsetWidth;
          modal.classList.add('modal-nudge');
        }
      }
    });
  }
  syncGlobalScrollLockState({source:'attachModalGuard'});
}

(function wireModalEscClose(){
  if(window.__borionModalEscCloseWired) return;
  window.__borionModalEscCloseWired=true;
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      /* V6.35.3 — o aviso (window.alert) agora vive fora de #modal-root, empilhado
         por cima. Esc precisa fechar só o aviso, e não o formulário por trás dele. */
      const alertBox=document.querySelector('.borion-alert-overlay');
      if(alertBox){ e.preventDefault(); alertBox.remove(); return; }
      const root=document.getElementById('modal-root');
      if(root && root.querySelector('.modal-overlay')){
        e.preventDefault();
        closeModal();
      }
    }
  });
})();

/* MutationObserver é a rede de segurança para trechos legados que ainda substituem
   #modal-root diretamente. Ele sincroniza tanto abertura quanto fechamento. */
(function installGlobalScrollLockReconciliation(){
  if(window.__borionGlobalScrollReconciliationWired) return;
  window.__borionGlobalScrollReconciliationWired=true;

  const install=()=>{
    const html=document.documentElement;
    const body=document.body;
    const root=document.getElementById('modal-root');
    if(!html || !body) return;

    /* Limpeza de classes órfãs vindas de restauração de página/cache. O estado real é
       recalculado logo em seguida, portanto bloqueios legítimos são reaplicados. */
    html.classList.remove('modal-open');
    body.classList.remove('mobile-menu-open');
    body.classList.remove('notif-panel-open');
    releaseModalBodyLock({restoreScroll:false});

    if(root && root.dataset.scrollStateObserver!=='1' && typeof MutationObserver!=='undefined'){
      root.dataset.scrollStateObserver='1';
      const observer=new MutationObserver(()=>syncGlobalScrollLockState({source:'modalMutation'}));
      observer.observe(root,{childList:true,subtree:false});
      window.__borionModalRootScrollObserver=observer;
    }
    syncGlobalScrollLockState({restoreScroll:false,source:'initialization'});
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',install,{once:true});
  else install();

  window.addEventListener('pageshow',()=>syncGlobalScrollLockState({source:'pageshow'}));
  window.addEventListener('orientationchange',()=>setTimeout(()=>syncGlobalScrollLockState({source:'orientationchange'}),80),{passive:true});
  window.addEventListener('blur',()=>syncGlobalScrollLockState({source:'windowBlur'}),{passive:true});
  document.addEventListener('visibilitychange',()=>{
    if(document.visibilityState==='visible') syncGlobalScrollLockState({source:'visibilitychange'});
  });
})();

function modalFieldInitialValue(field, values={}){
  const f=field||{};
  const hasSavedValue=Object.prototype.hasOwnProperty.call(values||{},f.key);
  if(hasSavedValue) return values[f.key]==null?'':values[f.key];
  const hasExplicitDefault=Object.prototype.hasOwnProperty.call(f,'default');
  if(hasExplicitDefault) return f.default==null?'':f.default;
  /* V6.33.4 — todo campo de data/mês de um cadastro novo nasce com a data local do
     dispositivo. Edições continuam usando o valor salvo, inclusive quando ele está vazio. */
  if(f.type==='date') return todayISO();
  if(f.type==='month'){ const now=todayYM(); return monthKey(now.y,now.m); }
  return '';
}
function openModal({title, sub, fields, values={}, saveLabel, onSave, onDelete, deleteLabel, extraHTML}){
  const moneyFields=[];
  const fieldInitialVal=f=>modalFieldInitialValue(f,values);
  const body = fields.map(f=>{
    const val = fieldInitialVal(f);
    let fieldHtml;
    if(f.type==='select'){
      const opts = (f.options||[]).map(o=>{ const value=(o&&typeof o==='object')?o.value:o; const label=(o&&typeof o==='object')?o.label:o; return `<option value="${esc(value)}" ${String(value)===String(val)?'selected':''}>${esc(label)}</option>`; }).join('');
      fieldHtml = `<div class="field"><label>${esc(f.label)}</label><select id="mf_${f.key}">${opts}</select></div>`;
    } else if(f.type==='checkbox'){
      fieldHtml = `<div class="field-check"><input type="checkbox" id="mf_${f.key}" ${val?'checked':''}/> <label style="margin:0;" for="mf_${f.key}">${esc(f.label)}</label></div>`;
    } else if(f.type==='money'){
      moneyFields.push({key:f.key, initial: val===''?0:val});
      fieldHtml = `<div class="field"><label>${esc(f.label)}</label><input type="text" inputmode="numeric" class="money-input" id="mf_${f.key}" placeholder="0,00"/></div>`;
    } else if(f.type==='color'){
      fieldHtml = `<div class="field"><label>${esc(f.label)}</label><input type="color" id="mf_${f.key}" value="${val?esc(val):'#3b6bf0'}"/></div>`;
    } else if(f.type==='password'){
      fieldHtml = passwordInputWrapHTML({id:'mf_'+f.key,label:f.label,value:val||'',autocomplete:f.autocomplete||'',placeholder:f.placeholder||''});
    } else if(f.type==='segmented'){
      /* V5.39.0 — alternador estilo "on/off" com 2+ opções nomeadas (ex: Despesa fixa
         vs Despesa variável), em vez de um <select> tradicional. */
      const opts = f.options.map(o=>`<button type="button" class="seg-btn ${String(val)===String(o.value)?'active':''}" data-value="${esc(o.value)}">${esc(o.label)}</button>`).join('');
      fieldHtml = `<div class="field"><label>${esc(f.label)}</label><div class="segmented-toggle" id="mf_${f.key}_group">${opts}</div><input type="hidden" id="mf_${f.key}" value="${esc(val)}"/></div>`;
    } else {
      fieldHtml = `<div class="field"><label>${esc(f.label)}</label><input type="${f.type||'text'}" id="mf_${f.key}" value="${val!=null?esc(val):''}" ${f.step?`step="${f.step}"`:''} placeholder="${esc(f.placeholder||'')}"/></div>`;
    }
    if(f.visibleWhen){
      const depField = fields.find(ff=>ff.key===f.visibleWhen.key);
      const depVal = depField ? fieldInitialVal(depField) : undefined;
      const matches = String(depVal)===String(f.visibleWhen.value);
      return `<div class="mf-conditional ${matches?'':'hidden'}" data-mf-cond-key="${esc(f.visibleWhen.key)}" data-mf-cond-value="${esc(String(f.visibleWhen.value))}">${fieldHtml}</div>`;
    }
    return fieldHtml;
  }).join('');

  const box = el(`
  <div class="modal-overlay">
    <div class="modal-box">
      <div class="modal-head"><h2>${esc(title)}</h2><button id="mf_close">&times;</button></div>
      ${sub?`<p class="modal-sub">${esc(sub)}</p>`:''}
      <div id="mf_body">${body}</div>
      ${extraHTML||''}
      <div class="row-btns" style="margin-top:10px;">
        <button class="btn btn-primary btn-block" id="mf_save">${esc(saveLabel||'Salvar')}</button>
      </div>
      ${onDelete?`<div class="row-btns" style="margin-top:8px;"><button class="btn btn-danger btn-block" id="mf_delete">${esc(deleteLabel||'Excluir')}</button></div>`:''}
    </div>
  </div>`);
  $('#modal-root').innerHTML='';
  $('#modal-root').appendChild(box);
  attachModalGuard(box);
  $('#mf_close').onclick = closeModal;
  moneyFields.forEach(mf=> attachMoneyMask(document.getElementById('mf_'+mf.key), mf.initial));

  /* Segmented toggle: clique num botão troca o valor do input escondido e a classe ativa. */
  fields.filter(f=>f.type==='segmented').forEach(f=>{
    const group = document.getElementById('mf_'+f.key+'_group');
    const hidden = document.getElementById('mf_'+f.key);
    if(!group || !hidden) return;
    group.querySelectorAll('.seg-btn').forEach(btn=>{
      btn.onclick = ()=>{
        group.querySelectorAll('.seg-btn').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        hidden.value = btn.dataset.value;
        hidden.dispatchEvent(new Event('change', {bubbles:true}));
      };
    });
  });

  /* Campos condicionais: qualquer campo com visibleWhen aparece/some conforme o valor
     atual do campo do qual ele depende (checkbox, select ou segmented). */
  fields.forEach(f=>{
    const node = document.getElementById('mf_'+f.key);
    if(!node) return;
    const evtName = (f.type==='checkbox' || f.type==='select') ? 'change' : (f.type==='segmented' ? 'change' : 'input');
    node.addEventListener(evtName, ()=>{
      const curVal = f.type==='checkbox' ? node.checked : node.value;
      document.querySelectorAll(`[data-mf-cond-key="${f.key}"]`).forEach(wrap=>{
        const want = wrap.getAttribute('data-mf-cond-value');
        const matches = String(curVal)===want;
        wrap.classList.toggle('hidden', !matches);
      });
    });
  });

  $('#mf_save').onclick = ()=>{
    const out = {};
    fields.forEach(f=>{
      const node = document.getElementById('mf_'+f.key);
      if(!node) return;
      if(f.type==='checkbox') out[f.key]=node.checked;
      else if(f.type==='money') out[f.key]=parseInt(node.dataset.cents||'0',10)/100;
      else if(f.type==='number') out[f.key]=parseFloat((node.value||'0').replace(',','.'))||0;
      else out[f.key]=node.value;
    });
    onSave(out);
  };
  if(onDelete){
    $('#mf_delete').onclick = ()=>{
      const snapshot = JSON.parse(JSON.stringify(S.data));
      const result=onDelete();
      if(result===false) return;
      showUndoToast('Item excluído.', ()=>{ S.data = snapshot; saveCurrentData(); renderView(); });
    };
  }
}

/* ------- shared: confirmation modal (substitui window.confirm() nativo) -------
   Uso:
   openConfirmModal({
     title: 'Excluir item',
     text: 'Tem certeza que deseja excluir isso?',
     confirmLabel: 'Excluir',      // opcional, padrão 'Confirmar'
     cancelLabel: 'Cancelar',      // opcional
     variant: 'danger' | 'gold',   // opcional, padrão 'danger'
     onConfirm(){ ... }            // executado só se o usuário confirmar
   });
   Cancelar, X, ESC e clique fora nunca chamam onConfirm. */
function openConfirmModal({title, text, confirmLabel, cancelLabel, variant='danger', onConfirm}){
  const isDanger = variant!=='gold';
  const box = el(`
  <div class="modal-overlay">
    <div class="modal-box confirm-box ${isDanger?'confirm-danger':'confirm-gold'}">
      <div class="modal-head"><h2>${esc(title||'Confirmar ação')}</h2><button id="cf_close">&times;</button></div>
      <p class="confirm-text">${esc(text||'Tem certeza que deseja continuar?')}</p>
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-block" id="cf_cancel">${esc(cancelLabel||'Cancelar')}</button>
        <button class="btn ${isDanger?'btn-danger-solid':'btn-primary'} btn-block" id="cf_confirm">${esc(confirmLabel||'Confirmar')}</button>
      </div>
    </div>
  </div>`);
  $('#modal-root').innerHTML='';
  $('#modal-root').appendChild(box);
  attachModalGuard(box);
  $('#cf_close').onclick = closeModal;
  $('#cf_cancel').onclick = closeModal;
  $('#cf_confirm').onclick = ()=>{ closeModal(); if(onConfirm) onConfirm(); };
}

/* ------- V6.33.3 — substitui o alert() nativo do navegador (caixa cinza do sistema
   operacional) por um modal com a identidade visual do Borion, evitando que qualquer
   mensagem de validação ou erro quebre a estética dourada/dark do app. Mantém a mesma
   assinatura alert(msg), então nenhum dos pontos onde alert() já é chamado no app
   precisa ser reescrito — todos passam a usar o modal automaticamente. Se o modal-root
   ainda não existir (ex: erro muito cedo no boot), cai de volta no alert nativo. ------- */
(function(){
  if(window.__borionAlertPatched) return;
  window.__borionAlertPatched = true;
  const nativeAlert = window.alert ? window.alert.bind(window) : function(msg){ console.warn(msg); };
  window.alert = function(message){
    const text = message==null ? '' : String(message);
    if(!document.getElementById('modal-root') || typeof el!=='function'){ nativeAlert(text); return; }
    /* V6.35.3 — antes, este aviso substituía TODO o conteúdo de #modal-root
       (innerHTML='') para se exibir. Se o alert() era disparado com uma janela
       de lançamento (receita/despesa fixa/variável) já aberta atrás — ex.: "Digite
       um valor maior que zero" — isso destruía o formulário inteiro por baixo do
       aviso. Ao clicar em "Entendi", closeModal() limpava #modal-root de vez, e
       tudo que o usuário tinha digitado (nome, categoria, data, etc.) já tinha
       sumido. Agora o aviso é anexado direto no <body>, empilhado por cima do
       modal-root com z-index maior, e fechá-lo remove só o próprio aviso — o
       formulário de baixo continua intacto com os dados preenchidos. */
    const box = el(`
      <div class="modal-overlay borion-alert-overlay" style="z-index:1000;">
        <div class="modal-box confirm-box confirm-gold">
          <div class="modal-head"><h2>Aviso</h2><button id="al_close">&times;</button></div>
          <p class="confirm-text">${esc(text)}</p>
          <div class="row-btns"><button class="btn btn-primary btn-block" id="al_ok">Entendi</button></div>
        </div>
      </div>`);
    document.body.appendChild(box);
    const closeAlert=()=>{ box.remove(); };
    box.querySelector('#al_close').onclick = closeAlert;
    box.querySelector('#al_ok').onclick = closeAlert;
    box.addEventListener('click', e=>{ if(e.target===box) closeAlert(); });
  };
})();

/* ------- shared: choice modal (e.g. substituir vs mesclar ao importar) ------- */
function openChoiceModal({title, sub, choices}){
  const btns = choices.map((c,i)=>`<button class="choice-btn ${c.variant==='danger'?'danger':''}" data-i="${i}">${esc(c.label)}${c.desc?`<span class="cb-desc">${esc(c.desc)}</span>`:''}</button>`).join('');
  const box = el(`
    <div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h2>${esc(title)}</h2><button id="cm_close">&times;</button></div>
        ${sub?`<p class="modal-sub">${esc(sub)}</p>`:''}
        <div>${btns}</div>
      </div>
    </div>`);
  $('#modal-root').innerHTML='';
  $('#modal-root').appendChild(box);
  attachModalGuard(box);
  $('#cm_close').onclick = closeModal;
  box.querySelectorAll('.choice-btn').forEach((btn,i)=>{
    btn.onclick = ()=> choices[i].onClick();
  });
}

/* ------- shared: inline "quick create category" wiring for select elements ------- */
function orderedCategories(typeKey){
  const raw=((S.data.categorias&&S.data.categorias[typeKey])||[]).slice();
  if(!(window.OrderPreferences&&OrderPreferences.applyOrder))return raw;
  return OrderPreferences.applyOrder('cat_'+typeKey,raw.map(nome=>({id:nome,nome}))).map(x=>x.nome);
}
function wireQuickCategory(selectEl, boxEl, inputEl, addBtnEl, typeKey){
  selectEl.onchange = ()=>{
    if(selectEl.value==='__new__'){ boxEl.classList.remove('hidden'); inputEl.focus(); }
    else boxEl.classList.add('hidden');
  };
  addBtnEl.onclick = ()=>{
    const name = inputEl.value.trim();
    if(!name) return;
    if(!S.data.categorias[typeKey].includes(name)){
      S.data.categorias[typeKey].push(name);
      setCategoryColor(typeKey, name, baseCatColor(name));
      saveCurrentData();
    }
    selectEl.innerHTML = orderedCategories(typeKey).map(c=>`<option value="${esc(c)}">${esc(c)}</option>`).join('') + `<option value="__new__">➕ Criar nova categoria...</option>`;
    selectEl.value = name;
    boxEl.classList.add('hidden');
    inputEl.value='';
    toast('Categoria criada.');
  };
}
function categorySelectHTML(idPrefix, typeKey, selected){
  const cats = orderedCategories(typeKey);
  const opts = cats.map(c=>`<option value="${esc(c)}" ${selected===c?'selected':''}>${esc(c)}</option>`).join('');
  return `
    <div class="field">
      <label>Categoria</label>
      <select id="${idPrefix}_categoria">${opts}<option value="__new__">➕ Criar nova categoria...</option></select>
      <div id="${idPrefix}_newcat_box" class="quickcat-box hidden">
        <input type="text" id="${idPrefix}_newcat_input" placeholder="Nome da nova categoria">
        <button class="btn btn-primary btn-sm" id="${idPrefix}_newcat_add" type="button">Adicionar</button>
      </div>
    </div>`;
}
