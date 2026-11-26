import fs from "node:fs";
import { TABLE_DESCRIPTIONS } from "../src/server/table-descriptions.js";

const files = [
  "database/schema.sql",
  "src/server/schema-manager.js",
  "src/server/ncm-cest-update.js"
];

for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
  let tableName = "";
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/CREATE TABLE IF NOT EXISTS (?:`([^`]+)`|(\w+))/);
    if (start) {
      tableName = start[1] || start[2];
      continue;
    }
    if (!tableName || !/^\s*\)\s+ENGINE=/.test(lines[index])) continue;
    const description = TABLE_DESCRIPTIONS[tableName];
    if (!description || /COMMENT\s*=/.test(lines[index])) {
      tableName = "";
      continue;
    }
    const escapedDescription = description.replaceAll("'", "''");
    if (file === "database/schema.sql") {
      lines[index] = lines[index].replace(
        /;\s*$/,
        ` COMMENT='${escapedDescription}';`
      );
    } else {
      const closingBacktick = lines[index].lastIndexOf("`");
      if (closingBacktick >= 0) {
        lines[index] =
          `${lines[index].slice(0, closingBacktick)} COMMENT='${escapedDescription}'` +
          lines[index].slice(closingBacktick);
      } else {
        lines[index] = `${lines[index]} COMMENT='${escapedDescription}'`;
      }
    }
    tableName = "";
  }
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}
