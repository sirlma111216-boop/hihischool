# REQUIREMENTS_CHECKLIST — 요구사항별 구현 위치

상태: ✅ 구현+검증 · 🟡 구현(실제 자료로 미검증) · ⬜ 미구현/운영 작업

| 요구 | 상태 | 위치 |
| --- | --- | --- |
| 라우트 10개 (`/`, `/schools`, `/schools/:id`, `/schools/:id/curriculum`, `/compare`, `/planner`, `/counsel`, `/briefing`, `/sources`, `/admin`) | ✅ | `src/App.tsx`, `src/routes/*` |
| 랜딩: 브랜드·핵심 문장·검색·입학연도·3 버튼, DB 계산 범위, 과장 없음 | ✅ | `src/routes/Landing.tsx`, `/api/coverage` |
| 전역 상단 검색·입학연도, 고정 비교 바구니, 조건 유지, 뒤로 가기 복구, URL 에 비민감 조건만 | ✅ | `App.tsx`, `CompareBar.tsx`, `lib/store.tsx`, `Schools.tsx` |
| 서울 전체 수집·제외 사유·부분 실패 표시 | 🟡 | `scripts/ingest/*`, `coverage_districts`, `/api/coverage`, `Sources.tsx` |
| 검색: 정식명·별칭·지역·학과·과목·프로그램, 초성·공백, 동명이교 구분, 학교/결과/좌표 수 분리 | ✅ | `shared/search/*`, `routes/public.ts` `/schools` |
| 필터 칩·개별 제거·전체 초기화, 유형≠프로그램 | ✅ | `Schools.tsx` |
| 검색 문장 규칙 해석·해석 칩·미이해 조건 잔여, 확인된 결과/추가 확인 후보 분리 | ✅ | `shared/search/query.ts`, `/schools` `items/candidates/confirmedAbsent` |
| 지도 보조(Leaflet+OSM, 타일 실패 시 점 유지, 유료 키 없음, 경계는 공식 파일만) | ✅ | `components/SchoolMap.tsx` |
| 직선거리만, 사용자 확인 통학 기록, 위치 비저장 | ✅ | `shared/geo.ts`, `Counsel.tsx` `CommuteEditor` |
| 프로필 3층(요약→상세→근거), 6탭, 계획/결과/홍보 구분, 지표 기준연도·정의, 0≠미공개 | ✅ | `SchoolProfile.tsx` |
| 입학연도 명시 선택, 자료 없으면 참고 패널만, 자동 대체 금지 | ✅ | `shared/engine/cohort.ts`, `SchoolCurriculum.tsx` |
| 편제 정규화 필드 보존 | ✅ | `shared/types.ts` `CurriculumOffering`, D1 |
| 6 보기(매트릭스·교과군·관심·지정/선택·선택군·원문 대조), 고정 머리·반복 표시, 병합 중복 계산 금지 | ✅ | `components/CurriculumMatrix.tsx` |
| 선택군 해석·근거·판단 3상태·대안 조합·시간표 충돌 아님·결정론 | ✅ | `shared/engine/selection.ts`, `PlanVerdict.tsx`, 테스트 |
| 학점 합계 구분, 후보 전체 합산 금지, null≠0, 졸업 판정 안 함, 단위 혼재 경고 | ✅ | `shared/engine/credits.ts` |
| 근거 패널(문서명·기관·게시일·입학연도·확인일·검토·링크·페이지/표/행/열), PDF.js, 좌표 없으면 페이지만, 인쇄쪽≠PDF쪽 | ✅ | `EvidenceDrawer.tsx`, `PdfViewer.tsx` |
| HWP/HWPX 원문·변환·문단 연결, 재배포 권한 없으면 링크만 | 🟡 | `scripts/docs/lib/hwpx.ts`, `rights` |
| 비교 ≤4, 고정 헤더/항목, 접기, 차이만, 관심만, 순서 변경, 교체, 인쇄, 모바일 카드 | ✅ | `Compare.tsx` |
| 비교 기준 표시, 동일 기준 불가 표시, 미확인 학교 유지, 점수/레이더 없음, 조건 대조표 | ✅ | `Compare.tsx`, `/api/compare` |
| 배움 경로: 희망 과목 직접 선택, 교사 작성 예시 구분, 학교별 경로, 되돌리기, 범위 제한 탐색·중단 상태 | ✅ | `Planner.tsx`, `shared/engine/planner.ts` |
| 입학 규정 버전 관리·변경 이력, 일정 Asia/Seoul·시각 null·ICS, 자동 발송 없음, 합격 확률 없음 | ✅ (자료 🟡) | `admission_*`, `SchoolProfile.tsx`, `lib/export.ts` `toIcs` |
| 변경 이력 비교(같은 집단만), 표기 수정 vs 실질 변경 | ✅ | `shared/engine/diff.ts` |
| 상담 이후 자료 변경 알림, 상담 판단 보존 | ✅ | `Counsel.tsx` (dataVersions 비교) |
| 상담: 별칭, 비민감 항목, 세션 메모리/옵트인 기기 저장, 상담 모드 큰 글씨·비공개 메모 숨김, 끝내기/지우기 | ✅ | `Counsel.tsx`, `lib/store.tsx` |
| 브리핑: 1쪽 요약+부록, 사실/선호/해석/질문 구분, 인쇄/PDF, CSV(수식 방어), JSON, 암호화 백업, 공유 링크 비민감 | ✅ | `Briefing.tsx`, `lib/export.ts`, `shared/normalize.ts` `csvSafeCell` |
| 미확인 → 학교에 확인할 질문, 복사만 | ✅ | `Counsel.tsx` `QuestionList`, `PlanUnknown.question` |
| 학교알리미 구별 sgg 수집·병합·부분 실패·동시성·재시도, 화면 방문마다 호출 금지 | 🟡 | `scripts/ingest/schoolinfo.ts`, config |
| 나이스 보완·표본≠전체·코드 crosswalk 분리 | 🟡 | `scripts/ingest/neis.ts`, `school_codes` |
| 입학 공식 자료·학교 모집요강·source adapter + 사용자 URL 등록 | 🟡 | `/api/admin/sources/check`, `urlguard.ts` |
| 출처 우선순위 상황별, 충돌 상태 유지 | ✅ | `SOURCE_POLICY.md`, `ruleStatus: conflict` |
| 문서 등록(서명·MIME·크기·압축 폭탄), 지시문 비실행 | ✅ | `admin.ts` upload, `hwpx.ts`(entity 비처리·크기 제한), `ai.ts` 프롬프트 |
| PDF 표·좌표, OCR 플래그, HWPX, HWP 안전 안내, XLSX 병합 | ✅/🟡(OCR 엔진 미포함) | `scripts/docs/lib/*` |
| 로컬 처리·검토 JSON·Cloudflare 에는 정규화 자료만 | ✅ | `scripts/docs/*`, `/api/admin/import` |
| 추출 흐름(초안→검토→승인→공개), 검토자 AI 금지, 편집 가능 | ✅ | `admin.ts` review/publish/edit |
| 병합·여러 쪽·반복 머리글·교차·주석·0/빈칸/대시·입학연도 혼재 | ✅(fixture) | `pdf.ts`, `package-review.ts`, `docs.test.ts` |
| AI 선택 확장(기본 비활성, 스키마·원문 검증, 학생 정보 미전송, 비용 안내) | ✅ | `worker/ai.ts`, `Admin.tsx` AiPanel |
| 근거 검색 패널(두 과목 동시 선택) | ✅ | `/api/ask/together`, `Counsel.tsx` |
| 데이터 모델 최소 엔티티 | ✅ | `shared/types.ts`, `migrations/0001_init.sql` |
| 디자인 토큰·Pretendard·크기·대비·반응형·버튼 상태·아이콘·빈 화면·로딩 구분·모션·키보드·팔레트 | ✅ | `src/styles/*`, `components/ui.tsx` |
| Workers Static Assets+API+D1, migrations, 선택 R2, 인덱스, prepared statements, 트랜잭션 공개 | ✅ | `wrangler.jsonc`, `migrations`, `admin.ts` publish |
| 관리자 인증(Access JWT 검증/서버 토큰), dev 우회 배포 비활성, Origin/CSRF, 크기·속도 제한 | ✅ | `worker/auth.ts`, `ratelimit.ts` |
| URL 허용 목록·사설 IP 차단·크기/시간 제한 | ✅ | `worker/urlguard.ts` |
| 비밀은 secret/.dev.vars, 프런트·로그 미노출 | ✅ | `.dev.vars.example`, `.gitignore`, 테스트 |
| 수집 스케줄 설정 가능·기본 수동 | ✅ | `DEPLOYMENT.md`, 관리 API |
| typecheck·lint·build·단위·통합·E2E | ✅ | `package.json`, `tests/*` |
| 시나리오 01~22 | ✅(01–13, 19, 20 부분, 21, 22) 🟡(14, 15, 16, 17, 18 은 설계·UI 반영, 실제 자료로 미검증) | `tests/unit/selection.test.ts`, `tests/worker/api.test.ts`, `tests/e2e/*` |
| 실제 서울 학교 3곳 원문 확보·검토 | ⬜ 운영 작업 | `DATA_COVERAGE.md` |
| GitHub → Workers Builds 자동 배포 | 🟡 (저장소·워크플로 준비, 대시보드 연결은 계정 작업) | `DEPLOYMENT.md`, `.github/workflows/deploy.yml` |
