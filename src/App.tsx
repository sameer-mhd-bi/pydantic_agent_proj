import { useEffect, useState } from 'react'
import Chat from './Chat.tsx'
import { AgentDetailsPage } from './components/agent-details-page.tsx'
import { KnowledgeDetailsPage } from './components/knowledge-details-page.tsx'
import { DatabaseExplorerPage } from './components/database-explorer-page.tsx'
import { DatabaseConfigPage } from './components/database-config-page.tsx'
import { AdminPage } from './components/admin-page.tsx'
import { LoginPage } from './components/login-page.tsx'
import { MigrationDashboard } from './components/migration-dashboard.tsx'
import { ErrorLogsPage } from './components/error-logs-page.tsx'
import { AppSidebar } from './components/app-sidebar.tsx'
import { ThemeProvider } from './components/theme-provider.tsx'
import { UserProvider, useAuth } from './components/user-provider.tsx'
import { SidebarProvider } from './components/ui/sidebar.tsx'
import { Toaster } from './components/ui/sonner.tsx'
import { cn } from './lib/utils.ts'
import { migrateFromLocalStorage } from './lib/chat-db.ts'
import { useConversationIdFromUrl } from './hooks/useConversationIdFromUrl.tsx'
// import { getUserConversationsKey } from './lib/user-storage'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

// Global unhandled rejection handler to catch streaming and async errors
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason)
    // Log error but don't prevent default to allow graceful handling
  })
}

function AppContent() {
  const [ready, setReady] = useState(false)
  const [route] = useConversationIdFromUrl()
  const { currentUser, logout } = useAuth()

  const isAgentDetailsPage = route === '/agent-details'
  const isKnowledgeDetailsPage = route === '/knowledge-details'
  const isDatabaseExplorerPage = route === '/database-explorer'
  const isDatabaseConfigPage = route === '/database-config'
  const isAdminPage = route === '/admin'
  const isMigrationDashboard = route === '/migration-dashboard'
  const isErrorLogsPage = route === '/error-logs'
  const isDetailsPage = isAgentDetailsPage || isKnowledgeDetailsPage || isDatabaseExplorerPage || isDatabaseConfigPage || isAdminPage || isMigrationDashboard || isErrorLogsPage

  useEffect(() => {
    if (currentUser) {
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
    } else {
    }
  }, [currentUser])

  // Redirect to migration dashboard on first login only
  useEffect(() => {
   if (ready && !localStorage.getItem('app-initial-redirected')) {
     localStorage.setItem('app-initial-redirected', 'true')
     window.history.pushState({}, '', '/migration-dashboard')
     window.dispatchEvent(new Event('history-state-changed'))
   }
  }, [ready])

  const handleLogout = () => {
    logout()
  }

  if (!currentUser) {
    return <LoginPage onLoginSuccess={() => {}} />
  }

  if (isAdminPage && currentUser.role !== 'admin') {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('history-state-changed'))
  }

  if (isDatabaseConfigPage && currentUser.role !== 'admin') {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('history-state-changed'))
  }

  if (isKnowledgeDetailsPage && currentUser.permissions?.knowledgeDetails === false) {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('history-state-changed'))
  }

  if (isDatabaseExplorerPage && currentUser.permissions?.databaseExplorer === false) {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('history-state-changed'))
  }

  if (isAgentDetailsPage && currentUser.permissions?.agentDetails === false) {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new Event('history-state-changed'))
  }

  return (
    <SidebarProvider defaultOpen>
      <AppSidebar onLogout={handleLogout} currentUser={currentUser} />

      <div className="flex flex-col justify-center flex-1 h-screen overflow-hidden">
        <div
          className={cn(
            'flex flex-col max-w-4xl mx-auto relative w-full basis-[100vh] overflow-hidden',
            'has-[.stick-to-bottom:empty]:overflow-visible has-[.stick-to-bottom:empty]:basis-[0px] transition-[flex-basis] duration-200',
            isDetailsPage && 'max-w-6xl px-6 py-8 overflow-auto',
          )}
        >
         {isAgentDetailsPage ? (
           <AgentDetailsPage />
         ) : isKnowledgeDetailsPage ? (
           <KnowledgeDetailsPage />
         ) : isDatabaseExplorerPage ? (
           <DatabaseExplorerPage />
         ) : isDatabaseConfigPage ? (
           <DatabaseConfigPage />
         ) : isAdminPage ? (
           <AdminPage />
         ) : isMigrationDashboard ? (
           <MigrationDashboard />
         ) : isErrorLogsPage ? (
           <ErrorLogsPage />
         ) : (
           <Chat />
         )}
        </div>
      </div>
    </SidebarProvider>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="system" storageKey="pydantic-chat-ui-theme">
        <UserProvider>
          <AppContent />
        </UserProvider>
      </ThemeProvider>
      <Toaster richColors />
    </QueryClientProvider>
  )
}
