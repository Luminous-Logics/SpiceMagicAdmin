'use client';

import Link from 'next/link';
import Image from 'next/image';
import { signOut } from 'next-auth/react';
import { useState } from 'react';

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="spice-navbar">
      {/* Brand logo */}
      <Link href="/admin" className="spice-navbar__brand" onClick={() => setMenuOpen(false)}>
        {/* Logo — used on all screen sizes */}
        <Image
          src="/assets/img/Mobile_Logo_SpiceMagik.png"
          alt="SpiceMagik"
          width={240}
          height={56}
          priority
          style={{ objectFit: 'contain', width: 'auto', height: 46, filter: 'brightness(0) invert(1)' }}
        />
      </Link>

      {/* Desktop navigation */}
      <div className="spice-navbar__actions">
        <Link href="/admin" className="spice-navbar__link">
          <i className="fas fa-home" />
          <span>Dashboard</span>
        </Link>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="spice-navbar__logout"
        >
          <i className="fas fa-sign-out-alt" />
          <span>Logout</span>
        </button>
      </div>

      {/* Mobile hamburger toggle */}
      <button
        className="spice-navbar__hamburger"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label="Toggle navigation"
      >
        <i className={`fas ${menuOpen ? 'fa-times' : 'fa-bars'}`} />
      </button>

      {/* Mobile dropdown menu */}
      <div className={`spice-navbar__mobile-menu${menuOpen ? ' open' : ''}`}>
        <Link
          href="/admin"
          className="spice-navbar__mobile-link"
          onClick={() => setMenuOpen(false)}
        >
          <i className="fas fa-home" />
          Dashboard
        </Link>
        <button
          className="spice-navbar__mobile-logout"
          onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/login' }); }}
        >
          <i className="fas fa-sign-out-alt" />
          Logout
        </button>
      </div>
    </nav>
  );
}
