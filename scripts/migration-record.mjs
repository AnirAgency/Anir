/**
 * The SQL that records a migration in Supabase's own history
 * (supabase_migrations.schema_migrations), for one applied by pasting it
 * into the SQL editor — which leaves no record, so anyone rebuilding from
 * history gets a schema without it.
 *
 * The connector that records as it applies is not always allowed here, so
 * pasting is a normal path. Paste the migration and run it; then run this,
 * paste what it prints, and run that:
 *
 *   npm run migration:record -- 0009
 *   npm run migration:record -- 0002 --at 2026-11-03T14:24:43Z   (applied earlier)
 *
 * The same convention as every row the connector wrote: version is the UTC
 * time it was applied (now, unless --at says when), name is the file's name
 * without its number, the whole file is its one statement, and created_by
 * is copied from the row before it. Safe to run twice: a name already
 * recorded is left as it is. scripts/test-enquiry.ts checks that every file
 * here has its row.
 */
import { readdirSync, readFileSync } from 'node:fs';

const [prefix, flag, when] = process.argv.slice(2);
const dir = new URL('../supabase/migrations/', import.meta.url);
const file = readdirSync(dir).find((name) => /^\d{4}_.+\.sql$/.test(name) && name.startsWith(`${prefix}_`));
if (!prefix || !file) {
  console.error(`usage: npm run migration:record -- <number, e.g. 0009> [--at <ISO time it was applied>]\n${prefix ? `no supabase/migrations/${prefix}_*.sql` : ''}`);
  process.exit(1);
}

const name = file.replace(/^\d{4}_/, '').replace(/\.sql$/, '');
const sql = readFileSync(new URL(file, dir), 'utf8');
const TAG = '$anir_migration$';
if (sql.includes(TAG)) throw new Error(`${file} contains ${TAG}; pick another dollar-quote tag`);

let version = "to_char(now() at time zone 'utc', 'YYYYMMDDHH24MISS')";
if (flag === '--at') {
  const at = new Date(when ?? '');
  if (Number.isNaN(at.getTime())) throw new Error(`--at needs an ISO time, e.g. 2026-11-03T14:24:43Z`);
  version = `'${at.toISOString().replace(/[-:T]/g, '').slice(0, 14)}'`;
}

console.log(`-- Records ${file} as applied. Run once the migration itself has run.
insert into supabase_migrations.schema_migrations (version, name, statements, created_by)
select ${version}, '${name}', array[${TAG}${sql}${TAG}],
       (select created_by from supabase_migrations.schema_migrations order by version desc limit 1)
where not exists (select 1 from supabase_migrations.schema_migrations where name = '${name}');`);
