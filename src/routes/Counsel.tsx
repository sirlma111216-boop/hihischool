import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { clearDeviceStorage, newSession, useWorkspace } from '../lib/store'
import { useDocumentTitle } from '../lib/hooks'
import { apiGet, apiPost } from '../lib/api'
import type { CompareResponse } from '../lib/types'
import type { CounselingSession, CurriculumLookup, PlanValidationResult } from '@shared/types'
import { Button, Empty, Interpretation, StatusBadge, Tone } from '../components/ui'
import { decryptJson, downloadBlob, encryptJson, exportSession } from '../lib/export'
import { formatDateKo } from '@shared/format'

export default function Counsel() {
  useDocumentTitle('상담 워크스페이스')
  const { state, dispatch } = useWorkspace()
  const s = state.session
  const [showPrivate, setShowPrivate] = useState(false)
  const [pw, setPw] = useState('')
  const [cmp, setCmp] = useState<CompareResponse | null>(null)
  const [changes, setChanges] = useState<{ schoolId: string; saved: string; current: string | null; cohortYear: number; status: string }[]>([])
  const [together, setTogether] = useState<{ schoolId: string; a: string; b: string; result: PlanValidationResult | null; msg: string } | null>(null)

  const update = (patch: Partial<CounselingSession>) => {
    if (!s) return
    dispatch({ type: 'session.set', session: { ...s, ...patch, updatedAt: new Date().toISOString() } })
  }
  useEffect(() => {
    if (!s || s.candidateSchoolIds.length === 0) {
      setCmp(null)
      return
    }
    apiPost<CompareResponse>('/api/compare', { schoolIds: s.candidateSchoolIds, cohortYear: s.targetCohortYear, trackIds: Object.fromEntries(s.candidateSchoolIds.map((id) => [id, state.trackChoice[id] ?? null])), interestCourses: s.interestCourses }).then(setCmp).catch(() => setCmp(null))
    // 저장된 자료 버전과 현재 공개 버전 비교 (자료 개정 알림)
    Promise.all(
      s.dataVersions.map(async (v) => {
        const look = await apiGet<CurriculumLookup>(`/api/schools/${encodeURIComponent(v.schoolId)}/curricula?cohortYear=${v.cohortYear}${state.trackChoice[v.schoolId] ? `&trackId=${encodeURIComponent(state.trackChoice[v.schoolId]!)}` : ''}`).catch(() => null)
        const cur = look?.bundle?.version.id ?? null
        return { schoolId: v.schoolId, saved: v.curriculumVersionId, current: cur, cohortYear: v.cohortYear, status: cur === null ? '현재 공개 버전 없음' : cur === v.curriculumVersionId ? '동일' : '상담 이후 자료 변경 있음' }
      }),
    ).then(setChanges)
  }, [s?.candidateSchoolIds.join(','), s?.interestCourses.join(','), s?.targetCohortYear, s?.dataVersions.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const candidatesFromCompare = () => update({ candidateSchoolIds: state.compare })
  const askTogether = async (schoolId: string, versionId: string, a: string, b: string) => {
    try {
      const r = await apiGet<{ result: PlanValidationResult }>(`/api/ask/together?versionId=${encodeURIComponent(versionId)}&a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}&cohortYear=${s!.targetCohortYear}`)
      setTogether({ schoolId, a, b, result: r.result, msg: '' })
    } catch (e) {
      setTogether({ schoolId, a, b, result: null, msg: e instanceof Error ? e.message : '실패' })
    }
  }

  if (!s) {
    return (
      <Empty title="상담을 시작하세요" actions={<><Button variant="primary" onClick={() => dispatch({ type: 'session.set', session: newSession(state.cohortYear) })}>새 상담 시작</Button><label className="btn secondary">JSON 복원<input type="file" accept="application/json" hidden onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; const text = await f.text(); try { const obj = JSON.parse(text) as { format?: string }; if (obj.format === 'atlas-backup-v1') { const p = prompt('백업 비밀번호'); if (!p) return; dispatch({ type: 'session.set', session: await decryptJson<CounselingSession>(text, p) }) } else dispatch({ type: 'session.set', session: obj as CounselingSession }) } catch { alert('복원할 수 없는 파일입니다. 비밀번호를 분실한 암호화 백업은 복구할 수 없습니다.') } }} /></label></>}>
        학생은 실명 대신 별칭으로 관리합니다. 기본은 이 브라우저 세션 메모리에만 저장되며 서버로 보내지 않습니다. 성적·생기부·민감한 개인 정보는 수집하지 않습니다.
      </Empty>
    )
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>상담 워크스페이스 {s.alias ? `· ${s.alias}` : ''}</h1>
          <div className="sub">대상 {s.targetCohortYear} 입학생 · 시작 {formatDateKo(s.createdAt)} · {state.persistSession ? '이 기기에 저장 중' : '세션 메모리에만 저장 (닫으면 사라짐)'}</div>
        </div>
        <div className="toolbar no-print">
          <label className="check"><input type="checkbox" checked={state.counselMode} onChange={(e) => dispatch({ type: 'counselMode', on: e.target.checked })} /> 상담 화면 모드 (큰 글씨 · 비공개 메모 숨김)</label>
          <Link className="btn primary" to="/briefing">브리핑 만들기</Link>
        </div>
      </div>

      {changes.some((c) => c.status !== '동일') && (
        <div className="hint warn">
          <strong>상담 이후 자료 변경 있음.</strong> 이 상담은 저장 당시의 교육과정 버전에 근거합니다. 판단을 조용히 바꾸지 않습니다.
          <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{changes.filter((c) => c.status !== '동일').map((c) => <li key={c.schoolId} className="small">{cmp?.columns.find((x) => x.schoolId === c.schoolId)?.school?.officialName ?? c.schoolId}: 저장 버전 {c.saved} → 현재 {c.current ?? '없음'} ({c.status}). <Link to={`/schools/${c.schoolId}/curriculum`}>새 버전과 비교</Link></li>)}</ul>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <h3>학생 정보 (비민감)</h3>
          <div className="field"><label htmlFor="alias">상담 별칭</label><input id="alias" className="input" value={s.alias} onChange={(e) => update({ alias: e.target.value })} placeholder="예: 3반 7번, 별명" /><div className="help">실명·성적·생기부·집 주소를 입력하지 마세요.</div></div>
          <div className="field"><label htmlFor="cy">대상 입학연도</label><select id="cy" className="select" value={s.targetCohortYear} onChange={(e) => update({ targetCohortYear: Number(e.target.value) })}>{[2025, 2026, 2027, 2028, 2029].map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          <div className="field"><label htmlFor="interests">관심 분야</label><input id="interests" className="input" value={s.interests.join(', ')} onChange={(e) => update({ interests: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="쉼표로 구분" /></div>
          <div className="field"><label htmlFor="icourses">원하는 과목</label><input id="icourses" className="input" value={s.interestCourses.join(', ')} onChange={(e) => update({ interestCourses: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="쉼표로 구분" /><Button size="sm" variant="quiet" onClick={() => dispatch({ type: 'interest.set', courses: s.interestCourses })}>작업 공간 관심 과목에 적용</Button></div>
          <div className="field"><label htmlFor="commute">통학 우선순위</label><select id="commute" className="select" value={s.commutePriority ?? ''} onChange={(e) => update({ commutePriority: (e.target.value || null) as CounselingSession['commutePriority'] })}><option value="">미정</option><option value="high">높음</option><option value="medium">보통</option><option value="low">낮음</option></select></div>
          <div className="field"><label htmlFor="life">학교생활 선호</label><input id="life" className="input" value={s.lifePreferences.join(', ')} onChange={(e) => update({ lifePreferences: e.target.value.split(',').map((x) => x.trim()).filter(Boolean) })} placeholder="예: 동아리, 기숙사 불필요" /></div>
        </div>
        <div className="card">
          <h3>후보 학교</h3>
          <div className="toolbar"><Button size="sm" onClick={candidatesFromCompare} disabled={state.compare.length === 0}>비교 바구니에서 가져오기 ({state.compare.length})</Button><Link className="btn quiet sm" to="/schools">학교 찾기</Link></div>
          {s.candidateSchoolIds.length === 0 && <p className="muted small">후보가 없습니다.</p>}
          {cmp?.columns.map((col) => (
            <div key={col.schoolId} className="details" style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <strong><Link to={`/schools/${col.schoolId}`}>{col.school?.officialName ?? col.schoolId}</Link></strong>
                <span>{col.curriculum?.status === 'available' ? <Tone tone="ok">{s.targetCohortYear} 공개 자료</Tone> : <Tone tone="unknown">{col.curriculum?.message ?? '자료 미확인'}</Tone>}</span>
              </div>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {col.interest.map((it) => <li key={it.name} className="small">{it.name}: {it.status === 'confirmed' ? <StatusBadge status="confirmed" label={`편성 확인 (${it.offerings.map((o) => `${o.grade}-${o.semester}`).join(', ')})`} /> : it.status === 'confirmed_absent' ? <StatusBadge status="confirmed_absent" label="공개 자료에 없음" /> : <StatusBadge status="not_collected" label="자료 미확인" />}</li>)}
              </ul>
              {col.curriculum?.status === 'available' && col.interest.filter((i) => i.status === 'confirmed' && i.offerings[0]?.requirementType !== 'school_designated').length >= 2 && (
                <div className="toolbar"><Button size="sm" variant="quiet" onClick={() => { const c = col.interest.filter((i) => i.status === 'confirmed' && i.offerings[0]?.requirementType !== 'school_designated'); askTogether(col.schoolId, col.curriculum!.versionId!, c[0]!.offerings[0]!.id, c[1]!.offerings[0]!.id) }}>'{col.interest.filter((i) => i.status === 'confirmed')[0]?.name}'과 '{col.interest.filter((i) => i.status === 'confirmed')[1]?.name}'을 함께 선택할 수 있나?</Button></div>
              )}
              {together?.schoolId === col.schoolId && (
                <div className={`hint ${together.result?.verdict === 'conflicts_with_verified_rules' ? 'bad' : together.result?.verdict === 'insufficient_data' ? 'warn' : ''}`}>
                  {together.result ? (
                    <>
                      <strong>{together.result.verdict === 'no_conflict_within_verified_rules' ? '이 문서의 확인된 규칙 안에서는 함께 선택할 수 있습니다' : together.result.verdict === 'conflicts_with_verified_rules' ? '동일 선택군의 선택 수를 초과합니다' : '선택군 규칙이 확인되지 않아 판단을 보류합니다'}</strong>
                      {together.result.violations.map((v, i) => <div key={i} className="small">{v.message}</div>)}
                      {together.result.unknowns.map((u, i) => <div key={i} className="small">{u.message} → {u.question}</div>)}
                    </>
                  ) : <span>{together.msg}</span>}
                </div>
              )}
              <div className="toolbar">
                <Button size="sm" variant="quiet" onClick={() => update({ candidateSchoolIds: s.candidateSchoolIds.filter((x) => x !== col.schoolId) })}>제거</Button>
                <CommuteEditor session={s} schoolId={col.schoolId} onChange={update} />
              </div>
            </div>
          ))}
          <Interpretation>원문에서 확인되지 않은 부분은 '학교에 확인할 질문'으로 변환합니다. 이는 확인 작업을 돕는 문장이며 학교가 부족하다는 평가가 아닙니다.</Interpretation>
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>학교에 확인할 질문 · 체크리스트</h3>
          <QuestionList session={s} onChange={update} cmp={cmp} />
        </div>
        <div className="card">
          <h3>메모</h3>
          <div className="field"><label htmlFor="shared">함께 보는 메모</label><textarea id="shared" className="input" value={s.sharedNotes} onChange={(e) => update({ sharedNotes: e.target.value })} /></div>
          {!state.counselMode && (
            <details className="details" open={showPrivate} onToggle={(e) => setShowPrivate((e.target as HTMLDetailsElement).open)}>
              <summary>교사 비공개 메모 (화면 공유·브리핑 기본 제외)</summary>
              <div className="body"><div className="private-note"><textarea className="input" value={s.privateNotes} onChange={(e) => update({ privateNotes: e.target.value })} aria-label="교사 비공개 메모" /></div></div>
            </details>
          )}
          {state.counselMode && <p className="muted small">상담 화면 모드에서는 비공개 메모가 표시되지 않습니다.</p>}
        </div>
      </div>

      <div className="card no-print" style={{ marginTop: 14 }}>
        <h3>저장·종료</h3>
        <div className="toolbar">
          <label className="check"><input type="checkbox" checked={state.persistSession} onChange={(e) => dispatch({ type: 'session.persist', on: e.target.checked })} /> 이 기기(브라우저)에 저장</label>
          <Button size="sm" onClick={() => downloadBlob(`counsel-${s.alias || s.id}.json`, JSON.stringify(exportSession(s, { includePrivateNotes: confirm('비공개 메모도 포함할까요? (취소하면 제외)') }), null, 2), 'application/json')}>JSON 백업</Button>
          <input className="input" style={{ width: 200 }} type="password" placeholder="암호화 백업 비밀번호" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="암호화 백업 비밀번호" />
          <Button size="sm" disabled={pw.length < 8} onClick={async () => downloadBlob(`counsel-${s.alias || s.id}.enc.json`, await encryptJson(exportSession(s, { includePrivateNotes: true }), pw), 'application/json')}>암호화 백업</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm('상담을 끝내고 임시 자료를 지울까요?')) { dispatch({ type: 'session.set', session: null }); dispatch({ type: 'session.persist', on: false }) } }}>상담 끝내기 (임시 자료 지우기)</Button>
          <Button size="sm" variant="destructive" onClick={() => { if (confirm('이 기기에 저장된 모든 상담·작업 기록을 지울까요?')) { clearDeviceStorage(); dispatch({ type: 'session.set', session: null }); dispatch({ type: 'session.persist', on: false }) } }}>이 기기 기록 지우기</Button>
        </div>
        <p className="source">브라우저 저장은 완전한 보안 저장소가 아닙니다. 공용 기기에서는 저장하지 않고 '상담 끝내기'로 종료하세요. 암호화 백업의 비밀번호를 잃으면 복구할 수 없습니다.</p>
      </div>
    </>
  )
}

function CommuteEditor({ session, schoolId, onChange }: { session: CounselingSession; schoolId: string; onChange: (p: Partial<CounselingSession>) => void }) {
  const cur = session.userCommutes.find((u) => u.schoolId === schoolId)
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ mode: cur?.mode ?? '버스', departAt: cur?.departAt ?? '', minutes: cur?.minutes?.toString() ?? '', checkedOn: cur?.checkedOn ?? '', source: cur?.source ?? '' })
  if (!open) return <Button size="sm" variant="quiet" onClick={() => setOpen(true)}>{cur ? `통학 ${cur.mode} ${cur.minutes ?? '?'}분 (사용자 확인)` : '통학 시간 직접 기록'}</Button>
  return (
    <div className="card" style={{ padding: 10, width: '100%' }}>
      <div className="small muted">외부 길찾기에서 확인한 값을 기록합니다. 직선거리에서 분 단위를 만들지 않습니다. 정확한 집 주소는 필요 없습니다.</div>
      <div className="toolbar">
        <input className="input" style={{ width: 90 }} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })} aria-label="이동수단" placeholder="이동수단" />
        <input className="input" style={{ width: 110 }} value={f.departAt} onChange={(e) => setF({ ...f, departAt: e.target.value })} aria-label="출발 시각" placeholder="출발 07:40" />
        <input className="input" style={{ width: 80 }} inputMode="numeric" value={f.minutes} onChange={(e) => setF({ ...f, minutes: e.target.value })} aria-label="소요 분" placeholder="분" />
        <input className="input" style={{ width: 130 }} type="date" value={f.checkedOn} onChange={(e) => setF({ ...f, checkedOn: e.target.value })} aria-label="확인일" />
        <input className="input" style={{ width: 140 }} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} aria-label="확인한 서비스" placeholder="확인한 서비스" />
        <Button size="sm" variant="primary" onClick={() => { onChange({ userCommutes: [...session.userCommutes.filter((u) => u.schoolId !== schoolId), { schoolId, mode: f.mode, departAt: f.departAt || null, minutes: f.minutes ? Number(f.minutes) : null, checkedOn: f.checkedOn || null, source: f.source || '사용자 기록' }] }); setOpen(false) }}>저장</Button>
        <Button size="sm" variant="quiet" onClick={() => setOpen(false)}>취소</Button>
      </div>
    </div>
  )
}

function QuestionList({ session, onChange, cmp }: { session: CounselingSession; onChange: (p: Partial<CounselingSession>) => void; cmp: CompareResponse | null }) {
  const [draft, setDraft] = useState('')
  const suggested: string[] = []
  for (const col of cmp?.columns ?? []) {
    const name = col.school?.officialName ?? col.schoolId
    if (col.curriculum && col.curriculum.status !== 'available') suggested.push(`${name}: ${session.targetCohortYear} 입학생 교육과정 편제표가 공개되어 있는지 문의`)
    for (const it of col.interest) if (it.status === 'unknown') suggested.push(`${name}: '${it.name}' 과목의 편성 여부·학년·학점 문의`)
    for (const it of col.interest) for (const g of it.groups) if (g.ruleStatus !== 'verified') suggested.push(`${name}: ${g.label} 의 선택 개수·동시 선택 가능 여부 문의 ('${it.name}' 포함)`)
    for (const it of col.interest) if (it.status === 'confirmed' && it.offerings.every((o) => o.offeringStatus === 'planned')) suggested.push(`${name}: '${it.name}' 의 실제 개설 여부(인원·시간표) 문의`)
  }
  const add = (text: string) => onChange({ checklist: [...session.checklist, { id: Math.random().toString(36).slice(2, 8), text, done: false }] })
  return (
    <>
      <ul style={{ paddingLeft: 0, listStyle: 'none', margin: 0 }}>
        {session.checklist.map((c) => (
          <li key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '4px 0' }}>
            <label className="check" style={{ flex: 1 }}><input type="checkbox" checked={c.done} onChange={() => onChange({ checklist: session.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} /> <span style={{ textDecoration: c.done ? 'line-through' : 'none' }}>{c.text}</span></label>
            <Button size="sm" variant="quiet" onClick={() => navigator.clipboard?.writeText(c.text)}>복사</Button>
            <Button size="sm" variant="quiet" onClick={() => onChange({ checklist: session.checklist.filter((x) => x.id !== c.id) })} aria-label="삭제">×</Button>
          </li>
        ))}
      </ul>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); if (draft.trim()) { add(draft.trim()); setDraft('') } }}>
        <input className="input" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="확인할 항목 추가" aria-label="확인할 항목" />
        <Button type="submit" size="sm">추가</Button>
      </form>
      {suggested.length > 0 && (
        <details className="details">
          <summary>미확인 항목에서 만든 질문 제안 ({suggested.length})</summary>
          <div className="body">{[...new Set(suggested)].map((q) => <div key={q} className="toolbar" style={{ margin: '4px 0' }}><span className="small" style={{ flex: 1 }}>{q}</span><Button size="sm" variant="quiet" onClick={() => add(q)}>추가</Button></div>)}</div>
        </details>
      )}
      <p className="source">문의 문구 복사·전화·공식 홈페이지 이동만 제공하며 메시지나 이메일을 자동 발송하지 않습니다.</p>
    </>
  )
}
