import keytar from "keytar";
import { execFileSync } from "node:child_process";

const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function getConfig(env = process.env) {
  return {
    apiHost: env.PDV_API_HOST || "127.0.0.1",
    apiPort: positiveInteger(env.PDV_API_PORT, 3000),
    apiToken: String(env.PDV_API_TOKEN || "").trim(),
    apiAllowedOrigins: String(
      env.PDV_API_ALLOWED_ORIGINS
      || "http://localhost:5173,http://127.0.0.1:5173,tauri://localhost,http://tauri.localhost"
    ).split(",").map((origin) => origin.trim()).filter(Boolean),
    ncmSourceUrl: env.PDV_NCM_SOURCE_URL || "",
    cestSourceUrl: env.PDV_CEST_SOURCE_URL || "",
    backupDirectory: env.PDV_BACKUP_DIR || "",
    runtimeEnvironment: env.PDV_ENV || env.NODE_ENV || "development",
    database: {
      host: env.PDV_DB_HOST || "127.0.0.1",
      port: positiveInteger(env.PDV_DB_PORT, 3306),
      name: env.PDV_DB_NAME || "pdv",
      user: env.PDV_DB_USER || "pdv_app",
      password: env.PDV_DB_PASSWORD || ""
    },
    certificateEncryptionKey: env.PDV_CERTIFICATE_ENCRYPTION_KEY || ""
  };
}

const getCredentialAccount = (config, env) =>
  env.PDV_DB_CREDENTIAL_ACCOUNT
  || `${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}`;

export async function loadRuntimeConfig(env = process.env) {
  const config = getConfig(env);
  if (process.platform !== "win32") return config;
  const service = env.PDV_DB_CREDENTIAL_SERVICE || "pdv-mariadb";
  const account = getCredentialAccount(config, env);
  const storedPassword = await keytar.getPassword(service, account);
  if (storedPassword) {
    config.database.password = storedPassword;
  }
  return config;
}

const readHiddenInput = async (prompt) => {
  if (!process.stdin.isTTY || !process.stdout.isTTY || typeof process.stdin.setRawMode !== "function") {
    throw new Error("A senha do MariaDB não está disponível. Defina PDV_DB_PASSWORD ou execute o comando em um terminal interativo.");
  }
  process.stdout.write(prompt);
  process.stdin.setEncoding("utf8");
  process.stdin.resume();
  process.stdin.setRawMode(true);
  let value = "";
  const appendCharacters = (characters) => {
    for (const character of characters) {
      if (!character || character === "\r" || character === "\n" || character.charCodeAt(0) < 32) {
        continue;
      }
      value += character;
      process.stdout.write("*");
    }
  };
  const readClipboard = () => {
    if (process.platform !== "win32") return "";
    try {
      return execFileSync(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", "Get-Clipboard -Raw"],
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }
      ).replace(/[\r\n]+$/u, "");
    } catch {
      return "";
    }
  };
  await new Promise((resolve, reject) => {
    const onData = (chunk) => {
      for (const character of chunk) {
        if (character === "\u0003") {
          cleanup();
          reject(new Error("Leitura da senha cancelada."));
          return;
        }
        if (character === "\r" || character === "\n") {
          cleanup();
          process.stdout.write("\r\n");
          resolve();
          return;
        }
        if (character === "\u0016") {
          appendCharacters(readClipboard());
          continue;
        }
        if (character === "\u007f" || character === "\b") {
          value = value.slice(0, -1);
          process.stdout.write("\b \b");
          continue;
        }
        appendCharacters(character);
      }
    };
    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on("data", onData);
  });
  return value;
};

export async function loadMigrationConfig(env = process.env) {
  const config = await loadRuntimeConfig(env);
  if (config.database.password) return config;
  config.database.password = await readHiddenInput(
    `Senha do MariaDB para ${config.database.user}@${config.database.host}:${config.database.port}/${config.database.name}: `
  );
  if (!config.database.password) {
    throw new Error("A senha do MariaDB não pode ser vazia.");
  }
  return config;
}
