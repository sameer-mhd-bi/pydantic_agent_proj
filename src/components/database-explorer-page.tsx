import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import mermaid from 'mermaid'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Download,
  Expand,
  Loader,
  Shrink,
} from 'lucide-react'
import { useAuth } from './user-provider'
import { MigrationPlanViewer } from '@/components/migration-plan-viewer'
import { ColumnMappingViewer } from '@/components/column-mapping-viewer'
import { logError } from '@/lib/error-logger'
import { recordSuccessfulTableMigration, incrementMigrations, syncToFile } from '@/lib/migration-stats'

interface DatabaseInfo {
  name: string
}

interface TableSchema {
  table_name: string
  row_count: number
  columns: Array<{
    column_name: string
    data_type: string
    is_nullable: boolean
    column_default: string | null
  }>
  primary_key: string[]
  foreign_keys: Array<{
    column_name: string
    referenced_table: string
    referenced_column: string
  }>
}

interface FetchSchemasResponse {
  tables: TableSchema[]
}

async function getDatabases(
  connectionString: string,
): Promise<DatabaseInfo[]> {
  const response = await fetch('/api/databases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection_string: connectionString,
    }),
  })

  if (!response.ok) {
    const error = await response.json()

    throw new Error(
      error.detail || 'Failed to fetch databases',
    )
  }

  return response.json()
}

async function getTableSchemas(
  connectionString: string,
  database: string,
): Promise<TableSchema[]> {
  const response = await fetch('/api/table-schemas', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      connection_string: connectionString,
      database: database,
    }),
  })

  if (!response.ok) {
    const error = await response.json()

    throw new Error(
      error.detail || 'Failed to fetch table schemas',
    )
  }

  const data: FetchSchemasResponse =
    await response.json()

  return data.tables
}

async function generateErDiagram(
  database: string,
  tables: TableSchema[],
  connectionString: string,
): Promise<{ mermaid: string }> {
  const response = await fetch('/api/er-diagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      database: database,
      connection_string: connectionString,
      tables: tables,
    }),
  })

  if (!response.ok) {
    const error = await response.json()

    throw new Error(
      error.detail || 'Failed to generate ER diagram',
    )
  }

  return response.json()
}

async function generateMigrationPlan(
  database: string,
  tables: TableSchema[],
  connectionString: string,
): Promise<{ migration_plan: string }> {
  const response = await fetch(
    '/api/migration-plan',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        database: database,
        connection_string: connectionString,
        tables: tables,
      }),
    },
  )

  if (!response.ok) {
    const error = await response.json()

    throw new Error(
      error.detail ||
        'Failed to generate migration plan',
    )
  }

  return response.json()
}

async function syncSchemaMemoryToAgent(
  database: string,
  tables: TableSchema[],
  connectionString: string,
): Promise<void> {
  // Format the selected tables into schema memory
  const schemaMemory = formatSchemasForMemory(
    database,
    tables,
  )

  const response = await fetch('/api/agent-details-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      db_schema_memory: schemaMemory,
      connection_string: connectionString,
      database_name: database,
    }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(
      error.detail || 'Failed to sync schema memory',
    )
  }
}

function formatSchemasForMemory(
  database: string,
  tables: TableSchema[],
): string {
  const lines: string[] = [
    `DATABASE_SCHEMA (${database}):`,
    '',
  ]

  if (tables.length === 0) {
    lines.push('No tables are currently selected.')
    return lines.join('\n').trim()
  }

  for (const table of tables) {
    lines.push(`Table: ${table.table_name}`)
    lines.push(`  Rows: ${table.row_count?.toLocaleString() || 0}`)
    lines.push(`  Columns: ${table.columns.length}`)

    // Columns
    lines.push('  Fields:')
    for (const col of table.columns) {
      const nullable = col.is_nullable
        ? 'NULL'
        : 'NOT NULL'
      lines.push(
        `    - ${col.column_name}: ${col.data_type} (${nullable})`,
      )
    }

    // Primary Keys
    if (table.primary_key.length > 0) {
      lines.push(
        `  Primary Key: ${table.primary_key.join(', ')}`,
      )
    }

    // Foreign Keys
    if (table.foreign_keys.length > 0) {
      lines.push('  Foreign Keys:')
      for (const fk of table.foreign_keys) {
        lines.push(
          `    - ${fk.column_name} -> ${fk.referenced_table}.${fk.referenced_column}`,
        )
      }
    }

    lines.push('')
  }

  return lines.join('\n').trim()
}

function ColumnRow({
  column,
}: {
  column: TableSchema['columns'][0]
}) {
  return (
    <tr className="border-b hover:bg-muted/50">
      <td className="px-4 py-2 font-mono text-sm">
        {column.column_name}
      </td>

      <td className="px-4 py-2 font-mono text-sm text-blue-600 dark:text-blue-400">
        {column.data_type}
      </td>

      <td className="px-4 py-2 text-sm">
        <span
          className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            column.is_nullable
              ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
              : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
          }`}
        >
          {column.is_nullable
            ? 'NULL'
            : 'NOT NULL'}
        </span>
      </td>

      <td className="px-4 py-2 font-mono text-sm text-muted-foreground">
        {column.column_default || '-'}
      </td>
    </tr>
  )
}
export function DatabaseExplorerPage() {
  const { currentUser } = useAuth()
  
  // Helper function to create user-specific storage keys
  const getStorageKey = (key: string) => `${currentUser?.id || 'guest'}-${key}`
  
  // Helper function to create database-specific storage keys
  const getDatabaseStorageKey = (key: string, database: string) => 
    database ? `${getStorageKey(key)}-db-${database}` : getStorageKey(key)

  const [connectionString, setConnectionString] =
    useState('')

  const [selectedDatabase, setSelectedDatabase] =
    useState<string>('')

  const [isLoadingConnection, setIsLoadingConnection] =
    useState(true)

  const [mermaidCode, setMermaidCode] =
    useState<string>('')

  const [mermaidSvg, setMermaidSvg] =
    useState<string>('')

  const [
    isDiagramFullscreen,
    setIsDiagramFullscreen,
  ] = useState(false)

  const [migrationPlan, setMigrationPlan] =
    useState<string>('')

  const [
    migrationPlanEditable,
    setMigrationPlanEditable,
  ] = useState<string>('')

  const [
    isSavingMigrationPlan,
    setIsSavingMigrationPlan,
  ] = useState(false)

  const [selectedTables, setSelectedTables] =
    useState<string[]>([])

  const [expandAllTables, setExpandAllTables] =
    useState(false)

  const [expandedTables, setExpandedTables] =
    useState<string[]>([])

  const [columnMappings, setColumnMappings] =
    useState<any[]>([])

  const [isLoadingMappings, setIsLoadingMappings] =
    useState(false)

  const [isStateRestored, setIsStateRestored] =
    useState(false)

  const [hasAutoSelectedTables, setHasAutoSelectedTables] =
    useState(false)

  const [expandAllColumns, setExpandAllColumns] =
    useState(false)

  const [isMigrating, setIsMigrating] =
    useState(false)

  const diagramContainerRef =
    useRef<HTMLDivElement | null>(null)

  // Load connection from database config
  useEffect(() => {
    const loadConnection = async () => {
      try {
        const response = await fetch('/api/database-config')
        if (response.ok) {
          const config = await response.json()
          const pgConfig = config.postgresql
          const connStr = `postgresql://${pgConfig.user}:${pgConfig.password}@${pgConfig.host}:${pgConfig.port}/${pgConfig.dbname}`
          setConnectionString(connStr)
        }
      } catch (error) {
        console.error('Failed to load database config:', error)
      } finally {
        setIsLoadingConnection(false)
      }
    }
    
    loadConnection()
  }, [])

  // Restore persisted state early on mount before queries run
  useEffect(() => {
    if (!currentUser?.id) return

    const savedDatabase = localStorage.getItem(
      getStorageKey('db-explorer-database'),
    )
    
    if (savedDatabase) {
      setSelectedDatabase(savedDatabase)

      const savedSelectedTables = localStorage.getItem(
        getDatabaseStorageKey('db-explorer-selected-tables', savedDatabase),
      )
      if (savedSelectedTables) {
        try {
          setSelectedTables(JSON.parse(savedSelectedTables))
        } catch {
          setSelectedTables([])
        }
      }

      const savedExpandedTables = localStorage.getItem(
        getDatabaseStorageKey('db-explorer-expanded-tables', savedDatabase),
      )
      if (savedExpandedTables) {
        try {
          setExpandedTables(JSON.parse(savedExpandedTables))
        } catch {
          setExpandedTables([])
        }
      }
    }

    const savedMermaid = localStorage.getItem(
      getStorageKey('db-explorer-mermaid'),
    )
    if (savedMermaid) {
      setMermaidCode(savedMermaid)
    }

    const savedMigrationPlan = localStorage.getItem(
      getStorageKey('db-explorer-migration-plan'),
    )
    if (savedMigrationPlan) {
      setMigrationPlan(savedMigrationPlan)
      setMigrationPlanEditable(savedMigrationPlan)
    }

    const savedColumnMappings = savedDatabase ? localStorage.getItem(
      getDatabaseStorageKey('db-explorer-column-mappings', savedDatabase),
    ) : null
    if (savedColumnMappings) {
      try {
        setColumnMappings(JSON.parse(savedColumnMappings))
      } catch {
        setColumnMappings([])
      }
    }

    const savedHasAutoSelected = localStorage.getItem(
      getStorageKey('db-explorer-has-auto-selected'),
    )
    if (savedHasAutoSelected === 'true') {
      setHasAutoSelectedTables(true)
    }

    const savedExpandAllTables = localStorage.getItem(
      getStorageKey('db-explorer-expand-all-tables'),
    )
    if (savedExpandAllTables === 'true') {
      setExpandAllTables(true)
    }

    setIsStateRestored(true)
  }, [currentUser?.id])

  // Restore database-specific selections when database changes (manual user change only)
  useEffect(() => {
    if (!currentUser?.id || !selectedDatabase || !isStateRestored) return

    const savedSelectedTables = localStorage.getItem(
      getDatabaseStorageKey('db-explorer-selected-tables', selectedDatabase),
    )

    const savedExpandedTables = localStorage.getItem(
      getDatabaseStorageKey('db-explorer-expanded-tables', selectedDatabase),
    )

    if (savedSelectedTables) {
      try {
        setSelectedTables(JSON.parse(savedSelectedTables))
      } catch {
        setSelectedTables([])
      }
    } else {
      setSelectedTables([])
    }

    if (savedExpandedTables) {
      try {
        setExpandedTables(JSON.parse(savedExpandedTables))
      } catch {
        setExpandedTables([])
      }
    } else {
      setExpandedTables([])
    }

    setHasAutoSelectedTables(false)
  }, [currentUser?.id, selectedDatabase, isStateRestored])

  useEffect(() => {
    if (!currentUser?.id) return
    localStorage.setItem(
      getStorageKey('db-explorer-database'),
      selectedDatabase,
    )
  }, [selectedDatabase, currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return
    if (mermaidCode) {
      localStorage.setItem(
        getStorageKey('db-explorer-mermaid'),
        mermaidCode,
      )
    }
  }, [mermaidCode, currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return
    if (migrationPlan) {
      localStorage.setItem(
        getStorageKey('db-explorer-migration-plan'),
        migrationPlan,
      )
    }
  }, [migrationPlan, currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id || !selectedDatabase) return
    localStorage.setItem(
      getDatabaseStorageKey('db-explorer-selected-tables', selectedDatabase),
      JSON.stringify(selectedTables),
    )
  }, [selectedTables, currentUser?.id, selectedDatabase])

  useEffect(() => {
    if (!currentUser?.id || !selectedDatabase) return
    localStorage.setItem(
      getDatabaseStorageKey('db-explorer-expanded-tables', selectedDatabase),
      JSON.stringify(expandedTables),
    )
  }, [expandedTables, currentUser?.id, selectedDatabase])

  useEffect(() => {
    if (!currentUser?.id || !selectedDatabase) return
    localStorage.setItem(
      getDatabaseStorageKey('db-explorer-column-mappings', selectedDatabase),
      JSON.stringify(columnMappings),
    )
  }, [columnMappings, currentUser?.id, selectedDatabase])

  useEffect(() => {
    if (!currentUser?.id) return
    localStorage.setItem(
      getStorageKey('db-explorer-has-auto-selected'),
      String(hasAutoSelectedTables),
    )
  }, [hasAutoSelectedTables, currentUser?.id])

  useEffect(() => {
    if (!currentUser?.id) return
    localStorage.setItem(
      getStorageKey('db-explorer-expand-all-tables'),
      String(expandAllTables),
    )
  }, [expandAllTables, currentUser?.id])

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
    })
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsDiagramFullscreen(
        document.fullscreenElement ===
          diagramContainerRef.current,
      )
    }

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange,
    )

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange,
      )
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    const renderMermaid = async () => {
      if (!mermaidCode) {
        setMermaidSvg('')
        return
      }

      try {
        const diagramId = `er-diagram-${Date.now()}`

        const { svg } = await mermaid.render(
          diagramId,
          mermaidCode,
        )

        if (isMounted) {
          setMermaidSvg(svg)
        }
      } catch (error) {
        console.error(
          'Failed to render Mermaid diagram',
          error,
        )

        if (isMounted) {
          setMermaidSvg('')
          logError('Failed to render ER diagram', 'error', 'DatabaseExplorer')
          toast.error(
            'Failed to render ER diagram',
          )
        }
      }
    }

    renderMermaid()

    return () => {
      isMounted = false
    }
  }, [mermaidCode])

  const databasesQuery = useQuery({
    queryKey: ['databases', connectionString],

    queryFn: () =>
      getDatabases(connectionString),

    enabled:
      connectionString.length > 0 &&
      !isLoadingConnection,

    retry: 1,
  })

  useEffect(() => {
    if (databasesQuery.isError) {
      const errorMsg = databasesQuery.error instanceof Error ? databasesQuery.error.message : 'Failed to connect to the database'
      logError(errorMsg, 'error', 'Database Connection')
    }
  }, [databasesQuery.isError, databasesQuery.error])

  const schemasQuery = useQuery({
    queryKey: [
      'table-schemas',
      connectionString,
      selectedDatabase,
    ],

    queryFn: () =>
      getTableSchemas(
        connectionString,
        selectedDatabase,
      ),

    enabled:
      connectionString.length > 0 &&
      selectedDatabase.length > 0,

    retry: 1,
  })

  // Auto select all tables only on first load when no saved selection exists
  useEffect(() => {
    if (
      schemasQuery.data &&
      isStateRestored &&
      !hasAutoSelectedTables &&
      selectedDatabase
    ) {
      // Check if there's saved selection in localStorage for this database
      const savedSelectedTables = localStorage.getItem(
        getDatabaseStorageKey('db-explorer-selected-tables', selectedDatabase),
      )
      
      // Only auto-select if no saved selection exists AND we haven't auto-selected before
      if (!savedSelectedTables || savedSelectedTables === '[]') {
        setSelectedTables(
          schemasQuery.data.map(
            (table) => table.table_name,
          ),
        )
      }
      
      // Mark that we've attempted auto-selection for this session
      setHasAutoSelectedTables(true)
    }
  }, [schemasQuery.data, isStateRestored, selectedDatabase, hasAutoSelectedTables])

  // Sync selected tables to agent schema memory
  useEffect(() => {
    if (
      schemasQuery.data &&
      selectedDatabase
    ) {
      const filteredTables =
        schemasQuery.data.filter((table) =>
          selectedTables.includes(
            table.table_name,
          ),
        )

      syncSchemaMemoryToAgent(
        selectedDatabase,
        filteredTables,
        connectionString,
      ).catch((error) => {
        console.error(
          'Failed to sync schema memory:',
          error,
        )
      })
    }
  }, [
    schemasQuery.data,
    selectedTables,
    selectedDatabase,
  ])

  // Expand/collapse all logic
  useEffect(() => {
    if (
      schemasQuery.data &&
      expandAllTables
    ) {
      setExpandedTables(
        schemasQuery.data.map(
          (table) => table.table_name,
        ),
      )
    }

    if (!expandAllTables) {
      setExpandedTables([])
    }
  }, [expandAllTables, schemasQuery.data])

  const toggleTableSelection = (
    tableName: string,
  ) => {
    setSelectedTables((prev) => {
      const updated = prev.includes(tableName)
        ? prev.filter(
            (name) => name !== tableName,
          )
        : [...prev, tableName]
      setColumnMappings([])
      return updated
    })
  }

  const toggleTableExpand = (
    tableName: string,
  ) => {
    setExpandedTables((prev) =>
      prev.includes(tableName)
        ? prev.filter(
            (name) => name !== tableName,
          )
        : [...prev, tableName],
    )
  }

  const erDiagramMutation = useMutation({
    mutationFn: () => {
      if (!schemasQuery.data) {
        return Promise.reject(
          new Error(
            'Table schemas are not available',
          ),
        )
      }

      const filteredTables =
        schemasQuery.data.filter((table) =>
          selectedTables.includes(
            table.table_name,
          ),
        )

      return generateErDiagram(
        selectedDatabase,
        filteredTables,
        connectionString,
      )
    },

    onSuccess: (data) => {
      setMermaidCode(data.mermaid)

      toast.success(
        'ER diagram generated successfully',
      )
    },

    onError: (error) => {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to generate ER diagram'

      logError(errorMsg, 'error', 'ER Diagram Generation')
      toast.error(errorMsg)
    },
  })

  const migrationPlanMutation = useMutation({
    mutationFn: () => {
      if (!schemasQuery.data) {
        return Promise.reject(
          new Error(
            'Table schemas are not available',
          ),
        )
      }

      const filteredTables =
        schemasQuery.data.filter((table) =>
          selectedTables.includes(
            table.table_name,
          ),
        )

      return generateMigrationPlan(
        selectedDatabase,
        filteredTables,
        connectionString,
      )
    },

    onSuccess: (data) => {
      setMigrationPlan(data.migration_plan)
      setMigrationPlanEditable(
        data.migration_plan,
      )

      localStorage.setItem(
        getStorageKey('db-explorer-migration-plan'),
        data.migration_plan,
      )

      toast.success(
        'Migration plan generated successfully',
      )
    },

    onError: (error) => {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to generate migration plan'

      logError(errorMsg, 'error', 'Migration Plan')
      toast.error(errorMsg)
    },
  })

  const handleClearHistory = () => {
    localStorage.removeItem(
      getStorageKey('db-explorer-database'),
    )

    localStorage.removeItem(
      getStorageKey('db-explorer-mermaid'),
    )

    localStorage.removeItem(
      getStorageKey('db-explorer-migration-plan'),
    )

    localStorage.removeItem(
      getStorageKey('db-explorer-has-auto-selected'),
    )

    // Clear database-specific selections for all databases
    const keys = Object.keys(localStorage)
    keys.forEach(key => {
      if (key.includes(`${currentUser?.id}-db-explorer-selected-tables-db-`) ||
          key.includes(`${currentUser?.id}-db-explorer-expanded-tables-db-`)) {
        localStorage.removeItem(key)
      }
    })

    setSelectedDatabase('')
    setSelectedTables([])
    setExpandedTables([])
    setMermaidCode('')
    setMermaidSvg('')
    setMigrationPlan('')
    setMigrationPlanEditable('')
    setHasAutoSelectedTables(false)

    toast.success('Explorer history cleared')
  }

  const handleSaveMigrationPlan = async () => {
    setIsSavingMigrationPlan(true)
    try {
      const response = await fetch(
        '/api/migration-plan-save',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            migration_plan:
              migrationPlanEditable,
          }),
        },
      )

      if (!response.ok) {
        const error = await response.json()

        throw new Error(
          error.detail ||
            'Failed to save migration plan',
        )
      }

      setMigrationPlan(migrationPlanEditable)

      localStorage.setItem(
        getStorageKey('db-explorer-migration-plan'),
        migrationPlanEditable,
      )

      toast.success(
        'Migration plan saved',
      )
    } catch (error) {
      const errorMsg =
        error instanceof Error
          ? error.message
          : 'Failed to save migration plan'

      logError(errorMsg, 'error', 'Save Migration Plan')
      toast.error(errorMsg)
    } finally {
      setIsSavingMigrationPlan(false)
    }
  }

  const handleGetColumnMappings =
    async () => {
      if (
        !connectionString ||
        !selectedDatabase ||
        selectedTables.length === 0
      ) {
        toast.error(
          'Please select tables first',
        )
        return
      }

      setIsLoadingMappings(true)
      try {
        const response = await fetch(
          '/api/column-mappings',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              connection_string:
                connectionString,
              database: selectedDatabase,
              tables: schemasQuery.data?.filter(
                (t) =>
                  selectedTables.includes(
                    t.table_name,
                  ),
              ),
            }),
          },
        )

        if (!response.ok) {
          throw new Error(
            'Failed to get column mappings',
          )
        }

        const data = await response.json()
        setColumnMappings(
          data.tables.map((t: any) => ({
            ...t,
            selected_columns: [],
          })),
        )
        toast.success(
          'Column mappings generated',
        )
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Failed to get column mappings'
        logError(errorMsg, 'error', 'Column Mappings')
        toast.error(errorMsg)
      } finally {
        setIsLoadingMappings(false)
      }
    }

  const handleSelectColumn = (
    table: string,
    column: string,
    selected: boolean,
  ) => {
    setColumnMappings((prev) =>
      prev.map((t) =>
        t.table_name === table
          ? {
              ...t,
              selected_columns: selected
                ? [
                    ...t.selected_columns,
                    column,
                  ]
                : t.selected_columns.filter(
                    (c: string) =>
                      c !== column,
                  ),
            }
          : t,
      ),
    )
  }

  const handleDatatypeChange = (
    table: string,
    column: string,
    datatype: string,
  ) => {
    setColumnMappings((prev) =>
      prev.map((t) =>
        t.table_name === table
          ? {
              ...t,
              columns: t.columns.map(
                (c: any) =>
                  c.source_column === column
                    ? {
                        ...c,
                        target_datatype:
                          datatype,
                      }
                    : c,
              ),
            }
          : t,
      ),
    )
  }

  const handleTargetColumnChange = (
    table: string,
    column: string,
    targetColumn: string,
  ) => {
    setColumnMappings((prev) =>
      prev.map((t) =>
        t.table_name === table
          ? {
              ...t,
              columns: t.columns.map(
                (c: any) =>
                  c.source_column === column
                    ? {
                        ...c,
                        target_column:
                          targetColumn,
                      }
                    : c,
              ),
            }
          : t,
      ),
    )
  }

  const handleMigrateData =
    async (
      tables: any,
    ) => {
      setIsMigrating(true)
      try {
        const response = await fetch(
          '/api/migrate-columns',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              connection_string:
                connectionString,
              database: selectedDatabase,
              tables: tables,
            }),
          },
        )

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(
            errorData.detail || errorData.error || 'Migration failed',
          )
        }

        const data = await response.json()

        const summary = data.summary || {}
        const results = Array.isArray(data.results) ? data.results : []

        // Record successful table migrations only
        const successfulTables = results.filter((r: any) => r && r.status === 'SUCCESS') || []
        if (successfulTables && successfulTables.length > 0) {
          try {
            successfulTables.forEach((r: any) => {
              const tableName = r?.table_name || r?.table || 'Unknown'
              const rowsMigrated = r?.rows_migrated || 0
              const columnsCount = r?.columns_count || 
                tables?.find?.((t: any) => t?.table_name === tableName)?.columns?.length || 0
              
              recordSuccessfulTableMigration(
                tableName,
                selectedDatabase,
                selectedDatabase,
                rowsMigrated,
                columnsCount,
              )
            })
            // Increment migration stats only when tables are successfully created
            incrementMigrations(
              successfulTables.length,
              currentUser?.id,
              currentUser?.username,
              successfulTables.map((r: any) => ({
                tableName: r?.table_name || r?.table || 'Unknown',
                sourceDatabase: selectedDatabase,
                targetDatabase: selectedDatabase,
                rowsMigrated: r?.rows_migrated || 0,
                columnsCount: r?.columns_count || 0,
                timestamp: new Date().toISOString(),
                status: 'success',
              })) || [],
            )
            // Sync to file
            await syncToFile()
          } catch (recordError) {
            logError(`Failed to record migration: ${recordError}`, 'error', 'Data Migration')
          }
        }

        if (
          summary.successful > 0 &&
          summary.failed === 0
        ) {
          toast.success(
            `Migration completed: ${summary.successful} table(s) migrated`,
          )
        } else if (
          summary.successful > 0 &&
          summary.failed > 0
        ) {
          const failedErrors = results
            .filter((r: any) => r.status === 'FAILURE')
            .map((r: any) => r.error)
            .join('; ')
          logError(
            `Migration partial: ${summary.successful} succeeded, ${summary.failed} failed. ${failedErrors}`,
            'error',
            'Data Migration',
          )
          toast.warning(
            `Migration partial: ${summary.successful} succeeded, ${summary.failed} failed`,
          )
        } else if (summary.failed > 0) {
          const failedErrors = results
            .filter((r: any) => r.status === 'FAILURE')
            .map((r: any) => r.error)
            .join('; ')
          logError(
            `Migration failed: ${failedErrors}`,
            'error',
            'Data Migration',
          )
          toast.error(
            `Migration failed: ${failedErrors}`,
          )
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error
            ? error.message
            : 'Migration failed'
        logError(errorMsg, 'error', 'Data Migration')
        toast.error(errorMsg)
      } finally {
        setIsMigrating(false)
      }
    }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2 flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <h1 className="text-3xl font-semibold tracking-tight">
            Database Profiler
          </h1>

          <p className="text-muted-foreground">
            AI-Powered Profiler — Connect to PostgreSQL and auto-discover your schema.
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

      {/* Step 1 - Select Database */}
      {!databasesQuery.isError && (
          <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-lg font-semibold mb-2">
                Step 1: Select Database
              </h2>

              <p className="text-sm text-muted-foreground mb-3">
                Choose a database to explore
              </p>
            </div>

            {databasesQuery.isLoading ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader className="h-4 w-4 animate-spin" />
                Loading databases...
              </div>
            ) : databasesQuery.data &&
              databasesQuery.data.length >
                0 ? (
              <Select
                value={selectedDatabase}
                onValueChange={(value) => {
                  setSelectedDatabase(value)
                  setMermaidCode('')
                  setMermaidSvg('')
                  setMigrationPlan('')
                  setMigrationPlanEditable('')

                  localStorage.removeItem(
                    getStorageKey('db-explorer-mermaid'),
                  )

                  localStorage.removeItem(
                    getStorageKey('db-explorer-migration-plan'),
                  )
                }}
              >
                <SelectTrigger className="w-full sm:w-80">
                  <SelectValue placeholder="Select a database" />
                </SelectTrigger>

                <SelectContent>
                  {databasesQuery.data.map(
                    (db) => (
                      <SelectItem
                        key={db.name}
                        value={db.name}
                      >
                        {db.name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            ) : (
              <div className="rounded border border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950 p-3 text-sm text-yellow-800 dark:text-yellow-200">
                No databases found
              </div>
            )}
          </div>
        )}

      {/* Step 2 */}
      {/* Step 2 - Professional Table/Grid Layout */}
{selectedDatabase && (
  <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
    {/* Header */}
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-lg font-semibold">
          Step 2: Table Schemas
        </h2>

        <p className="text-sm text-muted-foreground">
          Database:{' '}
          <span className="font-mono font-medium text-foreground">
            {selectedDatabase}
          </span>
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            if (!schemasQuery.data) return

            setSelectedTables(
              schemasQuery.data.map(
                (table) => table.table_name,
              ),
            )
          }}
        >
          Select All
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setSelectedTables([])}
        >
          Unselect All
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setExpandAllTables((prev) => !prev)
          }
        >
          {expandAllTables
            ? 'Collapse All'
            : 'Expand All'}
        </Button>
      </div>
    </div>

    {/* Selected Count */}
    <div className="text-sm text-muted-foreground">
      {selectedTables.length} /{' '}
      {schemasQuery.data?.length || 0} tables selected
    </div>

    {/* Loading */}
    {schemasQuery.isLoading ? (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader className="h-4 w-4 animate-spin" />
        Loading table schemas...
      </div>
    ) : schemasQuery.data &&
      schemasQuery.data.length > 0 ? (
      <div className="overflow-hidden rounded-lg border">
        {/* Table Header */}
        <div className="grid grid-cols-[60px_1fr_100px_100px_100px_120px] bg-muted px-4 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <div>View</div>
          <div>Table Name</div>
          <div>Rows</div>
          <div>Columns</div>
          <div>Relations</div>
          <div>Select</div>
        </div>

        {/* Rows */}
        <div className="divide-y">
          {schemasQuery.data.map((table) => {
            const isSelected =
              selectedTables.includes(
                table.table_name,
              )

            const isExpanded =
              expandedTables.includes(
                table.table_name,
              )

            return (
              <div key={table.table_name}>
                {/* Main Row */}
                <div className="grid grid-cols-[60px_1fr_100px_100px_100px_120px] items-center px-4 py-3 hover:bg-muted/40 transition-colors">
                  {/* Expand Button */}
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() =>
                        toggleTableExpand(
                          table.table_name,
                        )
                      }
                    >
                      {isExpanded ? '−' : '+'}
                    </Button>
                  </div>

                  {/* Table Name */}
                  <div className="font-medium truncate">
                    {table.table_name}
                  </div>

                  {/* Row Count */}
                  <div className="text-sm text-muted-foreground">
                    {table.row_count?.toLocaleString()}
                  </div>

                  {/* Column Count */}
                  <div className="text-sm text-muted-foreground">
                    {table.columns.length} columns
                  </div>

                  {/* FK Count */}
                  <div className="text-sm text-muted-foreground">
                    {
                      table.foreign_keys.length
                    }{' '}
                    FK
                  </div>

                  {/* Select */}
                  <div>
                    <Button
                      size="sm"
                      variant={
                        isSelected
                          ? 'default'
                          : 'outline'
                      }
                      className="h-7 text-xs"
                      onClick={() =>
                        toggleTableSelection(
                          table.table_name,
                        )
                      }
                    >
                      {isSelected
                        ? 'Selected'
                        : 'Select'}
                    </Button>
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 px-6 py-5">
                    <div className="space-y-5">
                      {/* Columns */}
                      <div>
                        <h4 className="mb-3 text-sm font-semibold">
                          Columns
                        </h4>

                        <div className="overflow-hidden rounded-lg border">
                          <table className="w-full text-left">
                            <thead className="bg-muted">
                              <tr>
                                <th className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                                  Name
                                </th>

                                <th className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                                  Type
                                </th>

                                <th className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                                  Nullable
                                </th>

                                <th className="px-4 py-2 text-xs font-semibold text-muted-foreground">
                                  Default
                                </th>
                              </tr>
                            </thead>

                            <tbody>
                              {table.columns.map(
                                (col) => (
                                  <ColumnRow
                                    key={
                                      col.column_name
                                    }
                                    column={col}
                                  />
                                ),
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* PK */}
                      {table.primary_key.length >
                        0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold">
                            Primary Keys
                          </h4>

                          <div className="flex flex-wrap gap-2">
                            {table.primary_key.map(
                              (pk) => (
                                <span
                                  key={pk}
                                  className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200"
                                >
                                  {pk}
                                </span>
                              ),
                            )}
                          </div>
                        </div>
                      )}

                      {/* FK */}
                      {table.foreign_keys.length >
                        0 && (
                        <div>
                          <h4 className="mb-2 text-sm font-semibold">
                            Foreign Keys
                          </h4>

                          <div className="space-y-2">
                            {table.foreign_keys.map(
                              (fk, idx) => (
                                <div
                                  key={idx}
                                  className="rounded bg-purple-100 px-3 py-2 text-xs font-mono text-purple-900 dark:bg-purple-900 dark:text-purple-200"
                                >
                                  {
                                    fk.column_name
                                  }{' '}
                                  →{' '}
                                  {
                                    fk.referenced_table
                                  }
                                  .
                                  {
                                    fk.referenced_column
                                  }
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    ) : (
      <div className="rounded border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900 dark:bg-yellow-950 dark:text-yellow-200">
        No tables found in this database
      </div>
    )}
  </div>
)}

      {/* Step 3 */}
      {selectedDatabase &&
        schemasQuery.data &&
        schemasQuery.data.length >
          0 && (
          <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  Step 3: ER Diagram
                </h2>

                <p className="text-sm text-muted-foreground mb-3">
                  Generate an entity
                  relationship diagram.
                </p>
              </div>

              <Button
                onClick={() =>
                  erDiagramMutation.mutate()
                }
                disabled={
                  erDiagramMutation.isPending ||
                  selectedTables.length ===
                    0
                }
              >
                {erDiagramMutation.isPending ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate ER Diagram'
                )}
              </Button>
            </div>

            {mermaidSvg ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm text-muted-foreground">
                    Open the diagram in
                    fullscreen for a larger
                    view.
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      if (
                        !diagramContainerRef.current
                      ) {
                        return
                      }

                      if (
                        document.fullscreenElement ===
                        diagramContainerRef.current
                      ) {
                        await document.exitFullscreen()

                        return
                      }

                      await diagramContainerRef.current.requestFullscreen()
                    }}
                  >
                    {isDiagramFullscreen ? (
                      <>
                        <Shrink className="mr-2 h-4 w-4" />
                        Exit Fullscreen
                      </>
                    ) : (
                      <>
                        <Expand className="mr-2 h-4 w-4" />
                        Fullscreen
                      </>
                    )}
                  </Button>
                </div>

                <div
                  ref={
                    diagramContainerRef
                  }
                  className="rounded-lg border bg-muted/30 p-4 overflow-auto max-h-[700px]"
                >
                  <div
                    className="max-w-full h-auto mx-auto"
                    dangerouslySetInnerHTML={{
                      __html:
                        mermaidSvg,
                    }}
                  />
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const blob =
                      new Blob(
                        [mermaidSvg],
                        {
                          type:
                            'image/svg+xml;charset=utf-8',
                        },
                      )

                    const url =
                      URL.createObjectURL(
                        blob,
                      )

                    const link =
                      document.createElement(
                        'a',
                      )

                    link.href = url

                    link.download = `${selectedDatabase}_er_diagram.svg`

                    document.body.appendChild(
                      link,
                    )

                    link.click()

                    document.body.removeChild(
                      link,
                    )

                    URL.revokeObjectURL(
                      url,
                    )
                  }}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download Diagram
                </Button>
              </div>
            ) : (
              !erDiagramMutation.isPending && (
                <div className="rounded border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3 text-sm text-blue-800 dark:text-blue-200">
                  Generate the ER diagram
                  to visualize table
                  relationships.
                </div>
              )
            )}
          </div>
        )}

      {/* Step 4 */}
      {selectedDatabase &&
        schemasQuery.data &&
        schemasQuery.data.length >
          0 && (
          <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold mb-2">
                  Step 4: Migration Plan
                </h2>

                <p className="text-sm text-muted-foreground mb-3">
                  Generate a PostgreSQL to
                  Snowflake migration plan.
                </p>
              </div>

              <Button
                onClick={() =>
                  migrationPlanMutation.mutate()
                }
                disabled={
                  migrationPlanMutation.isPending ||
                  selectedTables.length ===
                    0
                }
              >
                {migrationPlanMutation.isPending ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Migration Plan'
                )}
              </Button>
            </div>

            {migrationPlan ? (
              <MigrationPlanViewer
                plan={migrationPlan}
                editable={
                  migrationPlanEditable
                }
                onEditableChange={
                  setMigrationPlanEditable
                }
                onSave={
                  handleSaveMigrationPlan
                }
                isSaving={
                  isSavingMigrationPlan
                }
              />
            ) : (
              !migrationPlanMutation.isPending && (
                <div className="rounded border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950 p-3 text-sm text-blue-800 dark:text-blue-200">
                  Generate the migration
                  plan to get insights for
                  migrating to Snowflake.
                </div>
              )
            )}
          </div>
        )}

      {/* Step 5 */}
      {selectedTables.length > 0 && (
        <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold mb-2">
                Step 5: Column Mapping & Migration
              </h2>

              <p className="text-sm text-muted-foreground">
                Map columns and select which
                data to migrate to Snowflake
              </p>
            </div>

            {columnMappings.length === 0 ? (
              <Button
                onClick={handleGetColumnMappings}
                disabled={isLoadingMappings}
              >
                {isLoadingMappings ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Getting Mappings...
                  </>
                ) : (
                  'Get Column Mappings'
                )}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    columnMappings.forEach((table) => {
                      table.columns.forEach((col: any) => {
                        if (!table.selected_columns?.includes(col.source_column)) {
                          handleSelectColumn(table.table_name, col.source_column, true)
                        }
                      })
                    })
                  }}
                >
                  Select All
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    columnMappings.forEach((table) => {
                      table.selected_columns?.forEach((col: string) => {
                        handleSelectColumn(table.table_name, col, false)
                      })
                    })
                  }}
                >
                  Unselect All
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setExpandAllColumns((prev) => !prev)
                  }
                >
                  {expandAllColumns
                    ? 'Collapse All'
                    : 'Expand All'}
                </Button>
              </div>
            )}
          </div>

          {columnMappings.length > 0 && (
            <ColumnMappingViewer
              tables={columnMappings}
              onSelectColumn={
                handleSelectColumn
              }
              onDatatypeChange={
                handleDatatypeChange
              }
              onTargetColumnChange={
                handleTargetColumnChange
              }
              onMigrate={handleMigrateData}
              isMigrating={isMigrating}
              currentUser={currentUser}
              expandAll={expandAllColumns}
            />
          )}
        </div>
      )}
    </div>
  )
}