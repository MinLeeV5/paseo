import type { ReactNode } from "react";

export interface ConversationSearchProps {
  agentId: string;
  isPaneFocused: boolean;
  children: ReactNode;
}

export function ConversationSearch({ children }: ConversationSearchProps) {
  return children;
}
