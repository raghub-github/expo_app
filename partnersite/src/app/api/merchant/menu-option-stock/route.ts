import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { assertStoreAccess } from "@/lib/auth/assert-store-access";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "placeholder-service-role-key";
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type TargetType = "variant" | "addon" | "modifier_option" | "menu_addon";

async function assertMenuItemBelongsToStore(menuItemId: number, storeInternalId: number) {
  const { data: item } = await supabase
    .from("merchant_menu_items")
    .select("id")
    .eq("id", menuItemId)
    .eq("store_id", storeInternalId)
    .maybeSingle();
  return Boolean(item);
}

/** PATCH /api/merchant/menu-option-stock — toggle variant/addon/modifier in_stock */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const storeId = String(body?.storeId ?? "").trim();
    const targetType = body?.targetType as TargetType;
    const id = Number(body?.id);
    const inStock = Boolean(body?.in_stock);

    const validTypes: TargetType[] = ["variant", "addon", "modifier_option", "menu_addon"];
    if (!storeId || !Number.isFinite(id) || !validTypes.includes(targetType)) {
      return NextResponse.json(
        { error: "storeId, targetType (variant|addon|modifier_option|menu_addon), id required" },
        { status: 400 }
      );
    }

    const access = await assertStoreAccess(storeId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    const store = { id: access.storeIdNum };

    let table = "";
    let menuItemId: number | null = null;

    if (targetType === "variant") {
      table = "merchant_menu_item_variants";
      const { data: row, error: fetchErr } = await supabase
        .from(table)
        .select("id, menu_item_id")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        console.error("[menu-option-stock] variant fetch", fetchErr.message);
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ error: "Option not found" }, { status: 404 });
      }
      menuItemId = (row as { menu_item_id?: number }).menu_item_id ?? null;
    } else if (targetType === "addon") {
      table = "merchant_menu_item_addons";
      const { data: row, error: fetchErr } = await supabase
        .from(table)
        .select("id, customization_id")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        console.error("[menu-option-stock] addon fetch", fetchErr.message);
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ error: "Option not found" }, { status: 404 });
      }
      const custId = (row as { customization_id?: number }).customization_id;
      if (custId) {
        const { data: cust } = await supabase
          .from("merchant_menu_item_customizations")
          .select("menu_item_id")
          .eq("id", custId)
          .maybeSingle();
        menuItemId = cust?.menu_item_id ?? null;
      }
    } else if (targetType === "modifier_option") {
      table = "merchant_modifier_options";
      const { data: row, error: fetchErr } = await supabase
        .from(table)
        .select("id, modifier_group_id")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        console.error("[menu-option-stock] modifier_option fetch", fetchErr.message);
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ error: "Option not found" }, { status: 404 });
      }
      const groupId = (row as { modifier_group_id?: number }).modifier_group_id;
      if (groupId) {
        const { data: group } = await supabase
          .from("merchant_modifier_groups")
          .select("store_id")
          .eq("id", groupId)
          .maybeSingle();
        if (!group || group.store_id !== store.id) {
          return NextResponse.json({ error: "Item does not belong to this store" }, { status: 403 });
        }
      } else {
        return NextResponse.json({ error: "Linked modifier group not found" }, { status: 404 });
      }
    } else {
      table = "merchant_menu_addons";
      const { data: row, error: fetchErr } = await supabase
        .from(table)
        .select("id, addon_group_id")
        .eq("id", id)
        .maybeSingle();
      if (fetchErr) {
        console.error("[menu-option-stock] menu_addon fetch", fetchErr.message);
        return NextResponse.json({ error: fetchErr.message }, { status: 500 });
      }
      if (!row) {
        return NextResponse.json({ error: "Option not found" }, { status: 404 });
      }
      const groupId = (row as { addon_group_id?: number }).addon_group_id;
      if (groupId) {
        const { data: group } = await supabase
          .from("merchant_menu_addon_groups")
          .select("menu_item_id")
          .eq("id", groupId)
          .maybeSingle();
        menuItemId = group?.menu_item_id ?? null;
      }
    }

    if (targetType === "variant" || targetType === "addon" || targetType === "menu_addon") {
      if (menuItemId == null) {
        return NextResponse.json({ error: "Linked menu item not found" }, { status: 404 });
      }
      const belongs = await assertMenuItemBelongsToStore(menuItemId, store.id);
      if (!belongs) {
        return NextResponse.json({ error: "Item does not belong to this store" }, { status: 403 });
      }
    }

    const { error: updateErr } = await supabase
      .from(table)
      .update({ in_stock: inStock, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (updateErr) {
      console.error("[menu-option-stock] update", updateErr.message);
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, in_stock: inStock });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Update failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
