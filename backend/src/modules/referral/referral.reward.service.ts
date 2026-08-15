/**
 * Reward credit strategies — Customer GatiCash vs Rider wallet_ledger.
 */

import { getSql } from "../../db/client.js";
import { emitEvent } from "../notifications/eventBus.js";
import {
  getReferralSettings,
  renderReferralTemplate,
  type ReferralRewardRule,
  type ReferralUserType,
} from "./referral.config.service.js";
import { assertCampaignBudgetAvailable, withCampaignBudgetLock } from "./referral.budget.js";
import { assertReferralUserEligible } from "./referral.eligibility.js";

function monthKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function getMonthlyUsage(
  userType: ReferralUserType,
  userId: number,
): Promise<number> {
  const sql = getSql();
  const [row] = await sql<Array<{ total: string }>>`
    SELECT total_rewards::text AS total
    FROM referral_monthly_usage
    WHERE user_type = ${userType}::referral_user_type
      AND user_id = ${userId}
      AND month = ${monthKey()}
    LIMIT 1
  `.catch(() => [] as Array<{ total: string }>);
  return Number(row?.total ?? 0);
}

async function addMonthlyUsage(
  userType: ReferralUserType,
  userId: number,
  amount: number,
): Promise<void> {
  const sql = getSql();
  await sql`
    INSERT INTO referral_monthly_usage (user_type, user_id, month, total_rewards, reward_count, updated_at)
    VALUES (
      ${userType}::referral_user_type,
      ${userId},
      ${monthKey()},
      ${amount},
      1,
      NOW()
    )
    ON CONFLICT (user_type, user_id, month) DO UPDATE
      SET total_rewards = referral_monthly_usage.total_rewards + EXCLUDED.total_rewards,
          reward_count = referral_monthly_usage.reward_count + 1,
          updated_at = NOW()
  `;
}

async function resolveCustomerNotificationId(customerPk: number): Promise<string | null> {
  const sql = getSql();
  const [row] = await sql<Array<{ customer_id: string | null }>>`
    SELECT customer_id FROM customers WHERE id = ${customerPk} LIMIT 1
  `;
  return row?.customer_id ?? null;
}

async function creditCustomerGatiCash(opts: {
  customerPk: number;
  amount: number;
  relationshipId: number;
  ruleId: number | null;
  party: "referrer" | "referred";
  idempotencyKey: string;
  campaignId?: number | null;
  referralCode?: string | null;
  referrerId?: number | null;
  referredUserId?: number | null;
}): Promise<{ txId: number | null; skipped?: string }> {
  const sql = getSql();
  const [existing] = await sql<Array<{ id: string; status: string }>>`
    SELECT id::text, status::text
    FROM referral_reward_transactions
    WHERE idempotency_key = ${opts.idempotencyKey}
    LIMIT 1
  `;
  if (existing?.status === "credited") {
    return { txId: Number(existing.id) };
  }

  const budget = await assertCampaignBudgetAvailable(opts.amount);
  if (!budget.ok) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'customer'::referral_user_type,
        ${opts.customerPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'GATICASH'::referral_reward_type, 'skipped_cap'::referral_reward_tx_status,
        ${opts.idempotencyKey}, 'campaign_budget_exhausted'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { txId: null, skipped: budget.skipped };
  }

  const settings = await getReferralSettings();
  if (!settings.reward_enabled || !settings.customer_reward_enabled) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'customer'::referral_user_type,
        ${opts.customerPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'GATICASH'::referral_reward_type, 'skipped_disabled'::referral_reward_tx_status,
        ${opts.idempotencyKey}, 'rewards_disabled'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { txId: null, skipped: "rewards_disabled" };
  }

  const used = await getMonthlyUsage("customer", opts.customerPk);
  // Cap applies to referrer earnings primarily
  if (opts.party === "referrer" && used + opts.amount > settings.monthly_reward_cap) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'customer'::referral_user_type,
        ${opts.customerPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'GATICASH'::referral_reward_type, 'skipped_cap'::referral_reward_tx_status,
        ${opts.idempotencyKey}, 'monthly_cap'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    await sql`
      UPDATE referral_relationships
      SET status = 'cap_reached', reward_status = 'cap_reached', updated_at = NOW()
      WHERE id = ${opts.relationshipId}
    `;
    return { txId: null, skipped: "monthly_cap" };
  }

  const [credit] = await sql<Array<{ tx_id: string }>>`
    SELECT public.customer_wallet_credit(
      ${opts.customerPk},
      ${opts.amount},
      'BONUS'::public.wallet_transaction_type,
      ${String(opts.relationshipId)},
      ${"referral"},
      ${`Referral reward (${opts.party})`},
      NULL,
      ${opts.idempotencyKey},
      ${JSON.stringify({
        relationshipId: opts.relationshipId,
        ruleId: opts.ruleId,
        party: opts.party,
        campaignId: opts.campaignId ?? null,
        referralCode: opts.referralCode ?? null,
        referrerId: opts.referrerId ?? null,
        referredUserId: opts.referredUserId ?? null,
        rewardTransactionKey: opts.idempotencyKey,
      })}::jsonb,
      'REFERRAL'::public.customer_wallet_balance_lot_type,
      NULL
    )::text AS tx_id
  `;

  const walletTxId = credit?.tx_id ? Number(credit.tx_id) : null;

  await sql`
    INSERT INTO referral_reward_transactions (
      referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
      reward_party, reward_amount, reward_type, status, wallet_transaction_id,
      idempotency_key, credited_at, campaign_id, referral_code, referrer_id, referred_user_id
    ) VALUES (
      ${opts.relationshipId}, ${opts.ruleId}, 'customer'::referral_user_type,
      ${opts.customerPk}, ${opts.party}::referral_reward_party, ${opts.amount},
      'GATICASH'::referral_reward_type, 'credited'::referral_reward_tx_status,
      ${walletTxId}, ${opts.idempotencyKey}, NOW(),
      ${opts.campaignId ?? null}, ${opts.referralCode ?? null},
      ${opts.referrerId ?? null}, ${opts.referredUserId ?? null}
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'credited',
          wallet_transaction_id = COALESCE(EXCLUDED.wallet_transaction_id, referral_reward_transactions.wallet_transaction_id),
          credited_at = COALESCE(referral_reward_transactions.credited_at, NOW())
  `;

  if (opts.party === "referrer") {
    await addMonthlyUsage("customer", opts.customerPk, opts.amount);
  }

  const notifUserId = await resolveCustomerNotificationId(opts.customerPk);
  const tmpl =
    opts.party === "referrer"
      ? settings.notification_templates.customer_referrer
      : settings.notification_templates.customer_reward;
  const rendered = renderReferralTemplate(tmpl, { amount: opts.amount });

  if (notifUserId) {
    emitEvent("referral.reward_credited", {
      userId: notifUserId,
      role: "customer",
      amount: opts.amount,
      title: rendered.title,
      body: rendered.body,
      party: opts.party,
      rewardKey: opts.idempotencyKey,
    });
  }

  return { txId: walletTxId };
}

async function creditRiderWallet(opts: {
  riderId: number;
  amount: number;
  relationshipId: number;
  ruleId: number | null;
  milestoneOrders: number;
  party: "referrer" | "referred";
  idempotencyKey: string;
  campaignId?: number | null;
  referralCode?: string | null;
  referrerId?: number | null;
  referredUserId?: number | null;
}): Promise<{ ledgerId: number | null; skipped?: string }> {
  const sql = getSql();
  const [existing] = await sql<Array<{ id: string; status: string }>>`
    SELECT id::text, status::text
    FROM referral_reward_transactions
    WHERE idempotency_key = ${opts.idempotencyKey}
    LIMIT 1
  `;
  if (existing?.status === "credited") {
    return { ledgerId: Number(existing.id) };
  }

  const budget = await assertCampaignBudgetAvailable(opts.amount);
  if (!budget.ok) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'rider'::referral_user_type,
        ${opts.riderId}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'skipped_cap'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'campaign_budget_exhausted'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: budget.skipped };
  }

  const settings = await getReferralSettings();
  if (!settings.reward_enabled || !settings.rider_reward_enabled) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'rider'::referral_user_type,
        ${opts.riderId}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'skipped_disabled'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'rewards_disabled'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: "rewards_disabled" };
  }

  const used = await getMonthlyUsage("rider", opts.riderId);
  if (used + opts.amount > settings.monthly_reward_cap) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'rider'::referral_user_type,
        ${opts.riderId}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'skipped_cap'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'monthly_cap'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: "monthly_cap" };
  }

  // Current balance for ledger row (trigger also syncs)
  const [bal] = await sql<Array<{ balance: string }>>`
    SELECT COALESCE(total_balance, 0)::text AS balance
    FROM rider_wallet
    WHERE rider_id = ${opts.riderId}
    LIMIT 1
  `.catch(() => [{ balance: "0" }]);
  const balanceAfter = Number(bal?.balance ?? 0) + opts.amount;

  const [ledger] = await sql<Array<{ id: string }>>`
    INSERT INTO wallet_ledger (
      rider_id, entry_type, amount, balance, ref, ref_type,
      description, metadata, performed_by_type
    ) VALUES (
      ${opts.riderId},
      'referral_bonus',
      ${opts.amount.toFixed(2)},
      ${balanceAfter.toFixed(2)},
      ${opts.idempotencyKey},
      'referral',
      ${`Referral ${opts.party} reward — milestone ${opts.milestoneOrders}`},
      ${JSON.stringify({
        relationshipId: opts.relationshipId,
        ruleId: opts.ruleId,
        milestoneOrders: opts.milestoneOrders,
        campaignId: opts.campaignId ?? null,
        referralCode: opts.referralCode ?? null,
        referrerId: opts.referrerId ?? null,
        referredUserId: opts.referredUserId ?? null,
        rewardTransactionKey: opts.idempotencyKey,
      })}::jsonb,
      'system'
    )
    ON CONFLICT DO NOTHING
    RETURNING id::text
  `.catch(async () => {
    // Some envs lack unique on ref — try plain insert with existence check
    const [exists] = await sql<Array<{ id: string }>>`
      SELECT id::text FROM wallet_ledger
      WHERE rider_id = ${opts.riderId} AND ref = ${opts.idempotencyKey}
      LIMIT 1
    `;
    if (exists) return [exists];
    return sql<Array<{ id: string }>>`
      INSERT INTO wallet_ledger (
        rider_id, entry_type, amount, balance, ref, ref_type,
        description, metadata, performed_by_type
      ) VALUES (
        ${opts.riderId},
        'referral_bonus',
        ${opts.amount.toFixed(2)},
        ${balanceAfter.toFixed(2)},
        ${opts.idempotencyKey},
        'referral',
        ${`Referral ${opts.party} reward — milestone ${opts.milestoneOrders}`},
        ${JSON.stringify({
          relationshipId: opts.relationshipId,
          ruleId: opts.ruleId,
          milestoneOrders: opts.milestoneOrders,
        })}::jsonb,
        'system'
      )
      RETURNING id::text
    `;
  });

  const ledgerId = ledger?.id ? Number(ledger.id) : null;

  await sql`
    INSERT INTO referral_reward_transactions (
      referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
      reward_party, reward_amount, reward_type, status, wallet_ledger_id,
      idempotency_key, milestone_orders, credited_at
    ) VALUES (
      ${opts.relationshipId}, ${opts.ruleId}, 'rider'::referral_user_type,
      ${opts.riderId}, ${opts.party}::referral_reward_party, ${opts.amount},
      'WALLET_CREDIT'::referral_reward_type, 'credited'::referral_reward_tx_status,
      ${ledgerId}, ${opts.idempotencyKey}, ${opts.milestoneOrders}, NOW()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'credited',
          wallet_ledger_id = COALESCE(EXCLUDED.wallet_ledger_id, referral_reward_transactions.wallet_ledger_id),
          credited_at = COALESCE(referral_reward_transactions.credited_at, NOW())
  `;

  await addMonthlyUsage("rider", opts.riderId, opts.amount);

  const tmpl =
    opts.party === "referred"
      ? settings.notification_templates.rider_referred
      : settings.notification_templates.rider_milestone;
  const rendered = renderReferralTemplate(tmpl, { amount: opts.amount });

  emitEvent("referral.reward_credited", {
    userId: String(opts.riderId),
    role: "rider",
    amount: opts.amount,
    title: rendered.title,
    body: rendered.body,
    party: opts.party,
    rewardKey: opts.idempotencyKey,
  });

  return { ledgerId };
}

async function creditMerchantWallet(opts: {
  parentPk: number;
  amount: number;
  relationshipId: number;
  ruleId: number | null;
  milestoneOrders: number;
  party: "referrer" | "referred";
  idempotencyKey: string;
  campaignId?: number | null;
  referralCode?: string | null;
  referrerId?: number | null;
  referredUserId?: number | null;
  merchantStoreId?: number | null;
}): Promise<{ ledgerId: number | null; skipped?: string }> {
  const sql = getSql();
  const [existing] = await sql<Array<{ id: string; status: string }>>`
    SELECT id::text, status::text
    FROM referral_reward_transactions
    WHERE idempotency_key = ${opts.idempotencyKey}
    LIMIT 1
  `;
  if (existing?.status === "credited") {
    return { ledgerId: Number(existing.id) };
  }

  const budget = await assertCampaignBudgetAvailable(opts.amount);
  if (!budget.ok) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'merchant'::referral_user_type,
        ${opts.parentPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'skipped_cap'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'campaign_budget_exhausted'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: budget.skipped };
  }

  const settings = await getReferralSettings();
  if (!settings.reward_enabled || settings.merchant_reward_enabled === false) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'merchant'::referral_user_type,
        ${opts.parentPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'skipped_disabled'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'rewards_disabled'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: "rewards_disabled" };
  }

  const used = await getMonthlyUsage("merchant", opts.parentPk);
  if (used + opts.amount > settings.monthly_reward_cap) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'merchant'::referral_user_type,
        ${opts.parentPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'skipped_cap'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'monthly_cap'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: "monthly_cap" };
  }

  const preferredStoreId =
    opts.merchantStoreId != null && Number.isFinite(opts.merchantStoreId) && opts.merchantStoreId > 0
      ? opts.merchantStoreId
      : null;
  const [store] = preferredStoreId
    ? await sql<Array<{ store_id: string }>>`
        SELECT id::text AS store_id
        FROM merchant_stores
        WHERE id = ${preferredStoreId}
          AND parent_id = ${opts.parentPk}
          AND deleted_at IS NULL
        LIMIT 1
      `
    : await sql<Array<{ store_id: string }>>`
        SELECT id::text AS store_id
        FROM merchant_stores
        WHERE parent_id = ${opts.parentPk} AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
      `;
  if (!store?.store_id) {
    await sql`
      INSERT INTO referral_reward_transactions (
        referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
        reward_party, reward_amount, reward_type, status, idempotency_key,
        milestone_orders, failure_reason
      ) VALUES (
        ${opts.relationshipId}, ${opts.ruleId}, 'merchant'::referral_user_type,
        ${opts.parentPk}, ${opts.party}::referral_reward_party, ${opts.amount},
        'WALLET_CREDIT'::referral_reward_type, 'failed'::referral_reward_tx_status,
        ${opts.idempotencyKey}, ${opts.milestoneOrders}, 'no_store_wallet'
      )
      ON CONFLICT (idempotency_key) DO NOTHING
    `;
    return { ledgerId: null, skipped: "no_store_wallet" };
  }

  const [wallet] = await sql<Array<{ wallet_id: string }>>`
    SELECT public.get_or_create_merchant_wallet(${Number(store.store_id)}::bigint)::text AS wallet_id
  `;
  const walletId = Number(wallet?.wallet_id ?? 0);
  if (!Number.isFinite(walletId) || walletId <= 0) {
    return { ledgerId: null, skipped: "wallet_missing" };
  }

  const [ledger] = await sql<Array<{ id: string }>>`
    SELECT public.merchant_wallet_credit(
      ${walletId}::bigint,
      ${opts.amount}::numeric,
      'BONUS'::public.wallet_transaction_category,
      'AVAILABLE'::public.wallet_balance_type,
      'SYSTEM'::public.wallet_reference_type,
      ${opts.relationshipId}::bigint,
      ${opts.idempotencyKey},
      ${`Referral ${opts.party} reward`},
      ${JSON.stringify({
        relationshipId: opts.relationshipId,
        ruleId: opts.ruleId,
        party: opts.party,
        campaignId: opts.campaignId ?? null,
        referralCode: opts.referralCode ?? null,
        referrerId: opts.referrerId ?? null,
        referredUserId: opts.referredUserId ?? null,
        rewardTransactionKey: opts.idempotencyKey,
      })}::jsonb
    )::text AS id
  `;
  const ledgerId = ledger?.id ? Number(ledger.id) : null;

  await sql`
    INSERT INTO referral_reward_transactions (
      referral_relationship_id, reward_rule_id, user_type, beneficiary_user_id,
      reward_party, reward_amount, reward_type, status, wallet_ledger_id,
      idempotency_key, milestone_orders, credited_at
    ) VALUES (
      ${opts.relationshipId}, ${opts.ruleId}, 'merchant'::referral_user_type,
      ${opts.parentPk}, ${opts.party}::referral_reward_party, ${opts.amount},
      'WALLET_CREDIT'::referral_reward_type, 'credited'::referral_reward_tx_status,
      ${ledgerId}, ${opts.idempotencyKey}, ${opts.milestoneOrders}, NOW()
    )
    ON CONFLICT (idempotency_key) DO UPDATE
      SET status = 'credited',
          wallet_ledger_id = COALESCE(EXCLUDED.wallet_ledger_id, referral_reward_transactions.wallet_ledger_id),
          credited_at = COALESCE(referral_reward_transactions.credited_at, NOW())
  `;

  await addMonthlyUsage("merchant", opts.parentPk, opts.amount);

  const [parent] = await sql<Array<{ parent_merchant_id: string | null }>>`
    SELECT parent_merchant_id FROM merchant_parents WHERE id = ${opts.parentPk} LIMIT 1
  `;
  const tmpl =
    opts.party === "referred"
      ? settings.notification_templates.merchant_reward
      : settings.notification_templates.merchant_referrer;
  const rendered = renderReferralTemplate(tmpl, { amount: opts.amount });
  if (parent?.parent_merchant_id) {
    emitEvent("referral.reward_credited", {
      userId: parent.parent_merchant_id,
      role: "merchant",
      amount: opts.amount,
      title: rendered.title,
      body: rendered.body,
      party: opts.party,
      rewardKey: opts.idempotencyKey,
    });
  }

  return { ledgerId };
}

export async function creditReferralReward(opts: {
  userType: ReferralUserType;
  relationshipId: number;
  rule: ReferralRewardRule;
  referrerId: number;
  referredUserId: number;
  partyOverride?: "referrer" | "referred";
  beneficiaryOverride?: number;
  campaignId?: number | null;
  referralCode?: string | null;
  merchantStoreId?: number | null;
}): Promise<{ credited: boolean; skipped?: string }> {
  return withCampaignBudgetLock(async () => {
  const party = opts.partyOverride;
  const audit = {
    campaignId: opts.campaignId ?? null,
    referralCode: opts.referralCode ?? null,
    referrerId: opts.referrerId,
    referredUserId: opts.referredUserId,
  };

  const beneficiaryId =
    opts.beneficiaryOverride ??
    (party === "referred" ? opts.referredUserId : opts.referrerId);
  const eligible = await assertReferralUserEligible(opts.userType, beneficiaryId);
  if (!eligible.ok) {
    return { credited: false, skipped: "user_ineligible" };
  }

  if (opts.userType === "customer") {
    if (!party || party === "referrer") {
      const referrerKey = `ref_cust_${opts.relationshipId}_rule_${opts.rule.id}_referrer`;
      const r1 = await creditCustomerGatiCash({
        customerPk: opts.beneficiaryOverride && party === "referrer"
          ? opts.beneficiaryOverride
          : opts.referrerId,
        amount: opts.rule.reward_amount,
        relationshipId: opts.relationshipId,
        ruleId: opts.rule.id,
        party: "referrer",
        idempotencyKey: referrerKey,
        ...audit,
      });
      if (party === "referrer") {
        return { credited: !r1.skipped, skipped: r1.skipped };
      }
      if (r1.skipped && !opts.rule.also_credit_referred) {
        return { credited: false, skipped: r1.skipped };
      }
    }

    if ((!party && opts.rule.also_credit_referred) || party === "referred") {
      const referredAmount = opts.rule.referred_reward_amount ?? opts.rule.reward_amount;
      const r2 = await creditCustomerGatiCash({
        customerPk: opts.beneficiaryOverride && party === "referred"
          ? opts.beneficiaryOverride
          : opts.referredUserId,
        amount: referredAmount,
        relationshipId: opts.relationshipId,
        ruleId: opts.rule.id,
        party: "referred",
        idempotencyKey: `ref_cust_${opts.relationshipId}_rule_${opts.rule.id}_referred`,
        ...audit,
      });
      if (party === "referred") {
        return { credited: !r2.skipped, skipped: r2.skipped };
      }
    }

    return { credited: true };
  }

  const resolvedParty = party ?? "referrer";
  const beneficiary =
    opts.beneficiaryOverride ??
    (resolvedParty === "referred" ? opts.referredUserId : opts.referrerId);
  const key = `ref_${opts.userType}_${opts.relationshipId}_rule_${opts.rule.id}_${resolvedParty}`;
  const creditOpts = {
    amount: opts.rule.reward_amount,
    relationshipId: opts.relationshipId,
    ruleId: opts.rule.id,
    milestoneOrders: opts.rule.milestone_orders,
    party: resolvedParty,
    idempotencyKey: key,
    ...audit,
  };

  const r =
    opts.userType === "merchant"
      ? await creditMerchantWallet({
          parentPk: beneficiary,
          merchantStoreId: opts.merchantStoreId ?? null,
          ...creditOpts,
        })
      : await creditRiderWallet({ riderId: beneficiary, ...creditOpts });

  return { credited: !r.skipped, skipped: r.skipped };
  });
}
