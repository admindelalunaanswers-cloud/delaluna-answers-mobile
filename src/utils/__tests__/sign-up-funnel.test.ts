import { signUpFailureReason, signUpStepName } from '@/src/utils/sign-up-funnel';

describe('signUpStepName', () => {
  it.each([
    ['firstName', 'first_name'],
    ['lastName', 'last_name'],
    ['pronouns', 'pronouns'],
    ['birthday', 'birthday'],
    ['birthtime', 'birth_time'],
    ['placeOfBirth', 'place_of_birth'],
    ['email', 'email'],
    ['password', 'password'],
    ['final', 'confirm'],
  ])('%s → %s', (key, expected) => {
    expect(signUpStepName(key)).toBe(expected);
  });

  // A new step must be named deliberately, not leak its key into reports.
  it('reports an unknown step as "other"', () => {
    expect(signUpStepName('favouriteColour')).toBe('other');
  });
});

describe('signUpFailureReason', () => {
  it.each([
    ['auth/email-already-in-use', 'email_in_use'],
    ['auth/invalid-email', 'invalid_email'],
    ['auth/weak-password', 'weak_password'],
    ['auth/network-request-failed', 'network'],
    ['auth/too-many-requests', 'too_many_requests'],
    ['auth/operation-not-allowed', 'auth_other'],
  ])('%s → %s', (code, expected) => {
    expect(signUpFailureReason({ code, message: 'someone@example.com is taken' })).toBe(expected);
  });

  it('never fails on an error without a code', () => {
    expect(signUpFailureReason(new Error('boom'))).toBe('auth_other');
    expect(signUpFailureReason(null)).toBe('auth_other');
    expect(signUpFailureReason(undefined)).toBe('auth_other');
  });
});
