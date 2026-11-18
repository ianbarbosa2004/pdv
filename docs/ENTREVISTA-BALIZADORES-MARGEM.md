# Entrevista de balizadores de margem de lucro

**Status:** entendimento confirmado e implementação concluída
**Domínio:** PDV Zanzibar — bar e cozinha  
**Escopo:** especificação, implementação e operação

## Objetivo

Definir os balizadores de margem de lucro, suas regras de cálculo, herança,
propagação, permissões, telas, alertas, persistência e validações antes de
criar a ADR `0007-balizadores-margem-lucro.md` e um plano técnico executável.

## Documentação analisada

- `GLOSSARY.md`
- `database/schema.sql`
- `docs/DEVELOPMENT.md`
- `docs/PROJECT-HISTORY.md`
- `docs/adr/0002-receitas-composicoes-e-buffet.md`
- `docs/adr/0005-inventario-custos-e-confirmacao-fiscal.md`
- `docs/adr/0006-entrada-manual.md`

## Premissas propostas pelo usuário

- Margem Bruta sobre o preço de venda como possível métrica oficial.
- Lucro Unitário e CMV como indicadores auxiliares.
- Preço sugerido calculado a partir do custo e da margem alvo.
- Balizadores independentes de margem mínima e margem alvo.
- Balizadores associados diretamente ao Grupo do Produto.
- Aplicação a Mercadorias para Revenda e Produtos Acabados.
- Alertas em Produtos, Formação de Produtos, Entradas e ferramentas de
  auditoria.
- Nenhum bloqueio de venda ou confirmação de entrada por margem abaixo da
  mínima.

As premissas acima ainda não são decisões do domínio.

## Decisões fechadas

### Métricas independentes

- Não haverá uma métrica oficial única.
- Margem Bruta sobre o preço de venda será exibida como percentual:
  `(Preço de venda - Custo) / Preço de venda × 100`.
- Markup sobre o custo será exibido como percentual:
  `(Preço de venda - Custo) / Custo × 100`.
- Lucro Unitário será exibido como valor absoluto:
  `Preço de venda - Custo`.
- CMV será exibido como percentual sobre o preço de venda:
  `Custo / Preço de venda × 100`.
- Nenhuma conversão automática fará uma dessas métricas substituir outra.

### Margens mínima e alvo

- Margem mínima e margem alvo são balizadores independentes sobre Margem Bruta.
- Margem mínima é o piso aceitável para alertas.
- Margem alvo é a referência de planejamento e comparação.
- Nenhum dos dois bloqueia venda ou confirmação de entrada.

### Herança

- Os balizadores são resolvidos diretamente pelo Grupo do Produto.
- Cada nível específico pode sobrescrever o balizador herdado.
- O balizador efetivo deve indicar sua origem.
- Alterar a margem mínima ou a margem alvo de um Grupo recalcula imediatamente,
  na resolução e nas telas que exibem os dados, o balizador efetivo dos
  produtos do Grupo que não possuem override próprio.
- Produtos com margem mínima ou alvo próprio continuam usando seus respectivos
  overrides e não recebem o valor herdado copiado para seu cadastro.
- Essa resolução afeta as métricas e os badges Verde/Amarelo/Vermelho.
- Nenhum valor herdado é persistido no cadastro do produto.

### Escopo de aplicação

- Os balizadores serão aplicados a Mercadorias para Revenda e Produtos Acabados.
- Insumos, Materiais e componentes intermediários não recebem balizadores diretamente.

### Fonte de custo

- As quatro métricas usam `costPriceProduct`.
- O custo observado respeita a política `last` ou `average` já configurada no produto.

### Fonte de preço

- As quatro métricas usam `priceProduct` como preço de venda atual.
- O histórico de preços realizados não participa do cálculo.

### Valores zero

- Custo zero é exibido como `Sem custo`.
- Preço zero é exibido como `Sem preço`.
- Percentuais com divisor zero ficam indisponíveis.
- Lucro Unitário continua sendo calculado pela diferença de valores válidos.

### Precisão

- Cálculos internos usam precisão completa.
- Valores monetários e percentuais são exibidos com 2 casas.
- Alertas comparam valores internos antes do arredondamento.

### Preço sugerido

- O preço sugerido usa a Margem Bruta alvo:
  `Custo / (1 - Margem alvo / 100)`.
- O resultado final é arredondado para 2 casas.
- Markup permanece como métrica comparativa e não recalcula o preço sugerido.

### Níveis dos alertas

- Vermelho: Margem Bruta abaixo da Margem mínima.
- Amarelo: Margem Bruta entre mínimo e alvo.
- Verde: Margem Bruta igual ou acima da Margem alvo.
- Nenhum nível bloqueia vendas ou entradas.

### Atualização protegida

- A ação abre confirmação antes da escrita.
- A API precisa confirmar o sucesso antes de trocar o estado visual.
- Falhas restauram o preço cadastrado anterior.

### Permissão

- Operadores podem simular CMV.
- Supervisor ou administrador pode confirmar a atualização.

### Auditoria

- Atualizações registram produto, preço anterior, preço novo, CMV novo,
  operador e data/hora.

### Persistência da auditoria

- A auditoria terá uma nova tabela dedicada.
- A criação da tabela será feita por migration revisada.

### Listagem da View

- A listagem mostra somente produtos ativos de venda.
- O alcance inicial inclui Mercadorias para Revenda e Produtos Acabados.
- A busca filtra por nome ou `#PDV`.
- O filtro de Grupo usa combobox com todos os grupos.
- Os filtros vermelho, amarelo e verde correspondem aos estados definidos
  abaixo da margem mínima, entre mínimo e alvo e igual/acima do alvo.
- Os estados são indicados por badge na célula Margem Bruta.
- A linha permanece visualmente neutra.

### Combinação dos filtros

- Os filtros por cor selecionados usam lógica OU entre si.
- Pesquisa e Grupo restringem o resultado com lógica E.
- As cores selecionadas usam lógica OU entre si.

### Proteção contra concorrência

- A API verifica o preço atual antes de confirmar a atualização.
- Mudanças externas bloqueiam a ação e pedem recarga.

### Recálculo

- Não haverá recálculo automático em lote nem alteração automática dos produtos.
- Mudanças no Grupo afetam a resolução futura dos balizadores dos Produtos do Grupo.
- A classificação é calculada sob demanda na tela ou na operação relevante.
- O recálculo mencionado neste contexto atualiza somente cores, métricas e
  estados exibidos a partir do custo e do preço já cadastrados.
- Não haverá mudança automática ou em lote de `priceProduct`.
- Toda alteração de preço continua sendo uma ação explícita e protegida,
  individual ou por meio da View de simulação de CMV.
- Margem, Markup, Lucro Unitário e CMV serão persistidos em snapshots dedicados.
- A tabela histórica `margin_product_metrics` guardará custo, preço, métricas,
  balizadores efetivos, origem, estado e fonte de cada snapshot.
- Custo, preço e alterações de balizadores gerais, de Grupo ou de Produto
  gerarão snapshot automático por trigger, sem alterar `priceProduct`.
- A carga inicial criará um primeiro snapshot para os produtos ativos elegíveis.
- Cada snapshot de `margin_product_metrics` preservará o `#PDV` vigente no
  momento da captura, além do identificador interno do produto.
- O cadastro de Produtos exibirá as quatro métricas persistidas e os
  balizadores efetivos em modo somente leitura; a edição continuará na View
  de Margem.
- A View de Margem ficará publicada na navegação contextual de Views e poderá
  listar os produtos, simular CMV e consultar o histórico por snapshot.

### Superfícies dos alertas

- Os alertas serão exibidos em Produtos.
- Será criada uma View específica para simular CMV.
- Formação de Produtos, Entradas e auditoria não são superfícies confirmadas
  nesta etapa.

### View de simulação de CMV

- A View será uma listagem padrão de Produtos.
- Colunas: `#PDV`, `Produto`, `Preço de Venda`, `Margem Bruta`, `Markup`,
  `Lucro Unitário`, `CMV atual`, `Novo CMV` e `Ação`.
- `CMV atual` é somente leitura.
- `Novo CMV` é um campo editável que simula um novo preço de venda.
- Digitar `Novo CMV` recalcula o preço sugerido e todas as métricas derivadas
  sem gravar imediatamente.
- A ação atualiza `priceProduct` e retorna ao estado persistido após salvar.

### Cálculo do Novo CMV

- `Novo CMV` é limitado a percentuais de 0% a 100%.
- CMV 0% não gera preço; o resultado permanece indisponível.
- Preço sugerido: `Custo / (Novo CMV / 100)`.
- As métricas são recalculadas em memória até a ação confirmar o preço.

## Fronteira atual da sabatina

Nenhuma decisão pendente. Todas as decisões fechadas estão registradas neste
documento e o entendimento compartilhado foi confirmado.

## Regras da retomada

- Fazer uma pergunta por turno.
- Apresentar a recomendação para o cenário de bar e cozinha.
- Não gerar código, ADR final, glossário ou plano técnico antes de fechar a
  árvore de decisões e obter confirmação de entendimento compartilhado.
- Atualizar este documento quando uma decisão for respondida.

Para retomar em outra ocasião, envie:

> Continuar a sabatina dos balizadores de margem de lucro do PDV Zanzibar.

Se desejar registrar a primeira decisão imediatamente:

> Continuar a sabatina. Confirmo Margem Bruta sobre o preço de venda.
