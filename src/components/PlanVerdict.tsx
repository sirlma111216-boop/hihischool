import type { PlanValidationResult } from '@shared/types'
import { PLAN_VERDICT_LABEL } from '@shared/types'
import { EvidenceButton, Tone } from './ui'
import { useEvidence } from '../lib/store'

export function PlanVerdictPanel({ result, nameOf, onPickAlternative }: { result: PlanValidationResult; nameOf: (id: string) => string; onPickAlternative?: (ids: string[]) => void }) {
  const { open } = useEvidence()
  const tone = result.verdict === 'no_conflict_within_verified_rules' ? 'ok' : result.verdict === 'conflicts_with_verified_rules' ? 'bad' : 'unknown'
  return (
    <div className={`hint ${tone === 'bad' ? 'bad' : tone === 'unknown' ? 'warn' : ''}`} role="status" aria-live="polite">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Tone tone={tone}>{result.verdict === 'no_conflict_within_verified_rules' ? '모순 없음' : result.verdict === 'conflicts_with_verified_rules' ? '규칙 충돌' : '판단 보류'}</Tone>
        <strong>{PLAN_VERDICT_LABEL[result.verdict]}</strong>
      </div>
      {result.violations.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {result.violations.map((v, i) => (
            <li key={i}>
              {v.message} <span className="muted small">— 규칙: {v.rule} ({v.periodRange})</span> <EvidenceButton ids={v.evidenceIds} onOpen={open} />
            </li>
          ))}
        </ul>
      )}
      {result.unknowns.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
          {result.unknowns.map((u, i) => (
            <li key={i}>
              {u.message} <span className="muted small">→ 학교에 확인할 질문: {u.question}</span>
            </li>
          ))}
        </ul>
      )}
      {result.alternatives.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div className="small"><strong>근거 안에서 가능한 다른 조합</strong></div>
          <div className="chips" style={{ marginTop: 4 }}>
            {result.alternatives.map((a, i) => (
              <button key={i} type="button" className="chip" onClick={() => onPickAlternative?.(a.offeringIds)} title={a.description}>
                {a.groupLabel}: {a.offeringIds.map(nameOf).join(' + ')}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="small" style={{ marginTop: 8 }}>
        학점: 지정 {result.credits.designatedConfirmed}{result.credits.designatedUnknownCount ? ` (+미확인 ${result.credits.designatedUnknownCount}개)` : ''} · 선택 {result.credits.selectedConfirmed}{result.credits.selectedUnknownCount ? ` (+미확인 ${result.credits.selectedUnknownCount}개)` : ''}
        {result.credits.mixedUnits ? ' · 단위/학점 혼재' : ''} · 졸업 요건 판정 안 함
      </div>
      <div className="source" style={{ marginTop: 4 }}>{result.disclaimer}</div>
    </div>
  )
}
