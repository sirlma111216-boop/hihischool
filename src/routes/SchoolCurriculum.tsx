import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWorkspace } from '../lib/store'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiGet, apiPost } from '../lib/api'
import type { ProfileResponse } from '../lib/types'
import { Button, Empty, ErrorBox, Interpretation, Skeleton, SyntheticBadge, Tone } from '../components/ui'
import { CurriculumMatrix, SelectionGroupList, type MatrixView } from '../components/CurriculumMatrix'
import { PlanVerdictPanel } from '../components/PlanVerdict'
import type { CurriculumBundle, CurriculumLookup, PlanValidationResult } from '@shared/types'
import { validatePlan } from '@shared/engine/selection'
import { summarizeCredits } from '@shared/engine/credits'
import { diffCurriculum } from '@shared/engine/diff'
import { formatDateKo } from '@shared/format'

const VIEWS: [MatrixView, string][] = [['matrix', '3년 6학기'], ['group', '교과군별'], ['interest', '관심 과목만'], ['requirement', '지정/선택'], ['selection', '선택군'], ['source', '원문 대조']]

export default function SchoolCurriculum() {
  const { id = '' } = useParams()
  const { state, dispatch } = useWorkspace()
  const [view, setView] = useState<MatrixView>('matrix')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [history, setHistory] = useState<Set<string>[]>([])
  const [refVersion, setRefVersion] = useState<string | null>(null)
  const [interestDraft, setInterestDraft] = useState(state.interestCourses.join(', '))
  const trackId = state.trackChoice[id] ?? null
  const prof = useAsync(() => apiGet<ProfileResponse>(`/api/schools/${encodeURIComponent(id)}`), id)
  const look = useAsync(() => apiGet<CurriculumLookup>(`/api/schools/${encodeURIComponent(id)}/curricula?cohortYear=${state.cohortYear}${trackId ? `&trackId=${encodeURIComponent(trackId)}` : ''}`), `${id}-${state.cohortYear}-${trackId ?? ''}`)
  const ref = useAsync(() => apiGet<CurriculumBundle>(`/api/versions/${encodeURIComponent(refVersion!)}`), refVersion ?? '', Boolean(refVersion))
  useDocumentTitle(`${prof.data?.school.officialName ?? '학교'} 교육과정`)
  const bundle = look.data?.bundle ?? null
  const nameOf = (oid: string) => bundle?.offerings.find((o) => o.id === oid)?.courseOriginalName ?? oid

  // 결정론적 규칙 엔진은 클라이언트에서도 같은 코드로 실행 (서버 /api/plans/validate 와 동일 로직)
  const result: PlanValidationResult | null = useMemo(() => (bundle ? validatePlan({ bundle, selectedOfferingIds: [...selected], targetCohortYear: state.cohortYear }) : null), [bundle, selected, state.cohortYear])
  const credits = useMemo(() => (bundle ? summarizeCredits(bundle, [...selected]) : null), [bundle, selected])
  const [serverCheck, setServerCheck] = useState<PlanValidationResult | null>(null)

  const toggle = (oid: string) => {
    setHistory((h) => [...h.slice(-30), new Set(selected)])
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(oid)) n.delete(oid)
      else n.add(oid)
      return n
    })
  }
  const undo = () => {
    const prev = history[history.length - 1]
    if (!prev) return
    setSelected(prev)
    setHistory((h) => h.slice(0, -1))
  }
  const highlightGroups = useMemo(() => {
    if (!bundle) return []
    const norm = (s: string) => s.replace(/\s+/g, '').toLowerCase()
    const names = new Set(state.interestCourses.map(norm))
    return bundle.selectionGroups.filter((g) => g.memberOfferingIds.some((mid) => names.has(norm(nameOf(mid))))).map((g) => g.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, state.interestCourses])

  if (prof.loading || look.loading) return <Skeleton lines={8} />
  if (prof.error) return <ErrorBox error={prof.error} retry={prof.reload} />
  if (look.error) return <ErrorBox error={look.error} retry={look.reload} />
  const s = prof.data!.school
  const l = look.data!
  const diff = ref.data && bundle ? diffCurriculum(ref.data, bundle) : null

  return (
    <>
      <div className="page-head">
        <div>
          <div className="eyebrow"><Link to={`/schools/${s.id}`}>{s.officialName}</Link> · 교육과정 {s.isSynthetic && <SyntheticBadge />}</div>
          <h1 style={{ marginTop: 4 }}>{state.cohortYear} 입학생 편제와 선택 조건</h1>
          <div className="sub">{l.message}{bundle ? ` · ${bundle.version.revision} 개정 · 검토 ${bundle.version.reviewedBy ?? '미확인'} ${bundle.version.reviewedAt ? formatDateKo(bundle.version.reviewedAt) : ''}` : ''}</div>
        </div>
      </div>

      {l.status === 'track_required' && (
        <div className="card">
          <h3>과정을 선택하세요</h3>
          <p>이 학교는 학과·과정별로 편제가 다릅니다. 학교명만으로 두 과정의 과목을 합치지 않습니다.</p>
          <div className="chips">{l.availableTracks.map((t) => <button key={t.id} type="button" className="chip" onClick={() => dispatch({ type: 'track.set', schoolId: s.id, trackId: t.id })}>{t.name}</button>)}</div>
        </div>
      )}
      {(l.status === 'cohort_not_available' || l.status === 'not_collected' || l.status === 'unreviewed_only') && (
        <Empty title={l.status === 'unreviewed_only' ? `${state.cohortYear} 입학생 자료는 검토 대기 중입니다` : `${state.cohortYear} 입학생 자료 미확인`} actions={<><Link className="btn secondary" to="/admin">자료 등록·검토</Link><Link className="btn quiet" to="/sources">자료 범위 확인</Link></>}>
          {l.status === 'unreviewed_only' ? '사람 검토·공개 전까지 비교와 경로 검토에 사용하지 않습니다.' : '다른 입학연도 자료는 아래 참고 패널에서만 열 수 있으며 비교·경로 검토에 자동 대체하지 않습니다.'}
        </Empty>
      )}

      {bundle && (
        <>
          <div className="toolbar">
            <div className="tabs" role="tablist" style={{ margin: 0, borderBottom: 0 }}>
              {VIEWS.map(([k, label]) => <button key={k} type="button" role="tab" aria-selected={view === k} className={view === k ? 'active' : ''} onClick={() => setView(k)}>{label}</button>)}
            </div>
            <form className="interest-form" onSubmit={(e) => { e.preventDefault(); dispatch({ type: 'interest.set', courses: interestDraft.split(/[,\n]/) }) }}>
              <label htmlFor="interest-in" className="sr-only">관심 과목 (쉼표 구분)</label>
              <input id="interest-in" className="input" placeholder="관심 과목, 쉼표로 구분" value={interestDraft} onChange={(e) => setInterestDraft(e.target.value)} />
              <Button type="submit" size="sm">관심 과목 적용</Button>
            </form>
          </div>

          <CurriculumMatrix bundle={bundle} interest={state.interestCourses} selected={selected} onToggle={toggle} view={view} highlightGroupIds={highlightGroups} />

          <div className="grid-2" style={{ marginTop: 16 }}>
            <div className="card">
              <h3>선택 조합 검토 <span className="muted small">(선택한 {selected.size}과목)</span></h3>
              <div className="toolbar">
                <Button size="sm" onClick={undo} disabled={history.length === 0}>되돌리기</Button>
                <Button size="sm" variant="quiet" onClick={() => { setHistory((h) => [...h, new Set(selected)]); setSelected(new Set()) }} disabled={selected.size === 0}>모두 해제</Button>
                <Button size="sm" variant="quiet" onClick={async () => setServerCheck(await apiPost<PlanValidationResult>('/api/plans/validate', { versionId: bundle.version.id, selectedOfferingIds: [...selected], targetCohortYear: state.cohortYear }))}>서버로 재검증</Button>
                <Link className="btn quiet sm" to="/planner">경로 화면에서 계속</Link>
              </div>
              {result && <PlanVerdictPanel result={result} nameOf={nameOf} onPickAlternative={(ids) => { setHistory((h) => [...h, new Set(selected)]); setSelected((cur) => { const n = new Set(cur); const g = result.alternatives.find((a) => a.offeringIds === ids); if (g) for (const mid of bundle.selectionGroups.find((x) => x.id === g.groupId)?.memberOfferingIds ?? []) n.delete(mid); for (const i of ids) n.add(i); return n }) }} />}
              {serverCheck && <p className="source">서버 재검증 결과: {serverCheck.verdict === result?.verdict ? '클라이언트와 일치' : `다름 (${serverCheck.verdict})`}</p>}
            </div>
            <div className="card">
              <h3>학점 합계</h3>
              {credits && (
                <dl className="brief kv" style={{ border: 0 }}>
                  <dt>학교 지정 (확인)</dt><dd className="num" style={{ textAlign: 'left' }}>{credits.designatedConfirmed}{credits.designatedUnknownCount ? ` + 미확인 ${credits.designatedUnknownCount}과목` : ''}</dd>
                  <dt>학생 선택 (선택함)</dt><dd>{credits.selectedConfirmed}{credits.selectedUnknownCount ? ` + 미확인 ${credits.selectedUnknownCount}과목` : ''}</dd>
                  <dt>단위</dt><dd>{credits.unit === 'credit' ? '학점 (2022 개정)' : credits.unit === 'unit' ? '단위 (2015 개정)' : '미확인'}{credits.mixedUnits ? ' · 혼재 경고' : ''}</dd>
                  <dt>졸업 요건</dt><dd>판정하지 않음 (해당 개정·시행 시점의 공식 기준을 별도 등록한 경우만)</dd>
                </dl>
              )}
              <p className="source">{credits?.note}</p>
            </div>
          </div>

          <section style={{ marginTop: 16 }}>
            <h2>선택군과 규칙</h2>
            <SelectionGroupList groups={bundle.selectionGroups} offerings={bundle.offerings} highlight={highlightGroups} />
            <Interpretation>같은 학기라는 이유만으로 충돌로 보지 않고, 선택군 규칙이 있을 때만 충돌로 판정합니다. 원문에 없는 선수 조건은 만들지 않습니다.</Interpretation>
          </section>
        </>
      )}

      {l.referenceOnly.length > 0 && (
        <details className="details" style={{ marginTop: 16 }}>
          <summary>참고 패널 — 다른 입학연도 공개 자료 ({l.referenceOnly.length}) · 비교·경로 검토에 자동 사용하지 않음</summary>
          <div className="body">
            <div className="chips">
              {l.referenceOnly.map((r) => <button key={r.versionId} type="button" className={`chip ${refVersion === r.versionId ? 'active' : ''}`} onClick={() => setRefVersion(refVersion === r.versionId ? null : r.versionId)}>{r.cohortYear} 입학생{r.trackId ? ` · ${s.tracks.find((t) => t.id === r.trackId)?.name ?? '과정'}` : ''}</button>)}
            </div>
            {ref.loading && <Skeleton />}
            {ref.data && (
              <>
                <div className="hint warn">아래는 <strong>{ref.data.version.cohortYear} 입학생</strong> 자료입니다. {state.cohortYear} 입학생의 경로 검증에는 쓰지 않습니다.</div>
                <CurriculumMatrix bundle={ref.data} interest={state.interestCourses} selected={new Set()} view="matrix" />
                {diff && (
                  <div className="card" style={{ marginTop: 10 }}>
                    <h3>변경 이력 비교</h3>
                    {!diff.comparable ? <p className="muted">{diff.reason} 동일 집단의 변경으로 보여주지 않습니다.</p> : diff.changes.length === 0 ? <p>차이 없음</p> : (
                      <ul>{diff.changes.map((c, i) => <li key={i}>{c.substantive ? <Tone tone="warn">실질 변경</Tone> : <Tone tone="unknown">표기 수정</Tone>} {c.course}: {c.before ?? '—'} → {c.after ?? '—'}</li>)}</ul>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </details>
      )}
    </>
  )
}
