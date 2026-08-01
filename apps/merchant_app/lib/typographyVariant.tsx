import { createContext, useContext, type ReactNode } from "react";

/** `brand` = Lora letters + Poppins digits; `sans` = Poppins for all (incoming order sheet). */
export type TypographyVariant = "brand" | "sans";

const TypographyVariantContext = createContext<TypographyVariant>("brand");

export function TypographyVariantProvider({
  variant,
  children,
}: {
  variant: TypographyVariant;
  children: ReactNode;
}) {
  return (
    <TypographyVariantContext.Provider value={variant}>{children}</TypographyVariantContext.Provider>
  );
}

export function useTypographyVariant(): TypographyVariant {
  return useContext(TypographyVariantContext);
}
