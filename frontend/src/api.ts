const API_BASE = "http://localhost:8081";
const WS_BASE = "ws://localhost:8081/ws";

/** Returns auth headers with JWT token from localStorage */
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("jwt");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

/** Authenticated fetch wrapper — injects JWT and handles 401s via refresh token */
async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...authHeaders(), ...(init?.headers || {}) };
  let res = await fetch(url, { ...init, headers });

  if (res.status === 401) {
    const refreshToken = localStorage.getItem("refreshToken");
    if (refreshToken) {
      try {
        const refreshRes = await fetch(`${API_BASE}/api/auth/refresh-token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken })
        });

        if (refreshRes.ok) {
          const data = await refreshRes.json();
          localStorage.setItem("jwt", data.token);
          localStorage.setItem("refreshToken", data.refreshToken);
          
          // Retry original request with new token
          const newHeaders = { ...headers, "Authorization": `Bearer ${data.token}` };
          res = await fetch(url, { ...init, headers: newHeaders });
          return res;
        }
      } catch (e) {
        // Refresh failed, fall through to logout
      }
    }
    
    // If we reach here, refresh failed or no refresh token exists
    localStorage.removeItem("jwt");
    localStorage.removeItem("refreshToken");
    if (!window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
  }
  return res;
}

/**
 * Returns a valid JWT for use in outbound requests (e.g. load tester).
 * If the stored token expires within 60 seconds it is silently refreshed first.
 * Returns null if the user is not logged in or the refresh fails.
 */
export async function getValidJwt(): Promise<string | null> {
  const jwt = localStorage.getItem("jwt");
  if (!jwt) return null;

  // Decode the exp claim from the JWT payload (no library needed — it's base64)
  try {
    const payload = JSON.parse(atob(jwt.split(".")[1]));
    const expiresAt = payload.exp * 1000; // convert to ms
    const msUntilExpiry = expiresAt - Date.now();

    // If token still has more than 60 seconds left, use it as-is
    if (msUntilExpiry > 60_000) return jwt;
  } catch {
    // Malformed token — fall through to refresh
  }

  // Token is expired or expiring soon — try to refresh it
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/api/auth/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    localStorage.setItem("jwt", data.token);
    localStorage.setItem("refreshToken", data.refreshToken);
    return data.token as string;
  } catch {
    return null;
  }
}

export interface ScanRequest {
  projectName: string;
  projectPath: string;
  outputPath?: string;
  scanMode?: string;
}

export interface ScanStatus {
  scanId: string;
  status: string;
  projectName: string;
  startedAt: string;
  completedAt?: string;
  healthScore?: number;
  grade?: string;
  totalEndpoints?: number;
  totalIssues?: number;
  criticalCount?: number;
  diagramsGenerated?: number;
}

export interface ScanSummary {
  scanId: string;
  projectName: string;
  healthScore: number | null;
  grade: string | null;
  releaseDecision: string;
  totalEndpoints: number;
  totalIssues: number;
  criticalCount: number;
  totalFiles: number;
  diagramsGenerated: number;
  startedAt: string;
  completedAt: string;
  status?: string;
  fastEndpoints: number;
  moderateEndpoints: number;
  slowEndpoints: number;
  criticalEndpoints: number;
}

export interface EndpointResult {
  httpMethod: string;
  path: string;
  controllerClass: string;
  controllerMethod: string;
  performanceRating: string;
  estimatedP50Ms: number;
  estimatedP95Ms: number;
  diagramPath: string;
  issueCount: number;
  framework: string;
}

export interface IssueResult {
  ruleId: string;
  severity: string;
  title: string;
  description: string;
  file: string;
  lineNumber: number;
  beforeCode: string;
  afterCode: string;
  autoFixed: boolean;
  affectedEndpoint: string;
  category: string;
  source?: string;
}

export interface AiStatus {
  fileExists: boolean;
  fileIssueCount: number;
  importedCount: number;
  filePath: string;
  projectPath: string | null;
  projectName: string | null;
}

export interface DiagramFile {
  name: string;
  type: string;
  path: string;
}

export interface ScanHistoryItem {
  id: string;
  projectName: string;
  projectPath: string;
  status: string;
  startedAt: string;
  completedAt: string;
  healthScore: number;
  grade: string;
  releaseDecision: string;
  totalEndpoints: number;
  totalIssues: number;
  criticalCount: number;
  totalFiles: number;
  diagramsGenerated: number;
  frameworkSummary?: string;
}

// ─── API Functions ───

export async function startScan(
  request: ScanRequest,
): Promise<{ scanId: string }> {
  const res = await apiFetch(`${API_BASE}/api/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function getScanStatus(scanId: string): Promise<ScanStatus> {
  const res = await apiFetch(`${API_BASE}/api/scan/${scanId}/status`);
  return res.json();
}

export async function stopScan(scanId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/scan/${scanId}`, { method: "DELETE" });
}

export async function getScanHistory(): Promise<ScanHistoryItem[]> {
  const res = await apiFetch(`${API_BASE}/api/scan/history`);
  return res.json();
}

export async function getScanSummary(scanId: string): Promise<ScanSummary> {
  const res = await apiFetch(`${API_BASE}/api/results/${scanId}/summary`);
  return res.json();
}

export async function getEndpoints(scanId: string): Promise<EndpointResult[]> {
  const res = await apiFetch(`${API_BASE}/api/results/${scanId}/endpoints`);
  return res.json();
}

export async function getIssues(
  scanId: string,
  severity?: string,
  category?: string,
): Promise<IssueResult[]> {
  let url = `${API_BASE}/api/results/${scanId}/issues`;
  const params = new URLSearchParams();
  if (severity) params.set("severity", severity);
  if (category) params.set("category", category);
  if (params.toString()) url += `?${params.toString()}`;
  const res = await apiFetch(url);
  return res.json();
}

export async function getDiagrams(scanId: string): Promise<DiagramFile[]> {
  const res = await apiFetch(`${API_BASE}/api/diagrams/${scanId}`);
  return res.json();
}

export function getDiagramUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function getWebSocketUrl(): string {
  return WS_BASE;
}
export interface ApiLogEntry {
  id: number;
  projectName: string;
  endpointPath: string;
  httpMethod: string;
  statusCode: number;
  durationMs: number;
  timestamp: string;
  traceLog?: string;
  importBatchId?: string;
}

export interface CwBatchSummary {
  batchId: string;
  count: number;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  importNumber: number;
}

export async function uploadCloudwatchLogs(
  projectName: string,
  logData: string,
): Promise<{
  message: string;
  count: number;
  issues: string[];
  slowCount: number;
  batchId: string;
}> {
  const params = new URLSearchParams({ projectName });
  const res = await apiFetch(`${API_BASE}/api/analytics/import?${params}`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: logData,
  });
  return res.json();
}

export async function getApiAnalytics(
  projectName: string,
  endpointPath: string,
  httpMethod: string,
): Promise<ApiLogEntry[]> {
  const params = new URLSearchParams({ projectName, endpointPath, httpMethod });
  const res = await apiFetch(`${API_BASE}/api/analytics/timeline?${params}`);
  return res.json();
}

export async function getAllProjectAnalytics(
  projectName: string,
): Promise<ApiLogEntry[]> {
  const params = new URLSearchParams({ projectName });
  const res = await apiFetch(`${API_BASE}/api/analytics/all?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function clearProjectAnalytics(
  projectName: string,
): Promise<void> {
  const params = new URLSearchParams({ projectName });
  const res = await apiFetch(`${API_BASE}/api/analytics/all?${params}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Clear failed: ${res.status}`);
}

export async function getProjectBatches(
  projectName: string,
): Promise<CwBatchSummary[]> {
  const params = new URLSearchParams({ projectName });
  const res = await apiFetch(`${API_BASE}/api/analytics/batches?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function getBatchLogs(
  projectName: string,
  batchId: string,
): Promise<ApiLogEntry[]> {
  const params = new URLSearchParams({ projectName, batchId });
  const res = await apiFetch(`${API_BASE}/api/analytics/batch?${params}`);
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function deleteBatch(batchId: string): Promise<void> {
  const params = new URLSearchParams({ batchId });
  const res = await apiFetch(`${API_BASE}/api/analytics/batch?${params}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete batch failed: ${res.status}`);
}

// ─── AI Issue Import (GitHub Copilot Agent) ───

export async function getAiStatus(scanId: string): Promise<AiStatus> {
  const res = await apiFetch(`${API_BASE}/api/ai/status/${scanId}`);
  if (!res.ok) throw new Error(`getAiStatus failed: ${res.status}`);
  return res.json();
}

export async function importAiIssues(
  scanId: string,
): Promise<{ imported: number; scanId: string }> {
  const res = await apiFetch(`${API_BASE}/api/ai/import/${scanId}`, {
    method: "POST",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Import failed: ${res.status}`,
    );
  }
  return res.json();
}

export async function deleteAiIssues(scanId: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/api/ai/issues/${scanId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`Delete AI issues failed: ${res.status}`);
}

export async function applyFix(
  scanId: string,
  filePath: string,
  beforeCode: string,
  afterCode: string,
): Promise<{ applied: boolean; file: string }> {
  const res = await apiFetch(`${API_BASE}/api/ai/apply-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scanId, filePath, beforeCode, afterCode }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      (body as { error?: string }).error ?? `Apply fix failed: ${res.status}`,
    );
  return body;
}

export async function prepareFix(
  scanId: string,
  issue: IssueResult,
): Promise<{ command: string; requestFile: string; projectPath: string }> {
  const res = await apiFetch(`${API_BASE}/api/ai/prepare-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scanId,
      ruleId: issue.ruleId,
      title: issue.title,
      file: issue.file,
      lineNumber: String(issue.lineNumber),
      beforeCode: issue.beforeCode,
      afterCode: issue.afterCode,
    }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      (body as { error?: string }).error ?? `Prepare fix failed: ${res.status}`,
    );
  return body;
}

export interface FixQueueEntry {
  status: "PENDING" | "FIXED";
  scanId: string;
  ruleId: string;
  title: string;
  file: string;
  lineNumber: string;
  beforeCode: string;
  afterCode: string;
  projectPath: string;
  queuedAt: string;
  fixedAt?: string;
  filesChanged?: string[];
}

export async function getFixQueue(scanId: string): Promise<FixQueueEntry[]> {
  const res = await apiFetch(`${API_BASE}/api/ai/fix-queue/${scanId}`);
  if (!res.ok) return [];
  return res.json();
}

export async function bulkPrepareFix(
  scanId: string,
  issues: IssueResult[],
): Promise<{ command: string; added: number; pendingCount: number }> {
  const res = await apiFetch(`${API_BASE}/api/ai/bulk-prepare-fix`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scanId,
      issues: issues.map((i) => ({
        ruleId: i.ruleId,
        title: i.title,
        file: i.file,
        lineNumber: String(i.lineNumber),
        beforeCode: i.beforeCode,
        afterCode: i.afterCode,
      })),
    }),
  });
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      (body as { error?: string }).error ??
        `Bulk prepare fix failed: ${res.status}`,
    );
  return body;
}

export async function verifyFix(
  scanId: string,
  ruleId: string,
): Promise<{ verified: boolean; ruleId: string; reason: string }> {
  const res = await apiFetch(
    `${API_BASE}/api/ai/verify-fix/${encodeURIComponent(scanId)}/${encodeURIComponent(ruleId)}`,
  );
  const body = await res.json();
  if (!res.ok)
    throw new Error(
      (body as { error?: string }).error ?? `Verify fix failed: ${res.status}`,
    );
  return body;
}
// ─── API Testing Functions ───

export interface ApiTestRequest {
  projectName: string;
  httpMethod: string;
  endpointPath: string;
  environmentUrl: string;
  /** Raw token value (no "Bearer " prefix needed for bearer type) */
  authToken?: string;
  /** "bearer" | "basic" | "apikey" | "none" */
  authType?: string;
  /** Header name used when authType="apikey", default "X-Api-Key" */
  apiKeyHeader?: string;
  requestPayload?: string;
  /** MIME type, default "application/json" */
  contentType?: string;
  /** Extra headers, e.g. { "Accept": "application/json" } */
  customHeaders?: Record<string, string>;
  /** Query params appended to the URL */
  queryParams?: Record<string, string>;
  /** Path variable substitutions, e.g. { "id": "42" } */
  pathParams?: Record<string, string>;
  totalHits: number;
  liveRunId?: string;
  maxConcurrentUsers?: number;
  /** @deprecated use rampUpIntervalSeconds */
  testDurationSeconds?: number;
  /** Seconds to wait between starting each successive thread. 0 = all start at once. */
  rampUpIntervalSeconds?: number;
  /** Seconds to wait between consecutive requests within a thread. 0 = back-to-back. */
  thinkTimeSeconds?: number;
}

export interface ApiTestRun {
  id: string;
  projectName: string;
  httpMethod: string;
  endpointPath: string;
  environmentUrl: string;
  totalHits: number;
  successfulHits: number;
  failedHits: number;
  averageLatencyMs: number;
  p90LatencyMs: number;
  startedAt: string;
  hitLatencies: number[];
}

export async function getTestProjects(): Promise<string[]> {
  const res = await apiFetch(`${API_BASE}/api/test/projects`);
  return res.json();
}

export async function getTestEndpoints(
  projectName: string,
): Promise<EndpointResult[]> {
  const params = new URLSearchParams({ projectName });
  const res = await apiFetch(`${API_BASE}/api/test/endpoints?${params}`);
  return res.json();
}

export async function runApiTest(request: ApiTestRequest): Promise<ApiTestRun> {
  const res = await apiFetch(`${API_BASE}/api/test/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

export async function getApiTestHistory(
  projectName: string,
  endpointPath: string,
  httpMethod: string,
): Promise<ApiTestRun[]> {
  const params = new URLSearchParams({ projectName, endpointPath, httpMethod });
  const res = await apiFetch(`${API_BASE}/api/test/history?${params}`);
  return res.json();
}

/** Start a live test — each hit streams via WebSocket to /topic/live-test/{liveRunId}. */
export async function startLiveTest(
  request: ApiTestRequest,
): Promise<{ runId: string; status: string }> {
  const res = await apiFetch(`${API_BASE}/api/test/run-live`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  return res.json();
}

/** Cancel a running live test. */
export async function cancelLiveTest(runId: string): Promise<void> {
  await apiFetch(`${API_BASE}/api/test/run-live/${runId}`, { method: "DELETE" });
}

export function getLiveTestWsUrl(_liveRunId: string): string {
  return `${WS_BASE}`; // subscribe to /topic/live-test/${liveRunId}
}

// ─── Gateway Monitor Functions ───────────────────────────────────────────────

export interface GatewayConfig {
  id: number;
  projectName: string;
  targetBaseUrl: string;
}

export interface GatewayHit {
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  time: string;
  projectName: string;
  /** "gateway" for real proxy hits, "load-test" for synthetic load test hits */
  source?: string;
  // Rich log fields (populated when request passes through gateway)
  requestUrl?: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  errorMessage?: string;
}

/** Get the configured target URL for a project (null if not configured). */
export async function getMonitorConfig(
  projectName: string,
): Promise<GatewayConfig | null> {
  const res = await apiFetch(
    `${API_BASE}/api/monitor/config/${encodeURIComponent(projectName)}`,
  );
  if (res.status === 404) return null;
  return res.json();
}

/** Save or update the target base URL for a project's gateway. */
export async function saveMonitorConfig(
  projectName: string,
  targetBaseUrl: string,
): Promise<GatewayConfig> {
  const res = await apiFetch(`${API_BASE}/api/monitor/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectName, targetBaseUrl }),
  });
  return res.json();
}

/** Return the last 200 gateway hits for a project (newest first). */
export async function getRecentMonitorHits(
  projectName: string,
): Promise<GatewayHit[]> {
  const res = await apiFetch(
    `${API_BASE}/api/monitor/${encodeURIComponent(projectName)}/recent`,
  );
  if (!res.ok) return [];
  return res.json();
}

/** Clear the in-memory hit buffer for a project on the backend. */
export async function clearMonitorHits(projectName: string): Promise<void> {
  await apiFetch(
    `${API_BASE}/api/monitor/${encodeURIComponent(projectName)}/hits`,
    { method: "DELETE" },
  );
}

export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}

/** Paginated hit history from the DB (up to last 7 days). */
export async function getMonitorHistory(
  projectName: string,
  page: number = 0,
  size: number = 50,
  date?: string
): Promise<PageResult<GatewayHit>> {
  const params = new URLSearchParams({
    page: page.toString(),
    size: size.toString(),
  });
  if (date) params.set("date", date);
  const res = await apiFetch(
    `${API_BASE}/api/monitor/${encodeURIComponent(projectName)}/history?${params}`
  );
  if (!res.ok) return { content: [], totalElements: 0, totalPages: 0, number: 0, size };
  return res.json();
}

/** Total number of persisted hits for a project. */
export async function getMonitorHitCount(projectName: string): Promise<number> {
  const res = await apiFetch(
    `${API_BASE}/api/monitor/${encodeURIComponent(projectName)}/history/count`
  );
  if (!res.ok) return 0;
  const data = await res.json();
  return data.count || 0;
}


/** Build the gateway proxy URL for a given endpoint path. */
export function getGatewayUrl(
  projectName: string,
  endpointPath: string,
): string {
  // Encode only characters that are illegal in a URL path segment
  // (spaces → %20, but leave slash/colon/etc. readable in the display).
  const encodedProject = projectName
    .split("")
    .map((c) =>
      /[A-Za-z0-9\-._~!$&'()*+,;=:@]/.test(c) ? c : encodeURIComponent(c),
    )
    .join("");
  return `${API_BASE}/api/gateway/${encodedProject}${endpointPath}`;
}
