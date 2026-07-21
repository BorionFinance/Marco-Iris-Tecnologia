(function(){
  'use strict';
  const APP = "marco";
  const HUB_URL = "https://borionfinance.github.io/Borion-Hub/";
  const LOGIN_SELECTOR = ".login-screen";
  const SETTINGS_SELECTOR = ".nav-btn[data-view=\"settings\"]";
  const MENU_CLASS = "nav-btn";
  const HOUSE = "<svg viewBox=\"0 0 24 24\" aria-hidden=\"true\" focusable=\"false\"><path d=\"M3.5 10.8 12 3.9l8.5 6.9\"/><path d=\"M5.8 9.5v10.1h12.4V9.5\"/><path d=\"M9.6 19.6v-5.9h4.8v5.9\"/></svg>";

  document.documentElement.dataset.borionApp = APP;

  function makeLoginLink(){
    const a=document.createElement('a');
    a.className='borion-hub-entry borion-hub-entry--login';
    a.href=HUB_URL;
    a.target='_self';
    a.setAttribute('aria-label','Abrir Hub Borion');
    a.title='Abrir Hub Borion';
    a.innerHTML=HOUSE+'<span>Hub Borion</span>';
    return a;
  }

  function makeMenuLink(){
    const a=document.createElement('a');
    a.className=MENU_CLASS+' borion-hub-entry borion-hub-menu';
    a.href=HUB_URL;
    a.target='_self';
    a.setAttribute('aria-label','Abrir Hub Borion');
    a.title='Abrir Hub Borion';
    if(APP==='borion') a.innerHTML='<span class="ic">'+HOUSE+'</span><span class="sb-label borion-hub-menu-label">Hub Borion</span>';
    else a.innerHTML=HOUSE+'<span class="borion-hub-menu-label">Hub Borion</span>';
    return a;
  }

  function inject(){
    const login=document.querySelector(LOGIN_SELECTOR);
    if(login && !document.querySelector('.borion-hub-entry--login')) login.appendChild(makeLoginLink());

    const settings=document.querySelector(SETTINGS_SELECTOR);
    if(settings && !document.querySelector('.borion-hub-menu')) settings.insertAdjacentElement('afterend',makeMenuLink());
  }

  let queued=false;
  const schedule=()=>{
    if(queued)return;
    queued=true;
    requestAnimationFrame(()=>{queued=false;inject();});
  };
  const root=document.getElementById('root');
  if(root)new MutationObserver(schedule).observe(root,{childList:true,subtree:true});
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});
  else schedule();
})();
