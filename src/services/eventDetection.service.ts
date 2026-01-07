import prisma from "../config/database.js";
import {generateGeneralResponse} from "./gemini.service.js";

type LLMDetectedEvent = {
    title: string;
    start_time: string | null;
    end_time: string | null;
    recurrence: string | null;
    confidence: number;
};

export async function detectEventsForDocument(documentId: string) {
    const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
            chunks: {
                orderBy: { chunkIndex: "asc" },
            },
        },
    });

    if (!document) {
        throw new Error("Document not found");
    }
    const existing = await prisma.detectedEvent.findFirst({
        where: { documentId },
    });

    if (existing) {
        return { skipped: true };
    }
    const combinedText = document.chunks
        .map((c) => c.content)
        .join("\n");

    if (combinedText.length < 50) {
        return { skipped: true };
    }

    const rawResponse = await extractEventsWithLLM(combinedText);

    const validEvents = sanitizeEvents(rawResponse);

    for (const event of validEvents) {
        await prisma.detectedEvent.create({
            data: {
                userId: document.userId,
                documentId: document.id,
                title: event.title,
                startTime: event.start_time
                    ? new Date(event.start_time)
                    : null,
                endTime: event.end_time
                    ? new Date(event.end_time)
                    : null,
                recurrence: event.recurrence,
                confidence: event.confidence,
                sourceText: combinedText.slice(0, 1000),
            },
        });
    }

    return {
        detected: validEvents.length,
    };
}



async function extractEventsWithLLM(
    text: string
): Promise<LLMDetectedEvent[]> {
    const prompt = `
You extract time-based events from text.

Rules:
- Only extract events with explicit times or schedules.
- Do NOT guess or invent.
- Skip anything uncertain.
- Output ONLY valid JSON array. No explanations, no markdown, no text before or after.
- Start your response with [ and end with ]
- If no events exist, return exactly: []

Schema:
[
  {
    "title": string,
    "start_time": string | null,
    "end_time": string | null,
    "recurrence": string | null,
    "confidence": number
  }
]

Text:
"""
${text}
"""

Return ONLY the JSON array, nothing else:
`;

    try {
        const response = await generateGeneralResponse(prompt);
        
        // Try to extract JSON from markdown code blocks if present
        let jsonString = response.trim();
        const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            jsonString = jsonMatch[1].trim();
        } else {
            // Try to find JSON array/object in the response
            // Look for first [ or { and last matching ] or }
            const arrayMatch = jsonString.match(/\[[\s\S]*\]/);
            const objectArrayMatch = jsonString.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (objectArrayMatch) {
                jsonString = objectArrayMatch[0];
            } else if (arrayMatch) {
                jsonString = arrayMatch[0];
            }
        }
        
        try {
            const parsed = JSON.parse(jsonString);
            if (!Array.isArray(parsed)) {
                console.warn("Parsed JSON is not an array, got:", typeof parsed);
                return [];
            }
            return parsed;
        } catch (parseError) {
            console.warn("Failed to parse event detection JSON");
            console.warn("Response received:", response.substring(0, 500));
            if (parseError instanceof Error) {
                console.warn("Parse error:", parseError.message);
            }
            return [];
        }
    } catch (error) {
        // Handle API errors (like 503 Service Unavailable)
        if (error instanceof Error) {
            console.error("Error calling Gemini API for event detection:", error.message);
            // Don't throw - return empty array to prevent breaking the flow
            return [];
        }
        throw error;
    }
}


function sanitizeEvents(
    events: LLMDetectedEvent[]
): LLMDetectedEvent[] {
    if (!Array.isArray(events)) return [];

    return events
        .filter((e) => {
            if (!e.title || typeof e.title !== "string") return false;
            if (typeof e.confidence !== "number") return false;
            if (e.confidence < 0.6) return false;
            return true;
        })
        .map((e) => ({
            title: e.title.trim(),
            start_time: e.start_time,
            end_time: e.end_time,
            recurrence: e.recurrence,
            confidence: Math.min(1, Math.max(0, e.confidence)),
        }));
}
