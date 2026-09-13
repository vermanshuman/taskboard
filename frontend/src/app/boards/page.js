import RequireAuth from "@/components/RequireAuth.jsx";
import BoardsPage from "@/components/BoardsPage.jsx";

export const metadata = { title: "Your boards · Stack Board" };

export default function Boards() {
  return (
    <RequireAuth>
      <BoardsPage />
    </RequireAuth>
  );
}
