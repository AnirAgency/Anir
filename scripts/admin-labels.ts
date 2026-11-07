/**
 * Says what the admin would show without Mongolian words: a field with no
 * label (it would show its English key), a field with no line of help, a
 * list of things whose rows cannot name themselves, a view, group, status or
 * build failure with no words. The same check stops the build
 * (src/pages/admin/index.astro), so this is the quick way to see the list
 * before building.
 *
 *   npm run labels
 */
import { admin } from '../src/content/admin.ts';
import { seed } from '../src/content/site.ts';
import { allFields, checkAdmin, type Obj } from '../src/scripts/admin-schema.ts';

const missing = checkAdmin(seed as unknown as Obj, admin);
console.log(`\n  ADMIN COPY - ${allFields(seed as unknown as Obj).length} fields, lists and groups checked\n`);
for (const problem of missing) console.error(`  FAIL  admin copy: ${problem}`);
console.log(missing.length ? `\n  ${missing.length} missing\n` : '  PASS\n');
process.exit(missing.length ? 1 : 0);
