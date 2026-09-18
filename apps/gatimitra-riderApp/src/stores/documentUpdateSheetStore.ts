import { create } from "zustand";

/** Document codes supported by post-onboarding DOCUMENT_UPDATE sheet. */
export type DocumentUpdateCode = "dl" | "rc";

type DocumentUpdateSheetStore = {
  visible: boolean;
  documentCode: DocumentUpdateCode | null;
  /** Second RC from Profile → Vehicles — never overwrites vehicle 1. */
  addAnotherVehicle: boolean;
  /** Open a document-scoped update sheet (never the onboarding wizard). */
  open: (documentCode: DocumentUpdateCode, opts?: { addAnotherVehicle?: boolean }) => void;
  close: () => void;
};

export const useDocumentUpdateSheetStore = create<DocumentUpdateSheetStore>((set) => ({
  visible: false,
  documentCode: null,
  addAnotherVehicle: false,
  open: (documentCode, opts) =>
    set({
      visible: true,
      documentCode,
      addAnotherVehicle: opts?.addAnotherVehicle === true,
    }),
  close: () => set({ visible: false, documentCode: null, addAnotherVehicle: false }),
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
