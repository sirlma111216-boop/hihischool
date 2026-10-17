/** Worker bindings. process.env 를 쓰지 않는다. 비밀은 wrangler secret 으로만 들어온다. */
export interface Env {
  DB: D1Database
  ASSETS: Fetcher
  APP_ENV: 'development' | 'preview' | 'production' | 'test' | string
  PUBLIC_API_RATE_LIMIT_PER_MIN?: string
  ADMIN_UPLOAD_MAX_BYTES?: string
  SHOW_SYNTHETIC?: string
  DEV_ADMIN_BYPASS?: string
  CF_ACCESS_TEAM_DOMAIN?: string
  CF_ACCESS_AUD?: string
  ADMIN_API_TOKEN?: string
  SCHOOLINFO_API_KEY?: string
  NEIS_API_KEY?: string
  AI_PROVIDER?: string
  AI_API_KEY?: string
  SOURCE_FILES?: R2Bucket
}

export function isDeployed(env: Env): boolean {
  return env.APP_ENV === 'production' || env.APP_ENV === 'preview'
}

/** 가상 자료 노출 여부: 배포 환경에서는 항상 제외. */
export function includeSynthetic(env: Env): boolean {
  if (isDeployed(env)) return false
  return env.SHOW_SYNTHETIC === '1' || env.APP_ENV === 'development' || env.APP_ENV === 'test'
}
