import { useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import SegmentedControl from '../components/SegmentedControl';
import SelectField from '../components/SelectField';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../errors';
import type { ActivityLevel, Goal, Profile, Sex, Units } from '../types/api';
import { ACTIVITY_LEVELS, CM_PER_IN, KG_PER_LB, round1 } from '../units';
import {
  parseNumber, validateBirthDate, validateChoice, validateFeetInches, validateHeight, validateWeight,
} from '../validators';

// What the inputs hold, in the units on screen. Height is ft + in for imperial, cm for metric.
interface Form {
  ft: string;
  inch: string;
  cm: string;
  weight: string;
  birthDate: string;
  sex: Sex | '';
  activityLevel: ActivityLevel | '';
  goal: Goal | '';
}

type Errors = Partial<Record<'height' | 'weight' | 'birthDate' | 'sex' | 'activityLevel' | 'goal', string | null>>;

const EMPTY: Form = { ft: '', inch: '', cm: '', weight: '', birthDate: '', sex: '', activityLevel: '', goal: '' };

function heightFields(heightIn: number | null): Pick<Form, 'ft' | 'inch' | 'cm'> {
  if (heightIn === null) return { ft: '', inch: '', cm: '' };
  const ft = Math.floor(heightIn / 12);
  return { ft: String(ft), inch: String(round1(heightIn - ft * 12)), cm: String(Math.round(heightIn * CM_PER_IN)) };
}

const weightField = (weightLb: number | null, units: Units) =>
  weightLb === null ? '' : String(round1(units === 'metric' ? weightLb * KG_PER_LB : weightLb));

function toForm(profile: Profile | null, units: Units): Form {
  if (!profile) return EMPTY;
  const { heightIn, weightLb, ...rest } = profile;
  return { ...heightFields(heightIn), weight: weightField(weightLb, units), ...rest };
}

// Back to what the API stores: inches and pounds. null when the inputs aren't numbers.
function heightIn(f: Form, units: Units) {
  if (units === 'metric') {
    const cm = parseNumber(f.cm);
    return cm === null ? null : round1(cm / CM_PER_IN);
  }
  const ft = parseNumber(f.ft);
  const inch = f.inch.trim() ? parseNumber(f.inch) : 0;
  return ft === null || inch === null ? null : round1(ft * 12 + inch);
}

function weightLb(f: Form, units: Units) {
  const w = parseNumber(f.weight);
  return w === null ? null : round1(units === 'metric' ? w / KG_PER_LB : w);
}

// #25. First-time setup at /onboarding (no app nav yet, "See my targets"), and editing at /profile.
// Both send the whole profile with PUT /users/me/profile, then the units with PATCH preferences if
// they changed, and go to /targets.
export default function ProfilePage({ mode }: { mode: 'setup' | 'edit' }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const saved = user!.profile;
  const savedUnits = user!.preferences.units;
  const [units, setUnits] = useState<Units>(savedUnits);
  const [initial] = useState<Form>(() => toForm(saved, savedUnits));
  const [form, setForm] = useState<Form>(initial);
  const heightErrorId = useId();
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const metric = units === 'metric';

  function check(f: Form): Errors {
    return {
      height: (metric ? null : validateFeetInches(f.ft, f.inch)) ?? validateHeight(heightIn(f, units), metric),
      weight: validateWeight(weightLb(f, units), metric),
      birthDate: validateBirthDate(f.birthDate),
      sex: validateChoice(f.sex, 'Sex'),
      activityLevel: validateChoice(f.activityLevel, 'Activity level'),
      goal: validateChoice(f.goal, 'Goal'),
    };
  }

  // Re-check one field as it changes, but only once it has shown an error (same as the auth forms).
  function update(patch: Partial<Form>, key: keyof Errors) {
    const next = { ...form, ...patch };
    setForm(next);
    if (errors[key]) setErrors((e) => ({ ...e, [key]: check(next)[key] }));
  }

  const blur = (key: keyof Errors) => () => setErrors((e) => ({ ...e, [key]: check(form)[key] }));

  // Inches and pounds for what's on screen. A box still showing the stored value gives the stored value
  // exactly: 130 lb shows as 59 kg, and converting 59 kg back would give 130.1.
  function exactHeight(f: Form, u: Units) {
    const same = u === 'metric' ? f.cm === initial.cm : f.ft === initial.ft && f.inch === initial.inch;
    return saved && u === savedUnits && same ? saved.heightIn : heightIn(f, u);
  }

  function exactWeight(f: Form, u: Units) {
    return saved && u === savedUnits && f.weight === initial.weight ? saved.weightLb : weightLb(f, u);
  }

  // Keep what was typed when switching units: convert through inches and pounds.
  function switchUnits(next: Units) {
    if (next === units) return;
    const h = exactHeight(form, units);
    const w = exactWeight(form, units);
    setUnits(next);
    setForm((f) => ({ ...f, ...heightFields(h), weight: weightField(w, next) }));
    setErrors((e) => ({ ...e, height: null, weight: null }));
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next = check(form);
    setErrors(next);
    if (saving || Object.values(next).some(Boolean)) return;
    setSaving(true);
    setError(null);
    try {
      let updated = await api.updateProfile({
        heightIn: exactHeight(form, units)!,
        weightLb: exactWeight(form, units)!,
        birthDate: form.birthDate,
        sex: form.sex as Sex,
        activityLevel: form.activityLevel as ActivityLevel,
        goal: form.goal as Goal,
      });
      if (units !== updated.preferences.units) updated = await api.updatePreferences({ units });
      setUser(updated);
      navigate('/targets');
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  }

  return (
    <AppShell nav={mode === 'edit'}>
      <div className="mx-auto flex max-w-[640px] flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">{mode === 'setup' ? 'Set up your profile' : 'Edit your profile'}</h1>
          <p className="mt-2 text-base text-text-muted">
            We use this to estimate your daily calories. You can change it any time.
          </p>
        </div>
        {error && <Banner message={error} />}
        <form onSubmit={submit} noValidate className="flex flex-col gap-5">
          <div className="sm:w-1/2 sm:pr-2">
            <SegmentedControl
              label="Units"
              options={[
                { value: 'imperial', label: 'ft / lb' },
                { value: 'metric', label: 'cm / kg' },
              ]}
              value={units}
              onChange={switchUnits}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold">Height</legend>
              {metric ? (
                <TextField
                  label="Height in centimeters"
                  hideLabel
                  inputMode="decimal"
                  suffix="cm"
                  value={form.cm}
                  onChange={(v) => update({ cm: v }, 'height')}
                  onBlur={blur('height')}
                  invalid={!!errors.height}
                  aria-describedby={errors.height ? heightErrorId : undefined}
                />
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <TextField
                    label="Height, feet"
                    hideLabel
                    inputMode="numeric"
                    suffix="ft"
                    value={form.ft}
                    onChange={(v) => update({ ft: v }, 'height')}
                    onBlur={blur('height')}
                    invalid={!!errors.height}
                    aria-describedby={errors.height ? heightErrorId : undefined}
                  />
                  <TextField
                    label="Height, inches"
                    hideLabel
                    inputMode="decimal"
                    suffix="in"
                    value={form.inch}
                    onChange={(v) => update({ inch: v }, 'height')}
                    onBlur={blur('height')}
                    invalid={!!errors.height}
                    aria-describedby={errors.height ? heightErrorId : undefined}
                  />
                </div>
              )}
              {errors.height && (
                <p id={heightErrorId} className="text-sm text-error">
                  {errors.height}
                </p>
              )}
            </fieldset>
            <TextField
              label="Weight"
              inputMode="decimal"
              suffix={metric ? 'kg' : 'lb'}
              value={form.weight}
              onChange={(v) => update({ weight: v }, 'weight')}
              onBlur={blur('weight')}
              error={errors.weight}
            />
            <TextField
              label="Birth date"
              type="date"
              value={form.birthDate}
              onChange={(v) => update({ birthDate: v }, 'birthDate')}
              onBlur={blur('birthDate')}
              error={errors.birthDate}
            />
            <SegmentedControl
              label="Sex"
              options={[
                { value: 'female', label: 'Female' },
                { value: 'male', label: 'Male' },
              ]}
              value={form.sex}
              onChange={(v) => update({ sex: v }, 'sex')}
              error={errors.sex}
            />
          </div>
          <SelectField
            label="Activity level"
            placeholder="Choose your activity level"
            options={ACTIVITY_LEVELS}
            value={form.activityLevel}
            onChange={(v) => update({ activityLevel: v }, 'activityLevel')}
            error={errors.activityLevel}
          />
          <SegmentedControl
            label="Goal"
            options={[
              { value: 'lose', label: 'Lose' },
              { value: 'maintain', label: 'Maintain' },
              { value: 'gain', label: 'Gain' },
            ]}
            value={form.goal}
            onChange={(v) => update({ goal: v }, 'goal')}
            error={errors.goal}
          />
          <div className="flex flex-col gap-3 sm:flex-row-reverse">
            <Button type="submit" loading={saving}>
              {mode === 'setup' ? 'See my targets' : 'Save'}
            </Button>
            {mode === 'edit' && (
              <Button type="button" variant="secondary" onClick={() => navigate('/targets')}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </div>
    </AppShell>
  );
}
