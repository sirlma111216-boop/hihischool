/**
 * 학교알리미 Open API — 학교 기본정보(apiType 0)를 서울 25개 자치구별(sidoCode + sggCode)로 조회해 병합한다.
 * npm run ingest:schoolinfo [-- --post http://localhost:5173] [--config scripts/ingest/schoolinfo.config.json]
 *
 * 공식 규격 (API 목록 페이지, 2026-10-17 확인): https://www.schoolinfo.go.kr/openApi.do, REST/JSON,
 *   apiKey(필수) apiType(필수, 0=학교기본정보) sidoCode(시도) sggCode(시군구) schulKndCode(04=고등학교).
 *   실제 응답에서 sidoCode 는 필수였다("시도 코드(sidoCode)는 필수 정보입니다").
 *   서울 sidoCode=11, 구 코드는 법정 시군구 5자리가 동작함을 동대문구(11230)로 확인. 다르면 config 로 덮어쓴다.
 * 응답 필드(확인): SCHUL_CODE, SCHUL_NM, HS_KND_SC_NM(일반/자율/특수목적/특성화 고등학교), FOND_SC_CODE(공립/사립/국립),
 *   COEDU_SC_CODE(남/여/남녀공학), SCHUL_RDNMA(도로명), SCHUL_RDNDA, HMPG_ADRES, LTTUD, LGTUD, DGHT_SC_CODE(주간/야간), CLOSE_YN, ADRCD_NM.
 * 이용허락: 공공누리 출처표시 → 앱 출처 화면에 '학교알리미' 표시.
 *
 * - 실패한 구는 성공한 구와 함께 '부분' 상태로 기록한다. 동시성 2, 재시도 3회. 관리자 수동 갱신 전용.
 * - 이미 있는 학교(예: 나이스 수집분)와는 정식명 + 도로명 주소가 모두 일치할 때만 같은 학교로 보고 코드를 crosswalk 에 추가한다.
 *   이름만 같으면 새 학교로 두고 코드 상태를 pending 으로 남긴다 (자동 병합 금지).
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { loadDevVars, mapLimit, postAdmin, withRetry, writeJson, emptyIngestDataset, loadExistingSchools } from './common'
import { SEOUL_DISTRICTS } from '../../shared/constants'
import { normalizeDayNight, normalizeEstablishment, normalizeGender, normalizeSchoolType, slugId } from '../../shared/normalize'
import type { School, SchoolType, SourceDocument } from '../../shared/types'

const root = path.resolve(import.meta.dirname, '../..')
const vars = loadDevVars(root)
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }

interface Config {
  endpoint: string
  apiType: string
  keyParam: string
  sidoParam: string
  sidoCode: string
  sggParam: string
  extraParams: Record<string, string>
  sggCodes: Record<string, string>
  listPath: string[]
  fieldMap: { code: string; name: string; type: string; establishment: string; gender: string; address: string; addressDetail: string; homepage: string; lat: string; lng: string; dayNight: string; closed: string; districtName: string }
}

const configPath = arg('config', path.join(root, 'scripts/ingest/schoolinfo.config.json'))!
const defaultConfig: Config = {
  endpoint: 'https://www.schoolinfo.go.kr/openApi.do',
  apiType: '0',
  keyParam: 'apiKey',
  sidoParam: 'sidoCode',
  sidoCode: '11',
  sggParam: 'sggCode',
  extraParams: { schulKndCode: '04' },
  sggCodes: Object.fromEntries(SEOUL_DISTRICTS.map((d) => [d.name, d.legalCode])),
  listPath: ['list'],
  fieldMap: { code: 'SCHUL_CODE', name: 'SCHUL_NM', type: 'HS_KND_SC_NM', establishment: 'FOND_SC_CODE', gender: 'COEDU_SC_CODE', address: 'SCHUL_RDNMA', addressDetail: 'SCHUL_RDNDA', homepage: 'HMPG_ADRES', lat: 'LTTUD', lng: 'LGTUD', dayNight: 'DGHT_SC_CODE', closed: 'CLOSE_YN', districtName: 'ADRCD_NM' },
}
const config: Config = existsSync(configPath) ? { ...defaultConfig, ...(JSON.parse(readFileSync(configPath, 'utf8')) as Partial<Config>) } : defaultConfig

function dig(obj: unknown, pathParts: string[]): unknown {
  let cur = obj
  for (const p of pathParts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p]
    else return undefined
  }
  return cur
}

async function fetchDistrict(code: string, key: string): Promise<Record<string, unknown>[]> {
  const u = new URL(config.endpoint)
  u.searchParams.set(config.keyParam, key)
  u.searchParams.set('apiType', config.apiType)
  u.searchParams.set(config.sidoParam, config.sidoCode)
  u.searchParams.set(config.sggParam, code)
  for (const [k, v] of Object.entries(config.extraParams)) u.searchParams.set(k, v)
  const res = await fetch(u, { headers: { 'User-Agent': 'highschool-atlas-ingest/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as { resultCode?: string; resultMsg?: string }
  if (j.resultCode && j.resultCode !== 'success') throw new Error(`${j.resultCode}: ${j.resultMsg ?? ''}`)
  const list = dig(j, config.listPath)
  if (!Array.isArray(list)) throw new Error(`응답에 목록(${config.listPath.join('.')})이 없음`)
  return list as Record<string, unknown>[]
}

/** 학교알리미 고교 종류 + 설립 → 내부 유형. '자율고등학교'는 설립 구분으로 자공고/자사고를 나눈다. */
function schoolTypeOf(typeRaw: string, establishmentRaw: string): SchoolType {
  const t = typeRaw.replace(/\s+/g, '')
  if (/자율/.test(t)) {
    if (/사립/.test(establishmentRaw)) return 'autonomous_private'
    if (/공립|국립/.test(establishmentRaw)) return 'autonomous_public'
    return 'unknown'
  }
  return normalizeSchoolType(t)
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').replace(/\(.*?\)/g, '')

async function main() {
  const key = vars.SCHOOLINFO_API_KEY
  if (!key) {
    console.error('SCHOOLINFO_API_KEY 가 없습니다. .dev.vars 에 키를 넣거나 환경 변수로 전달하세요. (키 없이 수집했다고 표시하지 않습니다)')
    process.exit(2)
  }
  const post = arg('post')
  const existing = await loadExistingSchools(post)
  const retrievedAt = new Date().toISOString()
  const results = await mapLimit(SEOUL_DISTRICTS, 2, async (d) => {
    const code = config.sggCodes[d.name] ?? d.legalCode
    try {
      const rows = await withRetry(() => fetchDistrict(code, key))
      return { district: d.name, code, ok: true as const, rows }
    } catch (e) {
      return { district: d.name, code, ok: false as const, error: e instanceof Error ? e.message : String(e), rows: [] as Record<string, unknown>[] }
    }
  })
  const succeeded = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  console.log(`자치구 수집: 성공 ${succeeded.length} / 실패 ${failed.length}${failed.length ? ' — ' + failed.map((f) => `${f.district}(${f.error})`).join(', ') : ''}`)

  const docId = `doc_schoolinfo_basic_${retrievedAt.slice(0, 10)}`
  const doc: SourceDocument = { id: docId, schoolId: null, documentType: 'basic_info', title: `학교알리미 학교 기본정보 (서울, 자치구별 ${succeeded.length}/25) 수집 ${retrievedAt.slice(0, 10)}`, officialUrl: 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l0.do', originalFilename: null, publisher: '학교알리미', publishedAt: null, retrievedAt, applicableAcademicYear: null, cohortYear: null, curriculumRevision: null, trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'extracted', reviewStatus: 'approved', supersedesId: null, isSynthetic: false, notes: `Open API apiType 0, schulKndCode 04. 성공 ${succeeded.length}구 / 실패 ${failed.length}구. 공공누리 출처표시` }
  const ds = emptyIngestDataset()
  ds.documents.push(doc)
  const evId = `ev_${docId}`
  ds.evidence.push({ id: evId, documentId: docId, pdfPageIndex: null, printedPageLabel: null, tableId: `apiType ${config.apiType}`, rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: 'API 응답 행', excerpt: null, extractionMethod: 'api', reviewedBy: null, reviewedAt: null, isSynthetic: false })
  const seen = new Set<string>()
  const merged: string[] = []
  const pendingDup: string[] = []
  const excluded: string[] = []
  const f = config.fieldMap
  for (const r of succeeded) {
    for (const row of r.rows) {
      const code = String(row[f.code] ?? '')
      const name = String(row[f.name] ?? '').trim()
      if (!code || !name || seen.has(code)) continue
      seen.add(code)
      const address = [row[f.address], row[f.addressDetail]].filter(Boolean).map(String).join(' ').trim() || null
      const road = String(row[f.address] ?? '')
      const typeRaw = String(row[f.type] ?? '')
      const estRaw = String(row[f.establishment] ?? '')
      const closed = String(row[f.closed] ?? '') === 'Y'
      // 기존 학교와 crosswalk: 정식명 + 도로명 주소 일치 → 같은 학교
      const same = existing.find((e) => norm(e.officialName) === norm(name) && e.address && road && norm(e.address).startsWith(norm(road).slice(0, 12)))
      const myType = schoolTypeOf(typeRaw, estRaw)
      const myGender = normalizeGender(String(row[f.gender] ?? ''))
      const conflicts: School['sourceConflicts'] = [...(same?.sourceConflicts ?? []).filter((c) => !c.values.some((v) => v.provider === 'schoolinfo'))]
      const neisType = same?.sourceConflicts.find((c) => c.field === 'schoolType')?.values.find((v) => v.provider === 'neis')
      if (same && same.schoolTypeStatus !== 'no_data' && same.schoolType !== 'unknown' && myType !== 'unknown' && same.schoolType !== myType) conflicts.push({ field: 'schoolType', values: [{ provider: 'schoolinfo', value: `${typeRaw} (${estRaw})` }, { provider: 'neis', value: neisType?.value ?? same.schoolType }] })
      if (same && same.gender !== 'unknown' && myGender !== 'unknown' && same.gender !== myGender) conflicts.push({ field: 'gender', values: [{ provider: 'schoolinfo', value: String(row[f.gender] ?? '') }, { provider: 'neis', value: same.gender }] })
      const nameOnly = !same && existing.find((e) => norm(e.officialName) === norm(name))
      const id = same ? same.id : slugId('sch', 'si', code)
      if (same) merged.push(`${name} → ${same.id}`)
      if (nameOnly) pendingDup.push(`${name}: 기존 ${nameOnly.id} 와 이름만 같음 (주소 다름) → 별도 학교, 코드 pending`)
      const lat = Number(row[f.lat])
      const lng = Number(row[f.lng])
      const school: School = {
        id,
        officialName: name,
        shortName: null,
        aliases: [],
        district: r.district,
        districtCode: SEOUL_DISTRICTS.find((d) => d.name === r.district)?.legalCode ?? null,
        schoolType: schoolTypeOf(typeRaw, estRaw),
        schoolTypeStatus: conflicts.some((c) => c.field === 'schoolType') ? 'conflict' : typeRaw ? 'confirmed' : 'no_data',
        schoolSubtype: same?.schoolSubtype ?? null,
        sourceConflicts: conflicts,
        establishment: normalizeEstablishment(estRaw),
        gender: normalizeGender(String(row[f.gender] ?? '')),
        dayNight: normalizeDayNight(String(row[f.dayNight] ?? '')),
        operatingStatus: closed ? 'closed' : 'operating',
        address,
        geo: Number.isFinite(lat) && Number.isFinite(lng) && lat > 30 ? { lat, lng, source: 'schoolinfo', retrievedAt } : null,
        homepage: row[f.homepage] ? String(row[f.homepage]).trim() : null,
        codes: [{ provider: 'schoolinfo', code, status: nameOnly ? 'pending' : 'confirmed', evidenceIds: [evId] }],
        tracks: [],
        isSynthetic: false,
        retrievedAt,
        sourceDocumentId: docId,
        exclusionReason: closed ? '학교알리미 CLOSE_YN=Y (폐교·휴교 등). 목록에는 남기되 상담 후보에서 제외 사유 표시' : null,
      }
      if (closed) excluded.push(name)
      ds.schools.push(school)
      ds.facts.push({ id: `fact_${id}_hs_kind`, schoolId: id, field: 'school.kind_raw', value: typeRaw || null, unit: null, basisYear: null, definition: '학교알리미 고교 종류 원문(HS_KND_SC_NM)', validFrom: null, validTo: null, status: typeRaw ? 'confirmed' : 'no_data', evidenceIds: [evId], derivation: null, reviewerNote: null })
    }
  }
  const out = arg('out', path.join(root, 'data/ingest/schoolinfo.json'))!
  writeJson(out, { retrievedAt, succeeded: succeeded.map((s) => ({ district: s.district, count: s.rows.length })), failed: failed.map((x) => ({ district: x.district, error: x.error })), merged, pendingDup, excluded, dataset: ds })
  console.log(`데이터셋 저장: ${path.relative(root, out)} (학교 ${ds.schools.length}, 기존과 병합 ${merged.length}, 이름만 일치 ${pendingDup.length}, 폐교/휴교 표시 ${excluded.length})`)
  if (merged.length) console.log('병합(정식명+주소 일치):', merged.join(' · '))
  if (pendingDup.length) console.log('검토 대기:', pendingDup.join(' · '))
  const districts = results.map((r) => ({ district: r.district, status: r.ok ? ('succeeded' as const) : ('failed' as const), schoolCount: r.rows.length, error: r.ok ? null : r.error }))
  if (post) {
    const token = vars.ADMIN_API_TOKEN
    await postAdmin(post, token, '/api/admin/import', { dataset: ds, keepStatus: true, jobLabel: `schoolinfo basic ${retrievedAt}` })
    await postAdmin(post, token, '/api/admin/jobs/coverage', { jobKind: 'schoolinfo_basic', districts })
    console.log('관리 API 에 반영 완료 (학교 기본정보 + 자치구 범위)')
  }
}

main().catch((e) => {
  console.error('수집 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
