/**
 * 데이터셋 JSON(수집 결과·검토 패키지) → D1 SQL 파일. 배포 DB 에 관리 API 토큰 없이 반영할 때 쓴다.
 * npm run db:export-sql -- --out data/review/apply.sql <dataset.json ...>
 *   - 입력 파일은 { dataset: Dataset } 또는 Dataset 그 자체.
 *   - 검토 패키지의 버전 상태는 draft 로 강제한다 (공개는 관리 화면에서 사람이 승인 후).
 *   - 가상 자료(isSynthetic)가 섞여 있으면 중단한다 (배포 DB 오염 방지).
 *   - --coverage <neis.json> 이 있으면 자치구 표본 수집 상태를 partial 로 기록하는 UPDATE 를 덧붙인다.
 * 적용: npx wrangler d1 execute highschool_atlas --remote --file data/review/apply.sql
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { datasetStatements, emptyDataset, statementsToSql, type Dataset } from '../../shared/dataset'
import { SEOUL_DISTRICTS, DISTRICT_NAMES } from '../../shared/constants'
import { districtFromAddress } from '../../shared/normalize'

const args = process.argv.slice(2)
const outIdx = args.indexOf('--out')
const out = outIdx >= 0 ? args[outIdx + 1]! : 'data/review/apply.sql'
const covIdx = args.indexOf('--coverage')
const coverageFile = covIdx >= 0 ? args[covIdx + 1] : undefined
const files = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--out' && args[i - 1] !== '--coverage')
if (files.length === 0) {
  console.error('입력 데이터셋 JSON 이 필요합니다.')
  process.exit(2)
}
const merged: Dataset = emptyDataset()
for (const f of files) {
  const raw = JSON.parse(readFileSync(f, 'utf8')) as { dataset?: Dataset } & Partial<Dataset>
  const ds = (raw.dataset ?? raw) as Partial<Dataset>
  for (const k of Object.keys(merged) as (keyof Dataset)[]) (merged[k] as unknown[]).push(...((ds[k] as unknown[] | undefined) ?? []))
}
if (merged.schools.some((s) => s.isSynthetic) || merged.versions.some((v) => v.isSynthetic) || merged.documents.some((d) => d.isSynthetic)) {
  console.error('가상 자료가 포함되어 있어 중단합니다.')
  process.exit(1)
}
for (const v of merged.versions) {
  v.status = 'draft'
  v.reviewStatus = 'draft'
  v.publishedAt = null
  v.reviewedBy = null
  v.reviewedAt = null
}
for (const d of merged.documents) if (d.reviewStatus === 'approved' && d.documentType !== 'basic_info') d.reviewStatus = 'in_review'
const stmts = datasetStatements(merged)
let sql = `-- 생성 ${new Date().toISOString()} · 입력: ${files.join(', ')} · 버전은 모두 draft\n` + statementsToSql(stmts) + '\n'
if (coverageFile) {
  const cov = JSON.parse(readFileSync(coverageFile, 'utf8')) as { retrievedAt: string; sampleOnly: boolean; total: number | null; dataset: Dataset }
  const per = new Map<string, number>()
  for (const s of cov.dataset.schools) {
    const d = s.district || districtFromAddress(s.address, DISTRICT_NAMES)
    if (d) per.set(d, (per.get(d) ?? 0) + 1)
  }
  const jobId = `job_sql_${cov.retrievedAt.replace(/[^0-9]/g, '').slice(0, 14)}`
  const esc = (s: string) => s.replace(/'/g, "''")
  sql += `INSERT OR REPLACE INTO ingestion_jobs (id, kind, status, scope_json, started_at, finished_at, result_json, actor) VALUES ('${jobId}', 'neis_basic', '${cov.sampleOnly ? 'partial' : 'succeeded'}', '${esc(JSON.stringify({ note: cov.sampleOnly ? '인증키 없는 표본' : `전체 ${cov.total}`, districts: per.size }))}', '${cov.retrievedAt}', '${cov.retrievedAt}', '${esc(JSON.stringify({ rows: cov.dataset.schools.length, total: cov.total }))}', 'sql-export');\n`
  for (const d of SEOUL_DISTRICTS) {
    if (!per.has(d.name)) continue
    sql += `UPDATE coverage_districts SET status = '${cov.sampleOnly ? 'partial' : 'succeeded'}', school_count = ${per.get(d.name)}, last_attempt_at = '${cov.retrievedAt}', error = ${cov.sampleOnly ? "'인증키 없는 표본 수집 (전체 아님)'" : 'NULL'}, job_id = '${jobId}' WHERE district = '${d.name}';\n`
  }
}
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, sql, 'utf8')
console.log(`${out}: 문 ${stmts.length}개 (학교 ${merged.schools.length}, 버전 ${merged.versions.length}(draft), 편성 ${merged.offerings.length}, 근거 ${merged.evidence.length})`)
