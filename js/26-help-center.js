/* Borion Finance v6.36.0 — Central do Borion
   Documentação operacional pesquisável, checklist funcional por perfil e história do projeto.
   Carregado sob demanda em Configurações → ? para não pesar a inicialização do aplicativo. */
(function(){
'use strict';

const HELP_VERSION='1.0.0';
const HELP_CATEGORIES=[
  {id:'inicio',icon:'✦',title:'Primeiros passos'},
  {id:'navegacao',icon:'⌘',title:'Navegação e visão geral'},
  {id:'lancamentos',icon:'↕',title:'Lançamentos'},
  {id:'cartoes',icon:'▣',title:'Cartões, contas e faturas'},
  {id:'reservas',icon:'◇',title:'Reservas e transferências'},
  {id:'patrimonio',icon:'◉',title:'Patrimônio, metas e investimentos'},
  {id:'agenda',icon:'◷',title:'Agenda, notificações e cheques'},
  {id:'importacao',icon:'⇩',title:'Importação'},
  {id:'integracoes',icon:'⛓',title:'Integrações'},
  {id:'personalizacao',icon:'⚙',title:'Configurações e organização'},
  {id:'backup',icon:'⇧',title:'Backup, nuvem e segurança'},
  {id:'mobile',icon:'▯',title:'Smartphone, PWA e solução de problemas'}
];
const CAT_BY_ID=Object.fromEntries(HELP_CATEGORIES.map(c=>[c.id,c]));

function article(id,category,title,intro,steps,tips=[],keywords=[]){return {id,category,title,intro,steps,tips,keywords};}
const HELP_ARTICLES=[
  article('primeiro-acesso','inicio','Começar a usar o Borion do zero','O fluxo seguro é criar ou abrir um perfil, cadastrar onde o dinheiro existe e só depois lançar movimentações.',[
    'Abra ou crie seu perfil financeiro na tela inicial. A senha do perfil é opcional e protege somente aquele perfil.',
    'Entre em Cartões e Contas e confirme a Carteira. Cadastre as contas bancárias que realmente serão usadas nos lançamentos.',
    'Cadastre cartões de crédito e informe fechamento, vencimento e conta usada para pagar cada fatura.',
    'Ative ou desative módulos em Configurações → Módulos. Desativar oculta a área, mas não apaga os dados.',
    'Cadastre categorias, reservas, investimentos e metas conforme sua forma real de organizar o dinheiro.',
    'Faça um backup manual em Configurações → Backups antes de importar uma base antiga ou realizar uma grande alteração.'
  ],['O Borion separa conta de acesso e perfil financeiro. Uma mesma conta pode guardar vários perfis isolados.'],['começar','primeiro acesso','configuração inicial','perfil novo']),

  article('conta-e-perfis','inicio','Conta, perfil e troca de usuário','A conta autentica o acesso; o perfil mantém um conjunto financeiro independente, como em uma seleção de perfis.',[
    'Na entrada, escolha o perfil que será usado. Cada perfil possui dados, categorias, ordens, cores e configurações próprios.',
    'Use o botão ⇄ no rodapé do menu lateral para voltar à seleção de perfis sem sair da conta conectada.',
    'Use o botão de saída para encerrar a conta atual quando realmente quiser desconectar o acesso.',
    'Em Configurações → Perfis, altere nome, e-mail informativo, cor, imagem e senha do perfil.',
    'Antes de excluir um perfil, gere um backup específico dele. A exclusão remove seus dados financeiros.'
  ],['Nunca use o mesmo perfil para pessoas diferentes. Isso mistura saldos, cartões, reservas e histórico.'],['conta','perfil','trocar perfil','senha','excluir perfil']),

  article('estrutura-dados','inicio','Como o Borion organiza o dinheiro','O sistema trabalha com origem, destino, forma de pagamento, status e vínculo financeiro para manter saldos coerentes.',[
    'Conta representa banco ou carteira. Reserva representa dinheiro separado por objetivo. Cartão representa crédito e gera fatura.',
    'Receita aumenta o destino escolhido. Despesa paga reduz a origem escolhida. Despesa em aberto fica registrada sem baixar o saldo até ser paga.',
    'Compra no crédito não reduz a conta no momento da compra; ela cria parcela na fatura. O saldo da conta muda quando a fatura é paga.',
    'Transferência muda dinheiro de lugar sem virar receita ou despesa.',
    'Rendimento de reserva aumenta a reserva e permanece identificado no histórico como rendimento.'
  ],['O erro mais comum é lançar uma transferência como receita ou despesa. Use sempre a aba Transferências para movimentar o mesmo dinheiro.'],['saldo','origem','destino','conta','reserva','cartão']),

  article('navegar-app','navegacao','Menu, cabeçalho e navegação principal','As áreas principais ficam no menu lateral; no Smartphone Mode, atalhos prioritários também aparecem na barra inferior.',[
    'Use o menu lateral para abrir Visão geral, Lançamentos, Investimentos, Patrimônio, Reserva, Cartões e Contas, Agenda, Cheques, Importar Extrato e Configurações.',
    'Módulos desativados não aparecem no menu. Reative-os em Configurações → Módulos.',
    'No celular, abra o menu pelo botão de três linhas. Toque fora ou no × para fechar.',
    'A barra inferior do Smartphone Mode oferece atalhos de uso rápido sem retirar nenhuma função do menu completo.',
    'O botão de voltar do Android fecha primeiro modais e gavetas antes de sair da tela.'
  ],[],['menu','barra lateral','smartphone','navegação','voltar android']),

  article('filtros-globais','navegacao','Mês, banco, relógio e valores ocultos','O cabeçalho controla o período visível e pode restringir várias telas a uma ou mais contas.',[
    'Use as setas do mês para navegar entre competências anteriores e futuras.',
    'Abra o filtro de bancos para selecionar Todos, uma conta ou várias contas.',
    'Quando o filtro está ativo, os totais e listas compatíveis passam a respeitar as contas selecionadas.',
    'Clique no olho ao lado do título para ocultar ou mostrar valores sensíveis.',
    'A data e hora abaixo do mês indicam quando a tela foi atualizada localmente.'
  ],['Ao investigar um valor “faltando”, confira primeiro o mês e o filtro de bancos.'],['filtro banco','mês','competência','ocultar valores','relógio']),

  article('pesquisa-global','navegacao','Pesquisar compras, contas e categorias','A pesquisa do topo localiza registros do perfil sem exigir que você saiba em qual tela eles estão.',[
    'Clique no campo “Pesquisar compras, contas, categorias...”.',
    'Digite parte do nome, categoria, banco, conta ou informação relacionada.',
    'Analise os resultados agrupados e selecione o registro desejado.',
    'A pesquisa usa somente os dados do perfil aberto.',
    'Para buscas financeiras mais detalhadas, use Lançamentos → Central e combine filtros.'
  ],[],['pesquisar','busca global','encontrar compra','central']),

  article('visao-geral','navegacao','Entender a Visão geral','A Visão geral reúne indicadores, fluxo financeiro, composição patrimonial, saúde financeira e módulos configuráveis.',[
    'Confira receita, despesas, saldo, patrimônio, dívidas e demais indicadores do mês.',
    'Leia os gráficos de receitas versus despesas, fluxo e evolução sem esquecer o mês selecionado.',
    'Use o card de saúde financeira para acompanhar pontuação, margem, comprometimento e alertas.',
    'Ative, desative e reordene blocos em Configurações → Dashboard e Personalização.',
    'Use Organizar módulos quando quiser alterar largura, altura, posição e número de colunas dos blocos compatíveis.'
  ],['Indicadores são consequência dos lançamentos e vínculos. Corrija a origem do dado, não o número do card.'],['dashboard','visão geral','saúde financeira','gráficos','indicadores']),

  article('nova-receita','lancamentos','Adicionar uma receita','Receitas podem entrar em Carteira, Conta, Reserva ou ser divididas entre Conta e Reserva.',[
    'Abra Lançamentos → Receita e clique em + Adicionar.',
    'Informe nome, categoria, valor e data.',
    'Escolha a origem: Receita própria, Rendimento, Reembolso recebido ou Repasse de terceiros.',
    'Escolha onde a receita entra: Carteira, Conta, Reserva ou Dividir entre Conta e Reserva.',
    'Selecione a conta ou reserva exigida e confirme os valores da divisão quando aplicável.',
    'Salve e confira o lançamento na lista, na Central e no saldo do destino.'
  ],['Use Rendimento para ganhos de aplicação ou reserva; use Reembolso recebido para devolver uma despesa anterior sem confundir com renda própria.'],['adicionar receita','rendimento','reembolso','repasse','dividir receita']),

  article('despesa-variavel','lancamentos','Adicionar despesa variável','Despesa variável registra gastos pontuais e permite controlar pagamento, origem, cartão, parcela, loja e observações.',[
    'Abra Lançamentos → Despesa variável e clique em + Adicionar.',
    'Informe nome, categoria, valor, data e, quando útil, local da compra.',
    'Escolha a forma: Carteira, Conta, Reserva ou Crédito.',
    'Selecione a conta, reserva ou cartão correspondente. O Borion bloqueia o salvamento quando o vínculo obrigatório falta.',
    'Defina Pago ou Em aberto. Em aberto não baixa o saldo até a quitação.',
    'No crédito, escolha à vista ou parcelado e confira a entrada das parcelas na fatura.',
    'Salve e valide o registro na aba, na Central e no módulo financeiro relacionado.'
  ],[],['despesa variável','gasto','pago','em aberto','local da compra']),

  article('despesa-fixa','lancamentos','Adicionar despesa fixa e recorrência','Despesas fixas acompanham compromissos recorrentes e podem manter versões futuras sem perder o histórico antigo.',[
    'Abra Lançamentos → Despesa fixa e clique em + Adicionar.',
    'Preencha nome, categoria, valor, data de referência, forma e vínculo financeiro.',
    'Defina o status de pagamento.',
    'Quando usar cartão, escolha o cartão correto; a despesa também será refletida na fatura.',
    'Ao editar uma despesa recorrente, escolha o alcance adequado para não alterar meses históricos por engano.',
    'Ao excluir a partir de um mês, confirme que deseja preservar ocorrências passadas.'
  ],['Uma alteração de preço deve começar no mês em que o novo valor passou a valer.'],['despesa fixa','recorrente','mensal','editar próximos meses']),

  article('formas-pagamento','lancamentos','Carteira, Conta, Reserva e Crédito','A forma de pagamento define qual módulo recebe o efeito financeiro.',[
    'Carteira usa a conta especial de dinheiro físico.',
    'Conta usa Pix, débito, transferência bancária ou outro pagamento que sai diretamente de uma conta.',
    'Reserva retira o valor de um cofrinho escolhido e exige saldo suficiente.',
    'Crédito cria compra e parcelas no cartão, sem reduzir imediatamente a conta bancária.',
    'Quando o pagamento ainda não ocorreu, marque Em aberto para registrar a obrigação sem baixar saldo.'
  ],[],['forma de pagamento','carteira','pix','débito','reserva','crédito']),

  article('compra-parcelada','lancamentos','Lançar compra parcelada no cartão','O valor total fica ligado à compra; cada competência recebe apenas a parcela correspondente.',[
    'Na despesa variável ou fixa, escolha Crédito.',
    'Selecione o cartão e informe o valor total da compra.',
    'Escolha a quantidade de parcelas e o dia da compra/entrada na fatura quando solicitado.',
    'Confira a previsão das parcelas e a primeira competência calculada com base no fechamento do cartão.',
    'Salve e abra Cartões e Contas → Faturas para conferir todas as parcelas.',
    'Edite a compra de origem quando precisar corrigir valor, categoria, loja ou parcelamento.'
  ],['Não lance manualmente cada parcela como uma nova despesa. Isso duplica a dívida.'],['parcelado','parcelas','dia da fatura','fechamento','crédito']),

  article('status-pagamento','lancamentos','Pago, Em aberto, Vencido e estorno','O status controla se a obrigação já afetou o saldo e como aparece nos relatórios.',[
    'Marque Pago quando o dinheiro já saiu da conta, carteira ou reserva.',
    'Use Em aberto quando a despesa existe, mas ainda não foi quitada.',
    'O sistema pode identificar vencimento quando a data passou e o registro continua aberto.',
    'Use o botão ✔ ou ↺ nas listas para alternar o estado quando disponível.',
    'Ao estornar, preserve o vínculo com o lançamento original para que o histórico continue auditável.'
  ],[],['pago','em aberto','vencido','estorno','quitar']),

  article('editar-excluir','lancamentos','Editar, excluir e desfazer','As ações usam o registro original e protegem os efeitos financeiros vinculados.',[
    'Clique no lápis do registro para abrir a edição completa.',
    'Corrija campos e salve. O Borion reverte o efeito antigo antes de aplicar o novo quando necessário.',
    'Ao excluir, leia a confirmação: compras parceladas, recorrências e importações podem oferecer regras específicas.',
    'Quando aparecer a opção Desfazer, use-a imediatamente para restaurar o item removido.',
    'Depois de alterações críticas, confira a conta, reserva, fatura e Central.'
  ],[],['editar lançamento','excluir','desfazer','corrigir']),

  article('central-lancamentos','lancamentos','Usar a Central de lançamentos','A Central reúne receitas, despesas, transferências, reservas e estornos em uma única pesquisa financeira.',[
    'Abra Lançamentos → Central.',
    'Pesquise pelo texto do registro.',
    'Filtre por tipo, origem do pagamento, reserva, conta, status, categoria e período.',
    'Ordene por data, valor ou ordem alfabética.',
    'Use os chips ativos para remover um filtro específico.',
    'Clique no lápis para abrir o registro na área de origem.'
  ],[],['central','filtros avançados','pesquisar lançamentos','ordenar valor']),

  article('assinaturas','lancamentos','Cadastrar e controlar assinaturas','Assinaturas geram ocorrências previstas e cobranças sem duplicar os meses já processados.',[
    'Abra Lançamentos → Assinaturas e clique para adicionar.',
    'Informe nome, categoria, valor, periodicidade, dia de cobrança e data de início.',
    'Escolha a forma de pagamento e o cartão ou conta quando necessário.',
    'Use Pausar para interromper cobranças futuras sem criar cobranças retroativas ao retomar.',
    'Use Retomar para voltar a processar a partir do mês atual.',
    'Ao excluir uma assinatura, escolha preservar pagamentos anteriores como lançamentos financeiros.'
  ],['Confira assinaturas após mudar cartão, vencimento ou valor.'],['assinatura','recorrência anual','pausar','retomar','cobrança']),

  article('contas-carteira','cartoes','Cadastrar conta e entender a Carteira','Contas representam onde existe saldo disponível; Carteira é a conta especial de dinheiro físico.',[
    'Abra Cartões e Contas e acesse a área de contas.',
    'Cadastre nome, saldo inicial e demais dados exibidos pelo formulário.',
    'Use uma conta para Pix, débito, transferências e pagamento de fatura.',
    'Use Carteira somente para dinheiro em espécie.',
    'Não exclua uma conta com lançamentos vinculados. Arquive ou corrija os vínculos primeiro quando o sistema bloquear.',
    'Confira o saldo calculado após importar ou editar lançamentos antigos.'
  ],[],['conta bancária','carteira','saldo inicial','arquivar conta']),

  article('cartao-cadastro','cartoes','Cadastrar cartão de crédito','Fechamento, vencimento e conta de pagamento determinam a competência das compras e a baixa da fatura.',[
    'Abra Cartões e Contas e adicione um cartão.',
    'Informe nome ou banco, limite, dia de fechamento e dia de vencimento.',
    'Vincule a conta usada normalmente para pagar a fatura.',
    'Salve e faça uma compra de teste de baixo valor para validar a competência.',
    'Ao trocar fechamento ou vencimento, confira compras já existentes antes de confirmar alterações amplas.'
  ],[],['cadastrar cartão','limite','fechamento','vencimento','conta pagamento']),

  article('faturas','cartoes','Ler e pagar uma fatura','A fatura consolida compras e parcelas da competência; o pagamento é o momento em que a conta bancária é reduzida.',[
    'Abra Cartões e Contas e selecione o cartão ou a fatura desejada.',
    'Confira compras, parcelas, total, vencimento e status.',
    'Use os controles de Pago/Em aberto para acompanhar a quitação.',
    'Ao pagar, escolha ou confirme a conta de saída e o valor efetivamente pago.',
    'Pagamentos parciais ou ajustes devem permanecer explicados no histórico.',
    'Não registre o pagamento da fatura como uma nova despesa variável se as compras já estão lançadas; isso duplica o gasto.'
  ],['A despesa econômica ocorre nas compras. O pagamento da fatura apenas quita a dívida e movimenta a conta.'],['fatura','pagar cartão','dívida','pagamento parcial','duplicidade']),

  article('transferencias','reservas','Transferir entre Carteira, Contas e Reservas','Transferências preservam o patrimônio total e alteram apenas onde o dinheiro está.',[
    'Abra Lançamentos → Transferências ou use o atalho disponível em Cartões e Contas.',
    'Escolha a origem: Carteira, Conta ou Reserva.',
    'Escolha o destino: Carteira, Conta ou Reserva.',
    'Informe valor, data e descrição.',
    'O sistema valida saldo de reservas e impede origem e destino incompatíveis.',
    'Salve e confira os dois lados da movimentação.'
  ],[],['transferir','origem destino','conta para reserva','resgatar']),

  article('criar-reserva','reservas','Criar e configurar uma reserva','Reservas separam dinheiro por objetivo sem misturar com o saldo disponível das contas.',[
    'Abra Reserva e clique para criar uma nova.',
    'Defina nome, conta vinculada, saldo inicial, categoria, status, cores e observação.',
    'Informe valor-alvo e prazo quando houver meta.',
    'Ative Meta de Patrimônio para espelhar a reserva também em Patrimônio → Metas.',
    'Salve e use Reservar, Resgatar, Rendimento ou Ajuste para manter histórico de movimentações.'
  ],[],['criar reserva','cofrinho','meta','prazo','cor']),

  article('movimentos-reserva','reservas','Reservar, resgatar, render e ajustar','Cada tipo de movimento possui significado próprio e deve ser usado para manter relatórios corretos.',[
    'Reservar transfere dinheiro de uma conta ou carteira para a reserva.',
    'Resgatar transfere dinheiro da reserva para uma conta ou carteira.',
    'Rendimento aumenta a reserva e registra o ganho separado.',
    'Ajuste corrige divergência de saldo sem fingir que ocorreu receita, despesa ou transferência comum.',
    'Enviar para outra reserva transfere entre objetivos sem alterar o patrimônio total.',
    'Edite ou exclua movimentos antigos somente após conferir os efeitos nos saldos relacionados.'
  ],[],['reservar','resgatar','rendimento reserva','ajuste','outra reserva']),

  article('relatorios-reserva','reservas','Relatórios, histórico e fechamento mensal das reservas','O Borion cria relatórios mensais para mostrar saldo inicial, entradas, saídas, rendimentos e saldo final.',[
    'Abra Reserva e procure o histórico ou relatórios de meses anteriores.',
    'Selecione o mês desejado.',
    'Compare saldo inicial, saldo final, variação, entradas, saídas e rendimentos.',
    'Abra o detalhamento de uma reserva para conferir os movimentos do mês.',
    'O fechamento automático preserva a fotografia mensal sem exigir botão manual.'
  ],[],['relatório reserva','mês anterior','saldo inicial final','fechamento automático']),

  article('ordenar-reservas','reservas','Ordenar reservas e outros itens','A ordem pode ser alfabética, cronológica ou totalmente personalizada por perfil.',[
    'Abra o seletor de ordenação da lista desejada.',
    'Escolha A–Z, Z–A, Mais recentes, Mais antigas ou Personalizada.',
    'Na ordem personalizada, ative o modo de organização.',
    'Arraste itens ou use as setas para mudar a posição.',
    'Conclua a organização para bloquear movimentos acidentais.',
    'A ordem fica salva no perfil e reaparece nos seletores compatíveis.'
  ],['A mesma lógica é usada para categorias, módulos, contas, cartões e outras listas habilitadas.'],['ordem','ordenar','arrastar','a-z','personalizada']),

  article('investimentos','patrimonio','Cadastrar e acompanhar investimentos','Investimentos são ativos patrimoniais e podem mostrar saldo, aportes, retiradas e evolução.',[
    'Abra Investimentos e adicione um ativo.',
    'Informe nome, tipo, instituição, valor e demais campos disponíveis.',
    'Registre aportes, retiradas ou ajustes conforme o fluxo real.',
    'Valores negativos aparecem destacados para facilitar correção.',
    'Confira o reflexo no patrimônio e nos gráficos.',
    'Desative o módulo em Configurações somente para ocultar a área; os dados continuam preservados.'
  ],[],['investimento','ativo','aporte','retirada','valor negativo']),

  article('patrimonio','patrimonio','Bens, dívidas, caixa e patrimônio líquido','Patrimônio combina contas, reservas, investimentos, bens e dívidas para mostrar a posição financeira real.',[
    'Abra Patrimônio e confira os módulos ativos.',
    'Cadastre bens com nome, valor, categoria e informações úteis.',
    'Cadastre dívidas ou obrigações que não estejam completamente representadas por faturas.',
    'Compare patrimônio bruto, dívidas e patrimônio líquido.',
    'Use o modo de organização para mover e redimensionar módulos.',
    'Evite lançar o mesmo ativo em duas áreas; isso infla o patrimônio.'
  ],[],['patrimônio líquido','bens','dívidas','caixa','ativo']),

  article('metas','patrimonio','Criar metas patrimoniais','Metas acompanham valor atual, valor-alvo e prazo, podendo ser independentes ou vinculadas a reservas.',[
    'Abra Patrimônio → Metas e clique para adicionar.',
    'Defina nome, emoji, valor-alvo, valor atual, prazo, conta e cor quando disponíveis.',
    'Para uma meta lastreada em cofrinho, prefira ativá-la dentro da própria reserva.',
    'Acompanhe percentual de conclusão e valor restante.',
    'Edite ou exclua sem apagar a reserva vinculada quando a interface oferecer essa separação.'
  ],[],['meta patrimônio','objetivo','valor alvo','prazo']),

  article('agenda','agenda','Criar lembrete na Agenda Financeira','A Agenda centraliza compromissos financeiros com calendário, recorrência e notificações.',[
    'Abra Agenda Financeira e selecione o dia ou clique para adicionar.',
    'Informe título, data, valor, descrição e recorrência quando necessária.',
    'Salve e confira o item no calendário e na lista de próximos compromissos.',
    'Marque a notificação como lida ou conclua o compromisso conforme os controles disponíveis.',
    'Ao excluir uma recorrência, escolha entre somente esta ocorrência ou esta e as próximas.'
  ],[],['agenda','lembrete','calendário','recorrência','vencimento']),

  article('notificacoes','agenda','Sino, popups e avisos','O sino guarda notificações; os popups apenas exibem avisos temporários e podem ser desativados separadamente.',[
    'Clique no sino para abrir o painel de notificações.',
    'Leia, marque ou limpe os avisos usando os controles do painel.',
    'Em Configurações → Módulos, ative ou desative Popups de notificação.',
    'Escolha a duração de 30, 40 ou 50 segundos.',
    'Desativar popup não apaga lembretes nem remove o sino.'
  ],[],['sino','popup','notificação','avisos']),

  article('cheques','agenda','Controlar cheques recebidos e emitidos','O módulo registra cheques, lotes, vencimentos, baixas, devoluções e reapresentações.',[
    'Ative Cheques em Configurações → Módulos.',
    'Abra Cheques e escolha recebido ou emitido conforme a operação.',
    'Informe identificação, valor, banco, datas, favorecido ou emitente e observações.',
    'Acompanhe status e vencimentos no painel.',
    'Registre baixa quando compensado, devolução quando recusado e reapresentação quando enviado novamente.',
    'Use filtros e lotes para organizar grande quantidade de cheques.'
  ],[],['cheque recebido','cheque emitido','lote','baixa','devolução','reapresentação']),

  article('importar-arquivo','importacao','Importar CSV, OFX, TXT ou PDF textual','A importação lê o arquivo, transforma linhas em lançamentos revisáveis e só aplica efeitos após sua confirmação.',[
    'Abra Importar Extrato.',
    'Selecione CSV, OFX, TXT ou PDF com texto reconhecível.',
    'Escolha a conta de destino e confira banco, datas, nomes, valores e tipo sugerido.',
    'Corrija categoria, status, conta e inclusão linha por linha.',
    'Revise avisos de duplicidade e desmarque registros indevidos.',
    'Confirme a importação e confira o resumo final antes de sair.'
  ],['Faça backup antes de importar muitos registros.'],['csv','ofx','txt','pdf','importar extrato']),

  article('duplicidade-importacao','importacao','Evitar duplicidade na importação','O Borion compara chaves, datas, nomes, valores, conta e metadados para sinalizar registros repetidos.',[
    'Leia as etiquetas “Já importado”, “Duplicado no lote” ou “Pendente”.',
    'Mantenha desmarcados os duplicados reais.',
    'Inclua mesmo assim somente quando duas operações idênticas realmente aconteceram.',
    'Use a revisão linha por linha antes de confirmar.',
    'Depois da importação, compare o saldo e a quantidade de registros com o extrato original.'
  ],[],['duplicado','já importado','duplicidade','reconciliação']),

  article('regras-comerciante','importacao','Aproveitar preferências aprendidas na importação','O sistema pode reutilizar regras de comerciante e vínculos para reduzir correções repetitivas.',[
    'Durante a revisão, corrija nome, tipo, categoria e destino financeiro.',
    'Salve preferências quando a interface oferecer essa opção.',
    'Nas próximas importações, confira a sugestão antes de aceitar.',
    'Atualize regras quando o mesmo nome passar a representar outra operação.',
    'Não confie cegamente em uma regra antiga para entradas e saídas com nomes semelhantes.'
  ],[],['regra comerciante','preferência importação','categoria automática']),

  article('integracoes','integracoes','Conectar Amanda Estética e Marco Iris','As integrações recebem registros externos, convertem campos e criam lançamentos nativos no Borion.',[
    'Abra Configurações → Integrações e escolha o aplicativo de origem.',
    'Conecte ou carregue os dados solicitados pela integração.',
    'Abra a aba Vínculos para revisar os campos detectados.',
    'Mapeie tipos, categorias, origem da receita, formas de pagamento, conta, carteira, reserva e status.',
    'Salve os vínculos e execute a sincronização.',
    'Confira o relatório: IDs permanentes impedem reimportação duplicada do mesmo registro.'
  ],['A sincronização é de entrada. Depois de importado, o lançamento pode ser editado livremente no Borion.'],['amanda estética','marco iris','integração','vínculos','sincronizar']),

  article('excluir-integrado','integracoes','Excluir lançamento vindo de integração','Ao excluir um item importado, você escolhe se o ID poderá voltar ou ficará ignorado.',[
    'Abra o lançamento integrado e clique em excluir.',
    'Escolha “Excluir e permitir importar novamente” quando a origem ainda deve poder reenviar o item.',
    'Escolha “Excluir e ignorar permanentemente” quando aquele ID nunca mais deve entrar.',
    'Confirme e execute nova sincronização somente depois de entender a escolha.',
    'Use a opção permanente com cuidado; ela mantém o ID na lista de ignorados.'
  ],[],['excluir integração','reimportar','ignorar permanentemente']),

  article('modulos-dashboard','personalizacao','Ativar módulos e montar o dashboard','Módulos controlam visibilidade; Dashboard controla quais blocos aparecem na Visão geral.',[
    'Abra Configurações → Módulos para ativar Investimentos, Agenda, Cheques, Reserva e Importar extratos.',
    'Desativar oculta a área e preserva os dados.',
    'Abra Configurações → Dashboard para ligar ou desligar blocos da Visão geral.',
    'Ao reativar um bloco, ele pode subir para o topo para facilitar a montagem.',
    'Use Restaurar dashboard padrão quando quiser desfazer a seleção.'
  ],[],['ativar módulo','ocultar módulo','dashboard','restaurar']),

  article('categorias','personalizacao','Criar, renomear, colorir e ordenar categorias','Categorias são separadas entre Receita, Despesa fixa e Despesa variável.',[
    'Abra Configurações → Categorias.',
    'Crie uma categoria no grupo correto.',
    'Escolha a cor, renomeie ou exclua pelos controles da etiqueta.',
    'O sistema pode bloquear exclusão quando existem lançamentos vinculados.',
    'Escolha A–Z, Z–A, recentes, antigas ou ordem personalizada.',
    'A ordem salva reaparece nos formulários e assinaturas compatíveis.'
  ],[],['categoria','cor categoria','renomear','excluir categoria','ordem']),

  article('personalizar-interface','personalizacao','Tema, fonte e modo de interface','A aparência pode seguir o dispositivo ou ser forçada por preferência.',[
    'Abra Configurações → Personalização.',
    'Escolha Automático, Smartphone Mode ou Modo Pro.',
    'Escolha tema Escuro, Claro ou Tema do sistema.',
    'Escolha a fonte global do aplicativo.',
    'Aplique cores e demais preferências disponíveis.',
    'Teste a mudança em uma tela longa e em um formulário antes de manter.'
  ],[],['tema claro','tema escuro','fonte','smartphone mode','modo pro']),

  article('organizar-modulos','personalizacao','Reordenar e redimensionar módulos','O editor de layout muda posição, largura, altura e quantidade de colunas sem alterar os dados.',[
    'Abra a tela compatível e clique em Organizar módulos.',
    'Escolha entre 2 e 6 colunas quando o controle estiver disponível.',
    'Arraste o módulo pelo puxador ⠿.',
    'Use L −/+ para largura e os controles de altura para reduzir, automático ou aumentar.',
    'Os espaços livres são preenchidos automaticamente.',
    'Clique em Concluir para bloquear o layout.',
    'Use Restaurar para voltar ao padrão daquele conjunto.'
  ],['No celular, os módulos voltam para uma coluna para preservar leitura e scroll.'],['organizar módulos','redimensionar','altura','largura','colunas','arrastar']),

  article('backup-manual','backup','Salvar Drive & Local','O botão unificado usa o mesmo snapshot para o Google Drive e para o dispositivo, reduzindo divergências.',[
    'Abra Configurações ou use o atalho fixo do Modo Pro.',
    'Clique em SALVAR DRIVE&LOCAL.',
    'Aguarde a confirmação de cada destino.',
    'No Drive, o Borion atualiza o arquivo atual e registra backup manual.',
    'No dispositivo, grava no histórico local e, se houver pasta autorizada, cria um JSON em Backups_Borion.',
    'Se a pasta não estiver disponível, o navegador baixa o JSON como fallback.'
  ],['Ctrl+S usa o mesmo fluxo de salvamento manual.'],['salvar drive local','ctrl+s','backup manual','json']),

  article('google-drive','backup','Conectar, sincronizar e resolver conflito no Google Drive','O indicador do topo mostra conexão, salvamento pendente ou conflito com uma versão mais nova.',[
    'Conecte a conta Google e selecione ou crie a pasta usada pelo Borion.',
    'Confira conta e nome da pasta em Configurações → Backups.',
    'Use o indicador do topo para sincronizar manualmente quando necessário.',
    'Em conflito, escolha Recarregar para usar a versão do Drive ou Salvar minha versão para sobrescrever conscientemente.',
    'Nunca escolha sobrescrever sem entender qual dispositivo contém os dados mais recentes.',
    'Abra a pasta no Drive para confirmar current.json e a pasta de backups.'
  ],[],['google drive','conflito','current.json','sincronizar','recarregar']),

  article('pasta-local','backup','Configurar pasta local de backups','Navegadores compatíveis podem gravar cópias extras em uma pasta escolhida pelo usuário.',[
    'Abra Configurações → Backups.',
    'Clique em Escolher pasta de backups e autorize o acesso.',
    'O Borion cria ou usa a subpasta Backups_Borion.',
    'Após reabrir o navegador, reconecte quando a permissão for solicitada.',
    'Use Trocar pasta ou Desconectar pasta para alterar o destino.',
    'Confira periodicamente se os arquivos JSON realmente estão sendo criados.'
  ],[],['pasta backup','backups_borion','reconectar pasta','file system access']),

  article('exportar-importar','backup','Exportar e restaurar perfil ou conta','Arquivos JSON podem representar um perfil ou uma conta completa com múltiplos perfis.',[
    'Gere o backup pelo botão apropriado e guarde o arquivo fora do navegador.',
    'Antes de importar, identifique se o arquivo contém um perfil ou todos os perfis da conta.',
    'Na revisão de importação, escolha criar, substituir, manter ou excluir conforme as opções exibidas.',
    'Confira nomes e identificadores curtos para não sobrescrever o perfil errado.',
    'Finalize e abra cada perfil importado para validar saldos, contas, cartões e reservas.',
    'Mantenha o arquivo original até concluir toda a conferência.'
  ],[],['exportar json','importar backup','restaurar perfil','conta completa']),

  article('seguranca','backup','Senhas, exclusão e proteção dos dados','A segurança depende do tipo de acesso, da conta conectada e de backups verificáveis.',[
    'Use senha de conta forte quando estiver conectado à nuvem.',
    'Use senha de perfil quando várias pessoas compartilham o mesmo dispositivo.',
    'Altere senhas somente em telas oficiais do Borion e confirme a senha atual quando solicitado.',
    'Antes de excluir perfil ou conta, faça backup completo e valide o arquivo.',
    'Não envie current.json ou backups financeiros a terceiros sem necessidade.',
    'Ao usar computador compartilhado, saia da conta e não marque “manter conectado”.'
  ],[],['segurança','senha','excluir conta','dados pessoais','privacidade']),

  article('smartphone','mobile','Usar o Smartphone Mode','O Smartphone Mode prioriza toque, scroll vertical, barra inferior e formulários adaptados.',[
    'Deixe a interface em Automático ou force Smartphone Mode em Personalização.',
    'Use a barra inferior para Início, Lançar, Reserva, Cartões e Contas.',
    'Abra o menu lateral para acessar todas as áreas restantes.',
    'Role pelo conteúdo principal; modais e gavetas possuem scroll próprio quando abertos.',
    'Use Salvar e atualizar no menu do smartphone quando precisar forçar persistência e recarregar.',
    'O botão voltar fecha a camada atual antes de tentar sair do aplicativo.'
  ],[],['celular','android','smartphone mode','scroll','barra inferior']),

  article('instalar-pwa','mobile','Instalar o Borion como aplicativo','Como PWA, o Borion pode abrir em janela própria e continuar usando cache local.',[
    'Abra o Borion em navegador compatível.',
    'Use a opção Instalar aplicativo ou Adicionar à tela inicial do navegador.',
    'Confirme o ícone e abra pelo atalho criado.',
    'Após uma atualização, feche e reabra o app; use recarregamento forçado se a versão antiga permanecer em cache.',
    'Mantenha conexão disponível para sincronização e para recursos que dependem da nuvem.'
  ],[],['instalar pwa','adicionar tela inicial','atalho','cache']),

  article('problemas-sincronizacao','mobile','Quando algo não salva ou não sincroniza','A primeira tarefa é descobrir se o problema está na memória local, no Drive, no perfil aberto ou em um conflito.',[
    'Pare de fazer novas alterações até identificar qual dispositivo possui a versão correta.',
    'Confira perfil ativo, indicador de nuvem e pasta conectada.',
    'Faça um backup manual local da versão que está aberta.',
    'Em conflito, compare horário e conteúdo antes de escolher recarregar ou sobrescrever.',
    'Reabra o perfil e valide se os dados persistiram.',
    'Se o problema continuar, preserve current.json, backups e o arquivo usado antes de qualquer tentativa de reparo.'
  ],['Nunca apague backups para “limpar” um erro de sincronização. Eles são a trilha de recuperação.'],['não salva','sincronização','conflito','perfil errado','current.json corrompido']),

  article('problemas-layout','mobile','Quando a tela trava, não rola ou fica fora do lugar','Problemas de layout costumam vir de camada aberta, zoom, cache antigo ou modo de interface incorreto.',[
    'Feche modais, painel de notificações e menu lateral.',
    'Confirme o modo de interface em Configurações → Personalização.',
    'Volte o zoom do navegador para 100%.',
    'Feche e reabra o PWA ou faça recarregamento forçado no navegador.',
    'Teste a mesma tela sem teclado virtual aberto.',
    'Se apenas uma área falhar, anote tela, ação, dispositivo e orientação antes de relatar o bug.'
  ],[],['scroll travado','tela fora','layout mobile','zoom','cache antigo'])
];

function group(id,category,title,items){return {id,category,title,items};}
const FEATURE_GROUPS=[
  group('acesso','inicio','Acesso, conta e perfis',[
    'Entrar com conta conectada à nuvem.','Entrar no modo local sem conta.','Criar o primeiro perfil financeiro.','Criar perfis adicionais até o limite permitido.','Selecionar perfil na tela de entrada.','Proteger perfil com senha opcional.','Exibir ou ocultar senha nos campos compatíveis.','Manter perfil conectado neste dispositivo.','Trocar de perfil sem sair da conta.','Sair da conta conectada.','Editar nome do perfil.','Editar e-mail informativo do perfil.','Alterar cor do avatar.','Adicionar imagem de avatar.','Remover ou substituir imagem de avatar.','Criar ou alterar senha do perfil.','Validar senha atual antes de alteração protegida.','Gerar backup de um único perfil.','Excluir perfil com confirmação.','Manter os dados de perfis completamente isolados.'
  ]),
  group('shell','navegacao','Estrutura, navegação e pesquisa',[
    'Abrir Visão geral pelo menu.','Abrir Lançamentos pelo menu.','Abrir Investimentos quando o módulo está ativo.','Abrir Patrimônio.','Abrir Reserva quando o módulo está ativo.','Abrir Cartões e Contas.','Abrir Agenda Financeira quando ativa.','Abrir Cheques quando ativo.','Abrir Importar Extrato quando ativo.','Abrir Configurações.','Reordenar módulos do menu lateral por perfil.','Abrir e fechar menu lateral no celular.','Fechar menu tocando no fundo.','Usar barra inferior do Smartphone Mode.','Voltar pelo Android fechando a camada atual primeiro.','Pesquisar globalmente compras, contas e categorias.','Abrir resultado da pesquisa global.','Navegar para mês anterior.','Navegar para mês seguinte.','Exibir competência atual por extenso.','Exibir data e hora da atualização.','Filtrar por todos os bancos.','Filtrar por uma conta.','Filtrar por várias contas.','Limpar filtro de bancos.','Ocultar valores financeiros.','Mostrar valores financeiros.','Abrir painel de notificações pelo sino.','Exibir contador de notificações não lidas.','Exibir status local, Drive, sincronização ou conflito no topo.'
  ]),
  group('overview','navegacao','Visão geral e indicadores',[
    'Exibir receita do mês.','Exibir despesas do mês.','Exibir saldo do mês.','Exibir valor destinado a investir.','Exibir saldo total das contas.','Exibir reservas quando o módulo está ativo.','Exibir investimentos quando o módulo está ativo.','Exibir bens.','Exibir dívidas.','Exibir patrimônio bruto.','Exibir patrimônio líquido.','Exibir dívida de cartões.','Exibir fluxo mensal.','Exibir comparação de receitas e despesas.','Exibir evolução em 12 meses.','Exibir composição patrimonial.','Exibir resumo de reservas.','Exibir metas.','Exibir próximos compromissos.','Exibir saúde financeira mensal.','Exibir saúde financeira anual.','Calcular pontuação de saúde financeira.','Exibir margem e proporções financeiras.','Mostrar alertas e interpretações de saúde.','Ativar ou ocultar cada widget do dashboard.','Restaurar widgets padrão.','Reordenar módulos compatíveis.','Redimensionar largura dos módulos.','Redimensionar altura dos módulos.','Escolher quantidade de colunas.','Restaurar layout padrão.'
  ]),
  group('receitas','lancamentos','Receitas',[
    'Abrir aba Receita.','Adicionar receita.','Editar receita.','Excluir receita com confirmação.','Desfazer exclusão quando oferecido.','Informar nome.','Selecionar categoria de receita.','Informar valor com máscara monetária.','Usar data automática atual.','Escolher data manualmente.','Classificar como Receita própria.','Classificar como Rendimento.','Classificar como Reembolso recebido.','Classificar como Repasse de terceiros.','Enviar receita para Carteira.','Enviar receita para Conta.','Enviar receita para Reserva.','Dividir receita entre Conta e Reserva.','Validar soma da divisão.','Exigir conta quando necessária.','Exigir reserva quando necessária.','Atualizar saldo do destino.','Exibir receita na Central.','Ordenar receitas por data crescente.','Ordenar receitas por data decrescente.','Filtrar receitas por período.','Filtrar receitas por banco.','Pesquisar receita por nome ou categoria.'
  ]),
  group('variaveis','lancamentos','Despesas variáveis',[
    'Abrir aba Despesa variável.','Adicionar despesa variável.','Editar despesa variável.','Excluir despesa variável.','Desfazer exclusão quando oferecido.','Informar nome.','Selecionar categoria variável.','Informar valor com máscara monetária.','Usar data automática atual.','Escolher data manualmente.','Informar local da compra.','Adicionar observação.','Pagar pela Carteira.','Pagar por Conta.','Pagar por Reserva.','Pagar no Crédito.','Selecionar conta obrigatória.','Selecionar reserva obrigatória.','Validar saldo da reserva.','Selecionar cartão obrigatório.','Lançar crédito à vista.','Lançar crédito parcelado.','Informar quantidade de parcelas.','Calcular competência da primeira parcela.','Guardar valor total da compra.','Exibir valor da parcela na competência.','Marcar como Pago.','Marcar como Em aberto.','Alternar Pago/Em aberto pela lista.','Identificar vencimento de item aberto.','Aplicar efeito no saldo somente quando devido.','Reverter efeito antigo ao editar.','Exibir despesa na Central.','Ordenar por data crescente.','Ordenar por data decrescente.','Filtrar por período.','Filtrar por banco.','Pesquisar por nome ou categoria.'
  ]),
  group('fixas','lancamentos','Despesas fixas',[
    'Abrir aba Despesa fixa.','Adicionar despesa fixa.','Editar despesa fixa.','Excluir despesa fixa.','Excluir a partir de determinada competência.','Preservar meses anteriores.','Informar nome, categoria, valor e data.','Usar máscara monetária.','Selecionar Carteira, Conta, Reserva ou Crédito.','Exigir vínculo financeiro obrigatório.','Criar despesa fixa no cartão.','Refletir despesa fixa na fatura.','Marcar como Pago.','Marcar como Em aberto.','Alternar status pela lista.','Atualizar meses futuros conforme regra de edição.','Manter histórico de versões.','Ordenar por data crescente.','Ordenar por data decrescente.','Filtrar por período e banco.','Pesquisar por nome ou categoria.'
  ]),
  group('assinaturas','lancamentos','Assinaturas',[
    'Abrir aba Assinaturas.','Cadastrar assinatura.','Editar assinatura.','Excluir assinatura.','Definir periodicidade mensal.','Definir periodicidade anual.','Definir dia de cobrança.','Definir data de início.','Definir forma de pagamento.','Vincular conta ou cartão.','Gerar ocorrência prevista.','Identificar ocorrência vencida.','Materializar cobrança sem duplicar.','Pausar assinatura.','Retomar sem cobrança retroativa.','Manter pagamentos antigos ao excluir.','Exibir próxima cobrança.','Exibir status prevista, vencida, paga, cobrada, pausada ou falhou.','Reprocessar cobrança com falha.','Sincronizar cobranças pendentes ao entrar no perfil.'
  ]),
  group('central','lancamentos','Central de lançamentos e filtros',[
    'Reunir receitas.','Reunir despesas fixas.','Reunir despesas variáveis.','Reunir transferências.','Reunir movimentos de reserva.','Reunir estornos.','Pesquisar por texto.','Filtrar por tipo de movimentação.','Filtrar por origem Conta/Carteira.','Filtrar por origem Reserva.','Filtrar por reserva específica.','Filtrar por conta específica.','Filtrar por status.','Filtrar por categoria.','Filtrar por período rápido.','Filtrar por intervalo personalizado.','Ordenar por data mais recente.','Ordenar por data mais antiga.','Ordenar por maior valor.','Ordenar por menor valor.','Ordenar alfabeticamente.','Exibir chips de filtros ativos.','Remover um filtro por chip.','Limpar todos os filtros.','Carregar mais resultados.','Abrir edição no módulo de origem.'
  ]),
  group('contas','cartoes','Contas e Carteira',[
    'Manter Carteira como conta de dinheiro físico.','Cadastrar conta bancária.','Editar conta.','Arquivar conta quando aplicável.','Excluir conta sem vínculos.','Bloquear exclusão de conta vinculada.','Exibir saldo atual calculado.','Definir saldo inicial.','Ajustar saldo por lançamentos pagos.','Reverter saldo ao editar ou excluir.','Selecionar conta em receitas.','Selecionar conta em despesas.','Selecionar conta em transferências.','Selecionar conta para pagamento de fatura.','Filtrar telas pela conta.','Exibir somente bancos em seletores apropriados.','Preservar nome histórico quando conta é arquivada.','Ordenar contas.','Reordenar contas manualmente.','Pesquisar conta na busca global.'
  ]),
  group('cartoes','cartoes','Cartões e faturas',[
    'Cadastrar cartão de crédito.','Editar cartão.','Excluir cartão sem vínculos incompatíveis.','Informar banco ou nome do cartão.','Informar limite.','Informar dia de fechamento.','Informar dia de vencimento.','Vincular conta de pagamento.','Calcular competência pela data da compra e fechamento.','Criar compra à vista.','Criar compra parcelada.','Distribuir parcelas em competências futuras.','Exibir parcela atual.','Exibir valor total da compra na origem.','Exibir loja/local da compra.','Agrupar compras em fatura.','Exibir total da fatura.','Exibir vencimento da fatura.','Marcar fatura como paga.','Voltar fatura para em aberto.','Pagar fatura usando conta.','Reduzir conta apenas no pagamento da fatura.','Evitar duplicar gasto ao pagar fatura.','Manter controle de fatura mesmo sem aparecer em Despesas.','Editar compra vinculada.','Excluir compra e parcelas vinculadas conforme regra.','Exibir dívida total dos cartões.','Ordenar cartões.','Reordenar cartões manualmente.','Filtrar e navegar por competência.'
  ]),
  group('transferencias','reservas','Transferências financeiras',[
    'Abrir aba Transferências.','Criar nova transferência.','Editar transferência.','Excluir transferência antiga quando permitido.','Transferir Carteira para Conta.','Transferir Conta para Carteira.','Transferir Conta para Reserva.','Transferir Reserva para Conta.','Transferir Carteira para Reserva.','Transferir Reserva para Carteira.','Transferir Reserva para outra Reserva.','Impedir origem e destino iguais.','Validar saldo de reserva de origem.','Não registrar transferência como receita.','Não registrar transferência como despesa.','Atualizar os dois lados da movimentação.','Informar data.','Informar descrição.','Filtrar por tipo de transferência.','Ordenar por data crescente ou decrescente.','Exibir na Central.'
  ]),
  group('reservas','reservas','Reservas e cofrinhos',[
    'Ativar ou desativar módulo Reserva.','Criar reserva.','Editar reserva.','Excluir reserva com confirmação.','Definir nome.','Vincular conta.','Definir saldo inicial.','Definir valor-alvo.','Definir prazo.','Definir categoria.','Definir status ativa ou inativa.','Definir cor do card.','Definir cor do valor.','Adicionar observação.','Ativar Meta de Patrimônio vinculada.','Sincronizar meta quando saldo muda.','Reservar dinheiro.','Resgatar dinheiro.','Adicionar rendimento.','Calcular rendimento sobre saldo quando disponível.','Registrar ajuste positivo.','Registrar ajuste negativo.','Enviar para outra reserva.','Validar saldo antes de saída.','Editar movimento de reserva.','Excluir movimento de reserva.','Reverter efeitos do movimento editado ou excluído.','Gerar lembrete com data-alvo.','Exibir percentual da meta.','Exibir valor atual e valor-alvo.','Exibir extrato da reserva.','Exibir entradas, saídas e rendimentos.','Gerar relatório mensal automático.','Exibir saldo inicial do mês.','Exibir saldo final do mês.','Exibir variação absoluta.','Exibir variação percentual.','Consultar meses anteriores.','Ordenar A–Z.','Ordenar Z–A.','Ordenar mais recentes.','Ordenar mais antigas.','Usar ordem personalizada.','Arrastar para reordenar.','Usar setas para reordenar.','Escolher quantidade de colunas no desktop.','Preservar uma coluna no celular.'
  ]),
  group('investimentos','patrimonio','Investimentos',[
    'Ativar ou desativar módulo Investimentos.','Abrir página Investimentos.','Cadastrar ativo.','Editar ativo.','Excluir ativo.','Informar nome e tipo.','Informar instituição.','Informar valor atual.','Registrar aportes.','Registrar retiradas.','Registrar ajustes.','Exibir valores negativos em destaque.','Calcular total investido.','Refletir investimentos no patrimônio.','Exibir evolução em gráfico.','Filtrar por banco quando compatível.','Ordenar itens quando disponível.','Preservar dados ao desativar o módulo.'
  ]),
  group('patrimonio','patrimonio','Patrimônio, bens, dívidas e metas',[
    'Abrir Patrimônio.','Cadastrar bem.','Editar bem.','Excluir bem.','Cadastrar dívida.','Editar dívida.','Excluir dívida.','Exibir saldo em contas.','Exibir reservas.','Exibir investimentos.','Exibir bens.','Exibir dívidas.','Calcular patrimônio bruto.','Calcular patrimônio líquido.','Registrar fotografia histórica do patrimônio.','Cadastrar meta independente.','Editar meta.','Excluir meta com opção de desfazer.','Definir emoji da meta.','Definir valor atual.','Definir valor-alvo.','Definir prazo.','Vincular conta.','Vincular meta a reserva.','Exibir percentual de conclusão.','Organizar módulos.','Arrastar módulos.','Alterar largura.','Alterar altura.','Usar altura automática.','Escolher de 2 a 6 colunas.','Restaurar layout padrão.'
  ]),
  group('agenda','agenda','Agenda e notificações',[
    'Ativar ou desativar Agenda Financeira.','Abrir calendário mensal.','Navegar para mês anterior.','Navegar para mês seguinte.','Recolher ou expandir calendário.','Recolher ou expandir próximos compromissos.','Criar lembrete.','Editar lembrete.','Excluir lembrete único.','Excluir esta e próximas ocorrências.','Definir data.','Definir valor quando aplicável.','Definir descrição.','Definir recorrência.','Exibir compromisso no calendário.','Exibir próximos compromissos.','Gerar notificação.','Abrir painel pelo sino.','Marcar notificação como lida.','Atualizar contador de não lidas.','Ativar ou desativar popups.','Escolher popup de 30 segundos.','Escolher popup de 40 segundos.','Escolher popup de 50 segundos.','Manter notificações no sino mesmo com popup desligado.'
  ]),
  group('cheques','agenda','Cheques',[
    'Ativar ou desativar módulo Cheques.','Abrir painel de cheques.','Cadastrar cheque recebido.','Cadastrar cheque emitido.','Editar cheque.','Excluir cheque.','Informar identificação e valor.','Informar banco.','Informar emitente ou favorecido.','Informar datas.','Adicionar observações.','Agrupar em lote.','Filtrar cheques.','Acompanhar vencimento.','Registrar baixa.','Registrar devolução.','Registrar reapresentação.','Exibir indicadores do módulo.','Separar recebidos e emitidos.','Preservar histórico de status.'
  ]),
  group('import-file','importacao','Importação de arquivos',[
    'Ativar ou desativar módulo Importar extratos.','Abrir importador.','Importar CSV.','Importar OFX.','Importar TXT.','Importar PDF textual.','Detectar formato suportado.','Selecionar conta para o lote.','Interpretar data.','Interpretar nome.','Interpretar valor.','Classificar entrada ou saída.','Inferir categoria.','Editar linha importada.','Alterar tipo da linha.','Alterar categoria.','Alterar conta.','Marcar ou desmarcar inclusão.','Selecionar todas as linhas válidas.','Remover linhas desmarcadas.','Desmarcar duplicados.','Revisar alerta de duplicidade.','Incluir operação idêntica conscientemente.','Aplicar conta a todas as linhas.','Validar campos obrigatórios.','Confirmar lote.','Aplicar efeitos financeiros.','Exibir resumo final.','Registrar metadados da importação.'
  ]),
  group('integracoes','integracoes','Integrações e vínculos',[
    'Abrir Configurações → Integrações.','Selecionar Amanda Estética.','Selecionar Marco Iris Tecnologia.','Abrir aba Conexão.','Abrir aba Vínculos.','Inspecionar campos da origem.','Mapear direção entrada.','Mapear direção saída.','Mapear tipo de lançamento.','Mapear categoria.','Mapear origem da receita.','Mapear forma de pagamento.','Mapear conta.','Mapear Carteira.','Mapear Reserva.','Mapear status.','Salvar vínculos.','Sincronizar registros.','Identificar ID externo permanente.','Evitar duplicidade por ID.','Criar lançamento nativo editável.','Não sincronizar edição de volta para a origem.','Excluir e permitir reimportação.','Excluir e ignorar permanentemente.','Exibir status conectado/configurado.','Exibir revisão necessária.'
  ]),
  group('settings','personalizacao','Módulos, dashboard e personalização',[
    'Ativar Investimentos.','Ativar Agenda Financeira.','Ativar Cheques.','Ativar Reserva.','Ativar Importar extratos.','Desativar módulo sem apagar dados.','Ativar ou desativar popups.','Escolher duração dos popups.','Ativar widget do dashboard.','Ocultar widget do dashboard.','Restaurar dashboard padrão.','Criar categoria de receita.','Criar categoria fixa.','Criar categoria variável.','Renomear categoria.','Alterar cor da categoria.','Excluir categoria sem vínculos.','Bloquear exclusão de categoria vinculada.','Ordenar categorias A–Z.','Ordenar categorias Z–A.','Ordenar categorias por criação.','Reordenar categorias manualmente.','Escolher modo Automático.','Forçar Smartphone Mode.','Forçar Modo Pro.','Escolher tema escuro.','Escolher tema claro.','Seguir tema do sistema.','Escolher fonte padrão.','Escolher fonte elegante.','Escolher fonte moderna.','Escolher fonte arredondada.','Escolher fonte monoespaçada.','Personalizar cores dos indicadores.','Restaurar cores padrão.','Reordenar cards de resumo.','Ocultar cards de resumo.','Reordenar menu lateral.','Reordenar contas.','Reordenar cartões.','Reordenar reservas.','Ativar organização somente quando desejado.','Concluir organização para bloquear arraste acidental.'
  ]),
  group('backup','backup','Backup, Drive e restauração',[
    'Salvar alterações no armazenamento local.','Persistir dados no IndexedDB.','Manter fallback no localStorage.','Criar backup manual local.','Criar backup manual no Drive.','Criar o mesmo snapshot para Drive e Local.','Usar botão SALVAR DRIVE&LOCAL.','Usar Ctrl+S para salvamento manual.','Criar download JSON quando pasta falha.','Escolher pasta local de backup.','Criar subpasta Backups_Borion.','Reconectar permissão da pasta.','Trocar pasta.','Desconectar pasta.','Ver backups deste dispositivo.','Restaurar backup local.','Excluir backup local.','Conectar conta Google.','Selecionar pasta no Drive.','Atualizar current.json.','Criar backup manual no Drive.','Ver backups do Drive.','Abrir pasta do Drive.','Exibir status de sincronização.','Exibir salvamento pendente.','Detectar conflito com versão remota.','Recarregar versão do Drive.','Forçar salvamento da versão local.','Manter histórico em pasta backups.','Aplicar rotação/limpeza de backups.','Exportar perfil.','Exportar conta completa.','Enviar e-mail com instrução para anexar backup.','Importar perfil.','Importar conta com vários perfis.','Revisar plano de importação.','Criar perfil importado com nome único.','Substituir perfil escolhido.','Preservar perfil não selecionado.','Validar estrutura do JSON.','Bloquear JSON inválido.','Registrar data e versão do backup.'
  ]),
  group('security','backup','Segurança e integridade',[
    'Usar hash e salt para senha de perfil.','Validar senha antes de entrar.','Alterar senha de conta conectada.','Recuperar senha de conta quando disponível.','Excluir conta com confirmação e credenciais.','Excluir perfil com confirmação.','Separar dados por identificador de perfil.','Migrar identificadores legados para UUID válido.','Validar UUID.','Executar mutação financeira atômica.','Reverter efeito financeiro em caso de erro.','Impedir conta obrigatória vazia.','Impedir saldo insuficiente de reserva.','Impedir duplicidade de importação.','Preservar dados ao ocultar módulo.','Registrar snapshot patrimonial.','Marcar salvamento pendente ao sair.','Confirmar salvamento final.','Exibir aviso de salvamento pendente.','Manter backups antes de operações destrutivas.'
  ]),
  group('mobile','mobile','Smartphone, PWA e experiência',[
    'Detectar smartphone automaticamente.','Forçar Smartphone Mode.','Forçar Modo Pro.','Exibir visão geral adaptada.','Exibir ações rápidas.','Exibir barra inferior com cinco atalhos.','Abrir menu por gesto de toque no botão.','Permitir scroll vertical do conteúdo principal.','Manter scroll próprio em modal.','Bloquear scroll principal somente com camada aberta.','Fechar camada antes de voltar.','Evitar captura de toque pela gaveta fechada.','Adaptar grades para uma coluna.','Manter campos com tamanho adequado ao toque.','Usar áreas seguras do dispositivo.','Salvar e atualizar pelo menu do smartphone.','Instalar como PWA.','Abrir em modo standalone.','Usar cache offline dos arquivos do aplicativo.','Atualizar cache por versão.','Exibir ícone e manifest do aplicativo.','Abrir atalho existente em vez de duplicar janela quando suportado.'
  ]),
  group('troubleshooting','mobile','Diagnóstico e solução de problemas',[
    'Confirmar perfil ativo antes de investigar dados.','Confirmar mês selecionado.','Confirmar filtro de bancos.','Confirmar valores ocultos ou visíveis.','Confirmar módulo ativo.','Confirmar modo de interface.','Fechar menu, modal e painel de notificações.','Restaurar zoom do navegador para 100%.','Reabrir o PWA após atualização.','Fazer recarregamento forçado quando cache está antigo.','Verificar indicador do Drive.','Fazer backup local antes de resolver conflito.','Comparar versão local e remota.','Preservar current.json e backups.','Validar arquivo JSON antes de restaurar.','Revisar duplicados após importação.','Comparar saldo com extrato original.','Registrar tela, ação, dispositivo e orientação ao relatar bug.','Evitar novas alterações enquanto existe conflito de dados.','Usar checklist da Central do Borion para auditoria funcional.'
  ])
];

const ORIGIN_TIMELINE=[
  {date:'Antes de 07/07/2026',title:'Uma necessidade pessoal',text:'O Borion começou porque planilhas e aplicativos prontos não acompanhavam a forma real de organizar contas, cartões, parcelas, cofrinhos, patrimônio e perfis. A ideia inicial era simples: enxergar o dinheiro como ele realmente se movimenta.'},
  {date:'07/07/2026',title:'Lançamento oficial',text:'O Borion Finance ganhou uma primeira versão utilizável como sistema financeiro pessoal. O foco era reunir lançamentos, contas, cartões, reservas, investimentos e patrimônio em uma experiência própria.'},
  {date:'Primeiros 10 dias',title:'De programa a ecossistema',text:'O projeto cresceu em ritmo intenso. Entraram perfis, nuvem, backups, Smartphone Mode, organização de módulos, importadores, segurança, relatórios e integrações. O que era um programa passou a ser tratado como um ecossistema.'},
  {date:'Evolução seguinte',title:'Borion System / Constelação',text:'O Finance passou a conversar com Amanda Estética e Marco Iris Tecnologia, além do Hub. Cada aplicação mantém sua finalidade, mas compartilha a ideia de um sistema autoral, conectado e moldado ao uso real.'},
  {date:'v6.36.0',title:'O próprio sistema passa a se explicar',text:'A Central do Borion transforma o conhecimento acumulado em documentação pesquisável, passo a passo, checklist e memória do projeto. O objetivo é reduzir dependência da memória do criador e tornar cada função verificável.'}
];

function normalize(value){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').replace(/\s+/g,' ').trim();}
function state(){
  if(!S.helpCenter) S.helpCenter={tab:'guides',query:'',category:'all'};
  if(!['guides','checklist','origin'].includes(S.helpCenter.tab)) S.helpCenter.tab='guides';
  return S.helpCenter;
}
function checkKey(){return 'borion_help_checklist_v1_'+((S.currentProfile&&S.currentProfile.id)||'sem_perfil');}
function checkedSet(){
  try{const raw=JSON.parse(localStorage.getItem(checkKey())||'[]');return new Set(Array.isArray(raw)?raw:[]);}catch(_){return new Set();}
}
function saveChecked(set){try{localStorage.setItem(checkKey(),JSON.stringify(Array.from(set)));}catch(_){}}
function allChecklistIds(){const out=[];FEATURE_GROUPS.forEach(g=>g.items.forEach((_,i)=>out.push(g.id+'-'+(i+1))));return out;}
function countFeatures(){return FEATURE_GROUPS.reduce((n,g)=>n+g.items.length,0);}
function tabButton(id,label){const s=state();return `<button type="button" class="help-main-tab ${s.tab===id?'active':''}" onclick="BorionHelp.setTab('${id}')">${label}</button>`;}
function categoryChips(){const s=state();return `<div class="help-category-chips" role="list">`+
  `<button type="button" class="help-category-chip ${s.category==='all'?'active':''}" data-help-category-chip="all" onclick="BorionHelp.setCategory('all')">Tudo</button>`+
  HELP_CATEGORIES.map(c=>`<button type="button" class="help-category-chip ${s.category===c.id?'active':''}" data-help-category-chip="${c.id}" onclick="BorionHelp.setCategory('${c.id}')"><span>${c.icon}</span>${esc(c.title)}</button>`).join('')+
  `</div>`;
}
function searchBlock(){const s=state();return `<div class="help-search-shell"><span class="help-search-icon">⌕</span><input id="borion_help_search" type="search" autocomplete="off" value="${esc(s.query)}" placeholder="Ex.: como lançar compra parcelada, restaurar backup, ordenar reservas..." oninput="BorionHelp.search(this.value)"><button type="button" class="help-search-clear ${s.query?'':'hidden'}" id="borion_help_clear" onclick="BorionHelp.clearSearch()" aria-label="Limpar pesquisa">×</button></div><div class="help-search-meta"><span id="help-results-count">Digite uma dúvida ou escolha uma área.</span><span>Pesquisa por palavras, sinônimos e passos.</span></div>`;}
function renderHero(){return `<section class="help-hero"><div class="help-hero-copy"><div class="help-kicker">CENTRAL DO BORION</div><h2>Tudo o que o Borion faz, explicado dentro dele.</h2><p>Pesquise uma dúvida, siga o passo a passo, audite cada função e conheça a história do sistema.</p></div><div class="help-hero-stats"><div><strong>${HELP_ARTICLES.length}</strong><span>guias</span></div><div><strong>${countFeatures()}</strong><span>funções no checklist</span></div><div><strong>100%</strong><span>local e pesquisável</span></div></div></section>`;}
function articleSearchText(a){const c=CAT_BY_ID[a.category];return normalize([c&&c.title,a.title,a.intro,...a.steps,...a.tips,...a.keywords].join(' '));}
function renderGuides(){
  const grouped=HELP_CATEGORIES.map(c=>({cat:c,articles:HELP_ARTICLES.filter(a=>a.category===c.id)})).filter(x=>x.articles.length);
  return `<div class="help-guides">${grouped.map(({cat,articles})=>`<section class="help-guide-group help-searchable-group" data-help-group="${cat.id}"><div class="help-group-heading"><span>${cat.icon}</span><div><h3>${esc(cat.title)}</h3><p>${articles.length} guia${articles.length===1?'':'s'} nesta área</p></div></div><div class="help-article-list">${articles.map((a,index)=>`<details class="help-article help-searchable" data-help-category="${a.category}" data-help-search="${esc(articleSearchText(a))}" ${a.id==='primeiro-acesso'&&index===0?'open':''}><summary><div><span class="help-article-category">${esc(cat.title)}</span><h4>${esc(a.title)}</h4><p>${esc(a.intro)}</p></div><span class="help-article-chevron">⌄</span></summary><div class="help-article-body"><ol>${a.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>${a.tips.length?`<div class="help-tip"><strong>Atenção</strong>${a.tips.map(t=>`<p>${esc(t)}</p>`).join('')}</div>`:''}${a.keywords.length?`<div class="help-keywords">Também encontra por: ${a.keywords.map(k=>`<span>${esc(k)}</span>`).join('')}</div>`:''}</div></details>`).join('')}</div></section>`).join('')}<div class="help-empty" id="help-empty-guides"><strong>Nenhum guia encontrado.</strong><span>Tente uma palavra mais simples, como “fatura”, “reserva”, “backup” ou “ordem”.</span></div></div>`;
}
function checklistProgressHTML(set){const total=countFeatures(),done=allChecklistIds().filter(id=>set.has(id)).length,pct=total?Math.round(done/total*100):0;return `<div class="help-check-progress"><div><strong id="help-check-done">${done}</strong><span> de ${total} funções verificadas</span></div><div class="help-progress-track"><span id="help-progress-bar" style="width:${pct}%"></span></div><b id="help-progress-pct">${pct}%</b></div>`;}
function renderChecklist(){
  const set=checkedSet();
  return `<div class="help-checklist-wrap"><div class="help-checklist-toolbar">${checklistProgressHTML(set)}<div class="help-checklist-actions"><button type="button" class="btn-outline btn-sm" onclick="BorionHelp.copyPending()">Copiar pendências</button><button type="button" class="btn-outline btn-sm" onclick="BorionHelp.markAll()">Marcar tudo</button><button type="button" class="btn-outline btn-sm" onclick="BorionHelp.clearChecklist()">Limpar</button></div></div><div class="help-check-groups">${FEATURE_GROUPS.map(g=>{const cat=CAT_BY_ID[g.category]||{title:'Borion',icon:'•'};return `<details class="help-check-group help-searchable-group" data-help-group="${g.category}" open><summary><div><span>${cat.icon}</span><div><h3>${esc(g.title)}</h3><p>${g.items.length} verificações</p></div></div><b data-help-group-count="${g.id}">${g.items.filter((_,i)=>set.has(g.id+'-'+(i+1))).length}/${g.items.length}</b></summary><div class="help-check-items">${g.items.map((label,i)=>{const id=g.id+'-'+(i+1),search=normalize([cat.title,g.title,label].join(' '));return `<label class="help-check-item help-searchable ${set.has(id)?'checked':''}" data-help-category="${g.category}" data-help-search="${esc(search)}"><input type="checkbox" ${set.has(id)?'checked':''} onchange="BorionHelp.toggleCheck('${id}',this.checked)"><span class="help-check-box">✓</span><span>${esc(label)}</span></label>`;}).join('')}</div></details>`;}).join('')}</div><div class="help-empty" id="help-empty-checklist"><strong>Nenhuma função encontrada.</strong><span>Limpe o filtro ou pesquise outra palavra.</span></div></div>`;
}
function renderOrigin(){
  return `<div class="help-origin"><section class="help-origin-lead"><div class="help-origin-mark">B + ÓRION</div><h3>Como o Borion começou</h3><p><strong>Borion</strong> nasceu da união de <strong>B</strong>, de Bardella, com <strong>Órion</strong>, a constelação. O nome passou a representar não apenas um aplicativo financeiro, mas um conjunto de sistemas autorais conectados — uma constelação construída função por função.</p><p>Ele não começou como uma tentativa de copiar um banco. Começou como uma resposta direta a um problema: controlar dinheiro do jeito que a vida real acontece, com contas, dinheiro físico, cartões, parcelas, cofrinhos, reservas, patrimônio, pessoas e decisões que os aplicativos genéricos simplificavam demais.</p></section><section class="help-origin-principles"><div><span>01</span><strong>Uso real primeiro</strong><p>Cada função nasce de uma situação concreta, não de uma tela criada apenas para parecer completa.</p></div><div><span>02</span><strong>Controle sem maquiagem</strong><p>Saldo, dívida, parcela, transferência e patrimônio precisam manter significados diferentes.</p></div><div><span>03</span><strong>Autoria e evolução</strong><p>O sistema registra a visão do criador e continua mudando conforme o uso revela novas necessidades.</p></div></section><section class="help-timeline">${ORIGIN_TIMELINE.map((m,i)=>`<article><div class="help-timeline-dot">${i+1}</div><div><span>${esc(m.date)}</span><h4>${esc(m.title)}</h4><p>${esc(m.text)}</p></div></article>`).join('')}</section><section class="help-origin-note"><h4>Por que esta Central existe</h4><p>Quando um sistema cresce rápido, parte do conhecimento fica presa na memória de quem o criou. Esta área transforma esse conhecimento em instrução, auditoria e história. Ela ajuda a usar o Borion, mas também protege o próprio projeto contra o esquecimento.</p><div class="help-signature">Desenvolvido por <strong>Pedro Bardella</strong> · Borion System · 2026</div></section></div>`;
}
function render(){
  const s=state();
  const body=s.tab==='guides'?renderGuides():s.tab==='checklist'?renderChecklist():renderOrigin();
  setTimeout(()=>BorionHelp.applyFilters(),0);
  return `<div class="borion-help-center" data-help-version="${HELP_VERSION}">${renderHero()}<div class="help-main-tabs">${tabButton('guides','Guias passo a passo')}${tabButton('checklist','Checklist completo')}${tabButton('origin','Como começou')}</div>${s.tab==='origin'?'':searchBlock()}${s.tab==='origin'?'':categoryChips()}<div class="help-content">${body}</div></div>`;
}
function updateProgress(){
  const set=checkedSet(),ids=allChecklistIds(),done=ids.filter(id=>set.has(id)).length,total=ids.length,pct=total?Math.round(done/total*100):0;
  const doneEl=document.getElementById('help-check-done'),bar=document.getElementById('help-progress-bar'),pctEl=document.getElementById('help-progress-pct');
  if(doneEl)doneEl.textContent=String(done);if(bar)bar.style.width=pct+'%';if(pctEl)pctEl.textContent=pct+'%';
  FEATURE_GROUPS.forEach(g=>{const el=document.querySelector(`[data-help-group-count="${g.id}"]`);if(el)el.textContent=g.items.filter((_,i)=>set.has(g.id+'-'+(i+1))).length+'/'+g.items.length;});
}
function visibleMatches(){return Array.from(document.querySelectorAll('.borion-help-center .help-searchable')).filter(el=>!el.hidden).length;}
function applyFilters(){
  const root=document.querySelector('.borion-help-center');if(!root)return;
  const s=state(),q=normalize(s.query),cat=s.category;
  root.querySelectorAll('.help-searchable').forEach(el=>{const matchQ=!q||String(el.dataset.helpSearch||'').includes(q);const matchC=cat==='all'||el.dataset.helpCategory===cat;el.hidden=!(matchQ&&matchC);});
  root.querySelectorAll('.help-searchable-group').forEach(groupEl=>{const category=groupEl.dataset.helpGroup;const catOkay=cat==='all'||category===cat;const any=Array.from(groupEl.querySelectorAll('.help-searchable')).some(el=>!el.hidden);groupEl.hidden=!(catOkay&&any);});
  root.querySelectorAll('[data-help-category-chip]').forEach(b=>b.classList.toggle('active',b.dataset.helpCategoryChip===cat));
  const count=visibleMatches();
  const countEl=document.getElementById('help-results-count');if(countEl)countEl.textContent=q||cat!=='all'?`${count} resultado${count===1?'':'s'} encontrado${count===1?'':'s'}.`:'Digite uma dúvida ou escolha uma área.';
  const clear=document.getElementById('borion_help_clear');if(clear)clear.classList.toggle('hidden',!s.query);
  const emptyGuides=document.getElementById('help-empty-guides');if(emptyGuides)emptyGuides.classList.toggle('show',count===0);
  const emptyChecklist=document.getElementById('help-empty-checklist');if(emptyChecklist)emptyChecklist.classList.toggle('show',count===0);
}

const BorionHelp={
  render,
  setTab(tab){state().tab=tab;renderView();},
  search(value){state().query=String(value||'');applyFilters();},
  clearSearch(){state().query='';const input=document.getElementById('borion_help_search');if(input){input.value='';input.focus();}applyFilters();},
  setCategory(category){state().category=category||'all';applyFilters();},
  applyFilters,
  toggleCheck(id,on){const set=checkedSet();if(on)set.add(id);else set.delete(id);saveChecked(set);const input=document.querySelector(`.help-check-item input[onchange*="${id}"]`);if(input)input.closest('.help-check-item').classList.toggle('checked',!!on);updateProgress();},
  markAll(){const set=new Set(allChecklistIds());saveChecked(set);document.querySelectorAll('.help-check-item input[type="checkbox"]').forEach(i=>{i.checked=true;i.closest('.help-check-item').classList.add('checked');});updateProgress();toast('Checklist completo marcado para este perfil.');},
  clearChecklist(){saveChecked(new Set());document.querySelectorAll('.help-check-item input[type="checkbox"]').forEach(i=>{i.checked=false;i.closest('.help-check-item').classList.remove('checked');});updateProgress();toast('Checklist deste perfil foi limpo.');},
  async copyPending(){
    const set=checkedSet();let lines=['CHECKLIST PENDENTE — BORION FINANCE',''];
    FEATURE_GROUPS.forEach(g=>{const pending=g.items.map((label,i)=>({label,id:g.id+'-'+(i+1)})).filter(x=>!set.has(x.id));if(!pending.length)return;lines.push(g.title.toUpperCase());pending.forEach(x=>lines.push('[ ] '+x.label));lines.push('');});
    if(lines.length<=2)lines.push('Todas as funções foram marcadas como verificadas.');
    const text=lines.join('\n');
    try{await navigator.clipboard.writeText(text);toast('Pendências copiadas.');}
    catch(_){const ta=document.createElement('textarea');ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();toast('Pendências copiadas.');}
  }
};
window.BorionHelp=BorionHelp;
})();
