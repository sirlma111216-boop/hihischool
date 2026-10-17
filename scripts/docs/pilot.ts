/**
 * 파일럿 파이프라인: discover.json 의 학교별 최선 첨부를 받아 추출 → 검토 패키지 → 초안 등록까지 한 번에.
 * npm run docs:pilot -- [--discover data/ingest/discover.json] [--api http://localhost:5174] [--only <schoolId>] [--dry]
 * - 다운로드 대상은 학교 공식 홈페이지 첨부(사용자 승인 범위)만. data/private/sources/<학교명>/ 에 저장(Git 제외).
 * - HWP(OLE) 는 변환 필요로 건너뛴다. 결과는 data/ingest/pilot-report.json 과 콘솔에 학교별로 기록.
 * - 모든 결과는 초안이다. 승인·공개는 사람이 관리 화면에서 한다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import type { Discovery, Attachment, Post } from './discover'
import { sniffFileType } from '../../shared/filesig'

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const flag = (n: string) => process.argv.includes(`--${n}`)
const root = path.resolve(import.meta.dirname, '../..')
const api = arg('api', 'http://localhost:5174')!
const discoverFile = arg('discover', path.join(root, 'data/ingest/discover.json'))!
const only = arg('only')
const dry = flag('dry')

interface Pick { post: Post; attachment: Attachment; cohort: number | null; revision: '2015' | '2022' | 'unknown'; score: number; boardUrl: string }
interface Report { schoolId: string; name: string; status: 'draft_imported' | 'skipped' | 'failed' | 'dry'; pick: { title: string; file: string; url: string; sizeBytes: number; cohort: number | null; revision: string } | null; detail: string; counts?: Record<string, number> }

function yearsOf(s: string): number[] { return [...s.matchAll(/(20\d\d)/g)].map((m) => Number(m[1])).filter((y) => y >= 2015 && y <= 2030) }

export function choose(d: Discovery): Pick | null {
  let best: Pick | null = null
  for (const b of d.boards) for (const p of b.posts) for (const a of p.attachments) {
    if (!a.url) continue
    const nameYears = yearsOf(a.name)
    const titleYears = yearsOf(p.title)
    const cohortYear = (() => {
      const m = a.name.match(/(20\d\d)\s*학년도?\s*(입학|신입)/) ?? p.title.match(/(20\d\d)\s*학년도?\s*(입학|신입)/)
      if (m) return Number(m[1])
      const m2 = a.name.match(/(20\d\d)\s*학년도/) ?? p.title.match(/(20\d\d)\s*학년도/)
      return m2 ? Number(m2[1]) : null
    })()
    const y = nameYears.length ? Math.max(...nameYears) : titleYears.length ? Math.max(...titleYears) : 0
    const isTable = /편제|배당/.test(a.name) || (/편제|배당/.test(p.title) && !/계획서/.test(a.name))
    let score = y * 10
    if (isTable) score += 500
    if (/^(PDF|XLSX|HWPX)$/.test(a.ext)) score += 50
    else if (a.ext === 'HWP') score += 10
    else score -= 1000
    if (/계획서|계획\b/.test(a.name) && !isTable) score += 20 // 편제표 없을 때의 차선
    if (/조직도|서식|신청서|가정통신문/.test(a.name)) score -= 2000
    const revision: Pick['revision'] = /2022\s*개정/.test(a.name + p.title) ? '2022' : /2015\s*개정/.test(a.name + p.title) ? '2015' : cohortYear && cohortYear >= 2025 ? '2022' : cohortYear && cohortYear <= 2024 ? '2015' : 'unknown'
    if (!best || score > best.score) best = { post: p, attachment: a, cohort: cohortYear, revision, score, boardUrl: b.url }
  }
  return best
}

async function download(url: string, dest: string): Promise<{ ok: boolean; bytes: number; sig: string; error: string | null }> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'highschool-atlas-pilot/0.1', Referer: new URL(url).origin } })
    if (!r.ok) return { ok: false, bytes: 0, sig: 'unknown', error: `HTTP ${r.status}` }
    const buf = new Uint8Array(await r.arrayBuffer())
    if (buf.byteLength > 80 * 1024 * 1024) return { ok: false, bytes: buf.byteLength, sig: 'unknown', error: '크기 제한 초과' }
    const sig = sniffFileType(buf)
    mkdirSync(path.dirname(dest), { recursive: true })
    writeFileSync(dest, buf)
    return { ok: true, bytes: buf.byteLength, sig, error: null }
  } catch (e) {
    return { ok: false, bytes: 0, sig: 'unknown', error: e instanceof Error ? e.message : String(e) }
  }
}

function run(args: string[]): { code: number; out: string } {
  // shell 없이 실행해 공백·한글 경로가 깨지지 않게 한다
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules/tsx/dist/cli.mjs'), ...args], { cwd: root, encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 })
  return { code: r.status ?? 1, out: (r.stdout ?? '') + (r.stderr ?? '') }
}

async function main() {
  const { results } = JSON.parse(readFileSync(discoverFile, 'utf8')) as { results: Discovery[] }
  const reports: Report[] = []
  for (const d of results) {
    if (only && d.schoolId !== only) continue
    const pick = choose(d)
    const base: Report = { schoolId: d.schoolId, name: d.name, status: 'skipped', pick: null, detail: '' }
    if (!pick) {
      base.detail = d.errors.length ? `후보 없음 (${d.errors.join('; ')})` : '후보 없음 — 게시판에 편제표·교육계획 첨부가 없음 (사람이 홈페이지 확인)'
      reports.push(base)
      console.log(`✗ ${d.name}: ${base.detail}`)
      continue
    }
    base.pick = { title: pick.post.title, file: pick.attachment.name, url: pick.attachment.url, sizeBytes: pick.attachment.sizeBytes, cohort: pick.cohort, revision: pick.revision }
    if (dry) {
      base.status = 'dry'
      base.detail = `선택: ${pick.attachment.name} (${(pick.attachment.sizeBytes / 1048576).toFixed(2)}MB) 입학연도 ${pick.cohort ?? '미상'} 개정 ${pick.revision}`
      reports.push(base)
      console.log(`· ${d.name}: ${base.detail}`)
      continue
    }
    if (!pick.cohort) {
      base.detail = `대상 입학연도를 파일명/제목에서 읽지 못함: ${pick.attachment.name} — 사람이 지정 필요`
      reports.push(base)
      console.log(`✗ ${d.name}: ${base.detail}`)
      continue
    }
    const safeName = d.name.replace(/[\\/:*?"<>|]/g, '_')
    const ext = pick.attachment.ext.toLowerCase()
    const dest = path.join(root, 'data/private/sources', safeName, `${pick.cohort}_${pick.attachment.name.replace(/[\\/:*?"<>|]/g, '_')}`)
    if (!existsSync(dest)) {
      const dl = await download(pick.attachment.url, dest)
      if (!dl.ok) {
        base.status = 'failed'
        base.detail = `다운로드 실패: ${dl.error}`
        reports.push(base)
        console.log(`✗ ${d.name}: ${base.detail}`)
        continue
      }
      if (dl.sig === 'hwp' || (dl.sig === 'unknown' && ext !== 'xlsx')) {
        base.detail = `서명 ${dl.sig} (${ext}) — HWP 는 PDF/HWPX 변환 후 재등록 필요. 파일 보관: ${path.relative(root, dest)}`
        reports.push(base)
        console.log(`✗ ${d.name}: ${base.detail}`)
        continue
      }
    }
    const docId = `doc_${d.schoolId}_${pick.cohort}_${ext}`
    const isTable = /편제|배당/.test(pick.attachment.name)
    // 학교교육계획서 등은 여러 입학연도 표가 섞여 있어 표 제목의 입학연도만 믿는다
    const common = ['--school', d.schoolId, '--cohort', String(pick.cohort), '--url', pick.boardUrl, '--publisher', d.name, '--revision', pick.revision, '--post', api, '--out', `data/review/${d.schoolId}-${pick.cohort}.review.json`, ...(isTable ? [] : ['--require-heading-cohort'])]
    let pkg: { code: number; out: string }
    if (ext === 'xlsx') {
      pkg = run(['scripts/docs/package-matrix.ts', '--xlsx', dest, ...common])
    } else if (ext === 'pdf') {
      const ex = run(['scripts/docs/extract.ts', '--file', dest, '--doc', docId, '--out', `data/extracted/${d.schoolId}-${pick.cohort}.json`])
      if (ex.code !== 0) {
        base.status = 'failed'
        base.detail = `추출 실패: ${ex.out.trim().split('\n').slice(-2).join(' ')}`
        reports.push(base)
        console.log(`✗ ${d.name}: ${base.detail}`)
        continue
      }
      pkg = run(['scripts/docs/package-matrix.ts', '--pdf', `data/extracted/${d.schoolId}-${pick.cohort}.json`, ...common])
    } else if (ext === 'hwpx') {
      base.detail = 'HWPX 편제표는 매트릭스 변환기가 아직 없음 — 세로형이면 docs:package, 아니면 PDF 로 변환해 재등록'
      reports.push(base)
      console.log(`✗ ${d.name}: ${base.detail}`)
      continue
    } else {
      base.detail = `지원하지 않는 형식 ${ext}`
      reports.push(base)
      console.log(`✗ ${d.name}: ${base.detail}`)
      continue
    }
    const summary = pkg.out.split('\n').filter((l) => /편성 \d+건|경고|실패|찾지 못|관리 API/.test(l)).join(' / ')
    const importedVersions = Number(pkg.out.match(/"versions":([0-9]+)/)?.[1] ?? 0)
    if (pkg.code !== 0 || !/관리 API 가져오기/.test(pkg.out) || importedVersions === 0) {
      base.status = 'failed'
      base.detail = `패키지/등록 실패: ${summary || pkg.out.trim().split('\n').slice(-3).join(' ')}`
    } else {
      base.status = 'draft_imported'
      const m = pkg.out.match(/편성 (\d+)건, 선택군 후보 (\d+)개, 근거 (\d+)건/)
      base.counts = m ? { offerings: Number(m[1]), groups: Number(m[2]), evidence: Number(m[3]) } : {}
      const warns = (pkg.out.match(/검토 경고|다릅니다|비어 있어/g) ?? []).length
      base.detail = `초안 등록 · ${summary}${warns ? ` · 검토 경고 ${warns}건` : ''}`
    }
    reports.push(base)
    console.log(`${base.status === 'draft_imported' ? '✓' : '✗'} ${d.name}: ${base.detail}`)
  }
  const out = path.join(root, 'data/ingest', path.basename(discoverFile).replace(/^discover/, 'pilot-report'))
  writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), reports }, null, 2), 'utf8')
  console.log(`→ ${path.relative(root, out)} · 초안 ${reports.filter((r) => r.status === 'draft_imported').length} / 건너뜀 ${reports.filter((r) => r.status === 'skipped').length} / 실패 ${reports.filter((r) => r.status === 'failed').length}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
