-- =============================================================================
-- Inventario — product, product_category, product_stock
-- (Sin ventas: el POS está en db/ventas_stored_procedures.sql)
--
-- Ejecutar:
--   mysql -u USER -p NOMBRE_BD < db/inventario_stored_procedures.sql
--
-- Procedimientos:
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
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) IDs autoincrement (omitir líneas que ya fallen por estar aplicadas)
-- -----------------------------------------------------------------------------
ALTER TABLE product_category MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE product MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;

-- -----------------------------------------------------------------------------
-- 2) Procedimientos
-- -----------------------------------------------------------------------------
DELIMITER $$

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
-- =============================================================================
