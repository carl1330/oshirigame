import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import Room from "./routes/Room";
import CreateRoom from "./routes/CreateRoom";
import Dev from "./routes/Dev";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/create" element={<CreateRoom />} />
        <Route path="/room/:gameId" element={<Room />} />
        <Route path="/dev" element={<Dev />} />
      </Routes>
    </Router>
  );
}

export default App;
