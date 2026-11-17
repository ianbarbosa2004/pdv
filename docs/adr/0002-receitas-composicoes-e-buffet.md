# Receitas, composições de produto e buffet

O PDV separa **Receita de Produção**, que transforma produtos e/ou outras
Receitas em um preparo nomeado e reutilizável, de **Composição de Produto**, que
também é uma estrutura nomeada e reutilizável para agrupar produtos e Receitas
sem representar fabricação. Nenhuma dessas estruturas exige um Produto
comercial resultante para existir.

Um **Produto comercial** utiliza Receitas e Composições por meio de vínculos
quantificados definidos no cadastro do próprio produto. Assim, “Feijão Rico”
pode ser uma Receita independente e “Feijão Rico com Ovo Frito” pode utilizar
essa Receita juntamente com outros itens, sem criar um produto artificial para
dar nome à Receita.

Produtos fracionados ou compostos consultam `controlsStockProduct` de cada item
e a configuração `Permitir estoque negativo` no momento da operação. Produção
comum baixa componentes e pode gerar entrada; Produção para Buffet baixa
componentes, registra lote destinado ao buffet e não cria estoque comercial.
Produtos marcados como Buffet registram somente a venda com preço próprio, sem
baixa de estoque e sem exigir Cardápio. O Cardápio referencia produções
específicas para o buffet, pode ser encerrado com o caixa, mas nunca impede seu
fechamento.

Receitas e Formações de Produtos persistem snapshots de custo no salvamento.
Os componentes usam `costRecipeComponent` ou `costFormationComponent`, conforme
o tipo da estrutura, e os totais usam `totalCostRecipe`/`unitCostRecipe` ou
`totalCostFormation`/`unitCostFormation`. O custo unitário é o custo total
dividido pelo rendimento e é usado por estruturas superiores. Alterar o custo atual de um Produto não reescreve esses
valores; um novo salvamento recalcula e atualiza o snapshot. Quando uma Formação
de Produto é recalculada, seu custo unitário também atualiza o
`products.costPriceProduct` do Produto resultante, propagando a alteração para
estruturas dependentes. As telas de consulta recalculam os custos exibidos dos
componentes de Produto usando o custo atual do catálogo, evitando que um
snapshot antigo seja apresentado como custo vigente.
