"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function CloverSettingsContent() {
  const searchParams = useSearchParams();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [merchantName, setMerchantName] = useState<string | null>(null);
  const [justConnected] = useState(() => searchParams.get("success") === "true" || searchParams.get("connected") === "1");

  useEffect(() => {
    fetch("/api/clover/status")
      .then((r) => r.json())
      .then((d) => {
        setConnected(!!d.connected);
        setMerchantName(d.merchantName ?? null);
      })
      .catch(() => setConnected(false));
  }, []);

  return (
    <div style={{ minHeight: "60vh", padding: "40px 0 80px" }}>
      <div className="container" style={{ maxWidth: 680 }}>

        {/* Header */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: "#222", marginBottom: 6 }}>
            Clover Connection
          </h1>
          <p style={{ color: "#666", fontSize: 14, lineHeight: 1.7, margin: 0 }}>
            Connect your Clover merchant account. The access token is stored securely in MongoDB
            and shared with the ecommerce storefront — enabling inventory, pricing, and POS sync.
          </p>
        </div>

        {/* Status card */}
        <div
          style={{
            background: "#fff",
            border: "2px solid #eee",
            borderRadius: 16,
            padding: "28px 28px 24px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
            marginBottom: 28,
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: "#999", letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
            Connection Status
          </p>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: connected === null ? "#d1d5db" : connected ? "#22c55e" : "#9ca3af",
                flexShrink: 0,
                boxShadow: connected ? "0 0 0 3px rgba(34,197,94,0.2)" : "none",
              }}
            />
            <strong style={{ fontSize: 16, color: "#222" }}>
              {connected === null
                ? "Checking…"
                : connected
                ? "Connected"
                : "Not connected"}
            </strong>
          </div>

          {merchantName && (
            <p style={{ fontSize: 13, color: "#76a713", fontWeight: 600, margin: "4px 0 0 20px" }}>
              {merchantName}
            </p>
          )}

          {justConnected && connected && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 14px",
                background: "rgba(118,167,19,0.08)",
                borderRadius: 8,
                fontSize: 13,
                color: "#4a7a00",
                fontWeight: 500,
              }}
            >
              Clover account connected successfully. The ecommerce storefront can now read
              your inventory and orders.
            </div>
          )}
        </div>

        {/* Action card */}
        <div
          style={{
            background: "#fff",
            border: "2px solid #eee",
            borderRadius: 16,
            padding: "28px 28px 24px",
            boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
          }}
        >
          <p style={{ fontSize: 12, fontWeight: 700, color: "#999", letterSpacing: 1, textTransform: "uppercase", marginBottom: 14 }}>
            {connected ? "Reconnect" : "Connect"}
          </p>
          <p style={{ fontSize: 13, color: "#666", marginBottom: 20, lineHeight: 1.65 }}>
            {connected
              ? "Your Clover account is active. You can reconnect to refresh the access token or switch to a different merchant account."
              : "Click the button below to start the Clover OAuth flow. You will be redirected to Clover to authorize this app, then returned here automatically."}
          </p>

          <a
            href="/api/clover/oauth/login"
            style={{
              display: "inline-block",
              padding: "12px 24px",
              background: "#76a713",
              color: "#fff",
              borderRadius: 10,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: 0.2,
              transition: "background 0.2s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = "#5e8a0d")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.background = "#76a713")}
          >
            {connected ? "Reconnect Clover Account" : "Connect Clover Account"}
          </a>
        </div>

        {/* Info box */}
        <div
          style={{
            marginTop: 28,
            padding: "16px 20px",
            background: "rgba(118,167,19,0.06)",
            borderLeft: "3px solid #76a713",
            borderRadius: 8,
            fontSize: 13,
            color: "#555",
            lineHeight: 1.7,
          }}
        >
          <strong style={{ color: "#222" }}>How it works:</strong> When you click Connect, this
          app redirects you to Clover for authorization. After you approve, Clover sends back an
          access token that is stored in MongoDB. The ecommerce storefront reads that token
          automatically — no separate setup needed there.
        </div>
      </div>
    </div>
  );
}
