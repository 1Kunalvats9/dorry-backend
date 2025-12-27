import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

export async function generateResponseWithRAG(
  userQuery: string,
  contextChunks: Array<{
    text: string;
    document_id?: string;
    score?: number;
  }>,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const contextText = contextChunks
    .map((chunk, index) => `[Context ${index + 1}]\n${chunk.text}`)
    .join("\n\n");

  const historyText = conversationHistory
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");

  const prompt = `You are a helpful AI assistant that answers questions based on the provided context from the user's documents.

${contextText ? `Here is the relevant context from the user's documents:\n\n${contextText}\n\n` : ""}${historyText ? `Previous conversation:\n${historyText}\n\n` : ""}User Question: ${userQuery}

Instructions:
- Answer the question based primarily on the provided context
- If the context doesn't contain enough information, say so clearly
- Be concise and accurate
- If you reference information from the context, indicate which context section it came from
- Maintain a helpful and professional tone

Answer:`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error(
      error instanceof Error
        ? `Failed to generate response: ${error.message}`
        : "Failed to generate response"
    );
  }
}

export async function generateGeneralResponse(
  userQuery: string,
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<string> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const historyText = conversationHistory
    .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
    .join("\n");

  const prompt = `You are a helpful AI assistant.

${historyText ? `Previous conversation:\n${historyText}\n\n` : ""}User Question: ${userQuery}

Please provide a helpful and accurate response.

Answer:`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error(
      error instanceof Error
        ? `Failed to generate response: ${error.message}`
        : "Failed to generate response"
    );
  }
}

