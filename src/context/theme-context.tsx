import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import type { ColorValue, ImageSourcePropType } from 'react-native';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { Events } from '@/src/services/analytics.service';
import { AccessibilityContext } from '@/src/context/accessibility-context';

// Safe AsyncStorage wrapper — silently no-ops if native module isn't in the build yet
let AsyncStorage: { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<void> };
try {
  AsyncStorage = require('@react-native-async-storage/async-storage').default;
} catch {
  AsyncStorage = { getItem: async () => null, setItem: async () => {} };
}

// ===== Images =====
const defaultImg  = require('@/src/assets/themes-jpg/default-theme.jpg');
const blueTheme   = require('@/src/assets/themes-jpg/blue-theme.jpg');
const greenTheme  = require('@/src/assets/themes-jpg/green-theme.jpg');
const orangeTheme = require('@/src/assets/themes-jpg/orange-theme.jpg');
const redTheme    = require('@/src/assets/themes-jpg/red-theme.jpg');
const yellowTheme = require('@/src/assets/themes-jpg/yellow-theme.jpg');
const pinkTheme   = require('@/src/assets/themes-jpg/pink-theme.jpg');

// ===== Types =====
export interface ThemeColors {
  background: ColorValue;
  headerBg: string;
  headerText: string;
  primary: string;
  activeTab: string;
  inactiveTabs: string;
  text: string;
  overlay?: string;
}

export interface ThemeGradient { colors: string[]; angle: number; }

export interface Theme {
  key: string;
  colors: ThemeColors;
  backgroundType: 'image' | 'gradient';
  backgroundImage?: ImageSourcePropType;
  gradient?: ThemeGradient;
  blendMode: 'difference';
  isDark?: boolean;
}

// ===== Theme definitions =====
const allThemes: Record<string, Theme> = {
  default: {
    key: 'default',
    colors: {
      background: '#240046',
      headerBg: '#513877',
      headerText: '#ffffff',
      primary: '#BCA8F4',
      activeTab: '#fbfbfbff',
      inactiveTabs: '#BCA8F4',
      text: '#ffffff',
    },
    backgroundType: 'image',
    backgroundImage: defaultImg,
    blendMode: 'difference',
  },
  yellow: {
    key: 'yellow',
    colors: {
      background: '#b79606ff',
      headerBg: '#fbc810ff',
      headerText: '#fbfbfbff',
      primary: '#cda120ff',
      activeTab: '#fbfbfbff',
      inactiveTabs: '#ad881aff',
      text: '#e5e4e4ff',
    },
    backgroundType: 'image',
    backgroundImage: yellowTheme,
    blendMode: 'difference',
  },
  pink: {
    key: 'pink',
    colors: {
      background: '#B91372',
      headerBg: '#B91372',
      headerText: '#ffffff',
      primary: '#B91372',
      activeTab: '#ffffff',
      inactiveTabs: '#f79dd2ff',
      text: '#ffffff',
    },
    backgroundType: 'image',
    backgroundImage: pinkTheme,
    blendMode: 'difference',
  },
  blue: {
    key: 'blue',
    colors: {
      background: '#000080',
      headerBg: '#000080',
      headerText: '#ffffff',
      primary: '#00BFFF',
      activeTab: '#ffffff',
      inactiveTabs: '#9dd1f1ff',
      text: '#ffffff',
    },
    backgroundType: 'image',
    backgroundImage: blueTheme,
    blendMode: 'difference',
  },
  green: {
    key: 'green',
    colors: {
      background: '#013220',
      headerBg: '#013220',
      headerText: '#ffffff',
      primary: '#39FF14',
      activeTab: '#ffffff',
      inactiveTabs: '#98df8cff',
      text: '#ffffff',
    },
    backgroundType: 'image',
    backgroundImage: greenTheme,
    blendMode: 'difference',
  },
  orange: {
    key: 'orange',
    colors: {
      background: '#FFA500',
      headerBg: '#FFA500',
      headerText: '#ffffff',
      primary: '#E76D2C',
      activeTab: '#ffffff',
      inactiveTabs: '#a53e07ff',
      text: '#ffffff',
    },
    backgroundType: 'image',
    backgroundImage: orangeTheme,
    blendMode: 'difference',
  },
  red: {
    key: 'red',
    colors: {
      background: '#D3011C',
      headerBg: '#D3011C',
      headerText: '#ffffff',
      primary: '#D3011C',
      activeTab: '#ffffff',
      inactiveTabs: '#570510ff',
      text: '#ffffff',
    },
    backgroundType: 'image',
    backgroundImage: redTheme,
    blendMode: 'difference',
  },
};

// ===== Storage key =====
const GLOBAL_KEY = 'themeKey';

// ===== Context =====
export interface ThemeContextType {
  /** The theme to draw with — the default one while the custom theme is ignored. */
  theme: Theme;
  /** The theme the user chose. Kept while it is ignored, so it comes back. */
  themeKey: string;
  /** Accessibility → "Ignore custom theme" is on. */
  customThemeIgnored: boolean;
  setThemeKey: (key: string) => Promise<void>;
  themes: Record<string, Theme>;
}

export const ThemeContext = createContext<ThemeContextType>({
  theme: allThemes.default,
  themeKey: 'default',
  customThemeIgnored: false,
  setThemeKey: async () => {},
  themes: allThemes,
});

// ===== Provider =====
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [themeKey, _setThemeKey] = useState<string>('default');
  const customThemeIgnored = useContext(AccessibilityContext).resolved.ignoreCustomTheme;

  const setThemeKey = useCallback(async (key: string) => {
    if (!allThemes[key]) return;
    _setThemeKey(key);
    Events.themeChanged(key);
    try { await AsyncStorage.setItem(GLOBAL_KEY, key); } catch {}
  }, []);

  useEffect(() => {
    let cancelled = false;

    // 1. Load from AsyncStorage immediately so the app renders fast
    (async () => {
      let key = 'default';
      try {
        const cached = await AsyncStorage.getItem(GLOBAL_KEY);
        if (cached && allThemes[cached]) key = cached;
      } catch {}
      if (!cancelled) {
        _setThemeKey(key);
        setHydrated(true);
      }
    })();

    // 2. When Firebase Auth resolves, check Firestore and sync if different
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      if (!user || cancelled) return;
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        const firestoreKey = snap.data()?.themeKey as string | undefined;
        if (firestoreKey && allThemes[firestoreKey] && !cancelled) {
          _setThemeKey(firestoreKey);
          try { await AsyncStorage.setItem(GLOBAL_KEY, firestoreKey); } catch {}
        }
      } catch {}
    });

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, []);

  if (!hydrated) return null;

  const shownKey = customThemeIgnored ? 'default' : themeKey;
  const currentTheme: Theme = {
    ...allThemes[shownKey],
    isDark: (() => {
      const t = allThemes[shownKey];
      const bg = t.colors.background.toString().toLowerCase();
      const header = t.colors.headerBg.toString().toLowerCase();
      const darkColors = ['#000', '#1c2541', '#240046', '#013220', '#000080'];
      return darkColors.some(c => bg.includes(c) || header.includes(c));
    })(),
  };

  return (
    <ThemeContext.Provider value={{ theme: currentTheme, themeKey, customThemeIgnored, setThemeKey, themes: allThemes }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const themes = allThemes;
export default ThemeProvider;
