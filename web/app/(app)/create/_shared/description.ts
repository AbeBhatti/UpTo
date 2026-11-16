/**
 * Client-side mirror of `cleanDescription` and the 2,000-character limit from
 * Abhi's `backend/src/validators/upto.validator.ts` (Lab 5, UpTo tests 4–7).
 *
 * Copied rule for rule so the counter under the textarea always agrees with
 * what the server stores. The SERVER is authoritative: if the two ever
 * disagree, change this file to match his, never the other way round.
 */

export const UPTO_DESCRIPTION_MAX = 2000;

/**
 * Zero-width, bidi-control and other invisible characters, plus C0 controls
 * other than tab and newline. A zero-width joiner between two pictographs is
 * kept, because it is part of an emoji such as a family or a profession.
 *
 * Built with `new RegExp` because the lookbehind is newer than the web
 * tsconfig's ES2017 target; every browser we support runs it.
 */
const INVISIBLE = new RegExp(
  "[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F\\u00AD\\u180E\\u200B\\u200C\\u200E\\u200F\\u202A-\\u202E\\u2060-\\u2064\\u2066-\\u2069\\uFEFF]" +
    "|(?<!\\p{Extended_Pictographic}\\uFE0F?)\\u200D" +
    "|\\u200D(?!\\p{Extended_Pictographic})",
  "gu",
);

/**
 * Normalise line endings, strip invisible characters, drop trailing spaces on
 * each line, collapse runs of blank lines to one, and trim the whole text.
 */
export function cleanDescription(text: string): string {
  return text
    .normalize("NFC")
    .replace(/\r\n?|\u2028|\u2029/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Missing, null and blank all mean "no description" (Lab 5 UpTo test 5). */
export function toDescriptionField(text: string | null | undefined): string | null {
  if (text == null) return null;
  const cleaned = cleanDescription(text);
  return cleaned === "" ? null : cleaned;
}

/** Length as the server counts it: code points, so an emoji is one, not two. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

export function descriptionLength(text: string): number {
  return codePointLength(cleanDescription(text));
}
