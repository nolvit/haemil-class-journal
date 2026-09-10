import { z } from "zod";
import { avatarThemes, type AvatarTheme } from "./avatarThemes";

export const officialCharacterInput = z.object({
  name: z.string().trim().min(1).max(40),
  visible: z.boolean().default(true),
  cropX: z.number().int().min(0).max(100).default(50),
  cropY: z.number().int().min(0).max(100).default(20),
  cropZoom: z.number().int().min(100).max(500).default(190),
});
export type OfficialCharacterInput = z.infer<typeof officialCharacterInput>;
export type OfficialCharacter = OfficialCharacterInput & {
  id: string;
  url: string;
  createdAt: string;
  updatedAt: string;
};

export const officialPromptModes = [
  "original",
  "wannabe",
  "superstar",
] as const;
export type OfficialPromptMode = (typeof officialPromptModes)[number];
export type OfficialPromptLook = {
  top: string;
  bottom: string;
  shoes: string;
  hair: string;
  background: string;
  accessory: string;
  pet: string;
  pose: string;
  extra: string;
};

const modeDirection: Record<OfficialPromptMode, string> = {
  original:
    "ORIGINAL: preserve the representative character's identity, age, proportions and signature impression very closely.",
  wannabe:
    "WANNABE: preserve clear identity while giving the character a polished aspirational transformation.",
  superstar:
    "SUPERSTAR: preserve recognizable identity while creating a dramatic premium hero transformation with cinematic presence.",
};

export function buildOfficialCharacterPrompt(
  theme: AvatarTheme,
  mode: OfficialPromptMode,
  look: OfficialPromptLook
) {
  if (!avatarThemes.includes(theme))
    throw new Error("지원하지 않는 테마입니다.");
  return `HAEMIL OFFICIAL REPRESENTATIVE CHARACTER · ${theme} · ${mode.toUpperCase()}
Use the supplied official representative character image as the single identity reference.
Create ONE premium semi-webtoon full-body character illustration suitable for a collectible card.
${modeDirection[mode]}

SELECTED DESIGN
- Top: ${look.top}
- Bottom: ${look.bottom}
- Shoes: ${look.shoes}
- Hair: ${look.hair}
- Background: ${look.background}
- Prop: ${look.accessory}
- Pet: ${look.pet}
- Pose: ${look.pose}
- Additional direction: ${look.extra}

Keep the concept coherent with the ${theme} theme. Show the full head and both shoes. Keep the face clear enough for a circular profile crop. Use age-appropriate styling, refined lighting and a clean premium composition. Do not add text, logos, watermarks, UI, borders, split panels or collage elements.`;
}
