# Referências para conversões culinárias

## Escopo

As medidas culinárias abaixo são referências nominais de volume. Elas não
representam uma conversão universal de volume para massa: a massa varia com
densidade, umidade, granulometria, compactação e nivelamento do ingrediente.
Por isso, o cadastro mantém conversões de massa separadas por estado físico e
identifica os fatores aproximados nas observações.

## Valores de volume adotados

| Unidade | Fator para `ml` | Aplicação |
| --- | ---: | --- |
| Colher de café | 2,5 | Referência operacional conservadora |
| Colher de chá | 5 | Líquidos |
| Colher de sobremesa | 10 | Líquidos |
| Colher de sopa | 10 | Líquidos; referência brasileira adotada |
| Xícara de chá | 200 | Líquidos; referência brasileira adotada |
| Dose / jigger | 45 | Destilados; a capacidade comercial pode variar |

O fator é aplicado por estado físico quando a unidade de destino é `ml`. Para
`liquid_viscous`, o mesmo fator expressa volume; quando a receita precisa de
massa, deve ser usada uma conversão específica em gramas, pois a densidade do
ingrediente é determinante.

## Fontes

- **Anvisa, Instrução Normativa nº 75/2020, Anexo VII**: apresenta xícara de
  chá como 200 ml, colher de sopa como 10 ml e colher de chá como 5 ml.
  [Texto oficial](https://anvisalegis.datalegis.net/action/ActionDatalegis.php?acao=abrirTextoAto&cod_menu=9434&cod_modulo=310&numeroAto=00000075&orgao=DC%2FANVISA%2FMS&seqAto=000&tipo=INM&valorAno=2020).
- **Secretaria Estadual da Saúde do Rio Grande do Sul, Memento de Chás
  Medicinais (2023), p. 19**: apresenta colher de café como 2 ml, colher de
  chá como 5 ml, colher de sobremesa como 10 ml e colher de sopa como 15 ml.
  O documento trata de material vegetal; seus valores de massa não foram
  generalizados para alimentos.
  [PDF institucional](https://atencaoprimaria.rs.gov.br/upload/arquivos/202312/29090916-memento-de-chas-medicinais-da-pipmf-2023.pdf).
- **NIST, Metric Kitchen**: confirma equivalências usuais de colher de chá,
  colher de sopa e xícara em medidas métricas norte-americanas.
  [Metric Kitchen](https://www.nist.gov/pml/owm/metric-si/metric-kitchen/metric-kitchen-cooking-measurement-equivalencies).
- **Cocktail Kingdom, Japanese Style Jigger**: demonstra que um jigger
  comercial pode ter lados de 30 ml e 45 ml, portanto não existe capacidade
  universal.
  [Produto do fabricante](https://cocktailkingdom.com/products/japanese-style-jigger-1oz-15oz-stainless-steel).
- **OCID/ES, definições de consumo de álcool**: usa 45 ml como referência
  aproximada para uma dose de destilado no contexto brasileiro.
  [Referência institucional](https://ocid.es.gov.br/consumo-alcool-definicoes-numeros-Brasil-2022).
- **USDA Food Buying Guide**: demonstra que massas por xícara diferem conforme
  o alimento, como farinha, aveia, fubá e farelo de trigo.
  [Tabela de conversões](https://foodbuyingguide.fns.usda.gov/AltText/Grains_Grams_Conversions1).

## Limitações operacionais

Os fatores não substituem a pesagem do ingrediente quando o custo, o estoque ou
a produção exigirem precisão. Medidas de massa para pós, pastas e sólidos
continuam sendo aproximações específicas por estado físico e devem ser
substituídas por uma conversão cadastrada para o ingrediente quando houver
densidade ou ficha técnica conhecida.
