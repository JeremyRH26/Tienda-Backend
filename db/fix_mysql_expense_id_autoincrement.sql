-- Si al insertar gastos aparece: Field 'id' doesn't have a default value
-- ejecuta este script en tu base MySQL (misma BD que usa el backend).
--
-- Causa: la columna `id` en `expense` (y a veces `expense_category`) existe como
-- PRIMARY KEY pero sin AUTO_INCREMENT, así que INSERT sin `id` falla.

ALTER TABLE expense_category
  MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;

ALTER TABLE expense
  MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT;
