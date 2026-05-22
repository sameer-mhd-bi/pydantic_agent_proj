import { useEffect, useState } from 'react'
import { Trash2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import type { User } from '@/types/user'
import { getUsers, saveUsers } from '@/lib/user-storage'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'

export function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [userToDelete, setUserToDelete] = useState<User | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [editRole, setEditRole] = useState<'user' | 'admin'>('user')
  const [editPermissions, setEditPermissions] = useState({
    agentDetails: true,
    knowledgeDetails: true,
    databaseExplorer: true,
    databaseConfig: false,
  })

  useEffect(() => {
    const loadedUsers = getUsers()
    setUsers(loadedUsers)
  }, [])

  const handleDeleteClick = (user: User) => {
    setUserToDelete(user)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (userToDelete && userToDelete.role !== 'admin') {
      const updatedUsers = users.filter((u) => u.id !== userToDelete.id)
      saveUsers(updatedUsers)
      setUsers(updatedUsers)
      setDeleteDialogOpen(false)
      setUserToDelete(null)
      toast.success(`User ${userToDelete.username} deleted successfully`)
    } else if (userToDelete?.role === 'admin') {
      toast.error('Cannot delete admin users')
      setDeleteDialogOpen(false)
      setUserToDelete(null)
    }
  }

  const handleEditClick = (user: User) => {
    setEditingUser(user)
    setEditRole(user.role)
    setEditPermissions(user.permissions || {
      agentDetails: true,
      knowledgeDetails: true,
      databaseExplorer: true,
      databaseConfig: false,
    })
    setEditDialogOpen(true)
  }

  const handleSaveEdit = () => {
    if (editingUser) {
      const updatedUsers = users.map((u) =>
        u.id === editingUser.id
          ? { ...u, role: editRole, permissions: editPermissions }
          : u
      )
      saveUsers(updatedUsers)
      setUsers(updatedUsers)
      setEditDialogOpen(false)
      setEditingUser(null)
      toast.success(`User ${editingUser.username} updated successfully`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Admin Panel</h1>
        <p className="text-muted-foreground">
          Manage application users and their access.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2">Users</h2>
          <p className="text-sm text-muted-foreground mb-3">
            View and manage all application users
          </p>
        </div>

        <div className="overflow-x-auto">
            <table className="w-full">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold">Full Name</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Username</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Email</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Role</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Created At</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Last Login</th>
                <th className="px-6 py-4 text-left text-sm font-semibold">Permissions</th>
                <th className="px-6 py-4 text-center text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 text-sm">{user.fullName}</td>
                    <td className="px-6 py-4 text-sm font-mono">{user.username}</td>
                    <td className="px-6 py-4 text-sm">{user.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex px-3 py-1 rounded-full text-xs font-medium ${
                          user.role === 'admin'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300'
                            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                        }`}
                      >
                        {user.role === 'admin' ? 'Administrator' : 'User'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-muted-foreground">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 text-sm text-xs space-y-1">
                      {user.permissions && (
                        <div className="flex gap-1 flex-wrap">
                          {user.permissions.agentDetails && <span className="px-2 py-1 bg-green-100 text-green-800 rounded dark:bg-green-900/30 dark:text-green-300">Agent</span>}
                          {user.permissions.knowledgeDetails && <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded dark:bg-blue-900/30 dark:text-blue-300">Knowledge</span>}
                          {user.permissions.databaseExplorer && <span className="px-2 py-1 bg-cyan-100 text-cyan-800 rounded dark:bg-cyan-900/30 dark:text-cyan-300">Explorer</span>}
                          {user.permissions.databaseConfig && <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded dark:bg-yellow-900/30 dark:text-yellow-300">Config</span>}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center flex gap-2 justify-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(user)}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      {user.role !== 'admin' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(user)}
                          className="text-destructive hover:text-destructive/80"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">Protected</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
            </div>
      </div>

      <div className="p-4 rounded-lg border bg-muted/20">
        <p className="text-sm text-muted-foreground">
          <strong>Total Users:</strong> {users.length}
        </p>
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete User</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete user <strong>{userToDelete?.username}</strong>? This action cannot be undone.
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

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Modify user role and permissions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={editRole} onValueChange={(value) => setEditRole(value as 'user' | 'admin')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Administrator</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Page Permissions</label>
              <div className="space-y-2 p-3 border rounded-lg">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="agent"
                    checked={editPermissions.agentDetails}
                    onCheckedChange={(checked) =>
                      setEditPermissions({ ...editPermissions, agentDetails: !!checked })
                    }
                  />
                  <label htmlFor="agent" className="text-sm cursor-pointer">
                    Agent Details
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="knowledge"
                    checked={editPermissions.knowledgeDetails}
                    onCheckedChange={(checked) =>
                      setEditPermissions({ ...editPermissions, knowledgeDetails: !!checked })
                    }
                  />
                  <label htmlFor="knowledge" className="text-sm cursor-pointer">
                    Knowledge Details
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="explorer"
                    checked={editPermissions.databaseExplorer}
                    onCheckedChange={(checked) =>
                      setEditPermissions({ ...editPermissions, databaseExplorer: !!checked })
                    }
                  />
                  <label htmlFor="explorer" className="text-sm cursor-pointer">
                    Database Explorer
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="config"
                    checked={editPermissions.databaseConfig}
                    onCheckedChange={(checked) =>
                      setEditPermissions({ ...editPermissions, databaseConfig: !!checked })
                    }
                  />
                  <label htmlFor="config" className="text-sm cursor-pointer">
                    Database Config
                  </label>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
