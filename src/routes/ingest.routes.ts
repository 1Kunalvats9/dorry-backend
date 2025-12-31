import { Router, Request, Response } from "express";
import { chunkText } from "../services/embedding.service.js";
import { storeChunksInQdrant } from "../services/qdrant.service.js";
import prisma from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../utils/response.js";
import upload from "../middleware/upload.js";
import uploadCloudinary, { uploadToCloudinary } from "../middleware/uploadCloudinary.js";
import { processPDFAsync } from "../services/pdfProcessing.service.js";

const router = Router();

router.post("/", authenticateToken, async (req: Request, res: Response) => {
    try {
        const userId = req.user.id;
        const { text, filename = "text-input" } = req.body;

        if (!text || typeof text !== "string") {
            return sendError(res, "Text is required", 400);
        }
        const document = await prisma.document.create({
            data: {
                userId,
                filename,
                fileType: "text",
                fileUrl: "",
                content: text,
            },
        });

        const rawChunks = chunkText(text);

        const chunks = await Promise.all(
            rawChunks.map((content, index) =>
                prisma.chunk.create({
                    data: {
                        documentId: document.id,
                        userId,
                        content,
                        chunkIndex: index,
                    },
                })
            )
        );

        await storeChunksInQdrant({
            userId,
            documentId: document.id,
            chunks: chunks.map((c) => ({
                chunk_id: c.id,
                text: c.content,
            })),
        });

        return sendSuccess(res, {
            documentId: document.id,
            chunksStored: chunks.length,
        });
    } catch (err) {
        console.error("Ingestion error:", err);
        return sendError(res, "Failed to ingest text", 500);
    }
});


router.post(
    "/pdf",
    authenticateToken,
    uploadCloudinary.single("file"),
    async (req, res) => {
      try {
        const userId = req.user.id;
  
        if (!req.file) {
          return sendError(res, "PDF file is required", 400);
        }

        // Upload PDF to Cloudinary
        const cloudinaryResult = await uploadToCloudinary(
          req.file.buffer,
          req.file.originalname
        );

        console.log(`PDF uploaded to Cloudinary: ${cloudinaryResult.publicId}`);

        // Create document record in database
        const document = await prisma.document.create({
          data: {
            userId,
            filename: req.file.originalname,
            fileType: "pdf",
            fileUrl: cloudinaryResult.secureUrl,
            content: "", // Will be populated during background processing
          },
        });

        // Trigger background processing (non-blocking)
        processPDFAsync({
          documentId: document.id,
          userId,
          pdfBuffer: req.file.buffer,
          cloudinaryResult,
        });

        // Return immediately - processing happens in background
        return sendSuccess(res, {
          documentId: document.id,
          message: "PDF uploaded successfully. Processing in background...",
          cloudinaryUrl: cloudinaryResult.secureUrl,
        });
      } catch (err) {
        console.error("PDF upload error:", err);
        const errorMessage = err instanceof Error ? err.message : "Failed to upload PDF";
        return sendError(res, errorMessage, 500);
      }
    }
  );
  

export default router;
