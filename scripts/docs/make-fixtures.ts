/**
 * 문서 분석 검증용 가상 fixture 생성 (PDF / HWPX / XLSX).
 * - PDF: 표지·목차 뒤에 편제표가 있어 PDF 배열 페이지와 인쇄 쪽수가 다르다. 표는 두 쪽에 걸치며 머리글이 반복되고 각주가 다음 쪽에 있다.
 * - HWPX: 학과별 표 2개 (병합 셀 포함).
 * - XLSX: 병합 셀이 있는 편제표.
 * 모든 내용은 가상이다. 기대값(tests/fixtures/expected/*.json)은 이 스크립트가 아니라 사람이 작성한다.
 */
import { mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'
import JSZip from 'jszip'
import ExcelJS from 'exceljs'

const root = path.resolve(import.meta.dirname, '../..')
const outDir = path.join(root, 'tests/fixtures')
mkdirSync(outDir, { recursive: true })

async function makePdf() {
  const pdf = await PDFDocument.create()
  pdf.registerFontkit(fontkit)
  const fontBytes = readFileSync(path.join(root, 'node_modules/pretendard/dist/public/static/alternative/Pretendard-Regular.ttf'))
  const font = await pdf.embedFont(fontBytes, { subset: true })
  const W = 595
  const H = 842
  const text = (page: ReturnType<typeof pdf.addPage>, s: string, x: number, y: number, size = 11) => page.drawText(s, { x, y, size, font, color: rgb(0.09, 0.18, 0.2) })

  // 0: 표지 (인쇄 쪽수 없음)
  const p0 = pdf.addPage([W, H])
  text(p0, '가상 학교 A', 60, 700, 24)
  text(p0, '2027학년도 입학생 교육과정 편제표 (기능 검증용 가상 자료)', 60, 660, 14)
  text(p0, '이 문서는 실제 학교와 무관한 가상 fixture 입니다.', 60, 630, 11)
  // 1: 목차 (인쇄 쪽수 없음)
  const p1 = pdf.addPage([W, H])
  text(p1, '목차', 60, 760, 16)
  text(p1, '1. 편성 개요 ........ 1', 60, 720)
  text(p1, '2. 1학년 편제 ........ 2', 60, 700)
  text(p1, '3. 2학년 편제 ........ 3', 60, 680)
  text(p1, '4. 3학년 편제 ........ 4', 60, 660)
  // 2: 인쇄 1쪽
  const p2 = pdf.addPage([W, H])
  text(p2, '1. 편성 개요', 60, 760, 14)
  text(p2, '2022 개정 교육과정을 적용하며 학점 단위로 편성한다.', 60, 730)
  text(p2, '- 1 -', W / 2 - 12, 40, 10)

  const cols = [60, 220, 300, 380, 460]
  const headers = ['과목', '1학기', '2학기', '구분', '비고']
  const drawHeader = (page: ReturnType<typeof pdf.addPage>, y: number) => {
    page.drawRectangle({ x: 56, y: y - 6, width: 484, height: 22, color: rgb(0.95, 0.96, 0.94) })
    headers.forEach((h, i) => text(page, h, cols[i]!, y, 11))
  }
  const drawRow = (page: ReturnType<typeof pdf.addPage>, y: number, cells: string[]) => cells.forEach((c, i) => text(page, c, cols[i]!, y, 11))

  // 3: 인쇄 2쪽 — 표 T1 (1학년)
  const p3 = pdf.addPage([W, H])
  text(p3, '2. 1학년 편제 (표 T1)', 60, 790, 14)
  let y = 756
  drawHeader(p3, y)
  const t1 = [
    ['공통국어1', '4', '', '지정', ''],
    ['공통국어2', '', '4', '지정', ''],
    ['공통수학1', '4', '', '지정', ''],
    ['공통수학2', '', '4', '지정', ''],
    ['공통영어1', '4', '', '지정', ''],
    ['공통영어2', '', '4', '지정', ''],
    ['정보', '', '3', '지정', ''],
    ['과목 N', '', '', '지정', '학점 공란'],
  ]
  for (const r of t1) {
    y -= 24
    drawRow(p3, y, r)
  }
  text(p3, '- 2 -', W / 2 - 12, 40, 10)

  // 4: 인쇄 3쪽 — 표 T2 (2학년) 두 쪽에 걸침: 머리글 반복, 각주는 다음 쪽
  const p4 = pdf.addPage([W, H])
  text(p4, '3. 2학년 편제 (표 T2)', 60, 790, 14)
  y = 756
  drawHeader(p4, y)
  const t2a = [
    ['문학', '4', '', '지정', ''],
    ['대수', '4', '', '지정', ''],
    ['과목 A', '3', '', '선택', '[G]'],
    ['과목 B', '3', '', '선택', '[G]'],
    ['과목 C', '3', '', '선택', '[G]'],
    ['과목 D', '3', '', '선택', '[H]'],
    ['과목 E', '', '3', '선택', '[H]'],
  ]
  for (const r of t2a) {
    y -= 24
    drawRow(p4, y, r)
  }
  text(p4, '(다음 쪽에 계속)', 400, y - 30, 9)
  text(p4, '- 3 -', W / 2 - 12, 40, 10)

  const p5 = pdf.addPage([W, H])
  text(p5, '3. 2학년 편제 (표 T2, 계속)', 60, 790, 14)
  y = 756
  drawHeader(p5, y) // 반복 머리글
  const t2b = [
    ['과목 F', '3', '3', '선택', '[X] 1·2학기 교차 편성'],
    ['과목 G', '3', '', '선택', '[X]'],
  ]
  for (const r of t2b) {
    y -= 24
    drawRow(p5, y, r)
  }
  y -= 40
  text(p5, '※ 선택군 G: 과목 A / B / C 중 1과목 선택', 60, y, 10)
  text(p5, '※ 선택군 H: 2학년 전체에서 과목 D 또는 과목 E 중 1과목', 60, y - 16, 10)
  text(p5, '※ 선택군 X: 과목 F 또는 과목 G 중 1과목 (최대 3학점). 과목 F 는 1·2학기 교차 편성(한 학기만 이수)', 60, y - 32, 10)
  text(p5, '- 4 -', W / 2 - 12, 40, 10)

  // 6: 인쇄 5쪽 — 표 T3 (3학년)
  const p6 = pdf.addPage([W, H])
  text(p6, '4. 3학년 편제 (표 T3)', 60, 790, 14)
  y = 756
  drawHeader(p6, y)
  const t3 = [
    ['과목 P', '4', '', '선택', '[K]'],
    ['과목 Q', '4', '', '선택', '[K]'],
    ['과목 R', '4', '', '선택', '[K]'],
    ['인공지능 기초', '', '4', '선택', '[K2]'],
    ['데이터 과학', '', '4', '선택', '[K2]'],
  ]
  for (const r of t3) {
    y -= 24
    drawRow(p6, y, r)
  }
  y -= 40
  text(p6, '※ 선택군 K: 3과목 중 1과목', 60, y, 10)
  text(p6, '※ 선택군 K2: 인공지능 기초 / 데이터 과학 중 1~2과목', 60, y - 16, 10)
  text(p6, '- 5 -', W / 2 - 12, 40, 10)

  // 인쇄 쪽수 라벨 (PDF 페이지 라벨): 표지·목차는 로마자, 본문은 1부터
  // pdf-lib 은 PageLabels 를 직접 지원하지 않으므로 catalog 에 기록한다.
  const { PDFName, PDFArray, PDFNumber, PDFDict, PDFString } = await import('pdf-lib')
  const nums = PDFArray.withContext(pdf.context)
  nums.push(PDFNumber.of(0))
  const d0 = PDFDict.withContext(pdf.context)
  d0.set(PDFName.of('S'), PDFName.of('r'))
  nums.push(d0)
  nums.push(PDFNumber.of(2))
  const d1 = PDFDict.withContext(pdf.context)
  d1.set(PDFName.of('S'), PDFName.of('D'))
  d1.set(PDFName.of('St'), PDFNumber.of(1))
  d1.set(PDFName.of('P'), PDFString.of(''))
  nums.push(d1)
  const labels = PDFDict.withContext(pdf.context)
  labels.set(PDFName.of('Nums'), nums)
  pdf.catalog.set(PDFName.of('PageLabels'), labels)

  const bytes = await pdf.save()
  const out = path.join(outDir, 'syn-a-2027-table.pdf')
  writeFileSync(out, bytes)
  mkdirSync(path.join(root, 'public/fixtures'), { recursive: true })
  copyFileSync(out, path.join(root, 'public/fixtures/syn-a-2027-table.pdf'))
  console.log('PDF fixture:', path.relative(root, out), bytes.byteLength, 'bytes')
}

async function makeHwpx() {
  // 최소 HWPX 구조: mimetype, Contents/content.hpf, Contents/section0.xml
  const zip = new JSZip()
  zip.file('mimetype', 'application/hwp+zip')
  zip.file('Contents/content.hpf', `<?xml version="1.0" encoding="UTF-8"?><opf:package xmlns:opf="http://www.idpf.org/2007/opf/"><opf:manifest><opf:item id="section0" href="Contents/section0.xml" media-type="application/xml"/></opf:manifest></opf:package>`)
  const cell = (t: string, extra = '') => `<hp:tc${extra}><hp:subList><hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p></hp:subList></hp:tc>`
  const row = (cells: string) => `<hp:tr>${cells}</hp:tr>`
  const table = (id: string, rows: string) => `<hp:tbl id="${id}" rowCnt="4" colCnt="4">${rows}</hp:tbl>`
  const para = (t: string) => `<hp:p><hp:run><hp:t>${t}</hp:t></hp:run></hp:p>`
  const section = `<?xml version="1.0" encoding="UTF-8"?><hs:sec xmlns:hs="http://www.hancom.co.kr/hwpml/2011/section" xmlns:hp="http://www.hancom.co.kr/hwpml/2011/paragraph">
${para('가상 특성화 학교 C 2026학년도 입학생 학과별 편제표 (가상)')}
${para('[정보보안과]')}
${table('tbl1', row(cell('과목') + cell('1학기') + cell('2학기') + cell('구분')) + row(cell('정보 보호') + cell('3') + cell('') + cell('지정')) + row(cell('과목 A') + cell('3') + cell('') + cell('선택 [G]')) + row(cell('과목 B') + cell('3') + cell('') + cell('선택 [G]')))}
${para('※ 선택군 G: 2과목 중 1과목')}
${para('[디자인과]')}
${table('tbl2', row(cell('과목') + cell('1학기') + cell('2학기') + cell('구분')) + row(cell('디자인 일반') + cell('3', ' colSpan="2"') + cell('지정')) + row(cell('과목 A') + cell('3') + cell('') + cell('선택 [G]')) + row(cell('과목 B') + cell('3') + cell('') + cell('선택 [G]')))}
${para('※ 선택군 G: 2과목 모두 이수')}
</hs:sec>`
  zip.file('Contents/section0.xml', section)
  const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  const out = path.join(outDir, 'syn-c-2026-table.hwpx')
  writeFileSync(out, bytes)
  console.log('HWPX fixture:', path.relative(root, out), bytes.byteLength, 'bytes')
}

async function makeXlsx() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('편제표')
  ws.addRow(['가상 학교 B 2027학년도 입학생 편제표 (가상)'])
  ws.mergeCells('A1:E1')
  ws.addRow(['교과(군)', '과목', '1학기', '2학기', '비고'])
  ws.addRow(['국어', '공통국어1', 4, '', '지정'])
  ws.addRow(['', '공통국어2', '', 4, '지정'])
  ws.mergeCells('A3:A4') // 교과군 병합
  ws.addRow(['가상 교과군', '과목 A', 3, '', '선택 [G]'])
  ws.addRow(['', '과목 B', 3, '', '선택 [G]'])
  ws.addRow(['', '과목 C', 3, '', '선택 [G]'])
  ws.mergeCells('A5:A7')
  ws.addRow(['※ 선택군 G: 과목 A / B / C 중 최대 2과목'])
  ws.mergeCells('A8:E8')
  const out = path.join(outDir, 'syn-b-2027-table.xlsx')
  await wb.xlsx.writeFile(out)
  console.log('XLSX fixture:', path.relative(root, out))
}

await makePdf()
await makeHwpx()
await makeXlsx()
