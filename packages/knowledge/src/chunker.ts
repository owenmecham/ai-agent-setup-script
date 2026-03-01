export interface ChunkOptions {
  maxChunkSize: number;
  overlap: number;
  separators?: string[];
}

const DEFAULT_SEPARATORS = ['\n\n', '\n', '. ', ' ', ''];

export function chunkText(
  text: string,
  options: Partial<ChunkOptions> = {},
): string[] {
  const maxChunkSize = options.maxChunkSize ?? 1000;
  const overlap = options.overlap ?? 200;
  const separators = options.separators ?? DEFAULT_SEPARATORS;

  if (text.length <= maxChunkSize) {
    return [text];
  }

  return recursiveSplit(text, separators, maxChunkSize, overlap);
}

function recursiveSplit(
  text: string,
  separators: string[],
  maxSize: number,
  overlap: number,
): string[] {
  if (text.length <= maxSize) {
    return [text.trim()].filter(Boolean);
  }

  const separator = findBestSeparator(text, separators);

  if (separator === '') {
    // Hard split at maxSize with overlap
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + maxSize).trim());
      start += maxSize - overlap;
    }
    return chunks.filter(Boolean);
  }

  const splits = text.split(separator);
  const chunks: string[] = [];
  let currentChunk = '';

  for (const split of splits) {
    const candidate = currentChunk
      ? currentChunk + separator + split
      : split;

    if (candidate.length <= maxSize) {
      currentChunk = candidate;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
        // Start new chunk with overlap from the end of current chunk
        const overlapText = currentChunk.slice(-overlap);
        currentChunk = overlapText + separator + split;
        if (currentChunk.length > maxSize) {
          // Need to recursively split
          const remainingSeparators = separators.slice(separators.indexOf(separator) + 1);
          if (remainingSeparators.length > 0) {
            chunks.push(...recursiveSplit(currentChunk, remainingSeparators, maxSize, overlap));
            currentChunk = '';
          } else {
            chunks.push(currentChunk.slice(0, maxSize).trim());
            currentChunk = currentChunk.slice(maxSize - overlap);
          }
        }
      } else {
        // Single split is too large, recurse with next separator
        const remainingSeparators = separators.slice(separators.indexOf(separator) + 1);
        chunks.push(...recursiveSplit(split, remainingSeparators, maxSize, overlap));
      }
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter(Boolean);
}

function findBestSeparator(text: string, separators: string[]): string {
  for (const sep of separators) {
    if (sep === '' || text.includes(sep)) {
      return sep;
    }
  }
  return '';
}
