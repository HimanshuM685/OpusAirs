const store = new Map<string, { at: number; body: unknown }>();

export function readCache(key: string, ttlMs: number): unknown | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() - hit.at > ttlMs) {
    store.delete(key);
    return undefined;
  }
  return hit.body;
}

export function writeCache(key: string, body: unknown): void {
  store.set(key, { at: Date.now(), body });
}

export function clearIndexCache(): void {
  for (const key of store.keys()) {
    if (key.startsWith("index:") || key.startsWith("routes:") || key.startsWith("heatmap:")) store.delete(key);
  }
}
