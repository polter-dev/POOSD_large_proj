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
  });

  final Units units;
  final int searchRadius; // one of searchRadii (miles)
  final RecommendationMode recommendationMode;
  final double? mealCalorieLimit; // null = target / 3

  factory Preferences.fromJson(Map<String, dynamic> j) => Preferences(
    units: _enum(Units.values, j['units']),
    searchRadius: (j['searchRadius'] as num).toInt(),
    recommendationMode: _enum(RecommendationMode.values, j['recommendationMode']),
    mealCalorieLimit: _numOrNull(j['mealCalorieLimit']),
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
    required this.profile,
    required this.preferences,
  });

  final String id;
  final String firstName;
  final String lastName;
  final String username;
  final String email;
  final bool isVerified;
  final Profile? profile; // null until the user fills it in
  final Preferences preferences;

  factory User.fromJson(Map<String, dynamic> j) => User(
    id: j['id'] as String,
    firstName: j['firstName'] as String,
    lastName: j['lastName'] as String,
    username: j['username'] as String,
    email: j['email'] as String,
    isVerified: j['isVerified'] as bool,
    profile: j['profile'] == null ? null : Profile.fromJson(j['profile'] as Map<String, dynamic>),
    preferences: Preferences.fromJson(j['preferences'] as Map<String, dynamic>),
  );
}

class Calories {
  const Calories({required this.age, required this.maintenance, required this.target, required this.perMeal});

  final int age;
  final int maintenance;
  final int target;
  final int perMeal;

  factory Calories.fromJson(Map<String, dynamic> j) => Calories(
    age: (j['age'] as num).toInt(),
    maintenance: (j['maintenance'] as num).toInt(),
    target: (j['target'] as num).toInt(),
    perMeal: (j['perMeal'] as num).toInt(),
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
