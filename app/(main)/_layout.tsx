import { Tabs } from 'expo-router';

import { IconSymbol } from '@/src/components/ui/icon-symbol';
import { useTheme } from '@/src/hooks/use-theme';
import { UserProvider } from '@/src/context/user-context';

export default function TabLayout() {
  const { theme: { colors: C } } = useTheme();

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
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/home.png')} size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: 'Connections',
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/connections.png')} size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="transits"
        options={{
          title: 'Transits',
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/transits.png')} size={28} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: 'Chat',
          tabBarIcon: ({ color }) => <IconSymbol name={require('@/src/assets/tabs/chat.png')} size={28} color={color} />,
        }}
      />
     
    </Tabs>
    </UserProvider>
  );
}
