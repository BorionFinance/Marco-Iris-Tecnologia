import json,time,urllib.request,websocket,itertools,subprocess,tempfile,sys,socket,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
with socket.socket() as sock:
    sock.bind(('127.0.0.1',0));PORT=sock.getsockname()[1]
profile=tempfile.mkdtemp(prefix='chrome-marco-v260-')
proc=subprocess.Popen(['/usr/bin/chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--no-default-browser-check','--disable-background-networking','--disable-component-update','--disable-sync','--disable-extensions','--disable-features=MediaRouter,OptimizationHints',f'--remote-debugging-port={PORT}','--remote-debugging-address=127.0.0.1','--remote-allow-origins=*',f'--user-data-dir={profile}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    for _ in range(100):
        try:
            pages=json.load(urllib.request.urlopen(f'http://127.0.0.1:{PORT}/json'))
            if pages: break
        except Exception: time.sleep(.1)
    else: raise RuntimeError('Chromium não iniciou')
    ws=websocket.create_connection(pages[0]['webSocketDebuggerUrl'],timeout=120,origin=f'http://127.0.0.1:{PORT}',max_size=50_000_000)
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
        src=(ROOT/f).read_text(encoding='utf-8').replace('</script','<\\/script')
        scripts.append(f'<script data-src="{f}">{src}</script>')
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
      d.serviceOrders=[{id:'OSV-000001',clientId:'CLI-000001',clientName:'Cliente Teste',openedAt:'2026-07-23T09:00:00Z',createdAt:'2026-07-23T09:00:00Z',equipmentType:'Notebook',brandModel:'Modelo A',status:'Em andamento',registrationStatus:'Ativo',reportedIssue:'Não liga',technicalReport:'Teste',total:350,photos:[],attachments:[],pdfs:[]}];
      d.orderItems=[{id:'ITM-000001',orderId:'OSV-000001',type:'Serviço',serviceId:'SRV-000001',description:'Formatação',quantity:1,unitPrice:150,subtotal:150}];
      d.payments=[
        {id:'REC-2024',orderId:'OSV-000001',type:'Receita',value:100,paymentMethod:'Dinheiro',paymentDate:'2024-05-10',status:'Pago',createdAt:'2024-05-10T12:00:00Z',active:true},
        {id:'REC-2025A',orderId:'OSV-000001',type:'Receita',value:200,paymentMethod:'Pix',paymentDate:'2025-02-03',status:'Pago',createdAt:'2025-02-03T12:00:00Z',active:true},
        {id:'REC-2025B',orderId:'OSV-000001',type:'Receita',value:50,paymentMethod:'Crédito',paymentDate:'2025-02-15',status:'Pago',createdAt:'2025-02-15T12:00:00Z',active:true},
        {id:'REC-2026',orderId:'OSV-000001',type:'Receita',value:350,paymentMethod:'Débito',paymentDate:'2026-07-23',status:'Pago',createdAt:'2026-07-23T12:00:00Z',active:true}
      ];
      d.stockMovements=[];d.settings.dashboardPrivacy=false;d.settings.modules={agenda:false,terms:false};d.settings.dashboardColumns={desktop:4};d.settings.dashboardLayouts={desktop:{}};d.settings.dashboardRevenuePeriod='year';d.settings.dashboardRevenueYear='2026';
      normalizeState();LOCKED=false;CURRENT_VIEW='dashboard';renderShell();
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return true;
    })()'''
    ev(setup,True)

    audit=r'''(async()=>{
      const wait=(ms=50)=>new Promise(r=>setTimeout(r,ms));
      const checks=[];const ok=(name,cond,detail='')=>checks.push({name,ok:!!cond,detail});
      const click=async sel=>{const el=document.querySelector(sel);el?.click();await wait(90);return el;};
      ok('Camadas v2.6.0 carregadas',MarcoV256?.version==='2.6.0'&&MarcoV259?.version==='2.6.0');
      const labels=[...document.querySelectorAll('.revenue-period-tabs-v255 button')].map(x=>x.textContent.trim());
      ok('Botões na ordem Ano, Mês, Dia',JSON.stringify(labels)===JSON.stringify(['Ano','Mês','Dia']),JSON.stringify(labels));
      let keys=[...document.querySelectorAll('.revenue-bar-column-v255')].map(x=>x.dataset.key);
      ok('Ano exibe 2024, 2025 e 2026',JSON.stringify(keys)===JSON.stringify(['2024','2025','2026']),JSON.stringify(keys));
      await click('.revenue-bar-column-v255[data-key="2025"]');
      await click('.revenue-period-tabs-v255 [data-period="month"]');
      keys=[...document.querySelectorAll('.revenue-bar-column-v255')].map(x=>x.dataset.key);
      ok('Mês herda o ano 2025',keys.length===12&&keys.every(x=>x.startsWith('2025-')),JSON.stringify(keys));
      await click('.revenue-bar-column-v255[data-key="2025-02"]');
      await click('.revenue-period-tabs-v255 [data-period="day"]');
      keys=[...document.querySelectorAll('.revenue-bar-column-v255')].map(x=>x.dataset.key);
      ok('Dia herda fevereiro de 2025',keys.length===28&&keys.every(x=>x.startsWith('2025-02-')),`${keys.length}:${keys[0]}:${keys.at(-1)}`);
      const heads=[...document.querySelectorAll('.composition-heading-v255 strong')].map(x=>x.textContent.trim());
      ok('Títulos sem datas',JSON.stringify(heads)===JSON.stringify(['Composição financeira','Formas de pagamento']),JSON.stringify(heads));
      const arrows=[...document.querySelectorAll('.revenue-scroll-controls-v260 button')];
      ok('Setas grandes abaixo do gráfico',arrows.length===2&&arrows.every(x=>x.getBoundingClientRect().width>=40&&x.getBoundingClientRect().height>=36));

      const verifyModal=async(openExpr,key)=>{
        document.querySelector('#modal-root').replaceChildren();eval(openExpr);await wait(100);
        const modal=document.querySelector('#modal-root .modal'),edit=modal?.querySelector('[data-action="toggle-layout-v256"]');
        ok(`${key} possui Editar layout`,!!edit);
        edit?.click();await wait(100);
        const grids=[...modal.querySelectorAll('[data-layout-grid-v256]')],items=[...modal.querySelectorAll('[data-layout-item-v256]')];
        ok(`${key} abre grade visível`,modal.classList.contains('layout-editing-v256')&&grids.length>0&&items.length>0,`${grids.length}/${items.length}`);
        ok(`${key} usa coordenadas x/y`,items.every(item=>Number(item.style.getPropertyValue('--layout-x-v260'))>0&&Number(item.style.getPropertyValue('--layout-y-v260'))>0));
        return {modal,edit,grids,items};
      };
      let m=await verifyModal('openPaymentForm()','Editar lançamento financeiro');
      const item=m.items[0],id=item.dataset.layoutItemV256,layoutKey=m.modal.dataset.layoutKeyV256,gridKey=item.parentElement.dataset.layoutGridV256;
      item.style.setProperty('--layout-x-v260','7');item.style.setProperty('--layout-y-v260','48');item.style.setProperty('--layout-span-v256','5');item.style.setProperty('--layout-rows-v256','9');
      MarcoV256.refreshModalGrid(m.modal,false);m.edit.click();await wait(120);
      const saved=MarcoV256.layoutStore(layoutKey)?.[gridKey]?.[id];
      ok('Salvar grava x/y/tamanho no estado',saved?.x===7&&saved?.y===48&&saved?.span===5&&saved?.rows===9,JSON.stringify(saved));
      document.querySelector('#modal-root').replaceChildren();openPaymentForm();await wait(100);
      const reopened=[...document.querySelectorAll('[data-layout-item-v256]')].find(x=>x.dataset.layoutItemV256===id);
      ok('Layout salvo reaparece ao reabrir',Number(reopened?.style.getPropertyValue('--layout-x-v260'))===7&&Number(reopened?.style.getPropertyValue('--layout-y-v260'))===48,`${reopened?.style.getPropertyValue('--layout-x-v260')}/${reopened?.style.getPropertyValue('--layout-y-v260')}`);

      await verifyModal('openClientForm()','Novo cliente');
      const orderModal=await verifyModal('openOrderForm()','Nova OSV');
      const orderItem=orderModal.items.find(x=>x.dataset.layoutItemV256==='openedAt')||orderModal.items[0];
      const orderId=orderItem?.dataset.layoutItemV256,orderGridKey=orderItem?.parentElement?.dataset.layoutGridV256;
      orderItem?.style.setProperty('--layout-x-v260','8');orderItem?.style.setProperty('--layout-y-v260','70');orderItem?.style.setProperty('--layout-span-v256','5');
      MarcoV256.refreshModalGrid(orderModal.modal,false);orderModal.edit?.click();await wait(120);
      const orderSaved=MarcoV256.layoutStore('form:order')?.[orderGridKey]?.[orderId];
      ok('Salvar layout da Nova OSV grava coordenadas',orderSaved?.x===8&&orderSaved?.y===70&&orderSaved?.span===5,JSON.stringify(orderSaved));
      document.querySelector('#modal-root').replaceChildren();openOrderForm();await wait(140);
      const reopenedOrder=[...document.querySelectorAll('[data-layout-item-v256]')].find(x=>x.dataset.layoutItemV256===orderId);
      ok('Layout da Nova OSV salvo reaparece',Number(reopenedOrder?.style.getPropertyValue('--layout-x-v260'))===8&&Number(reopenedOrder?.style.getPropertyValue('--layout-y-v260'))===70,`${reopenedOrder?.style.getPropertyValue('--layout-x-v260')}/${reopenedOrder?.style.getPropertyValue('--layout-y-v260')}`);
      await verifyModal("openOrderDetail('OSV-000001')",'Visualização da OSV');
      await verifyModal("openClientDetail('CLI-000001')",'Visualização do cliente');
      await verifyModal('openAppointmentForm()','Novo agendamento');
      await verifyModal('openProductForm()','Novo produto');
      await verifyModal('openServiceForm()','Novo serviço');
      await verifyModal('openSupplyForm()','Novo insumo');
      await verifyModal('openStockMovementForm()','Nova movimentação de estoque');
      await verifyModal('openConsentForm()','Novo termo');
      await verifyModal('openCompanyForm()','Dados da empresa');
      return {allPassed:checks.every(x=>x.ok),passed:checks.filter(x=>x.ok).length,total:checks.length,failures:checks.filter(x=>!x.ok),checks};
    })()'''
    result=ev(audit,True)
    out=ROOT/'RESULTADO_VALIDACAO_V2_6_0.json';out.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False,indent=2))
    ws.close();sys.exit(0 if result['allPassed'] else 1)
finally:
    proc.terminate()
    try:proc.wait(timeout=5)
    except:proc.kill()
    shutil.rmtree(profile,ignore_errors=True)
