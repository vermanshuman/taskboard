import { Suspense } from "react";
import RequireAuth from "@/components/RequireAuth.jsx";
import ProfileForm from "./ProfileForm.jsx";

export const metadata = { title: "Profile · Stack Board" };

export default function ProfilePage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <ProfileForm />
      </Suspense>
    </RequireAuth>
  );
}
