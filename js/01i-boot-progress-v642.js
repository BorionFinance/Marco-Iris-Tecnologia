/* Borion Finance 6.42.0 — progresso real do boot + telemetria local. */
(function(global){
  'use strict';
  const now=()=>global.performance&&typeof performance.now==='function'?performance.now():Date.now();
  const mark=(name)=>{try{performance.mark(name);}catch(_e){}};
  const measure=(name,start,end)=>{try{performance.measure(name,start,end);}catch(_e){}};
  const safeText=(value)=>String(value==null?'':value).replace(/[\r\n\t]+/g,' ').replace(/Bearer\s+[A-Za-z0-9._~-]+/gi,'Bearer [oculto]').replace(/ya29\.[A-Za-z0-9._-]+/g,'[token oculto]').replace(/[A-Za-z0-9_-]{60,}/g,'[identificador oculto]').slice(0,900);
  const DEBUG=/(?:\?|&)borionDebug=(?:sync|boot|performance)(?:&|$)/i.test((global.location&&global.location.search)||'');
  function collectResourceTiming(){
    try{
      const resources=performance.getEntriesByType('resource')||[],nav=(performance.getEntriesByType('navigation')||[])[0]||null,paints=performance.getEntriesByType('paint')||[];
      const classify=e=>{const n=String(e&&e.name||'');if(/accounts\.google\.com\/gsi\/client/.test(n))return'googleIdentity';if(/apis\.google\.com\/js\/api/.test(n))return'googlePicker';if(/supabase-js/.test(n))return'supabase';if(/\.js(?:\?|$)/.test(n)&&global.location&&n.startsWith(global.location.origin))return'localScripts';return'other';};
      const groups={localScripts:{count:0,totalDurationMs:0,maxDurationMs:0,transferBytes:0},googleIdentity:{count:0,totalDurationMs:0,maxDurationMs:0,transferBytes:0},googlePicker:{count:0,totalDurationMs:0,maxDurationMs:0,transferBytes:0},supabase:{count:0,totalDurationMs:0,maxDurationMs:0,transferBytes:0}};
      resources.forEach(e=>{const kind=classify(e),g=groups[kind];if(!g)return;const d=Math.max(0,Number(e.duration)||0);g.count++;g.totalDurationMs+=d;g.maxDurationMs=Math.max(g.maxDurationMs,d);g.transferBytes+=(Number(e.transferSize)||0);});
      Object.values(groups).forEach(g=>{g.totalDurationMs=Math.round(g.totalDurationMs);g.maxDurationMs=Math.round(g.maxDurationMs);});
      return {navigation:nav?{responseEndMs:Math.round(nav.responseEnd||0),domInteractiveMs:Math.round(nav.domInteractive||0),domContentLoadedMs:Math.round(nav.domContentLoadedEventEnd||0),loadEventMs:Math.round(nav.loadEventEnd||0)}:null,firstPaints:Object.fromEntries(paints.map(x=>[x.name,Math.round(x.startTime)])),groups};
    }catch(_e){return null;}
  }

  const BorionPerf={
    session:null,
    startSession(meta={}){
      this.session={startedAt:Date.now(),startedPerf:now(),endedAt:null,meta:Object.assign({},meta),stages:{},counters:{driveRequests:0,driveRetries:0,bytesDownloaded:0,bytesUploaded:0,driveItemsListed:0,foldersListed:0,operationsListed:0,operationsSkippedByName:0,operationsDownloaded:0,operationsArchived:0,currentFileCacheHits:0,currentFileCacheMisses:0,topologyCacheHits:0,topologyFullDiscoveries:0,checksumMs:0,mergeMs:0,remoteUpdatesDetected:0,remoteUpdatesApplied:0},events:[]};
      mark('borion:boot:start');
      return this.session;
    },
    ensure(){return this.session||this.startSession();},
    startStage(name,metadata={}){const s=this.ensure();const key=String(name);const prev=s.stages[key]||{};s.stages[key]=Object.assign({},prev,{name:key,startedAt:now(),startedWall:Date.now(),metadata:Object.assign({},prev.metadata||{},metadata)});mark('borion:'+key+':start');return key;},
    endStage(name,metadata={}){const s=this.ensure();const key=String(name);const stage=s.stages[key]||{name:key,startedAt:now(),startedWall:Date.now(),metadata:{}};stage.endedAt=now();stage.durationMs=Math.max(0,stage.endedAt-stage.startedAt);stage.metadata=Object.assign({},stage.metadata||{},metadata);s.stages[key]=stage;mark('borion:'+key+':end');measure('borion:'+key,'borion:'+key+':start','borion:'+key+':end');return stage;},
    count(name,amount=1){const s=this.ensure();s.counters[name]=(Number(s.counters[name])||0)+(Number(amount)||0);return s.counters[name];},
    countDriveRequest(type){this.count('driveRequests',1);this.count('driveRequest_'+String(type||'other'),1);},
    recordPayloadSize(type,bytes){const n=Math.max(0,Number(bytes)||0);if(type==='download')this.count('bytesDownloaded',n);else if(type==='upload')this.count('bytesUploaded',n);else this.count('bytes_'+String(type||'other'),n);},
    event(name,metadata={}){const s=this.ensure();s.events.push({name:String(name),atMs:Math.max(0,now()-s.startedPerf),metadata:Object.assign({},metadata)});if(s.events.length>250)s.events.shift();},
    finish(metadata={}){const s=this.ensure();s.endedAt=Date.now();s.durationMs=Math.max(0,now()-s.startedPerf);s.meta=Object.assign({},s.meta,metadata,{resourceTiming:collectResourceTiming()});mark('borion:boot:end');measure('borion:boot','borion:boot:start','borion:boot:end');if(DEBUG&&global.console){console.groupCollapsed('[BORION][PERF] resumo local');console.table(Object.values(s.stages).map(x=>({etapa:x.name,ms:Math.round(x.durationMs||0)})));console.log(this.summary());console.groupEnd();}return s;},
    summary(){const s=this.ensure();return {startedAt:new Date(s.startedAt).toISOString(),durationMs:Math.round(s.durationMs!=null?s.durationMs:now()-s.startedPerf),stages:Object.fromEntries(Object.entries(s.stages).map(([k,v])=>[k,{durationMs:Math.round(v.durationMs!=null?v.durationMs:now()-v.startedAt),metadata:v.metadata||{}}])),counters:Object.assign({},s.counters),events:s.events.slice(),meta:Object.assign({},s.meta)};},
    isDebug(){return DEBUG;}
  };

  const DEFAULT_STAGES={
    prepare:{label:'Preparando o Borion',detail:'Carregando os componentes essenciais',progress:6},
    device:{label:'Verificando este dispositivo',detail:'Preparando armazenamento seguro',progress:14},
    storage:{label:'Preparando armazenamento seguro',detail:'Verificando alterações pendentes',progress:22},
    google_identity:{label:'Conectando à conta Google',detail:'Carregando o acesso seguro ao Google',progress:30},
    google_token:{label:'Confirmando sua conta',detail:'Renovando o acesso ao Google Drive',progress:38},
    folder:{label:'Localizando a pasta do Borion',detail:'Confirmando a pasta vinculada',progress:48},
    current_meta:{label:'Buscando a base oficial',detail:'Localizando o current.json',progress:57},
    current_download:{label:'Buscando a base oficial',detail:'Baixando o current.json',progress:65},
    integrity:{label:'Validando a integridade dos dados',detail:'Verificando checksum de segurança',progress:73},
    journal:{label:'Verificando alterações pendentes',detail:'Procurando operações ainda não consolidadas',progress:81},
    apply:{label:'Carregando perfis',detail:'Aplicando os dados validados neste dispositivo',progress:89},
    render:{label:'Preparando a interface',detail:'Organizando seus perfis',progress:96},
    ready:{label:'Tudo pronto',detail:'Finalizando a abertura',progress:100}
  };

  const BootProgress={
    stages:DEFAULT_STAGES,currentStage:null,startedAt:0,_slowTimers:[],_elapsedTimer:null,_retryHandler:null,_reconnectHandler:null,_backHandler:null,_failed:false,
    start(options={}){this._clearTimers();this._failed=false;this.startedAt=Date.now();this._retryHandler=options.retry||this._retryHandler;this._reconnectHandler=options.reconnect||this._reconnectHandler;this._backHandler=options.back||this._backHandler;BorionPerf.startSession({storageMode:options.storageMode||null});this._renderShell(options);this.setStage(options.stage||'prepare');this._armSlowStates();return this;},
    _root(){return global.document&&document.getElementById('root');},
    _renderShell(options={}){const root=this._root();if(!root)return;root.innerHTML=`<div id="borion-boot" class="borion-boot" role="status" aria-live="polite" aria-atomic="true"><div class="borion-boot-card"><div class="borion-boot-logo-wrap"><img class="borion-boot-logo" src="borion-emblem.png" alt="Borion Finance"></div><div class="borion-boot-brand">BORION FINANCE</div><div class="borion-boot-spinner" aria-hidden="true"><span></span></div><h1 id="borion-boot-title">Preparando o Borion</h1><p id="borion-boot-detail">Carregando os componentes essenciais</p><div class="borion-boot-progress" aria-label="Progresso da inicialização"><span id="borion-boot-progress-bar" style="width:0%"></span></div><div class="borion-boot-meta"><span id="borion-boot-connection">${navigator.onLine?'Conexão disponível':'Sem internet'}</span><span id="borion-boot-elapsed" hidden></span></div><p class="borion-boot-safe">Seus dados continuam protegidos.</p><div id="borion-boot-slow" class="borion-boot-slow" hidden></div><div id="borion-boot-error" class="borion-boot-error" hidden></div></div></div>`;},
    setStage(stageId,options={}){if(this._failed)return;const stage=this.stages[stageId]||{label:options.label||stageId,detail:options.detail||'',progress:options.progress||0};if(this.currentStage&&this.currentStage!==stageId)BorionPerf.endStage('boot_'+this.currentStage);this.currentStage=stageId;BorionPerf.startStage('boot_'+stageId,options.metadata||{});const title=document.getElementById('borion-boot-title'),detail=document.getElementById('borion-boot-detail');if(title)title.textContent=options.label||stage.label;if(detail)detail.textContent=options.detail||stage.detail;this.setProgress(options.progress!=null?options.progress:stage.progress);return this;},
    setDetail(text){const el=document.getElementById('borion-boot-detail');if(el)el.textContent=safeText(text);return this;},
    setProgress(value){const n=Math.max(0,Math.min(100,Number(value)||0));const bar=document.getElementById('borion-boot-progress-bar');if(bar)bar.style.width=n+'%';return this;},
    setSlowState(options={}){const el=document.getElementById('borion-boot-slow');if(!el)return this;el.hidden=false;el.textContent=safeText(options.text||options.message||'A conexão está levando um pouco mais de tempo.');return this;},
    _armSlowStates(){this._slowTimers=[setTimeout(()=>this.setSlowState({text:'A conexão está levando um pouco mais de tempo.'}),5000),setTimeout(()=>this.setSlowState({text:'Ainda estamos trabalhando. Seus dados não foram perdidos.'}),10000),setTimeout(()=>this.setSlowState({text:'A resposta do Google Drive está mais lenta que o normal.'}),20000)];this._elapsedTimer=setInterval(()=>{const el=document.getElementById('borion-boot-elapsed');if(!el)return;const sec=Math.floor((Date.now()-this.startedAt)/1000);if(sec>=5){el.hidden=false;el.textContent=sec+' s';}},1000);},
    _clearTimers(){this._slowTimers.forEach(clearTimeout);this._slowTimers=[];if(this._elapsedTimer)clearInterval(this._elapsedTimer);this._elapsedTimer=null;},
    async complete(options={}){if(this.currentStage)BorionPerf.endStage('boot_'+this.currentStage);this.currentStage='ready';this.setProgress(100);this._clearTimers();BorionPerf.finish({status:'complete'});const shell=document.getElementById('borion-boot');if(shell){shell.classList.add('is-complete');await new Promise(r=>setTimeout(r,options.fadeMs==null?180:Math.max(0,options.fadeMs)));if(shell.parentNode)shell.parentNode.removeChild(shell);}return true;},
    fail(error,options={}){this._failed=true;if(this.currentStage)BorionPerf.endStage('boot_'+this.currentStage,{failed:true});this._clearTimers();BorionPerf.finish({status:'failed',failedStage:this.currentStage,errorCode:error&&error.code||null});this._retryHandler=options.retry||this._retryHandler;this._reconnectHandler=options.reconnect||this._reconnectHandler;this._backHandler=options.back||this._backHandler;const title=document.getElementById('borion-boot-title'),detail=document.getElementById('borion-boot-detail'),spinner=document.querySelector('.borion-boot-spinner'),errorBox=document.getElementById('borion-boot-error');if(global.console&&console.error)console.error('[BORION][BOOT] abertura interrompida:',error);if(title)title.textContent='Não foi possível concluir a abertura';if(detail)detail.textContent='A conexão não foi concluída. Volte ao login e entre novamente. Nenhum dado foi apagado.';if(spinner)spinner.hidden=true;if(errorBox){errorBox.hidden=false;errorBox.innerHTML=`<div class="borion-boot-actions borion-boot-actions-single"><button type="button" id="borion-boot-back">Voltar ao login</button></div>`;const back=document.getElementById('borion-boot-back');if(back)back.onclick=()=>this.back();}return this;},
    _friendlyError(error){const code=String(error&&error.code||'');const msg=String(error&&error.message||error||'');if(/AUTH_TIMEOUT|401|oauth|token/i.test(code+' '+msg))return 'O Google não confirmou o acesso. A pasta vinculada foi preservada e nenhum dado foi apagado.';if(/DRIVE_TIMEOUT|DOWNLOAD_TIMEOUT|UPLOAD_TIMEOUT|network|fetch/i.test(code+' '+msg))return 'O Google Drive demorou além do limite seguro. Nenhum dado remoto foi sobrescrito.';if(/corromp|checksum|integridade|invalid/i.test(code+' '+msg))return 'A base não passou na validação de segurança. O Borion bloqueou qualquer sobrescrita.';return 'A etapa atual falhou. A pasta vinculada foi preservada e nenhum dado foi apagado.';},
    _isAuthError(error){return /AUTH|401|oauth|token|login|access_denied|interaction_required/i.test(String(error&&((error.code||'')+' '+(error.message||''))||''));},
    async retry(){if(typeof this._retryHandler!=='function'){location.reload();return;}this.start({retry:this._retryHandler,reconnect:this._reconnectHandler,back:this._backHandler});try{await this._retryHandler();}catch(e){this.fail(e);}},
    async reconnect(){if(typeof this._reconnectHandler==='function'){this.start({retry:this._retryHandler,reconnect:this._reconnectHandler,back:this._backHandler});try{await this._reconnectHandler();}catch(e){this.fail(e);}}},
    back(){if(typeof this._backHandler==='function')return this._backHandler();if(typeof global.returnToSimpleGoogleLogin==='function')return global.returnToSimpleGoogleLogin();if(global.CloudAuth&&typeof CloudAuth.render==='function')CloudAuth.render();else location.reload();}
  };

  global.BorionPerf=BorionPerf;global.BootProgress=BootProgress;global.borionPerfSafeText=safeText;
})(window);
