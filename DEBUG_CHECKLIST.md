# Configuration Debugging Checklist

## Quick Start
If the MCP server is still using hardcoded defaults instead of your saved config:

### 1. Verify Config File Exists
```bash
# Check if config file exists
dir agent\config\database_config.json

# Or on Linux/Mac
ls -la agent/config/database_config.json
```

**Expected**: File should exist with your saved database names visible when opened.

### 2. Run Verification Script
```bash
cd agent
python -m chatbot.verify_config
```

**Expected Output**:
```
✓ PostgreSQL Database: sales    (or whatever you saved)
✓ Snowflake Database:  dev_dwh  (or whatever you saved)
✓ PostgreSQL connection initialized: True
✓ Snowflake connection initialized:  True
```

**Problem**: If it shows `bank_db` instead of `sales`, the config isn't loading from JSON.

### 3. Check MCP Server Logs
When you save config, check the terminal for:
```
[INFO] Initializing PostgreSQL connection to postgres@localhost:5432 database=sales
[INFO] PostgreSQL connection initialized successfully.
```

**Problem**: If it shows `database=bank_db`, the old config is still being used.

### 4. Verify API Endpoint Works
```bash
# Get current config
curl http://localhost:8000/api/database-config

# Should return JSON with your saved config
```

### 5. Test the Flow
1. Open database-config page
2. Change a value (e.g., PostgreSQL port from 5432 to 5433)
3. Click Save
4. Check logs for "Initializing PostgreSQL connection" message
5. Port should be 5433 in the log

## Common Issues & Fixes

### Issue: Config not loading from JSON
**Symptom**: Always uses defaults (bank_db, localhost:5432)

**Fix**: Make sure `initialize_postgresql_connection()` and `initialize_snowflake_connection()` are being called AFTER config is saved.

**Check**: Line in `server.py` should have:
```python
mcp_server.invalidate_config_cache()
mcp_server.initialize_postgresql_connection()
mcp_server.initialize_snowflake_connection()
```

### Issue: Changes don't take effect after save
**Symptom**: Save appears to work, but connections still use old values

**Fix**: Check that both init functions are actually being called:
1. Add `print()` statements to verify functions run
2. Check server logs for "Initializing" messages
3. Ensure no exceptions are preventing reinit

### Issue: "FileNotFoundError" for Snowflake key
**Symptom**: Error when initializing Snowflake connection

**Fix**: 
1. Check the key_path in database_config.json
2. Make sure file exists at that location
3. Ensure Python process has read permissions
4. Use absolute path instead of relative path

### Issue: PostgreSQL connection fails after save
**Symptom**: Error message about connection refused

**Fix**:
1. Verify PostgreSQL server is running on the configured host:port
2. Check credentials (user, password) are correct
3. Check database name exists: `psql -l`
4. Check pg_hba.conf allows connections from your host

## Code Location Reference

| What | Where |
|------|-------|
| Config loading | `agent/chatbot/database_config.py` |
| Save endpoint | `agent/chatbot/server.py` line ~680 |
| Init functions | `agent/mcp_server.py` lines 65-120 |
| Config storage | `agent/config/database_config.json` |
| UI page | `src/components/database-config-page.tsx` |

## Debug Commands

```python
# Test config loading directly
from chatbot.database_config import load_database_config
config = load_database_config()
print(config["postgresql"]["dbname"])  # Should show "sales"

# Test from mcp_server
import mcp_server
print(f"Database: {mcp_server.pg_conn.info}")  # Shows connection details
```

## Still Having Issues?

1. **Clear browser cache** - Ctrl+Shift+Delete (might be showing cached old config)
2. **Restart server** - Old connections might be cached in Python process
3. **Check logs** - Full error details in terminal where server runs
4. **Verify file permissions** - Config file should be readable/writable
5. **Run verification script** - Shows exactly what's being loaded
