const dashboardRepository = require('../repositories/dashboard.repository')

const CHART_DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function startOfWeekMonday(ref) {
  const d = new Date(ref.getTime())
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(d, n) {
  const x = new Date(d.getTime())
  x.setDate(x.getDate() + n)
  return x
}

function ymdLocal(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dateKeyFromRow(dVal) {
  if (!dVal) return ''
  if (dVal instanceof Date) {
    return ymdLocal(dVal)
  }
  const s = String(dVal)
  return s.length >= 10 ? s.slice(0, 10) : s
}

function paymentLabelDb(code) {
  const c = String(code ?? '').toLowerCase()
  if (c === 'card') return 'Tarjeta'
  if (c === 'credit') return 'Fiado'
  return 'Efectivo'
}

exports.getSummary = async () => {
  const now = new Date()
  const weekStart = startOfWeekMonday(now)
  const weekEndExclusive = addDays(weekStart, 7)
  const prevWeekStart = addDays(weekStart, -7)

  const [salesWeekTotal, salesPrevWeekTotal, byDayRows, receivableTotal, receivableCustomersCount] =
    await Promise.all([
      dashboardRepository.sumSalesBetween(weekStart, weekEndExclusive),
      dashboardRepository.sumSalesBetween(prevWeekStart, weekStart),
      dashboardRepository.salesByDayBetween(weekStart, weekEndExclusive),
      dashboardRepository.sumCreditSalesTotal(),
      dashboardRepository.countCustomersWithCreditSales()
    ])

  const byDay = new Map()
  for (const r of byDayRows) {
    const key = dateKeyFromRow(r.d ?? r.D)
    byDay.set(key, Number(r.total ?? r.TOTAL ?? 0))
  }

  const salesChart = []
  for (let i = 0; i < 7; i += 1) {
    const day = addDays(weekStart, i)
    const key = ymdLocal(day)
    salesChart.push({
      day: CHART_DAY_LABELS[i],
      sales: Number(byDay.get(key) ?? 0)
    })
  }

  let weekOverWeekPct = null
  if (salesPrevWeekTotal > 0.0001) {
    weekOverWeekPct =
      Math.round(((salesWeekTotal - salesPrevWeekTotal) / salesPrevWeekTotal) * 1000) / 10
  }

  const [lowStockRows, recentSales, recentExpenses] = await Promise.all([
    dashboardRepository.listLowStockProducts(20),
    dashboardRepository.listRecentSales(8),
    dashboardRepository.listRecentExpenses(6)
  ])

  const lowStock = lowStockRows.map((r) => ({
    id: Number(r.id),
    name: r.name != null ? String(r.name) : '',
    categoryName: r.category_name != null ? String(r.category_name) : '',
    quantity: Number(r.quantity ?? 0),
    minStock: Number(r.min_stock ?? 0)
  }))

  const activity = []

  for (const s of recentSales) {
    const at = s.sale_date instanceof Date ? s.sale_date.toISOString() : String(s.sale_date ?? '')
    const amount = Number(s.total_amount ?? s.TOTAL_AMOUNT ?? 0)
    const cust = s.customer_name != null ? String(s.customer_name).trim() : ''
    activity.push({
      type: 'sale',
      occurredAt: at,
      amount,
      paymentLabel: paymentLabelDb(s.payment_method ?? s.PAYMENT_METHOD),
      detail: cust || 'Cliente general'
    })
  }

  for (const e of recentExpenses) {
    const ed = e.expense_date
    let iso
    if (ed instanceof Date) {
      iso = ed.toISOString()
    } else if (typeof ed === 'string') {
      iso = `${ed.slice(0, 10)}T12:00:00.000Z`
    } else {
      iso = new Date().toISOString()
    }
    activity.push({
      type: 'expense',
      occurredAt: iso,
      amount: Number(e.amount ?? 0),
      detail: e.category_name != null ? String(e.category_name) : 'Gasto',
      note: e.note != null ? String(e.note).trim() : ''
    })
  }

  activity.sort((a, b) => {
    const ta = Date.parse(a.occurredAt) || 0
    const tb = Date.parse(b.occurredAt) || 0
    return tb - ta
  })

  const activityTrimmed = activity.slice(0, 10)

  return {
    weekStart: ymdLocal(weekStart),
    weekEnd: ymdLocal(addDays(weekStart, 6)),
    salesWeekTotal,
    salesPrevWeekTotal,
    weekOverWeekPct,
    salesChart,
    receivableTotal,
    receivableCustomersCount,
    lowStock,
    activity: activityTrimmed
  }
}
