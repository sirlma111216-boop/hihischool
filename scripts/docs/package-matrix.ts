/**
 * 공식 웹페이지에서 캡처한 학년×학기 매트릭스 표 JSON → 검토 패키지(초안).
 * npm run docs:package-matrix -- --tables data/raw/<file>.json --school <id> --cohort 2026 --url <공식 페이지 URL> --publisher "<학교명>" [--revision 2022] [--tracks "트랙id=표제목 정규식,..."] [--out data/review/<name>.json] [--post http://localhost:5173]
 *
 * 표 JSON 은 브라우저에서 document.querySelectorAll('table') 로 캡처한 { tables: [{heading, rows:[[{t,rs,cs,th}]]}] } 형식이다.
 * 표 하나 = 과정(트랙) 하나로 취급한다. --tracks 로 표 제목과 트랙 id 를 연결한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { packageMatrixTable, type CapturedTable } from './lib/htmlmatrix'
import { emptyDataset, type Dataset } from '../../shared/dataset'
import { loadDevVars, postAdmin } from '../ingest/common'

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const root = path.resolve(import.meta.dirname, '../..')

const tablesFile = arg('tables')
const schoolId = arg('school')
const cohort = Number(arg('cohort'))
const url = arg('url')
if (!tablesFile || !schoolId || !Number.isInteger(cohort) || !url) {
  console.error('사용: --tables <json> --school <id> --cohort <연도> --url <공식 URL> [--publisher ..] [--revision 2022] [--tracks ..] [--out ..] [--post ..]')
  process.exit(2)
}
const raw = readFileSync(tablesFile, 'utf8')
const captured = JSON.parse(raw) as { url?: string; title?: string; tables: CapturedTable[] }
const sha256 = createHash('sha256').update(raw).digest('hex')
const revision = (arg('revision') as '2015' | '2022' | undefined) ?? 'unknown'
const publisher = arg('publisher') ?? '미확인'
const retrievedAt = new Date().toISOString()
const trackRules = (arg('tracks') ?? '').split(',').filter(Boolean).map((s) => { const [id, re] = s.split('='); return { id: id!, re: new RegExp(re ?? id!) } })

const merged: Dataset = emptyDataset()
const reports: string[] = []
captured.tables.forEach((t, i) => {
  const tr = trackRules.find((x) => x.re.test(t.heading))
  const trackId = tr?.id ?? (captured.tables.length > 1 ? `trk_${schoolId}_t${i + 1}` : null)
  const docId = `doc_${schoolId}_${cohort}_html_t${i + 1}`
  const { dataset, report } = packageMatrixTable(t, {
    schoolId,
    cohortYear: cohort,
    trackId,
    trackName: t.heading,
    revision,
    documentId: docId,
    documentTitle: `${captured.title ?? '공식 홈페이지'} — ${t.heading}`,
    officialUrl: url,
    publisher,
    retrievedAt,
    sha256,
    tableIndex: i,
  })
  if (trackId && !merged.tracks.some((x) => x.id === trackId)) merged.tracks.push({ id: trackId, schoolId, name: t.heading.replace(/^\d{4}학년도 입학\s*\(?/, '').replace(/\)$/, '') || `과정 ${i + 1}`, kind: 'department', status: 'unreviewed' })
  for (const k of Object.keys(merged) as (keyof Dataset)[]) if (k !== 'tracks') (merged[k] as unknown[]).push(...(dataset[k] as unknown[]))
  reports.push(`[표 ${i + 1}: ${t.heading}]`, ...report)
})
const out = arg('out', path.join('data/review', `${path.basename(tablesFile, '.json')}.review.json`))!
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ dataset: merged, report: reports }, null, 2), 'utf8')
console.log(reports.join('\n'))
console.log(`→ ${out}`)
const post = arg('post')
if (post) {
  const vars = loadDevVars(root)
  postAdmin(post, vars.ADMIN_API_TOKEN, '/api/admin/import', { dataset: merged, keepStatus: false, jobLabel: `html matrix ${schoolId} ${cohort}` })
    .then((r) => console.log('관리 API 가져오기(초안):', JSON.stringify(r)))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
