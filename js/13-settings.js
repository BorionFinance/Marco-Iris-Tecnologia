/* Borion Finance — Configurações reorganizadas: módulos, dashboard, perfis, categorias, personalização e backups. */

/* ---------------- VIEW: SETTINGS ---------------- */
function settingsTabButton(key,label){ return `<button class="settings-tab ${S.settingsTab===key?'active':''}" onclick="Settings.setTab('${key}')">${label}</button>`; }

/* V6.36.0 — a Central do Borion é carregada somente quando o usuário abre o botão ?.
   O manual completo não participa do caminho crítico de inicialização do app. */
const HelpCenterLoader = {
  promise:null,
  placeholder(){ return `<div class="help-loading-card"><span class="help-loading-spinner"></span><strong>Carregando a Central do Borion...</strong><span>Guias, checklist e história do sistema.</span></div>`; },
  ensure(){
    if(window.BorionHelp) return Promise.resolve(window.BorionHelp);
    if(this.promise) return this.promise;
    this.promise = new Promise((resolve,reject)=>{
      if(!document.querySelector('link[data-borion-help-css]')){
        const link=document.createElement('link');
        link.rel='stylesheet'; link.href='css/help-center.css?v=6.45.5'; link.dataset.borionHelpCss='1';
        document.head.appendChild(link);
      }
      const existing=document.querySelector('script[data-borion-help-script]');
      if(existing){
        existing.addEventListener('load',()=>resolve(window.BorionHelp),{once:true});
        existing.addEventListener('error',()=>reject(new Error('Falha ao carregar a Central do Borion.')),{once:true});
        return;
      }
      const script=document.createElement('script');
      script.src='js/26-help-center.js?v=6.45.5'; script.async=true; script.dataset.borionHelpScript='1';
      script.onload=()=>window.BorionHelp?resolve(window.BorionHelp):reject(new Error('A Central do Borion não iniciou.'));
      script.onerror=()=>{ script.remove(); reject(new Error('Falha ao carregar a Central do Borion.')); };
      document.head.appendChild(script);
    }).catch(err=>{ this.promise=null; throw err; });
    return this.promise;
  },
  open(){
    S.settingsTab='help';
    if(window.BorionHelp){ renderView(); return; }
    renderView();
    this.ensure().then(()=>{
      if(S.view==='settings' && S.settingsTab==='help') renderView();
    }).catch(err=>{
      console.error('[BORION_HELP][LOAD]',err);
      toast('Não foi possível abrir a Central do Borion. Recarregue o aplicativo.');
    });
  }
};
window.HelpCenterLoader=HelpCenterLoader;
function moduleToggleHTML({key,title,desc,enabled,onClick}){
  return `<div class="module-toggle-card ${enabled?'enabled':''}">
    <div class="module-toggle-head">
      <div><h3>${esc(title)}</h3><p class="desc">${esc(desc)}</p></div>
      <button class="toggle-switch ${enabled?'on':''}" onclick="${onClick}" aria-label="${enabled?'Desativar':'Ativar'} ${esc(title)}"><span></span></button>
    </div>
    <div class="module-toggle-status">${enabled?'Ativo':'Desativado'} — ${enabled?'aparece no app e mantém os dados disponíveis.':'fica oculto, mas os dados não são apagados.'}</div>
  </div>`;
}
function dashboardEnabled(key){ return !!(S.data.dashboard && Array.isArray(S.data.dashboard.widgets) && S.data.dashboard.widgets.includes(key)); }
function renderSettings(){
  if(!S.settingsTab) S.settingsTab='modules';
  if(S.settingsTab==='cloud') S.settingsTab='backup'; // V6.14.0 — aba "Nuvem" foi unificada em "Backups"
  const tabs = `
    <div class="settings-tabs">
      ${settingsTabButton('modules','Módulos')}
      ${settingsTabButton('dashboard','Dashboard')}
      ${settingsTabButton('profiles','Perfis')}
      ${settingsTabButton('categories','Categorias')}
      ${settingsTabButton('personalization','Personalização')}
      ${settingsTabButton('backup','Backups')}
      ${settingsTabButton('integrations','Integrações')}
      <button class="settings-tab settings-help-tab ${S.settingsTab==='help'?'active':''}" onclick="HelpCenterLoader.open()" title="Abrir a Central do Borion"><span class="settings-help-icon">?</span><span>Central do Borion</span></button>
      <button id="qb_both" class="btn btn-primary btn-sm settings-quick-backup-btn" onclick="Settings.quickBackupBoth()" title="Cria um backup agora e salva ao mesmo tempo no Google Drive e neste dispositivo">SALVAR DRIVE&amp;LOCAL</button>
    </div>`;
  let content='';
  if(S.settingsTab==='modules') content = renderSettingsModules();
  else if(S.settingsTab==='dashboard') content = renderSettingsDashboard();
  else if(S.settingsTab==='profiles') content = renderSettingsProfiles();
  else if(S.settingsTab==='categories') content = renderSettingsCategories();
  else if(S.settingsTab==='personalization') content = renderSettingsPersonalization();
  else if(S.settingsTab==='backup') content = renderSettingsBackup();
  else if(S.settingsTab==='integrations') content = window.BorionInterop ? BorionInterop.renderSettings() : '<div class="settings-section">Integração indisponível.</div>'; // protected interop seam
  else if(S.settingsTab==='help') content = window.BorionHelp ? BorionHelp.render() : HelpCenterLoader.placeholder();
  return `<div class="settings-layout">${tabs}<div class="settings-content">${content}</div><div class="version-tag">V. 6.45.5 — Revisão de Despesas MIT Corrigida</div><footer class="app-release-footer" aria-label="Informações do Borion">
<div><strong>Versão:</strong> 6.45.5</div>
<div><strong>Lançamento:</strong> 20/07/2026</div>
<div>Desenvolvido por <strong>Pedro Bardella</strong></div>
<div>© 2026 Pedro Bardella. Todos os direitos reservados.</div>
</footer></div>`;
}
function renderSettingsModules(){
  const chequesEnabled = !!(S.data.cheques && S.data.cheques.enabled);
  const reservasEnabledNow = !!(S.data.modules && S.data.modules.reserves !== false && S.data.reservas && S.data.reservas.enabled !== false);
  const importsEnabled = !!(S.data.modules && S.data.modules.imports !== false);
  const investmentsEnabledNow = investmentsEnabled();
  const agendaEnabledNow = agendaEnabled();
  const popupCfg = S.config.popupNotifs || {enabled:true,durationMs:40000};
  const popupEnabled = popupCfg.enabled !== false;
  const dur = Number(popupCfg.durationMs)||40000;
  return `
    <div class="settings-section settings-hero-section"><h3>Módulos do Borion</h3><p class="desc">Ative só o que você usa. Desativar uma função apenas oculta a tela; não apaga seus dados.</p></div>
    <div class="settings-module-grid">
      ${moduleToggleHTML({key:'investments',title:'Investimentos',desc:'Ativos, dinheiro em caixa e evolução de investimentos — aparece em Investimentos e no card de Patrimônio.',enabled:investmentsEnabledNow,onClick:'Settings.toggleInvestments()'})}
      ${moduleToggleHTML({key:'agenda',title:'Agenda Financeira',desc:'Compromissos e lembretes financeiros com data.',enabled:agendaEnabledNow,onClick:'Settings.toggleAgenda()'})}
      ${moduleToggleHTML({key:'cheques',title:'Cheques',desc:'Controle cheques recebidos e emitidos, lotes, baixas, vencimentos, devoluções e reapresentações.',enabled:chequesEnabled,onClick:'Settings.toggleCheques()'})}
      ${moduleToggleHTML({key:'reserves',title:'Reserva',desc:'Separe dinheiro por objetivo dentro do patrimônio, com extrato de reservar, resgatar, rendimento e ajuste.',enabled:reservasEnabledNow,onClick:'Settings.toggleReservas()'})}
      ${moduleToggleHTML({key:'imports',title:'Importar extratos',desc:'Importe CSV, OFX, TXT e PDF textual para revisar antes de aplicar os efeitos financeiros.',enabled:importsEnabled,onClick:'Settings.toggleImports()'})}
      <div class="module-toggle-card ${popupEnabled?'enabled':''}">
        <div class="module-toggle-head">
          <div><h3>Popups de notificação</h3><p class="desc">Avisos verdes translúcidos no canto direito para vencimentos e lembretes importantes.</p></div>
          <button class="toggle-switch ${popupEnabled?'on':''}" onclick="Settings.togglePopupNotifs()" aria-label="${popupEnabled?'Desativar':'Ativar'} popups"><span></span></button>
        </div>
        <div class="module-toggle-status">${popupEnabled?'Ativo':'Desativado'} — os lembretes continuam no sino; isto controla só o popup flutuante.</div>
        <div class="field" style="margin:12px 0 0;"><label>Tempo do popup</label><select id="cfg_popup_duration"><option value="30000" ${dur===30000?'selected':''}>30 segundos</option><option value="40000" ${dur===40000?'selected':''}>40 segundos</option><option value="50000" ${dur===50000?'selected':''}>50 segundos</option></select></div>
      </div>
    </div>`;
}
function renderSettingsDashboard(){
  const cards = DEFAULT_DASHBOARD_WIDGETS.map(k=>{
    const enabled = dashboardEnabled(k);
    return `<div class="dashboard-toggle-card ${enabled?'enabled':''}">
      <div><h4>${esc(DASHBOARD_WIDGET_LABELS[k])}</h4><p>${enabled?'Visível na visão geral. Ao ativar novamente, este bloco sobe para o topo.':'Oculto da visão geral para deixar a tela mais limpa.'}</p></div>
      <button class="toggle-switch ${enabled?'on':''}" onclick="Settings.toggleDashboardWidget('${k}')"><span></span></button>
    </div>`;
  }).join('');
  return `
    <div class="settings-section settings-hero-section"><h3>Organização da Visão Geral</h3><p class="desc">Ligue e desligue os gráficos/tabelas do dashboard. Quando você ativa um bloco, ele entra em primeiro para facilitar a montagem da sua tela.</p></div>
    <div class="dashboard-toggle-grid">${cards}</div>
    <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap;"><button class="btn-outline btn-sm" onclick="Settings.resetDashboardWidgets()">Restaurar dashboard padrão</button><button class="btn-outline btn-sm" onclick="S.view='overview';renderApp();">Ver visão geral</button></div>`;
}
function renderSettingsCategories(){
  ensureCategoryColors();
  const catBlock=(typeKey,typeLabel)=>{
    const orderType='cat_'+typeKey;
    const raw=(S.data.categorias&&S.data.categorias[typeKey])?S.data.categorias[typeKey]:[];
    const wrapped=raw.map((nome,createdIndex)=>({id:nome,nome,createdIndex}));
    const ordered=window.OrderPreferences?OrderPreferences.applyOrder(orderType,wrapped):wrapped;
    const naturalIds=ordered.map(x=>x.id);
    const organizing=!!(window.OrderPreferences&&OrderPreferences.active&&OrderPreferences.activeType===orderType);
    const tags=ordered.map(item=>{const c=item.nome;return `<span class="cat-tag cat-tag-manage ${organizing?'category-order-row':''}" data-order-id="${esc(c)}" style="--cat-color:${esc(categoryColor(typeKey,c))}">
      <span class="cat-dot"></span><span class="cat-tag-name">${esc(c)}</span>
      ${organizing?OrderPreferences.reorderRowControlsHTML(orderType,c,c,naturalIds):`<input type="color" class="cat-color-inline" value="${esc(categoryColor(typeKey,c))}" title="Cor da categoria" onchange="Settings.setCategoryColor(${jsArg(typeKey)},${jsArg(c)},this.value)"><button class="cat-mini-btn" onclick="Settings.renameCategory(${jsArg(typeKey)},${jsArg(c)})" title="Renomear">✎</button><button class="cat-mini-btn danger" onclick="Settings.deleteCategory(${jsArg(typeKey)},${jsArg(c)})" title="Excluir">&times;</button>`}
    </span>`;}).join('');
    return `<div class="cat-manage-group cat-panel"><div class="category-panel-head"><div><h4>${esc(typeLabel)}</h4><p class="desc">Escolha A–Z, Z–A, recentes, antigas ou uma ordem personalizada.</p></div>${window.OrderPreferences?OrderPreferences.sortSelectHTML(orderType):''}</div><div class="cat-tag-list" data-order-list="${orderType}">${tags||'<span class="desc">Nenhuma categoria ainda.</span>'}</div>${organizing?'':`<button class="btn-outline btn-sm" onclick="Settings.addCategory(${jsArg(typeKey)})">+ Nova categoria</button>`}</div>`;
  };
  return `<div class="settings-section settings-hero-section"><h3>Categorias</h3><p class="desc">As categorias mantêm suas cores e agora também podem ser ordenadas por perfil. A mesma ordem aparece nos seletores de lançamentos e assinaturas.</p></div><div class="settings-categories-grid">${catBlock('receita','Receitas')}${catBlock('fixa','Despesas fixas')}${catBlock('variavel','Despesas variáveis')}</div>`;
}

function renderBudgetSummaryPersonalization(){
  if(typeof budgetSummaryPreferences!=='function') return '';
  const pref=budgetSummaryPreferences();
  const rows=pref.order.map((k,i)=>{ const d=BUDGET_SUMMARY_CARD_DEFS[k], checked=pref.visible.includes(k); return `<div class="summary-pref-row" draggable="true" data-summary-key="${k}" ondragstart="Settings.summaryDragStart(event,'${k}')" ondragover="event.preventDefault()" ondrop="Settings.summaryDrop(event,'${k}')"><span class="summary-drag" title="Arraste para reorganizar">☰</span><label><input type="checkbox" ${checked?'checked':''} onchange="Settings.toggleBudgetSummaryCard('${k}',this.checked)"> ${esc(d.label)}</label><span class="summary-pref-actions"><button class="cat-mini-btn" onclick="Settings.moveBudgetSummaryCard('${k}',-1)" ${i===0?'disabled':''}>↑</button><button class="cat-mini-btn" onclick="Settings.moveBudgetSummaryCard('${k}',1)" ${i===pref.order.length-1?'disabled':''}>↓</button></span></div>`; }).join('');
  return `<div class="settings-section"><h3>Resumo de Lançamentos</h3><p class="desc">Escolha quais indicadores aparecem no topo de Lançamentos e arraste para mudar a ordem. Esta preferência pertence somente a este perfil financeiro.</p><div class="summary-pref-list">${rows}</div><button class="btn-outline btn-sm" onclick="Settings.resetBudgetSummaryCards()">Restaurar padrão</button></div>`;
}
function renderSettingsPersonalization(){
  const fontOptions = Object.keys(FONT_LABELS).map(k=>`<option value="${k}" ${S.config.font===k?'selected':''}>${esc(FONT_LABELS[k])}</option>`).join('');
  const theme = S.config.theme || 'dark';
  const uiMode = S.config.uiMode || 'auto';
  return `
    <div class="settings-section settings-hero-section"><h3>Personalização</h3><p class="desc">Ajustes visuais seguros, sem mexer na identidade do Borion nem transformar o app em carnaval.</p></div>
    <div class="settings-section interface-mode-card"><h3>Modo de interface</h3><p class="desc">No Automático, celulares usam o Smartphone Mode para lançamentos rápidos e computadores continuam no Modo Pro completo. Nenhuma função ou dado é removido.</p><div class="field" style="max-width:360px;"><select id="cfg_ui_mode"><option value="auto" ${uiMode==='auto'?'selected':''}>Automático — Smartphone no celular / Pro no PC</option><option value="smartphone" ${uiMode==='smartphone'?'selected':''}>Forçar Smartphone Mode</option><option value="pro" ${uiMode==='pro'?'selected':''}>Forçar Modo Pro</option></select></div><div class="interface-mode-preview"><span class="${resolvedInterfaceMode()==='smartphone'?'active':''}">Smartphone</span><span class="${resolvedInterfaceMode()==='pro'?'active':''}">Pro</span></div></div>
    <div class="settings-section"><h3>Tema</h3><p class="desc">Use o tema private banking escuro, o tema claro ou siga o tema do sistema.</p><div class="field" style="max-width:320px;"><select id="cfg_theme"><option value="dark" ${theme==='dark'?'selected':''}>Escuro / Private banking</option><option value="light" ${theme==='light'?'selected':''}>Claro / Branco</option><option value="system" ${theme==='system'?'selected':''}>Tema do sistema</option></select></div></div>
    <div class="settings-section"><h3>Fonte do app</h3><p class="desc">Escolha a fonte usada em todo o app.</p><div class="field" style="max-width:320px;"><select id="cfg_font">${fontOptions}</select></div></div>
    ${renderBudgetSummaryPersonalization()}
    ${window.OrderPreferences ? OrderPreferences.renderModulesOrganizePanel() : ''}
    <div class="info-box">A personalização de cores dos ícones continua fora da tela para manter o visual premium e consistente.</div>`;
}


const Settings = {
  toggleBudgetSummaryCard(key,checked){ const p=budgetSummaryPreferences(); p.visible=p.visible.filter(k=>k!==key); if(checked)p.visible.push(key); saveCurrentData(); renderView(); },
  moveBudgetSummaryCard(key,dir){ const p=budgetSummaryPreferences(), i=p.order.indexOf(key), j=i+dir; if(i<0||j<0||j>=p.order.length)return; [p.order[i],p.order[j]]=[p.order[j],p.order[i]]; saveCurrentData(); renderView(); },
  summaryDragStart(ev,key){ Settings._summaryDragKey=key; if(ev.dataTransfer){ev.dataTransfer.effectAllowed='move';ev.dataTransfer.setData('text/plain',key);} },
  summaryDrop(ev,target){ ev.preventDefault(); const source=Settings._summaryDragKey||(ev.dataTransfer&&ev.dataTransfer.getData('text/plain')); if(!source||source===target)return; const p=budgetSummaryPreferences(), from=p.order.indexOf(source), to=p.order.indexOf(target); if(from<0||to<0)return; p.order.splice(from,1); p.order.splice(to,0,source); Settings._summaryDragKey=null; saveCurrentData(); renderView(); },
  resetBudgetSummaryCards(){ const p=budgetSummaryPreferences(); p.order=Object.keys(BUDGET_SUMMARY_CARD_DEFS); p.visible=DEFAULT_BUDGET_SUMMARY_CARDS.slice(); saveCurrentData(); renderView(); toast('Resumo de Lançamentos restaurado.'); },
  setTab(tab){ S.settingsTab=tab; renderView(); },
  addCategory(typeKey){
    openModal({title:'Nova categoria', fields:[{key:'nome',label:'Nome da categoria',type:'text'}], onSave(v){ if(v.nome && !S.data.categorias[typeKey].includes(v.nome)){ S.data.categorias[typeKey].push(v.nome); saveCurrentData(); } closeModal(); renderView(); }});
  },
  renameCategory(typeKey, oldName){
    openModal({title:'Renomear categoria', fields:[{key:'nome',label:'Novo nome',type:'text',default:oldName}], onSave(v){ const list=S.data.categorias[typeKey]; const idx=list.indexOf(oldName); if(idx>-1 && v.nome){ list[idx]=v.nome; S.data.transacoes.forEach(t=>{ if(t.categoria===oldName) t.categoria=v.nome; }); S.data.fixas.forEach(f=>{ if(f.categoria===oldName) f.categoria=v.nome; }); saveCurrentData(); } closeModal(); renderView(); }});
  },
  deleteCategory(typeKey, name){
    const snapshot=JSON.parse(JSON.stringify(S.data)); S.data.categorias[typeKey]=S.data.categorias[typeKey].filter(c=>c!==name); if(!S.data.categorias[typeKey].includes('Outro')) S.data.categorias[typeKey].push('Outro'); S.data.transacoes.forEach(t=>{ if(t.categoria===name) t.categoria='Outro'; }); S.data.fixas.forEach(f=>{ if(f.categoria===name) f.categoria='Outro'; }); if(typeKey==='variavel') (S.data.assinaturas||[]).forEach(a=>{ if(a.categoria===name) a.categoria='Outro'; }); saveCurrentData(); renderView(); showUndoToast('Categoria "'+name+'" excluída.', ()=>{ S.data=snapshot; saveCurrentData(); renderView(); });
  },
  savePersonal(){
    const p=S.currentProfile; p.name=$('#pf_name').value.trim()||p.name; p.email=$('#pf_email').value.trim(); const color=$('#pf_avatar_color'); if(color) p.avatarColor=color.value; setProfiles(S.profiles); renderApp(); toast('Perfil atualizado.');
  },
  readAvatarFile(input){
    const file=input.files && input.files[0]; if(!file) return;
    if(file.size>900000){ alert('Escolha uma imagem menor que 900 KB para não pesar o backup.'); input.value=''; return; }
    const reader=new FileReader(); reader.onload=()=>{ S.currentProfile.avatarImage=reader.result; setProfiles(S.profiles); renderApp(); toast('Foto do perfil atualizada.'); }; reader.readAsDataURL(file); input.value='';
  },
  removeAvatarImage(){ delete S.currentProfile.avatarImage; setProfiles(S.profiles); renderApp(); toast('Foto removida.'); },
  setPasswordFlow(){
    openModal({title:'Definir senha', fields:[{key:'pw',label:'Nova senha',type:'password'},{key:'pw2',label:'Confirmar senha',type:'password'}], onSave: async (v)=>{ if(!v.pw || v.pw.length<4){ alert('A senha deve ter ao menos 4 caracteres.'); return; } if(v.pw!==v.pw2){ alert('As senhas não coincidem.'); return; } const p=S.currentProfile; p.salt=randomSalt(); p.passwordHash=await hashPassword(v.pw,p.salt); setProfiles(S.profiles); closeModal(); renderView(); toast('Senha definida.'); }});
  },
  changePassword(){ Settings.setPasswordFlow(); },
  removePassword(){ const p=S.currentProfile; p.passwordHash=null; p.salt=null; setProfiles(S.profiles); renderView(); toast('Senha removida.'); },
  deleteProfile(id){
    const pr=S.profiles.find(x=>x.id===id); if(!pr) return; const prSnapshot=JSON.parse(JSON.stringify(pr)); const dataSnapshot=getProfileData(id); const wasCurrent=id===S.currentProfile.id; if(window.BorionDataActions6401) BorionDataActions6401.deleteProfile(id,'settings_delete'); S.profiles=S.profiles.filter(x=>x.id!==id); setProfiles(S.profiles); localStorage.removeItem(LS_DATA_PREFIX+id); if(wasCurrent){ logout(); } else { renderView(); } showUndoToast('Perfil "'+pr.name+'" excluído.', ()=>{ if(typeof clearProfileDeletion6401==='function') clearProfileDeletion6401(id); S.profiles.push(prSnapshot); setProfiles(S.profiles); if(dataSnapshot!=null) setProfileData(id,dataSnapshot); if(S.currentProfile) renderView(); else renderGate(); });
  },
  exportProfile(){ const p=S.currentProfile; const payload={type:'multicap-profile-backup',version:2,exportedAt:new Date().toISOString(),profile:{id:p.id,name:p.name,email:p.email,passwordHash:p.passwordHash,salt:p.salt,avatarColor:p.avatarColor,avatarImage:p.avatarImage},data:S.data}; downloadJSON(payload, `backup-${slug(p.name)}-${dateSlug()}.json`); toast('Backup exportado.'); },
  emailBackup(){ BackupFS.manualBackupNow(); const p=S.currentProfile; const subject=encodeURIComponent('Backup - '+APP_NAME); const body=encodeURIComponent('Olá,\n\nSegue em anexo o backup do '+APP_NAME+' (perfil atual: "'+p.name+'").\nO arquivo foi baixado/salvo agora — anexe-o a este e-mail antes de enviar.\n\n'); setTimeout(()=>{ window.location.href=`mailto:${p.email||''}?subject=${subject}&body=${body}`; },400); },
  resetColors(){ S.config.iconColors=Object.assign({},DEFAULT_ICON_COLORS); setConfig(S.config); renderView(); toast('Cores restauradas.'); },
  /* ---------------- V6.24.6 — force save manual unificado ----------------
     Ctrl+S, os botões de Configurações e o atalho fixo do Modo Pro passam todos por
     manualBackup(). O backup rápido não tem uma lógica própria: ele é somente um atalho
     visual para o mesmo backup manual, usando um único snapshot nos destinos escolhidos. */
  async _runQuickBackup(btnId, defaultLabel, busyLabel, task){
    const btn = document.getElementById(btnId);
    if(btn){ if(btn.disabled) return null; btn.disabled = true; btn.textContent = busyLabel; }
    try{ return await task(); }
    finally{ if(btn && btn.isConnected){ btn.disabled = false; btn.textContent = defaultLabel; } }
  },
  async _prepareLocalFolderAccess(interactive=true){
    if(!window.BackupFS) return false;
    try{ return await BackupFS.verifyFolderConnection(interactive); }
    catch(e){ console.warn('[BORION_BACKUP][VERIFY_FOLDER]',e); return false; }
  },
  async _saveSnapshotLocally(snapshot, reason='manual', options={}){
    if(!window.storageProvider) throw new Error('Armazenamento local do Borion não está disponível.');
    const entry = await storageProvider.createBackup(reason,{payload:snapshot});
    let folderFile = null;
    let downloaded = false;
    let folderError = '';
    const connected = await Settings._prepareLocalFolderAccess(options.interactive!==false);
    if(connected && window.BackupFS && BackupFS.dirHandle){
      folderFile = await BackupFS.writeToFolder(snapshot,'borion-backup-local',{interactive:false});
      if(folderFile){
        BackupFS.lastAutoBackupAt=Date.now();
        BackupFS.dirty=false;
      }else{
        folderError='A pasta estava conectada, mas a gravação do JSON falhou.';
      }
    }
    /* Backup manual nunca termina sem um arquivo JSON visível. Se a pasta não estiver
       autorizada (ou a escrita falhar), faz download pelo navegador como fallback. */
    if(!folderFile){
      const filename=backupFilename('borion-backup-manual');
      downloadJSON(snapshot,filename);
      downloaded=true;
    }
    return {entry,folderFile,downloaded,folderError};
  },
  async manualBackup(options={}){
    if(!(S&&S.currentProfile&&S.data)) throw new Error('Abra um perfil financeiro antes de salvar.');
    const targets=options.targets||'both';
    const wantDrive=targets==='both'||targets==='drive';
    const wantLocal=targets==='both'||targets==='local';
    const reason=options.reason||'manual_drive_local';
    saveCurrentData({finalConfirmation:true});
    if(typeof clearExitSavePending==='function') clearExitSavePending(S.currentProfile.id);

    const sharedSnapshot=await buildSharedBackupSnapshot(reason,'backup manual do usuário');
    const result={driveOk:false,localOk:false,driveError:'',localError:'',folderFile:null,downloaded:false,snapshotId:sharedSnapshot.snapshotId};

    const jobs=[];
    if(wantDrive){
      jobs.push((async()=>{
        if(!(window.GoogleDriveProvider&&GoogleDriveProvider.isConnected())) throw new Error('nenhuma conta do Google Drive conectada');
        /* Atualiza current.json, cria forcesave e também registra o backup manual.
           Todos recebem exatamente o mesmo snapshot. */
        const forced=await GoogleDriveProvider.forceSyncNow({payload:sharedSnapshot});
        if(!forced) throw new Error('o Google Drive não confirmou o salvamento');
        await GoogleDriveProvider.createBackup(reason,{payload:sharedSnapshot});
        result.driveOk=true;
      })().catch(e=>{ result.driveError=(e&&e.message)||String(e); }));
    }
    if(wantLocal){
      jobs.push((async()=>{
        const local=await Settings._saveSnapshotLocally(sharedSnapshot,reason,{interactive:options.interactive!==false});
        result.localOk=true;
        result.folderFile=local.folderFile;
        result.downloaded=local.downloaded;
        if(local.folderError) result.localError=local.folderError;
      })().catch(e=>{ result.localError=(e&&e.message)||String(e); }));
    }
    await Promise.all(jobs);

    const parts=[];
    if(wantDrive) parts.push(result.driveOk?'Drive salvo':'Drive falhou: '+result.driveError);
    if(wantLocal){
      if(result.folderFile) parts.push('JSON salvo em '+result.folderFile.filename);
      else if(result.downloaded) parts.push('JSON baixado pelo navegador');
      else parts.push('Local falhou: '+result.localError);
    }
    toast(parts.join(' · '));
    return result;
  },
  quickBackupDrive(){
    return Settings._runQuickBackup('qb_drive','Criar backup agora','Criando...',()=>Settings.manualBackup({targets:'drive',reason:'manual'}));
  },
  quickBackupLocal(){
    return Settings._runQuickBackup('qb_local','Criar backup agora','Criando...',()=>Settings.manualBackup({targets:'local',reason:'manual'}));
  },
  quickBackupBoth(){
    return Settings._runQuickBackup('qb_both','SALVAR DRIVE&LOCAL','Salvando...',()=>Settings.manualBackup({targets:'both',reason:'manual_drive_local'}));
  },
  toggleCheques(){ if(!S.data.cheques) S.data.cheques={enabled:false,items:[]}; S.data.cheques.enabled=!S.data.cheques.enabled; if(!Array.isArray(S.data.cheques.items)) S.data.cheques.items=[]; saveCurrentData(); if(!S.data.cheques.enabled && S.view==='cheques') S.view='settings'; renderApp(); toast(S.data.cheques.enabled?'Módulo de cheques ativado.':'Módulo de cheques desativado.'); },
  toggleReservas(){
    if(!S.data.modules) S.data.modules=Object.assign({},DEFAULT_MODULES);
    if(!S.data.reservas) S.data.reservas={enabled:true,boxes:[],moves:[],monthlyReports:[]};
    const wasEnabled=(S.data.modules.reserves !== false && S.data.reservas.enabled !== false);
    const next=!wasEnabled;
    let converted=[];
    if(next && typeof convertStandaloneMetasToReservas==='function') converted=convertStandaloneMetasToReservas();
    S.data.modules.reserves=next;
    S.data.reservas.enabled=next;
    saveCurrentData();
    if(!next && S.view==='reservas') S.view='settings';
    renderApp();
    if(next && converted.length) toast('Reserva ativada. '+converted.length+' meta'+(converted.length===1?' foi convertida':'s foram convertidas')+' em Cofrinho'+(converted.length===1?'':'s')+'.');
    else toast(next?'Reserva ativada.':'Reserva desativada. As metas ligadas aos Cofrinhos ficaram ocultas, sem apagar os dados.');
  },
  toggleImports(){ if(!S.data.modules) S.data.modules=Object.assign({},DEFAULT_MODULES); S.data.modules.imports = !(S.data.modules.imports !== false); saveCurrentData(); if(S.data.modules.imports===false && S.view==='imports') S.view='settings'; renderApp(); toast(S.data.modules.imports!==false?'Importador de extratos ativado.':'Importador de extratos desativado.'); },
  toggleInvestments(){ if(!S.data.modules) S.data.modules=Object.assign({},DEFAULT_MODULES); S.data.modules.investments = !(S.data.modules.investments !== false); saveCurrentData(); if(S.data.modules.investments===false && S.view==='investments') S.view='settings'; renderApp(); toast(S.data.modules.investments!==false?'Investimentos ativado.':'Investimentos desativado — os dados continuam salvos.'); },
  toggleAgenda(){ if(!S.data.modules) S.data.modules=Object.assign({},DEFAULT_MODULES); S.data.modules.agenda = !(S.data.modules.agenda !== false); saveCurrentData(); if(S.data.modules.agenda===false && S.view==='agenda') S.view='settings'; renderApp(); toast(S.data.modules.agenda!==false?'Agenda Financeira ativada.':'Agenda Financeira desativada — os dados continuam salvos.'); },
  togglePopupNotifs(){ if(!S.config.popupNotifs) S.config.popupNotifs={enabled:true,durationMs:40000}; S.config.popupNotifs.enabled = !(S.config.popupNotifs.enabled !== false); setConfig(S.config); renderView(); toast(S.config.popupNotifs.enabled!==false?'Popups de notificação ativados.':'Popups de notificação desativados.'); },
  toggleDashboardWidget(key){ if(!S.data.dashboard) S.data.dashboard={widgets:DEFAULT_DASHBOARD_WIDGETS.slice()}; let arr=S.data.dashboard.widgets||[]; if(arr.includes(key)){ arr=arr.filter(k=>k!==key); } else { arr=[key].concat(arr.filter(k=>k!==key)); } S.data.dashboard.widgets=arr; saveCurrentData(); renderView(); },
  resetDashboardWidgets(){ S.data.dashboard={widgets:DEFAULT_DASHBOARD_WIDGETS.slice()}; saveCurrentData(); renderView(); toast('Dashboard restaurado.'); }
};
function slug(s){ return (s||'perfil').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
function dateSlug(){ const d=new Date(); return d.toISOString().slice(0,10); }
function downloadJSON(obj, filename){ const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },200); }

/* ---------- V5.34 Cloud Foundation overrides: conta separada de perfis financeiros ---------- */
function renderSettingsProfiles(){
  const p = S.currentProfile || {};
  const isCloud = !!(window.CloudStorage && CloudStorage.user);
  const profilesRows = (S.profiles||[]).map(pr=>`
    <div class="profile-row ${pr.id===p.id?'active':''}">
      ${profileAvatarHTML(pr)}
      <div class="info"><div class="n">${esc(pr.name)} ${pr.id===p.id?'(ativo)':''}</div><div class="e">Perfil financeiro ${isCloud?'na nuvem':'local'} · ${pr.passwordHash?'com senha':'sem senha'} · ID ${esc(String(pr.id).slice(0,8))}</div></div>
      ${pr.id!==p.id?`<button class="btn-outline btn-sm" onclick="Settings.switchFinancialProfile('${pr.id}')">Abrir</button>`:''}
      <button class="btn-outline btn-sm" onclick="Settings.backupSingleProfile('${pr.id}')">Backup deste perfil</button>
      <button class="btn-outline btn-sm" onclick="Settings.deleteProfile('${pr.id}')">Excluir</button>
    </div>`).join('');
  return `
    <div class="settings-section settings-hero-section"><h3>Perfil financeiro atual</h3><p class="desc">A conta faz login. O perfil guarda os dados financeiros. Exportar/importar usa sempre o perfil ativo por padrão.</p></div>
    <div class="profile-editor-card">
      <div class="profile-editor-avatar">${profileAvatarHTML(p,'profile-avatar-xl')}<button class="btn-outline btn-sm" onclick="document.getElementById('pf_avatar_file').click()">Trocar foto</button><button class="btn-outline btn-sm" onclick="Settings.removeAvatarImage()">Remover foto</button></div>
      <div class="profile-editor-fields">
        <div class="field"><label>Nome do perfil financeiro</label><input type="text" id="pf_name" value="${esc(p.name||'Perfil')}"/></div>
        <div class="field"><label>Conta logada</label><input type="email" id="pf_email" value="${esc((CloudStorage&&CloudStorage.user&&CloudStorage.user.email)||p.email||'')}" disabled/></div>
        <div class="field"><label>Cor do fundo do avatar</label><input type="color" id="pf_avatar_color" value="${esc(profileAvatarBg(p))}"/></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="Settings.savePersonal()">Salvar perfil financeiro</button><button class="btn-outline btn-sm" onclick="Settings.createFinancialProfile()">+ Novo perfil</button>${p.passwordHash?`<button class="btn-outline btn-sm" onclick="Settings.changePassword()">Trocar senha do perfil</button><button class="btn-outline btn-sm" onclick="Settings.removePassword()">Remover senha do perfil</button>`:`<button class="btn-outline btn-sm" onclick="Settings.setPasswordFlow()">Colocar senha no perfil</button>`}${isCloud?`<button class="btn-outline btn-sm" onclick="cloudChangePasswordFromSettings()">Trocar senha da conta</button>`:''}</div>
        <input type="file" id="pf_avatar_file" accept="image/*" style="display:none" onchange="Settings.readAvatarFile(this)">
      </div>
    </div>
    <div class="settings-section"><h3>Perfis desta conta (${(S.profiles||[]).length})</h3><p class="desc">Troque entre perfis sem misturar dados. Cada perfil tem armazenamento local e registro separado no Supabase.</p>${profilesRows}<div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;"><button class="btn-outline btn-sm" onclick="Settings.createFinancialProfile()">+ Criar perfil</button><button class="btn-outline btn-sm" onclick="document.getElementById('import_file').click()">Importar JSON</button></div><input type="file" id="import_file" accept="application/json" style="display:none;"></div>`;
}

/* V6.14.0 — "Nuvem" e "Backups" eram duas abas separadas, e a de Backups sempre
   mostrava textos do Supabase (nomes de tabela, "Salvar snapshot no Supabase" etc.)
   mesmo pra quem usa Google Drive ou modo local — informação irrelevante e confusa.
   Unificado numa aba só, que mostra só o que é relevante pro modo atual. */
function renderSettingsBackup(){
  const cloud = window.CloudStorage;
  const user = cloud && cloud.user;
  const isDrive = !user && window.GoogleDriveProvider && GoogleDriveProvider.isConnected();
  const isLocal = !user && !isDrive;

  const localBackupsBlock = `
    <div class="settings-section"><h3>Backups neste dispositivo</h3><p class="desc">Histórico guardado no navegador (IndexedDB). Quando uma pasta local está configurada, o mesmo clique também grava um arquivo JSON dentro de Backups_Borion.</p><div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn-outline btn-sm" onclick="Settings.viewLocalBackups()">Ver backups deste dispositivo</button><button id="qb_local" class="btn btn-primary btn-sm" onclick="Settings.quickBackupLocal()">Criar backup agora</button></div></div>`;

  let backupFolderBlock;
  if(!FS_ACCESS_SUPPORTED) backupFolderBlock = `<p class="desc">Este navegador não permite escolher uma pasta fixa pra backup automático.</p>`;
  else if(BackupFS.needsReconnect) backupFolderBlock = `<div class="reconnect-banner"><span>A pasta de backups precisa ser reautorizada após reabrir o app.</span><button class="btn-outline btn-sm" onclick="BackupFS.reconnect()">Reconectar pasta</button></div>`;
  else if(BackupFS.dirHandle) backupFolderBlock = `<div class="gold-box">Pasta local configurada. O Borion salva arquivos dentro da subpasta <b>Backups_Borion</b>.</div><div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:10px;"><button class="btn-outline btn-sm" onclick="BackupFS.choose()">Trocar pasta</button><button class="btn-outline btn-sm" onclick="BackupFS.disconnect()">Desconectar pasta</button></div>`;
  else backupFolderBlock = `<p class="desc">Escolha uma pasta local (ex: uma pasta sincronizada com Google Drive/OneDrive) pra cópias automáticas extras neste dispositivo.</p><button class="btn btn-primary btn-sm" onclick="BackupFS.choose()">Escolher pasta de backups</button>`;
  const folderSection = `
    <div class="settings-section"><h3>Pasta local extra (opcional)</h3>
      ${backupFolderBlock}
      <div class="info-box">Por segurança do navegador, o Borion não pode criar uma pasta sozinho sem você autorizar.</div>
    </div>`;

  if(isDrive){
    const gs = GoogleDriveProvider.getStatus();
    const conflictBanner = gs.conflict ? `<div class="info-box danger-box"><b>Atenção:</b> existe uma versão mais recente desta conta salva no Google Drive (provavelmente de outro dispositivo). Escolha uma: <button class="btn-outline btn-sm" onclick="GoogleDriveProvider.reload()">Recarregar (usar a versão do Drive)</button> <button class="btn-outline btn-sm" onclick="forceManualSave()">Salvar minha versão agora (Ctrl+S)</button></div>` : '';
    return `
    <div class="settings-section settings-hero-section"><h3>Backups e Google Drive</h3><p class="desc">Seus dados sincronizam automaticamente com a pasta compartilhada do Google Drive.</p></div>
    ${conflictBanner}
    <div class="settings-section"><h3>Status</h3><p class="desc"><strong>Conta:</strong> ${esc(gs.email||'')}<br><strong>Pasta conectada:</strong> ${esc(gs.folderName||'(não identificada)')} ${gs.folderLink?`<a href="${esc(gs.folderLink)}" target="_blank" rel="noopener">Abrir no Google Drive ↗</a>`:''}<br><strong>Status:</strong> ${gs.conflict?'Conflito — veja acima':gs.lastSyncError?(gs.authRequired?'Reconexão necessária':'Falha de sincronização'):gs.pending?'Salvando alterações...':'Tudo sincronizado'}${gs.lastSyncError?`<br><strong>Erro:</strong> ${esc(gs.lastSyncError)}`:''}${gs.lastSyncAt?`<br><strong>Última confirmação:</strong> ${esc(new Date(gs.lastSyncAt).toLocaleString('pt-BR'))}`:''}<br><strong>Perfil ativo:</strong> ${esc(S.currentProfile?S.currentProfile.name:'Nenhum')}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="GoogleDriveProvider.handleStatusClick()">Sincronizar agora</button><button class="btn-outline btn-sm" onclick="Settings.exportProfile()">Exportar conta completa</button><button class="btn-outline btn-sm" onclick="GoogleDriveProvider.disconnect();S.currentProfile=null;S.data=null;CloudAuth.mode='login';CloudAuth.error='';CloudAuth.info='';CloudAuth.emailExpanded=false;CloudAuth.render();">Sair da conta Google</button></div>
    </div>
    <div class="settings-section"><h3>Backups no Google Drive</h3><p class="desc">Histórico guardado na pasta <b>backups</b>, dentro da pasta acima. Limpeza automática mantém no máximo ~10GB (mais antigos são apagados — o histórico completo continua no disco local).</p><div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn-outline btn-sm" onclick="Settings.viewDriveBackups()">Ver backups no Drive</button><button id="qb_drive" class="btn btn-primary btn-sm" onclick="Settings.quickBackupDrive()">Criar backup agora</button></div></div>
    ${localBackupsBlock}
    ${folderSection}
    <div class="info-box">Se a internet cair, o Borion continua salvando neste dispositivo e envia pro Drive automaticamente quando a conexão voltar.</div>`;
  }

  if(isLocal){
    const st = (window.storageProvider ? storageProvider.getStorageStatus() : {profileCount:(S.profiles||[]).length, online:navigator.onLine});
    return `
    <div class="settings-section settings-hero-section"><h3>Backups</h3><p class="desc">Você está usando o Borion sem conta — os dados ficam só neste dispositivo.</p></div>
    <div class="settings-section"><h3>Status</h3><p class="desc"><strong>Modo:</strong> Local (sem conta)<br><strong>Perfis neste dispositivo:</strong> ${st.profileCount||0}<br><strong>Perfil ativo:</strong> ${esc(S.currentProfile?S.currentProfile.name:'Nenhum')}<br><strong>Conexão:</strong> ${st.online?'Online':'Offline'}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="Settings.exportProfile()">Exportar conta completa</button><button class="btn-outline btn-sm" onclick="document.getElementById('import_file_cloud').click()">Importar JSON</button><button class="btn-outline btn-sm" onclick="Settings.switchToCloudFromSettings()">Entrar com uma conta na nuvem</button></div>
      <input type="file" id="import_file_cloud" accept="application/json" style="display:none;">
    </div>
    ${localBackupsBlock}
    ${folderSection}
    <div class="info-box">Entrar com uma conta permite sincronizar entre celular e computador — seus perfis locais continuam aqui e voltam a aparecer se você sair da conta depois.</div>
    ${renderInstallAppCard()}`;
  }

  // ---- Só chega aqui se realmente estiver logado no Supabase (legado) ----
  const pending = cloud && cloud.pendingInfo ? cloud.pendingInfo() : null;
  const last = cloud && cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizou nesta sessão';
  const status = cloud ? (cloud.statusLabel ? cloud.statusLabel() : (cloud.statusText || cloud.status || 'Indisponível')) : 'Módulo de nuvem não carregado';
  const pendingTxt = pending ? `Existe sincronização pendente desde ${new Date(pending.savedAt).toLocaleString('pt-BR')}. Motivo: ${esc(pending.reason||'pendente')}` : 'Nenhum dado pendente no cache local.';
  const profileName = S.currentProfile ? S.currentProfile.name : 'Nenhum perfil ativo';
  const schema = cloud && cloud.schemaError ? `<div class="info-box danger-box"><b>Atenção:</b> ${esc(cloud.schemaError)}<br>Verifique a configuração das tabelas do Supabase antes de usar o login antigo por e-mail.</div>` : '';
  const consent = window.BackupFS ? BackupFS.hasConsent() : null;
  const consentText = consent ? `Aceito em ${new Date(consent.acceptedAt).toLocaleString('pt-BR')} · modo: ${esc(consent.mode||'backup')}` : 'Ainda não configurado neste dispositivo.';
  return `
    <div class="settings-section settings-hero-section"><h3>Borion Cloud Foundation</h3><p class="desc">Conta, perfis financeiros, sincronização real, cache local e proteção contra perda de dados.</p></div>
    ${schema}
    <div class="settings-section"><h3>Status da nuvem</h3><p class="desc"><strong>Usuário logado:</strong> ${user?esc(user.email||'logado'):'não logado'}<br><strong>Perfil financeiro ativo:</strong> ${esc(profileName)}<br><strong>Status:</strong> ${esc(status)}<br><strong>Última sincronização:</strong> ${esc(last)}<br><strong>Dados pendentes:</strong> ${pendingTxt}</p><div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn btn-primary btn-sm" onclick="cloudForceSync()">Sincronizar agora</button><button class="btn-outline btn-sm" onclick="cloudRunSupabaseDiagnostic()">Diagnóstico Supabase</button><button class="btn-outline btn-sm" onclick="Settings.exportProfile()">Exportar conta completa</button><button class="btn-outline btn-sm" onclick="document.getElementById('import_file_cloud').click()">Importar JSON</button><button class="btn-outline btn-sm" onclick="cloudChangePasswordFromSettings()">Trocar senha da conta/login</button>${user?`<button class="btn-danger btn-sm" onclick="Settings.deleteCloudAccountFlow()">Excluir conta</button>`:''}<button class="btn-outline btn-sm" onclick="cloudLogout()">Sair da conta</button></div><input type="file" id="import_file_cloud" accept="application/json" style="display:none;"></div>
    <div class="settings-section"><h3>Aceite de proteção de dados</h3><p class="desc"><strong>Status:</strong> ${consentText}</p><div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn-outline btn-sm" onclick="Settings.showBackupConsent()">Ver termo/configurar proteção</button><button class="btn-outline btn-sm" onclick="Settings.createCloudBackupNow('first_setup','backup criado manualmente pela tela de segurança')">Criar backup inicial agora</button></div></div>
    <div class="settings-section"><h3>Backups no Supabase</h3><p class="desc">Gera um JSON completo com todos os perfis da conta.</p><div style="display:flex;gap:10px;flex-wrap:wrap;"><button class="btn-outline btn-sm" onclick="Settings.createCloudBackupNow('manual','backup manual completo')">Salvar snapshot no Supabase</button><button class="btn-outline btn-sm" onclick="Settings.viewCloudBackups()">Ver backups do Supabase</button></div></div>
    ${localBackupsBlock}
    ${folderSection}
    <div class="info-box">Fluxo: alteração → salva local/offline → marca pendente → envia ao Supabase → limpa pendência.</div>
    ${user?`<div class="settings-section danger-box"><h3>Excluir conta Borion Cloud</h3><p class="desc">Apaga a conta de login, e-mail, todos os perfis financeiros e todos os dados monetários salvos no Supabase.</p><button class="btn btn-danger btn-sm" onclick="Settings.deleteCloudAccountFlow()">Excluir conta</button></div>`:''}
    ${renderInstallAppCard()}`;
}
function renderInstallAppCard(){
  if(typeof isStandalonePWA==='function' && isStandalonePWA()){
    return `<div class="settings-section"><h3>Instalar o app</h3><div class="gold-box">Você já está usando o Borion Finance instalado como app (tela cheia, fora do navegador).</div></div>`;
  }
  const ios = typeof isIOSDevice==='function' && isIOSDevice();
  const canPromptNow = !ios && typeof deferredInstallPrompt!=='undefined' && deferredInstallPrompt;
  const instructions = ios
    ? `<div class="info-box"><b>iPhone/iPad (Safari):</b> toque no ícone de compartilhar (retângulo com seta para cima) na barra do Safari e depois em <b>“Adicionar à Tela de Início”</b>.</div>`
    : `<div class="info-box"><b>Android/Chrome ou computador:</b> toque no menu (⋮) do navegador e escolha <b>“Instalar app”</b> ou <b>“Adicionar à tela inicial”</b>. Se aparecer o botão abaixo, você pode instalar direto por ele.</div>`;
  return `<div class="settings-section"><h3>Instalar o app</h3><p class="desc">Instalar o Borion na tela inicial abre em tela cheia, mais rápido, como um app de verdade.</p>${instructions}${canPromptNow?`<button class="btn btn-primary btn-sm" style="margin-top:10px" onclick="Settings.promptInstall()">Instalar agora</button>`:''}</div>`;
}
Settings.promptInstall = async function(){
  if(!deferredInstallPrompt){ toast('A instalação automática não está disponível agora. Use o menu do navegador.'); return; }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  renderView();
};


Settings.createFinancialProfile = async function(){
  openModal({title:'Novo perfil financeiro', sub:'Crie um perfil separado dentro da sua conta.', fields:[{key:'nome',label:'Nome do perfil',type:'text',placeholder:'Ex: Pedro Pessoal'}], saveLabel:'Criar perfil', onSave: async (v)=>{
    try{ if(!v.nome || !v.nome.trim()) throw new Error('Digite um nome.'); if(window.CloudStorage&&CloudStorage.user){ await CloudStorage.createProfile(v.nome.trim(), true); closeModal(); renderApp(); toast('Perfil criado e confirmado no Supabase.'); } else { const p={id:uid(),name:v.nome.trim(),email:'',avatarColor:avatarColor(v.nome.trim()),createdAt:Date.now()}; S.profiles.push(p); setProfiles(S.profiles); enterProfile(p,true); closeModal(); toast('Perfil criado.'); } }
    catch(e){ alert(e.message||String(e)); }
  }});
};
Settings.switchFinancialProfile = async function(id){
  const doSwitch = async ()=>{
    try{ if(window.CloudStorage&&CloudStorage.user) await CloudStorage.switchProfile(id); else { const p=S.profiles.find(x=>x.id===id); if(p) await enterProfile(p,true); } toast('Perfil alterado.'); }
    catch(e){ alert(e.message||String(e)); }
  };
  if(window.CloudStorage && CloudStorage.user) await CloudStorage.guardExit(doSwitch);
  else await doSwitch();
};
Settings.savePersonal = async function(){
  const p=S.currentProfile; if(!p) return;
  const name=$('#pf_name').value.trim()||p.name; const color=$('#pf_avatar_color'); const c=color?color.value:profileAvatarBg(p);
  try{
    if(window.CloudStorage&&CloudStorage.user){
      await CloudStorage.renameProfile(p.id,name,c,p.avatarImage||'');
      const fresh = S.profiles.find(x=>x.id===p.id);
      if(fresh) S.currentProfile = fresh;
      renderApp();
      toast('Perfil financeiro atualizado e confirmado no Supabase.');
    } else {
      p.name=name; p.avatarColor=c;
      setProfiles(S.profiles); renderApp(); toast('Perfil financeiro atualizado.');
    }
  }
  catch(e){ alert(e.message||String(e)); }
};
Settings.readAvatarFile = function(input){
  const file=input.files&&input.files[0]; if(!file) return;
  if(file.size>900000){ alert('Escolha uma imagem menor que 900 KB para não pesar o backup.'); input.value=''; return; }
  const reader=new FileReader(); reader.onload=async ()=>{
    const img=reader.result;
    try{
      if(window.CloudStorage&&CloudStorage.user){
        await CloudStorage.renameProfile(S.currentProfile.id,S.currentProfile.name,profileAvatarBg(S.currentProfile),img);
        const fresh = S.profiles.find(x=>x.id===S.currentProfile.id); if(fresh) S.currentProfile=fresh;
      } else {
        S.currentProfile.avatarImage=img; setProfiles(S.profiles);
      }
      renderApp(); toast('Foto do perfil atualizada e confirmada.');
    }catch(e){ alert(e.message||String(e)); }
  }; reader.readAsDataURL(file); input.value='';
};
Settings.removeAvatarImage = async function(){
  try{
    if(window.CloudStorage&&CloudStorage.user){
      await CloudStorage.renameProfile(S.currentProfile.id,S.currentProfile.name,profileAvatarBg(S.currentProfile),'');
      const fresh = S.profiles.find(x=>x.id===S.currentProfile.id); if(fresh) S.currentProfile=fresh;
    } else {
      delete S.currentProfile.avatarImage; setProfiles(S.profiles);
    }
    renderApp(); toast('Foto removida e confirmada.');
  }catch(e){ alert(e.message||String(e)); }
};
Settings.setPasswordFlow = function(){
  const p=S.currentProfile; if(!p) return;
  openModal({title:'Colocar senha no perfil', sub:'Essa senha protege somente este perfil financeiro dentro da conta. A senha da conta continua sendo a do login.', fields:[{key:'pw',label:'Senha do perfil',type:'password',placeholder:'Mínimo 4 caracteres'},{key:'pw2',label:'Confirmar senha do perfil',type:'password'}], saveLabel:'Salvar senha do perfil', onSave: async (v)=>{
    try{
      if(!v.pw || v.pw.length<4) throw new Error('A senha do perfil precisa ter pelo menos 4 caracteres.');
      if(v.pw!==v.pw2) throw new Error('As senhas não coincidem.');
      if(window.CloudStorage&&CloudStorage.user){
        await CloudStorage.updateProfilePassword(p.id,'',v.pw,'set');
      } else {
        p.salt=randomSalt(); p.passwordHash=await hashPassword(v.pw,p.salt); setProfiles(S.profiles);
      }
      closeModal(); renderApp(); toast('Senha do perfil definida.');
    }catch(e){ alert(e.message||String(e)); }
  }});
};
Settings.changePassword = function(){
  const p=S.currentProfile; if(!p) return;
  const hasCurrent=!!p.passwordHash;
  openModal({title:'Trocar senha do perfil', sub:'Essa senha é separada da senha da conta/login.', fields:[...(hasCurrent?[{key:'atual',label:'Senha atual do perfil',type:'password'}]:[]),{key:'pw',label:'Nova senha do perfil',type:'password',placeholder:'Mínimo 4 caracteres'},{key:'pw2',label:'Confirmar nova senha',type:'password'}], saveLabel:'Trocar senha', onSave: async (v)=>{
    try{
      if(!v.pw || v.pw.length<4) throw new Error('A nova senha do perfil precisa ter pelo menos 4 caracteres.');
      if(v.pw!==v.pw2) throw new Error('As senhas não coincidem.');
      if(window.CloudStorage&&CloudStorage.user){
        await CloudStorage.updateProfilePassword(p.id,v.atual||'',v.pw,'change');
      } else {
        if(hasCurrent){ const oldHash=await hashPassword(v.atual||'',p.salt||''); if(oldHash!==p.passwordHash) throw new Error('Senha atual do perfil incorreta.'); }
        p.salt=randomSalt(); p.passwordHash=await hashPassword(v.pw,p.salt); setProfiles(S.profiles);
      }
      closeModal(); renderApp(); toast('Senha do perfil alterada.');
    }catch(e){ alert(e.message||String(e)); }
  }});
};
Settings.removePassword = function(){
  const p=S.currentProfile; if(!p) return;
  openModal({title:'Remover senha do perfil', sub:'Para remover a senha, confirme a senha atual do perfil.', fields:[{key:'atual',label:'Senha atual do perfil',type:'password'}], saveLabel:'Remover senha', onSave: async (v)=>{
    try{
      if(window.CloudStorage&&CloudStorage.user){
        await CloudStorage.updateProfilePassword(p.id,v.atual||'',null,'remove');
      } else {
        if(p.passwordHash){ const oldHash=await hashPassword(v.atual||'',p.salt||''); if(oldHash!==p.passwordHash) throw new Error('Senha atual do perfil incorreta.'); }
        p.passwordHash=null; p.salt=null; setProfiles(S.profiles);
      }
      closeModal(); renderApp(); toast('Senha do perfil removida.');
    }catch(e){ alert(e.message||String(e)); }
  }});
};


function categoryUsageDetails(typeKey, name){
  const parts=[];
  let total=0;
  const add=(label,n)=>{ n=Number(n)||0; if(n>0){ total+=n; parts.push(`${n} em ${label}`); } };
  if(typeKey==='receita'){
    add('receitas', (S.data.transacoes||[]).filter(t=>t.tipo==='receita' && t.categoria===name).length);
    add('cheques recebidos', (S.data.cheques&&S.data.cheques.items||[]).filter(c=>c.tipo==='recebido' && c.categoria===name).length);
    const mitRules=S.data.interconnections?.sources?.['marco-iris']?.mitRevenueRules||{};
    add('regras da integração Marco Iris', Object.values(mitRules).filter(rule=>rule&&rule.category===name).length);
  } else if(typeKey==='fixa'){
    add('despesas fixas', (S.data.fixas||[]).filter(f=>f.categoria===name).length);
  } else if(typeKey==='variavel'){
    add('despesas variáveis', (S.data.transacoes||[]).filter(t=>t.tipo==='variavel' && t.categoria===name).length);
    add('parcelas de cartão', (S.data.cartoes||[]).reduce((n,card)=>n+((card.parcelas||[]).filter(p=>p.categoria===name).length),0));
    add('boletos', (S.data.boletos||[]).filter(b=>b.categoria===name).length);
    add('assinaturas', (S.data.assinaturas||[]).filter(a=>a.categoria===name).length);
    add('cheques emitidos', (S.data.cheques&&S.data.cheques.items||[]).filter(c=>c.tipo==='emitido' && c.categoria===name).length);
  }
  return {total, parts};
}
function updateCategoryReferences(typeKey, oldName, newName){
  if(typeKey==='receita'){
    (S.data.transacoes||[]).forEach(t=>{ if(t.tipo==='receita' && t.categoria===oldName) t.categoria=newName; });
    if(S.data.cheques&&Array.isArray(S.data.cheques.items)) S.data.cheques.items.forEach(c=>{ if(c.tipo==='recebido' && c.categoria===oldName) c.categoria=newName; });
    const mitRules=S.data.interconnections?.sources?.['marco-iris']?.mitRevenueRules||{};
    Object.values(mitRules).forEach(rule=>{ if(rule&&rule.category===oldName) rule.category=newName; });
  } else if(typeKey==='fixa'){
    (S.data.fixas||[]).forEach(f=>{ if(f.categoria===oldName) f.categoria=newName; });
  } else if(typeKey==='variavel'){
    (S.data.transacoes||[]).forEach(t=>{ if(t.tipo==='variavel' && t.categoria===oldName) t.categoria=newName; });
    (S.data.cartoes||[]).forEach(card=>(card.parcelas||[]).forEach(p=>{ if(p.categoria===oldName) p.categoria=newName; }));
    (S.data.boletos||[]).forEach(b=>{ if(b.categoria===oldName) b.categoria=newName; });
    (S.data.assinaturas||[]).forEach(a=>{ if(a.categoria===oldName) a.categoria=newName; });
    if(S.data.cheques&&Array.isArray(S.data.cheques.items)) S.data.cheques.items.forEach(c=>{ if(c.tipo==='emitido' && c.categoria===oldName) c.categoria=newName; });
  }
}
Settings.setCategoryColor = function(typeKey, name, color){
  setCategoryColor(typeKey, name, color);
  saveCurrentData();
  renderView();
};
Settings.addCategory = function(typeKey){
  openModal({
    title:'Nova categoria',
    sub:'Você pode usar a mesma categoria em vários lançamentos, despesas ou recebimentos.',
    fields:[{key:'nome',label:'Nome da categoria',type:'text'},{key:'cor',label:'Cor da categoria',type:'color',default:baseCatColor('Nova categoria')}],
    saveLabel:'Criar categoria',
    onSave(v){
      const name=(v.nome||'').trim();
      if(!name){ alert('Digite o nome da categoria.'); return; }
      if(!S.data.categorias[typeKey]) S.data.categorias[typeKey]=[];
      if(S.data.categorias[typeKey].some(c=>c.toLowerCase()===name.toLowerCase())){ alert('Essa categoria já existe.'); return; }
      S.data.categorias[typeKey].push(name);
      setCategoryColor(typeKey, name, v.cor||baseCatColor(name));
      saveCurrentData(); closeModal(); renderView(); toast('Categoria criada.');
    }
  });
};
Settings.renameCategory = function(typeKey, oldName){
  openModal({
    title:'Editar categoria',
    sub:'Renomear mantém o vínculo com os lançamentos já existentes.',
    fields:[{key:'nome',label:'Nome da categoria',type:'text',default:oldName},{key:'cor',label:'Cor da categoria',type:'color',default:categoryColor(typeKey,oldName)}],
    saveLabel:'Salvar categoria',
    onSave(v){
      const name=(v.nome||'').trim();
      if(!name){ alert('Digite o nome da categoria.'); return; }
      const list=S.data.categorias[typeKey]||[];
      const idx=list.indexOf(oldName);
      if(idx<0){ closeModal(); return; }
      if(name!==oldName && list.some(c=>c.toLowerCase()===name.toLowerCase())){ alert('Já existe uma categoria com esse nome.'); return; }
      list[idx]=name;
      updateCategoryReferences(typeKey, oldName, name);
      moveCategoryColor(typeKey, oldName, name, v.cor||categoryColor(typeKey,oldName));
      saveCurrentData(); closeModal(); renderView(); toast('Categoria atualizada.');
    }
  });
};
function deleteCategoryAndMoveReferences(typeKey,name,usage){
  if(!S.data.categorias[typeKey]) S.data.categorias[typeKey]=[];
  if(!S.data.categorias[typeKey].includes('Outro')) S.data.categorias[typeKey].push('Outro');
  updateCategoryReferences(typeKey,name,'Outro');
  S.data.categorias[typeKey]=S.data.categorias[typeKey].filter(category=>category!==name);
  if(S.data.categoryColors&&S.data.categoryColors[typeKey]) delete S.data.categoryColors[typeKey][name];
  const mitCount=typeKey==='receita'?Object.values(S.data.interconnections?.sources?.['marco-iris']?.mitRevenueRules||{}).filter(rule=>rule&&rule.category==='Outro').length:0;
  saveCurrentData();renderView();
  const linkedRules=(usage?.parts||[]).find(part=>part.includes('regras da integração Marco Iris'));
  toast(linkedRules?`Categoria excluída. ${linkedRules.split(' ')[0]} regra(s) da integração Marco Iris foram alteradas para “Outro”.`:'Categoria excluída. Referências vinculadas foram alteradas para “Outro”.');
}
Settings.showCategoryLinkedWarning = function(typeKey, name, usage){
  const detail=usage&&usage.parts&&usage.parts.length?usage.parts.join(', '):'referências vinculadas';
  openConfirmModal({
    title:'Excluir categoria vinculada',
    text:`A categoria "${name}" está em uso (${detail}). Ao excluir, todos esses vínculos serão movidos para “Outro”, inclusive regras da integração Marco Iris.`,
    confirmLabel:'Excluir e mover para Outro',cancelLabel:'Cancelar',variant:'danger',
    onConfirm(){ deleteCategoryAndMoveReferences(typeKey,name,usage); }
  });
};
Settings.deleteCategory = function(typeKey, name){
  if(name==='Outro'){ alert('A categoria “Outro” é necessária como destino seguro e não pode ser excluída.'); return; }
  const usage=categoryUsageDetails(typeKey,name);
  if(usage.total>0){ Settings.showCategoryLinkedWarning(typeKey,name,usage); return; }
  openConfirmModal({
    title:'Excluir categoria',text:`Excluir a categoria "${name}"?`,confirmLabel:'Excluir categoria',cancelLabel:'Cancelar',variant:'danger',
    onConfirm(){ deleteCategoryAndMoveReferences(typeKey,name,usage); }
  });
};
Settings.deleteCloudAccountFlow = function(){
  const cloud = window.CloudStorage;
  if(!cloud || !cloud.user){ alert('Entre na conta Borion Cloud antes de excluir.'); return; }
  Settings._deleteAccountState = {
    email: String(cloud.user.email||'').trim(),
    step: 'warning',
    busy: false,
    message: '',
    error: ''
  };
  Settings.renderDeleteAccountModal();
};

Settings.renderDeleteAccountModal = function(){
  const st = Settings._deleteAccountState || {};
  const cloud = window.CloudStorage;
  if(!cloud || !cloud.user){ alert('Entre na conta Borion Cloud antes de excluir.'); return; }
  const email = st.email || String(cloud.user.email||'').trim();
  const step = st.step || 'warning';
  const steps = [
    {key:'warning', label:'Aviso'},
    {key:'password1', label:'Senha'},
    {key:'emailLink', label:'E-mail'},
    {key:'password2', label:'Final'}
  ];
  const currentIndex = Math.max(0, steps.findIndex(x=>x.key===step));
  const stepHTML = steps.map((x,i)=>`<span class="delete-step ${i<currentIndex?'done':i===currentIndex?'active':''}">${i+1}. ${esc(x.label)}</span>`).join('');
  const msgHTML = st.error ? `<div class="delete-account-msg error">${esc(st.error)}</div>` : (st.message ? `<div class="delete-account-msg ok">${esc(st.message)}</div>` : '');
  let body='';

  if(step==='warning'){
    body = `
      <div class="delete-account-hero">
        <div class="delete-danger-mark">!</div>
        <div>
          <h3>Excluir conta Borion Cloud</h3>
          <p>Esta ação cancela a conta ligada ao e-mail <b>${esc(email)}</b>.</p>
        </div>
      </div>
      <div class="delete-warning-list">
        <p><b>Ao prosseguir, serão apagados:</b></p>
        <ul>
          <li>a conta de login e o e-mail cadastrado;</li>
          <li>todos os perfis financeiros dentro dessa conta;</li>
          <li>despesas, receitas, cartões, bancos, investimentos, patrimônio, agenda, cheques e reservas;</li>
          <li>dados salvos no Supabase vinculados a esta conta.</li>
        </ul>
        <p><b>Depois de excluir, esses dados não poderão ser recuperados pelo app.</b></p>
      </div>
      <div class="field"><label>Para continuar, digite EXCLUIR</label><input type="text" id="del_confirm_word" autocomplete="off" placeholder="EXCLUIR"></div>
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-block" id="del_cancel">Cancelar</button>
        <button class="btn btn-danger-solid btn-block" id="del_next">Desejo prosseguir</button>
      </div>`;
  } else if(step==='password1'){
    body = `
      <p class="modal-sub">Primeira trava de segurança: confirme a senha atual da conta. Depois disso, o Borion enviará um e-mail padrão do Supabase para confirmar sua identidade.</p>
      ${passwordInputWrapHTML({id:'del_password1',label:'Senha da conta',autocomplete:'current-password',placeholder:'Digite sua senha'})}
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-block" id="del_back">Voltar</button>
        <button class="btn btn-danger-solid btn-block" id="del_next">Confirmar senha e enviar e-mail</button>
      </div>`;
  } else if(step==='emailLink'){
    body = `
      <div class="delete-email-instructions">
        <h3>Confirme pelo e-mail</h3>
        <p>Enviamos um e-mail para <b>${esc(email)}</b>.</p>
        <ol>
          <li>Abra a caixa de entrada desse e-mail.</li>
          <li>Procure o e-mail enviado por <b>Supabase Auth</b>.</li>
          <li>O assunto pode aparecer como <b>Your sign-in link</b>.</li>
          <li>Clique no botão/link <b>Sign in</b>.</li>
          <li>Você será redirecionado de volta para o Borion e a última confirmação será aberta automaticamente.</li>
        </ol>
        <p class="delete-email-note">Esse texto aparece em inglês porque o e-mail padrão é do Supabase. O Borion está usando esse link apenas como confirmação de identidade antes da exclusão da conta.</p>
      </div>
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-block" id="del_back">Voltar</button>
        <button class="btn-outline btn-block" id="del_check_email">Já cliquei em Sign in</button>
        <button class="btn btn-danger-solid btn-block" id="del_next">Reenviar e-mail</button>
      </div>`;
  } else if(step==='password2'){
    body = `
      <p class="modal-sub">E-mail confirmado pelo link mágico. Última confirmação: digite o e-mail da conta e a senha novamente. Ao clicar no botão vermelho, a conta será apagada.</p>
      <div class="field"><label>E-mail da conta</label><input type="email" id="del_email_final" autocomplete="email" placeholder="${esc(email)}"></div>
      ${passwordInputWrapHTML({id:'del_password2',label:'Senha novamente',autocomplete:'current-password',placeholder:'Digite sua senha novamente'})}
      <div class="delete-final-warning">Esta é a última etapa. Não existe “desfazer” depois da exclusão.</div>
      <div class="confirm-actions">
        <button class="btn btn-secondary btn-block" id="del_back">Voltar</button>
        <button class="btn btn-danger-solid btn-block" id="del_next">Excluir definitivamente</button>
      </div>`;
  } else if(step==='done'){
    body = `
      <div class="delete-account-success">
        <div class="success-mark">✓</div>
        <h3>Sua conta foi cancelada</h3>
        <p>Todos os dados foram apagados.</p>
        <p>Esperamos vê-lo em breve novamente.</p>
      </div>
      <button class="btn btn-primary btn-block" id="del_finish">Voltar para o login</button>`;
  }

  const box = el(`
    <div class="modal-overlay">
      <div class="modal-box delete-account-modal confirm-box confirm-danger">
        <div class="modal-head"><h2>Excluir conta</h2><button id="del_close">&times;</button></div>
        ${step!=='done'?`<div class="delete-steps">${stepHTML}</div>`:''}
        ${msgHTML}
        <div class="delete-account-body">${body}</div>
      </div>
    </div>`);
  $('#modal-root').innerHTML='';
  $('#modal-root').appendChild(box);
  attachModalGuard(box);
  const closeBtn = $('#del_close'); if(closeBtn) closeBtn.onclick = closeModal;
  const cancelBtn = $('#del_cancel'); if(cancelBtn) cancelBtn.onclick = closeModal;
  const finishBtn = $('#del_finish'); if(finishBtn) finishBtn.onclick = ()=>{ closeModal(); CloudAuth.mode='login'; CloudAuth.info='Sua conta foi cancelada. Todos os dados foram apagados. Esperamos vê-lo em breve novamente.'; CloudAuth.error=''; CloudAuth.emailExpanded=false; CloudAuth.render(); };
  const backBtn = $('#del_back');
  if(backBtn) backBtn.onclick = ()=>{
    st.error=''; st.message='';
    if(step==='password1') st.step='warning';
    else if(step==='emailLink') st.step='password1';
    else if(step==='password2') st.step='emailLink';
    Settings.renderDeleteAccountModal();
  };
  const nextBtn = $('#del_next');
  if(nextBtn) nextBtn.onclick = async ()=>{
    try{
      st.error=''; st.message='';
      if(step==='warning'){
        const word = ($('#del_confirm_word')||{}).value || '';
        if(word.trim().toUpperCase()!=='EXCLUIR') throw new Error('Digite EXCLUIR para liberar a próxima etapa.');
        st.step='password1'; Settings.renderDeleteAccountModal(); return;
      }
      if(step==='password1'){
        const pw = ($('#del_password1')||{}).value || '';
        nextBtn.disabled=true; nextBtn.textContent='Validando...';
        await CloudStorage.verifyAccountPasswordForDeletion(pw);
        if(CloudStorage.isDeleteEmailVerified && CloudStorage.isDeleteEmailVerified()){
          st.step='password2'; st.message='Senha e e-mail confirmados. Faça a última confirmação para excluir a conta.'; Settings.renderDeleteAccountModal(); return;
        }
        await CloudStorage.sendDeleteAccountMagicLink();
        st.step='emailLink'; st.message='Senha confirmada. Enviamos o e-mail de confirmação para '+email+'. Clique em Sign in no e-mail para continuar.'; Settings.renderDeleteAccountModal(); return;
      }
      if(step==='emailLink'){
        nextBtn.disabled=true; nextBtn.textContent='Reenviando...';
        await CloudStorage.sendDeleteAccountMagicLink();
        st.message='E-mail reenviado para '+email+'. Abra o e-mail do Supabase Auth e clique em Sign in.';
        Settings.renderDeleteAccountModal(); return;
      }
      if(step==='password2'){
        const typedEmail = (($('#del_email_final')||{}).value || '').trim();
        const pw2 = ($('#del_password2')||{}).value || '';
        if(!typedEmail) throw new Error('Digite o e-mail da conta.');
        if(!pw2) throw new Error('Digite a senha novamente.');
        nextBtn.disabled=true; nextBtn.textContent='Excluindo...';
        await CloudStorage.deleteAccountWithCredentials(typedEmail, pw2);
        st.step='done'; st.error=''; st.message='';
        Settings.renderDeleteAccountModal();
        return;
      }
    }catch(e){ st.error=translateSupabaseError(e&&e.message?e.message:String(e)); st.message=''; Settings.renderDeleteAccountModal(); }
  };
  const checkEmailBtn = $('#del_check_email');
  if(checkEmailBtn) checkEmailBtn.onclick = ()=>{
    try{
      if(CloudStorage.isDeleteEmailVerified()){
        st.step='password2'; st.error=''; st.message='E-mail confirmado. Faça a última confirmação para excluir a conta.';
      } else {
        throw new Error('Ainda não detectei a confirmação por e-mail. Abra o e-mail do Supabase Auth, clique em Sign in e aguarde voltar para o Borion.');
      }
    }catch(e){ st.error=e&&e.message?e.message:String(e); st.message=''; }
    Settings.renderDeleteAccountModal();
  };
  ['del_confirm_word','del_password1','del_email_final','del_password2'].forEach(id=>{
    const input=document.getElementById(id);
    if(input) input.addEventListener('keydown', e=>{ if(e.key==='Enter'){ const btn=document.getElementById('del_next'); if(btn) btn.click(); } });
  });
};

Settings.resumeDeleteAccountFromMagicLink = function(){
  const cloud = window.CloudStorage;
  if(!cloud || !cloud.user || !cloud.isDeleteEmailVerified || !cloud.isDeleteEmailVerified()) return false;
  const firstPasswordOk = !!(cloud.deleteFirstPasswordVerifiedAt && (Date.now()-cloud.deleteFirstPasswordVerifiedAt) < 30*60*1000);
  Settings._deleteAccountState = {
    email: String(cloud.user.email||'').trim(),
    step: firstPasswordOk ? 'password2' : 'password1',
    busy: false,
    message: firstPasswordOk ? 'E-mail confirmado pelo link mágico. Faça a última confirmação para excluir a conta.' : 'E-mail confirmado pelo link mágico. Por segurança, confirme a senha da conta para continuar.',
    error: ''
  };
  Settings.renderDeleteAccountModal();
  return true;
};

Settings.deleteProfile = function(id){
  const pr=(S.profiles||[]).find(x=>String(x.id)===String(id)); if(!pr) return;
  openConfirmModal({title:'Excluir perfil financeiro', text:`Para excluir "${pr.name}", confirme. Esta ação apaga este perfil e seus dados financeiros na nuvem. Mantenha um backup se precisar.`, confirmLabel:'Excluir perfil', cancelLabel:'Cancelar', variant:'danger', onConfirm: async ()=>{
    try{
      if(window.CloudStorage&&CloudStorage.user){
        await CloudStorage.deleteProfile(id);
        toast('Perfil excluído e confirmado na nuvem.');
        return;
      }
      if(!window.BorionDataActions6401||typeof BorionDataActions6401.deleteProfileAndSync!=='function') throw new Error('O módulo seguro de exclusão de perfil não está disponível.');
      const result=await BorionDataActions6401.deleteProfileAndSync(id,'settings_delete');
      if(!result.deleted) throw new Error('O perfil não foi encontrado para exclusão.');
      if(result.syncResult===true){
        toast('Perfil excluído e sincronizado no Google Drive.');
      }else if(result.syncResult&&result.syncResult.delegated){
        toast('Perfil excluído. A aba principal está enviando a exclusão ao Drive.');
      }else if(window.GoogleDriveProvider&&GoogleDriveProvider.isConnected()){
        toast(navigator.onLine===false?'Perfil excluído neste dispositivo. A exclusão será enviada quando a internet voltar.':'Perfil excluído. A exclusão está pendente de confirmação no Drive.');
      }else{
        toast('Perfil excluído deste dispositivo.');
      }
    }catch(e){ alert(e.message||String(e)); }
  }});
};
Settings.exportProfile = async function(){
  if(!S.currentProfile && !(S.profiles||[]).length){ alert('Entre em um perfil antes de exportar.'); return; }
  try{
    const payload = (typeof buildCloudAccountBackupPayload==='function') ? await buildCloudAccountBackupPayload('manual','exportação manual JSON completa') : await buildLocalAccountBackupPayload('manual','exportação manual JSON completa');
    downloadJSON(payload, `borion-conta-completa-${dateSlug()}.json`);
    toast('Backup completo exportado com todos os perfis da conta.');
  }catch(e){ alert(e.message||String(e)); }
};
/* V6.3.0 — mesmo caminho do botão "Entrar com uma conta na nuvem" do Gate, só que
   acessível de dentro do app (tela Configurações), pra quem está no modo local e
   decide, depois de já estar usando o Borion, que quer conta na nuvem. */
Settings.switchToCloudFromSettings = function(){
  setStorageMode('cloud');
  if(window.CloudAuth){ CloudAuth.mode='login'; CloudAuth.error=''; CloudAuth.info=''; CloudAuth.emailExpanded=false; CloudAuth.render(); }
};
Settings.emailBackup = function(){
  Settings.exportProfile();
  const p=S.currentProfile||{};
  const subject=encodeURIComponent('Backup completo - '+APP_NAME);
  const body=encodeURIComponent('Olá,\n\nSegue em anexo o backup completo do '+APP_NAME+'.\nO arquivo JSON foi baixado/salvo agora e contém todos os perfis da conta; anexe-o a este e-mail antes de enviar.\n\n');
  setTimeout(()=>{ window.location.href=`mailto:${p.email||''}?subject=${subject}&body=${body}`; },500);
};

/* ---------- V5.35.1: ações da tela Backups/Supabase ---------- */
Settings.showBackupConsent = function(){
  if(!window.BackupFS){ alert('Módulo de backup não carregou.'); return; }
  BackupFS.showConsentModal();
};
Settings.createCloudBackupNow = async function(type='manual', reason='backup manual'){
  try{
    if(!window.BackupFS) throw new Error('Módulo de backup não carregou.');
    const row = await BackupFS.createCloudBackup(type, reason);
    toast('Backup salvo no Supabase: borion_backups.');
    console.log('[BORION_BACKUP][MANUAL_UI][SUCCESS]', row);
  }catch(e){
    alert((e&&e.message?e.message:String(e))+'\n\nSe aparecer erro de tabela ou coluna, revise a configuração do Supabase usada pelo login antigo por e-mail.');
  }
};
/* V6.3.0 — mesma ideia do viewCloudBackups logo abaixo, só que lendo do histórico
   100% local (storageProvider/IndexedDB) — funciona sem Supabase e sem internet. */
Settings.viewLocalBackups = async function(){
  try{
    if(!window.storageProvider) throw new Error('Módulo de armazenamento não carregou.');
    const rows = await storageProvider.listBackups();
    const reasonLabels = {manual:'Manual', before_import:'Antes de importar', before_restore:'Antes de restaurar', before_schema_migration:'Antes de atualização', auto:'Automático'};
    const html = rows.length ? rows.map(r=>{
      const when = r.createdAt ? new Date(r.createdAt).toLocaleString('pt-BR') : '-';
      const reason = esc(reasonLabels[r.reasonType] || r.reasonType || 'backup');
      return `<div class="backup-vault-row">
        <div class="backup-vault-main"><b>${reason}</b><span>${esc(when)} · ${Number(r.profileCount||0)} perfil(is) · ${esc(r.appVersion||'')}</span></div>
        <div class="backup-vault-actions"><button class="btn-outline btn-sm" onclick="Settings.downloadLocalBackup('${r.id}')">Baixar</button><button class="btn-outline btn-sm" onclick="Settings.restoreLocalBackup('${r.id}')">Restaurar</button></div>
      </div>`;
    }).join('') : `<div class="info-box">Nenhum backup local ainda. Clique em "Criar backup agora".</div>`;
    const box = el(`
      <div class="modal-overlay">
        <div class="modal-box backup-vault-modal">
          <div class="modal-head"><h2>Backups neste dispositivo</h2><button id="lbv_close">&times;</button></div>
          <p class="modal-sub">Guardados só no navegador (IndexedDB), sem depender do Supabase. Backups manuais e "antes de importar/restaurar" nunca são apagados sozinhos; automáticos ficam limitados aos últimos 50.</p>
          <div class="backup-vault-list">${html}</div>
          <div class="row-btns" style="margin-top:12px;"><button class="btn btn-primary btn-block" id="lbv_new">Criar backup agora</button></div>
        </div>
      </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#lbv_close').onclick=closeModal;
    $('#lbv_new').onclick=async()=>{ try{ await storageProvider.createBackup('manual'); closeModal(); Settings.viewLocalBackups(); }catch(e){ alert(e.message||String(e)); } };
  }catch(e){ alert(e.message||String(e)); }
};
Settings.downloadLocalBackup = async function(id){
  try{
    const entry = await localBackupsGet(id);
    if(!entry) throw new Error('Backup não encontrado.');
    downloadJSON(entry.payload, `borion-backup-local-${dateSlug()}.json`);
  }catch(e){ alert(e.message||String(e)); }
};
Settings.restoreLocalBackup = function(id){
  openConfirmModal({
    title:'Restaurar backup local',
    text:'Você vai substituir os dados atuais pelo backup selecionado. O Borion cria um backup de segurança do estado atual antes de restaurar.',
    confirmLabel:'Restaurar',
    cancelLabel:'Cancelar',
    variant:'danger',
    onConfirm: async ()=>{
      try{ await storageProvider.restoreBackup(id); closeModal(); toast('Backup local restaurado.'); }
      catch(e){ alert(e.message||String(e)); }
    }
  });
};

/* V6.5.0 — mesma ideia do viewLocalBackups, lendo da pasta "backups" dentro da pasta
   do Google Drive em vez do IndexedDB local. */
Settings.viewDriveBackups = async function(){
  try{
    if(!window.GoogleDriveProvider || !GoogleDriveProvider.isConnected()) throw new Error('Google Drive não está conectado.');
    const rows = await GoogleDriveProvider.listBackups();
    const html = rows.length ? rows.map(r=>{
      const when = r.modifiedTime ? new Date(r.modifiedTime).toLocaleString('pt-BR') : '-';
      return `<div class="backup-vault-row">
        <div class="backup-vault-main"><b>${esc(r.name)}</b><span>${esc(when)}</span></div>
        <div class="backup-vault-actions"><button class="btn-outline btn-sm" onclick="Settings.restoreDriveBackup('${r.id}')">Restaurar</button></div>
      </div>`;
    }).join('') : `<div class="info-box">Nenhum backup no Drive ainda. Clique em "Criar backup agora".</div>`;
    const box = el(`
      <div class="modal-overlay">
        <div class="modal-box backup-vault-modal">
          <div class="modal-head"><h2>Backups no Google Drive</h2><button id="dbv_close">&times;</button></div>
          <p class="modal-sub">Guardados na pasta "backups", dentro da sua pasta do Drive.</p>
          <div class="backup-vault-list">${html}</div>
          <div class="row-btns" style="margin-top:12px;"><button class="btn btn-primary btn-block" id="dbv_new">Criar backup agora</button></div>
        </div>
      </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#dbv_close').onclick=closeModal;
    $('#dbv_new').onclick=async()=>{ try{ await GoogleDriveProvider.createBackup('manual'); closeModal(); toast('Backup criado no Drive.'); Settings.viewDriveBackups(); }catch(e){ alert(e.message||String(e)); } };
  }catch(e){ alert(e.message||String(e)); }
};
Settings.restoreDriveBackup = function(fileId){
  openConfirmModal({
    title:'Restaurar backup do Google Drive',
    text:'Você vai substituir os dados atuais pelo backup selecionado. O Borion cria um backup de segurança do estado atual antes de restaurar.',
    confirmLabel:'Restaurar',
    cancelLabel:'Cancelar',
    variant:'danger',
    onConfirm: async ()=>{
      try{ await GoogleDriveProvider.restoreBackup(fileId); closeModal(); toast('Backup restaurado.'); renderGate(); }
      catch(e){ alert(e.message||String(e)); }
    }
  });
};

Settings.backupSingleProfile = async function(profileId){
  const pr = (S.profiles||[]).find(x=>x.id===profileId);
  if(!pr){ alert('Perfil não encontrado.'); return; }
  try{
    if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected()){
      const r = await GoogleDriveProvider.exportSingleProfileToDrive(profileId);
      toast('Backup de "'+pr.name+'" salvo no Drive ('+r.name+').');
    } else {
      let data = (S.currentProfile && S.currentProfile.id===profileId && S.data) ? S.data : getProfileData(profileId);
      data = migrateData(data || emptyData(), {profileId});
      const payload = {type:'multicap-profile-backup', version:2, exportedAt:new Date().toISOString(), profile:{id:pr.id,name:pr.name,email:pr.email,passwordHash:pr.passwordHash,salt:pr.salt,avatarColor:pr.avatarColor,avatarImage:pr.avatarImage}, data};
      downloadJSON(payload, `perfil-${slug(pr.name)}-${dateSlug()}.json`);
      toast('Backup de "'+pr.name+'" baixado.');
    }
  }catch(e){ alert(e.message||String(e)); }
};

Settings.viewCloudBackups = async function(){
  try{
    if(!window.BackupFS) throw new Error('Módulo de backup não carregou.');
    const rows = await BackupFS.listCloudBackups();
    const html = rows.length ? rows.map(r=>{
      const when = r.created_at ? new Date(r.created_at).toLocaleString('pt-BR') : '-';
      const reason = r.reason ? esc(r.reason) : 'sem observação';
      return `<div class="backup-vault-row">
        <div class="backup-vault-main"><b>${esc(r.backup_type||'backup')}</b><span>${esc(when)} · ${Number(r.profile_count||0)} perfil(is) · ${esc(r.app_version||'')}</span><em>${reason}</em></div>
        <div class="backup-vault-actions"><button class="btn-outline btn-sm" onclick="BackupFS.downloadCloudBackup('${r.id}')">Baixar</button><button class="btn-outline btn-sm" onclick="BackupFS.restoreCloudBackup('${r.id}')">Restaurar</button></div>
      </div>`;
    }).join('') : `<div class="info-box">Nenhum backup salvo ainda. Clique em “Salvar snapshot no Supabase”.</div>`;
    const box = el(`
      <div class="modal-overlay">
        <div class="modal-box backup-vault-modal">
          <div class="modal-head"><h2>Backups salvos no Supabase</h2><button id="bv_close">&times;</button></div>
          <p class="modal-sub">Local técnico: Supabase → Table Editor → <b>borion_backups</b>. São exibidos os últimos 30 snapshots desta conta.</p>
          <div class="backup-vault-list">${html}</div>
          <div class="row-btns" style="margin-top:12px;"><button class="btn btn-primary btn-block" id="bv_new">Criar backup agora</button></div>
        </div>
      </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#bv_close').onclick=closeModal;
    $('#bv_new').onclick=async()=>{ try{ await BackupFS.createCloudBackup('manual','backup criado pela lista de backups'); closeModal(); Settings.viewCloudBackups(); }catch(e){ alert(e.message||String(e)); } };
  }catch(e){ alert(e.message||String(e)); }
};


/* V6.24.6 — expõe a rotina central de backup para Ctrl+S e o atalho fixo do Modo Pro.
   O objeto era declarado com const e, por isso, não existia em window.Settings. */
window.Settings = Settings;


/* ================= V6.33.1 — refinamento extra de Configurações, padronização de ordenação
   e bloco flutuante de Anotações persistente entre abas ================= */
(function(){
  const SETTINGS_VERSION = '6.45.5';

  function floatingNotesPrefs(create=false){
    const fallback={enabled:false,text:'',minimized:true,side:'right',y:null,panelW:360,panelH:380};
    if(typeof S==='undefined' || !S.data) return fallback;
    if(create){
      if(!S.data.uiPreferences) S.data.uiPreferences = {};
      if(!S.data.uiPreferences.floatingNotes || typeof S.data.uiPreferences.floatingNotes!=='object'){
        S.data.uiPreferences.floatingNotes = {enabled:false,text:'',minimized:true,side:'right',y:null,panelW:360,panelH:380};
      }
      const p=S.data.uiPreferences.floatingNotes;
      if(typeof p.enabled!=='boolean') p.enabled=false;
      if(typeof p.text!=='string') p.text='';
      if(typeof p.minimized!=='boolean') p.minimized=true;
      /* V6.33.3 — migra a antiga posição livre (x/y solto na tela) para o novo modelo
         "encostado na borda esquerda ou direita", igual ao botão de atalho flutuante do
         iPhone: a bolinha nunca fica solta no meio da tela, só sobe/desce colada na lateral. */
      if(p.side!=='left' && p.side!=='right'){
        p.side = (typeof p.x==='number' && typeof window!=='undefined' && (p.x + 30) < (window.innerWidth/2)) ? 'left' : 'right';
      }
      if(typeof p.y!=='number') p.y=null;
      if(typeof p.panelW!=='number' || p.panelW<200) p.panelW=360;
      if(typeof p.panelH!=='number' || p.panelH<180) p.panelH=380;
      delete p.x; // não é mais usado — a posição horizontal agora é sempre "encostada" em um dos lados
    }
    return (S.data.uiPreferences && S.data.uiPreferences.floatingNotes) || fallback;
  }

  function syncIconSVG(){
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 0 0-15.5-6.36"/><path d="M3 4v5h5"/><path d="M3 12a9 9 0 0 0 15.5 6.36"/><path d="M21 20v-5h-5"/></svg>`;
  }
  function notesIconSVG(){
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14l4-3h8a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 10h6"/><path d="M9 13h6"/></svg>`;
  }
  function resizeGripIconSVG(){
    return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><circle cx="18" cy="6" r="1.6"/><circle cx="18" cy="12" r="1.6"/><circle cx="18" cy="18" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="6" cy="18" r="1.6"/></svg>`;
  }
  function phoneIconSVG(){
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2.5" width="10" height="19" rx="2.3"/><path d="M11 18.5h2"/></svg>`;
  }
  function sparklesIconSVG(){
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8z"/><path d="M19 14l.9 2.1L22 17l-2.1.9L19 20l-.9-2.1L16 17l2.1-.9z"/><path d="M5 14l.7 1.6L7.3 16l-1.6.7L5 18.3l-.7-1.6L2.7 16l1.6-.7z"/></svg>`;
  }
  function monitorIconSVG(){
    return `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8"/><path d="M12 16v4"/></svg>`;
  }

  const originalSettingsTabButton = settingsTabButton;
  renderSettings = function(){
    if(!S.settingsTab) S.settingsTab='modules';
    if(S.settingsTab==='cloud') S.settingsTab='backup';
    const tabs = `
      <div class="settings-tabs">
        ${originalSettingsTabButton('modules','Módulos')}
        ${originalSettingsTabButton('dashboard','Dashboard')}
        ${originalSettingsTabButton('profiles','Perfis')}
        ${originalSettingsTabButton('categories','Categorias')}
        ${originalSettingsTabButton('personalization','Personalização')}
        ${originalSettingsTabButton('backup','Backups')}
        ${originalSettingsTabButton('integrations','Integrações')}
        <button class="settings-tab settings-help-tab ${S.settingsTab==='help'?'active':''}" onclick="HelpCenterLoader.open()" title="Abrir a Central do Borion"><span class="settings-help-icon">?</span><span>Central do Borion</span></button>
        <button id="qb_both" class="btn btn-primary btn-sm settings-quick-backup-btn" onclick="Settings.quickBackupBoth()" title="Cria um backup agora e salva ao mesmo tempo no Google Drive e neste dispositivo">SALVAR DRIVE&amp;LOCAL</button>
      </div>`;
    let content='';
    if(S.settingsTab==='modules') content = renderSettingsModules();
    else if(S.settingsTab==='dashboard') content = renderSettingsDashboard();
    else if(S.settingsTab==='profiles') content = renderSettingsProfiles();
    else if(S.settingsTab==='categories') content = renderSettingsCategories();
    else if(S.settingsTab==='personalization') content = renderSettingsPersonalization();
    else if(S.settingsTab==='backup') content = renderSettingsBackup();
    else if(S.settingsTab==='integrations') content = window.BorionInterop ? BorionInterop.renderSettings() : '<div class="settings-section">Integração indisponível.</div>';
    else if(S.settingsTab==='help') content = window.BorionHelp ? BorionHelp.render() : HelpCenterLoader.placeholder();
    return `<div class="settings-layout">${tabs}<div class="settings-content">${content}</div><div class="version-tag">V. ${SETTINGS_VERSION} • Importação JSON Suprema</div><footer class="app-release-footer" aria-label="Informações do Borion">
<div><strong>Versão:</strong> ${SETTINGS_VERSION}</div>
<div><strong>Lançamento:</strong> 20/07/2026</div>
<div>Desenvolvido por <strong>Pedro Bardella</strong></div>
<div>© 2026 Pedro Bardella. Todos os direitos reservados.</div>
</footer></div>`;
  };

  Settings.setInterfaceMode = function(mode){
    const next=['auto','smartphone','pro'].includes(mode)?mode:'auto';
    S.config.uiMode = next;
    setConfig(S.config);
    applyInterfaceMode();
    renderApp();
    toast(next==='auto' ? 'Modo Automático ativado.' : (next==='smartphone' ? 'Smartphone Mode ativado.' : 'Modo Pro ativado.'));
  };
  Settings.toggleFloatingNotes = function(){
    const p=floatingNotesPrefs(true);
    p.enabled = !(p.enabled===true);
    if(p.enabled) p.minimized=true;
    saveCurrentData();
    renderView();
    setTimeout(()=>window.FloatingNotes&&FloatingNotes.render(),10);
    toast(p.enabled?'Anotações ativadas.':'Anotações desativadas.');
  };
  Settings.toggleSummaryOrganize = function(){ Settings._summaryOrganizeActive = !Settings._summaryOrganizeActive; renderView(); };
  Settings.moveBudgetSummaryCardAction = function(key, action){
    const p = budgetSummaryPreferences();
    const idx = p.order.indexOf(key);
    if(idx<0) return;
    let to = idx;
    if(action==='top') to = 0;
    else if(action==='up') to = Math.max(0, idx-1);
    else if(action==='down') to = Math.min(p.order.length-1, idx+1);
    else if(action==='bottom') to = p.order.length-1;
    if(to===idx) return;
    p.order.splice(idx,1);
    p.order.splice(to,0,key);
    saveCurrentData();
    renderView();
  };
  Settings.toggleBudgetSummaryCard = function(key,checked){
    const p=budgetSummaryPreferences();
    p.visible=p.visible.filter(k=>k!==key);
    if(checked) p.visible.push(key);
    saveCurrentData();
    renderView();
  };
  Settings.summaryDrop = function(ev,target){
    ev.preventDefault();
    const source=Settings._summaryDragKey||(ev.dataTransfer&&ev.dataTransfer.getData('text/plain'));
    if(!source||source===target) return;
    const p=budgetSummaryPreferences(), from=p.order.indexOf(source), to=p.order.indexOf(target);
    if(from<0||to<0) return;
    p.order.splice(from,1); p.order.splice(to,0,source); Settings._summaryDragKey=null; saveCurrentData(); renderView();
  };

  function summaryOrderControlsHTML(key,label){
    return `<div class="order-controls summary-order-controls">
      <span class="order-arrow-group">
        <button type="button" class="order-arrow-btn" onclick="Settings.moveBudgetSummaryCardAction('${key}','top')" title="Mover ${esc(label)} para o início" aria-label="Mover ${esc(label)} para o início">⤒</button>
        <button type="button" class="order-arrow-btn" onclick="Settings.moveBudgetSummaryCardAction('${key}','up')" title="Mover ${esc(label)} para cima" aria-label="Mover ${esc(label)} para cima">▲</button>
        <button type="button" class="order-arrow-btn" onclick="Settings.moveBudgetSummaryCardAction('${key}','down')" title="Mover ${esc(label)} para baixo" aria-label="Mover ${esc(label)} para baixo">▼</button>
        <button type="button" class="order-arrow-btn" onclick="Settings.moveBudgetSummaryCardAction('${key}','bottom')" title="Mover ${esc(label)} para o final" aria-label="Mover ${esc(label)} para o final">⤓</button>
      </span>
      <button type="button" class="order-handle" title="Arrastar ${esc(label)} para reordenar" aria-label="Arrastar ${esc(label)} para reordenar">${window.OrderPreferences?OrderPreferences.handleSVG():`☰`}</button>
    </div>`;
  }
  function summaryOrderLegend(){
    return `<div class="order-option-legend">
      <div class="order-option-chip"><span class="order-option-ic">⤒</span><span>Mover para o início</span></div>
      <div class="order-option-chip"><span class="order-option-ic">▲</span><span>Mover para cima</span></div>
      <div class="order-option-chip"><span class="order-option-ic">▼</span><span>Mover para baixo</span></div>
      <div class="order-option-chip"><span class="order-option-ic">⤓</span><span>Mover para o final</span></div>
      <div class="order-option-chip"><span class="order-option-ic">${window.OrderPreferences?OrderPreferences.handleSVG():'☰'}</span><span>Arrastar para reordenar</span></div>
    </div>`;
  }
  renderBudgetSummaryPersonalization = function(){
    if(typeof budgetSummaryPreferences!=='function') return '';
    const pref=budgetSummaryPreferences();
    const active=!!Settings._summaryOrganizeActive;
    const rows=pref.order.map((k)=>{
      const d=BUDGET_SUMMARY_CARD_DEFS[k];
      if(!d) return '';
      const checked=pref.visible.includes(k);
      return `<div class="order-row summary-order-row" draggable="true" data-summary-key="${k}" ondragstart="Settings.summaryDragStart(event,'${k}')" ondragover="event.preventDefault()" ondrop="Settings.summaryDrop(event,'${k}')">
        <div class="order-row-main">
          <span class="order-row-status ${checked?'on':'off'}">${checked?'Visível':'Oculto'}</span>
          <span class="order-row-label">${esc(d.label)}</span>
          <label class="summary-inline-check"><input type="checkbox" ${checked?'checked':''} onchange="Settings.toggleBudgetSummaryCard('${k}',this.checked)"> Exibir</label>
        </div>
        ${active ? summaryOrderControlsHTML(k,d.label) : ''}
      </div>`;
    }).join('');
    return `<div class="settings-section settings-hero-section order-organize-section">
      <div class="order-organize-head">
        <div>
          <h3>Resumo de Lançamentos</h3>
          <p class="desc">Escolha quais indicadores aparecem no topo de Lançamentos e padronize a ordem com o mesmo sistema usado em Organizar módulos e itens.</p>
        </div>
        <button class="toggle-switch ${active?'on':''}" onclick="Settings.toggleSummaryOrganize()" aria-label="${active?'Desativar':'Ativar'} organização do Resumo de Lançamentos"><span></span></button>
      </div>
      ${active?'<div class="order-active-hint">Modo de organização ativo. As opções seguem exatamente a mesma ordem do resto do Borion: mover para o início, mover para cima, mover para baixo, mover para o final e arrastar para reordenar.</div>':''}
      <div class="order-list" style="margin-top:12px;">${rows}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;"><button class="btn-outline btn-sm" onclick="Settings.resetBudgetSummaryCards()">Restaurar padrão</button></div>
    </div>`;
  };

  const originalRenderModulesOrganizePanel = window.OrderPreferences && OrderPreferences.renderModulesOrganizePanel ? OrderPreferences.renderModulesOrganizePanel.bind(OrderPreferences) : null;
  if(window.OrderPreferences){
    OrderPreferences.reorderRowControlsHTML = function(type, id, label, naturalIds){
      const idsAttr = esc((naturalIds||[]).join(','));
      const safeId = esc(String(id));
      const safeLabel = esc(label||'item');
      return `<div class="order-controls" data-order-type="${esc(type)}">
        <span class="order-arrow-group">
          <button type="button" class="order-arrow-btn" data-order-action="top" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover ${safeLabel} para o início" aria-label="Mover ${safeLabel} para o início">⤒</button>
          <button type="button" class="order-arrow-btn" data-order-action="up" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover ${safeLabel} para cima" aria-label="Mover ${safeLabel} para cima">▲</button>
          <button type="button" class="order-arrow-btn" data-order-action="down" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover ${safeLabel} para baixo" aria-label="Mover ${safeLabel} para baixo">▼</button>
          <button type="button" class="order-arrow-btn" data-order-action="bottom" data-order-type="${esc(type)}" data-order-id="${safeId}" data-order-ids="${idsAttr}" title="Mover ${safeLabel} para o final" aria-label="Mover ${safeLabel} para o final">⤓</button>
        </span>
        <button type="button" class="order-handle" title="Arrastar ${safeLabel} para reordenar" aria-label="Arrastar ${safeLabel} para reordenar">${this.handleSVG()}</button>
      </div>`;
    };
    OrderPreferences.renderModulesOrganizePanel = function(){
      const active=this.active&&(!this.activeType||this.activeType==='modules');
      const navList = (typeof NAV!=='undefined') ? NAV : [];
      const ordered = this.applyOrder('modules', navList, {idKey:'key', labelKey:'label'});
      const naturalIds = ordered.map(n=>n.key);
      const enabledKeys = (typeof getNavItems==='function') ? new Set(getNavItems().map(x=>x.key)) : new Set(navList.map(n=>n.key));
      const rows = ordered.map(n=>{
        const isEnabled = enabledKeys.has(n.key);
        return `<div class="order-row module-order-row" data-order-id="${esc(n.key)}">
          <div class="order-row-main">
            <span class="order-row-status ${isEnabled?'on':'off'}">${isEnabled?'Ativo':'Desativado'}</span>
            <span class="order-row-label">${esc(n.label)}</span>
          </div>
          ${active ? this.reorderRowControlsHTML('modules', n.key, n.label, naturalIds) : ''}
        </div>`;
      }).join('');
      return `
        <div class="settings-section settings-hero-section order-organize-section">
          <div class="order-organize-head">
            <div>
              <h3>Organizar módulos e itens</h3>
              <p class="desc">Padronize os movimentos em todas as telas do app. Quando o modo estiver ativo, bancos, cartões, reservas, categorias e módulos usam a mesma lógica e a mesma ordem de ações.</p>
            </div>
            <button class="toggle-switch ${active?'on':''}" onclick="OrderPreferences.setActive(!(${active?'true':'false'}),'modules')" aria-label="${active?'Desativar':'Ativar'} modo de organização"><span></span></button>
          </div>
          ${active?`<div class="order-active-hint">Modo de organização ativo. O padrão está alinhado em todo o Borion: mover para o início, mover para cima, mover para baixo, mover para o final e arrastar para reordenar.</div>`:''}
          <div class="order-list" data-order-list="modules">${rows}</div>
          ${active?'<p class="desc" style="margin-top:10px;">Um módulo desativado continua aqui para você reorganizar; quando reativado, ele volta na posição definida.</p>':''}
        </div>`;
    };
  }

  renderSettingsPersonalization = function(){
    const fontOptions = Object.keys(FONT_LABELS).map(k=>`<option value="${k}" ${S.config.font===k?'selected':''}>${esc(FONT_LABELS[k])}</option>`).join('');
    const theme = S.config.theme || 'dark';
    const uiMode = S.config.uiMode || 'auto';
    const notes = floatingNotesPrefs(true);
    return `
      <div class="settings-section settings-hero-section"><h3>Personalização</h3><p class="desc">Ajustes visuais, organização da experiência e novos recursos flutuantes para deixar o Borion bonito, útil e prático no dia a dia.</p></div>
      <div class="settings-section settings-feature-card">
        <div class="settings-card-head"><div><h3>ANOTAÇÕES</h3><p class="desc">Ative um bloco de notas flutuante que fica disponível em Lançamentos, Cartões, Contas, Reservas e nas demais abas do app — podendo continuar aberto ou minimizado.</p></div><button class="toggle-switch ${notes.enabled?'on':''}" onclick="Settings.toggleFloatingNotes()" aria-label="${notes.enabled?'Desativar':'Ativar'} anotações"><span></span></button></div>
        <div class="settings-mini-status ${notes.enabled?'on':'off'}">${notes.enabled?'Ativado — a bolha de anotações já pode ser aberta no canto da tela.':'Desativado — a área flutuante ficará oculta até você ativar.'}</div>
      </div>
      <div class="settings-section interface-mode-card">
        <h3>Modo de interface</h3>
        <p class="desc">Escolha se quer forçar Smartphone ou Pro. O modo Auto fica separado em um botão próprio, como um atalho rápido.</p>
        <div class="interface-mode-row">
          <div class="interface-segmented" role="group" aria-label="Modo de interface">
            <button class="interface-segment ${uiMode==='smartphone'?'active':''}" onclick="Settings.setInterfaceMode('smartphone')">${phoneIconSVG()}<span>Smartphone</span></button>
            <button class="interface-segment ${uiMode==='pro'?'active':''}" onclick="Settings.setInterfaceMode('pro')"><span class="pro-pill">Pro</span><span>Pro</span></button>
          </div>
          <button class="interface-auto-button ${uiMode==='auto'?'active':''}" onclick="Settings.setInterfaceMode('auto')">${sparklesIconSVG()}<span>Auto</span></button>
        </div>
        <div class="interface-mode-footnote">No Automático, celulares usam o Smartphone Mode e computadores usam o Modo Pro completo.</div>
      </div>
      <div class="settings-section"><h3>Tema</h3><p class="desc">Use o tema private banking escuro, o tema claro ou siga o tema do sistema.</p><div class="field" style="max-width:320px;"><select id="cfg_theme"><option value="dark" ${theme==='dark'?'selected':''}>Escuro / Private banking</option><option value="light" ${theme==='light'?'selected':''}>Claro / Branco</option><option value="system" ${theme==='system'?'selected':''}>Tema do sistema</option></select></div></div>
      <div class="settings-section"><h3>Fonte do app</h3><p class="desc">Escolha a fonte usada em todo o app.</p><div class="field" style="max-width:320px;"><select id="cfg_font">${fontOptions}</select></div></div>
      ${renderBudgetSummaryPersonalization()}
      ${window.OrderPreferences ? OrderPreferences.renderModulesOrganizePanel() : ''}
      <div class="info-box">As opções de ordenação foram padronizadas no app inteiro para evitar confusão entre telas.</div>`;
  };

  renderSettingsBackup = function(){
    const cloud = window.CloudStorage;
    const user = cloud && cloud.user;
    const isDrive = !user && window.GoogleDriveProvider && GoogleDriveProvider.isConnected();
    const isLocal = !user && !isDrive;

    function importBtn(){ return `<button class="btn-outline btn-sm" onclick="document.getElementById('import_file_cloud').click()">Importar JSON</button><input type="file" id="import_file_cloud" accept="application/json" style="display:none;">`; }
    function exportBtn(){ return `<button class="btn-outline btn-sm" onclick="Settings.exportProfile()">Exportar conta completa</button>`; }
    function syncActionButton(label, onclick, id=''){ return `<button ${id?`id="${id}"`:''} class="btn btn-primary btn-sm sync-action-btn" onclick="${onclick}">${syncIconSVG()}<span>${label}</span></button>`; }
    const localBackupsBlock = `
      <div class="settings-section backup-card-compact">
        <h3>Backups neste dispositivo</h3>
        <p class="desc">Histórico local do navegador (IndexedDB). Se uma pasta estiver conectada, o mesmo backup também grava um JSON em <b>Backups_Borion</b>.</p>
        <div class="backup-action-row"><button class="btn-outline btn-sm" onclick="Settings.viewLocalBackups()">Ver backups deste dispositivo</button><button id="qb_local" class="btn-outline btn-sm" onclick="Settings.quickBackupLocal()">Criar backup agora</button></div>
      </div>`;

    let backupFolderBlock='';
    if(!FS_ACCESS_SUPPORTED) backupFolderBlock = `<div class="info-box">Este navegador não permite escolher uma pasta fixa pra backup automático.</div>`;
    else if(BackupFS.needsReconnect) backupFolderBlock = `<div class="reconnect-banner"><span>A pasta de backups precisa ser reautorizada após reabrir o app.</span><button class="btn-outline btn-sm" onclick="BackupFS.reconnect()">Reconectar pasta</button></div>`;
    else if(BackupFS.dirHandle) backupFolderBlock = `<div class="gold-box">Pasta local configurada. O Borion salva arquivos dentro da subpasta <b>Backups_Borion</b>.</div><div class="backup-action-row" style="margin-top:10px;"><button class="btn-outline btn-sm" onclick="BackupFS.choose()">Trocar pasta</button><button class="btn-outline btn-sm" onclick="BackupFS.disconnect()">Desconectar pasta</button></div>`;
    else backupFolderBlock = `<p class="desc">Escolha uma pasta local (como uma pasta sincronizada com Google Drive ou OneDrive) para criar uma cópia extra dos backups.</p><button class="btn-outline btn-sm" onclick="BackupFS.choose()">Escolher pasta de backups</button>`;
    const folderSection = `<div class="settings-section backup-card-compact"><h3>Pasta local extra</h3>${backupFolderBlock}</div>`;

    if(isDrive){
      const gs = GoogleDriveProvider.getStatus();
      const conflictBanner = gs.conflict ? `<div class="info-box danger-box"><b>Atenção:</b> Existe uma versão mais recente desta conta salva no Google Drive. Você pode recarregar a versão do Drive ou usar o salvamento manual para manter a versão atual deste dispositivo.</div>` : '';
      return `
      <div class="settings-section settings-hero-section"><h3>Backup e dados</h3><p class="desc">Sincronização com o Google Drive, exportação, importação e histórico de segurança da sua conta.</p></div>
      ${conflictBanner}
      <div class="settings-section backup-highlight-card">
        <div class="settings-card-head"><div><h3>Sincronização com Google Drive</h3><p class="desc"><strong>Conta:</strong> ${esc(gs.email||'')}<br><strong>Pasta:</strong> ${esc(gs.folderName||'(não identificada)')} ${gs.folderLink?`<a href="${esc(gs.folderLink)}" target="_blank" rel="noopener">Abrir no Drive ↗</a>`:''}<br><strong>Status:</strong> ${gs.conflict?'Conflito — veja o aviso acima':gs.lastSyncError?(gs.authRequired?'Reconexão necessária':'Falha de sincronização'):gs.pending?'Salvando alterações...':'Tudo sincronizado'}${gs.lastSyncError?`<br><strong>Erro:</strong> ${esc(gs.lastSyncError)}`:''}${gs.lastSyncAt?`<br><strong>Última confirmação:</strong> ${esc(new Date(gs.lastSyncAt).toLocaleString('pt-BR'))}`:''}<br><strong>Perfil ativo:</strong> ${esc(S.currentProfile?S.currentProfile.name:'Nenhum')}</p></div></div>
        <div class="backup-action-row">${syncActionButton('Sincronizar agora','GoogleDriveProvider.syncNow()')} ${exportBtn()} ${importBtn()} <button class="btn-outline btn-sm" onclick="Settings.viewDriveBackups()">Ver backups no Drive</button><button id="qb_drive" class="btn-outline btn-sm" onclick="Settings.quickBackupDrive()">Criar backup agora</button><button class="btn-outline btn-sm" onclick="GoogleDriveProvider.disconnect();S.currentProfile=null;S.data=null;CloudAuth.mode='login';CloudAuth.error='';CloudAuth.info='';CloudAuth.emailExpanded=false;CloudAuth.render();">Sair da conta Google</button></div>
      </div>
      ${localBackupsBlock}
      ${folderSection}
      <div class="info-box">Se a internet cair, o Borion continua salvando neste dispositivo e envia pro Drive quando a conexão voltar.</div>`;
    }

    if(isLocal){
      const st = (window.storageProvider ? storageProvider.getStorageStatus() : {profileCount:(S.profiles||[]).length, online:navigator.onLine});
      return `
      <div class="settings-section settings-hero-section"><h3>Backup e dados</h3><p class="desc">Você está usando o Borion sem conta — os dados ficam somente neste dispositivo, mas continuam podendo ser exportados, importados e salvos localmente.</p></div>
      <div class="settings-section backup-highlight-card">
        <div class="settings-card-head"><div><h3>Status local</h3><p class="desc"><strong>Modo:</strong> Local (sem conta)<br><strong>Perfis neste dispositivo:</strong> ${st.profileCount||0}<br><strong>Perfil ativo:</strong> ${esc(S.currentProfile?S.currentProfile.name:'Nenhum')}<br><strong>Conexão:</strong> ${st.online?'Online':'Offline'}</p></div></div>
        <div class="backup-action-row">${exportBtn()} ${importBtn()} <button class="btn-outline btn-sm" onclick="Settings.switchToCloudFromSettings()">Entrar com uma conta na nuvem</button></div>
      </div>
      ${localBackupsBlock}
      ${folderSection}
      <div class="info-box">Entrar com uma conta permite sincronizar entre celular e computador. Seus perfis locais continuam preservados.</div>
      ${renderInstallAppCard()}`;
    }

    const pending = cloud && cloud.pendingInfo ? cloud.pendingInfo() : null;
    const last = cloud && cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleString('pt-BR') : 'Ainda não sincronizou nesta sessão';
    const status = cloud ? (cloud.statusLabel ? cloud.statusLabel() : (cloud.statusText || cloud.status || 'Indisponível')) : 'Módulo de nuvem não carregado';
    const pendingTxt = pending ? `Existe sincronização pendente desde ${new Date(pending.savedAt).toLocaleString('pt-BR')}. Motivo: ${esc(pending.reason||'pendente')}` : 'Nenhum dado pendente no cache local.';
    const profileName = S.currentProfile ? S.currentProfile.name : 'Nenhum perfil ativo';
    const schema = cloud && cloud.schemaError ? `<div class="info-box danger-box"><b>Atenção:</b> ${esc(cloud.schemaError)}<br>Verifique a configuração das tabelas do Supabase antes de usar o login antigo por e-mail.</div>` : '';
    const consent = window.BackupFS ? BackupFS.hasConsent() : null;
    const consentText = consent ? `Aceito em ${new Date(consent.acceptedAt).toLocaleString('pt-BR')} · modo: ${esc(consent.mode||'backup')}` : 'Ainda não configurado neste dispositivo.';
    return `
      <div class="settings-section settings-hero-section"><h3>Backup e dados</h3><p class="desc">Sincronização, proteção de dados, importação e exportação centralizadas em um único lugar.</p></div>
      ${schema}
      <div class="settings-section backup-highlight-card">
        <div class="settings-card-head"><div><h3>Status da nuvem</h3><p class="desc"><strong>Usuário logado:</strong> ${user?esc(user.email||'logado'):'não logado'}<br><strong>Perfil financeiro ativo:</strong> ${esc(profileName)}<br><strong>Status:</strong> ${esc(status)}<br><strong>Última sincronização:</strong> ${esc(last)}<br><strong>Dados pendentes:</strong> ${pendingTxt}</p></div></div>
        <div class="backup-action-row">${syncActionButton('Sincronizar agora','cloudForceSync()')} <button class="btn-outline btn-sm" onclick="cloudRunSupabaseDiagnostic()">Diagnóstico Supabase</button> ${exportBtn()} ${importBtn()} <button class="btn-outline btn-sm" onclick="cloudChangePasswordFromSettings()">Trocar senha da conta/login</button>${user?`<button class="btn-outline btn-sm" onclick="Settings.deleteCloudAccountFlow()">Excluir conta</button>`:''}<button class="btn-outline btn-sm" onclick="cloudLogout()">Sair da conta</button></div>
      </div>
      <div class="settings-section backup-card-compact"><h3>Aceite de proteção de dados</h3><p class="desc"><strong>Status:</strong> ${consentText}</p><div class="backup-action-row"><button class="btn-outline btn-sm" onclick="Settings.showBackupConsent()">Ver termo / configurar proteção</button><button class="btn-outline btn-sm" onclick="Settings.createCloudBackupNow('first_setup','backup criado manualmente pela tela de segurança')">Criar backup inicial agora</button></div></div>
      <div class="settings-section backup-card-compact"><h3>Backups do Borion Cloud</h3><p class="desc">Cria snapshots completos de todos os perfis da conta.</p><div class="backup-action-row"><button class="btn-outline btn-sm" onclick="Settings.createCloudBackupNow('manual','backup manual completo')">Salvar snapshot no Supabase</button><button class="btn-outline btn-sm" onclick="Settings.viewCloudBackups()">Ver backups do Supabase</button></div></div>
      ${localBackupsBlock}
      ${folderSection}
      <div class="info-box">Fluxo: alteração → salva local/offline → marca pendente → envia ao Supabase → limpa pendência.</div>
      ${user?`<div class="settings-section danger-box"><h3>Excluir conta Borion Cloud</h3><p class="desc">Apaga a conta de login, o e-mail, todos os perfis financeiros e os dados monetários salvos no Supabase.</p><button class="btn btn-danger btn-sm" onclick="Settings.deleteCloudAccountFlow()">Excluir conta</button></div>`:''}
      ${renderInstallAppCard()}`;
  };

  window.FloatingNotes = {
    hostId:'borion_floating_notes_host',
    bubbleSize:60,
    edgeGap:14,
    gap:12,
    saveTimer:null,
    prefs(create=false){ return floatingNotesPrefs(create); },
    /* Reserva espaço para não ficar atrás da barra de abas inferior do Smartphone Mode
       (nem "pra dentro" dela) e respeita a área segura do aparelho. */
    bottomSafeMargin(){
      try{
        const nav=document.querySelector('.smart-bottom-nav');
        if(nav && getComputedStyle(nav).display!=='none') return nav.getBoundingClientRect().height + 18;
      }catch(e){}
      return 18;
    },
    topSafeMargin(){ return 16; },
    clampY(y){
      const vh=window.innerHeight;
      const top=this.topSafeMargin(), bottom=this.bottomSafeMargin();
      const max=Math.max(top, vh - bottom - this.bubbleSize);
      return Math.min(Math.max(Number(y)||0, top), max);
    },
    ensurePrefs(){
      const p=this.prefs(true);
      if(p.side!=='left' && p.side!=='right') p.side='right';
      p.y = (typeof p.y==='number') ? this.clampY(p.y) : this.clampY(window.innerHeight - this.bottomSafeMargin() - this.bubbleSize - 70);
      return p;
    },
    scheduleSave(silent=true){
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(()=>{
        try{ saveCurrentData(); }catch(e){}
        if(!silent && typeof toast==='function') toast('Anotações salvas.');
      }, 260);
    },
    onInput(value){ const p=this.prefs(true); p.text=value||''; this.scheduleSave(true); },
    save(){ this.scheduleSave(false); },
    toggleMinimize(){ const p=this.prefs(true); p.minimized=!p.minimized; saveCurrentData(); this.render(); },
    openFromBubble(){ const p=this.prefs(true); if(p.minimized){ p.minimized=false; saveCurrentData(); } this.render(); },
    close(){ const p=this.prefs(true); p.enabled=false; saveCurrentData(); this.render(); },
    /* Decide se o painel abre para cima ou para baixo da bolinha, e qual o tamanho
       possível, sempre respeitando a viewport — nunca "atravessa" a tela nem invade a
       barra de abas. */
    computeLayout(p){
      const vw=window.innerWidth, vh=window.innerHeight;
      const topSafe=this.topSafeMargin(), bottomSafe=this.bottomSafeMargin();
      const maxW=Math.max(300, Math.min(vw - (this.edgeGap*2) - 4, 720));
      const maxH=Math.max(220, Math.min(vh - topSafe - bottomSafe - this.gap - this.bubbleSize, 800));
      let panelW=Math.min(Math.max(p.panelW||360, 300), maxW);
      let panelH=Math.min(Math.max(p.panelH||380, 220), maxH);
      const spaceBelow = vh - bottomSafe - (p.y + this.bubbleSize) - this.gap;
      const spaceAbove = p.y - topSafe - this.gap;
      let openDown;
      if(panelH <= spaceBelow) openDown=true;
      else if(panelH <= spaceAbove) openDown=false;
      else { openDown = spaceBelow >= spaceAbove; panelH = Math.max(200, openDown ? spaceBelow : spaceAbove); }
      return {panelW, panelH, openDown};
    },
    render(){
      let host=document.getElementById(this.hostId);
      if(typeof S==='undefined' || !S.currentProfile || !S.data) { if(host) host.remove(); return; }
      const p=this.ensurePrefs();
      if(!p.enabled){ if(host) host.remove(); return; }
      if(!host){ host=document.createElement('div'); host.id=this.hostId; host.className='floating-notes-host'; document.body.appendChild(host); }
      host.className='floating-notes-host side-'+p.side+(p.minimized?' is-minimized':' is-open');

      const vh=window.innerHeight;
      const bubbleStyle=(p.side==='left'?`left:${this.edgeGap}px;right:auto;`:`right:${this.edgeGap}px;left:auto;`)+`top:${p.y}px;`;

      let panelHTML='';
      if(!p.minimized){
        const L=this.computeLayout(p);
        const anchorX = p.side==='left' ? 'left' : 'right';
        const anchorY = L.openDown ? 'top' : 'bottom';
        const horiz = anchorX==='left' ? `left:${this.edgeGap}px;right:auto;` : `right:${this.edgeGap}px;left:auto;`;
        const vert = anchorY==='top' ? `top:${p.y + this.bubbleSize + this.gap}px;bottom:auto;` : `bottom:${vh - p.y + this.gap}px;top:auto;`;
        const gripCorner={x:anchorX==='left'?'right':'left', y:anchorY==='top'?'bottom':'top'};
        const gripCursor=(gripCorner.x==='left')===(gripCorner.y==='top') ? 'nwse-resize' : 'nesw-resize';
        const gripStyle=`${gripCorner.y}:6px;${gripCorner.x}:6px;cursor:${gripCursor};`;
        panelHTML = `
          <div class="floating-note-panel" data-anchor-x="${anchorX}" data-anchor-y="${anchorY}" style="${horiz}${vert}width:${L.panelW}px;height:${L.panelH}px;">
            <div class="floating-note-header floating-notes-drag-handle">
              <div class="floating-note-title">${notesIconSVG()}<span>Anotações</span></div>
              <div class="floating-note-header-actions">
                <button class="floating-note-icon-btn" onclick="FloatingNotes.save()" title="Salvar anotações">Salvar</button>
                <button class="floating-note-icon-btn" onclick="FloatingNotes.toggleMinimize()" title="Minimizar">—</button>
              </div>
            </div>
            <textarea class="floating-note-textarea" placeholder="Anote recados rápidos, pendências, ideias ou observações deste perfil..." oninput="FloatingNotes.onInput(this.value)">${esc(p.text||'')}</textarea>
            <div class="floating-note-footer"><span>Permanece entre abas e perfis do app enquanto estiver ativado neste perfil.</span><span class="floating-note-drag-tip">Arraste para mover</span></div>
            <div class="floating-note-resize-grip" style="${gripStyle}" title="Arraste para redimensionar">${resizeGripIconSVG()}</div>
          </div>`;
      }
      host.innerHTML = panelHTML + `<button class="floating-note-bubble floating-notes-drag-handle" style="${bubbleStyle}" onclick="FloatingNotes.openFromBubble()" title="Abrir anotações">${notesIconSVG()}</button>`;
      this.bindDrag(host);
      this.bindResize(host);
    },
    /* Arrasta apenas na vertical durante o gesto (feedback fluido); ao soltar, a bolinha
       sempre "gruda" no lado esquerdo ou direito mais próximo — igual ao botão de atalho
       flutuante do iPhone — nunca fica solta no meio da tela. */
    bindDrag(host){
      if(!host || host.dataset.dragBound==='1') return;
      host.dataset.dragBound='1';
      let active=null;
      host.addEventListener('pointerdown',(ev)=>{
        const handle=ev.target.closest('.floating-notes-drag-handle');
        if(!handle) return;
        if(ev.target.closest('.floating-note-resize-grip')) return;
        if(ev.target.closest('button') && !ev.target.closest('.floating-note-bubble')) return;
        const p=this.prefs(true);
        active={id:ev.pointerId, startY:ev.clientY, baseY:Number(p.y)||0, lastY:Number(p.y)||0, lastX:ev.clientX, moved:false};
        host.classList.add('dragging');
        try{ handle.setPointerCapture && handle.setPointerCapture(ev.pointerId); }catch(e){}
      });
      window.addEventListener('pointermove',(ev)=>{
        if(!active || ev.pointerId!==active.id) return;
        const dy=ev.clientY-active.startY;
        if(Math.abs(dy)>4 || Math.abs(ev.clientX-active.lastX)>4) active.moved=true;
        const nextY=this.clampY(active.baseY + dy);
        active.lastY=nextY; active.lastX=ev.clientX;
        const bubbleEl=host.querySelector('.floating-note-bubble');
        if(bubbleEl) bubbleEl.style.top=nextY+'px';
      });
      const endDrag=(ev)=>{
        if(!active || (ev && ev.pointerId!=null && ev.pointerId!==active.id)) return;
        const p=this.prefs(true);
        const wasMoved=active.moved;
        if(wasMoved){
          p.y=active.lastY;
          p.side = active.lastX < (window.innerWidth/2) ? 'left' : 'right';
          try{ saveCurrentData(); }catch(e){}
        }
        active=null; host.classList.remove('dragging');
        if(wasMoved) this.render();
      };
      window.addEventListener('pointerup',endDrag);
      window.addEventListener('pointercancel',endDrag);
    },
    /* Redimensiona o painel a partir do canto livre (o oposto de onde ele está ancorado
       na bolinha), mantendo sempre dentro da tela — permite deixar mais largo/alto. */
    bindResize(host){
      if(!host || host.dataset.resizeBound==='1') return;
      host.dataset.resizeBound='1';
      let active=null;
      host.addEventListener('pointerdown',(ev)=>{
        const grip=ev.target.closest('.floating-note-resize-grip');
        if(!grip) return;
        ev.stopPropagation();
        const panel=host.querySelector('.floating-note-panel');
        if(!panel) return;
        active={id:ev.pointerId, startX:ev.clientX, startY:ev.clientY, startW:panel.offsetWidth, startH:panel.offsetHeight, anchorX:panel.dataset.anchorX, anchorY:panel.dataset.anchorY, lastW:panel.offsetWidth, lastH:panel.offsetHeight};
        panel.classList.add('resizing');
        try{ grip.setPointerCapture && grip.setPointerCapture(ev.pointerId); }catch(e){}
      });
      window.addEventListener('pointermove',(ev)=>{
        if(!active || ev.pointerId!==active.id) return;
        const panel=host.querySelector('.floating-note-panel');
        if(!panel) return;
        const dx=ev.clientX-active.startX, dy=ev.clientY-active.startY;
        const maxW=Math.max(300, Math.min(window.innerWidth - (this.edgeGap*2) - 4, 720));
        const maxH=Math.max(220, Math.min(window.innerHeight - this.topSafeMargin() - this.bottomSafeMargin() - this.gap - this.bubbleSize, 800));
        let w = active.anchorX==='right' ? active.startW - dx : active.startW + dx;
        let h = active.anchorY==='top' ? active.startH + dy : active.startH - dy;
        w=Math.min(Math.max(w, 300), maxW);
        h=Math.min(Math.max(h, 220), maxH);
        panel.style.width=w+'px'; panel.style.height=h+'px';
        active.lastW=w; active.lastH=h;
      });
      const endResize=(ev)=>{
        if(!active || (ev && ev.pointerId!=null && ev.pointerId!==active.id)) return;
        const p=this.prefs(true);
        p.panelW=active.lastW; p.panelH=active.lastH;
        const panel=host.querySelector('.floating-note-panel');
        if(panel) panel.classList.remove('resizing');
        active=null;
        try{ saveCurrentData(); }catch(e){}
        this.render();
      };
      window.addEventListener('pointerup',endResize);
      window.addEventListener('pointercancel',endResize);
    }
  };

  // Update notes position after view redraws and on resize.
  if(typeof renderView==='function' && !window.__borionNotesRenderWrapped){
    window.__borionNotesRenderWrapped=true;
    const _renderView = renderView;
    renderView = function(){ const r=_renderView.apply(this, arguments); setTimeout(()=>window.FloatingNotes&&FloatingNotes.render(),0); return r; };
  }
  if(typeof renderApp==='function' && !window.__borionNotesAppWrapped){
    window.__borionNotesAppWrapped=true;
    const _renderApp = renderApp;
    renderApp = function(){ const r=_renderApp.apply(this, arguments); setTimeout(()=>window.FloatingNotes&&FloatingNotes.render(),0); return r; };
  }
  window.addEventListener('resize', ()=>{ try{ window.FloatingNotes&&FloatingNotes.render(); }catch(e){} });
})();
