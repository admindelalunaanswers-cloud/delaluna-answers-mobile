import { Tabs } from 'expo-router';
import { useWindowDimensions } from 'react-native';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useTheme } from '@/src/hooks/use-theme';
import { UserProvider, useUser } from '@/src/context/user-context';

export default function TabLayout() {
  const { theme: { colors: C } } = useTheme();
  const { width } = useWindowDimensions();
  const { userDoc } = useUser();
  // Scale icon size from base 28 on 375px width, clamped between 22–36
  const iconSize = Math.round(Math.min(Math.max((width / 375) * 28, 22), 36));
  // Ionicons font glyphs render visually larger than PNG images at the same size
  const ionIconSize = Math.round(iconSize * 0.82);

  return (
    <UserProvider>
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
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/connections.png')} size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transits"
        options={{
          title: 'Transits',
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/transits.png')} size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/chat.png')} size={iconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          href: userDoc?.isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <IconSymbol name="shield" size={ionIconSize} color={color} />,
        }}
      />
      <Tabs.Screen
        name="prompt-editor"
        options={{ href: null }}
      />
    </Tabs>
    </UserProvider>
  );
}
