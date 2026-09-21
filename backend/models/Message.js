const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    conversationId: {
      type: String,
      required: true,
      index: true
    },
    userId: {
      type: String,
      default: 'anonymous_user',
      index: true
    },
    role: {
      type: String,
      required: true,
      enum: ['user', 'assistant', 'system']
    },
    content: {
      type: String,
      required: true,
      default: ''
    },
    intent: {
      type: String,
      default: 'chat'
    },
    stage: {
      type: String,
      default: 'done'
    },
    sources: [
      {
        title: { type: String },
        url: { type: String }
      }
    ],
    mindMapData: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    fileAttachments: [
      {
        fileId: { type: String },
        name: { type: String },
        mimeType: { type: String },
        size: { type: Number }
      }
    ],
    modelUsed: {
      type: String,
      default: null
    },
    provider: {
      type: String,
      default: null
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

MessageSchema.index({ conversationId: 1, createdAt: 1 });
MessageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.models.Message || mongoose.model('Message', MessageSchema);
