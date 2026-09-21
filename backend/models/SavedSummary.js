const mongoose = require('mongoose');

const SavedSummarySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: String,
      default: 'anonymous_user',
      index: true
    },
    title: {
      type: String,
      trim: true,
      default: 'Untitled Summary'
    },
    content: {
      type: String,
      default: ''
    },
    summaryPoints: {
      type: [String],
      default: []
    },
    mode: {
      type: String,
      default: 'summary'
    },
    resultData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

SavedSummarySchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.SavedSummary || mongoose.model('SavedSummary', SavedSummarySchema);
