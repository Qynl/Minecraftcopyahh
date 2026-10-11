/** Block registry: every voxel type in the game and how it behaves / renders. */

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const COBBLE = 4;
export const SAND = 5;
export const SANDSTONE = 6;
export const LOG = 7;
export const LEAVES = 8;
export const PLANKS = 9;
export const GLASS = 10;
export const BRICK = 11;
export const WATER = 12;
export const SNOW = 13;
export const SNOW_GRASS = 14;
export const ICE = 15;
export const CACTUS = 16;
export const GRAVEL = 17;
export const BEDROCK = 18;
export const COAL_ORE = 19;
export const IRON_ORE = 20;
export const GOLD_ORE = 21;
export const CRYSTAL_ORE = 22;
export const LAMP = 23;
export const OBSIDIAN = 24;
export const TALL_GRASS = 25;
export const FLOWER_RED = 26;
export const FLOWER_YELLOW = 27;
export const WOOL_RED = 28;
export const WOOL_BLUE = 29;
export const WOOL_YELLOW = 30;
export const WOOL_GREEN = 31;
export const WOOL_WHITE = 32;
export const WOOL_BLACK = 33;
export const BIRCH_LOG = 34;
export const BIRCH_LEAVES = 35;

export const MAX_BLOCK = 36;

export type Layer = "solid" | "cutout" | "trans" | "plant";
export type SoundKind = "grass" | "dirt" | "stone" | "wood" | "glass" | "sand" | "plant" | "liquid";

export interface BlockDef {
  id: number;
  name: string;
  top: string;
  side: string;
  bottom: string;
  /** 0 = none · 1 = fully biome tinted · 2 = tinted on top face only (grass) */
  foliage: number;
  layer: Layer;
  opaque: boolean;
  solid: boolean;
  hardness: number;
  sound: SoundKind;
  light: number;
  breakable: boolean;
  liquid: boolean;
  tint: [number, number, number];
  icon: string;
}

function def(
  id: number,
  name: string,
  tiles: { top?: string; side: string; bottom?: string },
  opts: Partial<Omit<BlockDef, "id" | "name" | "top" | "side" | "bottom">> = {}
): BlockDef {
  const layer = opts.layer ?? "solid";
  const opaque = opts.opaque ?? layer === "solid";
  return {
    id,
    name,
    top: tiles.top ?? tiles.side,
    side: tiles.side,
    bottom: tiles.bottom ?? tiles.top ?? tiles.side,
    foliage: opts.foliage ?? 0,
    layer,
    opaque,
    solid: opts.solid ?? true,
    hardness: opts.hardness ?? 0.45,
    sound: opts.sound ?? "stone",
    light: opts.light ?? 0,
    breakable: opts.breakable ?? true,
    liquid: opts.liquid ?? false,
    tint: opts.tint ?? [1, 1, 1],
    icon: opts.icon ?? tiles.side,
  };
}

const WOOL = [255, 255, 255];
const t = (r: number, g: number, b: number): [number, number, number] => [r / 255, g / 255, b / 255];

export const BLOCKS: BlockDef[] = [];

function reg(d: BlockDef) {
  BLOCKS[d.id] = d;
  return d;
}

reg(def(AIR, "Air", { side: "stone" }, { layer: "solid", solid: false, opaque: false, breakable: false }));
reg(def(GRASS, "Grass Block", { top: "grass_top", side: "grass_side", bottom: "dirt" }, { sound: "grass", hardness: 0.36, foliage: 2 }));
reg(def(DIRT, "Dirt", { side: "dirt" }, { sound: "dirt", hardness: 0.34 }));
reg(def(STONE, "Stone", { side: "stone" }, { sound: "stone", hardness: 0.72 }));
reg(def(COBBLE, "Cobblestone", { side: "cobble" }, { sound: "stone", hardness: 0.78 }));
reg(def(SAND, "Sand", { side: "sand" }, { sound: "sand", hardness: 0.34 }));
reg(def(SANDSTONE, "Sandstone", { side: "sandstone", top: "sandstone", bottom: "sandstone" }, { sound: "stone", hardness: 0.6 }));
reg(def(LOG, "Oak Log", { top: "log_top", side: "log_side", bottom: "log_top" }, { sound: "wood", hardness: 0.5 }));
reg(def(LEAVES, "Oak Leaves", { side: "leaves" }, { layer: "cutout", opaque: false, sound: "grass", hardness: 0.2, foliage: 1 }));
reg(def(PLANKS, "Oak Planks", { side: "planks" }, { sound: "wood", hardness: 0.46 }));
reg(def(GLASS, "Glass", { side: "glass" }, { layer: "trans", opaque: false, sound: "glass", hardness: 0.24 }));
reg(def(BRICK, "Bricks", { side: "brick" }, { sound: "stone", hardness: 0.7 }));
reg(
  def(WATER, "Water", { side: "water" }, {
    layer: "trans",
    opaque: false,
    solid: false,
    liquid: true,
    breakable: false,
    hardness: 999,
    sound: "liquid",
  })
);
reg(def(SNOW, "Snow Block", { side: "snow" }, { sound: "dirt", hardness: 0.28 }));
reg(def(SNOW_GRASS, "Snowy Grass", { top: "snow", side: "snow_grass_side", bottom: "dirt" }, { sound: "grass", hardness: 0.36 }));
reg(def(ICE, "Ice", { side: "ice" }, { layer: "trans", opaque: false, sound: "glass", hardness: 0.32 }));
reg(def(CACTUS, "Cactus", { side: "cactus", top: "cactus", bottom: "cactus" }, { sound: "plant", hardness: 0.36 }));
reg(def(GRAVEL, "Gravel", { side: "gravel" }, { sound: "dirt", hardness: 0.4 }));
reg(def(BEDROCK, "Bedrock", { side: "bedrock" }, { sound: "stone", hardness: 999, breakable: false }));
reg(def(COAL_ORE, "Coal Ore", { side: "coal_ore" }, { sound: "stone", hardness: 0.85 }));
reg(def(IRON_ORE, "Iron Ore", { side: "iron_ore" }, { sound: "stone", hardness: 0.95 }));
reg(def(GOLD_ORE, "Gold Ore", { side: "gold_ore" }, { sound: "stone", hardness: 1.0 }));
reg(def(CRYSTAL_ORE, "Crystal Ore", { side: "crystal_ore" }, { sound: "stone", hardness: 1.05, light: 3 }));
reg(def(LAMP, "Sun Lamp", { side: "lamp" }, { sound: "glass", hardness: 0.4, light: 15 }));
reg(def(OBSIDIAN, "Obsidian", { side: "obsidian" }, { sound: "stone", hardness: 1.4 }));
reg(
  def(TALL_GRASS, "Tall Grass", { side: "tall_grass" }, {
    layer: "plant",
    opaque: false,
    solid: false,
    sound: "plant",
    hardness: 0.08,
    foliage: 1,
  })
);
reg(
  def(FLOWER_RED, "Ruby Bloom", { side: "flower_red" }, {
    layer: "plant",
    opaque: false,
    solid: false,
    sound: "plant",
    hardness: 0.08,
  })
);
reg(
  def(FLOWER_YELLOW, "Sun Bloom", { side: "flower_yellow" }, {
    layer: "plant",
    opaque: false,
    solid: false,
    sound: "plant",
    hardness: 0.08,
  })
);
reg(def(WOOL_RED, "Red Wool", { side: "wool" }, { sound: "dirt", hardness: 0.3, tint: t(196, 68, 62), icon: "wool" }));
reg(def(WOOL_BLUE, "Blue Wool", { side: "wool" }, { sound: "dirt", hardness: 0.3, tint: t(64, 106, 196), icon: "wool" }));
reg(def(WOOL_YELLOW, "Yellow Wool", { side: "wool" }, { sound: "dirt", hardness: 0.3, tint: t(226, 186, 62), icon: "wool" }));
reg(def(WOOL_GREEN, "Green Wool", { side: "wool" }, { sound: "dirt", hardness: 0.3, tint: t(78, 156, 70), icon: "wool" }));
reg(def(WOOL_WHITE, "White Wool", { side: "wool" }, { sound: "dirt", hardness: 0.3, tint: t(232, 232, 236), icon: "wool" }));
reg(def(WOOL_BLACK, "Black Wool", { side: "wool" }, { sound: "dirt", hardness: 0.3, tint: t(46, 46, 54), icon: "wool" }));
reg(def(BIRCH_LOG, "Birch Log", { top: "log_top", side: "planks", bottom: "log_top" }, { sound: "wood", hardness: 0.5 }));
reg(def(BIRCH_LEAVES, "Birch Leaves", { side: "leaves_birch" }, { layer: "cutout", opaque: false, sound: "grass", hardness: 0.2, foliage: 1 }));

void WOOL;

export function block(id: number): BlockDef {
  return BLOCKS[id] ?? BLOCKS[STONE];
}

/** Blocks the player can select from the creative inventory */
export const PLACEABLE: number[] = [
  GRASS,
  DIRT,
  STONE,
  COBBLE,
  SAND,
  SANDSTONE,
  LOG,
  BIRCH_LOG,
  LEAVES,
  BIRCH_LEAVES,
  PLANKS,
  GLASS,
  BRICK,
  SNOW,
  ICE,
  CACTUS,
  GRAVEL,
  OBSIDIAN,
  LAMP,
  COAL_ORE,
  IRON_ORE,
  GOLD_ORE,
  CRYSTAL_ORE,
  TALL_GRASS,
  FLOWER_RED,
  FLOWER_YELLOW,
  WOOL_RED,
  WOOL_YELLOW,
  WOOL_GREEN,
  WOOL_BLUE,
  WOOL_WHITE,
  WOOL_BLACK,
  WATER,
].filter((v, i, a) => v > 0 && a.indexOf(v) === i);
