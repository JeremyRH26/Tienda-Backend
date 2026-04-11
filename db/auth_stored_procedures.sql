-- Procedimientos almacenados para autenticación (login).
-- Tablas/columnas alineadas con Tienda-/db/schema.sql (employee, role, role_permission, permission).
--
-- Sin DELIMITER $$: el cuerpo es un solo SELECT para poder ejecutar en Workbench,
-- phpMyAdmin, DBeaver, etc. (muchos clientes ignoran DELIMITER del mysql CLI).
--
--   mysql -u USER -p DB_NAME < db/auth_stored_procedures.sql

DROP PROCEDURE IF EXISTS sp_auth_employee_active_by_username;

CREATE PROCEDURE sp_auth_employee_active_by_username(IN p_username VARCHAR(100))
  SELECT e.id,
         e.full_name AS fullName,
         e.username,
         e.password_hash AS passwordHash,
         e.phone,
         e.status,
         e.role_id AS roleId,
         r.name AS roleName
  FROM employee e
  INNER JOIN `role` r ON r.id = e.role_id
  WHERE e.username = p_username
    AND e.status = 1
  LIMIT 1;

DROP PROCEDURE IF EXISTS sp_auth_permission_codes_by_role;

CREATE PROCEDURE sp_auth_permission_codes_by_role(IN p_role_id INT)
  SELECT p.code AS code
  FROM role_permission rp
  INNER JOIN `permission` p ON p.id = rp.permission_id
  WHERE rp.role_id = p_role_id
  ORDER BY p.code ASC;
