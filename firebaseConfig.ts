// Required polyfills
// import "text-encoding-polyfill";
// import "react-native-get-random-values";

// // Polyfill DOMException for React Native (used by Firebase AI SDK)
// if (typeof globalThis.DOMException === 'undefined') {
//   (globalThis as any).DOMException = class DOMException extends Error {
//     code: number;
//     constructor(message?: string, name?: string) {
//       super(message);
//       this.name = name || 'DOMException';
//       this.code = 0;
//     }
//   };
// }

// // Polyfill AbortSignal.any for React Native (used by Firebase AI SDK)
// if (typeof AbortSignal !== 'undefined' && !AbortSignal.any) {
//   (AbortSignal as any).any = function(signals: AbortSignal[]): AbortSignal {
//     const controller = new AbortController();
//     for (const signal of signals) {
//       if (signal.aborted) {
//         controller.abort(signal.reason);
//         break;
//       }
//       signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
//     }
//     return controller.signal;
//   };
// }

import Constants from "expo-constants";
// import {
//   getAI,
//   getGenerativeModel,
//   GoogleAIBackend
// } from "firebase/ai";

// Firebase Core
import { FirebaseOptions, getApp, getApps, initializeApp } from "firebase/app";

// Auth
import { Auth, connectAuthEmulator, getAuth, initializeAuth, inMemoryPersistence } from "firebase/auth";

// Firestore
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// Functions
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Storage
import { getStorage, ref } from "firebase/storage";

// Load Expo config
const extra = (Constants.expoConfig as any)?.extra ?? (Constants.manifest as any)?.extra;

if (!extra) {
  throw new Error("❌ Missing Firebase config in Expo extra");
}

const firebaseConfig: FirebaseOptions = {
  apiKey: extra.FIREBASE_API_KEY,
  authDomain: extra.FIREBASE_AUTH_DOMAIN,
  projectId: extra.FIREBASE_PROJECT_ID,
  storageBucket: extra.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: extra.FIREBASE_MESSAGING_SENDER_ID,
  appId: extra.FIREBASE_APP_ID,
};

// Initialize Firebase
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// Auth — initializeAuth with inMemoryPersistence (safe for React Native).
// Falls back to getAuth on hot reload when auth is already initialized.
let auth: Auth;
try {
  auth = initializeAuth(app, { persistence: inMemoryPersistence });
} catch (e: any) {
  if (e.code === 'auth/already-initialized') {
    auth = getAuth(app);
  } else {
    throw e;
  }
}
export { auth };

// Firestore
export const db = getFirestore(app);

// Storage
export const storage = getStorage(app);

// Helper for Natal Chart Storage Path
export const getChartFolderRef = (uid: string) => 
  ref(storage, `user-birth-charts/${uid}-natal-chart.svg`);

// Functions
export const functions = getFunctions(app, "us-central1");

// Firebase AI Logic
// const ai = getAI(app, { backend: new GoogleAIBackend() });

/**
 * Raw Model for text/image generation (birth charts, interpretations)
 * Uses Google AI Backend (not Vertex)
 */
// export const rawGeminiModel = getGenerativeModel(ai, {
//   model: "gemini-3-pro-image-preview"
// });

/**
 * Grounded Model with Google Search
 * Uses real-time web data for current astrological events
 */
// export const groundedGeminiModel = getGenerativeModel(ai, {
//   model: "gemini-2.5-flash",
//   tools: [{ googleSearch: {} }],
// });

// Emulator Support (DEV only)
// Using LAN IP for real device testing
export const USE_EMULATOR = __DEV__ && extra?.USE_EMULATOR === "true";
if (USE_EMULATOR) {
  const host = "192.168.1.143";
  connectAuthEmulator(auth, `http://${host}:9099`);
  connectFirestoreEmulator(db, host, 8080);
  connectFunctionsEmulator(functions, host, 5001);
  console.log("USING EMULATOR: ", host);
}

export { app };
