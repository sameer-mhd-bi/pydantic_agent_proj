import { useEffect, useState } from 'react'
import { Activity, Database, TrendingUp, Calendar, User } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { getMigrationStats, getMigrationsByUser, type MigrationStats, type MigrationRecord } from '@/lib/migration-stats'
import type { User as UserType } from '@/types/user'

export function MigrationDashboard({ currentUser }: { currentUser?: UserType | null }) {
  const [stats, setStats] = useState<MigrationStats>(getMigrationStats())
  const [userMigrations, setUserMigrations] = useState<MigrationRecord[]>([])

  useEffect(() => {
    const handleStatsUpdate = () => {
      const newStats = getMigrationStats()
      setStats(newStats)
      if (currentUser?.id) {
        setUserMigrations(getMigrationsByUser(currentUser.id))
      } else {
        setUserMigrations([])
      }
    }

    handleStatsUpdate()
    window.addEventListener('migration-stats-updated', handleStatsUpdate)
    return () => {
      window.removeEventListener('migration-stats-updated', handleStatsUpdate)
    }
  }, [currentUser?.id])

  const lastUpdatedDate = userMigrations.length > 0 
    ? new Date(userMigrations[userMigrations.length - 1].timestamp).toLocaleDateString()
    : new Date(stats.lastUpdated).toLocaleDateString()
  const lastUpdatedTime = userMigrations.length > 0 
    ? new Date(userMigrations[userMigrations.length - 1].timestamp).toLocaleTimeString()
    : new Date(stats.lastUpdated).toLocaleTimeString()

  const userTotalMigrations = userMigrations.length
  const userSchemasAnalyzed = userMigrations.reduce((sum, record) => sum + record.schemasCount, 0)

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Migration Dashboard
        </h1>
        <p className="text-muted-foreground mt-2">
          Overview of your database migration progress
        </p>
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
              {userTotalMigrations}
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
              {userSchemasAnalyzed}
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
              {userTotalMigrations === 0
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
        {userMigrations.length === 0 ? (
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
                  {userMigrations.map((record) => (
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
