import jwt, { SignOptions } from "jsonwebtoken";

interface JWTPayload {
    userId: string;
    email: string;
}
interface DecodedToken extends JWTPayload {
    iat: number;
    exp: number;
}

export function generateToken(payload: JWTPayload) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not defined");
    }

    const token = jwt.sign(payload, secret, {
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
    } as SignOptions);

    return token;
}


export function verifyToken(token: string) {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not defined");
    }

    const decodedToken = jwt.verify(token, secret) as DecodedToken;

    return decodedToken;
}