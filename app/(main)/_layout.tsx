import { router, Tabs, usePathname } from 'expo-router';
import { useWindowDimensions, View } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import TourOverlay, { useTourCoversScreen } from '@/src/components/tour/tour-overlay';
import { TourTarget } from '@/src/components/tour/tour-target';
import WhatsNewSheet from '@/src/components/whats-new-sheet';
import { TOUR_TARGETS } from '@/src/constants/tour';
import { useTheme } from '@/src/hooks/use-theme';
import { useWhatsNew } from '@/src/hooks/use-whats-new';

/**
 * Shown on the Home tab only: a push that deep-links to Chat or a connection
 * opens that screen, and the sheet waits for the next visit to Home.
 */
function WhatsNewOnHome() {
  const pathname = usePathname();
  const { visible, release, items, close, openItem } = useWhatsNew(pathname === '/');
  return (
    <WhatsNewSheet
      visible={visible}
      release={release}
      items={items}
      onClose={close}
      onItemPress={(item) => {
        openItem(item);
        if (item.cta) router.push(item.cta.route);
      }}
    />
  );
}

export default function TabLayout() {
  const { theme: { colors: C } } = useTheme();
  const { width } = useWindowDimensions();
  // Scale icon size from base 28 on 375px width, clamped between 22–36
  const iconSize = Math.round(Math.min(Math.max((width / 375) * 28, 22), 36));
  // While the tour covers the screen, the app under it is out of reach for
  // TalkBack too (iOS gets that from the overlay's accessibilityViewIsModal).
  const tourCovers = useTourCoversScreen();

  return (
    <>
      <View
        style={{ flex: 1 }}
        importantForAccessibility={tourCovers ? 'no-hide-descendants' : 'auto'}
        accessibilityElementsHidden={tourCovers}
      >
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: C.activeTab,
          tabBarInactiveTintColor: C.inactiveTabs,
          headerShown: false,
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarStyle: {
              backgroundColor: C.headerBg,
              borderTopColor: 'transparent',
            },
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/home.png')} size={iconSize} color={color} />,
          }}
        />
        <Tabs.Screen
          name="connections"
          options={{
            title: 'Connections',
            tabBarIcon: ({ color }) => (
              <TourTarget id={TOUR_TARGETS.tabConnections}>
                <IconSymbol name={require('@/src/assets/tabs/connections.png')} size={iconSize} color={color} />
              </TourTarget>
            ),
          }}
        />
        <Tabs.Screen
          name="transits"
          options={{
            title: 'Transits',
            tabBarIcon: ({ color }) => (
              <TourTarget id={TOUR_TARGETS.tabTransits}>
                <IconSymbol name={require('@/src/assets/tabs/transits.png')} size={iconSize} color={color} />
              </TourTarget>
            ),
          }}
        />
        <Tabs.Screen
          name="chat"
          options={{
            title: 'Chat',
            tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/chat.png')} size={iconSize} color={color} />,
          }}
        />
      </Tabs>
      </View>
      <WhatsNewOnHome />
      <TourOverlay />
    </>
  );
}
