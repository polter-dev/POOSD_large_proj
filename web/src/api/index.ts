import { request } from './client';
import type {
  AddFavoriteBody, Calories, EmailBody, Favorite, FavoritesResponse, LoginBody, LoginResponse,
  MessageResponse, NearbyBody, NearbyResponse, RecommendationsBody, RecommendationsResponse,
  RegisterBody, ResendVerificationBody, ResetPasswordBody, SearchMenuItemsResponse, UpdateGoalBody, UpdatePreferencesBody,
  UpdateProfileBody, User,
} from '../types/api';

export { ApiError, setSessionExpiredHandler } from './client';

// One function per row of docs/api-contract.md section 3 ("Web client fn" column), plus logout.

// Auth
export const register = (body: RegisterBody) => request<MessageResponse>('POST', '/auth/register', body);
export const login = async (body: LoginBody) => {
  const res = await request<LoginResponse>('POST', '/auth/login', body);
  localStorage.setItem('token', res.token);
  return res;
};
export const logout = () => localStorage.removeItem('token');
export const verifyEmail = (token: string) => request<MessageResponse>('GET', `/auth/verify-email?token=${encodeURIComponent(token)}`);
export const resendVerification = (body: ResendVerificationBody) => request<MessageResponse>('POST', '/auth/resend-verification', body);
export const forgotPassword = (body: EmailBody) => request<MessageResponse>('POST', '/auth/forgot-password', body);
export const resetPassword = (body: ResetPasswordBody) => request<MessageResponse>('POST', '/auth/reset-password', body);

// Users
export const getMe = () => request<User>('GET', '/users/me');
export const updateProfile = (body: UpdateProfileBody) => request<User>('PUT', '/users/me/profile', body);
export const updateGoal = (body: UpdateGoalBody) => request<User>('PUT', '/users/me/goal', body);
export const updatePreferences = (body: UpdatePreferencesBody) => request<User>('PATCH', '/users/me/preferences', body);
export const getCalories = () => request<Calories>('GET', '/users/me/calories');

// Menu (defaults match the server's)
export const searchMenuItems = (q: string, limit = 20, skip = 0) =>
  request<SearchMenuItemsResponse>('GET', `/menu-items/search?${new URLSearchParams({ q, limit: String(limit), skip: String(skip) })}`);
export const recommendations = (body: RecommendationsBody = {}) => request<RecommendationsResponse>('POST', '/recommendations', body);

// Restaurants
export const nearby = (body: NearbyBody) => request<NearbyResponse>('POST', '/restaurants/nearby', body);

// Favorites
export const getFavorites = () => request<FavoritesResponse>('GET', '/favorites');
export const addFavorite = (body: AddFavoriteBody) => request<Favorite>('POST', '/favorites', body);
export const removeFavorite = (id: string) => request<void>('DELETE', `/favorites/${encodeURIComponent(id)}`);
