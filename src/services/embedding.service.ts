import hf from "../config/huggingFace.js";

export async function embedText(text: string): Promise<number[]> {
  try {
    const response = await hf.featureExtraction({
      model: "sentence-transformers/all-MiniLM-L6-v2",
      inputs: text,
    });

    const result = Array.isArray(response[0]) ? response[0] : response;
    if (Array.isArray(result) && result.length > 0 && Array.isArray(result[0])) {
      return result.flat() as number[];
    }
    return result as number[];
  } catch (err) {
    console.error("Embedding error:", err);
    throw new Error(
      err instanceof Error
        ? `HF embedding request failed: ${err.message}`
        : "HF embedding request failed"
    );
  }
}



export function chunkText(text: string, chunkSize = 300): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const words = normalized.split(" ");
  const chunks: string[] = [];

  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(" "));
  }

  return chunks;
}