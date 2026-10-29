CREATE DATABASE IF NOT EXISTS `pdv`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `pdv`;

CREATE TABLE IF NOT EXISTS classes (
  idClass BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descriptionClass VARCHAR(120) NOT NULL,
  idFiscalOperationClass BIGINT UNSIGNED NULL,
  isActiveClass TINYINT(1) NOT NULL DEFAULT 1,
  createdAtClass TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtClass TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idClass),
  UNIQUE KEY uqClassesDescriptionClass (descriptionClass),
  KEY idxClassesFiscalOperation (idFiscalOperationClass)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS `groups` (
  idGroup BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descriptionGroup VARCHAR(120) NOT NULL,
  idClass BIGINT UNSIGNED NOT NULL,
  showsInPdvGroup TINYINT(1) NOT NULL DEFAULT 0,
  isActiveGroup TINYINT(1) NOT NULL DEFAULT 1,
  createdAtGroup TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtGroup TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idGroup),
  UNIQUE KEY uqGroupsDescriptionGroup (descriptionGroup),
  KEY idxGroupsIdClass (idClass),
  CONSTRAINT fkGroupsIdClass
    FOREIGN KEY (idClass) REFERENCES classes (idClass)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  idProduct BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idGroup BIGINT UNSIGNED NOT NULL,
  skuProduct VARCHAR(64) NOT NULL,
  pdvCodeProduct VARCHAR(64) NULL,
  nameProduct VARCHAR(180) NOT NULL,
  idFiscalOperationSaleProduct BIGINT UNSIGNED NULL,
  idProductTypeProduct BIGINT UNSIGNED NULL,
  idUnitProduct BIGINT UNSIGNED NULL,
  ncmProduct CHAR(8) NULL,
  cestProduct CHAR(7) NULL,
  priceProduct DECIMAL(12,2) NOT NULL,
  stockQuantityProduct DECIMAL(12,3) NOT NULL DEFAULT 0,
  controlsStockProduct TINYINT(1) NOT NULL DEFAULT 1,
  isFractionalProduct TINYINT(1) NOT NULL DEFAULT 0,
  printsKitchenProduct TINYINT(1) NOT NULL DEFAULT 0,
  showsInPdvProduct TINYINT(1) NOT NULL DEFAULT 1,
  isActiveProduct TINYINT(1) NOT NULL DEFAULT 1,
  createdAtProduct TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtProduct TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idProduct),
  UNIQUE KEY uqProductsSkuProduct (skuProduct),
  UNIQUE KEY uqProductsPdvCodeProduct (pdvCodeProduct),
  KEY idxProductsNcmProduct (ncmProduct),
  KEY idxProductsCestProduct (cestProduct),
  KEY idxProductsIsActiveProductNameProduct (isActiveProduct, nameProduct),
  CONSTRAINT fkProductsGroup
    FOREIGN KEY (idGroup) REFERENCES `groups` (idGroup)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_types (
  idProductType BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codeSpedProductType VARCHAR(30) NULL,
  descriptionProductType VARCHAR(120) NOT NULL,
  isActiveProductType TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idProductType),
  UNIQUE KEY uqProductTypesDescription (descriptionProductType)
) ENGINE=InnoDB;

INSERT INTO product_types (descriptionProductType, isActiveProductType)
VALUES ('Produto Acabado', 1)
ON DUPLICATE KEY UPDATE isActiveProductType = 1;

CREATE TABLE IF NOT EXISTS units (
  idUnit BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codeUnit CHAR(6) NOT NULL,
  descriptionUnit VARCHAR(80) NOT NULL,
  isActiveUnit TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idUnit),
  UNIQUE KEY uqUnitsCode (codeUnit)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ncm_catalog (
  idNcm BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codeNcm CHAR(8) NOT NULL,
  descriptionNcm TEXT NOT NULL,
  isActiveNcm TINYINT(1) NOT NULL DEFAULT 1,
  createdAtNcm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtNcm TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idNcm),
  UNIQUE KEY uqNcmCode (codeNcm)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cest_catalog (
  idCest BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  codeCest CHAR(7) NOT NULL,
  descriptionCest TEXT NOT NULL,
  segmentCest VARCHAR(160) NULL,
  isActiveCest TINYINT(1) NOT NULL DEFAULT 1,
  createdAtCest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtCest TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idCest),
  UNIQUE KEY uqCestCode (codeCest)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ncm_cest_relations (
  idNcmCestRelation BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idNcm BIGINT UNSIGNED NOT NULL,
  idCest BIGINT UNSIGNED NOT NULL,
  createdAtNcmCestRelation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idNcmCestRelation),
  UNIQUE KEY uqNcmCestRelation (idNcm, idCest),
  KEY idxNcmCestRelationsCest (idCest),
  CONSTRAINT fkNcmCestRelationsNcm FOREIGN KEY (idNcm) REFERENCES ncm_catalog (idNcm) ON DELETE RESTRICT,
  CONSTRAINT fkNcmCestRelationsCest FOREIGN KEY (idCest) REFERENCES cest_catalog (idCest) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ncm_cest_updates (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_methods (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS suppliers (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS printer_settings (
  idPrinterSetting TINYINT UNSIGNED NOT NULL,
  receiptPrinterName VARCHAR(255) NULL,
  reportsPrinterName VARCHAR(255) NULL,
  receiptLayoutPrinterSetting JSON NULL,
  updatedAtPrinterSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idPrinterSetting)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS general_settings (
  idGeneralSetting BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  keyGeneralSetting VARCHAR(80) NOT NULL,
  labelGeneralSetting VARCHAR(160) NOT NULL,
  typeGeneralSetting ENUM('boolean') NOT NULL DEFAULT 'boolean',
  booleanValueGeneralSetting TINYINT(1) NOT NULL DEFAULT 0,
  updatedAtGeneralSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idGeneralSetting),
  UNIQUE KEY uqGeneralSettingsKey (keyGeneralSetting)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS company_settings (
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
  nfceContingencyCompany ENUM('none', 'offline') NOT NULL DEFAULT 'none',
  nfceCscCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceTokenCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceHomologationCscCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceHomologationTokenCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceCertificateTypeCompany ENUM('A1', 'A3') NOT NULL DEFAULT 'A1',
  nfceCertificatePathCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceCertificateExpiresCompany DATE NULL,
  nfceCertificateSerialCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceCertificateNameCompany VARCHAR(255) NOT NULL DEFAULT '',
  nfceCertificateDataCompany MEDIUMTEXT NULL,
  nfceCertificatePasswordCompany MEDIUMTEXT NULL,
  logoMimeCompany VARCHAR(50) NOT NULL DEFAULT '',
  logoDataCompany MEDIUMTEXT NULL,
  projectIconMimeCompany VARCHAR(50) NOT NULL DEFAULT '',
  projectIconDataCompany MEDIUMTEXT NULL,
  createdAtCompanySetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtCompanySetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idCompanySetting)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS navigation_menus (
  idNavigationMenu SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  keyNavigationMenu VARCHAR(80) NOT NULL,
  labelNavigationMenu VARCHAR(120) NOT NULL,
  orderNavigationMenu SMALLINT UNSIGNED NOT NULL,
  isActiveNavigationMenu TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idNavigationMenu),
  UNIQUE KEY uqNavigationMenusKey (keyNavigationMenu)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS navigation_items (
  idNavigationItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idNavigationMenu SMALLINT UNSIGNED NOT NULL,
  idParentNavigationItem BIGINT UNSIGNED NULL,
  typeNavigationItem ENUM('item', 'submenu', 'bar') NOT NULL,
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
  CONSTRAINT fkNavigationItemsMenu
    FOREIGN KEY (idNavigationMenu) REFERENCES navigation_menus (idNavigationMenu)
    ON DELETE CASCADE,
  CONSTRAINT fkNavigationItemsParent
    FOREIGN KEY (idParentNavigationItem) REFERENCES navigation_items (idNavigationItem)
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fiscal_operations (
  idFiscalOperation BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descriptionFiscalOperation VARCHAR(180) NOT NULL,
  taxRegimeFiscalOperation VARCHAR(80) NOT NULL,
  typeFiscalOperation ENUM('entry', 'exit') NOT NULL DEFAULT 'exit',
  contextFiscalOperation VARCHAR(40) NOT NULL DEFAULT 'within_state',
  taxSituationFiscalOperation VARCHAR(20) NULL,
  originFiscalOperation VARCHAR(20) NULL,
  cfopFiscalOperation VARCHAR(10) NULL,
  operationNatureFiscalOperation VARCHAR(180) NULL,
  ipiSituationFiscalOperation VARCHAR(20) NULL,
  icmsBaseModeFiscalOperation VARCHAR(40) NULL,
  icmsStBaseModeFiscalOperation VARCHAR(40) NULL,
  icmsExemptionReasonFiscalOperation VARCHAR(180) NULL,
  cofinsSituationFiscalOperation VARCHAR(20) NULL,
  pisSituationFiscalOperation VARCHAR(20) NULL,
  fcpEnabledFiscalOperation TINYINT(1) NOT NULL DEFAULT 0,
  fcpUseReductionBaseFiscalOperation TINYINT(1) NOT NULL DEFAULT 0,
  fcpStEnabledFiscalOperation TINYINT(1) NOT NULL DEFAULT 0,
  fcpStUseReductionBaseFiscalOperation TINYINT(1) NOT NULL DEFAULT 0,
  fiscalBenefitCodeFiscalOperation VARCHAR(40) NULL,
  legalBasisFiscalOperation TEXT NULL,
  isActiveFiscalOperation TINYINT(1) NOT NULL DEFAULT 1,
  createdAtFiscalOperation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtFiscalOperation TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idFiscalOperation),
  KEY idxFiscalOperationsCfopFiscalOperation (cfopFiscalOperation),
  KEY idxFiscalOperationsActiveDescription (isActiveFiscalOperation, descriptionFiscalOperation)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS fiscal_catalog_items (
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
) ENGINE=InnoDB;

INSERT INTO fiscal_catalog_items
  (catalogFiscalCatalogItem, codeFiscalCatalogItem, descriptionFiscalCatalogItem, valueFiscalCatalogItem)
VALUES ('cfops', '5.101', 'Venda de produção do estabelecimento', NULL)
ON DUPLICATE KEY UPDATE
  descriptionFiscalCatalogItem = VALUES(descriptionFiscalCatalogItem),
  isActiveFiscalCatalogItem = 1;

CREATE TABLE IF NOT EXISTS sales (
  idSale BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clientIdSale CHAR(36) NOT NULL,
  statusSale ENUM('completed', 'cancelled') NOT NULL DEFAULT 'completed',
  subtotalSale DECIMAL(12,2) NOT NULL,
  discountSale DECIMAL(12,2) NOT NULL DEFAULT 0,
  totalSale DECIMAL(12,2) NOT NULL,
  createdAtSale TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idSale),
  UNIQUE KEY uqSalesClientIdSale (clientIdSale),
  KEY idxSalesCreatedAtSale (createdAtSale)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_items (
  idSaleItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idSale BIGINT UNSIGNED NOT NULL,
  idProduct BIGINT UNSIGNED NOT NULL,
  productNameSaleItem VARCHAR(180) NOT NULL,
  unitPriceSaleItem DECIMAL(12,2) NOT NULL,
  quantitySaleItem DECIMAL(12,3) NOT NULL,
  lineTotalSaleItem DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (idSaleItem),
  KEY idxSaleItemsIdSale (idSale),
  CONSTRAINT fkSaleItemsIdSale
    FOREIGN KEY (idSale) REFERENCES sales (idSale)
    ON DELETE RESTRICT,
  CONSTRAINT fkSaleItemsIdProduct
    FOREIGN KEY (idProduct) REFERENCES products (idProduct)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_payments (
  idSalePayment BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idSale BIGINT UNSIGNED NOT NULL,
  idPaymentMethod BIGINT UNSIGNED NOT NULL,
  amountSalePayment DECIMAL(12,2) NOT NULL,
  PRIMARY KEY (idSalePayment),
  KEY idxSalePaymentsIdSale (idSale),
  CONSTRAINT fkSalePaymentsIdSale
    FOREIGN KEY (idSale) REFERENCES sales (idSale)
    ON DELETE RESTRICT,
  CONSTRAINT fkSalePaymentsIdPaymentMethod
    FOREIGN KEY (idPaymentMethod) REFERENCES payment_methods (idPaymentMethod)
    ON DELETE RESTRICT
) ENGINE=InnoDB;
