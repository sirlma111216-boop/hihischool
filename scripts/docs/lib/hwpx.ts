/**
 * HWPX(OWPML, zip+XML) 구조 추출. 표의 행·열·병합(colSpan/rowSpan)과 문단 각주를 읽는다.
 * 페이지 매김은 보존되지 않으므로 pdfPageIndex 는 null, 문단 anchor 로 위치를 안내한다.
 * 보안: XML 외부 엔터티를 처리하지 않고(파서가 DTD 를 해석하지 않음), 압축 해제 크기를 제한한다.
 */
import { readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { XMLParser } from 'fast-xml-parser'
import type { ExtractedCell, ExtractedTable, ExtractionResult } from '../../../shared/extraction'
import { sha256Hex, sniffFileType } from '../../../shared/filesig'

const MAX_UNZIPPED = 50 * 1024 * 1024

type Node = Record<string, unknown>

function textOf(node: unknown): string {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join('')
  if (typeof node === 'object') {
    const n = node as Node
    const parts: string[] = []
    for (const [k, v] of Object.entries(n)) {
      if (k.startsWith('@_')) continue
      if (k === '#text') parts.push(String(v))
      else parts.push(textOf(v))
    }
    return parts.join('')
  }
  return ''
}

export async function extractHwpx(filePath: string, documentId: string): Promise<ExtractionResult> {
  const bytes = new Uint8Array(readFileSync(filePath))
  const sig = sniffFileType(bytes)
  const base: ExtractionResult = {
    schemaVersion: '1',
    documentId,
    sourceFile: filePath,
    sha256: await sha256Hex(bytes),
    fileSignature: sig,
    method: 'hwpx',
    extractedAt: new Date().toISOString(),
    pages: [],
    tables: [],
    notes: [],
    warnings: ['HWPX 변환은 페이지 매김을 보존하지 않습니다. 원문 쪽수로 위장하지 않으며 문단 위치만 안내합니다.'],
    failure: null,
    needsOcr: false,
  }
  if (sig === 'hwp') return { ...base, method: 'unsupported', failure: 'HWP 5.x(OLE) 바이너리는 이 도구가 직접 읽지 않습니다. 한컴오피스로 HWPX 또는 PDF 로 변환한 뒤 다시 등록하세요.' }
  if (sig !== 'zip') return { ...base, method: 'unsupported', failure: `HWPX(zip) 서명이 아닙니다 (${sig}).` }
  const zip = await JSZip.loadAsync(bytes)
  let total = 0
  for (const f of Object.values(zip.files)) {
    // @ts-expect-error _data 는 내부 필드지만 압축 해제 크기 검사에 사용
    total += f._data?.uncompressedSize ?? 0
  }
  if (total > MAX_UNZIPPED) return { ...base, method: 'unsupported', failure: '압축 해제 크기가 제한을 초과합니다 (압축 폭탄 방지).' }
  const sections = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/.test(n)).sort()
  if (sections.length === 0) return { ...base, method: 'unsupported', failure: 'Contents/section*.xml 을 찾지 못했습니다. HWPX 가 아니거나 구조가 다릅니다.' }
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', preserveOrder: true, processEntities: false, trimValues: false })
  let paraIndex = 0
  let tableIndex = 0
  for (const name of sections) {
    const xml = await zip.file(name)!.async('string')
    const tree = parser.parse(xml) as unknown[]
    walk(tree)
  }
  function walk(nodes: unknown[]) {
    for (const n of nodes) {
      if (typeof n !== 'object' || n === null) continue
      const obj = n as Node
      for (const [key, val] of Object.entries(obj)) {
        if (key === ':@') continue
        const local = key.replace(/^.*:/, '')
        if (local === 'tbl') {
          tableIndex += 1
          base.tables.push(parseTable(val as unknown[], `tbl${tableIndex}`))
          continue
        }
        if (local === 'p') {
          const t = flatText(val as unknown[]).trim()
          if (t) {
            paraIndex += 1
            if (/^[※*]/.test(t)) base.notes.push({ text: t.replace(/^[※*]\s*/, ''), bbox: null, pageIndex: null, printedPageLabel: null })
            base.pages[0] ??= { pdfPageIndex: 0, printedPageLabel: null, width: 0, height: 0, lines: [] }
            base.pages[0].lines.push({ text: `[문단 ${paraIndex}] ${t}`, bbox: { x: 0, y: 0, width: 0, height: 0, pageWidth: 0, pageHeight: 0 } })
          }
          // 문단 안의 표도 탐색
          walk(val as unknown[])
          continue
        }
        if (Array.isArray(val)) walk(val)
      }
    }
  }
  function flatText(nodes: unknown[]): string {
    let out = ''
    for (const n of nodes) {
      if (typeof n !== 'object' || n === null) continue
      for (const [key, val] of Object.entries(n as Node)) {
        if (key === ':@') continue
        const local = key.replace(/^.*:/, '')
        if (local === 'tbl') continue
        if (key === '#text') out += String(val)
        else if (Array.isArray(val)) out += flatText(val)
      }
    }
    return out
  }
  function parseTable(nodes: unknown[], id: string): ExtractedTable {
    const rows: ExtractedTable['rows'] = []
    for (const n of nodes) {
      if (typeof n !== 'object' || n === null) continue
      for (const [key, val] of Object.entries(n as Node)) {
        if (key.replace(/^.*:/, '') !== 'tr') continue
        const cells: ExtractedCell[] = []
        for (const c of val as unknown[]) {
          if (typeof c !== 'object' || c === null) continue
          const cn = c as Node
          const attrs = (cn[':@'] as Node | undefined) ?? {}
          for (const [ck, cv] of Object.entries(cn)) {
            if (ck.replace(/^.*:/, '') !== 'tc') continue
            const cell: ExtractedCell = { text: flatText(cv as unknown[]).trim(), bbox: null }
            const cs = Number(attrs['@_colSpan'] ?? attrs['@_colspan'] ?? 1)
            const rs = Number(attrs['@_rowSpan'] ?? attrs['@_rowspan'] ?? 1)
            if (cs > 1) cell.colSpan = cs
            if (rs > 1) cell.rowSpan = rs
            cells.push(cell)
            // 병합된 만큼 빈 셀을 채워 열 수를 맞추되 값은 비운다 (중복 계산 금지)
            for (let k = 1; k < cs; k++) cells.push({ text: '', bbox: null, mergedFrom: { row: rows.length, col: cells.length - k } })
          }
        }
        rows.push({ index: rows.length, cells })
      }
    }
    const header = rows[0]?.cells ?? null
    return { id, header, rows: rows.slice(1).map((r, i) => ({ ...r, index: i })), pageIndexes: [], continuedFromTableId: null }
  }
  return base
}

export function textOfNode(n: unknown): string {
  return textOf(n)
}
