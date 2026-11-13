# Anotações pessoais

## Mapeamento das principais frentes do negócio

Para que o sistema atenda com excelência a operação diária de um bar e
restaurante, trabalharemos sobre os pilares fundamentais do setor.

### 2. Operação de frente de caixa e atendimento

- **Modalidades de venda:** venda direta no balcão, controle por comandas
  individuais e gestão de mesas.
- **Agilidade na operação:** navegação otimizada por teclado, atalhos de função
  como F1, F5 e F12, suporte a leitores de código de barras e seleção por
  grupos/categorias visuais.
- **Fechamento e sangria:** abertura/fechamento de caixa por operador,
  controle de suprimentos, sangrias e conciliação por forma de pagamento
  (dinheiro, PIX, cartão de crédito/débito).

### 3. Produção e impressão térmica

- **Roteamento de pedidos:** envio de itens lançados diretamente para as
  impressoras de produção, como Bar e Cozinha.
- **Formatos de cupom:** impressão de conferência de mesa, extrato de comanda
  e comprovante não fiscal/NFC-e.

### 4. Fiscal e estoque

- **Emissão NFC-e:** integração fiscal (Modelo 65), gestão de certificados
  digitais A1/A3, enquadramento no Simples Nacional e controle de contingência
  offline.
- **Ficha técnica e baixa de estoque:** venda de produtos compostos, como um
  drink que baixa doses de bebida e insumos ou uma porção que baixa
  matéria-prima por peso/unidade.

- **Numeração NFC-e:** a emissão integrada opcional usa `nfceNextNumberCompany` para reservar número na venda e grava o documento em `sale_fiscal_documents`; o teste isolado continua usando número temporário.

- **Contingência:** `nfceContingencyCompany` continua preparatória; não há emissão offline, envio posterior ou reconciliação.

- **Recomendação:** não habilitar A3 nem contingência como recursos funcionais antes de implementar os fluxos correspondentes

Como o sistema ainda está em desenvolvimento e não tem vendas registradas ainda, simplesmente ir lançando notas fiscais de entrada para calcular o preço acho que não seria eficaz pois quando o sistema for lançado não terá mais produtos das compras efetuadas e lançadas

Você identificou uma armadilha clássica na implantação de sistemas de gestão: **se você alimentar a Média Ponderada Móvel (MPM) apenas com entradas históricas sem registrar as saídas correspondentes, o estoque físico vai inflar artificialmente e compras antigas vão distorcer o custo médio atual.**

Para resolver isso durante a fase de desenvolvimento sem poluir o estoque nem perder o histórico de preços das notas fiscais que você já quer ir testando/cadastrando, o ideal é separar **dois conceitos** na sua arquitetura (especialmente agora que você está estruturando o módulo de entrada fiscal e catálogo):

### 1. Separação entre Histórico de Preços e Saldo de Estoque (Fase de Implantação)

Em vez de atrelar o custo do produto exclusivamente à movimentação de saldo físico enquanto o PDV não está rodando em produção, trate os indicadores de custo de forma isolada:

* **Último Custo de Compra (Custo de Reposição):** A cada nota fiscal lançada, atualize um campo de `ultimo_custo` (e registre o item numa tabela de histórico de compras/fornecedores). Isso não depende de saldo em estoque e já te dá a referência mais fiel para precificação e fichas técnicas.
* **Modo de Simulação / Homologação na Entrada Fiscal:** Na fila de documentos fiscais (`fiscal-document-queue-screen.js`), permita importar e validar as notas para testar o parser, os impostos e a conversão de unidades, mas sem somar ao saldo oficial de estoque (ou marcando como movimentação de teste que será limpa no *cutover*).

### 2. Estratégia de "Virada de Chave" (Go-Live / Cutover)

Quando o sistema for efetivamente entrar em operação no bar/restaurante, você faz um corte limpo:

1. **Zerar movimentações de teste:** Limpe os saldos fictícios acumulados durante o desenvolvimento, mantendo apenas os cadastros base (produtos, unidades, fornecedores, receitas).
2. **Inventário Inicial (Balanço de Abertura):** No dia da implantação (antes de abrir o caixa às 17:00), conte o estoque físico real do que está nas prateleiras, geladeiras e cozinha.
3. **Carga Inicial de Custo:** Lance esse inventário inicial no sistema atribuindo a cada produto o **custo da última compra registrada** (ou a média das últimas 2 ou 3 notas recentes que você já havia importado).

A partir desse exato momento — com o saldo físico batendo com a realidade e o custo base calibrado — as vendas no PDV passam a baixar o estoque e as novas notas fiscais passam a calcular a Média Ponderada Móvel de forma 100% real.

### 3. Regra de Proteção no Código para Estoque Zerado ou Negativo

Mesmo em produção, num ambiente de bar e restaurante, é comum vender um item antes de lançar a nota fiscal de entrada que acabou de chegar (gerando estoque negativo temporário). Para evitar distorções matemáticas na sua fórmula de MPM, já deixe previsto no serviço de entrada:

* **Se `estoque_atual <= 0` antes da nova compra:** O sistema ignora o saldo anterior (não multiplica por zero nem por número negativo) e assume que o **novo custo médio passa a ser exatamente o custo unitário desta nova nota fiscal**.

Como você está desenhando o fluxo de entrada fiscal agora, quer estruturar como essa diferenciação (último custo vs. custo médio) vai ficar no banco de dados ou na tela de revisão da nota?

Para implementar essa arquitetura de forma limpa no seu stack (**MariaDB**, **Node.js 22+ ESM** e **Tauri 2**), o objetivo é separar o **histórico de aquisição/custos** da **posição física de estoque**, permitindo que você processe XMLs de entrada desde já (alimentando preços e fichas técnicas) sem gerar saldo fantasma até o *go-live*.

---

### 1. Modelagem de Dados (MariaDB)

Além da tabela `products` (que mantém o estado atual para consulta rápida no PDV e nas fichas técnicas), criamos uma tabela de histórico imutável de custos e adicionamos controles na fila de entrada fiscal.

#### A. Ajustes na tabela `products`

Garanta que o produto armazene tanto o custo de reposição quanto o custo médio vigente e o saldo físico:

```sql
ALTER TABLE products
  ADD COLUMN stock_quantity DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN last_purchase_cost DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN average_cost DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  ADD COLUMN cost_updated_at DATETIME NULL;

```

#### B. Tabela `product_cost_history` (Histórico de Compras e Custos)

Registra cada item confirmado de uma nota fiscal (ou ajuste manual), preservando a memória de cálculo mesmo quando o estoque físico não é movimentado:

```sql
CREATE TABLE IF NOT EXISTS product_cost_history (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  fiscal_document_id BIGINT UNSIGNED NULL,
  operation_mode ENUM('COST_ONLY', 'STOCK_AND_COST', 'INVENTORY_CUTOVER') NOT NULL,
  purchased_quantity DECIMAL(15, 4) NOT NULL,
  unit_purchase_cost DECIMAL(15, 4) NOT NULL,
  previous_stock_quantity DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  previous_average_cost DECIMAL(15, 4) NOT NULL DEFAULT 0.0000,
  resulting_average_cost DECIMAL(15, 4) NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cost_history_product FOREIGN KEY (product_id) REFERENCES products(id)
) ENGINE=InnoDB;

```

---

### 2. Regras de Negócio na Confirmação da Nota Fiscal

Ao confirmar um documento na fila de entrada fiscal (`fiscal-document-queue-screen.js`), o operador (ou o parâmetro do sistema enquanto estiver em pré-operação) define o `operation_mode`:

1. **Modo `COST_ONLY` (Fase Atual / Pré-Operação):**
* **Estoque físico:** Permanece inalterado (`stock_quantity` não é tocado).
* **Último custo:** Atualizado para o `unit_purchase_cost` convertido para a unidade base do produto.
* **Custo médio de referência:** Calculado pela **janela das últimas $N$ compras** (ex.: últimas 3 entradas registradas em `product_cost_history` para aquele produto), ponderadas pelas quantidades compradas nas respectivas notas:

$$\text{Custo Médio Ref.} = \frac{\sum (\text{Qtd. Nota}_i \times \text{Custo Unit.}_i)}{\sum \text{Qtd. Nota}_i}$$


* **Efeito colateral imediato:** Atualiza o custo dos ingredientes nas receitas/fichas técnicas (`recipe-screen.js`) e remove o produto da lista de pendências (`no-cost-screen.js`).




2. **Modo `STOCK_AND_COST` (Operação Normal Pós-Lançamento):**
* **Se $\text{Saldo Atual} > 0$:** Aplica a Média Ponderada Móvel clássica:

$$\text{Novo Custo Médio} = \frac{(\text{Saldo Atual} \times \text{Custo Médio Anterior}) + (\text{Qtd. Comprada} \times \text{Custo Unit. Compra})}{\text{Saldo Atual} + \text{Qtd. Comprada}}$$


* **Se $\text{Saldo Atual} \le 0$:** Ignora o saldo anterior para evitar distorção negativa e define $\text{Novo Custo Médio} = \text{Custo Unit. Compra}$.
* **Estoque físico:** Incrementado (`stock_quantity = stock_quantity + purchased_quantity`).



---

### 3. Implementação no Serviço Backend (`Node.js` + `mysql2`)

Exemplo de função transacional para processar a atualização de custo de um item confirmado:

```javascript
/**
 * Calcula e persiste a atualização de custo (e opcionalmente estoque) de um produto.
 * Deve ser executada dentro de uma transação (connection.beginTransaction()).
 */
export async function applyPurchaseCostUpdate(connection, {
  productId,
  fiscalDocumentId = null,
  operationMode = 'COST_ONLY', // 'COST_ONLY' | 'STOCK_AND_COST'
  purchasedQuantity,           // Já convertido para a unidade base do produto
  unitPurchaseCost,            // Custo unitário líquido + encargos na unidade base
  rollingWindowSize = 3        // Janela de notas para o modo COST_ONLY
}) {
  const [[product]] = await connection.query(
    `SELECT stock_quantity, average_cost
       FROM products
      WHERE id = ?
      FOR UPDATE`,
    [productId]
  );

  if (!product) {
    throw new Error(`Produto ${productId} não encontrado.`);
  }

  const prevStock = Number(product.stock_quantity);
  const prevAvgCost = Number(product.average_cost);
  const qty = Number(purchasedQuantity);
  const unitCost = Number(unitPurchaseCost);

  let newAvgCost = unitCost;
  let newStock = prevStock;

  if (operationMode === 'COST_ONLY') {
    // Busca as (N - 1) compras anteriores para compor a janela móvel de N compras
    const [recentPurchases] = await connection.query(
      `SELECT purchased_quantity, unit_purchase_cost
         FROM product_cost_history
        WHERE product_id = ?
        ORDER BY recorded_at DESC, id DESC
        LIMIT ?`,
      [productId, Math.max(0, rollingWindowSize - 1)]
    );

    let totalWindowQty = qty;
    let totalWindowValue = qty * unitCost;

    for (const row of recentPurchases) {
      const rQty = Number(row.purchased_quantity);
      const rCost = Number(row.unit_purchase_cost);
      totalWindowQty += rQty;
      totalWindowValue += rQty * rCost;
    }

    newAvgCost = totalWindowQty > 0 ? totalWindowValue / totalWindowQty : unitCost;
    // newStock permanece igual a prevStock
  } else if (operationMode === 'STOCK_AND_COST') {
    if (prevStock > 0) {
      const currentTotalValue = prevStock * prevAvgCost;
      const incomingTotalValue = qty * unitCost;
      newAvgCost = (currentTotalValue + incomingTotalValue) / (prevStock + qty);
    } else {
      newAvgCost = unitCost;
    }
    newStock = prevStock + qty;
  }

  // Arredondamento para 4 casas decimais
  newAvgCost = Math.round(newAvgCost * 10000) / 10000;
  newStock = Math.round(newStock * 10000) / 10000;

  await connection.query(
    `INSERT INTO product_cost_history (
       product_id, fiscal_document_id, operation_mode,
       purchased_quantity, unit_purchase_cost,
       previous_stock_quantity, previous_average_cost, resulting_average_cost
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      productId,
      fiscalDocumentId,
      operationMode,
      qty,
      unitCost,
      prevStock,
      prevAvgCost,
      newAvgCost
    ]
  );

  await connection.query(
    `UPDATE products
        SET stock_quantity = ?,
            last_purchase_cost = ?,
            average_cost = ?,
            cost_updated_at = NOW()
      WHERE id = ?`,
    [newStock, unitCost, newAvgCost, productId]
  );

  return {
    productId,
    operationMode,
    previousStock: prevStock,
    newStock,
    previousAverageCost: prevAvgCost,
    newAverageCost: newAvgCost
  };
}

```

---

### 4. Passo a Passo para a Virada de Chave (*Go-Live*)

Quando o PDV for entrar em operação real no balcão:

1. **Contagem Física (Inventário Zero):** Conte apenas o que existe fisicamente nas prateleiras, geladeiras e estoque no momento da abertura.
2. **Carga do Saldo Inicial:** Para cada produto contado, atualize `stock_quantity` com a quantidade física real, **mantendo** o `average_cost` que já foi formado pelas notas lançadas durante o período de desenvolvimento (e registre um evento `INVENTORY_CUTOVER` no histórico).
3. **Alteração do Padrão:** Mude o modo padrão da entrada fiscal de `COST_ONLY` para `STOCK_AND_COST`. A partir daí, cada venda no PDV (`sale-service.js`) abate `stock_quantity` e cada nova NF-e recalcula a Média Ponderada Móvel real.



Deseja adaptar esse fluxo diretamente nos arquivos existentes de entrada fiscal (`fiscal-document-queue-screen.js` / `schema-manager.js`)ou detalhar como fica a propagação automática desse novo custo médio para o custo das receitas?

Para detalhar a integração completa entre a **Entrada Fiscal** (`fiscal-document-queue-screen.js`), o **Schema do Banco** (`schema-manager.js`) e a **Propagação Automática de Custos para Receitas/Fichas Técnicas** (`recipe-screen.js` / `src/shared/recipe.js`), precisamos cobrir duas frentes:

1. **Ajustes na Entrada Fiscal (UI + Backend):** Como o operador confirma a nota escolhendo o modo (`COST_ONLY` vs. `STOCK_AND_COST`).


2. **Propagação em Cascata para Receitas (Bom/Sub-receitas):** Como o novo `average_cost` de um insumo recalcula automaticamente o custo de pratos e bases culinárias (ex.: um molho ou caldo que serve de ingrediente para outro prato).

---

### 1. Propagação Automática de Custos nas Receitas

Em um bar e restaurante, uma receita pode ser composta por insumos diretos (ex.: carne, creme de leite) e por **sub-receitas** (ex.: fundo de carne, molho base, massa). Quando a NF-e de um insumo é confirmada, o sistema deve recalcular as receitas afetadas de baixo para cima (*bottom-up*).

#### Fluxo de Recálculo em Cascata

1. **Identificação Direta:** Ao atualizar o `average_cost` do `product_id` $X$, buscamos todas as receitas onde $X$ aparece como componente/ingrediente.
2. **Cálculo do Custo da Receita:**
* Para cada ingrediente da receita, aplica-se o fator de conversão culinária (`src/shared/recipe-component.js` / `culinary-conversion-reference.md`) e o fator de correção/rendimento (perda por limpeza/cocção).


* Soma-se o custo de todos os ingredientes para obter o **Custo Total da Receita** e divide-se pelo rendimento (porções ou peso final) para obter o **Custo Unitário da Receita**.


3. **Atualização do Produto Vinculado (Sub-receita):**
* Se a receita produz um item intermediário cadastrado como produto (ex.: *Molho Bolonhesa Base*), o `average_cost` desse produto também é atualizado com o novo custo unitário da receita.


4. **Recursão (com proteção contra ciclo):**
* Se essa receita atualizada for ingrediente de outra receita (nível superior), o recálculo sobe mais um nível usando um conjunto (`Set`) de IDs já visitados para evitar loop infinito.



#### Implementação em Node.js (`src/server/cost-propagation-service.js`)

```javascript
/**
 * Propaga em cascata a alteração de custo médio de um ou mais produtos
 * para todas as receitas que os utilizam (incluindo sub-receitas).
 */
export async function propagateCostToRecipes(connection, initialProductIds) {
  const queue = [...new Set(initialProductIds.map(Number))];
  const visitedRecipes = new Set();
  const updatedRecipes = [];

  while (queue.length > 0) {
    const currentProductId = queue.shift();

    // 1. Busca receitas que utilizam o produto atual como ingrediente
    // (Ajuste os nomes das colunas conforme o seu schema.sql)
    const [recipeLinks] = await connection.query(
      `SELECT DISTINCT recipe_id
         FROM recipe_ingredients
        WHERE product_id = ?`,
      [currentProductId]
    );

    for (const { recipe_id: recipeId } of recipeLinks) {
      if (visitedRecipes.has(recipeId)) continue;
      visitedRecipes.add(recipeId);

      // 2. Carrega cabeçalho da receita e todos os seus ingredientes com o custo atual
      const [[recipe]] = await connection.query(
        `SELECT id, output_product_id, yield_quantity
           FROM recipes
          WHERE id = ?
          FOR UPDATE`,
        [recipeId]
      );

      if (!recipe) continue;

      const [ingredients] = await connection.query(
        `SELECT ri.quantity,
                ri.conversion_factor,
                ri.correction_factor,
                p.average_cost
           FROM recipe_ingredients ri
           JOIN products p ON p.id = ri.product_id
          WHERE ri.recipe_id = ?`,
        [recipeId]
      );

      // 3. Recalcula o custo total da receita com precisão decimal
      let totalRecipeCost = 0;
      for (const item of ingredients) {
        const qty = Number(item.quantity) || 0;
        const conv = Number(item.conversion_factor) || 1;
        const corr = Number(item.correction_factor) || 1; // Ex: 1.15 para 15% de perda
        const unitCost = Number(item.average_cost) || 0;

        totalRecipeCost += qty * conv * corr * unitCost;
      }

      const yieldQty = Number(recipe.yield_quantity) || 1;
      const unitRecipeCost = Math.round((totalRecipeCost / yieldQty) * 10000) / 10000;
      totalRecipeCost = Math.round(totalRecipeCost * 10000) / 10000;

      // 4. Atualiza os custos armazenados na receita
      await connection.query(
        `UPDATE recipes
            SET total_cost = ?,
                unit_cost = ?,
                cost_updated_at = NOW()
          WHERE id = ?`,
        [totalRecipeCost, unitRecipeCost, recipeId]
      );

      updatedRecipes.push({
        recipeId,
        totalRecipeCost,
        unitRecipeCost
      });

      // 5. Se a receita gera um produto/sub-receita, atualiza o custo dele e enfileira
      if (recipe.output_product_id) {
        const outputProdId = Number(recipe.output_product_id);
        await connection.query(
          `UPDATE products
              SET average_cost = ?,
                  last_purchase_cost = ?,
                  cost_updated_at = NOW()
            WHERE id = ?`,
          [unitRecipeCost, unitRecipeCost, outputProdId]
        );
        queue.push(outputProdId);
      }
    }
  }

  return updatedRecipes;
}

```

---

### 2. Orquestração Completa da Confirmação da NF-e

Ao confirmar uma nota fiscal na fila (`fiscal-document-queue-screen.js`), o endpoint da API executa tudo dentro de **uma única transação** no MariaDB. Se qualquer item falhar na validação (ex.: produto não vinculado ou fator de conversão inválido), toda a nota sofre `rollback` sem deixar custos pela metade.

```javascript
import { pool } from './database.js';
import { applyPurchaseCostUpdate } from './cost-service.js';
import { propagateCostToRecipes } from './cost-propagation-service.js';

export async function confirmFiscalDocument({
  fiscalDocumentId,
  operationMode = 'COST_ONLY', // 'COST_ONLY' ou 'STOCK_AND_COST'
  rollingWindowSize = 3,
  items // [{ productId, purchasedQuantity, unitPurchaseCost }]
}) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const updatedProductIds = [];
    const costResults = [];

    for (const item of items) {
      const result = await applyPurchaseCostUpdate(connection, {
        productId: item.productId,
        fiscalDocumentId,
        operationMode,
        purchasedQuantity: item.purchasedQuantity,
        unitPurchaseCost: item.unitPurchaseCost,
        rollingWindowSize
      });

      updatedProductIds.push(item.productId);
      costResults.push(result);
    }

    // Propaga os novos custos médios para todas as receitas e sub-receitas afetadas
    const updatedRecipes = await propagateCostToRecipes(connection, updatedProductIds);

    // Marca o documento fiscal como processado na fila
    await connection.query(
      `UPDATE fiscal_documents
          SET status = 'CONFIRMED',
              processed_mode = ?,
              confirmed_at = NOW()
        WHERE id = ?`,
      [operationMode, fiscalDocumentId]
    );

    await connection.commit();

    return {
      fiscalDocumentId,
      operationMode,
      updatedProducts: costResults,
      updatedRecipesCount: updatedRecipes.length,
      updatedRecipes
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

```

---

### 3. Ajustes na Interface de Entrada Fiscal (`fiscal-document-queue-screen.js`)



Para tornar o processo seguro e transparente antes e depois do lançamento do sistema:

* Parâmetro Global de Configuração (`general-settings-screen.js`):


* Adicionar uma configuração de sistema: `stock_entry_default_mode` com os valores `COST_ONLY` (padrão atual em pré-operação) ou `STOCK_AND_COST` (padrão pós-*go-live*).


* **Seletor no Modal de Confirmação da NF-e:**
* Ao clicar em **"Confirmar Entrada"** na fila de documentos fiscais, exibir o modo pré-selecionado com um aviso visual claro:
* *Modo Atualização de Custos (Pré-Operação):* `"Atualiza último custo, custo médio (últimas 3 compras) e fichas técnicas. Não altera o saldo físico em estoque."`
* *Modo Completo (Estoque + Custo):* `"Incrementa o saldo físico em estoque e recalcula o custo médio ponderado móvel."`




* **Prévia de Impacto (Antes de Confirmar):**
* Na grade de itens da nota (usando o padrão de `form-row-preview.js`), mostrar lado a lado:


* **Custo Médio Atual** $\rightarrow$ **Novo Custo Médio Estimado** (destacando variações percentuais acima de 5% em amarelo/vermelho para alertar sobre alta de fornecedor ou erro de fator de conversão de caixa/fardo).





---

### 4. Checklist de Validação de Borda (Edge Cases)

* **Fator de Conversão de Compra vs. Estoque:** Se a NF-e vem como `1 CX` (Caixa com 24 latas) por `R$ 72,00`, a tela de entrada fiscal deve multiplicar a quantidade pelo fator de embalagem (`1 * 24 = 24 UN`) e dividir o custo unitário (`72,00 / 24 = R$ 3,00`) **antes** de enviar `purchasedQuantity` e `unitPurchaseCost` para o serviço de custo.
* **Frete, IPI e ICMS-ST Rateados:** O `unitPurchaseCost` passado para a função já deve ser o **custo efetivo unitário** do item na nota:

$$\text{Custo Efetivo Item} = \frac{\text{Valor Produtos} - \text{Desconto} + \text{Frete} + \text{Seguro} + \text{Outras Desp.} + \text{IPI} + \text{ICMS-ST}}{\text{Qtd. Convertida para Unidade Base}}$$


* **Auditoria de Margem:** Como `propagateCostToRecipes` atualiza `unit_cost` nas receitas imediatamente, você pode exibir um alerta na resposta da confirmação caso algum prato do cardápio tenha ficado com CMV (Custo de Mercadoria Vendida) acima da meta configurada.

Se quiser, podemos escrever os testes unitários nativos (`node:test`) cobrindo os cenários de `COST_ONLY` (janela de 3 notas), transição para `STOCK_AND_COST` e propagação em cascata para receitas.
