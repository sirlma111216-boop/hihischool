import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { DATA_STATUS_LABEL, type DataStatus } from '@shared/types'

/* ---------- 아이콘 (일관된 SVG) ---------- */
export const Icon = {
  search: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
  ),
  school: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M5 21V8l7-4 7 4v13M9 21v-6h6v6" /></svg>
  ),
  compare: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></svg>
  ),
  path: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 19c4-8 8-8 16-14M4 5h4v4" /></svg>
  ),
  counsel: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" /></svg>
  ),
  brief: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7" /></svg>
  ),
  source: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 4h16v16H4zM8 9h8M8 13h8M8 17h5" /></svg>
  ),
  admin: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="1" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
  ),
  evidence: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 4h10l4 4v12H5z" /><path d="M9 13h6M9 17h6" /></svg>
  ),
  check: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
  ),
  warn: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3 2 20h20zM12 9v5M12 17h.01" /></svg>
  ),
  x: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
  ),
  question: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01" /></svg>
  ),
  map: (p: { className?: string }) => (
    <svg className={p.className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14" /></svg>
  ),
}

/* ---------- 버튼 ---------- */
type Variant = 'primary' | 'secondary' | 'quiet' | 'destructive'
export function Button({ variant = 'secondary', size, loading, children, className = '', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'lg'; loading?: boolean }) {
  return (
    <button type="button" {...rest} className={`btn ${variant} ${size ?? ''} ${loading ? 'loading' : ''} ${className}`} disabled={rest.disabled || loading} aria-busy={loading || undefined}>
      {children}
    </button>
  )
}

/* ---------- 상태 배지 ---------- */
const TONE: Record<DataStatus, 'ok' | 'warn' | 'bad' | 'unknown' | 'info'> = {
  confirmed: 'ok',
  no_data: 'unknown',
  not_collected: 'unknown',
  unreviewed: 'warn',
  access_failed: 'bad',
  confirmed_absent: 'info',
  not_applicable: 'unknown',
  conflict: 'warn',
}
export function StatusBadge({ status, label }: { status: DataStatus; label?: string }) {
  const tone = TONE[status]
  const I = tone === 'ok' ? Icon.check : tone === 'bad' || tone === 'warn' ? Icon.warn : Icon.question
  return (
    <span className={`status ${tone}`}>
      <I />
      {label ?? DATA_STATUS_LABEL[status]}
    </span>
  )
}
export function Tone({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'unknown' | 'info'; children: ReactNode }) {
  const I = tone === 'ok' ? Icon.check : tone === 'bad' || tone === 'warn' ? Icon.warn : Icon.question
  return (
    <span className={`status ${tone}`}>
      <I />
      {children}
    </span>
  )
}

export function SyntheticBadge() {
  return <span className="synthetic-badge" title="실제 학교·과목·규칙과 무관한 기능 검증용 가상 자료입니다.">기능 검증용 가상 자료</span>
}

/* ---------- 근거 버튼 ---------- */
export function EvidenceButton({ ids, onOpen, label = '근거' }: { ids: string[]; onOpen: (id: string, returnFocus: string | null) => void; label?: string }) {
  if (!ids || ids.length === 0) return <span className="source">근거 없음</span>
  const btnId = `ev-btn-${ids[0]}-${Math.random().toString(36).slice(2, 6)}`
  return (
    <button type="button" id={btnId} className="evidence-btn" onClick={() => onOpen(ids[0]!, btnId)} aria-label={`${label} 열기 (${ids.length}건)`}>
      <Icon.evidence /> {label}
      {ids.length > 1 ? ` ${ids.length}` : ''}
    </button>
  )
}

/* ---------- 빈 화면·오류 ---------- */
export function Empty({ title, children, actions }: { title: string; children?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty" role="status">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {actions && <div className="actions">{actions}</div>}
    </div>
  )
}

export function ErrorBox({ error, retry }: { error: Error; retry?: () => void }) {
  return (
    <div className="hint bad" role="alert">
      <strong>불러오지 못했습니다.</strong> {error.message}
      {retry && (
        <>
          {' '}
          <Button variant="quiet" size="sm" onClick={retry}>다시 시도</Button>
        </>
      )}
    </div>
  )
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-busy="true" aria-label="불러오는 중">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton" style={{ marginBottom: 10, width: `${90 - i * 12}%` }} />
      ))}
    </div>
  )
}

export function Interpretation({ children }: { children: ReactNode }) {
  return <div className="interpretation"><strong>해석 · </strong>{children}</div>
}
