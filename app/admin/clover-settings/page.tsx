"use client";

import { useEffect, Suspense } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Navbar from "@/app/components/Navbar";
import Breadcrumb from "@/app/components/Breadcrumb";
import Footer from "@/app/components/Footer";
import CloverSettingsContent from "./content";

export default function CloverSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    if (!session || session.user?.role !== "admin") router.replace("/login");
  }, [session, status, router]);

  if (status === "loading" || !session || session.user?.role !== "admin") return null;

  return (
    <>
      <Navbar />
      <Breadcrumb
        title="Clover Connection"
        items={[
          { label: "Home", href: "/" },
          { label: "Admin", href: "/admin" },
          { label: "Clover Connection" },
        ]}
      />

      <Suspense fallback={<div style={{ minHeight: "60vh" }} />}>
        <CloverSettingsContent />
      </Suspense>

      <Footer />
    </>
  );
}
