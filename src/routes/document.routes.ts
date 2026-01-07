import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { sendError, sendSuccess, sendSuccessMessage } from "../utils/response.js";
import prisma from "../config/database.js";
import { deleteDocumentChunks } from "../services/qdrant.service.js";

const router = Router();

router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const documents = await prisma.document.findMany({
      where: {
        userId,
      },
      orderBy: {
        uploadedAt: "desc",
      },
      select: {
        id: true,
        filename: true,
        fileType: true,
        fileUrl: true,
        uploadedAt: true,
        _count: {
          select: {
            chunks: true,
          },
        },
      },
    });

    return sendSuccess(res, documents);
  } catch (error) {
    console.error("Get documents error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch documents";
    return sendError(res, message, 500);
  }
});


router.get(
    "/:documentId/events",
    authenticateToken,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user.id;
        const { documentId } = req.params;

        console.log(`📋 Fetching events for document ${documentId}, user ${userId}`);

        const document = await prisma.document.findFirst({
          where: {
            id: documentId,
            userId,
          },
          select: { id: true },
        });

        if (!document) {
          console.log(`Document not found or access denied: ${documentId}`);
          return sendError(res, "Document not found or access denied", 404);
        }

        const events = await prisma.detectedEvent.findMany({
          where: {
            documentId,
            userId,
          },
          orderBy: {
            confidence: "desc",
          },
          select: {
            id: true,
            title: true,
            startTime: true,
            endTime: true,
            recurrence: true,
            confidence: true,
            sourceText: true,
            createdAt: true,
          },
        });

        console.log(`✅ Found ${events.length} events for document ${documentId}`);

        return sendSuccess(res, {
          events,
          count: events.length,
        });
      } catch (err) {
        console.error("Fetch detected events error:", err);
        return sendError(res, "Failed to fetch detected events", 500);
      }
    }
);


router.get("/:documentId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { documentId } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId,
      },
      include: {
        chunks: {
          orderBy: {
            chunkIndex: "asc",
          },
          select: {
            id: true,
            content: true,
            chunkIndex: true,
            createdAt: true,
          },
        },
      },
    });

    if (!document) {
      return sendError(res, "Document not found or access denied", 404);
    }

    // Compute status based on document state
    let status: string;
    if (document.fileType === "pdf") {
      if (!document.content || document.content.trim().length === 0) {
        status = "processing";
      } else if (document.content.startsWith("Processing failed:")) {
        status = "failed";
      } else {
        status = "ready";
      }
    } else {
      // For text documents, they're always ready after creation
      status = "ready";
    }

    // Return document with computed status field
    return sendSuccess(res, {
      ...document,
      status,
    });
  } catch (error) {
    console.error("Get document error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch document";
    return sendError(res, message, 500);
  }
});

router.delete("/:documentId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { documentId } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id: documentId,
        userId,
      },
    });

    if (!document) {
      return sendError(res, "Document not found or access denied", 404);
    }

    try {
      await deleteDocumentChunks(userId, documentId);
    } catch (qdrantErr) {
      console.error("Error deleting Qdrant chunks (continuing with document deletion):", qdrantErr);
    }

    await prisma.document.delete({
      where: { id: documentId },
    });

    return sendSuccessMessage(res, "Document deleted successfully");
  } catch (error) {
    console.error("Delete document error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete document";
    return sendError(res, message, 500);
  }
});

export default router;

