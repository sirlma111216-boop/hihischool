/**
 * PDF 텍스트·표·좌표 추출 (로컬 Node). PDF.js 텍스트 레이어를 쓰며 HWP 파서로 쓰지 않는다.
 * 스캔 PDF(텍스트 없음)는 needsOcr=true 로 표시하고 수치를 확정하지 않는다.
 */
import { readFileSync } from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import type { BBox, ExtractedCell, ExtractedPage, ExtractedTable, ExtractedNote, ExtractionResult } from '../../../shared/extraction'
import { sha256Hex, sniffFileType } from '../../../shared/filesig'

interface Item {
  text: string
  x: number
  y: number
  w: number
  h: number
}

const HEADER_RE = /^과목(명)?$/
const SEMESTER_RE = /^[12]학기$/
const NOTE_RE = /^[※*]/
const PAGE_NUM_RE = /^-\s*\d+\s*-$/

export async function extractPdf(filePath: string, documentId: string): Promise<ExtractionResult> {
  const buf = readFileSync(filePath)
  const bytes = new Uint8Array(buf)
  const sig = sniffFileType(bytes)
  const base: ExtractionResult = {
    schemaVersion: '1',
    documentId,
    sourceFile: filePath,
    sha256: await sha256Hex(bytes),
    fileSignature: sig,
    method: 'pdf_table',
    extractedAt: new Date().toISOString(),
    pages: [],
    tables: [],
    notes: [],
    warnings: [],
    failure: null,
    needsOcr: false,
  }
  if (sig !== 'pdf') return { ...base, method: 'unsupported', failure: `PDF 서명이 아닙니다 (${sig}).` }

  const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true, disableFontFace: true }).promise
  let labels: string[] | null = null
  try {
    labels = await doc.getPageLabels()
  } catch {
    labels = null
  }
  const pages: ExtractedPage[] = []
  let textChars = 0
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    const vp = page.getViewport({ scale: 1 })
    const content = await page.getTextContent()
    const rects = await collectRects(page)
    const items: Item[] = []
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const [, , , , e, f] = it.transform as number[]
      items.push({ text: it.str, x: e ?? 0, y: f ?? 0, w: it.width, h: it.height })
      textChars += it.str.length
    }
    // 줄 묶기 (y 가 2pt 이내면 같은 줄)
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const lines: { y: number; items: Item[] }[] = []
    for (const it of items) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.y - it.y) <= 2) last.items.push(it)
      else lines.push({ y: it.y, items: [it] })
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x)
    const pageLabel = labels?.[i] ?? null
    pages.push({
      pdfPageIndex: i,
      printedPageLabel: pageLabel && pageLabel.trim() ? pageLabel : null,
      width: vp.width,
      height: vp.height,
      lines: lines.map((l) => ({ text: l.items.map((x) => x.text).join(' ').trim(), bbox: lineBox(l.items, vp.width, vp.height), items: l.items.map((it) => ({ text: it.text, x: it.x, y: it.y, w: it.w, h: it.h })) })),
      rects,
    })
    // 표·각주 인식 (페이지 단위, 원본 items 사용)
    detectTablesAndNotes(base, lines, i, pages[pages.length - 1]!.printedPageLabel, vp.width, vp.height)
  }
  base.pages = pages
  if (textChars < 20) {
    base.needsOcr = true
    base.method = 'ocr'
    base.warnings.push('텍스트 레이어가 거의 없습니다. 스캔 PDF 로 보이며 OCR 결과는 신뢰도와 함께 사람 검토가 필요합니다. 이 도구는 OCR 을 자동 확정하지 않습니다.')
  }
  // 이어지는 표 연결: '(계속)' 제목의 표는 직전 표에 연결
  for (let t = 1; t < base.tables.length; t++) {
    const cur = base.tables[t]!
    const prev = base.tables[t - 1]!
    if (cur.continuedFromTableId === 'auto') {
      cur.continuedFromTableId = prev.id
      prev.pageIndexes.push(...cur.pageIndexes)
    }
  }
  return base
}

function lineBox(items: Item[], pw: number, ph: number): BBox {
  const x = Math.min(...items.map((i) => i.x))
  const right = Math.max(...items.map((i) => i.x + i.w))
  const y = Math.min(...items.map((i) => i.y))
  const top = Math.max(...items.map((i) => i.y + i.h))
  return { x, y, width: right - x, height: top - y, pageWidth: pw, pageHeight: ph }
}

function detectTablesAndNotes(result: ExtractionResult, lines: { y: number; items: Item[] }[], pageIndex: number, label: string | null, pw: number, ph: number) {
  let current: ExtractedTable | null = null
  let colStarts: number[] = []
  let titleText = ''
  for (const line of lines) {
    const text = line.items.map((x) => x.text).join(' ').trim()
    if (NOTE_RE.test(text)) {
      result.notes.push({ text: text.replace(/^[※*]\s*/, ''), bbox: lineBox(line.items, pw, ph), pageIndex, printedPageLabel: label })
      continue
    }
    if (/\(표\s*T?\w+/.test(text) || /편제\s*\(/.test(text)) titleText = text
    if (PAGE_NUM_RE.test(text) || /다음 쪽에 계속/.test(text)) continue
    // 머리글: '과목' 이라는 셀과 'n학기' 셀이 따로 있고 3개 이상 항목 (과목 행의 비고에 '학기'가 있어도 머리글로 보지 않음)
    const isHeader = line.items.length >= 3 && line.items.some((it) => HEADER_RE.test(it.text.trim())) && line.items.some((it) => SEMESTER_RE.test(it.text.trim()))
    if (isHeader) {
      const headerCells: ExtractedCell[] = line.items.map((it) => ({ text: it.text, bbox: { x: it.x, y: it.y, width: it.w, height: it.h, pageWidth: pw, pageHeight: ph } }))
      const idMatch = titleText.match(/표\s*(T?\w+)/)
      const isContinued = /계속/.test(titleText)
      current = {
        id: idMatch ? `${idMatch[1]}${isContinued ? '-cont' : ''}` : `table-p${pageIndex}`,
        header: headerCells,
        rows: [],
        pageIndexes: [pageIndex],
        continuedFromTableId: isContinued ? 'auto' : null,
      }
      // 이어지는 표의 머리글은 반복 머리글로 기록 (과목 행에 넣지 않음)
      if (isContinued) current.rows.push({ index: 0, cells: headerCells, isRepeatedHeader: true })
      colStarts = line.items.map((it) => it.x)
      result.tables.push(current)
      continue
    }
    if (!current) continue
    // 표 행: 첫 항목이 첫 열 근처에 있고 열이 2개 이상
    if (line.items.length >= 2 && Math.abs(line.items[0]!.x - (colStarts[0] ?? 0)) < 8) {
      const cells: ExtractedCell[] = colStarts.map(() => ({ text: '', bbox: null }))
      for (const it of line.items) {
        // 가장 가까운 열 시작점에 배정 (병합·빈 칸은 빈 문자열로 남긴다)
        let best = 0
        let bestD = Infinity
        colStarts.forEach((cx, ci) => {
          const d = Math.abs(it.x - cx)
          if (d < bestD) {
            bestD = d
            best = ci
          }
        })
        const c = cells[best]!
        c.text = c.text ? `${c.text} ${it.text}` : it.text
        c.bbox = c.bbox ? { ...c.bbox, width: it.x + it.w - c.bbox.x } : { x: it.x, y: it.y, width: it.w, height: it.h, pageWidth: pw, pageHeight: ph }
      }
      current.rows.push({ index: current.rows.length, cells })
    } else if (line.items.length === 1 && /^\d+\./.test(text)) {
      current = null // 새 절 제목이면 표 종료
    }
  }
}

export function tablesToText(r: ExtractionResult): string {
  return r.tables.map((t) => `# ${t.id}\n${t.rows.filter((row) => !row.isRepeatedHeader).map((row) => row.cells.map((c) => c.text).join(' | ')).join('\n')}`).join('\n\n') + '\n' + r.notes.map((n) => `※ ${n.text}`).join('\n')
}

export type { ExtractedNote }

/** 페이지의 채움/선 사각형(셀 테두리·배경)을 모은다. constructPath 의 minMax 경계 상자를 쓴다. 표 격자 복원에 사용. */
async function collectRects(page: pdfjs.PDFPageProxy): Promise<{ x0: number; y0: number; x1: number; y1: number }[]> {
  const out: { x0: number; y0: number; x1: number; y1: number }[] = []
  try {
    const ops = await page.getOperatorList()
    for (let i = 0; i < ops.fnArray.length; i++) {
      if (ops.fnArray[i] !== pdfjs.OPS.constructPath) continue
      const args = ops.argsArray[i] as unknown[]
      const minMax = args[2] as number[] | undefined
      if (!minMax || minMax.length < 4) continue
      const [x0, y0, x1, y1] = minMax as [number, number, number, number]
      if (!Number.isFinite(x0) || !Number.isFinite(y1)) continue
      out.push({ x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) })
    }
  } catch {
    /* 그래픽 연산을 읽지 못하면 격자 없이 진행 */
  }
  return out
}
