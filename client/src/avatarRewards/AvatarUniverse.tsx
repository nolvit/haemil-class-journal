import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Heart, LockKeyhole, ShoppingBag, Sparkles } from "lucide-react";
import {
  frames,
  backgrounds,
  type Wardrobe,
  type FrameId,
  type BackgroundId,
} from "@shared/avatarCollection";
import { FantasyCard, type Artwork } from "./FantasyCard";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
type Identity = { token: string; studentId: number };
export function AvatarShop({
  identity,
  wardrobe,
  balance,
  image,
  onRefresh,
  onOpen,
}: {
  identity: Identity;
  wardrobe: Wardrobe;
  balance: number;
  image: string;
  onRefresh: () => void;
  onOpen: (a: Artwork) => void;
}) {
  const [category, setCategory] = useState<"frames" | "backgrounds">("frames");
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
  const products = category === "frames" ? frames : backgrounds;
  return (
    <section className="universe-shop">
      <div className="av-section-intro">
        <span className="av-kicker">THE ATELIER</span>
        <h3>한 장의 세계를 완성하는 장식</h3>
        <p>구매한 장식은 영구 소장하며 자유롭게 바꿀 수 있어요.</p>
        <b>{balance.toLocaleString()} P</b>
      </div>
      <div className="av-tabs" role="group" aria-label="상점 카테고리">
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
      </div>
      <div className="universe-grid">
        {products.map(item => {
          const owned = (
            category === "frames" ? wardrobe.owned : wardrobe.ownedBackgrounds
          ).includes(item.id);
          const equipped =
            item.id ===
            (category === "frames" ? wardrobe.equipped : wardrobe.background);
          return (
            <div key={item.id}>
              <FantasyCard
                url={image}
                title={item.name}
                frame={
                  category === "frames"
                    ? (item.id as FrameId)
                    : wardrobe.equipped
                }
                background={
                  category === "backgrounds"
                    ? (item.id as BackgroundId)
                    : wardrobe.background
                }
                onOpen={() =>
                  onOpen({ url: image, title: item.name + " · 미리보기" })
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
                    if (owned) {
                      if (category === "frames")
                        equip.mutate({
                          ...identity,
                          frameId: item.id as FrameId,
                        });
                      else
                        equipBg.mutate({
                          ...identity,
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
      <Dialog
        open={!!purchase}
        onOpenChange={v => {
          if (!v && !busy) setPurchase(null);
        }}
      >
        <DialogContent className="avatar-theme av-confirm">
          <DialogTitle>{purchase?.name} 소장</DialogTitle>
          <DialogDescription>
            {purchase?.price.toLocaleString()}P를 사용해 영구 소장합니다. 장착은
            언제든 바꿀 수 있어요.
          </DialogDescription>
          <p>
            구매 후 잔액 {(balance - (purchase?.price ?? 0)).toLocaleString()}P
          </p>
          <button
            disabled={busy}
            onClick={() => {
              if (!purchase) return;
              if (purchase.category === "frames")
                buy.mutate({ ...identity, frameId: purchase.id as FrameId });
              else
                buyBg.mutate({
                  ...identity,
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
  wardrobe,
  onRefresh,
}: {
  identity: Identity;
  cardId: string;
  wardrobe: Wardrobe;
  onRefresh: () => void;
}) {
  const saved = wardrobe.sharing.find(s => s.cardId === cardId);
  const [visible, setVisible] = useState(saved?.visible ?? false),
    [showName, setName] = useState(saved?.showName ?? false),
    [showGrade, setGrade] = useState(saved?.showGrade ?? false);
  const share = trpc.avatarRewards.share.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: () => {
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
          share.mutate({ ...identity, cardId, visible, showName, showGrade })
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
      <div className="universe-grid">
        {query.data?.map(c => (
          <FantasyCard
            key={c.id}
            url={c.url}
            title={c.name + " · " + c.grade}
            frame={c.frame}
            background={c.background}
            onOpen={() => onOpen({ url: c.url, title: c.name + "의 컬렉션" })}
          >
            <button
              className="av-like"
              aria-pressed={c.liked}
              disabled={like.isPending || c.mine}
              aria-label={c.name + " 카드 좋아요"}
              onClick={() =>
                like.mutate({ ...identity, cardId: c.id, liked: !c.liked })
              }
            >
              <Heart size={17} fill={c.liked ? "currentColor" : "none"} />
              {c.likes}
              {c.mine ? " · 내 카드" : ""}
            </button>
          </FantasyCard>
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
          disabled={(query.data?.length ?? 0) < 24}
          onClick={() => setPage(p => p + 1)}
        >
          다음
        </button>
      </div>
    </section>
  );
}
