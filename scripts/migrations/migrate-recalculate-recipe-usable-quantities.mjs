import mysql from "mysql2/promise";
import { loadRootMigrationConfig } from "../../src/server/config.js";
import { propagateRecipeCosts } from "../../src/server/recipe-cost-propagation.js";

const apply = process.argv.includes("--apply");

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
    const [recipeRows] = await connection.query(
      "SELECT idRecipe FROM recipe_definitions WHERE statusRecipe <> 'archived' ORDER BY idRecipe"
    );
    const recipeIds = recipeRows.map((recipe) => Number(recipe.idRecipe));
    const result = await propagateRecipeCosts(connection, [], recipeIds);

    const [componentRows] = await connection.query(
      `SELECT idRecipeComponent, quantityRecipeComponent, lossPercentRecipeComponent
       FROM recipe_components
       WHERE quantityRecipeComponent > 0
         AND lossPercentRecipeComponent > 0
       ORDER BY idRecipeComponent`
    );

    if (apply) {
      await connection.commit();
    } else {
      await connection.rollback();
    }

    console.log(`${apply ? "Aplicada" : "Preview"}: ${result.updatedRecipeCount} estrutura(s) recalculada(s).`);
    console.log(`${componentRows.length} componente(s) possuem perda e terão quantidade útil recalculada em memória.`);
  } finally {
    await connection.end();
  }
};

main().catch((error) => {
  console.error(`Falha ao recalcular custos e quantidades úteis das Receitas: ${error.message}`);
  process.exitCode = 1;
});
