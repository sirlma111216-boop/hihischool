import { lazy, Suspense, useEffect, useRef } from 'react'
import { useEvidence, useWorkspace } from '../lib/store'
import { useAsync } from '../lib/hooks'
import { apiGet } from '../lib/api'
import { Button, ErrorBox, Icon, Skeleton, SyntheticBadge } from './ui'
import { DOCUMENT_TYPE_LABEL, type Evidence, type SourceDocument } from '@shared/types'
import { formatDateKo } from '@shared/format'

const PdfViewer = lazy(() => import('./PdfViewer'))

const REVIEW_LABEL: Record<string, string> = { draft: '초안', in_review: '검토 중', approved: '검토 완료', rejected: '반려', superseded: '대체됨' }
const METHOD_LABEL: Record<string, string> = { pdf_text: 'PDF 텍스트', pdf_table: 'PDF 표', ocr: 'OCR (스캔)', hwpx: 'HWPX 구조', xlsx: 'XLSX', manual: '수동 입력', api: 'API', unknown: '미상' }

export function EvidenceDrawer() {
  const { evidenceId, close } = useEvidence()
  const { state } = useWorkspace()
  const r = useAsync(() => apiGet<{ evidence: Evidence; document: SourceDocument }>(`/api/evidence/${encodeURIComponent(evidenceId!)}`), evidenceId ?? '', Boolean(evidenceId))
  const headRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    headRef.current?.focus()
  }, [evidenceId])
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') doClose()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.evidenceReturnFocus])
  const doClose = () => {
    close()
    // 닫힌 후 원래 셀/버튼으로 포커스 복원, 스크롤은 그대로.
    const id = state.evidenceReturnFocus
    if (id) requestAnimationFrame(() => document.getElementById(id)?.focus())
  }
  const ev = r.data?.evidence
  const doc = r.data?.document
  const pdfUrl = doc?.officialUrl && /\.pdf($|\?)/i.test(doc.officialUrl) ? doc.officialUrl : null
  return (
    <aside className="drawer" aria-label="원문 근거" role="complementary">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div className="eyebrow">EVIDENCE · 원문 근거</div>
        <Button variant="quiet" size="sm" onClick={doClose} aria-label="근거 서랍 닫기"><Icon.x /></Button>
      </div>
      <h3 ref={headRef} tabIndex={-1} style={{ marginTop: 8 }}>{doc?.title ?? '근거'}</h3>
      {r.loading && <Skeleton lines={5} />}
      {r.error && <ErrorBox error={r.error} retry={r.reload} />}
      {ev && doc && (
        <>
          {doc.isSynthetic && <p><SyntheticBadge /></p>}
          <div className="paper">
            <strong>{DOCUMENT_TYPE_LABEL[doc.documentType]}</strong>
            {ev.excerpt && <div className="quote">{ev.excerpt}</div>}
            <div className="source">
              위치:{' '}
              {ev.pdfPageIndex !== null ? <>PDF {ev.pdfPageIndex + 1}쪽{ev.printedPageLabel ? ` (인쇄 쪽수 ${ev.printedPageLabel})` : ' (인쇄 쪽수 미확인)'}</> : ev.printedPageLabel ? `인쇄 쪽수 ${ev.printedPageLabel}` : '쪽 미확인'}
              {ev.tableId ? ` · 표 ${ev.tableId}` : ''}
              {ev.rowIndex !== null ? ` · 행 ${ev.rowIndex}` : ''}
              {ev.columnIndex !== null ? ` · 열 ${ev.columnIndex}` : ''}
              {ev.paragraphAnchor ? ` · ${ev.paragraphAnchor}` : ''}
            </div>
            <div className="source">{ev.boundingBox ? '추출 시 보관한 좌표로 셀 위치를 강조합니다.' : '정확한 좌표가 없어 페이지/문단 위치만 안내합니다 (하이라이트 없음).'}</div>
          </div>
          <dl>
            <dt>발행기관</dt><dd>{doc.publisher}</dd>
            <dt>게시일</dt><dd>{doc.publishedAt ? formatDateKo(doc.publishedAt) : '미확인'}</dd>
            <dt>적용 학년도</dt><dd>{doc.applicableAcademicYear ?? '미확인'}</dd>
            <dt>대상 입학연도</dt><dd>{doc.cohortYear ?? '해당 없음'}</dd>
            <dt>개정 교육과정</dt><dd>{doc.curriculumRevision ? `${doc.curriculumRevision} 개정` : '미확인'}</dd>
            <dt>수집일</dt><dd>{doc.retrievedAt ? formatDateKo(doc.retrievedAt) : '미수집'}</dd>
            <dt>검토 상태</dt><dd>{REVIEW_LABEL[doc.reviewStatus] ?? doc.reviewStatus}{ev.reviewedBy ? ` · ${ev.reviewedBy}` : ' · 근거 검토자 없음'}</dd>
            <dt>추출 방법</dt><dd>{METHOD_LABEL[ev.extractionMethod] ?? ev.extractionMethod}</dd>
            <dt>문서 버전</dt><dd>v{doc.version}{doc.supersedesId ? ' (이전 버전 대체)' : ''}</dd>
            <dt>원문</dt>
            <dd>
              {doc.officialUrl ? (
                <a href={doc.officialUrl} target="_blank" rel="noreferrer noopener">공식 원문 열기 ↗</a>
              ) : (
                <span className="muted">{doc.rights === 'restricted' ? '재배포 권한 없음 — 제목·위치만 제공' : '원문 링크 미등록'}</span>
              )}
            </dd>
          </dl>
          {pdfUrl && (
            <Suspense fallback={<Skeleton lines={4} />}>
              <PdfViewer url={pdfUrl} pageIndex={ev.pdfPageIndex ?? 0} bbox={ev.boundingBox} />
            </Suspense>
          )}
          <p className="source">이 패널을 열어도 현재 표의 스크롤과 선택은 유지됩니다. Esc 로 닫으면 원래 위치로 포커스가 돌아갑니다.</p>
        </>
      )}
    </aside>
  )
}
