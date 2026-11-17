-- Rollback controlado da confirmação da pré-entrada fiscal 3.
-- Execute somente se a pré-entrada 3 foi confirmada exclusivamente para teste.
-- O procedimento restaura estoque/custo, remove os movimentos da confirmação
-- e retorna a pré-entrada para "open", permitindo uma nova confirmação.
--
-- Salvaguarda: o procedimento aborta se já houver movimentos posteriores nos
-- mesmos produtos ou se a entrada não estiver confirmada.

DELIMITER //

DROP PROCEDURE IF EXISTS rollback_fiscal_entry_3 //

CREATE PROCEDURE rollback_fiscal_entry_3()
main: BEGIN
  DECLARE v_status VARCHAR(20);
  DECLARE v_movement_count INT DEFAULT 0;
  DECLARE v_first_movement_count INT DEFAULT 0;
  DECLARE v_later_movement_count INT DEFAULT 0;

  START TRANSACTION;

  SELECT statusFiscalEntry
    INTO v_status
    FROM fiscal_entries
   WHERE idFiscalEntry = 3
   FOR UPDATE;

  IF v_status IS NULL THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Pré-entrada fiscal 3 não encontrada.';
  END IF;

  IF v_status <> 'confirmed' THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'A pré-entrada fiscal 3 não está confirmada.';
  END IF;

  DROP TEMPORARY TABLE IF EXISTS rollback_fiscal_entry_3_products;
  CREATE TEMPORARY TABLE rollback_fiscal_entry_3_products (
    idProduct BIGINT UNSIGNED NOT NULL PRIMARY KEY,
    idInventoryMovement BIGINT UNSIGNED NOT NULL,
    previousStock DECIMAL(14,4) NOT NULL,
    previousCost DECIMAL(14,4) NOT NULL
  ) ENGINE = MEMORY;

  SELECT COUNT(*)
    INTO v_movement_count
    FROM inventory_movements
   WHERE idFiscalEntry = 3
     AND typeInventoryMovement = 'fiscal_entry';

  IF v_movement_count = 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Nenhum movimento de confirmação foi encontrado para a pré-entrada 3.';
  END IF;

  INSERT INTO rollback_fiscal_entry_3_products
    (idProduct, idInventoryMovement, previousStock, previousCost)
  SELECT m.idProduct,
         m.idInventoryMovement,
         m.previousStockInventoryMovement,
         m.previousCostInventoryMovement
    FROM inventory_movements m
    JOIN (
      SELECT idProduct, MIN(idInventoryMovement) AS firstMovement
        FROM inventory_movements
       WHERE idFiscalEntry = 3
         AND typeInventoryMovement = 'fiscal_entry'
       GROUP BY idProduct
    ) first_movement
      ON first_movement.idProduct = m.idProduct
     AND first_movement.firstMovement = m.idInventoryMovement;

  SELECT COUNT(*)
    INTO v_first_movement_count
    FROM rollback_fiscal_entry_3_products;

  IF v_movement_count <> v_first_movement_count THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Há mais de um movimento para o mesmo produto na pré-entrada 3; revisão manual necessária.';
  END IF;

  SELECT COUNT(*)
    INTO v_later_movement_count
    FROM inventory_movements later_movement
    JOIN rollback_fiscal_entry_3_products original_movement
      ON original_movement.idProduct = later_movement.idProduct
   WHERE later_movement.idInventoryMovement > original_movement.idInventoryMovement
     AND NOT (
       later_movement.idFiscalEntry = 3
       AND later_movement.typeInventoryMovement = 'fiscal_entry'
     );

  IF v_later_movement_count > 0 THEN
    ROLLBACK;
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Existem movimentos posteriores nos produtos; rollback automático bloqueado.';
  END IF;

  UPDATE products p
  JOIN rollback_fiscal_entry_3_products original_movement
    ON original_movement.idProduct = p.idProduct
   SET p.stockQuantityProduct = original_movement.previousStock,
       p.costPriceProduct = original_movement.previousCost;

  DELETE FROM inventory_movements
   WHERE idFiscalEntry = 3
     AND typeInventoryMovement = 'fiscal_entry';

  UPDATE fiscal_entries
     SET statusFiscalEntry = 'open',
         confirmedAtFiscalEntry = NULL,
         confirmedByOperator = NULL,
         cancelledAtFiscalEntry = NULL,
         cancelledByOperator = NULL
   WHERE idFiscalEntry = 3;

  COMMIT;

  SELECT 'Rollback concluído; pré-entrada 3 retornou para open.' AS result,
         v_first_movement_count AS restoredProductCount;

  DROP TEMPORARY TABLE IF EXISTS rollback_fiscal_entry_3_products;
END //

DELIMITER ;

CALL rollback_fiscal_entry_3();
DROP PROCEDURE IF EXISTS rollback_fiscal_entry_3;
