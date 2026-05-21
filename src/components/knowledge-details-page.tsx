import { useMemo, useState, useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type KnowledgePdfsResponse = {
  pdf_files: string[]
}

type KnowledgeCollectionsResponse = {
  collections: string[]
  count: number
}

type KnowledgeSearchResult = {
  source: string
  chunk_id: number | null
  distance: number
  content: string
}

type KnowledgeSearchResponse = {
  results: KnowledgeSearchResult[]
  error?: string
}

async function getKnowledgePdfs() {
  const response = await fetch('/api/knowledge-pdfs')
  if (!response.ok) {
    throw new Error('Failed to load pdf files')
  }
  return (await response.json()) as KnowledgePdfsResponse
}

async function getKnowledgeCollections() {
  const response = await fetch('/api/knowledge-collections')
  if (!response.ok) {
    throw new Error('Failed to load collections')
  }
  return (await response.json()) as KnowledgeCollectionsResponse
}

async function searchKnowledge(collection: string, query: string) {
  const searchParams = new URLSearchParams({ collection, query })
  const response = await fetch(`/api/knowledge-search?${searchParams.toString()}`)
  const data = (await response.json()) as KnowledgeSearchResponse

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to search collection')
  }

  return data
}

async function createKnowledgeCollection(collectionName: string, pdfFile: string) {
  const response = await fetch('/api/knowledge-collections', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ collection_name: collectionName, pdf_file: pdfFile }),
  })

  const data = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to create collection')
  }
}

async function deleteKnowledgeCollection(collectionName: string) {
  const response = await fetch('/api/knowledge-collections/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ collection_name: collectionName }),
  })

  const data = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to delete collection')
  }
}

export function KnowledgeDetailsPage() {
  const queryClient = useQueryClient()
  const [selectedCollection, setSelectedCollection] = useState('')
  const [queryText, setQueryText] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [selectedPdf, setSelectedPdf] = useState('')

  // Load persisted state on mount
  useEffect(() => {
    const savedCollection = localStorage.getItem('knowledge-selected-collection')
    const savedQueryText = localStorage.getItem('knowledge-query-text')
    const savedSubmittedQuery = localStorage.getItem('knowledge-submitted-query')

    if (savedCollection) {
      setSelectedCollection(savedCollection)
    }
    if (savedQueryText) {
      setQueryText(savedQueryText)
    }
    if (savedSubmittedQuery) {
      setSubmittedQuery(savedSubmittedQuery)
    }
  }, [])

  // Persist selected collection to localStorage
  useEffect(() => {
    localStorage.setItem('knowledge-selected-collection', selectedCollection)
  }, [selectedCollection])

  // Persist query text to localStorage
  useEffect(() => {
    localStorage.setItem('knowledge-query-text', queryText)
  }, [queryText])

  // Persist submitted query to localStorage
  useEffect(() => {
    localStorage.setItem('knowledge-submitted-query', submittedQuery)
  }, [submittedQuery])

  const collectionsQuery = useQuery({
    queryKey: ['knowledge-collections'],
    queryFn: getKnowledgeCollections,
  })

  const pdfsQuery = useQuery({
    queryKey: ['knowledge-pdfs'],
    queryFn: getKnowledgePdfs,
  })

  const searchQuery = useQuery({
    queryKey: ['knowledge-search', selectedCollection, submittedQuery],
    queryFn: () => searchKnowledge(selectedCollection, submittedQuery),
    enabled: Boolean(selectedCollection && submittedQuery),
  })

  const createCollectionMutation = useMutation({
    mutationFn: ({ collectionName, pdfFile }: { collectionName: string; pdfFile: string }) =>
      createKnowledgeCollection(collectionName, pdfFile),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['knowledge-collections'] })
      setCreateDialogOpen(false)
      setSelectedCollection(newCollectionName.trim())
      setNewCollectionName('')
      setSelectedPdf('')
    },
  })

  const deleteCollectionMutation = useMutation({
    mutationFn: (collectionName: string) => deleteKnowledgeCollection(collectionName),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['knowledge-collections'] })
      setDeleteDialogOpen(false)
      if (selectedCollection) {
        setSelectedCollection('')
        setSubmittedQuery('')
      }
    },
  })

  const collections = collectionsQuery.data?.collections ?? []
  const pdfFiles = pdfsQuery.data?.pdf_files ?? []

  const handleSearch = () => {
    if (!selectedCollection || !queryText.trim()) {
      return
    }
    setSubmittedQuery(queryText.trim())
  }

  const handleCreateCollection = () => {
    if (!newCollectionName.trim() || !selectedPdf) {
      return
    }

    createCollectionMutation.mutate({
      collectionName: newCollectionName.trim(),
      pdfFile: selectedPdf,
    })
  }

  const handleDeleteCollection = () => {
    if (!selectedCollection) {
      return
    }

    deleteCollectionMutation.mutate(selectedCollection)
  }

  const handleClearHistory = () => {
    localStorage.removeItem('knowledge-selected-collection')
    localStorage.removeItem('knowledge-query-text')
    localStorage.removeItem('knowledge-submitted-query')
    setSelectedCollection('')
    setQueryText('')
    setSubmittedQuery('')
    toast.success('Knowledge search history cleared')
  }

  const selectedCollectionStats = useMemo(() => {
    return {
      hasCollections: collections.length > 0,
      count: collectionsQuery.data?.count ?? 0,
    }
  }, [collections, collectionsQuery.data])

  return (
    <div className="space-y-6">
      <div className="space-y-2 flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">Knowledge Details</h1>
          <p className="text-sm text-muted-foreground">
            This page exposes the main knowledge functionality through the UI: collection discovery and semantic search.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleClearHistory}
          className="mt-1"
        >
          Clear History
        </Button>
      </div>

      <div className="grid gap-4">
        <section className="grid gap-4 md:grid-cols-[280px_minmax(0,1fr)]">
        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Collections</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Total collections: {collectionsQuery.isLoading ? 'Loading...' : selectedCollectionStats.count}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="outline" className="w-full" onClick={() => setCreateDialogOpen(true)}>
              Add collection
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setDeleteDialogOpen(true)}
              disabled={!selectedCollection}
            >
              Delete collection
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            {collectionsQuery.isLoading && <div className="text-sm text-muted-foreground">Loading collections...</div>}

            {collectionsQuery.isError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                Failed to load collections.
              </div>
            )}

            {!collectionsQuery.isLoading && !collectionsQuery.isError && !selectedCollectionStats.hasCollections && (
              <div className="text-sm text-muted-foreground">No collections found.</div>
            )}

            {collections.map((collection) => {
              const isActive = selectedCollection === collection
              return (
                <button
                  key={collection}
                  type="button"
                  onClick={() => setSelectedCollection(collection)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                    isActive
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background hover:bg-muted/60'
                  }`}
                >
                  {collection}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-2xl border bg-card p-5 shadow-sm">
          <h2 className="text-lg font-semibold tracking-tight">Search Collection</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Select a collection, enter search text, and review the matching knowledge chunks.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Input
              value={selectedCollection}
              readOnly
              placeholder="Select a collection from the list"
              className="sm:max-w-xs"
            />
            <Input
              value={queryText}
              onChange={(event) => setQueryText(event.target.value)}
              placeholder="Search text"
            />
            <Button onClick={handleSearch} disabled={!selectedCollection || !queryText.trim() || searchQuery.isFetching}>
              Search
            </Button>
          </div>

          <div className="mt-6 space-y-3">
            {searchQuery.isFetching && <div className="text-sm text-muted-foreground">Searching collection...</div>}

            {searchQuery.isError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                Failed to search the selected collection.
              </div>
            )}

            {!searchQuery.isFetching && submittedQuery && searchQuery.data?.results.length === 0 && (
              <div className="text-sm text-muted-foreground">No matching results found.</div>
            )}

            {searchQuery.data?.results.map((result, index) => (
              <article key={`${result.source}-${result.chunk_id ?? index}`} className="rounded-xl border bg-muted/40 p-4">
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>Source: {result.source}</span>
                  <span>Chunk: {result.chunk_id ?? 'N/A'}</span>
                  <span>Similarity: {result.distance.toFixed(3)}</span>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{result.content}</p>
              </article>
            ))}
          </div>
        </div>
        </section>
      </div>

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Collection</DialogTitle>
            <DialogDescription>
              Choose a PDF file and provide a collection name to load it into the knowledge base.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Collection name</label>
              <Input value={newCollectionName} onChange={(event) => setNewCollectionName(event.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">PDF file</label>
              <Select value={selectedPdf} onValueChange={setSelectedPdf}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={pdfsQuery.isLoading ? 'Loading PDF files...' : 'Select PDF file'} />
                </SelectTrigger>
                <SelectContent>
                  {pdfFiles.map((pdfFile) => (
                    <SelectItem key={pdfFile} value={pdfFile}>
                      {pdfFile}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {createCollectionMutation.isError && (
              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                Failed to create the collection.
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateCollection}
              disabled={!newCollectionName.trim() || !selectedPdf || createCollectionMutation.isPending}
            >
              Create collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Collection</DialogTitle>
            <DialogDescription>
              Delete the selected collection: {selectedCollection || 'No collection selected'}.
            </DialogDescription>
          </DialogHeader>

          {deleteCollectionMutation.isError && (
            <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              Failed to delete the collection.
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteCollection} disabled={!selectedCollection || deleteCollectionMutation.isPending}>
              Delete collection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}