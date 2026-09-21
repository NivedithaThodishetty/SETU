const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema(
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
      required: true,
      trim: true,
      default: 'New Research Chat'
    },
    currentTopic: {
      type: String,
      trim: true,
      default: ''
    },
    mode: {
      type: String,
      default: 'mindmap'
    },
    mindMapId: {
      type: String,
      default: null,
      index: true
    },
    documentIds: {
      type: [String],
      default: []
    },
    pinned: {
      type: Boolean,
      default: false
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    lastMessageAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

ConversationSchema.index({ userId: 1, updatedAt: -1 });
ConversationSchema.index({ title: 'text', currentTopic: 'text' });

module.exports =
  mongoose.models.Conversation || mongoose.model('Conversation', ConversationSchema);
