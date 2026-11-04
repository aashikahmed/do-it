import { Suspense } from "react";
import { SignIn } from "./google-sign-in";

export const metadata = { title: "Sign in" };

export default function Page({ searchParams }: PageProps<"/signin">) {
  return (
    <main className="flex min-h-dvh flex-col px-6 pt-safe pb-safe">
      <Suspense fallback={null}>
        <SignIn
          paramsPromise={searchParams.then((s) => ({
            next: typeof s.next === "string" ? s.next : "/",
            error: typeof s.error === "string" ? s.error : null,
          }))}
        />
      </Suspense>
    </main>
  );
}
