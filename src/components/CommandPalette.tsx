import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../lib/store'

const COMMANDS = [
  { label: '학교 찾기', to: '/schools', hint: '검색·필터·지도' },
  { label: '학교 비교', to: '/compare', hint: '최대 4개교' },
  { label: '배움 경로 검토', to: '/planner', hint: '관심 과목 조합' },
  { label: '상담 워크스페이스', to: '/counsel', hint: '별칭·선호·질문' },
  { label: '상담 브리핑', to: '/briefing', hint: '인쇄·PDF·CSV·JSON' },
  { label: '출처·자료 범위', to: '/sources', hint: '갱신 상태' },
  { label: '자료 관리 (관리자)', to: '/admin', hint: '보호된 영역' },
  { label: '홈', to: '/', hint: '' },
]

export function CommandPalette({ onClose }: { onClose: () => void }) {
  const nav = useNavigate()
  const { dispatch } = useWorkspace()
  const [q, setQ] = useState('')
  const [idx, setIdx] = useState(0)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => ref.current?.focus(), [])
  const items = useMemo(() => {
    type Item = { label: string; to: string; hint: string; action?: () => void }
    const base: Item[] = COMMANDS.filter((c) => c.label.includes(q) || c.hint.includes(q))
    const extra: Item[] = []
    const y = q.match(/^(20\d\d)/)
    if (y) extra.push({ label: `대상 입학연도를 ${y[1]} 로 설정`, to: '', hint: '상단 선택과 동일', action: () => dispatch({ type: 'cohort', year: Number(y[1]) }) })
    if (q.trim() && !y) extra.push({ label: `"${q}" 로 학교 검색`, to: `/schools?q=${encodeURIComponent(q)}`, hint: '초성·별칭·자치구·과목' })
    return [...extra, ...base]
  }, [q, dispatch])
  const run = (i: number) => {
    const it = items[i]
    if (!it) return
    if (it.action) it.action()
    else nav(it.to)
    onClose()
  }
  return (
    <div className="cmdk" role="dialog" aria-modal="true" aria-label="명령 팔레트" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            setIdx(0)
          }}
          placeholder="이동하거나 검색… (Esc 로 닫기)"
          aria-label="명령 입력"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'ArrowDown') setIdx((i) => Math.min(items.length - 1, i + 1))
            if (e.key === 'ArrowUp') setIdx((i) => Math.max(0, i - 1))
            if (e.key === 'Enter') run(idx)
          }}
        />
        <ul role="listbox">
          {items.map((it, i) => (
            <li key={it.label} role="option" aria-selected={i === idx}>
              <button type="button" className={i === idx ? 'active' : ''} onClick={() => run(i)}>
                <span>{it.label}</span>
                <span className="muted small">{it.hint}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="source" style={{ padding: '8px 14px', borderTop: '1px solid var(--line)' }}>
          바로가기: <span className="kbd">/</span> 검색 · <span className="kbd">Ctrl K</span> 팔레트 · <span className="kbd">Esc</span> 근거 서랍 닫기
        </div>
      </div>
    </div>
  )
}
