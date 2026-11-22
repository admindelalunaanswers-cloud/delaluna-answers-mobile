// What the sign-up funnel reports to analytics. Pure, so the values GA4 sees
// are pinned by tests rather than by whatever the step keys happen to be.
//
// Every value here comes from a fixed list: a step name, never an answer, and
// an error category, never the Firebase message (which can echo the email).

/** ChatFlow step key → the `step` value GA4 sees. Order is the funnel's order. */
const STEP_NAMES: Record<string, string> = {
  firstName: 'first_name',
  lastName: 'last_name',
  pronouns: 'pronouns',
  birthday: 'birthday',
  birthtime: 'birth_time',
  placeOfBirth: 'place_of_birth',
  email: 'email',
  password: 'password',
  final: 'confirm',
};

export function signUpStepName(key: string): string {
  return STEP_NAMES[key] ?? 'other';
}

export type SignUpFailureReason =
  | 'email_in_use'
  | 'invalid_email'
  | 'weak_password'
  | 'network'
  | 'too_many_requests'
  | 'auth_other'
  /** The account was created, but saving the profile or chart failed. */
  | 'setup';

export function signUpFailureReason(err: unknown): Exclude<SignUpFailureReason, 'setup'> {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'auth/email-already-in-use':
      return 'email_in_use';
    case 'auth/invalid-email':
      return 'invalid_email';
    case 'auth/weak-password':
      return 'weak_password';
    case 'auth/network-request-failed':
      return 'network';
    case 'auth/too-many-requests':
      return 'too_many_requests';
    default:
      return 'auth_other';
  }
}
