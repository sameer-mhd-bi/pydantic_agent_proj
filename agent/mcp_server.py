from mcp.server.fastmcp import FastMCP
import asyncio
import psycopg2
from psycopg2 import sql
import functools
import inspect
import json
from snowflake.connector import errors as snowflake_errors
from cryptography.hazmat.primitives import serialization
import petl as etl
import snowflake.connector
from datetime import UTC, datetime
from pathlib import Path
import logging
import sys

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent))

from chatbot.database_config import (
    get_postgresql_config,
    get_snowflake_config,
    load_database_config,
)

# Configure root logger to log to stdout
logging.basicConfig(
    level=logging.INFO,  # change to DEBUG for more verbose logs
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s",
)
logger = logging.getLogger("mcp_server")


def log_tool_call(func):
    """
    Decorator to log MCP tool invocations and responses.

    Logs:
    - Tool name and arguments on entry.
    - Status or error from the tool on exit.
    """
    if inspect.iscoroutinefunction(func):
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            logger.info(
                "Tool called: %s args=%s kwargs=%s",
                func.__name__,
                args,
                kwargs,
            )
            result = await func(*args, **kwargs)
            result_preview = (
                result[:1000] + "...(truncated)"
                if isinstance(result, str) and len(result) > 1000
                else result
            )
            logger.info(
                "Tool response from %s: %s",
                func.__name__,
                result_preview,
            )
            return result

        return async_wrapper

    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        logger.info(
            "Tool called: %s args=%s kwargs=%s",
            func.__name__,
            args,
            kwargs,
        )
        result = func(*args, **kwargs)
        # Truncate very large responses for readability
        result_preview = (
            result[:1000] + "...(truncated)"
            if isinstance(result, str) and len(result) > 1000
            else result
        )
        logger.info(
            "Tool response from %s: %s",
            func.__name__,
            result_preview,
        )
        return result

    return wrapper


# Global variables for connections
conn = None
pg_conn = None
SNOWFLAKE_CONNECTION_ERROR = None
POSTGRES_CONNECTION_ERROR = None
_config_cache = None
_last_config_hash = None


def get_config_hash():
    """Get hash of current config file to detect changes."""
    from chatbot.database_config import CONFIG_FILE
    import hashlib
    try:
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE, 'rb') as f:
                return hashlib.md5(f.read()).hexdigest()
    except Exception:
        pass
    return None


def get_cached_config():
    """Get cached config, reload if None."""
    global _config_cache
    if _config_cache is None:
        from chatbot.database_config import load_database_config
        _config_cache = load_database_config()
        logger.info("Loaded database configuration from file")
    return _config_cache


def invalidate_config_cache():
    """Invalidate the config cache to force reload next time."""
    global _config_cache
    _config_cache = None
    logger.info("Config cache invalidated, will reload on next access")


def check_and_reinitialize_connections():
    """Check if config has changed and reinitialize connections if needed."""
    global _last_config_hash
    current_hash = get_config_hash()
    
    if current_hash is None:
        return  # Can't determine if changed
    
    if _last_config_hash != current_hash:
        logger.info("Config file changed detected, reinitializing connections...")
        invalidate_config_cache()
        initialize_postgresql_connection()
        initialize_snowflake_connection()
        _last_config_hash = current_hash


def initialize_snowflake_connection():
    """Initialize Snowflake connection with current configuration."""
    global conn, SNOWFLAKE_CONNECTION_ERROR
    
    # Close existing connection if any
    if conn is not None:
        try:
            conn.close()
            logger.info("Closed existing Snowflake connection")
        except Exception as e:
            logger.warning("Error closing existing Snowflake connection: %s", e)
    
    conn = None
    SNOWFLAKE_CONNECTION_ERROR = None
    
    try:
        # Always load fresh config, bypass cache
        from chatbot.database_config import load_database_config as load_fresh_config
        config = load_fresh_config()
        sf_config = config.get("snowflake", {})
        
        key_path = sf_config.get("key_path", "C:\\Users\\remote\\Mar_2026\\rsa_key.pem")
        account = sf_config.get("account", "bxvclfn-jn77484")
        user = sf_config.get("user", "appuser")
        warehouse = sf_config.get("warehouse", "DA_DWH")
        database = sf_config.get("database", "dev_dwh")
        schema = sf_config.get("schema", "staging")
        
        logger.info("Initializing Snowflake connection with account=%s user=%s database=%s schema=%s", 
                   account, user, database, schema)
        
        with Path(key_path).open("rb") as key_file:
            p_key = serialization.load_pem_private_key(
                key_file.read(),
                password=None,
            )

        pkb = p_key.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )

        conn = snowflake.connector.connect(
            user=user,
            account=account,
            private_key=pkb,
            warehouse=warehouse,
            database=database,
            schema=schema,
            login_timeout=30,  # 30 second login timeout
            network_timeout=60,  # 60 second network timeout
            socket_timeout=60,  # 60 second socket timeout
        )
        logger.info("Snowflake connection initialized successfully.")
    except (FileNotFoundError, ValueError, TypeError, snowflake_errors.Error) as e:
        SNOWFLAKE_CONNECTION_ERROR = f"Failed to initialize Snowflake connection: {e!s}"
        logger.error(SNOWFLAKE_CONNECTION_ERROR)


def initialize_postgresql_connection():
    """Initialize PostgreSQL connection with current configuration."""
    global pg_conn, POSTGRES_CONNECTION_ERROR
    
    # Close existing connection if any
    if pg_conn is not None:
        try:
            pg_conn.close()
            logger.info("Closed existing PostgreSQL connection")
        except Exception as e:
            logger.warning("Error closing existing PostgreSQL connection: %s", e)
    
    pg_conn = None
    POSTGRES_CONNECTION_ERROR = None
    
    try:
        # Always load fresh config, bypass cache
        from chatbot.database_config import load_database_config as load_fresh_config
        config = load_fresh_config()
        pg_config = config.get("postgresql", {})
        
        db_name = pg_config.get("dbname", "bank_db")
        user = pg_config.get("user", "postgres")
        password = pg_config.get("password", "root")
        host = pg_config.get("host", "localhost")
        port = pg_config.get("port", 5432)
        
        logger.info("="*60)
        logger.info("INITIALIZING PostgreSQL: database=%s host=%s port=%d user=%s", 
                   db_name, host, port, user)
        logger.info("="*60)
        
        pg_conn = psycopg2.connect(
            dbname=db_name,
            user=user,
            password=password,
            host=host,
            port=port,
        )
        pg_conn.autocommit = True
        logger.info("PostgreSQL connection SUCCESS - now connected to database: %s", db_name)
    except psycopg2.Error as e:
        POSTGRES_CONNECTION_ERROR = f"Failed to initialize PostgreSQL connection: {e!s}"
        logger.error(POSTGRES_CONNECTION_ERROR)


# Initialize connections on startup (will load from config file)
logger.info("MCP Server starting up, initializing database connections...")
initialize_snowflake_connection()
initialize_postgresql_connection()
# Initialize config hash tracking for detecting changes
_last_config_hash = get_config_hash()
logger.info("Config monitoring initialized. Current config hash: %s", _last_config_hash)
#-------------------

app = FastMCP()

@app.tool()
@log_tool_call
def execute_query_postgres(query: str) -> str:
    """
    Execute a SQL statement against PostgreSQL.

    - Intended primarily for SELECT queries.
    - Returns JSON array of rows for queries with a result set.
    - For queries without a result set, returns a status message.
    """
    # Reinitialize connections if config has changed
    check_and_reinitialize_connections()
    
    if POSTGRES_CONNECTION_ERROR:
        return json.dumps(
            {"error": POSTGRES_CONNECTION_ERROR},
            indent=2,
        )
    
    if pg_conn is None:
        return json.dumps(
            {"error": "PostgreSQL connection is not initialized."},
            indent=2,
        )
    
    try:
        # Log which database we're querying
        db_name = pg_conn.get_dsn_parameters().get('dbname', 'unknown')
        logger.info("="*60)
        logger.info("EXECUTING query on PostgreSQL database: %s", db_name)
        logger.info("Query: %s", query[:200])
        logger.info("="*60)
        
        with pg_conn.cursor() as cur:
            cur.execute(query)

            # If no result set (e.g., INSERT/UPDATE/DDL), description is None
            if cur.description is None:
                return json.dumps(
                    {
                        "status": "Query executed successfully.",
                        "rowcount": cur.rowcount,
                    },
                    indent=2,
                )

            colnames = [desc[0] for desc in cur.description]
            rows = cur.fetchall()
            data = [dict(zip(colnames, row)) for row in rows]

        return json.dumps(data, indent=2, default=str)
    

    except psycopg2.ProgrammingError as e:
        logger.error("PostgreSQL programming error: %s", e)
        return json.dumps(
            {
                "error": "PostgreSQL programming error",
                "message": str(e),
            },
            indent=2,
        )
    except psycopg2.Error as e:
        logger.error("PostgreSQL error: %s", e)
        return json.dumps(
            {
                "error": "PostgreSQL error",
                "message": str(e),
            },
            indent=2,
        )
    except Exception as e:
        logger.error("Unexpected error while executing PostgreSQL query: %s", e)
        return json.dumps(
            {
                "error": "Unexpected error while executing PostgreSQL query",
                "message": str(e),
            },
            indent=2,
        )
@app.tool()
@log_tool_call
def execute_query_snowflake(query: str) -> str:
    """
    Execute a SQL statement against Snowflake.

    - For SELECT queries, returns JSON array of rows.
    - For DDL/DML queries (no result set), returns a status message.
    """
    # Reinitialize connections if config has changed
    check_and_reinitialize_connections()
    
    logger.info("Executing Snowflake query: %s", query)
    if SNOWFLAKE_CONNECTION_ERROR:
        return json.dumps(
            {"error": SNOWFLAKE_CONNECTION_ERROR},
            indent=2,
        )

    if conn is None:
        return json.dumps(
            {"error": "Snowflake connection is not initialized."},
            indent=2,
        )

    try:
        cursors = conn.execute_string(query)
        if not cursors:
            return json.dumps(
                {"status": "Query executed, no cursors returned."},
                indent=2,
            )

        main_cursor = cursors[0]

        # If the statement does not produce a result set (e.g., DDL/DML),
        # description is None
        if main_cursor.description is None:
            return json.dumps(
                {
                    "status": "Query executed successfully.",
                    "rowcount": main_cursor.rowcount,
                },
                indent=2,
            )

        # Build column names and row dicts
        colnames = [desc[0] for desc in main_cursor.description]
        rows = main_cursor.fetchall()
        data = [dict(zip(colnames, row)) for row in rows]

        return json.dumps(data, indent=2, default=str)

    except snowflake_errors.ProgrammingError as e:
        logger.error("Snowflake programming error: %s", e)
        return json.dumps(
            {
                "error": "Snowflake programming error",
                "message": str(e),
            },
            indent=2,
        )
    except snowflake_errors.Error as e:
        logger.error("Snowflake error: %s", e)
        return json.dumps(
            {
                "error": "Snowflake error",
                "message": str(e),
            },
            indent=2,
        )
    except Exception as e:
        logger.error("Unexpected error while executing Snowflake query: %s", e)
        return json.dumps(
            {
                "error": "Unexpected error while executing Snowflake query",
                "message": str(e),
            },
            indent=2,
        )
    

# -------------------------------------------------------------------------
# TYPE MAPPING (Postgres → Snowflake)
# -------------------------------------------------------------------------
def map_pg_to_snowflake_type(pg_type: str) -> str:
    pg_type = pg_type.lower()

    mapping = {
        "integer": "INTEGER",
        "bigint": "BIGINT",
        "smallint": "SMALLINT",
        "text": "TEXT",
        "varchar": "VARCHAR",
        "character varying": "VARCHAR",
        "boolean": "BOOLEAN",
        "date": "DATE",
        "timestamp": "TIMESTAMP",
        "numeric": "NUMBER",
        "double precision": "FLOAT",
    }

    return mapping.get(pg_type, "TEXT")  # fallback


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def open_postgresql_connection(database_name: str | None = None):
    config = load_database_config()
    pg_config = config.get("postgresql", {})
    connection = psycopg2.connect(
        dbname=database_name or pg_config.get("dbname", "bank_db"),
        user=pg_config.get("user", "postgres"),
        password=pg_config.get("password", "root"),
        host=pg_config.get("host", "localhost"),
        port=pg_config.get("port", 5432),
    )
    connection.autocommit = True
    return connection


def open_snowflake_connection():
    config = load_database_config()
    sf_config = config.get("snowflake", {})

    key_path = sf_config.get("key_path", "C:\\Users\\remote\\Mar_2026\\rsa_key.pem")
    with Path(key_path).open("rb") as key_file:
        p_key = serialization.load_pem_private_key(
            key_file.read(),
            password=None,
        )

    pkb = p_key.private_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )

    return snowflake.connector.connect(
        user=sf_config.get("user", "appuser"),
        account=sf_config.get("account", "bxvclfn-jn77484"),
        private_key=pkb,
        warehouse=sf_config.get("warehouse", "DA_DWH"),
        database=sf_config.get("database", "dev_dwh"),
        schema=sf_config.get("schema", "staging"),
        login_timeout=30,
        network_timeout=60,
        socket_timeout=60,
    )


def record_mcp_migration(source_table: str, target_table: str, rows_migrated: int, columns_count: int = 0):
    """Record a successful tool-based migration to migration-history.json."""
    import json
    
    try:
        # Resolve config/migration-history.json path
        # Prioritize workspace root / config, fallback to ROOT_DIR / config
        from chatbot.database_config import CONFIG_DIR
        # Since database_config has CONFIG_DIR = Path(__file__).resolve().parent.parent / "config"
        # which is agent/config, we can check its parent (workspace root) config dir
        workspace_config_dir = CONFIG_DIR.parent.parent / 'config'
        
        # We will write to both files to keep them perfectly synced!
        history_files = [
            workspace_config_dir / 'migration-history.json',
            CONFIG_DIR / 'migration-history.json'
        ]
        
        for history_file in history_files:
            try:
                # Ensure config dir exists
                history_file.parent.mkdir(parents=True, exist_ok=True)
                
                # Load existing data
                if history_file.exists():
                    try:
                        with open(history_file, 'r') as f:
                            data = json.load(f)
                    except Exception:
                        data = {}
                else:
                    data = {}
                    
                # Initialize default structure if empty
                if not data:
                    data = {
                        'version': '1.0',
                        'lastUpdated': utc_now_iso(),
                        'totalMigrations': 0,
                        'schemasAnalyzed': 0,
                        'tableMigrations': [],
                        'records': []
                    }
                    
                # Get active database names from pg_conn and conn if possible
                source_db = "PostgreSQL"
                target_db = "Snowflake"
                try:
                    if pg_conn is not None:
                        source_db = pg_conn.get_dsn_parameters().get('dbname', 'PostgreSQL')
                except Exception:
                    pass
                try:
                    if conn is not None:
                        target_db = conn.database or "Snowflake"
                except Exception:
                    pass
                    
                timestamp = utc_now_iso()
                
                # Create TableMigrationDetail
                detail = {
                    'tableName': source_table,
                    'sourceDatabase': source_db,
                    'targetDatabase': target_db,
                    'rowsMigrated': rows_migrated,
                    'columnsCount': columns_count,
                    'timestamp': timestamp,
                    'status': 'success'
                }
                
                # Create MigrationRecord
                record = {
                    'id': f"migration-mcp-{int(datetime.now(UTC).timestamp() * 1000)}",
                    'timestamp': timestamp,
                    'userId': 'agent',
                    'userName': 'AI Agent',
                    'schemasCount': 1,
                    'tablesCount': 1,
                    'tables': [detail]
                }
                
                # Sync keys
                if 'records' not in data:
                    data['records'] = data.get('migrations', [])
                if 'tableMigrations' not in data:
                    data['tableMigrations'] = []
                    
                data['records'].append(record)
                data['tableMigrations'].append(detail)
                data['totalMigrations'] = len(data['records'])
                data['schemasAnalyzed'] = data.get('schemasAnalyzed', 0) + 1
                data['lastUpdated'] = timestamp
                
                # Ensure "migrations" key is also synced
                data['migrations'] = data['records']
                
                with open(history_file, 'w') as f:
                    json.dump(data, f, indent=2, default=str)
                    
                logger.info("Recorded successful MCP migration to %s", history_file)
            except Exception as e:
                logger.error("Failed to write migration history to %s: %s", history_file, e)
                
    except Exception as e:
        logger.error("Failed to record successful MCP migration: %s", e)


@app.tool()
@log_tool_call
async def migrate_table_postgres_to_snowflake(
    source_table: str,
    target_table: str,
    csv_path: str = "data_export.csv",
) -> str:
    return await asyncio.to_thread(
        _migrate_table_postgres_to_snowflake_sync,
        source_table,
        target_table,
        csv_path,
    )


def _migrate_table_postgres_to_snowflake_sync(
    source_table: str,
    target_table: str,
    csv_path: str = "data_export.csv",
) -> str:
    
    """
    This function implements a fully automated data migration pipeline that transfers a table from PostgreSQL to Snowflake in a structured, reliable, and validation-driven manner.
    """

    local_pg_conn = None
    local_sf_conn = None
    pg_cursor = None
    sf_cursor = None
    
    try:
        logger.info("=== STARTING MIGRATION: %s -> %s ===", source_table, target_table)
        
        # Validate inputs
        for name, value in (("source_table", source_table), ("target_table", target_table)):
            if not value.replace("_", "").isalnum():
                error_msg = f"Invalid {name}: Only alphanumeric + underscores allowed"
                logger.error(error_msg)
                return json.dumps({"error": error_msg}, indent=2)
        
        # Validate connections are initialized
        if pg_conn is None:
            error_msg = "PostgreSQL connection not initialized"
            logger.error(error_msg)
            return json.dumps({"error": error_msg}, indent=2)
        if conn is None:
            error_msg = "Snowflake connection not initialized"
            logger.error(error_msg)
            return json.dumps({"error": error_msg}, indent=2)

        csv_file = Path(csv_path).resolve()
        csv_file.parent.mkdir(parents=True, exist_ok=True)

        # Use isolated connections inside the worker thread so this tool does not
        # mutate or block the shared MCP server connections that other requests use.
        try:
            local_pg_conn = open_postgresql_connection()
            local_sf_conn = open_snowflake_connection()
            pg_cursor = local_pg_conn.cursor()
            sf_cursor = local_sf_conn.cursor()
            logger.info("Database cursors created successfully")
        except Exception as e:
            error_msg = f"Failed to create cursors: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return json.dumps({"error": error_msg}, indent=2)

        # ============================================================
        # STEP 0 — CHECK SOURCE TABLE SIZE
        # ============================================================
        
        try:
            pg_cursor.execute(f'SELECT COUNT(*) FROM "{source_table}"')
            table_row_count = pg_cursor.fetchone()[0]
            logger.info("Source table '%s' contains %d rows", source_table, table_row_count)
            
            if table_row_count > 1000000:
                logger.warning("Warning: Source table has %d rows - migration may take a long time", table_row_count)
        except Exception as e:
            logger.warning("Could not determine source table size: %s", e)

        # ============================================================
        # STEP 0.5 — CHECK IF TARGET TABLE ALREADY EXISTS IN SNOWFLAKE
        # ============================================================
        
        try:
            check_table_sql = f"""
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_name = '{target_table.upper()}' 
            AND table_schema = 'STAGING'
            """
            sf_cursor.execute(check_table_sql)
            result = sf_cursor.fetchone()
            table_exists = result[0] > 0 if result else False
            
            if table_exists:
                warning_msg = f"Target table '{target_table}' already exists in Snowflake. Migration skipped."
                logger.warning(warning_msg)
                return json.dumps({
                    "status": "SKIPPED",
                    "reason": "Table already present",
                    "message": warning_msg,
                    "source_table": source_table,
                    "target_table": target_table,
                    "action": "No migration performed"
                }, indent=2)
            else:
                logger.info("Target table '%s' does not exist in Snowflake. Proceeding with migration.", target_table)
        except Exception as e:
            logger.warning("Could not check if target table exists: %s. Proceeding with migration attempt.", e)

        # ============================================================
        # STEP 1 — EXTRACT SCHEMA FROM POSTGRES
        # ============================================================

        schema_query = f"""
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '{source_table}'
        ORDER BY ordinal_position;
        """

        try:
            pg_cursor.execute(schema_query)
            columns = pg_cursor.fetchall()

            if not columns:
                error_msg = f"Table '{source_table}' not found in PostgreSQL"
                logger.error(error_msg)
                return json.dumps({"error": error_msg}, indent=2)
            logger.info("Retrieved schema for table: %s (%d columns)", source_table, len(columns))
        except Exception as e:
            error_msg = f"Failed to retrieve schema: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return json.dumps({"error": error_msg}, indent=2)

        # ============================================================
        # STEP 2 — CREATE TABLE IN SNOWFLAKE
        # ============================================================

        column_defs = []
        for col_name, pg_type in columns:
            sf_type = map_pg_to_snowflake_type(pg_type)
            column_defs.append(f"{col_name} {sf_type}")

        create_sql = f"""
        CREATE OR REPLACE TABLE {target_table} (
            {', '.join(column_defs)}
        )
        """

        try:
            logger.info("Creating Snowflake table: %s", target_table)
            sf_cursor.execute(create_sql)
            local_sf_conn.commit()  # Ensure table creation is committed immediately
            logger.info("✓ Table created successfully")
        except Exception as e:
            error_msg = f"Failed to create Snowflake table: {str(e)}"
            logger.error(error_msg, exc_info=True)
            try:
                local_sf_conn.rollback()
            except:
                pass
            return json.dumps({"error": error_msg}, indent=2)

        # ============================================================
        # STEP 3 — EXPORT DATA TO CSV
        # ============================================================

        import csv
        
        try:
            logger.info("Exporting data from PostgreSQL...")
            pg_cursor.execute(f'SELECT * FROM "{source_table}"')
            description = pg_cursor.description
            
            # Write directly to CSV file without using etl library
            # Use streaming approach to avoid memory issues with large tables
            row_count = 0
            with open(csv_file, 'w', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                # Write header
                writer.writerow([desc[0] for desc in description])
                
                # Fetch and write rows in batches
                batch_size = 1000
                while True:
                    rows = pg_cursor.fetchmany(batch_size)
                    if not rows:
                        break
                    writer.writerows(rows)
                    row_count += len(rows)
                    logger.debug("Exported %d rows so far...", row_count)
                
            logger.info("✓ Exported %d rows to CSV: %s", row_count, csv_file)

            if not csv_file.exists() or csv_file.stat().st_size == 0:
                error_msg = "CSV export failed - file is empty or not created"
                logger.error(error_msg)
                return json.dumps({"error": error_msg}, indent=2)
        except Exception as e:
            error_msg = f"Failed to export data to CSV: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return json.dumps({"error": error_msg}, indent=2)

        # ============================================================
        # STEP 4 — UPLOAD TO SNOWFLAKE STAGE
        # ============================================================

        put_sql = f"PUT file://{csv_file} @%{target_table} OVERWRITE=TRUE"
        
        try:
            logger.info("Uploading CSV to Snowflake stage...")
            sf_cursor.execute(put_sql)
            logger.info("✓ File uploaded to stage successfully")
        except Exception as e:
            error_msg = f"Failed to upload to Snowflake stage: {str(e)}"
            logger.error(error_msg, exc_info=True)
            return json.dumps({"error": error_msg}, indent=2)

        # ============================================================
        # STEP 5 — COPY INTO TABLE
        # ============================================================

        copy_sql = f"""
        COPY INTO {target_table}
        FROM @%{target_table}
        FILE_FORMAT = (
            TYPE = CSV
            FIELD_OPTIONALLY_ENCLOSED_BY = '"'
            SKIP_HEADER = 1
        )
        """

        try:
            logger.info("Executing COPY INTO command...")
            sf_cursor.execute(copy_sql)
            local_sf_conn.commit()
            logger.info("✓ COPY INTO completed successfully")
        except Exception as e:
            error_msg = f"Failed during COPY INTO: {str(e)}"
            logger.error(error_msg, exc_info=True)
            local_sf_conn.rollback()
            return json.dumps({"error": error_msg}, indent=2)

        # ============================================================
        # STEP 6 — VALIDATE LOAD
        # ============================================================

        pg_count = 0
        sf_count = 0
        
        try:
            logger.info("Validating row counts...")
            pg_cursor.execute(f'SELECT COUNT(*) FROM "{source_table}"')
            pg_count = pg_cursor.fetchone()[0]

            sf_cursor.execute(f"SELECT COUNT(*) FROM {target_table}")
            sf_count = sf_cursor.fetchone()[0]

            logger.info("✓ Row count validation - PostgreSQL: %d, Snowflake: %d", pg_count, sf_count)
        except Exception as e:
            error_msg = f"Failed to validate row counts: {str(e)}"
            logger.error(error_msg, exc_info=True)
            # Don't fail - just log the warning
            logger.warning("Skipping row count validation due to error")

        # ============================================================
        # STEP 7 — RECORD MIGRATION HISTORY
        # ============================================================

        # try:
        #     record_mcp_migration(
        #         source_table=source_table,
        #         target_table=target_table,
        #         rows_migrated=sf_count,
        #         columns_count=len(columns)
        #     )
        #     logger.info("✓ Migration history recorded")
        # except Exception as e:
        #     logger.warning("Failed to record migration history: %s", e)

        # ============================================================
        # SUCCESS
        # ============================================================
        response = {
            "status": "SUCCESS",
            "source_table": source_table,
            "target_table": target_table,
            "rows_postgres": pg_count,
            "rows_snowflake": sf_count,
            "csv_path": str(csv_file),
            "columns_count": len(columns),
        }
        
        logger.info("✓✓✓ MIGRATION COMPLETED SUCCESSFULLY ✓✓✓")
        logger.info("Migration summary: %s", json.dumps(response, indent=2))
        
        return json.dumps(response, indent=2)

    except snowflake_errors.Error as e:
        error_msg = f"Snowflake error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return json.dumps({"error": error_msg, "type": "snowflake_error"}, indent=2)

    except Exception as e:
        error_msg = f"Unexpected error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return json.dumps({"error": error_msg, "type": "unknown_error"}, indent=2)
    
    finally:
        # Properly close cursors
        if pg_cursor is not None:
            try:
                pg_cursor.close()
                logger.debug("PostgreSQL cursor closed")
            except Exception as e:
                logger.warning("Error closing PostgreSQL cursor: %s", e)
        
        if sf_cursor is not None:
            try:
                sf_cursor.close()
                logger.debug("Snowflake cursor closed")
            except Exception as e:
                logger.warning("Error closing Snowflake cursor: %s", e)
        if local_pg_conn is not None:
            try:
                local_pg_conn.close()
                logger.debug("PostgreSQL connection closed")
            except Exception as e:
                logger.warning("Error closing PostgreSQL connection: %s", e)
        if local_sf_conn is not None:
            try:
                local_sf_conn.close()
                logger.debug("Snowflake connection closed")
            except Exception as e:
                logger.warning("Error closing Snowflake connection: %s", e)
    
@app.tool()
@log_tool_call
def migrate_query_postgres_to_snowflake(
    query: str,
    target_table: str,
    csv_path: str = "query_export.csv",
    create_table: bool = True,
) -> str:
    """
    Executes a dynamic PostgreSQL query, exports the result to CSV,
    creates a matching Snowflake table, loads the data into Snowflake,
    and validates the migration.

    Supports:
    - SELECT queries
    - JOINs
    - Filters
    - Aggregations
    - Aliases

    Example:
        query = '''
            SELECT
                u.id,
                u.name,
                o.total_amount,
                o.created_at
            FROM users u
            JOIN orders o ON u.id = o.user_id
            WHERE o.created_at >= CURRENT_DATE - INTERVAL '30 days'
        '''
    """

    import json
    import re
    from pathlib import Path

    pg_cursor = None
    sf_cursor = None

    try:
        # ============================================================
        # STEP 1 — VALIDATE INPUTS
        # ============================================================

        if not query.strip().lower().startswith("select"):
            return json.dumps(
                {
                    "error": "Only SELECT queries are allowed"
                },
                indent=2,
            )

        if ";" in query.strip().rstrip(";"):
            return json.dumps(
                {
                    "error": "Multiple SQL statements are not allowed"
                },
                indent=2,
            )

        if not re.match(r"^[A-Za-z0-9_]+$", target_table):
            return json.dumps(
                {
                    "error": "Invalid target_table",
                    "message": "Only alphanumeric and underscores allowed",
                },
                indent=2,
            )

        # Validate connections
        if pg_conn is None:
            return json.dumps({"error": "PostgreSQL connection not initialized"}, indent=2)
        if conn is None:
            return json.dumps({"error": "Snowflake connection not initialized"}, indent=2)

        csv_file = Path(csv_path).resolve()
        csv_file.parent.mkdir(parents=True, exist_ok=True)

        # Create cursors once and reuse them
        pg_cursor = pg_conn.cursor()
        sf_cursor = conn.cursor()

        # ============================================================
        # STEP 2 — EXECUTE QUERY & FETCH METADATA
        # ============================================================

        logger.info("Executing dynamic PostgreSQL query")

        pg_cursor.execute(query)

        rows = pg_cursor.fetchall()
        description = pg_cursor.description

        if not description:
            return json.dumps(
                {
                    "error": "Query returned no metadata"
                },
                indent=2,
            )

        columns = []
        for desc in description:
            col_name = desc[0]
            columns.append(col_name)

        # ============================================================
        # STEP 3 — BUILD SNOWFLAKE TABLE SCHEMA
        # ============================================================

        column_defs = []

        for desc in description:
            col_name = desc[0]
            pg_type_code = desc[1]

            # Optional:
            # You can improve this mapping using psycopg2 type codes
            sf_type = "TEXT"

            column_defs.append(f'"{col_name}" {sf_type}')

        create_sql = f"""
        CREATE OR REPLACE TABLE {target_table} (
            {', '.join(column_defs)}
        )
        """

        if create_table:
            logger.info("Creating Snowflake table: %s", target_table)
            sf_cursor.execute(create_sql)
            logger.info("Table created successfully")

        # ============================================================
        # STEP 4 — EXPORT QUERY RESULT TO CSV
        # ============================================================

        import csv

        with open(csv_file, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)

            # Header
            writer.writerow(columns)

            # Data
            writer.writerows(rows)

        if not csv_file.exists():
            return json.dumps(
                {
                    "error": "CSV export failed"
                },
                indent=2,
            )

        logger.info("CSV export completed: %s", csv_file)

        # ============================================================
        # STEP 5 — UPLOAD FILE TO SNOWFLAKE STAGE
        # ============================================================

        put_sql = f"""
        PUT file://{csv_file}
        @%{target_table}
        OVERWRITE=TRUE
        AUTO_COMPRESS=TRUE
        """

        logger.info("Uploading CSV to Snowflake stage...")
        sf_cursor.execute(put_sql)
        logger.info("File uploaded to stage successfully")

        # ============================================================
        # STEP 6 — COPY DATA INTO SNOWFLAKE
        # ============================================================

        copy_sql = f"""
        COPY INTO {target_table}
        FROM @%{target_table}
        FILE_FORMAT = (
            TYPE = CSV
            FIELD_OPTIONALLY_ENCLOSED_BY = '"'
            PARSE_HEADER = TRUE
            
        )
        MATCH_BY_COLUMN_NAME = CASE_INSENSITIVE
        """

        logger.info("Executing COPY INTO command...")
        sf_cursor.execute(copy_sql)

        conn.commit()

        logger.info("COPY INTO completed")

        # ============================================================
        # STEP 7 — VALIDATE ROW COUNTS
        # ============================================================

        postgres_count = len(rows)

        sf_cursor.execute(f"SELECT COUNT(*) FROM {target_table}")
        snowflake_count = sf_cursor.fetchone()[0]

        logger.info("Row count validation - PostgreSQL: %d, Snowflake: %d", postgres_count, snowflake_count)

        # Record the migration history
        # try:
        #     record_mcp_migration(
        #         source_table=target_table,  # Use target_table as source name for queries
        #         target_table=target_table,
        #         rows_migrated=snowflake_count,
        #         columns_count=len(columns)
        #     )
        # except Exception as e:
        #     logger.warning("Failed to record MCP migration: %s", e)

        # ============================================================
        # STEP 8 — RETURN SUCCESS RESPONSE
        # ============================================================

        return json.dumps(
            {
                "status": "SUCCESS",
                "target_table": target_table,
                "rows_postgres": postgres_count,
                "rows_snowflake": snowflake_count,
                "csv_path": str(csv_file),
                "query_executed": query,
            },
            indent=2,
        )

    except snowflake_errors.Error as e:
        logger.error("Snowflake error: %s", e, exc_info=True)

        return json.dumps(
            {
                "error": "Snowflake error",
                "message": str(e),
            },
            indent=2,
        )

    except Exception as e:
        logger.error("Migration pipeline failed: %s", e, exc_info=True)

        return json.dumps(
            {
                "error": "Pipeline failed",
                "message": str(e),
            },
            indent=2,
        )

    finally:
        # Properly close cursors
        if pg_cursor is not None:
            try:
                pg_cursor.close()
                logger.debug("PostgreSQL cursor closed")
            except Exception as e:
                logger.warning("Error closing PostgreSQL cursor: %s", e)
        
        if sf_cursor is not None:
            try:
                sf_cursor.close()
                logger.debug("Snowflake cursor closed")
            except Exception as e:
                logger.warning("Error closing Snowflake cursor: %s", e)


def migrate_table_columns(
    table_name: str,
    columns: list,
    database_name: str = None,
    schema: str = "public",
) -> str:
    """
    Migrate multiple columns from PostgreSQL to Snowflake.
    Step 1: Create target table with all selected columns
    Step 2: SELECT from source and INSERT to target
    """
    try:
        global pg_conn
        check_and_reinitialize_connections()
        
        # Reconnect to specific database if provided
        if database_name:
            if pg_conn is not None:
                pg_conn.close()
            config = load_database_config()
            pg_config = config.get("postgresql", {})
            pg_conn = psycopg2.connect(
                host=pg_config.get("host", "localhost"),
                port=pg_config.get("port", 5432),
                user=pg_config.get("user", "postgres"),
                password=pg_config.get("password", ""),
                dbname=database_name,
            )
            pg_conn.autocommit = True
            logger.info(f"PostgreSQL reconnected to database: {database_name}")
        
        if pg_conn is None or conn is None:
            return json.dumps({
                "status": "FAILURE",
                "error": "Database connections not initialized",
            })

        sf_table = table_name.upper()
        
        # Build CREATE TABLE statement
        col_defs = []
        pg_cols = []
        sf_cols = []
        
        for col in columns:
            source_col = col['source_column']
            target_col = col['target_column']
            target_type = col['target_datatype']
            is_pk = col.get('is_primary_key', False)
            
            pk_str = " PRIMARY KEY" if is_pk else ""
            col_defs.append(f"{target_col} {target_type}{pk_str}")
            pg_cols.append(source_col)
            sf_cols.append(target_col)
        
        create_sql = f"CREATE TABLE IF NOT EXISTS {sf_table} ({', '.join(col_defs)})"
        
        cursor = conn.cursor()
        try:
            # Check if table already exists in Snowflake
            check_sql = f"SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_name='{sf_table}')"
            cursor.execute(check_sql)
            table_exists = cursor.fetchone()[0]
            
            if table_exists:
                logger.error(f"Table {sf_table} already exists in target")
                return json.dumps({
                    "status": "FAILURE",
                    "table": table_name,
                    "error": f"Table '{table_name}' already exists in target database and cannot be migrated",
                })
            
            logger.info(f"Creating Snowflake table: {create_sql}")
            cursor.execute(create_sql)
            conn.commit()
            
            logger.info(f"Schema created successfully for {sf_table}")
            
            return json.dumps({
                "status": "SUCCESS",
                "table": table_name,
                "columns": len(columns),
                "rows_migrated": 0,
                "message": "Schema created (no data migrated)",
            })
        
        except Exception as e:
            conn.rollback()
            logger.error(f"Migration failed for {schema}.{table_name}: {e}")
            return json.dumps({
                "status": "FAILURE",
                "table": table_name,
                "error": str(e),
            })
        finally:
            cursor.close()
    
    except Exception as e:
        logger.error(f"Migration setup failed: {e}")
        return json.dumps({
            "status": "FAILURE",
            "error": str(e),
        })

    
if __name__ == '__main__':
    app.run(transport='streamable-http')