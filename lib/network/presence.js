/**
 * Presence - P2P player presence over a GenosDB data channel.
 *
 * Every peer broadcasts its absolute world position, facing and current
 * animation clip on one shared channel. Nothing is persisted: presence is
 * transient by nature, so it travels over `db.room.channel` (ephemeral, never
 * written to the graph) and dies with the session.
 *
 * GenosDB is loaded straight from the CDN, so it stays out of the build.
 *
 * @module network/presence
 */

/** GenosDB engine - loaded at runtime, never bundled. */
const GENOSDB_CDN = 'https://cdn.jsdelivr.net/npm/genosdb@latest/dist/index.min.js';

const CHANNEL = 'presence';        // channel names are capped at 12 bytes
const BROADCAST_HZ = 12;
const BROADCAST_INTERVAL = 1000 / BROADCAST_HZ;
const PEER_TIMEOUT_MS = 5000;      // safety net behind `peer:leave`
const SMOOTHING = 12;              // exponential lerp rate for remote motion
const DEFAULT_ROOM = 'webgpu-world';
const MAX_NAME_LENGTH = 16;

/**
 * Room name for this session. `?room=<name>` opens a private world - and gives
 * each test run a clean network, which storage isolation alone cannot provide.
 * @returns {string}
 */
export const getRoomName = () =>
  new URLSearchParams(location.search).get('room')?.trim().slice(0, 32) || DEFAULT_ROOM;

/**
 * Clamp an untrusted peer name to what a nameplate can paint.
 * @param {string} name
 * @returns {string}
 */
export const sanitizeName = (name) =>
  String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME_LENGTH) || 'Guest';

/** Shortest-path angular interpolation (radians). */
const lerpAngle = (from, to, t) => {
  const delta = ((((to - from + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return from + delta * t;
};

/**
 * A presence system that does nothing, so the world still runs single-player.
 * Also used as a stand-in while the real one connects.
 * @returns {object} inert presence system
 */
export const createOfflinePresence = () => ({
  online: false,
  selfId: null,
  roomName: getRoomName(),
  broadcast: () => {},
  update: () => {},
  getPeers: () => [],
  getPeerCount: () => 0,
  destroy: () => {},
});

/**
 * Create the P2P presence system. Never throws: any failure (no CDN, no relay,
 * no WebRTC) degrades to an inert system and the world runs on its own.
 *
 * @param {object} options
 * @param {string} options.name - local player name, shown on peers' nameplates
 * @returns {Promise<object>} presence system
 */
export async function createPresenceSystem({ name }) {
  const roomName = getRoomName();
  let db;

  try {
    const { gdb } = await import(/* @vite-ignore */ GENOSDB_CDN);
    db = await gdb(roomName, { rtc: true });   // no Security Manager: presence needs no identity
  } catch (error) {
    console.warn('[Presence] GenosDB unavailable - single-player:', error.message);
    return createOfflinePresence();
  }

  const room = db.room;
  if (!room) {
    console.warn('[Presence] db.room unavailable - single-player');
    return createOfflinePresence();
  }

  const channel = room.channel(CHANNEL);
  const localName = sanitizeName(name);

  /** @type {Map<string, object>} peerId -> peer state (target + interpolated) */
  const peers = new Map();
  /** @type {object[]} rebuilt every update, handed to the renderer */
  const livePeers = [];
  let lastSent = 0;

  const onMessage = (data, peerId) => {
    if (!data || typeof data !== 'object' || !Number.isFinite(data.x)) return;

    let peer = peers.get(peerId);
    if (!peer) {
      peer = { id: peerId, name: 'Guest', x: data.x, y: data.y, z: data.z, rotation: data.r ?? 0 };
      peers.set(peerId, peer);
      console.log(`[Presence] "${sanitizeName(data.n)}" joined (${peerId})`);
    }

    peer.name = sanitizeName(data.n);
    peer.targetX = data.x;
    peer.targetY = data.y;
    peer.targetZ = data.z;
    peer.targetRotation = data.r ?? 0;
    peer.anim = typeof data.a === 'string' ? data.a : 'Idle';
    peer.lastSeen = performance.now();
  };
  channel.on('message', onMessage);

  const onPeerLeave = (peerId) => {
    if (peers.delete(peerId)) console.log(`[Presence] peer left: ${peerId}`);
  };
  room.on('peer:leave', onPeerLeave);

  /**
   * Broadcast the local player. Throttled to BROADCAST_HZ - the render loop can
   * call it every frame.
   * @param {{x: number, y: number, z: number}} position - absolute world position
   * @param {number} rotation - facing, radians around Y
   * @param {string} anim - current animation clip (Idle/Walk/Run/Swim/...)
   */
  const broadcast = (position, rotation, anim) => {
    const now = performance.now();
    if (now - lastSent < BROADCAST_INTERVAL) return;
    lastSent = now;

    // In a full mesh `send` rejects when it cannot deliver; a peer dropping out
    // is routine, so swallow it rather than leak unhandled rejections.
    channel
      .send({ n: localName, x: position.x, y: position.y, z: position.z, r: rotation, a: anim })
      ?.catch?.(() => {});
  };

  /**
   * Advance remote peers: drop the silent ones, ease the rest toward their last
   * known snapshot (messages arrive at 12 Hz, frames render at 60).
   * @param {number} dt - seconds since the last frame
   */
  const update = (dt) => {
    const now = performance.now();
    const t = 1 - Math.exp(-SMOOTHING * dt);   // framerate-independent lerp

    livePeers.length = 0;
    for (const [peerId, peer] of peers) {
      if (now - peer.lastSeen > PEER_TIMEOUT_MS) {
        peers.delete(peerId);
        continue;
      }
      peer.x += (peer.targetX - peer.x) * t;
      peer.y += (peer.targetY - peer.y) * t;
      peer.z += (peer.targetZ - peer.z) * t;
      peer.rotation = lerpAngle(peer.rotation, peer.targetRotation, t);
      livePeers.push(peer);
    }
  };

  const destroy = () => {
    channel.off?.('message', onMessage);
    room.off?.('peer:leave', onPeerLeave);
    peers.clear();
    livePeers.length = 0;
  };

  console.log(`[Presence] online as "${localName}" in room "${roomName}" (${db.selfId})`);

  return {
    online: true,
    selfId: db.selfId,
    roomName,
    broadcast,
    update,
    getPeers: () => livePeers,
    getPeerCount: () => livePeers.length,
    destroy,
  };
}
