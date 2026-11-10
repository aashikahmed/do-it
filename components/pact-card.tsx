import Link from "next/link";
import type { PactBundle } from "@/lib/data";
import { answerOn, didTheirPart, needsMe, owesMakeUp, progressText, statusLine, streakUnit } from "@/lib/view";
import { Avatar } from "./avatar";
import { Chain, recentWindow } from "./chain";

export function PactCard({ b, me }: { b: PactBundle; me: string }) {
  const line = statusLine(b, me);
  const mine = needsMe(b, me);
  const isBreak = b.pact.kind === "break";
  const makeUp = !isBreak && owesMakeUp(b, me);
  const recent = recentWindow(b.state.periods, b.state.current?.index ?? null, 7);
  const ended = b.state.phase === "ended";

  return (
    <Link
      href={`/p/${b.pact.id}`}
      data-color={b.pact.color}
      className={`block rounded-[28px] p-5 transition-transform active:scale-[0.985] ${
        ended ? "bg-paper text-ink" : "bg-[var(--pact)] text-[var(--pact-ink)]"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-[26px] ${ended ? "bg-mist" : "bg-white/20"}`}
          aria-hidden
        >
          {b.pact.emoji}
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="truncate text-[20px] leading-tight font-extrabold tracking-tight">{b.pact.title}</h3>
          <p className="mt-0.5 text-[14px] font-medium opacity-75">{progressText(b)}</p>
        </div>
        {b.state.phase !== "upcoming" && <div className="text-right">
          <p className="display tnum text-[44px] font-extrabold">{ended ? b.state.best : b.state.streak}</p>
          <p className="-mt-0.5 text-[12px] font-semibold opacity-75">
            {ended ? "best" : streakUnit(b, b.state.streak)}
          </p>
        </div>}
      </div>

      {b.state.phase !== "upcoming" && (
        <div className="mt-4">
          <Chain periods={recent} perRow={7} tone={ended ? "onLight" : "onColor"} size={0.86} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <div className="flex -space-x-2">
          {b.members.slice(0, 5).map((m) => (
            <Avatar
              key={m.user_id}
              id={m.user_id}
              name={m.name}
              src={m.avatar_url}
              size={30}
              ring="#fff"
              done={!ended && b.state.phase === "active" && (isBreak ? answerOn(b, m.user_id, b.today) === "yes" : didTheirPart(b, m.user_id))}
            />
          ))}
        </div>
        <p className="min-w-0 flex-1 text-[15px] leading-snug font-semibold">{line.text}</p>
        {makeUp ? (
          <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-extrabold text-ink">Make up</span>
        ) : b.state.repair && !b.state.late ? (
          <span className="shrink-0 rounded-full bg-ice px-3 py-1.5 text-[13px] font-extrabold text-ink">Freeze</span>
        ) : (
          mine && <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[13px] font-extrabold text-ink">{isBreak ? "Answer" : "Your turn"}</span>
        )}
      </div>
    </Link>
  );
}
