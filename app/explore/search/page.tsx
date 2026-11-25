import { SearchView } from "@/components/explore/search-view";
import { allCards } from "@/lib/explore/catalog";

export const metadata = { title: "Search ideas" };

export default function Page() {
  return <SearchView cards={allCards()} />;
}
