"use client";

import { CxAppHomeClient } from "./CxAppHomeClient";

/** List UI is owned by the shared layout twin shell; keep a null page for the route. */
export default function CxAppHomePage() {
  return <CxAppHomeClient initialStates={[]} />;
}
