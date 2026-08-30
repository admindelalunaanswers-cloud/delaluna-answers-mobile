const { withAndroidManifest } = require("@expo/config-plugins");

// Keeps the Android manifest free of large-screen restrictions.
//
// From Android 16, orientation and resizability restrictions are ignored on
// displays >= 600dp, and Google Play flags them as large-screen usability
// issues. So instead of `android:screenOrientation`, phones are held in portrait
// at runtime (src/hooks/use-portrait-lock.ts) while tablets and unfolded
// foldables get the full window. iOS keeps its portrait lock via the top-level
// `orientation` field, which only reaches Info.plist once the attribute below
// is stripped.
const withAndroidLargeScreenSupport = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // A <supports-screens> filter would drop foldables and ChromeOS off the Play
    // listing alongside tablets. Tablet exclusion belongs in the Play Console
    // device catalog (Release > Device catalog), not here.
    delete manifest["supports-screens"];

    const application = manifest.application?.[0];
    if (application) {
      application.$["android:resizeableActivity"] = "true";

      for (const activity of application.activity ?? []) {
        delete activity.$["android:screenOrientation"];
      }
    }

    // Declare telephony optional so Google Play does not filter out non-phone
    // hardware on its behalf.
    const existing = manifest["uses-feature"] ?? [];
    if (
      !existing.some(
        (f) => f.$?.["android:name"] === "android.hardware.telephony",
      )
    ) {
      existing.push({
        $: {
          "android:name": "android.hardware.telephony",
          "android:required": "false",
        },
      });
    }
    manifest["uses-feature"] = existing;

    return mod;
  });

// Normalised build environment, matching src/constants/env.ts: `production` and
// `preview*` are their own envs, anything else (including unset) is development.
const APP_ENV = (() => {
  const raw = process.env.APP_ENV ?? "";
  if (raw === "production") return "production";
  if (raw.startsWith("preview")) return "preview";
  return "development";
})();

// Emulators are a development-only affordance. Gating here as well as in
// firebaseConfig.ts keeps `USE_EMULATOR=true` left over in a .env from ever
// reaching a preview or production build's manifest.
const USE_EMULATOR = process.env.USE_EMULATOR === "true";

// Which Firebase project this build talks to. `production` uses
// delaluna-answers; development and preview use delaluna-answers-test.
//
// This selects the *native* config file (Analytics, Crashlytics, Performance,
// FCM) so it cannot drift from the JS SDK credentials below — the two halves
// resolving to different projects is invisible at runtime except for the
// PROJECT MISMATCH line in logRuntimeBanner(), and it presents as healthy
// crash reporting alongside a Firestore that denies every read.
const USES_TEST_BACKEND = APP_ENV !== "production";

module.exports = {
  expo: {
    name: "Delaluna Answers",
    slug: "delaluna-answers-mobile",
    version: "1.1.0",
    orientation: "portrait",
    icon: "./src/assets/dlla-branded/delaluna_app_icon.png",
    scheme: "delalunaanswersmobile",
    userInterfaceStyle: "automatic",
    newArchEnabled: true,
    platforms: ["ios", "android"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.app.delaluna.answers",
      appleTeamId: "RG6859Q9LQ",
      newArchEnabled: true,
      googleServicesFile: USES_TEST_BACKEND
        ? "./firebase/test/GoogleService-Info.plist"
        : "./GoogleService-Info.plist",
      deploymentTarget: "15.1",
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      adaptiveIcon: {
        foregroundImage: "./src/assets/images/android-icon-foreground.png",
        backgroundImage: "./src/assets/images/android-icon-background.png",
        monochromeImage: "./src/assets/images/android-icon-monochrome.png",
      },
      package: "com.mobile.delaluna.answers",
      googleServicesFile: USES_TEST_BACKEND
        ? "./firebase/test/google-services.json"
        : "./google-services.json",
    },
    plugins: [
      withAndroidLargeScreenSupport,
      "./plugins/with-adi-registration",
      "./plugins/with-fmt-consteval-fix",
      "expo-router",
      "@react-native-firebase/app",
      "@react-native-firebase/perf",
      "@react-native-firebase/crashlytics",
      [
        "expo-notifications",
        {
          icon: "./src/assets/dlla-branded/delaluna_app_icon.png",
          color: "#ffffff",
          sounds: [],
          enableFCMv1: true,
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./src/assets/dlla-branded/delaluna_app_icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
        },
      ],
      "@react-native-community/datetimepicker",
      "expo-secure-store",
      [
        "expo-build-properties",
        {
          android: {
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            AGPVersion: "8.10.2",
          },
          ios: {
            deploymentTarget: "15.1",
            useFrameworks: "static",
            buildReactNativeFromSource: true,
          },
        },
      ],
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: "a267fc5e-e587-4e94-b9ab-1cddd6decb94",
      },
      FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET: process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID: process.env.FIREBASE_APP_ID,
      APP_ENV: process.env.APP_ENV,
      USE_EMULATOR,
      EMULATOR_HOST_ANDROID: process.env.EMULATOR_HOST_ANDROID,
      EMULATOR_HOST_IOS: process.env.EMULATOR_HOST_IOS,
      REVENUECAT_AAS_API_KEY: process.env.REVENUECAT_AAS_API_KEY,
      REVENUECAT_GPS_API_KEY: process.env.REVENUECAT_GPS_API_KEY,
      REVENUECAT_TST_API_KEY: process.env.REVENUECAT_TST_API_KEY,
      // No RevenueCat secret (sk_) keys here. Everything under `extra` is
      // serialized into the app manifest and readable from any installed build
      // via `Constants.expoConfig.extra`, so an sk_ key placed here is public.
      // Secret-key calls live in Cloud Functions, which read REVENUECAT_KEY_V2
      // from Firebase Secret Manager (functions/src/index.ts).
    },
    runtimeVersion: "1.1.0",
    updates: {
      url: "https://u.expo.dev/a267fc5e-e587-4e94-b9ab-1cddd6decb94",
    },
  },
};
