/** XLSX 병합 셀 읽기. 병합 범위의 첫 셀만 값을 갖고 나머지는 mergedFrom 으로 표시한다. */
import { readFileSync } from 'node:fs'
import ExcelJS from 'exceljs'
import type { ExtractedCell, ExtractedTable, ExtractionResult } from '../../../shared/extraction'
import { sha256Hex, sniffFileType } from '../../../shared/filesig'

export async function extractXlsx(filePath: string, documentId: string): Promise<ExtractionResult> {
  const bytes = new Uint8Array(readFileSync(filePath))
  const sig = sniffFileType(bytes)
  const base: ExtractionResult = {
    schemaVersion: '1',
    documentId,
    sourceFile: filePath,
    sha256: await sha256Hex(bytes),
    fileSignature: sig,
    method: 'xlsx',
    extractedAt: new Date().toISOString(),
    pages: [],
    tables: [],
    notes: [],
    warnings: ['XLSX 는 쪽 개념이 없어 시트·행·열로 위치를 안내합니다. 매크로는 실행하지 않습니다.'],
    failure: null,
    needsOcr: false,
  }
  if (sig !== 'zip') return { ...base, method: 'unsupported', failure: `XLSX(zip) 서명이 아닙니다 (${sig}).` }
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  wb.eachSheet((ws) => {
    const merges = new Map<string, { top: number; left: number; bottom: number; right: number }>()
    // exceljs: ws.model.merges 는 "A3:A4" 문자열 목록
    for (const m of (ws.model.merges ?? []) as string[]) {
      const [a, b] = m.split(':')
      const ra = ws.getCell(a!)
      const rb = ws.getCell(b ?? a!)
      const top = Number(ra.row), left = Number(ra.col), bottom = Number(rb.row), right = Number(rb.col)
      for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) merges.set(`${r}:${c}`, { top, left, bottom, right })
    }
    const rows: ExtractedTable['rows'] = []
    let header: ExtractedCell[] | null = null
    const maxCol = ws.columnCount
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells: ExtractedCell[] = []
      for (let c = 1; c <= maxCol; c++) {
        const cell = row.getCell(c)
        const raw = cell.value
        const text = raw === null || raw === undefined ? '' : typeof raw === 'object' && 'richText' in (raw as object) ? (raw as { richText: { text: string }[] }).richText.map((t) => t.text).join('') : String(raw)
        const m = merges.get(`${rowNumber}:${c}`)
        const ec: ExtractedCell = { text: text.trim(), bbox: null }
        if (m) {
          if (m.top === rowNumber && m.left === c) {
            if (m.right > m.left) ec.colSpan = m.right - m.left + 1
            if (m.bottom > m.top) ec.rowSpan = m.bottom - m.top + 1
          } else {
            ec.text = ''
            ec.mergedFrom = { row: m.top, col: m.left }
          }
        }
        cells.push(ec)
      }
      const joined = cells.map((x) => x.text).join(' ')
      if (/^[※*]/.test(cells[0]?.text ?? '')) {
        base.notes.push({ text: (cells[0]!.text).replace(/^[※*]\s*/, ''), bbox: null, pageIndex: null, printedPageLabel: `${ws.name}!${rowNumber}` })
        return
      }
      if (!header && /과목/.test(joined) && /학기/.test(joined)) {
        header = cells
        return
      }
      if (header) rows.push({ index: rows.length, cells })
      else base.pages[0] ??= { pdfPageIndex: 0, printedPageLabel: ws.name, width: 0, height: 0, lines: [] }
      if (!header) base.pages[0]!.lines.push({ text: joined.trim(), bbox: { x: 0, y: 0, width: 0, height: 0, pageWidth: 0, pageHeight: 0 } })
    })
    if (header) base.tables.push({ id: ws.name, header, rows, pageIndexes: [], continuedFromTableId: null })
  })
  return base
}
