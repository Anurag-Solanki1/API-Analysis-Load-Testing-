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

The `Project Path` from Step 1 is the folder the user pointed at when running the scan — their actual Java project on disk, not the CodeChecker tool itself.

Use that path to read the source files:

```
<Project Path>/src/main/java/**/*.java
```

**Read the actual file contents** — do not infer from file names alone. Use file_search to list all `.java` files under that path, then read_file on each one to see the real code. You are looking for things that are syntactically valid Java but dangerous at runtime — things a rule-based parser cannot flag because there is no rule violation in the code itself.

If `Project Path` is not in the summary (scan was done before this field was added), try reading the absolute path from `codechecker-output/<scanId>/codechecker-summary.md` under the `Project Path` row. If still not found, search the current workspace:

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

Look specifically for issues that rule-based static analysis typically cannot detect:

| Category           | What to look for                                                                                                                                                                                         |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SECURITY**       | Missing `@PreAuthorize` / authorization checks on sensitive endpoints; IDOR (using user-supplied IDs without ownership check); hardcoded secrets or tokens; missing input validation on public endpoints |
| **DATA_INTEGRITY** | Multi-step DB writes without `@Transactional`; missing null checks before entity saves; service methods that partially update then can fail leaving inconsistent state                                   |
| **PERFORMANCE**    | `EAGER` fetch on `@OneToMany` missed by static scan; unbounded list returns with no pagination; repeated calls to the same repository inside a loop                                                      |
| **CONCURRENCY**    | Mutable shared fields in `@Service` / `@Component` (not thread-safe); `HashMap` / `ArrayList` used as shared state without synchronization                                                               |
| **DESIGN**         | Service method doing 5+ unrelated things (God method); business logic inside `@Controller` that belongs in `@Service`; missing `@Transactional(readOnly=true)` on read-only service methods              |

Produce **5 to 15 issues** that are genuinely distinct from what is in `codechecker-report.csv`.

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
- `category` — one of: `SECURITY`, `PERFORMANCE`, `DATA_INTEGRITY`, `DESIGN`, `CONCURRENCY`

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
