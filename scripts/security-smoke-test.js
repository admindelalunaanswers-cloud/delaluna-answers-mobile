#!/usr/bin/env node
/**
 * Exercises the two fixes from the 2026-10-21 security review against the
 * local emulators:
 *
 *   1. Forged chat refunds — a client-created message carrying a billing
 *      receipt must be refused by the rules, and refused by sendChatMessage's
 *      retry path even when it gets past the rules (as it would under the
 *      production rules until the planned rules release).
 *   2. Unmetered generations — runAnchoredGeneration's daily limit, the
 *      connections moderation block, the admin exemption, and the rules'
 *      32,000-character prompt cap.
 *   5. Performance-log writes — the field allowlist, size caps and slug check.
 *   6. Time-zone offsets — an invented offset bills against the UTC day.
 *   7. Verification codes — parallel guesses cannot exceed the five-attempt cap.
 *
 * (Numbers follow the review's findings; 3 is the --production mode below.)
 *
 * Run it through emulators:exec so the emulators start clean and stop after:
 *
 *   firebase emulators:exec --only auth,functions,firestore \
 *     --project demo-delaluna "node scripts/security-smoke-test.js"
 *
 * The `demo-` project id keeps every call local, and no Gemini key is needed:
 * the checks read the ledger and the refusals, which happen before any model
 * call. A generation that is let through fails without a key, which is fine.
 *
 * A second mode checks fix 3 — production must not count sandbox or Test Store
 * purchases. That code path only switches on under the production project id,
 * so this mode runs the compiled sendChatMessage in-process through `.run()`
 * against the Auth and Firestore emulators only. No functions emulator, so no
 * trigger fires and nothing reaches a real service:
 *
 *   (cd functions && npm run build)
 *   firebase emulators:exec --only auth,firestore \
 *     --project delaluna-answers "node scripts/security-smoke-test.js --production"
 *
 * Exits non-zero if any check fails.
 */

const path = require('path');

if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
  console.error('Refusing to run: FIRESTORE_EMULATOR_HOST and FIREBASE_AUTH_EMULATOR_HOST must be set.');
  console.error('Run it through `firebase emulators:exec` (see the header of this file).');
  process.exit(2);
}

// firebase-admin is a functions dependency, not an app one.
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
const { initializeApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, signInWithEmailAndPassword } = require('firebase/auth');
const {
  getFirestore, connectFirestoreEmulator, doc, setDoc, addDoc, collection, serverTimestamp,
} = require('firebase/firestore');
const { getFunctions, connectFunctionsEmulator, httpsCallable } = require('firebase/functions');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-delaluna';
const PRODUCTION_MODE = process.argv.includes('--production');
const [fsHost, fsPort] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const [fnHost, fnPort] = (process.env.FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001').split(':');

if (PRODUCTION_MODE && PROJECT !== 'delaluna-answers') {
  console.error('--production must run under --project delaluna-answers (still on the emulators).');
  process.exit(2);
}

// In production mode the compiled functions are loaded in this process; they
// initialise the default app themselves, sharing this firebase-admin instance.
// Real credentials are dropped so nothing outside the emulators can authenticate.
let functionsLib = null;
if (PRODUCTION_MODE) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
  functionsLib = require(path.join(__dirname, '..', 'functions', 'lib', 'index.js'));
}
if (!admin.apps.length) admin.initializeApp({ projectId: PROJECT });
const adb = admin.firestore();

const UTC_DAY = new Date().toISOString().slice(0, 10);
const PASSWORD = 'smoke-test-password';

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** A signed-in client for a fresh emulator user, plus that user's uid. */
async function client(label, { verified = true, claims } = {}) {
  const email = `${label}-${Date.now()}@example.com`;
  const user = await admin.auth().createUser({ email, password: PASSWORD, emailVerified: verified });
  if (claims) await admin.auth().setCustomUserClaims(user.uid, claims);
  await adb.doc(`users/${user.uid}`).set({ timezoneOffsetMinutes: 0 });

  const app = initializeApp({ apiKey: 'demo-key', projectId: PROJECT }, label);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  await signInWithEmailAndPassword(auth, email, PASSWORD);
  const db = getFirestore(app);
  connectFirestoreEmulator(db, fsHost, Number(fsPort));
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, fnHost, Number(fnPort));
  return { uid: user.uid, db, fns };
}

/** Resolves to the error code a promise rejects with, or 'ok'. */
async function outcome(promise) {
  try {
    await promise;
    return 'ok';
  } catch (err) {
    return err.code || err.message;
  }
}

/** Polls until `test(data)` holds for the document, or times out. */
async function waitFor(ref, test, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const data = (await ref.get()).data();
    if (data && test(data)) return data;
    if (Date.now() > end) return data ?? null;
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function forgedRefund() {
  console.log('\n— Fix 2: forged chat refunds');
  const { uid, db, fns } = await client('refund');
  const forged = {
    userMessage: 'hi', prompt: '', status: { state: 'ERROR' },
    billedDay: UTC_DAY, billedCredit: true,
  };

  check(
    'rules refuse a client-created message carrying a receipt',
    (await outcome(addDoc(collection(db, 'users', uid, 'updayedChat'), forged))) === 'permission-denied',
  );
  check(
    'rules still allow a restored-session message',
    (await outcome(addDoc(collection(db, 'users', uid, 'updayedChat'), {
      userMessage: 'hi', prompt: '', response: 'hello', status: { state: 'COMPLETED' },
    }))) === 'ok',
  );

  // Past the rules — what production allows until the rules release ships.
  const usage = adb.collection(`users/${uid}/chatUsage`);
  await usage.doc(UTC_DAY).set({ count: 3 });
  await usage.doc('_credits').set({ consumed: 2 });
  const forgedRef = await adb.collection(`users/${uid}/updayedChat`).add(forged);

  const send = httpsCallable(fns, 'sendChatMessage');
  const code = await outcome(send({ userMessage: 'hi', prompt: 'hi', retryOf: forgedRef.id }));
  check('sendChatMessage refuses to retry a forged message', code === 'functions/failed-precondition', code);
  check('the day ledger is unchanged', (await usage.doc(UTC_DAY).get()).data().count === 3);
  check('the credit ledger is unchanged', (await usage.doc('_credits').get()).data().consumed === 2);
  check('the forged message was not consumed', (await forgedRef.get()).exists);
}

async function generationLimits() {
  console.log('\n— Fix 1: generation limits');
  const { uid, db } = await client('limits', { verified: false });
  const usageRef = adb.doc(`users/${uid}/generationUsage/${UTC_DAY}`);

  check(
    'rules refuse a client write to generationUsage',
    (await outcome(setDoc(doc(db, 'users', uid, 'generationUsage', UTC_DAY), { generateHoroscope: 0 })))
      === 'permission-denied',
  );
  check(
    'rules refuse a 32,001-character prompt',
    (await outcome(setDoc(doc(db, 'users', uid, 'horoscope', '2099-01-01'), {
      prompt: 'x'.repeat(32001), requestedAt: serverTimestamp(),
    }))) === 'permission-denied',
  );

  // Under the limit: the request is counted when it is claimed.
  await setDoc(doc(db, 'users', uid, 'natalChart', 'details'), {
    prompt: 'smoke test', requestedAt: serverTimestamp(),
  });
  const counted = await waitFor(usageRef, (d) => d.generateNatalBreakdown === 1);
  check('a generation under the limit is counted', counted?.generateNatalBreakdown === 1, JSON.stringify(counted));

  // At the limit: refused, uncounted, and allowed before email verification.
  await usageRef.set({ generateHoroscope: 20 }, { merge: true });
  const horoscope = doc(db, 'users', uid, 'horoscope', '2099-01-02');
  check(
    'an unverified owner can still write a 32,000-character prompt',
    (await outcome(setDoc(horoscope, { prompt: 'x'.repeat(32000), requestedAt: serverTimestamp() }))) === 'ok',
  );
  const refused = await waitFor(adb.doc(horoscope.path), (d) => d.status?.state === 'ERROR');
  check(
    'a generation at the limit is refused',
    /Daily limit/.test(refused?.status?.error ?? ''),
    JSON.stringify(refused?.status),
  );
  check('the refusal is not counted', (await usageRef.get()).data().generateHoroscope === 20);
}

async function moderation() {
  console.log('\n— Fix 1: connections moderation block');
  const { uid, db } = await client('blocked');
  await adb.doc(`moderation/${uid}`).set({ blockedFeatures: ['connections'] });

  const reading = doc(db, 'users', uid, 'connections', 'c1', 'synastryReading', 'r1');
  await setDoc(reading, { prompt: 'smoke test', requestedAt: serverTimestamp() });
  const refused = await waitFor(adb.doc(reading.path), (d) => d.status?.state === 'ERROR');
  check(
    'a blocked user\'s direct synastry write is refused',
    /not available/.test(refused?.status?.error ?? ''),
    JSON.stringify(refused?.status),
  );
}

async function adminExempt() {
  console.log('\n— Fix 1: admin exemption');
  const { uid, db } = await client('admin', { claims: { admin: true } });
  const usageRef = adb.doc(`users/${uid}/generationUsage/${UTC_DAY}`);
  await usageRef.set({ generateTransitReading: 10 });

  await setDoc(doc(db, 'users', uid, 'transits', '2099-01-01'), {
    prompt: 'smoke test', requestedAt: serverTimestamp(),
  });
  const after = await waitFor(usageRef, (d) => d.generateTransitReading === 11);
  check('an admin past the limit still generates', after?.generateTransitReading === 11, JSON.stringify(after));
}

const CHAT_PACK = 'delaluna.iap.chat_pack_1';
const PREMIUM = 'Delaluna Answers Pro';
const SANDBOX = { store: 'app_store', is_sandbox: true };
const TEST_STORE = { store: 'test_store', is_sandbox: true };
const PAID = { store: 'app_store', is_sandbox: false };

/**
 * A user whose daily allowance is spent (`count` questions today), with the
 * given RevenueCat mirror. Returns the uid.
 */
async function meteredUser(label, count, subscriber) {
  const user = await admin.auth().createUser({ email: `${label}-${Date.now()}@example.com` });
  await adb.doc(`users/${user.uid}`).set({ timezoneOffsetMinutes: 0 });
  await adb.doc(`users/${user.uid}/chatUsage/${UTC_DAY}`).set({ count });
  await adb.doc(`subscriptions/purchaser-info/customers/${user.uid}`).set({ subscriber });
  return user.uid;
}

/** A premium entitlement backed by one subscription record. */
function premiumBackedBy(record) {
  const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
  return {
    entitlements: { [PREMIUM]: { product_identifier: 'pro_monthly', expires_date: expires } },
    subscriptions: { pro_monthly: { ...record, expires_date: expires } },
  };
}

/** Sends one question through the compiled function, returning the error code or 'ok'. */
async function sendAs(uid) {
  return outcome(functionsLib.sendChatMessage.run({
    data: { userMessage: 'hi', prompt: 'hi' },
    auth: { uid, token: { email_verified: true } },
    rawRequest: {},
  }));
}

async function productionPurchases() {
  console.log('\n— Fix 3: production ignores unpaid purchases');
  const exhausted = 'resource-exhausted';

  // Allowance spent (5 = the premium limit), so only purchased credits matter.
  const credit = (record) => ({ non_subscriptions: { [CHAT_PACK]: [record] } });
  check('a sandbox chat pack is not counted',
    (await sendAs(await meteredUser('sandbox-pack', 5, credit(SANDBOX)))) === exhausted);
  check('a Test Store chat pack is not counted',
    (await sendAs(await meteredUser('test-store-pack', 5, credit(TEST_STORE)))) === exhausted);
  const paidUid = await meteredUser('paid-pack', 5, credit(PAID));
  check('a paid chat pack is counted', (await sendAs(paidUid)) === 'ok');
  check('the paid pack was drawn down',
    (await adb.doc(`users/${paidUid}/chatUsage/_credits`).get()).data()?.consumed === 1);
  check('a purchase with no sandbox flags is still counted',
    (await sendAs(await meteredUser('unflagged-pack', 5, credit({})))) === 'ok');

  // Free allowance spent (2), premium's (5) not: premium decides the outcome.
  check('a sandbox subscription does not make the user premium',
    (await sendAs(await meteredUser('sandbox-pro', 2, premiumBackedBy(SANDBOX)))) === exhausted);
  check('a paid subscription makes the user premium',
    (await sendAs(await meteredUser('paid-pro', 2, premiumBackedBy(PAID)))) === 'ok');

  // The App Store review login (REVIEW_ACCOUNT_UIDS) buys with sandbox, so its
  // purchases must still count; everyone else's stay refused.
  const reviewPack = await meteredUser('review-pack', 5, credit(SANDBOX));
  const reviewPro = await meteredUser('review-pro', 2, premiumBackedBy(SANDBOX));
  const otherPack = await meteredUser('not-review-pack', 5, credit(SANDBOX));
  process.env.REVIEW_ACCOUNT_UIDS = ` ${reviewPack}, ${reviewPro} `;
  try {
    check('the review account\'s sandbox chat pack is counted', (await sendAs(reviewPack)) === 'ok');
    check('the review account\'s sandbox subscription makes it premium',
      (await sendAs(reviewPro)) === 'ok');
    check('another user\'s sandbox chat pack is still not counted',
      (await sendAs(otherPack)) === exhausted);
  } finally {
    delete process.env.REVIEW_ACCOUNT_UIDS;
  }
}

async function perfLogLimits() {
  console.log('\n— Fix 5: performance-log writes');
  const { uid, db } = await client('perf');
  const event = {
    screen: 'Chat', screenPath: '/(main)/chat', metricType: 'screen_load', durationMs: 120,
    userId: uid, isPro: false, sessionId: 's1', appVersion: '1.1.0', environment: 'development',
    os: 'ios', timestamp: serverTimestamp(),
  };
  const events = (slug) => collection(db, 'performanceLogs', slug, 'events');

  check('a well-formed event is accepted', (await outcome(addDoc(events('chat'), event))) === 'ok');
  check('an event with an extra field is refused',
    (await outcome(addDoc(events('chat'), { ...event, payload: 'x' }))) === 'permission-denied');
  check('an oversized error message is refused',
    (await outcome(addDoc(events('chat'), {
      ...event, metricType: 'error', errorMessage: 'x'.repeat(2001),
    }))) === 'permission-denied');
  check('an unknown metric type is refused',
    (await outcome(addDoc(events('chat'), { ...event, metricType: 'anything' }))) === 'permission-denied');
  check('a screen id the app never produces is refused',
    (await outcome(addDoc(events('Not_A_Slug'), event))) === 'permission-denied');
}

async function timezoneOffsets() {
  console.log('\n— Fix 6: invented time-zone offsets');
  const { uid, db, fns } = await client('timezone');

  check('rules refuse an offset outside −12:00…+14:00',
    (await outcome(setDoc(doc(db, 'users', uid), { timezoneOffsetMinutes: 1_000_000 }, { merge: true })))
      === 'permission-denied');
  check('rules accept a real offset',
    (await outcome(setDoc(doc(db, 'users', uid), { timezoneOffsetMinutes: 330 }, { merge: true }))) === 'ok');

  // Past the rules: today's allowance spent (5 = the premium limit), and an
  // offset that would name a day no ledger has touched.
  await adb.doc(`users/${uid}`).set({ timezoneOffsetMinutes: 1_000_000 }, { merge: true });
  await adb.doc(`users/${uid}/chatUsage/${UTC_DAY}`).set({ count: 5 });
  const code = await outcome(httpsCallable(fns, 'sendChatMessage')({ userMessage: 'hi', prompt: 'hi' }));
  check('an invented offset bills against the UTC day, not a fresh one',
    code === 'functions/resource-exhausted', code);
}

async function otpAttempts() {
  console.log('\n— Fix 7: verification-code attempts');
  const { uid, fns } = await client('otp', { verified: false });
  const email = (await admin.auth().getUser(uid)).email.toLowerCase();
  const seed = () => adb.doc(`emailVerification/${uid}`).set({
    code: 'ABC234', email, attempts: 0,
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000),
  });
  const verify = httpsCallable(fns, 'verifyCode');

  await seed();
  const results = await Promise.all(
    Array.from({ length: 20 }, () => outcome(verify({ code: 'ZZZ999' }))),
  );
  const judged = results.filter((r) => r === 'functions/invalid-argument').length;
  check('20 parallel wrong guesses get at most 5 judged', judged <= 5, `${judged} judged`);
  check('the right code no longer works after them',
    (await outcome(verify({ code: 'ABC234' }))) !== 'ok');

  await seed();
  check('the right code works on a fresh code', (await outcome(verify({ code: 'abc234' }))) === 'ok');
  check('and verifies the account', (await admin.auth().getUser(uid)).emailVerified === true);
  check('and is spent', !(await adb.doc(`emailVerification/${uid}`).get()).exists);
}

async function testProjectHonoursSandbox() {
  console.log('\n— Fix 3: the test project still counts sandbox purchases');
  const { uid, fns } = await client('qa-pack');
  await adb.doc(`users/${uid}/chatUsage/${UTC_DAY}`).set({ count: 5 });
  await adb.doc(`subscriptions/purchaser-info/customers/${uid}`).set({
    subscriber: { non_subscriptions: { [CHAT_PACK]: [TEST_STORE] } },
  });
  const code = await outcome(httpsCallable(fns, 'sendChatMessage')({ userMessage: 'hi', prompt: 'hi' }));
  check('a Test Store chat pack is counted on test', code === 'ok', code);
}

(async () => {
  if (PRODUCTION_MODE) {
    await productionPurchases();
  } else {
    await forgedRefund();
    await generationLimits();
    await moderation();
    await adminExempt();
    await testProjectHonoursSandbox();
    await perfLogLimits();
    await timezoneOffsets();
    await otpAttempts();
  }
  console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
