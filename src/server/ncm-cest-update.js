const DEFAULT_NCM_SOURCE_URL =
  "https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json";
const DEFAULT_CEST_SOURCE_URL =
  "https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18";

const normalizeText = (value) =>
  String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const normalizeCode = (value, length) => {
  const code = String(value ?? "").replace(/\D/g, "");
  return code.length === length ? code : "";
};

const getField = (row, names) => {
  const entries = Object.entries(row || {});
  const normalizedNames = new Set(
    names.map((name) =>
      name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
    )
  );
  for (const name of normalizedNames) {
    const match = entries.find(([key]) =>
      key
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/gi, "")
          .toLowerCase() === name
    );
    if (match) return match[1];
  }
  return undefined;
};

const parseDelimited = (text) => {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const separator = lines[0].includes(";") ? ";" : lines[0].includes("\t") ? "\t" : ",";
  const headers = lines[0].split(separator).map((header) => normalizeText(header).replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(separator).map((value) => normalizeText(value).replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((header, index) => [header, values[index] || ""]));
  });
};

const parseHtmlRows = (text) => {
  const rows = [];
  for (const rowMatch of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...rowMatch[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => normalizeText(cell[1].replace(/<[^>]+>/g, "")));
    if (cells.length >= 3) rows.push(cells);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.toLowerCase());
  return rows.slice(1).map((cells) =>
    Object.fromEntries(headers.map((header, index) => [header, cells[index] || ""]))
  );
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const parseNcmPayload = (payload) => {
  const rows = Array.isArray(payload) ? payload : payload?.Nomenclaturas;
  if (!Array.isArray(rows)) throw new Error("A fonte NCM não retornou uma lista reconhecida.");
  const items = rows
    .map((row) => ({
      codeNcm: normalizeCode(row.Codigo ?? row.codigo ?? row.code, 8),
      descriptionNcm: normalizeText(row.Descricao ?? row.descricao ?? row.description)
    }))
    .filter((row) => row.codeNcm && row.descriptionNcm);
  if (!items.length) throw new Error("A fonte NCM não contém códigos fiscais de oito dígitos.");
  return [...new Map(items.map((item) => [item.codeNcm, item])).values()];
};

const parseCestRows = (rows) => {
  const items = [];
  const relations = [];
  for (const row of rows) {
    const codeCest = normalizeCode(
      getField(row, ["cest", "codecest", "codigo cest", "codigocest"]),
      7
    );
    const codeNcm = normalizeCode(
      getField(row, ["ncm", "codencm", "codigo ncm", "codigoncm", "ncmsh"]),
      8
    );
    const descriptionCest = normalizeText(
      getField(row, ["descricao", "descricaocest", "description", "item"])
    );
    const segmentCest = normalizeText(
      getField(row, ["segmento", "segment", "segmentocest"])
    );
    if (!codeCest || !descriptionCest) continue;
    items.push({ codeCest, descriptionCest, segmentCest: segmentCest || null });
    if (codeNcm) relations.push({ codeNcm, codeCest });
  }
  return {
    items: [...new Map(items.map((item) => [item.codeCest, item])).values()],
    relations
  };
};

const parseCestPayload = (text) => {
  const payload = parseJson(text);
  if (payload) {
    const rows = Array.isArray(payload)
      ? payload
      : payload.items || payload.data || payload.cests || payload.Cests;
    if (Array.isArray(rows)) return parseCestRows(rows);
  }

  const delimitedRows = parseDelimited(text);
  if (delimitedRows.length) return parseCestRows(delimitedRows);

  const htmlRows = parseHtmlRows(text);
  if (htmlRows.length) return parseCestRows(htmlRows);

  throw new Error(
    "A fonte CEST não está em JSON, CSV, TSV ou tabela HTML reconhecida."
  );
};

const fetchSource = async (url, label) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json,text/csv,text/html,*/*" },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`${label} respondeu HTTP ${response.status}.`);
    const text = await response.text();
    if (!text.trim()) throw new Error(`${label} respondeu um arquivo vazio.`);
    return text;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error(`Tempo excedido ao consultar a fonte ${label}.`);
    }
    throw new Error(`Não foi possível acessar a fonte oficial ${label}.`);
  } finally {
    clearTimeout(timeout);
  }
};

const ensureUpdateSchema = async (pool) => {
  await pool.query(`CREATE TABLE IF NOT EXISTS ncm_catalog (
    idNcm BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeNcm CHAR(8) NOT NULL,
    descriptionNcm TEXT NOT NULL,
    isActiveNcm TINYINT(1) NOT NULL DEFAULT 1,
    createdAtNcm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtNcm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idNcm),
    UNIQUE KEY uqNcmCode (codeNcm)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cest_catalog (
    idCest BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeCest CHAR(7) NOT NULL,
    descriptionCest TEXT NOT NULL,
    segmentCest VARCHAR(160) NULL,
    isActiveCest TINYINT(1) NOT NULL DEFAULT 1,
    createdAtCest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtCest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idCest),
    UNIQUE KEY uqCestCode (codeCest)
  ) ENGINE=InnoDB`);
  await pool.query("ALTER TABLE ncm_catalog MODIFY COLUMN descriptionNcm TEXT NOT NULL");
  await pool.query("ALTER TABLE cest_catalog MODIFY COLUMN descriptionCest TEXT NOT NULL");
  await pool.query(`CREATE TABLE IF NOT EXISTS ncm_cest_updates (
    idNcmCestUpdate BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    sourceNcmNcmCestUpdate VARCHAR(500) NOT NULL,
    sourceCestNcmCestUpdate VARCHAR(500) NOT NULL,
    statusNcmCestUpdate ENUM('running', 'completed', 'failed') NOT NULL,
    ncmCountNcmCestUpdate INT UNSIGNED NOT NULL DEFAULT 0,
    cestCountNcmCestUpdate INT UNSIGNED NOT NULL DEFAULT 0,
    relationCountNcmCestUpdate INT UNSIGNED NOT NULL DEFAULT 0,
    messageNcmCestUpdate VARCHAR(500) NULL,
    startedAtNcmCestUpdate TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completedAtNcmCestUpdate TIMESTAMP NULL,
    PRIMARY KEY (idNcmCestUpdate)
  ) ENGINE=InnoDB`);
};

const updateCatalog = async (pool, { ncmSourceUrl, cestSourceUrl }) => {
  await ensureUpdateSchema(pool);
  const [result] = await pool.query(
    `INSERT INTO ncm_cest_updates
      (sourceNcmNcmCestUpdate, sourceCestNcmCestUpdate, statusNcmCestUpdate)
     VALUES (?, ?, 'running')`,
    [ncmSourceUrl, cestSourceUrl]
  );
  const updateId = result.insertId;
  const connection = await pool.getConnection();
  try {
    const ncmPayload = parseNcmPayload(parseJson(await fetchSource(ncmSourceUrl, "NCM")));
    const cestPayload = parseCestPayload(await fetchSource(cestSourceUrl, "CEST"));
    const ncmCodes = new Set(ncmPayload.map((item) => item.codeNcm));
    const relations = cestPayload.relations.filter((relation) => ncmCodes.has(relation.codeNcm));
    if (!cestPayload.items.length) {
      throw new Error("A fonte CEST não contém itens válidos.");
    }
    if (!relations.length) {
      throw new Error("A fonte CEST não contém relações NCM reconhecíveis.");
    }

    await connection.beginTransaction();
    await connection.query("UPDATE ncm_catalog SET isActiveNcm = 0");
    await connection.query("UPDATE cest_catalog SET isActiveCest = 0");
    await connection.query("DELETE FROM ncm_cest_relations");

    for (const item of ncmPayload) {
      await connection.query(
        `INSERT INTO ncm_catalog (codeNcm, descriptionNcm, isActiveNcm)
         VALUES (?, ?, 1)
         ON DUPLICATE KEY UPDATE descriptionNcm = VALUES(descriptionNcm), isActiveNcm = 1`,
        [item.codeNcm, item.descriptionNcm]
      );
    }
    for (const item of cestPayload.items) {
      await connection.query(
        `INSERT INTO cest_catalog (codeCest, descriptionCest, segmentCest, isActiveCest)
         VALUES (?, ?, ?, 1)
         ON DUPLICATE KEY UPDATE
           descriptionCest = VALUES(descriptionCest),
           segmentCest = VALUES(segmentCest),
           isActiveCest = 1`,
        [item.codeCest, item.descriptionCest, item.segmentCest]
      );
    }
    for (const relation of relations) {
      await connection.query(
        `INSERT IGNORE INTO ncm_cest_relations (idNcm, idCest)
         SELECT ncm.idNcm, cest.idCest
         FROM ncm_catalog ncm, cest_catalog cest
         WHERE ncm.codeNcm = ? AND cest.codeCest = ?`,
        [relation.codeNcm, relation.codeCest]
      );
    }
    await connection.commit();
    await pool.query(
      `UPDATE ncm_cest_updates
       SET statusNcmCestUpdate = 'completed',
           ncmCountNcmCestUpdate = ?,
           cestCountNcmCestUpdate = ?,
           relationCountNcmCestUpdate = ?,
           messageNcmCestUpdate = ?,
           completedAtNcmCestUpdate = CURRENT_TIMESTAMP
       WHERE idNcmCestUpdate = ?`,
      [
        ncmPayload.length,
        cestPayload.items.length,
        relations.length,
        "Catálogos oficiais atualizados.",
        updateId
      ]
    );
    return {
      idNcmCestUpdate: updateId,
      ncmCount: ncmPayload.length,
      cestCount: cestPayload.items.length,
      relationCount: relations.length
    };
  } catch (error) {
    await connection.rollback();
    await pool.query(
      `UPDATE ncm_cest_updates
       SET statusNcmCestUpdate = 'failed',
           messageNcmCestUpdate = ?,
           completedAtNcmCestUpdate = CURRENT_TIMESTAMP
       WHERE idNcmCestUpdate = ?`,
      [String(error.message || "Falha ao atualizar catálogos.").slice(0, 500), updateId]
    );
    throw error;
  } finally {
    connection.release();
  }
};

export {
  DEFAULT_CEST_SOURCE_URL,
  DEFAULT_NCM_SOURCE_URL,
  ensureUpdateSchema,
  parseCestPayload,
  parseNcmPayload,
  updateCatalog
};
