# Relatório de testes — Marco Iris v2.5.4

Data da revisão: 23/07/2026.

## Resultado

A versão foi aprovada na suíte local disponível:

- **29/29** verificações estruturais, de integridade e de empacotamento aprovadas;
- **23/23** verificações de navegador, DOM e runtime aprovadas;
- **0** erros JavaScript capturados no navegador de teste;
- sintaxe validada com `node --check` em todos os arquivos JavaScript.

## O que foi validado

- contagens e sequências históricas de clientes, OSVs, receitas, produtos, serviços, insumos e movimentações;
- próximos códigos sem salto e separação REC/DES;
- OSV-000002, OSV-000057 e ausência da OSV-000292 de teste;
- referências entre clientes, OSVs, itens, pagamentos e movimentações;
- 289 PDFs históricos classificados e presentes no pacote privado;
- ausência de dados privados no pacote público;
- indicadores e módulos da Visão geral;
- agenda desativada por padrão;
- ordenação em três estados nas oito tabelas;
- filtros de período nas três telas solicitadas;
- modos de visualização independentes no Catálogo;
- coluna Estoque Antes → Estoque Depois;
- campos travados e cálculo bidirecional de custo/margem/preço;
- remoção visual de cabeçalhos duplicados;
- exibição de PDF histórico sem bloqueio por “desatualizado”;
- menu lateral fixo;
- fila de salvamento em segundo plano.

No teste de salvamento, a função retornou em poucos milissegundos, enquanto uma gravação simulada de **180 ms** continuou em segundo plano. Ao final, a revisão solicitada e a revisão confirmada ficaram iguais e a fila terminou sem erro.

## Limitações do ambiente

O ambiente de teste bloqueou navegação direta para URL local e `file://`. Para não omitir o teste de interface, todos os arquivos JS e CSS locais foram carregados diretamente em um Chromium headless por conteúdo inline, mantendo o mesmo código executado pelo aplicativo.

Não foram usados login Google, pasta real do Drive, WhatsApp real nem dois dispositivos reais. Por isso, a homologação final dessas integrações continua listada como manual no checklist. Não há base técnica para afirmar que credenciais e permissões externas foram testadas neste ambiente.

## Arquivos de evidência

O pacote privado inclui cópias dos resultados JSON da suíte atual. Os scripts de teste da v2.5.4 foram criados especificamente para esta versão; relatórios antigos da migração foram preservados apenas como histórico e não foram usados como prova da revisão atual.
