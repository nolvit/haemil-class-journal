import {
  avatarOrderPrice,
  modeSurcharge,
  randomPrice,
} from "@shared/avatarRewardRules";
import {
  useAvatarBackGuard,
  AvatarNavigationContext,
} from "./avatarNavigation";
import {
  useState,
  useRef,
  useLayoutEffect,
  useMemo,
  type CSSProperties,
} from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  UserRound,
  Sparkles,
  ArrowLeft,
  Plus,
  X,
  Layers,
  ScrollText,
  Coins,
  House,
  Store,
  Heart,
} from "lucide-react";
import {
  modeLabels,
  modeDescriptions,
  type RewardOrderInput,
} from "@shared/avatarRewards";
import { Stylebook } from "./Stylebook";
import {
  imagination,
  imaginationFields,
  randomSuggestion,
} from "@shared/avatarImagination";
import {
  avatarThemes,
  chooseThemePreset,
  type AvatarTheme,
} from "@shared/avatarThemes";
import "./rewards.css";
import "./avatar-theme.css";
import {
  FantasyCard,
  ArtworkPortal,
  CardDecorationAssetsProvider,
  type Artwork,
} from "./FantasyCard";
import {
  AvatarShop,
  AvatarGallery,
  CardSharing,
  WorldThemeCollection,
} from "./AvatarUniverse";
import type { Wardrobe } from "@shared/avatarCollection";
import { AvatarBgmCollection, AvatarBgmPlayer } from "./AvatarBgm";
import { themedRangeStyle } from "./themedRange";

const emptyOrder: RewardOrderInput = {
  selectedParts: [],
  top: "",
  bottom: "",
  shoes: "",
  hair: "",
  background: "",
  pet: "",
  pose: "",
  extra: "",
  accessories: [],
  mode: "original",
};
export function AvatarRewards({
  token,
  studentId,
}: {
  token: string;
  studentId: number;
}) {
  const identity = { token, studentId };
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState<
    "home" | "order" | "collection" | "ledger" | "points" | "shop" | "gallery"
  >("home");
  const [order, setOrder] = useState<RewardOrderInput>(emptyOrder);
  const [randomTheme, setRandomTheme] = useState<AvatarTheme>("판타지");
  const randomConfirmed = useRef(false);
  const [cropY, setCropY] = useState<number | null>(null);
  const [cropX, setCropX] = useState<number | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(
    null
  );
  const [sharingDirtyCards, setSharingDirtyCards] = useState<Set<string>>(
    () => new Set()
  );
  const query = trpc.avatarRewards.snapshot.useQuery(identity, {
    refetchInterval: open ? 15_000 : 60_000,
    retry: false,
  });
  const wardrobeQuery = trpc.avatarRewards.wardrobe.useQuery(identity, {
    retry: false,
  });
  const worldThemeQuery = trpc.avatarRewards.worldThemeState.useQuery(
    identity,
    {
      retry: false,
    }
  );
  const wardrobe: Wardrobe = wardrobeQuery.data ?? {
    equipped: "lunar",
    background: "classic",
    owned: ["lunar"],
    ownedBackgrounds: ["classic"],
    cropZoom: 300,
    sharing: [],
    cardStyles: {},
    cardFrames: {},
    cardBackgrounds: {},
    decorationAssets: { frames: {}, backgrounds: {} },
  };
  const decorationAssets = useMemo(
    () => wardrobe.decorationAssets,
    [wardrobe.decorationAssets]
  );
  const [art, setArt] = useState<Artwork | null>(null);
  const [selectedCard, setSelectedCard] = useState<string | null>(null);
  const [collectionTab, setCollectionTab] = useState<
    "cards" | "decorations" | "worlds" | "bgm"
  >("cards");
  const [zoom, setZoom] = useState<number | null>(null);
  const zoomMutation = trpc.avatarRewards.cropZoom.useMutation({
    onSuccess: () => {
      setZoom(null);
      void wardrobeQuery.refetch();
      toast.success("확대 비율을 저장했어요.");
    },
    onError: e => toast.error(e.message),
  });
  const refresh = () => {
    void wardrobeQuery.refetch();
    return query.refetch();
  };
  const onError = (e: { message: string }) => toast.error(e.message);
  const randomCharge = trpc.avatarRewards.randomCharge.useMutation({ onError });
  const submit = trpc.avatarRewards.submit.useMutation({
    onError,
    onSuccess: () => {
      setPage("home");
      setOrder(emptyOrder);
      void refresh();
      toast.success(
        "창조의 여정이 시작되었어요. 두 장의 카드가 완성되면 선택할 수 있어요."
      );
    },
  });
  const select = trpc.avatarRewards.select.useMutation({
    onError,
    onSuccess: () => {
      setSelectedCandidate(null);
      setPage("collection");
      void refresh();
      toast.success("내 컬렉션에 저장했어요!");
    },
  });
  const representative = trpc.avatarRewards.representative.useMutation({
    onError,
    onSuccess: () => {
      setCropY(null);
      setCropX(null);
      void refresh();
      toast.success("대표 사진을 저장했어요.");
    },
  });
  const data = query.data;
  const account = data?.account;
  const representativeCard = data?.cards.find(
    c => c.id === account?.representativeId
  );
  const image = representativeCard?.url ?? account?.masterUrl;
  const representativeFrame = representativeCard?.frame ?? wardrobe.equipped;
  const representativeBackground =
    representativeCard?.background ?? wardrobe.background;
  const active = data?.orders.find(
    o => o.status === "submitted" || o.status === "ready"
  );
  const busy = submit.isPending || select.isPending || representative.isPending;
  const position = cropY ?? account?.cropY ?? 0;
  const horizontal = cropX ?? account?.cropX ?? 50;
  const cropDirty = cropY !== null || cropX !== null || zoom !== null;
  const hasUnsavedCrop = cropDirty || sharingDirtyCards.size > 0;
  const confirmDiscardCrop = () =>
    !hasUnsavedCrop ||
    window.confirm(
      "저장하지 않은 원형 프로필 조정이 있어요. 이동하면 변경 내용이 사라집니다. 이동할까요?"
    );
  const navigate = (next: typeof page) => {
    if (page === "collection" && !confirmDiscardCrop()) return;
    setCropY(null);
    setCropX(null);
    setZoom(null);
    setSharingDirtyCards(new Set());
    setPage(next);
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const closeAvatar = () => {
    if (!confirmDiscardCrop()) return;
    setOpen(false);
    setArt(null);
    setSelectedCandidate(null);
    setSharingDirtyCards(new Set());
  };
  useAvatarBackGuard(open, closeAvatar);
  useLayoutEffect(() => {
    if (open) scrollRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);
  const totalPrice = avatarOrderPrice(
    account?.completedOrders ?? 0,
    order.mode,
    order.selectedParts.length,
    order.accessories.length
  );
  const currentRandomPrice = randomPrice(account?.completedOrders ?? 0);
  const currentAllRandomPrice = randomPrice(
    account?.completedOrders ?? 0,
    true
  );
  const useRandom = async (all: boolean, apply: () => void) => {
    const price = all ? currentAllRandomPrice : currentRandomPrice;
    if (!randomConfirmed.current) {
      if (
        !window.confirm(
          `랜덤은 누르는 즉시 ${price}P가 차감됩니다. 계속할까요?`
        )
      )
        return;
      randomConfirmed.current = true;
    }
    try {
      await randomCharge.mutateAsync({
        ...identity,
        all,
        requestId: crypto.randomUUID(),
      });
      apply();
      void query.refetch();
    } catch {}
  };
  const openArt = (value: Artwork) =>
    setArt({
      ...value,
      frame: value.frame ?? wardrobe.equipped,
      background: value.background ?? wardrobe.background,
    });
  const worldAssets = worldThemeQuery.data?.assets ?? {};
  const assetImage = (url?: string) =>
    url ? `url(${JSON.stringify(url)})` : undefined;
  const worldStyle = {
    "--av-world-background": assetImage(worldAssets.world_background),
    "--av-slider-track-base": assetImage(worldAssets.slider_track_base),
    "--av-slider-track-fill": assetImage(worldAssets.slider_track_fill),
    "--av-slider-thumb": assetImage(worldAssets.slider_thumb),
    "--av-bgm-panel": assetImage(worldAssets.bgm_panel),
  } as CSSProperties;
  return (
    <CardDecorationAssetsProvider value={decorationAssets}>
      <AvatarNavigationContext.Provider value={true}>
        <Dialog
          open={open}
          onOpenChange={v => {
            if (!v) closeAvatar();
            else {
              setOpen(true);
              setPage("home");
            }
          }}
        >
          <DialogTrigger asChild>
            <button
              className="reward-profile"
              aria-label="내 아바타와 출석 포인트"
              title="내 아바타와 출석 포인트"
            >
              {image ? (
                <img
                  src={image}
                  alt="대표 아바타"
                  style={{
                    objectPosition: `${horizontal}% ${position}%`,
                    transform: `scale(${(zoom ?? wardrobe.cropZoom) / 100})`,
                    transformOrigin: `${horizontal}% ${position}%`,
                  }}
                />
              ) : (
                <UserRound size={25} />
              )}
              {active?.status === "ready" && <span className="reward-dot" />}
            </button>
          </DialogTrigger>
          <DialogContent
            className="reward-dialog avatar-theme"
            data-world-theme={
              worldThemeQuery.data?.equipped ?? "starlight-court"
            }
            style={worldStyle}
            data-swipe-disabled
          >
            <AvatarBgmPlayer identity={identity} open={open} />
            <div className="reward-dialog-body reward-dialog-layout">
              <div ref={scrollRef} className="reward-dialog-scroll">
                <div className="reward-heading">
                  {page !== "home" && (
                    <button
                      aria-label={
                        page === "ledger" ? "포인트로" : "아바타 홈으로"
                      }
                      onClick={() =>
                        navigate(page === "ledger" ? "points" : "home")
                      }
                    >
                      <ArrowLeft size={20} />
                    </button>
                  )}
                  <div>
                    <DialogTitle>
                      {
                        {
                          home: "나의 아바타",
                          order: "스페셜 아바타 주문",
                          collection: "내 컬렉션",
                          ledger: "포인트 장부",
                          points: "포인트",
                          shop: "별빛 상점",
                          gallery: "별빛 광장",
                        }[page]
                      }
                    </DialogTitle>
                    <DialogDescription>
                      꾸준히 쌓은 배움, 나다운 모습으로.
                    </DialogDescription>
                  </div>
                  <div className="avatar-brand">
                    haemil<small>THE COLLECTION</small>
                  </div>
                </div>
                {query.isLoading && (
                  <p role="status">아바타를 불러오는 중이에요…</p>
                )}
                {query.error && (
                  <div role="alert">
                    <p>아바타 정보를 불러오지 못했어요.</p>
                    <Button onClick={() => void refresh()}>다시 시도</Button>
                  </div>
                )}
                {data && account && (
                  <>
                    {page === "home" && (
                      <>
                        <div className="reward-portrait">
                          {image ? (
                            <FantasyCard
                              url={image}
                              title="나의 아바타"
                              frame={representativeFrame}
                              background={representativeBackground}
                              representative
                              onOpen={() =>
                                openArt({
                                  url: image,
                                  title: "나의 아바타",
                                  frame: representativeFrame,
                                  background: representativeBackground,
                                })
                              }
                            />
                          ) : (
                            <div className="reward-empty">
                              <UserRound size={52} />
                              <p>아직 깨어나지 않은 첫 번째 카드예요.</p>
                              <small>포인트는 수업한 만큼 먼저 쌓여요.</small>
                            </div>
                          )}
                        </div>
                        <div className="reward-points">
                          <div>
                            <small>사용 가능 포인트</small>
                            <strong>
                              {account.balance.toLocaleString()} <span>P</span>
                            </strong>
                          </div>
                          <div>
                            <small>누적 획득</small>
                            <b>{account.lifetime.toLocaleString()} P</b>
                          </div>
                        </div>
                        <div className="reward-progress">
                          <Button
                            variant="outline"
                            className="reward-ledger-button"
                            onClick={() => navigate("ledger")}
                          >
                            내 포인트 적립·사용 내역 보기
                          </Button>
                          <div>
                            <span>다음 스페셜 아바타</span>
                            <b>{data.nextPrice.toLocaleString()} P</b>
                          </div>
                          <progress
                            value={Math.max(0, account.balance)}
                            max={data.nextPrice}
                          />
                          <small>
                            {Math.max(
                              0,
                              data.nextPrice - account.balance
                            ).toLocaleString()}
                            P 더 모으면 만들 수 있어요.
                          </small>
                        </div>
                        {active?.status === "submitted" && (
                          <div className="reward-note">
                            창조의 여정이 진행 중이에요. 두 장의 카드가 완성되면
                            빛을 발할 거예요.
                          </div>
                        )}
                        {active?.status === "ready" && (
                          <section className="reward-arrival">
                            <h3>
                              {active.source === "admin_gift"
                                ? "아바타 선물이 도착했어요!"
                                : "선택할 아바타가 도착했어요!"}
                            </h3>
                            <p>
                              {active.source === "admin_gift"
                                ? "원장님이 준비한 두 장 중 마음에 드는 한 장을 골라 주세요. 포인트는 차감되지 않아요."
                                : "마음에 드는 한 장을 골라 주세요."}
                            </p>
                            <div className="universe-grid">
                              {active.candidates.map((c, i) => (
                                <FantasyCard
                                  key={c.id}
                                  url={c.url}
                                  title={`후보 ${i + 1}`}
                                  frame={wardrobe.equipped}
                                  background={wardrobe.background}
                                  selected={selectedCandidate === c.id}
                                  onOpen={() =>
                                    openArt({
                                      url: c.url,
                                      title: `후보 ${i + 1}`,
                                    })
                                  }
                                >
                                  <button
                                    type="button"
                                    aria-label={`후보 ${i + 1}`}
                                    aria-pressed={selectedCandidate === c.id}
                                    onClick={() => setSelectedCandidate(c.id)}
                                  >
                                    {selectedCandidate === c.id
                                      ? "선택됨"
                                      : "이 카드 선택"}
                                  </button>
                                </FantasyCard>
                              ))}
                            </div>
                            <Button
                              disabled={!selectedCandidate || busy}
                              onClick={() =>
                                select.mutate({
                                  ...identity,
                                  orderId: active.id,
                                  candidateId: selectedCandidate!,
                                })
                              }
                            >
                              이 아바타로 확정
                            </Button>
                            <small>
                              확정한 한 장이 컬렉션에 저장되며 선택은 변경할 수
                              없어요.
                            </small>
                          </section>
                        )}
                        {!active &&
                          account.balance >= data.nextPrice &&
                          account.masterUrl && (
                            <Button
                              className="reward-primary"
                              onClick={() => navigate("order")}
                            >
                              <Sparkles size={16} />
                              스페셜 아바타 만들기
                            </Button>
                          )}
                        <Stylebook />
                      </>
                    )}
                    {page === "points" && (
                      <div className="reward-guide">
                        <h3>수업한 만큼 포인트가 쌓여요!</h3>
                        <p>
                          실제 수업시간 <b>1분마다 1P</b>, 하루 최대 <b>150P</b>
                          가 자동으로 적립돼요.
                        </p>
                        <div className="reward-note">
                          <b>하원 기록까지 꼭 완료해 주세요.</b>
                          <p>
                            하원 기록이 없으면 그날은 0P예요. 출결 기록이
                            수정되면 포인트도 다시 계산돼요.
                          </p>
                        </div>
                        <h3>좋아요 보상 · 10P</h3>
                        <p>
                          공개한 카드에 다른 학생이 처음 좋아요를 보내면 10P를
                          받아요. 같은 학생이 같은 카드의 좋아요를 취소해도 이미
                          받은 보상은 유지되며, 다시 눌러도 추가 지급되지
                          않아요.
                        </p>
                        <h3>스페셜 아바타 제작 포인트</h3>
                        <p>
                          생성 시도가 거듭될수록 더 많은 포인트가 필요해요.{" "}
                          <b>4회차부터 비용은 고정됩니다.</b>
                        </p>
                        <ol>
                          {[
                            "기본 생성 · 50 / 100 / 150 / 200P",
                            "선택한 부위마다 · 10 / 15 / 20 / 30P",
                            "장신구마다 · 5 / 10 / 15 / 15P",
                          ].map(t => (
                            <li key={t}>{t}</li>
                          ))}
                        </ol>
                        <p>
                          오리지널은 추가 요금이 없고{" "}
                          <b>워너비 +100P · 슈퍼스타 +200P</b>는 회차와 관계없이
                          같아요. 부위 랜덤은 1/2/3/5P, 전체 랜덤은
                          10/20/30/50P가 버튼을 누르는 즉시 차감돼요.
                        </p>
                        <p>
                          주문할 때 포인트를 사용하며, 취소가 필요하면 학원에
                          문의해 주세요. 대표 이미지 변경은 무료예요. 누적 획득
                          포인트는 사용해도 줄지 않지만, 출결 정정은 반영돼요.
                          추가로 획득한 보너스는 누적 획득에도 포함되며, 관리자
                          차감은 사용 가능 포인트만 줄어요.
                        </p>
                        <small>
                          새 포인트 적립은 2026년 9월 9일 수업부터 적용돼요.
                          출결 정정으로 잔액이 음수가 되면 이후 적립으로
                          보충돼요.
                        </small>
                        <Button
                          variant="outline"
                          className="reward-ledger-button reward-guide-ledger"
                          onClick={() => navigate("ledger")}
                        >
                          <ScrollText size={17} />
                          포인트 적립·사용 장부 보기
                        </Button>
                      </div>
                    )}
                    {page === "ledger" && (
                      <div className="reward-ledger">
                        {data.ledger.length ? (
                          data.ledger.map(l => (
                            <div key={l.id}>
                              <span>
                                {l.reason}
                                <small>{l.createdAt}</small>
                              </span>
                              <b className={l.delta > 0 ? "positive" : ""}>
                                {l.delta > 0 ? "+" : ""}
                                {l.delta.toLocaleString()} P
                              </b>
                            </div>
                          ))
                        ) : (
                          <p>아직 포인트 내역이 없어요.</p>
                        )}
                        <small>최근 500개 내역을 표시해요.</small>
                      </div>
                    )}
                    {page === "collection" && (
                      <>
                        <div
                          className="collection-tabs"
                          role="tablist"
                          aria-label="컬렉션 종류"
                        >
                          <button
                            role="tab"
                            aria-selected={collectionTab === "cards"}
                            onClick={() => setCollectionTab("cards")}
                          >
                            아바타 카드
                          </button>
                          <button
                            role="tab"
                            aria-selected={collectionTab === "worlds"}
                            onClick={() => setCollectionTab("worlds")}
                          >
                            전체 배경
                          </button>
                          <button
                            role="tab"
                            aria-selected={collectionTab === "decorations"}
                            onClick={() => setCollectionTab("decorations")}
                          >
                            카드 장식
                          </button>
                          <button
                            role="tab"
                            aria-selected={collectionTab === "bgm"}
                            onClick={() => setCollectionTab("bgm")}
                          >
                            BGM
                          </button>
                        </div>
                        {collectionTab === "cards" && (
                          <>
                            <p>마음에 드는 카드를 대표로 설정해 보세요.</p>
                            <div className="universe-grid">
                              {account.masterUrl && (
                                <FantasyCard
                                  url={account.masterUrl}
                                  title="MASTER"
                                  frame={wardrobe.equipped}
                                  background={wardrobe.background}
                                  representative={!account.representativeId}
                                  selected={selectedCard === "master"}
                                  onOpen={() => {
                                    setSelectedCard("master");
                                    openArt({
                                      url: account.masterUrl!,
                                      title: "마스터 아바타",
                                    });
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      representative.mutate({
                                        ...identity,
                                        cardId: null,
                                        cropY: 0,
                                        cropX: 50,
                                      })
                                    }
                                  >
                                    {!account.representativeId
                                      ? "대표 · 마스터"
                                      : "마스터로 설정"}
                                  </button>
                                </FantasyCard>
                              )}
                              {data.cards.map(c => (
                                <FantasyCard
                                  key={c.id}
                                  url={c.url}
                                  title={`${modeLabels[c.mode as keyof typeof modeLabels]} · ${c.createdAt.slice(0, 10)}`}
                                  frame={c.frame}
                                  background={c.background}
                                  representative={
                                    account.representativeId === c.id
                                  }
                                  selected={selectedCard === c.id}
                                  onOpen={() => {
                                    setSelectedCard(c.id);
                                    openArt({
                                      url: c.url,
                                      title: "내 컬렉션",
                                      frame: c.frame,
                                      background: c.background,
                                    });
                                  }}
                                >
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                      representative.mutate({
                                        ...identity,
                                        cardId: c.id,
                                        cropY: 0,
                                        cropX: 50,
                                      })
                                    }
                                  >
                                    {account.representativeId === c.id
                                      ? "현재 대표"
                                      : "대표로 설정"}
                                  </button>
                                  {wardrobeQuery.data && (
                                    <CardSharing
                                      key={JSON.stringify(
                                        wardrobe.sharing.find(
                                          x => x.cardId === c.id
                                        )
                                      )}
                                      identity={identity}
                                      cardId={c.id}
                                      url={c.url}
                                      wardrobe={wardrobe}
                                      onRefresh={() => void refresh()}
                                      onDirtyChange={dirty =>
                                        setSharingDirtyCards(current => {
                                          if (dirty === current.has(c.id))
                                            return current;
                                          const next = new Set(current);
                                          if (dirty) next.add(c.id);
                                          else next.delete(c.id);
                                          return next;
                                        })
                                      }
                                    />
                                  )}
                                </FantasyCard>
                              ))}
                            </div>
                            {image && (
                              <div className="reward-crop">
                                <h3>원형 사진 위치 조정</h3>
                                <button
                                  type="button"
                                  className="reward-profile preview"
                                  aria-label="원형 사진 크게 보기"
                                  onClick={() =>
                                    openArt({
                                      url: image,
                                      title: "원형 사진 원본",
                                    })
                                  }
                                >
                                  <img
                                    src={image}
                                    alt="원형 사진 미리보기"
                                    style={{
                                      objectPosition: `${horizontal}% ${position}%`,
                                      transform: `scale(${(zoom ?? wardrobe.cropZoom) / 100})`,
                                      transformOrigin: `${horizontal}% ${position}%`,
                                    }}
                                  />
                                </button>
                                <label>
                                  얼굴 위치
                                  <input
                                    className="avatar-themed-range"
                                    aria-label="얼굴 위치"
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={position}
                                    style={themedRangeStyle(position, 0, 100)}
                                    onChange={e =>
                                      setCropY(Number(e.target.value))
                                    }
                                  />
                                </label>
                                <label>
                                  좌우 위치
                                  <input
                                    className="avatar-themed-range"
                                    aria-label="얼굴 좌우 위치"
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={horizontal}
                                    style={themedRangeStyle(horizontal, 0, 100)}
                                    onChange={e =>
                                      setCropX(Number(e.target.value))
                                    }
                                  />
                                </label>
                                <label>
                                  얼굴 확대·축소
                                  <input
                                    className="avatar-themed-range"
                                    aria-label="얼굴 확대 비율"
                                    type="range"
                                    min="100"
                                    max="500"
                                    step="10"
                                    value={zoom ?? wardrobe.cropZoom}
                                    style={themedRangeStyle(
                                      zoom ?? wardrobe.cropZoom,
                                      100,
                                      500
                                    )}
                                    onChange={e =>
                                      setZoom(Number(e.target.value))
                                    }
                                  />
                                  <output>{zoom ?? wardrobe.cropZoom}%</output>
                                </label>
                                <Button
                                  disabled={zoomMutation.isPending}
                                  onClick={() =>
                                    zoomMutation.mutate({
                                      ...identity,
                                      zoom: zoom ?? wardrobe.cropZoom,
                                    })
                                  }
                                >
                                  확대 비율 저장
                                </Button>
                                <Button
                                  disabled={busy}
                                  onClick={() =>
                                    representative.mutate({
                                      ...identity,
                                      cardId: account.representativeId,
                                      cropY: position,
                                      cropX: horizontal,
                                    })
                                  }
                                >
                                  위치 저장
                                </Button>
                              </div>
                            )}
                          </>
                        )}
                        {collectionTab === "worlds" && (
                          <WorldThemeCollection identity={identity} />
                        )}
                        {collectionTab === "decorations" &&
                          wardrobeQuery.data && (
                            <AvatarShop
                              collection
                              identity={identity}
                              wardrobe={wardrobe}
                              cards={data.cards}
                              balance={account.balance}
                              image={
                                image ??
                                "/avatar-rewards/avatars/official/official_female_avatar.png"
                              }
                              onRefresh={() => void refresh()}
                              onOpen={openArt}
                            />
                          )}
                        {collectionTab === "bgm" && (
                          <AvatarBgmCollection identity={identity} />
                        )}
                      </>
                    )}
                    {page === "order" && (
                      <form
                        className="reward-order"
                        onSubmit={e => {
                          e.preventDefault();
                          submit.mutate({ ...identity, order });
                        }}
                      >
                        <div className="reward-note">
                          이번 제작은 <b>{totalPrice.toLocaleString()}P</b>예요.
                          기본 {data.nextPrice.toLocaleString()}P
                          {order.selectedParts.length > 0 &&
                            ` + 선택 부위 ${order.selectedParts.length}개`}
                          {order.accessories.length > 0 &&
                            ` + 장신구 ${order.accessories.length}개`}
                          {modeSurcharge[order.mode] > 0 &&
                            ` + 변신 ${modeSurcharge[order.mode]}P`}
                          .
                        </div>
                        <div className="reward-random-warning" role="alert">
                          <b>랜덤은 누르는 즉시 결제됩니다</b>
                          <span>
                            부위 {currentRandomPrice}P · 전체{" "}
                            {currentAllRandomPrice}P
                          </span>
                        </div>
                        <div className="reward-note reward-theme-picker">
                          <label>
                            랜덤 테마
                            <select
                              value={randomTheme}
                              onChange={e =>
                                setRandomTheme(e.target.value as AvatarTheme)
                              }
                            >
                              {avatarThemes.map(theme => (
                                <option key={theme}>{theme}</option>
                              ))}
                            </select>
                          </label>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={randomCharge.isPending}
                            onClick={() =>
                              void useRandom(true, () => {
                                const preset = chooseThemePreset(randomTheme);
                                setOrder(current => ({
                                  ...current,
                                  ...Object.fromEntries(
                                    imaginationFields.map(([key]) => [
                                      key,
                                      preset[key],
                                    ])
                                  ),
                                  selectedParts: imaginationFields.map(
                                    ([key]) => key
                                  ),
                                  accessories: [preset.accessory],
                                }));
                              })
                            }
                          >
                            전체 랜덤 · {currentAllRandomPrice}P
                          </Button>
                        </div>
                        {imaginationFields.map(([key, label]) => (
                          <div className="reward-field" key={key}>
                            <div className="reward-field-heading">
                              <label htmlFor={"reward-" + key}>
                                <input
                                  type="checkbox"
                                  checked={order.selectedParts.includes(key)}
                                  onChange={e =>
                                    setOrder(current => ({
                                      ...current,
                                      selectedParts: e.target.checked
                                        ? [...current.selectedParts, key]
                                        : current.selectedParts.filter(
                                            x => x !== key
                                          ),
                                      [key]: e.target.checked
                                        ? current[key]
                                        : "",
                                    }))
                                  }
                                />
                                {label} <small>선택</small>
                              </label>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                aria-label={label + " 랜덤"}
                                disabled={randomCharge.isPending}
                                onClick={() =>
                                  void useRandom(false, () =>
                                    setOrder(current => ({
                                      ...current,
                                      selectedParts:
                                        current.selectedParts.includes(key)
                                          ? current.selectedParts
                                          : [...current.selectedParts, key],
                                      [key]: randomSuggestion(
                                        key,
                                        current[key]
                                      ),
                                    }))
                                  )
                                }
                              >
                                랜덤 · {currentRandomPrice}P
                              </Button>
                            </div>
                            <Input
                              id={"reward-" + key}
                              aria-label={label}
                              disabled={!order.selectedParts.includes(key)}
                              required={order.selectedParts.includes(key)}
                              maxLength={key === "extra" ? 600 : 300}
                              placeholder={"예: " + imagination[key][0]}
                              aria-describedby={"example-" + key}
                              value={order[key]}
                              onChange={e =>
                                setOrder({ ...order, [key]: e.target.value })
                              }
                            />
                            <small id={"example-" + key}>
                              예: {imagination[key][0]}
                            </small>
                          </div>
                        ))}
                        <label>
                          장신구 <small>선택 · 최대 8개</small>
                        </label>
                        {order.accessories.map((v, i) => (
                          <div className="reward-accessory" key={i}>
                            <Input
                              aria-label={`장신구 ${i + 1}`}
                              required
                              maxLength={200}
                              placeholder={"예: " + imagination.accessory[0]}
                              value={v}
                              onChange={e =>
                                setOrder({
                                  ...order,
                                  accessories: order.accessories.map((x, j) =>
                                    i === j ? e.target.value : x
                                  ),
                                })
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              aria-label={`장신구 ${i + 1} 랜덤`}
                              disabled={randomCharge.isPending}
                              onClick={() =>
                                void useRandom(false, () =>
                                  setOrder(current => ({
                                    ...current,
                                    accessories: current.accessories.map(
                                      (a, j) =>
                                        i === j
                                          ? randomSuggestion("accessory", a)
                                          : a
                                    ),
                                  }))
                                )
                              }
                            >
                              랜덤 · {currentRandomPrice}P
                            </Button>
                            <button
                              type="button"
                              aria-label={`장신구 ${i + 1} 삭제`}
                              onClick={() =>
                                setOrder({
                                  ...order,
                                  accessories: order.accessories.filter(
                                    (_, j) => i !== j
                                  ),
                                })
                              }
                            >
                              <X size={18} />
                            </button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          type="button"
                          disabled={order.accessories.length >= 8}
                          onClick={() =>
                            setOrder({
                              ...order,
                              accessories: [...order.accessories, ""],
                            })
                          }
                        >
                          <Plus size={16} />
                          장신구 추가
                        </Button>
                        <fieldset>
                          <legend>변신 정도</legend>
                          {Object.entries(modeLabels).map(([mode, label]) => (
                            <label className="reward-mode" key={mode}>
                              <input
                                type="radio"
                                name="mode"
                                value={mode}
                                checked={order.mode === mode}
                                onChange={() =>
                                  setOrder({
                                    ...order,
                                    mode: mode as RewardOrderInput["mode"],
                                  })
                                }
                              />
                              <span>
                                <b>
                                  {label} · 추가{" "}
                                  {
                                    modeSurcharge[
                                      mode as keyof typeof modeSurcharge
                                    ]
                                  }
                                  P
                                </b>
                                <small>
                                  {
                                    modeDescriptions[
                                      mode as keyof typeof modeDescriptions
                                    ]
                                  }
                                </small>
                              </span>
                            </label>
                          ))}
                        </fieldset>
                        <Stylebook />
                        <Button
                          type="submit"
                          className="reward-primary"
                          disabled={busy || account.balance < totalPrice}
                        >
                          {submit.isPending
                            ? "보내는 중…"
                            : `${totalPrice.toLocaleString()}P로 주문 보내기`}
                        </Button>
                      </form>
                    )}
                    {(page === "shop" || page === "collection") &&
                      wardrobeQuery.error && (
                        <button onClick={() => void wardrobeQuery.refetch()}>
                          장식·공개 설정 다시 불러오기
                        </button>
                      )}
                    {page === "shop" && wardrobeQuery.isLoading && (
                      <p role="status">상점을 불러오는 중…</p>
                    )}
                    {page === "shop" && wardrobeQuery.data && (
                      <AvatarShop
                        identity={identity}
                        wardrobe={wardrobe}
                        cards={data.cards}
                        balance={account.balance}
                        image={
                          image ??
                          "/avatar-rewards/avatars/official/official_female_avatar.png"
                        }
                        onRefresh={() => void refresh()}
                        onOpen={openArt}
                      />
                    )}
                    {page === "gallery" && (
                      <AvatarGallery identity={identity} onOpen={openArt} />
                    )}
                  </>
                )}
              </div>
              {data && account && (
                <nav className="reward-links" aria-label="아바타 메뉴">
                  {(
                    [
                      ["collection", "컬렉션", Layers],
                      ["points", "포인트", Coins],
                      ["home", "홈", House],
                      ["shop", "상점", Store],
                      ["gallery", "광장", Heart],
                    ] as const
                  ).map(([id, label, Icon]) => (
                    <button
                      type="button"
                      key={id}
                      className={id === "home" ? "reward-home-tab" : undefined}
                      aria-current={
                        page === id || (id === "points" && page === "ledger")
                          ? "page"
                          : undefined
                      }
                      onClick={() => navigate(id)}
                    >
                      <span className="reward-nav-icon">
                        <Icon size={id === "home" ? 21 : 18} />
                      </span>
                      <span>{label}</span>
                    </button>
                  ))}
                </nav>
              )}
              <ArtworkPortal art={art} onClose={() => setArt(null)} />
            </div>
          </DialogContent>
        </Dialog>
      </AvatarNavigationContext.Provider>
    </CardDecorationAssetsProvider>
  );
}
