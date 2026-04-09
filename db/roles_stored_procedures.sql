-- Procedimientos almacenados para roles y permisos (RBAC).
-- sp_role_permission_replace usa JSON_TABLE → MySQL 8.0.4+.
-- Ejecutar contra la base de datos del proyecto, p. ej.:
--   mysql -u USER -p DB_NAME < db/roles_stored_procedures.sql

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_role_insert$$
CREATE PROCEDURE sp_role_insert(IN p_name VARCHAR(128))
BEGIN
  INSERT INTO role (name) VALUES (p_name);
  SELECT LAST_INSERT_ID() AS id;
END$$

DROP PROCEDURE IF EXISTS sp_role_get_by_id$$
CREATE PROCEDURE sp_role_get_by_id(IN p_role_id INT)
BEGIN
  SELECT id, name FROM role WHERE id = p_role_id LIMIT 1;
END$$

DROP PROCEDURE IF EXISTS sp_role_get_by_name$$
CREATE PROCEDURE sp_role_get_by_name(IN p_name VARCHAR(128))
BEGIN
  SELECT id FROM role WHERE name = p_name LIMIT 1;
END$$

DROP PROCEDURE IF EXISTS sp_role_list_all$$
CREATE PROCEDURE sp_role_list_all()
BEGIN
  SELECT id, name FROM role ORDER BY name ASC;
END$$

DROP PROCEDURE IF EXISTS sp_permission_list_all$$
CREATE PROCEDURE sp_permission_list_all()
BEGIN
  SELECT id, code, description FROM permission ORDER BY code ASC;
END$$

DROP PROCEDURE IF EXISTS sp_role_permission_list_by_role$$
CREATE PROCEDURE sp_role_permission_list_by_role(IN p_role_id INT)
BEGIN
  SELECT p.id, p.code, p.description
  FROM role_permission rp
  INNER JOIN permission p ON p.id = rp.permission_id
  WHERE rp.role_id = p_role_id
  ORDER BY p.code ASC;
END$$

DROP PROCEDURE IF EXISTS sp_role_permission_delete_by_role$$
DROP PROCEDURE IF EXISTS sp_role_permission_replace$$
CREATE PROCEDURE sp_role_permission_replace(
  IN p_role_id INT,
  IN p_permission_ids_json JSON
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  DELETE FROM role_permission WHERE role_id = p_role_id;

  INSERT INTO role_permission (role_id, permission_id)
  SELECT p_role_id, jt.perm_id
  FROM JSON_TABLE(
    p_permission_ids_json,
    '$[*]' COLUMNS (perm_id INT PATH '$')
  ) AS jt;

  COMMIT;
END$$

DROP PROCEDURE IF EXISTS sp_permission_count_by_ids$$

DELIMITER ;
