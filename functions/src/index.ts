import * as admin from 'firebase-admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import * as nodemailer from 'nodemailer';
import { z, ZodError, ZodType } from 'zod';

// ─── Secrets (set via: firebase functions:secrets:set EMAIL_USER) ─────────────
const emailUser = defineSecret('EMAIL_USER');
const emailPass = defineSecret('EMAIL_PASS');

// Comma-separated list of admin email addresses. Held server-side only so
// rotation does not require shipping a new mobile build. Matched
// case-insensitively against the verified email on the caller's auth token.
const adminEmails = defineSecret('ADMIN_EMAILS');

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

// Validate a callable's `request.data` against a Zod schema. Throws an
// `invalid-argument` HttpsError with the first formatted issue on failure.
function parseInput<T>(schema: ZodType<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (err) {
    if (err instanceof ZodError) {
      const issue = err.issues[0];
      const path = issue.path.join('.') || '<root>';
      throw new HttpsError(
        'invalid-argument',
        `Invalid input at "${path}": ${issue.message}`,
      );
    }
    throw err;
  }
}

// Constrain a free-form name to a Firestore-document-id-safe slug.
// - lowercase
// - alphanumerics + dashes only
// - collapse runs of unsafe chars to a single dash
// - trim leading/trailing dashes
// - cap to 40 chars
// Returns 'unknown' for empty results so we never produce a forbidden
// document id (Firestore rejects '', '.', '..', and ids containing '/').
function slugify(input: string): string {
  const cleaned = input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return cleaned || 'unknown';
}

// Cap user-supplied LLM prompts and collapse control chars / whitespace.
// Caps at 32 KB - well under any model's context window and large enough
// for the compatibility-prompt template (5.7 KB) plus two ~8 KB natal-chart
// JSON payloads. Replaces ASCII control chars with spaces and folds
// whitespace runs so we don't slip terminator sequences through to the
// Handlebars-substituted prompt template.
function sanitizePrompt(input: string | undefined, maxLen = 32000): string {
  if (!input) return '';
  return input
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, maxLen)
    .trim();
}


// ─── Schemas ─────────────────────────────────────────────────────────────────

const VerifyCodeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Code must be a 6-digit number.'),
});

const DeleteConnectionSchema = z.object({
  userId: z.string().min(1).max(128),
  connectionId: z.string().min(1).max(200).regex(/^[A-Za-z0-9_\-]+$/, 'Invalid connectionId.'),
});

const PersonSchema = z.object({
  'First Name': z.string().max(80).optional(),
  'Last Name': z.string().max(80).optional(),
  'Pronouns': z.string().max(40).optional(),
  'Sun Sign': z.string().max(40).optional(),
  'Moon Sign': z.string().max(40).optional(),
  'Rising Sign': z.string().max(40).optional(),
  'Birthday': z.string().max(40).optional(),
  'Time of Birth': z.string().max(40).optional(),
  'Place of Birth': z.string().max(200).optional(),
  birthLat: z.number().min(-90).max(90).nullable().optional(),
  birthLon: z.number().min(-180).max(180).nullable().optional(),
  birthTimezone: z.number().min(-14).max(14).nullable().optional(),
  isBirthTimeUnknown: z.boolean().optional(),
  isPlaceOfBirthUnknown: z.boolean().optional(),
}).passthrough();

const CreateConnectionSchema = z.object({
  userId: z.string().min(1).max(128),
  isMe: z.boolean().optional().default(false),
  relationshipType: z.string().min(1).max(60),
  firstPerson: PersonSchema,
  secondPerson: PersonSchema,
  prompt: z.string().max(32000).optional(),
  birthDetailsChangeCount: z.number().int().nonnegative().optional(),
});

// ─── sendVerificationCode ─────────────────────────────────────────────────────

export const sendVerificationCode = onCall(
  { secrets: [emailUser, emailPass], invoker: 'public' },
  
  async (request) => {
    if (!request.auth) {
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

export const verifyCode = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const uid = request.auth.uid;
  const { code } = parseInput(VerifyCodeSchema, request.data);

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

// ─── syncAdminClaim ──────────────────────────────────────────────────────────

/**
 * Idempotently reconciles the caller's admin status against the server-side
 * email allowlist (`ADMIN_EMAILS` secret). Sets the `admin: true` custom
 * auth claim when the verified email matches, removes it otherwise.
 * Mirrors `users/{uid}.isAdmin` so existing UI hints still work; security
 * rules MUST gate on `request.auth.token.admin == true`, not the doc field.
 *
 * The client should call this on every app start and force-refresh the ID
 * token after a successful response (`user.getIdToken(true)`) so the new
 * claim takes effect immediately.
 */
export const syncAdminClaim = onCall(
  { secrets: [adminEmails], invoker: 'public' },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Must be signed in.');
    }

    const uid = request.auth.uid;
    const email = (request.auth.token.email ?? '').toLowerCase();
    const emailVerified = request.auth.token.email_verified === true;

    const allowed = adminEmails
      .value()
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    const shouldBeAdmin = emailVerified && !!email && allowed.includes(email);

    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = (userRecord.customClaims ?? {}) as Record<string, unknown>;
    const isCurrentlyAdmin = existingClaims.admin === true;

    if (shouldBeAdmin === isCurrentlyAdmin) {
      return { admin: shouldBeAdmin, changed: false };
    }

    const nextClaims: Record<string, unknown> = { ...existingClaims };
    if (shouldBeAdmin) {
      nextClaims.admin = true;
    } else {
      delete nextClaims.admin;
    }
    await admin.auth().setCustomUserClaims(uid, nextClaims);

    // Mirror to Firestore for client-side UI (e.g. showing the admin tab).
    // Privilege itself is enforced via the auth claim, not this field.
    await db
      .collection('users')
      .doc(uid)
      .set({ isAdmin: shouldBeAdmin }, { merge: true });

    console.log(
      `[syncAdminClaim] uid=${uid} email=${email} -> admin=${shouldBeAdmin}`,
    );

    return { admin: shouldBeAdmin, changed: true };
  },
);

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
  priority?: 'default' | 'normal' | 'high';
  _contentAvailable?: boolean;
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

  const snap = await db.collectionGroup('updayedChat')
    .where('createTime', '<', cutoff)
    .get();

  if (snap.empty) return;

  const BATCH_SIZE = 500;
  for (let i = 0; i < snap.docs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_SIZE).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

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
      priority: 'high',
      _contentAvailable: true,
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

// ─── deleteConnection ─────────────────────────────────────────────────────────

export const deleteConnection = onCall({ invoker: 'public' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const { userId, connectionId } = parseInput(DeleteConnectionSchema, request.data);

  // Only allow users to delete their own connections
  if (request.auth.uid !== userId) {
    throw new HttpsError('permission-denied', 'You can only delete your own connections.');
  }

  const connectionRef = db
    .collection('users')
    .doc(userId)
    .collection('connections')
    .doc(connectionId);

  const snap = await connectionRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Connection not found.');
  }

  await connectionRef.delete();

  return { deleted: true };
});

// ─── createConnection ─────────────────────────────────────────────────────────

export const createConnection = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Must be signed in.');
  }

  const {
    userId,
    isMe,
    relationshipType,
    firstPerson,
    secondPerson,
    prompt: clientPrompt,
    birthDetailsChangeCount,
  } = parseInput(CreateConnectionSchema, request.data);

  // Only allow users to create connections under their own user doc
  if (request.auth.uid !== userId) {
    throw new HttpsError('permission-denied', 'You can only create your own connections.');
  }

  type ValidatedPerson = z.infer<typeof PersonSchema>;
  const mapPerson = (p: ValidatedPerson) => ({
    firstName: p['First Name'] ?? '',
    lastName: p['Last Name'] ?? '',
    pronouns: p['Pronouns'] ?? '',
    sun: p['Sun Sign'] ?? '',
    moon: p['Moon Sign'] ?? '',
    rising: p['Rising Sign'] ?? '',
    birthday: p['Birthday'] ?? '',
    timeOfBirth: p['Time of Birth'] ?? '',
    placeOfBirth: p['Place of Birth'] ?? '',
    birthLat: typeof p.birthLat === 'number' ? p.birthLat : null,
    birthLon: typeof p.birthLon === 'number' ? p.birthLon : null,
    birthTimezone: typeof p.birthTimezone === 'number' ? p.birthTimezone : null,
    isBirthTimeUnknown: !!p.isBirthTimeUnknown,
    isPlaceOfBirthUnknown: !!p.isPlaceOfBirthUnknown,
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

  const prompt = sanitizePrompt(clientPrompt);

  const firstSlug = `${slugify(mappedFirst.firstName)}_${slugify(mappedFirst.lastName)}`;
  const secondSlug = `${slugify(mappedSecond.firstName)}_${slugify(mappedSecond.lastName)}`;
  const connectionId = `${firstSlug}-${secondSlug}`;

  const connectionRef = db
    .collection('users')
    .doc(userId)
    .collection('connections')
    .doc(connectionId);

  const reportRef = connectionRef.collection('report').doc('details');

  const existingSnap = await connectionRef.get();
  const isNew = !existingSnap.exists;

  await connectionRef.set(
    {
      connectionId,
      relationshipType,
      firstPerson: mappedFirst,
      secondPerson: mappedSecond,
      status: { state: 'pending' },
      birthDetailsChangeCount:
        typeof birthDetailsChangeCount === 'number'
          ? birthDetailsChangeCount
          : existingSnap.data()?.birthDetailsChangeCount ?? 0,
      // Stamp createTime only on first creation; preserve it on edits
      ...(isNew ? { createTime: FieldValue.serverTimestamp() } : {}),
      // Clear any previous compatibility so the UI shows pending until the new report parses
      compatibility: FieldValue.delete(),
    },
    { merge: true },
  );

  // Write the prompt to a child doc the chatbot extension watches in isolation.
  // Single doc per connection in its own subcollection ⇒ no prior turns to inherit.
  await reportRef.set(
    {
      prompt,
      response: FieldValue.delete(),
      requestedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { connectionId };
});

// ─── Push helper ─────────────────────────────────────────────────────────────

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

/**
 * Sends a single Expo push notification and logs the response.
 * Logs Expo Push API errors (DeviceNotRegistered, InvalidCredentials, etc.)
 * so we can diagnose why a push didn't arrive.
 */
async function sendExpoPush(
  userId: string,
  token: string,
  payload: PushPayload,
  context: string,
): Promise<void> {
  const message = {
    to: token,
    sound: 'default' as const,
    title: payload.title,
    body: payload.body,
    channelId: 'default',
    data: payload.data ?? {},
    priority: 'high' as const,
    _contentAvailable: true,
  };

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const json = await res.json().catch(() => null);

    // Expo returns 200 even when individual messages have errors — check the data array
    const ticket = json?.data?.[0] ?? json?.data;
    if (ticket?.status === 'error') {
      console.error(`[${context}] Push ticket error for user ${userId}:`, ticket);
    }
  } catch (err) {
    console.error(`[${context}] Push send failed for user ${userId}:`, err);
  }
}

// ─── notifyBreakdownReady ────────────────────────────────────────────────────

/**
 * When the Firebase Extension writes a `response` to the natal chart breakdown
 * document, send a push notification to the user — works whether the app is
 * in the foreground, background, or killed.
 */
export const notifyBreakdownReady = onDocumentUpdated(
  'users/{userId}/natalChart/details',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const userId = event.params.userId;


    // Only fire when a new response appears
    if (!after?.response) {
      console.info(`[notifyBreakdownReady] Skip — no response field on doc`);
      return;
    }
    if (before?.response === after.response) {
      console.info(`[notifyBreakdownReady] Skip — response unchanged`);
      return;
    }

    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken as string | undefined;
    if (!token) {
      console.info(`[notifyBreakdownReady] Skip — user ${userId} has no expoPushToken`);
      return;
    }

    await sendExpoPush(userId, token, {
      title: 'Your Birth Chart is Ready',
      body: 'Your natal chart breakdown is complete. Tap to explore your cosmic blueprint.',
      data: { screen: '/(home)/birth-chart-view' },
    }, 'notifyBreakdownReady');
  }
);

// ─── notifyChatReply ─────────────────────────────────────────────────────────

/**
 * When the Firebase Extension writes a `response` to a chat message doc,
 * send a push notification so the user sees the reply even if the app is
 * backgrounded or killed.
 */
export const notifyChatReply = onDocumentUpdated(
  'users/{userId}/updayedChat/{messageId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const userId = event.params.userId;

    console.log(`[notifyChatReply] Triggered for user ${userId}`);

    if (!after?.response) {
      console.log(`[notifyChatReply] Skip — no response field on doc`);
      return;
    }
    if (before?.response === after.response) {
      console.log(`[notifyChatReply] Skip — response unchanged`);
      return;
    }

    const userSnap = await db.collection('users').doc(userId).get();
    const token = userSnap.data()?.expoPushToken as string | undefined;
    if (!token) {
      console.log(`[notifyChatReply] Skip — user ${userId} has no expoPushToken`);
      return;
    }

    await sendExpoPush(userId, token, {
      title: 'New Message',
      body: 'Your cosmic advisor has replied. Tap to read.',
      data: { screen: '/(main)/chat' },
    }, 'notifyChatReply');
  }
);

// ─── parseConnectionCompatibility ────────────────────────────────────────────

export const parseConnectionCompatibility = onDocumentUpdated(
  'users/{userId}/connections/{connectionId}/report/{reportId}',
  async (event) => {
    const before = event.data?.before?.data();
    const after = event.data?.after?.data();
    const { userId, connectionId } = event.params;

    if (!after?.response) return;
    if (before?.response === after.response) return;

    const connectionRef = db
      .collection('users').doc(userId)
      .collection('connections').doc(connectionId);

    try {
      const raw = after.response as string;
      const clean = raw.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(clean);

      await connectionRef.update({
        compatibility: parsed,
        'status.state': 'complete',
      });
    } catch (err) {
      console.error('[parseConnectionCompatibility] Parse error:', err);
      await connectionRef.update({
        'status.state': 'error',
      });
    }
  }
);
