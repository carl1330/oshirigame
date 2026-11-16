// Avatar config serializes to "variant:paletteIndex:seed" (max 64 chars server-side).
// An empty/invalid config falls back to the default look: beam variant seeded by username.

export const AVATAR_VARIANTS = [
  "beam",
  "marble",
  "pixel",
  "sunset",
  "ring",
  "bauhaus",
] as const;

export type AvatarVariant = (typeof AVATAR_VARIANTS)[number];

export const AVATAR_PALETTES: { name: string; colors: string[] }[] = [
  { name: "Classic", colors: ["#92A1C6", "#146A7C", "#F0AB3D", "#C271B4", "#C20D90"] },
  { name: "Sunset", colors: ["#FF6B6B", "#FFA94D", "#FFD43B", "#FF8787", "#E8590C"] },
  { name: "Ocean", colors: ["#0B7285", "#1098AD", "#15AABF", "#66D9E8", "#C5F6FA"] },
  { name: "Forest", colors: ["#2B8A3E", "#51CF66", "#94D82D", "#C0EB75", "#5C940D"] },
  { name: "Candy", colors: ["#F783AC", "#DA77F2", "#9775FA", "#748FFC", "#FF8ED4"] },
  { name: "Violet", colors: ["#7C3AED", "#A78BFA", "#C4B5FD", "#4C1D95", "#2E1065"] },
  { name: "Mono", colors: ["#212529", "#495057", "#868E96", "#CED4DA", "#F1F3F5"] },
  { name: "Retro", colors: ["#FFB703", "#FB8500", "#219EBC", "#023047", "#8ECAE6"] },
];

// Cosmetic slots: index 0 is always "none". Emoji keep this asset-free
// and scale with the avatar size.
export const AVATAR_HATS = ["", "🎩", "🧢", "👑", "🎓", "🤠", "🎀", "⛑️", "🧙"] as const;
export const AVATAR_FACES = ["", "🕶️", "👓", "🥽", "🎭", "🦋", "⭐", "🍄"] as const;

export interface AvatarConfig {
  variant: AvatarVariant;
  palette: number;
  seed: string;
  hat: number;
  face: number;
}

export const DEFAULT_AVATAR: AvatarConfig = {
  variant: "beam",
  palette: 0,
  seed: "",
  hat: 0,
  face: 0,
};

export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function encodeAvatar(config: AvatarConfig): string {
  return `${config.variant}:${config.palette}:${config.seed}:${config.hat}:${config.face}`;
}

function parseIndex(value: string | undefined, max: number): number {
  const index = parseInt(value ?? "0");
  if (isNaN(index) || index < 0 || index >= max) return 0;
  return index;
}

export function decodeAvatar(value: string | undefined | null): AvatarConfig | null {
  if (!value) return null;
  const [variant, palette, seed, hat, face] = value.split(":");
  if (!AVATAR_VARIANTS.includes(variant as AvatarVariant)) return null;
  const paletteIndex = parseInt(palette);
  if (isNaN(paletteIndex) || paletteIndex < 0 || paletteIndex >= AVATAR_PALETTES.length) {
    return null;
  }
  return {
    variant: variant as AvatarVariant,
    palette: paletteIndex,
    seed: (seed ?? "").slice(0, 32),
    hat: parseIndex(hat, AVATAR_HATS.length),
    face: parseIndex(face, AVATAR_FACES.length),
  };
}
