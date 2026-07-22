/* Borion Cloud Foundation V5.36.0 — Supabase Auth + perfis financeiros + senha por perfil + backups de segurança. */

const BORION_SUPABASE_URL = 'https://tankddwzxmzgnmofeiar.supabase.co';
const BORION_SUPABASE_KEY = 'sb_publishable_oakxlWvcNNJs-taocnimzw_kr0rAQjw';
const BORION_ACTIVE_PROFILE_KEY = 'borion_active_cloud_profile_v2';
const BORION_CLOUD_CACHE = 'borion_cloud_profile_cache_v2';
const BORION_CLOUD_META = 'borion_cloud_meta_v2';
const BORION_CLOUD_PENDING = 'borion_cloud_pending_v2';
const BORION_DELETE_PENDING = 'borion_delete_account_pending_v1';

let _borionSupabaseLoadPromise=null;
async function ensureSupabaseLoaded(){
  if(window.supabase&&window.supabase.createClient)return window.supabase;
  if(_borionSupabaseLoadPromise)return _borionSupabaseLoadPromise;
  _borionSupabaseLoadPromise=new Promise((resolve,reject)=>{
    const src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
    const existing=document.querySelector(`script[src="${src}"]`);
    const script=existing||document.createElement('script');
    let settled=false;
    const finish=(err)=>{if(settled)return;settled=true;clearTimeout(timer);if(err){_borionSupabaseLoadPromise=null;reject(err);}else if(window.supabase&&window.supabase.createClient)resolve(window.supabase);else{_borionSupabaseLoadPromise=null;reject(new Error('O SDK do Supabase carregou sem expor createClient.'));}};
    const timer=setTimeout(()=>finish(Object.assign(new Error('O Supabase demorou além do limite de carregamento.'),{code:'SUPABASE_TIMEOUT'})),15000);
    script.addEventListener('load',()=>finish(),{once:true});
    script.addEventListener('error',()=>finish(new Error('Falha ao carregar o Supabase. Verifique sua internet.')),{once:true});
    if(!existing){script.src=src;script.async=true;script.defer=true;document.head.appendChild(script);}
    else if(window.supabase&&window.supabase.createClient)finish();
  });
  return _borionSupabaseLoadPromise;
}
window.ensureSupabaseLoaded=ensureSupabaseLoaded;

/* V6.3.0 — protege perfis criados no modo local (sem conta) de serem apagados da lista
   (LS_PROFILES) quando essa pessoa loga numa conta Supabase no mesmo navegador. Só
   preserva perfis com cloud !== true que ainda não estão na lista da nuvem — nunca
   mistura dados de dentro dos perfis, só evita que o registro do perfil local (e o
   acesso aos dados dele) desapareça do seletor. */
function mergeLocalAndCloudProfiles(cloudList){
  const cloud = cloudList || [];
  const cloudIds = new Set(cloud.map(p=>p.id));
  const existingLocal = (typeof getProfiles==='function' ? (getProfiles()||[]) : []).filter(p=> p && !p.cloud && !cloudIds.has(p.id));
  return [...cloud, ...existingLocal];
}

function cloudSafeClone(obj){ try{return JSON.parse(JSON.stringify(obj));}catch(e){return obj;} }
function cloudNowISO(){ return new Date().toISOString(); }
const BORION_PROFILE_COLUMNS_BASE = 'id,name,avatar_color,avatar_image,created_at,updated_at';
const BORION_PROFILE_COLUMNS_WITH_PASSWORD = 'id,name,avatar_color,avatar_image,password_hash,password_salt,created_at,updated_at';
function cloudIsMissingProfilePasswordColumns(err){
  const m = cloudErrorMessage(err);
  return /password_hash|password_salt|schema cache|Could not find.*password|column .*password/i.test(m);
}

function cloudErrorMessage(err){
  if(!err) return 'Erro desconhecido do Supabase.';
  if(typeof err === 'string') return err;
  const parts=[];
  if(err.message) parts.push(err.message);
  if(err.details) parts.push('details: '+err.details);
  if(err.hint) parts.push('hint: '+err.hint);
  if(err.code) parts.push('code: '+err.code);
  if(parts.length) return parts.join(' | ');
  try{ return JSON.stringify(err); }catch(e){ return String(err); }
}
function cloudActionLog(action, phase, payload){
  const msg = `[BORION_CLOUD][${action}][${phase}]`;
  if(phase==='ERROR') console.error(msg, payload||'');
  else console.log(msg, payload||'');
}
function cloudSupabaseError(action, error){
  const e = new Error(`${action}: ${cloudErrorMessage(error)}`);
  e.originalError = error;
  return e;
}
function cloudShowError(action, error){
  const msg = `${action}: ${cloudErrorMessage(error)}`;
  console.error(`[BORION_CLOUD][${action}][APP_ERROR]`, error);
  try{ toast(msg); }catch(_e){}
  return msg;
}
function cloudMergeData(base, incoming, profileId){
  const out = migrateData(cloudSafeClone(base || emptyData()), {profileId});
  const inc = migrateData(cloudSafeClone(incoming || emptyData()), {profileId});
  Object.keys(inc).forEach(k=>{
    if(Array.isArray(inc[k])){
      const seen = new Set((out[k]||[]).map(x=>x && x.id).filter(Boolean));
      out[k] = (out[k]||[]).concat(inc[k].filter(x=>!x || !x.id || !seen.has(x.id)));
    }else if(inc[k] && typeof inc[k]==='object' && !Array.isArray(inc[k])){
      out[k] = Object.assign({}, out[k]||{}, inc[k]);
    }else out[k] = inc[k];
  });
  return migrateData(out, {profileId});
}

const CloudStorage = {
  client:null, user:null, profiles:[], activeProfileId:null, dataRowId:null,
  status:'offline', statusText:'Offline', dirty:false, syncTimer:null,
  lastSyncAt:null, pendingReason:'', recoveryMode:false, deleteEmailReturnPending:false, schemaError:null, profilePasswordColumnsReady:null,

  async init(options={}){
    const force=!!options.force;
    this.recoveryMode=/type=recovery|password_recovery|PASSWORD_RECOVERY/i.test(location.hash+location.search);
    const mode=typeof getStorageMode==='function'?getStorageMode():null;
    if(!force&&!this.recoveryMode&&mode!=='cloud'&&mode!=='supabase'){
      this.client=null;this.user=null;return null;
    }
    await ensureSupabaseLoaded();
    if(this.client)return this.user;
    this.client=window.supabase.createClient(BORION_SUPABASE_URL,BORION_SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    window.addEventListener('online',()=>{this.setStatus('syncing','Internet voltou');this.syncNow();this.retryPendingProfileMeta();});
    window.addEventListener('offline',()=>{this.setStatus('offline','Offline — salvando neste dispositivo');});
    window.addEventListener('beforeunload',e=>{if(window.__borionConfirmedExit){if(this.hasPendingSync())this.syncNow();return;}if(this.hasPendingSync()){e.preventDefault();e.returnValue='Existem dados do Borion ainda não sincronizados na nuvem.';return e.returnValue;}});
    window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&this.user&&S&&S.data)this.syncNow();});
    window.addEventListener('pagehide',()=>{if(this.user&&S&&S.data)this.syncNow();});
    this.client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){this.user=session&&session.user?session.user:this.user;this.recoveryMode=true;setTimeout(()=>{CloudAuth.mode='changePassword';CloudAuth.info='Digite uma nova senha para finalizar a recuperação.';CloudAuth.error='';CloudAuth.render();},80);}});
    const {data}=await this.client.auth.getSession();
    this.user=data&&data.session?data.session.user:null;
    this.deleteEmailReturnPending=this.consumeDeleteAccountMagicLinkReturn();
    this.setStatus(navigator.onLine?(this.user?'online':'offline'):'offline',this.user?'Nuvem pronta':'Offline');
    return this.user;
  },

  setStatus(status,text){ this.status=status; this.statusText=text||status; this.updateBadge(); this.updateBottomNotice(); },
  statusLabel(){
    if(this.status==='online') return (this.statusText && this.statusText!=='online') ? ('Online — '+String(this.statusText).replace(/^Online\s*—\s*/,'')) : 'Online — Nuvem sincronizada';
    if(this.status==='syncing') return 'Online — Sincronizando...';
    if(this.status==='dirty') return 'Online — Dados pendentes de envio';
    if(this.status==='offline'){
      if(this.statusText && this.statusText!=='offline' && this.statusText!=='Offline') return this.statusText;
      return navigator.onLine ? 'Erro ao sincronizar — cache local' : 'Offline — Salvando neste dispositivo';
    }
    return this.statusText||'Nuvem';
  },
  updateBadge(){ const el=document.getElementById('cloud_status_badge'); if(!el) return; el.className='cloud-status '+this.status; el.textContent=this.statusLabel(); el.title=this.lastSyncAt?'Última sincronização: '+new Date(this.lastSyncAt).toLocaleString('pt-BR'):'Ainda sem sincronização nesta sessão'; },
  updateBottomNotice(){
    let el=document.getElementById('cloud_bottom_notice');
    if(!el){ el=document.createElement('div'); el.id='cloud_bottom_notice'; document.body.appendChild(el); }
    // V6.14.0 — esse aviso é só sobre sincronização com o Supabase. Antes aparecia
    // pra qualquer pessoa (mesmo usando Google Drive ou modo local, sem Supabase
    // nenhum), porque init() sempre chama setStatus() independente do modo em uso.
    if(!this.user){ el.className='cloud-bottom-notice'; el.innerHTML=''; return; }
    const show = this.status==='offline' || this.status==='dirty' || this.hasPendingSync();
    el.className='cloud-bottom-notice '+this.status+(show?' show':'');
    el.innerHTML = `<strong>${esc(this.statusLabel())}</strong>${this.lastSyncAt?`<span>Última sincronização: ${esc(new Date(this.lastSyncAt).toLocaleTimeString('pt-BR'))}</span>`:''}<button onclick="CloudStorage.syncNow()">Sincronizar</button>`;
  },

  cacheKey(profileId){ return BORION_CLOUD_CACHE+'_'+(this.user?this.user.id:'anon')+'_'+(profileId||this.activeProfileId||'none'); },
  pendingKey(profileId){ return BORION_CLOUD_PENDING+'_'+(this.user?this.user.id:'anon')+'_'+(profileId||this.activeProfileId||'none'); },
  metaKey(){ return BORION_CLOUD_META+'_'+(this.user?this.user.id:'anon'); },
  readCache(profileId){ return readJSON(this.cacheKey(profileId), null); },
  writeCache(data, profileId){
    const pid = profileId || this.activeProfileId;
    if(!pid) return;
    writeJSON(this.cacheKey(pid), {data, profileId:pid, savedAt:Date.now()});
    writeJSON(this.metaKey(), {userId:this.user?this.user.id:null,email:this.user?this.user.email:null,activeProfileId:pid,savedAt:Date.now(),pending:this.dirty,lastSyncAt:this.lastSyncAt});
  },
  saveActiveProfileId(id){
    // V5.34.2 — nunca persiste um id que não seja um UUID válido: isso é o que
    // causava "invalid input syntax for type uuid" ao tentar sincronizar depois.
    if(!isValidUUID(id)){ console.warn('Borion Cloud: ignorando activeProfileId inválido (não é UUID):', id); return; }
    this.activeProfileId=id; if(this.user) localStorage.setItem(BORION_ACTIVE_PROFILE_KEY+'_'+this.user.id, id);
  },
  getSavedActiveProfileId(){
    if(!this.user) return null;
    const saved = localStorage.getItem(BORION_ACTIVE_PROFILE_KEY+'_'+this.user.id);
    if(saved && !isValidUUID(saved)){
      // Id antigo (de uma versão anterior ao UUID real) preso no localStorage — descarta.
      console.warn('Borion Cloud: activeProfileId salvo não é um UUID válido, descartando:', saved);
      localStorage.removeItem(BORION_ACTIVE_PROFILE_KEY+'_'+this.user.id);
      return null;
    }
    return saved;
  },

  async signUp(email,password,name){ const {data,error}=await this.client.auth.signUp({email,password,options:{data:{name:name||email}}}); if(error) throw error; this.user=data.user||(data.session&&data.session.user)||null; return data; },
  async signIn(email,password){ const {data,error}=await this.client.auth.signInWithPassword({email,password}); if(error) throw error; this.user=data.user; return data; },
  async resetPassword(email){ const redirectTo=location.origin+location.pathname; const {error}=await this.client.auth.resetPasswordForEmail(email,{redirectTo}); if(error) throw error; },
  async updatePassword(newPassword){ if(!newPassword||newPassword.length<6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.'); const {data,error}=await this.client.auth.updateUser({password:newPassword}); if(error) throw error; this.user=data&&data.user?data.user:this.user; this.recoveryMode=false; return data; },
  /* V5.34.3 — troca de senha "de verdade": exige a senha atual, reautentica
     com ela (signInWithPassword de novo com o e-mail atual) para confirmar
     que quem está pedindo a troca realmente conhece a senha em uso, e só
     então chama updateUser({password:novaSenha}). O Supabase Auth não expõe
     um "verificar senha" isolado — reautenticar é a forma recomendada. */
  async changePasswordWithCurrentPassword(currentPassword, newPassword){
    if(!this.user || !this.user.email) throw new Error('Você precisa estar logado para trocar a senha.');
    if(!currentPassword) throw new Error('Digite a senha atual.');
    if(!newPassword || newPassword.length<6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
    const { error: reauthError } = await this.client.auth.signInWithPassword({ email:this.user.email, password: currentPassword });
    if(reauthError) throw new Error('Senha atual incorreta.');
    const { data, error } = await this.client.auth.updateUser({ password:newPassword });
    if(error) throw error;
    this.user = data && data.user ? data.user : this.user;
    return true;
  },

  /* V5.39.6 — exclusão de conta com confirmação por e-mail via link mágico.
     O Supabase padrão envia um e-mail em inglês com o botão/link "Sign in".
     O Borion explica isso na tela e usa o retorno do link como confirmação
     de identidade antes da última senha e da exclusão definitiva. */
  async verifyAccountPasswordForDeletion(password){
    if(!this.client || !this.user || !this.user.email) throw new Error('Você precisa estar logado para excluir a conta.');
    if(!password) throw new Error('Digite a senha da conta.');
    const { error } = await this.client.auth.signInWithPassword({ email:this.user.email, password });
    if(error) throw new Error('Senha incorreta.');
    this.deleteFirstPasswordVerifiedAt = Date.now();
    return true;
  },
  deleteAccountRedirectUrl(){
    const path = String(location.pathname||'/').replace(/\/?index\.html$/i,'/');
    const normalizedPath = path.endsWith('/') ? path : path + '/';
    const url = new URL(location.origin + normalizedPath);
    url.searchParams.set('borion_delete_confirm','1');
    return url.toString();
  },
  readDeletePending(){
    const raw = readJSON(BORION_DELETE_PENDING, null);
    if(!raw || !raw.requestedAt) return null;
    if(Date.now() - Number(raw.requestedAt||0) > 30*60*1000){
      try{ localStorage.removeItem(BORION_DELETE_PENDING); }catch(_e){}
      return null;
    }
    return raw;
  },
  writeDeletePending(extra){
    if(!this.user || !this.user.email) return;
    const current = this.readDeletePending() || {};
    const payload = Object.assign({}, current, extra||{}, {
      email:String(this.user.email||'').trim().toLowerCase(),
      userId:this.user.id,
      requestedAt:(current.requestedAt || Date.now()),
      updatedAt:Date.now()
    });
    writeJSON(BORION_DELETE_PENDING, payload);
  },
  clearDeletePending(){ try{ localStorage.removeItem(BORION_DELETE_PENDING); }catch(_e){} },
  async sendDeleteAccountMagicLink(){
    if(!this.client || !this.user || !this.user.email) throw new Error('Você precisa estar logado para excluir a conta.');
    if(!this.deleteFirstPasswordVerifiedAt || (Date.now()-this.deleteFirstPasswordVerifiedAt)>10*60*1000) throw new Error('Por segurança, confirme a senha antes de enviar o e-mail.');
    const email = String(this.user.email||'').trim().toLowerCase();
    this.deleteEmailVerifiedAt = 0;
    this.deleteEmailVerifiedFor = '';
    const redirectTo = this.deleteAccountRedirectUrl();
    this.writeDeletePending({firstPasswordVerifiedAt:this.deleteFirstPasswordVerifiedAt, emailVerifiedAt:0, redirectTo});
    const { error } = await this.client.auth.signInWithOtp({
      email,
      options:{ shouldCreateUser:false, emailRedirectTo:redirectTo }
    });
    if(error) throw error;
    this.deleteEmailCodeRequestedAt = Date.now();
    return true;
  },
  consumeDeleteAccountMagicLinkReturn(){
    const marker = /(?:\?|&)borion_delete_confirm=1\b/i.test(location.search||'') || /borion_delete_confirm=1/i.test(location.hash||'');
    if(!marker) return false;
    const email = this.user && this.user.email ? String(this.user.email||'').trim().toLowerCase() : '';
    if(email){
      const pending = this.readDeletePending() || {};
      this.deleteEmailVerifiedAt = Date.now();
      this.deleteEmailVerifiedFor = email;
      if(pending.firstPasswordVerifiedAt) this.deleteFirstPasswordVerifiedAt = Number(pending.firstPasswordVerifiedAt||0);
      this.writeDeletePending({emailVerifiedAt:this.deleteEmailVerifiedAt, emailVerifiedFor:email, firstPasswordVerifiedAt:this.deleteFirstPasswordVerifiedAt||0});
    }
    try{
      const clean = new URL(location.href);
      clean.searchParams.delete('borion_delete_confirm');
      const keepHash = clean.hash && !/access_token|refresh_token|type=/i.test(clean.hash);
      history.replaceState(null, document.title, clean.pathname + (clean.search||'') + (keepHash?clean.hash:''));
    }catch(_e){}
    return true;
  },
  isDeleteEmailVerified(){
    if(!this.user || !this.user.email) return false;
    const email = String(this.user.email||'').trim().toLowerCase();
    const pending = this.readDeletePending();
    if(pending && String(pending.emailVerifiedFor||'').toLowerCase()===email && pending.emailVerifiedAt && (Date.now()-Number(pending.emailVerifiedAt)) < 10*60*1000){
      this.deleteEmailVerifiedAt = Number(pending.emailVerifiedAt);
      this.deleteEmailVerifiedFor = email;
    }
    return !!(this.deleteEmailVerifiedAt && this.deleteEmailVerifiedFor===email && (Date.now()-this.deleteEmailVerifiedAt) < 10*60*1000);
  },
  async deleteAccountWithCredentials(email, password){
    const action='DELETE_ACCOUNT';
    if(!this.client || !this.user || !this.user.email) throw new Error('Você precisa estar logado para excluir a conta.');
    const currentEmail=String(this.user.email||'').trim().toLowerCase();
    const typedEmail=String(email||'').trim().toLowerCase();
    if(typedEmail!==currentEmail) throw new Error('O e-mail digitado não confere com a conta logada.');
    if(!this.isDeleteEmailVerified()) throw new Error('Confirme o e-mail pelo link mágico antes de excluir.');
    if(!this.deleteFirstPasswordVerifiedAt || (Date.now()-this.deleteFirstPasswordVerifiedAt)>30*60*1000) throw new Error('Por segurança, confirme a senha inicial novamente antes de excluir.');
    if(!password) throw new Error('Digite a senha da conta.');
    const deletedUserId=this.user.id;
    const oldProfiles=(this.profiles&&this.profiles.length?this.profiles:(typeof S!=='undefined'&&S.profiles)||[]).slice();
    const {error: reauthError}=await this.client.auth.signInWithPassword({email:this.user.email,password});
    if(reauthError) throw new Error('E-mail ou senha incorretos.');
    try{ if(window.BackupFS) await BackupFS.createCloudBackup('before_delete_account','backup automático antes de excluir a conta',{silent:true}); }catch(e){ console.warn('[BORION_CLOUD][DELETE_ACCOUNT][BACKUP_WARN]', e); }
    const {error: rpcError}=await this.client.rpc('delete_own_account');
    if(rpcError){
      throw new Error('Não foi possível excluir a conta no Supabase. Verifique se a função de exclusão da conta está configurada e tente de novo. Erro original: '+cloudErrorMessage(rpcError));
    }
    try{ await this.client.auth.signOut(); }catch(_e){}
    oldProfiles.forEach(pr=>{
      try{ localStorage.removeItem(LS_DATA_PREFIX+pr.id); }catch(_e){}
      try{ idbDeleteProfileData(pr.id); }catch(_e){}
      try{ localStorage.removeItem(BORION_CLOUD_CACHE+'_'+deletedUserId+'_'+pr.id); }catch(_e){}
      try{ localStorage.removeItem(BORION_CLOUD_PENDING+'_'+deletedUserId+'_'+pr.id); }catch(_e){}
    });
    try{ localStorage.removeItem(BORION_ACTIVE_PROFILE_KEY+'_'+deletedUserId); }catch(_e){}
    try{ localStorage.removeItem(BORION_CLOUD_META+'_'+deletedUserId); }catch(_e){}
    this.user=null; this.profiles=[]; this.activeProfileId=null; this.dataRowId=null; this.dirty=false; this.schemaError=null;
    this.deleteEmailVerifiedAt=0; this.deleteEmailVerifiedFor=''; this.deleteFirstPasswordVerifiedAt=0; this.clearDeletePending();
    setSession(null); S.currentProfile=null; S.data=null; S.profiles=[]; setProfiles([]);
    this.setStatus('offline','Conta excluída');
    cloudActionLog(action,'SUCCESS',{userId:deletedUserId});
    return true;
  },
  async signOut(){ try{ if(this.user && S && S.data) await this.syncNow(); }catch(e){} try{ await this.client.auth.signOut(); }catch(e){} this.user=null; this.profiles=[]; this.activeProfileId=null; this.dataRowId=null; this.dirty=false; setSession(null); },

  async ensureDefaultProfile(){
    if(this.profiles.length) return this.profiles;
    const name = (this.user.user_metadata && this.user.user_metadata.name) || (this.user.email ? this.user.email.split('@')[0] : 'Perfil principal');
    const legacy = await this.loadLegacyBorionData();
    await this.createProfile(name || 'Perfil principal', false, legacy || emptyData());
    return this.profiles;
  },
  mapProfile(row){ return {id:row.id,name:row.name||'Perfil',email:this.user?this.user.email:'',cloud:true,avatarColor:row.avatar_color||'#1f8a5b',avatarImage:row.avatar_image||'',passwordHash:row.password_hash||null,salt:row.password_salt||null,createdAt:row.created_at?Date.parse(row.created_at):Date.now(),updatedAt:row.updated_at?Date.parse(row.updated_at):Date.now()}; },

  /* V5.34.7 — ponto central de verdade para sincronizar a lista de perfis
     entre CloudStorage, S.profiles, localStorage e S.currentProfile. Antes, o
     Supabase confirmava INSERT/UPDATE/DELETE, mas a tela continuava presa numa
     lista antiga em memória até o F5. */
  applyProfilesToRuntime(activeId){
    const list=(this.profiles||[]).slice().sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
    this.profiles=list;
    if(typeof S!=='undefined') {
      S.profiles=list;
      const wantedId = activeId || (S.currentProfile && S.currentProfile.id) || this.activeProfileId;
      const fresh = wantedId ? list.find(p=>p.id===wantedId) : null;
      if(fresh) S.currentProfile=fresh;
    }
    // V6.3.0 — persiste nuvem + preserva perfis locais (modo offline) que ainda não
    // estão nesta conta. S.profiles (acima) continua só com a lista da nuvem, pra não
    // misturar visualmente no seletor durante a sessão logada — só o storage local
    // (LS_PROFILES) guarda os dois, pra não perder o perfil local quando essa pessoa
    // sair da conta ou abrir o Borion offline de novo.
    setProfiles(mergeLocalAndCloudProfiles(list));
    cloudActionLog('RUNTIME_STATE','PROFILES_APPLIED',{count:list.length, activeProfileId:(typeof S!=='undefined'&&S.currentProfile)?S.currentProfile.id:this.activeProfileId, profileIds:list.map(p=>p.id)});
    return list;
  },

  async loadProfiles(){
    const action='LOAD_PROFILES';
    this.schemaError=null;
    cloudActionLog(action,'START',{userId:this.user&&this.user.id, online:navigator.onLine});
    if(!this.user){ cloudActionLog(action,'SKIP',{reason:'sem usuário logado'}); return []; }
    if(!navigator.onLine){
      const local = readJSON(this.metaKey(), null);
      const profs = getProfiles().filter(p=>p.cloud && (!p.user_id || p.user_id===this.user.id) && isValidUUID(p.id));
      this.profiles=profs;
      if(local && local.activeProfileId && isValidUUID(local.activeProfileId) && profs.some(p=>p.id===local.activeProfileId)){
        this.activeProfileId=local.activeProfileId;
      } else if(profs.length){
        this.activeProfileId=profs[0].id;
      }
      this.applyProfilesToRuntime(this.activeProfileId);
      cloudActionLog(action,'OFFLINE_CACHE',{count:profs.length, activeProfileId:this.activeProfileId});
      return profs;
    }
    try{
      let {data,error}=await this.client
        .from('profiles')
        .select(BORION_PROFILE_COLUMNS_WITH_PASSWORD)
        .eq('user_id',this.user.id)
        .order('created_at',{ascending:true});
      if(error && cloudIsMissingProfilePasswordColumns(error)){
        this.profilePasswordColumnsReady=false;
        this.schemaError='Colunas de senha por perfil ausentes em public.profiles. Rode o SQL V5.34.8 no Supabase para ativar senha por perfil.';
        cloudActionLog(action,'PASSWORD_COLUMNS_MISSING_RETRY_BASE',{message:cloudErrorMessage(error)});
        const fallback=await this.client
          .from('profiles')
          .select(BORION_PROFILE_COLUMNS_BASE)
          .eq('user_id',this.user.id)
          .order('created_at',{ascending:true});
        data=fallback.data; error=fallback.error;
      } else if(!error) {
        this.profilePasswordColumnsReady=true;
      }
      if(error) throw cloudSupabaseError(action+' select profiles', error);

      this.profiles=(data||[]).map(r=>this.mapProfile(r));
      cloudActionLog(action,'SELECT_CONFIRMED',{count:this.profiles.length, profileIds:this.profiles.map(p=>p.id)});

      if(!this.profiles.length){
        await this.ensureDefaultProfile();
      }
      if(!this.profiles.length){
        throw new Error(action+': Supabase respondeu sem perfis e não foi possível criar o perfil principal.');
      }

      const saved=this.getSavedActiveProfileId();
      const active=(saved && this.profiles.some(p=>p.id===saved)) ? saved : this.profiles[0].id;
      this.saveActiveProfileId(active);
      this.applyProfilesToRuntime(active);
      await this.retryPendingProfileMeta();
      cloudActionLog(action,'SUCCESS',{count:this.profiles.length, activeProfileId:this.activeProfileId});
      return this.profiles;
    }catch(e){
      const msg=cloudErrorMessage(e);
      this.schemaError=msg;
      this.profiles=[];
      this.setStatus('offline','Erro Supabase: '+msg);
      cloudActionLog(action,'ERROR',{message:msg, error:e});
      cloudShowError(action,e);
      throw (e instanceof Error ? e : new Error(msg));
    }
  },
  async loadLegacyBorionData(){
    try{
      const {data,error}=await this.client.from('borion_data').select('data,updated_at').eq('user_id',this.user.id).order('updated_at',{ascending:false}).limit(1);
      if(error || !data || !data.length) return null;
      return migrateData(data[0].data || emptyData());
    }catch(e){ return null; }
  },
  async createProfile(name, activate=true, initialData=null, options={}){
    const action='CREATE_PROFILE';
    if(!this.client) throw new Error(action+': Supabase não foi inicializado.');
    if(!this.user) throw new Error(action+': É preciso estar logado.');
    const cleanName=(name||'Novo perfil').trim() || 'Novo perfil';
    cloudActionLog(action,'START',{name:cleanName, activate, userId:this.user.id});
    try{
      const {count,error:countError}=await this.client
        .from('profiles')
        .select('id',{count:'exact',head:true})
        .eq('user_id',this.user.id);
      if(countError) throw cloudSupabaseError(action+' count profiles', countError);

      const row={user_id:this.user.id,name:cleanName,avatar_color:(options&&options.avatarColor)||avatarColor(cleanName),avatar_image:(options&&options.avatarImage)||'',updated_at:cloudNowISO()};
      if(options && (options.passwordHash || options.passwordSalt)){
        if(this.profilePasswordColumnsReady===false) throw new Error('Para usar senha em perfil financeiro, rode o SQL V5.34.8 no Supabase. As colunas password_hash/password_salt ainda não existem em profiles.');
        row.password_hash=options.passwordHash||null;
        row.password_salt=options.passwordSalt||null;
      }
      const selectCols = (row.password_hash || this.profilePasswordColumnsReady!==false) ? BORION_PROFILE_COLUMNS_WITH_PASSWORD : BORION_PROFILE_COLUMNS_BASE;
      const {data:inserted,error:insertError}=await this.client
        .from('profiles')
        .insert(row)
        .select(selectCols)
        .single();
      if(insertError) throw cloudSupabaseError(action+' insert profiles', insertError);
      if(!inserted || !inserted.id) throw new Error(action+': o Supabase não retornou o perfil inserido em profiles.');
      if(!isValidUUID(inserted.id)) throw new Error(action+': o Supabase retornou um id de perfil inesperado (não é UUID). Verifique a coluna profiles.id.');
      cloudActionLog(action,'PROFILES_INSERT_CONFIRMED',{profileId:inserted.id, row:inserted});

      const {data:confirmed,error:confirmError}=await this.client
        .from('profiles')
        .select(selectCols)
        .eq('id',inserted.id)
        .eq('user_id',this.user.id)
        .single();
      if(confirmError) throw cloudSupabaseError(action+' confirm profiles insert', confirmError);
      if(!confirmed || confirmed.id!==inserted.id) throw new Error(action+': não consegui confirmar o perfil recém-criado na tabela profiles.');
      const profile=this.mapProfile(confirmed);

      const seedData = migrateData(initialData || emptyData(), {profileId:profile.id});
      const seedPayload={user_id:this.user.id,profile_id:profile.id,data:seedData,sync_version:1,updated_at:cloudNowISO()};
      // V5.34.5 — NÃO usa mais upsert aqui. Em bancos que já tinham uma versão
      // antiga da tabela, o onConflict:'profile_id' falhava quando a constraint
      // única não existia exatamente com esse nome/alvo. Perfil novo recebe um
      // INSERT direto em borion_profile_data; se falhar, o erro real fica visível
      // e o perfil em profiles NÃO é apagado, para facilitar diagnóstico no Supabase.
      const {data:seedRow,error:seedError}=await this.client
        .from('borion_profile_data')
        .insert(seedPayload)
        .select('id,profile_id,updated_at')
        .single();
      if(seedError){
        cloudActionLog(action,'PROFILE_DATA_SEED_ERROR_PROFILE_KEPT',{profileId:profile.id,error:seedError});
        throw cloudSupabaseError(action+' insert borion_profile_data', seedError);
      }
      if(!seedRow || seedRow.profile_id!==profile.id) throw new Error(action+': o Supabase não confirmou a linha inicial em borion_profile_data para este profile_id.');
      cloudActionLog(action,'PROFILE_DATA_SEED_CONFIRMED',{profileId:profile.id, rowId:seedRow.id});

      this.profiles=this.profiles.filter(p=>p.id!==profile.id).concat([profile]).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      this.applyProfilesToRuntime(this.activeProfileId);
      this.writeCache(seedData, profile.id);

      // V5.34.7 — não chama loadProfiles() imediatamente aqui. O INSERT já foi
      // confirmado por SELECT direto em profiles e por INSERT em
      // borion_profile_data. Em alguns ambientes a listagem logo após o INSERT
      // pode voltar com uma lista antiga por alguns ms; antes isso removia o
      // perfil recém-criado da memória e o switchProfile disparava
      // "Perfil não encontrado". A tela agora usa o perfil confirmado. No F5,
      // loadProfiles continua carregando tudo diretamente do Supabase.
      if(activate) await this.switchProfile(profile.id);
      cloudActionLog(action,'SUCCESS',{profileId:profile.id, profilesCount:this.profiles.length});
      return this.profiles.find(p=>p.id===profile.id) || profile;
    }catch(e){
      const msg=cloudErrorMessage(e);
      this.pendingReason=msg;
      this.setStatus('offline','Erro Supabase: '+msg);
      cloudActionLog(action,'ERROR',{message:msg, error:e});
      cloudShowError(action,e);
      throw (e instanceof Error ? e : new Error(msg));
    }
  },
  profileMetaPendingKey(id){ return 'borion_profile_meta_pending_v1_'+(this.user?this.user.id:'anon')+'_'+id; },
  /* V5.34.4 — cor/avatar/nome do perfil só são considerados salvos quando o
     Supabase confirma o UPDATE em profiles e devolve a linha atualizada. Se
     falhar, o app mostra o error.message completo e não finge sincronização. */
  async renameProfile(id,name,avatarColorVal,avatarImageVal){
    const action='UPDATE_PROFILE_META';
    if(!this.client) throw new Error(action+': Supabase não foi inicializado.');
    if(!this.user) throw new Error(action+': É preciso estar logado.');
    if(!isValidUUID(id)) throw new Error(action+': id de perfil inválido.');
    const payload={name:(name||'Perfil').trim(),avatar_color:avatarColorVal||'#1f8a5b',avatar_image:avatarImageVal||'',updated_at:cloudNowISO()};
    cloudActionLog(action,'START',{profileId:id, payload:{name:payload.name, avatar_color:payload.avatar_color, hasAvatarImage:!!payload.avatar_image}});
    try{
      let {data,error}=await this.client
        .from('profiles')
        .update(payload)
        .eq('id',id)
        .eq('user_id',this.user.id)
        .select(this.profilePasswordColumnsReady===false ? BORION_PROFILE_COLUMNS_BASE : BORION_PROFILE_COLUMNS_WITH_PASSWORD)
        .single();
      if(error && cloudIsMissingProfilePasswordColumns(error)){
        this.profilePasswordColumnsReady=false;
        this.schemaError='Colunas de senha por perfil ausentes em public.profiles. Rode o SQL V5.34.8 no Supabase para ativar senha por perfil.';
        cloudActionLog(action,'PASSWORD_COLUMNS_MISSING_RETRY_BASE',{message:cloudErrorMessage(error)});
        const retry=await this.client
          .from('profiles')
          .update(payload)
          .eq('id',id)
          .eq('user_id',this.user.id)
          .select(BORION_PROFILE_COLUMNS_BASE)
          .single();
        data=retry.data; error=retry.error;
      }
      if(error) throw cloudSupabaseError(action+' update profiles', error);
      if(!data || data.id!==id) throw new Error(action+': o Supabase não confirmou o UPDATE na tabela profiles.');
      const updated=this.mapProfile(data);
      const idx=this.profiles.findIndex(p=>p.id===id);
      if(idx>-1) this.profiles[idx]=updated;
      else this.profiles.push(updated);
      this.applyProfilesToRuntime(id);
      localStorage.removeItem(this.profileMetaPendingKey(id));
      cloudActionLog(action,'SUCCESS',{profileId:id, avatar_color:updated.avatarColor, hasAvatarImage:!!updated.avatarImage});
      this.setStatus('online','Nuvem sincronizada');
      this.lastSyncAt=Date.now();
      return true;
    }catch(e){
      const msg=cloudErrorMessage(e);
      this.pendingReason=msg;
      this.setStatus('offline','Erro ao salvar perfil — '+msg);
      cloudActionLog(action,'ERROR',{profileId:id, message:msg, error:e});
      cloudShowError(action,e);
      throw (e instanceof Error ? e : new Error(msg));
    }
  },
  async retryPendingProfileMeta(){
    // Compatibilidade: versões anteriores podiam deixar cor/avatar pendentes no localStorage.
    // Agora só limpamos a pendência se o Supabase confirmar o UPDATE com uma linha retornada.
    if(!this.user || !navigator.onLine || !this.client) return;
    for(const p of this.profiles){
      const pending = readJSON(this.profileMetaPendingKey(p.id), null);
      if(!pending) continue;
      try{
        cloudActionLog('UPDATE_PROFILE_META','RETRY_START',{profileId:p.id});
        const {data,error}=await this.client
          .from('profiles')
          .update(pending.payload)
          .eq('id',p.id)
          .eq('user_id',this.user.id)
          .select('id')
          .single();
        if(error) throw cloudSupabaseError('UPDATE_PROFILE_META retry profiles', error);
        if(data && data.id===p.id){
          localStorage.removeItem(this.profileMetaPendingKey(p.id));
          cloudActionLog('UPDATE_PROFILE_META','RETRY_SUCCESS',{profileId:p.id});
        }
      }catch(e){
        cloudActionLog('UPDATE_PROFILE_META','RETRY_ERROR',{profileId:p.id, message:cloudErrorMessage(e), error:e});
      }
    }
  },
  async ensureProfilePasswordColumns(){
    const action='PROFILE_PASSWORD_SCHEMA';
    if(!this.client || !this.user) throw new Error('É preciso estar logado para usar senha por perfil.');
    if(this.profilePasswordColumnsReady===true) return true;
    const {error}=await this.client
      .from('profiles')
      .select('id,password_hash,password_salt')
      .eq('user_id',this.user.id)
      .limit(1);
    if(error){
      if(cloudIsMissingProfilePasswordColumns(error)){
        this.profilePasswordColumnsReady=false;
        throw new Error('Senha por perfil ainda não está ativa no Supabase. Rode o SQL V5.34.8 para adicionar password_hash e password_salt em public.profiles. Erro original: '+cloudErrorMessage(error));
      }
      throw cloudSupabaseError(action+' check profiles password columns', error);
    }
    this.profilePasswordColumnsReady=true;
    return true;
  },
  async updateProfilePassword(id,currentPassword,newPassword,mode='set'){
    const action='UPDATE_PROFILE_PASSWORD';
    if(!isValidUUID(id)) throw new Error(action+': id de perfil inválido.');
    if(!this.user) throw new Error(action+': é preciso estar logado.');
    await this.ensureProfilePasswordColumns();
    const p=this.profiles.find(x=>x.id===id);
    if(!p) throw new Error('Perfil não encontrado.');
    if(p.passwordHash){
      if(!currentPassword) throw new Error('Digite a senha atual do perfil.');
      const currentHash=await hashPassword(currentPassword,p.salt||'');
      if(currentHash!==p.passwordHash) throw new Error('Senha atual do perfil incorreta.');
    }
    const payload={updated_at:cloudNowISO()};
    if(mode==='remove'){
      payload.password_hash=null;
      payload.password_salt=null;
    } else {
      if(!newPassword || newPassword.length<4) throw new Error('A senha do perfil precisa ter pelo menos 4 caracteres.');
      const salt=randomSalt();
      payload.password_hash=await hashPassword(newPassword,salt);
      payload.password_salt=salt;
    }
    cloudActionLog(action,'START',{profileId:id, mode, hasCurrentPassword:!!p.passwordHash});
    const {data,error}=await this.client
      .from('profiles')
      .update(payload)
      .eq('id',id)
      .eq('user_id',this.user.id)
      .select(BORION_PROFILE_COLUMNS_WITH_PASSWORD)
      .single();
    if(error) throw cloudSupabaseError(action+' update profiles', error);
    if(!data || data.id!==id) throw new Error(action+': Supabase não confirmou a alteração de senha do perfil.');
    const updated=this.mapProfile(data);
    const idx=this.profiles.findIndex(x=>x.id===id);
    if(idx>-1) this.profiles[idx]=updated; else this.profiles.push(updated);
    this.applyProfilesToRuntime(id);
    this.setStatus('online','Nuvem sincronizada');
    this.lastSyncAt=Date.now();
    cloudActionLog(action,'SUCCESS',{profileId:id, mode, hasPassword:!!updated.passwordHash});
    return updated;
  },

  async deleteProfile(id){
    const action='DELETE_PROFILE';
    if(!isValidUUID(id)) throw new Error(action+': id de perfil inválido.');
    if(this.profiles.length<=1) throw new Error('Mantenha pelo menos um perfil na conta.');
    cloudActionLog(action,'START',{profileId:id, activeProfileId:this.activeProfileId});
    const wasActive=this.activeProfileId===id;
    if(navigator.onLine && window.BackupFS){
      const pr=this.profiles.find(p=>p.id===id);
      const backupRow=await BackupFS.createCloudBackup('before_delete_profile','backup automático antes de excluir perfil '+((pr&&pr.name)||id),{silent:true});
      if(!backupRow || !backupRow.id) throw new Error('Por segurança, o perfil não foi excluído porque o backup before_delete_profile não foi confirmado em borion_backups. Rode o SQL V5.35.1 e tente novamente.');
      cloudActionLog(action,'SAFETY_BACKUP_CONFIRMED',{backupId:backupRow.id, profileId:id});
    }
    if(navigator.onLine){
      const {data,error}=await this.client
        .from('profiles')
        .delete()
        .eq('id',id)
        .eq('user_id',this.user.id)
        .select('id')
        .single();
      if(error) throw cloudSupabaseError(action+' delete profiles', error);
      if(!data || data.id!==id) throw new Error(action+': o Supabase não confirmou o DELETE na tabela profiles.');
      cloudActionLog(action,'PROFILES_DELETE_CONFIRMED',{profileId:id});
    }
    this.profiles=this.profiles.filter(p=>p.id!==id);
    const next=(this.profiles[0]&&this.profiles[0].id)||null;
    this.applyProfilesToRuntime(wasActive ? next : this.activeProfileId);
    localStorage.removeItem(this.cacheKey(id));
    localStorage.removeItem(this.pendingKey(id));
    localStorage.removeItem(LS_DATA_PREFIX+id);
    idbDeleteProfileData(id);
    if(wasActive && next){
      // O perfil ativo acabou de ser apagado no Supabase. Não tente salvar os
      // dados antigos dele durante a troca; limpe a referência antes de abrir
      // o próximo perfil.
      S.data=null;
      this.activeProfileId=null;
      await this.switchProfile(next);
    } else { renderApp(); this.updateBadge(); }
    cloudActionLog(action,'SUCCESS',{profileId:id, remaining:this.profiles.length, activeProfileId:this.activeProfileId});
  },
  async switchProfile(id){
    try{ if(typeof resetImportTransientState==='function') resetImportTransientState(); }catch(_e){}
    if(!isValidUUID(id)) throw new Error('Este perfil tem um id inválido (formato antigo, não é UUID) e não pode mais ser aberto. Exclua-o e crie um novo perfil.');
    if(this.activeProfileId && this.activeProfileId!==id && S && S.data){
      const ok = await this.syncNow();
      if(!ok && navigator.onLine){ throw new Error('Antes de trocar de perfil, não consegui salvar o perfil atual no Supabase: '+(this.pendingReason||'erro desconhecido')); }
    }
    const p=this.profiles.find(x=>x.id===id); if(!p) throw new Error('Perfil não encontrado.');
    // V5.34.3 — ISOLAMENTO: zera o estado financeiro em memória (S.data) ANTES
    // de mudar o activeProfileId/perfil ativo. Sem isso, existe uma janela
    // (durante o "await this.loadData(id)" abaixo) em que activeProfileId já
    // aponta para o perfil novo mas S.data ainda é do perfil antigo — qualquer
    // sincronização automática disparada nesse meio-tempo (aba escondida,
    // timer de debounce, etc.) gravaria os dados do perfil errado por cima do
    // perfil novo no Supabase. Com S.data=null nesse meio-tempo, syncNow()
    // simplesmente não faz nada (ele já exige S.data preenchido).
    S.data = null; this.dataRowId = null; this.dirty = false;
    this.saveActiveProfileId(id);
    this.applyProfilesToRuntime(id);
    const freshProfile = this.profiles.find(x=>x.id===id) || p;
    S.currentProfile = freshProfile;
    const freshData = migrateData(await this.loadData(id), {profileId:id});
    S.data = freshData;
    setProfileData(p.id, S.data);
    setSession({cloud:true,profileId:p.id}); recordPatrimonioSnapshot(); renderApp(); if(window.ExitSaveGuard) ExitSaveGuard.refresh(); postLoginSequence(); this.updateBadge();
  },

  /* V5.34.1 — se não houver cache de nuvem disponível (cloudCache), tenta o
     IndexedDB antes de desistir para um perfil vazio. Isso evita perder dados
     quando o localStorage foi limpo pelo navegador mas o IndexedDB sobreviveu. */
  async localFallback(pid, cached){
    if(cached && cached.data) return migrateData(cached.data, {profileId:pid});
    const idbData = await hydrateProfileDataFromIDB(pid);
    if(idbData) return idbData;
    return emptyData();
  },
  async loadData(profileId){
    const action='LOAD_PROFILE_DATA';
    const pid=profileId||this.activeProfileId;
    const cached=this.readCache(pid);
    cloudActionLog(action,'START',{profileId:pid, online:navigator.onLine});
    if(pid && !isValidUUID(pid)){
      const msg='profile_id inválido (não é UUID): '+pid;
      cloudActionLog(action,'ERROR',{message:msg});
      this.pendingReason=msg;
      this.setStatus('offline','Perfil inválido — reabra o perfil');
      throw new Error(action+': '+msg);
    }
    if(!this.client||!this.user||!pid) return await this.localFallback(pid, cached);
    if(!navigator.onLine){ this.setStatus('offline','Offline — salvando neste dispositivo'); cloudActionLog(action,'OFFLINE_CACHE',{profileId:pid}); return await this.localFallback(pid, cached); }
    this.setStatus('syncing','Carregando perfil da nuvem...');
    try{
      const {data,error}=await this.client
        .from('borion_profile_data')
        .select('id,data,updated_at,sync_version,profile_id')
        .eq('user_id',this.user.id)
        .eq('profile_id',pid)
        .maybeSingle();
      if(error) throw cloudSupabaseError(action+' select borion_profile_data', error);
      if(data){
        this.dataRowId=data.id;
        const cloudData=migrateData(data.data||emptyData(), {profileId:pid});
        this.writeCache(cloudData,pid);
        this.lastSyncAt=Date.now();
        this.setStatus('online','Nuvem sincronizada');
        cloudActionLog(action,'SUCCESS',{profileId:pid, rowId:data.id, updatedAt:data.updated_at});
        return cloudData;
      }
      cloudActionLog(action,'NO_ROW_CREATE_INITIAL',{profileId:pid});
      const first=await this.localFallback(pid, cached);
      const ok=await this.saveNow(first,pid);
      if(!ok) throw new Error(action+': não existe linha em borion_profile_data para este perfil e o app não conseguiu criar. '+(this.pendingReason||''));
      cloudActionLog(action,'SUCCESS_CREATED_ROW',{profileId:pid, rowId:this.dataRowId});
      return first;
    }catch(e){
      const msg=cloudErrorMessage(e);
      this.pendingReason=msg;
      this.setStatus('offline','Falha na nuvem — '+msg);
      cloudActionLog(action,'ERROR',{profileId:pid, message:msg, error:e});
      cloudShowError(action,e);
      throw (e instanceof Error ? e : new Error(msg));
    }
  },
  /* V5.34.3 — isolamento entre perfis: queueSave agora recebe o profileId de
     quem está chamando (saveCurrentData), e cruza com this.activeProfileId.
     Em caso de divergência (não deveria acontecer, mas é uma trava de
     segurança), vale this.activeProfileId — é a referência controlada
     exclusivamente pelo próprio CloudStorage e validada como UUID sempre que
     é escrita. Mantém compatibilidade com uma chamada antiga de 1 argumento
     (queueSave(data)), tratando o único argumento como os dados. */
  queueSave(profileIdOrData, maybeData){
    let profileId, data;
    if(maybeData===undefined){ data=profileIdOrData; profileId=null; }
    else { profileId=profileIdOrData; data=maybeData; }
    if(!this.user) return;
    let pid=null;
    if(isValidUUID(this.activeProfileId)) pid=this.activeProfileId;
    else if(isValidUUID(profileId)) pid=profileId;
    if(!pid) return;
    if(isValidUUID(profileId) && isValidUUID(this.activeProfileId) && profileId!==this.activeProfileId){
      console.warn('Borion Cloud: queueSave recebeu um profileId diferente do perfil ativo — usando o perfil ativo (isolamento).', {recebido:profileId, ativo:this.activeProfileId});
    }
    this.writeCache(data,pid); this.dirty=true;
    this.setStatus(navigator.onLine?'dirty':'offline',navigator.onLine?'Dados pendentes de envio':'Offline — salvando neste dispositivo');
    writeJSON(this.pendingKey(pid),{pending:true,savedAt:Date.now(),reason:'Aguardando sincronização',profileId:pid});
    clearTimeout(this.syncTimer); this.syncTimer=setTimeout(()=>this.syncNow(),700);
  },
  /* V5.34.2 — syncNow() agora prioriza this.activeProfileId (a referência que o
     próprio CloudStorage controla e sempre valida como UUID) em vez de confiar
     cegamente em S.currentProfile.id. Isso evita enviar profile_id inválido ao
     Supabase caso S.currentProfile aponte, por qualquer motivo, para um perfil
     criado fora do fluxo de nuvem (ex.: um perfil local antigo, sem UUID). */
  async syncNow(){
    if(!this.user||!S.currentProfile||!S.data) return false;
    if(!navigator.onLine){ this.setStatus('offline','Offline — salvando neste dispositivo'); return false; }
    let pid=null;
    if(isValidUUID(this.activeProfileId)) pid=this.activeProfileId;
    else if(isValidUUID(S.currentProfile.id)) pid=S.currentProfile.id;
    if(isValidUUID(this.activeProfileId) && isValidUUID(S.currentProfile.id) && this.activeProfileId!==S.currentProfile.id){
      console.warn('Borion Cloud: S.currentProfile.id e activeProfileId estão diferentes — isso não deveria acontecer. Usando activeProfileId (regra de isolamento).', {currentProfile:S.currentProfile.id, activeProfileId:this.activeProfileId});
    }
    if(!pid){
      const msg='Nenhum profile_id válido (UUID) disponível para sincronizar. Abra um perfil da nuvem novamente.';
      console.warn('Borion Cloud:', msg);
      this.pendingReason=msg;
      this.setStatus('offline','Perfil inválido — reabra o perfil');
      cloudActionLog('SAVE_PROFILE_DATA','ERROR',{message:msg});
      return false;
    }
    return this.saveNow(S.data,pid);
  },
  async saveNow(data,profileId){
    const action='SAVE_PROFILE_DATA';
    const pid=profileId||this.activeProfileId;
    cloudActionLog(action,'START',{profileId:pid, online:navigator.onLine});
    if(!isValidUUID(pid)){
      const msg='saveNow recebeu um profile_id que não é UUID válido: '+pid;
      console.warn('Borion Cloud:', msg);
      this.pendingReason=msg;
      this.setStatus('offline','Id de perfil inválido — reabra o perfil');
      cloudActionLog(action,'ERROR',{message:msg});
      return false;
    }
    if(!this.client||!this.user){ cloudActionLog(action,'SKIP',{reason:'sem cliente/usuário'}); return false; }
    this.writeCache(data,pid);
    if(!navigator.onLine){ this.setStatus('offline','Offline — salvando neste dispositivo'); cloudActionLog(action,'OFFLINE_CACHE',{profileId:pid}); return false; }
    this.setStatus('syncing','Sincronizando...');
    try{
      const payload={user_id:this.user.id,profile_id:pid,data:migrateData(data, {profileId:pid}),updated_at:cloudNowISO(),sync_version:Date.now()};
      // V5.34.5 — troca UPSERT por SELECT + UPDATE/INSERT. Isso remove a
      // dependência de uma constraint única específica no Supabase e revela
      // claramente se o problema é SELECT, INSERT, UPDATE, RLS ou grant.
      const {data:existingRows,error:selectError}=await this.client
        .from('borion_profile_data')
        .select('id,profile_id,updated_at')
        .eq('user_id',this.user.id)
        .eq('profile_id',pid)
        .order('updated_at',{ascending:false})
        .limit(2);
      if(selectError) throw cloudSupabaseError(action+' select existing borion_profile_data', selectError);
      const existing=(existingRows||[])[0]||null;
      if((existingRows||[]).length>1){
        cloudActionLog(action,'WARNING_DUPLICATE_ROWS',{profileId:pid, rows:existingRows});
      }
      let up=null;
      if(existing && existing.id){
        const {data:updated,error:updateError}=await this.client
          .from('borion_profile_data')
          .update(payload)
          .eq('id',existing.id)
          .eq('user_id',this.user.id)
          .select('id,profile_id,updated_at')
          .single();
        if(updateError) throw cloudSupabaseError(action+' update borion_profile_data', updateError);
        up=updated;
      } else {
        const {data:inserted,error:insertError}=await this.client
          .from('borion_profile_data')
          .insert(payload)
          .select('id,profile_id,updated_at')
          .single();
        if(insertError) throw cloudSupabaseError(action+' insert borion_profile_data', insertError);
        up=inserted;
      }
      if(!up || up.profile_id!==pid) throw new Error(action+': o Supabase não confirmou a gravação para o profile_id correto.');
      this.dataRowId=up.id;
      this.dirty=false;
      this.pendingReason='';
      this.lastSyncAt=Date.now();
      localStorage.removeItem(this.pendingKey(pid));
      this.writeCache(data,pid);
      this.setStatus('online','Nuvem sincronizada');
      cloudActionLog(action,'SUCCESS',{profileId:pid, rowId:up.id, updatedAt:up.updated_at});
      return true;
    }catch(e){
      const msg=cloudErrorMessage(e);
      console.warn('Borion Cloud save falhou:', e);
      this.dirty=true;
      this.pendingReason=msg;
      writeJSON(this.pendingKey(pid),{pending:true,savedAt:Date.now(),reason:msg,profileId:pid});
      this.setStatus('offline','Falha ao sincronizar — '+msg);
      cloudActionLog(action,'ERROR',{profileId:pid, message:msg, error:e});
      cloudShowError(action,e);
      return false;
    }
  },
  hasPendingSync(){ if(this.dirty) return true; if(!this.user) return false; const pid=this.activeProfileId; const p=readJSON(this.pendingKey(pid),null); return !!(p&&p.pending); },
  pendingInfo(){ return readJSON(this.pendingKey(this.activeProfileId),null); },
  /* Ferramenta de conferência manual — rode CloudStorage.debugCheckRowsPerProfile()
     no console do navegador para conferir que existe exatamente 1 linha em
     borion_profile_data por profile_id (nenhum duplicado, nenhum faltando). */
  async debugCheckRowsPerProfile(){
    if(!this.client||!this.user){ console.warn('Sem sessão/cliente Supabase.'); return null; }
    const {data,error}=await this.client.from('borion_profile_data').select('profile_id').eq('user_id',this.user.id);
    if(error){ console.error('Erro ao consultar borion_profile_data:', error); return null; }
    const counts={};
    (data||[]).forEach(r=>{ counts[r.profile_id]=(counts[r.profile_id]||0)+1; });
    console.table(Object.entries(counts).map(([profile_id,linhas])=>({profile_id,linhas})));
    const duplicated = Object.entries(counts).filter(([,n])=>n>1);
    const profileIdsWithoutRow = this.profiles.filter(p=>!counts[p.id]).map(p=>p.id);
    if(duplicated.length) console.warn('Perfis com mais de 1 linha (não deveria acontecer, unique(profile_id) deveria impedir):', duplicated);
    if(profileIdsWithoutRow.length) console.warn('Perfis sem nenhuma linha ainda (serão criados na próxima sincronização):', profileIdsWithoutRow);
    return counts;
  },

  async runSupabaseDiagnostic(){
    const action='SUPABASE_DIAGNOSTIC';
    const report=[];
    const add=(step, ok, info)=>{ const row={step, ok:!!ok, info:info||''}; report.push(row); (ok?console.log:console.error)(`[BORION_CLOUD][${action}][${step}]`, info||''); };
    try{
      if(!this.client) throw new Error('Supabase client não inicializado.');
      const {data:sessionData,error:sessionError}=await this.client.auth.getSession();
      if(sessionError) throw cloudSupabaseError(action+' auth.getSession', sessionError);
      const user=(sessionData&&sessionData.session&&sessionData.session.user)||this.user;
      if(!user) throw new Error('Sem usuário logado. Entre na conta Borion Cloud antes de testar.');
      this.user=user; add('AUTH_SESSION', true, {userId:user.id,email:user.email});

      const {data:selectProfiles,error:selectProfilesError}=await this.client.from('profiles').select('id,name').eq('user_id',user.id).limit(5);
      if(selectProfilesError) throw cloudSupabaseError(action+' select profiles', selectProfilesError);
      add('SELECT_PROFILES', true, {count:(selectProfiles||[]).length});

      const tmpName='BORION_DIAGNOSTICO_'+Date.now();
      const {data:profile,error:profileError}=await this.client.from('profiles')
        .insert({user_id:user.id,name:tmpName,avatar_color:'#123456',avatar_image:'',updated_at:cloudNowISO()})
        .select(this.profilePasswordColumnsReady===false ? BORION_PROFILE_COLUMNS_BASE : BORION_PROFILE_COLUMNS_WITH_PASSWORD)
        .single();
      if(profileError) throw cloudSupabaseError(action+' insert profiles', profileError);
      if(!profile||!profile.id) throw new Error('INSERT em profiles não retornou id.');
      add('INSERT_PROFILE', true, {profileId:profile.id});

      const {data:profileUpdate,error:profileUpdateError}=await this.client.from('profiles')
        .update({avatar_color:'#654321',updated_at:cloudNowISO()})
        .eq('id',profile.id).eq('user_id',user.id)
        .select('id,avatar_color')
        .single();
      if(profileUpdateError) throw cloudSupabaseError(action+' update profiles', profileUpdateError);
      if(!profileUpdate||profileUpdate.avatar_color!=='#654321') throw new Error('UPDATE em profiles não confirmou avatar_color.');
      add('UPDATE_PROFILE_META', true, profileUpdate);

      const payload={user_id:user.id,profile_id:profile.id,data:migrateData(emptyData(), {profileId:profile.id}),sync_version:Date.now(),updated_at:cloudNowISO()};
      const {data:dataInsert,error:dataInsertError}=await this.client.from('borion_profile_data')
        .insert(payload).select('id,profile_id,updated_at').single();
      if(dataInsertError) throw cloudSupabaseError(action+' insert borion_profile_data', dataInsertError);
      if(!dataInsert||dataInsert.profile_id!==profile.id) throw new Error('INSERT em borion_profile_data não confirmou profile_id.');
      add('INSERT_PROFILE_DATA', true, dataInsert);

      const changed=migrateData(emptyData(), {profileId:profile.id}); changed._diagnosticoBorion={ok:true,at:cloudNowISO()};
      const {data:dataUpdate,error:dataUpdateError}=await this.client.from('borion_profile_data')
        .update({data:changed,sync_version:Date.now(),updated_at:cloudNowISO()})
        .eq('profile_id',profile.id).eq('user_id',user.id)
        .select('id,profile_id,updated_at').single();
      if(dataUpdateError) throw cloudSupabaseError(action+' update borion_profile_data', dataUpdateError);
      if(!dataUpdate||dataUpdate.profile_id!==profile.id) throw new Error('UPDATE em borion_profile_data não confirmou profile_id.');
      add('UPDATE_PROFILE_DATA', true, dataUpdate);

      const {data:backupInsert,error:backupInsertError}=await this.client.from('borion_backups')
        .insert({user_id:user.id,backup_type:'diagnostic',app_version:'5.35.1',profile_count:1,backup_json:{diagnostic:true,profile_id:profile.id,at:cloudNowISO()},reason:'diagnóstico Supabase',source:'diagnostic',checksum:'',created_at:cloudNowISO()})
        .select('id,backup_type,created_at')
        .single();
      if(backupInsertError) throw cloudSupabaseError(action+' insert borion_backups', backupInsertError);
      if(!backupInsert||!backupInsert.id) throw new Error('INSERT em borion_backups não retornou id.');
      add('INSERT_CLOUD_BACKUP', true, backupInsert);

      const {error:backupDeleteError}=await this.client.from('borion_backups').delete().eq('id',backupInsert.id).eq('user_id',user.id);
      if(backupDeleteError) throw cloudSupabaseError(action+' delete diagnostic backup', backupDeleteError);
      add('CLEANUP_DELETE_BACKUP', true, {backupId:backupInsert.id});

      const {error:deleteError}=await this.client.from('profiles').delete().eq('id',profile.id).eq('user_id',user.id);
      if(deleteError) throw cloudSupabaseError(action+' delete diagnostic profile', deleteError);
      add('CLEANUP_DELETE_PROFILE', true, {profileId:profile.id});

      console.table(report);
      toast('Diagnóstico Supabase OK: SELECT/INSERT/UPDATE/DELETE funcionando.');
      return report;
    }catch(e){
      const msg=cloudErrorMessage(e);
      add('FAILED', false, msg);
      console.table(report);
      cloudShowError(action,e);
      alert('Diagnóstico Supabase falhou:\n\n'+msg+'\n\nAbra o Console (F12) para ver o passo exato.');
      return report;
    }
  },

  /* ---------------- Saída controlada (V5.34.1) ----------------
     Chame CloudStorage.guardExit(action) em qualquer ponto que "saia" do
     contexto atual (logout, trocar de perfil, fechar o app pelo botão interno).
     Se não houver pendência, "action" roda direto. Se houver, mostra um modal
     com 3 opções e só chama "action" se o usuário escolher continuar. */
  async guardExit(action){
    if(!this.hasPendingSync()){ await action(); return; }
    openChoiceModal({
      title:'Existem dados não sincronizados',
      sub:'Você tem alterações no Borion que ainda não foram enviadas para a nuvem. O que deseja fazer antes de continuar?',
      choices:[
        {label:'Salvar e sincronizar agora', desc:'Aguarda o envio para a nuvem terminar e só então continua.', onClick: async ()=>{
          closeModal();
          toast('Sincronizando antes de continuar...');
          const ok = await this.syncNow();
          this.updateBadge();
          if(ok){ toast('Sincronizado. Continuando...'); await action(); }
          else { toast('Não foi possível sincronizar agora (sem internet ou erro). Os dados continuam salvos neste dispositivo.'); }
        }},
        {label:'Sair mesmo assim', desc:'Continua sem esperar a nuvem. Nada é perdido: os dados ficam salvos neste dispositivo e sincronizam quando possível.', variant:'danger', onClick: async ()=>{ closeModal(); await action(); }},
        {label:'Cancelar', onClick: closeModal}
      ]
    });
  }
};

/* V5.34.7 — expõe explicitamente o objeto no window.
   Top-level const não vira window.CloudStorage no navegador. Como várias partes
   do app verificam window.CloudStorage antes de decidir salvar na nuvem, sem
   isso o Borion entrava em modo local e nada era persistido no Supabase. */
window.CloudStorage = CloudStorage;


const CloudAuth={
  mode:'login', error:'', info:'',
  /* V6.21.0 — pedido: a tela de entrada não faz mais sentido oferecer e-mail/senha
     como opção principal (o grupo todo já usa só Google Drive). `emailExpanded`
     controla um estado secundário, só dentro de mode==='login': false = tela limpa
     (só o botão do Google), true = o formulário antigo de e-mail/senha (Supabase),
     acessível a partir do painel "Instruções e mais opções". Nada foi removido por
     baixo — CloudStorage/Supabase continuam funcionando exatamente como antes, só
     deixaram de ser o destaque da tela. */
  emailExpanded:false,

  render(){
    applyFont(); applyTheme();
    const root=document.getElementById('root');
    if(this.mode==='login' && !this.emailExpanded){ this.renderCleanLogin(root); return; }
    this.renderEmailForm(root);
  },

  /* V6.37.0 — pedido: só Google Drive como forma de entrar daqui pra frente.
     "Usar sem conta" (modo 100% local) foi removido desta tela — quem já
     estava em modo local antes continua acessando o que já tinha (nada foi
     apagado), mas não é mais possível escolher esse caminho a partir de uma
     entrada nova. Tudo mais (e-mail/senha antigo, limpar dados) fica só
     atrás de "Instruções e mais opções", pra quem realmente precisar. */
  renderCleanLogin(root){
    root.innerHTML = `<div class="gate-wrap cloud-login-wrap"><div class="gate-box">
      <div class="gate-logo"><img src="borion-emblem.png" alt="Borion Finance"/><div class="appname">Borion Finance</div></div>
      <div class="gate-card cloud-card">
        <p class="gate-title">Entrar no Borion</p>
        <p class="gate-sub">Entre com sua conta Google para carregar seus perfis financeiros.</p>
        ${this.error?`<p class="gate-error">${esc(this.error)}</p>`:''}
        ${this.info?`<p class="gate-info">${esc(this.info)}</p>`:''}
        <button class="btn btn-primary btn-block" id="cloud_gdrive" disabled>Preparando Google...</button>
        <div style="text-align:center;margin-top:20px;"><button class="link-btn" id="cloud_more_info" style="opacity:.65;">Instruções e mais opções</button></div>
      </div>
    </div></div>`;
    const gd=document.getElementById('cloud_gdrive');
    const markReady=()=>{if(!gd)return;gd.disabled=false;gd.dataset.googleReady='1';gd.textContent='Continuar com Google';};
    const markLoadFailure=(error)=>{if(!gd)return;gd.disabled=false;gd.dataset.googleReady='0';gd.textContent='Preparar conexão Google';this.error=this.googleLoginError(error);};
    if(window.GoogleDriveAuth&&typeof GoogleDriveAuth.prepareInteractiveLogin==='function'){
      GoogleDriveAuth.prepareInteractiveLogin().then(markReady).catch(error=>{markLoadFailure(error);this.render();});
    }else markReady();
    if(gd) gd.onclick=async()=>{
      if(gd.dataset.googleReady!=='1'){
        gd.disabled=true;gd.textContent='Preparando Google...';this.error='';
        try{await GoogleDriveAuth.prepareInteractiveLogin();markReady();this.info='Conexão preparada. Clique em “Continuar com Google” para entrar.';this.render();}
        catch(error){this.error=this.googleLoginError(error);this.render();}
        return;
      }
      gd.disabled=true;gd.textContent='Conectando...';this.error='';this.info='';
      try{ await GoogleDriveProvider.connect(true); }
      catch(error){ this.returnToSimpleLogin(this.googleLoginError(error)); }
    };
    const mi=document.getElementById('cloud_more_info'); if(mi) mi.onclick=()=>this.showMoreInfoModal();
  },

  googleLoginError(error){
    const code=String(error&&error.code||'');
    const message=String(error&&error.message||error||'');
    if(/AUTH_POPUP_BLOCKED|popup.*failed|failed.*popup/i.test(code+' '+message)) return 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.';
    if(/AUTH_POPUP_CLOSED|popup.*closed|closed.*popup/i.test(code+' '+message)) return 'A janela do Google foi fechada antes de concluir o login. Tente novamente.';
    if(/AUTH_TIMEOUT|demorou|timeout/i.test(code+' '+message)) return 'O Google demorou para responder. Tente entrar novamente.';
    if(/access_denied|recusou|cancel/i.test(code+' '+message)) return 'O acesso do Google não foi concluído. Tente novamente.';
    return 'Não foi possível conectar sua conta Google. Tente novamente.';
  },

  returnToSimpleLogin(message=''){
    try{if(window.GoogleDriveProvider&&typeof GoogleDriveProvider.resetLoginAttempt==='function')GoogleDriveProvider.resetLoginAttempt();}catch(e){}
    try{setStorageMode(null);}catch(e){}
    try{if(typeof closeModal==='function')closeModal();}catch(e){}
    const modalRoot=document.getElementById('modal-root');if(modalRoot)modalRoot.innerHTML='';
    this.mode='login';this.emailExpanded=false;this.info='';this.error=message||'';
    this.render();
    return true;
  },

  /* Painel "Instruções e mais opções": explica como o login funciona e dá a
     saída de limpar dados do navegador em caso de problema. V6.37.0 — o
     e-mail/senha antigo (Supabase) foi removido daqui também: só continua
     acessível para quem já estiver com uma sessão Supabase aberta (o boot()
     entra direto sem passar por esta tela nesse caso); não é mais possível
     iniciar um login por e-mail/senha novo a partir da tela de entrada. */
  showMoreInfoModal(){
    const hasLocalProfiles = typeof getProfiles==='function' && (getProfiles()||[]).some(p=>p&&!p.cloud);
    const box = el(`<div class="modal-overlay">
      <div class="modal-box">
        <div class="modal-head"><h2>Instruções e mais opções</h2><button id="cai_close">&times;</button></div>
        <p class="modal-sub">Como o login do Borion funciona.</p>
        <div class="info-box">"Continuar com Google" usa a pasta do Google Drive que foi compartilhada com a sua conta — escolha a pasta que tem o seu nome quando o seletor abrir. Cada conta pode ter vários perfis financeiros.</div>
        ${hasLocalProfiles?`<div class="info-box">Você tem perfil(is) salvos só neste dispositivo, de antes desta mudança. Eles continuam aqui — fale com quem administra o Borion para migrar esses dados para o Google Drive.</div>`:''}
        <div style="text-align:center;margin-top:16px;"><button class="link-btn" id="cai_reset_device" style="opacity:.55;font-size:.85em;">Problemas para entrar? Limpar dados deste navegador</button></div>
      </div>
    </div>`);
    $('#modal-root').innerHTML=''; $('#modal-root').appendChild(box); attachModalGuard(box);
    $('#cai_close').onclick=closeModal;
    $('#cai_reset_device').onclick=()=>{ closeModal(); if(window.confirmResetDeviceState) confirmResetDeviceState(); };
  },

  /* Formulário antigo de e-mail/senha (Supabase) — cobre login, criar conta,
     recuperar senha e trocar senha. Só aparece a partir de agora se a pessoa pedir
     explicitamente (ver showMoreInfoModal acima) ou se estiver no meio de um fluxo
     que depende dele (criar conta, recuperar senha, trocar senha após recuperação). */
  renderEmailForm(root){
    const isCreate=this.mode==='create', isReset=this.mode==='reset', isChange=this.mode==='changePassword';
    const passwordHTML = !isReset ? passwordInputWrapHTML({id:'cloud_password',label:isChange?'Nova senha':'Senha',autocomplete:isChange?'new-password':(isCreate?'new-password':'current-password'),placeholder:'Mínimo 6 caracteres'}) : '';
    const password2HTML = isChange ? passwordInputWrapHTML({id:'cloud_password2',label:'Repetir nova senha',autocomplete:'new-password',placeholder:'Repita a nova senha'}) : '';
    const title = isCreate?'Criar conta':isReset?'Recuperar senha':isChange?'Criar nova senha':'Entrar com e-mail e senha';
    const sub = isCreate?'Crie sua conta para sincronizar celular e computador.':isReset?'Informe seu e-mail para receber o link de recuperação.':isChange?'Defina sua nova senha para finalizar a recuperação.':'Login antigo por e-mail e senha (Supabase) — a maioria já usa só "Continuar com Google".';
    root.innerHTML = `<div class="gate-wrap cloud-login-wrap"><div class="gate-box">
      <div class="gate-logo"><img src="borion-emblem.png" alt="Borion Finance"/><div class="appname">Borion Finance</div></div>
      <div class="gate-card cloud-card">
        <p class="gate-title">${title}</p>
        <p class="gate-sub">${sub}</p>
        ${this.error?`<p class="gate-error">${esc(this.error)}</p>`:''}
        ${this.info?`<p class="gate-info">${esc(this.info)}</p>`:''}
        ${isCreate?`<div class="field"><label>Nome</label><input type="text" id="cloud_name" autocomplete="name"></div>`:''}
        ${!isChange?`<div class="field"><label>E-mail</label><input type="email" id="cloud_email" autocomplete="email"></div>`:''}
        ${passwordHTML}${password2HTML}
        <button class="btn btn-primary btn-block" id="cloud_submit">${isCreate?'Criar conta':isReset?'Enviar link':isChange?'Salvar nova senha':'Entrar'}</button>
        <div class="cloud-actions">
          ${!isCreate&&!isReset&&!isChange?`<button class="link-btn" id="cloud_create">Criar conta</button><button class="link-btn" id="cloud_reset">Esqueci minha senha</button>`:''}
          ${isCreate||isReset?`<button class="link-btn" id="cloud_back">Voltar</button>`:''}
          ${isChange?`<button class="link-btn" id="cloud_back_app">Entrar depois</button>`:''}
          ${!isCreate&&!isReset&&!isChange?`<button class="link-btn" id="cloud_back_clean">← Voltar pro login simples</button>`:''}
        </div>
      </div>
    </div></div>`;
    const submit=document.getElementById('cloud_submit'); if(submit) submit.onclick=()=>this.submit();
    const c=document.getElementById('cloud_create'); if(c) c.onclick=()=>{this.mode='create';this.error='';this.info='';this.render();};
    const r=document.getElementById('cloud_reset'); if(r) r.onclick=()=>{this.mode='reset';this.error='';this.info='';this.render();};
    const b=document.getElementById('cloud_back'); if(b) b.onclick=()=>{this.mode='login';this.error='';this.info='';this.render();};
    const ba=document.getElementById('cloud_back_app'); if(ba) ba.onclick=()=>enterCloudUser();
    const bc=document.getElementById('cloud_back_clean'); if(bc) bc.onclick=()=>{this.emailExpanded=false;this.error='';this.info='';this.render();};
    ['cloud_email','cloud_password','cloud_password2','cloud_name'].forEach(id=>{const elx=document.getElementById(id); if(elx) elx.addEventListener('keydown',e=>{if(e.key==='Enter') this.submit();});});
  },

  async submit(){
    const email=(document.getElementById('cloud_email')||{}).value?.trim(); const password=(document.getElementById('cloud_password')||{}).value||''; const password2=(document.getElementById('cloud_password2')||{}).value||''; const name=(document.getElementById('cloud_name')||{}).value?.trim();
    this.error=''; this.info='';
    try{
      await CloudStorage.init({force:true});
      if(this.mode==='changePassword'){ if(password!==password2) throw new Error('As senhas não conferem.'); await CloudStorage.updatePassword(password); this.info='Senha alterada com sucesso.'; await enterCloudUser(); return; }
      if(!email) throw new Error('Digite seu e-mail.');
      if(this.mode==='reset'){ await CloudStorage.resetPassword(email); this.info='Se esse e-mail existir, o Supabase enviará um link de recuperação.'; this.render(); return; }
      if(!password||password.length<6) throw new Error('A senha precisa ter pelo menos 6 caracteres.');
      if(this.mode==='create'){ await CloudStorage.signUp(email,password,name||email.split('@')[0]); if(!CloudStorage.user){this.info='Conta criada. Agora faça login.'; this.mode='login'; this.render(); return;} }
      else await CloudStorage.signIn(email,password);
      await enterCloudUser();
    }catch(e){ this.error=translateSupabaseError(e&&e.message?e.message:String(e)); this.render(); }
  }
};
window.CloudAuth=CloudAuth;
window.returnToSimpleGoogleLogin=(message='')=>CloudAuth.returnToSimpleLogin(message);

/* V6.3.0 — par local de enterCloudUser(): entra no Borion usando só os perfis já
   salvos neste dispositivo (S.profiles/LS_PROFILES), sem chamar nada do Supabase.
   Usado pelo bypass do boot() e pelo link "Usar sem conta" da tela de login. */
function enterLocalMode(){
  S.data = null;
  S.currentProfile = null;
  S.gate = {mode:'list', error:''};
  renderGate();
}

async function enterCloudUser(){
  if(!CloudStorage.user){ CloudAuth.render(); return; }
  try{
    await CloudStorage.loadProfiles();
  }catch(e){
    CloudAuth.error=cloudErrorMessage(e);
    CloudAuth.render();
    return;
  }
  if(CloudStorage.schemaError && !CloudStorage.profiles.length){
    CloudAuth.error='Erro ao carregar profiles no Supabase: '+CloudStorage.schemaError;
    CloudAuth.render();
    return;
  }
  if(!CloudStorage.profiles.length){ CloudAuth.error='Não foi possível criar/carregar perfil financeiro.'; CloudAuth.render(); return; }
  // V5.35 — estilo Netflix: depois de entrar na conta, sempre mostra a tela
  // "quem é você?" para escolher o perfil financeiro, em vez de entrar direto
  // no último perfil ativo. A troca em si (senha do perfil, carregar dados
  // etc.) continua sendo feita pelo Gate/CloudStorage.switchProfile já existente.
  CloudStorage.applyProfilesToRuntime(CloudStorage.activeProfileId);
  S.data = null;
  S.currentProfile = null;
  S.gate = {mode:'list', error:''};
  renderGate();
  CloudStorage.updateBadge();
  if(window.BackupFS) BackupFS.maybeShowConsentOnLogin();
}
async function cloudLogout(){
  await CloudStorage.guardExit(async ()=>{
    await CloudStorage.signOut(); S.currentProfile=null; S.data=null; CloudAuth.mode='login'; CloudAuth.error=''; CloudAuth.info=''; CloudAuth.emailExpanded=false; CloudAuth.render();
  });
}
async function cloudForceSync(){ const ok=await CloudStorage.syncNow(); CloudStorage.updateBadge(); toast(ok?'Nuvem sincronizada e confirmada no Supabase.':'Falha ao sincronizar: '+(CloudStorage.pendingReason||'erro desconhecido do Supabase.')); return ok; }
async function cloudRunSupabaseDiagnostic(){ if(!window.CloudStorage) { alert('CloudStorage não carregou.'); return null; } return await CloudStorage.runSupabaseDiagnostic(); }
window.BorionCloudDiagnostic = cloudRunSupabaseDiagnostic;
/* V5.34.3 — fluxo real de troca de senha: campo de senha atual + nova senha +
   confirmação, validando a senha atual via reautenticação antes de trocar.
   Continua logado depois de trocar (Supabase Auth mantém a sessão). */
function cloudChangePasswordFromSettings(){
  openModal({
    title:'Alterar senha da conta',
    sub:'Confirme sua senha atual para definir uma nova senha do Borion Cloud.',
    fields:[
      {key:'atual', label:'Senha atual', type:'password'},
      {key:'nova', label:'Nova senha', type:'password', placeholder:'Mínimo 6 caracteres'},
      {key:'confirmar', label:'Confirmar nova senha', type:'password'}
    ],
    saveLabel:'Alterar senha',
    onSave: async (v)=>{
      try{
        if(!v.atual) throw new Error('Digite a senha atual.');
        if(!v.nova || v.nova.length<6) throw new Error('A nova senha precisa ter pelo menos 6 caracteres.');
        if(v.nova!==v.confirmar) throw new Error('A nova senha e a confirmação não conferem.');
        await CloudStorage.changePasswordWithCurrentPassword(v.atual, v.nova);
        closeModal();
        toast('Senha alterada com sucesso. Você continua logado.');
      }catch(e){ alert(translateSupabaseError(e&&e.message?e.message:String(e))); }
    }
  });
}
function translateSupabaseError(msg){ const m=String(msg||''); if(/delete_own_account|Could not find the function|function .* does not exist/i.test(m)) return 'A função de exclusão da conta ainda não está configurada no Supabase.'; if(/relation .*profiles|schema cache|borion_profile_data|does not exist/i.test(m)) return 'As tabelas necessárias do login antigo por e-mail não foram encontradas no Supabase.'; if(/invalid login|Invalid login credentials|E-mail ou senha incorretos/i.test(m)) return 'E-mail ou senha incorretos.'; if(/invalid token|token.*expired|otp|Token has expired/i.test(m)) return 'Link de confirmação inválido ou expirado. Reenvie o e-mail e clique no Sign in mais recente.'; if(/rate limit|too many|over_email_send_rate_limit/i.test(m)) return 'Muitas tentativas de envio. Aguarde um pouco antes de reenviar o e-mail.'; if(/email not confirmed/i.test(m)) return 'E-mail ainda não confirmado. Desative “Confirm email” no Supabase durante os testes ou confirme pelo link recebido.'; if(/already registered|already exists|User already registered/i.test(m)) return 'Esse e-mail já tem conta. Use Entrar ou Recuperar senha.'; return m; }
