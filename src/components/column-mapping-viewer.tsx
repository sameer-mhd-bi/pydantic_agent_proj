import { useState, useEffect } from 'react'
import { Loader, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { incrementMigrations } from '@/lib/migration-stats'
import type { User } from '@/types/user'

interface ColumnMapping {
  source_column: string
  source_datatype: string
  target_column: string
  target_datatype: string
  is_primary_key: boolean
  is_nullable: boolean
  transformation?: string
}

interface TableMapping {
  table_name: string
  columns: ColumnMapping[]
  selected_columns: string[]
}

interface MigrationResult {
  status: 'SUCCESS' | 'FAILURE'
  message?: string
  error?: string
  table?: string
  column?: string
  rows_migrated?: number
}

interface ColumnMappingViewerProps {
  tables: TableMapping[]
  onSelectColumn: (
    table: string,
    column: string,
    selected: boolean,
  ) => void
  onDatatypeChange: (
    table: string,
    column: string,
    datatype: string,
  ) => void
  onTargetColumnChange?: (
    table: string,
    column: string,
    targetColumn: string,
  ) => void
  onMigrate: (tables: TableMapping[]) => Promise<void>
  isMigrating: boolean
  currentUser?: User | null
  expandAll?: boolean
}

export function ColumnMappingViewer({
  tables,
  onSelectColumn,
  onDatatypeChange,
  onTargetColumnChange,
  onMigrate,
  isMigrating,
  currentUser,
  expandAll,
}: ColumnMappingViewerProps) {
  const [expandedTables, setExpandedTables] =
    useState<string[]>([])
  const [migrationResults, setMigrationResults] =
    useState<MigrationResult[]>([])

  // Handle expand all / collapse all
  useEffect(() => {
    if (expandAll) {
      setExpandedTables(tables.map((t) => t.table_name))
    } else {
      setExpandedTables([])
    }
  }, [expandAll, tables])

  const toggleTableExpand = (table: string) => {
    setExpandedTables((prev) =>
      prev.includes(table)
        ? prev.filter((t) => t !== table)
        : [...prev, table],
    )
  }

  const selectedCount = tables.reduce(
    (sum, table) =>
      sum + table.selected_columns.length,
    0,
  )

  const totalColumns = tables.reduce(
    (sum, table) =>
      sum + table.columns.length,
    0,
  )


  const handleTableSelectAll = (
    tableName: string,
    columns: ColumnMapping[],
    checked: boolean,
  ) => {
    columns.forEach((col) => {
      onSelectColumn(tableName, col.source_column, checked)
    })
  }

  const handleMigrateClick = async () => {
    setMigrationResults([])
    try {
      await onMigrate(tables)
      const selectedTablesCount = tables.filter(t => t.selected_columns.length > 0).length
      incrementMigrations(selectedTablesCount, currentUser?.id, currentUser?.fullName)
    } catch (error) {
      console.error('Migration error:', error)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-start text-sm">
        <div className="text-muted-foreground">
          {selectedCount}/{totalColumns} column(s) selected
        </div>
      </div>

      <div className="space-y-2">
        {tables.map((table) => {
          const isExpanded =
            expandedTables.includes(
              table.table_name,
            )
          const selectedInTable =
            table.selected_columns.length

          return (
            <div
              key={table.table_name}
              className="border rounded-lg overflow-hidden"
            >
              <button
                onClick={() =>
                  toggleTableExpand(
                    table.table_name,
                  )
                }
                className="w-full flex items-center gap-2 p-2 hover:bg-muted bg-card transition-colors"
              >
                <span className="text-lg">
                  {isExpanded ? '−' : '+'}
                </span>
                <span className="text-sm font-semibold">
                  {table.table_name}
                </span>
                <span className="text-xs text-muted-foreground ml-auto">
                  {selectedInTable}/
                  {table.columns.length}
                </span>
              </button>

              {isExpanded && (
                <div className="bg-muted/20">
                  <div className="grid grid-cols-[40px_2fr_1.5fr_2fr_1.5fr] gap-3 p-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b bg-muted">
                    <Checkbox
                      checked={
                        table.columns.length > 0 &&
                        table.columns.every((col) =>
                          table.selected_columns.includes(col.source_column)
                        )
                      }
                      onCheckedChange={(checked) =>
                        handleTableSelectAll(
                          table.table_name,
                          table.columns,
                          checked as boolean,
                        )
                      }
                      aria-label={`Select all columns for ${table.table_name}`}
                    />
                    <div className="text-muted-foreground">Source Column</div>
                    <div className="text-muted-foreground">Source Type</div>
                    <div className="text-muted-foreground">Target Column</div>
                    <div className="text-muted-foreground">Target Type</div>
                  </div>
                  {table.columns.map(
                    (col) => {
                      const isSelected =
                        table.selected_columns.includes(
                          col.source_column,
                        )

                      return (
                        <div
                          key={col.source_column}
                          className="grid grid-cols-[40px_2fr_1.5fr_2fr_1.5fr] gap-3 p-3 items-center border-b hover:bg-muted/20"
                        >
                          <Checkbox
                            checked={
                              isSelected
                            }
                            onCheckedChange={
                              (
                                checked,
                              ) =>
                                onSelectColumn(
                                  table.table_name,
                                  col.source_column,
                                  checked as boolean,
                                )
                            }
                          />
                          <div className="text-xs space-y-1">
                            <div className="font-medium">
                              {
                                col.source_column
                              }
                            </div>
                            {col.is_primary_key && (
                              <div className="text-blue-600 dark:text-blue-400">
                                PK
                              </div>
                            )}
                          </div>
                          <div className="text-xs font-mono text-muted-foreground">
                            {
                              col.source_datatype
                            }
                          </div>
                          <Input
                            value={
                              col.target_column
                            }
                            onChange={
                              (
                                e,
                              ) =>
                                onTargetColumnChange?.(
                                  table.table_name,
                                  col.source_column,
                                  e.target
                                    .value,
                                )
                            }
                            className="h-8 text-xs w-full"
                            disabled={
                              !isSelected
                            }
                            placeholder="target column"
                          />
                          <Input
                            value={
                              col.target_datatype
                            }
                            onChange={
                              (
                                e,
                              ) =>
                                onDatatypeChange(
                                  table.table_name,
                                  col.source_column,
                                  e.target
                                    .value,
                                )
                            }
                            className="h-8 text-xs font-mono w-full"
                            disabled={
                              !isSelected
                            }
                          />
                        </div>
                      )
                    },
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end">
        <Button
          onClick={handleMigrateClick}
          disabled={
            isMigrating ||
            selectedCount === 0
          }
        >
          {isMigrating ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              Migrating...
            </>
          ) : (
            'Start Migration'
          )}
        </Button>
      </div>

      {migrationResults.length > 0 && (
        <div className="space-y-2 p-3 bg-muted/20 rounded-lg">
          <div className="font-semibold text-sm">
            Migration Results
          </div>
          {migrationResults.map(
            (result, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 text-xs"
              >
                {result.status ===
                'SUCCESS' ? (
                  <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                )}
                <div>
                  <div className="font-mono">
                    {result.table}
                  </div>
                  <div className="text-muted-foreground max-w-sm">
                    {result.status ===
                    'SUCCESS'
                      ? `${result.rows_migrated} rows migrated`
                      : result.error || 'Migration failed'}
                  </div>
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  )
}
