export type OverviewData = {
  period: string;
  range: { from: string; to: string };
  kpis: {
    gmv: number;
    gmvDelta: number | null;
    orders: number;
    ordersDelta: number | null;
    delivered: number;
    cancelled: number;
    live: number;
    commission: number;
    newCustomers: number;
    newCustomersDelta: number | null;
    customers: number;
    riders: number;
    ridersOnline: number;
    stores: number;
    storesLive: number;
    openTickets: number;
    completionRate: number;
    gstCollected: number;
    gstOnBills: number;
    riderTips: number;
    riderTipsLifetime: number;
    feedingIndia: number;
    feedingIndiaLifetime: number;
    wallet: number;
    walletUsed: number;
    refunds: number;
    riderEarning: number;
    platformFee: number;
    platformRevenue: number;
    platformRevenueDelta: number | null;
    platformRevenueCharges: number;
    platformRevenueOnboarding: number;
    platformRevenuePenalties: number;
  };
  byType: Array<{ type: string; orders: number; delivered: number; gmv: number }>;
  trend: Array<{ day: string; orders: number; gmv: number }>;
};

export type PerformanceData = {
  period: string;
  byType: Array<{
    type: string;
    orders: number;
    delivered: number;
    cancelled: number;
    failed: number;
    avgMinutes: number;
    gmv: number;
    completionRate: number;
    cancelRate: number;
  }>;
  byStatus: Array<{ status: string; orders: number }>;
  eta: { breached: number; delivered: number };
  storeTypes: Array<{ storeType: string; orders: number; gmv: number }>;
};

export type AnalyticsData = {
  period: string;
  hourly: Array<{ hour: number; orders: number }>;
  topStores: Array<{ name: string; orders: number; gmv: number }>;
  riderCities: Array<{ city: string; riders: number }>;
  paymentMix: Array<{ method: string; orders: number; amount: number }>;
};

export type PaymentsData = {
  period: string;
  collected: number;
  failed: number;
  waterflow: {
    orders: number;
    gmv: number;
    itemTotal: number;
    realAmount: number;
    walletAmount: number;
    online: number;
    cash: number;
    gstCustomer: number;
    gstPlatform: number;
    tds: number;
    platformFee: number;
    commission: number;
    merchantNet: number;
    riderEarning: number;
    riderTips: number;
    feedingIndia: number;
    refunds: number;
    refundCount: number;
    netAfterRefunds: number;
  };
  byService: Array<{
    type: string;
    orders: number;
    gmv: number;
    gst: number;
    tips: number;
    donations: number;
  }>;
  mix: Array<{ method: string; status: string; orders: number; amount: number }>;
  status: Array<{ status: string; orders: number; amount: number }>;
    onboarding: Array<{ kind: string; status: string; count: number; amount: number }>;
    onboardingRecords: Array<{
      kind: string;
      name: string;
      status: string;
      amount: number;
      createdAt: string;
    }>;
    payouts: Array<{ status: string; count: number; amount: number }>;
    payoutRecords: Array<{
      store: string;
      status: string;
      amount: number;
      net: number;
      utr: string;
      createdAt: string;
    }>;
    withdrawals: Array<{ status: string; count: number; amount: number }>;
    withdrawalRecords: Array<{
      rider: string;
      status: string;
      amount: number;
      createdAt: string;
    }>;
};

export type TaxData = {
  period: string;
  gstCollected: number;
  gstPlatform: number;
  tdsCollected: number;
  gstFiled: number;
  gstRemaining: number;
  lastFiledAt: string | null;
  lastFiledLabel: string | null;
  monthly: Array<{ month: string; gst: number; tds: number; orders: number }>;
  filings: Array<{
    id: number;
    taxType: string;
    periodLabel: string;
    amountDue: number;
    amountFiled: number;
    filedAt: string | null;
    reference: string;
  }>;
};

export type OrdersData = {
  period: string;
  summary: Array<{ type: string; status: string; orders: number }>;
  recent: Array<{
    id: number;
    orderId: string;
    type: string;
    status: string;
    paymentStatus: string;
    paymentMethod: string;
    amount: number;
    tip: number;
    donation: number;
    gst: number;
    customer: string;
    store: string;
    rider: string;
    createdAt: string;
  }>;
};

export type CustomersData = {
  period: string;
  stats: { total: number; active: number; newInPeriod: number; wallet: number };
  states: Array<{ state: string; count: number }>;
  recent: Array<{
    id: string;
    name: string;
    email: string;
    mobile: string;
    status: string;
    city: string;
    wallet: number;
    orders: number;
    gmv: number;
    createdAt: string;
  }>;
};

export type RidersData = {
  period: string;
  stats: { total: number; active: number; online: number; kyc: number; newInPeriod: number; wallet: number };
  cities: Array<{ city: string; count: number }>;
  recent: Array<{
    id: number;
    name: string;
    mobile: string;
    status: string;
    availability: string;
    kyc: string;
    city: string;
    vehicle: string;
    wallet: number;
    deliveries: number;
    earnings: number;
    createdAt: string;
  }>;
};

export type MerchantsData = {
  period: string;
  stats: { total: number; live: number; accepting: number; newInPeriod: number };
  types: Array<{ type: string; count: number }>;
  recent: Array<{
    storeId: string;
    name: string;
    city: string;
    type: string;
    status: string;
    live: boolean;
    orders: number;
    gmv: number;
    packaging: number;
    commission: number;
    createdAt: string;
  }>;
  byCtm: Array<{ name: string; orders: number; ctm: number; packaging: number }>;
};

export type FinanceData = {
  period: string;
  gmv: number;
  commission: number;
  riderEarning: number;
  gst: number;
  riderTips: number;
  feedingIndia: number;
  platformFee: number;
  refunds: { count: number; amount: number };
  customerWallet: number;
  riderWallet: number;
};

export type SupportData = {
  period: string;
  stats: { total: number; open: number; resolved: number };
  byStatus: Array<{ status: string; count: number }>;
  bySource: Array<{ source: string; count: number }>;
  recent: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    source: string;
    createdAt: string;
  }>;
};
