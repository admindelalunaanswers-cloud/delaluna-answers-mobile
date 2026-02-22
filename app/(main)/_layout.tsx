import { Stack } from 'expo-router';

export default function MainLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="birth-chart/index" options={{ title: 'Birth Chart' }} />
      <Stack.Screen name="connection/new" options={{ title: 'New Connection' }} />
      <Stack.Screen name="connection/[id]/index" options={{ title: 'Connection' }} />
      <Stack.Screen name="connection/[id]/edit" options={{ title: 'Edit Connection' }} />
    </Stack>
  );
}
