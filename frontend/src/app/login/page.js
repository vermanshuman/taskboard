import { redirect } from "next/navigation";

// The sign-in form lives on the landing page now; keep the old URL working.
export default function LoginRedirect() {
  redirect("/#signin");
}
