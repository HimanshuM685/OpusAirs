"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, invalidateRead, isAbort, readApi } from "./api";

export function useResource<T>(path: string | null, { pollMs = 0, ttlMs = 20000, stopWhen }: {
  pollMs?: number | ((data?: T) => number); ttlMs?: number; stopWhen?: (data: T) => boolean;
} = {}) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{ path: string | null; data?: T; error?: Error; loading: boolean; updatedAt?: number }>({ path, loading: Boolean(path) });
  const stop = useRef(stopWhen); stop.current = stopWhen;
  const poll = useRef(pollMs); poll.current = pollMs;
  const polling = typeof pollMs === "number" ? pollMs : -1;
  const refresh = useCallback(() => { if (path) invalidateRead(path); setRevision((n) => n + 1); }, [path]);
  useEffect(() => {
    if (!path) return;
    let disposed = false;
    let running = false;
    let terminal = false;
    let latest: T | undefined;
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
      setState((prev) => ({ path, data: prev.path === path ? prev.data : undefined, updatedAt: prev.path === path ? prev.updatedAt : undefined, loading: true }));
      try {
        const data = await readApi<T>(path, controller.signal, ttlMs);
        if (disposed) return;
        terminal = stop.current?.(data) === true;
        latest = data;
        setState({ path, data, loading: false, updatedAt: Date.now() });
      } catch (error) {
        if (!disposed && !isAbort(error)) {
          terminal = error instanceof ApiError && [401, 403].includes(error.status);
          setState((prev) => ({ path, data: prev.path === path ? prev.data : undefined, updatedAt: prev.path === path ? prev.updatedAt : undefined, loading: false, error: error instanceof Error ? error : new Error(String(error)) }));
        }
      } finally {
        running = false;
        if (!disposed && !terminal && controller.signal.aborted && visible()) queueMicrotask(() => void load());
        else if (!disposed && !terminal && visible()) {
          const delay = typeof poll.current === "function" ? poll.current(latest) : poll.current;
          if (delay > 0) timer = setTimeout(() => { invalidateRead(path); void load(); }, delay);
        }
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
  }, [path, revision, polling, ttlMs]);
  const same = state.path === path;
  const hasData = same && state.data !== undefined;
  const pending = Boolean(path) && (state.path !== path || state.loading);
  return { data: same ? state.data : undefined, error: same ? state.error : undefined,
    loading: pending && !hasData, refreshing: pending && hasData, updatedAt: same ? state.updatedAt : undefined, refresh };
}
