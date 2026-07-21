'use strict';
const fs=require('fs'),path=require('path');
const assert=(condition,message)=>{if(!condition)throw new Error('FALHOU: '+message)};
const source=fs.readFileSync(path.resolve(__dirname,'../js/services/google-drive.js'),'utf8');

/* Cenário: logo após um reset manual (pastas do Drive recriadas, base local
   vazia), a decisão por revisão (decideOfficialSource) pode mandar enviar a base
   local — mas ela está vazia e o Drive ainda tem dados reais de antes. O guard de
   segurança (assertSafeReplacement, dentro de saveDataFile) corretamente recusa
   apagar o Drive... só que isso não pode travar o LOGIN inteiro. Precisa cair de
   volta para carregar a base existente do Drive, não travar a pessoa fora do app. */

assert(/catch\(pushError\)/.test(source),'initializeOfficialState deve capturar uma falha ao tentar enviar a base local, em vez de deixar o login inteiro quebrar');
assert(/\['EMPTY_BASE_BLOCKED','SUSPICIOUS_DROP'\]\.includes\(pushError\?\.code\)/.test(source),'deve reconhecer especificamente os dois códigos de guard de segurança de dados (base vazia / queda suspeita) como recuperáveis no login');
assert(/return \{state:remote\.state,created:false,source:'drive',user:conn\.user,discardedLocalInstance:false,localPushBlocked:pushError\.code\}/.test(source),'ao cair nesse caso, deve carregar a base do Drive (que tem os dados reais) em vez de travar o login');
assert(/throw pushError;/.test(source),'qualquer outro erro (rede, permissão) que não seja o guard de segurança de dados deve continuar sendo repassado normalmente, sem mascarar problemas reais');

console.log('OK: um bloqueio de segurança (base local vazia) ao tentar enviar dados durante o login não trava mais o login inteiro — cai de volta para carregar a base existente do Drive.');
