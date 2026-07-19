import * as React from "react";
import type { RecapData, RecapName, RecapStatLeader, RecapStanding } from "@/lib/data";
import { SUPPORT_HREF } from "@/lib/links";

// Dev/QA + real trigger: ?ff-recap=1 opens the recap on any page (mirrors the
// ?ff-simulate-live convention). The "reshow" button on the homepage (shown
// once the recap has been seen) dispatches this same event instead of relying
// on the URL flag.
const OPEN_EVENT = "rut:open-recap";
const SEEN_EVENT = "rut:recap-seen";
const SEEN_KEY = "rut-wk2026-recap-seen";

const capture = (event: string, props?: Record<string, unknown>) =>
  (window as unknown as { posthog?: { capture: (e: string, p?: Record<string, unknown>) => void } }).posthog?.capture(event, props);

const fmtEuro = (n: number) => (Number.isInteger(n) ? `€${n}` : `€${n.toFixed(2).replace(".", ",")}`);

// App usage numbers for the closing slides (analytics snapshot, hand-curated).
const APP_STATS = [
  { icon: "👀", value: "+36.000", label: "keer bekeken" },
  { icon: "🕐", value: "24/24", label: "elk uur van de dag activiteit tijdens de groepsfase" },
  { icon: "⏱️", value: "5+ min", label: "duurde een gemiddelde sessie" },
  { icon: "📱", value: "300+", label: "verschillende toestellen per week" },
  { icon: "📈", value: "2.500", label: "bezoeken op de topdag, 17 juni" },
];

type Slide =
  | { kind: "intro" }
  | { kind: "matches"; played: number; total: number; teamIsos: string[] }
  | { kind: "goals"; goals: number }
  | { kind: "champion"; teamName: string; teamIso: string }
  | { kind: "topscorer"; players: { player: string; teamName: string | null; teamIso: string | null }[]; goals: number }
  | { kind: "streak"; title: string; subtitle: string; emoji: string; leader: RecapStatLeader }
  | { kind: "standing"; standing: RecapStanding; finale: boolean }
  | { kind: "appstats" }
  | { kind: "thanks" };

const DURATION: Record<Slide["kind"], number> = {
  intro: 3600,
  matches: 5200,
  goals: 3800,
  champion: 4800,
  topscorer: 4500,
  streak: 4500,
  standing: 4200,
  appstats: 8000,
  thanks: 5000,
};

function buildSlides(data: RecapData): Slide[] {
  const slides: Slide[] = [{ kind: "intro" }];
  if (data.matchesPlayed > 0) slides.push({ kind: "matches", played: data.matchesPlayed, total: data.matchesTotal, teamIsos: data.teamIsos });
  if (data.goalsTotal > 0) slides.push({ kind: "goals", goals: data.goalsTotal });
  if (data.champion) slides.push({ kind: "champion", ...data.champion });
  if (data.topScorer) slides.push({ kind: "topscorer", ...data.topScorer });
  if (data.longestOutcomeStreak) {
    slides.push({ kind: "streak", title: "Langste reeks juiste 1X2", subtitle: "wedstrijden op een rij juist", emoji: "🔥", leader: data.longestOutcomeStreak });
  }
  if (data.mostCorrectOutcomes) {
    slides.push({ kind: "streak", title: "Meeste juiste 1X2", subtitle: "voorspellingen in totaal", emoji: "🎯", leader: data.mostCorrectOutcomes });
  }
  if (data.longestExactStreak) {
    slides.push({ kind: "streak", title: "Beste reeks exacte scores", subtitle: "wedstrijden op een rij exact", emoji: "⭐", leader: data.longestExactStreak });
  }
  for (const standing of data.standings) slides.push({ kind: "standing", standing, finale: standing.position === 1 });
  slides.push({ kind: "appstats" }, { kind: "thanks" });
  return slides;
}

function FlagIcon({ iso, className = "" }: { iso: string; className?: string }) {
  return <span className={`fi fi-${iso} inline-block rounded shadow-lg ${className}`} role="img" aria-hidden="true" />;
}

const prefersReducedMotion = () =>
  typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hero numbers count up on slide entry (rAF, ease-out); reduced motion or a
// re-render lands on the final value immediately.
function CountUp({ value, duration = 1100 }: { value: number; duration?: number }) {
  const [shown, setShown] = React.useState(() => (prefersReducedMotion() ? value : 0));
  React.useEffect(() => {
    if (prefersReducedMotion()) { setShown(value); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown.toLocaleString("nl-BE")}</>;
}

/** Shared slide skeleton: gold kicker on top, centered content below —
 *  keeps every slide on the same vertical rhythm. */
function Kicker({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold uppercase tracking-widest text-gold">{children}</p>;
}

/** A row of the same emoji bouncing out of sync (intro trophies, goal balls). */
function BounceRow({ emoji, count = 3, size = "text-5xl" }: { emoji: string; count?: number; size?: string }) {
  return (
    <div className="flex items-end justify-center gap-3" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className={`recap-bounce ${i === Math.floor(count / 2) ? size : "text-3xl"}`} style={{ animationDelay: `${-i * 0.35}s` }}>
          {emoji}
        </span>
      ))}
    </div>
  );
}

/** Participant names, each preceded by the flag of their eindwinnaar pick. */
function NameList({ names, moreCount, className = "" }: { names: RecapName[]; moreCount: number; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-1 ${className}`}>
      {names.map((n) => (
        <p key={n.name} className="flex items-center gap-2 font-display text-xl font-bold">
          {n.winnerIso && <FlagIcon iso={n.winnerIso} className="text-base" />}
          {n.name}
        </p>
      ))}
      {moreCount > 0 && <p className="text-xs text-ink-foreground/60">+{moreCount} anderen</p>}
    </div>
  );
}

// Falling confetti/coins/footballs + a couple of radiating "firework" bursts,
// for the #1 finale and thank-you slides. Purely decorative — disabled under
// prefers-reduced-motion via the .recap-particle/.recap-burst CSS rules.
function FinaleFX({ emojis = ["🎉", "⚽", "💶", "🎊", "⭐", "💰"] }: { emojis?: string[] }) {
  const particles = React.useMemo(() => {
    return Array.from({ length: 26 }, (_, i) => ({
      id: i,
      emoji: emojis[i % emojis.length],
      left: Math.random() * 100,
      delay: Math.random() * 1.4,
      duration: 2.4 + Math.random() * 1.8,
      size: 14 + Math.random() * 14,
      drift: (Math.random() - 0.5) * 70,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bursts = React.useMemo(
    () => Array.from({ length: 4 }, (_, i) => ({ id: i, left: 15 + i * 24 + Math.random() * 10, top: 10 + Math.random() * 25, delay: i * 0.4 })),
    [],
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {bursts.map((b) => (
        <span key={b.id} className="recap-burst" style={{ left: `${b.left}%`, top: `${b.top}%`, animationDelay: `${b.delay}s` }} />
      ))}
      {particles.map((p) => (
        <span
          key={p.id}
          className="recap-particle"
          style={{
            left: `${p.left}%`,
            fontSize: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            "--drift": `${p.drift}px`,
          } as React.CSSProperties}
        >
          {p.emoji}
        </span>
      ))}
    </div>
  );
}

function SlideContent({ slide }: { slide: Slide }) {
  switch (slide.kind) {
    case "intro":
      return (
        <div className="recap-pop flex flex-col items-center gap-4 text-center">
          <BounceRow emoji="🏆" size="text-6xl" />
          <h2 className="font-display text-3xl font-extrabold tracking-tight">
            Rut Prono <span className="text-gold">WK 2026</span>
            <span className="mt-1 block text-4xl">Recap</span>
          </h2>
          <p className="max-w-xs text-sm text-ink-foreground/70">De cijfers, de reeksen en het klassement van het toernooi</p>
        </div>
      );
    case "matches":
      return (
        <div className="recap-pop text-center">
          <Kicker>Het toernooi</Kicker>
          <p className="mt-3 font-display text-7xl font-extrabold tabular-nums text-gold">
            <CountUp value={slide.played} />
          </p>
          <p className="mt-1 text-sm uppercase tracking-wide text-ink-foreground/70">wedstrijden gespeeld</p>
          <div className="mx-auto mt-6 grid max-w-xs grid-cols-8 justify-items-center gap-x-1.5 gap-y-2" aria-hidden="true">
            {slide.teamIsos.map((iso, i) => (
              <span key={iso} className="recap-pop text-xl leading-none" style={{ animationDelay: `${0.3 + i * 0.03}s` }}>
                <FlagIcon iso={iso} />
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-foreground/60">{slide.teamIsos.length} deelnemende landen</p>
        </div>
      );
    case "goals":
      return (
        <div className="recap-pop text-center">
          <Kicker>Doelpunten</Kicker>
          <div className="mt-5"><BounceRow emoji="⚽" count={5} size="text-5xl" /></div>
          <p className="mt-6 font-display text-7xl font-extrabold tabular-nums text-gold">
            <CountUp value={slide.goals} />
          </p>
          <p className="mt-1 text-sm uppercase tracking-wide text-ink-foreground/70">doelpunten gescoord</p>
        </div>
      );
    case "champion":
      return (
        <div className="recap-pop text-center">
          <span className="recap-bounce text-6xl">🏆</span>
          <div className="mt-3"><Kicker>Wereldkampioen</Kicker></div>
          <FlagIcon iso={slide.teamIso} className="mt-4 text-6xl" />
          <p className="mt-4 font-display text-4xl font-extrabold">{slide.teamName}</p>
        </div>
      );
    case "topscorer":
      return (
        <div className="recap-pop text-center">
          <Kicker>Topschutter{slide.players.length > 1 ? "s" : ""}</Kicker>
          <div className="mt-5 flex flex-col items-center gap-3">
            {slide.players.map((p, i) => (
              <div key={p.player} className="recap-pop flex flex-col items-center" style={{ animationDelay: `${0.2 + i * 0.25}s` }}>
                {p.teamIso && <FlagIcon iso={p.teamIso} className="text-4xl" />}
                <p className="mt-2 font-display text-2xl font-extrabold">{p.player}</p>
                {p.teamName && <p className="text-xs text-ink-foreground/70">{p.teamName}</p>}
              </div>
            ))}
          </div>
          <p className="mt-6 font-display text-6xl font-extrabold tabular-nums text-gold"><CountUp value={slide.goals} /></p>
          <p className="mt-1 text-sm uppercase tracking-wide text-ink-foreground/70">goals</p>
        </div>
      );
    case "streak":
      return (
        <div className="recap-pop text-center">
          <span className="recap-bounce text-5xl">{slide.emoji}</span>
          <div className="mt-3"><Kicker>{slide.title}</Kicker></div>
          <p className="mt-2 font-display text-7xl font-extrabold tabular-nums text-gold"><CountUp value={slide.leader.value} /></p>
          <p className="text-sm uppercase tracking-wide text-ink-foreground/70">{slide.subtitle}</p>
          <NameList names={slide.leader.names} moreCount={slide.leader.moreCount} className="mt-5" />
        </div>
      );
    case "standing": {
      const s = slide.standing;
      return (
        <div className="relative flex h-full w-full flex-col items-center justify-center text-center">
          {slide.finale && <FinaleFX />}
          {slide.finale
            ? <span className="recap-bounce text-6xl">🏆</span>
            : <span className="grid size-16 place-items-center rounded-full bg-gold font-display text-3xl font-extrabold text-gold-foreground shadow-lg">{s.position}</span>}
          <div className="mt-3"><Kicker>{slide.finale ? "Nummer één" : "Klassement"}</Kicker></div>
          <NameList names={s.names} moreCount={s.moreCount} className="mt-3" />
          <p className="mt-5 font-display text-6xl font-extrabold tabular-nums text-gold"><CountUp value={s.total} /></p>
          <p className="text-sm uppercase tracking-wide text-ink-foreground/70">punten</p>
          {s.prize > 0 && (
            <p className="mt-5 rounded-full bg-gold px-4 py-1.5 text-sm font-bold text-gold-foreground shadow-lg">💰 {fmtEuro(s.prize)}</p>
          )}
        </div>
      );
    }
    case "appstats":
      return (
        <div className="recap-pop w-full max-w-sm text-center">
          <Kicker>De app in cijfers</Kicker>
          <div className="mt-6 flex flex-col gap-3 text-left">
            {APP_STATS.map((s, i) => (
              <div key={s.icon} className="recap-pop flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3" style={{ animationDelay: `${0.25 + i * 0.35}s` }}>
                <span className="recap-bounce text-2xl" style={{ animationDelay: `${-i * 0.3}s` }} aria-hidden="true">{s.icon}</span>
                <p className="min-w-0 text-sm leading-snug text-ink-foreground/80">
                  <span className="font-display text-lg font-extrabold tabular-nums text-gold">{s.value}</span>{" "}
                  {s.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      );
    case "thanks":
      return (
        <div className="relative flex h-full w-full flex-col items-center justify-center text-center">
          <FinaleFX emojis={["🍻", "❤️", "🎉", "⚽", "🏆"]} />
          <span className="recap-bounce text-6xl">🍻</span>
          <h2 className="mt-4 font-display text-4xl font-extrabold tracking-tight">Bedankt om mee te spelen!</h2>
          <p className="mt-3 max-w-xs text-sm text-ink-foreground/70">
            Rut Prono <span className="font-semibold text-gold">WK 2026</span> · Ruub, Hakke &amp; Barry
          </p>
          <p className="mt-1 text-sm text-ink-foreground/70">Tot het volgende toernooi. Santé!</p>
          <a
            href={SUPPORT_HREF}
            onClick={() => { capture("recap_pint_clicked"); try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ } }}
            className="relative z-10 mt-6 rounded-full bg-gold px-5 py-2 text-sm font-bold text-gold-foreground shadow-lg transition-transform hover:scale-105"
          >
            🍺 Trakteer op een pint
          </a>
        </div>
      );
  }
}

/** `ready` is decided at build time (the final has a result in the committed
 *  data, i.e. the site was regenerated after the last match): only then does
 *  the recap auto-open on a first visit. The ?ff-recap=1 flag and the
 *  homepage button keep working either way. */
export default function Recap({ data, ready = false }: { data: RecapData; ready?: boolean }) {
  const slides = React.useMemo(() => buildSlides(data), [data]);
  const [open, setOpen] = React.useState(false);
  const [index, setIndex] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  const barRefs = React.useRef<Array<HTMLSpanElement | null>>([]);
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const elapsedRef = React.useRef(0);
  const startedAtRef = React.useRef(0);
  const downAtRef = React.useRef<number | null>(null);
  const lastFocusRef = React.useRef<HTMLElement | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const closeBtnRef = React.useRef<HTMLButtonElement | null>(null);

  const duration = DURATION[slides[index]?.kind] ?? 4200;

  const close = React.useCallback((reason: string) => {
    setOpen(false);
    try { localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
    capture("recap_closed", { reason, atSlide: index + 1, totalSlides: slides.length });
    window.dispatchEvent(new CustomEvent(SEEN_EVENT));
  }, [index, slides.length]);

  const advance = React.useCallback(() => {
    if (index + 1 >= slides.length) { close("finished"); return; }
    setIndex(index + 1);
  }, [index, slides.length, close]);

  const goPrev = () => setIndex((i) => Math.max(0, i - 1));

  // Open triggers: the ?ff-recap=1 URL flag (any page) and the homepage
  // "bekijk opnieuw" button, which dispatches rut:open-recap.
  React.useEffect(() => {
    const openWith = (source: string) => {
      lastFocusRef.current = document.activeElement as HTMLElement | null;
      setIndex(0);
      setOpen(true);
      capture("recap_opened", { source });
    };
    try {
      if (new URLSearchParams(location.search).get("ff-recap") === "1") openWith("flag");
      else if (ready && !localStorage.getItem(SEEN_KEY)) openWith("auto");
    } catch { /* ignore */ }
    const onOpenEvent = () => openWith("button");
    window.addEventListener(OPEN_EVENT, onOpenEvent);
    return () => window.removeEventListener(OPEN_EVENT, onOpenEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock page scroll while open; restore focus to whatever opened it on close.
  React.useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    rootRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      lastFocusRef.current?.focus?.();
    };
  }, [open]);

  // Pausable per-slide timer: a JS timeout (not CSS animationend) drives
  // advancing, so it stays correct across pause/resume and reduced-motion.
  // The bar's width is painted imperatively via rAF for a smooth fill.
  React.useEffect(() => {
    if (!open) return;
    elapsedRef.current = 0;
    barRefs.current.forEach((bar, i) => { if (bar) bar.style.width = i < index ? "100%" : "0%"; });
    if (paused) return;
    startedAtRef.current = performance.now();
    timeoutRef.current = setTimeout(advance, duration);
    const tick = () => {
      const bar = barRefs.current[index];
      if (bar) {
        const elapsed = elapsedRef.current + (performance.now() - startedAtRef.current);
        bar.style.width = `${Math.min(100, (elapsed / duration) * 100)}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, index]);

  React.useEffect(() => {
    if (!open) return;
    if (paused) {
      if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      elapsedRef.current += performance.now() - startedAtRef.current;
      return;
    }
    if (timeoutRef.current) return; // already running (initial mount effect handles it)
    const remaining = Math.max(0, duration - elapsedRef.current);
    startedAtRef.current = performance.now();
    timeoutRef.current = setTimeout(advance, remaining);
    const tick = () => {
      const bar = barRefs.current[index];
      if (bar) {
        const elapsed = elapsedRef.current + (performance.now() - startedAtRef.current);
        bar.style.width = `${Math.min(100, (elapsed / duration) * 100)}%`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);

  // Pause while the tab is hidden (matches LiveScores' pattern).
  React.useEffect(() => {
    if (!open) return;
    const onVis = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { close("escape"); return; }
      if (e.key === "ArrowRight") { advance(); return; }
      if (e.key === "ArrowLeft") { goPrev(); return; }
      // Only the close button is tabbable inside the dialog (tap zones opt
      // out via tabIndex=-1) — a full trap just means Tab always lands there.
      if (e.key === "Tab") { e.preventDefault(); closeBtnRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close, advance]);

  if (!open) return null;

  const HOLD_MS = 250;
  const onZoneDown = () => { downAtRef.current = Date.now(); setPaused(true); };
  const onZoneUp = (dir: "prev" | "next") => {
    const held = downAtRef.current ? Date.now() - downAtRef.current : 0;
    downAtRef.current = null;
    setPaused(false);
    if (held < HOLD_MS) (dir === "next" ? advance() : goPrev());
  };
  const onZoneLeave = () => { if (downAtRef.current) { downAtRef.current = null; setPaused(false); } };

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="WK Recap"
      tabIndex={-1}
      className="fixed inset-0 z-[70] flex flex-col text-ink-foreground outline-none"
      style={{ background: "linear-gradient(160deg, var(--ink), oklch(0.30 0.03 80))" }}
    >
      <div className="flex shrink-0 gap-1 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        {slides.map((_, i) => (
          <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
            <span
              ref={(el) => { barRefs.current[i] = el; }}
              className="block h-full rounded-full bg-gold"
              style={{ width: i < index ? "100%" : "0%" }}
            />
          </span>
        ))}
      </div>

      <div className="flex shrink-0 items-center justify-between px-3 py-2.5">
        <span className="font-display text-sm font-bold tracking-tight">
          Rut Prono <span className="text-gold">WK 2026</span>
        </span>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={() => close("close_button")}
          aria-label="Recap sluiten"
          className="grid size-9 place-items-center rounded-full text-ink-foreground/80 hover:bg-white/10"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="size-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      </div>

      <div className="relative min-h-0 flex-1 px-6">
        <div className="flex h-full w-full items-center justify-center">
          <SlideContent key={index} slide={slides[index]} />
        </div>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Vorige"
          onPointerDown={onZoneDown}
          onPointerUp={() => onZoneUp("prev")}
          onPointerLeave={onZoneLeave}
          className="absolute inset-y-0 left-0 w-[35%] cursor-default"
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Volgende"
          onPointerDown={onZoneDown}
          onPointerUp={() => onZoneUp("next")}
          onPointerLeave={onZoneLeave}
          className="absolute inset-y-0 right-0 w-[65%] cursor-default"
        />
      </div>
    </div>
  );
}
