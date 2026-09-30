import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "./globals.css";
import { ToastProvider } from "@/components/ui/toast";

export const metadata: Metadata = {
  title: { default: "SmartDayCare AI — Intelligent Child Development & Wellbeing Platform", template: "%s · SmartDayCare AI" },
  description:
    "Platform berbasis AI untuk mencatat aktivitas harian anak dan memberikan analisis perkembangan yang personal — untuk orang tua, pengasuh, dan pengelola daycare.",
  applicationName: "SmartDayCare AI",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0B5F59",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body className="min-h-dvh">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
