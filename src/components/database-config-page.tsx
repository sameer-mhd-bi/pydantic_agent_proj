import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { AlertCircle, CheckCircle2, RotateCcw, Save, Zap } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface DatabaseConfig {
  postgresql: {
    host: string
    port: number
    user: string
    password: string
    dbname: string
  }
  snowflake: {
    account: string
    user: string
    warehouse: string
    database: string
    schema: string
    key_path: string
  }
}

async function getDatabaseConfig(): Promise<DatabaseConfig> {
  const response = await fetch('/api/database-config', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to fetch database configuration')
  }

  return response.json()
}

async function saveDatabaseConfig(config: DatabaseConfig): Promise<void> {
  const response = await fetch('/api/database-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to save database configuration')
  }
}

async function resetDatabaseConfig(): Promise<DatabaseConfig> {
  const response = await fetch('/api/database-config/reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to reset database configuration')
  }

  return response.json().then((data) => data.config)
}

async function testPostgresqlConnection(pgConfig: any): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('/api/database-config/test-postgresql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postgresql: pgConfig }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to test PostgreSQL connection')
  }

  return response.json()
}

async function testSnowflakeConnection(sfConfig: any): Promise<{ success: boolean; error?: string }> {
  const response = await fetch('/api/database-config/test-snowflake', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ snowflake: sfConfig }),
  })

  if (!response.ok) {
    const error = await response.json()
    throw new Error(error.detail || 'Failed to test Snowflake connection')
  }

  return response.json()
}

export function DatabaseConfigPage() {
  const [config, setConfig] = useState<DatabaseConfig | null>(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [postgresStatus, setPostgresStatus] = useState<{ success: boolean; error?: string } | null>(null)
  const [snowflakeStatus, setSnowflakeStatus] = useState<{ success: boolean; error?: string } | null>(null)

  // Fetch initial configuration
  const configQuery = useQuery({
    queryKey: ['database-config'],
    queryFn: getDatabaseConfig,
  })

  // Test PostgreSQL connection mutation
  const testPostgresMutation = useMutation({
    mutationFn: () => testPostgresqlConnection(config?.postgresql),
    onSuccess: (status) => {
      setPostgresStatus(status)
      if (status.success) {
        toast.success('✓ PostgreSQL connection successful')
      } else {
        toast.error(`PostgreSQL connection failed: ${status.error}`)
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`)
    },
  })

  // Test Snowflake connection mutation
  const testSnowflakeMutation = useMutation({
    mutationFn: () => testSnowflakeConnection(config?.snowflake),
    onSuccess: (status) => {
      setSnowflakeStatus(status)
      if (status.success) {
        toast.success('✓ Snowflake connection successful')
      } else {
        toast.error(`Snowflake connection failed: ${status.error}`)
      }
    },
    onError: (error) => {
      toast.error(`Test failed: ${error.message}`)
    },
  })

  // Save configuration mutation
  const saveMutation = useMutation({
    mutationFn: saveDatabaseConfig,
    onSuccess: () => {
      toast.success('Database configuration saved successfully')
      setHasChanges(false)
      configQuery.refetch()
    },
    onError: (error) => {
      toast.error(`Failed to save: ${error.message}`)
    },
  })

  // Reset configuration mutation
  const resetMutation = useMutation({
    mutationFn: resetDatabaseConfig,
    onSuccess: (newConfig) => {
      setConfig(newConfig)
      setHasChanges(false)
      toast.success('Configuration reset to defaults')
    },
    onError: (error) => {
      toast.error(`Failed to reset: ${error.message}`)
    },
  })

  useEffect(() => {
    if (configQuery.data) {
      setConfig(configQuery.data)
    }
  }, [configQuery.data])

  const handleSave = () => {
    if (config) {
      saveMutation.mutate(config)
    }
  }

  const handleReset = () => {
    if (
      window.confirm(
        'Are you sure you want to reset all database configurations to defaults? This action cannot be undone.',
      )
    ) {
      resetMutation.mutate()
    }
  }

  const handlePostgresChange = (field: string, value: any) => {
    if (config) {
      setConfig({
        ...config,
        postgresql: {
          ...config.postgresql,
          [field]: value,
        },
      })
      setHasChanges(true)
    }
  }

  const handleSnowflakeChange = (field: string, value: any) => {
    if (config) {
      setConfig({
        ...config,
        snowflake: {
          ...config.snowflake,
          [field]: value,
        },
      })
      setHasChanges(true)
    }
  }

  if (configQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Database Configuration</h1>
        </div>
        <div className="rounded-lg border bg-card p-6 shadow-sm">
          <p className="text-center text-muted-foreground">Loading configuration...</p>
        </div>
      </div>
    )
  }

  if (configQuery.isError) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Database Configuration</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Failed to load database configuration. Please try again.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!config) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Database Configuration</h1>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>No configuration available.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">Database Configuration</h1>
        <p className="text-muted-foreground">
          Manage connection settings for PostgreSQL and Snowflake databases used across the application.
        </p>
      </div>

      {hasChanges && (
        <Alert className="bg-blue-50 border-blue-200">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            You have unsaved changes. Click "Save Configuration" to apply them.
          </AlertDescription>
        </Alert>
      )}

      {/* PostgreSQL Configuration */}
      <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-600 rounded-full" />
            PostgreSQL Configuration
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Connection settings for your PostgreSQL database
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Host</label>
              <Input
                value={config.postgresql.host}
                onChange={(e) => handlePostgresChange('host', e.target.value)}
                placeholder="localhost"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Port</label>
              <Input
                type="number"
                value={config.postgresql.port}
                onChange={(e) => handlePostgresChange('port', parseInt(e.target.value))}
                placeholder="5432"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">User</label>
              <Input
                value={config.postgresql.user}
                onChange={(e) => handlePostgresChange('user', e.target.value)}
                placeholder="postgres"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Database Name</label>
              <Input
                value={config.postgresql.dbname}
                onChange={(e) => handlePostgresChange('dbname', e.target.value)}
                placeholder="bank_db"
                className="text-sm"
              />
            </div>
            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={config.postgresql.password}
                onChange={(e) => handlePostgresChange('password', e.target.value)}
                placeholder="••••••"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {postgresStatus && !postgresStatus.success && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800"><strong>Connection Error:</strong> {postgresStatus.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="default"
            onClick={() => testPostgresMutation.mutate()}
            disabled={testPostgresMutation.isPending || saveMutation.isPending}
          >
            <Zap className="mr-2 h-4 w-4" />
            {testPostgresMutation.isPending ? 'Testing...' : 'Test'}
          </Button>
        </div>
      </div>

      {/* Snowflake Configuration */}
      <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <div className="w-3 h-3 bg-cyan-400 rounded-full" />
            Snowflake Configuration
          </h2>
          <p className="text-sm text-muted-foreground mb-3">
            Connection settings for your Snowflake database
          </p>
        </div>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Account</label>
              <Input
                value={config.snowflake.account}
                onChange={(e) => handleSnowflakeChange('account', e.target.value)}
                placeholder="bxvclfn-jn77484"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">User</label>
              <Input
                value={config.snowflake.user}
                onChange={(e) => handleSnowflakeChange('user', e.target.value)}
                placeholder="appuser"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Warehouse</label>
              <Input
                value={config.snowflake.warehouse}
                onChange={(e) => handleSnowflakeChange('warehouse', e.target.value)}
                placeholder="DA_DWH"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Database</label>
              <Input
                value={config.snowflake.database}
                onChange={(e) => handleSnowflakeChange('database', e.target.value)}
                placeholder="dev_dwh"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Schema</label>
              <Input
                value={config.snowflake.schema}
                onChange={(e) => handleSnowflakeChange('schema', e.target.value)}
                placeholder="staging"
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Private Key Path</label>
              <Input
                value={config.snowflake.key_path}
                onChange={(e) => handleSnowflakeChange('key_path', e.target.value)}
                placeholder="C:\\Users\\..\\rsa_key.pem"
                className="text-sm"
              />
            </div>
          </div>
        </div>

        {snowflakeStatus && !snowflakeStatus.success && (
          <Alert className="bg-red-50 border-red-200">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800"><strong>Connection Error:</strong> {snowflakeStatus.error}</AlertDescription>
          </Alert>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            variant="default"
            onClick={() => testSnowflakeMutation.mutate()}
            disabled={testSnowflakeMutation.isPending || saveMutation.isPending}
          >
            <Zap className="mr-2 h-4 w-4" />
            {testSnowflakeMutation.isPending ? 'Testing...' : 'Test'}
          </Button>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleReset}
          disabled={resetMutation.isPending || saveMutation.isPending}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          Reset to Defaults
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
        >
          <Save className="mr-2 h-4 w-4" />
          {saveMutation.isPending ? 'Saving...' : 'Save Configuration'}
        </Button>
      </div>

      {/* Info Box */}
      <Alert className="bg-green-50 border-green-200">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800">
          These configurations are used across the entire application including database explorer, migration tools,
          and agent operations. Changes will take effect immediately after saving.
        </AlertDescription>
      </Alert>
    </div>
  )
}
