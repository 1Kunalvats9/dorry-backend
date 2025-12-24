import {Request,Response,NextFunction} from "express";
import { verifyToken } from "../utils/jwt.js";

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
            return res.status(401).json({message: "No authentication token provided", error:"Access denied"});
        }
        const decoded = verifyToken(token);
        req.user = {id: decoded.userId, email: decoded.email};
        next();
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid token';
    
        return res.status(403).json({
            error: 'Access denied',
            message
        });
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