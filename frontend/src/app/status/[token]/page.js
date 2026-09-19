import StatusPage from "@/components/StatusPage.jsx";

export const metadata = {
  title: "Project status · Stack Board",
  robots: { index: false, follow: false }, // shared by link, not for search engines
};

export default async function Status({ params }) {
  const { token } = await params;
  return <StatusPage token={token} />;
}
