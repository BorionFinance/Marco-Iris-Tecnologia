/* Borion Finance — Agenda financeira e notificações. */

function agendaAddMonthsSameDay(iso, add){
  const parts = String(iso||todayISO()).slice(0,10).split('-').map(Number);
  let y=parts[0], m=(parts[1]||1)-1, d=parts[2]||1;
  const target = new Date(y, m + Number(add||0), 1);
  const last = new Date(target.getFullYear(), target.getMonth()+1, 0).getDate();
  return target.getFullYear()+'-'+pad2(target.getMonth()+1)+'-'+pad2(Math.min(d,last));
}
/* Quantos meses futuros já existem numa série, a partir do item informado (0 se o item
   não pertence a nenhuma série). Usado para pré-preencher o campo "Quantidade de meses
   para replicar" ao editar, e para saber quanto ainda falta gerar. */
function agendaFutureCount(item){
  if(!item || !item.serieId) return 0;
  let mx = item.serieIndex||0;
  S.data.agenda.forEach(x=>{ if(x.serieId===item.serieId) mx = Math.max(mx, x.serieIndex||0); });
  return Math.max(0, mx - (item.serieIndex||0));
}
/* Garante que `item` tenha pelo menos `novoQtd` meses replicados à frente. Só adiciona —
   nunca remove lembretes já existentes (reduzir o número não apaga nada; use "Excluir este
   e os próximos" para isso). Funciona tanto para criar uma série nova quanto para completar
   uma série existente (ex: esqueceu de marcar quantos meses replicar e voltou pra editar). */
function agendaApplyReplication(item, novoQtd){
  novoQtd = Math.max(0, Math.min(60, Math.round(Number(novoQtd)||0)));
  if(novoQtd<=0) return;
  if(!item.serieId){ item.serieId = uid(); item.serieIndex = 0; }
  const already = agendaFutureCount(item);
  if(novoQtd<=already) return;
  for(let i=already+1;i<=novoQtd;i++){
    S.data.agenda.push({id:uid(), serieId:item.serieId, serieIndex:(item.serieIndex||0)+i, data:agendaAddMonthsSameDay(item.data, i), titulo:item.titulo, pago:false});
  }
}
function agendaDeleteItems(mode, item){
  const snapshot = JSON.parse(JSON.stringify(S.data));
  if(mode==='future' && item.serieId){
    S.data.agenda = S.data.agenda.filter(x=> !(x.serieId===item.serieId && String(x.data||'')>=String(item.data||'')) );
    S.data.notificacoes = (S.data.notificacoes||[]).filter(n=>S.data.agenda.some(a=>a.id===n.lembreteId));
    saveCurrentData(); closeModal(); renderView(); Notifs.refresh();
    showUndoToast('Esse e os próximos lembretes foram excluídos.', ()=>{ S.data=snapshot; saveCurrentData(); renderView(); });
    return;
  }
  S.data.agenda = S.data.agenda.filter(x=>x.id!==item.id);
  S.data.notificacoes = (S.data.notificacoes||[]).filter(n=>n.lembreteId!==item.id);
  saveCurrentData(); closeModal(); renderView(); Notifs.refresh();
  showUndoToast('Lembrete excluído.', ()=>{ S.data=snapshot; saveCurrentData(); renderView(); });
}
/* ---------------- VIEW: AGENDA FINANCEIRA ---------------- */
/* Estado de visualização da Agenda: mês próprio do calendário (independente do filtro de mês
   global do topo) e estado de minimizar/expandir dos blocos. Vive só em memória (S), não é
   persistido no localStorage — reinicia a cada carregamento, como já ocorre com S.patrView. */
function ensureAgendaViewState(){
  if(!S.agendaView) S.agendaView = {y:S.month.y, m:S.month.m, calCollapsed:false, upcomingCollapsed:false};
}
function renderAgenda(){
  ensureAgendaViewState();
  const y = S.agendaView.y, m = S.agendaView.m;
  const firstWeekday = new Date(y,m,1).getDay();
  const daysInMonth = new Date(y,m+1,0).getDate();
  const mKey = monthKey(y,m);
  const itemsByDay = {};
  S.data.agenda.filter(a=>bankMatches(a.banco,a.accountId)).forEach(a=>{
    if(a.data && a.data.startsWith(mKey)){
      const day = Number(a.data.slice(8,10));
      (itemsByDay[day] = itemsByDay[day]||[]).push(a);
    }
  });

  let cells = '';
  for(let i=0;i<firstWeekday;i++) cells += `<div class="cal-cell empty"></div>`;
  for(let d=1; d<=daysInMonth; d++){
    const items = itemsByDay[d]||[];
    const dateStr = mKey+'-'+pad2(d);
    const isToday = dateStr===todayISO();
    cells += `<div class="cal-cell ${isToday?'today':''} ${items.length?'has-items':''}" onclick="Agenda.add('${dateStr}')">
      <div class="cal-daynum">${d}</div>
      ${items.slice(0,3).map(it=>`<div class="cal-item ${it.pago?'paid':''}" onclick="event.stopPropagation();Agenda.edit('${it.id}')">${esc(it.titulo)}</div>`).join('')}
      ${items.length>3?`<div class="cal-more">+${items.length-3}</div>`:''}
    </div>`;
  }
  const weekdays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

  const upcoming = S.data.agenda.filter(a=>!a.pago && bankMatches(a.banco,a.accountId)).sort((a,b)=>a.data<b.data?-1:1).slice(0,10);
  const upcomingRows = upcoming.map(a=>{
    const diff = dateDiffDays(a.data, todayISO());
    const urgent = diff<=0;
    let tag;
    if(diff<0) tag = `<span style="color:${iconColor('despesas')};font-weight:700;">atrasado ${Math.abs(diff)}d</span>`;
    else if(diff===0) tag = `<span style="color:${iconColor('despesas')};font-weight:700;">vence hoje</span>`;
    else tag = `em ${diff} dia${diff>1?'s':''}`;
    return `<div class="list-row agenda-upcoming-row ${urgent?'urgent':''}"><span class="lname"><input type="checkbox" class="agenda-check" onclick="event.stopPropagation();Agenda.togglePago('${a.id}')" title="Marcar como paga (isso também marca a notificação como lida)" style="margin-right:8px;"/> ◷ ${a.data.slice(8,10)}/${a.data.slice(5,7)} — ${esc(a.titulo)}</span><span class="lval" style="font-weight:500;font-size:11.5px;color:var(--muted);">${tag}</span><button class="ledit" onclick="Agenda.edit('${a.id}')">✎</button></div>`;
  }).join('');

  const calCollapsed = S.agendaView.calCollapsed;
  const upcomingCollapsed = S.agendaView.upcomingCollapsed;

  return `
    <div class="agenda-layout">
      <div class="panel-box">
        <div class="agenda-panel-head">
          <div class="aph-left">
            <button class="collapse-toggle-btn" onclick="Agenda.toggleCalCollapse()" title="${calCollapsed?'Expandir':'Minimizar'}" style="color:var(--gold-bright);">${calCollapsed?'▸':'▾'}</button>
            <div class="toolbar-left">Calendário</div>
          </div>
          <button class="btn-outline" onclick="Agenda.add()">+ Lembrete</button>
        </div>
        ${calCollapsed ? '' : `
        <div class="agenda-month-nav">
          <button onclick="Agenda.prevMonth()" title="Mês anterior">‹</button>
          <div class="agenda-month-label">${monthLabel(y,m)}</div>
          <button onclick="Agenda.nextMonth()" title="Próximo mês">›</button>
        </div>
        <div class="cal-weekdays">${weekdays.map(w=>`<div>${w}</div>`).join('')}</div>
        <div class="cal-grid">${cells}</div>`}
      </div>
      <div class="panel-box">
        <div class="agenda-panel-head">
          <div class="aph-left">
            <button class="collapse-toggle-btn" onclick="Agenda.toggleUpcomingCollapse()" title="${upcomingCollapsed?'Expandir':'Minimizar'}" style="color:var(--gold-bright);">${upcomingCollapsed?'▸':'▾'}</button>
            <div class="panel-title" style="margin:0;">Próximos vencimentos</div>
          </div>
        </div>
        ${upcomingCollapsed ? '' : (upcomingRows || '<div class="empty-note">Nenhum lembrete pendente.</div>')}
      </div>
    </div>
  `;
}
const Agenda = {
  prevMonth(){ ensureAgendaViewState(); let {y,m}=S.agendaView; m--; if(m<0){m=11;y--;} S.agendaView.y=y; S.agendaView.m=m; renderView(); },
  nextMonth(){ ensureAgendaViewState(); let {y,m}=S.agendaView; m++; if(m>11){m=0;y++;} S.agendaView.y=y; S.agendaView.m=m; renderView(); },
  toggleCalCollapse(){ ensureAgendaViewState(); S.agendaView.calCollapsed = !S.agendaView.calCollapsed; renderView(); },
  toggleUpcomingCollapse(){ ensureAgendaViewState(); S.agendaView.upcomingCollapsed = !S.agendaView.upcomingCollapsed; renderView(); },
  add(dateStr){
    ensureAgendaViewState();
    openModal({title:'Novo lembrete', sub:'Ex: contas, assinaturas, parcelas com vencimento. Para replicar o mesmo lembrete nos próximos meses, informe quantos meses abaixo (0 = não replicar).', fields:[
      {key:'titulo', label:'Título', type:'text'},
      {key:'data', label:'Data', type:'date', default: dateStr || todayISO()},
      {key:'mesesReplicar', label:'Quantidade de meses para replicar', type:'number', step:'1', default:0},
    ], onSave(v){
      const qtd = Math.max(0, Math.min(60, Math.round(Number(v.mesesReplicar)||0)));
      const first = {id:uid(), serieId:'', serieIndex:0, data:v.data, titulo:v.titulo||'Sem título', pago:false};
      S.data.agenda.push(first);
      if(qtd>0) agendaApplyReplication(first, qtd);
      saveCurrentData(); closeModal(); renderView(); Notifs.refresh();
      toast(qtd>0 ? `Lembrete criado e replicado por ${qtd} mês(es).` : 'Lembrete criado.');
    }});
  },
  edit(id){
    const a = S.data.agenda.find(x=>x.id===id);
    if(!a) return;
    const futureInfo = a.serieId ? '<button class="btn btn-danger btn-block" id="ag_del_future" type="button">Excluir este e os próximos</button>' : '';
    openModal({title:'Editar lembrete', sub: a.serieId ? 'Este lembrete faz parte de uma série. Alterar o título atualiza o título em todos os lembretes da série.' : undefined, fields:[
      {key:'titulo', label:'Título', type:'text'},
      {key:'data', label:'Data', type:'date'},
      {key:'mesesReplicar', label:'Quantidade de meses para replicar', type:'number', step:'1', default: agendaFutureCount(a)},
      {key:'pago', label:'Já paga / concluída', type:'checkbox'},
    ], values:Object.assign({},a,{data:a.data||''}),
    extraHTML:`<div class="agenda-delete-options"><div class="modal-sub" style="margin:4px 0 8px;">Excluir lembrete</div><div class="row-btns"><button class="btn btn-danger btn-block" id="ag_del_one" type="button">Excluir apenas este</button></div>${futureInfo}</div>`,
    onSave(v){
      const wasPago = a.pago;
      const tituloMudou = v.titulo!==a.titulo;
      Object.assign(a,{titulo:v.titulo, data:v.data, pago:!!v.pago});
      if(tituloMudou && a.serieId){
        S.data.agenda.forEach(x=>{ if(x.serieId===a.serieId) x.titulo = a.titulo; });
      }
      agendaApplyReplication(a, v.mesesReplicar);
      if(a.pago && !wasPago){
        S.data.notificacoes.forEach(n=>{ if(n.lembreteId===a.id) n.lida=true; });
      }
      saveCurrentData(); closeModal(); renderView();
      Notifs.refresh();
    }});
    setTimeout(()=>{
      const one = document.getElementById('ag_del_one');
      const fut = document.getElementById('ag_del_future');
      if(one) one.onclick = ()=> agendaDeleteItems('one', a);
      if(fut) fut.onclick = ()=> agendaDeleteItems('future', a);
    },0);
  },
  togglePago(id){
    const a = S.data.agenda.find(x=>x.id===id);
    if(!a) return;
    a.pago = !a.pago;
    if(a.pago){ S.data.notificacoes.forEach(n=>{ if(n.lembreteId===a.id) n.lida=true; }); }
    saveCurrentData(); renderView();
  }
};

/* ---------------- Notificações ---------------- */
function notifMessage(n){
  const item = S.data.agenda.find(a=>a.id===n.lembreteId);
  if(!item) return {icon:'◌', text:'Lembrete removido.'};
  const dataFmt = item.data.slice(8,10)+'/'+item.data.slice(5,7);
  if(n.tipo==='2dias') return {icon:'◷', text:`"${item.titulo}" vence em 2 dias (${dataFmt}).`};
  if(n.tipo==='1dia') return {icon:'⏰', text:`"${item.titulo}" vence amanhã (${dataFmt}).`};
  if(n.tipo==='vencimento') return {icon:'🔴', text:`"${item.titulo}" vence hoje (${dataFmt}).`};
  if(n.tipo==='atraso') return {icon:'⚠️', text:`"${item.titulo}" está em atraso desde ${dataFmt}.`};
  return {icon:'◌', text:item.titulo};
}
const Notifs = {
  panelOpen:false,
  swipeThreshold:0.28,
  swipeVelocity:0.55,
  refresh(){
    const today = todayISO();
    const newOnes = [];
    S.data.agenda.forEach(item=>{
      if(item.pago) return;
      const diff = dateDiffDays(item.data, today);
      let tipo=null;
      if(diff===2) tipo='2dias';
      else if(diff===1) tipo='1dia';
      else if(diff===0) tipo='vencimento';
      else if(diff<=-1) tipo='atraso';
      if(!tipo) return;
      const exists = S.data.notificacoes.find(n=>n.lembreteId===item.id && n.tipo===tipo);
      if(!exists){
        const n = {id:uid(), lembreteId:item.id, tipo, lida:false, criadaEm:Date.now(), popupDispensadaEm:null};
        S.data.notificacoes.push(n);
        newOnes.push(n);
      }
    });
    if(newOnes.length) saveCurrentData();
    return newOnes;
  },
  unreadForPopup(){
    const list = (S.data.notificacoes||[]).filter(n=>!n.lida && !n.popupDispensadaEm && S.data.agenda.some(a=>a.id===n.lembreteId && !a.pago));
    const priority = {atraso:0, vencimento:1, '1dia':2, '2dias':3};
    return list.sort((a,b)=>{
      const pa = priority[a.tipo] ?? 9;
      const pb = priority[b.tipo] ?? 9;
      if(pa!==pb) return pa-pb;
      return (b.criadaEm||0)-(a.criadaEm||0);
    });
  },
  relativeTime(ts){
    const diff=Math.max(0,Date.now()-Number(ts||0));
    if(diff<60000) return 'agora';
    const min=Math.floor(diff/60000);
    if(min<60) return `há ${min} min`;
    const hr=Math.floor(min/60);
    if(hr<24) return `há ${hr} h`;
    const day=Math.floor(hr/24);
    if(day===1) return 'ontem';
    if(day<7) return `há ${day} dias`;
    const d=new Date(Number(ts||0));
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  },
  typeLabel(tipo){
    return ({atraso:'Em atraso',vencimento:'Vence hoje','1dia':'Vence amanhã','2dias':'Próximo vencimento'})[tipo]||'Lembrete';
  },
  haptic(pattern=8){
    if(window.MobileExperience && MobileExperience.haptic) MobileExperience.haptic(pattern);
    else if(navigator.vibrate) try{ navigator.vibrate(pattern); }catch(e){}
  },
  bindSwipe(node,{onCommit,onProgress,onCancel,axis='x'}={}){
    if(!node || node.dataset.swipeBound==='1') return;
    node.dataset.swipeBound='1';
    let pointerId=null,startX=0,startY=0,startAt=0,lastX=0,lastAt=0,mode='pending';
    const content=node.classList.contains('notif-swipe-shell') ? node.querySelector('.notif-item') : node;
    const target=content||node;
    const reset=()=>{
      target.classList.remove('is-swiping');
      target.style.removeProperty('--swipe-x');
      target.style.removeProperty('--swipe-opacity');
      if(onCancel) onCancel();
      pointerId=null;mode='pending';
    };
    const down=e=>{
      if(e.button!=null && e.button!==0) return;
      if(e.target.closest('button,a,input,select,textarea')) return;
      pointerId=e.pointerId;startX=e.clientX;startY=e.clientY;lastX=e.clientX;startAt=lastAt=performance.now();mode='pending';
      target.classList.add('is-swiping');
      try{ target.setPointerCapture(pointerId); }catch(err){}
    };
    const move=e=>{
      if(pointerId!==e.pointerId) return;
      const dx=e.clientX-startX,dy=e.clientY-startY;
      if(mode==='pending' && (Math.abs(dx)>7 || Math.abs(dy)>7)) mode=Math.abs(dx)>Math.abs(dy)*1.15?'horizontal':'vertical';
      if(mode==='vertical') return;
      if(mode!=='horizontal') return;
      e.preventDefault();
      const width=Math.max(1,target.getBoundingClientRect().width);
      const resistance=1/(1+Math.max(0,Math.abs(dx)-width*.72)/width*1.8);
      const rendered=dx*resistance;
      const opacity=Math.max(.2,1-Math.abs(rendered)/(width*1.05));
      target.style.setProperty('--swipe-x',`${rendered}px`);
      target.style.setProperty('--swipe-opacity',String(opacity));
      lastX=e.clientX;lastAt=performance.now();
      if(onProgress) onProgress({dx:rendered,rawDx:dx,width});
    };
    const finish=e=>{
      if(pointerId!==e.pointerId) return;
      const now=performance.now();
      const dx=e.clientX-startX;
      const width=Math.max(1,target.getBoundingClientRect().width);
      const velocity=(e.clientX-lastX)/Math.max(1,now-lastAt);
      const commit=mode==='horizontal' && (Math.abs(dx)>=Math.max(62,width*this.swipeThreshold) || (Math.abs(velocity)>=this.swipeVelocity && Math.abs(dx)>34));
      try{ target.releasePointerCapture(pointerId); }catch(err){}
      if(commit){
        const direction=dx===0?(velocity>=0?1:-1):(dx>0?1:-1);
        target.classList.remove('is-swiping');
        target.classList.add('is-swipe-committed');
        target.style.setProperty('--swipe-x',`${direction*(window.innerWidth+width)}px`);
        target.style.setProperty('--swipe-opacity','0');
        this.haptic(10);
        setTimeout(()=>{ if(onCommit) onCommit({direction,dx,velocity}); },155);
      }else reset();
    };
    target.addEventListener('pointerdown',down,{passive:true});
    target.addEventListener('pointermove',move,{passive:false});
    target.addEventListener('pointerup',finish,{passive:true});
    target.addEventListener('pointercancel',reset,{passive:true});
  },
  dismissPopup(id,element,{direction=1,persist=true}={}){
    if(!element || element.dataset.removing==='1') return;
    element.dataset.removing='1';
    if(persist){
      const n=(S.data.notificacoes||[]).find(x=>x.id===id);
      if(n){ n.popupDispensadaEm=Date.now(); saveCurrentData(); }
    }
    const width=Math.max(element.offsetWidth||320,320);
    element.classList.add('is-swipe-committed');
    element.style.setProperty('--swipe-x',`${direction*(window.innerWidth+width)}px`);
    element.style.setProperty('--swipe-opacity','0');
    setTimeout(()=>{
      element.remove();
      const wrap=document.getElementById('floating-notifs');
      if(wrap && !wrap.children.length) wrap.remove();
    },180);
  },
  showFloating(list){
    list = (list||[]).filter(Boolean);
    if(!list.length) return;
    if(S.config && S.config.popupNotifs && S.config.popupNotifs.enabled===false) return;
    let wrap = document.getElementById('floating-notifs');
    if(!wrap){ wrap = document.createElement('div'); wrap.id='floating-notifs'; wrap.className='floating-notifs'; wrap.setAttribute('aria-live','polite'); document.body.appendChild(wrap); }
    wrap.innerHTML = '';
    list.slice(0,4).forEach((n,index)=>{
      const msg = notifMessage(n);
      const el2 = document.createElement('article');
      el2.className = 'floating-notif';
      el2.dataset.notifId=n.id;
      el2.style.setProperty('--notif-index',String(index));
      el2.setAttribute('role','status');
      el2.innerHTML = `<button class="fn-close" title="Dispensar popup" aria-label="Dispensar popup">&times;</button>
        <div class="fn-icon" aria-hidden="true">${msg.icon}</div>
        <div class="fn-copy"><strong>${esc(this.typeLabel(n.tipo))}</strong><span>${esc(msg.text)}</span><small>Deslize para o lado para dispensar</small></div>`;
      wrap.appendChild(el2);
      const remove=(direction=1)=>this.dismissPopup(n.id,el2,{direction,persist:true});
      el2.querySelector('.fn-close').onclick=e=>{e.stopPropagation();this.haptic(6);remove(1);};
      this.bindSwipe(el2,{onCommit:({direction})=>remove(direction)});
      const dur = Math.max(30000, Math.min(50000, Number((S.config.popupNotifs||{}).durationMs)||40000));
      const timer=setTimeout(()=>remove(1),dur);
      el2.addEventListener('pointerdown',()=>clearTimeout(timer),{once:true,passive:true});
    });
  },
  togglePanel(evt){
    if(evt) evt.stopPropagation();
    this.panelOpen = !this.panelOpen;
    this.renderPanel();
    this.haptic(5);
  },
  closePanel(){
    this.panelOpen=false;
    this.renderPanel();
  },
  renderPanel(){
    let panel = document.getElementById('notif-panel');
    if(!this.panelOpen){ if(panel) panel.remove(); document.body.classList.remove('notif-panel-open'); if(typeof syncGlobalScrollLockState==='function') syncGlobalScrollLockState({source:'Notifs.close'}); return; }
    if(!panel){ panel = document.createElement('section'); panel.id='notif-panel'; panel.className='notif-panel'; document.body.appendChild(panel); }
    panel.classList.toggle('notif-panel-mobile',typeof isSmartphoneMode==='function' && isSmartphoneMode());
    const list = (S.data.notificacoes||[]).slice().sort((a,b)=>(b.criadaEm||0)-(a.criadaEm||0));
    const unread=list.filter(n=>!n.lida).length;
    const items=list.map(n=>{
      const msg = notifMessage(n);
      return `<div class="notif-swipe-shell" data-notif-id="${esc(n.id)}">
        <div class="notif-delete-bg" aria-hidden="true"><span>⌫</span><strong>Excluir</strong></div>
        <article class="notif-item ${n.lida?'':'unread'}" tabindex="0">
          <span class="ni-icon" aria-hidden="true">${msg.icon}</span>
          <span class="ni-text"><strong>${esc(this.typeLabel(n.tipo))}</strong><span>${esc(msg.text)}</span><small>${esc(this.relativeTime(n.criadaEm))}${n.lida?' · lida':' · nova'}</small></span>
          <span class="ni-actions">
            <button onclick="Notifs.toggleRead('${n.id}')">${n.lida?'Não lida':'Marcar lida'}</button>
            <button class="ni-delete" onclick="Notifs.remove('${n.id}')">Excluir</button>
          </span>
        </article>
      </div>`;
    }).join('');
    panel.innerHTML = `<div class="notif-panel-handle" aria-hidden="true"></div>
      <header class="notif-panel-header">
        <div><strong>Notificações</strong><small>${unread?`${unread} não lida${unread===1?'':'s'}`:'Tudo em dia'}</small></div>
        <button class="notif-panel-close" onclick="Notifs.closePanel()" aria-label="Fechar notificações">&times;</button>
      </header>
      ${list.length?`<div class="notif-panel-tools"><button onclick="Notifs.markAllRead()" ${unread?'':'disabled'}>Marcar todas como lidas</button><span>No celular, deslize para excluir</span></div>`:''}
      <div class="notif-list">${items||'<div class="notif-empty"><span>✓</span><strong>Nenhuma notificação</strong><small>Seus lembretes aparecerão aqui.</small></div>'}</div>`;
    panel.onclick = e=> e.stopPropagation();
    panel.querySelectorAll('.notif-swipe-shell').forEach(shell=>{
      this.bindSwipe(shell,{onCommit:()=>this.removeWithUndo(shell.dataset.notifId)});
    });
    document.body.classList.add('notif-panel-open');
    if(typeof syncGlobalScrollLockState==='function') syncGlobalScrollLockState({source:'Notifs.open'});
    if(window.MobileExperience && MobileExperience.decorateNotificationPanel) MobileExperience.decorateNotificationPanel(panel);
  },
  toggleRead(id){
    const n = (S.data.notificacoes||[]).find(x=>x.id===id);
    if(n){
      n.lida = !n.lida;
      n.popupDispensadaEm = n.lida ? (n.popupDispensadaEm||Date.now()) : null;
      saveCurrentData(); this.renderPanel(); renderView(); this.haptic(5);
    }
  },
  markAllRead(){
    let changed=false;
    (S.data.notificacoes||[]).forEach(n=>{ if(!n.lida){n.lida=true;n.popupDispensadaEm=n.popupDispensadaEm||Date.now();changed=true;} });
    if(changed){ saveCurrentData(); this.renderPanel(); renderView(); this.haptic([7,25,7]); }
  },
  removeWithUndo(id){
    const idx=(S.data.notificacoes||[]).findIndex(x=>x.id===id);
    if(idx<0) return;
    const snapshot=JSON.parse(JSON.stringify(S.data.notificacoes[idx]));
    S.data.notificacoes.splice(idx,1);
    saveCurrentData(); this.renderPanel(); renderView();
    showUndoToast('Notificação excluída.',()=>{
      S.data.notificacoes.splice(Math.min(idx,S.data.notificacoes.length),0,snapshot);
      saveCurrentData(); this.renderPanel(); renderView();
    });
  },
  remove(id){ this.removeWithUndo(id); },
  closePanelOnOutsideClick(){
    if(window.__borionNotifOutsideWired) return;
    window.__borionNotifOutsideWired=true;
    document.addEventListener('click', ()=>{ if(Notifs.panelOpen){ Notifs.panelOpen=false; Notifs.renderPanel(); } });
  }
};
