import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { startLogin } from "@/const";
import { useIsMobile } from "@/hooks/useMobile";
import { getMobileSwipeDestination } from "@shared/mobileSwipeNavigation";
import {
  Banknote,
  BookMarked,
  BookOpenCheck,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  ClipboardCheck,
  GraduationCap,
  LayoutDashboard,
  Link2,
  LogOut,
  PanelLeft,
  UsersRound,
} from "lucide-react";
import { type CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";
import { PwaInstallPrompt } from "./PwaInstallPrompt";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

type MenuItem = {
  icon: typeof LayoutDashboard;
  label: string;
  path: string;
  adminOnly?: boolean;
};
const menuGroups: Array<{ label: string; items: MenuItem[] }> = [
  {
    label: "업무",
    items: [{ icon: LayoutDashboard, label: "업무 현황", path: "/" }],
  },
  {
    label: "수업 운영",
    items: [
      { icon: CalendarDays, label: "출석 관리", path: "/attendance" },
      { icon: BookOpenCheck, label: "수업 일지", path: "/journal" },
      {
        icon: BookMarked,
        label: "학습 링크",
        path: "/learning-links",
        adminOnly: true,
      },
    ],
  },
  {
    label: "학원 관리",
    items: [
      {
        icon: GraduationCap,
        label: "학생 관리",
        path: "/students",
        adminOnly: true,
      },
      { icon: UsersRound, label: "반 관리", path: "/classes", adminOnly: true },
      {
        icon: Banknote,
        label: "원비 관리",
        path: "/tuition-standards",
        adminOnly: true,
      },
      {
        icon: CalendarPlus,
        label: "휴강 관리",
        path: "/closures",
        adminOnly: true,
      },
    ],
  },
  {
    label: "공유",
    items: [
      {
        icon: Link2,
        label: "보호자 링크",
        path: "/parent-links",
        adminOnly: true,
      },
    ],
  },
];

const SIDEBAR_WIDTH_KEY = "haemil-sidebar-width";
const DEFAULT_WIDTH = 268;
const MIN_WIDTH = 224;
const MAX_WIDTH = 360;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? Number.parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user, logout } = useAuth();
  const authConfig = trpc.auth.config.useQuery();
  const authUtils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const localLogin = trpc.auth.localLogin.useMutation({
    onSuccess: result => {
      authUtils.auth.me.setData(undefined, result.user);
      setPassword("");
    },
    onError: error => toast.error(error.message),
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return (
      <>
        <DashboardLayoutSkeleton />
        <div className="hidden" aria-hidden="true">
          {children}
        </div>
      </>
    );
  }
  if (!user) {
    return (
      <div className="journal-auth-shell">
        <div className="journal-auth-card">
          <div className="brand-seal">H</div>
          <p className="eyebrow">HAEMIL ACADEMY</p>
          <h1>
            수업의 기록을
            <br />더 섬세하게.
          </h1>
          <p>
            강사와 관리자를 위한 해밀학원 수업일지입니다. 계정으로 로그인해
            업무를 이어가세요.
          </p>
          {authConfig.data?.localEnabled && (
            <form
              className="mt-5 grid gap-3"
              onSubmit={event => {
                event.preventDefault();
                localLogin.mutate({ email, password });
              }}
            >
              <Input
                type="email"
                autoComplete="username"
                value={email}
                onChange={event => setEmail(event.target.value)}
                placeholder="관리자 이메일"
                required
              />
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                placeholder="비밀번호"
                minLength={8}
                required
              />
              <Button
                type="submit"
                size="lg"
                disabled={localLogin.isPending}
                className="w-full journal-primary-button"
              >
                {localLogin.isPending ? "로그인 중…" : "관리자 로그인"}
                <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </form>
          )}
          {authConfig.data?.manusEnabled && (
            <Button
              onClick={() => startLogin()}
              size="lg"
              variant={authConfig.data.localEnabled ? "outline" : "default"}
              className={`mt-3 w-full ${authConfig.data.localEnabled ? "" : "journal-primary-button"}`}
            >
              Manus 계정으로 로그인 <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          )}
          {!authConfig.isLoading &&
            !authConfig.data?.localEnabled &&
            !authConfig.data?.manusEnabled && (
              <p className="mt-4 rounded-xl bg-[#FCE9E5] p-3 text-sm text-[#A05242]">
                관리자 로그인 설정이 필요합니다.
              </p>
            )}
        </div>
      </div>
    );
  }
  if (user.role !== "admin") {
    return (
      <div className="journal-auth-shell">
        <div className="journal-auth-card">
          <div className="brand-seal">H</div>
          <p className="eyebrow">ACCESS RESTRICTED</p>
          <h1>
            내부 업무 화면은
            <br />
            관리자 전용입니다.
          </h1>
          <p>
            현재 계정에는 해밀학원 수업일지 내부 화면 권한이 없습니다.
            관리자에게 계정 등록을 요청해 주세요.
          </p>
          <Button
            onClick={logout}
            variant="outline"
            size="lg"
            className="w-full"
          >
            로그아웃
          </Button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
}) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const [pageTransitionDirection, setPageTransitionDirection] = useState<
    "next" | "previous"
  >("next");
  const sidebarRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const isMobile = useIsMobile();
  const visibleGroups = menuGroups
    .map(group => ({
      ...group,
      items: group.items.filter(
        item => !item.adminOnly || user?.role === "admin"
      ),
    }))
    .filter(group => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap(group => group.items);
  const activeMenuItem =
    visibleItems.find(item => item.path === location) ?? visibleItems[0];

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizing) return;
      const left = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const width = event.clientX - left;
      if (width >= MIN_WIDTH && width <= MAX_WIDTH) setSidebarWidth(width);
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !isMobile) return;
    const shouldIgnoreSwipe = (target: EventTarget | null) =>
      target instanceof Element &&
      Boolean(
        target.closest(
          "button, input, textarea, select, [contenteditable=true], [role=dialog], .overflow-x-auto, [data-swipe-disabled]"
        )
      );
    const handleTouchStart = (event: TouchEvent) => {
      if (shouldIgnoreSwipe(event.target) || event.touches.length !== 1) {
        swipeStartRef.current = null;
        return;
      }
      const touch = event.touches[0];
      swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
    };
    const handleTouchEnd = (event: TouchEvent) => {
      const start = swipeStartRef.current;
      swipeStartRef.current = null;
      if (
        !start ||
        event.changedTouches.length !== 1 ||
        shouldIgnoreSwipe(event.target)
      )
        return;
      const touch = event.changedTouches[0];
      const deltaX = touch.clientX - start.x;
      const destination = getMobileSwipeDestination(
        location,
        deltaX,
        touch.clientY - start.y
      );
      if (!destination) return;
      const date = new URLSearchParams(window.location.search).get("date");
      setPageTransitionDirection(deltaX < 0 ? "next" : "previous");
      setLocation(
        `${destination}${date ? `?date=${encodeURIComponent(date)}` : ""}`
      );
    };
    main.addEventListener("touchstart", handleTouchStart, { passive: true });
    main.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      main.removeEventListener("touchstart", handleTouchStart);
      main.removeEventListener("touchend", handleTouchEnd);
    };
  }, [isMobile, location, setLocation]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="journal-sidebar border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="h-[104px] justify-center px-3">
            <div className="flex w-full items-center gap-3 px-1">
              <button
                onClick={toggleSidebar}
                className="journal-sidebar-toggle"
                aria-label="메뉴 열기 또는 닫기"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              {!isCollapsed && (
                <div className="min-w-0">
                  <p className="font-serif text-[20px] leading-none tracking-[-0.03em] text-[#F8F5EE]">
                    haemil.
                  </p>
                  <p className="mt-1 text-[9px] font-semibold tracking-[0.18em] text-[#CBB98A]">
                    CLASS JOURNAL
                  </p>
                </div>
              )}
            </div>
          </SidebarHeader>
          <SidebarContent className="gap-0 px-3">
            {visibleGroups.map(group => (
              <div className="journal-menu-group" key={group.label}>
                {!isCollapsed && (
                  <p className="journal-menu-group-label">{group.label}</p>
                )}
                <SidebarMenu className="gap-1">
                  <>
                    {group.items.map(item => {
                      const active = location === item.path;
                      return (
                        <SidebarMenuItem key={item.path}>
                          <SidebarMenuButton
                            isActive={active}
                            onClick={() => setLocation(item.path)}
                            tooltip={item.label}
                            className="journal-sidebar-item h-11 rounded-xl px-3 text-[#E8ECE8] hover:bg-white/10 hover:text-white data-[active=true]:bg-[#D8C59A] data-[active=true]:text-[#193D3C]"
                          >
                            <item.icon className="h-[17px] w-[17px]" />
                            <span className="font-medium">{item.label}</span>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      );
                    })}
                  </>
                </SidebarMenu>
              </div>
            ))}
          </SidebarContent>
          <SidebarFooter className="p-3">
            <div className="mb-3 group-data-[collapsible=icon]:hidden">
              <PwaInstallPrompt compact />
            </div>
            <div className="mb-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center gap-2 text-[#F5F1E8]">
                <ClipboardCheck className="h-4 w-4 text-[#D8C59A]" />
                <span className="text-xs font-medium">매일의 배움을 기록</span>
              </div>
              <p className="mt-1 text-[10px] leading-4 text-[#AAB9B6]">
                누락된 항목은 노란색으로 확인하세요.
              </p>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/10 group-data-[collapsible=icon]:justify-center">
                  <Avatar className="h-9 w-9 border border-[#D8C59A]/50 bg-[#E9DFC7] shrink-0">
                    <AvatarFallback className="bg-[#E9DFC7] text-xs font-bold text-[#234E52]">
                      {user?.name?.slice(0, 1).toUpperCase() ?? "H"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                    <p className="truncate text-sm font-medium text-[#F8F5EE]">
                      {user?.name || "관리자"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#AAB9B6]">관리자</p>
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  로그아웃
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute right-0 top-0 z-50 h-full w-1 cursor-col-resize transition-colors hover:bg-[#CBB98A]/60 ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => setIsResizing(true)}
        />
      </div>
      <SidebarInset className="journal-inset bg-[#F8F5EE]">
        {isMobile && (
          <div className="journal-mobile-header">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-xl border border-[#D9D4C8] bg-[#FFFEFA]" />
              <span className="font-serif text-lg text-[#183E3D]">haemil.</span>
            </div>
            <span className="text-xs font-medium text-[#657674]">
              {activeMenuItem?.label}
            </span>
          </div>
        )}
        <main
          ref={mainRef}
          className="min-h-screen flex-1 px-4 py-6 md:px-8 lg:px-10 lg:py-9"
        >
          <div
            key={location}
            className={`mobile-page-transition mobile-page-transition-${pageTransitionDirection}`}
          >
            {children}
          </div>
        </main>
      </SidebarInset>
    </>
  );
}
