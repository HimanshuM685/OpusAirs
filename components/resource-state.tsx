"use client";

export function ResourceState({ loading, error, empty, retry, label = "data" }: {
  loading?: boolean; refreshing?: boolean; error?: Error | null; empty?: boolean; retry?: () => void; label?: string;
}) {
  if (error) return <div className="resource-error" role="alert"><p>{error.message}</p>{retry && <button type="button" onClick={retry}>Try again</button>}</div>;
  if (loading) return <p className="resource-status" role="status"><span className="spinner" aria-hidden="true" /> Loading {label}…</p>;
  if (empty) return <div className="empty-state"><h2>No {label} yet</h2><p>Try another selection or return after new observations are collected.</p></div>;
  return null;
}
