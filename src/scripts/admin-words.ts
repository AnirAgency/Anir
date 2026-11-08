/**
 * Every word the admin says, put back together: the core
 * (src/content/admin.ts) and each tool's own (src/content/admin-tasks.ts,
 * src/content/admin-contributions.ts). For what reads all of them at build
 * time — the admin page's word check (./admin-check.ts) and
 * `npm run copy:export -- --admin` — never for the admin's own script, which
 * loads each tool's words only with the tool.
 */
import { admin } from '../content/admin.ts';
import { tasks } from '../content/admin-tasks.ts';
import { contributions } from '../content/admin-contributions.ts';
import type { AllWords } from './admin-check.ts';

export const allWords: AllWords = { ...admin, tasks, contributions };
