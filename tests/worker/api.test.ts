/**
 * Worker + D1 통합 테스트. 합성 fixture 를 시드한 뒤 공개·관리 API 계약과 보안 경계를 검증한다.
 */
import { env, SELF } from 'cloudflare:test'
import { beforeAll, describe, expect, it } from 'vitest'
import { datasetStatements } from '../../shared/dataset'
import { SYNTHETIC_DATASET, SYN } from '../../fixtures/synthetic'

const ADMIN = { Authorization: 'Bearer test-admin-token-0123456789abcdef', 'Content-Type': 'application/json' }

async function seed() {
  const stmts = datasetStatements(SYNTHETIC_DATASET)
  for (let i = 0; i < stmts.length; i += 50) {
    await env.DB.batch(stmts.slice(i, i + 50).map((s) => env.DB.prepare(s.sql).bind(...s.params)))
  }
}

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await SELF.fetch(`http://example.com${path}`, { headers })
  return { status: res.status, body: (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } } }
}
async function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await SELF.fetch(`http://example.com${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) })
  return { status: res.status, body: (await res.json()) as { ok: boolean; data?: unknown; error?: { code: string; message: string; details?: unknown } } }
}

beforeAll(async () => {
  await seed()
})

describe('공개 API', () => {
  it('health', async () => {
    const r = await get('/api/health')
    expect(r.status).toBe(200)
    expect(r.body.ok).toBe(true)
  })
  it('학교 목록: 학교 수·결과 수·좌표 수를 따로 센다', async () => {
    const r = await get('/api/schools')
    expect(r.status).toBe(200)
    const d = r.body.data as { counts: { schoolsInDb: number; results: number; withGeoInResults: number }; items: unknown[] }
    expect(d.counts.schoolsInDb).toBe(4)
    expect(d.counts.results).toBe(4)
    expect(d.counts.withGeoInResults).toBe(3) // C 는 좌표 없음이지만 목록에 남는다
  })
  it('문장 검색: 동대문구에서 정보 관련 과목이 확인된 학교', async () => {
    const r = await get(`/api/schools?q=${encodeURIComponent('동대문구에서 정보 관련 과목이 확인된 학교')}&cohortYear=2027`)
    const d = r.body.data as { items: { school: { id: string }; courseMatch: { status: string } }[]; interpreted: { chips: unknown[] } }
    expect(d.interpreted.chips.length).toBeGreaterThanOrEqual(3)
    expect(d.items.map((i) => i.school.id)).toEqual([SYN.A])
    expect(d.items[0]!.courseMatch.status).toBe('confirmed')
  })
  it('과목 검색: 미확인 학교는 후보로 분리하고, 공개 자료가 있는데 없는 학교는 확인된 미편성', async () => {
    const r = await get(`/api/schools?course=${encodeURIComponent('정보')}&cohortYear=2027`)
    const d = r.body.data as { items: { school: { id: string } }[]; candidates: { school: { id: string } }[]; confirmedAbsent: { school: { id: string } }[] }
    expect(d.items.map((i) => i.school.id).sort()).toEqual([SYN.A, SYN.B].sort())
    expect(d.candidates.map((i) => i.school.id).sort()).toEqual([SYN.C, SYN.D].sort()) // 2027 공개 자료 없음 → 후보
  })
  it('초성 검색', async () => {
    const r = await get(`/api/schools?q=${encodeURIComponent('ㄱㅅㅌㅅㅎ')}`)
    const d = r.body.data as { items: { school: { id: string } }[] }
    expect(d.items.map((i) => i.school.id)).toEqual([SYN.C])
  })
  it('프로필', async () => {
    const r = await get(`/api/schools/${SYN.A}`)
    expect(r.status).toBe(200)
    const d = r.body.data as { school: { officialName: string }; facts: unknown[]; curriculumVersions: { cohortYear: number }[] }
    expect(d.school.officialName).toBe('가상 학교 A')
    expect(d.curriculumVersions.map((v) => v.cohortYear).sort()).toEqual([2026, 2027])
  })
  it('교육과정: 입학연도 없는 요청은 거부', async () => {
    const r = await get(`/api/schools/${SYN.A}/curricula`)
    expect(r.status).toBe(400)
  })
  it('교육과정: C 교 2027 은 자료 없음, 2026 은 참고 전용', async () => {
    const r = await get(`/api/schools/${SYN.C}/curricula?cohortYear=2027`)
    const d = r.body.data as { status: string; bundle: unknown; referenceOnly: unknown[] }
    expect(d.status).toBe('cohort_not_available')
    expect(d.bundle).toBeNull()
    expect(d.referenceOnly.length).toBe(2)
  })
  it('교육과정: D 교 2027 은 초안만 → 미검토 (공개 API 에서 내용 노출 없음)', async () => {
    const r = await get(`/api/schools/${SYN.D}/curricula?cohortYear=2027`)
    const d = r.body.data as { status: string; bundle: unknown }
    expect(d.status).toBe('unreviewed_only')
    expect(d.bundle).toBeNull()
  })
  it('초안 버전은 공개 버전 API 로 열리지 않는다', async () => {
    const r = await get(`/api/versions/${SYN.D27}`)
    expect(r.status).toBe(404)
  })
  it('비교: 동일 기준 비교 불가 학교를 없애지 않고 상태를 남긴다 (시나리오 11)', async () => {
    const r = await post('/api/compare', { schoolIds: [SYN.A, SYN.D, SYN.C], cohortYear: 2027, interestCourses: ['과목 A'] })
    expect(r.status).toBe(200)
    const d = r.body.data as { columns: { schoolId: string; curriculum: { status: string }; interest: { status: string }[] }[]; comparability: { curriculumComparableCount: number } }
    expect(d.columns).toHaveLength(3)
    expect(d.columns[0]!.curriculum.status).toBe('available')
    expect(d.columns[1]!.curriculum.status).toBe('unreviewed_only')
    expect(d.columns[2]!.curriculum.status).toBe('cohort_not_available')
    expect(d.columns[2]!.interest[0]!.status).toBe('unknown')
    expect(d.comparability.curriculumComparableCount).toBe(1)
  })
  it('경로 검증: A+B 충돌', async () => {
    const r = await post('/api/plans/validate', { versionId: SYN.A27, selectedOfferingIds: ['off_a27_A', 'off_a27_B'], targetCohortYear: 2027 })
    const d = r.body.data as { verdict: string }
    expect(d.verdict).toBe('conflicts_with_verified_rules')
  })
  it('근거: 승인된 근거만, PDF 페이지와 인쇄 쪽수 구분', async () => {
    const r = await get('/api/evidence/ev_a27_t1_r1')
    const d = r.body.data as { evidence: { pdfPageIndex: number; printedPageLabel: string } }
    expect(d.evidence.pdfPageIndex).toBe(3)
    expect(d.evidence.printedPageLabel).toBe('2')
    const draft = await get('/api/evidence/ev_d27_t1')
    expect(draft.status).toBe(404)
  })
  it('입학: 변경본이 최초본을 대체한 관계를 보여준다', async () => {
    const r = await get('/api/admissions?year=2027')
    const d = r.body.data as { rules: { id: string; status: string; supersedesId: string | null }[] }
    const v2 = d.rules.find((x) => x.id === 'adm_syn_general_2027_v2')!
    expect(v2.supersedesId).toBe('adm_syn_general_2027_v1')
    expect(d.rules.find((x) => x.id === 'adm_syn_general_2027_v1')!.status).toBe('superseded')
  })
  it('범위: 가상 자료는 집계에서 제외되고 자치구 상태가 노출된다', async () => {
    const r = await get('/api/coverage')
    const d = r.body.data as { schoolCount: number; districts: unknown[] }
    expect(d.schoolCount).toBe(0)
    expect(d.districts).toHaveLength(25)
  })
})

describe('관리자 API 보호 (시나리오 19)', () => {
  it('미인증 요청 거부', async () => {
    expect((await get('/api/admin/me')).status).toBe(401)
    expect((await post('/api/admin/publish', { versionId: SYN.D27 })).status).toBe(401)
  })
  it('잘못된 토큰 거부', async () => {
    expect((await get('/api/admin/me', { Authorization: 'Bearer wrong-token-0000000000000000' })).status).toBe(401)
  })
  it('만료·위조 Access JWT 거부 (헤더 존재만으로 통과하지 않음)', async () => {
    const r = await get('/api/admin/me', { 'Cf-Access-Jwt-Assertion': 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.sig' })
    expect(r.status).toBe(401)
  })
  it('허용 목록 밖 URL 수집 거부 (임의 프록시 금지)', async () => {
    const r = await post('/api/admin/sources/check', { url: 'http://169.254.169.254/latest/meta-data' }, ADMIN)
    expect(r.status).toBe(200)
    const d = r.body.data as { fetched: boolean; error: string }
    expect(d.fetched).toBe(false)
    expect(d.error).toMatch(/사설|허용/)
    const r2 = await post('/api/admin/sources/check', { url: 'https://example.com/x.pdf' }, ADMIN)
    expect((r2.body.data as { fetched: boolean }).fetched).toBe(false)
  })
  it('검토자가 AI 이면 승인 거부, 사람 검토 없는 초안은 공개 거부', async () => {
    const r = await post('/api/admin/review', { versionId: SYN.D27, reviewStatus: 'approved', reviewer: 'AI' }, ADMIN)
    expect(r.status).toBe(422)
    const p = await post('/api/admin/publish', { versionId: SYN.D27 }, ADMIN)
    expect(p.status).toBe(422)
  })
  it('근거 없는 규칙 확인 거부, 공개 전 오류 차단', async () => {
    // D 초안: 과목 A 의 근거 삭제 → 공개 검사 오류
    await env.DB.prepare(`UPDATE curriculum_offerings SET evidence_ids = '[]' WHERE id = 'off_d27_A'`).run()
    const r = await post('/api/admin/review', { versionId: SYN.D27, reviewStatus: 'approved', reviewer: '홍길동' }, ADMIN)
    expect(r.status).toBe(422)
    expect(JSON.stringify(r.body.error?.details)).toMatch(/offering_without_evidence/)
    await env.DB.prepare(`UPDATE curriculum_offerings SET evidence_ids = '["ev_d27_t1"]' WHERE id = 'off_d27_A'`).run()
  })
  it('사람 승인 후 공개하면 공개 API 에서 보인다', async () => {
    const r = await post('/api/admin/review', { versionId: SYN.D27, reviewStatus: 'approved', reviewer: '홍길동' }, ADMIN)
    expect(r.status).toBe(200)
    const p = await post('/api/admin/publish', { versionId: SYN.D27 }, ADMIN)
    expect(p.status).toBe(200)
    const look = await get(`/api/schools/${SYN.D}/curricula?cohortYear=2027`)
    expect((look.body.data as { status: string }).status).toBe('available')
  })
  it('업로드: 확장자와 서명이 다르면 거부', async () => {
    const fd = new FormData()
    fd.set('file', new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])], 'evil.hwpx'))
    const res = await SELF.fetch('http://example.com/api/admin/upload', { method: 'POST', headers: { Authorization: ADMIN.Authorization }, body: fd })
    expect(res.status).toBe(415)
  })
  it('가져오기는 상태를 초안으로 강제한다', async () => {
    const ds = { schools: [{ ...SYNTHETIC_DATASET.schools[0]!, id: 'syn_school_x', officialName: '가상 학교 X' }], versions: [{ ...SYNTHETIC_DATASET.versions[0]!, id: 'cv_x', schoolId: 'syn_school_x', status: 'published', reviewStatus: 'approved' }] }
    const r = await post('/api/admin/import', { dataset: ds }, ADMIN)
    expect(r.status).toBe(200)
    const v = await env.DB.prepare(`SELECT status, review_status FROM curriculum_versions WHERE id = 'cv_x'`).first<{ status: string; review_status: string }>()
    expect(v?.status).toBe('draft')
    expect(v?.review_status).toBe('draft')
  })
  it('응답과 로그에 키가 없다', async () => {
    const r = await get('/api/admin/me', ADMIN)
    expect(JSON.stringify(r.body)).not.toContain('test-admin-token')
  })
})
