import mysql from "mysql2/promise";
import { getConfig } from "./config.js";

export function createPool(config = getConfig()) {
  return mysql.createPool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.name,
    user: config.database.user,
    password: config.database.password,
    charset: "utf8mb4",
    connectTimeout: 5000,
    waitForConnections: true,
    connectionLimit: 10,
    enableKeepAlive: true
  });
}
