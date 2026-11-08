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
 * characters and stores the enquiry. A cut form field or chip — which the
 * form's own maxlength keeps a browser inside, so a cut means it did not
 * come from one — is flagged `cut:<field>:<characters it came with>` in
 * `unrecognised`. A cut User-Agent is only noted, in `diagnostics`.
 */
export const ENQUIRY_MAX = {
  name: 100,
  contact: 120,
  message: 2000,
  /**
   * A request header, not a form field, and no sign of whether a visitor is
   * real. In-app browsers add their own block — Facebook's on Android was
   * captured at 165 characters (scripts/test-enquiry.ts keeps it), its iOS
   * FBAN/FBAV/FBDV/… block runs longer — and 1000 leaves every real browser
   * room (migration 0008). Past it: cut, noted, never flagged.
   */
  user_agent: 1000,
  /** A chip's value or an answer to a question added in the admin — a short code; no column check, kept whole enough to read when forged. */
  choice: 200,
} as const;
