import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  CircleHelp,
  Heart,
  Layers,
  Music2,
  ScrollText,
  Store,
  X,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RewardSnapshot } from "@shared/avatarRewards";
import type { ShopCategory } from "@shared/avatarShop";
import { CardDecorationAssetsProvider, FantasyCard } from "./FantasyCard";

type Page = "collection" | "ledger" | "guide" | "shop" | "gallery";
export function AdminWorldPreview({
  open,
  onOpenChange,
  snapshot,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  snapshot: RewardSnapshot;
}) {
  const catalog = trpc.avatarRewards.adminShopItems.useQuery();
  const [page, setPage] = useState<Page>("collection");
  const [category, setCategory] = useState<ShopCategory>("card_frame");
  const [frame, setFrame] = useState("lunar"),
    [background, setBackground] = useState("classic");
  const [owned, setOwned] = useState(() => new Set<string>());
  const [equippedBgm, setEquippedBgm] = useState<string | null>(null);
  const [worldAssets, setWorldAssets] = useState<Record<string, string>>({});
  const audio = useRef<HTMLAudioElement>(null);
  const image =
    snapshot.cards[0]?.url ??
    snapshot.account.masterUrl ??
    "/avatar-rewards/avatars/official/official_female_avatar.png";
  const products = useMemo(
    () => catalog.data?.filter(x => x.category === category) ?? [],
    [catalog.data, category]
  );
  const decorationAssets = useMemo(
    () => ({
      frames: Object.fromEntries(
        (catalog.data ?? [])
          .filter(x => x.category === "card_frame" && x.assetUrl)
          .map(x => [x.id, x.assetUrl!])
      ),
      backgrounds: Object.fromEntries(
        (catalog.data ?? [])
          .filter(x => x.category === "card_background" && x.assetUrl)
          .map(x => [x.id, x.assetUrl!])
      ),
    }),
    [catalog.data]
  );
  useEffect(() => () => audio.current?.pause(), []);
  const equip = (id: string) => {
    setOwned(current => new Set(current).add(id));
    if (category === "card_frame") setFrame(id);
    else if (category === "card_background") setBackground(id);
    else if (category === "bgm") {
      setEquippedBgm(id);
      const item = catalog.data?.find(x => x.id === id);
      if (audio.current && item?.assetUrl) {
        audio.current.src = item.assetUrl;
        void audio.current.play();
      }
    } else if (category === "world_background")
      setWorldAssets(catalog.data?.find(x => x.id === id)?.assets ?? {});
  };
  const panelStyle = {
    "--av-world-background": worldAssets.world_background
      ? `url(${JSON.stringify(worldAssets.world_background)})`
      : undefined,
    "--av-slider-track-base": worldAssets.slider_track_base
      ? `url(${JSON.stringify(worldAssets.slider_track_base)})`
      : undefined,
    "--av-slider-track-fill": worldAssets.slider_track_fill
      ? `url(${JSON.stringify(worldAssets.slider_track_fill)})`
      : undefined,
    "--av-slider-thumb": worldAssets.slider_thumb
      ? `url(${JSON.stringify(worldAssets.slider_thumb)})`
      : undefined,
    "--av-bgm-panel": worldAssets.bgm_panel
      ? `url(${JSON.stringify(worldAssets.bgm_panel)})`
      : undefined,
  } as CSSProperties;
  return (
    <CardDecorationAssetsProvider value={decorationAssets}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="reward-dialog avatar-theme admin-world-preview"
          showCloseButton={false}
          style={panelStyle}
        >
          <audio ref={audio} loop />
          <div className="reward-dialog-body">
            <div className="reward-heading">
              <div>
                <span className="av-kicker">ADMIN SANDBOX · ∞ P</span>
                <DialogTitle>해밀월드 미리보기</DialogTitle>
                <DialogDescription>
                  실제 학생 데이터에 기록되지 않는 관리자 테스트 공간
                </DialogDescription>
              </div>
              <div className="avatar-brand">
                haemil<small>THE COLLECTION</small>
              </div>
              <button
                className="admin-world-close"
                aria-label="관리자 미리보기 닫기"
                onClick={() => onOpenChange(false)}
              >
                <X />
              </button>
            </div>
            {page === "collection" && (
              <section>
                <div className="av-section-intro">
                  <span className="av-kicker">UNLIMITED PREVIEW</span>
                  <h3>컬렉션 장식 테스트</h3>
                  <p>상점 상품을 포인트 차감 없이 조합해 볼 수 있어요.</p>
                  <b>∞ P</b>
                </div>
                <div className="admin-preview-card">
                  <FantasyCard
                    url={image}
                    title="관리자 테스트 카드"
                    frame={frame}
                    background={background}
                    representative
                  />
                </div>
              </section>
            )}
            {page === "ledger" && (
              <section className="admin-preview-message">
                <ScrollText />
                <h3>관리자 테스트 포인트</h3>
                <strong>∞ P</strong>
                <p>이 미리보기 안에서는 포인트가 차감되지 않습니다.</p>
              </section>
            )}
            {page === "guide" && (
              <section className="admin-preview-message">
                <CircleHelp />
                <h3>운영 전 점검 공간</h3>
                <p>
                  학생 화면과 같은 카드 무드로 상품 이름·등급·가격·이미지를
                  확인하세요. 여기서 한 선택은 학생 계정에 저장되지 않습니다.
                </p>
              </section>
            )}
            {page === "gallery" && (
              <section className="admin-preview-message">
                <Heart />
                <h3>광장 카드 확인</h3>
                <p>
                  선택한 학생의 대표 이미지를 원형과 카드 형태로 빠르게 확인할
                  수 있습니다.
                </p>
                <div className="constellation-orbit">
                  <img src={image} alt="광장 원형 미리보기" />
                </div>
              </section>
            )}
            {page === "shop" && (
              <section className="universe-shop">
                <div className="av-section-intro">
                  <span className="av-kicker">ADMIN ATELIER</span>
                  <h3>상점 상품 무제한 테스트</h3>
                  <b>∞ P</b>
                </div>
                <div className="av-tabs admin-preview-categories">
                  {(
                    [
                      "card_frame",
                      "card_background",
                      "world_background",
                      "bgm",
                    ] as ShopCategory[]
                  ).map(x => (
                    <button
                      key={x}
                      aria-pressed={category === x}
                      onClick={() => setCategory(x)}
                    >
                      {
                        {
                          card_frame: "프레임",
                          card_background: "카드 배경",
                          world_background: "전체 배경",
                          bgm: "BGM",
                        }[x]
                      }
                    </button>
                  ))}
                </div>
                <div className="admin-preview-products">
                  {products.map(item => (
                    <article key={item.id}>
                      <span>
                        {item.rank} · {item.season}
                      </span>
                      <h4>{item.name}</h4>
                      <p>{item.description}</p>
                      {(item.assets?.world_background ?? item.assetUrl) &&
                        item.category !== "bgm" && (
                          <img
                            src={
                              item.assets?.world_background ?? item.assetUrl!
                            }
                            alt=""
                          />
                        )}
                      <button onClick={() => equip(item.id)}>
                        {category === "bgm" && equippedBgm === item.id
                          ? "재생 중"
                          : owned.has(item.id)
                            ? "테스트 장착"
                            : "∞ P로 테스트"}
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
            <nav className="reward-links" aria-label="관리자 해밀월드 메뉴">
              {(
                [
                  ["collection", "컬렉션", Layers],
                  ["ledger", "포인트", ScrollText],
                  ["guide", "안내", CircleHelp],
                  ["shop", "상점", Store],
                  ["gallery", "광장", Heart],
                ] as const
              ).map(([id, label, Icon]) => (
                <button
                  key={id}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => setPage(id)}
                >
                  <Icon size={18} />
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </DialogContent>
      </Dialog>
    </CardDecorationAssetsProvider>
  );
}
