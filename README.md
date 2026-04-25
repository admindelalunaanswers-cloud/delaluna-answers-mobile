# Delaluna Answers

A personalized astrology companion for iOS and Android. Get daily horoscopes, natal chart breakdowns, transit readings, synastry reports, tarot draws, and AI-powered chat -- all tailored to your birth chart.

## About the App

Delaluna Answers is a personalized astrology companion for iOS and Android that turns a user's birth data into a living, daily astrological practice. Where most horoscope apps serve generic sun-sign copy, Delaluna computes a full natal chart from Swiss Ephemeris-grade calculations and layers AI-generated interpretations on top, so every reading, transit report, and chat response is anchored to the user's exact chart.

### How it works

1. **Onboarding & sign-in** -- Users sign up with email, verify via a 6-digit OTP (delivered by a Firebase Cloud Function), then enter their birth date, time, and location. Birth data is persisted to their Firestore profile and used across every feature in the app.
2. **Natal chart generation** -- The app computes a Placidus-house natal chart locally on-device using `react-native-swisseph` (12 planets + angles + aspects). Results are rendered as an interactive SVG wheel and table.
3. **AI interpretation pipeline** -- Chart data is written to Firestore, where a Firebase Extension picks it up, runs it through an LLM prompt template, and writes the structured breakdown back to the same document. The app subscribes to the doc and renders the result as it streams in. The same pattern powers transit readings and chat responses.
4. **Daily rhythm** -- A scheduled Cloud Function fires a morning push notification when the day's horoscope is ready. Users open the app to find their horoscope, a three-card tarot draw, and any new transit activity waiting for them.
5. **Relationships** -- Users can save "connections" (partners, friends, family) with their own birth data and run **synastry** comparisons -- cross-chart aspect analysis showing how two charts interact.
6. **Conversational layer** -- An AI chat tab lets users ask free-form questions about their chart, current transits, or astrology in general. Chat history auto-clears every 24 hours via a scheduled function.
7. **Monetization** -- Premium features are gated by a RevenueCat "Delaluna Answers Pro" entitlement. Free users get a taste; subscribers unlock the full breakdowns, transit readings, chat, and synastry.

### Core Features

- **Daily Horoscope** -- personalized readings for yesterday, today, and tomorrow with quotes, advice, do's/don'ts, affirmations, and lucky numbers
- **Natal Chart** -- interactive birth chart wheel and table with AI-generated breakdowns (insights, houses, planets, aspects)
- **Transit Readings** -- weekly transit reports showing planetary movements through the user's houses
- **Synastry** -- compare charts with saved connections to explore relationship compatibility
- **Tarot** -- daily three-card draws with reveal animations and per-day caching
- **AI Chat** -- ask questions about your chart, transits, or astrology in general, with retry handling for stuck responses
- **Push Notifications** -- daily morning reminders when your horoscope is ready
- **Themes** -- 7 visual themes with unique background imagery, persisted across sessions
- **Subscription management** -- in-app paywall and customer center powered by RevenueCat

### Primary User Flow

`Splash` -> `Welcome` -> `Sign up / Log in` -> `Verify email (OTP)` -> `Enter birth data` -> `Home tab (horoscope + tarot)` -> explore `Connections`, `Transits`, `Chat`, or tap into the full `Natal chart` view. Premium-gated actions route through the RevenueCat paywall when triggered by a free user.

## Tech Stack

### Core Framework
- **React Native 0.81.5** + **React 19.1** on **Expo SDK 54** with the New Architecture enabled
- **TypeScript 5.9**, ESLint via `eslint-config-expo`
- **Expo Router 6** -- file-based routing using route groups (`(main)`, `(auth)`, `(settings)`, `(testing)`, etc.)
- Requires a **custom dev client** (not plain Expo Go) -- multiple native modules are in play

### Astrology Engine
- **`react-native-swisseph`** -- Swiss Ephemeris binding (Moshier, ~1 arc-second accuracy)
- Wrapped in `src/services/astroEngine.ts`: `calculateNatalChart`, `calculateTransits`, `calculateSynastry`, `calculateAspects`
- Custom SVG chart wheel in `src/components/natalChart/BirthChartWheel.tsx` built on `react-native-svg`
- `BirthData.timezone` is a numeric UTC offset -- sidesteps `sweUtcTimeZone` day-rollback bugs

### Backend -- Firebase
- **Firebase JS SDK 12** (client) + **firebase-admin / firebase-functions 7** (server)
- **Cloud Functions** (`functions/src/index.ts`):
  - `sendVerificationCode` / `verifyCode` -- OTP email verification via nodemailer
  - `clearDailyChatHistory` -- scheduled cleanup of chat messages older than 24h
  - `sendMorningReminder` -- scheduled daily push notifications
- **Firebase Extensions** for AI generation -- watches Firestore docs and writes AI responses back (natal chart breakdown, transit reading, chat)
- **Firebase Emulators** (auth, functions, firestore, storage, eventarc, extensions) with seed import/export via `npm run dev`

### State & Data Flow
- **React Context** for cross-cutting state:
  - `UserContext` -- Firebase Auth + Firestore user doc
  - `RevenueCatContext` -- subscription state
  - `HoroscopeContext` -- horoscope, transits, tarot
  - `ThemeContext` -- 7 named themes + AsyncStorage persistence
- **`TestingStore`** (`src/stores/testing-store.ts`) -- in-memory pass-through for complex objects (NatalChart, BirthData) between routes, since Expo Router URL params can't serialize them
- **Zod 4** for schema validation

### Subscriptions -- RevenueCat
- `react-native-purchases` + `react-native-purchases-ui` v9.x (native)
- "Delaluna Answers Pro" entitlement gates premium features -- screens read `useRevenueCat().isPro`, not Firestore
- Branded Paywall via `RevenueCatUI.presentPaywall()`, Customer Center for active subscribers
- Purchase events synced to Firestore via the `firestore-revenuecat-purchases` extension

### UI Layer
- **Design tokens** in `src/constants/theme.ts` -- `C` (colors), `S` (spacing), `R` (radii) for the Dark Cosmic design system
- **Two responsive utilities**: static `src/utils/responsive.ts` for `StyleSheet.create`, reactive `src/hooks/use-responsive.ts` for inline styles. Both use `BASE_WIDTH = 375` with `moderateScale`
- **Icons**: `@expo/vector-icons` (Ionicons)
- `expo-linear-gradient`, `expo-blur`, `expo-image`, `lottie-react-native`, `react-native-markdown-display`, `react-native-element-dropdown`
- **Animations**: `react-native-reanimated 4` + `react-native-worklets`, `react-native-gesture-handler`

### Native / Device
- `expo-notifications` + Expo push tokens (`src/services/notifications.service.ts`)
- `expo-haptics`, `expo-device`, `expo-constants`, `expo-updates` (OTA)
- `@react-native-community/datetimepicker` for birth time entry
- `@react-native-async-storage/async-storage` (theme persistence, safe-wrapped)

### Build & Release -- EAS
- Four build profiles in `eas.json`: `development-device`, `preview-device`, `preview`, `production`
- Each profile binds to an EAS environment vault (`development` / `preview` / `production`) -- Firebase credentials are injected at build time, not committed
- `runtimeVersion: appVersion` policy -- OTA updates (`npm run update:preview`) only apply to builds whose app version matches
- Full rebuild needed any time native code or `eas.json` changes (`npm run build:preview`)

### Auth Flow
Sign-up -> `(auth)/verify-email.tsx` (OTP) -> `sendVerificationCode` Cloud Function -> user enters 6-digit code -> `verifyCode` marks `emailVerified` in Auth + Firestore -> redirect to `(main)`.

### Notable Architectural Choices
1. **No automated tests** -- manual QA only
2. **New Architecture on** -- constrains package choices to those that support Fabric/TurboModules
3. **Two parallel theme systems** -- the named `ThemeContext` (for general screens) and the Dark Cosmic `C/S/R` tokens (for testing/chart screens)
4. **AI results arrive asynchronously via Firestore** -- the UI subscribes to `status.state` transitions and handles a stuck-extension retry path in `chat.service.ts`

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
