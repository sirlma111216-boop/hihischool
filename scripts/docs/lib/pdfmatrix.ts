/**
 * PDF 표 격자 복원: 셀 테두리(가는 사각형)로 행·열 경계를 찾고, 글자 좌표로 셀을 채운다.
 * 병합 셀은 경계선이 끊긴 범위로 복원해 rowSpan/colSpan 으로 표현한다 → htmlmatrix.packageMatrixTable 과 같은 입력 형식.
 * 좌표는 PDF 좌표계(원점 좌하단). 근거의 boundingBox 로도 쓴다.
 */
import type { ExtractionResult } from '../../../shared/extraction'
import { expandGrid, type CapturedTable, type CapturedCell } from './htmlmatrix'

interface Item { text: string; x: number; y: number; w: number; h: number }


const LINE_MAX = 4.5 // 이보다 얇은 사각형은 선으로 본다 (굵은 머리글 테두리 포함)
const EPS = 1.6

function cluster(values: number[], eps = EPS): number[] {
  const sorted = [...values].sort((a, b) => a - b)
  const out: number[] = []
  for (const v of sorted) {
    const last = out[out.length - 1]
    if (last === undefined || v - last > eps) out.push(v)
    else out[out.length - 1] = (last + v) / 2
  }
  return out
}

export interface PdfGridTable extends CapturedTable {
  pageIndex: number
  /** 격자 행·열 경계 (PDF 좌표) — 근거 bbox 계산용 */
  rowEdges: number[]
  colEdges: number[]
  cellBoxes: Map<string, { x: number; y: number; width: number; height: number }> // `${r}:${c}` → 원본 셀 상자
}

/** 한 페이지에서 '1학기/2학기' 머리글이 있는 표 하나를 복원한다. 없으면 null. */
export function gridFromPage(page: NonNullable<ExtractionResult['pages'][number]>): PdfGridTable | null {
  const items: Item[] = page.lines.flatMap((l) => l.items ?? [])
  const rects = page.rects ?? []
  if (items.length === 0 || rects.length === 0) return null
  const semItems = items.filter((i) => /^([123]학년)?[12]학기$/.test(i.text.replace(/\s+/g, '')))
  if (semItems.length < 2) return null
  const hLines = rects.filter((r) => r.y1 - r.y0 <= LINE_MAX && r.x1 - r.x0 > 8)
  const vLines = rects.filter((r) => r.x1 - r.x0 <= LINE_MAX && r.y1 - r.y0 > 6)
  if (hLines.length < 3 || vLines.length < 3) return null
  // 표 영역: 선들의 전체 범위
  const tableX0 = Math.min(...vLines.map((r) => r.x0))
  const tableX1 = Math.max(...vLines.map((r) => r.x1))
  const tableY0 = Math.min(...hLines.map((r) => r.y0))
  const tableY1 = Math.max(...hLines.map((r) => r.y1))
  const rowEdges = cluster(hLines.map((r) => (r.y0 + r.y1) / 2)).sort((a, b) => b - a) // 위→아래 (y 내림차순)
  const colEdges = cluster(vLines.map((r) => (r.x0 + r.x1) / 2)).sort((a, b) => a - b)
  if (rowEdges.length < 3 || colEdges.length < 3) return null
  const hasH = (y: number, x0: number, x1: number) => hLines.some((r) => Math.abs((r.y0 + r.y1) / 2 - y) <= EPS && r.x0 <= x0 + EPS * 2 && r.x1 >= x1 - EPS * 2)
  const hasV = (x: number, y0: number, y1: number) => vLines.some((r) => Math.abs((r.x0 + r.x1) / 2 - x) <= EPS && r.y0 <= y0 + EPS * 2 && r.y1 >= y1 - EPS * 2)
  const nRows = rowEdges.length - 1
  const nCols = colEdges.length - 1
  const inTable = (it: Item) => it.x >= tableX0 - 2 && it.x <= tableX1 + 2 && it.y >= tableY0 - 2 && it.y <= tableY1 + 2
  // 각 글자 항목을 (row, col) 에 배정
  const colOf = (x: number) => { for (let c = 0; c < nCols; c++) if (x >= colEdges[c]! - EPS && x < colEdges[c + 1]!) return c; return -1 }
  const rowOf = (y: number) => { for (let r = 0; r < nRows; r++) if (y <= rowEdges[r]! + EPS && y > rowEdges[r + 1]!) return r; return -1 }
  const cellItems = new Map<string, Item[]>()
  for (const it of items) {
    if (!inTable(it)) continue
    const c = colOf(it.x + Math.min(it.w, 4) / 2)
    const r = rowOf(it.y + it.h / 2)
    if (c < 0 || r < 0) continue
    const k = `${r}:${c}`
    if (!cellItems.has(k)) cellItems.set(k, [])
    cellItems.get(k)!.push(it)
  }
  // 병합 범위 계산: (r,c) 에서 오른쪽/아래로 경계선이 없으면 이어진다
  const covered = new Set<string>()
  const rows: CapturedCell[][] = []
  const cellBoxes = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (let r = 0; r < nRows; r++) {
    const row: CapturedCell[] = []
    for (let c = 0; c < nCols; c++) {
      if (covered.has(`${r}:${c}`)) continue
      let cs = 1
      while (c + cs < nCols && !hasV(colEdges[c + cs]!, rowEdges[r + 1]!, rowEdges[r]!)) cs++
      let rs = 1
      while (r + rs < nRows && !hasH(rowEdges[r + rs]!, colEdges[c]!, colEdges[c + cs]!)) rs++
      const parts: Item[] = []
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) { covered.add(`${r + dr}:${c + dc}`); parts.push(...(cellItems.get(`${r + dr}:${c + dc}`) ?? [])) }
      parts.sort((a, b) => b.y - a.y || a.x - b.x)
      const text = parts.map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim()
      row.push({ t: text, rs, cs, th: false })
      cellBoxes.set(`${r}:${c}`, { x: colEdges[c]!, y: rowEdges[r + rs]!, width: colEdges[c + cs]! - colEdges[c]!, height: rowEdges[r]! - rowEdges[r + rs]! })
    }
    rows.push(row)
  }
  // 표 제목: 표 위쪽의 가장 가까운 글줄
  const above = page.lines.filter((l) => l.bbox.y > tableY1 && l.text.trim()).sort((a, b) => a.bbox.y - b.bbox.y)
  const heading = above[0]?.text.trim() ?? ''
  return { heading, rows, pageIndex: page.pdfPageIndex, rowEdges, colEdges, cellBoxes }
}

export function headerRowCount(t: CapturedTable): number {
  let i = t.rows.findIndex((r) => r.some((c) => /^[12]학기$/.test(c.t.replace(/\s+/g, ''))))
  if (i < 0) return 1
  if (t.rows[i + 1]?.some((c) => /^(이론|실습)$/.test(c.t.trim()))) i += 1
  return i + 1
}

/**
 * 이어지는 쪽의 머리글 행을 떼어낸 본문 행을 만든다.
 * 머리글 행에서 시작해 본문까지 이어지는 rowSpan 셀(예: 왼쪽 여백 열, '구분' 열)은 첫 본문 행으로 옮기고 span 을 줄인다.
 * 그렇지 않으면 본문 셀이 한 칸씩 왼쪽으로 밀린다.
 */
function bodyRows(t: PdfGridTable, hn: number): { rows: CapturedCell[][]; boxes: Map<string, { x: number; y: number; width: number; height: number }> } {
  const grid = expandGrid(t.rows)
  const rows: CapturedCell[][] = []
  const boxes = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (let r = hn; r < grid.length; r++) {
    const cells: { col: number; cell: CapturedCell; key: string }[] = []
    const seen = new Set<string>()
    for (let c = 0; c < grid[r]!.length; c++) {
      const g = grid[r]![c]
      if (!g) continue
      const key = `${g.originRow}:${g.originCol}`
      if (seen.has(key)) continue
      if (g.originRow === r) {
        seen.add(key)
        cells.push({ col: c, cell: { t: g.text, rs: g.rowSpan, cs: spanOf(grid, g), th: false }, key })
      } else if (r === hn && g.originRow < hn && g.originRow + g.rowSpan > hn) {
        seen.add(key)
        cells.push({ col: c, cell: { t: g.text, rs: g.originRow + g.rowSpan - hn, cs: spanOf(grid, g), th: false }, key })
      }
    }
    cells.sort((a, b) => a.col - b.col)
    rows.push(cells.map((x) => x.cell))
    for (const x of cells) {
      const b = t.cellBoxes.get(x.key)
      if (b) boxes.set(`${r - hn}:${x.col}`, b)
    }
  }
  return { rows, boxes }
}

function spanOf(grid: ReturnType<typeof expandGrid>, g: ReturnType<typeof expandGrid>[number][number]): number {
  let cs = 0
  const row = grid[g.originRow]!
  for (let c = g.originCol; c < row.length && row[c]?.originRow === g.originRow && row[c]?.originCol === g.originCol; c++) cs++
  return Math.max(1, cs)
}

/** 여러 쪽의 표를 하나로 잇는다 (이어지는 쪽의 머리글 행은 제거, 걸친 rowSpan 은 보정). */
export function mergeContinuation(tables: PdfGridTable[]): PdfGridTable | null {
  if (tables.length === 0) return null
  const first = tables[0]!
  const merged: PdfGridTable = { ...first, rows: [...first.rows], cellBoxes: new Map(first.cellBoxes) }
  let offset = first.rows.length
  for (const t of tables.slice(1)) {
    const hn = headerRowCount(t)
    const { rows, boxes } = bodyRows(t, hn)
    merged.rows.push(...rows)
    for (const [k, v] of boxes) {
      const [r, c] = k.split(':').map(Number)
      merged.cellBoxes.set(`${r! + offset}:${c}`, v)
    }
    offset += rows.length
  }
  return merged
}

export function pdfToMatrixTables(extraction: ExtractionResult): PdfGridTable[] {
  const out: PdfGridTable[] = []
  for (const p of extraction.pages) {
    const g = gridFromPage(p)
    if (g) out.push(g)
  }
  return out
}
