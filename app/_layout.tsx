import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/src/hooks/use-color-scheme';
import { ImageBackground } from 'react-native';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
  <ImageBackground
        source={require("../src/assets/main/main-background.png")}
        style={{ flex: 1 }}
        resizeMode="cover"
      >
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Slot />
      <StatusBar style="auto" />
      
    </ThemeProvider>
    </ImageBackground>
  );
}
