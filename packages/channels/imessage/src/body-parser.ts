/**
 * Parses the `attributedBody` NSAttributedString binary blob.
 * macOS Ventura+ stores iMessage text in this column instead of plain `text`.
 */
export function extractText(
  attributedBody: Buffer | null,
  plainText: string | null,
): string {
  // Prefer plain text when available
  if (plainText && plainText.trim().length > 0) {
    return plainText;
  }

  if (!attributedBody || attributedBody.length === 0) {
    return '';
  }

  return parseAttributedBody(attributedBody);
}

/**
 * Extracts UTF-8 text from an NSArchiver/NSKeyedArchiver typedstream blob.
 *
 * The attributedBody column contains an NSTypedStream binary encoding.
 * The actual message text is stored as a length-prefixed UTF-8 string
 * following an NSString class marker.
 *
 * Strategy:
 * 1. Look for the NSString marker and read the length-prefixed string after it
 * 2. Fallback: scan for the longest run of printable UTF-8 characters
 */
function parseAttributedBody(buf: Buffer): string {
  // Strategy 1: Find NSString marker and extract the length-prefixed string.
  // The typedstream format stores NSString followed by a length byte and UTF-8 data.
  const nsStringMarker = Buffer.from('NSString');
  let idx = buf.indexOf(nsStringMarker);

  if (idx !== -1) {
    // Skip past the marker and look for length-prefixed content.
    // The format varies, but typically there's a small header after
    // NSString followed by a length byte and then UTF-8 text.
    let searchStart = idx + nsStringMarker.length;

    // Scan forward looking for a length indicator.
    // The typedstream uses a byte for lengths < 128, or multi-byte for longer strings.
    for (let i = searchStart; i < Math.min(searchStart + 32, buf.length - 1); i++) {
      const possibleLen = buf[i];
      if (possibleLen > 0 && possibleLen < 0x80 && i + 1 + possibleLen <= buf.length) {
        const candidate = buf.subarray(i + 1, i + 1 + possibleLen).toString('utf-8');
        if (isPrintable(candidate) && candidate.length >= 1) {
          return candidate;
        }
      }

      // Handle two-byte length encoding (0x81 prefix for lengths 128-255)
      if (possibleLen === 0x81 && i + 2 < buf.length) {
        const actualLen = buf[i + 1];
        if (actualLen > 0 && i + 2 + actualLen <= buf.length) {
          const candidate = buf.subarray(i + 2, i + 2 + actualLen).toString('utf-8');
          if (isPrintable(candidate) && candidate.length >= 1) {
            return candidate;
          }
        }
      }
    }
  }

  // Strategy 2: Fallback — find the longest run of printable UTF-8 characters.
  // Skip the first ~30 bytes which are typically binary header data.
  return extractLongestPrintableRun(buf, 20);
}

function extractLongestPrintableRun(buf: Buffer, startOffset: number): string {
  const str = buf.subarray(startOffset).toString('utf-8');
  let longest = '';
  let current = '';

  for (const char of str) {
    if (isPrintableChar(char)) {
      current += char;
    } else {
      if (current.length > longest.length) {
        longest = current;
      }
      current = '';
    }
  }

  if (current.length > longest.length) {
    longest = current;
  }

  return longest.trim();
}

function isPrintable(str: string): boolean {
  for (const char of str) {
    if (!isPrintableChar(char)) return false;
  }
  return true;
}

function isPrintableChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  // Allow printable ASCII, common unicode (letters, emojis, punctuation)
  // Reject control characters (0x00-0x08, 0x0E-0x1F) but allow tab, newline, carriage return
  if (code <= 0x08) return false;
  if (code >= 0x0E && code <= 0x1F) return false;
  if (code === 0x7F) return false; // DEL
  return true;
}
