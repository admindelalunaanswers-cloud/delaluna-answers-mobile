import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import {
    ActivityIndicator,
    Animated,
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import ConnectionPickerSheet, { type PickerConnection } from '@/src/components/connection-picker-sheet';
import ConsumablePlaceholder from '@/src/components/shared/consumable-placeholder.component';
import HeaderNav from '@/src/components/shared/header-nav';
import PaygateOverlay from '@/src/components/shared/paygate-overlay.component';
import { ThemedView } from '@/src/components/themed-view';
import { HOME_STRINGS } from '@/src/constants/strings';
import { C, R, S } from '@/src/constants/theme';
import { useAdmin } from '@/src/context/admin-context';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { useUser } from '@/src/context/user-context';
import { useResponsive } from '@/src/hooks/use-responsive';
import { useScreenPerfLog } from '@/src/hooks/use-screen-perf-log';
import { getContentPadding, MAX_CONTENT_WIDTH } from '@/src/utils/layout';
import type { ChatConnectionContext, ChatMessageDoc, SavedChatSession } from '@/src/services/chat.service';
import { deleteChatSession, resumeChatSession, retryChatMessage, saveChatAndClear, sendChatMessage, subscribeToChatHistory, subscribeToChatSessions } from '@/src/services/chat.service';
import { Events } from '@/src/services/analytics.service';
import { recordError } from '@/src/services/crashlytics.service';
import { buildConnectionContextSummary } from '@/src/services/connection-context.service';
import { buildNatalChartSummary } from '@/src/services/natal-chart-breakdown.service';
import { ChatStore } from '@/src/stores/chat-store';
import { renderRichText } from '@/src/utils/rich-text';

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

const CONNECTION_SUGGESTIONS = [
  'Should I reach out today?',
  'Why do we keep having the same fight?',
  "What's the long-term outlook for us?",
  'How do I bring up what\'s bothering me?',
  'Are we actually compatible?',
  'What is each of us bringing to this dynamic?',
  'How do I get through to them when they shut down?',
  'Should I give this another shot?',
];

const VISIBLE_SUGGESTIONS = 5;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
      {msg.connectionName ? (
        <Text style={styles.aboutTag}>about {msg.connectionName}</Text>
      ) : null}
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
            <Text style={styles.aiBubbleText}>{renderRichText(msg.response ?? '')}</Text>
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
  const { authUser } = useUser();
  const { chartDetails } = useHoroscope();
  const { dailyChatLimit, premiumDailyChatLimit } = useAdmin();
  const { isPro, loading: rcLoading, presentChatPackPaywall, refresh: refreshRevenueCat } = useRevenueCat();
  const { markReady, logOp, logError: logPerfError } = useScreenPerfLog('/(main)/chat');
  const hasPremiumAccess = rcLoading || isPro;
  const insets = useSafeAreaInsets();
  const { scale, width: screenWidth } = useResponsive();
  const headerHeight = insets.top + scale(44);

  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  const [inputText, setInputText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedChatSession[]>([]);
  const [viewingSession, setViewingSession] = useState<SavedChatSession | null>(null);
  const [selectedConnection, setSelectedConnection] = useState<ChatConnectionContext | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const [extraQuestionsPurchased, setExtraQuestionsPurchased] = useState(0);
  const [showQuestionConsumable, setShowQuestionConsumable] = useState(false);

  const baseDailyChatLimit = hasPremiumAccess ? premiumDailyChatLimit : dailyChatLimit;
  const questionLimit = baseDailyChatLimit + extraQuestionsPurchased;

  // Count ALL questions sent today (active chat + saved sessions)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeToday = messages.filter(m => m.createdAt >= todayStart).length;
  const savedToday = savedSessions.reduce((count, session) =>
    count + session.messages.filter(m => m.createdAt >= todayStart).length, 0);
  const questionsUsed = activeToday + savedToday;
  const questionsRemaining = Math.max(0, questionLimit - questionsUsed);
  const chatLocked = questionsUsed >= questionLimit;

  // When the limit is hit: show the RC paywall first.
  const handleLimitReached = useCallback(async (prefillText?: string) => {
    if (prefillText) setInputText(prefillText);
    const result = await presentChatPackPaywall();
    if (result === 'unavailable') {
      setShowQuestionConsumable(true);
    } else if (typeof result === 'object' && result.purchased) {
      setExtraQuestionsPurchased((n) => n + result.quantity);
    }
    // 'dismissed' → user closed the RC paywall, do nothing
  }, [presentChatPackPaywall]);

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

  // ─── Pending connection from connection detail screen ─────────────────────

  useEffect(() => {
    const pending = ChatStore.popPendingConnection();
    if (!pending || !authUser) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await buildConnectionContextSummary(authUser.uid, pending.id);
        if (!cancelled && ctx) setSelectedConnection(ctx);
      } catch (e) {
        console.error('connection context load error', e);
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.uid]);

  // ─── Rehydrate chip from latest message's connection metadata ─────────────

  const lastConnectionId = messages.length > 0
    ? messages[messages.length - 1].connectionId
    : undefined;

  useEffect(() => {
    if (!authUser || !lastConnectionId) return;
    if (selectedConnection?.id === lastConnectionId) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await buildConnectionContextSummary(authUser.uid, lastConnectionId);
        if (!cancelled && ctx) setSelectedConnection(ctx);
      } catch {
        // connection may have been deleted — leave chip cleared
      }
    })();
    return () => { cancelled = true; };
  }, [authUser?.uid, lastConnectionId]);


  // ─── Auto-send initial message from ChatStore ──────────────────────────────

  useEffect(() => {
    if (!historyLoaded) return;
    const initial = ChatStore.popInitialMessage();
    if (initial) {
      if (chatLocked) {
        handleLimitReached(initial);
      } else {
        handleSend(initial);
      }
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

  // Mark screen ready once the initial data is available
  useEffect(() => {
    if (!rcLoading) markReady();
  }, [rcLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Send ──────────────────────────────────────────────────────────────────

  const chartSummary = chartDetails ? buildNatalChartSummary(chartDetails) : undefined;

  const handleSend = useCallback(async (text?: string) => {
    const msg = (text ?? inputText).trim();
    if (!msg || !authUser || isSending) return;

    if (chatLocked) {
      handleLimitReached(msg);
      return;
    }

    chatStarted.current = true;
    setInputText('');
    setIsSending(true);
    const t = Date.now();
    try {
      await sendChatMessage(authUser.uid, msg, chartSummary, selectedConnection ?? undefined);
      logOp('chat_send', Date.now() - t);
      Events.chatMessageSent({ length: msg.length });
    } catch (e) {
      logPerfError(e instanceof Error ? e.message : String(e));
      console.error('chat send error', e);
      recordError(e, 'chat_send');
    } finally {
      setIsSending(false);
    }
  }, [inputText, authUser, isSending, chatLocked, chartSummary, selectedConnection, handleLimitReached]);

  // ─── Retry ─────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(async (msg: ChatMessageDoc) => {
    if (!authUser) return;
    try {
      // Prefer the chip's current connection; fall back to whatever was on the message.
      let retryCtx: ChatConnectionContext | undefined =
        selectedConnection?.id === msg.connectionId ? selectedConnection ?? undefined : undefined;
      if (!retryCtx && msg.connectionId) {
        const fresh = await buildConnectionContextSummary(authUser.uid, msg.connectionId);
        if (fresh) retryCtx = fresh;
      }
      await retryChatMessage(authUser.uid, msg.id, msg.userMessage, chartSummary, retryCtx);
      Events.chatRetry();
    } catch (e) {
      console.error('chat retry error', e);
      recordError(e, 'chat_retry');
    }
  }, [authUser, chartSummary, selectedConnection]);

  // ─── Connection picker handlers ───────────────────────────────────────────

  const handleSelectConnection = useCallback(async (picked: PickerConnection) => {
    if (!authUser) return;
    setPickerOpen(false);
    try {
      const ctx = await buildConnectionContextSummary(authUser.uid, picked.id);
      if (ctx) setSelectedConnection(ctx);
    } catch (e) {
      console.error('connection context load error', e);
    }
  }, [authUser]);

  const handleClearConnection = useCallback(() => {
    setSelectedConnection(null);
  }, []);

  // ─── New chat ──────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    if (!authUser) return;
    chatStarted.current = false;
    await saveChatAndClear(authUser.uid, messages);
  }, [authUser, messages]);

  // ─── Resume saved chat ─────────────────────────────────────────────────────

  const handleResumeSession = useCallback(async (session: SavedChatSession) => {
    if (!authUser) return;
    try {
      await resumeChatSession(authUser.uid, session, messagesRef.current);
      chatStarted.current = true;
      setViewingSession(null);
      setShowHistory(false);
    } catch (e) {
      console.error('chat resume error', e);
    }
  }, [authUser]);

  // ─── Derived ───────────────────────────────────────────────────────────────

  const showSuggestions = historyLoaded && messages.length === 0;
  const sendDisabled = isSending || !inputText.trim();

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

      <PaygateOverlay
        locked={false}
        style={{ flex: 1 }}
        unlockTitle="Unlock Chat"
        unlockMessage="Subscribe to get personalized cosmic guidance through Delaluna chat."
        onUnlock={() => handleLimitReached()}
      >

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
                <TouchableOpacity
                  onPress={() => handleResumeSession(viewingSession)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  style={styles.resumeButton}
                  activeOpacity={0.7}
                >
                  <Ionicons name="play" size={16} color={C.white} />
                  <Text style={styles.resumeButtonText}>Resume</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => { setViewingSession(null); setShowHistory(false); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={{ marginLeft: S.sm }}>
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
                        <Text style={styles.aiBubbleText}>{renderRichText(m.response)}</Text>
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
              <Text style={styles.suggestionsLabel}>
                {selectedConnection
                  ? `What do you want to know about ${selectedConnection.name}?`
                  : "What's on your mind?"}
              </Text>
              {(() => {
                const pool = selectedConnection ? CONNECTION_SUGGESTIONS : SUGGESTIONS;
                return Array.from({ length: VISIBLE_SUGGESTIONS }, (_, i) =>
                  pool[(suggestionOffset + i) % pool.length]
                );
              })().map((q) => (
                <TouchableOpacity
                  key={q}
                  style={styles.suggestionChip}
                  onPress={() => {
                    if (chatLocked) {
                      handleLimitReached(q);
                    } else {
                      handleSend(q);
                    }
                  }}
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
                {
                  paddingBottom: insets.bottom + S.md,
                  paddingHorizontal: getContentPadding(screenWidth),
                  maxWidth: MAX_CONTENT_WIDTH,
                  alignSelf: 'center',
                  width: '100%',
                },
              ]}
              showsVerticalScrollIndicator={false}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />
          )}

          <View style={styles.contextRow}>
            {selectedConnection ? (
              <TouchableOpacity
                style={styles.contextChipActive}
                onPress={handleClearConnection}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="person-circle-outline" size={14} color={C.purpleLight} />
                <Text style={styles.contextChipText}>Talking about {selectedConnection.name}</Text>
                <Ionicons name="close" size={14} color={C.purpleLight} />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.contextChipAdd}
                onPress={() => setPickerOpen(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="add" size={14} color={C.muted} />
                <Text style={styles.contextChipAddText}>About a connection</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.inputBar, { paddingBottom: S.sm }]}>
            <TextInput
              style={styles.textInput}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Ask Delaluna anything..."
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
                <Ionicons name="send" size={18} color={C.white} />
              )}
            </TouchableOpacity>
          </View>
          <View style={[styles.counterBar]}>
            <Text style={styles.counterText}>
              {baseDailyChatLimit === 0
                ? questionLimit === 0
                  ? 'Buy additional questions to continue chatting'
                  : `${questionsRemaining} of ${questionLimit} purchased question${questionLimit === 1 ? '' : 's'} remaining`
                : `${questionsRemaining} of ${questionLimit} questions remaining today`}
            </Text>
          </View>
        </View>
      </KeyboardAvoidingView>
      </PaygateOverlay>

      <ConsumablePlaceholder
        visible={showQuestionConsumable}
        onClose={() => setShowQuestionConsumable(false)}
        onPurchased={(quantity) => {
          setExtraQuestionsPurchased((n) => n + quantity);
        }}
        onRefresh={refreshRevenueCat}
      />

      <ConnectionPickerSheet
        visible={pickerOpen}
        uid={authUser?.uid}
        onClose={() => setPickerOpen(false)}
        onSelect={handleSelectConnection}
      />
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
    overflow: 'visible',
  },
  aiBubbleText: {
    color: C.white,
    fontSize: 14,
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
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: S.sm + 2,
    paddingTop: S.sm,
    paddingBottom: 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  contextChipActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: S.sm + 2,
    borderRadius: R.pill,
    backgroundColor: 'rgba(184,163,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(184,163,255,0.45)',
  },
  contextChipText: {
    color: C.purpleLight,
    fontSize: 12,
    fontWeight: '600',
  },
  contextChipAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: S.sm + 2,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  contextChipAddText: {
    color: C.muted,
    fontSize: 12,
  },
  aboutTag: {
    alignSelf: 'flex-end',
    color: C.purpleLight,
    fontSize: 11,
    fontStyle: 'italic',
    marginBottom: 2,
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

  paygateContainer: {
    paddingHorizontal: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  paygateContainerCentered: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: S.md,
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
  resumeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: S.sm,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  resumeButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
