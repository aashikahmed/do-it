import { Suspense } from "react";
import { CreateFlow } from "./create-flow";

export const metadata = { title: "New pact" };

export default function Page() {
  // the flow reads ?kind=build ("Build a habit in its place"), which needs a Suspense boundary
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <CreateFlow />
    </Suspense>
  );
}
