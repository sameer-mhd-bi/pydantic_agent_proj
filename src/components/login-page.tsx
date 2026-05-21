import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ModeToggle } from './mode-toggle'
import logoSvg from '../assets/logo.svg'

type LoginPageProps = {
  onLoginSuccess: () => void
}

const VALID_USERNAME = 'roo'
const VALID_PASSWORD = 'root'

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (username === VALID_USERNAME && password === VALID_PASSWORD) {
      window.localStorage.setItem('migration-assistant-authenticated', 'true')
      setError('')
      onLoginSuccess()
      return
    }

    setError('Invalid username or password.')
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="absolute top-4 right-4">
        <ModeToggle />
      </div>

      <div className="w-full max-w-md rounded-3xl border bg-card p-8 shadow-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-6 flex size-11 items-center justify-center rounded-2xl bg-sidebar">
            <img src={logoSvg} alt="Migration Assistant" className="h-11 w-100" />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Migration Assistant</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to continue using the data migration workspace.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="username">
              Username
            </label>
            <Input id="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="password">
              Password
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>

          {error && <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}

          <Button className="w-full" type="submit">
            Login
          </Button>
        </form>
      </div>
    </div>
  )
}