import { AIR, BEDROCK, WATER, block } from "./blocks";
import { CHUNK, HEIGHT, SEA, WorldGen, idx } from "./worldgen";

export const STAGE = { NEW: 0, TERRAIN: 1, DECORATED: 2, LIT: 3 } as const;

const CELLS = CHUNK * CHUNK * HEIGHT;

export class Chunk {
  cx: number;
  cz: number;
  blocks = new Uint8Array(CELLS);
  sky = new Uint8Array(CELLS);
  blk = new Uint8Array(CELLS);
  biome = new Uint8Array(CHUNK * CHUNK);
  topY = new Uint8Array(CHUNK * CHUNK);
  topBlock = new Uint8Array(CHUNK * CHUNK);
  stage: number = STAGE.NEW;
  dirty = true;
  lastUsed = 0;

  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }
  get key() {
    return chunkKey(this.cx, this.cz);
  }
}

export function chunkKey(cx: number, cz: number) {
  return (cx + 8192) * 16384 + (cz + 8192);
}

const isOpaque = (id: number) => (id === AIR ? false : block(id).opaque);
const isAirLike = (id: number) => id === AIR || !block(id).solid;

export class World {
  gen: WorldGen;
  chunks = new Map<number, Chunk>();
  seed: number;
  /** chunks whose meshes must be rebuilt */
  dirtyChunks = new Set<number>();
  private queue: number[] = [];

  constructor(seed: number) {
    this.seed = seed >>> 0;
    this.gen = new WorldGen(this.seed);
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  /** ensure a chunk exists with terrain + decoration (no lighting) */
  ensureChunk(cx: number, cz: number): Chunk {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (!c) {
      c = new Chunk(cx, cz);
      this.chunks.set(key, c);
    }
    if (c.stage === STAGE.NEW) {
      this.gen.terrain(c.blocks, c.biome, cx, cz);
      c.stage = STAGE.TERRAIN;
    }
    if (c.stage === STAGE.TERRAIN) {
      this.gen.decorate(c.blocks, c.biome, cx, cz);
      this.applyEdits(c);
      this.computeTop(c);
      c.stage = STAGE.DECORATED;
    }
    return c;
  }

  computeTop(c: Chunk) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        let ty = 0;
        let tb = AIR;
        for (let y = HEIGHT - 1; y >= 0; y--) {
          const b = c.blocks[idx(lx, y, lz)];
          if (b !== AIR && b !== WATER) {
            ty = y;
            tb = b;
            break;
          }
          if (b === WATER && tb === AIR) tb = WATER;
        }
        c.topY[lz * CHUNK + lx] = ty;
        c.topBlock[lz * CHUNK + lx] = tb;
      }
    }
  }

  /* ---------------- block access ---------------- */

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (y >= HEIGHT) return AIR;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || c.stage < STAGE.TERRAIN) return AIR;
    return c.blocks[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  isSolid(x: number, y: number, z: number): boolean {
    const b = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return b !== AIR && block(b).solid;
  }

  getSky(x: number, y: number, z: number): number {
    if (y >= HEIGHT) return 15;
    if (y < 0) return 0;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c) return 15;
    if (c.stage >= STAGE.LIT) return c.sky[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
    // fallback: quick vertical exposure scan
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    for (let yy = HEIGHT - 1; yy > y; yy--) if (isOpaque(c.blocks[idx(lx, yy, lz)])) return 0;
    return 15;
  }

  getBlockLight(x: number, y: number, z: number): number {
    if (y < 0 || y >= HEIGHT) return 0;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.chunks.get(chunkKey(cx, cz));
    if (!c || c.stage < STAGE.LIT) return 0;
    return c.blk[idx(x - cx * CHUNK, y, z - cz * CHUNK)];
  }

  /* ---------------- lighting ---------------- */

  /* -------- absolute coordinate light access with a 1-entry chunk cache -------- */
  private _lc: Chunk | null = null;
  private _lk = -999;

  private chunkAt(x: number, z: number): Chunk | undefined {
    const k = chunkKey(x >> 4, z >> 4);
    if (k === this._lk) return this._lc ?? undefined;
    const c = this.chunks.get(k);
    this._lk = k;
    this._lc = c ?? null;
    return c;
  }

  private blockAtAbs(x: number, y: number, z: number): number {
    if (y < 0) return BEDROCK;
    if (y >= HEIGHT) return AIR;
    const c = this.chunkAt(x, z);
    if (!c || c.stage < STAGE.TERRAIN) return AIR;
    return c.blocks[idx(x - c.cx * CHUNK, y, z - c.cz * CHUNK)];
  }

  private opaqueAt(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    if (y >= HEIGHT) return false;
    const c = this.chunkAt(x, z);
    if (!c || c.stage < STAGE.TERRAIN) return false;
    return isOpaque(c.blocks[idx(x - c.cx * CHUNK, y, z - c.cz * CHUNK)]);
  }

  private lightGet(x: number, y: number, z: number, type: 0 | 1): number {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.chunkAt(x, z);
    if (!c) return 0;
    const i = idx(x - c.cx * CHUNK, y, z - c.cz * CHUNK);
    return type === 0 ? c.sky[i] : c.blk[i];
  }

  private lightSet(x: number, y: number, z: number, type: 0 | 1, v: number) {
    if (y < 0 || y >= HEIGHT) return;
    const c = this.chunkAt(x, z);
    if (!c) return;
    const i = idx(x - c.cx * CHUNK, y, z - c.cz * CHUNK);
    if (type === 0) c.sky[i] = v;
    else c.blk[i] = v;
    if (c.stage >= STAGE.LIT) {
      c.dirty = true;
      this.dirtyChunks.add(c.key);
    }
  }

  computeLight(c: Chunk) {
    const q: number[] = [];
    c.sky.fill(0);
    c.blk.fill(0);
    const ox = c.cx * CHUNK;
    const oz = c.cz * CHUNK;

    // seed sky light from above (foliage dims the shaft, everything else is clear)
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        let v = 15;
        for (let y = HEIGHT - 1; y >= 0; y--) {
          const i = idx(lx, y, lz);
          const b = c.blocks[i];
          if (isOpaque(b)) break;
          if (v > 0) {
            c.sky[i] = v;
            q.push(ox + lx, y, oz + lz, 0);
          }
          if (block(b).layer === "cutout") v = Math.max(0, v - 3);
        }
      }
    }
    // seed block light from emitters
    for (let i = 0; i < CELLS; i++) {
      const l = block(c.blocks[i]).light;
      if (l > 0) {
        c.blk[i] = l;
        const y = (i / (CHUNK * CHUNK)) | 0;
        const rem = i - y * CHUNK * CHUNK;
        const lz = (rem / CHUNK) | 0;
        const lx = rem - lz * CHUNK;
        q.push(ox + lx, y, oz + lz, 1);
      }
    }
    // seed from already-lit neighbours so light flows across chunk borders
    for (let y = 0; y < HEIGHT; y++) {
      for (let a = 0; a < CHUNK; a++) {
        // left / right
        for (const s of [-1, 1]) {
          const wx = s < 0 ? ox - 1 : ox + CHUNK;
          const lx = s < 0 ? 0 : CHUNK - 1;
          const nl = this.lightGet(wx, y, oz + a, 0);
          if (nl > 1 && !isOpaque(c.blocks[idx(lx, y, a)]) && c.sky[idx(lx, y, a)] < nl - 1) {
            c.sky[idx(lx, y, a)] = nl - 1;
            q.push(ox + lx, y, oz + a, 0);
          }
          const nb = this.lightGet(wx, y, oz + a, 1);
          if (nb > 1 && !isOpaque(c.blocks[idx(lx, y, a)]) && c.blk[idx(lx, y, a)] < nb - 1) {
            c.blk[idx(lx, y, a)] = nb - 1;
            q.push(ox + lx, y, oz + a, 1);
          }
        }
        // front / back
        for (const s of [-1, 1]) {
          const wz = s < 0 ? oz - 1 : oz + CHUNK;
          const lz2 = s < 0 ? 0 : CHUNK - 1;
          const nl = this.lightGet(ox + a, y, wz, 0);
          if (nl > 1 && !isOpaque(c.blocks[idx(a, y, lz2)]) && c.sky[idx(a, y, lz2)] < nl - 1) {
            c.sky[idx(a, y, lz2)] = nl - 1;
            q.push(ox + a, y, oz + lz2, 0);
          }
          const nb = this.lightGet(ox + a, y, wz, 1);
          if (nb > 1 && !isOpaque(c.blocks[idx(a, y, lz2)]) && c.blk[idx(a, y, lz2)] < nb - 1) {
            c.blk[idx(a, y, lz2)] = nb - 1;
            q.push(ox + a, y, oz + lz2, 1);
          }
        }
      }
    }
    c.stage = STAGE.LIT;
    this.propagate(q);
  }

  /** shared BFS for both light channels (absolute coords) */
  private propagate(q: number[]) {
    let head = 0;
    while (head < q.length) {
      const x = q[head++];
      const y = q[head++];
      const z = q[head++];
      const type = q[head++] as 0 | 1;
      const cur = this.lightGet(x, y, z, type);
      if (cur <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d];
        const ny = y + DY[d];
        const nz = z + DZ[d];
        if (ny < 0 || ny >= HEIGHT) continue;
        const nb = this.blockAtAbs(nx, ny, nz);
        if (isOpaque(nb)) continue;
        let val = cur - 1;
        // vertical sunlight never attenuates — unless foliage dims it
        if (type === 0 && cur === 15 && d === 3 && block(nb).layer !== "cutout") val = 15;
        if (this.lightGet(nx, ny, nz, type) >= val) continue;
        this.lightSet(nx, ny, nz, type, val);
        q.push(nx, ny, nz, type);
      }
    }
  }

  /** re-light locally after a block edit (chunks needing a remesh land in dirtyChunks) */
  relight(x: number, y: number, z: number, oldId: number, newId: number) {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return;
    c.dirty = true;
    this.dirtyChunks.add(c.key);

    const oldOpaque = isOpaque(oldId);
    const newOpaque = isOpaque(newId);
    const oldLight = block(oldId).light;
    const newLight = block(newId).light;

    if (oldLight > 0) this.removeLight(x, y, z, 1);
    if (oldOpaque && !newOpaque) {
      const above = this.lightGet(x, y + 1, z, 0);
      if (above > 0) this.addLight(x, y, z, 0, above);
      else this.removeLight(x, y, z, 0);
      // re-feed the whole column below the opened cell
      if (above === 15) {
        for (let yy = y; yy >= 1; yy--) {
          if (this.opaqueAt(x, yy, z)) break;
          if (this.lightGet(x, yy, z, 0) >= 15) break;
          this.addLight(x, yy, z, 0, 15);
        }
      }
    } else if (!oldOpaque && newOpaque) {
      this.removeLight(x, y, z, 0);
      this.removeLight(x, y, z, 1);
    }
    if (newLight > 0) this.addLight(x, y, z, 1, newLight);

    const lx = x - c.cx * CHUNK;
    const lz = z - c.cz * CHUNK;
    if (lx === 0) this.touch(c.cx - 1, c.cz);
    if (lx === CHUNK - 1) this.touch(c.cx + 1, c.cz);
    if (lz === 0) this.touch(c.cx, c.cz - 1);
    if (lz === CHUNK - 1) this.touch(c.cx, c.cz + 1);
  }

  private touch(cx: number, cz: number) {
    const c = this.getChunk(cx, cz);
    if (c) {
      c.dirty = true;
      this.dirtyChunks.add(c.key);
    }
  }

  private removeLight(x: number, y: number, z: number, type: 0 | 1) {
    const q = this.queue;
    q.length = 0;
    const start = this.lightGet(x, y, z, type);
    if (start === 0) return;
    this.lightSet(x, y, z, type, 0);
    const sources: number[] = [];
    q.push(x, y, z, start);
    let head = 0;
    while (head < q.length) {
      const px = q[head++];
      const py = q[head++];
      const pz = q[head++];
      const l = q[head++];
      if (l <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = px + DX[d];
        const ny = py + DY[d];
        const nz = pz + DZ[d];
        if (ny < 0 || ny >= HEIGHT) continue;
        const nl = this.lightGet(nx, ny, nz, type);
        if (nl === 0) continue;
        if (nl < l) {
          this.lightSet(nx, ny, nz, type, 0);
          q.push(nx, ny, nz, nl);
        } else if (!this.opaqueAt(nx, ny, nz)) {
          sources.push(nx, ny, nz, nl);
        }
      }
    }
    for (let i = 0; i < sources.length; i += 4) this.addLight(sources[i], sources[i + 1], sources[i + 2], type, sources[i + 3]);
  }

  private addLight(x: number, y: number, z: number, type: 0 | 1, level: number) {
    if (level <= 0) return;
    const q = this.queue2;
    q.length = 0;
    this.lightSet(x, y, z, type, level);
    q.push(x, y, z, level);
    let head = 0;
    while (head < q.length) {
      const px = q[head++];
      const py = q[head++];
      const pz = q[head++];
      const l = q[head++];
      if (l <= 1) continue;
      for (let d = 0; d < 6; d++) {
        const nx = px + DX[d];
        const ny = py + DY[d];
        const nz = pz + DZ[d];
        if (ny < 0 || ny >= HEIGHT) continue;
        if (this.opaqueAt(nx, ny, nz)) continue;
        const val = type === 0 && l === 15 && d === 3 ? 15 : l - 1;
        if (this.lightGet(nx, ny, nz, type) >= val) continue;
        this.lightSet(nx, ny, nz, type, val);
        q.push(nx, ny, nz, val);
      }
    }
  }

  private queue2: number[] = [];

  /* ---------------- editing ---------------- */

  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 1 || y >= HEIGHT) return false;
    const cx = x >> 4;
    const cz = z >> 4;
    const c = this.ensureChunk(cx, cz);
    if (c.stage < STAGE.LIT) this.computeLight(c);
    const i = idx(x - cx * CHUNK, y, z - cz * CHUNK);
    const old = c.blocks[i];
    if (old === id) return false;
    c.blocks[i] = id;
    // update column cache
    const lx = x - cx * CHUNK;
    const lz = z - cz * CHUNK;
    const ci = lz * CHUNK + lx;
    if (id !== AIR && id !== WATER && y >= c.topY[ci]) {
      c.topY[ci] = y;
      c.topBlock[ci] = id;
    } else if (y === c.topY[ci]) {
      let ty = 0;
      let tb = AIR;
      for (let yy = HEIGHT - 1; yy >= 0; yy--) {
        const b = c.blocks[idx(lx, yy, lz)];
        if (b !== AIR && b !== WATER) {
          ty = yy;
          tb = b;
          break;
        }
      }
      c.topY[ci] = ty;
      c.topBlock[ci] = tb;
    }
    this.relight(x, y, z, old, id);
    this.edits.set(`${x},${y},${z}`, id);
    return true;
  }

  /** player edits, kept so regenerated chunks keep their shape */
  edits = new Map<string, number>();

  applyEdits(c: Chunk) {
    if (this.edits.size === 0) return;
    const ox = c.cx * CHUNK;
    const oz = c.cz * CHUNK;
    for (const [k, id] of this.edits) {
      const p = k.split(",");
      const x = +p[0];
      const y = +p[1];
      const z = +p[2];
      if (x < ox || x >= ox + CHUNK || z < oz || z >= oz + CHUNK) continue;
      c.blocks[idx(x - ox, y, z - oz)] = id;
    }
  }

  /** DDA voxel raycast. Returns hit block + the face normal, or null. */
  raycast(
    ox: number,
    oy: number,
    oz: number,
    dx: number,
    dy: number,
    dz: number,
    maxDist: number,
    skipLiquids = true
  ): { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number } | null {
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1;
    const stepY = dy > 0 ? 1 : -1;
    const stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = dx === 0 ? Infinity : Math.abs(1 / dx);
    const tDeltaY = dy === 0 ? Infinity : Math.abs(1 / dy);
    const tDeltaZ = dz === 0 ? Infinity : Math.abs(1 / dz);
    let tMaxX = dx === 0 ? Infinity : ((dx > 0 ? x + 1 - ox : ox - x) || 1e-9) * tDeltaX;
    let tMaxY = dy === 0 ? Infinity : ((dy > 0 ? y + 1 - oy : oy - y) || 1e-9) * tDeltaY;
    let tMaxZ = dz === 0 ? Infinity : ((dz > 0 ? z + 1 - oz : oz - z) || 1e-9) * tDeltaZ;
    let nx = 0;
    let ny = 0;
    let nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== AIR && !(skipLiquids && id === WATER)) {
        return { x, y, z, nx, ny, nz, id };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX;
        t = tMaxX;
        tMaxX += tDeltaX;
        nx = -stepX;
        ny = 0;
        nz = 0;
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        t = tMaxY;
        tMaxY += tDeltaY;
        nx = 0;
        ny = -stepY;
        nz = 0;
      } else {
        z += stepZ;
        t = tMaxZ;
        tMaxZ += tDeltaZ;
        nx = 0;
        ny = 0;
        nz = -stepZ;
      }
      if (y < -2 || y > HEIGHT + 2) break;
    }
    return null;
  }

  /** highest non-air, non-water block y at a column (searches loaded chunks only) */
  surfaceY(x: number, z: number): number {
    const c = this.getChunk(x >> 4, z >> 4);
    if (!c) return SEA;
    const lx = x - (x >> 4) * CHUNK;
    const lz = z - (z >> 4) * CHUNK;
    return c.topY[lz * CHUNK + lx];
  }

  isWaterAt(x: number, y: number, z: number) {
    return this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === WATER;
  }

  isGroundSolid(x: number, y: number, z: number) {
    const b = this.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return b !== AIR && block(b).solid;
  }

  static isAirLike = isAirLike;
}

const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
