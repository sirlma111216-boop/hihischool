# DESIGN_SYSTEM

밝은 연구용 아틀라스 + 편집 디자인. 다크 대시보드·3D·파티클·영상·유리 카드 반복·소리 없음.

## 토큰 (`src/styles/tokens.css`)
| 토큰 | 값 | 용도 |
| --- | --- | --- |
| `--paper` | #F6F4EE | 배경 |
| `--surface` | #FFFFFF | 표면·카드·표 |
| `--ink` | #172D32 | 본문 글자 (대비 vs paper ≈ 12.5:1) |
| `--green` | #244E48 | 주요 버튼·활성 탐색·링크 (흰 글자 대비 ≈ 8.9:1) |
| `--muted` | #5D6E70 | 보조 글자 (vs paper ≈ 5.0:1, AA) |
| `--brass` | #B48A4D | 장식·선택 과목 표시. 작은 본문 글자에는 쓰지 않음 → 소형 텍스트는 `--brass-ink` #7A5A2A |
| `--line` | #D8DEDA | 얇은 경계 |
| 상태 배경/글자 | ok #E4EFE6/#1B3B36 · warn #F7EFE0/#6D4E18 · bad #F6E6E3/#8A3A2C · unknown #ECEEEE/#4E5C5E · info #E6ECF1/#2D4A60 | 색+아이콘+문구 |

## 타이포
Pretendard Variable 로컬 제공 (`public/fonts`, OFL 동봉). 본문 16px, 표 15px, 출처 13px, 상담 화면 모드 18px. 숫자 `tabular-nums` 우측 정렬, 과목명 좌측. `word-break: keep-all` + `overflow-wrap: anywhere` 로 긴 학교명·과목명 줄바꿈.

## 레이아웃
상단 전역 바 68px (검색·대상 입학연도·명령 팔레트). 좌측 탐색 236px(≥1024px). 우측 근거 서랍 420px(≥1200px; 그 아래에선 오버레이, ≤1023 모바일). 하단 고정 비교 바구니 바. 모바일 하단 탐색.

근거 서랍을 열어도 본문 스크롤·선택은 유지되고, Esc/닫기 후 원래 버튼으로 포커스가 돌아간다.

## 구성 요소 (`src/components/ui.tsx`)
- 버튼 `primary / secondary / quiet / destructive`, 높이 44(sm 36, lg 48), focus-visible 3px 황동 테두리, `loading` 은 폭 유지 스피너, `disabled`.
- 상태 배지 `StatusBadge`(DataStatus) / `Tone`(ok·warn·bad·unknown·info) — 아이콘 동반.
- `EvidenceButton` 작은 '근거' 버튼. 긴 URL 을 노출하지 않는다.
- `SyntheticBadge` '기능 검증용 가상 자료'.
- `Empty` 다음 행동 제공(자료 등록·필터 초기화·원문 확인). `Skeleton` 위치 유지. `ErrorBox` 재시도.
- `Interpretation` 해석 문장 (황동 좌측 선) — 근거 있는 사실과 시각적으로 구분.

## 표
`table.data`: 머리글 sticky top, 첫 열 sticky left, 행 경계 1px, `tr.diff` 차이 강조, `caption` 으로 기준 설명. 매트릭스(`.matrix`)는 학기 열 고정 폭, 셀 안의 과목 카드(지정 검정 좌측선 / 선택 황동 / 선택함 녹색 배경 / 관심 테두리).

## 움직임
서랍 슬라이드·페이드 180ms, `prefers-reduced-motion` 시 0ms. 데이터 표에 장식 애니메이션 없음.

## 접근성
skip link, 랜드마크(`main`, `nav`, `complementary`), 표 `caption`·`scope`, 정렬 버튼 `aria-sort`, 탭 `role=tab/aria-selected`, 키보드: `/` 검색, `Ctrl+K` 팔레트, `Esc` 서랍 닫기. 상태는 색만으로 구분하지 않는다.

## 인쇄
`@media print`: 탐색·바·서랍 숨김, 표 sticky 해제, 카드/행 `break-inside: avoid`, 16mm 여백, 브리핑 표지 축소. 한글·표·근거·자료 시점 포함.

## 이미지
`atlas-hero-{800,1400,2000}.{avif,webp}` 랜딩 우측 장식(모바일은 상단 180px 띠). `briefing-cover-{600,1200}` 브리핑 표지. 실제 학교 사진처럼 쓰지 않는다. 학교 사진은 공식 허용 자료가 있을 때만 출처·권한과 함께; 없으면 학교명 기반 중립 표지.
