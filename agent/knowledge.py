import chromadb
from sentence_transformers import SentenceTransformer
from pypdf import PdfReader
import os
import glob

# Setup
client = chromadb.PersistentClient(path="./my_local_db")
model = SentenceTransformer('all-MiniLM-L6-v2')

def get_pdf_files(directory="./"):
    """Get all PDF files from a directory"""
    pdf_files = glob.glob(os.path.join(directory, "*.pdf"))
    return [os.path.basename(f) for f in pdf_files]

def create_collection(name):
    """Create a new collection"""
    try:
        collection = client.get_or_create_collection(name)
        print(f"✓ Collection '{name}' created/accessed successfully")
        return collection
    except Exception as e:
        print(f"✗ Error creating collection: {e}")
        return None

def delete_collection(name):
    """Delete an existing collection"""
    try:
        client.delete_collection(name)
        print(f"✓ Collection '{name}' deleted successfully")
        return True
    except Exception as e:
        print(f"✗ Error deleting collection: {e}")
        return False

def list_collections():
    """List all collections"""
    try:
        collections = client.list_collections()
        if not collections:
            print("No collections found.")
            return []
        print("\n📚 Available Collections:")
        for i, collection in enumerate(collections, 1):
            count = collection.count()
            print(f"  {i}. {collection.name} ({count} documents)")
        return [c.name for c in collections]
    except Exception as e:
        print(f"✗ Error listing collections: {e}")
        return []

def get_chunks_from_pdf(pdf_path, chunk_size=600, overlap=100):
    """Extract and chunk PDF with overlap for better context"""
    try:
        reader = PdfReader(pdf_path)
        full_text = ""
        for page in reader.pages:
            content = page.extract_text()
            if content:
                full_text += content + "\n"

        if not full_text.strip():
            print(f"⚠️  No text extracted from {pdf_path}")
            return []

        # Split into chunks with overlap
        chunks = []
        for i in range(0, len(full_text), chunk_size - overlap):
            chunk = full_text[i:i + chunk_size].strip()
            if chunk:
                chunks.append(chunk)

        print(f"✓ Extracted {len(chunks)} chunks from {os.path.basename(pdf_path)}")
        return chunks
    except Exception as e:
        print(f"✗ Error processing PDF {pdf_path}: {e}")
        return []

def load_pdf_to_collection(collection_name, pdf_path):
    """Load a PDF into a specific collection"""
    collection = create_collection(collection_name)
    if not collection:
        return False

    chunks = get_chunks_from_pdf(pdf_path)
    if not chunks:
        return False

    try:
        # Create unique IDs for this file
        base_name = os.path.basename(pdf_path)
        ids = [f"{base_name}_{i}" for i in range(len(chunks))]

        # Generate embeddings
        print("🔄 Generating embeddings...")
        embeddings = model.encode(chunks).tolist()

        # Add to collection
        collection.add(
            ids=ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=[{"source": base_name, "chunk_id": i} for i in range(len(chunks))]
        )

        print(f"✓ Successfully loaded {len(chunks)} chunks into collection '{collection_name}'")
        return True
    except Exception as e:
        print(f"✗ Error loading data: {e}")
        return False

def search_collection(collection_name, query_text, n_results=3):
    """Search within a specific collection"""
    try:
        collection = client.get_collection(collection_name)
        query_vector = model.encode(query_text).tolist()

        results = collection.query(
            query_embeddings=[query_vector],
            n_results=n_results,
            include=['documents', 'metadatas', 'distances']
        )

        return results
    except Exception as e:
        print(f"✗ Error searching collection: {e}")
        return None

def display_search_results(results, query):
    """Display search results in a nice format"""
    if not results or not results['documents']:
        print("No results found.")
        return

    print(f"\n🔍 Search Results for: '{query}'")
    print("=" * 50)

    for i, (doc, metadata, distance) in enumerate(zip(
        results['documents'][0],
        results['metadatas'][0],
        results['distances'][0]
    ), 1):
        print(f"\n📄 Result {i} (Similarity: {distance:.3f})")
        print(f"   Source: {metadata['source']}")
        print(f"   Content: {doc[:200]}{'...' if len(doc) > 200 else ''}")
        print("-" * 30)

def show_menu():
    """Display the main menu"""
    print("\n" + "="*50)
    print("🧠 PDF Knowledge Base Manager")
    print("="*50)
    print("1. 📋 View Collections & Documents")
    print("2. 📤 Load New PDF Data")
    print("3. 🗑️  Delete Collection")
    print("4. 🔍 Search in Collection")
    print("5. 📁 List Available PDF Files")
    print("6. 🚪 Exit")
    print("="*50)

def handle_view_collections():
    """Handle viewing collections"""
    collections = list_collections()
    if collections:
        print(f"\nTotal collections: {len(collections)}")
    else:
        print("\nNo collections found. Create one by loading PDF data first.")

def handle_load_data():
    """Handle loading new PDF data"""
    # List available PDFs
    pdf_files = get_pdf_files()
    if not pdf_files:
        print("❌ No PDF files found in current directory.")
        print("Please place PDF files in the same directory as this script.")
        return

    print("\n📁 Available PDF files:")
    for i, pdf in enumerate(pdf_files, 1):
        print(f"  {i}. {pdf}")

    try:
        choice = int(input("\nSelect PDF file (number): ")) - 1
        if 0 <= choice < len(pdf_files):
            selected_pdf = pdf_files[choice]
            collection_name = input("Enter collection name: ").strip()

            if not collection_name:
                print("❌ Collection name cannot be empty.")
                return

            print(f"\n🔄 Loading {selected_pdf} into collection '{collection_name}'...")
            success = load_pdf_to_collection(collection_name, selected_pdf)
            if success:
                print("✅ Data loaded successfully!")
            else:
                print("❌ Failed to load data.")
        else:
            print("❌ Invalid selection.")
    except ValueError:
        print("❌ Please enter a valid number.")

def handle_delete_collection():
    """Handle deleting a collection"""
    collections = list_collections()
    if not collections:
        return

    try:
        choice = int(input("\nSelect collection to delete (number): ")) - 1
        if 0 <= choice < len(collections):
            collection_name = collections[choice]
            confirm = input(f"Are you sure you want to delete '{collection_name}'? (y/N): ").lower()
            if confirm == 'y':
                success = delete_collection(collection_name)
                if success:
                    print("✅ Collection deleted successfully!")
                else:
                    print("❌ Failed to delete collection.")
            else:
                print("Operation cancelled.")
        else:
            print("❌ Invalid selection.")
    except ValueError:
        print("❌ Please enter a valid number.")

def handle_search():
    """Handle searching in a collection"""
    collections = list_collections()
    if not collections:
        return

    try:
        choice = int(input("\nSelect collection to search (number): ")) - 1
        if 0 <= choice < len(collections):
            collection_name = collections[choice]
            query = input("Enter search query: ").strip()

            if not query:
                print("❌ Search query cannot be empty.")
                return

            results = search_collection(collection_name, query)
            if results:
                display_search_results(results, query)
            else:
                print("❌ Search failed.")
        else:
            print("❌ Invalid selection.")
    except ValueError:
        print("❌ Please enter a valid number.")

def handle_list_pdfs():
    """Handle listing available PDF files"""
    pdf_files = get_pdf_files()
    if not pdf_files:
        print("❌ No PDF files found in current directory.")
        print("Please place PDF files in the same directory as this script.")
    else:
        print(f"\n📁 Found {len(pdf_files)} PDF file(s):")
        for i, pdf in enumerate(pdf_files, 1):
            file_size = os.path.getsize(pdf) / 1024  # KB
            print(f"  {i}. {pdf} ({file_size:.1f} KB)")

def main():
    """Main application loop"""
    print("🚀 Starting PDF Knowledge Base Manager...")

    while True:
        show_menu()
        try:
            choice = input("Select option (1-6): ").strip()

            if choice == '1':
                handle_view_collections()
            elif choice == '2':
                handle_load_data()
            elif choice == '3':
                handle_delete_collection()
            elif choice == '4':
                handle_search()
            elif choice == '5':
                handle_list_pdfs()
            elif choice == '6':
                print("👋 Goodbye!")
                break
            else:
                print("❌ Invalid option. Please select 1-6.")

            input("\nPress Enter to continue...")

        except KeyboardInterrupt:
            print("\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"❌ An error occurred: {e}")
            input("\nPress Enter to continue...")

if __name__ == "__main__":
    main()