import { mkdirSync } from "node:fs";
import { runPipeline } from "../lib/collect";
import { coverageExitCode } from "../lib/collect/policy";

mkdirSync("data/logs", { recursive: true });

try {
  const result = await runPipeline({ scrape: true, full: true });
  console.log(JSON.stringify(result.coverage ?? { skipped: result.skipped, attempted: result.attempted }));
  process.exit(
    coverageExitCode({
      threw: false,
      pendingAtStart: result.pending_at_start ?? 0,
      attempted: result.attempted ?? 0,
    }),
  );
} catch (err) {
  console.error(err);
  process.exit(coverageExitCode({ threw: true, pendingAtStart: 1, attempted: 0 }));
}
