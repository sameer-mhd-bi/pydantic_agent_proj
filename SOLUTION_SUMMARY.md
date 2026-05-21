# Dynamic Database Configuration - Complete Solution

## Problem Summary
Your MCP server had hardcoded database and schema details. Additionally, even after creating a configuration system, the config wasn't being loaded from `database_config.json` - it was using default values instead.

## Solution Overview
I've implemented a complete centralized configuration management system with:
1. **Backend Config Module** - Single source of truth for all database settings
2. **Configuration UI Page** - User-friendly interface to manage database credentials
3. **Dynamic MCP Server** - Loads fresh config on each connection initialization
4. **API Endpoints** - Save/reset/retrieve configuration
5. **Debug Verification Script** - To verify config is loading correctly

## Architecture

### Files Modified/Created

#### Backend (Python)
- **`agent/chatbot/database_config.py`** - Core configuration management
  - `load_database_config()` - Loads from `database_config.json` or returns defaults
  - `save_database_config()` - Persists config to JSON file
  - `update_database_config()` - Updates and saves specific configs
  - `get_postgresql_config()` / `get_snowflake_config()` - Get specific DB config

- **`agent/mcp_server.py`** - Modified for dynamic config loading
  - `initialize_postgresql_connection()` - Now loads config fresh from JSON each call
  - `initialize_snowflake_connection()` - Now loads config fresh from JSON each call
  - `invalidate_config_cache()` - Forces fresh config load
  - Removed hardcoded globals for database settings

- **`agent/chatbot/server.py`** - Added API endpoints
  - `GET /api/database-config` - Retrieve current configuration
  - `POST /api/database-config` - Update config and reinitialize connections
  - `POST /api/database-config/reset` - Reset to default configuration

#### Frontend (React/TypeScript)
- **`src/components/database-config-page.tsx`** - Configuration management UI
  - Forms for PostgreSQL credentials (host, port, user, password, database)
  - Forms for Snowflake credentials (account, user, warehouse, database, schema, key path)
  - Save/Reset buttons with loading states
  - Change tracking with unsaved changes alert

- **`src/App.tsx`** - Added routing for config page

- **`src/components/app-sidebar.tsx`** - Added "Database Config" menu item

- **`src/components/database-explorer-page.tsx`** - Updated to send config with sync

#### Configuration File
- **`agent/config/database_config.json`** - Persistent configuration storage
  ```json
  {
    "postgresql": {
      "host": "localhost",
      "port": 5432,
      "user": "postgres",
      "password": "root",
      "dbname": "sales"
    },
    "snowflake": {
      "account": "your-account",
      "user": "your-user",
      "warehouse": "DWH",
      "database": "your_db",
      "schema": "your_schema",
      "key_path": "/path/to/key.pem"
    }
  }
  ```

## Critical Bug Fix Explained

### The Problem
When the config was saved to JSON and the MCP server tried to load it, it wasn't reading the new values. It kept using the original defaults.

### Root Cause
The old initialization code would only load config once at startup. Even though the JSON file was being updated, the in-memory connections weren't being reinitialized with the new values.

### The Solution
Modified both `initialize_postgresql_connection()` and `initialize_snowflake_connection()` to:
1. **Always load fresh config** from `database_config.json` (not cached values)
2. **Close existing connections** before creating new ones
3. **Log the actual database name** being used for debugging
4. Be called every time a config change is saved

### Key Changes in mcp_server.py
```python
def initialize_postgresql_connection():
    global pg_conn, POSTGRES_CONNECTION_ERROR
    
    # Close existing connection
    if pg_conn is not None:
        pg_conn.close()
    
    # IMPORTANT: Load fresh config from JSON each time
    config = load_database_config()
    pg_config = config.get("postgresql", {})
    
    # Use config values
    db_name = pg_config.get("dbname", "bank_db")  # Will be "sales" if saved
    # ... create new connection with new config
```

## Usage Workflow

### For Users
1. Navigate to **Database Config** in sidebar
2. Update PostgreSQL or Snowflake credentials
3. Click **Save** button
4. MCP server automatically reconnects with new credentials
5. All other tabs (Agent, Database Explorer, etc.) now use the new config

### For Developers
1. Run the verification script to check if config is loading:
   ```bash
   cd agent
   python -m chatbot.verify_config
   ```

2. The script will show:
   - ✓ Config file path and existence
   - ✓ Loaded PostgreSQL database name (should be "sales" not "bank_db")
   - ✓ Loaded Snowflake settings
   - ✓ MCP server connection status

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     User Interface                              │
│  1. User updates config in Database Config page                │
│  2. Clicks Save button                                         │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    API Endpoint                                 │
│  POST /api/database-config                                     │
│  - Body: {postgresql: {...}, snowflake: {...}}                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   Server (server.py)                           │
│  1. update_database_config()                                   │
│  2. mcp_server.invalidate_config_cache()                      │
│  3. initialize_postgresql_connection()                         │
│  4. initialize_snowflake_connection()                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│             Config File & Connections                           │
│  1. Config saved to database_config.json                       │
│  2. Fresh config loaded from JSON                              │
│  3. Old connections closed                                     │
│  4. New connections established with new credentials           │
└─────────────────────────────────────────────────────────────────┘
```

## Testing the Fix

### Step 1: Change Config
1. Go to **Database Config** page
2. Change PostgreSQL database from "sales" to "bank_db" (or any other database)
3. Click **Save**

### Step 2: Verify in Logs
Check the terminal/logs for:
```
[INFO] Initializing PostgreSQL connection to postgres@localhost:5432 database=bank_db
[INFO] PostgreSQL connection initialized successfully.
```

The database name should match what you just saved.

### Step 3: Run Verification Script
```bash
python agent/chatbot/verify_config.py
```

Should show the database name you just set.

### Step 4: Test in Database Explorer
1. Go to **Database Explorer**
2. Connect to PostgreSQL
3. The connection should use the credentials you just configured
4. Available tables/schemas should match the selected database

## Important Notes

- ✅ Configuration persists in `database_config.json`
- ✅ All tabs use the same configuration automatically
- ✅ Snowflake key path must point to valid RSA private key
- ✅ MCP server reconnects immediately after config save (no app restart needed)
- ⚠️ Credentials are stored in plain text in JSON file - use appropriate file permissions
- ⚠️ Key path for Snowflake must be accessible by the Python process

## Next Steps (Optional)

Consider adding:
1. **Environment variables** support for sensitive credentials
2. **Configuration validation** before saving
3. **Connection testing** button to verify credentials work
4. **Multiple connection profiles** to switch between environments
5. **Encryption** for stored credentials in JSON file
