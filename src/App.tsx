import { useEffect, useState } from 'react'
import Chat from './Chat.tsx'
import { AgentDetailsPage } from './components/agent-details-page.tsx'
import { KnowledgeDetailsPage } from './components/knowledge-details-page.tsx'
import { DatabaseExplorerPage } from './components/database-explorer-page.tsx'
import { DatabaseConfigPage } from './components/database-config-page.tsx'
import { LoginPage } from './components/login-page.tsx'
import { AppSidebar } from './components/app-sidebar.tsx'
import { ThemeProvider } from './components/theme-provider.tsx'
import { SidebarProvider } from './components/ui/sidebar.tsx'
import { Toaster } from './components/ui/sonner.tsx'
import { cn } from './lib/utils.ts'
import { migrateFromLocalStorage } from './lib/chat-db.ts'
import { useConversationIdFromUrl } from './hooks/useConversationIdFromUrl.tsx'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

export default function App() {
  const [ready, setReady] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [route] = useConversationIdFromUrl()

  const isAgentDetailsPage = route === '/agent-details'
  const isKnowledgeDetailsPage = route === '/knowledge-details'
  const isDatabaseExplorerPage = route === '/database-explorer'
  const isDatabaseConfigPage = route === '/database-config'
  const isDetailsPage = isAgentDetailsPage || isKnowledgeDetailsPage || isDatabaseExplorerPage || isDatabaseConfigPage

  useEffect(() => {
    setIsAuthenticated(window.localStorage.getItem('migration-assistant-authenticated') === 'true')

    migrateFromLocalStorage()
      .then((migrated) => {
        if (migrated) {
          window.dispatchEvent(new Event('conversations-changed'))
        }
      })
      .catch((err: unknown) => {
        console.error('Migration failed:', err)
      })
      .finally(() => {
        setReady(true)
      })
  }, [])

  const handleLogout = () => {
    window.localStorage.removeItem('migration-assistant-authenticated')
    setIsAuthenticated(false)
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="pydantic-chat-ui-theme">
        {!isAuthenticated ? (
          <LoginPage onLoginSuccess={() => setIsAuthenticated(true)} />
        ) : (
        <SidebarProvider defaultOpen>
          <AppSidebar onLogout={handleLogout} />

          <div className="flex flex-col justify-center flex-1 h-screen overflow-hidden">
            <div
              className={cn(
                'flex flex-col max-w-4xl mx-auto relative w-full basis-[100vh] overflow-hidden',
                'has-[.stick-to-bottom:empty]:overflow-visible has-[.stick-to-bottom:empty]:basis-[0px] transition-[flex-basis] duration-200',
                isDetailsPage && 'max-w-6xl px-6 py-8 overflow-auto',
              )}
            >
                {ready &&
                  (isAgentDetailsPage ? <AgentDetailsPage /> : isKnowledgeDetailsPage ? <KnowledgeDetailsPage /> : isDatabaseExplorerPage ? <DatabaseExplorerPage /> : isDatabaseConfigPage ? <DatabaseConfigPage /> : <Chat />)}
            </div>
          </div>
        </SidebarProvider>
        )}
      </ThemeProvider>
      <Toaster richColors />
    </QueryClientProvider>
  )
}
