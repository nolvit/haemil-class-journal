import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import superjson from "superjson";
const repo = process.cwd();
const qaRoot = path.join(repo, "work/reward-browser");
await fs.mkdir(qaRoot, { recursive: true });
await fs.writeFile(
  path.join(qaRoot, "index.html"),
  '<html lang="ko"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><div id="root"></div><script type="module" src="/main.tsx"></script></html>'
);
await fs.writeFile(
  path.join(qaRoot, "main.tsx"),
  `import React from 'react';import{createRoot}from'react-dom/client';import{QueryClient,QueryClientProvider}from'@tanstack/react-query';import{httpBatchLink}from'@trpc/client';import superjson from'superjson';import{trpc}from'../../client/src/lib/trpc';import{AvatarRewards}from'../../client/src/avatarRewards/AvatarRewards';import Admin,{AvatarOrderNotification}from'../../client/src/avatarRewards/AvatarAdmin';import{Toaster}from'../../client/src/components/ui/sonner';import'./production.css';const q=new QueryClient({defaultOptions:{queries:{retry:false}}}),c=trpc.createClient({links:[httpBatchLink({url:'/api/trpc',transformer:superjson})]});createRoot(document.getElementById('root')!).render(<trpc.Provider client={c} queryClient={q}><QueryClientProvider client={q}><Toaster/>{location.search.includes('admin')?<><AvatarOrderNotification/><Admin/></>:<main style={{maxWidth:700,margin:'auto',padding:24}}><header style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><h1>해밀 수업일지</h1><AvatarRewards token="qa-token-1234" studentId={1}/></header><p>오늘의 배움과 성장을 기록해요.</p></main>}</QueryClientProvider></trpc.Provider>);`
);
const productionCss = (
  await fs.readdir(path.join(repo, "dist/public/assets"))
).find(n => n.startsWith("index-") && n.endsWith(".css"));
await fs.copyFile(
  path.join(repo, "dist/public/assets", productionCss),
  path.join(qaRoot, "production.css")
);
const server = await createServer({
  configFile: false,
  root: qaRoot,
  publicDir: path.join(repo, "client/public"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: {
      "@": path.join(repo, "client/src"),
      "@shared": path.join(repo, "shared"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5186,
    strictPort: true,
    fs: { allow: [repo] },
  },
});
await server.listen();
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_MODULE).href
);
const browser = await chromium.launch({ headless: true, channel: "chrome" });
const image = "/avatar-rewards/avatars/official/official_male_avatar.png";
const orderInput = {
  top: "후드티",
  bottom: "청바지",
  shoes: "운동화",
  hair: "갈색 쉼표머리",
  background: "도시 옥상",
  accessories: [],
  mode: "original",
};
const orderId = "11111111-1111-4111-8111-111111111111",
  candidateId = "22222222-2222-4222-8222-222222222222";
let state = {
  account: {
    studentId: 1,
    balance: 700,
    lifetime: 700,
    completedOrders: 0,
    masterUrl: image,
    representativeId: null,
    cropY: 0,
    cropX: 50,
  },
  nextPrice: 50,
  orders: [],
  cards: [],
  ledger: [],
};
const wardrobe = {
  equipped: "lunar",
  background: "classic",
  owned: ["lunar"],
  ownedBackgrounds: ["classic"],
  cropZoom: 300,
  sharing: [],
  cardStyles: {},
  cardFrames: {},
  cardBackgrounds: {},
};
let liked = false;
const errors = [];
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on("pageerror", e => errors.push(e.message));
await page.route("**/api/trpc/**", async route => {
  const request = route.request(),
    url = new URL(request.url()),
    methods = decodeURIComponent(url.pathname.split("/api/trpc/")[1]).split(
      ","
    );
  const payload =
    request.method() === "GET"
      ? JSON.parse(url.searchParams.get("input") || "{}")
      : request.postDataJSON();
  const results = methods.map((method, i) => {
    const input = payload?.[i]?.json ?? {};
    let value;
    if (method.endsWith("wardrobe")) value = wardrobe;
    else if (method.endsWith("randomCharge")) {
      state.account.balance -= input.all ? 10 : 1;
      value = { price: input.all ? 10 : 1, balance: state.account.balance };
    } else if (method.endsWith("purchaseFrame")) {
      const owned = (wardrobe.cardFrames[input.cardId] ??= []);
      if (!owned.includes(input.frameId)) {
        state.account.balance -= 150;
        owned.push(input.frameId);
      }
      value = null;
    } else if (method.endsWith("equipFrame")) {
      (wardrobe.cardStyles[input.cardId] ??= {
        frame: "lunar",
        background: "classic",
      }).frame = input.frameId;
      const card = state.cards.find(c => c.id === input.cardId);
      if (card) card.frame = input.frameId;
      value = null;
    } else if (method.endsWith("purchaseBackground")) {
      const owned = (wardrobe.cardBackgrounds[input.cardId] ??= []);
      if (!owned.includes(input.backgroundId)) {
        state.account.balance -= 150;
        owned.push(input.backgroundId);
      }
      value = null;
    } else if (method.endsWith("equipBackground")) {
      (wardrobe.cardStyles[input.cardId] ??= {
        frame: "lunar",
        background: "classic",
      }).background = input.backgroundId;
      const card = state.cards.find(c => c.id === input.cardId);
      if (card) card.background = input.backgroundId;
      value = null;
    } else if (method.endsWith("cropZoom")) {
      wardrobe.cropZoom = input.zoom;
      value = null;
    } else if (method.endsWith("share")) {
      wardrobe.sharing = [
        {
          cardId: input.cardId,
          visible: input.visible,
          showName: input.showName,
          showGrade: input.showGrade,
          cropX: input.cropX,
          cropY: input.cropY,
          cropZoom: input.cropZoom,
        },
      ];
      value = null;
    } else if (method.endsWith("gallery"))
      value = [
        {
          id: "44444444-4444-4444-8444-444444444444",
          url: image,
          mode: "superstar",
          cropX: 50,
          cropY: 0,
          cropZoom: 300,
          frame: "astral",
          background: "nebula",
          name: "박00",
          grade: "중0학년",
          likes: liked ? 1 : 0,
          liked,
          mine: false,
        },
      ];
    else if (method.endsWith("adminGalleryCrop")) {
      const card = state.cards.find(c => c.id === input.cardId);
      if (card) {
        card.galleryCropX = input.cropX;
        card.galleryCropY = input.cropY;
        card.galleryCropZoom = input.cropZoom;
      }
      value = null;
    } else if (method.endsWith("like")) {
      liked = input.liked;
      value = null;
    } else if (method.endsWith("adminList"))
      value = [
        {
          id: 1,
          name: "테스트 학생",
          grade: "중1",
          masterUrl: image,
          newOrders: state.orders.filter(o => o.status === "submitted").length,
          readyOrders: 0,
        },
      ];
    else if (method.endsWith("snapshot") || method.endsWith("adminSnapshot"))
      value = state;
    else if (method.endsWith("adjust")) {
      state.account.balance += input.delta;
      state.account.lifetime += Math.max(0, input.delta);
      state.ledger.unshift({
        id: 1,
        delta: input.delta,
        reason: "관리자 지급: " + input.reason,
        createdAt: "2026-09-09 12:00:00",
      });
      value = { balance: state.account.balance };
    } else if (method.endsWith("submit")) {
      assert.equal(input.order.selectedParts.length, 8);
      assert.ok(input.order.pet);
      assert.ok(input.order.pose);
      assert.ok(input.order.extra);
      state.account.balance -= 135;
      state.orders = [
        {
          id: orderId,
          studentId: 1,
          status: "submitted",
          price: 135,
          input: input.order,
          prompt: "HAEMIL_JOURNAL_AVATAR_V2",
          masterUrl: image,
          createdAt: "2026-09-09 12:00:00",
          candidates: [],
        },
      ];
      value = { id: orderId };
    } else if (method.endsWith("publish")) {
      assert.equal(input.images.length, 2);
      state.orders[0].status = "ready";
      state.orders[0].candidates = [
        { id: candidateId, url: image },
        {
          id: "33333333-3333-4333-8333-333333333333",
          url: "/avatar-rewards/avatars/official/official_female_avatar.png",
        },
      ];
      value = null;
    } else if (method.endsWith("select")) {
      state.orders[0].status = "completed";
      state.account.completedOrders++;
      state.nextPrice = 100;
      state.cards = [
        {
          id: candidateId,
          url: image,
          mode: "original",
          createdAt: "2026-09-09 12:00:00",
          frame: "lunar",
          background: "classic",
          galleryCropX: 50,
          galleryCropY: 20,
          galleryCropZoom: 190,
        },
      ];
      value = null;
    } else if (method.endsWith("representative")) {
      state.account.representativeId = input.cardId;
      state.account.cropY = input.cropY;
      state.account.cropX = input.cropX;
      value = null;
    } else if (method.endsWith("master")) value = null;
    else throw new Error("Unhandled method " + method);
    return { result: { data: superjson.serialize(value) } };
  });
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(results),
  });
});
try {
  await page.goto("http://127.0.0.1:5186");
  await page.getByRole("button", { name: "내 아바타와 출석 포인트" }).click();
  await page.getByRole("button", { name: "스페셜 아바타 만들기" }).waitFor();
  await page.screenshot({ path: path.join(qaRoot, "desktop-home.png") });
  for (const [width, height, label] of [
    [1200, 900, "desktop"],
    [390, 844, "mobile"],
  ]) {
    await page.setViewportSize({ width, height });
    await page.locator(".stylebook-launch").click();
    await page.locator(".stylebook-dialog").waitFor();
    await page.waitForTimeout(350);
    await page
      .locator(".stylebook-look img")
      .evaluateAll(imgs => Promise.all(imgs.map(im => im.decode())));
    await page.screenshot({
      path: path.join(qaRoot, label + "-stylebook.png"),
    });
    const box = await page.locator(".stylebook-dialog").boundingBox();
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width + 1 &&
        box.y + box.height <= height + 1
    );
    await page
      .getByRole("button", { name: "내추럴 데이 크게 보기", exact: true })
      .click();
    await page.locator(".stylebook-viewer").waitFor();
    await page
      .getByRole("button", { name: "이미지 확대", exact: true })
      .click();
    await page.getByText("150%", { exact: true }).waitFor();
    const zoomBounds = await page
      .locator(".stylebook-viewer-viewport")
      .evaluate(el => ({ scroll: el.scrollHeight, height: el.clientHeight }));
    assert.ok(zoomBounds.scroll > zoomBounds.height);
    await page
      .getByRole("button", { name: "다음 이미지", exact: true })
      .click();
    await page
      .locator(".stylebook-viewer")
      .getByRole("heading", { name: "플레이 유어 스타일" })
      .waitFor();
    await page.getByText("100%", { exact: true }).waitFor();
    await page.getByRole("button", { name: "확대 보기 닫기" }).click();
    await page
      .getByRole("button", { name: "해나 크게 보기", exact: true })
      .click();
    await page
      .locator(".stylebook-viewer")
      .getByRole("heading", { name: "해나", exact: true })
      .waitFor();
    await page.keyboard.press("ArrowRight");
    await page
      .locator(".stylebook-viewer")
      .getByRole("heading", { name: "미르", exact: true })
      .waitFor();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(qaRoot, label + "-viewer.png") });
    await page.keyboard.press("Escape");
    await page.locator(".stylebook-viewer").waitFor({ state: "hidden" });
    await page.locator(".stylebook-official").scrollIntoViewIfNeeded();
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(qaRoot, label + "-official.png") });
    await page.getByRole("button", { name: "신발", exact: true }).click();
    assert.ok((await page.locator(".stylebook-catalog button").count()) > 0);
    assert.equal(
      await page
        .locator(".stylebook-dialog")
        .evaluate(el => el.scrollWidth > el.clientWidth),
      false
    );
    await page.keyboard.press("Escape");
    await page.locator(".stylebook-dialog").waitFor({ state: "hidden" });
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.getByRole("button", { name: "스페셜 아바타 만들기" }).click();
  for (const [key, label, value] of [
    ["top", "상의", "후드티"],
    ["bottom", "하의", "청바지"],
    ["shoes", "신발", "운동화"],
    ["hair", "헤어", "갈색 쉼표머리"],
    ["background", "배경", "도시 옥상"],
  ]) {
    await page.locator(`label[for="reward-${key}"] input`).check();
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  page.once("dialog", d => d.accept());
  await page.getByRole("button", { name: /펫 랜덤/ }).click();
  const petBefore = await page.getByLabel("펫", { exact: true }).inputValue();
  await page.getByRole("button", { name: /펫 랜덤/ }).click();
  assert.ok(petBefore);
  assert.ok(await page.getByLabel("펫", { exact: true }).inputValue());
  await page.getByRole("button", { name: /전체 랜덤/ }).click();
  await page.getByRole("radio", { name: /워너비/ }).check();
  await page.getByRole("button", { name: "235P로 주문 보내기" }).waitFor();
  await page.getByRole("radio", { name: /슈퍼스타/ }).check();
  await page.getByRole("button", { name: "335P로 주문 보내기" }).waitFor();
  await page.getByRole("radio", { name: /오리지널/ }).check();
  await page.getByLabel("장신구 1", { exact: true }).fill("은색 별 목걸이");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(350);
  const bounds = await page.getByRole("dialog").boundingBox();
  assert.ok(
    bounds.y >= 0 && bounds.y + bounds.height <= 845,
    JSON.stringify(bounds)
  );
  await page.screenshot({ path: path.join(qaRoot, "mobile-order.png") });
  await page.getByRole("button", { name: "135P로 주문 보내기" }).click();
  await page
    .getByText("창조의 여정이 진행 중이에요.", { exact: false })
    .waitFor();
  await page.keyboard.press("Escape");
  await page.locator(".reward-dialog").waitFor({ state: "hidden" });
  await page.waitForFunction(() => !history.state?.haemilAvatarOverlay);
  await page.goto("http://127.0.0.1:5186/?admin");
  await page.getByText("새 아바타 주문 1건", { exact: true }).first().waitFor();
  await page.getByLabel("시즌", { exact: true }).selectOption("christmas");
  await page.getByLabel("에셋 종류").selectOption("thumb");
  assert.ok(
    (await page.getByLabel("시즌 에셋 제작 프롬프트").inputValue()).includes(
      "96 x 96"
    )
  );
  await page.getByLabel("학생 선택").selectOption("1");
  await page.getByLabel("포인트", { exact: true }).fill("50");
  await page
    .getByLabel("학생에게 보여 줄 조정 사유", { exact: true })
    .fill("과제 보너스");
  page.once("dialog", d => d.accept());
  await Promise.all([
    page.waitForResponse(r => r.url().includes("avatarRewards.adjust")),
    page.getByRole("button", { name: "포인트 조정 적용" }).click(),
  ]);
  await page
    .getByLabel("후보 이미지 2장")
    .setInputFiles([
      path.join(
        repo,
        "client/public/avatar-rewards/avatars/official/official_male_avatar.png"
      ),
      path.join(
        repo,
        "client/public/avatar-rewards/avatars/official/official_female_avatar.png"
      ),
    ]);
  await page.getByRole("button", { name: "후보 두 장 전달" }).click();
  await page
    .getByRole("heading", { name: "오리지널 · 학생 선택 대기" })
    .waitFor();
  await page.screenshot({
    path: path.join(qaRoot, "mobile-admin.png"),
    fullPage: true,
  });
  await page.goto("http://127.0.0.1:5186");
  await page.getByRole("button", { name: "내 아바타와 출석 포인트" }).click();
  await page.getByText("선택할 아바타가 도착했어요!").waitFor();
  await page.getByRole("button", { name: "후보 1", exact: true }).click();
  await Promise.all([
    page.waitForResponse(r => r.url().includes("avatarRewards.select")),
    page.getByRole("button", { name: "이 아바타로 확정" }).click(),
  ]);
  const representativeButton = page
    .locator("button")
    .filter({ hasText: /대표로 설정|현재 대표/ })
    .first();
  await representativeButton.waitFor();
  if ((await representativeButton.textContent())?.includes("대표로 설정"))
    await representativeButton.click();
  await page.screenshot({ path: path.join(qaRoot, "mobile-collection.png") });
  await page.getByRole("slider", { name: "얼굴 위치" }).fill("20");
  await Promise.all([
    page.waitForResponse(
      r =>
        r.url().includes("avatarRewards.representative") &&
        r.request().method() === "POST"
    ),
    page.getByRole("button", { name: "위치 저장" }).click(),
  ]);
  assert.equal(state.account.cropY, 20);
  await page.getByRole("slider", { name: "얼굴 좌우 위치" }).fill("75");
  await Promise.all([
    page.waitForResponse(
      r =>
        r.url().includes("avatarRewards.representative") &&
        r.request().method() === "POST"
    ),
    page.getByRole("button", { name: "위치 저장" }).click(),
  ]);
  assert.equal(state.account.cropX, 75);
  await page.getByRole("button", { name: "아바타 홈으로" }).click();
  await page
    .getByRole("button", { name: "내 포인트 적립·사용 내역 보기" })
    .click();
  await page.getByText("관리자 지급: 과제 보너스", { exact: false }).waitFor();
  await page.screenshot({ path: path.join(qaRoot, "mobile-ledger.png") });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth
  );
  assert.equal(overflow, false);

  await page.getByRole("button", { name: "컬렉션", exact: true }).click();
  await page.getByRole("button", { name: "MASTER 확대 보기" }).click();
  await page.locator(".art-portal").waitFor();
  await page
    .getByRole("button", { name: "프레임 포함 이미지 저장", exact: true })
    .waitFor();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "프레임 포함 이미지 저장", exact: true })
      .click(),
  ]);
  assert.equal(download.suggestedFilename(), "haemil-collection.png");
  await download.saveAs(path.join(qaRoot, "exported-card.png"));
  const png = await fs.readFile(path.join(qaRoot, "exported-card.png"));
  const chunks = [];
  for (let offset = 8; offset < png.length; ) {
    const length = png.readUInt32BE(offset);
    chunks.push(png.toString("ascii", offset + 4, offset + 8));
    offset += length + 12;
  }
  assert.ok(!chunks.some(x => ["eXIf", "tEXt", "iTXt", "zTXt"].includes(x)));
  assert.equal(png.readUInt32BE(16), 1800);
  assert.equal(png.readUInt32BE(20), 2400);
  await page.getByRole("button", { name: "카드 전체 화면으로 보기" }).click();
  const fullscreen = page.getByRole("dialog", { name: "전체 화면 카드" });
  await fullscreen.waitFor();
  await fullscreen.evaluate(el => {
    el.setPointerCapture = () => {};
  });
  await fullscreen.dispatchEvent("pointerdown", {
    pointerId: 11,
    pointerType: "touch",
    clientX: 100,
    clientY: 200,
  });
  await fullscreen.dispatchEvent("pointerdown", {
    pointerId: 12,
    pointerType: "touch",
    clientX: 200,
    clientY: 200,
  });
  await fullscreen.dispatchEvent("pointermove", {
    pointerId: 12,
    pointerType: "touch",
    clientX: 300,
    clientY: 200,
  });
  await page.waitForFunction(() => {
    const image = document.querySelector(".card-fullscreen img");
    return image && new DOMMatrix(getComputedStyle(image).transform).a > 1;
  });
  assert.ok(
    (await fullscreen.locator("img").evaluate(el => {
      const matrix = new DOMMatrix(getComputedStyle(el).transform);
      return matrix.a;
    })) > 1
  );
  await fullscreen.dispatchEvent("pointerup", {
    pointerId: 11,
    pointerType: "touch",
  });
  await fullscreen.dispatchEvent("pointerup", {
    pointerId: 12,
    pointerType: "touch",
  });
  await page.getByRole("button", { name: "전체 화면 닫기" }).click();
  assert.ok(await page.locator(".reward-dialog").isVisible());
  await page.getByRole("button", { name: "그림 확대 닫기" }).click();
  await page.getByRole("button", { name: /오리지널 .* 확대 보기/ }).click();
  const [newCardDownload] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", { name: "프레임 포함 이미지 저장", exact: true })
      .click(),
  ]);
  await newCardDownload.saveAs(path.join(qaRoot, "exported-new-card.png"));
  const newCardPng = await fs.readFile(
    path.join(qaRoot, "exported-new-card.png")
  );
  assert.equal(newCardPng.readUInt32BE(16), 1800);
  assert.equal(newCardPng.readUInt32BE(20), 2400);
  await page.getByRole("button", { name: "그림 확대 닫기" }).click();
  await page.getByRole("slider", { name: "얼굴 확대 비율" }).fill("240");
  await page
    .getByRole("button", { name: "확대 비율 저장", exact: true })
    .click();
  await page.waitForResponse(r => r.url().includes("wardrobe"));
  assert.equal(wardrobe.cropZoom, 240);
  await page.locator(".card-sharing summary").click();
  await page.getByRole("slider", { name: "광장 좌우 위치" }).fill("72");
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "포인트", exact: true }).click();
  assert.ok(
    await page
      .getByRole("button", { name: "컬렉션", exact: true })
      .getAttribute("aria-current")
  );
  await page.getByLabel("사진 공개", { exact: true }).check();
  await page.getByRole("button", { name: "공개 설정 저장" }).click();
  await page.getByText("공개 중 · 공개 설정", { exact: true }).waitFor();
  assert.equal(wardrobe.sharing[0].showName, false);
  assert.equal(wardrobe.sharing[0].showGrade, false);
  assert.equal(wardrobe.sharing[0].cropX, 72);
  await page.locator(".reward-dialog").evaluate(el => el.scrollTo(0, 0));
  await page.waitForTimeout(450);
  await page.waitForTimeout(4200);
  await page.screenshot({
    path: path.join(qaRoot, "fantasy-mobile-collection.png"),
  });
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.waitForTimeout(450);
  await page.screenshot({
    path: path.join(qaRoot, "fantasy-desktop-collection.png"),
  });
  // Synthetic credits stay inside the mocked browser fixture.
  state.account.balance = 2000;
  await page.getByRole("button", { name: "아바타 홈으로" }).click();
  await page
    .getByRole("button", { name: "내 포인트 적립·사용 내역 보기" })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "내 아바타와 출석 포인트" }).click();
  await page.getByRole("button", { name: "상점", exact: true }).click();
  await page.getByRole("button", { name: "150P로 소장", exact: true }).click();
  await page.getByRole("button", { name: "구매 확정", exact: true }).click();
  await Promise.all([
    page.waitForResponse(r => r.url().includes("equipFrame")),
    page.getByRole("button", { name: "장착하기", exact: true }).click(),
  ]);
  assert.equal(wardrobe.cardStyles[candidateId].frame, "aurora");
  await page.getByRole("button", { name: "카드 배경", exact: true }).click();
  await page.getByRole("button", { name: "150P로 소장", exact: true }).click();
  await page.getByRole("button", { name: "구매 확정", exact: true }).click();
  await page.getByRole("button", { name: "장착하기", exact: true }).click();
  await page.waitForTimeout(450);
  assert.equal(wardrobe.cardStyles[candidateId].background, "library");
  await page.locator(".reward-dialog").evaluate(el => el.scrollTo(0, 0));
  await page.waitForTimeout(4200);
  await page.screenshot({ path: path.join(qaRoot, "fantasy-shop.png") });
  await page.getByRole("button", { name: "광장", exact: true }).click();
  await page.getByRole("button", { name: "박00 카드 좋아요" }).click();
  await page.waitForTimeout(250);
  assert.equal(liked, true);
  await page.screenshot({ path: path.join(qaRoot, "fantasy-gallery.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(450);
  const navButtons = await page
    .locator(".reward-links button")
    .allTextContents();
  assert.deepEqual(navButtons, ["컬렉션", "포인트", "안내", "상점", "광장"]);
  assert.equal(
    await page
      .locator(".reward-dialog")
      .evaluate(el => el.scrollWidth > el.clientWidth),
    false
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page
      .locator(".reward-dialog")
      .evaluate(el => getComputedStyle(el).animationName),
    "none"
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("button", { name: "박00 카드 열기" }).click();
  await page
    .getByRole("button", { name: "프레임 포함 이미지 저장", exact: true })
    .waitFor();
  assert.ok(await page.locator(".art-portal.from-orbit").isVisible());
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(qaRoot, "gallery-card-popup.png") });
  const sameUrl = page.url();
  await page.goBack();
  await page.locator(".reward-dialog").waitFor({ state: "hidden" });
  assert.equal(page.url(), sameUrl);
  assert.equal(
    await page.evaluate(() => history.state?.haemilAvatarOverlay),
    undefined
  );
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "내 아바타와 출석 포인트" }).click();
    await page.locator(".reward-dialog").waitFor();
    await page.locator(".reward-dialog > [data-slot=dialog-close]").click();
    await page.locator(".reward-dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => !history.state?.haemilAvatarOverlay);
  }
  await page.goto("http://127.0.0.1:5186/?admin");
  await page.getByLabel("학생 선택").selectOption("1");
  await page.getByRole("slider", { name: "관리자 광장 좌우 위치" }).fill("64");
  await Promise.all([
    page.waitForResponse(r => r.url().includes("adminGalleryCrop")),
    page.getByRole("button", { name: "광장 프로필 저장" }).click(),
  ]);
  assert.equal(state.cards[0].galleryCropX, 64);
  assert.deepEqual(errors, []);
  console.log(
    "PASS desktop/mobile order, administrator upload, candidate selection, collection, representative crop, no horizontal overflow or JS errors"
  );
} catch (error) {
  console.log("QA failed at", page.url());
  await page.screenshot({ path: path.join(qaRoot, "failure.png") });
  throw error;
} finally {
  await browser.close();
  await server.close();
}
