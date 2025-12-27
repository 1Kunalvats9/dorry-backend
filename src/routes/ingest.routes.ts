import { Router, Request, Response } from "express";
import { chunkText } from "../services/embedding.service.js";
import { storeChunksInQdrant } from "../services/qdrant.service.js";
import prisma from "../config/database.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendError, sendSuccess } from "../utils/response.js";

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

export default router;
