'use client'

import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import { 
  signInWithPhone, 
  signUpWithPhone, 
  verifyOtp, 
  setError, 
  setLoading,
  saveUserDetails,
  setGeneratedOtp,
} from '@/lib/slices/authSlice'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

type Step = 'phone' | 'otp' | 'details' | 'permissions'

/** Same ranges as customer app onboarding */
const AGE_GROUPS = [
  '10-15', '16-21', '22-27', '28-33', '34-39', '40-45', '46-51',
  '52-57', '58-63', '64-69', '70-75', '76-81', '82-87', '88-93', '94-95',
] as const

const PROFILE_GENDERS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'prefer_not_to_say', label: 'Prefer not to say' },
] as const

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const dispatch = useAppDispatch()
  const { error } = useAppSelector(state => state.auth)
  
  // Auth flow state — phone → OTP → complete profile (app-aligned) → permissions
  const [step, setStep] = useState<Step>('phone')
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  /** Local only — don't reuse global auth isLoading (starts true during restore). */
  const [sendingOtp, setSendingOtp] = useState(false)
  const [verifyingOtp, setVerifyingOtp] = useState(false)
  
  // Complete-profile fields (customer app onboarding)
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [ageGroup, setAgeGroup] = useState('')
  const [gender, setGender] = useState('')
  const [hasReferralCode, setHasReferralCode] = useState(false)
  const [referralCode, setReferralCode] = useState('')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  
  // Permission states
  const [smsPermission, setSmsPermission] = useState(false)
  const [locationPermission, setLocationPermission] = useState(false)
  const [showPermissionPopup, setShowPermissionPopup] = useState<'sms' | 'location' | null>(null)

  useEffect(() => {
    if (!isOpen) {
      resetState()
    } else {
      setMode(initialMode)
      setSendingOtp(false)
      setVerifyingOtp(false)
      // Clear stuck global spinner from auth restore / hung requests
      dispatch(setLoading(false))
      dispatch(setError(null))
    }
  }, [isOpen, initialMode])

  const resetState = () => {
    setStep('phone')
    setMode(initialMode)
    setPhone('')
    setOtp('')
    setSendingOtp(false)
    setVerifyingOtp(false)
    setFullName('')
    setEmail('')
    setAgeGroup('')
    setGender('')
    setHasReferralCode(false)
    setReferralCode('')
    setFormErrors({})
    setSmsPermission(false)
    setLocationPermission(false)
    setShowPermissionPopup(null)
    dispatch(setError(null))
    dispatch(setLoading(false))
    dispatch(setGeneratedOtp(null))
  }

  if (!isOpen) return null

  // Phone → always push OTP (new numbers auto-signup like customer app)
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (phone.length !== 10 || sendingOtp) return
    dispatch(setError(null))
    setSendingOtp(true)

    try {
      const result =
        mode === 'signup'
          ? await dispatch(signUpWithPhone(phone))
          : await dispatch(signInWithPhone(phone))

      if (result?.success) {
        if (result.flow === 'signup' || result.isNewUser) setMode('signup')
        else setMode('signin')
        setStep('otp')
        return
      }

      if (result?.isExistingUser) {
        setMode('signin')
      }
    } catch (err) {
      console.error('Auth error:', err)
      dispatch(setError('An error occurred. Please try again.'))
    } finally {
      setSendingOtp(false)
      dispatch(setLoading(false))
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (verifyingOtp) return
    dispatch(setError(null))
    setVerifyingOtp(true)

    try {
      const result = await dispatch(verifyOtp(phone, otp))
      if (result && result.success) {
        if (result.isNewUser) {
          setStep('details')
        } else {
          handleClose()
        }
      }
    } catch (err) {
      console.error('OTP verification error:', err)
      dispatch(setError('Verification failed. Please try again.'))
    } finally {
      setVerifyingOtp(false)
      dispatch(setLoading(false))
    }
  }

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const nextErrors: Record<string, string> = {}
    if (fullName.trim().length < 2) {
      nextErrors.fullName = 'Please enter your full name'
    }
    if (email.trim() && !EMAIL_REGEX.test(email.trim())) {
      nextErrors.email = 'Enter a valid email address'
    }
    if (hasReferralCode && referralCode.trim().length < 3) {
      nextErrors.referral = 'Enter a valid referral code or turn off the toggle'
    }
    setFormErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setStep('permissions')
    setShowPermissionPopup('sms')
  }

  const handlePermission = async (type: 'sms' | 'location', allowed: boolean) => {
    if (type === 'sms') {
      setSmsPermission(allowed)
      setShowPermissionPopup('location')
      return
    }

    setLocationPermission(allowed)
    setShowPermissionPopup(null)

    await dispatch(
      saveUserDetails(phone, {
        fullName: fullName.trim(),
        email: email.trim() || undefined,
        ageGroup: ageGroup || undefined,
        gender: gender || undefined,
        referralCode: hasReferralCode ? referralCode.trim().toUpperCase() : undefined,
        smsPermission,
      })
    )

    handleClose()
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  const inputClass =
    'w-full px-4 py-3 border border-gray-300 rounded-[10px] bg-white text-[#111827] placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#109D4C] focus:border-[#109D4C]'

  const renderPhoneStep = () => (
    <div>
      <h2 className="text-3xl font-bold text-[#109D4C] mb-3 text-center">
        {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
      </h2>
      <p className="text-gray-600 mb-6 text-center">
        {mode === 'signup' 
          ? 'Enter your mobile number to create your GatiMitra ID' 
          : 'Sign in to continue to GatiMitra'}
      </p>

      <form onSubmit={handlePhoneSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-[#111827] mb-1.5">Phone Number</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">+91</span>
            <div className="pointer-events-none absolute left-[3.25rem] top-1/2 h-5 w-px -translate-y-1/2 bg-gray-200" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Enter 10-digit phone number"
              className={`${inputClass} pl-16`}
              maxLength={10}
              required
            />
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-[10px]">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={sendingOtp || phone.length !== 10}
          className="w-full bg-[#109D4C] hover:bg-[#0d7a3c] text-white py-3.5 rounded-[10px] font-extrabold tracking-wide hover:shadow-lg transition-all disabled:opacity-50"
        >
          {sendingOtp ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-spinner animate-spin"></i>
              Sending OTP...
            </span>
          ) : (
            'Continue'
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            dispatch(setError(null))
          }}
          className="w-full text-gray-600 hover:text-[#109D4C] text-sm"
        >
          {mode === 'signin' 
            ? "Don't have an account? Sign Up" 
            : 'Already have an account? Sign In'}
        </button>
      </form>
    </div>
  )

  // OTP verification step
  const renderOtpStep = () => (
    <div>
      <h2 className="text-3xl font-bold text-[#109D4C] mb-3 text-center">Verify OTP</h2>
      <p className="text-gray-600 mb-4 text-center">
        Enter the OTP sent to +91 {phone}
      </p>

      <form onSubmit={handleOtpSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter 6-digit OTP"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#109D4C] text-center text-2xl tracking-widest font-mono"
            maxLength={6}
            required
          />
        </div>

        {error && (
          <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={verifyingOtp || otp.length !== 6}
          className="w-full bg-[#109D4C] hover:bg-[#0d7a3c] text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
        >
          {verifyingOtp ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-spinner animate-spin"></i>
              Verifying...
            </span>
          ) : (
            'Verify OTP'
          )}
        </button>

        <button
          type="button"
          onClick={() => setStep('phone')}
          className="w-full text-gray-600 hover:text-[#109D4C] text-sm"
        >
          <i className="fas fa-arrow-left mr-2"></i>
          Change phone number
        </button>
      </form>
    </div>
  )

  // Complete profile — mirrors customer app onboarding
  const renderDetailsStep = () => {
    const canContinue = fullName.trim().length >= 2
    return (
      <div>
        <div className="mb-5 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#109D4C]">Step 1 of 2</p>
          <h2 className="mt-1 text-2xl font-bold text-[#111827]">Complete your profile</h2>
          <p className="mt-1 text-sm text-gray-600">
            Same details as the GatiMitra customer app — required to finish your ID.
          </p>
        </div>

        <form onSubmit={handleDetailsSubmit} className="max-h-[min(62vh,520px)] space-y-3.5 overflow-y-auto pr-1">
          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#111827]">Full name *</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => {
                setFullName(e.target.value)
                setFormErrors((prev) => ({ ...prev, fullName: '' }))
              }}
              placeholder="Enter your full name"
              className={`${inputClass} ${formErrors.fullName ? 'border-red-400' : ''}`}
              autoComplete="name"
            />
            {formErrors.fullName ? (
              <p className="mt-1 text-xs font-medium text-red-700">{formErrors.fullName}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#111827]">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                setFormErrors((prev) => ({ ...prev, email: '' }))
              }}
              placeholder="your@email.com"
              className={`${inputClass} ${formErrors.email ? 'border-red-400' : ''}`}
              autoComplete="email"
            />
            {formErrors.email ? (
              <p className="mt-1 text-xs font-medium text-red-700">{formErrors.email}</p>
            ) : null}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#111827]">Age group</label>
            <select
              value={ageGroup}
              onChange={(e) => setAgeGroup(e.target.value)}
              className={`${inputClass} appearance-none`}
            >
              <option value="">Select age range</option>
              {AGE_GROUPS.map((ag) => (
                <option key={ag} value={ag}>
                  {ag} years
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-bold text-[#111827]">Gender</label>
            <div className="grid grid-cols-3 gap-2">
              {PROFILE_GENDERS.map((g) => {
                const active = gender === g.value
                return (
                  <button
                    key={g.value}
                    type="button"
                    onClick={() => setGender(g.value)}
                    className={`rounded-[10px] border px-2 py-2.5 text-xs font-bold transition sm:text-sm ${
                      active
                        ? 'border-[#109D4C] bg-[#e8f3ec] text-[#0d7a3c]'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-[#109D4C]/40'
                    }`}
                  >
                    {g.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="rounded-[10px] border border-black/[0.06] bg-[#f7faf8] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-bold text-[#111827]">I have a referral code</span>
              <button
                type="button"
                role="switch"
                aria-checked={hasReferralCode}
                onClick={() => {
                  setHasReferralCode((v) => !v)
                  setFormErrors((prev) => ({ ...prev, referral: '' }))
                  if (hasReferralCode) setReferralCode('')
                }}
                className={`relative h-7 w-12 shrink-0 rounded-md transition ${
                  hasReferralCode ? 'bg-[#109D4C]' : 'bg-slate-400'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-6 w-6 rounded bg-white shadow transition ${
                    hasReferralCode ? 'left-[1.35rem]' : 'left-0.5'
                  }`}
                />
              </button>
            </div>
            {hasReferralCode ? (
              <div className="mt-3">
                <label className="mb-1.5 block text-sm font-bold text-[#111827]">Referral code</label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => {
                    setReferralCode(e.target.value.toUpperCase())
                    setFormErrors((prev) => ({ ...prev, referral: '' }))
                  }}
                  placeholder="Enter referrer's code"
                  className={`${inputClass} ${formErrors.referral ? 'border-red-400' : ''}`}
                  autoCapitalize="characters"
                />
                {formErrors.referral ? (
                  <p className="mt-1 text-xs font-medium text-red-700">{formErrors.referral}</p>
                ) : null}
              </div>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!canContinue}
            className="w-full rounded-[10px] bg-[#109D4C] py-3.5 text-sm font-extrabold tracking-wide text-white transition hover:bg-[#0d7a3c] hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-45"
          >
            Continue
          </button>
        </form>
      </div>
    )
  }

  // Permission popup
  const renderPermissionPopup = () => {
    if (!showPermissionPopup) return null

    const permissionConfig = {
      sms: {
        icon: 'fa-sms',
        title: 'SMS Permission',
        description: 'Allow GatiMitra to read SMS for auto-verification of OTP and order updates.',
        benefits: ['Auto-fill OTP codes', 'Real-time order notifications', 'Delivery updates via SMS'],
      },
      location: {
        icon: 'fa-location-dot',
        title: 'Location Access',
        description: 'Allow GatiMitra to access your location for better delivery experience.',
        benefits: ['Accurate delivery address', 'Find nearby restaurants', 'Real-time delivery tracking'],
      },
    }

    const config = permissionConfig[showPermissionPopup]

    return (
      <div className="fixed inset-0 bg-black/70 z-[10000] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in">
          {/* Icon */}
          <div className="w-20 h-20 bg-[#e8f3ec] rounded-full flex items-center justify-center mx-auto mb-4">
            <i className={`fas ${config.icon} text-[#109D4C] text-3xl`}></i>
          </div>

          {/* Title */}
          <h3 className="text-xl font-bold text-gray-900 text-center mb-2">
            {config.title}
          </h3>

          {/* Description */}
          <p className="text-gray-600 text-center text-sm mb-4">
            {config.description}
          </p>

          {/* Benefits */}
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-xs font-semibold text-gray-500 mb-2">BENEFITS:</p>
            <ul className="space-y-2">
              {config.benefits.map((benefit, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-gray-700">
                  <i className="fas fa-check text-green-500 text-xs"></i>
                  {benefit}
                </li>
              ))}
            </ul>
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => handlePermission(showPermissionPopup, false)}
              className="flex-1 py-3 border-2 border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 transition-all"
            >
              Deny
            </button>
            <button
              onClick={() => handlePermission(showPermissionPopup, true)}
              className="flex-1 py-3 bg-[#109D4C] hover:bg-[#0d7a3c] text-white font-semibold rounded-xl hover:shadow-lg transition-all"
            >
              Allow
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl max-w-md w-full p-8 shadow-2xl relative animate-popupScale">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-500 transition-colors"
          >
            <i className="fas fa-times"></i>
          </button>

          {/* Progress indicator for signup */}
          {mode === 'signup' && step !== 'phone' && (
            <div className="flex items-center justify-center gap-2 mb-6">
              <div className={`w-2.5 h-2.5 rounded-full ${step === 'otp' || step === 'details' || step === 'permissions' ? 'bg-[#109D4C]' : 'bg-gray-300'}`}></div>
              <div className={`w-8 h-0.5 ${step === 'details' || step === 'permissions' ? 'bg-[#109D4C]' : 'bg-gray-300'}`}></div>
              <div className={`w-2.5 h-2.5 rounded-full ${step === 'details' || step === 'permissions' ? 'bg-[#109D4C]' : 'bg-gray-300'}`}></div>
              <div className={`w-8 h-0.5 ${step === 'permissions' ? 'bg-[#109D4C]' : 'bg-gray-300'}`}></div>
              <div className={`w-2.5 h-2.5 rounded-full ${step === 'permissions' ? 'bg-[#109D4C]' : 'bg-gray-300'}`}></div>
            </div>
          )}

          {/* Render current step */}
          {step === 'phone' && renderPhoneStep()}
          {step === 'otp' && renderOtpStep()}
          {step === 'details' && renderDetailsStep()}
          {step === 'permissions' && renderDetailsStep()}
        </div>
      </div>

      {/* Permission Popup (rendered on top) */}
      {renderPermissionPopup()}
    </>
  )
}

