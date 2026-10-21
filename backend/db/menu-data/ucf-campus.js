// menu-data/ucf-campus.js
//
// Fast-food restaurants on the UCF campus and their menu items, typed in by
// hand from each chain's public nutrition page. seed.js loads this file.
//
// HOW TO ADD ITEMS
//   - Copy calories / protein / carbs / fat from the restaurant's official
//     nutrition page (menuSourceUrl), then set isEstimate: false and
//     source: "official".
//   - Every item below starts as isEstimate: true. These are rough sample
//     values for the demo and have NOT been checked against the official
//     pages yet. Check each one and update it before the final presentation.
//   - Confirm each restaurant is still open at the campusLocation listed.

const UCF_CAMPUS_MENUS = [
  {
    name: "Chick-fil-A",
    campusLocation: "Student Union",
    menuSourceUrl: "https://www.chick-fil-a.com/nutrition-allergens",
    items: [
      { name: "Chick-fil-A Chicken Sandwich", category: "entree", calories: 420, proteinG: 29, carbsG: 41, fatG: 18 },
      { name: "Grilled Chicken Sandwich", category: "entree", calories: 390, proteinG: 28, carbsG: 44, fatG: 12 },
      { name: "Grilled Nuggets (8 ct)", category: "entree", calories: 130, proteinG: 25, carbsG: 1, fatG: 3 },
      { name: "Chick-fil-A Nuggets (8 ct)", category: "entree", calories: 250, proteinG: 27, carbsG: 11, fatG: 11 },
      { name: "Waffle Potato Fries (Medium)", category: "side", calories: 420, proteinG: 5, carbsG: 45, fatG: 24 },
      { name: "Fruit Cup (Medium)", category: "side", calories: 60, proteinG: 1, carbsG: 15, fatG: 0 },
    ],
  },
  {
    name: "Panda Express",
    campusLocation: "Student Union",
    menuSourceUrl: "https://www.pandaexpress.com/nutritioninformation",
    items: [
      { name: "Orange Chicken", category: "entree", calories: 490, proteinG: 25, carbsG: 51, fatG: 23 },
      { name: "Grilled Teriyaki Chicken", category: "entree", calories: 300, proteinG: 36, carbsG: 8, fatG: 13 },
      { name: "Broccoli Beef", category: "entree", calories: 150, proteinG: 9, carbsG: 13, fatG: 7 },
      { name: "Kung Pao Chicken", category: "entree", calories: 290, proteinG: 16, carbsG: 14, fatG: 19 },
      { name: "Steamed White Rice", category: "side", calories: 380, proteinG: 7, carbsG: 87, fatG: 0 },
      { name: "Super Greens", category: "side", calories: 90, proteinG: 6, carbsG: 10, fatG: 3 },
    ],
  },
  {
    name: "Subway",
    campusLocation: "Student Union",
    menuSourceUrl: "https://www.subway.com/en-us/menunutrition/nutrition",
    items: [
      { name: "6-inch Oven Roasted Turkey", category: "entree", calories: 250, proteinG: 18, carbsG: 38, fatG: 3 },
      { name: "6-inch Rotisserie-Style Chicken", category: "entree", calories: 300, proteinG: 25, carbsG: 38, fatG: 6 },
      { name: "6-inch Meatball Marinara", category: "entree", calories: 460, proteinG: 22, carbsG: 54, fatG: 18 },
      { name: "Rotisserie-Style Chicken Salad", category: "salad", calories: 130, proteinG: 18, carbsG: 9, fatG: 3 },
    ],
  },
];
