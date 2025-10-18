import Fastify from "fastify";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { issueToken } from "./tokens.js";
import cors from "@fastify/cors";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = Fastify({ logger: true });

await app.register(cors, {
    origin: "http://localhost:5173",
  });
  

const ENV = {
  PORT: Number(process.env.PORT ?? 8787),
  LIVEKIT_URL: must("LIVEKIT_URL"),
  LIVEKIT_API_KEY: must("LIVEKIT_API_KEY"),
  LIVEKIT_API_SECRET: must("LIVEKIT_API_SECRET"),
};

app.get("/health", async () => ({ ok: true }));

// GET /token?room=demo&who=client
app.get("/token", async (req, reply) => {
  const q = req.query as Record<string, string | undefined>;
  const room = q.room ?? "demo";
  const who = q.who ?? "client";
  const canPublish = (q.canPublish ?? "true") !== "false";
  const canSubscribe = (q.canSubscribe ?? "true") !== "false";
  const ttl = q.ttl ? Number(q.ttl) : undefined;

  const token = await issueToken({
    apiKey: ENV.LIVEKIT_API_KEY,
    apiSecret: ENV.LIVEKIT_API_SECRET,
    roomName: room,
    identity: who,
    canPublish,
    canSubscribe,
    ...(ttl !== undefined && { ttlSeconds: ttl }),
  });
  console.log('typeof token:', typeof token);


  return reply.send({ token, ws: ENV.LIVEKIT_URL });
});

app.listen({ port: ENV.PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});

function must(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}
