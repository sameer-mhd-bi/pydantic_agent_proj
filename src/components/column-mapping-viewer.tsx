import { useState } from 'react'
import { Loader, ChevronDown, ChevronUp, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

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
}

export function ColumnMappingViewer({
  tables,
  onSelectColumn,
  onDatatypeChange,
  onTargetColumnChange,
  onMigrate,
  isMigrating,
}: ColumnMappingViewerProps) {
  const [expandedTables, setExpandedTables] =
    useState<string[]>([])
  const [migrationResults, setMigrationResults] =
    useState<MigrationResult[]>([])

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

  const handleSelectAllColumns = () => {
    tables.forEach((table) => {
      table.columns.forEach((col) => {
        if (!table.selected_columns.includes(col.source_column)) {
          onSelectColumn(table.table_name, col.source_column, true)
        }
      })
    })
  }

  const handleMigrateClick = async () => {
    setMigrationResults([])
    await onMigrate(tables)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm">
        <div className="text-muted-foreground">
          {selectedCount}/{totalColumns} column(s) selected
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSelectAllColumns}
          className="h-6 text-xs"
          disabled={selectedCount === totalColumns}
        >
          Select All
        </Button>
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
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
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
                  <div className="grid grid-cols-[40px_2fr_1.5fr_2fr_1.5fr] gap-3 p-3 text-xs font-medium text-muted-foreground border-b bg-muted/40">
                    <div>Sel</div>
                    <div>Source Column</div>
                    <div>Source Type</div>
                    <div>Target Column</div>
                    <div>Target Type</div>
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

      <Button
        onClick={handleMigrateClick}
        disabled={
          isMigrating ||
          selectedCount === 0
        }
        className="w-full"
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
