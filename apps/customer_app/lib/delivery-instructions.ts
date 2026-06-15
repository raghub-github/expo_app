/** Rider delivery instruction tags — keep in sync with backend buildDeliveryInstructionsArray. */

export const DELIVERY_INSTRUCTION_PRESETS = [
  "Leave at door",
  "Leave with guard",
  "Avoid calling",
  "Do not ring bell",
  "Pet at home",
] as const;

export type DeliveryInstructionPrefs = {
  note: string;
  leaveAtDoor: boolean;
  leaveWithGuard: boolean;
  avoidCalling: boolean;
  dontRingBell: boolean;
  petAtHome: boolean;
};

function presetKey(s: string): string {
  return s.trim().toLowerCase();
}

const PRESET_BY_KEY = new Map(
  DELIVERY_INSTRUCTION_PRESETS.map((p) => [presetKey(p), p] as const)
);

export function buildDeliveryInstructionsList(prefs: DeliveryInstructionPrefs): string[] {
  const out: string[] = [];
  const note = prefs.note.trim();
  if (note) out.push(note);
  if (prefs.leaveAtDoor) out.push("Leave at door");
  if (prefs.leaveWithGuard) out.push("Leave with guard");
  if (prefs.avoidCalling) out.push("Avoid calling");
  if (prefs.dontRingBell) out.push("Do not ring bell");
  if (prefs.petAtHome) out.push("Pet at home");
  return [...new Set(out)];
}

export function parseDeliveryInstructionsList(
  list: string[] | null | undefined
): DeliveryInstructionPrefs {
  const prefs: DeliveryInstructionPrefs = {
    note: "",
    leaveAtDoor: false,
    leaveWithGuard: false,
    avoidCalling: false,
    dontRingBell: false,
    petAtHome: false,
  };
  if (!list?.length) return prefs;

  const notes: string[] = [];
  for (const raw of list) {
    const t = String(raw ?? "").trim();
    if (!t) continue;
    const preset = PRESET_BY_KEY.get(presetKey(t));
    if (preset === "Leave at door") prefs.leaveAtDoor = true;
    else if (preset === "Leave with guard") prefs.leaveWithGuard = true;
    else if (preset === "Avoid calling") prefs.avoidCalling = true;
    else if (preset === "Do not ring bell") prefs.dontRingBell = true;
    else if (preset === "Pet at home") prefs.petAtHome = true;
    else notes.push(t);
  }
  prefs.note = notes.join(" | ");
  return prefs;
}
