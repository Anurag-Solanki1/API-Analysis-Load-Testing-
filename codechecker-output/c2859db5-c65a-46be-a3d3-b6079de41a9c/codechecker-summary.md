# CodeChecker — Project Health Summary

| Property | Value |
| --- | --- |
| Project | c2859db5-c65a-46be-a3d3-b6079de41a9c |
| Project Name | TCL-Thesse |
| Project Path | C:\TCL\CODE\tcl-thesse |
| Scan Date | 2026-04-17 |
| Java Files | 248 |
| Total Findings | 68 |
| Diagrams Generated | 13 |

## Health Score: 40/100 — Grade: D

## Release Decision

**STATUS:** HOLD — significant risks

## Issue Summary

| Severity | Count |
| --- | --- |
| CRITICAL | 0 |
| HIGH | 0 |
| MEDIUM | 30 |
| LOW | 38 |

## API Performance

| Endpoint | Method | Rating | p50 | p95 | Issues |
| --- | --- | --- | --- | --- | --- |
| /thesee/type | POST | FAST | ~28ms | ~70ms | 0 |
| /theseelabelSearch | POST | FAST | ~33ms | ~82ms | 0 |
| /theseecreateTranslation | POST | FAST | ~73ms | ~182ms | 0 |
| /ws/EnvoiTraductionSimplifiePortType/EnvoiTraductionSimplifie | SOAP | FAST | ~18ms | ~45ms | 0 |
| /ws/NewCreationDeLibellesPortType/NewCreationDeLibelles | SOAP | FAST | ~18ms | ~45ms | 0 |
| /ws/RechercheParCodePortType/RechercheParCode | SOAP | FAST | ~18ms | ~45ms | 0 |
| /ws/NewRechercheExactePortType/NewRechercheExacte | SOAP | FAST | ~18ms | ~45ms | 0 |
| /web/priseservice/EnvoiTraductionSimplifie | SOAP | FAST | ~18ms | ~45ms | 0 |
| /web/priseservice/NewCreationDeLibelles | SOAP | FAST | ~18ms | ~45ms | 0 |
| /web/priseservice/NewRechercheExacte | SOAP | FAST | ~18ms | ~45ms | 0 |
| /web/priseservice/RechercheParCode | SOAP | FAST | ~18ms | ~45ms | 0 |

## Top Issues

| # | Rule | Severity | Title | Affected API |
| --- | --- | --- | --- | --- |
| 1 | D1-001 | MEDIUM | God class — 44 methods in ObjectFactory | N/A |
| 2 | D1-001 | MEDIUM | God class — 22 methods in LibelleType | N/A |
| 3 | D1-001 | MEDIUM | God class — 44 methods in ObjectFactory | N/A |
| 4 | D1-002 | MEDIUM | Long method — serviceResponse() is 34 lines | N/A |
| 5 | D1-002 | MEDIUM | Long method — getTranslatedLabelByPhraseCode() is 124 lines | N/A |
| 6 | D1-002 | MEDIUM | Long method — printTagsCode() is 68 lines | N/A |
| 7 | D1-002 | MEDIUM | Long method — processTheseeResponse() is 74 lines | N/A |
| 8 | D1-002 | MEDIUM | Long method — setParameters() is 46 lines | N/A |
| 9 | D1-002 | MEDIUM | Long method — setWSAuthentication() is 35 lines | N/A |
| 10 | D1-002 | MEDIUM | Long method — newEnvoiTraductionExacte() is 194 lines | N/A |
| 11 | D1-002 | MEDIUM | Long method — newCreationDeLibelles() is 171 lines | N/A |
| 12 | D1-002 | MEDIUM | Long method — setRequestBody() is 66 lines | N/A |
| 13 | D1-002 | MEDIUM | Long method — setResponseBody() is 33 lines | N/A |
| 14 | D1-002 | MEDIUM | Long method — newRechercheExacte() is 126 lines | N/A |
| 15 | D1-002 | MEDIUM | Long method — printTagsCode() is 82 lines | N/A |
| 16 | D1-002 | MEDIUM | Long method — setRequestBody() is 44 lines | N/A |
| 17 | D1-002 | MEDIUM | Long method — setResponseBody() is 46 lines | N/A |
| 18 | D1-002 | MEDIUM | Long method — handlePhraseLabel() is 37 lines | N/A |
| 19 | D1-002 | MEDIUM | Long method — main() is 126 lines | N/A |
| 20 | D3-001 | MEDIUM | String concat in loop — main() | N/A |
