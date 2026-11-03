// The contract's Submission object. before keeps only the payload's fields: the searchName, isEstimate,
// source and lastVerified stored there for an exact revert are never returned.
function toSubmissionJSON(s) {
  return {
    id: String(s._id),
    kind: s.kind,
    targetId: s.targetId && String(s.targetId),
    payload: s.payload,
    before: s.before && Object.fromEntries(Object.keys(s.payload).map((k) => [k, s.before[k]])),
    resultId: s.resultId && String(s.resultId),
    status: s.status,
    flags: s.flags,
    reviewNote: s.reviewNote,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}

module.exports = toSubmissionJSON;
