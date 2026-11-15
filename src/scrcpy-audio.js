const CONFIG_FLAG = 1n << 62n;
const MAX_PACKET_BYTES = 16 * 1024 * 1024;

/**
 * Relays scrcpy's length-framed audio stream to browser clients.
 * Forward-tunnel connection order when enabled is: video, audio, control (separate sockets).
 * Audio stream: 4-byte codec id (e.g. "opus"), then packets [8-byte pts/flags][4-byte size][payload].
 * CONFIG packets (flag) may carry decoder configuration; we relay all packets and prime clients with codec+config.
 */
export class ScrcpyAudioStream {
  /** @param {import('node:net').Socket} socket @param {import('./log.js').Logger} logger */
  constructor(socket, logger) {
    this.socket = socket;
    this.logger = logger;
    this.pending = Buffer.alloc(0);
    this.codecHeader = null;
    this.configPacket = null;
    this.clients = new Set();
    this.closed = false;
    this.processing = Promise.resolve();
    this.connected = false;
    this.totalPacketsReceived = 0;
    this.lastPacketAt = null;
    this.codecConfigured = false;
    this.lastError = null;

    socket.setNoDelay(true);
    socket.on('connect', () => { this.connected = true; });
    if (!socket.connecting) this.connected = true;
    socket.on('data', (chunk) => {
      this.processing = this.processing.then(() => this.#consume(chunk)).catch((error) => {
        this.lastError = error.message;
        this.logger.error('scrcpy audio parser failed', { message: error.message });
        this.#end(error);
      });
    });
    socket.on('error', (error) => {
      this.lastError = error.message;
      this.logger.warn('scrcpy audio socket error', { message: error.message });
      this.#end(error);
    });
    socket.on('close', (hadError) => {
      this.connected = false;
      this.#end(new Error(`scrcpy audio socket closed (bytes=${socket.bytesRead}, hadError=${hadError})`));
    });
  }

  /** @param {import('node:http').ServerResponse} response */
  addClient(response) {
    if (this.closed) { response.end(); return; }
    const client = { response, primed: false };
    this.clients.add(client);
    response.on('close', () => this.clients.delete(client));
    this.#prime(client);
  }

  close() {
    try { this.socket.destroy(); } catch {}
    this.#end(new Error('scrcpy audio stream stopped'));
  }

  async #consume(chunk) {
    this.pending = this.pending.length ? Buffer.concat([this.pending, chunk]) : chunk;
    while (!this.closed) {
      if (!this.codecHeader) {
        if (this.pending.length < 4) return;
        this.codecHeader = Buffer.from(this.pending.subarray(0, 4));
        this.pending = this.pending.subarray(4);
        const codec = this.codecHeader.toString('ascii').replace(/\0/g, '').trim();
        this.logger.info('scrcpy audio codec header', { codec: codec || this.codecHeader.toString('hex') });
      }
      if (this.pending.length < 12) return;
      const ptsFlags = this.pending.readBigUInt64BE(0);
      const size = this.pending.readUInt32BE(8);
      if (size > MAX_PACKET_BYTES) {
        this.#end(new Error(`scrcpy audio packet is too large (${size} bytes)`));
        return;
      }
      if (this.pending.length < 12 + size) return;
      const packet = Buffer.from(this.pending.subarray(0, 12 + size));
      this.pending = this.pending.subarray(12 + size);
      const isConfig = Boolean(ptsFlags & CONFIG_FLAG);
      if (isConfig) {
        this.configPacket = packet;
        this.codecConfigured = Boolean(this.codecHeader);
        for (const client of this.clients) client.primed = false;
        continue;
      }
      this.totalPacketsReceived++;
      this.lastPacketAt = Date.now();
      for (const client of this.clients) {
        if (client.primed) this.#writePacket(client, packet);
        else this.#prime(client);
      }
    }
  }

  #prime(client) {
    if (client.primed || !this.codecHeader) return;
    client.primed = true;
    this.#writePacket(client, this.codecHeader);
    if (this.configPacket) this.#writePacket(client, this.configPacket);
  }

  #writePacket(client, packet) {
    if (client.response.writableLength > 512 * 1024) {
      this.clients.delete(client);
      try { client.response.destroy(new Error('Audio client fell too far behind')); } catch {}
      return;
    }
    try { client.response.write(packet); } catch {}
  }

  #end(error) {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.lastError = error?.message ?? String(error);
    for (const client of this.clients) {
      try { client.response.end(); } catch {}
    }
    this.clients.clear();
  }

  stats() {
    const codec = this.codecHeader ? this.codecHeader.toString('ascii').replace(/\0/g, '').trim().toLowerCase() : null;
    return {
      audioConnected: this.connected && !this.closed,
      audioPacketsReceived: this.totalPacketsReceived,
      lastAudioPacketAt: this.lastPacketAt,
      audioCodec: codec || null,
      audioCodecConfigured: Boolean(this.codecConfigured || this.codecHeader),
      lastAudioError: this.lastError ?? null,
      audioClientCount: this.clients.size,
      audioClosed: this.closed,
    };
  }
}
