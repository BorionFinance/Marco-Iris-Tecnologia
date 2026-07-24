# Relatório de validação — exclusão financeira instantânea v2.6.6

## Resultado

- Ciclos executados: 20
- Ciclos aprovados: 20
- Falhas: 0
- Maior tempo medido para o lançamento desaparecer da interface: 12,4 ms
- Verificação de sintaxe: todos os arquivos JavaScript aprovados por `node --check`

## O que cada ciclo validou

1. O lançamento desaparece imediatamente dos dados em memória.
2. O botão/linha desaparece imediatamente do DOM.
3. A exclusão permanece marcada como pendente enquanto a nuvem não confirma.
4. Uma base antiga simulada não consegue restaurar o lançamento.
5. Duas alterações feitas imediatamente depois continuam sem o lançamento excluído.
6. Todos os snapshots enviados ao Drive permanecem sem o ID apagado.
7. A alteração posterior e um novo lançamento são preservados no snapshot final.
8. O tombstone da integração Borion é mantido.
9. A fila termina completamente sincronizada.

## Ambiente do teste

O teste foi executado em Chromium headless com o tempo de resposta do Google Drive simulado. Nenhuma conta real nem a base real do Marco foi modificada durante a validação.

Resultado técnico completo: `RESULTADO_EXCLUSAO_INSTANTANEA_20X_V2_6_6.json`.
