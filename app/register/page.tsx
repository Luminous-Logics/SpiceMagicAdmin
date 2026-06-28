'use client';

import { useState, useEffect } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && session?.user?.role === 'admin') {
      router.replace('/admin');
    }
  }, [session, status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !password || !confirmPassword) {
      toast.error('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data?.error || 'Registration failed.');
        setLoading(false);
        return;
      }

      toast.success('Account created! Signing you in…');
      const signInRes = await signIn('credentials', { email, password, redirect: false });
      setLoading(false);
      if (signInRes?.ok) {
        router.replace('/admin');
      } else {
        toast.error('Account created. Please sign in.');
        router.replace('/login');
      }
    } catch {
      setLoading(false);
      toast.error('Something went wrong. Please try again.');
    }
  };

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff5ee' }}>
        <i className="fas fa-circle-notch fa-spin" style={{ fontSize: 32, color: '#E31E24' }} />
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '11px 12px 11px 36px',
    border: '1px solid #ddd',
    borderRadius: 10,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
    background: '#fafafa',
    transition: 'border 0.2s',
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #fff5ee 0%, #ffe8d6 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 20,
          width: '100%',
          maxWidth: 440,
          boxShadow: '0 20px 60px rgba(0,0,0,0.12)',
          border: '1px solid #eee',
          overflow: 'hidden',
        }}
      >
        {/* Red header banner with logo */}
        <div
          style={{
            background: 'linear-gradient(135deg, #e74c3c 0%, #E31E24 60%, #c0392b 100%)',
            padding: '32px 40px 28px',
            textAlign: 'center',
            position: 'relative',
          }}
        >
          <div style={{
            position: 'absolute', top: -30, right: -30,
            width: 120, height: 120,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '50%',
          }} />
          <div style={{
            position: 'absolute', bottom: -20, left: -20,
            width: 80, height: 80,
            background: 'rgba(255,255,255,0.06)',
            borderRadius: '50%',
          }} />

          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 14, position: 'relative' }}>
            <Image
              src="/assets/img/Spice-Magik-Logo.png"
              alt="SpiceMagik"
              width={220}
              height={60}
              priority
              style={{ objectFit: 'contain', filter: 'brightness(0) invert(1)', maxWidth: '100%', height: 'auto' }}
            />
          </div>

          <h2 style={{ color: '#fff', fontWeight: 700, fontSize: 20, margin: '0 0 4px', position: 'relative' }}>
            Create Admin Account
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, margin: 0, position: 'relative' }}>
            Register a new Admin Panel account
          </p>
        </div>

        {/* Form body */}
        <div style={{ padding: '32px 40px 36px' }}>
          <form onSubmit={handleSubmit}>
            {/* Name */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, display: 'block' }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <i className="fas fa-user" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }} />
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#E31E24')}
                  onBlur={(e) => (e.target.style.borderColor = '#ddd')}
                />
              </div>
            </div>

            {/* Email */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, display: 'block' }}>
                Email Address
              </label>
              <div style={{ position: 'relative' }}>
                <i className="fas fa-envelope" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#E31E24')}
                  onBlur={(e) => (e.target.style.borderColor = '#ddd')}
                />
              </div>
            </div>

            {/* Password */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, display: 'block' }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <i className="fas fa-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  required
                  style={{ ...inputStyle, padding: '11px 40px 11px 36px' }}
                  onFocus={(e) => (e.target.style.borderColor = '#E31E24')}
                  onBlur={(e) => (e.target.style.borderColor = '#ddd')}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', padding: 0,
                  }}
                >
                  <i className={`fas ${showPass ? 'fa-eye-slash' : 'fa-eye'}`} style={{ fontSize: 14 }} />
                </button>
              </div>
            </div>

            {/* Confirm Password */}
            <div style={{ marginBottom: 28 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#444', marginBottom: 6, display: 'block' }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <i className="fas fa-lock" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#bbb', fontSize: 14 }} />
                <input
                  type={showPass ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  style={inputStyle}
                  onFocus={(e) => (e.target.style.borderColor = '#E31E24')}
                  onBlur={(e) => (e.target.style.borderColor = '#ddd')}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#f5a0a3' : 'linear-gradient(90deg, #e74c3c, #E31E24)',
                color: '#fff',
                border: 'none',
                borderRadius: 10,
                padding: '13px',
                fontSize: 15,
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: loading ? 'none' : '0 4px 16px rgba(227,30,36,0.35)',
                transition: 'all 0.2s',
              }}
            >
              {loading ? (
                <>
                  <i className="fas fa-circle-notch fa-spin" />
                  Creating account…
                </>
              ) : (
                <>
                  <i className="fas fa-user-plus" />
                  Create Account
                </>
              )}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: '#666', marginTop: 24, marginBottom: 0 }}>
            Already have an account?{' '}
            <Link href="/login" style={{ color: '#E31E24', fontWeight: 600, textDecoration: 'none' }}>
              Sign In
            </Link>
          </p>
        </div>{/* /form body */}
      </div>
    </div>
  );
}
