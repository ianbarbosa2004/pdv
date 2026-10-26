CREATE DATABASE IF NOT EXISTS `pdv`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `pdv`;

CREATE TABLE IF NOT EXISTS classes (
  idClass BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descriptionClass VARCHAR(120) NOT NULL,
  isActiveClass TINYINT(1) NOT NULL DEFAULT 1,
  createdAtClass TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtClass TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idClass),
  UNIQUE KEY uqClassesDescriptionClass (descriptionClass)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS `groups` (
  idGroup BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  descriptionGroup VARCHAR(120) NOT NULL,
  idClass BIGINT UNSIGNED NOT NULL,
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
  barcodeProduct VARCHAR(64) NULL,
  nameProduct VARCHAR(180) NOT NULL,
  priceProduct DECIMAL(12,2) NOT NULL,
  stockQuantityProduct DECIMAL(12,3) NOT NULL DEFAULT 0,
  isActiveProduct TINYINT(1) NOT NULL DEFAULT 1,
  createdAtProduct TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtProduct TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idProduct),
  UNIQUE KEY uqProductsSkuProduct (skuProduct),
  UNIQUE KEY uqProductsBarcodeProduct (barcodeProduct),
  KEY idxProductsIsActiveProductNameProduct (isActiveProduct, nameProduct),
  CONSTRAINT fkProductsGroup
    FOREIGN KEY (idGroup) REFERENCES `groups` (idGroup)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payment_methods (
  idPaymentMethod BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  namePaymentMethod VARCHAR(80) NOT NULL,
  isActivePaymentMethod TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idPaymentMethod),
  UNIQUE KEY uqPaymentMethodsNamePaymentMethod (namePaymentMethod)
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
  fcpStEnabledFiscalOperation TINYINT(1) NOT NULL DEFAULT 0,
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

INSERT IGNORE INTO payment_methods (namePaymentMethod) VALUES
  ('Dinheiro'),
  ('Pix'),
  ('Cartão de débito'),
  ('Cartão de crédito');
