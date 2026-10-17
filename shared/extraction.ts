/**
 * 원문 → 후보 JSON 스키마 (로컬 추출 산출물).
 * 추출 결과는 '초안'이며, 사람이 원문 옆에서 검토·승인하기 전에는 공개되지 않는다.
 */
export interface BBox {
  x: number
  y: number
  width: number
  height: number
  pageWidth: number
  pageHeight: number
}

export interface ExtractedCell {
  text: string
  bbox: BBox | null
  /** 병합 셀 원본 범위 (행·열 span). 펼쳐서 중복 계산하지 않도록 표시만 한다. */
  rowSpan?: number
  colSpan?: number
  /** 병합으로 인해 비어 있는(원문에 값이 없는) 셀 */
  mergedFrom?: { row: number; col: number }
  /** OCR 등 낮은 신뢰도 */
  confidence?: number | null
}

export interface ExtractedRow {
  index: number
  cells: ExtractedCell[]
  /** 반복 머리글로 판정되어 과목 행에서 제외됨 */
  isRepeatedHeader?: boolean
}

export interface ExtractedTable {
  id: string
  header: ExtractedCell[] | null
  rows: ExtractedRow[]
  /** 여러 쪽에 걸친 표일 때 이어지는 페이지 index 목록 */
  pageIndexes: number[]
  continuedFromTableId?: string | null
}

export interface ExtractedNote {
  text: string
  bbox: BBox | null
  pageIndex: number | null
  printedPageLabel: string | null
}

export interface ExtractedPage {
  pdfPageIndex: number
  printedPageLabel: string | null
  width: number
  height: number
  lines: { text: string; bbox: BBox }[]
}

export interface ExtractionResult {
  schemaVersion: '1'
  documentId: string
  sourceFile: string
  sha256: string
  fileSignature: 'pdf' | 'zip' | 'hwp' | 'unknown'
  method: 'pdf_text' | 'pdf_table' | 'ocr' | 'hwpx' | 'xlsx' | 'manual' | 'unsupported'
  extractedAt: string
  pages: ExtractedPage[]
  tables: ExtractedTable[]
  notes: ExtractedNote[]
  warnings: string[]
  /** 지원하지 않거나 실패한 경우 이유 */
  failure: string | null
  /** 스캔 PDF 여부 (텍스트 레이어 없음) */
  needsOcr: boolean
}
