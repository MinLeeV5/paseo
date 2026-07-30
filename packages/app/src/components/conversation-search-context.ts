import { createContext, useContext } from "react";

export const ConversationSearchActiveContext = createContext(false);

export function useConversationSearchActive(): boolean {
  return useContext(ConversationSearchActiveContext);
}
