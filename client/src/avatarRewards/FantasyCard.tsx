import { toast } from "sonner";
import { renderCollectionCard, downloadCollectionCard } from "./cardExport";
import {
  useAvatarBackGuard,
  AvatarNavigationContext,
} from "./avatarNavigation";
import {
  useState,
  useEffect,
  useRef,
  useContext,
  createContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Crown, Expand, Moon, Sparkles, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import type { FrameId, BackgroundId } from "@shared/avatarCollection";
type CardDecorationAssets = {
  frames: Record<string, string>;
  backgrounds: Record<string, string>;
};
const CardDecorationAssetsContext = createContext<CardDecorationAssets>({
  frames: {},
  backgrounds: {},
});
export function CardDecorationAssetsProvider({
  value,
  children,
}: {
  value: CardDecorationAssets;
  children: ReactNode;
}) {
  return (
    <CardDecorationAssetsContext.Provider value={value}>
      {children}
    </CardDecorationAssetsContext.Provider>
  );
}
export type Artwork = {
  url: string;
  title: string;
  frame?: FrameId;
  background?: BackgroundId;
  frameAssetUrl?: string;
  backgroundAssetUrl?: string;
  origin?: { x: number; y: number; width: number; height: number };
};
export function ArtworkPortal({
  art,
  onClose,
}: {
  art: Artwork | null;
  onClose: () => void;
}) {
  const [fullscreen, setFullscreen] = useState(false);
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ distance: number; scale: number } | null>(null);
  const [rendered, setRendered] = useState<{ blob: Blob; url: string } | null>(
    null
  );
  const [error, setError] = useState(false);
  const inherited = useContext(AvatarNavigationContext);
  const decorationAssets = useContext(CardDecorationAssetsContext);
  useAvatarBackGuard(!!art, onClose, !inherited);
  useEffect(() => {
    setFullscreen(false);
    setView({ scale: 1, x: 0, y: 0 });
    setError(false);
    setRendered(null);
    if (!art) return;
    let disposed = false,
      objectUrl = "";
    const frameAssetUrl =
      art.frameAssetUrl ??
      (art.frame ? decorationAssets.frames[art.frame] : undefined);
    const backgroundAssetUrl =
      art.backgroundAssetUrl ??
      (art.background
        ? decorationAssets.backgrounds[art.background]
        : undefined);
    renderCollectionCard(
      art.url,
      art.frame,
      art.background,
      frameAssetUrl,
      backgroundAssetUrl
    )
      .then(blob => {
        if (disposed) return;
        objectUrl = URL.createObjectURL(blob);
        setRendered({ blob, url: objectUrl });
      })
      .catch(() => {
        if (!disposed) setError(true);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [
    art?.url,
    art?.frame,
    art?.background,
    art?.frameAssetUrl,
    art?.backgroundAssetUrl,
    decorationAssets,
  ]);
  const origin = art?.origin;
  const originStyle = origin
    ? ({
        "--origin-x": origin.x + origin.width / 2 - innerWidth / 2 + "px",
        "--origin-y": origin.y + origin.height / 2 - innerHeight / 2 + "px",
      } as CSSProperties)
    : undefined;
  return (
    <Dialog
      open={!!art}
      onOpenChange={v => {
        if (!v) {
          onClose();
          setFullscreen(false);
        }
      }}
    >
      <DialogContent
        className={"avatar-theme art-portal" + (origin ? " from-orbit" : "")}
        style={originStyle}
        showCloseButton={false}
      >
        <header>
          <div>
            <span className="av-kicker">THE ARTIFACT</span>
            <DialogTitle>{art?.title}</DialogTitle>
            <DialogDescription>한 장에 담긴 나만의 세계</DialogDescription>
          </div>
          <DialogClose asChild>
            <button aria-label="그림 확대 닫기" type="button">
              <X />
            </button>
          </DialogClose>
        </header>
        <button
          type="button"
          className="art-viewport"
          aria-label="카드 전체 화면으로 보기"
          onClick={() => rendered && setFullscreen(true)}
        >
          <div>
            {art &&
              (rendered ? (
                <img draggable={false} src={rendered.url} alt={art.title} />
              ) : (
                <div className="card-render-placeholder" role="status">
                  {error
                    ? "이미지를 불러오지 못했어요. 닫은 뒤 다시 열어 주세요."
                    : "카드를 펼치는 중…"}
                </div>
              ))}
          </div>
        </button>
        <p className="fullscreen-hint">
          <Expand size={16} />
          카드를 한 번 더 누르면 전체 화면으로 열려요. 두 손가락으로 확대·축소할
          수 있어요.
        </p>
        <button
          type="button"
          className="card-download"
          disabled={!rendered}
          onClick={() => {
            if (rendered) {
              downloadCollectionCard(rendered.blob);
              toast.success("프레임 포함 카드를 저장했어요.");
            }
          }}
        >
          {error
            ? "이미지를 다시 열어 주세요"
            : rendered
              ? "프레임 포함 이미지 저장"
              : "카드를 준비하는 중…"}
        </button>
        <p className="av-subtle">
          이름·학년·좋아요·식별자와 원본 메타데이터 없이 카드 그림만 저장해요.
        </p>
        <p className="av-subtle">
          전체 화면에서 한 손가락으로 이동하고 두 손가락으로 확대해 감상하세요.
        </p>
        {fullscreen && rendered && (
          <div
            className="card-fullscreen"
            role="dialog"
            aria-label="전체 화면 카드"
            onPointerDown={e => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pointers.current.size === 2) {
                const [a, b] = Array.from(pointers.current.values());
                gesture.current = {
                  distance: Math.hypot(a.x - b.x, a.y - b.y),
                  scale: view.scale,
                };
              }
            }}
            onPointerMove={e => {
              const old = pointers.current.get(e.pointerId);
              if (!old) return;
              pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
              if (pointers.current.size >= 2) {
                const [a, b] = Array.from(pointers.current.values());
                const distance = Math.hypot(a.x - b.x, a.y - b.y);
                const start = gesture.current;
                if (start)
                  setView(v => ({
                    ...v,
                    scale: Math.max(
                      1,
                      Math.min(4, (start.scale * distance) / start.distance)
                    ),
                  }));
              } else
                setView(v => ({
                  ...v,
                  x: v.x + e.clientX - old.x,
                  y: v.y + e.clientY - old.y,
                }));
            }}
            onPointerUp={e => {
              pointers.current.delete(e.pointerId);
              gesture.current = null;
            }}
            onPointerCancel={e => {
              pointers.current.delete(e.pointerId);
              gesture.current = null;
            }}
          >
            <button
              className="card-fullscreen-close"
              type="button"
              aria-label="전체 화면 닫기"
              onClick={() => setFullscreen(false)}
            >
              <X />
            </button>
            <img
              draggable={false}
              src={rendered.url}
              alt={art?.title}
              style={{
                transform: `translate3d(${view.x}px,${view.y}px,0) scale(${view.scale})`,
              }}
            />
            <span>한 손가락으로 이동 · 두 손가락으로 확대/축소</span>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
export function FantasyCard({
  url,
  title,
  frame = "lunar",
  background = "classic",
  representative = false,
  selected = false,
  onOpen,
  children,
  frameAssetUrl,
  backgroundAssetUrl,
}: {
  url: string;
  title: string;
  frame?: FrameId;
  background?: BackgroundId;
  representative?: boolean;
  selected?: boolean;
  onOpen?: () => void;
  children?: ReactNode;
  frameAssetUrl?: string;
  backgroundAssetUrl?: string;
}) {
  const [ripple, setRipple] = useState(0);
  const decorationAssets = useContext(CardDecorationAssetsContext);
  const resolvedFrameAsset = frameAssetUrl ?? decorationAssets.frames[frame];
  const resolvedBackgroundAsset =
    backgroundAssetUrl ?? decorationAssets.backgrounds[background];
  return (
    <article
      className={`fantasy-card frame-${frame} backdrop-${background} ${representative ? "is-representative" : ""} ${selected ? "is-selected" : ""}`}
    >
      <div className="card-celestial" aria-hidden="true">
        <span>✧</span>
        <Moon size={22} />
        <span>✧</span>
      </div>
      <button
        type="button"
        className={`card-art ${resolvedFrameAsset ? "has-custom-frame" : ""} ${resolvedBackgroundAsset ? "has-custom-background" : ""}`}
        onPointerDown={() => setRipple(n => n + 1)}
        onClick={onOpen}
        aria-label={title + " 확대 보기"}
      >
        {resolvedBackgroundAsset && (
          <img
            className="card-background-asset"
            src={resolvedBackgroundAsset}
            alt=""
            aria-hidden="true"
          />
        )}
        <span className="card-corner tl" />
        <span className="card-corner tr" />
        <span className="card-corner bl" />
        <span className="card-corner br" />
        <img className="card-character" loading="lazy" src={url} alt={title} />
        <svg
          className="card-filigree"
          viewBox="0 0 300 400"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g fill="none" stroke="currentColor" strokeWidth=".8">
            <path d="M12 95V55Q12 12 60 12H110M288 95V55Q288 12 240 12H190M12 310V365Q12 388 42 388H110M288 310V365Q288 388 258 388H190" />
            <path d="M15 62Q52 64 52 16M15 44Q38 43 38 16M15 30Q26 31 26 16M285 62Q248 64 248 16M285 44Q262 43 262 16M285 30Q274 31 274 16" />
            <path d="M15 347Q52 347 52 385M15 365Q34 363 34 385M285 347Q248 347 248 385M285 365Q266 363 266 385" />
            <path d="M100 12L115 7L130 12L115 17ZM200 12L185 7L170 12L185 17ZM90 388L110 383L130 388L110 393ZM210 388L190 383L170 388L190 393Z" />
            <circle cx="22" cy="80" r="3" />
            <circle cx="278" cy="80" r="3" />
            <circle cx="22" cy="330" r="3" />
            <circle cx="278" cy="330" r="3" />
            <path d="M22 100v20m-7-10h14M278 100v20m-7-10h14M22 300v20m-7-10h14M278 300v20m-7-10h14" />
          </g>
        </svg>
        <span
          key={ripple}
          className={"card-glint" + (ripple ? " is-rippling" : "")}
        />
        {resolvedFrameAsset && (
          <img
            className="card-frame-asset"
            src={resolvedFrameAsset}
            alt=""
            aria-hidden="true"
          />
        )}
        <span className="card-expand">
          <Expand size={16} />
        </span>
      </button>
      <div className="card-inscription">
        <Sparkles size={12} />
        <span>{title}</span>
        <Sparkles size={12} />
      </div>
      {representative && (
        <div className="card-status">
          <Crown size={15} />
          현재 대표
        </div>
      )}
      {!representative && selected && (
        <div className="card-status selected-status">선택한 카드</div>
      )}
      {children && <div className="card-actions">{children}</div>}
    </article>
  );
}
