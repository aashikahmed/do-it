import { Suspense } from "react";
import { ideaById, slugOf } from "@/lib/explore/catalog";
import { IDEAS } from "@/lib/explore/ideas";
import { CreateFlow, type IdeaLink } from "./create-flow";

export const metadata = { title: "New pact" };

const links = (ids: string[]): IdeaLink[] =>
  ids.flatMap((id) => {
    const i = ideaById(id);
    return i ? { slug: slugOf(i), emoji: i.emoji, title: i.kind === "break" ? i.subject.charAt(0).toUpperCase() + i.subject.slice(1) : i.title } : [];
  });

export default function Page() {
  // the flow reads its query string ("Build a habit in its place", an idea to change), which needs a Suspense boundary
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <CreateFlow
        ideas={{
          build: links(["push-ups", "gym-sessions", "read-pages", "meditate", "start-running", "deep-work", "write-some-words"]),
          break: links(["soda", "sugar", "alcohol", "smoking", "social-media", "takeout", "late-night-snacks"]),
          count: IDEAS.length,
        }}
      />
    </Suspense>
  );
}
