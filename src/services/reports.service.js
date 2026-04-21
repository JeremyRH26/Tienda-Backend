const reportsRepository = require('../repositories/reports.repository')

const ALLOWED = new Set(['diario', 'semanal', 'mensual', 'anual', 'rango'])

function num(v, fallback = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

function mapIndicators(row) {
  if (!row || typeof row !== 'object') {
    return null
  }
  const totalMargen = num(row.total_margen ?? row.TOTAL_MARGEN)
  const totalGastos = num(row.total_gastos ?? row.TOTAL_GASTOS)
  return {
    totalCobrado: num(row.total_cobrado ?? row.TOTAL_COBRADO),
    totalCosto: num(row.total_costo ?? row.TOTAL_COSTO),
    totalMargen,
    totalGastos,
    totalAbonos: num(row.total_abonos ?? row.TOTAL_ABONOS),
    totalFiado: num(row.total_fiado ?? row.TOTAL_FIADO),
    countVentas: num(row.count_ventas ?? row.COUNT_VENTAS),
    countFiado: num(row.count_fiado ?? row.COUNT_FIADO),
    resultadoOperativo: num(
      row.resultado_operativo ?? row.RESULTADO_OPERATIVO,
      totalMargen - totalGastos
    )
  }
}

function mapChartRow(r) {
  return {
    label: r.label != null ? String(r.label) : r.LABEL != null ? String(r.LABEL) : '',
    sales: num(r.sales ?? r.SALES)
  }
}

function mapVsRow(r) {
  return {
    label: r.label != null ? String(r.label) : r.LABEL != null ? String(r.LABEL) : '',
    sales: num(r.sales ?? r.SALES),
    expenses: num(r.expenses ?? r.EXPENSES)
  }
}

function mapDesgloseRow(r) {
  const sales = num(r.sales ?? r.SALES)
  const mp = r.margen_pct ?? r.MARGEN_PCT
  return {
    label: r.label != null ? String(r.label) : r.LABEL != null ? String(r.LABEL) : '',
    ventasCobradas: sales,
    gastos: num(r.expenses ?? r.EXPENSES),
    ganancia: num(r.ganancia ?? r.GANANCIA),
    margenPct: mp != null && mp !== '' ? num(mp) : null
  }
}

function mapGastosPorTipoRow(r) {
  return {
    label: r.label != null ? String(r.label) : r.LABEL != null ? String(r.LABEL) : '',
    amount: num(r.amount ?? r.AMOUNT)
  }
}

function mapMargenSerieRow(r) {
  return {
    label: r.label != null ? String(r.label) : r.LABEL != null ? String(r.LABEL) : '',
    margin: num(r.margin ?? r.MARGIN)
  }
}

function mapFiadoAbonosRow(r) {
  return {
    label: r.label != null ? String(r.label) : r.LABEL != null ? String(r.LABEL) : '',
    abonos: num(r.abonos ?? r.ABONOS),
    fiado: num(r.fiado ?? r.FIADO)
  }
}

exports.getFullReport = async ({
  grouping,
  startDate,
  endDate,
  refDate
}) => {
  const g = String(grouping || '')
    .trim()
    .toLowerCase()
  if (!ALLOWED.has(g)) {
    const err = new Error(
      'grouping debe ser diario, semanal, mensual, anual o rango'
    )
    err.statusCode = 400
    throw err
  }
  if (!startDate || !endDate) {
    const err = new Error('startDate y endDate son obligatorios')
    err.statusCode = 400
    throw err
  }

  const {
    indicatorsRow,
    tendencia,
    ventasVsGastos,
    desglose,
    gastosPorTipo,
    margenSerie,
    fiadoAbonosSerie
  } = await reportsRepository.callReportsFull({
    grouping: g,
    startDateTime: startDate,
    endDateTime: endDate,
    refDate: refDate || null
  })

  return {
    grouping: g,
    startDate,
    endDate,
    refDate: refDate || null,
    indicators: mapIndicators(indicatorsRow),
    tendencia: (tendencia || []).map(mapChartRow),
    ventasVsGastos: (ventasVsGastos || []).map(mapVsRow),
    desglose: (desglose || []).map(mapDesgloseRow),
    gastosPorTipo: (gastosPorTipo || []).map(mapGastosPorTipoRow),
    margenSerie: (margenSerie || []).map(mapMargenSerieRow),
    fiadoAbonosSerie: (fiadoAbonosSerie || []).map(mapFiadoAbonosRow)
  }
}
