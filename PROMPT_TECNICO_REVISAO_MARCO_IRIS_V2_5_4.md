# Prompt técnico — revisão Marco Iris Tecnologia v2.5.4

## Objetivo

Revisar integralmente o aplicativo Marco Iris Tecnologia após a migração histórica, corrigindo numeração, dados pontuais, PDFs importados, salvamento em nuvem, organização das tabelas, painel inicial e experiência de uso. Todas as alterações devem preservar os dados históricos, a integração com o Borion e a separação entre o código público e o pacote privado.

## Arquivos de entrada

1. ZIP público do aplicativo, sem dados de clientes, próprio para GitHub Pages.
2. ZIP privado de migração histórica, contendo JSON, PDFs, fotos, planilhas e demais arquivos reais.
3. Borion Finance apenas como referência técnica do fluxo de salvamento em segundo plano e confirmação na nuvem.

### Regra absoluta de segurança

O ZIP privado, a pasta `migration/`, o arquivo `Marco_Iris_Dados.migrado.json`, PDFs, fotos, planilhas e documentos reais nunca podem ser copiados para o ZIP público nem publicados no GitHub, GitHub Pages, Netlify ou qualquer hospedagem pública.

---

## 1. Numeração automática sem saltos

Corrigir a regra de geração de códigos para que `settings.nextIds` represente o **próximo número disponível**, e não o último número utilizado. Apenas visualizar ou abrir um formulário não pode consumir nem incrementar um código. O incremento só deve ocorrer após a criação ser confirmada e salva.

Próximos códigos esperados no histórico informado:

- OSV: `OSV-000291`;
- cliente: `CLI-000143`;
- receita: `REC-000296`;
- despesa: `DES-000001`;
- serviço: `SRV-000044`;
- produto: `PRD-000034`;
- insumo: `INS-000010`.

A movimentação já está correta no ambiente operacional: se a última for `MOV-000051`, a próxima deve ser `MOV-000052`. Não forçar um número fixo: calcular sempre `máximo existente + 1`, considerando o estado realmente carregado.

Receitas e despesas usam a mesma coleção, mas devem ter contadores independentes. Registros `REC-*` não podem influenciar o próximo `DES-*`, e registros `DES-*` não podem influenciar o próximo `REC-*`.

### Aceitação

- abrir e cancelar um cadastro três vezes não altera o próximo código;
- criar um registro usa exatamente o código exibido;
- o cadastro seguinte recebe o número imediatamente posterior;
- recarregar, trocar de tela ou entrar novamente não cria saltos;
- múltiplos dispositivos não podem gerar duplicidade silenciosa.

---

## 2. Correções históricas pontuais

Aplicar as correções de modo idempotente, com marcador de migração, sem repetir a alteração em cada login.

### OSV-000292 de teste

Remover totalmente a `OSV-000292` de teste somente quando ela existir e a `OSV-000291` ainda não existir. Remover também itens, pagamentos, vínculos, anexos e movimentações exclusivos dessa OSV. Se houver arquivos no Drive, colocá-los em uma fila segura de limpeza. Não remover uma futura OSV-000292 legítima criada depois da OSV-000291.

### OSV-000002

- manter no histórico;
- status `Cancelada`;
- total `R$ 0,00`;
- preservar o registro `REC-000002` para não quebrar a sequência;
- deixar o pagamento em `R$ 0,00`, cancelado/inativo;
- não apagar PDF nem evidência histórica.

### OSV-000057

- status `Concluída`;
- total `R$ 4.000,00`;
- definir apenas um item com subtotal de `R$ 4.000,00`;
- deixar todos os demais itens dessa OSV com valor zero;
- pagamento correspondente em `R$ 4.000,00`, status `Pago`;
- garantir que a soma dos itens, total da OSV e pagamento sejam coerentes.

---

## 3. PDFs históricos e novos PDFs

PDFs importados do sistema anterior são documentos históricos válidos. Não exibir “PDFs estão desatualizados” apenas porque não possuem a impressão digital usada pelos PDFs novos.

- classificar PDFs importados como históricos/legados e oficiais quando assim vierem da migração;
- permitir visualizar e enviar o PDF histórico existente;
- não gerar outro PDF automaticamente no lugar do histórico;
- novos PDFs devem receber metadados da versão atual;
- ao gerar uma nova versão, preservar o PDF anterior como histórico, sem exclusão destrutiva;
- geração de PDF deve ocorrer em segundo plano e liberar a interface imediatamente.

Na lista de ações da OSV, usar exatamente esta ordem:

1. Adicionar pagamento;
2. Gerar PDF;
3. Visualizar PDF;
4. Enviar PDF;
5. Abrir cliente;
6. Editar OSV.

---

## 4. Salvamento em segundo plano com Google Drive

Usar como referência a arquitetura de fila do Borion, adaptada ao Marco Iris, sem transformar cache local em fonte oficial dos dados.

### Regras

- ao clicar em salvar, fechar imediatamente a janela e permitir continuar usando o app;
- manter a alteração no estado em memória;
- enfileirar uma gravação completa e serializada no Google Drive;
- impedir duas gravações concorrentes de sobrescreverem uma à outra;
- confirmar a revisão somente após resposta positiva do Drive;
- repetir automaticamente após falha transitória;
- mostrar estado: salvando, confirmado, pendente ou erro;
- impedir atualização remota de substituir alterações ainda pendentes;
- avisar antes de fechar a página quando houver alteração não confirmada;
- sem internet ou sem autenticação Drive, não aceitar silenciosamente uma alteração como salva;
- manter a integração com o Borion depois da confirmação da base principal.

### Aceitação

A função de salvar deve retornar em milissegundos, enquanto uma gravação simulada de 180 ms continua em segundo plano e termina com revisões solicitada e confirmada iguais.

---

## 5. Visão geral

Compactar ao máximo o bloco de saudação, data e hora. O botão “Editar módulos” deve aparecer apenas como ícone de lápis no canto superior direito da área.

### Indicadores

Substituir “Agenda de hoje” por:

- `Valores a receber`;
- valor atual das pendências;
- quantidade de clientes, com singular/plural correto.

Substituir o indicador antigo de estoque por:

- `Estoque crítico`;
- quantidade de itens críticos;
- quantidade `em atenção`.

A agenda deve vir desativada por padrão. Quando o usuário ativar o módulo em Configurações, todos os recursos relacionados à agenda voltam a aparecer.

### Módulos ajustáveis

Revisar subir/descer, largura, altura, arrastar, desfazer, restaurar e salvar. Adicionar seletor de 1 a 4 colunas, salvo por perfil e por faixa de tela.

Manter e corrigir:

- Ordens recentes;
- Clientes a receber;
- Alertas de estoque;
- Faturamento;
- Agenda de hoje somente quando o módulo estiver ativo.

### Módulo Faturamento

Adicionar filtros Dia, Mês e Ano. Mostrar:

- gráfico de faturamento por período;
- composição relacionada ao período selecionado;
- Receita de Serviços;
- Receita de Produtos;
- Despesas;
- Impostos/taxas.

### Ordens recentes

Ao clicar na linha, abrir a OSV. Na janela, não repetir um cabeçalho inútil como `OSV OSV-000xxx` acima do título real.

### Clientes a receber

- exibir `OSV-000xxx · Cliente`;
- a linha inteira abre a OSV;
- ações, nesta ordem: Adicionar pagamento, Visualizar PDF, Enviar PDF, Abrir cliente;
- usar ícones e estética do aplicativo;
- não repetir o nome do cliente em dois cabeçalhos consecutivos.

### Alertas de estoque

Exibir:

- nome do item;
- `Produto/Insumo · Fornecedor`;
- `Mínimo X · Estoque Y · Crítico/Atenção`.

Clicar na linha deve abrir diretamente a edição do produto ou insumo.

---

## 6. Ordenação em todas as tabelas

Replicar a ordenação clicável já existente em Produtos para:

- Ordens de serviço;
- Clientes;
- Financeiro;
- Serviços;
- Produtos;
- Insumos;
- Movimentações;
- Documentos.

Cada cabeçalho ordenável deve ter três estados:

1. padrão;
2. decrescente;
3. crescente;
4. novo clique retorna ao padrão.

Persistir coluna e direção por perfil e por seção, sem compartilhar a configuração entre telas diferentes.

Colunas mínimas:

- OSV: OSV, abertura, cliente, equipamento, financeiro, status, valor;
- Clientes: cliente, contato, cidade, ordens, total movimentado;
- Financeiro: data, ID, tipo, cliente/OSV, forma, status, taxa, valor líquido;
- Serviços: serviço, preço padrão, execuções, status;
- Produtos: produto, fornecedor, custo, margem, venda, estoque, mínimo;
- Insumos: insumo, fornecedor, custo, estoque, mínimo;
- Movimentações: ID, data, item, tipo, quantidade, estoque antes/depois, OSV, observação;
- Documentos: OSV, cliente, data/hora, arquivo.

---

## 7. Visualização independente por seção

Corrigir os modos Linha, Colunas e Quadrados para mudar imediatamente, sem precisar sair e voltar à tela.

Salvar individualmente por perfil para:

- Ordens de serviço;
- Clientes;
- Financeiro;
- Serviços;
- Produtos;
- Insumos;
- Movimentações;
- Documentos.

Especialmente no Catálogo e Estoque, Produtos, Serviços, Insumos e Movimentações não podem compartilhar a mesma chave de visualização.

---

## 8. Filtro de período padronizado

Em Ordens de serviço, Financeiro e Documentos, usar o mesmo componente:

- botão `Data` com ícone de calendário;
- seleção de mês e ano;
- campo opcional de dias no formato `Dias 10-31`;
- sem dias preenchidos: mostrar o mês inteiro;
- apenas um dia: mostrar somente esse dia;
- intervalo: mostrar inclusivamente do primeiro ao último dia;
- vassourinha para limpar mês, ano e dias.

Persistir o filtro separadamente por seção e por perfil.

---

## 9. Estoque e atualização de custo

### Movimentações

Adicionar a coluna `Estoque Antes → Estoque Depois`, exibindo os dois valores além da quantidade movimentada. Movimentações antigas sem snapshot devem receber uma reconstrução segura quando possível, sem alterar o estoque atual.

### Atualizar custo em Produtos e Insumos

- `Cadastro`: somente leitura;
- `Custo atual`: somente leitura;
- `Novo custo`: editável;
- produto: margem bruta em barra deslizante;
- novo preço de venda editável;
- mover a margem recalcula o preço;
- digitar o preço recalcula a margem;
- usar exatamente a mesma fórmula da janela Editar produto;
- ao salvar, atualizar custo, margem e preço de venda corretamente;
- insumo não precisa de preço de venda se essa informação não fizer parte do cadastro.

---

## 10. Layout e navegação

O menu lateral deve permanecer fixo durante a rolagem da página em desktop, sem impedir rolagem interna quando o menu for maior que a altura da tela. Preservar o comportamento responsivo no celular.

Não quebrar:

- login Google;
- persistência no Drive;
- importação histórica;
- integração Borion;
- geração, visualização e envio de PDF;
- estoque;
- filtros;
- modos de visualização;
- funcionamento mobile.

---

## 11. Testes obrigatórios

Executar e registrar:

- validação de sintaxe de todos os JavaScript;
- teste dos próximos códigos de cada entidade;
- teste de abrir/cancelar formulário sem consumir código;
- validação das correções OSV-000002, OSV-000057 e remoção condicional da OSV-000292;
- integridade de todas as referências entre clientes, OSVs, itens, pagamentos e movimentações;
- existência e classificação dos PDFs históricos;
- ordenação em três estados em todas as tabelas;
- visualizações independentes e imediatas;
- filtros de período nas três telas;
- cálculo bidirecional de custo, margem e venda;
- salvamento assíncrono com fila e confirmação;
- ausência de dados privados no ZIP público;
- abertura real com Google Drive e envio real pelo WhatsApp na homologação final.

Não aprovar apenas porque o código foi alterado. Aprovar somente após os testes passarem e registrar qualquer teste que dependa de credenciais reais como pendente de homologação manual.

## 12. Entrega

Entregar separadamente:

1. ZIP público para GitHub, sem qualquer dado real;
2. ZIP privado de migração, marcado claramente como `NÃO PUBLICAR`;
3. checklist de homologação;
4. relatório dos testes;
5. hashes SHA-256 dos ZIPs finais.
