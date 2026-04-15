const salesRepository = require('../repositories/sales.repository')
const customersService = require('./customers.service')
const { badRequest, notFound } = require('../utils/httpError')

function normalizeSaleLine(line) {
  if (!line || typeof line !== 'object') {
    return null
  }
  const productId = Number(line.productId ?? line.product_id)
  const quantity = Number(line.quantity)
  const unitPriceRaw = line.unitPrice ?? line.unit_price
  const unitPrice =
    unitPriceRaw != null && unitPriceRaw !== '' ? Number(unitPriceRaw) : null
  return { productId, quantity, unitPrice }
}

async function prepareSalePayload(data) {
  if (!data.products || !Array.isArray(data.products) || data.products.length === 0) {
    throw badRequest('Debe incluir productos en la venta')
  }

  const products = []
  for (const line of data.products) {
    const n = normalizeSaleLine(line)
    if (!n || !Number.isFinite(n.productId) || n.productId <= 0) {
      throw badRequest('Cada línea debe incluir productId válido')
    }
    if (!Number.isFinite(n.quantity) || n.quantity <= 0) {
      throw badRequest('Cada línea debe incluir quantity mayor a cero')
    }
    const row = { productId: n.productId, quantity: n.quantity }
    if (n.unitPrice != null && Number.isFinite(n.unitPrice)) {
      row.unitPrice = n.unitPrice
    }
    products.push(row)
  }

  let employeeId =
    data.employeeId != null && data.employeeId !== ''
      ? Number(data.employeeId)
      : null
  if (employeeId == null || !Number.isFinite(employeeId) || employeeId <= 0) {
    employeeId = await salesRepository.getDefaultEmployeeId()
  }
  if (employeeId == null) {
    throw badRequest(
      'No hay empleado activo en el sistema. Envíe employeeId en el cuerpo de la venta.'
    )
  }

  const customerId =
    data.customerId != null && data.customerId !== ''
      ? Number(data.customerId)
      : null
  if (
    customerId != null &&
    (!Number.isFinite(customerId) || customerId <= 0)
  ) {
    throw badRequest('customerId inválido')
  }

  const total =
    data.total != null && data.total !== '' ? Number(data.total) : null
  if (total != null && !Number.isFinite(total)) {
    throw badRequest('total inválido')
  }

  const paymentRaw =
    data.paymentMethod != null ? String(data.paymentMethod).trim().toLowerCase() : ''
  const paymentMethod =
    paymentRaw === '' ? 'efectivo' : paymentRaw

  const isCredit =
    paymentMethod === 'fiado' ||
    paymentMethod === 'credito' ||
    paymentMethod === 'crédito' ||
    paymentMethod === 'credit'

  if (
    isCredit &&
    (customerId == null || !Number.isFinite(customerId) || customerId <= 0)
  ) {
    throw badRequest('Debe seleccionar un cliente para venta al fiado.')
  }

  return {
    customerId: customerId != null && Number.isFinite(customerId) ? customerId : null,
    employeeId,
    products,
    total: total != null && Number.isFinite(total) ? total : null,
    paymentMethod
  }
}

function handleSaleProcedureError(e) {
  if (e && typeof e.sqlMessage !== 'string' && typeof e.statusCode === 'number') {
    throw e
  }
  const msg = typeof e.sqlMessage === 'string' ? e.sqlMessage : String(e.message ?? '')
  if (msg.includes('venta no encontrada')) {
    throw notFound('Venta no encontrada')
  }
  if (msg.includes('stock insuficiente') || msg.includes('sin inventario')) {
    throw badRequest('Stock insuficiente para completar la venta.')
  }
  if (msg.includes('total no coincide')) {
    throw badRequest('El total enviado no coincide con precios y cantidades.')
  }
  if (msg.includes('producto inválido') || msg.includes('inactivo')) {
    throw badRequest('Hay productos inválidos o inactivos en el carrito.')
  }
  if (msg.includes('empleado')) {
    throw badRequest('Empleado no válido para registrar la venta.')
  }
  if (msg.includes('JSON de productos')) {
    throw badRequest('Formato de productos inválido.')
  }
  if (msg.includes('customer_id requerido') || msg.includes('crédito')) {
    throw badRequest('Debe seleccionar un cliente para venta al fiado.')
  }
  if (msg.includes('Unknown column') && msg.toLowerCase().includes('unit_price')) {
    throw badRequest(
      'Falta la columna unit_price en sale_details. Ejecute en MySQL: ALTER TABLE sale_details ADD COLUMN unit_price NUMERIC(14,4) NULL AFTER quantity;'
    )
  }
  if (msg.includes('doesn\'t exist') || msg.includes('no existe la tabla')) {
    throw badRequest(
      'Error de base de datos: verifique que existan las tablas sale, sale_details y los procedimientos de venta.'
    )
  }
  throw e
}

exports.createSale = async (data) => {
  const payload = await prepareSalePayload(data)
  try {
    const result = await salesRepository.createSale(payload)

    if (result.saleId == null) {
      throw badRequest(
        'No se recibió el id de la venta. Revise sale_details.unit_price (db/fix_sale_details_unit_price.sql) y que sp_sale_create esté actualizado.'
      )
    }

    return result
  } catch (e) {
    handleSaleProcedureError(e)
  }
}

exports.updateSale = async (saleId, data) => {
  const id = Number(saleId)
  if (!Number.isFinite(id) || id <= 0) {
    throw badRequest('Identificador de venta inválido')
  }
  const payload = await prepareSalePayload(data)
  try {
    const result = await salesRepository.updateSale({ saleId: id, ...payload })
    if (result.saleId == null) {
      throw badRequest(
        'No se recibió confirmación de la venta. Revise sp_sale_update y sale_details.unit_price.'
      )
    }
    return result
  } catch (e) {
    handleSaleProcedureError(e)
  }
}

exports.deleteSale = async (saleId) => {
  const id = Number(saleId)
  if (!Number.isFinite(id) || id <= 0) {
    throw badRequest('Identificador de venta inválido')
  }
  try {
    await salesRepository.deleteSale(id)
  } catch (e) {
    handleSaleProcedureError(e)
  }
}

function mapSaleHeaderRow(r) {
  return {
    id: Number(r.id),
    customerId:
      r.customer_id != null && r.customer_id !== ''
        ? Number(r.customer_id)
        : null,
    customerName:
      r.customer_name != null && String(r.customer_name).trim() !== ''
        ? String(r.customer_name)
        : null,
    employeeId: Number(r.employee_id),
    employeeName: r.employee_name != null ? String(r.employee_name) : '',
    saleDate: r.sale_date,
    totalAmount: Number(r.total_amount ?? 0),
    paymentMethod: String(r.payment_method ?? 'cash'),
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }
}

exports.listSalesByDateRange = async (dateStart, dateEnd) => {
  const rows = await salesRepository.listSalesByDateRange(dateStart, dateEnd)
  return (Array.isArray(rows) ? rows : []).map(mapSaleHeaderRow)
}

exports.getSaleDetail = async (saleId) => {
  const { header, lines } = await salesRepository.getSaleWithLines(saleId)
  if (!header) {
    const { notFound } = require('../utils/httpError')
    throw notFound('Venta no encontrada')
  }
  const mappedLines = (Array.isArray(lines) ? lines : []).map((l) => ({
    productId: l.product_id != null ? Number(l.product_id) : null,
    productName:
      l.product_name != null ? String(l.product_name) : '',
    quantity: Number(l.quantity ?? 0),
    unitPrice: Number(l.unit_price ?? 0),
    productCostPrice:
      l.product_cost_price != null ? Number(l.product_cost_price) : null
  }))
  return {
    sale: mapSaleHeaderRow(header),
    lines: mappedLines
  }
}

exports.getDaySummary = async (dateYmd) => {
  const row = await salesRepository.getDayCashTotals(dateYmd)
  if (!row) {
    return {
      paidSalesTotal: 0,
      creditSalesTotal: 0,
      abonosTotal: 0,
      cashInflowDay: 0
    }
  }
  return {
    paidSalesTotal: Number(
      row.paid_sales_total ?? row.PAID_SALES_TOTAL ?? 0
    ),
    creditSalesTotal: Number(
      row.credit_sales_total ?? row.CREDIT_SALES_TOTAL ?? 0
    ),
    abonosTotal: Number(row.abonos_total ?? row.ABONOS_TOTAL ?? 0),
    cashInflowDay: Number(row.cash_inflow_day ?? row.CASH_INFLOW_DAY ?? 0)
  }
}

function groupSalesWithLines(rows) {
  const map = new Map()
  for (const r of rows) {
    const sid = Number(r.id)
    if (!Number.isFinite(sid)) continue
    if (!map.has(sid)) {
      map.set(sid, {
        id: sid,
        customerId:
          r.customer_id != null && r.customer_id !== ''
            ? Number(r.customer_id)
            : null,
        customerName:
          r.customer_name != null && String(r.customer_name).trim() !== ''
            ? String(r.customer_name)
            : null,
        employeeId: Number(r.employee_id),
        employeeName: r.employee_name != null ? String(r.employee_name) : '',
        saleDate: r.sale_date,
        totalAmount: Number(r.total_amount ?? 0),
        paymentMethod: String(r.payment_method ?? 'cash'),
        items: []
      })
    }
    map.get(sid).items.push({
      name: String(r.product_name ?? ''),
      quantity: Number(r.quantity ?? 0),
      price: Number(r.unit_price ?? 0)
    })
  }
  return Array.from(map.values())
}

exports.listHistoryBundle = async (dateStart, dateEnd) => {
  const rawRows = await salesRepository.listSalesWithLinesForRange(
    dateStart,
    dateEnd
  )
  const sales = groupSalesWithLines(rawRows)
  const abonos = await customersService.listAbonosByDateRange(dateStart, dateEnd)
  return { sales, abonos }
}

function roundMoney(x) {
  return Math.round(Number(x) * 100) / 100
}

function paidAtToYmd(paidAt) {
  if (!paidAt) return ''
  const d = paidAt instanceof Date ? paidAt : new Date(paidAt)
  if (Number.isNaN(d.getTime())) {
    const s = String(paidAt)
    return s.length >= 10 ? s.slice(0, 10) : s
  }
  const tz = process.env.DB_TIMEZONE || 'America/Guatemala'
  try {
    return d.toLocaleDateString('en-CA', { timeZone: tz })
  } catch {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
}

/**
 * Desglose del periodo: ventas cobradas (efectivo/tarjeta) con costo y margen,
 * más abonos del periodo repartidos FIFO contra facturas al fiado (capital vs ganancia).
 */
exports.getPeriodFinancialBreakdown = async (dateStart, dateEnd) => {
  const ds = String(dateStart ?? '').trim()
  const de = String(dateEnd ?? '').trim()
  if (!ds || !de || de < ds) {
    throw badRequest('Parámetros dateStart y dateEnd inválidos')
  }

  const paid = await salesRepository.getPaidSalesRevenueCostMarginInRange(ds, de)
  const invRows = await salesRepository.listCreditInvoicesWithCost()
  const abonoRows = await salesRepository.listAllAbonosChronological()

  const queues = new Map()
  for (const row of invRows) {
    const cid = Number(row.customer_id ?? row.CUSTOMER_ID)
    if (!Number.isFinite(cid) || cid <= 0) continue
    if (!queues.has(cid)) queues.set(cid, [])
    const invoiceTotal = roundMoney(row.invoice_total ?? row.INVOICE_TOTAL ?? 0)
    const linesCost = roundMoney(row.lines_cost ?? row.LINES_COST ?? 0)
    queues.get(cid).push({
      invoiceTotal,
      linesCost,
      remaining: invoiceTotal
    })
  }

  let abonoCount = 0
  let abonoCash = 0
  let abonoCostRecovery = 0
  let abonoMarginRecovery = 0

  for (const a of abonoRows) {
    const cid = Number(a.customer_id ?? a.CUSTOMER_ID)
    let amt = roundMoney(a.amount ?? a.AMOUNT ?? 0)
    if (!Number.isFinite(amt) || amt <= 0) continue
    const origAmt = amt
    const q = queues.get(cid)
    let costPart = 0
    let marginPart = 0
    if (q && q.length > 0) {
      while (amt > 0.0001 && q.length > 0) {
        const inv = q[0]
        const pay = roundMoney(Math.min(amt, inv.remaining))
        const denom = inv.invoiceTotal > 0 ? inv.invoiceTotal : 1
        const c = roundMoney(pay * (inv.linesCost / denom))
        costPart += c
        marginPart += roundMoney(pay - c)
        inv.remaining = roundMoney(inv.remaining - pay)
        amt = roundMoney(amt - pay)
        if (inv.remaining <= 0.0001) q.shift()
      }
    }
    if (amt > 0.0001) {
      marginPart += amt
    }
    const ymd = paidAtToYmd(a.paid_at ?? a.PAID_AT)
    if (ymd && ymd >= ds && ymd <= de) {
      abonoCount += 1
      abonoCash += origAmt
      abonoCostRecovery += costPart
      abonoMarginRecovery += marginPart
    }
  }

  abonoCash = roundMoney(abonoCash)
  abonoCostRecovery = roundMoney(abonoCostRecovery)
  abonoMarginRecovery = roundMoney(abonoMarginRecovery)

  const paidRev = roundMoney(paid.revenue)
  const paidCost = roundMoney(paid.cost)
  const paidMargin = roundMoney(paid.margin)

  return {
    dateStart: ds,
    dateEnd: de,
    paidSales: {
      count: paid.saleCount,
      revenue: paidRev,
      cost: paidCost,
      margin: paidMargin
    },
    abonosInPeriod: {
      count: abonoCount,
      cash: abonoCash,
      costRecovery: abonoCostRecovery,
      marginRecovery: abonoMarginRecovery
    },
    totals: {
      revenue: roundMoney(paidRev + abonoCash),
      cost: roundMoney(paidCost + abonoCostRecovery),
      margin: roundMoney(paidMargin + abonoMarginRecovery)
    }
  }
}
