const mongoose = require('mongoose');

const SessionLogSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: 'anonymous_user',
      index: true
    },
    action: {
      type: String,
      required: true
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.models.SessionLog || mongoose.model('SessionLog', SessionLogSchema);
