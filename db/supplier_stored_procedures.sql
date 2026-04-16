-- Procedimientos almacenados para proveedores (supplier).

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_supplier_insert$$
CREATE PROCEDURE sp_supplier_insert(
  IN p_company_name VARCHAR(200),
  IN p_contact_name VARCHAR(200),
  IN p_phone VARCHAR(40),
  IN p_email VARCHAR(200)
)
BEGIN
  INSERT INTO `supplier` (company_name, contact_name, phone, email)
  VALUES (p_company_name, p_contact_name, p_phone, p_email);
  SELECT LAST_INSERT_ID() AS id;
END$$

DROP PROCEDURE IF EXISTS sp_supplier_update$$
CREATE PROCEDURE sp_supplier_update(
  IN p_id INT,
  IN p_company_name VARCHAR(200),
  IN p_contact_name VARCHAR(200),
  IN p_phone VARCHAR(40),
  IN p_email VARCHAR(200)
)
BEGIN
  UPDATE `supplier`
  SET company_name = p_company_name,
      contact_name = p_contact_name,
      phone = p_phone,
      email = p_email
  WHERE id = p_id;
  SELECT ROW_COUNT() AS affected;
END$$

DROP PROCEDURE IF EXISTS sp_supplier_delete$$
CREATE PROCEDURE sp_supplier_delete(IN p_id INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM `supplier` WHERE id = p_id) THEN
    SELECT 0 AS affected;
  ELSE
    DELETE FROM `supplier` WHERE id = p_id;
    SELECT ROW_COUNT() AS affected;
  END IF;
END$$

DELIMITER ;

DROP PROCEDURE IF EXISTS sp_supplier_list_all;

CREATE PROCEDURE sp_supplier_list_all()
  SELECT s.id AS id,
         s.company_name AS companyName,
         s.contact_name AS contactName,
         s.phone AS phone,
         s.email AS email
  FROM `supplier` s
  ORDER BY s.company_name ASC;

DROP PROCEDURE IF EXISTS sp_supplier_get_by_id;

CREATE PROCEDURE sp_supplier_get_by_id(IN p_id INT)
  SELECT s.id AS id,
         s.company_name AS companyName,
         s.contact_name AS contactName,
         s.phone AS phone,
         s.email AS email
  FROM `supplier` s
  WHERE s.id = p_id
  LIMIT 1;
