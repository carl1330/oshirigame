import { ToastContainer } from "react-toastify";
import Footer from "../components/Footer";
import Button from "../components/Button";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getHttpConfig } from "../misc/server.conf";
import { useLocalStorage } from "usehooks-ts";

export default function CreateRoom() {
  const [, setUsername] = useLocalStorage("username", "");
  const [, setLanguage] = useState("en");
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
            <h1 className="text-white text-3xl font-bold">Create room</h1>
            <form className="flex flex-col gap-4">
              <select
                className="bg-[#212121] text-white border-none text-center p-2 rounded-full selection:border-none"
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="en">English</option>
                <option value="jp">日本語</option>
              </select>
              <input
                className="text-white bg-[#3F3F3F] px-6 py-4 rounded-full text-center"
                placeholder="Enter your username"
                onChange={(e) => setUsername(e.target.value)}
              ></input>
              <Button onClick={handleCreateRoom}>Create room</Button>
            </form>
          </div>
        </div>
        <Footer />
      </div>
      <ToastContainer />
    </div>
  );
}
