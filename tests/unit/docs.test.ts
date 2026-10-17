/**
 * 문서 분석 파이프라인 — 가상 fixture(PDF/HWPX/XLSX)를 사람이 작성한 기대값과 대조한다.
 * 기대값은 tests/fixtures/expected/*.json (추출 코드와 같은 로직으로 만들지 않음).
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { extractPdf } from '../../scripts/docs/lib/pdf'
import { extractHwpx } from '../../scripts/docs/lib/hwpx'
import { extractXlsx } from '../../scripts/docs/lib/xlsx'
import { packageReview } from '../../scripts/docs/package-review'
import type { ExtractionResult } from '../../shared/extraction'

const fx = (f: string) => path.join(process.cwd(), 'tests/fixtures', f)
const expected = (f: string) => JSON.parse(readFileSync(fx(`expected/${f}`), 'utf8'))

beforeAll(() => {
  for (const f of ['syn-a-2027-table.pdf', 'syn-c-2026-table.hwpx', 'syn-b-2027-table.xlsx']) {
    if (!existsSync(fx(f))) throw new Error(`fixture 없음: ${f} — npm run docs:fixtures 를 먼저 실행하세요`)
  }
})

describe('PDF: 반복 머리글·여러 쪽 표·다음 쪽 각주·인쇄 쪽수 (시나리오 12, 13)', () => {
  let r: ExtractionResult
  const exp = expected('syn-a-2027-table.pdf.expected.json')
  beforeAll(async () => {
    r = await extractPdf(fx('syn-a-2027-table.pdf'), 'doc_test_pdf')
  })
  it('PDF 배열 페이지와 인쇄 쪽수 라벨을 구분한다', () => {
    expect(r.pages.map((p) => p.printedPageLabel)).toEqual(exp.pageLabels)
  })
  it('T1 행이 정확하고 학점 공란은 빈 문자열로 남는다', () => {
    const t1 = r.tables.find((t) => t.id === 'T1')!
    expect(t1.pageIndexes[0]).toBe(exp.tables.T1.pdfPageIndex)
    expect(r.pages[t1.pageIndexes[0]!]!.printedPageLabel).toBe(exp.tables.T1.printedPageLabel)
    expect(t1.rows.map((row) => row.cells.map((c) => c.text))).toEqual(exp.tables.T1.rows)
  })
  it('두 쪽에 걸친 T2: 반복 머리글이 과목 행에 들어가지 않고 이어진다', () => {
    const t2 = r.tables.find((t) => t.id === 'T2')!
    const cont = r.tables.filter((t) => t.continuedFromTableId === 'T2')
    expect(cont).toHaveLength(1)
    const rows = [...t2.rows, ...cont[0]!.rows.filter((x) => !x.isRepeatedHeader)].map((row) => row.cells.map((c) => c.text))
    expect(rows).toEqual(exp.tables.T2.rowsIncludingContinuation)
    expect(cont[0]!.rows.some((x) => x.isRepeatedHeader)).toBe(true)
    expect(rows.some((row) => row[0] === '과목')).toBe(false)
  })
  it('각주가 다음 쪽에 있어도 페이지·쪽수와 함께 수집된다', () => {
    expect(r.notes.map((n) => ({ pdfPageIndex: n.pageIndex, printedPageLabel: n.printedPageLabel, text: n.text }))).toEqual(exp.notes)
  })
  it('셀 좌표가 보관되어 하이라이트에 쓸 수 있다', () => {
    const t1 = r.tables.find((t) => t.id === 'T1')!
    expect(t1.rows[0]!.cells[0]!.bbox).not.toBeNull()
    expect(t1.rows[0]!.cells[0]!.bbox!.pageHeight).toBeGreaterThan(800)
  })
  it('검토 패키지: 편성·null 학점·교차 편성·선택군 후보가 초안으로 만들어진다', () => {
    const { dataset, report } = packageReview(r, { schoolId: 'syn_school_a', cohortYear: 2027, revision: '2022' })
    expect(dataset.offerings).toHaveLength(exp.packaged.offeringCount)
    expect(dataset.offerings.filter((o) => o.creditValue === null).map((o) => o.courseOriginalName)).toEqual(exp.packaged.nullCreditCourses)
    const f = dataset.offerings.filter((o) => o.courseOriginalName === exp.packaged.crossSemesterCourse)
    expect(f).toHaveLength(2)
    expect(f[0]!.crossSemesterGroup).toBe(f[1]!.crossSemesterGroup)
    expect(f[0]!.crossSemesterGroup).not.toBeNull()
    for (const [label, rule] of Object.entries(exp.packaged.groupCandidates as Record<string, { min: number | null; max: number | null; period?: string }>)) {
      const g = dataset.selectionGroups.find((x) => x.label === `선택군 ${label}`)!
      expect(g, label).toBeDefined()
      expect(g.minSelections).toBe(rule.min)
      expect(g.maxSelections).toBe(rule.max)
      if (rule.period) expect(g.periodScope).toBe(rule.period)
      expect(g.memberOfferingIds.length).toBeGreaterThan(0)
    }
    expect(dataset.selectionGroups.every((g) => g.ruleStatus === 'unverified')).toBe(exp.packaged.allGroupsUnverified)
    expect(dataset.versions[0]!.status).toBe('draft')
    expect(dataset.evidence.every((e) => e.reviewedBy === null)).toBe(true)
    expect(dataset.offerings.every((o) => o.evidenceIds.length === 1)).toBe(true)
    expect(report.join('\n')).toMatch(/초안/)
  })
})

describe('HWPX: 표 구조·병합 셀·문단 각주', () => {
  const exp = expected('syn-c-2026-table.hwpx.expected.json')
  it('표 2개와 병합 셀, 각주를 읽고 쪽수를 꾸며내지 않는다', async () => {
    const r = await extractHwpx(fx('syn-c-2026-table.hwpx'), 'doc_test_hwpx')
    expect(r.failure).toBeNull()
    expect(r.tables).toHaveLength(exp.tableCount)
    expect(r.tables[0]!.header!.map((c) => c.text)).toEqual(exp.tbl1.header)
    expect(r.tables[0]!.rows.map((row) => row.cells.map((c) => c.text))).toEqual(exp.tbl1.rows)
    const m = r.tables[1]!.rows[exp.tbl2.mergedCell.row]!.cells[exp.tbl2.mergedCell.col]!
    expect(m.colSpan).toBe(exp.tbl2.mergedCell.colSpan)
    expect(r.tables[1]!.rows.map((row) => row.cells.map((c) => c.text))).toEqual(exp.tbl2.rows)
    expect(r.tables[1]!.rows[0]!.cells[2]!.mergedFrom).toEqual({ row: 1, col: 1 })
    expect(r.notes.map((n) => n.text)).toEqual(exp.notes)
    expect(r.notes.every((n) => n.pageIndex === null)).toBe(exp.pdfPageIndexMustBeNull)
  })
  it('HWP(OLE) 서명은 변환 안내와 함께 unsupported', async () => {
    const tmp = path.join(process.cwd(), 'tests/fixtures/fake.hwp')
    const { writeFileSync, rmSync } = await import('node:fs')
    writeFileSync(tmp, Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]))
    const r = await extractHwpx(tmp, 'doc_test_hwp')
    rmSync(tmp)
    expect(r.method).toBe('unsupported')
    expect(r.failure).toMatch(/HWPX 또는 PDF/)
  })
})

describe('XLSX: 병합 셀을 복제하지 않는다', () => {
  const exp = expected('syn-b-2027-table.xlsx.expected.json')
  it('헤더·행·병합·각주', async () => {
    const r = await extractXlsx(fx('syn-b-2027-table.xlsx'), 'doc_test_xlsx')
    expect(r.failure).toBeNull()
    const t = r.tables[0]!
    expect(t.header!.map((c) => c.text)).toEqual(exp.header)
    expect(t.rows.map((row) => row.cells.map((c) => c.text))).toEqual(exp.rows)
    expect(t.rows.map((row, i) => (row.cells[0]!.mergedFrom ? i : -1)).filter((i) => i >= 0)).toEqual(exp.mergedFromFirstCol)
    expect(r.notes.map((n) => n.text)).toEqual(exp.notes)
    const { dataset } = packageReview(r, { schoolId: 'syn_school_b', cohortYear: 2027, revision: '2022', gradeByTable: { 편제표: 1 } })
    const g = dataset.selectionGroups.find((x) => x.label === '선택군 G')!
    expect(g.minSelections).toBe(exp.packagedGroupG.min) // '최대 2' 는 최소 2 가 아니다
    expect(g.maxSelections).toBe(exp.packagedGroupG.max)
  })
})
