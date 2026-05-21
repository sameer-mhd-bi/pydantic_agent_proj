# Agent Dynamic Database Configuration Fix

## Problem Statement
When the user selected a different database in the Database Config page, the MCP server would reconnect to the new database (good!), but new conversations would still not get results from the updated database. The agent was still using the old database configuration.

## Root Cause
The agent's database configuration was loaded once at module startup and never reloaded. Even though:
- MCP server was reinitialized with new config ✓
- Config file was updated ✓

The agent didn't know about the new database because:
- `current_database_config` global in agent.py was only updated if user went through database explorer
- `build_runtime_memory()` called once per conversation but built from stale config
- `build_db_schema_memory()` ran once at startup and never refreshed

## Solution Implemented

### 1. Agent Configuration Reload Function
Added `reload_database_config_from_file()` to agent.py that:
- Loads fresh config from `database_config.json`
- Updates the agent's `current_database_config` global
- Builds the correct connection string for the saved database
- Logs the reload for debugging

### 2. Dynamic Schema Memory Rebuilding
Modified `build_runtime_memory()` to:
- Call `reload_database_config_from_file()` at the start of each conversation
- Rebuild `db_schema_memory` based on the current config
- This ensures the agent always queries the correct database

### 3. Dynamic App Context
Modified `build_app_context()` to:
- Call `reload_database_config_from_file()` first
- Display the currently selected database in the environment details
- Agent shows user which database they're connected to

### 4. Server-Side Refresh
Updated `database_config_endpoint` in server.py to:
- Reload MCP server connections (already done) ✓
- **NEW**: Also refresh agent's memory immediately
- Update agent's schema memory based on new config
- Call `refresh_combined_memory()` to ensure changes take effect

## Data Flow for Dynamic Database Switching

```
USER CHANGES DATABASE IN UI
│
├─ Saves config to database_config.json
│
└─ POST /api/database-config
   │
   ├─ Update database_config.json
   │
   ├─ Reload MCP Server:
   │  ├─ Invalidate config cache
   │  ├─ Close old connections
   │  ├─ Initialize new PostgreSQL connection
   │  └─ Initialize new Snowflake connection
   │
   └─ Refresh Agent Memory:
      ├─ Call agent.reload_database_config_from_file()
      ├─ Call agent.build_db_schema_memory()
      ├─ Update agent.db_schema_memory
      └─ Call refresh_combined_memory()

USER STARTS NEW CONVERSATION
│
└─ POST /api/chat
   │
   └─ build_runtime_memory() called:
      ├─ reload_database_config_from_file() loads latest config from JSON
      ├─ build_db_schema_memory() fetches schema from selected database
      ├─ build_app_context() shows selected database to user
      └─ Agent has full knowledge of selected database
```

## Code Changes Summary

### agent/chatbot/agent.py
```python
# NEW: Import database config module
from chatbot.database_config import load_database_config

# NEW: Function to reload config from file
def reload_database_config_from_file():
    """Reload the agent's database configuration from the saved config file."""
    global current_database_config
    config = load_database_config()
    # Extract PostgreSQL config and update current_database_config
    # Build connection string with loaded values

# MODIFIED: build_app_context()
def build_app_context():
    reload_database_config_from_file()  # Load fresh config
    # Rest of function uses reloaded config

# MODIFIED: build_runtime_memory()
def build_runtime_memory() -> str:
    reload_database_config_from_file()  # Load fresh config
    current_schema_memory_data = build_db_schema_memory()  # Get schema from NEW database
    # Build memory with fresh schema
```

### agent/chatbot/server.py
```python
# In database_config_endpoint POST handler:

if success:
    # Reinitialize MCP server
    mcp_server.invalidate_config_cache()
    mcp_server.initialize_postgresql_connection()
    mcp_server.initialize_snowflake_connection()
    
    # NEW: Also refresh agent memory
    agent_module = get_agent_module()
    agent_module.reload_database_config_from_file()
    agent_module.db_schema_memory_data = agent_module.build_db_schema_memory()
    agent_module.db_schema_memory = f"DATABASE_SCHEMA:{agent_module.db_schema_memory_data}"
    refresh_combined_memory()
    
    return JSONResponse({
        'message': 'Database configuration updated. MCP server connections and agent memory reinitialized.'
    })
```

## Testing the Fix

### Test Scenario 1: Quick Verification
1. Go to Database Config page
2. Change PostgreSQL database from "sales" to "bank_db" (or any other database)
3. Click Save
4. Open a new conversation
5. Ask agent: "What tables are in this database?"
6. **Expected**: Agent shows tables from bank_db, not sales

### Test Scenario 2: Run Automated Test
```bash
cd agent
python test_agent_config_reload.py
```

This test verifies:
- Agent loads first database config
- Agent switches to second database when config changes
- Agent rebuilds schema for new database
- Multiple config switches work correctly

### Test Scenario 3: Manual Verification
```bash
cd agent

# Check that config is being loaded correctly
python -m chatbot.verify_config

# Check that MCP server is connected to right database
python -m chatbot.verify_config
# Look for: "PostgreSQL Database: [your-new-database]"
```

## Debugging Checklist

### Agent Not Using New Database
**Symptom**: Still getting results from old database after config change

**Fixes to try**:
1. Verify config file was saved: `cat agent/config/database_config.json`
2. Check that new database exists: `psql -l` (show all databases)
3. Verify agent can connect to new database manually in terminal
4. Check server logs for `Agent memory refreshed with new database configuration`
5. Check agent logs for `Agent config reloaded from file: database=...`

### Agent Shows Wrong Database in App Context
**Symptom**: Agent says it's connected to "sales" but you selected "bank_db"

**Check**:
1. `reload_database_config_from_file()` is being called in `build_app_context()`
2. Config file has correct database name
3. Server logs show `Agent config reloaded from file`

### Schema Memory Not Updated
**Symptom**: Agent lists tables from old database in schema memory

**Check**:
1. `build_db_schema_memory()` is called with reloaded config
2. Fresh config is being used (check `current_database_config` in agent.py)
3. Connection to new database is successful

## Key Implementation Details

### Why Two Reload Points?
1. **database_config_endpoint** - Provides immediate feedback when user saves config
2. **build_runtime_memory()** - Ensures every new conversation uses latest config

This provides redundancy: even if the endpoint refresh fails, the next conversation will still load the correct config.

### Why reload_database_config_from_file()?
Instead of just using what's in `current_database_config` global, we explicitly load from the saved JSON file because:
- Ensures we always have the latest saved values
- Works even if agent was never synced through database explorer
- Survives app restarts (config is persistent in JSON)
- Single source of truth is the JSON file

### Connection String Building
`reload_database_config_from_file()` builds the connection string from individual config fields:
```python
connection_string = (
    f"dbname={dbname} "
    f"user={user} "
    f"password={password} "
    f"host={host} "
    f"port={port}"
)
```

This is used by `build_db_schema_memory()` to connect to the correct database.

## Performance Considerations

- `reload_database_config_from_file()` reads a small JSON file - negligible overhead
- `build_db_schema_memory()` queries PostgreSQL schema - takes a few hundred ms
- This only happens at the start of each conversation, not per-message
- Caching opportunities exist if performance becomes an issue

## Future Improvements

1. **Cache schema between conversations** if the database doesn't change
2. **Add schema caching** with TTL to avoid querying schema on every conversation
3. **Support multiple databases** with quick switching
4. **Validate credentials** before saving config
5. **Encrypt stored credentials** in JSON file

## Summary

The agent now dynamically reloads its database configuration at the start of each conversation, ensuring it always works with the database the user selected in the Database Config page. Both the MCP server (for query execution) and the agent (for schema understanding) are synchronized with the user's selection.
