import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Text } from '@/src/components/app-text';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HeaderNav from '@/src/components/shared/header-nav';
import { C } from '@/src/constants/theme';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const COLORS = {
  card: 'rgba(255,255,255,0.06)', // translucent so the theme background shows through, as on Profile
  border: 'rgba(255,255,255,0.1)',
  light: C.purpleLight,
  muted: C.purple, // icons and dividers only — too low-contrast for text
  mutedText: 'rgba(255,255,255,0.7)', // matches Profile; sits on the theme image, not a flat fill
  text: C.white,
  subText: 'rgba(255,255,255,0.7)',
  available: '#4ade80',
};

const FONT = Platform.select({ ios: 'DMSans-Regular', android: 'DMSans-Regular', default: undefined });

const NAV_BAR_HEIGHT = 44;

const SUPPORT_EMAIL = 'hello@delaluna.app';
const TERMS_URL = 'https://delaluna.app/terms';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I read my birth chart?',
    // The wheel has no touch targets — this used to say "tap any planet or sign on the wheel".
    a: 'Your birth chart maps where every planet was at the moment you were born. Open it with View Chart on Home: the Natal Table lists every placement, and the tabs below explain what each one means for you. Start with the Sun, Moon, and Rising — they form your core trio.',
  },
  {
    q: 'Why is my horoscope the same as yesterday?',
    // Home has no pull-to-refresh — this used to tell users to pull. A cold start recomputes today's date.
    a: 'Daily horoscopes refresh once per 24 hours, at midnight in your local time. If yesterday\'s reading still appears, close the app fully and reopen it — the new reading should appear within a moment.',
  },
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes — anytime. Subscriptions are billed through Apple or Google. Open your device\'s subscription settings, or tap "Manage Subscription" on your profile to be taken there directly.',
  },
];

type RowProps = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  onPress: () => void;
  iconColor?: string;
  rightAccessory?: React.ReactNode;
  loading?: boolean;
};

function ContactRow({ icon, title, subtitle, onPress, iconColor, rightAccessory, loading }: RowProps) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      style={s.row}
      accessibilityRole="button"
      // While loading it was still tappable (a second restore) and the spinner unannounced
      disabled={loading}
      accessibilityState={{ disabled: !!loading, busy: !!loading }}
    >
      <View style={s.rowIconWrap}>
        <Ionicons name={icon} size={moderateScale(20)} color={iconColor ?? COLORS.light} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.light} accessibilityLabel="Working" />
      ) : (
        rightAccessory ?? (
          <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.muted} />
        )
      )}
    </TouchableOpacity>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel} accessibilityRole="header">{children}</Text>;
}

function MoonDivider() {
  return (
    // Decorative — the ☽ was read aloud between every section
    <View style={s.dividerRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={s.dividerLine} />
      <Text style={s.dividerMoon}>☽</Text>
      <View style={s.dividerLine} />
    </View>
  );
}

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { restorePurchases } = useRevenueCat();
  const [restoring, setRestoring] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const appVersion =
    Constants.expoConfig?.version ?? Constants.manifest2?.extra?.expoClient?.version ?? '1.0.0';

  const handleEmailSupport = () => {
    const subject = encodeURIComponent('Delaluna Support');
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}`).catch(() => {
      Alert.alert('Email unavailable', `Reach us at ${SUPPORT_EMAIL}`);
    });
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const ok = await restorePurchases();
      Alert.alert(
        ok ? 'Purchases restored' : 'No purchases found',
        ok ? 'Your premium access has been restored.' : 'We didn\'t find any prior purchases on this account.'
      );
    } catch {
      Alert.alert('Restore failed', 'We couldn\'t restore purchases. Please try again later.');
    } finally {
      setRestoring(false);
    }
  };

  const handleReportBug = () => {
    const subject = encodeURIComponent('Delaluna Bug Report');
    const body = encodeURIComponent(
      `Describe the issue:\n\n\n— App version: ${appVersion}\n— Platform: ${Platform.OS} ${Platform.Version}`
    );
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`).catch(() => {
      Alert.alert('Email unavailable', `Reach us at ${SUPPORT_EMAIL}`);
    });
  };

  const handleTerms = () => {
    // Swallowed before, so a failure looked like the link doing nothing
    Linking.openURL(TERMS_URL).catch(() => {
      Alert.alert('Link unavailable', `You can read them at ${TERMS_URL}`);
    });
  };

  return (
    <View style={s.root}>
      <HeaderNav
        title="Support"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
      />
      <ScrollView
        style={[s.scroll, { marginTop: insets.top + scale(NAV_BAR_HEIGHT) }]}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        <SectionLabel>CONTACT</SectionLabel>
        <View style={s.card}>
          <ContactRow
            icon="mail-outline"
            title="Email Support"
            subtitle={SUPPORT_EMAIL}
            onPress={handleEmailSupport}
          />
          <View style={s.rowDivider} />
          
        </View>

        <MoonDivider />

        <SectionLabel>ACCOUNT HELP</SectionLabel>
        <View style={s.card}>
          <ContactRow
            icon="refresh-outline"
            title="Restore Purchases"
            subtitle="Recover a previous subscription"
            onPress={handleRestore}
            loading={restoring}
          />
          <View style={s.rowDivider} />
          <ContactRow
            icon="bug-outline"
            title="Report a Bug"
            subtitle="Tell us what went wrong"
            onPress={handleReportBug}
          />
        </View>

        <MoonDivider />

        <SectionLabel>FREQUENTLY ASKED</SectionLabel>
        <View style={s.card}>
          {FAQ.map((item, i) => {
            const open = openFaq === i;
            return (
              <View key={item.q}>
                <TouchableOpacity
                  onPress={() => setOpenFaq(open ? null : i)}
                  activeOpacity={0.75}
                  style={s.faqRow}
                  // Open / closed was only the chevron
                  accessibilityRole="button"
                  accessibilityState={{ expanded: open }}
                >
                  <Text style={s.faqQuestion}>{item.q}</Text>
                  <Ionicons
                    name={open ? 'chevron-up' : 'chevron-down'}
                    size={moderateScale(18)}
                    color={COLORS.muted}
                  />
                </TouchableOpacity>
                {open && <Text style={s.faqAnswer}>{item.a}</Text>}
                {i < FAQ.length - 1 && <View style={s.rowDivider} />}
              </View>
            );
          })}
        </View>

        <View style={s.footer}>
          <Text style={s.footerVersion}>Delaluna · v{appVersion}</Text>
          <TouchableOpacity
            onPress={handleTerms}
            accessibilityRole="link"
            accessibilityHint="Opens in your browser"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Text style={s.footerLink}>Terms & Privacy</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: verticalScale(40) }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingHorizontal: scale(20), paddingTop: verticalScale(20) },

  sectionLabel: {
    color: COLORS.mutedText,
    fontFamily: FONT,
    fontSize: moderateScale(10),
    fontWeight: '700',
    letterSpacing: 1.4,
    marginBottom: verticalScale(10),
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: scale(16),
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(14),
    gap: scale(12),
  },
  rowIconWrap: {
    width: scale(36),
    height: scale(36),
    borderRadius: scale(18),
    backgroundColor: 'rgba(139,111,200,0.18)', // C.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: moderateScale(15),
    fontWeight: '600',
  },
  rowSubtitle: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(12),
    marginTop: 2,
  },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.border,
    marginLeft: scale(14) + scale(36) + scale(12),
  },

  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  statusDot: {
    width: scale(8),
    height: scale(8),
    borderRadius: scale(4),
    backgroundColor: COLORS.available,
    shadowColor: COLORS.available,
    shadowOpacity: 0.6,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
  statusText: {
    color: COLORS.available,
    fontFamily: FONT,
    fontSize: moderateScale(11),
    fontWeight: '600',
  },

  faqRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(14),
    gap: scale(12),
  },
  faqQuestion: {
    flex: 1,
    color: COLORS.text,
    fontFamily: FONT,
    fontSize: moderateScale(14),
    fontWeight: '600',
  },
  faqAnswer: {
    color: COLORS.subText,
    fontFamily: FONT,
    fontSize: moderateScale(13),
    lineHeight: moderateScale(20),
    paddingHorizontal: scale(16),
    paddingBottom: verticalScale(14),
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

  footer: {
    alignItems: 'center',
    marginTop: verticalScale(28),
    gap: verticalScale(6),
  },
  footerVersion: {
    color: COLORS.mutedText,
    fontFamily: FONT,
    fontSize: moderateScale(12),
  },
  footerLink: {
    color: COLORS.light,
    fontFamily: FONT,
    fontSize: moderateScale(12),
    textDecorationLine: 'underline',
  },
});
