'use client';

import { useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Navbar from '@/app/components/Navbar';
import Breadcrumb from '@/app/components/Breadcrumb';
import Footer from '@/app/components/Footer';

const TruckIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M1 3h15v13H1zM16 8h4l3 3v5h-7V8zM5.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM18.5 19a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface DashCard {
  href: string;
  badge: string;
  badgeColor: string;
  iconClass?: string;
  iconColor: string;
  bgColor: string;
  title: string;
  desc: string;
  circleColor: string;
  isSvg?: boolean;
}

const cards: DashCard[] = [
  {
    href: '/admin/orders',
    badge: 'Live',
    badgeColor: '#E31E24',
    iconClass: 'fa-solid fa-receipt',
    iconColor: '#E31E24',
    bgColor: 'rgba(227,30,36,0.08)',
    title: 'Orders',
    desc: 'View and manage customer orders, track fulfillment through the order lifecycle, and export reports.',
    circleColor: '#E31E24',
  },
  {
    href: '/admin/sync',
    badge: 'Live',
    badgeColor: '#76a713',
    iconClass: 'fa-solid fa-rotate',
    iconColor: '#76a713',
    bgColor: 'rgba(118,167,19,0.08)',
    title: 'Sync Items & Upload Images',
    desc: 'Pull the latest products, prices, and stock from Clover into MongoDB. Upload and manage custom images.',
    circleColor: '#76a713',
  },
  {
    href: '/admin/categories',
    badge: 'Manage',
    badgeColor: '#76a713',
    iconClass: 'fa-solid fa-tags',
    iconColor: '#76a713',
    bgColor: 'rgba(118,167,19,0.08)',
    title: 'Categories',
    desc: 'Sync Clover categories, upload category images, and mark categories as featured.',
    circleColor: '#76a713',
  },
  {
    href: '/admin/banners',
    badge: 'Manage',
    badgeColor: '#3498db',
    iconClass: 'fa-solid fa-images',
    iconColor: '#3498db',
    bgColor: 'rgba(52,152,219,0.08)',
    title: 'Banner Management',
    desc: 'Upload and manage promotional banners for the Hero, Hot Deals, Offer Strip, and other sections.',
    circleColor: '#3498db',
  },
  {
    href: '/admin/coupons',
    badge: 'Discounts',
    badgeColor: '#E31E24',
    iconClass: 'fa-solid fa-ticket',
    iconColor: '#E31E24',
    bgColor: 'rgba(227,30,36,0.08)',
    title: 'Coupons',
    desc: 'Create and manage discount coupons for checkout.',
    circleColor: '#E31E24',
  },
  {
    href: '/admin/pickup-slots',
    badge: 'Schedule',
    badgeColor: '#E31E24',
    iconColor: '#E31E24',
    bgColor: 'rgba(227,30,36,0.08)',
    title: 'Pickup Time Slots',
    desc: 'Set available date ranges and time slots for customer pickup.',
    circleColor: '#E31E24',
    isSvg: true,
  },
];

export default function AdminDashboard() {
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
      <Breadcrumb title="Dashboard" items={[{ label: 'Home', href: '/' }, { label: 'Admin' }]} />
      <div style={{ minHeight: '60vh', padding: '20px 0 60px' }}>
        <div className="container">
          {/* Welcome header */}
          <div className="dash-welcome">
            <h1 className="dash-welcome-title">
              Welcome back, {session.user?.name?.split(' ')[0] || 'Admin'} 👋
            </h1>
            <p className="dash-welcome-sub">
              Manage your SpiceMagik store from one place.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="dash-cards-grid">
            {cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                style={{ textDecoration: 'none' }}
              >
                <div
                  className="dash-card"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = card.badgeColor;
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-4px)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 12px 32px rgba(0,0,0,0.1)`;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = '#eee';
                    (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
                    (e.currentTarget as HTMLDivElement).style.boxShadow = '0 2px 12px rgba(0,0,0,0.04)';
                  }}
                >
                  {/* Decorative circle */}
                  <div
                    style={{
                      position: 'absolute',
                      top: -30,
                      right: -30,
                      width: 120,
                      height: 120,
                      borderRadius: '50%',
                      background: card.circleColor,
                      opacity: 0.06,
                    }}
                  />

                  {/* Badge */}
                  <span
                    style={{
                      display: 'inline-block',
                      background: card.badgeColor + '18',
                      color: card.badgeColor,
                      borderRadius: 20,
                      padding: '3px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      marginBottom: 16,
                      letterSpacing: 0.5,
                    }}
                  >
                    {card.badge}
                  </span>

                  {/* Icon box */}
                  <div
                    style={{
                      width: 52,
                      height: 52,
                      borderRadius: 14,
                      background: card.bgColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 18,
                      color: card.iconColor,
                    }}
                  >
                    {card.isSvg ? (
                      <TruckIcon />
                    ) : (
                      <i className={card.iconClass!} style={{ fontSize: 22, color: card.iconColor }} />
                    )}
                  </div>

                  {/* Title & desc */}
                  <h3 style={{ fontSize: 17, fontWeight: 700, color: '#222', margin: '0 0 8px' }}>
                    {card.title}
                  </h3>
                  <p style={{ fontSize: 13, color: '#777', margin: '0 0 20px', lineHeight: 1.6 }}>
                    {card.desc}
                  </p>

                  <span style={{ fontSize: 13, fontWeight: 600, color: card.badgeColor }}>
                    Open →
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
      <Footer />
    </>
  );
}
