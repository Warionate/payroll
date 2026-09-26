/**
 * Normalize mojibake filenames (latin1->utf8 heuristic)
 */
export function normalizeOriginalName(name: string): string {
  if (!name) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded && decoded !== name) {
    const hasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(decoded);
    const origHasCjk = /[\u3040-\u30ff\u3400-\u9fff]/.test(name);
    if (hasCjk && !origHasCjk && !decoded.includes('\uFFFD')) {
      return decoded;
    }
  }
  return name;
}
