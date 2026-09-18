import React from "react";
import { RiderDocumentUpdateSheet } from "@/src/components/documents/RiderDocumentUpdateSheet";
import { useDocumentUpdateSheetStore } from "@/src/stores/documentUpdateSheetStore";

/** Mount once under tabs so any screen can open DOCUMENT_UPDATE without navigating. */
export function RiderDocumentUpdateSheetHost() {
  const visible = useDocumentUpdateSheetStore((s) => s.visible);
  const documentCode = useDocumentUpdateSheetStore((s) => s.documentCode);
  const addAnotherVehicle = useDocumentUpdateSheetStore((s) => s.addAnotherVehicle);
  const close = useDocumentUpdateSheetStore((s) => s.close);

  return (
    <RiderDocumentUpdateSheet
      visible={visible}
      documentCode={documentCode}
      addAnotherVehicle={addAnotherVehicle}
      onClose={close}
      mode="DOCUMENT_UPDATE"
    />
  );
}
