import { BackButton } from "@/components/explore/back-button";
import { SavedList } from "@/components/explore/saved-list";
import { allCards } from "@/lib/explore/catalog";

export const metadata = { title: "Saved ideas" };

export default function Page() {
  return (
    <main className="min-h-dvh px-5 pt-safe pb-8">
      <div className="flex h-14 items-center pt-3">
        <BackButton fallback="/explore" />
      </div>
      <h1 className="display pt-2 pb-5 text-[56px] font-extrabold">Saved.</h1>
      <SavedList cards={allCards()} />
    </main>
  );
}
