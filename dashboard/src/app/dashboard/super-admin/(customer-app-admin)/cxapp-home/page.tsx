import { listActiveStates } from "@/lib/geo/list-active-states";
import { CxAppHomeClient } from "./CxAppHomeClient";

/** Server-hydrate states so the list paints without a client skeleton flash. */
export default async function CxAppHomePage() {
  let initialStates: Awaited<ReturnType<typeof listActiveStates>> = [];
  try {
    initialStates = await listActiveStates();
  } catch {
    initialStates = [];
  }
  return <CxAppHomeClient initialStates={initialStates} />;
}
