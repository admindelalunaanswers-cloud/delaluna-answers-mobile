module.exports = {
  expo: {
    name: "Delaluna Answers",
    slug: "delaluna-answers-mobile",
    version: "1.0.0",
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
      googleServicesFile: "./GoogleService-Info.plist",
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
      package: "com.app.delaluna.answers",
      googleServicesFile: "./google-services.json",
    },
    plugins: [
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
      FIREBASE_API_KEY:            process.env.FIREBASE_API_KEY,
      FIREBASE_AUTH_DOMAIN:        process.env.FIREBASE_AUTH_DOMAIN,
      FIREBASE_PROJECT_ID:         process.env.FIREBASE_PROJECT_ID,
      FIREBASE_STORAGE_BUCKET:     process.env.FIREBASE_STORAGE_BUCKET,
      FIREBASE_MESSAGING_SENDER_ID: process.env.FIREBASE_MESSAGING_SENDER_ID,
      FIREBASE_APP_ID:             process.env.FIREBASE_APP_ID,
      APP_ENV:                     process.env.APP_ENV,
      REVENUECAT_API_KEY:          process.env.APP_ENV === 'development'
                                       ? process.env.REVENUECAT_API_KEY
                                       : process.env.DELALUNA_ANSWERS_APP_STORE,
    },
    runtimeVersion: "1.0.0",
    updates: {
      url: "https://u.expo.dev/a267fc5e-e587-4e94-b9ab-1cddd6decb94",
    },
  },
};
