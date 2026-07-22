/* Borion Finance 6.42.0 — guarda de edição real + fila de atualização remota. */
(function(global){
  'use strict';
  const dirtyForms=new Set();
  let lastDirtyAt=0;
  function formIdFor(el){const host=el&&el.closest&&el.closest('[data-borion-form-id],form,.modal-overlay');if(!host)return null;return host.dataset&&host.dataset.borionFormId||host.id||('modal_'+Array.from(document.querySelectorAll('.modal-overlay')).indexOf(host));}
  function isSearchOrFilter(el){if(!el)return false;const hay=((el.id||'')+' '+(el.name||'')+' '+(el.className||'')+' '+(el.getAttribute&&el.getAttribute('placeholder')||'')).toLowerCase();return el.type==='search'||/search|busca|pesquis|filter|filtro|orden|sort|month|mes|year|ano/.test(hay);}
  const BorionEditGuard={
    markDirty(formId){if(!formId)return;dirtyForms.add(String(formId));lastDirtyAt=Date.now();this._notify();},
    markClean(formId){if(formId)dirtyForms.delete(String(formId));else dirtyForms.clear();this._notify();},
    isDirty(formId){return formId?dirtyForms.has(String(formId)):dirtyForms.size>0;},
    isSafeForRemoteApply(){return dirtyForms.size===0;},
    dirtyForms(){return Array.from(dirtyForms);},
    _notify(){try{global.dispatchEvent(new CustomEvent('borion-edit-guard-change',{detail:{dirty:this.isDirty(),forms:this.dirtyForms()}}));}catch(_e){}}
  };

  const RemoteUpdateQueue={
    pending:null,applyHandler:null,canApplyHandler:null,_timer:null,_noticeAt:0,
    setApplyHandler(fn){this.applyHandler=fn;},
    setCanApplyHandler(fn){this.canApplyHandler=typeof fn==='function'?fn:null;},
    enqueue(snapshot,meta={}){this.pending={snapshot,meta,receivedAt:Date.now()};if(global.BorionSyncState)BorionSyncState.set('REMOTE_CHANGED',{queued:true,receivedAt:this.pending.receivedAt});if(Date.now()-this._noticeAt>8000){this._noticeAt=Date.now();try{if(typeof global.toast==='function')toast('Atualização recebida — será aplicada após finalizar a edição.');}catch(_e){}}this._schedule();return this.pending;},
    hasPending(){return !!this.pending;},
    clear(){this.pending=null;if(this._timer){clearTimeout(this._timer);this._timer=null;}},
    _schedule(delay=700){if(this._timer)clearTimeout(this._timer);this._timer=setTimeout(()=>{this._timer=null;this.applyIfSafe();},delay);},
    async applyIfSafe(){if(!this.pending)return false;if(!BorionEditGuard.isSafeForRemoteApply()){this._schedule(900);return false;}if(this.canApplyHandler){let externallySafe=false;try{externallySafe=await this.canApplyHandler();}catch(_e){externallySafe=false;}if(!externallySafe){this._schedule(900);return false;}}if(typeof this.applyHandler!=='function')return false;const item=this.pending;this.pending=null;try{await this.applyHandler(item.snapshot,item.meta);return true;}catch(e){this.pending=item;this._schedule(1500);return false;}}
  };

  function installCapture(){if(!global.document||document.__borionEditGuardInstalled)return;document.__borionEditGuardInstalled=true;
    document.addEventListener('input',e=>{const el=e.target;if(!el||isSearchOrFilter(el))return;const id=formIdFor(el);if(id)BorionEditGuard.markDirty(id);},true);
    document.addEventListener('change',e=>{const el=e.target;if(!el||isSearchOrFilter(el))return;const id=formIdFor(el);if(id)BorionEditGuard.markDirty(id);},true);
    document.addEventListener('click',e=>{const btn=e.target&&e.target.closest&&e.target.closest('button,[role="button"]');if(!btn)return;const text=((btn.id||'')+' '+(btn.className||'')+' '+(btn.textContent||'')).toLowerCase();if(/salvar|confirmar|concluir|cancelar|fechar|close|voltar/.test(text)){const id=formIdFor(btn);if(id)BorionEditGuard.markClean(id);setTimeout(()=>RemoteUpdateQueue.applyIfSafe(),0);}},true);
    document.addEventListener('focusout',()=>setTimeout(()=>RemoteUpdateQueue.applyIfSafe(),120),true);
    global.addEventListener('borion-edit-guard-change',()=>RemoteUpdateQueue.applyIfSafe());
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCapture,{once:true});else installCapture();
  global.BorionEditGuard=BorionEditGuard;global.RemoteUpdateQueue=RemoteUpdateQueue;
})(window);
