from typing import Any, cast

import pydantic_ai

from chatbot.data import Repo, get_docs_dir, get_markdown, get_table_of_contents
from chatbot.db import open_populated_table

#-------------
from pydantic_ai import Agent
from pydantic_ai.mcp import MCPServerStreamableHTTP
from pydantic_ai.messages import ModelRequest, SystemPromptPart, ModelResponse, TextPart
import chromadb
from sentence_transformers import SentenceTransformer
from pydantic_ai import Agent, RunContext
from dataclasses import dataclass
import psycopg2
import logging

from typing import Dict, List, Union, Optional
from pydantic import BaseModel, Field
from pydantic_ai import Agent, RunContext

# Import database config module to load fresh config for each conversation
from chatbot.database_config import load_database_config

logger = logging.getLogger("agent")

# 1. Setup ChromaDB and Embedding Model (Global or in Deps)
client = chromadb.PersistentClient(path="./my_local_db")
collection = client.get_or_create_collection("pdf_memory")
embedding_model = SentenceTransformer('all-MiniLM-L6-v2')


# -------------------------------------------------------------------------
# DYNAMIC DATABASE CONFIGURATION
# -------------------------------------------------------------------------
# Global configuration for current database connection
current_database_config = {
    'connection_string': None,
    'database_name': None,
    'host': None,
    'user': None,
    'dbname': None,
}

def set_database_config(connection_string: str = None, database_name: str = None, host: str = None, user: str = None, dbname: str = None):
    """Update the current database configuration."""
    global current_database_config
    if connection_string:
        current_database_config['connection_string'] = connection_string
    if database_name:
        current_database_config['database_name'] = database_name
    if host:
        current_database_config['host'] = host
    if user:
        current_database_config['user'] = user
    if dbname:
        current_database_config['dbname'] = dbname

def reload_database_config_from_file():
    """Reload the agent's database configuration from the saved config file.
    
    This ensures the agent uses the latest configuration saved in database_config.json,
    allowing dynamic database switching without restarting the app.
    """
    global current_database_config
    try:
        config = load_database_config()
        pg_config = config.get("postgresql", {})
        
        # Update current_database_config with values from saved file
        current_database_config['host'] = pg_config.get('host')
        current_database_config['user'] = pg_config.get('user')
        current_database_config['dbname'] = pg_config.get('dbname')
        
        # Build connection string
        if all([pg_config.get('host'), pg_config.get('user'), pg_config.get('dbname')]):
            password = pg_config.get('password', 'root')
            port = pg_config.get('port', 5432)
            current_database_config['connection_string'] = (
                f"dbname={pg_config.get('dbname')} "
                f"user={pg_config.get('user')} "
                f"password={password} "
                f"host={pg_config.get('host')} "
                f"port={port}"
            )
            current_database_config['database_name'] = pg_config.get('dbname')
            
            logger.info("Agent config reloaded from file: database=%s host=%s", 
                       pg_config.get('dbname'), pg_config.get('host'))
        
    except Exception as e:
        logger.warning("Error reloading agent config from file: %s", e)

def get_database_config():
    """Get the current database configuration."""
    return current_database_config.copy()

def build_db_schema_memory():
    """Dynamically build db schema memory from current configuration."""
    global current_database_config
    
    # CRITICAL: Reload config FIRST before using it
    reload_database_config_from_file()
    
    # Use provided connection string or fallback to hardcoded defaults
    try:
        if current_database_config['connection_string']:
            conn = psycopg2.connect(current_database_config['connection_string'])
        else:
            # Fallback to defaults if no configuration set
            conn = psycopg2.connect(
                dbname=current_database_config.get('dbname') or "bank_db",
                user=current_database_config.get('user') or "postgres",
                password="root",
                host=current_database_config.get('host') or "localhost",
            )
        
        cur = conn.cursor()
        cur.execute("""
        SELECT table_name, column_name, data_type, table_catalog,'postgresdb' as source_data
        FROM information_schema.columns
        WHERE table_schema = 'public';
        """)
        
        db_schema_memory_data = [
            f"Column {col} in table {tbl} has type {dtype} in database {db}. from source {source_data}"
            for tbl, col, dtype, db, source_data in cur.fetchall()
        ]
        
        cur.close()
        conn.close()
        
        return db_schema_memory_data
    except Exception as e:
        print(f"Error fetching database schema: {e}")
        return ["Unable to fetch database schema. Please configure database connection."]

# -------------------------------------------------------------------------
# DB SCHEMA → USER MEMORY
# -------------------------------------------------------------------------
db_schema_memory_data = build_db_schema_memory()
print({"metadata": db_schema_memory_data[:5]})  # Print first 5 entries to verify


@dataclass
class SearchDeps:
    collection: chromadb.Collection
    model: SentenceTransformer

explicit_memory = "User memory: The user's name is Sameer, Always follow migration rules and guidelines, " \
"User is a database administrator responsible for managing and migrating databases," \
"User has access to both Postgres and Snowflake databases, " \
"User is seeking assistance with SQL queries, database schema insights, and migration strategies." \
"Always respond in Table format or bullet points for better readability, never respond in paragraphs. " \

db_schema_memory =f"""
DATABASE_SCHEMA:{db_schema_memory_data}
"""

business_rules = """
BUSINESS_LOGIC:

"""

def build_app_context():
    """Build app context dynamically based on current database configuration."""
    # Reload config from file to ensure we use the latest saved configuration
    reload_database_config_from_file()
    
    # Load the full config to get both PostgreSQL and Snowflake details
    config = load_database_config()
    
    # Get PostgreSQL database name
    pg_config = config.get("postgresql", {})
    selected_db = pg_config.get('dbname') or 'bank_db'
    
    # Get Snowflake database name
    sf_config = config.get("snowflake", {})
    sf_database = sf_config.get('database') or 'dev_dwh'
    
    return f"""
ENVIRONMENT_DETAILS:
- Current Environment: Development
- Connected Postgres Database: {selected_db} (Read-Write Access)
- Connected Snowflake Database: {sf_database} (Read-Write Access)
- Local Timezone: UTC
"""


migration_plan = """

"""

migration_rules = """

"""


def build_runtime_memory() -> str:
    """Build runtime memory dynamically with current configuration."""
    # Reload config to ensure we use the latest saved database configuration
    reload_database_config_from_file()
    
    # Rebuild schema memory based on current configuration
    # This ensures the agent queries the correct database
    current_schema_memory_data = build_db_schema_memory()
    current_db_schema_memory = f"""
DATABASE_SCHEMA:{current_schema_memory_data}
"""
    
    current_app_context = build_app_context()
    return f"{current_db_schema_memory}\n{business_rules}\n{current_app_context}\n{migration_plan}\n{migration_rules}"


server = MCPServerStreamableHTTP('http://localhost:8000/mcp')  

agent = Agent(instructions=f"""You are an expert SQL, Database, and Migration Assistant specializing in database querying, schema management, data transformation, and migration workflows.

                            """,
              toolsets=[server],    
              deps_type=SearchDeps
)


@agent.tool
async def search_pdf_documentation(ctx: RunContext[SearchDeps], query: str) -> str:
    """
    Search the uploaded PDF documentation for specific technical facts, 
    table structures, or business logic.
    """
    # Vectorize the user's query locally
    query_vector = ctx.deps.model.encode(query).tolist()
    
    # Search ChromaDB
    results = ctx.deps.collection.query(
        query_embeddings=[query_vector],
        n_results=3
    )
    
    # Flatten the list of documents into a single string for the LLM
    context = "\n---\n".join(results['documents'][0])
    return f"Relevant information found in PDF:\n{context}"

deps = SearchDeps(collection=collection, model=embedding_model)

#--------------------


# agent = pydantic_ai.Agent(
#     instructions="Help the user answer questions about two products ('repos'): Pydantic AI (pydantic-ai), an open source agent framework library, and Pydantic Logfire (logfire), an observability platform. Start by using the `search_docs` tool to search the relevant documentation and answer the question based on the search results. It uses a hybrid of semantic and keyword search, so writing either keywords or sentences may work. It's not searching google. Each search result starts with a path to a .md file. The file `foo/bar.md` corresponds to the URL `https://ai.pydantic.dev/foo/bar/` for Pydantic AI, `https://logfire.pydantic.dev/docs/foo/bar/` for Logfire. Include the URLs in your answer. The search results may not return complete files, or may not return the files you need. If they don't have what you need, you can use the `get_docs_file` tool. You probably only need to search once or twice, definitely not more than 3 times. The user doesn't see the search results, you need to actually return a summary of the info. To see the files that exist for the `get_docs_file` tool, along with a preview of the sections within, use the `get_table_of_contents` tool.",
# )

agent.tool_plain(get_table_of_contents)


@agent.tool_plain
def get_docs_file(repo: Repo, filename: str):
    """Get the full text of a documentation file by its filename, e.g. `foo/bar.md`."""
    if not filename.endswith('.md'):
        filename += '.md'
    path = get_docs_dir(repo) / filename
    if not path.exists():
        return f'File {filename} does not exist'
    return get_markdown(path)


@agent.tool_plain
def search_docs(repo: Repo, query: str):
    results = cast(
        list[dict[str, Any]],
        open_populated_table(repo)
        .search(  # type: ignore
            query,
            query_type='hybrid',
            vector_column_name='vector',
            fts_columns='text',
        )
        .limit(10)
        .to_list(),
    )
    results = [
        r
        for r in results
        if not any(
            r != r2
            and r['path'] == r2['path']
            and r['headers'][: len(r2['headers'])] == r2['headers']
            for r2 in results
        )
    ]

    return '\n\n---------\n\n'.join(r['text'] for r in results)


if __name__ == '__main__':
    # print(agent.run_sync('how do i see errors').output)
    # search_docs("logfire", "errors debugging view errors logs")
    agent.to_cli_sync()
