import { useState } from "react";
import { DISCOVERIES, type Hud, type Settings } from "../game/engine";
import { PLACEABLE, block } from "../game/blocks";
import { cn } from "../utils/cn";
import { KeyCap, Meter, Stat, VoxelButton } from "./bits";

export interface Toast {
  id: number;
  title: string;
  sub?: string;
  kind?: "info" | "discovery";
}

export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="pointer-events-none absolute top-[86px] left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cn(
            "anim-pop panel-voxel flex items-center gap-3 px-4 py-2.5",
            t.kind === "discovery"
              ? "border-[#ffc459]/60 bg-gradient-to-r from-[#2a1f08]/95 to-[#141019]/95"
              : "bg-[#0d1420]/92"
          )}
        >
          <span
            className={cn(
              "h-2.5 w-2.5 rotate-45",
              t.kind === "discovery" ? "bg-[#ffe08a] shadow-[0_0_14px_#ffc459]" : "bg-[#7ac74f] shadow-[0_0_10px_#7ac74f]"
            )}
          />
          <div className="leading-tight">
            <div
              className={cn(
                "font-display text-[11px] tracking-[0.12em] uppercase",
                t.kind === "discovery" ? "text-[#ffd98a]" : "text-[#eaf2ff]"
              )}
            >
              {t.title}
            </div>
            {t.sub && <div className="font-body text-[11px] text-[#9fb2c8]">{t.sub}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Discoveries({ unlocked }: { unlocked: string[] }) {
  const set = new Set(unlocked);
  return (
    <div className="panel-voxel bg-[#0b1119]/92 p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <span className="font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">DISCOVERIES</span>
        <span className="font-display text-[11px] text-[#ffc459]">
          {unlocked.length}/{DISCOVERIES.length}
        </span>
      </div>
      <div className="grid max-h-[240px] grid-cols-1 gap-1.5 overflow-y-auto pr-1">
        {DISCOVERIES.map((d) => {
          const got = set.has(d.id);
          return (
            <div
              key={d.id}
              className={cn(
                "flex items-center gap-2.5 border-l-[3px] px-2 py-1.5 transition-colors",
                got ? "border-[#ffc459] bg-[#ffc459]/10" : "border-[#24303f] bg-[#121a26]/70"
              )}
            >
              <span className={cn("font-display text-[11px]", got ? "text-[#ffd98a]" : "text-[#3d4c5e]")}>
                {got ? "★" : "☆"}
              </span>
              <div className="leading-tight">
                <div
                  className={cn(
                    "font-display text-[10px] tracking-[0.1em]",
                    got ? "text-[#eaf2ff]" : "text-[#4d5f74]"
                  )}
                >
                  {got ? d.title.toUpperCase() : "— — — — —"}
                </div>
                <div className={cn("font-body text-[10px]", got ? "text-[#9fb2c8]" : "text-[#3d4c5e]")}>{d.sub}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function weatherLabel(kind: number) {
  return ["Clear", "Rain", "Thunderstorm", "Snowfall"][kind] ?? "Clear";
}

export function weatherGlyph(kind: number) {
  return ["◉", "☂", "⚡", "❄"][kind] ?? "◉";
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label className="block">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="font-body text-[10px] tracking-[0.18em] text-[#7f93ad] uppercase">{label}</span>
        <span className="font-display text-[11px] text-[#ffc459]">{fmt ? fmt(value) : value}</span>
      </div>
      <div className="relative h-[18px]">
        <div className="absolute top-1/2 h-[8px] w-full -translate-y-1/2 border-2 border-black/60 bg-[#0b1119]">
          <div className="h-full bg-gradient-to-r from-[#4f8f2c] to-[#9ce06a]" style={{ width: `${pct}%` }} />
        </div>
        <div
          className="pointer-events-none absolute top-1/2 h-[16px] w-[10px] -translate-x-1/2 -translate-y-1/2 border-2 border-black/70 bg-[#dce7f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
          style={{ left: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className="flex w-full items-center justify-between gap-3 py-1"
    >
      <span className="font-body text-[10px] tracking-[0.18em] text-[#7f93ad] uppercase">{label}</span>
      <span
        className={cn(
          "relative h-[18px] w-[38px] border-2 border-black/60 transition-colors",
          value ? "bg-[#4f8f2c]" : "bg-[#1a2231]"
        )}
      >
        <span
          className={cn(
            "absolute top-[1px] h-[12px] w-[14px] bg-[#dce7f5] transition-all duration-150",
            value ? "left-[19px]" : "left-[1px]"
          )}
        />
      </span>
    </button>
  );
}

export function PauseMenu({
  hud,
  settings,
  onResume,
  onQuit,
  onNewWorld,
  onScreenshot,
  onSettings,
  onTime,
  timeOfDay,
  playTime,
}: {
  hud: Hud;
  settings: Settings;
  onResume: () => void;
  onQuit: () => void;
  onNewWorld: () => void;
  onScreenshot: () => void;
  onSettings: (s: Partial<Settings>) => void;
  onTime: (t: number) => void;
  timeOfDay: number;
  playTime: number;
}) {
  const [tab, setTab] = useState<"menu" | "settings" | "log">("menu");
  const mins = Math.floor(playTime / 60);
  const secs = Math.floor(playTime % 60);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04070c]/72 backdrop-blur-[6px]">
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-25" />
      <div className="anim-rise relative flex w-[min(920px,94vw)] flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="font-body text-[10px] tracking-[0.44em] text-[#7ac74f] uppercase">
              {tab === "menu" ? "world suspended" : tab === "settings" ? "configuration" : "journal"}
            </div>
            <h2
              className="font-display text-[40px] leading-none text-[#eef5e6]"
              style={{ textShadow: "0 3px 0 #3d5a29, 0 6px 14px rgba(0,0,0,0.6)" }}
            >
              {tab === "menu" ? "PAUSED" : tab === "settings" ? "SETTINGS" : "JOURNAL"}
            </h2>
          </div>
          <div className="flex gap-2">
            {(["menu", "settings", "log"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "border-2 border-black/60 px-4 py-2 font-display text-[10px] tracking-[0.16em] uppercase transition-colors",
                  tab === t ? "bg-[#7ac74f] text-[#08130a]" : "bg-[#141d2b] text-[#93a7bd] hover:bg-[#1d2939]"
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_1fr]">
          {tab === "menu" ? (
            <>
              <div className="panel-voxel flex flex-col gap-2.5 bg-[#0b1119]/92 p-4">
                <VoxelButton variant="primary" onClick={onResume} className="w-full">
                  ▶ Resume
                </VoxelButton>
                <VoxelButton variant="ghost" onClick={onScreenshot} className="w-full">
                  ✦ Screenshot
                </VoxelButton>
                <VoxelButton variant="ghost" onClick={onNewWorld} className="w-full">
                  ⟲ New World
                </VoxelButton>
                <VoxelButton variant="danger" onClick={onQuit} className="w-full">
                  ✕ Title Screen
                </VoxelButton>
                <div className="mt-2 flex items-center justify-center gap-2">
                  <KeyCap wide>ESC</KeyCap>
                  <span className="font-body text-[10px] text-[#6f839c]">also resumes</span>
                </div>
                <div className="mt-3 border-t-2 border-black/45 pt-3">
                  <div className="mb-2 font-display text-[9px] tracking-[0.22em] text-[#6f839c]">CONTROLS</div>
                  <div className="flex flex-col gap-[5px]">
                    {[
                      [["W", "A", "S", "D"], "Move"],
                      [["LMB"], "Mine"],
                      [["RMB"], "Place"],
                      [["MMB"], "Pick block"],
                      [["SPACE", "×2"], "Flight"],
                      [["CTRL"], "Sprint"],
                      [["SHIFT"], "Sneak / down"],
                      [["E"], "Library"],
                      [["R"], "Spawn"],
                      [["1", "–", "9"], "Hotbar"],
                    ].map(([keys, label], i) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <div className="flex gap-1">
                          {(keys as string[]).map((k, j) => (
                            <KeyCap key={j} wide={k.length > 2}>
                              {k}
                            </KeyCap>
                          ))}
                        </div>
                        <span className="font-body text-[10px] text-[#8fa4bf]">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <div className="panel-voxel bg-[#0b1119]/92 p-4">
                  <div className="mb-3 font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">SESSION</div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                    <Stat label="Blocks mined" value={hud.mined} accent="#7ac74f" mono />
                    <Stat label="Blocks placed" value={hud.placed} accent="#79c7ff" mono />
                    <Stat label="Travelled" value={`${hud.distance ?? 0}`} mono />
                    <Stat label="Play time" value={`${mins}m ${String(secs).padStart(2, "0")}s`} mono />
                    <Stat label="Position" value={`${hud.x.toFixed(0)} / ${hud.y.toFixed(0)} / ${hud.z.toFixed(0)}`} mono />
                    <Stat label="Biome" value={hud.biome} />
                    <Stat label="Weather" value={weatherLabel(hud.weather)} accent="#79c7ff" />
                    <Stat label="Seed" value={hud.seed} accent="#ffc459" />
                  </div>
                </div>

                <div className="panel-voxel bg-[#0b1119]/92 p-4">
                  <div className="mb-3 font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">
                    TIME OF DAY
                  </div>
                  <Slider
                    label="Clock"
                    value={timeOfDay}
                    min={0}
                    max={0.999}
                    step={0.001}
                    fmt={(v) => {
                      const h = Math.floor(v * 24);
                      const m = Math.floor((v * 24 * 60) % 60);
                      return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                    }}
                    onChange={onTime}
                  />
                  <div className="mt-3 flex gap-2">
                    {[
                      ["Dawn", 0.27],
                      ["Noon", 0.5],
                      ["Dusk", 0.75],
                      ["Night", 0.02],
                    ].map(([l, v]) => (
                      <button
                        key={l as string}
                        type="button"
                        onClick={() => onTime(v as number)}
                        className="flex-1 border-2 border-black/55 bg-[#16202f] py-1.5 font-display text-[9px] tracking-[0.12em] text-[#a9bbd0] uppercase transition-colors hover:bg-[#22303f] hover:text-white"
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : tab === "settings" ? (
            <>
              <div className="panel-voxel flex flex-col gap-4 bg-[#0b1119]/92 p-4">
                <Slider
                  label="Render distance"
                  value={settings.renderDistance}
                  min={3}
                  max={10}
                  step={1}
                  fmt={(v) => `${v} chunks`}
                  onChange={(v) => onSettings({ renderDistance: v })}
                />
                <Slider
                  label="Field of view"
                  value={settings.fov}
                  min={55}
                  max={105}
                  step={1}
                  fmt={(v) => `${v}°`}
                  onChange={(v) => onSettings({ fov: v })}
                />
                <Slider
                  label="Mouse sensitivity"
                  value={settings.sensitivity}
                  min={0.2}
                  max={3}
                  step={0.05}
                  fmt={(v) => `${v.toFixed(2)}×`}
                  onChange={(v) => onSettings({ sensitivity: v })}
                />
                <Slider
                  label="Volume"
                  value={settings.volume}
                  min={0}
                  max={1}
                  step={0.05}
                  fmt={(v) => `${Math.round(v * 100)}%`}
                  onChange={(v) => onSettings({ volume: v })}
                />
                <Slider
                  label="Day length"
                  value={settings.dayLength}
                  min={120}
                  max={1800}
                  step={30}
                  fmt={(v) => `${(v / 60).toFixed(1)} min`}
                  onChange={(v) => onSettings({ dayLength: v })}
                />
                <div className="mt-1 border-t-2 border-black/45 pt-2">
                  <Toggle
                    label="View bobbing"
                    value={settings.bob}
                    onChange={(v) => onSettings({ bob: v })}
                  />
                </div>
              </div>

              <div className="panel-voxel flex flex-col gap-3 bg-[#0b1119]/92 p-4">
                <div className="font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">PERFORMANCE</div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                  <Stat label="FPS" value={Math.round(hud.fps)} accent={hud.fps > 50 ? "#7ac74f" : "#ffc459"} mono />
                  <Stat label="Triangles" value={`${(hud.tris / 1000).toFixed(0)}k`} mono />
                  <Stat label="Chunks" value={hud.chunks} mono />
                  <Stat label="View" value={`${settings.renderDistance * 16} m`} mono />
                </div>
                <div className="mt-2">
                  <div className="mb-1 font-body text-[10px] tracking-[0.18em] text-[#7f93ad] uppercase">
                    Frame budget
                  </div>
                  <Meter value={Math.min(1, hud.fps / 60)} color="linear-gradient(90deg,#8b2f2a,#ffc459,#7ac74f)" height={6} />
                </div>
                <p className="mt-3 font-body text-[11px] leading-relaxed text-[#7f93ad]">
                  Lower the render distance if frames drop below 45. Every chunk is generated, lit and meshed
                  on the CPU, then drawn in a single pass per layer.
                </p>
                <div className="mt-auto flex justify-end">
                  <VoxelButton variant="primary" onClick={onResume}>
                    ▶ Resume
                  </VoxelButton>
                </div>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_300px]">
              <Discoveries unlocked={hud.unlocked} />
              <div className="panel-voxel flex flex-col gap-3 bg-[#0b1119]/92 p-4">
                <div className="font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">EXPEDITION</div>
                <Stat label="Blocks mined" value={hud.mined} accent="#7ac74f" mono />
                <Stat label="Blocks placed" value={hud.placed} accent="#79c7ff" mono />
                <Stat label="Travelled" value={hud.distance} mono />
                <Stat label="Current biome" value={hud.biome} />
                <Stat label="Weather" value={weatherLabel(hud.weather)} accent="#ffc459" />
                <p className="mt-2 font-body text-[11px] leading-relaxed text-[#7f93ad]">
                  Every discovery is earned by playing — dig deep, climb high, swim out, and stay up late.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Inventory({
  hud,
  icons,
  onPick,
  onSelectSlot,
  onClose,
}: {
  hud: Hud;
  icons: (id: number) => string;
  onPick: (id: number) => void;
  onSelectSlot: (i: number) => void;
  onClose: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-[#04070c]/74 backdrop-blur-[5px]">
      <div className="anim-rise panel-voxel w-[min(880px,95vw)] bg-[#0b1119]/94">
        <div className="flex items-center justify-between border-b-2 border-black/55 bg-[#16202f]/90 px-5 py-3">
          <div>
            <div className="font-display text-[14px] tracking-[0.16em] text-[#eaf2ff]">BLOCK LIBRARY</div>
            <div className="font-body text-[11px] text-[#7f93ad]">
              Click a block to load it into the highlighted slot
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="border-2 border-black/60 bg-[#2c3749] px-3 py-2 font-display text-[10px] tracking-[0.14em] text-[#d7e2f0] uppercase transition-colors hover:bg-[#3a4a61]"
          >
            ✕ Close [E]
          </button>
        </div>

        <div className="grid max-h-[52vh] grid-cols-[repeat(auto-fill,minmax(78px,1fr))] gap-2 overflow-y-auto p-5">
          {PLACEABLE.map((id) => (
            <button
              key={id}
              type="button"
              onMouseEnter={() => setHover(id)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPick(id)}
              className={cn(
                "slot-voxel group flex aspect-square flex-col items-center justify-center gap-1 bg-[#1a2432] p-1 transition-all duration-100",
                "hover:-translate-y-[3px] hover:bg-[#2b3a4f] hover:ring-2 hover:ring-[#7ac74f]"
              )}
              title={block(id).name}
            >
              <img src={icons(id)} alt="" className="pixelated h-[46px] w-[46px]" draggable={false} />
              <span className="w-full truncate text-center font-body text-[9px] text-[#93a7bd] group-hover:text-white">
                {block(id).name}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-4 border-t-2 border-black/55 bg-[#101826]/90 px-5 py-3">
          <div className="flex items-center gap-[3px]">
            {hud.hotbar.map((id, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onSelectSlot(i)}
                className={cn(
                  "slot-voxel relative flex h-[46px] w-[46px] items-center justify-center transition-all",
                  i === hud.selected ? "-translate-y-[4px] bg-[#2b3a4f] ring-2 ring-[#ffc459]" : "bg-[#1a2432]"
                )}
              >
                <img src={icons(id)} alt="" className="pixelated h-[36px] w-[36px]" draggable={false} />
                <span className="absolute top-0 left-1 font-display text-[8px] text-white/50">{i + 1}</span>
              </button>
            ))}
          </div>
          <div className="text-right">
            <div className="font-display text-[12px] tracking-[0.1em] text-[#ffc459]">
              {hover !== null ? block(hover).name.toUpperCase() : block(hud.hotbar[hud.selected]).name.toUpperCase()}
            </div>
            <div className="font-body text-[10px] text-[#7f93ad]">
              {hover !== null
                ? `hardness ${block(hover).hardness.toFixed(2)} · ${block(hover).sound}`
                : `slot ${hud.selected + 1} of 9`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
