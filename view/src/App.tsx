import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import Home from "./routes/Home";
import Room from "./routes/Room";
import TvRoom from "./routes/TvRoom";
import Daily from "./routes/Daily";
import { ToastContainer } from "react-toastify";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/room/:gameId" element={<Room />} />
        <Route path="/tv/:gameId" element={<TvRoom />} />
        <Route path="/daily" element={<Daily />} />
      </Routes>
      <ToastContainer
        position="top-center"
        autoClose={4000}
        theme="dark"
        hideProgressBar={false}
        closeOnClick
        pauseOnHover
      />
    </Router>
  );
}

export default App;
