const mongoose = require('mongoose');

/**
 * One Reading Check session, or one standalone reading probe.
 *
 * WHAT THIS RECORD IS
 * -------------------
 * The only thing SETU stores that is a measurement of a person rather than a
 * preference of theirs. Everything else in the database — maps, settings,
 * progress — is a record of what the app did. This is a record of how a child
 * read, and it is treated differently for that reason.
 *
 * It is also the single most valuable record in the product. Points and streaks
 * go up whether or not SETU helps anyone; `wcpm` over time does not. A parent
 * or a teacher watching words-per-minute rise across eight weeks is looking at
 * evidence, and it is the only chart this product can honestly draw.
 *
 * WHAT IT DELIBERATELY DOES NOT CONTAIN
 * -------------------------------------
 * No probability, no percentage, no score out of anything, and never the word
 * dyslexia. `band` holds one of three plain-language values. Under CDSCO's
 * function-based guidance, software acquires a medical purpose — and becomes
 * regulated Medical Device Software requiring a licence, bias and drift
 * documentation, and Indian-population validation — the moment it claims
 * diagnosis. An educational screener reporting "worth a professional
 * assessment" stays on the right side of that line. A field called
 * `dyslexiaProbability` would cross it, which is why the shape of this schema
 * is a compliance decision and not only a data one.
 *
 * `provisionalNorms` is stored on every document rather than assumed. The band
 * boundaries come from published English oral-reading-fluency percentiles and
 * there is no validated WCPM norm table for Devanagari, Kannada or Tamil — so
 * a result rendered later, by code written by someone else, still carries the
 * caveat with it instead of depending on that person remembering.
 */
const ReadingCheckSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    userId: {
      type: String,
      required: true,
      index: true
    },

    /**
     * Which task this record holds.
     *
     * `probe` is the standalone 60-second oral reading measure — the outcome
     * instrument, run at onboarding and weekly after. `session` is a full
     * Reading Check made of several tasks, which carries its own `tasks` array
     * and a combined band. The rest are individual tasks within a session,
     * stored separately so a partially-completed battery is not lost.
     */
    type: {
      type: String,
      required: true,
      enum: ['probe', 'session', 'ran', 'oral-reading', 'deletion', 'nonword', 'letter-sound'],
      index: true
    },

    language: { type: String, default: 'en-IN' },
    script: { type: String, default: 'Latn' },

    /**
     * School grade, which selects the band boundaries.
     *
     * Nullable because an adult using the reading probe as an outcome measure
     * has no grade, and forcing one would silently band them against a child's
     * norms.
     */
    grade: { type: Number, default: null, min: 1, max: 12 },

    /** Optional label so a teacher can tell rows apart on a class roster. */
    learnerLabel: { type: String, default: '' },

    /** Which passage or grid was used, so a retest can repeat or avoid it. */
    stimulusId: { type: String, default: '' },

    /**
     * The measurements. Mixed rather than a rigid sub-schema because the task
     * types genuinely return different shapes — a RAN trial has itemsPerSecond
     * and an oral read has wcpm — and flattening them into one union would mean
     * most fields are null on most documents.
     */
    metrics: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    /**
     * Denormalised out of `metrics` purely so the progress chart and the class
     * roster can query and sort without loading every document. Null for tasks
     * that do not produce a rate.
     */
    wcpm: { type: Number, default: null, index: true },
    accuracy: { type: Number, default: null },

    band: {
      type: String,
      default: null,
      enum: ['no-concerns', 'worth-watching', 'worth-assessment', null],
      index: true
    },

    /** Per-task bands, when this is a `session` that combined several. */
    tasks: {
      type: [
        {
          _id: false,
          type: { type: String },
          band: { type: String },
          metrics: { type: mongoose.Schema.Types.Mixed }
        }
      ],
      default: []
    },

    /**
     * Always true today. Stored anyway so that if a validated norm table is
     * ever produced — the DALI comparison in the audit's validation plan — old
     * records stay correctly labelled as provisional rather than being
     * retroactively presented as validated.
     */
    provisionalNorms: { type: Boolean, default: true },

    /**
     * The child's own audio is NOT stored. Only the transcript reaches this
     * document, and only when `keepTranscript` is set — which the client sets
     * from an explicit choice, because a transcript of a child reading is
     * recoverable content about a minor and the metrics do not need it.
     *
     * Scoring happens server-side before this is written, so dropping the
     * transcript costs nothing except the ability to re-score later.
     */
    transcript: { type: String, default: '' },
    keepTranscript: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

/** The progress chart's query: this user's probes, oldest first. */
ReadingCheckSchema.index({ userId: 1, type: 1, createdAt: 1 });

module.exports =
  mongoose.models.ReadingCheck || mongoose.model('ReadingCheck', ReadingCheckSchema);
