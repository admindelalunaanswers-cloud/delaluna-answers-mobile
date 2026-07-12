import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Linking,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import HeaderNav from '@/src/components/shared/header-nav';
import { useRevenueCat } from '@/src/context/revenuecat-context';
import { scale, verticalScale, moderateScale } from '@/src/utils/responsive';

const COLORS = {
  bg: '#0e0b1a',
  header: '#110d22',
  card: '#1a1535',
  border: '#2a2050',
  primary: '#7c6fd4',
  light: '#c8bfff',
  muted: '#6b5fa8',
  text: '#ffffff',
  subText: 'rgba(200,191,255,0.65)',
  available: '#4ade80',
};

const FONT = Platform.select({ ios: 'DMSans-Regular', android: 'DMSans-Regular', default: undefined });

const NAV_BAR_HEIGHT = 44;

const SUPPORT_EMAIL = 'hello@delaluna.app';
const TERMS_URL = 'https://delaluna.app/terms';

const FAQ: { q: string; a: string }[] = [
  {
    q: 'How do I read my birth chart?',
    a: 'Your birth chart maps where every planet was at the moment you were born. Tap any planet or sign on the wheel to see what it means in your life. Start with the Sun, Moon, and Rising — they form your core trio.',
  },
  {
    q: 'Why is my horoscope the same as yesterday?',
    a: 'Daily horoscopes refresh once per 24 hours, based on your local time at midnight. If yesterday\'s message still appears, pull to refresh — the new reading should appear within a moment.',
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
    <TouchableOpacity onPress={onPress} activeOpacity={0.75} style={s.row}>
      <View style={s.rowIconWrap}>
        <Ionicons name={icon} size={moderateScale(20)} color={iconColor ?? COLORS.light} />
      </View>
      <View style={s.flex}>
        <Text style={s.rowTitle}>{title}</Text>
        {subtitle ? <Text style={s.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {loading ? (
        <ActivityIndicator color={COLORS.light} />
      ) : (
        rightAccessory ?? (
          <Ionicons name="chevron-forward" size={moderateScale(18)} color={COLORS.muted} />
        )
      )}
    </TouchableOpacity>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={s.sectionLabel}>{children}</Text>;
}

function MoonDivider() {
  return (
    <View style={s.dividerRow}>
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

  const handleLiveChat = () => {
    Alert.alert(
      'Live Chat',
      'Our team is online. Live chat will open in a moment.',
      [{ text: 'OK' }]
    );
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
    Linking.openURL(TERMS_URL).catch(() => {});
  };

  return (
    <View style={s.root}>
      <HeaderNav
        title="Support"
        leftIconName="chevron-back-outline"
        onLeftPress={() => router.back()}
        backgroundColor={COLORS.header}
        textColor={COLORS.light}
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
          <TouchableOpacity onPress={handleTerms}>
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
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1 },
  content: { paddingHorizontal: scale(20), paddingTop: verticalScale(20) },

  sectionLabel: {
    color: COLORS.muted,
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
    backgroundColor: 'rgba(124,111,212,0.18)',
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
    color: COLORS.muted,
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
