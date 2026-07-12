# Expo / EAS Cheatsheet

## Daily dev on physical device

You have a dev client installed — don't use Expo Go.

```bash
npm run dev          # Firebase emulators + Metro together (most common)
npx expo start       # just Metro, no emulators
npx expo start -c    # clear Metro cache (fix weird bundler errors)
npx expo start --tunnel   # when phone + laptop on different Wi-Fi
```

Open the Delaluna dev client on phone → it remembers the last URL, or scan QR from terminal, or tap "Enter URL manually" and type `exp://<laptop-ip>:8081`.

Find laptop IP: `ipconfig getifaddr en0`

## When do I need to rebuild vs just reload?

| Change                                        | Action                               |
|-----------------------------------------------|--------------------------------------|
| Edit anything in `app/` or `src/`             | Nothing — hot reload                 |
| Added/changed a native package                | `npm run build:dev-device`           |
| Edited `app.config.js` / `eas.json` / native  | `npm run build:dev-device`           |
| JS fix to already-shipped preview build       | `npm run update:preview "msg"`       |
| New preview for testers                       | `npm run build:preview`              |
| Store release                                 | `eas build --profile production`     |

## Build commands (from package.json)

```bash
npm run build:dev-device     # dev client, iOS + Android physical device
npm run build:dev-sim        # dev client, iOS simulator
npm run build:preview        # preview build, both platforms
npm run build:preview-ios    # iOS only
npm run build:preview-android
```

Check builds: `eas build:list --limit 5` · `eas build:view <id>`

## OTA updates

Only JS/assets. Installed build must match `runtimeVersion` (tied to `appVersion` in `app.config.js`).

```bash
npm run update:preview "fix login button"
eas update --channel development-device --message "..."
eas update:list --branch preview-device
```

If an update won't apply: check channel matches, `runtimeVersion` matches, then kill app twice and wait ~30s between.

## Debugging

Dev menu on device: **shake phone**, or three-finger tap (iOS), or `adb shell input keyevent 82` (Android).

```bash
# Native logs
npx react-native log-ios
npx react-native log-android
adb logcat *:S ReactNative:V ReactNativeJS:V

# Nuclear cache clear
rm -rf node_modules .expo ios/Pods ios/build android/build
npm install

# Firebase emulator port conflict
lsof -ti:4000,5001,8080,9099,9199 | xargs kill -9
```

## Installing packages

Always via `expo install` so versions match the SDK:

```bash
npx expo install <package>
```

If it's a native package, follow up with `npm run build:dev-device`. Native ones in this repo: `react-native-swisseph`, `@react-native-async-storage/async-storage`, `@react-native-community/datetimepicker`, `react-native-purchases`, `react-native-purchases-ui`.

## EAS secrets / env

```bash
eas env:list --environment preview
eas env:create --environment preview --name MY_KEY --value "..."
eas env:pull --environment development   # writes .env.local
```

## Cloud Functions

```bash
firebase deploy --only functions
firebase deploy --only functions:sendVerificationCode
firebase functions:log
firebase functions:secrets:set EMAIL_USER
```

## Common gotchas

| Symptom                                        | Fix                                                  |
|------------------------------------------------|------------------------------------------------------|
| Dev client crashes on launch                   | Native deps drifted — rebuild dev client             |
| `Unable to resolve module` after install       | `npx expo start -c`                                  |
| Phone can't find Metro                         | Different Wi-Fi → `npx expo start --tunnel`          |
| OTA update not showing up                      | Channel or `runtimeVersion` mismatch                 |
| RevenueCat / Swiss Ephemeris errors at runtime | Running in Expo Go instead of dev client             |
| Firebase calls hang locally                    | Emulators not running, or `USE_EMULATOR` wrong       |
