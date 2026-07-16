'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const msg = searchParams.get('error');
    if (msg) setError(msg);
  }, [searchParams]);

  useEffect(() => {
    fetch('/api/auth/providers')
      .then((r) => r.json())
      .then((data) => setGoogleEnabled(Boolean(data?.google)))
      .catch(() => setGoogleEnabled(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Login failed');
        return;
      }

      const redirect = searchParams.get('from') || '/';
      router.push(redirect);
      router.refresh();
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          autoFocus
          required
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[var(--foreground)] mb-1.5">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--background)] text-[var(--foreground)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          required
        />
      </div>

      {error && (
        <p className="text-sm text-[var(--destructive)] bg-[var(--destructive)]/10 px-3 py-2 rounded-lg">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2.5 rounded-lg bg-[var(--primary)] text-[var(--primary-foreground)] text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
      >
        {loading ? 'Signing in...' : 'Sign in'}
      </button>

      {googleEnabled && (
        <a
          href={`/api/auth/google/start?from=${encodeURIComponent(searchParams.get('from') || '/')}`}
          className="block w-full py-2.5 rounded-lg border border-[var(--border)] text-center text-sm font-medium hover:bg-[var(--muted)] transition-colors"
        >
          Sign in with Google
        </a>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm p-8 rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <div className="text-center mb-8">
          <div className="text-3xl mb-2">&#127963;&#65039;</div>
          <h1 className="text-xl font-semibold text-[var(--foreground)]">Marketing Dashboard</h1>
          <p className="text-sm text-[var(--muted-foreground)] mt-1">Marketing Engine Control Center</p>
        </div>

        <Suspense fallback={<div className="h-48" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
