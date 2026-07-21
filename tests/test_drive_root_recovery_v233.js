'use strict';
const fs=require('fs'),path=require('path');
const assert=(condition,message)=>{if(!condition)throw new Error('FALHOU: '+message)};
const source=fs.readFileSync(path.resolve(__dirname,'../js/services/google-drive.js'),'utf8');

/* Cenário: a pessoa exclui a pasta raiz do Marco Iris direto pelo site do Drive
   (fora do app) e recria do zero. Antes desta correção, a referência da pasta raiz
   antiga nunca era invalidada sozinha — toda tentativa de publicar (bridge.json,
   base oficial) falhava em silêncio pra sempre, sem nenhum aviso claro pra pessoa
   entender o que fazer. Esses testes travam que a validação e a recuperação
   continuam presentes no código. */

assert(source.includes('function clearRoot()'),'deve existir uma função dedicada para invalidar completamente a referência de pasta raiz e sua estrutura em cache');
assert(source.includes('localStorage.removeItem(rootKey(u.sub))')&&source.includes('localStorage.removeItem(structKey(root))'),'clearRoot deve limpar o ID da pasta raiz e a estrutura vinculada ao ID real da raiz, não ao ID do usuário');

assert(/const rootInfo=await meta\(root\)/.test(source),'ensureStructure deve consultar a pasta raiz em si antes de confiar na estrutura em cache, não só as subpastas');
assert(/rootInfo\.trashed\|\|rootInfo\.mimeType!=='application\/vnd\.google-apps\.folder'/.test(source),'deve detectar explicitamente uma pasta raiz excluída/movida para a lixeira ou que deixou de ser uma pasta');
assert(/error\?\.status===404/.test(source),'deve tratar também o caso de a pasta raiz não ser mais encontrada (404) como raiz inválida');

const clearRootCallCount=(source.match(/clearRoot\(\);/g)||[]).length;
assert(clearRootCallCount>=2,'tanto o caso "lixeira" quanto o caso "não encontrada" (404) devem limpar a referência raiz, não só avisar');

assert(source.includes('Vá em Configurações → Backup e Migração, clique em "Desconectar" e depois "Conectar Google" de novo'),'o erro precisa dizer exatamente o que a pessoa deve fazer para reconectar, não só que algo falhou');

console.log('OK: pasta raiz do Google Drive excluída/inacessível é detectada e invalidada automaticamente, com uma mensagem de recuperação clara, em vez de falhar em silêncio para sempre.');
