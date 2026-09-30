import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "../db";

export function loadAirports(): Set<string> {
  const set = new Set<string>();
  try {
    const text = readFileSync(join(dataDir(), "in_airports.csv"), "utf8");
    for (const line of text.split(/\r?\n/).slice(1)) {
      const code = line.split(",")[0]?.trim().toUpperCase();
      if (code && /^[A-Z]{3}$/.test(code)) set.add(code);
    }
  } catch {
    /* empty set: discoveries stay off until the file is present */
  }
  return set;
}
