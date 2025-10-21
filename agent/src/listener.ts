import { Room, RoomEvent } from "@livekit/rtc-node";
import { fetch } from "undici";


// calls server to generate token and connect to room for agent

export async function connectRoom(opts: {tokenEndpoint: string; room: string; who: string;}) {
  const response = await fetch(`${opts.tokenEndpoint}?${new URLSearchParams({room: opts.room, who: opts.who})}`);
  
  if (!response.ok) {
    throw new Error(`Token request failed: ${response.status} ${response.statusText}`);
  }
  
  const { token, ws } = await response.json() as { token: string; ws: string };
  const room = new Room();

  await room.connect(ws, token);
  console.log("[agent] connected as", opts.who, "to room", opts.room);

  return { room };
}
