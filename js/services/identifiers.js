(() => {
  'use strict';

  const OFFICIAL_PREFIXES = Object.freeze(['OSV','CLI','PRD','SRV','INS','ITM','MOV','REC','DES','AGE','TER']);
  const PREFIX_ALIASES = Object.freeze({
    OS:'OSV', OAS:'OSV', OSV:'OSV',
    CLI:'CLI',
    PRB:'PRD', PRD:'PRD',
    SRV:'SRV',
    INS:'INS',
    ITM:'ITM',
    MOV:'MOV',
    REC:'REC',
    DESP:'DES', DES:'DES',
    AGE:'AGE',
    TER:'TER'
  });
  const OFFICIAL_PATTERN = /^[A-Z]{3}-\d{6}$/;

  function normalizePrefix(prefix){
    const value=String(prefix||'').trim().toUpperCase();
    return PREFIX_ALIASES[value]||value;
  }

  function sequenceFrom(value){
    if(value===null||value===undefined)return null;
    if(typeof value==='number'&&Number.isFinite(value))return Math.trunc(value);
    const digits=String(value).replace(/\D/g,'');
    if(!digits)return null;
    const sequence=Number(digits);
    return Number.isSafeInteger(sequence)?sequence:null;
  }

  function formatEntityCode(prefix,sequence){
    const normalizedPrefix=normalizePrefix(prefix);
    const numeric=Number(sequence);
    if(!OFFICIAL_PREFIXES.includes(normalizedPrefix))throw new Error(`Prefixo de identificador inválido: ${prefix}`);
    if(!Number.isInteger(numeric)||numeric<0||numeric>999999)throw new Error(`Sequência inválida para ${normalizedPrefix}.`);
    return `${normalizedPrefix}-${String(numeric).padStart(6,'0')}`;
  }

  function parseEntityCode(value,expectedPrefix=''){
    const raw=String(value??'').trim();
    if(!raw)return null;
    const expected=expectedPrefix?normalizePrefix(expectedPrefix):'';
    const upper=raw.toUpperCase();
    const prefixMatch=upper.match(/^\s*([A-Z]{2,4})/);
    const detected=prefixMatch?normalizePrefix(prefixMatch[1]):'';
    const prefix=expected||detected;
    if(!prefix||!OFFICIAL_PREFIXES.includes(prefix))return null;
    if(expected&&detected&&detected!==expected)return null;

    let numberSource=upper;
    if(prefixMatch)numberSource=upper.slice(prefixMatch[0].length);
    const digits=numberSource.replace(/\D/g,'');
    if(!digits||digits.length>9)return null;
    const sequence=Number(digits);
    if(!Number.isInteger(sequence)||sequence<0||sequence>999999)return null;
    return {raw,prefix,sequence,canonical:formatEntityCode(prefix,sequence),official:OFFICIAL_PATTERN.test(upper)};
  }

  function normalizeEntityCode(value,expectedPrefix=''){
    const parsed=parseEntityCode(value,expectedPrefix);
    return parsed?parsed.canonical:'';
  }

  function getNextEntityCode(prefix,collection=[],field='id',highWatermark=0){
    const normalizedPrefix=normalizePrefix(prefix);
    let max=Math.max(0,Number(highWatermark)||0);
    for(const item of collection||[]){
      const raw=typeof item==='string'?item:(item?.[field]??item?.id??item?.code);
      const parsed=parseEntityCode(raw,normalizedPrefix);
      if(parsed)max=Math.max(max,parsed.sequence);
    }
    if(max>=999999)throw new Error(`A sequência de ${normalizedPrefix} atingiu o limite de 999999.`);
    return formatEntityCode(normalizedPrefix,max+1);
  }

  function extractEntityCode(value,expectedPrefix=''){
    const text=String(value||'');
    const aliases=expectedPrefix
      ? Object.keys(PREFIX_ALIASES).filter(key=>PREFIX_ALIASES[key]===normalizePrefix(expectedPrefix))
      : Object.keys(PREFIX_ALIASES);
    const prefixPart=aliases.sort((a,b)=>b.length-a.length).join('|');
    const re=new RegExp(`(?:${prefixPart})[\\s_\\-/:]*(?:\\d[\\s_\\-]*){1,9}`,'i');
    const match=text.match(re);
    if(!match)return '';
    return normalizeEntityCode(match[0],expectedPrefix||'');
  }

  function codeMatches(value,query,expectedPrefix=''){
    const canonical=normalizeEntityCode(value,expectedPrefix);
    if(!canonical)return false;
    const raw=String(query||'').trim();
    if(!raw)return true;
    const queryCanonical=normalizeEntityCode(raw,expectedPrefix);
    if(queryCanonical)return canonical===queryCanonical;
    const digits=raw.replace(/\D/g,'');
    return digits?canonical.endsWith(digits.padStart(Math.min(6,digits.length),'0')):canonical.includes(raw.toUpperCase());
  }

  window.MarcoIdentifiers={
    OFFICIAL_PREFIXES,
    PREFIX_ALIASES,
    OFFICIAL_PATTERN,
    normalizePrefix,
    sequenceFrom,
    formatEntityCode,
    parseEntityCode,
    normalizeEntityCode,
    getNextEntityCode,
    extractEntityCode,
    codeMatches
  };
})();
