import { createSlice, PayloadAction } from '@reduxjs/toolkit'
import { clientApiUrl } from '../clientApiBase'
import { normalizePrimaryMobile } from '../phoneNormalize'
import { supabase, isSupabaseConfigured } from '../supabase'

// Service categories
export type ServiceCategory = 'food' | 'person' | 'parcel'

// All services - user gets access to all 3 on registration
const ALL_SERVICES: ServiceCategory[] = ['food', 'person', 'parcel']

// GMMS ID prefix and format
const GMMS_PREFIX = 'GMMS'
const GMMS_ID_LENGTH = 4

// Auth persistence keys
const AUTH_STORAGE_KEY = 'gatimitra_auth_user'
const AUTH_SERVICE_KEY = 'gatimitra_current_service'

interface User {
  id: string
  user_id?: string
  phone: string
  name?: string
  email?: string
  // All 3 services available (stored as comma-separated in DB: "food,person,parcel")
  services: ServiceCategory[]
  currentCategory?: ServiceCategory
  deviceId?: string
  phoneModel?: string
  brand?: string
  smsPermission?: boolean
  isNewUser?: boolean
  needsDetailsForm?: boolean
  addressLine1?: string
  city?: string
  state?: string
  pincode?: string
  latitude?: number | null
  longitude?: number | null
}

// Save auth state to localStorage
const saveAuthToStorage = (user: User, service: ServiceCategory) => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user))
      localStorage.setItem(AUTH_SERVICE_KEY, service)
      console.log('[Auth] Saved auth to localStorage')
    } catch (e) {
      console.error('[Auth] Failed to save auth:', e)
    }
  }
}

// Load auth state from localStorage
const loadAuthFromStorage = (): { user: User | null; service: ServiceCategory } => {
  if (typeof window !== 'undefined') {
    try {
      const userStr = localStorage.getItem(AUTH_STORAGE_KEY)
      const service = localStorage.getItem(AUTH_SERVICE_KEY) as ServiceCategory || 'food'
      if (userStr) {
        const user = JSON.parse(userStr) as User
        console.log('[Auth] Loaded auth from localStorage:', user.user_id || user.id)
        return { user, service }
      }
    } catch (e) {
      console.error('[Auth] Failed to load auth:', e)
    }
  }
  return { user: null, service: 'food' }
}

// Clear auth from localStorage
const clearAuthFromStorage = () => {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY)
      localStorage.removeItem(AUTH_SERVICE_KEY)
      console.log('[Auth] Cleared auth from localStorage')
    } catch (e) {
      console.error('[Auth] Failed to clear auth:', e)
    }
  }
}

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  error: string | null
  currentService: ServiceCategory
  generatedOtp: string | null
  isExistingUser: boolean | null
  accountRemoved: boolean
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  // Keep auth in loading state until restoreAuth runs on client.
  isLoading: true,
  error: null,
  currentService: 'food',
  generatedOtp: null,
  isExistingUser: null,
  accountRemoved: false,
}

// Generate a random 6-digit OTP for demo
const generateDemoOtp = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

const customerAuthUrl = (suffix = '') => clientApiUrl(`/api/auth/customer${suffix}`)
const otpAuthUrl = () => clientApiUrl('/api/auth/otp')

async function isCustomersApiLegacy(res: Response): Promise<boolean> {
  return res.status === 501
}

async function requestOtpSms(
  phone: string
): Promise<{ channel: 'msg91' } | { channel: 'demo' } | { error: string }> {
  try {
    const res = await fetch(otpAuthUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'send', phone }),
    })
    const j = (await res.json().catch(() => ({}))) as {
      channel?: string
      error?: string
      hint?: string
    }
    if (res.ok && j.channel === 'msg91') {
      return { channel: 'msg91' }
    }
    if (res.ok && j.channel === 'demo') {
      console.warn(
        '[Auth] OTP demo mode (no SMS):',
        j.hint || 'Add MSG91_AUTH_KEY + MSG91_TEMPLATE_ID or MSG91_FLOW_ID to .env.local and restart dev.'
      )
      return { channel: 'demo' }
    }
    return {
      error: j.error || `Could not send OTP (${res.status})`,
    }
  } catch (e: any) {
    return { error: e?.message || 'Network error' }
  }
}

// Generate GMMS ID
const formatGMMSId = (num: number): string => {
  return `${GMMS_PREFIX}${String(num).padStart(GMMS_ID_LENGTH, '0')}`
}

// Parse GMMS ID to get the number
const parseGMMSId = (id: string): number => {
  if (!id || !id.startsWith(GMMS_PREFIX)) return 0
  const numPart = id.replace(GMMS_PREFIX, '')
  return parseInt(numPart, 10) || 0
}

// Get next available GMMS ID
export const getNextGMMSId = async (): Promise<string> => {
  console.log('[Auth] Getting next GMMS ID...')

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(customerAuthUrl('/next-id'))
      if (!(await isCustomersApiLegacy(res))) {
        const data = await res.json()
        if (data?.customerId) return data.customerId as string
      }
    } catch (e) {
      console.warn('[Auth] customers next-id fetch failed, falling back:', e)
    }
  }

  if (!isSupabaseConfigured) {
    if (typeof window !== 'undefined') {
      const lastId = parseInt(localStorage.getItem('lastGMMSId') || '0', 10)
      const nextId = lastId + 1
      localStorage.setItem('lastGMMSId', String(nextId))
      return formatGMMSId(nextId)
    }
    return formatGMMSId(1)
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id')
      .like('user_id', `${GMMS_PREFIX}%`)
      .order('user_id', { ascending: false })
      .limit(1)

    if (error) {
      console.error('[Auth] Error fetching max GMMS ID:', error)
      return formatGMMSId(Date.now() % 10000)
    }

    if (!data || data.length === 0) {
      return formatGMMSId(1)
    }

    const highestId = data[0].user_id
    const highestNum = parseGMMSId(highestId)
    return formatGMMSId(highestNum + 1)
  } catch (err) {
    console.error('[Auth] Exception getting next GMMS ID:', err)
    return formatGMMSId(Date.now() % 10000)
  }
}

// Get existing GMMS ID for user
export const getExistingGMMSId = async (phone: string): Promise<string | null> => {
  const phoneNorm = normalizePrimaryMobile(phone)
  if (!phoneNorm) return null

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(
        customerAuthUrl(`?phone=${encodeURIComponent(phoneNorm)}`)
      )
      if (!(await isCustomersApiLegacy(res))) {
        const data = await res.json()
        const uid = data?.customer?.user_id as string | undefined
        if (uid) return uid
      }
    } catch (e) {
      console.warn('[Auth] customers lookup failed, falling back:', e)
    }
  }

  if (!isSupabaseConfigured) {
    if (typeof window !== 'undefined') {
      const demoUserIds = JSON.parse(localStorage.getItem('demoUserIds') || '{}')
      return demoUserIds[phone] || demoUserIds[phoneNorm] || null
    }
    return null
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('user_id')
      .eq('user_number', phoneNorm)
      .limit(1)
      .single()

    if (error || !data) return null
    return data.user_id
  } catch (err) {
    return null
  }
}

// Get or create GMMS ID
export const getOrCreateGMMSId = async (phone: string): Promise<string> => {
  const existingId = await getExistingGMMSId(phone)
  if (existingId) return existingId
  
  const newId = await getNextGMMSId()
  
  if (!isSupabaseConfigured && typeof window !== 'undefined') {
    const demoUserIds = JSON.parse(localStorage.getItem('demoUserIds') || '{}')
    demoUserIds[phone] = newId
    localStorage.setItem('demoUserIds', JSON.stringify(demoUserIds))
  }
  
  return newId
}

// Get device info
const getDeviceInfo = (): { deviceId: string; phoneModel: string; brand: string } => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { deviceId: 'unknown', phoneModel: 'unknown', brand: 'unknown' }
  }
  
  const userAgent = navigator.userAgent
  let brand = 'unknown'
  let phoneModel = 'unknown'
  
  if (userAgent.includes('iPhone')) {
    brand = 'apple'
    phoneModel = 'iPhone'
  } else if (userAgent.includes('Samsung')) {
    brand = 'samsung'
  } else if (userAgent.includes('Xiaomi') || userAgent.includes('MI')) {
    brand = 'xiaomi'
  } else if (userAgent.includes('OnePlus')) {
    brand = 'oneplus'
  } else if (userAgent.includes('Pixel')) {
    brand = 'google'
  } else if (userAgent.includes('Android')) {
    brand = 'android'
  }
  
  const deviceId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  return { deviceId, phoneModel, brand }
}

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload
    },
    setUser: (state, action: PayloadAction<User | null>) => {
      state.user = action.payload
      state.isAuthenticated = !!action.payload
      state.isLoading = false
      // Save to localStorage when user is set
      if (action.payload) {
        saveAuthToStorage(action.payload, state.currentService)
        console.log('[Auth] User saved to localStorage via setUser')
      } else {
        clearAuthFromStorage()
        console.log('[Auth] User cleared from localStorage via setUser')
      }
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload
    },
    // Switch service - NO DB write, just state change
    setCurrentService: (state, action: PayloadAction<ServiceCategory>) => {
      state.currentService = action.payload
      if (state.user) {
        state.user.currentCategory = action.payload
        saveAuthToStorage(state.user, action.payload)
      }
    },
    setGeneratedOtp: (state, action: PayloadAction<string | null>) => {
      state.generatedOtp = action.payload
    },
    setIsExistingUser: (state, action: PayloadAction<boolean | null>) => {
      state.isExistingUser = action.payload
    },
    updateUserDetails: (state, action: PayloadAction<Partial<User>>) => {
      if (state.user) {
        state.user = { ...state.user, ...action.payload }
        // Save updated user to localStorage
        saveAuthToStorage(state.user, state.currentService)
        console.log('[Auth] User details updated and saved to localStorage')
      }
    },
    logout: (state) => {
      state.user = null
      state.isAuthenticated = false
      state.isLoading = false
      state.error = null
      state.generatedOtp = null
      state.isExistingUser = null
      state.accountRemoved = false
      clearAuthFromStorage()
    },
    setAccountRemoved: (state, action: PayloadAction<boolean>) => {
      state.accountRemoved = action.payload
      if (action.payload) {
        state.user = null
        state.isAuthenticated = false
        clearAuthFromStorage()
      }
    },
    restoreAuth: (state) => {
      const { user, service } = loadAuthFromStorage()
      if (user) {
        state.user = user
        state.isAuthenticated = true
        state.currentService = service
      }
      state.isLoading = false
    },
  },
})

export const { 
  setLoading, 
  setUser, 
  setError, 
  setCurrentService, 
  setGeneratedOtp,
  setIsExistingUser,
  updateUserDetails,
  logout,
  setAccountRemoved,
  restoreAuth
} = authSlice.actions

// Verify user exists in database
export const verifyUserInDatabase = () => async (dispatch: any, getState: () => { auth: AuthState }) => {
  const { auth } = getState()
  
  if (!auth.user || !auth.isAuthenticated) {
    return { exists: true }
  }
  
  if (!isSupabaseConfigured) {
    return { exists: true }
  }
  
  try {
    const exists = await checkUserExists(auth.user.phone)
    if (!exists) {
      dispatch(setAccountRemoved(true))
      return { exists: false }
    }
    return { exists: true }
  } catch (err) {
    return { exists: true }
  }
}

// Check if user exists (SINGLE ROW check)
export const checkUserExists = async (phone: string): Promise<boolean> => {
  console.log('[Auth] Checking if user exists:', phone)

  const phoneNorm = normalizePrimaryMobile(phone)
  if (!phoneNorm) return false

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(
        customerAuthUrl(`?phone=${encodeURIComponent(phoneNorm)}&existsOnly=1`)
      )
      if (!(await isCustomersApiLegacy(res))) {
        const data = await res.json()
        return Boolean(data?.exists)
      }
    } catch (e) {
      console.warn('[Auth] customers exists check failed, falling back:', e)
    }
  }

  if (!isSupabaseConfigured) {
    if (typeof window !== 'undefined') {
      const demoUsers = JSON.parse(localStorage.getItem('demoUsers') || '[]')
      return demoUsers.includes(phone) || demoUsers.includes(phoneNorm)
    }
    return false
  }

  try {
    const { data, error } = await supabase.from('users')
      .select('id')
      .eq('user_number', phoneNorm)
      .limit(1)

    if (error) {
      console.error('[Auth] Error checking user:', error)
      return false
    }

    return data && data.length > 0
  } catch (err) {
    console.error('[Auth] Exception checking user:', err)
    return false
  }
}

// Save demo user to localStorage
const saveDemoUser = (phone: string) => {
  if (typeof window !== 'undefined') {
    const demoUsers = JSON.parse(localStorage.getItem('demoUsers') || '[]')
    if (!demoUsers.includes(phone)) {
      demoUsers.push(phone)
      localStorage.setItem('demoUsers', JSON.stringify(demoUsers))
    }
  }
}

// Get user data (SINGLE ROW)
export const getUserData = async (phone: string): Promise<any | null> => {
  const phoneNorm = normalizePrimaryMobile(phone)
  if (!phoneNorm) return null

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(
        customerAuthUrl(`?phone=${encodeURIComponent(phoneNorm)}`)
      )
      if (!(await isCustomersApiLegacy(res))) {
        const data = await res.json()
        if (data?.customer) return data.customer
      }
    } catch (e) {
      console.warn('[Auth] customers getUserData failed, falling back:', e)
    }
  }

  if (!isSupabaseConfigured) return null

  try {
    const { data, error } = await supabase.from('users')
      .select('*')
      .eq('user_number', phoneNorm)
      .limit(1)
      .single()

    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

// SAVE USER - SINGLE ROW with ALL 3 SERVICES
// user_category field will store "food,person,parcel"
export const saveUser = async (
  userData: {
    phone: string
    name?: string
    email?: string
    user_id?: string
  }
): Promise<{ success: boolean; error?: string; userId?: string }> => {
  console.log('[Auth] Saving user (SINGLE ROW, all services):', userData.phone)

  const phoneNorm = normalizePrimaryMobile(userData.phone)
  if (!phoneNorm) {
    return { success: false, error: 'Invalid phone number' }
  }

  if (typeof window !== 'undefined') {
    try {
      const res = await fetch(customerAuthUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryMobile: phoneNorm,
          fullName: userData.name || 'User',
          customerId: userData.user_id || undefined,
          email: userData.email ?? null,
          createdVia: 'web',
        }),
      })
      if (!(await isCustomersApiLegacy(res))) {
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}))
          return {
            success: false,
            error: (errBody as { error?: string }).error || res.statusText,
          }
        }
        const body = await res.json()
        const uid = (body as { customer?: { user_id?: string } }).customer?.user_id
        return { success: true, userId: uid }
      }
    } catch (e: any) {
      console.warn('[Auth] customers saveUser failed, falling back:', e)
    }
  }

  if (!isSupabaseConfigured) {
    saveDemoUser(phoneNorm)
    return { success: true }
  }

  try {
    const existingData = await getUserData(phoneNorm)

    if (existingData) {
      console.log('[Auth] User exists, updating...')
      const updateFields: any = {}
      if (userData.name && userData.name !== existingData.name) updateFields.name = userData.name
      if (userData.email && userData.email !== existingData.email) updateFields.email = userData.email

      if (Object.keys(updateFields).length > 0) {
        const { error } = await supabase
          .from('users')
          .update(updateFields)
          .eq('user_number', phoneNorm)

        if (error) {
          console.error('[Auth] Error updating user:', error)
          return { success: false, error: error.message }
        }
      }

      return { success: true, userId: existingData.user_id }
    }

    const gmmsId = userData.user_id || (await getOrCreateGMMSId(phoneNorm))
    console.log('[Auth] Creating new user with GMMS ID:', gmmsId)

    const insertData = {
      user_id: gmmsId,
      name: userData.name || 'User',
      user_number: phoneNorm,
      email: userData.email || null,
      user_category: 'food,person,parcel',
      current_service: 'food',
      user_type: 'STANDARD',
      gatimitra_status: 'Not Active',
      account_status: 'active',
      account_balance: 0,
      account_creation_date: new Date().toISOString(),
    }

    console.log('[Auth] Inserting new user:', insertData)

    const { data, error } = await supabase.from('users').insert(insertData).select()

    if (error) {
      console.error('[Auth] Error inserting user:', error)

      if (error.code === '23505' || error.message.includes('duplicate')) {
        console.log('[Auth] User already exists (duplicate)')
        return { success: true, userId: gmmsId }
      }

      return { success: false, error: error.message }
    }

    console.log('[Auth] User created successfully:', data)
    return { success: true, userId: gmmsId }
  } catch (err: any) {
    console.error('[Auth] Exception saving user:', err)
    return { success: false, error: err.message || 'Unknown error' }
  }
}

// Sign In
export const signInWithPhone = (phone: string, category: ServiceCategory = 'food') => async (dispatch: any) => {
  dispatch(setLoading(true))
  dispatch(setError(null))
  
  try {
    const userExists = await checkUserExists(phone)
    dispatch(setIsExistingUser(userExists))
    
    if (!userExists) {
      dispatch(setError('No account found. Please sign up first.'))
      dispatch(setLoading(false))
      return { success: false, error: 'User not found', isNewUser: true }
    }

    const otpRoute = await requestOtpSms(phone)
    if ('error' in otpRoute) {
      dispatch(setError(otpRoute.error))
      dispatch(setLoading(false))
      return { success: false, error: otpRoute.error }
    }

    if (otpRoute.channel === 'demo') {
      const demoOtp = generateDemoOtp()
      dispatch(setGeneratedOtp(demoOtp))
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demoOtp', demoOtp)
        sessionStorage.setItem('authOtpChannel', 'demo')
      }
    } else {
      dispatch(setGeneratedOtp(null))
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('demoOtp')
        sessionStorage.setItem('authOtpChannel', 'msg91')
      }
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pendingAuthCategory', category)
      sessionStorage.setItem('authFlow', 'signin')
    }

    return { success: true, isNewUser: false }
  } catch (error: any) {
    dispatch(setError(error.message))
    return { success: false, error: error.message }
  } finally {
    dispatch(setLoading(false))
  }
}

// Verify OTP
export const verifyOtp = (phone: string, token: string, name?: string) => async (dispatch: any) => {
  dispatch(setLoading(true))
  dispatch(setError(null))
  console.log('[Auth] Verifying OTP for:', phone)
  
  try {
    const authFlow = typeof window !== 'undefined' ? sessionStorage.getItem('authFlow') : 'signin'
    const otpChannel =
      typeof window !== 'undefined' ? sessionStorage.getItem('authOtpChannel') : null

    if (otpChannel === 'msg91') {
      const r = await fetch(otpAuthUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', phone, otp: token }),
      })
      const j = (await r.json().catch(() => ({}))) as { valid?: boolean; message?: string }
      if (r.status === 501) {
        throw new Error('OTP verification is not available. Try again or contact support.')
      }
      if (!r.ok || !j.valid) {
        throw new Error(
          typeof j.message === 'string' && j.message
            ? j.message
            : 'Invalid OTP. Please try again.'
        )
      }
    } else {
      const storedOtp = typeof window !== 'undefined' ? sessionStorage.getItem('demoOtp') : null
      if (storedOtp && token !== storedOtp) {
        throw new Error('Invalid OTP. Please try again.')
      }
    }
    
    const category = (typeof window !== 'undefined' 
      ? sessionStorage.getItem('pendingAuthCategory') as ServiceCategory 
      : 'food') || 'food'
    
    const storedName = typeof window !== 'undefined' ? sessionStorage.getItem('pendingAuthName') : null
    const userName = name || storedName
    
    const isSignup = authFlow === 'signup'
    const gmmsId = await getOrCreateGMMSId(phone)
    
    if (isSignup) {
      console.log('[Auth] Processing signup - saving user...')
      const saveResult = await saveUser({
        phone: phone,
        name: userName || 'User',
        user_id: gmmsId,
      })
      
      if (!saveResult.success) {
        console.error('[Auth] Failed to save user:', saveResult.error)
      }
    }
    
    const userData = await getUserData(phone)
    
    // ALL 3 SERVICES available
    const services: ServiceCategory[] = ALL_SERVICES
    
    const userObj: User = {
      id: userData?.id || gmmsId,
      user_id: gmmsId,
      phone: phone,
      name: userName || userData?.name || 'User',
      email: userData?.email,
      services: services,
      currentCategory: category,
      isNewUser: isSignup,
      needsDetailsForm: isSignup,
      addressLine1: userData?.address_line1 || undefined,
      city: userData?.city || undefined,
      state: userData?.state || undefined,
      pincode: userData?.pincode || undefined,
      latitude: userData?.latitude ?? null,
      longitude: userData?.longitude ?? null,
    }
    
    dispatch(setUser(userObj))
    dispatch(setCurrentService(category))
    dispatch(setGeneratedOtp(null))

    saveAuthToStorage(userObj, category)

    if (typeof window !== 'undefined') {
      const pn = normalizePrimaryMobile(phone)
      if (pn && !isSignup) {
        void fetch(customerAuthUrl(), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: pn, recordLogin: true }),
        }).catch(() => {})
      }
      sessionStorage.removeItem('pendingAuthCategory')
      sessionStorage.removeItem('pendingAuthName')
      sessionStorage.removeItem('demoOtp')
      sessionStorage.removeItem('authOtpChannel')
      sessionStorage.removeItem('authFlow')
    }

    return { success: true, isNewUser: isSignup }
  } catch (error: any) {
    dispatch(setError(error.message))
    return { success: false, error: error.message }
  } finally {
    dispatch(setLoading(false))
  }
}

// Sign Up
export const signUpWithPhone = (phone: string, name?: string, category: ServiceCategory = 'food') => async (dispatch: any) => {
  dispatch(setLoading(true))
  dispatch(setError(null))
  
  try {
    const userExists = await checkUserExists(phone)
    
    if (userExists) {
      dispatch(setError('An account already exists. Please sign in instead.'))
      dispatch(setLoading(false))
      return { success: false, error: 'User already exists', isExistingUser: true }
    }
    
    dispatch(setIsExistingUser(false))

    const otpRoute = await requestOtpSms(phone)
    if ('error' in otpRoute) {
      dispatch(setError(otpRoute.error))
      dispatch(setLoading(false))
      return { success: false, error: otpRoute.error }
    }

    if (otpRoute.channel === 'demo') {
      const demoOtp = generateDemoOtp()
      dispatch(setGeneratedOtp(demoOtp))
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('demoOtp', demoOtp)
        sessionStorage.setItem('authOtpChannel', 'demo')
      }
    } else {
      dispatch(setGeneratedOtp(null))
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('demoOtp')
        sessionStorage.setItem('authOtpChannel', 'msg91')
      }
    }

    if (typeof window !== 'undefined') {
      sessionStorage.setItem('pendingAuthCategory', category)
      sessionStorage.setItem('authFlow', 'signup')
      if (name) sessionStorage.setItem('pendingAuthName', name)
    }

    return { success: true, isNewUser: true }
  } catch (error: any) {
    dispatch(setError(error.message))
    return { success: false, error: error.message }
  } finally {
    dispatch(setLoading(false))
  }
}

// Switch Service - NO DATABASE WRITE, just state change
// Popup will be shown by ServiceSwitchModal
export const switchService = (newService: ServiceCategory) => (dispatch: any, getState: () => { auth: AuthState }) => {
  const { auth } = getState()
  
  if (!auth.user) {
    return { success: false, error: 'Not logged in' }
  }
  
  console.log('[Auth] Switching service to:', newService)
  dispatch(setCurrentService(newService))
  
  if (auth.user) {
    const updatedUser = { ...auth.user, currentCategory: newService }
    saveAuthToStorage(updatedUser, newService)
  }
  
  return { success: true }
}

// Save user details
export const saveUserDetails = (
  phone: string,
  details: {
    email?: string
    referralCode?: string
    smsPermission?: boolean
    deviceId?: string
    phoneModel?: string
    brand?: string
  }
) => async (dispatch: any) => {
  dispatch(setLoading(true))
  
  try {
    const phoneNorm = normalizePrimaryMobile(phone)
    if (!phoneNorm) {
      dispatch(setError('Invalid phone number'))
      return { success: false, error: 'Invalid phone number' }
    }

    if (typeof window !== 'undefined') {
      try {
        const res = await fetch(customerAuthUrl(), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: phoneNorm,
            email: details.email,
            referralCode: details.referralCode,
            smsPermission: details.smsPermission ?? false,
            profileCompleted: true,
          }),
        })
        if (!(await isCustomersApiLegacy(res))) {
          if (!res.ok) throw new Error((await res.json()).error || 'Update failed')
          dispatch(
            updateUserDetails({
              email: details.email,
              smsPermission: details.smsPermission,
              needsDetailsForm: false,
            })
          )
          return { success: true }
        }
      } catch (e: any) {
        if (!isSupabaseConfigured) {
          dispatch(
            updateUserDetails({
              email: details.email,
              smsPermission: details.smsPermission,
              needsDetailsForm: false,
            })
          )
          return { success: true }
        }
        console.warn('[Auth] customers saveUserDetails failed, falling back:', e)
      }
    }

    if (!isSupabaseConfigured) {
      dispatch(
        updateUserDetails({
          email: details.email,
          smsPermission: details.smsPermission,
          needsDetailsForm: false,
        })
      )
      return { success: true }
    }

    const deviceInfo = getDeviceInfo()

    const { error } = await supabase
      .from('users')
      .update({
        email: details.email,
        referral_code: details.referralCode,
        sms_permission: details.smsPermission ?? false,
        device_id: details.deviceId || deviceInfo.deviceId,
        phone_model: details.phoneModel || deviceInfo.phoneModel,
        brand: details.brand || deviceInfo.brand,
        app_download_date: new Date().toISOString(),
      })
      .eq('user_number', phoneNorm)

    if (error) throw error

    dispatch(
      updateUserDetails({
        email: details.email,
        smsPermission: details.smsPermission,
        needsDetailsForm: false,
      })
    )

    return { success: true }
  } catch (error: any) {
    dispatch(setError(error.message))
    return { success: false, error: error.message }
  } finally {
    dispatch(setLoading(false))
  }
}

// LEGACY compatibility - just calls switchService
export const switchUserToCategory = (phone: string, name: string | undefined, newCategory: ServiceCategory) => async (dispatch: any) => {
  return dispatch(switchService(newCategory))
}

// LEGACY compatibility
export const updateUserCategories = (categories: ServiceCategory[]) => (dispatch: any, getState: () => { auth: AuthState }) => {
  const { auth } = getState()
  if (auth.user) {
    dispatch(updateUserDetails({ services: categories }))
  }
}

// LEGACY - for backwards compatibility
export const getUserCategories = async (phone: string): Promise<ServiceCategory[]> => {
  // All users have access to all 3 services
  return ALL_SERVICES
}

// LEGACY - for backwards compatibility
export const checkUserInCategory = async (phone: string, category: ServiceCategory): Promise<boolean> => {
  // User has access to all categories
  return true
}

// LEGACY - for backwards compatibility
export const saveUserToCategory = async (
  userData: { phone: string; name?: string; email?: string; user_id?: string },
  category: ServiceCategory
): Promise<{ success: boolean; error?: string; userId?: string }> => {
  // Just call saveUser - no separate rows per category
  return saveUser(userData)
}

export default authSlice.reducer

