import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../env'
import { authenticateAdmin, originAllowed, type AdminIdentity } from '../auth'
import { checkRateLimit } from '../ratelimit'
import { digest, guardedFetch, sniffFileType } from '../urlguard'
import { loadAllVersions, loadBundle, newId, nowIso, rowToDocument, rowToVersion } from '../db'
import { datasetStatements, emptyDataset, type Dataset } from '@shared/dataset'
import type { CurriculumBundle } from '@shared/types'
import { extractWithAi, aiAvailable } from '../ai'

type Row = Record<string, unknown>
type Vars = { admin: AdminIdentity }
export const adminRoutes = new Hono<{ Bindings: Env; Variables: Vars }>()

const ok = <T>(data: T) => ({ ok: true as const, data })
const fail = (code: string, message: string, details?: unknown) => ({ ok: false as const, error: { code, message, details } })

/* 인증·CSRF·속도 제한 */
adminRoutes.use('*', async (c, next) => {
  const identity = await authenticateAdmin(c.req.raw, c.env)
  if (!identity) return c.json(fail('unauthorized', '관리자 인증이 필요합니다.'), 401)
  if (c.req.method !== 'GET' && !originAllowed(c.req.raw, identity)) return c.json(fail('forbidden', '허용되지 않은 출처의 요청입니다.'), 403)
  const limit = Number(c.env.PUBLIC_API_RATE_LIMIT_PER_MIN ?? '120') || 120
  const allowed = await checkRateLimit(c.env.DB, `admin:${identity.actor}`, limit)
  if (!allowed) return c.json(fail('rate_limited', '요청이 너무 많습니다. 잠시 후 다시 시도하세요.'), 429)
  c.set('admin', identity)
  await next()
})

async function audit(db: D1Database, entityType: string, entityId: string, action: string, before: unknown, after: unknown, actor: string) {
  // 로그에 키·문서 전문·상담 메모를 넣지 않는다. before/after 는 요약 객체만.
  await db
    .prepare(`INSERT INTO audit_log (id, entity_type, entity_id, action, before_json, after_json, actor) VALUES (?,?,?,?,?,?,?)`)
    .bind(newId('aud'), entityType, entityId, action, JSON.stringify(before ?? null), JSON.stringify(after ?? null), actor)
    .run()
}

adminRoutes.get('/me', (c) => c.json(ok({ actor: c.get('admin').actor, method: c.get('admin').method, env: c.env.APP_ENV, aiAvailable: aiAvailable(c.env) })))

adminRoutes.get('/overview', async (c) => {
  const r = await c.env.DB.prepare(
    `SELECT
      (SELECT COUNT(*) FROM curriculum_versions WHERE status = 'draft') AS draft_versions,
      (SELECT COUNT(*) FROM curriculum_versions WHERE status = 'published') AS published_versions,
      (SELECT COUNT(*) FROM source_documents WHERE review_status IN ('draft','in_review')) AS pending_docs,
      (SELECT COUNT(*) FROM schools WHERE is_synthetic = 0) AS schools,
      (SELECT COUNT(*) FROM schools WHERE is_synthetic = 1) AS synthetic_schools,
      (SELECT COUNT(*) FROM ingestion_jobs WHERE status IN ('failed','partial')) AS problem_jobs`,
  ).first<Row>()
  return c.json(ok(r))
})

/* ---------- 데이터셋 가져오기 (초안으로) ---------- */
const importBody = z.object({
  dataset: z.object({
    schools: z.array(z.any()).optional(),
    tracks: z.array(z.any()).optional(),
    documents: z.array(z.any()).optional(),
    evidence: z.array(z.any()).optional(),
    versions: z.array(z.any()).optional(),
    offerings: z.array(z.any()).optional(),
    selectionGroups: z.array(z.any()).optional(),
    facts: z.array(z.any()).optional(),
    programs: z.array(z.any()).optional(),
    admissionRules: z.array(z.any()).optional(),
    admissionEvents: z.array(z.any()).optional(),
  }),
  /** 검토 완료·공개 상태를 그대로 반영 (합성 fixture 시드 또는 검토 패키지). 기본은 모두 초안으로 강제. */
  keepStatus: z.boolean().optional().default(false),
  jobLabel: z.string().max(200).optional(),
})

adminRoutes.post('/import', async (c) => {
  const maxBytes = Number(c.env.ADMIN_UPLOAD_MAX_BYTES ?? '5242880') || 5242880
  const len = Number(c.req.header('Content-Length') ?? '0')
  if (len > maxBytes) return c.json(fail('payload_too_large', `요청 크기 제한 ${maxBytes} 바이트를 초과했습니다.`), 413)
  const text = await c.req.text()
  if (text.length > maxBytes) return c.json(fail('payload_too_large', `요청 크기 제한을 초과했습니다.`), 413)
  let parsedJson: unknown
  try {
    parsedJson = JSON.parse(text)
  } catch {
    return c.json(fail('bad_request', 'JSON 이 아닙니다.'), 400)
  }
  const body = importBody.safeParse(parsedJson)
  if (!body.success) return c.json(fail('bad_request', '데이터셋 형식이 올바르지 않습니다.', body.error.flatten()), 400)
  const ds: Dataset = { ...emptyDataset(), ...(body.data.dataset as Partial<Dataset>) }
  const actor = c.get('admin').actor

  // 배포 환경에서는 가상 자료를 가져오지 못하게 막는다 (production 데이터 오염 방지)
  const hasSynthetic = ds.schools.some((s) => s.isSynthetic) || ds.versions.some((v) => v.isSynthetic)
  if (hasSynthetic && (c.env.APP_ENV === 'production' || c.env.APP_ENV === 'preview')) {
    return c.json(fail('forbidden', '배포 환경에는 가상 자료를 가져올 수 없습니다.'), 403)
  }

  if (!body.data.keepStatus) {
    for (const v of ds.versions) {
      v.status = 'draft'
      v.reviewStatus = 'draft'
      v.publishedAt = null
      v.reviewedBy = null
      v.reviewedAt = null
    }
    for (const d of ds.documents) if (d.reviewStatus === 'approved') d.reviewStatus = 'in_review'
    for (const r of ds.admissionRules) if (r.status === 'published') r.status = 'draft'
  }
  // 검토자 이름이 'AI' 류면 사람이 아닌 승인으로 간주해 제거
  for (const v of ds.versions) if (v.reviewedBy && /ai|claude|gpt|llm|bot/i.test(v.reviewedBy)) v.reviewedBy = null
  for (const e of ds.evidence) if (e.reviewedBy && /ai|claude|gpt|llm|bot/i.test(e.reviewedBy)) e.reviewedBy = null

  const stmts = datasetStatements(ds)
  const jobId = newId('job')
  await c.env.DB.prepare(`INSERT INTO ingestion_jobs (id, kind, status, scope_json, started_at, actor) VALUES (?,?,?,?,?,?)`)
    .bind(jobId, 'document_import', 'running', JSON.stringify({ label: body.data.jobLabel ?? null, counts: countDs(ds) }), nowIso(), actor)
    .run()
  try {
    // D1 batch 는 하나의 트랜잭션으로 실행된다 (전부 성공 또는 전부 실패).
    for (let i = 0; i < stmts.length; i += 100) {
      const chunk = stmts.slice(i, i + 100).map((s) => c.env.DB.prepare(s.sql).bind(...s.params))
      await c.env.DB.batch(chunk)
    }
    await c.env.DB.prepare(`UPDATE ingestion_jobs SET status = 'succeeded', finished_at = ?, result_json = ? WHERE id = ?`).bind(nowIso(), JSON.stringify(countDs(ds)), jobId).run()
    await audit(c.env.DB, 'dataset', jobId, 'import', null, countDs(ds), actor)
    return c.json(ok({ jobId, imported: countDs(ds), statusForced: !body.data.keepStatus }))
  } catch (e) {
    await c.env.DB.prepare(`UPDATE ingestion_jobs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?`).bind(nowIso(), e instanceof Error ? e.message : 'import failed', jobId).run()
    return c.json(fail('import_failed', '가져오기 중 오류가 발생했습니다. 이전 공개 버전은 유지됩니다.', e instanceof Error ? e.message : null), 500)
  }
})

function countDs(ds: Dataset) {
  return Object.fromEntries(Object.entries(ds).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0]))
}

/* ---------- 문서·버전 목록 (초안 포함) ---------- */
adminRoutes.get('/documents', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM source_documents ORDER BY review_status, created_at DESC LIMIT 500`).all<Row>()
  return c.json(ok(r.results.map(rowToDocument)))
})

adminRoutes.get('/versions', async (c) => {
  const schoolId = c.req.query('schoolId')
  const r = schoolId
    ? await loadAllVersions(c.env.DB, schoolId)
    : (await c.env.DB.prepare(`SELECT v.*, s.official_name AS school_name FROM curriculum_versions v JOIN schools s ON s.id = v.school_id ORDER BY v.status, v.created_at DESC LIMIT 500`).all<Row>()).results.map((row) => ({ ...rowToVersion(row), schoolName: String(row.school_name) }))
  return c.json(ok(r))
})

adminRoutes.get('/versions/:id', async (c) => {
  const b = await loadBundle(c.env.DB, c.req.param('id'))
  if (!b) return c.json(fail('not_found', '버전을 찾을 수 없습니다.'), 404)
  return c.json(ok({ bundle: b, checks: publishChecks(b) }))
})

/* ---------- 편집 (오탈자·근거 연결) ---------- */
const editOffering = z.object({
  offeringId: z.string().max(100),
  patch: z.object({
    courseOriginalName: z.string().max(200).optional(),
    courseCanonicalId: z.string().max(200).nullable().optional(),
    creditValue: z.number().nullable().optional(),
    requirementType: z.enum(['school_designated', 'student_choice', 'unknown']).optional(),
    selectionGroupId: z.string().max(100).nullable().optional(),
    offeringStatus: z.enum(['planned', 'candidate', 'opened', 'joint', 'online', 'afterschool', 'unknown']).optional(),
    note: z.string().max(1000).nullable().optional(),
    evidenceIds: z.array(z.string().max(100)).max(20).optional(),
  }),
})
adminRoutes.post('/offerings/edit', async (c) => {
  const body = editOffering.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '편집 요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const row = await c.env.DB.prepare(`SELECT o.*, v.status AS vstatus FROM curriculum_offerings o JOIN curriculum_versions v ON v.id = o.version_id WHERE o.id = ?`).bind(body.data.offeringId).first<Row>()
  if (!row) return c.json(fail('not_found', '편성을 찾을 수 없습니다.'), 404)
  if (String(row.vstatus) === 'published') return c.json(fail('conflict', '공개된 버전은 직접 수정하지 않습니다. 새 초안 버전을 만들어 검토·공개하세요.'), 409)
  const p = body.data.patch
  const sets: string[] = []
  const params: (string | number | null)[] = []
  const map: Record<string, string> = { courseOriginalName: 'course_original_name', courseCanonicalId: 'course_canonical_id', creditValue: 'credit_value', requirementType: 'requirement_type', selectionGroupId: 'selection_group_id', offeringStatus: 'offering_status', note: 'note' }
  for (const [k, col] of Object.entries(map)) {
    if (k in p) {
      sets.push(`${col} = ?`)
      params.push((p as Record<string, string | number | null | undefined>)[k] ?? null)
    }
  }
  if (p.evidenceIds) {
    sets.push(`evidence_ids = ?`)
    params.push(JSON.stringify(p.evidenceIds))
  }
  if (sets.length === 0) return c.json(fail('bad_request', '변경할 내용이 없습니다.'), 400)
  params.push(body.data.offeringId)
  await c.env.DB.prepare(`UPDATE curriculum_offerings SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  await audit(c.env.DB, 'offering', body.data.offeringId, 'edit', { name: row.course_original_name, credit: row.credit_value }, p, c.get('admin').actor)
  return c.json(ok({ updated: true }))
})

const editGroup = z.object({
  groupId: z.string().max(100),
  patch: z.object({
    label: z.string().max(100).optional(),
    minSelections: z.number().int().nullable().optional(),
    maxSelections: z.number().int().nullable().optional(),
    minCredits: z.number().nullable().optional(),
    maxCredits: z.number().nullable().optional(),
    periodScope: z.enum(['semester', 'grade_year', 'all_years', 'unknown']).optional(),
    verifiedRules: z.array(z.string().max(300)).max(20).optional(),
    unknownRules: z.array(z.string().max(300)).max(20).optional(),
    ruleStatus: z.enum(['verified', 'unverified', 'conflict']).optional(),
    evidenceIds: z.array(z.string().max(100)).max(20).optional(),
  }),
})
adminRoutes.post('/groups/edit', async (c) => {
  const body = editGroup.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '편집 요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const row = await c.env.DB.prepare(`SELECT g.*, v.status AS vstatus FROM selection_groups g JOIN curriculum_versions v ON v.id = g.version_id WHERE g.id = ?`).bind(body.data.groupId).first<Row>()
  if (!row) return c.json(fail('not_found', '선택군을 찾을 수 없습니다.'), 404)
  if (String(row.vstatus) === 'published') return c.json(fail('conflict', '공개된 버전은 직접 수정하지 않습니다.'), 409)
  const p = body.data.patch
  // 규칙을 verified 로 바꾸려면 근거가 있어야 한다
  const evidenceIds = p.evidenceIds ?? (JSON.parse(String(row.evidence_ids ?? '[]')) as string[])
  if (p.ruleStatus === 'verified' && evidenceIds.length === 0) return c.json(fail('validation', '근거 없이 규칙을 확인됨으로 표시할 수 없습니다.'), 422)
  const sets: string[] = []
  const params: (string | number | null)[] = []
  const scalar: Record<string, string> = { label: 'label', minSelections: 'min_selections', maxSelections: 'max_selections', minCredits: 'min_credits', maxCredits: 'max_credits', periodScope: 'period_scope', ruleStatus: 'rule_status' }
  for (const [k, col] of Object.entries(scalar)) if (k in p) { sets.push(`${col} = ?`); params.push((p as Record<string, string | number | null | undefined>)[k] ?? null) }
  const jsonCols: Record<string, string> = { verifiedRules: 'verified_rules', unknownRules: 'unknown_rules', evidenceIds: 'evidence_ids' }
  for (const [k, col] of Object.entries(jsonCols)) if (k in p) { sets.push(`${col} = ?`); params.push(JSON.stringify((p as Record<string, unknown>)[k])) }
  if (sets.length === 0) return c.json(fail('bad_request', '변경할 내용이 없습니다.'), 400)
  params.push(body.data.groupId)
  await c.env.DB.prepare(`UPDATE selection_groups SET ${sets.join(', ')} WHERE id = ?`).bind(...params).run()
  await audit(c.env.DB, 'selection_group', body.data.groupId, 'edit', { rule_status: row.rule_status, max: row.max_selections }, p, c.get('admin').actor)
  return c.json(ok({ updated: true }))
})

/* ---------- 검토 ---------- */
const reviewBody = z.object({
  versionId: z.string().max(100),
  reviewStatus: z.enum(['in_review', 'approved', 'rejected']),
  reviewer: z.string().min(1).max(100),
  note: z.string().max(2000).optional(),
})
adminRoutes.post('/review', async (c) => {
  const body = reviewBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '검토 요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const { versionId, reviewStatus, reviewer, note } = body.data
  if (/^(ai|claude|gpt|llm|bot|자동)$/i.test(reviewer.trim())) return c.json(fail('validation', '검토 완료자는 사람이어야 합니다. 코드 실행을 검토자로 기록하지 않습니다.'), 422)
  const b = await loadBundle(c.env.DB, versionId)
  if (!b) return c.json(fail('not_found', '버전을 찾을 수 없습니다.'), 404)
  if (b.version.status === 'published') return c.json(fail('conflict', '이미 공개된 버전입니다.'), 409)
  if (reviewStatus === 'approved') {
    const checks = publishChecks(b)
    const blocking = checks.filter((x) => x.level === 'error')
    if (blocking.length > 0) return c.json(fail('validation', '승인을 막는 오류가 있습니다.', blocking), 422)
  }
  const before = { reviewStatus: b.version.reviewStatus, reviewedBy: b.version.reviewedBy }
  await c.env.DB.prepare(`UPDATE curriculum_versions SET review_status = ?, reviewed_by = ?, reviewed_at = ?, notes = COALESCE(?, notes) WHERE id = ?`)
    .bind(reviewStatus, reviewStatus === 'approved' ? reviewer : b.version.reviewedBy, reviewStatus === 'approved' ? nowIso() : b.version.reviewedAt, note ?? null, versionId)
    .run()
  // 승인 시 관련 문서도 승인 상태로
  if (reviewStatus === 'approved' && b.version.documentIds.length > 0) {
    await c.env.DB.batch(b.version.documentIds.map((d) => c.env.DB.prepare(`UPDATE source_documents SET review_status = 'approved' WHERE id = ? AND review_status IN ('draft','in_review')`).bind(d)))
  }
  await audit(c.env.DB, 'curriculum_version', versionId, `review:${reviewStatus}`, before, { reviewStatus, reviewer }, c.get('admin').actor)
  return c.json(ok({ versionId, reviewStatus }))
})

/* ---------- 공개 (버전 있는 승인 묶음) ---------- */
export interface PublishCheck {
  level: 'error' | 'warning'
  code: string
  message: string
  ids?: string[]
}

export function publishChecks(b: CurriculumBundle): PublishCheck[] {
  const out: PublishCheck[] = []
  const v = b.version
  if (!Number.isInteger(v.cohortYear) || v.cohortYear < 2015) out.push({ level: 'error', code: 'cohort_missing', message: '대상 입학연도가 없습니다.' })
  if (v.documentIds.length === 0) out.push({ level: 'error', code: 'source_missing', message: '출처 문서가 연결되지 않았습니다.' })
  for (const d of b.documents) {
    if (d.cohortYear !== null && d.cohortYear !== v.cohortYear && d.documentType === 'curriculum_table') out.push({ level: 'error', code: 'cohort_mismatch', message: `문서 "${d.title}" 의 대상 입학연도(${d.cohortYear})가 버전(${v.cohortYear})과 다릅니다.`, ids: [d.id] })
  }
  const noEv = b.offerings.filter((o) => o.evidenceIds.length === 0)
  if (noEv.length > 0) out.push({ level: 'error', code: 'offering_without_evidence', message: `근거가 없는 편성 ${noEv.length}건`, ids: noEv.map((o) => o.id) })
  const evIds = new Set(b.evidence.map((e) => e.id))
  const dangling = b.offerings.filter((o) => o.evidenceIds.some((id) => !evIds.has(id)))
  if (dangling.length > 0) out.push({ level: 'error', code: 'evidence_missing', message: `존재하지 않는 근거를 참조하는 편성 ${dangling.length}건`, ids: dangling.map((o) => o.id) })
  const groupIds = new Set(b.selectionGroups.map((g) => g.id))
  const badGroup = b.offerings.filter((o) => o.selectionGroupId && !groupIds.has(o.selectionGroupId))
  if (badGroup.length > 0) out.push({ level: 'error', code: 'group_missing', message: `존재하지 않는 선택군을 참조하는 편성 ${badGroup.length}건`, ids: badGroup.map((o) => o.id) })
  const offIds = new Set(b.offerings.map((o) => o.id))
  for (const g of b.selectionGroups) {
    const missing = g.memberOfferingIds.filter((id) => !offIds.has(id))
    if (missing.length > 0) out.push({ level: 'error', code: 'group_member_missing', message: `${g.label}: 존재하지 않는 구성원 ${missing.length}건`, ids: [g.id] })
    if (g.ruleStatus === 'verified') {
      if (g.evidenceIds.length === 0) out.push({ level: 'error', code: 'group_rule_without_evidence', message: `${g.label}: 확인된 규칙인데 근거가 없습니다.`, ids: [g.id] })
      if (g.minSelections !== null && g.maxSelections !== null && g.minSelections > g.maxSelections) out.push({ level: 'error', code: 'group_rule_contradiction', message: `${g.label}: 최소 선택 수가 최대보다 큽니다.`, ids: [g.id] })
      if (g.maxSelections !== null && g.maxSelections > g.memberOfferingIds.length) out.push({ level: 'warning', code: 'group_rule_loose', message: `${g.label}: 최대 선택 수가 구성원 수보다 큽니다.`, ids: [g.id] })
    }
    if (g.ruleStatus !== 'verified') out.push({ level: 'warning', code: 'group_rule_unverified', message: `${g.label}: 선택 규칙 ${g.ruleStatus === 'conflict' ? '충돌' : '미확인'} 상태로 공개됩니다 (판단 보류로 표시).`, ids: [g.id] })
  }
  const nullCredit = b.offerings.filter((o) => o.creditValue === null)
  if (nullCredit.length > 0) out.push({ level: 'warning', code: 'credit_missing', message: `학점 미확인 편성 ${nullCredit.length}건 (0 으로 계산되지 않음)`, ids: nullCredit.map((o) => o.id) })
  const units = new Set(b.offerings.filter((o) => o.creditValue !== null).map((o) => o.creditUnit))
  if (units.size > 1) out.push({ level: 'warning', code: 'mixed_units', message: '단위와 학점이 섞여 있습니다.' })
  const unreviewedEv = b.evidence.filter((e) => !e.reviewedBy)
  if (unreviewedEv.length > 0) out.push({ level: 'warning', code: 'evidence_unreviewed', message: `사람 검토가 없는 근거 ${unreviewedEv.length}건`, ids: unreviewedEv.map((e) => e.id) })
  return out
}

adminRoutes.post('/publish', async (c) => {
  const body = z.object({ versionId: z.string().max(100) }).safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', 'versionId 가 필요합니다.'), 400)
  const b = await loadBundle(c.env.DB, body.data.versionId)
  if (!b) return c.json(fail('not_found', '버전을 찾을 수 없습니다.'), 404)
  if (b.version.status === 'published') return c.json(fail('conflict', '이미 공개된 버전입니다.'), 409)
  if (b.version.reviewStatus !== 'approved' || !b.version.reviewedBy) return c.json(fail('validation', '사람 검토 승인이 없는 버전은 공개할 수 없습니다.'), 422)
  if (b.version.isSynthetic && (c.env.APP_ENV === 'production' || c.env.APP_ENV === 'preview')) return c.json(fail('forbidden', '배포 환경에 가상 자료를 공개할 수 없습니다.'), 403)
  const checks = publishChecks(b)
  const blocking = checks.filter((x) => x.level === 'error')
  if (blocking.length > 0) return c.json(fail('validation', '공개를 막는 오류가 있습니다.', blocking), 422)

  const prev = await c.env.DB.prepare(`SELECT id FROM curriculum_versions WHERE school_id = ? AND cohort_year = ? AND (track_id IS ? OR track_id = ?) AND status = 'published' AND id <> ?`)
    .bind(b.version.schoolId, b.version.cohortYear, b.version.trackId, b.version.trackId, b.version.id)
    .all<Row>()
  const bundleId = newId('pub')
  const stmts = [
    ...prev.results.map((p) => c.env.DB.prepare(`UPDATE curriculum_versions SET status = 'superseded' WHERE id = ?`).bind(String(p.id))),
    c.env.DB.prepare(`UPDATE curriculum_versions SET status = 'published', published_at = ?, supersedes_id = ? WHERE id = ?`).bind(nowIso(), prev.results[0] ? String(prev.results[0].id) : null, b.version.id),
    ...b.version.documentIds.map((d) => c.env.DB.prepare(`UPDATE source_documents SET review_status = 'approved' WHERE id = ? AND review_status IN ('draft','in_review')`).bind(d)),
    c.env.DB.prepare(`INSERT INTO publish_bundles (id, version, actor, summary_json) VALUES (?, (SELECT COALESCE(MAX(version),0)+1 FROM publish_bundles), ?, ?)`).bind(bundleId, c.get('admin').actor, JSON.stringify({ versionId: b.version.id, schoolId: b.version.schoolId, cohortYear: b.version.cohortYear, superseded: prev.results.map((p) => String(p.id)), warnings: checks.filter((x) => x.level === 'warning').map((x) => x.code) })),
  ]
  // 하나의 트랜잭션. 실패하면 이전 공개 버전이 유지된다.
  await c.env.DB.batch(stmts)
  await audit(c.env.DB, 'curriculum_version', b.version.id, 'publish', { status: 'draft' }, { status: 'published', bundleId }, c.get('admin').actor)
  return c.json(ok({ versionId: b.version.id, bundleId, superseded: prev.results.map((p) => String(p.id)), warnings: checks.filter((x) => x.level === 'warning') }))
})

adminRoutes.post('/withdraw', async (c) => {
  const body = z.object({ versionId: z.string().max(100), reason: z.string().max(500) }).safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', 'versionId, reason 이 필요합니다.'), 400)
  const r = await c.env.DB.prepare(`UPDATE curriculum_versions SET status = 'withdrawn', notes = COALESCE(notes,'') || ' [철회: ' || ? || ']' WHERE id = ? AND status = 'published'`).bind(body.data.reason, body.data.versionId).run()
  if (!r.meta.changes) return c.json(fail('not_found', '공개 상태의 버전이 아닙니다.'), 404)
  await audit(c.env.DB, 'curriculum_version', body.data.versionId, 'withdraw', { status: 'published' }, { status: 'withdrawn', reason: body.data.reason }, c.get('admin').actor)
  return c.json(ok({ withdrawn: true }))
})

/* ---------- 수집 작업·범위 기록 ---------- */
adminRoutes.get('/jobs', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM ingestion_jobs ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 100`).all<Row>()
  return c.json(ok(r.results))
})

const coverageBody = z.object({
  jobKind: z.enum(['schoolinfo_basic', 'neis_basic', 'other']),
  districts: z.array(z.object({ district: z.string().max(20), status: z.enum(['succeeded', 'failed', 'partial', 'not_attempted']), schoolCount: z.number().int().min(0), error: z.string().max(500).nullable() })).max(25),
  note: z.string().max(500).optional(),
})
adminRoutes.post('/jobs/coverage', async (c) => {
  const body = coverageBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '범위 기록 형식이 올바르지 않습니다.', body.error.flatten()), 400)
  const jobId = newId('job')
  const succeeded = body.data.districts.filter((d) => d.status === 'succeeded').length
  const failed = body.data.districts.filter((d) => d.status === 'failed').length
  const status = failed === 0 && succeeded > 0 ? 'succeeded' : succeeded > 0 ? 'partial' : 'failed'
  const now = nowIso()
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO ingestion_jobs (id, kind, status, scope_json, started_at, finished_at, result_json, actor) VALUES (?,?,?,?,?,?,?,?)`).bind(jobId, body.data.jobKind, status, JSON.stringify({ note: body.data.note ?? null, districts: body.data.districts.length }), now, now, JSON.stringify({ succeeded, failed }), c.get('admin').actor),
    ...body.data.districts.map((d) => c.env.DB.prepare(`UPDATE coverage_districts SET status = ?, school_count = ?, last_attempt_at = ?, error = ?, job_id = ? WHERE district = ?`).bind(d.status, d.schoolCount, now, d.error, jobId, d.district)),
  ])
  return c.json(ok({ jobId, status, succeeded, failed }))
})

/* ---------- 공식 URL 확인 (허용 목록, 크기·시간 제한) ---------- */
const sourceCheckBody = z.object({
  url: z.string().url().max(1000),
  schoolId: z.string().max(100).nullable().optional(),
  documentType: z.string().max(50).optional().default('other'),
  title: z.string().max(300).optional(),
  publisher: z.string().max(200).optional(),
  cohortYear: z.number().int().nullable().optional(),
})
adminRoutes.post('/sources/check', async (c) => {
  const body = sourceCheckBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', 'URL 등록 형식이 올바르지 않습니다.', body.error.flatten()), 400)
  const extraHosts: string[] = []
  if (body.data.schoolId) {
    const s = await c.env.DB.prepare(`SELECT homepage FROM schools WHERE id = ?`).bind(body.data.schoolId).first<Row>()
    if (s?.homepage) {
      try {
        extraHosts.push(new URL(String(s.homepage)).hostname)
      } catch {
        /* ignore */
      }
    }
  }
  const maxBytes = Number(c.env.ADMIN_UPLOAD_MAX_BYTES ?? '5242880') || 5242880
  const r = await guardedFetch(body.data.url, { maxBytes, timeoutMs: 15000, maxRedirects: 3 }, extraHosts)
  const sniff = r.body ? sniffFileType(r.body) : 'unknown'
  const docId = newId('doc')
  const parseStatus = r.ok ? 'retrieved' : 'not_retrieved'
  await c.env.DB.prepare(`INSERT INTO source_documents (id, school_id, document_type, title, official_url, publisher, retrieved_at, cohort_year, version, sha256, rights, parse_status, review_status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(docId, body.data.schoolId ?? null, body.data.documentType, body.data.title ?? body.data.url, r.finalUrl, body.data.publisher ?? '미확인', r.ok ? nowIso() : null, body.data.cohortYear ?? null, '1', r.sha256, 'link_only', parseStatus, 'draft', r.error ? `접근 결과: ${r.error}` : `확인됨 (${r.contentType ?? '형식 미상'}, ${r.bytesRead} 바이트, 서명 ${sniff})`)
    .run()
  // 원문 본문은 R2 가 연결되고 권한이 확인된 경우에만 비공개로 보관한다. 그렇지 않으면 메타데이터만 남긴다.
  let stored = false
  if (r.ok && r.body && c.env.SOURCE_FILES) {
    await c.env.SOURCE_FILES.put(`private/sources/${docId}`, r.body as unknown as ArrayBuffer, { httpMetadata: { contentType: r.contentType ?? 'application/octet-stream' } })
    stored = true
  }
  await audit(c.env.DB, 'source_document', docId, 'url_check', null, { url: r.finalUrl, ok: r.ok, status: r.status, sniff, stored }, c.get('admin').actor)
  return c.json(ok({ documentId: docId, fetched: r.ok, status: r.status, contentType: r.contentType, bytes: r.bytesRead, sha256: r.sha256, truncated: r.truncated, error: r.error, fileSignature: sniff, storedPrivately: stored, nextStep: r.ok ? '로컬에서 `npm run docs:extract -- --doc <id> --file <경로>` 로 추출 후 검토 패키지를 가져오세요.' : '공식 링크·제목·확인 위치만 등록되었습니다.' }))
})

/* ---------- 업로드 (서명·크기 검사; R2 없으면 메타데이터만) ---------- */
adminRoutes.post('/upload', async (c) => {
  const maxBytes = Number(c.env.ADMIN_UPLOAD_MAX_BYTES ?? '5242880') || 5242880
  const len = Number(c.req.header('Content-Length') ?? '0')
  if (len > maxBytes) return c.json(fail('payload_too_large', `업로드 크기 제한 ${maxBytes} 바이트를 초과했습니다.`), 413)
  const form = await c.req.formData().catch(() => null)
  if (!form) return c.json(fail('bad_request', 'multipart/form-data 가 필요합니다.'), 400)
  const file = form.get('file')
  if (!(file instanceof File)) return c.json(fail('bad_request', 'file 필드가 필요합니다.'), 400)
  if (file.size > maxBytes) return c.json(fail('payload_too_large', '파일이 너무 큽니다. 로컬 처리 명령을 사용하세요.'), 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const sig = sniffFileType(bytes)
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const allowed: Record<string, string[]> = { pdf: ['pdf'], zip: ['hwpx', 'xlsx'], hwp: ['hwp'] }
  if (sig === 'unknown' || !(allowed[sig] ?? []).includes(ext)) return c.json(fail('unsupported_media', `파일 서명(${sig})과 확장자(${ext})가 허용 조합이 아닙니다.`), 415)
  const sha256 = await digest(bytes)
  const docId = newId('doc')
  const schoolId = String(form.get('schoolId') ?? '') || null
  const documentType = String(form.get('documentType') ?? 'other')
  const cohortYear = Number(form.get('cohortYear') ?? '') || null
  await c.env.DB.prepare(`INSERT INTO source_documents (id, school_id, document_type, title, original_filename, publisher, retrieved_at, cohort_year, version, sha256, rights, parse_status, review_status, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(docId, schoolId, documentType, String(form.get('title') ?? file.name), file.name, String(form.get('publisher') ?? '미확인'), nowIso(), cohortYear, '1', sha256, String(form.get('rights') ?? 'unknown'), 'retrieved', 'draft', `업로드 (${sig}, ${bytes.byteLength} 바이트). 추출은 로컬 명령으로 수행`)
    .run()
  let stored = false
  if (c.env.SOURCE_FILES) {
    await c.env.SOURCE_FILES.put(`private/uploads/${docId}`, bytes as unknown as ArrayBuffer, { httpMetadata: { contentType: sig === 'pdf' ? 'application/pdf' : 'application/octet-stream' } })
    stored = true
  }
  await audit(c.env.DB, 'source_document', docId, 'upload', null, { name: file.name, size: bytes.byteLength, sig, stored }, c.get('admin').actor)
  return c.json(ok({ documentId: docId, sha256, fileSignature: sig, storedPrivately: stored, note: stored ? '비공개 저장소에 보관되었습니다.' : 'R2 가 연결되지 않아 메타데이터만 기록했습니다. 로컬에서 추출하세요.' }))
})

/* ---------- 감사 기록 ---------- */
adminRoutes.get('/audit', async (c) => {
  const entityId = c.req.query('entityId')
  const r = entityId
    ? await c.env.DB.prepare(`SELECT * FROM audit_log WHERE entity_id = ? ORDER BY created_at DESC LIMIT 200`).bind(entityId).all<Row>()
    : await c.env.DB.prepare(`SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 200`).all<Row>()
  return c.json(ok(r.results))
})

/* ---------- 선택: 생성형 AI 구조화 초안 ---------- */
adminRoutes.post('/ai/extract', async (c) => {
  if (!aiAvailable(c.env)) return c.json(fail('ai_disabled', '생성형 AI 보조가 비활성입니다. AI_PROVIDER 와 AI_API_KEY 가 설정되지 않았습니다.'), 503)
  const body = z.object({ documentId: z.string().max(100), text: z.string().max(60000), cohortYear: z.number().int(), dryRun: z.boolean().optional().default(true) }).safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const r = await extractWithAi(c.env, body.data)
  await audit(c.env.DB, 'source_document', body.data.documentId, 'ai_extract', null, { chars: body.data.text.length, accepted: r.accepted.length, rejected: r.rejected.length, estimatedCost: r.estimatedCost }, c.get('admin').actor)
  return c.json(ok(r))
})
