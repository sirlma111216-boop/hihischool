# VERIFICATION — 검증 보고 (2026-10-17)

네 가지 상태를 별개로 기록한다: **코드 테스트 통과 / 실제 원문 확보 / 사람 검토 / 공개 배포.**

| 상태 | 결과 |
| --- | --- |
| 코드 테스트 | ✅ typecheck(app/worker/node) · lint · build · 단위 43 · Worker+D1 통합 25 · Playwright E2E 18 (3 뷰포트 × 6) 모두 통과 |
| 실제 서울 학교 자료 확보 | ❌ 미수집 (API 키 없음, 원문 다운로드·검토는 운영자 작업). 가상 fixture 로 경로만 검증 |
| 사람 검토 완료 자료 | ❌ 없음 (가상 fixture 의 '검토자(가상)' 는 표시용) |
| 공개 배포 | ✅ https://highschool-atlas.sirlma.workers.dev (D1 migrations 적용, 데이터 0건, 관리 API 401). GitHub `main` push 완료. Workers Builds Git 연결은 대시보드 로그인 필요 → 사용자 작업 (DEPLOYMENT.md 경로 A/B) |

## 실행 환경
Windows 11 Pro, Node 24.16, npm 11.13, wrangler 4.151, vitest 4.1 + @cloudflare/vitest-plugin 1.4, Playwright 1.64 (Chromium). 로컬 D1(.wrangler/state) + 합성 fixture 4개교.

## 명령별 결과
| 명령 | 결과 |
| --- | --- |
| `npm run typecheck` | 통과 (app, worker, node) |
| `npm run lint` | 통과 (0 문제) |
| `npm run build` | 통과. client index 417 kB(gzip 128), leaflet 150 kB, pdf 415 kB 는 lazy chunk, pdf.worker 1.2 MB 는 근거 PDF 열 때만 |
| `npm run test:unit` | 43/43 — 규칙 엔진 시나리오 01–09, 플래너·버전 비교, 검색/초성/지리/정규화/CSV, 문서 파이프라인(PDF·HWPX·XLSX·HWP 안내) |
| `npm run test:worker` | 25/25 — 공개 API 계약, 자료 상태 분리, 비교 불가 표시, 근거 승인 제한, 입학 규정 대체, 범위 집계, 관리자 401/위조 JWT/토큰 오류, 허용 목록 밖 URL 차단, AI 검토자 거부, 공개 전 오류 차단, 사람 승인→공개, 업로드 서명 불일치 415, 가져오기 초안 강제, 응답에 토큰 없음 |
| `npm run test:e2e` | 18/18 — 390/768/1440px: 검색 해석·결과 분리, A+B 충돌·근거 서랍(PDF 4쪽/인쇄 2쪽)·Esc 복원, 비교 불가 표시·미확인 학교 유지·가로 넘침 없음, 상담→브리핑(별칭이 POST 본문에 없음), 2027 자료 없음 참고 패널, 초안 버전 공개 API 404 |

## 검증 시나리오 대응 (ACCEPTANCE_SCENARIOS)
| # | 결과 | 근거 |
| --- | --- | --- |
| 01 3택1 에서 2개 → 충돌·G·근거, 1개 → 모순 없음, 9학점 합산 금지 | ✅ | `selection.test.ts`, E2E |
| 02 3택2 허용, '최대 2' ≠ 최소 2 | ✅ | `selection.test.ts`, `docs.test.ts`(XLSX 각주) |
| 03 규칙 없음 → 보류, 같은 학기만으로 충돌 아님 | ✅ | `selection.test.ts` |
| 04 2026 자료로 2027 경로 확정 금지, 참고 전용 | ✅ | `selection.test.ts`, `api.test.ts`, E2E |
| 05 학과 2개 → 과정 선택 요구 | ✅ | `selection.test.ts`, `api.test.ts` |
| 06 학년 전체 제한, 다른 학기도 충돌, 기간 표시 | ✅ | `selection.test.ts` |
| 07 교차 편성 6학점 합산 금지, 배정 반 미확인 | ✅ | `selection.test.ts`, 선택군 X `unknownRules` |
| 08 null 학점 → '확인 합계 + 미확인 1개', 졸업 보류 | ✅ | `credits.ts` 테스트 |
| 09 두 문서 충돌 → 최신으로 덮지 않고 보류 | ✅ | 선택군 K `conflict` |
| 10 편성 확인 / 개설 미확인 문구 | ✅ | `OFFERING_STATUS_LABEL`, 비교·프로필 '개설 미확인' |
| 11 검토 완료/미검토/2026만 세 학교를 나란히 점수화하지 않음 | ✅ | `api.test.ts` compare, E2E |
| 12 반복 머리글·병합·다음 쪽 각주, OCR 자동 확정 금지 | ✅(fixture) | `docs.test.ts`, `needsOcr` 경고. 실제 스캔 OCR 엔진은 미포함 |
| 13 PDF 페이지 ≠ 인쇄 쪽수, 좌표 없으면 가짜 하이라이트 금지 | ✅ | `api.test.ts` evidence, `EvidenceDrawer`, `PdfViewer`(bbox 있을 때만) |
| 14 부분 수집 표시, 재시도 중복 금지 | 🟡 설계·코드 (upsert id, coverage_districts). 실제 API 미실행 |
| 15 학교코드 오매칭 자동 병합 금지 | 🟡 `school_codes.status=pending`, 수동 확인 절차 문서화 |
| 16 변경 공고 버전 관계·선발 주체 분리 | ✅(fixture) | `api.test.ts` admissions |
| 17 직선거리만, 분 단위 꾸며내지 않음 | ✅ | `geo.ts`, `CommuteEditor` |
| 18 상담 자료 유출 없음, 기기 저장 옵트인, 상담 모드 메모 숨김, 삭제 | ✅ | E2E(POST 본문 검사), `store.tsx`, `Counsel.tsx` |
| 19 미인증·만료 인증 거부, 초안 비공개, 메뉴 숨김 ≠ 인증 | ✅ | `api.test.ts` |
| 20 인쇄 잘림·CSV 수식 방어·메모 제외 | ✅(CSS·코드) 인쇄는 수동 확인 전 | `csvSafeCell` 테스트, `@media print` |
| 21 자료 개정 후 기존 상담 → 변경 알림, 조용히 바꾸지 않음 | ✅ | `Counsel.tsx` dataVersions 비교 |
| 22 390/768/1440 가독성·헤더 고정·포커스·서랍 복원·가로 넘침 없음 | ✅ | E2E overflow 검사, 브라우저 수동 확인(스크린샷) |

## 수동 확인 (내장 브라우저)
- 1440px: 랜딩(히어로·범위 수치), 검색 해석 칩, 교육과정 매트릭스 + 선택 조합 판정, 근거 서랍(제목·발췌·위치·메타), 비교표(고정 헤더·그룹 접기·중요 조건), 상담(질문 제안 7건, 두 과목 동시 선택 질의 A=충돌/B=허용), 브리핑.
- 390px: 비교 카드 페이징, 매트릭스 가로 스크롤(페이지 전체는 넘치지 않음), 랜딩 히어로 상단 띠. 수정한 것: 관심 과목 폼 폭, 근거 버튼 줄바꿈, 비교 페이지 초기 null 크래시, 브리핑 일정 중복 key.

## 보안 점검
- 번들·응답에 토큰/키 없음 (`api.test.ts` '응답과 로그에 키가 없다'; `.dev.vars` 는 Git 제외, 커밋에 `.dev.vars.example` 만).
- `/api/admin/*` 401 without auth (로컬·배포 모두 확인), 위조 JWT 401, 허용 목록 밖 URL·메타데이터 주소 차단, 업로드 서명/확장자 불일치 415, 가져오기 초안 강제, 검토자 'AI' 422.
- 공개 검색·비교·검증 요청은 학교 ID·버전 ID·편성 ID 만 (E2E 로 POST 본문 확인).

## 성능 (측정 환경: 로컬 wrangler dev + 로컬 D1, 가상 4개교)
- `/api/schools` ~10–30 ms, `/api/compare` 3개교 ~40–80 ms (dev 서버 로그 기준, 브라우저 네트워크 패널). 서울 전체(≈320개교) 규모는 수집 후 재측정 필요 — 미측정 수치를 보증하지 않는다.
- 최초 랜딩 요청: HTML + index chunk + CSS + 폰트 + `/api/coverage` 1회. 지도·PDF.js 는 필요 시 로드.

## 남은 작업 (운영)
1. 학교알리미·나이스 키 발급 → `ingest:*` 실행 → 자치구별 성공/실패 확인. 학교알리미 응답 필드명·sgg 파라미터는 config 로 조정.
2. 실제 학교 3곳(일반고 2 + 학교장 선발고/특성화고 1) 편제표 공식 URL 등록 → 로컬 추출 → 검토 패키지 → 관리 화면에서 사람 검토·승인·공개.
3. Cloudflare 대시보드에서 Workers Builds Git 연결(또는 GitHub secrets) — DEPLOYMENT.md.
4. `/admin` 에 Cloudflare Access 적용, `ADMIN_API_TOKEN` secret 등록.
5. 서울 행정경계 GeoJSON(공식 자료) 을 `public/geo/seoul-districts.geojson` 로 등록하면 지도에 표시.
