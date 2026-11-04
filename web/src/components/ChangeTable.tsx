import { changeRows } from '../submissions';
import type { Submission } from '../types/api';

// A submission's fields: before (an applied edit) and the proposed value.
export default function ChangeTable({ submission }: { submission: Pick<Submission, 'kind' | 'payload' | 'before'> }) {
  const rows = changeRows(submission);
  const showBefore = rows.some((r) => r.before !== null);
  return (
    <table className="w-full text-left text-sm">
      <thead className="sr-only sm:not-sr-only">
        <tr className="text-text-muted">
          <th scope="col" className="py-1 pr-3 font-medium">Field</th>
          {showBefore && <th scope="col" className="py-1 pr-3 font-medium">Before</th>}
          <th scope="col" className="py-1 font-medium">{submission.kind === 'edit_item' ? 'Proposed' : 'Value'}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.field} className="border-t border-border align-top">
            <th scope="row" className="py-1.5 pr-3 font-medium text-text-muted">{r.label}</th>
            {showBefore && <td className="py-1.5 pr-3 tabular-nums line-through decoration-text-muted/60">{r.before}</td>}
            <td className="py-1.5 font-semibold break-all tabular-nums">{r.proposed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
