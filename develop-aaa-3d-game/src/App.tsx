import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SETTINGS, Game, type Callbacks, type Hud as HudState, type Settings } from "./game/engine";
import { hashString } from "./game/rng";
import { blockIcon, clearIconCache } from "./game/icons";
import { sfx } from "./game/audio";
import { Boot, Menu } from "./ui/Menu";
import { Hud as HudView } from "./ui/Hud";
import { Inventory, PauseMenu, Toasts, type Toast } from "./ui/Panels";

type Phase = "boot" | "menu" | "playing" | "paused" | "inventory";

const ADJ = ["EMBER", "AZURE", "HOLLOW", "SOLACE", "IRON", "VERDANT", "ONYX", "DRIFT", "AURORA", "BASALT"];

function randomSeed() {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)];
  return `${a}-${Math.floor(1000 + Math.random() * 8999)}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [phase, setPhase] = useState<Phase>("boot");
  const phaseRef = useRef<Phase>("boot");
  phaseRef.current = phase;

  const inventoryRef = useRef(false);
  const [progress, setProgress] = useState({ p: 0, label: "warming up" });
  const [hud, setHud] = useState<HudState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [seed, setSeed] = useState(randomSeed);
  const seedRef = useRef(seed);
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS });
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const [iconTick, setIconTick] = useState(0);
  const [impact, setImpact] = useState(0);
  const [hints, setHints] = useState(true);
  const [playTime, setPlayTime] = useState(0);
  const toastId = useRef(1);

  const pushToast = useCallback((title: string, sub?: string) => {
    const id = toastId.current++;
    setToasts((t) => [...t.slice(-2), { id, title, sub }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2300);
  }, []);

  const icons = useMemo(() => {
    void iconTick;
    return (id: number) => {
      const g = gameRef.current;
      if (!g || !g.atlas) return "";
      return blockIcon(g.atlas, id, 64);
    };
  }, [iconTick]);

  /* ---------------- callbacks (stable, ref based) ---------------- */
  const callbacksRef = useRef<Callbacks | null>(null);
  if (!callbacksRef.current) {
    callbacksRef.current = {
      onHud: (h) => setHud(h),
      onHotbar: (items, sel) => setHud((h) => (h ? { ...h, hotbar: items, selected: sel } : h)),
      onLock: (locked) => {
        const g = gameRef.current;
        if (locked) {
          if (inventoryRef.current) return;
          setPhase("playing");
          g?.setPaused(false);
        } else {
          if (inventoryRef.current) {
            g?.setPaused(true);
            return;
          }
          if (phaseRef.current === "playing") {
            setPhase("paused");
            g?.setPaused(true);
          } else {
            g?.setPaused(true);
          }
        }
      },
      onToast: (title, sub) => pushToast(title, sub),
      onProgress: (p, label) => setProgress({ p, label }),
      onInventory: (open) => {
        const g = gameRef.current;
        if (open) {
          inventoryRef.current = true;
          g?.setPaused(true);
          setPhase("inventory");
          sfx.openInventory();
        } else if (phaseRef.current === "inventory") {
          inventoryRef.current = false;
          g?.setPaused(true);
          setPhase("paused");
          sfx.ui(false);
        }
      },
      onImpact: (s) => {
        setImpact(Math.min(1, s));
        window.setTimeout(() => setImpact(0), 110);
      },
      onDiscovery: (title, sub, got, total) => {
        const id = toastId.current++;
        setToasts((t) => [...t.slice(-2), { id, title: `Discovery — ${title}`, sub: `${sub} · ${got}/${total}`, kind: "discovery" }]);
        window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
      },
    };
  }

  /* ---------------- world construction ---------------- */
  const buildGame = useCallback(
    (seedStr: string) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const label = seedStr || randomSeed();
      seedRef.current = label;
      setSeed(label);
      setPhase("boot");
      setProgress({ p: 0, label: "warming up" });
      setHud(null);
      setPlayTime(0);
      inventoryRef.current = false;
      clearIconCache();
      sfx.setVolume(settingsRef.current.volume);

      const numeric = hashString(label) || 1337;
      const done = (g: Game) => {
        if (gameRef.current !== g) return;
        setIconTick((n) => n + 1);
        setPhase("menu");
        pushToast("World ready", `seed · ${label}`);
      };

      const existing = gameRef.current;
      if (existing) {
        existing.seedLabel = label;
        void existing.resetWorld(numeric, settingsRef.current).then(() => done(existing));
        return;
      }

      const g = new Game(canvas, callbacksRef.current!);
      gameRef.current = g;
      g.seedLabel = label;
      void g.prepare(numeric, settingsRef.current).then(() => done(g));
    },
    [pushToast]
  );

  useEffect(() => {
    buildGame(seedRef.current);
    return () => {
      gameRef.current?.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- play time ---------------- */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => setPlayTime((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const closeInventory = useCallback(() => {
    inventoryRef.current = false;
    gameRef.current?.setPaused(true);
    setPhase("paused");
    sfx.ui(false);
  }, []);

  /* ---------------- inventory keys ---------------- */
  useEffect(() => {
    if (phase !== "inventory") return;
    const h = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyE") {
        e.preventDefault();
        closeInventory();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [phase, closeInventory]);

  /* ---------------- actions ---------------- */
  const startPlay = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    sfx.init();
    sfx.levelUp();
    g.setAttract(false);
    g.beginPlay();
    setPlayTime(0);
    setHints(true);
  }, []);

  const resume = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    sfx.init();
    g.setAttract(false);
    g.setPaused(false);
    g.requestLock();
  }, []);

  const quitToTitle = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    inventoryRef.current = false;
    g.setPaused(true);
    g.setAttract(true);
    setPhase("menu");
  }, []);

  const applySettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      const g = gameRef.current;
      if (g) {
        if (patch.renderDistance !== undefined) g.setRenderDistance(patch.renderDistance);
        if (patch.fov !== undefined) g.setFov(patch.fov);
        if (patch.sensitivity !== undefined) g.setSensitivity(patch.sensitivity);
        if (patch.bob !== undefined) g.setBob(patch.bob);
        if (patch.dayLength !== undefined) g.settings.dayLength = patch.dayLength;
        if (patch.volume !== undefined) sfx.setVolume(patch.volume);
      }
      return next;
    });
  }, []);

  const newWorld = useCallback(() => buildGame(randomSeed()), [buildGame]);
  const commitSeed = useCallback(() => buildGame(seedRef.current), [buildGame]);

  const pickBlock = useCallback((id: number) => {
    gameRef.current?.setHotbarSlot(gameRef.current.selected, id);
  }, []);

  /* ---------------- render ---------------- */
  const playing = phase === "playing";
  const showHud = !!hud && (playing || phase === "paused" || phase === "inventory");

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#05070d]">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ cursor: playing ? "none" : "default" }}
      />

      {showHud && (
        <HudView
          hud={hud!}
          game={gameRef.current!}
          icons={icons}
          playing={playing}
          impact={impact}
          hints={hints && playTime < 20 && hud!.mined + hud!.placed < 3}
        />
      )}

      {phase === "playing" && hud && hud.intro > 0 && (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center transition-opacity duration-700"
          style={{ opacity: Math.min(1, hud.intro * 2.4) }}
        >
          <div
            className="font-display text-[13vw] leading-none text-white/90 sm:text-[86px]"
            style={{ textShadow: "0 4px 0 rgba(0,0,0,0.45), 0 18px 44px rgba(0,0,0,0.6)" }}
          >
            CUBEFALL
          </div>
          <div className="mt-3 font-body text-[11px] tracking-[0.55em] text-white/70 uppercase">
            seed · {hud.seed}
          </div>
          <div className="absolute bottom-24 font-display text-[10px] tracking-[0.28em] text-white/55 uppercase animate-pulse">
            click to skip
          </div>
        </div>
      )}

      {phase === "boot" && <Boot progress={progress.p} label={progress.label} />}

      {phase === "menu" && (
        <Menu
          seed={seed}
          setSeed={(s) => {
            setSeed(s);
            seedRef.current = s;
          }}
          onSeedCommit={commitSeed}
          onPlay={startPlay}
          onNewWorld={newWorld}
          settings={settings}
          icons={icons}
        />
      )}

      <Toasts items={toasts} />

      {phase === "paused" && hud && (
        <PauseMenu
          hud={hud}
          settings={settings}
          timeOfDay={gameRef.current?.timeOfDay ?? 0.3}
          playTime={playTime}
          onResume={resume}
          onQuit={quitToTitle}
          onNewWorld={newWorld}
          onScreenshot={() => gameRef.current?.screenshot()}
          onSettings={applySettings}
          onTime={(t) => {
            gameRef.current?.setTimeOfDay(t);
            setHud((h) => (h ? { ...h, timeOfDay: t } : h));
          }}
        />
      )}

      {phase === "inventory" && hud && (
        <Inventory
          hud={hud}
          icons={icons}
          onPick={pickBlock}
          onSelectSlot={(i) => gameRef.current?.selectSlot(i)}
          onClose={closeInventory}
        />
      )}
    </div>
  );
}
