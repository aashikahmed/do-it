export const metadata = { title: "Signed in" };

export default function Page() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-blue px-6 pt-safe pb-safe text-white">
      <h1 className="display text-[60px] font-extrabold">You&apos;re in.</h1>
      <p className="mt-5 max-w-[30ch] text-[18px] leading-snug text-white/85">
        Close this page and go back to the Do it. app. It will finish signing you in.
      </p>
      <p className="mt-6 text-[15px] text-white/60">On iPhone, tap Done in the top corner.</p>
    </main>
  );
}
