/**
 * 학년×학기 매트릭스형 편제표(공식 웹페이지 HTML 표 또는 PDF 격자 복원 결과) → 검토용 데이터셋(초안).
 *
 * 입력: { heading, rows: [[{t, rs, cs, th}]] } (병합 셀은 rs/cs 로 표시). PDF 격자는 cellBoxes·rowPages 를 추가로 준다.
 * 처리:
 *  - 병합 셀을 격자로 펼치되 값은 원래 셀 한 곳에만 둔다 (중복 계산 금지).
 *  - 머리글에서 'n학년' + 'n학기' (+ '이론/실습') 열을 찾아 열→(학년, 학기) 매핑. 이론·실습이 나뉘면 한 학기 학점 = 두 값의 합.
 *  - 소계·합계·창의적 체험활동·총 이수 행은 편성에서 제외하고 '원문 합계'로 보관해 계산 결과와 대조한다.
 *  - '택n' 셀(rowSpan)로 묶인 행은 선택군 후보(maxSelections=n, ruleStatus=unverified). 택 셀이 학기 열에 있으면
 *    그 학기에 묶음이 편성된 것으로 보고 각 과목 학점은 '운영 학점' 열 값을 쓴다. 앞의 숫자(예: 16 (택4))는 학점 한도 후보.
 *  - '구분' 열(학교 지정 / n학년 선택)이 있으면 지정·선택을 그 원문으로 정한다. 없으면 'unknown'.
 *  - ※ 유의사항 행은 버전 메모와 선택군 미확인 사항으로 남긴다 (자동 해석하지 않음).
 */
import type { Dataset } from '../../../shared/dataset'
import { emptyDataset } from '../../../shared/dataset'
import type { CourseCategory, CurriculumOffering, Evidence, Grade, Semester, SelectionGroup, SourceDocument } from '../../../shared/types'
import { compareWithStatedTotal } from '../../../shared/engine/credits'

export interface CapturedCell {
  t: string
  rs: number
  cs: number
  th: boolean
}
export interface CapturedTable {
  heading: string
  rows: CapturedCell[][]
  /** PDF 격자: 행별 PDF 페이지 index */
  rowPages?: number[]
  /** PDF 격자: `${r}:${c}` (원본 셀 기준) → 상자 (PDF 좌표, 원점 좌하단) */
  cellBoxes?: Map<string, { x: number; y: number; width: number; height: number }>
}

export interface MatrixOptions {
  schoolId: string
  cohortYear: number
  trackId: string | null
  trackName: string | null
  revision: '2015' | '2022' | 'unknown'
  documentId: string
  documentTitle: string
  officialUrl: string
  publisher: string
  retrievedAt: string
  sha256: string
  tableIndex: number
  isSynthetic?: boolean
  /** PDF 입력일 때 */
  source?: 'html_table' | 'pdf_table' | 'xlsx'
  pageSizes?: Record<number, { width: number; height: number }>
  pageLabels?: Record<number, string | null>
  originalFilename?: string | null
}

export interface GridCell {
  text: string
  origin: boolean
  originRow: number
  originCol: number
  rowSpan: number
}

/** rowSpan/colSpan 을 펼쳐 격자를 만든다. 값은 원래 셀에만 둔다. */
export function expandGrid(rows: CapturedCell[][]): GridCell[][] {
  const grid: GridCell[][] = []
  const occupied = new Map<string, GridCell>()
  for (let r = 0; r < rows.length; r++) {
    grid[r] = grid[r] ?? []
    let c = 0
    for (const cell of rows[r]!) {
      while (occupied.has(`${r}:${c}`)) {
        grid[r]![c] = occupied.get(`${r}:${c}`)!
        c++
      }
      const rs = Math.max(1, cell.rs || 1)
      const cs = Math.max(1, cell.cs || 1)
      for (let dr = 0; dr < rs; dr++) {
        for (let dc = 0; dc < cs; dc++) {
          const g: GridCell = { text: cell.t.trim(), origin: dr === 0 && dc === 0, originRow: r, originCol: c, rowSpan: rs }
          if (dr === 0) grid[r]![c + dc] = g
          else occupied.set(`${r + dr}:${c + dc}`, g)
        }
      }
      c += cs
    }
    while (occupied.has(`${r}:${c}`)) {
      grid[r]![c] = occupied.get(`${r}:${c}`)!
      c++
    }
  }
  return grid
}

const TOTAL_RE = /소계|합계|총\s*이수|창의적\s*체험활동|이수학점|과목\s*수/
const NOTE_RE = /^[※*]|유의사항/
const CATEGORY_MAP: [RegExp, CourseCategory][] = [
  [/^공통/, 'common'],
  [/일반/, 'general_elective'],
  [/진로/, 'career_elective'],
  [/융합/, 'fusion_elective'],
  [/전공|전문/, 'specialized'],
]
/** 머리글 정규화: 공백·각주 번호(1), 2)…)·주석 괄호 제거 */
const nz = (s: string) => s.replace(/\s+/g, '').replace(/^\d+\)/, '').replace(/\(주\d*\)$/, '')

export function packageMatrixTable(table: CapturedTable, opts: MatrixOptions): { dataset: Dataset; report: string[] } {
  const ds = emptyDataset()
  const report: string[] = []
  const grid = expandGrid(table.rows)
  const gradeRowIdx = grid.findIndex((row) => row.some((c) => /^[123]학년([12]학기)?$/.test(nz(c.text))))
  if (gradeRowIdx < 0) {
    report.push('머리글에서 학년 열을 찾지 못해 표를 건너뜁니다.')
    return { dataset: ds, report }
  }
  const gradeRow = grid[gradeRowIdx]!
  const semRow = grid[gradeRowIdx + 1]
  const partRow = grid[gradeRowIdx + 2]
  const colCount = Math.max(...grid.map((r) => r.length))
  let dataStart = gradeRowIdx + 1
  const colInfo: ({ grade: Grade; semester: Semester; part: 'theory' | 'practice' | 'single' } | undefined)[] = []
  for (let c = 0; c < colCount; c++) {
    const combined = nz(gradeRow[c]?.text ?? '').match(/^([123])학년([12])학기$/)
    const g = combined ? [combined[0], combined[1]] : nz(gradeRow[c]?.text ?? '').match(/^([123])학년$/)
    if (!g) continue
    const s = combined ? [combined[0], combined[2]] : nz(semRow?.[c]?.text ?? '').match(/^([12])학기$/)
    const p = nz(partRow?.[c]?.text ?? '')
    if (s) dataStart = Math.max(dataStart, gradeRowIdx + 2)
    if (p === '이론' || p === '실습') dataStart = Math.max(dataStart, gradeRowIdx + 3)
    colInfo[c] = { grade: Number(g[1]) as Grade, semester: (s ? Number(s[1]) : 1) as Semester, part: p === '이론' ? 'theory' : p === '실습' ? 'practice' : 'single' }
  }
  const findCol = (re: RegExp) => gradeRow.findIndex((c) => re.test(nz(c?.text ?? '')))
  const colType = findCol(/^과목유형$/) >= 0 ? findCol(/^과목유형$/) : findCol(/^(구분|유형)$/)
  const colReq = findCol(/^과목유형$/) >= 0 ? findCol(/^구분$/) : -1
  const colName = findCol(/^과목(명)?$/) >= 0 ? findCol(/^과목(명)?$/) : findCol(/^세부교과목$|^교과목(명)?$|^과목명$/)
  const colBase = findCol(/^(기준|기본)학점$/)
  const colRun = findCol(/운영학점|^운영$/)
  const colGroup = findCol(/^교과영역$/) >= 0 ? findCol(/^교과영역$/) : findCol(/^교과\(군\)$|^교과군$|^교과$/)
  if (colName < 0) {
    report.push("머리글에서 '과목' 열을 찾지 못했습니다.")
    return { dataset: ds, report }
  }

  const docId = opts.documentId
  const versionId = `cv_${opts.schoolId}_${opts.cohortYear}${opts.trackId ? `_${opts.trackId}` : ''}_draft_${opts.sha256.slice(0, 8)}`
  const method: Evidence['extractionMethod'] = opts.source ?? 'html_table'
  const doc: SourceDocument = {
    id: docId,
    schoolId: opts.schoolId,
    documentType: 'curriculum_table',
    title: opts.documentTitle,
    officialUrl: opts.officialUrl,
    originalFilename: opts.originalFilename ?? null,
    publisher: opts.publisher,
    publishedAt: null,
    retrievedAt: opts.retrievedAt,
    applicableAcademicYear: opts.cohortYear,
    cohortYear: opts.cohortYear,
    curriculumRevision: opts.revision,
    trackId: opts.trackId,
    version: '1',
    sha256: opts.sha256,
    rights: 'official_public',
    parseStatus: 'extracted',
    reviewStatus: 'draft',
    supersedesId: null,
    isSynthetic: Boolean(opts.isSynthetic),
    notes: `${method === 'pdf_table' ? '공식 PDF 격자' : method === 'xlsx' ? '공식 XLSX 표' : '공식 홈페이지 HTML 표'} "${table.heading}" 에서 추출한 초안. 게시일은 문서에 없어 미확인`,
  }
  ds.documents.push(doc)
  const versionNotes: string[] = [`자동 추출 초안 (${method}, 표 ${opts.tableIndex + 1}: ${table.heading}). 사람 검토 전`]
  ds.versions.push({
    id: versionId,
    schoolId: opts.schoolId,
    cohortYear: opts.cohortYear,
    trackId: opts.trackId,
    revision: opts.revision,
    status: 'draft',
    reviewStatus: 'draft',
    documentIds: [docId],
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: null,
    supersedesId: null,
    notes: '',
    isSynthetic: Boolean(opts.isSynthetic),
  })

  const groups = new Map<string, SelectionGroup & { markerCol: number; semKey: string | null }>()
  const stated: { label: string; perSemester: Partial<Record<string, number>>; total: number | null }[] = []
  const sourceNotes: string[] = []
  let evN = 0
  const pageOf = (r: number) => table.rowPages?.[r] ?? null
  const boxOf = (r: number, c: number) => {
    const g = grid[r]?.[c]
    if (!g || !table.cellBoxes) return null
    const b = table.cellBoxes.get(`${g.originRow}:${g.originCol}`)
    const pi = pageOf(g.originRow)
    const size = pi !== null ? opts.pageSizes?.[pi] : undefined
    return b && size ? { x: b.x, y: b.y, width: b.width, height: b.height, pageWidth: size.width, pageHeight: size.height } : null
  }
  const mkEvidence = (row: number, col: number | null, excerpt: string, anchor: string): Evidence => {
    evN += 1
    const pi = pageOf(row)
    const ev: Evidence = {
      id: `ev_${docId}_t${opts.tableIndex}_r${row}${col !== null ? `_c${col}` : ''}_${evN}`,
      documentId: docId,
      pdfPageIndex: pi,
      printedPageLabel: pi !== null ? (opts.pageLabels?.[pi] ?? null) : null,
      tableId: `표 ${opts.tableIndex + 1}${table.heading ? ` (${table.heading})` : ''}`,
      rowIndex: row,
      columnIndex: col,
      boundingBox: col !== null ? boxOf(row, col) : boxOf(row, colName),
      paragraphAnchor: anchor,
      excerpt,
      extractionMethod: method,
      reviewedBy: null,
      reviewedAt: null,
      isSynthetic: Boolean(opts.isSynthetic),
    }
    ds.evidence.push(ev)
    return ev
  }

  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r]!
    const rowText = row.filter((c) => c.origin).map((c) => c.text).filter(Boolean).join(' | ')
    const firstText = row.find((c) => c.text)?.text ?? ''
    if (NOTE_RE.test(firstText) && row.filter((c) => c.origin && c.text).length <= 2) {
      sourceNotes.push(firstText)
      continue
    }
    if (TOTAL_RE.test(firstText) || TOTAL_RE.test(row[colName]?.text ?? '')) {
      const per: Partial<Record<string, number>> = {}
      colInfo.forEach((ci, c) => {
        if (!ci) return
        const v = Number(row[c]?.text)
        if (row[c]?.origin && Number.isFinite(v)) per[`${ci.grade}-${ci.semester}`] = (per[`${ci.grade}-${ci.semester}`] ?? 0) + v
      })
      const total = colRun >= 0 ? Number(row[colRun]?.text) : NaN
      stated.push({ label: firstText, perSemester: per, total: Number.isFinite(total) ? total : null })
      continue
    }
    const name = (row[colName]?.text ?? '').trim()
    if (!name || /^과목(명)?$/.test(nz(name))) continue
    const groupCols = colGroup >= 0 ? (colType > colGroup ? Array.from({ length: colType - colGroup }, (_, i) => colGroup + i) : [colGroup]) : []
    const subjectGroup = [...new Set(groupCols.map((c) => row[c]?.text).filter((t): t is string => Boolean(t) && t !== name))].join(' · ')
    const typeText = colType >= 0 ? (row[colType]?.text ?? '') : ''
    const category = CATEGORY_MAP.find(([re]) => re.test(nz(typeText)))?.[1] ?? 'unknown'
    const reqText = colReq >= 0 ? nz(row[colReq]?.text ?? '') : ''
    const runCredit = colRun >= 0 ? Number(row[colRun]?.text) : NaN
    const baseCredit = colBase >= 0 ? Number(row[colBase]?.text) : NaN

    // 선택 안내 셀 ('택n')
    let groupKey: string | null = null
    let groupLabel: string | null = null
    let groupMax: number | null = null
    let groupCredits: number | null = null
    let markerCol = -1
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell || c === colName) continue
      const m = cell.text.match(/택\s*(\d+)/)
      if (m) {
        groupKey = `r${cell.originRow}_c${cell.originCol}`
        groupLabel = cell.text
        groupMax = Number(m[1])
        const lead = cell.text.match(/^(\d+)\s*\(?택/)
        groupCredits = lead ? Number(lead[1]) : null
        markerCol = c
        break
      }
    }
    const markerSem = markerCol >= 0 ? colInfo[markerCol] : undefined

    // 학기별 학점
    const perSem = new Map<string, { grade: Grade; semester: Semester; credit: number; cols: number[] }>()
    colInfo.forEach((ci, c) => {
      if (!ci) return
      const cell = row[c]
      if (!cell || !cell.origin) return
      const v = Number(cell.text)
      if (!cell.text || !Number.isFinite(v)) return
      const k = `${ci.grade}-${ci.semester}`
      const cur = perSem.get(k) ?? { grade: ci.grade, semester: ci.semester, credit: 0, cols: [] }
      cur.credit += v
      cur.cols.push(c)
      perSem.set(k, cur)
    })
    // 택 셀이 학기 열에 있고 행에 학기 값이 없으면: 그 학기에 운영 학점으로 편성
    if (perSem.size === 0 && markerSem && Number.isFinite(runCredit)) {
      perSem.set(`${markerSem.grade}-${markerSem.semester}`, { grade: markerSem.grade, semester: markerSem.semester, credit: runCredit, cols: [markerCol] })
    }
    let groupId: string | null = null
    if (groupKey) {
      if (!groups.has(groupKey)) {
        const ev = mkEvidence(r, markerCol, `${groupLabel}`, `표 ${opts.tableIndex + 1} 행 ${r} 선택 안내 셀`)
        groups.set(groupKey, {
          id: `sg_${versionId}_${groupKey}`,
          versionId,
          label: `선택군 (${groupLabel})`,
          scope: '',
          memberOfferingIds: [],
          minSelections: null,
          maxSelections: groupMax,
          minCredits: null,
          maxCredits: groupCredits,
          periodScope: 'unknown',
          exceptions: [],
          verifiedRules: [],
          unknownRules: [`자동 추출 후보: '${groupLabel}' — 선택 ${groupMax}과목${groupCredits !== null ? `, 합계 ${groupCredits}학점` : ''}으로 읽음. 최소 선택 수·적용 기간·예외는 사람 검토 필요`],
          ruleStatus: 'unverified',
          evidenceIds: [ev.id],
          markerCol,
          semKey: markerSem ? `${markerSem.grade}-${markerSem.semester}` : null,
        })
      }
      groupId = groups.get(groupKey)!.id
    }
    if (perSem.size === 0) {
      const ev = mkEvidence(r, colName, rowText, `표 ${opts.tableIndex + 1} 행 ${r}`)
      const fallbackGrade = (reqText.match(/([123])학년/)?.[1] ? Number(reqText.match(/([123])학년/)![1]) : 1) as Grade
      ds.offerings.push(mkOffering(versionId, opts, `off_${versionId}_r${r}_s${fallbackGrade}1`, name, subjectGroup, category, fallbackGrade, 1, null, Number.isFinite(baseCredit) ? baseCredit : null, groupLabel, [ev.id], groupId, reqOf(reqText, groupId)))
      if (groupId) groups.get(groupKey!)!.memberOfferingIds.push(`off_${versionId}_r${r}_s${fallbackGrade}1`)
      report.push(`행 ${r} ${name}: 학기별 학점 칸이 비어 있어 학점 null·${fallbackGrade}학년 1학기 자리에 둠 (검토 필요)`)
      continue
    }
    const sems = [...perSem.values()]
    const sumSem = sems.reduce((a, s) => a + s.credit, 0)
    if (Number.isFinite(runCredit) && sumSem !== runCredit) report.push(`행 ${r} ${name}: 학기 합계 ${sumSem} ≠ 운영 학점 ${runCredit} (검토 경고)`)
    for (const s of sems) {
      const ev = mkEvidence(r, s.cols[0] ?? null, rowText, `표 ${opts.tableIndex + 1} 행 ${r}, ${s.grade}학년 ${s.semester}학기 열`)
      const offId = `off_${versionId}_r${r}_s${s.grade}${s.semester}`
      ds.offerings.push(mkOffering(versionId, opts, offId, name, subjectGroup, category, s.grade, s.semester, s.credit, Number.isFinite(baseCredit) ? baseCredit : null, groupLabel, [ev.id], groupId, reqOf(reqText, groupId)))
      if (groupId) groups.get(groupKey!)!.memberOfferingIds.push(offId)
    }
  }
  for (const g of groups.values()) {
    const members = ds.offerings.filter((o) => g.memberOfferingIds.includes(o.id))
    const sems = [...new Set(members.map((m) => `${m.grade}-${m.semester}`))]
    const grades = [...new Set(members.map((m) => m.grade))]
    g.scope = sems.length === 1 ? `${members[0]?.grade}학년 ${members[0]?.semester}학기` : grades.length === 1 ? `${grades[0]}학년 전체 (${sems.join(', ')})` : sems.join(', ')
    g.periodScope = sems.length === 1 ? 'semester' : grades.length === 1 ? 'grade_year' : 'unknown'
    if (sourceNotes.length) g.unknownRules.push(`원문 유의사항 확인 필요: ${sourceNotes.join(' / ').slice(0, 300)}`)
    const { markerCol: _m, semKey: _s, ...rest } = g
    ds.selectionGroups.push(rest)
  }
  if (sourceNotes.length) versionNotes.push(`원문 유의사항: ${sourceNotes.join(' / ')}`)
  ds.versions[0]!.notes = versionNotes.join('\n')
  // 원문 합계 대조 (선택군은 '최대 선택 수 × 과목 학점' 또는 maxCredits 로 가정)
  for (const st of stated) {
    if (!/이수학점 소계|보통교과 소계|전문교과 소계|교과 이수 학점 소계/.test(st.label)) continue
    const filter = /보통교과/.test(st.label) ? (o: CurriculumOffering) => o.courseCategory !== 'specialized' : /전문교과/.test(st.label) ? (o: CurriculumOffering) => o.courseCategory === 'specialized' : () => true
    for (const [k, v] of Object.entries(st.perSemester)) {
      const [gr, se] = k.split('-').map(Number)
      const mine = ds.offerings.filter((o) => o.grade === gr && o.semester === se && filter(o))
      const seenGroup = new Set<string>()
      const sum = mine.reduce((a, o) => {
        if (o.selectionGroupId) {
          if (seenGroup.has(o.selectionGroupId)) return a
          seenGroup.add(o.selectionGroupId)
          const g = ds.selectionGroups.find((x) => x.id === o.selectionGroupId)
          if (g?.maxCredits !== null && g?.maxCredits !== undefined) return a + g.maxCredits
          return a + (o.creditValue ?? 0) * (g?.maxSelections ?? 1)
        }
        return a + (o.creditValue ?? 0)
      }, 0)
      const warn = compareWithStatedTotal(v ?? null, sum, mine.filter((o) => o.creditValue === null).length)
      if (warn) report.push(`${st.label} ${gr}학년 ${se}학기: ${warn} (선택군은 '택n' 한도로 가정해 계산)`)
    }
  }
  report.push(`편성 ${ds.offerings.length}건, 선택군 후보 ${ds.selectionGroups.length}개, 근거 ${ds.evidence.length}건 — 모두 초안.${colReq >= 0 ? " 지정/선택은 원문 '구분' 열 기준" : " 지정/선택 구분은 원문에 명시가 없어 'unknown'"}${sourceNotes.length ? ` · 유의사항 ${sourceNotes.length}건` : ''}`)
  return { dataset: ds, report }
}

function reqOf(reqText: string, groupId: string | null): CurriculumOffering['requirementType'] {
  if (/지정/.test(reqText)) return 'school_designated'
  if (/선택/.test(reqText) || groupId) return 'student_choice'
  return 'unknown'
}

function mkOffering(
  versionId: string,
  opts: MatrixOptions,
  id: string,
  name: string,
  subjectGroup: string,
  category: CourseCategory,
  grade: Grade,
  semester: Semester,
  credit: number | null,
  baseCredit: number | null,
  groupLabel: string | null,
  evidenceIds: string[],
  groupId: string | null,
  requirementType: CurriculumOffering['requirementType'],
): CurriculumOffering {
  return {
    id,
    versionId,
    schoolId: opts.schoolId,
    cohortYear: opts.cohortYear,
    trackId: opts.trackId,
    courseOriginalName: name,
    courseCanonicalId: null,
    revision: opts.revision,
    subjectGroup,
    courseCategory: category,
    requirementType,
    grade,
    semester,
    creditValue: credit,
    creditUnit: opts.revision === '2015' ? 'unit' : opts.revision === '2022' ? 'credit' : 'unknown',
    selectionGroupId: groupId,
    offeringStatus: 'planned',
    crossSemesterGroup: null,
    note: [baseCredit !== null ? `기준 학점 ${baseCredit}` : null, groupLabel].filter(Boolean).join(' · ') || null,
    evidenceIds,
  }
}
