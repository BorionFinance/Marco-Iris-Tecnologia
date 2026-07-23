# Checklist de homologação — Marco Iris v2.5.4

## Numeração e dados

- [x] Próxima OSV calculada como OSV-000291 no histórico migrado.
- [x] Próximo cliente calculado como CLI-000143.
- [x] Próxima receita calculada como REC-000296.
- [x] Próxima despesa calculada como DES-000001.
- [x] Próximo serviço calculado como SRV-000044.
- [x] Próximo produto calculado como PRD-000034.
- [x] Próximo insumo calculado como INS-000010.
- [x] MOV usa o maior existente + 1; não foi fixado nem retrocedido.
- [x] Receitas e despesas possuem contadores independentes.
- [x] Pré-visualizar ou cancelar um formulário não consome o código.
- [x] OSV-000292 de teste removida do pacote e correção condicional preparada para a base ativa.
- [x] OSV-000002 preservada como cancelada, total zero e REC preservado em zero.
- [x] OSV-000057 corrigida para total/pagamento de R$ 4.000,00, com apenas um item valorizado.

## Visão geral

- [x] Saudação, data e hora compactadas.
- [x] Editar módulos reduzido a ícone de lápis.
- [x] Agenda desativada por padrão.
- [x] Indicador Valores a receber com valor e quantidade de clientes.
- [x] Indicador Estoque crítico com críticos e itens em atenção.
- [x] Módulos ajustáveis com 1 a 4 colunas.
- [x] Módulo Faturamento com Dia/Mês/Ano e composição financeira.
- [x] Linhas de Ordens recentes abrem a OSV.
- [x] Clientes a receber usa padrão OSV · Cliente e ações corrigidas.
- [x] Alertas de estoque mostram fornecedor, mínimo, estoque e situação, e abrem a edição.
- [x] Cabeçalhos redundantes das janelas de OSV e cliente removidos visualmente.

## Tabelas, filtros e visualizações

- [x] Ordenação em três estados nas 8 tabelas solicitadas.
- [x] Ordem e direção salvas por seção e perfil.
- [x] Linha, Colunas e Quadrados alteram imediatamente.
- [x] Modos do Catálogo são independentes para Serviços, Produtos, Insumos e Movimentações.
- [x] Filtro Data padronizado em OSV, Financeiro e Documentos.
- [x] Campo opcional de dias e vassourinha de limpeza presentes.
- [x] Movimentações exibem Estoque Antes → Estoque Depois.
- [x] Menu lateral fixo em desktop.

## PDF, custo e nuvem

- [x] Ações da OSV na ordem pedida, incluindo Gerar PDF.
- [x] PDFs importados tratados como históricos válidos.
- [x] Mensagem incorreta de PDF desatualizado removida para históricos válidos.
- [x] Geração de PDF colocada em segundo plano.
- [x] Cadastro e custo atual travados na janela Atualizar custo.
- [x] Margem e preço interligados nos dois sentidos.
- [x] Salvamento usa fila serial em segundo plano e confirmação do Drive.
- [x] Alterações pendentes não são sobrescritas por atualização remota.
- [x] Aviso antes de fechar com gravação pendente.

## Segurança dos pacotes

- [x] ZIP público sem JSON migrado, PDFs, fotos, planilhas ou pasta migration.
- [x] ZIP privado contém dados e aviso explícito para nunca publicar.
- [x] Sintaxe de todos os arquivos JavaScript validada.
- [x] Testes locais de DOM/runtime: 23 de 23 aprovados, sem erro de página.
- [x] Testes estruturais e de dados: 29 de 29 aprovados.

## Homologação manual com as contas reais

- [ ] Publicar o ZIP público em um endereço de teste.
- [ ] Entrar com a conta Google do Marco.
- [ ] Selecionar o pacote privado e concluir a migração para uma pasta de homologação.
- [ ] Confirmar que a próxima OSV real exibida é OSV-000291 antes de salvar.
- [ ] Criar e excluir uma OSV de homologação, verificando o próximo número.
- [ ] Visualizar um PDF histórico importado diretamente do Drive.
- [ ] Gerar um PDF novo, continuar usando o app durante o envio e confirmar o arquivo no Drive.
- [ ] Enviar um PDF pelo WhatsApp em celular real.
- [ ] Fazer alterações rápidas em duas telas e confirmar sincronização em outro dispositivo.
- [ ] Simular queda de internet e confirmar aviso/repetição sem perda.
- [ ] Confirmar integração com Borion sem duplicidade.

A liberação definitiva para produção depende dos itens manuais acima, porque exigem credenciais, Google Drive e WhatsApp reais.
