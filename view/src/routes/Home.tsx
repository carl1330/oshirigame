import Footer from "../components/Footer";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Button from "../components/Button";
import { useNavigate } from "react-router-dom";

export interface GamePreferences {
  token: string;
}

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="w-full h-screen flex p-2">
      <div className="flex w-full flex-col gap-2">
        <div className="flex grow justify-center">
          <div className="flex flex-col gap-4 justify-center items-center h-full w-full rounded-xl bg-[#212121]">
            <h1 className="text-white text-3xl font-bold">Oshirigame</h1>
            <Button onClick={() => navigate("/room/create")}>
              Create room
            </Button>
          </div>
        </div>
        <Footer />
      </div>
      <ToastContainer />
    </div>
  );
}
