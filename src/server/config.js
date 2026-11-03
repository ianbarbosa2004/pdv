import keytar from "keytar";

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
