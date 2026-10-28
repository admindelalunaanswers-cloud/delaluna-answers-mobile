import { useState, type FormEvent } from 'react';

import { useAuth } from '../lib/auth-context';
import { IS_PRODUCTION, PROJECT_ID } from '../lib/firebase';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
    // On success the auth listener swaps this screen out, so `busy` is
    // intentionally left true — re-enabling the button would let a second
    // submit fire during the claim check.
  }

  return (
    <div className="centre">
      <form className="card" onSubmit={onSubmit}>
        <div className="brand" style={{ padding: '0 0 4px' }}>
          🌙 Delaluna Admin
        </div>
        <p className="faint" style={{ fontSize: 12.5, marginTop: 0 }}>
          Signing in to{' '}
          <span className={`env-badge ${IS_PRODUCTION ? 'prod' : 'test'}`}>
            {PROJECT_ID}
          </span>
        </p>

        {error && <div className="msg error">{error}</div>}

        <div className="field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button type="submit" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="faint" style={{ fontSize: 12, marginBottom: 0 }}>
          Use the same account as the mobile app. Admin access is granted from
          the server-side allowlist, not from this form.
        </p>
      </form>
    </div>
  );
}
