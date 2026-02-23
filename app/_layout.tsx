import { DarkTheme, DefaultTheme, ThemeProvider as NavThemeProvider } from '@react-navigation/native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode } from 'react';
import { ImageBackground } from 'react-native';
import 'react-native-reanimated';

import ThemeProvider from '@/src/context/theme-context';
import { useTheme } from '@/src/hooks/use-theme';
import { useColorScheme } from '@/src/hooks/use-color-scheme';

function ThemedRoot({ children }: { children: ReactNode }) {
  const colorScheme = useColorScheme();
  const { theme } = useTheme();

  return (
    <ImageBackground
      source={theme.backgroundImage}
      style={{ flex: 1 }}
      resizeMode="cover"
    >
      <NavThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        {children}
        <StatusBar style="auto" />
      </NavThemeProvider>
    </ImageBackground>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <ThemedRoot>
        <Slot />
      </ThemedRoot>
    </ThemeProvider>
  );
}
