export interface MigrationRecord {
  id: string
  timestamp: string
  userId: string
  userName: string
  schemasCount: number
  tablesCount: number
}

export interface MigrationStats {
  totalMigrations: number
  schemasAnalyzed: number
  lastUpdated: string
  records: MigrationRecord[]
}

const STATS_KEY = 'migration-stats'

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

export function incrementMigrations(schemasCount: number = 1, userId?: string, userName?: string): MigrationStats {
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
  }
  
  stats.records.push(record)
  localStorage.setItem(STATS_KEY, JSON.stringify(stats))
  window.dispatchEvent(new Event('migration-stats-updated'))
  return stats
}

export function getMigrationsByUser(userId: string): MigrationRecord[] {
  const stats = getMigrationStats()
  return stats.records.filter(record => record.userId === userId)
}

export function resetStats(): void {
  localStorage.removeItem(STATS_KEY)
  window.dispatchEvent(new Event('migration-stats-updated'))
}
