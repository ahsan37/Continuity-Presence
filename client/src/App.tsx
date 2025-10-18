import { useState } from "react";
import { Room, RoomEvent } from "livekit-client";

function App() {
  const [connected, setConnected] = useState(false);

  async function joinRoom() {
    const res = await fetch(`${import.meta.env.VITE_TOKEN_ENDPOINT}?room=demo&who=client`);
    const { token, ws } = await res.json();

    const room = new Room();
    await room.connect(ws, token);
    setConnected(true);

    room.on(RoomEvent.ConnectionStateChanged, (state) =>
      console.log("Room state:", state)
    );

    await room.localParticipant.enableCameraAndMicrophone();
  }

  return (
    <div style={{ padding: 40 }}>
      <h2>Continuity Presence – Client</h2>
      <button onClick={joinRoom} disabled={connected}>
        {connected ? "Connected" : "Join Room"}
      </button>
    </div>
  );
}

export default App;
