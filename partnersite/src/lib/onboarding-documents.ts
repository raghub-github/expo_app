import type { LucideIcon } from "lucide-react";
import { CreditCard, FileCheck, Image, Landmark, LayoutList } from "lucide-react";

export type OnboardingDocumentItem = {
  icon: LucideIcon;
  title: string;
  detail: string;
};

export const ONBOARDING_DOCUMENTS: OnboardingDocumentItem[] = [
  {
    icon: CreditCard,
    title: "PAN Card",
    detail: "Only valid adult PAN cards are accepted.",
  },
  {
    icon: FileCheck,
    title: "Business license",
    detail:
      "As applicable: e.g. FSSAI for food, drug license for pharmacy, or other trade license.",
  },
  {
    icon: Landmark,
    title: "Bank Details",
    detail: "Copy of cancelled cheque or bank passbook.",
  },
  {
    icon: LayoutList,
    title: "Product / Menu catalog",
    detail: "Complete catalog or menu you want to list for online orders.",
  },
  {
    icon: Image,
    title: "Store cover image",
    detail: "Used as your store's cover image on GatiMitra.",
  },
];
