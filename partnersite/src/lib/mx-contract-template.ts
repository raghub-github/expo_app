/** Full Mx partner contract template (matches signed enrolment form PDF + partnership plan appendix). */

export const MX_CONTRACT_SCHEMA_VERSION = 1 as const;

export type MxContractDefinition = { term: string; meaning: string };

export type MxContractSection = {
  title: string;
  bullets?: string[];
  paragraphs?: string[];
};

export type MxContractAnnexureA = {
  description: string;
  table: { headers: string[]; rows: string[][] };
};

export type MxContractTemplateContent = {
  schemaVersion: typeof MX_CONTRACT_SCHEMA_VERSION;
  formTitle: string;
  definitions: MxContractDefinition[];
  sections: MxContractSection[];
  annexureA: MxContractAnnexureA;
  certification: string;
  partnershipPlanTerms: string;
};

export const DEFAULT_PARTNERSHIP_PLAN_TERMS = `Terms and Conditions
Partnership Plan

You hereby agree and acknowledge that as part of the Plan and in consideration of the agreed onboarding fees, the Platform will provide onboarding services in accordance with the following terms and conditions:

(a) The one-time photoshoot service of up to thirty (30) images of your menu dishes through authorised third-party service providers will be valid for a period of ninety (90) days from the date your restaurant goes live on the Platform for food ordering and delivery services. You will not be able to avail this photoshoot service if the same is not availed within the said ninety (90) days period.

(b) For the photoshoot services, the designated photoshoot personnel will be available at your restaurant location at the date and time as communicated by you for a maximum duration of three (3) hours. It will be your responsibility to ensure all dishes are prepared and ready for the shoot prior to or immediately upon the arrival of the photoshoot personnel for the photoshoot personnel to complete the photoshoot within the stipulated timeframe.

(c) You acknowledge and agree that rescheduling the photoshoot is allowed/permissible only once.

(d) You acknowledge and agree that the one-time ads credit worth up to INR 1,500/- that you receive under the Plan is subject to an eligibility criteria which will be communicated to you by the Platform from time to time. If your restaurant meets this criteria you will be able to claim this discount. The discount must be utilized within thirty (30) days from the date your restaurant goes live under this plan.

(e) The Plan only offers additional benefits for your restaurant page and the Platform does not provide any warranty or guarantee towards the reach, engagement and/or performance for your restaurant.

(f) You agree and acknowledge that in the event your service fee is revised or reduced from the agreed service fee, the Platform reserves the right to void the unclaimed benefits as a part of the Plan.

(g) The offering with respect to partner discounts shall be governed by separate terms and conditions as may be communicated to you from time to time.

(h) You have an option to make an upfront payment of the onboarding fee at time of onboarding or reduction from your weekly payouts for food ordering and delivery services in five (5) equal installments.

1) In case you make an upfront payment of the onboarding fee at the time of onboarding, in the event of a payment failure on the platform, the amount of the onboarding fee will be refunded to your source account within three (3) business days. Additionally, if your restaurant is not successfully onboarded on the Platform within fifteen (15) days from the date of receipt of payment of the onboarding fee, due to reasons not attributable to you, the onboarding fee will be refunded to you.

2) In case you choose a post-paid model of payment of onboarding fee, i.e., by way of reduction from your weekly payouts, the onboarding fee will reflect separately and identifiable in your statement of account.

3) For clarity, the onboarding fee payable for the onboarding services is independent of the fee payable by you to the Platform under the terms and conditions for the food ordering and delivery services.

4) The Platform shall raise tax invoice as per GST laws for such onboarding fee. If as per the applicable tax laws, You are liable to deduct taxes at source ("TDS") on the Onboarding Fees payable to the Platform, then You shall deposit the applicable TDS from your own pocket and shall claim a refund of such TDS from the Platform upon submission of TDS certificate within time stipulated under the applicable law.

5) If you already have an existing restaurant on the Platform and are adding a new restaurant, a reduced onboarding fee will be applicable.`;

export function getDefaultMxContractTemplate(): MxContractTemplateContent {
  return {
    schemaVersion: MX_CONTRACT_SCHEMA_VERSION,
    formTitle:
      'RESTAURANT PARTNER ENROLMENT FORM ("FORM") FOR FOOD ORDERING AND DELIVERY SERVICES',
    definitions: [
      {
        term: "Platform",
        meaning:
          "The food ordering and delivery platform operated by the Company, including its website, mobile applications, and associated services.",
      },
      {
        term: "Restaurant Partner",
        meaning:
          "The legal entity (restaurant/outlet) that has agreed to list its menu and fulfil Orders through the Platform, as identified in this Form.",
      },
      {
        term: "Customer",
        meaning:
          "An end-user who places an Order for food and/or beverages through the Platform.",
      },
      {
        term: "Order",
        meaning:
          "A request placed by a Customer through the Platform for food and/or beverages to be supplied by the Restaurant Partner.",
      },
      {
        term: "Order Value",
        meaning:
          "The amount payable by the Customer for an Order (including food, beverages, packaging, and applicable taxes), as received by the Platform.",
      },
      {
        term: "Charges",
        meaning:
          "The commission and other fees payable by the Restaurant Partner to the Platform as set out in Annexure A and the Terms.",
      },
      {
        term: "Services",
        meaning:
          "The services provided by the Platform to the Restaurant Partner as described in this Form and the Terms.",
      },
      {
        term: "Terms",
        meaning:
          "The Terms and Conditions for food ordering and delivery services, as amended from time to time, and which are incorporated by reference into this Form.",
      },
    ],
    sections: [
      {
        title: "I. Services",
        bullets: [
          "Order placement and catalog hosting: The Platform provides the order placement mechanism for Customers to place Orders with the Restaurant Partners on a real-time basis and hosts the menu and price lists as provided by the Restaurant Partners.",
          "Demand generation and marketing: The Platform helps bring new Customers to Restaurant Partners through targeted marketing, discovery, and a seamless food ordering experience.",
          "Logistics: The Platform enables a reliable delivery ecosystem for fulfilling the Restaurant Partner's Orders.",
          "Support: A support team is available to help resolve issues for Customers and Restaurant Partners.",
          "Technology: The Platform builds and supports products including payment and order management infrastructure.",
        ],
      },
      {
        title: "II. Charges",
        paragraphs: [
          "For the Services above, the Restaurant Partner shall pay the applicable Charges as set out in Annexure A and the Terms. All amounts are subject to applicable taxes (including GST). The Platform shall raise tax invoices as per applicable law.",
        ],
      },
      {
        title: "III. Payment Settlement",
        paragraphs: [
          "The Platform shall transfer the Order Value received to the Restaurant Partner, after deduction of Charges, on a weekly basis. Settlement shall be made to the bank account details provided in Annexure B. The payment settlement day for Orders serviced from Monday to Sunday shall be on or before Thursday of the following week. If the settlement day falls on a bank holiday, it shall be the next working day.",
          "Transparent Payment Settlement: GatiMitra follows a transparent payout and settlement structure. The Merchant will be able to view the applicable Order Value, deductions, Charges, adjustments, taxes, and final payable amount through the Merchant App and/or Partner Portal.",
          "No Hidden Charges: No hidden platform charges will be applied to the Merchant. Any applicable commission, fee, tax, adjustment, or other deduction shall be disclosed in the applicable commercial terms and/or reflected in the relevant order, settlement, or payout statement.",
          "Settlement Details: The Merchant is responsible for reviewing the order, settlement, and payout details available on the Platform and may raise any genuine discrepancy through GatiMitra's official support channels.",
          "Transparent Partnership: GatiMitra is committed to transparent settlements, clear charges, and fair communication with its Merchant Partners.",
        ],
      },
      {
        title: "IV. Additional Terms",
        bullets: [
          "The Restaurant Partner shall not charge the Customer for anything other than food, beverages, and packaging on the Platform.",
          "The Restaurant Partner will maintain equal or lower prices for products on the Platform as compared to its direct channels.",
          "The Restaurant Partner will not send marketing material with Orders that discourages Customers from ordering via the Platform.",
          "This Form and its annexures, together with the Terms, constitute the entire agreement between the Parties and are legally binding.",
          "Merchant Terms & Acceptance: By registering and continuing to use the GatiMitra Platform, the Merchant acknowledges and agrees to the GatiMitra Merchant Terms & Conditions, including the applicable commercial terms, service charges, payout policies, and platform policies communicated by GatiMitra.",
          "Updates to Terms: GatiMitra may update its terms, charges, policies, or operational guidelines from time to time. Applicable changes will be communicated through the Merchant App, Partner Portal, email, or other official communication channels. Continued use of the Platform after such changes are communicated will constitute acceptance of the updated terms, subject to applicable law.",
          "Merchant Responsibility: The Merchant is responsible for reviewing the applicable terms, order statements, and payout details available on the Platform and for raising any genuine discrepancy through GatiMitra's official support channels.",
          "Fair & Transparent Partnership: GatiMitra is committed to transparent settlements, clear charges, and fair communication with its Merchant Partners.",
        ],
      },
      {
        title: "Declaration",
        paragraphs: [
          "I/We have read and understood this Form and the Terms. I/We accept and agree to be bound by the Terms. I/We represent and warrant that I/we are duly authorized to sign this Form on behalf of the Restaurant Partner.",
        ],
      },
    ],
    annexureA: {
      description:
        "Commission and charges payable by the Restaurant Partner to the Platform for food ordering and delivery services:",
      table: {
        headers: ["Period", "Commission (on Order Value)", "Remarks"],
        rows: [
          [
            "First month from Go-Live",
            "0%",
            "No commission for the first calendar month from the date the restaurant goes live on the Platform.",
          ],
          [
            "From second month onwards",
            "15% + GST",
            "Fifteen per cent (15%) of the Order Value plus applicable GST. Subject to commercial terms communicated from time to time.",
          ],
        ],
      },
    },
    certification:
      "I/We hereby certify that the details provided above are correct, that the bank account is an account legally opened and maintained by me/our organization, and that I/we shall be liable to the maximum extent possible under applicable law in the event any details provided above are found to be incorrect.",
    partnershipPlanTerms: DEFAULT_PARTNERSHIP_PLAN_TERMS,
  };
}

export function serializeMxContractTemplate(content: MxContractTemplateContent): string {
  return JSON.stringify({ ...content, schemaVersion: MX_CONTRACT_SCHEMA_VERSION });
}

export function parseMxContractTemplate(contentMarkdown: string): MxContractTemplateContent {
  const raw = (contentMarkdown ?? "").trim();
  if (!raw) return getDefaultMxContractTemplate();

  if (raw.startsWith("{")) {
    try {
      const parsed = JSON.parse(raw) as Partial<MxContractTemplateContent>;
      const defaults = getDefaultMxContractTemplate();
      return {
        schemaVersion: MX_CONTRACT_SCHEMA_VERSION,
        formTitle: parsed.formTitle?.trim() || defaults.formTitle,
        definitions:
          Array.isArray(parsed.definitions) && parsed.definitions.length > 0
            ? parsed.definitions.filter((d) => d?.term && d?.meaning)
            : defaults.definitions,
        sections:
          Array.isArray(parsed.sections) && parsed.sections.length > 0
            ? parsed.sections.filter((s) => s?.title)
            : defaults.sections,
        annexureA: parsed.annexureA?.table?.headers?.length
          ? {
              description: parsed.annexureA.description || defaults.annexureA.description,
              table: {
                headers: parsed.annexureA.table.headers,
                rows: Array.isArray(parsed.annexureA.table.rows) ? parsed.annexureA.table.rows : [],
              },
            }
          : defaults.annexureA,
        certification: parsed.certification?.trim() || defaults.certification,
        partnershipPlanTerms: parsed.partnershipPlanTerms?.trim() || defaults.partnershipPlanTerms,
      };
    } catch {
      // fall through to legacy plain-text partnership plan
    }
  }

  // Legacy v2 rows: plain partnership plan text only
  const defaults = getDefaultMxContractTemplate();
  return { ...defaults, partnershipPlanTerms: raw };
}

export function partnershipPlanFromTemplate(contentMarkdown: string): string {
  return parseMxContractTemplate(contentMarkdown).partnershipPlanTerms;
}
