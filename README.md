# Delaluna Answers

A personalized astrology companion for iOS and Android. Get daily horoscopes, natal chart breakdowns, transit readings, synastry reports, tarot draws, and AI-powered chat -- all tailored to your birth chart.

## Features

- **Daily Horoscope** -- personalized readings for yesterday, today, and tomorrow with quotes, advice, do's/don'ts, affirmations, and lucky numbers
- **Natal Chart** -- interactive birth chart wheel and table with AI-generated breakdowns (insights, houses, planets, aspects)
- **Transit Readings** -- weekly transit reports showing planetary movements through your houses
- **Synastry** -- compare charts with connections to explore relationship compatibility
- **Tarot** -- daily three-card draws with reveal animations
- **AI Chat** -- ask questions about your chart, transits, or astrology in general
- **Push Notifications** -- daily morning reminders when your horoscope is ready
- **Themes** -- 7 visual themes with unique background imagery

## Tech Stack

- **React Native 0.81** + **Expo SDK 54** (New Architecture enabled)
- **Expo Router** -- file-based navigation
- **TypeScript** + **React 19**
- **Firebase** -- Auth, Firestore, Cloud Functions, Extensions
- **RevenueCat** -- subscription management, paywalls, and customer center
- **Swiss Ephemeris** -- natal chart and transit calculations via `react-native-swisseph`

## Getting Started

### Prerequisites

- Node.js 18+
- [EAS CLI](https://docs.expo.dev/eas/) (`npm install -g eas-cli`)
- Firebase project with Auth, Firestore, and Functions enabled
- RevenueCat account with products and entitlements configured
- Xcode (iOS) / Android Studio (Android) for local builds

### Install

```bash
npm install
```

### Development

```bash
# Start Expo dev server + Firebase emulators (with persistent seed data)
npm run dev

# Or start them separately
npx expo start
npm run emulators
```

> **Note:** This app uses native modules (`react-native-swisseph`, `react-native-purchases`, etc.) that require a custom dev client. Plain Expo Go will not work. Run `npx expo run:ios` or `npx expo run:android` for a local dev build, or use an EAS development build.

### Build

```bash
# Preview build (real device)
npm run build:preview

# OTA update (JS-only changes)
npm run update:preview "description of changes"
```

### Firebase Emulator Seed Data

Emulator state (accounts, Firestore docs) is automatically saved on shutdown and restored on startup via the `seed/` directory. To manually export:

```bash
npm run seed:export
```

### Lint

```bash
npx expo lint
```

## Project Structure

```
app/                    # Expo Router screens (file-based routing)
  (main)/               # Tab navigator: home, connections, transits, chat
  (auth)/               # Login, sign-up, email verification
  (settings)/           # Profile, edit profile, paywall, theme picker
  (home)/               # Birth chart viewer
  (testing)/            # Natal chart results
  connection/           # Synastry screens

src/
  assets/               # Images, icons, theme backgrounds
  components/           # Reusable UI components
  constants/            # Design tokens, string constants
  context/              # React contexts (User, RevenueCat, Horoscope, Theme)
  hooks/                # Custom hooks (responsive, theme, pull-to-refresh)
  services/             # Business logic (astro engine, Firebase, RevenueCat, chat)
  stores/               # In-memory stores for cross-screen data passing
  types/                # TypeScript type definitions

functions/              # Firebase Cloud Functions
extensions/             # Firebase Extension configs
```

## Environment Variables

Firebase credentials are injected via EAS environment secret vaults -- they are **not** stored in the repository. See `app.config.js` for the full list of expected variables.

## License

Private -- all rights reserved.
