import { useEffect, useState } from 'react';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import ChangeTable from '../components/ChangeTable';
import Pill from '../components/Pill';
import StatusMessage from '../components/StatusMessage';
import { ChainDialog } from '../components/SubmissionDialogs';
import { errorMessage } from '../errors';
import { formatWhen, KIND_LABELS, STATUS_LABELS, submissionTitle } from '../submissions';
import type { MySubmissionsResponse } from '../types/api';

const PAGE = 50;

// #117: everything the user has sent, newest first, with its status and the admin's note.
export default function SubmissionsPage() {
  const [data, setData] = useState<MySubmissionsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [addingChain, setAddingChain] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let current = true;
    api.getMySubmissions(PAGE, 0).then(
      (res) => current && (setData(res), setError(null)),
      (err) => current && setError(errorMessage(err)),
    );
    return () => {
      current = false;
    };
  }, [reload]);

  async function more() {
    if (!data) return;
    setLoadingMore(true);
    try {
      const res = await api.getMySubmissions(PAGE, data.submissions.length);
      setData({ submissions: [...data.submissions, ...res.submissions], total: res.total });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] leading-[1.2] font-bold">My submissions</h1>
            <p className="mt-2 text-base text-text-muted">
              Corrections, new items and restaurants you've sent. Suggest a correction from any menu item card.
            </p>
          </div>
          <Button variant="secondary" className="sm:w-[200px]" onClick={() => setAddingChain(true)}>
            Add a restaurant
          </Button>
        </div>
        {error && <Banner message={error} actionLabel="Try again" onAction={() => setReload((n) => n + 1)} />}
        {!data ? (
          !error && <StatusMessage loading message="Loading your submissions…" />
        ) : data.submissions.length === 0 ? (
          <StatusMessage
            title="Nothing sent yet"
            message="Spot a wrong number? Use “Suggest a correction” on any menu item, or add a missing item from a restaurant on Nearby."
          />
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {data.submissions.map((s) => {
                const st = STATUS_LABELS[s.status];
                return (
                  <li key={s.id} className="flex flex-col gap-3 rounded-(--radius-card) border border-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm text-text-muted">
                          {KIND_LABELS[s.kind]} · {formatWhen(s.createdAt)}
                        </span>
                        <h2 className="text-lg leading-[1.3] font-semibold">{submissionTitle(s)}</h2>
                      </div>
                      <Pill look={st.look}>{st.label}</Pill>
                    </div>
                    <ChangeTable submission={s} />
                    {s.reviewNote && (
                      <p className="rounded-(--radius-input) bg-surface p-3 text-sm">
                        <span className="font-semibold">Reviewer note: </span>
                        {s.reviewNote}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
            {data.submissions.length < data.total && (
              <Button variant="secondary" className="sm:w-[240px]" loading={loadingMore} onClick={more}>
                Show more
              </Button>
            )}
          </>
        )}
      </div>
      <ChainDialog
        open={addingChain}
        onClose={() => {
          setAddingChain(false);
          setReload((n) => n + 1);
        }}
      />
    </AppShell>
  );
}
