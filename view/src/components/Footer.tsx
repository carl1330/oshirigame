import { FaGithub, FaInstagram, FaLinkedin } from "react-icons/fa";

export default function Footer() {
  return (
    <div className="panel-sunken h-16 w-full flex items-center justify-between px-4">
      <div className="flex gap-2">
        <a
          href="https://github.com/carl1330"
          target="_blank"
          aria-label="GitHub"
          className="flex justify-center items-center h-10 w-10 bg-surface-raised border border-white/5 rounded-full hover:border-violet-400/50 transition-colors"
        >
          <FaGithub className="text-white/70" />
        </a>
        <a
          href="https://www.instagram.com/carl_gulliksson/"
          target="_blank"
          aria-label="Instagram"
          className="flex justify-center items-center h-10 w-10 bg-surface-raised border border-white/5 rounded-full hover:border-violet-400/50 transition-colors"
        >
          <FaInstagram className="text-white/70" />
        </a>
        <a
          href="https://www.linkedin.com/in/carl-gulliksson/"
          target="_blank"
          aria-label="LinkedIn"
          className="flex justify-center items-center h-10 w-10 bg-surface-raised border border-white/5 rounded-full hover:border-violet-400/50 transition-colors"
        >
          <FaLinkedin className="text-white/70" />
        </a>
      </div>
      <div>
        <p className="text-white/50 text-sm">© 2024 Carl Gulliksson</p>
      </div>
    </div>
  );
}
