from pathlib import Path
import re, sys
ROOT=Path(__file__).resolve().parents[1]
css260=(ROOT/'css/v260-layout-unificado.css').read_text(encoding='utf-8')
css256=(ROOT/'css/v256-final-adjustments.css').read_text(encoding='utf-8')
css259=(ROOT/'css/v259-layout-livre.css').read_text(encoding='utf-8')
js=(ROOT/'js/v256-final-adjustments.js').read_text(encoding='utf-8')
legacy=(ROOT/'js/pts-completo.js').read_text(encoding='utf-8')
checks={
  'texto Arraste removido da pseudo-faixa v260':'content:"Arraste"' not in css260,
  'texto Arraste removido da pseudo-faixa v256':'content:"Arraste"' not in css256,
  'texto Arraste removido do controle legado':'⋮⋮ Arraste' not in legacy,
  'pseudo-faixa explicitamente desativada':'content:none!important' in css260 and 'display:none!important' in css260,
  'padding superior compacto na camada final':'padding:10px 12px 12px!important' in css260,
  'padding superior compacto nas camadas anteriores':'padding:10px 10px 10px!important' in css256 and 'padding:10px 12px 12px!important' in css259,
  'campos simples iniciam em quatro linhas':"if(isField)return hasTextarea?8:4;" in js,
  'cliente e datas iniciam compactos':"if(id==='clientId')return 4;" in js and "includes(id))return 4;" in js,
  'redimensionamento permanece ativo':'.layout-resize-handle-v256' in css256 and 'beginResize256' in js and 'moveResize256' in js,
  'salvamento permanece ativo':'saveModalLayout256' in js and "persist('Layout visual atualizado'" in js,
}
failed=[name for name,ok in checks.items() if not ok]
for name,ok in checks.items(): print(('OK  ' if ok else 'FALHA ')+name)
if failed:
    print('\nFalhas:',failed)
    sys.exit(1)
print(f'\n{len(checks)}/{len(checks)} verificações aprovadas.')
