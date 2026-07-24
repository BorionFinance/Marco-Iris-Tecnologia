# Marco Iris Tecnologia — v2.6.0

## Grade livre unificada

- Todos os formulários de negócio agora usam o mesmo editor visual em grade da Visão Geral.
- Cada bloco possui coordenadas independentes de coluna e linha.
- É possível arrastar para espaços vazios, manter lacunas, alterar largura e altura e reorganizar sem compactação automática.
- O botão **Salvar layout** grava posição, tamanho e ordem no perfil atual.
- O layout salvo reaparece ao fechar e abrir novamente a mesma tela.
- O mecanismo foi aplicado a: lançamento financeiro, cliente, OSV, agendamento, produto, serviço, insumo, movimentação de estoque, termo e dados da empresa.
- As visualizações de OSV e cliente também usam a grade livre.
- A Nova OSV foi integrada ao editor unificado e não depende mais do editor legado que comprimida e sobrepunha os campos.

## Faturamento da Visão Geral

- Ordem dos botões alterada para **Ano, Mês, Dia**.
- O filtro agora é hierárquico:
  - Ano mostra os anos disponíveis.
  - Mês mantém o ano selecionado e mostra os 12 meses daquele ano.
  - Dia mantém o ano e o mês selecionados e mostra todos os dias daquele mês.
- Os títulos inferiores agora são somente **Composição financeira** e **Formas de pagamento**, sem data no título.
- As setas de rolagem abaixo do gráfico foram ampliadas.

## Estrutura e publicação

- Versão de aplicação, manifesto, service worker e parâmetros de cache atualizados para 2.6.0.
- O service worker elimina caches antigos do Marco Iris na ativação.

## Ajuste visual dos editores de layout — revisão 24/07/2026

- Removido o texto **Arraste** exibido sobre cada bloco em todos os editores unificados.
- Eliminada a faixa vazia superior que era reservada para esse texto.
- Campos simples agora iniciam com altura mais compacta.
- O redimensionamento pelo canto inferior direito continua ativo para aumentar largura e altura.
- Nenhuma regra de posição livre, salvamento, restauração ou faturamento foi alterada.

