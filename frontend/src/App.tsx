import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
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
import "./index.css";

function App() {
  return (
    <BrowserRouter>
      <div className="app-layout">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <h1>⚡ API Analyst</h1>
            <p>Code Health Intelligence</p>
          </div>
          <nav className="sidebar-nav">
            <div className="nav-section-label">Overview</div>
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">📊</span> Dashboard
            </NavLink>
            <NavLink
              to="/trends"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">📈</span> Trends
            </NavLink>

            <div className="nav-section-label">Scanning</div>
            <NavLink
              to="/scan"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">🔍</span> New Scan
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">📜</span> Scan History
            </NavLink>

            <div className="nav-section-label">Analysis</div>
            <NavLink
              to="/results"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">📋</span> Results
            </NavLink>
            <NavLink
              to="/issues"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">⚠️</span> Issues
            </NavLink>
            <NavLink
              to="/diagrams"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">🗺️</span> Diagrams
            </NavLink>

            <div className="nav-section-label">Testing &amp; Monitoring</div>
            <NavLink
              to="/apis"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">⚡</span> Local APIs
            </NavLink>
            <NavLink
              to="/apm"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">🎯</span> APM &amp; Load Test
            </NavLink>
            <NavLink
              to="/cloudwatch"
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <span className="nav-icon">☁️</span> CloudWatch Logs
            </NavLink>
          </nav>
          <div
            style={{
              padding: "0.85rem 1.5rem",
              borderTop: "1px solid rgba(99, 102, 241, 0.06)",
              marginTop: "auto",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "#22c55e",
                boxShadow: "0 0 8px rgba(34, 197, 94, 0.4)",
                flexShrink: 0,
              }}
            />
            <p
              style={{
                fontSize: "0.68rem",
                color: "var(--text-muted)",
                lineHeight: 1.4,
              }}
            >
              API Analysis · v2.0
            </p>
          </div>
        </aside>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scan" element={<NewScan />} />
            <Route path="/scan/:scanId" element={<ScanProgress />} />
            <Route path="/history" element={<History />} />
            <Route path="/trends" element={<TrendDashboard />} />
            <Route path="/results" element={<Results />} />
            <Route path="/results/:scanId" element={<Results />} />
            <Route path="/issues" element={<Issues />} />
            <Route path="/issues/:scanId" element={<Issues />} />
            <Route path="/diagrams" element={<Diagrams />} />
            <Route path="/diagrams/:scanId" element={<Diagrams />} />
            <Route
              path="/diagrams/:scanId/view/:filename"
              element={<DiagramViewer />}
            />
            <Route path="/apis" element={<ApiList />} />
            <Route path="/apis/:projectName" element={<ApiDashboard />} />
            <Route path="/apm" element={<ApiList basePath="/apm" />} />
            <Route path="/apm/:projectName" element={<ApiDashboard />} />
            <Route
              path="/cloudwatch"
              element={<ApiList basePath="/cloudwatch" />}
            />
            <Route
              path="/cloudwatch/:projectName"
              element={<CloudWatchPage />}
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
