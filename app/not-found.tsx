import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col justify-center px-6 pt-safe pb-safe">
      <h1 className="display text-[56px] font-extrabold">Nothing here.</h1>
      <p className="mt-4 text-[17px] text-ink-2">This pact doesn&apos;t exist, or you&apos;re not in it.</p>
      <Link href="/" className="mt-8 flex h-16 items-center justify-center rounded-[22px] bg-blue text-[18px] font-extrabold text-white">
        Back to today
      </Link>
    </main>
  );
}
