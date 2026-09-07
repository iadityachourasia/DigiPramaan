/**
 * shortCode.ts — human-transcribable short codes.
 *
 * Two features need one: mobile handoff's fallback code (page 3) and the
 * citizen grievance tracking reference (page 11). Both are read off one screen
 * and typed into another, sometimes written on paper first, so both need the
 * same unambiguous alphabet. They had two separate implementations of that
 * idea before this file existed.
 *
 * Randomness comes from `crypto.getRandomValues`, not `Math.random()`. A
 * five-minute handoff token could arguably live with a predictable generator;
 * a grievance reference is the only key a citizen has to their submission and
 * has no expiry at all, so guessability actually matters.
 */

/**
 * No 0/O and no 1/I/L, so a code never misreads when spoken aloud, written by
 * hand, or read off a phone screen in a shop. 31 characters.
 */
export const SHORT_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/**
 * `length` characters from the alphabet above.
 *
 * Rejection sampling rather than a plain modulo: 256 is not a multiple of 31,
 * so `byte % 31` would make the first few characters of the alphabet slightly
 * more likely than the rest. Discarding the short tail keeps the distribution
 * even, which costs nothing at these lengths.
 */
export function randomShortCode(length: number): string {
  const limit = Math.floor(256 / SHORT_CODE_ALPHABET.length) * SHORT_CODE_ALPHABET.length;
  let code = "";

  while (code.length < length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (code.length === length) break;
      if (byte >= limit) continue;
      code += SHORT_CODE_ALPHABET[byte % SHORT_CODE_ALPHABET.length];
    }
  }

  return code;
}

/**
 * The mobile handoff shape: eight characters split `XXXX-XXXX`. The hyphen is
 * there because an eight-character run is hard to keep your place in while
 * typing it on a phone.
 */
export function generateHandoffCode(): string {
  const chars = randomShortCode(8);
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

/**
 * The grievance tracking reference: `LM-XXXXXX`. The prefix is deliberate —
 * it tells whoever is holding the code which kind of code it is, which a bare
 * `XXXX-XXXX` does not.
 */
export function generateGrievanceReference(): string {
  return `LM-${randomShortCode(6)}`;
}

/**
 * How every code entry field must normalise its input. The alphabet is
 * uppercase-only, and a citizen typing on a phone will often get lowercase and
 * stray whitespace.
 */
export function normalizeShortCode(input: string): string {
  return input.trim().toUpperCase();
}
