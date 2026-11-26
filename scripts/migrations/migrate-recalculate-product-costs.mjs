import mysql from "mysql2/promise";
import { loadRootMigrationConfig } from "../../src/server/config.js";
import {
  calculateCostForPolicyChange,
  calculateCostUpdateSequence,
  calculateFiscalItemImpact
} from "../../src/shared/inventory.js";

const apply = process.argv.includes("--apply");

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .trim()
    .toLocaleUpperCase("pt-BR");

const isNonSaleProductType = (description) =>
  ["MATERIA-PRIMA", "EMBALAGEM", "MATERIAL DE USO E CONSUMO"].includes(normalizeText(description));

const main = async () => {
  const config = await loadRootMigrationConfig();
  const connection = await mysql.createConnection({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    charset: "utf8mb4",
    connectTimeout: 5000
  });

  try {
    await connection.beginTransaction();
    const [columnRows] = await connection.query(
      `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'fiscal_document_items'
         AND COLUMN_NAME = 'entryDateFiscalDocumentItem'`
    );
    if (!columnRows.length) {
      throw new Error("Execute a inicialização da API antes desta migração para criar entryDateFiscalDocumentItem.");
    }

    const [productRows] = await connection.query(
      `SELECT p.idProduct, p.costPolicyProduct, p.costPriceProduct,
              p.stockQuantityProduct, p.priceProduct,
              p.packageQuantityProduct,
              types.descriptionProductType
       FROM products p
       LEFT JOIN product_types types ON types.idProductType = p.idProductTypeProduct
       ORDER BY p.idProduct`
    );
    const changes = [];

    for (const product of productRows) {
      const [entryRows] = await connection.query(
        `SELECT i.quantityFiscalDocumentItem,
                i.totalFiscalDocumentItem,
                pfr.conversionFactor
         FROM fiscal_entry_items ei
         JOIN fiscal_entries entry ON entry.idFiscalEntry = ei.idFiscalEntry
         JOIN fiscal_document_items i ON i.idFiscalDocumentItem = ei.idFiscalDocumentItem
         JOIN product_fiscal_references pfr
           ON pfr.idProductFiscalReference = ei.idProductFiscalReference
         WHERE pfr.idProduct = ?
           AND entry.statusFiscalEntry = 'confirmed'
         ORDER BY COALESCE(i.entryDateFiscalDocumentItem, DATE(entry.confirmedAtFiscalEntry), '9999-12-31') ASC,
                  entry.idFiscalEntry ASC,
                  i.lineNumberFiscalDocumentItem ASC,
                  i.idFiscalDocumentItem ASC`,
        [product.idProduct]
      );
      const [movementRows] = await connection.query(
        `SELECT previousStockInventoryMovement, previousCostInventoryMovement
         FROM inventory_movements
         WHERE idProduct = ? AND typeInventoryMovement = 'fiscal_entry'
         ORDER BY idInventoryMovement ASC
         LIMIT 1`,
        [product.idProduct]
      );

      const entries = entryRows.map((entry) => {
        const impact = calculateFiscalItemImpact({
          sourceQuantity: entry.quantityFiscalDocumentItem,
          sourceTotal: entry.totalFiscalDocumentItem,
          conversionFactor: entry.conversionFactor,
          packageQuantity: product.packageQuantityProduct
        });
        return { quantity: impact.quantity, unitCost: impact.unitCost };
      });

      let nextCost;
      if (movementRows.length) {
        const sequence = calculateCostUpdateSequence({
          policy: product.costPolicyProduct,
          previousStock: movementRows[0].previousStockInventoryMovement,
          previousCost: movementRows[0].previousCostInventoryMovement,
          entries: entries.map((entry) => ({
            receivedQuantity: entry.quantity,
            receivedUnitCost: entry.unitCost
          }))
        });
        nextCost = sequence.nextCost;
      } else {
        nextCost = calculateCostForPolicyChange({
          policy: product.costPolicyProduct,
          previousCost: product.costPriceProduct,
          previousStock: product.stockQuantityProduct,
          entries
        });
      }

      nextCost = Number(Number(nextCost || 0).toFixed(2));
      if (nextCost !== Number(product.costPriceProduct)) {
        changes.push({
          idProduct: product.idProduct,
          previousCost: Number(product.costPriceProduct),
          nextCost
        });
        if (apply) {
          const nonSale = isNonSaleProductType(product.descriptionProductType);
          await connection.query(
            nonSale
              ? "UPDATE products SET costPriceProduct = ?, priceProduct = ? WHERE idProduct = ?"
              : "UPDATE products SET costPriceProduct = ? WHERE idProduct = ?",
            nonSale
              ? [nextCost, nextCost, product.idProduct]
              : [nextCost, product.idProduct]
          );
        }
      }
    }

    if (apply) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    console.log(`${apply ? "Aplicada" : "Preview"}: ${changes.length} custo(s) de Produto serão alterados.`);
    for (const change of changes) {
      console.log(`#${change.idProduct}: ${change.previousCost.toFixed(2)} -> ${change.nextCost.toFixed(2)}`);
    }
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha ao recalcular custos dos Produtos: ${error.message}`);
  process.exitCode = 1;
});
