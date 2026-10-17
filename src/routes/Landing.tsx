import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useWorkspace } from '../lib/store'
import { useAsync, useDocumentTitle } from '../lib/hooks'
import { apiGet } from '../lib/api'
import type { CoverageSummary } from '@shared/types'
import { formatDateKo } from '@shared/format'

export default function Landing() {
  useDocumentTitle('')
  const nav = useNavigate()
  const { state, dispatch } = useWorkspace()
  const [q, setQ] = useState('')
  const cov = useAsync(() => apiGet<CoverageSummary>('/api/coverage'), 'coverage')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    nav(`/schools?q=${encodeURIComponent(q.trim())}`)
  }
  const c = cov.data
  const succeeded = c?.districts.filter((d) => d.status === 'succeeded').length ?? 0
  return (
    <>
      <section className="hero">
        <div className="art" style={{ backgroundImage: 'image-set(url(/images/atlas-hero-1400.avif) type("image/avif"), url(/images/atlas-hero-1400.webp) type("image/webp"))' }} aria-hidden="true" />
        <div className="copy">
          <div className="eyebrow">HIGH SCHOOL ATLAS · 서울 고등학교 교육과정·진학상담 워크스페이스</div>
          <h1>학교 이름 너머,<br />배움의 차이를 읽다.</h1>
          <p className="intro">학생의 관심이 어느 교실에서 이어질지, 입학연도별 교육과정과 선택 조건을 공식 문서의 근거와 함께 살펴봅니다.</p>
          <form onSubmit={submit} role="search" aria-label="학교·과목 검색">
            <label htmlFor="landing-search" className="sr-only">학교 또는 과목 검색</label>
            <input id="landing-search" className="input" placeholder="예: 동대문구에서 정보 관련 과목이 확인된 학교" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="btn primary lg">학교 찾기</button>
          </form>
          <div className="toolbar" style={{ margin: '6px 0 14px' }}>
            <label className="cohort-select">
              <span className="lbl">대상 입학연도</span>
              <select value={state.cohortYear} onChange={(e) => dispatch({ type: 'cohort', year: Number(e.target.value) })} aria-label="대상 입학연도">
                {[2025, 2026, 2027, 2028, 2029].map((y) => (
                  <option key={y} value={y}>{y} 입학생</option>
                ))}
              </select>
            </label>
            {!state.cohortExplicit && <span className="source">제안값입니다. 해당 연도 자료 확보 여부는 학교별로 표시됩니다.</span>}
          </div>
          <div className="quick">
            <Link className="btn secondary" to="/schools?course=정보">과목으로 찾기</Link>
            <Link className="btn secondary" to="/counsel">상담 이어가기</Link>
            <Link className="btn quiet" to="/sources">자료 범위 보기</Link>
          </div>
        </div>
      </section>
      <div className="underhero">
        <div><strong>같은 입학생, 같은 기준</strong><span>입학연도와 과정을 맞춰 비교합니다. 과거 자료는 참고로만 엽니다.</span></div>
        <div><strong>선택의 조건까지</strong><span>과목 목록 뒤에 있는 선택군 규칙을 읽고, 조합의 충돌을 근거와 함께 확인합니다.</span></div>
        <div><strong>확인한 만큼 정확하게</strong><span>사실·미확인·해석·근거를 구분하고, 모르는 것은 학교에 물을 질문으로 남깁니다.</span></div>
      </div>
      <section style={{ marginTop: 22 }}>
        <h2>현재 자료 범위</h2>
        <p className="muted small">아래 숫자는 DB 에서 계산한 현재 범위입니다. 완성도를 과장하지 않으며 학교 품질 순위는 제공하지 않습니다.</p>
        <div className="summary-strip">
          <div className="item"><div className="k">기본정보가 있는 학교</div><div className="v">{c ? c.schoolCount.toLocaleString() : '…'}</div></div>
          <div className="item"><div className="k">좌표가 있는 학교</div><div className="v">{c ? c.schoolsWithGeo.toLocaleString() : '…'}</div></div>
          <div className="item"><div className="k">교육과정 공개(검토 완료) 학교</div><div className="v">{c ? c.schoolsWithPublishedCurriculum.toLocaleString() : '…'}</div></div>
          <div className="item"><div className="k">교육과정 검토 대기 학교</div><div className="v">{c ? c.schoolsWithUnreviewedCurriculum.toLocaleString() : '…'}</div></div>
          <div className="item"><div className="k">자치구 수집 상태</div><div className="v text">{c ? `${succeeded}/25 성공` : '…'}</div></div>
          <div className="item"><div className="k">마지막 수집</div><div className="v text">{c?.lastIngestion ? `${formatDateKo(c.lastIngestion.finishedAt)} · ${c.lastIngestion.status}` : '아직 없음'}</div></div>
        </div>
        {c && c.schoolCount === 0 && (
          <div className="hint warn">
            아직 공식 학교 기본정보가 수집되지 않았습니다. 자료 관리에서 수집 작업을 실행하거나, 로컬 <code>npm run ingest:neis</code> / <code>npm run ingest:schoolinfo</code> 명령으로 가져온 결과를 등록하세요. 개발 환경에서는 '기능 검증용 가상 자료'가 검색에 표시될 수 있습니다.
          </div>
        )}
      </section>
    </>
  )
}
