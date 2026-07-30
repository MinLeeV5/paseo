export type ConversationSearchDirection = "next" | "previous";

export function getAdjacentConversationSearchIndex(input: {
  currentIndex: number;
  matchCount: number;
  direction: ConversationSearchDirection;
}): number {
  if (input.matchCount <= 0) {
    return -1;
  }
  if (input.currentIndex < 0 || input.currentIndex >= input.matchCount) {
    return input.direction === "next" ? 0 : input.matchCount - 1;
  }
  const delta = input.direction === "next" ? 1 : -1;
  return (input.currentIndex + delta + input.matchCount) % input.matchCount;
}
