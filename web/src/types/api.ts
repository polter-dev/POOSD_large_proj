// Mirrors docs/api-contract.md. Change the contract first, then this file.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Units = 'imperial' | 'metric';
export type SearchRadius = 5 | 10 | 15 | 20;
export type RecommendationMode = 'protein' | 'carb';
export type Category = 'entree' | 'side' | 'breakfast' | 'salad' | 'drink' | 'dessert';
export type Role = 'user' | 'admin';
export type Nutrient = 'calories' | 'protein' | 'carbs' | 'fat';

// Height/weight are always imperial in the API; convert for display when units === 'metric'.
export interface Profile {
  heightIn: number;
  weightLb: number;
  birthDate: string; // YYYY-MM-DD
  sex: Sex;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface Preferences {
  units: Units;
  searchRadius: SearchRadius;
  recommendationMode: RecommendationMode;
  mealCalorieLimit: number | null;
  trackedNutrients: Nutrient[]; // 1-4 different ones, in the user's order; default ['calories', 'protein']
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  isVerified: boolean;
  role: Role; // only scripts/make-admin.js changes it
  profile: Profile | null;
  preferences: Preferences;
}

export interface Calories {
  age: number;
  maintenance: number;
  target: number;
  perMeal: number;
  macros: MacroTargets;
}

// Daily targets in grams, split from target by goal. Weekly goals are daily * 7.
export interface MacroTargets {
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface MenuItem {
  id: string;
  chainId: string;
  chainName: string;
  name: string;
  category: Category;
  calories: number;
  proteinG: number | null; // null = unknown, never treat as 0
  carbsG: number | null;
  fatG: number | null;
  isEstimate: boolean;
}

export interface RecommendedItem extends MenuItem {
  score: number;
}

// Sums of value * servings; calories is an integer, macros have 1 decimal.
export interface Totals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  incomplete: boolean; // a macro was unknown, so show "at least"
}

export interface MealPlanDay {
  date: string; // YYYY-MM-DD
  remainingCalories: number;
  mealCalorieLimit: number;
  items: RecommendedItem[]; // empty when under 300 kcal per slot is left
  totals: Totals;
}

export type MealLogStatus = 'planned' | 'eaten';
export type MealLogSource = 'search' | 'plan' | 'photo' | 'custom';

// A snapshot of one food on the user's local day. Macros are for one serving; totals multiply by servings.
export interface MealLog {
  id: string;
  date: string; // YYYY-MM-DD, the user's local day
  status: MealLogStatus;
  menuItemId: string | null; // null = custom food; may name an item that no longer exists
  name: string;
  chainName: string | null;
  servings: number; // 0.25-10
  calories: number;
  proteinG: number | null; // null = unknown, never treat as 0
  carbsG: number | null;
  fatG: number | null;
  source: MealLogSource;
  createdAt: string;
}

export interface MealLogDay {
  date: string; // YYYY-MM-DD; every day in the range, empty ones too
  eaten: Totals;
  planned: Totals;
}

export interface Favorite {
  id: string;
  placeId: string;
  label: string | null;
  createdAt: string;
}

export type SubmissionKind = 'edit_item' | 'new_item' | 'new_chain';
export type SubmissionStatus = 'auto_applied' | 'pending' | 'approved' | 'rejected' | 'reverted';
export type SubmissionFlag =
  | 'new_chain' | 'verified_item' | 'renamed' | 'large_change' | 'macros_mismatch' | 'new_account' | 'untrusted_user' | 'url_in_name';

export type MenuItemFields = Pick<MenuItem, 'name' | 'category' | 'calories' | 'proteinG' | 'carbsG' | 'fatG'>;

export interface NewChainPayload {
  name: string;
  nutritionSourceUrl: string; // https://
  alternateNames?: string[];
}

export interface Submission {
  id: string;
  kind: SubmissionKind;
  targetId: string | null; // menu item (edit_item), chain (new_item), null (new_chain)
  payload: Partial<MenuItemFields> | NewChainPayload; // edit_item: a subset; new_item: all fields
  before: Partial<MenuItemFields> | null; // the payload's fields before an edit was applied
  resultId: string | null; // the item or chain a new_item / new_chain created
  status: SubmissionStatus;
  flags: SubmissionFlag[];
  reviewNote: string | null;
  createdAt: string;
  updatedAt: string;
}

// POST /submissions and GET /submissions/mine leave out flags: users see the status and review note, not moderation reasons.
export type MySubmission = Omit<Submission, 'flags'>;

export interface UserRef {
  id: string;
  username: string | null; // null = account deleted
}

// Admin listings and the admin PATCH response.
export interface AdminSubmission extends Submission {
  user: UserRef;
  reviewedBy: UserRef | null;
}

export interface NearbyRestaurant {
  placeId: string;
  name: string;
  address: string | null;
  distanceMiles: number;
  chainId: string | null; // null = no nutrition data
}

// Request bodies

export interface RegisterBody {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
}

export interface LoginBody {
  login: string; // email or username
  password: string;
}

export interface EmailBody {
  email: string;
}

export type ResendVerificationBody = EmailBody | { login: string };

export interface ResetPasswordBody {
  token: string;
  password: string;
}

export type UpdateProfileBody = Profile;

export interface UpdateGoalBody {
  goal: Goal;
}

export type UpdatePreferencesBody = Partial<Preferences>;

export interface RecommendationsBody {
  chainIds?: string[];
  mode?: RecommendationMode;
  mealCalorieLimit?: number;
  limit?: number;
  includeEstimates?: boolean;
}

// One food for POST /meal-logs. status defaults to 'eaten', servings to 1.
interface MealLogEntryBase {
  date: string; // YYYY-MM-DD, the user's local day
  status?: MealLogStatus;
  servings?: number; // 0.25-10
  source: MealLogSource;
}

// A menu item: the server copies its name, chain and macros, so sending them too is a 400.
export interface MenuItemMealLogEntry extends MealLogEntryBase {
  menuItemId: string;
}

// Anything else, including a photo item the user edited. Macros are required; null = unknown.
export interface CustomMealLogEntry extends MealLogEntryBase {
  menuItemId?: null;
  name: string;
  chainName?: string | null;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
}

export type MealLogEntry = MenuItemMealLogEntry | CustomMealLogEntry;

// 1-50 entries, saved all or none.
export interface AddMealLogsBody {
  entries: MealLogEntry[];
}

// At least one field.
export interface UpdateMealLogBody {
  status?: MealLogStatus;
  servings?: number;
}

export interface MealPlanQuery {
  start: string; // YYYY-MM-DD, the user's local day
  days?: 1 | 7;
  chainIds?: string[];
  mode?: RecommendationMode;
}

export interface NearbyBody {
  lat: number;
  lng: number;
  radiusMiles?: SearchRadius;
}

export interface AddFavoriteBody {
  placeId: string;
  label?: string | null;
}

// targetId: the menu item (edit_item), the chain (new_item), or null (new_chain).
export type CreateSubmissionBody =
  | { kind: 'edit_item'; targetId: string; payload: Partial<MenuItemFields> }
  | { kind: 'new_item'; targetId: string; payload: MenuItemFields }
  | { kind: 'new_chain'; targetId: null; payload: NewChainPayload };

// pending -> approved | rejected; auto_applied or approved -> reverted. Anything else is 409.
export interface ReviewSubmissionBody {
  status: 'approved' | 'rejected' | 'reverted';
  reviewNote?: string | null;
}

export type PhotoMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

// imageBase64: plain base64 (no data: prefix), at most 3,000,000 chars.
export interface AnalyzePhotoBody {
  imageBase64: string;
  mediaType: PhotoMediaType;
}

// A draft entry from a meal photo; macros are per serving. menuItemId null = not on our menu.
export interface PhotoItem {
  menuItemId: string | null;
  name: string;
  chainName: string | null;
  servings: number;
  calories: number;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  confidence: 'high' | 'medium' | 'low';
}

// Response wrappers

export interface MessageResponse {
  message: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface SearchMenuItemsResponse {
  items: MenuItem[];
  total: number;
  limit: number;
  skip: number;
}

export interface RecommendationsResponse {
  mode: RecommendationMode;
  mealCalorieLimit: number;
  items: RecommendedItem[];
}

export interface MealLogsResponse {
  entries: MealLog[]; // by date, then time logged
  days: MealLogDay[];
}

export interface AddMealLogsResponse {
  entries: MealLog[]; // in the order sent
}

export interface MealPlanResponse {
  mode: RecommendationMode;
  days: MealPlanDay[];
}

export interface NearbyResponse {
  restaurants: NearbyRestaurant[];
}

export interface FavoritesResponse {
  favorites: Favorite[];
}

export interface MySubmissionsResponse {
  submissions: MySubmission[];
  total: number;
}

export interface AdminSubmissionsResponse {
  submissions: AdminSubmission[];
  total: number;
}

export interface AnalyzePhotoResponse {
  items: PhotoItem[];
}
