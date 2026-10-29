import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../errors';
import type { Calories, Profile, User } from '../types/api';
import { ACTIVITY_LEVELS, capitalize, formatCalories, formatHeight, formatWeight } from '../units';

// The server's lowest daily target (backend services/calories.js): a "lose" target below it is raised.
const FLOOR = { female: 1200, male: 1500 };
const GOAL_ADJUST = { lose: -500, maintain: 0, gain: 300 };

// The line under the daily target. Says when the floor raised it, since the server does that quietly.
function targetNote(profile: Profile, cal: Calories) {
  if (cal.target > cal.maintenance + GOAL_ADJUST[profile.goal]) {
    return `cal a day, raised to the ${formatCalories(FLOOR[profile.sex])} cal minimum`;
  }
  if (profile.goal === 'lose') return 'cal a day to lose about 1 lb a week';
  if (profile.goal === 'gain') return 'cal a day to gain about half a pound a week';
  return 'cal a day, the same as maintenance';
}

function Tile({ label, value, note, strong }: { label: string; value: number; note: string; strong?: boolean }) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-(--radius-card) border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
        strong ? 'border-primary bg-fit-great-bg text-fit-great-text' : 'border-border bg-bg'
      }`}
    >
      <span className={`text-sm ${strong ? '' : 'text-text-muted'}`}>{label}</span>
      <span className="text-[40px] leading-[1.1] font-bold tabular-nums">{formatCalories(value)}</span>
      <span className={`text-sm ${strong ? '' : 'text-text-muted'}`}>{note}</span>
    </div>
  );
}

// #25, prototype screen 06: maintenance, target and per meal as three separate numbers (C3), what the
// user entered, and the way on to food.
export default function TargetsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cal, setCal] = useState<Calories | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load again when the profile or preferences change (after an edit, setUser gives a new object).
  useEffect(() => {
    let current = true;
    api.getCalories()
      .then((c) => {
        if (!current) return;
        setCal(c);
        setError(null);
      })
      .catch((err) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, [user]);

  const { profile, preferences } = user as User & { profile: Profile };

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">Your targets</h1>
          <p className="mt-2 text-base text-text-muted">Hi {user!.firstName}. Here's what fits your goal.</p>
        </div>
        {error && <Banner message={error} />}
        {cal ? (
          <div className="grid gap-3 md:grid-cols-3">
            <Tile label="Maintenance" value={cal.maintenance} note={`cal a day to stay at ${formatWeight(profile.weightLb, preferences.units)}`} />
            <Tile label="Daily target" value={cal.target} note={targetNote(profile, cal)} strong />
            <Tile
              label="Per meal"
              value={cal.perMeal}
              note={preferences.mealCalorieLimit !== null ? 'cal, the per-meal limit you set' : 'cal, your target split over 3 meals'}
            />
          </div>
        ) : (
          !error && <p className="text-base text-text-muted" role="status">Working out your targets…</p>
        )}
        <section className="flex flex-col gap-4 rounded-(--radius-card) border border-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
          <div className="flex items-center justify-between">
            <h2 className="text-xl leading-[1.3] font-semibold">What you entered</h2>
            <Link to="/profile" className="text-base font-semibold text-primary hover:underline">
              Edit
            </Link>
          </div>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-6">
            {[
              ['Height', formatHeight(profile.heightIn, preferences.units)],
              ['Weight', formatWeight(profile.weightLb, preferences.units)],
              ['Age', cal ? String(cal.age) : '…'],
              ['Sex', capitalize(profile.sex)],
              ['Activity', ACTIVITY_LEVELS.find((a) => a.value === profile.activityLevel)!.short],
              ['Goal', capitalize(profile.goal)],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-sm text-text-muted">{label}</dt>
                <dd className="text-base font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <Button className="sm:w-[280px]" onClick={() => navigate('/home')}>
          Find food near me
        </Button>
        <p className="text-sm text-text-muted">Estimates from the Mifflin-St Jeor formula, not medical advice.</p>
      </div>
    </AppShell>
  );
}
