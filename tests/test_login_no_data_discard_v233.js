'use strict';
const fs=require('fs'),vm=require('vm'),path=require('path');
const assert=(condition,message)=>{if(!condition)throw new Error('FALHOU: '+message)};

const source=fs.readFileSync(path.resolve(__dirname,'../js/services/google-drive.js'),'utf8');
const context={console,crypto:global.crypto,TextEncoder,Blob,setTimeout,clearTimeout};
context.window=context;context.globalThis=context;
context.localStorage={getItem(){return null;},setItem(){},removeItem(){}};
context.MarcoStorage={async save(state){return state;}};
vm.createContext(context);vm.runInContext(source,context,{filename:'google-drive.js'});
const decide=context.GoogleDriveMarco.__test.decideOfficialSource;

/* ---------- cenário real do bug relatado: apagou um lançamento localmente,
   recarregou/logou de novo antes do autosave para o Drive (~1.9s) terminar.
   A revisão local ainda é IGUAL à da nuvem (não deu tempo de subir a nova),
   então a base local (já sem o lançamento excluído) tem que vencer. ---------- */
{
  const local={appId:'marco-iris-tecnologia',driveSync:{revision:5},interconnections:{borion:{companyInstanceId:'empresa-1'}},dataByProfile:{p:{payments:[]}}};
  const remote={appId:'marco-iris-tecnologia',driveSync:{revision:5},interconnections:{borion:{companyInstanceId:'empresa-1'}},dataByProfile:{p:{payments:[{id:'REC-1'}]}}};
  const result=decide(local,remote);
  assert(result.useRemote===false,'com revisões iguais, a base local (mais recente ou igual) deve vencer — nunca ressuscitar o que acabou de ser excluído');
}

/* ---------- login normal em outro dispositivo/sessão: o Drive já recebeu uma
   revisão mais nova que a local (ex.: editou no celular e abriu no PC depois
   sem ter feito nada localmente). Aí sim a base do Drive deve prevalecer. ---------- */
{
  const local={appId:'marco-iris-tecnologia',driveSync:{revision:5},interconnections:{borion:{companyInstanceId:'empresa-1'}}};
  const remote={appId:'marco-iris-tecnologia',driveSync:{revision:7},interconnections:{borion:{companyInstanceId:'empresa-1'}}};
  const result=decide(local,remote);
  assert(result.useRemote===true,'quando o Drive tem uma revisão genuinamente mais nova, ele deve prevalecer (sincronização normal entre dispositivos)');
  assert(result.foreignInstance===false,'mesma companyInstanceId não pode ser sinalizada como instância estranha');
}

/* ---------- perfil de teste recém-criado (sem companyInstanceId ainda) não pode
   ser tratado como "instância estranha" que trava a decisão — só a revisão manda. ---------- */
{
  const local={appId:'marco-iris-tecnologia',driveSync:{revision:0},interconnections:{}};
  const remote={appId:'marco-iris-tecnologia',driveSync:{revision:3},interconnections:{borion:{companyInstanceId:'empresa-1'}}};
  const result=decide(local,remote);
  assert(result.useRemote===true,'perfil local sem revisão própria ainda deve ceder para a base já existente no Drive');
  assert(result.foreignInstance===false,'ausência de companyInstanceId local não deve gerar aviso de instância estranha (ainda não tem identidade própria)');
}

/* ---------- instância realmente diferente (outra empresa/instalação) com
   revisão local mais alta: continua vencendo pela revisão, mas com o aviso
   informativo de instância diferente. ---------- */
{
  const local={appId:'marco-iris-tecnologia',driveSync:{revision:10},interconnections:{borion:{companyInstanceId:'empresa-2'}}};
  const remote={appId:'marco-iris-tecnologia',driveSync:{revision:4},interconnections:{borion:{companyInstanceId:'empresa-1'}}};
  const result=decide(local,remote);
  assert(result.useRemote===false,'revisão local mais alta ainda deve vencer mesmo com instância diferente — a decisão nunca descarta silenciosamente');
  assert(result.foreignInstance===true,'deve sinalizar que as instâncias divergem, para fins de aviso (não de descarte automático)');
}

console.log('OK: login no Google Drive nunca mais descarta silenciosamente alterações locais mais recentes (ou iguais) que a nuvem — decide sempre pela revisão, como o botão Sincronizar já fazia.');
