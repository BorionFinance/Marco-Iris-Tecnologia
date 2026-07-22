/* Borion Finance — Coordenação entre abas (V6.40.2)
   Somente a líder executa rede. Followers persistem localmente e delegam. */
const BORION_TAB_CHANNEL_NAME='borion_sync_channel_v6402';
const BORION_LEADER_HEARTBEAT_MS=2500;
const BORION_LEADER_TIMEOUT_MS=8000;
const LS_BORION_LEASE='borion_sync_leader_lease_v6402';

const BorionMultiTab640={
  tabId:null,leader:false,_channel:null,_heartbeatTimer:null,_watchTimer:null,
  _onBecomeLeader:null,_onLoseLeader:null,_onPendingFromFollower:null,_onAccountUpdated:null,
  _lockRelease:null,_lockPending:false,_navigatorLocksDisabled:false,

  init(handlers={}){
    if(this.tabId) return this;
    this.tabId=(window.BorionSyncCore&&BorionSyncCore.uuid640)?BorionSyncCore.uuid640():String(Date.now())+'_'+Math.random();
    this._onBecomeLeader=handlers.onBecomeLeader||function(){};
    this._onLoseLeader=handlers.onLoseLeader||function(){};
    this._onPendingFromFollower=handlers.onPendingFromFollower||function(){};
    this._onAccountUpdated=handlers.onAccountUpdated||function(){};
    if(typeof BroadcastChannel!=='undefined'){
      this._channel=new BroadcastChannel(BORION_TAB_CHANNEL_NAME);
      this._channel.onmessage=ev=>this._handleMessage(ev.data);
    }
    this._watchTimer=setInterval(()=>this._tickElection(),BORION_LEADER_HEARTBEAT_MS);
    this._tickElection();
    if(typeof window!=='undefined'&&window.addEventListener){
      window.addEventListener('storage',ev=>{if(ev.key===LS_BORION_LEASE)this._tickElection();});
      window.addEventListener('beforeunload',()=>this.release());
      window.addEventListener('pagehide',()=>this.release());
    }
    return this;
  },

  isLeader(){ return !!this.leader; },
  _readLease(){
    try{const v=JSON.parse(localStorage.getItem(LS_BORION_LEASE)||'null');return v&&v.tabId?v:null;}catch(e){return null;}
  },
  _writeLease(lease){ try{localStorage.setItem(LS_BORION_LEASE,JSON.stringify(lease));return true;}catch(e){return false;} },
  _leaseValid(lease){ return !!(lease&&Number(lease.expiresAt)>Date.now()); },

  _canUseNavigatorLock(){
    return !this._navigatorLocksDisabled&&typeof navigator!=='undefined'&&navigator.locks&&typeof navigator.locks.request==='function';
  },

  async _tryNavigatorLock(){
    if(this._lockPending||this.leader||!this._canUseNavigatorLock()) return;
    this._lockPending=true;
    try{
      await navigator.locks.request('borion_sync_leader_v6402',{mode:'exclusive',ifAvailable:true},lock=>{
        if(!lock) return undefined;
        this._becomeLeader('navigator.locks');
        return new Promise(resolve=>{this._lockRelease=resolve;});
      });
    }catch(e){
      this._navigatorLocksDisabled=true;
      console.warn('[BorionMultiTab640] navigator.locks falhou; usando lease.',e);
      // A próxima eleição usa o fallback. Não tenta os dois mecanismos ao mesmo
      // tempo, pois isso poderia produzir uma líder por lock e outra por lease.
      setTimeout(()=>this._tickElection(),0);
    }finally{this._lockPending=false;}
  },

  _claimLease(){
    const now=Date.now(),current=this._readLease();
    if(this._leaseValid(current)&&current.tabId!==this.tabId) return false;
    const candidate={tabId:this.tabId,expiresAt:now+BORION_LEADER_TIMEOUT_MS,nonce:(window.BorionSyncCore?BorionSyncCore.uuid640():String(Math.random()))};
    if(!this._writeLease(candidate)) return false;
    const confirmed=this._readLease();
    if(confirmed&&confirmed.tabId===this.tabId&&confirmed.nonce===candidate.nonce){this._becomeLeader('lease');return true;}
    return false;
  },

  _tickElection(){
    if(this.leader){
      const lease=this._readLease();
      if(lease&&lease.tabId!==this.tabId&&this._leaseValid(lease)){this._loseLeader('lease_replaced');return;}
      this._writeLease({tabId:this.tabId,expiresAt:Date.now()+BORION_LEADER_TIMEOUT_MS,nonce:(lease&&lease.nonce)||this.tabId});
      this._broadcast({type:'leader_heartbeat',tabId:this.tabId,expiresAt:Date.now()+BORION_LEADER_TIMEOUT_MS});
      return;
    }
    if(this._canUseNavigatorLock()){
      // navigator.locks é a autoridade exclusiva quando disponível. Nunca disputa
      // simultaneamente o lease localStorage, evitando duas líderes transitórias.
      this._tryNavigatorLock();
      return;
    }
    const lease=this._readLease();
    if(!this._leaseValid(lease)) this._claimLease();
  },

  _becomeLeader(reason){
    if(this.leader) return;
    this.leader=true;
    this._writeLease({tabId:this.tabId,expiresAt:Date.now()+BORION_LEADER_TIMEOUT_MS,nonce:this.tabId});
    this._broadcast({type:'leader_announce',tabId:this.tabId,reason});
    try{this._onBecomeLeader({reason,tabId:this.tabId});}catch(e){console.error(e);}
  },
  _loseLeader(reason){
    if(!this.leader) return;
    this.leader=false;
    if(this._lockRelease){const r=this._lockRelease;this._lockRelease=null;try{r();}catch(e){}}
    try{this._onLoseLeader({reason,tabId:this.tabId});}catch(e){console.error(e);}
  },
  _handleMessage(msg){
    if(!msg||msg.tabId===this.tabId) return;
    if((msg.type==='leader_announce'||msg.type==='leader_heartbeat')&&this.leader){
      const lease=this._readLease();
      if(lease&&lease.tabId!==this.tabId&&this._leaseValid(lease)) this._loseLeader('other_leader_confirmed');
    }
    if(msg.type==='sync_request'&&this.leader){try{this._onPendingFromFollower(msg);}catch(e){console.error(e);}}
    if(msg.type==='account_snapshot_applied'){try{this._onAccountUpdated(msg);}catch(e){console.error(e);}}
  },
  _broadcast(msg){if(this._channel)try{this._channel.postMessage(msg);}catch(e){}},
  requestSync(meta={}){
    if(this.leader){try{this._onPendingFromFollower(Object.assign({type:'sync_request',tabId:this.tabId,self:true},meta));}catch(e){}return true;}
    this._broadcast(Object.assign({type:'sync_request',tabId:this.tabId},meta));return false;
  },
  notifyPending(meta={}){return this.requestSync(meta);},
  notifyAccountUpdated(meta={}){this._broadcast(Object.assign({type:'account_snapshot_applied',tabId:this.tabId,at:Date.now()},meta));},
  release(){
    if(this.leader){const lease=this._readLease();if(lease&&lease.tabId===this.tabId)try{localStorage.removeItem(LS_BORION_LEASE);}catch(e){}}
    this._loseLeader('release');
    if(this._channel){try{this._channel.close();}catch(e){}this._channel=null;}
    if(this._watchTimer){clearInterval(this._watchTimer);this._watchTimer=null;}
  }
};
window.BorionMultiTab640=BorionMultiTab640;
