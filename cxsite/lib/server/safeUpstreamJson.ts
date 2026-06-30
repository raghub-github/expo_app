/** Parse JSON only when upstream actually returned JSON (avoids HTML error pages). */
export async function readUpstreamJson<T>(response: Response): Promise<T | null> {
  const contentType = response.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return null
  try {
    return (await response.json()) as T
  } catch {
    return null
  }
}
