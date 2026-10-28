// Same rules as normalize() in db/seed.js; stored nameKey/alternateNames/searchName use them.
function normalize(s) {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // Caffè -> Caffe
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

module.exports = normalize;
