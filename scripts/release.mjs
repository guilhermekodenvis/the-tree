// Versão e publicação do The Tree.
//
//   node scripts/release.mjs version   -> põe no package.json a próxima versão
//                                         (última Release + 1) e cria a Release dela;
//                                         usado pela Action.
//   node scripts/release.mjs publish   -> faz tudo daqui do PC: próxima versão, build,
//                                         instalador e Release no GitHub; no fim volta
//                                         o package.json como estava. Usa o login do
//                                         GitHub CLI (gh) se GH_TOKEN não estiver definido.
//
// A versão é sempre a da última Release publicada + 1 (0.1.N), venha ela da Action
// ou daqui. Assim o app instalado sempre enxerga a mais nova como maior.
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const REPO = 'guilhermekodenvis/the-tree'
const FIRST = '0.1.1'
const shell = process.platform === 'win32'

function latestTag(env) {
  try {
    return execFileSync('gh', ['release', 'view', '-R', REPO, '--json', 'tagName', '-q', '.tagName'], {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'ignore'],
      shell
    }).trim()
  } catch {
    return '' // Nenhuma Release ainda.
  }
}

function nextVersion(env) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(latestTag(env))
  if (!match) return FIRST
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`
}

// npm e npx são .cmd no Windows e precisam do shell; o gh é um .exe e roda sem ele,
// senão argumentos com espaço ("The Tree 0.1.2") seriam quebrados em pedaços.
function run(command, args, env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env, shell: command !== 'gh' && shell })
  if (result.status !== 0) throw new Error(`Falhou: ${command} ${args.join(' ')}`)
}

function setVersion(env) {
  const version = nextVersion(env)
  run('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], env)
  console.log(`Versão desta build: ${version}`)
  return version
}

/**
 * Cria a Release (e a tag, a partir da main) antes de enviar os arquivos. Sem isso,
 * o electron-builder envia os arquivos em paralelo, cada envio tenta criar a Release
 * e o segundo falha ("Published releases must have a valid tag").
 */
function createRelease(version, env) {
  run(
    'gh',
    ['release', 'create', `v${version}`, '-R', REPO, '--target', 'main', '--title', version, '--notes', `The Tree ${version}`],
    env
  )
}

const mode = process.argv[2]
const env = { ...process.env }

if (mode === 'version') {
  createRelease(setVersion(env), env)
} else if (mode === 'publish') {
  if (!env.GH_TOKEN) {
    // O token não é mostrado: vai direto para o ambiente do electron-builder.
    env.GH_TOKEN = execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', shell }).trim()
  }
  const before = {
    pkg: readFileSync('package.json', 'utf8'),
    lock: readFileSync('package-lock.json', 'utf8')
  }
  try {
    const version = setVersion(env)
    run('npm', ['run', 'typecheck'], env)
    createRelease(version, env)
    run('npx', ['electron-vite', 'build'], env)
    run('npx', ['electron-builder', '--win', '--x64', '--publish', 'always'], env)
    console.log(`Publicada a versão ${version}: https://github.com/${REPO}/releases`)
  } finally {
    // A versão publicada não fica no código; a próxima é calculada pela Release.
    const { writeFileSync } = await import('node:fs')
    writeFileSync('package.json', before.pkg)
    writeFileSync('package-lock.json', before.lock)
  }
} else {
  console.error('Use: node scripts/release.mjs version | publish')
  process.exit(1)
}
