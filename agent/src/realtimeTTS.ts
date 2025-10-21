import WebSocket from "ws";

// OpenAI Realtime API sends base64 audio
function extractAudioB64(msg: any): string | undefined {
  if (!msg || typeof msg !== "object") return;
  return typeof msg.delta === "string" ? msg.delta : undefined;
}

function decodeAudio(b64: string): Int16Array | null {
    try {
      const buf = Buffer.from(b64, "base64");
      if (buf.length === 0 || buf.length % 2 !== 0) return null;
      return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
    } catch {
      return null;
    }
}
  

export async function* streamRealtimeTTS(opts: {
  apiKey: string;
  url?: string;          
  text: string;
  voice?: string;
}) {
  const {
    apiKey,
    url = process.env.OPENAI_REALTIME_URL,
    text,
    voice = "alloy",
  } = opts;

  if (!apiKey) throw new Error("apiKey is required");
  if (!url) throw new Error("url is required");

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });

  await new Promise<void>((resolve, reject) => {
    const to = setTimeout(() => reject(new Error("OpenAI WS connect timeout")), 10_000);
    ws.once("open", () => { clearTimeout(to); resolve(); });
    ws.once("error", (e) => { clearTimeout(to); reject(e); });
  });

  const sessionMsg = {
    type: "session.update",
    session: { 
      modalities: ["audio", "text"], 
      voice,
      instructions: "You are a helpful assistant. Always respond in English.",
    },
  };
  ws.send(JSON.stringify(sessionMsg));

  const createMsg = {
    type: "response.create",
    response: { 
      modalities: ["audio", "text"], 
      instructions: `Speak this text in English: ${text}` 
    },
  };
  ws.send(JSON.stringify(createMsg));

  let done = false;
  let gotAnyAudio = false;
  const queue: Int16Array[] = [];
  let notify: (() => void) | null = null;

  function enqueue(arr: Int16Array) {
    queue.push(arr);
    if (notify) { notify(); notify = null; }
  }

  function finish() {
    done = true;
    try { ws.close(); } catch {}
    if (notify) { notify(); notify = null; }
  }

  ws.on("message", (raw) => {
    let msg: any;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    const t = msg?.type;

    if (t === "response.audio.delta") {
        const b64 = extractAudioB64(msg);
        if (typeof b64 === "string") {
          const pcm = decodeAudio(b64);
          if (pcm && pcm.length) {
            gotAnyAudio = true;
            enqueue(pcm);
          }
          return;
        }
    }

    if (t === "response.audio.done") {
      finish();
      return;
    }

    if (t === "response.done") {
      finish();
      return;
    }

    if (t === "error") {
      console.error("[realtimeTTS] error:", msg);
      finish();
      return;
    }
  });

  ws.on("close", () => {
    finish();
  });

  const startTs = Date.now();
  try {
    while (true) {
      if (queue.length) {
        yield queue.shift()!;
        continue;
      }
      if (done) break;

      if (!gotAnyAudio && Date.now() - startTs > 7_000) {
        throw new Error("Realtime TTS returned no audio within 7s");
      }

      await new Promise<void>((resolve) => { notify = resolve; });
    }

    if (!gotAnyAudio) throw new Error("Realtime TTS returned no audio");
  } finally {
    if (ws.readyState === ws.OPEN) ws.terminate();
  }
}
