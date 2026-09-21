const mongoose = require('mongoose');

/**
 * The saved details the page agent fills forms from.
 *
 * Previously this lived only in `chrome.storage.local`, which meant it existed
 * on exactly one machine in one browser profile and had to be re-entered by
 * hand anywhere else. Holding it here instead makes it reachable from any
 * install — the agent asks the engine for it on boot rather than waiting for
 * someone to type an address in again.
 *
 * WHAT DOES AND DOES NOT CHANGE ABOUT THE PRIVACY MODEL
 * ----------------------------------------------------
 * The rule that actually protects the user is not *where* the profile is
 * stored, it is that **the values never reach the model**. That is unchanged:
 * the planner is still told only which keys exist and still writes
 * `{{profile.pincode}}`; the substitution still happens in the page, after the
 * plan comes back. The engine stores the profile and hands it back to the same
 * user's browser, and no prompt ever carries a home address.
 *
 * What does change is that the record now travels over the network and sits in
 * a database, so it is worth being explicit: this is the same posture as every
 * other collection in SETU, keyed to the same client-supplied `x-user-id`.
 *
 * `sensitive` fields are still stored empty by default, and that is not a
 * storage decision — it is the one from `setu-profile.js` and it survives
 * intact: a plausible-looking Aadhaar is indistinguishable from a real one once
 * it is sitting in a government portal's input, and a form submitted with a
 * made-up ID is a worse outcome than a form that was never filled.
 */
const AgentProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },

    /**
     * The field values, as a flat key/value map.
     *
     * Mixed rather than 76 declared paths on purpose. The catalogue lives in
     * `chrome-extension/shared/setu-profile.js` and is the single source of
     * truth for which keys exist, what they are labelled, which are sensitive
     * and how they match a form control. Restating that shape here would create
     * a second catalogue that drifts from the first — and the failure mode of
     * drift is a key the server silently drops, leaving a field blank on a
     * government form with no error anywhere.
     *
     * The client validates against the catalogue before writing; the server
     * stores what it is given.
     */
    values: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },

    /** Mirrors SCHEMA_VERSION in setu-profile.js, so a migration can find old rows. */
    schemaVersion: {
      type: Number,
      default: 1
    },

    /**
     * Marks a row as demo data rather than a real person's details.
     *
     * Load-bearing for the seeder's `--clean`, and worth having in its own right:
     * an operator looking at this collection should be able to tell an invented
     * applicant from someone's actual address without reading the values.
     */
    isDemo: {
      type: Boolean,
      default: false,
      index: true
    },

    label: {
      type: String,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.AgentProfile || mongoose.model('AgentProfile', AgentProfileSchema);
