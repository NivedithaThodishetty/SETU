const mongoose = require('mongoose');

const MindMapSchema = new mongoose.Schema(
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
    conversationId: {
      type: String,
      default: null,
      index: true
    },
    documentId: {
      type: String,
      default: null,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    topic: {
      type: String,
      trim: true
    },
    summary: {
      type: String,
      default: ''
    },
    keyFacts: {
      type: [String],
      default: []
    },
    followUps: {
      type: [String],
      default: []
    },
    sources: [
      {
        title: { type: String },
        url: { type: String }
      }
    ],
    grounded: {
      type: Boolean,
      default: false
    },
    root: {
      type: mongoose.Schema.Types.Mixed,
      required: true
    },
    nodeCount: {
      type: Number,
      default: 1
    },
    isLensHandoff: {
      type: Boolean,
      default: false
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

MindMapSchema.index({ userId: 1, updatedAt: -1 });
MindMapSchema.index({ title: 'text', summary: 'text', topic: 'text' });

module.exports = mongoose.models.MindMap || mongoose.model('MindMap', MindMapSchema);
