import { useEffect, useState } from 'react'
import { Trash2, AlertCircle, CheckCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { getErrors, clearErrors, updateErrorStatus, deleteError, type AppError } from '@/lib/error-logger'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

export function ErrorLogsPage() {
  const [errors, setErrors] = useState<AppError[]>([])
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [errorToDelete, setErrorToDelete] = useState<AppError | null>(null)

  useEffect(() => {
    loadErrors()
    
    // Listen for real-time error logging
    const handleErrorLogged = () => {
      loadErrors()
    }
    
    window.addEventListener('error-logged', handleErrorLogged)
    const interval = setInterval(loadErrors, 1000)
    
    return () => {
      window.removeEventListener('error-logged', handleErrorLogged)
      clearInterval(interval)
    }
  }, [])

  const loadErrors = () => {
    const loadedErrors = getErrors()
    console.log('Loaded errors:', loadedErrors)
    setErrors(loadedErrors)
  }

  const handleClearAll = () => {
    clearErrors()
    setErrors([])
    toast.success('All errors cleared')
  }

  const handleDeleteClick = (error: AppError) => {
    setErrorToDelete(error)
    setDeleteDialogOpen(true)
  }

  const handleConfirmDelete = () => {
    if (errorToDelete) {
      deleteError(errorToDelete.id)
      setErrors(getErrors())
      setDeleteDialogOpen(false)
      setErrorToDelete(null)
      toast.success('Error removed')
    }
  }

  const handleResolve = (error: AppError) => {
    updateErrorStatus(error.id, error.status === 'pending' ? 'resolved' : 'pending')
    setErrors(getErrors())
    toast.success(`Error marked as ${error.status === 'pending' ? 'resolved' : 'pending'}`)
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error':
        return 'bg-red-100 text-red-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'info':
        return 'bg-blue-100 text-blue-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusBg = (status: string) => {
    return status === 'resolved' ? 'bg-green-50' : 'bg-slate-50'
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Error Logs</h1>
            <span className="ml-2 text-sm text-gray-500">({errors.length})</span>
          </div>
          {errors.length > 0 && (
            <Button variant="outline" onClick={handleClearAll}>
              Clear All
            </Button>
          )}
        </div>

        {errors.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-500">
            <p>No errors logged</p>
          </div>
        ) : (
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-100 border-b">
                  <th className="px-6 py-3 text-left text-sm font-semibold">Time</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Error</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Severity</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Source</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((error) => (
                  <tr key={error.id} className={`border-b ${getStatusBg(error.status)}`}>
                    <td className="px-6 py-4 text-sm whitespace-nowrap">{error.timestamp}</td>
                    <td className="px-6 py-4 text-sm max-w-lg break-words whitespace-normal">{error.error}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSeverityColor(error.severity)}`}>
                        {error.severity.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${error.status === 'resolved' ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'}`}>
                        {error.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{error.source || '—'}</td>
                    <td className="px-6 py-4 text-sm flex gap-2">
                      <Button variant="ghost" size="sm" onClick={() => handleResolve(error)} title="Toggle status">
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDeleteClick(error)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Error</DialogTitle>
            <DialogDescription>Are you sure you want to remove this error log entry?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
