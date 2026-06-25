import { useQuery } from "@tanstack/react-query";
import {
  riderApi,
  type RiderLedgerGraphData,
  type RiderLedgerSegment,
} from "@/src/services/api/riderApi";

export function ledgerGraphQueryKey(args: {
  segment: RiderLedgerSegment;
  from: string;
  to: string;
}) {
  return ["rider", "ledger", "graph", args] as const;
}

const EMPTY_GRAPH: RiderLedgerGraphData = {
  totalEarning: 0,
  orderEarning: 0,
  incentive: 0,
  surge: 0,
  waiting: 0,
  orderCount: 0,
  rangeLabel: "",
  from: "",
  to: "",
  dailyBars: [],
};

export function useLedgerGraph(args: {
  segment: RiderLedgerSegment;
  from: string;
  to: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ledgerGraphQueryKey({
      segment: args.segment,
      from: args.from,
      to: args.to,
    }),
    queryFn: () =>
      riderApi.getLedgerGraph({
        segment: args.segment,
        from: args.from,
        to: args.to,
      }),
    enabled: args.enabled ?? true,
    staleTime: 60_000,
    placeholderData: EMPTY_GRAPH,
  });
}
