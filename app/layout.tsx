import type { Metadata } from 'next';
import './globals.css';
import SessionWrapper from './components/SessionWrapper';

export const metadata: Metadata = {
  title: 'SpiceMagik Admin',
  description: 'SpiceMagik Admin Panel',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Favicon (served from app/favicon.ico) */}
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="/favicon.ico" />
        {/* Bootstrap 5 */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css"
          integrity="sha384-QWTKZyjpPEjISv5WaRU9OFeRpok6YctnYmDr5pNlyT2bRjXh0JMhjY6hW+ALEwIH"
          crossOrigin="anonymous"
        />
        {/* Font Awesome 6 Free */}
        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"
          crossOrigin="anonymous"
          referrerPolicy="no-referrer"
        />
        {/* Google Fonts: Jost + DM Sans */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700;800&family=DM+Sans:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root { --theme-color: #E31E24; --green-color: #76a713; }
          body { background: #fff5ee; font-family: 'DM Sans', 'Jost', sans-serif; }
        `}</style>
      </head>
      <body>
        <SessionWrapper>{children}</SessionWrapper>
      </body>
    </html>
  );
}
