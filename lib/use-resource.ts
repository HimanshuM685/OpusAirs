"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, invalidateRead, isAbort, readApi } from "./api";

export function useResource<T>(path: string | null, { pollMs = 0, ttlMs = 20000, stopWhen }: {
  pollMs?: number; ttlMs?: number; stopWhen?: (data: T) => boolean;
} = {}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ path: string | null; data?: T; error?: Error; loading: boolean }>({ path, loading: Boolean(path) });
  const stop = useRef(stopWhen); stop.current = stopWhen;
  const refresh = useCallback(() => { if (path) invalidateRead(path); setRevision((n) => n + 1); }, [path]);
  useEffect(() => {
    if (!path) return;
    let disposed = false;
    let running = false;
    let terminal = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;
    const visible = () => document.visibilityState === "visible" && navigator.onLine !== false;
    const load = async () => {
      if (disposed || running || terminal) return;
      if (!visible()) {
        if (navigator.onLine === false) setState((prev) => ({ path, data: prev.path === path ? prev.data : undefined, loading: false, error: new Error("You are offline. Reconnect to resume loading.") }));
        return;
      }
      running = true; controller = new AbortController();
      setState((prev) => ({ path, data: prev.path === path ? prev.data : undefined, loading: true }));
      try {
        const data = await readApi<T>(path, controller.signal, ttlMs);
        if (disposed) return;
        terminal = stop.current?.(data) === true;
        setState({ path, data, loading: false });
      } catch (error) {
        if (!disposed && !isAbort(error)) {
          terminal = error instanceof ApiError && [401, 403].includes(error.status);
          setState((prev) => ({ path, data: prev.path === path ? prev.data : undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) }));
        }
      } finally {
        running = false;
        if (!disposed && !terminal && controller.signal.aborted && visible()) queueMicrotask(() => void load());
        else if (!disposed && pollMs && !terminal && visible()) timer = setTimeout(() => { invalidateRead(path); void load(); }, pollMs);
      }
    };
    const onVisibility = () => {
      clearTimeout(timer);
      if (!visible()) {
        controller?.abort();
        if (navigator.onLine === false) setState((prev) => ({ ...prev, loading: false, error: new Error("You are offline. Reconnect to resume loading.") }));
      }
      else void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility); window.addEventListener("offline", onVisibility);
    void load();
    return () => {
      disposed = true; clearTimeout(timer); controller?.abort();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility); window.removeEventListener("offline", onVisibility);
    };
  }, [path, revision, pollMs, ttlMs]);
  return { data: state.path === path ? state.data : undefined, error: state.path === path ? state.error : undefined,
    loading: Boolean(path) && (state.path !== path || state.loading), refresh };
}
