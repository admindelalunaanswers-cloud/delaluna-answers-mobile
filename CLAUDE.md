# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Start dev server (Expo Go / dev client)
npx expo start

# Run on device/simulator
npx expo run:ios
npx expo run:android

# Lint
npx expo lint

# Install a new package (always use expo install to get SDK-compatible versions)
npx expo install <package-name>
```

There are no automated tests in this project.

## Architecture

**Stack:** React Native (0.81) + Expo SDK 54, Expo Router (file-based), TypeScript, React 19.

**New Architecture is enabled** (`newArchEnabled: true`). Requires a custom dev client — many native packages won't work in plain Expo Go.

### Route structure (`app/`)

```
app/
  _layout.tsx          # Root layout — wraps all routes in ThemeProvider + ImageBackground
  (main)/              # Tab navigator (5 tabs: home, connections, transits, chat, index)
    _layout.tsx        # Tabs.Screen definitions — tab name must match filename exactly
    home.tsx
    connections.tsx
    transits.tsx
    chat.tsx
    index.tsx          # "Test" tab — birth data input screen (InputScreen)
  (testing)/
    ResultsScreen.tsx  # Natal chart / transits results (4+ tabs)
  (auth)/              # login.tsx, sign-up.tsx
  (startup)/           # splash.tsx, loading.tsx, welcome.tsx
  (home)/
    birth-chart/birth-chart-view.tsx
  connection/
    SynastryScreen.tsx
    new.tsx
    [id]/index.tsx
    [id]/edit.tsx
```

### Navigating between screens

Navigation uses **Expo Router** (`router.push`, `router.back`). Complex objects (NatalChart, BirthData) cannot be serialized into URL params — pass them through `TestingStore` instead:

```ts
// src/stores/testing-store.ts
TestingStore.setResults({ natalChart, transits, transitDate, name, birthData });
router.push('/(testing)/ResultsScreen');

TestingStore.setSynastry({ chartA: natalChart, nameA: name });
router.push('/connection/SynastryScreen');
```

### Astrology engine (`src/services/astroEngine.ts`)

The core calculation layer wraps `react-native-swisseph` (Moshier ephemeris, ~1 arc-second accuracy). Key exports:

- `calculateNatalChart(BirthData): Promise<NatalChart>` — Placidus houses, 12 planets (Sun–Pluto + N.Node + Chiron)
- `calculateTransits(date, lat, lon): Promise<TransitData>`
- `calculateSynastry(planetsA, planetsB): Aspect[]` — cross-chart aspect comparison
- `calculateAspects(planets): Aspect[]` — single-chart aspects

`BirthData.timezone` is a numeric UTC offset (e.g. `-5` for EST, `+5.5` for IST). Local time is converted to JD at midnight then the UTC hour is added — avoids `sweUtcTimeZone` day-rollback edge cases.

### Theme system

Two separate systems coexist:

1. **`ThemeContext`** (`src/context/theme-context.tsx`) — 7 named themes (default, blue, green, orange, red, yellow, pink), each with a background PNG image and color palette. Persisted in AsyncStorage. Used by non-testing screens.

2. **Dark Cosmic design tokens** (`src/constants/theme.ts`) — exported as `C` (colors), `S` (spacing: xs=4, sm=8, md=16, lg=24, xl=32, xxl=48), `R` (radii: sm=6, md=12, lg=18, xl=24, pill=999). Used by all testing/chart screens.

`AsyncStorage` is wrapped in a try/catch safe fallback in `theme-context.tsx` — it no-ops if the native module isn't available in the build.

### Responsive design

Two utilities — use the right one for the context:

- **`src/utils/responsive.ts`** — static, reads `Dimensions.get('window')` once at import. Use for `StyleSheet.create()` values.
- **`src/hooks/use-responsive.ts`** — reactive hook using `useWindowDimensions()`. Use for inline styles that must update on orientation change.

Both use `BASE_WIDTH = 375` (iPhone SE baseline) with `moderateScale(size, factor=0.3)`.

### BirthChartWheel SVG geometry

`src/components/natalChart/BirthChartWheel.tsx` renders a pure SVG wheel.

- `svgA(lon)` maps zodiac longitude → SVG angle. ASC always lands at 9-o'clock (angle = −π), DSC at 3-o'clock.
- `rLabel = baseR * 1.07` places axis labels **outside** the outer ring to avoid overlapping signs.
- ASC and DSC are hardcoded to `rot = -90°`; MC/IC use `axisLabelRotation()` which uses `>= 90` (not `> 90`) to ensure DSC at exactly 90° flips correctly.

### Asset paths

- Theme background images: `src/assets/themes-png/<name>-theme.png`
- Zodiac/planet icons: `src/assets/main/*.png`
- Tab icons: `src/assets/tabs/<name>.png`
- App icon / splash: `src/assets/dlla-branded/`

### Native packages requiring custom dev client

These packages have native code and won't work in plain Expo Go:
- `react-native-swisseph` (Swiss Ephemeris binding — core astrological engine)
- `@react-native-async-storage/async-storage`
- `@react-native-community/datetimepicker`
