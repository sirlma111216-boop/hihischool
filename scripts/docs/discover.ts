/**
 * 학교 공식 홈페이지에서 교육과정 편제표 게시물·첨부파일을 찾는다.
 * 대상: 서울시교육청 학교홈페이지 공통 구조(/dggb/module/siteMap/siteMap.do, 게시판 AJAX selectBoardListAjax.do / selectBoardDetailAjax.do).
 * npm run docs:discover -- --limit 20 [--offset 0] [--only <schoolId>] [--api http://localhost:5173] [--out data/ingest/discover.json]
 * 파일을 내려받지 않는다. 결과: 학교별 후보 게시판·게시물·첨부(파일명/크기/다운로드 URL)와 최선 후보.
 * 허용 범위: 검증된 기본정보의 homepage 호스트만. 로그인·우회 없음. 요청 간 지연을 둔다.
 */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { writeJson } from '../ingest/common'

const arg = (n: string, d?: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d }
const root = path.resolve(import.meta.dirname, '../..')
const api = arg('api', 'http://localhost:5174')!
const limit = Number(arg('limit', '20'))
const offset = Number(arg('offset', '0'))
const only = arg('only')
const idsFile = arg('ids') // 학교 ID 배열 JSON 파일로 대상 지정

const UA = 'highschool-atlas-discover/0.1 (public official pages only)'
const strip = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface Attachment { name: string; ext: string; sizeBytes: number; url: string }
export interface Post { bbsId: string; nttId: string; title: string; date: string; attachments: Attachment[]; detailFetched: boolean }
export interface Board { label: string; url: string; posts: Post[]; staticTable: boolean }
export interface Discovery { schoolId: string; name: string; homepage: string | null; origin: string | null; boards: Board[]; errors: string[]; best: { boardUrl: string; post: Post; attachment: Attachment; reason: string } | null }

class Site {
  cookie = ''
  constructor(public origin: string) {}
  async get(pathName: string): Promise<string> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    try {
      const r = await fetch(`${this.origin}${pathName}`, { headers: { 'User-Agent': UA, ...(this.cookie ? { Cookie: this.cookie } : {}) }, signal: ctrl.signal })
      const sc = r.headers.get('set-cookie')
      if (sc && !this.cookie) this.cookie = sc.split(',').map((s) => s.split(';')[0]!.trim()).filter((s) => /JSESSIONID|WMONID/.test(s)).join('; ')
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.text()
    } finally {
      clearTimeout(t)
    }
  }
  async post(pathName: string, fields: Record<string, string>, referer: string): Promise<string> {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 20000)
    try {
      const r = await fetch(`${this.origin}${pathName}`, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: referer, 'X-Requested-With': 'XMLHttpRequest', ...(this.cookie ? { Cookie: this.cookie } : {}) }, body: new URLSearchParams(fields).toString(), signal: ctrl.signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return await r.text()
    } finally {
      clearTimeout(t)
    }
  }
}

const BOARD_RE = /교육과정|편제|학교교육계획|교육계획서|교육계획/
const POST_RE = /편제|배당|교육과정|학교교육계획|교육계획서/
const YEAR_RE = /(20\d\d)/g

export async function discoverSchool(school: { id: string; officialName: string; homepage: string | null }): Promise<Discovery> {
  const out: Discovery = { schoolId: school.id, name: school.officialName, homepage: school.homepage, origin: null, boards: [], errors: [], best: null }
  if (!school.homepage) {
    out.errors.push('홈페이지 미확인')
    return out
  }
  let site: Site
  try {
    site = new Site(new URL(school.homepage).origin.replace(/^http:/, 'https:'))
    out.origin = site.origin
  } catch {
    out.errors.push('홈페이지 주소 형식 오류')
    return out
  }
  // 1) 사이트맵에서 교육과정 관련 메뉴
  let menuLinks: { label: string; url: string }[] = []
  try {
    const html = await site.get('/dggb/module/siteMap/siteMap.do')
    const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]{1,40})<\/a>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html))) {
      const label = strip(m[2]!)
      if (BOARD_RE.test(label) && /subMenu\.do/.test(m[1]!)) menuLinks.push({ label, url: new URL(m[1]!, site.origin).toString() })
    }
    menuLinks = [...new Map(menuLinks.map((l) => [l.url, l])).values()].slice(0, 6)
  } catch (e) {
    out.errors.push(`사이트맵 접근 실패: ${e instanceof Error ? e.message : e}`)
    return out
  }
  if (menuLinks.length === 0) out.errors.push('사이트맵에 교육과정 관련 메뉴 없음 (홈페이지 구조가 다름)')
  // 2) 각 메뉴: 페이지에서 bbsId 를 읽고 목록 AJAX 호출
  for (const link of menuLinks) {
    const board: Board = { label: link.label, url: link.url, posts: [], staticTable: false }
    try {
      const page = await site.get(new URL(link.url).pathname)
      const bbsId = page.match(/name="bbsId"[^>]*value="([^"]+)"/)?.[1]
      const bbsTyCode = page.match(/name="bbsTyCode"[^>]*value="([^"]+)"/)?.[1] ?? 'base'
      if (/<table/.test(page) && /[12]학기/.test(page) && /교과/.test(page)) board.staticTable = true
      if (bbsId) {
        await sleep(300)
        const list = await site.post('/dggb/module/board/selectBoardListAjax.do', { bbsId, bbsTyCode, customRecordCountPerPage: '30', pageIndex: '1', searchCondition: '', searchKeyword: '', sortOrdr: '1' }, link.url)
        const re = /fnView\('([^']+)',\s*'([^']+)'\)[^>]*>\s*([^<]{1,160})/g
        let m: RegExpExecArray | null
        while ((m = re.exec(list))) {
          const title = strip(m[3]!)
          const idx = list.indexOf(`'${m[2]}'`)
          const date = list.slice(idx, idx + 1500).match(/20\d\d-\d\d-\d\d/)?.[0] ?? ''
          board.posts.push({ bbsId: m[1]!, nttId: m[2]!, title, date, attachments: [], detailFetched: false })
        }
        // 3) 관련 게시물 상세 (최신순 최대 4개)
        for (const p of board.posts.filter((x) => POST_RE.test(x.title)).slice(0, 4)) {
          await sleep(300)
          try {
            const det = await site.post('/dggb/module/board/selectBoardDetailAjax.do', { bbsId: p.bbsId, bbsTyCode, nttId: p.nttId, pageIndex: '1', customRecordCountPerPage: '10', searchCondition: '', searchKeyword: '', sortOrdr: '1' }, link.url)
            const fre = /serverFileObj\["name"\]\s*=\s*"([^"]+)";\s*serverFileObj\["size"\]\s*=\s*"(\d+)";\s*serverFileObj\["atchFileId"\]\s*=\s*"([^"]+)";\s*serverFileObj\["fileSn"\]\s*=\s*"([^"]+)"/g
            let fm: RegExpExecArray | null
            while ((fm = fre.exec(det))) {
              const name = fm[1]!
              p.attachments.push({ name, ext: (name.split('.').pop() ?? '').toUpperCase(), sizeBytes: Number(fm[2]), url: `${site.origin}/dggb/board/boardFile/downFile.do?atchFileId=${fm[3]}&fileSn=${fm[4]}` })
            }
            p.detailFetched = true
          } catch (e) {
            out.errors.push(`${p.title} 상세 실패: ${e instanceof Error ? e.message : e}`)
          }
        }
      }
    } catch (e) {
      out.errors.push(`${link.label} 실패: ${e instanceof Error ? e.message : e}`)
    }
    out.boards.push(board)
  }
  // 4) 최선 후보: 제목/파일명의 최대 연도, 편제·배당표 우선, PDF/HWPX 우선
  let bestScore = -1
  for (const b of out.boards) for (const p of b.posts) for (const a of p.attachments) {
    const text = `${p.title} ${a.name}`
    const years = [...text.matchAll(YEAR_RE)].map((m) => Number(m[1]))
    const y = years.length ? Math.max(...years) : 0
    let score = y
    if (/편제|배당/.test(a.name)) score += 50
    else if (/편제|배당/.test(p.title)) score += 30
    if (/PDF|HWPX/.test(a.ext)) score += 20
    if (/HWP$/.test(a.ext)) score += 5
    if (/입학/.test(text)) score += 5
    if (/계획서/.test(a.name) && !/편제|배당/.test(a.name)) score -= 10
    if (score > bestScore) { bestScore = score; out.best = { boardUrl: b.url, post: p, attachment: a, reason: `연도 ${y || '미상'} · ${a.ext} · ${/편제|배당/.test(text) ? '편제/배당표' : '교육과정 관련'}` } }
  }
  return out
}

async function main() {
  const all: { id: string; officialName: string; homepage: string | null; isSynthetic: boolean }[] = []
  for (let page = 1; page <= 3; page++) {
    const j = (await (await fetch(`${api}/api/schools?pageSize=200&page=${page}`)).json()) as { data: { items: { school: { id: string; officialName: string; homepage: string | null; isSynthetic: boolean } }[] } }
    all.push(...j.data.items.map((i) => i.school))
    if (j.data.items.length < 200) break
  }
  const real = all.filter((s) => !s.isSynthetic && s.id !== 'sch_neis-7010181').sort((a, b) => a.officialName.localeCompare(b.officialName, 'ko'))
  const idList: string[] | null = idsFile ? (JSON.parse(readFileSync(idsFile, 'utf8')) as string[]) : null
  const targets = only ? real.filter((s) => s.id === only) : idList ? idList.map((id) => real.find((s) => s.id === id)).filter((s): s is (typeof real)[number] => Boolean(s)) : real.slice(offset, offset + limit)
  const results: Discovery[] = []
  for (const s of targets) {
    const d = await discoverSchool(s)
    results.push(d)
    const nPosts = d.boards.reduce((a, b) => a + b.posts.length, 0)
    console.log(`${s.officialName}: 게시판 ${d.boards.length}${d.boards.some((b) => b.staticTable) ? '(정적 표 있음)' : ''}, 게시물 ${nPosts}, 최선: ${d.best ? `${d.best.attachment.name} [${(d.best.attachment.sizeBytes / 1048576).toFixed(2)}MB] (${d.best.reason})` : '없음'}${d.errors.length ? ` · 오류: ${d.errors.join('; ')}` : ''}`)
  }
  const out = arg('out', path.join(root, 'data/ingest/discover.json'))!
  writeJson(out, { generatedAt: new Date().toISOString(), results })
  console.log(`→ ${path.relative(root, out)}`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main().catch((e) => { console.error(e); process.exit(1) })
