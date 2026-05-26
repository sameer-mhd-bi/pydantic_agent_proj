export interface TableMigrationDetail {
  tableName: string
  sourceDatabase: string
  targetDatabase: string
  rowsMigrated: number
  columnsCount: number
  timestamp: string
  status: 'success' | 'failed'
  error?: string
}

export interface MigrationRecord {
  id: string
  timestamp: string
  userId: string
  userName: string
  schemasCount: number
  tablesCount: number
  tables?: TableMigrationDetail[]
}

export interface MigrationStats {
  totalMigrations: number
  schemasAnalyzed: number
  lastUpdated: string
  records: MigrationRecord[]
}

const STATS_KEY = 'migration-stats'
const TABLES_MIGRATION_KEY = 'migration-tables'

export function getMigrationStats(): MigrationStats {
  const stored = localStorage.getItem(STATS_KEY)
  if (stored) {
    try {
      return JSON.parse(stored)
    } catch {
      return getDefaultStats()
    }
  }
  return getDefaultStats()
}

function getDefaultStats(): MigrationStats {
  return {
    totalMigrations: 0,
    schemasAnalyzed: 0,
    lastUpdated: new Date().toISOString(),
    records: [],
  }
}

export function recordSuccessfulTableMigration(
  tableName: string,
  sourceDatabase: string,
  targetDatabase: string,
  rowsMigrated: number,
  columnsCount: number,
): TableMigrationDetail {
  const detail: TableMigrationDetail = {
    tableName,
    sourceDatabase,
    targetDatabase,
    rowsMigrated,
    columnsCount,
    timestamp: new Date().toISOString(),
    status: 'success',
  }
  
  try {
    // Store table migration details
    const tablesMigrations = getTablesMigrationHistory()
    if (Array.isArray(tablesMigrations)) {
      tablesMigrations.push(detail)
      localStorage.setItem(TABLES_MIGRATION_KEY, JSON.stringify(tablesMigrations))
    }
  } catch (error) {
    console.error('Failed to record table migration:', error)
  }
  
  return detail
}

export function getTablesMigrationHistory(): TableMigrationDetail[] {
  try {
    const stored = localStorage.getItem(TABLES_MIGRATION_KEY)
    if (stored) {
      const parsed = JSON.parse(stored)
      return Array.isArray(parsed) ? parsed : []
    }
  } catch {
    // Silent fail on parse error
  }
  return []
}

export function incrementMigrations(
  schemasCount: number = 1,
  userId?: string,
  userName?: string,
  tables?: TableMigrationDetail[],
): MigrationStats {
  const stats = getMigrationStats()
  stats.totalMigrations += 1
  stats.schemasAnalyzed += schemasCount
  stats.lastUpdated = new Date().toISOString()
  
  const record: MigrationRecord = {
    id: `migration-${Date.now()}`,
    timestamp: new Date().toISOString(),
    userId: userId || 'unknown',
    userName: userName || 'Unknown User',
    schemasCount,
    tablesCount: schemasCount,
    tables: tables || [],
  }
  
  stats.records.push(record)
  localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  
  // Dispatch event with a small delay to ensure storage is complete
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('migration-stats-updated', { detail: stats }))
  }, 100)
  
  return stats
}

export function getMigrationsByUser(userId: string): MigrationRecord[] {
  const stats = getMigrationStats()
  return stats.records.filter(record => record.userId === userId)
}

export function resetStats(): void {
  localStorage.removeItem(STATS_KEY)
  localStorage.removeItem(TABLES_MIGRATION_KEY)
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('migration-stats-updated', { detail: getDefaultStats() }))
  }, 100)
}

export async function syncToFile(): Promise<void> {
  const stats = getMigrationStats()
  const tablesMigrations = getTablesMigrationHistory()
  
  const data = {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    totalMigrations: stats.totalMigrations,
    schemasAnalyzed: stats.schemasAnalyzed,
    records: stats.records,
    tableMigrations: tablesMigrations,
  }
  
  try {
    const response = await fetch('/api/migration-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    
    if (!response.ok) {
      console.error('Failed to sync migration history:', response.statusText)
    }
  } catch (error) {
    console.error('Failed to sync migration history to file:', error)
  }
}

export function downloadMigrationHistory(): void {
  const stats = getMigrationStats()
  const tablesMigrations = getTablesMigrationHistory()
  
  const data = {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    totalMigrations: stats.totalMigrations,
    schemasAnalyzed: stats.schemasAnalyzed,
    records: stats.records,
    tableMigrations: tablesMigrations,
  }
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `migration-history-${new Date().getTime()}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export async function fetchMigrationHistory(): Promise<MigrationStats | null> {
  try {
    console.log('Fetching migration history from /api/migration-history')
    const response = await fetch('/api/migration-history', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    })
    
    console.log('Migration history response status:', response.status)
    
    if (!response.ok) {
      console.error('Failed to fetch migration history. Status:', response.status, response.statusText)
      const errorText = await response.text()
      console.error('Response body:', errorText)
      return null
    }

    const data = await response.json()
    console.log('Fetched migration data:', data)
    
    if (!data) {
      return getDefaultStats()
    }

    const recordsList = Array.isArray(data.records)
      ? data.records
      : Array.isArray(data.migrations)
      ? data.migrations
      : []

    const tableMigrations = Array.isArray(data.tableMigrations)
      ? data.tableMigrations
      : []

    const stats = {
      totalMigrations: data.totalMigrations || recordsList.length,
      schemasAnalyzed: data.schemasAnalyzed || 0,
      lastUpdated: data.lastUpdated || new Date().toISOString(),
      records: recordsList,
    }

    // Sync to local storage for overall consistency across views
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats))
      localStorage.setItem(TABLES_MIGRATION_KEY, JSON.stringify(tableMigrations))
      
      // If the data changed from what was in localStorage, dispatch an update event
      // so other components (like the dashboard) can react immediately
    } catch (e) {
      console.warn('Failed to sync server history to localStorage:', e)
    }

    return stats
  } catch (error) {
    console.error('Error fetching migration history:', error)
    return null
  }
}
