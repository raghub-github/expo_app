import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { riderApi, type RiderBankPaymentMethod } from "@/src/services/api/riderApi";

export type CreateRiderBankAccountInput = {
  accountHolderName: string;
  bankName: string;
  ifsc: string;
  branch?: string;
  accountNumber: string;
};

export function useRiderBankPaymentMethod() {
  return useQuery({
    queryKey: ["rider", "payment-methods", "bank"],
    queryFn: async () => {
      const response = await riderApi.getBankPaymentMethod();
      return response.paymentMethod;
    },
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    placeholderData: (previous) => previous ?? null,
  });
}

export function prefetchRiderBankPaymentMethod(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  return queryClient.prefetchQuery({
    queryKey: ["rider", "payment-methods", "bank"],
    queryFn: async () => {
      const response = await riderApi.getBankPaymentMethod();
      return response.paymentMethod;
    },
    staleTime: 60_000,
  });
}

export function useCreateRiderBankPaymentMethod() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateRiderBankAccountInput) =>
      riderApi.createBankPaymentMethod(payload),
    onSuccess: (response) => {
      queryClient.setQueryData<RiderBankPaymentMethod | null>(
        ["rider", "payment-methods", "bank"],
        response.paymentMethod,
      );
      void queryClient.invalidateQueries({ queryKey: ["rider", "earnings", "summary"] });
    },
  });
}
