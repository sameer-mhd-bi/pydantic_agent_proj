export interface AppError {
  id: string
  timestamp: string
  error: string
  severity: 'error' | 'warning' | 'info'
  status: 'resolved' | 'pending'
  source?: string
}

const STORAGE_KEY = 'app_errors'
const MAX_ERRORS = 100

export function logError(message: string, severity: 'error' | 'warning' | 'info' = 'error', source?: string) {
  const error: AppError = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleString(),
    error: message,
    severity,
    status: 'pending',
    source,
  }

  const errors = getErrors()
  errors.unshift(error)
  if (errors.length > MAX_ERRORS) {
    errors.pop()
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(errors))
  console.log('Error logged:', error)
  console.log('Total errors in storage:', errors.length)
  
  // Dispatch event to notify other components
  window.dispatchEvent(new CustomEvent('error-logged', { detail: error }))
  return error
}

export function getErrors(): AppError[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

export function clearErrors() {
  localStorage.removeItem(STORAGE_KEY)
}

export function updateErrorStatus(id: string, status: 'resolved' | 'pending') {
  const errors = getErrors()
  const error = errors.find((e) => e.id === id)
  if (error) {
    error.status = status
    localStorage.setItem(STORAGE_KEY, JSON.stringify(errors))
  }
}

export function deleteError(id: string) {
  const errors = getErrors().filter((e) => e.id !== id)
  localStorage.setItem(STORAGE_KEY, JSON.stringify(errors))
}
