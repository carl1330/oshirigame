import Footer from "../components/Footer";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import Button from "../components/Button";
import { useNavigate } from "react-router-dom";
import { getHttpConfig } from "../misc/server.conf";
import { FaPlay } from "react-icons/fa";

export interface GamePreferences {
  token: string;
}

export default function Home() {
  const navigate = useNavigate();
  const apiConfig = getHttpConfig();

  async function handleCreateRoom(e: React.MouseEvent<HTMLButtonElement>) {
    e.preventDefault();
    const response = await fetch(apiConfig + "/creategame")
      .then((res) => res.json())
      .then((data) => {
        return data.id;
      });
    navigate("/room/" + response);
  }

  return (
    <div className="w-full h-screen flex p-2">
      <div className="flex w-full flex-col gap-2">
        <div className="flex grow justify-center">
          <div className="flex flex-col gap-4 justify-center items-center h-full w-full rounded-xl bg-[#212121]">
            <h1 className="text-white text-3xl font-bold">Oshirigame</h1>
            <Button onClick={handleCreateRoom}>
              <FaPlay />
            </Button>
          </div>
        </div>
        <Footer />
      </div>
    </div>
  );
}
