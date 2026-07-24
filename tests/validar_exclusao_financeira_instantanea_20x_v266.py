import json,time,urllib.request,websocket,itertools,subprocess,tempfile,sys,socket,shutil
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0)); PORT=sock.getsockname()[1]
profile=tempfile.mkdtemp(prefix='chrome-marco-v266-delete-')
proc=subprocess.Popen([
    '/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage',
    '--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update',
    '--disable-sync','--disable-extensions','--disable-features=MediaRouter,OptimizationHints',
    f'--remote-debugging-port={PORT}','--remote-debugging-address=127.0.0.1','--remote-allow-origins=*',
    f'--user-data-dir={profile}','about:blank'
],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(80):
        try:
            pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
            if pages: break
        except Exception: pass
        time.sleep(.1)
    else: raise RuntimeError('Chromium não iniciou')
    ws=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],timeout=180,origin=f'http://127.0.0.1:{PORT}',max_size=50_000_000)
    seq=itertools.count(1)
    def cmd(method,params=None,timeout=180):
        i=next(seq); ws.send(json.dumps({'id':i,'method':method,'params':params or {}})); end=time.time()+timeout
        while time.time()<end:
            msg=json.loads(ws.recv())
            if msg.get('id')==i:
                if 'error' in msg: raise RuntimeError(msg['error'])
                return msg.get('result',{})
        raise TimeoutError(method)
    def ev(expr,await_promise=False):
        r=cmd('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':await_promise})['result']
        if r.get('subtype')=='error': raise RuntimeError(r.get('description'))
        return r.get('value')

    js_files=[
      'js/data/initial-data.js','js/services/storage.js','js/services/identifiers.js','js/services/phone.js',
      'js/services/money.js','js/services/finance-status.js','js/services/stock-health.js','js/services/google-drive.js',
      'js/vendor/qrcode-local.js','js/services/pdf.js','js/services/borion-interop-source.js','js/app.js',
      'js/legacy-migration-v253.js','js/personalization-v221.js','js/pts-completo.js','js/mobile-experience.js',
      'js/borion-hub.js','js/v227-corrections.js','js/v255-marco-review.js','js/v256-final-adjustments.js','js/v259-layout-livre.js'
    ]
    poly='''<script>(()=>{const mk=()=>{const s={};return {getItem:k=>Object.prototype.hasOwnProperty.call(s,k)?s[k]:null,setItem:(k,v)=>s[k]=String(v),removeItem:k=>delete s[k],clear:()=>Object.keys(s).forEach(k=>delete s[k]),key:i=>Object.keys(s)[i]??null,get length(){return Object.keys(s).length}}};Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true});Object.defineProperty(window,'indexedDB',{value:{deleteDatabase(){const req={};queueMicrotask(()=>req.onsuccess&&req.onsuccess());return req;}},configurable:true});try{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});}catch(_){};window.scrollTo=()=>{};})();</script>'''
    scripts=[]
    for f in js_files:
        s=(ROOT/f).read_text(encoding='utf-8').replace('</script','<\\/script')
        scripts.append(f'<script data-src="{f}">{s}</script>')
    html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div><div id="confirm-root"></div><input id="json-import" type="file" hidden><input id="media-import" type="file" hidden>'+poly+''.join(scripts)+'</body></html>'
    cmd('Page.navigate',{'url':'about:blank'}); time.sleep(.2)
    frame=cmd('Page.getFrameTree')['frameTree']['frame']['id']
    cmd('Page.setDocumentContent',{'frameId':frame,'html':html}); time.sleep(1.5)

    setup=r'''(()=>{
      clearInterval(REMOTE_REFRESH_TIMER);clearInterval(AUTO_BACKUP_TIMER);clearInterval(GOOGLE_TIMER);clearTimeout(CLOUD_RETRY_TIMER);clearTimeout(BACKGROUND_SAVE_RETRY_TIMER);
      LOCKED=false;CURRENT_VIEW='finance';SEARCH='';
      confirmAction=async()=>true;
      GoogleDriveMarco.isConfigured=()=>true;
      MarcoStorage.saveSyncBase=async()=>true;
      MarcoStorage.createBackup=async()=>true;
      if(window.MarcoBorionInterop){
        const realPrepare=MarcoBorionInterop.prepareState.bind(MarcoBorionInterop);
        MarcoBorionInterop.prepareState=state=>realPrepare(state);
        MarcoBorionInterop.getRuntimeStatus=()=>({ready:false,initialSyncComplete:false,deviceId:'test-v266'});
      }
      const d=data();
      d.clients=[];d.serviceOrders=[];d.orderItems=[];d.products=[];d.services=[];d.supplies=[];d.stockMovements=[];d.appointments=[];d.consents=[];d.audit=[];d.payments=[];
      d.settings.autosaveGoogle=true;d.settings.autosaveFolder=false;d.settings.periodFilters={};d.settings.dashboardPrivacy=false;
      normalizeState();LAST_CONFIRMED_STATE=clone(STATE);renderShell();
      return {version:MarcoOptimisticDeleteV266.version};
    })()'''
    setup_result=ev(setup)
    if setup_result.get('version')!='2.6.6': raise RuntimeError('Versão de teste não carregada')

    audit=r'''(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      const waitUntil=async(fn,timeout=2500)=>{const end=performance.now()+timeout;while(performance.now()<end){if(fn())return true;await wait(10);}return false;};
      const results=[];
      for(let run=1;run<=20;run++){
        const id=`REC-V266-${String(run).padStart(3,'0')}`;
        const followId=`REC-V266-FOLLOW-${String(run).padStart(3,'0')}`;
        data().payments=[{id,code:id,type:'Receita',value:100+run,paymentMethod:'Pix',paymentDate:'2026-07-24',status:'Pago',active:true,createdAt:nowIso()}];
        window.MarcoBorionInterop?.prepareState?.(STATE); // cria shadow antes da exclusão
        LAST_CONFIRMED_STATE=clone(STATE);
        CURRENT_VIEW='finance';renderView('none');
        const saved=[];let calls=0;
        GoogleDriveMarco.enqueueSave=async (snapshot,options={})=>{
          calls++;
          saved.push({call:calls,reason:String(options.reason||''),snapshot:clone(snapshot)});
          await wait(70);
          return {ok:true};
        };
        const button=document.querySelector(`[data-action="delete-payment"][data-id="${CSS.escape(id)}"]`)||{dataset:{action:'delete-payment',id}};
        const start=performance.now();
        await handleAction(button);
        const elapsed=performance.now()-start;
        const immediateDataGone=!data().payments.some(p=>p.id===id);
        const immediateDomGone=!document.querySelector(`[data-action="delete-payment"][data-id="${CSS.escape(id)}"]`);
        const pendingImmediately=MarcoOptimisticDeleteV266.pendingIds().includes(id);

        // Simula uma base antiga reaplicada enquanto a exclusão ainda está pendente.
        STATE=clone(LAST_CONFIRMED_STATE);
        normalizeState();
        const goneAfterStaleReload=!data().payments.some(p=>p.id===id);
        const pendingAfterStaleReload=MarcoOptimisticDeleteV266.pendingIds().includes(id);

        // Duas alterações feitas em seguida; ambas precisam carregar a exclusão junto.
        data().payments.push({id:followId,code:followId,type:'Receita',value:200+run,paymentMethod:'Dinheiro',paymentDate:'2026-07-24',status:'Pago',active:true,createdAt:nowIso()});
        await persist('Alteração imediatamente após exclusão',followId,{media:false});
        const goneAfterFirstFollow=!data().payments.some(p=>p.id===id);
        data().settings[`v266Follow${run}`]=`ok-${run}`;
        await persist('Segunda alteração após exclusão',`run-${run}`,{media:false});
        const backgroundConfirmed=await waitUntil(()=>!MarcoOptimisticDeleteV266.pendingIds().includes(id),3000);
        const fullySynced=await waitUntil(()=>!MarcoOptimisticDeleteV266.hasUnsynced(),5000);
        const goneAfterBackground=!data().payments.some(p=>p.id===id);
        const everySnapshotKeptDeleted=saved.every(entry=>{
          const d=entry.snapshot.dataByProfile[entry.snapshot.activeProfileId];
          return !(d.payments||[]).some(p=>p.id===id||p.code===id);
        });
        const lastSnapshot=saved[saved.length-1]?.snapshot;
        const finalData=lastSnapshot?.dataByProfile?.[lastSnapshot.activeProfileId];
        const finalSavedSetting=finalData?.settings?.[`v266Follow${run}`]===`ok-${run}`;
        const followPaymentSaved=(finalData?.payments||[]).some(p=>p.id===followId);
        const tombstone=(STATE.interconnections?.borion?.tombstones||[]).some(t=>t.entityId===id||t.sourceRecordId===`marco:receipt:${id}`);
        const pass=elapsed<100&&immediateDataGone&&immediateDomGone&&pendingImmediately&&goneAfterStaleReload&&pendingAfterStaleReload&&goneAfterFirstFollow&&backgroundConfirmed&&fullySynced&&goneAfterBackground&&everySnapshotKeptDeleted&&finalSavedSetting&&followPaymentSaved&&tombstone&&calls>=1;
        results.push({run,pass,elapsedMs:Number(elapsed.toFixed(2)),immediateDataGone,immediateDomGone,pendingImmediately,goneAfterStaleReload,pendingAfterStaleReload,goneAfterFirstFollow,backgroundConfirmed,fullySynced,goneAfterBackground,everySnapshotKeptDeleted,finalSavedSetting,followPaymentSaved,tombstone,saveCalls:calls,reasons:saved.map(x=>x.reason)});
        data().payments=[];renderView('none');await wait(10);
      }
      return {version:MarcoOptimisticDeleteV266.version,runs:results,passed:results.filter(x=>x.pass).length,total:results.length,allPassed:results.every(x=>x.pass),maxImmediateMs:Math.max(...results.map(x=>x.elapsedMs)),failures:results.filter(x=>!x.pass)};
    })()'''
    result=ev(audit,True)
    out=ROOT/'RESULTADO_EXCLUSAO_INSTANTANEA_20X_V2_6_6.json'
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['version','passed','total','allPassed','maxImmediateMs','failures']},ensure_ascii=False,indent=2))
    ws.close()
    sys.exit(0 if result['allPassed'] else 1)
finally:
    proc.terminate()
    try: proc.wait(timeout=5)
    except Exception: proc.kill()
    shutil.rmtree(profile,ignore_errors=True)
