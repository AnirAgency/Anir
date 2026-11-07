/**
 * The longest each part of an enquiry is stored, in characters as Postgres's
 * char_length counts them: code points, so an emoji is one, not two.
 *
 * One place for five readers: the form's maxlength (src/components/
 * Contact.astro), the Worker's cut (worker/enquiry.ts), the admin's words
 * for a cut (src/scripts/admin.ts), and the table's own checks
 * (supabase/migrations), which scripts/test-enquiry.ts reads from the
 * migration files and fails on if they and these numbers disagree.
 *
 * A value past its limit is never refused — the table would refuse the whole
 * row, and that is an enquiry lost. The Worker keeps the first `max`
 * characters, stores the enquiry, and flags it `cut:<field>:<characters it
 * came with>`.
 */
export const ENQUIRY_MAX = {
  name: 100,
  contact: 120,
  message: 2000,
  /** A request header, not a form field: a browser's is 100–300; a crawler's can be thousands. */
  user_agent: 400,
  /** A chip's value or an answer to a question added in the admin — a short code; no column check, kept whole enough to read when forged. */
  choice: 200,
} as const;
