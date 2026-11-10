# PDV comercial

Este glossário define os termos de operação usados pelo domínio de operadores,
caixa e vendas.

## Operação

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

**Cancelamento auditado de venda**:
Operação autorizada que marca uma venda como cancelada, registra operador,
horário e motivo, e reverte estoque e efeitos financeiros na mesma transação.
_Evitar_: exclusão física da venda.

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
