import { Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/src/components/themed-text';
import { ThemedView } from '@/src/components/themed-view';
import { useState } from 'react';
import HeaderNav from '@/src/components/shared/header-nav';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useResponsive } from '@/src/hooks/use-responsive';

const NAV_BAR_HEIGHT = 44;

export default function BirthChartScreen() {
  const [activeTab, setActiveTab] = useState<"Natal Wheel" | "Natal Table">("Natal Wheel");
  const insets = useSafeAreaInsets();
  const { scale } = useResponsive();
  const headerHeight = insets.top + scale(NAV_BAR_HEIGHT);

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
        {/* Top Half */}
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
              <ThemedText>Natal Wheel View</ThemedText>
            ) : (
              <ThemedText>Natal Table View</ThemedText>
            )}
          </ThemedView>
        </ThemedView>

        {/* Bottom Half */}
        <ThemedView style={styles.bottomSection}>
          <ThemedText type="title">Breakdown</ThemedText>
        </ThemedView>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, justifyContent: 'flex-start' },
  content:       { flex: 1, width: '100%' },
  topSection:    { flex: 1 },
  tabList:       { flexDirection: 'row' },
  tab:           { flex: 1, padding: 12, alignItems: 'center' },
  activeTab:     { borderBottomWidth: 2, borderBottomColor: 'purple' },
  tabContent:    { flex: 1 },
  bottomSection: { flex: 1 },
});