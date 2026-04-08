import React, { useCallback, useEffect, useRef, useState } from 'react';

import {
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderNav from '@/src/components/shared/header-nav';
import PremiumUnlock from '@/src/components/shared/premium-unlock.component';
import { ThemedView } from '@/src/components/themed-view';
import { C, R, S } from '@/src/constants/theme';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useUser } from '@/src/context/user-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useFreeTrialAccess } from '@/src/hooks/use-free-trial-access';
import { useResponsive } from '@/src/hooks/use-responsive';
import { useFocusEffect } from 'expo-router';
import { buildHistory, deleteChatSession, retryChatMessage, saveChatAndClear, sendChatMessage, subscribeToChatHistory, subscribeToChatSessions } from '@/src/services/chat.service';
import type { ChatMessageDoc, SavedChatSession } from '@/src/services/chat.service';
import { ChatStore } from '@/src/stores/chat-store';
import { HOME_STRINGS } from '@/src/constants/strings';

// const FREE_CHAT_LIMIT = 3;
// const PREMIUM_CHAT_LIMIT = 5;

const SUGGESTIONS = [
  HOME_STRINGS.newLove.questionFunnel,
  HOME_STRINGS.returns.questionFunnel1,
  HOME_STRINGS.returns.questionFunnel2,
  'What does my birth chart say about my love life?',
  'What energies are influencing me right now?',
  'What should I focus on this week?',
  'How can I better understand my emotions?',
  'What does my rising sign reveal about me?',
];

const VISIBLE_SUGGESTIONS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Strip markdown bold titles like **Reality Check:** and leftover asterisks */
function stripBoldTitles(text: string): string {
  return text.replace(/\*\*[^*]+:\*\*\s*/g, '').replace(/\*/g, '').replace(/^ +/gm, '').trim();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypingDots() {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, { toValue: -6, duration: 300, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 300, useNativeDriver: true }),
          Animated.delay((dots.length - i - 1) * 150),
        ])
      )
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.typingRow}>
      {dots.map((dot, i) => (
        <Animated.View key={i} style={[styles.typingDot, { transform: [{ translateY: dot }] }]} />
      ))}
    </View>
  );
}

function MessageBubble({ msg, onRetry }: { msg: ChatMessageDoc; onRetry: (msg: ChatMessageDoc) => void }) {
  const isStuck = msg.isPending && (Date.now() - msg.createdAt.getTime()) > 60_000;
  const showRetry = msg.isError || isStuck;

  return (
    <View style={styles.messageGroup}>
      <View style={styles.userBubbleRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userBubbleText}>{msg.userMessage}</Text>
        </View>
      </View>

      <View style={styles.aiBubbleRow}>
        <View style={styles.aiBubble}>
          {msg.isPending && !isStuck ? (
            <TypingDots />
          ) : msg.isError || isStuck ? (
            <Text style={[styles.aiBubbleText, { color: C.retro }]}>
              Something went wrong. Try again.
            </Text>
          ) : (
            <Text style={styles.aiBubbleText}>{stripBoldTitles(msg.response ?? '')}</Text>
          )}
        </View>
        {showRetry && (
          <TouchableOpacity onPress={() => onRetry(msg)} style={styles.retryButton}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { authUser, userDoc } = useUser();
  const { chartDetails } = useHoroscope();
  const { isPro, presentPaywall } = useRevenueCat();
  const { inTrial } = useFreeTrialAccess();
  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(44);

  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedChatSession[]>([]);
  const [viewingSession, setViewingSession] = useState<SavedChatSession | null>(null);

  const isPremium = isPro;
  // --- Limits temporarily disabled ---
  // const questionLimit = (isPremium || inTrial) ? PREMIUM_CHAT_LIMIT : FREE_CHAT_LIMIT;
  // const questionsUsed = messages.length;
  // const questionsRemaining = Math.max(0, questionLimit - questionsUsed);
  // const chatLocked = questionsUsed >= questionLimit;
  const questionLimit = Infinity;
  const questionsUsed = messages.length;
  const questionsRemaining = Infinity;
  const chatLocked = false;

  const handleUpgrade = useCallback(async () => {
    try {
      await presentPaywall();
    } catch (err) {
      console.error('[chat] presentPaywall error:', err);
    }
  }, [presentPaywall]);

  const flatListRef = useRef<FlatList>(null);
  const chatStarted = useRef(false);
  const messagesRef = useRef<ChatMessageDoc[]>([]);
  messagesRef.current = messages;
  const fromNotification = useRef(false);
  const [suggestionOffset, setSuggestionOffset] = useState(0);

  // ─── Subscribe to chat history ─────────────────────────────────────────────

  useEffect(() => {
    if (!authUser) return;
    const unsub = subscribeToChatHistory(authUser.uid, (msgs) => {
      if (msgs.length > 0) chatStarted.current = true;
      setMessages(msgs);
      setHistoryLoaded(true);
    });
    return unsub;
  }, [authUser?.uid]);

  // ─── Subscribe to saved chat sessions ─────────────────────────────────────

  useEffect(() => {
    if (!authUser) return;
    const unsub = subscribeToChatSessions(authUser.uid, setSavedSessions);
    return unsub;
  }, [authUser?.uid]);

  // ─── Check notification flag on mount ──────────────────────────────────────

  useEffect(() => {
    fromNotification.current = ChatStore.popFromNotification();
  }, []);

  // ─── Auto-save on leaving chat screen (navigate away) ─────────────────────

  useFocusEffect(
    useCallback(() => {
      return () => {
        if (!authUser || fromNotification.current) {
          fromNotification.current = false;
          return;
        }
        const msgs = messagesRef.current;
        if (msgs.length > 0) {
          saveChatAndClear(authUser.uid, msgs).catch(console.error);
        }
      };
    }, [authUser]),
  );

  // ─── Auto-save when app goes to background ────────────────────────────────

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && authUser && messagesRef.current.length > 0) {
        saveChatAndClear(authUser.uid, messagesRef.current).catch(console.error);
      }
    });
    return () => sub.remove();
  }, [authUser]);

  // ─── Auto-send initial message from ChatStore ──────────────────────────────

  useEffect(() => {
    if (!historyLoaded) return;
    const initial = ChatStore.popInitialMessage();
    if (initial) {
      handleSend(initial);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyLoaded]);

  // ─── Rotate suggestions ────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      setSuggestionOffset(i => (i + VISIBLE_SUGGESTIONS) % SUGGESTIONS.length);
    }, 7000);
    return () => clearInterval(id);
  }, []);

  // ─── Auto-scroll on new messages ──────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [messages.length]);

  // ─── Send ──────────────────────────────────────────────────────────────────

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? inputText).trim();
    if (!msg || !authUser || isSending || chatLocked) return;

    chatStarted.current = true;
    setInputText('');
    setIsSending(true);
    try {
      const history = buildHistory(messages.filter(m => !m.isPending));
      await sendChatMessage(authUser.uid, msg, history, chartDetails, userDoc?.pronouns);
    } catch (e) {
      console.error('chat send error', e);
    } finally {
      setIsSending(false);
    }
  }, [inputText, authUser, isSending, messages, chartDetails]);

  // ─── Retry ─────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(async (msg: ChatMessageDoc) => {
    if (!authUser) return;
    try {
      await retryChatMessage(authUser.uid, msg.id, msg.prompt, msg.userMessage);
    } catch (e) {
      console.error('chat retry error', e);
    }
  }, [authUser]);

  // ─── New chat ──────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    if (!authUser) return;
    chatStarted.current = false;
    await saveChatAndClear(authUser.uid, messages);
  }, [authUser, messages]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const showSuggestions = historyLoaded && messages.length === 0;
  const hasPending = messages.some(m => m.isPending);
  const sendDisabled = isSending || hasPending || !inputText.trim();

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Chat"
        leftIconName="time-outline"
        onLeftPress={() => setShowHistory(true)}
        rightIconName="add"
        onRightPress={handleNewChat}
      />

      {/* ── History modal ── */}
      <Modal visible={showHistory} animationType="slide" onRequestClose={() => {
        if (viewingSession) { setViewingSession(null); } else { setShowHistory(false); }
      }}>
        <View style={[styles.historyModal, { paddingTop: insets.top }]}>
          {viewingSession ? (
            <>
              <View style={styles.historyHeader}>
                <TouchableOpacity onPress={() => setViewingSession(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="arrow-back" size={24} color={C.white} />
                </TouchableOpacity>
                <Text style={[styles.historyTitle, { flex: 1, marginLeft: S.sm }]} numberOfLines={1}>
                  {viewingSession.title}
                </Text>
                <TouchableOpacity onPress={() => { setViewingSession(null); setShowHistory(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={C.white} />
                </TouchableOpacity>
              </View>
              <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
                {viewingSession.messages.map((m, i) => (
                  <View key={i} style={styles.historyEntry}>
                    <Text style={styles.historyTimestamp}>{formatTime(m.createdAt)}</Text>
                    <View style={[styles.userBubble, { alignSelf: 'flex-end' }]}>
                      <Text style={styles.userBubbleText}>{m.userMessage}</Text>
                    </View>
                    {m.response ? (
                      <View style={[styles.aiBubble, { alignSelf: 'flex-start' }]}>
                        <Text style={styles.aiBubbleText}>{stripBoldTitles(m.response)}</Text>
                      </View>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            </>
          ) : (
            <>
              <View style={styles.historyHeader}>
                <Text style={styles.historyTitle}>Chat History</Text>
                <TouchableOpacity onPress={() => setShowHistory(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Ionicons name="close" size={24} color={C.white} />
                </TouchableOpacity>
              </View>
              {savedSessions.length === 0 ? (
                <View style={styles.historyEmpty}>
                  <Text style={styles.historyEmptyText}>No saved chats yet.</Text>
                </View>
              ) : (
                <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
                  {savedSessions.map(session => (
                    <TouchableOpacity
                      key={session.id}
                      style={styles.sessionRow}
                      onPress={() => setViewingSession(session)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.sessionInfo}>
                        <Text style={styles.sessionTitle} numberOfLines={1}>{session.title}</Text>
                        <Text style={styles.sessionDate}>
                          {session.savedAt.toLocaleDateString()} · {session.messages.length} message{session.messages.length !== 1 ? 's' : ''}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => authUser && deleteChatSession(authUser.uid, session.id)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Ionicons name="trash-outline" size={18} color={C.muted} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </>
          )}
        </View>
      </Modal>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.flex, { paddingTop: headerHeight }]}>
          {showSuggestions ? (
            <View style={styles.suggestionsContainer}>
              <Text style={styles.suggestionsLabel}>What's on your mind?</Text>
              {Array.from({ length: VISIBLE_SUGGESTIONS }, (_, i) =>
                SUGGESTIONS[(suggestionOffset + i) % SUGGESTIONS.length]
              ).map((q) => (
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
              style={styles.flex}
              data={messages}
              keyExtractor={item => item.id}
              renderItem={({ item }) => <MessageBubble msg={item} onRetry={handleRetry} />}
              contentContainerStyle={[
                styles.messageList,
                { paddingBottom: insets.bottom + S.md },
              ]}
              showsVerticalScrollIndicator={false}
            />
          )}

          {chatLocked ? (
            <View style={[styles.paygateContainer, { paddingBottom: insets.bottom}]}>
              {isPremium ? (
                <PremiumUnlock
                  title="Daily limit reached"
                  message="Premium members have reached their daily limit. Come back tomorrow!"
                />
              ) : inTrial ? (
                <PremiumUnlock
                  title="Trial daily limit reached"
                  message="You've used all questions for today. Upgrade to keep this access after your free trial ends."
                  onUnlock={handleUpgrade}
                />
              ) : (
                <PremiumUnlock
                  title="You've used your 3 free questions"
                  message="Upgrade to Premium for more daily questions and unlimited cosmic guidance."
                  onUnlock={handleUpgrade}
                />
              )}
            </View>
          ) : (
            <>
              
              <View style={[styles.inputBar, { paddingBottom: S.sm }]}>
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
                    <Text style={styles.sendButtonText}>→</Text>
                  )}
                </TouchableOpacity>
              </View>
              {questionsUsed > 0 && (
                <View style={styles.counterBar}>
                  <Text style={styles.counterText}>
                    {questionsRemaining} question{questionsRemaining !== 1 ? 's' : ''} remaining today
                  </Text>
                </View>
              )}
            </>
          )}
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
  retryButton: {
    marginTop: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.retro,
    alignSelf: 'flex-start',
  },
  retryText: {
    color: C.retro,
    fontSize: 12,
    fontWeight: '600',
  },

  typingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 3,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: C.purpleLight,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.sm,
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

  paygateContainer: {
    paddingHorizontal: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  counterBar: {
    alignItems: 'center',
    paddingVertical: S.xs,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  counterText: {
    color: C.muted,
    fontSize: 12,
  },

  historyModal: {
    flex: 1,
    backgroundColor: '#0d0d1a',
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: S.md,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  historyTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: '600',
  },
  historyEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyEmptyText: {
    color: C.muted,
    fontSize: 14,
  },
  historyList: {
    paddingHorizontal: S.md,
    paddingVertical: S.md,
    gap: S.md,
  },
  historyEntry: {
    gap: S.xs,
  },
  historyTimestamp: {
    color: C.muted,
    fontSize: 11,
    textAlign: 'center',
    marginBottom: S.xs,
  },
  sessionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: R.md,
    paddingHorizontal: S.md,
    paddingVertical: S.sm + 2,
  },
  sessionInfo: {
    flex: 1,
    marginRight: S.sm,
  },
  sessionTitle: {
    color: C.white,
    fontSize: 14,
    fontWeight: '500',
  },
  sessionDate: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },
});
