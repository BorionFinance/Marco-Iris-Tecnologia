/* Borion Finance — Módulo opcional de cheques recebidos e emitidos. */

function ensureChequesData(){
  if(!S.data.cheques) S.data.cheques = {enabled:false, items:[]};
  if(Array.isArray(S.data.cheques)) S.data.cheques = {enabled:false, items:S.data.cheques};
  if(S.data.cheques.enabled==null) S.data.cheques.enabled=false;
  if(!Array.isArray(S.data.cheques.items)) S.data.cheques.items=[];
}
function chequeStatuses(tipo){
  return tipo==='emitido'
    ? ['Emitido','A compensar','Compensado','Sustado','Cancelado','Devolvido']
    : ['Em aberto','Depositado','Compensado','Devolvido','Reapresentado','Cancelado'];
}
function chequeFinalStatuses(){ return ['Compensado','Cancelado','Sustado']; }
function chequeIsOpen(ch){ return !chequeFinalStatuses().includes(ch.status); }
function chequeStatusClass(status){
  if(status==='Compensado') return 'ok';
  if(status==='Devolvido' || status==='Cancelado' || status==='Sustado') return 'bad';
  if(status==='Depositado' || status==='Reapresentado' || status==='A compensar') return 'warn';
  return 'neutral';
}
function chequeDateLabel(ch){ return ch.tipo==='emitido' ? 'Bom para / compensação' : 'Bom para depósito'; }
function chequePersonLabel(ch){ return ch.tipo==='emitido' ? 'Para quem foi' : 'Quem emitiu'; }
function chequeAddDays(iso, days){
  const d = new Date((iso||todayISO())+'T00:00:00');
  d.setDate(d.getDate()+(Number(days)||0));
  return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate());
}
function chequeFmtDate(iso){
  if(!iso) return '—';
  const [y,m,d]=String(iso).split('-');
  if(!y||!m||!d) return esc(iso);
  return `${d}/${m}/${y}`;
}
function chequeDueClass(ch){
  if(!ch.dataBom || !chequeIsOpen(ch)) return '';
  const diff = dateDiffDays(ch.dataBom, todayISO());
  if(diff<0) return 'cheque-overdue';
  if(diff<=7) return 'cheque-due-soon';
  return '';
}
function chequeFilteredItems(){
  ensureChequesData();
  return (S.data.cheques.items||[])
    .filter(ch=>bankMatches(ch.banco,ch.accountId))
    .sort((a,b)=>(a.dataBom||'9999-12-31').localeCompare(b.dataBom||'9999-12-31'));
}
function chequeCategoryOptions(tipo){
  const cats = new Set(['Outro']);
  if(tipo==='emitido'){
    (S.data.categorias.fixa||[]).forEach(c=>cats.add(c));
    (S.data.categorias.variavel||[]).forEach(c=>cats.add(c));
  } else {
    (S.data.categorias.receita||[]).forEach(c=>cats.add(c));
  }
  return Array.from(cats);
}
function chequeBankOptions(){
  return accountSelectOptions({includeNone:true});
}

function renderCheques(){
  ensureChequesData();
  if(!S.data.cheques.enabled){
    return `<div class="panel-box"><h3 class="panel-title">Módulo de Cheques</h3><p class="empty-note">O controle de cheques está desativado. Ative em Configurações para usar esta guia.</p><button class="btn btn-primary btn-sm" onclick="Nav.go('settings')">Abrir Configurações</button></div>`;
  }
  const tabs = [
    ['resumo','Resumo'],['recebidos','Recebidos'],['emitidos','Emitidos'],['lotes','Lotes']
  ].map(([k,l])=>`<button class="tab-btn ${S.chequeTab===k?'active':''}" onclick="Cheques.setTab('${k}')">${l}</button>`).join('');

  let content='';
  if(S.chequeTab==='recebidos') content = Cheques.renderTable('recebido');
  else if(S.chequeTab==='emitidos') content = Cheques.renderTable('emitido');
  else if(S.chequeTab==='lotes') content = Cheques.renderLotes();
  else content = Cheques.renderResumo();

  return `
    <div class="toolbar">
      <div class="toolbar-left">Controle de cheques</div>
      <div class="toolbar-right">
        <button class="btn-outline" onclick="Cheques.openNewChoice()">+ Novo cheque</button>
        <button class="btn btn-primary btn-sm" onclick="Cheques.openLoteModal()">Gerar lote</button>
      </div>
    </div>
    <div class="tabs">${tabs}</div>
    ${content}
  `;
}

const Cheques = {
  setTab(tab){ S.chequeTab=tab; renderView(); },
  items(){ return chequeFilteredItems(); },
  renderResumo(){
    const items = Cheques.items();
    const recOpen = items.filter(ch=>ch.tipo==='recebido' && chequeIsOpen(ch)).reduce((s,ch)=>s+Number(ch.valor||0),0);
    const emiOpen = items.filter(ch=>ch.tipo==='emitido' && chequeIsOpen(ch)).reduce((s,ch)=>s+Number(ch.valor||0),0);
    const today = todayISO();
    const due7 = items.filter(ch=>chequeIsOpen(ch) && ch.dataBom && dateDiffDays(ch.dataBom,today)>=0 && dateDiffDays(ch.dataBom,today)<=7);
    const overdue = items.filter(ch=>chequeIsOpen(ch) && ch.dataBom && dateDiffDays(ch.dataBom,today)<0);
    const devolvidos = items.filter(ch=>ch.status==='Devolvido');
    const compMonthKey = monthKey(S.month.y,S.month.m);
    const compensadosMes = items.filter(ch=>ch.status==='Compensado' && ((ch.dataBaixa||ch.dataBom||'').slice(0,7)===compMonthKey));
    const compTotal = compensadosMes.reduce((s,ch)=>s+Number(ch.valor||0),0);

    const nextRows = items.filter(ch=>chequeIsOpen(ch)).slice(0,8).map(ch=>Cheques.rowHTML(ch, true)).join('') || `<tr><td colspan="7" class="empty-note">Nenhum cheque em aberto.</td></tr>`;

    return `
      <div class="cheque-dashboard">
        <div class="cheque-kpi"><div class="ck-label">Recebidos em aberto</div><div class="ck-value">${brl(recOpen)}</div><div class="ck-sub">Valores a receber</div></div>
        <div class="cheque-kpi"><div class="ck-label">Emitidos em aberto</div><div class="ck-value">${brl(emiOpen)}</div><div class="ck-sub">Dinheiro comprometido</div></div>
        <div class="cheque-kpi"><div class="ck-label">Próximos 7 dias</div><div class="ck-value">${due7.length}</div><div class="ck-sub">${brl(due7.reduce((s,ch)=>s+Number(ch.valor||0),0))}</div></div>
        <div class="cheque-kpi"><div class="ck-label">Vencidos / devolvidos</div><div class="ck-value">${overdue.length} / ${devolvidos.length}</div><div class="ck-sub">Compensado no mês: ${brl(compTotal)}</div></div>
      </div>
      <div class="cheque-split">
        <div class="panel-box">
          <h3 class="panel-title">Próximos cheques em aberto</h3>
          <div style="overflow-x:auto;">
            <table><thead><tr><th>Tipo</th><th>Status</th><th>Banco</th><th>Pessoa</th><th>Bom para</th><th>Valor</th><th></th></tr></thead><tbody>${nextRows}</tbody></table>
          </div>
        </div>
        <div class="panel-box">
          <h3 class="panel-title">Leitura financeira</h3>
          <div class="list-row"><div><div class="lname">Saldo líquido previsto</div><div class="lmeta">Recebidos abertos - emitidos abertos</div></div><div class="lval">${brl(recOpen-emiOpen)}</div></div>
          <div class="list-row"><div><div class="lname">Cheques cadastrados</div><div class="lmeta">considerando filtro de banco atual</div></div><div class="lval">${items.length}</div></div>
          <div class="list-row"><div><div class="lname">Vencidos</div><div class="lmeta">exigem ação manual</div></div><div class="lval cheque-overdue">${overdue.length}</div></div>
          <div class="gold-box">Cheque recebido só deve virar receita real quando for compensado. Cheque emitido representa compromisso futuro até cair no banco.</div>
        </div>
      </div>`;
  },
  renderTable(tipo){
    const label = tipo==='recebido' ? 'Cheques recebidos' : 'Cheques emitidos';
    const rows = Cheques.items().filter(ch=>ch.tipo===tipo).map(ch=>Cheques.rowHTML(ch)).join('') || `<tr><td colspan="8" class="empty-note">Nenhum cheque ${tipo==='recebido'?'recebido':'emitido'} cadastrado.</td></tr>`;
    return `<div class="panel-box"><div class="toolbar"><div class="toolbar-left">${label}</div><div class="toolbar-right"><button class="btn-outline" onclick="Cheques.openChequeModal('${tipo}')">+ Adicionar</button><button class="btn-outline" onclick="Cheques.openLoteModal('${tipo}')">Gerar vários</button></div></div><div style="overflow-x:auto;"><table><thead><tr><th>Status</th><th>Banco</th><th>Nº</th><th>${tipo==='recebido'?'Emitente':'Destinatário'}</th><th>Bom para</th><th>Valor</th><th>Lote</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  },
  rowHTML(ch, includeTipo){
    const status = `<span class="cheque-status ${chequeStatusClass(ch.status)}">${esc(ch.status||'Em aberto')}</span>`;
    const dueCls = chequeDueClass(ch);
    const actions = `<div class="cheque-actions">
      <button onclick="Cheques.openChequeModal('${ch.tipo}','${ch.id}')">Editar</button>
      ${ch.status!=='Compensado'?`<button onclick="Cheques.baixar('${ch.id}')">Baixa</button>`:''}
      ${ch.status!=='Devolvido'?`<button onclick="Cheques.devolver('${ch.id}')">Devolver</button>`:''}
    </div>`;
    if(includeTipo){
      return `<tr><td>${ch.tipo==='recebido'?'Recebido':'Emitido'}</td><td>${status}</td><td>${esc(ch.banco||'—')}</td><td>${esc(ch.pessoa||'—')}</td><td class="${dueCls}">${chequeFmtDate(ch.dataBom)}</td><td class="${ch.tipo==='recebido'?'val-pos':'val-neg'}">${brl(ch.valor)}</td><td>${actions}</td></tr>`;
    }
    return `<tr><td>${status}</td><td>${esc(ch.banco||'—')}</td><td>${esc(ch.numero||'—')}</td><td>${esc(ch.pessoa||'—')}</td><td class="${dueCls}">${chequeFmtDate(ch.dataBom)}</td><td class="${ch.tipo==='recebido'?'val-pos':'val-neg'}">${brl(ch.valor)}</td><td>${esc(ch.lote||'—')}</td><td>${actions}</td></tr>`;
  },
  renderLotes(){
    const groups = new Map();
    Cheques.items().forEach(ch=>{
      const key = ch.lote || 'Sem lote';
      if(!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ch);
    });
    if(groups.size===0) return `<div class="panel-box"><p class="empty-note">Nenhum lote cadastrado ainda.</p><button class="btn btn-primary btn-sm" onclick="Cheques.openLoteModal()">Gerar primeiro lote</button></div>`;
    return Array.from(groups.entries()).sort((a,b)=>a[0].localeCompare(b[0],'pt-BR')).map(([lote,items])=>{
      const total = items.reduce((s,ch)=>s+Number(ch.valor||0),0);
      const comp = items.filter(ch=>ch.status==='Compensado').reduce((s,ch)=>s+Number(ch.valor||0),0);
      const aberto = items.filter(chequeIsOpen).reduce((s,ch)=>s+Number(ch.valor||0),0);
      const dev = items.filter(ch=>ch.status==='Devolvido').reduce((s,ch)=>s+Number(ch.valor||0),0);
      const pessoa = items.find(ch=>ch.pessoa)?.pessoa || '—';
      return `<div class="cheque-lote-card"><div class="cheque-lote-head"><div><div class="cheque-lote-title">${esc(lote)}</div><div class="cheque-lote-meta">${items.length} cheque(s) · ${esc(pessoa)}</div></div><button class="btn-outline btn-sm" onclick="Cheques.setTab('${items[0].tipo==='emitido'?'emitidos':'recebidos'}')">Ver tabela</button></div><div class="cheque-mini-grid"><div class="cheque-mini"><div class="m-label">Total</div><div class="m-value">${brl(total)}</div></div><div class="cheque-mini"><div class="m-label">Em aberto</div><div class="m-value">${brl(aberto)}</div></div><div class="cheque-mini"><div class="m-label">Compensado</div><div class="m-value val-pos">${brl(comp)}</div></div><div class="cheque-mini"><div class="m-label">Devolvido</div><div class="m-value cheque-overdue">${brl(dev)}</div></div></div></div>`;
    }).join('');
  },
  openNewChoice(){
    openChoiceModal({title:'Novo cheque', sub:'Escolha o tipo de cheque que você quer cadastrar.', choices:[
      {label:'Cheque recebido', desc:'Valor que alguém passou para você receber/depositar.', onClick:()=>{ closeModal(); Cheques.openChequeModal('recebido'); }},
      {label:'Cheque emitido', desc:'Cheque que você passou para outra pessoa/empresa.', onClick:()=>{ closeModal(); Cheques.openChequeModal('emitido'); }},
      {label:'Cancelar', onClick:closeModal}
    ]});
  },
  openChequeModal(tipo, id){
    ensureChequesData();
    const existing = id ? S.data.cheques.items.find(ch=>ch.id===id) : null;
    const ch = existing || {tipo, status:chequeStatuses(tipo)[0], dataBase:todayISO(), dataBom:todayISO(), valor:0, accountId:'', banco:''};
    const fields = [
      {key:'tipo',label:'Tipo',type:'select',options:['recebido','emitido'],default:ch.tipo||tipo},
      {key:'status',label:'Status',type:'select',options:Array.from(new Set([...chequeStatuses('recebido'),...chequeStatuses('emitido')])),default:ch.status||chequeStatuses(tipo)[0]},
      {key:'accountId',label:'Banco/Conta',type:'select',options:chequeBankOptions(),default:ch.accountId||resolveAccountId(ch.banco)||''},
      {key:'numero',label:'Número do cheque',type:'text',default:ch.numero||''},
      {key:'valor',label:'Valor',type:'money',default:ch.valor||0},
      {key:'dataBase',label:(ch.tipo||tipo)==='emitido'?'Data de emissão':'Data de recebimento',type:'date',default:existing?(ch.dataBase||''):todayISO()},
      {key:'dataBom',label:chequeDateLabel(ch),type:'date',default:existing?(ch.dataBom||''):todayISO()},
      {key:'pessoa',label:chequePersonLabel(ch),type:'text',default:ch.pessoa||''},
      {key:'cpfCnpj',label:'CPF/CNPJ',type:'text',default:ch.cpfCnpj||''},
      {key:'contato',label:'Telefone/contato',type:'text',default:ch.contato||''},
      {key:'categoria',label:'Categoria',type:'select',options:chequeCategoryOptions(ch.tipo||tipo),default:ch.categoria||'Outro'},
      {key:'lote',label:'Lote',type:'text',default:ch.lote||''},
      {key:'obs',label:'Observação',type:'text',default:ch.obs||''},
      {key:'dataBaixa',label:'Data da baixa/compensação',type:'date',default:ch.dataBaixa||''},
      {key:'motivoDevolucao',label:'Motivo da devolução',type:'text',default:ch.motivoDevolucao||''}
    ];
    openModal({title:existing?'Editar cheque':'Novo cheque', sub:'Controle separado: ele só vira receita/despesa real se você lançar manualmente no orçamento.', fields, saveLabel:existing?'Salvar alterações':'Cadastrar cheque', values:ch, onSave(v){
      const item = Object.assign({}, ch, v);
      item.id = existing ? existing.id : uid();
      item.tipo = item.tipo==='emitido' ? 'emitido' : 'recebido';
      item.accountId = item.accountId || null;
      item.banco = accountNameSnapshot(item.accountId, item.banco||'');
      item.valor = Number(item.valor)||0;
      item.criadoEm = item.criadoEm || new Date().toISOString();
      if(existing) Object.assign(existing, item); else S.data.cheques.items.push(item);
      saveCurrentData(); closeModal(); renderView(); toast(existing?'Cheque atualizado.':'Cheque cadastrado.');
    }, onDelete: existing ? ()=>{
      S.data.cheques.items = S.data.cheques.items.filter(x=>x.id!==existing.id);
      saveCurrentData(); closeModal(); renderView();
    } : null});
  },
  openLoteModal(tipoDefault){
    const fields = [
      {key:'tipo',label:'Tipo',type:'select',options:['recebido','emitido'],default:tipoDefault||'recebido'},
      {key:'accountId',label:'Banco/Conta',type:'select',options:chequeBankOptions(),default:''},
      {key:'quantidade',label:'Quantidade de cheques',type:'number',default:3},
      {key:'valor',label:'Valor',type:'money',default:0},
      {key:'modoValor',label:'Esse valor é',type:'select',options:['Valor de cada cheque','Valor total do lote'],default:'Valor de cada cheque'},
      {key:'primeiraData',label:'Primeiro vencimento / bom para',type:'date',default:todayISO()},
      {key:'intervaloDias',label:'Intervalo entre cheques (dias)',type:'number',default:30},
      {key:'numeroInicial',label:'Número inicial do cheque (opcional)',type:'text',default:''},
      {key:'pessoa',label:'Pessoa/empresa',type:'text',default:''},
      {key:'categoria',label:'Categoria',type:'text',default:'Outro'},
      {key:'lote',label:'Nome do lote',type:'text',default:''},
      {key:'obs',label:'Observação',type:'text',default:''}
    ];
    openModal({title:'Gerar cheques em lote', sub:'Crie vários cheques de uma vez e depois edite um por um, se precisar.', fields, saveLabel:'Gerar lote', onSave(v){
      const qtd = Math.max(1, Math.min(120, parseInt(v.quantidade||1,10)||1));
      const totalVal = Number(v.valor)||0;
      const valorUnit = v.modoValor==='Valor total do lote' ? totalVal/qtd : totalVal;
      const tipo = v.tipo==='emitido' ? 'emitido' : 'recebido';
      const loteName = v.lote || `${tipo==='emitido'?'Emitido':'Recebido'} - ${v.pessoa||'lote'} - ${todayISO()}`;
      const numStart = String(v.numeroInicial||'').trim();
      const numBase = /^\d+$/.test(numStart) ? parseInt(numStart,10) : null;
      for(let i=0;i<qtd;i++){
        S.data.cheques.items.push({
          id:uid(), tipo, status:chequeStatuses(tipo)[0], accountId:v.accountId||null, banco:accountNameSnapshot(v.accountId||null),
          numero:numBase!=null ? String(numBase+i) : (i===0?numStart:''),
          valor:valorUnit, dataBase:todayISO(), dataBom:chequeAddDays(v.primeiraData, i*(Number(v.intervaloDias)||0)),
          pessoa:v.pessoa||'', cpfCnpj:'', contato:'', categoria:v.categoria||'Outro', lote:loteName, obs:v.obs||'', dataBaixa:'', motivoDevolucao:'', criadoEm:new Date().toISOString()
        });
      }
      saveCurrentData(); closeModal(); S.chequeTab = tipo==='emitido'?'emitidos':'recebidos'; renderView(); toast(qtd+' cheque(s) gerado(s).');
    }});
  },
  baixar(id){
    const ch = S.data.cheques.items.find(x=>x.id===id); if(!ch) return;
    ch.status='Compensado'; ch.dataBaixa=todayISO(); saveCurrentData(); renderView(); toast('Baixa registrada.');
  },
  devolver(id){
    const ch = S.data.cheques.items.find(x=>x.id===id); if(!ch) return;
    openModal({title:'Cheque devolvido', fields:[
      {key:'motivoDevolucao',label:'Motivo da devolução',type:'text',default:ch.motivoDevolucao||''},
      {key:'dataBaixa',label:'Data da devolução',type:'date',default:todayISO()},
      {key:'dataBom',label:'Nova data de reapresentação (opcional)',type:'date',default:''},
      {key:'obs',label:'Observação',type:'text',default:ch.obs||''}
    ], saveLabel:'Marcar como devolvido', onSave(v){
      ch.status='Devolvido'; ch.motivoDevolucao=v.motivoDevolucao||''; ch.dataBaixa=v.dataBaixa||todayISO(); ch.obs=v.obs||ch.obs||'';
      if(v.dataBom) ch.dataBom=v.dataBom;
      saveCurrentData(); closeModal(); renderView(); toast('Cheque marcado como devolvido.');
    }});
  }
};
