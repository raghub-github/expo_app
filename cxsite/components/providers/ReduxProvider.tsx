'use client'

import { useEffect, useState } from 'react'
import { Provider } from 'react-redux'
import { store } from '@/lib/store'
import { restoreAuth, verifyUserInDatabase, setAccountRemoved } from '@/lib/slices/authSlice'
import { useAppSelector, useAppDispatch } from '@/lib/hooks'
import AccountRemovedModal from '@/components/auth/AccountRemovedModal'
import AuthModal from '@/components/auth/AuthModal'

// Component to handle account removed modal
function AccountRemovedHandler() {
  const dispatch = useAppDispatch()
  const { accountRemoved } = useAppSelector(state => state.auth)
  const [showSignupModal, setShowSignupModal] = useState(false)
  
  const handleRegister = () => {
    // Clear the account removed state
    dispatch(setAccountRemoved(false))
    // Open signup modal directly
    setShowSignupModal(true)
  }
  
  return (
    <>
      <AccountRemovedModal isOpen={accountRemoved} onRegister={handleRegister} />
      <AuthModal 
        isOpen={showSignupModal} 
        onClose={() => setShowSignupModal(false)} 
        initialMode="signup"
      />
    </>
  )
}

// Component to restore and verify auth on mount
function AuthRestorer({ children }: { children: React.ReactNode }) {
  const [isHydrated, setIsHydrated] = useState(false)
  
  useEffect(() => {
    const initAuth = async () => {
      try {
        // First restore auth from localStorage immediately
        store.dispatch(restoreAuth())
        console.log('[AuthRestorer] Auth state restored from localStorage')
        
        // Verify user still exists in database (non-blocking)
        const result = await store.dispatch(verifyUserInDatabase() as any)
        console.log('[AuthRestorer] User verification result:', result)
      } catch (error) {
        console.error('[AuthRestorer] Error during auth initialization:', error)
      } finally {
        setIsHydrated(true)
      }
    }
    
    initAuth()
  }, [])
  
  // Return children immediately to prevent flash of logout state
  return <>{children}</>
}

export default function ReduxProvider({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Provider store={store}>
      <AuthRestorer>
        {children}
        <AccountRemovedHandler />
      </AuthRestorer>
    </Provider>
  )
}

