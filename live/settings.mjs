// Stream settings. Edit freely; restart the server to apply. Secrets and the account name
// come from environment variables (see live/README.md), never from this file.

export const settings = {
  cooldownSeconds: 6, // per viewer, between chat launches
  maxShellsPerSecond: 4, // across all of chat, so a busy room stays readable
  likeGoal: 1000, // every this many likes plays the grand finale

  // 'manual': dedications wait for Approve on the admin page. 'auto': they play as soon as
  // they pass the word filter (for unattended 24/7 runs). DEDICATIONS=auto overrides.
  dedications: 'manual',
  // Words in the sky (dedications and !sky messages) cost a gift of at least this many
  // diamonds (Hand Hearts is 99) within the window; each one uses up that much. 0 makes
  // them free, with the cooldown below instead.
  skyMinDiamonds: 99,
  skyWindowMinutes: 10,
  dedicationCooldownSeconds: 300, // per viewer, when free
  maxPending: 30,

  gifts: {
    // By gift name (lower case), as TikTok names them. Effects are in src/live-catalog.js.
    byName: {
      rose: 'rose',
      'finger heart': 'heart',
      'heart me': 'heart',
      'hand hearts': 'name',
      confetti: 'barrage',
      doughnut: 'fountain',
      perfume: 'fountain',
      'money gun': 'barrage',
      galaxy: 'finale',
    },
    // Any other gift, by its diamond value: the last tier it reaches.
    tiers: [
      [0, 'sparkle'],
      [10, 'fountain'],
      [99, 'name'],
      [299, 'barrage'],
      [1000, 'finale'],
    ],
  },
};
