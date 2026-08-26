export type SearchEntry<T> = { item: T; text: string };

export function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('it')
    .replace(/[’'`]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levenshteinDistance(
  left: string,
  right: string,
  maximum = Number.POSITIVE_INFINITY,
): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > maximum) return maximum + 1;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maximum) return maximum + 1;
    previous = current;
  }
  return previous[right.length];
}

function directSearchScore(normalizedText: string, normalizedQuery: string): number {
  if (!normalizedQuery) return Number.POSITIVE_INFINITY;
  if (normalizedText === normalizedQuery) return 0;
  if (normalizedText.startsWith(normalizedQuery)) return 1;
  if (normalizedText.includes(normalizedQuery)) return 2;

  const compactText = normalizedText.replaceAll(' ', '');
  const compactQuery = normalizedQuery.replaceAll(' ', '');
  if (compactText.includes(compactQuery)) return 3;
  return Number.POSITIVE_INFINITY;
}

function fuzzySearchScore(normalizedText: string, normalizedQuery: string): number {
  const directScore = directSearchScore(normalizedText, normalizedQuery);
  if (Number.isFinite(directScore)) return directScore;

  const candidateTokens = normalizedText.split(' ').filter((token) => token.length > 1);
  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  let fuzzyScore = 0;
  for (const queryToken of queryTokens) {
    const threshold = queryToken.length >= 6 ? 2 : queryToken.length >= 4 ? 1 : 0;
    const tokenScore = candidateTokens.reduce((best, candidate) => {
      if (candidate.includes(queryToken) || queryToken.includes(candidate)) return Math.min(best, 0);
      if (!threshold || Math.abs(candidate.length - queryToken.length) > threshold) return best;
      return Math.min(best, levenshteinDistance(candidate, queryToken, threshold));
    }, Number.POSITIVE_INFINITY);
    if (tokenScore > threshold) return Number.POSITIVE_INFINITY;
    fuzzyScore += tokenScore;
  }
  return 10 + fuzzyScore;
}

export function rankSearchItems<T>(
  entries: SearchEntry<T>[],
  query: string,
  limit: number,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  const directMatches = entries
    .map((entry) => ({ item: entry.item, score: directSearchScore(entry.text, normalizedQuery) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score);

  const ranked = directMatches.length
    ? directMatches
    : entries
        .map((entry) => ({ item: entry.item, score: fuzzySearchScore(entry.text, normalizedQuery) }))
        .filter((entry) => Number.isFinite(entry.score))
        .sort((left, right) => left.score - right.score);
  return ranked.slice(0, limit).map((entry) => entry.item);
}

export function rankDirectSearchItems<T>(
  entries: SearchEntry<T>[],
  query: string,
  limit: number,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  return entries
    .map((entry) => ({ item: entry.item, score: directSearchScore(entry.text, normalizedQuery) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => left.score - right.score)
    .slice(0, limit)
    .map((entry) => entry.item);
}
