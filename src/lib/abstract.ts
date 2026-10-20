export function reconstructAbstract(
  invertedIndex: Record<string, number[]> | null | undefined
): string | null {
  if (!invertedIndex || Object.keys(invertedIndex).length === 0) {
    return null;
  }
  const wordPositions: { word: string; position: number }[] = [];
  for (const [word, positions] of Object.entries(invertedIndex)) {
    for (const pos of positions) {
      wordPositions.push({ word, position: pos });
    }
  }
  wordPositions.sort((a, b) => a.position - b.position);
  return wordPositions.map((wp) => wp.word).join(" ");
}

export function truncateAbstract(abstract: string, maxLength: number = 250): string {
  if (abstract.length <= maxLength) return abstract;
  return abstract.substring(0, maxLength).trim() + "...";
}
