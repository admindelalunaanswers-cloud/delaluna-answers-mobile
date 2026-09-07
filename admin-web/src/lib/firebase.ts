/**
 * firebase.ts — SDK initialisation for the admin dashboard.
 *
 * Config comes from Vite env vars (`VITE_FIREBASE_*`, see .env.example). None
 * of it is secret: the same values ship inside every installed copy of the
 * mobile app, and Firebase web config is designed to be public. What actually
 * protects this dashboard is the `admin` custom auth claim plus the Firestore
 * rules — never the obscurity of these strings.
 *
 * The project is chosen by which .env file you build with. `delaluna-answers`
 * is production and holds real user data; `delaluna-answers-test` is the safe
 * one to develop against. There is deliberately no runtime switcher — a
 * dropdown that silently repoints an admin tool at production is exactly the
 * kind of thing that gets someone banned by mistake.
 */

import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';

function required(name: string): string {
  const value = import.meta.env[name as keyof ImportMetaEnv] as
    | string
    | undefined;
  if (!value) {
    // Failing loudly at startup beats a blank dashboard and a console full of
    // auth/invalid-api-key. The message names the file to fix.
    throw new Error(
      `Missing ${name}. Copy admin-web/.env.example to admin-web/.env and fill it in.`,
    );
  }
  return value;
}

export const firebaseConfig = {
  apiKey: required('VITE_FIREBASE_API_KEY'),
  authDomain: required('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: required('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: required('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: required('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: required('VITE_FIREBASE_APP_ID'),
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);

/** Shown in the header so it is never ambiguous which backend is being edited. */
export const PROJECT_ID = firebaseConfig.projectId;
export const IS_PRODUCTION = PROJECT_ID === 'delaluna-answers';
