"use client";

import Link from "next/link";

// Next.js route-level error boundary: catches render/runtime errors in any
// page below the root layout and offers a retry instead of a blank screen.
export default function Error({ error, reset }) {
  return (
    <div className="error-page">
      <h1>Something went wrong</h1>
      <p>{error?.message || "An unexpected error occurred while rendering this page."}</p>
      <div className="actions">
        <button className="btn btn-primary" onClick={reset}>Try again</button>
        <Link href="/boards" className="btn btn-ghost btn-outline">Back to boards</Link>
      </div>
    </div>
  );
}
