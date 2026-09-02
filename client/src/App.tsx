import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { lazy, Suspense } from "react";

const DashboardLayout = lazy(() => import("@/components/DashboardLayout"));
const Attendance = lazy(() => import("@/pages/Attendance"));
const Closures = lazy(() => import("@/pages/Closures"));
const Classes = lazy(() => import("@/pages/Classes"));
const Journal = lazy(() => import("@/pages/Journal"));
const LearningLinks = lazy(() => import("@/pages/LearningLinks"));
const ParentLinks = lazy(() => import("@/pages/ParentLinks"));
const NotificationLogs = lazy(() => import("@/pages/NotificationLogs"));
const StudentPortal = lazy(() => import("@/pages/StudentPortal"));
const Students = lazy(() => import("@/pages/Students"));
const TuitionStandards = lazy(() => import("@/pages/TuitionStandards"));
const CheckIn = lazy(() => import("@/pages/CheckIn"));

function RouteLoading() {
  return (
    <div className="min-h-screen bg-[#FCFBF7] px-5 py-10">
      <div className="mx-auto max-w-6xl animate-pulse space-y-4">
        <div className="h-8 w-48 rounded-xl bg-[#E8E3D8]" />
        <div className="h-28 rounded-2xl bg-[#F0ECE2]" />
        <div className="h-64 rounded-2xl bg-[#F0ECE2]" />
      </div>
    </div>
  );
}

function StaffPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <Switch>
        <Route path="/p/:token" component={StudentPortal} />
        <Route path="/check-in" component={CheckIn} />
        <Route
          path="/"
          component={() => (
            <StaffPage>
              <Home />
            </StaffPage>
          )}
        />
        <Route
          path="/attendance"
          component={() => (
            <StaffPage>
              <Attendance />
            </StaffPage>
          )}
        />
        <Route
          path="/closures"
          component={() => (
            <StaffPage>
              <Closures />
            </StaffPage>
          )}
        />
        <Route
          path="/journal"
          component={() => (
            <StaffPage>
              <Journal />
            </StaffPage>
          )}
        />
        <Route
          path="/students"
          component={() => (
            <StaffPage>
              <Students />
            </StaffPage>
          )}
        />
        <Route
          path="/tuition-standards"
          component={() => (
            <StaffPage>
              <TuitionStandards />
            </StaffPage>
          )}
        />
        <Route
          path="/parent-links"
          component={() => (
            <StaffPage>
              <ParentLinks />
            </StaffPage>
          )}
        />
        <Route
          path="/notification-logs"
          component={() => (
            <StaffPage>
              <NotificationLogs />
            </StaffPage>
          )}
        />
        <Route
          path="/learning-links"
          component={() => (
            <StaffPage>
              <LearningLinks />
            </StaffPage>
          )}
        />
        <Route
          path="/classes"
          component={() => (
            <StaffPage>
              <Classes />
            </StaffPage>
          )}
        />
        <Route path="/404" component={NotFound} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster richColors position="top-center" />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
