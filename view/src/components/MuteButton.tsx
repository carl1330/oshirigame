import { useEffect } from "react";
import { Howler } from "howler";
import { useLocalStorage } from "usehooks-ts";
import { FaVolumeUp, FaVolumeMute } from "react-icons/fa";

/**
 * Global sound toggle. use-sound plays everything through howler, so a
 * single Howler.mute() silences all game audio. Persisted across sessions.
 */
export default function MuteButton() {
  const [muted, setMuted] = useLocalStorage("muted", false);

  useEffect(() => {
    Howler.mute(muted);
  }, [muted]);

  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      aria-pressed={muted}
      title={muted ? "Unmute sounds" : "Mute sounds"}
      className={`w-12 h-12 flex items-center justify-center rounded-full border active:scale-95 transition-transform ${
        muted
          ? "bg-surface-sunken border-white/10 text-white/40 hover:bg-surface-raised"
          : "bg-surface-sunken border-white/10 text-white hover:bg-surface-raised"
      }`}
    >
      {muted ? (
        <FaVolumeMute className="text-xl" aria-hidden />
      ) : (
        <FaVolumeUp className="text-xl" aria-hidden />
      )}
    </button>
  );
}
