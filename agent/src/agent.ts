import Fastify from "fastify";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { connectRoom } from "./listener.js";
import { Room, RoomEvent } from "@livekit/rtc-node";
import { LivePublisher } from "./livePublisher.js";
import { speakBridgeRealtime } from "./bridgeRealtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const app = Fastify({ logger: true });

const ENV = {
    PORT: Number(process.env.PORT ?? 8788),
    TOKEN_ENDPOINT: must("TOKEN_ENDPOINT"),
    ROOM: process.env.ROOM ?? "demo",
    WHO: process.env.WHO ?? "agent",
  };


let room: Room | undefined;
let publisher: LivePublisher | undefined;

app.get("/health", async () => ({ ok: true }));

// app.post("/debug/bridge-once", async (_req, reply) => {
//     try {
//       const chunks: Int16Array[] = [];
//       for await (const pcm of streamRealtimeTTS({
//         apiKey: process.env.OPENAI_API_KEY!,
//         url: process.env.OPENAI_REALTIME_URL,
//         text: "We hit a brief connection issue. One moment while we reconnect.",
//         voice: "alloy",
//       })) {
//         chunks.push(pcm);
//       }
//       const total = chunks.reduce((s,a)=>s+a.length,0);
//       const merged = new Int16Array(total);
//       let off = 0; for (const c of chunks) { merged.set(c, off); off += c.length; }
  
//       const pub = new LivePublisherSimple(room!);
//       await pub.publishBuffer24k(merged);
  
//       return reply.send({ ok: true, totalSamples: total, seconds: (total/24000).toFixed(2) });
//     } catch (e: any) {
//       app.log.error(e);
//       return reply.code(500).send({ error: e?.message ?? "failed" });
//     }
//   });
  
 //     const text = "This is a diagnostic sentence to verify audio decoding and timing.";
//     const chunks: Int16Array[] = [];
//     let total = 0, first = true;
  
//     for await (const pcm of streamRealtimeTTS({
//       apiKey: process.env.OPENAI_API_KEY!,
//       url: process.env.OPENAI_REALTIME_URL,
//       text,
//       voice: "alloy",
//       pcmSampleRate: 24000,
//     })) {
//       total += pcm.length;
//       if (first) {
//         const head = Array.from(pcm.slice(0, 16));
//         console.log("[dump] first chunk len:", pcm.length, "head16:", head);
//         first = false;
//       }
//       chunks.push(pcm);
//     }
//     const { totalSamples, seconds } = saveWavMono16(chunks, 24000, "./dump.wav");
//     console.log("[dump] wrote dump.wav samples:", totalSamples, "sec:", seconds.toFixed(2));
  
//     return reply.send({ ok: true, totalSamples, seconds });
//   });

app.post("/demo/bridge", async (req, reply) => {
    if (!room) await ensureRoom();
    if (!publisher) publisher = new LivePublisher(room!);
    const chunks = await speakBridgeRealtime({ publisher, participantName: "you" });
    return reply.send({ ok: true, chunks });
});


// app.post("/publish", async (req, reply) => {
//     const body = (req.body ?? {}) as { wavUrl?: string; name?: string };

//     if (!body.wavUrl) return reply.code(400).send({ error: "wavUrl is required" });

//     try{
//         const publisher = await ensurePublisher();
//         await publisher.publishWav(body.wavUrl, body.name ?? "continuity-audio");
//         return reply.send({ ok: true });
//     } catch (error: any) {
//         req.log.error(error);
//         return reply.code(500).send({ error: error?.message ?? "Failed to publish audioooo" });
//     }
// });


// app.post("/stop", async (_req, reply) => {
//     if (state.publisher) {
//         await state.publisher.stop();
//     }
//     return reply.send({ ok: true });
// });


app.listen({ port: ENV.PORT, host: "0.0.0.0" }).then(() => {
    app.log.info(`agent listening on :${ENV.PORT}`);
  }).catch(err => { app.log.error(err); process.exit(1); });
  

async function ensureRoom() {
    if (room) return room;
    console.log("Agent joining room as:", ENV.WHO);
    const r = await connectRoom({tokenEndpoint: ENV.TOKEN_ENDPOINT, room: ENV.ROOM, who: ENV.WHO,});
    room = r.room;
    publisher = new LivePublisher(room);
    console.log("Audio publisher ready");

    room.on(RoomEvent.ParticipantConnected, (p) => {
        console.log("[agent] Participant connected:", p?.identity);
    });
    
    room.on(RoomEvent.ParticipantDisconnected, async (p) => {
        console.log("[agent] Participant disconnected:", p?.identity);
        
        try {
            await speakBridgeRealtime({ publisher: publisher!, participantName: p?.identity });
        } catch (e) {
            console.error("[agent] Bridge failed:", e);
        }
    });
    return room;
  }

  
function must(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Environment variable ${name} is not set`);
    return value;
}

ensureRoom().catch((e) => app.log.error(e));
