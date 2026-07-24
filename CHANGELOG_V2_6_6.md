# Marco Iris v2.6.6 — exclusão financeira instantânea

Data: 24/07/2026

## Correção principal

- A exclusão de um lançamento no Financeiro agora remove o registro da tela e da memória imediatamente, antes de aguardar qualquer resposta do Google Drive.
- A gravação ocorre em segundo plano pela mesma fila serial usada pelas alterações feitas logo em seguida.
- Uma exclusão pendente é reaplicada sobre qualquer estado antigo, restauração ou retorno atrasado, impedindo que o lançamento volte a aparecer.
- O marcador de exclusão só é liberado depois que uma cópia sem o lançamento é confirmada no Google Drive.
- Falhas temporárias mantêm a exclusão na interface e acionam nova tentativa automática, sem restaurar o lançamento apagado.
- A integração com o Borion recebe o tombstone de exclusão para não recriar o registro em sincronizações posteriores.

## Proteções de concorrência

- Gravações comuns, exclusões, backup manual e fila legada v2.5.5 passam por uma corrente única de escrita na nuvem.
- Edições consecutivas são salvas na ordem correta e sempre carregam a exclusão anterior.
- O estado confirmado usado em eventual rollback já recebe as exclusões pendentes, evitando ressurreição do registro.

## Versão

- Aplicativo, cache PWA, manifesto, integração Borion e manifesto de instalação atualizados para 2.6.6.
