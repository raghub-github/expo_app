/** Avoid "Unexpected end of JSON input" when API returns empty body or HTML error page. */
export async function readApiJson<T = Record<string, unknown>>(
  res: Response
): Promise<T & { success?: boolean; error?: string }> {
  const text = await res.text();
  if (!text.trim()) {
    return {
      success: false,
      error: `Empty response from server (HTTP ${res.status})`,
    } as T & { success: false; error: string };
  }
  try {
    return JSON.parse(text) as T & { success?: boolean; error?: string };
  } catch {
    const preview = text.slice(0, 120).replace(/\s+/g, " ");
    return {
      success: false,
      error: `Invalid JSON (HTTP ${res.status}): ${preview}`,
    } as T & { success: false; error: string };
  }
}
