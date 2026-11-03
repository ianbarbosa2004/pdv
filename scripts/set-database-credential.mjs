import keytar from "keytar";
import { getConfig } from "../src/server/config.js";

const config = getConfig();
if (process.platform !== "win32") {
  throw new Error("O armazenamento do Credential Manager está disponível somente no Windows.");
}
if (!config.database.password) {
  throw new Error("Defina PDV_DB_PASSWORD apenas durante este comando para provisionar a credencial.");
}

const service = process.env.PDV_DB_CREDENTIAL_SERVICE || "pdv-mariadb";
const account = process.env.PDV_DB_CREDENTIAL_ACCOUNT
  || `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`;

await keytar.setPassword(service, account, config.database.password);
console.log(`Credencial do MariaDB armazenada no Windows Credential Manager para ${account}.`);
