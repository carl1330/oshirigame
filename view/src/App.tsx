import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import Room from "./routes/Room";
import { ToastContainer } from "react-toastify";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:gameId" element={<Room />} />
      </Routes>
      <ToastContainer />
    </Router>
  );
}

export default App;
