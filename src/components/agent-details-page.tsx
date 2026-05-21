import { useQuery, useMutation } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { RefreshCw, Save } from 'lucide-react'

type AgentDetailsResponse = {
  db_schema_memory: string
  business_rules: string
  app_context: string
  migration_plan: string
  migration_rules: string
}

async function getAgentDetails() {
  const response = await fetch('/api/agent-details')
  if (!response.ok) {
    throw new Error('Failed to load agent details')
  }
  return (await response.json()) as AgentDetailsResponse
}

async function saveAgentDetails(data: Partial<AgentDetailsResponse>) {
  const response = await fetch('/api/agent-details-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to save agent details')
  }

  return response.json()
}

function EditableDetailsSection({
  title,
  content,
  onSave,
  isSaving,
}: {
  title: string
  content: string
  onSave: (newContent: string) => Promise<void>
  isSaving: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedContent, setEditedContent] =
    useState(content)

  useEffect(() => {
    setEditedContent(content)
  }, [content])

  const handleSave = async () => {
    try {
      await onSave(editedContent)
      setIsEditing(false)
      toast.success(`${title} saved successfully`)
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to save'
      toast.error(errorMsg)
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(false)
                  setEditedContent(content)
                }}
                disabled={isSaving}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-3 w-3" />
                    Save
                  </>
                )}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              Edit
            </Button>
          )}
        </div>
      </div>

      {isEditing ? (
        <textarea
          value={editedContent}
          onChange={(e) =>
            setEditedContent(e.target.value)
          }
          className="w-full min-h-[300px] p-3 border rounded-lg font-mono text-sm bg-background text-foreground resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Enter content..."
        />
      ) : (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-xl bg-muted/60 p-4 text-sm leading-6 text-foreground max-h-[400px] overflow-auto">
          {editedContent || 'No content available.'}
        </pre>
      )}
    </section>
  )
}

export function AgentDetailsPage() {
  const detailsQuery = useQuery({
    queryKey: ['agent-details'],
    queryFn: getAgentDetails,
    refetchOnMount: 'always',
  })

  const saveMutation = useMutation({
    mutationFn: saveAgentDetails,
    onSuccess: () => {
      detailsQuery.refetch()
    },
  })

  const handleSaveSection = async (
    field: keyof AgentDetailsResponse,
    content: string,
  ) => {
    await saveMutation.mutateAsync({
      [field]: content,
    })
  }

  if (detailsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Agent Details
        </h1>
        <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
          Loading agent details...
        </div>
      </div>
    )
  }

  if (detailsQuery.isError || !detailsQuery.data) {
    return (
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          Agent Details
        </h1>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/10 p-5 text-sm text-destructive">
          Failed to load agent details.
        </div>
      </div>
    )
  }

  const details = detailsQuery.data

  return (
    <div className="space-y-6">
      <div className="space-y-2 flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Agent Details
          </h1>
          <p className="text-sm text-muted-foreground">
            Manage database schema memory, business
            rules, app context, migration plan, and
            migration rules. All changes are
            editable and saved to the agent context.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            detailsQuery.refetch()
          }
          disabled={
            detailsQuery.isRefetching
          }
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4">
        <EditableDetailsSection
          title="DB Schema Memory"
          content={details.db_schema_memory}
          onSave={(content) =>
            handleSaveSection(
              'db_schema_memory',
              content,
            )
          }
          isSaving={saveMutation.isPending}
        />
        <EditableDetailsSection
          title="Business Rules"
          content={details.business_rules}
          onSave={(content) =>
            handleSaveSection(
              'business_rules',
              content,
            )
          }
          isSaving={saveMutation.isPending}
        />
        <EditableDetailsSection
          title="App Context"
          content={details.app_context}
          onSave={(content) =>
            handleSaveSection(
              'app_context',
              content,
            )
          }
          isSaving={saveMutation.isPending}
        />
        <EditableDetailsSection
          title="Migration Plan"
          content={details.migration_plan}
          onSave={(content) =>
            handleSaveSection(
              'migration_plan',
              content,
            )
          }
          isSaving={saveMutation.isPending}
        />
        <EditableDetailsSection
          title="Migration Rules"
          content={details.migration_rules}
          onSave={(content) =>
            handleSaveSection(
              'migration_rules',
              content,
            )
          }
          isSaving={saveMutation.isPending}
        />
      </div>
    </div>
  )
}