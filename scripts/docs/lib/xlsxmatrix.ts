/** XLSX 편제표 → CapturedTable (병합 셀을 rs/cs 로). 시트마다 표 하나로 본다. */
import ExcelJS from 'exceljs'
import { readFileSync } from 'node:fs'
import type { CapturedTable, CapturedCell } from './htmlmatrix'

export async function xlsxToMatrixTables(file: string): Promise<CapturedTable[]> {
  const bytes = readFileSync(file)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)
  const out: CapturedTable[] = []
  wb.eachSheet((ws) => {
    const merges = new Map<string, { top: number; left: number; bottom: number; right: number }>()
    for (const m of (ws.model.merges ?? []) as string[]) {
      const [a, b] = m.split(':')
      const ra = ws.getCell(a!)
      const rb = ws.getCell(b ?? a!)
      const box = { top: Number(ra.row), left: Number(ra.col), bottom: Number(rb.row), right: Number(rb.col) }
      for (let r = box.top; r <= box.bottom; r++) for (let c = box.left; c <= box.right; c++) merges.set(`${r}:${c}`, box)
    }
    const maxCol = ws.columnCount
    const rows: CapturedCell[][] = []
    let heading = ''
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r)
      const cells: CapturedCell[] = []
      let any = false
      for (let c = 1; c <= maxCol; c++) {
        const m = merges.get(`${r}:${c}`)
        if (m && !(m.top === r && m.left === c)) continue // 병합 범위의 나머지 칸
        const v = row.getCell(c).value
        const text = v === null || v === undefined ? '' : typeof v === 'object' && 'richText' in (v as object) ? (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('') : typeof v === 'object' && 'result' in (v as object) ? String((v as { result: unknown }).result ?? '') : String(v)
        if (text.trim()) any = true
        cells.push({ t: text.trim(), rs: m ? m.bottom - m.top + 1 : 1, cs: m ? m.right - m.left + 1 : 1, th: false })
      }
      if (!any && rows.length === 0) continue
      // 표 머리글 전에 나오는 한 칸짜리 제목 행
      if (rows.length === 0 && cells.filter((x) => x.t).length === 1 && !/학기|과목/.test(cells.find((x) => x.t)!.t)) {
        heading = cells.find((x) => x.t)!.t
        continue
      }
      rows.push(cells)
    }
    if (rows.some((r) => r.some((c) => /^[12]학기$/.test(c.t.replace(/\s+/g, ''))))) out.push({ heading: heading || ws.name, rows })
  })
  return out
}
