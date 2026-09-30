import type { NextConfig } from "next";

const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";
const isDev = process.env.NODE_ENV !== "production";
// ALLOW_EMBED=1 hanya untuk pratinjau yang ditanam di iframe (mis. lingkungan uji); di produksi
// biarkan kosong agar halaman tidak bisa dibingkai situs lain (anti-clickjacking).
const allowEmbed = isDev || process.env.ALLOW_EMBED === "1";

// Kebijakan keamanan konten.
const csp = [
  "default-src 'self'",
  `script-src 'self'${isDev ? " 'unsafe-eval' 'unsafe-inline'" : " 'unsafe-inline'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  allowEmbed ? "" : "frame-ancestors 'none'",
]
  .filter(Boolean)
  .join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), payment=()" },
  ...(allowEmbed ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
  ...(isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // NEXT_STANDALONE=1 (Dockerfile): hasil build mandiri (server.js + dependensi minimum) untuk citra tipis.
  ...(process.env.NEXT_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  // Folder hasil build bisa dialihkan (NEXT_DIST_DIR) agar build baru disiapkan di samping
  // server yang sedang berjalan, lalu ditukar dengan jeda beberapa detik saja.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  devIndicators: { position: "bottom-right" },
  outputFileTracingRoot: __dirname,
  eslint: {
    ignoreDuringBuilds: true,
  },
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/api/:path*` }];
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // bobot model pemindai piring: berkas berversi (nama berubah bila model berubah) → boleh disimpan lama
      { source: "/models/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
    ];
  },
};

export default nextConfig;
