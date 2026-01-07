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

  // Format context naturally without numbered references
  const contextText = contextChunks
    .map((chunk) => chunk.text.trim())
    .filter((text) => text.length > 0)
    .join("\n\n---\n\n");

  // Format conversation history properly
  const historyText = conversationHistory
    .map((msg) => {
      if (msg.role === "user") {
        return `User: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    })
    .join("\n\n");

  const systemPrompt = `You are a helpful, friendly AI assistant. Answer questions naturally and conversationally, as if you're having a friendly chat with the user.

IMPORTANT GUIDELINES:
- Answer in the SAME LANGUAGE as the user's question
- Use the provided context to inform your answer, but DO NOT mention "context", "documents", "sources", or reference numbers
- Respond naturally as if the information comes from your own knowledge
- Never say things like "Based on the context", "According to the provided information", "From Context 1/2/3", etc.
- If information is missing from the context, say so naturally without mentioning "context"
- Be conversational, warm, and human-like in your responses
- Only use technical terms if the user asks about them specifically
- Keep responses concise but complete`;

  const prompt = `${systemPrompt}

${contextText ? `RELEVANT INFORMATION:\n${contextText}\n\n` : ""}${historyText ? `CONVERSATION HISTORY:\n${historyText}\n\n` : ""}USER QUESTION: ${userQuery}

Provide a natural, conversational response:`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    // Log full error details for debugging
    if (error instanceof Error) {
      const isServiceUnavailable = error.message.includes("503") || 
                                   error.message.includes("Service Unavailable") ||
                                   error.message.includes("overloaded");
      
      if (isServiceUnavailable) {
        console.error("Gemini API is temporarily unavailable (503):", error.message);
      } else {
        console.error("Gemini API error:", error.message);
      }
    } else {
      console.error("Gemini API error:", error);
    }
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
    .map((msg) => {
      if (msg.role === "user") {
        return `User: ${msg.content}`;
      } else {
        return `Assistant: ${msg.content}`;
      }
    })
    .join("\n\n");

  const systemPrompt = `You are a helpful, friendly AI assistant. Answer questions naturally and conversationally.

IMPORTANT GUIDELINES:
- Answer in the SAME LANGUAGE as the user's question
- Be conversational, warm, and human-like
- Never mention "context", "sources", "documents", or technical implementation details
- Respond as if you're having a natural conversation
- Keep responses concise but complete`;

  const prompt = `${systemPrompt}

${historyText ? `CONVERSATION HISTORY:\n${historyText}\n\n` : ""}USER QUESTION: ${userQuery}

Provide a natural, conversational response:`;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text().trim();
  } catch (error) {
    // Log full error details for debugging
    if (error instanceof Error) {
      const isServiceUnavailable = error.message.includes("503") || 
                                   error.message.includes("Service Unavailable") ||
                                   error.message.includes("overloaded");
      
      if (isServiceUnavailable) {
        console.error("Gemini API is temporarily unavailable (503):", error.message);
      } else {
        console.error("Gemini API error:", error.message);
      }
    } else {
      console.error("Gemini API error:", error);
    }
    throw new Error(
      error instanceof Error
        ? `Failed to generate response: ${error.message}`
        : "Failed to generate response"
    );
  }
}

