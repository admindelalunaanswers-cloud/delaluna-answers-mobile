/**
 * auth-context.tsx — sign-in plus admin-claim verification.
 *
 * The gate is the `admin` custom claim, exactly as it is in the mobile app and
 * in firestore.rules. Two things matter here:
 *
 * 1. `syncAdminClaim` is what actually grants the claim, from the server-side
 *    ADMIN_EMAILS allowlist. The mobile app calls it on every auth change
 *    (src/context/user-context.tsx); the dashboard has to do the same or a
 *    newly-added admin would sign in and be told they are not an admin.
 * 2. An ID token is cached for up to an hour, so the claim must be re-read with
 *    `getIdTokenResult(true)` after that call. Without the force-refresh the
 *    first sign-in after being granted admin still shows the old, claimless
 *    token and the dashboard locks them out until the token happens to expire.
 *
 * This is a convenience gate for the UI. It is not the security boundary —
 * Firestore rules and the `request.auth.token.admin` checks inside each
 * callable are. A non-admin who bypassed this screen would still be denied
 * every read and every write by the server.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';

import { auth, functions } from './firebase';

type AuthStatus = 'loading' | 'signed-out' | 'not-admin' | 'admin';

interface AuthContextValue {
  user: User | null;
  status: AuthStatus;
  /** Rejects with a human-readable message on failure. */
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  status: 'loading',
  signIn: async () => {},
  signOut: async () => {},
});

/** Ask the server to reconcile the claim, then re-read the token to see it. */
async function resolveAdminClaim(user: User): Promise<boolean> {
  try {
    await httpsCallable(functions, 'syncAdminClaim')({});
  } catch {
    // Non-fatal. The user may already hold a valid claim from a previous
    // session, so fall through and read the token rather than locking them out
    // over a transient function failure.
  }
  try {
    const token = await user.getIdTokenResult(true);
    return token.claims.admin === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');

  useEffect(() => {
    return onAuthStateChanged(auth, async (next) => {
      if (!next) {
        setUser(null);
        setStatus('signed-out');
        return;
      }
      setUser(next);
      setStatus((await resolveAdminClaim(next)) ? 'admin' : 'not-admin');
    });
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      // onAuthStateChanged resolves the claim; no need to duplicate it here.
    } catch (err) {
      const code = (err as { code?: string })?.code ?? '';
      // Firebase deliberately collapses "no such user" and "wrong password"
      // into one code so the form cannot be used to enumerate accounts. Keep
      // that property in the message shown here.
      if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        throw new Error('Incorrect email or password.');
      }
      if (code === 'auth/user-disabled') {
        throw new Error('This account has been disabled.');
      }
      if (code === 'auth/too-many-requests') {
        throw new Error('Too many attempts. Wait a few minutes and try again.');
      }
      if (code === 'auth/network-request-failed') {
        throw new Error('Network error. Check your connection.');
      }
      throw new Error('Could not sign in. Please try again.');
    }
  }, []);

  const signOut = useCallback(async () => {
    await fbSignOut(auth);
  }, []);

  const value = useMemo(
    () => ({ user, status, signIn, signOut }),
    [user, status, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
