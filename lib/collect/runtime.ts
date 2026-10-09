import { AsyncLocalStorage } from "node:async_hooks";
import type { CollectionSettings } from "./contracts";

// Per-run configuration: never mutate process.env when multiple requests/jobs run.
const context = new AsyncLocalStorage<CollectionSettings>();
export const withCollectionSettings = <T>(settings: CollectionSettings, run: () => T): T => context.run(settings, run);
export const collectionRuntime = () => context.getStore();
export const liveCollectionEnabled = () => context.getStore()
  ? context.getStore()!.transport_mode !== "offline" : process.env.SCRAPE_ENABLED === "true";
