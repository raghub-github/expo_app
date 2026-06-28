export type PersonRideCustomerQuickReplyAction = "send" | "share_location" | "call";

export type PersonRideCustomerQuickReply = {
  id: string;
  message: string;
  action: PersonRideCustomerQuickReplyAction;
};

export const PERSON_RIDE_CUSTOMER_QUICK_REPLIES: PersonRideCustomerQuickReply[] = [
  {
    id: "waitingAtPickup",
    message: "I'm waiting at the pickup point.",
    action: "send",
  },
  {
    id: "waitTwoMinutes",
    message: "Please wait 2 minutes.",
    action: "send",
  },
  {
    id: "sharingLocation",
    message: "Sharing my location with you.",
    action: "share_location",
  },
  {
    id: "callingNow",
    message: "Calling you now; please pick up the call.",
    action: "call",
  },
];

export function isPersonRidePartnerChat(params: {
  personRide?: string;
  partnerRole?: string;
  orderSubtitle?: string;
}): boolean {
  const personRideFlag = params.personRide === "1" || params.personRide === "true";
  if (personRideFlag) return true;
  const role = (params.partnerRole ?? "").trim().toLowerCase();
  const subtitle = (params.orderSubtitle ?? "").trim().toLowerCase();
  return role === "captain" || role === "mitra-sathi" || subtitle.includes("live ride");
}
