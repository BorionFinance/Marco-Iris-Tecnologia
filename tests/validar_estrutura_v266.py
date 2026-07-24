import json, subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
checks=[]
def check(name,ok,detail=''):
    checks.append({'name':name,'ok':bool(ok),'detail':detail})

required=['index.html','manifest.json','sw.js','js/app.js','js/v255-marco-review.js','js/services/google-drive.js','js/services/borion-interop-source.js']
for rel in required:
    check(f'Arquivo obrigatório: {rel}',(ROOT/rel).is_file())

for path in sorted((ROOT/'js').rglob('*.js')):
    proc=subprocess.run(['node','--check',str(path)],capture_output=True,text=True)
    check(f'Sintaxe JavaScript: {path.relative_to(ROOT)}',proc.returncode==0,(proc.stderr or proc.stdout).strip())

app=(ROOT/'js/app.js').read_text(encoding='utf-8')
v255=(ROOT/'js/v255-marco-review.js').read_text(encoding='utf-8')
index=(ROOT/'index.html').read_text(encoding='utf-8')
manifest=json.loads((ROOT/'manifest.json').read_text(encoding='utf-8'))
sw=(ROOT/'sw.js').read_text(encoding='utf-8')
result=json.loads((ROOT/'RESULTADO_EXCLUSAO_INSTANTANEA_20X_V2_6_6.json').read_text(encoding='utf-8'))

branch=app[app.index("if(a==='delete-payment')"):app.index("if(a==='new-appointment')")]
check('Remoção visual ocorre antes da chamada de persistência',branch.index("renderView('none')")<branch.index("persist('Lançamento excluído definitivamente'"))
check('Exclusão pendente aplicada na normalização','applyPendingPaymentDeletions(STATE);' in app)
check('Fila única de escrita na nuvem','serializeCloudWrite' in app and 'serializeCloudWrite(()=>flushCloudState' in v255)
check('Confirmação limpa marcador pendente','confirmPendingPaymentDeletions(LAST_CONFIRMED_STATE)' in v255)
check('Fila v2.5.5 preserva backup/opções','options:{backup:!!opts.backup,media:opts.media!==false}' in v255)
check('Estado não sincronizado bloqueia atualização remota','PENDING_PAYMENT_DELETIONS.size>0' in v255)
check('Versão do manifesto é 2.6.6',manifest.get('version')=='2.6.6')
check('Cache PWA é 2.6.6','marco-iris-v2.6.6-cloud-only' in sw)
check('Assets usam cache-busting 2.6.6','?v=2.6.6' in index and '?v=2.6.5' not in index)
check('Validação funcional 20/20',result.get('allPassed') is True and result.get('passed')==20 and result.get('total')==20)

out={'version':'2.6.6','passed':sum(x['ok'] for x in checks),'total':len(checks),'allPassed':all(x['ok'] for x in checks),'checks':checks}
(ROOT/'RESULTADO_VALIDACAO_ESTRUTURAL_V2_6_6.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({k:out[k] for k in ('version','passed','total','allPassed')},ensure_ascii=False,indent=2))
raise SystemExit(0 if out['allPassed'] else 1)
