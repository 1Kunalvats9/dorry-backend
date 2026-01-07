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
    console.log("========== EVENT DETECTION START ==========");
    console.log("documentId:", documentId);
    
    const document = await prisma.document.findUnique({
        where: { id: documentId },
        include: {
            chunks: {
                orderBy: { chunkIndex: "asc" },
            },
        },
    });

    if (!document) {
        console.log("ERROR: Document not found for id:", documentId);
        throw new Error("Document not found");
    }
    
    console.log("Document found:", document.filename);
    console.log("Total chunks:", document.chunks.length);
    
    const existing = await prisma.detectedEvent.findFirst({
        where: { documentId },
    });

    if (existing) {
        console.log("Events already detected for this document, skipping");
        return { skipped: true };
    }
    
    const combinedText = document.chunks
        .map((c) => c.content)
        .join("\n");

    console.log("Combined text length:", combinedText.length, "characters");
    
    if (combinedText.length < 50) {
        console.log("Text too short for event detection, skipping");
        return { skipped: true };
    }

    console.log("Sending text to LLM for event extraction...");
    const rawResponse = await extractEventsWithLLM(combinedText);
    
    console.log("Raw LLM response received, items:", rawResponse.length);
    console.log("Raw events:", JSON.stringify(rawResponse, null, 2));

    const validEvents = sanitizeEvents(rawResponse);
    
    console.log("Sanitized valid events:", validEvents.length);
    console.log("Valid events details:");
    validEvents.forEach((event, index) => {
        console.log(`  Event ${index + 1}: "${event.title}" | Start: ${event.start_time} | End: ${event.end_time} | Recurrence: ${event.recurrence} | Confidence: ${(event.confidence * 100).toFixed(0)}%`);
    });

    let createdCount = 0;
    let skippedCount = 0;

    for (const event of validEvents) {
        const startTime = parseDate(event.start_time);
        const endTime = parseDate(event.end_time);
        
        console.log(`Processing event: "${event.title}"`);
        console.log(`  Parsed startTime: ${startTime ? startTime.toISOString() : "null"}`);
        console.log(`  Parsed endTime: ${endTime ? endTime.toISOString() : "null"}`);
        console.log(`  Recurrence: ${event.recurrence || "none"}`);
        
        // Only create event if at least one valid time exists, or if it has recurrence
        if (!startTime && !endTime && !event.recurrence) {
            console.log(`  SKIPPED: No valid times or recurrence for "${event.title}"`);
            skippedCount++;
            continue;
        }
        
        try {
            const createdEvent = await prisma.detectedEvent.create({
                data: {
                    userId: document.userId,
                    documentId: document.id,
                    title: event.title,
                    startTime,
                    endTime,
                    recurrence: event.recurrence || null,
                    confidence: event.confidence,
                    sourceText: combinedText.slice(0, 1000),
                },
            });
            
            console.log(`  CREATED: Event "${event.title}" with id ${createdEvent.id}`);
            createdCount++;
        } catch (error) {
            console.error(`  ERROR creating event "${event.title}":`, error);
        }
    }

    console.log("========== EVENT DETECTION SUMMARY ==========");
    console.log("Total found by LLM:", rawResponse.length);
    console.log("Total after sanitization:", validEvents.length);
    console.log("Total created in DB:", createdCount);
    console.log("Total skipped:", skippedCount);
    console.log("========== EVENT DETECTION END ==========");

    return {
        detected: createdCount,
        sanitized: validEvents.length,
        raw: rawResponse.length,
        skipped: skippedCount,
    };
}



async function extractEventsWithLLM(
    text: string
): Promise<LLMDetectedEvent[]> {
    console.log("LLM Event Extraction: Starting");
    console.log("Input text length:", text.length, "characters");
    
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
        console.log("Sending request to Gemini API...");
        const response = await generateGeneralResponse(prompt);
        
        console.log("Gemini API response received");
        console.log("Response length:", response.length, "characters");
        console.log("Response preview:", response.substring(0, 200));
        
        // Try to extract JSON from markdown code blocks if present
        let jsonString = response.trim();
        const jsonMatch = jsonString.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
            console.log("Found JSON in markdown code block");
            jsonString = jsonMatch[1].trim();
        } else {
            // Try to find JSON array/object in the response
            // Look for first [ or { and last matching ] or }
            const arrayMatch = jsonString.match(/\[[\s\S]*\]/);
            const objectArrayMatch = jsonString.match(/\[\s*\{[\s\S]*\}\s*\]/);
            if (objectArrayMatch) {
                console.log("Found JSON array with objects");
                jsonString = objectArrayMatch[0];
            } else if (arrayMatch) {
                console.log("Found JSON array");
                jsonString = arrayMatch[0];
            } else {
                console.log("No JSON structure found in response");
            }
        }
        
        console.log("Extracted JSON string length:", jsonString.length);
        
        try {
            const parsed = JSON.parse(jsonString);
            if (!Array.isArray(parsed)) {
                console.warn("Parsed JSON is not an array, got:", typeof parsed);
                console.log("Parsed value:", parsed);
                return [];
            }
            console.log("Successfully parsed JSON array with", parsed.length, "items");
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
        console.error("Error calling Gemini API for event detection:", error);
        if (error instanceof Error) {
            console.error("Error details:", error.message);
        }
        // Don't throw - return empty array to prevent breaking the flow
        return [];
    }
}


/**
 * Safely parses a date string. Returns null if invalid.
 */
function parseDate(dateString: string | null | undefined): Date | null {
    if (!dateString || typeof dateString !== "string") {
        return null;
    }
    
    const trimmed = dateString.trim();
    if (!trimmed) {
        return null;
    }
    
    const date = new Date(trimmed);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return null;
    }
    
    return date;
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
