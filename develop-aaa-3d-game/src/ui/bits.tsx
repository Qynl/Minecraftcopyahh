import type { ReactNode } from "react";
import { cn } from "../utils/cn";

export function KeyCap({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <kbd
      className={cn(
        "inline-flex items-center justify-center rounded-[3px] border-b-[3px] border-black/70 bg-gradient-to-b from-[#3a4557] to-[#232c3b]",
        "px-1.5 py-[3px] font-display text-[9px] leading-none text-[#dbe6f5] shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]",
        wide ? "min-w-[46px]" : "min-w-[22px]"
      )}
    >
      {children}
    </kbd>
  );
}

type Variant = "primary" | "ghost" | "danger" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-gradient-to-b from-[#7ac74f] to-[#417f24] text-[#08130a]",
  gold: "bg-gradient-to-b from-[#ffd27a] to-[#d08c22] text-[#1a1004]",
  ghost: "bg-gradient-to-b from-[#2c3749] to-[#1a2231] text-[#d7e2f0]",
  danger: "bg-gradient-to-b from-[#d0574f] to-[#8b2f2a] text-[#1a0705]",
};

export function VoxelButton({
  children,
  onClick,
  variant = "ghost",
  className,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "btn-voxel group relative select-none px-5 py-3 font-display text-[12px] tracking-[0.14em] uppercase",
        VARIANTS[variant],
        disabled && "cursor-not-allowed opacity-45 saturate-0",
        className
      )}
    >
      <span className="relative z-10 drop-shadow-[0_1px_0_rgba(0,0,0,0.35)]">{children}</span>
      <span className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 shimmer" />
    </button>
  );
}

export function Panel({
  children,
  className,
  title,
  right,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
  right?: ReactNode;
}) {
  return (
    <div className={cn("panel-voxel bg-[#0d1420]/88 backdrop-blur-[3px]", className)}>
      {title && (
        <div className="flex items-center justify-between border-b-2 border-black/50 bg-[#16202f]/90 px-3 py-2">
          <span className="font-display text-[10px] tracking-[0.2em] text-[#8fa4bf] uppercase">{title}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: ReactNode;
  accent?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="font-body text-[10px] tracking-[0.16em] text-[#6f839c] uppercase">{label}</span>
      <span
        className={cn("text-[12px] font-bold text-[#e6eefb]", mono && "font-display text-[11px]")}
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

export function Meter({ value, color, height = 4 }: { value: number; color: string; height?: number }) {
  return (
    <div className="w-full overflow-hidden bg-black/55" style={{ height }}>
      <div
        className="h-full transition-[width] duration-200 ease-out"
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }}
      />
    </div>
  );
}
