// Mirrors docs/api-contract.md (and web/src/types/api.ts). Change the contract first, then this file.

enum Sex { male, female }

enum ActivityLevel {
  sedentary('sedentary'),
  light('light'),
  moderate('moderate'),
  active('active'),
  veryActive('very_active');

  const ActivityLevel(this.json);
  final String json;
}

enum Goal { lose, maintain, gain }

enum Units { imperial, metric }

enum RecommendationMode { protein, carb }

enum Category { entree, side, breakfast, salad, drink, dessert }

enum PhotoConfidence { high, medium, low }

enum UserRole { user, admin }

/// What the tracker shows totals for (preferences.trackedNutrients).
enum Nutrient { calories, protein, carbs, fat }

enum MealLogStatus { planned, eaten }

enum MealLogSource { search, plan, photo, custom }

enum SubmissionKind {
  editItem('edit_item'),
  newItem('new_item'),
  newChain('new_chain');

  const SubmissionKind(this.json);
  final String json;
}

enum SubmissionStatus {
  autoApplied('auto_applied'),
  pending('pending'),
  approved('approved'),
  rejected('rejected'),
  reverted('reverted');

  const SubmissionStatus(this.json);
  final String json;
}

const searchRadii = [5, 10, 15, 20];

T _enum<T extends Enum>(List<T> values, Object? raw) => values.byName(raw as String);

ActivityLevel _activity(Object? raw) => ActivityLevel.values.firstWhere((a) => a.json == raw);

double? _numOrNull(Object? v) => v == null ? null : (v as num).toDouble();

// Height/weight are always imperial in the API; convert for display when units == metric.
class Profile {
  const Profile({
    required this.heightIn,
    required this.weightLb,
    required this.birthDate,
    required this.sex,
    required this.activityLevel,
    required this.goal,
  });

  final double heightIn;
  final double weightLb;
  final String birthDate; // YYYY-MM-DD
  final Sex sex;
  final ActivityLevel activityLevel;
  final Goal goal;

  factory Profile.fromJson(Map<String, dynamic> j) => Profile(
    heightIn: (j['heightIn'] as num).toDouble(),
    weightLb: (j['weightLb'] as num).toDouble(),
    birthDate: j['birthDate'] as String,
    sex: _enum(Sex.values, j['sex']),
    activityLevel: _activity(j['activityLevel']),
    goal: _enum(Goal.values, j['goal']),
  );

  Map<String, dynamic> toJson() => {
    'heightIn': heightIn,
    'weightLb': weightLb,
    'birthDate': birthDate,
    'sex': sex.name,
    'activityLevel': activityLevel.json,
    'goal': goal.name,
  };
}

class Preferences {
  const Preferences({
    required this.units,
    required this.searchRadius,
    required this.recommendationMode,
    required this.mealCalorieLimit,
    required this.trackedNutrients,
  });

  final Units units;
  final int searchRadius; // one of searchRadii (miles)
  final RecommendationMode recommendationMode;
  final double? mealCalorieLimit; // null = target / 3
  final List<Nutrient> trackedNutrients; // 1-4 different ones, in the user's order

  factory Preferences.fromJson(Map<String, dynamic> j) => Preferences(
    units: _enum(Units.values, j['units']),
    searchRadius: (j['searchRadius'] as num).toInt(),
    recommendationMode: _enum(RecommendationMode.values, j['recommendationMode']),
    mealCalorieLimit: _numOrNull(j['mealCalorieLimit']),
    trackedNutrients: [for (final n in j['trackedNutrients'] as List) _enum(Nutrient.values, n)],
  );
}

class User {
  const User({
    required this.id,
    required this.firstName,
    required this.lastName,
    required this.username,
    required this.email,
    required this.isVerified,
    required this.role,
    required this.profile,
    required this.preferences,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String username;
  final String email;
  final bool isVerified;
  final UserRole role; // only the server's make-admin script changes it
  final Profile? profile; // null until the user fills it in
  final Preferences preferences;

  factory User.fromJson(Map<String, dynamic> j) => User(
    id: j['id'] as String,
    firstName: j['firstName'] as String,
    lastName: j['lastName'] as String,
    username: j['username'] as String,
    email: j['email'] as String,
    isVerified: j['isVerified'] as bool,
    role: _enum(UserRole.values, j['role']),
    profile: j['profile'] == null ? null : Profile.fromJson(j['profile'] as Map<String, dynamic>),
    preferences: Preferences.fromJson(j['preferences'] as Map<String, dynamic>),
  );
}

class Calories {
  const Calories({
    required this.age,
    required this.maintenance,
    required this.target,
    required this.perMeal,
    required this.macros,
  });

  final int age;
  final int maintenance;
  final int target;
  final int perMeal;
  final MacroTargets macros;

  factory Calories.fromJson(Map<String, dynamic> j) => Calories(
    age: (j['age'] as num).toInt(),
    maintenance: (j['maintenance'] as num).toInt(),
    target: (j['target'] as num).toInt(),
    perMeal: (j['perMeal'] as num).toInt(),
    macros: MacroTargets.fromJson(j['macros'] as Map<String, dynamic>),
  );
}

// Daily targets in grams, split from target by goal. Weekly goals are daily * 7.
class MacroTargets {
  const MacroTargets({required this.proteinG, required this.carbsG, required this.fatG});

  final int proteinG;
  final int carbsG;
  final int fatG;

  factory MacroTargets.fromJson(Map<String, dynamic> j) => MacroTargets(
    proteinG: (j['proteinG'] as num).toInt(),
    carbsG: (j['carbsG'] as num).toInt(),
    fatG: (j['fatG'] as num).toInt(),
  );
}

class MenuItem {
  const MenuItem({
    required this.id,
    required this.chainId,
    required this.chainName,
    required this.name,
    required this.category,
    required this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.isEstimate,
  });

  final String id;
  final String chainId;
  final String chainName;
  final String name;
  final Category category;
  final double calories;
  final double? proteinG; // null = unknown, never treat as 0
  final double? carbsG;
  final double? fatG;
  final bool isEstimate;

  factory MenuItem.fromJson(Map<String, dynamic> j) => MenuItem(
    id: j['id'] as String,
    chainId: j['chainId'] as String,
    chainName: j['chainName'] as String,
    name: j['name'] as String,
    category: _enum(Category.values, j['category']),
    calories: (j['calories'] as num).toDouble(),
    proteinG: _numOrNull(j['proteinG']),
    carbsG: _numOrNull(j['carbsG']),
    fatG: _numOrNull(j['fatG']),
    isEstimate: j['isEstimate'] as bool,
  );
}

class RecommendedItem {
  const RecommendedItem({required this.item, required this.score});

  final MenuItem item;
  final double score; // grams of the ranking macro per 100 kcal, 1 decimal

  factory RecommendedItem.fromJson(Map<String, dynamic> j) =>
      RecommendedItem(item: MenuItem.fromJson(j), score: (j['score'] as num).toDouble());
}

// Sums of value * servings; calories is an integer, macros have 1 decimal.
class Totals {
  const Totals({
    required this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.incomplete,
  });

  final int calories;
  final double proteinG;
  final double carbsG;
  final double fatG;
  final bool incomplete; // a macro was unknown, so show "at least"

  factory Totals.fromJson(Map<String, dynamic> j) => Totals(
    calories: (j['calories'] as num).toInt(),
    proteinG: (j['proteinG'] as num).toDouble(),
    carbsG: (j['carbsG'] as num).toDouble(),
    fatG: (j['fatG'] as num).toDouble(),
    incomplete: j['incomplete'] as bool,
  );
}

class MealPlanDay {
  const MealPlanDay({
    required this.date,
    required this.remainingCalories,
    required this.mealCalorieLimit,
    required this.items,
    required this.totals,
  });

  final String date; // YYYY-MM-DD
  final int remainingCalories;
  final int mealCalorieLimit;
  final List<RecommendedItem> items; // empty when under 300 kcal per slot is left
  final Totals totals;

  factory MealPlanDay.fromJson(Map<String, dynamic> j) => MealPlanDay(
    date: j['date'] as String,
    remainingCalories: (j['remainingCalories'] as num).toInt(),
    mealCalorieLimit: (j['mealCalorieLimit'] as num).toInt(),
    items: [for (final i in j['items'] as List) RecommendedItem.fromJson(i as Map<String, dynamic>)],
    totals: Totals.fromJson(j['totals'] as Map<String, dynamic>),
  );
}

// A snapshot of one food on the user's local day. Macros are for one serving; totals multiply by servings.
class MealLog {
  const MealLog({
    required this.id,
    required this.date,
    required this.status,
    required this.menuItemId,
    required this.name,
    required this.chainName,
    required this.servings,
    required this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.source,
    required this.createdAt,
  });

  final String id;
  final String date; // YYYY-MM-DD, the user's local day
  final MealLogStatus status;
  final String? menuItemId; // null = custom food; may name an item that no longer exists
  final String name;
  final String? chainName;
  final double servings; // 0.25-10
  final double calories;
  final double? proteinG; // null = unknown, never treat as 0
  final double? carbsG;
  final double? fatG;
  final MealLogSource source;
  final String createdAt;

  factory MealLog.fromJson(Map<String, dynamic> j) => MealLog(
    id: j['id'] as String,
    date: j['date'] as String,
    status: _enum(MealLogStatus.values, j['status']),
    menuItemId: j['menuItemId'] as String?,
    name: j['name'] as String,
    chainName: j['chainName'] as String?,
    servings: (j['servings'] as num).toDouble(),
    calories: (j['calories'] as num).toDouble(),
    proteinG: _numOrNull(j['proteinG']),
    carbsG: _numOrNull(j['carbsG']),
    fatG: _numOrNull(j['fatG']),
    source: _enum(MealLogSource.values, j['source']),
    createdAt: j['createdAt'] as String,
  );
}

/// One food for Api.addMealLogs. Left null, [status] and [servings] are the server's defaults (eaten, 1).
class MealLogEntry {
  /// A menu item: the server copies its name, chain and macros (sending them too is a 400).
  const MealLogEntry.menuItem({
    required this.date,
    required String this.menuItemId,
    required this.source,
    this.status,
    this.servings,
  }) : name = null,
       chainName = null,
       calories = null,
       proteinG = null,
       carbsG = null,
       fatG = null;

  /// Anything else, including a photo item the user edited. Pass null for an unknown macro, never 0.
  const MealLogEntry.custom({
    required this.date,
    required this.source,
    required String this.name,
    required double this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    this.chainName,
    this.status,
    this.servings,
  }) : menuItemId = null;

  final String date; // YYYY-MM-DD, the user's local day
  final String? menuItemId;
  final MealLogSource source;
  final MealLogStatus? status;
  final double? servings; // 0.25-10
  final String? name;
  final String? chainName;
  final double? calories;
  final double? proteinG;
  final double? carbsG;
  final double? fatG;

  Map<String, dynamic> toJson() => {
    'date': date,
    'status': ?status?.name,
    'servings': ?servings,
    'source': source.name,
    if (menuItemId != null)
      'menuItemId': menuItemId
    else ...{
      'name': name,
      'chainName': chainName,
      'calories': calories,
      // Sent even when null: a custom entry has to say a macro is unknown.
      'proteinG': proteinG,
      'carbsG': carbsG,
      'fatG': fatG,
    },
  };
}

class MealLogDay {
  const MealLogDay({required this.date, required this.eaten, required this.planned});

  final String date; // YYYY-MM-DD; every day in the range, empty ones too
  final Totals eaten;
  final Totals planned;

  factory MealLogDay.fromJson(Map<String, dynamic> j) => MealLogDay(
    date: j['date'] as String,
    eaten: Totals.fromJson(j['eaten'] as Map<String, dynamic>),
    planned: Totals.fromJson(j['planned'] as Map<String, dynamic>),
  );
}

class Favorite {
  const Favorite({required this.id, required this.placeId, required this.label, required this.createdAt});

  final String id;
  final String placeId;
  final String? label;
  final String createdAt;

  factory Favorite.fromJson(Map<String, dynamic> j) => Favorite(
    id: j['id'] as String,
    placeId: j['placeId'] as String,
    label: j['label'] as String?,
    createdAt: j['createdAt'] as String,
  );
}

class NearbyRestaurant {
  const NearbyRestaurant({
    required this.placeId,
    required this.name,
    required this.address,
    required this.distanceMiles,
    required this.chainId,
  });

  final String placeId;
  final String name;
  final String? address; // the Overpass client returns null when OSM has no address
  final double distanceMiles;
  final String? chainId; // null = no nutrition data

  factory NearbyRestaurant.fromJson(Map<String, dynamic> j) => NearbyRestaurant(
    placeId: j['placeId'] as String,
    name: j['name'] as String,
    address: j['address'] as String?,
    distanceMiles: (j['distanceMiles'] as num).toDouble(),
    chainId: j['chainId'] as String?,
  );
}

// A draft entry from a meal photo; macros are per serving. Nothing is logged until the user confirms.
class PhotoItem {
  const PhotoItem({
    required this.menuItemId,
    required this.name,
    required this.chainName,
    required this.servings,
    required this.calories,
    required this.proteinG,
    required this.carbsG,
    required this.fatG,
    required this.confidence,
  });

  final String? menuItemId; // null = not on our menu
  final String name;
  final String? chainName;
  final double servings;
  final double calories;
  final double? proteinG; // null = unknown, never treat as 0
  final double? carbsG;
  final double? fatG;
  final PhotoConfidence confidence;

  factory PhotoItem.fromJson(Map<String, dynamic> j) => PhotoItem(
    menuItemId: j['menuItemId'] as String?,
    name: j['name'] as String,
    chainName: j['chainName'] as String?,
    servings: (j['servings'] as num).toDouble(),
    calories: (j['calories'] as num).toDouble(),
    proteinG: _numOrNull(j['proteinG']),
    carbsG: _numOrNull(j['carbsG']),
    fatG: _numOrNull(j['fatG']),
    confidence: _enum(PhotoConfidence.values, j['confidence']),
  );
}

// A community correction, new item or new restaurant (docs/api-contract.md, Submission). payload depends on kind:
// edit_item a subset of {name, category, calories, proteinG, carbsG, fatG}; new_item all of them; new_chain
// {name, nutritionSourceUrl, alternateNames?}. flags are left out: users see the status, not moderation reasons.
class Submission {
  const Submission({
    required this.id,
    required this.kind,
    required this.targetId,
    required this.payload,
    required this.before,
    required this.resultId,
    required this.status,
    required this.reviewNote,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final SubmissionKind kind;
  final String? targetId; // menu item (edit_item), chain (new_item), null (new_chain)
  final Map<String, dynamic> payload;
  final Map<String, dynamic>? before; // the payload's fields before an edit was applied
  final String? resultId; // the item or chain a new_item / new_chain created
  final SubmissionStatus status;
  final String? reviewNote;
  final String createdAt;
  final String updatedAt;

  factory Submission.fromJson(Map<String, dynamic> j) => Submission(
    id: j['id'] as String,
    kind: SubmissionKind.values.firstWhere((k) => k.json == j['kind']),
    targetId: j['targetId'] as String?,
    payload: j['payload'] as Map<String, dynamic>,
    before: j['before'] as Map<String, dynamic>?,
    resultId: j['resultId'] as String?,
    status: SubmissionStatus.values.firstWhere((s) => s.json == j['status']),
    reviewNote: j['reviewNote'] as String?,
    createdAt: j['createdAt'] as String,
    updatedAt: j['updatedAt'] as String,
  );
}

class LoginResponse {
  const LoginResponse({required this.token, required this.user});

  final String token;
  final User user;
}

class SearchMenuItemsResponse {
  const SearchMenuItemsResponse({required this.items, required this.total, required this.limit, required this.skip});

  final List<MenuItem> items;
  final int total;
  final int limit;
  final int skip;
}

class RecommendationsResponse {
  const RecommendationsResponse({required this.mode, required this.mealCalorieLimit, required this.items});

  final RecommendationMode mode;
  final double mealCalorieLimit;
  final List<RecommendedItem> items;
}

class MealLogsResponse {
  const MealLogsResponse({required this.entries, required this.days});

  final List<MealLog> entries; // by date, then time logged
  final List<MealLogDay> days;
}

class MealPlanResponse {
  const MealPlanResponse({required this.mode, required this.days});

  final RecommendationMode mode;
  final List<MealPlanDay> days;
}

class MySubmissionsResponse {
  const MySubmissionsResponse({required this.submissions, required this.total});

  final List<Submission> submissions;
  final int total;
}
