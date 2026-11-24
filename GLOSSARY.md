# PDV comercial

Este glossário define os termos de operação usados pelo domínio de operadores,
caixa e vendas.

## Operação

**Balcão**:
Modo de frente de caixa destinado à venda direta, com lançamento e pagamento
na mesma operação.
_Evitar_: mesa, venda em comanda.

**Mesas**:
Modo de frente de caixa destinado ao atendimento com lançamentos associados a
Mesas e suas Comandas.
_Evitar_: várias vendas separadas, balcão.

**Mapa em grade**:
Visualização das Mesas organizadas em uma grade numerada.
_Evitar_: mapa físico do salão, lista apenas textual.

**Ordenação da grade**:
Posicionamento automático das Mesas conforme seu Identificador visual, adaptado
ao número de colunas disponíveis na tela sem exigir posição manual.
_Evitar_: coordenadas fixas, arraste na versão inicial.

**Mapa do salão**:
Visualização das Mesas posicionadas sobre uma representação configurável do
salão.
_Evitar_: planta arquitetônica, grade numerada.

**Operador**:
Pessoa autenticada individualmente no PDV para executar operações autorizadas.
_Evitar_: usuário genérico, terminal.

**Sessão do operador**:
Período autenticado e expirável em que um operador pode executar operações no
PDV.
_Evitar_: token do terminal, login permanente.

**Caixa**:
Unidade financeira do PDV que recebe vendas e movimentos manuais.
_Evitar_: sessão do operador.

**Abertura de caixa**:
Registro do saldo inicial que inicia uma sessão financeira de caixa.
_Evitar_: entrada de operador.

**Fechamento de caixa**:
Encerramento de uma sessão financeira com valor contado, diferença e
justificativa quando necessária.
_Evitar_: logout.

**Mesa**:
Local físico numerado do serviço em Mesas que pode receber uma ou mais
Comandas, conforme a configuração operacional.
_Evitar_: venda aberta, comanda, ocupação da sala.

**Identificador visual da Mesa**:
Número ou texto configurado para localizar uma Mesa no mapa, separado de sua
identidade interna estável.
_Evitar_: código técnico da Mesa, nome obrigatório.

**Comanda**:
Conta aberta vinculada a uma Mesa para registrar lançamentos até o seu
pagamento ou cancelamento. Uma Mesa pode manter mais de uma Comanda ativa.
_Evitar_: mesa física, venda ainda não confirmada.

**Lançamento em Comanda**:
Registro de uma quantidade de um Produto comercial em uma Comanda ativa.
_Evitar_: venda confirmada, movimento isolado de estoque.

**Pagamento agrupado**:
Liquidação de uma seleção de Comandas em uma única operação de pagamento,
preservando uma Venda separada para cada Comanda.
_Evitar_: uma única venda da Mesa, fusão das Comandas.

**Livre**:
Estado de uma Mesa sem Comanda ativa.
_Evitar_: mesa vazia sem ocupação.

**Ocupada**:
Estado de uma Mesa com uma Comanda ativa que ainda pode receber lançamentos.
_Evitar_: mesa física reservada, pagamento concluído.

**Ocupação da Mesa**:
Registro da quantidade de pessoas atendidas em uma Mesa. O valor inicial é um
e pode ser alterado a qualquer momento pelo operador.
_Evitar_: divisão da conta, preço por pessoa.

**Em fechamento**:
Estado de uma Mesa cuja Comanda está em conferência e encerra novos
lançamentos até o pagamento ser concluído ou a Mesa retornar a Ocupada.
_Evitar_: fechamento de caixa, conta impressa.

**Seleção rápida da Mesa**:
Escolha de uma Mesa pelo seu Identificador visual por entrada numérica antes
de abrir seu estado operacional. A confirmação direciona para o mesmo fluxo
da seleção direta no Mapa em grade.
_Evitar_: alterar o Identificador visual, criar uma nova Mesa.

**Resumo das Mesas abertas**:
Referência operacional impresso das Mesas que possuem Comandas abertas, com
identificação, nome de referência, ocupação, estado e valor de cada Comanda,
acrescido do total geral. Não altera estados, lançamentos ou pagamentos.
_Evitar_: relatório financeiro, impressão de itens, fechamento de Mesa.

**Indicação visual de inatividade**:
Sinal visual derivado do tempo sem atividade registrada em uma Mesa. Não altera
seus estados, lançamentos ou pagamentos e pode ser configurado por limite geral.
_Evitar_: mesa abandonada, estado de Mesa, bloqueio de consumo.

**Cancelamento auditado de venda**:
Operação autorizada que marca uma venda como cancelada, registra operador,
horário e motivo, e reverte estoque e efeitos financeiros na mesma transação.
_Evitar_: exclusão física da venda.

**Documento fiscal eletrônico**:
Documento fiscal digital autorizado pela administração tributária, identificado
por uma chave de acesso e associado a um emitente, emissão e valor total.
_Evitar_: venda do PDV, entrada de estoque concluída.

**NF-e**:
Documento fiscal eletrônico de modelo 55, normalmente usado para documentar
operações de circulação de mercadorias ou prestação entre empresas.
_Evitar_: NFC-e, entrada de estoque.

**NFC-e**:
Documento fiscal eletrônico de modelo 65, usado principalmente para operações
de venda ao consumidor final.
_Evitar_: NF-e, cupom não fiscal.

**Chave de acesso**:
Identificador numérico de 44 dígitos que identifica um Documento fiscal
eletrônico e permite sua consulta na administração tributária.
_Evitar_: número da nota, código interno.

**Fila de documentos fiscais**:
Cadastro temporário de Documentos fiscais eletrônicos confirmados na consulta
fiscal e ainda não convertidos em uma entrada de estoque.
_Evitar_: estoque, compra concluída, movimento de estoque.

**Pré-entrada**:
Revisão de uma Fila de documentos fiscais na qual o operador escolhe os itens
que serão aproveitados, vincula cada descrição ao Produto comercial correspondente
e confirma quantidades, unidades e conversões antes de movimentar o estoque.
_Evitar_: entrada de estoque concluída, importação automática.

**Vínculo de descrição fiscal**:
Relação reutilizável entre uma descrição e unidade originadas no documento fiscal
e um Produto comercial escolhido pelo operador. Um mesmo Produto comercial pode
ter vários vínculos, pois fornecedores diferentes podem usar descrições ou
unidades fiscais diferentes para o mesmo produto. Na mesma loja, cada vínculo
pode ser sugerido automaticamente em documentos futuros com a mesma descrição e
unidade, mas pode ser revisto antes da confirmação.
_Evitar_: código compartilhado, vínculo por fornecedor.

**Catálogo de vínculos fiscais**:
Conjunto global de Vínculos de descrição fiscal confirmados em Pré-entradas,
consultado para visualizar quais descrições fiscais já foram associadas a cada
Produto comercial. Não é um cadastro manual nem substitui o vínculo específico
de cada item de Pré-entrada.
_Evitar_: cadastro de fornecedor, produto fiscal separado.

**Vínculo ambíguo**:
Situação em que uma descrição, unidade e embalagem de origem podem corresponder
a mais de um Produto comercial local sem identificador compartilhado confiável,
exigindo escolha explícita do operador.
_Evitar_: vínculo automático, correspondência presumida.

**Estado da pré-entrada**:
Situação operacional que indica se uma Pré-entrada ainda pode ser editada,
aguarda vínculos, está pronta para confirmação, já foi convertida em Entrada de
estoque ou foi cancelada sem movimentar estoque.
_Evitar_: status da nota fiscal, situação do produto.

**Em Digitação**:
Estado inicial persistido de uma Pré-entrada, usado enquanto itens, vínculos,
seleções, conversões ou pagamento ainda estão sendo preenchidos. Permite salvar
o rascunho sem movimentar estoque e sem considerá-lo validado para conclusão.
Uma Entrada manual pode retornar a este estado a partir de Em Aberto, preservando
os dados já preenchidos para nova edição.
_Evitar_: entrada incompleta descartada, Em Aberto.

**Em Aberto**:
Estado de uma entrada fiscal já gravada, mas ainda não concluída para
movimentação de estoque. A entrada permanece disponível para continuidade,
revisão ou confirmação posterior e não movimenta nem reserva estoque. Uma
Entrada manual pode ser reaberta explicitamente para Em Digitação antes da
confirmação.
_Evitar_: entrada confirmada, estoque lançado, nota autorizada.

**Consulta fiscal**:
Verificação server-side de uma Chave de acesso junto à administração tributária,
com resposta suficiente para confirmar a existência e os dados básicos do
Documento fiscal eletrônico.
_Evitar_: abertura manual do portal, consulta demonstrativa.

**Entrada de estoque**:
Operação futura que transforma um Documento fiscal eletrônico confirmado em
itens, quantidades e valores movimentados no estoque.
_Evitar_: inclusão na Fila de documentos fiscais.

**Entrada manual**:
Entrada de estoque registrada pelo operador a partir dos dados de uma Nota
fiscal ou de um Pedido, sem depender de importação ou consulta fiscal
automática. A origem documental identifica o contexto do registro, mas não
cria um fluxo operacional separado. Seu registro usa uma data obrigatória e um
número opcional, independentemente da origem; cada Produto comercial usa a sua
única Unidade tributável cadastrada, sem conversão na entrada.
_Evitar_: lançamento sem fornecedor, importação fiscal.

**Origem documental**:
Classificação que informa se uma Entrada manual foi registrada a partir de uma
Nota fiscal ou de um Pedido. A classificação descreve a procedência dos dados,
não altera os estados nem as regras de confirmação da Entrada.
_Evitar_: status da entrada, tipo de Produto comercial.

**Entrada confirmada**:
Entrada de estoque concluída na tela operacional de Pré-entrada, com atualização
atômica de quantidade e custo quando aplicável. Seus efeitos não são apagados:
um desfazimento posterior registra uma nova operação auditável.
_Evitar_: Pré-entrada, Em Aberto, alteração direta do Produto.

**Política de custo**:
Regra do Produto comercial que define como o custo atual será atualizado por
uma Entrada confirmada. As opções são Último custo e Custo médio; uma
substituição por item exige permissão de estoque.
_Evitar_: preço de venda, custo histórico, custo estimado da Ficha.

**Último custo**:
Política de custo que define como custo atual o custo unitário da entrada,
calculado pelo valor dos produtos dividido pela quantidade convertida para a
unidade de estoque.
_Evitar_: custo médio, preço de compra sem conversão.

**Custo médio**:
Política de custo que combina o custo atual e uma entrada usando média ponderada
quando o saldo anterior é positivo. Com saldo zero ou negativo, o custo da
entrada torna-se o novo custo.
_Evitar_: média das últimas compras, preço médio sem quantidade.

**Inventário**:
Operação recorrente de contagem física que compara a quantidade observada com o
saldo do sistema e ajusta somente a quantidade. Cada inventário registra
produto, saldo anterior, quantidade contada, diferença, operador, data e motivo.
_Evitar_: entrada fiscal, ajuste silencioso, atualização de custo.

**Histórico de movimentos**:
Consulta auditável dos eventos que alteram ou desfazem quantidades e custos,
incluindo Entradas confirmadas, Inventários e desfazimentos, com filtros por
produto, período, tipo, documento e operador.
_Evitar_: saldo atual, log técnico sem contexto operacional.

## Margem e preço

**Balizador de margem**:
Referência percentual usada para interpretar e comparar a rentabilidade de um
Produto comercial, sem bloquear venda ou entrada.
_Evitar_: trava de preço, regra fiscal, margem oficial única.

**Margem mínima**:
Piso percentual de Margem Bruta usado para classificar um Produto comercial em
estado amarelo ou vermelho.
_Evitar_: margem obrigatória, bloqueio de venda.

**Margem alvo**:
Referência percentual de Margem Bruta usada para planejar o preço e classificar
um Produto comercial em estado verde.
_Evitar_: margem mínima, lucro garantido.

**Balizador efetivo**:
Margem mínima ou margem alvo associada diretamente ao Grupo do Produto
comercial.
_Evitar_: valor herdado copiado, margem persistida por duplicação.

**Margem Bruta**:
Percentual da diferença entre preço de venda e custo sobre o preço de venda.
_Evitar_: markup, lucro em reais.

**Markup**:
Percentual da diferença entre preço de venda e custo sobre o custo.
_Evitar_: margem sobre venda.

**Lucro Unitário**:
Diferença em valor absoluto entre preço de venda e custo de uma unidade.
_Evitar_: margem percentual.

**CMV**:
Percentual do custo sobre o preço de venda.
_Evitar_: custo unitário, margem bruta.

**Novo CMV**:
Percentual informado na View de simulação para recalcular em memória o preço
sugerido e todas as métricas derivadas até uma ação de atualização confirmada.
_Evitar_: alteração automática de preço, atualização em lote.

## Catálogo culinário e composição

**Unidade de medida**:
Referência padronizada de medida que pode ser usada em operações fiscais,
produtos, receitas ou mais de um desses contextos.
_Evitar_: unidade tributável separada, unidade culinária separada.

**Unidade tributável**:
Unidade de medida usada para expressar o produto nas operações fiscais e no
cadastro comercial.
_Evitar_: unidade fiscal isolada.

**Unidade culinária**:
Unidade de medida usada para quantificar componentes e rendimentos em uma Ficha
Técnica, podendo também ser uma Unidade tributável quando sua flag permitir.
_Evitar_: medida de receita sem código.

**Produto comercial**:
Item cadastrado no catálogo com identidade, unidade, preço e regras de venda,
podendo ser matéria-prima, produto produzido, mercadoria para revenda ou
embalagem conforme sua classificação e uso.
_Evitar_: produto final de venda como entidade separada.

**Conteúdo por unidade**:
Quantidade da Unidade tributável contida em uma unidade comercial do Produto
comercial. Permite calcular o custo proporcional de receitas quando uma
embalagem, como uma garrafa, contém mais de uma unidade-base de consumo.
_Evitar_: estoque inicial, fator da conversão culinária.

**Duplicação de produto**:
Criação de um novo Produto comercial a partir de campos cadastrais reaproveitados
de outro produto, sem reutilizar sua identidade, códigos, estoque ou vínculos.
_Evitar_: edição, cópia de estoque, clonagem de vínculos.

**Receita**:
Estrutura nomeada e reutilizável de produção que transforma produtos e/ou
outras Receitas em um preparo, sem ser um Produto comercial.
_Evitar_: produto resultante, composição de produto, Kit, Combo.

**Ficha Técnica**:
Documento ou tela operacional que apresenta uma Receita ou uma Composição
independente e seus componentes, ou os vínculos dessas estruturas com um
Produto comercial.
_Evitar_: Kit, Combo, lista livre de ingredientes.

**Formação de Produtos**:
Tela operacional que mantém a Ficha Técnica diretamente associada a um Produto
comercial apto para venda, definindo os componentes usados na sua formação.
_Evitar_: cadastro da Receita independente, exclusão do Produto comercial.

**Composição de Produto**:
Estrutura nomeada e reutilizável que agrupa produtos e/ou outras Receitas para
formar uma composição, sem representar uma produção do produto comercial.
_Evitar_: Receita, Kit, Combo.

**Vínculo de Receita ou Composição**:
Relação quantificada pela qual um Produto comercial utiliza uma Receita ou
Composição, definindo os preparos que fazem parte daquele produto.
_Evitar_: produto resultante, nome da Receita.

**Item da Ficha**:
Componente quantificado de uma Ficha Técnica, com produto ou receita
referenciado, unidade, quantidade e ordem na composição.
_Evitar_: ingrediente solto.

**Produto Kit/Combo**:
Produto comercial agrupador para venda conjunta, tratado em um modelo próprio e
não equivalente a uma Ficha Técnica.
_Evitar_: Ficha Técnica, Receita.

**Produção**:
Operação que aplica uma Ficha Técnica para consumir componentes e, quando o
produto resultante controla estoque, registrar sua entrada.
_Evitar_: venda, montagem de Kit/Combo.

**Produção para Buffet**:
Produção identificada como destinada à disponibilização no buffet de uma
operação, sem transformar a venda do Produto Buffet em consumo ou baixa de
estoque.
_Evitar_: produção comum, venda de buffet.

**Fracionamento**:
Consumo proporcional de componentes de uma Ficha Técnica para vender um produto
ou receita sem estoque próprio controlado.
_Evitar_: produção de lote, Kit/Combo.

**Perda**:
Percentual adicional associado a um Item da Ficha para representar descarte ou
redução esperada no consumo operacional do material.
_Evitar_: margem, desperdício genérico.

**Custo estimado da Ficha**:
Valor atual calculado a partir dos custos vigentes dos Itens da Ficha e suas
perdas, usado para consulta e validação antes de uma operação.
_Evitar_: custo histórico, preço de venda.

**Produto Buffet**:
Produto comercial marcado para representar uma venda de buffet com preço
próprio, sem baixar estoque e sem transformar as receitas disponibilizadas em
linhas de venda separadas.
_Evitar_: Kit, Combo, composição de produtos.

**Cardápio do Buffet**:
Registro diário das Receitas produzidas e disponibilizadas no buffet, associado
à operação do buffet sem alterar o preço ou o estoque do Produto Buffet; seu
encerramento pode acompanhar o fechamento do caixa, mas nunca impede sua
conclusão.
_Evitar_: lista de produtos vendidos, ficha técnica do buffet.
