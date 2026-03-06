import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderNav from '@/src/components/shared/header-nav';
import { ThemedView } from '@/src/components/themed-view';
import { C, R, S } from '@/src/constants/theme';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useUser } from '@/src/context/user-context';
import { buildHistory, sendChatMessage, subscribeToChatHistory } from '@/src/services/chat.service';
import type { ChatMessageDoc } from '@/src/services/chat.service';
import { ChatStore } from '@/src/stores/chat-store';
import { HOME_STRINGS } from '@/src/constants/strings';

const SUGGESTIONS = [
  HOME_STRINGS.newLove.questionFunnel,
  HOME_STRINGS.returns.questionFunnel1,
  HOME_STRINGS.returns.questionFunnel2,
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <View style={styles.typingRow}>
      <ActivityIndicator size="small" color={C.purpleLight} />
      <Text style={styles.typingText}>Delaluna is thinking…</Text>
    </View>
  );
}

function MessageBubble({ msg }: { msg: ChatMessageDoc }) {
  return (
    <View style={styles.messageGroup}>
      <View style={styles.userBubbleRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userBubbleText}>{msg.userMessage}</Text>
        </View>
      </View>

      <View style={styles.aiBubbleRow}>
        <View style={styles.aiBubble}>
          {msg.isPending ? (
            <TypingDots />
          ) : msg.isError ? (
            <Text style={[styles.aiBubbleText, { color: C.retro }]}>
              Something went wrong. Try again.
            </Text>
          ) : (
            <Text style={styles.aiBubbleText}>{msg.response}</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { authUser } = useUser();
  const { chartDetails } = useHoroscope();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const flatListRef = useRef<FlatList>(null);

  // ─── Subscribe to chat history ─────────────────────────────────────────────

  useEffect(() => {
    if (!authUser) return;
    const unsub = subscribeToChatHistory(authUser.uid, (msgs) => {
      setMessages(msgs);
      setHistoryLoaded(true);
    });
    return unsub;
  }, [authUser?.uid]);

  // ─── Auto-send initial message from ChatStore ──────────────────────────────

  useEffect(() => {
    if (!historyLoaded) return;
    const initial = ChatStore.popInitialMessage();
    if (initial) {
      handleSend(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  // ─── Auto-scroll on new messages ──────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ─── Send ──────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? inputText).trim();
    if (!msg || !authUser || isSending) return;

    setInputText('');
    setIsSending(true);
    try {
      const history = buildHistory(messages.filter(m => !m.isPending));
      await sendChatMessage(authUser.uid, msg, history, chartDetails);
    } catch (e) {
      console.error('chat send error', e);
    } finally {
      setIsSending(false);
    }
  }, [inputText, authUser, isSending, messages, chartDetails]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const showSuggestions = historyLoaded && messages.length === 0 && !isSending;
  const hasPending = messages.some(m => m.isPending);
  const sendDisabled = isSending || hasPending || !inputText.trim();

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav title="Chat" />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.flex, { paddingTop: 88 }]}>
          {showSuggestions ? (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionsLabel}>What's on your mind?</Text>
              {SUGGESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.suggestionChip}
                  onPress={() => handleSend(q)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.suggestionText}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <MessageBubble msg={item} />}
              contentContainerStyle={[
                styles.messageList,
                { paddingBottom: insets.bottom + S.md },
              ]}
              showsVerticalScrollIndicator={false}
            />
          )}

          <View style={[styles.inputBar, { paddingBottom: insets.bottom + S.sm }]}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask Delaluna anything…"
              placeholderTextColor={C.muted}
              multiline
              maxLength={500}
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              blurOnSubmit
            />
            <TouchableOpacity
              style={[styles.sendButton, sendDisabled && styles.sendButtonDisabled]}
              onPress={() => handleSend()}
              disabled={sendDisabled}
              activeOpacity={0.7}
            >
              {isSending ? (
                <ActivityIndicator size="small" color={C.white} />
              ) : (
                <Text style={styles.sendButtonText}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },

  suggestionsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: S.md,
    gap: S.sm,
  },
  suggestionsLabel: {
    color: C.muted,
    fontSize: 14,
    marginBottom: S.sm,
    textAlign: 'center',
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: 'rgba(188,168,244,0.35)',
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: S.md,
    backgroundColor: 'rgba(188,168,244,0.07)',
    width: '100%',
  },
  suggestionText: {
    color: C.purpleLight,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },

  messageList: {
    paddingHorizontal: S.md,
    paddingTop: S.md,
    gap: S.md,
  },
  messageGroup: {
    gap: S.xs,
    marginBottom: S.sm,
  },

  userBubbleRow: { alignItems: 'flex-end' },
  userBubble: {
    backgroundColor: C.purpleDim,
    borderRadius: R.lg,
    borderBottomRightRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    maxWidth: '80%',
  },
  userBubbleText: {
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },

  aiBubbleRow: { alignItems: 'flex-start' },
  aiBubble: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: R.lg,
    borderBottomLeftRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    maxWidth: '80%',
  },
  aiBubbleText: {
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.xs,
  },
  typingText: {
    color: C.muted,
    fontSize: 13,
  },

  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: S.md,
    paddingTop: S.sm,
    gap: S.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: R.xl,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: R.pill,
    backgroundColor: C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: C.purpleDim,
  },
  sendButtonText: {
    color: C.white,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
});
