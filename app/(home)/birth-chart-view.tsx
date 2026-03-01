import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { useState, useEffect } from 'react';
import HeaderNav from '@/src/components/shared/header-nav';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '@/src/hooks/use-responsive';
import { db } from '@/firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import type { NatalChartDetailsDoc } from '@/src/types/user.type';
import type { NatalChart } from '@/src/services/astroEngine';
import LoadingScreen from '../(util)/loading-screen';
import NatalWheelTab from '@/src/components/natalChart/natal-chart-wheel';
import NatalTable from '@/src/components/natalChart/natal-chart-table';

const NAV_BAR_HEIGHT = 44;

export default function BirthChartScreen() {
  const [activeTab, setActiveTab] = useState<"Natal Wheel" | "Natal Table">("Natal Wheel");
  const [chartDetails, setChartDetails] = useState<NatalChartDetailsDoc | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

  useEffect(() => {
    setChartLoading(true);
    getDoc(doc(db, 'users', 'seed-user-001', 'natalChart', 'details'))
      .then(snap => setChartDetails(snap.exists() ? (snap.data() as NatalChartDetailsDoc) : null))
      .catch(() => setChartDetails(null))
      .finally(() => setChartLoading(false));
  }, []);

  function goToHome(): void {
    router.back();
  }

  return (
    <ThemedView style={styles.container}>
      <HeaderNav
        title={'Natal Chart'}
        leftIconName="chevron-back-outline"
        onLeftPress={() => goToHome()}
      />

      <View style={[styles.content, { paddingTop: headerHeight }]}>
        {chartLoading ? <LoadingScreen /> : (
          <>
            {/* Top Half — Tabs */}
            <ThemedView style={styles.topSection}>

              {/* Tab Buttons */}
              <ThemedView style={styles.tabList}>
                <Pressable
                  style={[styles.tab, activeTab === "Natal Wheel" && styles.activeTab]}
                  onPress={() => setActiveTab("Natal Wheel")}
                >
                  <ThemedText type="defaultSemiBold">Natal Wheel</ThemedText>
                </Pressable>
                <Pressable
                  style={[styles.tab, activeTab === "Natal Table" && styles.activeTab]}
                  onPress={() => setActiveTab("Natal Table")}
                >
                  <ThemedText type="defaultSemiBold">Natal Table</ThemedText>
                </Pressable>
              </ThemedView>

              {/* Tab Content */}
              <ThemedView style={styles.tabContent}>
                {activeTab === "Natal Wheel" ? (
                  chartDetails ? (
                    <NatalWheelTab natalChart={chartDetails as unknown as NatalChart} />
                  ) : (
                    <ThemedText>No chart data available.</ThemedText>
                  )
                ) : (
                  chartDetails ? (
                    <NatalTable
                      planets={chartDetails.planets as unknown as NatalChart['planets']}
                      asc={chartDetails.ascendant}
                    />
                  ) : (
                    <ThemedText>No chart data available.</ThemedText>
                  )
                )}
              </ThemedView>
            </ThemedView>

            {/* Bottom Half — Breakdown */}
            <ThemedView style={styles.bottomSection}>
              <ThemedText type="title">Breakdown</ThemedText>
            </ThemedView>
          </>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, justifyContent: 'flex-start' },
  content:       { flex: 1, width: '100%',  },
  topSection:    { flex: 1 },
  tabList:       { flexDirection: 'row', padding: 12, },
  tab:           { flex: 1, padding: 12, alignItems: 'center' },
  activeTab:     { borderBottomWidth: 2, borderBottomColor: '#5BC0BE' },
  tabContent:    { flex: 1 },
  bottomSection: { flex: 1, paddingTop: 45, justifyContent: 'flex-start', paddingHorizontal: 15,},
});