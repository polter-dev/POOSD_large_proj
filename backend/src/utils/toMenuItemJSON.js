// The contract's MenuItem object. searchName, source and lastVerified are never returned.
function toMenuItemJSON(i) {
  return {
    id: String(i._id),
    chainId: String(i.chainId),
    chainName: i.chainName,
    name: i.name,
    category: i.category,
    calories: i.calories,
    proteinG: i.proteinG,
    carbsG: i.carbsG,
    fatG: i.fatG,
    isEstimate: i.isEstimate,
  };
}

// The fields toMenuItemJSON reads, for find() projections.
toMenuItemJSON.fields = { chainId: 1, chainName: 1, name: 1, category: 1, calories: 1, proteinG: 1, carbsG: 1, fatG: 1, isEstimate: 1 };

module.exports = toMenuItemJSON;
