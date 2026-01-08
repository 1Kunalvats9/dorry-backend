# Dorry Backend - Comprehensive Analysis

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Technology Stack](#technology-stack)
3. [Database Schema](#database-schema)
4. [Core Services](#core-services)
5. [API Routes & Endpoints](#api-routes--endpoints)
6. [Authentication & Authorization](#authentication--authorization)
7. [Document Processing Pipeline](#document-processing-pipeline)
8. [RAG (Retrieval Augmented Generation) System](#rag-retrieval-augmented-generation-system)
9. [Event Detection System](#event-detection-system)
10. [External Services Integration](#external-services-integration)
11. [Data Flow Diagrams](#data-flow-diagrams)
12. [Security Features](#security-features)
13. [Error Handling](#error-handling)

---

## Architecture Overview

The Dorry backend is a **Node.js/Express.js** application built with **TypeScript** that implements a sophisticated **RAG (Retrieval Augmented Generation)** system for document-based AI chat. The architecture follows a **layered service pattern** with clear separation of concerns:

- **Routes Layer**: Handles HTTP requests and responses
- **Middleware Layer**: Authentication, error handling, file uploads
- **Service Layer**: Business logic and external API integrations
- **Data Layer**: Prisma ORM with PostgreSQL database
- **Vector Database**: Qdrant for semantic search

### Key Architectural Patterns:
- **RESTful API** design
- **Service-oriented architecture** with dedicated service modules
- **Asynchronous processing** for PDF handling
- **JWT-based authentication**
- **Multi-tenant data isolation** (user-scoped queries)

---

## Technology Stack

### Core Framework & Language
- **Runtime**: Node.js (ES Modules)
- **Language**: TypeScript 5.9.3
- **Web Framework**: Express.js 5.2.1
- **Build Tool**: TypeScript Compiler (tsc)

### Database & ORM
- **Database**: PostgreSQL
- **ORM**: Prisma 7.2.0
- **Connection Pooling**: pg (PostgreSQL client) with PrismaPg adapter

### Vector Database & Embeddings
- **Vector DB**: Qdrant (via @qdrant/js-client-rest 1.16.2)
- **Embedding Model**: Hugging Face Inference API
  - Model: `sentence-transformers/all-MiniLM-L6-v2`
  - Vector Dimensions: 384
  - Distance Metric: Cosine Similarity

### AI & ML Services
- **LLM Provider**: Google Gemini AI
  - Model: `gemini-2.5-flash`
  - Used for: Chat responses, event extraction

### File Storage & Processing
- **Cloud Storage**: Cloudinary
  - Used for: Temporary PDF storage
  - Auto-cleanup after processing
- **PDF Processing**: pdf-parse 1.1.1
  - Text extraction from PDF files

### Authentication
- **JWT**: jsonwebtoken 9.0.3
- **OAuth Provider**: Google (via google-auth-library 10.5.0)
  - Supports: Web, iOS, Android client IDs

### Security & Utilities
- **Security**: Helmet 8.1.0 (HTTP headers)
- **CORS**: cors 2.8.5
- **File Upload**: multer 2.0.2
- **Validation**: zod 4.2.1
- **UUID Generation**: uuid 13.0.0

### Development Tools
- **Dev Server**: ts-node-dev 2.0.0
- **Environment**: dotenv 17.2.3

---

## Database Schema

### Models Overview

#### 1. **User Model**
```prisma
- id: UUID (Primary Key)
- email: String (Unique)
- name: String? (Optional)
- googleId: String? (Unique, Optional)
- profilePhoto: String? (Optional)
- createdAt: DateTime
- updatedAt: DateTime
```

**Relationships:**
- One-to-Many with `Document`
- One-to-Many with `Chat`
- One-to-Many with `Chunk`
- One-to-Many with `DetectedEvent`

**Indexes:**
- `email` (for fast lookups)
- `googleId` (for OAuth lookups)

---

#### 2. **Document Model**
```prisma
- id: UUID (Primary Key)
- userId: String (Foreign Key → User)
- filename: String
- fileUrl: String (Cloudinary URL for PDFs)
- fileType: String ("text" | "pdf")
- content: Text (Full document text)
- uploadedAt: DateTime
```

**Relationships:**
- Many-to-One with `User`
- One-to-Many with `Chunk`
- One-to-Many with `DetectedEvent`

**Indexes:**
- `userId` (for user-scoped queries)
- `uploadedAt` (for sorting)

**Status States:**
- `processing`: PDF uploaded but not yet processed
- `ready`: Document processed and ready
- `failed`: Processing failed

---

#### 3. **Chunk Model**
```prisma
- id: UUID (Primary Key)
- documentId: String (Foreign Key → Document)
- userId: String (Foreign Key → User)
- content: Text (Chunk text content)
- qdrantPointId: String? (Optional, for reference)
- chunkIndex: Int (Order in document)
- tokenCount: Int (Default: 0)
- createdAt: DateTime
```

**Relationships:**
- Many-to-One with `Document`
- Many-to-One with `User`

**Indexes:**
- `documentId` (for document queries)
- `userId` (for user-scoped queries)
- `chunkIndex` (for ordering)

**Chunking Strategy:**
- Fixed-size chunks: 300 words per chunk
- Word-based splitting (preserves word boundaries)
- Sequential indexing for document reconstruction

---

#### 4. **Chat Model**
```prisma
- id: UUID (Primary Key)
- userId: String (Foreign Key → User)
- messages: Json (Array of {role, content})
- title: String? (Optional, auto-generated from first message)
- createdAt: DateTime
- updatedAt: DateTime
```

**Relationships:**
- Many-to-One with `User`

**Indexes:**
- `userId` (for user-scoped queries)
- `createdAt` (for sorting)

**Message Format:**
```typescript
[
  { role: "user", content: "..." },
  { role: "assistant", content: "..." }
]
```

---

#### 5. **DetectedEvent Model**
```prisma
- id: UUID (Primary Key)
- userId: String (Foreign Key → User)
- documentId: String (Foreign Key → Document)
- title: String (Event name)
- startTime: DateTime? (Optional)
- endTime: DateTime? (Optional)
- recurrence: String? (Optional, e.g., "daily", "weekly")
- confidence: Float (0.0 - 1.0)
- sourceText: Text (Original text snippet)
- createdAt: DateTime
```

**Relationships:**
- Many-to-One with `User`
- Many-to-One with `Document`

**Indexes:**
- `userId` (for user-scoped queries)
- `documentId` (for document queries)

**Event Detection:**
- Extracted via LLM (Gemini) from document content
- Minimum confidence threshold: 0.6
- Requires at least one time field or recurrence pattern

---

## Core Services

### 1. **Auth Service** (`auth.service.ts`)

**Purpose**: Handles user authentication and account management.

**Key Functions:**

#### `loginWithGoogleIdToken(idToken: string)`
- Verifies Google ID token (supports multiple client IDs: web, iOS, Android)
- Extracts user information (email, name, profile photo, Google ID)
- Creates or updates user in database
- Returns JWT token and user data

**Flow:**
1. Verify ID token with Google OAuth2Client
2. Extract payload (sub, email, name, picture)
3. Check if user exists by `googleId` or `email`
4. Create new user or update existing
5. Generate JWT token
6. Return token + user info

#### `getUserById(userId: string)`
- Fetches user information by ID
- Returns sanitized user data (no sensitive info)

#### `deleteUserAccount(userId: string)`
- Deletes user and all associated data (cascade)
- Cleans up Qdrant vectors for user
- Handles errors gracefully (continues even if Qdrant cleanup fails)

---

### 2. **Embedding Service** (`embedding.service.ts`)

**Purpose**: Converts text to vector embeddings for semantic search.

**Key Functions:**

#### `embedText(text: string): Promise<number[]>`
- Uses Hugging Face Inference API
- Model: `sentence-transformers/all-MiniLM-L6-v2`
- Returns 384-dimensional vector array
- Handles API errors with descriptive messages

**Vector Properties:**
- Dimensions: 384
- Normalized for cosine similarity
- Language-agnostic (works with multiple languages)

#### `chunkText(text: string, chunkSize = 300): string[]`
- Splits text into fixed-size chunks
- Chunk size: 300 words (default)
- Preserves word boundaries
- Normalizes whitespace
- Returns array of chunk strings

**Chunking Strategy:**
- Word-based (not character-based)
- Sequential indexing
- No overlap between chunks

---

### 3. **Qdrant Service** (`qdrant.service.ts`)

**Purpose**: Manages vector database operations for semantic search.

**Key Functions:**

#### `initQdrant()`
- Initializes Qdrant collection on server startup
- Creates collection `user_text_embeddings` if not exists
- Configures vector settings:
  - Size: 384 dimensions
  - Distance: Cosine
- Creates payload indexes:
  - `user_id` (required for filtering)
  - `document_id` (for document deletion)
  - `chunk_id` (optional, for reference)

#### `storeChunksInQdrant({ userId, documentId, chunks })`
- Converts chunks to embeddings
- Creates Qdrant points with:
  - UUID as point ID
  - 384-dim vector
  - Payload: `user_id`, `document_id`, `chunk_id`, `text`, `source_type`, `created_at`
- Upserts points to collection
- Waits for confirmation (`wait: true`)

#### `searchSimilarChunks(userId, queryText, limit = 5)`
- Embeds query text
- Performs vector similarity search
- Filters by `user_id` (multi-tenant isolation)
- Returns top N chunks with:
  - `chunk_id`
  - `document_id`
  - `text`
  - `score` (cosine similarity, 0-1)

#### `deleteUserChunks(userId)`
- Deletes all vectors for a user
- Used during account deletion

#### `deleteDocumentChunks(userId, documentId)`
- Deletes vectors for a specific document
- Used when document is deleted
- Filters by both `user_id` and `document_id`

---

### 4. **Gemini Service** (`gemini.service.ts`)

**Purpose**: Generates AI responses using Google Gemini.

**Key Functions:**

#### `generateResponseWithRAG(userQuery, contextChunks, conversationHistory)`
- Generates response with RAG (Retrieval Augmented Generation)
- Model: `gemini-2.5-flash`
- Inputs:
  - User query
  - Retrieved context chunks (from Qdrant)
  - Conversation history
- System prompt:
  - Natural, conversational tone
  - Same language as user
  - No mention of "context" or "sources"
  - Human-like responses
- Returns generated text

**Prompt Structure:**
```
System Guidelines
RELEVANT INFORMATION: [context chunks]
CONVERSATION HISTORY: [previous messages]
USER QUESTION: [query]
```

#### `generateGeneralResponse(userQuery, conversationHistory)`
- Generates response without RAG
- For general questions not related to documents
- Uses conversation history for context
- Same model and prompt style as RAG version

**Error Handling:**
- Detects 503 Service Unavailable errors
- Provides descriptive error messages
- Logs full error details for debugging

---

### 5. **PDF Processing Service** (`pdfProcessing.service.ts`)

**Purpose**: Processes PDF files asynchronously in the background.

**Key Functions:**

#### `processPDFInBackground({ documentId, userId, pdfBuffer, cloudinaryResult })`
- **Asynchronous background processing**
- Steps:
  1. Extract text from PDF using `pdf-parse`
  2. Update document record with extracted text
  3. Chunk the text (300 words per chunk)
  4. Create chunk records in database
  5. Generate embeddings and store in Qdrant
  6. Delete PDF from Cloudinary (cleanup)
  7. Trigger event detection (non-blocking)

**Error Handling:**
- Updates document with error message on failure
- Attempts Cloudinary cleanup even on error
- Logs detailed error information

#### `processPDFAsync(params)`
- Wrapper function for fire-and-forget processing
- Uses `setImmediate` to ensure response is sent first
- Handles errors without blocking

**Processing Flow:**
```
PDF Upload → Cloudinary → Database Record → Background Processing
  ↓
Text Extraction → Chunking → Embedding → Qdrant Storage
  ↓
Event Detection → Cloudinary Cleanup
```

---

### 6. **Event Detection Service** (`eventDetection.service.ts`)

**Purpose**: Extracts time-based events from document content using LLM.

**Key Functions:**

#### `detectEventsForDocument(documentId)`
- Extracts events from document content
- Steps:
  1. Fetch document and chunks
  2. Check if events already detected (skip if exists)
  3. Combine all chunks into single text
  4. Send to LLM for extraction
  5. Parse and sanitize events
  6. Create event records in database

**Event Schema:**
```typescript
{
  title: string;
  start_time: string | null;
  end_time: string | null;
  recurrence: string | null;
  confidence: number (0-1)
}
```

#### `extractEventsWithLLM(text)`
- Uses Gemini API (`generateGeneralResponse`)
- Structured prompt for JSON extraction
- Parses JSON from response (handles markdown code blocks)
- Returns array of events

**Validation:**
- Minimum confidence: 0.6
- Requires: title, confidence
- Requires at least one: start_time, end_time, or recurrence
- Sanitizes and normalizes data

**Error Handling:**
- Returns empty array on API errors (non-blocking)
- Logs detailed error information
- Continues processing even if event detection fails

---

## API Routes & Endpoints

### Base URL Structure
```
/api/auth/*      - Authentication endpoints
/api/ingest/*    - Document ingestion endpoints
/api/chat/*      - Chat endpoints
/api/documents/* - Document management endpoints
```

### Response Format
All endpoints return unified format:
```json
{
  "success": true | false,
  "data": { ... } | null,
  "error": "..." | null
}
```

---

### Authentication Routes (`/api/auth`)

#### `POST /api/auth/google/login`
**Purpose**: Login/register with Google ID token

**Request:**
```json
{
  "idToken": "google_id_token_string"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token",
    "user": { "id", "email", "name", "profilePhoto", "createdAt" }
  }
}
```

**Flow:**
1. Verify Google ID token
2. Create/update user
3. Generate JWT
4. Return token + user

---

#### `GET /api/auth/me`
**Purpose**: Get current authenticated user

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id", "email", "name", "profilePhoto", "createdAt", "updatedAt"
  }
}
```

---

#### `DELETE /api/auth/me`
**Purpose**: Delete user account and all data

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": { "message": "User account deleted successfully" }
}
```

**Cascade Deletes:**
- User record
- All documents
- All chunks (database + Qdrant)
- All chats
- All detected events

---

### Document Ingestion Routes (`/api/ingest`)

#### `POST /api/ingest`
**Purpose**: Ingest text content

**Headers:**
- `Authorization: Bearer <token>`

**Request:**
```json
{
  "text": "Your text content...",
  "filename": "optional-filename.txt"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "uuid",
    "chunksStored": 5
  }
}
```

**Flow:**
1. Create document record
2. Chunk text (300 words per chunk)
3. Create chunk records
4. Generate embeddings
5. Store in Qdrant
6. Return document ID and chunk count

---

#### `POST /api/ingest/pdf`
**Purpose**: Upload and process PDF file

**Headers:**
- `Authorization: Bearer <token>`
- `Content-Type: multipart/form-data`

**Request:**
- Form data with `file` field (PDF)

**Response:**
```json
{
  "success": true,
  "data": {
    "documentId": "uuid",
    "message": "PDF uploaded successfully. Processing in background...",
    "cloudinaryUrl": "https://..."
  }
}
```

**Flow:**
1. Upload PDF to Cloudinary
2. Create document record (content empty initially)
3. Trigger background processing
4. Return immediately (non-blocking)
5. Background: Extract text → Chunk → Embed → Store → Cleanup

**Status Tracking:**
- `processing`: Content is empty
- `ready`: Content populated
- `failed`: Content starts with "Processing failed:"

---

### Chat Routes (`/api/chat`)

#### `POST /api/chat`
**Purpose**: Send message and get AI response

**Headers:**
- `Authorization: Bearer <token>`

**Request:**
```json
{
  "message": "Your question",
  "chatId": "optional_chat_uuid",
  "useRAG": true
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "chatId": "uuid",
    "response": "AI generated response...",
    "retrievedChunks": [
      {
        "chunk_id": "uuid",
        "document_id": "uuid",
        "score": 0.85
      }
    ]
  }
}
```

**Flow:**
1. Create new chat or load existing
2. Add user message to history
3. If `useRAG`:
   - Search similar chunks in Qdrant
   - Generate RAG response with context
4. If not `useRAG`:
   - Generate general response
5. Add assistant response to history
6. Update chat record
7. Return response + retrieved chunks

**RAG vs General:**
- `useRAG: true`: Uses document context (default)
- `useRAG: false`: General AI response (no document context)

---

#### `GET /api/chat`
**Purpose**: Get all chats for user

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id", "title", "createdAt", "updatedAt", "messages": [...]
    }
  ]
}
```

**Ordering:** Most recent first (`updatedAt DESC`)

---

#### `GET /api/chat/:chatId`
**Purpose**: Get specific chat by ID

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id", "userId", "title", "messages", "createdAt", "updatedAt"
  }
}
```

---

#### `DELETE /api/chat/:chatId`
**Purpose**: Delete specific chat

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": { "message": "Chat deleted successfully" }
}
```

---

### Document Routes (`/api/documents`)

#### `GET /api/documents`
**Purpose**: Get all documents for user

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id", "filename", "fileType", "fileUrl", "uploadedAt",
      "_count": { "chunks": 5 }
    }
  ]
}
```

**Ordering:** Most recent first (`uploadedAt DESC`)

---

#### `GET /api/documents/:documentId`
**Purpose**: Get specific document with chunks

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "id", "userId", "filename", "fileType", "fileUrl",
    "content", "uploadedAt", "status", "chunks": [...]
  }
}
```

**Status Values:**
- `processing`: PDF not yet processed
- `ready`: Document ready
- `failed`: Processing failed

---

#### `GET /api/documents/:documentId/events`
**Purpose**: Get detected events for document

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [
      {
        "id", "title", "startTime", "endTime", "recurrence",
        "confidence", "sourceText", "createdAt"
      }
    ],
    "count": 3
  }
}
```

**Ordering:** Highest confidence first

---

#### `DELETE /api/documents/:documentId`
**Purpose**: Delete document and all associated data

**Headers:**
- `Authorization: Bearer <token>`

**Response:**
```json
{
  "success": true,
  "data": { "message": "Document deleted successfully" }
}
```

**Cascade Deletes:**
- Document record
- All chunks (database + Qdrant)
- All detected events

---

## Authentication & Authorization

### JWT-Based Authentication

**Token Generation:**
- Secret: `JWT_SECRET` environment variable
- Expiration: `JWT_EXPIRES_IN` (default: 1h)
- Payload: `{ userId, email }`

**Token Verification:**
- Middleware: `authenticateToken`
- Extracts token from `Authorization: Bearer <token>` header
- Verifies signature and expiration
- Attaches user to `req.user`

**Protected Routes:**
- All routes except `/api/auth/google/login` require authentication
- User ID extracted from token for data isolation

### Google OAuth Integration

**Supported Clients:**
- Web: `GOOGLE_CLIENT_ID`
- iOS: `GOOGLE_IOS_CLIENT_ID`
- Android: `GOOGLE_ANDROID_CLIENT_ID`

**Token Verification:**
- Verifies ID token with Google OAuth2Client
- Tries multiple client IDs if first fails
- Extracts: `sub` (Google ID), `email`, `name`, `picture`

**User Creation/Update:**
- Creates new user if not exists
- Updates existing user if found by email or Google ID
- Links Google account to existing email account if needed

---

## Document Processing Pipeline

### Text Ingestion Flow

```
1. User submits text
   ↓
2. Create Document record (fileType: "text")
   ↓
3. Chunk text (300 words per chunk)
   ↓
4. Create Chunk records in database
   ↓
5. Generate embeddings (Hugging Face)
   ↓
6. Store vectors in Qdrant
   ↓
7. Return success response
```

### PDF Ingestion Flow

```
1. User uploads PDF
   ↓
2. Upload to Cloudinary (temporary storage)
   ↓
3. Create Document record (content: "", status: "processing")
   ↓
4. Return immediate response
   ↓
5. [Background] Extract text from PDF
   ↓
6. [Background] Update document with extracted text
   ↓
7. [Background] Chunk text
   ↓
8. [Background] Create Chunk records
   ↓
9. [Background] Generate embeddings
   ↓
10. [Background] Store in Qdrant
   ↓
11. [Background] Delete PDF from Cloudinary
   ↓
12. [Background] Detect events (non-blocking)
```

**Status Tracking:**
- Client can poll `/api/documents/:id` to check status
- Status computed from `content` field:
  - Empty → `processing`
  - Starts with "Processing failed:" → `failed`
  - Otherwise → `ready`

---

## RAG (Retrieval Augmented Generation) System

### Overview
RAG combines semantic search with LLM generation to provide context-aware responses based on user's documents.

### Components

1. **Vector Database (Qdrant)**
   - Stores document chunks as 384-dim vectors
   - Enables fast similarity search

2. **Embedding Service (Hugging Face)**
   - Converts text to vectors
   - Model: `all-MiniLM-L6-v2`

3. **LLM Service (Gemini)**
   - Generates responses
   - Model: `gemini-2.5-flash`

### RAG Flow

```
1. User sends query
   ↓
2. Embed query text
   ↓
3. Search Qdrant for similar chunks (top 5)
   ↓
4. Filter by user_id (multi-tenant isolation)
   ↓
5. Format context chunks
   ↓
6. Send to Gemini with:
   - System prompt
   - Context chunks
   - Conversation history
   - User query
   ↓
7. Generate response
   ↓
8. Return response + retrieved chunks metadata
```

### Context Formatting
- Chunks joined with `\n\n---\n\n` separator
- No numbered references (natural flow)
- Conversation history formatted as dialogue

### Multi-Tenant Isolation
- All Qdrant queries filtered by `user_id`
- Users can only access their own document chunks
- Database queries scoped by `userId`

---

## Event Detection System

### Purpose
Automatically extracts time-based events from document content using LLM.

### Flow

```
1. Document processing completes
   ↓
2. Check if events already detected (skip if exists)
   ↓
3. Combine all chunks into single text
   ↓
4. Send to Gemini with structured prompt
   ↓
5. Parse JSON response (handle markdown code blocks)
   ↓
6. Sanitize events:
   - Filter by confidence >= 0.6
   - Validate required fields
   - Normalize data
   ↓
7. Create event records in database
   ↓
8. Return detection summary
```

### Event Schema
```typescript
{
  title: string;              // Event name
  start_time: string | null;  // ISO date string
  end_time: string | null;    // ISO date string
  recurrence: string | null;  // e.g., "daily", "weekly"
  confidence: number;        // 0.0 - 1.0
}
```

### Validation Rules
- Minimum confidence: 0.6
- Requires: title, confidence
- Requires at least one: start_time, end_time, or recurrence
- Date parsing: Returns null for invalid dates

### Error Handling
- Returns empty array on API errors (non-blocking)
- Logs detailed error information
- Does not block document processing

---

## External Services Integration

### 1. **Hugging Face Inference API**

**Purpose**: Text embeddings

**Configuration:**
- API Token: `HF_API_TOKEN`
- Model: `sentence-transformers/all-MiniLM-L6-v2`
- Endpoint: `featureExtraction`

**Usage:**
- Called for every chunk during ingestion
- Called for every user query during RAG search
- Returns 384-dimensional vectors

**Error Handling:**
- Descriptive error messages
- Throws errors for upstream handling

---

### 2. **Google Gemini API**

**Purpose**: LLM responses and event extraction

**Configuration:**
- API Key: `GEMINI_API_KEY`
- Model: `gemini-2.5-flash`

**Endpoints Used:**
- `generateContent`: For chat responses
- `generateGeneralResponse`: For event extraction

**Error Handling:**
- Detects 503 Service Unavailable
- Provides user-friendly error messages
- Logs full error details

---

### 3. **Qdrant Vector Database**

**Purpose**: Semantic search storage

**Configuration:**
- URL: `QDRANT_URL`
- API Key: `QDRANT_API_KEY`
- Collection: `user_text_embeddings`

**Operations:**
- `createCollection`: Initialize on startup
- `upsert`: Store embeddings
- `search`: Similarity search
- `delete`: Remove vectors

**Indexes:**
- `user_id`: Required for filtering
- `document_id`: For document deletion
- `chunk_id`: Optional reference

---

### 4. **Cloudinary**

**Purpose**: Temporary PDF storage

**Configuration:**
- Cloud Name: `CLOUDINARY_CLOUD_NAME`
- API Key: `CLOUDINARY_API_KEY`
- API Secret: `CLOUDINARY_API_SECRET`
- Folder: `pdfs/`

**Operations:**
- `upload_stream`: Upload PDF
- `destroy`: Delete PDF after processing

**Lifecycle:**
- Uploaded when PDF received
- Deleted after text extraction completes
- Temporary storage only (not permanent)

---

### 5. **Google OAuth**

**Purpose**: User authentication

**Configuration:**
- Client IDs: `GOOGLE_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `GOOGLE_ANDROID_CLIENT_ID`
- Redirect URI: `GOOGLE_REDIRECT_URI`

**Operations:**
- `verifyIdToken`: Verify ID token
- Supports multiple client IDs (web, iOS, Android)

---

## Data Flow Diagrams

### Complete User Journey: Document Upload → Chat

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /api/ingest/pdf
       ▼
┌─────────────────┐
│  Express Server │
└──────┬──────────┘
       │
       │ authenticateToken
       ▼
┌─────────────────┐
│  Ingest Route   │
└──────┬──────────┘
       │
       │ uploadToCloudinary
       ▼
┌─────────────────┐
│   Cloudinary    │
└──────┬──────────┘
       │
       │ Create Document
       ▼
┌─────────────────┐
│   PostgreSQL    │
└──────┬──────────┘
       │
       │ processPDFAsync (background)
       ▼
┌─────────────────┐
│ PDF Processing  │
└──────┬──────────┘
       │
       ├─► Extract text (pdf-parse)
       ├─► Chunk text
       ├─► Create chunks (PostgreSQL)
       ├─► Generate embeddings (Hugging Face)
       ├─► Store vectors (Qdrant)
       ├─► Delete PDF (Cloudinary)
       └─► Detect events (Gemini)
```

### RAG Chat Flow

```
┌─────────────┐
│   Client    │
└──────┬──────┘
       │
       │ POST /api/chat { message, useRAG: true }
       ▼
┌─────────────────┐
│  Chat Route     │
└──────┬──────────┘
       │
       │ searchSimilarChunks
       ▼
┌─────────────────┐
│ Embedding Svc   │ ──► Hugging Face API
└──────┬──────────┘
       │
       │ Query vector
       ▼
┌─────────────────┐
│  Qdrant Search  │
└──────┬──────────┘
       │
       │ Retrieved chunks
       ▼
┌─────────────────┐
│  Gemini Service │ ──► Google Gemini API
└──────┬──────────┘
       │
       │ AI Response
       ▼
┌─────────────────┐
│  Update Chat    │ ──► PostgreSQL
└──────┬──────────┘
       │
       │ Return response
       ▼
┌─────────────┐
│   Client    │
└─────────────┘
```

---

## Security Features

### 1. **Authentication**
- JWT-based token authentication
- Token expiration (configurable)
- Secure token verification

### 2. **Authorization**
- User-scoped data access
- Multi-tenant isolation (Qdrant filters)
- Database queries filtered by `userId`

### 3. **HTTP Security Headers**
- Helmet.js middleware
- Content Security Policy (disabled for flexibility)
- CORS enabled

### 4. **File Upload Security**
- File type validation (PDF only)
- File size limits (10MB)
- Memory storage (no disk writes)

### 5. **Input Validation**
- Request body validation
- Type checking
- Error handling for invalid inputs

### 6. **Error Handling**
- No sensitive data in error messages
- Detailed logging for debugging
- User-friendly error responses

### 7. **Data Isolation**
- All queries filtered by `userId`
- Qdrant searches scoped to user
- Cascade deletes ensure data cleanup

---

## Error Handling

### Error Response Format
```json
{
  "success": false,
  "error": "Error message"
}
```

### HTTP Status Codes
- `200`: Success
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (missing token)
- `403`: Forbidden (invalid token)
- `404`: Not Found (resource doesn't exist)
- `500`: Internal Server Error

### Error Handling Strategy
1. **Service Layer**: Throws descriptive errors
2. **Route Layer**: Catches errors and formats responses
3. **Middleware**: Handles authentication errors
4. **Background Jobs**: Logs errors, continues processing

### Error Logging
- Console logging for debugging
- Detailed error messages
- Stack traces in development

---

## Environment Variables

### Required Variables
```env
# Database
DATABASE_URL=postgresql://...

# JWT
JWT_SECRET=your_secret_key
JWT_EXPIRES_IN=1h

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_IOS_CLIENT_ID=...
GOOGLE_ANDROID_CLIENT_ID=...
GOOGLE_REDIRECT_URI=...

# Hugging Face
HF_API_TOKEN=...

# Google Gemini
GEMINI_API_KEY=...

# Qdrant
QDRANT_URL=...
QDRANT_API_KEY=...

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Server
PORT=3000
NODE_ENV=production|development
```

---

## Summary

The Dorry backend is a **sophisticated RAG-based document chat system** with the following key features:

1. **Multi-format Document Ingestion**: Text and PDF support
2. **Semantic Search**: Vector embeddings with Qdrant
3. **AI-Powered Chat**: Gemini LLM with RAG capabilities
4. **Event Detection**: Automatic extraction of time-based events
5. **Multi-tenant Architecture**: User-scoped data isolation
6. **Asynchronous Processing**: Background PDF processing
7. **Google OAuth**: Seamless authentication
8. **RESTful API**: Clean, consistent endpoints

The system is designed for **scalability**, **security**, and **user experience**, with robust error handling and comprehensive logging.

