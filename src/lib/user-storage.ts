import type { User, SignupFormData } from '@/types/user'

const USERS_KEY = 'pydantic-chat-users'
const CURRENT_USER_KEY = 'pydantic-chat-current-user'

// Initialize with default admin user
const DEFAULT_USERS: User[] = [
  {
    id: 'admin-001',
    username: 'admin',
    email: 'admin@example.com',
    password: 'admin123',
    fullName: 'Administrator',
    role: 'admin',
    createdAt: new Date().toISOString(),
    lastLogin: null,
  },
]

export function getUsers(): User[] {
  const stored = localStorage.getItem(USERS_KEY)
  return stored ? JSON.parse(stored) : DEFAULT_USERS
}

export function saveUsers(users: User[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users))
}

export function getCurrentUser(): User | null {
  const stored = localStorage.getItem(CURRENT_USER_KEY)
  return stored ? JSON.parse(stored) : null
}

export function setCurrentUser(user: User | null): void {
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user))
  } else {
    localStorage.removeItem(CURRENT_USER_KEY)
  }
}

export function authenticateUser(username: string, password: string): User | null {
  const users = getUsers()
  const user = users.find((u) => u.username === username && u.password === password)

  if (user) {
    const updatedUser = { ...user, lastLogin: new Date().toISOString() }
    const updatedUsers = users.map((u) => (u.id === user.id ? updatedUser : u))
    saveUsers(updatedUsers)
    return updatedUser
  }

  return null
}

export function createUser(data: SignupFormData): User {
  const users = getUsers()

  // Check if username/email already exists
  if (users.some((u) => u.username === data.username)) {
    throw new Error('Username already exists')
  }
  if (users.some((u) => u.email === data.email)) {
    throw new Error('Email already exists')
  }

  const newUser: User = {
    id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    username: data.username,
    email: data.email,
    password: data.password,
    fullName: data.fullName,
    role: 'user',
    createdAt: new Date().toISOString(),
    lastLogin: null,
    permissions: {
      agentDetails: false,
      knowledgeDetails: false,
      databaseExplorer: true,
      databaseConfig: false,
    },
  }

  users.push(newUser)
  saveUsers(users)
  return newUser
}

export function getUserConversationsKey(userId: string): string {
  return `pydantic-chat-conversations-${userId}`
}
