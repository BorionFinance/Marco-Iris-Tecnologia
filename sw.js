const CLOUD_ONLY_VERSION='marco-iris-v2.5.1-cloud-only';

self.addEventListener('install',event=>{
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key.startsWith('marco-iris-')).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET'||!request.url.startsWith(self.location.origin))return;
  event.respondWith(
    fetch(request,{cache:'no-store'}).catch(()=>{
      if(request.mode==='navigate'){
        return new Response(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Internet obrigatória</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#02152c;color:#eef7ff;font-family:Segoe UI,Arial,sans-serif;padding:24px}.box{max-width:560px;padding:30px;border:1px solid #28507a;border-radius:24px;background:#09284a;text-align:center}p{color:#b9cee3;line-height:1.55}button{border:0;border-radius:14px;padding:13px 20px;background:#1672e8;color:white;font-weight:700}</style><div class="box"><h1>Internet obrigatória</h1><p>O Marco Iris usa o Google Drive como única base oficial. Nenhum dado é aberto ou salvo offline.</p><button onclick="location.reload()">Tentar novamente</button></div>`,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
      }
      return new Response('Internet obrigatória.',{status:503,headers:{'Cache-Control':'no-store'}});
    })
  );
});
