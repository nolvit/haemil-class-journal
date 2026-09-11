import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Music2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type Identity = { token: string; studentId: number };
const playbackKey = "haemil-avatar-bgm-enabled";

export function AvatarBgmPlayer({
  identity,
  open,
}: {
  identity: Identity;
  open: boolean;
}) {
  const query = trpc.avatarRewards.bgmState.useQuery(identity, {
    retry: false,
  });
  const audio = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(playbackKey) === "on"
  );
  const [wantedPlaying, setWantedPlaying] = useState(
    () =>
      typeof localStorage !== "undefined" &&
      localStorage.getItem(playbackKey) === "on"
  );
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const equipped =
    query.data?.tracks.find(x => x.id === query.data?.equipped) ?? null;

  const start = async () => {
    if (!audio.current || !equipped) return false;
    try {
      await audio.current.play();
      setPlaying(true);
      return true;
    } catch {
      setPlaying(false);
      return false;
    }
  };

  useEffect(() => {
    if (!audio.current) return;
    if (open && enabled && wantedPlaying && equipped) void start();
    else {
      audio.current.pause();
      setPlaying(false);
    }
  }, [open, enabled, wantedPlaying, equipped?.id]);

  useEffect(() => {
    const pause = () => {
      audio.current?.pause();
      setPlaying(false);
    };
    const resume = () => {
      if (open && enabled && wantedPlaying) void start();
    };
    window.addEventListener("haemil-bgm-preview-start", pause);
    window.addEventListener("haemil-bgm-preview-stop", resume);
    return () => {
      window.removeEventListener("haemil-bgm-preview-start", pause);
      window.removeEventListener("haemil-bgm-preview-stop", resume);
    };
  }, [open, enabled, wantedPlaying, equipped?.id]);

  return (
    <div className="avatar-bgm-player" aria-label="해밀월드 BGM 플레이어">
      <audio
        ref={audio}
        src={equipped?.url}
        loop
        preload="metadata"
        onPlaying={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={event => {
          const node = event.currentTarget;
          setProgress(
            node.duration ? (node.currentTime / node.duration) * 100 : 0
          );
        }}
      />
      <button
        type="button"
        className={enabled ? "is-on" : ""}
        aria-label={`배경 음악 ${enabled ? "끄기" : "켜기"}`}
        aria-pressed={enabled}
        onClick={async () => {
          if (!equipped) {
            toast.info("별빛 상점에서 BGM을 먼저 소장해 주세요.");
            return;
          }
          const next = !enabled;
          setEnabled(next);
          setWantedPlaying(next);
          localStorage.setItem(playbackKey, next ? "on" : "off");
          if (!next) audio.current?.pause();
          if (next && !(await start()))
            toast.info("재생 버튼을 한 번 더 눌러 음악을 시작해 주세요.");
        }}
      >
        {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        <span>{enabled ? "ON" : "OFF"}</span>
      </button>
      <div className="avatar-bgm-now">
        <span>{equipped?.title ?? "BGM을 선택해 주세요"}</span>
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={progress}
          disabled={!equipped}
          aria-label="BGM 재생 위치"
          style={{ "--bgm-progress": `${progress}%` } as CSSProperties}
          onChange={event => {
            const next = Number(event.currentTarget.value);
            setProgress(next);
            if (
              audio.current &&
              Number.isFinite(audio.current.duration) &&
              audio.current.duration > 0
            ) {
              audio.current.currentTime = (audio.current.duration * next) / 100;
            }
          }}
        />
      </div>
      <button
        type="button"
        className="bgm-play-toggle"
        disabled={!equipped}
        aria-label={playing ? "BGM 일시정지" : "BGM 재생"}
        onClick={async () => {
          if (playing) {
            setWantedPlaying(false);
            audio.current?.pause();
            return;
          }
          setEnabled(true);
          setWantedPlaying(true);
          localStorage.setItem(playbackKey, "on");
          if (!(await start()))
            toast.info("음악을 시작하지 못했어요. 다시 눌러 주세요.");
        }}
      >
        {playing ? (
          <Pause size={13} aria-hidden="true" />
        ) : (
          <Play size={13} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

export function AvatarBgmShop({
  identity,
  balance,
  onRefresh,
}: {
  identity: Identity;
  balance: number;
  onRefresh: () => void;
}) {
  const state = trpc.avatarRewards.bgmState.useQuery(identity, {
    retry: false,
  });
  const purchase = trpc.avatarRewards.purchaseBgm.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: result => {
      void state.refetch();
      onRefresh();
      toast.success(
        result.price === 0 ? "첫 BGM을 무료로 소장했어요." : "BGM을 소장했어요."
      );
    },
  });
  const equip = trpc.avatarRewards.equipBgm.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      void state.refetch();
      toast.success("해밀월드 BGM을 장착했어요.");
    },
  });
  const preview = useRef<HTMLAudioElement>(null);
  const timer = useRef<number | null>(null);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const stopPreview = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    preview.current?.pause();
    if (preview.current) preview.current.currentTime = 0;
    setPreviewing(null);
    window.dispatchEvent(new Event("haemil-bgm-preview-stop"));
  };
  useEffect(() => stopPreview, []);
  const owned = state.data?.owned ?? [];
  return (
    <div className="avatar-bgm-shop">
      <audio
        ref={preview}
        preload="metadata"
        onEnded={stopPreview}
        onTimeUpdate={event => {
          if (event.currentTarget.currentTime >= 20) stopPreview();
        }}
      />
      <div className="bgm-shop-note">
        <Music2 size={18} />
        <div>
          <b>첫 번째 BGM은 무료</b>
          <p>두 번째부터는 곡마다 표시된 포인트를 사용해 영구 소장해요.</p>
        </div>
      </div>
      <div className="bgm-product-grid">
        {(state.data?.tracks ?? []).map(track => {
          const isOwned = owned.includes(track.id);
          const equipped = state.data?.equipped === track.id;
          const price = state.data?.firstPurchaseFree ? 0 : track.price;
          return (
            <article className="bgm-product" key={track.id}>
              <div className="bgm-disc" aria-hidden="true">
                <Music2 />
              </div>
              <div className="bgm-product-copy">
                <span className="av-kicker">HAEMIL WORLD BGM</span>
                <h4>{track.title}</h4>
                <small>{track.durationLabel}</small>
                <p>{track.description}</p>
              </div>
              <button
                type="button"
                className={`bgm-preview ${previewing === track.id ? "is-previewing" : ""}`}
                aria-label={
                  previewing === track.id
                    ? "20초 미리듣기 중지"
                    : `${track.title} 미리 듣기`
                }
                onClick={async () => {
                  if (previewing === track.id) {
                    stopPreview();
                    return;
                  }
                  stopPreview();
                  if (!preview.current) return;
                  preview.current.src = track.url;
                  preview.current.currentTime = 0;
                  window.dispatchEvent(new Event("haemil-bgm-preview-start"));
                  try {
                    await preview.current.play();
                    setPreviewing(track.id);
                    timer.current = window.setTimeout(stopPreview, 20_000);
                  } catch {
                    toast.error(
                      "미리듣기를 시작하지 못했어요. 다시 눌러 주세요."
                    );
                    stopPreview();
                  }
                }}
              >
                {previewing === track.id ? (
                  <Pause size={15} />
                ) : (
                  <Play size={15} />
                )}
                {previewing === track.id ? (
                  <span className="bgm-preview-copy">
                    <b>20초</b>
                    <span>미리듣기</span>
                  </span>
                ) : (
                  <span>미리 듣기</span>
                )}
              </button>
              <button
                type="button"
                className="bgm-purchase"
                disabled={
                  purchase.isPending ||
                  equip.isPending ||
                  equipped ||
                  (!isOwned && balance < price)
                }
                onClick={() =>
                  isOwned
                    ? equip.mutate({ ...identity, trackId: track.id })
                    : purchase.mutate({ ...identity, trackId: track.id })
                }
              >
                {equipped
                  ? "장착 중"
                  : isOwned
                    ? "장착하기"
                    : price === 0
                      ? "첫 곡 무료 소장"
                      : balance < price
                        ? "포인트 부족"
                        : `${price}P로 영구 소장`}
              </button>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export function AvatarBgmCollection({ identity }: { identity: Identity }) {
  const state = trpc.avatarRewards.bgmState.useQuery(identity, {
    retry: false,
  });
  const equip = trpc.avatarRewards.equipBgm.useMutation({
    onError: error => toast.error(error.message),
    onSuccess: () => {
      void state.refetch();
      toast.success("컬렉션에서 선택한 BGM을 장착했어요.");
    },
  });
  const tracks = (state.data?.tracks ?? []).filter(track =>
    state.data?.owned.includes(track.id)
  );
  if (state.isLoading) return <p role="status">BGM 컬렉션을 불러오는 중…</p>;
  if (!tracks.length)
    return <p className="collection-empty">아직 소장한 BGM이 없어요.</p>;
  return (
    <div className="bgm-collection-grid">
      {tracks.map(track => {
        const equipped = state.data?.equipped === track.id;
        return (
          <article className="bgm-collection-item" key={track.id}>
            <div className="bgm-disc" aria-hidden="true">
              <Music2 />
            </div>
            <div>
              <span className="av-kicker">OWNED BGM</span>
              <h4>{track.title}</h4>
              <small>{track.durationLabel}</small>
              <p>{track.description}</p>
            </div>
            <button
              disabled={equipped || equip.isPending}
              onClick={() => equip.mutate({ ...identity, trackId: track.id })}
            >
              {equipped ? "현재 장착" : "장착하기"}
            </button>
          </article>
        );
      })}
    </div>
  );
}
