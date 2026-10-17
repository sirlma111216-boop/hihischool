/**
 * 기능 검증용 가상 자료 (synthetic fixture).
 * 모든 레코드는 isSynthetic=true 이며 실제 학교·과목·규칙과 무관하다.
 * production 조회에서는 자동 제외된다. 검증 시나리오(ACCEPTANCE_SCENARIOS)를 재현한다.
 */
import type { Dataset } from '../shared/dataset'
import type { CurriculumBundle, CurriculumOffering, SelectionGroup } from '../shared/types'

const T = '2026-10-17T00:00:00Z'
const SYN_NOTE = '기능 검증용 가상 자료'

function off(
  id: string,
  versionId: string,
  schoolId: string,
  cohortYear: number,
  name: string,
  grade: 1 | 2 | 3,
  semester: 1 | 2,
  credit: number | null,
  req: CurriculumOffering['requirementType'],
  extra: Partial<CurriculumOffering> = {},
): CurriculumOffering {
  return {
    id,
    versionId,
    schoolId,
    cohortYear,
    trackId: null,
    courseOriginalName: name,
    courseCanonicalId: null,
    revision: '2022',
    subjectGroup: extra.subjectGroup ?? '가상 교과군',
    courseCategory: extra.courseCategory ?? (req === 'school_designated' ? 'common' : 'unknown'),
    requirementType: req,
    grade,
    semester,
    creditValue: credit,
    creditUnit: 'credit',
    selectionGroupId: null,
    offeringStatus: 'planned',
    crossSemesterGroup: null,
    note: null,
    evidenceIds: [],
    ...extra,
  }
}

/* ---------------- 가상 학교 A: 2027 검토 완료 ---------------- */
const A = 'syn_school_a'
const A27 = 'cv_syn_a_2027'
const A26 = 'cv_syn_a_2026'
const docA27 = 'doc_syn_a_2027_table'
const docA27b = 'doc_syn_a_2027_guide'
const docA26 = 'doc_syn_a_2026_table'

const aOfferings: CurriculumOffering[] = [
  // 1학년 지정
  off('off_a27_kor1', A27, A, 2027, '공통국어1', 1, 1, 4, 'school_designated', { subjectGroup: '국어', evidenceIds: ['ev_a27_t1_r1'] }),
  off('off_a27_kor2', A27, A, 2027, '공통국어2', 1, 2, 4, 'school_designated', { subjectGroup: '국어', evidenceIds: ['ev_a27_t1_r1'] }),
  off('off_a27_math1', A27, A, 2027, '공통수학1', 1, 1, 4, 'school_designated', { subjectGroup: '수학', evidenceIds: ['ev_a27_t1_r2'] }),
  off('off_a27_math2', A27, A, 2027, '공통수학2', 1, 2, 4, 'school_designated', { subjectGroup: '수학', evidenceIds: ['ev_a27_t1_r2'] }),
  off('off_a27_eng1', A27, A, 2027, '공통영어1', 1, 1, 4, 'school_designated', { subjectGroup: '영어', evidenceIds: ['ev_a27_t1_r3'] }),
  off('off_a27_eng2', A27, A, 2027, '공통영어2', 1, 2, 4, 'school_designated', { subjectGroup: '영어', evidenceIds: ['ev_a27_t1_r3'] }),
  off('off_a27_info', A27, A, 2027, '정보', 1, 2, 3, 'school_designated', { subjectGroup: '기술·가정/정보', evidenceIds: ['ev_a27_t1_r4'] }),
  // 학점 미확인 (시나리오 08)
  off('off_a27_n', A27, A, 2027, '과목 N', 1, 1, null, 'school_designated', { subjectGroup: '가상 교과군', note: '원문 학점 칸 비어 있음', evidenceIds: ['ev_a27_t1_r5'] }),
  // 2학년 1학기 선택군 G: 과목 A/B/C 중 1과목 (시나리오 01)
  off('off_a27_A', A27, A, 2027, '과목 A', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a27_G', courseCategory: 'general_elective', evidenceIds: ['ev_a27_t2_rA'] }),
  off('off_a27_B', A27, A, 2027, '과목 B', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a27_G', courseCategory: 'general_elective', evidenceIds: ['ev_a27_t2_rB'] }),
  off('off_a27_C', A27, A, 2027, '과목 C', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a27_G', courseCategory: 'general_elective', evidenceIds: ['ev_a27_t2_rC'] }),
  // 선택군 H: 2학년 전체에서 1과목. D 는 1학기, E 는 2학기 (시나리오 06)
  off('off_a27_D', A27, A, 2027, '과목 D', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a27_H', courseCategory: 'career_elective', evidenceIds: ['ev_a27_t2_rD'] }),
  off('off_a27_E', A27, A, 2027, '과목 E', 2, 2, 3, 'student_choice', { selectionGroupId: 'sg_a27_H', courseCategory: 'career_elective', evidenceIds: ['ev_a27_t2_rD'] }),
  // 교차 편성 F: 1·2학기 표시, 한 번 이수 (시나리오 07)
  off('off_a27_F1', A27, A, 2027, '과목 F', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a27_X', crossSemesterGroup: 'xs_a27_F', note: '1·2학기 교차 편성', courseCategory: 'fusion_elective', evidenceIds: ['ev_a27_t2_rF'] }),
  off('off_a27_F2', A27, A, 2027, '과목 F', 2, 2, 3, 'student_choice', { selectionGroupId: 'sg_a27_X', crossSemesterGroup: 'xs_a27_F', note: '1·2학기 교차 편성', courseCategory: 'fusion_elective', evidenceIds: ['ev_a27_t2_rF'] }),
  off('off_a27_G2', A27, A, 2027, '과목 G', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a27_X', courseCategory: 'fusion_elective', evidenceIds: ['ev_a27_t2_rF'] }),
  // 선택군 K: 두 공식 문서가 선택 수를 다르게 제시 (시나리오 09)
  off('off_a27_P', A27, A, 2027, '과목 P', 3, 1, 4, 'student_choice', { selectionGroupId: 'sg_a27_K', courseCategory: 'career_elective', evidenceIds: ['ev_a27_t3_rP', 'ev_a27g_p5'] }),
  off('off_a27_Q', A27, A, 2027, '과목 Q', 3, 1, 4, 'student_choice', { selectionGroupId: 'sg_a27_K', courseCategory: 'career_elective', evidenceIds: ['ev_a27_t3_rP', 'ev_a27g_p5'] }),
  off('off_a27_R', A27, A, 2027, '과목 R', 3, 1, 4, 'student_choice', { selectionGroupId: 'sg_a27_K', courseCategory: 'career_elective', evidenceIds: ['ev_a27_t3_rP', 'ev_a27g_p5'] }),
  // 2학년 지정
  off('off_a27_kor3', A27, A, 2027, '문학', 2, 1, 4, 'school_designated', { subjectGroup: '국어', courseCategory: 'general_elective', evidenceIds: ['ev_a27_t2_r1'] }),
  off('off_a27_math3', A27, A, 2027, '대수', 2, 1, 4, 'school_designated', { subjectGroup: '수학', courseCategory: 'general_elective', evidenceIds: ['ev_a27_t2_r1'] }),
  off('off_a27_ai', A27, A, 2027, '인공지능 기초', 3, 2, 4, 'student_choice', { subjectGroup: '기술·가정/정보', selectionGroupId: 'sg_a27_K2', courseCategory: 'fusion_elective', evidenceIds: ['ev_a27_t3_rAI'] }),
  off('off_a27_ds', A27, A, 2027, '데이터 과학', 3, 2, 4, 'student_choice', { subjectGroup: '기술·가정/정보', selectionGroupId: 'sg_a27_K2', courseCategory: 'fusion_elective', evidenceIds: ['ev_a27_t3_rAI'] }),
]

const aGroups: SelectionGroup[] = [
  {
    id: 'sg_a27_G',
    versionId: A27,
    label: '선택군 G',
    scope: '2학년 1학기',
    memberOfferingIds: ['off_a27_A', 'off_a27_B', 'off_a27_C'],
    minSelections: 1,
    maxSelections: 1,
    minCredits: null,
    maxCredits: null,
    periodScope: 'semester',
    exceptions: [],
    verifiedRules: ['과목 A / B / C 중 1과목 선택'],
    unknownRules: [],
    ruleStatus: 'verified',
    evidenceIds: ['ev_a27_t2_G'],
  },
  {
    id: 'sg_a27_H',
    versionId: A27,
    label: '선택군 H',
    scope: '2학년 전체',
    memberOfferingIds: ['off_a27_D', 'off_a27_E'],
    minSelections: 1,
    maxSelections: 1,
    minCredits: null,
    maxCredits: null,
    periodScope: 'grade_year',
    exceptions: [],
    verifiedRules: ['2학년 전체에서 과목 D(1학기) 또는 과목 E(2학기) 중 1과목'],
    unknownRules: [],
    ruleStatus: 'verified',
    evidenceIds: ['ev_a27_t2_H'],
  },
  {
    id: 'sg_a27_X',
    versionId: A27,
    label: '선택군 X',
    scope: '2학년 전체',
    memberOfferingIds: ['off_a27_F1', 'off_a27_F2', 'off_a27_G2'],
    minSelections: null,
    maxSelections: 1,
    minCredits: null,
    maxCredits: 3,
    periodScope: 'grade_year',
    exceptions: ['과목 F 는 1·2학기 교차 편성(한 학기만 이수). 배정 반/그룹은 원문에 없음'],
    verifiedRules: ['과목 F 또는 과목 G 중 1과목 (최대 3학점)'],
    unknownRules: ['교차 편성 대상 반/그룹 미확인'],
    ruleStatus: 'verified',
    evidenceIds: ['ev_a27_t2_rF'],
  },
  {
    id: 'sg_a27_K',
    versionId: A27,
    label: '선택군 K',
    scope: '3학년 1학기',
    memberOfferingIds: ['off_a27_P', 'off_a27_Q', 'off_a27_R'],
    minSelections: null,
    maxSelections: null,
    minCredits: null,
    maxCredits: null,
    periodScope: 'semester',
    exceptions: [],
    verifiedRules: [],
    unknownRules: ['편제표는 3과목 중 1과목, 선택과목 안내서는 3과목 중 2과목으로 기재. 개정·대체 관계 미확인'],
    ruleStatus: 'conflict',
    evidenceIds: ['ev_a27_t3_rP', 'ev_a27g_p5'],
  },
  {
    id: 'sg_a27_K2',
    versionId: A27,
    label: '선택군 K2',
    scope: '3학년 2학기',
    memberOfferingIds: ['off_a27_ai', 'off_a27_ds'],
    minSelections: 1,
    maxSelections: 2,
    minCredits: null,
    maxCredits: null,
    periodScope: 'semester',
    exceptions: [],
    verifiedRules: ['인공지능 기초 / 데이터 과학 중 1~2과목'],
    unknownRules: [],
    ruleStatus: 'verified',
    evidenceIds: ['ev_a27_t3_rAI'],
  },
]

// 2026 입학생 (과거 자료, 참고 전용)
const a26Offerings: CurriculumOffering[] = [
  off('off_a26_kor1', A26, A, 2026, '공통국어1', 1, 1, 4, 'school_designated', { subjectGroup: '국어', evidenceIds: ['ev_a26_t1_r1'] }),
  off('off_a26_A', A26, A, 2026, '과목 A', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a26_G', courseCategory: 'general_elective', evidenceIds: ['ev_a26_t2_G'] }),
  off('off_a26_B', A26, A, 2026, '과목 B', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a26_G', courseCategory: 'general_elective', evidenceIds: ['ev_a26_t2_G'] }),
  off('off_a26_C', A26, A, 2026, '과목 C', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_a26_G', courseCategory: 'general_elective', evidenceIds: ['ev_a26_t2_G'] }),
]
const a26Groups: SelectionGroup[] = [
  {
    id: 'sg_a26_G',
    versionId: A26,
    label: '선택군 G',
    scope: '2학년 1학기',
    memberOfferingIds: ['off_a26_A', 'off_a26_B', 'off_a26_C'],
    minSelections: 2,
    maxSelections: 2,
    minCredits: null,
    maxCredits: null,
    periodScope: 'semester',
    exceptions: [],
    verifiedRules: ['과목 A / B / C 중 2과목 선택'],
    unknownRules: [],
    ruleStatus: 'verified',
    evidenceIds: ['ev_a26_t2_G'],
  },
]

/* ---------------- 가상 학교 B: 2027 검토 완료, G 는 3과목 중 2과목 ---------------- */
const B = 'syn_school_b'
const B27 = 'cv_syn_b_2027'
const docB27 = 'doc_syn_b_2027_table'
const bOfferings: CurriculumOffering[] = [
  off('off_b27_kor1', B27, B, 2027, '공통국어1', 1, 1, 4, 'school_designated', { subjectGroup: '국어', evidenceIds: ['ev_b27_t1_r1'] }),
  off('off_b27_math1', B27, B, 2027, '공통수학1', 1, 1, 4, 'school_designated', { subjectGroup: '수학', evidenceIds: ['ev_b27_t1_r1'] }),
  off('off_b27_info', B27, B, 2027, '정보', 1, 1, 3, 'school_designated', { subjectGroup: '기술·가정/정보', evidenceIds: ['ev_b27_t1_r1'] }),
  off('off_b27_A', B27, B, 2027, '과목 A', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_b27_G', courseCategory: 'general_elective', evidenceIds: ['ev_b27_t2_G'] }),
  off('off_b27_B', B27, B, 2027, '과목 B', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_b27_G', courseCategory: 'general_elective', evidenceIds: ['ev_b27_t2_G'] }),
  off('off_b27_C', B27, B, 2027, '과목 C', 2, 1, 3, 'student_choice', { selectionGroupId: 'sg_b27_G', courseCategory: 'general_elective', evidenceIds: ['ev_b27_t2_G'] }),
  // 선택군 규칙 없음 (시나리오 03): 같은 학기에 나열만 됨
  off('off_b27_M', B27, B, 2027, '과목 M', 3, 1, 4, 'student_choice', { courseCategory: 'career_elective', evidenceIds: ['ev_b27_t3_M'] }),
  off('off_b27_O', B27, B, 2027, '과목 O', 3, 1, 4, 'student_choice', { courseCategory: 'career_elective', evidenceIds: ['ev_b27_t3_M'] }),
  off('off_b27_ai', B27, B, 2027, '인공지능 기초', 2, 2, 4, 'student_choice', { subjectGroup: '기술·가정/정보', selectionGroupId: 'sg_b27_J', courseCategory: 'fusion_elective', evidenceIds: ['ev_b27_t2_J'] }),
  off('off_b27_prog', B27, B, 2027, '프로그래밍', 2, 2, 4, 'student_choice', { subjectGroup: '기술·가정/정보', selectionGroupId: 'sg_b27_J', courseCategory: 'career_elective', evidenceIds: ['ev_b27_t2_J'] }),
  off('off_b27_phys', B27, B, 2027, '물리학', 2, 2, 4, 'student_choice', { subjectGroup: '과학', selectionGroupId: 'sg_b27_J', courseCategory: 'general_elective', evidenceIds: ['ev_b27_t2_J'] }),
]
const bGroups: SelectionGroup[] = [
  {
    id: 'sg_b27_G',
    versionId: B27,
    label: '선택군 G',
    scope: '2학년 1학기',
    memberOfferingIds: ['off_b27_A', 'off_b27_B', 'off_b27_C'],
    minSelections: null, // 각주 '최대 2과목' 은 최소 2개 필수로 해석하지 않는다 (시나리오 02)
    maxSelections: 2,
    minCredits: null,
    maxCredits: null,
    periodScope: 'semester',
    exceptions: [],
    verifiedRules: ['과목 A / B / C 중 최대 2과목'],
    unknownRules: [],
    ruleStatus: 'verified',
    evidenceIds: ['ev_b27_t2_G'],
  },
  {
    id: 'sg_b27_J',
    versionId: B27,
    label: '선택군 J',
    scope: '2학년 2학기',
    memberOfferingIds: ['off_b27_ai', 'off_b27_prog', 'off_b27_phys'],
    minSelections: 1,
    maxSelections: 2,
    minCredits: null,
    maxCredits: 8,
    periodScope: 'semester',
    exceptions: ['인원 충족 시 개설'],
    verifiedRules: ['3과목 중 1~2과목, 최대 8학점'],
    unknownRules: [],
    ruleStatus: 'verified',
    evidenceIds: ['ev_b27_t2_J'],
  },
]

/* ---------------- 가상 학교 C: 특성화고, 2026 자료만, 학과 2개 ---------------- */
const C = 'syn_school_c'
const C26S = 'cv_syn_c_2026_sec'
const C26D = 'cv_syn_c_2026_des'
const docC26 = 'doc_syn_c_2026_table'
const cOfferings: CurriculumOffering[] = [
  off('off_c26s_sec1', C26S, C, 2026, '정보 보호', 2, 1, 3, 'school_designated', { trackId: 'trk_syn_c_sec', subjectGroup: '전문교과', courseCategory: 'specialized', evidenceIds: ['ev_c26_t2_sec'] }),
  off('off_c26s_A', C26S, C, 2026, '과목 A', 2, 1, 3, 'student_choice', { trackId: 'trk_syn_c_sec', selectionGroupId: 'sg_c26s_G', evidenceIds: ['ev_c26_t2_sec'] }),
  off('off_c26s_B', C26S, C, 2026, '과목 B', 2, 1, 3, 'student_choice', { trackId: 'trk_syn_c_sec', selectionGroupId: 'sg_c26s_G', evidenceIds: ['ev_c26_t2_sec'] }),
  off('off_c26d_des1', C26D, C, 2026, '디자인 일반', 2, 1, 3, 'school_designated', { trackId: 'trk_syn_c_des', subjectGroup: '전문교과', courseCategory: 'specialized', evidenceIds: ['ev_c26_t2_des'] }),
  off('off_c26d_A', C26D, C, 2026, '과목 A', 2, 1, 3, 'student_choice', { trackId: 'trk_syn_c_des', selectionGroupId: 'sg_c26d_G', evidenceIds: ['ev_c26_t2_des'] }),
  off('off_c26d_B', C26D, C, 2026, '과목 B', 2, 1, 3, 'student_choice', { trackId: 'trk_syn_c_des', selectionGroupId: 'sg_c26d_G', evidenceIds: ['ev_c26_t2_des'] }),
]
const cGroups: SelectionGroup[] = [
  { id: 'sg_c26s_G', versionId: C26S, label: '선택군 G', scope: '2학년 1학기', memberOfferingIds: ['off_c26s_A', 'off_c26s_B'], minSelections: 1, maxSelections: 1, minCredits: null, maxCredits: null, periodScope: 'semester', exceptions: [], verifiedRules: ['2과목 중 1과목'], unknownRules: [], ruleStatus: 'verified', evidenceIds: ['ev_c26_t2_sec'] },
  { id: 'sg_c26d_G', versionId: C26D, label: '선택군 G', scope: '2학년 1학기', memberOfferingIds: ['off_c26d_A', 'off_c26d_B'], minSelections: 2, maxSelections: 2, minCredits: null, maxCredits: null, periodScope: 'semester', exceptions: [], verifiedRules: ['2과목 모두 이수'], unknownRules: [], ruleStatus: 'verified', evidenceIds: ['ev_c26_t2_des'] },
]

/* ---------------- 가상 학교 D: 2027 초안만 (미검토) ---------------- */
const D = 'syn_school_d'
const D27 = 'cv_syn_d_2027_draft'
const docD27 = 'doc_syn_d_2027_table'
const dOfferings: CurriculumOffering[] = [
  off('off_d27_kor1', D27, D, 2027, '공통국어1', 1, 1, 4, 'school_designated', { subjectGroup: '국어', evidenceIds: ['ev_d27_t1'] }),
  off('off_d27_A', D27, D, 2027, '과목 A', 2, 1, 3, 'student_choice', { evidenceIds: ['ev_d27_t1'] }),
]

export const SYNTHETIC_DATASET: Dataset = {
  schools: [
    {
      id: A,
      officialName: '가상 학교 A',
      shortName: 'A고',
      aliases: ['가상A고', '가상에이고'],
      district: '동대문구',
      districtCode: '11230',
      schoolType: 'general',
      schoolTypeStatus: 'confirmed',
      schoolSubtype: null,
      sourceConflicts: [],
      establishment: 'public',
      gender: 'coed',
      dayNight: 'day',
      operatingStatus: 'operating',
      address: '서울특별시 동대문구 (가상 주소)',
      geo: { lat: 37.5744, lng: 127.0396, source: 'synthetic', retrievedAt: T },
      homepage: null,
      codes: [{ provider: 'manual', code: 'SYN-A', status: 'confirmed', evidenceIds: [] }],
      tracks: [],
      isSynthetic: true,
      retrievedAt: T,
      sourceDocumentId: null,
      exclusionReason: null,
    },
    {
      id: B,
      officialName: '가상 학교 B',
      shortName: 'B고',
      aliases: ['가상B고'],
      district: '성북구',
      districtCode: '11290',
      schoolType: 'general',
      schoolTypeStatus: 'confirmed',
      schoolSubtype: null,
      sourceConflicts: [],
      establishment: 'private',
      gender: 'girls',
      dayNight: 'day',
      operatingStatus: 'operating',
      address: '서울특별시 성북구 (가상 주소)',
      geo: { lat: 37.6066, lng: 127.0232, source: 'synthetic', retrievedAt: T },
      homepage: null,
      codes: [{ provider: 'manual', code: 'SYN-B', status: 'confirmed', evidenceIds: [] }],
      tracks: [],
      isSynthetic: true,
      retrievedAt: T,
      sourceDocumentId: null,
      exclusionReason: null,
    },
    {
      id: C,
      officialName: '가상 특성화 학교 C',
      shortName: 'C고',
      aliases: [],
      district: '중랑구',
      districtCode: '11260',
      schoolType: 'specialized',
      schoolTypeStatus: 'confirmed',
      schoolSubtype: null,
      sourceConflicts: [],
      establishment: 'public',
      gender: 'coed',
      dayNight: 'day',
      operatingStatus: 'operating',
      address: '서울특별시 중랑구 (가상 주소)',
      geo: null,
      homepage: null,
      codes: [{ provider: 'manual', code: 'SYN-C', status: 'confirmed', evidenceIds: [] }],
      tracks: [],
      isSynthetic: true,
      retrievedAt: T,
      sourceDocumentId: null,
      exclusionReason: null,
    },
    {
      id: D,
      officialName: '가상 학교 D',
      shortName: 'D고',
      aliases: [],
      district: '노원구',
      districtCode: '11350',
      schoolType: 'unknown',
      schoolTypeStatus: 'not_collected',
      schoolSubtype: null,
      sourceConflicts: [],
      establishment: 'unknown',
      gender: 'unknown',
      dayNight: 'unknown',
      operatingStatus: 'unknown',
      address: null,
      geo: { lat: 37.6542, lng: 127.0568, source: 'synthetic', retrievedAt: T },
      homepage: null,
      codes: [{ provider: 'manual', code: 'SYN-D', status: 'pending', evidenceIds: [] }],
      tracks: [],
      isSynthetic: true,
      retrievedAt: T,
      sourceDocumentId: null,
      exclusionReason: null,
    },
  ],
  tracks: [
    { id: 'trk_syn_c_sec', schoolId: C, name: '정보보안과', kind: 'department', status: 'confirmed' },
    { id: 'trk_syn_c_des', schoolId: C, name: '디자인과', kind: 'department', status: 'confirmed' },
  ],
  documents: [
    { id: docA27, schoolId: A, documentType: 'curriculum_table', title: '2027학년도 입학생 교육과정 편제표 (가상)', officialUrl: null, originalFilename: 'syn-a-2027-table.pdf', publisher: '가상 학교 A', publishedAt: '2026-03-02', retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: '2022', trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
    { id: docA27b, schoolId: A, documentType: 'course_guide', title: '2027 입학생 선택과목 안내서 (가상)', officialUrl: null, originalFilename: 'syn-a-2027-guide.pdf', publisher: '가상 학교 A', publishedAt: '2026-05-10', retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: '2022', trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: '선택군 K 의 선택 수가 편제표와 다름' },
    { id: docA26, schoolId: A, documentType: 'curriculum_table', title: '2026학년도 입학생 교육과정 편제표 (가상)', officialUrl: null, originalFilename: 'syn-a-2026-table.pdf', publisher: '가상 학교 A', publishedAt: '2025-03-03', retrievedAt: T, applicableAcademicYear: 2026, cohortYear: 2026, curriculumRevision: '2022', trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
    { id: docB27, schoolId: B, documentType: 'curriculum_table', title: '2027학년도 입학생 교육과정 편제표 (가상)', officialUrl: null, originalFilename: 'syn-b-2027-table.pdf', publisher: '가상 학교 B', publishedAt: '2026-03-05', retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: '2022', trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
    { id: docC26, schoolId: C, documentType: 'curriculum_table', title: '2026학년도 입학생 학과별 편제표 (가상)', officialUrl: null, originalFilename: 'syn-c-2026-table.hwpx', publisher: '가상 특성화 학교 C', publishedAt: '2025-02-20', retrievedAt: T, applicableAcademicYear: 2026, cohortYear: 2026, curriculumRevision: '2022', trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
    { id: docD27, schoolId: D, documentType: 'curriculum_table', title: '2027학년도 입학생 편제표 (가상, 추출 초안)', officialUrl: null, originalFilename: 'syn-d-2027-scan.pdf', publisher: '가상 학교 D', publishedAt: null, retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: '2022', trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'extracted', reviewStatus: 'draft', supersedesId: null, isSynthetic: true, notes: '스캔 PDF OCR 초안. 사람 검토 전' },
    { id: 'doc_syn_adm_plan_v1', schoolId: null, documentType: 'admission_plan', title: '2027학년도 고입 기본계획 (가상 최초본)', officialUrl: null, originalFilename: null, publisher: '가상 교육청', publishedAt: '2026-03-31', retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: null, trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'superseded', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
    { id: 'doc_syn_adm_plan_v2', schoolId: null, documentType: 'admission_revision', title: '2027학년도 고입 기본계획 변경 공고 (가상)', officialUrl: null, originalFilename: null, publisher: '가상 교육청', publishedAt: '2026-07-15', retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: null, trackId: null, version: '2', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: 'doc_syn_adm_plan_v1', isSynthetic: true, notes: SYN_NOTE },
    { id: 'doc_syn_a_adm', schoolId: A, documentType: 'admission_guide', title: '2027학년도 신입생 모집요강 (가상)', officialUrl: null, originalFilename: null, publisher: '가상 학교 A', publishedAt: '2026-09-01', retrievedAt: T, applicableAcademicYear: 2027, cohortYear: 2027, curriculumRevision: null, trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
    { id: 'doc_syn_disclosure_2025', schoolId: null, documentType: 'disclosure', title: '2025년 학교 공시 (가상)', officialUrl: null, originalFilename: null, publisher: '가상 공시', publishedAt: '2025-09-01', retrievedAt: T, applicableAcademicYear: 2025, cohortYear: null, curriculumRevision: null, trackId: null, version: '1', sha256: null, rights: 'official_public', parseStatus: 'manual', reviewStatus: 'approved', supersedesId: null, isSynthetic: true, notes: SYN_NOTE },
  ],
  evidence: [
    // PDF 배열 페이지(0-based 3 = 4번째)와 인쇄 쪽수 "2" 가 다름 (시나리오 13). 좌표 있음.
    { id: 'ev_a27_t1_r1', documentId: docA27, pdfPageIndex: 3, printedPageLabel: '2', tableId: 'T1', rowIndex: 1, columnIndex: null, boundingBox: { x: 60, y: 180, width: 480, height: 22, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: null, excerpt: '공통국어1 4 / 공통국어2 4', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t1_r2', documentId: docA27, pdfPageIndex: 3, printedPageLabel: '2', tableId: 'T1', rowIndex: 2, columnIndex: null, boundingBox: { x: 60, y: 204, width: 480, height: 22, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: null, excerpt: '공통수학1 4 / 공통수학2 4', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t1_r3', documentId: docA27, pdfPageIndex: 3, printedPageLabel: '2', tableId: 'T1', rowIndex: 3, columnIndex: null, boundingBox: null, paragraphAnchor: 'T1/행3', excerpt: '공통영어1 4 / 공통영어2 4', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t1_r4', documentId: docA27, pdfPageIndex: 3, printedPageLabel: '2', tableId: 'T1', rowIndex: 4, columnIndex: null, boundingBox: null, paragraphAnchor: 'T1/행4', excerpt: '정보 3 (1학년 2학기)', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t1_r5', documentId: docA27, pdfPageIndex: 3, printedPageLabel: '2', tableId: 'T1', rowIndex: 5, columnIndex: 4, boundingBox: null, paragraphAnchor: 'T1/행5', excerpt: '과목 N (학점 칸 공란)', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_r1', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: 1, columnIndex: null, boundingBox: null, paragraphAnchor: 'T2/행1', excerpt: '문학 4 / 대수 4 (2학년 1학기 지정)', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_rA', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: 6, columnIndex: null, boundingBox: { x: 60, y: 300, width: 480, height: 22, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: null, excerpt: '과목 A 3 [G]', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_rB', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: 7, columnIndex: null, boundingBox: { x: 60, y: 324, width: 480, height: 22, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: null, excerpt: '과목 B 3 [G]', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_rC', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: 8, columnIndex: null, boundingBox: { x: 60, y: 348, width: 480, height: 22, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: null, excerpt: '과목 C 3 [G]', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_G', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: null, columnIndex: null, boundingBox: { x: 60, y: 700, width: 480, height: 20, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: '각주 G', excerpt: '선택군 G: 과목 A / B / C 중 1과목 선택', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_rD', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: 9, columnIndex: null, boundingBox: null, paragraphAnchor: 'T2/행9-10', excerpt: '과목 D 3 (1학기) [H] / 과목 E 3 (2학기) [H]', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_H', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '각주 H', excerpt: '선택군 H: 2학년 전체에서 1과목', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t2_rF', documentId: docA27, pdfPageIndex: 4, printedPageLabel: '3', tableId: 'T2', rowIndex: 11, columnIndex: null, boundingBox: null, paragraphAnchor: 'T2/행11-12, 각주 X', excerpt: '과목 F 3 (1·2학기 교차 편성) / 과목 G 3 — 선택군 X: F 또는 G 중 1과목', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t3_rP', documentId: docA27, pdfPageIndex: 5, printedPageLabel: '4', tableId: 'T3', rowIndex: 3, columnIndex: null, boundingBox: null, paragraphAnchor: 'T3/행3-5, 각주 K', excerpt: '과목 P / Q / R 각 4 — 선택군 K: 3과목 중 1과목', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27g_p5', documentId: docA27b, pdfPageIndex: 4, printedPageLabel: '5', tableId: null, rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '3학년 선택 안내 2문단', excerpt: '선택군 K 에서는 2과목을 선택합니다', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a27_t3_rAI', documentId: docA27, pdfPageIndex: 5, printedPageLabel: '4', tableId: 'T3', rowIndex: 8, columnIndex: null, boundingBox: null, paragraphAnchor: 'T3/행8-9, 각주 K2', excerpt: '인공지능 기초 4 / 데이터 과학 4 — 선택군 K2: 1~2과목', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a26_t1_r1', documentId: docA26, pdfPageIndex: 2, printedPageLabel: '2', tableId: 'T1', rowIndex: 1, columnIndex: null, boundingBox: null, paragraphAnchor: 'T1/행1', excerpt: '공통국어1 4', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a26_t2_G', documentId: docA26, pdfPageIndex: 3, printedPageLabel: '3', tableId: 'T2', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '각주 G', excerpt: '선택군 G: 과목 A / B / C 중 2과목', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_b27_t1_r1', documentId: docB27, pdfPageIndex: 1, printedPageLabel: '1', tableId: 'T1', rowIndex: 1, columnIndex: null, boundingBox: null, paragraphAnchor: 'T1/행1-3', excerpt: '공통국어1 4 / 공통수학1 4 / 정보 3', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_b27_t2_G', documentId: docB27, pdfPageIndex: 2, printedPageLabel: '2', tableId: 'T2', rowIndex: null, columnIndex: null, boundingBox: { x: 60, y: 690, width: 480, height: 20, pageWidth: 595, pageHeight: 842 }, paragraphAnchor: '각주 G', excerpt: '선택군 G: 과목 A / B / C 중 최대 2과목', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_b27_t2_J', documentId: docB27, pdfPageIndex: 2, printedPageLabel: '2', tableId: 'T2', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '각주 J', excerpt: '선택군 J: 인공지능 기초 / 프로그래밍 / 물리학 중 1~2과목 (최대 8학점, 인원 충족 시 개설)', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_b27_t3_M', documentId: docB27, pdfPageIndex: 3, printedPageLabel: '3', tableId: 'T3', rowIndex: 4, columnIndex: null, boundingBox: null, paragraphAnchor: 'T3/행4-5', excerpt: '과목 M 4 / 과목 O 4 (선택 조건 표기 없음)', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_c26_t2_sec', documentId: docC26, pdfPageIndex: null, printedPageLabel: null, tableId: '정보보안과 편제표', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: 'HWPX 표 2', excerpt: '정보보안과: 정보 보호 3 (지정), 과목 A / B 중 1과목', extractionMethod: 'hwpx', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_c26_t2_des', documentId: docC26, pdfPageIndex: null, printedPageLabel: null, tableId: '디자인과 편제표', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: 'HWPX 표 3', excerpt: '디자인과: 디자인 일반 3 (지정), 과목 A / B 모두 이수', extractionMethod: 'hwpx', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_d27_t1', documentId: docD27, pdfPageIndex: 0, printedPageLabel: null, tableId: 'OCR-T1', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: 'OCR 표 1', excerpt: '공통국어1 4 / 과목 A 3 (OCR 신뢰도 낮음)', extractionMethod: 'ocr', reviewedBy: null, reviewedAt: null, isSynthetic: true },
    { id: 'ev_adm_v1', documentId: 'doc_syn_adm_plan_v1', pdfPageIndex: 11, printedPageLabel: '10', tableId: null, rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '후기 일반고 원서접수', excerpt: '원서접수 12월 7일~9일', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_adm_v2', documentId: 'doc_syn_adm_plan_v2', pdfPageIndex: 1, printedPageLabel: '1', tableId: null, rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '변경 사항 1', excerpt: '원서접수 12월 8일~10일 로 변경', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_a_adm', documentId: 'doc_syn_a_adm', pdfPageIndex: 0, printedPageLabel: '1', tableId: null, rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '1. 모집 인원 및 전형', excerpt: '학교장 선발 (전기), 서류·면접', extractionMethod: 'manual', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_disc_a', documentId: 'doc_syn_disclosure_2025', pdfPageIndex: null, printedPageLabel: null, tableId: '학생 현황', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '가상 학교 A 행', excerpt: '학생 수 720, 학급 수 24, 교원 수 58 (2025.4.1 기준)', extractionMethod: 'api', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
    { id: 'ev_disc_b', documentId: 'doc_syn_disclosure_2025', pdfPageIndex: null, printedPageLabel: null, tableId: '학생 현황', rowIndex: null, columnIndex: null, boundingBox: null, paragraphAnchor: '가상 학교 B 행', excerpt: '학생 수 640, 학급 수 22, 교원 수 55 (2025.4.1 기준), 기숙사 0명', extractionMethod: 'api', reviewedBy: '검토자(가상)', reviewedAt: T, isSynthetic: true },
  ],
  versions: [
    { id: A27, schoolId: A, cohortYear: 2027, trackId: null, revision: '2022', status: 'published', reviewStatus: 'approved', documentIds: [docA27, docA27b], reviewedBy: '검토자(가상)', reviewedAt: T, publishedAt: T, supersedesId: null, notes: SYN_NOTE, isSynthetic: true },
    { id: A26, schoolId: A, cohortYear: 2026, trackId: null, revision: '2022', status: 'published', reviewStatus: 'approved', documentIds: [docA26], reviewedBy: '검토자(가상)', reviewedAt: T, publishedAt: T, supersedesId: null, notes: SYN_NOTE, isSynthetic: true },
    { id: B27, schoolId: B, cohortYear: 2027, trackId: null, revision: '2022', status: 'published', reviewStatus: 'approved', documentIds: [docB27], reviewedBy: '검토자(가상)', reviewedAt: T, publishedAt: T, supersedesId: null, notes: SYN_NOTE, isSynthetic: true },
    { id: C26S, schoolId: C, cohortYear: 2026, trackId: 'trk_syn_c_sec', revision: '2022', status: 'published', reviewStatus: 'approved', documentIds: [docC26], reviewedBy: '검토자(가상)', reviewedAt: T, publishedAt: T, supersedesId: null, notes: SYN_NOTE, isSynthetic: true },
    { id: C26D, schoolId: C, cohortYear: 2026, trackId: 'trk_syn_c_des', revision: '2022', status: 'published', reviewStatus: 'approved', documentIds: [docC26], reviewedBy: '검토자(가상)', reviewedAt: T, publishedAt: T, supersedesId: null, notes: SYN_NOTE, isSynthetic: true },
    { id: D27, schoolId: D, cohortYear: 2027, trackId: null, revision: '2022', status: 'draft', reviewStatus: 'draft', documentIds: [docD27], reviewedBy: null, reviewedAt: null, publishedAt: null, supersedesId: null, notes: 'OCR 초안, 검토 대기', isSynthetic: true },
  ],
  offerings: [...aOfferings, ...a26Offerings, ...bOfferings, ...cOfferings, ...dOfferings],
  selectionGroups: [...aGroups, ...a26Groups, ...bGroups, ...cGroups],
  facts: [
    { id: 'fact_a_students', schoolId: A, field: 'students.total', value: 720, unit: '명', basisYear: 2025, definition: '2025.4.1 기준 재학생 전체', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_a'], derivation: null, reviewerNote: null },
    { id: 'fact_a_classes', schoolId: A, field: 'classes.total', value: 24, unit: '학급', basisYear: 2025, definition: '2025.4.1 기준 학급 수', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_a'], derivation: null, reviewerNote: null },
    { id: 'fact_a_teachers', schoolId: A, field: 'teachers.total', value: 58, unit: '명', basisYear: 2025, definition: '전체 교원 (특정 교원 범주 아님)', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_a'], derivation: null, reviewerNote: null },
    { id: 'fact_a_dorm', schoolId: A, field: 'dormitory.capacity', value: null, unit: '명', basisYear: 2025, definition: '기숙사 수용 인원', validFrom: null, validTo: null, status: 'no_data', evidenceIds: [], derivation: null, reviewerNote: '공시 항목에 없음 (미공개). 0 이 아님' },
    { id: 'fact_b_students', schoolId: B, field: 'students.total', value: 640, unit: '명', basisYear: 2025, definition: '2025.4.1 기준 재학생 전체', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_b'], derivation: null, reviewerNote: null },
    { id: 'fact_b_classes', schoolId: B, field: 'classes.total', value: 22, unit: '학급', basisYear: 2025, definition: '2025.4.1 기준 학급 수', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_b'], derivation: null, reviewerNote: null },
    { id: 'fact_b_teachers', schoolId: B, field: 'teachers.total', value: 55, unit: '명', basisYear: 2025, definition: '전체 교원', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_b'], derivation: null, reviewerNote: null },
    { id: 'fact_b_dorm', schoolId: B, field: 'dormitory.capacity', value: 0, unit: '명', basisYear: 2025, definition: '기숙사 수용 인원', validFrom: '2025-04-01', validTo: null, status: 'confirmed', evidenceIds: ['ev_disc_b'], derivation: null, reviewerNote: '공시값 0 (미공개와 다름)' },
    { id: 'fact_c_students', schoolId: C, field: 'students.total', value: null, unit: '명', basisYear: null, definition: null, validFrom: null, validTo: null, status: 'not_collected', evidenceIds: [], derivation: null, reviewerNote: null },
  ],
  programs: [
    { id: 'prg_a_club_sw', schoolId: A, name: '소프트웨어 동아리 (가상)', kind: 'club', phase: 'plan', basisYear: 2026, availability: '2026 학교교육계획에 계획으로 기재. 매년 운영을 가정하지 않음', status: 'confirmed', evidenceIds: [], isSynthetic: true },
    { id: 'prg_a_dorm', schoolId: A, name: '기숙사 (가상)', kind: 'dormitory', phase: 'unknown', basisYear: null, availability: '시설 존재 여부·선발 조건 미확인', status: 'not_collected', evidenceIds: [], isSynthetic: true },
    { id: 'prg_b_lab', schoolId: B, name: '과학 실험실 (가상)', kind: 'facility', phase: 'result', basisYear: 2025, availability: '2025 운영 결과 보고에 사용 실적 기재', status: 'confirmed', evidenceIds: [], isSynthetic: true },
  ],
  admissionRules: [
    { id: 'adm_syn_general_2027_v1', schoolId: null, schoolType: 'general', admissionYear: 2027, round: '후기', selectionAuthority: 'superintendent_assignment', title: '후기 일반고 학교 선택·배정 (가상 최초본)', eligibilityConditions: [{ label: '거주지 요건', status: 'confirmed', detail: '가상 기준', evidenceIds: ['ev_adm_v1'] }], status: 'superseded', version: '1', supersedesId: null, documentId: 'doc_syn_adm_plan_v1', evidenceIds: ['ev_adm_v1'], notes: SYN_NOTE, isSynthetic: true },
    { id: 'adm_syn_general_2027_v2', schoolId: null, schoolType: 'general', admissionYear: 2027, round: '후기', selectionAuthority: 'superintendent_assignment', title: '후기 일반고 학교 선택·배정 (가상 변경본)', eligibilityConditions: [{ label: '거주지 요건', status: 'confirmed', detail: '가상 기준', evidenceIds: ['ev_adm_v2'] }, { label: '중복지원 가능 여부', status: 'not_collected', detail: '검토된 공식 규정 없음', evidenceIds: [] }], status: 'published', version: '2', supersedesId: 'adm_syn_general_2027_v1', documentId: 'doc_syn_adm_plan_v2', evidenceIds: ['ev_adm_v2'], notes: '원서접수 일정 변경', isSynthetic: true },
    { id: 'adm_syn_a_2027', schoolId: A, schoolType: 'general', admissionYear: 2027, round: '전기', selectionAuthority: 'principal_selection', title: '가상 학교 A 신입생 선발 (학교장 선발)', eligibilityConditions: [{ label: '지원 자격', status: 'confirmed', detail: '가상 자격 요건', evidenceIds: ['ev_a_adm'] }, { label: '제출 서류', status: 'confirmed', detail: '서류·면접', evidenceIds: ['ev_a_adm'] }], status: 'published', version: '1', supersedesId: null, documentId: 'doc_syn_a_adm', evidenceIds: ['ev_a_adm'], notes: SYN_NOTE, isSynthetic: true },
  ],
  admissionEvents: [
    { id: 'evt_syn_general_apply_v1', ruleId: 'adm_syn_general_2027_v1', schoolId: null, admissionYear: 2027, title: '후기 일반고 원서접수 (가상, 최초본)', date: '2026-12-07', endDate: '2026-12-09', time: null, allDay: true, timezone: 'Asia/Seoul', status: 'revised', confirmedAt: T, evidenceIds: ['ev_adm_v1'], isSynthetic: true },
    { id: 'evt_syn_general_apply_v2', ruleId: 'adm_syn_general_2027_v2', schoolId: null, admissionYear: 2027, title: '후기 일반고 원서접수 (가상, 변경본)', date: '2026-12-08', endDate: '2026-12-10', time: null, allDay: true, timezone: 'Asia/Seoul', status: 'scheduled', confirmedAt: T, evidenceIds: ['ev_adm_v2'], isSynthetic: true },
    { id: 'evt_syn_a_apply', ruleId: 'adm_syn_a_2027', schoolId: A, admissionYear: 2027, title: '가상 학교 A 원서접수', date: '2026-12-08', endDate: '2026-12-09', time: null, allDay: true, timezone: 'Asia/Seoul', status: 'scheduled', confirmedAt: T, evidenceIds: ['ev_a_adm'], isSynthetic: true },
    { id: 'evt_syn_a_interview', ruleId: 'adm_syn_a_2027', schoolId: A, admissionYear: 2027, title: '가상 학교 A 면접', date: '2026-12-15', endDate: null, time: '14:00', allDay: false, timezone: 'Asia/Seoul', status: 'scheduled', confirmedAt: T, evidenceIds: ['ev_a_adm'], isSynthetic: true },
  ],
}

/** 테스트에서 버전 id 로 묶음을 바로 꺼낸다. */
export function syntheticBundle(versionId: string): CurriculumBundle {
  const ds = SYNTHETIC_DATASET
  const version = ds.versions.find((v) => v.id === versionId)
  if (!version) throw new Error(`no synthetic version ${versionId}`)
  const offerings = ds.offerings.filter((o) => o.versionId === versionId)
  const selectionGroups = ds.selectionGroups.filter((g) => g.versionId === versionId)
  const documents = ds.documents.filter((d) => version.documentIds.includes(d.id))
  const evidenceIds = new Set([...offerings.flatMap((o) => o.evidenceIds), ...selectionGroups.flatMap((g) => g.evidenceIds)])
  const evidence = ds.evidence.filter((e) => evidenceIds.has(e.id))
  return { version, offerings, selectionGroups, documents, evidence }
}

export const SYN = { A, B, C, D, A27, A26, B27, C26S, C26D, D27 }
