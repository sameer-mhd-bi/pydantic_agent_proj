import { BookOpen, CirclePlus, Database, FileText, LogOut, MessageCircle, Settings, Trash, UserCog, TrendingUp } from 'lucide-react'
import type React from 'react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useConversationIdFromUrl } from '@/hooks/useConversationIdFromUrl'
import { cn } from '@/lib/utils'
import type { ConversationEntry } from '@/types'
import type { User } from '@/types/user'
import { getConversations, deleteConversation as deleteConv } from '@/lib/chat-db'
import { stripBasePath, withBasePath } from '@/lib/base-path'
import { ModeToggle } from './mode-toggle'
// import logoSvg from '../assets/logo.svg'

function useConversations(userId?: string): ConversationEntry[] {
  const [conversations, setConversations] = useState<ConversationEntry[]>([])

  useEffect(() => {
    const loadConversations = () => {
      getConversations(userId)
        .then(setConversations)
        .catch((err: unknown) => {
          console.error('Failed to load conversations:', err)
        })
    }

    loadConversations()

    window.addEventListener('conversations-changed', loadConversations)

    return () => {
      window.removeEventListener('conversations-changed', loadConversations)
    }
  }, [userId])

  return conversations
}

function doLocalNavigation(e: React.MouseEvent) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey) {
    return
  }
  const path = new URL((e.currentTarget as HTMLAnchorElement).href).pathname
  window.history.pushState({}, '', path)
  // custom event to notify other components of the URL change
  window.dispatchEvent(new Event('history-state-changed'))
  e.preventDefault()
}

function deleteConversation(conversationId: string) {
  return deleteConv(conversationId).then(() => {
    window.dispatchEvent(new Event('conversations-changed'))

    const currentPath = stripBasePath(window.location.pathname)
    if (currentPath === conversationId) {
      window.history.pushState({}, '', withBasePath('/'))
      window.dispatchEvent(new Event('history-state-changed'))
    }
  })
}

export function AppSidebar({ onLogout, currentUser }: { onLogout: () => void; currentUser: User }) {
  const conversations = useConversations(currentUser.id)
  const [route] = useConversationIdFromUrl()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<ConversationEntry | null>(null)

  const isActive = (path: string) => {
    if (path === '/' && (route === '/' || route === '')) return true
    return route === path
  }

  const handleDeleteClick = (e: React.MouseEvent, conversation: ConversationEntry) => {
    e.preventDefault()
    e.stopPropagation()
    setConversationToDelete(conversation)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (conversationToDelete) {
      deleteConversation(conversationToDelete.id)
        .then(() => {
          setDeleteDialogOpen(false)
          setConversationToDelete(null)
          toast.success('Chat deleted successfully')
        })
        .catch((err: unknown) => {
          console.error('Failed to delete conversation:', err)
          toast.error('Failed to delete chat')
        })
    }
  }

  return (
    <TooltipProvider>
      <Sidebar collapsible="icon" style={{ backgroundColor: '#56378c', color: '#DFDFDF' }}>
        <SidebarHeader className="flex flex-col gap-2" style={{ backgroundColor: '#56378c', color: '#DFDFDF' }}>
          <div className="flex items-center justify-between">
            <SidebarTrigger className="ml-0" />
          </div>
          <div className="ml-2 flex items-center">
            <h1 className="text-l font-medium text-balance truncate whitespace-nowrap">
              <span className="group-data-[state=collapsed]:invisible">Migration Assistant</span>
            </h1>
          </div>
          <div className="px-2 py-2 rounded-lg text-sm group-data-[state=collapsed]:hidden flex items-center justify-between" style={{ backgroundColor: '#000000' }}>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{currentUser.fullName}</p>
              <p className="text-xs opacity-70 truncate">{currentUser.email}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={onLogout} className="h-8 w-8 ml-2 flex-shrink-0">
                  <LogOut className="h-4 w-4" />
                  <span className="sr-only">Logout</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Logout</TooltipContent>
            </Tooltip>
          </div>
        </SidebarHeader>

        <SidebarContent style={{ backgroundColor: '#56378c' }}>
          <SidebarGroup>
            <SidebarMenu className="mb-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Start a new conversation" className={cn('hover:bg-black hover:text-white', isActive('/') && 'bg-black text-white')}>
                  <a href={withBasePath('/')} onClick={doLocalNavigation}>
                    <CirclePlus />
                    <span>New conversation</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {currentUser.permissions?.agentDetails !== false && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="View agent details" className={cn('hover:bg-black hover:text-white', isActive('/agent-details') && 'bg-black text-white')}>
                  <a href={withBasePath('/agent-details')} onClick={doLocalNavigation}>
                    <FileText />
                    <span>Agent details</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              )}
              {currentUser.permissions?.knowledgeDetails !== false && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="View knowledge logic" className={cn('hover:bg-black hover:text-white', isActive('/knowledge-details') && 'bg-black text-white')}>
                    <a href={withBasePath('/knowledge-details')} onClick={doLocalNavigation}>
                      <BookOpen />
                      <span>Knowledge details</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {currentUser.permissions?.databaseExplorer !== false && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Explore database schema" className={cn('hover:bg-black hover:text-white', isActive('/database-explorer') && 'bg-black text-white')}>
                    <a href={withBasePath('/database-explorer')} onClick={doLocalNavigation}>
                      <Database />
                      <span>Database Profiler</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {currentUser.role === 'admin' && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Configure databases" className={cn('hover:bg-black hover:text-white', isActive('/database-config') && 'bg-black text-white')}>
                    <a href={withBasePath('/database-config')} onClick={doLocalNavigation}>
                      <Settings />
                      <span>Database Config</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              {currentUser.role === 'admin' && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip="Manage users" className={cn('hover:bg-black hover:text-white', isActive('/admin') && 'bg-black text-white')}>
                    <a href={withBasePath('/admin')} onClick={doLocalNavigation}>
                      <UserCog />
                      <span>Admin Panel</span>
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="View migration statistics" className={cn('hover:bg-black hover:text-white', isActive('/migration-dashboard') && 'bg-black text-white')}>
                  <a href={withBasePath('/migration-dashboard')} onClick={doLocalNavigation}>
                    <TrendingUp />
                    <span>Migration Dashboard</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <div className="px-2 pt-3 group-data-[state=collapsed]:hidden">
              <SidebarSeparator className="mx-0" />
              <p className="pt-3 text-xs font-semibold uppercase tracking-[0.12em]" style={{ color: '#DFDFDF' }}>
                Chat history
              </p>
            </div>

            <SidebarGroupContent className="pt-2">
              <SidebarMenu>
                {conversations.map((conversation, index) => (
                  <SidebarMenuItem key={index} className="group/sidebar-menu-item">
                    <div className="flex items-center gap-1 h-auto">
                      <SidebarMenuButton asChild tooltip={conversation.firstMessage} className="flex-1 hover:bg-black hover:text-white">
                        <a
                          href={withBasePath(conversation.id)}
                          onClick={doLocalNavigation}
                          className={cn('h-auto flex items-start gap-2', {
                            'bg-black pointer-events-none': conversation.id === route,
                          })}
                        >
                          <MessageCircle className="size-3 mt-1" />
                          <span className="flex flex-col items-start">
                            <span className="truncate max-w-44">{conversation.firstMessage}</span>
                            <span className="text-xs" style={{ color: '#DFDFDF' }}>
                              {new Date(conversation.timestamp).toLocaleString()}
                            </span>
                          </span>
                        </a>
                      </SidebarMenuButton>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1.5 opacity-0 group-hover/sidebar-menu-item:opacity-100 transition-opacity group-data-[state=collapsed]:hidden absolute right-0 self-start"
                            onClick={(e) => {
                              handleDeleteClick(e, conversation)
                            }}
                          >
                            <Trash className="size-3" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete conversation</TooltipContent>
                      </Tooltip>
                    </div>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="flex-row items-center justify-between gap-2" style={{ backgroundColor: '#56378c' }}>
          <ModeToggle />
        </SidebarFooter>

        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                handleConfirmDelete()
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Delete conversation?</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this chat? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false)
                }}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} autoFocus>
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Sidebar>
    </TooltipProvider>
  )
}
