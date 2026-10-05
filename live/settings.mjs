// Stream settings. Edit freely; restart the server to apply. Secrets and the account name
// come from environment variables (see live/README.md), never from this file.

export const settings = {
  cooldownSeconds: 6, // per viewer, between chat launches
  maxShellsPerSecond: 4, // across all of chat, so a busy room stays readable
  likeGoal: 1000, // every this many likes plays the grand finale

  // 'manual': dedications wait for Approve on the admin page. 'auto': they play as soon as
  // they pass the word filter (for unattended 24/7 runs). DEDICATIONS=auto overrides.
  dedications: 'manual',
  // Money is in US cents: a $2.00 Super Chat is worth 200. Words in the sky (dedications
  // and !sky messages) cost Super Chats adding up to at least this much within the window;
  // each one uses up that much. 0 makes them free, with the cooldown below instead.
  skyMinDiamonds: 200,
  skyWindowMinutes: 10,
  dedicationCooldownSeconds: 300, // per viewer, when free
  maxPending: 30,
  membershipCents: 200, // what a new member, milestone or gifted membership counts as

  gifts: {
    // By name (lower case). Effects are in src/live-catalog.js.
    byName: {
      'new member': 'name',
      'member milestone': 'name',
      'gifted memberships': 'barrage',
    },
    // Super Chats and Super Stickers, by their price in cents: the last tier reached.
    tiers: [
      [0, 'sparkle'],
      [100, 'fountain'],
      [200, 'name'],
      [500, 'barrage'],
      [2000, 'finale'],
    ],
  },
};
