import { chunkText } from "./embedding.service.js";
import { storeChunksInQdrant } from "./qdrant.service.js";
import prisma from "../config/database.js";
import { deleteFromCloudinary, CloudinaryUploadResult } from "../middleware/uploadCloudinary.js";
import {detectEventsForDocument} from "./eventDetection.service.js";
import {sendError} from "../utils/response.js";

interface ProcessPDFParams {
  documentId: string;
  userId: string;
  pdfBuffer: Buffer;
  cloudinaryResult: CloudinaryUploadResult;
}

export async function processPDFInBackground({
  documentId,
  userId,
  pdfBuffer,
  cloudinaryResult,
}: ProcessPDFParams): Promise<void> {
  try {
    console.log("========== PDF PROCESSING START ==========");
    console.log("documentId:", documentId);
    console.log("userId:", userId);

    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParse = (await import("pdf-parse")).default;

    // Extract text from PDF
    console.log("Extracting text from PDF...");
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text;

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF");
    }

    console.log("PDF text extraction complete:", extractedText.length, "characters");

    // Update document with extracted content
    await prisma.document.update({
      where: { id: documentId },
      data: {
        content: extractedText,
      },
    });

    // Chunk the text
    console.log("Creating text chunks...");
    const rawChunks = chunkText(extractedText);
    console.log("Created", rawChunks.length, "chunks");

    if (rawChunks.length === 0) {
      throw new Error("No chunks could be created from the extracted text");
    }

    // Create chunks in database
    console.log("Storing chunks in database...");
    const chunks = await Promise.all(
      rawChunks.map((content, index) =>
        prisma.chunk.create({
          data: {
            documentId,
            userId,
            content,
            chunkIndex: index,
          },
        })
      )
    );

    console.log("Chunks stored in database:", chunks.length);

    // Store chunks in Qdrant
    console.log("Storing chunks in Qdrant vector database...");
    await storeChunksInQdrant({
      userId,
      documentId,
      chunks: chunks.map((c) => ({
        chunk_id: c.id,
        text: c.content,
      })),
    });

    console.log("Chunks stored in Qdrant");

    // Delete PDF from Cloudinary
    try {
      await deleteFromCloudinary(cloudinaryResult.publicId);
      console.log("Deleted PDF from Cloudinary");
    } catch (cloudinaryError) {
      console.error("Failed to delete from Cloudinary (but processing succeeded):", cloudinaryError);
    }

    // Detect events from the document content
    console.log("Starting event detection...");
    try {
      const eventDetectionResult = await detectEventsForDocument(documentId);
      console.log("Event detection completed:", eventDetectionResult);
    } catch (eventError) {
      console.error("Event detection failed (non-blocking):", eventError);
      // Don't throw - event detection failure shouldn't stop PDF processing
    }

    console.log("========== PDF PROCESSING COMPLETE ==========");
  } catch (error) {
    console.error("========== PDF PROCESSING FAILED ==========");
    console.error("Error details:", error);

    // Try to delete from Cloudinary even on error (cleanup)
    try {
      await deleteFromCloudinary(cloudinaryResult.publicId);
      console.log("Cleaned up Cloudinary file");
    } catch (cleanupError) {
      console.error("Failed to cleanup Cloudinary file:", cleanupError);
    }

    // Update document to indicate failure
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          content: `Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      });
    } catch (updateError) {
      console.error("Failed to update document with error status:", updateError);
    }

    throw error;
  }
}

// Helper function to process PDF asynchronously (fire and forget)
export function processPDFAsync(params: ProcessPDFParams): void {
  // Use setImmediate to ensure this runs after the response is sent
  setImmediate(async () => {
    try {
      await processPDFInBackground(params);
    } catch (error) {
      // Error is already logged in processPDFInBackground
      // You could also emit an event or send a notification here
      console.error("Async PDF processing error:", error);
    }
  });
}

