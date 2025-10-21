import { LivePublisher } from "./livePublisher.js";
import { streamRealtimeTTS } from "./realtimeTTS.js";

function defaultBridgeLine(name?: string) {
  const who = name ? `${name}` : "";
  return `We hit a brief connection issue with ${who}. One moment while we reconnect.`;
}

export async function speakBridgeRealtime({ publisher, participantName }: 
{
  publisher: LivePublisher;
  participantName?: string;
}) {
  const text = defaultBridgeLine(participantName);
  console.log("[bridge] Playing message:", text);

  let n = 0;
  for await (const pcm of streamRealtimeTTS({
    apiKey: process.env.OPENAI_API_KEY!,
    url: process.env.OPENAI_REALTIME_URL,
    text,
    voice: process.env.TTS_VOICE ?? "alloy",
  })) {
    await publisher.push(pcm);
    n++;
  }
  
  // Flush remaining audio but keep the track alive for reuse
  await publisher.flush();
  console.log("[bridge] Finished playing message");
  return n;
}
