# CodeChecker — Project Health Summary

| Property | Value |
| --- | --- |
| Project | f5d609b1-5839-4b81-b00d-b48254da4b79 |
| Project Name | CIN Code |
| Project Path | C:\CIN CNAX Batch Improvement\CODE |
| Scan Date | 2026-04-09 |
| Java Files | 884 |
| Total Findings | 882 |
| Diagrams Generated | 64 |

## Health Score: 0/100 — Grade: F

## Release Decision

**STATUS:** BLOCKED — critical issues must be resolved

## Issue Summary

| Severity | Count |
| --- | --- |
| CRITICAL | 37 |
| HIGH | 26 |
| MEDIUM | 352 |
| LOW | 467 |

## API Performance

| Endpoint | Method | Rating | p50 | p95 | Issues |
| --- | --- | --- | --- | --- | --- |
| /vinalcdv | GET | FAST | ~43ms | ~107ms | 0 |
| /vinhealth | GET | MODERATE | ~133ms | ~332ms | 0 |
| /Consumer | GET | FAST | ~68ms | ~170ms | 1 |
| /Consumerupdate | POST | MODERATE | ~283ms | ~707ms | 2 |
| /Consumeradd | POST | MODERATE | ~113ms | ~282ms | 1 |
| /Consumerdelete | GET | MODERATE | ~88ms | ~220ms | 0 |
| /mapbrands | GET | FAST | ~43ms | ~107ms | 0 |
| /mapbrands | PUT | MODERATE | ~83ms | ~207ms | 0 |
| /mapbrands | DELETE | MODERATE | ~83ms | ~207ms | 0 |
| /mapcars | GET | FAST | ~43ms | ~107ms | 0 |
| /mapcars | PUT | MODERATE | ~83ms | ~207ms | 0 |
| /mapcars | DELETE | MODERATE | ~83ms | ~207ms | 0 |
| /configuration | GET | MODERATE | ~83ms | ~207ms | 1 |
| /configuration | PUT | MODERATE | ~93ms | ~232ms | 2 |
| /type/languages | GET | FAST | ~58ms | ~145ms | 0 |
| /type/languagesreftech | GET | FAST | ~43ms | ~107ms | 0 |
| /mapmodels | GET | FAST | ~43ms | ~107ms | 0 |
| /mapmodels | PUT | MODERATE | ~83ms | ~207ms | 0 |
| /mapmodels | DELETE | MODERATE | ~83ms | ~207ms | 0 |
| /Servicehealth | GET | FAST | ~53ms | ~132ms | 0 |
| /Servicehealthupdate | POST | MODERATE | ~178ms | ~445ms | 0 |
| /Servicehealthadd | POST | MODERATE | ~93ms | ~232ms | 0 |
| /authentication/authenticateUsingGet | GET | SLOW | ~1048ms | ~2620ms | 6 |
| /authentication/token | POST | SLOW | ~1153ms | ~2882ms | 7 |
| /exfca-service/vehiclesearch | GET | MODERATE | ~88ms | ~220ms | 0 |
| /exfca-service/esigiVinHealth | GET | MODERATE | ~148ms | ~370ms | 0 |
| /exfca-service/esigiVisHealth | GET | MODERATE | ~148ms | ~370ms | 0 |
| /brands | GET | MODERATE | ~83ms | ~207ms | 0 |
| /brands | PUT | FAST | ~38ms | ~95ms | 0 |
| /cars | GET | MODERATE | ~103ms | ~257ms | 0 |
| /cars | PUT | FAST | ~63ms | ~157ms | 0 |
| /count | GET | FAST | ~73ms | ~182ms | 0 |
| /licenceplates | GET | MODERATE | ~108ms | ~270ms | 1 |
| /licenceplates/health | GET | MODERATE | ~288ms | ~720ms | 1 |
| /models | GET | MODERATE | ~113ms | ~282ms | 0 |
| /modelscount | GET | FAST | ~48ms | ~120ms | 0 |
| /models | PUT | FAST | ~63ms | ~157ms | 0 |
| /oereference | GET | MODERATE | ~148ms | ~370ms | 0 |
| /servicehealth | GET | SLOW | ~543ms | ~1357ms | 3 |
| / | GET | MODERATE | ~83ms | ~207ms | 0 |
| /brands | GET | MODERATE | ~83ms | ~207ms | 0 |
| /brands | PUT | FAST | ~38ms | ~95ms | 0 |
| /cars | GET | MODERATE | ~103ms | ~257ms | 0 |
| /cars | PUT | FAST | ~63ms | ~157ms | 0 |
| /count | GET | FAST | ~73ms | ~182ms | 0 |
| /models | GET | MODERATE | ~113ms | ~282ms | 0 |
| /modelscount | GET | FAST | ~43ms | ~107ms | 0 |
| /models | PUT | FAST | ~63ms | ~157ms | 0 |
| /activeContractsDAI | GET | MODERATE | ~213ms | ~532ms | 1 |
| /health/ovHealth | GET | MODERATE | ~183ms | ~457ms | 0 |
| /health/sagaiWarrantyHealth | GET | MODERATE | ~158ms | ~395ms | 1 |
| /health/sagaiContractsHealth | GET | MODERATE | ~173ms | ~432ms | 0 |
| /health/erecaHealth | GET | MODERATE | ~128ms | ~320ms | 0 |
| /health/corvetHealth | GET | MODERATE | ~203ms | ~507ms | 0 |
| /health/daiContractsHealth | GET | MODERATE | ~303ms | ~757ms | 0 |
| /health/cartellHealth | GET | MODERATE | ~158ms | ~395ms | 0 |
| /vins | GET | SLOW | ~913ms | ~2282ms | 0 |
| /vinscontracts | GET | MODERATE | ~303ms | ~757ms | 4 |

## Top Issues

| # | Rule | Severity | Title | Affected API |
| --- | --- | --- | --- | --- |
| 1 | D11-001 | CRITICAL | Hardcoded credential — API_KEY in Constants | N/A |
| 2 | D11-001 | CRITICAL | Hardcoded credential — PASSWORD in Constants | N/A |
| 3 | D11-001 | CRITICAL | Hardcoded credential — NULL_API_KEY in ResponseMessages | N/A |
| 4 | D11-001 | CRITICAL | Hardcoded credential — EMPTY_API_KEY in ResponseMessages | N/A |
| 5 | D11-001 | CRITICAL | Hardcoded credential — INVALID_API_KEY in ResponseMessages | N/A |
| 6 | D11-001 | CRITICAL | Hardcoded credential — REQUEST_HEADER_API_KEY in Constants | N/A |
| 7 | D11-001 | CRITICAL | Hardcoded credential — SECRET_KEY in AuthConstant | N/A |
| 8 | D11-001 | CRITICAL | Hardcoded credential — API_KEY_NOT_VALIDATED in AuthConstant | N/A |
| 9 | D11-001 | CRITICAL | Hardcoded credential — API_KEY in AuthentiationServiceImpl | N/A |
| 10 | D11-001 | CRITICAL | Hardcoded credential — TOKEN_DATE_FORMAT in AuthentiationServiceImpl | N/A |
| 11 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in insert() | N/A |
| 12 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in generate() | N/A |
| 13 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in generate() | N/A |
| 14 | D11-001 | CRITICAL | Hardcoded credential — API_KEY in ConsumerFlowConfigurationJpaRepository | N/A |
| 15 | D11-001 | CRITICAL | Hardcoded credential — API_KEY in ConsumerJpaRepository | N/A |
| 16 | D11-001 | CRITICAL | Hardcoded credential — API_KEY in Constants | N/A |
| 17 | D11-001 | CRITICAL | Hardcoded credential — API_KEY_SPLIT in Constants | N/A |
| 18 | D6-001 | CRITICAL | SQL INJECTION — string concatenation in byVehicleIdentificationNumber() | N/A |
| 19 | D11-001 | CRITICAL | Hardcoded credential — NULL_API_KEY in ResponseMessages | N/A |
| 20 | D11-001 | CRITICAL | Hardcoded credential — EMPTY_API_KEY in ResponseMessages | N/A |
