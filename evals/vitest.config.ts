import { defineConfig } from "vitest/config";
import TrendReporter from "./src/trend-reporter.js";

export default defineConfig({
  test: {
    // *.eval.ts = model-backed evals; src/**/*.test.ts = the pure stats unit tests.
    include: ["**/*.eval.ts", "src/**/*.test.ts"],
    // Real Claude sessions (and a subagent dispatch) are slow — give them room.
    testTimeout: 240_000,
    hookTimeout: 240_000,
    // One session per test; a few files can run concurrently. Keep it modest to stay cheap.
    fileParallelism: true,
    // Attempt cap: 2 per case (1 retry). Model-backed cases are nondeterministic, so one flake
    // would otherwise redden a whole run. This BOUNDS the cost of flakiness, it does not reduce
    // it — a retry is a second Claude session. Two consequences worth knowing:
    //   - record() fires per ATTEMPT, so a retried case appends 2 rows to records.jsonl under the
    //     same nodeid; the pass-rate series in stats.ts counts both, and `eval:repeat -n 5` can
    //     therefore yield more than 5 samples for a flaky case.
    //   - the output slug is per-case, not per-attempt, so the retry OVERWRITES the failing
    //     attempt's text in results/outputs/<runId>/ — the copy you would want for debugging.
    retry: 1,
    reporters: ["default", new TrendReporter()],
  },
});
