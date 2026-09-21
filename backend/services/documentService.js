/**
 * SETU Document & File Upload Processing Service
 * ----------------------------------------------
 * Handles document ingestion (PDF, DOCX, TXT, MD, Images), text extraction,
 * auto-summarization, document Q&A/RAG queries, and mind map generation from user files.
 */

const mammoth = require('mammoth');
const { requestStructuredAI, requestText, describeImage } = require('./aiService');
const { researchMindMap } = require('./researchService');
const mongoService = require('./mongodbService');

let PDFParseClass = null;

async function getPdfParserClass() {
  if (PDFParseClass) return PDFParseClass;

  const imported = await import('pdf-parse');
  PDFParseClass = imported.PDFParse || imported.default?.PDFParse || imported.default;

  if (!PDFParseClass || typeof PDFParseClass !== 'function') {
    throw new Error('pdf-parse did not expose the PDFParse class in this runtime.');
  }

  return PDFParseClass;
}

/**
 * Extract clean text and metadata from uploaded file buffer.
 */
async function extractTextFromFile({ buffer, originalName, mimeType }) {
  const name = originalName || 'uploaded_document';
  const type = (mimeType || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase();

  let extractedText = '';
  let pageCount = 1;
  let structuredSections = [];

  try {
    if (type === 'application/pdf' || ext === 'pdf') {
      const PDFParse = await getPdfParserClass();
      const parser = new PDFParse({ data: buffer });
      const pdfData = await parser.getText();
      extractedText = (pdfData.text || '').trim();
      pageCount = pdfData.pages?.length || 1;
      await parser.destroy?.();
    } else if (
      type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      ext === 'docx'
    ) {
      const result = await mammoth.extractRawText({ buffer });
      extractedText = (result.value || '').trim();
    } else if (type.startsWith('image/')) {
      const base64 = buffer.toString('base64');
      extractedText = await describeImage({
        imageBase64: base64,
        mimeType: type || 'image/jpeg',
        instructions: `You are SETU's document and image analyzer. Transcribe all readable text, identify core diagrams, charts, headings, and bullet points verbatim.`,
        prompt: `Transcribe and explain all text, charts, diagrams, and key points in this image.`
      });
    } else {
      // Plain text, Markdown, CSV, JSON
      extractedText = buffer.toString('utf8').trim();
    }
  } catch (err) {
    console.error(`[Document Service] Text extraction error on ${name}:`, err.message);
    throw new Error(`Could not parse file ${name}: ${err.message}`);
  }

  if (!extractedText || extractedText.length < 5) {
    throw new Error(`The uploaded file "${name}" appears to be empty or contains no readable text.`);
  }

  // Split into rough sections by double newline or headings
  const rawSections = extractedText.split(/\n{2,}/).filter((s) => s.trim().length > 20);
  structuredSections = rawSections.slice(0, 30).map((sec, idx) => ({
    heading: sec.slice(0, 60).split('\n')[0].replace(/^#+\s*/, '') || `Section ${idx + 1}`,
    content: sec.trim(),
    page: Math.min(pageCount, Math.floor((idx / Math.max(1, rawSections.length)) * pageCount) + 1)
  }));

  return {
    originalName: name,
    mimeType: type || 'text/plain',
    size: buffer.length,
    extractedText,
    pageCount,
    charCount: extractedText.length,
    tokenCount: Math.ceil(extractedText.length / 4),
    structuredSections
  };
}

/**
 * Generate an executive overview and key points from document text.
 */
async function summarizeDocument(text, title = 'Document') {
  const truncated = text.slice(0, 16000);

  try {
    const res = await requestStructuredAI({
      name: 'setu_doc_summary',
      schema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: '2-3 sentence overview at Grade 8 level.' },
          keyPoints: {
            type: 'array',
            items: { type: 'string' },
            description: '3-6 standalone key takeaways.'
          }
        },
        required: ['summary', 'keyPoints']
      },
      instructions: `You summarize documents for neurodivergent learners. Provide a calm, crystal-clear 2-3 sentence summary and 3-6 bulleted takeaways.`,
      input: `DOCUMENT TITLE: ${title}\n\nCONTENT:\n${truncated}`
    });

    return {
      summary: res.summary || '',
      keyPoints: res.keyPoints || []
    };
  } catch (_) {
    // Fallback heuristic summary
    const lines = truncated
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 25);
    return {
      summary: lines.slice(0, 2).join(' ') || 'Uploaded document processed.',
      keyPoints: lines.slice(0, 5)
    };
  }
}

/**
 * Process complete file upload: extract text, summarize, and save to DB.
 */
async function processAndSaveFile({ buffer, originalName, mimeType, userId = 'anonymous_user', conversationId = null }) {
  const extracted = await extractTextFromFile({ buffer, originalName, mimeType });
  const { summary, keyPoints } = await summarizeDocument(extracted.extractedText, extracted.originalName);

  const fileRecord = {
    ...extracted,
    userId,
    conversationId,
    summary,
    keyPoints
  };

  const saved = await mongoService.saveDocumentFile(fileRecord);
  return saved || { ...fileRecord, id: `temp_${Date.now()}` };
}

/**
 * Generate a mind map directly from an uploaded document.
 */
async function createMindMapFromDocument({ documentId, userId = 'anonymous_user', onProgress = () => {} }) {
  const doc = await mongoService.getDocumentFileById(documentId);
  if (!doc) {
    const error = new Error(
      'That document is no longer stored on the engine. Upload it again to build a map from it.'
    );
    error.status = 404;
    throw error;
  }

  const text = typeof doc.extractedText === 'string' ? doc.extractedText : '';
  if (!text) {
    const error = new Error(`No readable text was extracted from "${doc.originalName}".`);
    error.status = 422;
    throw error;
  }

  onProgress({ stage: 'researching', message: `Analyzing "${doc.originalName}"…` });

  const map = await researchMindMap({
    // Strip the extension so the map is titled after the subject, not the file.
    topic: doc.originalName.replace(/\.[^/.]+$/, ''),
    context: `This mind map must be constructed from the following source document:\n\nDOCUMENT SUMMARY:\n${doc.summary}\n\nDOCUMENT TEXT EXCERPT:\n${text.slice(0, 16000)}`,
    onProgress
  });

  // Link mind map to document in MongoDB
  const savedMap = await mongoService.saveMindMap({
    ...map,
    userId,
    documentId: doc.id
  });

  return savedMap || map;
}

/**
 * Answer a user query grounded in the content of an uploaded document.
 */
async function queryDocument({ documentId, query, messages = [], userId = 'anonymous_user' }) {
  const doc = await mongoService.getDocumentFileById(documentId);
  if (!doc) {
    const error = new Error('That document is no longer stored on the engine.');
    error.status = 404;
    throw error;
  }

  const text = typeof doc.extractedText === 'string' ? doc.extractedText : '';
  if (!text) {
    const error = new Error(`No readable text was extracted from "${doc.originalName}".`);
    error.status = 422;
    throw error;
  }

  const promptContext = `DOCUMENT TITLE: ${doc.originalName}
PAGE COUNT: ${doc.pageCount}
SUMMARY: ${doc.summary}

DOCUMENT EXCERPT:
${text.slice(0, 20000)}`;

  const answer = await requestText({
    instructions: `You are SETU Document Copilot. Answer the user's question specifically and accurately based on the uploaded document provided below.
Rules:
- Give short, clear paragraphs (under 3 sentences each) for cognitive readability.
- Quote or reference relevant sections/pages where appropriate.
- If the document does not contain the answer, state that clearly instead of speculating.`,
    messages: [
      { role: 'user', content: `CONTEXT:\n${promptContext}\n\nUSER QUESTION: "${query}"` }
    ],
    temperature: 0.3
  });

  return {
    answer,
    documentId: doc.id,
    documentName: doc.originalName,
    sources: [
      { title: doc.originalName, url: `#doc-${doc.id}` }
    ]
  };
}

module.exports = {
  extractTextFromFile,
  summarizeDocument,
  processAndSaveFile,
  createMindMapFromDocument,
  queryDocument
};
