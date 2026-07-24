import json,time,urllib.request,websocket,itertools,subprocess,tempfile,sys,socket,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));PORT=sock.getsockname()[1]
profile=tempfile.mkdtemp(prefix='chrome-marco-v259-')
proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-features=MediaRouter,OptimizationHints',f'--remote-debugging-port={PORT}','--remote-debugging-address=127.0.0.1','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(80):
        try:
            pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
            if pages: break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chromium não iniciou')
    ws=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],timeout=120,origin=f'http://127.0.0.1:{PORT}',max_size=40_000_000)
    seq=itertools.count(1)
    def cmd(method,params=None,timeout=120):
        i=next(seq);ws.send(json.dumps({'id':i,'method':method,'params':params or {}}));end=time.time()+timeout
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

    css_files=['css/app.css','css/mobile-borion.css','css/borion-hub.css','css/pts-completo.css','css/validacao-final.css','css/personalization-v221.css','css/v227-corrections.css','css/v255-marco-review.css','css/v256-final-adjustments.css','css/v259-layout-livre.css','css/v260-layout-unificado.css']
    js_files=['js/data/initial-data.js','js/services/storage.js','js/services/identifiers.js','js/services/phone.js','js/services/money.js','js/services/finance-status.js','js/services/stock-health.js','js/services/google-drive.js','js/vendor/qrcode-local.js','js/services/pdf.js','js/services/borion-interop-source.js','js/app.js','js/legacy-migration-v253.js','js/personalization-v221.js','js/pts-completo.js','js/mobile-experience.js','js/borion-hub.js','js/v227-corrections.js','js/v255-marco-review.js','js/v256-final-adjustments.js','js/v259-layout-livre.js']
    poly='''<script>(()=>{const mk=()=>{const s={};return {getItem:k=>Object.prototype.hasOwnProperty.call(s,k)?s[k]:null,setItem:(k,v)=>s[k]=String(v),removeItem:k=>delete s[k],clear:()=>Object.keys(s).forEach(k=>delete s[k]),key:i=>Object.keys(s)[i]??null,get length(){return Object.keys(s).length}}};Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true});Object.defineProperty(window,'indexedDB',{value:{deleteDatabase(){const req={};queueMicrotask(()=>req.onsuccess&&req.onsuccess());return req;}},configurable:true});try{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});}catch(_){};})();</script>'''
    styles=''.join('<style>'+ (ROOT/f).read_text(encoding='utf-8') +'</style>' for f in css_files)
    scripts=[]
    for f in js_files:
        s=(ROOT/f).read_text(encoding='utf-8').replace('</script','<\\/script')
        scripts.append(f'<script data-src="{f}">{s}</script>')
    html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div><div id="confirm-root"></div><input id="json-import" type="file" hidden><input id="media-import" type="file" hidden>'+poly+''.join(scripts)+'</body></html>'
    cmd('Page.navigate',{'url':'about:blank'});time.sleep(.2)
    frame=cmd('Page.getFrameTree')['frameTree']['frame']['id']
    cmd('Page.setDocumentContent',{'frameId':frame,'html':html});time.sleep(2)
    cmd('Emulation.setDeviceMetricsOverride',{'width':1536,'height':900,'deviceScaleFactor':1,'mobile':False})

    setup=r'''(async()=>{
      persist=async()=>({ok:true});
      if(window.GoogleDriveMarco){GoogleDriveMarco.isConfigured=()=>true;GoogleDriveMarco.writeForceSave=async()=>({});}
      const d=data();
      d.clients=[{id:'CLI-000001',name:'Cliente Teste',phone:'(17) 99999-9999',city:'Catanduva',createdAt:'2026-07-20T10:00:00Z',status:'Ativo'}];
      d.services=[{id:'SRV-000001',description:'Formatação',price:150,status:'Ativo'}];
      d.products=[{id:'PRD-000001',description:'SSD',brand:'Marca X',supplier:'Fornecedor Y',cost:100,margin:.5,salePrice:200,minimumStock:1,initialStock:0,status:'Ativo'}];
      d.supplies=[{id:'INS-000001',description:'Pasta térmica',brand:'Marca Z',supplier:'Fornecedor W',cost:20,minimumStock:1,initialStock:0,status:'Ativo'}];
      d.serviceOrders=[{id:'OSV-000001',clientId:'CLI-000001',clientName:'Cliente Teste',openedAt:'2026-07-23T09:00:00Z',createdAt:'2026-07-23T09:00:00Z',equipmentType:'Notebook',brandModel:'Modelo A',status:'Em andamento',registrationStatus:'Ativo',reportedIssue:'Não liga',diagnosis:'Teste',total:350,photos:[],attachments:[],pdfs:[]}];
      d.orderItems=[{id:'ITM-000001',orderId:'OSV-000001',type:'Serviço',serviceId:'SRV-000001',description:'Formatação',quantity:1,unitPrice:150,subtotal:150}];
      d.payments=[{id:'REC-000001',orderId:'OSV-000001',type:'Receita',value:350,paymentMethod:'Pix',paymentDate:'2026-07-23',status:'Pago',createdAt:'2026-07-23T12:00:00Z',active:true}];
      d.stockMovements=[];d.settings.dashboardPrivacy=false;d.settings.modules={agenda:false,terms:false};d.settings.dashboardColumns={desktop:4};d.settings.dashboardLayouts={desktop:{}};
      normalizeState();LOCKED=false;CURRENT_VIEW='dashboard';renderShell();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return true;
    })()'''
    ev(setup,True)

    audit=r'''(async()=>{
      const wait=(ms=35)=>new Promise(r=>setTimeout(r,ms));
      const results=[];const ok=(name,cond,detail='')=>results.push({name,ok:!!cond,detail});
      for(let run=1;run<=20;run++){
        CURRENT_VIEW='dashboard';renderView();await wait();
        ok('API v2.6.0 carregada',window.MarcoV259?.version==='2.6.0');
        const sideButtons=[...document.querySelectorAll('.sidebar-quick-actions-v256 .icon-btn')];
        const ys=sideButtons.map(b=>Math.round(b.getBoundingClientRect().top));
        ok('Olho, salvar e cadeado alinhados',sideButtons.length===3&&Math.max(...ys)-Math.min(...ys)<=1,JSON.stringify(ys));
        const main=document.querySelector('.main'),sidebar=document.querySelector('.sidebar');
        document.querySelector('#view-root').insertAdjacentHTML('beforeend','<div data-scroll-test style="height:2600px"></div>');
        const sideTop=Math.round(sidebar.getBoundingClientRect().top);main.scrollTop=700;await wait();
        ok('Rolagem ocorre apenas na página da direita',main.scrollTop>600&&Math.round(sidebar.getBoundingClientRect().top)===sideTop,`${main.scrollTop}/${sidebar.getBoundingClientRect().top}`);
        main.scrollTop=0;document.querySelector('[data-scroll-test]')?.remove();

        const grid=document.querySelector('.dashboard-widget-grid');
        ok('Dashboard sem compactação dense',getComputedStyle(grid).gridAutoFlow.trim()==='row',getComputedStyle(grid).gridAutoFlow);
        const before=JSON.parse(JSON.stringify(MarcoV259.dashboardStore()));
        document.querySelector('[data-action="toggle-dashboard-layout"]').click();await wait(80);
        const editGrid=document.querySelector('.dashboard-widget-grid.layout-editing'),source=editGrid.querySelector('[data-widget-id="revenue"]');
        const gr=editGrid.getBoundingClientRect(),dt=new DataTransfer();
        source.dispatchEvent(new DragEvent('dragstart',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:gr.left+10,clientY:gr.top+10}));
        editGrid.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:gr.left+10,clientY:gr.top+900}));
        editGrid.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:gr.left+10,clientY:gr.top+900}));await wait();
        const after=MarcoV259.dashboardStore(),moved=after.revenue;
        const unchanged=Object.keys(before).filter(k=>k!=='revenue').every(k=>before[k]?.x===after[k]?.x&&before[k]?.y===after[k]?.y);
        ok('Módulo aceita posição livre na grade',Number(moved?.y)>20,JSON.stringify(moved));
        ok('Mover módulo não reorganiza os demais',unchanged,JSON.stringify({before,after}));
        ok('Coordenadas x/y ficam salvas',Number.isFinite(Number(moved?.x))&&Number.isFinite(Number(moved?.y)));
        document.querySelector('[data-action="cancel-dashboard-layout"]').click();await wait();

        CURRENT_VIEW='catalog';ACTIVE_TAB.catalog='services';renderView();await wait();
        const tabs=document.querySelector('.catalog-toolbar-v256 .tabs');
        ok('Micro-scroll vertical do catálogo removido',getComputedStyle(tabs).overflowY==='hidden'&&tabs.scrollHeight<=tabs.clientHeight+1,`${getComputedStyle(tabs).overflowY}/${tabs.scrollHeight}/${tabs.clientHeight}`);

        openPaymentForm();await wait();
        const edit=document.querySelector('[data-action="toggle-layout-v256"]');edit?.click();await wait(120);
        const modal=document.querySelector('#modal-root .modal.layout-editing-v256'),items=[...document.querySelectorAll('.layout-editing-v256 [data-layout-item-v256]')];
        ok('Editor de layout ocupa a janela útil',!!modal&&modal.getBoundingClientRect().height>=Math.min(720,innerHeight*.9),modal?String(modal.getBoundingClientRect().height):'sem modal');
        const overlaps=[];
        for(const grid of document.querySelectorAll('.layout-editing-v256 [data-layout-grid-v256]')){
          const children=[...grid.children].filter(x=>x.matches('[data-layout-item-v256]'));
          for(let i=0;i<children.length;i++)for(let j=i+1;j<children.length;j++){
            const a=children[i].getBoundingClientRect(),b=children[j].getBoundingClientRect();
            if(a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1)overlaps.push([children[i].dataset.layoutItemV256,children[j].dataset.layoutItemV256]);
          }
        }
        ok('Campos do editor não ficam sobrepostos',items.length>0&&overlaps.length===0,JSON.stringify(overlaps));
        ok('Campos simples não criam scroll interno',items.filter(x=>x.classList.contains('layout-field-v259')).every(x=>x.scrollHeight<=x.clientHeight+2));
        document.querySelector('#modal-root').replaceChildren();document.body.classList.remove('modal-open');
      }
      return {allPassed:results.every(x=>x.ok),total:results.length,passed:results.filter(x=>x.ok).length,failures:results.filter(x=>!x.ok)};
    })()'''
    result=ev(audit,True)
    out=ROOT/'RESULTADO_VALIDACAO_LAYOUT_V2_6_0.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    ws.close();sys.exit(0 if result['allPassed'] else 1)
finally:
    proc.terminate()
    try:proc.wait(timeout=5)
    except:proc.kill()
    shutil.rmtree(profile,ignore_errors=True)
