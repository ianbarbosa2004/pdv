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

CREATE TABLE IF NOT EXISTS physical_states (
  idPhysicalState INT AUTO_INCREMENT PRIMARY KEY,
  codePhysicalState VARCHAR(30) NOT NULL UNIQUE,
  namePhysicalState VARCHAR(50) NOT NULL,
  descriptionPhysicalState VARCHAR(150) NULL,
  isActivePhysicalState TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  idProduct BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idGroup BIGINT UNSIGNED NOT NULL,
  skuProduct VARCHAR(64) NOT NULL,
  pdvCodeProduct VARCHAR(64) NULL,
  nameProduct VARCHAR(180) NOT NULL,
  idFiscalOperationSaleProduct BIGINT UNSIGNED NULL,
  idProductTypeProduct BIGINT UNSIGNED NULL,
  idPhysicalStateProduct INT NULL DEFAULT NULL,
  idUnitProduct BIGINT UNSIGNED NULL,
  ncmProduct CHAR(8) NULL,
  cestProduct CHAR(7) NULL,
  priceProduct DECIMAL(12,2) NOT NULL,
  costPriceProduct DECIMAL(12,2) NOT NULL DEFAULT 0,
  stockQuantityProduct DECIMAL(12,3) NOT NULL DEFAULT 0,
  controlsStockProduct TINYINT(1) NOT NULL DEFAULT 1,
  isBuffetProduct TINYINT(1) NOT NULL DEFAULT 0,
  isFractionalProduct TINYINT(1) NOT NULL DEFAULT 0,
  printsPlace VARCHAR(20) NOT NULL DEFAULT 'NÃO IMPRIMIR',
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
  KEY idxProductsPhysicalStateProduct (idPhysicalStateProduct),
  CONSTRAINT fkProductsGroup
    FOREIGN KEY (idGroup) REFERENCES `groups` (idGroup)
    ON DELETE RESTRICT,
  CONSTRAINT fkProductsPhysicalState
    FOREIGN KEY (idPhysicalStateProduct) REFERENCES physical_states (idPhysicalState)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recipe_definitions (
  idRecipe BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nameRecipe VARCHAR(180) NOT NULL,
  kindRecipe ENUM('production', 'composition') NOT NULL,
  idResultProductRecipe BIGINT UNSIGNED NULL,
  statusRecipe ENUM('draft', 'active', 'review_required', 'archived') NOT NULL DEFAULT 'draft',
  versionRecipe INT UNSIGNED NOT NULL DEFAULT 1,
  yieldQuantityRecipe DECIMAL(12,3) NOT NULL DEFAULT 1,
  notesRecipe VARCHAR(500) NULL,
  createdAtRecipe TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtRecipe TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idRecipe),
  UNIQUE KEY uqRecipeNameKind (nameRecipe, kindRecipe),
  KEY idxRecipeStatus (statusRecipe, kindRecipe),
  KEY idxRecipeResultProduct (idResultProductRecipe),
  CONSTRAINT fkRecipeResultProduct
    FOREIGN KEY (idResultProductRecipe) REFERENCES products (idProduct)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recipe_components (
  idRecipeComponent BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idRecipe BIGINT UNSIGNED NOT NULL,
  componentTypeRecipe ENUM('product', 'recipe') NOT NULL DEFAULT 'product',
  idComponentProductRecipe BIGINT UNSIGNED NULL,
  idComponentRecipe BIGINT UNSIGNED NULL,
  quantityRecipeComponent DECIMAL(12,4) NOT NULL,
  lossPercentRecipeComponent DECIMAL(7,4) NOT NULL DEFAULT 0,
  createdAtRecipeComponent TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idRecipeComponent),
  KEY idxRecipeComponentsRecipe (idRecipe),
  KEY idxRecipeComponentsProduct (idComponentProductRecipe),
  CONSTRAINT fkRecipeComponentsDefinition
    FOREIGN KEY (idRecipe) REFERENCES recipe_definitions (idRecipe)
    ON DELETE CASCADE,
  CONSTRAINT fkRecipeComponentsProduct
    FOREIGN KEY (idComponentProductRecipe) REFERENCES products (idProduct)
    ON DELETE RESTRICT,
  CONSTRAINT fkRecipeComponentsRecipe
    FOREIGN KEY (idComponentRecipe) REFERENCES recipe_definitions (idRecipe)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS product_recipe_links (
  idProductRecipeLink BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idProduct BIGINT UNSIGNED NOT NULL,
  idRecipe BIGINT UNSIGNED NOT NULL,
  quantityProductRecipeLink DECIMAL(12,4) NOT NULL DEFAULT 1,
  lossPercentProductRecipeLink DECIMAL(7,4) NOT NULL DEFAULT 0,
  createdAtProductRecipeLink TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idProductRecipeLink),
  UNIQUE KEY uqProductRecipeLink (idProduct, idRecipe),
  KEY idxProductRecipeLinksRecipe (idRecipe),
  CONSTRAINT fkProductRecipeLinksProduct
    FOREIGN KEY (idProduct) REFERENCES products (idProduct)
    ON DELETE CASCADE,
  CONSTRAINT fkProductRecipeLinksRecipe
    FOREIGN KEY (idRecipe) REFERENCES recipe_definitions (idRecipe)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recipe_reviews (
  idRecipeReview BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idRecipe BIGINT UNSIGNED NOT NULL,
  reasonRecipeReview VARCHAR(240) NOT NULL,
  statusRecipeReview ENUM('pending', 'confirmed', 'dismissed') NOT NULL DEFAULT 'pending',
  createdAtRecipeReview TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmedAtRecipeReview TIMESTAMP NULL,
  PRIMARY KEY (idRecipeReview),
  KEY idxRecipeReviewsStatus (statusRecipeReview, createdAtRecipeReview),
  CONSTRAINT fkRecipeReviewsRecipe
    FOREIGN KEY (idRecipe) REFERENCES recipe_definitions (idRecipe)
    ON DELETE CASCADE
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
VALUES ('PRODUTO ACABADO', 1)
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

INSERT INTO payment_methods
  (namePaymentMethod, cashFlowAccountPaymentMethod, termDaysPaymentMethod, isActivePaymentMethod)
VALUES ('VALE', 'Caixa', 30, 1)
ON DUPLICATE KEY UPDATE isActivePaymentMethod = 1;

CREATE TABLE IF NOT EXISTS operators (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS operator_sessions (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cash_registers (
  idCashRegister TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  nameCashRegister VARCHAR(80) NOT NULL,
  isActiveCashRegister TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (idCashRegister),
  UNIQUE KEY uqCashRegistersName (nameCashRegister)
) ENGINE=InnoDB;

INSERT INTO cash_registers (nameCashRegister, isActiveCashRegister)
VALUES ('Caixa principal', 1)
ON DUPLICATE KEY UPDATE isActiveCashRegister = 1;

CREATE TABLE IF NOT EXISTS cash_sessions (
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
  countrySupplier VARCHAR(80) NOT NULL DEFAULT 'BRASIL',
  notesSupplier VARCHAR(400) NULL,
  isActiveSupplier TINYINT(1) NOT NULL DEFAULT 1,
  createdAtSupplier TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAtSupplier TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (idSupplier),
  UNIQUE KEY uqSuppliersDocumentType (documentSupplier, typeSupplier),
  KEY idxSuppliersTypeStatus (typeSupplier, isActiveSupplier)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customers (
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
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS consumers (
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
  CONSTRAINT fkConsumersCustomer FOREIGN KEY (idCustomer) REFERENCES customers (idCustomer) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS customer_vouchers (
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
  typeGeneralSetting ENUM('boolean', 'text', 'number', 'json') NOT NULL DEFAULT 'boolean',
  booleanValueGeneralSetting TINYINT(1) NOT NULL DEFAULT 0,
  valueGeneralSetting TEXT NULL,
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
  countryCompany VARCHAR(80) NOT NULL DEFAULT 'BRASIL',
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
VALUES ('cfops', '5.101', 'VENDA DE PRODUÇÃO DO ESTABELECIMENTO', NULL)
ON DUPLICATE KEY UPDATE
  descriptionFiscalCatalogItem = VALUES(descriptionFiscalCatalogItem),
  isActiveFiscalCatalogItem = 1;

CREATE TABLE IF NOT EXISTS sales (
  idSale BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  clientIdSale CHAR(36) NOT NULL,
  idOperatorSale BIGINT UNSIGNED NOT NULL,
  idCashSessionSale BIGINT UNSIGNED NOT NULL,
  statusSale ENUM('completed', 'cancelled') NOT NULL DEFAULT 'completed',
  cancelledAtSale DATETIME NULL,
  idOperatorCancelledSale BIGINT UNSIGNED NULL,
  cancellationReasonSale VARCHAR(500) NULL,
  subtotalSale DECIMAL(12,2) NOT NULL,
  discountSale DECIMAL(12,2) NOT NULL DEFAULT 0,
  totalSale DECIMAL(12,2) NOT NULL,
  createdAtSale TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (idSale),
  UNIQUE KEY uqSalesClientIdSale (clientIdSale),
  KEY idxSalesCreatedAtSale (createdAtSale),
  KEY idxSalesOperatorCashSession (idOperatorSale, idCashSessionSale),
  CONSTRAINT fkSalesOperator
    FOREIGN KEY (idOperatorSale) REFERENCES operators (idOperator)
    ON DELETE RESTRICT,
  CONSTRAINT fkSalesCashSession
    FOREIGN KEY (idCashSessionSale) REFERENCES cash_sessions (idCashSession)
    ON DELETE RESTRICT,
  CONSTRAINT fkSalesCancelledOperator
    FOREIGN KEY (idOperatorCancelledSale) REFERENCES operators (idOperator)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sale_fiscal_documents (
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

CREATE TABLE IF NOT EXISTS cash_movements (
  idCashMovement BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  idCashSession BIGINT UNSIGNED NOT NULL,
  idOperator BIGINT UNSIGNED NOT NULL,
  typeCashMovement ENUM('opening', 'sale', 'sale_cancellation', 'supply', 'withdrawal') NOT NULL,
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
    ON DELETE RESTRICT,
  CONSTRAINT fkCashMovementsSale
    FOREIGN KEY (idSale) REFERENCES sales (idSale)
    ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS culinary_units (
  idCulinaryUnit INT AUTO_INCREMENT PRIMARY KEY,
  codeCulinaryUnit VARCHAR(20) NOT NULL UNIQUE,
  nameCulinaryUnit VARCHAR(50) NOT NULL,
  baseUnitCulinaryUnit ENUM('g', 'ml', 'un') NOT NULL,
  categoryCulinaryUnit ENUM('weight', 'volume', 'unit') NOT NULL,
  descriptionCulinaryUnit VARCHAR(100) NULL,
  isActiveCulinaryUnit TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS culinary_unit_conversions (
  idCulinaryUnitConversion INT AUTO_INCREMENT PRIMARY KEY,
  idFromCulinaryUnitConversion INT NOT NULL,
  idToCulinaryUnitConversion INT NOT NULL,
  idPhysicalStateCulinaryUnitConversion INT NOT NULL,
  factorCulinaryUnitConversion DECIMAL(10, 4) NOT NULL,
  notesCulinaryUnitConversion VARCHAR(150) NULL,
  FOREIGN KEY (idFromCulinaryUnitConversion) REFERENCES culinary_units(idCulinaryUnit) ON DELETE CASCADE,
  FOREIGN KEY (idToCulinaryUnitConversion) REFERENCES culinary_units(idCulinaryUnit) ON DELETE CASCADE,
  FOREIGN KEY (idPhysicalStateCulinaryUnitConversion) REFERENCES physical_states(idPhysicalState) ON DELETE RESTRICT,
  UNIQUE KEY uqCulinaryUnitConversions (idFromCulinaryUnitConversion, idToCulinaryUnitConversion, idPhysicalStateCulinaryUnitConversion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
