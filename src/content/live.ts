/**
 * The content the team edits in the admin, laid over site.ts.
 *
 * site.ts is the types and the seed: what the site says when the database
 * holds nothing. The build pulls the database into live.json
 * (scripts/content-pull.mjs) and site.ts lays it over the seed here, so every
 * component, the Worker and the tests keep reading one `site` object.
 *
 * The rules of the overlay, the same in the build and in the admin's forms:
 *  - A section saved in the admin replaces the seed's, key by key. A key the
 *    database lacks keeps the seed's value — a field added to site.ts after
 *    the content was saved still has one.
 *  - null in the database means removed (an optional testimonial, a link):
 *    it stays null; components test these for truth.
 *  - Products saved in the admin replace the seed's products whole, in their
 *    saved order. A key a product lacks comes from the seed product with the
 *    same id, or the first one.
 *  - Where both have a value the types must agree, or the build stops and
 *    names the path — so a broken save fails the build instead of shipping.
 */

export interface LiveProduct {
  id: string;
  position: number;
  data: Record<string, unknown>;
}

export interface Live {
  sections?: Record<string, Record<string, unknown>>;
  products?: LiveProduct[];
}

const kind = (value: unknown) => (value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value);

/** `live` laid over `seed`, checked against it. `path` names the place in errors. */
export function overlay(seed: unknown, live: unknown, path: string): unknown {
  if (live === undefined) return seed;
  if (live === null || seed === undefined || seed === null) return live;

  if (kind(seed) !== kind(live)) {
    throw new Error(`content: ${path} is ${kind(live)} in the database, ${kind(seed)} in site.ts.`);
  }

  if (Array.isArray(seed)) {
    return (live as unknown[]).map((item, i) => overlay(seed[i] ?? seed[0], item, `${path}[${i}]`));
  }

  if (kind(seed) === 'object') {
    const out: Record<string, unknown> = {};
    const from = seed as Record<string, unknown>;
    const over = live as Record<string, unknown>;
    for (const key of new Set([...Object.keys(from), ...Object.keys(over)])) {
      out[key] = overlay(from[key], over[key], `${path}.${key}`);
    }
    return out;
  }

  return live;
}

/** The whole site: the seed with the database's sections and products laid over it. */
export function applyLive<T extends { products: { items: { id: string }[] } }>(seed: T, live: Live): T {
  const site = { ...seed } as Record<string, unknown>;

  for (const [key, data] of Object.entries(live.sections ?? {})) {
    if (!(key in seed)) throw new Error(`content: section "${key}" is in the database but not in site.ts.`);
    // The products section's row is its copy; its items come from the products table.
    const { items: _items, ...copy } = data as Record<string, unknown>;
    site[key] = overlay((seed as Record<string, unknown>)[key], key === 'products' ? copy : data, key);
  }

  const rows = [...(live.products ?? [])].sort((a, b) => a.position - b.position);
  if (rows.length > 0) {
    const { items } = seed.products;
    const products = site.products as { items: unknown[] };
    site.products = {
      ...products,
      items: rows.map((row) => {
        const template = items.find((item) => item.id === row.id) ?? items[0];
        return overlay(template, { ...row.data, id: row.id }, `products.items[${row.id}]`);
      }),
    };
  }

  return site as T;
}
