import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWorkspace } from '../lib/store'
import { apiGet } from '../lib/api'
import { MAX_COMPARE_SCHOOLS } from '@shared/constants'

const nameCache = new Map<string, string>()

export function CompareBar() {
  const { state, dispatch } = useWorkspace()
  const nav = useNavigate()
  const [names, setNames] = useState<Record<string, string>>({})
  useEffect(() => {
    let alive = true
    const missing = state.compare.filter((id) => !nameCache.has(id))
    Promise.all(
      missing.map((id) =>
        apiGet<{ school: { officialName: string } }>(`/api/schools/${encodeURIComponent(id)}`)
          .then((d) => nameCache.set(id, d.school.officialName))
          .catch(() => nameCache.set(id, id)),
      ),
    ).then(() => {
      if (alive) setNames(Object.fromEntries(state.compare.map((id) => [id, nameCache.get(id) ?? id])))
    })
    return () => {
      alive = false
    }
  }, [state.compare])
  if (state.compare.length === 0) return null
  return (
    <div className="compare-bar" role="region" aria-label="비교 바구니">
      <span className="lbl">비교 {state.compare.length}/{MAX_COMPARE_SCHOOLS}</span>
      <div className="chips">
        {state.compare.map((id) => (
          <span key={id} className="chip">
            {names[id] ?? '…'}
            <button type="button" onClick={() => dispatch({ type: 'compare.remove', id })} aria-label={`${names[id] ?? id} 비교에서 제거`}>×</button>
          </span>
        ))}
      </div>
      <button type="button" className="btn secondary sm" onClick={() => dispatch({ type: 'compare.set', ids: [] })}>비우기</button>
      <button type="button" className="btn primary sm" onClick={() => nav('/compare')} disabled={state.compare.length < 2}>비교 보기</button>
    </div>
  )
}
