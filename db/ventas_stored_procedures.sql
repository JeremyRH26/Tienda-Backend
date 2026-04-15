-- =============================================================================
-- Ventas / POS — sale, sale_details, stock al vender, historial, fiado y abonos
-- =============================================================================
-- Requisitos: MySQL 8+ (JSON_TABLE en sp_sale_create).
-- Tablas: sale, sale_details, product, product_stock, employee, customer,
--         customer_account.
--
-- Orden recomendado:
--   1) mysql ... < db/inventario_stored_procedures.sql
--   2) mysql ... < db/clientes_stored_procedures.sql   (tabla customer + SP de clientes)
--   3) mysql ... < db/ventas_stored_procedures.sql
--
-- Antes de ejecutar, si sale_details no tiene unit_price, ejecute UNA VEZ:
--   ALTER TABLE sale_details ADD COLUMN unit_price NUMERIC(14,4) NULL AFTER quantity;
-- (Si la columna ya existe, no la vuelva a agregar.)
--
-- Procedimientos:
--   sp_sale_create                 — valida stock, inserta sale + sale_details, descuenta stock;
--                                    fiado/credit exige customer_id
--   CreateSale                     — compatibilidad (3 args); empleado activo más antiguo; efectivo
--   sp_sale_list_by_date_range     — historial (todas las ventas) por rango de fechas
--   sp_sale_get_full               — cabecera + líneas (2 result sets)
--   sp_pos_day_cash_totals         — cobrado del día, fiados del día, abonos, flujo caja día
--   sp_customer_balance            — deuda cliente (fiados - abonos)
--   sp_customer_credit_sales_list  — ventas a crédito de un cliente
--   sp_customer_abono_insert       — registra abono en customer_account
--
-- JSON de líneas para sp_sale_create (desde Node, JSON.stringify):
--   [{"productId":1,"quantity":2,"unitPrice":10.5}, ...]
--   unitPrice opcional; si falta se usa product.sale_price.
--
-- payment_method en BD: 'cash' | 'card' | 'credit'  (fiado = credit)
-- customer_account.transaction_type: 1 = abono / pago a cuenta
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Ajustes de tablas (omitir líneas que ya fallen por estar aplicadas)
-- -----------------------------------------------------------------------------
ALTER TABLE sale MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE sale_details MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE customer_account MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;

-- -----------------------------------------------------------------------------
-- 2) Procedimientos
-- -----------------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_customer_abono_insert$$
DROP PROCEDURE IF EXISTS sp_customer_credit_sales_list$$
DROP PROCEDURE IF EXISTS sp_customer_balance$$
DROP PROCEDURE IF EXISTS sp_pos_day_cash_totals$$
DROP PROCEDURE IF EXISTS sp_sale_get_full$$
DROP PROCEDURE IF EXISTS sp_sale_list_by_date_range$$
DROP PROCEDURE IF EXISTS sp_sale_create$$
DROP PROCEDURE IF EXISTS CreateSale$$

CREATE PROCEDURE sp_sale_create(
  IN p_customer_id BIGINT,
  IN p_employee_id INT,
  IN p_products_text TEXT,
  IN p_total NUMERIC(14, 4),
  IN p_payment VARCHAR(20)
)
proc: BEGIN
  DECLARE v_sale_id BIGINT;
  DECLARE v_pay VARCHAR(20);
  DECLARE v_bad INT DEFAULT 0;
  DECLARE v_computed NUMERIC(14, 4) DEFAULT 0;
  DECLARE v_stock_miss INT DEFAULT 0;
  DECLARE v_emp_ok INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_employee_id IS NULL OR p_employee_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: employee_id requerido';
  END IF;

  SELECT COUNT(*) INTO v_emp_ok FROM employee WHERE id = p_employee_id AND status = 1;
  IF v_emp_ok = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: empleado no válido o inactivo';
  END IF;

  IF p_products_text IS NULL OR TRIM(p_products_text) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: productos requeridos';
  END IF;

  IF JSON_VALID(p_products_text) = 0 OR JSON_TYPE(CAST(p_products_text AS JSON)) <> 'ARRAY' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: JSON de productos inválido';
  END IF;

  IF JSON_LENGTH(CAST(p_products_text AS JSON)) < 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: al menos una línea de venta';
  END IF;

  SET v_pay = CASE LOWER(TRIM(COALESCE(p_payment, 'cash')))
    WHEN 'efectivo' THEN 'cash'
    WHEN 'cash' THEN 'cash'
    WHEN 'tarjeta' THEN 'card'
    WHEN 'card' THEN 'card'
    WHEN 'fiado' THEN 'credit'
    WHEN 'credit' THEN 'credit'
    ELSE 'cash'
  END;

  IF v_pay = 'credit' AND (p_customer_id IS NULL OR p_customer_id <= 0) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: customer_id requerido para venta a crédito/fiado';
  END IF;

  START TRANSACTION;

  DROP TEMPORARY TABLE IF EXISTS tmp_sale_lines;
  CREATE TEMPORARY TABLE tmp_sale_lines (
    product_id INT NOT NULL PRIMARY KEY,
    quantity INT NOT NULL,
    unit_price NUMERIC(14, 4) NOT NULL
  ) ENGINE = MEMORY;

  SELECT COUNT(*) INTO v_bad
  FROM JSON_TABLE(
    CAST(p_products_text AS JSON),
    '$[*]' COLUMNS (
      product_id INT PATH '$.productId',
      qty INT PATH '$.quantity',
      up NUMERIC(14, 4) PATH '$.unitPrice' NULL ON ERROR NULL ON EMPTY
    )
  ) AS jt
  LEFT JOIN product p ON p.id = jt.product_id AND p.status = 1
  WHERE p.id IS NULL OR jt.qty IS NULL OR jt.qty <= 0;

  IF v_bad > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: producto inválido, inactivo o cantidad inválida';
  END IF;

  INSERT INTO tmp_sale_lines (product_id, quantity, unit_price)
  SELECT
    jt.product_id,
    SUM(jt.qty),
    MAX(COALESCE(jt.up, p.sale_price))
  FROM JSON_TABLE(
    CAST(p_products_text AS JSON),
    '$[*]' COLUMNS (
      product_id INT PATH '$.productId',
      qty INT PATH '$.quantity',
      up NUMERIC(14, 4) PATH '$.unitPrice' NULL ON ERROR NULL ON EMPTY
    )
  ) AS jt
  INNER JOIN product p ON p.id = jt.product_id AND p.status = 1
  GROUP BY jt.product_id;

  SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_computed FROM tmp_sale_lines;

  IF p_total IS NOT NULL AND ABS(v_computed - p_total) > 0.02 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: total no coincide con líneas de venta';
  END IF;

  SELECT COUNT(*) INTO v_stock_miss
  FROM tmp_sale_lines t
  LEFT JOIN product_stock ps ON ps.product_id = t.product_id
  WHERE ps.product_id IS NULL OR ps.quantity < t.quantity;

  IF v_stock_miss > 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_create: stock insuficiente o sin inventario';
  END IF;

  SELECT t.product_id
  FROM tmp_sale_lines t
  INNER JOIN product_stock ps ON ps.product_id = t.product_id
  FOR UPDATE;

  INSERT INTO sale (customer_id, employee_id, sale_date, total_amount, payment_method, created_at, updated_at)
  VALUES (
    NULLIF(p_customer_id, 0),
    p_employee_id,
    NOW(),
    v_computed,
    v_pay,
    NOW(),
    NOW()
  );

  SET v_sale_id = LAST_INSERT_ID();

  INSERT INTO sale_details (sale_id, product_id, quantity, unit_price)
  SELECT v_sale_id, t.product_id, t.quantity, t.unit_price
  FROM tmp_sale_lines t;

  UPDATE product_stock ps
  INNER JOIN tmp_sale_lines t ON t.product_id = ps.product_id
  SET ps.quantity = ps.quantity - t.quantity, ps.updated_at = NOW();

  COMMIT;

  SELECT v_sale_id AS sale_id, v_computed AS total_amount;
END$$

-- Compatibilidad con código antiguo: 3 parámetros (empleado activo más antiguo por id)
CREATE PROCEDURE CreateSale(IN p_customer_id BIGINT, IN p_products TEXT, IN p_total NUMERIC(14, 4))
BEGIN
  DECLARE v_emp INT DEFAULT NULL;
  SELECT id INTO v_emp FROM employee WHERE status = 1 ORDER BY id ASC LIMIT 1;
  IF v_emp IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'CreateSale: no hay empleado activo';
  END IF;
  CALL sp_sale_create(p_customer_id, v_emp, p_products, p_total, 'cash');
END$$

-- p_date_start, p_date_end: inicio y fin INCLUSIVOS por DATE(sale_date) en hora del servidor MySQL.
CREATE PROCEDURE sp_sale_list_by_date_range(
  IN p_date_start DATE,
  IN p_date_end DATE
)
BEGIN
  IF p_date_start IS NULL OR p_date_end IS NULL OR p_date_end < p_date_start THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_list_by_date_range: fechas inválidas';
  END IF;

  SELECT
    s.id,
    s.customer_id,
    c.full_name AS customer_name,
    s.employee_id,
    e.full_name AS employee_name,
    s.sale_date,
    s.total_amount,
    s.payment_method,
    s.created_at,
    s.updated_at
  FROM sale s
  INNER JOIN employee e ON e.id = s.employee_id
  LEFT JOIN customer c ON c.id = s.customer_id
  WHERE DATE(s.sale_date) BETWEEN p_date_start AND p_date_end
  ORDER BY s.sale_date DESC, s.id DESC;
END$$

-- Result set 1: cabecera. Result set 2: líneas con nombre de producto.
CREATE PROCEDURE sp_sale_get_full(IN p_sale_id INT)
BEGIN
  IF p_sale_id IS NULL OR p_sale_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_sale_get_full: sale_id inválido';
  END IF;

  SELECT
    s.id,
    s.customer_id,
    c.full_name AS customer_name,
    s.employee_id,
    e.full_name AS employee_name,
    s.sale_date,
    s.total_amount,
    s.payment_method,
    s.created_at,
    s.updated_at
  FROM sale s
  INNER JOIN employee e ON e.id = s.employee_id
  LEFT JOIN customer c ON c.id = s.customer_id
  WHERE s.id = p_sale_id
  LIMIT 1;

  SELECT
    sd.id,
    sd.sale_id,
    sd.product_id,
    sd.quantity,
    sd.unit_price,
    p.name AS product_name,
    p.cost_price AS product_cost_price
  FROM sale_details sd
  LEFT JOIN product p ON p.id = sd.product_id
  WHERE sd.sale_id = p_sale_id
  ORDER BY sd.id ASC;
END$$

-- Totales por día calendario (DATE en el servidor). "Dinero del día" POS = paid_sales + abonos.
-- Siempre devuelve una fila (aunque no haya ventas ese día).
CREATE PROCEDURE sp_pos_day_cash_totals(IN p_day DATE)
BEGIN
  IF p_day IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_pos_day_cash_totals: día requerido';
  END IF;

  SELECT
    t.paid_sales_total,
    t.credit_sales_total,
    t.abonos_total,
    t.paid_sales_total + t.abonos_total AS cash_inflow_day
  FROM (
    SELECT
      COALESCE(
        (SELECT SUM(s.total_amount)
         FROM sale s
         WHERE DATE(s.sale_date) = p_day
           AND s.payment_method IN ('cash', 'card')),
        0
      ) AS paid_sales_total,
      COALESCE(
        (SELECT SUM(s.total_amount)
         FROM sale s
         WHERE DATE(s.sale_date) = p_day
           AND s.payment_method = 'credit'),
        0
      ) AS credit_sales_total,
      COALESCE(
        (SELECT SUM(ca.amount)
         FROM customer_account ca
         WHERE DATE(ca.paid_at) = p_day
           AND ca.transaction_type = 1),
        0
      ) AS abonos_total
  ) AS t;
END$$

CREATE PROCEDURE sp_customer_balance(IN p_customer_id BIGINT)
BEGIN
  IF p_customer_id IS NULL OR p_customer_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_balance: customer_id inválido';
  END IF;

  SELECT
    p_customer_id AS customer_id,
    COALESCE(
      (SELECT SUM(s.total_amount)
       FROM sale s
       WHERE s.customer_id = p_customer_id
         AND s.payment_method = 'credit'),
      0
    ) AS total_credit_sales,
    COALESCE(
      (SELECT SUM(ca.amount)
       FROM customer_account ca
       WHERE ca.customer_id = p_customer_id
         AND ca.transaction_type = 1),
      0
    ) AS total_abonos,
    COALESCE(
      (SELECT SUM(s.total_amount)
       FROM sale s
       WHERE s.customer_id = p_customer_id
         AND s.payment_method = 'credit'),
      0
    ) - COALESCE(
      (SELECT SUM(ca.amount)
       FROM customer_account ca
       WHERE ca.customer_id = p_customer_id
         AND ca.transaction_type = 1),
      0
    ) AS balance_due;
END$$

CREATE PROCEDURE sp_customer_credit_sales_list(IN p_customer_id BIGINT)
BEGIN
  IF p_customer_id IS NULL OR p_customer_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_credit_sales_list: customer_id inválido';
  END IF;

  SELECT
    s.id AS sale_id,
    s.sale_date,
    s.total_amount,
    s.employee_id,
    e.full_name AS employee_name,
    s.created_at
  FROM sale s
  INNER JOIN employee e ON e.id = s.employee_id
  WHERE s.customer_id = p_customer_id
    AND s.payment_method = 'credit'
  ORDER BY s.sale_date DESC, s.id DESC;
END$$

CREATE PROCEDURE sp_customer_abono_insert(
  IN p_customer_id BIGINT,
  IN p_amount NUMERIC(14, 4),
  IN p_note VARCHAR(1000),
  IN p_transaction_type TINYINT
)
BEGIN
  DECLARE v_tid TINYINT;
  DECLARE v_exists INT;

  IF p_customer_id IS NULL OR p_customer_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_abono_insert: customer_id inválido';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_abono_insert: amount inválido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM customer WHERE id = p_customer_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_abono_insert: cliente no existe';
  END IF;

  SET v_tid = COALESCE(p_transaction_type, 1);
  IF v_tid <> 1 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_customer_abono_insert: transaction_type no soportado (use 1 = abono)';
  END IF;

  INSERT INTO customer_account (customer_id, transaction_type, amount, note, paid_at, created_at)
  VALUES (
    p_customer_id,
    1,
    p_amount,
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    NOW(),
    NOW()
  );

  SELECT LAST_INSERT_ID() AS customer_account_id;
END$$

DELIMITER ;

-- =============================================================================
-- Ejemplos
-- =============================================================================
-- CALL sp_sale_create(1, 1, '[{"productId":1,"quantity":2}]', 20.00, 'efectivo');
-- CALL sp_sale_list_by_date_range('2026-04-01', '2026-04-30');
-- CALL sp_sale_get_full(1);
-- CALL sp_pos_day_cash_totals('2026-04-14');
-- CALL sp_customer_balance(1);
-- CALL sp_customer_credit_sales_list(1);
-- CALL sp_customer_abono_insert(1, 100.00, 'Abono parcial', 1);
-- =============================================================================
