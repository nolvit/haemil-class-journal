import { useRef, useState } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  RotateCcw,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import manifest from "./assetManifest.json";
import "./stylebook.css";

type Picture = { src: string; title: string; subtitle: string };
const base = "/avatar-rewards/";
const looks: Picture[] = [
  {
    src: base + "references/style/style_a_main.png",
    title: "내추럴 데이",
    subtitle: "STYLE A · 편안한 하루, 자연스러운 나",
  },
  {
    src: base + "references/style/style_c_main.png",
    title: "플레이 유어 스타일",
    subtitle: "STYLE C · 취향을 더해 만드는 새로운 나",
  },
  {
    src: base + "references/style/style_b_main.png",
    title: "스쿨 시그니처",
    subtitle: "STYLE B · 단정함에 더한 자유로운 감각",
  },
];
const officials = [
  {
    src: base + "avatars/official/official_female_avatar.png",
    title: "해나",
    english: "HAENA",
    subtitle: "나만의 빛으로 채우는 하루",
    number: "01",
  },
  {
    src: base + "avatars/official/official_male_avatar.png",
    title: "미르",
    english: "MIR",
    subtitle: "조금씩, 더 멋진 나를 향해",
    number: "02",
  },
];
const categories = [
  ["tops", "상의"],
  ["bottoms", "하의"],
  ["shoes", "신발"],
  ["mixed", "전체 코디"],
] as const;
const catalog = manifest.assets
  .filter(a => a.path.startsWith("avatars/catalog/"))
  .map(a => ({
    src: base + a.path,
    category: a.path.split("/")[2],
    title: a.original_filename
      .replace(/\.png$/i, "")
      .replaceAll("_", " ")
      .replace("i can t use", "")
      .trim(),
    subtitle: "스타일 참고 · 원하는 부분을 자유롭게 상상해 보세요",
  }));
export function Stylebook() {
  const [category, setCategory] = useState("tops");
  const [viewer, setViewer] = useState<{
    pictures: Picture[];
    index: number;
  } | null>(null);
  const [zoom, setZoom] = useState(1);
  const viewport = useRef<HTMLDivElement>(null);
  const current = viewer?.pictures[viewer.index];
  const filtered = catalog.filter(a => a.category === category);
  const open = (pictures: Picture[], index: number) => {
    setZoom(1);
    setViewer({ pictures, index });
  };
  const move = (delta: number) => {
    if (!viewer) return;
    setZoom(1);
    viewport.current?.scrollTo(0, 0);
    setViewer({
      ...viewer,
      index:
        (viewer.index + delta + viewer.pictures.length) %
        viewer.pictures.length,
    });
  };
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="stylebook-launch">
          <span>
            <small>HAEMIL STYLEBOOK</small>
            <strong>어떤 내가 되고 싶나요?</strong>
            <span>해나와 미르의 스타일북 둘러보기</span>
          </span>
          <ArrowUpRight aria-hidden="true" size={25} />
        </button>
      </DialogTrigger>
      <DialogContent className="stylebook-dialog" showCloseButton={false}>
        <div className="stylebook-dismiss">
          <DialogClose asChild>
            <button type="button" aria-label="스타일북 닫기">
              <X size={20} />
            </button>
          </DialogClose>
        </div>
        <header className="stylebook-header">
          <span className="stylebook-eyebrow">HAEMIL · YOUR NEXT CHAPTER</span>
          <DialogTitle>
            해밀 스타일북<span>Every day, more you.</span>
          </DialogTitle>
          <DialogDescription>
            좋아하는 분위기를 발견하고, 나만의 상상을 더해 보세요.
          </DialogDescription>
        </header>
        <section className="stylebook-section">
          <div className="stylebook-section-title">
            <div>
              <span>01 / THE LOOKS</span>
              <h3>세 가지 무드, 무한한 가능성</h3>
            </div>
            <small>이미지를 누르면 크게 볼 수 있어요</small>
          </div>
          <div className="stylebook-looks">
            {looks.map((p, i) => (
              <button
                type="button"
                key={p.src}
                className="stylebook-look"
                onClick={() => open(looks, i)}
                aria-label={p.title + " 크게 보기"}
              >
                <div className="stylebook-image">
                  <img src={p.src} alt={p.title} loading="lazy" />
                  <span className="stylebook-expand">
                    <ArrowUpRight size={19} />
                  </span>
                </div>
                <div className="stylebook-caption">
                  <small>LOOK 0{i + 1}</small>
                  <h4>{p.title}</h4>
                  <p>{p.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
        <section className="stylebook-section stylebook-official">
          <div className="stylebook-section-title">
            <div>
              <span>02 / OUR SIGNATURE</span>
              <h3>해밀의 두 얼굴, 해나와 미르</h3>
            </div>
            <small>해밀학원 오피셜 아바타</small>
          </div>
          <div className="stylebook-duo">
            {officials.map((p, i) => (
              <button
                type="button"
                className="stylebook-character"
                key={p.src}
                onClick={() => open(officials, i)}
                aria-label={p.title + " 크게 보기"}
              >
                <span className="stylebook-character-tag">
                  HAEMIL OFFICIAL / {p.number}
                </span>
                <img
                  src={p.src}
                  alt={"해밀학원 오피셜 아바타 " + p.title}
                  loading="lazy"
                />
                <div className="stylebook-name">
                  <span>{p.english}</span>
                  <h4>
                    {p.title}
                    <ArrowUpRight size={22} />
                  </h4>
                  <p>{p.subtitle}</p>
                </div>
              </button>
            ))}
          </div>
          <p className="stylebook-official-note">
            같은 하루에도, 우리는 서로 다른 빛을 담아요.
          </p>
        </section>
        <section className="stylebook-section">
          <div className="stylebook-section-title">
            <div>
              <span>03 / LITTLE DETAILS</span>
              <h3>마음에 드는 디테일을 찾아요</h3>
            </div>
          </div>
          <div
            className="stylebook-filters"
            role="group"
            aria-label="참고 의상 종류"
          >
            {categories.map(([id, name]) => (
              <button
                type="button"
                key={id}
                aria-pressed={category === id}
                onClick={() => setCategory(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <div className="stylebook-catalog">
            {filtered.map((p, i) => (
              <button
                type="button"
                key={p.src}
                onClick={() => open(filtered, i)}
                aria-label={p.title + " 크게 보기"}
              >
                <img src={p.src} alt={p.title} loading="lazy" />
                <span>{p.title}</span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </section>
        <footer className="stylebook-footer">
          <strong>정답은 없어요. 나다운 모습이면 충분해요.</strong>
          <p>
            이미지는 상상을 돕는 예시예요. 마음에 드는 옷, 색, 분위기를 주문란에
            자유롭게 적어 주세요.
          </p>
        </footer>
        <Dialog
          open={!!viewer}
          onOpenChange={v => {
            if (!v) setViewer(null);
          }}
        >
          <DialogContent
            className="stylebook-viewer"
            showCloseButton={false}
            onKeyDown={e => {
              if (e.target instanceof HTMLInputElement) return;
              if (e.key === "ArrowRight") {
                e.preventDefault();
                move(1);
              }
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                move(-1);
              }
            }}
          >
            <header className="stylebook-viewer-heading">
              <div>
                <DialogTitle>{current?.title}</DialogTitle>
                <DialogDescription>{current?.subtitle}</DialogDescription>
              </div>
              <DialogClose asChild>
                <button type="button" aria-label="확대 보기 닫기">
                  <X />
                </button>
              </DialogClose>
            </header>
            <div
              ref={viewport}
              className="stylebook-viewer-viewport"
              tabIndex={0}
              aria-label="확대 이미지 스크롤 영역"
            >
              {current && (
                <div
                  className="stylebook-zoom-canvas"
                  style={{ width: zoom * 100 + "%", height: zoom * 100 + "%" }}
                >
                  <img
                    src={current.src}
                    alt={current.title}
                    draggable={false}
                  />
                </div>
              )}
            </div>
            <div className="stylebook-viewer-controls">
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="이전 이미지"
              >
                <ChevronLeft />
              </button>
              <span aria-live="polite">
                {viewer ? viewer.index + 1 : 0} / {viewer?.pictures.length ?? 0}
              </span>
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="다음 이미지"
              >
                <ChevronRight />
              </button>
              <span className="stylebook-control-divider" />
              <button
                type="button"
                disabled={zoom <= 1}
                onClick={() => setZoom(z => Math.max(1, z - 0.5))}
                aria-label="이미지 축소"
              >
                <Minus />
              </button>
              <span aria-live="polite">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                disabled={zoom >= 3}
                onClick={() => setZoom(z => Math.min(3, z + 0.5))}
                aria-label="이미지 확대"
              >
                <Plus />
              </button>
              <button
                type="button"
                onClick={() => {
                  setZoom(1);
                  viewport.current?.scrollTo(0, 0);
                }}
                aria-label="원래 크기로"
              >
                <RotateCcw size={18} />
              </button>
            </div>
            <p className="stylebook-viewer-hint">
              확대한 이미지는 스크롤하거나 손가락으로 밀어 볼 수 있어요.
            </p>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
