/** Client-safe types for rider logout session UI (no server/DB imports). */

export type RiderLogoutEventRow = {
  id: string;
  riderId: number;
  userId: string;
  deviceId: string | null;
  reasonCode: string;
  reasonText: string | null;
  createdAt: string;
  reasonLabel: string;
};

export type RiderLogoutSessionSnapshot = {
  status: "logged_in" | "logged_out";
  totalLogoutCount: number;
  activeDeviceCount: number;
  latest: {
    id: string;
    reasonCode: string;
    reasonText: string | null;
    reasonLabel: string;
    createdAt: string;
  } | null;
};
