module.exports = {
  expo: {
    name: "delaluna-answers-mobile",
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
      bundleIdentifier: "com.delalunaanswers.mobile",
      newArchEnabled: true,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        UIBackgroundModes: ["remote-notification"],
      },
    },
    android: {
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      package: "com.delalunaanswers.mobile",
    },
    plugins: [
      "expo-router",
      [
        "expo-notifications",
        {
          icon: "./src/assets/dlla-branded/delaluna_app_icon.png",
          color: "#0d0628",
          sounds: [],
        },
      ],
      [
        "expo-splash-screen",
        {
          image: "./src/assets/dlla-branded/delaluna_app_icon.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#ffffff",
          dark: { backgroundColor: "#000000" },
        },
      ],
      "@react-native-community/datetimepicker",
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
      USE_EMULATOR:                process.env.USE_EMULATOR,
      EMULATOR_HOST:               process.env.EMULATOR_HOST ?? 'localhost',
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/a267fc5e-e587-4e94-b9ab-1cddd6decb94",
    },
  },
};
