import { db } from '@/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View, ScrollView, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '@/src/hooks/use-responsive';

import DateSwitcher from '@/src/components/home/date-switcher.component';
import HeaderNav from '@/src/components/shared/header-nav';
import HomeSignsDisplay from '@/src/components/shared/signs-display.component';
import { ThemedView } from '@/src/components/themed-view';
import { useUser } from '@/src/context/user-context';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import Ionicons from '@expo/vector-icons/Ionicons';
import SectionTitle from '@/src/components/shared/section-title.component';

const NAV_BAR_HEIGHT = 44;

export default function HomeScreen() {
  const { authUser, userDoc, loading: userLoading } = useUser();
  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);
  const [chartDetails, setChartDetails] = useState<NatalChartDetailsDoc | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  useEffect(() => {
    setChartLoading(true);
    getDoc(doc(db, 'users', 'seed-user-001', 'natalChart', 'details'))
      .then(snap => setChartDetails(snap.exists() ? (snap.data() as NatalChartDetailsDoc) : null))
      .catch(() => setChartDetails(null))
      .finally(() => setChartLoading(false));
  }, []);

  const loading    = userLoading || chartLoading;
  const sunSign    = chartDetails?.planets.find(p => p.name === 'Sun')?.sign  ?? '—';
  const moonSign   = chartDetails?.planets.find(p => p.name === 'Moon')?.sign ?? '—';
  const risingSign = chartDetails?.ascendant.sign ?? '—';

  const today = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  function handleDefinitionButtonPress(questionFunnel2: any): void {
    throw new Error('Function not implemented.');
  }

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title={userDoc?.name ?? 'Home'}
        rightIconName="person-circle-outline"
        onRightPress={() => console.log('go to profile')}
      />
      
        <View style={[styles.content, { paddingTop: headerHeight }]}>
          <HomeSignsDisplay
            sun={sunSign}
            moon={moonSign}
            rising={risingSign}
            showViewChart={true}
            birthChartReady={!!chartDetails}
          />
          <DateSwitcher
            value={today}
            dates={[today]}
            onChange={(date) => console.log('selected date', date)}
          />
          <ScrollView style={styles.scroll}>
            <SectionTitle sectionName="quote" title="Quote" />


            <SectionTitle sectionName="advice" title="Advice" />

            <SectionTitle sectionName="dos" title="Do's" />

              <SectionTitle sectionName="donts" title="Don'ts" />

              <SectionTitle sectionName="affirmation" title="Affirmation" />

              <SectionTitle sectionName="tarot" title="Today's Cards" />

              <SectionTitle sectionName="message" title="Message in a Bottle" />

              <SectionTitle sectionName="moon" title="Moon Phase" />

              <SectionTitle sectionName="retrograde" title="Planets in Retrograde" />

              <SectionTitle sectionName="newLove" title="New Love" />

              <SectionTitle sectionName="returns" title="Returns" />
              
              <SectionTitle sectionName="warning" title="Warning" />
          </ScrollView>
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
  // paddingTop applied inline using headerHeight from hooks
  scroll: {
    flex: 1,
  },
});
