import { useEffect, useRef } from "react";
import { DISCOVERIES, type Game, type Hud as HudState } from "../game/engine";
import { block } from "../game/blocks";
import { cn } from "../utils/cn";
import { Meter, Stat } from "./bits";

const DISCOVERY_COUNT = DISCOVERIES.length;

/* ------------------------------------------------------------------ */
/* crosshair                                                           */
/* ------------------------------------------------------------------ */
function Crosshair({ active, progress }: { active: boolean; progress: number }) {
  const arm = active ? 9 : 6;
  const gap = active ? 5 : 3;
  return (
    <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div className="relative h-16 w-16">
        {[
          { t: `translate(-50%,-50%) rotate(0deg) translateY(-${gap + arm / 2}px)`, h: arm, w: 2 },
          { t: `translate(-50%,-50%) rotate(90deg) translateY(-${gap + arm / 2}px)`, h: arm, w: 2 },
          { t: `translate(-50%,-50%) rotate(180deg) translateY(-${gap + arm / 2}px)`, h: arm, w: 2 },
          { t: `translate(-50%,-50%) rotate(270deg) translateY(-${gap + arm / 2}px)`, h: arm, w: 2 },
        ].map((a, i) => (
          <div key={i} className="absolute top-1/2 left-1/2" style={{ transform: a.t }}>
            <div
              className="transition-all duration-150 ease-out"
              style={{
                width: a.w,
                height: a.h,
                background: "rgba(255,255,255,0.92)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.55), 0 0 6px rgba(0,0,0,0.35)",
                transform: "translate(-50%,-50%)",
              }}
            />
          </div>
        ))}
        {progress > 0 && (
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="14" fill="none" stroke="rgba(0,0,0,0.45)" strokeWidth="3" />
            <circle
              cx="32"
              cy="32"
              r="14"
              fill="none"
              stroke="#ffc459"
              strokeWidth="3"
              strokeLinecap="butt"
              strokeDasharray={`${progress * 88} 88`}
            />
          </svg>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* hotbar                                                              */
/* ------------------------------------------------------------------ */
function Hotbar({ hud, icons }: { hud: HudState; icons: (id: number) => string }) {
  return (
    <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
      <div
        className={cn(
          "font-display text-[11px] tracking-[0.16em] text-white/90 transition-all duration-200",
          hud.targetName ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        )}
        style={{ textShadow: "0 2px 0 rgba(0,0,0,0.75)" }}
      >
        {hud.targetName.toUpperCase()}
      </div>
      <div className="flex items-end gap-[3px] rounded-[4px] border-2 border-black/60 bg-[#0b1119]/78 p-[3px] shadow-[0_10px_30px_rgba(0,0,0,0.55)]">
        {hud.hotbar.map((id, i) => {
          const sel = i === hud.selected;
          return (
            <div key={i} className="relative">
              <div
                className={cn(
                  "slot-voxel relative flex h-[52px] w-[52px] items-center justify-center transition-all duration-150",
                  sel
                    ? "-translate-y-[6px] bg-[#2b3a4f] ring-2 ring-[#7ac74f] ring-offset-0"
                    : "bg-[#1a2432]/85 hover:bg-[#22303f]"
                )}
              >
                <img
                  src={icons(id)}
                  alt=""
                  className="pixelated h-[42px] w-[42px] drop-shadow-[0_2px_2px_rgba(0,0,0,0.55)]"
                  draggable={false}
                />
                <span className="absolute top-[1px] left-[3px] font-display text-[8px] text-white/45">{i + 1}</span>
                {sel && (
                  <span className="pointer-events-none absolute -inset-[2px] border-2 border-white/25" aria-hidden />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* minimap                                                             */
/* ------------------------------------------------------------------ */
function Minimap({ game, playing }: { game: Game; playing: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!playing) return;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      if (ref.current) game.drawMinimap(ref.current, 140, 1);
      setTimeout(tick, 160);
    };
    tick();
    return () => {
      alive = false;
    };
  }, [game, playing]);

  return (
    <div className="panel-voxel relative h-[152px] w-[152px] overflow-hidden rounded-full bg-[#0a1018] p-[6px]">
      <canvas ref={ref} width={140} height={140} className="pixelated h-[140px] w-[140px] rounded-full" />
      <div className="pointer-events-none absolute inset-0 rounded-full shadow-[inset_0_0_24px_rgba(0,0,0,0.75)]" />
      <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-black/60" />
      {[
        ["N", "top-[7px] left-1/2 -translate-x-1/2"],
        ["S", "bottom-[7px] left-1/2 -translate-x-1/2"],
        ["E", "right-[8px] top-1/2 -translate-y-1/2"],
        ["W", "left-[8px] top-1/2 -translate-y-1/2"],
      ].map(([l, cls]) => (
        <span
          key={l}
          className={cn("pointer-events-none absolute font-display text-[9px] text-[#cfe0f5]/80", cls)}
          style={{ textShadow: "0 1px 2px #000" }}
        >
          {l}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* clock dial                                                          */
/* ------------------------------------------------------------------ */
function ClockDial({ hud }: { hud: HudState }) {
  const ang = hud.timeOfDay * 360 - 90;
  const night = hud.dayFactor < 0.35;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-[52px] w-[52px]">
        <svg viewBox="0 0 52 52" className="h-full w-full">
          <defs>
            <linearGradient id="dialg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={night ? "#0b1226" : "#5ea9e8"} />
              <stop offset="100%" stopColor={night ? "#05070f" : "#cfe6f7"} />
            </linearGradient>
          </defs>
          <circle cx="26" cy="26" r="24" fill="url(#dialg)" stroke="#000" strokeWidth="2.5" />
          <path d="M2 26 H50" stroke="rgba(0,0,0,0.35)" strokeWidth="1" />
          <g transform={`rotate(${ang} 26 26)`}>
            <circle cx="26" cy="9" r="5" fill={night ? "#e8eefc" : "#ffd76a"} stroke="#000" strokeWidth="1.2" />
          </g>
          <circle cx="26" cy="26" r="24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
        </svg>
      </div>
      <div className="leading-tight">
        <div className="font-display text-[16px] text-[#f2f7ff]" style={{ textShadow: "0 2px 0 rgba(0,0,0,0.7)" }}>
          {hud.clock}
        </div>
        <div className="font-body text-[10px] tracking-[0.18em] text-[#8fa4bf] uppercase">
          {night ? "Night" : hud.dayFactor > 0.85 ? "Day" : hud.timeOfDay < 0.5 ? "Sunrise" : "Sunset"}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* compass strip                                                       */
/* ------------------------------------------------------------------ */
function Compass({ heading }: { heading: number }) {
  const marks = [
    [0, "N"],
    [45, "NE"],
    [90, "E"],
    [135, "SE"],
    [180, "S"],
    [225, "SW"],
    [270, "W"],
    [315, "NW"],
  ];
  const W = 320;
  const scale = W / 200;
  return (
    <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2">
      <div
        className="panel-voxel relative h-[34px] overflow-hidden bg-[#0b1119]/78"
        style={{ width: W }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {marks.map(([deg, label]) => {
            let d = ((deg as number) - heading + 540) % 360 - 180;
            if (Math.abs(d) > 100) return null;
            const x = W / 2 + d * scale;
            const major = (deg as number) % 90 === 0;
            return (
              <div key={label as string} className="absolute top-0 h-full" style={{ left: x }}>
                <div
                  className={cn(
                    "absolute top-[3px] h-[7px] w-[2px] -translate-x-1/2",
                    major ? "bg-[#ffc459]" : "bg-[#4c5f77]"
                  )}
                />
                <span
                  className={cn(
                    "absolute top-[12px] -translate-x-1/2 font-display",
                    major ? "text-[11px] text-[#f0f6ff]" : "text-[8px] text-[#7f93ad]"
                  )}
                >
                  {label}
                </span>
              </div>
            );
          })}
          {/* minor ticks every 15° */}
          {Array.from({ length: 24 }, (_, i) => i * 15).map((deg) => {
            const d = ((deg - heading + 540) % 360) - 180;
            if (Math.abs(d) > 100 || deg % 45 === 0) return null;
            return (
              <div
                key={deg}
                className="absolute top-[5px] h-[4px] w-px bg-[#33445a]"
                style={{ left: W / 2 + d * scale }}
              />
            );
          })}
        </div>
        <div className="absolute top-0 left-1/2 h-full w-px -translate-x-1/2 bg-[#7ac74f]/80" />
        <div className="absolute -top-[1px] left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-[#7ac74f]" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0b1119] via-transparent to-[#0b1119]" />
        <div className="absolute right-2 bottom-[3px] font-display text-[8px] tracking-[0.1em] text-[#6f839c]">
          {Math.round(heading).toString().padStart(3, "0")}°
        </div>
      </div>
    </div>
  );
}

function WeatherChip({ kind, intensity }: { kind: number; intensity: number }) {
  const glyph = ["◉", "☂", "⚡", "❄"][kind] ?? "◉";
  const label = ["Clear", "Rain", "Storm", "Snow"][kind] ?? "Clear";
  return (
    <div className="panel-voxel flex items-center gap-2 bg-[#0d1420]/78 px-3 py-[6px]">
      <span
        className={cn("font-display text-[12px]", kind === 2 ? "text-[#ffe08a]" : "text-[#79c7ff]")}
        style={{ textShadow: kind === 2 ? "0 0 8px rgba(255,224,138,0.7)" : undefined }}
      >
        {glyph}
      </span>
      <span className="font-display text-[10px] tracking-[0.14em] text-[#b9c9dc]">{label.toUpperCase()}</span>
      {kind !== 0 && (
        <span className="ml-1 h-[6px] w-[34px] overflow-hidden bg-black/50">
          <span
            className="block h-full bg-gradient-to-r from-[#4a6f8f] to-[#9fd4ff] transition-[width] duration-500"
            style={{ width: `${Math.round(intensity * 100)}%` }}
          />
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* main hud                                                            */
/* ------------------------------------------------------------------ */
function Hints({ show }: { show: boolean }) {
  const rows: [string[], string][] = [
    [["W", "A", "S", "D"], "move"],
    [["SPACE"], "jump · tap twice to fly"],
    [["LMB"], "mine"],
    [["RMB"], "place"],
    [["E"], "block library"],
    [["ESC"], "pause"],
  ];
  return (
    <div
      className={cn(
        "panel-voxel absolute bottom-[104px] left-1/2 flex -translate-x-1/2 items-center gap-4 bg-[#0b1119]/88 px-5 py-2.5 transition-all duration-700",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0"
      )}
    >
      {rows.map(([keys, label], i) => (
        <div key={i} className="flex items-center gap-1.5">
          <div className="flex gap-1">
            {keys.map((k) => (
              <kbd
                key={k}
                className="inline-flex items-center rounded-[3px] border-b-[3px] border-black/70 bg-gradient-to-b from-[#3a4557] to-[#232c3b] px-1.5 py-[3px] font-display text-[9px] leading-none text-[#dbe6f5]"
              >
                {k}
              </kbd>
            ))}
          </div>
          <span className="font-body text-[11px] whitespace-nowrap text-[#93a7bd]">{label}</span>
        </div>
      ))}
    </div>
  );
}

export function Hud({
  hud,
  game,
  icons,
  playing,
  impact,
  hints,
}: {
  hud: HudState;
  game: Game;
  icons: (id: number) => string;
  playing: boolean;
  impact: number;
  hints: boolean;
}) {
  const fpsColor = hud.fps > 50 ? "#7ac74f" : hud.fps > 30 ? "#ffc459" : "#e0604f";
  const fadeIn = hud.intro > 0 ? Math.max(0, 1 - hud.intro * 2.6) : 1;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 select-none">
      {/* atmosphere */}
      <div className="absolute inset-0 vignette" />
      <div className="absolute inset-0 scan-lines opacity-[0.08]" />
      <div
        className={cn("absolute inset-0 transition-opacity duration-500", hud.underwater ? "water-tint opacity-100" : "opacity-0")}
      />
      <div
        className="absolute inset-0 hurt-flash transition-opacity duration-300"
        style={{ opacity: impact }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-100"
        style={{
          opacity: Math.min(0.9, hud.flash * 0.9),
          background: "radial-gradient(120% 100% at 50% 20%, rgba(226,240,255,0.95), rgba(150,190,255,0.45) 60%, transparent 100%)",
          mixBlendMode: "screen",
        }}
      />

      <div style={{ opacity: fadeIn }} className="absolute inset-0 transition-opacity duration-150">
      <Crosshair active={!!hud.targetName} progress={hud.breaking} />

      <Compass heading={hud.heading} />

      {/* top-left : clock + world id */}
      <div className="absolute top-[52px] left-4 flex flex-col gap-2">
        <div className="panel-voxel flex items-center gap-3 bg-[#0d1420]/80 px-3 py-2">
          <ClockDial hud={hud} />
        </div>
        <div className="panel-voxel flex items-center gap-2 bg-[#0d1420]/72 px-3 py-[6px]">
          <span className="h-2 w-2 animate-pulse rounded-full bg-[#7ac74f]" />
          <span className="font-display text-[10px] tracking-[0.14em] text-[#b9c9dc]">{hud.biome.toUpperCase()}</span>
        </div>
        <WeatherChip kind={hud.weather} intensity={hud.weatherIntensity} />
        <div className="panel-voxel flex items-center gap-2 bg-[#0d1420]/72 px-3 py-[6px]">
          <span className="font-display text-[9px] tracking-[0.18em] text-[#6f839c]">DISCOVERIES</span>
          <span className="font-display text-[10px] text-[#ffc459]">
            {hud.unlocked.length}/{DISCOVERY_COUNT}
          </span>
        </div>
      </div>

      {/* top-right : minimap */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
        <Minimap game={game} playing={playing} />
        <div className="panel-voxel flex items-center gap-2 bg-[#0d1420]/78 px-2.5 py-1.5">
          <span className="font-display text-[9px] tracking-[0.14em] text-[#8fa4bf]">MODE</span>
          <span className="font-display text-[10px] tracking-[0.1em] text-[#ffc459]">{hud.mode}</span>
        </div>
      </div>

      {/* bottom-left : telemetry */}
      <div className="panel-voxel absolute bottom-4 left-4 w-[212px] bg-[#0d1420]/82 px-3 py-2.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-display text-[9px] tracking-[0.2em] text-[#7f93ad]">TELEMETRY</span>
          <span className="font-display text-[10px]" style={{ color: fpsColor }}>
            {Math.round(hud.fps)} FPS
          </span>
        </div>
        <div className="flex flex-col gap-[3px]">
          <Stat
            label="XYZ"
            mono
            value={`${hud.x.toFixed(1)} ${hud.y.toFixed(1)} ${hud.z.toFixed(1)}`}
          />
          <Stat label="Depth" mono value={`${hud.depth} m`} />
          <Stat label="Chunks" mono value={`${hud.chunks}`} />
          <Stat label="Tris" mono value={`${(hud.tris / 1000).toFixed(0)}k`} />
          <Stat label="Mined" mono value={`${hud.mined}`} accent="#7ac74f" />
          <Stat label="Placed" mono value={`${hud.placed}`} accent="#79c7ff" />
        </div>
        <div className="mt-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-body text-[10px] tracking-[0.16em] text-[#6f839c] uppercase">Light</span>
            <span className="font-display text-[10px] text-[#ffc459]">{hud.light.toFixed(1)}</span>
          </div>
          <Meter value={hud.light / 15} color="linear-gradient(90deg,#6b4a12,#ffc459)" />
        </div>
      </div>

      <Hints show={hints && playing} />
      <Hotbar hud={hud} icons={icons} />
      </div>
    </div>
  );
}

export function blockName(id: number) {
  return block(id).name;
}
