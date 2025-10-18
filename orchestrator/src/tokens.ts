import { AccessToken } from "livekit-server-sdk";
import type { VideoGrant } from "livekit-server-sdk";

export async function issueToken({
    apiKey,
    apiSecret,
    roomName,
    identity,
    ttlSeconds = 1800,
    canPublish = true,
    canSubscribe = true,
  }: {
    apiKey: string;
    apiSecret: string;
    roomName: string;
    identity: string;
    ttlSeconds?: number;
    canPublish?: boolean;
    canSubscribe?: boolean;
  }) {
    const at = new AccessToken(apiKey, apiSecret);
    at.identity = identity;
    at.ttl = Math.floor(Date.now() / 1000) + ttlSeconds;

  
    const grant: VideoGrant = {
      roomJoin: true,
      room: roomName,
      canPublish,
      canSubscribe,
    };
    at.addGrant(grant);
    const jwt = await at.toJwt();           
    return jwt;
  }



