/* Borion Finance — Guarda de integridade de dados (V6.37.0)
   Mesma proteção que foi construída para o Amanda Estética, adaptada aqui: antes
   de qualquer gravação no Google Drive (current.json da conta inteira, com todos
   os perfis), a contagem de registros financeiros é comparada com a última base
   confiável conhecida NESTE navegador. Uma queda brusca (zerar ou cair mais de
   40%) bloqueia a gravação em vez de sobrescrever uma base boa por uma vazia.

   Isso cobre uma falha que existia antes: syncNow() só recusava gravar quando
   TODOS os perfis da conta sumiam (profiles.length===0). Se os dados de UM
   perfil específico (transações, cartões, investimentos...) fossem resetados
   por qualquer motivo — cache corrompido, IndexedDB parcialmente limpo — sem o
   perfil em si desaparecer da lista, nada detectava isso.

   Módulo sem dependências de rede — só olha o payload que já está em memória,
   então não deixa nenhum salvamento mais lento. */

/* Coleções financeiras que, se caírem para zero (ou caírem muito) de uma hora
   para outra sem uma exclusão explícita, quase sempre indicam um perfil vazio
   ou corrompido sendo salvo por engano — nunca uma limpeza intencional (excluir
   uma transação de cada vez é uma ação explícita em outra tela, não por aqui). */
const BORION_CRITICAL_PATHS = [
  'transacoes', 'fixas', 'fixaPagamentos', 'liquidez', 'bens',
  'contas', 'cartoes', 'boletos', 'transferencias', 'agenda', 'metas',
  'assinaturas', ['investimentos', 'emCaixa'], ['investimentos', 'ativos'],
  ['cheques', 'items']
];

function borionPathKey(path){ return Array.isArray(path) ? path.join('.') : path; }
function borionReadPath(data, path){
  if(!data) return [];
  const parts = Array.isArray(path) ? path : [path];
  let cur = data;
  for(const part of parts){ cur = cur && cur[part]; }
  return Array.isArray(cur) ? cur : [];
}

/* Conta os registros de UM perfil (um dataByProfile[id]). */
function countProfileRecords(data){
  const counts = {};
  BORION_CRITICAL_PATHS.forEach(path=>{ counts[borionPathKey(path)] = borionReadPath(data, path).length; });
  return counts;
}

/* Soma as contagens de TODOS os perfis de um payload de conta (mesmo formato de
   buildFullBackupPayload/current.json: {profiles:[], dataByProfile:{}}). */
function countAccountRecords(payload){
  const counts = {};
  BORION_CRITICAL_PATHS.forEach(path=>{ counts[borionPathKey(path)] = 0; });
  const dataByProfile = payload && payload.dataByProfile;
  if(dataByProfile && typeof dataByProfile === 'object'){
    Object.keys(dataByProfile).forEach(profileId=>{
      const profileCounts = countProfileRecords(dataByProfile[profileId]);
      Object.keys(profileCounts).forEach(key=>{ counts[key] = (counts[key]||0) + profileCounts[key]; });
    });
  }
  counts.__total = Object.values(counts).reduce((sum, n)=> sum + (Number(n)||0), 0);
  counts.__profileCount = dataByProfile ? Object.keys(dataByProfile).length : 0;
  return counts;
}

const BORION_COLLECTION_LABELS = {
  transacoes: 'transações', fixas: 'despesas fixas', fixaPagamentos: 'pagamentos de fixas',
  liquidez: 'lançamentos de liquidez', bens: 'bens', contas: 'contas', cartoes: 'cartões',
  boletos: 'boletos', transferencias: 'transferências', agenda: 'agenda', metas: 'metas',
  assinaturas: 'assinaturas', 'investimentos.emCaixa': 'investimentos em caixa',
  'investimentos.ativos': 'ativos de investimento', 'cheques.items': 'cheques'
};
function borionLabel(key){ return BORION_COLLECTION_LABELS[key] || key; }

/* Mesma regra do Amanda Estética: zerou (tinha registros, foi pra 0) ou caiu mais
   de `dropRatio` (40% por padrão) numa coleção que tinha pelo menos `minForRatio`
   registros. Coleções pequenas (poucos itens) não disparam a checagem por
   proporção — só a de zerar. */
function detectSuspiciousAccountDrop(nextCounts, baselineCounts, options={}){
  const dropRatio = typeof options.dropRatio === 'number' ? options.dropRatio : 0.4;
  const minForRatio = typeof options.minForRatio === 'number' ? options.minForRatio : 5;
  const reasons = [];
  if(!nextCounts || !baselineCounts) return { suspicious:false, reasons };
  BORION_CRITICAL_PATHS.forEach(path=>{
    const key = borionPathKey(path);
    const before = Number(baselineCounts[key])||0;
    const after = Number(nextCounts[key])||0;
    if(before>0 && after===0) reasons.push({ key, before, after, kind:'zeroed' });
    else if(before>=minForRatio && after < before*(1-dropRatio)) reasons.push({ key, before, after, kind:'large-drop' });
  });
  // Também protege contra perfis inteiros desaparecendo (o que a checagem antiga
  // já cobria) — mantido aqui para ficar tudo num único lugar.
  if((baselineCounts.__profileCount||0) > 0 && (nextCounts.__profileCount||0) === 0){
    reasons.push({ key:'__profiles', before: baselineCounts.__profileCount, after: 0, kind:'zeroed' });
  }
  return { suspicious: reasons.length>0, reasons };
}
function describeSuspiciousAccountReasons(reasons){
  return (reasons||[]).map(r=>{
    const label = r.key==='__profiles' ? 'perfis da conta' : borionLabel(r.key);
    return r.kind==='zeroed' ? `${label}: ${r.before} → 0` : `${label}: ${r.before} → ${r.after}`;
  }).join(' · ');
}

/* Última contagem confiável conhecida, persistida por pasta do Drive (cada pasta
   é uma conta/família diferente). Só é atualizada depois de uma gravação ou
   leitura bem-sucedida e NÃO suspeita — nunca depois de um bloqueio. */
const LS_BORION_LAST_GOOD_COUNTS_PREFIX = 'borion_gdrive_last_good_counts_';
function borionReadLastGoodCounts(folderId){
  if(!folderId) return null;
  try{ return JSON.parse(localStorage.getItem(LS_BORION_LAST_GOOD_COUNTS_PREFIX+folderId) || 'null'); }
  catch(e){ return null; }
}
function borionWriteLastGoodCounts(folderId, counts){
  if(!folderId || !counts) return;
  try{ localStorage.setItem(LS_BORION_LAST_GOOD_COUNTS_PREFIX+folderId, JSON.stringify(counts)); }catch(e){}
}

window.BorionDataGuard = {
  BORION_CRITICAL_PATHS,
  countProfileRecords,
  countAccountRecords,
  detectSuspiciousAccountDrop,
  describeSuspiciousAccountReasons,
  readLastGoodCounts: borionReadLastGoodCounts,
  writeLastGoodCounts: borionWriteLastGoodCounts
};

/* ---------------- V6.40 — Data Guard por perfil (item 13 do pedido) ----------------
   Tudo abaixo é ADITIVO: nada do bloco acima muda de assinatura ou de
   comportamento. A checagem agregada (conta inteira) continua sendo a que
   protege toda gravação automática no Drive (ver syncNow em 01c); esta aqui é
   uma camada de diagnóstico mais fina, pensada para ser chamada sob demanda
   (ex.: antes de aplicar uma restauração, ou numa tela de diagnóstico) —
   sinaliza problemas que a checagem agregada pode não pegar porque o total da
   conta continua "normal" mesmo com UM perfil específico zerado ou com dados
   trocados. */

/* Perfil que desapareceu da lista de perfis mas ainda tem dados em
   dataByProfile, ou perfil listado sem nenhuma entrada em dataByProfile. */
function borionCheckProfileIndexIntegrity(payload){
  const problems = [];
  const profileIds = new Set((payload.profiles||[]).filter(p=>p&&p.id).map(p=>p.id));
  const dataByProfile = payload.dataByProfile || {};
  Object.keys(dataByProfile).forEach(pid=>{
    if(!profileIds.has(pid)) problems.push({ severity:'warning', profileId:pid, reason:'dataByProfile tem dados de um perfil que não está mais na lista de perfis (órfão) — nada foi apagado, só sinalizado.' });
  });
  profileIds.forEach(pid=>{
    if(!dataByProfile[pid]) problems.push({ severity:'critical', profileId:pid, reason:'perfil listado sem nenhuma entrada correspondente em dataByProfile.' });
  });
  return problems;
}

/* Queda suspeita analisada UM PERFIL DE CADA VEZ, em vez de somada com todos
   os outros — pega o caso do item 13: "coleção de um perfil que zerou" mesmo
   quando os outros perfis compensam o total agregado. */
function borionDetectPerProfileDrop(nextPayload, baselinePerProfileCounts, options){
  const results = {};
  const dataByProfile = nextPayload.dataByProfile || {};
  Object.keys(dataByProfile).forEach(pid=>{
    const nextCounts = countProfileRecords(dataByProfile[pid]);
    const baseline = baselinePerProfileCounts && baselinePerProfileCounts[pid];
    if(!baseline) return; // perfil novo — nada para comparar ainda
    const check = detectSuspiciousAccountDrop(nextCounts, baseline, options);
    if(check.suspicious) results[pid] = check.reasons;
  });
  return results;
}
function borionSnapshotPerProfileCounts(payload){
  const out = {};
  Object.keys(payload.dataByProfile||{}).forEach(pid=>{ out[pid] = countProfileRecords(payload.dataByProfile[pid]); });
  return out;
}
const LS_BORION_LAST_GOOD_PER_PROFILE_PREFIX = 'borion_gdrive_last_good_per_profile_';
function borionReadLastGoodPerProfileCounts(folderId){
  if(!folderId) return null;
  try{ return JSON.parse(localStorage.getItem(LS_BORION_LAST_GOOD_PER_PROFILE_PREFIX+folderId) || 'null'); }
  catch(e){ return null; }
}
function borionWriteLastGoodPerProfileCounts(folderId, counts){
  if(!folderId || !counts) return;
  try{ localStorage.setItem(LS_BORION_LAST_GOOD_PER_PROFILE_PREFIX+folderId, JSON.stringify(counts)); }catch(e){}
}

/* IDs duplicados dentro de uma mesma coleção — nunca deveria acontecer com
   UUIDs, mas registros migrados de versões muito antigas (ou uma importação
   malformada) podem ter colidido. */
function borionFindDuplicateIds(data){
  const dups = [];
  BORION_CRITICAL_PATHS.forEach(path=>{
    const arr = borionReadPath(data, path);
    const seen = new Map();
    arr.forEach(r=>{
      if(!r || !r.id) return;
      seen.set(r.id, (seen.get(r.id)||0)+1);
    });
    seen.forEach((count, id)=>{ if(count>1) dups.push({ collection: borionPathKey(path), id, count }); });
  });
  return dups;
}

/* Referências quebradas mais comuns no schema atual do Borion (item 13):
   pagamento de fixa sem a despesa fixa correspondente; cobrança de assinatura
   sem a assinatura; transferência sem a conta de origem/destino quando o tipo
   é 'conta' (contas-reserva usam outro campo e são ignoradas aqui). */
function borionFindBrokenReferences(data){
  const problems = [];
  const fixaIds = new Set((data.fixas||[]).map(f=>f&&f.id));
  (data.fixaPagamentos||[]).forEach(p=>{
    if(p && p.fixaId && !fixaIds.has(p.fixaId)) problems.push({ kind:'pagamento_sem_despesa', id:p.id, refId:p.fixaId });
  });
  const assinaturaIds = new Set((data.assinaturas||[]).map(a=>a&&a.id));
  (data.assinaturaCobrancas||[]).forEach(c=>{
    if(c && c.assinaturaId && !assinaturaIds.has(c.assinaturaId)) problems.push({ kind:'cobranca_sem_assinatura', id:c.id, refId:c.assinaturaId });
  });
  const contaIds = new Set((data.contas||[]).map(c=>c&&c.id).concat([typeof CARTEIRA_CONTA_ID!=='undefined'?CARTEIRA_CONTA_ID:'carteira-fixa']));
  (data.transferencias||[]).forEach(t=>{
    if(!t) return;
    if(t.origemTipo==='conta' && t.origemId && !contaIds.has(t.origemId)) problems.push({ kind:'transferencia_sem_origem', id:t.id, refId:t.origemId });
    if(t.destinoTipo==='conta' && t.destinoId && !contaIds.has(t.destinoId)) problems.push({ kind:'transferencia_sem_destino', id:t.id, refId:t.destinoId });
  });
  return problems;
}

/* Valores numéricos/datas obviamente inválidos (NaN, Infinity, string vazia
   onde deveria haver data) nos campos financeiros mais sensíveis. Não corrige
   nada — só relata, para decisão humana. */
function borionFindInvalidValues(data){
  const problems = [];
  const numericFieldsByCollection = { transacoes:['valor'], fixas:['valor'], boletos:['valor'], transferencias:['valor'], metas:['valorAlvo','valorAtual'] };
  Object.keys(numericFieldsByCollection).forEach(key=>{
    (data[key]||[]).forEach(rec=>{
      if(!rec) return;
      numericFieldsByCollection[key].forEach(field=>{
        const v = rec[field];
        if(v!=null && (typeof v!=='number' || !Number.isFinite(v))) problems.push({ collection:key, id:rec.id, field, value:v, kind:'numero_invalido' });
      });
    });
  });
  return problems;
}

/* Relatório único e completo por perfil (formato próximo ao pedido, item 13). */
function borionBuildProfileIntegrityReport(payload, baselinePerProfileCounts, options){
  const indexProblems = borionCheckProfileIndexIntegrity(payload);
  const dropsByProfile = borionDetectPerProfileDrop(payload, baselinePerProfileCounts, options);
  const report = { valid: true, profiles: {} };
  Object.keys(payload.dataByProfile||{}).forEach(pid=>{
    const data = payload.dataByProfile[pid];
    const dups = borionFindDuplicateIds(data);
    const broken = borionFindBrokenReferences(data);
    const invalid = borionFindInvalidValues(data);
    const drop = dropsByProfile[pid] || null;
    const hasProblems = dups.length || broken.length || invalid.length || drop;
    if(hasProblems) report.valid = false;
    report.profiles[pid] = { duplicatedIds: dups, brokenReferences: broken, invalidValues: invalid, suspiciousDrop: drop };
  });
  if(indexProblems.length){ report.valid = false; report.indexProblems = indexProblems; }
  return report;
}

Object.assign(window.BorionDataGuard, {
  checkProfileIndexIntegrity: borionCheckProfileIndexIntegrity,
  detectPerProfileDrop: borionDetectPerProfileDrop,
  snapshotPerProfileCounts: borionSnapshotPerProfileCounts,
  readLastGoodPerProfileCounts: borionReadLastGoodPerProfileCounts,
  writeLastGoodPerProfileCounts: borionWriteLastGoodPerProfileCounts,
  findDuplicateIds: borionFindDuplicateIds,
  findBrokenReferences: borionFindBrokenReferences,
  findInvalidValues: borionFindInvalidValues,
  buildProfileIntegrityReport: borionBuildProfileIntegrityReport
});
