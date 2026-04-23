import React, { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  ArrowLeft,
  Zap,
  TrendingUp,
  Radio,
  Copy,
  CheckCircle,
  AlertCircle,
  X,
} from "lucide-react";
import { Client } from "@stomp/stompjs";
import {
  getTestEndpoints,
  runApiTest,
  getApiTestHistory,
  getApiAnalytics,
  startLiveTest,
  cancelLiveTest,
  getWebSocketUrl,
  getMonitorConfig,
  saveMonitorConfig,
  getRecentMonitorHits,
  clearMonitorHits,
  getGatewayUrl,
} from "../api";
import type {
  EndpointResult,
  ApiTestRun,
  ApiLogEntry,
  GatewayHit,
} from "../api";
import EndpointPicker from "../components/api-dashboard/EndpointPicker";
import MetricCardsGrid from "../components/api-dashboard/MetricCardsGrid";
import SoapConfigPanel from "../components/SoapConfigPanel";
import StrutsConfigPanel from "../components/StrutsConfigPanel";
import MagicCard from "@/components/ui/magic-card";

const ApiDashboard: React.FC = () => {
  const { projectName } = useParams<{ projectName: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const isApmMode = location.pathname.startsWith("/apm");
  const [endpoints, setEndpoints] = useState<EndpointResult[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] =
    useState<EndpointResult | null>(null);
  const [history, setHistory] = useState<ApiTestRun[]>([]);

  // Real-Time APM State
  const [apmLogs, setApmLogs] = useState<ApiLogEntry[]>([]);

  // Test Form Options
  const [environmentUrl, setEnvironmentUrl] = useState("http://localhost:8081");
  const [authToken, setAuthToken] = useState("");
  const [requestPayload, setRequestPayload] = useState("{\n  \n}");
  const [totalHits, setTotalHits] = useState(5);
  const [testing, setTesting] = useState(false);
  const [testElapsed, setTestElapsed] = useState(0);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  // Derived tab — no tab bar; mode comes from the route URL
  const activeTab = isApmMode ? ("apm" as const) : ("monitor" as const);

  // Monitor (gateway) state
  const [monitorHits, setMonitorHits] = useState<GatewayHit[]>([]);
  const [monitorConnected, setMonitorConnected] = useState(false);
  const [monitorTargetUrl, setMonitorTargetUrl] = useState("");
  const [monitorSaving, setMonitorSaving] = useState(false);
  const [monitorSaved, setMonitorSaved] = useState(false);
  const [monitorCopied, setMonitorCopied] = useState(false);
  const [slaThresholdMs, setSlaThresholdMs] = useState(500);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monitorStompRef = useRef<InstanceType<typeof Client> | null>(null);
  const monitorLogRef = useRef<HTMLDivElement>(null);

  // Live fire test state
  const [liveStats, setLiveStats] = useState<{
    type: string;
    totalRequests: number;
    plannedTotalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    averageResponseTimeMs: number;
    successAvgMs: number;
    failedAvgMs: number;
    minResponseTimeMs: number;
    maxResponseTimeMs: number;
    throughput: number;
    elapsedSeconds: number;
    threads: number;
    requestsPerThread: number;
    statusCodeDistribution: Record<string, number>;
    percentiles?: { p50: number; p90: number; p95: number; p99: number };
  } | null>(null);
  const [liveRunning, setLiveRunning] = useState(false);
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  // Load test history (persisted per endpoint in localStorage)
  type LtHistoryEntry = {
    id: string;
    runAt: string;
    url: string;
    method: string;
    threads: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    successAvgMs: number;
    minResponseTimeMs: number;
    maxResponseTimeMs: number;
    throughput: number;
    percentiles?: { p50: number; p90: number; p95: number; p99: number };
    statusCodeDistribution: Record<string, number>;
    /** Snapshot of per-request logs captured at run completion */
    requestLogs?: GatewayHit[];
  };
  const [liveTestHistory, setLiveTestHistory] = useState<LtHistoryEntry[]>([]);
  const [ltHistoryOpen, setLtHistoryOpen] = useState(true);
  // null = cumulative average of all runs; a run id = show that run's stats
  const [ltSelectedRunId, setLtSelectedRunId] = useState<string | null>(null);

  const [threads, setThreads] = useState(5);
  const [totalRequests, setTotalRequests] = useState(50);
  const [rampUpInterval, setRampUpInterval] = useState(1); // seconds between thread starts
  const [thinkTime, setThinkTime] = useState(0); // seconds between individual requests within a thread
  const liveStompRef = useRef<InstanceType<typeof Client> | null>(null);

  // Load test per-request logs
  const [ltRequestLogs, setLtRequestLogs] = useState<GatewayHit[]>([]);
  const ltRequestLogsRef = useRef<GatewayHit[]>([]); // always-current ref for closure capture
  const [ltLogsOpen, setLtLogsOpen] = useState(true);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());
  // Ref so monitor WebSocket closure can see whether a test is running
  const liveRunningRef = useRef(false);

  // ---------- request-builder tab state ----------
  type KVRow = { key: string; val: string; enabled: boolean };
  const [reqTab, setReqTab] = useState<"params" | "headers" | "auth" | "body">(
    "auth",
  );
  const [authType, setAuthType] = useState<
    "bearer" | "basic" | "apikey" | "none"
  >("bearer");
  const [apiKeyHeader, setApiKeyHeader] = useState("X-Api-Key");
  const [contentType, setContentType] = useState("application/json");
  const [queryParamRows, setQueryParamRows] = useState<KVRow[]>([
    { key: "", val: "", enabled: true },
  ]);
  const [headerRows, setHeaderRows] = useState<KVRow[]>([
    { key: "", val: "", enabled: true },
  ]);
  // cURL / Postman import
  const [showCurlImport, setShowCurlImport] = useState(false);
  const [curlInput, setCurlInput] = useState("");
  const [curlParseError, setCurlParseError] = useState("");
  // path params: auto-extracted from endpoint path tokens like {id}
  const derivedPathParams: string[] = React.useMemo(() => {
    if (!selectedEndpoint) return [];
    const matches = selectedEndpoint.path.match(/\{([^}]+)\}/g);
    return matches ? matches.map((m) => m.slice(1, -1)) : [];
  }, [selectedEndpoint]);
  const [pathParamValues, setPathParamValues] = useState<
    Record<string, string>
  >({});
  // reset path param values when endpoint changes
  useEffect(() => {
    setPathParamValues({});
  }, [selectedEndpoint]);

  // ── Config storage key helpers ──────────────────────────────────────────────
  const configKey = (ep: { path: string; httpMethod: string } | null) =>
    projectName && ep
      ? `req-config:${projectName}:${ep.httpMethod}:${ep.path}`
      : null;

  // Save config whenever any builder field changes (debounced via useEffect)
  useEffect(() => {
    const key = configKey(selectedEndpoint);
    if (!key) return;
    // Guard: only save after restoration has happened for this endpoint,
    // to prevent overwriting saved config with defaults on page refresh.
    if (restoredForEndpoint.current !== key) return;
    const cfg = {
      environmentUrl,
      authToken,
      authType,
      apiKeyHeader,
      contentType,
      requestPayload,
      queryParamRows,
      headerRows,
      pathParamValues,
      threads,
      totalRequests,
      rampUpInterval,
      thinkTime,
    };
    localStorage.setItem(key, JSON.stringify(cfg));
  }, [
    selectedEndpoint,
    environmentUrl,
    authToken,
    authType,
    apiKeyHeader,
    contentType,
    requestPayload,
    queryParamRows,
    headerRows,
    pathParamValues,
    threads,
    totalRequests,
    rampUpInterval,
    thinkTime,
  ]);

  // Restore config when switching endpoint (before refreshHistory overwrites environmentUrl)
  const restoredForEndpoint = React.useRef<string | null>(null);
  useEffect(() => {
    const key = configKey(selectedEndpoint);
    if (!key || restoredForEndpoint.current === key) return;
    restoredForEndpoint.current = key;
    const raw = localStorage.getItem(key);
    if (!raw) return;
    try {
      const cfg = JSON.parse(raw);
      if (cfg.environmentUrl) setEnvironmentUrl(cfg.environmentUrl);
      if (cfg.authToken !== undefined) setAuthToken(cfg.authToken);
      if (cfg.authType) setAuthType(cfg.authType);
      if (cfg.apiKeyHeader) setApiKeyHeader(cfg.apiKeyHeader);
      if (cfg.contentType) setContentType(cfg.contentType);
      if (cfg.requestPayload !== undefined)
        setRequestPayload(cfg.requestPayload);
      if (Array.isArray(cfg.queryParamRows) && cfg.queryParamRows.length > 0)
        setQueryParamRows(cfg.queryParamRows);
      if (Array.isArray(cfg.headerRows) && cfg.headerRows.length > 0)
        setHeaderRows(cfg.headerRows);
      if (cfg.pathParamValues && Object.keys(cfg.pathParamValues).length > 0)
        setPathParamValues(cfg.pathParamValues);
      if (cfg.threads) setThreads(cfg.threads);
      if (cfg.totalRequests) setTotalRequests(cfg.totalRequests);
      if (cfg.rampUpInterval !== undefined)
        setRampUpInterval(cfg.rampUpInterval);
      if (cfg.thinkTime !== undefined) setThinkTime(cfg.thinkTime);
    } catch {
      /* ignore corrupt data */
    }
    // Also restore load test history for this endpoint
    const ltKey = `lt-history:${projectName}:${selectedEndpoint!.httpMethod}:${selectedEndpoint!.path}`;
    const ltRaw = localStorage.getItem(ltKey);
    if (ltRaw) {
      try {
        setLiveTestHistory(JSON.parse(ltRaw));
      } catch {
        /* ignore */
      }
    } else {
      setLiveTestHistory([]);
    }
    // Reset run selector whenever the endpoint changes
    setLtSelectedRunId(null);
  }, [selectedEndpoint]);

  // Keep liveRunningRef in sync so monitor WebSocket closure sees current state
  useEffect(() => {
    liveRunningRef.current = liveRunning;
  }, [liveRunning]);

  useEffect(() => {
    if (projectName) {
      getTestEndpoints(projectName).then((eps) => {
        setEndpoints(eps);
        // Restore previously selected endpoint from sessionStorage
        const saved = sessionStorage.getItem(
          `selected-endpoint:${projectName}`,
        );
        if (saved) {
          try {
            const ep = JSON.parse(saved);
            // Verify it still exists in the freshly loaded list
            const match = eps.find(
              (e) => e.path === ep.path && e.httpMethod === ep.httpMethod,
            );
            if (match) setSelectedEndpoint(match);
          } catch {
            /* ignore */
          }
        }
      });
    }
  }, [projectName]);

  useEffect(() => {
    if (selectedEndpoint && projectName) {
      // Persist selection so page refresh restores it
      sessionStorage.setItem(
        `selected-endpoint:${projectName}`,
        JSON.stringify(selectedEndpoint),
      );
      refreshHistory();
      refreshApmLogs();

      // Auto-configure content type and body template based on framework
      const fw = selectedEndpoint.framework;
      if (
        fw === "JAX_WS" ||
        fw === "SPRING_WS" ||
        selectedEndpoint.httpMethod === "SOAP"
      ) {
        setContentType("text/xml");
        const opName =
          selectedEndpoint.path?.split("/").pop() || "YourOperation";
        setRequestPayload(
          `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://example.com/ws">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <ws:${opName}>\n      <ws:param>value</ws:param>\n    </ws:${opName}>\n  </soapenv:Body>\n</soapenv:Envelope>`,
        );
      } else if (fw === "STRUTS1" || fw === "STRUTS2") {
        setContentType("application/x-www-form-urlencoded");
        setRequestPayload("param1=value1&param2=value2");
      } else {
        setContentType("application/json");
        setRequestPayload("{\n  \n}");
      }
    } else if (!selectedEndpoint && projectName && endpoints.length > 0) {
      // Only clear when the user explicitly navigated back (endpoints already loaded),
      // NOT on initial mount where selectedEndpoint is null before restoration runs.
      sessionStorage.removeItem(`selected-endpoint:${projectName}`);
    }
  }, [selectedEndpoint]);

  // Connect monitor WebSocket as soon as the project is known.
  // This covers both the Monitor tab AND the APM (load test) tab so that
  // load-test hits are streamed into the monitor ring buffer immediately.
  useEffect(() => {
    if (!projectName) return;
    getMonitorConfig(projectName).then((cfg) => {
      if (cfg) setMonitorTargetUrl(cfg.targetBaseUrl);
    });
    getRecentMonitorHits(projectName).then(setMonitorHits);

    const client = new Client({
      brokerURL: getWebSocketUrl(),
      reconnectDelay: 3000,
      onConnect: () => {
        setMonitorConnected(true);
        client.subscribe(`/topic/monitor/${projectName}`, (msg) => {
          const hit: GatewayHit = JSON.parse(msg.body);
          setMonitorHits((prev) => [hit, ...prev].slice(0, 200));
          // Collect per-request logs when a load test is actively running
          if (liveRunningRef.current && hit.source === "load-test") {
            setLtRequestLogs((prev) => {
              const updated = [hit, ...prev];
              ltRequestLogsRef.current = updated;
              return updated;
            });
          }
        });
      },
      onDisconnect: () => setMonitorConnected(false),
      onStompError: () => setMonitorConnected(false),
    });
    monitorStompRef.current = client;
    client.activate();
    return () => {
      client.deactivate();
      setMonitorConnected(false);
    };
  }, [projectName]);

  // In APM mode, auto-populate the load test base URL with the local gateway proxy URL
  // so the user doesn't have to type it in manually.
  useEffect(() => {
    if (isApmMode && monitorTargetUrl && projectName) {
      setEnvironmentUrl(getGatewayUrl(projectName, ""));
    }
  }, [isApmMode, monitorTargetUrl, projectName]);

  // Auto-scroll monitor hit log
  useEffect(() => {
    if (monitorLogRef.current) monitorLogRef.current.scrollTop = 0;
  }, [monitorHits]);

  const refreshHistory = async () => {
    if (!selectedEndpoint || !projectName) return;
    const records = await getApiTestHistory(
      projectName,
      selectedEndpoint.path,
      selectedEndpoint.httpMethod,
    );
    setHistory(records);
    // Pre-fill environment URL from most recent test run, but only if the user
    // has no saved config for this endpoint (localStorage takes priority).
    // In APM mode, the gateway proxy URL already auto-fills it; don't override.
    const savedKey = configKey(selectedEndpoint);
    if (
      records.length > 0 &&
      records[0].environmentUrl &&
      !(isApmMode && monitorTargetUrl) &&
      !(savedKey && localStorage.getItem(savedKey))
    ) {
      setEnvironmentUrl(records[0].environmentUrl);
    }
  };

  const refreshApmLogs = async () => {
    if (!selectedEndpoint || !projectName) return;
    const logs = await getApiAnalytics(
      projectName,
      selectedEndpoint.path,
      selectedEndpoint.httpMethod,
    );
    setApmLogs(logs.reverse());
  };

  const getResolvedUrl = () => {
    const path =
      selectedEndpoint?.path.replace(/\{[^/]+\}/g, "1").replace("*", "") || "";
    return environmentUrl + path;
  };

  const handleTest = async () => {
    if (!selectedEndpoint || !projectName) return;
    setTesting(true);
    setTestStatus(null);
    setTestElapsed(0);
    const timer = setInterval(() => setTestElapsed((prev) => prev + 1), 1000);
    const buildMap = (rows: KVRow[]) =>
      Object.fromEntries(
        rows.filter((r) => r.enabled && r.key).map((r) => [r.key, r.val]),
      );
    try {
      const result = await runApiTest({
        projectName,
        httpMethod: selectedEndpoint.httpMethod,
        endpointPath: selectedEndpoint.path,
        environmentUrl,
        authToken,
        authType,
        apiKeyHeader: authType === "apikey" ? apiKeyHeader : undefined,
        requestPayload,
        contentType,
        customHeaders: buildMap(headerRows),
        queryParams: buildMap(queryParamRows),
        pathParams: pathParamValues,
        totalHits,
      });
      await refreshHistory();
      setTestStatus(
        `✓ ${result.successfulHits} succeeded · ✗ ${result.failedHits} failed · Avg ${result.averageLatencyMs}ms`,
      );
    } catch (e) {
      console.error(e);
      setTestStatus("✗ Test failed — check if backend is running.");
    } finally {
      clearInterval(timer);
      setTesting(false);
    }
  };

  const showToast = (message: string, type: "success" | "error") => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type });
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  };

  const handleSaveMonitorConfig = async () => {
    if (!projectName || !monitorTargetUrl) return;
    setMonitorSaving(true);
    try {
      await saveMonitorConfig(projectName, monitorTargetUrl);
      setMonitorSaved(true);
      setTimeout(() => setMonitorSaved(false), 2500);
      showToast(
        `Gateway target saved! Route traffic through the Gateway URL to start monitoring.`,
        "success",
      );
    } catch {
      showToast(
        "Failed to save gateway configuration. Make sure the backend is running.",
        "error",
      );
    } finally {
      setMonitorSaving(false);
    }
  };

  const handleCopyGatewayUrl = (path: string) => {
    const url = getGatewayUrl(projectName!, path);
    navigator.clipboard.writeText(url).then(() => {
      setMonitorCopied(true);
      setTimeout(() => setMonitorCopied(false), 2000);
    });
  };

  const handleStartLiveTest = async () => {
    if (!selectedEndpoint || !projectName) return;
    const runId = crypto.randomUUID();
    setLiveRunId(runId);
    setLiveStats(null);
    setLiveRunning(true);
    setLtRequestLogs([]);
    ltRequestLogsRef.current = [];
    setLtLogsOpen(true);

    // Build maps from enabled KV rows
    const buildMap = (rows: KVRow[]) =>
      Object.fromEntries(
        rows.filter((r) => r.enabled && r.key).map((r) => [r.key, r.val]),
      );

    const client = new Client({
      brokerURL: getWebSocketUrl(),
      reconnectDelay: 0,
      onConnect: () => {
        client.subscribe(`/topic/live-test/${runId}`, (msg) => {
          const data = JSON.parse(msg.body);
          setLiveStats(data);
          if (data.type === "COMPLETE") {
            setLiveRunning(false);
            client.deactivate();
            // Save completed run to local history
            const entry: LtHistoryEntry = {
              id: Date.now().toString(),
              runAt: new Date().toLocaleString(),
              url: resolvedPreviewUrl,
              method: selectedEndpoint.httpMethod,
              threads,
              totalRequests: data.totalRequests,
              successfulRequests: data.successfulRequests,
              failedRequests: data.failedRequests,
              successAvgMs: data.successAvgMs ?? data.averageResponseTimeMs,
              minResponseTimeMs: data.minResponseTimeMs,
              maxResponseTimeMs: data.maxResponseTimeMs,
              throughput: data.throughput,
              percentiles: data.percentiles,
              statusCodeDistribution: data.statusCodeDistribution,
              requestLogs: ltRequestLogsRef.current.slice(), // snapshot via ref — avoids stale closure
            };
            setLiveTestHistory((prev) => {
              const updated = [entry, ...prev].slice(0, 50);
              const ltKey = `lt-history:${projectName}:${selectedEndpoint.httpMethod}:${selectedEndpoint.path}`;
              localStorage.setItem(ltKey, JSON.stringify(updated));
              return updated;
            });
          }
        });
        startLiveTest({
          projectName: projectName!,
          httpMethod: selectedEndpoint.httpMethod,
          endpointPath: selectedEndpoint.path,
          environmentUrl,
          authToken,
          authType,
          apiKeyHeader: authType === "apikey" ? apiKeyHeader : undefined,
          requestPayload,
          contentType,
          customHeaders: buildMap(headerRows),
          queryParams: buildMap(queryParamRows),
          pathParams: pathParamValues,
          totalHits: totalRequests,
          maxConcurrentUsers: threads,
          rampUpIntervalSeconds: rampUpInterval,
          thinkTimeSeconds: thinkTime,
          liveRunId: runId,
        }).catch(() => {
          setLiveRunning(false);
          client.deactivate();
        });
      },
      onStompError: () => setLiveRunning(false),
    });
    liveStompRef.current = client;
    client.activate();
  };

  const handleStopLiveTest = async () => {
    if (liveRunId) await cancelLiveTest(liveRunId);
    setLiveRunning(false);
    liveStompRef.current?.deactivate();
  };

  // ── cURL / Postman import helpers ─────────────────────────────────────────
  // Parse a pasted full URL: strip query → queryParamRows, path params → pathParamValues,
  // base (origin + path-prefix before the endpoint) → environmentUrl
  const handleBaseUrlPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim();
    let parsed: URL | null = null;
    try {
      parsed = new URL(pasted);
    } catch {
      return;
    }
    // Only intercept if it has a query string or a non-trivial path
    if (!parsed.search && parsed.pathname === "/") return;
    e.preventDefault();

    // Extract query params
    const newQP: KVRow[] = [];
    parsed.searchParams.forEach((v, k) =>
      newQP.push({ key: k, val: v, enabled: true }),
    );

    // Extract path params if we have a selectedEndpoint
    if (selectedEndpoint) {
      const paramNames = (
        selectedEndpoint.path.match(/\{([^}]+)\}/g) ?? []
      ).map((p) => p.slice(1, -1));
      if (paramNames.length > 0) {
        const epCapture = selectedEndpoint.path
          .replace(/[.+?^$|[\]\\]/g, "\\$&")
          .replace(/\{[^}]+\}/g, "([^/]+)");
        const m = parsed.pathname.match(new RegExp(epCapture));
        if (m) {
          const vals: Record<string, string> = {};
          paramNames.forEach((n, i) => {
            if (m[i + 1]) vals[n] = decodeURIComponent(m[i + 1]);
          });
          setPathParamValues((prev) => ({ ...prev, ...vals }));
        }
      }
    }

    // Determine base URL = origin + path prefix before the endpoint path
    let base = parsed.origin;
    if (selectedEndpoint) {
      const epAnchor = selectedEndpoint.path
        .replace(/[.+?^$|[\]\\]/g, "\\$&")
        .replace(/\{[^}]+\}/g, "[^/]+");
      const m = parsed.pathname.match(
        new RegExp("^(.*?)" + epAnchor + "(\\/.*)?$"),
      );
      if (m) {
        base = parsed.origin + (m[1] ?? "");
      } else {
        // endpoint path not found — keep full path as base
        base = parsed.origin + parsed.pathname;
      }
    } else {
      base = parsed.origin + parsed.pathname;
    }
    setEnvironmentUrl(base.replace(/\/$/, ""));

    if (newQP.length > 0) {
      setQueryParamRows([...newQP, { key: "", val: "", enabled: true }]);
      setReqTab("params");
    }
  };

  const tokenizeCurl = (cmd: string): string[] => {
    const tokens: string[] = [];
    let i = 0;
    while (i < cmd.length) {
      while (i < cmd.length && /\s/.test(cmd[i])) i++;
      if (i >= cmd.length) break;
      if (cmd[i] === "'" || cmd[i] === '"') {
        const q = cmd[i++];
        let s = "";
        while (i < cmd.length && cmd[i] !== q) {
          if (cmd[i] === "\\" && i + 1 < cmd.length) {
            i++;
            s += cmd[i++];
          } else s += cmd[i++];
        }
        i++;
        tokens.push(s);
      } else {
        let s = "";
        while (i < cmd.length && !/\s/.test(cmd[i])) s += cmd[i++];
        tokens.push(s);
      }
    }
    return tokens;
  };

  const applyParsed = ({
    method,
    rawUrl,
    headers,
    body,
    extraQP,
  }: {
    method: string;
    rawUrl: string;
    headers: Record<string, string>;
    body: string;
    extraQP: Record<string, string>;
  }) => {
    let parsedUrl: URL | null = null;
    try {
      parsedUrl = new URL(rawUrl);
    } catch {
      try {
        parsedUrl = new URL("http://" + rawUrl);
      } catch {
        setCurlParseError("Cannot parse URL: " + rawUrl);
        return;
      }
    }

    setEnvironmentUrl(parsedUrl.origin);

    // Query params from URL + Postman
    const qpRows: KVRow[] = [];
    parsedUrl.searchParams.forEach((v, k) =>
      qpRows.push({ key: k, val: v, enabled: true }),
    );
    Object.entries(extraQP).forEach(([k, v]) => {
      if (!qpRows.find((r) => r.key === k))
        qpRows.push({ key: k, val: v, enabled: true });
    });
    if (qpRows.length > 0)
      setQueryParamRows([...qpRows, { key: "", val: "", enabled: true }]);

    // Match endpoint by path template (prefer same method)
    const path = parsedUrl.pathname;
    const pathMatches = (ep: EndpointResult) => {
      if (ep.path === path) return true;
      const pattern = ep.path
        .replace(/[.+?^$|[\]\\]/g, "\\$&")
        .replace(/\{[^}]+\}/g, "[^/]+");
      try {
        return new RegExp("^" + pattern + "$").test(path);
      } catch {
        return false;
      }
    };
    const matched =
      endpoints.find(
        (ep) => ep.httpMethod.toUpperCase() === method && pathMatches(ep),
      ) ?? endpoints.find((ep) => pathMatches(ep));
    if (matched) setSelectedEndpoint(matched);

    // Content-Type
    const ctKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === "content-type",
    );
    if (ctKey) {
      setContentType(headers[ctKey].split(";")[0].trim());
      delete headers[ctKey];
    }

    // Authorization
    const authKey = Object.keys(headers).find(
      (k) => k.toLowerCase() === "authorization",
    );
    if (authKey) {
      const val = headers[authKey];
      if (val.startsWith("Bearer ")) {
        setAuthType("bearer");
        setAuthToken(val.slice(7));
      } else if (val.startsWith("Basic ")) {
        setAuthType("basic");
        try {
          setAuthToken(atob(val.slice(6)));
        } catch {
          setAuthToken(val.slice(6));
        }
      } else {
        setAuthType("apikey");
        setApiKeyHeader("Authorization");
        setAuthToken(val);
      }
      delete headers[authKey];
    }

    // Remaining headers
    const hRows: KVRow[] = Object.entries(headers).map(([k, v]) => ({
      key: k,
      val: v,
      enabled: true,
    }));
    if (hRows.length > 0)
      setHeaderRows([...hRows, { key: "", val: "", enabled: true }]);

    // Body
    if (body) {
      setRequestPayload(body);
      setReqTab("body");
    } else if (hRows.length > 0) setReqTab("headers");
    else if (qpRows.length > 0) setReqTab("params");

    setShowCurlImport(false);
    setCurlInput("");
    setCurlParseError("");
  };

  const applyImport = (raw: string) => {
    setCurlParseError("");
    const normalized = raw.replace(/\\\r?\n/g, " ").trim();

    // Try Postman JSON
    if (normalized.startsWith("{") || normalized.startsWith("[")) {
      try {
        const parsed = JSON.parse(normalized);
        let req: Record<string, any> | null = null;
        if (parsed.item) {
          const first = parsed.item[0];
          req = first?.request ?? first?.item?.[0]?.request ?? null;
        } else if (parsed.request) {
          req = parsed.request;
        } else if (parsed.method && parsed.url) {
          req = parsed;
        }
        if (!req) {
          setCurlParseError("No request found in Postman JSON");
          return;
        }
        const rawUrl =
          typeof req.url === "string" ? req.url : (req.url?.raw ?? "");
        if (!rawUrl) {
          setCurlParseError("No URL found in Postman JSON");
          return;
        }
        applyParsed({
          method: (req.method ?? "GET").toUpperCase(),
          rawUrl,
          headers: (
            (req.header ?? []) as {
              key: string;
              value: string;
              disabled?: boolean;
            }[]
          )
            .filter((h) => !h.disabled)
            .reduce<Record<string, string>>((acc, h) => {
              acc[h.key] = h.value;
              return acc;
            }, {}),
          body: req.body?.raw ?? "",
          extraQP: (
            (req.url?.query ?? []) as {
              key: string;
              value: string;
              disabled?: boolean;
            }[]
          )
            .filter((q) => !q.disabled)
            .reduce<Record<string, string>>((acc, q) => {
              acc[q.key] = q.value;
              return acc;
            }, {}),
        });
        return;
      } catch {
        setCurlParseError("Invalid JSON — trying cURL parser");
      }
    }

    // cURL parser
    if (!/^curl\b/i.test(normalized)) {
      setCurlParseError("Must start with 'curl' or be Postman JSON");
      return;
    }
    const tokens = tokenizeCurl(normalized);
    let method = "";
    let rawUrl = "";
    const headers: Record<string, string> = {};
    let body = "";
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      if (/^curl$/i.test(t)) continue;
      if (t === "-X" || t === "--request") {
        method = (tokens[++i] ?? "").toUpperCase();
      } else if (t === "-H" || t === "--header") {
        const hdr = tokens[++i] ?? "";
        const ci = hdr.indexOf(":");
        if (ci > 0) headers[hdr.slice(0, ci).trim()] = hdr.slice(ci + 1).trim();
      } else if (
        [
          "-d",
          "--data",
          "--data-raw",
          "--data-binary",
          "--data-urlencode",
        ].includes(t)
      ) {
        body = tokens[++i] ?? "";
      } else if (t === "--url") {
        rawUrl = tokens[++i] ?? "";
      } else if (t === "-u" || t === "--user") {
        const creds = tokens[++i] ?? "";
        headers["Authorization"] = "Basic " + btoa(creds);
      } else if (!t.startsWith("-") && !rawUrl) {
        rawUrl = t;
      } else if (
        t.startsWith("--") &&
        !t.includes("=") &&
        i + 1 < tokens.length &&
        !tokens[i + 1].startsWith("-")
      ) {
        i++; // skip unknown flag value
      }
    }
    if (!rawUrl) {
      setCurlParseError("Could not extract a URL from the cURL command");
      return;
    }
    if (!method) method = body ? "POST" : "GET";
    applyParsed({ method, rawUrl, headers, body, extraQP: {} });
  };

  const downloadLogsAsTxt = () => {
    if (ltRequestLogs.length === 0) return;
    const ep = selectedEndpoint
      ? `${selectedEndpoint.httpMethod} ${selectedEndpoint.path}`
      : "Unknown Endpoint";
    const ts = new Date().toISOString();
    const errCount = ltRequestLogs.filter(
      (h) => h.statusCode >= 400 || h.statusCode === -1,
    ).length;

    const lines: string[] = [
      "==============================================================",
      " API LOAD TEST — REQUEST LOG",
      "==============================================================",
      ` Project:    ${projectName}`,
      ` Endpoint:   ${ep}`,
      ` Generated:  ${ts}`,
      ` Total Req:  ${ltRequestLogs.length}`,
      ` Errors:     ${errCount}`,
      "==============================================================",
      "",
    ];

    [...ltRequestLogs].reverse().forEach((hit, idx) => {
      const n = String(idx + 1).padStart(4, "0");
      const ok = hit.statusCode >= 200 && hit.statusCode < 400;
      const statusStr = hit.statusCode === -1 ? "ERR" : String(hit.statusCode);
      lines.push(`[${n}] ${hit.time}  ${hit.method.padEnd(7)} ${hit.path}`);
      lines.push(
        `       Status:  ${statusStr}  |  Latency: ${hit.durationMs}ms  |  ${ok ? "✓ OK" : "✗ FAILED"}`,
      );
      if (hit.requestUrl) {
        lines.push("");
        lines.push(
          "  ── REQUEST ──────────────────────────────────────────────",
        );
        lines.push(`     URL:     ${hit.requestUrl}`);
        if (hit.requestHeaders && Object.keys(hit.requestHeaders).length > 0) {
          lines.push("     Headers:");
          Object.entries(hit.requestHeaders).forEach(([k, v]) =>
            lines.push(`       ${k}: ${v}`),
          );
        }
        if (hit.requestBody) {
          lines.push("     Body:");
          hit.requestBody.split("\n").forEach((l) => lines.push("       " + l));
        }
        lines.push("");
        lines.push(
          "  ── RESPONSE ─────────────────────────────────────────────",
        );
        if (
          hit.responseHeaders &&
          Object.keys(hit.responseHeaders).length > 0
        ) {
          lines.push("     Headers:");
          Object.entries(hit.responseHeaders).forEach(([k, v]) =>
            lines.push(`       ${k}: ${v}`),
          );
        }
        if (hit.responseBody) {
          lines.push("     Body:");
          hit.responseBody
            .split("\n")
            .forEach((l) => lines.push("       " + l));
        }
      }
      if (!ok && hit.errorMessage) {
        lines.push("");
        lines.push(
          "  ── ERROR ────────────────────────────────────────────────",
        );
        lines.push(`     ${hit.errorMessage}`);
      }
      lines.push("");
      lines.push(
        "--------------------------------------------------------------",
      );
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `load-test-logs-${projectName}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadLogsAsPdf = () => {
    if (ltRequestLogs.length === 0) return;
    const ep = selectedEndpoint
      ? `${selectedEndpoint.httpMethod} ${selectedEndpoint.path}`
      : "Unknown Endpoint";
    const ts = new Date().toISOString();
    const errCount = ltRequestLogs.filter(
      (h) => h.statusCode >= 400 || h.statusCode === -1,
    ).length;

    const escHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    const entriesHtml = [...ltRequestLogs]
      .reverse()
      .map((hit, idx) => {
        const n = String(idx + 1).padStart(4, "0");
        const ok = hit.statusCode >= 200 && hit.statusCode < 400;
        const statusStr =
          hit.statusCode === -1 ? "ERR" : String(hit.statusCode);
        const statusClass = ok ? "ok" : "err";
        const statusColor = ok
          ? "#16a34a"
          : hit.statusCode >= 400 && hit.statusCode < 500
            ? "#d97706"
            : "#dc2626";
        const reqHeadersHtml =
          hit.requestHeaders && Object.keys(hit.requestHeaders).length > 0
            ? Object.entries(hit.requestHeaders)
                .map(
                  ([k, v]) =>
                    `<div class="kv"><span class="key">${escHtml(k)}</span><span>${escHtml(v)}</span></div>`,
                )
                .join("")
            : '<div class="muted">none</div>';
        const respHeadersHtml =
          hit.responseHeaders && Object.keys(hit.responseHeaders).length > 0
            ? Object.entries(hit.responseHeaders)
                .map(
                  ([k, v]) =>
                    `<div class="kv"><span class="key">${escHtml(k)}</span><span>${escHtml(v)}</span></div>`,
                )
                .join("")
            : '<div class="muted">none</div>';

        return `
        <div class="entry ${statusClass}">
          <div class="entry-header">
            <span class="seq">[${n}]</span>
            <span class="time">${escHtml(hit.time)}</span>
            <span class="method">${escHtml(hit.method)}</span>
            <span class="path">${escHtml(hit.path)}</span>
            <span style="margin-left:auto;display:flex;gap:12px;align-items:center">
              <strong style="color:${statusColor}">${statusStr}</strong>
              <span>${hit.durationMs}ms</span>
              <span style="color:${statusColor}">${ok ? "✓ OK" : "✗ FAILED"}</span>
            </span>
          </div>
          ${
            hit.requestUrl
              ? `
          <div class="section">
            <div class="section-title">REQUEST</div>
            <div class="kv"><span class="key">URL</span><span>${escHtml(hit.requestUrl)}</span></div>
            <div class="section-sub">Headers</div>
            ${reqHeadersHtml}
            ${hit.requestBody ? `<div class="section-sub">Body</div><pre>${escHtml(hit.requestBody)}</pre>` : ""}
          </div>
          <div class="section">
            <div class="section-title">RESPONSE</div>
            <div class="section-sub">Headers</div>
            ${respHeadersHtml}
            ${hit.responseBody ? `<div class="section-sub">Body</div><pre>${escHtml(hit.responseBody)}</pre>` : ""}
          </div>`
              : ""
          }
          ${
            !ok && hit.errorMessage
              ? `
          <div class="section err-section">
            <div class="section-title">ERROR</div>
            <div>${escHtml(hit.errorMessage)}</div>
          </div>`
              : ""
          }
        </div>`;
      })
      .join("");

    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<title>Load Test Logs — ${escHtml(projectName ?? "")}</title>
<style>
  body{font-family:monospace;font-size:11px;background:#fff;color:#111;margin:24px;line-height:1.5}
  h1{font-size:15px;margin-bottom:4px}
  .meta{color:#555;font-size:11px;margin-bottom:20px}
  table.summary{border-collapse:collapse;margin-bottom:20px;font-size:11px}
  table.summary td,table.summary th{border:1px solid #ccc;padding:4px 10px;text-align:left}
  table.summary th{background:#f0f0f0}
  .entry{border:1px solid #ddd;margin-bottom:10px;border-radius:4px;overflow:hidden;page-break-inside:avoid}
  .entry-header{padding:6px 10px;display:flex;gap:12px;align-items:center;background:#f5f5f5;flex-wrap:wrap}
  .entry.ok .entry-header{background:#f0fdf4}
  .entry.err .entry-header{background:#fff5f5}
  .seq{color:#888;min-width:44px}.time{color:#555;min-width:80px}
  .method{font-weight:bold;min-width:50px}.path{color:#1e3a5f}
  .section{padding:6px 10px;border-top:1px solid #e5e7eb}
  .section-title{font-weight:bold;color:#374151;margin-bottom:4px;text-transform:uppercase;font-size:10px;letter-spacing:.06em}
  .section-sub{color:#6b7280;margin-top:4px;margin-bottom:2px;font-size:10px}
  .err-section{background:#fff5f5}
  .kv{display:flex;gap:8px;line-height:1.5}
  .key{color:#6b7280;min-width:160px;flex-shrink:0}
  .muted{color:#aaa;font-style:italic}
  pre{background:#f9fafb;padding:6px 8px;border-radius:3px;margin:4px 0;white-space:pre-wrap;word-break:break-all;font-size:10px;border:1px solid #e5e7eb}
  @media print{.no-print{display:none}button{display:none}}
</style>
</head><body>
<div class="no-print" style="background:#f0f4ff;border:1px solid #93c5fd;border-radius:6px;padding:10px 16px;margin-bottom:16px;font-family:sans-serif;font-size:13px">
  <strong>Tip:</strong> Press <kbd>Ctrl+P</kbd> (or ⌘+P on Mac) and choose <em>Save as PDF</em> to download.
  <button onclick="window.print()" style="float:right;padding:4px 12px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">🖨 Print / Save PDF</button>
</div>
<h1>API Load Test — Request Log</h1>
<div class="meta">Project: <strong>${escHtml(projectName ?? "")}</strong> &nbsp;|&nbsp; Endpoint: <strong>${escHtml(ep)}</strong> &nbsp;|&nbsp; Generated: ${escHtml(ts)}</div>
<table class="summary">
  <tr><th>Total Requests</th><th>Successful</th><th>Errors</th></tr>
  <tr><td>${ltRequestLogs.length}</td><td>${ltRequestLogs.length - errCount}</td><td style="color:#dc2626">${errCount}</td></tr>
</table>
${entriesHtml}
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  /** Generate and open a PDF report for a saved history entry. */
  const downloadRunPdf = (entry: LtHistoryEntry, runNumber: number) => {
    const logs = entry.requestLogs ?? [];
    const errCount = logs.filter(
      (h) => h.statusCode >= 400 || h.statusCode === -1,
    ).length;

    const escHtml = (s: string) =>
      String(s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const entriesHtml =
      logs.length > 0
        ? [...logs]
            .reverse()
            .map((hit, idx) => {
              const n = String(idx + 1).padStart(4, "0");
              const ok = hit.statusCode >= 200 && hit.statusCode < 400;
              const statusStr =
                hit.statusCode === -1 ? "ERR" : String(hit.statusCode);
              const statusColor = ok
                ? "#16a34a"
                : hit.statusCode >= 400 && hit.statusCode < 500
                  ? "#d97706"
                  : "#dc2626";
              const reqHeadersHtml =
                hit.requestHeaders && Object.keys(hit.requestHeaders).length > 0
                  ? Object.entries(hit.requestHeaders)
                      .map(
                        ([k, v]) =>
                          `<div class="kv"><span class="key">${escHtml(k)}</span><span>${escHtml(v)}</span></div>`,
                      )
                      .join("")
                  : '<div class="muted">none</div>';
              const respHeadersHtml =
                hit.responseHeaders &&
                Object.keys(hit.responseHeaders).length > 0
                  ? Object.entries(hit.responseHeaders)
                      .map(
                        ([k, v]) =>
                          `<div class="kv"><span class="key">${escHtml(k)}</span><span>${escHtml(v)}</span></div>`,
                      )
                      .join("")
                  : '<div class="muted">none</div>';
              return `
        <div class="entry ${ok ? "ok" : "err"}">
          <div class="entry-header">
            <span class="seq">[${n}]</span>
            <span class="time">${escHtml(hit.time)}</span>
            <span class="method">${escHtml(hit.method)}</span>
            <span class="path">${escHtml(hit.path)}</span>
            <span style="margin-left:auto;display:flex;gap:12px;align-items:center">
              <strong style="color:${statusColor}">${statusStr}</strong>
              <span>${hit.durationMs}ms</span>
              <span style="color:${statusColor}">${ok ? "✓ OK" : "✗ FAILED"}</span>
            </span>
          </div>
          ${
            hit.requestUrl
              ? `
          <div class="section">
            <div class="section-title">REQUEST</div>
            <div class="kv"><span class="key">URL</span><span>${escHtml(hit.requestUrl)}</span></div>
            <div class="section-sub">Headers</div>${reqHeadersHtml}
            ${hit.requestBody ? `<div class="section-sub">Body</div><pre>${escHtml(hit.requestBody)}</pre>` : ""}
          </div>
          <div class="section">
            <div class="section-title">RESPONSE</div>
            <div class="section-sub">Headers</div>${respHeadersHtml}
            ${hit.responseBody ? `<div class="section-sub">Body</div><pre>${escHtml(hit.responseBody)}</pre>` : ""}
          </div>`
              : ""
          }
          ${!ok && hit.errorMessage ? `<div class="section err-section"><div class="section-title">ERROR</div><div>${escHtml(hit.errorMessage)}</div></div>` : ""}
        </div>`;
            })
            .join("")
        : '<p style="color:#888;font-style:italic">No per-request log was captured for this run (older runs saved before this feature was added).</p>';

    const p = entry.percentiles;
    const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"/>
<title>Load Test Report — Run #${runNumber} — ${escHtml(projectName ?? "")}</title>
<style>
  body{font-family:monospace;font-size:11px;background:#fff;color:#111;margin:24px;line-height:1.5}
  h1{font-size:15px;margin-bottom:4px}
  .meta{color:#555;font-size:11px;margin-bottom:20px}
  table.summary{border-collapse:collapse;margin-bottom:20px;font-size:11px}
  table.summary td,table.summary th{border:1px solid #ccc;padding:4px 10px;text-align:left}
  table.summary th{background:#f0f0f0}
  .entry{border:1px solid #ddd;margin-bottom:10px;border-radius:4px;overflow:hidden;page-break-inside:avoid}
  .entry-header{padding:6px 10px;display:flex;gap:12px;align-items:center;background:#f5f5f5;flex-wrap:wrap}
  .entry.ok .entry-header{background:#f0fdf4}.entry.err .entry-header{background:#fff5f5}
  .seq{color:#888;min-width:44px}.time{color:#555;min-width:80px}
  .method{font-weight:bold;min-width:50px}.path{color:#1e3a5f}
  .section{padding:6px 10px;border-top:1px solid #e5e7eb}
  .section-title{font-weight:bold;color:#374151;margin-bottom:4px;text-transform:uppercase;font-size:10px;letter-spacing:.06em}
  .section-sub{color:#6b7280;margin-top:4px;margin-bottom:2px;font-size:10px}
  .err-section{background:#fff5f5}.kv{display:flex;gap:8px;line-height:1.5}
  .key{color:#6b7280;min-width:160px;flex-shrink:0}.muted{color:#aaa;font-style:italic}
  pre{background:#f9fafb;padding:6px 8px;border-radius:3px;margin:4px 0;white-space:pre-wrap;word-break:break-all;font-size:10px;border:1px solid #e5e7eb}
  @media print{.no-print{display:none}button{display:none}}
</style>
</head><body>
<div class="no-print" style="background:#f0f4ff;border:1px solid #93c5fd;border-radius:6px;padding:10px 16px;margin-bottom:16px;font-family:sans-serif;font-size:13px">
  <strong>Tip:</strong> Press <kbd>Ctrl+P</kbd> and choose <em>Save as PDF</em> to download.
  <button onclick="window.print()" style="float:right;padding:4px 12px;background:#3b82f6;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">🖨 Print / Save PDF</button>
</div>
<h1>API Load Test Report — Run #${runNumber}</h1>
<div class="meta">Project: <strong>${escHtml(projectName ?? "")}</strong> &nbsp;|&nbsp; Run At: <strong>${escHtml(entry.runAt)}</strong></div>
<table class="summary">
  <tr><th>URL</th><td colspan="5">${escHtml(entry.url)}</td></tr>
  <tr><th>Threads</th><td>${entry.threads}</td><th>Total Requests</th><td>${entry.totalRequests}</td><th>Throughput</th><td>${entry.throughput.toFixed(1)} req/s</td></tr>
  <tr><th>Successful</th><td style="color:#16a34a">${entry.successfulRequests}</td><th>Failed</th><td style="color:#dc2626">${entry.failedRequests}</td><th>Error %</th><td style="color:${entry.failedRequests > 0 ? "#dc2626" : "inherit"}">${entry.totalRequests > 0 ? ((entry.failedRequests / entry.totalRequests) * 100).toFixed(1) : "0"}%</td></tr>
  <tr><th>Avg (ms)</th><td>${Math.round(entry.successAvgMs)}</td><th>Min (ms)</th><td>${Math.round(entry.minResponseTimeMs)}</td><th>Max (ms)</th><td>${Math.round(entry.maxResponseTimeMs)}</td></tr>
  ${p ? `<tr><th>P50</th><td>${p.p50}</td><th>P90</th><td>${p.p90}</td><th>P99</th><td>${p.p99 ?? "—"}</td></tr>` : ""}
</table>
<h2 style="font-size:13px;margin-bottom:8px">Per-Request Log (${logs.length} total · ${logs.length - errCount} ok · ${errCount} errors)</h2>
${entriesHtml}
</body></html>`;

    const win = window.open("", "_blank");
    if (win) {
      win.document.write(html);
      win.document.close();
    }
  };

  const getMethodBadge = (method: string) => {
    const map: Record<string, string> = {
      GET: "badge-get",
      POST: "badge-post",
      PUT: "badge-put",
      DELETE: "badge-delete",
      PATCH: "badge-patch",
      SOAP: "badge-soap",
    };
    return map[method.toUpperCase()] || "";
  };

  const latestRun = history.length > 0 ? history[0] : null;

  // Live URL preview — reflects path param substitutions + enabled query params
  const resolvedPreviewUrl = React.useMemo(() => {
    if (!selectedEndpoint) return "";
    const resolvedPath = selectedEndpoint.path.replace(
      /\{([^}]+)\}/g,
      (_, p) =>
        pathParamValues[p] ? encodeURIComponent(pathParamValues[p]) : `{${p}}`,
    );
    const enabledQP = queryParamRows.filter((r) => r.enabled && r.key);
    const qs =
      enabledQP.length > 0
        ? "?" +
          enabledQP
            .map(
              (r) =>
                `${encodeURIComponent(r.key)}=${encodeURIComponent(r.val)}`,
            )
            .join("&")
        : "";
    return environmentUrl.replace(/\/$/, "") + resolvedPath + qs;
  }, [selectedEndpoint, environmentUrl, pathParamValues, queryParamRows]);

  // Framework detection helpers for conditional UI
  const isSoap =
    selectedEndpoint?.httpMethod === "SOAP" ||
    selectedEndpoint?.framework === "JAX_WS" ||
    selectedEndpoint?.framework === "SPRING_WS";
  const isStruts =
    selectedEndpoint?.framework === "STRUTS1" ||
    selectedEndpoint?.framework === "STRUTS2";

  const filteredHits = selectedEndpoint
    ? monitorHits.filter((h) => h.path === selectedEndpoint.path)
    : monitorHits;
  const apmAverage =
    apmLogs.length > 0
      ? Math.round(
          apmLogs.reduce((acc, l) => acc + l.durationMs, 0) / apmLogs.length,
        )
      : 0;
  const apmErrors = apmLogs.filter((l) => l.statusCode >= 400).length;

  // ── No endpoint selected: show the endpoint picker ──
  if (!selectedEndpoint) {
    return (
      <EndpointPicker
        projectName={projectName || ""}
        endpoints={endpoints}
        isApmMode={isApmMode}
        onSelect={setSelectedEndpoint}
        onBack={() => navigate(isApmMode ? "/apm" : "/apis")}
        getMethodBadge={getMethodBadge}
      />
    );
  }

  // ── Endpoint selected: show the full dashboard ──
  return (
    <>
      {/* ── Breadcrumb header ── */}
      <div style={{ marginBottom: "1.5rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            marginBottom: "0.4rem",
            flexWrap: "wrap",
          }}
        >
          <button
            className="btn btn-outline btn-sm"
            onClick={() => {
              setSelectedEndpoint(null);
            }}
          >
            <ArrowLeft style={{ width: 16, height: 16 }} /> Endpoints
          </button>
          <span style={{ color: "rgba(255,255,255,0.15)", fontSize: "0.9rem" }}>
            /
          </span>
          <span
            className={`badge ${getMethodBadge(selectedEndpoint.httpMethod)}`}
            style={{ fontSize: "0.75rem" }}
          >
            {selectedEndpoint.httpMethod}
          </span>
          <code
            style={{
              fontSize: "1rem",
              fontWeight: 700,
              color: "var(--text-primary)",
            }}
          >
            {selectedEndpoint.path}
          </code>
        </div>
        <p
          style={{
            fontSize: "0.78rem",
            fontFamily: "var(--font-mono)",
            color: "var(--text-muted)",
            marginLeft: "5.5rem",
          }}
        >
          {selectedEndpoint.controllerClass}.{selectedEndpoint.controllerMethod}
          ()
        </p>
      </div>

      {/* ── Mode label (replaces tabs — mode is set by route) ── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
        }}
      >
        {isApmMode ? (
          <>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(99,102,241,0.1)",
                border: "1px solid rgba(99,102,241,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Activity style={{ width: 14, height: 14, color: "#818cf8" }} />
            </div>
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                background: "linear-gradient(135deg, #818cf8, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              APM &amp; Load Test
            </span>
          </>
        ) : (
          <>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: "rgba(34,197,94,0.1)",
                border: "1px solid rgba(34,197,94,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Radio style={{ width: 14, height: 14, color: "#22c55e" }} />
            </div>
            <span
              style={{
                fontSize: "0.85rem",
                fontWeight: 700,
                background: "linear-gradient(135deg, #22c55e, #4ade80)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}
            >
              Live Monitor
            </span>
          </>
        )}
      </div>

      {/* APM TAB */}
      {activeTab === "apm" && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* Stat cards — live data takes priority; otherwise show cumulative or selected run */}
          <MetricCardsGrid
            liveStats={liveStats}
            liveTestHistory={liveTestHistory}
            ltSelectedRunId={ltSelectedRunId}
            onSelectRun={setLtSelectedRunId}
            apmLogs={apmLogs}
            apmAverage={apmAverage}
            apmErrors={apmErrors}
          />

          {/* Live fire test card */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: "linear-gradient(90deg, #6366f1, #a78bfa, #c084fc)",
              }}
            />
            <div
              style={{
                padding: "1.25rem 1.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div>
                <h3
                  style={{
                    fontSize: "1rem",
                    fontWeight: 700,
                    margin: 0,
                    letterSpacing: "-0.01em",
                  }}
                >
                  Live Load Test
                </h3>
                <p
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginTop: "0.25rem",
                  }}
                >
                  Fire concurrent users against this endpoint and stream
                  real‑time metrics
                </p>
              </div>
              <div
                style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}
              >
                {liveRunning && (
                  <span className="badge badge-running">
                    ● Running — {liveStats?.elapsedSeconds ?? 0}s elapsed
                  </span>
                )}
                {!liveRunning && liveStats?.type === "COMPLETE" && (
                  <span className="badge badge-success">✓ Complete</span>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "440px 1fr",
                gap: 0,
              }}
            >
              {/* Left — Postman-style request builder */}
              <div
                style={{
                  borderRight: "1px solid var(--border)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {/* ── cURL / Postman import bar (REST only) ── */}
                {!isSoap && (
                  <>
                    <div
                      style={{
                        borderBottom: "1px solid var(--border)",
                        padding: "0.5rem 1rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: showCurlImport
                          ? "rgba(99,102,241,0.07)"
                          : "transparent",
                        transition: "background 0.2s",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                        }}
                      >
                        Import
                      </span>
                      <button
                        onClick={() => {
                          setShowCurlImport(!showCurlImport);
                          setCurlParseError("");
                        }}
                        disabled={liveRunning}
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          background: showCurlImport
                            ? "rgba(99,102,241,0.15)"
                            : "rgba(255,255,255,0.06)",
                          color: showCurlImport
                            ? "var(--accent-light)"
                            : "var(--text-muted)",
                          border:
                            "1px solid " +
                            (showCurlImport
                              ? "rgba(99,102,241,0.35)"
                              : "var(--border)"),
                          borderRadius: "var(--radius)",
                          padding: "0.25rem 0.65rem",
                          cursor: "pointer",
                          transition: "all 0.15s",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <span style={{ fontSize: "1em" }}>
                          {showCurlImport ? "✕" : "⬆"}
                        </span>
                        {showCurlImport ? "Close" : "cURL / Postman"}
                      </button>
                    </div>

                    {showCurlImport && (
                      <div
                        style={{
                          padding: "0.85rem 1rem",
                          borderBottom: "1px solid var(--border)",
                          background: "rgba(0,0,0,0.18)",
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.5rem",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "0.71rem",
                            color: "var(--text-muted)",
                            lineHeight: 1.5,
                          }}
                        >
                          Paste a{" "}
                          <strong style={{ color: "var(--text-primary)" }}>
                            cURL command
                          </strong>{" "}
                          or a{" "}
                          <strong style={{ color: "var(--text-primary)" }}>
                            Postman request/collection JSON
                          </strong>
                          . Headers, auth, body, and query params will be
                          auto-filled.
                        </div>
                        <textarea
                          value={curlInput}
                          onChange={(e) => setCurlInput(e.target.value)}
                          placeholder={`curl -X POST 'https://api.example.com/users?page=1' \\\n  -H 'Authorization: Bearer <token>' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"John"}'`}
                          style={{
                            width: "100%",
                            minHeight: 110,
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.72rem",
                            resize: "vertical",
                            background: "var(--bg-secondary)",
                            color: "var(--text-primary)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            padding: "0.55rem 0.7rem",
                            outline: "none",
                            lineHeight: 1.55,
                            boxSizing: "border-box",
                          }}
                          autoFocus
                          spellCheck={false}
                        />
                        {curlParseError && (
                          <div
                            style={{
                              color: "var(--danger)",
                              fontSize: "0.73rem",
                              display: "flex",
                              alignItems: "flex-start",
                              gap: "0.3rem",
                            }}
                          >
                            <span>⚠</span>
                            <span>{curlParseError}</span>
                          </div>
                        )}
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button
                            className="btn btn-primary"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.3rem 0.8rem",
                            }}
                            onClick={() => applyImport(curlInput)}
                            disabled={!curlInput.trim()}
                          >
                            Apply
                          </button>
                          <button
                            className="btn btn-outline"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.3rem 0.8rem",
                            }}
                            onClick={() => {
                              setShowCurlImport(false);
                              setCurlInput("");
                              setCurlParseError("");
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* URL + Thread Group config + action */}
                <div
                  style={{
                    padding: "1rem 1.25rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.65rem",
                  }}
                >
                  {/* Base URL */}
                  <div className="form-group" style={{ margin: 0 }}>
                    <label
                      style={{
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      {isSoap
                        ? "Service Endpoint URL"
                        : isStruts
                          ? "Application URL"
                          : "Base URL"}
                    </label>
                    <input
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      value={environmentUrl}
                      onChange={(e) => setEnvironmentUrl(e.target.value)}
                      onPaste={handleBaseUrlPaste}
                      disabled={liveRunning}
                      placeholder={
                        isSoap
                          ? "http://localhost:8081"
                          : "http://localhost:8081"
                      }
                    />
                  </div>
                  <div
                    style={{
                      fontSize: "0.67rem",
                      color: "var(--text-muted)",
                      marginTop: "-0.3rem",
                    }}
                  >
                    {isSoap
                      ? "↗ Enter the SOAP service endpoint URL"
                      : isStruts
                        ? "↗ Enter the Struts application base URL"
                        : "↗ Paste a full URL to auto-extract query & path params"}
                  </div>

                  {/* Resolved URL preview */}
                  {selectedEndpoint && (
                    <div
                      style={{
                        fontSize: "0.71rem",
                        fontFamily: "var(--font-mono)",
                        color: "var(--accent-light)",
                        background: "rgba(99,102,241,0.08)",
                        border: "1px solid rgba(99,102,241,0.2)",
                        borderRadius: "var(--radius)",
                        padding: "0.3rem 0.5rem",
                        wordBreak: "break-all",
                        userSelect: "all",
                      }}
                    >
                      {resolvedPreviewUrl}
                    </div>
                  )}

                  {/* Thread group label */}
                  <div
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                      color: "var(--text-muted)",
                      borderTop: "1px solid var(--border)",
                      paddingTop: "0.5rem",
                    }}
                  >
                    Thread Group
                  </div>

                  {/* Threads + Total Requests row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                    }}
                  >
                    <div className="form-group" style={{ margin: 0 }}>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>Threads (Users)</span>
                        <strong style={{ color: "var(--text-primary)" }}>
                          {threads}
                        </strong>
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
                        min={1}
                        max={500}
                        value={threads}
                        disabled={liveRunning}
                        onChange={(e) =>
                          setThreads(Math.max(1, parseInt(e.target.value) || 1))
                        }
                      />
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>Total Requests</span>
                        <strong style={{ color: "var(--text-primary)" }}>
                          {totalRequests}
                        </strong>
                      </label>
                      <input
                        type="number"
                        className="form-input"
                        style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
                        min={1}
                        value={totalRequests}
                        disabled={liveRunning}
                        onChange={(e) =>
                          setTotalRequests(
                            Math.max(1, parseInt(e.target.value) || 1),
                          )
                        }
                      />
                    </div>
                  </div>

                  {/* Ramp-up interval */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.5rem",
                    }}
                  >
                    <div className="form-group" style={{ margin: 0 }}>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>Ramp-up Interval</span>
                        <strong style={{ color: "var(--text-primary)" }}>
                          {rampUpInterval}s
                        </strong>
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <input
                          type="number"
                          className="form-input"
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.3rem 0.5rem",
                          }}
                          min={0}
                          step={0.5}
                          value={rampUpInterval}
                          disabled={liveRunning}
                          onChange={(e) =>
                            setRampUpInterval(
                              Math.max(0, parseFloat(e.target.value) || 0),
                            )
                          }
                        />
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          s / thread
                        </span>
                      </div>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label
                        style={{
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          display: "flex",
                          justifyContent: "space-between",
                        }}
                      >
                        <span>Think Time</span>
                        <strong style={{ color: "var(--text-primary)" }}>
                          {thinkTime === 0 ? "none" : `${thinkTime}s`}
                        </strong>
                      </label>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <input
                          type="number"
                          className="form-input"
                          style={{
                            fontSize: "0.8rem",
                            padding: "0.3rem 0.5rem",
                          }}
                          min={0}
                          step={0.25}
                          value={thinkTime}
                          disabled={liveRunning}
                          onChange={(e) =>
                            setThinkTime(
                              Math.max(0, parseFloat(e.target.value) || 0),
                            )
                          }
                        />
                        <span
                          style={{
                            fontSize: "0.68rem",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          s / req
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Estimated summary */}
                  {(() => {
                    const reqPerThread = Math.ceil(totalRequests / threads);
                    const estRampSec = rampUpInterval * (threads - 1);
                    return (
                      <div
                        style={{
                          background: "rgba(99,102,241,0.06)",
                          border: "1px solid rgba(99,102,241,0.15)",
                          borderRadius: "var(--radius)",
                          padding: "0.45rem 0.6rem",
                          fontSize: "0.71rem",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "0.25rem",
                        }}
                      >
                        {[
                          { label: "Req/Thread", value: reqPerThread },
                          {
                            label: "Ramp Total",
                            value: `${estRampSec.toFixed(0)}s`,
                          },
                          {
                            label: "~Total Req",
                            value: threads * reqPerThread,
                          },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ textAlign: "center" }}>
                            <div style={{ color: "var(--text-muted)" }}>
                              {label}
                            </div>
                            <div
                              style={{
                                fontWeight: 700,
                                color: "var(--accent-light)",
                              }}
                            >
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Start / Stop */}
                  {!liveRunning ? (
                    <button
                      className="btn btn-danger"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={handleStartLiveTest}
                    >
                      <Zap style={{ width: 15, height: 15, marginRight: 6 }} />
                      Start Load Test
                    </button>
                  ) : (
                    <button
                      className="btn btn-secondary"
                      style={{ width: "100%", justifyContent: "center" }}
                      onClick={handleStopLiveTest}
                    >
                      ■ Stop Test
                    </button>
                  )}
                </div>

                {/* Tab bar: Auth | Body */}
                {(() => {
                  const tabs: {
                    id: "auth" | "body";
                    label: string;
                  }[] = [
                    { id: "auth", label: "Auth" },
                    { id: "body", label: "Body" },
                  ];
                  return (
                    <div
                      style={{
                        display: "flex",
                        borderBottom: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.025)",
                        gap: 0,
                      }}
                    >
                      {tabs.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setReqTab(t.id)}
                          style={{
                            flex: 1,
                            padding: "0.55rem 0",
                            fontSize: "0.72rem",
                            fontWeight: 600,
                            background: "none",
                            border: "none",
                            borderBottom:
                              reqTab === t.id
                                ? "2px solid var(--accent)"
                                : "2px solid transparent",
                            color:
                              reqTab === t.id
                                ? "var(--accent-light)"
                                : "var(--text-muted)",
                            cursor: "pointer",
                            transition: "color 0.15s, border-color 0.15s",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "0.3rem",
                          }}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  );
                })()}

                {/* Tab content */}
                <div
                  style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "0.85rem 1rem",
                  }}
                >
                  {/* PARAMS TAB — query params + path params */}
                  {reqTab === "params" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "1rem",
                      }}
                    >
                      {/* Path variables */}
                      {derivedPathParams.length > 0 && (
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.4rem",
                              marginBottom: "0.5rem",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 700,
                                color: "var(--text-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                              }}
                            >
                              Path Variables
                            </span>
                            <span
                              style={{
                                fontSize: "0.65rem",
                                background: "rgba(139,92,246,0.15)",
                                color: "#a78bfa",
                                borderRadius: 9,
                                padding: "0 5px",
                                lineHeight: "1.5",
                              }}
                            >
                              auto-detected
                            </span>
                          </div>
                          <div
                            style={{
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius)",
                              overflow: "hidden",
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                background: "rgba(255,255,255,0.03)",
                                borderBottom: "1px solid var(--border)",
                                padding: "0.25rem 0.75rem",
                                fontSize: "0.68rem",
                                color: "var(--text-muted)",
                                fontWeight: 600,
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                              }}
                            >
                              <span>Variable</span>
                              <span>Value</span>
                            </div>
                            {derivedPathParams.map((param, idx) => (
                              <div
                                key={param}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "1fr 1fr",
                                  gap: "0.5rem",
                                  padding: "0.35rem 0.75rem",
                                  alignItems: "center",
                                  borderBottom:
                                    idx < derivedPathParams.length - 1
                                      ? "1px solid var(--border)"
                                      : "none",
                                  background: "rgba(255,255,255,0.015)",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: "0.75rem",
                                    fontFamily: "var(--font-mono)",
                                    color: "#a78bfa",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                  }}
                                >
                                  <span style={{ opacity: 0.5 }}>{"{"}</span>
                                  {param}
                                  <span style={{ opacity: 0.5 }}>{"}"}</span>
                                </span>
                                <input
                                  className="form-input"
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "0.25rem 0.5rem",
                                  }}
                                  placeholder="value"
                                  value={pathParamValues[param] ?? ""}
                                  disabled={liveRunning}
                                  onChange={(e) =>
                                    setPathParamValues((prev) => ({
                                      ...prev,
                                      [param]: e.target.value,
                                    }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Query params */}
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            Query Params
                          </span>
                          <button
                            onClick={() =>
                              setQueryParamRows((prev) => [
                                ...prev,
                                { key: "", val: "", enabled: true },
                              ])
                            }
                            disabled={liveRunning}
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--accent-light)",
                              background: "rgba(99,102,241,0.1)",
                              border: "1px solid rgba(99,102,241,0.25)",
                              borderRadius: 5,
                              padding: "0.15rem 0.5rem",
                              cursor: "pointer",
                              fontWeight: 600,
                            }}
                          >
                            + Add
                          </button>
                        </div>
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "22px 1fr 1fr 24px",
                              background: "rgba(255,255,255,0.03)",
                              borderBottom: "1px solid var(--border)",
                              padding: "0.25rem 0.6rem",
                              fontSize: "0.68rem",
                              color: "var(--text-muted)",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                              alignItems: "center",
                              gap: "0.4rem",
                            }}
                          >
                            <span />
                            <span>Key</span>
                            <span>Value</span>
                            <span />
                          </div>
                          {queryParamRows.length === 0 ? (
                            <div
                              style={{
                                padding: "0.75rem",
                                textAlign: "center",
                                fontSize: "0.75rem",
                                color: "var(--text-muted)",
                              }}
                            >
                              No params — click "+ Add" to add one
                            </div>
                          ) : (
                            queryParamRows.map((row, i) => (
                              <div
                                key={i}
                                style={{
                                  display: "grid",
                                  gridTemplateColumns: "22px 1fr 1fr 24px",
                                  gap: "0.4rem",
                                  alignItems: "center",
                                  padding: "0.3rem 0.6rem",
                                  borderBottom:
                                    i < queryParamRows.length - 1
                                      ? "1px solid var(--border)"
                                      : "none",
                                  background: row.enabled
                                    ? "transparent"
                                    : "rgba(255,255,255,0.015)",
                                  opacity: row.enabled ? 1 : 0.5,
                                  transition: "opacity 0.15s",
                                }}
                              >
                                <input
                                  type="checkbox"
                                  checked={row.enabled}
                                  onChange={(e) =>
                                    setQueryParamRows((prev) =>
                                      prev.map((r, j) =>
                                        j === i
                                          ? { ...r, enabled: e.target.checked }
                                          : r,
                                      ),
                                    )
                                  }
                                  style={{
                                    accentColor: "var(--accent)",
                                    width: 13,
                                    height: 13,
                                    cursor: "pointer",
                                  }}
                                />
                                <input
                                  className="form-input"
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "0.25rem 0.45rem",
                                  }}
                                  placeholder="key"
                                  value={row.key}
                                  disabled={liveRunning}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setQueryParamRows((prev) =>
                                      prev.map((r, j) =>
                                        j === i ? { ...r, key: v } : r,
                                      ),
                                    );
                                  }}
                                />
                                <input
                                  className="form-input"
                                  style={{
                                    fontSize: "0.75rem",
                                    padding: "0.25rem 0.45rem",
                                  }}
                                  placeholder="value"
                                  value={row.val}
                                  disabled={liveRunning}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    setQueryParamRows((prev) =>
                                      prev.map((r, j) =>
                                        j === i ? { ...r, val: v } : r,
                                      ),
                                    );
                                  }}
                                />
                                <button
                                  onClick={() =>
                                    setQueryParamRows((prev) =>
                                      prev.filter((_, j) => j !== i),
                                    )
                                  }
                                  disabled={liveRunning}
                                  title="Remove"
                                  style={{
                                    background: "none",
                                    border: "none",
                                    color: "rgba(239,68,68,0.6)",
                                    cursor: "pointer",
                                    padding: 2,
                                    fontSize: "1rem",
                                    lineHeight: 1,
                                    borderRadius: 3,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                        {queryParamRows.length > 0 && (
                          <button
                            onClick={() =>
                              setQueryParamRows((prev) => [
                                ...prev,
                                { key: "", val: "", enabled: true },
                              ])
                            }
                            disabled={liveRunning}
                            style={{
                              marginTop: "0.4rem",
                              width: "100%",
                              fontSize: "0.72rem",
                              color: "var(--text-muted)",
                              background: "rgba(255,255,255,0.03)",
                              border: "1px dashed var(--border)",
                              borderRadius: "var(--radius)",
                              padding: "0.3rem",
                              cursor: "pointer",
                            }}
                          >
                            + Add Query Param
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {/* HEADERS TAB */}
                  {reqTab === "headers" && (
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          Custom Headers
                        </span>
                        <button
                          onClick={() =>
                            setHeaderRows((prev) => [
                              ...prev,
                              { key: "", val: "", enabled: true },
                            ])
                          }
                          disabled={liveRunning}
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--accent-light)",
                            background: "rgba(99,102,241,0.1)",
                            border: "1px solid rgba(99,102,241,0.25)",
                            borderRadius: 5,
                            padding: "0.15rem 0.5rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      <div
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "22px 1fr 1fr 24px",
                            background: "rgba(255,255,255,0.03)",
                            borderBottom: "1px solid var(--border)",
                            padding: "0.25rem 0.6rem",
                            fontSize: "0.68rem",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <span />
                          <span>Header</span>
                          <span>Value</span>
                          <span />
                        </div>
                        {headerRows.length === 0 ? (
                          <div
                            style={{
                              padding: "0.75rem",
                              textAlign: "center",
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            No headers — click "+ Add" to add one
                          </div>
                        ) : (
                          headerRows.map((row, i) => (
                            <div
                              key={i}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "22px 1fr 1fr 24px",
                                gap: "0.4rem",
                                alignItems: "center",
                                padding: "0.3rem 0.6rem",
                                borderBottom:
                                  i < headerRows.length - 1
                                    ? "1px solid var(--border)"
                                    : "none",
                                opacity: row.enabled ? 1 : 0.5,
                                transition: "opacity 0.15s",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) =>
                                  setHeaderRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, enabled: e.target.checked }
                                        : r,
                                    ),
                                  )
                                }
                                style={{
                                  accentColor: "var(--accent)",
                                  width: 13,
                                  height: 13,
                                  cursor: "pointer",
                                }}
                              />
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.45rem",
                                }}
                                placeholder="Header-Name"
                                value={row.key}
                                disabled={liveRunning}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setHeaderRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, key: v } : r,
                                    ),
                                  );
                                }}
                              />
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.45rem",
                                }}
                                placeholder="value"
                                value={row.val}
                                disabled={liveRunning}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setHeaderRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, val: v } : r,
                                    ),
                                  );
                                }}
                              />
                              <button
                                onClick={() =>
                                  setHeaderRows((prev) =>
                                    prev.filter((_, j) => j !== i),
                                  )
                                }
                                disabled={liveRunning}
                                title="Remove"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "rgba(239,68,68,0.6)",
                                  cursor: "pointer",
                                  padding: 2,
                                  fontSize: "1rem",
                                  lineHeight: 1,
                                  borderRadius: 3,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setHeaderRows((prev) => [
                            ...prev,
                            { key: "", val: "", enabled: true },
                          ])
                        }
                        disabled={liveRunning}
                        style={{
                          marginTop: "0.4rem",
                          width: "100%",
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px dashed var(--border)",
                          borderRadius: "var(--radius)",
                          padding: "0.3rem",
                          cursor: "pointer",
                        }}
                      >
                        + Add Header
                      </button>
                    </div>
                  )}

                  {/* AUTH TAB */}
                  {reqTab === "auth" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.85rem",
                      }}
                    >
                      {/* Type selector */}
                      <div>
                        <label
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            display: "block",
                            marginBottom: "0.4rem",
                          }}
                        >
                          Auth Type
                        </label>
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(4, 1fr)",
                            gap: "0.35rem",
                          }}
                        >
                          {(["none", "bearer", "basic", "apikey"] as const).map(
                            (t) => (
                              <button
                                key={t}
                                onClick={() => setAuthType(t)}
                                disabled={liveRunning}
                                style={{
                                  padding: "0.35rem 0",
                                  fontSize: "0.7rem",
                                  fontWeight: 600,
                                  borderRadius: "var(--radius)",
                                  border:
                                    authType === t
                                      ? "1px solid var(--accent)"
                                      : "1px solid var(--border)",
                                  background:
                                    authType === t
                                      ? "rgba(99,102,241,0.15)"
                                      : "rgba(255,255,255,0.03)",
                                  color:
                                    authType === t
                                      ? "var(--accent-light)"
                                      : "var(--text-muted)",
                                  cursor: "pointer",
                                  transition: "all 0.15s",
                                }}
                              >
                                {t === "none"
                                  ? "None"
                                  : t === "bearer"
                                    ? "Bearer"
                                    : t === "basic"
                                      ? "Basic"
                                      : "API Key"}
                              </button>
                            ),
                          )}
                        </div>
                      </div>

                      {authType === "none" && (
                        <div
                          style={{
                            padding: "0.75rem",
                            background: "rgba(255,255,255,0.02)",
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          No authentication headers will be added to the
                          request.
                        </div>
                      )}

                      {authType === "bearer" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          <label
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              display: "block",
                            }}
                          >
                            Token
                          </label>
                          <input
                            className="form-input"
                            style={{
                              fontSize: "0.8rem",
                              fontFamily: "var(--font-mono)",
                            }}
                            placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                            value={authToken}
                            onChange={(e) => setAuthToken(e.target.value)}
                            disabled={liveRunning}
                          />
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              background: "rgba(99,102,241,0.06)",
                              border: "1px solid rgba(99,102,241,0.15)",
                              borderRadius: 5,
                              padding: "0.3rem 0.5rem",
                            }}
                          >
                            Adds:{" "}
                            <code style={{ color: "var(--accent-light)" }}>
                              Authorization: Bearer &lt;token&gt;
                            </code>
                          </div>
                        </div>
                      )}

                      {authType === "basic" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                                display: "block",
                                marginBottom: "0.3rem",
                              }}
                            >
                              Username
                            </label>
                            <input
                              className="form-input"
                              style={{ fontSize: "0.8rem" }}
                              placeholder="username"
                              value={authToken.split(":")[0] ?? ""}
                              onChange={(e) =>
                                setAuthToken(
                                  e.target.value +
                                    ":" +
                                    (authToken.split(":").slice(1).join(":") ??
                                      ""),
                                )
                              }
                              disabled={liveRunning}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                                display: "block",
                                marginBottom: "0.3rem",
                              }}
                            >
                              Password
                            </label>
                            <input
                              className="form-input"
                              style={{ fontSize: "0.8rem" }}
                              type="password"
                              placeholder="password"
                              value={
                                authToken.split(":").slice(1).join(":") ?? ""
                              }
                              onChange={(e) =>
                                setAuthToken(
                                  (authToken.split(":")[0] ?? "") +
                                    ":" +
                                    e.target.value,
                                )
                              }
                              disabled={liveRunning}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              background: "rgba(99,102,241,0.06)",
                              border: "1px solid rgba(99,102,241,0.15)",
                              borderRadius: 5,
                              padding: "0.3rem 0.5rem",
                            }}
                          >
                            Adds:{" "}
                            <code style={{ color: "var(--accent-light)" }}>
                              Authorization: Basic &lt;base64(user:pass)&gt;
                            </code>
                          </div>
                        </div>
                      )}

                      {authType === "apikey" && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "0.5rem",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                                display: "block",
                                marginBottom: "0.3rem",
                              }}
                            >
                              Header Name
                            </label>
                            <input
                              className="form-input"
                              style={{ fontSize: "0.8rem" }}
                              placeholder="X-Api-Key"
                              value={apiKeyHeader}
                              onChange={(e) => setApiKeyHeader(e.target.value)}
                              disabled={liveRunning}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: "0.7rem",
                                fontWeight: 600,
                                color: "var(--text-muted)",
                                display: "block",
                                marginBottom: "0.3rem",
                              }}
                            >
                              API Key
                            </label>
                            <input
                              className="form-input"
                              style={{
                                fontSize: "0.8rem",
                                fontFamily: "var(--font-mono)",
                              }}
                              placeholder="your-api-key-here"
                              value={authToken}
                              onChange={(e) => setAuthToken(e.target.value)}
                              disabled={liveRunning}
                            />
                          </div>
                          <div
                            style={{
                              fontSize: "0.7rem",
                              color: "var(--text-muted)",
                              background: "rgba(99,102,241,0.06)",
                              border: "1px solid rgba(99,102,241,0.15)",
                              borderRadius: 5,
                              padding: "0.3rem 0.5rem",
                            }}
                          >
                            Adds:{" "}
                            <code style={{ color: "var(--accent-light)" }}>
                              {apiKeyHeader || "X-Api-Key"}: &lt;key&gt;
                            </code>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* BODY TAB */}
                  {reqTab === "body" && (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.75rem",
                      }}
                    >
                      {selectedEndpoint &&
                      ["GET", "DELETE", "HEAD"].includes(
                        selectedEndpoint.httpMethod.toUpperCase(),
                      ) ? (
                        <div
                          style={{
                            padding: "0.75rem",
                            background: "rgba(255,200,0,0.05)",
                            border: "1px solid rgba(255,200,0,0.2)",
                            borderRadius: "var(--radius)",
                            fontSize: "0.75rem",
                            color: "var(--text-muted)",
                          }}
                        >
                          ⚠{" "}
                          <strong>
                            {selectedEndpoint.httpMethod.toUpperCase()}
                          </strong>{" "}
                          requests typically have no body. You can still set one
                          if your API requires it.
                        </div>
                      ) : null}
                      <div>
                        <label
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            display: "block",
                            marginBottom: "0.4rem",
                          }}
                        >
                          Content-Type
                        </label>
                        <select
                          className="form-input"
                          style={{ fontSize: "0.8rem" }}
                          value={contentType}
                          onChange={(e) => setContentType(e.target.value)}
                          disabled={liveRunning}
                        >
                          <option value="application/json">
                            application/json
                          </option>
                          <option value="application/x-www-form-urlencoded">
                            application/x-www-form-urlencoded
                          </option>
                          <option value="text/plain">text/plain</option>
                          <option value="application/xml">
                            application/xml
                          </option>
                          <option value="text/xml">text/xml (SOAP)</option>
                          <option value="multipart/form-data">
                            multipart/form-data
                          </option>
                        </select>
                      </div>
                      <div>
                        <label
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                            display: "block",
                            marginBottom: "0.4rem",
                          }}
                        >
                          Body
                        </label>
                        <textarea
                          className="form-input"
                          style={{
                            fontSize: "0.78rem",
                            fontFamily: "var(--font-mono)",
                            minHeight: 160,
                            resize: "vertical",
                            lineHeight: 1.55,
                          }}
                          value={requestPayload}
                          onChange={(e) => setRequestPayload(e.target.value)}
                          disabled={liveRunning}
                          placeholder={
                            contentType === "application/json"
                              ? '{\n  "key": "value"\n}'
                              : contentType ===
                                  "application/x-www-form-urlencoded"
                                ? "key1=value1&key2=value2"
                                : contentType === "application/xml"
                                  ? "<root>\n  <key>value</key>\n</root>"
                                  : contentType === "text/xml"
                                    ? '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ws="http://example.com/ws">\n  <soapenv:Header/>\n  <soapenv:Body>\n    <ws:YourOperation>\n      <ws:param>value</ws:param>\n    </ws:YourOperation>\n  </soapenv:Body>\n</soapenv:Envelope>'
                                    : ""
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right — live stats (when active) + always-visible params/headers */}
              <div
                style={{
                  padding: "1.25rem",
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: "1.25rem",
                }}
              >
                {/* ═══ SOAP Configuration Panel ═══ */}
                {isSoap && selectedEndpoint && (
                  <SoapConfigPanel
                    endpoint={selectedEndpoint}
                    requestPayload={requestPayload}
                  />
                )}

                {/* ═══ Struts Configuration Panel ═══ */}
                {isStruts && selectedEndpoint && (
                  <StrutsConfigPanel
                    endpoint={selectedEndpoint}
                    requestPayload={requestPayload}
                  />
                )}

                {/* ═══ REST / Default Params + Headers Panel ═══ */}
                {!isSoap && !isStruts && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "1rem",
                    }}
                  >
                    {/* Path Variables */}
                    {derivedPathParams.length > 0 && (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                            marginBottom: "0.5rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            Path Variables
                          </span>
                          <span
                            style={{
                              fontSize: "0.65rem",
                              background: "rgba(139,92,246,0.15)",
                              color: "#a78bfa",
                              borderRadius: 9,
                              padding: "0 5px",
                              lineHeight: "1.5",
                            }}
                          >
                            auto-detected
                          </span>
                        </div>
                        <div
                          style={{
                            border: "1px solid var(--border)",
                            borderRadius: "var(--radius)",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "1fr 1fr",
                              background: "rgba(255,255,255,0.03)",
                              borderBottom: "1px solid var(--border)",
                              padding: "0.25rem 0.75rem",
                              fontSize: "0.68rem",
                              color: "var(--text-muted)",
                              fontWeight: 600,
                              textTransform: "uppercase",
                              letterSpacing: "0.05em",
                            }}
                          >
                            <span>Variable</span>
                            <span>Value</span>
                          </div>
                          {derivedPathParams.map((param, idx) => (
                            <div
                              key={param}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "1fr 1fr",
                                gap: "0.5rem",
                                padding: "0.35rem 0.75rem",
                                alignItems: "center",
                                borderBottom:
                                  idx < derivedPathParams.length - 1
                                    ? "1px solid var(--border)"
                                    : "none",
                                background: "rgba(255,255,255,0.015)",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.75rem",
                                  fontFamily: "var(--font-mono)",
                                  color: "#a78bfa",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "0.25rem",
                                }}
                              >
                                <span style={{ opacity: 0.5 }}>{"{"}</span>
                                {param}
                                <span style={{ opacity: 0.5 }}>{"}"}</span>
                              </span>
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.5rem",
                                }}
                                placeholder="value"
                                value={pathParamValues[param] ?? ""}
                                disabled={liveRunning}
                                onChange={(e) =>
                                  setPathParamValues((prev) => ({
                                    ...prev,
                                    [param]: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Query Params */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            Query Params
                          </span>
                          {queryParamRows.filter((r) => r.enabled && r.key)
                            .length > 0 && (
                            <span
                              style={{
                                fontSize: "0.62rem",
                                background: "var(--accent)",
                                color: "#fff",
                                borderRadius: "9px",
                                padding: "0 5px",
                                lineHeight: "1.5",
                                fontWeight: 700,
                              }}
                            >
                              {
                                queryParamRows.filter((r) => r.enabled && r.key)
                                  .length
                              }
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            setQueryParamRows((prev) => [
                              ...prev,
                              { key: "", val: "", enabled: true },
                            ])
                          }
                          disabled={liveRunning}
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--accent-light)",
                            background: "rgba(99,102,241,0.1)",
                            border: "1px solid rgba(99,102,241,0.25)",
                            borderRadius: 5,
                            padding: "0.15rem 0.5rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      <div
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "22px 1fr 1fr 24px",
                            background: "rgba(255,255,255,0.03)",
                            borderBottom: "1px solid var(--border)",
                            padding: "0.25rem 0.6rem",
                            fontSize: "0.68rem",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <span />
                          <span>Key</span>
                          <span>Value</span>
                          <span />
                        </div>
                        {queryParamRows.length === 0 ? (
                          <div
                            style={{
                              padding: "0.65rem",
                              textAlign: "center",
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            No params — click "+ Add" to add one
                          </div>
                        ) : (
                          queryParamRows.map((row, i) => (
                            <div
                              key={i}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "22px 1fr 1fr 24px",
                                gap: "0.4rem",
                                alignItems: "center",
                                padding: "0.3rem 0.6rem",
                                borderBottom:
                                  i < queryParamRows.length - 1
                                    ? "1px solid var(--border)"
                                    : "none",
                                opacity: row.enabled ? 1 : 0.5,
                                transition: "opacity 0.15s",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) =>
                                  setQueryParamRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, enabled: e.target.checked }
                                        : r,
                                    ),
                                  )
                                }
                                style={{
                                  accentColor: "var(--accent)",
                                  width: 13,
                                  height: 13,
                                  cursor: "pointer",
                                }}
                              />
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.45rem",
                                }}
                                placeholder="key"
                                value={row.key}
                                disabled={liveRunning}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setQueryParamRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, key: v } : r,
                                    ),
                                  );
                                }}
                              />
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.45rem",
                                }}
                                placeholder="value"
                                value={row.val}
                                disabled={liveRunning}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setQueryParamRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, val: v } : r,
                                    ),
                                  );
                                }}
                              />
                              <button
                                onClick={() =>
                                  setQueryParamRows((prev) =>
                                    prev.filter((_, j) => j !== i),
                                  )
                                }
                                disabled={liveRunning}
                                title="Remove"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "rgba(239,68,68,0.6)",
                                  cursor: "pointer",
                                  padding: 2,
                                  fontSize: "1rem",
                                  lineHeight: 1,
                                  borderRadius: 3,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      {queryParamRows.length > 0 && (
                        <button
                          onClick={() =>
                            setQueryParamRows((prev) => [
                              ...prev,
                              { key: "", val: "", enabled: true },
                            ])
                          }
                          disabled={liveRunning}
                          style={{
                            marginTop: "0.4rem",
                            width: "100%",
                            fontSize: "0.72rem",
                            color: "var(--text-muted)",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px dashed var(--border)",
                            borderRadius: "var(--radius)",
                            padding: "0.3rem",
                            cursor: "pointer",
                          }}
                        >
                          + Add Query Param
                        </button>
                      )}
                    </div>

                    {/* Custom Headers */}
                    <div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: "0.5rem",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "0.7rem",
                              fontWeight: 700,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            Custom Headers
                          </span>
                          {headerRows.filter((r) => r.enabled && r.key).length >
                            0 && (
                            <span
                              style={{
                                fontSize: "0.62rem",
                                background: "var(--accent)",
                                color: "#fff",
                                borderRadius: "9px",
                                padding: "0 5px",
                                lineHeight: "1.5",
                                fontWeight: 700,
                              }}
                            >
                              {
                                headerRows.filter((r) => r.enabled && r.key)
                                  .length
                              }
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() =>
                            setHeaderRows((prev) => [
                              ...prev,
                              { key: "", val: "", enabled: true },
                            ])
                          }
                          disabled={liveRunning}
                          style={{
                            fontSize: "0.7rem",
                            color: "var(--accent-light)",
                            background: "rgba(99,102,241,0.1)",
                            border: "1px solid rgba(99,102,241,0.25)",
                            borderRadius: 5,
                            padding: "0.15rem 0.5rem",
                            cursor: "pointer",
                            fontWeight: 600,
                          }}
                        >
                          + Add
                        </button>
                      </div>
                      <div
                        style={{
                          border: "1px solid var(--border)",
                          borderRadius: "var(--radius)",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "22px 1fr 1fr 24px",
                            background: "rgba(255,255,255,0.03)",
                            borderBottom: "1px solid var(--border)",
                            padding: "0.25rem 0.6rem",
                            fontSize: "0.68rem",
                            color: "var(--text-muted)",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                            alignItems: "center",
                            gap: "0.4rem",
                          }}
                        >
                          <span />
                          <span>Header</span>
                          <span>Value</span>
                          <span />
                        </div>
                        {headerRows.length === 0 ? (
                          <div
                            style={{
                              padding: "0.65rem",
                              textAlign: "center",
                              fontSize: "0.75rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            No headers — click "+ Add" to add one
                          </div>
                        ) : (
                          headerRows.map((row, i) => (
                            <div
                              key={i}
                              style={{
                                display: "grid",
                                gridTemplateColumns: "22px 1fr 1fr 24px",
                                gap: "0.4rem",
                                alignItems: "center",
                                padding: "0.3rem 0.6rem",
                                borderBottom:
                                  i < headerRows.length - 1
                                    ? "1px solid var(--border)"
                                    : "none",
                                opacity: row.enabled ? 1 : 0.5,
                                transition: "opacity 0.15s",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={row.enabled}
                                onChange={(e) =>
                                  setHeaderRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i
                                        ? { ...r, enabled: e.target.checked }
                                        : r,
                                    ),
                                  )
                                }
                                style={{
                                  accentColor: "var(--accent)",
                                  width: 13,
                                  height: 13,
                                  cursor: "pointer",
                                }}
                              />
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.45rem",
                                }}
                                placeholder="Header-Name"
                                value={row.key}
                                disabled={liveRunning}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setHeaderRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, key: v } : r,
                                    ),
                                  );
                                }}
                              />
                              <input
                                className="form-input"
                                style={{
                                  fontSize: "0.75rem",
                                  padding: "0.25rem 0.45rem",
                                }}
                                placeholder="value"
                                value={row.val}
                                disabled={liveRunning}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setHeaderRows((prev) =>
                                    prev.map((r, j) =>
                                      j === i ? { ...r, val: v } : r,
                                    ),
                                  );
                                }}
                              />
                              <button
                                onClick={() =>
                                  setHeaderRows((prev) =>
                                    prev.filter((_, j) => j !== i),
                                  )
                                }
                                disabled={liveRunning}
                                title="Remove"
                                style={{
                                  background: "none",
                                  border: "none",
                                  color: "rgba(239,68,68,0.6)",
                                  cursor: "pointer",
                                  padding: 2,
                                  fontSize: "1rem",
                                  lineHeight: 1,
                                  borderRadius: 3,
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                }}
                              >
                                ×
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                      <button
                        onClick={() =>
                          setHeaderRows((prev) => [
                            ...prev,
                            { key: "", val: "", enabled: true },
                          ])
                        }
                        disabled={liveRunning}
                        style={{
                          marginTop: "0.4rem",
                          width: "100%",
                          fontSize: "0.72rem",
                          color: "var(--text-muted)",
                          background: "rgba(255,255,255,0.03)",
                          border: "1px dashed var(--border)",
                          borderRadius: "var(--radius)",
                          padding: "0.3rem",
                          cursor: "pointer",
                        }}
                      >
                        + Add Header
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LIVE STATS PANEL — rendered below live-fire card so it never displaces params */}
      {activeTab === "apm" && liveStats && (
        <MagicCard accentColor="#f59e0b" hover={false} className="p-0">
          <div
            style={{
              padding: "0.75rem 1.25rem",
              borderBottom: "1px solid var(--border)",
              fontWeight: 700,
              fontSize: "0.85rem",
            }}
          >
            📊 Live Test Metrics
          </div>
          <div
            style={{
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {/* PLACEHOLDER — replaced immediately below */}
            <div>
              {/* Thread group summary */}
              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  flexWrap: "wrap",
                  marginBottom: "0.5rem",
                }}
              >
                {[
                  {
                    label: "Threads",
                    value: liveStats.threads ?? threads,
                  },
                  {
                    label: "Req/Thread",
                    value:
                      liveStats.requestsPerThread ??
                      Math.ceil(totalRequests / threads),
                  },
                  {
                    label: "Planned",
                    value: (
                      liveStats.plannedTotalRequests ?? totalRequests
                    ).toLocaleString(),
                  },
                  {
                    label: "Done",
                    value: liveStats.totalRequests.toLocaleString(),
                  },
                ].map(({ label, value }) => (
                  <div
                    key={label}
                    style={{
                      fontSize: "0.7rem",
                      background: "rgba(255,255,255,0.04)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      padding: "0.2rem 0.55rem",
                    }}
                  >
                    <span style={{ color: "var(--text-muted)" }}>
                      {label}:{" "}
                    </span>
                    <strong style={{ color: "var(--text-primary)" }}>
                      {value}
                    </strong>
                  </div>
                ))}
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.3rem",
                  fontSize: "0.75rem",
                }}
              >
                <span style={{ color: "var(--success)" }}>
                  ✓ {liveStats.successfulRequests.toLocaleString()} success
                </span>
                <span style={{ color: "var(--text-muted)" }}>
                  {liveStats.totalRequests.toLocaleString()} /{" "}
                  {(
                    liveStats.plannedTotalRequests ?? totalRequests
                  ).toLocaleString()}
                </span>
                <span style={{ color: "var(--danger)" }}>
                  ✗ {liveStats.failedRequests.toLocaleString()} failed
                </span>
              </div>
              {/* Overall progress (sent/planned) */}
              <div
                style={{
                  height: 6,
                  borderRadius: 3,
                  background: "rgba(255,255,255,0.06)",
                  marginBottom: 4,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    background: "var(--accent)",
                    width:
                      (liveStats.plannedTotalRequests ?? 0) > 0
                        ? `${Math.min(100, (liveStats.totalRequests / liveStats.plannedTotalRequests!) * 100)}%`
                        : "0%",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
              {/* Success vs failure bar */}
              <div
                style={{
                  height: 14,
                  borderRadius: 3,
                  overflow: "hidden",
                  background: "rgba(239,68,68,0.25)",
                  display: "flex",
                }}
              >
                <div
                  style={{
                    background: "var(--success)",
                    width:
                      liveStats.totalRequests > 0
                        ? `${(liveStats.successfulRequests / liveStats.totalRequests) * 100}%`
                        : "0%",
                    transition: "width 0.5s ease",
                  }}
                />
              </div>
            </div>

            {/* Key metrics row */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.75rem",
              }}
            >
              {[
                {
                  label: "Avg (Success)",
                  value: `${liveStats.successAvgMs}ms`,
                  color: "#3b82f6",
                  bg: "rgba(59,130,246,0.08)",
                  border: "rgba(59,130,246,0.12)",
                },
                {
                  label: "Avg (Failed)",
                  value:
                    liveStats.failedRequests > 0
                      ? `${liveStats.failedAvgMs}ms`
                      : "—",
                  color: "#ef4444",
                  bg: "rgba(239,68,68,0.08)",
                  border: "rgba(239,68,68,0.12)",
                },
                {
                  label: "Min",
                  value: `${liveStats.minResponseTimeMs}ms`,
                  color: "#22c55e",
                  bg: "rgba(34,197,94,0.08)",
                  border: "rgba(34,197,94,0.12)",
                },
                {
                  label: "Max",
                  value: `${liveStats.maxResponseTimeMs}ms`,
                  color: "#f59e0b",
                  bg: "rgba(245,158,11,0.08)",
                  border: "rgba(245,158,11,0.12)",
                },
              ].map((m) => (
                <div
                  key={m.label}
                  style={{
                    background: `linear-gradient(135deg, ${m.bg}, transparent)`,
                    borderRadius: 12,
                    padding: "0.7rem 0.85rem",
                    border: `1px solid ${m.border}`,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: `linear-gradient(90deg, ${m.color}, ${m.color}66)`,
                    }}
                  />
                  <div
                    style={{
                      fontSize: "0.65rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                      marginBottom: "0.25rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: "1.15rem",
                      color: m.color,
                      fontFamily: "var(--font-mono)",
                      letterSpacing: "-0.03em",
                    }}
                  >
                    {m.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Throughput + elapsed */}
            <div style={{ display: "flex", gap: "0.75rem" }}>
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.08), transparent)",
                  border: "1px solid rgba(99,102,241,0.12)",
                  borderRadius: 12,
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.8rem",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Throughput
                </span>
                <strong
                  style={{ color: "#818cf8", fontFamily: "var(--font-mono)" }}
                >
                  {liveStats.throughput} req/s
                </strong>
              </div>
              <div
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.08), transparent)",
                  border: "1px solid rgba(99,102,241,0.12)",
                  borderRadius: 12,
                  padding: "0.55rem 0.85rem",
                  fontSize: "0.8rem",
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span
                  style={{
                    fontSize: "0.65rem",
                    fontWeight: 700,
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Elapsed
                </span>
                <strong
                  style={{ color: "#818cf8", fontFamily: "var(--font-mono)" }}
                >
                  {liveStats.elapsedSeconds}s
                </strong>
              </div>
            </div>

            {/* Status code distribution */}
            {Object.keys(liveStats.statusCodeDistribution).length > 0 && (
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.4rem",
                  }}
                >
                  HTTP Status Codes
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.4rem",
                  }}
                >
                  {Object.entries(liveStats.statusCodeDistribution)
                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                    .map(([code, count]) => {
                      const c = parseInt(code);
                      const color =
                        c === 200
                          ? "var(--success)"
                          : c >= 500
                            ? "var(--danger)"
                            : c >= 400
                              ? "var(--warning)"
                              : c === -1
                                ? "#ef4444"
                                : "var(--text-muted)";
                      return (
                        <span
                          key={code}
                          style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: 4,
                            border: `1px solid ${color}`,
                            color,
                            fontSize: "0.75rem",
                            fontFamily: "var(--font-mono)",
                            fontWeight: 600,
                          }}
                        >
                          {code === "-1" ? "ERR" : code}:{" "}
                          {(count as number).toLocaleString()}
                        </span>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Percentiles — shown on COMPLETE */}
            {liveStats.percentiles && (
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    color: "var(--text-muted)",
                    marginBottom: "0.4rem",
                  }}
                >
                  Latency Percentiles
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(4,1fr)",
                    gap: "0.5rem",
                  }}
                >
                  {(["p50", "p90", "p95", "p99"] as const).map((p) => (
                    <div
                      key={p}
                      style={{
                        background: "rgba(255,255,255,0.03)",
                        borderRadius: "var(--radius)",
                        padding: "0.5rem",
                        border: "1px solid var(--border)",
                        textAlign: "center",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.7rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        {p.toUpperCase()}
                      </div>
                      <div
                        style={{
                          fontWeight: 700,
                          color: "var(--accent-light)",
                          fontSize: "0.95rem",
                        }}
                      >
                        {liveStats.percentiles![p]}ms
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </MagicCard>
      )}

      {/* ── Load Test Request Logs ──────────────────────────────────────── */}
      {activeTab === "apm" && (liveRunning || ltRequestLogs.length > 0) && (
        <MagicCard
          accentColor="#6366f1"
          hover={false}
          className="p-0 mt-4 overflow-hidden"
        >
          {/* Header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.75rem 1.25rem",
              borderBottom: ltLogsOpen ? "1px solid var(--border)" : "none",
              flexWrap: "wrap",
            }}
          >
            {/* Toggle */}
            <button
              onClick={() => setLtLogsOpen((o) => !o)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--text-primary)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontWeight: 700,
                fontSize: "0.88rem",
              }}
            >
              <span>{ltLogsOpen ? "▲" : "▼"}</span>
              <span>📋 Request Logs</span>
            </button>

            {ltRequestLogs.length > 0 && (
              <span
                style={{
                  background: "rgba(99,102,241,0.15)",
                  color: "var(--accent-light)",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  borderRadius: "999px",
                  padding: "0.1rem 0.55rem",
                  border: "1px solid rgba(99,102,241,0.3)",
                }}
              >
                {ltRequestLogs.length} req
              </span>
            )}

            {(() => {
              const errCount = ltRequestLogs.filter(
                (h) => h.statusCode >= 400 || h.statusCode === -1,
              ).length;
              return errCount > 0 ? (
                <span
                  style={{
                    background: "rgba(239,68,68,0.15)",
                    color: "var(--danger)",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    borderRadius: "999px",
                    padding: "0.1rem 0.55rem",
                    border: "1px solid rgba(239,68,68,0.3)",
                  }}
                >
                  {errCount} error{errCount !== 1 ? "s" : ""}
                </span>
              ) : null;
            })()}

            {liveRunning && (
              <span
                style={{
                  fontSize: "0.68rem",
                  color: "var(--accent-light)",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                }}
              >
                ● streaming
              </span>
            )}

            {/* Download buttons */}
            {ltRequestLogs.length > 0 && (
              <div
                style={{
                  marginLeft: "auto",
                  display: "flex",
                  gap: "0.5rem",
                }}
              >
                <button
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: "0.72rem" }}
                  onClick={downloadLogsAsTxt}
                >
                  ⬇ TXT
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: "0.72rem" }}
                  onClick={downloadLogsAsPdf}
                >
                  ⬇ PDF
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: "0.72rem" }}
                  onClick={() => {
                    setExpandedRows(new Set(ltRequestLogs.map((_, i) => i)));
                  }}
                >
                  Expand All
                </button>
                <button
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: "0.72rem" }}
                  onClick={() => setExpandedRows(new Set())}
                >
                  Collapse All
                </button>
              </div>
            )}
          </div>

          {ltLogsOpen && (
            <div style={{ maxHeight: 600, overflowY: "auto" }}>
              {ltRequestLogs.length === 0 ? (
                <div
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: "0.82rem",
                  }}
                >
                  Waiting for requests…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {ltRequestLogs.map((hit, idx) => {
                    const isOk = hit.statusCode >= 200 && hit.statusCode < 400;
                    const isErr =
                      hit.statusCode >= 400 || hit.statusCode === -1;
                    const isExpanded = expandedRows.has(idx);
                    const statusStr =
                      hit.statusCode === -1 ? "ERR" : String(hit.statusCode);
                    const statusColor = isOk
                      ? "var(--success)"
                      : hit.statusCode >= 400 && hit.statusCode < 500
                        ? "var(--warning)"
                        : "var(--danger)";
                    const latColor =
                      hit.durationMs > 1000
                        ? "var(--danger)"
                        : hit.durationMs > 500
                          ? "var(--warning)"
                          : "var(--success)";
                    const rowNum = ltRequestLogs.length - idx;
                    const hasDetails =
                      hit.requestUrl ||
                      hit.requestBody ||
                      hit.responseBody ||
                      hit.errorMessage;

                    return (
                      <div
                        key={idx}
                        style={{
                          borderBottom: "1px solid rgba(255,255,255,0.05)",
                          background: isErr
                            ? "rgba(239,68,68,0.03)"
                            : "transparent",
                        }}
                      >
                        {/* Summary row — always visible, click to expand */}
                        <div
                          onClick={() => {
                            if (!hasDetails) return;
                            setExpandedRows((prev) => {
                              const s = new Set(prev);
                              s.has(idx) ? s.delete(idx) : s.add(idx);
                              return s;
                            });
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "0.75rem",
                            padding: "0.5rem 1rem",
                            cursor: hasDetails ? "pointer" : "default",
                            userSelect: "none",
                            flexWrap: "wrap",
                          }}
                        >
                          {/* Expand toggle */}
                          <span
                            style={{
                              fontSize: "0.65rem",
                              color: hasDetails
                                ? "var(--text-muted)"
                                : "transparent",
                              width: 12,
                              flexShrink: 0,
                            }}
                          >
                            {hasDetails ? (isExpanded ? "▼" : "▶") : " "}
                          </span>

                          {/* Seq number */}
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.68rem",
                              color: "var(--text-muted)",
                              minWidth: 32,
                            }}
                          >
                            #{String(rowNum).padStart(3, "0")}
                          </span>

                          {/* Timestamp */}
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.72rem",
                              color: "var(--text-muted)",
                              minWidth: 88,
                            }}
                          >
                            {hit.time}
                          </span>

                          {/* Method badge */}
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              color:
                                (
                                  {
                                    GET: "#22c55e",
                                    POST: "#6366f1",
                                    PUT: "#f59e0b",
                                    DELETE: "#ef4444",
                                    PATCH: "#8b5cf6",
                                  } as Record<string, string>
                                )[hit.method] ?? "var(--text-muted)",
                              minWidth: 48,
                            }}
                          >
                            {hit.method}
                          </span>

                          {/* Path */}
                          <span
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.75rem",
                              color: "var(--text-primary)",
                              flex: 1,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={hit.requestUrl ?? hit.path}
                          >
                            {hit.path}
                          </span>

                          {/* Status + latency + result */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "0.6rem",
                              flexShrink: 0,
                            }}
                          >
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontWeight: 700,
                                color: statusColor,
                                fontSize: "0.75rem",
                              }}
                            >
                              {statusStr}
                            </span>
                            <span
                              style={{
                                fontFamily: "var(--font-mono)",
                                fontWeight: 600,
                                color: latColor,
                                fontSize: "0.75rem",
                              }}
                            >
                              {hit.durationMs}ms
                            </span>
                            <span
                              style={{
                                fontSize: "0.7rem",
                                color: isOk
                                  ? "var(--success)"
                                  : "var(--danger)",
                                fontWeight: 600,
                              }}
                            >
                              {isOk ? "✓ OK" : "✗ FAILED"}
                            </span>
                          </div>
                        </div>

                        {/* Expanded detail panel */}
                        {isExpanded && hasDetails && (
                          <div
                            style={{
                              margin: "0 1rem 0.75rem 2.5rem",
                              border: "1px solid var(--border)",
                              borderRadius: "var(--radius)",
                              overflow: "hidden",
                              fontSize: "0.75rem",
                            }}
                          >
                            {/* REQUEST section */}
                            {(hit.requestUrl ||
                              hit.requestHeaders ||
                              hit.requestBody) && (
                              <div
                                style={{
                                  borderBottom: "1px solid var(--border)",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "0.35rem 0.75rem",
                                    fontWeight: 700,
                                    fontSize: "0.68rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.07em",
                                    color: "var(--accent-light)",
                                    background: "rgba(99,102,241,0.06)",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  ↑ Request
                                </div>
                                <div style={{ padding: "0.5rem 0.75rem" }}>
                                  {hit.requestUrl && (
                                    <div
                                      style={{
                                        display: "flex",
                                        gap: "0.6rem",
                                        marginBottom: "0.3rem",
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: "var(--text-muted)",
                                          minWidth: 80,
                                          fontSize: "0.7rem",
                                        }}
                                      >
                                        URL
                                      </span>
                                      <code
                                        style={{
                                          color: "var(--accent-light)",
                                          wordBreak: "break-all",
                                        }}
                                      >
                                        {hit.requestUrl}
                                      </code>
                                    </div>
                                  )}
                                  {hit.requestHeaders &&
                                    Object.keys(hit.requestHeaders).length >
                                      0 && (
                                      <div style={{ marginTop: "0.4rem" }}>
                                        <div
                                          style={{
                                            fontSize: "0.67rem",
                                            color: "var(--text-muted)",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            marginBottom: "0.25rem",
                                          }}
                                        >
                                          Headers
                                        </div>
                                        {Object.entries(hit.requestHeaders).map(
                                          ([k, v]) => (
                                            <div
                                              key={k}
                                              style={{
                                                display: "flex",
                                                gap: "0.6rem",
                                                lineHeight: 1.6,
                                              }}
                                            >
                                              <span
                                                style={{
                                                  color: "var(--text-muted)",
                                                  minWidth: 180,
                                                  fontSize: "0.7rem",
                                                }}
                                              >
                                                {k}
                                              </span>
                                              <span
                                                style={{
                                                  fontFamily:
                                                    "var(--font-mono)",
                                                  wordBreak: "break-all",
                                                }}
                                              >
                                                {v}
                                              </span>
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    )}
                                  {hit.requestBody && (
                                    <div style={{ marginTop: "0.5rem" }}>
                                      <div
                                        style={{
                                          fontSize: "0.67rem",
                                          color: "var(--text-muted)",
                                          fontWeight: 700,
                                          textTransform: "uppercase",
                                          letterSpacing: "0.05em",
                                          marginBottom: "0.25rem",
                                        }}
                                      >
                                        Body
                                      </div>
                                      <pre
                                        style={{
                                          background: "rgba(0,0,0,0.15)",
                                          border: "1px solid var(--border)",
                                          borderRadius: 4,
                                          padding: "0.5rem 0.6rem",
                                          fontFamily: "var(--font-mono)",
                                          fontSize: "0.72rem",
                                          margin: 0,
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-all",
                                          maxHeight: 200,
                                          overflowY: "auto",
                                        }}
                                      >
                                        {hit.requestBody}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* RESPONSE section */}
                            {(hit.responseHeaders || hit.responseBody) && (
                              <div
                                style={{
                                  borderBottom:
                                    isErr && hit.errorMessage
                                      ? "1px solid var(--border)"
                                      : "none",
                                }}
                              >
                                <div
                                  style={{
                                    padding: "0.35rem 0.75rem",
                                    fontWeight: 700,
                                    fontSize: "0.68rem",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.07em",
                                    color: isOk
                                      ? "var(--success)"
                                      : "var(--danger)",
                                    background: isOk
                                      ? "rgba(34,197,94,0.05)"
                                      : "rgba(239,68,68,0.05)",
                                    borderBottom: "1px solid var(--border)",
                                  }}
                                >
                                  ↓ Response
                                </div>
                                <div style={{ padding: "0.5rem 0.75rem" }}>
                                  {hit.responseHeaders &&
                                    Object.keys(hit.responseHeaders).length >
                                      0 && (
                                      <div style={{ marginBottom: "0.4rem" }}>
                                        <div
                                          style={{
                                            fontSize: "0.67rem",
                                            color: "var(--text-muted)",
                                            fontWeight: 700,
                                            textTransform: "uppercase",
                                            letterSpacing: "0.05em",
                                            marginBottom: "0.25rem",
                                          }}
                                        >
                                          Headers
                                        </div>
                                        {Object.entries(
                                          hit.responseHeaders,
                                        ).map(([k, v]) => (
                                          <div
                                            key={k}
                                            style={{
                                              display: "flex",
                                              gap: "0.6rem",
                                              lineHeight: 1.6,
                                            }}
                                          >
                                            <span
                                              style={{
                                                color: "var(--text-muted)",
                                                minWidth: 180,
                                                fontSize: "0.7rem",
                                              }}
                                            >
                                              {k}
                                            </span>
                                            <span
                                              style={{
                                                fontFamily: "var(--font-mono)",
                                                wordBreak: "break-all",
                                              }}
                                            >
                                              {v}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  {hit.responseBody && (
                                    <div style={{ marginTop: "0.3rem" }}>
                                      <div
                                        style={{
                                          fontSize: "0.67rem",
                                          color: "var(--text-muted)",
                                          fontWeight: 700,
                                          textTransform: "uppercase",
                                          letterSpacing: "0.05em",
                                          marginBottom: "0.25rem",
                                        }}
                                      >
                                        Body
                                      </div>
                                      <pre
                                        style={{
                                          background: isErr
                                            ? "rgba(239,68,68,0.06)"
                                            : "rgba(0,0,0,0.15)",
                                          border: `1px solid ${isErr ? "rgba(239,68,68,0.2)" : "var(--border)"}`,
                                          borderRadius: 4,
                                          padding: "0.5rem 0.6rem",
                                          fontFamily: "var(--font-mono)",
                                          fontSize: "0.72rem",
                                          margin: 0,
                                          whiteSpace: "pre-wrap",
                                          wordBreak: "break-all",
                                          maxHeight: 200,
                                          overflowY: "auto",
                                          color: isErr
                                            ? "var(--danger)"
                                            : "inherit",
                                        }}
                                      >
                                        {hit.responseBody}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* ERROR section */}
                            {isErr && hit.errorMessage && (
                              <div
                                style={{
                                  padding: "0.5rem 0.75rem",
                                  background: "rgba(239,68,68,0.06)",
                                  display: "flex",
                                  alignItems: "flex-start",
                                  gap: "0.5rem",
                                }}
                              >
                                <span
                                  style={{
                                    color: "var(--danger)",
                                    flexShrink: 0,
                                  }}
                                >
                                  ⚠
                                </span>
                                <div>
                                  <div
                                    style={{
                                      fontSize: "0.67rem",
                                      fontWeight: 700,
                                      color: "var(--danger)",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.07em",
                                      marginBottom: "0.2rem",
                                    }}
                                  >
                                    Error
                                  </div>
                                  <div
                                    style={{
                                      fontSize: "0.75rem",
                                      color: "var(--danger)",
                                    }}
                                  >
                                    {hit.errorMessage}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </MagicCard>
      )}

      {/* ── Load Test History ─────────────────────────────────────────── */}
      {activeTab === "apm" && liveTestHistory.length > 0 && (
        <MagicCard accentColor="#a78bfa" hover={false} className="p-0 mt-4">
          {/* Header */}
          <button
            onClick={() => setLtHistoryOpen((o) => !o)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              background: "none",
              border: "none",
              padding: "0.85rem 1.25rem",
              cursor: "pointer",
              color: "var(--text-primary)",
              borderBottom: ltHistoryOpen
                ? "1px solid rgba(255,255,255,0.04)"
                : "none",
            }}
          >
            <div
              style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}
            >
              <span style={{ fontWeight: 700, fontSize: "0.88rem" }}>
                Load Test History
              </span>
              <span
                style={{
                  background: "rgba(99,102,241,0.15)",
                  color: "var(--accent-light)",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  borderRadius: "999px",
                  padding: "0.1rem 0.55rem",
                  border: "1px solid rgba(99,102,241,0.3)",
                }}
              >
                {liveTestHistory.length} run
                {liveTestHistory.length !== 1 ? "s" : ""}
              </span>
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
              {ltHistoryOpen ? "▲" : "▼"}
            </span>
          </button>

          {ltHistoryOpen && (
            <div style={{ overflowX: "auto" }}>
              {/* Mini trend chart */}
              {liveTestHistory.length > 1 &&
                (() => {
                  const chartData = [...liveTestHistory]
                    .reverse()
                    .map((e, i) => ({
                      run: i + 1,
                      avg: Math.round(e.successAvgMs),
                      max: Math.round(e.maxResponseTimeMs),
                      ok: e.successfulRequests,
                      fail: e.failedRequests,
                    }));
                  return (
                    <div
                      style={{
                        padding: "1rem 1.25rem 0",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: "0.4rem",
                        }}
                      >
                        Latency Trend (Avg/Max) — {liveTestHistory.length} runs
                      </div>
                      <ResponsiveContainer width="100%" height={140}>
                        <BarChart
                          data={chartData}
                          margin={{ top: 4, right: 12, left: -20, bottom: 4 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(255,255,255,0.05)"
                          />
                          <XAxis
                            dataKey="run"
                            tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                            label={{
                              value: "Run #",
                              position: "insideBottom",
                              offset: -2,
                              fontSize: 9,
                              fill: "var(--text-muted)",
                            }}
                          />
                          <YAxis
                            tick={{ fontSize: 9, fill: "var(--text-muted)" }}
                            tickFormatter={(v) => `${v}ms`}
                          />
                          <Tooltip
                            contentStyle={{
                              background: "var(--bg-secondary)",
                              border: "1px solid var(--border)",
                              borderRadius: 6,
                              fontSize: 11,
                            }}
                            formatter={(val: unknown, name: unknown) => [
                              `${val}ms`,
                              name === "avg" ? "Avg" : "Max",
                            ]}
                            labelFormatter={(i: any) => `Run #${i}`}
                          />
                          <Bar
                            dataKey="avg"
                            name="avg"
                            fill="#6366f1"
                            radius={[3, 3, 0, 0]}
                            maxBarSize={32}
                          />
                          <Bar
                            dataKey="max"
                            name="max"
                            fill="rgba(239,68,68,0.45)"
                            radius={[3, 3, 0, 0]}
                            maxBarSize={32}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                      <div
                        style={{
                          display: "flex",
                          gap: "1rem",
                          justifyContent: "center",
                          fontSize: "0.67rem",
                          color: "var(--text-muted)",
                          paddingBottom: "0.5rem",
                        }}
                      >
                        {[
                          ["#6366f1", "Avg Latency"],
                          ["rgba(239,68,68,0.7)", "Max Latency"],
                        ].map(([c, l]) => (
                          <span
                            key={l}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                            }}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                background: c,
                                display: "inline-block",
                              }}
                            />
                            {l}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              <table className="data-table">
                <thead>
                  <tr>
                    {[
                      "#",
                      "Run At",
                      "URL",
                      "Threads",
                      "Total",
                      "Success",
                      "Failed",
                      "Avg (ms)",
                      "Min",
                      "Max",
                      "P50",
                      "P90",
                      "RPS",
                      "Err %",
                      "PDF",
                    ].map((h) => (
                      <th key={h} style={{ whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {liveTestHistory.map((entry, idx) => {
                    const errPct =
                      entry.totalRequests > 0
                        ? (
                            (entry.failedRequests / entry.totalRequests) *
                            100
                          ).toFixed(1)
                        : "0.0";
                    // liveTestHistory[0]=newest → run # = total - idx gives oldest=Run#1
                    const runNumber = liveTestHistory.length - idx;
                    return (
                      <tr key={entry.id}>
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            color: "var(--accent-light)",
                          }}
                        >
                          #{runNumber}
                        </td>
                        <td
                          style={{
                            whiteSpace: "nowrap",
                            color: "var(--text-muted)",
                          }}
                        >
                          {entry.runAt}
                        </td>
                        <td
                          style={{
                            maxWidth: 200,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={entry.url}
                        >
                          <code
                            style={{
                              fontSize: "0.72rem",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {entry.url}
                          </code>
                        </td>
                        <td style={{ textAlign: "center" }}>{entry.threads}</td>
                        <td style={{ textAlign: "center" }}>
                          {entry.totalRequests}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color: "var(--success)",
                            fontWeight: 600,
                          }}
                        >
                          {entry.successfulRequests}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color:
                              entry.failedRequests > 0
                                ? "var(--danger)"
                                : "var(--text-muted)",
                            fontWeight: entry.failedRequests > 0 ? 600 : 400,
                          }}
                        >
                          {entry.failedRequests}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontWeight: 700,
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {Math.round(entry.successAvgMs)}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color: "var(--success)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {Math.round(entry.minResponseTimeMs)}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color: "var(--warning)",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {Math.round(entry.maxResponseTimeMs)}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {entry.percentiles ? entry.percentiles.p50 : "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {entry.percentiles ? entry.percentiles.p90 : "—"}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            fontFamily: "var(--font-mono)",
                          }}
                        >
                          {entry.throughput.toFixed(1)}
                        </td>
                        <td
                          style={{
                            textAlign: "center",
                            color:
                              parseFloat(errPct) > 10
                                ? "var(--danger)"
                                : parseFloat(errPct) > 0
                                  ? "#f59e0b"
                                  : "var(--text-muted)",
                            fontWeight: parseFloat(errPct) > 0 ? 700 : 400,
                          }}
                        >
                          {errPct}%
                        </td>
                        <td style={{ textAlign: "center" }}>
                          <button
                            onClick={() => downloadRunPdf(entry, runNumber)}
                            title={`Download PDF report for Run #${runNumber}`}
                            className="btn btn-outline btn-sm"
                            style={{
                              fontSize: "0.68rem",
                              padding: "0.15rem 0.5rem",
                            }}
                          >
                            📄 PDF
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </MagicCard>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ══  MONITOR TAB  ═══════════════════════════════ */}
      {/* ════════════════════════════════════════════════ */}
      {activeTab === "monitor" && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          {/* ── Config card ── */}
          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: "1.25rem 1.5rem",
              position: "relative",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: "linear-gradient(90deg, #22c55e, #4ade80)",
              }}
            />
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "1.5rem",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: 280 }}>
                <div
                  style={{
                    fontWeight: 700,
                    marginBottom: "0.4rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <Radio
                    style={{
                      width: 15,
                      height: 15,
                      color: "var(--accent-light)",
                    }}
                  />
                  Gateway Proxy Target URL
                </div>
                <p
                  style={{
                    fontSize: "0.8rem",
                    color: "var(--text-muted)",
                    marginBottom: "1rem",
                  }}
                >
                  All requests to <code>/api/gateway/{projectName}/**</code>{" "}
                  will be forwarded to this base URL.
                </p>
                <div
                  style={{
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-end",
                  }}
                >
                  <div className="form-group" style={{ flex: 1, margin: 0 }}>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      Target Base URL
                    </label>
                    <input
                      className="form-input"
                      value={monitorTargetUrl}
                      onChange={(e) => setMonitorTargetUrl(e.target.value)}
                      placeholder="http://localhost:3000"
                    />
                  </div>
                  <div className="form-group" style={{ width: 140, margin: 0 }}>
                    <label
                      style={{
                        fontSize: "0.75rem",
                        color: "var(--text-muted)",
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <span>SLA Threshold</span>
                      <strong style={{ color: "var(--warning)" }}>
                        {slaThresholdMs}ms
                      </strong>
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      min={50}
                      step={50}
                      value={slaThresholdMs}
                      onChange={(e) =>
                        setSlaThresholdMs(
                          Math.max(50, parseInt(e.target.value) || 500),
                        )
                      }
                      placeholder="500"
                    />
                  </div>
                  <button
                    className="btn btn-primary"
                    onClick={handleSaveMonitorConfig}
                    disabled={monitorSaving || !monitorTargetUrl}
                  >
                    {monitorSaving ? "Saving…" : "Save"}
                  </button>
                </div>
                {monitorSaved && (
                  <span
                    style={{
                      color: "var(--success)",
                      fontSize: "0.8rem",
                      marginTop: "0.5rem",
                      display: "block",
                    }}
                  >
                    ✓ Gateway config saved
                  </span>
                )}
              </div>

              {selectedEndpoint && monitorTargetUrl && (
                <div
                  style={{
                    minWidth: 260,
                    background: "rgba(99,102,241,0.06)",
                    border: "1px solid rgba(99,102,241,0.15)",
                    borderRadius: "var(--radius)",
                    padding: "0.85rem 1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      color: "var(--text-muted)",
                    }}
                  >
                    Proxy URL for this endpoint
                  </div>
                  <code
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--accent-light)",
                      wordBreak: "break-all",
                      lineHeight: 1.5,
                    }}
                  >
                    {getGatewayUrl(projectName!, selectedEndpoint.path)}
                  </code>
                  <button
                    className="btn btn-outline btn-sm"
                    style={{ fontSize: "0.72rem", alignSelf: "flex-start" }}
                    onClick={() => handleCopyGatewayUrl(selectedEndpoint.path)}
                  >
                    {monitorCopied ? (
                      <>
                        <CheckCircle
                          style={{ width: 12, height: 12, marginRight: 4 }}
                        />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy
                          style={{ width: 12, height: 12, marginRight: 4 }}
                        />
                        Copy URL
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Latency over time chart ── */}
          {filteredHits.length > 1 &&
            (() => {
              // Build time-series: each hit as a data point, ordered oldest→newest
              const reversed = [...filteredHits].reverse();
              const chartData = reversed.map((h, i) => ({
                i: i + 1,
                latency: h.durationMs,
                status: h.statusCode,
                source: h.source ?? "gateway",
              }));
              const maxLatency = Math.max(...chartData.map((d) => d.latency));
              return (
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 16,
                    padding: 0,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: "linear-gradient(90deg, #6366f1, #a78bfa)",
                    }}
                  />
                  <div
                    style={{
                      padding: "0.75rem 1.5rem",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        background: "linear-gradient(135deg, #e2e8f0, #818cf8)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      Latency Over Hits
                    </span>
                    <span
                      style={{
                        fontWeight: 400,
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                      }}
                    >
                      — {filteredHits.length} total requests
                    </span>
                  </div>
                  <div style={{ padding: "1rem 0.5rem 0.5rem" }}>
                    <ResponsiveContainer width="100%" height={180}>
                      <AreaChart
                        data={chartData}
                        margin={{ top: 4, right: 16, left: 0, bottom: 4 }}
                      >
                        <defs>
                          <linearGradient
                            id="latGrad"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="5%"
                              stopColor="#6366f1"
                              stopOpacity={0.35}
                            />
                            <stop
                              offset="95%"
                              stopColor="#6366f1"
                              stopOpacity={0.03}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(255,255,255,0.05)"
                        />
                        <XAxis
                          dataKey="i"
                          tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                          label={{
                            value: "Hit #",
                            position: "insideBottom",
                            offset: -2,
                            fontSize: 10,
                            fill: "var(--text-muted)",
                          }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                          tickFormatter={(v) => `${v}ms`}
                          domain={[0, Math.ceil(maxLatency * 1.15)]}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--bg-secondary)",
                            border: "1px solid var(--border)",
                            borderRadius: 6,
                            fontSize: 12,
                          }}
                          formatter={
                            ((val: unknown, _name: unknown, p: any) => [
                              `${val}ms`,
                              p?.payload?.source === "load-test"
                                ? "Load Test"
                                : "Gateway",
                            ]) as any
                          }
                          labelFormatter={(i: any) => `Hit #${i}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="latency"
                          stroke="#6366f1"
                          strokeWidth={2}
                          fill="url(#latGrad)"
                          dot={(props: any) => {
                            const { cx, cy, payload } = props;
                            const isErr =
                              payload.status >= 400 || payload.status === -1;
                            const isLt = payload.source === "load-test";
                            const color = isErr
                              ? "#ef4444"
                              : isLt
                                ? "#f59e0b"
                                : "#22c55e";
                            return (
                              <circle
                                key={`dot-${props.index}`}
                                cx={cx}
                                cy={cy}
                                r={3}
                                fill={color}
                                stroke="none"
                              />
                            );
                          }}
                          activeDot={{ r: 5, fill: "#6366f1" }}
                          isAnimationActive={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                    <div
                      style={{
                        display: "flex",
                        gap: "1rem",
                        justifyContent: "center",
                        fontSize: "0.68rem",
                        color: "var(--text-muted)",
                        paddingTop: "0.3rem",
                      }}
                    >
                      {[
                        ["#22c55e", "Gateway (2xx)"],
                        ["#f59e0b", "Load Test"],
                        ["#ef4444", "Error (4xx/5xx)"],
                      ].map(([c, l]) => (
                        <span
                          key={l}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                          }}
                        >
                          <span
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: c,
                              display: "inline-block",
                            }}
                          />
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

          {/* ── Live stats panel ── */}
          {filteredHits.length > 0 &&
            (() => {
              const successHits = filteredHits.filter(
                (h) => h.statusCode >= 200 && h.statusCode < 400,
              );
              const errorHits = filteredHits.filter(
                (h) => h.statusCode >= 400 || h.statusCode === -1,
              );
              const n = filteredHits.length;
              const ns = successHits.length;
              // Sort success hits for p50/p90/min/max (matching liveStats which excludes errors)
              const sortedS = [...successHits].sort(
                (a, b) => a.durationMs - b.durationMs,
              );
              const successDuration = successHits.reduce(
                (s, h) => s + h.durationMs,
                0,
              );
              const avgMs = ns > 0 ? Math.round(successDuration / ns) : 0;
              const minMs = ns > 0 ? sortedS[0].durationMs : 0;
              const maxMs = ns > 0 ? sortedS[ns - 1].durationMs : 0;
              const p50 = ns > 0 ? sortedS[Math.floor(ns * 0.5)].durationMs : 0;
              const p90 =
                ns > 0
                  ? sortedS[Math.min(Math.floor(ns * 0.9), ns - 1)].durationMs
                  : 0;
              const errRate = ((errorHits.length / n) * 100).toFixed(1);
              const stats = [
                {
                  label: "Total Hits",
                  value: n.toLocaleString(),
                  color: "var(--accent-light)",
                },
                {
                  label: "Avg (success)",
                  value: ns > 0 ? `${avgMs}ms` : "N/A",
                  color:
                    avgMs > 1000
                      ? "var(--danger)"
                      : avgMs > 500
                        ? "var(--warning)"
                        : "var(--success)",
                },
                {
                  label: "Min",
                  value: ns > 0 ? `${minMs}ms` : "N/A",
                  color: "var(--success)",
                },
                {
                  label: "Max",
                  value: ns > 0 ? `${maxMs}ms` : "N/A",
                  color:
                    maxMs > 1000
                      ? "var(--danger)"
                      : maxMs > 500
                        ? "var(--warning)"
                        : "var(--success)",
                },
                {
                  label: "P50",
                  value: ns > 0 ? `${p50}ms` : "N/A",
                  color: p50 > 500 ? "var(--warning)" : "var(--success)",
                },
                {
                  label: "P90",
                  value: ns > 0 ? `${p90}ms` : "N/A",
                  color:
                    p90 > 1000
                      ? "var(--danger)"
                      : p90 > 500
                        ? "var(--warning)"
                        : "var(--success)",
                },
                {
                  label: "Errors",
                  value: String(errorHits.length),
                  color:
                    errorHits.length > 0 ? "var(--danger)" : "var(--success)",
                },
                {
                  label: "Error Rate",
                  value: `${errRate}%`,
                  color:
                    errorHits.length > 0 ? "var(--danger)" : "var(--success)",
                },
              ];
              return (
                <div
                  style={{
                    background: "var(--bg-card)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    borderRadius: 16,
                    padding: 0,
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      right: 0,
                      height: 2,
                      background: "linear-gradient(90deg, #22c55e, #4ade80)",
                    }}
                  />
                  <div
                    style={{
                      padding: "0.75rem 1.5rem",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                      fontWeight: 700,
                      fontSize: "0.85rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <span
                      style={{
                        background: "linear-gradient(135deg, #e2e8f0, #22c55e)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                      }}
                    >
                      Live Request Stats
                    </span>
                    {selectedEndpoint && (
                      <span
                        style={{
                          fontWeight: 400,
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                        }}
                      >
                        —{" "}
                        <code style={{ color: "var(--accent-light)" }}>
                          {selectedEndpoint.path}
                        </code>
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 0,
                    }}
                  >
                    {stats.map((s, i) => (
                      <div
                        key={s.label}
                        style={{
                          padding: "1rem 1.25rem",
                          borderRight:
                            (i + 1) % 4 !== 0
                              ? "1px solid rgba(255,255,255,0.04)"
                              : "none",
                          borderBottom:
                            i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none",
                          textAlign: "center",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "1.45rem",
                            fontWeight: 800,
                            fontFamily: "var(--font-mono)",
                            color: s.color,
                            lineHeight: 1.2,
                          }}
                        >
                          {s.value}
                        </div>
                        <div
                          style={{
                            fontSize: "0.72rem",
                            color: "var(--text-muted)",
                            marginTop: "0.3rem",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {s.label}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

          {/* ── Live hit feed ── */}

          <div
            style={{
              background: "var(--bg-card)",
              border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 16,
              padding: 0,
              overflow: "hidden",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 2,
                background: monitorConnected
                  ? "linear-gradient(90deg, #22c55e, #4ade80)"
                  : "linear-gradient(90deg, #64748b, #94a3b8)",
              }}
            />
            <div
              style={{
                padding: "1rem 1.5rem",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                }}
              >
                <Radio
                  style={{
                    width: 16,
                    height: 16,
                    color: monitorConnected
                      ? "var(--success)"
                      : "var(--text-muted)",
                  }}
                />
                Real-Time Hit Stream
                {selectedEndpoint && (
                  <span
                    style={{
                      fontWeight: 400,
                      fontSize: "0.75rem",
                      color: "var(--text-muted)",
                      marginLeft: "0.35rem",
                    }}
                  >
                    —{" "}
                    <code style={{ color: "var(--accent-light)" }}>
                      {selectedEndpoint.path}
                    </code>
                  </span>
                )}
                {(() => {
                  const slaBreaches = filteredHits.filter(
                    (h) => h.durationMs > slaThresholdMs && h.statusCode !== -1,
                  ).length;
                  return slaBreaches > 0 ? (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 700,
                        background: "rgba(239,68,68,0.15)",
                        color: "var(--danger)",
                        border: "1px solid rgba(239,68,68,0.35)",
                        borderRadius: 4,
                        padding: "0.1rem 0.5rem",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ⚠ {slaBreaches} SLA breach{slaBreaches !== 1 ? "es" : ""}{" "}
                      &gt;{slaThresholdMs}ms
                    </span>
                  ) : filteredHits.length > 0 ? (
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 600,
                        background: "rgba(34,197,94,0.1)",
                        color: "var(--success)",
                        border: "1px solid rgba(34,197,94,0.25)",
                        borderRadius: 4,
                        padding: "0.1rem 0.5rem",
                      }}
                    >
                      ✓ All within SLA
                    </span>
                  ) : null;
                })()}
              </div>
              {filteredHits.length > 0 && (
                <button
                  className="btn btn-outline btn-sm"
                  style={{ fontSize: "0.75rem" }}
                  onClick={() => {
                    setMonitorHits([]);
                    if (projectName) clearMonitorHits(projectName);
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {filteredHits.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem",
                  color: "var(--text-muted)",
                }}
              >
                <Radio
                  style={{
                    width: 40,
                    height: 40,
                    opacity: 0.3,
                    display: "inline-block",
                    marginBottom: "1rem",
                  }}
                />
                <p>No hits recorded yet.</p>
                <p style={{ fontSize: "0.8rem" }}>
                  Route real traffic through the Gateway URL — or start a Load
                  Test from the APM tab to see hits appear here instantly.
                </p>
              </div>
            ) : (
              <div
                ref={monitorLogRef}
                style={{ maxHeight: 460, overflowY: "auto" }}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      {[
                        "Method",
                        "Path",
                        "Status",
                        "Latency",
                        "Time",
                        "Source",
                      ].map((h) => (
                        <th key={h}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHits.map((hit, idx) => {
                      const isSuccess =
                        hit.statusCode >= 200 && hit.statusCode < 300;
                      const isWarn =
                        hit.statusCode >= 400 && hit.statusCode < 500;
                      const statusColor = isSuccess
                        ? "var(--success)"
                        : isWarn
                          ? "var(--warning)"
                          : "var(--danger)";
                      const isSlaBreached =
                        hit.durationMs > slaThresholdMs &&
                        hit.statusCode !== -1;
                      const methodColors: Record<string, string> = {
                        GET: "#22c55e",
                        POST: "#6366f1",
                        PUT: "#f59e0b",
                        DELETE: "#ef4444",
                        PATCH: "#8b5cf6",
                      };
                      return (
                        <tr
                          key={idx}
                          style={{
                            background: isSlaBreached
                              ? "rgba(239,68,68,0.06)"
                              : hit.source === "load-test"
                                ? "rgba(99,102,241,0.04)"
                                : idx === 0
                                  ? "rgba(99,102,241,0.06)"
                                  : undefined,
                          }}
                        >
                          <td>
                            <span
                              style={{
                                fontWeight: 700,
                                fontFamily: "var(--font-mono)",
                                fontSize: "0.75rem",
                                color:
                                  methodColors[hit.method] ??
                                  "var(--text-muted)",
                              }}
                            >
                              {hit.method}
                            </span>
                          </td>
                          <td
                            style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.78rem",
                              maxWidth: 320,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {hit.path}
                          </td>
                          <td>
                            <span
                              style={{
                                fontWeight: 700,
                                color: statusColor,
                                fontFamily: "var(--font-mono)",
                              }}
                            >
                              {hit.statusCode === -1 ? "ERR" : hit.statusCode}
                            </span>
                          </td>
                          <td
                            style={{
                              color:
                                hit.durationMs > 1000
                                  ? "var(--danger)"
                                  : hit.durationMs > 500
                                    ? "var(--warning)"
                                    : "var(--success)",
                              fontWeight: 600,
                              fontFamily: "var(--font-mono)",
                            }}
                          >
                            {hit.durationMs}ms
                            {isSlaBreached && (
                              <span
                                style={{
                                  marginLeft: "0.35rem",
                                  fontSize: "0.6rem",
                                  fontWeight: 700,
                                  color: "var(--danger)",
                                  background: "rgba(239,68,68,0.12)",
                                  border: "1px solid rgba(239,68,68,0.3)",
                                  borderRadius: 3,
                                  padding: "0 4px",
                                  verticalAlign: "middle",
                                }}
                              >
                                ⚠ SLA
                              </span>
                            )}
                          </td>
                          <td
                            style={{
                              color: "var(--text-muted)",
                              fontFamily: "var(--font-mono)",
                              fontSize: "0.75rem",
                            }}
                          >
                            {hit.time}
                          </td>
                          <td>
                            {hit.source === "load-test" ? (
                              <span
                                className="badge badge-running"
                                style={{ fontSize: "0.62rem" }}
                              >
                                ⚡ Load Test
                              </span>
                            ) : (
                              <span
                                className="badge badge-complete"
                                style={{ fontSize: "0.62rem" }}
                              >
                                Gateway
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════ */}
      {/* ══  LOAD TEST TAB (hidden/legacy)  ════════════ */}
      {/* ════════════════════════════════════════════════ */}
      {false && (
        <div
          style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1.5rem",
            }}
          >
            {/* Configuration form */}
            <div className="card" style={{ padding: "1.5rem" }}>
              <h3
                style={{
                  fontSize: "0.9rem",
                  fontWeight: 700,
                  marginBottom: "1.25rem",
                }}
              >
                <Zap
                  style={{
                    width: 16,
                    height: 16,
                    marginRight: 6,
                    verticalAlign: "text-bottom",
                    color: "var(--accent-light)",
                  }}
                />
                Test Configuration
              </h3>
              <div className="form-group">
                <label>Target Environment URL</label>
                <input
                  className="form-input"
                  value={environmentUrl}
                  onChange={(e: any) => setEnvironmentUrl(e.target.value)}
                />
              </div>
              <div
                style={{
                  marginBottom: "1rem",
                  padding: "0.6rem 0.75rem",
                  background: "rgba(99,102,241,0.08)",
                  borderRadius: "var(--radius)",
                  border: "1px solid rgba(99,102,241,0.15)",
                  fontSize: "0.75rem",
                  fontFamily: "var(--font-mono)",
                  color: "var(--accent-light)",
                  wordBreak: "break-all",
                }}
              >
                → {selectedEndpoint?.httpMethod} {getResolvedUrl()}
              </div>
              <div className="form-group">
                <label>Authorization (JWT / Bearer)</label>
                <input
                  className="form-input"
                  value={authToken}
                  onChange={(e: any) => setAuthToken(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div className="form-group">
                <label>Request JSON Payload</label>
                <textarea
                  className="form-input"
                  style={{
                    minHeight: 100,
                    fontFamily: "var(--font-mono)",
                    fontSize: "0.8rem",
                    resize: "vertical",
                  }}
                  value={requestPayload}
                  onChange={(e: any) => setRequestPayload(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label>Concurrent Hits ({totalHits})</label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={totalHits}
                  onChange={(e: any) => setTotalHits(parseInt(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--accent)" }}
                />
              </div>
              <button
                type="button"
                className="btn btn-danger"
                style={{
                  width: "100%",
                  justifyContent: "center",
                  marginTop: "0.5rem",
                }}
                onClick={handleTest}
                disabled={testing}
              >
                {testing
                  ? `Executing... (${testElapsed}s)`
                  : `Initiate Load Test (${totalHits} Hits)`}
              </button>
              {testStatus && (
                <div
                  style={{
                    marginTop: "0.75rem",
                    padding: "0.6rem 0.75rem",
                    background: testStatus!.startsWith("✓")
                      ? "rgba(34,197,94,0.1)"
                      : "rgba(239,68,68,0.1)",
                    border: `1px solid ${testStatus!.startsWith("✓") ? "rgba(34,197,94,0.25)" : "rgba(239,68,68,0.25)"}`,
                    borderRadius: "var(--radius)",
                    fontSize: "0.8rem",
                    color: testStatus!.startsWith("✓")
                      ? "var(--success)"
                      : "var(--danger)",
                    fontWeight: 600,
                  }}
                >
                  {testStatus}
                </div>
              )}
            </div>

            {/* Results pane */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
            >
              {!latestRun ? (
                <div
                  className="card"
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <div className="empty-state" style={{ padding: "2rem" }}>
                    <TrendingUp
                      style={{
                        width: 40,
                        height: 40,
                        color: "var(--text-muted)",
                        marginBottom: "1rem",
                        opacity: 0.4,
                        display: "inline-block",
                      }}
                    />
                    <h3>No test results yet</h3>
                    <p>
                      Configure and run a load test to see latency distribution
                      and success metrics here.
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="card-grid"
                    style={{ gridTemplateColumns: "1fr 1fr" }}
                  >
                    <div className="card stat-card">
                      <div className="stat-label">Avg Latency</div>
                      <div
                        className="stat-value"
                        style={{
                          color: "var(--accent-light)",
                          fontSize: "1.75rem",
                        }}
                      >
                        {latestRun!.averageLatencyMs}ms
                      </div>
                    </div>
                    <div
                      className={`card stat-card ${latestRun!.successfulHits > 0 ? "success" : "danger"}`}
                    >
                      <div className="stat-label">Success / Failed</div>
                      <div
                        className="stat-value"
                        style={{ fontSize: "1.5rem" }}
                      >
                        <span style={{ color: "var(--success)" }}>
                          {latestRun!.successfulHits}
                        </span>
                        <span
                          style={{
                            color: "var(--text-muted)",
                            margin: "0 0.3rem",
                          }}
                        >
                          /
                        </span>
                        <span style={{ color: "var(--danger)" }}>
                          {latestRun!.failedHits}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="card" style={{ flex: 1, padding: 0 }}>
                    <div
                      style={{
                        padding: "1rem 1.25rem",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <h4
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: "var(--text-muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.05em",
                          margin: 0,
                        }}
                      >
                        Hit Distribution
                      </h4>
                    </div>
                    <div style={{ padding: "1rem" }}>
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart
                          data={latestRun!.hitLatencies.map((val, i) => ({
                            hit: `#${i + 1}`,
                            ms: val,
                          }))}
                          margin={{ top: 5, right: 10, left: -15, bottom: 0 }}
                        >
                          <XAxis
                            dataKey="hit"
                            stroke="#64748b"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                          />
                          <YAxis
                            stroke="#64748b"
                            fontSize={10}
                            tickFormatter={(v) => `${v}ms`}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(255,255,255,0.04)" }}
                            contentStyle={{
                              backgroundColor: "#1a1f2e",
                              borderColor: "#334155",
                              borderRadius: 8,
                              color: "#e2e8f0",
                              fontSize: "0.8rem",
                            }}
                          />
                          <Bar
                            dataKey="ms"
                            fill="#ef4444"
                            radius={[4, 4, 0, 0]}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Toast notification ── */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.75rem",
            right: "1.75rem",
            zIndex: 9999,
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            padding: "1rem 1.25rem",
            borderRadius: "var(--radius-md)",
            background:
              toast.type === "success"
                ? "rgba(22,163,74,0.15)"
                : "rgba(220,38,38,0.15)",
            border: `1px solid ${toast.type === "success" ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.4)"}`,
            backdropFilter: "blur(8px)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            maxWidth: 380,
            animation: "slideUp 0.2s ease",
          }}
        >
          {toast.type === "success" ? (
            <CheckCircle
              style={{
                width: 18,
                height: 18,
                color: "var(--success)",
                flexShrink: 0,
                marginTop: 1,
              }}
            />
          ) : (
            <AlertCircle
              style={{
                width: 18,
                height: 18,
                color: "var(--danger)",
                flexShrink: 0,
                marginTop: 1,
              }}
            />
          )}
          <span
            style={{
              fontSize: "0.85rem",
              color: "var(--text-primary)",
              lineHeight: 1.5,
              flex: 1,
            }}
          >
            {toast.message}
          </span>
          <button
            onClick={() => setToast(null)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 0,
              flexShrink: 0,
            }}
          >
            <X style={{ width: 15, height: 15 }} />
          </button>
        </div>
      )}
    </>
  );
};

export default ApiDashboard;
