import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useWorkspace } from '../lib/store'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiGet, qs } from '../lib/api'
import type { SchoolListItem, SchoolsResponse } from '../lib/types'
import { Button, Empty, ErrorBox, Skeleton, StatusBadge, SyntheticBadge, Tone } from '../components/ui'
import { DISTRICT_NAMES, MAX_COMPARE_SCHOOLS } from '@shared/constants'
import { ESTABLISHMENT_LABEL, GENDER_LABEL, SCHOOL_TYPE_LABEL, schoolTypeDisplay, type Establishment, type Gender, type SchoolType } from '@shared/types'
import { haversineKm, formatStraightLine } from '@shared/geo'
import type { MapOrigin } from '../components/SchoolMap'

const SchoolMap = lazy(() => import('../components/SchoolMap'))

const TYPES = Object.entries(SCHOOL_TYPE_LABEL) as [SchoolType, string][]
const ESTS = Object.entries(ESTABLISHMENT_LABEL) as [Establishment, string][]
const GENDERS = Object.entries(GENDER_LABEL) as [Gender, string][]

export default function Schools() {
  useDocumentTitle('학교 찾기')
  const [sp, setSp] = useSearchParams()
  const nav = useNavigate()
  const { state, dispatch } = useWorkspace()
  const q = sp.get('q') ?? ''
  const [draft, setDraft] = useState(q)
  const view = (sp.get('view') as 'list' | 'table' | 'map') || 'list'
  const [origin, setOrigin] = useState<MapOrigin | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  useEffect(() => setDraft(q), [q])

  const params = {
    q,
    district: sp.get('district') ?? '',
    schoolType: sp.get('schoolType') ?? '',
    establishment: sp.get('establishment') ?? '',
    gender: sp.get('gender') ?? '',
    course: sp.get('course') ?? '',
    program: sp.get('program') ?? '',
    curriculumStatus: sp.get('curriculumStatus') ?? 'any',
    cohortYear: state.cohortYear,
    pageSize: 200,
  }
  const key = JSON.stringify(params)
  const r = useAsync(() => apiGet<SchoolsResponse>(`/api/schools${qs(params)}`), key)

  // 뒤로 가기 시 스크롤 복구
  useEffect(() => {
    if (r.data && state.lastSearch && state.lastSearch.query === key) window.scrollTo({ top: state.lastSearch.scrollY })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.data])
  const remember = () => dispatch({ type: 'search.remember', query: key, scrollY: window.scrollY })

  const setParam = (k: string, v: string) => {
    const n = new URLSearchParams(sp)
    if (v) n.set(k, v)
    else n.delete(k)
    setSp(n, { replace: false })
  }
  const toggleMulti = (k: string, v: string) => {
    const cur = (sp.get(k) ?? '').split(',').filter(Boolean)
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]
    setParam(k, next.join(','))
  }
  const activeChips = useMemo(() => {
    const out: { key: string; value: string; label: string }[] = []
    for (const d of (sp.get('district') ?? '').split(',').filter(Boolean)) out.push({ key: 'district', value: d, label: `자치구: ${d}` })
    for (const t of (sp.get('schoolType') ?? '').split(',').filter(Boolean)) out.push({ key: 'schoolType', value: t, label: `유형: ${SCHOOL_TYPE_LABEL[t as SchoolType] ?? t}` })
    for (const t of (sp.get('establishment') ?? '').split(',').filter(Boolean)) out.push({ key: 'establishment', value: t, label: `설립: ${ESTABLISHMENT_LABEL[t as Establishment] ?? t}` })
    for (const t of (sp.get('gender') ?? '').split(',').filter(Boolean)) out.push({ key: 'gender', value: t, label: `공학구분: ${GENDER_LABEL[t as Gender] ?? t}` })
    if (sp.get('course')) out.push({ key: 'course', value: sp.get('course')!, label: `관심 과목: ${sp.get('course')}` })
    if (sp.get('program')) out.push({ key: 'program', value: sp.get('program')!, label: `검토된 프로그램: ${sp.get('program')}` })
    if (sp.get('curriculumStatus') && sp.get('curriculumStatus') !== 'any') out.push({ key: 'curriculumStatus', value: sp.get('curriculumStatus')!, label: `자료 상태: ${CURR_LABEL[sp.get('curriculumStatus')!] ?? ''}` })
    return out
  }, [sp])
  const removeChip = (c: { key: string; value: string }) => {
    if (['district', 'schoolType', 'establishment', 'gender'].includes(c.key)) toggleMulti(c.key, c.value)
    else setParam(c.key, '')
  }
  const onSelect = useCallback((id: string) => { remember(); nav(`/schools/${id}`) }, [nav]) // eslint-disable-line react-hooks/exhaustive-deps
  // 지도에서 학교를 누르면 화면을 바꾸지 않고 옆 패널에 요약을 보여준다
  const onMapSelect = useCallback((id: string) => setSelectedId(id), [])

  const d = r.data
  return (
    <>
      <div className="page-head">
        <div>
          <h1>학교 찾기</h1>
          <div className="sub">{state.cohortYear} 입학생 기준 · 정식명·별칭·초성·자치구·과목으로 검색합니다. 미확인 학교는 제외하지 않고 '자료 추가 확인 후보'로 나눕니다.</div>
        </div>
        <div className="toolbar" role="tablist" aria-label="보기 방식">
          {(['list', 'table', 'map'] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={view === v} className={`btn sm ${view === v ? 'primary' : 'secondary'}`} onClick={() => setParam('view', v)}>
              {v === 'list' ? '목록' : v === 'table' ? '표' : '지도'}
            </button>
          ))}
        </div>
      </div>

      <form
        className="toolbar"
        onSubmit={(e) => {
          e.preventDefault()
          setParam('q', draft.trim())
        }}
        role="search"
      >
        <label htmlFor="schools-q" className="sr-only">검색 문장</label>
        <input id="schools-q" className="input" style={{ maxWidth: 560 }} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="예: 성북구 여고 / ㄱㅅㅎㄱ / 동대문구에서 정보 관련 과목이 확인된 학교" />
        <Button variant="primary" type="submit">검색</Button>
        {activeChips.length > 0 && <Button variant="quiet" onClick={() => setSp(new URLSearchParams(q ? { q } : {}))}>전체 초기화</Button>}
      </form>

      {d?.interpreted.chips.length ? (
        <div className="interpretation">
          해석된 조건: {d.interpreted.chips.map((c) => c.label).join(' · ')}
          {d.interpreted.residualText && <> · 일반 검색어 "{d.interpreted.residualText}"</>}
        </div>
      ) : null}

      <details className="details" open={activeChips.length > 0}>
        <summary>필터 {activeChips.length > 0 ? `(${activeChips.length})` : ''}</summary>
        <div className="body">
          <div className="grid-2">
            <div className="field">
              <label>자치구</label>
              <div className="chips">
                {DISTRICT_NAMES.map((dn) => {
                  const on = (sp.get('district') ?? '').split(',').includes(dn)
                  return <button key={dn} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleMulti('district', dn)}>{dn}</button>
                })}
              </div>
              <div className="help">행정구 기준입니다. 교육지원청 관할·고등학교 학교군과 다르며 지원·배정을 뜻하지 않습니다.</div>
            </div>
            <div>
              <div className="field">
                <label>학교 유형 <span className="muted small">(프로그램과 다름)</span></label>
                <div className="chips">{TYPES.map(([k, l]) => { const on = (sp.get('schoolType') ?? '').split(',').includes(k); return <button key={k} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleMulti('schoolType', k)}>{l}</button> })}</div>
              </div>
              <div className="field">
                <label>설립 · 공학구분</label>
                <div className="chips">
                  {ESTS.map(([k, l]) => { const on = (sp.get('establishment') ?? '').split(',').includes(k); return <button key={k} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleMulti('establishment', k)}>{l}</button> })}
                  {GENDERS.map(([k, l]) => { const on = (sp.get('gender') ?? '').split(',').includes(k); return <button key={k} type="button" className={`chip ${on ? 'active' : ''}`} aria-pressed={on} onClick={() => toggleMulti('gender', k)}>{l}</button> })}
                </div>
              </div>
              <div className="field">
                <label htmlFor="f-course">관심 과목 편성 상태</label>
                <input id="f-course" className="input" placeholder="과목명 (예: 정보, 인공지능 기초)" defaultValue={sp.get('course') ?? ''} onBlur={(e) => setParam('course', e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setParam('course', (e.target as HTMLInputElement).value.trim()) } }} />
              </div>
              <div className="field">
                <label htmlFor="f-program">검토된 중점과정·프로그램</label>
                <input id="f-program" className="input" placeholder="예: 과학중점" defaultValue={sp.get('program') ?? ''} onBlur={(e) => setParam('program', e.target.value.trim())} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setParam('program', (e.target as HTMLInputElement).value.trim()) } }} />
              </div>
              <div className="field">
                <label htmlFor="f-curr">교육과정 자료 검토 상태 ({state.cohortYear} 입학생)</label>
                <select id="f-curr" className="select" value={sp.get('curriculumStatus') ?? 'any'} onChange={(e) => setParam('curriculumStatus', e.target.value === 'any' ? '' : e.target.value)}>
                  <option value="any">전체</option>
                  <option value="published">공개(검토 완료) 자료 있음</option>
                  <option value="draft_only">검토 대기만 있음</option>
                  <option value="none">자료 없음</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      </details>

      {activeChips.length > 0 && (
        <div className="chips" style={{ margin: '10px 0' }}>
          {activeChips.map((c) => (
            <span key={c.key + c.value} className="chip">{c.label}<button type="button" aria-label={`${c.label} 제거`} onClick={() => removeChip(c)}>×</button></span>
          ))}
        </div>
      )}

      {r.loading && <Skeleton lines={6} />}
      {r.error && <ErrorBox error={r.error} retry={r.reload} />}
      {d && (
        <>
          <div className="summary-strip">
            <div className="item"><div className="k">DB 의 학교 수</div><div className="v">{d.counts.schoolsInDb}</div></div>
            <div className="item"><div className="k">검색 결과</div><div className="v">{d.counts.results}</div></div>
            {d.candidates.length > 0 && <div className="item"><div className="k">자료 추가 확인 후보</div><div className="v">{d.counts.candidates}</div></div>}
            <div className="item"><div className="k">지도 좌표 있음</div><div className="v">{d.counts.withGeoInResults}</div></div>
            <div className="item"><div className="k">자치구 수집</div><div className="v text">{d.coverage.succeededDistricts}/25 성공{d.coverage.failedDistricts ? ` · ${d.coverage.failedDistricts} 실패` : ''}</div></div>
          </div>
          {d.coverage.succeededDistricts < 25 && <div className="hint warn">자치구 수집이 완료되지 않아 '서울 전체' 결과가 아닙니다. <Link to="/sources">자료 범위</Link>에서 성공·실패 구를 확인하세요.</div>}

          {d.items.length === 0 && d.candidates.length === 0 ? (
            <Empty title="조건에 맞는 학교가 없습니다" actions={<><Button onClick={() => setSp(new URLSearchParams())}>필터 초기화</Button><Link className="btn quiet" to="/sources">자료 범위 확인</Link><Link className="btn quiet" to="/admin">자료 등록</Link></>}>
              검색어나 필터를 바꾸거나, 해당 학교 자료가 아직 수집되지 않았는지 확인하세요. 자료가 없다는 것은 과목·시설이 없다는 뜻이 아닙니다.
            </Empty>
          ) : view === 'map' ? (
            <div className="split">
              <div>
                <Suspense fallback={<Skeleton lines={8} />}>
                  <SchoolMap schools={[...d.items, ...d.candidates].map((i) => i.school)} onSelect={onMapSelect} origin={origin} onOrigin={setOrigin} selectedId={selectedId} />
                </Suspense>
                {origin && <div className="toolbar"><span className="small">출발 위치: {origin.label} ({origin.lat}, {origin.lng}) — 서버·URL 에 저장되지 않습니다.</span><Button size="sm" variant="quiet" onClick={() => setOrigin(null)}>지우기</Button></div>}
              </div>
              <div style={{ maxHeight: 600, overflow: 'auto' }}>
                {selectedId && <MapSelectionCard item={[...d.items, ...d.candidates].find((i) => i.school.id === selectedId) ?? null} origin={origin} cohortYear={state.cohortYear} onClose={() => setSelectedId(null)} onOpen={onSelect} />}
                {[...d.items, ...d.candidates].map((it) => (
                  <SchoolRow key={it.school.id} item={it} origin={origin} onOpen={onSelect} compare={state.compare} onToggleCompare={(id) => dispatch(state.compare.includes(id) ? { type: 'compare.remove', id } : { type: 'compare.add', id })} compact />
                ))}
              </div>
            </div>
          ) : view === 'table' ? (
            <div className="table-wrap">
              <table className="data">
                <caption>검색 결과 {d.items.length}개교 · {state.cohortYear} 입학생 기준 자료 상태</caption>
                <thead>
                  <tr><th scope="col">학교</th><th scope="col">자치구</th><th scope="col">유형</th><th scope="col">설립</th><th scope="col">공학</th><th scope="col">교육과정 자료</th>{d.items[0]?.courseMatch && <th scope="col">관심 과목</th>}<th scope="col">비교</th></tr>
                </thead>
                <tbody>
                  {d.items.map((it) => (
                    <tr key={it.school.id}>
                      <th scope="row"><Link to={`/schools/${it.school.id}`} onClick={remember}>{it.school.officialName}</Link>{it.school.isSynthetic && <> <SyntheticBadge /></>}</th>
                      <td>{it.school.district}</td>
                      <td>{schoolTypeDisplay(it.school)}{it.school.schoolTypeStatus === 'conflict' && <> <StatusBadge status="conflict" /></>}</td>
                      <td>{ESTABLISHMENT_LABEL[it.school.establishment]}</td>
                      <td>{GENDER_LABEL[it.school.gender]}</td>
                      <td><CurrStatus s={it.curriculumStatus} years={it.publishedCohortYears} /></td>
                      {it.courseMatch && <td><CourseMatch m={it.courseMatch} /></td>}
                      <td><CompareToggle id={it.school.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div>
              {d.items.map((it) => (
                <SchoolRow key={it.school.id} item={it} origin={origin} onOpen={onSelect} compare={state.compare} onToggleCompare={(id) => dispatch(state.compare.includes(id) ? { type: 'compare.remove', id } : { type: 'compare.add', id })} />
              ))}
            </div>
          )}

          {d.candidates.length > 0 && view !== 'map' && (
            <section style={{ marginTop: 22 }}>
              <h2>자료 추가 확인 후보 <span className="muted small">({d.candidates.length})</span></h2>
              <p className="muted small">{state.cohortYear} 입학생의 공개 교육과정 자료가 없어 과목 편성 여부를 확인할 수 없는 학교입니다. 편성되지 않았다는 뜻이 아닙니다.</p>
              {d.candidates.map((it) => (
                <SchoolRow key={it.school.id} item={it} origin={origin} onOpen={onSelect} compare={state.compare} onToggleCompare={(id) => dispatch(state.compare.includes(id) ? { type: 'compare.remove', id } : { type: 'compare.add', id })} compact />
              ))}
            </section>
          )}
          {d.confirmedAbsent.length > 0 && view !== 'map' && (
            <details className="details" style={{ marginTop: 16 }}>
              <summary>확인된 미편성 ({d.confirmedAbsent.length}) — 공개 자료에 해당 과목이 없는 학교</summary>
              <div className="body">{d.confirmedAbsent.map((it) => <div key={it.school.id} className="small" style={{ padding: '4px 0' }}><Link to={`/schools/${it.school.id}`}>{it.school.officialName}</Link> · {it.school.district}</div>)}</div>
            </details>
          )}
        </>
      )}
    </>
  )
}

const CURR_LABEL: Record<string, string> = { published: '공개 자료 있음', draft_only: '검토 대기', none: '자료 없음', other_cohort_only: '다른 입학연도만' }

function CurrStatus({ s, years }: { s: SchoolListItem['curriculumStatus']; years: number[] }) {
  if (s === 'published') return <Tone tone="ok">검토 완료 공개</Tone>
  if (s === 'draft_only') return <Tone tone="warn">검토 대기</Tone>
  if (s === 'other_cohort_only') return <Tone tone="info">다른 입학연도만 ({years.join(', ')})</Tone>
  return <Tone tone="unknown">자료 없음</Tone>
}

function CourseMatch({ m }: { m: NonNullable<SchoolListItem['courseMatch']> }) {
  if (m.status === 'confirmed') return <><StatusBadge status="confirmed" label="편성 확인" /><span className="cellnote">{m.offerings.map((o) => `${o.name} ${o.grade}-${o.semester} ${o.credit ?? '?'}`).join(' · ')} (개설 미확인)</span></>
  if (m.status === 'confirmed_absent') return <StatusBadge status="confirmed_absent" label="공개 자료에 없음" />
  return <StatusBadge status="not_collected" label="자료 미확인" />
}

function CompareToggle({ id }: { id: string }) {
  const { state, dispatch } = useWorkspace()
  const on = state.compare.includes(id)
  const full = !on && state.compare.length >= MAX_COMPARE_SCHOOLS
  return (
    <Button size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={full} title={full ? `최대 ${MAX_COMPARE_SCHOOLS}개교` : undefined} onClick={() => dispatch(on ? { type: 'compare.remove', id } : { type: 'compare.add', id })}>
      {on ? '비교 중' : '비교 담기'}
    </Button>
  )
}

function SchoolRow({ item, origin, onOpen, compare, onToggleCompare, compact }: { item: SchoolListItem; origin: MapOrigin | null; onOpen: (id: string) => void; compare: string[]; onToggleCompare: (id: string) => void; compact?: boolean }) {
  const s = item.school
  const on = compare.includes(s.id)
  const dist = origin && s.geo ? formatStraightLine(haversineKm(origin, s.geo)) : null
  return (
    <article className="card" style={{ padding: compact ? '12px 14px' : undefined, marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ marginBottom: 4 }}>
            <Link to={`/schools/${s.id}`} onClick={() => onOpen(s.id)}>{s.officialName}</Link>
            {s.isSynthetic && <> <SyntheticBadge /></>}
          </h3>
          <div className="small muted">
            {s.district} · {schoolTypeDisplay(s)}{s.schoolTypeStatus === 'conflict' ? ' (유형 자료 충돌)' : ''} · {ESTABLISHMENT_LABEL[s.establishment]} · {GENDER_LABEL[s.gender]}
            {s.tracks.length > 0 && <> · {s.tracks.map((t) => t.name).join('/')}</>}
            {dist && <> · {dist}</>}
            {!s.geo && <> · 좌표 없음</>}
          </div>
          <div className="toolbar" style={{ margin: '8px 0 0' }}>
            <CurrStatus s={item.curriculumStatus} years={item.publishedCohortYears} />
            {item.courseMatch && <CourseMatch m={item.courseMatch} />}
            {item.programMatch && item.programMatch.map((p) => <Tone key={p.name} tone="ok">{p.name} ({p.phase === 'plan' ? '계획' : p.phase === 'result' ? '운영 결과' : p.phase === 'promotion' ? '홍보' : '단계 미확인'})</Tone>)}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={!on && compare.length >= MAX_COMPARE_SCHOOLS} onClick={() => onToggleCompare(s.id)}>{on ? '비교 중' : '비교 담기'}</Button>
          <Link className="btn secondary sm" to={`/schools/${s.id}/curriculum`} onClick={() => onOpen(s.id)}>교육과정</Link>
        </div>
      </div>
    </article>
  )
}

/** 지도에서 선택한 학교의 요약 패널 — 화면 전환 없이 지도 옆에 표시 */
function MapSelectionCard({ item, origin, cohortYear, onClose, onOpen }: { item: SchoolListItem | null; origin: MapOrigin | null; cohortYear: number; onClose: () => void; onOpen: (id: string) => void }) {
  const { state, dispatch } = useWorkspace()
  const id = item?.school.id ?? ''
  const prof = useAsync(() => apiGet<{ facts: { field: string; value: unknown; unit: string | null; basisYear: number | null; status: string }[]; draftVersionCount: number; curriculumVersions: { cohortYear: number }[]; admissionRules: { admissionYear: number; selectionAuthority: string; status: string }[] }>(`/api/schools/${encodeURIComponent(id)}`), id, Boolean(id))
  if (!item) return null
  const s = item.school
  const on = state.compare.includes(s.id)
  const dist = origin && s.geo ? formatStraightLine(haversineKm(origin, s.geo)) : null
  const fact = (f: string) => prof.data?.facts.find((x) => x.field === f && x.status === 'confirmed')
  const students = fact('students.total')
  const rule = prof.data?.admissionRules.find((r) => r.admissionYear === cohortYear && r.status === 'published')
  const AUTH: Record<string, string> = { superintendent_assignment: '교육감 배정', principal_selection: '학교장 선발', mixed: '전형별 상이', unknown: '미확인' }
  return (
    <section className="card" style={{ marginTop: 0, marginBottom: 12, borderColor: 'var(--brass)' }} aria-label="지도에서 선택한 학교">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">지도에서 선택 · {s.district}</div>
          <h3 style={{ margin: '4px 0' }}>{s.officialName}{s.isSynthetic && <> <SyntheticBadge /></>}</h3>
          <div className="small muted">{schoolTypeDisplay(s)} · {ESTABLISHMENT_LABEL[s.establishment]} · {GENDER_LABEL[s.gender]}{dist ? ` · ${dist}` : ''}</div>
          {s.address && <div className="small muted">{s.address}</div>}
        </div>
        <Button size="sm" variant="quiet" onClick={onClose} aria-label="선택 해제">×</Button>
      </div>
      <dl className="brief kv" style={{ border: 0, gridTemplateColumns: '110px 1fr', margin: '8px 0', fontSize: 14 }}>
        <dt>{cohortYear} 교육과정</dt><dd><CurrStatus s={item.curriculumStatus} years={item.publishedCohortYears} /></dd>
        <dt>선발 방식</dt><dd>{prof.loading ? '…' : rule ? AUTH[rule.selectionAuthority] : '해당 연도 규정 미확인'}</dd>
        <dt>학생 수</dt><dd>{prof.loading ? '…' : students ? `${Number(students.value).toLocaleString()}${students.unit ?? ''} (${students.basisYear})` : '공시 미수집'}</dd>
        {item.courseMatch && <><dt>관심 과목</dt><dd><CourseMatch m={item.courseMatch} /></dd></>}
        <dt>홈페이지</dt><dd>{s.homepage ? <a href={s.homepage} target="_blank" rel="noreferrer noopener">공식 홈페이지 ↗</a> : '미확인'}</dd>
      </dl>
      <div className="toolbar" style={{ margin: 0 }}>
        <Button size="sm" variant="primary" onClick={() => onOpen(s.id)}>프로필 열기</Button>
        <Link className="btn secondary sm" to={`/schools/${s.id}/curriculum`}>교육과정</Link>
        <Button size="sm" variant={on ? 'primary' : 'secondary'} aria-pressed={on} disabled={!on && state.compare.length >= MAX_COMPARE_SCHOOLS} onClick={() => dispatch(on ? { type: 'compare.remove', id: s.id } : { type: 'compare.add', id: s.id })}>{on ? '비교 중' : '비교 담기'}</Button>
      </div>
    </section>
  )
}
