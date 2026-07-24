import json,time,urllib.request,websocket,itertools,subprocess,tempfile,sys,socket,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));PORT=sock.getsockname()[1]
profile=tempfile.mkdtemp(prefix='chrome-marco-v258-')
proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-features=MediaRouter,OptimizationHints',f'--remote-debugging-port={PORT}','--remote-debugging-address=127.0.0.1','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(60):
        try:
            pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'));
            if pages: break
            raise RuntimeError('sem página ainda')
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chromium não iniciou')
    page=pages[0]
    ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=120,origin=f'http://127.0.0.1:{PORT}',max_size=30_000_000)
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
    poly='''<script>(()=>{const mk=()=>{const s={};return {getItem:k=>Object.prototype.hasOwnProperty.call(s,k)?s[k]:null,setItem:(k,v)=>s[k]=String(v),removeItem:k=>delete s[k],clear:()=>Object.keys(s).forEach(k=>delete s[k]),key:i=>Object.keys(s)[i]??null,get length(){return Object.keys(s).length}}};Object.defineProperty(window,'localStorage',{value:mk(),configurable:true});Object.defineProperty(window,'sessionStorage',{value:mk(),configurable:true});Object.defineProperty(window,'indexedDB',{value:{deleteDatabase(){const req={};queueMicrotask(()=>req.onsuccess&&req.onsuccess());return req;}},configurable:true});try{Object.defineProperty(navigator,'onLine',{value:true,configurable:true});}catch(_){};window.scrollTo=()=>{};})();</script>'''
    styles=''.join('<style>'+ (ROOT/f).read_text(encoding='utf-8') +'</style>' for f in css_files)
    scripts=[]
    for f in js_files:
        s=(ROOT/f).read_text(encoding='utf-8').replace('</script','<\\/script')
        scripts.append(f'<script data-src="{f}">{s}</script>')
    html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+styles+'</head><body><div id="root"></div><div id="modal-root"></div><div id="toast-root"></div><div id="confirm-root"></div><input id="json-import" type="file" hidden><input id="media-import" type="file" hidden>'+poly+''.join(scripts)+'</body></html>'
    cmd('Page.navigate',{'url':'about:blank'});time.sleep(.2)
    frame=cmd('Page.getFrameTree')['frameTree']['frame']['id']
    cmd('Page.setDocumentContent',{'frameId':frame,'html':html});time.sleep(2)
    cmd('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})

    setup=r'''(async()=>{
      persist=async()=>({ok:true});
      if(window.GoogleDriveMarco){GoogleDriveMarco.isConfigured=()=>true;GoogleDriveMarco.writeForceSave=async()=>({});}
      const d=data();
      d.clients=[{id:'CLI-000001',name:'Cliente Teste',phone:'(17) 99999-9999',phoneNormalized:'5517999999999',city:'Catanduva',createdAt:'2026-07-20T10:00:00Z',status:'Ativo'}];
      d.services=[{id:'SRV-000001',description:'Formatação',price:150,status:'Ativo'}];
      d.products=[{id:'PRD-000001',description:'SSD',brand:'Marca X',supplier:'Fornecedor Y',cost:100,margin:.5,salePrice:200,minimumStock:1,initialStock:5,status:'Ativo'}];
      d.supplies=[{id:'INS-000001',description:'Pasta térmica',brand:'Marca Z',supplier:'Fornecedor W',cost:20,minimumStock:1,initialStock:10,status:'Ativo'}];
      d.serviceOrders=[{id:'OSV-000001',clientId:'CLI-000001',clientName:'Cliente Teste',openedAt:'2026-07-23T09:00:00Z',createdAt:'2026-07-23T09:00:00Z',equipmentType:'Notebook',brandModel:'Modelo A',status:'Em andamento',registrationStatus:'Ativo',reportedIssue:'Não liga',diagnosis:'Teste',total:350,photos:[],attachments:[],pdfs:[{id:'PDF-1',fileName:'OSV-000001.pdf',createdAt:'2026-07-23T12:00:00Z',official:true}]}];
      d.orderItems=[{id:'ITM-000001',orderId:'OSV-000001',type:'Serviço',serviceId:'SRV-000001',description:'Formatação',quantity:1,unitPrice:150,subtotal:150},{id:'ITM-000002',orderId:'OSV-000001',type:'Produto',productId:'PRD-000001',description:'SSD',quantity:1,unitPrice:200,subtotal:200}];
      d.payments=[{id:'REC-000001',code:'REC-000001',orderId:'OSV-000001',type:'Receita',value:350,grossValue:350,fee:5,paymentMethod:'Pix',paymentDate:'2026-07-23',dueDate:'2026-07-23',status:'Pago',createdAt:'2026-07-23T12:00:00Z',active:true},{id:'DES-000001',code:'DES-000001',type:'Despesa',value:40,fee:0,paymentMethod:'Pix',paymentDate:'2026-07-23',status:'Pago',notes:'Energia',createdAt:'2026-07-23T13:00:00Z',active:true}];
      d.stockMovements=[{id:'MOV-000001',date:'2026-07-23',movementType:'Saída',quantity:1,stockBefore:5,stockAfter:4,productId:'PRD-000001',orderId:'OSV-000001',notes:'Automática'}];
      d.settings.dashboardPrivacy=false;d.settings.modules.agenda=false;d.settings.periodFilters={};d.settings.orderStatusFilterV256='Todos';
      normalizeState();
      LOCKED=false;CURRENT_VIEW='dashboard';renderShell();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return true;
    })()'''
    ev(setup,True)

    audit=r'''(async()=>{
      const runs=[];
      const wait=(ms=20)=>new Promise(r=>setTimeout(r,ms));
      const close=()=>{document.querySelector('#modal-root').replaceChildren();document.body.classList.remove('modal-open','modal-field-active','keyboard-open');};
      const clickRow=async selector=>{const row=document.querySelector(selector);row?.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));await wait(40);return row;};
      const checks=[];const ok=(name,cond)=>checks.push({name,ok:!!cond});
      for(let run=1;run<=20;run++){window.__progress='run-'+run;
        const start=checks.length;
        window.__progress='dashboard';CURRENT_VIEW='dashboard';renderView();await wait();
        ok('Versão carregada',MarcoV256.version==='2.6.0'&&MarcoV259.version==='2.6.0');
        ok('Sidebar independente no desktop',getComputedStyle(document.querySelector('.main')).overflowY==='auto'&&getComputedStyle(document.querySelector('.sidebar')).overflowY==='auto');
        ok('Três ações no topo',document.querySelectorAll('.top-actions [data-action]').length===3);
        ok('Três ações compactas na lateral',document.querySelectorAll('.sidebar-quick-actions-v256 [data-action]').length===3);
        ok('Olhos sincronizados visíveis',document.querySelectorAll('[data-action="toggle-privacy"]').length===2);
        ok('Faturamento exibe quatro formas', ['Pix','Débito','Dinheiro','Crédito'].every(x=>document.querySelector('[data-widget-id="revenue"]')?.innerText.includes(x)));
        ok('Grade do painel preserva lacunas',getComputedStyle(document.querySelector('.dashboard-widget-grid')).gridAutoFlow.trim()==='row');
        ok('Faturamento tem tamanho ampliado',Number(document.querySelector('[data-widget-id="revenue"]').style.getPropertyValue('--widget-rows-v256'))>=26);
        data().settings.dashboardPrivacy=true;MarcoV256.maskPrivacy(document.getElementById('root'));
        ok('Privacidade oculta valores do painel',!document.querySelector('#view-root').innerText.includes('R$ 350,00')&&!document.querySelector('#view-root').innerText.includes('R$ 350,00'));
        ok('Olho muda para mostrar valores',[...document.querySelectorAll('[data-action="toggle-privacy"]')].every(b=>b.title==='Mostrar valores'));
        data().settings.dashboardPrivacy=false;MarcoV256.maskPrivacy(document.getElementById('root'));
        ok('Privacidade restaura valores',document.querySelector('#view-root').innerText.includes('R$'));

        window.__progress='orders';CURRENT_VIEW='orders';renderView();await wait();
        ok('Ordem dos filtros de OSV',document.querySelector('[data-action="new-order"]').compareDocumentPosition(document.querySelector('.period-filter-v256'))&Node.DOCUMENT_POSITION_FOLLOWING);
        ok('OSV tem De e Até',!!document.querySelector('[data-period-from-v256="orders"]')&&!!document.querySelector('[data-period-to-v256="orders"]'));
        ok('Arquivadas é só ícone',!document.querySelector('[data-action="toggle-archived-orders"]').innerText.trim());
        periodState256=MarcoV256.periodState; const pf=periodState256('orders');pf.month='2026-07';pf.fromDay='23';pf.toDay='';renderView();await wait();
        ok('Filtro de um dia mantém OSV',document.querySelectorAll('[data-row-action="view-order"]').length===1);
        pf.fromDay='22';pf.toDay='22';renderView();await wait();
        ok('Filtro exclui dia diferente',document.querySelectorAll('[data-row-action="view-order"]').length===0);
        pf.fromDay='24';pf.toDay='22';renderView();await wait();
        ok('Intervalo invertido funciona',document.querySelectorAll('[data-row-action="view-order"]').length===1);
        close();await clickRow('[data-row-action="view-order"]');
        ok('Clique da linha OSV abre visualização',!!document.querySelector('.order-detail-modal-v256'));
        ok('Visualização OSV tem Editar layout',!!document.querySelector('[data-action="toggle-layout-v256"]'));
        ok('Anexos após movimentações',(()=>{const hs=[...document.querySelectorAll('.order-detail-modal-v256 h3')].map(x=>x.textContent);return hs.indexOf('Anexos técnicos')>hs.findIndex(x=>/Movimenta/.test(x));})());
        close();

        window.__progress='clients';CURRENT_VIEW='clients';renderView();await wait();
        ok('Clientes têm colunas solicitadas',(()=>{const h=[...document.querySelectorAll('thead th')].map(x=>x.innerText.replace(/[⇅↑↓]/g,'').replace(/\s+/g,' ').trim());return ['ID','Cliente','Contato','Cidade','Data de cadastro','Ordens','Total movimentado'].every((x,i)=>h[i]===x);})());
        await clickRow('[data-row-action="view-client"]');
        ok('Clique cliente abre visualização',!!document.querySelector('.client-detail-modal-v256'));
        ok('Cliente visualizado tem Editar layout',!!document.querySelector('[data-action="toggle-layout-v256"]'));
        const layoutBtn=document.querySelector('[data-action="toggle-layout-v256"]'),clientModal=document.querySelector('.client-detail-modal-v256');if(!clientModal?.classList.contains('layout-editing-v256'))layoutBtn?.click();await wait();
        ok('Editor visual unificado abre',document.querySelector('.client-detail-modal-v256')?.classList.contains('layout-editing-v256'));
        ok('Editor possui alças de canto',document.querySelectorAll('.layout-resize-handle-v256').length>0);
        close();

        window.__progress='finance';CURRENT_VIEW='finance';renderView();await wait();
        ok('Financeiro usa filtro padrão',!!document.querySelector('[data-period-from-v256="finance"]')&&!!document.querySelector('[data-period-to-v256="finance"]'));
        ok('Exportar CSV é ícone final',!document.querySelector('[data-action="export-finance"]').innerText.trim());
        await clickRow('[data-row-action="edit-payment"]');
        ok('Clique financeiro abre edição',!!document.querySelector('form[data-form="payment"]'));
        close();

        window.__progress='catalog-services';CURRENT_VIEW='catalog';ACTIVE_TAB.catalog='services';renderView();await wait();await clickRow('[data-row-action="edit-service"]');ok('Serviço abre edição',!!document.querySelector('form[data-form="service"]'));close();
        window.__progress='catalog-products';ACTIVE_TAB.catalog='products';renderView();await wait();ok('Produto tem ID marca fornecedor',(()=>{const h=[...document.querySelectorAll('thead th')].map(x=>x.innerText.replace(/[⇅↑↓]/g,'').replace(/\s+/g,' ').trim());return ['ID','Produto','Marca','Fornecedor'].every((x,i)=>h[i]===x);})());await clickRow('[data-row-action="edit-product"]');ok('Produto abre edição',!!document.querySelector('form[data-form="product"]'));close();
        window.__progress='catalog-supplies';ACTIVE_TAB.catalog='supplies';renderView();await wait();ok('Insumo tem ID marca fornecedor',(()=>{const h=[...document.querySelectorAll('thead th')].map(x=>x.innerText.replace(/[⇅↑↓]/g,'').replace(/\s+/g,' ').trim());return ['ID','Insumo','Marca','Fornecedor'].every((x,i)=>h[i]===x);})());await clickRow('[data-row-action="edit-supply"]');ok('Insumo abre edição',!!document.querySelector('form[data-form="supply"]'));close();
        window.__progress='catalog-movements';ACTIVE_TAB.catalog='movements';renderView();await wait(90);ok('Movimentação usa Antes → Depois',document.querySelector('thead').innerText.includes('Antes → Depois'));ok('Movimentação não tem Marca/Fornecedor',!document.querySelector('thead').innerText.includes('Marca')&&!document.querySelector('thead').innerText.includes('Fornecedor'));await clickRow('[data-row-action="edit-stock-movement"]');ok('Movimentação abre edição',!!document.querySelector('form[data-form="stock-movement"]'));close();
        ok('Inativos é botão compacto',!document.querySelector('[data-action="toggle-archived-catalog"]').innerText.trim());

        window.__progress='documents';CURRENT_VIEW='documents';openPdfMedia=async()=>{window.__pdfOpened=true};window.__pdfOpened=false;renderView();await wait();
        ok('Documentos usa filtro padrão',!!document.querySelector('[data-period-from-v256="documents"]'));
        await clickRow('[data-row-action="open-document"]');await wait();ok('Clique documento abre PDF',window.__pdfOpened===true);

        cmdViewport={};
        window.__progress='run-end';runs.push({run,passed:checks.slice(start).filter(x=>x.ok).length,total:checks.length-start,failures:checks.slice(start).filter(x=>!x.ok)});
      }
      return {runs,total:checks.length,passed:checks.filter(x=>x.ok).length,allPassed:checks.every(x=>x.ok),failures:checks.filter(x=>!x.ok)};
    })()'''
    result=ev('Promise.race(['+audit+',new Promise(r=>setTimeout(()=>r({timeout:true,progress:window.__progress}),120000))])',True)
    # mobile-specific visual assertions in actual CSS
    cmd('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
    ev("CURRENT_VIEW='dashboard';renderShell();true")
    time.sleep(.5)
    mobile=ev("JSON.stringify({topActions:document.querySelectorAll('.top-actions [data-action]').length,eyeDisplay:getComputedStyle(document.querySelector('.top-actions [data-action=\"toggle-privacy\"]')).display,lockDisplay:getComputedStyle(document.querySelector('.top-actions .lock-top-btn')).display,overflow:document.documentElement.scrollWidth<=document.documentElement.clientWidth})")
    mobile=json.loads(mobile)
    result['mobile']=mobile
    result['allPassed']=result['allPassed'] and mobile['topActions']==3 and mobile['eyeDisplay']!='none' and mobile['lockDisplay']!='none' and mobile['overflow']
    out=ROOT/'RESULTADO_NAVEGADOR_20X_V2_6_0.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'allPassed':result['allPassed'],'runs':len(result['runs']),'checks':result['total'],'passed':result['passed'],'failures':result['failures'][:20],'mobile':mobile},ensure_ascii=False,indent=2))
    ws.close()
    sys.exit(0 if result['allPassed'] else 1)
finally:
    proc.terminate()
    try:proc.wait(timeout=5)
    except:proc.kill()
    shutil.rmtree(profile,ignore_errors=True)
