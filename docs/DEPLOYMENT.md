# DEPLOYMENT — Cloudflare Workers (Static Assets + API + D1)

Pages 설정을 섞지 않는다. 설정 파일은 `wrangler.jsonc`. 계정: wrangler 로그인 계정 (`npx wrangler whoami`).

## 1. D1
```bash
npx wrangler d1 create highschool_atlas              # 완료: 59c54453-c684-4a05-a23d-c249efe2e8da (APAC)
npx wrangler d1 migrations apply highschool_atlas --remote   # 완료 (0001_init)
```
preview 환경용 DB 는 `wrangler d1 create highschool_atlas_preview` 후 `wrangler.jsonc` `env.preview.d1_databases[0].database_id` 를 바꾼다 (아직 자리표시자).

## 2. Secrets (키는 저장소·로그·프런트에 넣지 않음)
```bash
npx wrangler secret put ADMIN_API_TOKEN       # 로컬 CLI 게시용 긴 무작위 토큰 (24자 이상). 선택
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN # https://<team>.cloudflareaccess.com  (Access 사용 시)
npx wrangler secret put CF_ACCESS_AUD         # Access 애플리케이션 AUD
npx wrangler secret put SCHOOLINFO_API_KEY    # 수집은 로컬 스크립트가 주로 하므로 선택
npx wrangler secret put NEIS_API_KEY          # 선택
npx wrangler secret put AI_PROVIDER / AI_API_KEY  # 선택 (없으면 AI UI 비활성)
```
`DEV_ADMIN_BYPASS` 는 배포 환경에서 어떤 값이어도 무시된다 (`worker/auth.ts`). 관리 영역 보호는 **Cloudflare Access 로 `/admin` 과 `/api/admin/*` 경로를 감싸는 것**을 권장한다 (대시보드 → Zero Trust → Access → Applications, Self-hosted, 경로 `/admin*`, `/api/admin*`). Worker 는 헤더 존재가 아니라 JWT 서명·issuer·audience·만료를 검증한다.

## 3. GitHub → Workers Builds 자동 배포 (기본 경로)
1. 저장소: `https://github.com/sirlma111216-boop/hihischool` (main).
2. Cloudflare 대시보드 → Workers & Pages → `highschool-atlas` (첫 배포 후 존재) → **Settings → Builds → Connect** 에서 GitHub 앱 설치·저장소 선택.
   - Root directory: `/`
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Production branch: `main`. 비-프로덕션 브랜치는 preview 로 빌드된다 (`--env preview` 를 쓰려면 Deploy command 를 `npx wrangler deploy --env preview` 로 둔 별도 설정).
   - Build variables 에 비밀을 넣지 않는다 (Secrets 는 2단계).
3. 이후 `main` 에 push 하면 자동 빌드·배포된다. Build 로그는 대시보드 Builds 탭.

대안: `.github/workflows/deploy.yml` 이 저장소 secrets `CLOUDFLARE_API_TOKEN`(Workers Scripts:Edit, D1:Edit, Account Settings:Read), `CLOUDFLARE_ACCOUNT_ID` 가 있을 때 `main` push 마다 migrations + deploy 를 수행한다. Workers Builds 를 연결했다면 중복을 피하려 secrets 를 넣지 않거나 deploy job 을 비활성화한다. 두 경로 모두 CI(typecheck·lint·unit·build)는 항상 실행된다.

### 현재 상태 (2026-10-17)
- 첫 배포 완료: **https://highschool-atlas.sirlma.workers.dev** (Version 027fb877…). 가상 자료는 배포 환경에서 차단되므로 학교 수 0 으로 시작한다.
- 저장소 push 완료: `main` → GitHub Actions `ci-and-deploy` 의 check job 이 실행된다. deploy job 은 secrets 가 있을 때만 동작한다.
- **대시보드 Git 연결은 계정 로그인이 필요해 자동화하지 못했다.** 아래 두 경로 중 하나를 선택한다.

#### 경로 A — Workers Builds (권장, 대시보드 5분)
Workers & Pages → `highschool-atlas` → Settings → Builds → **Connect** → GitHub 앱 설치(`sirlma111216-boop/hihischool` 허용) → Build command `npm run build`, Deploy command `npx wrangler deploy`, Root `/`, Production branch `main` → Save. 그 뒤 `main` push 마다 Cloudflare 가 빌드·배포한다. (이 경로를 쓰면 GitHub secrets 는 넣지 않는다.)

#### 경로 B — GitHub Actions (대시보드 없이)
1. Cloudflare → My Profile → API Tokens → Create Token → "Edit Cloudflare Workers" 템플릿 + D1 Edit 권한.
2. GitHub 저장소 → Settings → Secrets and variables → Actions: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`(`3c166b189a0b269ef920ffe9301ae05d`) 추가.
3. 다음 `main` push 부터 `.github/workflows/deploy.yml` 의 deploy job 이 migrations 적용 후 `wrangler deploy` 를 실행한다.

## 4. 수동 배포
```bash
npm run build && npx wrangler deploy
```

## 5. 배포 후 확인
- `GET https://<worker>.workers.dev/api/health` → `{ok:true, env:"production"}`
- `GET /api/coverage` → 학교 수 0 (실제 수집 전) — 가상 자료가 보이면 안 된다.
- `GET /api/admin/me` → 401 (Access/토큰 없이).
- 실제 자료 반영: 로컬에서 `npm run ingest:neis -- --post https://<worker>.workers.dev` (ADMIN_API_TOKEN 을 .dev.vars 에), 검토 패키지 import → 관리 화면에서 사람 승인·공개.

## 6. 비용·제한 (확인일 2026-10-17, 공식 문서 재확인 필요)
Workers 무료 요청·CPU 제한, D1 무료 행 읽기/쓰기·저장 한도, R2 는 선택. 무료 무제한을 약속하지 않는다. 문서 OCR·HWP 변환·대량 수집은 Worker 가 아니라 로컬 명령으로 처리한다.
