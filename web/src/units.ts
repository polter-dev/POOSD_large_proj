import type { ActivityLevel, Units } from './types/api';

// The API stores height and weight imperial (inches, pounds); metric is display only (contract, Profile).
export const CM_PER_IN = 2.54;
export const KG_PER_LB = 0.453592;

// One decimal, so a metric round trip doesn't drift by more than the input's own precision.
export const round1 = (n: number) => Math.round(n * 10) / 10;

export function formatHeight(heightIn: number, units: Units) {
  if (units === 'metric') return `${Math.round(heightIn * CM_PER_IN)} cm`;
  const total = Math.round(heightIn);
  return `${Math.floor(total / 12)} ft ${total % 12} in`;
}

export function formatWeight(weightLb: number, units: Units) {
  return units === 'metric' ? `${Math.round(weightLb * KG_PER_LB)} kg` : `${Math.round(weightLb)} lb`;
}

export const formatCalories = (n: number) => n.toLocaleString('en-US');

// Profile form select, and the short form on the targets page.
export const ACTIVITY_LEVELS: { value: ActivityLevel; label: string; short: string }[] = [
  { value: 'sedentary', label: 'Sedentary: little or no exercise', short: 'Sedentary' },
  { value: 'light', label: 'Light: exercise 1 to 3 days a week', short: 'Light' },
  { value: 'moderate', label: 'Moderate: exercise 3 to 5 days a week', short: 'Moderate' },
  { value: 'active', label: 'Active: exercise 6 to 7 days a week', short: 'Active' },
  { value: 'very_active', label: 'Very active: hard exercise daily or a physical job', short: 'Very active' },
];

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
