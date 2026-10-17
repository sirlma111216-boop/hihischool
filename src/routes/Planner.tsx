import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useWorkspace } from '../lib/store'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiGet } from '../lib/api'
import type { CurriculumLookup, PlanValidationResult } from '@shared/types'
import { Button, Empty, ErrorBox, Interpretation, Skeleton, Tone } from '../components/ui'
import { PlanVerdictPanel } from '../components/PlanVerdict'
import { buildPathSlots, matchWishes, searchFeasibleCombos } from '@shared/engine/planner'
import { validatePlan } from '@shared/engine/selection'
import { formatCredit } from '@shared/format'

/** 교사 작성 탐색 예시 — 검토된 공식 자료가 아니며 특정 전공 진학을 보장하는 필수 목록이 아니다. */
const INTEREST_EXAMPLES: { field: string; courses: string[] }[] = [
  { field: '정보·소프트웨어 (교사 작성 탐색 예시)', courses: ['정보', '인공지능 기초', '데이터 과학', '프로그래밍'] },
  { field: '자연·공학 (교사 작성 탐색 예시)', courses: ['물리학', '화학', '대수', '미적분'] },
]

export default function Planner() {
  useDocumentTitle('배움 경로 검토')
  const { state, dispatch } = useWorkspace()
  const [wishDraft, setWishDraft] = useState(state.interestCourses.join(', '))
  const [selections, setSelections] = useState<Record<string, string[]>>({})
  const [undo, setUndo] = useState<Record<string, string[][]>>({})
  const [searchOut, setSearchOut] = useState<Record<string, ReturnType<typeof searchFeasibleCombos>>>({})
  const schools = state.compare
  const key = JSON.stringify({ s: schools, y: state.cohortYear, t: state.trackChoice })
  const r = useAsync(
    async () => Promise.all(schools.map(async (id) => ({ id, lookup: await apiGet<CurriculumLookup>(`/api/schools/${encodeURIComponent(id)}/curricula?cohortYear=${state.cohortYear}${state.trackChoice[id] ? `&trackId=${encodeURIComponent(state.trackChoice[id]!)}` : ''}`), name: (await apiGet<{ school: { officialName: string } }>(`/api/schools/${encodeURIComponent(id)}`)).school.officialName }))),
    key,
    schools.length > 0,
  )
  const applyWishes = () => dispatch({ type: 'interest.set', courses: wishDraft.split(/[,\n]/) })

  const per = useMemo(() => {
    if (!r.data) return []
    return r.data.map(({ id, lookup, name }) => {
      const bundle = lookup.bundle
      if (!bundle) return { id, name, lookup, bundle: null, slots: [], wishes: [], result: null as PlanValidationResult | null, wishIds: [] as string[] }
      const wishes = matchWishes(bundle, state.interestCourses)
      const wishIds = wishes.flatMap((w) => w.offerings.filter((o) => o.requirementType !== 'school_designated').map((o) => o.id))
      const chosen = selections[id] ?? wishIds
      const result = validatePlan({ bundle, selectedOfferingIds: chosen, targetCohortYear: state.cohortYear })
      return { id, name, lookup, bundle, slots: buildPathSlots(bundle), wishes, result, wishIds, chosen }
    })
  }, [r.data, state.interestCourses, selections, state.cohortYear])

  const setSel = (id: string, ids: string[]) => {
    setUndo((u) => ({ ...u, [id]: [...(u[id] ?? []).slice(-20), selections[id] ?? []] }))
    setSelections((s) => ({ ...s, [id]: ids }))
  }

  if (schools.length === 0) return <Empty title="후보 학교를 먼저 담아 주세요" actions={<Link className="btn primary" to="/schools">학교 찾기</Link>}>같은 희망 과목 목록을 놓고 학교별 확인된 편제에 따른 3년 경로를 나란히 봅니다.</Empty>

  return (
    <>
      <div className="page-head">
        <div>
          <h1>3년 배움 경로 검토</h1>
          <div className="sub">{state.cohortYear} 입학생 기준 · 지정 과목은 고정, 선택군은 선택 슬롯, 확인되지 않은 학기는 빈 상태로 둡니다.</div>
        </div>
      </div>
      <div className="card">
        <h3>관심 분야와 듣고 싶은 과목</h3>
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); applyWishes() }}>
          <label htmlFor="wish" className="sr-only">희망 과목 (쉼표 구분)</label>
          <input id="wish" className="input" style={{ maxWidth: 520 }} value={wishDraft} onChange={(e) => setWishDraft(e.target.value)} placeholder="예: 정보, 인공지능 기초, 과목 A" />
          <Button variant="primary" type="submit">적용</Button>
        </form>
        <div className="chips">
          {INTEREST_EXAMPLES.map((ex) => (
            <button key={ex.field} type="button" className="chip" onClick={() => { setWishDraft(ex.courses.join(', ')); dispatch({ type: 'interest.set', courses: ex.courses }) }} title="교사 작성 탐색 예시이며 공식 권장 목록이 아닙니다">{ex.field}</button>
          ))}
        </div>
        <p className="source" style={{ marginTop: 8 }}>관심 분야→과목 안내는 교육청·교육과정의 검토된 자료에 근거하거나 '교사 작성 탐색 예시'로 구분합니다. 특정 전공 진학을 보장하는 필수 과목 목록을 만들지 않으며, 대학 권장 과목은 대학·전형·대입연도별 공식 자료를 따로 검토한 경우만 사용합니다.</p>
      </div>

      {r.loading && <Skeleton lines={8} />}
      {r.error && <ErrorBox error={r.error} retry={r.reload} />}
      <div className="grid-2" style={{ marginTop: 14, gridTemplateColumns: `repeat(${Math.min(per.length, 2)}, minmax(0, 1fr))` }}>
        {per.map((p) => (
          <section key={p.id} className="card" aria-labelledby={`pl-${p.id}`}>
            <h3 id={`pl-${p.id}`}><Link to={`/schools/${p.id}/curriculum`}>{p.name}</Link></h3>
            {!p.bundle ? (
              <div className="hint warn">{p.lookup.message} — 이 학교는 경로를 그리지 않습니다.</div>
            ) : (
              <>
                <ul style={{ paddingLeft: 18, margin: '0 0 8px' }}>
                  {p.wishes.map((w) => <li key={w.wish} className="small">{w.wish}: {w.offerings.length === 0 ? <Tone tone="info">이 자료에 없음</Tone> : w.offerings.map((o) => `${o.grade}-${o.semester} ${formatCredit(o.creditValue, o.creditUnit)} ${o.requirementType === 'school_designated' ? '지정' : '선택'}`).join(' · ')}</li>)}
                </ul>
                <div className="table-wrap" style={{ maxHeight: 'none' }}>
                  <table className="data">
                    <caption>학기별 지정 과목과 선택 슬롯. 선택군 규칙이 미확인이면 선택 수를 가정하지 않습니다.</caption>
                    <thead><tr><th scope="col">학기</th><th scope="col">지정 (고정)</th><th scope="col">선택 슬롯</th></tr></thead>
                    <tbody>
                      {p.slots.map((s) => (
                        <tr key={`${s.grade}-${s.semester}`}>
                          <th scope="row">{s.grade}학년 {s.semester}학기{s.status === 'empty' && <span className="cellnote">확인된 편성 없음</span>}</th>
                          <td>{s.designated.length ? s.designated.map((o) => o.courseOriginalName).join(', ') : <span className="muted">—</span>}</td>
                          <td>
                            {s.choiceGroups.length === 0 && <span className="muted">—</span>}
                            {s.choiceGroups.map((g) => (
                              <div key={g.groupId ?? 'none'} style={{ marginBottom: 6 }}>
                                <div className="small"><strong>{g.label}</strong> {g.ruleStatus === 'verified' ? <Tone tone="ok">규칙 확인</Tone> : <Tone tone="unknown">규칙 미확인</Tone>}</div>
                                <div className="chips">
                                  {g.members.map((o) => { const on = (p.chosen ?? []).includes(o.id); return <button key={o.id} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => setSel(p.id, on ? (p.chosen ?? []).filter((x) => x !== o.id) : [...(p.chosen ?? []), o.id])}>{o.courseOriginalName} {formatCredit(o.creditValue, o.creditUnit)}</button> })}
                                </div>
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="toolbar">
                  <Button size="sm" onClick={() => { const prev = undo[p.id]?.at(-1); if (prev) { setSelections((s) => ({ ...s, [p.id]: prev })); setUndo((u) => ({ ...u, [p.id]: (u[p.id] ?? []).slice(0, -1) })) } }} disabled={!undo[p.id]?.length}>되돌리기</Button>
                  <Button size="sm" variant="quiet" onClick={() => setSel(p.id, p.wishIds)}>희망 과목으로 초기화</Button>
                  <Button size="sm" variant="quiet" onClick={() => setSearchOut((o) => ({ ...o, [p.id]: searchFeasibleCombos(p.bundle!, p.wishIds, state.cohortYear) }))}>가능한 조합 탐색</Button>
                  <Button size="sm" variant="quiet" onClick={() => { if (state.session) dispatch({ type: 'session.set', session: { ...state.session, dataVersions: [...state.session.dataVersions.filter((v) => v.schoolId !== p.id), { schoolId: p.id, curriculumVersionId: p.bundle!.version.id, cohortYear: state.cohortYear, capturedAt: new Date().toISOString() }], updatedAt: new Date().toISOString() } }) }} disabled={!state.session}>상담에 저장</Button>
                </div>
                {p.result && <PlanVerdictPanel result={p.result} nameOf={(oid) => p.bundle!.offerings.find((o) => o.id === oid)?.courseOriginalName ?? oid} onPickAlternative={(ids) => { const g = p.result!.alternatives.find((a) => a.offeringIds === ids); const members = p.bundle!.selectionGroups.find((x) => x.id === g?.groupId)?.memberOfferingIds ?? []; setSel(p.id, [...(p.chosen ?? []).filter((x) => !members.includes(x)), ...ids]) }} />}
                {searchOut[p.id] && (
                  <div className="hint">
                    조합 탐색: {searchOut[p.id]!.status === 'complete' ? '완료' : searchOut[p.id]!.status === 'node_limit' ? '노드 제한으로 중단' : '시간 초과로 중단'} · 방문 {searchOut[p.id]!.nodesVisited} · 확인된 규칙 안에서 모순 없는 조합 {searchOut[p.id]!.feasible.length}개
                    {searchOut[p.id]!.feasible.slice(0, 5).map((f, i) => <div key={i} className="small">· {f.offeringIds.map((oid) => p.bundle!.offerings.find((o) => o.id === oid)?.courseOriginalName ?? oid).join(' + ')} <Button size="sm" variant="quiet" onClick={() => setSel(p.id, f.offeringIds)}>적용</Button></div>)}
                  </div>
                )}
              </>
            )}
          </section>
        ))}
      </div>
      <Interpretation>'이 문서의 확인된 규칙 안에서는 함께 선택할 수 있습니다'는 편제표 규칙에 대한 판단이며, 실제 개설·인원·시간표·학교 승인은 보장하지 않습니다. 실제 시간표가 없으면 시간표 충돌이라고 부르지 않습니다.</Interpretation>
    </>
  )
}
