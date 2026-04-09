import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const schemaDir = path.join(root, 'generated', 'app-server-schema')
const tsDir = path.join(root, 'generated', 'app-server-ts')
const manifestPath = path.join(root, 'generated', 'app-server-protocol.manifest.json')

mkdirSync(schemaDir, { recursive: true })
mkdirSync(tsDir, { recursive: true })

const versionOutput = execFileSync('codex', ['--version'], {
  cwd: root,
  encoding: 'utf8',
}).trim()
const versionMatch = versionOutput.match(/codex-cli\s+([^\s]+)/)
if (!versionMatch) {
  throw new Error(`Unable to determine Codex version from: ${versionOutput}`)
}

execFileSync('codex', ['app-server', 'generate-json-schema', '--out', schemaDir], {
  cwd: root,
  stdio: 'inherit',
})
execFileSync('codex', ['app-server', 'generate-ts', '--out', tsDir], {
  cwd: root,
  stdio: 'inherit',
})

writeFileSync(
  manifestPath,
  JSON.stringify(
    {
      codexCliVersion: versionMatch[1],
      experimental: false,
      schemaDir: path.relative(root, schemaDir),
      tsDir: path.relative(root, tsDir),
      schemaBundle: path.relative(
        root,
        path.join(schemaDir, 'codex_app_server_protocol.schemas.json'),
      ),
      tsIndex: path.relative(root, path.join(tsDir, 'index.ts')),
    },
    null,
    2,
  ) + '\n',
)
