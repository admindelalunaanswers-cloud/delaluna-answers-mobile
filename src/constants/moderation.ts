/**
 * moderation.ts — per-account feature blocks.
 *
 * An admin can switch individual features off for one user from the admin
 * dashboard (admin-web/). The block lives at `moderation/{uid}`, written only
 * by the `setUserFeatureBlocks` Cloud Function; firestore.rules gives the owner
 * read access and nobody client-side any write access, so a user can see that
 * they are blocked but cannot unblock themselves.
 *
 * It is deliberately NOT on `users/{uid}`: that document is delete-able by its
 * owner, so a block stored there could be cleared by deleting and re-creating
 * the profile.
 *
 * Enforcement has two halves and needs both:
 *
 *   - **Server** (`sendChatMessage`) is what actually stops the spend. It
 *     refuses a blocked mode before any billing happens.
 *   - **Client** (this file) is what makes it legible. Without it a blocked
 *     user taps Send and gets an opaque `permission-denied`, which reads as the
 *     app being broken rather than as a moderation decision.
 *
 * DUPLICATED as BLOCKABLE_FEATURES in functions/src/index.ts. Keep in step —
 * the server list is the enforced one; a feature present here but not there is
 * hidden in the UI while still being served if called directly.
 */

/** Shape of `moderation/{uid}`. Every field is optional — an unmoderated
 *  account simply has no document. */
export interface ModerationDoc {
  disabled?: boolean;
  blockedFeatures?: string[];
  note?: string;
}

export const BLOCKABLE_FEATURES = ['chat', 'tarot', 'connections'] as const;

export type BlockableFeature = (typeof BLOCKABLE_FEATURES)[number];

/** Human-readable labels for the admin dashboard and any in-app messaging. */
export const FEATURE_LABELS: Record<BlockableFeature, string> = {
  chat: 'AI chat',
  tarot: 'Tarot readings',
  connections: 'Connections & compatibility',
};

/**
 * Whether `feature` is blocked for this user.
 *
 * Tarot rides the chat pipeline, so blocking chat blocks tarot with it. The
 * server applies the same widening; keeping the two in agreement is what stops
 * "block chat" from leaving an open tarot route to the same model.
 */
export function isFeatureBlocked(
  moderation: ModerationDoc | null | undefined,
  feature: BlockableFeature,
): boolean {
  const blocked = moderation?.blockedFeatures;
  if (!Array.isArray(blocked) || blocked.length === 0) return false;
  if (blocked.includes(feature)) return true;
  if (feature === 'tarot' && blocked.includes('chat')) return true;
  return false;
}

/** Message shown where a blocked feature would otherwise be. */
export function blockedMessage(feature: BlockableFeature): string {
  return `${FEATURE_LABELS[feature]} is not available on your account. Contact support if you think this is a mistake.`;
}
