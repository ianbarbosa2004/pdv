import {
  DEFAULT_NAVIGATION,
  normalizeNavigationKey
} from "../shared/navigation-defaults.js";
import {
  DEFAULT_CEST_SOURCE_URL,
  DEFAULT_NCM_SOURCE_URL,
  ensureUpdateSchema
} from "./ncm-cest-update.js";

export const createSchemaManager = ({ pool, config }) => {
  const renumberFiscalCatalogIds = async (connection) => {
  const [items] = await connection.query(
    `SELECT idFiscalCatalogItem
     FROM fiscal_catalog_items
     ORDER BY idFiscalCatalogItem`
  );
  if (!items.length) return;

  const temporaryOffset = 1000000000000;
  for (const item of items) {
    await connection.query(
      `UPDATE fiscal_catalog_items
       SET idFiscalCatalogItem = ?
       WHERE idFiscalCatalogItem = ?`,
      [temporaryOffset + Number(item.idFiscalCatalogItem), item.idFiscalCatalogItem]
    );
  }
  for (const [index, item] of items.entries()) {
    await connection.query(
      `UPDATE fiscal_catalog_items
       SET idFiscalCatalogItem = ?
       WHERE idFiscalCatalogItem = ?`,
      [index + 1, temporaryOffset + Number(item.idFiscalCatalogItem)]
    );
  }
  await connection.query(
    `ALTER TABLE fiscal_catalog_items AUTO_INCREMENT = ?`,
    [items.length + 1]
  );
};

const ensureFiscalCatalogSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS fiscal_catalog_items (
    idFiscalCatalogItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    catalogFiscalCatalogItem VARCHAR(50) NOT NULL,
    codeFiscalCatalogItem VARCHAR(30) NOT NULL,
    descriptionFiscalCatalogItem VARCHAR(255) NOT NULL,
    valueFiscalCatalogItem DECIMAL(10,4) NULL,
    isActiveFiscalCatalogItem TINYINT(1) NOT NULL DEFAULT 1,
    createdAtFiscalCatalogItem TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtFiscalCatalogItem TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idFiscalCatalogItem),
    UNIQUE KEY uqFiscalCatalogItemsCatalogCode (catalogFiscalCatalogItem, codeFiscalCatalogItem),
    KEY idxFiscalCatalogItemsCatalogActive (catalogFiscalCatalogItem, isActiveFiscalCatalogItem, descriptionFiscalCatalogItem)
  ) ENGINE=InnoDB`);
  await pool.query(
    `INSERT INTO fiscal_catalog_items
      (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
     VALUES ('cfops', '5.101', 'VENDA DE PRODUÇÃO DO ESTABELECIMENTO', NULL)
     ON DUPLICATE KEY UPDATE
       descriptionFiscalCatalogItem = VALUES(descriptionFiscalCatalogItem),
       isActiveFiscalCatalogItem = 1`
  );
};

const ensurePrinterSettingsSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS printer_settings (
    idPrinterSetting TINYINT UNSIGNED NOT NULL,
    receiptPrinterName VARCHAR(255) NULL,
    reportsPrinterName VARCHAR(255) NULL,
    receiptLayoutPrinterSetting JSON NULL,
    updatedAtPrinterSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idPrinterSetting)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
   `SELECT COLUMN_NAME FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'printer_settings'`
  );
  if (!columns.some(({ COLUMN_NAME }) => COLUMN_NAME === "receiptLayoutPrinterSetting")) {
   await pool.query("ALTER TABLE printer_settings ADD COLUMN receiptLayoutPrinterSetting JSON NULL");
  }
};

const ensureGeneralSettingsSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS general_settings (
    idGeneralSetting BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    keyGeneralSetting VARCHAR(80) NOT NULL,
    labelGeneralSetting VARCHAR(160) NOT NULL,
    typeGeneralSetting ENUM('boolean', 'text', 'number', 'json') NOT NULL DEFAULT 'boolean',
    booleanValueGeneralSetting TINYINT(1) NOT NULL DEFAULT 0,
    valueGeneralSetting TEXT NULL,
    updatedAtGeneralSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idGeneralSetting),
    UNIQUE KEY uqGeneralSettingsKey (keyGeneralSetting)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME, COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'general_settings'`
  );
  const typeColumn = columns.find(({ COLUMN_NAME }) => COLUMN_NAME === "typeGeneralSetting");
  if (typeColumn && !String(typeColumn.COLUMN_TYPE).includes("'text'")) {
    await pool.query(
      "ALTER TABLE general_settings MODIFY COLUMN typeGeneralSetting ENUM('boolean', 'text', 'number', 'json') NOT NULL DEFAULT 'boolean'"
    );
  }
  if (!columns.some(({ COLUMN_NAME }) => COLUMN_NAME === "valueGeneralSetting")) {
    await pool.query("ALTER TABLE general_settings ADD COLUMN valueGeneralSetting TEXT NULL");
  }
  await pool.query(
   `UPDATE general_settings
    SET labelGeneralSetting = 'Permitir estoque negativo'
    WHERE keyGeneralSetting = 'allowNegativeStock'`
  );
  await pool.query(
    `INSERT INTO general_settings
      (keyGeneralSetting, labelGeneralSetting, typeGeneralSetting, valueGeneralSetting)
     VALUES
      ('allowNegativeStock', 'Permitir estoque negativo', 'boolean', NULL),
      ('ncmSourceUrl', 'Fonte de NCM', 'text', ?),
      ('cestSourceUrl', 'Fonte de CEST', 'text', ?)
     ON DUPLICATE KEY UPDATE
       labelGeneralSetting = VALUES(labelGeneralSetting),
       typeGeneralSetting = VALUES(typeGeneralSetting)`,
    [config.ncmSourceUrl || DEFAULT_NCM_SOURCE_URL, config.cestSourceUrl || DEFAULT_CEST_SOURCE_URL]
  );
};

const loadGeneralSourceSettings = async () => {
  const [rows] = await pool.query(
    `SELECT keyGeneralSetting, valueGeneralSetting
     FROM general_settings
     WHERE keyGeneralSetting IN ('ncmSourceUrl', 'cestSourceUrl')`
  );
  for (const row of rows) {
    const value = String(row.valueGeneralSetting || "").trim();
    if (!value) continue;
    if (row.keyGeneralSetting === "ncmSourceUrl") config.ncmSourceUrl = value;
    if (row.keyGeneralSetting === "cestSourceUrl") config.cestSourceUrl = value;
  }
};

const ensureCustomerConsumerSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS customers (
    idCustomer BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nameCustomer VARCHAR(180) NOT NULL,
    documentCustomer VARCHAR(20) NULL,
    phoneCustomer VARCHAR(25) NOT NULL DEFAULT '',
    emailCustomer VARCHAR(180) NOT NULL DEFAULT '',
    addressCustomer VARCHAR(180) NOT NULL DEFAULT '',
    creditLimitCustomer DECIMAL(12,2) NOT NULL DEFAULT 0,
    notesCustomer VARCHAR(400) NULL,
    isActiveCustomer TINYINT(1) NOT NULL DEFAULT 1,
    createdAtCustomer TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtCustomer TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idCustomer),
    UNIQUE KEY uqCustomersDocument (documentCustomer)
  ) ENGINE=InnoDB`);
  const [customerDocumentColumns] = await pool.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
       AND COLUMN_NAME = 'documentCustomer'`
  );
  if (customerDocumentColumns[0]?.IS_NULLABLE !== "YES") {
    await pool.query("UPDATE customers SET documentCustomer = NULL WHERE documentCustomer = ''");
    await pool.query("ALTER TABLE customers MODIFY COLUMN documentCustomer VARCHAR(20) NULL");
  }
  await pool.query(`CREATE TABLE IF NOT EXISTS consumers (
    idConsumer BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idCustomer BIGINT UNSIGNED NULL,
    nameConsumer VARCHAR(180) NOT NULL,
    nicknameConsumer VARCHAR(120) NOT NULL DEFAULT '',
    phoneConsumer VARCHAR(25) NOT NULL DEFAULT '',
    notesConsumer VARCHAR(400) NULL,
    isActiveConsumer TINYINT(1) NOT NULL DEFAULT 1,
    createdAtConsumer TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtConsumer TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idConsumer),
    UNIQUE KEY uqConsumersCustomer (idCustomer),
    KEY idxConsumersStatus (isActiveConsumer),
    CONSTRAINT fkConsumersCustomer FOREIGN KEY (idCustomer) REFERENCES customers (idCustomer) ON DELETE SET NULL
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS customer_vouchers (
    idCustomerVoucher BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idCustomer BIGINT UNSIGNED NOT NULL,
    idSale BIGINT UNSIGNED NULL,
    amountCustomerVoucher DECIMAL(12,2) NOT NULL,
    dueDateCustomerVoucher DATE NULL,
    statusCustomerVoucher ENUM('open', 'paid', 'cancelled') NOT NULL DEFAULT 'open',
    createdAtCustomerVoucher TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idCustomerVoucher),
    KEY idxCustomerVouchersCustomer (idCustomer, statusCustomerVoucher),
    CONSTRAINT fkCustomerVouchersCustomer FOREIGN KEY (idCustomer) REFERENCES customers (idCustomer) ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
};

const migrateCustomerConsumerSchema = async () => {
  const [paymentTermColumns] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers'
       AND COLUMN_NAME = 'paymentTermCustomer'`
  );
  if (paymentTermColumns.length) {
    await pool.query("ALTER TABLE customers DROP COLUMN paymentTermCustomer");
  }
};

const getGeneralSettingBoolean = async (key) => {
  await ensureGeneralSettingsSchema();
  const [rows] = await pool.query(
    `SELECT booleanValueGeneralSetting
     FROM general_settings
     WHERE keyGeneralSetting = ?
     LIMIT 1`,
    [key]
  );
  return Boolean(rows[0]?.booleanValueGeneralSetting);
};

const ensureCompanySchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS company_settings (
    idCompanySetting TINYINT UNSIGNED NOT NULL,
    companyTypeCompany ENUM('juridica', 'fisica') NOT NULL DEFAULT 'juridica',
    documentCompany VARCHAR(20) NOT NULL DEFAULT '',
    corporateNameCompany VARCHAR(180) NOT NULL DEFAULT '',
    tradeNameCompany VARCHAR(120) NOT NULL DEFAULT '',
    stateRegistrationCompany VARCHAR(30) NOT NULL DEFAULT '',
    municipalRegistrationCompany VARCHAR(30) NOT NULL DEFAULT '',
    cnaeCompany VARCHAR(20) NOT NULL DEFAULT '',
    zipCodeCompany VARCHAR(9) NOT NULL DEFAULT '',
    addressCompany VARCHAR(180) NOT NULL DEFAULT '',
    addressNumberCompany VARCHAR(20) NOT NULL DEFAULT '',
    addressComplementCompany VARCHAR(80) NOT NULL DEFAULT '',
    neighborhoodCompany VARCHAR(100) NOT NULL DEFAULT '',
    countryCompany VARCHAR(80) NOT NULL DEFAULT 'Brasil',
    stateCompany CHAR(2) NOT NULL DEFAULT '',
    cityCompany VARCHAR(100) NOT NULL DEFAULT '',
    municipalityCodeCompany CHAR(7) NOT NULL DEFAULT '3148004',
    phoneCompany VARCHAR(25) NOT NULL DEFAULT '',
    mobileCompany VARCHAR(25) NOT NULL DEFAULT '',
    websiteCompany VARCHAR(180) NOT NULL DEFAULT '',
    emailCompany VARCHAR(180) NOT NULL DEFAULT '',
    nfceStateCompany CHAR(2) NOT NULL DEFAULT 'MG',
    nfceModelCompany SMALLINT UNSIGNED NOT NULL DEFAULT 65,
    nfceEnvironmentCompany ENUM('homologation', 'production') NOT NULL DEFAULT 'homologation',
    nfceSeriesCompany SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    nfceInitialNumberCompany INT UNSIGNED NOT NULL DEFAULT 1,
    nfceNextNumberCompany INT UNSIGNED NOT NULL DEFAULT 1,
    nfceContingencyCompany ENUM('none', 'offline') NOT NULL DEFAULT 'none',
    nfceCscCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceTokenCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceHomologationCscCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceHomologationTokenCompany VARCHAR(255) NOT NULL DEFAULT '',
    nfceCertificateTypeCompany ENUM('A1') NOT NULL DEFAULT 'A1',
    nfceCertificateExpiresCompany DATE NULL,
    nfceCertificateSerialCompany VARCHAR(255) NOT NULL DEFAULT '',
    logoMimeCompany VARCHAR(50) NOT NULL DEFAULT '',
    logoDataCompany MEDIUMTEXT NULL,
    projectIconMimeCompany VARCHAR(50) NOT NULL DEFAULT '',
    projectIconDataCompany MEDIUMTEXT NULL,
    createdAtCompanySetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtCompanySetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idCompanySetting)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'company_settings'
       AND COLUMN_NAME IN (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
    [config.database.name, "nfceStateCompany", "nfceModelCompany", "nfceEnvironmentCompany",
      "nfceNextNumberCompany", "nfceContingencyCompany", "nfceCertificateTypeCompany",
      "nfceCertificateExpiresCompany", "nfceCertificateSerialCompany", "nfceCertificateNameCompany",
      "nfceCertificateDataCompany", "nfceCertificatePasswordCompany", "logoMimeCompany", "logoDataCompany",
      "projectIconMimeCompany", "projectIconDataCompany", "municipalityCodeCompany"]
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  const missingColumns = [
    ["nfceStateCompany", "ALTER TABLE company_settings ADD COLUMN nfceStateCompany CHAR(2) NOT NULL DEFAULT 'MG'"],
    ["nfceModelCompany", "ALTER TABLE company_settings ADD COLUMN nfceModelCompany SMALLINT UNSIGNED NOT NULL DEFAULT 65"],
    ["nfceEnvironmentCompany", "ALTER TABLE company_settings ADD COLUMN nfceEnvironmentCompany ENUM('homologation', 'production') NOT NULL DEFAULT 'homologation'"],
    ["nfceNextNumberCompany", "ALTER TABLE company_settings ADD COLUMN nfceNextNumberCompany INT UNSIGNED NOT NULL DEFAULT 1 AFTER nfceInitialNumberCompany"],
    ["nfceContingencyCompany", "ALTER TABLE company_settings ADD COLUMN nfceContingencyCompany ENUM('none', 'offline') NOT NULL DEFAULT 'none'"],
    ["nfceCertificateTypeCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateTypeCompany ENUM('A1') NOT NULL DEFAULT 'A1'"],
    ["nfceCertificateExpiresCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateExpiresCompany DATE NULL"],
    ["nfceCertificateNameCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateNameCompany VARCHAR(255) NOT NULL DEFAULT ''"],
    ["nfceCertificateDataCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificateDataCompany MEDIUMTEXT NULL"],
    ["nfceCertificatePasswordCompany", "ALTER TABLE company_settings ADD COLUMN nfceCertificatePasswordCompany MEDIUMTEXT NULL"],
    ["municipalityCodeCompany", "ALTER TABLE company_settings ADD COLUMN municipalityCodeCompany CHAR(7) NOT NULL DEFAULT '3148004'"]
  ];
  for (const [name, statement] of missingColumns) {
    if (!existing.has(name)) await pool.query(statement);
  }
  await pool.query(
    `UPDATE company_settings
     SET nfceNextNumberCompany = nfceInitialNumberCompany
     WHERE nfceNextNumberCompany < nfceInitialNumberCompany`
  );
  await pool.query(
    `INSERT INTO company_settings (idCompanySetting)
     SELECT 1
     WHERE NOT EXISTS (SELECT 1 FROM company_settings LIMIT 1)`
  );
  if (!existing.has("logoMimeCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN logoMimeCompany VARCHAR(50) NOT NULL DEFAULT '' AFTER nfceCertificateSerialCompany"
    );
  }
  if (!existing.has("logoDataCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN logoDataCompany MEDIUMTEXT NULL AFTER logoMimeCompany"
    );
  }
  if (!existing.has("projectIconMimeCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN projectIconMimeCompany VARCHAR(50) NOT NULL DEFAULT '' AFTER logoDataCompany"
    );
  }
  if (!existing.has("projectIconDataCompany")) {
    await pool.query(
      "ALTER TABLE company_settings ADD COLUMN projectIconDataCompany MEDIUMTEXT NULL AFTER projectIconMimeCompany"
    );
  }
};

const ensureSaleFiscalSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS sale_fiscal_documents (
    idSaleFiscalDocument BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idSale BIGINT UNSIGNED NOT NULL,
    modelSaleFiscalDocument SMALLINT UNSIGNED NOT NULL DEFAULT 65,
    environmentSaleFiscalDocument ENUM('homologation', 'production') NOT NULL,
    seriesSaleFiscalDocument SMALLINT UNSIGNED NOT NULL,
    numberSaleFiscalDocument INT UNSIGNED NOT NULL,
    statusSaleFiscalDocument ENUM('pending', 'authorized', 'rejected', 'unknown') NOT NULL DEFAULT 'pending',
    accessKeySaleFiscalDocument CHAR(44) NULL,
    protocolSaleFiscalDocument VARCHAR(80) NULL,
    cStatSaleFiscalDocument VARCHAR(10) NULL,
    messageSaleFiscalDocument VARCHAR(500) NULL,
    xmlSaleFiscalDocument MEDIUMTEXT NULL,
    attemptsSaleFiscalDocument SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    lastAttemptAtSaleFiscalDocument DATETIME NULL,
    createdAtSaleFiscalDocument TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtSaleFiscalDocument TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idSaleFiscalDocument),
    UNIQUE KEY uqSaleFiscalDocumentSale (idSale),
    UNIQUE KEY uqSaleFiscalDocumentNumber (environmentSaleFiscalDocument, seriesSaleFiscalDocument, numberSaleFiscalDocument),
    KEY idxSaleFiscalDocumentStatus (statusSaleFiscalDocument, updatedAtSaleFiscalDocument),
    CONSTRAINT fkSaleFiscalDocumentSale
      FOREIGN KEY (idSale) REFERENCES sales (idSale)
      ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
};

const ensureFiscalOperationSchema = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'fiscal_operations'
       AND COLUMN_NAME IN (?, ?)`,
    [
      config.database.name,
      "fcpUseReductionBaseFiscalOperation",
      "fcpStUseReductionBaseFiscalOperation"
    ]
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existing.has("fcpUseReductionBaseFiscalOperation")) {
    await pool.query(
      `ALTER TABLE fiscal_operations
       ADD COLUMN fcpUseReductionBaseFiscalOperation TINYINT(1) NOT NULL DEFAULT 0
       AFTER fcpEnabledFiscalOperation`
    );
  }
  if (!existing.has("fcpStUseReductionBaseFiscalOperation")) {
    await pool.query(
      `ALTER TABLE fiscal_operations
       ADD COLUMN fcpStUseReductionBaseFiscalOperation TINYINT(1) NOT NULL DEFAULT 0
       AFTER fcpStEnabledFiscalOperation`
    );
  }
};

const ensureNcmCestSchema = async () => {
  await ensureUpdateSchema(pool);
};

const ensureProductFiscalSchema = async () => {
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products'
       AND COLUMN_NAME IN (?, ?)`,
    [config.database.name, "ncmProduct", "cestProduct"]
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existing.has("ncmProduct")) {
    await pool.query("ALTER TABLE products ADD COLUMN ncmProduct CHAR(8) NULL AFTER nameProduct");
  }
  if (!existing.has("cestProduct")) {
    await pool.query("ALTER TABLE products ADD COLUMN cestProduct CHAR(7) NULL AFTER ncmProduct");
  }
};

const ensureProductCatalogSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS product_types (
    idProductType BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeSpedProductType VARCHAR(30) NULL,
    descriptionProductType VARCHAR(120) NOT NULL,
    isActiveProductType TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idProductType),
    UNIQUE KEY uqProductTypesDescription (descriptionProductType)
  ) ENGINE=InnoDB`);
  const [productTypeColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'product_types'`
  );
  if (!productTypeColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "codeSpedProductType")) {
    await pool.query(
      "ALTER TABLE product_types ADD COLUMN codeSpedProductType VARCHAR(30) NULL AFTER idProductType"
    );
  }
  await pool.query(
    `INSERT INTO product_types (descriptionProductType, isActiveProductType)
     VALUES ('Produto Acabado', 1)
     ON DUPLICATE KEY UPDATE isActiveProductType = 1`
  );
  await pool.query(`CREATE TABLE IF NOT EXISTS units (
    idUnit BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codeUnit CHAR(6) NOT NULL,
    descriptionUnit VARCHAR(80) NOT NULL,
    isActiveUnit TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idUnit),
    UNIQUE KEY uqUnitsCode (codeUnit)
  ) ENGINE=InnoDB`);
  await ensureProductFiscalSchema();
  await ensureFiscalOperationSchema();
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existing.has("pdvCodeProduct")) {
    if (existing.has("barcodeProduct")) {
      await pool.query("ALTER TABLE products CHANGE COLUMN barcodeProduct pdvCodeProduct VARCHAR(64) NULL");
    } else {
      await pool.query("ALTER TABLE products ADD COLUMN pdvCodeProduct VARCHAR(64) NULL AFTER skuProduct");
    }
  }
  if (!existing.has("printsPlace") && existing.has("printsKitchenProduct")) {
    await pool.query(
      "ALTER TABLE products ADD COLUMN printsPlace VARCHAR(20) NOT NULL DEFAULT 'NÃO IMPRIMIR' AFTER isFractionalProduct"
    );
    await pool.query(
      "UPDATE products SET printsPlace = CASE WHEN printsKitchenProduct = 1 THEN 'COZINHA' ELSE 'NÃO IMPRIMIR' END"
    );
    await pool.query("ALTER TABLE products DROP COLUMN printsKitchenProduct");
    existing.delete("printsKitchenProduct");
    existing.add("printsPlace");
  } else if (existing.has("printsPlace") && existing.has("printsKitchenProduct")) {
    await pool.query("ALTER TABLE products DROP COLUMN printsKitchenProduct");
    existing.delete("printsKitchenProduct");
  }
  const additions = [
    ["idFiscalOperationSaleProduct", "ALTER TABLE products ADD COLUMN idFiscalOperationSaleProduct BIGINT UNSIGNED NULL AFTER nameProduct"],
    ["idProductTypeProduct", "ALTER TABLE products ADD COLUMN idProductTypeProduct BIGINT UNSIGNED NULL AFTER idFiscalOperationSaleProduct"],
    ["idPhysicalStateProduct", "ALTER TABLE products ADD COLUMN idPhysicalStateProduct INT NULL DEFAULT NULL AFTER idProductTypeProduct"],
    ["idUnitProduct", "ALTER TABLE products ADD COLUMN idUnitProduct BIGINT UNSIGNED NULL AFTER idProductTypeProduct"],
    ["controlsStockProduct", "ALTER TABLE products ADD COLUMN controlsStockProduct TINYINT(1) NOT NULL DEFAULT 1 AFTER stockQuantityProduct"],
    ["isFractionalProduct", "ALTER TABLE products ADD COLUMN isFractionalProduct TINYINT(1) NOT NULL DEFAULT 0 AFTER controlsStockProduct"],
    ["printsPlace", "ALTER TABLE products ADD COLUMN printsPlace VARCHAR(20) NOT NULL DEFAULT 'NÃO IMPRIMIR' AFTER isFractionalProduct"],
    ["showsInPdvProduct", "ALTER TABLE products ADD COLUMN showsInPdvProduct TINYINT(1) NOT NULL DEFAULT 1 AFTER printsPlace"],
    ["costPriceProduct", "ALTER TABLE products ADD COLUMN costPriceProduct DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER priceProduct"]
  ];
  for (const [name, statement] of additions) {
    if (!existing.has(name)) await pool.query(statement);
  }
  await pool.query(
    `UPDATE products
     LEFT JOIN product_types ON product_types.idProductType = products.idProductTypeProduct
     SET products.printsPlace = 'NÃO IMPRIMIR'
     WHERE products.printsPlace IS NULL
        OR product_types.idProductType IS NULL
        OR UPPER(product_types.descriptionProductType) NOT IN ('MERCADORIA PARA REVENDA', 'PRODUTO ACABADO', 'PRODUTOS ACABADOS')`
  );
  const [classColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'classes'`
  );
  if (!classColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "idFiscalOperationClass")) {
    await pool.query("ALTER TABLE classes ADD COLUMN idFiscalOperationClass BIGINT UNSIGNED NULL AFTER descriptionClass");
  }
  const [groupColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'groups'`
  );
  if (!groupColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "showsInPdvGroup")) {
    await pool.query("ALTER TABLE `groups` ADD COLUMN showsInPdvGroup TINYINT(1) NOT NULL DEFAULT 0 AFTER idClass");
  }
};

let culinarySchemaPromise = null;

const ensureCulinarySchema = () => culinarySchemaPromise ??= (async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS culinary_units (
    idCulinaryUnit INT AUTO_INCREMENT PRIMARY KEY,
    codeCulinaryUnit VARCHAR(20) NOT NULL UNIQUE,
    nameCulinaryUnit VARCHAR(50) NOT NULL,
    baseUnitCulinaryUnit ENUM('g', 'ml', 'un') NOT NULL,
    categoryCulinaryUnit ENUM('weight', 'volume', 'unit') NOT NULL,
    descriptionCulinaryUnit VARCHAR(100) NULL,
    isActiveCulinaryUnit TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS physical_states (
    idPhysicalState INT AUTO_INCREMENT PRIMARY KEY,
    codePhysicalState VARCHAR(30) NOT NULL UNIQUE,
    namePhysicalState VARCHAR(50) NOT NULL,
    descriptionPhysicalState VARCHAR(150) NULL,
    isActivePhysicalState TINYINT(1) NOT NULL DEFAULT 1
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  await pool.query(`CREATE TABLE IF NOT EXISTS culinary_unit_conversions (
    idCulinaryUnitConversion INT AUTO_INCREMENT PRIMARY KEY,
    idFromCulinaryUnitConversion INT NOT NULL,
    idToCulinaryUnitConversion INT NOT NULL,
    idPhysicalStateCulinaryUnitConversion INT NOT NULL,
    factorCulinaryUnitConversion DECIMAL(10, 4) NOT NULL,
    notesCulinaryUnitConversion VARCHAR(150) NULL,
    UNIQUE KEY uqCulinaryUnitConversions (idFromCulinaryUnitConversion, idToCulinaryUnitConversion, idPhysicalStateCulinaryUnitConversion),
    FOREIGN KEY (idFromCulinaryUnitConversion) REFERENCES culinary_units(idCulinaryUnit) ON DELETE CASCADE,
    FOREIGN KEY (idToCulinaryUnitConversion) REFERENCES culinary_units(idCulinaryUnit) ON DELETE CASCADE,
    FOREIGN KEY (idPhysicalStateCulinaryUnitConversion) REFERENCES physical_states(idPhysicalState) ON DELETE RESTRICT
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  for (const [table, column] of [
    ["culinary_units", "isActiveCulinaryUnit"],
    ["physical_states", "isActivePhysicalState"]
  ]) {
    const [columns] = await pool.query(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
      [table, column]
    );
    if (!columns.length) {
      await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${column} TINYINT(1) NOT NULL DEFAULT 1`);
    }
  }
  const culinaryUnits = [
    ["g", "Grama", "g", "weight", "Massa/Peso base em gramas"],
    ["ml", "Mililitro", "ml", "volume", "Volume base em mililitros"],
    ["un", "Unidade", "un", "unit", "Contagem unitária"],
    ["kg", "Quilograma", "g", "weight", "Massa equivalente a 1.000 gramas"],
    ["l", "Litro", "ml", "volume", "Volume equivalente a 1.000 mililitros"],
    ["gota", "Gota", "ml", "volume", "Gotas (extratos, adoçantes, bitters)"],
    ["pitada", "Pitada (Pinch)", "g", "weight", "Pitada de condimentos sólidos/pós"],
    ["colher_cafe", "Colher de Café", "ml", "volume", "Colher de café padrão (~2,5ml)"],
    ["colher_cha", "Colher de Chá", "ml", "volume", "Colher de chá padrão (~5ml)"],
    ["colher_sobremesa", "Colher de Sobremesa", "ml", "volume", "Colher de sobremesa padrão (~10ml)"],
    ["colher_sopa", "Colher de Sopa", "ml", "volume", "Colher de sopa padrão (~15ml)"],
    ["dose_jigger", "Dose / Jigger", "ml", "volume", "Dose padrão de bar (50ml)"],
    ["xicara_cha", "Xícara de Chá", "ml", "volume", "Xícara de chá padrão (~240ml)"],
    ["duzia", "Dúzia", "un", "unit", "Quantidade equivalente a 12 unidades"]
  ];
  for (const [code, name, baseUnit, category, description] of culinaryUnits) {
    await pool.query(
      `INSERT INTO culinary_units
        (codeCulinaryUnit, nameCulinaryUnit, baseUnitCulinaryUnit, categoryCulinaryUnit, descriptionCulinaryUnit)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nameCulinaryUnit = VALUES(nameCulinaryUnit),
         baseUnitCulinaryUnit = VALUES(baseUnitCulinaryUnit),
         categoryCulinaryUnit = VALUES(categoryCulinaryUnit),
         descriptionCulinaryUnit = VALUES(descriptionCulinaryUnit)`,
      [code, name, baseUnit, category, description]
    );
  }
  const physicalStates = [
    ["liquid_light", "Líquido Fluído / Leve", "Água, sucos, destilados, azeite, vinagre"],
    ["liquid_viscous", "Líquido Viscoso / Denso", "Leite condensado, mel, xaropes densos, melaço"],
    ["powder_light", "Pó Fino / Leve", "Farinha de trigo, fermento, cacau em pó, amido de milho"],
    ["powder_heavy", "Granulado / Pó Pesado", "Açúcar refinado, sal, café moído, grãos crus"],
    ["pasty", "Pastoso / Emulsão", "Maionese, requeijão, manteiga, ketchup, catupiry"],
    ["solid_chopped", "Sólido Picado / Cubos", "Bacon picado, alho picado, ervas e legumes em cubos"],
    ["solid_whole", "Sólido Inteiro / Peça", "Ovos, frutas, legumes e peças inteiras"],
    ["solid_sliced", "Sólido Fatiado", "Frutas, legumes, carnes e queijos fatiados"],
    ["solid_grated", "Sólido Ralado / Triturado", "Queijos, coco, alho e outros ingredientes ralados ou triturados"],
    ["frozen", "Congelado", "Polpas, legumes e outros alimentos mantidos congelados"]
  ];
  for (const [code, name, description] of physicalStates) {
    await pool.query(
      `INSERT INTO physical_states (codePhysicalState, namePhysicalState, descriptionPhysicalState)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         namePhysicalState = VALUES(namePhysicalState),
         descriptionPhysicalState = VALUES(descriptionPhysicalState)`,
      [code, name, description]
    );
  }
  await pool.query(
    `INSERT INTO culinary_unit_conversions
      (idFromCulinaryUnitConversion, idToCulinaryUnitConversion,
       idPhysicalStateCulinaryUnitConversion, factorCulinaryUnitConversion,
       notesCulinaryUnitConversion)
     SELECT unit.idCulinaryUnit, unit.idCulinaryUnit, state.idPhysicalState, 1.0000, 'Unidade base'
     FROM culinary_units unit
     CROSS JOIN physical_states state
     WHERE unit.codeCulinaryUnit IN ('g', 'ml', 'un')
     ON DUPLICATE KEY UPDATE
       factorCulinaryUnitConversion = VALUES(factorCulinaryUnitConversion),
       notesCulinaryUnitConversion = VALUES(notesCulinaryUnitConversion)`
  );
  const approximateConversions = [
    ["solid_whole", "Referência aproximada para sólidos inteiros fracionados"],
    ["solid_sliced", "Referência aproximada para sólidos fatiados"],
    ["solid_grated", "Referência aproximada para sólidos ralados ou triturados"],
    ["frozen", "Referência aproximada para alimentos congelados"]
  ];
  for (const [stateCode, notes] of approximateConversions) {
    await pool.query(
      `INSERT INTO culinary_unit_conversions
        (idFromCulinaryUnitConversion, idToCulinaryUnitConversion,
         idPhysicalStateCulinaryUnitConversion, factorCulinaryUnitConversion,
         notesCulinaryUnitConversion)
       SELECT source.idCulinaryUnit, target.idCulinaryUnit, state.idPhysicalState, factors.factor, ?
       FROM culinary_units source
       INNER JOIN culinary_units target ON target.codeCulinaryUnit = 'g'
       INNER JOIN physical_states state ON state.codePhysicalState = ?
       INNER JOIN (
         SELECT 'colher_sopa' AS codeCulinaryUnit, 10.0000 AS factor
         UNION ALL
         SELECT 'xicara_cha', 115.0000
       ) factors ON factors.codeCulinaryUnit = source.codeCulinaryUnit
       ON DUPLICATE KEY UPDATE
         factorCulinaryUnitConversion = VALUES(factorCulinaryUnitConversion),
         notesCulinaryUnitConversion = VALUES(notesCulinaryUnitConversion)`,
      [notes, stateCode]
    );
  }
  const standardConversions = [
    ["gota", "ml", "liquid_light", 0.05, "Adoçante, corante, amargo/bitters"],
    ["colher_cha", "ml", "liquid_light", 5, "Essências, suco de limão concentrado"],
    ["colher_sopa", "ml", "liquid_light", 15, "Azeite, molho de soja, vinagre, xaropes"],
    ["dose_jigger", "ml", "liquid_light", 50, "Destilados (Cachaça, Gin, Rum, Vodka)"],
    ["xicara_cha", "ml", "liquid_light", 240, "Água, leite, sucos, caldos fluídos"],
    ["colher_cha", "g", "liquid_viscous", 7, "Mel, melaço, glicose"],
    ["colher_sopa", "g", "liquid_viscous", 20, "Leite condensado, mel, cobertura de chocolate"],
    ["xicara_cha", "g", "liquid_viscous", 300, "Leite condensado, doce de leite concentrado"],
    ["pitada", "g", "powder_light", 0.5, "Pimenta, canela em pó, noz-moscada"],
    ["colher_cha", "g", "powder_light", 3, "Fermento em pó, bicarbonato, cacau"],
    ["colher_sopa", "g", "powder_light", 10, "Farinha de trigo, leite em pó, amido de milho"],
    ["xicara_cha", "g", "powder_light", 120, "Farinha de trigo peneirada, cacau em pó"],
    ["pitada", "g", "powder_heavy", 0.5, "Sal refinado"],
    ["colher_cha", "g", "powder_heavy", 5, "Sal refinado, açúcar refinado"],
    ["colher_sopa", "g", "powder_heavy", 15, "Açúcar refinado, sal grosso, café moído"],
    ["xicara_cha", "g", "powder_heavy", 190, "Açúcar refinado, arroz cru, feijão cru"],
    ["colher_cha", "g", "pasty", 5, "Manteiga, margarina, mostarda, ketchup"],
    ["colher_sopa", "g", "pasty", 16, "Requeijão, maionese, catupiry, cream cheese"],
    ["xicara_cha", "g", "pasty", 230, "Maionese base, requeijão cremoso"],
    ["colher_sopa", "g", "solid_chopped", 10, "Cheiro-verde picado, alho picado/triturado"],
    ["xicara_cha", "g", "solid_chopped", 115, "Bacon picado, alho picado, ervas e legumes em cubos"],
    ["kg", "g", "liquid_light", 1000, "Conversão universal de massa"],
    ["kg", "g", "liquid_viscous", 1000, "Conversão universal de massa"],
    ["kg", "g", "powder_light", 1000, "Conversão universal de massa"],
    ["kg", "g", "powder_heavy", 1000, "Conversão universal de massa"],
    ["kg", "g", "pasty", 1000, "Conversão universal de massa"],
    ["kg", "g", "solid_chopped", 1000, "Conversão universal de massa"],
    ["kg", "g", "solid_whole", 1000, "Conversão universal de massa"],
    ["kg", "g", "solid_sliced", 1000, "Conversão universal de massa"],
    ["kg", "g", "solid_grated", 1000, "Conversão universal de massa"],
    ["kg", "g", "frozen", 1000, "Conversão universal de massa"],
    ["l", "ml", "liquid_light", 1000, "Conversão universal de volume"],
    ["l", "ml", "liquid_viscous", 1000, "Conversão universal de volume"],
    ["colher_cafe", "ml", "liquid_light", 2.5, "Medida culinária volumétrica aproximada"],
    ["colher_sobremesa", "ml", "liquid_light", 10, "Medida culinária volumétrica aproximada"],
    ["duzia", "un", "solid_whole", 12, "Conversão de contagem"]
  ];
  for (const [fromCode, toCode, stateCode, factor, notes] of standardConversions) {
    await pool.query(
      `INSERT INTO culinary_unit_conversions
        (idFromCulinaryUnitConversion, idToCulinaryUnitConversion,
         idPhysicalStateCulinaryUnitConversion, factorCulinaryUnitConversion,
         notesCulinaryUnitConversion)
       SELECT source.idCulinaryUnit, target.idCulinaryUnit, state.idPhysicalState, ?, ?
       FROM culinary_units source
       INNER JOIN culinary_units target ON target.codeCulinaryUnit = ?
       INNER JOIN physical_states state ON state.codePhysicalState = ?
       WHERE source.codeCulinaryUnit = ?
       ON DUPLICATE KEY UPDATE
         factorCulinaryUnitConversion = VALUES(factorCulinaryUnitConversion),
         notesCulinaryUnitConversion = VALUES(notesCulinaryUnitConversion)`,
      [factor, notes, toCode, stateCode, fromCode]
    );
  }
})().catch((error) => {
  culinarySchemaPromise = null;
  throw error;
});

const prepareNavigationSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS navigation_menus (
    idNavigationMenu SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    keyNavigationMenu VARCHAR(80) NOT NULL,
    labelNavigationMenu VARCHAR(120) NOT NULL,
    orderNavigationMenu SMALLINT UNSIGNED NOT NULL,
    isActiveNavigationMenu TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idNavigationMenu),
    UNIQUE KEY uqNavigationMenusKey (keyNavigationMenu)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS navigation_items (
    idNavigationItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idNavigationMenu SMALLINT UNSIGNED NOT NULL,
    idParentNavigationItem BIGINT UNSIGNED NULL,
    typeNavigationItem ENUM('item', 'submenu', 'bar', 'divider') NOT NULL,
    keyNavigationItem VARCHAR(80) NOT NULL,
    labelNavigationItem VARCHAR(120) NOT NULL,
    routeNavigationItem VARCHAR(120) NULL,
    descriptionNavigationItem VARCHAR(240) NULL,
    orderNavigationItem SMALLINT UNSIGNED NOT NULL,
    isActiveNavigationItem TINYINT(1) NOT NULL DEFAULT 1,
    showsInBackofficeHomeNavigationItem TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (idNavigationItem),
    UNIQUE KEY uqNavigationItemsMenuParentKey (idNavigationMenu, idParentNavigationItem, keyNavigationItem),
    KEY idxNavigationItemsMenuParentOrder (idNavigationMenu, idParentNavigationItem, orderNavigationItem),
    CONSTRAINT fkNavigationItemsMenu FOREIGN KEY (idNavigationMenu) REFERENCES navigation_menus (idNavigationMenu) ON DELETE CASCADE,
    CONSTRAINT fkNavigationItemsParent FOREIGN KEY (idParentNavigationItem) REFERENCES navigation_items (idNavigationItem) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  const [navigationItemColumns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'navigation_items'`
  );
  const [navigationType] = await pool.query(
    `SELECT COLUMN_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'navigation_items'
       AND COLUMN_NAME = 'typeNavigationItem'`
  );
  if (navigationType[0] && !String(navigationType[0].COLUMN_TYPE).includes("'divider'")) {
    await pool.query(
      "ALTER TABLE navigation_items MODIFY COLUMN typeNavigationItem ENUM('item', 'submenu', 'bar', 'divider') NOT NULL"
    );
  }
  if (!navigationItemColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "showsInBackofficeHomeNavigationItem")) {
    await pool.query(
      "ALTER TABLE navigation_items ADD COLUMN showsInBackofficeHomeNavigationItem TINYINT(1) NOT NULL DEFAULT 0 AFTER isActiveNavigationItem"
    );
    await pool.query(
      `UPDATE navigation_items
       SET showsInBackofficeHomeNavigationItem = 1
       WHERE (typeNavigationItem = 'bar' AND keyNavigationItem IN ('classes', 'groups'))
          OR (idParentNavigationItem IS NULL AND keyNavigationItem IN ('products', 'fiscal-operations', 'financial', 'thermal-print', 'settings'))`
    );
  }
  if (!navigationItemColumns.some(({ COLUMN_NAME }) => COLUMN_NAME === "descriptionNavigationItem")) {
    await pool.query(
      "ALTER TABLE navigation_items ADD COLUMN descriptionNavigationItem VARCHAR(240) NULL AFTER routeNavigationItem"
    );
  }
  return;

  // Navigation data is bootstrapped by synchronizeNavigationDefaults below.
  // Existing rows must not be normalized during API startup.
  const defaultToolMenuKey = normalizeNavigationKey("tools");
  const defaultCatalogMenuKey = normalizeNavigationKey("cadastros");

  let [toolsMenus] = await pool.query(
    `SELECT idNavigationMenu
     FROM navigation_menus
     WHERE LOWER(keyNavigationMenu) = ?
        OR LOWER(labelNavigationMenu) = 'ferramentas'
     LIMIT 1`,
    [defaultToolMenuKey]
  );
  if (!toolsMenus[0]) {
    const [lastMenuOrder] = await pool.query(
      "SELECT COALESCE(MAX(orderNavigationMenu), 0) AS lastOrder FROM navigation_menus"
    );
    const [insertedToolsMenu] = await pool.query(
      `INSERT INTO navigation_menus
        (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu, isActiveNavigationMenu)
       VALUES (?, 'Ferramentas', ?, 1)`,
      [defaultToolMenuKey, Number(lastMenuOrder[0]?.lastOrder || 0) + 1]
    );
    toolsMenus = [{ idNavigationMenu: insertedToolsMenu.insertId }];
  }
  if (toolsMenus[0]) {
    await pool.query(
      `DELETE FROM navigation_items
       WHERE idNavigationMenu = ?
         AND idParentNavigationItem IS NULL
         AND (
           LOWER(keyNavigationItem) = 'navigation-builder'
           OR LOWER(routeNavigationItem) = 'navigation-builder'
           OR LOWER(labelNavigationItem) IN ('construtor de menu', 'construtor de navegação')
         )`,
      [toolsMenus[0].idNavigationMenu]
    );

    const [apiStatusItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND (keyNavigationItem = 'api-status'
              OR routeNavigationItem = 'api-status'
              OR labelNavigationItem = 'Status da API')
       LIMIT 1`,
      [toolsMenus[0].idNavigationMenu]
    );
    if (apiStatusItems[0]) {
      await pool.query(
        `UPDATE navigation_items
         SET idParentNavigationItem = NULL,
             typeNavigationItem = 'item',
             keyNavigationItem = 'api-status',
             labelNavigationItem = 'Status da API',
             routeNavigationItem = 'api-status',
             descriptionNavigationItem = COALESCE(descriptionNavigationItem, 'Consulte a disponibilidade da API e do MariaDB.'),
             isActiveNavigationItem = 1,
             showsInBackofficeHomeNavigationItem = 0
         WHERE idNavigationItem = ?`,
        [apiStatusItems[0].idNavigationItem]
      );
    } else {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
        [toolsMenus[0].idNavigationMenu]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', 'api-status', 'Status da API', 'api-status',
                 'Consulte a disponibilidade da API e do MariaDB.',
                 ?, 1, 0)`,
        [toolsMenus[0].idNavigationMenu, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }

    const [nfceQueryItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND keyNavigationItem = 'nfce-query'
       LIMIT 1`,
      [toolsMenus[0].idNavigationMenu]
    );
    if (!nfceQueryItems[0]) {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
        [toolsMenus[0].idNavigationMenu]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', 'nfce-query', 'Consulta de NFC-e', 'nfce-query',
                 'Consulte uma NFC-e no portal oficial e prepare itens para compras.',
                 ?, 1, 0)`,
        [toolsMenus[0].idNavigationMenu, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }
    const [importItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND keyNavigationItem = 'import-catalogs'
       LIMIT 1`,
      [toolsMenus[0].idNavigationMenu]
    );
    if (!importItems[0]) {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
        [toolsMenus[0].idNavigationMenu]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', 'import-catalogs', 'Importar cadastros', 'import-catalogs',
                 'Importe produtos em lote usando um arquivo CSV.',
                 ?, 1, 0)`,
        [toolsMenus[0].idNavigationMenu, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }
    const [backupItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND keyNavigationItem = 'backup'
       LIMIT 1`,
      [toolsMenus[0].idNavigationMenu]
    );
    if (!backupItems[0]) {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
        [toolsMenus[0].idNavigationMenu]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', 'backup', 'Backup e restauração', 'backup',
                 'Crie e restaure backups compactados do banco de dados.',
                 ?, 1, 0)`,
        [toolsMenus[0].idNavigationMenu, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }
  }

  const [catalogMenus] = await pool.query(
    `SELECT idNavigationMenu, keyNavigationMenu
     FROM navigation_menus
     WHERE LOWER(keyNavigationMenu) IN ('cadastros', 'registrations')
        OR LOWER(labelNavigationMenu) = 'cadastros'
     ORDER BY CASE
       WHEN LOWER(keyNavigationMenu) = 'registrations' THEN 0
       WHEN LOWER(keyNavigationMenu) = 'cadastros' THEN 1
       WHEN LOWER(labelNavigationMenu) = 'cadastros' THEN 2
       ELSE 3
     END, idNavigationMenu
    `
  );

  let catalogMenuId = catalogMenus[0]?.idNavigationMenu;
  if (!catalogMenuId) {
    const [lastMenuOrder] = await pool.query(
      `SELECT COALESCE(MAX(orderNavigationMenu), 0) AS lastOrder
       FROM navigation_menus`
    );
    const [insertedMenu] = await pool.query(
      `INSERT INTO navigation_menus
        (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu, isActiveNavigationMenu)
       VALUES (?, 'Cadastros', ?, 1)`,
      [defaultCatalogMenuKey, Number(lastMenuOrder[0]?.lastOrder || 0) + 1]
    );
    catalogMenuId = insertedMenu.insertId;
  }
  const duplicateCatalogMenus = catalogMenus
    .map(({ idNavigationMenu }) => Number(idNavigationMenu))
    .filter((idNavigationMenu) => idNavigationMenu !== Number(catalogMenuId));
  for (const duplicateMenuId of duplicateCatalogMenus) {
    const [duplicateItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ?
       ORDER BY idNavigationItem`,
      [duplicateMenuId]
    );
    for (const { idNavigationItem } of duplicateItems) {
      await pool.query(
        `UPDATE navigation_items
         SET idNavigationMenu = ?
         WHERE idNavigationItem = ?`,
        [catalogMenuId, idNavigationItem]
      );
    }
    await pool.query(
      "DELETE FROM navigation_menus WHERE idNavigationMenu = ?",
      [duplicateMenuId]
    );
  }
  await pool.query(
    `DELETE child
     FROM navigation_items child
     INNER JOIN navigation_items parent
       ON parent.idNavigationItem = child.idParentNavigationItem
      AND parent.idNavigationMenu = child.idNavigationMenu
     WHERE child.keyNavigationItem = parent.keyNavigationItem
       AND child.routeNavigationItem = parent.keyNavigationItem`
  );
  await pool.query(
    `UPDATE navigation_menus
     SET keyNavigationMenu = ?, labelNavigationMenu = 'Cadastros'
     WHERE idNavigationMenu = ?`,
    [defaultCatalogMenuKey, catalogMenuId]
  );

  const [productNavigationParents] = await pool.query(
    `SELECT idNavigationItem
     FROM navigation_items
     WHERE idNavigationMenu = ?
       AND idParentNavigationItem IS NULL
       AND (keyNavigationItem = 'products' OR labelNavigationItem = 'Produtos')
     ORDER BY idNavigationItem
     LIMIT 1`,
    [catalogMenuId]
  );
  if (productNavigationParents[0]) {
    const productParentId = productNavigationParents[0].idNavigationItem;
    await pool.query(
      `UPDATE navigation_items
       SET typeNavigationItem = 'item',
           keyNavigationItem = 'products',
           labelNavigationItem = 'Produtos',
           routeNavigationItem = NULL
       WHERE idNavigationItem = ?`,
      [productParentId]
    );
    const [finishedGoodsItems] = await pool.query(
      `SELECT idNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ?
         AND idParentNavigationItem = ?
         AND (keyNavigationItem = 'finished-goods'
              OR routeNavigationItem IN ('finished-goods', 'products')
              OR labelNavigationItem = 'Mercadoria para Revenda')
       ORDER BY CASE
         WHEN keyNavigationItem = 'finished-goods' THEN 0
         WHEN labelNavigationItem = 'Mercadoria para Revenda' THEN 1
         WHEN routeNavigationItem = 'finished-goods' THEN 2
         ELSE 3
       END, idNavigationItem
       LIMIT 1`,
      [catalogMenuId, productParentId]
    );
    if (finishedGoodsItems[0]) {
      await pool.query(
        `UPDATE navigation_items
         SET typeNavigationItem = 'bar',
             keyNavigationItem = 'finished-goods',
             labelNavigationItem = 'Mercadoria para Revenda',
             routeNavigationItem = 'finished-goods',
             isActiveNavigationItem = 1
         WHERE idNavigationItem = ?`,
        [finishedGoodsItems[0].idNavigationItem]
      );
    } else {
      const [lastOrder] = await pool.query(
        `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
         FROM navigation_items
         WHERE idNavigationMenu = ? AND idParentNavigationItem = ?`,
        [catalogMenuId, productParentId]
      );
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, ?, 'bar', 'finished-goods', 'Mercadoria para Revenda',
                 'finished-goods', NULL, ?, 1, 0)`,
        [catalogMenuId, productParentId, Number(lastOrder[0]?.lastOrder || 0) + 1]
      );
    }

    const [finishedProductItems] = await pool.query(
      `SELECT idNavigationItem, orderNavigationItem, isActiveNavigationItem
       FROM navigation_items
       WHERE idNavigationMenu = ?
         AND idParentNavigationItem = ?
         AND (keyNavigationItem = 'finished-products'
              OR routeNavigationItem = 'finished-products'
              OR labelNavigationItem = 'Produtos Acabados')
       ORDER BY idNavigationItem
       LIMIT 1`,
      [catalogMenuId, productParentId]
    );
    const finishedProduct = finishedProductItems[0];
    if (finishedProduct) {
      await pool.query(
        `UPDATE navigation_items
         SET typeNavigationItem = 'bar',
             keyNavigationItem = 'finished-products',
             labelNavigationItem = 'Produtos Acabados',
             routeNavigationItem = 'finished-products',
             isActiveNavigationItem = 1
         WHERE idNavigationItem = ?`,
        [finishedProduct.idNavigationItem]
      );
    } else {
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
           keyNavigationItem, labelNavigationItem, routeNavigationItem,
           descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
           showsInBackofficeHomeNavigationItem)
         VALUES (?, ?, 'bar', 'finished-products', 'Produtos Acabados',
                 'finished-products', NULL, 2, 1, 0)`,
        [catalogMenuId, productParentId]
      );
    }

  }

  const [supplierItems] = await pool.query(
    `SELECT idNavigationItem
     FROM navigation_items
     WHERE idNavigationMenu = ?
       AND idParentNavigationItem IS NULL
       AND (keyNavigationItem = 'suppliers'
            OR routeNavigationItem = 'suppliers'
            OR labelNavigationItem = 'Fornecedores')
     ORDER BY idNavigationItem
     LIMIT 1`,
    [catalogMenuId]
  );
  if (supplierItems[0]) {
    await pool.query(
      `UPDATE navigation_items
       SET idNavigationMenu = ?,
           idParentNavigationItem = NULL,
           typeNavigationItem = 'item',
           keyNavigationItem = 'suppliers',
           labelNavigationItem = 'Fornecedores',
           routeNavigationItem = 'suppliers',
           descriptionNavigationItem = COALESCE(descriptionNavigationItem, 'Cadastre e mantenha os fornecedores da loja.'),
           isActiveNavigationItem = 1
       WHERE idNavigationItem = ?`,
      [catalogMenuId, supplierItems[0].idNavigationItem]
    );
  } else {
    const [lastOrder] = await pool.query(
      `SELECT COALESCE(MAX(orderNavigationItem), 0) AS lastOrder
       FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL`,
      [catalogMenuId]
    );
    await pool.query(
      `INSERT INTO navigation_items
        (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
         keyNavigationItem, labelNavigationItem, routeNavigationItem,
         descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
         showsInBackofficeHomeNavigationItem)
       VALUES (?, NULL, 'item', 'suppliers', 'Fornecedores', 'suppliers',
               'Cadastre e mantenha os fornecedores da loja.', ?, 1, 0)`,
      [catalogMenuId, Number(lastOrder[0]?.lastOrder || 0) + 1]
    );
  }

  for (const [key, label, description, order] of [
    ["customers", "Clientes", "Cadastre clientes e acompanhe seus vales.", 20],
    ["consumers", "Consumidores", "Identifique consumidores e consulte seu histórico de consumo.", 21]
  ]) {
    const [existingItems] = await pool.query(
      `SELECT idNavigationItem FROM navigation_items
       WHERE idNavigationMenu = ? AND idParentNavigationItem IS NULL
         AND (keyNavigationItem = ? OR routeNavigationItem = ? OR labelNavigationItem = ?)
       LIMIT 1`,
      [catalogMenuId, key, key, label]
    );
    if (existingItems[0]) {
      await pool.query(
        `UPDATE navigation_items SET idNavigationMenu = ?, idParentNavigationItem = NULL,
          typeNavigationItem = 'item', keyNavigationItem = ?, labelNavigationItem = ?,
          routeNavigationItem = ?, descriptionNavigationItem = COALESCE(descriptionNavigationItem, ?), isActiveNavigationItem = 1,
          orderNavigationItem = ? WHERE idNavigationItem = ?`,
        [catalogMenuId, key, label, key, description, order, existingItems[0].idNavigationItem]
      );
    } else {
      await pool.query(
        `INSERT INTO navigation_items
          (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem,
           labelNavigationItem, routeNavigationItem, descriptionNavigationItem,
           orderNavigationItem, isActiveNavigationItem, showsInBackofficeHomeNavigationItem)
         VALUES (?, NULL, 'item', ?, ?, ?, ?, ?, 1, 0)`,
        [catalogMenuId, key, label, key, description, order]
      );
    }
  }

  const [menuIdColumns] = await pool.query(
    `SELECT DATA_TYPE
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'navigation_menus'
       AND COLUMN_NAME = 'idNavigationMenu'`
  );
  if (menuIdColumns[0]?.DATA_TYPE === "tinyint") {
    await pool.query("ALTER TABLE navigation_items DROP FOREIGN KEY fkNavigationItemsMenu");
    await pool.query("ALTER TABLE navigation_menus MODIFY COLUMN idNavigationMenu SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT");
    await pool.query("ALTER TABLE navigation_items MODIFY COLUMN idNavigationMenu SMALLINT UNSIGNED NOT NULL");
    await pool.query(
      `ALTER TABLE navigation_items
       ADD CONSTRAINT fkNavigationItemsMenu
       FOREIGN KEY (idNavigationMenu) REFERENCES navigation_menus (idNavigationMenu) ON DELETE CASCADE`
    );
  }
  return;
};

const synchronizeNavigationDefaults = async () => {
  const [storedMenus] = await pool.query(
    `SELECT idNavigationMenu, keyNavigationMenu, labelNavigationMenu
     FROM navigation_menus`
  );
  const menuIds = new Map();
  for (const definition of DEFAULT_NAVIGATION.menus) {
    const stored = storedMenus.find((entry) =>
      normalizeNavigationKey(entry.keyNavigationMenu) === definition.keyNavigationMenu
      || normalizeNavigationKey(entry.labelNavigationMenu) === normalizeNavigationKey(definition.labelNavigationMenu)
    );
    if (stored) {
      if (definition.keyNavigationMenu === "sales" || definition.keyNavigationMenu === "exit") {
        await pool.query(
          `UPDATE navigation_menus
           SET keyNavigationMenu = ?, labelNavigationMenu = ?,
               orderNavigationMenu = ?, isActiveNavigationMenu = 1
           WHERE idNavigationMenu = ?`,
          [
            definition.keyNavigationMenu,
            definition.labelNavigationMenu,
            definition.orderNavigationMenu,
            stored.idNavigationMenu
          ]
        );
      }
      menuIds.set(definition.keyNavigationMenu, stored.idNavigationMenu);
      continue;
    }
    const [result] = await pool.query(
      `INSERT INTO navigation_menus
        (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu, isActiveNavigationMenu)
       VALUES (?, ?, ?, 1)`,
      [definition.keyNavigationMenu, definition.labelNavigationMenu, definition.orderNavigationMenu]
    );
    menuIds.set(definition.keyNavigationMenu, result.insertId);
  }

  const [storedItems] = await pool.query(
    `SELECT idNavigationItem, idNavigationMenu, idParentNavigationItem, keyNavigationItem,
            labelNavigationItem, routeNavigationItem
     FROM navigation_items`
  );
  const itemIds = new Map();
  const itemMenus = new Map();
  for (const definition of DEFAULT_NAVIGATION.items) {
    const menuId = menuIds.get(definition.menuKey);
    const defaultParentId = definition.parentKey
      ? itemIds.get(`${definition.menuKey}:${definition.parentKey}`)
      : null;
    const parentId = defaultParentId;
    const parentMenuId = definition.parentKey
      ? itemMenus.get(`${definition.menuKey}:${definition.parentKey}`)
      : null;
    const insertionMenuId = parentMenuId || menuId;
    const sameStructure = (entry) =>
      String(entry.idNavigationMenu) === String(insertionMenuId)
      && String(entry.idParentNavigationItem || "") === String(parentId || "");
    const canonicalStored = storedItems.find((entry) =>
      sameStructure(entry)
      && normalizeNavigationKey(entry.keyNavigationItem) === definition.keyNavigationItem
    ) || storedItems.find((entry) =>
      normalizeNavigationKey(entry.keyNavigationItem) === definition.keyNavigationItem
    );
    const stored = canonicalStored || storedItems.find((entry) =>
      String(entry.idNavigationMenu) === String(menuId)
      && String(entry.idParentNavigationItem || "") === String(parentId || "")
      && (
        normalizeNavigationKey(entry.labelNavigationItem) === normalizeNavigationKey(definition.labelNavigationItem)
        || (definition.routeNavigationItem
          && normalizeNavigationKey(entry.routeNavigationItem) === definition.routeNavigationItem)
      )
    );
    if (stored) {
      if (canonicalStored) {
        await pool.query(
          `UPDATE navigation_items
           SET descriptionNavigationItem = COALESCE(descriptionNavigationItem, ?)
           WHERE idNavigationItem = ?`,
          [definition.descriptionNavigationItem, stored.idNavigationItem]
        );
      } else {
        await pool.query(
          `UPDATE navigation_items
           SET idNavigationMenu = ?, idParentNavigationItem = ?, typeNavigationItem = ?,
               keyNavigationItem = ?, routeNavigationItem = ?,
               descriptionNavigationItem = COALESCE(descriptionNavigationItem, ?)
           WHERE idNavigationItem = ?`,
          [
            menuId,
            parentId || null,
            definition.typeNavigationItem,
            definition.keyNavigationItem,
            definition.routeNavigationItem,
            definition.descriptionNavigationItem,
            stored.idNavigationItem
          ]
        );
      }
      itemIds.set(`${definition.menuKey}:${definition.keyNavigationItem}`, stored.idNavigationItem);
      itemMenus.set(
        `${definition.menuKey}:${definition.keyNavigationItem}`,
        stored.idNavigationMenu
      );
      continue;
    }
    const [result] = await pool.query(
      `INSERT INTO navigation_items
        (idNavigationMenu, idParentNavigationItem, typeNavigationItem,
         keyNavigationItem, labelNavigationItem, routeNavigationItem,
         descriptionNavigationItem, orderNavigationItem, isActiveNavigationItem,
         showsInBackofficeHomeNavigationItem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)`,
      [
        insertionMenuId,
        parentId || null,
        definition.typeNavigationItem,
        definition.keyNavigationItem,
        definition.labelNavigationItem,
        definition.routeNavigationItem,
        definition.descriptionNavigationItem,
        definition.orderNavigationItem
      ]
    );
    itemIds.set(`${definition.menuKey}:${definition.keyNavigationItem}`, result.insertId);
    itemMenus.set(`${definition.menuKey}:${definition.keyNavigationItem}`, insertionMenuId);
  }
};

const ensureNavigationSchema = (() => {
  let preparation;
  return () => {
    if (!preparation) {
      preparation = prepareNavigationSchema()
        .then(synchronizeNavigationDefaults)
        .catch((error) => {
        preparation = null;
        throw error;
      });
    }
    return preparation;
  };
})();

const ensureUppercaseTextData = async () => {
  const updates = [
    ["classes", ["descriptionClass"]],
    ["groups", ["descriptionGroup"]],
    ["products", ["nameProduct"]],
    ["product_types", ["descriptionProductType"]],
    ["units", ["descriptionUnit"]],
    ["ncm_catalog", ["descriptionNcm"]],
    ["cest_catalog", ["descriptionCest", "segmentCest"]],
    ["payment_methods", ["namePaymentMethod"]],
    ["suppliers", [
      "companyNameSupplier", "tradeNameSupplier", "contactNameSupplier", "addressSupplier",
      "addressComplementSupplier", "neighborhoodSupplier", "citySupplier", "countrySupplier",
      "notesSupplier"
    ]],
    ["customers", ["nameCustomer", "addressCustomer", "notesCustomer"]],
    ["consumers", ["nameConsumer", "nicknameConsumer", "notesConsumer"]],
    ["fiscal_operations", ["descriptionFiscalOperation", "operationNatureFiscalOperation", "legalBasisFiscalOperation"]],
    ["fiscal_catalog_items", ["descriptionFiscalCatalogItem"]],
    ["sale_items", ["productNameSaleItem"]]
  ];
  for (const [table, columns] of updates) {
    for (const column of columns) {
      await pool.query(`UPDATE \`${table}\` SET \`${column}\` = UPPER(\`${column}\`) WHERE \`${column}\` IS NOT NULL`);
    }
  }
};

const ensurePaymentMethodSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS payment_methods (
    idPaymentMethod BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    namePaymentMethod VARCHAR(80) NOT NULL,
    cashFlowAccountPaymentMethod ENUM('Banco', 'Caixa') NOT NULL DEFAULT 'Caixa',
    termDaysPaymentMethod SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    discountValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0,
    discountTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
    surchargeValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0,
    surchargeTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent',
    isActivePaymentMethod TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idPaymentMethod),
    UNIQUE KEY uqPaymentMethodsNamePaymentMethod (namePaymentMethod)
  ) ENGINE=InnoDB`);
  const [columns] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'payment_methods'`
  );
  const existing = new Set(columns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  const additions = [
    ["cashFlowAccountPaymentMethod", "ALTER TABLE payment_methods ADD COLUMN cashFlowAccountPaymentMethod ENUM('Banco', 'Caixa') NOT NULL DEFAULT 'Caixa' AFTER namePaymentMethod"],
    ["termDaysPaymentMethod", "ALTER TABLE payment_methods ADD COLUMN termDaysPaymentMethod SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER cashFlowAccountPaymentMethod"],
    ["discountValuePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN discountValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER termDaysPaymentMethod"],
    ["discountTypePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN discountTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent' AFTER discountValuePaymentMethod"],
    ["surchargeValuePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN surchargeValuePaymentMethod DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER discountTypePaymentMethod"],
    ["surchargeTypePaymentMethod", "ALTER TABLE payment_methods ADD COLUMN surchargeTypePaymentMethod ENUM('percent', 'fixed') NOT NULL DEFAULT 'percent' AFTER surchargeValuePaymentMethod"]
  ];
  for (const [column, statement] of additions) {
    if (!existing.has(column)) await pool.query(statement);
  }
  await pool.query(
    `INSERT INTO payment_methods
      (namePaymentMethod, cashFlowAccountPaymentMethod, termDaysPaymentMethod, isActivePaymentMethod)
     VALUES ('Vale', 'Caixa', 30, 1)
     ON DUPLICATE KEY UPDATE isActivePaymentMethod = 1`
  );
};

const ensureSupplierSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS suppliers (
    idSupplier BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    typeSupplier ENUM('juridica', 'fisica') NOT NULL DEFAULT 'juridica',
    documentSupplier VARCHAR(20) NOT NULL,
    companyNameSupplier VARCHAR(180) NOT NULL DEFAULT '',
    tradeNameSupplier VARCHAR(120) NOT NULL DEFAULT '',
    contactNameSupplier VARCHAR(120) NOT NULL DEFAULT '',
    phoneSupplier VARCHAR(25) NOT NULL DEFAULT '',
    emailSupplier VARCHAR(180) NOT NULL DEFAULT '',
    zipCodeSupplier VARCHAR(9) NOT NULL DEFAULT '',
    addressSupplier VARCHAR(180) NOT NULL DEFAULT '',
    addressNumberSupplier VARCHAR(20) NOT NULL DEFAULT '',
    addressComplementSupplier VARCHAR(80) NOT NULL DEFAULT '',
    neighborhoodSupplier VARCHAR(100) NOT NULL DEFAULT '',
    citySupplier VARCHAR(100) NOT NULL DEFAULT '',
    stateSupplier CHAR(2) NOT NULL DEFAULT '',
    countrySupplier VARCHAR(80) NOT NULL DEFAULT 'Brasil',
    notesSupplier VARCHAR(400) NULL,
    isActiveSupplier TINYINT(1) NOT NULL DEFAULT 1,
    createdAtSupplier TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtSupplier TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idSupplier),
    UNIQUE KEY uqSuppliersDocumentType (documentSupplier, typeSupplier),
    KEY idxSuppliersTypeStatus (typeSupplier, isActiveSupplier)
  ) ENGINE=InnoDB`);
};

const ensureOperatorCashSchema = async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS operators (
    idOperator BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usernameOperator VARCHAR(80) NOT NULL,
    displayNameOperator VARCHAR(160) NOT NULL,
    passwordHashOperator VARCHAR(255) NOT NULL,
    roleOperator ENUM('operator', 'supervisor', 'admin') NOT NULL DEFAULT 'operator',
    isActiveOperator TINYINT(1) NOT NULL DEFAULT 1,
    createdAtOperator TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAtOperator TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (idOperator),
    UNIQUE KEY uqOperatorsUsername (usernameOperator),
    KEY idxOperatorsActiveRole (isActiveOperator, roleOperator)
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS operator_sessions (
    idOperatorSession BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idOperator BIGINT UNSIGNED NOT NULL,
    tokenHashOperatorSession CHAR(64) NOT NULL,
    expiresAtOperatorSession DATETIME NOT NULL,
    createdAtOperatorSession TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idOperatorSession),
    UNIQUE KEY uqOperatorSessionsTokenHash (tokenHashOperatorSession),
    KEY idxOperatorSessionsExpiry (expiresAtOperatorSession),
    CONSTRAINT fkOperatorSessionsOperator
      FOREIGN KEY (idOperator) REFERENCES operators (idOperator)
      ON DELETE CASCADE
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cash_registers (
    idCashRegister TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nameCashRegister VARCHAR(80) NOT NULL,
    isActiveCashRegister TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (idCashRegister),
    UNIQUE KEY uqCashRegistersName (nameCashRegister)
  ) ENGINE=InnoDB`);
  await pool.query(
    `INSERT INTO cash_registers (nameCashRegister, isActiveCashRegister)
     VALUES ('Caixa principal', 1)
     ON DUPLICATE KEY UPDATE isActiveCashRegister = 1`
  );
  await pool.query(`CREATE TABLE IF NOT EXISTS cash_sessions (
    idCashSession BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idCashRegister TINYINT UNSIGNED NOT NULL,
    idOperatorOpened BIGINT UNSIGNED NOT NULL,
    openingAmountCashSession DECIMAL(12,2) NOT NULL,
    expectedClosingAmountCashSession DECIMAL(12,2) NOT NULL,
    closingAmountCashSession DECIMAL(12,2) NULL,
    differenceCashSession DECIMAL(12,2) NULL,
    closingJustificationCashSession VARCHAR(500) NULL,
    statusCashSession ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    openedAtCashSession TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closedAtCashSession TIMESTAMP NULL,
    idOperatorClosed BIGINT UNSIGNED NULL,
    PRIMARY KEY (idCashSession),
    KEY idxCashSessionsRegisterStatus (idCashRegister, statusCashSession),
    CONSTRAINT fkCashSessionsRegister
      FOREIGN KEY (idCashRegister) REFERENCES cash_registers (idCashRegister)
      ON DELETE RESTRICT,
    CONSTRAINT fkCashSessionsOpenedOperator
      FOREIGN KEY (idOperatorOpened) REFERENCES operators (idOperator)
      ON DELETE RESTRICT,
    CONSTRAINT fkCashSessionsClosedOperator
      FOREIGN KEY (idOperatorClosed) REFERENCES operators (idOperator)
      ON DELETE RESTRICT
  ) ENGINE=InnoDB`);
  await pool.query(`CREATE TABLE IF NOT EXISTS cash_movements (
    idCashMovement BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    idCashSession BIGINT UNSIGNED NOT NULL,
    idOperator BIGINT UNSIGNED NOT NULL,
    typeCashMovement ENUM('opening', 'sale', 'supply', 'withdrawal') NOT NULL,
    amountCashMovement DECIMAL(12,2) NOT NULL,
    descriptionCashMovement VARCHAR(500) NULL,
    idSale BIGINT UNSIGNED NULL,
    createdAtCashMovement TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (idCashMovement),
    KEY idxCashMovementsSale (idSale),
    KEY idxCashMovementsSessionCreated (idCashSession, createdAtCashMovement),
    CONSTRAINT fkCashMovementsSession
      FOREIGN KEY (idCashSession) REFERENCES cash_sessions (idCashSession)
      ON DELETE RESTRICT,
    CONSTRAINT fkCashMovementsOperator
      FOREIGN KEY (idOperator) REFERENCES operators (idOperator)
      ON DELETE RESTRICT
  ) ENGINE=InnoDB`);

  const [salesColumns] = await pool.query(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sales'`
  );
  const existingSalesColumns = new Set(salesColumns.map(({ COLUMN_NAME }) => COLUMN_NAME));
  if (!existingSalesColumns.has("idOperatorSale")) {
    await pool.query("ALTER TABLE sales ADD COLUMN idOperatorSale BIGINT UNSIGNED NULL AFTER clientIdSale");
  }
  if (!existingSalesColumns.has("idCashSessionSale")) {
    await pool.query("ALTER TABLE sales ADD COLUMN idCashSessionSale BIGINT UNSIGNED NULL AFTER idOperatorSale");
  }
  if (!existingSalesColumns.has("cancelledAtSale")) {
    await pool.query("ALTER TABLE sales ADD COLUMN cancelledAtSale DATETIME NULL AFTER statusSale");
  }
  if (!existingSalesColumns.has("idOperatorCancelledSale")) {
    await pool.query("ALTER TABLE sales ADD COLUMN idOperatorCancelledSale BIGINT UNSIGNED NULL AFTER cancelledAtSale");
  }
  if (!existingSalesColumns.has("cancellationReasonSale")) {
    await pool.query("ALTER TABLE sales ADD COLUMN cancellationReasonSale VARCHAR(500) NULL AFTER idOperatorCancelledSale");
  }
  const [constraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'sales'`
  );
  const existingConstraints = new Set(constraints.map(({ CONSTRAINT_NAME }) => CONSTRAINT_NAME));
  if (!existingConstraints.has("fkSalesOperator")) {
    await pool.query(
      `ALTER TABLE sales ADD CONSTRAINT fkSalesOperator
       FOREIGN KEY (idOperatorSale) REFERENCES operators (idOperator) ON DELETE RESTRICT`
    );
  }
  if (!existingConstraints.has("fkSalesCashSession")) {
    await pool.query(
      `ALTER TABLE sales ADD CONSTRAINT fkSalesCashSession
       FOREIGN KEY (idCashSessionSale) REFERENCES cash_sessions (idCashSession) ON DELETE RESTRICT`
    );
  }
  if (!existingConstraints.has("fkSalesCancelledOperator")) {
    await pool.query(
      `ALTER TABLE sales ADD CONSTRAINT fkSalesCancelledOperator
       FOREIGN KEY (idOperatorCancelledSale) REFERENCES operators (idOperator) ON DELETE RESTRICT`
    );
  }
  await pool.query(
    `ALTER TABLE cash_movements
     MODIFY COLUMN typeCashMovement ENUM('opening', 'sale', 'sale_cancellation', 'supply', 'withdrawal') NOT NULL`
  );
  const [movementConstraints] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'cash_movements'`
  );
  const hasSaleForeignKey = movementConstraints.some(
    ({ CONSTRAINT_NAME }) => CONSTRAINT_NAME === "fkCashMovementsSale"
  );
  const [saleMovementIndexes] = await pool.query(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'cash_movements'
       AND INDEX_NAME = 'uqCashMovementsSale'`
  );
  if (saleMovementIndexes.length) {
    if (hasSaleForeignKey) {
      await pool.query("ALTER TABLE cash_movements DROP FOREIGN KEY fkCashMovementsSale");
    }
    await pool.query("ALTER TABLE cash_movements DROP INDEX uqCashMovementsSale");
    await pool.query("ALTER TABLE cash_movements ADD KEY idxCashMovementsSale (idSale)");
    if (hasSaleForeignKey) {
      await pool.query(
        `ALTER TABLE cash_movements ADD CONSTRAINT fkCashMovementsSale
         FOREIGN KEY (idSale) REFERENCES sales (idSale) ON DELETE RESTRICT`
      );
    }
  } else if (!hasSaleForeignKey) {
    await pool.query(
      `ALTER TABLE cash_movements ADD CONSTRAINT fkCashMovementsSale
       FOREIGN KEY (idSale) REFERENCES sales (idSale) ON DELETE RESTRICT`
    );
  }
};

  return {
    ensureFiscalCatalogSchema,
    ensurePrinterSettingsSchema,
    ensureGeneralSettingsSchema,
    loadGeneralSourceSettings,
    ensureCustomerConsumerSchema,
    migrateCustomerConsumerSchema,
    getGeneralSettingBoolean,
    ensureCompanySchema,
    ensureSaleFiscalSchema,
    ensureFiscalOperationSchema,
    ensureNcmCestSchema,
    ensureProductFiscalSchema,
    ensureProductCatalogSchema,
    ensureCulinarySchema,
    ensureNavigationSchema,
    ensureUppercaseTextData,
    ensurePaymentMethodSchema,
    ensureSupplierSchema,
    ensureOperatorCashSchema
  };
};
