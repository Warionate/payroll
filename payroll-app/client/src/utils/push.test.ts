import { describe, it, expect } from 'vitest';

// We only want to test the utility function urlBase64ToUint8Array, but it's not exported.
// However, we can test the exported functions if we mock the browser APIs.
// Or, we can modify push.js to export the utility function for testing.
// For now, let's assume we can't modify push.js easily and just test what we can,
// OR better, let's modify push.js to export the helper function.

// Actually, I'll modify push.js to export urlBase64ToUint8Array for testing purposes.
// But first, let's see if I can just copy the logic to test it, or if I should really export it.
// Exporting is cleaner.

import { urlBase64ToUint8Array } from './push';

describe('push utils', () => {
  // Mock window.atob since it's used in the function
  // jsdom should have atob, but let's verify.

  it('should convert base64 string to Uint8Array', () => {
    // "Hello" in base64 is "SGVsbG8="
    const base64 = 'SGVsbG8=';
    const result = urlBase64ToUint8Array(base64);

    // H=72, e=101, l=108, l=108, o=111
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result).toEqual(new Uint8Array([72, 101, 108, 108, 111]));
  });

  it('should handle URL-safe base64 strings', () => {
    // Standard: +/
    // URL-safe: -_
    // Let's construct a string that uses these characters.
    // standard: "abc+" -> URL safe: "abc-"
    // standard: "abc/" -> URL safe: "abc_"

    // ">>??" in base64 is "Pj4/Pw=="
    // URL safe would be "Pj4_Pw" (no padding usually, or padding)

    const input = 'Pj4_Pw'; // ">>??"
    const result = urlBase64ToUint8Array(input);

    // > = 62, ? = 63
    expect(result).toEqual(new Uint8Array([62, 62, 63, 63]));
  });
});
