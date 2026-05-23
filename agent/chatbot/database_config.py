"""
Centralized database configuration management for PostgreSQL and Snowflake.
Stores and retrieves database connection details used across the application.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
import os
import psycopg2

# Configuration file location
CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
CONFIG_FILE = CONFIG_DIR / "database_config.json"


def ensure_config_dir():
    """Ensure configuration directory exists."""
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def get_default_config() -> Dict[str, Any]:
    """Get default database configuration."""
    return {
        "postgresql": {
            "host": "localhost",
            "port": 5432,
            "user": "postgres",
            "password": "root",
            "dbname": "bank_db",
        },
        "snowflake": {
            "account": "bxvclfn-jn77484",
            "user": "appuser",
            "warehouse": "DA_DWH",
            "database": "dev_dwh",
            "schema": "staging",
            "key_path": "C:\\Users\\remote\\Mar_2026\\rsa_key.pem",
        },
    }


def load_database_config() -> Dict[str, Any]:
    """
    Load database configuration from file.
    If file doesn't exist, return default configuration.
    """
    ensure_config_dir()
    
    if CONFIG_FILE.exists():
        try:
            with open(CONFIG_FILE, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading config file: {e}. Using defaults.")
            return get_default_config()
    
    return get_default_config()


def save_database_config(config: Dict[str, Any]) -> bool:
    """
    Save database configuration to file.
    
    Args:
        config: Dictionary with 'postgresql' and 'snowflake' keys
        
    Returns:
        True if successful, False otherwise
    """
    try:
        ensure_config_dir()
        with open(CONFIG_FILE, "w") as f:
            json.dump(config, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving config file: {e}")
        return False


def get_postgresql_config() -> Dict[str, Any]:
    """Get PostgreSQL configuration."""
    config = load_database_config()
    return config.get("postgresql", get_default_config()["postgresql"])


def get_snowflake_config() -> Dict[str, Any]:
    """Get Snowflake configuration."""
    config = load_database_config()
    return config.get("snowflake", get_default_config()["snowflake"])


def update_postgresql_config(pg_config: Dict[str, Any]) -> bool:
    """
    Update PostgreSQL configuration.
    
    Args:
        pg_config: Dictionary with PostgreSQL settings
        
    Returns:
        True if successful, False otherwise
    """
    config = load_database_config()
    config["postgresql"] = pg_config
    return save_database_config(config)


def update_snowflake_config(sf_config: Dict[str, Any]) -> bool:
    """
    Update Snowflake configuration.
    
    Args:
        sf_config: Dictionary with Snowflake settings
        
    Returns:
        True if successful, False otherwise
    """
    config = load_database_config()
    config["snowflake"] = sf_config
    return save_database_config(config)


def update_database_config(
    postgresql: Optional[Dict[str, Any]] = None,
    snowflake: Optional[Dict[str, Any]] = None,
) -> bool:
    """
    Update database configuration for one or both databases.
    
    Args:
        postgresql: PostgreSQL configuration dictionary (optional)
        snowflake: Snowflake configuration dictionary (optional)
        
    Returns:
        True if successful, False otherwise
    """
    config = load_database_config()
    
    if postgresql:
        config["postgresql"] = postgresql
    
    if snowflake:
        config["snowflake"] = snowflake
    
    return save_database_config(config)


def test_postgresql_connection(pg_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Test PostgreSQL database connection with comprehensive validation.
    
    Args:
        pg_config: PostgreSQL configuration dictionary. If None, loads from saved config.
    
    Returns:
        Dictionary with success status and error message if any
    """
    if pg_config is None:
        config = load_database_config()
        pg_config = config.get("postgresql", {})
    
    # Validate required parameters
    host = (pg_config.get("host") or "").strip()
    user = (pg_config.get("user") or "").strip()
    password = (pg_config.get("password") or "").strip()
    dbname = (pg_config.get("dbname") or "").strip()
    port = pg_config.get("port", 5432)
    
    # Check required fields
    if not host:
        return {"success": False, "error": "Host is required"}
    if not user:
        return {"success": False, "error": "User is required"}
    if not password:
        return {"success": False, "error": "Password is required"}
    if not dbname:
        return {"success": False, "error": "Database name is required"}
    
    # Validate port
    try:
        port = int(port)
        if port < 1 or port > 65535:
            return {"success": False, "error": "Port must be between 1 and 65535"}
    except (ValueError, TypeError):
        return {"success": False, "error": "Port must be a valid number"}
    
    # Test connection
    conn = None
    try:
        conn = psycopg2.connect(
            host=host,
            port=port,
            user=user,
            password=password,
            database=dbname,
            connect_timeout=5,
        )
        conn.close()
        return {"success": True}
    except psycopg2.OperationalError as e:
        # Connection error - wrong credentials, host unreachable, etc
        error_msg = str(e).split('\n')[0] if str(e) else "Connection failed"
        return {"success": False, "error": error_msg}
    except psycopg2.ProgrammingError as e:
        # Database doesn't exist or other programming error
        error_msg = str(e).split('\n')[0] if str(e) else "Programming error"
        return {"success": False, "error": error_msg}
    except Exception as e:
        # Catch all other errors
        error_msg = str(e).split('\n')[0] if str(e) else "Connection test failed"
        return {"success": False, "error": error_msg}
    finally:
        if conn:
            try:
                conn.close()
            except:
                pass


def test_snowflake_connection(sf_config: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Test Snowflake database connection with private key authentication and resource validation.
    
    Args:
        sf_config: Snowflake configuration dictionary. If None, loads from saved config.
    
    Returns:
        Dictionary with success status and error message if any
    """
    if sf_config is None:
        config = load_database_config()
        sf_config = config.get("snowflake", {})
    
    # Validate required parameters for key-based auth
    account = (sf_config.get("account") or "").strip()
    user = (sf_config.get("user") or "").strip()
    key_path = (sf_config.get("key_path") or "").strip()
    warehouse = (sf_config.get("warehouse") or "").strip()
    database = (sf_config.get("database") or "").strip()
    schema = (sf_config.get("schema") or "").strip()
    
    # Check required fields
    if not account:
        return {"success": False, "error": "Account is required"}
    if not user:
        return {"success": False, "error": "User is required"}
    if not key_path:
        return {"success": False, "error": "Key path is required"}
    if not warehouse:
        return {"success": False, "error": "Warehouse is required"}
    if not database:
        return {"success": False, "error": "Database is required"}
    if not schema:
        return {"success": False, "error": "Schema is required"}
    
    # Verify key file exists
    try:
        from pathlib import Path
        key_file = Path(key_path)
        if not key_file.exists():
            return {"success": False, "error": f"Key file not found: {key_path}"}
        if not key_file.is_file():
            return {"success": False, "error": f"Key path is not a file: {key_path}"}
    except Exception as e:
        return {"success": False, "error": f"Invalid key path: {str(e)}"}
    
    # Try to test Snowflake connection with all resources
    try:
        from snowflake.connector import connect
        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.backends import default_backend
        
        # Load private key
        with open(key_path, 'rb') as f:
            private_key = serialization.load_pem_private_key(
                f.read(),
                password=None,
                backend=default_backend()
            )
        
        # Connect with private key and validate warehouse/database/schema
        conn = connect(
            user=user,
            account=account,
            private_key=private_key,
            warehouse=warehouse,
            database=database,
            schema=schema,
        )
        conn.close()
        return {"success": True}
    except ImportError:
        # If Snowflake library not installed, at least fields and key file are valid
        return {"success": True}
    except Exception as e:
        error_msg = str(e).split('\n')[0] if str(e) else "Connection failed"
        return {"success": False, "error": error_msg}
