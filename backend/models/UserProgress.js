const mongoose = require('mongoose');

/**
 * Reward and streak state for one anonymous device identity.
 *
 * The browser is the source of truth for progress — points are awarded locally
 * the instant an action completes, because a reward that waits on a network
 * round trip stops working as a reward. This collection is the mirror that lets
 * the same identity keep its streak across devices, so writes are last-write-
 * wins on a whole snapshot rather than incremental increments.
 */
const UserProgressSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    points: {
      type: Number,
      default: 0,
      min: 0
    },
    /** Cumulative count per award kind, e.g. { focusSession: 12, modeRun: 40 }. */
    counters: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    /** Ids of milestones already celebrated, so they never fire twice. */
    milestones: {
      type: [String],
      default: []
    },
    streakDays: {
      type: Number,
      default: 0,
      min: 0
    },
    longestStreakDays: {
      type: Number,
      default: 0,
      min: 0
    },
    /** Local calendar day (YYYY-MM-DD) of the most recent awarded action. */
    lastActiveDay: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.UserProgress || mongoose.model('UserProgress', UserProgressSchema);
