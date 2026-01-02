import { getItem, setItem } from "./storage";

const DEVICE_ID_KEY = "gm_device_id_v1";

function createDeviceId(): string {
  // Not a hardware identifier; this is an app-scoped stable id for session binding.
  return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getItem(DEVICE_ID_KEY);
  if (existing?.trim()) return existing.trim();

  const created = createDeviceId();
  await setItem(DEVICE_ID_KEY, created);
  return created;
}


