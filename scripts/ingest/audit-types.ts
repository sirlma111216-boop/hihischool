/**
 * 학교 유형 분류 감사: 학교알리미(HS_KND_SC_NM, FOND_SC_CODE)와 나이스(HS_SC_NM, SPCLY_PURPS_HS_ORD_NM, HS_GNRL_BUSNS_SC_NM, FOND_SC_NM)의
 * 원문 값을 학교별로 나란히 놓고, 조합별 건수·불일치·정보 손실을 보고한다. 분류 규칙을 바꾸기 전에 실행한다.
 * npm run ingest:audit-types   (두 키 필요)
 */
import path from 'node:path'
import { loadDevVars, writeJson } from './common'
import { SEOUL_DISTRICTS } from '../../shared/constants'

const root = path.resolve(import.meta.dirname, '../..')
const vars = loadDevVars(root)
const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, '').replace(/\(.*?\)/g, '')

interface SiRow { SCHUL_CODE: string; SCHUL_NM: string; HS_KND_SC_NM: string; FOND_SC_CODE: string; SCHUL_RDNMA: string; COEDU_SC_CODE: string }
interface NeisRow { SD_SCHUL_CODE: string; SCHUL_NM: string; HS_SC_NM: string; SPCLY_PURPS_HS_ORD_NM: string; HS_GNRL_BUSNS_SC_NM: string; FOND_SC_NM: string; ORG_RDNMA: string; ENE_BFE_SEHF_SC_NM: string; COEDU_SC_NM: string }

async function main() {
  const si: SiRow[] = []
  for (const d of SEOUL_DISTRICTS) {
    const u = new URL('https://www.schoolinfo.go.kr/openApi.do')
    u.searchParams.set('apiKey', vars.SCHOOLINFO_API_KEY ?? '')
    u.searchParams.set('apiType', '0')
    u.searchParams.set('sidoCode', '11')
    u.searchParams.set('sggCode', d.legalCode)
    u.searchParams.set('schulKndCode', '04')
    const j = (await (await fetch(u)).json()) as { list?: SiRow[] }
    si.push(...(j.list ?? []))
  }
  const u2 = new URL('https://open.neis.go.kr/hub/schoolInfo')
  u2.searchParams.set('KEY', vars.NEIS_API_KEY ?? '')
  u2.searchParams.set('Type', 'json')
  u2.searchParams.set('pSize', '1000')
  u2.searchParams.set('ATPT_OFCDC_SC_CODE', 'B10')
  u2.searchParams.set('SCHUL_KND_SC_NM', '고등학교')
  const j2 = (await (await fetch(u2)).json()) as { schoolInfo?: [unknown, { row: NeisRow[] }] }
  const neis = j2.schoolInfo?.[1]?.row ?? []

  const byName = new Map<string, NeisRow[]>()
  for (const n of neis) byName.set(norm(n.SCHUL_NM), [...(byName.get(norm(n.SCHUL_NM)) ?? []), n])
  const combos = new Map<string, string[]>()
  const rows: Record<string, string>[] = []
  for (const s of si) {
    const cands = byName.get(norm(s.SCHUL_NM)) ?? []
    const n = cands.find((c) => norm(c.ORG_RDNMA).startsWith(norm(s.SCHUL_RDNMA).slice(0, 12))) ?? (cands.length === 1 ? cands[0] : undefined)
    const key = [s.HS_KND_SC_NM, s.FOND_SC_CODE, n?.HS_SC_NM ?? '(나이스 없음)', n?.SPCLY_PURPS_HS_ORD_NM || '-', n?.HS_GNRL_BUSNS_SC_NM || '-', n?.ENE_BFE_SEHF_SC_NM || '-'].join(' | ')
    combos.set(key, [...(combos.get(key) ?? []), s.SCHUL_NM])
    rows.push({ name: s.SCHUL_NM, si_kind: s.HS_KND_SC_NM, si_fond: s.FOND_SC_CODE, si_coedu: s.COEDU_SC_CODE, neis_kind: n?.HS_SC_NM ?? '', neis_subtype: n?.SPCLY_PURPS_HS_ORD_NM ?? '', neis_track: n?.HS_GNRL_BUSNS_SC_NM ?? '', neis_fond: n?.FOND_SC_NM ?? '', neis_period: n?.ENE_BFE_SEHF_SC_NM ?? '', neis_coedu: n?.COEDU_SC_NM ?? '' })
  }
  console.log('=== 조합별 건수 (학교알리미 종류 | 학교알리미 설립 | 나이스 구분 | 나이스 특목 계열 | 일반/전문 | 전기/후기) ===')
  for (const [k, names] of [...combos.entries()].sort((a, b) => b[1].length - a[1].length)) console.log(`${String(names.length).padStart(3)}  ${k}${names.length <= 12 ? '  → ' + names.join(', ') : ''}`)
  console.log('\n=== 설립 불일치 ===')
  for (const r of rows) if (r.neis_fond && r.si_fond !== r.neis_fond) console.log(r.name, r.si_fond, 'vs', r.neis_fond)
  console.log('\n=== 공학 불일치 ===')
  for (const r of rows) if (r.neis_coedu && norm((r.si_coedu ?? "").replace('녀', '여')) !== norm(r.neis_coedu.replace('여자', '여').replace('남자', '남'))) console.log(r.name, r.si_coedu, 'vs', r.neis_coedu)
  writeJson(path.join(root, 'data/ingest/type-audit.json'), { generatedAt: new Date().toISOString(), rows })
  console.log(`\n저장: data/ingest/type-audit.json (${rows.length}행)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
