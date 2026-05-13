import React, { createContext, useCallback, useContext, useState, ReactNode } from "react";

export type SubscriptionPlan = {
  plan_id: number;
  plan_code: string;
  plan_name: string;
  expiry_date: string | null;
  subscription_status: string;
  active_from: string;
};

type SubscriptionContextType = {
  subscriptionPlan: SubscriptionPlan | null;
  setSubscriptionPlan: (plan: SubscriptionPlan | null) => void;
};

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlan | null>(null);

  const value: SubscriptionContextType = {
    subscriptionPlan,
    setSubscriptionPlan,
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscriptionPlan(): SubscriptionContextType {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscriptionPlan must be used within SubscriptionProvider");
  }
  return context;
}
