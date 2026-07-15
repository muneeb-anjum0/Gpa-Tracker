import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.endsWith('package-lock.json'))

const patterns = [
  {
    name: 'Google API key',
    regex: /AIza[0-9A-Za-z_-]{35}/g,
  },
  {
    name: 'Private key block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |)?PRIVATE KEY-----/g,
  },
  {
    name: 'Firebase service account',
    regex: /"type"\s*:\s*"service_account"/g,
  },
  {
    name: 'Generic assignment secret',
    regex: /\b(?:secret|token|password|private_key)\b\s*[:=]\s*["'][^"']{12,}["']/gi,
  },
]

const findings = []

for (const file of trackedFiles) {
  const content = readFileSync(file, 'utf8')
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern.regex)) {
      const line = content.slice(0, match.index).split(/\r?\n/).length
      findings.push(`${file}:${line} ${pattern.name}`)
    }
  }
}

if (findings.length) {
  console.error('Potential tracked secrets found:')
  findings.forEach((finding) => console.error(`- ${finding}`))
  process.exit(1)
}

console.log('No tracked secrets matched the configured patterns.')
