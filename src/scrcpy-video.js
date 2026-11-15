const SESSION_FLAG = 1n << 63n;
const CONFIG_FLAG = 1n << 62n;
const KEY_FRAME_FLAG = 1n << 61n;
const MAX_PACKET_BYTES = 64 * 1024 * 1024;

/** Parses scrcpy's length-framed H.264 stream and relays frames to browser clients. */
export class ScrcpyVideoStream {
  /** @param {import('node:net').Socket} socket @param {import('./log.js').Logger} logger */
  constructor(socket, logger) {
    this.socket = socket;
    this.logger = logger;
    this.pending = Buffer.alloc(0);
    this.codecHeader = null;
    this.sessionHeader = null;
    this.configPacket = null;
    this.keyPacket = null;
    this.clients = new Set();
    this.displaySizeHandlers = new Set();
    this.closed = false;
    this.processing = Promise.resolve();
    this.metricAt = Date.now();
    this.metricBytes = 0;
    this.metricFrames = 0;
    /** Diagnostics exposed via /api/state */
    this.connected = false;
    this.totalFramesReceived = 0;
    this.lastFrameAt = null;
    this.codecConfigured = false;
    this.keyframeReceived = false;
    this.lastError = null;
    this.lastKeyframeAt = null;
    socket.setNoDelay(true);
    socket.on('connect', () => { this.connected = true; });
    if (!socket.connecting) this.connected = true;
    socket.on('data', (chunk) => {
      this.processing = this.processing.then(() => this.#consume(chunk)).catch((error) => {
        this.lastError = error.message;
        this.logger.error('scrcpy video parser failed', { message: error.message });
        this.#end(error);
      });
    });
    socket.on('error', (error) => {
      this.lastError = error.message;
      this.logger.warn('scrcpy video socket error', { message: error.message });
      this.#end(error);
    });
    socket.on('close', (hadError) => {
      this.connected = false;
      this.#end(new Error(`scrcpy video socket closed (bytes=${socket.bytesRead}, hadError=${hadError})`));
    });
  }

  /** @param {import('node:http').ServerResponse} response */
  addClient(response) {
    if (this.closed) {
      response.end();
      return;
    }
    const client = { response, primed: false };
    this.clients.add(client);
    response.on('close', () => this.clients.delete(client));
    this.#prime(client);
  }

  /** @param {(width: number, height: number) => Promise<void> | void} handler */
  onDisplaySize(handler) {
    this.displaySizeHandlers.add(handler);
  }

  close() {
    this.socket.destroy();
    this.#end(new Error('scrcpy video stream stopped'));
  }

  async #consume(chunk) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    while (!this.closed) {
      if (!this.codecHeader) {
        if (this.pending.length < 4) return;
        this.codecHeader = this.pending.subarray(0, 4);
        this.pending = this.pending.subarray(4);
        const codec = this.codecHeader.toString('ascii');
        if (codec !== 'h264') {
          this.logger.error('unsupported scrcpy video codec', { codec });
          this.#end(new Error(`Unsupported scrcpy video codec ${codec}`));
          return;
        }
      }
      if (this.pending.length < 12) return;
      const ptsFlags = this.pending.readBigUInt64BE(0);
      if (ptsFlags & SESSION_FLAG) {
        this.sessionHeader = Buffer.from(this.pending.subarray(0, 12));
        this.pending = this.pending.subarray(12);
        this.configPacket = null;
        this.keyPacket = null;
        this.keyframeReceived = false;
        for (const client of this.clients) client.primed = false;
        const width = this.sessionHeader.readUInt32BE(4);
        const height = this.sessionHeader.readUInt32BE(8);
        for (const handler of this.displaySizeHandlers) await handler(width, height);
        this.logger.info('scrcpy video display changed', {
          width,
          height,
        });
        continue;
      }
      const size = this.pending.readUInt32BE(8);
      if (size > MAX_PACKET_BYTES) {
        this.#end(new Error(`scrcpy video packet is too large (${size} bytes)`));
        return;
      }
      if (this.pending.length < 12 + size) return;
      const packet = Buffer.from(this.pending.subarray(0, 12 + size));
      this.pending = this.pending.subarray(12 + size);
      const frame = { bytes: packet, ptsFlags, isConfig: Boolean(ptsFlags & CONFIG_FLAG), isKey: Boolean(ptsFlags & KEY_FRAME_FLAG) };
      if (frame.isConfig) {
        this.configPacket = frame;
        this.keyPacket = null;
        this.codecConfigured = Boolean(this.codecHeader);
        this.keyframeReceived = false;
        for (const client of this.clients) client.primed = false;
        continue;
      }
      this.metricBytes += packet.length;
      this.metricFrames++;
      this.totalFramesReceived++;
      this.lastFrameAt = Date.now();
      const elapsed = Date.now() - this.metricAt;
      if (elapsed >= 2000) {
        this.logger.info('scrcpy video throughput', {
          fps: Math.round(this.metricFrames * 1000 / elapsed),
          mbps: Number((this.metricBytes * 8 / elapsed / 1000).toFixed(2)),
          averageFrameKb: Number((this.metricBytes / this.metricFrames / 1024).toFixed(1)),
        });
        this.metricAt = Date.now();
        this.metricBytes = 0;
        this.metricFrames = 0;
      }
      if (frame.isKey) {
        this.keyPacket = frame;
        this.keyframeReceived = true;
        this.codecConfigured = Boolean(this.codecHeader && this.configPacket);
        this.lastKeyframeAt = Date.now();
        for (const client of this.clients) {
          if (client.primed) this.#writePacket(client, packet);
          else this.#prime(client);
        }
      } else {
        for (const client of this.clients) {
          if (client.primed) this.#writePacket(client, packet);
        }
      }
    }
  }

  /** @param {{response: import('node:http').ServerResponse, primed: boolean}} client */
  #prime(client) {
    if (client.primed || !this.codecHeader || !this.sessionHeader || !this.configPacket || !this.keyPacket) return;
    client.primed = true;
    this.#writePacket(client, this.codecHeader);
    this.#writePacket(client, this.sessionHeader);
    this.#writePacket(client, this.configPacket.bytes);
    this.#writePacket(client, this.keyPacket.bytes);
  }

  /** @param {{response: import('node:http').ServerResponse, primed: boolean}} client @param {Buffer} packet */
  #writePacket(client, packet) {
    // Do not drop predictive H.264 packets: subsequent frames depend on them.
    // Disconnect only a client that cannot keep up; it can reconnect at the
    // next cached keyframe without corrupting its current decode sequence.
    // Keep a tighter bound to avoid building multi-second latency when the
    // browser or USB link stalls.
    if (client.response.writableLength > 2 * 1024 * 1024) {
      this.clients.delete(client);
      client.response.destroy(new Error('Video client fell too far behind'));
      return;
    }
    client.response.write(packet);
  }

  /** @param {Error} error */
  #end(error) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.lastError = error?.message ?? String(error);
    for (const client of this.clients) {
      try { client.response.end(); } catch {}
    }
    this.clients.clear();
    this.logger.warn('scrcpy video stream ended', { message: this.lastError });
  }

  /** Diagnostics snapshot for /api/state */
  stats() {
    return {
      videoConnected: this.connected && !this.closed,
      videoFramesReceived: this.totalFramesReceived,
      lastVideoFrameAt: this.lastFrameAt,
      codecConfigured: Boolean(this.codecConfigured || (this.codecHeader && this.configPacket)),
      keyframeReceived: Boolean(this.keyframeReceived),
      lastVideoError: this.lastError ?? null,
      clientCount: this.clients.size,
      closed: this.closed,
    };
  }
}
