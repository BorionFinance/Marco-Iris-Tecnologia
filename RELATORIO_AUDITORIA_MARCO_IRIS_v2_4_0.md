# Relatório de auditoria — Marco Iris Tecnologia v2.4.0

## Arquivos analisados

- `Marco_Iris_Tecnologia_v2_3_5_RESET_COMPLETO_SEGURO.zip`
- `Borion_Finance_v6_45_2_APROVACAO_IMPORTACAO.zip`

## Falhas estruturais corrigidas

1. **Referências antigas de Drive sobreviviam à reinstalação**
   - IDs de usuário, pasta raiz, estrutura e arquivos estavam em chaves locais antigas.
   - A v2.4.0 usa namespace novo `marco_iris_v240_*`.

2. **Banco local não era realmente zerado**
   - O reset anterior trocava apenas o estado principal.
   - Fotos, rascunhos, backups, handles e outros objetos permaneciam no IndexedDB.
   - A v2.4.0 usa um banco novo e `wipeAll()` apaga o banco completo.

3. **Publicações concorrentes do bridge podiam deixar a alteração nova para depois**
   - Uma alteração feita enquanto outra publicação estava em andamento podia ser absorvida pelo mesmo objeto em memória sem garantir segunda gravação.
   - A v2.4.0 usa contador de gerações e fila de republicação até `publishCompleted === publishRequested`.

4. **Autosave do Drive dependia de debounce de aproximadamente 1,9 segundo**
   - Recarregar/logar nesse intervalo podia favorecer uma revisão remota antiga.
   - A v2.4.0 salva localmente primeiro e aguarda a fila do Drive em toda alteração relevante.

5. **Bridge podia ser tratado como pronto sem confirmação forte no fluxo de login**
   - A v2.4.0 exige gravação e releitura do `marco-iris.bridge.json` antes de considerar a instalação confirmada.

6. **Backups prewrite podiam crescer indefinidamente**
   - A v2.4.0 usa rotação de 20 autosaves e 20 forcesaves.

7. **Reset não removia Service Worker e caches antigos**
   - A v2.4.0 desregistra o Service Worker, limpa caches `marco-iris-*` e apaga o banco local.

8. **Estrutura em cache era removida com a chave errada**
   - A versão anterior tentava limpar a estrutura usando o ID do usuário em vez do ID real da pasta raiz.
   - Corrigido em `clearRoot()` e `disconnect()`.

## Fluxo novo de persistência

- IndexedDB local imediato;
- pasta local imediata, quando autorizada;
- mídias pendentes reenviadas;
- fila serializada do arquivo principal;
- checksum e revisão confirmados por releitura;
- bridge publicado e confirmado por releitura;
- retry automático em 5 segundos;
- autosave rotativo a cada minuto com mudança;
- forcesave no salvamento manual.

## Estrutura oficial do Drive

- `Marco_Iris_Instalacao.json`
- `Dados/Marco_Iris_Dados.json`
- `Backups/autosave-N.json`
- `Backups/forcesave-N.json`
- `Fotos_OS/`
- `Ordens_de_Servico/`
- `Anexos/`
- `Borion_Integracoes/marco-iris.bridge.json`

## Resultados dos testes

### Marco Iris

11 de 11 arquivos de teste passaram, cobrindo:

- projeção de receitas e despesas para o Borion;
- tombstones, cancelamento, exclusão e relançamento;
- fila do bridge durante gravação concorrente;
- namespace limpo da instalação v2.4.0;
- autosave/forcesave rotativos;
- persistência de revisão do Drive;
- recuperação de pasta raiz excluída;
- reset completo de IndexedDB/cache;
- persistência imediata e retry;
- proteção por instância e snapshot vazio;
- login sem descartar revisão local mais nova.

Todos os arquivos JavaScript passaram por `node --check`.

### Borion Finance

47 de 47 arquivos de teste passaram na versão fornecida v6.45.2, incluindo:

- data de corte persistida e confirmada;
- dia do corte incluído sem erro de fuso;
- aprovação inicial obrigatória quando configurada como “Perguntar sempre”;
- seleção da raiz ou de `Borion_Integracoes`;
- importação idempotente por REC;
- pagamentos parciais;
- cancelamento, exclusão e relançamento;
- estorno de saldo;
- despesas automáticas e despesas em crédito para revisão;
- ACK atômico;
- proteção contra instância diferente e snapshot vazio.

## Limitação da auditoria

Não foi possível realizar autenticação real na conta Google, publicar no GitHub, validar DNS/HTTPS ou executar leitura real da pasta do Drive neste ambiente. O navegador headless disponível bloqueou páginas locais por política da organização. Por isso, a versão inclui o botão **Testar instalação**, que executa a validação real após a publicação e o login autorizado.

