import { describe, expect, it } from "vitest";
import {
  buildOfficialCharacterPrompt,
  officialCharacterInput,
  officialPromptModes,
} from "../shared/avatarOfficial";
import {
  avatarThemePrompt,
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

  it("keeps medieval Europe grounded and distinct from fantasy", () => {
    const medieval = avatarThemePresets["중세유럽"];
    const combined = medieval.map(Object.values).flat().join(" ");
    expect(combined).toContain("리넨");
    expect(combined).toContain("중세 장터");
    expect(combined).toContain("목조 범선");
    expect(combined).not.toMatch(/마법진|슬라임|아기 용|비공정|빛나는/);

    const prompt = buildOfficialCharacterPrompt(
      "중세유럽",
      "wannabe",
      medieval[0]
    );
    expect(prompt).toContain("Grounded historical costume drama");
    expect(prompt).toContain("No magic");
  });

  it("provides five presets and explicit directions for all seven themes", () => {
    expect(avatarThemes).toEqual([
      "중세유럽",
      "조선시대",
      "스쿨룩",
      "KPOP/무대스타",
      "스포츠스타",
      "판타지",
      "미래",
    ]);
    for (const theme of avatarThemes) {
      expect(avatarThemePresets[theme]).toHaveLength(5);
      expect(avatarThemePrompt(theme)).toContain("THEME DIRECTION");
    }
  });

  it("reserves overt fantasy concepts for the fantasy theme", () => {
    for (const theme of avatarThemes.filter(theme => theme !== "판타지")) {
      const combined = avatarThemePresets[theme]
        .map(Object.values)
        .flat()
        .join(" ");
      expect(combined).not.toMatch(
        /마법진|슬라임|아기 용|비공정|구름섬|로봇새|시간 터널|반중력|빛 먹는|그림에서 나온/
      );
    }
  });
});
