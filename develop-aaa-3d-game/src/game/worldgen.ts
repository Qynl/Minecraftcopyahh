import { Noise, clamp, smoothstep } from "./rng";
import {
  AIR,
  BEDROCK,
  BRICK,
  CACTUS,
  COAL_ORE,
  COBBLE,
  CRYSTAL_ORE,
  DIRT,
  FLOWER_RED,
  FLOWER_YELLOW,
  GOLD_ORE,
  GRASS,
  GRAVEL,
  ICE,
  IRON_ORE,
  LEAVES,
  BIRCH_LEAVES,
  LOG,
  BIRCH_LOG,
  OBSIDIAN,
  PLANKS,
  SAND,
  SANDSTONE,
  SNOW,
  SNOW_GRASS,
  STONE,
  TALL_GRASS,
  WATER,
  LAMP,
} from "./blocks";

export const CHUNK = 16;
export const HEIGHT = 84;
export const SEA = 32;

export const BIOME = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  DESERT: 4,
  TUNDRA: 5,
  MOUNTAINS: 6,
  TAIGA: 7,
} as const;

export type BiomeId = (typeof BIOME)[keyof typeof BIOME];

export const BIOME_NAME = [
  "Deep Ocean",
  "Shoreline",
  "Sunlit Plains",
  "Whispering Forest",
  "Amber Desert",
  "Frost Tundra",
  "Sky Peaks",
  "Boreal Taiga",
];

export const BIOME_COLOR: [number, number, number][] = [
  [30, 74, 140],
  [222, 206, 156],
  [112, 176, 78],
  [66, 138, 62],
  [226, 196, 120],
  [228, 236, 244],
  [154, 158, 168],
  [70, 116, 96],
];

export function idx(x: number, y: number, z: number) {
  return (y * CHUNK + z) * CHUNK + x;
}

export function hash2(x: number, z: number, s: number) {
  let h = Math.imul(x, 374761393) ^ Math.imul(z, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** smooth, noise driven foliage colour — no hard biome seams */
export const FOLIAGE_DRY: [number, number, number] = [1.07, 1.0, 0.6];
export const FOLIAGE_LUSH: [number, number, number] = [0.74, 1.06, 0.66];
export const FOLIAGE_COLD: [number, number, number] = [0.86, 0.97, 0.95];

/** deterministic "what block would the surface be here" lookup */
export function derivedSurface(biome: BiomeId, h: number): number {
  switch (biome) {
    case BIOME.OCEAN:
    case BIOME.BEACH:
    case BIOME.DESERT:
      return SAND;
    case BIOME.TUNDRA:
    case BIOME.TAIGA:
      return SNOW_GRASS;
    case BIOME.MOUNTAINS:
      return h > SEA + 40 ? SNOW : STONE;
    default:
      return GRASS;
  }
}

export class WorldGen {
  seed: number;
  private continent: Noise;
  private erosion: Noise;
  private peaks: Noise;
  private temp: Noise;
  private humid: Noise;
  private caveA: Noise;
  private caveB: Noise;
  private oreN: Noise;
  private detail: Noise;

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.continent = new Noise(this.seed);
    this.erosion = new Noise((this.seed ^ 0x9e3779b9) >>> 0);
    this.peaks = new Noise((this.seed ^ 0x85ebca6b) >>> 0);
    this.temp = new Noise((this.seed ^ 0xc2b2ae35) >>> 0);
    this.humid = new Noise((this.seed ^ 0x27d4eb2f) >>> 0);
    this.caveA = new Noise((this.seed ^ 0x165667b1) >>> 0);
    this.caveB = new Noise((this.seed ^ 0xd3a264fb) >>> 0);
    this.oreN = new Noise((this.seed ^ 0x7fd1b2ab) >>> 0);
    this.detail = new Noise((this.seed ^ 0x5bf03635) >>> 0);
  }

  /** terrain height (top solid block y) + biome at a world column */
  column(x: number, z: number): { h: number; biome: BiomeId; temp: number; humid: number } {
    const cont = this.continent.fbm2(x * 0.00085, z * 0.00085, 4);
    const er = this.erosion.fbm2(x * 0.0026 + 400, z * 0.0026 - 400, 3);
    const pk = this.peaks.ridged2(x * 0.0042, z * 0.0042, 5);
    const t = this.temp.fbm2(x * 0.0012 - 900, z * 0.0012 + 250, 2);
    const hm = this.humid.fbm2(x * 0.0015 + 700, z * 0.0015 + 130, 2);

    const mountainMask = smoothstep(0.02, 0.5, cont) * smoothstep(-0.35, 0.35, -er + 0.2);
    let h =
      SEA +
      cont * 13 -
      er * 7 +
      Math.pow(pk, 2.6) * 40 * mountainMask +
      this.detail.n2(x * 0.02, z * 0.02) * 1.6;

    // flatten shallow water areas into lakes / ponds on land
    if (h > SEA && h < SEA + 2.4 && hm > 0.05) h = SEA - 2 - hm * 2;

    h = Math.round(clamp(h, 3, HEIGHT - 14));

    let biome: BiomeId;
    if (h < SEA - 1) biome = BIOME.OCEAN;
    else if (h <= SEA + 1) biome = BIOME.BEACH;
    else if (h > SEA + 26) biome = BIOME.MOUNTAINS;
    else if (t < -0.28) biome = hm > 0.05 ? BIOME.TAIGA : BIOME.TUNDRA;
    else if (t > 0.3 && hm < -0.02) biome = BIOME.DESERT;
    else if (hm > 0.12) biome = BIOME.FOREST;
    else biome = BIOME.PLAINS;

    return { h, biome, temp: t, humid: hm };
  }

  private isCave(x: number, y: number, z: number, surface: number): boolean {
    if (y > surface - 2 || y < 2) return false;
    const depth = (surface - y) / Math.max(1, surface);
    // spaghetti tunnels
    const w1 = this.caveB.n3(x * 0.021, y * 0.028, z * 0.021);
    const w2 = this.caveB.n3(x * 0.021 + 128.5, y * 0.028 - 64.2, z * 0.021 + 31.7);
    const tunnelR = 0.052 + depth * 0.02;
    if (Math.abs(w1) < tunnelR && Math.abs(w2) < tunnelR) return true;
    // big cheese caverns deep down
    if (y < SEA - 6) {
      const cheese = this.caveA.fbm3(x * 0.028, y * 0.038, z * 0.028, 2);
      if (cheese > 0.44 - depth * 0.1) return true;
    }
    return false;
  }

  private oreAt(x: number, y: number, z: number): number {
    if (y < 2) return AIR;
    const n = this.oreN.n3(x * 0.11, y * 0.13, z * 0.11);
    const n2 = this.oreN.n3(x * 0.19 + 61, y * 0.22 - 13, z * 0.19 + 7);
    const v = n * 0.65 + n2 * 0.35;
    if (v > 0.7 && y < 20) return CRYSTAL_ORE;
    if (v > 0.66 && y < 28) return GOLD_ORE;
    if (v > 0.6 && y < 46) return IRON_ORE;
    if (v > 0.54 && y < 62) return COAL_ORE;
    return AIR;
  }

  /** fill a chunk with terrain (no structures yet) */
  terrain(blocks: Uint8Array, biomeMap: Uint8Array, cx: number, cz: number) {
    const heights = new Int16Array(CHUNK * CHUNK);
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = cx * CHUNK + lx;
        const wz = cz * CHUNK + lz;
        const col = this.column(wx, wz);
        const h = col.h;
        heights[lz * CHUNK + lx] = h;
        biomeMap[lz * CHUNK + lx] = col.biome;

        const beach = col.biome === BIOME.BEACH || col.biome === BIOME.OCEAN;
        const desert = col.biome === BIOME.DESERT;
        const frozen = col.biome === BIOME.TUNDRA || col.biome === BIOME.TAIGA;
        const peak = col.biome === BIOME.MOUNTAINS;

        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let b: number = AIR;
          if (y <= h) {
            if (y === 0 || (y < 3 && hash2(wx, wz, y * 7919 + 13) < 0.6 - y * 0.2)) b = BEDROCK;
            else if (desert) b = y > h - 4 ? SAND : y > h - 8 ? SANDSTONE : STONE;
            else if (beach) b = y > h - 4 ? SAND : y > h - 7 ? SANDSTONE : STONE;
            else if (peak) {
              if (y === h) b = h > SEA + 40 ? SNOW : y > SEA + 30 ? STONE : GRASS;
              else b = y > h - 4 ? STONE : STONE;
            } else if (frozen) b = y === h ? SNOW_GRASS : y > h - 4 ? DIRT : STONE;
            else b = y === h ? GRASS : y > h - 4 ? DIRT : STONE;

            if (b === STONE) {
              const ore = this.oreAt(wx, y, wz);
              if (ore !== AIR) b = ore;
              else if (y < 12 && hash2(wx, wz, y * 31 + 7) > 0.985) b = OBSIDIAN;
              else if (hash2(wx, wz, y * 17 + 3) > 0.988 && y < h - 4) b = GRAVEL;
            }
            if (this.isCave(wx, y, wz, h)) b = AIR;
          } else if (y <= SEA) {
            b = WATER;
          }
          // ice skin on frozen water
          if (b === WATER && y === SEA && frozen && h < SEA) b = ICE;
          if (b !== AIR) blocks[idx(lx, y, lz)] = b;
        }

        // cave ceilings that open to water get a gravel floor look
        if (h < SEA && beach && blocks[idx(lx, h, lz)] === AIR) {
          for (let y = h; y >= 1; y--) {
            if (blocks[idx(lx, y, lz)] === AIR) blocks[idx(lx, y, lz)] = GRAVEL;
            else break;
          }
        }
      }
    }
    return heights;
  }

  /** biome tint for grass / leaves at a world column */
  foliageTint(x: number, z: number, out: Float32Array, o: number) {
    const t = this.temp.fbm2(x * 0.0012 - 900, z * 0.0012 + 250, 2);
    const hm = this.humid.fbm2(x * 0.0015 + 700, z * 0.0015 + 130, 2);
    const wet = clamp((hm + 0.25) / 0.7, 0, 1);
    const warm = clamp((t + 0.45) / 0.85, 0, 1);
    const r = FOLIAGE_DRY[0] + (FOLIAGE_LUSH[0] - FOLIAGE_DRY[0]) * wet;
    const g = FOLIAGE_DRY[1] + (FOLIAGE_LUSH[1] - FOLIAGE_DRY[1]) * wet;
    const b = FOLIAGE_DRY[2] + (FOLIAGE_LUSH[2] - FOLIAGE_DRY[2]) * wet;
    const cold = 1 - warm;
    out[o] = r + (FOLIAGE_COLD[0] - r) * cold;
    out[o + 1] = g + (FOLIAGE_COLD[1] - g) * cold;
    out[o + 2] = b + (FOLIAGE_COLD[2] - b) * cold;
  }

  /** trees, plants, boulders — writes only into this chunk's volume */
  decorate(blocks: Uint8Array, biomeMap: Uint8Array, cx: number, cz: number) {
    // structures never reach further than 3 blocks from their trunk, so a
    // one chunk margin is plenty to keep borders seamless
    const R = 1;
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const ncx = cx + dx;
        const ncz = cz + dz;
        for (let lz = 0; lz < CHUNK; lz++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            const wx = ncx * CHUNK + lx;
            const wz = ncz * CHUNK + lz;
            const r = hash2(wx, wz, this.seed ^ 0x5eed);
            if (r >= 0.055) continue; // cheap rejection before any noise work
            const col = this.column(wx, wz);
            const biome = col.biome;
            let density = 0;
            if (biome === BIOME.FOREST) density = 0.055;
            else if (biome === BIOME.TAIGA) density = 0.05;
            else if (biome === BIOME.PLAINS) density = 0.006;
            else if (biome === BIOME.TUNDRA) density = 0.008;
            else if (biome === BIOME.MOUNTAINS) density = 0.004;
            else if (biome === BIOME.DESERT) density = 0.004;
            if (r >= density) continue;
            // spacing: must be the local minimum hash in a radius-2 window
            let ok = true;
            for (let j = -2; j <= 2 && ok; j++) {
              for (let i = -2; i <= 2 && ok; i++) {
                if (i === 0 && j === 0) continue;
                if (hash2(wx + i, wz + j, this.seed ^ 0x5eed) < r) ok = false;
              }
            }
            if (!ok) continue;
            if (col.h <= SEA || col.h > SEA + 40) continue;
            // verify against real data when the column lives in this chunk
            const inChunk = dx === 0 && dz === 0;
            if (inChunk) {
              const sy = col.h;
              if (blocks[idx(lx, sy, lz)] === AIR || blocks[idx(lx, sy + 1, lz)] !== AIR) continue;
            }
            const ground = derivedSurface(biome, col.h);
            if (biome === BIOME.DESERT) {
              if (ground !== SAND) continue;
              this.cactus(blocks, cx, cz, wx, col.h + 1, wz, hash2(wx, wz, 99));
            } else {
              if (ground !== GRASS && ground !== SNOW_GRASS && ground !== DIRT) continue;
              const kind = hash2(wx, wz, 4242);
              if (biome === BIOME.TAIGA || biome === BIOME.TUNDRA || kind > 0.78)
                this.spruce(blocks, cx, cz, wx, col.h + 1, wz, kind);
              else if (kind > 0.42) this.oak(blocks, cx, cz, wx, col.h + 1, wz, kind, true);
              else this.oak(blocks, cx, cz, wx, col.h + 1, wz, kind, false);
            }
          }
        }
      }
    }

    /* ---------- rare landmarks (ruins, obelisks, ice spikes, stone circles) ---------- */
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let lz = 0; lz < CHUNK; lz++) {
          for (let lx = 0; lx < CHUNK; lx++) {
            const wx = (cx + dx) * CHUNK + lx;
            const wz = (cz + dz) * CHUNK + lz;
            const r = hash2(wx, wz, this.seed ^ 0xabc123);
            if (r >= 0.004) continue;
            let alone = true;
            for (let j = -7; j <= 7 && alone; j++) {
              for (let i = -7; i <= 7 && alone; i++) {
                if (i * i + j * j > 50) continue;
                if (i === 0 && j === 0) continue;
                if (hash2(wx + i, wz + j, this.seed ^ 0xabc123) < r) alone = false;
              }
            }
            if (!alone) continue;
            const col = this.column(wx, wz);
            if (col.h <= SEA + 1 || col.h > SEA + 34) continue;
            const kind = hash2(wx, wz, 777);
            if (col.biome === BIOME.TUNDRA || col.biome === BIOME.TAIGA) {
              this.iceSpike(blocks, cx, cz, wx, col.h, wz, kind);
            } else if (col.biome === BIOME.DESERT || col.biome === BIOME.BEACH) {
              this.obelisk(blocks, cx, cz, wx, col.h, wz, kind);
            } else if (kind < 0.5) {
              this.ruin(blocks, cx, cz, wx, col.h, wz, kind);
            } else {
              this.stoneCircle(blocks, cx, cz, wx, col.h, wz, kind);
            }
          }
        }
      }
    }

    // ground cover inside this chunk only
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const wx = cx * CHUNK + lx;
        const wz = cz * CHUNK + lz;
        const biome = biomeMap[lz * CHUNK + lx];
        const h = this.findSurfaceY(blocks, lx, lz);
        if (h < 0) continue;
        const top = blocks[idx(lx, h, lz)];
        const above = h + 1 < HEIGHT ? blocks[idx(lx, h + 1, lz)] : AIR;
        if (above !== AIR) continue;
        const r = hash2(wx, wz, this.seed ^ 0xbeef);
        if (top === GRASS || top === SNOW_GRASS) {
          const lush = biome === BIOME.FOREST ? 0.3 : biome === BIOME.PLAINS ? 0.2 : 0.08;
          if (r < lush) blocks[idx(lx, h + 1, lz)] = TALL_GRASS;
          else if (r < lush + 0.02) blocks[idx(lx, h + 1, lz)] = r % 2 < 1 ? FLOWER_RED : FLOWER_YELLOW;
          else if (r > 0.995) blocks[idx(lx, h + 1, lz)] = COBBLE;
        } else if (top === SAND && biome === BIOME.DESERT && r > 0.995) {
          blocks[idx(lx, h + 1, lz)] = COBBLE;
        } else if (top === STONE && biome === BIOME.MOUNTAINS && r > 0.985) {
          blocks[idx(lx, h + 1, lz)] = COBBLE;
        }
        // rare surface lamp ruins
        if (r > 0.99985 && (top === GRASS || top === SAND)) {
          blocks[idx(lx, h + 1, lz)] = PLANKS;
          if (h + 2 < HEIGHT) blocks[idx(lx, h + 2, lz)] = LAMP;
        }
      }
    }
  }

  private findSurfaceY(blocks: Uint8Array, lx: number, lz: number): number {
    for (let y = HEIGHT - 1; y >= 0; y--) {
      const b = blocks[idx(lx, y, lz)];
      if (b !== AIR && b !== WATER && b !== TALL_GRASS && b !== FLOWER_RED && b !== FLOWER_YELLOW) return y;
    }
    return -1;
  }

  private putForce(blocks: Uint8Array, cx: number, cz: number, wx: number, wy: number, wz: number, b: number, onlyAir = true) {
    if (wy < 1 || wy >= HEIGHT) return;
    const lx = wx - cx * CHUNK;
    const lz = wz - cz * CHUNK;
    if (lx < 0 || lx >= CHUNK || lz < 0 || lz >= CHUNK) return;
    const i = idx(lx, wy, lz);
    if (onlyAir && blocks[i] !== AIR) return;
    blocks[i] = b;
  }

  private leafBlob(
    blocks: Uint8Array,
    cx: number,
    cz: number,
    x: number,
    y: number,
    z: number,
    rx: number,
    ry: number,
    rz: number,
    leaf: number,
    rnd: number
  ) {
    for (let dy = -ry; dy <= ry; dy++) {
      for (let dz = -rz; dz <= rz; dz++) {
        for (let dx = -rx; dx <= rx; dx++) {
          const d = (dx * dx) / (rx * rx + 0.4) + (dy * dy) / (ry * ry + 0.4) + (dz * dz) / (rz * rz + 0.4);
          if (d > 1.05) continue;
          if (d > 0.72 && hash2(x + dx, z + dz, (y + dy) * 33 + 7) < 0.32 * rnd) continue;
          this.putForce(blocks, cx, cz, x + dx, y + dy, z + dz, leaf, true);
        }
      }
    }
  }

  private oak(
    blocks: Uint8Array,
    cx: number,
    cz: number,
    x: number,
    y: number,
    z: number,
    kind: number,
    birch: boolean
  ) {
    const trunk = 4 + Math.floor(kind * 3);
    const log = birch ? BIRCH_LOG : LOG;
    const leaf = birch ? BIRCH_LEAVES : LEAVES;
    for (let i = 0; i < trunk; i++) this.putForce(blocks, cx, cz, x, y + i, z, log, false);
    const topY = y + trunk;
    this.leafBlob(blocks, cx, cz, x, topY - 2, z, 2, 1, 2, leaf, 1);
    this.leafBlob(blocks, cx, cz, x, topY - 1, z, 2, 1, 2, leaf, 1.2);
    this.leafBlob(blocks, cx, cz, x, topY, z, 1, 1, 1, leaf, 1.4);
    this.putForce(blocks, cx, cz, x, topY + 1, z, leaf, true);
    // roots / buttress
    if (kind > 0.7) this.putForce(blocks, cx, cz, x + 1, y, z, log, true);
  }

  private spruce(blocks: Uint8Array, cx: number, cz: number, x: number, y: number, z: number, kind: number) {
    const trunk = 6 + Math.floor(kind * 5);
    for (let i = 0; i < trunk; i++) this.putForce(blocks, cx, cz, x, y + i, z, LOG, false);
    const layers = 4;
    for (let l = 0; l < layers; l++) {
      const ly = y + trunk - 1 - l * 2;
      const r = 1 + l * 0.6;
      const ri = Math.round(r);
      for (let dz = -ri; dz <= ri; dz++)
        for (let dx = -ri; dx <= ri; dx++) {
          if (Math.abs(dx) === ri && Math.abs(dz) === ri && hash2(x + dx, z + dz, ly) > 0.4) continue;
          this.putForce(blocks, cx, cz, x + dx, ly, z + dz, LEAVES, true);
        }
    }
    this.putForce(blocks, cx, cz, x, y + trunk, z, LEAVES, true);
    this.putForce(blocks, cx, cz, x, y + trunk + 1, z, SNOW, true);
  }

  private cactus(blocks: Uint8Array, cx: number, cz: number, x: number, y: number, z: number, kind: number) {
    const h = 2 + Math.floor(kind * 3);
    for (let i = 0; i < h; i++) this.putForce(blocks, cx, cz, x, y + i, z, CACTUS, false);
  }

  /* ------------------------------------------------------------------ */
  /* landmarks                                                           */
  /* ------------------------------------------------------------------ */

  /** crumbling watchtower with a lamp still burning inside */
  private ruin(blocks: Uint8Array, cx: number, cz: number, x: number, y: number, z: number, kind: number) {
    const H = 7 + Math.floor(kind * 6);
    for (let dy = 0; dy <= H; dy++) {
      for (let dz = -2; dz <= 2; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dy === 0) {
            this.putForce(blocks, cx, cz, x + dx, y, z + dz, PLANKS, false);
            continue;
          }
          const edge = Math.abs(dx) === 2 || Math.abs(dz) === 2;
          if (!edge) continue;
          const door = dx === -2 && dz === 0 && dy <= 2;
          if (door) continue;
          const er = hash2(x + dx * 31, z + dz * 17, dy * 13 + 5);
          if (dy > H - Math.floor(er * 3.4)) continue;
          const mat = er > 0.78 ? GRAVEL : er > 0.42 ? COBBLE : STONE;
          this.putForce(blocks, cx, cz, x + dx, y + dy, z + dz, mat, false);
        }
      }
    }
    this.putForce(blocks, cx, cz, x, y + 3, z, LAMP, false);
    this.putForce(blocks, cx, cz, x, y + 1, z, AIR, false);
    // collapsed rubble skirt
    for (let i = 0; i < 9; i++) {
      const a = hash2(x + i, z - i, 91) * Math.PI * 2;
      const rr = 2.6 + hash2(x - i, z + i, 33) * 2.4;
      const bx = Math.round(x + Math.cos(a) * rr);
      const bz = Math.round(z + Math.sin(a) * rr);
      this.putForce(blocks, cx, cz, bx, y + 1, bz, i % 3 === 0 ? COBBLE : GRAVEL, true);
      if (hash2(bx, bz, 12) > 0.6) this.putForce(blocks, cx, cz, bx, y + 2, bz, COBBLE, true);
    }
  }

  /** desert monument: tapered sandstone pillar crowned with a sun lamp */
  private obelisk(blocks: Uint8Array, cx: number, cz: number, x: number, y: number, z: number, kind: number) {
    const H = 7 + Math.floor(kind * 6);
    for (let dy = 0; dy <= H; dy++) {
      const r = dy < 2 ? 2 : dy < 4 ? 1 : 0;
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy > 0) continue;
          const mat = dy === H && r === 0 ? BRICK : SANDSTONE;
          this.putForce(blocks, cx, cz, x + dx, y + dy, z + dz, mat, false);
        }
      }
    }
    this.putForce(blocks, cx, cz, x, y + H + 1, z, LAMP, false);
  }

  /** frozen spire */
  private iceSpike(blocks: Uint8Array, cx: number, cz: number, x: number, y: number, z: number, kind: number) {
    const H = 8 + Math.floor(kind * 9);
    for (let dy = 0; dy <= H; dy++) {
      const rr = Math.max(0, Math.round((1 - dy / H) * 2.7));
      for (let dz = -rr; dz <= rr; dz++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (dx * dx + dz * dz > rr * rr + rr * 0.7) continue;
          this.putForce(blocks, cx, cz, x + dx, y + dy, z + dz, dy > H - 3 ? ICE : SNOW, false);
        }
      }
    }
    for (let i = 0; i < 3; i++) {
      const a = hash2(x + i * 7, z - i * 3, 51) * Math.PI * 2;
      const rr = 2 + hash2(x - i, z + i, 71) * 2;
      const bx = Math.round(x + Math.cos(a) * rr);
      const bz = Math.round(z + Math.sin(a) * rr);
      const h2 = 2 + Math.floor(hash2(bx, bz, 17) * 3);
      for (let dy = 1; dy <= h2; dy++) this.putForce(blocks, cx, cz, bx, y + dy, bz, SNOW, true);
    }
  }

  /** mini henge — a ring of standing stones around a lamp */
  private stoneCircle(blocks: Uint8Array, cx: number, cz: number, x: number, y: number, z: number, kind: number) {
    const n = 6 + Math.floor(kind * 2);
    const rad = 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = Math.round(x + Math.cos(a) * rad);
      const pz = Math.round(z + Math.sin(a) * rad);
      const hh = 3 + Math.floor(hash2(px, pz, 5) * 2);
      for (let dy = 1; dy <= hh; dy++) {
        const mat = hash2(px, pz, dy) > 0.7 ? COBBLE : STONE;
        this.putForce(blocks, cx, cz, px, y + dy, pz, mat, false);
      }
    }
    this.putForce(blocks, cx, cz, x, y + 1, z, COBBLE, false);
    this.putForce(blocks, cx, cz, x, y + 2, z, LAMP, false);
  }
}
