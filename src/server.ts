import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import helmet from "helmet";
import path from "path";
import { fileURLToPath } from "url";
import authRoutes from "./routes/auth.routes.js";
import ingestRoutes from "./routes/ingest.routes.js";
import chatRoutes from "./routes/chat.routes.js";
import documentRoutes from "./routes/document.routes.js";
import { initQdrant } from "./services/qdrant.service.js";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(cookieParser());

app.use(express.static(path.join(__dirname, "../public")));

app.get("/", (req, res) => {
    res.send("Welcome to Dorry's Server!");
});



app.get("/health", (req, res) => {
    return res.status(200).json({ message: "Server is running smoothly!!\n Fikar not" });
});



app.use("/api/auth", authRoutes);
app.use("/api/ingest", ingestRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/documents", documentRoutes);

async function startServer() {
  try {
    await initQdrant();
  } catch (err) {
    console.error("Failed to initialize Qdrant:", err);
  }

  app.listen(PORT, () => {
    console.log(`\n\n\n-------|||Server is running on the port ${PORT}|||-------\n\n\n`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
