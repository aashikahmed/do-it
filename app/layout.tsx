import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ServiceWorker } from "@/components/service-worker";
import { Toaster } from "@/components/toast";
import "./globals.css";

const brico = Bricolage_Grotesque({
  variable: "--font-brico",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Do it.", template: "%s · Do it." },
  description: "Pick a goal, pick your people, and keep the chain going together.",
  applicationName: "Do it.",
  appleWebApp: { capable: true, title: "Do it.", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/192", type: "image/png", sizes: "192x192" }],
    apple: [{ url: "/icons/apple", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#eef0f8",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${brico.variable} antialiased`}>
      <body>
        <div className="relative mx-auto min-h-dvh w-full max-w-[440px] bg-mist sm:shadow-[0_0_0_1px_#d3d7e8,0_30px_80px_-30px_rgba(16,20,58,0.35)]">
          {children}
        </div>
        <Toaster />
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
