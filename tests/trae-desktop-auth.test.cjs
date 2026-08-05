const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const test = require('node:test')

const { decryptTraeAuthInfo } = require('../electron/trae-auth.cjs')

const LEFT_SECRET = Buffer.from([82, 9, 106, 213, 48, 54, 165, 56, 191, 64, 163, 158, 129, 243, 215, 251, 124, 227, 57, 130, 155, 47, 255, 135, 52, 142, 67, 68, 196, 222, 233, 203, 84, 123, 148, 50, 166, 194, 35, 61, 238, 76, 149, 11, 66, 250, 195, 78, 8, 46, 161, 102, 40, 217, 36, 178, 118, 91, 162, 73, 109, 139, 209, 37])
const RIGHT_SECRET = Buffer.from([31, 221, 168, 51, 136, 7, 199, 49, 177, 18, 16, 89, 39, 128, 236, 95, 96, 81, 127, 169, 25, 181, 74, 13, 45, 229, 122, 159, 147, 201, 156, 239, 160, 224, 59, 77, 174, 42, 245, 176, 200, 235, 187, 60, 131, 83, 153, 97, 23, 43, 4, 126, 186, 119, 214, 38, 225, 105, 20, 99, 85, 33, 12, 125])

function encryptFixture(value) {
  const randomKey = Buffer.alloc(32, 7)
  const secret = Buffer.from(LEFT_SECRET.map((byte, index) => byte ^ RIGHT_SECRET[index]))
  const firstDigest = crypto.createHash('sha512').update(randomKey).digest()
  const material = Buffer.concat([firstDigest, secret])
  const derived = crypto.createHash('sha512').update(material).digest()
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  const signedPayload = Buffer.concat([crypto.createHash('sha512').update(payload).digest(), payload])
  const cipher = crypto.createCipheriv('aes-128-cbc', derived.subarray(0, 16), derived.subarray(16, 32))
  const encrypted = Buffer.concat([cipher.update(signedPayload), cipher.final()])
  return Buffer.concat([Buffer.from([116, 99, 5, 16, 0, 0]), randomKey, encrypted]).toString('base64')
}

test('decrypts the TRAE desktop credential envelope and returns its JSON payload', () => {
  const expected = { token: 'desktop-token-for-test', userId: '42' }

  assert.deepEqual(decryptTraeAuthInfo(encryptFixture(expected)), expected)
})

test('rejects a credential envelope whose integrity digest is invalid', () => {
  const encrypted = Buffer.from(encryptFixture({ token: 'desktop-token-for-test' }), 'base64')
  encrypted[38] ^= 1

  assert.throws(() => decryptTraeAuthInfo(encrypted.toString('base64')), /integrity/i)
})
