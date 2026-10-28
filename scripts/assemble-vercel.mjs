// Collects the built apps into one folder: shell at the root, remotes under /remotes/<name>.
import { cpSync, rmSync, mkdirSync } from 'node:fs'

const out = 'dist-vercel'
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
cpSync('apps/shell/dist', out, { recursive: true })
for (const name of ['planning', 'monitoring', 'learning', 'ai']) {
  cpSync(`apps/${name}/dist`, `${out}/remotes/${name}`, { recursive: true })
}
console.log(`Assembled ${out}`)
