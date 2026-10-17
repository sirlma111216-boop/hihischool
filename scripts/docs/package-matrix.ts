/**
 * 학년×학기 매트릭스 표 → 검토 패키지(초안).
 *  (A) 공식 웹페이지 HTML 표 JSON:  --tables data/raw/<file>.json
 *  (B) PDF 추출 JSON(격자 복원):    --pdf data/extracted/<id>.json   (여러 쪽에 걸친 표는 하나로 이어 붙임)
 * 공통: --school <id> --cohort 2026 --url <공식 URL> [--publisher ..] [--revision 2022] [--tracks "트랙id=표제목 정규식,..."] [--out ..] [--post http://localhost:5173]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { packageMatrixTable, type CapturedTable, type MatrixOptions } from './lib/htmlmatrix'
import { headerRowCount, mergeContinuation, pdfToMatrixTables } from './lib/pdfmatrix'
import { xlsxToMatrixTables } from './lib/xlsxmatrix'
import { emptyDataset, type Dataset } from '../../shared/dataset'
import type { ExtractionResult } from '../../shared/extraction'
import { loadDevVars, postAdmin } from '../ingest/common'

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const root = path.resolve(import.meta.dirname, '../..')

const tablesFile = arg('tables')
const pdfFile = arg('pdf')
const xlsxFile = arg('xlsx')
const schoolId = arg('school')
const cohort = Number(arg('cohort'))
const url = arg('url')
if ((!tablesFile && !pdfFile && !xlsxFile) || !schoolId || !Number.isInteger(cohort) || !url) {
  console.error('사용: (--tables <json> | --pdf <extraction.json>) --school <id> --cohort <연도> --url <공식 URL> [--publisher ..] [--revision 2022] [--tracks ..] [--out ..] [--post ..]')
  process.exit(2)
}
const revision = (arg('revision') as '2015' | '2022' | undefined) ?? 'unknown'
const publisher = arg('publisher') ?? '미확인'
const retrievedAt = new Date().toISOString()
const trackRules = (arg('tracks') ?? '').split(',').filter(Boolean).map((s) => { const [id, re] = s.split('='); return { id: id!, re: new RegExp(re ?? id!) } })

let captured: { title?: string; tables: CapturedTable[] }
let sha256: string
let source: MatrixOptions['source'] = 'html_table'
let pageSizes: MatrixOptions['pageSizes']
let pageLabels: MatrixOptions['pageLabels']
let originalFilename: string | null = null
if (pdfFile) {
  const raw = readFileSync(pdfFile, 'utf8')
  const ex = JSON.parse(raw) as ExtractionResult
  sha256 = ex.sha256
  source = 'pdf_table'
  originalFilename = path.basename(ex.sourceFile)
  pageSizes = Object.fromEntries(ex.pages.map((p) => [p.pdfPageIndex, { width: p.width, height: p.height }]))
  pageLabels = Object.fromEntries(ex.pages.map((p) => [p.pdfPageIndex, p.printedPageLabel]))
  const grids = pdfToMatrixTables(ex)
  if (grids.length === 0) {
    console.error('PDF 에서 학기 머리글이 있는 격자 표를 찾지 못했습니다. 텍스트 레이어·테두리가 있는 PDF 인지 확인하세요.')
    process.exit(1)
  }
  // 제목에 '20xx학년도 입학' 이 있는 격자는 새 표를 시작하고, 없는 격자는 직전 표의 연속으로 본다
  const groups: (typeof grids)[] = []
  for (const g of grids) {
    const startsNew = groups.length === 0 || /20\d\d\s*학년도?\s*(입학|신입)/.test(g.heading) || /학과|과정\)/.test(g.heading)
    if (startsNew) groups.push([g])
    else groups[groups.length - 1]!.push(g)
  }
  const tables: CapturedTable[] = []
  for (const grp of groups) {
    const merged = mergeContinuation(grp)!
    const rowPages: number[] = []
    let first = true
    for (const g of grp) {
      const hn = first ? 0 : headerRowCount(g)
      for (let r = hn; r < g.rows.length; r++) rowPages.push(g.pageIndex)
      first = false
    }
    merged.rowPages = rowPages
    tables.push(merged)
    console.log(`PDF 격자: 쪽 ${grp.map((g) => g.pageIndex + 1).join(',')} → 표 (${merged.rows.length}행), 제목 "${merged.heading}"`)
  }
  captured = { title: path.basename(ex.sourceFile), tables }
} else if (xlsxFile) {
  const bytes = readFileSync(xlsxFile)
  sha256 = createHash('sha256').update(bytes).digest('hex')
  source = 'xlsx' as MatrixOptions['source']
  originalFilename = path.basename(xlsxFile)
  const tables = await xlsxToMatrixTables(xlsxFile)
  if (tables.length === 0) {
    console.error('XLSX 에서 학기 머리글이 있는 표를 찾지 못했습니다.')
    process.exit(1)
  }
  captured = { title: path.basename(xlsxFile), tables }
  console.log(`XLSX 표 ${tables.length}개: ${tables.map((t) => t.heading).join(' / ')}`)
} else {
  const raw = readFileSync(tablesFile!, 'utf8')
  captured = JSON.parse(raw) as { title?: string; tables: CapturedTable[] }
  sha256 = createHash('sha256').update(raw).digest('hex')
}

const merged: Dataset = emptyDataset()
const reports: string[] = []
const requireHeadingCohort = process.argv.includes('--require-heading-cohort')
const cohortOf = (heading: string): number | null => { const m = heading.match(/(20\d\d)\s*학년도?\s*(입학|신입)/); return m ? Number(m[1]) : null }
const cohortCounts = new Map<number, number>()
for (const t of captured.tables) { const c = cohortOf(t.heading) ?? (requireHeadingCohort ? null : cohort); if (c !== null) cohortCounts.set(c, (cohortCounts.get(c) ?? 0) + 1) }
captured.tables.forEach((t, i) => {
  const tableCohort = cohortOf(t.heading) ?? (requireHeadingCohort ? null : cohort)
  if (tableCohort === null) {
    reports.push(`[표 ${i + 1}: ${t.heading || '(제목 없음)'}] 제목에서 대상 입학연도를 읽지 못해 건너뜀 (학교교육계획서 등 여러 입학연도가 섞인 문서는 표 제목으로만 판정)`)
    return
  }
  const tr = trackRules.find((x) => x.re.test(t.heading))
  const sameCohortTables = cohortCounts.get(tableCohort) ?? 1
  const trackId = tr?.id ?? (sameCohortTables > 1 ? `trk_${schoolId}_t${i + 1}` : null)
  const docId = `doc_${schoolId}_${tableCohort}_${source === 'pdf_table' ? 'pdf' : source === 'xlsx' ? 'xlsx' : 'html'}_t${i + 1}`
  const { dataset, report } = packageMatrixTable(t, {
    schoolId,
    cohortYear: tableCohort,
    trackId,
    trackName: t.heading,
    revision,
    documentId: docId,
    documentTitle: `${captured.title ?? '공식 문서'}${t.heading ? ` — ${t.heading}` : ''}`,
    officialUrl: url,
    publisher,
    retrievedAt,
    sha256,
    tableIndex: i,
    source,
    pageSizes,
    pageLabels,
    originalFilename,
  })
  if (trackId && !merged.tracks.some((x) => x.id === trackId)) merged.tracks.push({ id: trackId, schoolId, name: t.heading.replace(/^\d{4}학년도 입학\s*\(?/, '').replace(/\)$/, '') || `과정 ${i + 1}`, kind: 'department', status: 'unreviewed' })
  if (merged.versions.some((v) => v.cohortYear === tableCohort && v.trackId === trackId && v.id !== dataset.versions[0]?.id)) reports.push(`[표 ${i + 1}] 같은 입학연도·과정의 표가 이미 있어 과정 id 를 분리하지 못함 — 사람 확인`)
  for (const k of Object.keys(merged) as (keyof Dataset)[]) if (k !== 'tracks') (merged[k] as unknown[]).push(...(dataset[k] as unknown[]))
  reports.push(`[표 ${i + 1}: ${t.heading}]`, ...report)
})
const out = arg('out', path.join('data/review', `${path.basename(pdfFile ?? xlsxFile ?? tablesFile!).replace(/.[^.]+$/, '')}.review.json`))!
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, JSON.stringify({ dataset: merged, report: reports }, null, 2), 'utf8')
console.log(reports.join('\n'))
console.log(`→ ${out}`)
const post = arg('post')
if (post) {
  const vars = loadDevVars(root)
  postAdmin(post, vars.ADMIN_API_TOKEN, '/api/admin/import', { dataset: merged, keepStatus: false, jobLabel: `matrix ${schoolId} ${cohort}` })
    .then((r) => console.log('관리 API 가져오기(초안):', JSON.stringify(r)))
    .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
}
