import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { readFileSync } from 'node:fs'

const firebaseConfig = JSON.parse(readFileSync('firebase.json', 'utf8'))

function headersFor(source) {
  const entry = firebaseConfig.hosting.headers.find((item) => item.source === source)
  assert.ok(entry, `Missing Firebase Hosting headers for ${source}`)
  return Object.fromEntries(entry.headers.map((header) => [header.key.toLowerCase(), header.value]))
}

describe('Firebase Hosting security headers', () => {
  it('sets baseline browser security headers on all responses', () => {
    const headers = headersFor('**')

    assert.match(headers['content-security-policy'], /default-src 'self'/)
    assert.match(headers['content-security-policy'], /frame-ancestors 'none'/)
    assert.match(headers['content-security-policy'], /object-src 'none'/)
    assert.equal(headers['strict-transport-security'], 'max-age=31536000; includeSubDomains')
    assert.equal(headers['x-content-type-options'], 'nosniff')
    assert.equal(headers['x-frame-options'], 'DENY')
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin')
    assert.match(headers['permissions-policy'], /camera=\(\)/)
    assert.equal(headers['cross-origin-opener-policy'], 'same-origin')
    assert.equal(headers['cross-origin-resource-policy'], 'same-origin')
  })

  it('sets intentional cache behavior for html and immutable assets', () => {
    assert.equal(headersFor('/')['cache-control'], 'no-store')
    assert.equal(headersFor('/index.html')['cache-control'], 'no-store')
    assert.equal(headersFor('**/*.html')['cache-control'], 'no-store')
    assert.equal(headersFor('/assets/**')['cache-control'], 'public, max-age=31536000, immutable')
  })
})
