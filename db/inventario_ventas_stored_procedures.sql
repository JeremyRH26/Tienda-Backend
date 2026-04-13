-- =============================================================================
-- Inventario (product, product_category, product_stock) + ventas (sale, sale_details)
-- Mantiene stock y ventas en una sola transacción en sp_sale_create.
--
-- Requisitos: MySQL 8+ (JSON_TABLE).
-- Ejecutar:
--   mysql -u USER -p NOMBRE_BD < db/inventario_ventas_stored_procedures.sql
--
-- Antes de ejecutar este script, si sale_details no tiene unit_price, ejecute UNA VEZ:
--   ALTER TABLE sale_details ADD COLUMN unit_price NUMERIC(14,4) NULL AFTER quantity;
-- (Si la columna ya existe, no la vuelva a agregar.)
--
-- Procedimientos inventario:
--   sp_product_category_list
--   sp_product_category_get_or_create
--   sp_product_insert              — crea producto + fila en product_stock
--   sp_product_update
--   sp_product_get_by_id           — producto + categoría + stock
--   sp_product_list                — listado (misma forma que get, para POS e inventario)
--   sp_product_soft_delete         — status = 0
--   sp_stock_adjust                — delta en cantidad (entradas/salidas manuales)
--   sp_stock_set_min               — umbral mínimo
--   sp_product_set_image_url       — actualiza solo image_url (p. ej. tras subir a R2)
--
-- Ventas:
--   sp_sale_create                 — valida stock, inserta sale + sale_details, descuenta stock
--
-- JSON de líneas de venta (desde Node, JSON.stringify):
--   [{"productId":1,"quantity":2,"unitPrice":10.5}, ...]
--   unitPrice opcional; si falta se usa product.sale_price.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) IDs autoincrement (omitir líneas que ya fallen por estar aplicadas)
-- -----------------------------------------------------------------------------
ALTER TABLE product_category MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE product MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE sale MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE sale_details MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;

-- -----------------------------------------------------------------------------
-- 2) Procedimientos
-- -----------------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_sale_create$$
DROP PROCEDURE IF EXISTS sp_product_set_image_url$$
DROP PROCEDURE IF EXISTS sp_stock_set_min$$
DROP PROCEDURE IF EXISTS sp_stock_adjust$$
DROP PROCEDURE IF EXISTS sp_product_soft_delete$$
DROP PROCEDURE IF EXISTS sp_product_list$$
DROP PROCEDURE IF EXISTS sp_product_get_by_id$$
DROP PROCEDURE IF EXISTS sp_product_update$$
DROP PROCEDURE IF EXISTS sp_product_insert$$
DROP PROCEDURE IF EXISTS sp_product_category_get_or_create$$
DROP PROCEDURE IF EXISTS sp_product_category_list$$
DROP PROCEDURE IF EXISTS CreateSale$$

CREATE PROCEDURE sp_product_category_list()
BEGIN
  SELECT id, name
  FROM product_category
  ORDER BY name ASC;
END$$

CREATE PROCEDURE sp_product_category_get_or_create(IN p_name VARCHAR(120))
BEGIN
  DECLARE v_id INT;
  DECLARE v_trim VARCHAR(120);

  SET v_trim = TRIM(p_name);

  IF v_trim IS NULL OR v_trim = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_category_get_or_create: name requerido';
  END IF;

  SELECT id INTO v_id FROM product_category WHERE name = v_trim LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO product_category (name) VALUES (v_trim);
    SET v_id = LAST_INSERT_ID();
  END IF;

  SELECT v_id AS category_id;
END$$

CREATE PROCEDURE sp_product_insert(
  IN p_category_id INT,
  IN p_supplier_id INT,
  IN p_name VARCHAR(255),
  IN p_cost_price NUMERIC(14, 4),
  IN p_sale_price NUMERIC(14, 4),
  IN p_image_url VARCHAR(2048),
  IN p_status TINYINT,
  IN p_initial_quantity INT,
  IN p_min_stock INT
)
BEGIN
  DECLARE v_pid INT;
  DECLARE v_exists INT;
  DECLARE v_qty INT;
  DECLARE v_min INT;

  IF p_category_id IS NULL OR p_category_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_insert: category_id requerido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM product_category WHERE id = p_category_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_insert: categoría no existe';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_insert: name requerido';
  END IF;

  SET v_qty = COALESCE(p_initial_quantity, 0);
  SET v_min = COALESCE(p_min_stock, 0);

  IF v_qty < 0 OR v_min < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_insert: cantidades inválidas';
  END IF;

  INSERT INTO product (
    category_id,
    supplier_id,
    name,
    cost_price,
    sale_price,
    image_url,
    status,
    created_at,
    updated_at
  )
  VALUES (
    p_category_id,
    NULLIF(p_supplier_id, 0),
    TRIM(p_name),
    COALESCE(p_cost_price, 0),
    COALESCE(p_sale_price, 0),
    NULLIF(TRIM(COALESCE(p_image_url, '')), ''),
    COALESCE(p_status, 1),
    NOW(),
    NOW()
  );

  SET v_pid = LAST_INSERT_ID();

  INSERT INTO product_stock (product_id, quantity, min_stock, updated_at)
  VALUES (v_pid, v_qty, v_min, NOW());

  SELECT v_pid AS product_id;
END$$

CREATE PROCEDURE sp_product_update(
  IN p_id INT,
  IN p_category_id INT,
  IN p_supplier_id INT,
  IN p_name VARCHAR(255),
  IN p_cost_price NUMERIC(14, 4),
  IN p_sale_price NUMERIC(14, 4),
  IN p_image_url VARCHAR(2048),
  IN p_status TINYINT
)
BEGIN
  DECLARE v_exists INT;
  DECLARE v_cnt INT;

  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_update: id inválido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM product WHERE id = p_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_update: producto no encontrado';
  END IF;

  IF p_category_id IS NULL OR p_category_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_update: category_id requerido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM product_category WHERE id = p_category_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_update: categoría no existe';
  END IF;

  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_update: name requerido';
  END IF;

  UPDATE product
  SET
    category_id = p_category_id,
    supplier_id = NULLIF(p_supplier_id, 0),
    name = TRIM(p_name),
    cost_price = COALESCE(p_cost_price, 0),
    sale_price = COALESCE(p_sale_price, 0),
    image_url = NULLIF(TRIM(COALESCE(p_image_url, '')), ''),
    status = COALESCE(p_status, 1),
    updated_at = NOW()
  WHERE id = p_id;

  SET v_cnt = ROW_COUNT();
  SELECT v_cnt AS affected;
END$$

CREATE PROCEDURE sp_product_get_by_id(IN p_id INT)
BEGIN
  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_get_by_id: id inválido';
  END IF;

  SELECT
    p.id,
    p.category_id,
    c.name AS category_name,
    p.supplier_id,
    p.name,
    p.cost_price,
    p.sale_price,
    p.image_url,
    p.status,
    p.created_at,
    p.updated_at,
    COALESCE(s.quantity, 0) AS quantity,
    COALESCE(s.min_stock, 0) AS min_stock,
    s.updated_at AS stock_updated_at
  FROM product p
  INNER JOIN product_category c ON c.id = p.category_id
  LEFT JOIN product_stock s ON s.product_id = p.id
  WHERE p.id = p_id
  LIMIT 1;
END$$

-- include_inactive: 0 = solo activos; 1 = todos
CREATE PROCEDURE sp_product_list(IN p_include_inactive TINYINT)
BEGIN
  SELECT
    p.id,
    p.category_id,
    c.name AS category_name,
    p.supplier_id,
    p.name,
    p.cost_price,
    p.sale_price,
    p.image_url,
    p.status,
    p.created_at,
    p.updated_at,
    COALESCE(s.quantity, 0) AS quantity,
    COALESCE(s.min_stock, 0) AS min_stock,
    s.updated_at AS stock_updated_at
  FROM product p
  INNER JOIN product_category c ON c.id = p.category_id
  LEFT JOIN product_stock s ON s.product_id = p.id
  WHERE COALESCE(p_include_inactive, 0) = 1 OR p.status = 1
  ORDER BY p.name ASC, p.id ASC;
END$$

CREATE PROCEDURE sp_product_soft_delete(IN p_id INT)
BEGIN
  DECLARE v_cnt INT;

  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_soft_delete: id inválido';
  END IF;

  UPDATE product SET status = 0, updated_at = NOW() WHERE id = p_id;
  SET v_cnt = ROW_COUNT();

  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_soft_delete: producto no encontrado';
  END IF;

  SELECT v_cnt AS affected;
END$$

CREATE PROCEDURE sp_product_set_image_url(IN p_id INT, IN p_image_url VARCHAR(2048))
BEGIN
  DECLARE v_cnt INT;

  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_set_image_url: id inválido';
  END IF;

  UPDATE product
  SET
    image_url = NULLIF(TRIM(COALESCE(p_image_url, '')), ''),
    updated_at = NOW()
  WHERE id = p_id;

  SET v_cnt = ROW_COUNT();

  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_product_set_image_url: producto no encontrado';
  END IF;

  SELECT v_cnt AS affected;
END$$

CREATE PROCEDURE sp_stock_adjust(IN p_product_id INT, IN p_delta INT)
BEGIN
  DECLARE v_cnt INT;
  DECLARE v_new INT;

  IF p_product_id IS NULL OR p_product_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_adjust: product_id inválido';
  END IF;

  IF p_delta IS NULL OR p_delta = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_adjust: delta distinto de cero requerido';
  END IF;

  UPDATE product_stock
  SET
    quantity = quantity + p_delta,
    updated_at = NOW()
  WHERE product_id = p_product_id
    AND quantity + p_delta >= 0;

  SET v_cnt = ROW_COUNT();

  IF v_cnt = 0 THEN
    SELECT quantity INTO v_new FROM product_stock WHERE product_id = p_product_id LIMIT 1;
    IF v_new IS NULL THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_adjust: sin registro de stock para el producto';
    END IF;
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_adjust: stock insuficiente para el ajuste';
  END IF;

  SELECT v_cnt AS affected;
END$$

CREATE PROCEDURE sp_stock_set_min(IN p_product_id INT, IN p_min_stock INT)
BEGIN
  DECLARE v_cnt INT;

  IF p_product_id IS NULL OR p_product_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_set_min: product_id inválido';
  END IF;

  IF p_min_stock IS NULL OR p_min_stock < 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_set_min: min_stock inválido';
  END IF;

  UPDATE product_stock
  SET min_stock = p_min_stock, updated_at = NOW()
  WHERE product_id = p_product_id;

  SET v_cnt = ROW_COUNT();

  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_stock_set_min: sin registro de stock';
  END IF;

  SELECT v_cnt AS affected;
END$$

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

DELIMITER ;

-- =============================================================================
-- Pruebas (ejemplos)
-- =============================================================================
-- CALL sp_product_category_list();
-- CALL sp_product_category_get_or_create('Bebidas');
-- CALL sp_product_insert(1, NULL, 'Producto demo', 5, 10, NULL, 1, 100, 5);
-- CALL sp_product_list(1);
-- CALL sp_product_get_by_id(1);
-- CALL sp_stock_adjust(1, -5);
-- CALL sp_stock_set_min(1, 3);
--
-- Venta (JSON como texto):
-- CALL sp_sale_create(1, 1, '[{"productId":1,"quantity":2}]', 20.00, 'efectivo');
-- =============================================================================
