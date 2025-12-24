import { Router, Request, Response } from "express";
import { loginWithGoogleIdToken, getUserById, deleteUserAccount } from "../services/auth.service.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendSuccess, sendSuccessMessage, sendError } from "../utils/response.js";

const router = Router();

router.post("/google/login", async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return sendError(res, "ID token is required", 400);
        }

        const result = await loginWithGoogleIdToken(idToken);
        return sendSuccess(res, result);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Google login failed";
        return sendError(res, message, 400);
    }
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
    try {
        const user = await getUserById(req.user.id);
        return sendSuccess(res, user);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch user";
        const statusCode = error instanceof Error && error.message === "User not found" ? 404 : 400;
        return sendError(res, message, statusCode);
    }
});

router.delete("/me", authenticateToken, async (req: Request, res: Response) => {
    try {
        const result = await deleteUserAccount(req.user.id);
        return sendSuccessMessage(res, result.message);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete account";
        return sendError(res, message, 400);
    }
});

export default router;

