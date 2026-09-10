import { SeasonalPrompts } from "./SeasonalPrompts";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { modeLabels } from "@shared/avatarRewards";
import "./rewards.css";
import "./avatar-theme.css";
import { ArtworkPortal, type Artwork } from "./FantasyCard";
function PointAdjustment({
  studentId,
  balance,
  onSaved,
}: {
  studentId: number;
  balance: number;
  onSaved: () => void;
}) {
  const [direction, setDirection] = useState("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const mutate = trpc.avatarRewards.adjust.useMutation({
    onError: e => toast.error(e.message),
    onSuccess: () => {
      setAmount("");
      setReason("");
      setRequestId(crypto.randomUUID());
      onSaved();
      toast.success("포인트 내역에 기록했습니다.");
    },
  });
  const delta = Number(amount) * (direction === "add" ? 1 : -1);
  return (
    <section>
      <h2>포인트 지급·차감</h2>
      <p>
        사유는 학생의 포인트 내역에도 표시됩니다. 지급은 누적 획득에 포함하고,
        차감은 사용 가능 포인트만 줄입니다.
      </p>
      <form
        className="reward-adjust"
        onSubmit={e => {
          e.preventDefault();
          if (
            window.confirm(
              `${direction === "add" ? "지급" : "차감"} ${Number(amount).toLocaleString()}P · ${reason}\n적용 후 ${Number(balance + delta).toLocaleString()}P`
            )
          )
            mutate.mutate({ studentId, delta, reason, requestId });
        }}
      >
        <label>
          조정 방식
          <select
            value={direction}
            disabled={mutate.isPending}
            onChange={e => {
              setDirection(e.target.value);
              setRequestId(crypto.randomUUID());
            }}
          >
            <option value="add">포인트 지급 (+)</option>
            <option value="subtract">포인트 차감 (−)</option>
          </select>
        </label>
        <label>
          포인트
          <Input
            type="number"
            min="1"
            max="100000"
            step="1"
            required
            value={amount}
            disabled={mutate.isPending}
            onChange={e => {
              setAmount(e.target.value);
              setRequestId(crypto.randomUUID());
            }}
          />
        </label>
        <label>
          학생에게 보여 줄 조정 사유
          <Input
            required
            maxLength={140}
            placeholder="예: 꾸준한 과제 수행 보너스 / 잘못 지급된 포인트 정정"
            value={reason}
            disabled={mutate.isPending}
            onChange={e => {
              setReason(e.target.value);
              setRequestId(crypto.randomUUID());
            }}
          />
        </label>
        <p>
          현재 {balance.toLocaleString()}P → 적용 후{" "}
          {(balance + delta).toLocaleString()}P
        </p>
        <Button
          disabled={
            mutate.isPending ||
            !reason.trim() ||
            !Number.isInteger(delta) ||
            !delta ||
            (delta < 0 && balance + delta < 0)
          }
          type="submit"
        >
          {mutate.isPending ? "반영 중…" : "포인트 조정 적용"}
        </Button>
      </form>
    </section>
  );
}
async function readImage(file: File) {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  )
    throw new Error("PNG/JPEG/WebP 이미지(8MB 이하)를 골라 주세요.");
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  return { data, mime: file.type as "image/png" | "image/jpeg" | "image/webp" };
}
export default function AvatarAdmin() {
  const [art, setArt] = useState<Artwork | null>(null);
  const [studentId, setStudentId] = useState(0),
    [master, setMaster] = useState<File | null>(null),
    [images, setImages] = useState<File[]>([]),
    [uploading, setUploading] = useState(false);
  const list = trpc.avatarRewards.adminList.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const snapshot = trpc.avatarRewards.adminSnapshot.useQuery(
    { studentId },
    { enabled: studentId > 0, refetchInterval: 15000 }
  );
  const refresh = () => {
    void list.refetch();
    void snapshot.refetch();
  };
  const onError = (e: { message: string }) => toast.error(e.message);
  const uploadMaster = trpc.avatarRewards.master.useMutation({
    onError,
    onSuccess: () => {
      refresh();
      setMaster(null);
      toast.success("마스터 아바타를 저장했습니다.");
    },
  });
  const publish = trpc.avatarRewards.publish.useMutation({
    onError,
    onSuccess: () => {
      refresh();
      setImages([]);
      toast.success("후보 두 장을 학생에게 전달했습니다.");
    },
  });
  const cancel = trpc.avatarRewards.cancel.useMutation({
    onError,
    onSuccess: () => {
      refresh();
      toast.success("주문을 취소하고 포인트를 환불했습니다.");
    },
  });
  const total = list.data?.reduce((n, s) => n + Number(s.newOrders), 0) ?? 0;
  return (
    <main className="reward-admin">
      <header>
        <p className="eyebrow">ATTENDANCE REWARDS</p>
        <h1>아바타 제작 관리</h1>
        <p>
          새 주문 {total}건 · 학생의 꾸준한 배움을 특별한 모습으로 남겨 주세요.
        </p>
      </header>
      {list.error && <p role="alert">{list.error.message}</p>}
      <label>
        학생 선택
        <select
          aria-label="학생 선택"
          value={studentId}
          onChange={e => {
            setStudentId(Number(e.target.value));
            setImages([]);
            setMaster(null);
          }}
        >
          <option value={0}>학생을 선택하세요</option>
          {list.data?.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} · {s.grade}
              {Number(s.newOrders) > 0 ? " · 새 주문" : ""}
              {Number(s.readyOrders) > 0 ? " · 선택 대기" : ""}
            </option>
          ))}
        </select>
      </label>
      {snapshot.error && <p role="alert">{snapshot.error.message}</p>}
      {snapshot.data && (
        <>
          <section>
            <h2>마스터 아바타</h2>
            <p>
              학생별 기본 전신 이미지를 등록합니다. 스페셜 아바타 제작의 기준
              이미지로 사용합니다.
            </p>
            {snapshot.data.account.masterUrl && (
              <button
                type="button"
                aria-label="현재 마스터 아바타 확대 보기"
                onClick={() =>
                  setArt({
                    url: snapshot.data!.account.masterUrl!,
                    title: "현재 마스터 아바타",
                  })
                }
              >
                <img
                  className="master"
                  src={snapshot.data.account.masterUrl}
                  alt="현재 마스터 아바타"
                />
              </button>
            )}
            <input
              key={`master-${studentId}`}
              aria-label="마스터 아바타 파일"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={e => setMaster(e.target.files?.[0] ?? null)}
            />
            <Button
              disabled={!master || uploading || uploadMaster.isPending}
              onClick={async () => {
                if (!master) return;
                setUploading(true);
                try {
                  await uploadMaster.mutateAsync({
                    studentId,
                    image: await readImage(master),
                  });
                } catch (e) {
                  if (e instanceof Error) toast.error(e.message);
                } finally {
                  setUploading(false);
                }
              }}
            >
              마스터 저장
            </Button>
            <p>
              사용 가능 {snapshot.data.account.balance.toLocaleString()}P · 누적{" "}
              {snapshot.data.account.lifetime.toLocaleString()}P · 제작 완료{" "}
              {snapshot.data.account.completedOrders}회
            </p>
          </section>
          {!snapshot.data.orders.length && (
            <section>아직 주문이 없습니다.</section>
          )}
          <PointAdjustment
            key={studentId}
            studentId={studentId}
            balance={snapshot.data.account.balance}
            onSaved={refresh}
          />
          {snapshot.data.orders.map(o => (
            <section key={o.id}>
              <h2>
                {modeLabels[o.input.mode]} ·{" "}
                {
                  {
                    submitted: "새 주문",
                    ready: "학생 선택 대기",
                    completed: "제작 완료",
                    cancelled: "취소 및 환불",
                  }[o.status]
                }
              </h2>
              <small>
                {o.createdAt} · {o.price.toLocaleString()}P
              </small>
              <p>
                {o.input.top} / {o.input.bottom} / {o.input.shoes}
                <br />
                헤어: {o.input.hair}
                <br />
                배경: {o.input.background}
                <br />
                장신구: {o.input.accessories.join(", ") || "없음"}
                <br />
                펫: {o.input.pet || "없음"}
                <br />
                자세: {o.input.pose || "자연스러운 자세"}
                <br />
                기타 요구사항: {o.input.extra || "없음"}
              </p>
              <a href={o.masterUrl} target="_blank" rel="noreferrer">
                주문 당시 마스터 이미지 열기
              </a>
              <details>
                <summary>생성 프롬프트</summary>
                <textarea
                  aria-label="생성 프롬프트"
                  readOnly
                  value={o.prompt}
                />
              </details>
              <div className="reward-admin-actions">
                <Button
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(o.prompt)
                      .then(() => toast.success("프롬프트를 복사했습니다."))
                      .catch(() =>
                        toast.error("프롬프트를 펼쳐 직접 복사해 주세요.")
                      )
                  }
                >
                  프롬프트 복사
                </Button>
                {(o.status === "submitted" || o.status === "ready") && (
                  <Button
                    variant="outline"
                    disabled={cancel.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${o.price}P를 환불하고 주문을 취소하시겠습니까?`
                        )
                      )
                        cancel.mutate({ studentId, orderId: o.id });
                    }}
                  >
                    취소 및 환불
                  </Button>
                )}
              </div>
              {o.status === "submitted" && (
                <>
                  <label>
                    후보 이미지 2장
                    <input
                      key={`candidates-${studentId}-${o.id}`}
                      aria-label="후보 이미지 2장"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      multiple
                      onChange={e =>
                        setImages(Array.from(e.target.files ?? []))
                      }
                    />
                  </label>
                  <small>{images.length}장 선택됨 · 각 8MB 이하</small>
                  <Button
                    disabled={
                      images.length !== 2 || uploading || publish.isPending
                    }
                    onClick={async () => {
                      setUploading(true);
                      try {
                        const pair = await Promise.all(images.map(readImage));
                        await publish.mutateAsync({
                          studentId,
                          orderId: o.id,
                          images: pair as [(typeof pair)[0], (typeof pair)[0]],
                        });
                      } catch (e) {
                        if (e instanceof Error) toast.error(e.message);
                      } finally {
                        setUploading(false);
                      }
                    }}
                  >
                    {uploading ? "업로드 중…" : "후보 두 장 전달"}
                  </Button>
                </>
              )}
              {!!o.candidates.length && (
                <div className="reward-cards">
                  {o.candidates.map((c, i) => (
                    <div key={c.id}>
                      <button
                        type="button"
                        aria-label={`후보 ${i + 1} 확대 보기`}
                        onClick={() =>
                          setArt({ url: c.url, title: `후보 ${i + 1}` })
                        }
                      >
                        <img src={c.url} alt={`후보 ${i + 1}`} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ))}
          <section>
            <h2>포인트 내역</h2>
            <div className="reward-ledger">
              {snapshot.data.ledger.map(l => (
                <div key={l.id}>
                  <span>
                    {l.reason}
                    <small>{l.createdAt}</small>
                  </span>
                  <b>
                    {l.delta > 0 ? "+" : ""}
                    {l.delta}P
                  </b>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
      <SeasonalPrompts />
      <ArtworkPortal art={art} onClose={() => setArt(null)} />
    </main>
  );
}
export function AvatarOrderNotification() {
  const q = trpc.avatarRewards.adminList.useQuery(undefined, {
    refetchInterval: 30000,
    retry: false,
  });
  const count = q.data?.reduce((n, s) => n + Number(s.newOrders), 0) ?? 0;
  return count > 0 ? (
    <a
      className="reward-admin-notification"
      href="/avatar-rewards"
      role="status"
    >
      새 아바타 주문 {count}건
    </a>
  ) : null;
}
