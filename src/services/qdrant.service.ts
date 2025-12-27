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


export async function initQdrant() {
  try {
    await qdrant.getCollection("user_text_embeddings");
    console.log("Qdrant collection exists");
  } catch (err: any) {
    if (err.status === 404) {
      await qdrant.createCollection("user_text_embeddings", {
        vectors: {
          size: 384,
          distance: "Cosine",
        },
      });
      console.log("Qdrant collection created");
    } else {
      throw err;
    }
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
