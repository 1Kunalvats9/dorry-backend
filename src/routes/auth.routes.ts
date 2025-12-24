import { Router, Request, Response } from "express";
import { loginWithGoogleIdToken, getUserById, deleteUserAccount } from "../services/auth.service.js";
import { authenticateToken } from "../middleware/auth.js";

const router = Router();

router.post("/google/login", async (req: Request, res: Response) => {
    try {
        const { idToken } = req.body;
        
        if (!idToken) {
            return res.status(400).json({ error: "ID token is required" });
        }

        const result = await loginWithGoogleIdToken(idToken);
        
        res.status(200).json({
            success: true,
            data: result
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Google login failed";
        res.status(400).json({ error: message });
    }
});

router.get("/me", authenticateToken, async (req: Request, res: Response) => {
    try {
        const user = await getUserById(req.user.id);
        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to fetch user";
        res.status(404).json({ error: message });
    }
});

router.delete("/me", authenticateToken, async (req: Request, res: Response) => {
    try {
        const result = await deleteUserAccount(req.user.id);
        res.status(200).json({
            success: true,
            message: result.message
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to delete account";
        res.status(400).json({ error: message });
    }
});

export default router;

