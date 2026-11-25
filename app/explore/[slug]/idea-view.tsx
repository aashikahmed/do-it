"use client";

import { Bookmark } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { BackButton } from "@/components/explore/back-button";
import { BottomDock } from "@/components/bottom-dock";
import { IdeaRows } from "@/components/explore/idea-row";
import { LevelPicker } from "@/components/explore/level-picker";
import { PactCreated } from "@/components/pact-created";
import { Sheet } from "@/components/sheet";
import { toast } from "@/components/toast";
import { createPact } from "@/lib/client-actions";
import { addDays, deviceTimeZone, todayIn } from "@/lib/dates";
import type { RuleDraft } from "@/lib/edit";
import { savePending, saveCreateDraft, usePending, type Pending } from "@/lib/explore/handoff";
import { toggleSaved, useSaved } from "@/lib/explore/saved";
import type { Idea, IdeaCard, Level } from "@/lib/explore/types";
import { isWeekly, levelDraft, pactTitle, startText } from "@/lib/explore/words";
import { createInput, type PactLook } from "@/lib/pact-input";
import { getBrowserClient } from "@/lib/supabase/client";
import { capitalize } from "@/lib/view";
import { startOffsets } from "@/lib/week";
import { StartForm } from "./start-form";

type Props = { idea: Idea; slug: string; next: IdeaCard[] };

export function IdeaView(props: Props) {
  // a new visit starts at the suggestion; going back to it keeps what was set. Back from signing in, pick up where they were.
  const { bfcacheId } = useRouter();
  const pending = usePending(props.idea.id);
  return <View key={`${bfcacheId}|${pending ? "pending" : ""}`} {...props} pending={pending} />;
}

function View({ idea, slug, next, pending }: Props & { pending: Pending | null }) {
  const router = useRouter();
  const [level, setLevel] = useState<Level>(pending?.level ?? "starting");
  const [draft, setDraft] = useState<RuleDraft>(() => pending?.draft ?? levelDraft(idea, "starting"));
  const [offset, setOffset] = useState(pending?.offset ?? 0);
  const [plan, setPlan] = useState(pending?.plan ?? (idea.kind === "break" ? (idea.cravingPlan ?? "") : ""));
  const [open, setOpen] = useState(!!pending);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ id: string; code: string } | null>(null);
  const saved = useSaved().includes(idea.id);

  const isBreak = idea.kind === "break";
  const set = (patch: Partial<RuleDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const look: PactLook = { kind: idea.kind, title: idea.title, subject: isBreak ? idea.subject : "", emoji: idea.emoji, color: idea.color, cravingPlan: plan, idea: { id: idea.id, level } };
  const weekly = isWeekly(idea, draft);

  function pick(l: Level) {
    setLevel(l);
    setDraft(levelDraft(idea, l));
  }

  function close() {
    setOpen(false);
    savePending(null);
  }

  async function create() {
    setBusy(true);
    const { data } = await getBrowserClient().auth.getSession();
    if (!data.session) {
      savePending({ id: idea.id, level, draft, offset, plan });
      setBusy(false);
      router.push(`/signin?next=${encodeURIComponent(`/explore/${slug}`)}`);
      return;
    }
    const tz = deviceTimeZone();
    const today = todayIn(tz);
    // a Monday picked for a weekly pact falls back to today if it isn't on offer any more
    const start = addDays(today, startOffsets(today, weekly).includes(offset) ? offset : 0);
    const res = await createPact(createInput(draft, look, start, tz));
    setBusy(false);
    if (!res.ok) return toast(res.error, "error");
    savePending(null);
    setOpen(false);
    window.scrollTo(0, 0);
    setCreated(res.data!);
  }

  function changeAll() {
    saveCreateDraft({ look, draft, offset });
    savePending(null);
    router.push("/new?from=idea");
  }

  if (created) {
    const swap = isBreak ? next.find((c) => c.kind === "build") : undefined;
    return (
      <PactCreated
        id={created.id}
        code={created.code}
        color={idea.color}
        emoji={idea.emoji}
        pact={
          isBreak
            ? { kind: "break", title: pactTitle(idea, draft), subject: idea.subject, emoji: idea.emoji, cadence: weekly ? "weekly" : "daily", measure: draft.mode === "amount" ? "count" : "none" }
            : { kind: "build", title: idea.title, emoji: idea.emoji }
        }
        next={swap && { href: `/explore/${swap.slug}`, label: `In its place: ${swap.title.charAt(0).toLowerCase()}${swap.title.slice(1)}` }}
      />
    );
  }

  const head = isBreak ? "bg-ink text-white" : "bg-[var(--pact)] text-[var(--pact-ink)]";
  const { evidence } = idea;
  return (
    <main data-color={idea.color} className="min-h-dvh">
      <header className={`px-5 pt-safe pb-6 ${head}`}>
        <div className="flex h-14 items-center pt-3">
          <BackButton fallback="/explore" />
          <span className="ml-1 text-[30px] leading-none" aria-hidden>
            {idea.emoji}
          </span>
          <button
            onClick={() => toast(toggleSaved(idea.id) ? "Saved on this device" : "Removed")}
            aria-pressed={saved}
            aria-label="Save for later"
            className="-mr-2 ml-auto flex h-11 w-11 items-center justify-center"
          >
            <Bookmark size={24} strokeWidth={2.4} fill={saved ? "currentColor" : "none"} aria-hidden />
          </button>
        </div>
        <h1 className="display pt-2 text-[56px] font-extrabold break-words">{idea.title}</h1>
        <p className="mt-2 text-[17px] leading-snug opacity-90">{idea.line}</p>
      </header>

      <div className="px-5 pt-5 pb-6">
        <LevelPicker idea={idea} level={level} draft={draft} onLevel={pick} set={set} />

        {idea.caution && <p className="mt-4 rounded-2xl bg-[#ffe2db] px-4 py-3 text-[15px] leading-snug">{idea.caution}</p>}
        <p className="mt-5 text-[16px] leading-normal text-ink-2">{idea.why}</p>

        <dl className="mt-5 space-y-4">
          <Fact k="With friends">{idea.together}</Fact>
          <Fact k="Day one">{idea.firstStep}</Fact>
          {idea.needs.length > 0 && <Fact k="You'll need">{capitalize(idea.needs.join(", "))}</Fact>}
          <Fact k="Why this number">
            {idea.levels[level].why}
            <span className="mt-1.5 block text-[14px] text-ink-2">
              {evidence.note}{" "}
              {evidence.url ? (
                <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="font-bold text-blue">
                  {evidence.source ?? "Source"}
                </a>
              ) : (
                evidence.source
              )}
            </span>
          </Fact>
        </dl>

        {next.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-[17px] font-extrabold">{isBreak ? "Put something in its place" : "Goes well with"}</h2>
            <IdeaRows cards={next} />
          </section>
        )}
      </div>

      <BottomDock className="bg-gradient-to-t from-mist via-mist/95 to-transparent px-5 pt-8 pb-safe" estimate={110}>
        <button onClick={() => setOpen(true)} className={`mb-1 min-h-16 w-full rounded-[22px] px-4 py-2 text-[18px] leading-tight font-extrabold ${head}`}>
          {startText(idea, draft)}
        </button>
      </BottomDock>

      <Sheet open={open} onClose={close} title={`${idea.emoji} ${pactTitle(idea, draft)}`}>
        <StartForm idea={idea} draft={draft} set={set} offset={offset} onOffset={setOffset} plan={plan} onPlan={setPlan} busy={busy} onCreate={create} onChangeAll={changeAll} />
      </Sheet>
    </main>
  );
}

function Fact({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[14px] font-extrabold text-ink-2">{k}</dt>
      <dd className="mt-0.5 text-[16px] leading-snug">{children}</dd>
    </div>
  );
}
