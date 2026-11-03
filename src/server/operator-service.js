import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual
} from "node:crypto";

const PASSWORD_PREFIX = "scrypt";
const PASSWORD_COST = 16384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELIZATION = 1;
const PASSWORD_KEY_LENGTH = 64;

export const OPERATOR_ROLES = new Set(["operator", "supervisor", "admin"]);

export const normalizeOperatorUsername = (value) => {
  const username = String(value ?? "").trim().toLocaleLowerCase("pt-BR");
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) {
    throw new Error("Usuário do operador inválido.");
  }
  return username;
};

export const normalizeOperatorPassword = (value) => {
  const password = String(value ?? "");
  if (password.length < 8 || password.length > 200) {
    throw new Error("A senha do operador deve ter entre 8 e 200 caracteres.");
  }
  return password;
};

export const hashOperatorPassword = (password, salt = randomBytes(16)) => {
  const normalized = normalizeOperatorPassword(password);
  const derived = scryptSync(normalized, salt, PASSWORD_KEY_LENGTH, {
    N: PASSWORD_COST,
    r: PASSWORD_BLOCK_SIZE,
    p: PASSWORD_PARALLELIZATION
  });
  return [
    PASSWORD_PREFIX,
    PASSWORD_COST,
    PASSWORD_BLOCK_SIZE,
    PASSWORD_PARALLELIZATION,
    salt.toString("base64"),
    derived.toString("base64")
  ].join("$");
};

export const verifyOperatorPassword = (password, encoded) => {
  try {
    const [prefix, cost, blockSize, parallelization, saltValue, hashValue] =
      String(encoded).split("$");
    if (prefix !== PASSWORD_PREFIX || !saltValue || !hashValue) return false;
    const salt = Buffer.from(saltValue, "base64");
    const expected = Buffer.from(hashValue, "base64");
    const actual = scryptSync(normalizeOperatorPassword(password), salt, expected.length, {
      N: Number(cost),
      r: Number(blockSize),
      p: Number(parallelization)
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
};

export const createOperatorSessionToken = () => randomBytes(32).toString("base64url");

export const hashOperatorSessionToken = (token) =>
  createHash("sha256").update(String(token)).digest("hex");

export const sessionExpiration = (hours = 8) =>
  new Date(Date.now() + hours * 60 * 60 * 1000);

export const isOperatorRole = (role) => OPERATOR_ROLES.has(String(role));

