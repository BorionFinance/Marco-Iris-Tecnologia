/* Borion Finance V6.24.3 — Revisão visual de importação de perfis.
   Todo backup de conta abre um plano explícito: criar, substituir ou ignorar.
   Perfis atuais também podem ser mantidos ou excluídos de forma consciente. */

function importProfileName(profile, fallback='Perfil importado'){
  return String((profile&&(profile.name||profile.nome))||fallback).trim()||fallback;
}
function importProfileShortId(id){ return id ? String(id).slice(0,8) : 'sem-id'; }
function importProfileStats(data){
  const d=data||{};
  return {
    transacoes:(d.transacoes||[]).length,
    contas:(d.contas||[]).length,
    reservas:((d.reservas&&d.reservas.boxes)||[]).length,
    metas:(d.metas||[]).length
  };
}
function importNormalizeAccountBackup(obj){
  const dataByProfile=(obj&&obj.dataByProfile)||{};
  const declared=Array.isArray(obj&&obj.profiles)?obj.profiles:[];
  const keys=Object.keys(dataByProfile);
  const seen=new Set();
  const incoming=[];
  declared.forEach((profile,index)=>{
    const sourceId=profile&&profile.id ? String(profile.id) : (keys[index]||uid());
    if(seen.has(sourceId)) return;
    seen.add(sourceId);
    incoming.push({
      sourceId,
      profile:Object.assign({},profile||{},{id:sourceId,name:importProfileName(profile)}),
      data:migrateData(dataByProfile[sourceId]||emptyData(), {profileId:sourceId})
    });
  });
  keys.forEach(sourceId=>{
    if(seen.has(String(sourceId))) return;
    seen.add(String(sourceId));
    incoming.push({
      sourceId:String(sourceId),
      profile:{id:String(sourceId),name:'Perfil do backup'},
      data:migrateData(dataByProfile[sourceId]||emptyData(), {profileId:sourceId})
    });
  });
  return incoming;
}
function importKnownRemoteData(profileId){
  try{
    const snapshot=window.GoogleDriveProvider&&GoogleDriveProvider._lastConsolidatedPayload;
    return snapshot&&snapshot.dataByProfile&&snapshot.dataByProfile[String(profileId)]||null;
  }catch(_e){ return null; }
}
function importAsAuthoritativeData(rawData,targetProfileId,sourceProfileId,currentData){
  const migrated=migrateData(rawData||emptyData(),{profileId:targetProfileId||sourceProfileId||null});
  // V6.44.3 — preserva o estado das integrações (config + registros já
  // reconhecidos como importados, ex.: Marco Iris) do dispositivo atual.
  // O JSON importado normalmente não traz esse bloco interno. Sem preservá-lo,
  // um JSON corretivo que remove lançamentos vindos de uma integração perde a
  // marcação "já importado" desses registros — e a sincronização automática
  // (a cada 15s) os recria sozinha, desfazendo a correção minutos depois.
  if(currentData && currentData.interconnections) migrated.interconnections = JSON.parse(JSON.stringify(currentData.interconnections));
  if(!window.BorionSyncCore||typeof BorionSyncCore.markAuthoritativeImport!=='function') return migrated;
  const previous=[currentData,importKnownRemoteData(targetProfileId)].filter(Boolean);
  return BorionSyncCore.markAuthoritativeImport(migrated,{
    profileId:targetProfileId||null,
    sourceProfileId:sourceProfileId||null,
    previousData:previous,
    source:'manual_json_replace'
  });
}

function importUniqueName(base, profiles){
  const used=new Set((profiles||[]).map(p=>String(p.name||'').trim().toLocaleLowerCase('pt-BR')));
  const root=String(base||'Perfil importado').trim()||'Perfil importado';
  if(!used.has(root.toLocaleLowerCase('pt-BR'))) return root;
  let n=2;
  while(used.has((root+' '+n).toLocaleLowerCase('pt-BR'))) n++;
  return root+' '+n;
}
function collectAccountImportPlan(incoming, existing){
  const actions=Array.from(document.querySelectorAll('[data-import-source]')).map(sel=>({
    sourceId:sel.dataset.importSource,
    action:sel.value
  }));
  const deleteIds=Array.from(document.querySelectorAll('[data-import-delete]:checked')).map(inp=>inp.dataset.importDelete);
  const replacementTargets=actions.filter(a=>a.action.startsWith('replace:')).map(a=>a.action.slice(8));
  const duplicateTargets=replacementTargets.filter((id,index)=>replacementTargets.indexOf(id)!==index);
  if(duplicateTargets.length) throw new Error('Dois perfis do backup não podem substituir o mesmo perfil atual. Escolha destinos diferentes.');
  const deletingTarget=replacementTargets.find(id=>deleteIds.includes(id));
  if(deletingTarget) throw new Error('Um perfil marcado para receber dados também está marcado para exclusão. Desmarque a exclusão ou escolha outro destino.');
  const selected=actions.filter(a=>a.action!=='skip');
  if(!selected.length) throw new Error('Escolha pelo menos um perfil do backup para importar.');
  const newCount=actions.filter(a=>a.action==='new').length;
  const finalCount=existing.length-deleteIds.length+newCount;
  if(finalCount<1) throw new Error('A importação precisa deixar pelo menos um perfil na conta.');
  return {actions,deleteIds,finalCount,newCount,replacementTargets};
}
function importFindCurrentRow(profileId){
  return Array.from(document.querySelectorAll('[data-current-profile-row]')).find(row=>row.dataset.currentProfileRow===String(profileId))||null;
}
function importFindDeleteToggle(profileId){
  return Array.from(document.querySelectorAll('[data-import-delete]')).find(inp=>inp.dataset.importDelete===String(profileId))||null;
}
function renderAccountImportPlanSummary(incoming, existing){
  const summary=document.getElementById('import_plan_summary');
  const error=document.getElementById('import_plan_error');
  if(!summary) return;
  try{
    const plan=collectAccountImportPlan(incoming,existing);
    if(error){ error.textContent=''; error.classList.add('hidden'); }
    const imported=plan.actions.filter(a=>a.action!=='skip').length;
    summary.innerHTML=`<strong>Resultado previsto</strong><span>${imported} importado(s) · ${plan.replacementTargets.length} substituição(ões) · ${plan.newCount} novo(s) · ${plan.deleteIds.length} exclusão(ões) · ${plan.finalCount} perfil(is) ao final</span>`;
  }catch(e){
    summary.innerHTML='<strong>Plano incompleto</strong><span>Revise as escolhas abaixo.</span>';
    if(error){ error.textContent=e.message||String(e); error.classList.remove('hidden'); }
  }
  existing.forEach(profile=>{
    const row=importFindCurrentRow(profile.id);
    if(!row) return;
    const receiving=Array.from(document.querySelectorAll('[data-import-source]')).find(sel=>sel.value==='replace:'+profile.id);
    const deleting=importFindDeleteToggle(profile.id);
    const status=row.querySelector('.import-current-status');
    row.classList.toggle('will-replace',!!receiving);
    row.classList.toggle('will-delete',!!(deleting&&deleting.checked));
    if(status){
      if(deleting&&deleting.checked) status.textContent='Será excluído';
      else if(receiving){
        const src=incoming.find(x=>x.sourceId===receiving.dataset.importSource);
        status.textContent='Receberá '+importProfileName(src&&src.profile);
      }else status.textContent='Será mantido';
    }
  });
}
async function executeLocalAccountImportPlan(obj, incoming, plan){
  const safety=await buildFullBackupPayload();
  await storageProvider.createBackup('before_import',{payload:safety});
  const activeBefore=S.currentProfile&&S.currentProfile.id;
  try{
    let profiles=(S.profiles||[]).map(p=>Object.assign({},p));
    plan.deleteIds.forEach(id=>{
      if(window.BorionDataActions6401) BorionDataActions6401.deleteProfile(id,'import_plan_delete');
      profiles=profiles.filter(p=>String(p.id)!==String(id));
      try{ localStorage.removeItem(LS_DATA_PREFIX+id); }catch(_e){}
      try{ idbDeleteProfileData(id); }catch(_e){}
    });
    for(const action of plan.actions){
      const source=incoming.find(x=>x.sourceId===action.sourceId);
      if(!source||action.action==='skip') continue;
      if(action.action==='new'){
        const newId=uid();
        const name=importUniqueName(importProfileName(source.profile),profiles);
        const profile=Object.assign({},source.profile,{id:newId,name,cloud:false,createdAt:Date.now(),updatedAt:Date.now()});
        delete profile.user_id;
        profiles.push(profile);
        const data=importAsAuthoritativeData(source.data,newId,source.sourceId,null);
        setProfileData(newId,data);
      }else if(action.action.startsWith('replace:')){
        const targetId=action.action.slice(8);
        const idx=profiles.findIndex(p=>String(p.id)===String(targetId));
        if(idx<0) throw new Error('O perfil de destino não existe mais: '+targetId);
        const old=profiles[idx];
        const currentData=(S.currentProfile&&String(S.currentProfile.id)===String(old.id)&&S.data)?S.data:getProfileData(old.id);
        const data=importAsAuthoritativeData(source.data,old.id,source.sourceId,currentData);
        profiles[idx]=Object.assign({},old,source.profile,{
          id:old.id,
          name:importProfileName(source.profile,old.name),
          cloud:old.cloud||false,
          updatedAt:Date.now()
        });
        setProfileData(old.id,data);
      }
    }
    if(!profiles.length) throw new Error('Nenhum perfil restou após aplicar o plano.');
    S.profiles=profiles;
    setProfiles(S.profiles);
    const active=S.profiles.find(p=>String(p.id)===String(activeBefore))||S.profiles[0];
    S.currentProfile=active;
    S.data=migrateData(getProfileData(active.id)||emptyData(), {profileId:active.id});
    setProfileData(active.id,S.data);
    const driveResult=await notifyGoogleDriveAfterImport({authoritative:true});
    closeModal();
    renderApp();
    const summary='Importação concluída: '+plan.actions.filter(a=>a.action!=='skip').length+' perfil(is) processado(s), '+plan.deleteIds.length+' excluído(s).';
    toast(driveResult===false?summary+' O JSON já vale neste dispositivo; a confirmação no Google Drive ficou pendente.':summary+' O JSON importado agora é a versão oficial.');
  }catch(e){
    try{
      const currentIds=(S.profiles||[]).map(p=>p.id);
      const safeIds=(safety.profiles||[]).map(p=>p.id);
      currentIds.filter(id=>!safeIds.includes(id)).forEach(id=>{
        try{ localStorage.removeItem(LS_DATA_PREFIX+id); }catch(_e){}
        try{ idbDeleteProfileData(id); }catch(_e){}
      });
      applyAccountPayloadSilently(safety);
      const restored=(S.profiles||[]).find(p=>String(p.id)===String(activeBefore))||(S.profiles||[])[0]||null;
      S.currentProfile=restored;
      S.data=restored?migrateData(getProfileData(restored.id)||emptyData(), {profileId:restored.id}):null;
      if(restored) renderApp(); else renderGate();
    }catch(rollbackError){ console.error('[BORION_IMPORT_PLAN][ROLLBACK_ERROR]',rollbackError); }
    throw e;
  }
}
async function executeCloudAccountImportPlan(obj, incoming, plan){
  if(!navigator.onLine) throw new Error('Conecte-se à internet para aplicar perfis da conta na nuvem.');
  if(window.BackupFS) await BackupFS.createCloudBackup('before_import_review','backup automático antes da importação revisada de perfis',{silent:true});
  const currentCount=(CloudStorage.profiles||[]).length;
  const needFree=0;
  const deleteFirst=plan.deleteIds.slice(0,needFree);
  const deleteLater=plan.deleteIds.slice(needFree);

  for(const action of plan.actions){
    if(!action.action.startsWith('replace:')) continue;
    const source=incoming.find(x=>x.sourceId===action.sourceId);
    if(!source) continue;
    const targetId=action.action.slice(8);
    const currentData=(S.currentProfile&&String(S.currentProfile.id)===String(targetId)&&S.data)?S.data:getProfileData(targetId);
    const data=importAsAuthoritativeData(source.data,targetId,source.sourceId,currentData);
    const ok=await CloudStorage.saveNow(data,targetId);
    if(!ok) throw new Error('A nuvem não confirmou a substituição do perfil '+targetId+'.');
    const target=CloudStorage.profiles.find(p=>p.id===targetId);
    const incomingName=importProfileName(source.profile,target&&target.name);
    const metaPayload={
      name:incomingName,
      avatar_color:source.profile.avatarColor||source.profile.avatar_color||(target&&target.avatarColor)||avatarColor(incomingName),
      avatar_image:source.profile.avatarImage||source.profile.avatar_image||(target&&target.avatarImage)||'',
      updated_at:new Date().toISOString()
    };
    const {data:metaRow,error:metaError}=await CloudStorage.client
      .from('profiles')
      .update(metaPayload)
      .eq('id',targetId)
      .eq('user_id',CloudStorage.user.id)
      .select('id,name,avatar_color,avatar_image,updated_at')
      .single();
    if(metaError||!metaRow) throw new Error('Os dados foram gravados, mas a nuvem não confirmou a atualização do nome/avatar do perfil '+targetId+'.');
    if(target){ target.name=metaRow.name; target.avatarColor=metaRow.avatar_color; target.avatarImage=metaRow.avatar_image||''; }
    setProfileData(targetId,data);
  }
  for(const id of deleteFirst) await CloudStorage.deleteProfile(id);
  for(const action of plan.actions){
    if(action.action!=='new') continue;
    const source=incoming.find(x=>x.sourceId===action.sourceId);
    if(!source) continue;
    const name=importUniqueName(importProfileName(source.profile),CloudStorage.profiles||[]);
    await CloudStorage.createProfile(name,false,importAsAuthoritativeData(source.data,null,source.sourceId,null),{
      avatarColor:source.profile.avatarColor||source.profile.avatar_color||avatarColor(name),
      avatarImage:source.profile.avatarImage||source.profile.avatar_image||''
    });
  }
  for(const id of deleteLater) await CloudStorage.deleteProfile(id);
  await CloudStorage.loadProfiles();
  closeModal();
  renderApp();
  toast('Importação revisada concluída e sincronizada na nuvem.');
}
function openAccountImportReview(obj, options={}){
  const cloud=!!options.cloud;
  const incoming=importNormalizeAccountBackup(obj);
  const existing=(S.profiles||[]).slice();
  if(!incoming.length){ alert('Este backup não contém perfis utilizáveis.'); return; }
  let projectedNew=0;
  const incomingRows=incoming.map(item=>{
    const exact=existing.find(p=>String(p.id)===String(item.sourceId));
    const sameName=existing.filter(p=>normalizeAccountName(p.name)===normalizeAccountName(importProfileName(item.profile)));
    let defaultAction='skip';
    if(exact) defaultAction='replace:'+exact.id;
    else if(sameName.length===1) defaultAction='replace:'+sameName[0].id;
    else if(existing.length+projectedNew<5){ defaultAction='new'; projectedNew++; }
    const stats=importProfileStats(item.data);
    const optionsHTML=[
      `<option value="new" ${defaultAction==='new'?'selected':''}>Criar como novo perfil</option>`,
      ...existing.map(p=>`<option value="replace:${esc(p.id)}" ${defaultAction==='replace:'+p.id?'selected':''}>Substituir: ${esc(p.name)}</option>`),
      `<option value="skip" ${defaultAction==='skip'?'selected':''}>Não importar este perfil</option>`
    ].join('');
    const match=exact
      ? '<span class="import-match-badge">Mesmo ID do perfil atual</span>'
      : (sameName.length===1?'<span class="import-match-badge">Mesmo nome de um perfil atual</span>':'');
    return `<div class="import-source-card">
      <div class="import-profile-avatar">${profileAvatarHTML(Object.assign({},item.profile,{name:importProfileName(item.profile)}))}</div>
      <div class="import-source-main"><div class="import-source-title">${esc(importProfileName(item.profile))}${match}</div><div class="import-source-meta">ID ${esc(importProfileShortId(item.sourceId))} · ${stats.transacoes} lançamento(s) · ${stats.contas} conta(s) · ${stats.reservas} cofrinho(s) · ${stats.metas} meta(s)</div></div>
      <div class="import-source-action"><label>O que fazer</label><select data-import-source="${esc(item.sourceId)}">${optionsHTML}</select></div>
    </div>`;
  }).join('');
  const currentRows=existing.map(profile=>`<div class="import-current-row" data-current-profile-row="${esc(profile.id)}">
    <div class="import-current-main">${profileAvatarHTML(profile)}<div><strong>${esc(profile.name)}</strong><small>ID ${esc(importProfileShortId(profile.id))}${S.currentProfile&&S.currentProfile.id===profile.id?' · perfil ativo':''}</small></div></div>
    <span class="import-current-status">Será mantido</span>
    <label class="import-delete-toggle"><input type="checkbox" data-import-delete="${esc(profile.id)}"><span>Excluir este perfil atual</span></label>
  </div>`).join('');
  const box=el(`<div class="modal-overlay account-import-review-overlay">
    <div class="modal-box account-import-review-modal">
      <div class="modal-head"><div><h2>Revisar importação de perfis</h2><p class="modal-sub">Nada será alterado até você confirmar. Ao escolher Substituir, o JSON vira a versão oficial daquele perfil e remove tudo o que não existir nele.</p></div><button id="import_review_close">&times;</button></div>
      <div class="import-review-kpis"><div><small>No backup</small><strong>${incoming.length}</strong></div><div><small>Atuais</small><strong>${existing.length}/5</strong></div><div><small>Destino</small><strong>${cloud?'Conta na nuvem':'Este dispositivo'}</strong></div></div>
      <section class="import-review-section"><div class="import-review-title">Perfis encontrados no backup</div>${incomingRows}</section>
      <section class="import-review-section"><div class="import-review-title">Perfis atuais da conta</div><p class="import-review-help">Marque uma exclusão somente quando realmente quiser remover aquele perfil. Perfis usados como destino não podem ser excluídos.</p>${currentRows}</section>
      <div class="import-plan-summary" id="import_plan_summary"></div>
      <div class="import-plan-error hidden" id="import_plan_error"></div>
      <div class="import-review-actions"><button class="btn btn-secondary" id="import_review_cancel">Cancelar</button><button class="btn btn-primary" id="import_review_apply">Aplicar JSON como versão oficial</button></div>
    </div>
  </div>`);
  $('#modal-root').innerHTML='';
  $('#modal-root').appendChild(box);
  attachModalGuard(box);
  const refresh=()=>renderAccountImportPlanSummary(incoming,existing);
  box.querySelectorAll('select,input[type="checkbox"]').forEach(node=>node.addEventListener('change',refresh));
  $('#import_review_close').onclick=closeModal;
  $('#import_review_cancel').onclick=closeModal;
  $('#import_review_apply').onclick=async()=>{
    let plan;
    try{ plan=collectAccountImportPlan(incoming,existing); }
    catch(e){
      const err=$('#import_plan_error');
      if(err){ err.textContent=e.message||String(e); err.classList.remove('hidden'); }
      return;
    }
    const btn=$('#import_review_apply');
    if(btn){ btn.disabled=true; btn.textContent='Importando...'; }
    try{
      if(cloud) await executeCloudAccountImportPlan(obj,incoming,plan);
      else await executeLocalAccountImportPlan(obj,incoming,plan);
    }catch(e){
      alert('A importação não foi concluída: '+(e&&e.message?e.message:String(e)));
      if(btn){ btn.disabled=false; btn.textContent='Aplicar JSON como versão oficial'; }
    }
  };
  refresh();
}
window.openAccountImportReview=openAccountImportReview;
