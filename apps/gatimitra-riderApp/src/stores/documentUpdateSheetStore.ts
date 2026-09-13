import { create } from "zustand";

/** Document codes supported by post-onboarding DOCUMENT_UPDATE sheet. */
export type DocumentUpdateCode = "dl" | "rc";

type DocumentUpdateSheetStore = {
  visible: boolean;
  documentCode: DocumentUpdateCode | null;
  /** Open a document-scoped update sheet (never the onboarding wizard). */
  open: (documentCode: DocumentUpdateCode) => void;
  close: () => void;
};

export const useDocumentUpdateSheetStore = create<DocumentUpdateSheetStore>((set) => ({
  visible: false,
  documentCode: null,
  open: (documentCode) => set({ visible: true, documentCode }),
  close: () => set({ visible: false, documentCode: null }),
}));

/** Map eligibility / missing-doc focus → update sheet code. */
export function focusToDocumentUpdateCode(
  focus: "dl" | "rc" | string | null | undefined,
): DocumentUpdateCode | null {
  const v = String(focus ?? "").toLowerCase();
  if (v === "dl" || v === "driving_licence" || v === "driving_license") return "dl";
  if (v === "rc" || v === "vehicle_rc" || v === "registration_certificate") return "rc";
  return null;
}
