/**
 * 합성 fixture 를 로컬 D1 에 시드한다 (개발·시연 전용).
 * 사용: npm run db:seed:synthetic            → 로컬 D1 (.wrangler/state)
 *      npm run db:seed:synthetic -- --sql-only → SQL 파일만 생성 (data/synthetic/seed.sql)
 * 배포 환경에는 가상 자료를 넣지 않는다 (--remote 를 지원하지 않음).
 */
import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { datasetStatements, statementsToSql } from '../../shared/dataset'
import { SYNTHETIC_DATASET } from '../../fixtures/synthetic'

const root = path.resolve(import.meta.dirname, '../..')
const out = path.join(root, 'data/synthetic/seed.sql')
mkdirSync(path.dirname(out), { recursive: true })
const sql = statementsToSql(datasetStatements(SYNTHETIC_DATASET))
writeFileSync(out, `-- 기능 검증용 가상 자료. 실제 학교와 무관. production 에 적용 금지.\n${sql}\n`, 'utf8')
console.log(`SQL 생성: ${path.relative(root, out)} (${sql.split('\n').length} 문)`)

if (!process.argv.includes('--sql-only')) {
  execSync(`npx wrangler d1 execute highschool_atlas --local --file "${out}"`, { stdio: 'inherit', cwd: root })
  console.log('로컬 D1 시드 완료 (가상 자료 4개교)')
}
