import { GlassButton } from "@/src/assets/buttons/glass-button";
import HeaderNav from "@/src/components/shared/header-nav";
import { C } from "@/src/constants/theme";
import { STORE_LINKS } from "@/src/constants/links";
import { useAnnounce } from "@/src/hooks/use-announce";
import { submitFeedback } from "@/src/services/feedback.service";
import { logger } from "@/src/utils/logger";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as StoreReview from "expo-store-review";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  TouchableOpacity,
  View,
} from "react-native";
import { Text, TextInput } from "@/src/components/app-text";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLORS = {
  card: "rgba(255,255,255,0.06)", // translucent so the theme background shows through, as on Profile
  border: "rgba(255,255,255,0.1)",
  primary: C.turquoise,
  light: C.purpleLight,
  muted: C.purple, // icons and dividers only — too low-contrast for text
  mutedText: "rgba(255,255,255,0.7)", // matches Profile; sits on the theme image, not a flat fill
  star: C.gold,
  text: C.white,
  subText: "rgba(255,255,255,0.7)",
  placeholder: "rgba(255,255,255,0.45)",
};

const FONT = Platform.select({
  ios: "DMSans-Regular",
  android: "DMSans-Regular",
  default: undefined,
});

const LOVE_OPTIONS = [
  "Daily horoscope",
  "Birth chart",
  "Chat",
  "Synastry",
  "Transits",
  "Tarot",
  "Themes",
  "Connections",
  "Accuracy",
];

const IMPROVE_OPTIONS = [
  "More readings",
  "Better UI",
  "Faster chat",
  "Notifications",
  "Accuracy",
  "More personalization",
  "Connection Accuracy",
  "Tone of responses",
  "Other",
];

const NAV_BAR_HEIGHT = 44;

// The store's review page, then its web listing if the store app can't open.
const STORE = Platform.OS === "ios" ? STORE_LINKS.ios : STORE_LINKS.android;
const STORE_REVIEW_URL = STORE.review;
const STORE_REVIEW_WEB_URL = STORE.webReview;

/** Decorative glyphs (✦ ☽) — otherwise read aloud as "four pointed star", "last quarter moon". */
const DECORATIVE = {
  accessibilityElementsHidden: true,
  importantForAccessibility: "no-hide-descendants",
} as const;

type SubmitState = "idle" | "submitting" | "positive" | "negative";

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();

  const [rating, setRating] = useState(0);
  const [loved, setLoved] = useState<string[]>([]);
  const [improve, setImprove] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [allowFollowUp, setAllowFollowUp] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");

  // The comment box is the only field and sits near the bottom, so the
  // ScrollView never brought it up on its own: it opened under the keyboard.
  // Scrolling to the end once the keyboard is up shows it with Send below.
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    // Optional: jest.setup.js mocks NativeEventEmitter, so there it's undefined.
    return () => sub?.remove();
  }, []);

  const toggle = (
    arr: string[],
    setArr: (v: string[]) => void,
    val: string,
  ) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const canSubmit = rating > 0 && submitState !== "submitting";

  // The form is swapped for a thank-you panel with focus left nowhere.
  useAnnounce(
    submitState === "positive"
      ? "Thank you. Share the love?"
      : submitState === "negative"
        ? "Thank you. We hear you."
        : null,
  );

  const stepRating = (delta: number) =>
    setRating((r) => Math.max(0, Math.min(5, r + delta)));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitState("submitting");

    try {
      // Saved to feedback/{id} and emailed to the admin inbox by the
      // submitFeedback Cloud Function.
      await submitFeedback({ rating, loved, improve, comment, allowFollowUp });
    } catch (err: any) {
      logger.error("[feedback] submit failed", err, "feedback_submit");
      setSubmitState("idle");
      // This used to fall through to the thank-you screen whether or not
      // anything was saved. Keep the form so nothing typed is lost.
      Alert.alert(
        "Couldn't send feedback",
        err?.code === "functions/resource-exhausted"
          ? "Please wait a minute before sending more feedback."
          : "Please check your connection and try again.",
      );
      return;
    }

    setSubmitState(rating >= 4 ? "positive" : "negative");
  };

  const handleLeaveReview = async () => {
    // The in-app review sheet where the OS offers it. It is rate-limited by
    // Apple / Google and never reports whether it was actually shown.
    try {
      if (await StoreReview.isAvailableAsync()) {
        await StoreReview.requestReview();
        router.back();
        return;
      }
    } catch (err) {
      logger.error("[feedback] in-app review failed", err, "feedback_store_review");
    }
    // Otherwise the store's own review page. These were placeholder IDs
    // (idYOUR_APP_ID / YOUR_PACKAGE_NAME), so the fallback opened nothing.
    try {
      await Linking.openURL(STORE_REVIEW_URL);
    } catch {
      await Linking.openURL(STORE_REVIEW_WEB_URL).catch(() => {});
    }
    router.back();
  };

  const handleContactSupport = () => {
    router.replace("/(util)/support");
  };

  // One adjustable control to a screen reader — swipe up / down. The stars were
  // unnamed icon buttons, and a rating is required to send, so feedback could
  // not be given at all. VoiceOver folds the stars into this; they keep labels
  // for TalkBack, which can still reach them.
  const renderStars = () => (
    <View
      style={s.starsRow}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Rating"
      accessibilityValue={{
        min: 0,
        max: 5,
        now: rating,
        text: rating ? `${rating} of 5 stars` : "No rating",
      }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) =>
        stepRating(e.nativeEvent.actionName === "increment" ? 1 : -1)
      }
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => setRating(n)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${n} ${n === 1 ? "star" : "stars"}`}
          accessibilityState={{ selected: n === rating }}
        >
          <Ionicons
            name={n <= rating ? "star" : "star-outline"}
            size={moderateScale(36)}
            color={n <= rating ? COLORS.star : COLORS.muted}
            style={{ marginHorizontal: scale(4) }}
          />
        </TouchableOpacity>
      ))}
      <Text style={s.ratingLabel} {...DECORATIVE}>{rating}/5</Text>
    </View>
  );

  const renderChips = (
    options: string[],
    selected: string[],
    setSelected: (v: string[]) => void,
  ) => (
    <View style={s.chipsWrap}>
      {options.map((opt) => {
        const on = selected.includes(opt);
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => toggle(selected, setSelected, opt)}
            style={[s.chip, on && s.chipOn]}
            activeOpacity={0.8}
            // Multi-select; "selected" was only a border and tint
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const Divider = () => (
    <View style={s.dividerRow} {...DECORATIVE}>
      <View style={s.dividerLine} />
      <Text style={s.dividerMoon}>☽</Text>
      <View style={s.dividerLine} />
    </View>
  );

  if (submitState === "positive") {
    return (
      <View
        style={[s.root, { paddingTop: insets.top + scale(NAV_BAR_HEIGHT) }]}
      >
        <HeaderNav
          title="Feedback"
          leftIconName="chevron-back-outline"
          onLeftPress={() => router.back()}
        />
        <View style={s.statePanel}>
          <Text style={s.starsBig} {...DECORATIVE}>✦</Text>
          <Text style={s.stateTitle} accessibilityRole="header">Share the love?</Text>
          <Text style={s.stateBody}>
            Leave a Review — your words help other seekers find Delaluna.
          </Text>
          <View style={s.primaryBtnWrap}>
            <GlassButton title="Leave Review ✦" accessibilityLabel="Leave review" onPress={handleLeaveReview} />
          </View>
          <TouchableOpacity onPress={() => router.back()} style={s.linkBtn} accessibilityRole="button">
            <Text style={s.linkText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (submitState === "negative") {
    return (
      <View
        style={[s.root, { paddingTop: insets.top + scale(NAV_BAR_HEIGHT) }]}
      >
        <HeaderNav
          title="Feedback"
          leftIconName="chevron-back-outline"
          onLeftPress={() => router.back()}
        />
        <View style={s.statePanel}>
          <Text style={s.starsBig} {...DECORATIVE}>☽</Text>
          <Text style={s.stateTitle} accessibilityRole="header">We hear you</Text>
          <Text style={s.stateBody}>
            Thank you for the honest reflection. Want to tell us more so we can
            make it right?
          </Text>
          <View style={s.primaryBtnWrap}>
            <GlassButton title="Contact Support" onPress={handleContactSupport} />
          </View>
          <TouchableOpacity onPress={() => router.back()} style={s.linkBtn} accessibilityRole="button">
            <Text style={s.linkText}>No thanks, go home</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <HeaderNav
        title="Feedback"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />
      {/* No keyboardVerticalOffset: the header is absolutely positioned, so
          this view already starts at the top of the screen. Offsetting by the
          header height left that much of the form under the keyboard. */}
      <KeyboardAvoidingView behavior="padding" style={s.flex}>
        <ScrollView
          ref={scrollRef}
          style={[s.scroll, { marginTop: insets.top + scale(NAV_BAR_HEIGHT) }]}
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.intro} accessibilityRole="header">How was your experience?</Text>
          <Text style={s.introSub}>
            Tap a star, and tell us what felt right (or wrong).
          </Text>

          {renderStars()}

          <Divider />

          <Text style={s.sectionLabel} accessibilityRole="header">WHAT DID YOU LOVE?</Text>
          {renderChips(LOVE_OPTIONS, loved, setLoved)}

          <Divider />

          <Text style={s.sectionLabel} accessibilityRole="header">ANYTHING TO IMPROVE?</Text>
          {renderChips(IMPROVE_OPTIONS, improve, setImprove)}

          <Divider />

          <Text style={s.sectionLabel} accessibilityRole="header">YOUR THOUGHTS</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            accessibilityLabel="Your thoughts"
            placeholder="The stars are listening..."
            placeholderTextColor={COLORS.placeholder}
            style={s.textarea}
            multiline
            textAlignVertical="top"
          />

          <View style={s.toggleRow}>
            <View style={s.flex} {...DECORATIVE}>
              <Text style={s.toggleTitle}>Allow follow-up by email</Text>
              <Text style={s.toggleSub}>
                We may reach out if we need to clarify something.
              </Text>
            </View>
            <Switch
              value={allowFollowUp}
              onValueChange={setAllowFollowUp}
              trackColor={{
                false: "rgba(255,255,255,0.12)",
                true: C.turquoise,
              }}
              thumbColor="#f4f3f4"
              ios_backgroundColor="rgba(255,255,255,0.12)"
              // The text beside a Switch isn't its name; it carries both here
              // (the visible copy is hidden from screen readers to avoid reading it twice)
              accessibilityLabel="Allow follow-up by email"
              accessibilityHint="We may reach out if we need to clarify something."
            />
          </View>

          <View style={s.primaryBtnWrap}>
            <GlassButton
              title={submitState === "submitting" ? "Sending…" : "Send Feedback ✦"}
              onPress={handleSubmit}
              disabled={!canSubmit}
              busy={submitState === "submitting"}
              // Stays named while sending, and says why it's disabled
              accessibilityLabel="Send feedback"
              accessibilityHint={rating === 0 ? "Choose a rating first" : undefined}
            />
          </View>

          <View style={{ height: verticalScale(48) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(20),
  },

  intro: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: moderateScale(22),
    fontWeight: "700",
    textAlign: "center",
  },
  introSub: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    textAlign: "center",
    marginTop: verticalScale(6),
    marginBottom: verticalScale(20),
  },

  starsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(2),
  },
  ratingLabel: {
    color: COLORS.light,
    fontFamily: FONT,
    fontSize: moderateScale(14),
    fontWeight: "600",
    marginLeft: scale(10),
  },

  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: verticalScale(22),
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerMoon: {
    color: COLORS.muted,
    fontSize: moderateScale(16),
    paddingHorizontal: scale(12),
  },

  sectionLabel: {
    color: COLORS.mutedText,
    fontFamily: FONT,
    fontSize: moderateScale(10),
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: verticalScale(10),
    textTransform: "uppercase",
  },

  chipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: scale(8) },
  chip: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  chipOn: {
    borderColor: COLORS.primary,
    backgroundColor: "rgba(111,255,233,0.12)",
  },
  chipText: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    fontWeight: "500",
  },
  chipTextOn: { color: COLORS.light },

  textarea: {
    minHeight: verticalScale(110),
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: scale(14),
    padding: scale(14),
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: moderateScale(14),
  },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: scale(14),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    marginTop: verticalScale(20),
  },
  toggleTitle: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: moderateScale(14),
    fontWeight: "600",
  },
  toggleSub: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(12),
    marginTop: 2,
  },

  primaryBtnWrap: { marginTop: verticalScale(24), alignItems: "center" },

  // Confirmation states
  statePanel: {
    flex: 1,
    paddingHorizontal: scale(28),
    alignItems: "center",
    justifyContent: "center",
  },
  starsBig: {
    fontSize: moderateScale(48),
    color: COLORS.star,
    marginBottom: verticalScale(12),
  },
  stateTitle: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: moderateScale(22),
    fontWeight: "700",
    textAlign: "center",
  },
  stateBody: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(14),
    textAlign: "center",
    marginTop: verticalScale(10),
    marginBottom: verticalScale(28),
    lineHeight: moderateScale(20),
  },
  linkBtn: { marginTop: verticalScale(14), padding: scale(8) },
  linkText: {
    color: COLORS.mutedText,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    textDecorationLine: "underline",
  },
});
