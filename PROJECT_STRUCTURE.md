# NEXUS Project Structure

## 📁 Root Directory
```
advance genai project/
├── .gitignore                    # Git ignore file
├── .venv/                       # Python virtual environment
├── START_HERE.md                 # Project setup guide
├── auth-bff/                    # Authentication backend-for-frontend
├── backend/                      # Main FastAPI backend
├── calendar-mcp/                 # Calendar MCP server files
├── calendar_mcp_standalone.py     # Standalone calendar server
├── frontend/                     # React frontend application
├── manage_databases.py           # Database management script
├── node_modules/                 # Node.js dependencies
├── package-lock.json            # Node.js dependency lock
├── package.json                # Node.js project config
├── setup_db.ps1               # Database setup script
├── start-auth-bff.bat         # Auth server startup script
├── test_api.json              # API testing file
├── test_clear_history.py      # History clearing test
├── test_groq.py              # Groq API test
└── test_transcription.py       # Transcription test
```

## 🐍 Backend Structure
```
backend/
├── .env                       # Environment variables
├── .env.example              # Environment template
├── .python-version            # Python version spec
├── .venv/                   # Python virtual env
├── ai_database/              # Chroma vector database
├── alembic/                 # Database migrations
├── alembic.ini              # Alembic config
├── app/                     # Main application code
├── calendar_mcp_requirements.txt  # Calendar server deps
├── calendar_mcp_server.py        # Calendar server implementation
├── calendar_mcp_standalone.py  # Standalone calendar server
├── nexus_dev.db             # SQLite database
├── pyproject.toml           # Python project config
├── requirements.txt         # Python dependencies
├── setup.ps1              # Setup script
└── uv.lock                # Dependency lock file
```

## 📦 Backend App Structure
```
backend/app/
├── __init__.py
├── __pycache__/           # Python bytecode cache
├── agent/                 # AI agent functionality
├── api/                   # API routes
├── auth/                  # Authentication logic
├── config.py              # Configuration settings
├── db/                    # Database models and session
├── dependencies.py         # Dependency injection
├── formatting.py          # Response formatting
├── llm/                   # LLM clients (Groq)
├── main.py                # FastAPI application entry
├── mcp/                   # MCP (Model Context Protocol) integration
├── rag/                   # RAG (Retrieval Augmented Generation)
└── schemas/               # Pydantic models
```

## ⚛️ Frontend Structure
```
frontend/
├── .env                    # Frontend environment
├── .env.local             # Local environment overrides
├── .gitignore             # Git ignore
├── .vite-source-tags.js   # Vite source tags
├── MCP_INTEGRATION_GUIDE.md # MCP integration guide
├── README.md              # Frontend documentation
├── api/                   # API client code
├── dist/                  # Build output
├── eslint.config.js        # ESLint configuration
├── index.html             # HTML entry point
├── node_modules/          # Node.js dependencies
├── package-lock.json       # Dependency lock
├── package.json          # Project configuration
├── public/               # Static assets
├── requirements.txt       # Python requirements (for some tools)
├── src/                  # Source code
├── tsconfig.app.json     # TypeScript config (app)
├── tsconfig.json         # TypeScript config
├── tsconfig.node.json    # TypeScript config (Node)
├── vercel.json          # Vercel deployment config
└── vite.config.ts        # Vite bundler config
```

## 🎨 Frontend Source Structure
```
frontend/src/
├── App.css                 # App styles
├── App.tsx               # Main React component
├── assets/                # Static assets
├── components/            # Reusable components
├── features/              # Feature-based components
├── index.css              # Global styles
├── main.tsx              # Application entry point
├── shared/               # Shared utilities
└── vite-env.d.ts         # Vite type definitions
```

## 📁 Key Features Directory
```
frontend/src/features/
├── chat/                  # Chat interface
├── courses/               # Course management
├── dashboard/             # Main dashboard
├── examiner/              # Exam generation
├── progress/              # Progress tracking
├── profile/               # User profile
└── scribe/               # Audio transcription
```

## 🔧 Key Components
```
frontend/src/components/
├── GlassCard.tsx          # Glass morphism card
├── Layout/                # Layout components
├── ui/                   # UI components
└── MCPAdapterExamples.tsx # MCP integration examples
```

## 🛠️ Shared Utilities
```
frontend/src/shared/
├── api/                   # API client
├── components/             # Shared components
├── hooks/                 # React hooks
├── types.ts               # TypeScript types
└── utils.ts               # Utility functions
```

## 🔌 API Structure
```
backend/app/api/v1/
├── __init__.py
├── __pycache__/
├── auth.py                # Authentication endpoints
├── chat.py                # Chat/streaming endpoints
├── courses.py             # Course management
├── documents.py           # Document handling
├── examiner.py            # Exam generation
├── progress.py            # Progress tracking
├── router.py              # Route aggregation
└── scribe.py             # Audio transcription
```

## 🗄️ Database Models
```
backend/app/db/
├── __init__.py
├── __pycache__/
├── models.py              # SQLAlchemy models
├── session.py             # Database session
└── vector_store.py        # Vector database operations
```

## 🤖 AI/LLM Integration
```
backend/app/llm/
├── __init__.py
├── __pycache__/
└── groq_client.py        # Groq API client
```

## 🔍 RAG System
```
backend/app/rag/
├── __init__.py
├── __pycache__/
├── embeddings.py          # Text embeddings
├── prompt.py             # Prompt engineering
├── retriever.py          # Document retrieval
└── vector_store.py       # Vector operations
```

## 📅 MCP Integration
```
backend/app/mcp/
├── __init__.py
├── __pycache__/
└── calendar_mcp.py       # Calendar MCP server
```

## 🎯 Key Features
- **Chat**: Real-time AI conversation with streaming
- **Scribe**: Audio transcription and note generation
- **Examiner**: Automated exam paper generation
- **Courses**: Course and document management
- **Progress**: Learning progress tracking
- **Calendar**: MCP-based calendar integration
- **Auth**: JWT-based authentication

## 🔧 Technology Stack
- **Backend**: FastAPI, SQLAlchemy, Alembic
- **Frontend**: React, TypeScript, Vite, TailwindCSS
- **AI**: Groq LLM, Whisper transcription
- **Database**: PostgreSQL, Chroma (vector)
- **Authentication**: JWT tokens
- **Real-time**: Server-Sent Events (SSE)
