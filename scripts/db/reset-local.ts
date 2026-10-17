/** 로컬 D1 상태를 지우고 migration 을 다시 적용한다. */
import { execSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
rmSync(path.join(root, '.wrangler/state'), { recursive: true, force: true })
execSync('npx wrangler d1 migrations apply highschool_atlas --local', { stdio: 'inherit', cwd: root })
console.log('로컬 D1 초기화 완료')
