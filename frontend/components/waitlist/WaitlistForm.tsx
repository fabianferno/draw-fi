'use client';

import { useState, type FormEvent } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export function WaitlistForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        alreadyRegistered?: boolean;
        error?: string;
      };

      if (!res.ok || !data.ok) {
        setStatus('error');
        setMessage(data.error ?? 'Could not sign up. Try again.');
        return;
      }

      setStatus('success');
      setMessage(
        data.alreadyRegistered
          ? "You're already on the list—we'll be in touch."
          : "You're on the list. We'll email you when access opens."
      );
      setEmail('');
    } catch {
      setStatus('error');
      setMessage('Network error. Check your connection and try again.');
    }
  }

  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        <label htmlFor="waitlist-email" className="sr-only">
          Email
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (status !== 'idle') setStatus('idle');
          }}
          placeholder="you@example.com"
          disabled={status === 'loading'}
          className="min-h-[52px] flex-1 rounded-xl border-4 border-[#00E5FF] bg-black/80 px-4 py-3 text-base text-white placeholder:text-white/40 outline-none focus-visible:ring-2 focus-visible:ring-[#00E5FF]/60 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === 'loading'}
          className="min-h-[52px] shrink-0 rounded-xl border-4 border-[#0a0a0a] bg-[#00E5FF] px-6 py-3 text-base font-bold text-black shadow-[4px_4px_0_0_#0a0a0a] transition-all hover:shadow-[6px_6px_0_0_#0a0a0a] disabled:opacity-60"
        >
          {status === 'loading' ? '…' : 'Join'}
        </button>
      </form>
      {message ? (
        <p
          className={`text-center text-sm ${
            status === 'success' ? 'text-[#00E5FF]' : status === 'error' ? 'text-red-300' : ''
          }`}
          role={status === 'error' ? 'alert' : 'status'}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
