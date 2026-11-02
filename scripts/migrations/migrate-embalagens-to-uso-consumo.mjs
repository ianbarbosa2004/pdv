import mysql from "mysql2/promise";
import { getConfig } from "../../src/server/config.js";

const sourceClass = "EMBALAGENS";
const sourceGroup = "DESCARTÁVEIS";
const targetClass = "USO E CONSUMO";
const targetGroup = "USO E CONSUMO";
const targetProductType = "MATERIAL DE USO E CONSUMO";

const main = async () => {
  const config = getConfig();
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
    const [targetRows] = await connection.query(
      `SELECT classes.idClass, groups.idGroup, product_types.idProductType
       FROM classes
       INNER JOIN \`groups\` groups ON groups.idClass = classes.idClass
       CROSS JOIN product_types
       WHERE classes.descriptionClass = ?
         AND groups.descriptionGroup = ?
         AND product_types.descriptionProductType = ?
       LIMIT 1`,
      [targetClass, targetGroup, targetProductType]
    );
    if (!targetRows.length) {
      throw new Error("Cadastros de destino não encontrados.");
    }

    const target = targetRows[0];
    const [products] = await connection.query(
      `SELECT products.idProduct, products.skuProduct
       FROM products
       INNER JOIN \`groups\` groups ON groups.idGroup = products.idGroup
       INNER JOIN classes ON classes.idClass = groups.idClass
       WHERE classes.descriptionClass = ?
         AND groups.descriptionGroup = ?
         AND products.skuProduct LIKE 'EMB-%'
       ORDER BY products.idProduct
       FOR UPDATE`,
      [sourceClass, sourceGroup]
    );

    const targetSkus = products.map(({ skuProduct }) => skuProduct.replace(/^EMB-/i, "USO-"));
    if (new Set(targetSkus).size !== targetSkus.length) {
      throw new Error("A alteração geraria SKUs de destino duplicados.");
    }
    if (targetSkus.length) {
      const placeholders = targetSkus.map(() => "?").join(", ");
      const [conflicts] = await connection.query(
        `SELECT idProduct, skuProduct
         FROM products
         WHERE skuProduct IN (${placeholders})
           AND idProduct NOT IN (${products.map(() => "?").join(", ")})`,
        [...targetSkus, ...products.map(({ idProduct }) => idProduct)]
      );
      if (conflicts.length) {
        throw new Error(`Já existem ${conflicts.length} SKU(s) de destino cadastrados.`);
      }
    }

    for (const { idProduct, skuProduct } of products) {
      await connection.query(
        `UPDATE products
         SET idGroup = ?, idProductTypeProduct = ?, skuProduct = ?
         WHERE idProduct = ?`,
        [target.idGroup, target.idProductType, skuProduct.replace(/^EMB-/i, "USO-"), idProduct]
      );
    }
    await connection.commit();
    console.log(`Correção concluída: ${products.length} produto(s) movido(s) para ${targetClass} / ${targetGroup}, tipo ${targetProductType}, com prefixo USO-.`);
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha na correção de produtos EMB: ${error.message}`);
  process.exitCode = 1;
});
