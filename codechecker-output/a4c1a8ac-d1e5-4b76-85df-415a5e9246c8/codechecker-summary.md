# CodeChecker — Project Health Summary

| Property | Value |
| --- | --- |
| Project | a4c1a8ac-d1e5-4b76-85df-415a5e9246c8 |
| Project Name | CIN-VIN |
| Project Path | C:\CIN CNAX Batch Improvement\CODE\cin-vin |
| Scan Date | 2026-04-16 |
| Java Files | 141 |
| Total Findings | 221 |
| Diagrams Generated | 13 |

## Health Score: 3/100 — Grade: F

## Release Decision

**STATUS:** BLOCKED — critical issues must be resolved

## Issue Summary

| Severity | Count |
| --- | --- |
| CRITICAL | 2 |
| HIGH | 1 |
| MEDIUM | 146 |
| LOW | 72 |

## API Performance

| Endpoint | Method | Rating | p50 | p95 | Issues |
| --- | --- | --- | --- | --- | --- |
| /activeContractsDAI | GET | MODERATE | ~213ms | ~532ms | 1 |
| /health/ovHealth | GET | MODERATE | ~183ms | ~457ms | 0 |
| /health/sagaiWarrantyHealth | GET | MODERATE | ~158ms | ~395ms | 1 |
| /health/sagaiContractsHealth | GET | MODERATE | ~173ms | ~432ms | 0 |
| /health/erecaHealth | GET | MODERATE | ~128ms | ~320ms | 0 |
| /health/corvetHealth | GET | MODERATE | ~203ms | ~507ms | 0 |
| /health/daiContractsHealth | GET | MODERATE | ~303ms | ~757ms | 0 |
| /health/cartellHealth | GET | MODERATE | ~158ms | ~395ms | 0 |
| /vins | GET | SLOW | ~888ms | ~2220ms | 0 |
| /vinscontracts | GET | MODERATE | ~303ms | ~757ms | 4 |

## Top Issues

| # | Rule | Severity | Title | Affected API |
| --- | --- | --- | --- | --- |
| 1 | D11-001 | CRITICAL | Hardcoded credential — API_KEY in Constants | N/A |
| 2 | D11-001 | CRITICAL | Hardcoded credential — API_KEY_SPLIT in Constants | N/A |
| 3 | D8-001 | HIGH | Potential resource leak — Connection in callSagai() | N/A |
| 4 | A3-004 | MEDIUM | Potential missing index — VinBrandRepository.getBrand() | GET /activeContractsDAI |
| 5 | A3-004 | MEDIUM | Potential missing index — CicsConfigurationRepository.byBrandAndCountry() | GET /health/sagaiWarrantyHealth |
| 6 | A3-004 | MEDIUM | Potential missing index — SagaiDeployedRepository.getMarketCode() | GET /vinscontracts |
| 7 | A3-004 | MEDIUM | Potential missing index — SagaiDeployedRepository.getMarketCode() | GET /vinscontracts |
| 8 | A3-004 | MEDIUM | Potential missing index — SagaiDeployedRepository.getSagaiCountryID() | GET /vinscontracts |
| 9 | A3-004 | MEDIUM | Potential missing index — SagaiDeployedRepository.getCountryConfigValue() | GET /vinscontracts |
| 10 | D1-001 | MEDIUM | God class — 186 methods in ApplicationConfig | N/A |
| 11 | D1-002 | MEDIUM | Long method — init() is 45 lines | N/A |
| 12 | D1-002 | MEDIUM | Long method — getCountryConfigValue() is 32 lines | N/A |
| 13 | D1-002 | MEDIUM | Long method — getSagaiCountryID() is 31 lines | N/A |
| 14 | D1-002 | MEDIUM | Long method — byServiceHistory() is 40 lines | N/A |
| 15 | D1-002 | MEDIUM | Long method — getVehicleDetailsByLcdv4() is 34 lines | N/A |
| 16 | D1-002 | MEDIUM | Long method — getVehicleDetailsByLcdv4() is 38 lines | N/A |
| 17 | D1-002 | MEDIUM | Long method — byVehicleIdentificationNumber() is 39 lines | N/A |
| 18 | D1-002 | MEDIUM | Long method — byVisIdentifier() is 38 lines | N/A |
| 19 | D1-002 | MEDIUM | Long method — getBrand() is 32 lines | N/A |
| 20 | D1-002 | MEDIUM | Long method — byVinWarranty() is 39 lines | N/A |
