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
    console.log(`Starting PDF processing for document ${documentId}`);

    // Dynamic import for pdf-parse (CommonJS module)
    const pdfParse = (await import("pdf-parse")).default;

    // Extract text from PDF
    const pdfData = await pdfParse(pdfBuffer);
    const extractedText = pdfData.text;

    if (!extractedText || extractedText.trim().length === 0) {
      throw new Error("No text could be extracted from the PDF");
    }

    console.log(`Extracted ${extractedText.length} characters from PDF`);

    // Update document with extracted content
    await prisma.document.update({
      where: { id: documentId },
      data: {
        content: extractedText,
      },
    });

    // Chunk the text
    const rawChunks = chunkText(extractedText);
    console.log(`Created ${rawChunks.length} chunks from PDF`);

    if (rawChunks.length === 0) {
      throw new Error("No chunks could be created from the extracted text");
    }

    // Create chunks in database
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

    console.log(`Stored ${chunks.length} chunks in database`);

    // Store chunks in Qdrant
    await storeChunksInQdrant({
      userId,
      documentId,
      chunks: chunks.map((c) => ({
        chunk_id: c.id,
        text: c.content,
      })),
    });

    console.log(`Stored ${chunks.length} chunks in Qdrant`);


    try {
      await deleteFromCloudinary(cloudinaryResult.publicId);
      console.log(`Deleted PDF from Cloudinary: ${cloudinaryResult.publicId}`);
    } catch (cloudinaryError) {
      console.error(
        `Failed to delete from Cloudinary (document processed successfully):`,
        cloudinaryError
      );
    }

    detectEventsForDocument(documentId).catch((err)=>{
      console.error("error in detecting events", err)
      return
    })
    console.log(`✅ PDF processing completed for document ${documentId}`);
  } catch (error) {
    console.error(`❌ PDF processing failed for document ${documentId}:`, error);

    // Try to delete from Cloudinary even on error (cleanup)
    try {
      await deleteFromCloudinary(cloudinaryResult.publicId);
      console.log(
        `Cleaned up Cloudinary file after processing error: ${cloudinaryResult.publicId}`
      );
    } catch (cleanupError) {
      console.error(`Failed to cleanup Cloudinary file:`, cleanupError);
    }

    // Update document to indicate failure (optional - you can add a status field)
    try {
      await prisma.document.update({
        where: { id: documentId },
        data: {
          content: `Processing failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        },
      });
    } catch (updateError) {
      console.error(`Failed to update document with error status:`, updateError);
    }

    // Re-throw error if you want to handle it elsewhere
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

