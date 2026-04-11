-- Procedimientos almacenados para empleados (registro / equipo).
-- Columnas y tipos alineados con Tienda-/db/schema.sql (employee).
--
-- Requiere haber ejecutado antes roles_stored_procedures.sql (usa sp_role_get_by_id
-- desde el repositorio Node; no se duplica aquí).
--
-- Ejecutar con cliente mysql (DELIMITER $$), p. ej.:
--   mysql -u USER -p DB_NAME < db/employees_stored_procedures.sql

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_employee_release_username_if_inactive$$

DROP PROCEDURE IF EXISTS sp_employee_get_id_by_username$$
CREATE PROCEDURE sp_employee_get_id_by_username(IN p_username VARCHAR(100))
BEGIN
  SELECT e.id AS id, e.status AS status
  FROM `employee` e
  WHERE e.username = p_username
  LIMIT 1;
END$$

DROP PROCEDURE IF EXISTS sp_employee_release_username_if_inactive$$
CREATE PROCEDURE sp_employee_release_username_if_inactive(IN p_id INT)
BEGIN
  UPDATE `employee`
  SET username = CONCAT(LEFT(username, 72), ':inact:', CAST(p_id AS CHAR)),
      updated_at = NOW()
  WHERE id = p_id
    AND status = 0;
  SELECT ROW_COUNT() AS affected;
END$$

DROP PROCEDURE IF EXISTS sp_employee_insert$$
CREATE PROCEDURE sp_employee_insert(
  IN p_role_id INT,
  IN p_full_name VARCHAR(200),
  IN p_username VARCHAR(100),
  IN p_password_hash VARCHAR(255),
  IN p_phone VARCHAR(40)
)
BEGIN
  INSERT INTO `employee` (role_id, full_name, username, password_hash, phone, status)
  VALUES (p_role_id, p_full_name, p_username, p_password_hash, p_phone, 1);
  SELECT LAST_INSERT_ID() AS id;
END$$

DROP PROCEDURE IF EXISTS sp_employee_update$$
CREATE PROCEDURE sp_employee_update(
  IN p_id INT,
  IN p_role_id INT,
  IN p_full_name VARCHAR(200),
  IN p_username VARCHAR(100),
  IN p_phone VARCHAR(40),
  IN p_status TINYINT,
  IN p_password_hash VARCHAR(255)
)
BEGIN
  IF p_password_hash IS NOT NULL THEN
    UPDATE `employee`
    SET role_id = p_role_id,
        full_name = p_full_name,
        username = p_username,
        phone = p_phone,
        status = p_status,
        password_hash = p_password_hash,
        updated_at = NOW()
    WHERE id = p_id;
  ELSE
    UPDATE `employee`
    SET role_id = p_role_id,
        full_name = p_full_name,
        username = p_username,
        phone = p_phone,
        status = p_status,
        updated_at = NOW()
    WHERE id = p_id;
  END IF;
  SELECT ROW_COUNT() AS affected;
END$$

-- Con ventas: baja lógica (status=0 + usuario interno) para conservar FK en sale.
-- Sin ventas: DELETE definitivo.
DROP PROCEDURE IF EXISTS sp_employee_delete$$
CREATE PROCEDURE sp_employee_delete(IN p_id INT)
BEGIN
  DECLARE sale_cnt INT DEFAULT 0;
  IF NOT EXISTS (SELECT 1 FROM `employee` WHERE id = p_id) THEN
    SELECT 0 AS affected, 'none' AS outcome;
  ELSE
    SELECT COUNT(*) INTO sale_cnt FROM `sale` WHERE employee_id = p_id;
    IF sale_cnt > 0 THEN
      UPDATE `employee`
      SET status = 0,
          username = CONCAT(LEFT(username, 72), ':inact:', CAST(id AS CHAR)),
          updated_at = NOW()
      WHERE id = p_id;
      SELECT 1 AS affected, 'deactivated' AS outcome;
    ELSE
      DELETE FROM `employee` WHERE id = p_id;
      SELECT ROW_COUNT() AS affected, 'deleted' AS outcome;
    END IF;
  END IF;
END$$

DELIMITER ;

-- sp_employee_list_all: cuerpo = un solo SELECT (sin BEGIN/END) para ejecutar con delimitador `;`
-- en Workbench, phpMyAdmin, DBeaver, etc. (evita 1064 si el cliente no aplica DELIMITER $$).

DROP PROCEDURE IF EXISTS sp_employee_list_all;

CREATE PROCEDURE sp_employee_list_all()
  SELECT e.id AS id,
         e.role_id AS roleId,
         e.full_name AS fullName,
         e.username AS username,
         e.phone AS phone,
         e.status AS status,
         e.created_at AS createdAt,
         e.updated_at AS updatedAt,
         r.name AS roleName
  FROM `employee` e
  INNER JOIN `role` r ON r.id = e.role_id
  ORDER BY e.full_name ASC;

DROP PROCEDURE IF EXISTS sp_employee_get_by_id;

CREATE PROCEDURE sp_employee_get_by_id(IN p_id INT)
  SELECT e.id AS id,
         e.role_id AS roleId,
         e.full_name AS fullName,
         e.username AS username,
         e.phone AS phone,
         e.status AS status,
         e.created_at AS createdAt,
         e.updated_at AS updatedAt,
         r.name AS roleName
  FROM `employee` e
  INNER JOIN `role` r ON r.id = e.role_id
  WHERE e.id = p_id
  LIMIT 1;

DROP PROCEDURE IF EXISTS sp_employee_count_by_role_id;

-- Colaboradores activos (status = 1) con ese rol; para bloquear borrado de rol.
CREATE PROCEDURE sp_employee_count_by_role_id(IN p_role_id INT)
  SELECT COUNT(*) AS cnt
  FROM `employee`
  WHERE role_id = p_role_id AND status = 1;
