#!/usr/bin/env python3
"""
KAI Database Manager - Local Utility

Manage chat history and RAG database locally.
Allows viewing, exporting, and managing both databases without API calls.

Usage:
    python manage_databases.py view-chat          # View all chat history
    python manage_databases.py view-rag           # View RAG documents
    python manage_databases.py export-chat        # Export chat history to JSON
    python manage_databases.py export-rag         # Export RAG info to JSON
    python manage_databases.py search-chat "text" # Search in chat messages
"""

import sqlite3
import json
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

# Database paths
BACKEND_DIR = Path(__file__).parent / "backend"
CHAT_DB = BACKEND_DIR / "kai_dev.db"
RAG_DB = BACKEND_DIR / "ai_database" / "chroma.sqlite3"


class ChatHistoryManager:
    """Manage chat history from kai_dev.db"""
    
    def __init__(self, db_path: Path = CHAT_DB):
        self.db_path = db_path
        if not db_path.exists():
            print(f"❌ Chat database not found at {db_path}")
            sys.exit(1)
    
    def view_all_conversations(self):
        """Display all conversations"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT id, user_id, course_id, title, is_deleted, created_at, updated_at
                FROM conversations
                ORDER BY created_at DESC
            """)
            
            conversations = cursor.fetchall()
            
            if not conversations:
                print("📭 No conversations found")
                return
            
            print(f"\n📚 Total Conversations: {len(conversations)}\n")
            print("=" * 100)
            
            for conv in conversations:
                status = "🗑️  DELETED" if conv['is_deleted'] else "✅ ACTIVE"
                print(f"ID: {conv['id']}")
                print(f"Title: {conv['title']}")
                print(f"User: {conv['user_id']}")
                print(f"Status: {status}")
                print(f"Created: {conv['created_at']}")
                print("-" * 100)
                
                # Get messages in this conversation
                cursor.execute("""
                    SELECT id, role, content, created_at
                    FROM messages
                    WHERE conversation_id = ?
                    ORDER BY created_at
                """, (conv['id'],))
                
                messages = cursor.fetchall()
                print(f"Messages ({len(messages)}):")
                for msg in messages:
                    preview = msg['content'][:60] + "..." if len(msg['content']) > 60 else msg['content']
                    print(f"  [{msg['role'].upper()}] {preview}")
                print()
            
        finally:
            conn.close()
    
    def search_messages(self, query: str):
        """Search for text in chat messages"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT m.id, m.role, m.content, c.title, m.created_at
                FROM messages m
                JOIN conversations c ON m.conversation_id = c.id
                WHERE m.content LIKE ?
                ORDER BY m.created_at DESC
            """, (f"%{query}%",))
            
            results = cursor.fetchall()
            
            if not results:
                print(f"❌ No messages found containing '{query}'")
                return
            
            print(f"\n🔍 Search Results for '{query}': {len(results)} found\n")
            print("=" * 100)
            
            for msg in results:
                print(f"Conversation: {msg['title']}")
                print(f"Role: {msg['role'].upper()}")
                print(f"Message: {msg['content']}")
                print(f"Time: {msg['created_at']}")
                print("-" * 100)
            
        finally:
            conn.close()
    
    def export_to_json(self, output_file: Path = None):
        """Export all chat history to JSON"""
        if output_file is None:
            output_file = BACKEND_DIR / "chat_history_export.json"
        
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            cursor.execute("""
                SELECT id, user_id, course_id, title, created_at, updated_at
                FROM conversations
                ORDER BY created_at DESC
            """)
            
            conversations = cursor.fetchall()
            export_data = []
            
            for conv in conversations:
                conv_data = dict(conv)
                
                # Get messages
                cursor.execute("""
                    SELECT id, role, content, created_at
                    FROM messages
                    WHERE conversation_id = ?
                    ORDER BY created_at
                """, (conv['id'],))
                
                messages = [dict(msg) for msg in cursor.fetchall()]
                conv_data['messages'] = messages
                export_data.append(conv_data)
            
            # Write to file
            with open(output_file, 'w') as f:
                json.dump(export_data, f, indent=2, default=str)
            
            print(f"✅ Exported {len(export_data)} conversations to {output_file}")
        
        finally:
            conn.close()


class RAGDatabaseManager:
    """Manage RAG database from chroma.sqlite3"""
    
    def __init__(self, db_path: Path = RAG_DB):
        self.db_path = db_path
        if not db_path.exists():
            print(f"❌ RAG database not found at {db_path}")
            sys.exit(1)
    
    def view_documents(self):
        """Display all RAG documents and chunks"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        try:
            # Get all tables first
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            
            print(f"\n📦 RAG Database Tables: {', '.join(tables)}\n")
            
            # Try to get document info
            for table in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) as count FROM {table}")
                    count = cursor.fetchone()['count']
                    print(f"📄 Table '{table}': {count} records")
                except:
                    pass
            
            print("\n" + "=" * 100)
            print("RAG Database contains:")
            print("- Uploaded documents (PDFs, TXT, Markdown)")
            print("- Document chunks (split into smaller pieces for AI)")
            print("- Vector embeddings (AI-readable format)")
            print(f"- Total size: {self.db_path.stat().st_size / 1024:.2f} KB")
            
        finally:
            conn.close()
    
    def export_to_json(self, output_file: Path = None):
        """Export RAG metadata to JSON"""
        if output_file is None:
            output_file = BACKEND_DIR / "rag_database_export.json"
        
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()
        
        try:
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = {row[0]: [] for row in cursor.fetchall()}
            
            export_data = {
                "timestamp": datetime.now().isoformat(),
                "database": "RAG (ChromaDB)",
                "tables": tables
            }
            
            # Export table info
            for table in tables.keys():
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    count = cursor.fetchone()[0]
                    export_data["tables"][table] = count
                except:
                    export_data["tables"][table] = 0
            
            # Write to file
            with open(output_file, 'w') as f:
                json.dump(export_data, f, indent=2, default=str)
            
            print(f"✅ Exported RAG info to {output_file}")
        
        finally:
            conn.close()


def main():
    """Main CLI interface"""
    
    if len(sys.argv) < 2:
        print(__doc__)
        return
    
    command = sys.argv[1]
    
    # Chat history commands
    if command == "view-chat":
        ChatHistoryManager().view_all_conversations()
    
    elif command == "export-chat":
        ChatHistoryManager().export_to_json()
    
    elif command == "search-chat":
        if len(sys.argv) < 3:
            print("❌ Usage: python manage_databases.py search-chat 'text'")
            return
        query = " ".join(sys.argv[2:])
        ChatHistoryManager().search_messages(query)
    
    # RAG commands
    elif command == "view-rag":
        RAGDatabaseManager().view_documents()
    
    elif command == "export-rag":
        RAGDatabaseManager().export_to_json()
    
    # Status
    elif command == "status":
        print("\n📊 Database Status\n")
        print(f"Chat History DB: {CHAT_DB}")
        print(f"  Exists: {'✅ Yes' if CHAT_DB.exists() else '❌ No'}")
        if CHAT_DB.exists():
            print(f"  Size: {CHAT_DB.stat().st_size / 1024:.2f} KB")
        
        print(f"\nRAG Database: {RAG_DB}")
        print(f"  Exists: {'✅ Yes' if RAG_DB.exists() else '❌ No'}")
        if RAG_DB.exists():
            print(f"  Size: {RAG_DB.stat().st_size / 1024:.2f} KB")
    
    else:
        print(f"❌ Unknown command: {command}")
        print(__doc__)


if __name__ == "__main__":
    main()
