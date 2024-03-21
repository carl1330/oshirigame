import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import Room from "./routes/Room";
import CreateRoom from "./routes/CreateRoom";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/create" element={<CreateRoom />} />
        <Route path="/room/:gameId" element={<Room />} />
      </Routes>
    </Router>
  );
}

export default App;
