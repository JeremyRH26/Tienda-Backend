-- =============================================================================
-- Clientes — customer (+ listado con saldo fiado)
-- =============================================================================
-- Tablas: customer (id, full_name, phone, email, created_at, updated_at)
--
-- Ejecutar después de tener la tabla customer creada:
--   mysql -u USER -p NOMBRE_BD < db/clientes_stored_procedures.sql
--
-- Procedimientos:
--   sp_customer_list                 — id, full_name, phone, email, fechas
--   sp_customer_list_with_balance    — lo mismo + balance_due (fiados − abonos tipo 1)
--   sp_customer_get_by_id
--   sp_customer_insert
--   sp_customer_update
--   sp_customer_abono_list_by_date_range — abonos (transaction_type=1) en rango de fechas
-- =============================================================================

ALTER TABLE customer MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_customer_abono_list_by_date_range$$
DROP PROCEDURE IF EXISTS sp_customer_update$$
DROP PROCEDURE IF EXISTS sp_customer_insert$$
DROP PROCEDURE IF EXISTS sp_customer_get_by_id$$
DROP PROCEDURE IF EXISTS sp_customer_list_with_balance$$
DROP PROCEDURE IF EXISTS sp_customer_list$$

CREATE PROCEDURE sp_customer_list()
BEGIN
  SELECT id, full_name, phone, email, created_at, updated_at
  FROM customer
  ORDER BY full_name ASC, id ASC;
END$$

CREATE PROCEDURE sp_customer_list_with_balance()
BEGIN
  SELECT
    c.id,
    c.full_name,
    c.phone,
    c.email,
    c.created_at,
    c.updated_at,
    COALESCE(
      (SELECT SUM(s.total_amount)
       FROM sale s
       WHERE s.customer_id = c.id AND s.payment_method = 'credit'),
      0
    ) - COALESCE(
      (SELECT SUM(ca.amount)
       FROM customer_account ca
       WHERE ca.customer_id = c.id AND ca.transaction_type = 1),
      0
    ) AS balance_due
  FROM customer c
  ORDER BY c.full_name ASC, c.id ASC;
END$$

CREATE PROCEDURE sp_customer_get_by_id(IN p_id BIGINT)
BEGIN
  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_get_by_id: id inválido';
  END IF;

  SELECT id, full_name, phone, email, created_at, updated_at
  FROM customer
  WHERE id = p_id
  LIMIT 1;
END$$

CREATE PROCEDURE sp_customer_insert(
  IN p_full_name VARCHAR(200),
  IN p_phone VARCHAR(40),
  IN p_email VARCHAR(200)
)
BEGIN
  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_insert: full_name requerido';
  END IF;

  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_insert: phone requerido';
  END IF;

  INSERT INTO customer (full_name, phone, email, created_at, updated_at)
  VALUES (
    TRIM(p_full_name),
    TRIM(p_phone),
    NULLIF(TRIM(COALESCE(p_email, '')), ''),
    NOW(),
    NOW()
  );

  SELECT LAST_INSERT_ID() AS customer_id;
END$$

CREATE PROCEDURE sp_customer_update(
  IN p_id BIGINT,
  IN p_full_name VARCHAR(200),
  IN p_phone VARCHAR(40),
  IN p_email VARCHAR(200)
)
BEGIN
  DECLARE v_cnt INT;

  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_update: id inválido';
  END IF;

  IF p_full_name IS NULL OR TRIM(p_full_name) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_update: full_name requerido';
  END IF;

  IF p_phone IS NULL OR TRIM(p_phone) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_update: phone requerido';
  END IF;

  UPDATE customer
  SET
    full_name = TRIM(p_full_name),
    phone = TRIM(p_phone),
    email = NULLIF(TRIM(COALESCE(p_email, '')), ''),
    updated_at = NOW()
  WHERE id = p_id;

  SET v_cnt = ROW_COUNT();
  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_update: cliente no encontrado';
  END IF;

  SELECT v_cnt AS affected;
END$$

CREATE PROCEDURE sp_customer_abono_list_by_date_range(
  IN p_date_start DATE,
  IN p_date_end DATE
)
BEGIN
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end < p_date_start THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_abono_list_by_date_range: fechas inválidas';
  END IF;

  SELECT
    ca.id,
    ca.customer_id,
    c.full_name AS customer_name,
    ca.amount,
    ca.note,
    ca.paid_at,
    ca.created_at
  FROM customer_account ca
  INNER JOIN customer c ON c.id = ca.customer_id
  WHERE ca.transaction_type = 1
    AND DATE(ca.paid_at) BETWEEN p_date_start AND p_date_end
  ORDER BY ca.paid_at DESC, ca.id DESC;
END$$

DELIMITER ;

-- CALL sp_customer_list_with_balance();
-- CALL sp_customer_abono_list_by_date_range('2026-04-01', '2026-04-30');
