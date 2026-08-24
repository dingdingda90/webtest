import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const inlinePort = args.find((arg) => arg.startsWith('--port='))
const frontendPort = portIndex >= 0 ? args[portIndex + 1] : inlinePort?.split('=')[1] || '5173'

if (!/^\d+$/.test(frontendPort)) {
  console.error(`Invalid frontend port: ${frontendPort}`)
  process.exit(1)
}

const nodeBackend = existsSync(join(root, 'backend/server.js'))
const backendCommand = nodeBackend ? process.execPath : join(root, 'backend/.venv/bin/python')
const backendArgs = nodeBackend
  ? ['server.js']
  : ['-m', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', '8000']

const services = [
  spawn(backendCommand, backendArgs, {
    cwd: join(root, 'backend'),
    env: { ...process.env, PORT: '8000' },
    stdio: 'inherit'
  }),
  spawn(process.execPath, [join(root, 'frontend/node_modules/vite/bin/vite.js'), '--port', frontendPort, '--host', '0.0.0.0'], {
    cwd: join(root, 'frontend'),
    env: process.env,
    stdio: 'inherit'
  })
]

let stopping = false
const stop = (signal = 'SIGTERM') => {
  if (stopping) return
  stopping = true
  for (const service of services) {
    if (!service.killed) service.kill(signal)
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(signal))
}

for (const service of services) {
  service.on('error', (error) => {
    console.error(error)
    stop()
    process.exitCode = 1
  })
  service.on('exit', (code, signal) => {
    if (!stopping) {
      stop()
      process.exitCode = code ?? (signal ? 1 : 0)
    }
  })
}
