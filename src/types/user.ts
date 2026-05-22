export interface User {
  id: string
  username: string
  email: string
  password: string
  fullName: string
  role: 'user' | 'admin'
  createdAt: string
  lastLogin: string | null
  permissions?: {
    agentDetails: boolean
    knowledgeDetails: boolean
    databaseExplorer: boolean
    databaseConfig: boolean
  }
}

export interface SignupFormData {
  username: string
  email: string
  password: string
  confirmPassword: string
  fullName: string
}

export interface AuthContextType {
  currentUser: User | null
  login: (username: string, password: string) => Promise<void>
  signup: (data: SignupFormData) => Promise<void>
  logout: () => void
  isLoading: boolean
  error: string | null
}
