-- =============================================================================
-- Reportes — indicadores, tendencia, ventas vs gastos y desglose por buckets
-- =============================================================================
-- Tablas: sale, sale_details, product, expense, customer_account
-- Requiere: sale_details.unit_price (ver db/fix_sale_details_unit_price.sql)
--
-- Parámetros:
--   p_grouping  'diario' | 'semanal' | 'mensual' | 'anual' | 'rango'
--   p_start, p_end  Rango del informe (hora civil que usa el cliente).
--   p_ref_date      Fecha de referencia (UI); año en agrupación anual; COALESCE con DATE(p_start).
--
-- Offset de zona (solo en este SP): DECLARE v_off — minutos sumados al instante
-- guardado en BD antes de comparar con p_start/p_end y antes de agrupar.
-- Ajuste v_off aquí si NOW() del servidor no coincide con tu zona (ej. −360 = UTC→Guatemala UTC−6).
-- Se aplica a: sale.sale_date, customer_account.paid_at.
-- Gastos: expense.expense_date es solo fecha civil (sin hora); no usar offset, comparar con DATE().
--
-- Result sets (en orden):
--   1) indicadores (una fila)
--   2) tendencia ventas cobradas: label, sales
--   3) ventas vs gastos: label, sales, expenses
--   4) desglose: label, sales, expenses, ganancia, margen_pct  (margen_pct NULL si sales=0)
--   5) gastos por categoría (donut): label, amount
--   6) margen bruto cobradas por bucket (línea): label, margin  (misma granularidad que tendencia)
--   7) fiado vs abonos por bucket: label, abonos, fiado  (fiado = ventas credit en el bucket; abonos = pagos a cuenta)
--
-- Ventas cobradas = payment_method IN ('cash','card'). Fiado = 'credit'.
-- Abonos = transaction_type = 1 comparando paid_at ajustado con [p_start, p_end].
--
-- Gastos KPI: DATE(expense_date) dentro del rango calendario [DATE(p_start), DATE(p_end)].
--
-- Desglose diario: en gráficos las barras de gastos por hora siguen en 0 (solo se desglosa ventas por hora).
-- =============================================================================

DELIMITER $$

DROP PROCEDURE IF EXISTS sp_reports_full$$

CREATE PROCEDURE sp_reports_full(
  IN p_grouping VARCHAR(20),
  IN p_start DATETIME,
  IN p_end DATETIME,
  IN p_ref_date DATE
)
BEGIN
  DECLARE v_g VARCHAR(20);
  DECLARE v_ref DATE DEFAULT COALESCE(p_ref_date, DATE(p_start));
  DECLARE v_year INT;
  DECLARE v_total_margen DECIMAL(14, 4) DEFAULT 0;
  DECLARE v_total_gastos_kpi DECIMAL(14, 4) DEFAULT 0;
  DECLARE v_off INT DEFAULT -360;

  SET v_g = LOWER(TRIM(COALESCE(p_grouping, '')));
  SET v_year = YEAR(v_ref);

  IF v_g NOT IN ('diario', 'semanal', 'mensual', 'anual', 'rango') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_reports_full: grouping inválido';
  END IF;

  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'sp_reports_full: rango de fechas inválido';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 1) Indicadores
  -- ---------------------------------------------------------------------------
  SELECT COALESCE(SUM(
    sd.quantity * (COALESCE(sd.unit_price, pr.sale_price) - COALESCE(pr.cost_price, 0))
  ), 0) INTO v_total_margen
  FROM sale s
  INNER JOIN sale_details sd ON sd.sale_id = s.id
  LEFT JOIN product pr ON pr.id = sd.product_id
  WHERE s.payment_method IN ('cash', 'card')
    AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
    AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end;

  SELECT COALESCE(SUM(e.amount), 0) INTO v_total_gastos_kpi
  FROM expense e
  WHERE DATE(e.expense_date) >= DATE(p_start)
    AND DATE(e.expense_date) <= DATE(p_end);

  SELECT
    COALESCE((
      SELECT SUM(s.total_amount)
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
    ), 0) AS total_cobrado,
    COALESCE((
      SELECT SUM(sd.quantity * COALESCE(p.cost_price, 0))
      FROM sale s
      INNER JOIN sale_details sd ON sd.sale_id = s.id
      LEFT JOIN product p ON p.id = sd.product_id
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
    ), 0) AS total_costo,
    v_total_margen AS total_margen,
    v_total_gastos_kpi AS total_gastos,
    COALESCE((
      SELECT SUM(ca.amount)
      FROM customer_account ca
      WHERE ca.transaction_type = 1
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) <= p_end
    ), 0) AS total_abonos,
    COALESCE((
      SELECT SUM(s.total_amount)
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
    ), 0) AS total_fiado,
    (
      SELECT COUNT(*)
      FROM sale s
      WHERE DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
    ) AS count_ventas,
    (
      SELECT COUNT(*)
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
    ) AS count_fiado,
    (v_total_margen - v_total_gastos_kpi) AS resultado_operativo;

  -- ---------------------------------------------------------------------------
  -- 2–4) Series según agrupación
  -- ---------------------------------------------------------------------------
  IF v_g = 'diario' THEN
    WITH RECURSIVE hrs AS (
      SELECT 0 AS h
      UNION ALL
      SELECT h + 1 FROM hrs WHERE h < 23
    )
    SELECT CONCAT(LPAD(hrs.h, 2, '0'), ':00') AS label,
           COALESCE(ps.sales, 0) AS sales
    FROM hrs
    LEFT JOIN (
      SELECT HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS h,
             SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.h = hrs.h
    ORDER BY hrs.h;

    WITH RECURSIVE hrs AS (
      SELECT 0 AS h
      UNION ALL
      SELECT h + 1 FROM hrs WHERE h < 23
    )
    SELECT CONCAT(LPAD(hrs.h, 2, '0'), ':00') AS label,
           COALESCE(ps.sales, 0) AS sales,
           0 AS expenses
    FROM hrs
    LEFT JOIN (
      SELECT HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS h,
             SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.h = hrs.h
    ORDER BY hrs.h;

    WITH RECURSIVE hrs AS (
      SELECT 0 AS h
      UNION ALL
      SELECT h + 1 FROM hrs WHERE h < 23
    )
    SELECT CONCAT(LPAD(hrs.h, 2, '0'), ':00') AS label,
           COALESCE(ps.sales, 0) AS sales,
           0 AS expenses,
           COALESCE(ps.sales, 0) AS ganancia,
           CASE WHEN COALESCE(ps.sales, 0) > 0 THEN ROUND(100 * COALESCE(ps.sales, 0) / COALESCE(ps.sales, 0), 1) ELSE NULL END AS margen_pct
    FROM hrs
    LEFT JOIN (
      SELECT HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS h,
             SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.h = hrs.h
    ORDER BY hrs.h;

    SELECT COALESCE(ec.name, 'Sin categoría') AS label,
           COALESCE(SUM(e.amount), 0) AS amount
    FROM expense e
    LEFT JOIN expense_category ec ON ec.id = e.category_id
    WHERE DATE(e.expense_date) >= DATE(p_start)
      AND DATE(e.expense_date) <= DATE(p_end)
    GROUP BY ec.id, ec.name
    HAVING COALESCE(SUM(e.amount), 0) > 0
    ORDER BY amount DESC;

    WITH RECURSIVE hrs AS (
      SELECT 0 AS h
      UNION ALL
      SELECT h + 1 FROM hrs WHERE h < 23
    )
    SELECT CONCAT(LPAD(hrs.h, 2, '0'), ':00') AS label,
           COALESCE(pm.margin, 0) AS margin
    FROM hrs
    LEFT JOIN (
      SELECT HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS h,
             COALESCE(SUM(
               sd.quantity * (COALESCE(sd.unit_price, pr.sale_price) - COALESCE(pr.cost_price, 0))
             ), 0) AS margin
      FROM sale s
      INNER JOIN sale_details sd ON sd.sale_id = s.id
      LEFT JOIN product pr ON pr.id = sd.product_id
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pm ON pm.h = hrs.h
    ORDER BY hrs.h;

    WITH RECURSIVE hrs AS (
      SELECT 0 AS h
      UNION ALL
      SELECT h + 1 FROM hrs WHERE h < 23
    )
    SELECT CONCAT(LPAD(hrs.h, 2, '0'), ':00') AS label,
           COALESCE(pa.abonos, 0) AS abonos,
           COALESCE(pf.fiado, 0) AS fiado
    FROM hrs
    LEFT JOIN (
      SELECT HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS h,
             SUM(s.total_amount) AS fiado
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY HOUR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pf ON pf.h = hrs.h
    LEFT JOIN (
      SELECT HOUR(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE)) AS h,
             SUM(ca.amount) AS abonos
      FROM customer_account ca
      WHERE ca.transaction_type = 1
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) <= p_end
      GROUP BY HOUR(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE))
    ) pa ON pa.h = hrs.h
    ORDER BY hrs.h;

  ELSEIF v_g = 'semanal' THEN
    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d, 0 AS i
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY), i + 1 FROM days WHERE i < 6
    )
    SELECT CONCAT(
             CASE WEEKDAY(days.d)
               WHEN 0 THEN 'Lun' WHEN 1 THEN 'Mar' WHEN 2 THEN 'Mié' WHEN 3 THEN 'Jue'
               WHEN 4 THEN 'Vie' WHEN 5 THEN 'Sáb' WHEN 6 THEN 'Dom' ELSE ''
             END,
             ' ',
             DAY(days.d)
           ) AS label,
           COALESCE(ps.sales, 0) AS sales
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.d = days.d
    ORDER BY days.d;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d, 0 AS i
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY), i + 1 FROM days WHERE i < 6
    )
    SELECT CONCAT(
             CASE WEEKDAY(days.d)
               WHEN 0 THEN 'Lun' WHEN 1 THEN 'Mar' WHEN 2 THEN 'Mié' WHEN 3 THEN 'Jue'
               WHEN 4 THEN 'Vie' WHEN 5 THEN 'Sáb' WHEN 6 THEN 'Dom' ELSE ''
             END,
             ' ',
             DAY(days.d)
           ) AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.d = days.d
    LEFT JOIN (
      SELECT DATE(e.expense_date) AS d,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY DATE(e.expense_date)
    ) pe ON pe.d = days.d
    ORDER BY days.d;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d, 0 AS i
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY), i + 1 FROM days WHERE i < 6
    )
    SELECT CONCAT(
             CASE WEEKDAY(days.d)
               WHEN 0 THEN 'Lun' WHEN 1 THEN 'Mar' WHEN 2 THEN 'Mié' WHEN 3 THEN 'Jue'
               WHEN 4 THEN 'Vie' WHEN 5 THEN 'Sáb' WHEN 6 THEN 'Dom' ELSE ''
             END,
             ' ',
             DAY(days.d)
           ) AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses,
           COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0) AS ganancia,
           CASE
             WHEN COALESCE(ps.sales, 0) > 0
             THEN ROUND(100 * (COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0)) / COALESCE(ps.sales, 0), 1)
             ELSE NULL
           END AS margen_pct
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.d = days.d
    LEFT JOIN (
      SELECT DATE(e.expense_date) AS d,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY DATE(e.expense_date)
    ) pe ON pe.d = days.d
    ORDER BY days.d;

    SELECT COALESCE(ec.name, 'Sin categoría') AS label,
           COALESCE(SUM(e.amount), 0) AS amount
    FROM expense e
    LEFT JOIN expense_category ec ON ec.id = e.category_id
    WHERE DATE(e.expense_date) >= DATE(p_start)
      AND DATE(e.expense_date) <= DATE(p_end)
    GROUP BY ec.id, ec.name
    HAVING COALESCE(SUM(e.amount), 0) > 0
    ORDER BY amount DESC;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d, 0 AS i
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY), i + 1 FROM days WHERE i < 6
    )
    SELECT CONCAT(
             CASE WEEKDAY(days.d)
               WHEN 0 THEN 'Lun' WHEN 1 THEN 'Mar' WHEN 2 THEN 'Mié' WHEN 3 THEN 'Jue'
               WHEN 4 THEN 'Vie' WHEN 5 THEN 'Sáb' WHEN 6 THEN 'Dom' ELSE ''
             END,
             ' ',
             DAY(days.d)
           ) AS label,
           COALESCE(pm.margin, 0) AS margin
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d,
             COALESCE(SUM(
               sd.quantity * (COALESCE(sd.unit_price, pr.sale_price) - COALESCE(pr.cost_price, 0))
             ), 0) AS margin
      FROM sale s
      INNER JOIN sale_details sd ON sd.sale_id = s.id
      LEFT JOIN product pr ON pr.id = sd.product_id
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pm ON pm.d = days.d
    ORDER BY days.d;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d, 0 AS i
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY), i + 1 FROM days WHERE i < 6
    )
    SELECT CONCAT(
             CASE WEEKDAY(days.d)
               WHEN 0 THEN 'Lun' WHEN 1 THEN 'Mar' WHEN 2 THEN 'Mié' WHEN 3 THEN 'Jue'
               WHEN 4 THEN 'Vie' WHEN 5 THEN 'Sáb' WHEN 6 THEN 'Dom' ELSE ''
             END,
             ' ',
             DAY(days.d)
           ) AS label,
           COALESCE(pa.abonos, 0) AS abonos,
           COALESCE(pf.fiado, 0) AS fiado
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d,
             SUM(s.total_amount) AS fiado
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pf ON pf.d = days.d
    LEFT JOIN (
      SELECT DATE(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE)) AS d,
             SUM(ca.amount) AS abonos
      FROM customer_account ca
      WHERE ca.transaction_type = 1
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE))
    ) pa ON pa.d = days.d
    ORDER BY days.d;

  ELSEIF v_g = 'mensual' THEN
    WITH RECURSIVE months AS (
      SELECT DATE_FORMAT(p_start, '%Y-%m-01') AS m
      UNION ALL
      SELECT DATE_ADD(m, INTERVAL 1 MONTH)
      FROM months
      WHERE m < DATE_FORMAT(p_end, '%Y-%m-01')
    )
    SELECT DATE_FORMAT(months.m, '%b %y') AS label,
           COALESCE(ps.sales, 0) AS sales
    FROM months
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01') AS ym,
             SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01')
    ) ps ON ps.ym = months.m
    ORDER BY months.m;

    WITH RECURSIVE months AS (
      SELECT DATE_FORMAT(p_start, '%Y-%m-01') AS m
      UNION ALL
      SELECT DATE_ADD(m, INTERVAL 1 MONTH)
      FROM months
      WHERE m < DATE_FORMAT(p_end, '%Y-%m-01')
    )
    SELECT DATE_FORMAT(months.m, '%b %y') AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses
    FROM months
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01') AS ym,
             SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01')
    ) ps ON ps.ym = months.m
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE(e.expense_date), '%Y-%m-01') AS ym,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY DATE_FORMAT(DATE(e.expense_date), '%Y-%m-01')
    ) pe ON pe.ym = months.m
    ORDER BY months.m;

    WITH RECURSIVE months AS (
      SELECT DATE_FORMAT(p_start, '%Y-%m-01') AS m
      UNION ALL
      SELECT DATE_ADD(m, INTERVAL 1 MONTH)
      FROM months
      WHERE m < DATE_FORMAT(p_end, '%Y-%m-01')
    )
    SELECT DATE_FORMAT(months.m, '%b %y') AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses,
           COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0) AS ganancia,
           CASE
             WHEN COALESCE(ps.sales, 0) > 0
             THEN ROUND(100 * (COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0)) / COALESCE(ps.sales, 0), 1)
             ELSE NULL
           END AS margen_pct
    FROM months
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01') AS ym,
             SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01')
    ) ps ON ps.ym = months.m
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE(e.expense_date), '%Y-%m-01') AS ym,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY DATE_FORMAT(DATE(e.expense_date), '%Y-%m-01')
    ) pe ON pe.ym = months.m
    ORDER BY months.m;

    SELECT COALESCE(ec.name, 'Sin categoría') AS label,
           COALESCE(SUM(e.amount), 0) AS amount
    FROM expense e
    LEFT JOIN expense_category ec ON ec.id = e.category_id
    WHERE DATE(e.expense_date) >= DATE(p_start)
      AND DATE(e.expense_date) <= DATE(p_end)
    GROUP BY ec.id, ec.name
    HAVING COALESCE(SUM(e.amount), 0) > 0
    ORDER BY amount DESC;

    WITH RECURSIVE months AS (
      SELECT DATE_FORMAT(p_start, '%Y-%m-01') AS m
      UNION ALL
      SELECT DATE_ADD(m, INTERVAL 1 MONTH)
      FROM months
      WHERE m < DATE_FORMAT(p_end, '%Y-%m-01')
    )
    SELECT DATE_FORMAT(months.m, '%b %y') AS label,
           COALESCE(pm.margin, 0) AS margin
    FROM months
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01') AS ym,
             COALESCE(SUM(
               sd.quantity * (COALESCE(sd.unit_price, pr.sale_price) - COALESCE(pr.cost_price, 0))
             ), 0) AS margin
      FROM sale s
      INNER JOIN sale_details sd ON sd.sale_id = s.id
      LEFT JOIN product pr ON pr.id = sd.product_id
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01')
    ) pm ON pm.ym = months.m
    ORDER BY months.m;

    WITH RECURSIVE months AS (
      SELECT DATE_FORMAT(p_start, '%Y-%m-01') AS m
      UNION ALL
      SELECT DATE_ADD(m, INTERVAL 1 MONTH)
      FROM months
      WHERE m < DATE_FORMAT(p_end, '%Y-%m-01')
    )
    SELECT DATE_FORMAT(months.m, '%b %y') AS label,
           COALESCE(pa.abonos, 0) AS abonos,
           COALESCE(pf.fiado, 0) AS fiado
    FROM months
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01') AS ym,
             SUM(s.total_amount) AS fiado
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE_FORMAT(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE), '%Y-%m-01')
    ) pf ON pf.ym = months.m
    LEFT JOIN (
      SELECT DATE_FORMAT(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE), '%Y-%m-01') AS ym,
             SUM(ca.amount) AS abonos
      FROM customer_account ca
      WHERE ca.transaction_type = 1
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE_FORMAT(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE), '%Y-%m-01')
    ) pa ON pa.ym = months.m
    ORDER BY months.m;

  ELSEIF v_g = 'anual' THEN
    WITH RECURSIVE mm AS (
      SELECT 1 AS mo
      UNION ALL
      SELECT mo + 1 FROM mm WHERE mo < 12
    )
    SELECT CASE mm.mo
             WHEN 1 THEN 'ene.' WHEN 2 THEN 'feb.' WHEN 3 THEN 'mar.' WHEN 4 THEN 'abr.'
             WHEN 5 THEN 'may.' WHEN 6 THEN 'jun.' WHEN 7 THEN 'jul.' WHEN 8 THEN 'ago.'
             WHEN 9 THEN 'sep.' WHEN 10 THEN 'oct.' WHEN 11 THEN 'nov.' WHEN 12 THEN 'dic.'
           END AS label,
           COALESCE(ps.sales, 0) AS sales
    FROM mm
    LEFT JOIN (
      SELECT MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS mo, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND YEAR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) = v_year
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.mo = mm.mo
    ORDER BY mm.mo;

    WITH RECURSIVE mm AS (
      SELECT 1 AS mo
      UNION ALL
      SELECT mo + 1 FROM mm WHERE mo < 12
    )
    SELECT CASE mm.mo
             WHEN 1 THEN 'ene.' WHEN 2 THEN 'feb.' WHEN 3 THEN 'mar.' WHEN 4 THEN 'abr.'
             WHEN 5 THEN 'may.' WHEN 6 THEN 'jun.' WHEN 7 THEN 'jul.' WHEN 8 THEN 'ago.'
             WHEN 9 THEN 'sep.' WHEN 10 THEN 'oct.' WHEN 11 THEN 'nov.' WHEN 12 THEN 'dic.'
           END AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses
    FROM mm
    LEFT JOIN (
      SELECT MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS mo, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND YEAR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) = v_year
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.mo = mm.mo
    LEFT JOIN (
      SELECT MONTH(DATE(e.expense_date)) AS mo,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE YEAR(DATE(e.expense_date)) = v_year
        AND DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY MONTH(DATE(e.expense_date))
    ) pe ON pe.mo = mm.mo
    ORDER BY mm.mo;

    WITH RECURSIVE mm AS (
      SELECT 1 AS mo
      UNION ALL
      SELECT mo + 1 FROM mm WHERE mo < 12
    )
    SELECT CASE mm.mo
             WHEN 1 THEN 'ene.' WHEN 2 THEN 'feb.' WHEN 3 THEN 'mar.' WHEN 4 THEN 'abr.'
             WHEN 5 THEN 'may.' WHEN 6 THEN 'jun.' WHEN 7 THEN 'jul.' WHEN 8 THEN 'ago.'
             WHEN 9 THEN 'sep.' WHEN 10 THEN 'oct.' WHEN 11 THEN 'nov.' WHEN 12 THEN 'dic.'
           END AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses,
           COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0) AS ganancia,
           CASE
             WHEN COALESCE(ps.sales, 0) > 0
             THEN ROUND(100 * (COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0)) / COALESCE(ps.sales, 0), 1)
             ELSE NULL
           END AS margen_pct
    FROM mm
    LEFT JOIN (
      SELECT MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS mo, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND YEAR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) = v_year
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.mo = mm.mo
    LEFT JOIN (
      SELECT MONTH(DATE(e.expense_date)) AS mo,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE YEAR(DATE(e.expense_date)) = v_year
        AND DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY MONTH(DATE(e.expense_date))
    ) pe ON pe.mo = mm.mo
    ORDER BY mm.mo;

    SELECT COALESCE(ec.name, 'Sin categoría') AS label,
           COALESCE(SUM(e.amount), 0) AS amount
    FROM expense e
    LEFT JOIN expense_category ec ON ec.id = e.category_id
    WHERE DATE(e.expense_date) >= DATE(p_start)
      AND DATE(e.expense_date) <= DATE(p_end)
    GROUP BY ec.id, ec.name
    HAVING COALESCE(SUM(e.amount), 0) > 0
    ORDER BY amount DESC;

    WITH RECURSIVE mm AS (
      SELECT 1 AS mo
      UNION ALL
      SELECT mo + 1 FROM mm WHERE mo < 12
    )
    SELECT CASE mm.mo
             WHEN 1 THEN 'ene.' WHEN 2 THEN 'feb.' WHEN 3 THEN 'mar.' WHEN 4 THEN 'abr.'
             WHEN 5 THEN 'may.' WHEN 6 THEN 'jun.' WHEN 7 THEN 'jul.' WHEN 8 THEN 'ago.'
             WHEN 9 THEN 'sep.' WHEN 10 THEN 'oct.' WHEN 11 THEN 'nov.' WHEN 12 THEN 'dic.'
           END AS label,
           COALESCE(pm.margin, 0) AS margin
    FROM mm
    LEFT JOIN (
      SELECT MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS mo,
             COALESCE(SUM(
               sd.quantity * (COALESCE(sd.unit_price, pr.sale_price) - COALESCE(pr.cost_price, 0))
             ), 0) AS margin
      FROM sale s
      INNER JOIN sale_details sd ON sd.sale_id = s.id
      LEFT JOIN product pr ON pr.id = sd.product_id
      WHERE s.payment_method IN ('cash', 'card')
        AND YEAR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) = v_year
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pm ON pm.mo = mm.mo
    ORDER BY mm.mo;

    WITH RECURSIVE mm AS (
      SELECT 1 AS mo
      UNION ALL
      SELECT mo + 1 FROM mm WHERE mo < 12
    )
    SELECT CASE mm.mo
             WHEN 1 THEN 'ene.' WHEN 2 THEN 'feb.' WHEN 3 THEN 'mar.' WHEN 4 THEN 'abr.'
             WHEN 5 THEN 'may.' WHEN 6 THEN 'jun.' WHEN 7 THEN 'jul.' WHEN 8 THEN 'ago.'
             WHEN 9 THEN 'sep.' WHEN 10 THEN 'oct.' WHEN 11 THEN 'nov.' WHEN 12 THEN 'dic.'
           END AS label,
           COALESCE(pa.abonos, 0) AS abonos,
           COALESCE(pf.fiado, 0) AS fiado
    FROM mm
    LEFT JOIN (
      SELECT MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS mo,
             SUM(s.total_amount) AS fiado
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND YEAR(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) = v_year
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY MONTH(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pf ON pf.mo = mm.mo
    LEFT JOIN (
      SELECT MONTH(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE)) AS mo,
             SUM(ca.amount) AS abonos
      FROM customer_account ca
      WHERE ca.transaction_type = 1
        AND YEAR(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE)) = v_year
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) <= p_end
      GROUP BY MONTH(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE))
    ) pa ON pa.mo = mm.mo
    ORDER BY mm.mo;

  ELSE
    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM days WHERE d < DATE(p_end)
    )
    SELECT DATE_FORMAT(days.d, '%d/%m/%y') AS label,
           COALESCE(ps.sales, 0) AS sales
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.d = days.d
    ORDER BY days.d;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM days WHERE d < DATE(p_end)
    )
    SELECT DATE_FORMAT(days.d, '%d/%m/%y') AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.d = days.d
    LEFT JOIN (
      SELECT DATE(e.expense_date) AS d,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY DATE(e.expense_date)
    ) pe ON pe.d = days.d
    ORDER BY days.d;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM days WHERE d < DATE(p_end)
    )
    SELECT DATE_FORMAT(days.d, '%d/%m/%y') AS label,
           COALESCE(ps.sales, 0) AS sales,
           COALESCE(pe.expenses, 0) AS expenses,
           COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0) AS ganancia,
           CASE
             WHEN COALESCE(ps.sales, 0) > 0
             THEN ROUND(100 * (COALESCE(ps.sales, 0) - COALESCE(pe.expenses, 0)) / COALESCE(ps.sales, 0), 1)
             ELSE NULL
           END AS margen_pct
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d, SUM(s.total_amount) AS sales
      FROM sale s
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) ps ON ps.d = days.d
    LEFT JOIN (
      SELECT DATE(e.expense_date) AS d,
             SUM(e.amount) AS expenses
      FROM expense e
      WHERE DATE(e.expense_date) >= DATE(p_start)
        AND DATE(e.expense_date) <= DATE(p_end)
      GROUP BY DATE(e.expense_date)
    ) pe ON pe.d = days.d
    ORDER BY days.d;

    SELECT COALESCE(ec.name, 'Sin categoría') AS label,
           COALESCE(SUM(e.amount), 0) AS amount
    FROM expense e
    LEFT JOIN expense_category ec ON ec.id = e.category_id
    WHERE DATE(e.expense_date) >= DATE(p_start)
      AND DATE(e.expense_date) <= DATE(p_end)
    GROUP BY ec.id, ec.name
    HAVING COALESCE(SUM(e.amount), 0) > 0
    ORDER BY amount DESC;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM days WHERE d < DATE(p_end)
    )
    SELECT DATE_FORMAT(days.d, '%d/%m/%y') AS label,
           COALESCE(pm.margin, 0) AS margin
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d,
             COALESCE(SUM(
               sd.quantity * (COALESCE(sd.unit_price, pr.sale_price) - COALESCE(pr.cost_price, 0))
             ), 0) AS margin
      FROM sale s
      INNER JOIN sale_details sd ON sd.sale_id = s.id
      LEFT JOIN product pr ON pr.id = sd.product_id
      WHERE s.payment_method IN ('cash', 'card')
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pm ON pm.d = days.d
    ORDER BY days.d;

    WITH RECURSIVE days AS (
      SELECT DATE(p_start) AS d
      UNION ALL
      SELECT DATE_ADD(d, INTERVAL 1 DAY) FROM days WHERE d < DATE(p_end)
    )
    SELECT DATE_FORMAT(days.d, '%d/%m/%y') AS label,
           COALESCE(pa.abonos, 0) AS abonos,
           COALESCE(pf.fiado, 0) AS fiado
    FROM days
    LEFT JOIN (
      SELECT DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE)) AS d,
             SUM(s.total_amount) AS fiado
      FROM sale s
      WHERE s.payment_method = 'credit'
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(s.sale_date, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(s.sale_date, INTERVAL v_off MINUTE))
    ) pf ON pf.d = days.d
    LEFT JOIN (
      SELECT DATE(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE)) AS d,
             SUM(ca.amount) AS abonos
      FROM customer_account ca
      WHERE ca.transaction_type = 1
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) >= p_start
        AND DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE) <= p_end
      GROUP BY DATE(DATE_ADD(ca.paid_at, INTERVAL v_off MINUTE))
    ) pa ON pa.d = days.d
    ORDER BY days.d;

  END IF;

END$$

DELIMITER ;

-- CALL sp_reports_full('semanal', '2026-04-13 00:00:00', '2026-04-19 23:59:59', '2026-04-17');
