/**
 * Fully procedural pixel-art texture atlas.
 * Every texture is painted at runtime into a 512x512 canvas (16x16 cells of 32px,
 * 30px of art + 1px edge-extended padding so mipmap levels never bleed neighbours).
 */

export type RGBA = [number, number, number, number];
export const CELL = 32;
export const ART = 30;
export const PAD = 1;
export const COLS = 16;
export const ROWS = 16;
export const ATLAS_W = COLS * CELL;
export const ATLAS_H = ROWS * CELL;

const c = (r: number, g: number, b: number, a = 255): RGBA => [r, g, b, a];
const shade = (col: RGBA, f: number): RGBA => [
  Math.max(0, Math.min(255, col[0] * f)),
  Math.max(0, Math.min(255, col[1] * f)),
  Math.max(0, Math.min(255, col[2] * f)),
  col[3],
];
const mixc = (a: RGBA, b: RGBA, t: number): RGBA => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
  a[3] + (b[3] - a[3]) * t,
];

export class TileBuf {
  readonly d: Uint8ClampedArray;
  readonly s = ART;
  constructor() {
    this.d = new Uint8ClampedArray(ART * ART * 4);
  }
  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < ART && y < ART;
  }
  set(x: number, y: number, col: RGBA) {
    if (!this.inside(x, y)) return;
    const i = (y * ART + x) * 4;
    const a = col[3] / 255;
    // alpha composite over existing
    const dr = this.d[i];
    const dg = this.d[i + 1];
    const db = this.d[i + 2];
    const da = this.d[i + 3] / 255;
    const oa = a + da * (1 - a);
    this.d[i] = oa === 0 ? 0 : (col[0] * a + dr * da * (1 - a)) / oa;
    this.d[i + 1] = oa === 0 ? 0 : (col[1] * a + dg * da * (1 - a)) / oa;
    this.d[i + 2] = oa === 0 ? 0 : (col[2] * a + db * da * (1 - a)) / oa;
    this.d[i + 3] = oa * 255;
  }
  put(x: number, y: number, col: RGBA) {
    if (!this.inside(x, y)) return;
    const i = (y * ART + x) * 4;
    this.d[i] = col[0];
    this.d[i + 1] = col[1];
    this.d[i + 2] = col[2];
    this.d[i + 3] = col[3];
  }
  get(x: number, y: number): RGBA {
    if (!this.inside(x, y)) return [0, 0, 0, 0];
    const i = (y * ART + x) * 4;
    return [this.d[i], this.d[i + 1], this.d[i + 2], this.d[i + 3]];
  }
  fill(col: RGBA) {
    for (let y = 0; y < ART; y++) for (let x = 0; x < ART; x++) this.put(x, y, col);
  }
  rect(x: number, y: number, w: number, h: number, col: RGBA) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.put(x + i, y + j, col);
  }
  /** speckle noise over existing pixels */
  speckle(rnd: () => number, amount: number, density = 1) {
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        if (density < 1 && rnd() > density) continue;
        const p = this.get(x, y);
        if (p[3] === 0) continue;
        const f = 1 + (rnd() * 2 - 1) * amount;
        this.put(x, y, shade(p, f));
      }
    }
  }
  /** scatter small blobs of colour */
  blobs(rnd: () => number, count: number, col: RGBA, r = 1.6, alpha = 1) {
    for (let n = 0; n < count; n++) {
      const bx = rnd() * ART;
      const by = rnd() * ART;
      for (let y = Math.floor(by - r); y <= by + r; y++) {
        for (let x = Math.floor(bx - r); x <= bx + r; x++) {
          const dx = x - bx;
          const dy = y - by;
          if (dx * dx + dy * dy <= r * r * (0.6 + rnd() * 0.5)) {
            this.set(x, y, alpha >= 1 ? col : [col[0], col[1], col[2], col[3] * alpha]);
          }
        }
      }
    }
  }
}

type Painter = (t: TileBuf, rnd: () => number) => void;

/* ------------------------------------------------------------------ */
/* palette                                                             */
/* ------------------------------------------------------------------ */
const GRASS_A = c(104, 168, 60);
const GRASS_B = c(78, 138, 44);
const GRASS_C = c(132, 190, 78);
const DIRT_A = c(134, 96, 60);
const DIRT_B = c(104, 72, 44);
const STONE_A = c(136, 138, 144);
const STONE_B = c(108, 110, 118);
const SAND_A = c(226, 208, 154);
const BARK_A = c(104, 78, 48);

/* ------------------------------------------------------------------ */
/* painters                                                            */
/* ------------------------------------------------------------------ */

function noisyBase(rnd: () => number, a: RGBA, b: RGBA, contrast = 1): Painter {
  return (t) => {
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        const n = rnd();
        const tt = 0.5 + (n - 0.5) * contrast;
        t.put(x, y, mixc(b, a, Math.max(0, Math.min(1, tt))));
      }
    }
  };
}

const painters: Record<string, Painter> = {
  grass_top: (t, rnd) => {
    noisyBase(rnd, GRASS_C, GRASS_B, 1.25)(t, rnd);
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(rnd() * ART);
      const y = Math.floor(rnd() * ART);
      t.put(x, y, shade(GRASS_A, 0.72 + rnd() * 0.5));
      if (rnd() > 0.6) t.put(x, y - 1, shade(GRASS_C, 1.05));
    }
  },
  grass_side: (t, rnd) => {
    noisyBase(rnd, DIRT_A, DIRT_B, 1.1)(t, rnd);
    t.blobs(rnd, 10, c(88, 62, 38), 1.4);
    for (let x = 0; x < ART; x++) {
      const depth = 4 + Math.floor(rnd() * 4);
      for (let y = 0; y < depth; y++) {
        const g = mixc(GRASS_B, GRASS_C, rnd());
        t.put(x, y, shade(g, 0.94 + (1 - y / depth) * 0.16));
      }
    }
  },
  snow_grass_side: (t, rnd) => {
    noisyBase(rnd, DIRT_A, DIRT_B, 1.1)(t, rnd);
    for (let x = 0; x < ART; x++) {
      const depth = 5 + Math.floor(rnd() * 4);
      for (let y = 0; y < depth; y++) t.put(x, y, mixc(c(228, 236, 246), c(255, 255, 255), rnd()));
    }
  },
  dirt: (t, rnd) => {
    noisyBase(rnd, DIRT_A, DIRT_B, 1.15)(t, rnd);
    t.blobs(rnd, 14, c(92, 66, 40), 1.5);
    t.blobs(rnd, 6, c(158, 120, 78), 1.1);
  },
  stone: (t, rnd) => {
    noisyBase(rnd, STONE_A, STONE_B, 0.9)(t, rnd);
    for (let i = 0; i < 5; i++) {
      let x = Math.floor(rnd() * ART);
      let y = Math.floor(rnd() * ART);
      const len = 4 + Math.floor(rnd() * 8);
      for (let s = 0; s < len; s++) {
        t.set(x, y, c(88, 90, 98, 190));
        x += rnd() > 0.5 ? 1 : -1;
        y += rnd() > 0.62 ? 1 : 0;
      }
    }
  },
  cobble: (t, rnd) => {
    t.fill(c(58, 60, 66));
    const cells = [
      [0, 0, 9, 8],
      [10, 0, 10, 6],
      [21, 0, 9, 9],
      [0, 9, 7, 9],
      [8, 7, 11, 10],
      [20, 10, 10, 8],
      [0, 19, 10, 11],
      [11, 18, 9, 12],
      [21, 19, 9, 11],
    ];
    for (const [x, y, w, h] of cells) {
      const base = mixc(c(150, 152, 158), c(112, 114, 122), rnd());
      for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
          const edge = i === 0 || j === 0 || i === w - 1 || j === h - 1;
          const col = edge ? shade(base, 0.68) : shade(base, 0.9 + rnd() * 0.28);
          t.put(x + i, y + j, col);
        }
      }
    }
    t.speckle(rnd, 0.07);
  },
  sand: (t, rnd) => {
    noisyBase(rnd, shade(SAND_A, 1.06), shade(SAND_A, 0.86), 1)(t, rnd);
    t.blobs(rnd, 16, c(206, 186, 132), 1.1, 0.7);
  },
  sandstone: (t, rnd) => {
    noisyBase(rnd, c(222, 202, 150), c(200, 178, 128), 0.6)(t, rnd);
    for (let y = 0; y < ART; y += 6) {
      for (let x = 0; x < ART; x++) t.put(x, y, c(176, 156, 112));
    }
  },
  log_side: (t, rnd) => {
    noisyBase(rnd, shade(BARK_A, 1.12), shade(BARK_A, 0.72), 0.8)(t, rnd);
    for (let x = 0; x < ART; x++) {
      if (rnd() > 0.62) continue;
      const dark = rnd() > 0.5;
      for (let y = 0; y < ART; y++) {
        if (rnd() > 0.9) continue;
        t.put(x, y, shade(t.get(x, y), dark ? 0.74 : 1.2));
      }
    }
    for (let i = 0; i < 3; i++) {
      const kx = 3 + Math.floor(rnd() * 24);
      const ky = 3 + Math.floor(rnd() * 24);
      t.rect(kx, ky, 3, 2, c(66, 48, 30));
    }
  },
  log_top: (t, rnd) => {
    noisyBase(rnd, c(178, 142, 92), c(148, 114, 70), 0.7)(t, rnd);
    const cx0 = ART / 2;
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        const d = Math.sqrt((x - cx0) ** 2 + (y - cx0) ** 2);
        if (d > 14) t.put(x, y, shade(BARK_A, 0.8 + rnd() * 0.2));
        else if (Math.floor(d) % 3 === 0) t.set(x, y, c(120, 88, 52, 150));
      }
    }
  },
  leaves: (t, rnd) => {
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        const n = rnd();
        if (n < 0.14) {
          t.put(x, y, c(0, 0, 0, 0));
          continue;
        }
        const base = mixc(c(38, 96, 34), c(112, 178, 74), n);
        t.put(x, y, shade(base, 0.85 + rnd() * 0.35));
      }
    }
    t.blobs(rnd, 5, c(150, 200, 96, 210), 1.2);
  },
  leaves_birch: (t, rnd) => {
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        const n = rnd();
        if (n < 0.16) {
          t.put(x, y, c(0, 0, 0, 0));
          continue;
        }
        t.put(x, y, shade(mixc(c(96, 140, 52), c(186, 214, 120), n), 0.9 + rnd() * 0.3));
      }
    }
  },
  planks: (t, rnd) => {
    noisyBase(rnd, c(178, 138, 88), c(150, 112, 68), 0.55)(t, rnd);
    for (let row = 0; row < 4; row++) {
      const y0 = row * 7 + 6;
      for (let x = 0; x < ART; x++) t.put(x, y0, c(96, 68, 40));
      const off = row % 2 === 0 ? 9 : 20;
      for (let y = row * 7; y < row * 7 + 7 && y < ART; y++) t.put(off, y, c(112, 80, 48));
    }
    for (let i = 0; i < 22; i++) {
      const x = Math.floor(rnd() * ART);
      const y = Math.floor(rnd() * ART);
      t.set(x, y, c(120, 88, 52, 90));
    }
  },
  glass: (t, rnd) => {
    t.fill(c(210, 240, 255, 16));
    for (let i = 0; i < ART; i++) {
      t.put(i, 0, c(226, 246, 255, 200));
      t.put(i, ART - 1, c(190, 220, 240, 200));
      t.put(0, i, c(226, 246, 255, 200));
      t.put(ART - 1, i, c(190, 220, 240, 200));
    }
    for (let i = 0; i < 16; i++) {
      t.put(3 + i, 20 - i, c(255, 255, 255, 150));
      t.put(4 + i, 21 - i, c(255, 255, 255, 90));
    }
    for (let i = 0; i < 7; i++) t.put(18 + i, 25 - i, c(255, 255, 255, 120));
    void rnd;
  },
  brick: (t, rnd) => {
    t.fill(c(196, 188, 178));
    const bw = 9;
    const bh = 6;
    for (let row = 0; row < 5; row++) {
      const off = row % 2 === 0 ? 0 : -5;
      for (let col = -1; col < 4; col++) {
        const x = off + col * (bw + 1);
        const y = row * (bh + 1);
        const base = mixc(c(168, 74, 56), c(196, 96, 68), rnd());
        for (let j = 0; j < bh; j++)
          for (let i = 0; i < bw; i++) t.put(x + i, y + j, shade(base, 0.92 + rnd() * 0.16));
      }
    }
  },
  water: (t, rnd) => {
    for (let y = 0; y < ART; y++) {
      for (let x = 0; x < ART; x++) {
        const w = Math.sin((x + y * 0.5) * 0.42) * 0.5 + Math.sin(y * 0.31) * 0.5;
        const base = mixc(c(38, 96, 178), c(86, 162, 226), 0.5 + w * 0.34 + rnd() * 0.12);
        t.put(x, y, [base[0], base[1], base[2], 176]);
      }
    }
  },
  snow: (t, rnd) => {
    noisyBase(rnd, c(255, 255, 255), c(224, 234, 246), 0.7)(t, rnd);
    t.blobs(rnd, 8, c(206, 222, 240, 170), 1.2);
  },
  ice: (t, rnd) => {
    noisyBase(rnd, c(158, 206, 240, 200), c(112, 172, 224, 200), 0.8)(t, rnd);
    for (let i = 0; i < 4; i++) {
      let x = Math.floor(rnd() * ART);
      let y = 0;
      while (y < ART) {
        t.put(x, y, c(232, 248, 255, 210));
        x += rnd() > 0.5 ? 1 : -1;
        y++;
      }
    }
  },
  cactus: (t, rnd) => {
    noisyBase(rnd, c(74, 138, 62), c(48, 104, 44), 0.7)(t, rnd);
    for (let y = 0; y < ART; y++) {
      t.put(2, y, c(38, 84, 36));
      t.put(ART - 3, y, c(38, 84, 36));
    }
    for (let i = 0; i < 14; i++) {
      const x = 4 + Math.floor(rnd() * (ART - 8));
      const y = Math.floor(rnd() * ART);
      t.put(x, y, c(226, 232, 190));
    }
  },
  gravel: (t, rnd) => {
    t.fill(c(120, 118, 116));
    t.blobs(rnd, 40, c(150, 148, 144), 2.0);
    t.blobs(rnd, 26, c(94, 90, 88), 1.8);
    t.blobs(rnd, 10, c(168, 140, 116), 1.5);
    t.speckle(rnd, 0.09);
  },
  bedrock: (t, rnd) => {
    noisyBase(rnd, c(74, 74, 80), c(30, 30, 36), 1.4)(t, rnd);
    t.blobs(rnd, 18, c(96, 96, 104), 2.2);
    t.blobs(rnd, 14, c(18, 18, 22), 2.4);
  },
  ore_base: (t, rnd) => painters.stone(t, rnd),
  coal_ore: (t, rnd) => {
    painters.stone(t, rnd);
    t.blobs(rnd, 5, c(28, 28, 32), 2.3);
    t.blobs(rnd, 3, c(58, 58, 64), 1.4);
  },
  iron_ore: (t, rnd) => {
    painters.stone(t, rnd);
    t.blobs(rnd, 5, c(206, 160, 120), 2.2);
    t.blobs(rnd, 3, c(240, 206, 172), 1.3);
  },
  gold_ore: (t, rnd) => {
    painters.stone(t, rnd);
    t.blobs(rnd, 5, c(246, 208, 74), 2.2);
    t.blobs(rnd, 3, c(255, 240, 168), 1.3);
  },
  crystal_ore: (t, rnd) => {
    painters.stone(t, rnd);
    t.blobs(rnd, 5, c(96, 232, 224), 2.2);
    t.blobs(rnd, 3, c(214, 255, 252), 1.4);
  },
  lamp: (t, rnd) => {
    noisyBase(rnd, c(255, 214, 120), c(214, 158, 62), 0.8)(t, rnd);
    for (let y = 0; y < ART; y += 5)
      for (let x = 0; x < ART; x++) t.set(x, y, c(178, 122, 44, 160));
    for (let x = 0; x < ART; x += 5)
      for (let y = 0; y < ART; y++) t.set(x, y, c(178, 122, 44, 160));
    t.blobs(rnd, 8, c(255, 248, 210), 1.9);
  },
  obsidian: (t, rnd) => {
    noisyBase(rnd, c(36, 28, 54), c(16, 12, 28), 1)(t, rnd);
    t.blobs(rnd, 10, c(84, 60, 128, 160), 1.4);
    t.blobs(rnd, 6, c(160, 120, 220, 120), 0.9);
  },
  tall_grass: (t, rnd) => {
    t.fill(c(0, 0, 0, 0));
    for (let i = 0; i < 16; i++) {
      const x = 2 + Math.floor(rnd() * (ART - 4));
      const h = 12 + Math.floor(rnd() * 14);
      const bend = (rnd() * 2 - 1) * 3;
      for (let s = 0; s < h; s++) {
        const y = ART - 1 - s;
        const xx = Math.round(x + (bend * s) / h);
        const col = mixc(c(58, 118, 40), c(126, 186, 76), s / h + rnd() * 0.2);
        t.put(xx, y, col);
        if (rnd() > 0.7) t.put(xx + 1, y, shade(col, 0.85));
      }
    }
  },
  flower_red: (t, rnd) => {
    t.fill(c(0, 0, 0, 0));
    for (let y = 14; y < ART; y++) {
      t.put(14, y, c(66, 132, 48));
      if (y % 5 === 0) t.put(15, y, c(88, 158, 62));
    }
    t.put(12, 20, c(58, 122, 44));
    t.put(16, 17, c(58, 122, 44));
    const pet = c(206, 54, 54);
    for (let j = -3; j <= 3; j++)
      for (let i = -3; i <= 3; i++) {
        const d = i * i + j * j;
        if (d <= 9 && !(d > 4 && Math.abs(i) === Math.abs(j)))
          t.put(14 + i, 11 + j, shade(pet, 1 - d * 0.045 + rnd() * 0.06));
      }
    t.rect(13, 10, 3, 3, c(250, 214, 92));
  },
  flower_yellow: (t, rnd) => {
    painters.flower_red(t, rnd);
    for (let y = 6; y < 17; y++)
      for (let x = 9; x < 20; x++) {
        const p = t.get(x, y);
        if (p[3] > 0 && !(p[0] > 200 && p[1] > 180)) t.put(x, y, shade(c(244, 206, 66), 0.9 + rnd() * 0.2));
      }
  },
  wool: (t, rnd) => {
    noisyBase(rnd, c(232, 232, 236), c(206, 206, 214), 0.6)(t, rnd);
    t.speckle(rnd, 0.05);
  },
  crack0: (t) => t.fill(c(0, 0, 0, 0)),
  crack1: (t, rnd) => crackPaint(t, rnd, 4, 90),
  crack2: (t, rnd) => crackPaint(t, rnd, 7, 120),
  crack3: (t, rnd) => crackPaint(t, rnd, 11, 150),
  crack4: (t, rnd) => crackPaint(t, rnd, 16, 185),
};

function crackPaint(t: TileBuf, rnd: () => number, branches: number, alpha: number) {
  t.fill(c(0, 0, 0, 0));
  for (let b = 0; b < branches; b++) {
    let x = Math.floor(rnd() * ART);
    let y = Math.floor(rnd() * ART);
    const len = 5 + Math.floor(rnd() * 14);
    let dx = rnd() > 0.5 ? 1 : -1;
    let dy = rnd() > 0.5 ? 1 : -1;
    for (let s = 0; s < len; s++) {
      t.put(x, y, c(12, 12, 14, alpha));
      if (rnd() > 0.7) t.put(x + 1, y, c(12, 12, 14, alpha * 0.6));
      if (rnd() > 0.6) dx = -dx;
      if (rnd() > 0.75) dy = -dy;
      x += dx;
      y += dy;
    }
  }
}

export const TILE_KEYS = [
  "grass_top",
  "grass_side",
  "dirt",
  "stone",
  "cobble",
  "sand",
  "sandstone",
  "log_side",
  "log_top",
  "leaves",
  "leaves_birch",
  "planks",
  "glass",
  "brick",
  "water",
  "snow",
  "snow_grass_side",
  "ice",
  "cactus",
  "gravel",
  "bedrock",
  "coal_ore",
  "iron_ore",
  "gold_ore",
  "crystal_ore",
  "lamp",
  "obsidian",
  "tall_grass",
  "flower_red",
  "flower_yellow",
  "wool",
  "crack0",
  "crack1",
  "crack2",
  "crack3",
  "crack4",
];

export interface AtlasResult {
  canvas: HTMLCanvasElement;
  /** key -> index */
  index: Map<string, number>;
  /** key -> [u0, v0, u1, v1] in atlas space (flipY accounted for) */
  uv: Map<string, [number, number, number, number]>;
}

export function buildAtlas(seed = 20240607): AtlasResult {
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_W;
  canvas.height = ATLAS_H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);

  const index = new Map<string, number>();
  const uv = new Map<string, [number, number, number, number]>();

  // deterministic rng per tile so the world always looks the same
  let s = seed >>> 0;
  const rndFor = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // opaque neutral backdrop so high mip levels never blend towards transparency
  ctx.fillStyle = "#6f6f74";
  ctx.fillRect(0, 0, ATLAS_W, ATLAS_H);

  TILE_KEYS.forEach((key, i) => {
    index.set(key, i);
    const cx = (i % COLS) * CELL;
    const cy = Math.floor(i / COLS) * CELL;
    const buf = new TileBuf();
    const painter = painters[key] ?? painters.stone;
    // tile-local rng stream
    let ls = (seed + i * 7919) >>> 0;
    const lrnd = () => {
      ls |= 0;
      ls = (ls + 0x9e3779b9) | 0;
      let t = Math.imul(ls ^ (ls >>> 16), 2246822507);
      t = Math.imul(t ^ (t >>> 13), 3266489909);
      return ((t ^= t >>> 16) >>> 0) / 4294967296;
    };
    painter(buf, lrnd);
    const img = ctx.createImageData(ART, ART);
    img.data.set(buf.d);
    ctx.putImageData(img, cx + PAD, cy + PAD);
    // edge-extend padding (prevents atlas bleeding in mip levels)
    ctx.drawImage(canvas, cx + PAD, cy + PAD, ART, 1, cx + PAD, cy, ART, 1);
    ctx.drawImage(canvas, cx + PAD, cy + PAD + ART - 1, ART, 1, cx + PAD, cy + PAD + ART, ART, 1);
    ctx.drawImage(canvas, cx + PAD, cy + PAD, 1, ART, cx, cy + PAD, 1, ART);
    ctx.drawImage(canvas, cx + PAD + ART - 1, cy + PAD, 1, ART, cx + PAD + ART, cy + PAD, 1, ART);
    ctx.drawImage(canvas, cx + PAD, cy + PAD, 1, 1, cx, cy, 1, 1);
    ctx.drawImage(canvas, cx + PAD + ART - 1, cy + PAD, 1, 1, cx + ART + PAD, cy, 1, 1);
    ctx.drawImage(canvas, cx + PAD, cy + PAD + ART - 1, 1, 1, cx, cy + ART + PAD, 1, 1);
    ctx.drawImage(canvas, cx + PAD + ART - 1, cy + PAD + ART - 1, 1, 1, cx + ART + PAD, cy + ART + PAD, 1, 1);

    const u0 = (cx + PAD) / ATLAS_W;
    const u1 = (cx + PAD + ART) / ATLAS_W;
    const v1 = 1 - (cy + PAD) / ATLAS_H;
    const v0 = 1 - (cy + PAD + ART) / ATLAS_H;
    uv.set(key, [u0, v0, u1, v1]);
  });
  void rndFor;

  return { canvas, index, uv };
}
