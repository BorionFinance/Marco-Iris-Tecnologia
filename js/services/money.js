(() => {
  'use strict';
  const MONEY_NAMES=new Set(['price','cost','salePrice','newCost','newPrice','value','fee','discount','unitPrice','subtotal','grossValue','netValue','amount','total']);
  const moneyClass=/\b(money|currency|price|cost|value|fee|discount|total|subtotal)\b/i;
  const digits=value=>String(value??'').replace(/\D/g,'');
  function parseToCents(value,{plainDigitsAreCents=false}={}){
    if(typeof value==='number'&&Number.isFinite(value))return Math.round(value*100);
    const raw=String(value??'').trim();if(!raw)return 0;
    if(plainDigitsAreCents&&/^\d+$/.test(raw))return Number(raw)||0;
    const clean=raw.replace(/R\$/gi,'').replace(/\s/g,'');
    if(/^[-+]?\d+$/.test(clean))return plainDigitsAreCents?(Number(clean)||0):Math.round((Number(clean)||0)*100);
    let normalized=clean;
    const comma=normalized.lastIndexOf(','),dot=normalized.lastIndexOf('.');
    if(comma>=0&&comma>dot)normalized=normalized.replace(/\./g,'').replace(',','.');
    else if(dot>=0&&dot>comma){
      const decimals=normalized.length-dot-1;
      normalized=decimals===3&&normalized.indexOf('.')===dot?normalized.replace(/\./g,''):normalized.replace(/,/g,'');
    }
    normalized=normalized.replace(/[^\d.-]/g,'');
    const n=Number(normalized);return Number.isFinite(n)?Math.round(n*100):0;
  }
  const parseNumber=value=>parseToCents(value)/100;
  const formatCents=cents=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format((Number(cents)||0)/100);
  const formatNumber=value=>formatCents(Math.round((Number(value)||0)*100));
  function isMoneyInput(input){
    if(!(input instanceof HTMLInputElement))return false;
    if(input.dataset.money==='true'||input.matches('[data-money-input]'))return true;
    if(input.dataset.money==='false')return false;
    const name=input.name||input.dataset.paymentField||input.dataset.itemField||'';
    if(MONEY_NAMES.has(name)||moneyClass.test(name))return true;
    const label=input.closest('label,.field,.money-field')?.textContent||'';
    return /valor|preço|custo|taxa|desconto|subtotal|total/i.test(label)&&!/quantidade|estoque|margem|telefone|cep|cpf|cnpj/i.test(label);
  }
  function setCents(input,cents,{touch=false}={}){
    if(!input)return;const safe=Math.max(0,Math.round(Number(cents)||0));input.dataset.moneyCents=String(safe);input.value=formatCents(safe);if(touch)input.dataset.moneyTouched='true';
  }
  const getCents=input=>input?Math.max(0,Math.round(Number(input.dataset.moneyCents||parseToCents(input.value))||0)):0;
  const getValue=input=>getCents(input)/100;
  const setValue=(input,value,opts)=>setCents(input,Math.round((Number(value)||0)*100),opts);
  function bind(input){
    if(!isMoneyInput(input)||input.dataset.moneyBound==='true')return input;
    input.dataset.moneyBound='true';input.dataset.money='true';input.type='text';input.inputMode='numeric';input.autocomplete='off';
    setCents(input,parseToCents(input.value));
    input.addEventListener('focus',()=>{requestAnimationFrame(()=>input.setSelectionRange(input.value.length,input.value.length));});
    input.addEventListener('keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey||['Tab','Enter','Escape','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
      if(/^\d$/.test(event.key)){event.preventDefault();const current=digits(input.value),next=(current==='000'?event.key:current+event.key).replace(/^0+(?=\d)/,'');setCents(input,Number(next)||0,{touch:true});input.dispatchEvent(new Event('input',{bubbles:true}));return;}
      if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();const current=digits(input.value),next=current.slice(0,-1);setCents(input,Number(next)||0,{touch:true});input.dispatchEvent(new Event('input',{bubbles:true}));return;}
      event.preventDefault();
    });
    input.addEventListener('paste',event=>{event.preventDefault();const text=event.clipboardData?.getData('text')||'';const hasDecimal=/[,.]\d{1,2}\s*$/.test(text)||/R\$/i.test(text);setCents(input,parseToCents(text,{plainDigitsAreCents:!hasDecimal}),{touch:true});input.dispatchEvent(new Event('input',{bubbles:true}));});
    input.addEventListener('input',()=>{
      if(input.dataset.moneyInternal==='true')return;
      const cents=parseToCents(input.value,{plainDigitsAreCents:true});input.dataset.moneyInternal='true';setCents(input,cents,{touch:true});input.dataset.moneyInternal='false';
    });
    return input;
  }
  function bindAll(root=document){
    const nodes=[];if(root instanceof HTMLInputElement)nodes.push(root);root?.querySelectorAll?.('input').forEach(x=>nodes.push(x));nodes.filter(isMoneyInput).forEach(bind);return nodes;
  }
  window.MarcoMoney={parseToCents,parseNumber,formatCents,formatNumber,isMoneyInput,bind,bindAll,getCents,getValue,setCents,setValue};
})();
