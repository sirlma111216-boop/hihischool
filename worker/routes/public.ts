import { Hono } from 'hono'
import { z } from 'zod'
import type { Env } from '../env'
import { includeSynthetic } from '../env'
import { loadBundle, loadDocuments, loadEvidence, loadPublishedVersions, loadSchool, rowToDocument, rowToEvent, rowToEvidence, rowToFact, rowToOffering, rowToProgram, rowToRule, rowToSchool, rowToTrack, rowToVersion } from '../db'
import { resolveCurriculum } from '@shared/engine/cohort'
import { validatePlan } from '@shared/engine/selection'
import { searchFeasibleCombos, matchWishes } from '@shared/engine/planner'
import { matchesName } from '@shared/search/hangul'
import { parseQuery } from '@shared/search/query'
import { MAX_COMPARE_SCHOOLS } from '@shared/constants'
import type { CoverageSummary, CurriculumLookup, CurriculumOffering, School, SchoolTrack, SelectionGroup } from '@shared/types'

type Row = Record<string, unknown>
export const publicRoutes = new Hono<{ Bindings: Env }>()

const ok = <T>(data: T) => ({ ok: true as const, data })
const fail = (code: string, message: string, details?: unknown) => ({ ok: false as const, error: { code, message, details } })

/* ---------- 건강 ---------- */
publicRoutes.get('/health', (c) => c.json(ok({ env: c.env.APP_ENV, time: new Date().toISOString() })))

/* ---------- 학교 검색 ---------- */
const listQuery = z.object({
  q: z.string().max(200).optional().default(''),
  district: z.string().max(200).optional(),
  schoolType: z.string().max(200).optional(),
  establishment: z.string().max(100).optional(),
  gender: z.string().max(100).optional(),
  dayNight: z.string().max(100).optional(),
  course: z.string().max(100).optional(),
  program: z.string().max(100).optional(),
  curriculumStatus: z.enum(['published', 'draft_only', 'none', 'any']).optional().default('any'),
  cohortYear: z.coerce.number().int().min(2015).max(2040).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(200).optional().default(50),
  sort: z.enum(['name', 'district']).optional().default('name'),
})

export interface SchoolListItem {
  school: School
  curriculumStatus: 'published' | 'draft_only' | 'none' | 'other_cohort_only'
  publishedCohortYears: number[]
  courseMatch: { status: 'confirmed' | 'confirmed_absent' | 'unknown'; offerings: { name: string; grade: number; semester: number; credit: number | null; requirement: string; groupId: string | null }[] } | null
  programMatch: { name: string; kind: string; phase: string; status: string }[] | null
}

publicRoutes.get('/schools', async (c) => {
  const parsed = listQuery.safeParse(Object.fromEntries(new URL(c.req.url).searchParams))
  if (!parsed.success) return c.json(fail('bad_request', '검색 조건이 올바르지 않습니다.', parsed.error.flatten()), 400)
  const q = parsed.data
  const allowSyn = includeSynthetic(c.env)

  // 문장 검색 해석 → 조건 병합
  const pq = parseQuery(q.q)
  const districts = new Set([...(q.district ? q.district.split(',') : []), ...pq.district].filter(Boolean))
  const types = new Set([...(q.schoolType ? q.schoolType.split(',') : []), ...pq.schoolType].filter(Boolean))
  const ests = new Set([...(q.establishment ? q.establishment.split(',') : []), ...pq.establishment].filter(Boolean))
  const genders = new Set([...(q.gender ? q.gender.split(',') : []), ...pq.gender].filter(Boolean))
  const dayNights = new Set((q.dayNight ? q.dayNight.split(',') : []).filter(Boolean))
  const courseKeyword = q.course ?? pq.courseKeyword[0] ?? null
  const programKeyword = q.program ?? pq.programKeyword[0] ?? null
  const freeText = pq.text

  const rows = await c.env.DB.prepare(`SELECT * FROM schools WHERE (is_synthetic = 0 OR ? = 1) ORDER BY official_name`).bind(allowSyn ? 1 : 0).all<Row>()
  const aliasRows = await c.env.DB.prepare(`SELECT school_id, alias FROM school_aliases WHERE approved = 1`).all<Row>()
  const aliasMap = new Map<string, string[]>()
  for (const a of aliasRows.results) aliasMap.set(String(a.school_id), [...(aliasMap.get(String(a.school_id)) ?? []), String(a.alias)])
  const trackRows = await c.env.DB.prepare(`SELECT * FROM school_tracks`).all<Row>()
  const trackMap = new Map<string, SchoolTrack[]>()
  for (const t of trackRows.results.map(rowToTrack)) trackMap.set(t.schoolId, [...(trackMap.get(t.schoolId) ?? []), t])

  const versionRows = await c.env.DB.prepare(`SELECT school_id, cohort_year, status FROM curriculum_versions`).all<Row>()
  const pubYears = new Map<string, Set<number>>()
  const draftYears = new Map<string, Set<number>>()
  for (const v of versionRows.results) {
    const sid = String(v.school_id)
    const y = Number(v.cohort_year)
    const target = String(v.status) === 'published' ? pubYears : draftYears
    if (!target.has(sid)) target.set(sid, new Set())
    target.get(sid)!.add(y)
  }

  // 과목 조건: 공개 버전의 편성에서 검색
  let courseHits: Map<string, SchoolListItem['courseMatch']> | null = null
  let coursePublishedSchools: Set<string> | null = null
  if (courseKeyword) {
    courseHits = new Map()
    coursePublishedSchools = new Set()
    const like = `%${courseKeyword.replace(/[%_]/g, '')}%`
    const sql = q.cohortYear
      ? `SELECT o.*, v.cohort_year AS vcy FROM curriculum_offerings o JOIN curriculum_versions v ON v.id = o.version_id WHERE v.status = 'published' AND v.cohort_year = ? AND (o.course_original_name LIKE ? OR o.course_canonical_id LIKE ?)`
      : `SELECT o.*, v.cohort_year AS vcy FROM curriculum_offerings o JOIN curriculum_versions v ON v.id = o.version_id WHERE v.status = 'published' AND (o.course_original_name LIKE ? OR o.course_canonical_id LIKE ?)`
    const stmt = q.cohortYear ? c.env.DB.prepare(sql).bind(q.cohortYear, like, like) : c.env.DB.prepare(sql).bind(like, like)
    const hits = await stmt.all<Row>()
    for (const r of hits.results) {
      const o = rowToOffering(r)
      const cur = courseHits.get(o.schoolId) ?? { status: 'confirmed' as const, offerings: [] }
      cur.offerings.push({ name: o.courseOriginalName, grade: o.grade, semester: o.semester, credit: o.creditValue, requirement: o.requirementType, groupId: o.selectionGroupId })
      courseHits.set(o.schoolId, cur)
    }
    // 해당 입학연도 공개 버전이 있는 학교 = 검색 결과가 없으면 '확인된 미편성'
    const pubSchools = await (q.cohortYear
      ? c.env.DB.prepare(`SELECT DISTINCT school_id FROM curriculum_versions WHERE status = 'published' AND cohort_year = ?`).bind(q.cohortYear)
      : c.env.DB.prepare(`SELECT DISTINCT school_id FROM curriculum_versions WHERE status = 'published'`)
    ).all<Row>()
    for (const r of pubSchools.results) coursePublishedSchools.add(String(r.school_id))
  }
  let programHits: Map<string, SchoolListItem['programMatch']> | null = null
  if (programKeyword) {
    programHits = new Map()
    const like = `%${programKeyword.replace(/[%_]/g, '')}%`
    const hits = await c.env.DB.prepare(`SELECT * FROM school_programs WHERE publish_status = 'published' AND name LIKE ?`).bind(like).all<Row>()
    for (const r of hits.results) {
      const p = rowToProgram(r)
      programHits.set(p.schoolId, [...(programHits.get(p.schoolId) ?? []), { name: p.name, kind: p.kind, phase: p.phase, status: p.status }])
    }
  }

  const all: SchoolListItem[] = []
  let withGeoTotal = 0
  for (const r of rows.results) {
    const school = rowToSchool(r, aliasMap.get(String(r.id)) ?? [], [], trackMap.get(String(r.id)) ?? [])
    if (school.geo) withGeoTotal += 1
    if (districts.size && !districts.has(school.district)) continue
    if (types.size && !types.has(school.schoolType)) continue
    if (ests.size && !ests.has(school.establishment)) continue
    if (genders.size && !genders.has(school.gender)) continue
    if (dayNights.size && !dayNights.has(school.dayNight)) continue
    if (freeText && !matchesName(freeText, [school.officialName, school.shortName ?? '', ...school.aliases, school.district, school.address ?? '', ...school.tracks.map((t) => t.name)])) continue

    const py = [...(pubYears.get(school.id) ?? [])].sort((a, b) => b - a)
    const dy = draftYears.get(school.id) ?? new Set()
    let curriculumStatus: SchoolListItem['curriculumStatus']
    if (q.cohortYear) {
      if (py.includes(q.cohortYear)) curriculumStatus = 'published'
      else if (dy.has(q.cohortYear)) curriculumStatus = 'draft_only'
      else if (py.length > 0) curriculumStatus = 'other_cohort_only'
      else curriculumStatus = 'none'
    } else curriculumStatus = py.length > 0 ? 'published' : dy.size > 0 ? 'draft_only' : 'none'
    if (q.curriculumStatus !== 'any' && curriculumStatus !== q.curriculumStatus && !(q.curriculumStatus === 'none' && curriculumStatus === 'other_cohort_only')) continue

    let courseMatch: SchoolListItem['courseMatch'] = null
    if (courseHits) {
      courseMatch = courseHits.get(school.id) ?? { status: coursePublishedSchools!.has(school.id) ? 'confirmed_absent' : 'unknown', offerings: [] }
    }
    const programMatch = programHits ? (programHits.get(school.id) ?? null) : null
    if (programHits && !programMatch) continue
    all.push({ school, curriculumStatus, publishedCohortYears: py, courseMatch, programMatch })
  }
  if (q.sort === 'district') all.sort((a, b) => a.school.district.localeCompare(b.school.district, 'ko') || a.school.officialName.localeCompare(b.school.officialName, 'ko'))

  // 과목 조건이 있으면 '확인된 결과' 와 '자료 추가 확인 후보' 를 나눈다 (미확인 학교를 무조건 제외하지 않음)
  const confirmed = courseHits ? all.filter((i) => i.courseMatch?.status === 'confirmed') : all
  const candidates = courseHits ? all.filter((i) => i.courseMatch?.status === 'unknown') : []
  const absent = courseHits ? all.filter((i) => i.courseMatch?.status === 'confirmed_absent') : []

  const start = (q.page - 1) * q.pageSize
  const coverage = await coverageSummary(c.env.DB, allowSyn)
  return c.json(
    ok({
      items: confirmed.slice(start, start + q.pageSize),
      candidates: candidates.slice(0, 200),
      confirmedAbsent: absent.slice(0, 200),
      page: q.page,
      pageSize: q.pageSize,
      total: confirmed.length,
      counts: { schoolsInDb: rows.results.length, results: confirmed.length, candidates: candidates.length, withGeoInDb: withGeoTotal, withGeoInResults: confirmed.filter((i) => i.school.geo).length },
      interpreted: { chips: pq.chips, residualText: freeText, unrecognized: pq.unrecognized },
      coverage: { succeededDistricts: coverage.districts.filter((d) => d.status === 'succeeded').length, failedDistricts: coverage.districts.filter((d) => d.status === 'failed').length, notAttempted: coverage.districts.filter((d) => d.status === 'not_attempted').length, basisNote: coverage.dataBasisNote },
    }),
  )
})

/* ---------- 과목명 제안 ---------- */
publicRoutes.get('/courses', async (c) => {
  const cohortYear = Number(c.req.query('cohortYear') ?? '') || null
  const sql = cohortYear
    ? `SELECT DISTINCT o.course_original_name AS name FROM curriculum_offerings o JOIN curriculum_versions v ON v.id = o.version_id WHERE v.status = 'published' AND v.cohort_year = ? ORDER BY name`
    : `SELECT DISTINCT o.course_original_name AS name FROM curriculum_offerings o JOIN curriculum_versions v ON v.id = o.version_id WHERE v.status = 'published' ORDER BY name`
  const r = await (cohortYear ? c.env.DB.prepare(sql).bind(cohortYear) : c.env.DB.prepare(sql)).all<Row>()
  return c.json(ok(r.results.map((x) => String(x.name))))
})

/* ---------- 학교 프로필 ---------- */
publicRoutes.get('/schools/:id', async (c) => {
  const id = c.req.param('id')
  const allowSyn = includeSynthetic(c.env)
  const school = await loadSchool(c.env.DB, id, allowSyn)
  if (!school) return c.json(fail('not_found', '학교를 찾을 수 없습니다.'), 404)
  const [facts, programs, versions, docs, rules, events] = await Promise.all([
    c.env.DB.prepare(`SELECT * FROM facts WHERE school_id = ? AND publish_status = 'published' ORDER BY field, basis_year DESC`).bind(id).all<Row>(),
    c.env.DB.prepare(`SELECT * FROM school_programs WHERE school_id = ? AND publish_status = 'published' ORDER BY kind, name`).bind(id).all<Row>(),
    loadPublishedVersions(c.env.DB, id),
    c.env.DB.prepare(`SELECT * FROM source_documents WHERE school_id = ? AND review_status IN ('approved','superseded') ORDER BY published_at DESC`).bind(id).all<Row>(),
    c.env.DB.prepare(`SELECT * FROM admission_rules WHERE (school_id = ? OR (school_id IS NULL AND school_type = ?)) AND status IN ('published','superseded') ORDER BY admission_year DESC, version DESC`).bind(id, school.schoolType).all<Row>(),
    c.env.DB.prepare(`SELECT e.* FROM admission_events e LEFT JOIN admission_rules r ON r.id = e.rule_id WHERE (e.school_id = ? OR (e.school_id IS NULL AND r.school_type = ?)) ORDER BY e.date`).bind(id, school.schoolType).all<Row>(),
  ])
  const draftCount = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM curriculum_versions WHERE school_id = ? AND status = 'draft'`).bind(id).first<{ n: number }>()
  return c.json(
    ok({
      school,
      facts: facts.results.map(rowToFact),
      programs: programs.results.map(rowToProgram),
      curriculumVersions: versions,
      draftVersionCount: draftCount?.n ?? 0,
      documents: docs.results.map(rowToDocument),
      admissionRules: rules.results.map(rowToRule),
      admissionEvents: events.results.map(rowToEvent),
    }),
  )
})

/* ---------- 입학연도별 교육과정 ---------- */
async function lookupCurriculum(env: Env, schoolId: string, cohortYear: number, trackId: string | null): Promise<CurriculumLookup | null> {
  const allowSyn = includeSynthetic(env)
  const school = await loadSchool(env.DB, schoolId, allowSyn)
  if (!school) return null
  const versions = (await env.DB.prepare(`SELECT * FROM curriculum_versions WHERE school_id = ? AND status IN ('published','draft')`).bind(schoolId).all<Row>()).results.map(rowToVersion)
  // 공개 API 는 published 만 bundle 로 연다. draft 는 상태 안내에만 쓴다.
  const bundles = new Map<string, Awaited<ReturnType<typeof loadBundle>>>()
  for (const v of versions.filter((x) => x.status === 'published')) bundles.set(v.id, await loadBundle(env.DB, v.id))
  return resolveCurriculum({
    schoolId,
    cohortYear,
    trackId,
    versions,
    tracks: school.tracks,
    loadBundle: (vid) => bundles.get(vid) ?? null,
  })
}

publicRoutes.get('/schools/:id/curricula', async (c) => {
  const cohortYear = Number(c.req.query('cohortYear'))
  if (!Number.isInteger(cohortYear)) return c.json(fail('bad_request', 'cohortYear 가 필요합니다. 대상 입학연도를 명시적으로 선택하세요.'), 400)
  const trackId = c.req.query('trackId') || null
  const lookup = await lookupCurriculum(c.env, c.req.param('id'), cohortYear, trackId)
  if (!lookup) return c.json(fail('not_found', '학교를 찾을 수 없습니다.'), 404)
  return c.json(ok(lookup))
})

/** 참고 패널 전용: 다른 입학연도 공개 버전 (비교·경로 검토에 자동 사용하지 않음) */
publicRoutes.get('/versions/:versionId', async (c) => {
  const b = await loadBundle(c.env.DB, c.req.param('versionId'))
  if (!b || b.version.status !== 'published') return c.json(fail('not_found', '공개된 버전이 아닙니다.'), 404)
  if (b.version.isSynthetic && !includeSynthetic(c.env)) return c.json(fail('not_found', '공개된 버전이 아닙니다.'), 404)
  return c.json(ok(b))
})

/* ---------- 비교 ---------- */
const compareBody = z.object({
  schoolIds: z.array(z.string().max(100)).min(1).max(MAX_COMPARE_SCHOOLS),
  cohortYear: z.number().int(),
  trackIds: z.record(z.string(), z.string().nullable()).optional().default({}),
  interestCourses: z.array(z.string().max(100)).max(30).optional().default([]),
})

publicRoutes.post('/compare', async (c) => {
  const body = compareBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '비교 요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const { schoolIds, cohortYear, trackIds, interestCourses } = body.data
  const allowSyn = includeSynthetic(c.env)
  const columns = []
  for (const sid of schoolIds) {
    const school = await loadSchool(c.env.DB, sid, allowSyn)
    if (!school) {
      columns.push({ schoolId: sid, school: null, status: 'not_found' as const })
      continue
    }
    const lookup = await lookupCurriculum(c.env, sid, cohortYear, trackIds[sid] ?? null)
    const facts = (await c.env.DB.prepare(`SELECT * FROM facts WHERE school_id = ? AND publish_status = 'published'`).bind(sid).all<Row>()).results.map(rowToFact)
    const programs = (await c.env.DB.prepare(`SELECT * FROM school_programs WHERE school_id = ? AND publish_status = 'published'`).bind(sid).all<Row>()).results.map(rowToProgram)
    const rules = (await c.env.DB.prepare(`SELECT * FROM admission_rules WHERE (school_id = ? OR (school_id IS NULL AND school_type = ?)) AND status = 'published' AND admission_year = ?`).bind(sid, school.schoolType, cohortYear).all<Row>()).results.map(rowToRule)
    const events = (await c.env.DB.prepare(`SELECT e.* FROM admission_events e LEFT JOIN admission_rules r ON r.id = e.rule_id WHERE (e.school_id = ? OR (e.school_id IS NULL AND r.school_type = ?)) AND e.admission_year = ? AND e.status <> 'revised' ORDER BY e.date`).bind(sid, school.schoolType, cohortYear).all<Row>()).results.map(rowToEvent)
    const docs = (await c.env.DB.prepare(`SELECT * FROM source_documents WHERE school_id = ? AND review_status = 'approved'`).bind(sid).all<Row>()).results.map(rowToDocument)
    const draftN = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM curriculum_versions WHERE school_id = ? AND status = 'draft' AND cohort_year = ?`).bind(sid, cohortYear).first<{ n: number }>()

    const bundle = lookup?.bundle ?? null
    const interest = interestCourses.map((name) => {
      if (!bundle) return { name, status: lookup?.status === 'track_required' ? ('track_required' as const) : ('unknown' as const), offerings: [] as CurriculumOffering[], groups: [] as SelectionGroup[] }
      const m = matchWishes(bundle, [name])[0]!
      const groups = bundle.selectionGroups.filter((g) => m.offerings.some((o) => g.memberOfferingIds.includes(o.id)))
      return { name, status: m.offerings.length > 0 ? ('confirmed' as const) : ('confirmed_absent' as const), offerings: m.offerings, groups }
    })
    columns.push({
      schoolId: sid,
      school,
      status: 'ok' as const,
      curriculum: lookup ? { status: lookup.status, message: lookup.message, versionId: bundle?.version.id ?? null, reviewStatus: bundle?.version.reviewStatus ?? null, revision: bundle?.version.revision ?? null, trackId: bundle?.version.trackId ?? null, availableCohortYears: lookup.availableCohortYears, availableTracks: lookup.availableTracks, draftCount: draftN?.n ?? 0, offeringCount: bundle?.offerings.length ?? 0, groupCount: bundle?.selectionGroups.length ?? 0, unverifiedGroupCount: bundle?.selectionGroups.filter((g) => g.ruleStatus !== 'verified').length ?? 0, documentIds: bundle?.version.documentIds ?? [] } : null,
      interest,
      facts,
      programs,
      admissionRules: rules,
      admissionEvents: events,
      documents: docs,
    })
  }
  const comparable = columns.filter((col) => col.status === 'ok' && col.curriculum?.status === 'available').length
  return c.json(
    ok({
      basis: { cohortYear, trackIds },
      columns,
      comparability: {
        curriculumComparableCount: comparable,
        note: comparable < columns.length ? '일부 학교는 동일 기준(입학연도·과정) 자료가 없어 교육과정 항목을 비교할 수 없습니다. 자료 상태를 확인하세요.' : '모든 학교가 같은 입학연도 기준의 공개 자료를 가지고 있습니다.',
      },
    }),
  )
})

/* ---------- 경로 검증 ---------- */
const validateBody = z.object({ versionId: z.string().max(100), selectedOfferingIds: z.array(z.string().max(100)).max(60), targetCohortYear: z.number().int() })
publicRoutes.post('/plans/validate', async (c) => {
  const body = validateBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '검증 요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const b = await loadBundle(c.env.DB, body.data.versionId)
  if (!b || b.version.status !== 'published' || (b.version.isSynthetic && !includeSynthetic(c.env))) return c.json(fail('not_found', '공개된 교육과정 버전이 아닙니다.'), 404)
  return c.json(ok(validatePlan({ bundle: b, selectedOfferingIds: body.data.selectedOfferingIds, targetCohortYear: body.data.targetCohortYear })))
})

const searchBody = z.object({ versionId: z.string().max(100), wishOfferingIds: z.array(z.string().max(100)).max(20), targetCohortYear: z.number().int() })
publicRoutes.post('/plans/search', async (c) => {
  const body = searchBody.safeParse(await c.req.json().catch(() => null))
  if (!body.success) return c.json(fail('bad_request', '탐색 요청이 올바르지 않습니다.', body.error.flatten()), 400)
  const b = await loadBundle(c.env.DB, body.data.versionId)
  if (!b || b.version.status !== 'published' || (b.version.isSynthetic && !includeSynthetic(c.env))) return c.json(fail('not_found', '공개된 교육과정 버전이 아닙니다.'), 404)
  const r = searchFeasibleCombos(b, body.data.wishOfferingIds, body.data.targetCohortYear, { maxNodes: 2000, maxMs: 300 })
  return c.json(ok({ status: r.status, nodesVisited: r.nodesVisited, feasible: r.feasible.slice(0, 20) }))
})

/* ---------- 근거 ---------- */
publicRoutes.get('/evidence/:id', async (c) => {
  const r = await c.env.DB.prepare(`SELECT * FROM evidence WHERE id = ?`).bind(c.req.param('id')).first<Row>()
  if (!r) return c.json(fail('not_found', '근거를 찾을 수 없습니다.'), 404)
  const ev = rowToEvidence(r)
  const [doc] = await loadDocuments(c.env.DB, [ev.documentId])
  // 공개 승인 근거만 (문서가 승인/대체 상태). 가상 자료는 배포 환경에서 제외.
  if (!doc || !['approved', 'superseded'].includes(doc.reviewStatus)) return c.json(fail('not_found', '공개된 근거가 아닙니다.'), 404)
  if ((ev.isSynthetic || doc.isSynthetic) && !includeSynthetic(c.env)) return c.json(fail('not_found', '공개된 근거가 아닙니다.'), 404)
  return c.json(ok({ evidence: ev, document: doc }))
})

publicRoutes.get('/documents/:id', async (c) => {
  const [doc] = await loadDocuments(c.env.DB, [c.req.param('id')])
  if (!doc || !['approved', 'superseded'].includes(doc.reviewStatus) || (doc.isSynthetic && !includeSynthetic(c.env))) return c.json(fail('not_found', '공개된 문서가 아닙니다.'), 404)
  const ev = (await c.env.DB.prepare(`SELECT * FROM evidence WHERE document_id = ? ORDER BY pdf_page_index, row_index`).bind(doc.id).all<Row>()).results.map(rowToEvidence)
  return c.json(ok({ document: doc, evidence: ev }))
})

/* ---------- 입학 ---------- */
publicRoutes.get('/admissions', async (c) => {
  const year = Number(c.req.query('year') ?? '') || null
  const schoolId = c.req.query('schoolId') || null
  const allowSyn = includeSynthetic(c.env)
  const rules = (
    await c.env.DB.prepare(`SELECT * FROM admission_rules WHERE status IN ('published','superseded') AND (is_synthetic = 0 OR ? = 1) AND (? IS NULL OR admission_year = ?) AND (? IS NULL OR school_id = ? OR school_id IS NULL) ORDER BY admission_year DESC, school_id, version DESC`)
      .bind(allowSyn ? 1 : 0, year, year, schoolId, schoolId)
      .all<Row>()
  ).results.map(rowToRule)
  const events = (
    await c.env.DB.prepare(`SELECT * FROM admission_events WHERE (is_synthetic = 0 OR ? = 1) AND (? IS NULL OR admission_year = ?) AND (? IS NULL OR school_id = ? OR school_id IS NULL) ORDER BY date`)
      .bind(allowSyn ? 1 : 0, year, year, schoolId, schoolId)
      .all<Row>()
  ).results.map(rowToEvent)
  const docIds = [...new Set(rules.map((r) => r.documentId).filter((x): x is string => Boolean(x)))]
  const documents = await loadDocuments(c.env.DB, docIds)
  return c.json(ok({ rules, events, documents }))
})

/* ---------- 범위 ---------- */
export async function coverageSummary(db: D1Database, allowSyn: boolean): Promise<CoverageSummary> {
  const [districts, counts, lastJob] = await Promise.all([
    db.prepare(`SELECT * FROM coverage_districts ORDER BY district`).all<Row>(),
    db
      .prepare(
        `SELECT
          (SELECT COUNT(*) FROM schools WHERE is_synthetic = 0) AS schools,
          (SELECT COUNT(*) FROM schools WHERE is_synthetic = 0 AND lat IS NOT NULL) AS with_geo,
          (SELECT COUNT(DISTINCT school_id) FROM curriculum_versions WHERE status = 'published' AND is_synthetic = 0) AS with_pub,
          (SELECT COUNT(DISTINCT school_id) FROM curriculum_versions WHERE status = 'draft' AND is_synthetic = 0) AS with_draft,
          (SELECT COUNT(*) FROM schools WHERE is_synthetic = 1) AS syn`,
      )
      .first<Row>(),
    db.prepare(`SELECT id, kind, status, finished_at FROM ingestion_jobs ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 1`).first<Row>(),
  ])
  const synN = Number(counts?.syn ?? 0)
  return {
    generatedAt: new Date().toISOString(),
    schoolCount: Number(counts?.schools ?? 0),
    schoolsWithGeo: Number(counts?.with_geo ?? 0),
    schoolsWithPublishedCurriculum: Number(counts?.with_pub ?? 0),
    schoolsWithUnreviewedCurriculum: Number(counts?.with_draft ?? 0),
    syntheticExcluded: allowSyn ? 0 : synN,
    districts: districts.results.map((d) => ({ district: String(d.district), districtCode: d.district_code ? String(d.district_code) : null, status: String(d.status) as CoverageSummary['districts'][number]['status'], schoolCount: Number(d.school_count ?? 0), lastAttemptAt: d.last_attempt_at ? String(d.last_attempt_at) : null, error: d.error ? String(d.error) : null })),
    lastIngestion: lastJob ? { id: String(lastJob.id), kind: String(lastJob.kind), status: String(lastJob.status), finishedAt: lastJob.finished_at ? String(lastJob.finished_at) : null } : null,
    dataBasisNote: '학교 수는 DB 에 저장된 공식 기본정보 기준이며, 자치구별 수집 상태가 모두 성공일 때만 서울 전체를 뜻합니다. 가상 자료는 집계에서 제외됩니다.',
  }
}

publicRoutes.get('/coverage', async (c) => c.json(ok(await coverageSummary(c.env.DB, includeSynthetic(c.env)))))

/* ---------- 출처 ---------- */
publicRoutes.get('/sources', async (c) => {
  const allowSyn = includeSynthetic(c.env)
  const docs = (await c.env.DB.prepare(`SELECT * FROM source_documents WHERE review_status IN ('approved','superseded') AND (is_synthetic = 0 OR ? = 1) ORDER BY publisher, published_at DESC`).bind(allowSyn ? 1 : 0).all<Row>()).results.map(rowToDocument)
  const pending = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM source_documents WHERE review_status IN ('draft','in_review') AND (is_synthetic = 0 OR ? = 1)`).bind(allowSyn ? 1 : 0).first<{ n: number }>()
  const jobs = (await c.env.DB.prepare(`SELECT id, kind, status, scope_json, started_at, finished_at, error, result_json, actor FROM ingestion_jobs ORDER BY COALESCE(finished_at, started_at) DESC LIMIT 20`).all<Row>()).results.map((j) => ({
    id: String(j.id),
    kind: String(j.kind),
    status: String(j.status),
    scope: safeJson(j.scope_json),
    startedAt: j.started_at ? String(j.started_at) : null,
    finishedAt: j.finished_at ? String(j.finished_at) : null,
    error: j.error ? String(j.error) : null,
    result: safeJson(j.result_json),
  }))
  return c.json(ok({ documents: docs, pendingReviewCount: pending?.n ?? 0, jobs, coverage: await coverageSummary(c.env.DB, allowSyn) }))
})

function safeJson(v: unknown): unknown {
  try {
    return v ? JSON.parse(String(v)) : null
  } catch {
    return null
  }
}

/* ---------- 근거 검색 패널: 두 과목 동시 선택 ---------- */
publicRoutes.get('/ask/together', async (c) => {
  const versionId = c.req.query('versionId') ?? ''
  const a = c.req.query('a') ?? ''
  const b = c.req.query('b') ?? ''
  const cohortYear = Number(c.req.query('cohortYear'))
  if (!versionId || !a || !b || !Number.isInteger(cohortYear)) return c.json(fail('bad_request', 'versionId, a, b, cohortYear 가 필요합니다.'), 400)
  const bundle = await loadBundle(c.env.DB, versionId)
  if (!bundle || bundle.version.status !== 'published') return c.json(fail('not_found', '공개된 교육과정 버전이 아닙니다.'), 404)
  const result = validatePlan({ bundle, selectedOfferingIds: [a, b], targetCohortYear: cohortYear })
  const evIds = [...new Set([...result.violations.flatMap((v) => v.evidenceIds), ...bundle.selectionGroups.filter((g) => result.unknowns.some((u) => u.groupId === g.id)).flatMap((g) => g.evidenceIds)])]
  const evidence = await loadEvidence(c.env.DB, evIds)
  return c.json(ok({ result, evidence }))
})
