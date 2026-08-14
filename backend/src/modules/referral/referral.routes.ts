/**
 * Referral API — customer, rider, and merchant share the same engine.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { auth } from "../../plugins/auth.js";
import { getSql } from "../../db/client.js";
import {
  getReferralConfig,
  playStorePackageFor,
  startReferralConfigCacheListener,
  toPublicReferralConfig,
  type ReferralUserType,
} from "./referral.config.service.js";
import {
  applyReferral,
  getMyReferralProfile,
  recordReferralInstallClick,
  resolveReferralPublicBase,
  resolveReferralPublicBaseFor,
} from "./referral.tracking.service.js";
import { buildReferralLandingHtml } from "./referral.deep-link.js";
import {
  buildPersonalizedShareMessage,
  buildReferralRewardSummary,
} from "./referral.reward-summary.js";
import { referralAdminRoutes, registerReferralSettingsAlias } from "./referral.admin.routes.js";
import { recordLifecycleEvent } from "./referral.lifecycle.service.js";
import { referralTrackingEnabled } from "./referral.participants.js";
import { internalSecretGrantsReferralOnboarding } from "./referral.admin-auth.js";
import {
  applyMerchantReferralForParent,
  classifyMerchantReferralError,
  merchantReferralPublicMessage,
  previewReferralCode,
} from "./referral.onboarding.js";
import {
  httpStatusForReferralApplyError,
  isReferralServiceDisabledError,
  referralServiceDisabledPayload,
  REFERRAL_SERVICE_DISABLED,
} from "./referral.errors.js";

function parseNumericPk(sub: string): number | null {
  const trimmed = sub.trim();
  const usr = /^usr_(\d+)$/.exec(trimmed);
  if (usr) {
    const n = Number(usr[1]);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

async function resolveActor(
  role: string | undefined,
  sub: string | undefined,
  phone?: string | null,
): Promise<{
  userType: ReferralUserType;
  userId: number;
  phone: string | null;
  fullName: string | null;
} | null> {
  if (!role || !sub) return null;
  const sql = getSql();
  if (role === "customer") {
    // customers.primary_mobile (there is no customers.phone column)
    const [row] = await sql<Array<{ id: string; phone: string | null; full_name: string | null }>>`
      SELECT id::text, primary_mobile AS phone, full_name
      FROM customers
      WHERE customer_id = ${sub} OR id::text = ${sub}
      LIMIT 1
    `;
    if (!row) return null;
    return {
      userType: "customer",
      userId: Number(row.id),
      phone: row.phone,
      fullName: row.full_name,
    };
  }
  if (role === "rider") {
    // Rider JWT `sub` is `usr_{numericId}` (see auth.routes.ts), not a raw bigint.
    const riderPk = parseNumericPk(sub);
    const phoneKey = phone?.trim() || null;
    const [row] = riderPk
      ? await sql<Array<{ id: string; phone: string | null; full_name: string | null }>>`
          SELECT id::text, mobile AS phone, name AS full_name
          FROM riders
          WHERE id = ${riderPk}
          LIMIT 1
        `
      : phoneKey
        ? await sql<Array<{ id: string; phone: string | null; full_name: string | null }>>`
            SELECT id::text, mobile AS phone, name AS full_name
            FROM riders
            WHERE mobile = ${phoneKey}
            LIMIT 1
          `
        : await sql<Array<{ id: string; phone: string | null; full_name: string | null }>>`
            SELECT id::text, mobile AS phone, name AS full_name
            FROM riders
            WHERE ('usr_' || id::text) = ${sub}
            LIMIT 1
          `;
    if (!row) return null;
    return {
      userType: "rider",
      userId: Number(row.id),
      phone: row.phone,
      fullName: row.full_name,
    };
  }
  if (role === "merchant") {
    const [row] = await sql<Array<{ id: string; phone: string | null; full_name: string | null }>>`
      SELECT id::text, registered_phone AS phone,
             COALESCE(owner_name, parent_name, brand_name) AS full_name
      FROM merchant_parents
      WHERE parent_merchant_id = ${sub} OR id::text = ${sub}
      LIMIT 1
    `;
    if (!row) return null;
    return {
      userType: "merchant",
      userId: Number(row.id),
      phone: row.phone,
      fullName: row.full_name,
    };
  }
  return null;
}

export async function referralRoutes(app: FastifyInstance) {
  startReferralConfigCacheListener();
  await registerReferralSettingsAlias(app);

  // Public live config (no auth) — apps poll + compare configVersion
  app.get(
    "/config",
    {
      schema: {
        querystring: z.object({
          userType: z.enum(["customer", "rider", "merchant"]).default("customer"),
          sinceVersion: z.coerce.number().int().optional(),
          fresh: z.string().optional(),
        }),
      },
    },
    async (req, reply) => {
      try {
        const q = req.query as { userType: ReferralUserType; sinceVersion?: number; fresh?: string };
        const { settings, rules } = await getReferralConfig({
          force: q.fresh === "1" || q.fresh === "true",
        });
        if (
          q.sinceVersion != null &&
          Number.isFinite(q.sinceVersion) &&
          settings.config_version <= q.sinceVersion
        ) {
          return reply
            .header("ETag", `W/"ref-cfg-${settings.config_version}"`)
            .header("Cache-Control", "no-store")
            .code(304)
            .send();
        }
        const body = toPublicReferralConfig(settings, rules, q.userType);
        return reply
          .header("ETag", `W/"ref-cfg-${settings.config_version}"`)
          .header("Cache-Control", "no-store")
          .send({ ok: true, ...body });
      } catch (e) {
        const msg = (e as Error).message;
        if (msg === "referral_settings_missing") {
          return reply.code(503).send({ ok: false, error: "referral_not_migrated" });
        }
        throw e;
      }
    },
  );

  app.get(
    "/milestones",
    {
      schema: {
        querystring: z.object({
          userType: z.enum(["customer", "rider", "merchant"]).default("rider"),
        }),
      },
    },
    async (req) => {
      const q = req.query as { userType: ReferralUserType };
      const { settings, rules } = await getReferralConfig();
      const pub = toPublicReferralConfig(settings, rules, q.userType);
      return { ok: true, milestones: pub.milestones, configVersion: pub.configVersion };
    },
  );

  app.get(
    "/preview",
    {
      schema: {
        querystring: z.object({
          code: z.string().min(3).max(32),
          userType: z.enum(["customer", "rider", "merchant"]).default("merchant"),
        }),
      },
    },
    async (req, reply) => {
      const q = req.query as { code: string; userType: ReferralUserType };
      const result = await previewReferralCode({
        referralCode: q.code,
        userType: q.userType,
      });
      if (!result.ok) {
        const status = httpStatusForReferralApplyError(result.error);
        const extra = isReferralServiceDisabledError(result.error)
          ? referralServiceDisabledPayload()
          : {};
        return reply.code(status).send({
          ...result,
          ...extra,
          message: result.message,
        });
      }
      return result;
    },
  );

  app.post(
    "/internal/apply-onboarding",
    {
      schema: {
        body: z.object({
          referralCode: z.string().min(3).max(32),
          parentMerchantId: z.union([z.number().int().positive(), z.string().min(1).max(32)]),
          source: z
            .enum(["deep_link", "play_install_referrer", "manual", "share_sheet", "unknown"])
            .optional(),
          referredPhone: z.string().max(20).optional(),
          createIfMissing: z.boolean().optional(),
        }),
      },
    },
    async (req, reply) => {
      if (!internalSecretGrantsReferralOnboarding(req)) {
        return reply.code(403).send({ ok: false, error: "forbidden" });
      }
      const body = req.body as {
        referralCode: string;
        parentMerchantId: number | string;
        source?: "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";
        referredPhone?: string;
        createIfMissing?: boolean;
      };
      const result = await applyMerchantReferralForParent({
        parentMerchantId: body.parentMerchantId,
        referralCode: body.referralCode,
        source: body.source ?? "manual",
        referredPhone: body.referredPhone ?? null,
        ip: req.ip,
        userAgent: String(req.headers["user-agent"] ?? ""),
        createIfMissing: body.createIfMissing,
      });
      if ("skipped" in result && result.skipped) {
        return { ok: true, skipped: true, reason: result.reason };
      }
      if (!result.ok) {
        const status = httpStatusForReferralApplyError(result.error);
        const extra = isReferralServiceDisabledError(result.error)
          ? referralServiceDisabledPayload()
          : null;
        return reply.code(status).send({
          ok: false,
          error: extra?.error ?? result.error,
          publicError: classifyMerchantReferralError(result.error),
          message: extra?.userMessage ?? merchantReferralPublicMessage(result.error),
          flags: result.flags,
          ...(extra ?? {}),
        });
      }
      return result;
    },
  );

  // Authenticated surface
  await app.register(async (scoped) => {
    await scoped.register(auth, { required: true });

    scoped.get("/me", async (req, reply) => {
      try {
        const actor = await resolveActor(req.auth?.role, req.auth?.sub, req.auth?.phone);
        if (!actor) return reply.code(403).send({ ok: false, error: "forbidden" });
        const { settings, rules } = await getReferralConfig();
        const profile = await getMyReferralProfile({
          userType: actor.userType,
          userId: actor.userId,
        });
        return {
          ok: true,
          ...profile,
          config: toPublicReferralConfig(settings, rules, actor.userType),
        };
      } catch (err) {
        console.warn("[referral] /me failed", (err as Error).message);
        return reply.code(500).send({ ok: false, error: "referral_profile_failed" });
      }
    });

    scoped.get("/history", async (req, reply) => {
      const actor = await resolveActor(req.auth?.role, req.auth?.sub, req.auth?.phone);
      if (!actor) return reply.code(403).send({ ok: false, error: "forbidden" });
      const profile = await getMyReferralProfile({
        userType: actor.userType,
        userId: actor.userId,
      });
      return { ok: true, history: profile.history, stats: profile.stats };
    });

    scoped.post(
      "/share",
      {
        schema: {
          body: z.object({
            channel: z
              .enum(["whatsapp", "telegram", "sms", "copy", "native", "other"])
              .optional(),
          }),
        },
      },
      async (req, reply) => {
        const actor = await resolveActor(req.auth?.role, req.auth?.sub, req.auth?.phone);
        if (!actor) return reply.code(403).send({ ok: false, error: "forbidden" });
        const { settings, rules } = await getReferralConfig();
        if (!referralTrackingEnabled(settings, actor.userType)) {
          return reply.code(409).send(referralServiceDisabledPayload());
        }
        const profile = await getMyReferralProfile({
          userType: actor.userType,
          userId: actor.userId,
        });
        if (!profile.referralCode || !profile.shareUrl) {
          return reply.code(400).send({ ok: false, error: "no_referral_code" });
        }
        const summary = buildReferralRewardSummary(settings, rules, actor.userType);
        const message = buildPersonalizedShareMessage({
          referrerName: actor.fullName,
          referralCode: profile.referralCode,
          shareUrl: profile.shareUrl,
          summary,
          audience: actor.userType,
        });
        return {
          ok: true,
          referralCode: profile.referralCode,
          shareUrl: profile.shareUrl,
          message,
          rewardSummary: summary,
          referrerName: actor.fullName,
          channel: (req.body as { channel?: string })?.channel ?? "native",
        };
      },
    );

    scoped.post(
      "/apply",
      {
        schema: {
          body: z.object({
            referralCode: z.string().min(3).max(32).optional(),
            clickToken: z.string().min(8).max(64).optional(),
            playReferrer: z.string().min(3).max(128).optional(),
            source: z
              .enum(["deep_link", "play_install_referrer", "manual", "share_sheet", "unknown"])
              .optional(),
            deviceFingerprint: z.string().max(128).optional(),
          }),
        },
      },
      async (req, reply) => {
        const actor = await resolveActor(req.auth?.role, req.auth?.sub, req.auth?.phone);
        if (!actor) return reply.code(403).send({ ok: false, error: "forbidden" });
        const body = req.body as {
          referralCode?: string;
          clickToken?: string;
          playReferrer?: string;
          source?: "deep_link" | "play_install_referrer" | "manual" | "share_sheet" | "unknown";
          deviceFingerprint?: string;
        };

        let code = body.referralCode?.trim().toUpperCase() ?? "";
        if (!code && body.playReferrer) {
          const { settings } = await getReferralConfig();
          const prefix = settings.deep_link.referrer_prefix || "ref_";
          const raw = body.playReferrer.trim();
          code = raw.toLowerCase().startsWith(prefix.toLowerCase())
            ? raw.slice(prefix.length).toUpperCase()
            : raw.toUpperCase();
        }

        if (!code && !body.clickToken) {
          return reply.code(400).send({ ok: false, error: "referral_code_required" });
        }

        // Resolve code from click token if needed
        if (!code && body.clickToken) {
          const sql = getSql();
          const [click] = await sql<Array<{ referral_code: string }>>`
            SELECT referral_code FROM referral_install_clicks
            WHERE click_token = ${body.clickToken} AND expires_at > NOW()
            LIMIT 1
          `;
          code = click?.referral_code ?? "";
        }

        const result = await applyReferral({
          userType: actor.userType,
          referredUserId: actor.userId,
          referralCode: code,
          source: body.source ?? (body.playReferrer ? "play_install_referrer" : body.clickToken ? "deep_link" : "manual"),
          clickToken: body.clickToken,
          installAttributed: Boolean(body.playReferrer || body.clickToken || body.source === "deep_link"),
          deviceFingerprint: body.deviceFingerprint,
          ip: req.ip,
          userAgent: req.headers["user-agent"],
          referredPhone: actor.phone,
        });

        if (!result.ok) {
          const extra = isReferralServiceDisabledError(result.error)
            ? referralServiceDisabledPayload()
            : {};
          return reply.code(httpStatusForReferralApplyError(result.error)).send({
            ...result,
            ...extra,
            error: isReferralServiceDisabledError(result.error)
              ? REFERRAL_SERVICE_DISABLED
              : result.error,
          });
        }
        return result;
      },
    );

    scoped.post(
      "/validate",
      {
        schema: {
          body: z.object({ referralCode: z.string().min(3).max(32) }),
        },
      },
      async (req, reply) => {
        const actor = await resolveActor(req.auth?.role, req.auth?.sub, req.auth?.phone);
        if (!actor) return reply.code(403).send({ ok: false, error: "forbidden" });
        const { settings } = await getReferralConfig();
        if (!referralTrackingEnabled(settings, actor.userType)) {
          return reply.code(409).send(referralServiceDisabledPayload());
        }
        const code = (req.body as { referralCode: string }).referralCode.trim().toUpperCase();
        const sql = getSql();
        const [row] = await sql<Array<{ user_type: string; user_id: string }>>`
          SELECT user_type::text, user_id::text FROM referral_codes
          WHERE referral_code = ${code} AND active = true
          LIMIT 1
        `;
        if (!row) return { ok: false, valid: false, error: "invalid_code" };
        if (row.user_type !== actor.userType) {
          return { ok: false, valid: false, error: "code_user_type_mismatch" };
        }
        if (Number(row.user_id) === actor.userId) {
          return { ok: false, valid: false, error: "self_referral" };
        }
        return { ok: true, valid: true, userType: row.user_type };
      },
    );
  });

  await app.register(referralAdminRoutes);
}

/** Public HTML landing + click token for /ref/:code and /invite/:code */
export async function referralPublicLandingRoutes(app: FastifyInstance) {
  const handler = async (
    req: { params: { code: string }; ip: string; headers: Record<string, unknown> },
    reply: {
      type: (t: string) => unknown;
      status: (n: number) => { send: (b: string) => unknown };
      send: (b: string) => unknown;
    },
  ) => {
    const code = String(req.params.code ?? "").trim().toUpperCase();
    if (!code || code.length < 3) {
      return reply.status(400).send("Invalid referral link");
    }
    const click = await recordReferralInstallClick({
      referralCode: code,
      userType: "customer",
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] ?? ""),
    });
    if (!click) {
      return reply.status(404).send("Referral code not found");
    }
    await recordLifecycleEvent({
      clickToken: click.clickToken,
      referralCode: code,
      userType: "customer",
      toState: "LINK_CLICKED",
      eventName: "link_clicked",
      metadata: { ip: req.ip },
      force: true,
    });
    await recordLifecycleEvent({
      clickToken: click.clickToken,
      referralCode: code,
      userType: "customer",
      fromState: "LINK_CLICKED",
      toState: "PLAY_STORE_OPENED",
      eventName: "play_store_redirect_prepared",
      force: true,
    });
    const { settings, rules } = await getReferralConfig();
    const summary = buildReferralRewardSummary(settings, rules, "customer");
    const serviceOff = !referralTrackingEnabled(settings, "customer");
    const html = buildReferralLandingHtml({
      code,
      clickToken: click.clickToken,
      playReferrer: click.playReferrer,
      packageName: playStorePackageFor(settings, "customer"),
      publicBase: resolveReferralPublicBase(),
      canonicalPrefix: settings.deep_link.customer_path_prefix,
      headline: serviceOff
        ? "This referral code is no longer available."
        : summary.headline,
      rewardLines: serviceOff ? [] : summary.inviteeLines,
      ogSummary: serviceOff ? "This referral code is no longer available." : summary.ogSummary,
      audience: "customer",
    });
    return (reply as { type: (t: string) => { send: (b: string) => unknown } })
      .type("text/html; charset=utf-8")
      .send(html);
  };

  app.get("/ref/:code", handler as never);
  app.get("/invite/:code", handler as never);

  app.get("/rider-ref/:code", async (req, reply) => {
    const code = String((req.params as { code: string }).code ?? "").trim().toUpperCase();
    if (!code) return reply.status(400).send("Invalid referral link");
    const click = await recordReferralInstallClick({
      referralCode: code,
      userType: "rider",
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] ?? ""),
    });
    if (!click) return reply.status(404).send("Referral code not found");
    const { settings, rules } = await getReferralConfig();
    const summary = buildReferralRewardSummary(settings, rules, "rider");
    const serviceOff = !referralTrackingEnabled(settings, "rider");
    const html = buildReferralLandingHtml({
      code,
      clickToken: click.clickToken,
      playReferrer: click.playReferrer,
      packageName: playStorePackageFor(settings, "rider"),
      publicBase: resolveReferralPublicBase(),
      appScheme: "gatimitra-rider",
      path: "referral",
      canonicalPrefix: settings.deep_link.rider_path_prefix,
      headline: serviceOff
        ? "This referral code is no longer available."
        : summary.headline,
      rewardLines: serviceOff ? [] : summary.inviteeLines,
      ogSummary: serviceOff ? "This referral code is no longer available." : summary.ogSummary,
      audience: "rider",
    });
    return reply.type("text/html; charset=utf-8").send(html);
  });

  app.get("/merchant-ref/:code", async (req, reply) => {
    const code = String((req.params as { code: string }).code ?? "").trim().toUpperCase();
    if (!code) return reply.status(400).send("Invalid referral link");
    const click = await recordReferralInstallClick({
      referralCode: code,
      userType: "merchant",
      ip: req.ip,
      userAgent: String(req.headers["user-agent"] ?? ""),
    });
    if (!click) return reply.status(404).send("Referral code not found");
    const dest = new URL(
      `/merchant-ref/${encodeURIComponent(code)}`,
      `${resolveReferralPublicBaseFor("merchant")}/`,
    );
    dest.searchParams.set("click", click.clickToken);
    return reply.redirect(dest.toString(), 302);
  });
}
