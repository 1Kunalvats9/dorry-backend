import { Router, Request, Response } from "express";
import { authenticateToken } from "../middleware/auth.js";
import { sendError, sendSuccess, sendSuccessMessage } from "../utils/response.js";
import { searchSimilarChunks } from "../services/qdrant.service.js";
import { generateResponseWithRAG, generateGeneralResponse } from "../services/gemini.service.js";
import prisma from "../config/database.js";

const router = Router();

router.post("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { message, chatId, useRAG = true } = req.body;

    if (!message || typeof message !== "string") {
      return sendError(res, "Message is required", 400);
    }

    let chat;
    if (chatId) {
      chat = await prisma.chat.findFirst({
        where: {
          id: chatId,
          userId,
        },
      });

      if (!chat) {
        return sendError(res, "Chat not found or access denied", 404);
      }
    } else {
      chat = await prisma.chat.create({
        data: {
          userId,
          title: message.substring(0, 50),
          messages: [],
        },
      });
    }

    const messages = (chat.messages as Array<{ role: "user" | "assistant"; content: string }>) || [];
    
    messages.push({ role: "user", content: message });

    let response: string;
    let retrievedChunks: Array<{ chunk_id: string; document_id: string; text: string; score: number }> = [];

    if (useRAG) {
      retrievedChunks = await searchSimilarChunks(userId, message, 5);

      if (retrievedChunks.length > 0) {
        response = await generateResponseWithRAG(message, retrievedChunks, messages.slice(0, -1));
      } else {
        response = await generateGeneralResponse(message, messages.slice(0, -1));
      }
    } else {
      response = await generateGeneralResponse(message, messages.slice(0, -1));
    }

    messages.push({ role: "assistant", content: response });

    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        messages,
        updatedAt: new Date(),
      },
    });

    return sendSuccess(res, {
      chatId: chat.id,
      response,
      retrievedChunks: useRAG ? retrievedChunks.map((c) => ({
        chunk_id: c.chunk_id,
        document_id: c.document_id,
        score: c.score,
      })) : [],
    });
  } catch (error) {
    console.error("Chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to process chat";
    return sendError(res, message, 500);
  }
});

router.get("/", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;

    const chats = await prisma.chat.findMany({
      where: {
        userId,
      },
      orderBy: {
        updatedAt: "desc",
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: true,
      },
    });

    return sendSuccess(res, chats);
  } catch (error) {
    console.error("Get chats error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch chats";
    return sendError(res, message, 500);
  }
});

router.get("/:chatId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!chat) {
      return sendError(res, "Chat not found or access denied", 404);
    }

    return sendSuccess(res, chat);
  } catch (error) {
    console.error("Get chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to fetch chat";
    return sendError(res, message, 500);
  }
});

router.delete("/:chatId", authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { chatId } = req.params;

    const chat = await prisma.chat.findFirst({
      where: {
        id: chatId,
        userId,
      },
    });

    if (!chat) {
      return sendError(res, "Chat not found or access denied", 404);
    }

    await prisma.chat.delete({
      where: { id: chatId },
    });

    return sendSuccessMessage(res, "Chat deleted successfully");
  } catch (error) {
    console.error("Delete chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to delete chat";
    return sendError(res, message, 500);
  }
});

export default router;

