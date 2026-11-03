// Mirrors docs/api-contract.md. Change the contract first, then this file.

export type Sex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type Goal = 'lose' | 'maintain' | 'gain';
export type Units = 'imperial' | 'metric';
export type SearchRadius = 5 | 10 | 15 | 20;
export type RecommendationMode = 'protein' | 'carb';
export type Category = 'entree' | 'side' | 'breakfast' | 'salad' | 'drink' | 'dessert';

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
}

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  isVerified: boolean;
  profile: Profile | null;
  preferences: Preferences;
}

export interface Calories {
  age: number;
  maintenance: number;
  target: number;
  perMeal: number;
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

export interface Favorite {
  id: string;
  placeId: string;
  label: string | null;
  createdAt: string;
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
