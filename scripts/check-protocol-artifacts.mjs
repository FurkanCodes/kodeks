import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = path.join(root, 'generated', 'app-server-protocol.manifest.json')

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (!existsSync(manifestPath)) {
  fail('Missing generated/app-server-protocol.manifest.json. Run `npm run protocol:refresh`.')
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.experimental !== false) {
  fail('Protocol artifacts must be generated without experimental fields enabled.')
}

const requiredFiles = [
  manifest.schemaBundle,
  manifest.tsIndex,
  'generated/app-server-ts/ServerNotification.ts',
  'generated/app-server-ts/ServerRequest.ts',
]

for (const relativePath of requiredFiles) {
  const absolutePath = path.join(root, relativePath)
  if (!existsSync(absolutePath)) {
    fail(`Missing protocol artifact: ${relativePath}. Run \`npm run protocol:refresh\`.`)
  }
}

const serverNotifications = readFileSync(
  path.join(root, 'generated', 'app-server-ts', 'ServerNotification.ts'),
  'utf8',
)
const serverRequests = readFileSync(
  path.join(root, 'generated', 'app-server-ts', 'ServerRequest.ts'),
  'utf8',
)

const requiredNotifications = [
  'account/login/completed',
  'account/updated',
  'account/rateLimits/updated',
  'thread/started',
  'thread/status/changed',
  'turn/started',
  'turn/completed',
  'turn/diff/updated',
  'item/started',
  'item/completed',
  'item/agentMessage/delta',
  'item/commandExecution/outputDelta',
  'serverRequest/resolved',
  'configWarning',
]

const requiredRequests = [
  'item/commandExecution/requestApproval',
  'item/fileChange/requestApproval',
  'item/permissions/requestApproval',
  'item/tool/requestUserInput',
  'applyPatchApproval',
  'execCommandApproval',
]

for (const method of requiredNotifications) {
  if (!serverNotifications.includes(`"method": "${method}"`)) {
    fail(`Generated ServerNotification.ts is missing required notification ${method}.`)
  }
}

for (const method of requiredRequests) {
  if (!serverRequests.includes(`"method": "${method}"`)) {
    fail(`Generated ServerRequest.ts is missing required request ${method}.`)
  }
}

try {
  const versionOutput = execFileSync('codex', ['--version'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  const versionMatch = versionOutput.match(/codex-cli\s+([^\s]+)/)
  if (versionMatch && versionMatch[1] !== manifest.codexCliVersion) {
    fail(
      `Pinned Codex version is ${manifest.codexCliVersion}, but local Codex is ${versionMatch[1]}. Run \`npm run protocol:refresh\`.`,
    )
  }
} catch {
  console.warn('codex CLI is not available; skipping local version drift check.')
}
