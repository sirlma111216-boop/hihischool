/**
 * 학교알리미 Open API — 학교 기본정보를 서울 25개 자치구별(sgg)로 조회해 병합한다.
 * npm run ingest:schoolinfo [-- --post http://localhost:5173] [--config scripts/ingest/schoolinfo.config.json]
 *
 * 주의 (확인 필요 사항은 config 에서 바꾼다):
 * - 2026-01-01 이후 발급 키는 시군구 코드 조건이 필수다 (공지 notice_no=...256). 파라미터 이름·코드 형식은 공식 API 목록에서 재확인한다.
 * - 응답 필드명은 API 제공목록(apiType)에 따라 다르다. config.fieldMap 으로 매핑하며, 모르는 필드는 'unknown'/null 로 둔다.
 * - 실패한 구는 성공한 구와 함께 '부분' 상태로 기록하고 '서울 전체 수집 완료'라고 표시하지 않는다.
 * - 동시성 2, 재시도 3회. 상담 화면에서 호출하지 않는다 (관리자 수동 갱신 전용).
 * 공식 목록: https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l0.do
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { loadDevVars, mapLimit, postAdmin, withRetry, writeJson, emptyIngestDataset } from './common'
import { SEOUL_DISTRICTS } from '../../shared/constants'
import { normalizeEstablishment, normalizeGender, normalizeSchoolType, slugId } from '../../shared/normalize'
import type { School, SourceDocument } from '../../shared/types'

const root = path.resolve(import.meta.dirname, '../..')
const vars = loadDevVars(root)
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }

interface Config {
  endpoint: string
  apiType: string
  keyParam: string
  sggParam: string
  extraParams: Record<string, string>
  /** 자치구 이름 → sgg 코드 (기본: 법정 시군구 코드 5자리. 공식 표와 다르면 여기서 덮어쓴다) */
  sggCodes: Record<string, string>
  listPath: string[] // 응답에서 목록 배열까지의 경로
  fieldMap: { code: string; name: string; type: string; establishment: string; gender: string; address: string; homepage: string; lat: string; lng: string }
}

const configPath = arg('config', path.join(root, 'scripts/ingest/schoolinfo.config.json'))!
const config: Config = existsSync(configPath)
  ? (JSON.parse(readFileSync(configPath, 'utf8')) as Config)
  : {
      endpoint: 'https://www.schoolinfo.go.kr/openApi.do',
      apiType: '0',
      keyParam: 'apiKey',
      sggParam: 'sggCode',
      extraParams: { schulKndCode: '04' },
      sggCodes: Object.fromEntries(SEOUL_DISTRICTS.map((d) => [d.name, d.legalCode])),
      listPath: ['list'],
      fieldMap: { code: 'SCHUL_CODE', name: 'SCHUL_NM', type: 'SCHUL_KND_SC_NM', establishment: 'FOND_SC_NM', gender: 'COEDU_SC_NM', address: 'ADRES_BRKDN', homepage: 'HMPG_ADRES', lat: 'LAT', lng: 'LNG' },
    }

function dig(obj: unknown, pathParts: string[]): unknown {
  let cur = obj
  for (const p of pathParts) {
    if (cur && typeof cur === 'object' && p in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[p]
    else return undefined
  }
  return cur
}

async function fetchDistrict(_name: string, code: string, key: string): Promise<Record<string, unknown>[]> {
  const u = new URL(config.endpoint)
  u.searchParams.set(config.keyParam, key)
  u.searchParams.set('apiType', config.apiType)
  u.searchParams.set(config.sggParam, code)
  for (const [k, v] of Object.entries(config.extraParams)) u.searchParams.set(k, v)
  const res = await fetch(u, { headers: { 'User-Agent': 'highschool-atlas-ingest/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as unknown
  const list = dig(j, config.listPath)
  if (!Array.isArray(list)) throw new Error(`응답에 목록(${config.listPath.join('.')})이 없음: ${JSON.stringify(j).slice(0, 200)}`)
  return list as Record<string, unknown>[]
}

async function main() {
  const key = vars.SCHOOLINFO_API_KEY
  if (!key) {
    console.error('SCHOOLINFO_API_KEY 가 없습니다. .dev.vars 에 키를 넣거나 환경 변수로 전달하세요. (키 없이 수집했다고 표시하지 않습니다)')
    process.exit(2)
  }
  const retrievedAt = new Date().toISOString()
  const results = await mapLimit(SEOUL_DISTRICTS, 2, async (d) => {
    const code = config.sggCodes[d.name] ?? d.legalCode
    try {
      const rows = await withRetry(() => fetchDistrict(d.name, code, key))
      return { district: d.name, code, ok: true as const, rows }
    } catch (e) {
      return { district: d.name, code, ok: false as const, error: e instanceof Error ? e.message : String(e), rows: [] as Record<string, unknown>[] }
    }
  })
  const succeeded = results.filter((r) => r.ok)
  const failed = results.filter((r) => !r.ok)
  console.log(`자치구 수집: 성공 ${succeeded.length} / 실패 ${failed.length}${failed.length ? ' — ' + failed.map((f) => `${f.district}(${f.error})`).join(', ') : ''}`)

  const docId = `doc_schoolinfo_basic_${retrievedAt.slice(0, 10)}`
  const doc: SourceDocument = { id: docId, schoolId: null, documentType: 'basic_info', title: `학교알리미 학교 기본정보 (서울, 자치구별) 수집 ${retrievedAt.slice(0, 10)}`, officialUrl: 'https://www.schoolinfo.go.kr/ng/go/pnnggo_a01_l0.do', originalFilename: null, publisher: '학교알리미', publishedAt: null, retrievedAt, applicableAcademicYear: null, cohortYear: null, curriculumRevision: null, trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'extracted', reviewStatus: 'approved', supersedesId: null, isSynthetic: false, notes: `성공 ${succeeded.length}구 / 실패 ${failed.length}구` }
  const ds = emptyIngestDataset()
  ds.documents.push(doc)
  ds.evidence.push({ id: `ev_${docId}`, documentId: docId, pdfPageIndex: null, printedPageLabel: null, tableId: `apiType ${config.apiType}`, rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: 'API 응답 행', excerpt: null, extractionMethod: 'api', reviewedBy: null, reviewedAt: null, isSynthetic: false })
  const seen = new Set<string>()
  for (const r of succeeded) {
    for (const row of r.rows) {
      const f = config.fieldMap
      const code = String(row[f.code] ?? '')
      if (!code || seen.has(code)) continue // 중복 학교 방지
      seen.add(code)
      const lat = Number(row[f.lat])
      const lng = Number(row[f.lng])
      const school: School = {
        id: slugId('sch', 'si', code),
        officialName: String(row[f.name] ?? ''),
        shortName: null,
        aliases: [],
        district: r.district,
        districtCode: r.code,
        schoolType: normalizeSchoolType(String(row[f.type] ?? '')),
        schoolTypeStatus: row[f.type] ? 'confirmed' : 'no_data',
        establishment: normalizeEstablishment(String(row[f.establishment] ?? '')),
        gender: normalizeGender(String(row[f.gender] ?? '')),
        dayNight: 'unknown',
        operatingStatus: 'unknown',
        address: row[f.address] ? String(row[f.address]) : null,
        geo: Number.isFinite(lat) && Number.isFinite(lng) && lat > 0 ? { lat, lng, source: 'schoolinfo', retrievedAt } : null,
        homepage: row[f.homepage] ? String(row[f.homepage]) : null,
        codes: [{ provider: 'schoolinfo', code, status: 'confirmed', evidenceIds: [`ev_${docId}`] }],
        tracks: [],
        isSynthetic: false,
        retrievedAt,
        sourceDocumentId: docId,
        exclusionReason: null,
      }
      if (!school.officialName) continue
      ds.schools.push(school)
    }
  }
  const out = arg('out', path.join(root, 'data/ingest/schoolinfo.json'))!
  writeJson(out, { retrievedAt, succeeded: succeeded.map((s) => s.district), failed: failed.map((f) => ({ district: f.district, error: f.error })), dataset: ds })
  console.log(`데이터셋 저장: ${path.relative(root, out)} (학교 ${ds.schools.length})`)
  const districts = results.map((r) => ({ district: r.district, status: r.ok ? ('succeeded' as const) : ('failed' as const), schoolCount: r.rows.length, error: r.ok ? null : r.error }))
  const post = arg('post')
  if (post) {
    const token = vars.ADMIN_API_TOKEN
    await postAdmin(post, token, '/api/admin/import', { dataset: ds, keepStatus: true, jobLabel: `schoolinfo basic ${retrievedAt}` })
    await postAdmin(post, token, '/api/admin/jobs/coverage', { jobKind: 'schoolinfo_basic', districts })
    console.log('관리 API 에 반영 완료')
  }
}

main().catch((e) => {
  console.error('수집 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
