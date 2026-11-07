/**
 * The production build's report on itself, to the admin (worker/builds.ts).
 *
 *   node scripts/build-report.mjs start              the build has started
 *   node scripts/build-report.mjs <exit-code> <log>  how it ended, and why
 *
 * `npm run ci` (package.json) — the Workers Builds build command — calls it
 * before and after `npm run budget`, always as `… || true`: a report that
 * cannot be sent must never change whether the build passes. This script
 * also never exits non-zero itself, for the same reason.
 *
 * It reports only on Workers Builds, on the production branch, and only
 * with BUILD_REPORT_SECRET set as a build secret; anywhere else it says why
 * it did nothing. Workers Builds sets WORKERS_CI, WORKERS_CI_BRANCH,
 * WORKERS_CI_COMMIT_SHA and WORKERS_CI_BUILD_UUID — the last is the same id
 * the deploy hook hands the admin, which is how the admin knows the report
 * is for the build it started.
 *
 * It sends the build's last lines that say why it stopped (FAIL, Error), at
 * most 200, never the whole log.
 */
import { existsSync, readFileSync } from 'node:fs';
import { PRODUCTION_BRANCH } from '../src/lib/placeholders.mjs';

/** The live Worker. Override with BUILD_REPORT_URL once aniragency.mn is the address. */
const DEFAULT_URL = 'https://anir.b-batuka0627.workers.dev/api/builds';

const [what, logFile] = process.argv.slice(2);
const env = process.env;
const say = (text) => console.log(`  build report: ${text}`);

async function main() {
  if (env.WORKERS_CI !== '1') return say('skipped — not on Workers Builds');
  if (env.WORKERS_CI_BRANCH !== PRODUCTION_BRANCH) return say(`skipped — ${env.WORKERS_CI_BRANCH ?? 'no branch'} is not ${PRODUCTION_BRANCH}`);
  if (!env.BUILD_REPORT_SECRET) return say('skipped — BUILD_REPORT_SECRET is not set as a build secret');
  if (!env.WORKERS_CI_BUILD_UUID) return say('skipped — no WORKERS_CI_BUILD_UUID');

  const finished = what !== 'start';
  const lines =
    finished && logFile && existsSync(logFile)
      ? readFileSync(logFile, 'utf8')
          .split(/\r?\n/)
          .filter((line) => /FAIL|Error|error:|content:|over /.test(line))
          .slice(-200)
          .map((line) => line.slice(0, 400))
      : [];

  const response = await fetch(env.BUILD_REPORT_URL || DEFAULT_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.BUILD_REPORT_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      build: env.WORKERS_CI_BUILD_UUID,
      branch: env.WORKERS_CI_BRANCH,
      sha: env.WORKERS_CI_COMMIT_SHA,
      event: finished ? 'finished' : 'started',
      code: finished ? Number(what) : undefined,
      lines,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  say(`${finished ? `exit ${what}` : 'started'} → ${response.status}`);
}

main().catch((error) => say(`not sent — ${error.message}`));
