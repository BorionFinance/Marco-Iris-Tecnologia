(() => {
  'use strict';

  const VALID_DDDS=new Set([11,12,13,14,15,16,17,18,19,21,22,24,27,28,31,32,33,34,35,37,38,41,42,43,44,45,46,47,48,49,51,53,54,55,61,62,63,64,65,66,67,68,69,71,73,74,75,77,79,81,82,83,84,85,86,87,88,89,91,92,93,94,95,96,97,98,99]);
  // DDD padrão da região do Marco. Quando o cliente digita o telefone sem DDD (8 ou 9 dígitos),
  // este código é adicionado automaticamente. O usuário pode sempre sobrescrever digitando o DDD
  // (ou o código de país) diretamente.
  const DEFAULT_DDD='17';

  function digitsOnly(value){return String(value??'').replace(/\D/g,'');}
  function invalid(original,error,digits=''){return {valid:false,error,original:String(original??''),digits};}

  function normalizeBrazilianPhone(value){
    const original=String(value??'').trim();
    if(!original)return invalid(original,'Informe um telefone com DDD.');

    // Código de país estrangeiro digitado explicitamente (ex.: +308...). Nesse caso não forçamos
    // o Brasil (+55): o número é aceito como internacional, exatamente como foi digitado.
    if(original.startsWith('+')){
      const foreignDigits=digitsOnly(original);
      if(foreignDigits&&!foreignDigits.startsWith('55')){
        if(foreignDigits.length<8)return invalid(original,'Informe um telefone internacional válido.',foreignDigits);
        const formatted=`+${foreignDigits}`;
        return {valid:true,type:'international',countryCode:'',areaCode:'',nationalNumber:foreignDigits,nationalDigits:foreignDigits,normalizedDigits:foreignDigits,e164:formatted,formatted,original};
      }
    }

    let digits=digitsOnly(original);
    if(!digits)return invalid(original,'Informe um telefone com DDD.');
    if(digits.startsWith('0055'))digits=digits.slice(2);

    let national='';
    if((digits.length===12||digits.length===13)&&digits.startsWith('55'))national=digits.slice(2);
    else if((digits.length===10||digits.length===11))national=digits;
    else if((digits.length===11||digits.length===12)&&digits.startsWith('0')){
      const candidate=digits.slice(1);
      const ddd=Number(candidate.slice(0,2));
      if((candidate.length===10||candidate.length===11)&&VALID_DDDS.has(ddd))national=candidate;
    }
    // Sem DDD: assume automaticamente o DDD padrão da região (17). O usuário pode revisar e trocar
    // livremente antes de salvar, ou já digitar o DDD/código de país desejado desde o início.
    else if(digits.length===8||digits.length===9)national=DEFAULT_DDD+digits;

    if(!national){
      if(digits.length<10)return invalid(original,'Informe um telefone com DDD.',digits);
      return invalid(original,'O telefone possui mais dígitos que o permitido. Revise o número.',digits);
    }
    if(![10,11].includes(national.length))return invalid(original,'Informe um telefone com DDD.',digits);

    const areaCode=national.slice(0,2),ddd=Number(areaCode),subscriber=national.slice(2);
    if(!VALID_DDDS.has(ddd))return invalid(original,'Informe um DDD brasileiro válido.',digits);
    if(national.length===11&&subscriber[0]!=='9')return invalid(original,'Celular com 11 dígitos deve começar com 9 após o DDD.',digits);

    const type=national.length===11?'mobile':'landline';
    const formatted=type==='mobile'
      ? `+55 (${areaCode}) ${subscriber.slice(0,5)}-${subscriber.slice(5)}`
      : `+55 (${areaCode}) ${subscriber.slice(0,4)}-${subscriber.slice(4)}`;
    const normalizedDigits=`55${national}`;
    return {
      valid:true,
      type,
      countryCode:'55',
      areaCode,
      nationalNumber:subscriber,
      nationalDigits:national,
      normalizedDigits,
      e164:`+${normalizedDigits}`,
      formatted,
      original
    };
  }

  function formatBrazilianPhone(value){const result=normalizeBrazilianPhone(value);return result.valid?result.formatted:String(value??'');}
  function whatsappDigits(value){const result=normalizeBrazilianPhone(value);return result.valid?result.normalizedDigits:'';}
  function maskPhoneForLog(value){const result=normalizeBrazilianPhone(value);if(!result.valid)return 'telefone inválido';if(result.type==='international')return `+*** ****${result.nationalNumber.slice(-4)}`;const tail=result.nationalNumber.slice(-4);return `+55 (${result.areaCode}) ${result.type==='mobile'?'9':'*'}****-${tail}`;}

  window.MarcoPhone={VALID_DDDS,DEFAULT_DDD,digitsOnly,normalizeBrazilianPhone,formatBrazilianPhone,whatsappDigits,maskPhoneForLog};
})();
