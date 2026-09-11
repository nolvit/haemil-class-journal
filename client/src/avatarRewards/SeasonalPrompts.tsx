import { useState } from "react";
import { toast } from "sonner";
import {
  seasons,
  seasonalAssets,
  seasonalPrompt,
} from "@shared/avatarSeasonPrompts";
import {
  avatarThemes,
  avatarThemePrompt,
  type AvatarTheme,
} from "@shared/avatarThemes";
export function SeasonalPrompts() {
  const [season, setSeason] = useState<keyof typeof seasons>("chuseok");
  const [asset, setAsset] = useState<keyof typeof seasonalAssets>("frame");
  const [rank, setRank] = useState<"rare" | "epic" | "legendary">("rare");
  const prompt = seasonalPrompt(season, asset, rank);
  const [avatarTheme, setAvatarTheme] = useState<AvatarTheme>("판타지");
  const creationPrompt = avatarThemePrompt(avatarTheme);
  return (
    <section className="seasonal-prompts">
      <h2>시즌 상점 에셋 제작 프롬프트</h2>
      <p>
        추석·할로윈·크리스마스용 전체 배경 세트, 카드 장식과 BGM 패널을 같은
        무드로 제작합니다. 전체 배경 상품에는 배경·확대바 3종·BGM 패널을 한
        세트로 등록할 수 있습니다.
      </p>
      <div className="seasonal-options">
        <label>
          시즌
          <select
            aria-label="시즌"
            value={season}
            onChange={e => setSeason(e.target.value as keyof typeof seasons)}
          >
            {Object.entries(seasons).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          등급
          <select
            aria-label="시즌 등급"
            value={rank}
            onChange={e => setRank(e.target.value as typeof rank)}
          >
            <option value="rare">레어</option>
            <option value="epic">에픽</option>
            <option value="legendary">레전더리</option>
          </select>
        </label>
        <label>
          에셋 종류
          <select
            aria-label="에셋 종류"
            value={asset}
            onChange={e =>
              setAsset(e.target.value as keyof typeof seasonalAssets)
            }
          >
            {Object.entries(seasonalAssets).map(([k, v]) => (
              <option key={k} value={k}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <strong>{seasonalAssets[asset].size}px · PNG</strong>
      <textarea aria-label="시즌 에셋 제작 프롬프트" readOnly value={prompt} />
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(prompt)
            .then(() => toast.success("제작 프롬프트를 복사했습니다."))
            .catch(() =>
              toast.error("복사하지 못했습니다. 프롬프트를 직접 선택해 주세요.")
            )
        }
      >
        제작 프롬프트 복사
      </button>
      <small>
        전체 배경 세트는 화면 배경, 확대바 바탕·채움·손잡이, BGM 패널을 각각
        생성하세요. 실제 크기·투명도·중앙 안전 영역을 검사하고 PNG 메타데이터를
        제거한 뒤 사용합니다.
      </small>
      <hr />
      <h2>스페셜 아바타 테마 프롬프트</h2>
      <p>
        두 후보가 확실히 다르게 나오도록 구성한 5개 시대·25개 완성형 테마입니다.
      </p>
      <label>
        아바타 테마
        <select
          aria-label="아바타 테마"
          value={avatarTheme}
          onChange={e => setAvatarTheme(e.target.value as AvatarTheme)}
        >
          {avatarThemes.map(x => (
            <option key={x}>{x}</option>
          ))}
        </select>
      </label>
      <textarea
        aria-label="아바타 테마 제작 프롬프트"
        readOnly
        value={creationPrompt}
      />
      <button
        type="button"
        onClick={() =>
          void navigator.clipboard
            .writeText(creationPrompt)
            .then(() => toast.success("아바타 프롬프트를 복사했습니다."))
        }
      >
        아바타 프롬프트 복사
      </button>
    </section>
  );
}
