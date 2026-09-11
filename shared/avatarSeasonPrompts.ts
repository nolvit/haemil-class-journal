export const seasons = {
  chuseok: {
    name: "추석",
    mood: "a luminous harvest full moon, fine Korean dancheong-inspired geometry, restrained clouds, elegant mother-of-pearl detail, antique gold and deep jade",
  },
  halloween: {
    name: "할로윈",
    mood: "an elegant mysterious observatory, crescent moons, restrained pumpkin filigree, midnight violet and antique copper; whimsical, never bloody or frightening",
  },
  christmas: {
    name: "크리스마스",
    mood: "a winter celestial palace, delicate snow crystals, restrained holly filigree, warm champagne gold, evergreen and midnight blue",
  },
} as const;
export const seasonalAssets = {
  shell: {
    name: "아바타 전용 화면 배경",
    size: "1440 x 2560",
    file: "shell-background.png",
    spec: "Opaque PNG. Keep the central 75% low-contrast and uncluttered for Korean text, cards and controls. Place decorative motifs near outer edges. Reserve the bottom 12% for navigation. No baked-in interface, cards or controls. Dark base #0c141a.",
  },
  frame: {
    name: "카드 프레임",
    size: "900 x 1200",
    file: "card-frame.png",
    spec: "RGBA transparent PNG overlay. Outer border inside x16..884, y16..1184, rounded corners radius38. Main artwork opening x70..830, y125..1045 MUST be fully transparent; do not put any symbol or opaque fill inside it. Keep decorations at outer edges. Top emblem near (450,67), footer ornament below y1080. No person, artwork or lettering. Never draw a checkerboard transparency pattern.",
  },
  background: {
    name: "카드 배경",
    size: "900 x 1200",
    file: "card-background.png",
    spec: "Opaque PNG card backing. Decorative edges, low-contrast center; visible mainly outside the contained artwork rectangle x70..830, y125..1045. No frame, character, letters or embedded interface. Match the frame palette without competing with the artwork.",
  },
  track: {
    name: "확대바 · 바탕 트랙",
    size: "1024 x 32",
    file: "zoom-track.png",
    spec: "RGBA transparent PNG. One horizontal rounded slider track centered vertically, height16, radius8. No thumb, labels, numbers, symbols or drop shadow outside canvas. Preserve the left and right 16px caps; center must stretch cleanly.",
  },
  fill: {
    name: "확대바 · 채움 트랙",
    size: "1024 x 32",
    file: "zoom-fill.png",
    spec: "RGBA transparent PNG. One luminous horizontal rounded fill strip, centered vertically, height16, radius8. Identical silhouette and cap geometry to zoom-track.png. No knob, text or scale marks. Stretch-safe center.",
  },
  thumb: {
    name: "확대바 · 조절 손잡이",
    size: "96 x 96",
    file: "zoom-thumb.png",
    spec: "RGBA transparent PNG. One perfectly centered circular jewel knob diameter64 at (48,48), surrounded by at most16px soft glow. Crisp circular rim, subtle seasonal motif. No labels, hand, track or extra objects.",
  },
  bgmPanel: {
    name: "BGM 플레이어 패널",
    size: "1024 x 160",
    file: "bgm-player-panel.png",
    spec: "RGBA transparent PNG panel skin. A refined horizontal rounded panel with a quiet center for code-rendered title, controls and progress bar. Decorations only near the rim and corners. No icons, buttons, text, music notes, slider, labels or embedded UI. Preserve transparent breathing room and stretch-safe center geometry.",
  },
} as const;
export function seasonalPrompt(
  season: keyof typeof seasons,
  asset: keyof typeof seasonalAssets,
  rank: "rare" | "epic" | "legendary"
) {
  const s = seasons[season],
    a = seasonalAssets[asset];
  return `HAEMIL SEASONAL COLLECTION / ${season} / ${rank} / ${asset}
Create exactly ONE production asset, not a mockup or a contact sheet.
Output: ${a.size} px PNG. Target filename: ${season}-${rank}-${a.file}
Art direction: a refined premium fantasy collectible-card experience for school students. ${s.mood}.
Shared brand: elegant geometry, disciplined negative space, dark teal/navy foundation, carefully controlled gold highlights. Never a cartoon mobile-game UI.
Rarity: ${rank === "rare" ? "restrained ornament, soft edge glow" : rank === "epic" ? "layered filigree, fine celestial detail, moderate glow" : "intricate but readable symmetry, luminous rim, luxurious restrained highlights"}.
Technical composition: ${a.spec}
Do not include real people, faces, student information, names, grades, dates, IDs, signatures, watermarks, logos, text or UI labels. Typography and brand logo are rendered by the application.
Match the palette and visual language of the other assets in this seasonal set. Avoid high-frequency patterns, heavy center bloom and large particles.
Do not add screenshot backgrounds, preview boards, measurement arrows or explanatory captions.
Deliver only the asset image. Transparent areas must have actual alpha=0.
`;
}
