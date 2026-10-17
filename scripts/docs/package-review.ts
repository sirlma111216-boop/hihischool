/**
 * 추출 JSON → 검토용 데이터셋(초안) 패키지.
 * npm run docs:package -- --extraction data/extracted/<id>.json --school <schoolId> --cohort 2027 [--track <trackId>] [--revision 2022] [--title "..."] [--publisher "..."] [--url <공식 URL>] [--out data/review/<id>.json]
 *
 * 규칙
 * - 모든 편성은 근거(Evidence)를 가진다. 좌표가 없으면 null (가짜 하이라이트 금지).
 * - 선택군 규칙은 각주에서 '후보'로만 읽어 unknownRules 에 넣고 ruleStatus='unverified' 로 둔다. 사람이 검토 화면에서 확인한다.
 * - 반복 머리글·병합 셀은 과목 행에 넣지 않는다. 학점 공란은 null.
 * - 이 패키지를 가져오면 Worker 가 상태를 초안으로 강제한다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ExtractionResult, ExtractedTable } from '../../shared/extraction'
import type { Dataset } from '../../shared/dataset'
import { emptyDataset } from '../../shared/dataset'
import type { CurriculumOffering, Evidence, SelectionGroup, SourceDocument } from '../../shared/types'

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

export interface PackageOptions {
  schoolId: string
  cohortYear: number
  trackId?: string | null
  revision?: '2015' | '2022' | 'unknown'
  title?: string
  publisher?: string
  officialUrl?: string | null
  /** 표 id → 학년 (예: {T1:1, T2:2, T3:3}). 없으면 표 제목의 'n학년' 에서 읽는다. */
  gradeByTable?: Record<string, 1 | 2 | 3>
}

const GROUP_TAG_RE = /\[([A-Za-z0-9가-힣]+)\]/
const RULE_RE = /선택군\s*([A-Za-z0-9가-힣]+)\s*[:：]\s*(.+)$/

export function packageReview(extraction: ExtractionResult, opts: PackageOptions): { dataset: Dataset; report: string[] } {
  const ds = emptyDataset()
  const report: string[] = []
  const versionId = `cv_${opts.schoolId}_${opts.cohortYear}${opts.trackId ? `_${opts.trackId}` : ''}_draft_${extraction.sha256.slice(0, 8)}`
  const docId = extraction.documentId
  const doc: SourceDocument = {
    id: docId,
    schoolId: opts.schoolId,
    documentType: 'curriculum_table',
    title: opts.title ?? `${opts.cohortYear}학년도 입학생 교육과정 편제표 (추출 초안)`,
    officialUrl: opts.officialUrl ?? null,
    originalFilename: path.basename(extraction.sourceFile),
    publisher: opts.publisher ?? '미확인',
    publishedAt: null,
    retrievedAt: extraction.extractedAt,
    applicableAcademicYear: opts.cohortYear,
    cohortYear: opts.cohortYear,
    curriculumRevision: opts.revision ?? 'unknown',
    trackId: opts.trackId ?? null,
    version: '1',
    sha256: extraction.sha256,
    rights: opts.officialUrl ? 'link_only' : 'unknown',
    parseStatus: extraction.failure ? 'failed' : 'extracted',
    reviewStatus: 'draft',
    supersedesId: null,
    isSynthetic: opts.schoolId.startsWith('syn_'),
    notes: extraction.warnings.join(' / ') || null,
  }
  ds.documents.push(doc)
  ds.versions.push({
    id: versionId,
    schoolId: opts.schoolId,
    cohortYear: opts.cohortYear,
    trackId: opts.trackId ?? null,
    revision: opts.revision ?? 'unknown',
    status: 'draft',
    reviewStatus: 'draft',
    documentIds: [docId],
    reviewedBy: null,
    reviewedAt: null,
    publishedAt: null,
    supersedesId: null,
    notes: `자동 추출 초안 (${extraction.method}). 사람 검토 전`,
    isSynthetic: doc.isSynthetic,
  })

  const pageLabel = (pi: number | null) => (pi === null ? null : (extraction.pages[pi]?.printedPageLabel ?? null))
  const groupsByLabel = new Map<string, SelectionGroup>()
  let evCount = 0

  // 각주 → 선택군 후보
  for (const n of extraction.notes) {
    const m = n.text.match(RULE_RE)
    if (!m) continue
    const label = m[1]!
    const rule = m[2]!.trim()
    evCount += 1
    const ev: Evidence = {
      id: `ev_${docId}_note_${evCount}`,
      documentId: docId,
      pdfPageIndex: n.pageIndex,
      printedPageLabel: n.printedPageLabel ?? pageLabel(n.pageIndex),
      tableId: null,
      rowIndex: null,
      columnIndex: null,
      boundingBox: n.bbox,
      paragraphAnchor: `각주 ${label}`,
      excerpt: `선택군 ${label}: ${rule}`,
      extractionMethod: extraction.method === 'unsupported' ? 'unknown' : extraction.method,
      reviewedBy: null,
      reviewedAt: null,
      isSynthetic: doc.isSynthetic,
    }
    ds.evidence.push(ev)
    const { min, max, period } = parseRule(rule)
    groupsByLabel.set(label, {
      id: `sg_${versionId}_${label}`,
      versionId,
      label: `선택군 ${label}`,
      scope: '',
      memberOfferingIds: [],
      minSelections: min,
      maxSelections: max,
      minCredits: null,
      maxCredits: null,
      periodScope: period,
      exceptions: [],
      verifiedRules: [],
      unknownRules: [`자동 추출 후보: ${rule} — 사람 검토 필요`],
      ruleStatus: 'unverified',
      evidenceIds: [ev.id],
    })
  }

  // 표 → 편성
  for (const t of extraction.tables) {
    if (t.continuedFromTableId) continue // 이어지는 표는 본 표에서 처리
    const parts: ExtractedTable[] = [t, ...extraction.tables.filter((x) => x.continuedFromTableId === t.id)]
    const grade = opts.gradeByTable?.[t.id] ?? guessGrade(extraction, t)
    if (!grade) {
      report.push(`표 ${t.id}: 학년을 알 수 없어 건너뜀 (--gradeByTable 로 지정)`)
      continue
    }
    const header = (t.header ?? []).map((c) => c.text)
    const colSem1 = header.findIndex((h) => /1학기/.test(h))
    const colSem2 = header.findIndex((h) => /2학기/.test(h))
    const colKind = header.findIndex((h) => /구분|지정|선택/.test(h))
    const colNote = header.findIndex((h) => /비고/.test(h))
    const colName = header.findIndex((h) => /과목/.test(h))
    if (colSem1 < 0 && colSem2 < 0) {
      report.push(`표 ${t.id}: 학기 열을 찾지 못해 건너뜀`)
      continue
    }
    for (const part of parts) {
      for (const row of part.rows) {
        if (row.isRepeatedHeader) continue
        const name = row.cells[colName >= 0 ? colName : 0]?.text.trim() ?? ''
        if (!name || /^과목$/.test(name)) continue
        const kindText = colKind >= 0 ? (row.cells[colKind]?.text ?? '') : ''
        const noteText = colNote >= 0 ? (row.cells[colNote]?.text ?? '') : ''
        const tag = (noteText + ' ' + kindText).match(GROUP_TAG_RE)?.[1] ?? null
        const req: CurriculumOffering['requirementType'] = /지정/.test(kindText) ? 'school_designated' : /선택/.test(kindText) ? 'student_choice' : 'unknown'
        const sems: { semester: 1 | 2; col: number }[] = []
        if (colSem1 >= 0) sems.push({ semester: 1, col: colSem1 })
        if (colSem2 >= 0) sems.push({ semester: 2, col: colSem2 })
        const placed = sems.filter((s) => (row.cells[s.col]?.text ?? '').trim() !== '')
        const targets = placed.length > 0 ? placed : sems.slice(0, 1) // 학점 공란이면 1학기 자리에 null 로 둔다
        const cross = placed.length === 2 && /교차/.test(noteText) ? `xs_${versionId}_${name}` : null
        for (const s of targets) {
          const cell = row.cells[s.col]
          const creditText = (cell?.text ?? '').trim()
          const credit = creditText === '' ? null : Number(creditText)
          evCount += 1
          const ev: Evidence = {
            id: `ev_${docId}_${part.id}_r${row.index}_c${s.col}`,
            documentId: docId,
            pdfPageIndex: part.pageIndexes[0] ?? null,
            printedPageLabel: pageLabel(part.pageIndexes[0] ?? null),
            tableId: part.id,
            rowIndex: row.index,
            columnIndex: s.col,
            boundingBox: cell?.bbox ?? row.cells[colName >= 0 ? colName : 0]?.bbox ?? null,
            paragraphAnchor: part.pageIndexes.length ? null : `표 ${part.id} 행 ${row.index}`,
            excerpt: row.cells.map((c) => c.text).filter(Boolean).join(' | '),
            extractionMethod: extraction.method === 'unsupported' ? 'unknown' : extraction.method,
            reviewedBy: null,
            reviewedAt: null,
            isSynthetic: doc.isSynthetic,
          }
          ds.evidence.push(ev)
          const offId = `off_${versionId}_${part.id}_r${row.index}_s${s.semester}`
          const group = tag ? groupsByLabel.get(tag) : undefined
          if (tag && !group) report.push(`행 ${name}: 선택군 태그 [${tag}] 의 각주를 찾지 못함 → 선택군 미연결`)
          ds.offerings.push({
            id: offId,
            versionId,
            schoolId: opts.schoolId,
            cohortYear: opts.cohortYear,
            trackId: opts.trackId ?? null,
            courseOriginalName: name,
            courseCanonicalId: null,
            revision: opts.revision ?? 'unknown',
            subjectGroup: '',
            courseCategory: 'unknown',
            requirementType: req,
            grade,
            semester: s.semester,
            creditValue: credit !== null && Number.isFinite(credit) ? credit : null,
            creditUnit: opts.revision === '2015' ? 'unit' : opts.revision === '2022' ? 'credit' : 'unknown',
            selectionGroupId: group?.id ?? null,
            offeringStatus: 'planned',
            crossSemesterGroup: cross,
            note: noteText || null,
            evidenceIds: [ev.id],
          })
          if (group) group.memberOfferingIds.push(offId)
          if (credit === null) report.push(`행 ${name} (${grade}-${s.semester}): 학점 공란 → null (0 으로 간주하지 않음)`)
        }
      }
    }
  }
  for (const g of groupsByLabel.values()) {
    const members = ds.offerings.filter((o) => g.memberOfferingIds.includes(o.id))
    const grades = [...new Set(members.map((m) => m.grade))]
    const sems = [...new Set(members.map((m) => `${m.grade}-${m.semester}`))]
    g.scope = sems.length === 1 ? `${grades[0]}학년 ${members[0]?.semester}학기` : grades.length === 1 ? `${grades[0]}학년 전체` : '여러 학년'
    if (g.periodScope === 'unknown') g.periodScope = sems.length === 1 ? 'semester' : 'unknown'
    ds.selectionGroups.push(g)
  }
  if (extraction.needsOcr) report.push('스캔 PDF: OCR 수치는 자동 확정되지 않았습니다. 모든 학점·선택 수를 원문과 대조하세요.')
  report.push(`편성 ${ds.offerings.length}건, 선택군 후보 ${ds.selectionGroups.length}개, 근거 ${ds.evidence.length}건 — 모두 초안 (사람 검토·승인 전 공개되지 않음)`)
  return { dataset: ds, report }
}

function parseRule(rule: string): { min: number | null; max: number | null; period: SelectionGroup['periodScope'] } {
  let min: number | null = null
  let max: number | null = null
  const range = rule.match(/(\d+)\s*~\s*(\d+)\s*과목/)
  const exact = rule.match(/중\s*(\d+)\s*과목/)
  const maxOnly = rule.match(/최대\s*(\d+)\s*과목/)
  const all = /모두 이수/.test(rule)
  if (range) {
    min = Number(range[1])
    max = Number(range[2])
  } else if (maxOnly) {
    max = Number(maxOnly[1]) // '최대 n' 은 최소를 뜻하지 않는다
  } else if (exact) {
    min = Number(exact[1])
    max = Number(exact[1])
  } else if (all) {
    min = null // 구성원 수를 알아야 하므로 검토 시 채움
    max = null
  }
  const period: SelectionGroup['periodScope'] = /학년 전체/.test(rule) ? 'grade_year' : /3년/.test(rule) ? 'all_years' : 'unknown'
  return { min, max, period }
}

function guessGrade(extraction: ExtractionResult, t: ExtractedTable): 1 | 2 | 3 | null {
  const pi = t.pageIndexes[0]
  if (pi === undefined) {
    const m = t.id.match(/([123])/)
    return m ? (Number(m[1]) as 1 | 2 | 3) : null
  }
  const title = extraction.pages[pi]?.lines.find((l) => /([123])학년/.test(l.text) && /표/.test(l.text))?.text
  const m = title?.match(/([123])학년/)
  return m ? (Number(m[1]) as 1 | 2 | 3) : null
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
if (isMain) {
  const ex = arg('extraction')
  const school = arg('school')
  const cohort = Number(arg('cohort'))
  if (!ex || !school || !Number.isInteger(cohort)) {
    console.error('사용: npm run docs:package -- --extraction <json> --school <id> --cohort <연도> [--track <id>] [--revision 2022] [--out <json>]')
    process.exit(2)
  }
  const extraction = JSON.parse(readFileSync(ex, 'utf8')) as ExtractionResult
  const { dataset, report } = packageReview(extraction, { schoolId: school, cohortYear: cohort, trackId: arg('track') ?? null, revision: (arg('revision') as '2015' | '2022' | undefined) ?? 'unknown', title: arg('title'), publisher: arg('publisher'), officialUrl: arg('url') ?? null })
  const out = arg('out', path.join('data/review', `${path.basename(ex, '.json')}.review.json`))!
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify({ dataset, report }, null, 2), 'utf8')
  console.log(report.join('\n'))
  console.log(`→ ${out}  (관리 화면 '검토 패키지 가져오기' 또는 POST /api/admin/import)`)
}
