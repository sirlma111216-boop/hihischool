/**
 * 로컬 문서 추출 CLI.
 * npm run docs:extract -- --file <경로> --doc <문서ID> [--out data/extracted/<id>.json]
 * 형식은 파일 서명으로 판별한다 (확장자만 믿지 않음). HWP(OLE) 는 변환 안내와 함께 실패를 기록한다.
 * Worker 요청 안에서 실행하지 않는다 — 큰 파일·OCR·HWP 변환은 이 로컬 명령으로만 처리한다.
 */
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { extractPdf } from './lib/pdf'
import { extractHwpx } from './lib/hwpx'
import { extractXlsx } from './lib/xlsx'
import { sniffFileType } from '../../shared/filesig'
import type { ExtractionResult } from '../../shared/extraction'

const MAX_BYTES = 80 * 1024 * 1024

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}

export async function extractAny(file: string, documentId: string): Promise<ExtractionResult> {
  const size = statSync(file).size
  if (size > MAX_BYTES) throw new Error(`파일 크기 제한 초과 (${size} > ${MAX_BYTES})`)
  const head = new Uint8Array(readFileSync(file).subarray(0, 16))
  const sig = sniffFileType(head)
  const ext = path.extname(file).toLowerCase()
  if (sig === 'pdf') return extractPdf(file, documentId)
  if (sig === 'zip' && ext === '.xlsx') return extractXlsx(file, documentId)
  if (sig === 'zip') return extractHwpx(file, documentId)
  if (sig === 'hwp') return extractHwpx(file, documentId) // unsupported 안내 반환
  return {
    schemaVersion: '1',
    documentId,
    sourceFile: file,
    sha256: '',
    fileSignature: sig,
    method: 'unsupported',
    extractedAt: new Date().toISOString(),
    pages: [],
    tables: [],
    notes: [],
    warnings: [],
    failure: `지원하지 않는 형식입니다 (서명 ${sig}, 확장자 ${ext}). PDF 변환본 또는 수동 매핑을 등록하세요.`,
    needsOcr: false,
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)
if (isMain) {
  const file = arg('file')
  const doc = arg('doc')
  if (!file || !doc) {
    console.error('사용: npm run docs:extract -- --file <경로> --doc <문서ID> [--out <출력.json>]')
    process.exit(2)
  }
  const out = arg('out', path.join('data/extracted', `${doc}.json`))!
  const r = await extractAny(file, doc)
  mkdirSync(path.dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(r, null, 2), 'utf8')
  console.log(`${r.method} · 표 ${r.tables.length} · 각주 ${r.notes.length} · 경고 ${r.warnings.length}${r.failure ? ` · 실패: ${r.failure}` : ''} → ${out}`)
  if (r.failure) process.exit(1)
}
