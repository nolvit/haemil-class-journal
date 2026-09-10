import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  avatarThemes,
  avatarThemePresets,
  chooseThemePreset,
  type AvatarTheme,
} from "@shared/avatarThemes";
import {
  buildOfficialCharacterPrompt,
  officialPromptModes,
  type OfficialCharacter,
  type OfficialCharacterInput,
  type OfficialPromptLook,
  type OfficialPromptMode,
} from "@shared/avatarOfficial";

async function imagePayload(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw new Error("PNG/JPEG/WebP 이미지(8MB 이하)를 골라 주세요.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { data, mime: file.type as "image/png" | "image/jpeg" | "image/webp" };
}

const emptyCharacter: OfficialCharacterInput = {
  name: "",
  visible: true,
  cropX: 50,
  cropY: 20,
  cropZoom: 190,
};

function CharacterFields({
  value,
  onChange,
  url,
}: {
  value: OfficialCharacterInput;
  onChange: (value: OfficialCharacterInput) => void;
  url?: string;
}) {
  const set = <K extends keyof OfficialCharacterInput>(
    key: K,
    next: OfficialCharacterInput[K]
  ) => onChange({ ...value, [key]: next });
  return (
    <div className="official-character-fields">
      {url && (
        <div className="official-gallery-preview">
          <button
            type="button"
            className="constellation-orbit frame-lunar"
            aria-label={`${value.name || "공식 캐릭터"} 광장 미리보기`}
          >
            <img
              src={url}
              alt="실제 광장 원형 미리보기"
              style={{
                objectPosition: `${value.cropX}% ${value.cropY}%`,
                transform: `scale(${value.cropZoom / 100})`,
                transformOrigin: `${value.cropX}% ${value.cropY}%`,
              }}
            />
          </button>
          <span>{value.name || "이름 미리보기"}</span>
          <small>해밀 공식</small>
        </div>
      )}
      <label>
        이름
        <input
          aria-label="공식 캐릭터 이름"
          maxLength={40}
          value={value.name}
          onChange={e => set("name", e.target.value)}
        />
      </label>
      <label className="official-visible">
        <input
          aria-label="광장 공개"
          type="checkbox"
          checked={value.visible}
          onChange={e => set("visible", e.target.checked)}
        />
        별빛 광장에 공개
      </label>
      <label>
        좌우 위치
        <input
          aria-label="공식 캐릭터 좌우 위치"
          type="range"
          min="0"
          max="100"
          value={value.cropX}
          onChange={e => set("cropX", Number(e.target.value))}
        />
      </label>
      <label>
        상하 위치
        <input
          aria-label="공식 캐릭터 상하 위치"
          type="range"
          min="0"
          max="100"
          value={value.cropY}
          onChange={e => set("cropY", Number(e.target.value))}
        />
      </label>
      <label>
        확대
        <input
          aria-label="공식 캐릭터 확대 비율"
          type="range"
          min="100"
          max="500"
          step="10"
          value={value.cropZoom}
          onChange={e => set("cropZoom", Number(e.target.value))}
        />
        <output>{value.cropZoom}%</output>
      </label>
    </div>
  );
}

function ExistingCharacter({
  character,
  refresh,
}: {
  character: OfficialCharacter;
  refresh: () => void;
}) {
  const [value, setValue] = useState<OfficialCharacterInput>(character);
  const [file, setFile] = useState<File | null>(null);
  const replacementPreview = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file]
  );
  useEffect(
    () => () => {
      if (replacementPreview) URL.revokeObjectURL(replacementPreview);
    },
    [replacementPreview]
  );
  const update = trpc.avatarRewards.updateOfficialCharacter.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      refresh();
      setFile(null);
      toast.success("공식 캐릭터를 수정했습니다.");
    },
  });
  const remove = trpc.avatarRewards.deleteOfficialCharacter.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      refresh();
      toast.success("공식 캐릭터를 삭제했습니다.");
    },
  });
  return (
    <article className="official-character-card">
      <CharacterFields
        value={value}
        onChange={setValue}
        url={replacementPreview || character.url}
      />
      <label>
        이미지 교체 (선택)
        <input
          aria-label={`${character.name} 이미지 교체`}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <div className="reward-admin-actions">
        <Button
          disabled={!value.name.trim() || update.isPending}
          onClick={async () => {
            try {
              update.mutate({
                id: character.id,
                ...value,
                image: file ? await imagePayload(file) : undefined,
              });
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          수정 저장
        </Button>
        <Button
          variant="outline"
          disabled={remove.isPending}
          onClick={() => {
            if (window.confirm(`${character.name}을(를) 삭제할까요?`))
              remove.mutate({ id: character.id });
          }}
        >
          삭제
        </Button>
      </div>
    </article>
  );
}

export function OfficialCharacterManager() {
  const query = trpc.avatarRewards.officialCharacters.useQuery(undefined, {
    refetchInterval: 30_000,
  });
  const [value, setValue] = useState(emptyCharacter);
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(
    () => (file ? URL.createObjectURL(file) : ""),
    [file]
  );
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview]
  );
  const create = trpc.avatarRewards.createOfficialCharacter.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      void query.refetch();
      setValue(emptyCharacter);
      setFile(null);
      toast.success("공식 캐릭터를 등록했습니다.");
    },
  });
  const refresh = () => void query.refetch();
  return (
    <section className="official-character-admin">
      <div>
        <p className="eyebrow">OFFICIAL CHARACTERS</p>
        <h2>공식 캐릭터 등록</h2>
        <p>DB에 저장한 캐릭터만 별빛 광장에 표시됩니다.</p>
      </div>
      <div className="official-character-card is-new">
        <h3>새 공식 캐릭터</h3>
        <CharacterFields value={value} onChange={setValue} url={preview} />
        <label>
          이미지
          <input
            aria-label="공식 캐릭터 이미지"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={e => {
              const next = e.target.files?.[0] ?? null;
              setFile(next);
            }}
          />
        </label>
        <Button
          disabled={!file || !value.name.trim() || create.isPending}
          onClick={async () => {
            if (!file) return;
            try {
              create.mutate({ ...value, image: await imagePayload(file) });
            } catch (error) {
              toast.error((error as Error).message);
            }
          }}
        >
          공식 캐릭터 등록
        </Button>
      </div>
      {query.isLoading && <p role="status">공식 캐릭터를 불러오는 중…</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      <div className="official-character-list">
        {query.data?.map(character => (
          <ExistingCharacter
            key={character.id}
            character={character}
            refresh={refresh}
          />
        ))}
      </div>
      {query.data?.length === 0 && <p>등록된 공식 캐릭터가 없습니다.</p>}
    </section>
  );
}

function randomLook(theme: AvatarTheme): OfficialPromptLook {
  const preset = chooseThemePreset(theme);
  return {
    top: preset.top,
    bottom: preset.bottom,
    shoes: preset.shoes,
    hair: preset.hair,
    background: preset.background,
    accessory: preset.accessory,
    pet: preset.pet,
    pose: preset.pose,
    extra: preset.extra,
  };
}

export function OfficialCharacterPromptBuilder() {
  const [theme, setTheme] = useState<AvatarTheme>("판타지");
  const [mode, setMode] = useState<OfficialPromptMode>("original");
  const [look, setLook] = useState<OfficialPromptLook>(() => randomLook(theme));
  const pick = (field: keyof OfficialPromptLook) => {
    const choices = avatarThemePresets[theme];
    const selected = choices[Math.floor(Math.random() * choices.length)];
    setLook(current => ({ ...current, [field]: selected[field] }));
  };
  const prompt = useMemo(
    () => buildOfficialCharacterPrompt(theme, mode, look),
    [theme, mode, look]
  );
  return (
    <section className="official-prompt-builder">
      <div>
        <p className="eyebrow">SPECIAL PROMPT STUDIO</p>
        <h2>대표 캐릭터 스페셜 프롬프트 생성</h2>
        <p>선택한 테마 안에서 의상과 연출을 랜덤 조합합니다.</p>
      </div>
      <div className="official-prompt-options">
        <label>
          테마 선택
          <select
            aria-label="대표 캐릭터 테마"
            value={theme}
            onChange={e => {
              const next = e.target.value as AvatarTheme;
              setTheme(next);
              setLook(randomLook(next));
            }}
          >
            {avatarThemes.map(item => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <label>
          변신 단계
          <select
            aria-label="대표 캐릭터 변신 단계"
            value={mode}
            onChange={e => setMode(e.target.value as OfficialPromptMode)}
          >
            {officialPromptModes.map(item => (
              <option value={item} key={item}>
                {
                  {
                    original: "오리지널",
                    wannabe: "워너비",
                    superstar: "슈퍼스타",
                  }[item]
                }
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="official-random-actions">
        <Button
          variant="outline"
          onClick={() => {
            const preset = randomLook(theme);
            setLook(current => ({
              ...current,
              top: preset.top,
              bottom: preset.bottom,
              shoes: preset.shoes,
            }));
          }}
        >
          의상 랜덤
        </Button>
        <Button variant="outline" onClick={() => pick("hair")}>
          헤어 랜덤
        </Button>
        <Button variant="outline" onClick={() => pick("background")}>
          배경 랜덤
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const preset = randomLook(theme);
            setLook(current => ({
              ...current,
              accessory: preset.accessory,
              pet: preset.pet,
            }));
          }}
        >
          소품 랜덤
        </Button>
        <Button onClick={() => setLook(randomLook(theme))}>전체 랜덤</Button>
      </div>
      <dl className="official-random-result">
        <div>
          <dt>의상</dt>
          <dd>
            {look.top} / {look.bottom} / {look.shoes}
          </dd>
        </div>
        <div>
          <dt>헤어</dt>
          <dd>{look.hair}</dd>
        </div>
        <div>
          <dt>배경</dt>
          <dd>{look.background}</dd>
        </div>
        <div>
          <dt>소품</dt>
          <dd>
            {look.accessory} / {look.pet}
          </dd>
        </div>
        <div>
          <dt>자세</dt>
          <dd>{look.pose}</dd>
        </div>
      </dl>
      <textarea
        aria-label="대표 캐릭터 최종 프롬프트"
        readOnly
        value={prompt}
      />
      <Button
        onClick={() =>
          navigator.clipboard
            .writeText(prompt)
            .then(() => toast.success("최종 프롬프트를 복사했습니다."))
            .catch(() => toast.error("프롬프트를 직접 복사해 주세요."))
        }
      >
        최종 프롬프트 복사
      </Button>
    </section>
  );
}
