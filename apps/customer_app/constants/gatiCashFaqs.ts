export type GatiCashFaqBlock =
  | { type: "text"; text: string }
  | { type: "bullets"; items: string[] };

export type GatiCashFaqItem = {
  id: string;
  question: string;
  blocks: GatiCashFaqBlock[];
};

export const GATICASH_FAQS: GatiCashFaqItem[] = [
  {
    id: "what-is-gaticash",
    question: "What is GatiCash?",
    blocks: [
      {
        type: "text",
        text: "GatiCash is GatiMitra's digital wallet that enables faster and more convenient payments across eligible services on the GatiMitra Platform.",
      },
      {
        type: "text",
        text: "GatiCash can be used to pay for food orders, grocery orders, parcel services, ride bookings, logistics services, and other eligible services available on the Platform.",
      },
    ],
  },
  {
    id: "components",
    question: "What are the different components of GatiCash?",
    blocks: [
      { type: "text", text: "Your GatiCash balance may consist of:" },
      {
        type: "bullets",
        items: [
          "Added Wallet Balance",
          "Refund Balance",
          "Promotional Credits",
          "Cashback Rewards",
          "Customer Delight Credits",
          "Campaign Rewards",
          "Referral Rewards",
          "Loyalty Benefits",
        ],
      },
      {
        type: "text",
        text: "Different balance types may have different validity periods and usage conditions.",
      },
    ],
  },
  {
    id: "add-money",
    question: "How can I add money to GatiCash?",
    blocks: [
      { type: "text", text: "Money can be added using:" },
      {
        type: "bullets",
        items: [
          "UPI",
          "Debit Cards",
          "Credit Cards",
          "Net Banking",
          "Supported Wallets",
          "Gift Cards (where available)",
          "Promotional Campaigns",
          "Cashback Programs",
        ],
      },
      {
        type: "text",
        text: "Available payment methods may vary by location and time.",
      },
    ],
  },
  {
    id: "max-balance",
    question: "What is the maximum amount I can add to GatiCash?",
    blocks: [
      { type: "text", text: "The maximum GatiCash wallet balance permitted at any time is:" },
      { type: "text", text: "₹50,000" },
      {
        type: "text",
        text: "GatiMitra reserves the right to modify wallet limits based on applicable laws, regulatory requirements, risk assessments, or platform policies.",
      },
    ],
  },
  {
    id: "kyc",
    question: "Is KYC required to use GatiCash?",
    blocks: [
      { type: "text", text: "For normal wallet usage, KYC may not be mandatory." },
      {
        type: "text",
        text: "However, GatiMitra may request identity verification in certain situations, including:",
      },
      {
        type: "bullets",
        items: [
          "Fraud prevention",
          "Regulatory compliance",
          "High-value transactions",
          "Security reviews",
          "Suspicious activity investigations",
        ],
      },
    ],
  },
  {
    id: "activate",
    question: "How do I activate GatiCash?",
    blocks: [
      {
        type: "text",
        text: "GatiCash is automatically activated when an eligible customer creates a verified GatiMitra account.",
      },
      { type: "text", text: "Additional verification may be required in certain situations." },
    ],
  },
  {
    id: "partial-payments",
    question: "Can I use GatiCash for partial payments?",
    blocks: [
      { type: "text", text: "Yes." },
      {
        type: "text",
        text: "If your GatiCash balance is lower than the total payable amount, the remaining amount may be paid using another available payment method.",
      },
    ],
  },
  {
    id: "coupons-offers",
    question: "Can GatiCash be combined with coupons and offers?",
    blocks: [
      { type: "text", text: "In most cases, yes." },
      {
        type: "text",
        text: "However, certain promotions, discounts, or campaigns may have separate eligibility conditions.",
      },
      { type: "text", text: "Offer-specific terms will always prevail." },
    ],
  },
  {
    id: "order-cancelled",
    question: "What happens if my order is cancelled?",
    blocks: [
      {
        type: "text",
        text: "If an eligible order is cancelled, the refundable amount may be credited back to:",
      },
      {
        type: "bullets",
        items: ["Original payment source", "GatiCash Wallet", "Combination of both"],
      },
      {
        type: "text",
        text: "depending on the payment method used and applicable refund policies.",
      },
    ],
  },
  {
    id: "transaction-fails",
    question: "What happens if a transaction fails?",
    blocks: [
      { type: "text", text: "If money is deducted but the transaction fails:" },
      {
        type: "bullets",
        items: [
          "The amount will generally be reversed automatically.",
          "Processing time may vary depending on the payment provider.",
          "Certain cases may require manual verification.",
        ],
      },
    ],
  },
  {
    id: "transfer",
    question: "Can I transfer GatiCash to another account?",
    blocks: [
      { type: "text", text: "No." },
      {
        type: "text",
        text: "GatiCash is linked to the registered GatiMitra account and cannot be transferred to another customer account unless expressly permitted by GatiMitra.",
      },
    ],
  },
  {
    id: "withdraw",
    question: "Can I withdraw GatiCash to my bank account?",
    blocks: [
      { type: "text", text: "No." },
      {
        type: "text",
        text: "GatiCash is intended solely for purchases and eligible services available on the GatiMitra Platform.",
      },
      {
        type: "text",
        text: "Wallet balances are generally non-withdrawable unless specifically required under applicable law.",
      },
    ],
  },
  {
    id: "expire",
    question: "Does GatiCash expire?",
    blocks: [
      {
        type: "text",
        text: "Certain promotional balances, cashback rewards, referral rewards, and campaign credits may carry an expiry date.",
      },
      { type: "text", text: "Where applicable, expiry details will be displayed within the application." },
      {
        type: "text",
        text: "Added Wallet Balance expires 10 years from the date it is credited, unless a different period is shown in the app or required by law.",
      },
    ],
  },
  {
    id: "check-balance",
    question: "How can I check my GatiCash balance?",
    blocks: [
      { type: "text", text: "You can view your:" },
      {
        type: "bullets",
        items: [
          "Available Balance",
          "Transaction History",
          "Cashback History",
          "Refund History",
          "Reward Credits",
        ],
      },
      { type: "text", text: "from the GatiCash section inside the GatiMitra App." },
    ],
  },
  {
    id: "secure",
    question: "Is GatiCash secure?",
    blocks: [
      { type: "text", text: "Yes." },
      {
        type: "text",
        text: "GatiMitra employs reasonable technical and organizational safeguards designed to protect wallet balances, payment information, and transaction records.",
      },
    ],
  },
  {
    id: "suspended",
    question: "What happens if my account is suspended?",
    blocks: [
      {
        type: "text",
        text: "If an account is suspended due to fraud, policy violations, or security concerns:",
      },
      {
        type: "bullets",
        items: [
          "Wallet usage may be temporarily restricted.",
          "Balances may be held pending review.",
          "Refunds and withdrawals may be processed according to applicable policies and legal obligations.",
        ],
      },
    ],
  },
  {
    id: "reverse-credits",
    question: "Can GatiMitra reverse wallet credits?",
    blocks: [
      { type: "text", text: "Yes." },
      {
        type: "text",
        text: "GatiMitra may reverse, adjust, or recover wallet credits in cases including:",
      },
      {
        type: "bullets",
        items: [
          "Fraudulent activity",
          "Duplicate credits",
          "Technical errors",
          "Chargebacks",
          "Policy violations",
        ],
      },
    ],
  },
  {
    id: "rewards",
    question: "What rewards can I earn through GatiCash?",
    blocks: [
      { type: "text", text: "Eligible users may receive:" },
      {
        type: "bullets",
        items: [
          "Cashback Rewards",
          "Referral Rewards",
          "Loyalty Benefits",
          "Festival Rewards",
          "Merchant Sponsored Rewards",
          "Customer Delight Credits",
          "Promotional Bonuses",
        ],
      },
      { type: "text", text: "Reward eligibility may vary." },
    ],
  },
  {
    id: "support",
    question: "How do I contact support regarding GatiCash?",
    blocks: [
      { type: "text", text: "For any GatiCash-related concerns, please contact:" },
      { type: "text", text: "Support Email: support@gatimitra.com" },
      {
        type: "text",
        text: "Our support team will assist with wallet balances, refunds, transaction issues, cashback rewards, and related queries.",
      },
    ],
  },
  {
    id: "gaticoins",
    question: "Can I earn GatiCoins while spending GatiCash?",
    blocks: [
      { type: "text", text: "Yes." },
      {
        type: "text",
        text: "Eligible purchases made using GatiCash may earn GatiCoins, which can later be redeemed for discounts, rewards, exclusive offers, or future benefits as determined by GatiMitra.",
      },
    ],
  },
];
