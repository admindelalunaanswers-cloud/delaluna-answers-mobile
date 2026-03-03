import { ScrollView, StyleSheet } from 'react-native';

import { useSafeAreaInsets } from 'react-native-safe-area-context';

import HeaderNav from '@/src/components/shared/header-nav';
import SectionTitle from '@/src/components/shared/section-title.component';
import HomeTextBox from '@/src/components/home/home-text-box.component';
import { ThemedView } from '@/src/components/themed-view';
import { useHoroscope } from '@/src/context/horoscope-context';
import { useResponsive } from '@/src/hooks/use-responsive';
import { usePullToRefresh } from '@/src/hooks/use-pull-to-refresh';

import LoadingScreen from '../(util)/loading-screen';

const NAV_BAR_HEIGHT = 44;

export default function TransitsScreen() {
  const {
    transitMoon,
    transitRetrogrades,
    transitReading,
    loading,
    refresh,
  } = useHoroscope();

  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  const { refreshControl } = usePullToRefresh(refresh);

  // ─── Derived values ─────────────────────────────────────────────────────────

  const moonData = transitMoon
    ? {
        phaseName:    transitMoon.phase,
        illumination: transitMoon.illumination,
        moonSign:     transitMoon.sign,
      }
    : undefined;

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <ThemedView style={styles.container}>
      <HeaderNav title="Transits" />

      {loading ? <LoadingScreen /> : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingTop: headerHeight + 12, paddingBottom: insets.bottom + scale(80) },
          ]}
          refreshControl={refreshControl}
          showsVerticalScrollIndicator={false}
        >
          <SectionTitle sectionName="quote" title="Quote" />
          <HomeTextBox sectionName="quote" content={transitReading?.quote} />

          <SectionTitle sectionName="moon" title="Moon Phase" />
          <HomeTextBox sectionName="moon" moonData={moonData} />

          <SectionTitle sectionName="retrograde" title="Planets in Retrograde" />
          <HomeTextBox sectionName="retrograde" content={transitRetrogrades} />

          <SectionTitle sectionName="advice" title="Today's Transits" />
          <HomeTextBox sectionName="advice" content={transitReading?.overview} />

          <SectionTitle sectionName="dos" title="Themes" />
          <HomeTextBox sectionName="dos" content={transitReading?.themes ?? []} />

          <SectionTitle sectionName="newLove" title="Love Transits" />
          <HomeTextBox sectionName="newLove" content={transitReading?.loveTransits} />

          <SectionTitle sectionName="returns" title="Career Transits" />
          <HomeTextBox sectionName="returns" content={transitReading?.careerTransits} />

          <SectionTitle sectionName="affirmation" title="Advice" />
          <HomeTextBox sectionName="affirmation" content={transitReading?.advice} />

          <SectionTitle sectionName="warning" title="Warning" />
          <HomeTextBox sectionName="warning" content={transitReading?.warning} />

          <SectionTitle sectionName="affirmation" title="Affirmation" />
          <HomeTextBox sectionName="affirmation" content={transitReading?.affirmation} />

          <SectionTitle sectionName="tarot" title="Unlock More" />
          <HomeTextBox sectionName="tarot" content={transitReading?.teaser} />

          <SectionTitle sectionName="message" title="Release" />
          <HomeTextBox sectionName="message" content={transitReading?.release} />
        </ScrollView>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, justifyContent: 'flex-start' },
  scroll:        { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
});
