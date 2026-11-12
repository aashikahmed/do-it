import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AdminNav, NavLinks } from "./nav";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin" },
  robots: { index: false, follow: false },
};

/**
 * Owner-only. The proxy 404s /admin for anyone not in ADMIN_EMAILS, and every page's data loader checks again
 * (lib/admin.ts). This shell holds no data. Wider than the app's phone column (see .app-column in globals.css).
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="admin-root min-h-dvh bg-mist">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-ink px-4 py-3.5 text-white pt-safe sm:px-6">
        <div className="flex items-center gap-3">
          <span className="display text-[30px] font-extrabold">Do it.</span>
          <span className="rounded-full bg-sun px-2.5 py-1 text-[13px] font-bold text-ink">Admin</span>
        </div>
        <Link href="/" className="flex min-h-11 items-center text-[14px] font-semibold text-white underline-offset-4 hover:underline">
          Back to the app
        </Link>
      </header>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-5 px-4 py-5 sm:px-6 lg:flex-row lg:items-start lg:gap-6">
        <div className="lg:sticky lg:top-6 lg:w-[220px] lg:shrink-0">
          <Suspense fallback={<NavLinks />}>
            <AdminNav />
          </Suspense>
        </div>
        <main className="flex min-w-0 flex-1 flex-col gap-5 pb-safe">{children}</main>
      </div>
    </div>
  );
}
