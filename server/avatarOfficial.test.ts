import { describe, expect, it } from "vitest";
import {
  buildOfficialCharacterPrompt,
  officialCharacterInput,
  officialPromptModes,
} from "../shared/avatarOfficial";
import {
  avatarThemePresets,
  avatarThemes,
  type AvatarTheme,
} from "../shared/avatarThemes";
import { rewardDDL } from "./avatarRewardSchema";

describe("official avatar administration", () => {
  it("stores official characters independently from student cards", () => {
    const ddl = rewardDDL.find(statement =>
      statement.includes("official_avatar_characters")
    );
    expect(ddl).toContain("name VARCHAR(40)");
    expect(ddl).toContain("visible BOOLEAN");
    expect(ddl).toContain("cropZoom INT");
  });

  it("validates profile visibility and crop settings", () => {
    expect(
      officialCharacterInput.parse({ name: "해나", visible: true })
    ).toMatchObject({ cropX: 50, cropY: 20, cropZoom: 190 });
    expect(
      officialCharacterInput.safeParse({
        name: "미르",
        visible: true,
        cropX: 101,
      }).success
    ).toBe(false);
  });

  it("builds every theme and transformation mode from its selected look", () => {
    for (const theme of avatarThemes) {
      const preset = avatarThemePresets[theme][0];
      for (const mode of officialPromptModes) {
        const prompt = buildOfficialCharacterPrompt(
          theme as AvatarTheme,
          mode,
          preset
        );
        expect(prompt).toContain(`${theme} · ${mode.toUpperCase()}`);
        expect(prompt).toContain(preset.top);
        expect(prompt).toContain(preset.hair);
        expect(prompt).toContain(preset.background);
        expect(prompt).toContain(preset.accessory);
        expect(prompt).toContain("single identity reference");
        expect(prompt).toContain("Do not add text");
      }
    }
  });
});
