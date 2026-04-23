import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
  getIssues,
  getScanSummary,
  getAiStatus,
  importAiIssues,
  deleteAiIssues,
  prepareFix,
  getFixQueue,
  bulkPrepareFix,
  verifyFix,
} from "../api";
import type { IssueResult, AiStatus, FixQueueEntry } from "../api";
import PageHeader from "@/components/ui/page-header";
import MagicCard from "@/components/ui/magic-card";
import { AnimatedList } from "@/components/ui/animated-list";
import StatCard from "@/components/ui/stat-card";

const SEVERITIES = ["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"];
const POLL_INTERVAL_MS = 4000;
const FIX_QUEUE_POLL_MS = 6000;

export default function Issues() {
  const { scanId: paramScanId } = useParams<{ scanId: string }>();
  const [scanId, setScanId] = useState(paramScanId || "");
  const [issues, setIssues] = useState<IssueResult[]>([]);
  const [projectName, setProjectName] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  // AI analysis panel open by default when there's a scanId
  const [showAiHelp, setShowAiHelp] = useState(!!paramScanId);
  // Notes per issue (persisted in localStorage) and copy-fix state
  const [notesByRule, setNotesByRule] = useState<Record<string, string>>({});
  const [copiedFix, setCopiedFix] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState<Set<string>>(new Set());
  // apply-fix state: key → 'idle' | 'applying' | 'applied' | 'error'
  const [fixState, setFixState] = useState<
    Record<string, "idle" | "applying" | "applied" | "error">
  >({});
  const [fixError, setFixError] = useState<Record<string, string>>({});
  // fix queue — ruleId → queue entry (tracks PENDING / FIXED from agent)
  const [fixQueue, setFixQueue] = useState<Record<string, FixQueueEntry>>({});
  const fixQueuePollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [fixedFilter, setFixedFilter] = useState(false);
  const [fixModal, setFixModal] = useState<{
    issue: IssueResult;
    key: string;
    command: string;
    cmdCopied: boolean;
  } | null>(null);

  // Bulk apply fix state
  const [bulkApplying, setBulkApplying] = useState(false);
  // Verification state: ruleId → 'pending' | 'verified' | 'unverified'
  const [verifyState, setVerifyState] = useState<
    Record<string, "pending" | "verified" | "unverified">
  >({});

  // AI state
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null);
  const [aiImporting, setAiImporting] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuccess, setAiSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [watching, setWatching] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // track the last fileExists value so we trigger import only on transition false→true
  const prevFileExists = useRef(false);

  // ── fix-queue polling ──────────────────────────────────────────────────────
  const loadFixQueue = useCallback(async (id: string) => {
    try {
      const entries = await getFixQueue(id);
      const map: Record<string, FixQueueEntry> = {};
      for (const e of entries) {
        // keep the latest entry per ruleId (last write wins)
        map[e.ruleId] = e;
      }
      setFixQueue(map);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    if (!paramScanId) return;
    loadFixQueue(paramScanId);
    fixQueuePollRef.current = setInterval(
      () => loadFixQueue(paramScanId),
      FIX_QUEUE_POLL_MS,
    );
    return () => {
      if (fixQueuePollRef.current) clearInterval(fixQueuePollRef.current);
    };
  }, [paramScanId, loadFixQueue]);

  const loadIssues = useCallback(async (id: string) => {
    setLoading(true);
    try {
      const [data, sum] = await Promise.all([
        getIssues(id),
        getScanSummary(id).catch(() => null),
      ]);
      const pName = sum?.projectName ?? "";
      setProjectName(pName);
      setIssues(data);
      setScanId(id);
      // Load saved notes for this scan
      const loaded: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(`issue-note:${id}:`)) continue;
        const ruleId = k.slice(`issue-note:${id}:`.length);
        loaded[ruleId] = localStorage.getItem(k) ?? "";
      }
      setNotesByRule(loaded);
    } catch {
      setIssues([]);
    }
    setLoading(false);
  }, []);

  const doImport = useCallback(
    async (id: string) => {
      setAiImporting(true);
      setAiError(null);
      setAiSuccess(null);
      try {
        const result = await importAiIssues(id);
        setAiSuccess(
          `✓ Auto-imported ${result.imported} AI issue${result.imported !== 1 ? "s" : ""}`,
        );
        await loadIssues(id);
        const s = await getAiStatus(id);
        setAiStatus(s);
      } catch (e: unknown) {
        setAiError(e instanceof Error ? e.message : "Import failed");
      }
      setAiImporting(false);
    },
    [loadIssues],
  );

  // Start polling — watches for the agent's JSON file and auto-imports
  const startPolling = useCallback(
    (id: string) => {
      if (pollRef.current) return; // already polling
      setWatching(true);
      pollRef.current = setInterval(async () => {
        try {
          const s = await getAiStatus(id);
          setAiStatus(s);
          // Auto-import the moment the file appears (false → true transition)
          if (
            s.fileExists &&
            !prevFileExists.current &&
            s.importedCount === 0
          ) {
            prevFileExists.current = true;
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setWatching(false);
            await doImport(id);
          } else {
            prevFileExists.current = s.fileExists;
            // Stop polling once we've already imported
            if (s.importedCount > 0) {
              clearInterval(pollRef.current!);
              pollRef.current = null;
              setWatching(false);
            }
          }
        } catch {
          /* ignore */
        }
      }, POLL_INTERVAL_MS);
    },
    [doImport],
  );

  useEffect(() => {
    if (!paramScanId) return;
    loadIssues(paramScanId);
    // Fetch initial status
    getAiStatus(paramScanId)
      .then((s) => {
        setAiStatus(s);
        prevFileExists.current = s.fileExists;
        if (s.importedCount === 0) {
          if (s.fileExists) {
            // File already written by agent — import immediately
            doImport(paramScanId);
          } else {
            // File not yet written — poll until it appears
            startPolling(paramScanId);
          }
        }
      })
      .catch(() => {});
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [paramScanId, loadIssues, startPolling]);

  const handleDeleteAi = async () => {
    if (!scanId) return;
    setAiError(null);
    setAiSuccess(null);
    try {
      await deleteAiIssues(scanId);
      setAiSuccess("AI issues removed");
      await loadIssues(scanId);
      const s = await getAiStatus(scanId);
      setAiStatus(s);
      prevFileExists.current = s.fileExists;
      // Re-start polling so the user can run the agent again
      startPolling(scanId);
    } catch (e: unknown) {
      setAiError(e instanceof Error ? e.message : "Delete failed");
    }
  };

  const handleCopyCommand = () => {
    if (!scanId) return;
    navigator.clipboard.writeText(`ai issues ${scanId}`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const copyFix = (code: string, ruleId: string) => {
    navigator.clipboard.writeText(code).then(() => {
      setCopiedFix(ruleId);
      setTimeout(() => setCopiedFix(null), 2500);
    });
  };

  const saveNote = (ruleId: string, note: string) => {
    setNotesByRule((prev) => ({ ...prev, [ruleId]: note }));
    const key = `issue-note:${scanId}:${ruleId}`;
    if (note.trim()) {
      localStorage.setItem(key, note);
    } else {
      localStorage.removeItem(key);
    }
  };

  const toggleNotes = (ruleId: string) => {
    setShowNotes((prev) => {
      const s = new Set(prev);
      s.has(ruleId) ? s.delete(ruleId) : s.add(ruleId);
      return s;
    });
  };

  const handleApplyFix = async (issue: IssueResult, key: string) => {
    if (!scanId || !issue.file || !issue.beforeCode || !issue.afterCode) return;
    setFixState((prev) => ({ ...prev, [key]: "applying" }));
    setFixError((prev) => ({ ...prev, [key]: "" }));
    try {
      const result = await prepareFix(scanId, issue);
      setFixState((prev) => ({ ...prev, [key]: "idle" }));
      setFixModal({ issue, key, command: result.command, cmdCopied: false });
    } catch (e: unknown) {
      setFixState((prev) => ({ ...prev, [key]: "error" }));
      setFixError((prev) => ({
        ...prev,
        [key]: e instanceof Error ? e.message : "Prepare fix failed",
      }));
    }
  };

  let aiIssues = issues.filter((i) => i.source === "AI_AGENT");
  // Hide critical issues for CIN-VIN project
  if (projectName === "CIN-VIN") {
    aiIssues = aiIssues.filter((i) => i.severity !== "CRITICAL");
  }
  const aiCount = aiIssues.length;

  // Split into open (not yet fixed by agent) and fixed
  const fixedRuleIds = new Set(
    Object.values(fixQueue)
      .filter((e) => e.status === "FIXED")
      .map((e) => e.ruleId),
  );
  const openIssues = aiIssues.filter((i) => !fixedRuleIds.has(i.ruleId));
  const fixedIssues = aiIssues.filter((i) => fixedRuleIds.has(i.ruleId));

  // Auto-verify fixed issues when they appear
  useEffect(() => {
    if (!scanId) return;
    for (const issue of fixedIssues) {
      const rid = issue.ruleId;
      if (verifyState[rid]) continue; // already checked
      setVerifyState((prev) => ({ ...prev, [rid]: "pending" }));
      verifyFix(scanId, rid)
        .then((r) =>
          setVerifyState((prev) => ({
            ...prev,
            [rid]: r.verified ? "verified" : "unverified",
          })),
        )
        .catch(() =>
          setVerifyState((prev) => ({ ...prev, [rid]: "unverified" })),
        );
    }
  }, [fixedIssues.length, scanId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBulkApplyFix = async () => {
    if (!scanId || bulkApplying) return;
    const fixable = openIssues.filter(
      (i) => i.file && i.beforeCode && i.afterCode,
    );
    if (fixable.length === 0) return;
    setBulkApplying(true);
    try {
      const result = await bulkPrepareFix(scanId, fixable);
      // show modal with the command
      setFixModal({
        issue: fixable[0],
        key: "__bulk__",
        command: result.command,
        cmdCopied: false,
      });
    } catch {
      // silently ignore
    }
    setBulkApplying(false);
  };

  const handleExportReport = () => {
    if (!scanId) return;
    const lines: string[] = [];
    lines.push("Scan ID," + scanId);
    lines.push("Generated," + new Date().toISOString());
    lines.push("");
    lines.push("Status,RuleId,Severity,Title,File,Line,Category,Verified");

    for (const issue of fixedIssues) {
      const v = verifyState[issue.ruleId];
      lines.push(
        [
          "FIXED",
          issue.ruleId,
          issue.severity,
          `"${(issue.title || "").replace(/"/g, '""')}"`,
          `"${(issue.file || "").replace(/"/g, '""')}"`,
          issue.lineNumber,
          issue.category || "",
          v === "verified" ? "Yes" : v === "unverified" ? "No" : "Pending",
        ].join(","),
      );
    }
    for (const issue of openIssues) {
      lines.push(
        [
          "OPEN",
          issue.ruleId,
          issue.severity,
          `"${(issue.title || "").replace(/"/g, '""')}"`,
          `"${(issue.file || "").replace(/"/g, '""')}"`,
          issue.lineNumber,
          issue.category || "",
          "",
        ].join(","),
      );
    }

    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `codechecker-fix-report-${scanId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredIssues = (fixedFilter ? fixedIssues : openIssues)
    .filter((i) => fixedFilter || filter === "ALL" || i.severity === filter)
    .filter(
      (i) =>
        !searchTerm ||
        i.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.ruleId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        i.file?.toLowerCase().includes(searchTerm.toLowerCase()),
    );

  const countBySeverity = (sev: string) =>
    openIssues.filter((i) => i.severity === sev).length;

  return (
    <div>
      <PageHeader
        title="Issues"
        subtitle="All findings with severity, suggested fixes, and before/after code"
        gradient="from-red-400 to-amber-400"
      >
        {/* AI Analysis header buttons */}
        {paramScanId && (
          <div
            style={{
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: "0.4rem",
            }}
          >
            <div
              style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
            >
              <button
                className="btn btn-sm"
                onClick={() => setShowAiHelp((v) => !v)}
                style={{
                  background: "linear-gradient(135deg,#7c3aed,#a855f7)",
                  color: "#fff",
                  border: "none",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                🤖 AI Analysis {showAiHelp ? "▲" : "▼"}
              </button>
              {aiCount > 0 && (
                <button
                  className="btn btn-sm"
                  style={{
                    background: "rgba(239,68,68,0.15)",
                    color: "#ef4444",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}
                  onClick={handleDeleteAi}
                  title="Remove AI issues and re-watch"
                >
                  🗑 AI
                </button>
              )}
            </div>
            {aiSuccess && (
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "#22c55e",
                  fontWeight: 600,
                }}
              >
                {aiSuccess}
              </span>
            )}
            {aiError && (
              <span
                style={{
                  fontSize: "0.7rem",
                  color: "#ef4444",
                  fontWeight: 600,
                }}
              >
                ✗ {aiError}
              </span>
            )}
          </div>
        )}
      </PageHeader>

      {/* AI Help — collapsible how-to panel */}
      {showAiHelp && paramScanId && (
        <MagicCard
          accentColor="#a855f7"
          hover={false}
          className="mb-6 p-6"
          style={{ borderLeft: "3px solid #a855f7" }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: "0.6rem",
            }}
          >
            <h4 style={{ margin: 0, color: "#a855f7", fontSize: "0.9rem" }}>
              🤖 AI issue detection
            </h4>
            {/* Status badge */}
            <span
              style={{
                fontSize: "0.7rem",
                fontWeight: 700,
                padding: "0.15rem 0.5rem",
                borderRadius: 4,
                background: aiImporting
                  ? "rgba(234,179,8,0.15)"
                  : watching
                    ? "rgba(99,102,241,0.15)"
                    : aiStatus?.importedCount
                      ? "rgba(34,197,94,0.15)"
                      : "rgba(255,255,255,0.07)",
                color: aiImporting
                  ? "#eab308"
                  : watching
                    ? "#818cf8"
                    : aiStatus?.importedCount
                      ? "#22c55e"
                      : "var(--text-muted)",
                border: `1px solid ${aiImporting ? "rgba(234,179,8,0.4)" : watching ? "rgba(99,102,241,0.4)" : aiStatus?.importedCount ? "rgba(34,197,94,0.4)" : "rgba(255,255,255,0.1)"}`,
              }}
            >
              {aiImporting
                ? "⏳ Importing…"
                : watching
                  ? "👁 Watching for agent output…"
                  : aiStatus?.importedCount
                    ? `✓ ${aiStatus.importedCount} AI issue${aiStatus.importedCount !== 1 ? "s" : ""} imported`
                    : "Waiting"}
            </span>
          </div>

          {/* Step instructions */}
          <div
            style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}
          >
            {/* Step 1 */}
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(168,85,247,0.2)",
                  color: "#a855f7",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                1
              </span>
              <span
                style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}
              >
                Open{" "}
                <strong style={{ color: "var(--text-primary)" }}>
                  VS Code Copilot Chat
                </strong>
              </span>
            </div>

            {/* Step 2 — copy button */}
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(168,85,247,0.2)",
                  color: "#a855f7",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                2
              </span>
              <span
                style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}
              >
                Paste this command and press Enter:
              </span>
              <code
                style={{
                  background: "rgba(168,85,247,0.15)",
                  color: "#c4b5fd",
                  padding: "0.15rem 0.5rem",
                  borderRadius: 4,
                  fontSize: "0.8rem",
                  userSelect: "all",
                  flex: 1,
                }}
              >
                ai issues {paramScanId}
              </code>
              <button
                onClick={handleCopyCommand}
                style={{
                  flexShrink: 0,
                  padding: "0.2rem 0.65rem",
                  borderRadius: 5,
                  cursor: "pointer",
                  border: copied
                    ? "1px solid rgba(34,197,94,0.5)"
                    : "1px solid rgba(168,85,247,0.4)",
                  background: copied
                    ? "rgba(34,197,94,0.12)"
                    : "rgba(168,85,247,0.12)",
                  color: copied ? "#22c55e" : "#a855f7",
                  fontSize: "0.75rem",
                  fontWeight: 600,
                }}
              >
                {copied ? "✓ Copied!" : "📋 Copy"}
              </button>
            </div>

            {/* Step 3 — automatic */}
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <span
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: watching
                    ? "rgba(99,102,241,0.2)"
                    : "rgba(34,197,94,0.15)",
                  color: watching ? "#818cf8" : "#22c55e",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                3
              </span>
              <span
                style={{ fontSize: "0.83rem", color: "var(--text-secondary)" }}
              >
                {watching ? (
                  <>
                    <span style={{ color: "#818cf8", fontWeight: 600 }}>
                      Automatic
                    </span>{" "}
                    — this page is watching for the agent's output and will
                    import it instantly
                  </>
                ) : (
                  <>
                    <span style={{ color: "#22c55e", fontWeight: 600 }}>
                      Done
                    </span>{" "}
                    — results were imported automatically
                  </>
                )}
              </span>
            </div>
          </div>

          {aiStatus && (
            <div
              style={{
                marginTop: "0.7rem",
                fontSize: "0.7rem",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                paddingTop: "0.5rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.3rem",
              }}
            >
              {aiStatus.projectPath ? (
                <div
                  style={{
                    display: "flex",
                    gap: "0.4rem",
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                    Agent will scan:
                  </span>
                  <code style={{ color: "#c4b5fd", wordBreak: "break-all" }}>
                    {aiStatus.projectPath}
                  </code>
                </div>
              ) : (
                <div style={{ color: "#fb923c", fontSize: "0.72rem" }}>
                  ⚠ No project path stored for this scan — agent will search the
                  current workspace. Re-run the scan to store the path.
                </div>
              )}
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  alignItems: "baseline",
                }}
              >
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>
                  Output file:
                </span>
                <code
                  style={{ color: "var(--text-muted)", wordBreak: "break-all" }}
                >
                  {aiStatus.filePath}
                </code>
              </div>
            </div>
          )}
        </MagicCard>
      )}

      {!paramScanId && (
        <div
          className="card animate-in"
          style={{ marginBottom: "1.5rem", maxWidth: 500 }}
        >
          <div className="form-group">
            <label>Scan ID</label>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <input
                className="form-input"
                placeholder="Enter scan ID..."
                value={scanId}
                onChange={(e) => setScanId(e.target.value)}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={() => loadIssues(scanId)}
              >
                Load
              </button>
            </div>
          </div>
        </div>
      )}

      {aiCount > 0 && (
        <>
          {/* Severity Summary */}
          <AnimatedList
            stagger={0.08}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6"
          >
            <AnimatedList.Item>
              <StatCard
                label="Critical"
                value={countBySeverity("CRITICAL")}
                color="#ef4444"
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="High"
                value={countBySeverity("HIGH")}
                color="#fb923c"
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Medium"
                value={countBySeverity("MEDIUM")}
                color="#6366f1"
              />
            </AnimatedList.Item>
            <AnimatedList.Item>
              <StatCard
                label="Low"
                value={countBySeverity("LOW")}
                color="#94a3b8"
              />
            </AnimatedList.Item>
          </AnimatedList>

          {/* Framework Context Bar */}
          {(() => {
            const fwIssues: Record<string, number> = {};
            filteredIssues.forEach((i: IssueResult) => {
              const ep = i.affectedEndpoint || "";
              let fw = "Spring";
              if (ep.endsWith(".action")) fw = "Struts 2";
              else if (ep.endsWith(".do")) fw = "Struts 1";
              else if (ep.startsWith("/ws/")) fw = "SOAP";
              fwIssues[fw] = (fwIssues[fw] || 0) + 1;
            });
            const fws = Object.entries(fwIssues).filter(
              ([fw]) => fw !== "Spring",
            );
            if (fws.length === 0) return null;
            const fwColors: Record<string, string> = {
              "Struts 2": "#f59e0b",
              "Struts 1": "#fb923c",
              SOAP: "#06b6d4",
            };
            return (
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginBottom: "1rem",
                  padding: "0.6rem 0.85rem",
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  borderRadius: "var(--radius-sm)",
                }}
              >
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--text-muted)",
                    fontWeight: 600,
                    alignSelf: "center",
                  }}
                >
                  Framework issues:
                </span>
                {fws.map(([fw, count]) => (
                  <span
                    key={fw}
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      padding: "2px 7px",
                      borderRadius: 4,
                      background: `${fwColors[fw] ?? "#94a3b8"}12`,
                      color: fwColors[fw] ?? "#94a3b8",
                      border: `1px solid ${fwColors[fw] ?? "#94a3b8"}25`,
                    }}
                  >
                    {fw}: {count}
                  </span>
                ))}
              </div>
            );
          })()}

          {/* Severity + search filters */}
          <div
            style={{
              display: "flex",
              gap: "1rem",
              marginBottom: "1.5rem",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div
              className="tabs"
              style={{ marginBottom: 0, borderBottom: "none" }}
            >
              {/* Fixed tab */}
              <button
                className={`tab ${fixedFilter ? "active" : ""}`}
                onClick={() => {
                  setFixedFilter(true);
                  setFilter("ALL");
                }}
                style={
                  fixedFilter
                    ? {
                        color: "#4ade80",
                        borderColor: "#4ade80",
                        background: "rgba(34,197,94,0.1)",
                      }
                    : fixedIssues.length > 0
                      ? { color: "#4ade80" }
                      : {}
                }
              >
                ✓ Fixed ({fixedIssues.length})
              </button>
              {/* Severity tabs — only active when not in Fixed view */}
              {SEVERITIES.filter(
                (sev) => !(projectName === "CIN-VIN" && sev === "CRITICAL"),
              ).map((sev) => (
                <button
                  key={sev}
                  className={`tab ${!fixedFilter && filter === sev ? "active" : ""}`}
                  onClick={() => {
                    setFixedFilter(false);
                    setFilter(sev);
                  }}
                >
                  {sev}{" "}
                  {sev !== "ALL"
                    ? `(${countBySeverity(sev)})`
                    : `(${openIssues.length})`}
                </button>
              ))}
            </div>
            <input
              className="form-input"
              style={{ maxWidth: 280 }}
              placeholder="🔍 Search by rule, title, or file..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {/* Bulk Apply All button – only on open issues view */}
            {!fixedFilter &&
              openIssues.filter((i) => i.file && i.beforeCode && i.afterCode)
                .length > 0 && (
                <button
                  className="btn btn-sm"
                  onClick={handleBulkApplyFix}
                  disabled={bulkApplying}
                  style={{
                    background: "linear-gradient(135deg,#6366f1,#818cf8)",
                    color: "#fff",
                    border: "none",
                    fontWeight: 700,
                    fontSize: "0.75rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  {bulkApplying ? "⏳ Queuing..." : "⚡ Apply All Fixes"}
                </button>
              )}
            {/* Export Report */}
            {aiCount > 0 && (
              <button
                className="btn btn-sm"
                onClick={handleExportReport}
                style={{
                  background: "rgba(34,197,94,0.12)",
                  color: "#4ade80",
                  border: "1px solid rgba(34,197,94,0.3)",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                📥 Export Report
              </button>
            )}
          </div>

          {/* Issue Cards */}
          <div>
            {filteredIssues.map((issue, i) => {
              const isFixed = fixedRuleIds.has(issue.ruleId);
              const queueEntry = fixQueue[issue.ruleId];
              return (
                <div
                  key={i}
                  className={`card issue-card severity-${issue.severity?.toLowerCase()} animate-in`}
                  style={{
                    borderLeft: isFixed
                      ? "3px solid #4ade80"
                      : "3px solid #a855f7",
                    opacity: isFixed ? 0.7 : 1,
                  }}
                >
                  <div className="issue-card-header">
                    <span className="issue-card-title">
                      {issue.ruleId} — {issue.title}
                    </span>
                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        alignItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          background: "rgba(168,85,247,0.18)",
                          border: "1px solid rgba(168,85,247,0.4)",
                          color: "#a855f7",
                          borderRadius: 4,
                          padding: "0.1rem 0.45rem",
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          letterSpacing: "0.05em",
                        }}
                      >
                        🤖 AI
                      </span>
                      {fixedRuleIds.has(issue.ruleId) && (
                        <span
                          style={{
                            background: "rgba(34,197,94,0.14)",
                            border: "1px solid rgba(34,197,94,0.38)",
                            color: "#4ade80",
                            borderRadius: 4,
                            padding: "0.1rem 0.45rem",
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            letterSpacing: "0.05em",
                            display: "flex",
                            alignItems: "center",
                            gap: "0.2rem",
                          }}
                        >
                          ✓ Fixed
                        </span>
                      )}
                      {fixedRuleIds.has(issue.ruleId) &&
                        verifyState[issue.ruleId] === "verified" && (
                          <span
                            style={{
                              background: "rgba(34,197,94,0.14)",
                              border: "1px solid rgba(34,197,94,0.38)",
                              color: "#22c55e",
                              borderRadius: 4,
                              padding: "0.1rem 0.45rem",
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                            }}
                          >
                            ✓ Verified
                          </span>
                        )}
                      {fixedRuleIds.has(issue.ruleId) &&
                        verifyState[issue.ruleId] === "unverified" && (
                          <span
                            style={{
                              background: "rgba(251,146,60,0.14)",
                              border: "1px solid rgba(251,146,60,0.38)",
                              color: "#fb923c",
                              borderRadius: 4,
                              padding: "0.1rem 0.45rem",
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                            }}
                          >
                            ⚠ Unverified
                          </span>
                        )}
                      {fixedRuleIds.has(issue.ruleId) &&
                        verifyState[issue.ruleId] === "pending" && (
                          <span
                            style={{
                              background: "rgba(99,102,241,0.12)",
                              border: "1px solid rgba(99,102,241,0.25)",
                              color: "#818cf8",
                              borderRadius: 4,
                              padding: "0.1rem 0.45rem",
                              fontSize: "0.65rem",
                              fontWeight: 700,
                              letterSpacing: "0.05em",
                            }}
                          >
                            ⏳ Verifying…
                          </span>
                        )}
                      <span
                        className={`badge badge-${issue.severity?.toLowerCase()}`}
                      >
                        {issue.severity}
                      </span>
                    </div>
                  </div>
                  <div className="issue-card-meta">
                    {issue.file && <span>📄 {issue.file}</span>}
                    {issue.lineNumber > 0 && (
                      <span>Line {issue.lineNumber}</span>
                    )}
                    {issue.affectedEndpoint && (
                      <span>
                        🔗 {issue.affectedEndpoint}
                        {(() => {
                          const ep = issue.affectedEndpoint;
                          if (ep.endsWith(".action"))
                            return (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: "rgba(245,158,11,0.12)",
                                  color: "#f59e0b",
                                  border: "1px solid rgba(245,158,11,0.25)",
                                }}
                              >
                                Struts
                              </span>
                            );
                          if (ep.endsWith(".do"))
                            return (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: "rgba(251,146,60,0.12)",
                                  color: "#fb923c",
                                  border: "1px solid rgba(251,146,60,0.25)",
                                }}
                              >
                                Struts1
                              </span>
                            );
                          if (ep.startsWith("/ws/") || ep.includes("SOAP"))
                            return (
                              <span
                                style={{
                                  marginLeft: 4,
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  padding: "1px 5px",
                                  borderRadius: 3,
                                  background: "rgba(6,182,212,0.12)",
                                  color: "#06b6d4",
                                  border: "1px solid rgba(6,182,212,0.25)",
                                }}
                              >
                                SOAP
                              </span>
                            );
                          return null;
                        })()}
                      </span>
                    )}
                    {issue.category && <span>🏷 {issue.category}</span>}
                    {issue.autoFixed && (
                      <span className="badge badge-fast">AUTO-FIXABLE</span>
                    )}
                    {isFixed && queueEntry?.fixedAt && (
                      <span
                        style={{
                          color: "#4ade80",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                        }}
                      >
                        ✓ Fixed by agent on{" "}
                        {new Date(queueEntry.fixedAt).toLocaleString()}
                        {queueEntry.filesChanged &&
                          queueEntry.filesChanged.length > 0 &&
                          ` · ${queueEntry.filesChanged.length} file${queueEntry.filesChanged.length !== 1 ? "s" : ""} changed`}
                      </span>
                    )}
                  </div>
                  {issue.description && (
                    <p
                      style={{
                        fontSize: "0.85rem",
                        color: "var(--text-secondary)",
                        marginBottom: "0.5rem",
                      }}
                    >
                      {issue.description}
                    </p>
                  )}
                  {/* Side-by-side diff when both before and after are present, otherwise stacked */}
                  {issue.beforeCode && issue.afterCode ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.5rem",
                      }}
                    >
                      <div className="code-block before">
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--danger)",
                            marginBottom: 4,
                            fontWeight: 600,
                          }}
                        >
                          BEFORE:
                        </div>
                        {issue.beforeCode}
                      </div>
                      <div className="code-block after">
                        <div
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--success)",
                            marginBottom: 4,
                            fontWeight: 600,
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <span>SUGGESTED FIX:</span>
                          <div style={{ display: "flex", gap: "0.35rem" }}>
                            <button
                              onClick={() =>
                                copyFix(
                                  issue.afterCode!,
                                  issue.ruleId || String(i),
                                )
                              }
                              style={{
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                padding: "0.1rem 0.5rem",
                                borderRadius: 4,
                                cursor: "pointer",
                                border: "none",
                                background:
                                  copiedFix === (issue.ruleId || String(i))
                                    ? "rgba(34,197,94,0.2)"
                                    : "rgba(34,197,94,0.12)",
                                color:
                                  copiedFix === (issue.ruleId || String(i))
                                    ? "#16a34a"
                                    : "var(--success)",
                              }}
                            >
                              {copiedFix === (issue.ruleId || String(i))
                                ? "\u2713 Copied!"
                                : "📋 Copy Fix"}
                            </button>
                            {issue.file && issue.beforeCode && (
                              <button
                                onClick={() =>
                                  handleApplyFix(
                                    issue,
                                    issue.ruleId || String(i),
                                  )
                                }
                                disabled={
                                  fixState[issue.ruleId || String(i)] ===
                                    "applying" ||
                                  fixState[issue.ruleId || String(i)] ===
                                    "applied"
                                }
                                title={
                                  fixState[issue.ruleId || String(i)] ===
                                  "error"
                                    ? fixError[issue.ruleId || String(i)] ||
                                      "Error"
                                    : "Write fix directly into the source file"
                                }
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  padding: "0.1rem 0.55rem",
                                  borderRadius: 4,
                                  cursor:
                                    fixState[issue.ruleId || String(i)] ===
                                    "applied"
                                      ? "default"
                                      : "pointer",
                                  border: "none",
                                  background:
                                    fixState[issue.ruleId || String(i)] ===
                                    "applied"
                                      ? "rgba(34,197,94,0.25)"
                                      : fixState[issue.ruleId || String(i)] ===
                                          "error"
                                        ? "rgba(239,68,68,0.18)"
                                        : "rgba(99,102,241,0.15)",
                                  color:
                                    fixState[issue.ruleId || String(i)] ===
                                    "applied"
                                      ? "#16a34a"
                                      : fixState[issue.ruleId || String(i)] ===
                                          "error"
                                        ? "var(--danger)"
                                        : "var(--accent-light)",
                                }}
                              >
                                {fixState[issue.ruleId || String(i)] ===
                                "applying"
                                  ? "⏳…"
                                  : fixState[issue.ruleId || String(i)] ===
                                      "applied"
                                    ? "✓ Applied!"
                                    : fixState[issue.ruleId || String(i)] ===
                                        "error"
                                      ? "⚠ Failed"
                                      : "⚡ Apply Fix"}
                              </button>
                            )}
                          </div>
                        </div>
                        {issue.afterCode}
                        {fixState[issue.ruleId || String(i)] === "error" && (
                          <div
                            style={{
                              fontSize: "0.68rem",
                              color: "var(--danger)",
                              marginTop: "0.3rem",
                            }}
                          >
                            {fixError[issue.ruleId || String(i)]}
                          </div>
                        )}
                        {fixState[issue.ruleId || String(i)] === "applied" && (
                          <div
                            style={{
                              fontSize: "0.68rem",
                              color: "var(--success)",
                              marginTop: "0.3rem",
                            }}
                          >
                            ✓ Fix written to {issue.file}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <>
                      {issue.beforeCode && (
                        <div className="code-block before">
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--danger)",
                              marginBottom: 4,
                              fontWeight: 600,
                            }}
                          >
                            BEFORE:
                          </div>
                          {issue.beforeCode}
                        </div>
                      )}
                      {issue.afterCode && (
                        <div className="code-block after">
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--success)",
                              marginBottom: 4,
                              fontWeight: 600,
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <span>SUGGESTED FIX:</span>
                            <div style={{ display: "flex", gap: "0.35rem" }}>
                              <button
                                onClick={() =>
                                  copyFix(
                                    issue.afterCode!,
                                    issue.ruleId || String(i),
                                  )
                                }
                                style={{
                                  fontSize: "0.68rem",
                                  fontWeight: 700,
                                  padding: "0.1rem 0.5rem",
                                  borderRadius: 4,
                                  cursor: "pointer",
                                  border: "none",
                                  background:
                                    copiedFix === (issue.ruleId || String(i))
                                      ? "rgba(34,197,94,0.2)"
                                      : "rgba(34,197,94,0.12)",
                                  color:
                                    copiedFix === (issue.ruleId || String(i))
                                      ? "#16a34a"
                                      : "var(--success)",
                                }}
                              >
                                {copiedFix === (issue.ruleId || String(i))
                                  ? "\u2713 Copied!"
                                  : "📋 Copy Fix"}
                              </button>
                              {issue.file && issue.beforeCode && (
                                <button
                                  onClick={() =>
                                    handleApplyFix(
                                      issue,
                                      issue.ruleId || String(i),
                                    )
                                  }
                                  disabled={
                                    fixState[issue.ruleId || String(i)] ===
                                      "applying" ||
                                    fixState[issue.ruleId || String(i)] ===
                                      "applied"
                                  }
                                  title={
                                    fixState[issue.ruleId || String(i)] ===
                                    "error"
                                      ? fixError[issue.ruleId || String(i)] ||
                                        "Error"
                                      : "Write fix directly into the source file"
                                  }
                                  style={{
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    padding: "0.1rem 0.55rem",
                                    borderRadius: 4,
                                    cursor:
                                      fixState[issue.ruleId || String(i)] ===
                                      "applied"
                                        ? "default"
                                        : "pointer",
                                    border: "none",
                                    background:
                                      fixState[issue.ruleId || String(i)] ===
                                      "applied"
                                        ? "rgba(34,197,94,0.25)"
                                        : fixState[
                                              issue.ruleId || String(i)
                                            ] === "error"
                                          ? "rgba(239,68,68,0.18)"
                                          : "rgba(99,102,241,0.15)",
                                    color:
                                      fixState[issue.ruleId || String(i)] ===
                                      "applied"
                                        ? "#16a34a"
                                        : fixState[
                                              issue.ruleId || String(i)
                                            ] === "error"
                                          ? "var(--danger)"
                                          : "var(--accent-light)",
                                  }}
                                >
                                  {fixState[issue.ruleId || String(i)] ===
                                  "applying"
                                    ? "⏳…"
                                    : fixState[issue.ruleId || String(i)] ===
                                        "applied"
                                      ? "✓ Applied!"
                                      : fixState[issue.ruleId || String(i)] ===
                                          "error"
                                        ? "⚠ Failed"
                                        : "⚡ Apply Fix"}
                                </button>
                              )}
                            </div>
                          </div>
                          {issue.afterCode}
                          {fixState[issue.ruleId || String(i)] === "error" && (
                            <div
                              style={{
                                fontSize: "0.68rem",
                                color: "var(--danger)",
                                marginTop: "0.3rem",
                              }}
                            >
                              {fixError[issue.ruleId || String(i)]}
                            </div>
                          )}
                          {fixState[issue.ruleId || String(i)] ===
                            "applied" && (
                            <div
                              style={{
                                fontSize: "0.68rem",
                                color: "var(--success)",
                                marginTop: "0.3rem",
                              }}
                            >
                              ✓ Fix written to {issue.file}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {/* User notes */}
                  <div style={{ marginTop: "0.5rem" }}>
                    <button
                      onClick={() => toggleNotes(issue.ruleId || String(i))}
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        background: "none",
                        border: "none",
                        padding: 0,
                        color: notesByRule[issue.ruleId || String(i)]
                          ? "#f59e0b"
                          : "var(--text-muted)",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      📝{" "}
                      {showNotes.has(issue.ruleId || String(i))
                        ? "Hide Notes"
                        : "Notes"}
                      {notesByRule[issue.ruleId || String(i)] && (
                        <span style={{ fontSize: "0.6rem", color: "#f59e0b" }}>
                          (saved)
                        </span>
                      )}
                    </button>
                    {showNotes.has(issue.ruleId || String(i)) && (
                      <textarea
                        value={notesByRule[issue.ruleId || String(i)] ?? ""}
                        onChange={(e) =>
                          saveNote(issue.ruleId || String(i), e.target.value)
                        }
                        placeholder="Add your notes, workaround details, or ticket reference here..."
                        style={{
                          marginTop: "0.4rem",
                          width: "100%",
                          minHeight: 72,
                          fontFamily: "inherit",
                          fontSize: "0.78rem",
                          background: "rgba(245,158,11,0.05)",
                          color: "var(--text-primary)",
                          border: "1px solid rgba(245,158,11,0.3)",
                          borderRadius: "var(--radius)",
                          padding: "0.5rem 0.65rem",
                          resize: "vertical",
                          outline: "none",
                          lineHeight: 1.5,
                          boxSizing: "border-box",
                        }}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {filteredIssues.length === 0 && (
            <div className="empty-state">
              <h3>
                {fixedFilter
                  ? "No fixed issues yet"
                  : "No issues match your filter"}
              </h3>
              <p>
                {fixedFilter
                  ? "Issues will appear here once the agent marks them as Fixed"
                  : "Try a different severity or search term"}
              </p>
            </div>
          )}
        </>
      )}

      {loading && (
        <div className="empty-state">
          <div className="empty-state-icon animate-pulse">⏳</div>
          <h3>Loading issues...</h3>
        </div>
      )}

      {/* ── Agent Fix Modal ── */}
      {fixModal && (
        <>
          {/* blurred backdrop */}
          <div
            onClick={() => setFixModal(null)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(5,6,18,0.72)",
              backdropFilter: "blur(5px)",
              WebkitBackdropFilter: "blur(5px)",
              zIndex: 999,
            }}
          />
          {/* panel */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1000,
              width: "min(500px, 94vw)",
              background: "#0b0c1a",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow:
                "0 30px 90px rgba(0,0,0,0.85), 0 0 0 1px rgba(99,102,241,0.18)",
            }}
          >
            {/* top accent line */}
            <div
              style={{
                height: 3,
                background:
                  "linear-gradient(90deg,#6366f1 0%,#818cf8 50%,#6366f1 100%)",
              }}
            />

            {/* header */}
            <div
              style={{
                padding: "1.1rem 1.4rem 1rem",
                borderBottom: "1px solid rgba(99,102,241,0.12)",
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                background: "rgba(99,102,241,0.06)",
              }}
            >
              <div
                style={{
                  background: "rgba(34,197,94,0.14)",
                  border: "1px solid rgba(34,197,94,0.35)",
                  borderRadius: 7,
                  padding: "0.28rem 0.6rem",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  color: "#4ade80",
                  flexShrink: 0,
                  lineHeight: 1,
                }}
              >
                ✓ Queued
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 700,
                    fontSize: "0.92rem",
                    color: "#e2e4f3",
                    marginBottom: "0.25rem",
                  }}
                >
                  {fixModal.key === "__bulk__"
                    ? `${openIssues.filter((i) => i.file && i.beforeCode && i.afterCode).length} fixes added to agent queue`
                    : "Fix added to agent queue"}
                </div>
                <div
                  style={{
                    fontSize: "0.73rem",
                    color: "rgba(148,152,196,0.9)",
                    display: "flex",
                    gap: "0.45rem",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      background: "rgba(99,102,241,0.15)",
                      border: "1px solid rgba(99,102,241,0.22)",
                      borderRadius: 4,
                      padding: "0 0.4rem",
                      fontWeight: 600,
                    }}
                  >
                    {fixModal.issue.ruleId}
                  </span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fixModal.issue.title}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setFixModal(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(148,152,196,0.4)",
                  cursor: "pointer",
                  fontSize: "1rem",
                  padding: "0.1rem 0.35rem",
                  flexShrink: 0,
                  borderRadius: 4,
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            </div>

            {/* body */}
            <div style={{ padding: "1.2rem 1.4rem" }}>
              {/* file path */}
              {fixModal.issue.file && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 6,
                    padding: "0.38rem 0.7rem",
                    marginBottom: "1.15rem",
                    fontFamily: "monospace",
                    fontSize: "0.71rem",
                    color: "rgba(110,114,165,0.9)",
                    overflow: "hidden",
                  }}
                >
                  <span style={{ flexShrink: 0 }}>📄</span>
                  <span
                    style={{
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fixModal.issue.file}
                  </span>
                </div>
              )}

              {/* step rows */}
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.85rem",
                  marginBottom: "1.2rem",
                }}
              >
                {/* ① */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "rgba(99,102,241,0.18)",
                      border: "1px solid rgba(99,102,241,0.38)",
                      color: "#818cf8",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    1
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: "0.77rem",
                        fontWeight: 600,
                        color: "#c5c8e8",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Switch to VS Code
                    </div>
                    <a
                      href="vscode://"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                        background: "rgba(99,102,241,0.12)",
                        color: "#818cf8",
                        border: "1px solid rgba(99,102,241,0.28)",
                        borderRadius: 5,
                        padding: "0.22rem 0.65rem",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        textDecoration: "none",
                      }}
                    >
                      Open VS Code ↗
                    </a>
                  </div>
                </div>

                {/* ② */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "rgba(99,102,241,0.18)",
                      border: "1px solid rgba(99,102,241,0.38)",
                      color: "#818cf8",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    2
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: "0.77rem",
                        fontWeight: 600,
                        color: "#c5c8e8",
                        marginBottom: "0.3rem",
                      }}
                    >
                      Open Copilot Chat{" "}
                      <kbd
                        style={{
                          fontFamily: "inherit",
                          fontSize: "0.67rem",
                          background: "rgba(255,255,255,0.07)",
                          border: "1px solid rgba(255,255,255,0.14)",
                          borderRadius: 3,
                          padding: "0 0.3rem",
                        }}
                      >
                        Ctrl+Alt+I
                      </kbd>{" "}
                      and paste
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        background: "#060714",
                        border: "1px solid rgba(99,102,241,0.2)",
                        borderRadius: 6,
                        padding: "0.5rem 0.7rem",
                      }}
                    >
                      <code
                        style={{
                          flex: 1,
                          fontFamily: "monospace",
                          fontSize: "0.8rem",
                          color: "#a5b4fc",
                          wordBreak: "break-all",
                        }}
                      >
                        {fixModal.command}
                      </code>
                      <button
                        onClick={() => {
                          navigator.clipboard
                            .writeText(fixModal.command)
                            .then(() => {
                              setFixModal((prev) =>
                                prev ? { ...prev, cmdCopied: true } : null,
                              );
                              setTimeout(
                                () =>
                                  setFixModal((prev) =>
                                    prev ? { ...prev, cmdCopied: false } : null,
                                  ),
                                2500,
                              );
                            });
                        }}
                        style={{
                          flexShrink: 0,
                          background: fixModal.cmdCopied
                            ? "rgba(34,197,94,0.14)"
                            : "rgba(99,102,241,0.14)",
                          color: fixModal.cmdCopied ? "#4ade80" : "#818cf8",
                          border: fixModal.cmdCopied
                            ? "1px solid rgba(34,197,94,0.3)"
                            : "1px solid rgba(99,102,241,0.28)",
                          borderRadius: 5,
                          padding: "0.2rem 0.6rem",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fixModal.cmdCopied ? "✓ Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                </div>

                {/* ③ */}
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: "rgba(99,102,241,0.18)",
                      border: "1px solid rgba(99,102,241,0.38)",
                      color: "#818cf8",
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    3
                  </div>
                  <div
                    style={{
                      fontSize: "0.76rem",
                      color: "rgba(148,152,196,0.85)",
                      lineHeight: 1.6,
                      paddingTop: 2,
                    }}
                  >
                    Press{" "}
                    <kbd
                      style={{
                        fontFamily: "inherit",
                        fontSize: "0.67rem",
                        background: "rgba(255,255,255,0.07)",
                        border: "1px solid rgba(255,255,255,0.14)",
                        borderRadius: 3,
                        padding: "0 0.3rem",
                      }}
                    >
                      Enter
                    </kbd>
                    . The agent reads the queue, applies the fix across all
                    related files in the workspace, then marks this entry as{" "}
                    <span style={{ color: "#4ade80", fontWeight: 600 }}>
                      FIXED
                    </span>
                    .
                  </div>
                </div>
              </div>

              {/* footer */}
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button
                  onClick={() => setFixModal(null)}
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(148,152,196,0.75)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 6,
                    padding: "0.32rem 1rem",
                    fontSize: "0.78rem",
                    cursor: "pointer",
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
