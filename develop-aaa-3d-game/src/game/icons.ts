import { ART, CELL, COLS, PAD, type AtlasResult } from "./textures";
import { block } from "./blocks";

/** Isometric pixel-art block icons rendered straight out of the texture atlas. */

const tileCache = new Map<string, HTMLCanvasElement>();
const iconCache = new Map<string, string>();

function tileCanvas(atlas: AtlasResult, key: string, tint: [number, number, number], bright: number): HTMLCanvasElement {
  const ck = `${key}|${tint[0].toFixed(3)},${tint[1].toFixed(3)},${tint[2].toFixed(3)}|${bright.toFixed(2)}`;
  const hit = tileCache.get(ck);
  if (hit) return hit;

  const i = atlas.index.get(key) ?? 0;
  const sx = (i % COLS) * CELL + PAD;
  const sy = Math.floor(i / COLS) * CELL + PAD;
  const c = document.createElement("canvas");
  c.width = ART;
  c.height = ART;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(atlas.canvas, sx, sy, ART, ART, 0, 0, ART, ART);

  const needsTint = tint[0] !== 1 || tint[1] !== 1 || tint[2] !== 1 || bright !== 1;
  if (needsTint) {
    const img = ctx.getImageData(0, 0, ART, ART);
    const d = img.data;
    for (let p = 0; p < d.length; p += 4) {
      d[p] = Math.min(255, d[p] * tint[0] * bright);
      d[p + 1] = Math.min(255, d[p + 1] * tint[1] * bright);
      d[p + 2] = Math.min(255, d[p + 2] * tint[2] * bright);
    }
    ctx.putImageData(img, 0, 0);
  }
  tileCache.set(ck, c);
  return c;
}

function face(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement,
  ox: number,
  oy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  ctx.save();
  ctx.transform(ax, ay, bx, by, ox, oy);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, ART, ART, 0, 0, 1, 1);
  ctx.restore();
}

export function blockIcon(atlas: AtlasResult, id: number, size = 64): string {
  const ck = `${id}|${size}`;
  const hit = iconCache.get(ck);
  if (hit) return hit;

  const def = block(id);
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;

  if (def.layer === "plant") {
    const img = tileCanvas(atlas, def.side, def.tint, 1);
    ctx.drawImage(img, 0, 0, ART, ART, size * 0.1, size * 0.06, size * 0.8, size * 0.88);
    const url = c.toDataURL();
    iconCache.set(ck, url);
    return url;
  }

  const w = size * 0.86;
  const hq = w * 0.25; // quarter height of the iso rhombus
  const bodyH = size * 0.42;
  const cx = size / 2;
  const y0 = size * 0.08;

  const top = tileCanvas(atlas, def.top, def.tint, 1.0);
  const left = tileCanvas(atlas, def.side, def.tint, 0.74);
  const right = tileCanvas(atlas, def.side, def.tint, 0.55);

  // top rhombus: (0,0)->left, (1,0)->top, (0,1)->bottom
  face(ctx, top, cx - w / 2, y0 + hq, w / 2, -hq, w / 2, hq);
  // left face
  face(ctx, left, cx - w / 2, y0 + hq, w / 2, hq, 0, bodyH);
  // right face
  face(ctx, right, cx, y0 + hq * 2, w / 2, -hq, 0, bodyH);

  const url = c.toDataURL();
  iconCache.set(ck, url);
  return url;
}

export function clearIconCache() {
  iconCache.clear();
  tileCache.clear();
}
