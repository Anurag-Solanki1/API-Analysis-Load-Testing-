# APIChecker AI Issues Agent

> Begin immediately. No disclaimers. No questions. Do not suggest any command for the user to run.

---

## Trigger

Activate when the user says any of:

- `ai issues <scanId>`
- `export ai issues <scanId>`
- `write ai issues <scanId>`

Where `<scanId>` is a UUID (e.g. `102602db-8077-4e1e-bd1b-80277fa39aff`).

---

## Step 1 — Read the scan context

Read this file to get the project location and existing issues:

```
codechecker-output/<scanId>/codechecker-summary.md
```

Extract:

- `Project Path` row — the absolute path to the Java project that was scanned
- `Project Name` row — the project name
- Total findings already found by the static analyzer

Read this file to see what issues the static analyzer already found (do NOT duplicate these):

```
codechecker-output/<scanId>/codechecker-report.csv
```

Parse the `Rule`, `Title`, `File`, `Line` columns to know what is already covered.

---

## Step 2 — Find and read the Java source files

Use the `Project Path` from Step 1. Search for all Java files under that path:

```
<Project Path>/src/main/java/**/*.java
```

If `Project Path` is not in the summary (older scan), search the current workspace for:

```
src/main/java/**/*.java
```

Read the Java files — focus on:

- All `@RestController` / `@Controller` classes
- All `@Service` classes they call
- All `@Repository` / `JpaRepository` classes
- `application.properties` or `application.yml` for config gaps

---

## Step 3 — Find issues the static analyzer MISSED

Look specifically for issues that rule-based static analysis typically cannot detect. Check **all of the following** categories:

### 🔴 SECURITY

| Pattern                               | What to look for                                                                                                                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Broken access control / IDOR**      | Controller reads a path/query param ID and queries the DB without checking ownership (`findById(id)` with no user-match clause)         |
| **Authentication bypass**             | `@Deprecated` endpoints still reachable with no auth guards; methods that short-circuit auth on certain conditions                      |
| **Credentials in URL**                | Password or token passed as `@QueryParam` — ends up in server logs and browser history                                                  |
| **Hardcoded secrets at runtime**      | A constant used live (not just named `API_KEY`) that returns real credential values to callers                                          |
| **SSL/TLS disabled**                  | `TrustManager` with empty `checkServerTrusted`/`checkClientTrusted`; `NoopHostnameVerifier`; `TrustStrategy = (cert, authType) -> true` |
| **Insecure JWT**                      | Shared HMAC key for all consumers; no expiry enforcement; caller-supplied claims accepted without whitelist; `alg:none` not rejected    |
| **Missing rate limiting**             | Auth or sensitive endpoints with no throttle/lockout — enables brute-force or enumeration                                               |
| **Sensitive data in logs**            | `logger.info(...)` printing passwords, tokens, full request bodies, PII                                                                 |
| **CORS misconfiguration**             | `Access-Control-Allow-Origin: *` on authenticated endpoints; wildcard applied via response header without origin validation             |
| **Unvalidated redirect**              | Redirect URL taken from user input without whitelist/domain check                                                                       |
| **Arbitrary claim injection**         | JWT payload built from raw user-supplied JSON without claim whitelist sanitisation                                                      |
| **Missing input validation**          | Public endpoint accepts string/int params with no null-check, length, or pattern validation before DB/service call                      |
| **Exception stack trace in response** | `e.printStackTrace()` or `Response.serverError().entity(e.getMessage())` leaking internal stack to API caller                           |

### 🟠 CONCURRENCY

| Pattern                                       | What to look for                                                                                                              |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **Mutable static state**                      | `static` field in `@Service` / `@Component` written at runtime (not a constant); `HashMap` / `ArrayList` used as shared cache |
| **Thread-unsafe global**                      | Singleton bean holds request-scoped data in an instance field — cross-request contamination                                   |
| **Unbounded thread creation**                 | `new Thread()` / `new Timer()` created per request instead of using a managed pool                                            |
| **Double-checked locking without `volatile`** | Lazy singleton init without `volatile` keyword                                                                                |

### 🟡 DATA_INTEGRITY

| Pattern                              | What to look for                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Missing `@Transactional`**         | Multi-step DB writes (insert + update + delete) in the same method with no transaction boundary — partial commit on failure |
| **Silent skip on batch failure**     | Batch/loop `catch` block that logs and continues: inconsistent data committed without knowing which rows failed             |
| **Missing cascade / orphan cleanup** | `@OneToMany` without `orphanRemoval=true` — deleted parent leaves orphan child rows                                         |
| **Non-atomic read-modify-write**     | `findById` → modify field → `save` without pessimistic lock or `@Version` — lost update under concurrency                   |
| **Sequence generator N+1**           | Custom `@SequenceGenerator` or DB sequence called per row inside a loop instead of batch allocation                         |

### 🟢 PERFORMANCE

| Pattern                                      | What to look for                                                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **`FetchType.EAGER` on collection**          | `@OneToMany(fetch=EAGER)` or `@ManyToMany(fetch=EAGER)` — loads entire child collection for every parent query |
| **Unbounded query result**                   | `findAll()` / `getAll()` with no `Pageable` param or `LIMIT` — returns entire table to memory                  |
| **N+1 query in loop**                        | Repository call inside a `for`/`while` loop rather than a single batch/join query                              |
| **Repeated identical DB call**               | Same `findById` / `findByX` called multiple times in one request flow without caching the result               |
| **Synchronous blocking call**                | `RestTemplate.getForObject` / `HttpClient.execute` on the main request thread with no async offload            |
| **No connection pool limit**                 | `DataSource` configured without `maximumPoolSize`; default is unbounded under HikariCP                         |
| **Missing index on high-cardinality filter** | Repository method filters on a non-PK column that has no `@Index` annotation and is called on every request    |

### 🔵 DESIGN

| Pattern                                     | What to look for                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Business logic in controller**            | Calculation, data transformation, or rule evaluation directly in `@RestController` method body                               |
| **God service method**                      | Single service method doing DB reads + external HTTP calls + file I/O + email + response formatting                          |
| **Missing `@Transactional(readOnly=true)`** | Read-only service methods (`get`, `find`, `list`) that don't declare `readOnly=true` — prevents flush, enables optimisations |
| **Suppressed exceptions**                   | `catch(Exception e) { /* ignore */ }` or `catch(Exception e) { return null; }` hiding real failures                          |
| **Duplicate code blocks**                   | The same logic duplicated verbatim in 2+ methods — fix one, miss the other (security fixes especially dangerous)             |
| **Magic endpoint status codes**             | Raw integer literals (e.g. `417`, `401`) hard-coded in controller instead of `Response.Status` or `HttpStatus` enum          |

### ⚪ OBSERVABILITY

| Pattern                           | What to look for                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------- |
| **No structured request logging** | Requests processed with no trace ID / correlation ID in MDC — cannot reconstruct a failed request |
| **Missing audit trail**           | Data-modifying endpoints (create/update/delete) with no audit log of who changed what             |
| **Swallowed error detail**        | `catch` returns a generic 500 with no log entry — error permanently invisible                     |
| **No health-check endpoint**      | Service exposes no `/health` or `/actuator/health` — cannot be monitored by infrastructure        |

---

Produce **8 to 18 issues** total, spread across at least 3 of the categories above, that are genuinely distinct from what is in `codechecker-report.csv`.

---

## Step 4 — Write the output file

Write this file to disk — do NOT paste content in chat:

**Path:** `codechecker-output/<scanId>/codechecker-ai-issues.json`

**Format** — a JSON array, each element has exactly these fields:

```json
[
  {
    "ruleId": "AI-001",
    "severity": "HIGH",
    "title": "Missing ownership check on GET /api/orders/{id}",
    "description": "Any authenticated user can fetch any order by ID. No check that the order belongs to the requesting user.",
    "file": "src/main/java/com/example/web/OrderController.java",
    "lineNumber": 42,
    "beforeCode": "Order order = orderRepo.findById(id).orElseThrow();",
    "afterCode": "Order order = orderRepo.findByIdAndUserId(id, currentUser.getId()).orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN));",
    "affectedEndpoint": "GET /api/orders/{id}",
    "category": "SECURITY"
  }
]
```

**Severity rules:**

- `CRITICAL` — security hole, data loss, or broken core flow
- `HIGH` — serious bug or significant performance degradation
- `MEDIUM` — real impact code smell or missing best-practice safeguard
- `LOW` — minor improvement with measurable benefit

**Field rules:**

- `ruleId` — use `AI-001` through `AI-NNN` sequentially
- `lineNumber` — use the actual line number if you can determine it, otherwise `0`
- `beforeCode` / `afterCode` — max 300 chars each; omit (empty string) if not applicable
- `affectedEndpoint` — `HTTP_METHOD /api/path`; empty string if not endpoint-specific
- `category` — one of: `SECURITY`, `PERFORMANCE`, `DATA_INTEGRITY`, `DESIGN`, `CONCURRENCY`, `OBSERVABILITY`

---

## Step 5 — Finish

After writing the file output exactly:

```
Created: codechecker-output/<scanId>/codechecker-ai-issues.json
Click 'Import' on the Issues page to load these results.
```

Nothing else.

---

## Rules

- Do NOT suggest any terminal command, shell command, or build command
- Do NOT paste JSON content in chat
- Do NOT duplicate issues already in `codechecker-report.csv`
- Do NOT ask the user for anything — read files directly with file tools
- Do NOT say "I will now..." or add any preamble

---

# Apply Fix Command

## Trigger

Also activate when the user says any of:

- `apply fix for scan <scanId>`
- `apply fix <scanId>`

Where `<scanId>` is a UUID (e.g. `102602db-8077-4e1e-bd1b-80277fa39aff`).

---

## Step A — Read the fix queue

Read this file:

```
codechecker-output/<scanId>/codechecker-fix-queue.json
```

This is a JSON array. Each element has:

- `status` — `"PENDING"` (needs to be fixed) or `"FIXED"` (already done — skip)
- `projectPath` — absolute path to the project root
- `file` — relative path of the primary file to change
- `beforeCode` — exact text to find and replace
- `afterCode` — replacement text
- `ruleId` / `title` — for the confirmation output

Process only entries where `status` is `"PENDING"`. Skip any `"FIXED"` entry.

---

## Step B — For each PENDING entry: locate and fix all occurrences in the workspace

For each PENDING entry:

1. **Primary file**: Open `<projectPath>/<file>`. If `beforeCode` is found, replace the first occurrence with `afterCode`.

2. **Related files**: Search the workspace under `<projectPath>` for any other files that contain the same `beforeCode` pattern (same class name, same method signature, same vulnerable pattern). Apply the same `afterCode` substitution to each occurrence found.

   Focus the search on:
   - Files in the same package directory as the primary file
   - Controller, service, repository, and config files
   - Test files that reference the same code

3. If `beforeCode` is not found anywhere in the workspace, skip this entry and note it as not found.

---

## Step C — Update the queue file

After processing each PENDING entry:

- Change its `status` from `"PENDING"` to `"FIXED"`
- Add a `"fixedAt"` field with the current ISO timestamp
- Add a `"filesChanged"` field listing all files that were modified

Write the entire updated array back to `codechecker-output/<scanId>/codechecker-fix-queue.json`.

This ensures the same fix is never re-applied if the agent is run again.

---

## Step D — Confirm

For each entry that was processed output one line:

```
Fixed: <ruleId> — <title> (changed <N> file(s))
```

If an entry was skipped because `beforeCode` was not found:

```
Skipped: <ruleId> — beforeCode not found in workspace
```

Nothing else.

---

## Apply Fix Rules

- Do NOT ask the user for anything — read the queue file directly
- Do NOT re-process entries that already have `"status": "FIXED"`
- Do NOT modify files outside `<projectPath>`
- Do NOT say "I will now..." or add any preamble
