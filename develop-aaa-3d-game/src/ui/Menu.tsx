import { useMemo, useState } from "react";
import type { Settings } from "../game/engine";
import { PLACEABLE, block } from "../game/blocks";
import { cn } from "../utils/cn";
import { KeyCap, VoxelButton } from "./bits";

const TITLE_SHADOW =
  "0 1px 0 #6f9a4a, 0 2px 0 #6f9a4a, 0 3px 0 #55793a, 0 4px 0 #55793a, 0 5px 0 #3d5a29, 0 6px 0 #3d5a29, 0 10px 18px rgba(0,0,0,0.65)";

export function Boot({ progress, label }: { progress: number; label: string }) {
  const p = Math.round(progress * 100);
  return (
    <div className="menu-bg absolute inset-0 z-50 flex flex-col items-center justify-center overflow-hidden">
      <div className="grid-floor pointer-events-none absolute inset-x-0 bottom-0 h-2/3 opacity-70" />
      <div className="noise-overlay pointer-events-none absolute inset-0 opacity-[0.35]" />
      <div className="relative flex flex-col items-center">
        <div className="anim-float mb-8 flex gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <span
              key={i}
              className="h-5 w-5 border-2 border-black/50"
              style={{
                background: ["#7ac74f", "#8b5a2b", "#9aa3ad", "#ffc459", "#79c7ff"][i],
                animation: `float-y ${1.6 + i * 0.18}s ease-in-out ${i * 0.12}s infinite`,
                boxShadow: "inset 2px 2px 0 rgba(255,255,255,0.3), inset -2px -2px 0 rgba(0,0,0,0.35)",
              }}
            />
          ))}
        </div>
        <h1 className="font-display text-[42px] text-[#e9f3dd]" style={{ textShadow: TITLE_SHADOW }}>
          CUBEFALL
        </h1>
        <p className="mt-3 font-body text-[12px] tracking-[0.42em] text-[#7f93ad] uppercase">
          generating world
        </p>
        <div className="mt-7 h-[14px] w-[340px] border-2 border-black/60 bg-[#0b1119] p-[2px]">
          <div
            className="relative h-full bg-gradient-to-r from-[#4f8f2c] to-[#9ce06a] transition-[width] duration-200"
            style={{ width: `${p}%` }}
          >
            <span className="absolute inset-0 shimmer" />
          </div>
        </div>
        <div className="mt-3 flex w-[340px] items-center justify-between font-display text-[10px] tracking-[0.14em] text-[#9fb2c8]">
          <span className="uppercase">{label}</span>
          <span className="text-[#7ac74f]">{p}%</span>
        </div>
      </div>
    </div>
  );
}

export function Menu({
  seed,
  setSeed,
  onSeedCommit,
  onPlay,
  onNewWorld,
  settings,
  icons,
}: {
  seed: string;
  setSeed: (s: string) => void;
  onSeedCommit: () => void;
  onPlay: () => void;
  onNewWorld: () => void;
  settings: Settings;
  icons: (id: number) => string;
}) {
  const [busy, setBusy] = useState(false);
  const marquee = useMemo(() => PLACEABLE.slice(0, 18), []);

  return (
    <div
      className="absolute inset-0 z-30 overflow-hidden"
      onClick={(e) => {
        const t = e.target as HTMLElement;
        if (t.closest("button, input, a, label")) return;
        onPlay();
      }}
    >
      {/* legibility scrims over the live world */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#05070d]/94 via-[#05070d]/55 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05070d]/92 via-transparent to-[#05070d]/70" />
      <div className="pointer-events-none absolute inset-0 noise-overlay opacity-25" />

      {/* top bar */}
      <div className="absolute inset-x-0 top-0 flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="grid h-8 w-8 place-items-center border-2 border-black/60 bg-gradient-to-br from-[#7ac74f] to-[#2f6a1c] shadow-[inset_2px_2px_0_rgba(255,255,255,0.25)]">
            <span className="font-display text-[13px] text-[#08130a]">C</span>
          </div>
          <span className="font-display text-[11px] tracking-[0.32em] text-[#a9bbd0]">CUBEFALL</span>
        </div>
        <div className="flex items-center gap-4 font-display text-[9px] tracking-[0.2em] text-[#6f839c]">
          <span>BUILD 1.0.0</span>
          <span className="h-3 w-px bg-[#2c3a4d]" />
          <span>WEBGL VOXEL ENGINE</span>
          <span className="h-3 w-px bg-[#2c3a4d]" />
          <span className="text-[#7ac74f]">{settings.renderDistance * 16} M VIEW</span>
        </div>
      </div>

      {/* left : title block */}
      <div className="absolute bottom-[104px] left-6 max-w-[560px]">
        <div className="anim-rise">
          <p className="mb-3 flex items-center gap-2 font-body text-[11px] tracking-[0.4em] text-[#7ac74f] uppercase">
            <span className="inline-block h-[2px] w-8 bg-[#7ac74f]" />
            infinite procedural sandbox
          </p>
          <h1
            className="font-display text-[74px] leading-[0.86] text-[#f0f7e8]"
            style={{ textShadow: TITLE_SHADOW }}
          >
            CUBE
            <br />
            FALL
          </h1>
          <p className="mt-5 max-w-[430px] font-body text-[14px] leading-relaxed text-[#a8bbd1]">
            A world that never ends: eight biomes, cavern systems, ore veins, forests and oceans — carved
            block by block from a single seed. Mine it. Flatten it. Build something impossible.
          </p>
          <p className="mt-3 font-body text-[11px] tracking-[0.2em] text-[#5d7089] uppercase">
            click anywhere to drop in
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <VoxelButton variant="primary" onClick={onPlay} className="px-9 py-4 text-[14px] anim-ring">
              ▶ Play World
            </VoxelButton>
            <VoxelButton
              variant="ghost"
              onClick={() => {
                setBusy(true);
                onNewWorld();
                setTimeout(() => setBusy(false), 400);
              }}
              disabled={busy}
            >
              ⟲ Random Seed
            </VoxelButton>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <span className="font-display text-[9px] tracking-[0.2em] text-[#6f839c]">SEED</span>
            <input
              value={seed}
              onChange={(e) => setSeed(e.target.value.slice(0, 24))}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSeedCommit();
              }}
              spellCheck={false}
              className="w-[220px] border-2 border-black/60 bg-[#0b1119]/90 px-3 py-2 font-display text-[11px] tracking-[0.08em] text-[#cfe0f5] outline-none focus:border-[#7ac74f]/70"
            />
            <button
              type="button"
              onClick={onSeedCommit}
              className="border-2 border-black/60 bg-[#2c3749] px-3 py-2 font-display text-[10px] tracking-[0.14em] text-[#d7e2f0] uppercase transition-colors hover:bg-[#3a4a61]"
            >
              Generate
            </button>
          </div>
        </div>
      </div>

      {/* right : controls */}
      <div className="anim-rise absolute top-[86px] right-6 w-[268px]" style={{ animationDelay: "120ms" }}>
        <div className="panel-voxel bg-[#0b1119]/88 p-4">
          <div className="mb-3 font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">CONTROLS</div>
          <div className="flex flex-col gap-[7px]">
            {[
              [["W", "A", "S", "D"], "Move"],
              [["MOUSE"], "Look around"],
              [["L-CLICK"], "Mine block"],
              [["R-CLICK"], "Place block"],
              [["M-CLICK"], "Pick block"],
              [["SPACE"], "Jump / fly up"],
              [["SPACE", "×2"], "Toggle flight"],
              [["CTRL"], "Sprint"],
              [["SHIFT"], "Sneak / descend"],
              [["1", "–", "9"], "Select slot"],
              [["E"], "Block library"],
              [["R"], "Return to spawn"],
              [["ESC"], "Pause"],
            ].map(([keys, label], i) => (
              <div key={i} className="flex items-center justify-between gap-2">
                <div className="flex gap-1">
                  {(keys as string[]).map((k, j) => (
                    <KeyCap key={j} wide={k.length > 2}>
                      {k}
                    </KeyCap>
                  ))}
                </div>
                <span className="font-body text-[11px] text-[#93a7bd]">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-voxel mt-3 bg-[#0b1119]/88 px-4 py-3">
          <div className="mb-2 font-display text-[10px] tracking-[0.24em] text-[#8fa4bf]">WORLD SPECS</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-body text-[11px] text-[#93a7bd]">
            <span className="text-[#6f839c]">Biomes</span>
            <span className="text-right text-[#e6eefb]">8</span>
            <span className="text-[#6f839c]">Block types</span>
            <span className="text-right text-[#e6eefb]">{PLACEABLE.length}</span>
            <span className="text-[#6f839c]">World height</span>
            <span className="text-right text-[#e6eefb]">84 m</span>
            <span className="text-[#6f839c]">Lighting</span>
            <span className="text-right text-[#e6eefb]">Sky + Torch</span>
          </div>
        </div>
      </div>

      {/* bottom marquee of blocks */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[74px] overflow-hidden border-t-2 border-black/50 bg-[#070b12]/85">
        <div className="flex h-full items-center gap-3 px-4">
          <span className="mr-2 shrink-0 font-display text-[9px] tracking-[0.22em] text-[#6f839c]">LIBRARY</span>
          <div className="flex gap-2 overflow-hidden">
            {marquee.map((id, i) => (
              <div
                key={id}
                className={cn("slot-voxel flex h-[46px] w-[46px] shrink-0 items-center justify-center bg-[#16202f]")}
                style={{ animation: `float-y ${2.6 + (i % 5) * 0.3}s ease-in-out ${i * 0.08}s infinite` }}
                title={block(id).name}
              >
                <img src={icons(id)} alt={block(id).name} className="pixelated h-[38px] w-[38px]" draggable={false} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
