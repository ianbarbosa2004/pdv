import { readdir, readFile, stat } from "node:fs/promises";
import { appendFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";

const RETENTION_DAYS = 14;

const allowedSources = new Set(["api", "frontend", "vite", "database", "backup", "tauri", "cargo", "service", "printer", "system"]);
const allowedLevels = new Set(["debug", "info", "warn", "error"]);

const cleanText = (value, limit = 500) =>
  String(value ?? "")
    .replace(/[\r\n\t]+/gu, " ")
    .replace(/\b"(?:password|token|authorization|cpf|cnpj|payment|payload|senha|cartao|pagamento|secret|cardNumber)"\s*:\s*"(?:[^"\\]|\\.)*"/giu, "[redacted]")
    .replace(/\b(?:payload)\b\s*(?:=|:)?\s*\{[^}]*\}/giu, "[redacted]")
    .replace(/\b(password|token|authorization|cpf|cnpj|payment|payload|senha|cartao|pagamento|secret|cardNumber)\s*=\s*["']?[^\s"',;\[\]\}\]]+/giu, "$1=[redacted]")
    .replace(/\b(?:password|token|authorization|cpf|cnpj|payment|payload|senha|cartao|pagamento|secret|cardNumber)\s*:\s*[^\s"',;}\]]+/giu, "[redacted]")
    .replace(/\b(?:password|token|authorization|cpf|cnpj|payment|payload|senha|cartao|pagamento)\b\s+["']?[^\s"',;}\]]+/giu, "[redacted]")
    .trim()
    .slice(0, limit);

const allowedLogFileName = (fileName) =>
  /^PDV-API(?:_\d{8})?\.(?:err|out)\.log$/iu.test(fileName)
  || /^PDV-API\.wrapper\.log$/iu.test(fileName)
  || /^api-startup(?:\.error)?\.log$/iu.test(fileName)
  || /^pdv-(?:node|api|vite|tauri|cargo|mariadb|database|service|printer)(?:[._-].*)?\.log$/iu.test(fileName);

export const createComponentLogWriter = ({
  directory = process.env.PDV_LOG_DIR || "C:\\ProgramData\\PDV\\logs",
  fileName = "pdv-node.log"
} = {}) => {
  if (!allowedLogFileName(fileName)) {
    throw new Error("Nome de arquivo de log não permitido.");
  }

  const targetDirectory = String(directory);
  mkdirSync(targetDirectory, { recursive: true });
  const targetPath = join(targetDirectory, fileName);

  const write = (level = "info", message = "") => {
    const normalizedLevel = allowedLevels.has(String(level).toLowerCase())
      ? String(level).toLowerCase()
      : "info";
    const cleanMessage = cleanText(message, 5000);
    if (!cleanMessage) return;
    const timestamp = new Date().toISOString();
    appendFileSync(
      targetPath,
      `[${timestamp}] [${normalizedLevel.toUpperCase()}] ${cleanMessage}\n`,
      "utf8"
    );
  };

  return { write, targetPath };
};

const inferRealLogLevel = (fileName, message) => {
  const text = String(message || "").toLowerCase();
  if (/\.err\.log$/iu.test(fileName) || /error|falha|exception|denied|rejeitad|errno/iu.test(text)) return "error";
  if (/warn|aviso|canceled|cancelado/iu.test(text)) return "warn";
  return "info";
};

const parseRealLogTimestamp = (line, fallback) => {
  const match = String(line).match(/\[?(\d{4}-\d{2}-\d{2}[T ][0-9:.+Z-]+)\]?/u);
  if (!match) return fallback;
  const normalized = match[1].includes(" ") ? match[1].replace(" ", "T") : match[1];
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
};

export const createRealLogReader = ({
  logDirectories = [
    process.env.PDV_LOG_DIR || "C:\\ProgramData\\PDV\\logs",
    join(process.cwd(), "logs")
  ]
} = {}) => {
  const readEntries = async ({ source = "", level = "", limit = 500 } = {}) => {
    const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 500));
    const normalizedSource = String(source).trim().toLowerCase();
    const normalizedLevel = String(level).trim().toLowerCase();
    const entries = [];
    const directories = [...new Set(logDirectories.filter(Boolean).map((directory) => String(directory)))];

    for (const directory of directories) {
      let names;
      try {
        names = await readdir(directory);
      } catch {
        continue;
      }
      for (const fileName of names.filter(allowedLogFileName)) {
        const fullPath = join(directory, fileName);
        let fileStats;
        try {
          fileStats = await stat(fullPath);
        } catch {
          continue;
        }
        const ageDays = (Date.now() - fileStats.mtimeMs) / 86400000;
        if (ageDays > RETENTION_DAYS) continue;
        let content;
        try {
          content = await readFile(fullPath, "utf8");
        } catch {
          continue;
        }
        const lines = content.split(/\r?\n/u).filter((line) => line.trim()).slice(-normalizedLimit);
        for (let index = 0; index < lines.length; index += 1) {
          const rawLine = lines[index];
          const entryLevel = inferRealLogLevel(fileName, rawLine);
          const entrySource = /^pdv-vite(?:[._-].*)?\.log$/iu.test(fileName) ? "vite"
            : /^pdv-tauri(?:[._-].*)?\.log$/iu.test(fileName) ? "tauri"
              : /^pdv-cargo(?:[._-].*)?\.log$/iu.test(fileName) ? "cargo"
              : /^pdv-(?:mariadb|database)(?:[._-].*)?\.log$/iu.test(fileName) ? "database"
              : /^pdv-printer(?:[._-].*)?\.log$/iu.test(fileName) ? "printer"
              : /^pdv-node(?:[._-].*)?\.log$/iu.test(fileName) ? "api"
              : /\.wrapper\.log$/iu.test(fileName) ? "service"
            : /\.err\.log$/iu.test(fileName) || /^api-startup/iu.test(fileName) ? "api"
              : /\.out\.log$/iu.test(fileName) ? "api"
                : "system";
          if (normalizedSource && normalizedSource !== entrySource) continue;
          if (normalizedLevel && normalizedLevel !== entryLevel) continue;
          const fallback = fileStats.mtime.toISOString();
          const timestamp = parseRealLogTimestamp(rawLine, fallback);
          const message = cleanText(rawLine, 5000);
          if (!message) continue;
          entries.push({
            idTechnicalLog: `file:${basename(fileName)}:${fileStats.mtimeMs}:${index + 1}`,
            occurredAtTechnicalLog: timestamp,
            sourceTechnicalLog: entrySource,
            levelTechnicalLog: entryLevel,
            messageTechnicalLog: message,
            operationTechnicalLog: "real-log",
            durationMsTechnicalLog: null,
            statusCodeTechnicalLog: null,
            successTechnicalLog: entryLevel === "error" ? 0 : 1,
            logFileName: fileName,
            logLineNumber: index + 1,
            rawLogLine: message
          });
        }
      }
    }
    return entries
      .sort((left, right) => new Date(right.occurredAtTechnicalLog) - new Date(left.occurredAtTechnicalLog))
      .slice(0, normalizedLimit);
  };

  return { readEntries, allowedLogFileName };
};

export const mergeLogEntries = ({
  realEntries = [],
  technicalEntries = [],
  limit = 200,
  prioritizeReal = false
} = {}) => {
  const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
  const seen = new Set();
  const combined = [];
  const visibleTechnicalEntries = technicalEntries.filter((entry) => {
    const statusCode = Number(entry.statusCodeTechnicalLog);
    const isHttpOperation = String(entry.operationTechnicalLog || "").toLowerCase() === "http";
    if (entry.sourceTechnicalLog !== "api" || !isHttpOperation) return true;
    if (Number.isFinite(statusCode)) return statusCode >= 400;
    return Number(entry.successTechnicalLog) !== 1;
  });

  if (prioritizeReal) {
    for (const entry of [...realEntries].sort((left, right) =>
      new Date(right.occurredAtTechnicalLog) - new Date(left.occurredAtTechnicalLog))) {
      const id = String(entry.idTechnicalLog || "");
      if (seen.has(id) || combined.length >= normalizedLimit) continue;
      seen.add(id);
      combined.push(entry);
    }
    for (const entry of [...visibleTechnicalEntries].sort((left, right) =>
      new Date(right.occurredAtTechnicalLog) - new Date(left.occurredAtTechnicalLog))) {
      const id = String(entry.idTechnicalLog || "");
      if (seen.has(id) || combined.length >= normalizedLimit) continue;
      seen.add(id);
      combined.push(entry);
    }
    return combined.slice(0, normalizedLimit);
  } else {
    for (const entry of [...realEntries, ...visibleTechnicalEntries]) {
      const id = String(entry.idTechnicalLog || "");
      if (!seen.has(id)) {
        seen.add(id);
        combined.push(entry);
      }
    }
  }

  return combined
    .sort((left, right) => new Date(right.occurredAtTechnicalLog) - new Date(left.occurredAtTechnicalLog))
    .slice(0, normalizedLimit);
};

export const sanitizeTechnicalLog = (payload = {}) => ({
  source: allowedSources.has(String(payload.source || "").toLowerCase())
    ? String(payload.source).toLowerCase()
    : "system",
  level: allowedLevels.has(String(payload.level || "").toLowerCase())
    ? String(payload.level).toLowerCase()
    : "info",
  message: cleanText(payload.message, 500),
  operation: cleanText(payload.operation, 80),
  durationMs: Number.isFinite(Number(payload.durationMs))
    ? Math.max(0, Math.min(86400000, Math.round(Number(payload.durationMs))))
    : null,
  statusCode: Number.isInteger(Number(payload.statusCode))
    ? Math.max(100, Math.min(599, Number(payload.statusCode)))
    : null,
  success: payload.success === false ? 0 : 1
});

export const createTechnicalLogService = ({ pool }) => {
  const ensureRetention = async () => {
    await pool.query(
      "DELETE FROM technical_logs WHERE occurredAtTechnicalLog < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [RETENTION_DAYS]
    );
  };

  const record = async (payload) => {
    const entry = sanitizeTechnicalLog(payload);
    if (!entry.message) return null;
    await ensureRetention();
    const [result] = await pool.query(
      `INSERT INTO technical_logs
        (sourceTechnicalLog, levelTechnicalLog, messageTechnicalLog,
         operationTechnicalLog, durationMsTechnicalLog, statusCodeTechnicalLog,
         successTechnicalLog)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.source,
        entry.level,
        entry.message,
        entry.operation,
        entry.durationMs,
        entry.statusCode,
        entry.success
      ]
    );
    return result.insertId;
  };

  const list = async ({ source = "", level = "", limit = 200 } = {}) => {
    await ensureRetention();
    const normalizedLimit = Math.max(1, Math.min(1000, Number(limit) || 200));
    const clauses = [];
    const parameters = [];
    const normalizedSource = String(source).trim().toLowerCase();
    const normalizedLevel = String(level).trim().toLowerCase();
    if (normalizedSource && allowedSources.has(normalizedSource)) {
      clauses.push("sourceTechnicalLog = ?");
      parameters.push(normalizedSource);
    }
    if (normalizedLevel && allowedLevels.has(normalizedLevel)) {
      clauses.push("levelTechnicalLog = ?");
      parameters.push(normalizedLevel);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const [rows] = await pool.query(
      `SELECT idTechnicalLog, occurredAtTechnicalLog, sourceTechnicalLog,
              levelTechnicalLog, messageTechnicalLog, operationTechnicalLog,
              durationMsTechnicalLog, statusCodeTechnicalLog, successTechnicalLog
       FROM technical_logs
       ${where}
       ORDER BY occurredAtTechnicalLog DESC, idTechnicalLog DESC
       LIMIT ?`,
      [...parameters, normalizedLimit]
    );
    return rows;
  };

  return { record, list, ensureRetention, retentionDays: RETENTION_DAYS };
};
