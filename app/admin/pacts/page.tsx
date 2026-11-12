import { Suspense } from "react";
import { getPacts } from "@/lib/admin";
import { Skeleton } from "../ui";
import { PactsTable } from "./pacts-table";

export const metadata = { title: "Pacts" };

export default function Page() {
  return (
    <Suspense fallback={<Skeleton rows={1} />}>
      <Pacts />
    </Suspense>
  );
}

async function Pacts() {
  return <PactsTable rows={await getPacts()} />;
}
