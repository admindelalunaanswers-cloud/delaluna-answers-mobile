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
- **Expo Router 6** -- file-based routing using route groups: `(startup)`, `(auth)`, `(main)`, `(home)`, `(settings)`, `(util)`, plus the dynamic `connection/` routes
- Requires a **custom dev client** (not plain Expo Go) -- multiple native modules are in play

### Astrology Engine
- **`react-native-swisseph`** -- Swiss Ephemeris binding (Moshier, ~1 arc-second accuracy)
- Wrapped in `src/services/astroEngine.ts`: `calculateNatalChart`, `calculateTransits`, `calculateSynastry`, `calculateAspects`
- Custom SVG chart wheels in `src/components/natalChart/natal-chart-wheel.draw.tsx` and `src/components/synastry/synastry-wheel.draw.tsx`, built on `react-native-svg`
- `BirthData.timezone` is a numeric UTC offset, and the engine does its own Julian Day arithmetic -- sidesteps `sweUtcTimeZone` day-rollback bugs

### Backend -- Firebase
- **Firebase JS SDK 12** (client) + **firebase-admin 13 / firebase-functions 7** (server, Node 22)
- **Cloud Functions** -- 14 functions, all in `functions/src/index.ts`:
  - *Callable*: `sendVerificationCode`, `verifyCode`, `syncAdminClaim`, `revokeMyRefreshTokens`, `createConnection`, `deleteConnection`, `sendChatMessage`, `setEntitlementOverride`
  - *Firestore triggers*: `notifyBreakdownReady`, `notifyChatReply`, `notifySynastryReady`, `notifyTransitsReady`, `parseConnectionCompatibility`
  - *Scheduled*: `dailyHoroscopeNotifications` (hourly), `clearDailyChatHistory` (00:00), `weeklyCleanup` (Sun 06:00), `aggregatePerfLogs` (02:00)
- **Firebase Extensions** for AI generation -- see [AI Generation Pipeline](#ai-generation-pipeline) below
- **Firebase Emulators** (auth, functions, firestore, storage, eventarc, extensions) with seed import/export via `npm run dev`

### State & Data Flow
- **React Context** for cross-cutting state, nested in this order in `app/_layout.tsx`:
  - `UserProvider` -- Firebase Auth + live Firestore user doc + purchases
  - `RevenueCatProvider` -- subscription state, `isPro`, paywall presentation
  - `AdminProvider` -- dev/admin runtime limit overrides (display only; see below)
  - `ThemeProvider` -- 7 named themes + AsyncStorage persistence
  - `HoroscopeProvider` -- chart, horoscope, transits, breakdown; orchestrates generation order
- **In-memory stores** (`src/stores/`) -- `ChatStore` and `NavigationStore` pass state between routes that Expo Router URL params can't serialize
- **Zod 4** for schema validation

### AI Generation Pipeline

The app never calls an LLM directly. Client writes a prompt to Firestore, a **Firebase GenAI
Extension** watching that path calls Gemini and writes `response` back to the same document,
and the client's `onSnapshot` renders it. Seven extension instances, each with its own persona:

| Firestore path | Extension | Feature |
|---|---|---|
| `users/{uid}/horoscope/{YYYY-MM-DD}` | `horoscope-chatbot-b6wc` | Daily horoscope |
| `users/{uid}/natalChart/details` | `firestore-natal-chart-chatbot-6ppy`, `firestore-multimodal-genai` | Chart breakdown |
| `users/{uid}/transits/{YYYY-MM-DD}` | `firestore-transits-chatbot-cgl7` | Weekly transits |
| `users/{uid}/updayedChat/{id}` | `firestore-genai-chatbot-update-5i5h` | AI chat |
| `users/{uid}/connections/{id}/report/details` | `firestore-genai-chatbot` | Compatibility report |
| `users/{uid}/connections/{id}/synastryReading/details` | `firestore-genai-chatbot-1rrn` | Synastry reading |

Config lives in `extensions/*.env`; instances are registered in `firebase.json`. Most run
`gemini-2.5-flash`; the chart breakdown runs `gemini-3-pro-image-preview` with its full
tier-aware prompt template stored in the extension config rather than in `src/prompts/`.

Two behaviours this imposes on the services layer:
- Extensions trigger on document **create**, so the request services `deleteDoc` before
  `setDoc` to force a re-fire.
- Model JSON is unreliable, so every `parseResult` strips code fences and trailing commas
  before parsing.

#### Horoscope quote variety

Each day's horoscope is generated independently, so the `quote` field used to repeat. The
`generateHoroscope` Cloud Function now appends two things to the prompt at generation time
(`functions/src/quote-history.ts`); neither is stored and no extra data is kept per user:

- **A daily topic and style** — rotated per user (11 topics × 4 styles, e.g. "moving on" as
  "a clapback"), so consecutive days always differ and a combination recurs every 44 days.
- **A do-not-repeat list** — the quotes from the surrounding days' horoscopes already in
  Firestore.

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
- Five build profiles in `eas.json`: `development-simulator`, `development-device`, `preview-device`, `preview`, `production`
- Each profile binds to an EAS environment vault (`development` / `preview` / `production`) -- Firebase credentials are injected at build time, not committed
- `runtimeVersion` is pinned to the app version -- OTA updates (`npm run update:preview`) only apply to builds whose runtime version matches
- Full rebuild needed any time native code or `eas.json` changes (`npm run build:preview`)
- `scripts/exclude-dev-client.js` runs as `eas-build-pre-install` to strip `expo-dev-client` from store builds
- Custom config plugins: `withAndroidLargeScreenSupport` (inline in `app.config.js`) and `plugins/with-adi-registration`

### Auth Flow
Sign-up -> `(auth)/verify-email.tsx` (OTP) -> `sendVerificationCode` Cloud Function -> user enters a 6-character code -> `verifyCode` marks `emailVerified` on the Auth record and mirrors it to Firestore -> redirect to `(main)`.

The OTP uses an ambiguity-free alphabet (no `0/O/1/I/L`), `crypto.randomInt` for uniform
randomness, a 60-second resend rate limit, 5 attempts, and a 15-minute expiry. Codes are
bound to the mailbox they were sent to, so changing the account email invalidates them.

### Security Model
- **Chat generation is metered server-side.** `sendChatMessage` is the only path that may submit a prompt; Firestore rules allow `create` on `updayedChat` only when `prompt` is empty, since a non-empty prompt is what makes the extension run. Usage is tracked in the server-write-only `users/{uid}/chatUsage/{YYYY-MM-DD}` rather than by counting chat docs, because the client can delete its own history.
- **Admin limit sliders are display only.** `src/context/admin-context.tsx` persists to AsyncStorage and never reaches the server. Real limits are in `functions/src/index.ts`.
- **Admin privilege is the `admin: true` custom auth claim**, set by `syncAdminClaim` from the secret-backed `ADMIN_EMAILS` allowlist. `users/{uid}.isAdmin` is a UI mirror -- security rules gate on the claim only.
- **Email verification reads `authUser.emailVerified`**; `users/{uid}.isEmailVerified` is a display mirror that goes stale after an email change.
- **No RevenueCat `sk_` keys in `app.config.js`** -- everything under `extra` is readable from any installed build. Secret-key calls live in Cloud Functions via Secret Manager (`REVENUECAT_KEY_V2`).

### Notable Architectural Choices
1. **New Architecture on** -- constrains package choices to those that support Fabric/TurboModules
2. **Two parallel theme systems** -- the named `ThemeContext` (for general screens) and the Dark Cosmic `C/S/R` tokens (for chart/settings screens)
3. **AI results arrive asynchronously via Firestore** -- the UI subscribes to the document and handles a stuck-extension retry path, with an AppState-resume re-fetch in `horoscope-context.tsx` to recover listeners dropped while suspended
4. **Push timing is hash-jittered** -- `dailyHoroscopeNotifications` runs hourly and uses an FNV-1a hash of the UID to give each user a stable local send hour in the 8-10 AM window, spreading load instead of stampeding at 8:00

## Getting Started

### Prerequisites

- Node.js 20 (Volta pins `20.19.5`; Cloud Functions run on Node 22)
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
# Start Expo dev server + Firebase emulators together (recommended)
npm run dev

# Or start them separately
npx expo start          # just Metro
npm run emulators       # just Firebase emulators
npx expo start -c       # clear Metro cache (fixes weird bundler errors)
npx expo start --tunnel # when phone and laptop are on different Wi-Fi
```

> **Note:** This app uses native modules (`react-native-swisseph`, `react-native-purchases`, etc.) that require a custom dev client — plain Expo Go will not work. Install a dev build on your device with `npm run build:dev-device`, then open the Delaluna dev client app and connect to Metro.

**Find your laptop IP for manual connection:**
```bash
ipconfig getifaddr en0
# Then enter exp://<ip>:8081 in the dev client
```

### When to rebuild vs. reload

| Change | Action |
|---|---|
| Edit anything in `app/` or `src/` | Nothing — hot reload |
| Added/changed a native package | `npm run build:dev-device` |
| Edited `app.config.js` / `eas.json` / native | `npm run build:dev-device` |
| JS fix to already-shipped preview build | `npm run update:preview "msg"` |
| New preview for testers | `npm run build:preview` |
| Store release | `npm run build:prod` |

### Build

```bash
npm run build:dev-device   # dev client, iOS + Android (physical device)
npm run build:dev-sim      # dev client, iOS simulator
npm run build:preview      # preview build, both platforms
npm run build:prod         # production build for App Store / Google Play
```

### OTA Updates

OTA updates deliver JS/asset-only changes without a full rebuild. The installed build's `runtimeVersion` must match.

```bash
npm run update:preview "fix login button"
npm run update:prod "fix login button"

# Check update status
eas update:list --branch preview-device
```

If an update won't apply: verify the channel matches, `runtimeVersion` matches, then kill the app twice and wait ~30 seconds.

### Firebase Emulator Seed Data

Emulator state (accounts, Firestore docs) is automatically saved on shutdown and restored on startup via the `seed/` directory. To manually export:

```bash
npm run seed:export
```

### Cloud Functions

```bash
firebase deploy --only functions
firebase deploy --only functions:sendVerificationCode  # deploy one function
firebase functions:log
firebase functions:secrets:set EMAIL_USER
```

### Lint

```bash
npx expo lint
```

### Testing

```bash
npm test                  # run all tests
npm run test:watch        # re-run on file changes
npm run test:coverage     # run with coverage report (80% threshold on all metrics)
npm run test:debug        # debug with Node inspector (then open chrome://inspect)
```

Tests live in `__tests__` directories alongside source files. The suite is currently
155 tests across 8 files, covering pure logic only (synastry, location, responsive,
date handling, perf logging, tarot cache, user service) -- there are no component or
Cloud Function tests. See [docs/TESTING.md](docs/TESTING.md) for the full testing guide.

> `npx tsc --noEmit` is not currently clean -- see the Known Issues section in
> [CLAUDE.md](CLAUDE.md). Jest passes regardless because `ts-jest` runs with
> `isolatedModules`, which skips cross-file type checking.

### Debugging

```bash
# Open dev menu: shake phone, three-finger tap (iOS), or:
adb shell input keyevent 82

# Native logs
npx react-native log-ios
npx react-native log-android
adb logcat *:S ReactNative:V ReactNativeJS:V

# Nuclear cache clear
rm -rf node_modules .expo ios/Pods ios/build android/build && npm install

# Firebase emulator port conflict
lsof -ti:4000,5001,8080,9099,9199 | xargs kill -9
```

## Project Structure

```
app/                    # Expo Router screens (file-based routing)
  _layout.tsx           # Provider stack + AuthGate (routing, push handlers, splash)
  (startup)/            # Splash and welcome screens
  (auth)/               # Login, sign-up, forgot password, email verification (OTP)
  (main)/               # Tab navigator: home, connections, transits, chat
  (home)/               # Birth chart viewer
  (settings)/           # Profile, edit profile, paywall, theme, avatar, admin, receipts
  (util)/               # Feedback, support, loading screens
  connection/           # new.tsx plus [id]/ detail, edit, and synastry screens

src/
  assets/               # Images, icons, Lottie animations, theme backgrounds, buttons
  components/           # UI by feature: home, natalChart, synastry, sign-up, shared, ui
  constants/            # Design tokens (C/S/R), strings, tarot card registry
  context/              # React contexts (User, RevenueCat, Admin, Theme, Horoscope)
  hooks/                # Custom hooks (responsive, theme, portrait lock, min-version)
  models/               # Data model helpers
  prompts/              # AI prompt templates (chat, horoscope, transits, synastry, ...)
  schemas/              # Zod validation schemas
  services/             # Business logic (astro engine, Firebase, RevenueCat, chat, ...)
  stores/               # In-memory stores for cross-screen data passing
  types/                # TypeScript type definitions
  utils/                # Pure utilities (location, synastry, responsive, harm filter)

functions/src/index.ts  # All 14 Cloud Functions
extensions/*.env        # Firebase Extension configs (GenAI x6, RevenueCat, user deletion)
plugins/                # Custom Expo config plugins
scripts/                # Build and migration scripts
seed/                   # Firebase emulator seed data (auto import/export)
docs/                   # Additional developer docs (CHEATSHEET.md, TESTING.md)
firestore.rules         # Security rules -- the enforcement layer, read before editing
```

`@/` maps to the **project root**, not `src/` -- so imports read `@/src/services/...`
and `@/firebaseConfig`. Configured in `tsconfig.json` and `jest.config.js`.

## Environment Variables

Firebase credentials are injected via EAS environment secret vaults — they are **not** stored in the repository.

| Variable | Used in |
|---|---|
| `FIREBASE_API_KEY` | Firebase JS SDK init |
| `FIREBASE_AUTH_DOMAIN` | Firebase JS SDK init |
| `FIREBASE_PROJECT_ID` | Firebase JS SDK init |
| `FIREBASE_STORAGE_BUCKET` | Firebase JS SDK init |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase JS SDK init |
| `FIREBASE_APP_ID` | Firebase JS SDK init |
| `REVENUECAT_AAS_API_KEY` | RevenueCat iOS (production) |
| `REVENUECAT_GPS_API_KEY` | RevenueCat Android (production) |
| `REVENUECAT_TST_API_KEY` | RevenueCat (dev/test) |
| `REVENUECAT_KEY_V1` / `REVENUECAT_KEY_V2` | Server-side RevenueCat (Cloud Functions only) |
| `APP_ENV` | Runtime environment flag (`development` / `preview` / `production`) |

Pull env vars for local development:
```bash
eas env:pull --environment development   # writes .env.local
```

To add or update a secret:
```bash
eas env:create --environment preview --name MY_KEY --value "..."
eas env:list --environment preview
```

## License

Private -- all rights reserved.
