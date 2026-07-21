'use strict';
const fs=require('fs'),path=require('path');
const assert=(condition,message)=>{if(!condition)throw new Error('FALHOU: '+message)};
const source=fs.readFileSync(path.resolve(__dirname,'../js/pts-completo.js'),'utf8');

/* "Resetar aplicativo por completo" precisa ser seguro por padrão: sempre pede
   confirmação dupla, sempre tenta fazer backup (local e JSON baixado) antes de
   apagar qualquer coisa, e nunca mexe no que já está salvo no Google Drive —
   só desconecta a referência local. */

assert(/async function factoryResetApp\(\)/.test(source),'deve existir a função dedicada de reset completo');

const fnMatch=source.match(/async function factoryResetApp\(\)\{[\s\S]*?\n  \}/);
assert(fnMatch,'não foi possível isolar o corpo da função factoryResetApp para conferir a ordem das etapas');
const body=fnMatch[0];

const confirmCount=(body.match(/await confirmAction\(/g)||[]).length;
assert(confirmCount>=2,'reset completo precisa de confirmação dupla (não pode ser um único clique acidental)');

assert(/MarcoStorage\.createBackup\(STATE,'antes-do-reset-completo'\)/.test(body),'deve criar um backup local automático antes de apagar tudo');
assert(/MarcoStorage\.downloadJson\(STATE/.test(body),'deve baixar um JSON local como segunda cópia de segurança antes de apagar');
assert(/GoogleDriveMarco\.disconnect\(\)/.test(body),'deve desconectar a referência local do Google Drive (sem apagar nada da nuvem)');
assert(/MarcoStorage\.wipeAll\(\)/.test(body),'deve apagar o banco IndexedDB completo, incluindo mídias, rascunhos e backups locais, e não só substituir o estado principal');
assert(/serviceWorker.*getRegistrations/.test(body)&&/caches\.keys\(\)/.test(body),'deve remover service worker e caches antigos para a nova instalação não herdar arquivos da versão anterior');
assert(/location\.replace\(/.test(body),'deve recarregar o app com uma URL limpa depois do reset');

// A ordem importa: backup ANTES de qualquer coisa ser apagada.
const backupIdx=body.indexOf('createBackup');
const wipeIdx=body.indexOf('wipeAll');
assert(backupIdx>=0&&wipeIdx>=0&&backupIdx<wipeIdx,'o backup precisa acontecer antes da base ser apagada, nunca depois');

console.log('OK: reset completo do aplicativo exige confirmação dupla, sempre faz backup antes de apagar, nunca mexe no que já está no Drive, e recarrega limpo no final.');
