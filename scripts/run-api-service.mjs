import { appendFileSync } from "node:fs";

const errorLog = process.env.PDV_SERVICE_ERROR_LOG
  || "C:\\ProgramData\\PDV\\logs\\api-startup.error.log";

try {
  await import("../src/server/server.js");
} catch (error) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  appendFileSync(errorLog, `[${new Date().toISOString()}] ${message}\n`, "utf8");
  process.exitCode = 1;
}
