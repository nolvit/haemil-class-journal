import { useEffect, useState, type FormEvent } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  shopCategories,
  shopCategoryLabels,
  shopRanks,
  type ShopItem,
  type ShopCategory,
} from "@shared/avatarShop";

const empty: ShopItem = {
  id: "",
  category: "card_frame",
  name: "",
  description: "",
  rank: "레어",
  price: 0,
  season: "상시",
  assetUrl: null,
  durationSeconds: null,
  active: true,
};
async function encode(file: File) {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return {
    data,
    mime: file.type as "image/png" | "image/jpeg" | "image/webp" | "audio/mpeg",
  };
}
export function AvatarShopAdmin() {
  const query = trpc.avatarRewards.adminShopItems.useQuery();
  const [draft, setDraft] = useState<ShopItem>(empty),
    [file, setFile] = useState<File | null>(null),
    [editing, setEditing] = useState(false);
  const done = () => {
    void query.refetch();
    setDraft(empty);
    setFile(null);
    setEditing(false);
    toast.success("상점 상품을 저장했습니다.");
  };
  const create = trpc.avatarRewards.createShopItem.useMutation({
    onSuccess: done,
    onError: e => toast.error(e.message),
  });
  const update = trpc.avatarRewards.updateShopItem.useMutation({
    onSuccess: done,
    onError: e => toast.error(e.message),
  });
  const remove = trpc.avatarRewards.deleteShopItem.useMutation({
    onSuccess: () => {
      done();
      toast.success("상점에서 상품을 삭제했습니다.");
    },
    onError: e => toast.error(e.message),
  });
  const busy = create.isPending || update.isPending || remove.isPending;
  useEffect(() => {
    if (draft.category !== "bgm" && draft.durationSeconds)
      setDraft(x => ({ ...x, durationSeconds: null }));
  }, [draft.category]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const asset = file ? await encode(file) : undefined;
    const item = {
      ...draft,
      assetUrl: draft.assetUrl || null,
      durationSeconds:
        draft.category === "bgm" ? Number(draft.durationSeconds) || 1 : null,
    };
    if (editing) update.mutate({ item, asset });
    else create.mutate({ item, asset });
  };
  return (
    <div className="shop-admin">
      <div className="admin-module-heading">
        <div>
          <h2>해밀월드 상점 상품</h2>
          <p>
            현재 상품과 시즌 상품을 등록·수정·삭제하고 판매 여부를 관리합니다.
          </p>
        </div>
        <b>{query.data?.length ?? 0}개</b>
      </div>
      <form className="shop-admin-form" onSubmit={submit}>
        <label>
          상품 ID
          <input
            value={draft.id}
            disabled={editing}
            required
            pattern="[a-z0-9][a-z0-9-]{1,18}"
            placeholder="xmas-star-frame"
            onChange={e => setDraft({ ...draft, id: e.target.value })}
          />
        </label>
        <label>
          종류
          <select
            value={draft.category}
            onChange={e =>
              setDraft({ ...draft, category: e.target.value as ShopCategory })
            }
          >
            {shopCategories.map(x => (
              <option key={x} value={x}>
                {shopCategoryLabels[x]}
              </option>
            ))}
          </select>
        </label>
        <label>
          이름
          <input
            required
            value={draft.name}
            onChange={e => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          등급
          <select
            required
            value={draft.rank}
            onChange={e =>
              setDraft({
                ...draft,
                rank: e.target.value as ShopItem["rank"],
              })
            }
          >
            {shopRanks.map(rank => (
              <option key={rank} value={rank}>
                {rank}
              </option>
            ))}
          </select>
        </label>
        <label>
          가격(P)
          <input
            type="number"
            min="0"
            required
            value={draft.price}
            onChange={e =>
              setDraft({ ...draft, price: Number(e.target.value) })
            }
          />
        </label>
        <label>
          시즌
          <input
            value={draft.season}
            placeholder="상시 / 추석 / 크리스마스"
            onChange={e => setDraft({ ...draft, season: e.target.value })}
          />
        </label>
        {draft.category === "bgm" && (
          <label>
            재생 시간(초)
            <input
              type="number"
              min="1"
              required
              value={draft.durationSeconds ?? ""}
              onChange={e =>
                setDraft({ ...draft, durationSeconds: Number(e.target.value) })
              }
            />
          </label>
        )}
        <label className="shop-admin-wide">
          설명
          <textarea
            value={draft.description}
            onChange={e => setDraft({ ...draft, description: e.target.value })}
          />
        </label>
        <label className="shop-admin-wide">
          상품 파일
          <input
            type="file"
            accept={
              draft.category === "bgm"
                ? "audio/mpeg,.mp3"
                : "image/png,image/jpeg,image/webp"
            }
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <small>
            {editing && !file
              ? "기존 파일 유지 · 새 파일을 고르면 교체됩니다."
              : "프레임·배경은 고해상도 PNG, BGM은 MP3를 권장합니다."}
          </small>
        </label>
        <label className="shop-active">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={e => setDraft({ ...draft, active: e.target.checked })}
          />{" "}
          상점에 공개
        </label>
        <div className="shop-admin-actions">
          <button disabled={busy}>{editing ? "수정 저장" : "상품 등록"}</button>
          {editing && (
            <button
              type="button"
              onClick={() => {
                setDraft(empty);
                setFile(null);
                setEditing(false);
              }}
            >
              취소
            </button>
          )}
        </div>
      </form>
      <div className="shop-admin-list">
        {query.data?.map(item => (
          <article key={item.id}>
            <div>
              <span>
                {shopCategoryLabels[item.category]} · {item.season} ·{" "}
                {item.rank}
              </span>
              <h3>{item.name}</h3>
              <p>{item.description || "설명 없음"}</p>
              <small>
                {item.id} · {item.price.toLocaleString()}P ·{" "}
                {item.active ? "판매 중" : "비공개"}
              </small>
            </div>
            <div>
              <button
                onClick={() => {
                  setDraft(item);
                  setFile(null);
                  setEditing(true);
                }}
              >
                수정
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      `${item.name} 상품을 삭제할까요? 이미 소장한 BGM은 계속 사용할 수 있습니다.`
                    )
                  )
                    remove.mutate({ id: item.id });
                }}
              >
                삭제
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
