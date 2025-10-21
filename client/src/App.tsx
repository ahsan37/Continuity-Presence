import { useState } from "react";
import { Room, RoomEvent, RemoteTrack } from "livekit-client";


export default function App() {
  const [connected, setConnected] = useState(false);



  async function joinRoom(deviceId?: string) {
    // Generate unique client ID
    let clientId = sessionStorage.getItem("clientId");
    if (!clientId) {
      clientId = `client-${Math.random().toString(36).substring(2, 9)}`;
      sessionStorage.setItem("clientId", clientId);
    }

    // Request LiveKit token from orchestrator
    const u = new URL(import.meta.env.VITE_TOKEN_ENDPOINT);
    u.searchParams.set("room", "demo");
    u.searchParams.set("who", clientId);
    const res = await fetch(u, { cache: "no-store" });
    const { token, ws } = await res.json();

    // Create LiveKit room 
    const room = new Room({
      audioCaptureDefaults: {
        deviceId,
      },
    });

    // Listen for incoming audio 
    room.on(RoomEvent.TrackSubscribed, async (track: RemoteTrack) => {
      if (track.kind === "audio") {
        const audio = track.attach() as HTMLAudioElement;
        audio.autoplay = true;
        document.body.appendChild(audio);
      }
    });

    // Connect and enable microphone
    await room.connect(ws, token, { autoSubscribe: true });
    await room.startAudio();
    await room.localParticipant.setMicrophoneEnabled(true, { deviceId });
    
    console.log("[client] Connected as:", clientId);
    setConnected(true);
  }



  return (
    <div style={{ padding: 24 }}>
      <h2>Continuity Presence — Client</h2>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          disabled={connected}
          onClick={() => {
            const sel = document.getElementById("mic") as HTMLSelectElement;
            joinRoom(sel?.value || undefined);
          }}>
          {connected ? " Connected" : "Join Room"}
        </button>
      </div>
    </div>
  );
}
