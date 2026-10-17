/**
 * 학년×학기 매트릭스형 편제표(공식 웹페이지 HTML 표 또는 표 JSON) → 검토용 데이터셋(초안).
 *
 * 입력: 브라우저에서 캡처한 표 JSON { heading, rows: [[{t, rs, cs, th}]] } (병합 셀은 rs/cs 로 표시).
 * 처리:
 *  - 병합 셀을 격자로 펼치되, 값은 원래 셀 한 곳에만 둔다 (중복 계산 금지). rowSpan 으로 이어지는 교과(군)·선택 안내 셀만 아래 행에 전파.
 *  - 머리글에서 'n학년' + 'n학기' (+ '이론/실습') 열을 찾아 열→(학년, 학기) 매핑. 이론·실습이 나뉘면 한 학기 학점 = 두 값의 합.
 *  - 소계·합계·창의적 체험활동·총 이수 행은 편성에서 제외하고 '원문 합계'로 보관해 계산 결과와 대조한다.
 *  - '택n' 셀(rowSpan)로 묶인 행은 선택군 후보(maxSelections=n, ruleStatus=unverified)로 만든다. 사람 검토 전 확정하지 않는다.
 *  - 과목유형(공통/일반선택/진로선택/융합선택/전공 실무 …)을 분류로, 지정/선택 여부는 원문에 명시가 없으면 'unknown' 으로 둔다.
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
}

interface GridCell {
  text: string
  origin: boolean // 값이 실제로 있는 원래 셀인지
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
          if (dr === 0) {
            grid[r]![c + dc] = g
          } else occupied.set(`${r + dr}:${c + dc}`, g)
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

const TOTAL_RE = /소계|합계|총\s*이수|창의적\s*체험활동|이수학점/
const CATEGORY_MAP: [RegExp, CourseCategory][] = [
  [/^공통/, 'common'],
  [/일반선택/, 'general_elective'],
  [/진로선택/, 'career_elective'],
  [/융합선택/, 'fusion_elective'],
  [/전공|전문/, 'specialized'],
]

export function packageMatrixTable(table: CapturedTable, opts: MatrixOptions): { dataset: Dataset; report: string[] } {
  const ds = emptyDataset()
  const report: string[] = []
  const grid = expandGrid(table.rows)
  // 머리글 행: 'n학년' 이 있는 행부터 '이론/실습' 행까지
  const headerRows = grid.findIndex((row) => row.some((c) => /^[123]학년$/.test(c.text)))
  if (headerRows < 0) {
    report.push('머리글에서 학년 열을 찾지 못해 표를 건너뜁니다.')
    return { dataset: ds, report }
  }
  // 열 매핑
  const colInfo: { grade: Grade; semester: Semester; part: 'theory' | 'practice' | 'single' }[] = []
  const gradeRow = grid[headerRows]!
  const semRow = grid[headerRows + 1]
  const partRow = grid[headerRows + 2]
  const colCount = Math.max(...grid.map((r) => r.length))
  let dataStart = headerRows + 1
  for (let c = 0; c < colCount; c++) {
    const g = gradeRow[c]?.text.match(/^([123])학년$/)
    if (!g) continue
    const s = semRow?.[c]?.text.match(/^([12])학기$/)
    const p = partRow?.[c]?.text
    if (s) dataStart = Math.max(dataStart, headerRows + 2)
    if (p === '이론' || p === '실습') dataStart = Math.max(dataStart, headerRows + 3)
    colInfo[c] = { grade: Number(g[1]) as Grade, semester: (s ? Number(s[1]) : 1) as Semester, part: p === '이론' ? 'theory' : p === '실습' ? 'practice' : 'single' }
  }
  const headerText = grid.slice(0, dataStart).flat().map((c) => c.text)
  const colGroup = headerText.findIndex((t) => /교과\(군\)|교과군/.test(t)) >= 0 ? gradeRow.findIndex((c) => /교과/.test(c.text)) : 0
  const colType = gradeRow.findIndex((c) => /과목유형|구분/.test(c.text))
  const colName = gradeRow.findIndex((c) => /^과목(명)?$/.test(c.text))
  const colBase = gradeRow.findIndex((c) => /기준/.test(c.text))
  const colRun = gradeRow.findIndex((c) => /운영/.test(c.text))
  if (colName < 0) {
    report.push("머리글에서 '과목' 열을 찾지 못했습니다.")
    return { dataset: ds, report }
  }

  const docId = opts.documentId
  const versionId = `cv_${opts.schoolId}_${opts.cohortYear}${opts.trackId ? `_${opts.trackId}` : ''}_draft_${opts.sha256.slice(0, 8)}`
  const doc: SourceDocument = {
    id: docId,
    schoolId: opts.schoolId,
    documentType: 'curriculum_table',
    title: opts.documentTitle,
    officialUrl: opts.officialUrl,
    originalFilename: null,
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
    notes: `공식 홈페이지 HTML 표 "${table.heading}" 에서 추출한 초안. 게시일은 페이지에 없어 미확인`,
  }
  ds.documents.push(doc)
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
    notes: `자동 추출 초안 (html_table, 표 ${opts.tableIndex + 1}: ${table.heading}). 사람 검토 전`,
    isSynthetic: Boolean(opts.isSynthetic),
  })

  const groups = new Map<string, SelectionGroup & { anchorRow: number }>()
  const stated: { label: string; perSemester: Partial<Record<string, number>>; total: number | null }[] = []
  let evN = 0
  const mkEvidence = (row: number, col: number | null, excerpt: string, anchor: string): Evidence => {
    evN += 1
    const ev: Evidence = {
      id: `ev_${docId}_t${opts.tableIndex}_r${row}${col !== null ? `_c${col}` : ''}_${evN}`,
      documentId: docId,
      pdfPageIndex: null,
      printedPageLabel: null,
      tableId: `표 ${opts.tableIndex + 1} (${table.heading})`,
      rowIndex: row,
      columnIndex: col,
      boundingBox: null,
      paragraphAnchor: anchor,
      excerpt,
      extractionMethod: 'html_table',
      reviewedBy: null,
      reviewedAt: null,
      isSynthetic: Boolean(opts.isSynthetic),
    }
    ds.evidence.push(ev)
    return ev
  }

  for (let r = dataStart; r < grid.length; r++) {
    const row = grid[r]!
    const rowText = row.filter((c) => c.origin).map((c) => c.text).join(' | ')
    const firstText = row.find((c) => c.text)?.text ?? ''
    if (TOTAL_RE.test(firstText) || TOTAL_RE.test(row[colName]?.text ?? '')) {
      // 원문 합계 보관
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
    if (!name) continue
    const subjectGroup = colGroup >= 0 ? [row[colGroup]?.text, row[colGroup + 1]?.text].filter((t, i, a) => t && a.indexOf(t) === i && t !== name).join(' · ') : ''
    const typeText = colType >= 0 ? (row[colType]?.text ?? '') : ''
    const category = CATEGORY_MAP.find(([re]) => re.test(typeText))?.[1] ?? 'unknown'
    const runCredit = colRun >= 0 ? Number(row[colRun]?.text) : NaN
    const baseCredit = colBase >= 0 ? Number(row[colBase]?.text) : NaN

    // 선택 안내 셀 ('택n')
    let groupKey: string | null = null
    let groupLabel: string | null = null
    let groupMax: number | null = null
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      if (!cell) continue
      const m = cell.text.match(/택\s*(\d+)/)
      if (m && c !== colName) {
        groupKey = `r${cell.originRow}_c${cell.originCol}`
        groupLabel = cell.text
        groupMax = Number(m[1])
        break
      }
    }

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
    if (perSem.size === 0) {
      // 택n 그룹의 뒤 행은 학점 셀이 첫 행에만 있을 수 있다 → 그룹 첫 행의 학점을 공유
      if (groupKey && groups.has(groupKey)) {
        const g = groups.get(groupKey)!
        const firstOff = ds.offerings.find((o) => o.selectionGroupId === g.id)
        if (firstOff) {
          const ev = mkEvidence(r, null, rowText, `표 ${opts.tableIndex + 1} 행 ${r} (학점은 선택군 첫 행과 공유)`)
          const offId = `off_${versionId}_r${r}_s${firstOff.grade}${firstOff.semester}`
          ds.offerings.push({ ...firstOff, id: offId, courseOriginalName: name, subjectGroup, courseCategory: category, note: `${groupLabel} (학점은 그룹 공통 ${firstOff.creditValue})`, evidenceIds: [ev.id] })
          g.memberOfferingIds.push(offId)
          // 같은 과목이 두 학기에 걸친 경우도 복제
          for (const other of ds.offerings.filter((o) => o.selectionGroupId === g.id && o.courseOriginalName === firstOff.courseOriginalName && o.id !== firstOff.id)) {
            const oid = `off_${versionId}_r${r}_s${other.grade}${other.semester}`
            ds.offerings.push({ ...other, id: oid, courseOriginalName: name, subjectGroup, courseCategory: category, note: `${groupLabel} (학점은 그룹 공통 ${other.creditValue})`, evidenceIds: [ev.id] })
            g.memberOfferingIds.push(oid)
          }
          continue
        }
      }
      const ev = mkEvidence(r, colName, rowText, `표 ${opts.tableIndex + 1} 행 ${r}`)
      ds.offerings.push(mkOffering(versionId, opts, `off_${versionId}_r${r}_s11`, name, subjectGroup, category, 1, 1, null, null, groupLabel, [ev.id]))
      report.push(`행 ${r} ${name}: 학기별 학점 칸이 비어 있어 학점 null·1학년 1학기 자리에 둠 (검토 필요)`)
      continue
    }
    let groupId: string | null = null
    if (groupKey) {
      if (!groups.has(groupKey)) {
        const ev = mkEvidence(r, null, `${groupLabel}`, `표 ${opts.tableIndex + 1} 행 ${r} 선택 안내 셀`)
        groups.set(groupKey, {
          id: `sg_${versionId}_${groupKey}`,
          versionId,
          label: `선택군 (${groupLabel})`,
          scope: '',
          memberOfferingIds: [],
          minSelections: null,
          maxSelections: groupMax,
          minCredits: null,
          maxCredits: null,
          periodScope: 'unknown',
          exceptions: [],
          verifiedRules: [],
          unknownRules: [`자동 추출 후보: '${groupLabel}' — 선택 개수 ${groupMax}로 읽음. 적용 기간·최소 선택 수·학과 간 운영 방식은 사람 검토 필요`],
          ruleStatus: 'unverified',
          evidenceIds: [ev.id],
          anchorRow: r,
        })
      }
      groupId = groups.get(groupKey)!.id
    }
    const sems = [...perSem.values()]
    const cross = sems.length >= 2 && Number.isFinite(runCredit) && sems.every((s) => s.credit === runCredit) ? null : null // 교차 편성은 원문 명시가 없으므로 만들지 않음
    const sumSem = sems.reduce((a, s) => a + s.credit, 0)
    if (Number.isFinite(runCredit) && sumSem !== runCredit) report.push(`행 ${r} ${name}: 학기 합계 ${sumSem} ≠ 학교 운영 학점 ${runCredit} (검토 경고)`)
    for (const s of sems) {
      const ev = mkEvidence(r, s.cols[0] ?? null, rowText, `표 ${opts.tableIndex + 1} 행 ${r}, ${s.grade}학년 ${s.semester}학기 열`)
      const offId = `off_${versionId}_r${r}_s${s.grade}${s.semester}`
      ds.offerings.push(mkOffering(versionId, opts, offId, name, subjectGroup, category, s.grade, s.semester, s.credit, Number.isFinite(baseCredit) ? baseCredit : null, groupLabel, [ev.id], groupId, cross))
      if (groupId) groups.get(groupKey!)!.memberOfferingIds.push(offId)
    }
  }
  for (const g of groups.values()) {
    const members = ds.offerings.filter((o) => g.memberOfferingIds.includes(o.id))
    const sems = [...new Set(members.map((m) => `${m.grade}-${m.semester}`))]
    const grades = [...new Set(members.map((m) => m.grade))]
    g.scope = sems.length === 1 ? `${members[0]?.grade}학년 ${members[0]?.semester}학기` : grades.length === 1 ? `${grades[0]}학년 전체 (${sems.join(', ')})` : sems.join(', ')
    // 같은 학년의 두 학기에 걸친 '택n' 은 학년 단위 선택 후보로 둔다 (사람 검토로 확정)
    g.periodScope = sems.length === 1 ? 'semester' : grades.length === 1 ? 'grade_year' : 'unknown'
    const { anchorRow: _a, ...rest } = g
    ds.selectionGroups.push(rest)
  }
  // 원문 합계 대조
  for (const st of stated) {
    if (!/이수학점 소계|보통교과 소계|전문교과 소계/.test(st.label)) continue
    const filter = /보통교과/.test(st.label) ? (o: CurriculumOffering) => o.courseCategory !== 'specialized' : /전문교과/.test(st.label) ? (o: CurriculumOffering) => o.courseCategory === 'specialized' : () => true
    for (const [k, v] of Object.entries(st.perSemester)) {
      const [g, s] = k.split('-').map(Number)
      const mine = ds.offerings.filter((o) => o.grade === g && o.semester === s && filter(o))
      // 선택군은 후보 전체가 아니라 '1개 선택' 가정이 필요하므로, 그룹당 첫 과목만 더한 값과 전체 합을 모두 보고한다.
      const seenGroup = new Set<string>()
      const sumPick = mine.reduce((a, o) => {
        if (o.selectionGroupId) {
          if (seenGroup.has(o.selectionGroupId)) return a
          seenGroup.add(o.selectionGroupId)
        }
        return a + (o.creditValue ?? 0)
      }, 0)
      const warn = compareWithStatedTotal(v ?? null, sumPick, mine.filter((o) => o.creditValue === null).length)
      if (warn) report.push(`${st.label} ${g}학년 ${s}학기: ${warn} (선택군은 1과목 선택으로 가정해 계산)`)
    }
  }
  report.push(`편성 ${ds.offerings.length}건, 선택군 후보 ${ds.selectionGroups.length}개, 근거 ${ds.evidence.length}건 — 모두 초안. 지정/선택 구분은 원문에 명시가 없어 'unknown'`)
  return { dataset: ds, report }
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
  groupId: string | null = null,
  cross: string | null = null,
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
    requirementType: groupId ? 'student_choice' : 'unknown',
    grade,
    semester,
    creditValue: credit,
    creditUnit: opts.revision === '2015' ? 'unit' : opts.revision === '2022' ? 'credit' : 'unknown',
    selectionGroupId: groupId,
    offeringStatus: 'planned',
    crossSemesterGroup: cross,
    note: [baseCredit !== null ? `기준 학점 ${baseCredit}` : null, groupLabel].filter(Boolean).join(' · ') || null,
    evidenceIds,
  }
}
