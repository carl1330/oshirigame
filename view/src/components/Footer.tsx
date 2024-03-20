import { FaGithub, FaInstagram, FaTwitter } from "react-icons/fa";

export default function Footer() {
  return (
    <div className="bg-[#212121] h-16 rounded-xl w-full flex items-center justify-between px-4	">
      <div className="flex gap-2">
        <button className="flex justify-center items-center h-8 w-8 bg-[#121212] rounded-full">
          <FaGithub className="text-white" />
        </button>
        <button className="flex justify-center items-center h-8 w-8 bg-[#121212] rounded-full">
          <FaTwitter className="text-white" />
        </button>
        <button className="flex justify-center items-center h-8 w-8 bg-[#121212] rounded-full">
          <FaInstagram className="text-white" />
        </button>
      </div>
      <div>
        <p className="text-white">© 2024 Carl Gulliksson</p>
      </div>
    </div>
  );
}
