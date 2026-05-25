import { useEffect, useState } from 'react'
import { Activity, Database, TrendingUp, Calendar, User, Download } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { downloadMigrationHistory, fetchMigrationHistory, type MigrationStats } from '@/lib/migration-stats'
import type { User as UserType } from '@/types/user'

export function MigrationDashboard({ currentUser }: { currentUser?: UserType | null }) {
  const [stats, setStats] = useState<MigrationStats>({
    totalMigrations: 0,
    schemasAnalyzed: 0,
    lastUpdated: new Date().toISOString(),
    records: [],
  })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const handleStatsUpdate = async () => {
      try {
        setError(null)
        const newStats = await fetchMigrationHistory()
        if (newStats) {
          setStats(newStats)
        }
      } catch (err) {
        console.error('Error fetching migration stats:', err)
        setError('Unable to load migration history. Please try again later.')
      } finally {
        setIsLoading(false)
      }
    }

    handleStatsUpdate()
    
    // Listen to custom event for instant updates
    window.addEventListener('migration-stats-updated', handleStatsUpdate)
    
    // Poll every 3 seconds
    const pollInterval = setInterval(handleStatsUpdate, 3000)
    
    return () => {
      window.removeEventListener('migration-stats-updated', handleStatsUpdate)
      clearInterval(pollInterval)
    }
  }, [])

  const lastUpdatedDate = stats.records.length > 0 
    ? new Date(stats.records[stats.records.length - 1].timestamp).toLocaleDateString()
    : new Date(stats.lastUpdated).toLocaleDateString()
  const lastUpdatedTime = stats.records.length > 0 
    ? new Date(stats.records[stats.records.length - 1].timestamp).toLocaleTimeString()
    : new Date(stats.lastUpdated).toLocaleTimeString()

  const isUserRecord = (record: any) => {
    if (!currentUser) return false
    return (
      record.userId === currentUser.id ||
      record.userId === currentUser.username ||
      record.userName === currentUser.username ||
      record.userName === currentUser.fullName ||
      (currentUser.role === 'admin' && (record.userId === 'admin' || record.userId === 'admin-001' || record.userId === 'unknown' || !record.userId))
    )
  }

  const globalTotalMigrations = stats.totalMigrations || stats.records.length
  const globalSchemasAnalyzed = stats.schemasAnalyzed || stats.records.reduce((sum, r) => sum + r.schemasCount, 0)

  return (
    <div className="space-y-6 p-4">
      {isLoading && (
        <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 p-4">
          <p className="text-sm text-blue-900 dark:text-blue-100">
            Loading migration history...
          </p>
        </div>
      )}
      
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 p-4">
          <p className="text-sm text-red-600 dark:text-red-400">
            Error loading migration history: {error}
          </p>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Migration Dashboard
          </h1>
          <p className="text-muted-foreground mt-2">
            Overview of your database migration progress
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={downloadMigrationHistory}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          Download History
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Total Migrations Card */}
        <Card className="p-6 space-y-3 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Total Migrations
            </h3>
            <div className="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
              <Activity className="h-4 w-4 text-blue-600 dark:text-blue-300" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">
              {globalTotalMigrations}
            </p>
            <p className="text-xs text-muted-foreground">
              Successful migration operations
            </p>
          </div>
        </Card>

        {/* Schemas Analyzed Card */}
        <Card className="p-6 space-y-3 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Schemas Analyzed
            </h3>
            <div className="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
              <Database className="h-4 w-4 text-purple-600 dark:text-purple-300" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-3xl font-bold">
              {globalSchemasAnalyzed}
            </p>
            <p className="text-xs text-muted-foreground">
              Total schemas processed
            </p>
          </div>
        </Card>

        {/* Last Updated Card */}
        <Card className="p-6 space-y-3 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-muted-foreground">
              Last Activity
            </h3>
            <div className="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-300" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {lastUpdatedDate}
            </p>
            <p className="text-xs text-muted-foreground">
              {globalTotalMigrations === 0
                ? 'No migrations yet'
                : `at ${lastUpdatedTime}`}
            </p>
          </div>
        </Card>
      </div>

      {/* Info Box */}
      <div className="rounded-lg border bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-900 p-4">
        <p className="text-sm text-blue-900 dark:text-blue-100">
          💡 Start your first migration in the Database Profiler to see statistics update in real-time.
        </p>
      </div>

      {/* Migration Records */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Migration History</h2>
        {stats.records.length === 0 ? (
          <div className="rounded-lg border bg-muted/20 p-6 text-center">
            <p className="text-muted-foreground">No migrations yet. Start your first migration to see it here.</p>
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium">Timestamp</th>
                    <th className="px-4 py-3 text-left font-medium">User</th>
                    <th className="px-4 py-3 text-left font-medium">Schemas Analyzed</th>
                    <th className="px-4 py-3 text-left font-medium">Tables Migrated</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.records.map((record) => (
                    <tr key={record.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3" />
                          {new Date(record.timestamp).toLocaleString()}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <User className="h-3 w-3" />
                          <span className="font-medium">{record.userName}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-purple-100 dark:bg-purple-900 text-purple-900 dark:text-purple-100 text-xs font-semibold">
                          {record.schemasCount}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-100 dark:bg-blue-900 text-blue-900 dark:text-blue-100 text-xs font-semibold">
                          {record.tablesCount}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
