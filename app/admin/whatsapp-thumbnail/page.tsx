'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';
import WhatsAppThumbnailCard from '@/app/components/WhatsAppThumbnailCard';

export default function WhatsAppThumbnailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    if (!session || session.user?.role !== 'admin') router.replace('/login');
  }, [session, status, router]);

  if (status === 'loading' || !session || session.user?.role !== 'admin') return null;

  return (
    <>
      <Navbar />
      <Breadcrumb
        title="WhatsApp Thumbnail"
        items={[
          { label: 'Home', href: '/' },
          { label: 'Admin', href: '/admin' },
          { label: 'WhatsApp Thumbnail' },
        ]}
      />

      <div style={{ minHeight: '60vh', background: '#fafafa', padding: '40px 0 80px' }}>
        <div className="container">
          <div style={{ marginBottom: 18 }}>
            <Link href="/admin" style={{ color: '#999', fontSize: 13, textDecoration: 'none' }}>
              ← Back to Admin
            </Link>
          </div>

          <WhatsAppThumbnailCard />
        </div>
      </div>

      <Footer />
    </>
  );
}
