import { z } from "zod";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { auth } from "../../plugins/auth.js";
import { randomUUID } from "crypto";
import { uploadToR2, deleteFromR2, getR2SignedUrl } from "../../services/r2/r2Service.js";
import { buildMenuItemImageKey } from "../../services/r2/merchantMenuR2Paths.js";
import { validateMenuItemSquareImage } from "../../utils/menuItemImageValidation.js";
import { logStoreActivity } from "../../lib/store-activity-feed.js";
import {
  assertStoreAccess,
  listCategories,
  suggestPeerCategoryNames,
  suggestPeerSubcategoryNames,
  createCategory,
  updateCategory,
  deleteCategory,
  listItems,
  getItem,
  createItem,
  updateItem,
  deleteItem,
  patchItemStock,
  patchItemFlags,
  patchCategoryOutOfStock,
  patchItemOutOfStock,
  patchComboOutOfStock,
  type OutOfStockMode,
  addVariant,
  updateVariant,
  deleteVariant,
  addCustomizationGroup,
  updateCustomizationGroup,
  deleteCustomizationGroup,
  addCustomizationOption,
  updateCustomizationOption,
  deleteCustomizationOption,
  deleteItemImage,
  setPrimaryImage,
  listAddonGroups,
  addAddonGroup,
  updateAddonGroup,
  deleteAddonGroup,
  addAddon,
  updateAddon,
  deleteAddon,
  listCombos,
  createCombo,
  getCombo,
  updateCombo,
  deleteCombo,
  addComboComponent,
  deleteComboComponent,
  addItemImageRow,
  listCuisinesForStore,
  createMerchantCuisine,
  listCategoryAvailability,
  getCategoryAvailabilityCounts,
  addCategoryAvailability,
  deleteCategoryAvailability,
  setItemApproval,
  setItemPendingForReReview,
  getMenuItemIdByVariantId,
  getMenuItemIdByCustomizationGroupId,
  getMenuItemIdByCustomizationOptionId,
  getMenuItemIdByAddonGroupId,
  getMenuItemIdByAddonId,
  getMenuItemIdByImageId,
  getItemApprovalStatus,
  listModifierGroups,
  createModifierGroup,
  updateModifierGroup,
  deleteModifierGroup,
  listModifierOptions,
  addModifierOption,
  updateModifierOption,
  deleteModifierOption,
  listItemModifierGroups,
  linkModifierGroupToItem,
  unlinkModifierGroupFromItem,
  getModifierGroupUsageCount,
} from "./merchant-menu.service.js";
import {
  submitAddReviewRequest,
  submitEditReviewRequest,
  submitDeleteReviewRequest,
  listReviewRequests,
  listReviewRequestsForItem,
  getReviewRequestById,
  approveReviewRequest,
  rejectReviewRequest,
  mapLegacyRequestType,
  type ReviewRequestStatus,
} from "./merchant-menu-review.service.js";

import {
  getAttributeDefinitionsByStoreType,
  getStoreTypeConfig,
  resolveStoreType,
} from "./unifiedCatalogAttributes.js";
import {
  CategoryRuleError,
  buildCategoryUiConfig,
  listCatalogCuisinesNotLinkedForStore,
  linkExistingCuisineToStore,
  unlinkCuisineFromStore,
} from "./categoryRules.js";

// Allow parent_category_id as number or string (client may send string); preserve null/undefined
const parentCategoryIdSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") {
      if (v.trim() === "") return null;
      const n = Number(v);
      return Number.isNaN(n) ? undefined : n;
    }
    return v;
  },
  z.number().int().positive().optional().nullable()
);

const cuisineIdSchema = z.preprocess(
  (v) => {
    if (v === null || v === undefined || v === "") return v;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  },
  z.union([z.number().int().positive(), z.null()]).optional()
);

const categoryCreateSchema = z.object({
  category_name: z.string().min(1).max(200),
  category_description: z.string().max(2000).optional().nullable(),
  category_image_url: z.string().url().max(2000).optional().nullable(),
  parent_category_id: parentCategoryIdSchema,
  cuisine_id: cuisineIdSchema,
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const categoryUpdateSchema = z.object({
  category_name: z.string().min(1).max(200).optional(),
  category_description: z.string().max(2000).optional().nullable(),
  category_image_url: z.string().url().max(2000).optional().nullable(),
  parent_category_id: parentCategoryIdSchema,
  cuisine_id: cuisineIdSchema,
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const cuisineCreateBodySchema = z.object({
  name: z.string().min(1).max(120),
});

const cuisineLinkBodySchema = z.object({
  cuisine_id: z.number().int().positive(),
});

const nutritionalFields = {
  item_size_value: z.number().min(0).optional().nullable(),
  item_size_unit: z.string().max(50).optional().nullable(),
  available_for_delivery: z.boolean().optional(),
  serves_label: z.string().max(50).optional().nullable(),
  weight_per_serving: z.number().min(0).optional().nullable(),
  weight_per_serving_unit: z.string().max(30).optional().nullable(),
  calories_kcal: z.number().min(0).optional().nullable(),
  protein: z.number().min(0).optional().nullable(),
  protein_unit: z.string().max(10).optional().nullable(),
  carbohydrates: z.number().min(0).optional().nullable(),
  carbohydrates_unit: z.string().max(10).optional().nullable(),
  fat: z.number().min(0).optional().nullable(),
  fat_unit: z.string().max(10).optional().nullable(),
  fibre: z.number().min(0).optional().nullable(),
  fibre_unit: z.string().max(10).optional().nullable(),
  allergens: z.array(z.string()).optional().nullable(),
  item_tags: z.array(z.string()).optional().nullable(),
  available_quantity: z.number().int().min(0).optional().nullable(),
  low_stock_threshold: z.number().int().min(0).optional().nullable(),
  /** YYYY-MM-DD — primarily for GROCERY items */
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  in_stock: z.boolean().optional(),
};

const itemCreateSchema = z.object({
  item_name: z.string().min(1).max(300),
  item_description: z.string().max(3000).optional().nullable(),
  category_id: z.number().int().positive().optional().nullable(),
  food_type: z.string().max(50).optional().nullable(),
  spice_level: z.string().max(50).optional().nullable(),
  cuisine_type: z.string().max(100).optional().nullable(),
  base_price: z.number().min(0),
  selling_price: z.number().min(0),
  preparation_time_minutes: z.number().int().min(0).optional().nullable(),
  packaging_charges: z.number().min(0).optional().nullable(),
  serves: z.number().int().min(1).optional().nullable(),
  short_name: z.string().max(100).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  ...nutritionalFields,
  /**
   * Unified, schema-driven attributes (optional).
   * If omitted, FOOD attributes are computed from legacy columns (backwards compatible).
   */
  attributes: z.record(z.string(), z.any()).optional(),
});

const itemUpdateSchema = z.object({
  item_name: z.string().min(1).max(300).optional(),
  item_description: z.string().max(3000).optional().nullable(),
  category_id: z.number().int().positive().optional().nullable(),
  food_type: z.string().max(50).optional().nullable(),
  spice_level: z.string().max(50).optional().nullable(),
  cuisine_type: z.string().max(100).optional().nullable(),
  base_price: z.number().min(0).optional(),
  selling_price: z.number().min(0).optional(),
  preparation_time_minutes: z.number().int().min(0).optional().nullable(),
  packaging_charges: z.number().min(0).optional().nullable(),
  serves: z.number().int().min(1).optional().nullable(),
  short_name: z.string().max(100).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
  ...nutritionalFields,
  attributes: z.record(z.string(), z.any()).optional(),
});

const stockPatchSchema = z.object({
  in_stock: z.boolean().optional(),
  available_quantity: z.number().int().min(0).optional().nullable(),
});

const itemFlagsPatchSchema = z.object({
  is_recommended: z.boolean().optional(),
  is_popular: z.boolean().optional(),
});

const outOfStockPatchSchema = z.object({
  mode: z.enum(["CLEAR", "MANUAL", "HOURS", "NEXT_OPEN", "CUSTOM"] as const),
  hours: z.number().int().positive().max(24 * 14).optional(),
  until: z.string().optional(),
});

const variantCreateSchema = z.object({
  variant_name: z.string().min(1).max(200),
  variant_type: z.string().max(50).optional().nullable(),
  variant_price: z.number().min(0),
  is_default: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
  attributes: z.record(z.string(), z.any()).optional(),
});

const variantUpdateSchema = z.object({
  variant_name: z.string().min(1).max(200).optional(),
  variant_type: z.string().max(50).optional().nullable(),
  variant_price: z.number().min(0).optional(),
  is_default: z.boolean().optional(),
  display_order: z.number().int().min(0).optional(),
  in_stock: z.boolean().optional(),
  attributes: z.record(z.string(), z.any()).optional(),
});

const customizationGroupCreateSchema = z.object({
  customization_title: z.string().min(1).max(200),
  customization_type: z.string().max(50).optional().nullable(),
  is_required: z.boolean().optional(),
  min_selection: z.number().int().min(0).optional(),
  max_selection: z.number().int().min(0).optional(),
  display_order: z.number().int().min(0).optional(),
});

const customizationGroupUpdateSchema = z.object({
  customization_title: z.string().min(1).max(200).optional(),
  is_required: z.boolean().optional(),
  min_selection: z.number().int().min(0).optional(),
  max_selection: z.number().int().min(0).optional(),
  display_order: z.number().int().min(0).optional(),
});

const customizationOptionCreateSchema = z.object({
  addon_name: z.string().min(1).max(200),
  addon_price: z.number().min(0).optional(),
  addon_image_url: z.string().url().max(2000).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
});

const customizationOptionUpdateSchema = z.object({
  addon_name: z.string().min(1).max(200).optional(),
  addon_price: z.number().min(0).optional(),
  addon_image_url: z.string().url().max(2000).optional().nullable(),
  display_order: z.number().int().min(0).optional(),
  in_stock: z.boolean().optional(),
});

export async function merchantMenuRoutes(app: FastifyInstance) {
  await app.register(
    async (protectedApp) => {
      await protectedApp.register(auth, { required: true });
      await protectedApp.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB

      /** Resolve store and ensure merchant owns it; reply 401/403 if not. */
      async function getStore(req: { auth?: { role: string; sub: string } }, reply: any, storeIdParam: string) {
        if (req.auth?.role !== "merchant" || !req.auth?.sub) {
          return reply.code(401).send({ error: "merchant_required" });
        }
        const access = await assertStoreAccess(req.auth.sub, storeIdParam);
        if (!access) {
          return reply.code(403).send({ error: "store_not_found_or_forbidden" });
        }
        return access;
      }

      function getDefaultStoreTypeConfig() {
        return {
          enable_addons: true,
          enable_combos: true,
          enable_expiry: false,
          enable_prescription: false,
          enable_weight: false,
        };
      }

      async function getStoreTypeConfigForStore(storeIdNum: number) {
        const storeType = (await resolveStoreType(storeIdNum)) ?? "GENERAL";
        return (await getStoreTypeConfig(storeType)) ?? getDefaultStoreTypeConfig();
      }

      // Categories
      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/categories",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const list = await listCategories(access.storeIdNum);
          return reply.send({ categories: list });
        }
      );

      /** Debounced client: names from other stores' menus; excludes names already on this store. */
      protectedApp.get<{
        Params: { storeId: string };
        Querystring: { q?: string; limit?: string; editingCategoryId?: string };
      }>("/:storeId/category-name-suggestions", async (req, reply) => {
        const access = await getStore(req, reply, req.params.storeId);
        if (!access) return;
        const q = typeof req.query.q === "string" ? req.query.q : "";
        const limitRaw = req.query.limit != null ? parseInt(String(req.query.limit), 10) : 12;
        const limit = Number.isFinite(limitRaw) ? limitRaw : 12;
        const editRaw =
          req.query.editingCategoryId != null && req.query.editingCategoryId !== ""
            ? parseInt(String(req.query.editingCategoryId), 10)
            : NaN;
        const editingCategoryId = Number.isFinite(editRaw) ? editRaw : null;
        const suggestions = await suggestPeerCategoryNames(access.storeIdNum, {
          q,
          limit,
          editingCategoryId,
        });
        return reply.send({ suggestions });
      });

      /** Subcategory name suggestions from other stores' subcategories; excludes names already under this parent. */
      protectedApp.get<{
        Params: { storeId: string };
        Querystring: {
          q?: string;
          limit?: string;
          parentCategoryId: string;
          editingCategoryId?: string;
        };
      }>("/:storeId/subcategory-name-suggestions", async (req, reply) => {
        const access = await getStore(req, reply, req.params.storeId);
        if (!access) return;
        const parentRaw = req.query.parentCategoryId;
        const parentParsed =
          parentRaw != null && String(parentRaw).trim() !== ""
            ? parseInt(String(parentRaw), 10)
            : NaN;
        if (!Number.isFinite(parentParsed) || parentParsed <= 0) {
          return reply.status(400).send({ message: "parentCategoryId is required" });
        }
        const q = typeof req.query.q === "string" ? req.query.q : "";
        const limitRaw = req.query.limit != null ? parseInt(String(req.query.limit), 10) : 12;
        const limit = Number.isFinite(limitRaw) ? limitRaw : 12;
        const editRaw =
          req.query.editingCategoryId != null && req.query.editingCategoryId !== ""
            ? parseInt(String(req.query.editingCategoryId), 10)
            : NaN;
        const editingCategoryId = Number.isFinite(editRaw) ? editRaw : null;
        const suggestions = await suggestPeerSubcategoryNames(access.storeIdNum, {
          q,
          limit,
          parentCategoryId: parentParsed,
          editingCategoryId,
        });
        return reply.send({ suggestions });
      });

      /** Category availability window counts per category (for UI "Hours set" badges). */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/category-availability-summary",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const counts = await getCategoryAvailabilityCounts(access.storeIdNum);
          return reply.send({ counts });
        }
      );

      // Catalog schema (UI-driven): store_type_config + attribute_definitions
      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/catalog-schema",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;

          const storeType = (await resolveStoreType(access.storeIdNum)) ?? "GENERAL";
          const config =
            (await getStoreTypeConfig(storeType)) ?? {
              enable_addons: true,
              enable_combos: true,
              enable_expiry: false,
              enable_prescription: false,
              enable_weight: false,
            };
          const attributeDefinitions = await getAttributeDefinitionsByStoreType(storeType, "ITEM");
          const variantAttributeDefinitions = await getAttributeDefinitionsByStoreType(storeType, "VARIANT");

          return reply.send({
            store_type: storeType,
            store_type_config: config,
            attribute_definitions: attributeDefinitions,
            variant_attribute_definitions: variantAttributeDefinitions,
          });
        }
      );

      /** Config-driven category form: store_type rules + plan limits + cuisine visibility */
      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/category-config",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const storeType = await resolveStoreType(access.storeIdNum);
          // item_form is sync from store_type; remaining fields load in parallel inside buildCategoryUiConfig
          const config = await buildCategoryUiConfig(access.storeIdNum, storeType);
          return reply.send(config);
        }
      );

      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/image-upload-status",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const { getMenuImageUploadStatus } = await import("./menuImageUploadStatus.js");
          const status = await getMenuImageUploadStatus(access.storeIdNum);
          return reply.send(status);
        }
      );

      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/cuisines",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const rawCuisines = await listCuisinesForStore(access.storeIdNum);
          const rawCatalog = await listCatalogCuisinesNotLinkedForStore(access.storeIdNum);
          const norm = (rows: unknown[]) =>
            rows
              .map((r) => {
                const x = r as { id?: unknown; name?: unknown; is_system_defined?: unknown };
                const id = Number(x.id);
                if (!Number.isFinite(id) || id <= 0) return null;
                if (typeof x.name !== "string") return null;
                return {
                  id,
                  name: x.name,
                  is_system_defined: Boolean(x.is_system_defined),
                };
              })
              .filter((r): r is NonNullable<typeof r> => r != null);
          return reply.send({ cuisines: norm(rawCuisines as unknown[]), catalog: norm(rawCatalog as unknown[]) });
        }
      );

      protectedApp.post<{
        Params: { storeId: string };
        Body: z.infer<typeof cuisineLinkBodySchema>;
      }>(
        "/:storeId/cuisines/link",
        { schema: { body: cuisineLinkBodySchema } },
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          try {
            await linkExistingCuisineToStore(access.storeIdNum, req.body.cuisine_id);
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "category",
                action: "update",
                entityId: req.body.cuisine_id,
                summary: `Linked cuisine #${req.body.cuisine_id} to store`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.send({ ok: true });
          } catch (e) {
            if (e instanceof CategoryRuleError) {
              return reply.code(e.httpStatus).send({ error: e.code, message: e.message });
            }
            throw e;
          }
        }
      );

      protectedApp.delete<{ Params: { storeId: string; cuisineId: string } }>(
        "/:storeId/cuisines/:cuisineId",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const cuisineId = parseInt(req.params.cuisineId, 10);
          if (Number.isNaN(cuisineId)) {
            return reply.code(400).send({ error: "invalid_cuisine_id" });
          }
          try {
            await unlinkCuisineFromStore(access.storeIdNum, cuisineId);
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "category",
                action: "delete",
                entityId: cuisineId,
                summary: `Unlinked cuisine #${cuisineId} from store`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.send({ ok: true });
          } catch (e) {
            if (e instanceof CategoryRuleError) {
              return reply.code(e.httpStatus).send({ error: e.code, message: e.message });
            }
            throw e;
          }
        }
      );

      protectedApp.post<{
        Params: { storeId: string };
        Body: z.infer<typeof cuisineCreateBodySchema>;
      }>(
        "/:storeId/cuisines",
        { schema: { body: cuisineCreateBodySchema } },
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          try {
            const created = await createMerchantCuisine(access.storeIdNum, req.body.name);
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "category",
                action: "create",
                entityId: created.id,
                entityName: req.body.name.trim(),
                summary: `Merchant linked cuisine from master list '${req.body.name.trim()}'`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.code(201).send(created);
          } catch (e) {
            if (e instanceof CategoryRuleError) {
              return reply.code(e.httpStatus).send({ error: e.code, message: e.message });
            }
            const msg = String((e as Error)?.message || e);
            if (msg.includes("duplicate") || (e as { code?: string })?.code === "23505") {
              return reply.code(409).send({ error: "duplicate_cuisine_name", message: "Cuisine name already exists" });
            }
            throw e;
          }
        }
      );

      protectedApp.post<{ Params: { storeId: string }; Body: z.infer<typeof categoryCreateSchema> }>(
        "/:storeId/categories",
        { schema: { body: categoryCreateSchema } },
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          try {
            const created = await createCategory(access.storeIdNum, req.body);
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "category",
                action: "create",
                entityId: created?.id ?? null,
                entityName: req.body.category_name,
                summary: `Merchant created category '${req.body.category_name}'`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.code(201).send(created);
          } catch (e) {
            if (e instanceof CategoryRuleError) {
              return reply.code(e.httpStatus).send({ error: e.code, message: e.message });
            }
            const msg = String((e as Error)?.message || e);
            if (msg.includes("duplicate") || (e as { code?: string })?.code === "23505") {
              return reply
                .code(409)
                .send({ error: "duplicate_category_name", message: "A category with this name already exists for this store" });
            }
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof categoryUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/categories/:id",
        { schema: { body: categoryUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_category_id" });
          try {
            const ok = await updateCategory(id, access.storeIdNum, req.body);
            if (!ok) return reply.code(404).send({ error: "category_not_found" });
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "category",
                action: "update",
                entityId: id,
                entityName: req.body.category_name ?? null,
                summary: `Merchant updated category #${id}${req.body.category_name ? ` '${req.body.category_name}'` : ""}`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.send({ ok: true });
          } catch (e) {
            if (e instanceof CategoryRuleError) {
              return reply.code(e.httpStatus).send({ error: e.code, message: e.message });
            }
            const msg = String((e as Error)?.message || e);
            if (msg.includes("duplicate") || (e as { code?: string })?.code === "23505") {
              return reply
                .code(409)
                .send({ error: "duplicate_category_name", message: "A category with this name already exists for this store" });
            }
            throw e;
          }
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/categories/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_category_id" });
          const out = await deleteCategory(id, access.storeIdNum);
          if (!out.ok) {
            if (out.error === "category_has_items")
              return reply.code(400).send({ error: out.error, itemCount: out.itemCount });
            if (out.error === "category_has_subcategories")
              return reply.code(400).send({
                error: out.error,
                subcategoryCount: out.subcategoryCount,
              });
            return reply.code(404).send({ error: out.error });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "category", action: "delete", entityId: id, summary: `Merchant deleted category #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Items
      protectedApp.get<{
        Params: { storeId: string };
        Querystring: { categoryId?: string; search?: string; limit?: string; offset?: string; approvalStatus?: string; inStock?: string; changeRequestType?: string };
      }>(
        "/:storeId/items",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const categoryId = req.query.categoryId != null ? parseInt(req.query.categoryId, 10) : undefined;
          const limit = req.query.limit != null ? parseInt(req.query.limit, 10) : undefined;
          const offset = req.query.offset != null ? parseInt(req.query.offset, 10) : undefined;
          const approvalStatus = req.query.approvalStatus === "PENDING" || req.query.approvalStatus === "APPROVED" || req.query.approvalStatus === "REJECTED" ? req.query.approvalStatus : undefined;
          const inStockParam = req.query.inStock;
          const inStock = inStockParam === "true" ? true : inStockParam === "false" ? false : undefined;
          const changeRequestType = req.query.changeRequestType === "DELETE" || req.query.changeRequestType === "UPDATE" ? req.query.changeRequestType : undefined;
          const { items, total } = await listItems(access.storeIdNum, {
            categoryId: Number.isNaN(categoryId as number) ? undefined : (categoryId as number),
            search: req.query.search,
            limit,
            offset,
            approvalStatus: approvalStatus ?? null,
            inStock: inStock ?? null,
            changeRequestType: changeRequestType ?? null,
          });
          return reply.send({ items, total });
        }
      );

      protectedApp.get<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/items/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const item = await getItem(id, access.storeIdNum);
          if (!item) return reply.code(404).send({ error: "item_not_found" });
          return reply.send(item);
        }
      );

      protectedApp.post<{ Params: { storeId: string }; Body: z.infer<typeof itemCreateSchema> }>(
        "/:storeId/items",
        { schema: { body: itemCreateSchema } },
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const role = req.auth?.role ?? "merchant";

          // Merchants submit ADD review (no live row until approved). Agents/admins create live APPROVED items.
          if (role === "merchant") {
            try {
              const created = await submitAddReviewRequest(access.storeIdNum, req.body as Record<string, unknown>, {
                submitted_by: req.auth?.sub ?? "unknown",
                submitted_by_role: "merchant",
                source: "MERCHANT_APP",
                client_ip: req.ip ?? null,
              });
              try {
                await logStoreActivity({
                  storeId: access.storeIdNum,
                  section: "menu_item",
                  action: "create",
                  entityId: null,
                  entityName: req.body.item_name,
                  summary: `Merchant submitted ADD review for '${req.body.item_name}'`,
                  actorType: "merchant",
                  source: "merchant_app",
                });
              } catch {}
              return reply.code(201).send({
                pending_review: true,
                review_request_id: created.review_request_id,
                id: null,
                item_id: null,
              });
            } catch (e: any) {
              return reply.code(400).send({
                error: e?.message ?? "add_review_failed",
                message: e?.message ?? "Failed to submit add review",
              });
            }
          }

          let created: { id: number; item_id: string };
          try {
            created = await createItem(access.storeIdNum, req.body, {
              createdByRole: role,
              createdBySub: req.auth?.sub ?? null,
            });
          } catch (e: any) {
            return reply.code(400).send({
              error: "invalid_attributes",
              message: e?.message ?? "invalid_attributes",
            });
          }
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "menu_item",
              action: "create",
              entityId: created?.id ?? null,
              entityName: req.body.item_name,
              summary: `Agent created item '${req.body.item_name}'`,
              diff: {
                attributes: req.body.attributes ?? null,
                legacy: {
                  food_type: req.body.food_type ?? null,
                  spice_level: req.body.spice_level ?? null,
                  cuisine_type: req.body.cuisine_type ?? null,
                },
              },
              actorType: "agent",
              source: "merchant_app",
            });
          } catch {}
          return reply.code(201).send(created);
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof itemUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id",
        { schema: { body: itemUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const role = req.auth?.role ?? "merchant";
          if (role === "merchant") {
            const approvalStatus = await getItemApprovalStatus(id, access.storeIdNum);
            if (approvalStatus === "APPROVED") {
              return reply.code(403).send({
                error: "item_approved_use_change_request",
                code: "item_approved_use_change_request",
                message: "Approved items cannot be edited directly. Submit an update request for agent review.",
              });
            }
          }
          let ok: boolean;
          try {
            ok = await updateItem(id, access.storeIdNum, req.body, {
              updatedByRole: role,
              updatedBySub: req.auth?.sub ?? null,
            });
          } catch (e: any) {
            return reply.code(400).send({
              error: "invalid_attributes",
              message: e?.message ?? "invalid_attributes",
            });
          }
          if (!ok) return reply.code(404).send({ error: "item_not_found" });
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "menu_item",
              action: "update",
              entityId: id,
              entityName: req.body.item_name ?? null,
              summary: `Merchant updated item #${id}${req.body.item_name ? ` '${req.body.item_name}'` : ""}`,
              diff: {
                attributes: req.body.attributes ?? null,
                patch: req.body,
              },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/items/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const role = req.auth?.role ?? "merchant";
          if (role === "merchant") {
            const approvalStatus = await getItemApprovalStatus(id, access.storeIdNum);
            if (approvalStatus === "APPROVED") {
              return reply.code(403).send({
                error: "item_approved_use_change_request",
                code: "item_approved_use_change_request",
                message: "Approved items cannot be deleted directly. Submit a delete request for agent review.",
              });
            }
          }
          const ok = await deleteItem(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "item_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "menu_item", action: "delete", entityId: id, summary: `Merchant deleted item #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.patch<{
        Params: { id: string };
        Body: z.infer<typeof stockPatchSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id/stock",
        { schema: { body: stockPatchSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const ok = await patchItemStock(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "item_not_found_or_invalid_body" });
          try { const stockDesc = req.body.in_stock !== undefined ? (req.body.in_stock ? "in-stock" : "out-of-stock") : "stock"; await logStoreActivity({ storeId: access.storeIdNum, section: "menu_item", action: "update", entityId: id, summary: `Merchant updated ${stockDesc} for item #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.patch<{
        Params: { id: string };
        Body: z.infer<typeof itemFlagsPatchSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id/flags",
        { schema: { body: itemFlagsPatchSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const ok = await patchItemFlags(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "item_not_found_or_invalid_body" });
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "menu_item",
              action: "update",
              entityId: id,
              summary: `Merchant updated item flags for item #${id}`,
              diff: { patch: req.body },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.patch<{
        Params: { categoryId: string };
        Body: z.infer<typeof outOfStockPatchSchema>;
        Querystring: { storeId: string };
      }>(
        "/categories/:categoryId/out-of-stock",
        { schema: { body: outOfStockPatchSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.categoryId, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_category_id" });
          try {
            const out = await patchCategoryOutOfStock(id, access.storeIdNum, req.body as any as { mode: OutOfStockMode; hours?: number; until?: string });
            if (!out.ok) return reply.code(404).send({ error: "category_not_found" });
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "menu_category",
                action: "update",
                entityId: id,
                summary: `Merchant updated out-of-stock for category #${id}`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.send(out);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "out_of_stock_update_failed";
            return reply.code(400).send({ error: msg });
          }
        }
      );

      protectedApp.patch<{
        Params: { id: string };
        Body: z.infer<typeof outOfStockPatchSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id/out-of-stock",
        { schema: { body: outOfStockPatchSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const out = await patchItemOutOfStock(id, access.storeIdNum, req.body as any as { mode: OutOfStockMode; hours?: number; until?: string });
            if (!out.ok) return reply.code(404).send({ error: "item_not_found" });
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "menu_item",
                action: "update",
                entityId: id,
                summary: `Merchant updated out-of-stock for item #${id}`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.send(out);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "out_of_stock_update_failed";
            return reply.code(400).send({ error: msg });
          }
        }
      );

      protectedApp.patch<{
        Params: { id: string };
        Body: z.infer<typeof outOfStockPatchSchema>;
        Querystring: { storeId: string };
      }>(
        "/combos/:id/out-of-stock",
        { schema: { body: outOfStockPatchSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_combo_id" });
          try {
            const out = await patchComboOutOfStock(id, access.storeIdNum, req.body as any as { mode: OutOfStockMode; hours?: number; until?: string });
            if (!out.ok) return reply.code(404).send({ error: "combo_not_found" });
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "combo",
                action: "update",
                entityId: id,
                summary: `Merchant updated out-of-stock for combo #${id}`,
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.send(out);
          } catch (e) {
            const msg = e instanceof Error ? e.message : "out_of_stock_update_failed";
            return reply.code(400).send({ error: msg });
          }
        }
      );

      const changeRequestCreateSchema = z.object({
        requested_payload: z.record(z.string(), z.unknown()).default({}),
        reason: z.string().max(500).optional().nullable(),
      });
      const deleteRequestCreateSchema = z.object({
        reason: z.string().max(500).optional().nullable(),
      });

      protectedApp.post<{
        Params: { id: string };
        Body: z.infer<typeof changeRequestCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id/change-requests",
        { schema: { body: changeRequestCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const approvalStatus = await getItemApprovalStatus(id, access.storeIdNum);
          if (approvalStatus !== "APPROVED") {
            return reply.code(400).send({
              error: "change_request_only_for_approved",
              message: "Update requests are only for approved items. Edit the item directly.",
            });
          }
          const result = await submitEditReviewRequest(
            access.storeIdNum,
            id,
            (req.body.requested_payload ?? {}) as Record<string, unknown>,
            {
              submitted_by: req.auth?.sub ?? "unknown",
              submitted_by_role: req.auth?.role ?? "merchant",
              source: "MERCHANT_APP",
              client_ip: req.ip ?? null,
              reason: req.body.reason ?? null,
            }
          );
          if ("error" in result) {
            return reply.code(400).send({ error: result.error });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "menu_item", action: "create", entityId: id, summary: `Merchant submitted EDIT review for item #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.code(201).send({ id: result.review_request_id, review_request_id: result.review_request_id });
        }
      );

      protectedApp.post<{
        Params: { id: string };
        Body: z.infer<typeof deleteRequestCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id/delete-requests",
        { schema: { body: deleteRequestCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const approvalStatus = await getItemApprovalStatus(id, access.storeIdNum);
          if (approvalStatus !== "APPROVED") {
            return reply.code(400).send({
              error: "delete_request_only_for_approved",
              message: "Delete requests are only for approved items. Delete the item directly.",
            });
          }
          const result = await submitDeleteReviewRequest(access.storeIdNum, id, {
            submitted_by: req.auth?.sub ?? "unknown",
            submitted_by_role: req.auth?.role ?? "merchant",
            source: "MERCHANT_APP",
            client_ip: req.ip ?? null,
            reason: req.body.reason ?? null,
          });
          if ("error" in result) {
            return reply.code(400).send({ error: result.error });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "menu_item", action: "create", entityId: id, summary: `Merchant submitted DELETE review for item #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.code(201).send({ id: result.review_request_id, review_request_id: result.review_request_id });
        }
      );

      protectedApp.get<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/items/:id/change-requests",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const list = await listReviewRequestsForItem(id, access.storeIdNum);
          return reply.send({ change_requests: list, review_requests: list });
        }
      );

      // Agent/Admin: list and manage review requests (URL kept as /change-requests)
      // Merchants may list their own store's pending reviews (for catalog badges / pending ADDs).
      protectedApp.get<{
        Querystring: { storeId?: string; status?: string; request_type?: string; limit?: string; offset?: string };
      }>(
        "/change-requests",
        async (req, reply) => {
          const role = req.auth?.role;
          const storeId = (req.query as any).storeId;
          const status = (req.query as any).status as string | undefined;
          const request_type = (req.query as any).request_type as string | undefined;
          const limit = Math.min(100, Math.max(1, parseInt((req.query as any).limit ?? "20", 10) || 20));
          const offset = Math.max(0, parseInt((req.query as any).offset ?? "0", 10) || 0);
          let storeIdNum: number | null = null;
          if (storeId) {
            if (role === "merchant") {
              const access = await getStore(req, reply, storeId);
              if (!access) return;
              storeIdNum = access.storeIdNum;
            } else if (role === "agent" || role === "admin") {
              const { getSql } = await import("../../db/client.js");
              const sql = getSql();
              const rows = await sql`SELECT id FROM merchant_stores WHERE store_id = ${storeId} LIMIT 1`;
              if (rows[0]) storeIdNum = Number((rows[0] as any).id);
            } else {
              return reply.code(403).send({ error: "forbidden" });
            }
          } else if (role !== "agent" && role !== "admin") {
            return reply.code(400).send({ error: "storeId query required" });
          }
          const mappedType = mapLegacyRequestType(request_type);
          const mappedStatus: ReviewRequestStatus | undefined =
            status === "PENDING" || status === "APPROVED" || status === "REJECTED" ? status : undefined;
          const { requests, total } = await listReviewRequests({
            storeIdNum: storeIdNum ?? undefined,
            status: mappedStatus,
            request_type: mappedType ?? undefined,
            limit,
            offset,
          });
          const change_requests = requests.map((r: any) => ({
            ...r,
            request_type:
              r.request_type === "ADD" ? "CREATE" : r.request_type === "EDIT" ? "UPDATE" : r.request_type,
            created_by: r.submitted_by,
            created_by_role: r.submitted_by_role,
            created_at: r.submitted_at ?? r.created_at,
            reviewed_reason: r.rejection_reason,
            requested_payload: r.add_payload ?? {},
            current_snapshot: null,
            changes: r.changes ?? [],
            item_name: r.item_name ?? r.add_payload?.item_name ?? null,
          }));
          return reply.send({ change_requests, review_requests: requests, total });
        }
      );

      protectedApp.get<{ Params: { id: string } }>(
        "/change-requests/:id",
        async (req, reply) => {
          const role = req.auth?.role;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_id" });
          const request = await getReviewRequestById(id, null);
          if (!request) return reply.code(404).send({ error: "request_not_found" });
          if (role !== "agent" && role !== "admin") {
            return reply.code(403).send({ error: "agent_or_admin_required" });
          }
          return reply.send({
            ...request,
            request_type:
              request.request_type === "ADD"
                ? "CREATE"
                : request.request_type === "EDIT"
                  ? "UPDATE"
                  : request.request_type,
            created_by: request.submitted_by,
            created_by_role: request.submitted_by_role,
            created_at: request.submitted_at ?? request.created_at,
            reviewed_reason: request.rejection_reason,
            requested_payload: request.add_payload ?? {},
            current_snapshot: null,
          });
        }
      );

      protectedApp.post<{ Params: { id: string } }>(
        "/change-requests/:id/approve",
        async (req, reply) => {
          const role = req.auth?.role;
          if (role !== "agent" && role !== "admin") {
            return reply.code(403).send({ error: "agent_or_admin_required" });
          }
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_id" });
          const result = await approveReviewRequest(id, {
            reviewed_by: req.auth?.sub ?? "unknown",
            reviewed_by_role: role,
            client_ip: req.ip ?? null,
          });
          if (!result.ok) {
            const code = result.error === "request_not_found" ? 404 : 400;
            return reply.code(code).send({ error: result.error ?? "approve_failed" });
          }
          try {
            await logStoreActivity({
              storeId: result.storeId ?? 0,
              section: "menu_item",
              action: "update",
              entityId: result.menu_item_id ?? id,
              summary: `Agent approved menu review #${id}`,
              actorType: "agent",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true, menu_item_id: result.menu_item_id ?? null });
        }
      );

      const rejectChangeRequestSchema = z.object({ reviewed_reason: z.string().max(1000).optional().nullable() });
      protectedApp.post<{
        Params: { id: string };
        Body: z.infer<typeof rejectChangeRequestSchema>;
      }>(
        "/change-requests/:id/reject",
        { schema: { body: rejectChangeRequestSchema } },
        async (req, reply) => {
          const role = req.auth?.role;
          if (role !== "agent" && role !== "admin") {
            return reply.code(403).send({ error: "agent_or_admin_required" });
          }
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_id" });
          const result = await rejectReviewRequest(id, {
            reviewed_by: req.auth?.sub ?? "unknown",
            reviewed_by_role: role,
            rejection_reason: req.body?.reviewed_reason ?? null,
            client_ip: req.ip ?? null,
          });
          if (!result.ok) {
            const code = result.error === "request_not_found" ? 404 : 400;
            return reply.code(code).send({ error: result.error ?? "reject_failed" });
          }
          try {
            await logStoreActivity({
              storeId: 0,
              section: "menu_item",
              action: "update",
              entityId: id,
              summary: `Agent rejected menu review #${id}`,
              actorType: "agent",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true });
        }
      );

      /** Attach image to a pending ADD review (does not touch live menu_item_images). */
      protectedApp.post<{
        Params: { id: string };
        Querystring: { storeId: string };
      }>("/change-requests/:id/images", async (req, reply) => {
        const storeId = (req.query as any).storeId;
        if (!storeId) return reply.code(400).send({ error: "storeId query required" });
        const access = await getStore(req, reply, storeId);
        if (!access) return;
        const reviewId = parseInt(req.params.id, 10);
        if (Number.isNaN(reviewId)) return reply.code(400).send({ error: "invalid_id" });

        const { getSql } = await import("../../db/client.js");
        const sql = getSql();
        const [row] = await sql`
          SELECT id, add_payload, request_type::text, status::text
          FROM merchant_menu_item_review_requests
          WHERE id = ${reviewId} AND store_id = ${access.storeIdNum}
        `;
        if (!row) return reply.code(404).send({ error: "request_not_found" });
        const r = row as any;
        if (r.request_type !== "ADD" || r.status !== "PENDING") {
          return reply.code(400).send({ error: "image_attach_only_for_pending_add" });
        }

        let uploadedKey: string | null = null;
        try {
          const data = await req.file();
          if (!data) return reply.code(400).send({ error: "No file provided" });
          const buffer = await data.toBuffer();
          const dim = validateMenuItemSquareImage(buffer);
          if (!dim.ok) {
            return reply.code(400).send({ error: "invalid_image", message: dim.error });
          }
          const ext = (data.filename && /\.(webp|jpe?g|png|gif)$/i.exec(data.filename)?.[1]) || "jpg";
          const fileId = randomUUID();
          const draftItemId = `review_${reviewId}`;
          const key = buildMenuItemImageKey(access.storeIdStr, draftItemId, fileId, ext);
          const uploadResult = await uploadToR2(buffer, key, data.mimetype || "image/jpeg");
          uploadedKey = uploadResult.key;
          const imageUrl = `/v1/attachments/proxy?key=${encodeURIComponent(uploadedKey)}`;

          const payload = (r.add_payload ?? {}) as Record<string, unknown>;
          const images = Array.isArray(payload.images) ? [...(payload.images as unknown[])] : [];
          images.push({ image_url: imageUrl, r2_key: uploadedKey, is_primary: images.length === 0 });
          const nextPayload = {
            ...payload,
            item_image_url: imageUrl,
            images,
          };
          await sql`
            UPDATE merchant_menu_item_review_requests
            SET add_payload = ${JSON.stringify(nextPayload)}::text::jsonb, updated_at = NOW()
            WHERE id = ${reviewId}
          `;
          return reply.code(201).send({ image_url: imageUrl, r2_key: uploadedKey, review_request_id: reviewId });
        } catch (e: any) {
          if (uploadedKey) {
            try {
              await deleteFromR2(uploadedKey);
            } catch {}
          }
          return reply.code(500).send({ error: e?.message ?? "upload_failed" });
        }
      });

      const approvalPatchSchema = z.object({
        approval_status: z.enum(["APPROVED", "REJECTED"]),
        rejection_reason: z.string().max(1000).optional().nullable(),
      });

      protectedApp.patch<{
        Params: { id: string };
        Body: z.infer<typeof approvalPatchSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:id/approval",
        { schema: { body: approvalPatchSchema } },
        async (req, reply) => {
          const role = req.auth?.role;
          if (role !== "agent" && role !== "admin") {
            return reply.code(403).send({ error: "agent_or_admin_required" });
          }
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_item_id" });
          const { getSql } = await import("../../db/client.js");
          const sql = getSql();
          const storeRows = await sql`SELECT id FROM merchant_stores WHERE store_id = ${storeId} LIMIT 1`;
          const storeIdNum = storeRows[0] ? Number((storeRows[0] as any).id) : null;
          if (storeIdNum == null) return reply.code(404).send({ error: "store_not_found" });
          const ok = await setItemApproval(id, storeIdNum, {
            approval_status: req.body.approval_status,
            approved_by: req.auth?.sub ?? "unknown",
            approved_by_role: role,
            rejection_reason: req.body.rejection_reason,
          });
          if (!ok) return reply.code(404).send({ error: "item_not_found" });
          try { await logStoreActivity({ storeId: storeIdNum, section: "menu_item", action: "update", entityId: id, summary: `Merchant set item #${id} approval to ${req.body.approval_status}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Variants
      protectedApp.post<{
        Params: { itemId: string };
        Body: z.infer<typeof variantCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:itemId/variants",
        { schema: { body: variantCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const created = await addVariant(itemId, access.storeIdNum, req.body);
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "variant", action: "create", entityId: created?.id ?? null, entityName: req.body.variant_name, summary: `Merchant created variant '${req.body.variant_name}' for item #${itemId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "ITEM_NOT_FOUND") return reply.code(404).send({ error: "item_not_found" });
            return reply.code(400).send({
              error: "invalid_attributes",
              message: e?.message ?? "invalid_attributes",
            });
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof variantUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/variants/:id",
        { schema: { body: variantUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_variant_id" });
          let ok: boolean;
          try {
            ok = await updateVariant(id, access.storeIdNum, req.body);
          } catch (e: any) {
            return reply.code(400).send({
              error: "invalid_attributes",
              message: e?.message ?? "invalid_attributes",
            });
          }
          if (!ok) return reply.code(404).send({ error: "variant_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByVariantId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "variant", action: "update", entityId: id, entityName: req.body.variant_name ?? null, summary: `Merchant updated variant #${id}${req.body.variant_name ? ` '${req.body.variant_name}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/variants/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_variant_id" });
          const ok = await deleteVariant(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "variant_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByVariantId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "variant", action: "delete", entityId: id, summary: `Merchant deleted variant #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Customization groups
      protectedApp.post<{
        Params: { itemId: string };
        Body: z.infer<typeof customizationGroupCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:itemId/customization-groups",
        { schema: { body: customizationGroupCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const created = await addCustomizationGroup(itemId, access.storeIdNum, req.body);
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "customization", action: "create", entityId: created?.id ?? null, entityName: req.body.customization_title, summary: `Merchant created customization group '${req.body.customization_title}' for item #${itemId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "ITEM_NOT_FOUND") return reply.code(404).send({ error: "item_not_found" });
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof customizationGroupUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/customization-groups/:id",
        { schema: { body: customizationGroupUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_group_id" });
          const ok = await updateCustomizationGroup(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "customization_group_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByCustomizationGroupId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "customization", action: "update", entityId: id, entityName: req.body.customization_title ?? null, summary: `Merchant updated customization group #${id}${req.body.customization_title ? ` '${req.body.customization_title}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/customization-groups/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_group_id" });
          const ok = await deleteCustomizationGroup(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "customization_group_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByCustomizationGroupId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "customization", action: "delete", entityId: id, summary: `Merchant deleted customization group #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Customization options
      protectedApp.post<{
        Params: { groupId: string };
        Body: z.infer<typeof customizationOptionCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/customization-groups/:groupId/options",
        { schema: { body: customizationOptionCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const groupId = parseInt(req.params.groupId, 10);
          if (Number.isNaN(groupId)) return reply.code(400).send({ error: "invalid_group_id" });
          try {
            const created = await addCustomizationOption(groupId, access.storeIdNum, req.body);
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              const menuItemId = await getMenuItemIdByCustomizationGroupId(groupId);
              if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "create", entityId: created?.id ?? null, entityName: req.body.addon_name, summary: `Merchant created customization option '${req.body.addon_name}' in group #${groupId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "CUSTOMIZATION_GROUP_NOT_FOUND")
              return reply.code(404).send({ error: "customization_group_not_found" });
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof customizationOptionUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/customization-options/:id",
        { schema: { body: customizationOptionUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_option_id" });
          const ok = await updateCustomizationOption(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "customization_option_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByCustomizationOptionId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "update", entityId: id, entityName: req.body.addon_name ?? null, summary: `Merchant updated customization option #${id}${req.body.addon_name ? ` '${req.body.addon_name}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/customization-options/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_option_id" });
          const ok = await deleteCustomizationOption(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "customization_option_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByCustomizationOptionId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "delete", entityId: id, summary: `Merchant deleted customization option #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Images: upload (multipart -> R2 -> DB), delete, set primary
      protectedApp.post<{
        Params: { itemId: string };
        Querystring: { storeId: string };
      }>(
        "/items/:itemId/images",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });

          let uploadedKey: string | null = null;
          try {
            const { getSql } = await import("../../db/client.js");
            const sql = getSql();
            const [itemRow] = await sql`
              SELECT item_id FROM merchant_menu_items
              WHERE id = ${itemId} AND store_id = ${access.storeIdNum}
              LIMIT 1
            `;
            if (!itemRow) return reply.code(404).send({ error: "item_not_found" });
            const itemPublicId = String((itemRow as any).item_id);

            const data = await req.file();
            if (!data) return reply.code(400).send({ error: "No file provided" });
            const buffer = await data.toBuffer();
            const dim = validateMenuItemSquareImage(buffer);
            if (!dim.ok) {
              return reply.code(400).send({ error: "invalid_image", message: dim.error });
            }
            const ext = (data.filename && /\.(webp|jpe?g|png|gif)$/i.exec(data.filename)?.[1]) || "jpg";
            const fileId = randomUUID();
            const key = buildMenuItemImageKey(access.storeIdStr, itemPublicId, fileId, ext);
            const uploadResult = await uploadToR2(
              buffer,
              key,
              data.mimetype || "image/jpeg"
            );
            uploadedKey = uploadResult.key;
            // Always store proxy path (private bucket); avoid persisting public CDN URLs.
            const imageUrl = `/v1/attachments/proxy?key=${encodeURIComponent(uploadedKey)}`;
            const created = await addItemImageRow(itemId, access.storeIdNum, {
              image_url: imageUrl,
              r2_key: uploadedKey,
              is_primary: true,
              format: ext,
              // Merchant uploads stay PENDING + re-review; admin/agent apply live.
              autoApprove: req.auth?.role !== "merchant",
              moderated_by: req.auth?.role !== "merchant" ? (req.auth?.sub ?? null) : null,
            });
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "menu_item",
                action: "create",
                entityId: itemId,
                summary:
                  req.auth?.role !== "merchant"
                    ? `Staff uploaded image for item #${itemId} (auto-approved)`
                    : `Merchant uploaded image for item #${itemId}`,
                actorType: req.auth?.role !== "merchant" ? "agent" : "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.code(201).send({
              id: created.id,
              image_url: imageUrl,
              r2_key: uploadedKey,
            });
          } catch (e: any) {
            if (uploadedKey) {
              try {
                await deleteFromR2(uploadedKey);
              } catch (cleanupErr: any) {
                req.log.error({ cleanupErr, uploadedKey }, "Failed to cleanup R2 object after DB error");
              }
            }
            if (e?.message === "ITEM_NOT_FOUND") return reply.code(404).send({ error: "item_not_found" });
            req.log.error(e);
            return reply.code(500).send({ error: "upload_failed", message: e?.message });
          }
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/images/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_image_id" });
          const ok = await deleteItemImage(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "image_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "menu_item", action: "delete", entityId: id, summary: `Merchant deleted image #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.patch<{
        Params: { id: string };
        Querystring: { storeId: string; menuItemId: string };
      }>(
        "/images/:id/primary",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          const menuItemId = (req.query as any).menuItemId;
          if (!storeId || !menuItemId) return reply.code(400).send({ error: "storeId and menuItemId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const imageId = parseInt(req.params.id, 10);
          const itemId = parseInt(menuItemId, 10);
          if (Number.isNaN(imageId) || Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_id" });
          const ok = await setPrimaryImage(imageId, itemId, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "image_or_item_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "menu_item", action: "set_default", entityId: imageId, summary: `Merchant set primary image #${imageId} for item #${itemId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Addon groups (per-item)
      protectedApp.get<{ Params: { itemId: string }; Querystring: { storeId: string } }>(
        "/items/:itemId/addon-groups",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const list = await listAddonGroups(itemId, access.storeIdNum);
            return reply.send({ addonGroups: list });
          } catch (e: any) {
            if (e?.message === "ITEM_NOT_FOUND") return reply.code(404).send({ error: "item_not_found" });
            throw e;
          }
        }
      );

      const addonGroupCreateSchema = z.object({
        group_name: z.string().min(1).max(200),
        min_selection: z.number().int().min(0).optional(),
        max_selection: z.number().int().min(0).optional(),
        is_required: z.boolean().optional(),
        display_order: z.number().int().min(0).optional(),
      });
      const addonGroupUpdateSchema = addonGroupCreateSchema.partial();

      protectedApp.post<{
        Params: { itemId: string };
        Body: z.infer<typeof addonGroupCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:itemId/addon-groups",
        { schema: { body: addonGroupCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const created = await addAddonGroup(itemId, access.storeIdNum, req.body);
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "create", entityId: created?.id ?? null, entityName: req.body.group_name, summary: `Merchant created addon group '${req.body.group_name}' for item #${itemId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "ITEM_NOT_FOUND") return reply.code(404).send({ error: "item_not_found" });
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof addonGroupUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/addon-groups/:id",
        { schema: { body: addonGroupUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_group_id" });
          const ok = await updateAddonGroup(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "addon_group_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByAddonGroupId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "update", entityId: id, entityName: req.body.group_name ?? null, summary: `Merchant updated addon group #${id}${req.body.group_name ? ` '${req.body.group_name}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/addon-groups/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_group_id" });
          const ok = await deleteAddonGroup(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "addon_group_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByAddonGroupId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "delete", entityId: id, summary: `Merchant deleted addon group #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      const addonCreateSchema = z.object({
        addon_name: z.string().min(1).max(200),
        addon_price: z.number().min(0).optional(),
        image_url: z.string().url().max(2000).optional().nullable(),
        in_stock: z.boolean().optional(),
        display_order: z.number().int().min(0).optional(),
      });
      const addonUpdateSchema = addonCreateSchema.partial();

      protectedApp.post<{
        Params: { groupId: string };
        Body: z.infer<typeof addonCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/addon-groups/:groupId/addons",
        { schema: { body: addonCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const groupId = parseInt(req.params.groupId, 10);
          if (Number.isNaN(groupId)) return reply.code(400).send({ error: "invalid_group_id" });
          try {
            const created = await addAddon(groupId, access.storeIdNum, req.body);
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              const menuItemId = await getMenuItemIdByAddonGroupId(groupId);
              if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "create", entityId: created?.id ?? null, entityName: req.body.addon_name, summary: `Merchant created addon '${req.body.addon_name}' in group #${groupId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "ADDON_GROUP_NOT_FOUND") return reply.code(404).send({ error: "addon_group_not_found" });
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof addonUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/addons/:id",
        { schema: { body: addonUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_addon_id" });
          const ok = await updateAddon(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "addon_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByAddonId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "update", entityId: id, entityName: req.body.addon_name ?? null, summary: `Merchant updated addon #${id}${req.body.addon_name ? ` '${req.body.addon_name}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/addons/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_addon_id" });
          const ok = await deleteAddon(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "addon_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            const menuItemId = await getMenuItemIdByAddonId(id);
            if (menuItemId != null) await setItemPendingForReReview(menuItemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "delete", entityId: id, summary: `Merchant deleted addon #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      // Reusable modifier groups (Addon Library)
      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/modifier-groups",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const list = await listModifierGroups(access.storeIdNum);
          return reply.send({ modifierGroups: list });
        }
      );

      const modifierGroupCreateSchema = z.object({
        title: z.string().min(1).max(200),
        description: z.string().max(500).optional().nullable(),
        is_required: z.boolean().optional(),
        min_selection: z.number().int().min(0).optional(),
        max_selection: z.number().int().min(0).optional(),
        display_order: z.number().int().min(0).optional(),
      });
      const modifierGroupUpdateSchema = modifierGroupCreateSchema.partial();

      protectedApp.post<{ Params: { storeId: string }; Body: z.infer<typeof modifierGroupCreateSchema> }>(
        "/:storeId/modifier-groups",
        { schema: { body: modifierGroupCreateSchema } },
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          try {
            const created = await createModifierGroup(access.storeIdNum, req.body);
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "create", entityId: created?.id ?? null, entityName: req.body.title, summary: `Merchant created modifier group '${req.body.title}'`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message?.startsWith("LIMIT_")) return reply.code(403).send({ error: e.message });
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof modifierGroupUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/modifier-groups/:id",
        { schema: { body: modifierGroupUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_group_id" });
          const ok = await updateModifierGroup(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "modifier_group_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "update", entityId: id, entityName: req.body.title ?? null, summary: `Merchant updated modifier group #${id}${req.body.title ? ` '${req.body.title}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/modifier-groups/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_group_id" });
          const ok = await deleteModifierGroup(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "modifier_group_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "delete", entityId: id, summary: `Merchant deleted modifier group #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.get<{ Params: { groupId: string }; Querystring: { storeId: string } }>(
        "/modifier-groups/:groupId/options",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const groupId = parseInt(req.params.groupId, 10);
          if (Number.isNaN(groupId)) return reply.code(400).send({ error: "invalid_group_id" });
          const list = await listModifierOptions(groupId, access.storeIdNum);
          return reply.send({ options: list });
        }
      );

      const modifierOptionCreateSchema = z.object({
        name: z.string().min(1).max(200),
        price_delta: z.number().min(0).optional(),
        image_url: z.string().max(2000).optional().nullable(),
        in_stock: z.boolean().optional(),
        default_quantity: z.number().int().min(0).optional(),
        display_order: z.number().int().min(0).optional(),
      });
      const modifierOptionUpdateSchema = modifierOptionCreateSchema.partial();

      protectedApp.post<{
        Params: { groupId: string };
        Body: z.infer<typeof modifierOptionCreateSchema>;
        Querystring: { storeId: string };
      }>(
        "/modifier-groups/:groupId/options",
        { schema: { body: modifierOptionCreateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const groupId = parseInt(req.params.groupId, 10);
          if (Number.isNaN(groupId)) return reply.code(400).send({ error: "invalid_group_id" });
          try {
            const created = await addModifierOption(groupId, access.storeIdNum, req.body);
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "create", entityId: created?.id ?? null, entityName: req.body.name, summary: `Merchant created modifier option '${req.body.name}' in group #${groupId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "MODIFIER_GROUP_NOT_FOUND") return reply.code(404).send({ error: "modifier_group_not_found" });
            if (e?.message?.startsWith("LIMIT_")) return reply.code(403).send({ error: e.message });
            throw e;
          }
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof modifierOptionUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/modifier-options/:id",
        { schema: { body: modifierOptionUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_option_id" });
          const ok = await updateModifierOption(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "modifier_option_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "update", entityId: id, entityName: req.body.name ?? null, summary: `Merchant updated modifier option #${id}${req.body.name ? ` '${req.body.name}'` : ""}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/modifier-options/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_option_id" });
          const ok = await deleteModifierOption(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "modifier_option_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "addon", action: "delete", entityId: id, summary: `Merchant deleted modifier option #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.get<{ Params: { itemId: string }; Querystring: { storeId: string } }>(
        "/items/:itemId/modifier-groups",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const list = await listItemModifierGroups(itemId, access.storeIdNum);
            return reply.send({ linkedModifierGroups: list });
          } catch (e: any) {
            if (e?.message === "ITEM_NOT_FOUND") return reply.code(404).send({ error: "item_not_found" });
            throw e;
          }
        }
      );

      const itemModifierGroupLinkSchema = z.object({
        modifier_group_id: z.number().int().positive(),
        display_order: z.number().int().min(0).optional(),
      });

      protectedApp.post<{
        Params: { itemId: string };
        Body: z.infer<typeof itemModifierGroupLinkSchema>;
        Querystring: { storeId: string };
      }>(
        "/items/:itemId/modifier-groups",
        { schema: { body: itemModifierGroupLinkSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_addons) return reply.code(403).send({ error: "addons_disabled" });
          const itemId = parseInt(req.params.itemId, 10);
          if (Number.isNaN(itemId)) return reply.code(400).send({ error: "invalid_item_id" });
          try {
            const created = await linkModifierGroupToItem(itemId, req.body.modifier_group_id, access.storeIdNum, { display_order: req.body.display_order });
            if (req.auth?.role === "merchant" && req.auth?.sub) {
              await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
            }
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "addon",
                action: "link",
                entityId: req.body.modifier_group_id,
                summary: `Merchant linked modifier group #${req.body.modifier_group_id} to item #${itemId}`,
                diff: {
                  item_id: itemId,
                  modifier_group_id: req.body.modifier_group_id,
                  display_order: req.body.display_order ?? null,
                },
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "MODIFIER_GROUP_NOT_FOUND") return reply.code(404).send({ error: "modifier_group_not_found" });
            if (e?.message === "ALREADY_LINKED") return reply.code(409).send({ error: "already_linked" });
            if (e?.message?.startsWith("LIMIT_")) return reply.code(403).send({ error: e.message });
            throw e;
          }
        }
      );

      protectedApp.delete<{ Params: { itemId: string; linkId: string }; Querystring: { storeId: string } }>(
        "/items/:itemId/modifier-groups/:linkId",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_addons) return reply.code(403).send({ error: "addons_disabled" });
          const itemId = parseInt(req.params.itemId, 10);
          const linkId = parseInt(req.params.linkId, 10);
          if (Number.isNaN(itemId) || Number.isNaN(linkId)) return reply.code(400).send({ error: "invalid_id" });
          const ok = await unlinkModifierGroupFromItem(linkId, itemId, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "link_not_found" });
          if (req.auth?.role === "merchant" && req.auth?.sub) {
            await setItemPendingForReReview(itemId, access.storeIdNum, { changed_by: req.auth.sub, changed_by_role: "merchant" });
          }
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "addon",
              action: "unlink",
              entityId: linkId,
              summary: `Merchant unlinked modifier group link #${linkId} from item #${itemId}`,
              diff: {
                item_id: itemId,
                modifier_group_link_id: linkId,
              },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true });
        }
      );

      // Combos
      protectedApp.get<{ Params: { storeId: string } }>(
        "/:storeId/combos",
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const list = await listCombos(access.storeIdNum);
          return reply.send({ combos: list });
        }
      );

      const comboCreateSchema = z.object({
        combo_name: z.string().min(1).max(300),
        description: z.string().max(2000).optional().nullable(),
        combo_price: z.number().min(0),
        image_url: z.string().url().max(2000).optional().nullable(),
        display_order: z.number().int().min(0).optional(),
        combo_type: z.enum(["FIXED", "CUSTOMIZABLE"]).optional().nullable(),
        pricing_strategy: z.enum(["FIXED_PRICE", "DERIVE_FROM_COMPONENTS", "HYBRID"]).optional().nullable(),
        combo_metadata: z.any().optional().nullable(),
      });
      const comboUpdateSchema = z.object({
        combo_name: z.string().min(1).max(300).optional(),
        description: z.string().max(2000).optional().nullable(),
        combo_price: z.number().min(0).optional(),
        image_url: z.string().url().max(2000).optional().nullable(),
        is_active: z.boolean().optional(),
        display_order: z.number().int().min(0).optional(),
        combo_type: z.enum(["FIXED", "CUSTOMIZABLE"]).optional().nullable(),
        pricing_strategy: z.enum(["FIXED_PRICE", "DERIVE_FROM_COMPONENTS", "HYBRID"]).optional().nullable(),
        combo_metadata: z.any().optional().nullable(),
      });
      const comboComponentSchema = z.object({
        menu_item_id: z.number().int().positive(),
        variant_id: z.number().int().positive().optional().nullable(),
        quantity: z.number().int().min(1).optional(),
        display_order: z.number().int().min(0).optional(),
      });

      protectedApp.post<{ Params: { storeId: string }; Body: z.infer<typeof comboCreateSchema> }>(
        "/:storeId/combos",
        { schema: { body: comboCreateSchema } },
        async (req, reply) => {
          const access = await getStore(req, reply, req.params.storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_combos) return reply.code(403).send({ error: "combos_disabled" });
          const created = await createCombo(access.storeIdNum, req.body);
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "combo",
              action: "create",
              entityId: created?.id ?? null,
              entityName: req.body.combo_name,
              summary: `Merchant created combo '${req.body.combo_name}'`,
              diff: {
                combo_type: req.body.combo_type ?? null,
                pricing_strategy: req.body.pricing_strategy ?? null,
                combo_metadata: req.body.combo_metadata ?? null,
              },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}
          return reply.code(201).send(created);
        }
      );

      protectedApp.get<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/combos/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_combo_id" });
          const combo = await getCombo(id, access.storeIdNum);
          if (!combo) return reply.code(404).send({ error: "combo_not_found" });
          return reply.send(combo);
        }
      );

      protectedApp.put<{
        Params: { id: string };
        Body: z.infer<typeof comboUpdateSchema>;
        Querystring: { storeId: string };
      }>(
        "/combos/:id",
        { schema: { body: comboUpdateSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_combos) return reply.code(403).send({ error: "combos_disabled" });
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_combo_id" });
          const ok = await updateCombo(id, access.storeIdNum, req.body);
          if (!ok) return reply.code(404).send({ error: "combo_not_found" });
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "combo",
              action: "update",
              entityId: id,
              entityName: req.body.combo_name ?? null,
              summary: `Merchant updated combo #${id}${req.body.combo_name ? ` '${req.body.combo_name}'` : ""}`,
              diff: {
                patch: req.body,
              },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.delete<{ Params: { id: string }; Querystring: { storeId: string } }>(
        "/combos/:id",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_combos) return reply.code(403).send({ error: "combos_disabled" });
          const id = parseInt(req.params.id, 10);
          if (Number.isNaN(id)) return reply.code(400).send({ error: "invalid_combo_id" });
          const ok = await deleteCombo(id, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "combo_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "combo", action: "delete", entityId: id, summary: `Merchant deleted combo #${id}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );

      protectedApp.post<{
        Params: { comboId: string };
        Body: z.infer<typeof comboComponentSchema>;
        Querystring: { storeId: string };
      }>(
        "/combos/:comboId/components",
        { schema: { body: comboComponentSchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_combos) return reply.code(403).send({ error: "combos_disabled" });
          const comboId = parseInt(req.params.comboId, 10);
          if (Number.isNaN(comboId)) return reply.code(400).send({ error: "invalid_combo_id" });
          try {
            const created = await addComboComponent(comboId, access.storeIdNum, req.body);
            try {
              await logStoreActivity({
                storeId: access.storeIdNum,
                section: "combo_component",
                action: "create",
                entityId: created?.id ?? null,
                summary: `Merchant added component to combo #${comboId}`,
                diff: {
                  combo_id: comboId,
                  component: req.body,
                },
                actorType: "merchant",
                source: "merchant_app",
              });
            } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "COMBO_NOT_FOUND") return reply.code(404).send({ error: "combo_not_found" });
            throw e;
          }
        }
      );

      protectedApp.delete<{ Params: { componentId: string }; Querystring: { storeId: string } }>(
        "/combos/components/:componentId",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const cfg = await getStoreTypeConfigForStore(access.storeIdNum);
          if (!cfg.enable_combos) return reply.code(403).send({ error: "combos_disabled" });
          const componentId = parseInt(req.params.componentId, 10);
          if (Number.isNaN(componentId)) return reply.code(400).send({ error: "invalid_component_id" });
          const ok = await deleteComboComponent(componentId, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "component_not_found" });
          try {
            await logStoreActivity({
              storeId: access.storeIdNum,
              section: "combo_component",
              action: "delete",
              entityId: componentId,
              summary: `Merchant removed component #${componentId} from combo`,
              diff: {
                combo_component_id: componentId,
              },
              actorType: "merchant",
              source: "merchant_app",
            });
          } catch {}
          return reply.send({ ok: true });
        }
      );

      // Category availability windows
      protectedApp.get<{ Params: { categoryId: string }; Querystring: { storeId: string } }>(
        "/categories/:categoryId/availability",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const categoryId = parseInt(req.params.categoryId, 10);
          if (Number.isNaN(categoryId)) return reply.code(400).send({ error: "invalid_category_id" });
          const list = await listCategoryAvailability(categoryId, access.storeIdNum);
          return reply.send({ windows: list });
        }
      );

      const availabilitySchema = z.object({
        day_of_week: z.number().int().min(0).max(6),
        start_time: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
        end_time: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
      });

      protectedApp.post<{
        Params: { categoryId: string };
        Body: z.infer<typeof availabilitySchema>;
        Querystring: { storeId: string };
      }>(
        "/categories/:categoryId/availability",
        { schema: { body: availabilitySchema } },
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const categoryId = parseInt(req.params.categoryId, 10);
          if (Number.isNaN(categoryId)) return reply.code(400).send({ error: "invalid_category_id" });
          try {
            const created = await addCategoryAvailability(categoryId, access.storeIdNum, req.body);
            try { await logStoreActivity({ storeId: access.storeIdNum, section: "category", action: "create", entityId: categoryId, summary: `Merchant added availability window for category #${categoryId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
            return reply.code(201).send(created);
          } catch (e: any) {
            if (e?.message === "CATEGORY_NOT_FOUND") return reply.code(404).send({ error: "category_not_found" });
            throw e;
          }
        }
      );

      protectedApp.delete<{ Params: { windowId: string }; Querystring: { storeId: string } }>(
        "/categories/availability/:windowId",
        async (req, reply) => {
          const storeId = (req.query as any).storeId;
          if (!storeId) return reply.code(400).send({ error: "storeId query required" });
          const access = await getStore(req, reply, storeId);
          if (!access) return;
          const windowId = parseInt(req.params.windowId, 10);
          if (Number.isNaN(windowId)) return reply.code(400).send({ error: "invalid_window_id" });
          const ok = await deleteCategoryAvailability(windowId, access.storeIdNum);
          if (!ok) return reply.code(404).send({ error: "window_not_found" });
          try { await logStoreActivity({ storeId: access.storeIdNum, section: "category", action: "delete", entityId: windowId, summary: `Merchant deleted availability window #${windowId}`, actorType: "merchant", source: "merchant_app" }); } catch {}
          return reply.send({ ok: true });
        }
      );
    },
    { prefix: "/merchant-menu" }
  );
}
