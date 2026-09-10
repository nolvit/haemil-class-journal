import type { FrameId, BackgroundId } from "@shared/avatarCollection";
export const CARD_RENDER_SCALE = 2;
export const CARD_RENDER_WIDTH = 900 * CARD_RENDER_SCALE;
export const CARD_RENDER_HEIGHT = 1200 * CARD_RENDER_SCALE;
export const CARD_ART_WIDTH = 760 * CARD_RENDER_SCALE;
export const CARD_ART_HEIGHT = 920 * CARD_RENDER_SCALE;
const CARD_ART_LOGICAL_WIDTH = CARD_ART_WIDTH / CARD_RENDER_SCALE;
const CARD_ART_LOGICAL_HEIGHT = CARD_ART_HEIGHT / CARD_RENDER_SCALE;
const palettes = {
  lunar: ["#bca36f", "#eadbb1"],
  aurora: ["#6ec4b8", "#c5ffee"],
  astral: ["#b294de", "#e9d9ff"],
  solar: ["#e6bd5f", "#fff0a8"],
} as const;
// A strict pixel-only export: no DOM capture, names, grades, IDs, dates, likes,
// source URL or original EXIF/text metadata ever enter the output canvas.
export async function renderCollectionCard(
  url: string,
  frame: FrameId = "lunar",
  background: BackgroundId = "classic"
): Promise<Blob> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("카드 이미지를 불러오지 못했어요.");
  const bitmap = await createImageBitmap(await response.blob());
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CARD_RENDER_WIDTH;
    canvas.height = CARD_RENDER_HEIGHT;
    const c = canvas.getContext("2d");
    if (!c) throw new Error("이미지 저장을 지원하지 않는 브라우저예요.");
    c.scale(CARD_RENDER_SCALE, CARD_RENDER_SCALE);
    c.imageSmoothingEnabled = true;
    c.imageSmoothingQuality = "high";
    const [gold, light] = palettes[frame];
    const rounded = (
      x: number,
      y: number,
      w: number,
      h: number,
      r: number,
      fill?: string,
      stroke?: string
    ) => {
      c.beginPath();
      c.roundRect(x, y, w, h, r);
      if (fill) {
        c.fillStyle = fill;
        c.fill();
      }
      if (stroke) {
        c.strokeStyle = stroke;
        c.stroke();
      }
    };
    c.fillStyle = "#0e1c24";
    c.fillRect(0, 0, 900, 1200);
    const glow = c.createRadialGradient(450, 250, 20, 450, 550, 700);
    glow.addColorStop(
      0,
      background === "nebula"
        ? "#473658"
        : background === "palace"
          ? "#54452b"
          : background === "library"
            ? "#294951"
            : "#24343a"
    );
    glow.addColorStop(1, "#0b151c");
    c.fillStyle = glow;
    c.fillRect(0, 0, 900, 1200);
    c.lineWidth = 2;
    rounded(16, 16, 868, 1168, 38, undefined, gold);
    rounded(25, 25, 850, 1150, 31, undefined, light);
    c.globalAlpha = 0.5;
    rounded(35, 35, 830, 1130, 24, undefined, gold);
    c.globalAlpha = 1;
    // Deliberate background geometry remains visible around the untouched artwork.
    c.save();
    c.strokeStyle = gold;
    c.globalAlpha = 0.2;
    c.lineWidth = 1;
    if (background === "library") {
      for (let x = 50; x < 860; x += 25) {
        c.strokeRect(x, 90, 18, 1010);
      }
      c.beginPath();
      c.ellipse(450, 490, 395, 410, 0, Math.PI, 0);
      c.stroke();
    } else if (background === "nebula") {
      for (let v = 0; v < 7; v++) {
        c.beginPath();
        c.ellipse(450, 550, 140 + v * 60, 220 + v * 75, 0.45, 0, Math.PI * 2);
        c.stroke();
      }
    } else if (background === "palace") {
      for (let x = -900; x <= 1800; x += 90) {
        c.beginPath();
        c.moveTo(450, 60);
        c.lineTo(x, 1140);
        c.stroke();
      }
    } else {
      c.beginPath();
      c.arc(450, 535, 405, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
    // Artwork is contained, never cropped. Margins are reserved for decoration.
    const x = 70,
      y = 125,
      w = CARD_ART_LOGICAL_WIDTH,
      h = CARD_ART_LOGICAL_HEIGHT,
      ratio = Math.min(w / bitmap.width, h / bitmap.height);
    c.drawImage(
      bitmap,
      x + (w - bitmap.width * ratio) / 2,
      y + (h - bitmap.height * ratio) / 2,
      bitmap.width * ratio,
      bitmap.height * ratio
    );
    c.lineWidth = 2;
    rounded(57, 107, 786, 958, 38, undefined, gold);
    c.lineWidth = 1;
    rounded(63, 113, 774, 946, 33, undefined, light);
    c.save();
    c.strokeStyle = gold;
    c.lineWidth = 2;
    for (const [tx, ty, sx, sy] of [
      [65, 115, 1, 1],
      [835, 115, -1, 1],
      [65, 1058, 1, -1],
      [835, 1058, -1, -1],
    ]) {
      c.save();
      c.translate(tx, ty);
      c.scale(sx, sy);
      for (const size of [25, 48, 73]) {
        c.beginPath();
        c.moveTo(0, size);
        c.quadraticCurveTo(size, size, size, 0);
        c.stroke();
      }
      c.restore();
    }
    c.restore();
    const star = (x: number, y: number, size: number) => {
      c.beginPath();
      c.moveTo(x, y - size);
      c.lineTo(x + size * 0.24, y - size * 0.24);
      c.lineTo(x + size, y);
      c.lineTo(x + size * 0.24, y + size * 0.24);
      c.lineTo(x, y + size);
      c.lineTo(x - size * 0.24, y + size * 0.24);
      c.lineTo(x - size, y);
      c.lineTo(x - size * 0.24, y - size * 0.24);
      c.closePath();
      c.fillStyle = light;
      c.fill();
    };
    star(330, 71, 13);
    star(570, 71, 13);
    star(48, 500, 17);
    star(852, 500, 17);
    c.fillStyle = light;
    c.beginPath();
    c.arc(450, 67, 24, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#13222a";
    c.beginPath();
    c.arc(460, 58, 21, 0, Math.PI * 2);
    c.fill();
    for (let i = 0; i < 20; i++) {
      const sx = 43 + ((i * 193) % 814),
        sy = 38 + ((i * 251) % 1119);
      if (sx > 80 && sx < 820 && sy > 110 && sy < 1070) continue;
      star(sx, sy, (i % 3) + 2);
    }
    c.fillStyle = light;
    c.textAlign = "center";
    c.font = "20px Georgia";
    c.fillText("H A E M I L   C O L L E C T I O N", 450, 1122);
    star(230, 1115, 7);
    star(670, 1115, 7);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        b =>
          b ? resolve(b) : reject(new Error("저장 파일을 만들지 못했어요.")),
        "image/png"
      )
    );
  } finally {
    bitmap.close();
  }
}
export function downloadCollectionCard(blob: Blob) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = "haemil-collection.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
