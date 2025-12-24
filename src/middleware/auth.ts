import {Request,Response,NextFunction} from "express";
import { verifyToken } from "../utils/jwt.js";
import { sendError } from "../utils/response.js";

declare global{
    namespace Express{
        interface Request{
            user: {
                id: string;
                email: string;
            }
        }
    }
}

export function authenticateToken(
    req: Request,
    res: Response,
    next: NextFunction
) {
    try {
        const authHeader =req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if(!token){
            return sendError(res, "No authentication token provided", 401);
        }
        const decoded = verifyToken(token);
        req.user = {id: decoded.userId, email: decoded.email};
        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid token';
        return sendError(res, message, 403);
    }
}

export function optionalAuth(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];
  
      if (token) {
        const decoded = verifyToken(token);
        req.user = {id: decoded.userId, email: decoded.email};
      }
  
      next();
    } catch (error) {
      next();
    }
  }