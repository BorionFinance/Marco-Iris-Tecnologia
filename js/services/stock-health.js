(() => {
  'use strict';
  function getStockHealth(stock,minimumStock){
    const current=Number(stock);const minRaw=minimumStock;
    if(minRaw===''||minRaw===null||minRaw===undefined||!Number.isFinite(Number(minRaw)))return {level:'unset',label:'Mínimo não configurado',tone:'neutral',priority:4};
    const minimum=Number(minRaw);if(!Number.isFinite(current))return {level:'unset',label:'Mínimo não configurado',tone:'neutral',priority:4};
    if(current<=minimum)return {level:'critical',label:'Crítico',tone:'danger',priority:current<0?0:current===0?1:2};
    if(current-minimum<=1)return {level:'warning',label:'Atenção',tone:'warn',priority:3};
    return {level:'normal',label:'Normal',tone:'ok',priority:5};
  }
  window.MarcoStockHealth={getStockHealth};
})();
