"""
Debug script to verify database configuration is being loaded correctly.
Run this to check if the config is being read from database_config.json
"""

import sys
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from chatbot.database_config import (
    load_database_config,
    get_postgresql_config,
    get_snowflake_config,
    CONFIG_FILE,
)

def print_section(title):
    """Print a section header."""
    print("\n" + "="*60)
    print(f"  {title}")
    print("="*60)

def main():
    print_section("DATABASE CONFIGURATION VERIFICATION")
    
    # Check if config file exists
    print(f"\n✓ Config file path: {CONFIG_FILE}")
    print(f"✓ Config file exists: {CONFIG_FILE.exists()}")
    
    if CONFIG_FILE.exists():
        print(f"✓ Config file size: {CONFIG_FILE.stat().st_size} bytes")
    
    # Load and display config
    print_section("LOADED CONFIGURATION")
    config = load_database_config()
    
    print("\n📊 PostgreSQL Configuration:")
    pg_config = config.get("postgresql", {})
    print(f"   Host:     {pg_config.get('host', 'N/A')}")
    print(f"   Port:     {pg_config.get('port', 'N/A')}")
    print(f"   User:     {pg_config.get('user', 'N/A')}")
    print(f"   Database: {pg_config.get('dbname', 'N/A')}")
    print(f"   Password: {'*' * len(pg_config.get('password', ''))}")
    
    print("\n☁️  Snowflake Configuration:")
    sf_config = config.get("snowflake", {})
    print(f"   Account:   {sf_config.get('account', 'N/A')}")
    print(f"   User:      {sf_config.get('user', 'N/A')}")
    print(f"   Warehouse: {sf_config.get('warehouse', 'N/A')}")
    print(f"   Database:  {sf_config.get('database', 'N/A')}")
    print(f"   Schema:    {sf_config.get('schema', 'N/A')}")
    print(f"   Key Path:  {sf_config.get('key_path', 'N/A')}")
    
    # Test connection functions
    print_section("INDIVIDUAL CONFIG GETTERS")
    
    pg_config_direct = get_postgresql_config()
    print(f"\n✓ PostgreSQL Database: {pg_config_direct.get('dbname', 'N/A')}")
    
    sf_config_direct = get_snowflake_config()
    print(f"✓ Snowflake Database:  {sf_config_direct.get('database', 'N/A')}")
    
    # Test MCP Server
    print_section("MCP SERVER STATUS")
    try:
        import mcp_server
        print("✓ MCP Server module imported successfully")
        
        # Check connection status
        print(f"✓ PostgreSQL connection initialized: {mcp_server.pg_conn is not None}")
        print(f"✓ Snowflake connection initialized:  {mcp_server.conn is not None}")
        
        if mcp_server.POSTGRES_CONNECTION_ERROR:
            print(f"✗ PostgreSQL Error: {mcp_server.POSTGRES_CONNECTION_ERROR}")
        else:
            print("✓ PostgreSQL connection OK")
        
        if mcp_server.SNOWFLAKE_CONNECTION_ERROR:
            print(f"✗ Snowflake Error: {mcp_server.SNOWFLAKE_CONNECTION_ERROR}")
        else:
            print("✓ Snowflake connection OK")
            
    except ImportError as e:
        print(f"✗ Could not import mcp_server: {e}")
    except Exception as e:
        print(f"✗ Error checking MCP server: {e}")
    
    print_section("✅ VERIFICATION COMPLETE")
    print("\nIf PostgreSQL Database shows 'sales' instead of 'bank_db',")
    print("the configuration is being loaded correctly from database_config.json!")
    print()

if __name__ == "__main__":
    main()
