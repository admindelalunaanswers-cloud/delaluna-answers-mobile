/**
 * admin.ts
 * Hard-coded list of admin email addresses. Any signed-in user whose email
 * matches one of these gets `isAdmin: true` on their user doc and access to
 * the /(settings)/admin screen.
 *
 * Comparisons are case-insensitive.
 */

export const ADMIN_EMAILS: readonly string[] = [
  'jeanaicode@gmail.com',
  'admin.delalunaanswers@gmail.com',
  'delalunaanswers@gmail.com',
];

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized);
}
