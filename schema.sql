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
  ncmProduct CHAR(8) NULL,
  cestProduct CHAR(7) NULL,
  priceProduct DECIMAL(12,2) NOT NULL,
  stockQuantityProduct DECIMAL(12,3) NOT NULL DEFAULT 0,
  isActiveProduct TINYINT(1) NOT NULL DEFAULT 1,
  createdAtProduct TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtProduct TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idProduct),
  UNIQUE KEY uqProductsSkuProduct (skuProduct),
  UNIQUE KEY uqProductsBarcodeProduct (barcodeProduct),
  KEY idxProductsNcmProduct (ncmProduct),
  KEY idxProductsCestProduct (cestProduct),
  KEY idxProductsIsActiveProductNameProduct (isActiveProduct, nameProduct),
  CONSTRAINT fkProductsGroup
    FOREIGN KEY (idGroup) REFERENCES `groups` (idGroup)
    ON DELETE RESTRICT
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
  isActivePaymentMethod TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idPaymentMethod),
  UNIQUE KEY uqPaymentMethodsNamePaymentMethod (namePaymentMethod)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS printer_settings (
  idPrinterSetting TINYINT UNSIGNED NOT NULL,
  receiptPrinterName VARCHAR(255) NULL,
  reportsPrinterName VARCHAR(255) NULL,
  updatedAtPrinterSetting TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idPrinterSetting)
) ENGINE=InnoDB;

INSERT INTO printer_settings (idPrinterSetting)
VALUES (1)
ON DUPLICATE KEY UPDATE idPrinterSetting = idPrinterSetting;

CREATE TABLE IF NOT EXISTS navigation_menus (
  idNavigationMenu TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  keyNavigationMenu VARCHAR(80) NOT NULL,
  labelNavigationMenu VARCHAR(120) NOT NULL,
  orderNavigationMenu SMALLINT UNSIGNED NOT NULL,
  isActiveNavigationMenu TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idNavigationMenu),
  UNIQUE KEY uqNavigationMenusKey (keyNavigationMenu)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS navigation_items (
  idNavigationItem BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idNavigationMenu TINYINT UNSIGNED NOT NULL,
  idParentNavigationItem BIGINT UNSIGNED NULL,
  typeNavigationItem ENUM('item', 'submenu', 'bar') NOT NULL,
  keyNavigationItem VARCHAR(80) NOT NULL,
  labelNavigationItem VARCHAR(120) NOT NULL,
  routeNavigationItem VARCHAR(120) NULL,
  orderNavigationItem SMALLINT UNSIGNED NOT NULL,
  isActiveNavigationItem TINYINT(1) NOT NULL DEFAULT 1,
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

INSERT INTO navigation_menus (keyNavigationMenu, labelNavigationMenu, orderNavigationMenu)
VALUES ('registrations', 'Cadastros', 2)
ON DUPLICATE KEY UPDATE
  labelNavigationMenu = VALUES(labelNavigationMenu),
  orderNavigationMenu = VALUES(orderNavigationMenu);

SET @registrationsMenuId = (
  SELECT idNavigationMenu FROM navigation_menus WHERE keyNavigationMenu = 'registrations'
);

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, NULL, 'item', 'products', 'Produtos', NULL, 1
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem IS NULL
    AND keyNavigationItem = 'products'
);

UPDATE navigation_items
SET labelNavigationItem = 'Produtos', orderNavigationItem = 1
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem IS NULL
  AND keyNavigationItem = 'products';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, NULL, 'item', 'fiscal-operations', 'Operações Fiscais', NULL, 2
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem IS NULL
    AND keyNavigationItem = 'fiscal-operations'
);

UPDATE navigation_items
SET labelNavigationItem = 'Operações Fiscais', orderNavigationItem = 2
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem IS NULL
  AND keyNavigationItem = 'fiscal-operations';

SET @productsItemId = (
  SELECT idNavigationItem
  FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem IS NULL
    AND keyNavigationItem = 'products'
);

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @productsItemId, 'bar', 'products', 'Produtos', 'products', 1
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @productsItemId
    AND keyNavigationItem = 'products'
);

UPDATE navigation_items
SET labelNavigationItem = 'Produtos', routeNavigationItem = 'products', orderNavigationItem = 1
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @productsItemId
  AND keyNavigationItem = 'products';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @productsItemId, 'bar', 'classes', 'Classes', 'classes', 2
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @productsItemId
    AND keyNavigationItem = 'classes'
);

UPDATE navigation_items
SET labelNavigationItem = 'Classes', routeNavigationItem = 'classes', orderNavigationItem = 2
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @productsItemId
  AND keyNavigationItem = 'classes';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @productsItemId, 'bar', 'groups', 'Grupos', 'groups', 3
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @productsItemId
    AND keyNavigationItem = 'groups'
);

UPDATE navigation_items
SET labelNavigationItem = 'Grupos', routeNavigationItem = 'groups', orderNavigationItem = 3
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @productsItemId
  AND keyNavigationItem = 'groups';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @productsItemId, 'bar', 'ncm-cest', 'NCM / CEST', 'ncm-cest', 4
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @productsItemId
    AND keyNavigationItem = 'ncm-cest'
);

UPDATE navigation_items
SET labelNavigationItem = 'NCM / CEST', routeNavigationItem = 'ncm-cest', orderNavigationItem = 4
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @productsItemId
  AND keyNavigationItem = 'ncm-cest';

SET @fiscalOperationsItemId = (
  SELECT idNavigationItem
  FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem IS NULL
    AND keyNavigationItem = 'fiscal-operations'
);

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @fiscalOperationsItemId, 'bar', 'fiscal-operations', 'Operações Fiscais', 'fiscal-operations', 1
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @fiscalOperationsItemId
    AND keyNavigationItem = 'fiscal-operations'
);

UPDATE navigation_items
SET labelNavigationItem = 'Operações Fiscais', routeNavigationItem = 'fiscal-operations', orderNavigationItem = 1
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @fiscalOperationsItemId
  AND keyNavigationItem = 'fiscal-operations';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @fiscalOperationsItemId, 'bar', 'cfops', 'CFOP', 'cfops', 2
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @fiscalOperationsItemId
    AND keyNavigationItem = 'cfops'
);

UPDATE navigation_items
SET labelNavigationItem = 'CFOP', routeNavigationItem = 'cfops', orderNavigationItem = 2
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @fiscalOperationsItemId
  AND keyNavigationItem = 'cfops';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @fiscalOperationsItemId, 'bar', 'tax-situations', 'CST / CSOSN', 'tax-situations', 3
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @fiscalOperationsItemId
    AND keyNavigationItem = 'tax-situations'
);

UPDATE navigation_items
SET labelNavigationItem = 'CST / CSOSN', routeNavigationItem = 'tax-situations', orderNavigationItem = 3
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @fiscalOperationsItemId
  AND keyNavigationItem = 'tax-situations';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
SELECT @registrationsMenuId, @fiscalOperationsItemId, 'bar', 'icms-rates', 'Alíquotas ICMS', 'icms-rates', 4
FROM dual
WHERE NOT EXISTS (
  SELECT 1 FROM navigation_items
  WHERE idNavigationMenu = @registrationsMenuId
    AND idParentNavigationItem = @fiscalOperationsItemId
    AND keyNavigationItem = 'icms-rates'
);

UPDATE navigation_items
SET labelNavigationItem = 'Alíquotas ICMS', routeNavigationItem = 'icms-rates', orderNavigationItem = 4
WHERE idNavigationMenu = @registrationsMenuId
  AND idParentNavigationItem = @fiscalOperationsItemId
  AND keyNavigationItem = 'icms-rates';

INSERT INTO navigation_items
  (idNavigationMenu, idParentNavigationItem, typeNavigationItem, keyNavigationItem, labelNavigationItem, routeNavigationItem, orderNavigationItem)
VALUES
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'tax-regimes', 'Regimes', 'tax-regimes', 5),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'operation-types', 'Tipos', 'operation-types', 6),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'contexts', 'Contextos', 'contexts', 7),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'origins', 'Origens', 'origins', 8),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'ipi-situations', 'IPI', 'ipi-situations', 9),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'contribution-situations', 'PIS / COFINS', 'contribution-situations', 10),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'base-modes', 'Bases', 'base-modes', 11),
  (@registrationsMenuId, @fiscalOperationsItemId, 'bar', 'exemption-reasons', 'Desoneração', 'exemption-reasons', 12)
ON DUPLICATE KEY UPDATE
  labelNavigationItem = VALUES(labelNavigationItem),
  routeNavigationItem = VALUES(routeNavigationItem),
  orderNavigationItem = VALUES(orderNavigationItem);

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
