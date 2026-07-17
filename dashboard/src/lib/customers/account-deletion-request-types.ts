/**
 * Client-safe types for account deletion request UI (no DB / server-only imports).
 */

export type AccountDeletionRequestRow = {
  id: number;
  customerId: string;
  phoneE164: string | null;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  source: string;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNotes: string | null;
  customerName: string | null;
  customerMobile: string | null;
  accountStatus: string | null;
  customersPk: number | null;
};
