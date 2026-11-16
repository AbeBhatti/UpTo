/**
 * Client-side mirror of `cleanDescription` from Abhi's
 * `src/validators/upto.validator.ts` (Lab 5, UpTo tests 4–7).
 *
 * The SERVER is authoritative — this exists only so the counter under the
 * textarea measures what will actually be stored, and the form can stop a
 * 2,001-character description before the round trip. When Abhi's validator
 * lands, compare the two against the Lab 5 cases and fix this one if they
 * disagree; never the other way round.
 */

export const UPTO_DESCRIPTION_MAX = 2000;

// Zero-width and other invisible format characters, plus the BOM and soft hyphen.
const INVISIBLE = /[­᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;

/** Normalise line endings, strip invisible characters, collapse blank runs, trim. */
export function cleanDescription(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(INVISIBLE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Missing, null and blank all mean "no description" (Lab 5 UpTo test 5). */
export function toDescriptionField(text: string | null | undefined): string | null {
  if (text == null) return null;
  const cleaned = cleanDescription(text);
  return cleaned === "" ? null : cleaned;
}

/** Length as the server's string-length check measures it (UTF-16 units). */
export function descriptionLength(text: string): number {
  return cleanDescription(text).length;
}
