"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main id="main-content" className="route-error"><h1>This page couldn’t load</h1><p>Your last action may not have completed. Retry loading before submitting it again.</p>
    <button type="button" onClick={reset}>Try loading again</button><Link href="/login">Return to sign in</Link></main>;
}
