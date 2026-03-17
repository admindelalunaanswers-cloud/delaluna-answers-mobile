import React, { useEffect, useRef, useState } from 'react';

import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';

import { router } from 'expo-router';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getFirestore, updateDoc } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DateSwitcher from '@/src/components/home/date-switcher.component';
import HeaderNav from '@/src/components/shared/header-nav';
import HomeSignsDisplay from '@/src/components/shared/signs-display.component';
import HomeTextBox from '@/src/components/home/home-text-box.component';
// import PaygateOverlay from '@/src/components/shared/paygate-overlay.component';
import SectionTitle from '@/src/components/shared/section-title.component';
import type { DailyCardPack } from '@/src/schemas/dailyCardPack.schema';
import type { HoroscopeResult } from '@/src/types/horoscope.types';
import { ChatStore } from '@/src/stores/chat-store';
import { HOME_STRINGS } from '@/src/constants/strings';
import { ThemedView } from '@/src/components/themed-view';
import { calculateTransits } from '@/src/services/astroEngine';
import { fetchHoroscope, getTodayDateId } from '@/src/services/horoscope.service';
import { scheduleBreakdownReadyNotification } from '@/src/services/notifications.service';
import { getTarotCardDraw } from '@/src/services/tarot-card.service';
// import { updateUserDoc } from '@/src/services/user.service';
import { useHoroscope } from '@/src/context/horoscope-context';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';
import { useResponsive } from '@/src/hooks/use-responsive';
import { useUser } from '@/src/context/user-context';

const NAV_BAR_HEIGHT = 44;

export default function HomeScreen() {
  const { authUser, userDoc } = useUser();
  const {
    chartDetails,
    horoscope,
    transitMoon,
    breakdown,
    refresh,
  } = useHoroscope();

  const breakdownNotifiedRef = useRef(false);

  // Fire "birth chart ready" notification once per user, as soon as breakdown
  // is available on this screen — whether it arrived from prefetch or subscription.
  useEffect(() => {
    if (!breakdown || !authUser?.uid) return;
    if (breakdownNotifiedRef.current) return;

    const key = `@delaluna/breakdown_notified_${authUser.uid}`;
    AsyncStorage.getItem(key)
      .then(sent => {
        if (sent === 'true') { breakdownNotifiedRef.current = true; return; }
        breakdownNotifiedRef.current = true;
        AsyncStorage.setItem(key, 'true').catch(console.error);
        scheduleBreakdownReadyNotification().catch(console.error);
      })
      .catch(console.error);
  }, [breakdown, authUser?.uid]);

  const todayDateId = getTodayDateId();
  const [selectedDate, setSelectedDate] = useState(todayDateId);
  const [cardDraw, setCardDraw] = useState<Record<string, DailyCardPack>>({});
  const [horoscopeByDate, setHoroscopeByDate] = useState<Record<string, HoroscopeResult>>({});
  const [moonByDate, setMoonByDate] = useState<Record<string, { phaseName: string; illumination: number; moonSign: string }>>({});

  useEffect(() => {
    if (!authUser) return;

    getTarotCardDraw(authUser.uid, 3)
      .then(draw => {
        const packs = draw as unknown as { yesterday: DailyCardPack; today: DailyCardPack; tomorrow: DailyCardPack };
        setCardDraw({
          [packs.yesterday.date]: packs.yesterday,
          [packs.today.date]:     packs.today,
          [packs.tomorrow.date]:  packs.tomorrow,
        });
      })
      .catch(console.error);

    const offset = (days: number) => {
      const d = new Date();
      d.setDate(d.getDate() + days);
      return {
        dateId: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        date: d,
      };
    };

    const { dateId: yesterdayId, date: yesterdayDate } = offset(-1);
    const { dateId: tomorrowId,  date: tomorrowDate  } = offset(+1);

    Promise.all([
      fetchHoroscope(authUser.uid, yesterdayId),
      fetchHoroscope(authUser.uid, tomorrowId),
      calculateTransits(yesterdayDate, 0, 0),
      calculateTransits(tomorrowDate,  0, 0),
    ]).then(([yest, tmrw, yestTransits, tmrwTransits]) => {
      setHoroscopeByDate(prev => ({
        ...prev,
        ...(yest.result ? { [yesterdayId]: yest.result } : {}),
        ...(tmrw.result ? { [tomorrowId]:  tmrw.result } : {}),
      }));
      setMoonByDate(prev => ({
        ...prev,
        [yesterdayId]: { phaseName: yestTransits.moon.phase, illumination: yestTransits.moon.illumination, moonSign: yestTransits.moon.sign },
        [tomorrowId]:  { phaseName: tmrwTransits.moon.phase, illumination: tmrwTransits.moon.illumination, moonSign: tmrwTransits.moon.sign },
      }));
    }).catch(console.error);
  }, [authUser?.uid]);

  // Keep today's horoscope and moon in the by-date maps
  useEffect(() => {
    if (horoscope) setHoroscopeByDate(prev => ({ ...prev, [todayDateId]: horoscope }));
  }, [horoscope]);

  useEffect(() => {
    if (transitMoon) {
      setMoonByDate(prev => ({
        ...prev,
        [todayDateId]: { phaseName: transitMoon.phase, illumination: transitMoon.illumination, moonSign: transitMoon.sign },
      }));
    }
  }, [transitMoon]);

  const activeCards = cardDraw[selectedDate] ?? null;
  const activeHoroscope = horoscopeByDate[selectedDate] ?? null;

  const handleCardReveal = async () => {
    if (!authUser || !activeCards) return;
    const db = getFirestore();
    await updateDoc(doc(db, 'users', authUser.uid, 'cards', selectedDate), { firstView: true });
    setCardDraw(prev => ({
      ...prev,
      [selectedDate]: { ...prev[selectedDate], firstView: true },
    }));
  };

  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  // ─── Pull-to-refresh ────────────────────────────────────────────────────────

  const { refreshControl } = usePullToRefresh(refresh);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const sunSign    = chartDetails?.planets.find(p => p.name === 'Sun')?.sign  ?? '—';
  const moonSign   = chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '—';
  const risingSign = chartDetails?.ascendant.sign ?? '—';

  const activeMoonData = moonByDate[selectedDate];

  const retrogrades = (activeHoroscope?.planetsRetrograde ?? []).filter(p => p.toLowerCase() !== 'none');

  const dateSwitcherDates = Object.keys(cardDraw).sort();

  // DEV: toggle to simulate free vs premium reading
  const [devPremium, setDevPremium] = useState(true);
  // const isPaygated = selectedDate !== todayDateId && !devPremium;

  // const handleUnlock = async () => {
  //   if (!authUser?.uid) return;
  //   await updateUserDoc(authUser.uid, { isPremiumMember: true });
  //   await refreshUser();
  // };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title={userDoc?.fullName ?? 'Home'}
        rightIconName="person-circle-outline"
        onRightPress={() => router.push('/profile')}
      />

      <View style={[styles.content, { paddingTop: headerHeight }]}>
        <HomeSignsDisplay
          sun={sunSign}
          moon={moonSign}
          rising={risingSign}
          showViewChart={true}
          birthChartReady={!!chartDetails && !!breakdown}
        />
        <DateSwitcher
          value={selectedDate}
          dates={dateSwitcherDates.length > 0 ? dateSwitcherDates : [todayDateId]}
          onChange={setSelectedDate}
        />

        {/* DEV: free/premium toggle */}
        <View style={styles.devToggle}>
          <Text style={styles.devToggleLabel}>Free</Text>
          <Switch value={devPremium} onValueChange={setDevPremium} />
          <Text style={styles.devToggleLabel}>Premium</Text>
        </View>

        {/* <PaygateOverlay
          locked={isPaygated}
          style={{ flex: 1 }}
          unlockTitle="Unlock Past & Future Readings"
          unlockMessage="Upgrade to Premium to view yesterday's and tomorrow's horoscope."
        > */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + scale(20) }]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <SectionTitle sectionName="quote" title="Quote" />
          <HomeTextBox sectionName="quote" content={activeHoroscope?.quote} />

          <SectionTitle sectionName="advice" title="Advice" />
          <HomeTextBox sectionName="advice" content={activeHoroscope?.advice} />

          <SectionTitle sectionName="dos" title="Do's" />
          <HomeTextBox sectionName="dos" content={activeHoroscope?.do ?? []} />

          <SectionTitle sectionName="donts" title="Don'ts" />
          <HomeTextBox sectionName="donts" content={activeHoroscope?.dont ?? []} />

          <SectionTitle sectionName="affirmation" title="Affirmation" />
          <HomeTextBox sectionName="affirmation" content={activeHoroscope?.affirmation} />

          <SectionTitle sectionName="tarot" title="Today's Cards" />
          <HomeTextBox
            sectionName="tarot"
            content={activeHoroscope?.tarot}
            cards={activeCards?.cards}
            firstView={activeCards?.firstView}
            onReveal={handleCardReveal}
          />

          <SectionTitle sectionName="message" title="Message in a Bottle" />
          <HomeTextBox sectionName="message" />

          <SectionTitle sectionName="moon" title="Moon Phase" />
          <HomeTextBox
            sectionName="moon"
            content={activeHoroscope?.moonPhaseDetails}
            contentTwo={activeHoroscope?.moon}
            moonData={activeMoonData}
          />

          <SectionTitle sectionName="retrograde" title="Planets in Retrograde" />
          <HomeTextBox sectionName="retrograde" content={retrogrades} />

          <SectionTitle sectionName="newLove" title="New Love" />
          <Text style={styles.sectionDefinition}>{HOME_STRINGS.newLove.definition}</Text>
          <HomeTextBox sectionName="newLove" content={activeHoroscope?.newLove ?? []} />
          <TouchableOpacity
            style={styles.questionButton}
            onPress={() => { ChatStore.setInitialMessage(HOME_STRINGS.newLove.questionFunnel); router.push('/(main)/chat'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.questionButtonText}>{HOME_STRINGS.newLove.questionFunnel}</Text>
          </TouchableOpacity>

          <SectionTitle sectionName="returns" title="Returns" />
          <Text style={styles.sectionDefinition}>{HOME_STRINGS.returns.definition}</Text>
          <HomeTextBox sectionName="returns" content={activeHoroscope?.returns ?? []} />
          <TouchableOpacity
            style={styles.questionButton}
            onPress={() => { ChatStore.setInitialMessage(HOME_STRINGS.returns.questionFunnel1); router.push('/(main)/chat'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.questionButtonText}>{HOME_STRINGS.returns.questionFunnel1}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.questionButton, { marginTop: 8 }]}
            onPress={() => { ChatStore.setInitialMessage(HOME_STRINGS.returns.questionFunnel2); router.push('/(main)/chat'); }}
            activeOpacity={0.7}
          >
            <Text style={styles.questionButtonText}>{HOME_STRINGS.returns.questionFunnel2}</Text>
          </TouchableOpacity>

          <SectionTitle sectionName="luckyNumbers" title="Lucky Numbers" />
          <HomeTextBox sectionName="luckyNumbers" content={activeHoroscope?.luckyNumbers ?? []} />

          <SectionTitle sectionName="warning" title="Warning" />
          <HomeTextBox sectionName="warning" content={activeHoroscope?.warning} />
        </ScrollView>
        {/* </PaygateOverlay> */}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
  },
  content: {
    flex: 1,
    width: '100%',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  generatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  generatingText: {
    color: '#BCA8F4',
    fontSize: 14,
  },
  sectionDefinition: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    lineHeight: 18,
    marginTop: -8,
    marginBottom: 8,
    textAlign: 'center',
  },
  questionButton: {
    borderWidth: 1,
    borderColor: 'rgba(188,168,244,0.35)',
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 24,
    backgroundColor: 'rgba(188,168,244,0.07)',
  },
  questionButtonText: {
    color: '#BCA8F4',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  devToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  devToggleLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
  },
});
