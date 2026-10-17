# CLAUDE.md — 고교 아틀라스

서울 고등학교 교육과정·진학상담 워크스페이스. React+Vite 프런트, Hono Worker API, D1. 상담 기록은 서버에 저장하지 않는다.

## 명령
- `npm run dev` (5173) · `npm run typecheck` · `npm run lint` · `npm run test:unit` · `npm run test:worker` · `npm run test:e2e` · `npm run build`
- 로컬 DB: `npm run db:migrate:local` → `npm run db:seed:synthetic` (가상 자료) · 초기화 `npm run db:reset:local`
- 문서: `npm run docs:fixtures` → `npm run docs:extract -- --file F --doc ID` → `npm run docs:package -- --extraction J --school S --cohort Y`

## 구조
- `shared/` 타입·규칙 엔진·검색·정규화 (브라우저/Worker/스크립트 공용). 엔진은 결정론적, LLM 금지.
- `worker/` Hono 라우트. `routes/public.ts` 는 published 만, `routes/admin.ts` 는 인증 필수 (`auth.ts`: Access JWT 검증 / Bearer 토큰 / dev 우회는 development 에서만).
- `src/` 화면. 상태는 `lib/store.tsx` (sessionStorage; 상담은 메모리, 옵트인 localStorage).
- `fixtures/synthetic.ts` 가상 학교 A/B/C/D — `isSynthetic=true`, 배포 환경에서 import/publish/조회 모두 차단.
- `scripts/docs`, `scripts/ingest` 로컬 처리. Worker 안에서 OCR·HWP·대량 수집 금지.

## 불변 조건 (코드 리뷰 시 확인)
- 자료 없음 ≠ 미편성. `DataStatus` 로 구분. null 학점을 0 으로 더하지 않음.
- 입학연도 불일치 자료는 참고 전용 (`resolveCurriculum`). 선택군 규칙 미확인/충돌은 `insufficient_data`.
- 같은 학기만으로 충돌 아님. 교차 편성은 한 단위. '최대 n' 은 최소를 뜻하지 않음.
- 공개는 사람 승인(검토자 이름) + `publishChecks` 오류 0 일 때만. 자동 추출은 항상 초안.
- 키·상담 메모·문서 전문을 로그·응답·커밋에 넣지 않음. CSV 는 `csvSafeCell`.
- 외부 URL 수집은 `urlguard.ts` 허용 목록만. 범용 프록시 금지.
- 소리·3D·파티클·다크 대시보드 없음. 상태는 색+아이콘+문구.

## 스타일
- 한글 UI 문구는 단정하게. 확인/미확인/해석/질문을 구분하는 문장 사용.
- TS strict, `noUncheckedIndexedAccess`. 외부 값은 `normalize.ts` 로 enum 화하고 모르면 `unknown`.
- Windows 에서 Bash heredoc 은 백슬래시를 먹는다 — 패치는 node 스크립트 또는 Edit 도구.
