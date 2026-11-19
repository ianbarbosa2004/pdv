# Inventário, custos e confirmação fiscal

**Status:** accepted

Entradas fiscais serão confirmadas na tela operacional de Pré-entrada e, nessa
ação, atualizarão estoque e custo na mesma transação. Cada Produto comercial
terá uma política de custo padrão, inicialmente **Último custo**, podendo usar
**Custo médio**; somente operadores com permissão de estoque poderão substituir
essa política por item na Pré-entrada. O custo da primeira implementação usará
apenas o valor dos produtos dividido pela quantidade convertida para a unidade
de estoque, sem frete, seguro, despesas ou impostos.

O Inventário será uma operação recorrente em tela própria. Ele ajustará somente
quantidades, registrando a contagem, a diferença, o operador, a data e o
motivo; não alterará custos. Confirmações e desfazimentos permanecerão
auditáveis, e uma Entrada confirmada poderá ser desfeita por supervisor ou
administrador com motivo obrigatório, mesmo que isso produza divergências ou
saldo negativo a serem revisados operacionalmente.

As alterações de custo recalcularão os custos estimados das Receitas e
Composições dependentes, sem criar novas versões. A propagação ocorre na mesma
transação da confirmação fiscal, da edição manual do custo do Produto ou do
salvamento de uma Receita, Composição ou Ficha Técnica. A tela de teste de
entrada fiscal não será a tela operacional definitiva.

Quando uma pré-entrada tiver várias linhas vinculadas ao mesmo Produto, o
impacto e a confirmação processam essas linhas em ordem fiscal, partindo do
estoque e do custo atuais. A política do Produto define cada etapa:
**Último custo** termina no custo da última entrada e **Custo médio** propaga
o saldo e o custo intermediários a cada nova entrada. O Produto é atualizado
uma única vez com o resultado final, enquanto os movimentos históricos preservam
o resultado de cada etapa.

Ao alterar a política de cálculo de um Produto, o sistema reprocessa todas as
entradas fiscais confirmadas desse Produto em ordem cronológica. O primeiro
movimento fiscal registrado fornece o saldo e o custo de partida; a política
selecionada é aplicada em cascata a todas as entradas e o custo efetivo final é
persistido junto da nova política. Receitas e Composições dependentes são
recalculadas na mesma transação. Produtos para não revenda podem alinhar o
preço ao custo recalculado; Produtos para revenda não têm o preço de venda
alterado automaticamente.

O replay é ordenado pelo instante de confirmação, pelo identificador da entrada
fiscal e pela linha do documento. Essa ordem determina a sequência cronológica
das entradas e mantém o Último custo associado à entrada confirmada mais nova,
mesmo quando várias confirmações tenham timestamps coincidentes.

## Consequências

O schema precisará separar o estado atual do Produto dos eventos históricos de
estoque, custo, inventário e desfazimento. A interface operacional deverá
mostrar a política aplicada, permitir a revisão de impacto somente para itens
selecionados e vinculados e bloquear a confirmação enquanto houver pendências.
