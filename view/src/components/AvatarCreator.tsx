import { Dialog } from "@headlessui/react";
import Avatar from "boring-avatars";
import { useState } from "react";
import { FaDice } from "react-icons/fa";
import Button from "./Button";
import PlayerAvatar from "./PlayerAvatar";
import {
  AVATAR_FACES,
  AVATAR_HATS,
  AVATAR_PALETTES,
  AVATAR_VARIANTS,
  AvatarConfig,
  decodeAvatar,
  encodeAvatar,
  randomSeed,
} from "../misc/avatar";

interface AvatarCreatorProps {
  isOpen: boolean;
  setIsOpen: (v: boolean) => void;
  username: string;
  /** Current encoded avatar, "" if using the default */
  value: string;
  onSave: (encoded: string) => void;
}

export default function AvatarCreator(props: AvatarCreatorProps) {
  const [config, setConfig] = useState<AvatarConfig>(
    () =>
      decodeAvatar(props.value) ?? {
        variant: "beam",
        palette: 0,
        seed: randomSeed(),
        hat: 0,
        face: 0,
      }
  );

  const previewName = config.seed || props.username || "player";

  function handleSave() {
    props.onSave(encodeAvatar(config));
    props.setIsOpen(false);
  }

  function handleUseDefault() {
    props.onSave("");
    props.setIsOpen(false);
  }

  return (
    <Dialog open={props.isOpen} onClose={() => props.setIsOpen(false)}>
      <div className="dialog-backdrop" aria-hidden="true" />
      <div className="fixed inset-0 flex w-screen items-center justify-center p-2 sm:p-4 overflow-y-auto">
        <Dialog.Panel className="dialog-panel my-auto">
          <Dialog.Title className="dialog-title mb-5">
            Customize Avatar
          </Dialog.Title>

          <div className="space-y-5">
            {/* Live preview + shuffle; top padding leaves room for hats */}
            <div className="flex flex-col items-center gap-3 pt-8">
              <div className="rounded-full p-1.5 bg-surface-sunken border border-white/10">
                <PlayerAvatar
                  username={previewName}
                  avatar={encodeAvatar(config)}
                  size={112}
                />
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, seed: randomSeed() })}
                className="flex items-center gap-2 px-4 h-11 rounded-full bg-surface-sunken border border-white/10 text-white/80 hover:border-violet-400/50 hover:text-white active:scale-95 transition-all font-display font-semibold text-sm"
              >
                <FaDice aria-hidden className="text-lg" /> Shuffle
              </button>
            </div>

            {/* Style picker */}
            <div>
              <span className="field-label">Style</span>
              <div className="grid grid-cols-3 gap-2">
                {AVATAR_VARIANTS.map((variant) => (
                  <button
                    key={variant}
                    type="button"
                    onClick={() => setConfig({ ...config, variant })}
                    aria-pressed={config.variant === variant}
                    className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-colors ${
                      config.variant === variant
                        ? "border-violet-400/70 bg-violet-500/15"
                        : "border-white/10 bg-surface-sunken hover:border-white/25"
                    }`}
                  >
                    <Avatar
                      variant={variant}
                      size={40}
                      name={previewName}
                      colors={AVATAR_PALETTES[config.palette].colors}
                    />
                    <span className="text-xs text-white/60 capitalize">
                      {variant}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Palette picker */}
            <div>
              <span className="field-label">Colors</span>
              <div className="grid grid-cols-4 gap-2">
                {AVATAR_PALETTES.map((palette, index) => (
                  <button
                    key={palette.name}
                    type="button"
                    title={palette.name}
                    onClick={() => setConfig({ ...config, palette: index })}
                    aria-pressed={config.palette === index}
                    className={`flex h-11 rounded-xl overflow-hidden border-2 transition-colors ${
                      config.palette === index
                        ? "border-violet-400"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    {palette.colors.map((color) => (
                      <span
                        key={color}
                        className="flex-1"
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </button>
                ))}
              </div>
            </div>

            {/* Cosmetics */}
            <div>
              <span className="field-label">Hat</span>
              <div className="grid grid-cols-5 xs:grid-cols-9 gap-1.5">
                {AVATAR_HATS.map((hat, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={config.hat === index}
                    aria-label={hat ? `Hat ${hat}` : "No hat"}
                    onClick={() => setConfig({ ...config, hat: index })}
                    className={`h-11 flex items-center justify-center rounded-xl border text-xl transition-colors ${
                      config.hat === index
                        ? "border-violet-400/70 bg-violet-500/15"
                        : "border-white/10 bg-surface-sunken hover:border-white/25"
                    }`}
                  >
                    {hat || <span className="text-white/30 text-sm">—</span>}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="field-label">Accessory</span>
              <div className="grid grid-cols-5 xs:grid-cols-8 gap-1.5">
                {AVATAR_FACES.map((face, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-pressed={config.face === index}
                    aria-label={face ? `Accessory ${face}` : "No accessory"}
                    onClick={() => setConfig({ ...config, face: index })}
                    className={`h-11 flex items-center justify-center rounded-xl border text-xl transition-colors ${
                      config.face === index
                        ? "border-violet-400/70 bg-violet-500/15"
                        : "border-white/10 bg-surface-sunken hover:border-white/25"
                    }`}
                  >
                    {face || <span className="text-white/30 text-sm">—</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-1">
              <div className="flex gap-3">
                <Button
                  variant="secondary"
                  onClick={() => props.setIsOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button onClick={handleSave} className="flex-1">
                  Save
                </Button>
              </div>
              <button
                type="button"
                onClick={handleUseDefault}
                className="text-sm text-white/40 hover:text-white/70 transition-colors py-1"
              >
                Reset to default avatar
              </button>
            </div>
          </div>
        </Dialog.Panel>
      </div>
    </Dialog>
  );
}
