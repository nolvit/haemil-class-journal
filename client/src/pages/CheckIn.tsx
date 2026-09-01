import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, Clock3, LogIn, LogOut } from "lucide-react";
import { useState } from "react";

const todayInKorea = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );

export default function CheckIn() {
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [submittedCode, setSubmittedCode] = useState("");
  const [success, setSuccess] = useState<{
    studentName: string;
    eventType: "check_in" | "check_out";
    occurredAt: Date | string;
  } | null>(null);
  const preview = trpc.academy.attendanceCode.preview.useQuery(
    { code: submittedCode || "0000", eventDate: todayInKorea() },
    { enabled: submittedCode.length === 4, retry: false }
  );
  const confirm = trpc.academy.attendanceCode.confirm.useMutation({
    onSuccess: result => {
      setSuccess(result);
      setSubmittedCode("");
      setCode("");
    },
  });
  const reset = () => {
    setSubmittedCode("");
    setCode("");
    setSuccess(null);
  };
  const eventLabel =
    preview.data?.nextEventType === "check_in" ? "등원" : "하원";
  return (
    <main className="min-h-screen bg-[#F3F0E8] px-4 py-8 sm:py-16">
      <div className="mx-auto max-w-md">
        <header className="mb-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#193D3C] font-serif text-3xl text-[#D8C59A]">
            H
          </div>
          <p className="eyebrow mt-4">HAEMIL ATTENDANCE</p>
          <h1 className="mt-1 font-serif text-3xl text-[#193D3C]">
            등·하원 입력
          </h1>
          <p className="mt-2 text-sm text-[#71817D]">
            학생 고유번호 4자리를 입력해 주세요.
          </p>
        </header>
        <Card className="journal-surface">
          <CardContent className="p-6">
            <form
              onSubmit={async event => {
                event.preventDefault();
                if (/^\d{4}$/.test(code)) {
                  await utils.academy.attendanceCode.preview.reset({ code, eventDate: todayInKorea() });
                  setSubmittedCode(code);
                }
              }}
            >
              <Input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoFocus
                value={code}
                onChange={event =>
                  setCode(event.target.value.replace(/\D/g, "").slice(0, 4))
                }
                className="h-16 text-center text-3xl font-bold tracking-[0.45em]"
                aria-label="학생 고유번호"
                placeholder="0000"
              />
              <Button
                type="submit"
                className="journal-primary-button mt-4 h-12 w-full"
                disabled={code.length !== 4 || preview.isFetching}
              >
                <Clock3 className="mr-2 h-4 w-4" />
                확인하기
              </Button>
            </form>
              {(preview.isError || (submittedCode.length === 4 && preview.data === null)) && (
              <p className="mt-4 rounded-xl bg-[#FCE9E5] p-3 text-center text-sm text-[#A05242]">
                번호를 확인해 주세요.
              </p>
            )}
            {preview.data && !preview.data.nextEventType && (
              <div className="mt-4 rounded-xl bg-[#E8EFED] p-4 text-center">
                <CheckCircle2 className="mx-auto h-6 w-6 text-[#315B57]" />
                <p className="mt-2 text-sm font-semibold text-[#294A47]">
                  {preview.data.student.name} 학생은 오늘 등·하원 입력을 모두
                  완료했습니다.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={reset}
                >
                  다른 번호 입력
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {!success && <Dialog
        open={Boolean(preview.data?.nextEventType) && !success}
        onOpenChange={open => {
          if (!open) setSubmittedCode("");
        }}
      >
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-[#E8EFED] text-[#315B57]">
              {preview.data?.nextEventType === "check_in" ? (
                <LogIn />
              ) : (
                <LogOut />
              )}
            </div>
            <DialogTitle>
              {preview.data?.student.name} 학생의 {eventLabel}을 입력할까요?
            </DialogTitle>
            <DialogDescription>
              {preview.data?.student.grade} · 확인을 누르면 현재 시각으로{" "}
              {eventLabel} 기록이 저장되고 보호자에게 알림이 전송됩니다.
            </DialogDescription>
          </DialogHeader>
          {confirm.error && (
            <p className="rounded-xl bg-[#FCE9E5] p-3 text-sm text-[#A05242]">
              {confirm.error.message}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={confirm.isPending}
              onClick={() => setSubmittedCode("")}
            >
              취소
            </Button>
            <Button
              className="journal-primary-button"
              disabled={confirm.isPending || !submittedCode}
              onClick={() =>
                confirm.mutate({
                  code: submittedCode,
                  eventDate: todayInKorea(),
                })
              }
            >
              {confirm.isPending ? "저장 중…" : `${eventLabel} 확정`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
      {success && <Dialog
        open={Boolean(success)}
        onOpenChange={open => {
          if (!open) reset();
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-[#E5F0E9] text-[#2F7154]">
              <CheckCircle2 />
            </div>
            <DialogTitle>
              {success?.eventType === "check_in" ? "등원" : "하원"} 입력이
              완료되었습니다.
            </DialogTitle>
            <DialogDescription>
              {success?.studentName} 학생 ·{" "}
              {success &&
                new Date(success.occurredAt).toLocaleTimeString("ko-KR", {
                  timeZone: "Asia/Seoul",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="journal-primary-button w-full" onClick={reset}>
              확인
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>}
    </main>
  );
}
