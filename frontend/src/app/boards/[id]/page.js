import RequireAuth from "@/components/RequireAuth.jsx";
import BoardPage from "@/components/BoardPage.jsx";

export const metadata = { title: "Board · Stack Board" };

export default async function Board({ params }) {
  const { id } = await params;
  return (
    <RequireAuth>
      <BoardPage id={id} />
    </RequireAuth>
  );
}
