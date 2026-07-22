const CACHE='marco-iris-v2.4.2-reinstalacao-limpa-drive';
const CORE=[
  './',
  './index.html',
  './css/app.css?v=2.4.2',
  "./css/borion-hub.css?v=2.4.2",
  './css/mobile-borion.css?v=2.4.2',
  './css/pts-completo.css?v=2.4.2',
  './css/validacao-final.css?v=2.4.2',
  './css/personalization-v221.css?v=2.4.2',
  './css/v227-corrections.css?v=2.4.2',
  './js/data/initial-data.js?v=2.4.2',
  "./js/borion-hub.js?v=2.4.2",
  './js/services/storage.js?v=2.4.2',
  './js/services/identifiers.js?v=2.4.2',
  './js/services/phone.js?v=2.4.2',
  './js/services/money.js?v=2.4.2',
  './js/services/finance-status.js?v=2.4.2',
  './js/services/stock-health.js?v=2.4.2',
  './js/services/google-drive.js?v=2.4.2',
  './js/vendor/qrcode-local.js?v=2.4.2',
  './js/services/pdf.js?v=2.4.2',
  './js/services/borion-interop-source.js?v=2.4.2',
  './js/app.js?v=2.4.2',
  './js/personalization-v221.js?v=2.4.2',
  './js/pts-completo.js?v=2.4.2',
  './js/mobile-experience.js?v=2.4.2',
  './js/v227-corrections.js?v=2.4.2',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './assets/marco-banner.jpg',
  './assets/marco-symbol.png'
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('marco-iris-')&&key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(self.location.origin))return;

  // Navegação e arquivos de código usam rede primeiro para evitar versões antigas no GitHub Pages.
  const url=new URL(request.url);
  const isCode=request.mode==='navigate'||/\.(?:html|css|js)$/.test(url.pathname);
  if(isCode){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(request,copy));
          return response;
        })
        .catch(()=>caches.match(request).then(hit=>hit||caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(hit=>hit||fetch(request).then(response=>{
      const copy=response.clone();
      caches.open(CACHE).then(cache=>cache.put(request,copy));
      return response;
    }))
  );
});
