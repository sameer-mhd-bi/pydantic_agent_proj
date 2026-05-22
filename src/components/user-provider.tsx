import type React from 'react'
import { createContext, useContext, useState, useEffect } from 'react'
import type { User, SignupFormData, AuthContextType } from '@/types/user'
import { authenticateUser, createUser, setCurrentUser, getCurrentUser } from '@/lib/user-storage'

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUserState] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const user = getCurrentUser()
    setCurrentUserState(user)
  }, [])

  const login = async (username: string, password: string) => {
    setIsLoading(true)
    setError(null)
    try {
      const user = authenticateUser(username, password)
      if (user) {
        setCurrentUser(user)
        setCurrentUserState(user)
      } else {
        throw new Error('Invalid credentials')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async (data: SignupFormData) => {
    setIsLoading(true)
    setError(null)
    try {
      if (data.password !== data.confirmPassword) {
        throw new Error('Passwords do not match')
      }
      createUser(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed')
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  const logout = () => {
    setCurrentUser(null)
    setCurrentUserState(null)
    setError(null)
  }

  return (
    <AuthContext.Provider value={{ currentUser, login, signup, logout, isLoading, error }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within UserProvider')
  }
  return context
}
