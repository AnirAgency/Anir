/**
 * Serves dist/ with the real _headers rules applied.
 *
 * `astro preview` ignores _headers, so it cannot tell you whether the CSP you
 * are about to deploy breaks the site. This can: it parses dist/_headers, walks
 * the rules in order, and applies every match — the same way Cloudflare Pages
 * does — so a policy that blocks your own inline script fails here instead of
 * on aniragency.mn.
 *
 *   node scripts/serve-dist.mjs [port]
 */
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const port = Number(process.argv[2]) || 4331;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webm': 'video/webm',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

/** Parses _headers into [{ pattern, headers }] in file order. */
function parseHeaders() {
  const file = join(dist, '_headers');
  if (!existsSync(file)) return [];
  const rules = [];
  let current = null;
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), headers: [] };
      rules.push(current);
    } else if (current) {
      const at = line.indexOf(':');
      if (at > 0) current.headers.push([line.slice(0, at).trim(), line.slice(at + 1).trim()]);
    }
  }
  return rules;
}

const rules = parseHeaders();

const matches = (pattern, path) => {
  if (!pattern.includes('*')) return pattern === path;
  const [head] = pattern.split('*');
  return path.startsWith(head);
};

const server = createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  let path = decodeURIComponent(url.pathname);

  let file = join(dist, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, path.replace(/\/$/, ''), 'index.html');
  if (!existsSync(file)) file = join(dist, 'index.html');

  for (const rule of rules) {
    if (matches(rule.pattern, path)) {
      for (const [name, value] of rule.headers) response.setHeader(name, value);
    }
  }

  response.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
  response.writeHead(200);
  response.end(readFileSync(file));
});

server.listen(port, () => {
  console.log(`  dist/ on http://localhost:${port} with ${rules.length} _headers rule(s) applied`);
});
