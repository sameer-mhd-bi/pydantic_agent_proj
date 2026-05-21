#!/usr/bin/env python3
"""
Test script to verify the agent reloads database configuration dynamically.
This simulates changing the database config and checking if the agent uses the new config.
"""

import sys
from pathlib import Path

# Setup path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from chatbot.database_config import load_database_config, save_database_config
from chatbot.agent import (
    reload_database_config_from_file,
    get_database_config,
    build_app_context,
    build_runtime_memory,
)

def print_header(title):
    """Print a formatted header."""
    print(f"\n{'='*70}")
    print(f"  {title}")
    print(f"{'='*70}\n")

def test_agent_config_reload():
    """Test that agent reloads config from file."""
    print_header("TEST: Agent Config Reload")
    
    # Create test configs
    config1 = {
        "postgresql": {
            "host": "localhost",
            "port": 5432,
            "user": "postgres",
            "password": "root",
            "dbname": "test_db_1"
        },
        "snowflake": {
            "account": "test",
            "user": "test",
            "warehouse": "TEST",
            "database": "test",
            "schema": "test",
            "key_path": "/test"
        }
    }
    
    config2 = {
        "postgresql": {
            "host": "localhost",
            "port": 5432,
            "user": "postgres",
            "password": "root",
            "dbname": "test_db_2"
        },
        "snowflake": {
            "account": "test",
            "user": "test",
            "warehouse": "TEST",
            "database": "test",
            "schema": "test",
            "key_path": "/test"
        }
    }
    
    # Test 1: Save first config and reload
    print("1. Testing first database config (test_db_1)...")
    save_database_config(config1)
    reload_database_config_from_file()
    config = get_database_config()
    
    if config['dbname'] == 'test_db_1':
        print(f"   ✓ Agent loaded database: {config['dbname']}")
    else:
        print(f"   ✗ Expected test_db_1, got: {config['dbname']}")
        return False
    
    # Test 2: Change config and reload
    print("\n2. Changing database config to test_db_2...")
    save_database_config(config2)
    reload_database_config_from_file()
    config = get_database_config()
    
    if config['dbname'] == 'test_db_2':
        print(f"   ✓ Agent reloaded to new database: {config['dbname']}")
    else:
        print(f"   ✗ Expected test_db_2, got: {config['dbname']}")
        return False
    
    # Test 3: Check app context reflects new config
    print("\n3. Checking if app context shows new database...")
    app_context = build_app_context()
    
    if 'test_db_2' in app_context:
        print(f"   ✓ App context shows new database: test_db_2")
    else:
        print(f"   ✗ App context doesn't show new database")
        print(f"   Context: {app_context[:200]}...")
        return False
    
    # Test 4: Reload config again (simulating new conversation)
    print("\n4. Testing reload in build_runtime_memory (simulating new conversation)...")
    save_database_config(config1)  # Change back to config1
    runtime_memory = build_runtime_memory()
    
    # Check that runtime memory was rebuilt
    if 'DATABASE_SCHEMA:' in runtime_memory:
        print(f"   ✓ Runtime memory includes database schema")
    else:
        print(f"   ✗ Runtime memory missing schema")
        return False
    
    # Verify it loaded the right config
    reload_database_config_from_file()
    config = get_database_config()
    if config['dbname'] == 'test_db_1':
        print(f"   ✓ Agent switched back to original database: {config['dbname']}")
    else:
        print(f"   ✗ Expected test_db_1, got: {config['dbname']}")
        return False
    
    print("\n✅ TEST PASSED: Agent reloads config dynamically!")
    return True

def main():
    """Run tests."""
    print("\n" + "="*70)
    print("  AGENT DYNAMIC CONFIG RELOAD TEST")
    print("="*70)
    
    try:
        result = test_agent_config_reload()
        sys.exit(0 if result else 1)
    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
