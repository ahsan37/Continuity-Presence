import Fastify from "fastify";
import cors from "@fastify/cors";
import "dotenv/config";
import { issueToken } from "./tokens.js";

const app = Fastify({ logger: true });

await app.register(cors, { origin: "http://localhost:5173" });

const must = (name: string) => {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
};

const PORT = Number(process.env.PORT) || 3000;
const LIVEKIT_URL = must("LIVEKIT_URL");
const LIVEKIT_API_KEY = must("LIVEKIT_API_KEY");
const LIVEKIT_API_SECRET = must("LIVEKIT_API_SECRET");

app.get("/health", async () => ({ ok: true }));

app.get("/token", async (req, reply) => {
  const reqParams = req.query as Record<string, string | undefined>;
  
  const token = await issueToken({
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
    roomName: reqParams.room ?? "demo",
    identity: reqParams.who ?? "client",
    canPublish: (reqParams.canPublish ?? "true") !== "false",
    canSubscribe: (reqParams.canSubscribe ?? "true") !== "false",
    ...(reqParams.ttl && { ttlSeconds: Number(reqParams.ttl) }),
  });

  return reply.send({ token, ws: LIVEKIT_URL });
});

app.listen({ port: PORT, host: "0.0.0.0" }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
