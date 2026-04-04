import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';

// ─── Secrets (set via: firebase functions:secrets:set EMAIL_USER) ─────────────
const emailUser = defineSecret('EMAIL_USER');
const emailPass = defineSecret('EMAIL_PASS');

// ─── Init ─────────────────────────────────────────────────────────────────────
admin.initializeApp();
const db = admin.firestore();

const isEmulator = process.env.FUNCTIONS_EMULATOR === 'true';
console.log(`[functions] Running in ${isEmulator ? 'EMULATOR (dev)' : 'PRODUCTION'} mode`);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function getOtpDocRef(uid: string) {
  return db.collection('emailVerification').doc(uid);
}

function buildTransporter(user: string, pass: string) {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  });
}

// ─── sendVerificationCode ─────────────────────────────────────────────────────

export const sendVerificationCode = onCall(
  { secrets: [emailUser, emailPass]},
  
  async (request) => {
    if (!request.auth) {
      console.log(request.auth)
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    
    
    const uid = request.auth.uid;
    const email = request.auth.token.email;
    console.log("Auth: ", request.auth);

    if (!email) {
      throw new HttpsError('invalid-argument', 'No email on account.');
    }

    // Rate-limit: check if a code was sent in the last 60 seconds
    const existing = await getOtpDocRef(uid).get();
    if (existing.exists) {
      const data = existing.data()!;
      const sentAt: Timestamp = data.sentAt;
      if (sentAt) {
        const secondsAgo = (Date.now() - sentAt.toMillis()) / 1000;
        if (secondsAgo < 60) {
          throw new HttpsError(
            'resource-exhausted',
            `Please wait ${Math.ceil(60 - secondsAgo)} seconds before requesting a new code.`
          );
        }
      }
    }

    const code = generateOtp();
    const expiresAt = Timestamp.fromMillis(Date.now() + 15 * 60 * 1000);

    await getOtpDocRef(uid).set({
      code,
      email,
      expiresAt,
      sentAt: FieldValue.serverTimestamp(),
      attempts: 0,
    });

    const transporter = buildTransporter(
      emailUser.value(),
      emailPass.value()
    );

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
  }
);

// ─── verifyCode ───────────────────────────────────────────────────────────────

export const verifyCode = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const uid = request.auth.uid;
  const { code } = request.data as { code: string };

  if (!code || typeof code !== 'string' || !/^\d{6}$/.test(code)) {
    throw new HttpsError('invalid-argument', 'Code must be a 6-digit number.');
  }

  const otpRef = getOtpDocRef(uid);
  const snap = await otpRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'No verification code found. Please request a new one.');
  }

  const data = snap.data()!;
  const expiresAt: Timestamp = data.expiresAt;
  const attempts: number = data.attempts ?? 0;

  if (attempts >= 5) {
    await otpRef.delete();
    throw new HttpsError('resource-exhausted', 'Too many attempts. Please request a new code.');
  }

  if (expiresAt.toMillis() < Date.now()) {
    await otpRef.delete();
    throw new HttpsError('deadline-exceeded', 'Code has expired. Please request a new one.');
  }

  if (data.code !== code) {
    await otpRef.update({ attempts: FieldValue.increment(1) });
    const remaining = 4 - attempts;
    throw new HttpsError(
      'invalid-argument',
      remaining > 0
        ? `Incorrect code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Incorrect code.'
    );
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

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  channelId?: string;
  data?: Record<string, string>;
}

/**
 * Runs every day at 8:00 AM UTC.
 * Queries all users with a saved Expo push token and sends a morning reminder.
 */
/**
 * Runs every day at midnight UTC.
 * Deletes all chat messages older than 24 hours across all users.
 */
export const clearDailyChatHistory = onSchedule('every day 00:00', async () => {
  const cutoff = admin.firestore.Timestamp.fromMillis(Date.now() - 24 * 60 * 60 * 1000);

  const snap = await db.collectionGroup('chat')
    .where('createdAt', '<', cutoff)
    .get();

  if (snap.empty) return;

  const BATCH_SIZE = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`[clearDailyChatHistory] Deleted ${snap.docs.length} chat messages.`);
});

export const sendMorningReminder = onSchedule('every day 08:00', async () => {
  const snap = await db.collection('users')
    .where('expoPushToken', '!=', null)
    .get();

  if (snap.empty) return;

  // Deduplicate tokens — same device may appear in multiple user docs (dev/test accounts)
  const uniqueTokens = [...new Set(
    snap.docs
      .map(d => d.data().expoPushToken as string | undefined)
      .filter((token): token is string => !!token)
  )];

  const messages: ExpoPushMessage[] = uniqueTokens.map(to => ({
      to,
      sound: 'default' as const,
      title: '🌙 Your Daily Reading',
      body: 'Your horoscope and cards for today are ready.',
      channelId: 'default',
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

// ─── createConnection ─────────────────────────────────────────────────────────

export const createConnection = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const { userId, isMe, relationshipType, firstPerson, secondPerson, prompt: clientPrompt } = request.data as {
    userId: string;
    isMe: boolean;
    relationshipType: string;
    firstPerson: Record<string, string>;
    secondPerson: Record<string, string>;
    prompt?: string;
  };

  if (!userId || !relationshipType || !firstPerson || !secondPerson) {
    throw new HttpsError('invalid-argument', 'Missing required fields.');
  }

  const mapPerson = (p: Record<string, string>) => ({
    firstName: p['First Name'] ?? '',
    lastName: p['Last Name'] ?? '',
    pronouns: p['Pronouns'] ?? '',
    sun: p['Sun Sign'] ?? '',
    moon: p['Moon Sign'] ?? '',
    rising: p['Rising Sign'] ?? '',
  });

  let mappedFirst = mapPerson(firstPerson);

  if (isMe) {
    const chartSnap = await db
      .collection('users').doc(userId)
      .collection('natalChart').doc('details')
      .get();
    if (chartSnap.exists) {
      const chart = chartSnap.data()!;
      const sunPlanet = (chart.planets as any[])?.find((p: any) => p.name === 'Sun');
      mappedFirst = {
        ...mappedFirst,
        sun: sunPlanet?.sign ?? mappedFirst.sun,
        moon: chart.moon?.sign ?? mappedFirst.moon,
        rising: chart.ascendant?.sign ?? mappedFirst.rising,
      };
    }
  }

  const mappedSecond = mapPerson(secondPerson);

  const prompt = clientPrompt ?? '';

  const firstSlug = `${mappedFirst.firstName.toLowerCase()}_${mappedFirst.lastName.toLowerCase()}`;
  const secondSlug = `${mappedSecond.firstName.toLowerCase()}_${mappedSecond.lastName.toLowerCase()}`;
  const connectionId = `${firstSlug}-${secondSlug}`;

  const connectionRef = db
    .collection('users')
    .doc(userId)
    .collection('connections')
    .doc(connectionId);

  await connectionRef.set({
    connectionId,
    relationshipType,
    firstPerson: mappedFirst,
    secondPerson: mappedSecond,
    status: { state: 'pending' },
    prompt,
    createTime: FieldValue.serverTimestamp(),
  });

  return { connectionId };
});

// ─── parseConnectionCompatibility ────────────────────────────────────────────

export const parseConnectionCompatibility = onDocumentUpdated(
  'users/{userId}/connections/{connectionId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();

    if (!after?.response) return;
    if (before?.response === after.response) return;
    if (after?.compatibility) return;

    try {
      const raw = after.response as string;
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(clean);

      await event.data!.after.ref.update({
        compatibility: parsed,
        'status.state': 'complete',
      });
    } catch (err) {
      console.error('[parseConnectionCompatibility] Parse error:', err);
      await event.data!.after.ref.update({
        'status.state': 'error',
      });
    }
  }
);
