// In-memory store for passing an initial chat message from home to the chat tab.
// Usage: ChatStore.setInitialMessage(text) before router.push('/(main)/chat')
//        ChatStore.popInitialMessage() inside chat.tsx on mount

let pendingMessage: string | null = null;
let _fromNotification = false;
let pendingConnection: { id: string; name: string } | null = null;

export const ChatStore = {
  setInitialMessage: (msg: string) => { pendingMessage = msg; },
  popInitialMessage: (): string | null => {
    const m = pendingMessage;
    pendingMessage = null;
    return m;
  },
  setFromNotification: (val: boolean) => { _fromNotification = val; },
  popFromNotification: (): boolean => {
    const v = _fromNotification;
    _fromNotification = false;
    return v;
  },
  setPendingConnection: (conn: { id: string; name: string }) => { pendingConnection = conn; },
  popPendingConnection: (): { id: string; name: string } | null => {
    const c = pendingConnection;
    pendingConnection = null;
    return c;
  },
};
