# Relatório de validação — Marco Iris v2.6.0

## Resultado

Foram concluídas **1.047 verificações automatizadas**, todas aprovadas:

- 47 verificações focadas na grade livre, salvamento/reabertura e faturamento hierárquico.
- 220 verificações de regressão do layout, repetidas em 20 ciclos.
- 780 verificações de navegação e telas principais, repetidas em 20 ciclos, incluindo validações móveis.

## Cobertura principal

- Grade visível e coordenadas X/Y em todos os cadastros testados.
- Redimensionamento e preservação de lacunas.
- Salvamento e reabertura do layout de lançamento financeiro.
- Salvamento e reabertura do layout da Nova OSV.
- Visualizações de OSV e cliente.
- Novo cliente, agendamento, produto, serviço, insumo, movimentação, termo e dados da empresa.
- Hierarquia Ano → Mês → Dia, incluindo fevereiro de 2025 com 28 dias.
- Títulos sem datas e setas ampliadas.
- Sidebar fixa, alinhamento dos três atalhos e ausência do micro-scroll no catálogo.
- Navegação móvel sem estouro horizontal.

## Inspeção visual

A Nova OSV foi renderizada em 1536 × 900 com 16 blocos na grade, sem sobreposição entre eles. Os campos aparecem em tamanho legível e o espaço de edição permanece rolável pela janela principal.

## Observação de segurança

Os testes de persistência validaram o estado salvo e a reabertura das telas sem gravar dados reais na conta do Google Drive. Em produção, o botão usa a função de persistência já existente do aplicativo.
