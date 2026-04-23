# CodeChecker — Project Health Summary

| Property | Value |
| --- | --- |
| Project | 8319382c-5fd3-48db-8df7-181cb20f1b2b |
| Scan Date | 2026-04-01 |
| Java Files | 38 |
| Total Findings | 151 |
| Diagrams Generated | 16 |

## Health Score: 0/100 — Grade: F

## Release Decision

**STATUS:** BLOCKED — critical issues must be resolved

## Issue Summary

| Severity | Count |
| --- | --- |
| CRITICAL | 4 |
| HIGH | 24 |
| MEDIUM | 76 |
| LOW | 47 |

## API Performance

| Endpoint | Method | Rating | p50 | p95 | Issues |
| --- | --- | --- | --- | --- | --- |
| /api/results/scanId | GET | FAST | ~43ms | ~107ms | 0 |
| /api/results/scanId/summary | GET | MODERATE | ~308ms | ~770ms | 0 |
| /api/results/scanId/endpoints | GET | FAST | ~53ms | ~132ms | 0 |
| /api/results/scanId/issues | GET | FAST | ~38ms | ~95ms | 0 |
| /api/diagrams/scanId | GET | MODERATE | ~148ms | ~370ms | 0 |
| /api/diagrams/scanId/filename.png | GET | FAST | ~48ms | ~120ms | 0 |
| /api/diagrams/scanId/filename.puml | GET | FAST | ~63ms | ~157ms | 0 |
| /api/scan | POST | FAST | ~53ms | ~132ms | 41 |
| /api/scan/id/status | GET | MODERATE | ~158ms | ~395ms | 0 |
| /api/scan/id | DELETE | SLOW | ~533ms | ~1332ms | 3 |
| /api/scan/history | GET | FAST | ~28ms | ~70ms | 0 |

## Top Issues

| # | Rule | Severity | Title | Affected API |
| --- | --- | --- | --- | --- |
| 1 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in checkSelectStar() | N/A |
| 2 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in checkSqlInjection() | N/A |
| 3 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in checkD6SqlInjection() | N/A |
| 4 | D11-002 | CRITICAL | permitAll() on potentially sensitive path in CodeQualityAnalyzer | N/A |
| 5 | A2-003 | HIGH | Synchronous REST call — ScanOrchestrator.runScan() | POST /api/scan |
| 6 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 7 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 8 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 9 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 10 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 11 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 12 | A2-003 | HIGH | Synchronous REST call — ProjectScanner.categorize() | POST /api/scan |
| 13 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 14 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 15 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 16 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 17 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 18 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 19 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
| 20 | A2-005 | HIGH | No timeout on REST client — RESOLVED_AT_RUNTIME | POST /api/scan |
