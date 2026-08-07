import { CxAppHomeClient } from "./CxAppHomeClient";
import { listActiveStates } from "@/lib/geo/list-active-states";

export default async function CxAppHomePage() {
  let initialStates: Awaited<ReturnType<typeof listActiveStates>> = [];
  try {
    initialStates = await listActiveStates();
  } catch {
    // Client RTK query will retry; list still renders without blocking spinner.
  }

  return <CxAppHomeClient initialStates={initialStates} />;
}
