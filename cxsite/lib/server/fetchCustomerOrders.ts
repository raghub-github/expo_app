import {
  ordersCore,
  ordersCoreItems,
  ordersFood,
  ordersParcel,
  ordersRide,
} from '@/db/hybridOrdersTables'
import type { AppDb } from '@/lib/db'
import { desc, eq, inArray, or, sql } from 'drizzle-orm'

export type CustomerOrderLineItem = {
  name: string
  quantity: number
  /** Unit price (matches customer app OrderSummary.items[].price). */
  price: number
  lineTotal?: number | null
  menuItemId?: string | null
  variantName?: string | null
  customization?: string | null
}

export type CustomerOrderSummary = {
  orderId: string
  coreOrderId: number
  formattedOrderId: string | null
  status: string
  orderType: string
  serviceType: 'food' | 'person' | 'parcel'
  merchantName: string | null
  rideType: string | null
  parcelType: string | null
  pickupAddress: string | null
  dropAddress: string | null
  deliveryAddress: string | null
  totalAmount: number | null
  createdAt: string
  paymentStatus: string | null
  paymentMethod: string | null
  cancellationReason: string | null
  cancelledByLabel: string | null
  items: CustomerOrderLineItem[]
}

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const n = parseFloat(String(v ?? '0'))
  return Number.isFinite(n) ? n : 0
}

function inferServiceType(
  orderType: string,
  hasFoodRow: boolean,
  hasRideRow: boolean,
  hasParcelRow: boolean
): 'food' | 'person' | 'parcel' {
  const t = orderType.trim().toLowerCase()
  if (t === 'food' || hasFoodRow) return 'food'
  if (t === 'person_ride' || t === 'ride' || hasRideRow) return 'person'
  if (t === 'parcel' || hasParcelRow) return 'parcel'
  return 'food'
}

function resolveDisplayStatus(currentStatus: string | null, coreStatus: string | null): string {
  const raw = (currentStatus ?? coreStatus ?? '').trim()
  if (!raw) return 'ORDER_PLACED'
  if (raw === 'PLACED') return 'ORDER_PLACED'
  return raw.toUpperCase().replace(/[\s-]+/g, '_')
}

/** Same shape logic as backend buildCustomerOrderDetailItemsFromJson. */
function parseItemsFromJson(items: unknown): CustomerOrderLineItem[] {
  if (!Array.isArray(items)) return []

  return items
    .map((entry) => {
      const i = entry as {
        name?: string
        item_name?: string
        menuItemId?: string
        item_id?: number
        quantity?: number
        price?: number
        lineTotal?: number
        variantName?: string
        variant?: string | null
        addons?: Array<{ addonName?: string; name?: string; quantity?: number } | string>
      }

      const qty = i.quantity ?? 1
      const unitPrice = num(i.price)
      const lineTotal =
        i.lineTotal != null && Number.isFinite(Number(i.lineTotal))
          ? Number(i.lineTotal)
          : unitPrice * qty

      const name = (i.name ?? i.item_name ?? i.menuItemId ?? '').trim()
      if (!name) return null

      const variantRaw = (i.variantName ?? i.variant ?? '').trim() || null
      const addonParts: string[] = []
      for (const a of i.addons ?? []) {
        if (typeof a === 'string') {
          const t = a.trim()
          if (t) addonParts.push(t)
          continue
        }
        const label = (a.addonName ?? a.name ?? '').trim()
        if (!label) continue
        const aq = a.quantity ?? 1
        addonParts.push(aq > 1 ? `${label} ×${aq}` : label)
      }

      return {
        name,
        quantity: qty,
        price: qty > 0 ? lineTotal / qty : unitPrice,
        lineTotal,
        menuItemId:
          i.menuItemId?.trim() || (i.item_id != null ? String(i.item_id) : null),
        variantName: variantRaw,
        customization: addonParts.length > 0 ? addonParts.join(' · ') : null,
      }
    })
    .filter((x): x is CustomerOrderLineItem => x != null)
}

function parseCoreItemRows(
  rows: Array<{
    itemName: string | null
    quantity: number | null
    totalPrice: unknown
    menuItemId: number | null
    variantName: string | null
  }>
): CustomerOrderLineItem[] {
  return rows
    .map((row) => {
      const name = (row.itemName ?? '').trim()
      if (!name) return null
      const qty = row.quantity ?? 1
      const lineTotal = num(row.totalPrice)
      return {
        name,
        quantity: qty,
        price: lineTotal / Math.max(qty, 1),
        lineTotal,
        menuItemId: row.menuItemId != null ? String(row.menuItemId) : null,
        variantName: row.variantName?.trim() || null,
        customization: null,
      }
    })
    .filter((x): x is CustomerOrderLineItem => x != null)
}

function resolveTotalAmount(row: {
  grandTotal: unknown
  billingSnapshot: unknown
  foodItemsTotal?: unknown
}): number | null {
  if (row.grandTotal != null) {
    const gt = num(row.grandTotal)
    if (gt > 0) return gt
  }

  const snap = row.billingSnapshot
  if (snap && typeof snap === 'object') {
    const o = snap as Record<string, unknown>
    for (const key of ['grandTotal', 'totalPayable', 'total_payable', 'totalAmount']) {
      if (o[key] != null) {
        const v = num(o[key])
        if (v > 0) return v
      }
    }
  }

  if (row.foodItemsTotal != null) {
    const v = num(row.foodItemsTotal)
    if (v > 0) return v
  }

  return row.grandTotal != null ? num(row.grandTotal) : null
}

export async function fetchCustomerOrders(
  db: AppDb,
  customerPk: number,
  limit = 50
): Promise<CustomerOrderSummary[]> {
  const pageRows = await db
    .select({
      id: ordersCore.id,
      orderId: ordersCore.orderId,
      formattedOrderId: ordersCore.formattedOrderId,
      orderType: ordersCore.orderType,
      pickupAddressRaw: ordersCore.pickupAddressRaw,
      dropAddressRaw: ordersCore.dropAddressRaw,
      deliveryAddress: ordersCore.deliveryAddress,
      status: ordersCore.status,
      currentStatus: ordersCore.currentStatus,
      grandTotal: ordersCore.grandTotal,
      placedAt: ordersCore.placedAt,
      createdAt: ordersCore.createdAt,
      items: ordersCore.items,
      paymentStatus: ordersCore.paymentStatus,
      paymentMethod: ordersCore.paymentMethod,
      billingSnapshot: ordersCore.billingSnapshot,
    })
    .from(ordersCore)
    .where(eq(ordersCore.customerId, customerPk))
    .orderBy(desc(ordersCore.placedAt), desc(ordersCore.createdAt))
    .limit(limit)

  if (!pageRows.length) return []

  const corePks = pageRows.map((r) => r.id)
  const orderIdTexts = pageRows
    .map((r) => r.orderId)
    .filter((id): id is string => Boolean(id?.trim()))

  const foodCoreRows = pageRows.filter((r) => r.orderType === 'food')
  const foodCorePks = foodCoreRows.map((r) => r.id)
  const foodOrderIdTexts = [
    ...new Set(
      foodCoreRows
        .map((r) => r.orderId?.trim())
        .filter((id): id is string => Boolean(id))
    ),
  ]

  const [foodRows, rideRows, parcelRows, coreItemRows] = await Promise.all([
    foodCorePks.length
      ? db
          .select({
            orderId: ordersFood.orderId,
            coreOrderId: ordersFood.coreOrderId,
            restaurantName: ordersFood.restaurantName,
            rejectedReason: ordersFood.rejectedReason,
            cancelledByLabel: ordersFood.cancelledByLabel,
            foodItemsTotalValue: ordersFood.foodItemsTotalValue,
          })
          .from(ordersFood)
          .where(
            foodOrderIdTexts.length > 0
              ? or(
                  inArray(ordersFood.orderId, foodCorePks),
                  sql`${ordersFood.coreOrderId}::text IN (${sql.join(
                    foodOrderIdTexts.map((id) => sql`${id}`),
                    sql`, `
                  )})`
                )
              : inArray(ordersFood.orderId, foodCorePks)
          )
      : Promise.resolve([]),
    db
      .select({
        orderId: ordersRide.orderId,
        rideType: ordersRide.rideType,
        pickupAddress: ordersRide.pickupAddress,
        dropAddress: ordersRide.dropAddress,
      })
      .from(ordersRide)
      .where(inArray(ordersRide.orderId, corePks)),
    db
      .select({
        orderId: ordersParcel.orderId,
        parcelType: ordersParcel.parcelType,
      })
      .from(ordersParcel)
      .where(inArray(ordersParcel.orderId, corePks)),
    orderIdTexts.length
      ? db
          .select({
            orderId: ordersCoreItems.orderId,
            itemName: ordersCoreItems.itemName,
            quantity: ordersCoreItems.quantity,
            totalPrice: ordersCoreItems.totalPrice,
            menuItemId: ordersCoreItems.menuItemId,
            variantName: ordersCoreItems.variantName,
          })
          .from(ordersCoreItems)
          .where(inArray(ordersCoreItems.orderId, orderIdTexts))
      : Promise.resolve([]),
  ])

  const foodByPk = new Map<number, (typeof foodRows)[number]>()
  for (const core of foodCoreRows) {
    const textId = core.orderId?.trim() ?? null
    const hit = foodRows.find(
      (f) =>
        Number(f.orderId) === core.id ||
        (textId != null && String(f.coreOrderId ?? '').trim() === textId)
    )
    if (hit) foodByPk.set(core.id, hit)
  }
  const rideByPk = new Map(rideRows.map((r) => [Number(r.orderId), r] as const))
  const parcelByPk = new Map(parcelRows.map((r) => [Number(r.orderId), r] as const))
  const coreItemsByOrderId = new Map<string, typeof coreItemRows>()
  for (const item of coreItemRows) {
    const key = item.orderId ?? ''
    if (!key) continue
    const list = coreItemsByOrderId.get(key) ?? []
    list.push(item)
    coreItemsByOrderId.set(key, list)
  }

  return pageRows.map((row) => {
    const food = foodByPk.get(row.id)
    const ride = rideByPk.get(row.id)
    const parcel = parcelByPk.get(row.id)
    const orderIdDisplay = row.orderId ?? String(row.id)
    const at = row.placedAt ?? row.createdAt ?? new Date().toISOString()

    const dbItems = row.orderId
      ? parseCoreItemRows(coreItemsByOrderId.get(row.orderId) ?? [])
      : []
    const jsonItems = parseItemsFromJson(row.items)
    const items = dbItems.length > 0 ? dbItems : jsonItems

    return {
      orderId: orderIdDisplay,
      coreOrderId: row.id,
      formattedOrderId: row.formattedOrderId ?? orderIdDisplay,
      status: resolveDisplayStatus(row.currentStatus, row.status),
      orderType: row.orderType,
      serviceType: inferServiceType(
        row.orderType,
        Boolean(food),
        Boolean(ride),
        Boolean(parcel)
      ),
      merchantName: food?.restaurantName ?? null,
      rideType: ride?.rideType ?? null,
      parcelType: parcel?.parcelType ?? null,
      pickupAddress: ride?.pickupAddress ?? row.pickupAddressRaw ?? null,
      dropAddress: ride?.dropAddress ?? row.dropAddressRaw ?? null,
      deliveryAddress: row.deliveryAddress ?? row.dropAddressRaw ?? null,
      totalAmount: resolveTotalAmount({
        grandTotal: row.grandTotal,
        billingSnapshot: row.billingSnapshot,
        foodItemsTotal: food?.foodItemsTotalValue,
      }),
      createdAt: at,
      paymentStatus: row.paymentStatus ?? null,
      paymentMethod: row.paymentMethod ?? null,
      cancellationReason: food?.rejectedReason ?? null,
      cancelledByLabel: food?.cancelledByLabel ?? null,
      items,
    }
  })
}
