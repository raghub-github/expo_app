/**
 * Run: node --import tsx --test cxsite/lib/server/review-sms-bypass.test.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSuppressMsg91Sms } from './review-sms-bypass'

describe('cxsite review SMS bypass', () => {
  it('review phone → suppress MSG91 and expose fixed OTP', () => {
    const r = shouldSuppressMsg91Sms('+919999999999', {
      GOOGLE_REVIEW_MODE: 'true',
      GOOGLE_REVIEW_PHONE: '9999999999',
      GOOGLE_REVIEW_OTP: '123456',
    })
    assert.equal(r.suppress, true)
    assert.equal(r.suppress && r.reason, 'review_bypass')
    assert.equal(r.suppress && r.otp, '123456')
  })

  it('normal phone → allow MSG91', () => {
    assert.equal(
      shouldSuppressMsg91Sms('9876543210', {
        GOOGLE_REVIEW_MODE: 'true',
        GOOGLE_REVIEW_PHONE: '9999999999',
        GOOGLE_REVIEW_OTP: '123456',
      }).suppress,
      false
    )
  })
})
