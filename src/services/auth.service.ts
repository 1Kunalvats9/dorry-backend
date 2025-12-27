import { OAuth2Client } from "google-auth-library";
import prisma from "../config/database.js";
import { generateToken } from "../utils/jwt.js";

const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

export function getGoogleAuthUrl(state?: string): string {
  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is not set");
  }

  if (!process.env.GOOGLE_REDIRECT_URI) {
    throw new Error("GOOGLE_REDIRECT_URI environment variable is not set");
  }

  const scopes = [
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid'
  ];

  const authUrl = googleClient.generateAuthUrl({
    access_type: 'offline',
    scope: scopes,
    include_granted_scopes: true,
    state: state || undefined,
    prompt: 'consent',
  });

  return authUrl;
}

async function verifyGoogleIdToken(idToken: string) {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw new Error("ID token is required");
  }

  const audiences: string[] = [];
  
  if (process.env.GOOGLE_CLIENT_ID) {
    audiences.push(process.env.GOOGLE_CLIENT_ID);
  }
  if (process.env.GOOGLE_IOS_CLIENT_ID) {
    audiences.push(process.env.GOOGLE_IOS_CLIENT_ID);
  }
  if (process.env.GOOGLE_ANDROID_CLIENT_ID) {
    audiences.push(process.env.GOOGLE_ANDROID_CLIENT_ID);
  }

  if (audiences.length === 0) {
    throw new Error("No Google Client ID configured. Set GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, or GOOGLE_ANDROID_CLIENT_ID");
  }

  let lastError: Error | null = null;

  for (const audience of audiences) {
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: idToken,
        audience: audience,
      });

      const payload = ticket.getPayload();
      
      if (!payload) {
        throw new Error("Failed to extract user information from Google token");
      }

      if (!payload.sub) {
        throw new Error("Google user ID (sub) is missing");
      }

      if (!payload.email) {
        throw new Error("Email address is missing from Google account");
      }

      return {
        googleId: payload.sub,
        email: payload.email,
        name: payload.name || null,
        profilePhoto: payload.picture || null,
        emailVerified: payload.email_verified || false
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      
      if (errorMessage.includes("Wrong recipient") || errorMessage.includes("audience")) {
        lastError = err instanceof Error ? err : new Error(errorMessage);
        continue;
      }
      
      lastError = err instanceof Error ? err : new Error(errorMessage);
      break;
    }
  }

  const errorMessage = lastError instanceof Error ? lastError.message : "Unknown error";
  console.error(`Error in Google ID token verification: ${errorMessage}`, lastError);
  
  if (errorMessage.includes("Wrong recipient") || errorMessage.includes("audience")) {
    throw new Error(`ID token audience does not match any configured client ID. Configured: ${audiences.join(", ")}`);
  }
  if (errorMessage.includes("invalid_token") || errorMessage.includes("expired")) {
    throw new Error("Invalid or expired ID token");
  }
  if (errorMessage.includes("network") || errorMessage.includes("ECONNREFUSED")) {
    throw new Error("Failed to connect to Google authentication service");
  }
  
  throw new Error(`Google ID token verification failed: ${errorMessage}`);
}

async function verifyGoogleToken(code: string) {
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    throw new Error("Authorization code is required");
  }

  if (!process.env.GOOGLE_CLIENT_ID) {
    throw new Error("GOOGLE_CLIENT_ID environment variable is not set");
  }

  try {
    const { tokens } = await googleClient.getToken(code);

    if (!tokens || !tokens.id_token) {
      throw new Error("Failed to obtain ID token from Google");
    }

    return await verifyGoogleIdToken(tokens.id_token);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Error in Google token verification: ${errorMessage}`, err);

    if (errorMessage.includes("invalid_grant") || errorMessage.includes("code")) {
      throw new Error("Invalid or expired authorization code");
    }
    if (errorMessage.includes("network") || errorMessage.includes("ECONNREFUSED")) {
      throw new Error("Failed to connect to Google authentication service");
    }

    throw new Error(`Google token verification failed: ${errorMessage}`);
  }
}

async function createOrUpdateUser(googleUser: { googleId: string; email: string; name: string | null; profilePhoto: string | null; emailVerified: boolean }) {
  let user = await prisma.user.findUnique({
    where: { googleId: googleUser.googleId }
  });

  if (!user) {
    const existingEmailUser = await prisma.user.findUnique({
      where: { email: googleUser.email }
    });

    if (existingEmailUser) {
      user = await prisma.user.update({
        where: { id: existingEmailUser.id },
        data: {
          googleId: googleUser.googleId,
          profilePhoto: googleUser.profilePhoto || existingEmailUser.profilePhoto,
          name: existingEmailUser.name || googleUser.name,
        }
      });
    } else {
      user = await prisma.user.create({
        data: {
          email: googleUser.email,
          name: googleUser.name,
          googleId: googleUser.googleId,
          profilePhoto: googleUser.profilePhoto,
        }
      });
    }
  } else {
    if (googleUser.profilePhoto && user.profilePhoto !== googleUser.profilePhoto) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: {
          profilePhoto: googleUser.profilePhoto,
          name: user.name || googleUser.name,
        }
      });
    }
  }

  const token = generateToken({
    userId: user.id,
    email: user.email,
  });

  return {
    token,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      profilePhoto: user.profilePhoto,
      createdAt: user.createdAt,
    }
  };
}

export async function loginWithGoogleIdToken(idToken: string) {
  if (!idToken || typeof idToken !== 'string' || idToken.trim().length === 0) {
    throw new Error("ID token is required");
  }

  try {
    const googleUser = await verifyGoogleIdToken(idToken);
    return await createOrUpdateUser(googleUser);
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }

    console.error("Unexpected error in loginWithGoogleIdToken:", err);
    throw new Error("Failed to complete Google login");
  }
}

export async function loginWithGoogle(code: string) {
  if (!code || typeof code !== 'string' || code.trim().length === 0) {
    throw new Error("Authorization code is required");
  }

  try {
    const googleUser = await verifyGoogleToken(code);
    return await createOrUpdateUser(googleUser);
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }

    console.error("Unexpected error in loginWithGoogle:", err);
    throw new Error("Failed to complete Google login");
  }
}



export async function getUserById(userId: string) {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error("User ID is required");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        profilePhoto: true,
        createdAt: true,
        updatedAt: true,
      }
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  } catch (err) {
    if (err instanceof Error && err.message === "User not found") {
      throw err;
    }

    console.error("Error fetching user by ID:", err);
    throw new Error("Failed to fetch user information");
  }
}

export async function deleteUserAccount(userId: string) {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    throw new Error("User ID is required");
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const { deleteUserChunks } = await import("./qdrant.service.js");
    try {
      await deleteUserChunks(userId);
    } catch (qdrantErr) {
      console.error("Error deleting Qdrant chunks (continuing with user deletion):", qdrantErr);
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    return { message: "User account deleted successfully" };
  } catch (err) {
    if (err instanceof Error && err.message === "User not found") {
      throw err;
    }

    console.error("Error deleting user account:", err);
    throw new Error("Failed to delete user account");
  }
}