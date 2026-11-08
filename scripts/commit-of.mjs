/**
 * Which commit a build is of, for its report (scripts/build-report.mjs).
 *
 * Workers Builds sets WORKERS_CI_COMMIT_SHA on a build started by a push,
 * but a build started by the deploy hook — the admin's «Нийтлэх» — arrives
 * without it, and a failed publish recorded without "of what" is half a
 * record. The repo is checked out either way, so git says. Null only if
 * neither knows; never throws.
 */
import { execFileSync } from 'node:child_process';

const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * @param {Record<string, string | undefined>} env
 * @param {() => string} [git] how to ask git; a stand-in in tests
 * @returns {string | null}
 */
export function commitOf(env, git = head) {
  if (/^[0-9a-f]{7,40}$/i.test(env.WORKERS_CI_COMMIT_SHA ?? '')) return env.WORKERS_CI_COMMIT_SHA ?? null;
  try {
    const sha = git().trim();
    return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
  } catch {
    return null;
  }
}
