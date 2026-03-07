// In-memory store for passing an initial chat message from home to the chat tab.
// Usage: ChatStore.setInitialMessage(text) before router.push('/(main)/chat')
//        ChatStore.popInitialMessage() inside chat.tsx on mount

let pendingMessage: string | null = null;

export const ChatStore = {
  setInitialMessage: (msg: string) => { pendingMessage = msg; },
  popInitialMessage: (): string | null => {
    const m = pendingMessage;
    pendingMessage = null;
    return m;
  },
};
