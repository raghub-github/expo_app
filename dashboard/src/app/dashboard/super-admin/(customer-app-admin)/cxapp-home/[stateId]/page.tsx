"use client";

import dynamic from "next/dynamic";
import { CxAppHomeStateDetailSkeleton } from "@/components/cxapp-home/CxAppHomeStateDetailSkeleton";

const CxAppHomeStateDetailClient = dynamic(
  () =>
    import("@/components/cxapp-home/CxAppHomeStateDetailClient").then(
      (m) => m.CxAppHomeStateDetailClient
    ),
  {
    ssr: false,
    loading: () => <CxAppHomeStateDetailSkeleton />,
  }
);

/** Code-split state detail — keeps route transition light until the client chunk loads. */
export default function CxAppHomeStateDetailPage() {
  return <CxAppHomeStateDetailClient />;
}
