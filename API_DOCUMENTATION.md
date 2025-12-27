# API Documentation

All API responses follow a unified format:

**Success Response:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Error Response:**
```json
{
  "success": false,
  "error": "Error message"
}
```

All authenticated endpoints require the `Authorization` header:
```
Authorization: Bearer <your_jwt_token>
```

---

## Authentication Routes (`/api/auth`)

### 1. Google Login
**POST** `/api/auth/google/login`

Login or register a user with Google ID token.

**Request Body:**
```json
{
  "idToken": "google_id_token_string"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "token": "jwt_token_string",
    "user": {
      "id": "user_uuid",
      "email": "user@example.com",
      "name": "User Name",
      "profilePhoto": "https://...",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "ID token is required"
}
```

**When to use:** Initial login/registration flow in your SwiftUI app.

---

### 2. Get Current User
**GET** `/api/auth/me`

Get the authenticated user's information.

**Headers:**
- `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "user_uuid",
    "email": "user@example.com",
    "name": "User Name",
    "profilePhoto": "https://...",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**When to use:** Fetch user profile, verify token validity, display user info.

---

### 3. Delete Account
**DELETE** `/api/auth/me`

Delete the authenticated user's account and all associated data.

**Headers:**
- `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "User account deleted successfully"
  }
}
```

**When to use:** Account deletion/settings screen.

---

## Document Ingestion Routes (`/api/ingest`)

### 1. Ingest Text
**POST** `/api/ingest`

Upload and process text content. Creates a document, chunks it, and stores embeddings in Qdrant.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "text": "Your text content here...",
  "filename": "optional-filename.txt"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "documentId": "document_uuid",
    "chunksStored": 5
  }
}
```

**Error Response (400):**
```json
{
  "success": false,
  "error": "Text is required"
}
```

**When to use:** 
- User pastes text content
- User uploads a text file
- Import content from external sources

---

## Chat Routes (`/api/chat`)

### 1. Send Message
**POST** `/api/chat`

Send a message and get AI response. Creates a new chat if `chatId` is not provided, or continues existing chat.

**Headers:**
- `Authorization: Bearer <token>`

**Request Body:**
```json
{
  "message": "Your question here",
  "chatId": "optional_chat_uuid",
  "useRAG": true
}
```

**Fields:**
- `message` (required): The user's message/question
- `chatId` (optional): Existing chat ID to continue conversation
- `useRAG` (optional, default: true): Whether to use RAG (retrieval from documents) or general response

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "chatId": "chat_uuid",
    "response": "AI generated response...",
    "retrievedChunks": [
      {
        "chunk_id": "chunk_uuid",
        "document_id": "document_uuid",
        "score": 0.85
      }
    ]
  }
}
```

**Error Response (400/404):**
```json
{
  "success": false,
  "error": "Message is required"
}
```

**When to use:**
- User sends a message in chat
- First message creates new chat, subsequent messages use `chatId`
- Set `useRAG: false` for general questions not related to documents

---

### 2. Get All Chats
**GET** `/api/chat`

Get all chats for the authenticated user, ordered by most recent.

**Headers:**
- `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "chat_uuid",
      "title": "Chat title",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z",
      "messages": [
        {
          "role": "user",
          "content": "User message"
        },
        {
          "role": "assistant",
          "content": "AI response"
        }
      ]
    }
  ]
}
```

**When to use:** Display chat list/history screen.

---

### 3. Get Specific Chat
**GET** `/api/chat/:chatId`

Get a specific chat by ID with full message history.

**Headers:**
- `Authorization: Bearer <token>`

**URL Parameters:**
- `chatId`: The chat UUID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "chat_uuid",
    "userId": "user_uuid",
    "title": "Chat title",
    "messages": [...],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Chat not found or access denied"
}
```

**When to use:** Load specific chat when user taps on it from chat list.

---

### 4. Delete Chat
**DELETE** `/api/chat/:chatId`

Delete a specific chat.

**Headers:**
- `Authorization: Bearer <token>`

**URL Parameters:**
- `chatId`: The chat UUID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Chat deleted successfully"
  }
}
```

**When to use:** User swipes to delete or taps delete button on chat.

---

## Document Routes (`/api/documents`)

### 1. Get All Documents
**GET** `/api/documents`

Get all documents for the authenticated user, ordered by most recent.

**Headers:**
- `Authorization: Bearer <token>`

**Success Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "document_uuid",
      "filename": "document.txt",
      "fileType": "text",
      "fileUrl": "",
      "uploadedAt": "2024-01-01T00:00:00.000Z",
      "_count": {
        "chunks": 5
      }
    }
  ]
}
```

**When to use:** Display documents list/library screen.

---

### 2. Get Specific Document
**GET** `/api/documents/:documentId`

Get a specific document with all its chunks.

**Headers:**
- `Authorization: Bearer <token>`

**URL Parameters:**
- `documentId`: The document UUID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "document_uuid",
    "userId": "user_uuid",
    "filename": "document.txt",
    "fileType": "text",
    "fileUrl": "",
    "content": "Full document content...",
    "uploadedAt": "2024-01-01T00:00:00.000Z",
    "chunks": [
      {
        "id": "chunk_uuid",
        "content": "Chunk content...",
        "chunkIndex": 0,
        "createdAt": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

**When to use:** View document details, edit document, see chunked content.

---

### 3. Delete Document
**DELETE** `/api/documents/:documentId`

Delete a specific document and all its chunks (from both database and Qdrant).

**Headers:**
- `Authorization: Bearer <token>`

**URL Parameters:**
- `documentId`: The document UUID

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "message": "Document deleted successfully"
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "error": "Document not found or access denied"
}
```

**When to use:** User deletes document from library.

---

## SwiftUI Integration Guide

### 1. Network Service Setup

Create a base network service:

```swift
import Foundation

class APIService {
    static let shared = APIService()
    private let baseURL = "https://your-api-url.com/api"
    
    private init() {}
    
    func request<T: Decodable>(
        endpoint: String,
        method: String = "GET",
        body: [String: Any]? = nil,
        token: String? = nil
    ) async throws -> T {
        guard let url = URL(string: "\(baseURL)\(endpoint)") else {
            throw APIError.invalidURL
        }
        
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        
        if let token = token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        
        if let body = body {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        
        let (data, response) = try await URLSession.shared.data(for: request)
        
        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        
        let decoded = try JSONDecoder().decode(APIResponse<T>.self, from: data)
        
        if decoded.success {
            return decoded.data
        } else {
            throw APIError.serverError(decoded.error)
        }
    }
}

enum APIError: Error {
    case invalidURL
    case invalidResponse
    case serverError(String)
}
```

### 2. Response Models

```swift
struct APIResponse<T: Decodable>: Decodable {
    let success: Bool
    let data: T?
    let error: String?
    
    enum CodingKeys: String, CodingKey {
        case success, data, error
    }
    
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        success = try container.decode(Bool.self, forKey: .success)
        
        if success {
            data = try container.decodeIfPresent(T.self, forKey: .data)
            error = nil
        } else {
            error = try container.decodeIfPresent(String.self, forKey: .error)
            data = nil
        }
    }
}
```

### 3. Usage Examples

**Login:**
```swift
let loginData = try await APIService.shared.request<LoginResponse>(
    endpoint: "/auth/google/login",
    method: "POST",
    body: ["idToken": googleIdToken]
)
```

**Send Chat Message:**
```swift
let chatResponse = try await APIService.shared.request<ChatResponse>(
    endpoint: "/chat",
    method: "POST",
    body: [
        "message": userMessage,
        "chatId": chatId,
        "useRAG": true
    ],
    token: userToken
)
```

**Get Documents:**
```swift
let documents = try await APIService.shared.request<[Document]>(
    endpoint: "/documents",
    token: userToken
)
```

---

## Error Handling

All endpoints return consistent error format:
- **400**: Bad Request (missing/invalid parameters)
- **401**: Unauthorized (missing/invalid token)
- **403**: Forbidden (invalid token)
- **404**: Not Found (resource doesn't exist or user doesn't have access)
- **500**: Internal Server Error

Always check the `success` field first, then handle `data` or `error` accordingly.

