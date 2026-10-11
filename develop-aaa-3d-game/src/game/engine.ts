import * as THREE from "three";
import { Chunk, STAGE, World } from "./world";
import { BIOME_NAME, CHUNK, HEIGHT, SEA } from "./worldgen";
import { buildChunkGeometry } from "./mesher";
import { ART, CELL, COLS, PAD, buildAtlas, type AtlasResult } from "./textures";
import { sfx } from "./audio";
import { AIR, CRYSTAL_ORE, GOLD_ORE, GRAVEL, LAMP, SNOW, SNOW_GRASS, WATER, block } from "./blocks";

export interface Settings {
  renderDistance: number;
  fov: number;
  sensitivity: number;
  bob: boolean;
  volume: number;
  dayLength: number;
}

export const DEFAULT_SETTINGS: Settings = {
  renderDistance: 6,
  fov: 76,
  sensitivity: 1,
  bob: true,
  volume: 0.7,
  dayLength: 600,
};

export interface Hud {
  x: number;
  y: number;
  z: number;
  fps: number;
  biome: string;
  clock: string;
  dayFactor: number;
  timeOfDay: number;
  chunks: number;
  tris: number;
  mode: string;
  underwater: boolean;
  breaking: number;
  breakingName: string;
  targetName: string;
  selected: number;
  hotbar: number[];
  mined: number;
  placed: number;
  depth: number;
  light: number;
  distance: string;
  seed: string;
  weather: number;
  weatherIntensity: number;
  flash: number;
  intro: number;
  unlocked: string[];
  heading: number;
}

export interface Callbacks {
  onHud: (h: Hud) => void;
  onHotbar: (items: number[], selected: number) => void;
  onLock: (locked: boolean) => void;
  onToast: (title: string, sub?: string) => void;
  onProgress: (p: number, label: string) => void;
  onInventory: (open: boolean) => void;
  onImpact: (strength: number) => void;
  onDiscovery: (title: string, sub: string, got: number, total: number) => void;
}

export const DISCOVERIES: { id: string; title: string; sub: string }[] = [
  { id: "first", title: "Loose Brick", sub: "Mine your first block" },
  { id: "miner50", title: "Hands of Stone", sub: "Mine 50 blocks" },
  { id: "miner250", title: "Mountain Eater", sub: "Mine 250 blocks" },
  { id: "build32", title: "Apprentice Builder", sub: "Place 32 blocks" },
  { id: "build256", title: "World Shaper", sub: "Place 256 blocks" },
  { id: "fly", title: "Aviator", sub: "Leave the ground behind" },
  { id: "deep", title: "Into the Dark", sub: "Descend below y = 10" },
  { id: "cave", title: "Spelunker", sub: "Stand in a sunless cavern" },
  { id: "peak", title: "Summiteer", sub: "Climb above the snow line" },
  { id: "ocean", title: "Mariner", sub: "Swim in the open ocean" },
  { id: "crystal", title: "Crystal Hunter", sub: "Mine crystal ore" },
  { id: "gold", title: "Gold Rush", sub: "Mine gold ore" },
  { id: "night", title: "Night Owl", sub: "Stand beneath the midnight sky" },
  { id: "dawn", title: "Dawn Chorus", sub: "Watch the sun come up" },
  { id: "storm", title: "Storm Chaser", sub: "Weather a thunderstorm" },
  { id: "frost", title: "Frostbitten", sub: "Walk into the frozen north" },
  { id: "desert", title: "Sandwalker", sub: "Cross the amber desert" },
  { id: "forest", title: "Among Giants", sub: "Wander the deep forest" },
  { id: "pilgrim", title: "Pilgrim", sub: "Set foot in five biomes" },
  { id: "lamp", title: "Lamplighter", sub: "Place a sun lamp" },
];

/* ================================================================== */
/* shaders                                                             */
/* ================================================================== */

const TERRAIN_VERT = /* glsl */ `
attribute float aSky;
attribute float aBlock;
attribute float aAo;
attribute vec3 aTint;
attribute float aUp;

uniform float uTime;
uniform float uSkyLight;
uniform vec3 uSunTint;
uniform vec3 uTorchTint;
uniform vec3 uAmbient;

varying vec2 vUv;
varying vec3 vLight;
varying vec3 vTint;
varying float vDist;
varying float vUp;
varying vec3 vWorld;

void main() {
  vUv = uv;
  vTint = aTint;
  vUp = aUp;

  vec4 wp = modelMatrix * vec4(position, 1.0);
#ifdef WATER
  if (aUp > 0.5) {
    wp.y += sin(wp.x * 0.62 + uTime * 1.7) * 0.035 + cos(wp.z * 0.53 - uTime * 1.35) * 0.035;
  }
#endif
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = -mv.z;

  float sun = aSky * uSkyLight;
  float torch = pow(clamp(aBlock, 0.0, 1.0), 1.25);
  vec3 light = sun * uSunTint * 0.92 + torch * uTorchTint * 1.06 + uAmbient;
  vLight = light * aAo;

  gl_Position = projectionMatrix * mv;
}
`;

const TERRAIN_FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform float uSkyLight;
uniform float uAlphaScale;
uniform float uSea;

varying vec2 vUv;
varying vec3 vLight;
varying vec3 vTint;
varying float vDist;
varying float vUp;
varying vec3 vWorld;

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec4 tex = texture2D(uAtlas, vUv);
#ifdef ALPHA_TEST
  if (tex.a < 0.5) discard;
#endif
  vec3 col = tex.rgb * vTint * vLight;
  float alphaOut = tex.a * uAlphaScale;

#ifdef WATER
  float depth = clamp((uSea + 0.6 - vWorld.y) / 15.0, 0.0, 1.0);
  col *= mix(vec3(0.6, 0.95, 1.12), vec3(0.05, 0.19, 0.4), depth);
  float sparkle = sin(vWorld.x * 1.7 + uTime * 2.1) * sin(vWorld.z * 1.4 - uTime * 1.7);
  col += pow(max(sparkle, 0.0), 12.0) * 0.75 * uSkyLight * vUp * (1.0 - depth * 0.85);
  float ripple = sin(vWorld.x * 2.3 + uTime * 2.6) * 0.5 + sin(vWorld.z * 2.7 - uTime * 2.1) * 0.5;
  float foam = smoothstep(0.72, 0.98, ripple) * vUp;
  col += foam * 0.4 * (0.35 + uSkyLight);
  alphaOut *= 0.74 + depth * 0.46;
#endif

  float f = smoothstep(uFogNear, uFogFar, vDist);
  col = mix(col, aces(uFogColor * 1.15), clamp(f, 0.0, 1.0));
  gl_FragColor = vec4(col, clamp(alphaOut, 0.0, 1.0));
  #include <colorspace_fragment>
}
`;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunCol;
uniform vec3 uSunDir;
uniform float uNight;
uniform float uTime;
varying vec3 vDir;

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h + 0.015, 0.0, 1.0), 0.52));
  col = mix(col * 0.42, col, smoothstep(-0.32, 0.01, h));

  vec3 sd = normalize(uSunDir);
  float s = max(dot(d, sd), 0.0);
  col += uSunCol * pow(s, 900.0) * 12.0;
  col += uSunCol * pow(s, 40.0) * 0.55;
  col += uSunCol * pow(s, 6.0) * 0.12;

  // moon with a soft cratered disc
  float m = max(dot(d, -sd), 0.0);
  float disc = smoothstep(0.99925, 0.99955, m);
  float craters = 0.82 + 0.18 * hash13(floor(d * 900.0));
  col += vec3(0.86, 0.9, 1.0) * disc * craters * (0.35 + uNight * 1.3);
  col += vec3(0.35, 0.44, 0.62) * pow(m, 900.0) * uNight * 0.5;

  // procedural stars
  vec3 g = d * 260.0;
  vec3 id = floor(g);
  vec3 f = fract(g) - 0.5;
  float r = hash13(id);
  if (r > 0.9955 && uNight > 0.02) {
    float dd = length(f);
    float star = smoothstep(0.42, 0.0, dd);
    float tw = 0.55 + 0.45 * sin(uTime * 2.3 + r * 220.0);
    vec3 sc = mix(vec3(0.75, 0.84, 1.0), vec3(1.0, 0.92, 0.78), hash13(id + 3.1));
    col += sc * star * tw * uNight * 1.6;
  }

  gl_FragColor = vec4(aces(col * 1.15), 1.0);
  #include <colorspace_fragment>
}
`;

const PARTICLE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aAlpha;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vColor = aColor;
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (340.0 / max(0.2, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`;

const PARTICLE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
void main() {
  if (vAlpha <= 0.001) discard;
  gl_FragColor = vec4(vColor, vAlpha);
  #include <colorspace_fragment>
}
`;

/* ================================================================== */
/* game                                                                */
/* ================================================================== */

interface MeshSet {
  solid?: THREE.Mesh;
  cutout?: THREE.Mesh;
  glass?: THREE.Mesh;
  water?: THREE.Mesh;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export class Game {
  canvas: HTMLCanvasElement;
  cb: Callbacks;
  settings: Settings = { ...DEFAULT_SETTINGS };

  renderer!: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera!: THREE.PerspectiveCamera;
  world!: World;
  atlas!: AtlasResult;
  tileColors = new Map<string, THREE.Color>();

  private uniforms!: Record<string, THREE.IUniform>;
  private matSolid!: THREE.ShaderMaterial;
  private matCutout!: THREE.ShaderMaterial;
  private matGlass!: THREE.ShaderMaterial;
  private matWater!: THREE.ShaderMaterial;
  private matHandSolid!: THREE.ShaderMaterial;
  private matHandCutout!: THREE.ShaderMaterial;

  private meshMap = new Map<number, MeshSet>();
  private chunkGroup = new THREE.Group();

  private skyMesh!: THREE.Mesh;
  private cloudMesh!: THREE.Mesh;
  private cloudMat!: THREE.MeshBasicMaterial;

  private highlight!: THREE.LineSegments;
  private crackMesh!: THREE.Mesh;
  private crackMats: THREE.MeshBasicMaterial[] = [];

  private handGroup = new THREE.Group();
  private handMesh: THREE.Mesh | null = null;
  private handId = -1;

  private ghost: THREE.Mesh | null = null;
  private ghostId = -1;
  private matGhost!: THREE.MeshBasicMaterial;

  private particles!: THREE.Points;
  private pPos!: Float32Array;
  private pCol!: Float32Array;
  private pSize!: Float32Array;
  private pAlpha!: Float32Array;
  private pVel!: Float32Array;
  private pLife!: Float32Array;
  private pMax!: Float32Array;
  private pCursor = 0;
  private readonly PMAX = 900;

  private fireflies!: THREE.Points;
  private fBase!: Float32Array;
  private fPhase!: Float32Array;

  private birds!: THREE.LineSegments;
  private birdMat!: THREE.LineBasicMaterial;
  private birdData: { phase: number; r: number; y: number; sp: number }[] = [];

  /* weather */
  weather = { kind: 0, intensity: 0, target: 0, timer: 60, flash: 0, boltIn: 14, sheltered: false };
  private rain!: THREE.LineSegments;
  private rainPos!: Float32Array;
  private rainMat!: THREE.LineBasicMaterial;
  private snow!: THREE.Points;
  private snowPos!: Float32Array;
  private snowAlpha!: Float32Array;
  private snowPhase!: Float32Array;
  private readonly RAIN_N = 1200;
  private readonly SNOW_N = 620;

  /* cinematic intro */
  intro = 0;
  readonly INTRO_LEN = 4.4;
  private introFrom = new THREE.Vector3();

  /* discoveries */
  unlocked = new Set<string>();
  private biomesSeen = new Set<number>();
  private oresMined = new Set<number>();
  private discoveryTimer = 0;
  private swimTimer = 0;

  /* player state */
  pos = new THREE.Vector3(8, SEA + 20, 8);
  vel = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  onGround = false;
  flying = false;
  sprinting = false;
  sneaking = false;
  inWater = false;
  headUnderwater = false;
  private bobPhase = 0;
  private bobAmount = 0;
  private swingT = 1;
  private lastSpaceTap = -1;
  private stepDist = 0;
  private fallStart = 0;
  private falling = false;

  /* input */
  keys = new Set<string>();
  mouseDown = [false, false, false];
  locked = false;
  paused = true;
  attract = true;
  private hasEntered = false;

  /* interaction */
  hotbar: number[] = [1, 3, 9, 10, 11, 23, 12, 8, 5];
  selected = 0;
  private target: { x: number; y: number; z: number; nx: number; ny: number; nz: number; id: number } | null = null;
  private breakProgress = 0;
  private breakKey = "";
  private clickBoost = false;
  private hitSoundTimer = 0;
  private placeCooldown = 0;

  /* world state */
  timeOfDay = 0.3;
  seedLabel = "";
  stats = { mined: 0, placed: 0, distance: 0 };
  private fps = 60;
  private frameAcc = 0;
  private frameCount = 0;
  private hudTimer = 0;
  private loadList: { cx: number; cz: number; d: number }[] = [];
  private loadPcx = 99999;
  private loadPcz = 99999;
  private raf = 0;
  private lastT = 0;
  private disposed = false;
  private time = 0;

  spawn = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, cb: Callbacks) {
    this.canvas = canvas;
    this.cb = cb;
  }

  /* ---------------------------------------------------------------- */
  /* setup                                                             */
  /* ---------------------------------------------------------------- */

  async prepare(seed: number, settings: Partial<Settings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.cb.onProgress(0.02, "Painting textures");
    await nextFrame();
    if (this.disposed) return;

    this.atlas = buildAtlas();
    this.computeTileColors();

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x87ceeb, 1);
    this.renderer.autoClear = true;

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.06, 4000);
    this.camera.rotation.order = "YXZ";
    this.scene.add(this.camera);
    this.scene.add(this.chunkGroup);

    this.buildMaterials();
    this.buildSky();
    this.buildHelpers();
    this.buildParticles();
    this.buildWeather();

    this.world = new World(seed);
    await this.generateInitial(3);
    if (this.disposed) return;

    this.findSpawn();
    this.bindEvents();
    this.cb.onProgress(1, "Ready");
    this.lastT = performance.now();
    this.loop();
  }

  private computeTileColors() {
    const ctx = this.atlas.canvas.getContext("2d")!;
    for (const [key, i] of this.atlas.index) {
      const sx = (i % COLS) * CELL + PAD;
      const sy = Math.floor(i / COLS) * CELL + PAD;
      const d = ctx.getImageData(sx, sy, ART, ART).data;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let p = 0; p < d.length; p += 4) {
        if (d[p + 3] < 40) continue;
        r += d[p];
        g += d[p + 1];
        b += d[p + 2];
        n++;
      }
      if (n === 0) n = 1;
      const col = new THREE.Color(r / n / 255, g / n / 255, b / n / 255);
      col.convertSRGBToLinear();
      this.tileColors.set(key, col);
    }
  }

  private tileTexture(key: string): THREE.Texture {
    const i = this.atlas.index.get(key) ?? 0;
    const sx = (i % COLS) * CELL + PAD;
    const sy = Math.floor(i / COLS) * CELL + PAD;
    const c = document.createElement("canvas");
    c.width = ART;
    c.height = ART;
    const ctx = c.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.atlas.canvas, sx, sy, ART, ART, 0, 0, ART, ART);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    return t;
  }

  private buildMaterials() {
    const tex = new THREE.CanvasTexture(this.atlas.canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestMipmapLinearFilter;
    tex.generateMipmaps = true;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    tex.needsUpdate = true;

    this.uniforms = {
      uAtlas: { value: tex },
      uTime: { value: 0 },
      uSkyLight: { value: 1 },
      uSunTint: { value: new THREE.Color(1, 0.98, 0.94) },
      uTorchTint: { value: new THREE.Color(1.0, 0.72, 0.42) },
      uAmbient: { value: new THREE.Color(0.16, 0.18, 0.24) },
      uFogColor: { value: new THREE.Color(0.62, 0.76, 0.9) },
      uFogNear: { value: 30 },
      uFogFar: { value: 110 },
      uAlphaScale: { value: 1 },
      uSea: { value: SEA },
    };

    const mk = (defines: Record<string, string | number>, opts: Partial<THREE.ShaderMaterialParameters> = {}) =>
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: TERRAIN_VERT,
        fragmentShader: TERRAIN_FRAG,
        defines,
        ...opts,
      });

    this.matSolid = mk({});
    this.matCutout = mk({ ALPHA_TEST: 1 }, { side: THREE.DoubleSide });
    this.matGlass = mk({}, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.matWater = mk({ WATER: 1 }, { transparent: true, depthWrite: false, side: THREE.DoubleSide });
    this.matHandSolid = mk({}, { depthTest: false });
    this.matHandCutout = mk({ ALPHA_TEST: 1 }, { depthTest: false, side: THREE.DoubleSide });
  }

  private buildSky() {
    const skyGeo = new THREE.SphereGeometry(1500, 40, 24);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(0.12, 0.34, 0.72) },
        uHorizon: { value: new THREE.Color(0.66, 0.8, 0.94) },
        uSunCol: { value: new THREE.Color(1, 0.86, 0.6) },
        uSunDir: { value: new THREE.Vector3(0, 1, 0) },
        uNight: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.renderOrder = -1000;
    this.skyMesh.frustumCulled = false;
    this.scene.add(this.skyMesh);

    // clouds
    const cc = document.createElement("canvas");
    cc.width = 256;
    cc.height = 256;
    const cctx = cc.getContext("2d")!;
    const img = cctx.createImageData(256, 256);
    const noise = new (class {
      v(x: number, y: number) {
        const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        return s - Math.floor(s);
      }
      smooth(x: number, y: number) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = x - xi;
        const yf = y - yi;
        const u = xf * xf * (3 - 2 * xf);
        const w = yf * yf * (3 - 2 * yf);
        const a = this.v(xi, yi);
        const b = this.v(xi + 1, yi);
        const c = this.v(xi, yi + 1);
        const d = this.v(xi + 1, yi + 1);
        return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
      }
      fbm(x: number, y: number) {
        let s = 0;
        let a = 0.5;
        let f = 1;
        for (let i = 0; i < 5; i++) {
          s += this.smooth(x * f, y * f) * a;
          a *= 0.5;
          f *= 2.03;
        }
        return s;
      }
    })();
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 256; x++) {
        const n = noise.fbm(x / 42, y / 42);
        const a = Math.max(0, Math.min(1, (n - 0.46) * 3.4));
        const i = (y * 256 + x) * 4;
        const shade = 210 + n * 90;
        img.data[i] = Math.min(255, shade);
        img.data[i + 1] = Math.min(255, shade);
        img.data[i + 2] = Math.min(255, shade + 8);
        img.data[i + 3] = a * 235;
      }
    }
    cctx.putImageData(img, 0, 0);
    const ctex = new THREE.CanvasTexture(cc);
    ctex.wrapS = ctex.wrapT = THREE.RepeatWrapping;
    ctex.repeat.set(7, 7);
    ctex.anisotropy = 4;
    ctex.colorSpace = THREE.SRGBColorSpace;
    this.cloudMat = new THREE.MeshBasicMaterial({
      map: ctex,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
      side: THREE.DoubleSide,
    });
    this.cloudMesh = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), this.cloudMat);
    this.cloudMesh.rotation.x = -Math.PI / 2;
    this.cloudMesh.position.y = 168;
    this.cloudMesh.renderOrder = -900;
    this.cloudMesh.frustumCulled = false;
    this.scene.add(this.cloudMesh);
  }

  private buildHelpers() {
    // block highlight
    const box = new THREE.BoxGeometry(1.004, 1.004, 1.004);
    const edges = new THREE.EdgesGeometry(box);
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x0a0a0a, transparent: true, opacity: 0.55, depthTest: true })
    );
    this.highlight.visible = false;
    this.highlight.renderOrder = 5;
    this.scene.add(this.highlight);

    // crack overlay
    for (let s = 1; s <= 4; s++) {
      this.crackMats.push(
        new THREE.MeshBasicMaterial({
          map: this.tileTexture(`crack${s}`),
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
          opacity: 0.85,
        })
      );
    }
    this.crackMesh = new THREE.Mesh(new THREE.BoxGeometry(1.012, 1.012, 1.012), this.crackMats[0]);
    this.crackMesh.visible = false;
    this.crackMesh.renderOrder = 6;
    this.scene.add(this.crackMesh);

    // translucent placement preview
    this.matGhost = new THREE.MeshBasicMaterial({
      map: this.uniforms.uAtlas.value as THREE.Texture,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    });

    this.camera.add(this.handGroup);
    this.handGroup.position.set(0.46, -0.42, -0.72);
  }

  private buildParticles() {
    this.pPos = new Float32Array(this.PMAX * 3);
    this.pCol = new Float32Array(this.PMAX * 3);
    this.pSize = new Float32Array(this.PMAX);
    this.pAlpha = new Float32Array(this.PMAX);
    this.pVel = new Float32Array(this.PMAX * 3);
    this.pLife = new Float32Array(this.PMAX);
    this.pMax = new Float32Array(this.PMAX);
    for (let i = 0; i < this.PMAX; i++) this.pPos[i * 3 + 1] = -9999;

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute("aColor", new THREE.BufferAttribute(this.pCol, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(this.pSize, 1));
    g.setAttribute("aAlpha", new THREE.BufferAttribute(this.pAlpha, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uFogColor: this.uniforms.uFogColor, uFogNear: this.uniforms.uFogNear, uFogFar: this.uniforms.uFogFar },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.particles = new THREE.Points(g, m);
    this.particles.frustumCulled = false;
    this.scene.add(this.particles);

    // fireflies
    const N = 90;
    const fp = new Float32Array(N * 3);
    const fc = new Float32Array(N * 3);
    const fs = new Float32Array(N);
    const fa = new Float32Array(N);
    this.fBase = new Float32Array(N * 3);
    this.fPhase = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.fBase[i * 3] = (Math.random() - 0.5) * 44;
      this.fBase[i * 3 + 1] = Math.random() * 6;
      this.fBase[i * 3 + 2] = (Math.random() - 0.5) * 44;
      this.fPhase[i] = Math.random() * Math.PI * 2;
      fc[i * 3] = 1;
      fc[i * 3 + 1] = 0.92;
      fc[i * 3 + 2] = 0.45;
      fs[i] = 0.09;
      fa[i] = 0;
      fp[i * 3 + 1] = -9999;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute("position", new THREE.BufferAttribute(fp, 3));
    fg.setAttribute("aColor", new THREE.BufferAttribute(fc, 3));
    fg.setAttribute("aSize", new THREE.BufferAttribute(fs, 1));
    fg.setAttribute("aAlpha", new THREE.BufferAttribute(fa, 1));
    const fm = new THREE.ShaderMaterial({
      uniforms: { uFogColor: this.uniforms.uFogColor, uFogNear: this.uniforms.uFogNear, uFogFar: this.uniforms.uFogFar },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.fireflies = new THREE.Points(fg, fm);
    this.fireflies.frustumCulled = false;
    this.scene.add(this.fireflies);

    // birds: little flapping silhouettes wheeling above the terrain by day
    const BIRDS = 11;
    const bp = new Float32Array(BIRDS * 12);
    const bg = new THREE.BufferGeometry();
    bg.setAttribute("position", new THREE.BufferAttribute(bp, 3).setUsage(THREE.DynamicDrawUsage));
    this.birdMat = new THREE.LineBasicMaterial({ color: 0x141c28, transparent: true, opacity: 0.8, fog: false });
    this.birds = new THREE.LineSegments(bg, this.birdMat);
    this.birds.frustumCulled = false;
    this.scene.add(this.birds);
    for (let i = 0; i < BIRDS; i++) {
      this.birdData.push({
        phase: Math.random() * Math.PI * 2,
        r: 16 + Math.random() * 26,
        y: 14 + Math.random() * 16,
        sp: 0.1 + Math.random() * 0.13,
      });
    }
  }

  private buildWeather() {
    // rain: short streak lines in a box that follows the camera
    const N = this.RAIN_N;
    this.rainPos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      this.rainPos[i * 6 + 1] = -9999;
      this.rainPos[i * 6 + 4] = -9999;
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute("position", new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xbcd8f2,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.rain = new THREE.LineSegments(rg, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 8;
    this.rain.visible = false;
    this.scene.add(this.rain);

    // snow: slow drifting flakes
    const S = this.SNOW_N;
    this.snowPos = new Float32Array(S * 3);
    this.snowAlpha = new Float32Array(S);
    this.snowPhase = new Float32Array(S);
    const sc = new Float32Array(S * 3);
    const ss = new Float32Array(S);
    for (let i = 0; i < S; i++) {
      this.snowPos[i * 3 + 1] = -9999;
      this.snowPhase[i] = Math.random() * Math.PI * 2;
      sc[i * 3] = 1;
      sc[i * 3 + 1] = 1;
      sc[i * 3 + 2] = 1;
      ss[i] = 0.055 + Math.random() * 0.05;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(this.snowPos, 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute("aColor", new THREE.BufferAttribute(sc, 3));
    sg.setAttribute("aSize", new THREE.BufferAttribute(ss, 1));
    sg.setAttribute("aAlpha", new THREE.BufferAttribute(this.snowAlpha, 1));
    const sm = new THREE.ShaderMaterial({
      uniforms: { uFogColor: this.uniforms.uFogColor, uFogNear: this.uniforms.uFogNear, uFogFar: this.uniforms.uFogFar },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.snow = new THREE.Points(sg, sm);
    this.snow.frustumCulled = false;
    this.snow.renderOrder = 8;
    this.snow.visible = false;
    this.scene.add(this.snow);
  }

  private pickWeather() {
    const c = this.world.getChunk(Math.floor(this.pos.x) >> 4, Math.floor(this.pos.z) >> 4);
    let biome = 2;
    if (c && c.stage >= STAGE.DECORATED) {
      const lx = Math.floor(this.pos.x) - c.cx * CHUNK;
      const lz = Math.floor(this.pos.z) - c.cz * CHUNK;
      biome = c.biome[lz * CHUNK + lx];
    }
    const r = Math.random();
    let kind = 0;
    if (biome === 5 || biome === 7) kind = r < 0.5 ? 3 : 0;
    else if (biome === 6) kind = r < 0.34 ? 3 : r < 0.5 ? 1 : 0;
    else if (biome === 4) kind = r < 0.06 ? 1 : 0;
    else if (r < 0.3) kind = 1;
    else if (r < 0.42) kind = 2;
    this.weather.kind = kind;
    this.weather.target = kind === 0 ? 0 : kind === 2 ? 0.75 + Math.random() * 0.25 : 0.45 + Math.random() * 0.45;
    this.weather.timer =
      kind === 0 ? 90 + Math.random() * 160 : kind === 2 ? 35 + Math.random() * 40 : 55 + Math.random() * 110;
    this.weather.boltIn = 4 + Math.random() * 14;
    if (kind !== 0) {
      this.cb.onToast(kind === 3 ? "Snowfall" : kind === 2 ? "Thunderstorm rolling in" : "Rain", undefined);
    }
  }

  private updateWeather(dt: number) {
    const w = this.weather;
    w.timer -= dt;
    if (w.timer <= 0) this.pickWeather();
    const rate = w.target > w.intensity ? 0.09 : 0.14;
    w.intensity += (w.target - w.intensity) * Math.min(1, rate * dt * 4);
    if (Math.abs(w.target - w.intensity) < 0.004) w.intensity = w.target;

    // sheltered?
    const sky = this.world.getSky(
      Math.floor(this.pos.x),
      Math.floor(this.pos.y + 1.7),
      Math.floor(this.pos.z)
    );
    w.sheltered = sky < 12 && !this.headUnderwater;

    const i = w.intensity;
    const rainOn = (w.kind === 1 || w.kind === 2) && i > 0.03 && !this.headUnderwater;
    const snowOn = w.kind === 3 && i > 0.03 && !this.headUnderwater;
    this.rain.visible = rainOn;
    this.snow.visible = snowOn;
    this.rainMat.opacity = rainOn ? (w.sheltered ? 0.16 : 0.4) * i : 0;

    const cx = this.camera.position.x;
    const cy = this.camera.position.y;
    const cz = this.camera.position.z;
    const R = 15;

    if (rainOn) {
      const p = this.rainPos;
      const fall = (16 + i * 16) * dt;
      for (let n = 0; n < this.RAIN_N; n++) {
        const o = n * 6;
        let y = p[o + 1];
        if (y < -900) {
          // spawn
          p[o] = cx + (Math.random() - 0.5) * R * 2;
          p[o + 2] = cz + (Math.random() - 0.5) * R * 2;
          y = cy + 4 + Math.random() * 18;
        }
        y -= fall;
        const wind = w.kind === 2 ? 3.4 : 1.1;
        p[o] += wind * dt;
        p[o + 2] += wind * 0.35 * dt;
        const hx = Math.floor(p[o]);
        const hy = Math.floor(y);
        const hz = Math.floor(p[o + 2]);
        const hit = this.world.isGroundSolid(hx, hy, hz) || y < cy - 14;
        if (hit) {
          p[o] = cx + (Math.random() - 0.5) * R * 2;
          p[o + 2] = cz + (Math.random() - 0.5) * R * 2;
          y = cy + 6 + Math.random() * 16;
        }
        const len = 0.5 + i * 0.45;
        p[o + 1] = y;
        p[o + 3] = p[o] - wind * 0.045;
        p[o + 4] = y - len;
        p[o + 5] = p[o + 2] - wind * 0.016;
      }
      this.rain.geometry.getAttribute("position").needsUpdate = true;
    }

    if (snowOn) {
      const p = this.snowPos;
      const a = this.snowAlpha;
      for (let n = 0; n < this.SNOW_N; n++) {
        const o = n * 3;
        this.snowPhase[n] += dt * (0.7 + (n % 7) * 0.11);
        let y = p[o + 1];
        if (y < -900) {
          p[o] = cx + (Math.random() - 0.5) * R * 2;
          p[o + 2] = cz + (Math.random() - 0.5) * R * 2;
          y = cy + 3 + Math.random() * 16;
        }
        y -= (1.1 + i * 1.5) * dt;
        p[o] += Math.sin(this.snowPhase[n]) * 0.5 * dt;
        p[o + 2] += Math.cos(this.snowPhase[n] * 0.8) * 0.5 * dt;
        if (this.world.isGroundSolid(Math.floor(p[o]), Math.floor(y), Math.floor(p[o + 2])) || y < cy - 12) {
          p[o] = cx + (Math.random() - 0.5) * R * 2;
          p[o + 2] = cz + (Math.random() - 0.5) * R * 2;
          y = cy + 4 + Math.random() * 15;
        }
        p[o + 1] = y;
        a[n] = w.sheltered ? 0.25 * i : 0.85 * i;
      }
      this.snow.geometry.getAttribute("position").needsUpdate = true;
      this.snow.geometry.getAttribute("aAlpha").needsUpdate = true;
    }

    // lightning
    if (w.flash > 0) w.flash = Math.max(0, w.flash - dt * 3.4);
    if (w.kind === 2 && w.intensity > 0.35) {
      w.boltIn -= dt;
      if (w.boltIn <= 0) {
        w.boltIn = 5 + Math.random() * 20;
        w.flash = 1;
        const near = Math.random() > 0.45;
        window.setTimeout(() => sfx.thunder(near), near ? 120 : 900 + Math.random() * 1600);
      }
    }
  }

  private updateBirds(dayF: number) {
    const show = dayF > 0.42 && !this.headUnderwater;
    this.birds.visible = show;
    if (!show) return;
    const arr = this.birds.geometry.getAttribute("position").array as Float32Array;
    const t = this.time;
    for (let i = 0; i < this.birdData.length; i++) {
      const b = this.birdData[i];
      const a = t * b.sp + b.phase;
      const cx = this.pos.x + Math.cos(a) * b.r;
      const cz = this.pos.z + Math.sin(a * 1.17) * b.r;
      const surf = this.world.surfaceY(Math.floor(cx), Math.floor(cz));
      const cy = Math.max(surf, SEA) + b.y + Math.sin(t * 0.55 + b.phase) * 1.6;
      const dx = -Math.sin(a) * b.r * b.sp;
      const dz = Math.cos(a * 1.17) * b.r * b.sp * 1.17;
      const l = Math.hypot(dx, dz) || 1;
      const wx = (dz / l) * 0.72;
      const wz = (-dx / l) * 0.72;
      const flap = Math.sin(t * 7.5 + b.phase * 4) * 0.34;
      const o = i * 12;
      arr[o] = cx - wx;
      arr[o + 1] = cy + flap;
      arr[o + 2] = cz - wz;
      arr[o + 3] = cx;
      arr[o + 4] = cy;
      arr[o + 5] = cz;
      arr[o + 6] = cx;
      arr[o + 7] = cy;
      arr[o + 8] = cz;
      arr[o + 9] = cx + wx;
      arr[o + 10] = cy + flap;
      arr[o + 11] = cz + wz;
    }
    this.birds.geometry.getAttribute("position").needsUpdate = true;
    this.birdMat.opacity = Math.min(0.85, (dayF - 0.42) * 2.2);
  }

  /* ---------------------------------------------------------------- */
  /* initial world                                                     */
  /* ---------------------------------------------------------------- */

  private async generateInitial(radius: number) {
    const list: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -radius; dz <= radius; dz++)
      for (let dx = -radius; dx <= radius; dx++) {
        const d = dx * dx + dz * dz;
        if (d <= radius * radius + radius) list.push({ cx: dx, cz: dz, d });
      }
    list.sort((a, b) => a.d - b.d);

    for (let i = 0; i < list.length; i++) {
      this.world.ensureChunk(list[i].cx, list[i].cz);
      if (i % 5 === 0) {
        this.cb.onProgress(0.1 + (i / list.length) * 0.45, "Carving terrain");
        await nextFrame();
        if (this.disposed) return;
      }
    }
    for (let i = 0; i < list.length; i++) {
      const c = this.world.getChunk(list[i].cx, list[i].cz)!;
      if (c.stage < STAGE.LIT) this.world.computeLight(c);
      if (i % 5 === 0) {
        this.cb.onProgress(0.55 + (i / list.length) * 0.2, "Casting light");
        await nextFrame();
        if (this.disposed) return;
      }
    }
    for (let i = 0; i < list.length; i++) {
      const c = this.world.getChunk(list[i].cx, list[i].cz)!;
      this.remesh(c);
      if (i % 4 === 0) {
        this.cb.onProgress(0.75 + (i / list.length) * 0.24, "Building meshes");
        await nextFrame();
        if (this.disposed) return;
      }
    }
  }

  /** rebuild everything with a new seed, reusing renderer / materials */
  async resetWorld(seed: number, settings: Partial<Settings> = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.cb.onProgress(0.04, "Collapsing old world");
    for (const [, set] of this.meshMap) {
      for (const m of Object.values(set)) {
        if (!m) continue;
        this.chunkGroup.remove(m);
        m.geometry.dispose();
      }
    }
    this.meshMap.clear();
    this.world = new World(seed);
    this.stats = { mined: 0, placed: 0, distance: 0 };
    this.hasEntered = false;
    this.unlocked.clear();
    this.biomesSeen.clear();
    this.oresMined.clear();
    this.weather.kind = 0;
    this.weather.intensity = 0;
    this.weather.target = 0;
    this.weather.timer = 55;
    this.weather.flash = 0;
    this.intro = 0;
    this.attract = true;
    this.paused = true;
    this.timeOfDay = 0.3;
    this.time = 0;
    this.loadPcx = 99999;
    this.loadPcz = 99999;
    this.loadList = [];
    this.breakProgress = 0;
    this.breakKey = "";
    this.clickBoost = false;
    if (this.ghost) this.ghost.visible = false;
    this.crackMesh.visible = false;
    this.highlight.visible = false;
    this.pLife.fill(0);
    this.pAlpha.fill(0);
    this.vel.set(0, 0, 0);
    this.flying = false;
    await nextFrame();
    if (this.disposed) return;
    await this.generateInitial(3);
    if (this.disposed) return;
    this.findSpawn();
    this.rebuildLoadList();
    this.camera.position.copy(this.spawn);
    this.cb.onProgress(1, "Ready");
  }

  private findSpawn() {
    for (let r = 0; r < 9; r++) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(Math.cos(ang) * r * 4);
        const z = Math.round(Math.sin(ang) * r * 4);
        const c = this.world.getChunk(x >> 4, z >> 4);
        if (!c || c.stage < STAGE.DECORATED) continue;
        const lx = x - (x >> 4) * CHUNK;
        const lz = z - (z >> 4) * CHUNK;
        const ty = c.topY[lz * CHUNK + lx];
        const tb = c.topBlock[lz * CHUNK + lx];
        if (ty > SEA + 1 && tb !== WATER && tb !== AIR) {
          this.pos.set(x + 0.5, ty + 1.2, z + 0.5);
          this.spawn.copy(this.pos);
          this.vel.set(0, 0, 0);
          return;
        }
      }
    }
    // fallback: highest dry column of the spawn chunk
    const c = this.world.getChunk(0, 0);
    let bestY = -1;
    let bestX = 8;
    let bestZ = 8;
    if (c) {
      for (let i = 0; i < CHUNK * CHUNK; i++) {
        if (c.topBlock[i] !== WATER && c.topBlock[i] !== AIR && c.topY[i] > SEA && c.topY[i] > bestY) {
          bestY = c.topY[i];
          bestX = i % CHUNK;
          bestZ = (i / CHUNK) | 0;
        }
      }
    }
    this.pos.set(bestX + 0.5, Math.max(SEA + 2, bestY + 1.2), bestZ + 0.5);
    this.spawn.copy(this.pos);
  }

  /* ---------------------------------------------------------------- */
  /* chunk streaming                                                   */
  /* ---------------------------------------------------------------- */

  private rebuildLoadList() {
    const R = this.settings.renderDistance;
    const pcx = Math.floor(this.pos.x / CHUNK);
    const pcz = Math.floor(this.pos.z / CHUNK);
    this.loadPcx = pcx;
    this.loadPcz = pcz;
    const list: { cx: number; cz: number; d: number }[] = [];
    for (let dz = -R; dz <= R; dz++) {
      for (let dx = -R; dx <= R; dx++) {
        const d = dx * dx + dz * dz;
        if (d > R * R + R) continue;
        list.push({ cx: pcx + dx, cz: pcz + dz, d });
      }
    }
    list.sort((a, b) => a.d - b.d);
    this.loadList = list;
  }

  private neighborsReady(c: Chunk, needLit: boolean) {
    const offs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const R = this.settings.renderDistance + 0.5;
    for (const [dx, dz] of offs) {
      const nx = c.cx + dx;
      const nz = c.cz + dz;
      // neighbours outside the loaded disc will never arrive — don't wait for them
      const ddx = nx - this.loadPcx;
      const ddz = nz - this.loadPcz;
      if (ddx * ddx + ddz * ddz > R * R) continue;
      const n = this.world.getChunk(nx, nz);
      if (!n) return false;
      if (needLit ? n.stage < STAGE.LIT : n.stage < STAGE.DECORATED) return false;
    }
    return true;
  }

  private streamChunks(budgetMs: number) {
    const t0 = performance.now();
    const list = this.loadList;
    // 1. terrain
    for (let i = 0; i < list.length; i++) {
      if (performance.now() - t0 > budgetMs) return;
      const it = list[i];
      const c = this.world.getChunk(it.cx, it.cz);
      if (!c || c.stage < STAGE.DECORATED) {
        this.world.ensureChunk(it.cx, it.cz);
        if (performance.now() - t0 > budgetMs * 0.5) return;
      }
    }
    // 2. light
    for (let i = 0; i < list.length; i++) {
      if (performance.now() - t0 > budgetMs) return;
      const it = list[i];
      const c = this.world.getChunk(it.cx, it.cz)!;
      if (c.stage !== STAGE.DECORATED) continue;
      if (!this.neighborsReady(c, false)) continue;
      this.world.computeLight(c);
    }
    // 3. mesh
    for (let i = 0; i < list.length; i++) {
      if (performance.now() - t0 > budgetMs) return;
      const it = list[i];
      const c = this.world.getChunk(it.cx, it.cz)!;
      if (c.stage < STAGE.LIT || !c.dirty) continue;
      if (!this.neighborsReady(c, true)) continue;
      this.remesh(c);
    }
    // 4. periodically shed chunks that fell out of range (keeps memory flat)
    this.unloadTimer += (performance.now() - t0) / 1000;
    if (this.unloadTimer > 1.5 || this.world.chunks.size > 420) {
      this.unloadTimer = 0;
      const R = this.settings.renderDistance + 3;
      const pcx = Math.floor(this.pos.x / CHUNK);
      const pcz = Math.floor(this.pos.z / CHUNK);
      for (const [key, c] of this.world.chunks) {
        const dx = c.cx - pcx;
        const dz = c.cz - pcz;
        if (dx * dx + dz * dz > R * R) this.dropChunk(key);
      }
    }
  }

  private unloadTimer = 0;

  private dropChunk(key: number) {
    const set = this.meshMap.get(key);
    if (set) {
      for (const m of Object.values(set)) {
        if (!m) continue;
        this.chunkGroup.remove(m);
        m.geometry.dispose();
      }
      this.meshMap.delete(key);
    }
    this.world.chunks.delete(key);
    this.world.dirtyChunks.delete(key);
  }

  private remesh(c: Chunk) {
    const data = buildChunkGeometry(this.world, c, this.atlas);
    const key = c.key;
    let set = this.meshMap.get(key);
    if (!set) {
      set = {};
      this.meshMap.set(key, set);
    }
    const ox = c.cx * CHUNK;
    const oz = c.cz * CHUNK;
    const layers: [keyof MeshSet, THREE.BufferGeometry | null, THREE.Material, number][] = [
      ["solid", data.solid, this.matSolid, 0],
      ["cutout", data.cutout, this.matCutout, 1],
      ["glass", data.glass, this.matGlass, 2],
      ["water", data.water, this.matWater, 3],
    ];
    for (const [name, geo, mat, order] of layers) {
      const existing = set[name];
      if (!geo) {
        if (existing) {
          this.chunkGroup.remove(existing);
          existing.geometry.dispose();
          delete set[name];
        }
        continue;
      }
      if (existing) {
        existing.geometry.dispose();
        existing.geometry = geo;
        existing.material = mat;
      } else {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(ox, 0, oz);
        m.renderOrder = order;
        m.matrixAutoUpdate = true;
        this.chunkGroup.add(m);
        set[name] = m;
      }
    }
    c.dirty = false;
    this.world.dirtyChunks.delete(key);
  }

  /* ---------------------------------------------------------------- */
  /* events                                                            */
  /* ---------------------------------------------------------------- */

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "Tab" || (e.code === "Space" && this.locked)) e.preventDefault();
    if (this.keys.has(e.code)) return;
    this.keys.add(e.code);
    if (!this.locked) return; // gameplay keys only apply while the pointer is captured
    if (this.intro > 0) {
      this.skipIntro();
      return;
    }

    if (e.code === "Space") {
      const now = performance.now();
      if (now - this.lastSpaceTap < 280) {
        this.setFlying(!this.flying);
      }
      this.lastSpaceTap = now;
    }
    if (e.code.startsWith("Digit")) {
      const n = parseInt(e.code.slice(5), 10);
      if (n >= 1 && n <= 9) this.selectSlot(n - 1);
    }
    if (e.code === "KeyF") this.setFlying(!this.flying);
    if (e.code === "KeyE") {
      this.cb.onInventory(true);
      document.exitPointerLock?.();
    }
    if (e.code === "KeyR") this.respawn();
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onMouseMove = (e: MouseEvent) => {
    if (!this.locked || this.paused) return;
    const s = 0.0022 * this.settings.sensitivity;
    this.yaw -= e.movementX * s;
    this.pitch -= e.movementY * s;
    const lim = Math.PI / 2 - 0.012;
    if (this.pitch > lim) this.pitch = lim;
    if (this.pitch < -lim) this.pitch = -lim;
  };

  private onMouseDown = (e: MouseEvent) => {
    if (e.target !== this.canvas) return;
    if (!this.locked) {
      if (!this.paused) this.requestLock();
      return;
    }
    if (this.intro > 0) {
      this.skipIntro();
      return;
    }
    this.mouseDown[e.button] = true;
    if (e.button === 0) {
      this.swingT = 0;
      this.clickBoost = true;
      this.updateTarget();
      if (this.target) this.breakKey = `${this.target.x},${this.target.y},${this.target.z}`;
      this.tryBreak(false);
    } else if (e.button === 2) {
      this.placeBlock();
    } else if (e.button === 1) {
      this.pickBlock();
      e.preventDefault();
    }
  };

  private onMouseUp = (e: MouseEvent) => {
    this.mouseDown[e.button] = false;
    if (e.button === 0) {
      this.breakProgress = 0;
      this.breakKey = "";
      this.crackMesh.visible = false;
    }
  };

  private onWheel = (e: WheelEvent) => {
    if (!this.locked) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    this.selectSlot((this.selected + dir + 9) % 9);
  };

  private onContext = (e: Event) => e.preventDefault();

  private onLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.mouseDown[0] = this.mouseDown[1] = this.mouseDown[2] = false;
      this.breakProgress = 0;
      this.crackMesh.visible = false;
      this.keys.clear();
    }
    this.cb.onLock(this.locked);
  };

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  private bindEvents() {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("mousemove", this.onMouseMove);
    window.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("wheel", this.onWheel, { passive: true });
    window.addEventListener("resize", this.onResize);
    window.addEventListener("contextmenu", this.onContext);
    document.addEventListener("pointerlockchange", this.onLockChange);
  }

  requestLock() {
    sfx.init();
    const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
    if (p && typeof p.catch === "function") p.catch(() => undefined);
  }

  private unbindEvents() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    window.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("wheel", this.onWheel);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("contextmenu", this.onContext);
    document.removeEventListener("pointerlockchange", this.onLockChange);
  }

  /* ---------------------------------------------------------------- */
  /* public API                                                        */
  /* ---------------------------------------------------------------- */

  selectSlot(i: number) {
    if (i === this.selected) return;
    this.selected = i;
    this.handId = -1;
    sfx.ui(true);
    this.cb.onHotbar([...this.hotbar], this.selected);
  }

  setHotbarSlot(i: number, id: number) {
    this.hotbar[i] = id;
    this.handId = -1;
    this.cb.onHotbar([...this.hotbar], this.selected);
    sfx.ui(true);
  }

  setFlying(v: boolean) {
    this.flying = v;
    this.vel.y = 0;
    this.cb.onToast(v ? "Flight enabled" : "Flight disabled", v ? "SPACE up · SHIFT down" : "Gravity restored");
    sfx.ui(v);
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.falling = false;
    this.cb.onToast("Returned to spawn");
  }

  setSensitivity(v: number) {
    this.settings.sensitivity = v;
  }
  setFov(v: number) {
    this.settings.fov = v;
    this.camera.fov = v;
    this.camera.updateProjectionMatrix();
  }
  setRenderDistance(v: number) {
    this.settings.renderDistance = v;
    this.loadPcx = 99999;
  }
  setBob(v: boolean) {
    this.settings.bob = v;
  }
  setTimeOfDay(v: number) {
    this.timeOfDay = v;
  }
  screenshot() {
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `cubefall-${Date.now()}.png`;
    a.click();
    this.cb.onToast("Screenshot saved");
  }

  drawMinimap(canvas: HTMLCanvasElement, size = 132, zoom = 1) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !this.world) return;
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
    ctx.clearRect(0, 0, size, size);
    const px = this.pos.x;
    const pz = this.pos.z;
    const range = (size / 2) * zoom;
    const img = ctx.createImageData(size, size);
    for (let sy = 0; sy < size; sy++) {
      for (let sx = 0; sx < size; sx++) {
        const wx = Math.floor(px + (sx - size / 2) * (range / (size / 2)));
        const wz = Math.floor(pz + (sy - size / 2) * (range / (size / 2)));
        const c = this.world.getChunk(wx >> 4, wz >> 4);
        let r = 12,
          g = 18,
          b = 28;
        if (c && c.stage >= STAGE.DECORATED) {
          const lx = wx - (wx >> 4) * CHUNK;
          const lz = wz - (wz >> 4) * CHUNK;
          const ci = lz * CHUNK + lx;
          const id = c.topBlock[ci];
          const hgt = c.topY[ci];
          if (id === WATER || hgt < SEA) {
            const depth = Math.max(0, SEA - hgt);
            r = 30 - Math.min(20, depth);
            g = 88 - Math.min(40, depth * 2);
            b = 168 - Math.min(50, depth * 2);
          } else if (id !== AIR) {
            const key = block(id).top;
            const col = this.tileColors.get(key);
            if (col) {
              const sh = 0.55 + Math.min(0.5, (hgt - SEA + 12) / 60);
              r = Math.min(255, col.r * 255 * sh);
              g = Math.min(255, col.g * 255 * sh);
              b = Math.min(255, col.b * 255 * sh);
            }
          }
        }
        const i = (sy * size + sx) * 4;
        img.data[i] = r;
        img.data[i + 1] = g;
        img.data[i + 2] = b;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // player arrow
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(-this.yaw);
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "rgba(0,0,0,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  /* ---------------------------------------------------------------- */
  /* interaction                                                       */
  /* ---------------------------------------------------------------- */

  private eyePos(out: THREE.Vector3) {
    return out.set(this.pos.x, this.pos.y + (this.sneaking ? 1.44 : 1.62), this.pos.z);
  }

  private lookDir(out: THREE.Vector3) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).normalize();
  }

  private updateTarget() {
    const eye = this.eyePos(new THREE.Vector3());
    const dir = this.lookDir(new THREE.Vector3());
    this.target = this.world.raycast(eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, 5.6);
    if (this.target) {
      this.highlight.visible = true;
      this.highlight.position.set(this.target.x + 0.5, this.target.y + 0.5, this.target.z + 0.5);
    } else {
      this.highlight.visible = false;
      this.crackMesh.visible = false;
    }
    this.updateGhost();
  }

  private canPlaceAt(x: number, y: number, z: number, id: number): boolean {
    if (y < 1 || y >= HEIGHT) return false;
    const existing = this.world.getBlock(x, y, z);
    if (existing !== AIR && existing !== WATER) return false;
    const def = block(id);
    if (!def.solid) return true;
    const px = this.pos.x;
    const py = this.pos.y;
    const pz = this.pos.z;
    if (px + 0.3 > x && px - 0.3 < x + 1 && pz + 0.3 > z && pz - 0.3 < z + 1 && py + 1.8 > y && py < y + 1) return false;
    return true;
  }

  private updateGhost() {
    const t = this.target;
    const id = this.hotbar[this.selected];
    if (!t || !id || this.attract || this.intro > 0 || !this.locked) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    if (!this.canPlaceAt(x, y, z, id)) {
      if (this.ghost) this.ghost.visible = false;
      return;
    }
    if (this.ghostId !== id) {
      this.ghostId = id;
      if (this.ghost) {
        this.scene.remove(this.ghost);
        this.ghost.geometry.dispose();
        this.ghost = null;
      }
      const geo = this.buildHeldGeometry(id, 1.002);
      if (geo) {
        const def = block(id);
        this.matGhost.color.setRGB(def.tint[0], def.tint[1], def.tint[2]);
        this.ghost = new THREE.Mesh(geo, this.matGhost);
        this.ghost.renderOrder = 7;
        this.scene.add(this.ghost);
      }
    }
    if (!this.ghost) return;
    this.ghost.position.set(x + 0.5, y + 0.5, z + 0.5);
    this.ghost.visible = true;
    this.matGhost.opacity = 0.3 + Math.sin(this.time * 5.5) * 0.09;
  }

  private tryBreak(instant: boolean) {
    const t = this.target;
    if (!t) return;
    const def = block(t.id);
    if (!def.breakable) {
      if (this.clickBoost) sfx.deny();
      this.clickBoost = false;
      return;
    }
    const key = `${t.x},${t.y},${t.z}`;
    if (key !== this.breakKey) {
      this.breakKey = key;
      this.breakProgress = 0;
    }
    if (this.clickBoost) {
      this.breakProgress += 0.42;
      this.clickBoost = false;
    }
    void instant;
    const need = Math.max(0.05, def.hardness * 0.2);
    this.breakProgress += 1 / 60 / need;
    this.hitSoundTimer -= 1 / 60;
    if (this.hitSoundTimer <= 0) {
      this.hitSoundTimer = 0.19;
      sfx.hit(def.sound);
      this.spawnDust(t.x, t.y, t.z, def, 2);
    }
    const stage = Math.min(3, Math.floor(this.breakProgress * 4));
    this.crackMesh.visible = true;
    this.crackMesh.position.set(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    this.crackMesh.material = this.crackMats[stage];
    if (this.breakProgress >= 1) {
      this.breakProgress = 0;
      this.breakKey = "";
      this.doBreak(t);
    }
  }

  private doBreak(t: { x: number; y: number; z: number; id: number }) {
    const def = block(t.id);
    this.world.setBlock(t.x, t.y, t.z, AIR);
    this.stats.mined++;
    this.oresMined.add(t.id);
    sfx.breakBlock(def.sound);
    this.spawnDust(t.x, t.y, t.z, def, 16);
    this.crackMesh.visible = false;
    this.swingT = 0;
    this.updateTarget();
  }

  private placeBlock() {
    const t = this.target;
    if (!t) return;
    if (this.placeCooldown > 0) return;
    const id = this.hotbar[this.selected];
    if (!id) return;
    const x = t.x + t.nx;
    const y = t.y + t.ny;
    const z = t.z + t.nz;
    const def = block(id);
    if (!this.canPlaceAt(x, y, z, id)) {
      sfx.deny();
      return;
    }
    this.world.setBlock(x, y, z, id);
    this.stats.placed++;
    if (id === LAMP) this.unlock("lamp");
    this.placeCooldown = 0.16;
    sfx.place(def.sound);
    this.swingT = 0;
    this.spawnDust(x, y, z, def, 5);
    this.updateTarget();
  }

  private pickBlock() {
    const t = this.target;
    if (!t) return;
    const existing = this.hotbar.indexOf(t.id);
    if (existing >= 0) this.selectSlot(existing);
    else this.setHotbarSlot(this.selected, t.id);
  }

  private spawnDust(x: number, y: number, z: number, def: ReturnType<typeof block>, count: number) {
    const key = def.layer === "plant" ? def.side : def.side;
    const col = this.tileColors.get(key) ?? new THREE.Color(0.6, 0.6, 0.6);
    for (let i = 0; i < count; i++) {
      const p = this.pCursor;
      this.pCursor = (this.pCursor + 1) % this.PMAX;
      this.pPos[p * 3] = x + 0.15 + Math.random() * 0.7;
      this.pPos[p * 3 + 1] = y + 0.15 + Math.random() * 0.7;
      this.pPos[p * 3 + 2] = z + 0.15 + Math.random() * 0.7;
      const sp = 1.4 + Math.random() * 2.2;
      const a = Math.random() * Math.PI * 2;
      this.pVel[p * 3] = Math.cos(a) * sp * 0.55;
      this.pVel[p * 3 + 1] = 1.4 + Math.random() * sp;
      this.pVel[p * 3 + 2] = Math.sin(a) * sp * 0.55;
      const v = 0.82 + Math.random() * 0.36;
      this.pCol[p * 3] = col.r * v * def.tint[0];
      this.pCol[p * 3 + 1] = col.g * v * def.tint[1];
      this.pCol[p * 3 + 2] = col.b * v * def.tint[2];
      this.pSize[p] = 0.06 + Math.random() * 0.09;
      this.pAlpha[p] = 1;
      this.pMax[p] = 0.55 + Math.random() * 0.7;
      this.pLife[p] = this.pMax[p];
    }
  }

  /** soft low-velocity puff (footsteps, placement) */
  private puff(x: number, y: number, z: number, def: ReturnType<typeof block>, count: number) {
    const col = this.tileColors.get(def.side) ?? new THREE.Color(0.6, 0.6, 0.6);
    for (let i = 0; i < count; i++) {
      const p = this.pCursor;
      this.pCursor = (this.pCursor + 1) % this.PMAX;
      this.pPos[p * 3] = x + (Math.random() - 0.5) * 0.55;
      this.pPos[p * 3 + 1] = y;
      this.pPos[p * 3 + 2] = z + (Math.random() - 0.5) * 0.55;
      const a = Math.random() * Math.PI * 2;
      this.pVel[p * 3] = Math.cos(a) * 0.55;
      this.pVel[p * 3 + 1] = 0.35 + Math.random() * 0.75;
      this.pVel[p * 3 + 2] = Math.sin(a) * 0.55;
      const v = 0.85 + Math.random() * 0.3;
      this.pCol[p * 3] = col.r * v * def.tint[0];
      this.pCol[p * 3 + 1] = col.g * v * def.tint[1];
      this.pCol[p * 3 + 2] = col.b * v * def.tint[2];
      this.pSize[p] = 0.035 + Math.random() * 0.05;
      this.pAlpha[p] = 0.8;
      this.pMax[p] = 0.4 + Math.random() * 0.35;
      this.pLife[p] = this.pMax[p];
    }
  }

  private updateParticles(dt: number) {
    for (let i = 0; i < this.PMAX; i++) {
      if (this.pLife[i] <= 0) {
        if (this.pAlpha[i] !== 0) this.pAlpha[i] = 0;
        continue;
      }
      this.pLife[i] -= dt;
      const g = this.world.isWaterAt(this.pPos[i * 3], this.pPos[i * 3 + 1], this.pPos[i * 3 + 2]) ? 4 : 22;
      this.pVel[i * 3 + 1] -= g * dt;
      this.pVel[i * 3] *= 1 - 1.6 * dt;
      this.pVel[i * 3 + 2] *= 1 - 1.6 * dt;
      const nx = this.pPos[i * 3] + this.pVel[i * 3] * dt;
      const ny = this.pPos[i * 3 + 1] + this.pVel[i * 3 + 1] * dt;
      const nz = this.pPos[i * 3 + 2] + this.pVel[i * 3 + 2] * dt;
      if (this.world.isGroundSolid(nx, this.pPos[i * 3 + 1], this.pPos[i * 3 + 2])) this.pVel[i * 3] *= -0.3;
      else this.pPos[i * 3] = nx;
      if (this.world.isGroundSolid(this.pPos[i * 3], ny, this.pPos[i * 3 + 2])) {
        this.pVel[i * 3 + 1] *= -0.28;
        this.pVel[i * 3] *= 0.7;
        this.pVel[i * 3 + 2] *= 0.7;
      } else this.pPos[i * 3 + 1] = ny;
      if (this.world.isGroundSolid(this.pPos[i * 3], this.pPos[i * 3 + 1], nz)) this.pVel[i * 3 + 2] *= -0.3;
      else this.pPos[i * 3 + 2] = nz;
      const k = Math.max(0, this.pLife[i] / this.pMax[i]);
      this.pAlpha[i] = k > 0.5 ? 1 : k * 2;
      if (this.pLife[i] <= 0) this.pAlpha[i] = 0;
    }
    const g = this.particles.geometry;
    (g.getAttribute("position") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aColor") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aSize") as THREE.BufferAttribute).needsUpdate = true;
    (g.getAttribute("aAlpha") as THREE.BufferAttribute).needsUpdate = true;
  }

  private updateFireflies(dt: number, night: number) {
    const pos = this.fireflies.geometry.getAttribute("position") as THREE.BufferAttribute;
    const alpha = this.fireflies.geometry.getAttribute("aAlpha") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const N = this.fPhase.length;
    for (let i = 0; i < N; i++) {
      this.fPhase[i] += dt * (0.4 + (i % 5) * 0.12);
      const ph = this.fPhase[i];
      arr[i * 3] = this.pos.x + this.fBase[i * 3] + Math.sin(ph * 0.7) * 2.4;
      const groundY = this.world.surfaceY(Math.floor(arr[i * 3]), Math.floor(this.pos.z + this.fBase[i * 3 + 2]));
      arr[i * 3 + 1] = groundY + 1.2 + this.fBase[i * 3 + 1] * 0.55 + Math.sin(ph * 1.3) * 0.7;
      arr[i * 3 + 2] = this.pos.z + this.fBase[i * 3 + 2] + Math.cos(ph * 0.62) * 2.4;
      const blink = Math.max(0, Math.sin(ph * 2.1 + i));
      alpha.array[i] = night * (0.25 + blink * 0.75);
    }
    pos.needsUpdate = true;
    alpha.needsUpdate = true;
  }

  /* ---------------------------------------------------------------- */
  /* physics                                                           */
  /* ---------------------------------------------------------------- */

  private collides(x: number, y: number, z: number): boolean {
    const r = 0.3;
    const h = 1.8;
    const x0 = Math.floor(x - r);
    const x1 = Math.floor(x + r);
    const y0 = Math.floor(y);
    const y1 = Math.floor(y + h - 0.001);
    const z0 = Math.floor(z - r);
    const z1 = Math.floor(z + r);
    for (let yy = y0; yy <= y1; yy++)
      for (let zz = z0; zz <= z1; zz++)
        for (let xx = x0; xx <= x1; xx++) {
          const b = this.world.getBlock(xx, yy, zz);
          if (b !== AIR && block(b).solid) return true;
        }
    return false;
  }

  private updatePlayer(dt: number) {
    const k = this.keys;
    const forward = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0);
    const strafe = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    this.sneaking = k.has("ShiftLeft") || k.has("ShiftRight");
    this.sprinting = (k.has("ControlLeft") || k.has("KeyC")) && forward > 0 && !this.sneaking;

    const feetInWater = this.world.isWaterAt(this.pos.x, this.pos.y + 0.35, this.pos.z);
    this.headUnderwater = this.world.isWaterAt(this.pos.x, this.pos.y + 1.62, this.pos.z);
    const wasInWater = this.inWater;
    this.inWater = feetInWater;
    if (feetInWater && !wasInWater && Math.abs(this.vel.y) > 4) sfx.splash();

    // desired horizontal direction
    const sinY = Math.sin(this.yaw);
    const cosY = Math.cos(this.yaw);
    let wx = -sinY * forward + cosY * strafe;
    let wz = -cosY * forward - sinY * strafe;
    const len = Math.hypot(wx, wz);
    if (len > 0.0001) {
      wx /= len;
      wz /= len;
    }

    let speed = this.sneaking ? 1.7 : this.sprinting ? 6.6 : 4.5;
    let accel = this.onGround ? 42 : 12;
    if (this.flying) {
      speed = this.sprinting ? 34 : this.sneaking ? 6 : 14;
      accel = this.onGround ? 60 : 60;
    }
    if (feetInWater && !this.flying) {
      speed *= 0.52;
      accel *= 0.6;
    }

    const targetVx = wx * speed;
    const targetVz = wz * speed;
    this.vel.x += (targetVx - this.vel.x) * Math.min(1, accel * dt * 0.28);
    this.vel.z += (targetVz - this.vel.z) * Math.min(1, accel * dt * 0.28);

    // vertical
    if (this.flying) {
      let vy = 0;
      if (k.has("Space")) vy += speed;
      if (this.sneaking) vy -= speed;
      this.vel.y += (vy - this.vel.y) * Math.min(1, 12 * dt);
    } else if (feetInWater) {
      this.vel.y -= 12 * dt;
      if (this.vel.y < -3.4) this.vel.y = -3.4;
      if (k.has("Space")) this.vel.y = 3.6;
      this.vel.x *= 1 - 1.2 * dt;
      this.vel.z *= 1 - 1.2 * dt;
    } else {
      this.vel.y -= 27 * dt;
      if (this.vel.y < -58) this.vel.y = -58;
      if (k.has("Space") && this.onGround) {
        this.vel.y = 8.6;
        this.onGround = false;
        sfx.jump();
      }
    }

    // integrate with collisions + step assist
    const prevY = this.pos.y;
    this.moveAxis(0, this.vel.x * dt);
    this.moveAxis(2, this.vel.z * dt);
    const hitGroundBefore = this.onGround;
    this.onGround = false;
    this.moveAxis(1, this.vel.y * dt);

    // step assist: if we bumped into something while grounded, try stepping up
    if (!this.flying && hitGroundBefore && (Math.abs(this.vel.x) < 0.2 || Math.abs(this.vel.z) < 0.2)) {
      const want = new THREE.Vector3(this.pos.x + wx * 0.35, this.pos.y, this.pos.z + wz * 0.35);
      if (len > 0.001 && this.collides(want.x, want.y, want.z) && !this.collides(want.x, want.y + 0.62, want.z)) {
        const testY = this.pos.y + 0.62;
        if (!this.collides(this.pos.x, testY, this.pos.z)) {
          this.pos.y = testY;
        }
      }
    }

    // footsteps
    const hspeed = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hspeed > 1.2) {
      this.stepDist += hspeed * dt;
      const stride = this.sprinting ? 2.1 : 2.5;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const bx = Math.floor(this.pos.x);
        const by = Math.floor(this.pos.y - 0.2);
        const bz = Math.floor(this.pos.z);
        const below = this.world.getBlock(bx, by, bz);
        sfx.step(below !== AIR ? block(below).sound : "dirt");
        if (below !== AIR) {
          const def = block(below);
          if (def.sound === "sand" || def.sound === "dirt" || below === SNOW || below === SNOW_GRASS || below === GRAVEL) {
            this.puff(bx + 0.5, this.pos.y + 0.06, bz + 0.5, def, 3);
          }
        }
      }
    }

    // fall damage-ish feedback (no health in creative, just juice)
    if (!this.onGround && !this.flying && !feetInWater) {
      if (!this.falling) {
        this.falling = true;
        this.fallStart = prevY;
      }
    } else if (this.falling) {
      const d = this.fallStart - this.pos.y;
      if (d > 1.2) sfx.land(Math.min(1, d / 9));
      if (d > 4) this.cb.onImpact(Math.min(1, (d - 4) / 12));
      this.falling = false;
    }

    // view bob
    const targetBob = this.onGround && hspeed > 0.6 && !this.flying ? Math.min(1, hspeed / 5) : 0;
    this.bobAmount += (targetBob - this.bobAmount) * Math.min(1, dt * 8);
    this.bobPhase += dt * hspeed * 1.55;

    this.stats.distance += hspeed * dt;

    // keep inside the world vertically
    if (this.pos.y < -8) {
      this.pos.y = HEIGHT + 2;
      this.vel.y = 0;
    }
    if (this.pos.y > HEIGHT + 30) {
      this.pos.y = HEIGHT + 30;
      this.vel.y = Math.min(0, this.vel.y);
    }
  }

  private moveAxis(axis: 0 | 1 | 2, amount: number) {
    if (amount === 0) return;
    const steps = Math.min(8, Math.max(1, Math.ceil(Math.abs(amount) / 0.2)));
    const stepAmt = amount / steps;
    const test = new THREE.Vector3();
    for (let s = 0; s < steps; s++) {
      const before = axis === 0 ? this.pos.x : axis === 1 ? this.pos.y : this.pos.z;
      const next = before + stepAmt;
      test.set(this.pos.x, this.pos.y, this.pos.z);
      if (axis === 0) test.x = next;
      else if (axis === 1) test.y = next;
      else test.z = next;

      if (this.collides(test.x, test.y, test.z)) {
        if (axis === 1) {
          this.vel.y = 0;
          let snap: number;
          if (stepAmt < 0) {
            snap = Math.floor(next) + 1;
            this.onGround = true;
          } else {
            snap = Math.floor(next + 1.8 - 0.001) - 1.8;
          }
          if (!this.collides(this.pos.x, snap, this.pos.z)) this.pos.y = snap;
        } else if (axis === 0) {
          this.pos.x = before;
          this.vel.x = 0;
        } else {
          this.pos.z = before;
          this.vel.z = 0;
        }
        return;
      }
      if (axis === 0) this.pos.x = next;
      else if (axis === 1) this.pos.y = next;
      else this.pos.z = next;
    }
  }

  /* ---------------------------------------------------------------- */
  /* held item                                                         */
  /* ---------------------------------------------------------------- */

  private buildHeldGeometry(id: number, size = 0): THREE.BufferGeometry | null {
    const def = block(id);
    if (!def || id === AIR) return null;
    const plant = def.layer === "plant";
    const s = size > 0 ? size : plant ? 0.34 : 0.26;
    const h = size > 0 ? size : plant ? 0.39 : 0.26;
    const geo = new THREE.BoxGeometry(s, h, s);
    // remap box UVs to the atlas tiles (order: +x,-x,+y,-y,+z,-z)
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    const keys = [def.side, def.side, def.top, def.bottom, def.side, def.side];
    for (let f = 0; f < 6; f++) {
      const uvr = this.atlas.uv.get(keys[f])!;
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        const u0 = uv.getX(i);
        const v0 = uv.getY(i);
        uv.setXY(i, uvr[0] + (uvr[2] - uvr[0]) * u0, uvr[1] + (uvr[3] - uvr[1]) * v0);
      }
    }
    uv.needsUpdate = true;
    const n = uv.count;
    const tint = new Float32Array(n * 3);
    const sky = new Float32Array(n);
    const blk = new Float32Array(n);
    const ao = new Float32Array(n);
    const up = new Float32Array(n);
    const pos = geo.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < n; i++) {
      tint[i * 3] = def.tint[0];
      tint[i * 3 + 1] = def.tint[1];
      tint[i * 3 + 2] = def.tint[2];
      sky[i] = 0.92;
      blk[i] = 0.25;
      const py = pos.getY(i);
      ao[i] = py > 0 ? 1 : py < -h / 2 + 0.001 ? 0.62 : 0.82;
      up[i] = 0;
    }
    geo.setAttribute("aTint", new THREE.BufferAttribute(tint, 3));
    geo.setAttribute("aSky", new THREE.BufferAttribute(sky, 1));
    geo.setAttribute("aBlock", new THREE.BufferAttribute(blk, 1));
    geo.setAttribute("aAo", new THREE.BufferAttribute(ao, 1));
    geo.setAttribute("aUp", new THREE.BufferAttribute(up, 1));
    return geo;
  }

  private updateHeld(dt: number) {
    const id = this.hotbar[this.selected];
    if (id !== this.handId) {
      this.handId = id;
      if (this.handMesh) {
        this.handGroup.remove(this.handMesh);
        this.handMesh.geometry.dispose();
        this.handMesh = null;
      }
      const geo = this.buildHeldGeometry(id);
      if (geo) {
        const def = block(id);
        const mat = def.layer === "plant" || def.layer === "cutout" ? this.matHandCutout : this.matHandSolid;
        this.handMesh = new THREE.Mesh(geo, mat);
        this.handMesh.renderOrder = 999;
        this.handGroup.add(this.handMesh);
      }
    }
    this.swingT = Math.min(1, this.swingT + dt * 4.6);
    const sw = Math.sin(this.swingT * Math.PI);
    const swing = this.swingT < 1 ? sw : 0;
    const bob = this.settings.bob
      ? Math.sin(this.bobPhase * 2) * 0.022 * this.bobAmount
      : 0;
    const bob2 = this.settings.bob ? Math.cos(this.bobPhase) * 0.02 * this.bobAmount : 0;
    this.handGroup.position.set(
      0.44 - swing * 0.1 + bob2,
      -0.4 + swing * 0.16 - Math.abs(bob),
      -0.68 - swing * 0.14
    );
    this.handGroup.rotation.set(
      -0.14 + swing * 0.85 + (this.sneaking ? 0.1 : 0),
      0.62 - swing * 0.5,
      swing * 0.28 + (this.sprinting ? -0.18 : 0)
    );
    void dt;
  }

  /* ---------------------------------------------------------------- */
  /* main loop                                                         */
  /* ---------------------------------------------------------------- */

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    if (dt > 0.12) dt = 0.12;
    if (dt <= 0) dt = 1 / 240;
    this.time += dt;

    // fps
    this.frameAcc += dt;
    this.frameCount++;
    if (this.frameAcc > 0.4) {
      this.fps = this.frameCount / this.frameAcc;
      this.frameAcc = 0;
      this.frameCount = 0;
    }

    const active = this.locked && !this.paused && !this.attract;

    // time of day
    this.timeOfDay = (this.timeOfDay + dt / this.settings.dayLength) % 1;

    if (active) {
      this.updatePlayer(dt);
      if (this.intro > 0) {
        this.target = null;
        this.highlight.visible = false;
        this.crackMesh.visible = false;
      } else {
        if (this.placeCooldown > 0) this.placeCooldown -= dt;
        this.updateTarget();
        if (this.mouseDown[0] && this.target) this.tryBreak(false);
        if (this.mouseDown[1] && this.placeCooldown <= 0) this.placeBlock();
        this.checkDiscoveries(dt);
      }
    } else if (!this.attract) {
      this.updateTarget();
    } else {
      this.target = null;
      this.highlight.visible = false;
      this.crackMesh.visible = false;
      this.checkDiscoveries(0);
    }

    // chunk streaming
    const pcx = Math.floor(this.pos.x / CHUNK);
    const pcz = Math.floor(this.pos.z / CHUNK);
    if (pcx !== this.loadPcx || pcz !== this.loadPcz) this.rebuildLoadList();
    this.streamChunks(active ? 7 : 11);

    this.updateWeather(dt);
    if (this.intro > 0) {
      this.intro = Math.max(0, this.intro - dt);
      this.updateIntroCamera();
    } else if (this.attract) this.updateAttractCamera();
    else this.updateCamera();
    this.handGroup.visible = !this.attract && this.intro <= 0;
    this.particles.visible = !this.attract;
    this.updateEnvironment(dt);
    if (!this.attract && this.intro <= 0) this.updateHeld(dt);
    this.updateParticles(dt);

    // hud
    this.hudTimer += dt;
    if (this.hudTimer > 0.1) {
      this.hudTimer = 0;
      this.pushHud();
    }

    this.renderer.render(this.scene, this.camera);
  };

  private updateAttractCamera() {
    const t = this.time * 0.055;
    const r = 30 + Math.sin(this.time * 0.11) * 6;
    const cx = this.spawn.x + Math.cos(t) * r;
    const cz = this.spawn.z + Math.sin(t) * r;
    const gy = this.world.surfaceY(Math.floor(cx), Math.floor(cz));
    const cy = Math.max(this.spawn.y, gy) + 9 + Math.sin(this.time * 0.21) * 3.5;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(this.spawn.x, this.spawn.y + 1.5, this.spawn.z);
    this.camera.rotation.z += Math.sin(this.time * 0.17) * 0.02;
  }

  private updateCamera() {
    const eye = this.pos.y + (this.sneaking ? 1.44 : 1.62);
    const bobY = this.settings.bob ? Math.sin(this.bobPhase * 2) * 0.055 * this.bobAmount : 0;
    const bobX = this.settings.bob ? Math.cos(this.bobPhase) * 0.045 * this.bobAmount : 0;
    const roll = this.settings.bob ? Math.cos(this.bobPhase) * 0.011 * this.bobAmount : 0;
    const pitchOffset = this.flying ? 0 : 0;

    this.camera.position.set(this.pos.x + bobX * 0.3, eye + bobY, this.pos.z);
    this.camera.rotation.set(this.pitch + pitchOffset, this.yaw, roll);

    const sprintFov = this.sprinting && !this.flying ? 4 : this.flying && this.sprinting ? 8 : 0;
    const targetFov = this.settings.fov + sprintFov + (this.headUnderwater ? -6 : 0);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.16;
      this.camera.updateProjectionMatrix();
    }
    // water sway
    if (this.headUnderwater) {
      this.camera.rotation.z += Math.sin(this.time * 1.4) * 0.012;
    }
  }

  private updateEnvironment(dt: number) {
    const t = this.timeOfDay;
    const ang = t * Math.PI * 2 - Math.PI / 2;
    const sunDir = new THREE.Vector3(Math.cos(ang), Math.sin(ang), 0.3).normalize();
    const elev = sunDir.y;
    const w = this.weather;
    const cloud = w.kind === 0 ? 0 : w.intensity;
    const flash = w.flash;
    const clearDay = THREE.MathUtils.smoothstep(elev, -0.1, 0.26);
    const dayF = clearDay * (1 - 0.6 * cloud);
    const night = 1 - clearDay;
    const sunset = (1 - Math.min(1, Math.abs(elev) / 0.3)) * (1 - cloud * 0.85);

    const u = this.uniforms;
    u.uTime.value = this.time;
    u.uSkyLight.value = Math.min(1.6, 0.1 + dayF * 0.9 + flash * 1.15);

    const dayAmb = new THREE.Color(0.1, 0.12, 0.17);
    const nightAmb = new THREE.Color(0.028, 0.042, 0.078);
    const amb = (u.uAmbient.value as THREE.Color).copy(nightAmb).lerp(dayAmb, dayF);
    if (cloud > 0) amb.lerp(new THREE.Color(0.14, 0.16, 0.2), cloud * 0.45);
    if (flash > 0) amb.lerp(new THREE.Color(0.85, 0.9, 1.0), Math.min(0.8, flash * 0.8));

    const warm = new THREE.Color(1.0, 0.52, 0.26);
    const noon = new THREE.Color(1.0, 0.97, 0.9);
    const overcast = new THREE.Color(0.78, 0.83, 0.92);
    (u.uSunTint.value as THREE.Color).copy(noon).lerp(warm, sunset * 0.85).lerp(overcast, cloud * 0.7);
    (u.uTorchTint.value as THREE.Color).setRGB(1.0, 0.66, 0.36);

    // sky colours
    const sm = this.skyMesh.material as THREE.ShaderMaterial;
    const zenithDay = new THREE.Color(0.13, 0.36, 0.78);
    const zenithNight = new THREE.Color(0.008, 0.014, 0.04);
    const zenithSet = new THREE.Color(0.2, 0.19, 0.42);
    const horizonDay = new THREE.Color(0.55, 0.71, 0.9);
    const horizonNight = new THREE.Color(0.024, 0.042, 0.09);
    const horizonSet = new THREE.Color(1.0, 0.42, 0.17);

    const zen = zenithNight.clone().lerp(zenithDay, dayF).lerp(zenithSet, sunset * 0.55 * (1 - night * 0.6));
    const hor = horizonNight.clone().lerp(horizonDay, dayF).lerp(horizonSet, sunset * 0.75);
    if (cloud > 0) {
      zen.lerp(new THREE.Color(0.09, 0.1, 0.13), cloud * 0.8);
      hor.lerp(new THREE.Color(0.2, 0.22, 0.26), cloud * 0.72);
    }
    if (flash > 0) {
      zen.lerp(new THREE.Color(1.4, 1.5, 1.8), Math.min(0.85, flash * 0.7));
      hor.lerp(new THREE.Color(1.6, 1.7, 2.0), Math.min(0.9, flash * 0.8));
    }
    (sm.uniforms.uZenith.value as THREE.Color).copy(zen);
    (sm.uniforms.uHorizon.value as THREE.Color).copy(hor);
    (sm.uniforms.uSunDir.value as THREE.Vector3).copy(sunDir);
    (sm.uniforms.uSunCol.value as THREE.Color)
      .setRGB(1, 0.92, 0.74)
      .lerp(new THREE.Color(1, 0.45, 0.18), sunset * 0.9)
      .multiplyScalar(1 - cloud * 0.75 + flash * 2.2);
    sm.uniforms.uNight.value = Math.max(night, cloud * 0.55) * (1 - flash);
    sm.uniforms.uTime.value = this.time;

    this.skyMesh.position.copy(this.camera.position);

    // clouds
    this.cloudMesh.position.set(this.camera.position.x, 168, this.camera.position.z);
    const ct = this.cloudMat.map!;
    const windSpeed = 0.0022 * (1 + cloud * 5.5);
    ct.offset.set(this.time * windSpeed, this.time * windSpeed * 0.5);
    this.cloudMat.color
      .copy(new THREE.Color(1, 1, 1).lerp(new THREE.Color(1, 0.62, 0.42), sunset * 0.6))
      .lerp(new THREE.Color(0.34, 0.37, 0.44), cloud * 0.85)
      .multiplyScalar(0.22 + dayF * 0.78 + flash * 1.6);
    this.cloudMat.opacity = Math.min(1, (0.5 + dayF * 0.3) * (1 + cloud * 0.7));

    // fog
    const fogCol = hor.clone().multiplyScalar(0.96);
    const R = this.settings.renderDistance * CHUNK;
    if (this.headUnderwater) {
      (u.uFogColor.value as THREE.Color).setRGB(0.05, 0.2, 0.36);
      u.uFogNear.value = 0.2;
      u.uFogFar.value = 26;
    } else {
      (u.uFogColor.value as THREE.Color).copy(fogCol);
      u.uFogNear.value = R * 0.48 * (1 - cloud * 0.5);
      u.uFogFar.value = R * 0.94 * (1 - cloud * 0.55);
    }

    this.updateBirds(dayF * (1 - cloud));

    // fireflies only at night near the surface
    const surface = this.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    const nearSurface = this.pos.y < surface + 12 && this.pos.y > SEA - 6;
    this.fireflies.visible = night > 0.35 && nearSurface && !this.headUnderwater;
    if (this.fireflies.visible) this.updateFireflies(dt, night);

    // ambience audio
    const cave = Math.max(0, Math.min(1, (surface + 4 - this.pos.y) / 16));
    sfx.setAmbience(night, this.headUnderwater, cave);
    sfx.setWeather(w.kind, w.sheltered || cave > 0.5 ? w.intensity * 0.32 : w.intensity);

    // songbirds on calm sunny mornings near the surface
    this.birdTimer -= dt;
    if (this.birdTimer <= 0) {
      this.birdTimer = 1.6 + Math.random() * 6;
      if (clearDay > 0.6 && cloud < 0.25 && nearSurface && !this.headUnderwater && !this.attract && Math.random() > 0.35) {
        sfx.bird();
      }
    }

    this.dayFactor = dayF;
    this.nightFactor = night;
    this.caveFactor = cave;
    this.stormFactor = cloud;
  }

  private birdTimer = 3;
  stormFactor = 0;

  dayFactor = 1;
  nightFactor = 0;
  caveFactor = 0;

  private updateIntroCamera() {
    const k = 1 - this.intro / this.INTRO_LEN;
    const e = 1 - Math.pow(1 - k, 3);
    const eye = new THREE.Vector3(this.pos.x, this.pos.y + 1.62, this.pos.z);
    const cp = new THREE.Vector3(this.spawn.x + 16, this.spawn.y + 24, this.spawn.z - 14);
    const a = this.introFrom.clone().multiplyScalar((1 - e) * (1 - e));
    const b = cp.clone().multiplyScalar(2 * (1 - e) * e);
    const c = eye.clone().multiplyScalar(e * e);
    this.camera.position.copy(a.add(b).add(c));

    const dir = this.lookDir(new THREE.Vector3());
    const look = eye.clone().addScaledVector(dir, 24);
    const focus = new THREE.Vector3(this.spawn.x, this.spawn.y + 1.2, this.spawn.z);
    this.camera.lookAt(focus.lerp(look, e));
    this.camera.rotation.z += Math.sin(k * Math.PI) * 0.05 * (1 - e);
    const fov = this.settings.fov + 26 * (1 - e);
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private unlock(id: string) {
    if (this.unlocked.has(id)) return;
    this.unlocked.add(id);
    const d = DISCOVERIES.find((x) => x.id === id);
    if (!d) return;
    sfx.discovery();
    this.cb.onDiscovery(d.title, d.sub, this.unlocked.size, DISCOVERIES.length);
  }

  private checkDiscoveries(dt: number) {
    this.discoveryTimer -= dt;
    if (this.discoveryTimer > 0) return;
    this.discoveryTimer = 0.4;

    const c = this.world.getChunk(Math.floor(this.pos.x) >> 4, Math.floor(this.pos.z) >> 4);
    let biome = 2;
    if (c && c.stage >= STAGE.DECORATED) {
      const lx = Math.floor(this.pos.x) - c.cx * CHUNK;
      const lz = Math.floor(this.pos.z) - c.cz * CHUNK;
      biome = c.biome[lz * CHUNK + lx];
      this.biomesSeen.add(biome);
    }

    if (this.stats.mined >= 1) this.unlock("first");
    if (this.stats.mined >= 50) this.unlock("miner50");
    if (this.stats.mined >= 250) this.unlock("miner250");
    if (this.stats.placed >= 32) this.unlock("build32");
    if (this.stats.placed >= 256) this.unlock("build256");
    if (this.flying) this.unlock("fly");
    if (this.pos.y < 10) this.unlock("deep");
    if (this.pos.y > SEA + 38) this.unlock("peak");
    if (this.caveFactor > 0.55 && this.world.getSky(Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z)) === 0)
      this.unlock("cave");
    if (this.oresMined.has(CRYSTAL_ORE)) this.unlock("crystal");
    if (this.oresMined.has(GOLD_ORE)) this.unlock("gold");
    if (this.timeOfDay < 0.14 || this.timeOfDay > 0.93) this.unlock("night");
    if (this.timeOfDay > 0.23 && this.timeOfDay < 0.31) this.unlock("dawn");
    if (this.weather.kind === 2 && this.weather.intensity > 0.45) this.unlock("storm");
    if (biome === 5 || biome === 7) this.unlock("frost");
    if (biome === 4) this.unlock("desert");
    if (biome === 3) this.unlock("forest");
    if (this.biomesSeen.size >= 5) this.unlock("pilgrim");

    if (this.inWater && biome === 0) {
      this.swimTimer += 0.4;
      if (this.swimTimer > 1.6) this.unlock("ocean");
    } else this.swimTimer = 0;
  }

  private pushHud() {
    const c = this.world.getChunk(Math.floor(this.pos.x) >> 4, Math.floor(this.pos.z) >> 4);
    let biomeName = "Unknown";
    if (c && c.stage >= STAGE.DECORATED) {
      const lx = Math.floor(this.pos.x) - c.cx * CHUNK;
      const lz = Math.floor(this.pos.z) - c.cz * CHUNK;
      biomeName = BIOME_NAME[c.biome[lz * CHUNK + lx]] ?? "Unknown";
    }
    const hours = Math.floor(this.timeOfDay * 24);
    const minutes = Math.floor((this.timeOfDay * 24 * 60) % 60);
    const surface = this.world.surfaceY(Math.floor(this.pos.x), Math.floor(this.pos.z));
    const skyL = this.world.getSky(Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z));
    const blkL = this.world.getBlockLight(Math.floor(this.pos.x), Math.floor(this.pos.y + 1), Math.floor(this.pos.z));

    this.cb.onHud({
      x: this.pos.x,
      y: this.pos.y,
      z: this.pos.z,
      fps: this.fps,
      biome: this.headUnderwater ? "Submerged" : biomeName,
      clock: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`,
      dayFactor: this.dayFactor,
      timeOfDay: this.timeOfDay,
      chunks: this.meshMap.size,
      tris: this.renderer.info.render.triangles,
      mode: this.flying ? "FLYING" : this.inWater ? "SWIMMING" : this.sprinting ? "SPRINTING" : this.sneaking ? "SNEAKING" : "WALKING",
      underwater: this.headUnderwater,
      breaking: this.breakProgress,
      breakingName: this.target ? block(this.target.id).name : "",
      targetName: this.target ? block(this.target.id).name : "",
      selected: this.selected,
      hotbar: [...this.hotbar],
      mined: this.stats.mined,
      placed: this.stats.placed,
      depth: Math.max(0, surface - Math.floor(this.pos.y)),
      light: Math.max(skyL * this.dayFactor, blkL),
      distance: this.stats.distance.toFixed(0) + " m",
      seed: this.seedLabel,
      weather: this.weather.kind,
      weatherIntensity: this.weather.intensity,
      flash: this.weather.flash,
      intro: this.intro / this.INTRO_LEN,
      unlocked: [...this.unlocked],
      heading: (((-this.yaw * 180) / Math.PI) % 360 + 360) % 360,
    });
  }

  /* ---------------------------------------------------------------- */
  /* lifecycle                                                         */
  /* ---------------------------------------------------------------- */

  setAttract(on: boolean) {
    this.attract = on;
    if (on) {
      this.keys.clear();
      this.mouseDown[0] = this.mouseDown[1] = this.mouseDown[2] = false;
      this.crackMesh.visible = false;
      this.highlight.visible = false;
    }
  }

  /** leave the attract-mode menu and drop the player into the world */
  beginPlay() {
    if (!this.hasEntered) {
      this.hasEntered = true;
      this.pos.copy(this.spawn);
      this.vel.set(0, 0, 0);
      this.yaw = Math.PI * 0.32;
      this.pitch = -0.06;
      // cinematic descent from high above the spawn
      this.intro = this.INTRO_LEN;
      const surf = this.world.surfaceY(Math.floor(this.spawn.x), Math.floor(this.spawn.z));
      this.introFrom.set(this.spawn.x + 34, Math.max(surf, SEA) + 74, this.spawn.z + 42);
      this.camera.position.copy(this.introFrom);
      sfx.whoosh();
    }
    this.attract = false;
    this.paused = false;
    this.lastT = performance.now();
    this.requestLock();
  }

  skipIntro() {
    if (this.intro > 0) {
      this.intro = 0;
      this.camera.fov = this.settings.fov;
      this.camera.updateProjectionMatrix();
    }
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) {
      this.keys.clear();
      this.mouseDown[0] = this.mouseDown[1] = this.mouseDown[2] = false;
      this.crackMesh.visible = false;
      this.breakProgress = 0;
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.unbindEvents();
    for (const [, set] of this.meshMap) {
      for (const m of Object.values(set)) {
        if (!m) continue;
        this.chunkGroup.remove(m);
        m.geometry.dispose();
      }
    }
    this.meshMap.clear();
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost.geometry.dispose();
      this.ghost = null;
    }
    this.renderer.dispose();
  }
}

export type { AtlasResult };
