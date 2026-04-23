# CodeChecker — Project Health Summary

| Property | Value |
| --- | --- |
| Project | 2f903141-2fc2-4161-b667-822989c7ff0e |
| Scan Date | 2026-04-06 |
| Java Files | 265 |
| Total Findings | 354 |
| Diagrams Generated | 29 |

## Health Score: 0/100 — Grade: F

## Release Decision

**STATUS:** BLOCKED — critical issues must be resolved

## Issue Summary

| Severity | Count |
| --- | --- |
| CRITICAL | 109 |
| HIGH | 17 |
| MEDIUM | 111 |
| LOW | 117 |

## API Performance

| Endpoint | Method | Rating | p50 | p95 | Issues |
| --- | --- | --- | --- | --- | --- |
| /authenticateWithLdap | GET | MODERATE | ~93ms | ~232ms | 0 |
| /authAllucare | GET | MODERATE | ~268ms | ~670ms | 0 |
| /brandcareform/form | GET | MODERATE | ~303ms | ~757ms | 0 |
| /brandcareform/vin/submission-history | GET | MODERATE | ~198ms | ~495ms | 0 |
| /brandcareform/form-submission | POST | MODERATE | ~353ms | ~882ms | 0 |
| /countcontract | GET | MODERATE | ~108ms | ~270ms | 0 |
| /countservice | GET | MODERATE | ~123ms | ~307ms | 1 |
| /contractNumber | PUT | MODERATE | ~148ms | ~370ms | 0 |
| / | POST | MODERATE | ~118ms | ~295ms | 0 |
| /dimbo | POST | MODERATE | ~113ms | ~282ms | 0 |
| /authenticate | GET | MODERATE | ~103ms | ~257ms | 0 |
| /customer-challenge | GET | MODERATE | ~203ms | ~507ms | 0 |
| /vin/active-contract | GET | MODERATE | ~153ms | ~382ms | 0 |
| /contracts/vin/services | GET | MODERATE | ~113ms | ~282ms | 0 |
| /vin/services | GET | MODERATE | ~88ms | ~220ms | 0 |
| /vin | GET | MODERATE | ~88ms | ~220ms | 0 |
| /services | POST | MODERATE | ~88ms | ~220ms | 0 |
| /services/id | POST | MODERATE | ~83ms | ~207ms | 0 |
| /services/vin/id/mileage | POST | MODERATE | ~103ms | ~257ms | 0 |
| /vinHealth | GET | MODERATE | ~93ms | ~232ms | 0 |
| /custAtHealth | GET | MODERATE | ~123ms | ~307ms | 0 |
| /v360Health | GET | FAST | ~63ms | ~157ms | 0 |
| /vin/maintenance-plans/UI | GET | MODERATE | ~173ms | ~432ms | 0 |
| /vin/maintenance-plans | GET | MODERATE | ~153ms | ~382ms | 0 |
| /vin/vehicle-information | GET | MODERATE | ~123ms | ~307ms | 0 |
| /vin | POST | MODERATE | ~83ms | ~207ms | 0 |
| /exfca/vin/vehicle-information | GET | MODERATE | ~123ms | ~307ms | 0 |

## Top Issues

| # | Rule | Severity | Title | Affected API |
| --- | --- | --- | --- | --- |
| 1 | D11-001 | CRITICAL | Hardcoded credential — CLIENT_SECRET in AppConstants | N/A |
| 2 | D11-001 | CRITICAL | Hardcoded credential — ACCESS_TOKEN in AppConstants | N/A |
| 3 | D11-001 | CRITICAL | Hardcoded credential — TOKEN in AppConstants | N/A |
| 4 | D11-001 | CRITICAL | Hardcoded credential — TOKEN_EXPIRED_FOR_USERID in AppConstants | N/A |
| 5 | D11-001 | CRITICAL | Hardcoded credential — X_IBM_CLIENT_SECRET in AppConstants | N/A |
| 6 | D11-001 | CRITICAL | Hardcoded credential — X_SPIN_GO_API_KEY in AppConstants | N/A |
| 7 | D11-001 | CRITICAL | Hardcoded credential — X_PASSWORD_AUTHORIZATION in AppConstants | N/A |
| 8 | D11-001 | CRITICAL | Hardcoded credential — HEADER_PASSWORD in Constants | N/A |
| 9 | D11-001 | CRITICAL | Hardcoded credential — ERR_NAME_INCORRECT_USERNAME_PASSWORD in Constants | N/A |
| 10 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_TOKEN_PASSWORD_IS_MISSING in Constants | N/A |
| 11 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_TOKEN_PASSWORD_IS_MISSING in Constants | N/A |
| 12 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_TOKEN_USERNAME_IS_MISSING in Constants | N/A |
| 13 | D11-001 | CRITICAL | Hardcoded credential — ERR_NAME_PASSWORD_MISSING in Constants | N/A |
| 14 | D11-001 | CRITICAL | Hardcoded credential — ERR_NAME_USERNAMEANDPASSWORD_MISSING in Constants | N/A |
| 15 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_TOKEN_USERNAMEANDPASSWORD_IS_MISSING in Constants | N/A |
| 16 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_TOKEN_USERNAMEANDPASSWORD_IS_MISSING in Constants | N/A |
| 17 | D11-001 | CRITICAL | Hardcoded credential — ISSUE_MSG_TOKEN_VERIFICATION_FAILED in ErrorMessage | N/A |
| 18 | D11-001 | CRITICAL | Hardcoded credential — ISSUE_MSG_EXCEPTION_VERIFYING_TOKEN in ErrorMessage | N/A |
| 19 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_EXCEPTION_VERIFYING_TOKEN in ErrorMessage | N/A |
| 20 | D11-001 | CRITICAL | Hardcoded credential — ERR_MSG_TOKEN_VIN_IS_INVALID in ErrorMessage | N/A |
