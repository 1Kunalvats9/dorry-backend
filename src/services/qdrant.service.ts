import qdrant from "../config/qdrant.js"
import { embedText } from "./embedding.service.js";
import { v4 as uuidv4 } from 'uuid';

export async function storeChunksInQdrant({
  userId,       
  documentId,
  chunks,
}: {
  userId: string;
  documentId: string;
  chunks: { chunk_id: string; text: string }[];
}) {
  if (!chunks.length) return;

  const points = [];

  for (const chunk of chunks) {
    const vector = await embedText(chunk.text);

    points.push({
      id: uuidv4(),
      vector,
      payload: {
        user_id: userId,
        document_id: documentId,
        chunk_id: chunk.chunk_id,
        text: chunk.text,
        source_type: "text",
        created_at: new Date().toISOString(),
      },
    });
  }

  await qdrant.upsert("user_text_embeddings", {
    wait: true,
    points,
  });
}


async function createPayloadIndexIfNeeded(collectionName: string, fieldName: string) {
  try {
    // Check if method exists (some versions might use different method names)
    if (typeof qdrant.createPayloadIndex !== 'function') {
      console.warn(`⚠️ createPayloadIndex method not available. Index for ${fieldName} needs to be created manually.`);
      return false;
    }

    // Try with string format first (simpler API)
    try {
      await qdrant.createPayloadIndex(collectionName, {
        field_name: fieldName,
        field_schema: "keyword",
      });
      console.log(`✅ Created index for ${fieldName}`);
      return true;
    } catch (formatErr: any) {
      // If string format fails, try with object format
      const formatErrorMsg = formatErr.data?.status?.error || formatErr.message || "";
      if (formatErrorMsg.includes("schema") || formatErrorMsg.includes("type")) {
        try {
          await qdrant.createPayloadIndex(collectionName, {
            field_name: fieldName,
            field_schema: { type: "keyword" },
          });
          console.log(`✅ Created index for ${fieldName} (using object schema format)`);
          return true;
        } catch (objectErr: any) {
          // If both formats fail, handle the error below
          throw objectErr;
        }
      } else {
        // Re-throw if it's not a schema format error
        throw formatErr;
      }
    }
  } catch (err: any) {
    // Index might already exist - check error message
    const errorMessage = err.data?.status?.error || err.message || "";
    
    // If method doesn't exist, it will throw a TypeError
    if (err instanceof TypeError) {
      console.warn(`⚠️ createPayloadIndex method not found. Index for ${fieldName} needs to be created manually via Qdrant API.`);
      return false;
    }
    
    if (err.status === 400) {
      if (errorMessage.includes("already exists")) {
        console.log(`ℹ️ Index for ${fieldName} already exists`);
        return true;
      } else if (errorMessage.includes("Index required but not found")) {
        console.warn(`⚠️ Index for ${fieldName} creation failed: ${errorMessage}. Please create it manually via Qdrant dashboard or API.`);
        return false;
      }
    }
    
    // Log other errors
    if (err.status && err.status !== 400) {
      console.warn(`❌ Error creating ${fieldName} index (${err.status}):`, errorMessage);
    } else {
      console.warn(`❌ Error creating ${fieldName} index:`, errorMessage);
    }
    return false;
  }
}

export async function initQdrant() {
  const collectionName = "user_text_embeddings";
  let collectionExists = false;

  try {
    await qdrant.getCollection(collectionName);
    collectionExists = true;
    console.log("Qdrant collection exists");
  } catch (err: any) {
    if (err.status === 404) {
      await qdrant.createCollection(collectionName, {
        vectors: {
          size: 384,
          distance: "Cosine",
        },
      });
      collectionExists = true;
      console.log("✅ Qdrant collection created");
    } else {
      throw err;
    }
  }

  // Create indexes for payload fields (always try, even if collection existed)
  if (collectionExists) {
    console.log("Creating payload indexes...");
    
    // Create index for user_id field (required for filtering)
    await createPayloadIndexIfNeeded(collectionName, "user_id");
    
    // Create index for document_id field (used in delete operations)
    await createPayloadIndexIfNeeded(collectionName, "document_id");
    
    // Create index for chunk_id field (optional but useful)
    await createPayloadIndexIfNeeded(collectionName, "chunk_id");
    
    console.log("Payload index setup completed");
  }
}

export async function searchSimilarChunks(
  userId: string,
  queryText: string,
  limit: number = 5
): Promise<Array<{
  chunk_id: string;
  document_id: string;
  text: string;
  score: number;
}>> {
  const { embedText } = await import("./embedding.service.js");
  
  const queryVector = await embedText(queryText);

  const searchResult = await qdrant.search("user_text_embeddings", {
    vector: queryVector,
    limit,
    filter: {
      must: [
        {
          key: "user_id",
          match: {
            value: userId,
          },
        },
      ],
    },
    with_payload: true,
  });

  return searchResult.map((point) => ({
    chunk_id: point.payload?.chunk_id as string,
    document_id: point.payload?.document_id as string,
    text: point.payload?.text as string || "",
    score: point.score || 0,
  }));
}

export async function deleteUserChunks(userId: string): Promise<void> {
  await qdrant.delete("user_text_embeddings", {
    wait: true,
    filter: {
      must: [
        {
          key: "user_id",
          match: {
            value: userId,
          },
        },
      ],
    },
  });
}

export async function deleteDocumentChunks(
  userId: string,
  documentId: string
): Promise<void> {
  await qdrant.delete("user_text_embeddings", {
    wait: true,
    filter: {
      must: [
        {
          key: "user_id",
          match: {
            value: userId,
          },
        },
        {
          key: "document_id",
          match: {
            value: documentId,
          },
        },
      ],
    },
  });
}
