'use client'

import { useState, useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '@/lib/hooks'
import { 
  signInWithPhone, 
  signUpWithPhone, 
  verifyOtp, 
  setError, 
  saveUserDetails,
  setGeneratedOtp,
  updateUserDetails
} from '@/lib/slices/authSlice'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  initialMode?: 'signin' | 'signup'
}

type Step = 'phone' | 'otp' | 'details' | 'permissions'

export default function AuthModal({ isOpen, onClose, initialMode = 'signin' }: AuthModalProps) {
  const dispatch = useAppDispatch()
  const { isLoading, error, generatedOtp, user } = useAppSelector(state => state.auth)
  
  // Auth flow state
  const [step, setStep] = useState<Step>('phone')
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode)
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [otp, setOtp] = useState('')
  
  // User details form state
  const [email, setEmail] = useState('')
  const [referralCode, setReferralCode] = useState('')
  
  // Permission states
  const [smsPermission, setSmsPermission] = useState(false)
  const [locationPermission, setLocationPermission] = useState(false)
  const [showPermissionPopup, setShowPermissionPopup] = useState<'sms' | 'location' | null>(null)

  // Reset state when modal closes or initialMode changes
  useEffect(() => {
    if (!isOpen) {
      resetState()
    } else {
      // Set mode based on initialMode when opening
      setMode(initialMode)
    }
  }, [isOpen, initialMode])

  const resetState = () => {
    setStep('phone')
    setMode(initialMode)
    setPhone('')
    setName('')
    setOtp('')
    setEmail('')
    setReferralCode('')
    setSmsPermission(false)
    setLocationPermission(false)
    setShowPermissionPopup(null)
    dispatch(setError(null))
    dispatch(setGeneratedOtp(null))
  }

  if (!isOpen) return null

  // Handle phone/name submission
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dispatch(setError(null))

    try {
      if (mode === 'signup') {
        if (!name.trim()) {
          dispatch(setError('Please enter your name'))
          return
        }
        const result = await dispatch(signUpWithPhone(phone, name))
        if (result && result.success) {
          setStep('otp')
        } else if (result && result.isExistingUser) {
          // User already exists, switch to signin
          setMode('signin')
        }
      } else {
        const result = await dispatch(signInWithPhone(phone))
        if (result && result.success) {
          setStep('otp')
        } else if (result && result.isNewUser) {
          // User doesn't exist, switch to signup
          setMode('signup')
        }
      }
    } catch (err) {
      console.error('Auth error:', err)
      dispatch(setError('An error occurred. Please try again.'))
    }
  }

  // Handle OTP verification
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dispatch(setError(null))

    try {
      const result = await dispatch(verifyOtp(phone, otp, name || undefined))
      if (result && result.success) {
        if (result.isNewUser) {
          // New user - show details form
          setStep('details')
        } else {
          // Existing user - close modal
          handleClose()
        }
      }
    } catch (err) {
      console.error('OTP verification error:', err)
      dispatch(setError('Verification failed. Please try again.'))
    }
  }

  // Handle user details submission
  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Show permissions one by one
    setStep('permissions')
    setShowPermissionPopup('sms')
  }

  // Handle permission responses
  const handlePermission = async (type: 'sms' | 'location', allowed: boolean) => {
    if (type === 'sms') {
      setSmsPermission(allowed)
      // Show next permission
      setShowPermissionPopup('location')
    } else if (type === 'location') {
      setLocationPermission(allowed)
      setShowPermissionPopup(null)
      
      // Save all details
      await dispatch(saveUserDetails(phone, {
        email,
        referralCode,
        smsPermission,
      }))
      
      // Close modal
      handleClose()
    }
  }

  const handleClose = () => {
    resetState()
    onClose()
  }

  // Phone/Name entry step
  const renderPhoneStep = () => (
    <div>
      <h2 className="text-3xl font-bold text-purple mb-3 text-center">
        {mode === 'signup' ? 'Create Account' : 'Welcome Back'}
      </h2>
      <p className="text-gray-600 mb-6 text-center">
        {mode === 'signup' 
          ? 'Sign up to get started with GatiMitra' 
          : 'Sign in to continue to GatiMitra'}
      </p>

      <form onSubmit={handlePhoneSubmit} className="space-y-4">
        {mode === 'signup' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter your full name"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
            />
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-medium">+91</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="Enter 10-digit phone number"
              className="w-full pl-16 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={10}
              required
            />
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-sm text-center bg-red-50 p-3 rounded-lg">
            <i className="fas fa-exclamation-circle mr-2"></i>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading || phone.length !== 10 || (mode === 'signup' && !name.trim())}
          className="w-full bg-gradient-to-r from-purple to-mint text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <i className="fas fa-spinner animate-spin"></i>
              {mode === 'signup' ? 'Creating Account...' : 'Signing In...'}
            </span>
          ) : (
            mode === 'signup' ? 'Sign Up' : 'Sign In'
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin')
            dispatch(setError(null))
          }}
          className="w-full text-gray-600 hover:text-purple text-sm"
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
      <h2 className="text-3xl font-bold text-purple mb-3 text-center">Verify OTP</h2>
      <p className="text-gray-600 mb-4 text-center">
        Enter the OTP sent to +91 {phone}
      </p>

      {/* Demo OTP Display */}
      {generatedOtp && (
        <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <i className="fas fa-info-circle text-green-600"></i>
            <span className="text-sm font-semibold text-green-700">Demo Mode - OTP</span>
          </div>
          <div className="text-3xl font-mono font-bold text-center text-green-600 tracking-widest">
            {generatedOtp}
          </div>
          <p className="text-xs text-center text-green-600 mt-2">
            Use this OTP to verify (for testing purposes)
          </p>
        </div>
      )}

      <form onSubmit={handleOtpSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Enter OTP</label>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="Enter 6-digit OTP"
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-2xl tracking-widest font-mono"
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
          disabled={isLoading || otp.length !== 6}
          className="w-full bg-gradient-to-r from-purple to-mint text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all disabled:opacity-50"
        >
          {isLoading ? (
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
          className="w-full text-gray-600 hover:text-purple text-sm"
        >
          <i className="fas fa-arrow-left mr-2"></i>
          Change phone number
        </button>
      </form>
    </div>
  )

  // User details form step (for new users)
  const renderDetailsStep = () => (
    <div>
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-gradient-to-br from-green-100 to-green-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <i className="fas fa-check text-green-600 text-2xl"></i>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Account Created!</h2>
        <p className="text-gray-600">Please complete your profile</p>
      </div>

      <form onSubmit={handleDetailsSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Address <span className="text-gray-400">(Optional)</span>
          </label>
          <div className="relative">
            <i className="fas fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Referral Code <span className="text-gray-400">(Optional)</span>
          </label>
          <div className="relative">
            <i className="fas fa-gift absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"></i>
            <input
              type="text"
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase())}
              placeholder="Enter referral code"
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <button
          type="submit"
          className="w-full bg-gradient-to-r from-purple to-mint text-white py-3 rounded-xl font-bold hover:shadow-lg transition-all mt-6"
        >
          Continue
          <i className="fas fa-arrow-right ml-2"></i>
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="w-full text-gray-500 hover:text-gray-700 text-sm"
        >
          Skip for now
        </button>
      </form>
    </div>
  )

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
        <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl animate-in fade-in zoom-in">
          {/* Icon */}
          <div className="w-20 h-20 bg-gradient-to-br from-purple/10 to-mint/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <i className={`fas ${config.icon} text-purple text-3xl`}></i>
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
              className="flex-1 py-3 bg-gradient-to-r from-purple to-mint text-white font-semibold rounded-xl hover:shadow-lg transition-all"
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
        <div className="bg-white rounded-3xl max-w-md w-full p-8 shadow-2xl relative animate-popupScale">
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
              <div className={`w-2.5 h-2.5 rounded-full ${step === 'otp' || step === 'details' || step === 'permissions' ? 'bg-purple' : 'bg-gray-300'}`}></div>
              <div className={`w-8 h-0.5 ${step === 'details' || step === 'permissions' ? 'bg-purple' : 'bg-gray-300'}`}></div>
              <div className={`w-2.5 h-2.5 rounded-full ${step === 'details' || step === 'permissions' ? 'bg-purple' : 'bg-gray-300'}`}></div>
              <div className={`w-8 h-0.5 ${step === 'permissions' ? 'bg-purple' : 'bg-gray-300'}`}></div>
              <div className={`w-2.5 h-2.5 rounded-full ${step === 'permissions' ? 'bg-purple' : 'bg-gray-300'}`}></div>
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

