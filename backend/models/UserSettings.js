const mongoose = require('mongoose');

const UserSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    profile: {
      type: [String],
      default: []
    },
    theme: {
      type: String,
      default: 'broadsheet',
      enum: ['broadsheet', 'cream', 'pastel', 'sage', 'velvet', 'contrast']
    },
    // Mirrors FONT_STACKS in the web client. 'lexend' was reachable in the UI
    // long before it was declared here, so a strict schema was quietly dropping
    // it on every sync.
    font: {
      type: String,
      default: 'serif',
      enum: ['serif', 'system', 'hyper', 'lexend', 'dyslexic']
    },
    textSize: {
      type: String,
      default: 'normal',
      enum: ['normal', 'comfortable', 'large']
    },
    // Mirrors DEFAULT_PREFS in the web client, which defaults to 'relaxed'
    // rather than 'normal': extra letter spacing is the only typographic lever
    // in this product with a controlled result behind it (Zorzi et al., PNAS
    // 2012 — ~20% faster reading, roughly half the errors, no training), and a
    // default of 'normal' meant almost nobody ever received it. A server
    // default that disagrees with the client's would hand a new browser the old
    // dose on its first settings fetch.
    spacing: {
      type: String,
      default: 'relaxed',
      enum: ['normal', 'relaxed', 'spacious']
    },
    motion: {
      type: String,
      default: 'move',
      enum: ['move', 'still']
    },
    readingRuler: {
      type: Boolean,
      default: false
    },
    bionicReading: {
      type: Boolean,
      default: false
    },
    /** Read a mind map branch aloud when the cursor or focus reaches it. */
    speakOnHover: {
      type: Boolean,
      default: true
    },
    /** Draw map branches without their supporting prose. */
    pictureMode: {
      type: Boolean,
      default: false
    },
    /** Show points, streaks, and milestones. */
    rewards: {
      type: Boolean,
      default: true
    },
    onboardingDone: {
      type: Boolean,
      default: false
    },
    shortcuts: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.UserSettings || mongoose.model('UserSettings', UserSettingsSchema);
