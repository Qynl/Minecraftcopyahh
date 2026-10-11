import * as THREE from "three";
import { AIR, WATER, block } from "./blocks";
import { CHUNK, HEIGHT, hash2, idx } from "./worldgen";
import { Chunk, World } from "./world";
import type { AtlasResult } from "./textures";

/* ------------------------------------------------------------------ */
/* face table                                                          */
/* ------------------------------------------------------------------ */
type Corner = { pos: [number, number, number]; uv: [number, number] };
interface FaceDef {
  dir: [number, number, number];
  corners: Corner[];
  shade: number;
  kind: "side" | "top" | "bottom";
}

export const FACES: FaceDef[] = [
  {
    dir: [-1, 0, 0],
    shade: 0.74,
    kind: "side",
    corners: [
      { pos: [0, 1, 0], uv: [0, 1] },
      { pos: [0, 0, 0], uv: [0, 0] },
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [0, 0, 1], uv: [1, 0] },
    ],
  },
  {
    dir: [1, 0, 0],
    shade: 0.74,
    kind: "side",
    corners: [
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [1, 0, 1], uv: [0, 0] },
      { pos: [1, 1, 0], uv: [1, 1] },
      { pos: [1, 0, 0], uv: [1, 0] },
    ],
  },
  {
    dir: [0, -1, 0],
    shade: 0.5,
    kind: "bottom",
    corners: [
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 0], uv: [1, 1] },
      { pos: [0, 0, 0], uv: [0, 1] },
    ],
  },
  {
    dir: [0, 1, 0],
    shade: 1.0,
    kind: "top",
    corners: [
      { pos: [0, 1, 1], uv: [1, 1] },
      { pos: [1, 1, 1], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 0] },
    ],
  },
  {
    dir: [0, 0, -1],
    shade: 0.62,
    kind: "side",
    corners: [
      { pos: [1, 0, 0], uv: [0, 0] },
      { pos: [0, 0, 0], uv: [1, 0] },
      { pos: [1, 1, 0], uv: [0, 1] },
      { pos: [0, 1, 0], uv: [1, 1] },
    ],
  },
  {
    dir: [0, 0, 1],
    shade: 0.62,
    kind: "side",
    corners: [
      { pos: [0, 0, 1], uv: [0, 0] },
      { pos: [1, 0, 1], uv: [1, 0] },
      { pos: [0, 1, 1], uv: [0, 1] },
      { pos: [1, 1, 1], uv: [1, 1] },
    ],
  },
];

const AO_LEVELS = [0.42, 0.62, 0.82, 1.0];
/** reused scratch so face emission allocates nothing */
const aoScratch = [0, 0, 0, 0];

/* ------------------------------------------------------------------ */
/* fast local accessor over a 3x3 chunk neighbourhood                  */
/* ------------------------------------------------------------------ */
class Local {
  private grid: (Chunk | undefined)[] = [undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined, undefined];

  constructor(world: World, chunk: Chunk) {
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) this.grid[(dx + 1) * 3 + (dz + 1)] = world.getChunk(chunk.cx + dx, chunk.cz + dz);
    this.grid[4] = chunk;
  }

  private chunkAt(lx: number, lz: number) {
    const xi = lx < 0 ? 0 : lx >= CHUNK ? 2 : 1;
    const zi = lz < 0 ? 0 : lz >= CHUNK ? 2 : 1;
    return this.grid[xi * 3 + zi];
  }

  block(lx: number, y: number, lz: number): number {
    if (y < 0) return 1;
    if (y >= HEIGHT) return AIR;
    const c = this.chunkAt(lx, lz);
    if (!c) return AIR;
    return c.blocks[idx(lx & 15, y, lz & 15)];
  }

  solidAO(lx: number, y: number, lz: number): number {
    const b = this.block(lx, y, lz);
    return b !== AIR && block(b).opaque ? 1 : 0;
  }

  sky(lx: number, y: number, lz: number): number {
    if (y >= HEIGHT) return 15;
    if (y < 0) return 0;
    const c = this.chunkAt(lx, lz);
    if (!c) return 15;
    if (c.stage >= 3) return c.sky[idx(lx & 15, y, lz & 15)];
    for (let yy = HEIGHT - 1; yy > y; yy--) if (block(c.blocks[idx(lx & 15, yy, lz & 15)]).opaque) return 0;
    return 15;
  }

  blk(lx: number, y: number, lz: number): number {
    if (y < 0 || y >= HEIGHT) return 0;
    const c = this.chunkAt(lx, lz);
    if (!c || c.stage < 3) return 0;
    return c.blk[idx(lx & 15, y, lz & 15)];
  }
}

/* ------------------------------------------------------------------ */
/* geometry buffers                                                    */
/* ------------------------------------------------------------------ */
class Builder {
  pos: number[] = [];
  uv: number[] = [];
  tint: number[] = [];
  sky: number[] = [];
  blk: number[] = [];
  ao: number[] = [];
  up: number[] = [];
  ind: number[] = [];

  get vertexCount() {
    return this.pos.length / 3;
  }
  get empty() {
    return this.ind.length === 0;
  }

  toGeometry(): THREE.BufferGeometry | null {
    if (this.empty) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute("aTint", new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute("aSky", new THREE.Float32BufferAttribute(this.sky, 1));
    g.setAttribute("aBlock", new THREE.Float32BufferAttribute(this.blk, 1));
    g.setAttribute("aAo", new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute("aUp", new THREE.Float32BufferAttribute(this.up, 1));
    const index = this.vertexCount > 65535 ? new Uint32Array(this.ind) : new Uint16Array(this.ind);
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

export interface ChunkMeshData {
  solid: THREE.BufferGeometry | null;
  cutout: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  water: THREE.BufferGeometry | null;
}

function shouldRenderFace(id: number, nb: number): boolean {
  if (nb === AIR) return true;
  const d = block(id);
  const nd = block(nb);
  if (nd.opaque) return false;
  if (nd.liquid && d.liquid) return false;
  if (nb === id && (d.layer === "trans" || d.layer === "cutout")) return false;
  return true;
}

export function buildChunkGeometry(world: World, chunk: Chunk, atlas: AtlasResult): ChunkMeshData {
  const solid = new Builder();
  const cutout = new Builder();
  const glass = new Builder();
  const water = new Builder();
  const L = new Local(world, chunk);
  const uvOf = atlas.uv;

  // per-column biome foliage tint (smooth noise, no hard biome seams)
  const tintBuf = new Float32Array(CHUNK * CHUNK * 3);
  for (let lz = 0; lz < CHUNK; lz++) {
    for (let lx = 0; lx < CHUNK; lx++) {
      world.gen.foliageTint(chunk.cx * CHUNK + lx, chunk.cz * CHUNK + lz, tintBuf, (lz * CHUNK + lx) * 3);
    }
  }

  for (let y = 0; y < HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      for (let lx = 0; lx < CHUNK; lx++) {
        const i = idx(lx, y, lz);
        const id = chunk.blocks[i];
        if (id === AIR) continue;
        const d = block(id);

        // deterministic subtle colour variation per block
        const hv = hash2(chunk.cx * CHUNK + lx, chunk.cz * CHUNK + lz, y * 7 + 13);
        const vary = 0.955 + hv * 0.09;
        const tintR = d.tint[0] * vary;
        const tintG = d.tint[1] * vary;
        const tintB = d.tint[2] * vary;
        const fo = (lz * CHUNK + lx) * 3;
        const fR = tintBuf[fo];
        const fG = tintBuf[fo + 1];
        const fB = tintBuf[fo + 2];
        const fol = d.foliage;

        const target =
          d.layer === "solid" ? solid : d.layer === "plant" || d.layer === "cutout" ? cutout : id === WATER ? water : glass;

        /* ---------- plants: crossed billboards ---------- */
        if (d.layer === "plant") {
          const uvr = uvOf.get(d.side)!;
          const sCell = L.sky(lx, y, lz) / 15;
          const bCell = L.blk(lx, y, lz) / 15;
          const dirs: [number, number, number, number][] = [
            [0.146, 0.146, 0.854, 0.854],
            [0.854, 0.146, 0.146, 0.854],
          ];
          for (const [x0, z0, x1, z1] of dirs) {
            for (let s = 0; s < 2; s++) {
              const ax = s === 0 ? x0 : x1;
              const az = s === 0 ? z0 : z1;
              const bx = s === 0 ? x1 : x0;
              const bz = s === 0 ? z1 : z0;
              const base = cutout.vertexCount;
              const verts: [number, number, number, number, number][] = [
                [lx + ax, y, lz + az, 0, 0],
                [lx + bx, y, lz + bz, 1, 0],
                [lx + ax, y + 1, lz + az, 0, 1],
                [lx + bx, y + 1, lz + bz, 1, 1],
              ];
              const pR = fol ? tintR * fR : tintR;
              const pG = fol ? tintG * fG : tintG;
              const pB = fol ? tintB * fB : tintB;
              for (const [px, py, pz, u, v] of verts) {
                cutout.pos.push(px, py, pz);
                cutout.uv.push(uvr[0] + (uvr[2] - uvr[0]) * u, uvr[1] + (uvr[3] - uvr[1]) * v);
                cutout.tint.push(pR, pG, pB);
                cutout.sky.push(sCell);
                cutout.blk.push(bCell);
                cutout.ao.push(0.96);
                cutout.up.push(0);
              }
              cutout.ind.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
            }
          }
          continue;
        }

        /* ---------- normal blocks ---------- */
        const waterTopDrop = id === WATER && L.block(lx, y + 1, lz) !== WATER ? -0.1 : 0;

        for (let f = 0; f < 6; f++) {
          const face = FACES[f];
          const nx = lx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = lz + face.dir[2];
          if (!shouldRenderFace(id, L.block(nx, ny, nz))) continue;

          const texKey = face.kind === "top" ? d.top : face.kind === "bottom" ? d.bottom : d.side;
          const uvr = uvOf.get(texKey)!;
          const du = uvr[2] - uvr[0];
          const dv = uvr[3] - uvr[1];

          const normalAxis = face.dir[0] !== 0 ? 0 : face.dir[1] !== 0 ? 1 : 2;
          const t1: number = normalAxis === 0 ? 1 : 0;
          const t2: number = normalAxis === 2 ? 1 : 2;

          const base = target.vertexCount;
          const aos = aoScratch;

          let vR = tintR;
          let vG = tintG;
          let vB = tintB;
          if (fol) {
            const s = fol === 2 ? (face.kind === "top" ? 1 : 0.34) : 1;
            vR *= 1 + (fR - 1) * s;
            vG *= 1 + (fG - 1) * s;
            vB *= 1 + (fB - 1) * s;
          }

          for (let v = 0; v < 4; v++) {
            const corner = face.corners[v];
            const p = corner.pos;
            const o1 = p[t1] === 1 ? 1 : -1;
            const o2 = p[t2] === 1 ? 1 : -1;

            // offsets along the two tangent axes of this face (allocation free)
            const e1x = t1 === 0 ? o1 : 0;
            const e1y = t1 === 1 ? o1 : 0;
            const e1z = t1 === 2 ? o1 : 0;
            const e2x = t2 === 0 ? o2 : 0;
            const e2y = t2 === 1 ? o2 : 0;
            const e2z = t2 === 2 ? o2 : 0;
            const ax = nx + e1x;
            const ay = ny + e1y;
            const az = nz + e1z;
            const bx = nx + e2x;
            const by = ny + e2y;
            const bz = nz + e2z;
            const cx2 = nx + e1x + e2x;
            const cy2 = ny + e1y + e2y;
            const cz2 = nz + e1z + e2z;

            const s1 = L.solidAO(ax, ay, az);
            const s2 = L.solidAO(bx, by, bz);
            const sc = L.solidAO(cx2, cy2, cz2);
            const aoIdx = s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
            aos[v] = AO_LEVELS[aoIdx];

            // smooth lighting: average of the 4 cells around this vertex
            const skySum = L.sky(nx, ny, nz) + L.sky(ax, ay, az) + L.sky(bx, by, bz) + L.sky(cx2, cy2, cz2);
            const blkSum = L.blk(nx, ny, nz) + L.blk(ax, ay, az) + L.blk(bx, by, bz) + L.blk(cx2, cy2, cz2);

            const py = y + p[1] + (p[1] === 1 ? waterTopDrop : 0);
            target.pos.push(lx + p[0], py, lz + p[2]);
            target.uv.push(uvr[0] + du * corner.uv[0], uvr[1] + dv * corner.uv[1]);
            target.tint.push(vR, vG, vB);
            target.sky.push(skySum / 60);
            target.blk.push(blkSum / 60);
            target.ao.push(aos[v] * face.shade);
            target.up.push(id === WATER && p[1] === 1 ? 1 : 0);
          }

          if (aos[0] + aos[3] > aos[1] + aos[2]) {
            target.ind.push(base, base + 1, base + 3, base, base + 3, base + 2);
          } else {
            target.ind.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
          }
        }
      }
    }
  }

  return {
    solid: solid.toGeometry(),
    cutout: cutout.toGeometry(),
    glass: glass.toGeometry(),
    water: water.toGeometry(),
  };
}
