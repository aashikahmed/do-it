import { notFound } from "next/navigation";
import { Suspense } from "react";
import { cardOf, ideaById, ideaBySlug, publicIdea, slugOf } from "@/lib/explore/catalog";
import { IDEAS } from "@/lib/explore/ideas";
import { IdeaView } from "./idea-view";

export function generateStaticParams() {
  return IDEAS.map((i) => ({ slug: slugOf(i) }));
}

export async function generateMetadata({ params }: PageProps<"/explore/[slug]">) {
  const { slug } = await params;
  const idea = ideaBySlug(slug);
  // a tab or a history entry never names a habit someone's giving up
  if (!idea || idea.kind === "break") return { title: "An idea for a pact", robots: { index: false } };
  return { title: idea.title, description: idea.line };
}

export default function Page({ params }: PageProps<"/explore/[slug]">) {
  return (
    <Suspense fallback={<main className="min-h-dvh" />}>
      <IdeaPage params={params} />
    </Suspense>
  );
}

async function IdeaPage({ params }: { params: PageProps<"/explore/[slug]">["params"] }) {
  const { slug } = await params;
  const idea = ideaBySlug(slug);
  if (!idea) notFound();
  return <IdeaView idea={publicIdea(idea)} slug={slug} next={idea.next.slice(0, 3).map((id) => cardOf(ideaById(id)!))} />;
}
