import { toast } from "sonner";
import { renderCollectionCard, downloadCollectionCard } from "./cardExport";
import {
  useAvatarBackGuard,
  useBoundedImagePan,
  AvatarNavigationContext,
} from "./avatarNavigation";
import {
  useState,
  useEffect,
  useRef,
  useContext,
  type CSSProperties,
  type ReactNode,
} from "react";
import { Crown, Expand, Moon, Sparkles, X, Minus, Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import type { FrameId, BackgroundId } from "@shared/avatarCollection";
export type Artwork = {
  url: string;
  title: string;
  frame?: FrameId;
  background?: BackgroundId;
  origin?: { x: number; y: number; width: number; height: number };
};
export function ArtworkPortal({
  art,
  onClose,
}: {
  art: Artwork | null;
  onClose: () => void;
}) {
  const [zoom, setZoom] = useState(100);
  const viewport = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState<{ blob: Blob; url: string } | null>(
    null
  );
  const [error, setError] = useState(false);
  const inherited = useContext(AvatarNavigationContext);
  useAvatarBackGuard(!!art, onClose, !inherited);
  useBoundedImagePan(viewport, !!art);
  useEffect(() => {
    setZoom(100);
    setError(false);
    setRendered(null);
    if (!art) return;
    let disposed = false,
      objectUrl = "";
    renderCollectionCard(art.url, art.frame, art.background)
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
  }, [art?.url, art?.frame, art?.background]);
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
          setZoom(100);
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
        <div
          ref={viewport}
          className="art-viewport"
          tabIndex={0}
          aria-label="확대 이미지 스크롤 영역"
        >
          <div style={{ width: zoom + "%", height: zoom + "%" }}>
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
        </div>
        <div className="art-tools">
          <button
            type="button"
            aria-label="그림 축소"
            disabled={zoom === 100}
            onClick={() => setZoom(Math.max(100, zoom - 25))}
          >
            <Minus />
          </button>
          <input
            aria-label="그림 확대 비율"
            type="range"
            min="100"
            max="300"
            step="25"
            value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
          />
          <button
            type="button"
            aria-label="그림 확대"
            disabled={zoom === 300}
            onClick={() => setZoom(Math.min(300, zoom + 25))}
          >
            <Plus />
          </button>
          <output>{zoom}%</output>
          <button type="button" onClick={() => setZoom(100)}>
            원래 크기
          </button>
        </div>
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
          확대 후 스크롤하거나 손가락으로 밀어 감상하세요.
        </p>
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
}: {
  url: string;
  title: string;
  frame?: FrameId;
  background?: BackgroundId;
  representative?: boolean;
  selected?: boolean;
  onOpen?: () => void;
  children?: ReactNode;
}) {
  const [ripple, setRipple] = useState(0);
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
        className="card-art"
        onPointerDown={() => setRipple(n => n + 1)}
        onClick={onOpen}
        aria-label={title + " 확대 보기"}
      >
        <span className="card-corner tl" />
        <span className="card-corner tr" />
        <span className="card-corner bl" />
        <span className="card-corner br" />
        <img loading="lazy" src={url} alt={title} />
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
