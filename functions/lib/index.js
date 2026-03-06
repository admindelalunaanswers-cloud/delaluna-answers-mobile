"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMorningReminder = exports.verifyCode = exports.sendVerificationCode = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const params_1 = require("firebase-functions/params");
const nodemailer = require("nodemailer");
// ─── Secrets (set via: firebase functions:secrets:set EMAIL_USER) ─────────────
const emailUser = (0, params_1.defineSecret)('EMAIL_USER');
const emailPass = (0, params_1.defineSecret)('EMAIL_PASS');
// ─── Init ─────────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();
// ─── Helpers ─────────────────────────────────────────────────────────────────
function generateOtp() {
    return String(Math.floor(100000 + Math.random() * 900000));
}
function getOtpDocRef(uid) {
    return db.collection('emailVerification').doc(uid);
}
function buildTransporter(user, pass) {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass },
    });
}
// ─── sendVerificationCode ─────────────────────────────────────────────────────
exports.sendVerificationCode = (0, https_1.onCall)({ secrets: [emailUser, emailPass] }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const email = request.auth.token.email;
    if (!email) {
        throw new https_1.HttpsError('invalid-argument', 'No email on account.');
    }
    // Rate-limit: check if a code was sent in the last 60 seconds
    const existing = await getOtpDocRef(uid).get();
    if (existing.exists) {
        const data = existing.data();
        const sentAt = data.sentAt;
        if (sentAt) {
            const secondsAgo = (Date.now() - sentAt.toMillis()) / 1000;
            if (secondsAgo < 60) {
                throw new https_1.HttpsError('resource-exhausted', `Please wait ${Math.ceil(60 - secondsAgo)} seconds before requesting a new code.`);
            }
        }
    }
    const code = generateOtp();
    console.log(`[sendVerificationCode] OTP for ${email} (uid: ${uid}): ${code}`);
    const expiresAt = firestore_1.Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);
    await getOtpDocRef(uid).set({
        code,
        email,
        expiresAt,
        sentAt: firestore_1.FieldValue.serverTimestamp(),
        attempts: 0,
    });
    const transporter = buildTransporter(emailUser.value(), emailPass.value());
    await transporter.sendMail({
        from: `"Delaluna Answers" <${emailUser.value()}>`,
        to: email,
        subject: 'Your Delaluna verification code',
        html: `
        <div style="background:#0d0d1a;padding:40px 24px;font-family:sans-serif;color:#e6e9f0;max-width:480px;margin:0 auto;border-radius:12px;">
          <h2 style="color:#a78bfa;margin:0 0 8px;">Delaluna Answers</h2>
          <p style="color:#9ca3af;margin:0 0 32px;font-size:14px;">Your cosmic journey awaits</p>

          <p style="margin:0 0 16px;">Enter this code in the app to verify your email:</p>

          <div style="background:#1a1a2e;border:1px solid rgba(167,139,250,0.4);border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
            <span style="font-size:40px;font-weight:700;letter-spacing:12px;color:#a78bfa;">${code}</span>
          </div>

          <p style="color:#6b7280;font-size:13px;margin:0;">This code expires in <strong style="color:#e6e9f0;">15 minutes</strong>. If you didn't sign up for Delaluna, you can safely ignore this email.</p>
        </div>
      `,
    });
    return { sent: true };
});
// ─── verifyCode ───────────────────────────────────────────────────────────────
exports.verifyCode = (0, https_1.onCall)(async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError('unauthenticated', 'Must be signed in.');
    }
    const uid = request.auth.uid;
    const { code } = request.data;
    if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        throw new https_1.HttpsError('invalid-argument', 'Code must be a 6-digit number.');
    }
    const otpRef = getOtpDocRef(uid);
    const snap = await otpRef.get();
    if (!snap.exists) {
        throw new https_1.HttpsError('not-found', 'No verification code found. Please request a new one.');
    }
    const data = snap.data();
    const expiresAt = data.expiresAt;
    const attempts = (_a = data.attempts) !== null && _a !== void 0 ? _a : 0;
    if (attempts >= 5) {
        await otpRef.delete();
        throw new https_1.HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
    }
    if (expiresAt.toMillis() < Date.now()) {
        await otpRef.delete();
        throw new https_1.HttpsError('deadline-exceeded', 'Code has expired. Please request a new one.');
    }
    if (data.code !== code) {
        await otpRef.update({ attempts: firestore_1.FieldValue.increment(1) });
        const remaining = 4 - attempts;
        throw new https_1.HttpsError('invalid-argument', remaining > 0
            ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
            : 'Incorrect code.');
    }
    // Code is correct — mark email as verified
    await admin.auth().updateUser(uid, { emailVerified: true });
    await db.collection('users').doc(uid).update({ isEmailVerified: true });
    await otpRef.delete();
    return { verified: true };
});
// ─── sendMorningReminder ──────────────────────────────────────────────────────
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const PUSH_CHUNK_SIZE = 100;
/**
 * Runs every day at 8:00 AM UTC.
 * Queries all users with a saved Expo push token and sends a morning reminder.
 */
exports.sendMorningReminder = (0, scheduler_1.onSchedule)('every day 08:00', async () => {
    const snap = await db.collection('users')
        .where('expoPushToken', '!=', null)
        .get();
    if (snap.empty)
        return;
    const messages = snap.docs
        .map(d => d.data().expoPushToken)
        .filter((token) => !!token)
        .map(to => ({
        to,
        sound: 'default',
        title: '🌙 Your Daily Reading',
        body: 'Your horoscope and cards for today are ready.',
        data: { screen: '/(main)' },
    }));
    for (let i = 0; i < messages.length; i += PUSH_CHUNK_SIZE) {
        const chunk = messages.slice(i, i + PUSH_CHUNK_SIZE);
        await fetch(EXPO_PUSH_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify(chunk),
        });
    }
});
//# sourceMappingURL=index.js.map