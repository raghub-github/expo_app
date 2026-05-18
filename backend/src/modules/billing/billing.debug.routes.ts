/**
 * Debug routes for delivery / ETA resolution — admins/devs only.
 *
 * The bill says "Delivery fee (default)" instead of "(slabs)" → these
 * endpoints surface every intermediate step so you can see EXACTLY where the
 * resolver dropped out:
 *
 *   GET /v1/billing-debug/states
 *     → every row in the `states` table (id, name, code if present)
 *
 *   GET /v1/billing-debug/geo-trace?pincode=721443
 *     → pincode_id, state_id from the chain join + prefix-derived state name +
 *       state UUID matched by the relaxed lookup
 *
 *   GET /v1/billing-debug/slabs?state_id=...&service_type=food&actor_type=customer
 *     → slabs the engine would load for that geo level, with field-by-field
 *       enum values so casing/spacing mismatches are obvious
 *
 * Wide-open by design (read-only, no PII). Remove or auth-gate once the geo
 * data is stable.
 */
import type { FastifyInstance } from "fastify";
import { getSql } from "../../db/client.js";
import { resolveDropGeoRefsFromPincode } from "./geoRefFromPincode.js";
import { stateNameFromPincode } from "./pincodePrefixToState.js";

export async function billingDebugRoutes(app: FastifyInstance) {
  app.get("/states", async (_req, reply) => {
    const sql = getSql();
    try {
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT id, name,
          (SELECT column_name FROM information_schema.columns
           WHERE table_name='states' AND column_name='code' LIMIT 1) AS has_code_col
        FROM states ORDER BY name LIMIT 200
      `;
      // Now actually fetch with code if the column exists.
      let withCode: Array<Record<string, unknown>> | null = null;
      try {
        withCode = (await sql<Array<Record<string, unknown>>>`
          SELECT id, name, code FROM states ORDER BY name LIMIT 200
        `) as unknown as Array<Record<string, unknown>>;
      } catch {
        withCode = null;
      }
      return reply.send({
        ok: true,
        count: rows.length,
        rows: withCode ?? rows,
      });
    } catch (e) {
      return reply.code(500).send({ ok: false, error: (e as Error).message });
    }
  });

  app.get("/geo-trace", async (req, reply) => {
    const pincode = String((req.query as { pincode?: string }).pincode ?? "").trim();
    if (!pincode) return reply.code(400).send({ ok: false, error: "?pincode= required" });
    const sql = getSql();

    // 1. Raw `pincodes` row.
    let pincodeRow: Record<string, unknown> | null = null;
    try {
      const r = await sql<Array<Record<string, unknown>>>`
        SELECT * FROM pincodes WHERE pincode = ${pincode} LIMIT 1
      `;
      pincodeRow = r[0] ?? null;
    } catch (e) {
      pincodeRow = { _error: (e as Error).message };
    }

    // 2. Pincode → state chain join (replicates what resolveDropGeoRefsFromPincode does).
    let chainResolved: Record<string, unknown> | null = null;
    try {
      const r = await sql<Array<Record<string, unknown>>>`
        SELECT
          p.id AS pincode_id,
          po.id AS post_office_id,
          dv.id AS division_id,
          d.id  AS district_id,
          r.id  AS region_id,
          s.id  AS state_id,
          s.name AS state_name
        FROM pincodes p
        LEFT JOIN LATERAL (
          SELECT ppo.post_office_id FROM pincode_post_offices ppo
          WHERE ppo.pincode_id = p.id ORDER BY ppo.post_office_id LIMIT 1
        ) pick ON true
        LEFT JOIN post_offices po ON po.id = pick.post_office_id
        LEFT JOIN divisions dv ON dv.id = po.division_id
        LEFT JOIN districts d ON d.id = dv.district_id
        LEFT JOIN regions r ON r.id = d.region_id
        LEFT JOIN states s ON s.id = r.state_id
        WHERE p.pincode = ${pincode}
        LIMIT 1
      `;
      chainResolved = r[0] ?? null;
    } catch (e) {
      chainResolved = { _error: (e as Error).message };
    }

    // 3. Prefix → state name (deterministic).
    const prefixStateName = stateNameFromPincode(pincode);

    // 4. Full resolver output (uses chain + prefix fallback).
    const resolved = await resolveDropGeoRefsFromPincode(pincode);

    return reply.send({
      ok: true,
      pincode,
      pincode_table_row: pincodeRow,
      chain_join: chainResolved,
      prefix_state_name: prefixStateName,
      resolver_output: resolved,
    });
  });

  app.get("/slabs", async (req, reply) => {
    const q = req.query as { state_id?: string; service_type?: string; actor_type?: string };
    if (!q.state_id) return reply.code(400).send({ ok: false, error: "?state_id= required" });
    const sql = getSql();
    const serviceType = (q.service_type ?? "food").toLowerCase();
    const actorType = (q.actor_type ?? "customer").toLowerCase();
    try {
      const rows = await sql<Array<Record<string, unknown>>>`
        SELECT id, geo_level::text AS geo_level, geo_ref_id::text AS geo_ref_id,
               service_type::text AS service_type, actor_type::text AS actor_type,
               min_km::text AS min_km, max_km::text AS max_km,
               base_fare::text AS base_fare, per_km_rate::text AS per_km_rate,
               min_charge::text AS min_charge, priority, is_active
        FROM delivery_rate_slabs
        WHERE geo_ref_id = ${q.state_id}::uuid
          AND service_type = ${serviceType}::order_type
          AND actor_type = ${actorType}::delivery_actor_type
        ORDER BY min_km, created_at
      `;
      return reply.send({
        ok: true,
        state_id: q.state_id,
        service_type: serviceType,
        actor_type: actorType,
        count: rows.length,
        rows,
      });
    } catch (e) {
      return reply.code(500).send({ ok: false, error: (e as Error).message });
    }
  });
}
