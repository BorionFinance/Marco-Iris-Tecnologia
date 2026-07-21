# Guia de reinstalação limpa — Marco Iris Tecnologia v2.4.0

Data da revisão: 21/07/2026

## Objetivo

Esta versão preserva o aplicativo e suas funções, mas reinicia toda a fundação técnica:

- banco local novo, sem herdar IndexedDB, rascunhos, mídias ou referências da versão anterior;
- cache e Service Worker novos;
- chaves novas para usuário, pasta raiz, estrutura e arquivos do Google Drive;
- gravação local imediata em toda alteração;
- fila serializada para impedir duas gravações do Drive de se atropelarem;
- publicação do `marco-iris.bridge.json` confirmada por releitura;
- nova tentativa automática após 5 segundos quando o Drive falhar;
- backups rotativos `autosave-1.json` a `autosave-20.json` e `forcesave-1.json` a `forcesave-20.json`;
- manifesto `Marco_Iris_Instalacao.json` para identificar a instalação oficial;
- botão **Testar instalação** em Configurações > Backup e Migração.

## Atenção antes de apagar qualquer coisa

Não exclua definitivamente o repositório antigo nem a pasta antiga do Drive no primeiro dia. Faça isto:

1. Baixe o ZIP do repositório atual.
2. Exporte o JSON atual do Marco Iris, mesmo que esteja vazio ou incompleto.
3. Baixe ou copie a pasta atual do Drive.
4. Renomeie a pasta antiga para `ARQUIVO_ANTIGO_NAO_USAR_MARCO_IRIS`.
5. Deixe o repositório antigo arquivado ou privado durante a homologação.

Só apague definitivamente depois de a nova instalação passar por todos os testes deste guia.

## 1. Confirmar a URL antes da publicação

O arquivo `CNAME` deste pacote está configurado exatamente como solicitado:

`mitec.boreonfinds.com.br`

Confirme a grafia antes de publicar. O domínio anterior citado para o Borion foi `borionfinance.com.br`, que é diferente. Caso a URL correta seja, por exemplo, `mitec.borionfinance.com.br`, altere o arquivo `CNAME` e use a mesma URL no DNS e no Google Cloud.

Todos os três locais precisam ser idênticos:

- arquivo `CNAME`;
- registro DNS;
- origem autorizada no Google OAuth e restrição da chave de API.

## 2. Criar o novo repositório no GitHub

Recomendação: crie um repositório novo para não carregar histórico, Actions ou configurações antigas.

1. Crie um repositório vazio, por exemplo `marco-iris-tecnologia-v2`.
2. Não adicione README automático, licença ou `.gitignore` durante a criação.
3. Extraia este ZIP.
4. Envie **o conteúdo da pasta extraída para a raiz do repositório**. O `index.html` precisa ficar na raiz.
5. Em **Settings > Pages**, selecione:
   - Source: `Deploy from a branch`;
   - Branch: `main`;
   - Folder: `/ (root)`.
6. Em **Custom domain**, informe a URL exata definida no `CNAME`.
7. Aguarde o GitHub validar o DNS e depois ative **Enforce HTTPS**.

## 3. Configurar o DNS

No provedor do domínio, crie um registro:

- Tipo: `CNAME`;
- Nome/Host: `mitec`;
- Destino: `<SEU_USUARIO_GITHUB>.github.io`;
- TTL: padrão ou 300 segundos durante a migração.

Remova registros conflitantes para o mesmo host `mitec`, especialmente outro CNAME, A ou AAAA.

Não use barra, `https://` ou caminho no campo de destino do DNS.

## 4. Atualizar o Google Cloud

O aplicativo continua usando o projeto Google já configurado no código. A mudança de URL exige atualização das restrições.

### OAuth 2.0

Em **Google Cloud Console > APIs e serviços > Credenciais > ID do cliente OAuth 2.0**:

1. Adicione em **Origens JavaScript autorizadas**:
   - `https://mitec.boreonfinds.com.br`
2. Durante a migração, a URL antiga pode permanecer temporariamente.
3. Não adicione barra no final.

### Chave de API

Na chave usada pelo Google Picker:

1. Restrinja por **Sites HTTP**.
2. Adicione:
   - `https://mitec.boreonfinds.com.br/*`
   - opcionalmente, a URL técnica do GitHub Pages durante a homologação.
3. Mantenha Google Drive API e Google Picker API habilitadas.

### Conta autorizada

O aplicativo possui bloqueio adicional por hash de conta. A mudança de URL não altera esse bloqueio. Entre com a conta Google autorizada do Marco.

## 5. Criar a nova pasta oficial no Google Drive

Crie apenas uma pasta raiz vazia, por exemplo:

`Marco Iris Tecnologia - OFICIAL v2.4.0`

Não crie manualmente as subpastas. O aplicativo fará isso e guardará os IDs corretos.

Depois da primeira conexão confirmada, a estrutura esperada é:

```text
Marco Iris Tecnologia - OFICIAL v2.4.0/
├── Marco_Iris_Instalacao.json
├── Dados/
│   └── Marco_Iris_Dados.json
├── Backups/
│   ├── autosave-1.json
│   ├── autosave-2.json
│   ├── ...
│   ├── autosave-20.json
│   ├── forcesave-1.json
│   ├── ...
│   └── forcesave-20.json
├── Fotos_OS/
├── Ordens_de_Servico/
├── Anexos/
└── Borion_Integracoes/
    ├── marco-iris.bridge.json
    └── marco-iris.ack.json  ← aparece depois que o Borion responder
```

Os slots aparecem progressivamente. Não é necessário que todos os 20 arquivos existam no primeiro minuto.

## 6. Limpar a instalação antiga nos dispositivos

Faça em cada computador, celular ou tablet que usava a versão antiga:

1. Feche todas as abas do Marco Iris.
2. Desinstale a PWA antiga, caso esteja instalada.
3. Limpe os dados do site da URL antiga no navegador.
4. Abra a nova URL.
5. Instale novamente a PWA somente depois da primeira validação.

A nova URL, o novo banco `v240_clean`, o novo cache e as novas chaves do Drive já impedem a herança normal de dados antigos. A limpeza manual remove restos da PWA anterior.

## 7. Primeira conexão da nova instalação

1. Abra a nova URL.
2. Faça login com a conta Google autorizada.
3. Escolha a pasta raiz vazia criada no passo 5.
4. Aguarde a mensagem:
   - **Drive, backups e integração confirmados**.
5. Entre em **Configurações > Backup e Migração**.
6. Clique em **Testar instalação**.
7. O diagnóstico precisa confirmar:
   - arquivo principal;
   - seis subpastas;
   - `marco-iris.bridge.json`;
   - `companyInstanceId` da instalação.

Se o diagnóstico falhar, não comece a usar. Corrija a conexão primeiro.

## 8. Como o salvamento funciona nesta versão

Em cada inclusão, edição, cancelamento ou exclusão:

1. o estado é gravado imediatamente no IndexedDB local;
2. a pasta local é atualizada, quando conectada e autorizada;
3. fotos, PDFs e anexos pendentes são enviados;
4. a base `Marco_Iris_Dados.json` entra em uma fila serializada;
5. o Drive é relido para confirmar a revisão e o checksum;
6. o bridge é gerado na pasta `Borion_Integracoes`;
7. o bridge é relido e comparado por instância, revisão e hash;
8. em caso de falha, o dado permanece local e há nova tentativa em 5 segundos.

A cada minuto com alteração, o aplicativo também gira o próximo slot de autosave. O botão **Salvar tudo** cria backup manual/forcesave e executa diagnóstico.

## 9. Checklist obrigatório antes de liberar para o Marco

Execute na ordem abaixo, atualizando a página após cada bloco.

### Clientes

- Criar um cliente.
- Atualizar a página após 5 segundos.
- Confirmar que o cliente permanece.
- Editar telefone/endereço.
- Atualizar novamente e confirmar.
- Excluir um cliente sem vínculos e confirmar que não retorna.

### Catálogo e estoque

- Criar um produto, um serviço e um insumo.
- Registrar entrada e saída de estoque.
- Atualizar a página.
- Conferir saldo, IDs e histórico.
- Tentar saída acima do saldo para validar o bloqueio.

### OSV

- Criar uma OSV com cliente, equipamento, defeito e observações.
- Adicionar produto, serviço e insumo.
- Salvar e atualizar a página.
- Alterar status e atualizar novamente.
- Adicionar foto e anexo.
- Gerar PDF.
- Verificar os arquivos nas pastas do Drive.

### Financeiro

- Criar recebimento parcial com data de pagamento.
- Criar segundo recebimento para a mesma OSV.
- Atualizar a página e confirmar os dois IDs separados.
- Cancelar um recebimento.
- Confirmar o tombstone no bridge.
- Excluir definitivamente, quando a função permitir.
- Criar novo recebimento para a mesma OSV e confirmar que recebe ID novo.

### Persistência e dispositivos

- Criar um registro no PC.
- Aguardar a confirmação de nuvem.
- Abrir no celular e confirmar o registro.
- Excluir no celular.
- Reabrir no PC e confirmar que não ressuscita.
- Repetir com uma OSV e um lançamento financeiro.

### Backups

- Fazer pelo menos duas alterações separadas por um minuto.
- Confirmar `autosave-1.json` e `autosave-2.json` em `Backups`.
- Clicar em **Salvar tudo**.
- Confirmar um `forcesave-N.json` e um backup manual com data/hora.

## 10. Reconectar ao Borion somente depois da homologação

Durante os testes iniciais, mantenha a integração do Borion desconectada.

Depois que o Marco passar pelo checklist:

1. No Borion, abra a integração Marco Iris.
2. Selecione a pasta raiz nova ou diretamente `Borion_Integracoes`.
   - O Borion v6.45.2 desce automaticamente da raiz até `Borion_Integracoes`.
3. Configure destinos, categorias, contas, carteira, reservas e regras de despesas.
4. Salve as opções sem sincronizar.
5. Defina a **data de corte antes da primeira sincronização**.
6. Selecione **Perguntar sempre** no modo de aprovação da importação inicial.
7. Só então clique em **Sincronizar agora**.
8. Revise a prévia e aprove a importação.

### Regra da data de corte

Para receitas do Marco, o Borion usa primeiro a **Data de Pagamento**. Registros com data anterior ao corte são ignorados. Registros no próprio dia do corte são incluídos.

Exemplo:

- corte: `22/07/2026`;
- pagamento em `21/07/2026`: ignorado;
- pagamento em `22/07/2026`: considerado;
- pagamento em `23/07/2026`: considerado.

## 11. Importar o histórico antigo sem jogar tudo no Borion

A ordem segura é:

1. Marco novo funcionando e homologado.
2. Borion ainda desconectado da nova pasta.
3. Importar o histórico antigo no Marco.
4. Conferir clientes, OSVs, catálogo, fotos, PDFs e lançamentos.
5. No Borion, conectar a nova pasta.
6. Definir a data de corte.
7. Salvar a configuração.
8. Executar a sincronização em modo de aprovação.

Assim, o histórico pode existir no Marco sem virar receita automática no Borion antes do corte.

Não conecte e sincronize o Borion antes de definir a data de corte, porque sem corte todo o histórico elegível pode ser considerado.

## 12. Critérios de aprovação final

A instalação só deve ser liberada quando todos forem verdadeiros:

- `Marco_Iris_Dados.json` existe e muda de revisão após uma alteração;
- `Marco_Iris_Instalacao.json` aponta para a conta e a pasta oficiais;
- `marco-iris.bridge.json` existe e tem o mesmo `companyInstanceId` da base;
- criar, editar e excluir sobrevive ao F5;
- PC e celular convergem sem ressuscitar registros;
- foto, anexo e PDF aparecem no Drive;
- autosave e forcesave giram sem criar arquivos infinitos;
- Borion respeita a data de corte;
- Borion não duplica recebimentos;
- cancelamento/exclusão estorna o lançamento importado;
- novo recebimento da mesma OSV recebe vínculo novo;
- despesas em crédito continuam aguardando revisão manual.

## 13. Plano de retorno

Caso a nova instalação falhe:

1. desconecte o Borion da nova pasta;
2. não apague a pasta nova;
3. volte temporariamente à URL antiga;
4. use o JSON e a pasta arquivada do sistema anterior;
5. guarde os arquivos `Marco_Iris_Dados.json`, `marco-iris.bridge.json` e `Marco_Iris_Instalacao.json` da tentativa para diagnóstico.

