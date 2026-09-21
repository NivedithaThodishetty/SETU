const mongoose = require('mongoose');

const DocumentFileSchema = new mongoose.Schema(
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
    originalName: {
      type: String,
      required: true,
      trim: true
    },
    mimeType: {
      type: String,
      required: true
    },
    size: {
      type: Number,
      required: true
    },
    extractedText: {
      type: String,
      required: true
    },
    summary: {
      type: String,
      default: ''
    },
    keyPoints: {
      type: [String],
      default: []
    },
    pageCount: {
      type: Number,
      default: 1
    },
    charCount: {
      type: Number,
      default: 0
    },
    tokenCount: {
      type: Number,
      default: 0
    },
    structuredSections: [
      {
        heading: { type: String },
        content: { type: String },
        page: { type: Number }
      }
    ],
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

DocumentFileSchema.index({ userId: 1, createdAt: -1 });
DocumentFileSchema.index({ originalName: 'text', summary: 'text', extractedText: 'text' });

module.exports =
  mongoose.models.DocumentFile || mongoose.model('DocumentFile', DocumentFileSchema);
