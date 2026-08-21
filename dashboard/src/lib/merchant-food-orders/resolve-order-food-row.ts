import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedMerchantFoodOrder = {
  coreOrderId: number;
  foodRowId: number | null;
};

type FoodLookupRow = {
  id: number;
  order_id: number | null;
  core_order_id: string | null;
  merchant_store_id?: number | null;
};

/** Same as DB function orders_food_resolve_core_pk — orders_core.id bigint PK. */
async function resolveCorePkFromFoodRow(
  db: SupabaseClient,
  food: FoodLookupRow
): Promise<number | null> {
  if (food.order_id != null && Number.isFinite(Number(food.order_id))) {
    return Number(food.order_id);
  }
  const textId = (food.core_order_id ?? "").trim();
  if (!textId) return null;
  const { data: core } = await db
    .from("orders_core")
    .select("id")
    .eq("order_id", textId)
    .maybeSingle();
  return core?.id != null ? Number(core.id) : null;
}

async function coreBelongsToStore(
  db: SupabaseClient,
  coreOrderPk: number,
  merchantStoreInternalId: number
): Promise<boolean> {
  const { data: core } = await db
    .from("orders_core")
    .select("merchant_store_id")
    .eq("id", coreOrderPk)
    .maybeSingle();
  return !!core && Number(core.merchant_store_id) === merchantStoreInternalId;
}

function foodBelongsToStore(
  food: FoodLookupRow | null | undefined,
  merchantStoreInternalId: number
): boolean {
  if (food?.merchant_store_id == null) return false;
  return Number(food.merchant_store_id) === merchantStoreInternalId;
}

/**
 * Resolve dashboard order URL param to orders_core.id (for order_timelines.order_id).
 * Matches partnersite timeline lookup, with store ownership verified on orders_core only.
 */
export async function resolveMerchantFoodOrder(
  db: SupabaseClient,
  merchantStoreInternalId: number,
  orderIdParam: number
): Promise<ResolvedMerchantFoodOrder | null> {
  const finish = async (
    food: FoodLookupRow | null,
    corePk: number | null
  ): Promise<ResolvedMerchantFoodOrder | null> => {
    const foodOk = foodBelongsToStore(food, merchantStoreInternalId);
    const resolvedCore =
      corePk != null && Number.isFinite(corePk)
        ? corePk
        : food?.order_id != null && Number.isFinite(Number(food.order_id))
          ? Number(food.order_id)
          : null;
    if (resolvedCore == null) return null;
    const storeOk =
      foodOk || (await coreBelongsToStore(db, resolvedCore, merchantStoreInternalId));
    if (!storeOk) return null;
    return {
      coreOrderId: resolvedCore,
      foodRowId: food ? Number(food.id) : null,
    };
  };

  const foodSelect = "id, order_id, core_order_id, merchant_store_id";

  // 1) partnersite path: orders_food.id (prefer this store)
  const { data: byFoodIdStore } = await db
    .from("orders_food")
    .select(foodSelect)
    .eq("id", orderIdParam)
    .eq("merchant_store_id", merchantStoreInternalId)
    .maybeSingle();
  if (byFoodIdStore) {
    const corePk = await resolveCorePkFromFoodRow(db, byFoodIdStore as FoodLookupRow);
    const done = await finish(byFoodIdStore as FoodLookupRow, corePk);
    if (done) return done;
  }

  const { data: byFoodId } = await db
    .from("orders_food")
    .select(foodSelect)
    .eq("id", orderIdParam)
    .maybeSingle();

  if (byFoodId) {
    const corePk = await resolveCorePkFromFoodRow(db, byFoodId as FoodLookupRow);
    const done = await finish(byFoodId as FoodLookupRow, corePk);
    if (done) return done;
  }

  // 2) orders_food.order_id = orders_core.id
  const { data: byFoodCoreFkStore } = await db
    .from("orders_food")
    .select(foodSelect)
    .eq("order_id", orderIdParam)
    .eq("merchant_store_id", merchantStoreInternalId)
    .maybeSingle();
  if (byFoodCoreFkStore) {
    const corePk =
      (await resolveCorePkFromFoodRow(db, byFoodCoreFkStore as FoodLookupRow)) ?? orderIdParam;
    const done = await finish(byFoodCoreFkStore as FoodLookupRow, corePk);
    if (done) return done;
  }

  const { data: byFoodCoreFk } = await db
    .from("orders_food")
    .select(foodSelect)
    .eq("order_id", orderIdParam)
    .maybeSingle();

  if (byFoodCoreFk) {
    const corePk =
      (await resolveCorePkFromFoodRow(db, byFoodCoreFk as FoodLookupRow)) ?? orderIdParam;
    const done = await finish(byFoodCoreFk as FoodLookupRow, corePk);
    if (done) return done;
  }

  // 3) orders_core.id only (core-only row in UI)
  if (await coreBelongsToStore(db, orderIdParam, merchantStoreInternalId)) {
    const { data: foodForCore } = await db
      .from("orders_food")
      .select(foodSelect)
      .eq("order_id", orderIdParam)
      .maybeSingle();
    if (foodForCore) {
      return {
        coreOrderId: orderIdParam,
        foodRowId: Number(foodForCore.id),
      };
    }
    const { data: coreText } = await db
      .from("orders_core")
      .select("order_id")
      .eq("id", orderIdParam)
      .maybeSingle();
    const textId = String((coreText as { order_id?: string } | null)?.order_id ?? "").trim();
    if (textId) {
      const { data: foodByText } = await db
        .from("orders_food")
        .select(foodSelect)
        .eq("core_order_id", textId)
        .maybeSingle();
      if (foodByText) {
        return {
          coreOrderId: orderIdParam,
          foodRowId: Number(foodByText.id),
        };
      }
    }
    return {
      coreOrderId: orderIdParam,
      foodRowId: null,
    };
  }

  return null;
}

/** Core PK for order_timelines — used by timeline API (partnersite parity). */
export async function resolveCoreOrderPkForTimeline(
  db: SupabaseClient,
  merchantStoreInternalId: number,
  orderIdParam: number
): Promise<number | null> {
  // Partnersite GET /api/food-orders/[id]/timeline: orders_food.id → orders_core.id
  const { data: foodById } = await db
    .from("orders_food")
    .select("id, order_id, core_order_id, merchant_store_id")
    .eq("id", orderIdParam)
    .maybeSingle();

  if (foodById && Number(foodById.merchant_store_id) === merchantStoreInternalId) {
    const corePk = await resolveCorePkFromFoodRow(db, foodById as FoodLookupRow);
    if (corePk != null) return corePk;
  }

  const resolved = await resolveMerchantFoodOrder(db, merchantStoreInternalId, orderIdParam);
  if (resolved?.coreOrderId != null) return resolved.coreOrderId;

  if (await coreBelongsToStore(db, orderIdParam, merchantStoreInternalId)) {
    return orderIdParam;
  }

  return null;
}
