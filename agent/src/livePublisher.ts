import {Room, LocalAudioTrack, AudioSource, AudioFrame, TrackPublishOptions, TrackSource} from "@livekit/rtc-node";
import { performance } from "node:perf_hooks";

  const OUT_SR = 48000; // out smaple rate 48kHz
  const FRAME_48 = 960; // 960 smaples at 20ms @ 48k
  const SPEED = 1.00;  
  
  const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));
  
 // upsample 24k to 48k 
  function upsample2xLinearStreaming(
    pcm24: Int16Array,
    prev: number | null
  ): { pcm48: Int16Array; last: number } {
    const n = pcm24.length;
    if (n === 0) return { pcm48: new Int16Array(0), last: prev ?? 0 };
  
    const tmp = new Int16Array(2 * n + (prev !== null ? 1 : 0));
    let j = 0;
  
    if (prev !== null) {
      const s0 = prev;
      const s1 = pcm24[0];
      tmp[j++] = ((s0 + s1) >> 1);
    }
  
    for (let i = 0; i < n - 1; i++) {
      const s0 = pcm24[i];
      const s1 = pcm24[i + 1];
      tmp[j++] = s0;
      tmp[j++] = ((s0 + s1) >> 1);
    }
  
    tmp[j++] = pcm24[n - 1];
  
    const used = prev !== null ? 2 * n : j;
    const out = tmp.subarray(0, used);
  
    return { pcm48: out, last: pcm24[n - 1] };
  }
  

// takes raw PCM chunks (tts) and turns into stream Livekit can send into the room so agent is a talker

  export class LivePublisher {
    private source?: AudioSource;
    private track?: LocalAudioTrack;
  
    // pacing
    private t0: number | null = null;
    private played48 = 0;
  
    // streaming upsampler state
    private carryLast24: number | null = null;
    private fifo48 = new Int16Array(0); 
  
    constructor(private room: Room) {}
  
    async start(name = "continuity-realtime") {
      if (this.source && this.track) return;
  
      this.source = new AudioSource(OUT_SR, 1, 5000);
      this.track = LocalAudioTrack.createAudioTrack(name, this.source);
  
      // publish track to the room 
      const opts = new TrackPublishOptions();
      opts.source = TrackSource.SOURCE_MICROPHONE;
  
      const lp = this.room.localParticipant;
      if (!lp) throw new Error("Local participant not ready");
      await lp.publishTrack(this.track, opts);
  
      this.t0 = null;
      this.played48 = 0;
      this.carryLast24 = null;
      this.fifo48 = new Int16Array(0);
    }
  
    // sends auduio frames to the room at the correct pace
    private async capturePaced(frame48: Int16Array) {
      if (!this.source) return;
  
      if (this.t0 === null) this.t0 = performance.now();
      const expectedMs = (this.played48 / (OUT_SR * SPEED)) * 1000;
      const nowMs = performance.now() - this.t0;
      const delay = expectedMs - nowMs;
      if (delay > 0) await sleep(delay);
  
      const f = AudioFrame.create(OUT_SR, 1, frame48.length);
      f.data.set(frame48);
      await this.source.captureFrame(f);
      this.played48 += frame48.length;
    }
  
    // Push 24 kHz PCM chunks as they arrive
    async push(pcm24: Int16Array) {
      if (!this.source || !this.track) await this.start();
  
      // 1) Upsample 24k -> 48k 
      const { pcm48, last } = upsample2xLinearStreaming(pcm24, this.carryLast24);
      this.carryLast24 = last;
  
      // 2) Append to FIFO
      if (this.fifo48.length === 0) {
        this.fifo48 = new Int16Array(pcm48);
      } else {
        const tmp = new Int16Array(this.fifo48.length + pcm48.length);
        tmp.set(this.fifo48, 0);
        tmp.set(pcm48, this.fifo48.length);
        this.fifo48 = tmp;
      }
  
      // 3) Drain exact frames
      while (this.fifo48.length >= FRAME_48) {
        const frame = this.fifo48.subarray(0, FRAME_48);
        await this.capturePaced(frame);
  
        const remain = this.fifo48.length - FRAME_48;
        if (remain > 0) {
          const next = new Int16Array(remain);
          next.set(this.fifo48.subarray(FRAME_48));
          this.fifo48 = next;
        } else {
          this.fifo48 = new Int16Array(0);
        }
      }
    }


    // Flush remaining audio without closing the track (for reuse)
    async flush() {
      if (this.fifo48.length > 0) {
        const tail = this.fifo48;
        const rem = tail.length % FRAME_48;
        if (rem) {
          const n = Math.min(rem, FRAME_48);
          const start = tail.length - n;
          for (let i = 0; i < n; i++) {
            tail[start + i] = (tail[start + i] * (n - i)) / n;
          }
        }
        let offset = 0;
        while (offset + FRAME_48 <= tail.length) {
          await this.capturePaced(tail.subarray(offset, offset + FRAME_48));
          offset += FRAME_48;
        }
        const leftover = tail.length - offset;
        if (leftover > 0) {
          const pad = new Int16Array(FRAME_48);
          pad.set(tail.subarray(offset), 0);
          await this.capturePaced(pad);
        }
        this.fifo48 = new Int16Array(0);
      }
  
      if (this.source) await this.source.waitForPlayout();
    }

    // stop audio stream, flush tail, and close the track
    async stop() {
      await this.flush();
  
      if (this.track) {
        const lp = this.room.localParticipant;
        if (lp && this.track.sid) {
          try { await lp.unpublishTrack(this.track.sid); } catch {}
        }
        this.track = undefined;
      }
      if (this.source) { try { this.source.close(); } catch {} this.source = undefined; }
  
      this.t0 = null;
      this.played48 = 0;
      this.carryLast24 = null;
    }
  }
  