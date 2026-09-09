import { useState } from "react";
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
import { UserRound, Sparkles, ArrowLeft, Plus, X } from "lucide-react";
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
import "./rewards.css";

const emptyOrder: RewardOrderInput = {
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
    "home" | "order" | "collection" | "ledger" | "guide"
  >("home");
  const [order, setOrder] = useState<RewardOrderInput>(emptyOrder);
  const [cropY, setCropY] = useState<number | null>(null);
  const [cropX, setCropX] = useState<number | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(
    null
  );
  const query = trpc.avatarRewards.snapshot.useQuery(identity, {
    refetchInterval: open ? 15_000 : 60_000,
    retry: false,
  });
  const refresh = () => query.refetch();
  const onError = (e: { message: string }) => toast.error(e.message);
  const submit = trpc.avatarRewards.submit.useMutation({
    onError,
    onSuccess: () => {
      setPage("home");
      setOrder(emptyOrder);
      void refresh();
      toast.success("주문을 보냈어요. 선생님이 두 장을 준비해 주실 거예요.");
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
  const image =
    data?.cards.find(c => c.id === account?.representativeId)?.url ??
    account?.masterUrl;
  const active = data?.orders.find(
    o => o.status === "submitted" || o.status === "ready"
  );
  const busy = submit.isPending || select.isPending || representative.isPending;
  const position = cropY ?? account?.cropY ?? 0;
  const horizontal = cropX ?? account?.cropX ?? 50;
  return (
    <Dialog
      open={open}
      onOpenChange={v => {
        setOpen(v);
        if (!v) {
          setPage("home");
          setSelectedCandidate(null);
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
                transform: "scale(3)",
                transformOrigin: `${horizontal}% ${position}%`,
              }}
            />
          ) : (
            <UserRound size={25} />
          )}
          {active?.status === "ready" && <span className="reward-dot" />}
        </button>
      </DialogTrigger>
      <DialogContent className="reward-dialog">
        <div className="reward-heading">
          {page !== "home" && (
            <button aria-label="아바타 홈으로" onClick={() => setPage("home")}>
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
                  ledger: "포인트 내역",
                  guide: "포인트는 이렇게 모아요",
                }[page]
              }
            </DialogTitle>
            <DialogDescription>
              꾸준히 쌓은 배움, 나다운 모습으로.
            </DialogDescription>
          </div>
        </div>
        {query.isLoading && <p role="status">아바타를 불러오는 중이에요…</p>}
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
                    <img src={image} alt="나의 전신 아바타" />
                  ) : (
                    <div className="reward-empty">
                      <UserRound size={52} />
                      <p>선생님이 마스터 아바타를 준비하고 있어요.</p>
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
                    onClick={() => setPage("ledger")}
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
                    주문을 전달했어요. 선생님이 아바타 두 장을 준비 중이에요.
                  </div>
                )}
                {active?.status === "ready" && (
                  <section className="reward-arrival">
                    <h3>선택할 아바타가 도착했어요!</h3>
                    <p>마음에 드는 한 장을 골라 주세요.</p>
                    <div className="reward-cards">
                      {active.candidates.map((c, i) => (
                        <button
                          className={
                            selectedCandidate === c.id ? "selected" : ""
                          }
                          key={c.id}
                          aria-label={`후보 ${i + 1}`}
                          onClick={() => setSelectedCandidate(c.id)}
                          aria-pressed={selectedCandidate === c.id}
                        >
                          <img src={c.url} alt={`후보 ${i + 1}`} />
                          <span>후보 {i + 1}</span>
                        </button>
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
                      확정한 한 장이 컬렉션에 저장되며 선택은 변경할 수 없어요.
                    </small>
                  </section>
                )}
                {!active &&
                  account.balance >= data.nextPrice &&
                  account.masterUrl && (
                    <Button
                      className="reward-primary"
                      onClick={() => setPage("order")}
                    >
                      <Sparkles size={16} />
                      스페셜 아바타 만들기
                    </Button>
                  )}
                <Stylebook />
                <div className="reward-links">
                  <button onClick={() => setPage("collection")}>
                    내 컬렉션
                  </button>
                  <button onClick={() => setPage("ledger")}>포인트 내역</button>
                  <button onClick={() => setPage("guide")}>이용 안내</button>
                </div>
              </>
            )}
            {page === "guide" && (
              <div className="reward-guide">
                <h3>수업한 만큼 포인트가 쌓여요!</h3>
                <p>
                  실제 수업시간 <b>1분마다 1P</b>, 하루 최대 <b>150P</b>가
                  자동으로 적립돼요.
                </p>
                <div className="reward-note">
                  <b>하원 기록까지 꼭 완료해 주세요.</b>
                  <p>
                    하원 기록이 없으면 그날은 0P예요. 선생님이 출결을 수정하면
                    포인트도 다시 계산돼요.
                  </p>
                </div>
                <h3>스페셜 아바타 제작 포인트</h3>
                <ol>
                  {[
                    "첫 번째 · 500P",
                    "두 번째 · 1,000P",
                    "세 번째 · 1,500P",
                    "네 번째부터 · 2,250P",
                  ].map(t => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
                <p>
                  처음에는 빠르게 경험해 보고, 그다음에는 꾸준히 수업하며 다음
                  아바타를 준비해요.
                </p>
                <p>
                  <b>150P × 주 5일 × 3주 = 2,250P</b>
                  <br />
                  매일 최대 포인트를 모으면 15일 수업으로 만들 수 있어요.
                </p>
                <p>
                  주문할 때 포인트를 사용하며, 취소가 필요하면 선생님께 말씀해
                  주세요. 대표 이미지 변경은 무료예요. 누적 획득 포인트는
                  사용해도 줄지 않지만, 출결 정정은 반영돼요. 선생님이 지급한
                  보너스는 누적 획득에도 포함되며, 관리자 차감은 사용 가능
                  포인트만 줄어요.
                </p>
                <small>
                  새 포인트 적립은 2026년 9월 9일 수업부터 적용돼요. 출결
                  정정으로 잔액이 음수가 되면 이후 적립으로 보충돼요.
                </small>
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
                <p>마음에 드는 카드를 대표로 설정해 보세요.</p>
                <div className="reward-cards">
                  {account.masterUrl && (
                    <div>
                      <img src={account.masterUrl} alt="마스터 아바타" />
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          representative.mutate({
                            ...identity,
                            cardId: null,
                            cropY: 0,
                          })
                        }
                      >
                        {!account.representativeId
                          ? "대표 · 마스터"
                          : "마스터로 설정"}
                      </Button>
                    </div>
                  )}
                  {data.cards.map(c => (
                    <div key={c.id}>
                      <img src={c.url} alt="컬렉션 아바타" />
                      <small>
                        {modeLabels[c.mode as keyof typeof modeLabels]} ·{" "}
                        {c.createdAt.slice(0, 10)}
                      </small>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          representative.mutate({
                            ...identity,
                            cardId: c.id,
                            cropY: 0,
                          })
                        }
                      >
                        {account.representativeId === c.id
                          ? "현재 대표"
                          : "대표로 설정"}
                      </Button>
                    </div>
                  ))}
                </div>
                {image && (
                  <div className="reward-crop">
                    <h3>원형 사진 위치 조정</h3>
                    <div className="reward-profile preview">
                      <img
                        src={image}
                        alt="원형 사진 미리보기"
                        style={{
                          objectPosition: `${horizontal}% ${position}%`,
                          transform: "scale(3)",
                          transformOrigin: `${horizontal}% ${position}%`,
                        }}
                      />
                    </div>
                    <label>
                      얼굴 위치
                      <input
                        aria-label="얼굴 위치"
                        type="range"
                        min="0"
                        max="100"
                        value={position}
                        onChange={e => setCropY(Number(e.target.value))}
                      />
                    </label>
                    <label>
                      좌우 위치
                      <input
                        aria-label="얼굴 좌우 위치"
                        type="range"
                        min="0"
                        max="100"
                        value={horizontal}
                        onChange={e => setCropX(Number(e.target.value))}
                      />
                    </label>
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
            {page === "order" && (
              <form
                className="reward-order"
                onSubmit={e => {
                  e.preventDefault();
                  submit.mutate({ ...identity, order });
                }}
              >
                <div className="reward-note">
                  이번 제작은 <b>{data.nextPrice.toLocaleString()}P</b>예요.
                  주문을 보내면 포인트가 차감돼요.
                </div>
                <div className="reward-note">
                  마법 같은 옷과 친구를 상상해 보세요. 랜덤 문구도 마음대로
                  고쳐도 좋아요!
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setOrder(current => {
                        const next = { ...current };
                        for (const [key] of imaginationFields)
                          if (!next[key].trim())
                            next[key] = randomSuggestion(key);
                        return next;
                      })
                    }
                  >
                    빈칸만 랜덤으로 채우기
                  </Button>
                </div>
                {imaginationFields.map(([key, label]) => (
                  <div className="reward-field" key={key}>
                    <div className="reward-field-heading">
                      <label htmlFor={"reward-" + key}>
                        {label}
                        {["pet", "pose", "extra"].includes(key) && (
                          <small>선택</small>
                        )}
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={label + " 랜덤"}
                        onClick={() =>
                          setOrder(current => ({
                            ...current,
                            [key]: randomSuggestion(key, current[key]),
                          }))
                        }
                      >
                        랜덤
                      </Button>
                    </div>
                    <Input
                      id={"reward-" + key}
                      aria-label={label}
                      required={!["pet", "pose", "extra"].includes(key)}
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
                      onClick={() =>
                        setOrder(current => ({
                          ...current,
                          accessories: current.accessories.map((a, j) =>
                            i === j ? randomSuggestion("accessory", a) : a
                          ),
                        }))
                      }
                    >
                      랜덤
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
                        <b>{label}</b>
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
                  disabled={busy}
                >
                  {submit.isPending
                    ? "보내는 중…"
                    : `${data.nextPrice.toLocaleString()}P로 주문 보내기`}
                </Button>
              </form>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
