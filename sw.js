// Borion Finance 6.45.5 — revisão de despesas MIT corrigida sem alterar o fluxo de receitas.
const CACHE_NAME='borion-finance-v6-45-5-mit-despesas-revisao';
const VERSION='6.45.5';
const ASSETS=[
  './','./index.html','./manifest.json',
  './css/styles.css?v=6.45.5','./css/borion-hub.css?v=6.45.5','./css/help-center.css?v=6.45.5',
  './js/00-utils.js?v=6.45.5','./js/01i-boot-progress-v642.js?v=6.45.5','./js/01j-remote-update-v642.js?v=6.45.5',
  './js/01-storage-data-state.js?v=6.45.5','./js/01b-storage-provider.js?v=6.45.5','./js/01c-google-drive-provider.js?v=6.45.5',
  './js/01d-data-guard.js?v=6.45.5','./js/01e-sync-core-v640.js?v=6.45.5','./js/01f-sync-queue-v640.js?v=6.45.5',
  './js/01g-drive-journal-v640.js?v=6.45.5','./js/01h-multitab-v640.js?v=6.45.5','./js/02-backup-local.js?v=6.45.5',
  './js/03-modals-shared.js?v=6.45.5','./js/04-gate-shell.js?v=6.45.5','./js/05-calculations-charts.js?v=6.45.5',
  './js/06-overview.js?v=6.45.5','./js/07-budget.js?v=6.45.5','./js/08-investments.js?v=6.45.5',
  './js/09-patrimony-goals.js?v=6.45.5','./js/10-cards-accounts.js?v=6.45.5','./js/11-agenda-notifications.js?v=6.45.5',
  './js/12-bank-filter-search.js?v=6.45.5','./js/13-settings.js?v=6.45.5','./js/14-events-boot-pwa.js?v=6.45.5',
  './js/15-cheques.js?v=6.45.5','./js/16-import-statement.js?v=6.45.5','./js/17-borion-cloud.js?v=6.45.5',
  './js/18-order-preferences.js?v=6.45.5','./js/19-subscriptions.js?v=6.45.5','./js/20-smartphone-mode.js?v=6.45.5',
  './js/21-smartphone-history.js?v=6.45.5','./js/22-mobile-experience.js?v=6.45.5','./js/23-profile-import-review.js?v=6.45.5',
  './js/24-interconnections.js?v=6.45.5','./js/25-module-layout.js?v=6.45.5','./js/26-help-center.js?v=6.45.5',
  './js/borion-hub.js?v=6.45.5','./borion-emblem.png','./icon-192.png','./icon-512-maskable.png','./favicon-32.png','./borion.ico'
];

self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE_NAME).then(cache=>Promise.all(ASSETS.map(asset=>cache.add(asset).catch(()=>null)))).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});

function fetchWithTimeout(request,timeoutMs){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=controller?setTimeout(()=>controller.abort(),timeoutMs):null;
  return fetch(request,controller?{signal:controller.signal}:undefined).finally(()=>{if(timer)clearTimeout(timer);});
}
function cacheResponse(request,response){if(response&&response.ok){const copy=response.clone();caches.open(CACHE_NAME).then(cache=>cache.put(request,copy));}return response;}
function networkFirstDocument(request){return fetchWithTimeout(request,2500).then(response=>cacheResponse(request,response)).catch(()=>caches.match(request).then(cached=>cached||caches.match('./index.html')));}
function staleWhileRevalidate(request){return caches.match(request).then(cached=>{const network=fetch(request).then(response=>cacheResponse(request,response)).catch(()=>null);return cached||network;});}

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const request=event.request,url=new URL(request.url);
  // Google Drive, Identity, Picker, Supabase e qualquer outra origem externa nunca
  // passam pelo cache do PWA; dados financeiros remotos jamais são cacheados aqui.
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'||request.destination==='document'){event.respondWith(networkFirstDocument(request));return;}
  const versioned=['script','style','image','font','manifest'].includes(request.destination);
  if(versioned){event.respondWith(staleWhileRevalidate(request));return;}
  event.respondWith(fetch(request).then(response=>cacheResponse(request,response)).catch(()=>caches.match(request)));
});
