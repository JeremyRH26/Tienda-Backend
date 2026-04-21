const db = require('../db/db')

function procedureResultSets(sets) {
  if (!Array.isArray(sets)) {
    return []
  }
  return sets.filter((s) => Array.isArray(s))
}

/**
 * CALL sp_reports_full → 7 SELECTs (…, margenSerie, fiadoAbonosSerie).
 */
exports.callReportsFull = async ({ grouping, startDateTime, endDateTime, refDate }) => {
  const [raw] = await db.query('CALL sp_reports_full(?, ?, ?, ?)', [
    String(grouping),
    startDateTime,
    endDateTime,
    refDate
  ])
  const parts = procedureResultSets(raw)
  return {
    indicatorsRow: parts[0]?.[0] ?? null,
    tendencia: parts[1] ?? [],
    ventasVsGastos: parts[2] ?? [],
    desglose: parts[3] ?? [],
    gastosPorTipo: parts[4] ?? [],
    margenSerie: parts[5] ?? [],
    fiadoAbonosSerie: parts[6] ?? []
  }
}
