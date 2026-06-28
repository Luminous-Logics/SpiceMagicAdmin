'use client';

import { useEffect, useRef } from 'react';
import { signOut, useSession } from 'next-auth/react';
import toast from 'react-hot-toast';

// Force logout after this many ms of no user activity.
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
// How often we check whether the idle limit has been exceeded.
const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
// Shared key so all tabs agree on the "last activity" time.
const STORAGE_KEY = 'sm_admin_last_activity';

export default function InactivityLogout() {
  const { status } = useSession();
  const lastActivityRef = useRef<number>(Date.now());
  const loggingOutRef = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') return;

    const markActivity = () => {
      const now = Date.now();
      lastActivityRef.current = now;
      try {
        localStorage.setItem(STORAGE_KEY, String(now));
      } catch {
        // localStorage may be unavailable (private mode) — in-memory ref still works.
      }
    };

    // Seed from storage so reopening a tab doesn't reset an already-idle session.
    try {
      const stored = Number(localStorage.getItem(STORAGE_KEY));
      lastActivityRef.current = Number.isFinite(stored) && stored > 0 ? stored : Date.now();
    } catch {
      lastActivityRef.current = Date.now();
    }

    const doLogout = async () => {
      if (loggingOutRef.current) return;
      loggingOutRef.current = true;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
      toast.error('You were logged out due to 30 minutes of inactivity.');
      await signOut({ callbackUrl: '/login' });
    };

    const checkIdle = () => {
      let last = lastActivityRef.current;
      try {
        const stored = Number(localStorage.getItem(STORAGE_KEY));
        if (Number.isFinite(stored) && stored > last) last = stored;
      } catch {
        // ignore — use in-memory value
      }
      if (Date.now() - last >= IDLE_TIMEOUT_MS) {
        void doLogout();
      }
    };

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        const v = Number(e.newValue);
        if (Number.isFinite(v)) lastActivityRef.current = v;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') checkIdle();
    };

    const events: (keyof WindowEventMap)[] = [
      'mousemove',
      'mousedown',
      'keydown',
      'scroll',
      'touchstart',
      'click',
    ];
    events.forEach((evt) => window.addEventListener(evt, markActivity, { passive: true }));
    window.addEventListener('storage', onStorage);
    document.addEventListener('visibilitychange', onVisible);

    markActivity();
    const interval = setInterval(checkIdle, CHECK_INTERVAL_MS);

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, markActivity));
      window.removeEventListener('storage', onStorage);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(interval);
    };
  }, [status]);

  return null;
}
