import { BrowserRouter, Routes, Route, NavLink, useLocation, Navigate } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  TrendingUp,
  Search,
  ScrollText,
  ClipboardList,
  AlertTriangle,
  Map,
  Zap,
  Target,
  Cloud,
  Menu,
  X,
  LogOut,
} from "lucide-react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import Dashboard from "./pages/Dashboard";
import NewScan from "./pages/NewScan";
import ScanProgress from "./pages/ScanProgress";
import Results from "./pages/Results";
import Issues from "./pages/Issues";
import Diagrams from "./pages/Diagrams";
import History from "./pages/History";
import ApiList from "./pages/ApiList";
import ApiDashboard from "./pages/ApiDashboard";
import CloudWatchPage from "./pages/CloudWatchPage";
import DiagramViewer from "./pages/DiagramViewer";
import TrendDashboard from "./pages/TrendDashboard";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import GridPattern from "@/components/ui/grid-pattern";
import "./index.css";

const navSections = [
  {
    label: "Overview",
    items: [
      { to: "/", icon: LayoutDashboard, label: "Dashboard", end: true },
      { to: "/trends", icon: TrendingUp, label: "Trends" },
    ],
  },
  {
    label: "Scanning",
    items: [
      { to: "/scan", icon: Search, label: "New Scan" },
      { to: "/history", icon: ScrollText, label: "Scan History" },
    ],
  },
  {
    label: "Analysis",
    items: [
      { to: "/results", icon: ClipboardList, label: "Results" },
      { to: "/issues", icon: AlertTriangle, label: "Issues" },
      { to: "/diagrams", icon: Map, label: "Diagrams" },
    ],
  },
  {
    label: "Testing & Monitoring",
    items: [
      { to: "/apis", icon: Zap, label: "Local APIs" },
      { to: "/apm", icon: Target, label: "APM & Load Test" },
      { to: "/cloudwatch", icon: Cloud, label: "CloudWatch Logs" },
    ],
  },
];

/** Protects routes — redirects to /login if not authenticated */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <Routes location={location}>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* Protected routes */}
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/scan" element={<ProtectedRoute><NewScan /></ProtectedRoute>} />
          <Route path="/scan/:scanId" element={<ProtectedRoute><ScanProgress /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="/trends" element={<ProtectedRoute><TrendDashboard /></ProtectedRoute>} />
          <Route path="/results" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/results/:scanId" element={<ProtectedRoute><Results /></ProtectedRoute>} />
          <Route path="/issues" element={<ProtectedRoute><Issues /></ProtectedRoute>} />
          <Route path="/issues/:scanId" element={<ProtectedRoute><Issues /></ProtectedRoute>} />
          <Route path="/diagrams" element={<ProtectedRoute><Diagrams /></ProtectedRoute>} />
          <Route path="/diagrams/:scanId" element={<ProtectedRoute><Diagrams /></ProtectedRoute>} />
          <Route path="/diagrams/:scanId/view/:filename" element={<ProtectedRoute><DiagramViewer /></ProtectedRoute>} />
          <Route path="/apis" element={<ProtectedRoute><ApiList /></ProtectedRoute>} />
          <Route path="/apis/:projectName" element={<ProtectedRoute><ApiDashboard /></ProtectedRoute>} />
          <Route path="/apm" element={<ProtectedRoute><ApiList basePath="/apm" /></ProtectedRoute>} />
          <Route path="/apm/:projectName" element={<ProtectedRoute><ApiDashboard /></ProtectedRoute>} />
          <Route path="/cloudwatch" element={<ProtectedRoute><ApiList basePath="/cloudwatch" /></ProtectedRoute>} />
          <Route path="/cloudwatch/:projectName" element={<ProtectedRoute><CloudWatchPage /></ProtectedRoute>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
}

function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, isAuthenticated, logout } = useAuth();
  const location = useLocation();

  // Don't show sidebar on login/signup pages
  const isAuthPage = location.pathname === "/login" || location.pathname === "/signup";
  if (isAuthPage) return <AnimatedRoutes />;

  return (
    <div className="app-layout">
      {/* Mobile hamburger */}
      <button
        className="fixed top-4 left-4 z-[200] flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-surface-card text-txt-primary shadow-lg md:hidden"
        onClick={() => setMobileOpen((v) => !v)}
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`sidebar ${mobileOpen ? "!translate-x-0" : ""}`}
      >
        <div className="sidebar-brand">
          <h1>⚡ API Analyst</h1>
          <p>Code Health Intelligence</p>
        </div>
        <nav className="sidebar-nav">
          {navSections.map((section) => (
            <div key={section.label}>
              <div className="nav-section-label">{section.label}</div>
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  <span className="nav-icon">
                    <item.icon size={18} strokeWidth={1.8} />
                  </span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* User footer */}
        <div className="mt-auto border-t border-indigo-500/[0.06] px-4 py-3">
          {isAuthenticated && user ? (
            <div className="flex items-center gap-3">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  referrerPolicy="no-referrer"
                  className="h-8 w-8 rounded-full border border-white/10"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-500/20 text-xs font-bold text-indigo-400">
                  {user.name?.charAt(0)?.toUpperCase() || "U"}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="truncate text-[0.78rem] font-semibold text-txt-primary">
                  {user.name}
                </div>
                <div className="truncate text-[0.65rem] text-txt-muted">
                  {user.email}
                </div>
              </div>
              <button
                onClick={logout}
                title="Sign out"
                className="flex h-7 w-7 items-center justify-center rounded-lg text-txt-muted transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <LogOut size={15} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" />
              <p className="text-[0.68rem] leading-snug text-txt-muted">
                API Analysis · v2.0
              </p>
            </div>
          )}
        </div>
      </aside>

      <main className="main-content relative">
        <GridPattern className="opacity-30" />
        <div className="relative z-10">
          <AnimatedRoutes />
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
