/**
 * 서울특별시 25개 자치구와 법정 시군구 코드(행정표준코드 5자리).
 * 학교알리미 신규 키의 sgg 파라미터 형식은 공식 표에서 확인해야 하며,
 * 다르면 scripts/ingest/schoolinfo.config.json 에서 매핑을 덮어쓴다.
 */
export interface DistrictInfo {
  name: string
  legalCode: string
  /** 교육지원청 관할. 행정구와 별개로 관리한다. */
  educationOffice: string
}

export const SEOUL_DISTRICTS: DistrictInfo[] = [
  { name: '종로구', legalCode: '11110', educationOffice: '중부' },
  { name: '중구', legalCode: '11140', educationOffice: '중부' },
  { name: '용산구', legalCode: '11170', educationOffice: '중부' },
  { name: '성동구', legalCode: '11200', educationOffice: '성동광진' },
  { name: '광진구', legalCode: '11215', educationOffice: '성동광진' },
  { name: '동대문구', legalCode: '11230', educationOffice: '동부' },
  { name: '중랑구', legalCode: '11260', educationOffice: '동부' },
  { name: '성북구', legalCode: '11290', educationOffice: '성북강북' },
  { name: '강북구', legalCode: '11305', educationOffice: '성북강북' },
  { name: '도봉구', legalCode: '11320', educationOffice: '북부' },
  { name: '노원구', legalCode: '11350', educationOffice: '북부' },
  { name: '은평구', legalCode: '11380', educationOffice: '서부' },
  { name: '서대문구', legalCode: '11410', educationOffice: '서부' },
  { name: '마포구', legalCode: '11440', educationOffice: '서부' },
  { name: '양천구', legalCode: '11470', educationOffice: '강서양천' },
  { name: '강서구', legalCode: '11500', educationOffice: '강서양천' },
  { name: '구로구', legalCode: '11530', educationOffice: '남부' },
  { name: '금천구', legalCode: '11545', educationOffice: '남부' },
  { name: '영등포구', legalCode: '11560', educationOffice: '남부' },
  { name: '동작구', legalCode: '11590', educationOffice: '동작관악' },
  { name: '관악구', legalCode: '11620', educationOffice: '동작관악' },
  { name: '서초구', legalCode: '11650', educationOffice: '강남서초' },
  { name: '강남구', legalCode: '11680', educationOffice: '강남서초' },
  { name: '송파구', legalCode: '11710', educationOffice: '강동송파' },
  { name: '강동구', legalCode: '11740', educationOffice: '강동송파' },
]

export const DISTRICT_NAMES = SEOUL_DISTRICTS.map((d) => d.name)

export const MAX_COMPARE_SCHOOLS = 4
export const DEFAULT_COMPARE_SCHOOLS = 3

/** 계산 범위 제한: 선택군 조합 탐색 노드 수와 시간. */
export const PLANNER_MAX_NODES = 5000
export const PLANNER_MAX_MS = 800

/** 시연·시작 시 제안하는 기본 대상 입학연도. 사용자가 명시적으로 선택해야 한다. */
/** 2026-10-17 사용자 결정: 공개된 편제표가 모두 2026 입학생용이라 당분간 2026 을 기본값으로 둔다. 2027 자료가 확보되면 바꾼다. */
export const DEFAULT_COHORT_YEAR = 2026
export function suggestedCohortYear(_now = new Date()): number {
  return DEFAULT_COHORT_YEAR
}
