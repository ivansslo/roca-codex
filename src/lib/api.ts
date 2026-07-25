export async function safeFetchJson<T = any>(url: string, options?: RequestInit, fallback: T = {} as T): Promise<T> {
  try {
    const res = await fetch(url, options);
    if (!res.ok) return fallback;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      console.warn(`[safeFetchJson] ${url} returned non-JSON content-type: ${contentType}`);
      return fallback;
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn(`[safeFetchJson] Error fetching ${url}:`, err);
    return fallback;
  }
}
