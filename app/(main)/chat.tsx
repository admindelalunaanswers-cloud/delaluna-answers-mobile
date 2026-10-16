import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { Ionicons } from "@expo/vector-icons";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import ChatTarotDraw from "@/src/components/chat/tarot-draw.component";
import ConnectionPickerSheet, {
  type PickerConnection,
} from "@/src/components/connection-picker-sheet";
import ConsumablePlaceholder from "@/src/components/shared/consumable-placeholder.component";
import HeaderNav from "@/src/components/shared/header-nav";
import PaygateOverlay from "@/src/components/shared/paygate-overlay.component";
import { ThemedView } from "@/src/components/themed-view";
import { HOME_STRINGS } from "@/src/constants/strings";
import { C, R, S } from "@/src/constants/theme";
import { useAdmin } from "@/src/context/admin-context";
import { useHoroscope } from "@/src/context/horoscope-context";
import { useRevenueCat } from "@/src/context/revenuecat-context";
import { useUser } from "@/src/context/user-context";
import { useResponsive } from "@/src/hooks/use-responsive";
import { useScreenPerfLog } from "@/src/hooks/use-screen-perf-log";
import { Events } from "@/src/services/analytics.service";
import {
  MAX_READER_SWITCHES,
  readerSwitchesUsed,
} from "@/src/prompts/chat-continuity";
import type {
  ChatConnectionContext,
  ChatMessageDoc,
  ChatMode,
  ChatUsage,
  SavedChatSession,
} from "@/src/services/chat.service";
import {
  ChatQuotaExceededError,
  ChatRetryNotReadyError,
  chatUsageDayId,
  deleteChatSession,
  drawForTurn,
  lastChatMode,
  resumeChatSession,
  retryChatMessage,
  saveChatAndClear,
  sendChatMessage,
  subscribeToChatHistory,
  msUntilNextChatUsageDay,
  subscribeToChatSessions,
  subscribeToChatUsage,
} from "@/src/services/chat.service";
import { buildConnectionContextSummary } from "@/src/services/connection-context.service";
import { recordError } from "@/src/services/crashlytics.service";
import { buildNatalChartSummary } from "@/src/services/natal-chart-breakdown.service";
import {
  getRevealedChatDraws,
  markChatDrawRevealed,
} from "@/src/services/tarotCache.service";
import { purchasedChatCredits } from "@/src/services/revenuecat.service";
import { ChatStore } from "@/src/stores/chat-store";
import type { DrawnTarotCard } from "@/src/types/tarot-cards.type";
import { resolveChatAllowance } from "@/src/utils/chat-allowance";
import {
  blockedMessage,
  isFeatureBlocked,
  type BlockableFeature,
} from "@/src/constants/moderation";
import { checkForHarm, HARM_ALERTS } from "@/src/utils/harm-filter";
import { getContentPadding, MAX_CONTENT_WIDTH } from "@/src/utils/layout";
import { logger } from "@/src/utils/logger";
import { renderRichText } from "@/src/utils/rich-text";

const SUGGESTIONS = [
  HOME_STRINGS.newLove.questionFunnel,
  HOME_STRINGS.returns.questionFunnel1,
  HOME_STRINGS.returns.questionFunnel2,
  "What does my birth chart say about my love life?",
  "What energies are influencing me right now?",
  "What should I focus on this week?",
  "How can I better understand my emotions?",
  "What does my rising sign reveal about me?",
];

const CONNECTION_SUGGESTIONS = [
  "Should I reach out today?",
  "Why do we keep having the same fight?",
  "What's the long-term outlook for us?",
  "How do I bring up what's bothering me?",
  "Are we actually compatible?",
  "What is each of us bringing to this dynamic?",
  "How do I get through to them when they shut down?",
  "Should I give this another shot?",
];

const VISIBLE_SUGGESTIONS = 5;

const CHAT_MODES = ["astrology", "tarot"] as const;

// The sliding thumb is absolutely positioned, which Yoga measures from the
// track's padding box — so its travel has to exclude both the track padding and
// its border, neither of which onLayout's width leaves out.
const MODE_TRACK_PADDING = 5;
const MODE_TRACK_BORDER = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function TypingDots() {
  const dots = [
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
    useRef(new Animated.Value(0)).current,
  ];

  useEffect(() => {
    const anims = dots.map((dot, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 150),
          Animated.timing(dot, {
            toValue: -6,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay((dots.length - i - 1) * 150),
        ]),
      ),
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.typingRow}>
      {dots.map((dot, i) => (
        <Animated.View
          key={i}
          style={[styles.typingDot, { transform: [{ translateY: dot }] }]}
        />
      ))}
    </View>
  );
}

/**
 * How long a message must sit unanswered before Retry is offered.
 *
 * This has to clear GENERATION_STUCK_MS in functions/src/index.ts, which is
 * what the server uses to decide a generation is genuinely dead. It used to be
 * 60s — well inside that window — so a retry there started a *second*
 * generation alongside the first: two paid Gemini calls, a second question
 * billed, and the same question rendered twice with a reply under each. The
 * extra 5s absorbs drift between the device clock and the server timestamp
 * this is measured against.
 */
const RETRY_ELIGIBLE_MS = 3 * 60 * 1000 + 5_000;

/** When to admit the answer is running late, while still waiting on it. */
const SLOW_REPLY_MS = 45_000;

function MessageBubble({
  msg,
  onRetry,
  isRetrying = false,
  accessory,
  holdForDraw = false,
}: {
  msg: ChatMessageDoc;
  onRetry: (msg: ChatMessageDoc) => void;
  /** A retry for this message is already in flight. */
  isRetrying?: boolean;
  /** Rendered between the question and the reply — the tarot draw sits here. */
  accessory?: React.ReactNode;
  /**
   * Hold the answer behind the draw. The question still shows — it is what the
   * cards are being pulled on — but the reply, typing indicator and all, waits
   * until they land: the read *is* the card, and typing out an answer over the
   * top of the shuffle both spoils it and reads as two things at once.
   */
  holdForDraw?: boolean;
}) {
  // Nothing re-renders this bubble while a generation is in flight — the
  // snapshot that would is the very thing that hasn't arrived — so age the
  // message on a timer rather than reading the clock once and never again.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!msg.isPending) return;
    const id = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(id);
  }, [msg.isPending]);

  const age = now - msg.createdAt.getTime();
  const isStuck = msg.isPending && age > RETRY_ELIGIBLE_MS;
  const isSlow = msg.isPending && !isStuck && age > SLOW_REPLY_MS;
  const showRetry = msg.isError || isStuck;
  const waiting = msg.isPending && !isStuck;
  // A failure ends the hold whatever the cards are doing — otherwise the error
  // and its Retry button would sit behind a draw the user may never complete.
  const holdAnswer = holdForDraw && !showRetry;

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

      {accessory ? <View style={styles.accessoryRow}>{accessory}</View> : null}

      {!holdAnswer && (
        <View style={styles.aiBubbleRow}>
          <View style={styles.aiBubble}>
            {waiting ? (
              <>
                <TypingDots />
                {isSlow && (
                  <Text style={styles.slowHint}>
                    Still thinking — this one&apos;s taking a while.
                  </Text>
                )}
              </>
            ) : msg.isError || isStuck ? (
              <Text style={[styles.aiBubbleText, { color: C.retro }]}>
                Something went wrong. Try again — this one&apos;s on us.
              </Text>
            ) : (
              <Text style={styles.aiBubbleText}>
                {renderRichText(msg.response ?? "")}
              </Text>
            )}
          </View>
          {showRetry && (
            <TouchableOpacity
              onPress={() => onRetry(msg)}
              disabled={isRetrying}
              style={[styles.retryButton, isRetrying && styles.retryButtonBusy]}
            >
              <Text style={styles.retryText}>
                {isRetrying ? "Retrying…" : "Retry"}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function ChatScreen() {
  const { authUser, userDoc, moderation } = useUser();
  const { chartDetails } = useHoroscope();
  const { dailyChatLimit, premiumDailyChatLimit } = useAdmin();
  const {
    isAdmin,
    hasFullAccess,
    customerInfo,
    isDevMode,
    loading: rcLoading,
    presentChatPackPaywall,
    refresh: refreshRevenueCat,
  } = useRevenueCat();
  const {
    markReady,
    logOp,
    logError: logPerfError,
  } = useScreenPerfLog("/(main)/chat");
  const hasPremiumAccess = rcLoading || hasFullAccess;
  const insets = useSafeAreaInsets();
  const { scale, width: screenWidth } = useResponsive();
  const headerHeight = insets.top + scale(44);

  const [messages, setMessages] = useState<ChatMessageDoc[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [savedSessions, setSavedSessions] = useState<SavedChatSession[]>([]);
  const [viewingSession, setViewingSession] = useState<SavedChatSession | null>(
    null,
  );
  const [selectedConnection, setSelectedConnection] =
    useState<ChatConnectionContext | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mode, setMode] = useState<ChatMode>("astrology");
  /** A quick question handed over from home, waiting on a mode choice. */
  const [pendingInitial, setPendingInitial] = useState<string | null>(null);
  /** Ids of chat draws already turned over. Empty until storage answers. */
  const [revealedDraws, setRevealedDraws] = useState<string[]>([]);
  /**
   * Messages with a retry already in flight. A second tap would race the first
   * — the winner deletes the failed document, so the loser finds nothing to
   * retry and the user gets an error for a retry that actually worked.
   */
  const [retryingIds, setRetryingIds] = useState<string[]>([]);
  const [modeTrackWidth, setModeTrackWidth] = useState(0);
  const modeAnim = useRef(new Animated.Value(0)).current;

  // Questions granted by the fallback sheet when RevenueCat can't sell — no
  // real transaction stands behind them, so the server won't honour them
  // either. Kept only so the placeholder still demoes in a build without RC.
  const [mockExtraQuestions, setMockExtraQuestions] = useState(0);
  const [showQuestionConsumable, setShowQuestionConsumable] = useState(false);
  const [usage, setUsage] = useState<ChatUsage | null>(null);

  const tzOffset = userDoc?.timezoneOffsetMinutes;
  const [usageDayId, setUsageDayId] = useState(() => chatUsageDayId(tzOffset));

  // Follow the user's local day across a rollover. The timer covers the app
  // being left open; JS timers don't run while backgrounded, so foregrounding
  // re-checks as well. Both no-op unless the day id actually changed.
  useEffect(() => {
    const sync = () => setUsageDayId(chatUsageDayId(tzOffset));
    sync();
    const timer = setTimeout(sync, msUntilNextChatUsageDay(tzOffset));
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [tzOffset, usageDayId]);

  // The server's ledger is the only honest source for this counter. It used to
  // be derived from the chat documents plus a purchase count held in component
  // state, which drifted two ways: the purchased questions vanished on the next
  // mount (state resets to 0, so a bought pack disappeared from the counter and
  // the chat re-locked), and deleting chat history reset the day's usage on the
  // client while the server still counted it.
  useEffect(() => {
    if (!authUser) return;
    return subscribeToChatUsage(authUser.uid, usageDayId, setUsage);
  }, [authUser?.uid, usageDayId]);

  const baseDailyChatLimit = hasPremiumAccess
    ? premiumDailyChatLimit
    : dailyChatLimit;

  // Until the ledger arrives, approximate from the messages on screen (active
  // chat + saved sessions, both billed) rather than showing a full allowance.
  // A failed turn is refunded server-side, so counting it here would lock the
  // chat — and open the paywall — over a question the user still has.
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const activeToday = messages.filter(
    (m) => m.createdAt >= todayStart && !m.isError,
  ).length;
  const savedToday = savedSessions.reduce(
    (count, session) =>
      count + session.messages.filter((m) => m.createdAt >= todayStart).length,
    0,
  );

  // Display only. The claim is the real authority on admin — `users/{uid}.isAdmin`
  // is a mirror of it — but nothing is gated on this: the server decides what it
  // bills, and this only keeps the counter from counting down against a limit it
  // is not applying. Same source as `hasPremiumAccess` above, so the counter and
  // the paywall can no longer disagree — an admin used to be shown "unlimited"
  // and then hit the premium gate anyway.
  const unmetered = isAdmin;

  // Moderation block for this thread's current reader. The server refuses a
  // blocked send regardless; this exists so the refusal reads as a decision
  // rather than as the app being broken. `isFeatureBlocked` widens a chat
  // block to cover tarot, matching sendChatMessage.
  const blockedFeature: BlockableFeature | null = isFeatureBlocked(
    moderation,
    'chat',
  )
    ? 'chat'
    : isFeatureBlocked(moderation, 'tarot') && mode === 'tarot'
      ? 'tarot'
      : null;

  const { questionLimit, questionsRemaining, chatLocked } =
    resolveChatAllowance({
      dailyLimit: baseDailyChatLimit,
      usage,
      purchasedCredits: customerInfo ? purchasedChatCredits(customerInfo) : 0,
      fallbackUsedToday: activeToday + savedToday,
      mockExtraQuestions,
      unmetered,
    });

  // When the limit is hit: show the RC paywall first.
  const handleLimitReached = useCallback(
    async (prefillText?: string) => {
      if (prefillText) setInputText(prefillText);
      const result = await presentChatPackPaywall();
      if (result === "unavailable") {
        setShowQuestionConsumable(true);
      }
      // A completed purchase needs no local bookkeeping — presentChatPackPaywall
      // refreshes CustomerInfo, which is what `creditsLeft` counts.
      // 'dismissed' → user closed the RC paywall, do nothing
    },
    [presentChatPackPaywall],
  );

  const flatListRef = useRef<FlatList>(null);
  const chatStarted = useRef(false);
  /**
   * Whether the toggle has already been pointed at the open thread.
   *
   * The thread's reader is only adopted once, when the conversation is first
   * loaded (or resumed). Re-adopting it on every snapshot would quietly undo a
   * toggle tap the moment an in-flight answer landed — the user taps Tarot,
   * the astrology reply they were still waiting on arrives, and the toggle
   * flips back under them before they have typed anything.
   */
  const modeAdopted = useRef(false);
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
      // An app restart drops back into whatever conversation was open, so the
      // toggle has to land on the reader that thread was last in — otherwise
      // the user sees Astrology selected over a tarot reply. Only once, though;
      // see `modeAdopted`.
      if (!modeAdopted.current && msgs.length > 0) {
        const threadMode = lastChatMode(msgs);
        if (threadMode) setMode(threadMode);
        modeAdopted.current = true;
      }
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
        const ctx = await buildConnectionContextSummary(
          authUser.uid,
          pending.id,
        );
        if (!cancelled && ctx) setSelectedConnection(ctx);
      } catch (e) {
        logger.error(
          "[chat] connection context load failed",
          e,
          "chat_connection_context",
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid]);

  // ─── Rehydrate chip from latest message's connection metadata ─────────────

  const lastConnectionId =
    messages.length > 0
      ? messages[messages.length - 1].connectionId
      : undefined;

  useEffect(() => {
    if (!authUser || !lastConnectionId) return;
    if (selectedConnection?.id === lastConnectionId) return;
    let cancelled = false;
    (async () => {
      try {
        const ctx = await buildConnectionContextSummary(
          authUser.uid,
          lastConnectionId,
        );
        if (!cancelled && ctx) setSelectedConnection(ctx);
      } catch {
        // connection may have been deleted — leave chip cleared
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authUser?.uid, lastConnectionId]);

  // ─── Auto-send initial message from ChatStore ──────────────────────────────

  // On focus, not on mount. Chat is a tab, so it stays mounted after the first
  // visit — an effect keyed on `historyLoaded` runs once and never again, and
  // every later hand-off from home left its question sitting unread in the
  // store. useFocusEffect also re-runs when the callback changes while the
  // screen is focused, which covers the first navigation, where focus lands
  // before the history has loaded.
  useFocusEffect(
    useCallback(() => {
      if (!historyLoaded) return;
      const initial = ChatStore.popInitialMessage();
      if (!initial) return;
      if (chatLocked) {
        handleLimitReached(initial);
        return;
      }
      // A quick question tapped on home carries no reader with it, so ask which
      // one answers it rather than spending the question on whichever the
      // toggle happened to be left on. Whatever conversation is already open
      // carries on underneath the answer either way.
      setPendingInitial(initial);
    }, [historyLoaded, chatLocked, handleLimitReached]),
  );

  // ─── Revealed tarot draws ─────────────────────────────────────────────────

  // Like the daily spread, a chat draw that has been turned over stays turned
  // over. Firestore rules deny client updates on `updayedChat`, so the fact
  // lives in local storage rather than on the message.
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    getRevealedChatDraws(authUser.uid)
      .then((ids) => {
        if (!cancelled) setRevealedDraws(ids);
      })
      .catch(logger.catchAsync("chat_draw_reveal_load"));
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // ─── Rotate suggestions ────────────────────────────────────────────────────

  useEffect(() => {
    const id = setInterval(() => {
      setSuggestionOffset(
        (i) => (i + VISIBLE_SUGGESTIONS) % SUGGESTIONS.length,
      );
    }, 7000);
    return () => clearInterval(id);
  }, []);

  // ─── Auto-scroll on new messages ──────────────────────────────────────────

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(
        () => flatListRef.current?.scrollToEnd({ animated: true }),
        100,
      );
    }
  }, [messages.length]);

  // Mark screen ready once the initial data is available
  useEffect(() => {
    if (!rcLoading) markReady();
  }, [rcLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Send ──────────────────────────────────────────────────────────────────

  const chartSummary = chartDetails
    ? buildNatalChartSummary(chartDetails)
    : undefined;

  const handleSend = useCallback(
    async (
      text?: string,
      modeOverride?: ChatMode,
      /**
       * The conversation to build the prompt against, when it is not the one in
       * state. Parking clears the thread server-side, but `messages` still
       * holds it until the snapshot lands — sending in that gap would anchor
       * the prompt to turns that no longer exist.
       */
      historyOverride?: ChatMessageDoc[],
    ) => {
      const msg = (text ?? inputText).trim();
      if (!msg || !authUser || isSending) return;

      const harmType = checkForHarm(msg);
      if (harmType) {
        const { title, message: alertMsg } = HARM_ALERTS[harmType];
        Alert.alert(title, alertMsg, [{ text: "OK" }]);
        setInputText("");
        return;
      }

      if (blockedFeature) {
        Alert.alert('Unavailable', blockedMessage(blockedFeature), [
          { text: 'OK' },
        ]);
        return;
      }

      if (chatLocked) {
        handleLimitReached(msg);
        return;
      }

      chatStarted.current = true;
      setInputText("");
      setIsSending(true);
      const t = Date.now();
      try {
        // `history` is the conversation so far — the prompt builder needs it to
        // know what the model has already been told and which restored turns it
        // cannot see. Without it every send reads as a brand new conversation.
        await sendChatMessage({
          uid: authUser.uid,
          userMessage: msg,
          mode: modeOverride ?? mode,
          natalChartSummary: chartSummary,
          connection: selectedConnection ?? undefined,
          pronouns: userDoc?.pronouns,
          history: historyOverride ?? messages,
        });
        logOp("chat_send", Date.now() - t);
        Events.chatMessageSent({ length: msg.length });
      } catch (e) {
        // The server is the authority on the question allowance — the counter
        // above is only a display. If it says we're out, fall back to the paywall.
        if (e instanceof ChatQuotaExceededError) {
          handleLimitReached(msg);
          return;
        }
        logPerfError(e instanceof Error ? e.message : String(e));
        logger.error("[chat] send failed", e, "chat_send");
        recordError(e, "chat_send");
      } finally {
        setIsSending(false);
      }
    },
    [
      inputText,
      authUser,
      isSending,
      chatLocked,
      chartSummary,
      selectedConnection,
      messages,
      mode,
      userDoc?.pronouns,
      handleLimitReached,
    ],
  );

  // ─── Retry ─────────────────────────────────────────────────────────────────

  const handleRetry = useCallback(
    async (msg: ChatMessageDoc) => {
      if (!authUser) return;
      if (retryingIds.includes(msg.id)) return;
      setRetryingIds((ids) => [...ids, msg.id]);
      try {
        // Prefer the chip's current connection; fall back to whatever was on the message.
        let retryCtx: ChatConnectionContext | undefined =
          selectedConnection?.id === msg.connectionId
            ? (selectedConnection ?? undefined)
            : undefined;
        if (!retryCtx && msg.connectionId) {
          const fresh = await buildConnectionContextSummary(
            authUser.uid,
            msg.connectionId,
          );
          if (fresh) retryCtx = fresh;
        }
        await retryChatMessage({
          uid: authUser.uid,
          retryOf: msg.id,
          userMessage: msg.userMessage,
          mode: msg.mode ?? mode,
          natalChartSummary: chartSummary,
          connection: retryCtx,
          pronouns: userDoc?.pronouns,
          history: messages,
        });
        Events.chatRetry();
      } catch (e) {
        // The server refuses a retry it hasn't given up on yet, so the answer
        // is still coming — say so rather than logging a failure the user
        // can't act on.
        if (e instanceof ChatRetryNotReadyError) {
          Alert.alert("Hang tight", e.message, [{ text: "OK" }]);
          return;
        }
        logger.error("[chat] retry failed", e, "chat_retry");
        recordError(e, "chat_retry");
      } finally {
        setRetryingIds((ids) => ids.filter((id) => id !== msg.id));
      }
    },
    [
      authUser,
      chartSummary,
      selectedConnection,
      messages,
      mode,
      retryingIds,
      userDoc?.pronouns,
    ],
  );

  // ─── Connection picker handlers ───────────────────────────────────────────

  const handleSelectConnection = useCallback(
    async (picked: PickerConnection) => {
      if (!authUser) return;
      setPickerOpen(false);
      try {
        const ctx = await buildConnectionContextSummary(
          authUser.uid,
          picked.id,
        );
        if (ctx) setSelectedConnection(ctx);
      } catch (e) {
        logger.error(
          "[chat] connection context load failed",
          e,
          "chat_connection_context",
        );
      }
    },
    [authUser],
  );

  const handleClearConnection = useCallback(() => {
    setSelectedConnection(null);
  }, []);

  // ─── New chat ──────────────────────────────────────────────────────────────

  const handleNewChat = useCallback(async () => {
    if (!authUser) return;
    chatStarted.current = false;
    // The next thread is a different conversation, so it gets to point the
    // toggle again.
    modeAdopted.current = false;
    // The chip is scoped to the conversation it was picked in — carrying it
    // into a fresh thread would silently attach the connection's context to a
    // question the user asked about something else. Clearing it before the
    // save keeps the empty thread honest; the rehydrate effect can't put it
    // back, since an empty thread has no last `connectionId`.
    setSelectedConnection(null);
    await saveChatAndClear(authUser.uid, messages);
  }, [authUser, messages]);

  // ─── Mode switch ───────────────────────────────────────────────────────────

  // Both readers share the one conversation. The toggle picks who answers the
  // *next* question and nothing else: the thread stays open, and the handover
  // is made in the prompt (see `[[READER_CHANGE]]` in chat-continuity.ts) so
  // the incoming reader keeps everything the outgoing one was told. Switching
  // used to park the thread and start a fresh one on every change, which is
  // what left the user with two half-conversations and no way to carry context
  // between them.
  //
  // It still parks on the switch past `MAX_READER_SWITCHES`, because each
  // handover leaves another persona copy in the extension's replay — see the
  // constant for why that is a budget and not a prompt-wording problem. That is
  // a visible reset of what the user is looking at, so it is asked, not done.
  //
  // Resolves true when the thread was parked, so a caller that sends straight
  // afterwards knows not to hand the old conversation on as history.
  const handleSelectMode = useCallback(
    async (next: ChatMode): Promise<boolean> => {
      if (next === mode) return false;

      // The user has now had their say either way, so a later snapshot must not
      // put the toggle back on the reader the thread happens to have been in.
      modeAdopted.current = true;

      if (readerSwitchesUsed(messagesRef.current) < MAX_READER_SWITCHES) {
        setMode(next);
        return false;
      }

      const startFresh = await new Promise<boolean>((resolve) => {
        Alert.alert(
          "Start a new chat?",
          `You've handed this conversation back and forth ${MAX_READER_SWITCHES} times — ` +
            "switching again starts a fresh one. This chat is saved to your history.",
          [
            { text: "Stay here", style: "cancel", onPress: () => resolve(false) },
            { text: "Start new chat", onPress: () => resolve(true) },
          ],
          { onDismiss: () => resolve(false) },
        );
      });
      if (!startFresh) return false;

      setMode(next);
      if (!authUser) return true;
      try {
        chatStarted.current = false;
        await saveChatAndClear(authUser.uid, messagesRef.current);
        return true;
      } catch (e) {
        // Nothing was cleared, so the thread the caller has is still the real
        // one — report it as unparked and let the switch land on it. That
        // overshoots the budget by one, which is the mild failure here.
        logger.error("[chat] reader budget park failed", e, "chat_mode_switch");
        return false;
      }
    },
    [authUser, mode],
  );

  const modeThumbWidth =
    (modeTrackWidth - (MODE_TRACK_PADDING + MODE_TRACK_BORDER) * 2) / 2;

  useEffect(() => {
    Animated.timing(modeAnim, {
      toValue: CHAT_MODES.indexOf(mode),
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [mode, modeAnim]);

  const handleChooseInitialMode = useCallback(
    async (next: ChatMode) => {
      const question = pendingInitial;
      setPendingInitial(null);
      if (!question) return;

      // The reader is per-question, so this only decides who answers this one —
      // whatever conversation is already open carries on underneath it, unless
      // the switch spent the last of the budget and parked it.
      const parked = await handleSelectMode(next);
      handleSend(question, next, parked ? [] : undefined);
    },
    [pendingInitial, handleSelectMode, handleSend],
  );

  // ─── Resume saved chat ─────────────────────────────────────────────────────

  const handleResumeSession = useCallback(
    async (session: SavedChatSession) => {
      if (!authUser) return;
      try {
        await resumeChatSession(authUser.uid, session, messagesRef.current);
        chatStarted.current = true;
        // The restored thread replaces the open one, so point the toggle at the
        // reader it was left in rather than waiting on a snapshot that would be
        // ignored (`modeAdopted` is already set by then).
        const resumedMode = lastChatMode(session.messages) ?? session.mode;
        if (resumedMode) setMode(resumedMode);
        modeAdopted.current = true;
        setViewingSession(null);
        setShowHistory(false);
      } catch (e) {
        logger.error("[chat] resume failed", e, "chat_resume");
      }
    },
    [authUser],
  );

  // ─── Derived ───────────────────────────────────────────────────────────────

  const showSuggestions = historyLoaded && messages.length === 0;
  const sendDisabled = isSending || !inputText.trim();

  // Every tarot turn shows the spread it was read from — a thread holds both
  // readers, so these can sit anywhere in it, not only at the top.
  //
  // Nothing is stored. The draw is seeded on uid + question + turn index, so
  // recomputing it here reproduces exactly the cards the prompt was built
  // around, and it survives a reload of the conversation. The index is the
  // message's position in the thread, which is the prior-turn count
  // `buildPrompt` seeded on, and the date comes off the message rather than
  // off the clock — otherwise a conversation left open across midnight would
  // redraw cards the model was never given.
  //
  // A turn with no stored mode predates tarot entirely, so it is astrology and
  // draws nothing; the toggle is deliberately not used as a fallback here,
  // since it now says nothing about turns already in the thread.
  const uid = authUser?.uid;
  const tarotDraws = useMemo(() => {
    const draws = new Map<string, DrawnTarotCard[]>();
    if (!uid) return draws;
    messages.forEach((msg, index) => {
      if (msg.mode !== "tarot") return;
      draws.set(msg.id, drawForTurn(uid, msg.userMessage, index, msg.createdAt));
    });
    return draws;
  }, [uid, messages]);

  const handleDrawComplete = useCallback(
    (messageId: string) => {
      if (!authUser) return;
      setRevealedDraws((prev) =>
        prev.includes(messageId) ? prev : [messageId, ...prev],
      );
      markChatDrawRevealed(authUser.uid, messageId).catch(
        logger.catchAsync("chat_draw_reveal"),
      );
    },
    [authUser],
  );

  // The same five rotating prompts back both the empty-state list and the
  // scrolling panel above the input once a conversation is under way.
  const visibleSuggestions = useMemo(() => {
    const pool = selectedConnection ? CONNECTION_SUGGESTIONS : SUGGESTIONS;
    return Array.from(
      { length: VISIBLE_SUGGESTIONS },
      (_, i) => pool[(suggestionOffset + i) % pool.length],
    );
  }, [selectedConnection, suggestionOffset]);

  const handleSuggestionPress = useCallback(
    (q: string) => {
      if (chatLocked) {
        handleLimitReached(q);
      } else {
        handleSend(q);
      }
    },
    [chatLocked, handleLimitReached, handleSend],
  );

  const connectionChip = selectedConnection ? (
    <TouchableOpacity
      style={styles.contextChipActive}
      onPress={handleClearConnection}
      activeOpacity={0.7}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="person-circle-outline" size={14} color={C.purpleLight} />
      <Text style={styles.contextChipText}>
        Talking about {selectedConnection.name}
      </Text>
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
      <Text style={styles.contextChipAddText}>Add a Connection</Text>
    </TouchableOpacity>
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title="Chat"
        leftIconName="time-outline"
        onLeftPress={() => setShowHistory(true)}
        leftAccessibilityLabel="Chat history"
        rightIconName="add"
        onRightPress={handleNewChat}
        rightAccessibilityLabel="New chat"
      />

      <PaygateOverlay
        locked={false}
        style={{ flex: 1 }}
        unlockTitle="Unlock Chat"
        unlockMessage="Subscribe to get personalized cosmic guidance through Delaluna chat."
        onUnlock={() => handleLimitReached()}
      >
        {/* ── History modal ── */}
        <Modal
          visible={showHistory}
          animationType="slide"
          onRequestClose={() => {
            if (viewingSession) {
              setViewingSession(null);
            } else {
              setShowHistory(false);
            }
          }}
        >
          <View style={[styles.historyModal, { paddingTop: insets.top }]}>
            {viewingSession ? (
              <>
                <View style={styles.historyHeader}>
                  <TouchableOpacity
                    onPress={() => setViewingSession(null)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="arrow-back" size={24} color={C.white} />
                  </TouchableOpacity>
                  <Text
                    style={[styles.historyTitle, { flex: 1, marginLeft: S.sm }]}
                    numberOfLines={1}
                  >
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
                  <TouchableOpacity
                    onPress={() => {
                      setViewingSession(null);
                      setShowHistory(false);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={{ marginLeft: S.sm }}
                  >
                    <Ionicons name="close" size={24} color={C.white} />
                  </TouchableOpacity>
                </View>
                <ScrollView
                  contentContainerStyle={styles.historyList}
                  showsVerticalScrollIndicator={false}
                >
                  {viewingSession.messages.map((m, i) => (
                    <View key={i} style={styles.historyEntry}>
                      <Text style={styles.historyTimestamp}>
                        {formatTime(m.createdAt)}
                      </Text>
                      <View
                        style={[styles.userBubble, { alignSelf: "flex-end" }]}
                      >
                        <Text style={styles.userBubbleText}>
                          {m.userMessage}
                        </Text>
                      </View>
                      {m.response ? (
                        <View
                          style={[styles.aiBubble, { alignSelf: "flex-start" }]}
                        >
                          <Text style={styles.aiBubbleText}>
                            {renderRichText(m.response)}
                          </Text>
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
                  <TouchableOpacity
                    onPress={() => setShowHistory(false)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={24} color={C.white} />
                  </TouchableOpacity>
                </View>
                {savedSessions.length === 0 ? (
                  <View style={styles.historyEmpty}>
                    <Text style={styles.historyEmptyText}>
                      No saved chats yet.
                    </Text>
                  </View>
                ) : (
                  <ScrollView
                    contentContainerStyle={styles.historyList}
                    showsVerticalScrollIndicator={false}
                  >
                    {savedSessions.map((session) => (
                      <TouchableOpacity
                        key={session.id}
                        style={styles.sessionRow}
                        onPress={() => setViewingSession(session)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.sessionInfo}>
                          <Text style={styles.sessionTitle} numberOfLines={1}>
                            {session.title}
                          </Text>
                          <Text style={styles.sessionDate}>
                            {session.savedAt.toLocaleDateString()} ·{" "}
                            {session.messages.length} message
                            {session.messages.length !== 1 ? "s" : ""}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() =>
                            authUser &&
                            deleteChatSession(authUser.uid, session.id)
                          }
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={18}
                            color={C.muted}
                          />
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </>
            )}
          </View>
        </Modal>

        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          <View style={[styles.flex, { paddingTop: headerHeight }]}>
            <View
              style={[
                styles.modeBar,
                { paddingHorizontal: getContentPadding(screenWidth) },
              ]}
            >
              <View
                style={styles.modeTrack}
                onLayout={(e) => setModeTrackWidth(e.nativeEvent.layout.width)}
              >
                {modeTrackWidth > 0 && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.modeThumb,
                      {
                        width: modeThumbWidth,
                        transform: [
                          {
                            translateX: modeAnim.interpolate({
                              inputRange: [0, 1],
                              outputRange: [0, modeThumbWidth],
                            }),
                          },
                        ],
                      },
                    ]}
                  />
                )}
                {CHAT_MODES.map((m) => (
                  <TouchableOpacity
                    key={m}
                    onPress={() => handleSelectMode(m)}
                    style={styles.modeTab}
                    activeOpacity={0.8}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: mode === m }}
                  >
                    <Ionicons
                      name={
                        m === "astrology"
                          ? "planet-outline"
                          : "sparkles-outline"
                      }
                      size={16}
                      color={mode === m ? C.purpleLight : C.muted}
                    />
                    <Text
                      style={[
                        styles.modeTabText,
                        mode === m && styles.modeTabTextActive,
                      ]}
                    >
                      {m === "astrology" ? "Astrology" : "Tarot"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {showSuggestions ? (
              <View style={styles.suggestionsContainer}>
                <Text style={styles.suggestionsLabel}>
                  {selectedConnection
                    ? `What do you want to know about ${selectedConnection.name}?`
                    : "What's on your mind?"}
                </Text>
                {visibleSuggestions.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.suggestionChip}
                    onPress={() => handleSuggestionPress(q)}
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
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => {
                  const draw = tarotDraws.get(item.id);
                  const revealed = revealedDraws.includes(item.id);
                  return (
                    <MessageBubble
                      msg={item}
                      onRetry={handleRetry}
                      isRetrying={retryingIds.includes(item.id)}
                      holdForDraw={!!draw && !revealed}
                      accessory={
                        draw ? (
                          <ChatTarotDraw
                            cardNumber={draw.map((c) => c.id)}
                            reversed={draw.map((c) => c.reversed)}
                            alreadyRevealed={revealed}
                            onDrawComplete={() => handleDrawComplete(item.id)}
                          />
                        ) : null
                      }
                    />
                  );
                }}
                contentContainerStyle={[
                  styles.messageList,
                  {
                    paddingBottom: insets.bottom + S.md,
                    paddingHorizontal: getContentPadding(screenWidth),
                    maxWidth: MAX_CONTENT_WIDTH,
                    alignSelf: "center",
                    width: "100%",
                  },
                ]}
                showsVerticalScrollIndicator={false}
                onContentSizeChange={() =>
                  flatListRef.current?.scrollToEnd({ animated: true })
                }
              />
            )}

            {showSuggestions ? (
              <View style={styles.contextRow}>{connectionChip}</View>
            ) : (
              <ScrollView
                horizontal
                style={styles.quickPanel}
                contentContainerStyle={styles.quickPanelContent}
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {connectionChip}
                {visibleSuggestions.map((q) => (
                  <TouchableOpacity
                    key={q}
                    style={styles.quickChip}
                    onPress={() => handleSuggestionPress(q)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.quickChipText} numberOfLines={1}>
                      {q}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            <View style={[styles.inputBar, { paddingBottom: S.sm }]}>
              <TextInput
                style={styles.textInput}
                value={inputText}
                onChangeText={setInputText}
                accessibilityLabel="Message Delaluna"
                placeholder="Ask Delaluna anything..."
                placeholderTextColor={C.muted}
                multiline
                maxLength={500}
                returnKeyType="send"
                onSubmitEditing={() => handleSend()}
                blurOnSubmit
              />
              <TouchableOpacity
                style={[
                  styles.sendButton,
                  sendDisabled && styles.sendButtonDisabled,
                ]}
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
                {unmetered
                  ? "Admin account — questions aren't metered"
                  : baseDailyChatLimit === 0
                    ? questionLimit === 0
                      ? "Buy additional questions to continue chatting"
                      : `${questionsRemaining} of ${questionLimit} purchased question${questionLimit === 1 ? "" : "s"} remaining`
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
          // A real purchase shows up in CustomerInfo via onRefresh; only the
          // mock path needs crediting by hand.
          if (isDevMode) setMockExtraQuestions((n) => n + quantity);
        }}
        onRefresh={refreshRevenueCat}
      />

      <Modal
        visible={!!pendingInitial}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingInitial(null)}
      >
        <View style={styles.chooserOverlay}>
          <View style={styles.chooserCard}>
            <Text style={styles.chooserTitle}>How should Delaluna answer?</Text>
            <Text style={styles.chooserQuestion}>{pendingInitial}</Text>

            {CHAT_MODES.map((m) => (
              <TouchableOpacity
                key={m}
                style={styles.chooserOption}
                onPress={() => handleChooseInitialMode(m)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={
                    m === "astrology" ? "planet-outline" : "sparkles-outline"
                  }
                  size={18}
                  color={C.purpleLight}
                />
                <View style={styles.flex}>
                  <Text style={styles.chooserOptionText}>
                    {m === "astrology" ? "Astrology" : "Tarot"}
                  </Text>
                  <Text style={styles.chooserOptionHint}>
                    {m === "astrology"
                      ? "Read from your chart and the current transits"
                      : "Pull a card and read the question from it"}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={styles.chooserCancel}
              onPress={() => setPendingInitial(null)}
              activeOpacity={0.7}
            >
              <Text style={styles.chooserCancelText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: S.md,
    gap: S.sm,
  },
  suggestionsLabel: {
    color: C.muted,
    fontSize: 14,
    marginBottom: S.sm,
    textAlign: "center",
  },
  suggestionChip: {
    borderWidth: 1,
    borderColor: C.inactiveTabs + "59",
    borderRadius: R.pill,
    paddingVertical: 10,
    paddingHorizontal: S.md,
    backgroundColor: C.inactiveTabs + "12",
    width: "100%",
  },
  suggestionText: {
    color: C.purpleLight,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
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

  userBubbleRow: { alignItems: "flex-end" },
  userBubble: {
    backgroundColor: C.purpleDim,
    borderRadius: R.lg,
    borderBottomRightRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    maxWidth: "80%",
  },
  userBubbleText: {
    color: C.white,
    fontSize: 14,
    lineHeight: 20,
  },

  aiBubbleRow: { alignItems: "flex-start" },
  aiBubble: {
    backgroundColor: C.white + "12",
    borderRadius: R.lg,
    borderBottomLeftRadius: R.sm,
    paddingHorizontal: S.md,
    paddingVertical: S.sm,
    maxWidth: "80%",
    overflow: "visible",
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
    alignSelf: "flex-start",
  },
  retryButtonBusy: {
    opacity: 0.5,
  },
  retryText: {
    color: C.retro,
    fontSize: 12,
    fontWeight: "600",
  },
  slowHint: {
    color: C.muted,
    fontSize: 12,
    marginTop: 6,
  },

  typingRow: {
    flexDirection: "row",
    alignItems: "center",
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
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: S.sm,
    paddingTop: S.sm,
    gap: S.sm,
    borderTopWidth: 1,
    borderTopColor: C.white + "14",
    backgroundColor: C.cosmos + "33",
  },
  contextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: S.sm + 2,
    paddingTop: S.sm,
    paddingBottom: 2,
  },
  // Mid-conversation the same chip heads a scrolling row of prompts. flexGrow 0
  // keeps the ScrollView at its content height instead of claiming the space
  // the transcript needs.
  quickPanel: {
    flexGrow: 0,
  },
  quickPanelContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm,
    paddingHorizontal: S.sm + 2,
    paddingTop: S.sm,
    paddingBottom: 2,
  },
  quickChip: {
    borderWidth: 1,
    borderColor: C.inactiveTabs + "59",
    borderRadius: R.pill,
    paddingVertical: 8,
    paddingHorizontal: S.md,
    backgroundColor: C.inactiveTabs + "12",
  },
  quickChipText: {
    color: C.purpleLight,
    fontSize: 13,
    lineHeight: 18,
  },
  contextChipActive: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: S.sm + 2,
    borderRadius: R.pill,
    backgroundColor: C.purpleLight + "2E",
    borderWidth: 1,
    borderColor: C.purpleLight + "73",
  },
  contextChipText: {
    color: C.purpleLight,
    fontSize: 12,
    fontWeight: "600",
  },
  contextChipAdd: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: S.sm + 2,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.white + "2E",
  },
  contextChipAddText: {
    color: C.muted,
    fontSize: 12,
  },
  modeBar: {
    paddingVertical: S.sm,
    alignSelf: "center",
    width: "100%",
    maxWidth: MAX_CONTENT_WIDTH,
  },
  modeTrack: {
    flexDirection: "row",
    alignItems: "stretch",
    height: 52,
    padding: MODE_TRACK_PADDING,
    borderRadius: R.lg,
    backgroundColor: C.white + "0A",
    borderWidth: MODE_TRACK_BORDER,
    borderColor: C.white + "12",
  },
  modeThumb: {
    position: "absolute",
    top: MODE_TRACK_PADDING,
    bottom: MODE_TRACK_PADDING,
    left: MODE_TRACK_PADDING,
    borderRadius: R.md + 2,
    backgroundColor: C.purple + "1F",
    borderWidth: 1,
    borderColor: C.purple,
    shadowColor: C.purple,
    shadowOpacity: 0.55,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  modeTab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  modeTabText: {
    color: C.muted,
    fontSize: 15,
    fontWeight: "600",
  },
  modeTabTextActive: {
    color: C.purpleLight,
    fontWeight: "700",
  },
  accessoryRow: {
    alignItems: "center",
    width: "100%",
    paddingVertical: S.sm,
  },
  aboutTag: {
    alignSelf: "flex-end",
    color: C.purpleLight,
    fontSize: 11,
    fontStyle: "italic",
    marginBottom: 2,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: C.white + "14",
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
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    backgroundColor: C.purpleDim,
  },

  paygateContainer: {
    paddingHorizontal: S.md,
    paddingTop: S.md,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  paygateContainerCentered: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: S.md,
  },
  counterBar: {
    alignItems: "center",
    paddingVertical: S.xs,
    backgroundColor: C.cosmos + "33",
  },
  counterText: {
    color: C.muted,
    fontSize: 12,
  },

  chooserOverlay: {
    flex: 1,
    justifyContent: "center",
    padding: S.lg,
    backgroundColor: C.cosmos + "CC",
  },
  chooserCard: {
    borderRadius: R.lg,
    padding: S.md,
    gap: S.sm,
    backgroundColor: C.nebula,
    borderWidth: 1,
    borderColor: C.white + "1A",
  },
  chooserTitle: {
    color: C.white,
    fontSize: 16,
    fontWeight: "700",
  },
  chooserQuestion: {
    color: C.muted,
    fontSize: 13,
    fontStyle: "italic",
    marginBottom: S.sm,
  },
  chooserOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: S.sm + 2,
    padding: S.sm + 4,
    borderRadius: R.md,
    backgroundColor: C.purple + "1F",
    borderWidth: 1,
    borderColor: C.purple,
  },
  chooserOptionText: {
    color: C.purpleLight,
    fontSize: 15,
    fontWeight: "700",
  },
  chooserOptionHint: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },
  chooserCancel: {
    alignSelf: "center",
    paddingVertical: S.sm,
    paddingHorizontal: S.md,
  },
  chooserCancelText: {
    color: C.muted,
    fontSize: 13,
  },
  historyModal: {
    flex: 1,
    backgroundColor: C.nebula,
  },
  historyHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: S.md,
    paddingVertical: S.md,
    borderBottomWidth: 1,
    borderBottomColor: C.white + "14",
  },
  historyTitle: {
    color: C.white,
    fontSize: 17,
    fontWeight: "600",
  },
  historyEmpty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
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
    textAlign: "center",
    marginBottom: S.xs,
  },
  sessionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white + "0D",
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
    fontWeight: "500",
  },
  sessionDate: {
    color: C.muted,
    fontSize: 12,
    marginTop: 2,
  },
  resumeButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: S.sm,
    paddingVertical: 6,
    borderRadius: R.pill,
    backgroundColor: C.white + "1F",
  },
  resumeButtonText: {
    color: C.white,
    fontSize: 13,
    fontWeight: "600",
  },
});
