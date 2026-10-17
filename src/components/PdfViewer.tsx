/**
 * PDF.js 로 접근 가능한 PDF 를 열고, 추출 시 보관한 좌표가 있을 때만 셀을 강조한다.
 * 좌표가 없으면 페이지만 연다. HWP 파서로 쓰지 않는다. 취소·진행 상태를 제공한다.
 */
import { useEffect, useRef, useState } from 'react'
import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { Button } from './ui'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

type BBox = { x: number; y: number; width: number; height: number; pageWidth: number; pageHeight: number } | null

export default function PdfViewer({ url, pageIndex, bbox }: { url: string; pageIndex: number; bbox: BBox }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'cancelled'>('loading')
  const [msg, setMsg] = useState('')
  const [pages, setPages] = useState(0)
  const [page, setPage] = useState(pageIndex + 1)
  const cancelRef = useRef(false)
  const docRef = useRef<pdfjs.PDFDocumentProxy | null>(null)

  useEffect(() => {
    cancelRef.current = false
    setState('loading')
    const task = pdfjs.getDocument({ url, withCredentials: false })
    task.promise
      .then(async (doc) => {
        if (cancelRef.current) return
        docRef.current = doc
        setPages(doc.numPages)
        await render(doc, pageIndex + 1)
        setState('ready')
      })
      .catch((e: unknown) => {
        setState('error')
        setMsg(e instanceof Error ? e.message : '원문을 열 수 없습니다 (접근 차단 또는 CORS).')
      })
    return () => {
      cancelRef.current = true
      task.destroy().catch(() => undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, pageIndex])

  async function render(doc: pdfjs.PDFDocumentProxy, p: number) {
    const pg = await doc.getPage(p)
    const canvas = canvasRef.current
    if (!canvas) return
    const scale = Math.min(1.4, (canvas.parentElement?.clientWidth ?? 380) / pg.getViewport({ scale: 1 }).width)
    const vp = pg.getViewport({ scale })
    canvas.width = vp.width
    canvas.height = vp.height
    const ctx = canvas.getContext('2d')!
    await pg.render({ canvasContext: ctx, viewport: vp, canvas }).promise
    if (bbox && p === pageIndex + 1) {
      // 좌표는 PDF 좌표계(원점 좌하단) 기준. 페이지 크기 비율로 변환한다.
      const sx = vp.width / bbox.pageWidth
      const sy = vp.height / bbox.pageHeight
      ctx.save()
      ctx.strokeStyle = '#244E48'
      ctx.lineWidth = 2
      ctx.fillStyle = 'rgba(36,78,72,0.15)'
      const x = bbox.x * sx
      const y = vp.height - (bbox.y + bbox.height) * sy
      ctx.fillRect(x, y, bbox.width * sx, bbox.height * sy)
      ctx.strokeRect(x, y, bbox.width * sx, bbox.height * sy)
      ctx.restore()
    }
  }

  const go = async (p: number) => {
    if (!docRef.current || p < 1 || p > pages) return
    setPage(p)
    await render(docRef.current, p)
  }

  return (
    <div className="paper" style={{ padding: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span className="source">PDF 보기 {state === 'loading' ? '· 불러오는 중' : pages ? `· ${page}/${pages}쪽 (PDF 배열 기준)` : ''}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          {state === 'loading' && (
            <Button size="sm" variant="quiet" onClick={() => { cancelRef.current = true; setState('cancelled') }}>취소</Button>
          )}
          {state === 'ready' && (
            <>
              <Button size="sm" variant="quiet" onClick={() => go(page - 1)} disabled={page <= 1} aria-label="이전 쪽">‹</Button>
              <Button size="sm" variant="quiet" onClick={() => go(page + 1)} disabled={page >= pages} aria-label="다음 쪽">›</Button>
            </>
          )}
        </div>
      </div>
      {state === 'error' && <div className="hint warn">PDF 를 직접 열지 못했습니다: {msg} — 위의 공식 원문 링크에서 확인하세요.</div>}
      {state === 'cancelled' && <div className="hint">불러오기를 취소했습니다. 다시 열려면 근거 버튼을 다시 누르세요.</div>}
      <canvas ref={canvasRef} style={{ width: '100%', display: state === 'ready' ? 'block' : 'none', border: '1px solid var(--line)' }} aria-label="원문 페이지" />
    </div>
  )
}
