/**
 * Text the database will always take, shared by everything the Worker
 * writes: an enquiry (./enquiry.ts), an alert's detail (./alerts.ts), a
 * build's failing lines (./builds.ts).
 *
 * Two ways a write is refused for its text alone. Postgres text cannot hold
 * a NUL, and cannot hold half of a surrogate pair (not valid UTF-8) — which
 * a cut by UTF-16 units makes whenever it lands inside an emoji. And a
 * length check counts characters as char_length does: code points. `fit`
 * answers both, so a capped column can never refuse what is cut to its cap.
 */

/** No NUL, and every half of a surrogate pair either paired or replaced. */
export const storable = (text: string) =>
  text.replace(/\u0000/g, '').replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�');

/** Whatever was sent, as text: a JSON number or list is kept, not dropped. */
export const asText = (value: unknown) =>
  typeof value === 'string' ? value : value === undefined || value === null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);

/** Characters as Postgres's char_length counts them: storable text has no half pairs, so each pair is one. */
const PAIR = /[\ud800-\udbff][\udc00-\udfff]/g;
const characters = (text: string) => text.length - (text.match(PAIR)?.length ?? 0);

/**
 * Text as it is stored: made storable, trimmed, and at most `max`
 * characters, counted as the table's checks count them — so the table can
 * never refuse it, a character is never split, and text that fits is never
 * cut. `cutFrom` is how many characters came, when that was too many.
 */
export function fit(value: unknown, max: number): { text: string; cutFrom?: number } {
  const text = storable(asText(value)).trim();
  if (text.length <= max) return { text }; // never more characters than UTF-16 units
  const length = characters(text);
  if (length <= max) return { text };
  // The first `max` characters lie within the first 2 × max units, each whole.
  return { text: Array.from(text.slice(0, max * 2)).slice(0, max).join(''), cutFrom: length };
}
