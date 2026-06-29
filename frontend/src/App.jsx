import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "./lib/api.js";
import Login from "./pages/Login.jsx";
import Boards from "./pages/Boards.jsx";
import Board from "./pages/Board.jsx";

function RequireAuth({ children }) {
  return getToken() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Boards />
          </RequireAuth>
        }
      />
      <Route
        path="/boards/:id"
        element={
          <RequireAuth>
            <Board />
          </RequireAuth>
        }
      />
    </Routes>
  );
}
