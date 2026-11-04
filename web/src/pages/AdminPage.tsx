import { useEffect, useState } from 'react';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import ChangeTable from '../components/ChangeTable';
import Pill from '../components/Pill';
import SelectField from '../components/SelectField';
import StatusMessage from '../components/StatusMessage';
import { errorMessage } from '../errors';
import { FLAG_LABELS, formatWhen, KIND_LABELS, STATUS_LABELS, submissionTitle } from '../submissions';
import type { AdminSubmission, AdminSubmissionsResponse, ReviewSubmissionBody, SubmissionStatus } from '../types/api';

const PAGE = 20;
const STATUSES = (Object.keys(STATUS_LABELS) as SubmissionStatus[]).map((s) => ({
  value: s,
  label: s === 'pending' ? 'Pending review' : STATUS_LABELS[s].label,
}));

// What an admin can do from each status (contract, "Allowed status changes").
const ACTIONS: Partial<Record<SubmissionStatus, ReviewSubmissionBody['status'][]>> = {
  pending: ['approved', 'rejected'],
  auto_applied: ['reverted'],
  approved: ['reverted'],
};
const ACTION_LABELS = { approved: 'Approve', rejected: 'Reject', reverted: 'Revert' };

function Row({ s, onDone }: { s: AdminSubmission; onDone: (id: string, updated: AdminSubmission) => void }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const st = STATUS_LABELS[s.status];
  const actions = ACTIONS[s.status] ?? [];

  async function review(status: ReviewSubmissionBody['status']) {
    setBusy(status);
    setError(null);
    try {
      onDone(s.id, await api.reviewSubmission(s.id, { status, reviewNote: note.trim() || null }));
    } catch (err) {
      setError(errorMessage(err)); // 409s ("Item changed since this submission", ...) as the API words them
      setBusy(null);
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-(--radius-card) border border-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-sm text-text-muted">
            {KIND_LABELS[s.kind]} · {s.user.username ?? 'deleted account'} · {formatWhen(s.createdAt)}
          </span>
          <h2 className="text-lg leading-[1.3] font-semibold">{submissionTitle(s)}</h2>
          {s.kind === 'edit_item' && !s.before && (
            // The API gives a pending edit only its proposed values and the item id.
            <span className="text-sm text-text-muted">Item {s.targetId}</span>
          )}
        </div>
        <Pill look={st.look}>{st.label}</Pill>
      </div>
      {s.flags.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Flags">
          {s.flags.map((f) => (
            <li key={f}>
              <Pill look="ok" icon="dash">{FLAG_LABELS[f]}</Pill>
            </li>
          ))}
        </ul>
      )}
      <ChangeTable submission={s} />
      {s.reviewNote && (
        <p className="rounded-(--radius-input) bg-surface p-3 text-sm">
          <span className="font-semibold">Note{s.reviewedBy?.username ? ` from ${s.reviewedBy.username}` : ''}: </span>
          {s.reviewNote}
        </p>
      )}
      {error && <Banner message={error} />}
      {actions.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={`note-${s.id}`} className="text-sm font-semibold">
              Note (optional)
            </label>
            <input
              id={`note-${s.id}`}
              value={note}
              maxLength={300}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Shown to the user"
              className="h-12 w-full rounded-(--radius-input) border border-border-input bg-bg px-3 text-base focus:border-primary focus:outline-1 focus:outline-offset-0 focus:outline-primary"
            />
          </div>
          {actions.map((a) => (
            <Button
              key={a}
              variant={a === 'approved' ? 'primary' : 'secondary'}
              className="sm:w-[120px]"
              loading={busy === a}
              disabled={busy !== null}
              onClick={() => review(a)}
            >
              {ACTION_LABELS[a]}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

// #117: the review queue. Admins only (nav and route check user.role; the API answers 403 to anyone else).
export default function AdminPage() {
  const [status, setStatus] = useState<SubmissionStatus>('pending');
  const [data, setData] = useState<{ status: SubmissionStatus; res: AdminSubmissionsResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [reload, setReload] = useState(0);
  const shown = data?.status === status ? data.res : null;

  useEffect(() => {
    let current = true;
    api.getAdminSubmissions(status, PAGE, 0).then(
      (res) => current && (setData({ status, res }), setError(null)),
      (err) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [status, reload]);

  async function more() {
    if (!shown) return;
    setLoadingMore(true);
    try {
      const res = await api.getAdminSubmissions(status, PAGE, shown.submissions.length);
      setData({ status, res: { submissions: [...shown.submissions, ...res.submissions], total: res.total } });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  // A reviewed submission leaves this filter's list (its status changed).
  function done(id: string, updated: AdminSubmission) {
    setNotice(`${STATUS_LABELS[updated.status].label}: ${submissionTitle(updated)}.`);
    setData((d) =>
      d && {
        ...d,
        res: { submissions: d.res.submissions.filter((x) => x.id !== id), total: d.res.total - 1 },
      },
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">Review submissions</h1>
          <p className="mt-2 text-base text-text-muted">
            Approve or reject what auto-moderation flagged, or revert a change that went live.
          </p>
        </div>
        <div className="sm:w-[280px]">
          <SelectField
            label="Show"
            placeholder="Status"
            options={STATUSES}
            value={status}
            onChange={(v) => {
              setStatus(v);
              setNotice(null);
            }}
          />
        </div>
        {error && <Banner message={error} actionLabel="Try again" onAction={() => setReload((n) => n + 1)} />}
        {notice && <Banner info message={notice} />}
        {!shown ? (
          !error && <StatusMessage loading message="Loading submissions…" />
        ) : shown.submissions.length === 0 ? (
          <StatusMessage
            title={status === 'pending' ? 'All caught up' : 'Nothing here'}
            message={status === 'pending' ? 'No submissions are waiting for review.' : `No ${STATUS_LABELS[status].label.toLowerCase()} submissions.`}
          />
        ) : (
          <>
            <p className="-mb-3 text-sm text-text-muted">{shown.total} {shown.total === 1 ? 'submission' : 'submissions'}</p>
            <ul className="flex flex-col gap-3">
              {shown.submissions.map((s) => (
                <Row key={s.id} s={s} onDone={done} />
              ))}
            </ul>
            {shown.submissions.length < shown.total && (
              <Button variant="secondary" className="sm:w-[240px]" loading={loadingMore} onClick={more}>
                Show more
              </Button>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
