"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionValue } from "@/lib/api.js";

// Client-side auth gate. proxy.js already redirects on the server using the
// sb_token cookie; this covers the cases the cookie can't -- storage cleared
// in another tab, or a stale cookie whose token localStorage no longer has.
export default function RequireAuth({ children }) {
  const router = useRouter();
  const token = useSessionValue("token"); // undefined = not known yet

  useEffect(() => {
    if (token === null) router.replace("/#signin");
  }, [token, router]);

  if (!token) return null;
  return children;
}
