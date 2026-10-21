import HeaderNav from "@/src/components/shared/header-nav";
import { STORE_LINKS } from "@/src/constants/links";
import { useAnnounce } from "@/src/hooks/use-announce";
import { submitFeedback } from "@/src/services/feedback.service";
import { logger } from "@/src/utils/logger";
import { moderateScale, scale, verticalScale } from "@/src/utils/responsive";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import * as StoreReview from "expo-store-review";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const COLORS = {
  bg: "#0e0b1a",
  header: "#110d22",
  card: "#1a1535",
  border: "#2a2050",
  primary: "#7c6fd4",
  light: "#c8bfff",
  muted: "#6b5fa8", // icons and dividers only — ~3.5:1 on bg, too low for text
  mutedText: "#9d92d6", // ~7:1 on bg, ~6.3:1 on card
  star: "#f0c040",
  text: "#ffffff",
  subText: "rgba(200,191,255,0.65)",
  placeholder: "rgba(200,191,255,0.35)",
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
          backgroundColor={COLORS.header}
          textColor={COLORS.light}
        />
        <View style={s.statePanel}>
          <Text style={s.starsBig} {...DECORATIVE}>✦</Text>
          <Text style={s.stateTitle} accessibilityRole="header">Share the love?</Text>
          <Text style={s.stateBody}>
            Leave a Review — your words help other seekers find Delaluna.
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={handleLeaveReview}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Leave review"
          >
            <Text style={s.primaryBtnText}>Leave Review ✦</Text>
          </TouchableOpacity>
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
          backgroundColor={COLORS.header}
          textColor={COLORS.light}
        />
        <View style={s.statePanel}>
          <Text style={s.starsBig} {...DECORATIVE}>☽</Text>
          <Text style={s.stateTitle} accessibilityRole="header">We hear you</Text>
          <Text style={s.stateBody}>
            Thank you for the honest reflection. Want to tell us more so we can
            make it right?
          </Text>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={handleContactSupport}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={s.primaryBtnText}>Contact Support</Text>
          </TouchableOpacity>
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
        backgroundColor={COLORS.header}
        textColor={COLORS.light}
      />
      <KeyboardAvoidingView
        behavior="padding"
        style={s.flex}
        keyboardVerticalOffset={insets.top + scale(NAV_BAR_HEIGHT)}
      >
        <ScrollView
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
                true: "rgba(124,111,212,0.6)",
              }}
              thumbColor={allowFollowUp ? COLORS.primary : "#f4f3f4"}
              ios_backgroundColor="rgba(255,255,255,0.12)"
              // The text beside a Switch isn't its name; it carries both here
              // (the visible copy is hidden from screen readers to avoid reading it twice)
              accessibilityLabel="Allow follow-up by email"
              accessibilityHint="We may reach out if we need to clarify something."
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[s.primaryBtn, !canSubmit && s.btnDisabled]}
            activeOpacity={0.85}
            accessibilityRole="button"
            // Stays named while the spinner replaces the text, and says why it's disabled
            accessibilityLabel="Send feedback"
            accessibilityHint={rating === 0 ? "Choose a rating first" : undefined}
            accessibilityState={{ disabled: !canSubmit, busy: submitState === "submitting" }}
          >
            {submitState === "submitting" ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>Send Feedback ✦</Text>
            )}
          </TouchableOpacity>

          <View style={{ height: verticalScale(48) }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: COLORS.bg },
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
    backgroundColor: "rgba(124,111,212,0.18)",
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

  primaryBtn: {
    marginTop: verticalScale(24),
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: verticalScale(14),
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontFamily: FONT,
    fontSize: moderateScale(15),
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  btnDisabled: { opacity: 0.45 },

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
