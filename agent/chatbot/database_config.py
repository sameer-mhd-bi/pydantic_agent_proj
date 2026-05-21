"""
Centralized database configuration management for PostgreSQL and Snowflake.
Stores and retrieves database connection details used across the application.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional
import os

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
