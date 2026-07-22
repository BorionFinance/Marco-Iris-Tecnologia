/* Borion Finance — Google Drive Provider (V6.42.0 — Boot e Sync Otimizados)

   Arquitetura 6.40.2: current.json é apenas o snapshot consolidado. Toda alteração
   é protegida primeiro como operação imutável, identificada por operationId, e só
   depois consolidada e confirmada por checksum. O carregamento recupera operações
   pendentes antes de apresentar a conta; horários servem apenas para ordenação.

   Modelo "central" que você escolheu: cada pessoa entra com a PRÓPRIA conta Google
   (login e token de acesso individuais, nada de segredo compartilhado). A primeira vez,
   ela escolhe (via seletor nativo do Google — o "Picker") a pasta que você compartilhou
   com o e-mail dela. Depois disso, o Borion guarda o ID dessa pasta neste navegador e
   nunca mais precisa abrir o seletor — lê e escreve direto nela pela Drive API.

   Isso É ADITIVO: ninguém que usa modo local ou conta Supabase é afetado. Só entra em
   ação quando a pessoa escolhe "Entrar com Google (Drive)" ou quando STORAGE_MODE já
   salvo for 'google_drive'.

   Arquivo principal por pasta: current.json — o mesmo formato de "backup completo da
   conta" que o app já usa (type: borion-account-backup, profiles[], dataByProfile{}).
   Isso significa que o current.json de qualquer pessoa já é abrível/legível pelo botão
   normal de "Importar backup" do app, mesmo fora do fluxo Google.

   Autenticação: Google Identity Services (token client, OAuth 2.0 implícito) — só
   pede o escopo drive.file (a pessoa só concede acesso à pasta que ela mesma abrir pelo
   Picker, nunca ao Drive inteiro dela) + openid/email/profile só pra saber quem é quem.
*/

const GOOGLE_CLIENT_ID = '946105310952-gp143h81mm3704lrq3877hsie49njgak.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyAMm_8CtFg_YP2ssG4XaiBbOc7wuJFq7xs';
const GOOGLE_PROJECT_NUMBER = '946105310952';
const GOOGLE_DRIVE_SCOPES = 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file';
/* V6.8.0 — teto de tamanho da pasta "backups" no Drive, combinado com você: 10GB.
   Com arquivos de ~1MB cada, dá muito espaço de sobra; o histórico completo continua
   no disco local de qualquer forma, então apagar os mais antigos do Drive é seguro. */
const GOOGLE_DRIVE_BACKUP_MAX_BYTES = 10 * 1024 * 1024 * 1024;
/* V6.20.0 — pedido: trocar os 3 slots girando a cada ~4-5min (90s × 3) por uma janela
   bem mais fina — 1 save por minuto, girando entre 20 slots (autosave-1.json ...
   autosave-20.json). Dá ~20 minutos de histórico curto granular, minuto a minuto. */
const GOOGLE_DRIVE_AUTOSAVE_INTERVAL_MS = 60 * 1000;
const GOOGLE_DRIVE_AUTOSAVE_IDLE_KICK_MS = 3 * 1000;
const GOOGLE_DRIVE_AUTOSAVE_RETRY_MS = 15 * 1000;
const GOOGLE_DRIVE_AUTOSAVE_SLOTS = 20;
/* V6.38.0 — pedido: quando um lançamento é feito num dispositivo (ex.: computador),
   os outros dispositivos já abertos (ex.: celular) devem enxergar a mudança sozinhos,
   sem precisar sair do app e entrar de novo. A cada GOOGLE_DRIVE_LIVE_POLL_MS, se este
   dispositivo NÃO tem nenhuma alteração local pendente, ele confere só os METADADOS do
   current.json (mesma chamada barata já usada pela checagem de conflito do syncNow —
   nenhum conteúdo é baixado à toa). Se o `modifiedTime` mudou, é porque outro
   dispositivo salvou — aí sim busca o conteúdo novo e atualiza a tela sozinho. Ver
   checkForRemoteUpdate() mais abaixo. */
const GOOGLE_DRIVE_LIVE_POLL_ACTIVE_MS = 2 * 1000;
const GOOGLE_DRIVE_LIVE_POLL_NORMAL_MS = 4500;
const GOOGLE_DRIVE_LIVE_POLL_IDLE_MS = 12000;
const GOOGLE_DRIVE_LIVE_ACTIVE_WINDOW_MS = 30 * 1000;
/* V6.20.0 — novo: além do autosave automático acima, cada Ctrl+S (forceSyncNow)
   agora também grava num rodízio PRÓPRIO de até 40 slots (forcesave-1.json ...
   forcesave-40.json), separado do autosave normal — histórico só dos momentos em que
   você mesmo decidiu "salvar agora", que tende a ser justamente antes/depois dos
   pontos que você quer poder voltar. Ver forceSyncNow(). */
const GOOGLE_DRIVE_FORCESAVE_SLOTS = 40;

const LS_GDRIVE_FOLDER_PREFIX = 'borion_gdrive_folder_'; // + googleSub -> folderId
const LS_GDRIVE_USER = 'borion_gdrive_user'; // cache do último usuário Google {sub,email,name,picture}

function gdriveReadFolderId(sub){ return localStorage.getItem(LS_GDRIVE_FOLDER_PREFIX + sub) || null; }
function gdriveWriteFolderId(sub, id){ localStorage.setItem(LS_GDRIVE_FOLDER_PREFIX + sub, id); }
function gdriveForgetFolderId(sub){ localStorage.removeItem(LS_GDRIVE_FOLDER_PREFIX + sub); }

const LS_GDRIVE_CURRENT_FILE_PREFIX='borion_gdrive_current_file_';
function gdriveCurrentFileKey(folderId){return LS_GDRIVE_CURRENT_FILE_PREFIX+folderId;}
function gdriveReadCurrentFileCache(folderId){
  try{const obj=JSON.parse(localStorage.getItem(gdriveCurrentFileKey(folderId))||'null');return obj&&obj.fileId?obj:null;}catch(e){return null;}
}
function gdriveWriteCurrentFileCache(folderId,meta){
  if(!folderId||!meta||!meta.id)return;
  try{localStorage.setItem(gdriveCurrentFileKey(folderId),JSON.stringify({fileId:meta.id,name:meta.name||'current.json',modifiedTime:meta.modifiedTime||null,createdTime:meta.createdTime||null,confirmedAt:new Date().toISOString()}));}catch(e){}
}
function gdriveForgetCurrentFileCache(folderId){try{localStorage.removeItem(gdriveCurrentFileKey(folderId));}catch(e){}}

/* V6.11.0 — persiste o ID da subpasta "backups", keyed pela pasta principal (não pela
   conta) — assim, qualquer sessão que conecte na mesma pasta principal reaproveita a
   mesma subpasta de backups sem precisar buscar por nome de novo (ver ensureBackupsFolder). */
const LS_GDRIVE_BACKUPS_FOLDER_PREFIX = 'borion_gdrive_backups_folder_';
function gdriveReadBackupsFolderId(mainFolderId){ return localStorage.getItem(LS_GDRIVE_BACKUPS_FOLDER_PREFIX + mainFolderId) || null; }
function gdriveWriteBackupsFolderId(mainFolderId, id){ localStorage.setItem(LS_GDRIVE_BACKUPS_FOLDER_PREFIX + mainFolderId, id); }

/* V6.12.0 — mesma ideia, agora pro arquivo de cada slot de autosave (evita duplicar
   autosave-1.json/2.json/3.json quando duas abas ou sessões calculam o mesmo slot perto
   uma da outra). Keyed por pasta de backups + número do slot. */
/* V6.20.0 — generalizado pra servir os dois rodízios (autosave e forcesave), cada um
   com seu próprio "namespace" de slots — sem isso, "slot 5" do autosave e "slot 5" do
   forcesave colidiriam na mesma chave e um pisaria no ID de arquivo do outro. */
const LS_GDRIVE_AUTOSAVE_FILE_PREFIX = 'borion_gdrive_autosave_file_';
function gdriveReadAutosaveFileId(folderId, kind, slot){ return localStorage.getItem(LS_GDRIVE_AUTOSAVE_FILE_PREFIX + kind + '_' + folderId + '_' + slot) || null; }
function gdriveWriteAutosaveFileId(folderId, kind, slot, id){ localStorage.setItem(LS_GDRIVE_AUTOSAVE_FILE_PREFIX + kind + '_' + folderId + '_' + slot, id); }

/* V6.20.0 — bug real corrigido: o índice de rotação (qual slot é "o próximo") vivia
   só em memória (this.autosaveSlotIndex = 0 sempre no boot). Como o Google Drive não
   é consultado pra descobrir "qual slot foi escrito por último", cada F5/fechar-e-abrir
   aba fazia a rotação recomeçar do slot 1 — o que podia sobrescrever um slot recente
   fora de ordem e deixar, por um tempo, um slot MAIS ANTIGO com "cara" de mais recente
   dentro da pasta (ex: reabrir o app 2x seguidas dava a impressão de "voltar" pra uma
   versão de alguns minutos atrás, até a rotação se realinhar sozinha depois de mais
   alguns ciclos). Agora o índice fica salvo por pasta, sobrevive a reload/fechar aba,
   e cada slot novo é sempre realmente o próximo depois do último gravado nesta pasta,
   nunca o slot 1 de novo por acaso. Mesma lógica serve autosave e forcesave (Ctrl+S),
   com chaves separadas (kind='autosave' | 'forcesave'). */
const LS_GDRIVE_SLOT_INDEX_PREFIX = 'borion_gdrive_slot_index_';
function gdriveReadSlotIndex(folderId, kind){
  const raw = localStorage.getItem(LS_GDRIVE_SLOT_INDEX_PREFIX + kind + '_' + folderId);
  const n = raw != null ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function gdriveWriteSlotIndex(folderId, kind, index){
  try{ localStorage.setItem(LS_GDRIVE_SLOT_INDEX_PREFIX + kind + '_' + folderId, String(index)); }catch(e){}
}

/* V6.16.0 — marcador "existe alteração local ainda não confirmada no Drive",
   persistido (sobrevive a reload/fechar aba) — ver queueSave()/syncNow()/loadFromDrive(). */
const LS_GDRIVE_PENDING_PREFIX = 'borion_gdrive_pending_';
function gdrivePendingKey(folderId){ return LS_GDRIVE_PENDING_PREFIX + folderId; }
/* Uma operação pode já estar durável no journal e ainda não ter entrado no
   current.json. Esse marcador é separado da edição local pendente para que a
   interface nunca confunda "protegido" com "snapshot confirmado". */
const LS_GDRIVE_CONSOLIDATION_PREFIX = 'borion_gdrive_consolidation_';
function gdriveConsolidationKey(folderId){ return LS_GDRIVE_CONSOLIDATION_PREFIX + folderId; }

/* ---------------- Autenticação (Google Identity Services) ---------------- */
const GoogleDriveAuth = {
  tokenClient:null,accessToken:null,tokenExpiresAt:0,user:null,_gisReady:false,_gapiReady:false,
  _scriptPromises:new Map(),_identityPromise:null,_pickerPromise:null,_tokenPromise:null,

  loadScript(src,timeoutMs=12000){
    if(this._scriptPromises.has(src)) return this._scriptPromises.get(src);
    const promise=new Promise((resolve,reject)=>{
      const existing=document.querySelector(`script[src="${src}"]`);
      if(existing&&existing.dataset.borionLoaded==='1'){resolve();return;}
      const script=existing||document.createElement('script');
      let settled=false;
      const done=(err)=>{if(settled)return;settled=true;clearTimeout(timer);if(err)reject(err);else{script.dataset.borionLoaded='1';resolve();}};
      const timer=setTimeout(()=>done(Object.assign(new Error('O script do Google demorou além do limite seguro.'),{code:'AUTH_TIMEOUT'})),timeoutMs);
      script.addEventListener('load',()=>done(),{once:true});
      script.addEventListener('error',()=>done(new Error('Falha ao carregar script do Google. Verifique sua internet.')),{once:true});
      if(!existing){script.src=src;script.async=true;script.defer=true;document.head.appendChild(script);}
      else if((src.includes('/gsi/client')&&window.google&&google.accounts)||(src.includes('/js/api.js')&&window.gapi))done();
    });
    this._scriptPromises.set(src,promise);
    promise.catch(()=>this._scriptPromises.delete(src));
    return promise;
  },

  async ensureIdentityLoaded(){
    if(this._gisReady&&window.google&&google.accounts&&google.accounts.oauth2)return true;
    if(!this._identityPromise){
      this._identityPromise=(async()=>{
        if(window.BootProgress)BootProgress.setStage('google_identity');
        if(window.BorionPerf)BorionPerf.startStage('google_identity_script');
        await this.loadScript('https://accounts.google.com/gsi/client',12000);
        if(!(window.google&&google.accounts&&google.accounts.oauth2))throw Object.assign(new Error('Google Identity Services não ficou disponível.'),{code:'AUTH_SCRIPT_INVALID'});
        this._gisReady=true;
        if(window.BorionPerf)BorionPerf.endStage('google_identity_script');
        return true;
      })();
      this._identityPromise.catch(()=>{this._identityPromise=null;});
    }
    return this._identityPromise;
  },

  async ensurePickerLoaded(){
    if(this._gapiReady&&window.google&&google.picker)return true;
    if(!this._pickerPromise){
      this._pickerPromise=(async()=>{
        await this.ensureIdentityLoaded();
        if(window.BorionPerf)BorionPerf.startStage('google_picker_script');
        await this.loadScript('https://apis.google.com/js/api.js',15000);
        await new Promise((resolve,reject)=>{
          let settled=false;
          const timer=setTimeout(()=>{if(!settled){settled=true;reject(Object.assign(new Error('O seletor de pastas do Google demorou além do limite.'),{code:'AUTH_TIMEOUT'}));}},12000);
          try{gapi.load('picker',()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();});}catch(e){clearTimeout(timer);reject(e);}
        });
        this._gapiReady=true;
        if(window.BorionPerf)BorionPerf.endStage('google_picker_script');
        return true;
      })();
      this._pickerPromise.catch(()=>{this._pickerPromise=null;});
    }
    return this._pickerPromise;
  },

  async ensureLoaded(){return this.ensureIdentityLoaded();},

  requestToken(interactive){
    if(this._tokenPromise)return this._tokenPromise;
    this._tokenPromise=new Promise((resolve,reject)=>{
      let settled=false;
      const finish=(err,token)=>{if(settled)return;settled=true;clearTimeout(timeoutId);this._tokenPromise=null;if(err)reject(err);else resolve(token);};
      const timeoutId=setTimeout(()=>finish(Object.assign(new Error('O Google não respondeu à renovação do acesso. Reconecte sua conta.'),{code:'AUTH_TIMEOUT'})),20000);
      try{
        this.tokenClient=google.accounts.oauth2.initTokenClient({
          client_id:GOOGLE_CLIENT_ID,scope:GOOGLE_DRIVE_SCOPES,
          callback:(resp)=>{
            if(resp&&resp.error){finish(Object.assign(new Error('Google recusou o acesso: '+resp.error),{code:'AUTH_REJECTED'}));return;}
            if(!resp||!resp.access_token){finish(Object.assign(new Error('O Google não devolveu um token de acesso válido.'),{code:'AUTH_TOKEN_INVALID'}));return;}
            this.accessToken=resp.access_token;this.tokenExpiresAt=Date.now()+((resp.expires_in||3300)*1000);finish(null,resp.access_token);
          },
          error_callback:(err)=>{
            const type=String(err&&(err.type||err.code)||'').toLowerCase();
            const popupBlocked=/popup.*failed|failed.*popup|popup_failed_to_open/.test(type);
            const popupClosed=/popup.*closed|closed.*popup/.test(type);
            const message=popupBlocked
              ? 'O navegador bloqueou a janela do Google. Permita pop-ups para este site e tente novamente.'
              : popupClosed
                ? 'A janela do Google foi fechada antes de concluir o login.'
                : ((err&&(err.message||err.type))||'Login com Google cancelado ou falhou.');
            finish(Object.assign(new Error(message),{code:popupBlocked?'AUTH_POPUP_BLOCKED':(popupClosed?'AUTH_POPUP_CLOSED':'AUTH_FAILED')}));
          }
        });
        this.tokenClient.requestAccessToken({prompt:interactive?'consent':''});
      }catch(e){finish(e);}
    });
    return this._tokenPromise;
  },

  async login(interactive){
    if(window.BootProgress)BootProgress.setStage('google_token',{detail:interactive?'Aguardando a confirmação da conta Google':'Renovando o acesso ao Google Drive'});
    if(window.BorionPerf)BorionPerf.startStage('google_token');
    let tokenPromise;
    // No clique do usuário, abre o popup antes do primeiro await. Isso preserva a
    // ativação do clique e evita "Failed to open popup window" em navegadores mais rígidos.
    if(interactive&&this._gisReady&&window.google&&google.accounts&&google.accounts.oauth2){
      tokenPromise=this.requestToken(true);
    }else{
      await this.ensureIdentityLoaded();
      tokenPromise=this.requestToken(!!interactive);
    }
    await tokenPromise;
    if(window.BorionPerf)BorionPerf.endStage('google_token');
    return await this.fetchUserInfo();
  },

  prepareInteractiveLogin(){
    return this.ensureIdentityLoaded();
  },

  async ensureFreshToken(interactive=false){
    if(this.accessToken&&Date.now()<this.tokenExpiresAt-60000)return this.accessToken;
    await this.ensureIdentityLoaded();
    return await this.requestToken(!!interactive);
  },

  invalidateToken(){this.accessToken=null;this.tokenExpiresAt=0;},

  resetLoginAttempt(){
    this.invalidateToken();
    this._tokenPromise=null;
    this.tokenClient=null;
    this.user=null;
    try{localStorage.removeItem(LS_GDRIVE_USER);}catch(e){}
  },

  async fetchUserInfo(){
    if(window.BorionPerf)BorionPerf.startStage('google_userinfo');
    const controller=typeof AbortController!=='undefined'?new AbortController():null;
    const timer=controller?setTimeout(()=>controller.abort(),10000):null;
    let res;
    try{res=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+this.accessToken},signal:controller?controller.signal:undefined});}
    catch(e){if(e&&e.name==='AbortError')throw Object.assign(new Error('O Google demorou para confirmar sua conta.'),{code:'AUTH_TIMEOUT'});throw e;}
    finally{if(timer)clearTimeout(timer);}
    if(!res.ok)throw Object.assign(new Error('Não foi possível confirmar a conta Google (status '+res.status+').'),{status:res.status,code:res.status===401?'AUTH_REQUIRED':'AUTH_USERINFO_FAILED'});
    const info=await res.json();
    this.user={sub:info.sub,email:info.email,name:info.name||info.email,picture:info.picture||''};
    writeJSON(LS_GDRIVE_USER,this.user);
    if(window.BorionPerf)BorionPerf.endStage('google_userinfo');
    return this.user;
  },

  signOut(){if(this.accessToken){try{google.accounts.oauth2.revoke(this.accessToken,()=>{});}catch(e){}}this.accessToken=null;this.tokenExpiresAt=0;this.user=null;localStorage.removeItem(LS_GDRIVE_USER);}
};
window.GoogleDriveAuth=GoogleDriveAuth;

/* ---------------- Chamadas cruas à Drive API ---------------- */
const GoogleDriveFS = {
  async authHeaders(){
    const token = await GoogleDriveAuth.ensureFreshToken();
    return { Authorization: 'Bearer ' + token };
  },

  /* V6.42.0 — timeout, cancelamento, retry limitado e telemetria local. */
  async request(url,options={}){
    const method=String(options.method||'GET').toUpperCase();
    const isList=/\/drive\/v3\/files\?/.test(url)&&/q=/.test(url);
    const isDownload=/alt=media/.test(url);
    const isUpload=/\/upload\/drive\/v3\//.test(url);
    const isMeta=!isList&&!isDownload&&!isUpload&&method==='GET';
    const kind=options.kind||(isUpload?'upload':isDownload?'download':isList?'list':isMeta?'metadata':'other');
    const timeoutMs=Number(options.timeoutMs)||(kind==='metadata'?11000:kind==='list'?15000:kind==='download'?25000:kind==='upload'?35000:15000);
    const maxAttempts=Math.max(1,Math.min(5,Number(options.maxAttempts)||3));
    const retryable=new Set([429,500,502,503,504]);
    const bodyBytes=options.body==null?0:(typeof options.body==='string'?(typeof TextEncoder!=='undefined'?new TextEncoder().encode(options.body).byteLength:options.body.length):(options.body.byteLength||options.body.size||0));
    let response=null,authRetried=false,lastError=null;
    for(let attempt=0;attempt<maxAttempts;attempt++){
      if(window.BorionPerf){BorionPerf.countDriveRequest(kind);if(bodyBytes)BorionPerf.recordPayloadSize('upload',bodyBytes);}
      const headers=Object.assign({},options.headers||{},await this.authHeaders());
      const controller=typeof AbortController!=='undefined'?new AbortController():null;
      const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
      const fetchOptions=Object.assign({},options,{headers});
      delete fetchOptions.timeoutMs;delete fetchOptions.kind;delete fetchOptions.maxAttempts;
      if(controller)fetchOptions.signal=controller.signal;
      try{response=await fetch(url,fetchOptions);lastError=null;}
      catch(e){
        lastError=e;
        if(e&&e.name==='AbortError'){
          const code=kind==='download'?'DOWNLOAD_TIMEOUT':kind==='upload'?'UPLOAD_TIMEOUT':'DRIVE_TIMEOUT';
          lastError=Object.assign(new Error('O Google Drive demorou além do limite desta operação.'),{code,kind,timeoutMs});
        }
      }finally{if(timer)clearTimeout(timer);}
      if(lastError){
        if(attempt===maxAttempts-1)throw lastError;
        if(window.BorionPerf)BorionPerf.count('driveRetries',1);
        await new Promise(r=>setTimeout(r,Math.min(4000,350*Math.pow(2,attempt))));
        continue;
      }
      if(response.status===401&&!authRetried){GoogleDriveAuth.invalidateToken();authRetried=true;if(window.BorionPerf)BorionPerf.count('driveRetries',1);continue;}
      if(!retryable.has(response.status)||attempt===maxAttempts-1){
        const len=Number(response.headers&&response.headers.get&&response.headers.get('Content-Length'))||0;
        if(len&&kind!=='download'&&window.BorionPerf)BorionPerf.recordPayloadSize('download',len);
        return response;
      }
      if(window.BorionPerf)BorionPerf.count('driveRetries',1);
      const retryAfter=Number(response.headers&&response.headers.get&&response.headers.get('Retry-After'))||0;
      await new Promise(r=>setTimeout(r,retryAfter?Math.min(8000,retryAfter*1000):Math.min(4000,450*Math.pow(2,attempt))));
    }
    return response;
  },

  async findChildren(parentId,name,mimeType,options={}){
    const safeName=String(name).replace(/'/g,"\\'");
    let q=`'${parentId}' in parents and name='${safeName}' and trashed=false`;
    if(mimeType) q+=` and mimeType='${mimeType}'`;
    const files=await this.listQuery(q,Object.assign({orderBy:'createdTime,name'},options));
    return files.sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id)));
  },

  async findChild(parentId,name,mimeType){
    const files=await this.findChildren(parentId,name,mimeType);
    const first=files[0]||null;
    if(first&&files.length>1){try{Object.defineProperty(first,'__borionMatches',{value:files,enumerable:false,configurable:true});}catch(e){first.__borionMatches=files;}}
    return first;
  },

  async createFolder(parentId, name){
    const res = await this.request('https://www.googleapis.com/drive/v3/files?fields=id,name', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
    });
    if(!res.ok) throw Object.assign(new Error('Falha ao criar pasta \"' + name + '\" no Google Drive (status ' + res.status + ').'),{status:res.status});
    return await res.json();
  },

  async findOrCreateFolder(parentId, name){
    const existing = await this.findChild(parentId, name, 'application/vnd.google-apps.folder');
    if(existing) return existing;
    return await this.createFolder(parentId, name);
  },

  async readFile(fileId){
    const res = await this.request('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media');
    if(!res.ok) throw Object.assign(new Error('Falha ao ler arquivo do Google Drive (status ' + res.status + ').'),{status:res.status});
    const text=await res.text();if(window.BorionPerf)BorionPerf.recordPayloadSize('download',typeof TextEncoder!=='undefined'?new TextEncoder().encode(text).byteLength:text.length);
    try{return JSON.parse(text);}catch(e){throw Object.assign(new Error('O arquivo recebido do Google Drive não contém JSON válido.'),{code:'DRIVE_JSON_INVALID',cause:e});}
  },

  async readFileText(fileId){
    const res=await this.request('https://www.googleapis.com/drive/v3/files/'+fileId+'?alt=media');
    if(!res.ok) throw Object.assign(new Error('Falha ao ler bytes do arquivo no Google Drive (status '+res.status+').'),{status:res.status});
    const text=await res.text();if(window.BorionPerf)BorionPerf.recordPayloadSize('download',typeof TextEncoder!=='undefined'?new TextEncoder().encode(text).byteLength:text.length);return text;
  },

  async getFileMeta(fileId){
    const res = await this.request('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,name,modifiedTime,createdTime,mimeType,trashed,parents,size');
    if(!res.ok){
      const err = new Error('Falha ao consultar metadados do arquivo no Drive (status ' + res.status + ').');
      err.status = res.status;
      throw err;
    }
    return await res.json();
  },

  async createTextFile(parentId,name,text,mimeType='application/json'){
    const boundary='borion_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    const metadata={name,parents:[parentId],mimeType};
    const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n'
      +'--'+boundary+'\r\nContent-Type: '+mimeType+'; charset=UTF-8\r\n\r\n'+String(text)+'\r\n--'+boundary+'--';
    const res=await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime,createdTime',{
      method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
    });
    if(!res.ok) throw Object.assign(new Error('Falha ao criar arquivo bruto \"'+name+'\" no Google Drive (status '+res.status+').'),{status:res.status});
    return await res.json();
  },

  async createFile(parentId, name, obj){
    const boundary = 'borion_' + Date.now();
    const metadata = { name, parents: [parentId], mimeType: 'application/json' };
    const body = '--' + boundary + '\r\n'
      + 'Content-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(metadata) + '\r\n'
      + '--' + boundary + '\r\n'
      + 'Content-Type: application/json\r\n\r\n' + JSON.stringify(obj) + '\r\n'
      + '--' + boundary + '--';
    const res = await this.request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body
    });
    if(!res.ok) throw Object.assign(new Error('Falha ao criar arquivo \"' + name + '\" no Google Drive (status ' + res.status + ').'),{status:res.status});
    return await res.json();
  },

  async updateFile(fileId, obj){
    const res = await this.request('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media&fields=id,name,modifiedTime', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj)
    });
    if(!res.ok) throw Object.assign(new Error('Falha ao salvar no Google Drive (status ' + res.status + ').'),{status:res.status});
    return await res.json();
  },

  /* V6.40.2 — paginação completa. Uma falha em qualquer página lança erro;
     o journal não avança parcialmente. */
  async listQuery(q,options={}){
    const pageSize=Math.min(1000,Math.max(1,Number(options.pageSize)||1000));
    const maxPages=Math.max(1,Number(options.maxPages)||1000);
    const maxItems=Math.max(1,Number(options.maxItems)||250000);
    const orderBy=options.orderBy||'name';
    const fields=options.fields||'nextPageToken,files(id,name,modifiedTime,createdTime,mimeType,parents,size)';
    const all=[],seen=new Set(); let pageToken=null,pages=0;
    do{
      if(++pages>maxPages) throw Object.assign(new Error('Limite de segurança de páginas do Google Drive excedido.'),{code:'DRIVE_LIST_LIMIT'});
      let url='https://www.googleapis.com/drive/v3/files?q='+encodeURIComponent(q)+'&pageSize='+pageSize+'&fields='+encodeURIComponent(fields)+'&orderBy='+encodeURIComponent(orderBy);
      if(pageToken) url+='&pageToken='+encodeURIComponent(pageToken);
      const res=await this.request(url);
      if(!res.ok) throw Object.assign(new Error('Falha ao listar página '+pages+' do Google Drive (status '+res.status+').'),{code:'DRIVE_LIST_INCOMPLETE',status:res.status,page:pages});
      const data=await res.json();
      for(const f of (data.files||[])){if(!f||!f.id||seen.has(f.id))continue;seen.add(f.id);all.push(f);if(all.length>maxItems)throw Object.assign(new Error('Limite de segurança de itens do Google Drive excedido.'),{code:'DRIVE_LIST_LIMIT'});}
      pageToken=data.nextPageToken||null;
    }while(pageToken);
    if(window.BorionPerf){
      BorionPerf.count('driveItemsListed',all.length);
      BorionPerf.count('foldersListed',all.reduce((n,item)=>n+(item&&item.mimeType==='application/vnd.google-apps.folder'?1:0),0));
    }
    return all.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''))||String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id)));
  },

  async listChildren(parentId,options={}){
    const q=`'${parentId}' in parents and trashed=false`;
    return await this.listQuery(q,options);
  },

  async moveFile(fileId,newParentId,oldParentId){
    let url='https://www.googleapis.com/drive/v3/files/'+fileId+'?addParents='+encodeURIComponent(newParentId)+'&fields=id,parents';
    if(oldParentId) url+='&removeParents='+encodeURIComponent(oldParentId);
    const res=await this.request(url,{method:'PATCH'});
    if(!res.ok) throw Object.assign(new Error('Falha ao mover arquivo no Google Drive (status '+res.status+').'),{status:res.status});
    return await res.json();
  },

  /* V6.40 — move para a lixeira em vez de apagar de forma permanente (DELETE) —
     um arquivo de operação só é limpo bem depois de já estar refletido num
     snapshot consolidado e validado (ver cleanupAppliedOperations), mas mesmo
     assim preferimos "recuperável por 30 dias na lixeira do Drive" a "apagado
     sem volta", como proteção extra contra qualquer bug de limpeza. */
  async trashFile(fileId){
    const res = await this.request('https://www.googleapis.com/drive/v3/files/' + fileId + '?fields=id,trashed', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    if(!res.ok) throw Object.assign(new Error('Falha ao mover arquivo para a lixeira do Google Drive (status ' + res.status + ').'),{status:res.status});
    return await res.json();
  }
};

/* Abre o seletor nativo do Google ("Picker") pra pessoa escolher a pasta que foi
   compartilhada com ela. Só roda na primeira conexão — depois o folderId fica salvo. */
async function openDriveFolderPicker(){
  await GoogleDriveAuth.ensurePickerLoaded();
  return new Promise((resolve, reject)=>{
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setSelectFolderEnabled(true)
      .setIncludeFolders(true)
      .setMimeTypes('application/vnd.google-apps.folder');
    const picker = new google.picker.PickerBuilder()
      .setTitle('Escolha a pasta do Borion Finance compartilhada com você')
      .addView(view)
      .setOAuthToken(GoogleDriveAuth.accessToken)
      .setDeveloperKey(GOOGLE_API_KEY)
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setCallback((data)=>{
        if(data.action === google.picker.Action.PICKED){ resolve(data.docs[0]); }
        else if(data.action === google.picker.Action.CANCEL){ reject(new Error('Nenhuma pasta selecionada.')); }
      })
      .build();
    picker.setVisible(true);
  });
}

/* Aplica um payload de conta (mesmo formato de buildFullBackupPayload) direto no
   estado local, SEM mostrar modal de escolha — é o equivalente, pro Google Drive, do
   que enterCloudUser() faz para o Supabase: carregar e pronto, sem perguntar nada,
   porque é o carregamento normal de entrada, não uma importação manual. */
function cloneAccountValue6401(value){
  return value==null ? value : JSON.parse(JSON.stringify(value));
}

/* Prepara TODA a conta em memória antes de tocar no estado persistido. Assim, uma
   exceção no segundo/terceiro perfil não deixa configurações novas combinadas com
   somente parte dos perfis migrados. Dados órfãos e IDs de perfil duplicados entram
   em recuperação em vez de serem ignorados. */
function prepareAccountPayload6401(obj){
  if(!obj||typeof obj!=='object'||Array.isArray(obj)) throw Object.assign(new Error('Payload de conta inválido.'),{code:'ACCOUNT_PAYLOAD_INVALID'});
  const nextProfiles=cloneAccountValue6401(obj.profiles||[]);
  const rawData=obj.dataByProfile;
  if(!Array.isArray(nextProfiles)||!rawData||typeof rawData!=='object'||Array.isArray(rawData)) throw Object.assign(new Error('Conta sem índice íntegro de perfis.'),{code:'ACCOUNT_PROFILE_INDEX_INVALID'});
  const ids=new Set();
  for(const profile of nextProfiles){
    const id=profile&&profile.id!=null?String(profile.id):'';
    if(!id) throw Object.assign(new Error('Perfil sem ID; aplicação bloqueada.'),{code:'PROFILE_ID_MISSING'});
    if(ids.has(id)) throw Object.assign(new Error('ID de perfil duplicado: '+id+'.'),{code:'PROFILE_ID_DUPLICATE',profileId:id});
    ids.add(id);
    if(!Object.prototype.hasOwnProperty.call(rawData,id)) throw Object.assign(new Error('Perfil '+id+' sem dados correspondentes.'),{code:'PROFILE_DATA_MISSING',profileId:id});
  }
  const orphanIds=Object.keys(rawData).filter(id=>!ids.has(String(id)));
  if(orphanIds.length) throw Object.assign(new Error('Dados órfãos de perfil detectados: '+orphanIds.join(', ')+'.'),{code:'PROFILE_DATA_ORPHANED',profileIds:orphanIds});
  const nextDataByProfile={};
  for(const profile of nextProfiles){
    const id=String(profile.id);
    const raw=cloneAccountValue6401(rawData[id]);
    nextDataByProfile[id]=migrateData(raw||emptyData(),{profileId:id});
  }
  return {
    config:cloneAccountValue6401(obj.config!=null?obj.config:(S.config||{})),
    profiles:nextProfiles,
    dataByProfile:nextDataByProfile,
    profileTombstones:cloneAccountValue6401(obj.__syncMeta640&&obj.__syncMeta640.profileTombstones)
  };
}

async function buildMigratedSnapshot6401(obj){
  const prepared=prepareAccountPayload6401(obj);
  const out=cloneAccountValue6401(obj);
  out.config=prepared.config;out.profiles=prepared.profiles;out.dataByProfile=prepared.dataByProfile;
  out.profileCount=prepared.profiles.length;
  out.appVersion=BORION_APP_VERSION;
  out.__syncMeta640=Object.assign({},out.__syncMeta640||{}, {
    schemaVersion:BorionSyncCore.BORION_DATA_SCHEMA_VERSION,
    profileTombstones:prepared.profileTombstones||((out.__syncMeta640&&out.__syncMeta640.profileTombstones)||{})
  });
  const canonical=cloneAccountValue6401(out);delete canonical.integrity;
  out.integrity=Object.assign({},out.integrity||{}, {
    algorithm:'SHA-256',checksum:await BorionSyncCore.checksumOf(canonical),
    schemaVersion:BorionSyncCore.BORION_DATA_SCHEMA_VERSION,generatedAt:new Date().toISOString(),
    recordCount:(window.BorionDataGuard?BorionDataGuard.countAccountRecords(out).__total:undefined),
    profileCount:prepared.profiles.length
  });
  return out;
}

function commitPreparedAccountPayload6401(prepared,options={}){
  const previous={
    config:cloneAccountValue6401(S.config||{}),profiles:cloneAccountValue6401(S.profiles||[]),
    currentProfile:cloneAccountValue6401(S.currentProfile),data:cloneAccountValue6401(S.data),
    tombstones:typeof getProfileTombstones6401==='function'?cloneAccountValue6401(getProfileTombstones6401()):null,
    dataByProfile:{}
  };
  for(const p of previous.profiles||[]) if(p&&p.id!=null){const id=String(p.id);const stored=typeof getProfileData==='function'?getProfileData(id):((S.currentProfile&&String(S.currentProfile.id)===id)?S.data:null);previous.dataByProfile[id]=cloneAccountValue6401(stored);}
  const nextIds=new Set((prepared.profiles||[]).map(p=>String(p.id)));
  try{
    // Persistência só começa depois que todos os perfis terminaram a migração em memória.
    setConfig(prepared.config);setProfiles(prepared.profiles);
    for(const p of prepared.profiles) setProfileData(String(p.id),prepared.dataByProfile[String(p.id)]);
    if(prepared.profileTombstones&&typeof applyProfileTombstones6401==='function') applyProfileTombstones6401(prepared.profileTombstones);
    // Só apaga o cache de um perfil ausente quando existe tombstone explícito.
    // Assim uma listagem incompleta nunca elimina dados locais, mas uma exclusão
    // confirmada não deixa uma cópia velha disponível para ressurreição.
    for(const oldProfile of previous.profiles||[]){
      const oldId=oldProfile&&oldProfile.id!=null?String(oldProfile.id):'';
      if(!oldId||nextIds.has(oldId)||!(prepared.profileTombstones&&prepared.profileTombstones[oldId])) continue;
      try{localStorage.removeItem('mc_data_'+oldId);}catch(e){}
      try{if(typeof idbDeleteProfileData==='function')idbDeleteProfileData(oldId);}catch(e){}
      try{if(typeof clearExitSavePending==='function')clearExitSavePending(oldId);}catch(e){}
    }
    S.config=prepared.config;S.profiles=prepared.profiles;
    if(options.preserveCurrentProfile&&previous.currentProfile){
      const active=prepared.profiles.find(p=>String(p.id)===String(previous.currentProfile.id));
      if(active){S.currentProfile=active;S.data=prepared.dataByProfile[String(active.id)];return {profileRemoved:false};}
      S.currentProfile=null;S.data=null;return {profileRemoved:true};
    }
    S.currentProfile=null;S.data=null;return {profileRemoved:false};
  }catch(error){
    // Rollback melhor-esforço: nunca deixa uma conta parcialmente aplicada por uma
    // falha de armazenamento/quota. O snapshot remoto e o journal permanecem intactos.
    try{
      setConfig(previous.config);setProfiles(previous.profiles);
      for(const [id,data] of Object.entries(previous.dataByProfile)) if(data!=null)setProfileData(id,data);
      for(const id of nextIds) if(!Object.prototype.hasOwnProperty.call(previous.dataByProfile,id)){
        try{localStorage.removeItem('mc_data_'+id);}catch(_e){}
        try{if(typeof idbDeleteProfileData==='function')idbDeleteProfileData(id);}catch(_e){}
      }
      if(previous.tombstones&&typeof setProfileTombstones6401==='function')setProfileTombstones6401(previous.tombstones);
      S.config=previous.config;S.profiles=previous.profiles;S.currentProfile=previous.currentProfile;S.data=previous.data;
    }catch(rollbackError){console.error('[GoogleDriveProvider] rollback local da conta falhou:',rollbackError);}
    throw Object.assign(error instanceof Error?error:new Error(String(error)),{code:(error&&error.code)||'ACCOUNT_COMMIT_FAILED'});
  }
}

function applyAccountPayloadSilently(obj){
  const prepared=prepareAccountPayload6401(obj);
  return commitPreparedAccountPayload6401(prepared,{preserveCurrentProfile:false});
}

/* V6.38.0 — versão "gentil" da função acima, usada pela atualização automática em
   segundo plano (checkForRemoteUpdate): atualiza os perfis e os dados de TODOS eles
   (assim como applyAccountPayloadSilently), mas NÃO derruba a pessoa de volta pro
   seletor de perfil — se ela já estava dentro de um perfil, continua nele, só com os
   números atualizados. Só sai do perfil atual no caso raro de ele ter sido apagado
   em outro dispositivo enquanto esta aba estava aberta. */
function applyAccountPayloadForLiveUpdate(obj){
  const prepared=prepareAccountPayload6401(obj);
  return commitPreparedAccountPayload6401(prepared,{preserveCurrentProfile:true});
}
function handleRemovedActiveProfile6402(result,source='remote_update'){
  if(!result||!result.profileRemoved) return false;
  try{if(typeof resetImportTransientState==='function')resetImportTransientState();}catch(e){}
  try{if(typeof closeModal==='function')closeModal();}catch(e){}
  S.currentProfile=null;S.data=null;S.gate={mode:'list',selectedProfileId:null,error:''};
  if(window.ExitSaveGuard&&typeof ExitSaveGuard.refresh==='function')ExitSaveGuard.refresh();
  if(typeof renderGate==='function')renderGate();
  if(typeof toast==='function')toast('O perfil que estava aberto foi removido em outro dispositivo.');
  return true;
}

/* V6.38.0 — nunca aplica uma atualização automática em cima de algo que a pessoa
   está digitando ou de um modal aberto (ex.: criando um lançamento) — isso poderia
   apagar o que ela estava preenchendo ou mudar o conteúdo debaixo dela sem aviso.
   Se não for seguro agora, a próxima checagem (poucos segundos depois) tenta de
   novo sozinha — nenhuma atualização é perdida, só adiada. */
function borionLiveUpdateSafeToApplyNow(){
  if(window.BorionEditGuard&&typeof BorionEditGuard.isSafeForRemoteApply==='function')return BorionEditGuard.isSafeForRemoteApply();
  return !document.querySelector('.modal-overlay');
}

/* ---------------- Provider principal ---------------- */
const GoogleDriveProvider = {
  folderId: null,
  currentFileId: null,
  _backupsFolderId:null,_backupsFolderIds:[],_backupsFolderDuplicates:[],_backupsFolderPromise:null,
  currentFileMeta: null,
  dirty: false,
  syncTimer: null,
  autosaveTimer: null,
  autosaveKickTimer: null,
  liveTimer: null,
  _liveCheckInFlight: false,
  autosaveSlotIndex: 0,
  forcesaveSlotIndex: 0,
  autosaveDirtySinceLast: false,
  lastAutosaveAt: 0,
  _autosaveRevision: 0,
  _autosaveInFlight: false,
  _syncInFlight: false,
  _syncAgain: false,
  _syncRevision: 0,
  _forceRequested: false,
  _forceSavePromise: null,
  syncRetryTimer: null,
  syncRetryAttempt: 0,
  lastSyncAt: 0,
  lastSyncError: '',
  authRequired: false,
  _lastFailureToastAt: 0,
  // V6.40 — journal de operações imutáveis + merge de três vias.
  _deviceId: null,
  _lastConsolidatedPayload: null,
  _operationBasePayload: null,
  _queueOperationId: null,
  _consolidateCount: 0,
  pendingMergeConflicts: [],
  _liveActiveUntil:0,_lastUserActivityAt:Date.now(),_livePollBound:false,_livePollStartedAt:0,
  _pendingRemoteSnapshot:null,_lastSyncStartedAt:0,_lastSyncDurationMs:0,_pendingQueueCount:0,

  isConnected(){ return !!(GoogleDriveAuth.user && this.folderId); },

  hasPersistedPending(){
    try{ return !!(this.folderId && localStorage.getItem(gdrivePendingKey(this.folderId))); }
    catch(e){ return false; }
  },

  hasPersistedConsolidation(){
    try{ return !!(this.folderId && localStorage.getItem(gdriveConsolidationKey(this.folderId))); }
    catch(e){ return false; }
  },

  _persistConsolidationPending(operationId){
    this._protectedOperationId=operationId||this._protectedOperationId||null;
    try{localStorage.setItem(gdriveConsolidationKey(this.folderId),JSON.stringify({operationId:this._protectedOperationId,createdAt:new Date().toISOString()}));}catch(e){}
  },

  _readPersistedConsolidationOperationId(){
    try{const raw=localStorage.getItem(gdriveConsolidationKey(this.folderId));if(!raw)return this._protectedOperationId||null;const obj=JSON.parse(raw);return obj&&obj.operationId||this._protectedOperationId||null;}catch(e){return this._protectedOperationId||null;}
  },

  _clearConsolidationPending(){
    this._protectedOperationId=null;
    try{if(this.folderId)localStorage.removeItem(gdriveConsolidationKey(this.folderId));}catch(e){}
  },

  _isAuthError(error){
    if(error&&Number(error.status)===401) return true;
    const msg = String((error && error.message) || error || '');
    return /status\s*401|oauth|token|google recusou|login com google|renova|popup|access[_ -]?denied|interaction[_ -]?required/i.test(msg);
  },

  async _refreshPendingQueueCount(){
    if(!window.BorionDurableQueue||typeof BorionDurableQueue.pendingOnly!=='function')return this._pendingQueueCount||0;
    try{this._pendingQueueCount=(await BorionDurableQueue.pendingOnly()).length;}catch(e){}
    this._refreshStatusUI();
    return this._pendingQueueCount||0;
  },

  _refreshStatusUI(){
    if(typeof document==='undefined'||typeof document.getElementById!=='function')return;
    const el=document.getElementById('cloud_status_badge');if(!el||!this.isConnected())return;
    el.onclick=()=>this.handleStatusClick();
    const state=(window.BorionSyncState&&BorionSyncState.current)||'';
    if(this.blockedSuspicious){el.className='cloud-status offline';el.textContent='Salvamento bloqueado — ver';el.title=this.blockedSuspicious;return;}
    if(this.pendingMergeConflicts&&this.pendingMergeConflicts.length&&!this.dirty&&!this._syncInFlight){el.className='cloud-status offline';el.textContent='Conflito precisa de revisão';el.title=this.pendingMergeConflicts.length+' conflito(s) preservado(s) para revisão.';return;}
    if(state==='RECOVERY'||state==='JOURNAL_ERROR'){el.className='cloud-status offline';el.textContent=state==='RECOVERY'?'Modo de recuperação':'Erro no journal';el.title=this.lastSyncError||'O último snapshot válido foi preservado.';return;}
    if(this.authRequired||state==='AUTH_REQUIRED'){el.className='cloud-status offline';el.textContent='Google Drive — reconectar';el.title=this.lastSyncError||'Autenticação necessária.';return;}
    if(!navigator.onLine||state==='OFFLINE_PENDING'){el.className='cloud-status offline';el.textContent='Salvo neste dispositivo';el.title='Offline. A alteração está preservada localmente e será enviada quando a internet voltar.';return;}
    if((window.RemoteUpdateQueue&&RemoteUpdateQueue.hasPending())||state==='REMOTE_CHANGED'){el.className='cloud-status syncing';el.textContent='Aguardando finalizar edição';el.title='Atualização recebida e validada; será aplicada assim que o formulário em edição for finalizado.';return;}
    if(state==='PROTECTING_DRIVE'){el.className='cloud-status syncing';el.textContent='Protegendo alteração no Drive';el.title='Criando a operação imutável no Google Drive.';return;}
    if(state==='DRIVE_PROTECTED'||this.hasPersistedConsolidation()){el.className='cloud-status syncing';el.textContent='Alteração protegida no Drive';el.title='A operação existe no Drive, mas o snapshot ainda precisa ser consolidado.';return;}
    if(state==='MERGING'){el.className='cloud-status syncing';el.textContent='Consolidando dados';el.title='Aplicando operações ao snapshot e validando checksum.';return;}
    if(this.dirty||this._syncInFlight||this.hasPersistedPending()||state==='QUEUED'){const n=this._pendingQueueCount||1;el.className='cloud-status syncing';el.textContent=n===1?'1 alteração pendente':n+' alterações pendentes';el.title='Salvo neste dispositivo; '+n+' alteração(ões) aguardando proteção e consolidação no Drive.';return;}
    if(this.lastSyncError){el.className='cloud-status offline';el.textContent='Erro de sincronização';el.title=this.lastSyncError;return;}
    el.className='cloud-status local';el.textContent='Sincronizado agora';el.title='Snapshot consolidado, relido e validado'+(this.lastSyncAt?' às '+new Date(this.lastSyncAt).toLocaleTimeString('pt-BR'):'')+(this._lastSyncDurationMs?' em '+Math.round(this._lastSyncDurationMs)+' ms':'')+'.';
  },

  _clearRetry(){
    if(this.syncRetryTimer){ clearTimeout(this.syncRetryTimer); this.syncRetryTimer=null; }
    this.syncRetryAttempt=0;
  },

  _scheduleRetry(delayOverride){
    if(!this.isConnected() || (!this.dirty&&!this.hasPersistedConsolidation()) || this.conflict || this.blockedSuspicious) return;
    if(this.syncRetryTimer) return;
    const delay = Number.isFinite(delayOverride)
      ? Math.max(1000, delayOverride)
      : Math.min(60000, 3000 * Math.pow(2, Math.min(this.syncRetryAttempt, 4)));
    this.syncRetryAttempt++;
    this.syncRetryTimer=setTimeout(()=>{
      this.syncRetryTimer=null;
      if(this.dirty||this.hasPersistedConsolidation()) this.syncNow({source:'retry'});
    }, delay);
  },

  _recordSyncFailure(error, options={}){
    const msg = String((error && error.message) || error || 'Falha desconhecida ao acessar o Google Drive.');
    this.lastSyncError = msg;
    this.authRequired = this._isAuthError(error);
    this.dirty = true;
    this._refreshStatusUI();
    this._scheduleRetry(this.authRequired ? 15000 : undefined);
    const now=Date.now();
    if(!options.silent && now-this._lastFailureToastAt>12000){
      this._lastFailureToastAt=now;
      toast((this.authRequired?'A conexão com o Google expirou. Toque no selo para reconectar. ':'Não foi possível confirmar no Google Drive. ')+'Os dados continuam salvos neste dispositivo.');
    }
  },

  _recordSyncSuccess(){
    this.lastSyncAt=Date.now();
    if(this._lastSyncStartedAt)this._lastSyncDurationMs=Math.max(0,Date.now()-this._lastSyncStartedAt);
    if(typeof this.boostLivePolling==='function')this.boostLivePolling();
    this.lastSyncError='';
    this.authRequired=false;
    this._clearRetry();
    if(S && S.currentProfile && typeof clearExitSavePending==='function') clearExitSavePending(S.currentProfile.id);
    this._refreshStatusUI();
  },

  async resumePendingSync(source='resume'){
    if(!this.isConnected()) return false;
    if(window.BorionMultiTab640&&!BorionMultiTab640.isLeader()){BorionMultiTab640.requestSync({folderId:this.folderId,source});return {delegated:true,synced:false};}
    if(this.hasPersistedPending()) this.dirty=true;
    if(!this.dirty&&this.hasPersistedConsolidation()) return await this.syncNow({source,consolidationOnly:true});
    if(!this.dirty){
      this._refreshStatusUI();
      return await this.checkForRemoteUpdate();
    }
    if(!navigator.onLine){
      this.lastSyncError='Sem internet. A alteração está salva somente neste dispositivo por enquanto.';
      this.authRequired=false;
      this._refreshStatusUI();
      this._scheduleRetry(5000);
      return false;
    }
    return await this.syncNow({source});
  },

  async handleStatusClick(){
    if(this.blockedSuspicious){ await this.reload(); return false; }
    if(this.pendingMergeConflicts && this.pendingMergeConflicts.length && !this.dirty){
      // V6.40 — item 24: nenhum dado é apagado por clicar aqui. Isto só
      // mostra um resumo dos campos em conflito (as duas versões já foram
      // preservadas pelo merge) e limpa o indicador visual — uma tela de
      // revisão completa (aceitar local/remoto/duplicar) fica para uma
      // próxima entrega; por enquanto, a revisão manual do current.json e do
      // registro em __syncMeta.conflicts (por perfil) mostra os valores.
      const summary = this.pendingMergeConflicts.slice(0,5).map(c=>{
        if(c.kind==='field_conflict') return `${c.collection}#${c.id}.${c.field}`;
        return `${c.collection}#${c.id} (${c.kind})`;
      }).join(', ');
      toast('Conflito(s) de sincronização preservados sem perda de dados: '+summary+(this.pendingMergeConflicts.length>5?'…':'')+'. Detalhes completos em cada perfil, dataByProfile.<perfil>.__syncMeta.conflicts.');
      this.pendingMergeConflicts = [];
      this._refreshStatusUI();
      return true;
    }
    try{
      if(this.authRequired){
        const previousSub=GoogleDriveAuth.user && GoogleDriveAuth.user.sub;
        await GoogleDriveAuth.login(true);
        if(previousSub && GoogleDriveAuth.user && GoogleDriveAuth.user.sub!==previousSub){
          throw new Error('Reconecte usando a mesma conta Google que já estava vinculada a esta pasta.');
        }
        this.lastSyncError=''; this.authRequired=false;
      }
      const ok=await this.resumePendingSync('status_click');
      if(ok || !this.dirty) toast('Google Drive sincronizado e confirmado.');
      return !!ok;
    }catch(e){
      this._recordSyncFailure(e);
      return false;
    }
  },

  async getValidatedFolderMeta(folderId){
    try{
      const meta=await GoogleDriveFS.getFileMeta(folderId);
      if(!meta||!meta.id||meta.trashed||meta.mimeType!=='application/vnd.google-apps.folder')return {exists:false,meta:null};
      return {exists:true,meta};
    }catch(e){if(e&&e.status===404)return {exists:false,meta:null};throw e;}
  },

  async _resolveCurrentFile(){
    if(window.BootProgress)BootProgress.setStage('current_meta');
    if(window.BorionPerf)BorionPerf.startStage('current_file_lookup');
    const cached=gdriveReadCurrentFileCache(this.folderId);
    if(cached&&cached.fileId){
      try{
        const meta=await GoogleDriveFS.getFileMeta(cached.fileId);
        const parentOk=!Array.isArray(meta.parents)||meta.parents.includes(this.folderId);
        if(meta&&meta.id&&meta.name==='current.json'&&!meta.trashed&&parentOk){
          if(window.BorionPerf)BorionPerf.count('currentFileCacheHits',1);
          gdriveWriteCurrentFileCache(this.folderId,meta);
          if(window.BorionPerf)BorionPerf.endStage('current_file_lookup',{cache:'hit'});
          return meta;
        }
        gdriveForgetCurrentFileCache(this.folderId);
      }catch(e){
        if(e&&e.status===404)gdriveForgetCurrentFileCache(this.folderId);
        else throw e;
      }
    }
    if(window.BorionPerf)BorionPerf.count('currentFileCacheMisses',1);
    const first=await GoogleDriveFS.findChild(this.folderId,'current.json');
    if(!first){if(window.BorionPerf)BorionPerf.endStage('current_file_lookup',{cache:'miss',empty:true});return null;}
    const files=(first.__borionMatches&&Array.isArray(first.__borionMatches))?first.__borionMatches:[first];
    const sorted=files.slice().sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id)));
    const canonical=sorted[0];
    if(sorted.length>1){
      console.warn('[BORION][DRIVE] múltiplos current.json detectados; seleção determinística preservou todos.',sorted.map(x=>({id:x.id,createdTime:x.createdTime})));
      if(window.BorionPerf)BorionPerf.event('duplicate_current_json',{count:sorted.length});
    }
    gdriveWriteCurrentFileCache(this.folderId,canonical);
    if(window.BorionPerf)BorionPerf.endStage('current_file_lookup',{cache:'miss',duplicates:Math.max(0,sorted.length-1)});
    return canonical;
  },

  /* Login + (primeira vez) escolher pasta + carregar/ou perguntar o que fazer. Essa
     função já decide sozinha pra qual tela ir (Gate normal ou onboarding de pasta
     vazia) — quem chama connect() não precisa mais renderizar nada depois. */
  async connect(interactive,options={}){
    if(window.BootProgress)BootProgress.setStage('google_identity');
    await GoogleDriveAuth.login(interactive);
    const devicePromise=(async()=>{if(!this._deviceId&&window.BorionDevice640)this._deviceId=await BorionDevice640.getOrCreateDeviceId();if(window.BorionDevice640)BorionDevice640.newSessionId();})();
    if(window.BorionMultiTab640&&!BorionMultiTab640.tabId){
      BorionMultiTab640.init({
        onBecomeLeader:()=>{if(this.dirty||this.hasPersistedPending()||this.hasPersistedConsolidation())this.resumePendingSync('multitab_leader');},
        onPendingFromFollower:()=>{if(this.hasPersistedPending())this.dirty=true;this.resumePendingSync('multitab_follower_notify');},
        onAccountUpdated:meta=>this.applySharedAccountUpdateFromLeader6402(meta)
      });
    }
    const sub=GoogleDriveAuth.user.sub;let folderId=gdriveReadFolderId(sub),justPicked=false,folderMeta=null;
    if(window.BootProgress)BootProgress.setStage('folder');
    if(folderId){
      const validated=await this.getValidatedFolderMeta(folderId);
      if(!validated.exists){gdriveForgetFolderId(sub);gdriveForgetCurrentFileCache(folderId);folderId=null;}
      else folderMeta=validated.meta;
    }
    if(!folderId){
      if(window.BootProgress)BootProgress.setDetail('Aguardando você escolher a pasta compartilhada');
      const folder=await openDriveFolderPicker();
      folderId=folder.id;folderMeta={id:folder.id,name:folder.name||folder.displayName||'Pasta do Borion',mimeType:'application/vnd.google-apps.folder'};
      gdriveWriteFolderId(sub,folderId);justPicked=true;
    }
    await devicePromise;
    this.folderId=folderId;this.folderName=folderMeta&&folderMeta.name||null;
    if(justPicked&&typeof toast==='function')toast('Conectado à pasta \"'+(this.folderName||'')+'\" — confira em Configurações → Nuvem.');
    setStorageMode('google_drive');
    this.autosaveSlotIndex=gdriveReadSlotIndex(this.folderId,'autosave');this.forcesaveSlotIndex=gdriveReadSlotIndex(this.folderId,'forcesave');
    const result=await this.loadFromDrive();
    this.startAutosaveLoop();this.startLivePollLoop();this._refreshPendingQueueCount().catch(()=>{});
    if(window.BorionDriveJournal640&&BorionDriveJournal640.ensureAppliedFolder)setTimeout(()=>BorionDriveJournal640.ensureAppliedFolder(this.folderId).catch(e=>console.warn('[GoogleDriveProvider] organização gradual do journal foi adiada:',e)),0);
    if(window.BackupFS)BackupFS.maybeDailyDriveSnapshot().catch(e=>console.warn('[GoogleDriveProvider] ponto diário imutável falhou (não crítico):',e));
    if(!options.suppressRender){
      if(result&&result.empty)renderGoogleDriveOnboarding();
      else{S.gate={mode:'list',error:''};renderGate();}
    }
    return result;
  },

  /* V6.13.0 — bug real corrigido: essa função tratava QUALQUER erro (rede
     instável, token ainda renovando, limite de taxa da API) como "a pasta foi
     apagada" — e o connect() então esquecia o vínculo salvo e forçava escolher a
     pasta nervamente, o que podia levar a pessoa (sem querer) a conectar numa pasta
     diferente/errada e ver "nenhum dado encontrado" mesmo com o perfil intacto na
     pasta certa. Agora só considera "apagada de verdade" quando a API responde 404 —
     qualquer outro erro propaga (o connect() mostra uma mensagem de falha e tenta de
     novo depois, sem mexer no vínculo salvo). */
  async _folderStillExists(folderId){
    const result=await this.getValidatedFolderMeta(folderId);
    return result.exists;
  },

  /* Só localiza e lê o current.json — não cria nada. Retorna {empty:true} se a pasta
     ainda não tiver backup nenhum, pra quem chamou decidir o que mostrar. */
  async loadFromDrive(){
    const file=await this._resolveCurrentFile();
    if(!file)return {empty:true};
    this.currentFileId=file.id;this.currentFileMeta=file;gdriveWriteCurrentFileCache(this.folderId,file);
    if(window.BootProgress)BootProgress.setStage('current_download');
    if(window.BorionPerf)BorionPerf.startStage('current_download');
    const rawText=await GoogleDriveFS.readFileText(file.id);
    if(window.BorionPerf)BorionPerf.endStage('current_download');
    if(window.BootProgress)BootProgress.setStage('integrity');
    let migrationBackupResult={notRequired:false};
    if(window.BackupFS){
      try{migrationBackupResult=await BackupFS.ensureRawSchemaMigrationBackup({rawText,sourceFileId:file.id});}
      catch(e){
        this.lastSyncError='Migração bloqueada: '+String(e&&e.message||e);this.authRequired=false;
        if(window.BorionSyncState) BorionSyncState.set('RECOVERY',{error:this.lastSyncError});
        this._refreshStatusUI();
        throw e;
      }
    }
    let remoteSnapshot;
    try{remoteSnapshot=JSON.parse(rawText);}catch(e){throw new Error('O current.json desta pasta está truncado ou contém JSON malformado.');}
    const sourceCheck=validateBorionJson(remoteSnapshot);
    if(!sourceCheck.valid) throw new Error('O current.json desta pasta parece corrompido: '+sourceCheck.errors.join(' '));

    // Captura a base local pendente antes de aplicar qualquer snapshot remoto.
    const pendingSince=localStorage.getItem(gdrivePendingKey(this.folderId));
    let localPendingPayload=null;
    if(pendingSince){
      try{localPendingPayload=await buildFullBackupPayload();}
      catch(e){console.warn('[GoogleDriveProvider] não foi possível montar a pendência local no boot:',e);}
    }

    let visibleSnapshot=remoteSnapshot,journalPending=false,journalError=null;
    try{
      if(window.BootProgress)BootProgress.setStage('journal');
      if(window.BorionSyncState) BorionSyncState.set('MERGING',{source:'boot'});
      const result=await BorionDriveJournal640.consolidate(this.folderId,remoteSnapshot);
      const migrationRequired=!(migrationBackupResult&&migrationBackupResult.notRequired);
      if(result.newlyApplied.length||migrationRequired){
        // A migração ocorre integralmente em memória, depois do backup bruto e antes
        // de qualquer PATCH. Mesmo sem operação nova, o schema 6401 é persistido uma
        // única vez; assim a base não é remigrada a cada inicialização.
        visibleSnapshot=await buildMigratedSnapshot6401(result.consolidated);
        const precheck=await BorionDriveJournal640.validateSnapshot(visibleSnapshot);
        if(!precheck.valid) throw new Error('Snapshot consolidado/migrado falhou na validação antes da gravação: '+precheck.reason);
        const updated=await GoogleDriveFS.updateFile(this.currentFileId,visibleSnapshot);
        const confirmed=await GoogleDriveFS.readFile(this.currentFileId);
        const requiredId=result.newlyApplied.length?result.newlyApplied[result.newlyApplied.length-1].operationId:undefined;
        const confirmCheck=await BorionDriveJournal640.validateSnapshot(confirmed,requiredId);
        if(!confirmCheck.valid) throw new Error('Snapshot gravado não confirmou a migração/operação: '+confirmCheck.reason);
        visibleSnapshot=confirmed;this.currentFileMeta=updated;gdriveWriteCurrentFileCache(this.folderId,updated);
        if(result.newlyApplied.length)BorionDriveJournal640.archiveConfirmedOperations(this.folderId,confirmed,result.newlyApplied).catch(e=>console.warn('[GoogleDriveProvider] arquivamento pós-boot adiado:',e));
      }else visibleSnapshot=remoteSnapshot;
      this._lastConsolidatedPayload=visibleSnapshot;
      this._surfaceMergeConflicts(visibleSnapshot);
      const bootRequiredOperationId=this._readPersistedConsolidationOperationId();
      const bootValidation=await BorionDriveJournal640.validateSnapshot(visibleSnapshot,bootRequiredOperationId||undefined);
      if(!bootValidation.valid) throw new Error('O journal foi lido, mas a operação protegida ainda não apareceu no snapshot: '+bootValidation.reason);
      this._clearConsolidationPending();
      if(window.BorionSyncState) BorionSyncState.set('SNAPSHOT_CONFIRMED');
    }catch(e){
      journalPending=true;journalError=e;
      visibleSnapshot=remoteSnapshot;
      this._persistConsolidationPending(this._readPersistedConsolidationOperationId());
      this.lastSyncError='Existem operações no journal aguardando recuperação: '+String(e&&e.message||e);
      if(window.BorionSyncState) BorionSyncState.set('JOURNAL_ERROR',{error:this.lastSyncError});
      console.warn('[GoogleDriveProvider] journal não pôde ser consolidado no boot; último snapshot válido carregado:',e);
    }

    if(localPendingPayload){
      visibleSnapshot=BorionSyncCore.mergeAccountPayload(remoteSnapshot,localPendingPayload,visibleSnapshot);
      this.dirty=true;
      try{localStorage.setItem(gdrivePendingKey(this.folderId),String(Date.now()));}catch(e){}
    }
    if(window.BootProgress)BootProgress.setStage('apply');
    if(window.BorionPerf)BorionPerf.startStage('account_apply');
    try{applyAccountPayloadSilently(visibleSnapshot);if(window.BorionPerf)BorionPerf.endStage('account_apply');}
    catch(e){
      this.lastSyncError='Aplicação/migração local bloqueada: '+String(e&&e.message||e);
      if(window.BorionSyncState)BorionSyncState.set('RECOVERY',{error:this.lastSyncError,code:e&&e.code});
      this._refreshStatusUI();
      throw e;
    }
    this.lastKnownProfileCount=(visibleSnapshot.profiles||[]).length;
    this._operationBasePayload=this._lastConsolidatedPayload?JSON.parse(JSON.stringify(this._lastConsolidatedPayload)):JSON.parse(JSON.stringify(remoteSnapshot));
    if(window.BorionDataGuard){
      const counts=BorionDataGuard.countAccountRecords(visibleSnapshot);this._lastGoodCounts=counts;BorionDataGuard.writeLastGoodCounts(this.folderId,counts);
    }
    if(localPendingPayload){
      if(!window.BorionMultiTab640||BorionMultiTab640.isLeader()) await this.syncNow({source:'boot_pending',payloadOverride:visibleSnapshot});
      else BorionMultiTab640.requestSync({folderId:this.folderId,source:'boot_pending'});
    }else if(!journalPending){
      this.lastSyncAt=Date.now();this.lastSyncError='';this.authRequired=false;this.dirty=false;
    }
    this._refreshStatusUI();
    return {empty:false,pending:this.dirty||journalPending,journalError:journalError?String(journalError.message||journalError):null};
  },

  /* Cria o current.json inicial vazio (escolha "Começar do zero" no onboarding). */
  async createEmptyCurrentFile(){
    const empty = {
      type: 'borion-account-backup', backupSchema: 5352, app: 'Borion Finance',
      appVersion: BORION_APP_VERSION, backupType: 'initial',
      reason: 'primeira conexão com o Google Drive', source: 'google_drive',
      exportedAt: new Date().toISOString(),
      account: { userId: GoogleDriveAuth.user.sub, email: GoogleDriveAuth.user.email },
      config: {}, profileCount: 0, profiles: [], dataByProfile: {}
    };
    const created = await GoogleDriveFS.createFile(this.folderId, 'current.json', empty);
    this.currentFileId = created.id;gdriveWriteCurrentFileCache(this.folderId,created); this.currentFileMeta = created;
    this.lastKnownProfileCount = 0;
    S.profiles = []; setProfiles([]); S.currentProfile = null; S.data = null;
  },

  /* Recarrega o current.json mais recente do Drive, descartando qualquer alteração
     local ainda não sincronizada — usado depois de um conflito detectado. */
  async reload(){
    this.dirty = false; this.conflict = false; this.lastSyncError=''; this.authRequired=false;
    clearTimeout(this.syncTimer);
    this._clearRetry();
    try{ if(this.folderId) localStorage.removeItem(gdrivePendingKey(this.folderId)); }catch(e){}
    this._clearConsolidationPending();
    if(S && S.currentProfile && typeof clearExitSavePending==='function') clearExitSavePending(S.currentProfile.id);
    const result = await this.loadFromDrive();
    if(result && result.empty){ renderGoogleDriveOnboarding(); }
    else { S.gate = { mode: 'list', error: '' }; renderGate(); }
  },

  /* Chamado de dentro de saveCurrentData() (mesmo gancho que o Supabase usa) — só
     marca como pendente e agenda 1200ms antes de mandar pro Drive, pra não fazer uma
     chamada de rede a cada tecla digitada. Passa a 1200ms (V6.38.1) — a
     V6.40 não muda esse tempo, só o que acontece quando o timer dispara (ver
     syncNow abaixo): em vez de "ler modifiedTime e sobrescrever", agora grava
     uma operação imutável e consolida com merge de três vias. */
  queueSave(){
    if(!this.isConnected()) return;
    // V6.40 — captura a "base" desta leva de alterações (o último snapshot
    // consolidado conhecido) na TRANSIÇÃO de limpo->sujo, não a cada tecla —
    // é o que permite ao merge de três vias (01e) saber o que realmente mudou
    // neste dispositivo desde a última sincronização, mesmo que a operação só
    // seja de fato enviada bem depois (rede lenta, várias edições seguidas).
    if(!this.dirty && !this._operationBasePayload && this._lastConsolidatedPayload){
      try{ this._operationBasePayload = JSON.parse(JSON.stringify(this._lastConsolidatedPayload)); }catch(e){ this._operationBasePayload = null; }
    }
    this.dirty = true;
    this._pendingQueueCount=Math.max(1,this._pendingQueueCount||0);
    this.autosaveDirtySinceLast = true;
    this._autosaveRevision++;
    this._syncRevision++;
    this.lastSyncError='';
    this.authRequired=false;
    if(window.BorionSyncState) BorionSyncState.set(navigator.onLine ? 'QUEUED' : 'OFFLINE_PENDING');
    this._refreshStatusUI();
    // V6.16.0 — grava um marcador PERSISTENTE (sobrevive a reload/fechar aba) de que
    // existe uma alteração ainda não confirmada no Drive. Ver loadFromDrive(): se esse
    // marcador ainda estiver presente na próxima conexão, o dado local é tratado como
    // o mais recente, em vez de deixar a leitura do Drive (possivelmente desatualizada)
    // sobrescrever uma alteração que nunca chegou a ser enviada.
    try{ localStorage.setItem(gdrivePendingKey(this.folderId), String(Date.now())); }catch(e){}
    // V6.40 — fila durável no IndexedDB (item 9 do pedido): a pendência só é
    // removida dali depois de confirmação remota real (ver confirmRemote em
    // syncNow), nunca antes — mesmo que a aba feche entre este ponto e o envio.
    if(window.BorionDurableQueue && window.BorionDevice640){
      if(!this._queueOperationId) this._queueOperationId = BorionSyncCore.uuid640();
      BorionDurableQueue.enqueue({
        id: this._queueOperationId, operationId: this._queueOperationId,
        deviceId: this._deviceId||null, sessionId: BorionDevice640.sessionId(),
        profileId: (S.currentProfile&&S.currentProfile.id)||null,
        schemaVersion: BorionSyncCore.BORION_DATA_SCHEMA_VERSION
      }).catch(e=>console.warn('[GoogleDriveProvider] falha ao gravar fila durável (não bloqueia o salvamento local):', e));
    }
    const _leader=!window.BorionMultiTab640||BorionMultiTab640.isLeader();
    if(!_leader){ BorionMultiTab640.requestSync({folderId:this.folderId,operationId:this._queueOperationId}); clearTimeout(this.syncTimer); }
    else { clearTimeout(this.syncTimer); this.syncTimer=setTimeout(()=>this.syncNow({source:'queue'}),1200); }
    this.scheduleAutosaveSoon();
  },

  /* V6.10.0 — rede de segurança extra, além do current.json (que salva após debounce
     depois de qualquer mudança): a cada GOOGLE_DRIVE_AUTOSAVE_INTERVAL_MS, se algo
     mudou desde o último autosave, grava um snapshot completo num rodízio de slots
     fixos (autosave-1 → autosave-2 → ... → autosave-20 → autosave-1 de novo — V6.20.0:
     eram só 3 slots a cada 90s, agora são 20 a cada 1 minuto). Não cria arquivo novo a
     cada vez — só revezam os mesmos slots, então não acumula. Protege contra
     current.json corrompido, conflito mal resolvido, ou qualquer coisa que dê errado
     bem no meio de uma sessão longa de lançamentos. */
  startAutosaveLoop(){
    this.stopAutosaveLoop();
    this.autosaveTimer = setInterval(()=>{ this.runAutosaveTick(); }, GOOGLE_DRIVE_AUTOSAVE_INTERVAL_MS);
    if(this.autosaveDirtySinceLast) this.scheduleAutosaveSoon();
  },

  scheduleAutosaveSoon(delayOverride){
    if(!this.isConnected() || !this.autosaveDirtySinceLast) return;
    clearTimeout(this.autosaveKickTimer);
    const elapsed = this.lastAutosaveAt ? (Date.now() - this.lastAutosaveAt) : GOOGLE_DRIVE_AUTOSAVE_INTERVAL_MS;
    const delay = Number.isFinite(delayOverride)
      ? Math.max(GOOGLE_DRIVE_AUTOSAVE_IDLE_KICK_MS, delayOverride)
      : Math.max(GOOGLE_DRIVE_AUTOSAVE_IDLE_KICK_MS, GOOGLE_DRIVE_AUTOSAVE_INTERVAL_MS - elapsed);
    this.autosaveKickTimer = setTimeout(()=>{ this.autosaveKickTimer=null; this.runAutosaveTick(); }, delay);
  },

  stopAutosaveLoop(){
    if(this.autosaveTimer){ clearInterval(this.autosaveTimer); this.autosaveTimer = null; }
    if(this.autosaveKickTimer){ clearTimeout(this.autosaveKickTimer); this.autosaveKickTimer = null; }
  },

  /* V6.38.0 — "atualização ao vivo": confere a cada poucos segundos se outro
     dispositivo salvou algo novo, e se sim atualiza a tela sozinho, sem precisar
     sair do app e entrar de novo. Ver checkForRemoteUpdate() para os detalhes e
     as travas de segurança (nunca roda por cima de uma alteração local pendente,
     nunca interrompe quem está digitando). */
  applySharedAccountUpdateFromLeader6402(meta={}){
    try{
      const profiles=typeof getProfiles==='function'?getProfiles():(S.profiles||[]);
      const activeId=S.currentProfile&&S.currentProfile.id!=null?String(S.currentProfile.id):null;
      S.profiles=profiles;
      if(activeId&&!profiles.some(p=>p&&String(p.id)===activeId)){
        return handleRemovedActiveProfile6402({profileRemoved:true},'multitab_leader');
      }
      if(activeId){
        const fresh=profiles.find(p=>p&&String(p.id)===activeId);
        const freshData=typeof getProfileData==='function'?getProfileData(activeId):null;
        if(fresh)S.currentProfile=fresh;
        if(freshData)S.data=freshData;
        if(typeof renderView==='function'&&S.data)renderView();
      }else if(typeof document!=='undefined'&&document.querySelector&&document.querySelector('.gate-wrap')&&typeof renderGate==='function'){
        renderGate();
      }
      return true;
    }catch(e){console.warn('[GoogleDriveProvider] aba secundária não aplicou atualização compartilhada:',e);return false;}
  },

  _notifyAccountSnapshotApplied6402(result,source){
    if(window.BorionMultiTab640&&BorionMultiTab640.isLeader&&BorionMultiTab640.isLeader()){
      BorionMultiTab640.notifyAccountUpdated({source:source||'snapshot',profileRemoved:!!(result&&result.profileRemoved)});
    }
  },

  boostLivePolling(durationMs=GOOGLE_DRIVE_LIVE_ACTIVE_WINDOW_MS){
    this._liveActiveUntil=Math.max(this._liveActiveUntil,Date.now()+Math.max(5000,Number(durationMs)||GOOGLE_DRIVE_LIVE_ACTIVE_WINDOW_MS));
    if(this.liveTimer){clearTimeout(this.liveTimer);this.liveTimer=null;}
    this._scheduleNextLivePoll(0);
  },

  _nextLivePollDelay(){
    if(typeof document!=='undefined'&&document.hidden)return GOOGLE_DRIVE_LIVE_POLL_IDLE_MS;
    if(Date.now()<this._liveActiveUntil||this.hasPersistedConsolidation()||this.dirty)return GOOGLE_DRIVE_LIVE_POLL_ACTIVE_MS;
    if(Date.now()-this._lastUserActivityAt>2*60*1000)return GOOGLE_DRIVE_LIVE_POLL_IDLE_MS;
    return GOOGLE_DRIVE_LIVE_POLL_NORMAL_MS;
  },

  _scheduleNextLivePoll(delay){
    if(!this.isConnected()||typeof setTimeout!=='function')return;
    if(this.liveTimer)clearTimeout(this.liveTimer);
    this.liveTimer=setTimeout(()=>{this.liveTimer=null;this.checkForRemoteUpdate();},Number.isFinite(delay)?Math.max(0,delay):this._nextLivePollDelay());
  },

  startLivePollLoop(){
    this.stopLivePollLoop();this._livePollStartedAt=Date.now();this._liveActiveUntil=Date.now()+GOOGLE_DRIVE_LIVE_ACTIVE_WINDOW_MS;
    if(window.RemoteUpdateQueue){RemoteUpdateQueue.setApplyHandler((snapshot,meta)=>this._applyRemoteSnapshot642(snapshot,meta,'queued_remote'));RemoteUpdateQueue.setCanApplyHandler(()=>!this.dirty&&!this._syncInFlight&&!this._autosaveInFlight&&!this.hasPersistedPending()&&!this.hasPersistedConsolidation());}
    if(!this._livePollBound&&typeof document!=='undefined'){
      this._livePollBound=true;
      const activity=()=>{this._lastUserActivityAt=Date.now();};
      ['pointerdown','keydown','touchstart'].forEach(type=>document.addEventListener(type,activity,{passive:true}));
      document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){this._lastUserActivityAt=Date.now();this.boostLivePolling();}});
      window.addEventListener('online',()=>this.boostLivePolling());
    }
    this._scheduleNextLivePoll(0);
  },
  stopLivePollLoop(){if(this.liveTimer){clearTimeout(this.liveTimer);this.liveTimer=null;}},

  async _applyRemoteSnapshot642(data,freshMeta,source='live_remote'){
    const result=applyAccountPayloadForLiveUpdate(data);
    this.currentFileMeta=freshMeta||this.currentFileMeta;gdriveWriteCurrentFileCache(this.folderId,this.currentFileMeta);
    this.lastKnownProfileCount=(data.profiles||[]).length;this._lastConsolidatedPayload=data;this._operationBasePayload=null;
    if(window.BorionDataGuard){const counts=BorionDataGuard.countAccountRecords(data);this._lastGoodCounts=counts;BorionDataGuard.writeLastGoodCounts(this.folderId,counts);}
    this._notifyAccountSnapshotApplied6402(result,source);
    if(handleRemovedActiveProfile6402(result,source))return true;
    // V6.44.3 — mesma proteção de js/24-interconnections.js: uma atualização vinda
    // de outro dispositivo não pode repintar a tela por cima de uma edição não
    // salva na aba Integrações (por exemplo, vínculos de categorias e destinos). Os dados já
    // foram aplicados acima; só a repintura fica pendente até a pessoa sair da tela.
    const editingIntegrationSettings=typeof S!=='undefined'&&S.view==='settings'&&S.settingsTab==='integrations';
    if(S.currentProfile&&S.data){if(!editingIntegrationSettings){if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>renderView());else renderView();}if(typeof toast==='function')toast('Atualizado agora com uma alteração feita em outro dispositivo.');}
    else if(document.querySelector('.gate-wrap')&&(!S.gate||S.gate.mode==='list'))renderGate();
    this.lastSyncAt=Date.now();this.lastSyncError='';this.authRequired=false;
    if(window.BorionSyncState)BorionSyncState.set('SNAPSHOT_CONFIRMED',{source});
    this._refreshStatusUI();this.boostLivePolling(15000);return true;
  },

  async checkForRemoteUpdate(){
    if(window.BorionMultiTab640&&!BorionMultiTab640.isLeader()){this._scheduleNextLivePoll();return false;}
    if(window.RemoteUpdateQueue&&RemoteUpdateQueue.hasPending()){
      const applied=await RemoteUpdateQueue.applyIfSafe();
      this._scheduleNextLivePoll(applied?GOOGLE_DRIVE_LIVE_POLL_ACTIVE_MS:this._nextLivePollDelay());
      return applied;
    }
    if(this.hasPersistedConsolidation()){const ok=await this.syncNow({source:'live_journal',consolidationOnly:true});this._scheduleNextLivePoll();return ok;}
    if(!this.isConnected()||!this.currentFileId){return false;}
    if(this.dirty||this.conflict||this._liveCheckInFlight||this._syncInFlight||this._autosaveInFlight){this._scheduleNextLivePoll();return false;}
    if(typeof document!=='undefined'&&document.hidden){this._scheduleNextLivePoll();return false;}
    this._liveCheckInFlight=true;
    try{
      const freshMeta=await GoogleDriveFS.getFileMeta(this.currentFileId);
      if(!this.currentFileMeta||!this.currentFileMeta.modifiedTime||!freshMeta.modifiedTime)return false;
      if(freshMeta.modifiedTime===this.currentFileMeta.modifiedTime){if(this.lastSyncError&&!this.dirty){this.lastSyncError='';this.authRequired=false;this._refreshStatusUI();}return false;}
      if(window.BorionSyncState)BorionSyncState.set('REMOTE_CHANGED',{detectedAt:Date.now()});
      if(window.BorionPerf){BorionPerf.count('remoteUpdatesDetected',1);BorionPerf.event('remote_update_detected',{pollMode:this._liveMode||'adaptive'});}
      const data=await GoogleDriveFS.readFile(this.currentFileId);
      const check=validateBorionJson(data);if(!check.valid){console.warn('[GoogleDriveProvider] atualização remota rejeitada pela validação.');return false;}
      if(window.BorionDriveJournal640){const integrity=await BorionDriveJournal640.validateSnapshot(data);if(!integrity.valid){console.warn('[GoogleDriveProvider] atualização remota rejeitada pelo checksum:',integrity.reason);return false;}}
      if(!borionLiveUpdateSafeToApplyNow()){
        if(window.RemoteUpdateQueue)RemoteUpdateQueue.enqueue(data,freshMeta);
        this._refreshStatusUI();return false;
      }
      const applied=await this._applyRemoteSnapshot642(data,freshMeta,'live_remote');
      if(applied&&window.BorionPerf)BorionPerf.count('remoteUpdatesApplied',1);
      return applied;
    }catch(e){
      console.warn('[GoogleDriveProvider] checagem de atualização ao vivo falhou (tentativa adaptativa continuará):',e);
      this.lastSyncError=String((e&&e.message)||e||'Falha ao consultar o Google Drive.');this.authRequired=this._isAuthError(e);this._refreshStatusUI();return false;
    }finally{
      this._liveCheckInFlight=false;this._scheduleNextLivePoll();
    }
  },

  /* V6.20.0 — lógica de rodízio compartilhada entre o autosave automático
     ('autosave', 20 slots) e o rodízio de Ctrl+S ('forcesave', 40 slots) — mesma regra
     nos dois: descobre o próximo slot a partir do índice PERSISTIDO desta pasta (nunca
     mais reseta pro slot 1 sozinho por causa de um reload no meio do caminho — ver
     gdriveReadSlotIndex/gdriveWriteSlotIndex), grava o payload nele e avança o índice. */
  async writeRotatingSnapshot(kind, totalSlots, payload){
    const folderId = await this.ensureBackupsFolder();
    const indexProp = kind + 'SlotIndex';
    const slot = (this[indexProp] % totalSlots) + 1;
    const name = kind + '-' + slot + '.json';
    // V6.12.0 — mesma correção da pasta de backups: guarda o ID real do arquivo deste
    // slot assim que descoberto, pra nunca mais precisar buscar por nome de novo (a
    // busca por nome tem consistência eventual + risco de corrida entre abas/sessões,
    // o que gerava arquivo duplicado).
    let fileId = gdriveReadAutosaveFileId(folderId, kind, slot);
    if(fileId && !(await this._folderStillExists(fileId))) fileId = null;
    if(fileId){
      await GoogleDriveFS.updateFile(fileId, payload);
    } else {
      const existing = (await this.findBackupFilesByName(name))[0]||null;
      if(existing){ fileId = existing.id; await GoogleDriveFS.updateFile(fileId, payload); }
      else { fileId = (await GoogleDriveFS.createFile(folderId, name, payload)).id; }
      gdriveWriteAutosaveFileId(folderId, kind, slot, fileId);
    }
    this[indexProp]++;
    gdriveWriteSlotIndex(folderId, kind, this[indexProp]);
  },

  async runAutosaveTick(){
    if(!this.isConnected() || !this.autosaveDirtySinceLast) return false;
    if(this._autosaveInFlight) return false;
    this._autosaveInFlight = true;
    const revision = this._autosaveRevision;
    try{
      /* V6.23.4 — corrigido o erro que referenciava `options` e `reason` inexistentes.
         O snapshot agora é construído explicitamente e também pode rodar com a aba em
         segundo plano, evitando que Alt+Tab impeça o arquivo autosave-N.json de nascer. */
      const payload = await buildSharedBackupSnapshot('auto', 'autosave automático do Google Drive');
      // Sempre cria também um ponto de recuperação neste dispositivo. Assim, mesmo
      // que o token do Google expire ou a rede caia, o autosave do minuto não some.
      if(window.storageProvider && typeof storageProvider.createBackup==='function'){
        try{ await storageProvider.createBackup('auto', {payload}); }
        catch(localError){ console.warn('[GoogleDriveProvider] autosave local extra falhou (não crítico):', localError); }
      }
      if(this.dirty && !this._syncInFlight) await this.syncNow({source:'autosave'});
      await this.writeRotatingSnapshot('autosave', GOOGLE_DRIVE_AUTOSAVE_SLOTS, payload);
      this.lastAutosaveAt = Date.now();
      if(revision===this._autosaveRevision) this.autosaveDirtySinceLast = false;
      return true;
    }catch(e){
      console.warn('[GoogleDriveProvider] autosave rotativo falhou (será tentado novamente):', e);
      this.scheduleAutosaveSoon(GOOGLE_DRIVE_AUTOSAVE_RETRY_MS);
      return false;
    }finally{
      this._autosaveInFlight = false;
      if(this.autosaveDirtySinceLast && !this.autosaveKickTimer) this.scheduleAutosaveSoon();
    }
  },

  /* V6.40 — reescrito para eliminar a corrida "last writer wins" descrita no
     pedido: em vez de conferir modifiedTime e sobrescrever current.json
     diretamente, grava uma OPERAÇÃO IMUTÁVEL (arquivo novo, nome único — o
     Drive garante que isso nunca colide) e consolida via merge de três vias
     (js/01e + js/01g). Se a consolidação perder uma corrida contra outro
     dispositivo consolidando ao mesmo tempo, nada se perde: a operação deste
     dispositivo continua existindo como arquivo e entra na próxima
     consolidação (deste ou de qualquer outro dispositivo). */
  async _writeCurrentSafely(candidate,requiredOperationId){
    const currentBefore=await GoogleDriveFS.readFile(this.currentFileId);
    const beforeCheck=await BorionDriveJournal640.validateSnapshot(currentBefore);
    if(!beforeCheck.valid&&!(beforeCheck.reason==='checksum_ausente'&&validateBorionJson(currentBefore).valid))throw new Error('O current.json atual é inválido; substituição bloqueada: '+beforeCheck.reason);
    const backupName='current.previous.json',tempName='current.pending-validation.json';
    let backupFile=await GoogleDriveFS.findChild(this.folderId,backupName,'application/json');
    if(backupFile)await GoogleDriveFS.updateFile(backupFile.id,currentBefore);else backupFile=await GoogleDriveFS.createFile(this.folderId,backupName,currentBefore);
    const backupRead=await GoogleDriveFS.readFile(backupFile.id),backupCheck=await BorionDriveJournal640.validateSnapshot(backupRead);
    if(!backupCheck.valid&&!(backupCheck.reason==='checksum_ausente'&&validateBorionJson(backupRead).valid))throw new Error('Backup anterior do current.json não foi validado; gravação cancelada.');
    let tempFile=await GoogleDriveFS.findChild(this.folderId,tempName,'application/json');
    if(tempFile)await GoogleDriveFS.updateFile(tempFile.id,candidate);else tempFile=await GoogleDriveFS.createFile(this.folderId,tempName,candidate);
    const tempRead=await GoogleDriveFS.readFile(tempFile.id),tempCheck=await BorionDriveJournal640.validateSnapshot(tempRead,requiredOperationId||undefined);
    if(!tempCheck.valid)throw new Error('Arquivo temporário do current.json é inválido: '+tempCheck.reason);
    const updated=await GoogleDriveFS.updateFile(this.currentFileId,tempRead);
    const confirmed=await GoogleDriveFS.readFile(this.currentFileId),confirmedCheck=await BorionDriveJournal640.validateSnapshot(confirmed,requiredOperationId||undefined);
    if(!confirmedCheck.valid)throw new Error('O current.json relido não confirmou a gravação: '+confirmedCheck.reason);
    try{await GoogleDriveFS.trashFile(tempFile.id);}catch(_e){}
    return {updated,confirmed,confirmedCheck,backupFile};
  },
  _scheduleAppliedMaintenance(snapshot){
    const key='borion_journal_maintenance_'+String(this.folderId||''),last=Number(localStorage.getItem(key)||0);if(Date.now()-last<24*60*60*1000)return;
    localStorage.setItem(key,String(Date.now()));
    BorionDriveJournal640.cleanupAppliedOperations(this.folderId,snapshot,{backupValidated:true,deviceGraceSatisfied:true,retentionMs:7*24*60*60*1000,maxKeep:200}).then(result=>{if(result&&result.errors&&result.errors.length)console.warn('[GoogleDriveProvider] manutenção parcial:',result);}).catch(error=>console.warn('[GoogleDriveProvider] manutenção de operações adiada:',error));
  },

  async syncNow(options={}){
    if(!this.isConnected()||!this.currentFileId)return false;
    this._lastSyncStartedAt=Date.now();
    if(window.BorionPerf)BorionPerf.startStage('sync_total',{source:options.source||'unknown'});
    if(window.BorionMultiTab640&&!BorionMultiTab640.isLeader()){
      BorionMultiTab640.requestSync({folderId:this.folderId,source:options.source||'syncNow'});
      return {delegated:true,synced:false};
    }
    if(this.hasPersistedPending()) this.dirty=true;
    if(!this.dirty&&this.hasPersistedConsolidation()) options.consolidationOnly=true;
    if(!this.dirty&&!options.payloadOverride&&!options.consolidationOnly){this._recordSyncSuccess();if(window.BorionSyncState)BorionSyncState.set('SNAPSHOT_CONFIRMED');return true;}
    if(this._syncInFlight){this._syncAgain=true;return false;}
    if(!navigator.onLine){this._recordSyncFailure(new Error('Sem internet. Alteração salva somente neste dispositivo.'),{silent:true});if(window.BorionSyncState)BorionSyncState.set('OFFLINE_PENDING');return false;}
    this._syncInFlight=true;
    if(options.consolidationOnly){
      const requiredOperationId=this._readPersistedConsolidationOperationId();
      try{
        if(window.BorionDurableQueue&&requiredOperationId)await BorionDurableQueue.setState(requiredOperationId,'MERGING').catch(()=>{});
        if(window.BorionSyncState)BorionSyncState.set('MERGING',{operationId:requiredOperationId,source:options.source||'retry'});
        const remoteRaw=await GoogleDriveFS.readFile(this.currentFileId);
        const remoteCheck=validateBorionJson(remoteRaw);if(!remoteCheck.valid)throw new Error('Snapshot remoto inválido: '+remoteCheck.errors.join(' '));
        const result=await BorionDriveJournal640.consolidate(this.folderId,remoteRaw);
        const candidate=await buildMigratedSnapshot6401(result.consolidated);
        const precheck=await BorionDriveJournal640.validateSnapshot(candidate,requiredOperationId||undefined);
        if(!precheck.valid)throw new Error('Consolidação pendente não foi confirmada: '+precheck.reason);
        // Entrou neste ramo porque existe um marcador durável de consolidação/reparo.
        // Portanto grava e relê mesmo quando a operação já constava como aplicada ou
        // quando a pendência era apenas persistir a migração 6401.
        if(window.BorionDurableQueue&&requiredOperationId)await BorionDurableQueue.setState(requiredOperationId,'SNAPSHOT_WRITING').catch(()=>{});
        const safeWrite=await this._writeCurrentSafely(candidate,requiredOperationId||undefined);
        const updated=safeWrite.updated,confirmed=safeWrite.confirmed,confirmedCheck=safeWrite.confirmedCheck;
        this.currentFileMeta=updated||this.currentFileMeta;gdriveWriteCurrentFileCache(this.folderId,this.currentFileMeta);this._lastConsolidatedPayload=confirmed;this._operationBasePayload=JSON.parse(JSON.stringify(confirmed));
        if(window.BorionDurableQueue&&requiredOperationId)await BorionDurableQueue.markSnapshotConfirmed(requiredOperationId).catch(()=>{});
        BorionDriveJournal640.archiveConfirmedOperations(this.folderId,confirmed,result.newlyApplied||[]).then(()=>this._scheduleAppliedMaintenance(confirmed)).catch(e=>console.warn('[GoogleDriveProvider] arquivamento de operação será retomado:',e));
        this._surfaceMergeConflicts(confirmed);try{const applied=applyAccountPayloadForLiveUpdate(confirmed);this._notifyAccountSnapshotApplied6402(applied,'consolidation_retry');handleRemovedActiveProfile6402(applied,'consolidation_retry');}catch(e){console.warn('[GoogleDriveProvider] consolidação confirmada; atualização visual adiada:',e);}
        this._clearConsolidationPending();this.lastSyncError='';this._recordSyncSuccess();
        if(window.BorionSyncState)BorionSyncState.set('SNAPSHOT_CONFIRMED',{operationId:requiredOperationId,checksum:confirmedCheck.checksum});
        return true;
      }catch(e){
        this.lastSyncError='Alteração protegida no Drive, mas ainda não consolidada: '+String(e&&e.message||e);
        this.authRequired=this._isAuthError(e);this._persistConsolidationPending(requiredOperationId);this._scheduleRetry();
        if(window.BorionSyncState)BorionSyncState.set('DRIVE_PROTECTED',{operationId:requiredOperationId,error:this.lastSyncError});
        return false;
      }finally{
        this._syncInFlight=false;this._refreshStatusUI();
      }
    }
    if(window.BorionSyncState)BorionSyncState.set('PROTECTING_DRIVE');
    this._refreshStatusUI();
    const revision=this._syncRevision;
    let operationProtected=false,operationId=null;
    try{
      const payload=options.payloadOverride||await buildFullBackupPayload();
      const nextCounts=window.BorionDataGuard?BorionDataGuard.countAccountRecords(payload):null;
      const baseline=window.BorionDataGuard?(this._lastGoodCounts||BorionDataGuard.readLastGoodCounts(this.folderId)):null;
      const check=(nextCounts&&baseline)?BorionDataGuard.detectSuspiciousAccountDrop(nextCounts,baseline):{suspicious:false,reasons:[]};
      if(check.suspicious&&!options.acknowledgeSuspicious){
        const reasonText=BorionDataGuard.describeSuspiciousAccountReasons(check.reasons);this.blockedSuspicious=reasonText;this.lastSyncError='Salvamento bloqueado por segurança: '+reasonText;this.dirty=true;
        if(window.BorionSyncState)BorionSyncState.set('BLOCKED_SUSPICIOUS',{reason:reasonText});this._refreshStatusUI();return false;
      }
      this.blockedSuspicious=null;
      operationId=this._queueOperationId||BorionSyncCore.uuid640();this._queueOperationId=operationId;
      if(window.BorionDurableQueue)await BorionDurableQueue.enqueue({id:operationId,operationId,deviceId:this._deviceId||null,sessionId:window.BorionDevice640?BorionDevice640.sessionId():null,profileId:(S.currentProfile&&S.currentProfile.id)||null,schemaVersion:BorionSyncCore.BORION_DATA_SCHEMA_VERSION}).catch(()=>{});
      const deltaBase=this._operationBasePayload||this._lastConsolidatedPayload||null;
      const delta=BorionSyncCore.createAccountDelta(deltaBase,payload);
      if(!BorionSyncCore.accountDeltaHasChanges(delta)){
        this.dirty=false;this._syncAgain=false;this._queueOperationId=null;
        try{localStorage.removeItem(gdrivePendingKey(this.folderId));}catch(_e){}
        this.lastSyncError='';this._recordSyncSuccess();
        if(window.BorionSyncState)BorionSyncState.set('SNAPSHOT_CONFIRMED',{unchanged:true});
        return true;
      }
      const operation={
        operationId,deviceId:this._deviceId||null,sessionId:window.BorionDevice640?BorionDevice640.sessionId():null,
        profileId:(S.currentProfile&&S.currentProfile.id)||null,createdAt:new Date().toISOString(),
        schemaVersion:BorionSyncCore.BORION_DATA_SCHEMA_VERSION,format:'account-delta-v2',delta,
        checksum:await BorionSyncCore.checksumOf(delta),forced:!!options.force
      };
      const operationFile=await BorionDriveJournal640.writeOperation(this.folderId,operation);
      operationProtected=true;
      this._persistConsolidationPending(operationId);
      if(window.BorionDurableQueue)await BorionDurableQueue.confirmRemote(operationId,operationFile&&operationFile.id).catch(()=>{});
      if(window.BorionSyncState)BorionSyncState.set('DRIVE_PROTECTED',{operationId});
      this.lastSyncError='Alteração protegida no Drive; aguardando consolidação do snapshot.';
      this._refreshStatusUI();

      if(window.BorionDurableQueue)await BorionDurableQueue.setState(operationId,'MERGING').catch(()=>{});
      if(window.BorionSyncState)BorionSyncState.set('MERGING',{operationId});
      const remoteRaw=await GoogleDriveFS.readFile(this.currentFileId);
      const remoteCheck=validateBorionJson(remoteRaw);if(!remoteCheck.valid)throw new Error('Snapshot remoto inválido: '+remoteCheck.errors.join(' '));
      const result=await BorionDriveJournal640.consolidate(this.folderId,remoteRaw);
      const precheck=await BorionDriveJournal640.validateSnapshot(result.consolidated,operationId);
      if(!precheck.valid)throw new Error('Consolidação não incorporou a operação '+operationId+': '+precheck.reason);
      if(window.BorionDurableQueue)await BorionDurableQueue.setState(operationId,'SNAPSHOT_WRITING').catch(()=>{});
      const safeWrite=await this._writeCurrentSafely(result.consolidated,operationId);
      const updated=safeWrite.updated,confirmed=safeWrite.confirmed,confirmedCheck=safeWrite.confirmedCheck;

      this.currentFileMeta=updated;gdriveWriteCurrentFileCache(this.folderId,updated);this._lastConsolidatedPayload=confirmed;this._operationBasePayload=JSON.parse(JSON.stringify(confirmed));
      if(window.BorionDurableQueue)await BorionDurableQueue.markSnapshotConfirmed(operationId).catch(()=>{});
      BorionDriveJournal640.archiveConfirmedOperations(this.folderId,confirmed,result.newlyApplied||[]).then(()=>this._scheduleAppliedMaintenance(confirmed)).catch(e=>console.warn('[GoogleDriveProvider] operação confirmada; arquivamento será retomado:',e));
      this._clearConsolidationPending();
      this._surfaceMergeConflicts(confirmed);
      try{const applied=applyAccountPayloadForLiveUpdate(confirmed);this._notifyAccountSnapshotApplied6402(applied,'sync_confirmed');handleRemovedActiveProfile6402(applied,'sync_confirmed');}catch(e){console.warn('[GoogleDriveProvider] snapshot confirmado, mas atualização local da UI foi adiada:',e);}
      this.conflict=false;this.lastKnownProfileCount=(confirmed.profiles||[]).length;
      if(window.BorionDataGuard){const counts=BorionDataGuard.countAccountRecords(confirmed);this._lastGoodCounts=counts;BorionDataGuard.writeLastGoodCounts(this.folderId,counts);}
      this.dirty=revision!==this._syncRevision;this._syncAgain=this.dirty;this._queueOperationId=null;
      if(!this.dirty)try{localStorage.removeItem(gdrivePendingKey(this.folderId));}catch(e){}
      this.lastSyncError='';this._recordSyncSuccess();
      if(window.RemoteUpdateQueue&&RemoteUpdateQueue.hasPending())setTimeout(()=>RemoteUpdateQueue.applyIfSafe(),0);
      if(window.BorionSyncState)BorionSyncState.set('SNAPSHOT_CONFIRMED',{operationId,checksum:confirmedCheck.checksum});
      return !this.dirty;
    }catch(e){
      this.dirty=true;
      try{localStorage.setItem(gdrivePendingKey(this.folderId),String(Date.now()));}catch(_e){}
      if(operationProtected){
        const newerLocalEdit=revision!==this._syncRevision;
        this.lastSyncError='Alteração protegida no Drive, mas ainda não consolidada: '+String(e&&e.message||e);
        this.authRequired=this._isAuthError(e);this._persistConsolidationPending(operationId);
        this.dirty=newerLocalEdit;this._queueOperationId=null;
        if(!newerLocalEdit)try{localStorage.removeItem(gdrivePendingKey(this.folderId));}catch(_e){}
        this._scheduleRetry();
        if(window.BorionSyncState)BorionSyncState.set('DRIVE_PROTECTED',{operationId,error:this.lastSyncError});
        console.warn('[GoogleDriveProvider] operação protegida; consolidação será repetida:',e);
        return !newerLocalEdit;
      }else{
        this._recordSyncFailure(e,{silent:options.source==='retry'});
        if(window.BorionSyncState)BorionSyncState.set(this.authRequired?'AUTH_REQUIRED':'ERROR');
      }
      return false;
    }finally{
      this._syncInFlight=false;this._refreshStatusUI();this._refreshPendingQueueCount().catch(()=>{});
      if(window.BorionPerf)BorionPerf.endStage('sync_total',{durationMs:Date.now()-this._lastSyncStartedAt});
      if(this._syncAgain&&!this._forceRequested){this._syncAgain=false;this.dirty=true;setTimeout(()=>this.syncNow({source:'follow_up'}),0);}
      else if((this.dirty||this.hasPersistedConsolidation())&&!this.conflict&&!this.blockedSuspicious)this._scheduleRetry();
    }
  },

  /* V6.40 — item 24 do pedido (tela de resolução de conflitos): registra os
     conflitos de campo/edição-x-exclusão encontrados pela consolidação mais
     recente em BorionSyncState, sem bloquear nada — os dois lados do conflito
     já foram preservados pelo merge (ver 01e); isto só torna a existência do
     conflito visível para quem for revisar em Configurações → Nuvem. Nenhum
     dado é apagado aqui; é só um índice para leitura humana depois. */
  _surfaceMergeConflicts(consolidated){
    try{
      const all = [];
      Object.keys((consolidated && consolidated.dataByProfile) || {}).forEach(pid=>{
        const meta = consolidated.dataByProfile[pid] && consolidated.dataByProfile[pid].__syncMeta;
        if(meta && Array.isArray(meta.conflicts) && meta.conflicts.length){
          meta.conflicts.forEach(c=>all.push(Object.assign({profileId:pid}, c)));
        }
      });
      this.pendingMergeConflicts = all;
      if(all.length && window.BorionSyncState) BorionSyncState.set('CONFLICT', {conflicts: all});
    }catch(e){ console.warn('[GoogleDriveProvider] falha ao coletar conflitos de merge (não crítico):', e); }
  },

  /* V6.37.0 — mesma checagem de queda suspeita do syncNow(), só que usada pelo
     Ctrl+S/forceSyncNow. Continua bloqueando por padrão mesmo sendo uma ação
     explícita — "forçar" deveria resolver um CONFLITO de versões, não abrir
     uma exceção para gravar uma base vazia por engano. Quem chama pode passar
     options.acknowledgeSuspicious=true depois de confirmar com a pessoa (ex.:
     um diálogo "tem certeza?") para prosseguir mesmo assim. */
  _assertSafeToForceWrite(payload, options={}){
    if(!window.BorionDataGuard || options.acknowledgeSuspicious) return;
    const nextCounts = BorionDataGuard.countAccountRecords(payload);
    const baseline = this._lastGoodCounts || BorionDataGuard.readLastGoodCounts(this.folderId);
    const check = baseline ? BorionDataGuard.detectSuspiciousAccountDrop(nextCounts, baseline) : { suspicious:false, reasons:[] };
    if(check.suspicious){
      const reasonText = BorionDataGuard.describeSuspiciousAccountReasons(check.reasons);
      const err = new Error('Salvamento bloqueado por segurança: os dados desta sessão parecem menores que o esperado (' + reasonText + '). Nada foi substituído no Google Drive. Se isso for esperado (ex.: você excluiu bastante coisa de propósito), confirme novamente para continuar.');
      err.code = 'SUSPICIOUS_ACCOUNT_DROP';
      err.reasons = check.reasons;
      throw err;
    }
  },

  /* V6.19.0 — "Ctrl+S": ignora a checagem de conflito de propósito e grava o estado
     local por cima do que estiver no Drive agora — é o botão de escape explícito pra
     quando a pessoa sabe que a versão dela é a certa e só quer resolver o conflito.
     V6.20.0 — além de current.json, cada Ctrl+S agora também grava num rodízio próprio
     de até 40 slots (forcesave-1.json...forcesave-40.json), pra dar um histórico dos
     momentos em que você mesmo pediu pra salvar — ver writeRotatingSnapshot(). Isso é
     redundância de segurança; se falhar (rede, etc.) não desfaz o Ctrl+S em si, que já
     terminou com sucesso no current.json. */
  /* V6.40 — item 16 do pedido: Ctrl+S deixa de significar "sobrescrever a
     versão remota mesmo que outro dispositivo tenha dados mais novos". Agora
     ele grava uma operação imutável (mesmo mecanismo do syncNow normal) e
     consolida com merge de três vias — a única diferença do fluxo automático
     é que Ctrl+S dispara isso IMEDIATAMENTE, sem esperar o debounce de 250ms,
     e sempre grava também no rodízio forcesave (histórico dos momentos em que
     você mesmo pediu pra salvar). Nada aqui decide "minha versão vale mais" —
     quem decide é o merge, como em qualquer outra sincronização. */
  async forceSyncNow(options={}){
    if(!this.isConnected()||!this.currentFileId)return false;
    if(window.BorionMultiTab640&&!BorionMultiTab640.isLeader()){
      BorionMultiTab640.requestSync({folderId:this.folderId,source:'force'});
      return {delegated:true,synced:false};
    }
    if(this._forceSavePromise)return this._forceSavePromise;
    this._forceRequested=true;
    this._forceSavePromise=(async()=>{
      clearTimeout(this.syncTimer);
      const payload=options.payload||await buildFullBackupPayload();
      this._assertSafeToForceWrite(payload,options);
      this.dirty=true;this._syncRevision++;
      const ok=await this.syncNow({source:'force',payloadOverride:payload,force:true,acknowledgeSuspicious:options.acknowledgeSuspicious});
      if(ok===true)await this.writeRotatingSnapshot('forcesave',GOOGLE_DRIVE_FORCESAVE_SLOTS,payload);
      return ok;
    })();
    try{return await this._forceSavePromise;}
    finally{this._forceRequested=false;this._forceSavePromise=null;}
  },

  async ensureBackupsFolder(){
    if(this._backupsFolderPromise) return this._backupsFolderPromise;
    this._backupsFolderPromise=(async()=>{
      let folders=await GoogleDriveFS.findChildren(this.folderId,'backups','application/vnd.google-apps.folder');
      if(!folders.length){
        const created=await GoogleDriveFS.createFolder(this.folderId,'backups');
        const relisted=await GoogleDriveFS.findChildren(this.folderId,'backups','application/vnd.google-apps.folder');
        folders=relisted.slice();
        if(created&&created.id&&!folders.some(f=>f.id===created.id))folders.push(Object.assign({parents:[this.folderId]},created));
      }
      const seen=new Set();folders=folders.filter(f=>f&&f.id&&!seen.has(f.id)&&(seen.add(f.id),true));
      folders.sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id)));
      if(!folders.length)throw new Error('Não foi possível localizar/criar a pasta de backups.');
      // Canônica determinística em todos os dispositivos. O ID local é apenas cache
      // diagnóstico e é revalidado em cada descoberta, nunca autoridade exclusiva.
      const canonical=folders[0];
      this._backupsFolderId=canonical.id;this._backupsFolderIds=folders.map(f=>f.id);
      this._backupsFolderDuplicates=folders.slice(1).map(f=>f.id);
      gdriveWriteBackupsFolderId(this.folderId,canonical.id);
      if(this._backupsFolderDuplicates.length)console.warn('[GoogleDriveProvider] pastas backups duplicadas detectadas; todas serão consideradas:',this._backupsFolderDuplicates);
      return canonical.id;
    })();
    try{return await this._backupsFolderPromise;}finally{this._backupsFolderPromise=null;}
  },

  async findBackupFilesByName(name){
    await this.ensureBackupsFolder();
    const all=[],seen=new Set();
    for(const folderId of this._backupsFolderIds){
      const files=await GoogleDriveFS.findChildren(folderId,name);
      for(const f of files)if(f&&f.id&&!seen.has(f.id)){seen.add(f.id);all.push(f);}
    }
    return all.sort((a,b)=>String(a.createdTime||'').localeCompare(String(b.createdTime||''))||String(a.id).localeCompare(String(b.id)));
  },

  async createBackup(reason, options={}){
    reason = reason || 'manual';
    const folderId = await this.ensureBackupsFolder();
    const payload = options.payload ? options.payload : await buildSharedBackupSnapshot(reason, reason);
    const ts = String(payload.snapshotBaseDate||payload.exportedAt||new Date().toISOString()).replace(/[:.]/g, '-');
    const name = 'backup_' + ts + '_v' + BORION_APP_VERSION + '_' + reason + '.json';
    const created = await GoogleDriveFS.createFile(folderId, name, payload);
    this.pruneBackupsBySize().catch(e=>console.warn('[GoogleDriveProvider] limpeza automática de backups falhou (não crítico):', e));
    return { id: created.id, name, createdAt: Date.now(), reasonType: reason, snapshotId:payload.snapshotId||null, snapshotChecksum:payload.snapshotChecksum||'' };
  },

  /* Limpeza conservadora: pagina todas as pastas duplicadas, preserva backups
     manuais/pré-migração e move os demais para a lixeira — nunca DELETE definitivo. */
  async pruneBackupsBySize(maxBytes){
    maxBytes=maxBytes||GOOGLE_DRIVE_BACKUP_MAX_BYTES;
    const files=await this.listBackups({includeSize:true});
    files.sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||''))||String(a.id).localeCompare(String(b.id)));
    let cumulative=0;const toTrash=[];
    const protectedReasons=['manual','manual_quick','manual_drive_local','before_import','before_restore','before_schema_migration'];
    for(const f of files){
      cumulative+=Number(f.size||0);
      const name=String(f.name||'');
      const protectedFile=name.includes('backup_original_pre_migracao_')||protectedReasons.some(r=>name.endsWith('_'+r+'.json'));
      if(cumulative>maxBytes&&!protectedFile)toTrash.push(f.id);
    }
    let trashed=0;
    for(const id of toTrash){
      try{await GoogleDriveFS.trashFile(id);trashed++;}
      catch(e){console.warn('[GoogleDriveProvider] falha ao mover backup antigo para a lixeira ('+id+'):',e);break;}
    }
    return {trashed,totalBytes:cumulative,interrupted:trashed<toTrash.length};
  },

  async listBackups(options={}){
    await this.ensureBackupsFolder();
    const all=[],seen=new Set();
    for(const folderId of this._backupsFolderIds){
      const files=await GoogleDriveFS.listChildren(folderId,{maxItems:250000,maxPages:1000,fields:'nextPageToken,files(id,name,modifiedTime,createdTime,size,parents)'});
      for(const f of files)if(f&&f.id&&!seen.has(f.id)){seen.add(f.id);all.push(f);}
    }
    all.sort((a,b)=>String(b.modifiedTime||'').localeCompare(String(a.modifiedTime||''))||String(a.id).localeCompare(String(b.id)));
    return all.map(f=>({id:f.id,name:f.name,modifiedTime:f.modifiedTime,createdTime:f.createdTime,size:options.includeSize?Number(f.size||0):undefined,parents:f.parents||[]}));
  },

  async restoreBackup(fileId){
    const data = await GoogleDriveFS.readFile(fileId);
    const check = validateBorionJson(data);
    if(!check.valid) throw new Error('Backup corrompido: ' + check.errors.join(' '));
    await this.createBackup('before_restore');
    applyAccountPayloadSilently(data);
    this.lastKnownProfileCount = (data.profiles || []).length;
    this.dirty = true;
    await this.syncNow();
  },

  /* V6.7.0 — grava o JSON de UM perfil específico (não a conta inteira) como arquivo
     separado dentro da pasta "backups" no Drive — pedido pra organizar um arquivo por
     pessoa (perfil-pedro.json, perfil-amanda.json, perfil-marco.json...), redundante
     com o current.json completo, só que mais fácil de identificar de qual pessoa é. */
  async exportSingleProfileToDrive(profileId){
    const p = (S.profiles || []).find(x=>x.id===profileId);
    if(!p) throw new Error('Perfil não encontrado.');
    let data = (S.currentProfile && S.currentProfile.id===profileId && S.data) ? S.data : getProfileData(profileId);
    if(!data && typeof idbGetProfileData === 'function') data = await idbGetProfileData(profileId);
    data = migrateData(data || emptyData(), {profileId});
    const payload = {
      type: 'multicap-profile-backup', version: 2, exportedAt: new Date().toISOString(),
      profile: { id: p.id, name: p.name, email: p.email, passwordHash: p.passwordHash, salt: p.salt, avatarColor: p.avatarColor, avatarImage: p.avatarImage },
      data
    };
    const folderId = await this.ensureBackupsFolder();
    const safeName = (p.name || 'perfil').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const name = 'perfil-' + safeName + '-' + new Date().toISOString().slice(0, 10) + '.json';
    const existing = await GoogleDriveFS.findChild(folderId, name);
    const created = existing ? await GoogleDriveFS.updateFile(existing.id, payload) : await GoogleDriveFS.createFile(folderId, name, payload);
    return { id: created.id, name };
  },

  resetLoginAttempt(){
    GoogleDriveAuth.resetLoginAttempt();
    this.stopAutosaveLoop();
    this.stopLivePollLoop();
    if(this.syncTimer){clearTimeout(this.syncTimer);this.syncTimer=null;}
    if(this.autosaveKickTimer){clearTimeout(this.autosaveKickTimer);this.autosaveKickTimer=null;}
    this.folderId=null;this.folderName=null;this.currentFileId=null;this.currentFileMeta=null;
    this._backupsFolderId=null;this._backupsFolderIds=[];this._backupsFolderDuplicates=[];this._backupsFolderPromise=null;
    this.conflict=false;this.dirty=false;this.authRequired=false;this.lastSyncError='';
    this._syncInFlight=false;this._syncAgain=false;this._forceRequested=false;this._forceSavePromise=null;
    this._lastConsolidatedPayload=null;this._operationBasePayload=null;this._queueOperationId=null;
    this.pendingMergeConflicts=[];this._clearRetry();
    // IDs de pasta, dados locais e alterações pendentes persistidas são mantidos.
    // Só o estado transitório da tentativa de login é descartado.
    return true;
  },

  disconnect(){
    GoogleDriveAuth.signOut();
    this.stopAutosaveLoop();
    this.stopLivePollLoop();
    this.folderId = null; this.currentFileId = null; this.currentFileMeta = null;
    this._backupsFolderId=null;this._backupsFolderIds=[];this._backupsFolderDuplicates=[]; this.conflict = false; this.dirty = false;
    this.autosaveDirtySinceLast = false; this._forceRequested = false; this._forceSavePromise = null;
    this._lastGoodCounts = null; this.blockedSuspicious = null;
    this._lastConsolidatedPayload = null; this._operationBasePayload = null; this._queueOperationId = null;
    this.pendingMergeConflicts = [];
    this._clearRetry(); this.lastSyncAt=0; this.lastSyncError=''; this.authRequired=false;
    setStorageMode(null);
  },

  getStatus(){
    return {
      connected: this.isConnected(),
      email: GoogleDriveAuth.user ? GoogleDriveAuth.user.email : null,
      folderId: this.folderId,
      folderName: this.folderName || null,
      folderLink: this.folderId ? ('https://drive.google.com/drive/folders/' + this.folderId) : null,
      pending: this.dirty || this.hasPersistedPending() || this.hasPersistedConsolidation(),
      conflict: this.conflict,
      blockedSuspicious: this.blockedSuspicious || null,
      lastSyncAt:this.lastSyncAt||0,
      lastSyncDurationMs:this._lastSyncDurationMs||0,
      pendingRemoteUpdate:!!(window.RemoteUpdateQueue&&RemoteUpdateQueue.hasPending()),
      livePollMode:Date.now()<this._liveActiveUntil?'active':(Date.now()-this._lastUserActivityAt>2*60*1000?'idle':'normal'),
      lastSyncError:this.lastSyncError||'',
      authRequired:!!this.authRequired
    };
  }
};

window.GoogleDriveProvider = GoogleDriveProvider;

/* V6.38.0 — além do poll de fundo (GOOGLE_DRIVE_LIVE_POLL_MS), confere na hora
   quando a pessoa volta pro app (troca de aba, tira do segundo plano no celular) —
   é exatamente o momento em que mais faz sentido já estar atualizado, sem esperar
   o próximo tick do timer. */
if(typeof document!=='undefined'){
  document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState==='visible' && window.GoogleDriveProvider && GoogleDriveProvider.isConnected()){
      if(GoogleDriveProvider.dirty || GoogleDriveProvider.hasPersistedPending() || GoogleDriveProvider.hasPersistedConsolidation()) GoogleDriveProvider.resumePendingSync('visibility');
      else GoogleDriveProvider.checkForRemoteUpdate();
    }
  });
}
if(typeof window!=='undefined'){
  window.addEventListener('focus', ()=>{
    if(!window.GoogleDriveProvider || !GoogleDriveProvider.isConnected()) return;
    if(GoogleDriveProvider.dirty || GoogleDriveProvider.hasPersistedPending() || GoogleDriveProvider.hasPersistedConsolidation()) GoogleDriveProvider.resumePendingSync('focus');
    else GoogleDriveProvider.checkForRemoteUpdate();
  });
  window.addEventListener('online', ()=>{
    if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected()) GoogleDriveProvider.resumePendingSync('online');
  });
  window.addEventListener('offline', ()=>{
    if(window.GoogleDriveProvider && GoogleDriveProvider.isConnected() && (GoogleDriveProvider.dirty || GoogleDriveProvider.hasPersistedPending() || GoogleDriveProvider.hasPersistedConsolidation())){
      GoogleDriveProvider.lastSyncError='Sem internet. A alteração está salva somente neste dispositivo por enquanto.';
      GoogleDriveProvider.authRequired=false;
      GoogleDriveProvider._refreshStatusUI();
    }
  });
}

/* Tela de onboarding pra pasta compartilhada que ainda não tem nenhum current.json —
   pede pra escolher entre importar um JSON antigo (ex: exportado do Supabase) ou
   começar do zero, em vez de criar um arquivo vazio silenciosamente. */
function renderGoogleDriveOnboarding(){
  applyFont(); applyTheme();
  const root = document.getElementById('root');
  root.innerHTML = `
    <div class="gate-wrap">
      <div class="gate-box">
        <div class="gate-logo"><img src="borion-emblem.png" alt="Borion Finance"/><div class="appname">Borion Finance</div></div>
        <div class="gate-card">
          <h2>Nenhum dado encontrado nesta pasta</h2>
          <p class="gate-sub">Essa pasta do Google Drive ainda não tem nenhum backup do Borion. O que você quer fazer?</p>
          <button class="btn btn-primary btn-block" id="gdrive_start_fresh">Começar do zero</button>
          <div style="text-align:center;margin-top:10px;"><button class="link-btn" id="gdrive_import_old">Importar um JSON antigo</button></div>
          <input type="file" id="gdrive_import_file" accept="application/json" style="display:none;">
          <div style="text-align:center;margin-top:14px;"><button class="link-btn" id="gdrive_onboarding_back">Usar outra forma de entrar</button></div>
        </div>
      </div>
    </div>`;
  document.getElementById('gdrive_start_fresh').onclick = async ()=>{
    try{ await GoogleDriveProvider.createEmptyCurrentFile(); S.gate={mode:'list',error:''}; renderGate(); }
    catch(e){ alert(e.message||String(e)); }
  };
  document.getElementById('gdrive_import_old').onclick = ()=>{ document.getElementById('gdrive_import_file').click(); };
  document.getElementById('gdrive_import_file').onchange = async (ev)=>{
    const file = ev.target.files[0]; if(!file) return;
    try{
      const text = await file.text();
      const obj = JSON.parse(text);
      const check = validateBorionJson(obj);
      if(!check.valid){ alert(check.errors.join(' ')); return; }
      const created = await GoogleDriveFS.createFile(GoogleDriveProvider.folderId, 'current.json', obj);
      GoogleDriveProvider.currentFileId = created.id;
      GoogleDriveProvider.currentFileMeta = created;
      GoogleDriveProvider.lastKnownProfileCount = (obj.profiles || []).length;
      applyAccountPayloadSilently(obj);
      S.gate = { mode: 'list', error: '' };
      renderGate();
    }catch(e){ alert('Arquivo inválido: ' + (e.message || String(e))); }
  };
  document.getElementById('gdrive_onboarding_back').onclick = ()=>{
    GoogleDriveProvider.disconnect();
    CloudAuth.mode='login'; CloudAuth.error=''; CloudAuth.info=''; CloudAuth.emailExpanded=false;
    CloudAuth.render();
  };
}

/* Tela simples mostrada quando a renovação silenciosa do token do Google falha no
   boot (ex: sessão expirada, revogou acesso pela conta Google). Só tem um botão —
   não tenta adivinhar o motivo, só oferece reconectar (com popup de consentimento). */
function renderGoogleDriveReconnect(errorMessage){
  applyFont();applyTheme();
  const root=document.getElementById('root');
  root.innerHTML=`<div class="gate-wrap"><div class="gate-box"><div class="gate-logo"><img src="borion-emblem.png" alt="Borion Finance"/><div class="appname">Borion Finance</div></div><div class="gate-card"><h2>Não foi possível concluir a abertura</h2><p class="gate-sub">A conexão não foi concluída. Nenhum dado foi apagado.</p><button class="btn btn-primary btn-block" id="gdrive_back_login">Voltar ao login</button></div></div></div>`;
  const button=document.getElementById('gdrive_back_login');
  if(button)button.onclick=()=>{if(window.returnToSimpleGoogleLogin)window.returnToSimpleGoogleLogin();else{try{GoogleDriveProvider.resetLoginAttempt();}catch(e){}try{setStorageMode(null);}catch(e){}CloudAuth.mode='login';CloudAuth.error='';CloudAuth.info='';CloudAuth.emailExpanded=false;CloudAuth.render();}};
  if(errorMessage&&window.console&&console.error)console.error('[BORION][LOGIN]',errorMessage);
}
