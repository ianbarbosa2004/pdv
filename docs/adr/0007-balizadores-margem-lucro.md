# ADR 0007 - Balizadores de margem de lucro

**Status:** implemented

O PDV adotará Margem Bruta, Markup, Lucro Unitário e CMV como métricas
independentes sobre `costPriceProduct` e `priceProduct`, sem transformar uma
medida em substituta das demais. Margem mínima e margem alvo terão valores
independentes somente por Grupo. Cada grupo terá registro próprio com mínimo
e alvo inicializados em 0.

Os estados Vermelho, Amarelo e Verde serão calculados sob demanda e exibidos
como badge na listagem, mas não bloquearão venda ou confirmação de entrada.
Não haverá recálculo automático em lote nem alteração automática de
`priceProduct`; preços só serão persistidos por uma ação individual confirmada
com concorrência protegida, autorização de supervisor ou administrador e
auditoria dedicada. A View de simulação permite digitar um Novo CMV e recalcular
preço sugerido e métricas em memória antes da confirmação.

As métricas persistidas terão histórico dedicado em
`margin_product_metrics`, com custo, preço, Margem Bruta, Markup, Lucro
Unitário, CMV, balizadores efetivos, origem, estado e fonte da alteração.
Triggers registrarão snapshots após mudanças de custo, preço e balizadores,
permitindo evolução histórica sem persistir métricas duplicadas no cadastro
do produto. Cada snapshot também armazenará `pdvCodeSnapshot` para preservar
o #PDV no momento da captura. A carga inicial criará snapshots dos produtos
ativos elegíveis.

O cadastro de Produtos exibirá os valores persistidos mais recentes em modo
somente leitura. A View publicada de Margem continuará concentrando consulta, simulação protegida
de CMV e histórico. A edição dos balizadores ocorre somente no Cadastro de Grupos.
