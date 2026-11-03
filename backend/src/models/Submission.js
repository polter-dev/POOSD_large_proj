const mongoose = require("mongoose");

const { ObjectId, Mixed } = mongoose.Schema.Types;

// Mirrors the submissions $jsonSchema in db/schema.js (M6, #107). Every field is required there, so the
// nullable ones default to null. payload's shape depends on kind and is checked by the API, not here.
const submissionSchema = new mongoose.Schema(
  {
    userId: ObjectId,
    kind: { type: String, enum: ["edit_item", "new_item", "new_chain"] },
    targetId: { type: ObjectId, default: null }, // null iff kind is new_chain
    payload: Mixed,
    before: { type: Mixed, default: null },
    resultId: { type: ObjectId, default: null },
    status: { type: String, enum: ["auto_applied", "pending", "approved", "rejected", "reverted"] },
    flags: [{ type: String, enum: ["new_chain", "verified_item", "renamed", "large_change", "macros_mismatch", "new_account", "untrusted_user", "url_in_name"] }],
    reviewedBy: { type: ObjectId, default: null },
    reviewNote: { type: String, default: null },
  },
  { collection: "submissions", versionKey: false, timestamps: true }
);

module.exports = mongoose.model("Submission", submissionSchema);
