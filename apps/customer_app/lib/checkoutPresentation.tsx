import React, { createContext, useContext } from "react";

type CheckoutPresentationValue = {
  variant: "page" | "sheet";
  onSheetClose?: () => void;
};

const CheckoutPresentationContext = createContext<CheckoutPresentationValue>({
  variant: "page",
});

export function CheckoutPresentationProvider({
  variant,
  onSheetClose,
  children,
}: {
  variant: "page" | "sheet";
  onSheetClose?: () => void;
  children: React.ReactNode;
}) {
  return (
    <CheckoutPresentationContext.Provider value={{ variant, onSheetClose }}>
      {children}
    </CheckoutPresentationContext.Provider>
  );
}

export function useCheckoutPresentation() {
  return useContext(CheckoutPresentationContext);
}
