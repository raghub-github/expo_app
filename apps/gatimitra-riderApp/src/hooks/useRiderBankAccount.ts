import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  riderApi,
  EMPTY_BANK_ADD_GATE,
  type RiderBankAddGate,
  type RiderBankPaymentMethod,
} from "@/src/services/api/riderApi";

export type CreateRiderBankAccountInput = {
  accountHolderName: string;
  bankName: string;
  ifsc: string;
  branch?: string;
  accountNumber: string;
};

export const RIDER_BANK_LIST_QUERY_KEY = ["rider", "payment-methods", "bank", "list"] as const;
export const RIDER_BANK_CURRENT_QUERY_KEY = ["rider", "payment-methods", "bank"] as const;

export type RiderBankCurrentResponse = {
  paymentMethod: RiderBankPaymentMethod | null;
  addGate: RiderBankAddGate;
};

export function useRiderBankPaymentMethod() {
  return useQuery({
    queryKey: RIDER_BANK_CURRENT_QUERY_KEY,
    queryFn: async (): Promise<RiderBankCurrentResponse> => {
      const response = await riderApi.getBankPaymentMethod();
      return {
        paymentMethod: response.paymentMethod,
        addGate: response.addGate ?? EMPTY_BANK_ADD_GATE,
      };
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) =>
      previous ?? { paymentMethod: null, addGate: EMPTY_BANK_ADD_GATE },
    select: (data) => data.paymentMethod,
  });
}

/** Full bank GET including addGate (for lock / countdown UI). */
export function useRiderBankAddGate() {
  return useQuery({
    queryKey: RIDER_BANK_CURRENT_QUERY_KEY,
    queryFn: async (): Promise<RiderBankCurrentResponse> => {
      const response = await riderApi.getBankPaymentMethod();
      return {
        paymentMethod: response.paymentMethod,
        addGate: response.addGate ?? EMPTY_BANK_ADD_GATE,
      };
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) =>
      previous ?? { paymentMethod: null, addGate: EMPTY_BANK_ADD_GATE },
    select: (data) => data.addGate ?? EMPTY_BANK_ADD_GATE,
  });
}

export function useRiderBankPaymentMethodsList() {
  return useQuery({
    queryKey: RIDER_BANK_LIST_QUERY_KEY,
    queryFn: async () => {
      const response = await riderApi.listBankPaymentMethods();
      return response.paymentMethods;
    },
    staleTime: 30_000,
    gcTime: 10 * 60_000,
  });
}

export function prefetchRiderBankPaymentMethod(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.prefetchQuery({
    queryKey: RIDER_BANK_CURRENT_QUERY_KEY,
    queryFn: async (): Promise<RiderBankCurrentResponse> => {
      const response = await riderApi.getBankPaymentMethod();
      return {
        paymentMethod: response.paymentMethod,
        addGate: response.addGate ?? EMPTY_BANK_ADD_GATE,
      };
    },
    staleTime: 60_000,
  });
}

function invalidateBankQueries(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: RIDER_BANK_CURRENT_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: RIDER_BANK_LIST_QUERY_KEY });
  void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
}

export function useCreateRiderBankPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRiderBankAccountInput) =>
      riderApi.createBankPaymentMethod(payload),
    onSuccess: (response) => {
      queryClient.setQueryData<RiderBankCurrentResponse>(RIDER_BANK_CURRENT_QUERY_KEY, (prev) => ({
        paymentMethod: response.paymentMethod,
        addGate: prev?.addGate ?? EMPTY_BANK_ADD_GATE,
      }));
      invalidateBankQueries(queryClient);
    },
    onError: () => {
      invalidateBankQueries(queryClient);
    },
  });
}

export function useSetPrimaryRiderBankPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => riderApi.setPrimaryBankPaymentMethod(id),
    onSuccess: (response) => {
      queryClient.setQueryData<RiderBankCurrentResponse>(RIDER_BANK_CURRENT_QUERY_KEY, (prev) => ({
        paymentMethod: response.paymentMethod,
        addGate: prev?.addGate ?? EMPTY_BANK_ADD_GATE,
      }));
      invalidateBankQueries(queryClient);
    },
  });
}
