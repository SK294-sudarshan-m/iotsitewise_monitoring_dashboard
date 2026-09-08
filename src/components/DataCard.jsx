import { useState } from 'react';

function ExpandIcon({ expanded }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
      <path
        d={expanded ? 'M4 10l4-4 4 4' : 'M4 6l4 4 4-4'}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// A static rectangular card - always renders content directly, no
// accordion/dropdown behavior. The ONLY way to toggle between the truncated
// preview and the full data is the corner icon button.
export default function DataCard({ title, summary, previewContent, fullContent, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <section className={`data-card ${expanded ? 'is-expanded' : ''}`}>
      <div className="data-card-head">
        <div className="data-card-titles">
          <span className="data-card-title">{title}</span>
          {summary != null && <span className="data-card-summary">{summary}</span>}
        </div>
        <button
          type="button"
          className="data-card-expand-btn"
          aria-expanded={expanded}
          aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <ExpandIcon expanded={expanded} />
        </button>
      </div>
      <div className="data-card-body">{expanded ? fullContent : previewContent}</div>
    </section>
  );
}
