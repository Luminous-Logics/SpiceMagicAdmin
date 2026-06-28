'use client';

import { SessionProvider } from 'next-auth/react';
import { Toaster } from 'react-hot-toast';
import InactivityLogout from './InactivityLogout';

export default function SessionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider
      // Refresh the token every 5 min while the tab is active so engaged users
      // keep a rolling session; idle users are caught by InactivityLogout.
      refetchInterval={5 * 60}
      refetchOnWindowFocus
    >
      <Toaster position="top-right" toastOptions={{ duration: 3500 }} />
      <InactivityLogout />
      {children}
    </SessionProvider>
  );
}
