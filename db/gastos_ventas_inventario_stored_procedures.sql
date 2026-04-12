-- =============================================================================
-- Módulo GASTOS — expense (solo columnas: id, category_id, expense_date, amount, payment_method, note)
-- =============================================================================
-- category_id → FK a expense_category (las categorías se dan de alta en esa tabla).
--
-- Procedimientos:
--   sp_expense_category_list          — listado id, name
--   sp_expense_category_get_or_create — busca por name (trim); si no existe, inserta
--   sp_expense_insert                 — inserta en expense
--   sp_expense_get_by_id              — detalle (join expense_category)
--   sp_expense_update                 — actualiza un gasto
--   sp_expense_delete                 — borra por id
--
-- Base: process.env.DB_NAME || 'tienda'
--   mysql -u USER -p NOMBRE_BD < db/gastos_ventas_inventario_stored_procedures.sql
--
-- payment_method guardado: 'cash' | 'transfer' (el backend acepta también efectivo / transferencia).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) Ajustes opcionales (omitir si ya aplican)
-- -----------------------------------------------------------------------------
ALTER TABLE expense_category MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
ALTER TABLE expense MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;

-- -----------------------------------------------------------------------------
-- 2) Categorías iniciales (solo name)
-- -----------------------------------------------------------------------------
INSERT INTO expense_category (name) VALUES
  ('Servicios públicos'),
  ('Compra de productos e insumos'),
  ('Arriendo'),
  ('Nómina'),
  ('Gastos administrativos'),
  ('Transporte y logística'),
  ('Muebles, equipo o maquinaria'),
  ('Otros')
ON DUPLICATE KEY UPDATE name = VALUES(name);

-- -----------------------------------------------------------------------------
-- 3) Procedimientos: expense_category + expense
-- -----------------------------------------------------------------------------
DELIMITER $$

DROP PROCEDURE IF EXISTS sp_expense_delete$$
DROP PROCEDURE IF EXISTS sp_expense_update$$
DROP PROCEDURE IF EXISTS sp_expense_get_by_id$$
DROP PROCEDURE IF EXISTS sp_expense_insert$$
DROP PROCEDURE IF EXISTS sp_expense_category_get_or_create$$
DROP PROCEDURE IF EXISTS sp_expense_category_list$$

CREATE PROCEDURE sp_expense_category_list()
BEGIN
  SELECT id, name
  FROM expense_category
  ORDER BY name ASC;
END$$

-- Busca por name (trim); si no existe, inserta y devuelve category_id.
CREATE PROCEDURE sp_expense_category_get_or_create(IN p_name VARCHAR(150))
BEGIN
  DECLARE v_id INT;
  DECLARE v_trim VARCHAR(150);

  SET v_trim = TRIM(p_name);

  IF v_trim IS NULL OR v_trim = '' THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_category_get_or_create: name requerido';
  END IF;

  SELECT id INTO v_id FROM expense_category WHERE name = v_trim LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO expense_category (name) VALUES (v_trim);
    SET v_id = LAST_INSERT_ID();
  END IF;

  SELECT v_id AS category_id;
END$$

CREATE PROCEDURE sp_expense_insert(
  IN p_category_id INT,
  IN p_expense_date DATE,
  IN p_amount NUMERIC(14, 4),
  IN p_payment VARCHAR(20),
  IN p_note VARCHAR(2000)
)
BEGIN
  DECLARE v_pay VARCHAR(20);
  DECLARE v_exists INT;

  IF p_category_id IS NULL OR p_category_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_insert: category_id requerido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM expense_category WHERE id = p_category_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_insert: category_id no existe en expense_category';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_insert: amount inválido';
  END IF;

  SET v_pay = CASE LOWER(TRIM(COALESCE(p_payment, 'cash')))
    WHEN 'efectivo' THEN 'cash'
    WHEN 'cash' THEN 'cash'
    WHEN 'transferencia' THEN 'transfer'
    WHEN 'transfer' THEN 'transfer'
    ELSE 'cash'
  END;

  INSERT INTO expense (category_id, expense_date, amount, payment_method, note)
  VALUES (
    p_category_id,
    p_expense_date,
    p_amount,
    v_pay,
    NULLIF(TRIM(COALESCE(p_note, '')), '')
  );

  SELECT LAST_INSERT_ID() AS expense_id;
END$$

-- Detalle de un gasto (una fila o vacío si no existe)
CREATE PROCEDURE sp_expense_get_by_id(IN p_id INT)
BEGIN
  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_get_by_id: id inválido';
  END IF;

  SELECT
    e.id,
    e.category_id,
    c.name AS category_name,
    e.expense_date,
    e.amount,
    e.payment_method,
    e.note
  FROM expense e
  INNER JOIN expense_category c ON c.id = e.category_id
  WHERE e.id = p_id
  LIMIT 1;
END$$

-- Actualizar gasto (mismas columnas editables que en insert)
CREATE PROCEDURE sp_expense_update(
  IN p_id INT,
  IN p_category_id INT,
  IN p_expense_date DATE,
  IN p_amount NUMERIC(14, 4),
  IN p_payment VARCHAR(20),
  IN p_note VARCHAR(2000)
)
BEGIN
  DECLARE v_pay VARCHAR(20);
  DECLARE v_exists INT;
  DECLARE v_cnt INT;

  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_update: id inválido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM expense WHERE id = p_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_update: gasto no encontrado';
  END IF;

  IF p_category_id IS NULL OR p_category_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_update: category_id requerido';
  END IF;

  SELECT COUNT(*) INTO v_exists FROM expense_category WHERE id = p_category_id;
  IF v_exists = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_update: category_id no existe en expense_category';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_update: amount inválido';
  END IF;

  SET v_pay = CASE LOWER(TRIM(COALESCE(p_payment, 'cash')))
    WHEN 'efectivo' THEN 'cash'
    WHEN 'cash' THEN 'cash'
    WHEN 'transferencia' THEN 'transfer'
    WHEN 'transfer' THEN 'transfer'
    ELSE 'cash'
  END;

  UPDATE expense
  SET
    category_id = p_category_id,
    expense_date = p_expense_date,
    amount = p_amount,
    payment_method = v_pay,
    note = NULLIF(TRIM(COALESCE(p_note, '')), '')
  WHERE id = p_id;

  SET v_cnt = ROW_COUNT();
  SELECT v_cnt AS affected;
END$$

-- Eliminar gasto por id
CREATE PROCEDURE sp_expense_delete(IN p_id INT)
BEGIN
  DECLARE v_cnt INT;

  IF p_id IS NULL OR p_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_delete: id inválido';
  END IF;

  DELETE FROM expense WHERE id = p_id;
  SET v_cnt = ROW_COUNT();

  IF v_cnt = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_expense_delete: gasto no encontrado';
  END IF;

  SELECT v_cnt AS deleted;
END$$

DELIMITER ;

-- =============================================================================
-- Prueba en MySQL (Workbench / CLI)
-- =============================================================================
-- Listar categorías (SP):
--    CALL sp_expense_category_list();
--
-- Asegurar categoría por nombre (crea si no existe):
--    CALL sp_expense_category_get_or_create('Mantenimiento');
--
-- Insertar gasto (ej. category_id = 4):
--    CALL sp_expense_insert(4, '2026-04-11', 150.00, 'efectivo', 'Nota opcional');
--
-- Verificar:
--    SELECT * FROM expense ORDER BY id DESC LIMIT 1;
--
-- Detalle, edición y borrado:
--    CALL sp_expense_get_by_id(1);
--    CALL sp_expense_update(1, 4, '2026-04-12', 200.00, 'transferencia', 'Nota');
--    CALL sp_expense_delete(1);
-- =============================================================================
