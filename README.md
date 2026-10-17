# 고교 아틀라스 (High School Atlas)

서울 고등학교 교육과정·진학상담 워크스페이스. **학교 이름 너머, 배움의 차이를 읽다.**

중3 담임교사와 학생이 같은 화면을 보며 서울 고등학교의 공식 정보와 **입학연도별 교육과정·선택군 규칙**을 근거와 함께 검토하는 앱이다. 학교 순위·합격 확률·배정 확률을 만들지 않고, 확인한 사실·미확인·해석·학교에 확인할 질문을 구분한다.

## 구성

| 영역 | 기술 |
| --- | --- |
| 화면 | React 19 + TypeScript + Vite 7 (+ `@cloudflare/vite-plugin`) |
| API | Cloudflare Worker (Hono) — `/api/*` |
| 저장 | Cloudflare D1 (공개 승인 자료·출처·검토 기록). R2 는 선택 |
| 규칙 엔진 | `shared/engine/*` — 결정론적, LLM 미사용 (Worker·브라우저·스크립트 공용) |
| 문서 분석 | 로컬 Node 명령 (`scripts/docs/*`) — PDF.js 텍스트·좌표, HWPX 구조, XLSX 병합 셀 |
| 수집 | 로컬 Node 명령 (`scripts/ingest/*`) — 학교알리미(구별 sgg), 나이스 |
| 상담 기록 | 브라우저 세션 메모리, 선택 시 기기 저장. 서버 D1 에 저장하지 않음 |

화면: `/` 랜딩 · `/schools` 검색(목록/표/지도) · `/schools/:id` 프로필 · `/schools/:id/curriculum` 입학연도별 교육과정 · `/compare` 비교(최대 4) · `/planner` 배움 경로 · `/counsel` 상담 · `/briefing` 브리핑 · `/sources` 출처·범위 · `/admin` 보호된 관리.

## 빠른 시작 (로컬)

```bash
npm install
cp .dev.vars.example .dev.vars        # 로컬 관리자 우회(DEV_ADMIN_BYPASS=1) 포함. Git 제외
npm run db:migrate:local               # 로컬 D1 에 migrations 적용
npm run db:seed:synthetic              # 기능 검증용 가상 학교 A/B/C/D 시드 (실제 학교 아님)
npm run docs:fixtures                  # 문서 분석 검증용 가상 PDF/HWPX/XLSX 생성
npm run dev                            # http://localhost:5173
```

개발 환경(`APP_ENV=development`)에서는 가상 자료가 "기능 검증용 가상 자료" 배지와 함께 검색에 나타난다. 배포 환경에서는 자동 제외된다.

## 검증

```bash
npm run typecheck      # app / worker / node 세 tsconfig
npm run lint
npm run test:unit      # 규칙 엔진·검색·지리·정규화·문서 파이프라인 (사람이 쓴 기대값 대조)
npm run test:worker    # Worker + D1 통합 (vitest-plugin, 실제 migrations 적용)
npm run test:e2e       # Playwright 상담 흐름, 390/768/1440px
npm run build
```

결과와 범위는 [docs/VERIFICATION.md](docs/VERIFICATION.md) 에 기록한다.

## 실제 자료 넣기

1. **학교 기본정보**: `.dev.vars` 에 `NEIS_API_KEY`, `SCHOOLINFO_API_KEY` 를 넣고
   `npm run ingest:neis -- --post http://localhost:5173`, `npm run ingest:schoolinfo -- --post http://localhost:5173`.
   성공/실패 자치구가 `/sources` 에 기록된다. 키가 없으면 나이스는 표본만 받고 '전체'로 표시하지 않는다.
2. **교육과정 원문**: 관리 화면 또는 `POST /api/admin/sources/check` 로 공식 URL 등록 → 로컬에서
   `npm run docs:extract -- --file <pdf|hwpx|xlsx> --doc <문서ID>` → `npm run docs:package -- --extraction data/extracted/<id>.json --school <학교ID> --cohort 2027 --revision 2022`
   → 관리 화면 "검토 패키지 가져오기" (항상 초안) → 원문 옆에서 사람 검토 → 승인 → 공개.
3. 자동 추출은 '초안', 사람이 승인한 것만 '검토 완료'. 검토자는 사람 이름이어야 하며 AI 로 기록되지 않는다.

자세한 정책: [docs/SOURCE_POLICY.md](docs/SOURCE_POLICY.md), 현재 범위: [docs/DATA_COVERAGE.md](docs/DATA_COVERAGE.md).

## 배포

GitHub → Cloudflare Workers Builds 자동 배포. 절차·secret 목록·D1 생성 순서는 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## 문서

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — 구조·API 계약·보안 경계
- [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) — 엔티티·상태 enum·날짜 규약
- [docs/DATA_COVERAGE.md](docs/DATA_COVERAGE.md) — 실제 확보 자료와 범위 (정직한 현재 상태)
- [docs/SOURCE_POLICY.md](docs/SOURCE_POLICY.md) — 공식 출처 허용 목록·검토·공개 규칙
- [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) — 토큰·타이포·상태 표현·반응형
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Cloudflare 설정
- [docs/VERIFICATION.md](docs/VERIFICATION.md) — 검증 결과 (코드 테스트 / 실제 자료 / 사람 검토 / 배포 를 별개 상태로)
- [docs/REQUIREMENTS_CHECKLIST.md](docs/REQUIREMENTS_CHECKLIST.md) — 요구사항별 구현 위치

## 라이선스·자산

- 글꼴 Pretendard Variable: SIL OFL 1.1 (`public/fonts/LICENSE-Pretendard.txt`).
- `public/images/atlas-hero-*`, `briefing-cover-*`: 생성 이미지(가상 건축 모형·문구). 실제 학교 사진이 아니며 특정 학교에 붙이지 않는다. 원본 PNG 와 생성 프롬프트는 `data/provenance/`.
- 지도 타일: OpenStreetMap (표시·이용 정책 준수, 대량 저장 없음). 타일 실패 시 학교 점만으로 동작.
