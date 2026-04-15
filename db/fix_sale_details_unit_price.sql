-- Si sp_sale_create falla con "Unknown column 'unit_price' in 'field list'", ejecute UNA VEZ:
ALTER TABLE sale_details
  ADD COLUMN unit_price NUMERIC(14, 4) NULL AFTER quantity;
