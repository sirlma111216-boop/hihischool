# ARCHITECTURE

## 한눈에

```
브라우저 (React, Pretendard, Leaflet, PDF.js)
   │  /api/*  (JSON, 공개 승인 자료만)
   ▼
Cloudflare Worker (Hono)  ──  D1 (schools, curriculum_*, selection_groups, evidence, facts, admissions, jobs, audit)
   │  /api/admin/*  (Access JWT | Bearer 토큰 | dev 우회)        └─ R2 (선택, 비공개 원문)
   ▼
로컬 Node 명령 (scripts/docs, scripts/ingest) ── 추출 JSON → 검토 패키지 → POST /api/admin/import (초안)
```

정적 자산은 Workers Static Assets(`dist/client`, SPA fallback)가 서빙하고 `/api/*` 만 Worker 가 먼저 처리한다 (`run_worker_first`). Pages 설정은 쓰지 않는다.

## 모듈

| 경로 | 역할 |
| --- | --- |
| `shared/types.ts` | 도메인 타입·상태 enum·라벨 |
| `shared/engine/selection.ts` | 선택군 규칙 엔진: `validatePlan` → `no_conflict_within_verified_rules` / `conflicts_with_verified_rules` / `insufficient_data` + 위반·보류·대안·학점 |
| `shared/engine/credits.ts` | 지정/선택/미확인 학점 합계, 단위 혼재 경고, 졸업 판정 안 함 |
| `shared/engine/cohort.ts` | 입학연도·과정 해석 (`resolveCurriculum`): 과거 자료 자동 대체 금지, 과정 선택 요구 |
| `shared/engine/planner.ts` | 학기 슬롯, 희망 과목 정확 일치, 범위 제한 백트래킹 (노드/시간 초과 상태) |
| `shared/engine/diff.ts` | 버전 비교 (같은 입학연도·개정·과정만) |
| `shared/search/*` | 초성·공백 변형, 규칙 기반 문장 해석 → 조건 칩 |
| `shared/dataset.ts` | 데이터셋 → prepared statement / SQL 텍스트 |
| `shared/extraction.ts` | 원문 → 후보 JSON 스키마 |
| `worker/routes/public.ts` | 공개 API (아래 계약) |
| `worker/routes/admin.ts` | 가져오기·편집·검토·공개·범위 기록·URL 확인·업로드·감사·AI |
| `worker/auth.ts` | Cloudflare Access JWT(서명·issuer·audience·만료) / `ADMIN_API_TOKEN` 상수시간 비교 / dev 우회(배포에서 무시) |
| `worker/urlguard.ts` | 공식 호스트 허용 목록, 사설·메타데이터 주소 차단, 크기·시간·리다이렉트 제한, 파일 서명 |
| `src/lib/store.tsx` | 작업 공간 상태 (입학연도·비교 바구니·관심 과목·근거 서랍·상담 세션) |
| `scripts/docs/*` | 로컬 추출·패키지. PDF.js 는 PDF 전용, HWPX 는 zip+XML, XLSX 는 exceljs, HWP(OLE) 는 변환 안내 |
| `scripts/ingest/*` | 나이스·학교알리미 수집 (동시성 2, 재시도 3, 구별 결과 보존, upsert) |

## 공개 API 계약

| 경로 | 설명 |
| --- | --- |
| `GET /api/schools?q&district&schoolType&establishment&gender&course&program&curriculumStatus&cohortYear&page&pageSize&sort` | 검색. `items`(확인된 결과) / `candidates`(자료 추가 확인 후보) / `confirmedAbsent` 분리. `counts`(DB 학교 수·결과·좌표 수), `interpreted`(해석 칩·잔여 검색어), `coverage` |
| `GET /api/schools/:id` | 프로필: 학교, facts(기준 연도·정의), programs(계획/결과/홍보), 공개 교육과정 버전, 초안 수, 문서, 입학 규정·일정 |
| `GET /api/schools/:id/curricula?cohortYear&trackId` | `CurriculumLookup`: `available` / `cohort_not_available` / `track_required` / `unreviewed_only` / `not_collected` + 참고 전용 버전 목록 |
| `GET /api/versions/:id` | 공개 버전 묶음 (참고 패널 전용) |
| `POST /api/compare` `{schoolIds≤4, cohortYear, trackIds, interestCourses}` | 열별 자료 상태, 관심 과목 편성·선택군, facts, programs, 규정·일정, 문서. `comparability` |
| `POST /api/plans/validate` `{versionId, selectedOfferingIds, targetCohortYear}` | 규칙 엔진 결과 (학생 정보 없음) |
| `POST /api/plans/search` | 범위 제한 조합 탐색 |
| `GET /api/ask/together?versionId&a&b&cohortYear` | 근거 검색 패널: 두 과목 동시 선택 판정 + 근거 |
| `GET /api/evidence/:id`, `GET /api/documents/:id` | 승인된 근거·문서만 |
| `GET /api/admissions?year&schoolId` | 규정(버전·대체 관계)·일정(Asia/Seoul, 시각 없으면 null) |
| `GET /api/coverage`, `GET /api/sources` | 범위·갱신·문서·작업 이력 |

오류는 `{ok:false, error:{code,message,details}}`. 가상 자료는 `APP_ENV` 가 production/preview 면 모든 공개·관리 경로에서 제외/차단된다.

## 관리 API

`/api/admin/*` 는 모든 요청에서 `authenticateAdmin` 을 통과해야 하고, 변경 요청은 같은 출처(Origin) 또는 CLI 토큰만 허용하며 D1 기반 속도 제한을 거친다. 공개 흐름: `import`(초안 강제) → `offerings/edit`·`groups/edit`(초안만; 근거 없는 규칙 확인 거부) → `review`(사람 이름; `publishChecks` 오류 있으면 승인 거부) → `publish`(하나의 D1 batch 트랜잭션; 이전 공개 버전 superseded; 실패 시 이전 유지) → `withdraw`.

`publishChecks` 오류: 입학연도 없음, 출처 없음, 문서 입학연도 불일치, 근거 없는 편성, 존재하지 않는 근거/선택군 참조, 확인된 규칙에 근거 없음, 최소>최대. 경고: 규칙 미확인/충돌, 학점 미확인, 단위 혼재, 사람 검토 없는 근거.

## 보안 경계

- 프런트 메뉴 숨김은 보안이 아니다. 인증은 API 에서 요청마다.
- 상담 데이터(별칭·메모·선호·통학)는 서버로 가지 않는다. `/api/compare`, `/api/plans/*` 는 공개 학교 ID·버전 ID·편성 ID 만 받는다.
- 업로드: Content-Length·실제 크기·파일 서명·확장자 조합 검사, R2 없으면 메타데이터만.
- URL 수집: 허용 목록·HTTPS/HTTP 만·자격 증명 URL 거부·사설/루프백/메타데이터 차단·리다이렉트 3회·시간 15초·크기 제한.
- CSV: `csvSafeCell` (=,+,-,@ 선행 시 인용). HTML 은 React 이스케이프, `dangerouslySetInnerHTML` 미사용.
- 로그: 경로·오류 메시지만. 키·문서 전문·상담 메모 없음.
- 보안 헤더: nosniff, DENY frame, Referrer-Policy, Permissions-Policy. 관리 응답 `no-store`.

## 성능 메모 (측정 환경: Windows 11, Node 24, 로컬 wrangler/D1, 가상 자료 4개교)

- 검색은 학교 전체를 한 번 읽고 메모리에서 필터한다 (서울 ~320개교 규모에서 수 ms). 과목 조건은 인덱스된 `curriculum_offerings` LIKE 질의.
- 최초 랜딩은 `/api/coverage` 1회만 호출한다. 지도·PDF.js 는 lazy chunk.
- 상담 화면 방문마다 외부 API 를 호출하지 않는다 (수집은 관리자 수동).
- 실제 서울 전체 규모의 수치는 수집 후 다시 측정해 VERIFICATION 에 기록한다 (미측정 수치를 보증하지 않음).
