import { FaGithub, FaInstagram, FaLinkedin } from "react-icons/fa";

export default function Footer() {
  return (
    <div className="bg-[#212121] h-16 rounded-xl w-full flex items-center justify-between px-4	">
      <div className="flex gap-2">
        <a
          href="https://github.com/carl1330"
          target="_blank"
          className="flex justify-center items-center h-8 w-8 bg-[#121212] rounded-full"
        >
          <FaGithub className="text-white" />
        </a>
        <a
          href="https://www.instagram.com/carl_gulliksson/"
          target="_blank"
          className="flex justify-center items-center h-8 w-8 bg-[#121212] rounded-full"
        >
          <FaInstagram className="text-white" />
        </a>
        <a
          href="https://www.linkedin.com/in/carl-gulliksson/"
          target="_blank"
          className="flex justify-center items-center h-8 w-8 bg-[#121212] rounded-full"
        >
          <FaLinkedin className="text-white" />
        </a>
      </div>
      <div>
        <p className="text-white">© 2024 Carl Gulliksson</p>
      </div>
    </div>
  );
}
