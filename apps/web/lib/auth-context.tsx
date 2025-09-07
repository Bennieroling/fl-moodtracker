'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase-browser'
import { validateLogin, validateRegister, LoginData, RegisterData } from '@/lib/validations'
import { toast } from 'sonner'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (data: LoginData) => Promise<{ error?: string }>
  signUp: (data: RegisterData) => Promise<{ error?: string }>
  signInWithGoogle: () => Promise<{ error?: string }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error?: string }>
  signInDemo: () => Promise<void> // Added demo sign in
  isDemoMode: boolean // Added demo mode flag
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signIn: async () => ({ error: 'Not implemented' }),
  signUp: async () => ({ error: 'Not implemented' }),
  signInWithGoogle: async () => ({ error: 'Not implemented' }),
  signOut: async () => {},
  resetPassword: async () => ({ error: 'Not implemented' }),
  signInDemo: async () => {}, // Added demo sign in
  isDemoMode: false, // Added demo mode flag
})

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

interface AuthProviderProps {
  children: React.ReactNode
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [mounted, setMounted] = useState(false)
  const supabase = createClient()

  // Handle client-side mounting
  useEffect(() => {
    setMounted(true)
  }, [])

  // Check if we're in demo mode (missing real credentials)
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const isDemo = !url || url.includes('demo-project') || !key || key.includes('demo-')
    setIsDemoMode(isDemo)
  }, [])

  useEffect(() => {
    // Only run on client side after mounting
    if (!mounted) return

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)

      // Track auth events
      if (event === 'SIGNED_IN' && session?.user) {
        toast.success('Welcome back!', {
          description: 'You have been signed in successfully.',
        })
      }
    })

    return () => subscription.unsubscribe()
  }, [mounted, supabase.auth])

  const signIn = async (data: LoginData): Promise<{ error?: string }> => {
    try {
      validateLogin(data)
      
      const { error } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      })

      if (error) {
        toast.error('Sign In Failed', {
          description: error.message,
        })
        return { error: error.message }
      }

      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error('Sign In Failed', {
        description: message,
      })
      return { error: message }
    }
  }

  const signUp = async (data: RegisterData): Promise<{ error?: string }> => {
    try {
      validateRegister(data)
      
      const { error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      })

      if (error) {
        toast.error('Sign Up Failed', {
          description: error.message,
        })
        return { error: error.message }
      }

      toast.success('Account Created!', {
        description: 'Please check your email to verify your account.',
      })

      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error('Sign Up Failed', {
        description: message,
      })
      return { error: message }
    }
  }

  const signInWithGoogle = async (): Promise<{ error?: string }> => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        toast.error('Google Sign In Failed', {
          description: error.message,
        })
        return { error: error.message }
      }

      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error('Google Sign In Failed', {
        description: message,
      })
      return { error: message }
    }
  }

  const signOut = async (): Promise<void> => {
    try {
      const { error } = await supabase.auth.signOut()
      
      if (error) {
        toast.error('Sign Out Failed', {
          description: error.message,
        })
        return
      }

      toast.success('Signed Out', {
        description: 'You have been signed out successfully.',
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error('Sign Out Failed', {
        description: message,
      })
    }
  }

  const resetPassword = async (email: string): Promise<{ error?: string }> => {
    try {
      if (!email || !email.includes('@')) {
        return { error: 'Please enter a valid email address' }
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })

      if (error) {
        toast.error('Reset Failed', {
          description: error.message,
        })
        return { error: error.message }
      }

      toast.success('Reset Email Sent', {
        description: 'Please check your email for password reset instructions.',
      })

      return {}
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An unexpected error occurred'
      toast.error('Reset Failed', {
        description: message,
      })
      return { error: message }
    }
  }

  // Demo sign-in function
  const signInDemo = async (): Promise<void> => {
    try {
      setLoading(true)
      
      // Create a mock user for demo purposes
      const mockUser: User = {
        id: 'demo-user-123',
        email: 'demo@sofi.app',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        app_metadata: {},
        user_metadata: {
          full_name: 'Demo User',
          avatar_url: null,
        },
        aud: 'authenticated',
        role: 'authenticated',
        email_confirmed_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
        phone: undefined,
      } as User

      // Create a mock session
      const mockSession: Session = {
        access_token: 'demo-access-token',
        refresh_token: 'demo-refresh-token',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        token_type: 'bearer',
        user: mockUser,
      }

      setUser(mockUser)
      setSession(mockSession)
      setLoading(false)

      toast.success('Demo Mode Activated!', {
        description: 'Explore all features with demo data.',
      })
    } catch (error) {
      setLoading(false)
      const message = error instanceof Error ? error.message : 'Demo sign-in failed'
      toast.error('Demo Sign In Failed', {
        description: message,
      })
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signInWithGoogle,
    signOut,
    resetPassword,
    signInDemo,
    isDemoMode,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

// Hook to check if user is authenticated
export const useRequireAuth = () => {
  const { user, loading } = useAuth()
  
  return {
    user,
    loading,
    isAuthenticated: !!user,
  }
}

export default AuthProvider