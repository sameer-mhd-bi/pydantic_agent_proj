export interface ConversationEntry {
  id: string
  firstMessage?: string
  timestamp: number
  userId?: string
  forkOf?: {
    conversationId: string
    messageIndex: number
  }
}
