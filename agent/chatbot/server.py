from __future__ import annotations as _annotations

import logfire
import json
import psycopg2
import logging
from psycopg2 import sql
from typing import Any
from urllib.parse import parse_qs, urlsplit, urlunsplit
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(dotenv_path=Path(__file__).resolve().parent.parent / '.env', override=True)

from starlette.responses import JSONResponse
from starlette.requests import Request
from starlette.middleware.base import BaseHTTPMiddleware
from pydantic_ai import Agent
from pydantic_ai.ui._web.api import ChatRequestExtra, validate_request_options
from pydantic_ai.ui.vercel_ai import VercelAIAdapter

# Configure logger
logger = logging.getLogger("server")

from .agent import agent, explicit_memory, deps
from .database_config import (
    load_database_config,
    save_database_config,
    get_postgresql_config,
    get_snowflake_config,
    update_database_config,
    get_default_config,
)

import sys

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.append(str(ROOT_DIR))

from knowledge import delete_collection, get_pdf_files, list_collections, load_pdf_to_collection, search_collection

# Import MCP server connection functions if available
try:
    import mcp_server
    HAS_MCP_SERVER = True
except ImportError:
    HAS_MCP_SERVER = False


# 'if-token-present' means nothing will be sent (and the example will work) if you don't have logfire configured
logfire.configure(send_to_logfire='if-token-present')
logfire.instrument_pydantic_ai()

models={
        'GPT 5.2': 'openai:gpt-5.2',
        'GPT 5.1': 'openai:gpt-5.1', 
        'GPT 5': 'openai-responses:gpt-5',
        'GPT 5-mini': 'openai:gpt-5-mini', 
        'GPT 5-nano': 'openai:gpt-5-nano', 
        'GPT 4.1': 'openai:gpt-4.1', 
        'GPT 4.1-mini': 'openai:gpt-4.1-mini', 
        'GPT 4.1-nano': 'openai:gpt-4.1-nano'}

DEFAULT_ER_DIAGRAM_MODEL = models['GPT 4.1']

mermaid_diagram_agent = Agent(
    model=DEFAULT_ER_DIAGRAM_MODEL,
    instructions=(
        'You generate Mermaid ER diagrams from provided database schema details. '
        'Return only Mermaid code using erDiagram syntax. '
        'Do not use code fences. Do not include explanations. '
        'Include tables, columns, primary keys, and foreign key relationships when provided.'
    ),
)

migration_plan_agent = Agent(
    model=DEFAULT_ER_DIAGRAM_MODEL,
    instructions=(
        'You are a database migration expert. I have MCP tools/connectors already configured for both PostgreSQL and Snowflake databases. '
        'Your task is to provide a SIMPLE and CLEAR PostgreSQL to Snowflake migration plan. '
        'Requirements: '
        '- Do NOT generate SQL scripts '
        '- Do NOT provide overly complex architecture '
        '- Keep the migration plan step-by-step and practical '
        'Provide: '
        '1. Migration order based on table dependencies '
        '2. Table-to-table migration mapping '
        '3. Column-to-column migration mapping '
        '4. Important transformation/normalization rules '
        '5. Validation checks after migration '
        '6. Best practices for Snowflake migration '
        '- Not more than the 6 steps'
    ),
)


def get_agent_module():
    import chatbot.agent as agent_module

    return agent_module


def get_agent_details_payload() -> dict[str, str]:
    agent_module = get_agent_module()
    # Reload config and rebuild schema memory to ensure latest database
    agent_module.reload_database_config_from_file()
    current_db_schema_memory_data = agent_module.build_db_schema_memory()
    current_db_schema_memory = f"DATABASE_SCHEMA:{current_db_schema_memory_data}"
    
    # Call build_app_context() dynamically to get latest config
    current_app_context = agent_module.build_app_context()
    return {
        'db_schema_memory': current_db_schema_memory.strip(),
        'business_rules': agent_module.business_rules.strip(),
        'app_context': current_app_context.strip(),
        'migration_plan': agent_module.migration_plan.strip(),
        'migration_rules': agent_module.migration_rules.strip(),
    }


def refresh_combined_memory() -> None:
    agent_module = get_agent_module()
    agent_module.combined_memory = agent_module.build_runtime_memory()


def update_agent_details(**fields: str) -> None:
    agent_module = get_agent_module()

    for key, value in fields.items():
        if value is None:
            continue
        setattr(agent_module, key, value.strip())

    refresh_combined_memory()


def build_runtime_instructions() -> str:
    details = get_agent_details_payload()
    sections = [
        explicit_memory.strip(),
        details['db_schema_memory'],
        details['business_rules'],
        details['app_context'],
        details['migration_plan'],
        details['migration_rules'],
    ]
    return '\n\n'.join(section for section in sections if section)


async def agent_details_endpoint(_: Request):
    """Return the configured agent context sections for the UI details page."""
    agent_module = get_agent_module()
    
    # Ensure fresh config is loaded before building payload
    agent_module.reload_database_config_from_file()
    
    payload = get_agent_details_payload()
    
    # Include current database configuration
    payload['database_config'] = agent_module.get_database_config()
    
    return JSONResponse(payload)


async def knowledge_details_endpoint(_: Request):
    """Return the knowledge.py source content for the UI knowledge details page."""
    knowledge_path = Path(__file__).resolve().parent.parent / 'knowledge.py'
    return JSONResponse(
        {
            'file_name': 'knowledge.py',
            'content': knowledge_path.read_text(encoding='utf-8'),
        }
    )


async def knowledge_collections_endpoint(_: Request):
    """Return available knowledge base collections and their count."""
    collections = list_collections()
    return JSONResponse(
        {
            'collections': collections,
            'count': len(collections),
        }
    )


async def knowledge_pdfs_endpoint(_: Request):
    """Return available PDF files that can be loaded into a collection."""
    pdf_files = get_pdf_files(str(ROOT_DIR))
    return JSONResponse({'pdf_files': pdf_files})


async def knowledge_create_collection_endpoint(request: Request):
    """Create or load a collection from a selected PDF file."""
    payload = json.loads((await request.body()) or b'{}')
    collection_name = str(payload.get('collection_name', '')).strip()
    pdf_file = str(payload.get('pdf_file', '')).strip()

    if not collection_name:
        return JSONResponse({'error': 'Collection name is required.'}, status_code=400)
    if not pdf_file:
        return JSONResponse({'error': 'PDF file is required.'}, status_code=400)

    pdf_path = ROOT_DIR / pdf_file
    if not pdf_path.exists():
        return JSONResponse({'error': 'Selected PDF file does not exist.'}, status_code=400)

    success = load_pdf_to_collection(collection_name, str(pdf_path))
    if not success:
        return JSONResponse({'error': 'Failed to create collection from PDF.'}, status_code=500)

    return JSONResponse({'success': True})


async def knowledge_delete_collection_endpoint(request: Request):
    """Delete an existing knowledge collection."""
    payload = json.loads((await request.body()) or b'{}')
    collection_name = str(payload.get('collection_name', '')).strip()

    if not collection_name:
        return JSONResponse({'error': 'Collection name is required.'}, status_code=400)

    success = delete_collection(collection_name)
    if not success:
        return JSONResponse({'error': 'Failed to delete collection.'}, status_code=500)

    return JSONResponse({'success': True})


async def knowledge_search_endpoint(request: Request):
    """Search a selected collection and return formatted results for the UI."""
    query_params = parse_qs(request.url.query)
    collection_name = query_params.get('collection', [''])[0]
    query_text = query_params.get('query', [''])[0]

    if not collection_name:
        return JSONResponse({'error': 'Collection is required.'}, status_code=400)
    if not query_text:
        return JSONResponse({'error': 'Query is required.'}, status_code=400)

    results = search_collection(collection_name, query_text)
    if not results:
        return JSONResponse({'results': []})

    documents = results.get('documents', [[]])[0]
    metadatas = results.get('metadatas', [[]])[0]
    distances = results.get('distances', [[]])[0]

    formatted_results = []
    for document, metadata, distance in zip(documents, metadatas, distances):
        formatted_results.append(
            {
                'source': metadata.get('source', 'Unknown'),
                'chunk_id': metadata.get('chunk_id'),
                'distance': distance,
                'content': document,
            }
        )

    return JSONResponse({'results': formatted_results})


async def database_config_endpoint(request: Request):
    """Get or set the current database configuration."""
    if request.method == 'GET':
        # Return current database configuration
        agent_module = get_agent_module()
        return JSONResponse(agent_module.get_database_config())
    
    elif request.method == 'POST':
        # Set database configuration
        payload = json.loads((await request.body()) or b'{}')
        connection_string = str(payload.get('connection_string', '')).strip()
        database_name = str(payload.get('database_name', '')).strip()
        
        if not connection_string or not database_name:
            return JSONResponse(
                {'detail': 'connection_string and database_name are required.'}, 
                status_code=400
            )
        
        agent_module = get_agent_module()
        agent_module.set_database_config(
            connection_string=connection_string,
            database_name=database_name
        )
        
        # Rebuild schema memory with new configuration
        agent_module.db_schema_memory_data = agent_module.build_db_schema_memory()
        agent_module.db_schema_memory = f"""
DATABASE_SCHEMA:{agent_module.db_schema_memory_data}
"""
        
        refresh_combined_memory()
        
        return JSONResponse({'success': True, 'config': agent_module.get_database_config()})



async def databases_endpoint(request: Request):
    """Fetch list of available databases from PostgreSQL."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        connection_string = str(payload.get('connection_string', '')).strip()

        if not connection_string:
            return JSONResponse({'detail': 'Connection string is required.'}, status_code=400)

        conn = psycopg2.connect(connection_string)
        cursor = conn.cursor()

        # Fetch list of databases
        cursor.execute(
            "SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres') ORDER BY datname"
        )
        databases = [{'name': row[0]} for row in cursor.fetchall()]

        cursor.close()
        conn.close()

        return JSONResponse(databases)

    except psycopg2.Error as e:
        return JSONResponse(
            {'detail': f'Database connection error: {str(e)}'}, status_code=500
        )
    except Exception as e:
        return JSONResponse({'detail': f'Error: {str(e)}'}, status_code=500)


def build_database_connection_string(connection_string: str, database: str) -> str:
    """Return a PostgreSQL connection string pointing at the selected database."""
    normalized = connection_string if connection_string.startswith('postgresql://') else f'postgresql://{connection_string}'
    parsed = urlsplit(normalized)
    return urlunsplit(parsed._replace(path=f'/{database}'))


def fetch_table_schemas(connection_string: str, database: str) -> list[dict[str, Any]]:
    """Fetch structured schema information for all public tables in a database."""
    modified_conn_str = build_database_connection_string(connection_string, database)

    conn = psycopg2.connect(modified_conn_str)
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
            """
        )
        tables_list = [row[0] for row in cursor.fetchall()]

        tables = []

        for table_name in tables_list:
            cursor.execute(
                """
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = %s AND table_schema = 'public'
                ORDER BY ordinal_position
                """,
                (table_name,),
            )
            columns = [
                {
                    'column_name': row[0],
                    'data_type': row[1],
                    'is_nullable': row[2] == 'YES',
                    'column_default': row[3],
                }
                for row in cursor.fetchall()
            ]

            cursor.execute(
                """
                SELECT k.column_name
                FROM information_schema.key_column_usage k
                JOIN information_schema.table_constraints t
                  ON k.constraint_name = t.constraint_name
                  AND k.table_name = t.table_name
                  AND k.table_schema = t.table_schema
                WHERE t.table_name = %s AND t.constraint_type = 'PRIMARY KEY' AND t.table_schema = 'public'
                ORDER BY k.ordinal_position
                """,
                (table_name,),
            )
            primary_keys = [row[0] for row in cursor.fetchall()]

            cursor.execute(
                """
                SELECT
                    kcu.column_name,
                    ccu.table_name AS referenced_table,
                    ccu.column_name AS referenced_column
                FROM information_schema.table_constraints AS tc
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                  AND tc.table_name = %s
                  AND tc.table_schema = 'public'
                ORDER BY kcu.ordinal_position
                """,
                (table_name,),
            )
            foreign_keys = [
                {
                    'column_name': row[0],
                    'referenced_table': row[1],
                    'referenced_column': row[2],
                }
                for row in cursor.fetchall()
            ]

            # Fetch row count
            cursor.execute(
                sql.SQL('SELECT COUNT(*) FROM public.{}').format(
                    sql.Identifier(table_name)
                )
            )
            row_count = cursor.fetchone()[0]

            tables.append(
                {
                    'table_name': table_name,
                    'columns': columns,
                    'primary_key': primary_keys,
                    'foreign_keys': foreign_keys,
                    'row_count': row_count,
                }
            )

        return tables
    finally:
        cursor.close()
        conn.close()


def format_tables_for_mermaid_prompt(tables: list[dict[str, Any]]) -> str:
    """Convert table schema info into a compact prompt string for the agent."""
    formatted_tables = []
    for table in tables:
        formatted_tables.append(f"Table: {table['table_name']}")
        formatted_tables.append("Columns:")
        for column in table.get('columns', []):
            nullable = 'NULL' if column.get('is_nullable') else 'NOT NULL'
            formatted_tables.append(
                f"- {column.get('column_name')} ({column.get('data_type')}, {nullable})"
            )
        if table.get('primary_key'):
            formatted_tables.append(f"Primary Key: {', '.join(table['primary_key'])}")
        if table.get('foreign_keys'):
            formatted_tables.append("Foreign Keys:")
            for fk in table['foreign_keys']:
                formatted_tables.append(
                    f"- {fk.get('column_name')} -> {fk.get('referenced_table')}.{fk.get('referenced_column')}"
                )
        formatted_tables.append("")
    return "\n".join(formatted_tables).strip()


def extract_mermaid_code(text: str) -> str:
    """Extract Mermaid code from model output, stripping fences and extra text."""
    if '```' not in text:
        return text.strip()

    for fence in ('```mermaid', '```'):
        start = text.find(fence)
        if start != -1:
            start += len(fence)
            end = text.find('```', start)
            if end != -1:
                return text[start:end].strip()
    return text.strip()


async def table_schemas_endpoint(request: Request):
    """Fetch table schemas for a specific database."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        connection_string = str(payload.get('connection_string', '')).strip()
        database = str(payload.get('database', '')).strip()

        if not connection_string:
            return JSONResponse({'detail': 'Connection string is required.'}, status_code=400)
        if not database:
            return JSONResponse({'detail': 'Database name is required.'}, status_code=400)

        tables = fetch_table_schemas(connection_string, database)

        return JSONResponse({'tables': tables})

    except psycopg2.Error as e:
        return JSONResponse(
            {'detail': f'Database connection error: {str(e)}'}, status_code=500
        )
    except Exception as e:
        return JSONResponse({'detail': f'Error: {str(e)}'}, status_code=500)


async def er_diagram_endpoint(request: Request):
    """Generate Mermaid ER diagram code from provided table details using the agent."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        connection_string = str(payload.get('connection_string', '')).strip()
        database = str(payload.get('database', '')).strip()
        tables = payload.get('tables')

        if not connection_string:
            return JSONResponse({'detail': 'Connection string is required.'}, status_code=400)
        if not database:
            return JSONResponse({'detail': 'Database name is required.'}, status_code=400)
        if not tables:
            return JSONResponse({'detail': 'Table schema details are required.'}, status_code=400)

        tables_prompt = format_tables_for_mermaid_prompt(tables)
        prompt = (
            "Generate a Mermaid ER diagram using the data below. "
            "Return ONLY Mermaid code (no backticks, no prose, no tables). "
            "Use erDiagram syntax and include all tables, columns, and relationships. tables with no relationship should be on the right side\n\n"
            f"Database: {database}\n\n"
            f"Schema Details:\n{tables_prompt}\n"
        )

        result = await mermaid_diagram_agent.run(prompt)
        mermaid_code = extract_mermaid_code(result.output).strip()
        if not mermaid_code.startswith('erDiagram'):
            mermaid_code = f"erDiagram\n{mermaid_code}"

        return JSONResponse({'mermaid': mermaid_code})

    except psycopg2.Error as e:
        return JSONResponse(
            {'detail': f'Database connection error: {str(e)}'}, status_code=500
        )
    except Exception as e:
        return JSONResponse({'detail': f'Error generating ER diagram: {str(e)}'}, status_code=500)


async def migration_plan_endpoint(request: Request):
    """Generate migration plan from PostgreSQL to Snowflake using the agent."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        connection_string = str(payload.get('connection_string', '')).strip()
        database = str(payload.get('database', '')).strip()
        tables = payload.get('tables')

        if not connection_string:
            return JSONResponse({'detail': 'Connection string is required.'}, status_code=400)
        if not database:
            return JSONResponse({'detail': 'Database name is required.'}, status_code=400)
        if not tables:
            return JSONResponse({'detail': 'Table schema details are required.'}, status_code=400)

        tables_prompt = format_tables_for_mermaid_prompt(tables)
        prompt = (
            "You are a database migration expert. I have MCP tools/connectors already configured for both PostgreSQL and Snowflake databases. "
            "Your task is to provide a SIMPLE and CLEAR PostgreSQL to Snowflake migration plan.\n\n"
            "Requirements:\n"
            "- Do NOT generate SQL scripts\n"
            "- Do NOT provide overly complex architecture\n"
            "- Keep the migration plan step-by-step and practical\n\n"
            "- Provide a maximum of 6 steps in the migration plan\n"
            "- No * or other characters in the output use only number,spaces and dots where required\n"
            "- For topics use numbers and for further subtopics have adequate space and further subtopics always use bullet points\n"
            "Provide:\n"
            "1. Migration order based on table dependencies\n"
            "2. Table-to-table migration mapping\n"
            "3. Column-to-column migration mapping\n"
            "4. Important transformation/normalization rules\n"
            "5. Validation checks after migration\n"
            "6. Best practices for Snowflake migration\n\n"
            f"Database: {database}\n\n"
            f"Schema Details:\n{tables_prompt}\n"
        )

        result = await migration_plan_agent.run(prompt)
        migration_plan = result.output.strip()

        update_agent_details(migration_plan=migration_plan)

        return JSONResponse({'migration_plan': migration_plan})

    except psycopg2.Error as e:
        return JSONResponse(
            {'detail': f'Database connection error: {str(e)}'}, status_code=500
        )
    except Exception as e:
        return JSONResponse({'detail': f'Error generating migration plan: {str(e)}'}, status_code=500)


async def save_migration_plan_endpoint(request: Request):
    """Save the edited migration plan."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        migration_plan_text = str(
            payload.get('migration_plan', '')
        ).strip()

        if not migration_plan_text:
            return JSONResponse(
                {'detail': 'Migration plan is required.'}, status_code=400
            )

        update_agent_details(migration_plan=migration_plan_text)

        return JSONResponse({'success': True})

    except Exception as e:
        return JSONResponse(
            {'detail': f'Error saving migration plan: {str(e)}'}, status_code=500
        )


async def database_config_endpoint(request: Request):
    """Get or update database configuration for PostgreSQL and Snowflake."""
    if request.method == 'GET':
        # Return current database configuration
        config = load_database_config()
        return JSONResponse(config)
    
    elif request.method == 'POST':
        # Update database configuration
        try:
            payload = json.loads((await request.body()) or b'{}')
            
            postgresql = payload.get('postgresql')
            snowflake = payload.get('snowflake')
            
            if not postgresql and not snowflake:
                return JSONResponse(
                    {'detail': 'At least one database configuration (postgresql or snowflake) is required.'}, 
                    status_code=400
                )
            
            success = update_database_config(postgresql=postgresql, snowflake=snowflake)
            
            if success:
                # Reload MCP server connections with new configuration
                if HAS_MCP_SERVER:
                    try:
                        # Invalidate config cache first
                        mcp_server.invalidate_config_cache()
                        # Then reinitialize connections
                        mcp_server.initialize_postgresql_connection()
                        mcp_server.initialize_snowflake_connection()
                        logger.info("MCP server connections reinitialized with new configuration")
                    except Exception as e:
                        logger.warning("Failed to reinitialize MCP server connections: %s", e)
                
                # Also refresh agent's memory to reflect new database configuration
                try:
                    agent_module = get_agent_module()
                    # Reload agent's database config from the saved file
                    agent_module.reload_database_config_from_file()
                    # Rebuild schema memory based on new config
                    agent_module.db_schema_memory_data = agent_module.build_db_schema_memory()
                    agent_module.db_schema_memory = f"""
DATABASE_SCHEMA:{agent_module.db_schema_memory_data}
"""
                    # Update app_context with new database configuration
                    agent_module.app_context = agent_module.build_app_context()
                    # Refresh combined memory to reflect new config
                    refresh_combined_memory()
                    logger.info("Agent memory refreshed with new database configuration")
                except Exception as e:
                    logger.warning("Failed to refresh agent memory: %s", e)
                
                return JSONResponse({
                    'success': True,
                    'message': 'Database configuration updated successfully. MCP server connections and agent memory have been reinitialized.',
                    'config': load_database_config()
                })
            else:
                return JSONResponse(
                    {'detail': 'Failed to save database configuration.'}, 
                    status_code=500
                )
        
        except Exception as e:
            return JSONResponse(
                {'detail': f'Error updating database configuration: {str(e)}'}, 
                status_code=500
            )


async def database_config_reset_endpoint(request: Request):
    """Reset database configuration to defaults."""
    try:
        default_config = get_default_config()
        save_database_config(default_config)
        
        return JSONResponse({
            'success': True,
            'message': 'Database configuration reset to defaults.',
            'config': default_config
        })
    except Exception as e:
        return JSONResponse(
            {'detail': f'Error resetting database configuration: {str(e)}'}, 
            status_code=500
        )


async def save_agent_details_endpoint(request: Request):
    """Save edited agent detail fields and database configuration."""
    try:
        payload = json.loads((await request.body()) or b'{}')

        # Extract database configuration if provided
        connection_string = str(payload.get('connection_string', '')).strip()
        database_name = str(payload.get('database_name', '')).strip()

        # Update database configuration if provided
        if connection_string or database_name:
            agent_module = get_agent_module()
            agent_module.set_database_config(
                connection_string=connection_string,
                database_name=database_name
            )
            
            # Rebuild db schema memory with new database
            agent_module.db_schema_memory_data = agent_module.build_db_schema_memory()
            agent_module.db_schema_memory = f"""
DATABASE_SCHEMA:{agent_module.db_schema_memory_data}
"""

        # Update other agent details
        update_agent_details(
            db_schema_memory=str(payload.get('db_schema_memory', ''))
            if 'db_schema_memory' in payload
            else None,
            business_rules=str(payload.get('business_rules', ''))
            if 'business_rules' in payload
            else None,
            app_context=str(payload.get('app_context', ''))
            if 'app_context' in payload
            else None,
            migration_plan=str(payload.get('migration_plan', ''))
            if 'migration_plan' in payload
            else None,
            migration_rules=str(payload.get('migration_rules', ''))
            if 'migration_rules' in payload
            else None,
        )

        return JSONResponse({'success': True})

    except Exception as e:
        return JSONResponse(
            {'detail': f'Error saving agent details: {str(e)}'}, status_code=500
        )


async def chat_endpoint(request: Request):
    """Handle chat requests using the current editable agent details as runtime memory."""
    try:
        # Force fresh config load and reinitialize ALL connections before conversation
        if HAS_MCP_SERVER:
            try:
                # Force invalidate cache and reload connections fresh
                mcp_server.invalidate_config_cache()
                mcp_server.initialize_postgresql_connection()
                mcp_server.initialize_snowflake_connection()
                logger.info("MCP connections refreshed with latest config for new conversation")
            except Exception as e:
                logger.warning("Failed to refresh MCP connections: %s", e)
        
        adapter = await VercelAIAdapter.from_request(request, agent=agent)
        extra_data = ChatRequestExtra.model_validate(
            adapter.run_input.__pydantic_extra__ or {}
        )

        allowed_model_ids = set(models.values())
        if error := validate_request_options(extra_data, allowed_model_ids, set()):
            return JSONResponse({'error': error}, status_code=400)

        model_ref = extra_data.model or next(iter(models.values()))

        return await VercelAIAdapter.dispatch_request(
            request,
            agent=agent,
            model=model_ref,
            deps=deps,
            instructions=build_runtime_instructions(),
        )
    except Exception as e:
        return JSONResponse({'error': f'Chat request failed: {str(e)}'}, status_code=500)


async def column_mappings_endpoint(request: Request):
    """Get column mappings from agent for selected tables."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        tables = payload.get('tables', [])
        
        if not tables:
            return JSONResponse({'detail': 'Tables are required.'}, status_code=400)

        tables_prompt = format_tables_for_mermaid_prompt(tables)
        prompt = (
            "You are a PostgreSQL to Snowflake migration expert. Analyze these PostgreSQL table schemas and suggest:\n"
            "1. ACCURATE Snowflake datatypes\n"
            "2. INTELLIGENT TARGET COLUMN NAMES (can be rename, concatenation, or transformation)\n\n"
            "COLUMN NAME TRANSFORMATION RULES:\n"
            "- If multiple related columns exist (e.g., first_name + last_name), suggest a combined name (full_name)\n"
            "- If columns can be transposed (e.g., address_line_1 + address_line_2), suggest combined name (full_address)\n"
            "- If renaming improves clarity (e.g., amt → amount), suggest improved name\n"
            "- Otherwise keep source column name\n\n"
            "DATATYPE MAPPING:\n"
            "- *_date, *_time, birth_date, created_at → DATE or TIMESTAMP_NTZ\n"
            "- email, url, path, code, *_name → VARCHAR\n"
            "- amount, price, quantity, total → DECIMAL(18,2) or NUMBER\n"
            "- is_*, has_*, flag, active → BOOLEAN\n"
            "- metadata, config, *_json → VARIANT\n\n"
            "Return ONLY this JSON structure, no other text:\n"
            "[{\"table_name\":\"t\",\"columns\":[{\"source_column\":\"c\",\"source_datatype\":\"pg_type\",\"target_column\":\"new_name\",\"target_datatype\":\"sf_type\",\"is_primary_key\":false,\"is_nullable\":true,\"transformation\":\"\"}]}]\n\n"
            f"Schema:\n{tables_prompt}"
        )

        result = await migration_plan_agent.run(prompt)
        response_text = result.output.strip()
        
        # Extract JSON from response
        try:
            json_start = response_text.find('[')
            json_end = response_text.rfind(']') + 1
            if json_start != -1 and json_end > json_start:
                json_str = response_text[json_start:json_end]
                mappings = json.loads(json_str)
            else:
                mappings = json.loads(response_text)
        except json.JSONDecodeError:
            # Fallback: create basic mappings with snowflake types
            mappings = [{
                "table_name": table['table_name'],
                "columns": [{
                    "source_column": col['column_name'],
                    "source_datatype": col['data_type'],
                    "target_column": col['column_name'],
                    "target_datatype": _map_pg_to_snowflake(col['data_type']),
                    "is_primary_key": col['column_name'] in table.get('primary_key', []),
                    "is_nullable": col['is_nullable'],
                    "transformation": ""
                } for col in table['columns']]
            } for table in tables]

        return JSONResponse({'tables': mappings})

    except Exception as e:
        return JSONResponse({'detail': f'Error getting column mappings: {str(e)}'}, status_code=500)


def _map_pg_to_snowflake(pg_type: str) -> str:
    """Map PostgreSQL datatype to Snowflake equivalent."""
    pg_type_lower = pg_type.lower()
    
    mappings = {
        'bigint': 'INTEGER',
        'integer': 'INTEGER',
        'smallint': 'INTEGER',
        'serial': 'INTEGER',
        'numeric': 'DECIMAL(18,2)',
        'decimal': 'DECIMAL(18,2)',
        'real': 'FLOAT',
        'double': 'FLOAT',
        'character': 'VARCHAR',
        'varchar': 'VARCHAR',
        'text': 'VARCHAR',
        'boolean': 'BOOLEAN',
        'date': 'DATE',
        'timestamp': 'TIMESTAMP_NTZ',
        'time': 'TIME',
        'json': 'VARIANT',
        'jsonb': 'VARIANT',
        'uuid': 'VARCHAR',
    }
    
    for key, val in mappings.items():
        if key in pg_type_lower:
            return val
    
    return 'VARCHAR'  # Default fallback


async def migrate_columns_endpoint(request: Request):
    """Migrate selected columns from PostgreSQL to Snowflake."""
    try:
        payload = json.loads((await request.body()) or b'{}')
        tables = payload.get('tables', [])
        
        if not tables:
            return JSONResponse(
                {'detail': 'Tables are required.'}, 
                status_code=400
            )

        migration_results = []

        if HAS_MCP_SERVER:
            # Process each table with all its selected columns
            for table in tables:
                selected_cols = table.get('selected_columns', [])
                
                if not selected_cols:
                    continue
                
                # Collect column mappings for selected columns only
                cols_to_migrate = []
                for col in table.get('columns', []):
                    if col['source_column'] in selected_cols:
                        cols_to_migrate.append({
                            'source_column': col['source_column'],
                            'target_column': col.get('target_column', col['source_column']).upper(),
                            'target_datatype': col['target_datatype'],
                            'is_primary_key': col.get('is_primary_key', False),
                        })
                
                if cols_to_migrate:
                    try:
                        schema = table.get('schema', 'public')
                        result_json = mcp_server.migrate_table_columns(
                            table_name=table['table_name'],
                            columns=cols_to_migrate,
                            database_name=payload.get('database', 'bank_db'),
                            schema=schema,
                        )
                        result = json.loads(result_json)
                        migration_results.append(result)
                        logger.info(f"Migration result: {result}")
                    except Exception as e:
                        migration_results.append({
                            "status": "FAILURE",
                            "table": table['table_name'],
                            "error": str(e),
                        })

        # Count successes/failures
        successes = sum(
            1 for r in migration_results
            if r.get('status') == 'SUCCESS'
        )
        failures = sum(
            1 for r in migration_results
            if r.get('status') == 'FAILURE'
        )

        return JSONResponse({
            'success': True,
            'summary': {
                'total': len(migration_results),
                'successful': successes,
                'failed': failures,
            },
            'results': migration_results,
        })

    except Exception as e:
        return JSONResponse(
            {'detail': f'Migration error: {str(e)}'}, 
            status_code=500
        )


class AgentDetailsMiddleware(BaseHTTPMiddleware):
    """Serve custom UI endpoints before delegating to the generated chat app."""

    async def dispatch(self, request: Request, call_next):
        if request.url.path == '/api/agent-details' and request.method == 'GET':
            return await agent_details_endpoint(request)
        if request.url.path == '/api/database-config' and request.method in ['GET', 'POST']:
            return await database_config_endpoint(request)
        if request.url.path == '/api/database-config/reset' and request.method == 'POST':
            return await database_config_reset_endpoint(request)
        if request.url.path == '/api/knowledge-details' and request.method == 'GET':
            return await knowledge_details_endpoint(request)
        if request.url.path == '/api/knowledge-collections' and request.method == 'GET':
            return await knowledge_collections_endpoint(request)
        if request.url.path == '/api/knowledge-pdfs' and request.method == 'GET':
            return await knowledge_pdfs_endpoint(request)
        if request.url.path == '/api/knowledge-search' and request.method == 'GET':
            return await knowledge_search_endpoint(request)
        if request.url.path == '/api/knowledge-collections' and request.method == 'POST':
            return await knowledge_create_collection_endpoint(request)
        if request.url.path == '/api/knowledge-collections/delete' and request.method == 'POST':
            return await knowledge_delete_collection_endpoint(request)
        if request.url.path == '/api/databases' and request.method == 'POST':
            return await databases_endpoint(request)
        if request.url.path == '/api/table-schemas' and request.method == 'POST':
            return await table_schemas_endpoint(request)
        if request.url.path == '/api/chat' and request.method == 'POST':
            return await chat_endpoint(request)
        if request.url.path == '/api/er-diagram' and request.method == 'POST':
            return await er_diagram_endpoint(request)
        if request.url.path == '/api/migration-plan' and request.method == 'POST':
            return await migration_plan_endpoint(request)
        if request.url.path == '/api/migration-plan-save' and request.method == 'POST':
            return await save_migration_plan_endpoint(request)
        if request.url.path == '/api/column-mappings' and request.method == 'POST':
            return await column_mappings_endpoint(request)
        if request.url.path == '/api/migrate-columns' and request.method == 'POST':
            return await migrate_columns_endpoint(request)
        if request.url.path == '/api/agent-details-save' and request.method == 'POST':
            return await save_agent_details_endpoint(request)
        return await call_next(request)


app = agent.to_web(instructions=explicit_memory,
                   deps=deps,
                     models=models)
app.add_middleware(AgentDetailsMiddleware)
logfire.instrument_starlette(app)
