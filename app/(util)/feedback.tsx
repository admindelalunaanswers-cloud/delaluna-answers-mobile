import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
  Linking,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HeaderNav from '@/src/components/shared/header-nav';
import { useUser } from '@/src/context/user-context';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const COLORS = {
  bg: '#0e0b1a',
  header: '#110d22',
  card: '#1a1535',
  border: '#2a2050',
  primary: '#7c6fd4',
  light: '#c8bfff',
  muted: '#6b5fa8',
  star: '#f0c040',
  text: '#ffffff',
  subText: 'rgba(200,191,255,0.65)',
  placeholder: 'rgba(200,191,255,0.35)',
};

const FONT = Platform.select({ ios: 'DMSans-Regular', android: 'DMSans-Regular', default: undefined });

const LOVE_OPTIONS = [
  'Daily horoscope',
  'Birth chart',
  'Chat',
  'Synastry',
  'Transits',
  'Tarot',
  'Themes',
  'Connections',
  'Accuracy',
  
];

const IMPROVE_OPTIONS = [
  'More readings',
  'Better UI',
  'Faster chat',
  'Notifications',
  'Accuracy',
  'More personalization',
  'Connection Accuracy',
  'Tone of responses',
  'Other'
];

const NAV_BAR_HEIGHT = 44;

type SubmitState = 'idle' | 'submitting' | 'positive' | 'negative';

export default function FeedbackScreen() {
  const insets = useSafeAreaInsets();
  const { authUser } = useUser();

  const [rating, setRating] = useState(0);
  const [loved, setLoved] = useState<string[]>([]);
  const [improve, setImprove] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [allowFollowUp, setAllowFollowUp] = useState(true);
  const [submitState, setSubmitState] = useState<SubmitState>('idle');

  const toggle = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const canSubmit = rating > 0 && submitState !== 'submitting';

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitState('submitting');

    try {
      // TODO: persist feedback to Firestore once schema is defined.
      // For now, log so dev can see payload.
      console.log('[feedback]', {
        uid: authUser?.uid ?? null,
        rating,
        loved,
        improve,
        comment,
        allowFollowUp,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[feedback] submit error', err);
    }

    setSubmitState(rating >= 4 ? 'positive' : 'negative');
  };

  const handleLeaveReview = async () => {
    try {
      const StoreReview = require('expo-store-review');
      const isAvailable = await StoreReview.isAvailableAsync();
      if (isAvailable) {
        await StoreReview.requestReview();
        router.back();
        return;
      }
    } catch {
      // expo-store-review not installed — fall back to deep link
    }
    const url = Platform.select({
      ios: 'itms-apps://itunes.apple.com/app/idYOUR_APP_ID?action=write-review',
      android: 'market://details?id=YOUR_PACKAGE_NAME',
    });
    if (url) Linking.openURL(url).catch(() => {});
    router.back();
  };

  const handleContactSupport = () => {
    router.replace('/(settings)/support');
  };

  const renderStars = () => (
    <View style={s.starsRow}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => setRating(n)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={n <= rating ? 'star' : 'star-outline'}
            size={moderateScale(36)}
            color={n <= rating ? COLORS.star : COLORS.muted}
            style={{ marginHorizontal: scale(4) }}
          />
        </TouchableOpacity>
      ))}
      <Text style={s.ratingLabel}>{rating}/5</Text>
    </View>
  );

  const renderChips = (
    options: string[],
    selected: string[],
    setSelected: (v: string[]) => void
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
          >
            <Text style={[s.chipText, on && s.chipTextOn]}>{opt}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const Divider = () => (
    <View style={s.dividerRow}>
      <View style={s.dividerLine} />
      <Text style={s.dividerMoon}>☽</Text>
      <View style={s.dividerLine} />
    </View>
  );

  if (submitState === 'positive') {
    return (
      <View style={[s.root, { paddingTop: insets.top + scale(NAV_BAR_HEIGHT) }]}>
        <HeaderNav
          title="Feedback"
          leftIconName="chevron-back-outline"
          onLeftPress={() => router.back()}
          backgroundColor={COLORS.header}
          textColor={COLORS.light}
        />
        <View style={s.statePanel}>
          <Text style={s.starsBig}>✦</Text>
          <Text style={s.stateTitle}>Share the love?</Text>
          <Text style={s.stateBody}>
            Leave a Review — your words help other seekers find Delaluna.
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={handleLeaveReview} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Leave Review ✦</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={s.linkBtn}>
            <Text style={s.linkText}>Not now</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (submitState === 'negative') {
    return (
      <View style={[s.root, { paddingTop: insets.top + scale(NAV_BAR_HEIGHT) }]}>
        <HeaderNav
          title="Feedback"
          leftIconName="chevron-back-outline"
          onLeftPress={() => router.back()}
          backgroundColor={COLORS.header}
          textColor={COLORS.light}
        />
        <View style={s.statePanel}>
          <Text style={s.starsBig}>☽</Text>
          <Text style={s.stateTitle}>We hear you</Text>
          <Text style={s.stateBody}>
            Thank you for the honest reflection. Want to tell us more so we can make it right?
          </Text>
          <TouchableOpacity style={s.primaryBtn} onPress={handleContactSupport} activeOpacity={0.85}>
            <Text style={s.primaryBtnText}>Contact Support</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} style={s.linkBtn}>
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
          <Text style={s.intro}>How was your experience?</Text>
          <Text style={s.introSub}>Tap a star, and tell us what felt right (or wrong).</Text>

          {renderStars()}

          <Divider />

          <Text style={s.sectionLabel}>WHAT DID YOU LOVE?</Text>
          {renderChips(LOVE_OPTIONS, loved, setLoved)}

          <Divider />

          <Text style={s.sectionLabel}>ANYTHING TO IMPROVE?</Text>
          {renderChips(IMPROVE_OPTIONS, improve, setImprove)}

          <Divider />

          <Text style={s.sectionLabel}>YOUR THOUGHTS</Text>
          <TextInput
            value={comment}
            onChangeText={setComment}
            placeholder="The stars are listening..."
            placeholderTextColor={COLORS.placeholder}
            style={s.textarea}
            multiline
            textAlignVertical="top"
          />

          <View style={s.toggleRow}>
            <View style={s.flex}>
              <Text style={s.toggleTitle}>Allow follow-up by email</Text>
              <Text style={s.toggleSub}>We may reach out if we need to clarify something.</Text>
            </View>
            <Switch
              value={allowFollowUp}
              onValueChange={setAllowFollowUp}
              trackColor={{ false: 'rgba(255,255,255,0.12)', true: 'rgba(124,111,212,0.6)' }}
              thumbColor={allowFollowUp ? COLORS.primary : '#f4f3f4'}
              ios_backgroundColor="rgba(255,255,255,0.12)"
            />
          </View>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!canSubmit}
            style={[s.primaryBtn, !canSubmit && s.btnDisabled]}
            activeOpacity={0.85}
          >
            {submitState === 'submitting' ? (
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
    fontWeight: '700',
    textAlign: 'center',
  },
  introSub: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    textAlign: 'center',
    marginTop: verticalScale(6),
    marginBottom: verticalScale(20),
  },

  starsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(2),
  },
  ratingLabel: {
    color: COLORS.light,
    fontFamily: FONT,
    fontSize: moderateScale(14),
    fontWeight: '600',
    marginLeft: scale(10),
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: verticalScale(22),
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerMoon: {
    color: COLORS.muted,
    fontSize: moderateScale(16),
    paddingHorizontal: scale(12),
  },

  sectionLabel: {
    color: COLORS.muted,
    fontFamily: FONT,
    fontSize: moderateScale(10),
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: verticalScale(10),
    textTransform: 'uppercase',
  },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8) },
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
    backgroundColor: 'rgba(124,111,212,0.18)',
  },
  chipText: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    fontWeight: '500',
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
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '600',
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontFamily: FONT,
    fontSize: moderateScale(15),
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnDisabled: { opacity: 0.45 },

  // Confirmation states
  statePanel: {
    flex: 1,
    paddingHorizontal: scale(28),
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '700',
    textAlign: 'center',
  },
  stateBody: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(14),
    textAlign: 'center',
    marginTop: verticalScale(10),
    marginBottom: verticalScale(28),
    lineHeight: moderateScale(20),
  },
  linkBtn: { marginTop: verticalScale(14), padding: scale(8) },
  linkText: {
    color: COLORS.muted,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    textDecorationLine: 'underline',
  },
});
