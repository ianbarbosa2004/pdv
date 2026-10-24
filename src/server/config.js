const positiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function getConfig(env = process.env) {
  return {
    apiHost: env.PDV_API_HOST || "127.0.0.1",
    apiPort: positiveInteger(env.PDV_API_PORT, 3000),
    database: {
      host: env.PDV_DB_HOST || "127.0.0.1",
      port: positiveInteger(env.PDV_DB_PORT, 3306),
      name: env.PDV_DB_NAME || "pdv",
      user: env.PDV_DB_USER || "pdv_app",
      password: env.PDV_DB_PASSWORD || ""
    }
  };
}
