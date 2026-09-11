import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Heart,
  LockKeyhole,
  Music2,
  ShoppingBag,
  Sparkles,
  Globe2,
} from "lucide-react";
import {
  galleryPageSize,
  type Wardrobe,
  type FrameId,
  type BackgroundId,
} from "@shared/avatarCollection";
import { FantasyCard, type Artwork } from "./FantasyCard";
import type { RewardCard } from "@shared/avatarRewards";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AvatarBgmShop } from "./AvatarBgm";
type Identity = { token: string; studentId: number };

export function WorldThemeCollection({ identity }: { identity: Identity }) {
  const state = trpc.avatarRewards.worldThemeState.useQuery(identity, {
    retry: false,
  });
  const equip = trpc.avatarRewards.equipWorldTheme.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      void state.refetch();
      toast.success("전체 배경 테마를 장착했어요.");
    },
  });
  const items = (state.data?.items ?? []).filter(item =>
    state.data?.owned.includes(item.id)
  );
  if (state.isLoading)
    return <p role="status">전체 배경 컬렉션을 불러오는 중…</p>;
  return (
    <div className="world-theme-grid">
      {items.map(item => {
        const equipped = state.data?.equipped === item.id;
        const preview = item.assets?.world_background ?? item.assetUrl;
        return (
          <article className="world-theme-item" key={item.id}>
            <div
              className="world-theme-preview"
              style={
                preview
                  ? { backgroundImage: `url(${JSON.stringify(preview)})` }
                  : undefined
              }
            >
              <Globe2 aria-hidden="true" />
              <span>{item.season}</span>
            </div>
            <span className="av-rank">{item.rank}</span>
            <h4>{item.name}</h4>
            <p>{item.description}</p>
            <small>배경 · 확대바 · BGM 패널 세트</small>
            <button
              disabled={equipped || equip.isPending}
              onClick={() => equip.mutate({ ...identity, worldId: item.id })}
            >
              {equipped ? "현재 장착" : "장착하기"}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function WorldThemeShop({
  identity,
  balance,
  onRefresh,
}: {
  identity: Identity;
  balance: number;
  onRefresh: () => void;
}) {
  const state = trpc.avatarRewards.worldThemeState.useQuery(identity, {
    retry: false,
  });
  const purchase = trpc.avatarRewards.purchaseWorldTheme.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      void state.refetch();
      onRefresh();
      toast.success("전체 배경 테마 세트를 소장했어요.");
    },
  });
  const equip = trpc.avatarRewards.equipWorldTheme.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      void state.refetch();
      toast.success("배경·확대바·BGM 패널을 함께 적용했어요.");
    },
  });
  return (
    <div className="world-theme-grid">
      {(state.data?.items ?? []).map(item => {
        const owned = state.data?.owned.includes(item.id) ?? item.price === 0;
        const equipped = state.data?.equipped === item.id;
        const preview = item.assets?.world_background ?? item.assetUrl;
        return (
          <article className="world-theme-item" key={item.id}>
            <div
              className="world-theme-preview"
              style={
                preview
                  ? { backgroundImage: `url(${JSON.stringify(preview)})` }
                  : undefined
              }
            >
              <Globe2 aria-hidden="true" />
              <span>{item.season}</span>
            </div>
            <span className="av-rank">
              {item.rank} ·{" "}
              {item.price ? `${item.price.toLocaleString()} P` : "기본 제공"}
            </span>
            <h4>{item.name}</h4>
            <p>{item.description}</p>
            <small>전체 배경 · 확대바 3종 · BGM 패널</small>
            <button
              disabled={
                purchase.isPending ||
                equip.isPending ||
                equipped ||
                (!owned && balance < item.price)
              }
              onClick={() =>
                owned
                  ? equip.mutate({ ...identity, worldId: item.id })
                  : window.confirm(
                      `${item.name} 테마 세트를 ${item.price.toLocaleString()}P로 소장할까요?`
                    ) && purchase.mutate({ ...identity, worldId: item.id })
              }
            >
              {equipped
                ? "현재 장착"
                : owned
                  ? "장착하기"
                  : balance < item.price
                    ? "포인트 부족"
                    : `${item.price.toLocaleString()}P로 세트 소장`}
            </button>
          </article>
        );
      })}
    </div>
  );
}
export function AvatarShop({
  identity,
  wardrobe,
  balance,
  image,
  cards,
  onRefresh,
  onOpen,
}: {
  identity: Identity;
  wardrobe: Wardrobe;
  balance: number;
  image: string;
  cards: RewardCard[];
  onRefresh: () => void;
  onOpen: (a: Artwork) => void;
}) {
  const [category, setCategory] = useState<
    "frames" | "backgrounds" | "worlds" | "bgm"
  >("frames");
  const catalog = trpc.avatarRewards.shopCatalog.useQuery(
    {
      ...identity,
      category:
        category === "frames"
          ? "card_frame"
          : category === "backgrounds"
            ? "card_background"
            : category === "worlds"
              ? "world_background"
              : "bgm",
    },
    { retry: false }
  );
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const card = cards.find(c => c.id === cardId) ?? cards[0];
  const style = card
    ? (wardrobe.cardStyles[card.id] ?? {
        frame: card.frame,
        background: card.background,
      })
    : { frame: "lunar" as FrameId, background: "classic" as BackgroundId };
  const [purchase, setPurchase] = useState<{
    id: string;
    name: string;
    price: number;
    category: string;
  } | null>(null);
  const options = {
    onError: (e: { message: string }) => toast.error(e.message),
    onSuccess: () => {
      setPurchase(null);
      onRefresh();
      toast.success("컬렉션 장식이 갱신되었어요.");
    },
  };
  const buy = trpc.avatarRewards.purchaseFrame.useMutation(options),
    equip = trpc.avatarRewards.equipFrame.useMutation(options),
    buyBg = trpc.avatarRewards.purchaseBackground.useMutation(options),
    equipBg = trpc.avatarRewards.equipBackground.useMutation(options);
  const busy =
    buy.isPending || equip.isPending || buyBg.isPending || equipBg.isPending;
  const products = (catalog.data ?? []).map(item => ({
    ...item,
    rank: item.rank,
  }));
  return (
    <section className="universe-shop">
      <div className="av-section-intro">
        <span className="av-kicker">THE ATELIER</span>
        <h3>한 장의 세계를 완성하는 장식</h3>
        <p>장식은 선택한 카드에 귀속되며 카드마다 다르게 꾸밀 수 있어요.</p>
        <b>{balance.toLocaleString()} P</b>
      </div>
      <div className="av-tabs" role="group" aria-label="상점 카테고리">
        <button
          aria-pressed={category === "worlds"}
          onClick={() => setCategory("worlds")}
        >
          <Globe2 size={16} />
          전체 배경
        </button>
        <button
          aria-pressed={category === "frames"}
          onClick={() => setCategory("frames")}
        >
          <Sparkles size={16} />
          카드 프레임
        </button>
        <button
          aria-pressed={category === "backgrounds"}
          onClick={() => setCategory("backgrounds")}
        >
          <ShoppingBag size={16} />
          카드 배경
        </button>
        <button
          aria-pressed={category === "bgm"}
          onClick={() => setCategory("bgm")}
        >
          <Music2 size={16} />
          BGM
        </button>
      </div>
      {category === "bgm" ? (
        <AvatarBgmShop
          identity={identity}
          balance={balance}
          onRefresh={onRefresh}
        />
      ) : category === "worlds" ? (
        <WorldThemeShop
          identity={identity}
          balance={balance}
          onRefresh={onRefresh}
        />
      ) : cards.length ? (
        <label className="av-card-target">
          꾸밀 카드
          <select value={card?.id} onChange={e => setCardId(e.target.value)}>
            {cards.map((c, i) => (
              <option key={c.id} value={c.id}>
                컬렉션 카드 {i + 1}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>먼저 스페셜 아바타 카드를 만들어 주세요.</p>
      )}
      {category !== "bgm" && category !== "worlds" && (
        <div className="universe-grid">
          {products.map(item => {
            const owned = !card
              ? false
              : item.price === 0 ||
                (category === "frames"
                  ? (wardrobe.cardFrames[card.id] ?? [])
                  : (wardrobe.cardBackgrounds[card.id] ?? [])
                ).includes(item.id);
            const equipped =
              item.id ===
              (category === "frames" ? style.frame : style.background);
            return (
              <div key={item.id}>
                <FantasyCard
                  url={card?.url ?? image}
                  title={item.name}
                  frame={
                    category === "frames" ? (item.id as FrameId) : style.frame
                  }
                  background={
                    category === "backgrounds"
                      ? (item.id as BackgroundId)
                      : style.background
                  }
                  onOpen={() =>
                    onOpen({
                      url: card?.url ?? image,
                      title: item.name + " · 미리보기",
                      frame:
                        category === "frames"
                          ? (item.id as FrameId)
                          : style.frame,
                      background:
                        category === "backgrounds"
                          ? (item.id as BackgroundId)
                          : style.background,
                    })
                  }
                >
                  <span className="av-rank">
                    {item.rank} ·{" "}
                    {item.price
                      ? item.price.toLocaleString() + " P"
                      : "기본 제공"}
                  </span>
                  <p>{item.description}</p>
                  <button
                    disabled={
                      busy || equipped || (!owned && balance < item.price)
                    }
                    onClick={() => {
                      if (!card) return;
                      if (owned) {
                        if (category === "frames")
                          equip.mutate({
                            ...identity,
                            cardId: card.id,
                            frameId: item.id as FrameId,
                          });
                        else
                          equipBg.mutate({
                            ...identity,
                            cardId: card.id,
                            backgroundId: item.id as BackgroundId,
                          });
                      } else setPurchase({ ...item, category });
                    }}
                  >
                    {equipped
                      ? "장착 중"
                      : owned
                        ? "장착하기"
                        : balance < item.price
                          ? "포인트 부족"
                          : item.price.toLocaleString() + "P로 소장"}
                  </button>
                </FantasyCard>
              </div>
            );
          })}
        </div>
      )}
      <Dialog
        open={!!purchase}
        onOpenChange={v => {
          if (!v && !busy) setPurchase(null);
        }}
      >
        <DialogContent className="avatar-theme av-confirm">
          <DialogTitle>{purchase?.name} 소장</DialogTitle>
          <DialogDescription>
            {purchase?.price.toLocaleString()}P를 사용해 선택한 카드에
            귀속합니다. 같은 카드에서는 언제든 바꿀 수 있어요.
          </DialogDescription>
          <p>
            구매 후 잔액 {(balance - (purchase?.price ?? 0)).toLocaleString()}P
          </p>
          <button
            disabled={busy}
            onClick={() => {
              if (!purchase) return;
              if (!card) return;
              if (purchase.category === "frames")
                buy.mutate({
                  ...identity,
                  cardId: card.id,
                  frameId: purchase.id as FrameId,
                });
              else
                buyBg.mutate({
                  ...identity,
                  cardId: card.id,
                  backgroundId: purchase.id as BackgroundId,
                });
            }}
          >
            {busy ? "소장 중…" : "구매 확정"}
          </button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function CardSharing({
  identity,
  cardId,
  url,
  wardrobe,
  onRefresh,
  onDirtyChange,
}: {
  identity: Identity;
  cardId: string;
  url: string;
  wardrobe: Wardrobe;
  onRefresh: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const saved = wardrobe.sharing.find(s => s.cardId === cardId);
  const [visible, setVisible] = useState(saved?.visible ?? false),
    [showName, setName] = useState(saved?.showName ?? false),
    [showGrade, setGrade] = useState(saved?.showGrade ?? false),
    [cropX, setCropX] = useState(saved?.cropX ?? 50),
    [cropY, setCropY] = useState(saved?.cropY ?? 20),
    [cropZoom, setCropZoom] = useState(saved?.cropZoom ?? 190);
  const dirty =
    visible !== (saved?.visible ?? false) ||
    showName !== (saved?.showName ?? false) ||
    showGrade !== (saved?.showGrade ?? false) ||
    cropX !== (saved?.cropX ?? 50) ||
    cropY !== (saved?.cropY ?? 20) ||
    cropZoom !== (saved?.cropZoom ?? 190);
  const dirtyListener = useRef(onDirtyChange);
  dirtyListener.current = onDirtyChange;
  useEffect(() => {
    dirtyListener.current?.(dirty);
    return () => dirtyListener.current?.(false);
  }, [dirty]);
  const share = trpc.avatarRewards.share.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: () => {
      dirtyListener.current?.(false);
      onRefresh();
      toast.success(
        visible ? "별빛 광장에 공개했어요." : "비공개로 전환했어요."
      );
    },
  });
  return (
    <details className="card-sharing">
      <summary>
        <LockKeyhole size={13} />
        {saved?.visible ? "공개 중 · 공개 설정" : "비공개 · 공개 설정"}
      </summary>
      <p>공개하면 카드 사진이 학생 포털의 별빛 광장에 표시돼요.</p>
      <div className="gallery-crop-editor">
        <div className="constellation-orbit">
          <img
            src={url}
            alt="광장 프로필 미리보기"
            style={{
              objectPosition: `${cropX}% ${cropY}%`,
              transform: `scale(${cropZoom / 100})`,
              transformOrigin: `${cropX}% ${cropY}%`,
            }}
          />
        </div>
        <label>
          좌우 위치{" "}
          <input
            aria-label="광장 좌우 위치"
            type="range"
            min="0"
            max="100"
            value={cropX}
            onChange={e => setCropX(Number(e.target.value))}
          />
        </label>
        <label>
          상하 위치{" "}
          <input
            aria-label="광장 상하 위치"
            type="range"
            min="0"
            max="100"
            value={cropY}
            onChange={e => setCropY(Number(e.target.value))}
          />
        </label>
        <label>
          확대{" "}
          <input
            aria-label="광장 확대 비율"
            type="range"
            min="100"
            max="500"
            step="10"
            value={cropZoom}
            onChange={e => setCropZoom(Number(e.target.value))}
          />
          <output>{cropZoom}%</output>
        </label>
      </div>
      <label>
        <input
          type="checkbox"
          checked={visible}
          onChange={e => setVisible(e.target.checked)}
        />
        사진 공개
      </label>
      <label>
        <input
          type="checkbox"
          disabled={!visible}
          checked={showName}
          onChange={e => setName(e.target.checked)}
        />
        이름 공개 (기본: 박00)
      </label>
      <label>
        <input
          type="checkbox"
          disabled={!visible}
          checked={showGrade}
          onChange={e => setGrade(e.target.checked)}
        />
        학년 공개 (기본: 중0학년)
      </label>
      <button
        disabled={share.isPending}
        onClick={() =>
          share.mutate({
            ...identity,
            cardId,
            visible,
            showName,
            showGrade,
            cropX,
            cropY,
            cropZoom,
          })
        }
      >
        {share.isPending ? "저장 중…" : "공개 설정 저장"}
      </button>
    </details>
  );
}
export function AvatarGallery({
  identity,
  onOpen,
}: {
  identity: Identity;
  onOpen: (a: Artwork) => void;
}) {
  const [page, setPage] = useState(0);
  const query = trpc.avatarRewards.gallery.useQuery(
    { ...identity, page },
    { refetchInterval: 15000 }
  );
  const like = trpc.avatarRewards.like.useMutation({
    onSuccess: () => void query.refetch(),
    onError: e => toast.error(e.message),
  });
  return (
    <section>
      <div className="av-section-intro">
        <span className="av-kicker">CONSTELLATION GALLERY</span>
        <h3>서로의 빛이 모이는 별빛 광장</h3>
        <p>
          좋아하는 카드에 마음을 보내세요. 첫 좋아요마다 컬렉터에게 10P가
          쌓여요.
        </p>
        <small>
          같은 학생의 같은 카드 재좋아요는 보상이 반복되지 않아요. 댓글은
          없어요.
        </small>
      </div>
      {query.isLoading && <p role="status">별빛을 불러오는 중…</p>}
      {query.error && (
        <button onClick={() => void query.refetch()}>다시 불러오기</button>
      )}
      <div className="constellation-grid">
        {query.data?.map(c => (
          <article className="constellation-person" key={c.id}>
            <button
              type="button"
              className={`constellation-orbit frame-${c.frame}`}
              aria-label={c.name + " 카드 열기"}
              onClick={e => {
                const b = e.currentTarget.getBoundingClientRect();
                onOpen({
                  url: c.url,
                  title: c.name + "의 컬렉션",
                  frame: c.frame,
                  background: c.background,
                  origin: { x: b.x, y: b.y, width: b.width, height: b.height },
                });
              }}
            >
              <img
                loading="lazy"
                src={c.url}
                alt={c.name + " 원형 아바타"}
                style={{
                  objectPosition: `${c.cropX}% ${c.cropY}%`,
                  transform: `scale(${c.cropZoom / 100})`,
                  transformOrigin: `${c.cropX}% ${c.cropY}%`,
                }}
              />
            </button>
            <span className="constellation-name">{c.name}</span>
            <small>{c.grade}</small>
            <button
              type="button"
              className="av-like"
              aria-pressed={c.liked}
              disabled={like.isPending || c.mine || c.official}
              aria-label={c.name + " 카드 좋아요"}
              onClick={() =>
                like.mutate({ ...identity, cardId: c.id, liked: !c.liked })
              }
            >
              <Heart size={14} fill={c.liked ? "currentColor" : "none"} />
              {c.likes}
              {c.official ? " · 오피셜" : c.mine ? " · 내 카드" : ""}
            </button>
          </article>
        ))}
      </div>
      {query.data?.length === 0 && (
        <p className="av-empty">
          아직 공개된 카드가 없어요. 내 컬렉션에서 첫 번째 빛을 나눠 보세요.
        </p>
      )}
      <div className="av-pagination">
        <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>
          이전
        </button>
        <span>{page + 1}</span>
        <button
          disabled={(query.data?.length ?? 0) < galleryPageSize}
          onClick={() => setPage(p => p + 1)}
        >
          다음
        </button>
      </div>
    </section>
  );
}
