import { BookOpen, CirclePlus, Database, FileText, LogOut, MessageCircle, Settings, Trash } from 'lucide-react'
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
import { getConversations, deleteConversation as deleteConv } from '@/lib/chat-db'
import { stripBasePath, withBasePath } from '@/lib/base-path'
import { ModeToggle } from './mode-toggle'
import logoSvg from '../assets/logo.svg'

function useConversations(): ConversationEntry[] {
  const [conversations, setConversations] = useState<ConversationEntry[]>([])

  useEffect(() => {
    const loadConversations = () => {
      getConversations()
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
  }, [])

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

export function AppSidebar({ onLogout }: { onLogout: () => void }) {
  const conversations = useConversations()
  const [conversationId] = useConversationIdFromUrl()
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<ConversationEntry | null>(null)

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
      <Sidebar collapsible="icon" className="bg-sidebar text-sidebar-foreground">
        <SidebarHeader className="bg-sidebar text-sidebar-foreground">
          <SidebarTrigger className="ml-auto" />
          <div className="ml-2 flex items-center">
            <h1 className="text-l font-medium text-balance truncate whitespace-nowrap">
              <img src={logoSvg} className="inline h-4 mr-2 mb-1" />
              <span className="group-data-[state=collapsed]:invisible">Migration Assistant</span>
            </h1>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarMenu className="mb-2">
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Start a new conversation">
                  <a href={withBasePath('/')} onClick={doLocalNavigation}>
                    <CirclePlus />
                    <span>New conversation</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="View agent details">
                  <a href={withBasePath('/agent-details')} onClick={doLocalNavigation}>
                    <FileText />
                    <span>Agent details</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="View knowledge logic">
                  <a href={withBasePath('/knowledge-details')} onClick={doLocalNavigation}>
                    <BookOpen />
                    <span>Knowledge details</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Explore database schema">
                  <a href={withBasePath('/database-explorer')} onClick={doLocalNavigation}>
                    <Database />
                    <span>Database Profiler</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Configure databases">
                  <a href={withBasePath('/database-config')} onClick={doLocalNavigation}>
                    <Settings />
                    <span>Database Config</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>

            <div className="px-2 pt-3 group-data-[state=collapsed]:hidden">
              <SidebarSeparator className="mx-0" />
              <p className="pt-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Chat history
              </p>
            </div>

            <SidebarGroupContent className="pt-2">
              <SidebarMenu>
                {conversations.map((conversation, index) => (
                  <SidebarMenuItem key={index} className="group/sidebar-menu-item">
                    <div className="flex items-center gap-1 h-auto">
                      <SidebarMenuButton asChild tooltip={conversation.firstMessage} className="flex-1">
                        <a
                          href={withBasePath(conversation.id)}
                          onClick={doLocalNavigation}
                          className={cn('h-auto flex items-start gap-2', {
                            'bg-accent pointer-events-none': conversation.id === conversationId,
                          })}
                        >
                          <MessageCircle className="size-3 mt-1" />
                          <span className="flex flex-col items-start">
                            <span className="truncate max-w-44">{conversation.firstMessage}</span>
                            <span className="text-xs opacity-30">
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

        <SidebarFooter className="flex-row items-center justify-between gap-2">
          <ModeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={onLogout}>
                <LogOut className="h-[1.2rem] w-[1.2rem]" />
                <span className="sr-only">Logout</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Logout</TooltipContent>
          </Tooltip>
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
