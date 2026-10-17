/**
 * 나이스 교육정보 개방 포털 — 학교기본정보 (서울특별시교육청 B10, 고등학교) 보완 수집.
 * npm run ingest:neis [-- --post http://localhost:5173] [--out data/ingest/neis.json]
 *
 * - NEIS_API_KEY 가 없으면 포털이 돌려주는 제한된 표본만 받는다. 표본을 서울 전체 목록으로 간주하지 않으며 coverage 에 'partial' 로 기록한다.
 * - NEIS 학교코드(SD_SCHUL_CODE)와 학교알리미 학교코드는 같은 값이 아니다. crosswalk 는 school_codes(provider='neis') 로 분리 저장하고,
 *   학교알리미 코드와의 매핑은 주소·공식 홈페이지·학교명을 함께 확인한 뒤 status='confirmed' 로 바꾼다 (자동 병합 금지).
 * - 수정일(LOAD_DTM)은 연계 시스템 변경일이며 교육과정 개정일로 쓰지 않는다.
 * 공식 문서: https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17020190531110010104913&infSeq=2
 */
import path from 'node:path'
import { loadDevVars, postAdmin, withRetry, writeJson, emptyIngestDataset, loadExistingSchools, matchExisting } from './common'
import { SEOUL_DISTRICTS, DISTRICT_NAMES } from '../../shared/constants'
import { districtFromAddress, normalizeDayNight, normalizeEstablishment, normalizeGender, normalizeSchoolType, slugId } from '../../shared/normalize'
import type { School, SourceDocument } from '../../shared/types'

const root = path.resolve(import.meta.dirname, '../..')
const vars = loadDevVars(root)
const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }

interface NeisRow {
  ATPT_OFCDC_SC_CODE: string
  SD_SCHUL_CODE: string
  SCHUL_NM: string
  SCHUL_KND_SC_NM: string
  LCTN_SC_NAME: string
  JU_ORG_NM: string
  FOND_SC_NM: string
  ORG_RDNMA: string
  ORG_RDNDA: string
  HMPG_ADRES: string
  COEDU_SC_NM: string
  HS_SC_NM: string
  HS_GNRL_BUSNS_SC_NM: string
  SPCLY_PURPS_HS_ORD_NM: string
  DGHT_SC_NM: string
  FOND_YMD: string
  FOAS_MEMRD: string
  LOAD_DTM: string
}

async function fetchPage(pIndex: number, key: string | undefined, schoolName?: string): Promise<{ rows: NeisRow[]; total: number | null; note: string | null }> {
  const u = new URL('https://open.neis.go.kr/hub/schoolInfo')
  if (key) u.searchParams.set('KEY', key)
  u.searchParams.set('Type', 'json')
  u.searchParams.set('pIndex', String(pIndex))
  u.searchParams.set('pSize', '1000')
  u.searchParams.set('ATPT_OFCDC_SC_CODE', 'B10')
  u.searchParams.set('SCHUL_KND_SC_NM', '고등학교')
  if (schoolName) u.searchParams.set('SCHUL_NM', schoolName) // 정식명 정확 일치 조회 (키 없이도 해당 행만 반환됨)
  const res = await fetch(u, { headers: { 'User-Agent': 'highschool-atlas-ingest/0.1' } })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const j = (await res.json()) as { schoolInfo?: [{ head: [{ list_total_count: number }, { RESULT: { CODE: string; MESSAGE: string } }] }, { row: NeisRow[] }]; RESULT?: { CODE: string; MESSAGE: string } }
  if (j.RESULT) return { rows: [], total: null, note: `${j.RESULT.CODE} ${j.RESULT.MESSAGE}` }
  const head = j.schoolInfo?.[0]?.head
  const rows = j.schoolInfo?.[1]?.row ?? []
  return { rows, total: head?.[0]?.list_total_count ?? null, note: head?.[1]?.RESULT?.MESSAGE ?? null }
}

async function main() {
  const key = vars.NEIS_API_KEY
  const schoolName = arg('name') // --name <정식명> : 특정 학교 한 곳만 (동명이교는 주소로 사람이 확인)
  const retrievedAt = new Date().toISOString()
  const existing = await loadExistingSchools(arg('post'))
  const mergedLog: string[] = []
  const pendingDup: string[] = []
  const all: NeisRow[] = []
  let total: number | null = null
  let note: string | null = null
  for (let p = 1; p <= 5; p++) {
    const r = await withRetry(() => fetchPage(p, key, schoolName))
    note = r.note
    total = r.total
    all.push(...r.rows)
    if (!key || schoolName || r.rows.length < 1000) break // 키 없이는 표본 1페이지만
  }
  const sampleOnly = !key && !schoolName
  console.log(`나이스 응답: ${all.length}행${total !== null ? ` / 전체 ${total}` : ''}${sampleOnly ? ' (인증키 없음 → 표본만, 서울 전체 아님)' : ''}${note ? ` · ${note}` : ''}`)

  const docId = `doc_neis_schoolinfo_${retrievedAt.slice(0, 10)}`
  const doc: SourceDocument = {
    id: docId,
    schoolId: null,
    documentType: 'basic_info',
    title: `나이스 학교기본정보 (서울 고등학교) 수집 ${retrievedAt.slice(0, 10)}${sampleOnly ? ' — 표본' : ''}`,
    officialUrl: 'https://open.neis.go.kr/portal/data/service/selectServicePage.do?infId=OPEN17020190531110010104913&infSeq=2',
    originalFilename: null,
    publisher: '나이스 교육정보 개방 포털',
    publishedAt: null,
    retrievedAt,
    applicableAcademicYear: null,
    cohortYear: null,
    curriculumRevision: null,
    trackId: null,
    version: '1',
    sha256: null,
    rights: 'official_public',
    parseStatus: 'extracted',
    reviewStatus: 'approved', // API 구조화 응답은 기본정보로서 승인 (검토자: 수집 실행자)
    supersedesId: null,
    isSynthetic: false,
    notes: sampleOnly ? '인증키 없는 표본 응답. 서울 전체 목록이 아님' : `전체 ${total}행 중 ${all.length}행`,
  }
  const ds = emptyIngestDataset()
  ds.documents.push(doc)
  ds.evidence.push({ id: `ev_${docId}`, documentId: docId, pdfPageIndex: null, printedPageLabel: null, tableId: 'schoolInfo', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: 'API 응답 행', excerpt: null, extractionMethod: 'api', reviewedBy: null, reviewedAt: null, isSynthetic: false })
  const perDistrict = new Map<string, number>()
  for (const r of all) {
    const address = [r.ORG_RDNMA, r.ORG_RDNDA].filter(Boolean).join(' ')
    const district = districtFromAddress(address, DISTRICT_NAMES)
    if (!district) {
      console.warn(`자치구를 알 수 없어 건너뜀: ${r.SCHUL_NM} (${address})`)
      continue
    }
    perDistrict.set(district, (perDistrict.get(district) ?? 0) + 1)
    // 기존 학교(예: 학교알리미 수집분)와 정식명 + 도로명 주소가 일치하면 같은 학교로 보고 코드만 추가한다.
    const { same, nameOnly } = matchExisting(existing, r.SCHUL_NM, r.ORG_RDNMA)
    const id = same ? same.id : slugId('sch', 'neis', r.SD_SCHUL_CODE) // 재시도 시 같은 id → upsert (중복 학교 생성 금지)
    if (same) mergedLog.push(`${r.SCHUL_NM} → ${same.id}`)
    if (nameOnly) pendingDup.push(`${r.SCHUL_NM}: 기존 ${nameOnly.id} 와 이름만 같음 (주소 다름) → 별도 학교, 코드 pending`)
    const typeRaw = r.HS_SC_NM || r.SPCLY_PURPS_HS_ORD_NM || r.HS_GNRL_BUSNS_SC_NM
    const school: School = {
      id,
      officialName: r.SCHUL_NM,
      shortName: null,
      aliases: [],
      district,
      districtCode: SEOUL_DISTRICTS.find((d) => d.name === district)?.legalCode ?? null,
      // 병합 시 더 세분화된 기존 값(학교알리미 자공/자사 구분, 좌표)을 유지한다
      schoolType: same && same.schoolTypeStatus === 'confirmed' ? (same.schoolType as School['schoolType']) : normalizeSchoolType(typeRaw),
      schoolTypeStatus: same && same.schoolTypeStatus === 'confirmed' ? 'confirmed' : typeRaw ? 'confirmed' : 'no_data',
      establishment: normalizeEstablishment(r.FOND_SC_NM),
      gender: normalizeGender(r.COEDU_SC_NM),
      dayNight: normalizeDayNight(r.DGHT_SC_NM),
      operatingStatus: 'unknown', // 나이스 기본정보에 운영 상태 필드가 없으면 추측하지 않음
      address: address || null,
      geo: same?.geo ?? null, // 나이스 기본정보는 좌표를 제공하지 않는다. 병합 시 기존 좌표 유지.
      homepage: r.HMPG_ADRES ? (r.HMPG_ADRES.startsWith('http') ? r.HMPG_ADRES : `http://${r.HMPG_ADRES}`) : null,
      codes: [{ provider: 'neis', code: r.SD_SCHUL_CODE, status: nameOnly ? 'pending' : 'confirmed', evidenceIds: [`ev_${docId}`] }],
      tracks: [],
      isSynthetic: false,
      retrievedAt,
      sourceDocumentId: docId,
      exclusionReason: null,
    }
    ds.schools.push(school)
    ds.facts.push({ id: `fact_${id}_founded`, schoolId: id, field: 'school.founded', value: r.FOND_YMD || null, unit: null, basisYear: null, definition: '설립일 (나이스 기본정보)', validFrom: null, validTo: null, status: r.FOND_YMD ? 'confirmed' : 'no_data', evidenceIds: [`ev_${docId}`], derivation: null, reviewerNote: null })
  }
  const out = arg('out', path.join(root, 'data/ingest/neis.json'))!
  writeJson(out, { retrievedAt, sampleOnly, total, rows: all.length, merged: mergedLog, pendingDup, dataset: ds })
  console.log(`데이터셋 저장: ${path.relative(root, out)} (학교 ${ds.schools.length}, 기존과 병합 ${mergedLog.length}, 이름만 일치 ${pendingDup.length})`)
  if (pendingDup.length) console.log('검토 대기:', pendingDup.join(' · '))

  const districts = SEOUL_DISTRICTS.map((d) => ({ district: d.name, status: sampleOnly ? (perDistrict.has(d.name) ? ('partial' as const) : ('not_attempted' as const)) : perDistrict.has(d.name) ? ('succeeded' as const) : ('failed' as const), schoolCount: perDistrict.get(d.name) ?? 0, error: sampleOnly ? '인증키 없는 표본 수집 (전체 아님)' : null }))
  const post = arg('post')
  if (post) {
    const token = vars.ADMIN_API_TOKEN
    await postAdmin(post, token, '/api/admin/import', { dataset: ds, keepStatus: true, jobLabel: `neis basic ${schoolName ?? ''} ${retrievedAt}` })
    // 학교 한 곳 조회는 자치구 범위를 바꾸지 않는다 (해당 구 전체 수집이 아님)
    if (!schoolName) await postAdmin(post, token, '/api/admin/jobs/coverage', { jobKind: 'neis_basic', districts, note: sampleOnly ? '표본만' : `전체 ${total}` })
    console.log(`관리 API 에 반영 완료 (학교 기본정보${schoolName ? '' : ' + 자치구 범위'})`)
  } else {
    console.log('관리 API 반영은 --post <baseUrl> 로 실행합니다.')
  }
}

main().catch((e) => {
  console.error('수집 실패:', e instanceof Error ? e.message : e)
  process.exit(1)
})
