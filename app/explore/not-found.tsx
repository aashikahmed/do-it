import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pt-safe pb-safe">
      <h1 className="display text-[56px] font-extrabold">That idea isn&apos;t here.</h1>
      <p className="mt-4 text-[17px] text-ink-2">The link may be mistyped, or the idea was taken out.</p>
      <Link href="/explore" className="mt-8 flex h-16 items-center justify-center rounded-[22px] bg-blue text-[18px] font-extrabold text-white">
        Look through ideas
      </Link>
    </main>
  );
}
