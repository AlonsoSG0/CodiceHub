// Four throwaway Home control-center variants, switchable via ?variant=A|B|C|D on /home-prototype.
import { useEffect, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Command, Search, Sparkles } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { Callout } from "@/components/mdxcn/callout";
import { Marquee } from "@/components/magicui/marquee";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { DotPattern } from "@/components/magicui/dot-pattern";
import { InView } from "@/components/motion-primitives/in-view";
import { ProgressiveBlur } from "@/components/motion-primitives/progressive-blur";
import { MiniChart } from "@/components/ui-kit";

const sections = [{ name: "Notes", href: "/", icon: BookOpen, metric: 12, label: "pages" }];
const variants = ["A", "B", "C", "D"] as const;
const chartData = [
  { label: "M", value: 2 }, { label: "T", value: 5 }, { label: "W", value: 3 },
  { label: "T", value: 7 }, { label: "F", value: 4 }, { label: "S", value: 6 }, { label: "S", value: 3 },
];

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function Clock({ now, small = false }: { now: Date; small?: boolean }) {
  const time = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(now);
  return <time className={`font-mono tabular-nums tracking-tight ${small ? "text-2xl" : "text-6xl sm:text-8xl"}`} dateTime={now.toISOString()}>{time}</time>;
}

function SectionLink({ compact = false }: { compact?: boolean }) {
  return <>{sections.map(({ name, href, icon: Icon, metric, label }) => (
    <Link key={name} to={href} className={`group flex items-center gap-3 rounded-xl border border-border bg-card text-card-foreground transition-colors hover:bg-accent ${compact ? "px-3 py-2 text-sm" : "p-4"}`}>
      <Icon className="size-5 text-primary" /> <span className="font-medium">{name}</span>
      {!compact && <span className="ml-auto text-sm text-muted-foreground">{metric} {label}</span>}
      {compact && <span className="ml-auto text-xs text-muted-foreground">N</span>}
    </Link>
  ))}</>;
}

function VariantA({ now }: { now: Date }) {
  const reduced = useReducedMotion();
  return <div className="relative flex min-h-[72vh] flex-col items-center justify-center gap-8 overflow-hidden px-6 pb-28 text-center">
    <DotPattern className="pointer-events-none absolute inset-0 -z-10 opacity-30" />
    <div><p className="mb-3 text-sm uppercase tracking-[.3em] text-muted-foreground">A quiet place to begin</p><Clock now={now} /></div>
    <Callout type="tip" title="Welcome home" className="max-w-xl text-left">Your workspace is ready. Start with a note, or take a moment to decide what matters today.</Callout>
    <div className="fixed bottom-20 left-1/2 z-10 flex -translate-x-1/2 items-end gap-2 rounded-2xl border border-border bg-background/90 p-3 shadow-xl backdrop-blur">
      {sections.map(({ name, href, icon: Icon }) => <Link key={name} to={href} className="group flex flex-col items-center gap-1 rounded-xl p-3 transition-transform duration-200 hover:-translate-y-2 hover:scale-125" title={name}>
        <Icon className="size-6" /><span className="text-xs">{name}</span>
      </Link>)}
    </div>
    <Marquee repeat={1} className={reduced ? "hidden" : "max-w-2xl text-sm text-muted-foreground"} aria-label="Workspace reminder">Make room for what matters · Small steps, steady progress · </Marquee>
  </div>;
}

function VariantB({ now }: { now: Date }) {
  return <div className="grid min-h-[72vh] gap-4 p-4 md:grid-cols-3 md:grid-rows-2">
    <section className="flex flex-col justify-center rounded-2xl border border-border bg-card p-6 md:col-span-2">
      <p className="mb-2 text-sm text-muted-foreground">Your workspace · Today</p><Clock now={now} /><p className="mt-2 text-muted-foreground">A clear view of your personal system.</p>
    </section>
    {sections.map(({ name, href, icon: Icon, metric, label }) => <Link key={name} to={href} className="flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-colors hover:bg-accent">
      <div className="flex items-center justify-between"><span className="font-medium">{name}</span><Icon className="size-5 text-primary" /></div>
      <div><div className="text-3xl font-semibold"><NumberTicker value={metric} /> <span className="text-sm font-normal text-muted-foreground">{label}</span></div><MiniChart data={chartData} label={`${name} activity this week`} height={90} /></div>
    </Link>)}
    <section className="rounded-2xl border border-border bg-card p-5"><p className="mb-3 text-sm text-muted-foreground">This week</p><MiniChart data={chartData} label="Weekly activity" height={140} /></section>
    <section className="flex items-center gap-3 rounded-2xl border border-dashed border-border p-5 text-muted-foreground md:col-span-3"><Sparkles className="size-5"/> Add a section here when your workspace grows.</section>
  </div>;
}

function VariantC({ now }: { now: Date }) {
  const openPalette = () => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
  return <div className="mx-auto grid min-h-[72vh] max-w-3xl content-center gap-7 p-6">
    <div className="flex items-start justify-between"><div><p className="text-sm text-muted-foreground">Quick launch</p><h1 className="mt-1 text-3xl font-semibold">Where to?</h1></div><Clock now={now} small /></div>
    <label className="flex h-14 items-center gap-3 rounded-xl border border-border bg-card px-4 text-muted-foreground shadow-sm hover:bg-accent"><Search className="size-5"/><input aria-label="Search pages or run a command" readOnly onClick={openPalette} placeholder="Search pages or run a command…" className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"/><kbd className="shrink-0 rounded border px-2 py-1 text-xs"><Command className="inline size-3"/> K</kbd></label>
    <p className="-mt-4 text-xs text-muted-foreground">Opens the existing workspace search palette.</p>
    <nav aria-label="Home section shortcuts" className="grid gap-2"><SectionLink compact /></nav>
  </div>;
}

function VariantD({ now }: { now: Date }) {
  const reduced = useReducedMotion();
  const day = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);
  const agenda = [{ time: "09:00", title: "Choose today's focus", detail: "A quiet start" }, { time: "11:30", title: "Capture loose thoughts", detail: "Add them to Notes" }, { time: "16:00", title: "Review and reset", detail: "Leave a clean runway" }];
  return <div className="grid min-h-[72vh] gap-6 p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
    <main className="relative overflow-hidden rounded-3xl border border-border bg-card p-6 sm:p-10"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-sm text-muted-foreground">{day}</p><h1 className="mt-2 text-2xl font-medium">What now?</h1></div><Clock now={now} small /></div>
      <div className="relative mt-10 space-y-0">{agenda.map((item, index) => <InView key={item.time} once transition={reduced ? { duration: 0 } : { duration: 0.45, delay: index * 0.12 }}><article className="relative grid grid-cols-[64px_1fr] gap-4 border-l border-border pb-9 pl-5 last:pb-2"><span className="absolute -left-[5px] top-1 size-2 rounded-full bg-primary"/><time className="font-mono text-sm text-muted-foreground">{item.time}</time><div><h2 className="font-medium">{item.title}</h2><p className="mt-1 text-sm text-muted-foreground">{item.detail}</p></div></article></InView>)}</div>
      <ProgressiveBlur direction="bottom" className="pointer-events-none absolute inset-x-0 bottom-0 h-12" blurLayers={5} />
    </main>
    <aside className="space-y-3"><div className="mb-4 flex items-center gap-2 text-sm font-medium"><CalendarDays className="size-4"/> Sections</div><SectionLink compact /></aside>
  </div>;
}

export function HomePrototypePage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const requested = params.get("variant");
  const variant = variants.includes(requested as (typeof variants)[number]) ? requested as (typeof variants)[number] : "A";
  const now = useClock();
  const index = variants.indexOf(variant);
  const switchTo = (next: number) => setParams({ variant: variants[(next + variants.length) % variants.length] });
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && (event.target.isContentEditable || ["INPUT", "TEXTAREA"].includes(event.target.tagName))) return;
      if (event.key === "ArrowLeft") switchTo(index - 1);
      if (event.key === "ArrowRight") switchTo(index + 1);
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [index]);
  const label = { A: "Clock + dock", B: "Control-center bento", C: "Launcher", D: "Agenda / focus" }[variant];
  return <div className="pb-24">
    {variant === "A" && <VariantA now={now} />}{variant === "B" && <VariantB now={now} />}{variant === "C" && <VariantC now={now} />}{variant === "D" && <VariantD now={now} />}
    <div className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-border bg-background/95 px-3 py-2 text-xs shadow-xl backdrop-blur" role="group" aria-label="Prototype variant switcher">
      <button type="button" onClick={() => switchTo(index - 1)} aria-label="Previous variant" className="rounded-full p-1 hover:bg-accent"><ArrowLeft className="size-4"/></button>
      <span className="font-semibold">{variant} · {label}</span><button type="button" onClick={() => switchTo(index + 1)} aria-label="Next variant" className="rounded-full p-1 hover:bg-accent"><ArrowRight className="size-4"/></button>
      <span className="text-muted-foreground">route: {location.pathname}{location.search} · sections: {sections.map(({ name }) => name).join(", ")}</span>
    </div>
  </div>;
}
