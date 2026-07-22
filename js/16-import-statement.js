/* Borion Finance — Importador de extratos CSV/OFX/TXT/PDF textual e prints com revisão antes de lançar. */

function createEmptyImportState(seed){
  const baseDate=(typeof todayISO==='function'?todayISO():new Date().toISOString().slice(0,10));
  const baseMonth=(typeof monthKey==='function'&&typeof S!=='undefined'&&S.month)?monthKey(S.month.y,S.month.m):baseDate.slice(0,7);
  return Object.assign({
    mode:'file',
    fileName:'', fileType:'', rawText:'',
    images:[], ocrStatus:'idle', ocrProgress:0, ocrStage:'', ocrCurrentImage:0, ocrTotalImages:0, ocrCancelable:false, ocrCancelRequested:false,
    detectedBank:'', selectedBank:'',
    referenceMonth:baseMonth, referenceDate:baseDate,
    parsed:[], detectedBalance:null, relativeDatesFound:false,
    batchDuplicates:0, existingDuplicates:0, blockingIssues:0,
    lastError:'', loading:false,
    stats:{total:0,selected:0,selecionados:0,receitas:0,despesas:0,transferencias:0,rendimentos:0,duplicados:0,pendencias:0}
  },seed||{});
}

function ensureImportState(){
  if(!S.importState) S.importState=createEmptyImportState();
  else {
    const current=S.importState;
    const merged=createEmptyImportState();
    Object.keys(merged).forEach(k=>{ if(current[k]===undefined) current[k]=merged[k]; });
    if(!Array.isArray(current.images)) current.images=[];
    if(!Array.isArray(current.parsed)) current.parsed=[];
    if(!current.stats||typeof current.stats!=='object') current.stats=merged.stats;
  }
  return S.importState;
}

function renderImportFilePanel(st,bankOptions){
  return `<div class="panel-box import-panel-main">
    <div class="toolbar">
      <div class="toolbar-left">Arquivo do extrato</div>
      <div class="toolbar-right"><button class="btn-outline" onclick="ImportStatement.clear()">Limpar</button></div>
    </div>
    <label class="import-drop" for="statement_file" ondragover="ImportStatement.drag(event)" ondrop="ImportStatement.drop(event)">
      <input id="statement_file" type="file" accept=".csv,.ofx,.ofc,.txt,.pdf,text/csv,application/pdf" onchange="ImportStatement.pickFile(event)" hidden>
      <div class="drop-icon">▦</div>
      <div>
        <strong>${st.fileName ? esc(st.fileName) : 'Clique para escolher ou arraste o extrato aqui'}</strong>
        <span>CSV e OFX são os mais confiáveis. PDF funciona quando o texto é selecionável e não protegido.</span>
      </div>
    </label>
    <div class="import-controls">
      <div class="field"><label>Banco detectado / conta de destino</label><select id="import_bank" onchange="ImportStatement.setBank(this.value,true)">${bankOptions}</select></div>
      <div class="field"><label>Mês de referência</label><input type="month" id="import_month" value="${esc(st.referenceMonth||monthKey(S.month.y,S.month.m))}" onchange="ImportStatement.reparseWithMonth(this.value)"></div>
    </div>
    ${st.detectedBank?`<div class="import-detect-ok">Banco provável detectado: <b>${esc(st.detectedBank)}</b></div>`:''}
    ${st.lastError?`<div class="import-warning">${esc(st.lastError)}</div>`:''}
    <div class="import-help"><b>Como usar:</b> importe o arquivo, confira a prévia, desmarque o que não quer lançar, edite o que precisar e só depois clique em importar. Duplicados ficam desmarcados por segurança.</div>
  </div>`;
}

function importStatsForRender(st){
  const rows=st.parsed||[];
  const selected=rows.filter(r=>r.incluir);
  return {
    total:rows.length, selected:selected.length,
    receitas:selected.filter(r=>r.tipo==='receita').reduce((a,b)=>a+Number(b.valor||0),0),
    despesas:selected.filter(r=>r.tipo!=='receita').reduce((a,b)=>a+Number(b.valor||0),0),
    transferencias:0,rendimentos:0,
    duplicados:rows.filter(r=>r.duplicado).length,pendencias:0
  };
}

function renderImportSummary(st,stats){
  const hasRows=(st.parsed||[]).length>0;
  const selectedCount=stats.selected||0;
  return `<div class="panel-box">
    <div class="panel-title">Resumo da importação</div>
    <div class="import-kpis">
      <div class="import-kpi"><span>Lidas</span><strong>${stats.total||0}</strong></div>
      <div class="import-kpi"><span>Selecionadas</span><strong>${selectedCount}</strong></div>
      <div class="import-kpi"><span>Receitas</span><strong class="val-pos">${brl(stats.receitas||0)}</strong></div>
      <div class="import-kpi"><span>Despesas</span><strong class="val-neg">${brl(stats.despesas||0)}</strong></div>
    </div>
    <div class="import-side-actions">
      <button class="btn btn-secondary btn-block" onclick="ImportStatement.selectAll(true)" ${hasRows?'':'disabled'}>Selecionar tudo</button>
      <button class="btn btn-secondary btn-block" onclick="ImportStatement.selectAll(false)" ${hasRows?'':'disabled'}>Desmarcar tudo</button>
      <button class="btn btn-secondary btn-block" onclick="ImportStatement.reviewDuplicates()" ${hasRows?'':'disabled'}>Revisar duplicidade${stats.duplicados?` (${stats.duplicados})`:''}</button>
      <button class="btn btn-secondary btn-block" onclick="ImportStatement.reviewBeforeImport()" ${selectedCount?'':'disabled'}>Revisar antes de importar</button>
      <button class="btn btn-primary btn-block" onclick="ImportStatement.commit()" ${selectedCount?'':'disabled'}>Importar ${selectedCount} movimentação${selectedCount===1?'':'ões'}</button>
      <button class="btn-outline btn-block" onclick="ImportStatement.commitAsReserve()" ${selectedCount?'':'disabled'}>Importar como saldo de reserva</button>
    </div>
  </div>`;
}

function renderImportStatement(){
  const st=ensureImportState();
  const rows=st.parsed||[];
  const bancoAtual=resolveAccountId(st.selectedBank)||st.selectedBank||resolveAccountId(st.detectedBank)||'';
  const bankOptions=[`<option value="">Escolha uma conta bancária ativa</option>`].concat(accountSelectOptions().map(o=>`<option value="${esc(o.value)}" ${o.value===bancoAtual?'selected':''}>${esc(o.label)}</option>`)).join('');
  const stats=importStatsForRender(st);
  const mainPanel=renderImportFilePanel(st,bankOptions);
  const review=rows.length?renderImportReviewTable(rows):renderImportEmptyState();
  return `<div class="import-hero">
      <div class="ih-left"><div class="import-eyebrow">Automação assistida</div><h2>Importar extrato</h2><p>Importe o arquivo bancário, revise cada movimentação e só então aplique os efeitos financeiros.</p></div>
      <div class="ih-badge"><span>⇣</span><strong>Revisar antes de lançar</strong></div>
    </div>
    <div class="import-grid">${mainPanel}${renderImportSummary(st,stats)}</div>
    ${review}`;
}

function renderImportEmptyState(){
  return `<div class="panel-box import-empty"><div class="empty-orb">◎</div><h3>Nenhum extrato carregado</h3><p>Envie um arquivo CSV, OFX, TXT ou PDF textual. O Borion vai tentar detectar banco, datas, descrições, valores e tipo de lançamento.</p><div class="import-format-grid"><div><b>CSV</b><span>melhor opção para planilha/exportação</span></div><div><b>OFX</b><span>melhor opção bancária estruturada</span></div><div><b>PDF</b><span>bom quando possui texto selecionável</span></div><div><b>TXT</b><span>útil para extrato simples</span></div></div></div>`;
}

function renderImportReviewTable(rows){
  const catsOptions=(tipo,selected)=>{const key=tipo==='fixa'?'fixa':tipo;const cats=(S.data.categorias[key]||['Outro']);return cats.map(c=>`<option value="${esc(c)}" ${c===selected?'selected':''}>${esc(c)}</option>`).join('');};
  const bankOpts=selected=>`<option value="">— Escolha uma conta —</option>`+accountSelectOptions().map(o=>`<option value="${esc(o.value)}" ${o.value===selected?'selected':''}>${esc(o.label)}</option>`).join('');
  const body=rows.map((r,i)=>`<tr class="${r.duplicado?'is-dup':''} ${!r.incluir?'is-muted':''}"><td><input type="checkbox" ${r.incluir?'checked':''} onchange="ImportStatement.update(${i},'incluir',this.checked)"></td><td><input class="mini-input" type="date" value="${esc(r.data||'')}" onchange="ImportStatement.update(${i},'data',this.value)"></td><td><input class="mini-input desc" type="text" value="${esc(r.nome||'')}" onchange="ImportStatement.update(${i},'nome',this.value)"><div class="import-original">${esc(r.original||'')}</div></td><td><input class="mini-input money-mini" type="text" value="${formatMoneyInput(r.valor)}" onchange="ImportStatement.updateMoney(${i},this.value)"></td><td><select class="mini-select" onchange="ImportStatement.updateType(${i},this.value)"><option value="receita" ${r.tipo==='receita'?'selected':''}>Receita</option><option value="variavel" ${r.tipo==='variavel'?'selected':''}>Despesa variável</option><option value="fixa" ${r.tipo==='fixa'?'selected':''}>Despesa fixa</option></select></td><td><select class="mini-select" onchange="ImportStatement.update(${i},'categoria',this.value)">${catsOptions(r.tipo,r.categoria)}</select></td><td><select class="mini-select" onchange="ImportStatement.update(${i},'accountId',this.value)">${bankOpts(r.accountId||resolveAccountId(r.banco)||'')}</select></td><td>${r.duplicado?'<span class="dup-pill">duplicado</span>':'<span class="ok-pill">novo</span>'}</td><td><button class="mini-danger" onclick="ImportStatement.removeRow(${i})">Excluir</button></td></tr>`).join('');
  return `<div class="panel-box import-review"><div class="toolbar"><div class="toolbar-left">Revisão antes de lançar</div><div class="toolbar-right"><button class="btn-outline" onclick="ImportStatement.applyBankToAll()">Aplicar banco a todos</button><button class="btn-outline" onclick="ImportStatement.removeUnselected()">Remover desmarcados</button></div></div><div class="table-scroll"><table class="import-table"><thead><tr><th>Usar</th><th>Data</th><th>Descrição</th><th>Valor</th><th>Tipo</th><th>Categoria</th><th>Banco</th><th>Status</th><th></th></tr></thead><tbody>${body}</tbody></table></div><div class="import-footnote">Despesa fixa importada vira um compromisso recorrente a partir do mês da data do lançamento. Para extrato comum, normalmente use “Despesa variável”.</div></div>`;
}

function formatMoneyInput(n){
  return (Number(n)||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
}
function parseMoneyAny(v){
  let s = String(v||'').trim();
  if(!s) return 0;
  const negative = /^-/.test(s) || /\(.*\)/.test(s) || /\bD\b/i.test(s);
  s = s.replace(/R\$/gi,'').replace(/[()]/g,'').replace(/[+]/g,'').replace(/\b[CD]\b/gi,'').trim();
  const hasComma = s.includes(','), hasDot = s.includes('.');
  if(hasComma && hasDot) s = s.replace(/\./g,'').replace(',','.');
  else if(hasComma) s = s.replace(',','.');
  s = s.replace(/[^0-9.-]/g,'');
  const num = parseFloat(s)||0;
  return negative ? -Math.abs(num) : num;
}
function normalizeText(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function cleanDesc(s){ return String(s||'').replace(/\s+/g,' ').replace(/^(pix|ted|doc|pagamento|compra|debito|credito)\s*[-:]?\s*/i,'').trim() || 'Lançamento importado'; }
function isoFromAnyDate(raw, fallbackYM){
  const ym = fallbackYM || monthKey(S.month.y,S.month.m);
  let s = String(raw||'').trim();
  let m = s.match(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if(m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  m = s.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if(m){ let y=m[3]; if(y.length===2) y='20'+y; return `${y}-${pad2(m[2])}-${pad2(m[1])}`; }
  m = s.match(/(\d{1,2})[\/.-](\d{1,2})/);
  if(m){ const [y] = ym.split('-'); return `${y}-${pad2(m[2])}-${pad2(m[1])}`; }
  return ym+'-01';
}
function dateFromOFX(s){
  const m = String(s||'').match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : monthKey(S.month.y,S.month.m)+'-01';
}
function detectBankFromText(text, fileName){
  const hay = normalizeText((fileName||'')+' '+(text||''));
  const registered = activeAccounts().map(c=>c.nome).find(b=> hay.includes(normalizeText(b)));
  if(registered) return registered;
  const patterns = [
    ['Mercado Pago', ['mercado pago','mercadopago','mercado livre']],
    ['Sicredi', ['sicredi']],
    ['Nubank', ['nubank','nu pagamentos']],
    ['Banco Inter', ['banco inter','intermedium']],
    ['Itaú', ['itau','itaú']],
    ['Bradesco', ['bradesco']],
    ['Santander', ['santander']],
    ['Caixa', ['caixa economica','caixa econômica']],
    ['Banco do Brasil', ['banco do brasil','bb s.a','bbsa']],
    ['C6 Bank', ['c6 bank']],
    ['XP', ['xp investimentos','xp banco']]
  ];
  for(const [name, arr] of patterns){ if(arr.some(p=>hay.includes(p))) return name; }
  return '';
}
function inferType(desc, value){
  const d = normalizeText(desc);
  if(value>0) return 'receita';
  if(/salario|pro labore|rendimento|resgate|deposito recebido|pix recebido|credito recebido|estorno/.test(d)) return 'receita';
  if(/aluguel|internet|energia|agua|telefone|netflix|spotify|assinatura|financiamento|iptu|seguro/.test(d)) return 'fixa';
  return 'variavel';
}
function inferCategory(tipo, desc){
  const d = normalizeText(desc);
  if(tipo==='receita'){
    if(/salario|pro labore|ordenado|pagamento salario/.test(d)) return pickCat('receita','Salário');
    if(/rendimento|cashback|juros|resgate|dividendo/.test(d)) return pickCat('receita','Renda Extra');
    return pickCat('receita','Outro');
  }
  const key = tipo==='fixa' ? 'fixa' : 'variavel';
  if(/mercado|supermercado|atacadao|assai|carrefour|pao de acucar/.test(d)) return pickCat(key,'Mercado');
  if(/uber|99|combustivel|posto|shell|ipiranga|transporte/.test(d)) return pickCat(key,'Transporte');
  if(/farmacia|drogaria|medico|saude/.test(d)) return pickCat(key,'Saúde');
  if(/netflix|spotify|amazon|disney|max|assinatura/.test(d)) return pickCat(key, key==='fixa'?'Assinaturas':'Contas');
  if(/energia|cpfl|agua|internet|vivo|claro|tim|telefone|iptu/.test(d)) return pickCat(key, key==='fixa'?'Contas Fixas':'Contas');
  if(/restaurante|ifood|lanche|burger|pizza|bar/.test(d)) return pickCat(key,'Alimentação');
  if(/mecanica|oficina|auto|veiculo|carro|posto|combustivel|shell|ipiranga/.test(d)) return pickCat(key,'Veículo');
  return pickCat(key,'Outro');
}
function pickCat(typeKey, preferred){
  const cats = S.data.categorias[typeKey]||[];
  return cats.includes(preferred) ? preferred : (cats.includes('Outro') ? 'Outro' : (cats[0]||'Outro'));
}
function duplicateKey(obj){
  const accountKey=obj.accountId||resolveAccountId(obj.banco,{includeArchived:true})||normalizeText(obj.banco||'');
  return [obj.data, Math.round(Math.abs(Number(obj.valor||0))*100), normalizeText(obj.nome).slice(0,38), accountKey].join('|');
}
function isDuplicate(obj){
  const key = duplicateKey(obj);
  return (S.data.transacoes||[]).some(t=>duplicateKey(t)===key);
}
function buildImportRow({data,nome,valor,banco,original,source}){
  const abs = Math.abs(Number(valor)||0);
  const tipo = inferType(nome, Number(valor)||0);
  const categoria = inferCategory(tipo, nome);
  const accountId=resolveAccountId(banco);
  const row = {tempId:uid(), incluir:true, data, nome:cleanDesc(nome), valor:abs, tipo, categoria, accountId:accountId||'', banco:accountNameSnapshot(accountId,banco||''), original:original||'', source:source||'arquivo', duplicado:false};
  row.duplicado = isDuplicate(row);
  if(row.duplicado) row.incluir=false;
  return row;
}

function parseCSV(text, bank, fallbackYM){
  const rows = csvRows(text).filter(r=>r.some(c=>String(c||'').trim()));
  if(!rows.length) return [];
  const headerIndex = rows.findIndex(r=>r.some(c=>/data|date/i.test(c)) && r.some(c=>/valor|amount|value|val/i.test(c)));
  const start = headerIndex>=0 ? headerIndex+1 : 0;
  const header = headerIndex>=0 ? rows[headerIndex].map(c=>normalizeText(c)) : [];
  function idx(names, fallback){
    for(const n of names){ const i = header.findIndex(h=>h.includes(n)); if(i>=0) return i; }
    return fallback;
  }
  const dateI = header.length ? idx(['data','date'],0) : 0;
  const valI = header.length ? idx(['valor','amount','value','val'], rows[0].length-1) : rows[0].length-1;
  const descI = header.length ? idx(['descricao','descrição','historico','histórico','lancamento','lançamento','memo','nome'],1) : 1;
  const out=[];
  rows.slice(start).forEach(r=>{
    const dateRaw = r[dateI]||'';
    const valRaw = r[valI]||'';
    const descRaw = r[descI] || r.filter((_,i)=>i!==dateI&&i!==valI).join(' ');
    const val = parseMoneyAny(valRaw);
    if(!dateRaw || !val || /saldo/i.test(descRaw)) return;
    out.push(buildImportRow({data:isoFromAnyDate(dateRaw,fallbackYM), nome:descRaw, valor:val, banco:bank, original:r.join(' | '), source:'CSV'}));
  });
  return out;
}
function csvRows(text){
  const delimiter = (text.split(';').length >= text.split(',').length) ? ';' : ',';
  const rows=[]; let row=[], cell='', q=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i], nx=text[i+1];
    if(ch==='"'){
      if(q && nx==='"'){ cell+='"'; i++; }
      else q=!q;
    } else if(ch===delimiter && !q){ row.push(cell.trim()); cell=''; }
    else if((ch==='\n'||ch==='\r') && !q){
      if(ch==='\r'&&nx==='\n') i++;
      row.push(cell.trim()); rows.push(row); row=[]; cell='';
    } else cell+=ch;
  }
  if(cell || row.length){ row.push(cell.trim()); rows.push(row); }
  return rows;
}
function parseOFX(text, bank){
  const normalized = text.replace(/\r/g,'');
  const blocks = normalized.match(/<STMTTRN>[\s\S]*?(?=<STMTTRN>|<\/BANKTRANLIST>|$)/gi) || [];
  return blocks.map(bl=>{
    const get = tag => { const m=bl.match(new RegExp('<'+tag+'>([^<\n\r]+)','i')); return m ? m[1].trim() : ''; };
    const val = parseFloat((get('TRNAMT')||'0').replace(',','.'))||0;
    const name = get('MEMO') || get('NAME') || get('TRNTYPE') || 'Lançamento OFX';
    return buildImportRow({data:dateFromOFX(get('DTPOSTED')), nome:name, valor:val, banco:bank, original:name, source:'OFX'});
  }).filter(r=>r.valor);
}
function parseTextStatement(text, bank, fallbackYM, source){
  const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  const out=[];
  lines.forEach(line=>{
    if(/saldo\s+(anterior|atual|do dia|final)|total\s+do\s+periodo|total\s+do\s+período/i.test(line)) return;
    const dateM = line.match(/\b\d{1,2}[\/.-]\d{1,2}(?:[\/.-]\d{2,4})?\b|\b\d{4}[\/.-]\d{1,2}[\/.-]\d{1,2}\b/);
    if(!dateM) return;
    const moneyMatches = Array.from(line.matchAll(/(?:[-+]?\s*R\$\s*)?[-+]?\d{1,3}(?:\.\d{3})*,\d{2}|[-+]?\d+\.\d{2}/g)).map(m=>m[0]);
    if(!moneyMatches.length) return;
    const moneyRaw = moneyMatches[moneyMatches.length-1];
    let val = parseMoneyAny(moneyRaw);
    const nline = normalizeText(line);
    if(val>0 && /(debito|compra|pagamento|pix enviado|transferencia enviada|saque|tarifa|boleto|fatura|d\b)/.test(nline) && !/(credito|recebido|deposito|entrada|estorno)/.test(nline)) val = -Math.abs(val);
    if(val>0 && /\s-\s*R?\$?/.test(line)) val = -Math.abs(val);
    if(!val) return;
    let desc = line.replace(dateM[0],'').replace(moneyRaw,'').replace(/\s{2,}/g,' ').trim();
    desc = desc.replace(/^[|;\-–—]+|[|;\-–—]+$/g,'').trim();
    if(desc.length<2) desc='Lançamento importado';
    out.push(buildImportRow({data:isoFromAnyDate(dateM[0],fallbackYM), nome:desc, valor:val, banco:bank, original:line, source:source||'Texto'}));
  });
  return out;
}
function extractPdfTextBasic(buffer){
  const bytes = new Uint8Array(buffer);
  let raw='';
  const chunk = 0x8000;
  for(let i=0;i<bytes.length;i+=chunk){ raw += String.fromCharCode.apply(null, bytes.subarray(i,i+chunk)); }
  let text='';
  const stringMatches = raw.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || [];
  stringMatches.forEach(m=>{ text += m.replace(/\)\s*Tj$/,'').replace(/^\(/,'').replace(/\\([()\\])/g,'$1').replace(/\\n/g,'\n')+'\n'; });
  const arrMatches = raw.match(/\[(?:.|\n|\r){0,2000}?\]\s*TJ/g) || [];
  arrMatches.forEach(block=>{
    const parts = block.match(/\((?:\\.|[^\\)])*\)/g) || [];
    text += parts.map(p=>p.slice(1,-1).replace(/\\([()\\])/g,'$1')).join('')+'\n';
  });
  if(text.length<50){
    text = raw.replace(/[^\x09\x0A\x0D\x20-\x7EÀ-ÿ]/g,' ').replace(/\s{2,}/g,' ');
  }
  return text;
}
function parseAnyStatement(text, fileName, fallbackYM){
  const ext = (fileName.split('.').pop()||'').toLowerCase();
  const bank = detectBankFromText(text,fileName);
  let rows=[];
  if(ext==='ofx' || ext==='ofc' || /<OFX|<STMTTRN/i.test(text)) rows = parseOFX(text, bank);
  else if(ext==='csv' || looksLikeCSV(text)) rows = parseCSV(text, bank, fallbackYM);
  else rows = parseTextStatement(text, bank, fallbackYM, ext==='pdf'?'PDF textual':'Texto');
  return {bank, rows};
}
function looksLikeCSV(text){
  const first = text.split(/\r?\n/).slice(0,5).join('\n');
  return /data.*(valor|amount)|valor.*data/i.test(first) || (first.match(/;/g)||[]).length>4;
}

const ImportStatement = {
  setMode(mode){
    if(mode!=='file') return;
    const st=ensureImportState();
    st.mode=mode; st.lastError='';
    renderView();
  },
  drag(ev){ ev.preventDefault(); },
  drop(ev){ ev.preventDefault(); const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if(f) this.loadFile(f); },
  pickFile(ev){ const f = ev.target.files && ev.target.files[0]; if(f) this.loadFile(f); },
  loadFile(file){
    const st = ensureImportState();
    st.mode='file';
    st.loading=true; st.fileName=file.name; st.fileType=(file.name.split('.').pop()||'').toLowerCase(); st.lastError=''; st.parsed=[];
    const reader = new FileReader();
    reader.onerror = ()=>{ st.lastError='Não consegui ler esse arquivo.'; st.loading=false; renderView(); };
    reader.onload = ()=>{
      try{
        const fallbackYM = document.getElementById('import_month')?.value || st.referenceMonth || monthKey(S.month.y,S.month.m);
        st.referenceMonth=fallbackYM;
        let text='';
        if(st.fileType==='pdf'){
          text = extractPdfTextBasic(reader.result);
          if(!text || text.length<40) st.lastError='PDF carregado, mas o texto não parece estar selecionável. PDF escaneado/protegido precisa ser convertido para CSV/OFX/TXT.';
        } else {
          text = new TextDecoder('utf-8').decode(reader.result);
          if((text.match(/�/g)||[]).length>10) text = new TextDecoder('iso-8859-1').decode(reader.result);
        }
        st.rawText = text;
        const parsed = parseAnyStatement(text, file.name, fallbackYM);
        st.detectedBank = parsed.bank || '';
        st.selectedBank = resolveAccountId(st.selectedBank) || resolveAccountId(st.detectedBank) || '';
        st.parsed = parsed.rows.map(r=>{ const id=resolveAccountId(st.selectedBank)||r.accountId||resolveAccountId(r.banco); if(id){r.accountId=id;r.banco=accountNameSnapshot(id,r.banco);} r.duplicado=isDuplicate(r); if(r.duplicado) r.incluir=false; return r; });
        if(!st.parsed.length && !st.lastError) st.lastError='Arquivo lido, mas não encontrei lançamentos. Tente CSV/OFX ou um PDF com texto selecionável.';
        st.loading=false; renderView();
      }catch(e){ console.error(e); st.lastError='Erro ao interpretar o arquivo: '+(e.message||e); st.loading=false; renderView(); }
    };
    reader.readAsArrayBuffer(file);
    renderView();
  },
  reparseWithMonth(ym){
    const st=ensureImportState(); st.referenceMonth=ym||st.referenceMonth;
    if(!st.rawText || !st.fileName) return;
    const parsed = parseAnyStatement(st.rawText, st.fileName, ym || monthKey(S.month.y,S.month.m));
    st.detectedBank = parsed.bank || st.detectedBank || '';
    st.parsed = parsed.rows.map(r=>{ const id=resolveAccountId(st.selectedBank)||r.accountId||resolveAccountId(r.banco); if(id){r.accountId=id;r.banco=accountNameSnapshot(id,r.banco);} r.duplicado=isDuplicate(r); if(r.duplicado) r.incluir=false; return r; });
    renderView();
  },
  setBank(accountId, applyMissing){
    const st=ensureImportState(); st.selectedBank=resolveAccountId(accountId)||'';
    if(applyMissing){ st.parsed.forEach(r=>{ if(!r.accountId || r.banco===st.detectedBank){ r.accountId=st.selectedBank; r.banco=accountNameSnapshot(st.selectedBank,r.banco); } r.duplicado=isDuplicate(r); if(r.duplicado) r.incluir=false; }); }
    renderView();
  },
  applyBankToAll(){ const st=ensureImportState(); const accountId = resolveAccountId(document.getElementById('import_bank')?.value || st.selectedBank); st.selectedBank=accountId||''; st.parsed.forEach(r=>{ r.accountId=accountId||''; r.banco=accountNameSnapshot(accountId); r.duplicado=isDuplicate(r); if(r.duplicado) r.incluir=false; }); renderView(); },
  update(i,k,v){ const st=ensureImportState(); if(!st.parsed[i]) return; st.parsed[i][k]=v; if(k==='accountId') st.parsed[i].banco=accountNameSnapshot(v); if(['data','nome','valor','accountId'].includes(k)){ st.parsed[i].duplicado=isDuplicate(st.parsed[i]); if(st.parsed[i].duplicado) st.parsed[i].incluir=false; } renderView(); },
  updateMoney(i,value){ const n = Math.abs(parseMoneyAny(value)); this.update(i,'valor',n); },
  updateType(i,tipo){ const st=ensureImportState(); const r=st.parsed[i]; if(!r) return; r.tipo=tipo; r.categoria=inferCategory(tipo,r.nome); renderView(); },
  removeRow(i){ const st=ensureImportState(); st.parsed.splice(i,1); renderView(); },
  removeUnselected(){ const st=ensureImportState(); st.parsed = st.parsed.filter(r=>r.incluir); renderView(); },
  selectAll(flag){ const st=ensureImportState(); st.parsed.forEach(r=>{ r.incluir=!!flag && !r.duplicado; }); renderView(); },
  unselectDuplicates(){ const st=ensureImportState(); st.parsed.forEach(r=>{ if(r.duplicado) r.incluir=false; }); renderView(); },

  /* ---------- V5.34.1: ações especiais de importação ----------
     REVISAR_DUPLICIDADE — mostra só os possíveis duplicados e pede confirmação
     explícita antes de incluí-los (por padrão eles ficam de fora). */
  reviewDuplicates(){
    const st=ensureImportState();
    const dups = st.parsed.filter(r=>r.duplicado);
    if(!dups.length){ toast('Nenhum possível duplicado encontrado nesta prévia.'); return; }
    openChoiceModal({
      title:'Revisar duplicidade',
      sub: dups.length+' lançamento(s) parecem já existir no perfil (mesma data, valor e descrição aproximada). Nada é importado automaticamente.',
      choices:[
        {label:'Manter todos fora da importação', desc:'Recomendado. Esses lançamentos não entram na importação.', onClick:()=>{ dups.forEach(r=>r.incluir=false); closeModal(); renderView(); toast('Duplicados mantidos fora da importação.'); }},
        {label:'Incluir mesmo assim', desc:'Use somente se tiver certeza de que não é duplicidade real (ex.: duas compras iguais no mesmo dia).', variant:'danger', onClick:()=>{ dups.forEach(r=>r.incluir=true); closeModal(); renderView(); toast(dups.length+' possível(is) duplicado(s) marcado(s) para importar.'); }},
        {label:'Cancelar', onClick:closeModal}
      ]
    });
  },
  /* REVISAR_ANTES — mostra a lista final de tudo que será lançado, um passo a
     mais de confirmação além da tabela de prévia, antes de gravar qualquer coisa. */
  reviewBeforeImport(){
    const st=ensureImportState();
    const selected = st.parsed.filter(r=>r.incluir);
    if(!selected.length){ toast('Nada selecionado para revisar.'); return; }
    const list = selected.slice(0,40).map(r=>`<div style="display:flex;justify-content:space-between;gap:10px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:12.5px;"><span>${esc(r.data||'')} — ${esc(r.nome||'Lançamento importado')}${r.duplicado?' <b style="color:#fca5a5">(duplicado)</b>':''}</span><span>${brl(r.valor)}</span></div>`).join('');
    const more = selected.length>40 ? `<div style="opacity:.7;font-size:12px;margin-top:6px;">+ ${selected.length-40} outro(s) lançamento(s)...</div>` : '';
    const box = el(`<div class="modal-overlay"><div class="modal-box"><div class="modal-head"><h2>Revisar antes de importar</h2><button id="rv_close">&times;</button></div><p class="modal-sub">Confira os ${selected.length} lançamento(s) selecionado(s). Nada será gravado até você confirmar.</p><div style="max-height:320px;overflow:auto;margin:10px 0;">${list}${more}</div><div class="row-btns"><button class="btn btn-secondary btn-block" id="rv_cancel">Cancelar</button><button class="btn btn-primary btn-block" id="rv_confirm">Confirmar importação</button></div></div></div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#rv_close').onclick=closeModal; $('#rv_cancel').onclick=closeModal;
    $('#rv_confirm').onclick=()=>{ closeModal(); ImportStatement.commit(); };
  },
  clear(){
    const current=ensureImportState(); const mode=current.mode;
    S.importState=createEmptyImportState({mode}); renderView();
  },
  commit(){
    const st=ensureImportState();
    const selected = st.parsed.filter(r=>r.incluir);
    if(!selected.length){ toast('Nada selecionado para importar.'); return; }

    const prepared=[]; let ignored=0;
    for(const r of selected){
      if(isDuplicate(r)){ ignored++; continue; }
      const accountId=resolveAccountId(r.accountId||st.selectedBank||r.banco);
      if(!accountId){
        showBankRequiredModal('Escolha uma conta bancária ativa para todos os lançamentos selecionados antes de importar.');
        return;
      }
      const valor=Number(r.valor)||0;
      if(valor<=0 || !r.data || !r.nome){ toast('Revise data, descrição e valor dos lançamentos antes de importar.'); return; }
      prepared.push({r,accountId,banco:accountNameSnapshot(accountId)});
    }

    const before=JSON.parse(JSON.stringify(S.data));
    let trans=0, fixas=0;
    try{
      prepared.forEach(({r,accountId,banco})=>{
        if(r.tipo==='fixa'){
          const day = Math.min(31, Math.max(1, parseInt((r.data||'').slice(8,10),10)||1));
          S.data.fixas.push({id:uid(), nome:r.nome||'Despesa fixa importada', categoria:r.categoria||pickCat('fixa','Outro'), valor:Number(r.valor)||0, dia:day, startMonth:(r.data||todayISO()).slice(0,7), endMonth:null, accountId, banco, origemImportacao:{arquivo:st.fileName, original:r.original||''}});
          fixas++;
        } else {
          const tx={id:uid(), tipo:r.tipo==='receita'?'receita':'variavel', nome:r.nome||'Lançamento importado', data:r.data||todayISO(), categoria:r.categoria||pickCat(r.tipo==='receita'?'receita':'variavel','Outro'), valor:Number(r.valor)||0, accountId, banco, formaPagamento:r.tipo==='receita'?'Conta':'Débito/Pix', origemImportacao:{arquivo:st.fileName, original:r.original||''}};
          S.data.transacoes.push(tx);
          applyTxSaldoEffect(tx);
          trans++;
        }
      });
      saveCurrentData();
    }catch(e){
      console.error('[IMPORT][ROLLBACK]',e);
      S.data=before;
      saveCurrentData();
      toast('A importação falhou e nenhuma alteração financeira foi mantida.');
      return;
    }
    S.importState=createEmptyImportState({mode:'file'});
    renderView();
    toast(`Importação concluída: ${trans} lançamento(s), ${fixas} fixa(s)${ignored?`, ${ignored} duplicado(s) ignorado(s)`:''}.`);
  },
  /* IMPORTAR_COMO_SALDO_RESERVA — em vez de virar lançamentos do dia a dia,
     os itens selecionados viram movimentações de uma reserva (objetivo/caixinha).
     Pede confirmação e o nome/reserva de destino antes de gravar qualquer coisa. */
  commitAsReserve(){
    const st=ensureImportState();
    const selected = st.parsed.filter(r=>r.incluir);
    if(!selected.length){ toast('Nada selecionado para importar como saldo de reserva.'); return; }
    const accountIdPadrao = resolveAccountId(st.selectedBank)||resolveAccountId(st.detectedBank)||null;
    const bancoPadrao = accountNameSnapshot(accountIdPadrao,st.detectedBank||'');
    openModal({
      title:'Importar como saldo de reserva',
      sub:'Os '+selected.length+' lançamento(s) selecionados serão lançados como movimentações de uma reserva (não como lançamentos comuns). Escolha o nome da reserva de destino — se já existir uma reserva com esse nome, o saldo é somado a ela.',
      fields:[
        {key:'reservaNome', label:'Nome da reserva (nova ou existente)', type:'text', default: bancoPadrao || 'Reserva importada'}
      ],
      saveLabel:'Confirmar importação como reserva',
      onSave:(v)=>{
        const nome = (v.reservaNome||'').trim() || 'Reserva importada';
        if(!S.data.reservas) S.data.reservas={enabled:true, boxes:[], moves:[]};
        let box = S.data.reservas.boxes.find(b=>b.nome===nome);
        if(!box){ box={id:uid(), nome, accountId:accountIdPadrao, banco:bancoPadrao, valorAtual:0, valorMeta:0, status:'Ativa', metaId:null}; S.data.reservas.boxes.push(box); }
        selected.forEach(r=>{
          const v2 = Number(r.valor)||0;
          box.valorAtual = Math.round(((Number(box.valorAtual)||0) + v2)*100)/100;
          S.data.reservas.moves.push({id:uid(), banco:box.banco||bancoPadrao||'', data:r.data||todayISO(), tipo: v2>=0?'Reservar':'Resgatar', valor:Math.abs(v2), origemImportacao:{arquivo:st.fileName, original:r.original||'', reservaId:box.id}});
        });
        saveCurrentData();
        closeModal();
        S.importState=createEmptyImportState({mode:'file'});
        renderView();
        toast('Importado como saldo de reserva: '+selected.length+' movimentação(ões) em "'+nome+'".');
      }
    });
  }
};
