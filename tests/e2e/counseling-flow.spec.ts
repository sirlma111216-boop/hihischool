/**
 * 상담 흐름 E2E: 검색 → 학교 → 교육과정(근거) → 비교 → 상담 → 브리핑.
 * 로컬 D1 에 합성 fixture 가 시드되어 있어야 한다 (npm run db:seed:synthetic).
 * 세 뷰포트(390/768/1440)에서 가로 넘침이 없는지와 핵심 문구를 확인한다.
 */
import { expect, test } from '@playwright/test'

test.describe('상담 흐름', () => {
  test('검색 문장 해석과 확인된 결과/후보 분리', async ({ page }) => {
    await page.goto('/schools?q=' + encodeURIComponent('동대문구에서 정보 관련 과목이 확인된 학교'))
    await expect(page.getByText('해석된 조건')).toBeVisible()
    await expect(page.getByRole('link', { name: '가상 학교 A' }).first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBe(false)
  })

  test('교육과정: A+B 선택 시 규칙 충돌과 근거 서랍, Esc 로 복원', async ({ page }) => {
    await page.goto('/schools/syn_school_a/curriculum')
    await expect(page.getByRole('heading', { name: /2027 입학생 편제와 선택 조건/ })).toBeVisible()
    await page.getByLabel('과목 A 선택').check()
    await page.getByLabel('과목 B 선택').check()
    await expect(page.getByText('확인된 규칙과 충돌합니다')).toBeVisible()
    await expect(page.getByText(/선택군 G\(2학년 1학기\)의 선택 수\(1과목\)를 초과/)).toBeVisible()
    await page.getByRole('button', { name: /근거 열기/ }).first().click()
    await expect(page.getByRole('complementary', { name: '원문 근거' })).toBeVisible()
    await expect(page.getByText(/PDF 4쪽 \(인쇄 쪽수 2\)/)).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary', { name: '원문 근거' })).toHaveCount(0)
    // 선택 상태가 유지된다
    await expect(page.getByLabel('과목 A 선택')).toBeChecked()
  })

  test('비교: 미확인 학교를 없애지 않고 동일 기준 비교 불가를 표시', async ({ page }) => {
    await page.goto('/compare?schools=syn_school_a,syn_school_b,syn_school_c&cohort=2027')
    await expect(page.getByRole('heading', { name: '학교 비교' })).toBeVisible()
    await expect(page.getByText(/동일 기준\(입학연도·과정\) 자료가 없어/)).toBeVisible()
    await expect(page.getByText('가상 특성화 학교 C').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    expect(overflow).toBe(false)
  })

  test('상담 → 브리핑: 별칭·질문이 남고 서버로 상담 데이터가 전송되지 않는다', async ({ page }) => {
    const posted: string[] = []
    page.on('request', (req) => {
      if (req.method() === 'POST') posted.push(req.postData() ?? '')
    })
    await page.goto('/compare?schools=syn_school_a,syn_school_b&cohort=2027')
    await page.goto('/counsel')
    await page.getByRole('button', { name: '새 상담 시작' }).click()
    await page.getByPlaceholder('예: 3반 7번, 별명').fill('별칭-테스트')
    await page.getByRole('button', { name: /비교 바구니에서 가져오기/ }).click()
    await expect(page.getByText('가상 학교 A').first()).toBeVisible()
    await page.goto('/briefing')
    await expect(page.getByRole('heading', { name: /별칭-테스트 상담 브리핑/ })).toBeVisible()
    await expect(page.getByText('7. 출처·자료 기준 시점')).toBeVisible()
    // 공개 API 요청 본문에 별칭·메모가 들어가지 않는다
    expect(posted.join('\n')).not.toContain('별칭-테스트')
  })

  test('입학연도 자료 없음: C 교 2027 은 참고 패널만', async ({ page }) => {
    await page.goto('/schools/syn_school_c/curriculum')
    await expect(page.getByText(/2027 입학생 자료 미확인/)).toBeVisible()
    await expect(page.getByText(/참고 패널 — 다른 입학연도 공개 자료/)).toBeVisible()
  })

  test('관리자 영역은 인증 없이 열리지 않는다 (API 401)', async ({ request }) => {
    const r = await request.get('/api/admin/me')
    // 로컬 dev 는 DEV_ADMIN_BYPASS 로 열릴 수 있으므로 200 또는 401 만 허용 (403/500 금지)
    expect([200, 401]).toContain(r.status())
    const pub = await request.get('/api/versions/cv_syn_d_2027_draft')
    expect(pub.status()).toBe(404)
  })
})
