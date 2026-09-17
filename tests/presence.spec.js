import { test, expect } from '@playwright/test';

/**
 * P2P presence - two peers, one room, each has to see the other move.
 *
 * Every peer gets its own BrowserContext (its own storage partition) AND the
 * run gets its own room: storage isolation alone does not isolate the network,
 * so any peer still holding an older state would replicate it back into a
 * "clean" context and the test would pass or fail on timing, not on logic.
 */

const RUN_ID = Date.now().toString(36);
/** One room per test, so no test can ever inherit another's peers. */
const roomFor = (label) => `wgpu-${RUN_ID}-${label}`;
const WORLD_BOOT_TIMEOUT = 120_000;   // textures, GLB rig and the WebGPU pipelines

/** Collect every RTCPeerConnection the page builds, before any script runs. */
const COLLECT_PEER_CONNECTIONS = () => {
  const Native = window.RTCPeerConnection;
  window.__rtc = [];
  window.RTCPeerConnection = function (...args) {
    const pc = new Native(...args);
    window.__rtc.push(pc);
    return pc;
  };
  window.RTCPeerConnection.prototype = Native.prototype;
};

/**
 * Open the world in a fresh context and walk through the entry dialog.
 * @returns {Promise<{context: import('@playwright/test').BrowserContext, page: import('@playwright/test').Page}>}
 */
const joinWorld = async (browser, name, room) => {
  const context = await browser.newContext();
  await context.addInitScript(COLLECT_PEER_CONNECTIONS);
  const page = await context.newPage();

  await page.goto(`/?room=${room}`);

  const nameField = page.locator('#player-name-input');
  await expect(nameField).toBeVisible({ timeout: WORLD_BOOT_TIMEOUT });
  await nameField.fill(name);
  await page.getByRole('button', { name: 'Enter World' }).click();

  await expect(page.locator('#player-name')).toHaveText(name);
  return { context, page };
};

/** Remote players as the page itself sees them. */
const remotePlayers = (page) => page.evaluate(() => window.presence.getPeers().map((p) => ({ name: p.name, x: p.x, z: p.z })));

/** True once ICE negotiated a real path and bytes actually crossed it. */
const webrtcConnected = (page) => page.evaluate(async () => {
  for (const pc of window.__rtc ?? []) {
    for (const report of await pc.getStats()) {
      const [, stat] = report;
      if (stat.type === 'candidate-pair' && stat.state === 'succeeded' && stat.bytesReceived > 0) return true;
    }
  }
  return false;
});

test('two peers see each other move', async ({ browser }) => {
  const room = roomFor('pair');
  const alice = await joinWorld(browser, 'Alice', room);
  const bob = await joinWorld(browser, 'Bob', room);

  // The HUD is the honest witness: each page counts exactly one remote player.
  await expect(alice.page.locator('#peer-count')).toHaveText('1');
  await expect(bob.page.locator('#peer-count')).toHaveText('1');

  await expect.poll(() => remotePlayers(alice.page).then((peers) => peers[0]?.name)).toBe('Bob');
  await expect.poll(() => remotePlayers(bob.page).then((peers) => peers[0]?.name)).toBe('Alice');

  // Alice walks; Bob has to see her move, not just exist.
  const [start] = await remotePlayers(bob.page);
  await alice.page.keyboard.down('w');
  await expect
    .poll(() => remotePlayers(bob.page).then(([peer]) => Math.hypot(peer.x - start.x, peer.z - start.z)))
    .toBeGreaterThan(2);
  await alice.page.keyboard.up('w');

  // ...and it crossed WebRTC, not a shared storage partition.
  await expect.poll(() => webrtcConnected(bob.page)).toBe(true);

  await alice.context.close();
  await bob.context.close();
});

test('a lone peer still gets a playable world', async ({ browser }) => {
  const solo = await joinWorld(browser, 'Solo', roomFor('solo'));

  await expect(solo.page.locator('#peer-count')).toHaveText('0');
  await expect(solo.page.locator('#position')).toBeVisible();

  await solo.context.close();
});
