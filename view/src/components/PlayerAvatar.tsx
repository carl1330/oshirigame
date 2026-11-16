import Avatar from "boring-avatars";
import {
  AVATAR_FACES,
  AVATAR_HATS,
  AVATAR_PALETTES,
  decodeAvatar,
} from "../misc/avatar";

interface PlayerAvatarProps {
  username: string;
  avatar?: string;
  size: number;
}

// Renders a player's custom avatar config (including emoji cosmetics),
// falling back to the username-seeded default when no valid config is present.
export default function PlayerAvatar(props: PlayerAvatarProps) {
  const config = decodeAvatar(props.avatar);
  const { size } = props;

  if (!config) {
    return <Avatar variant="beam" size={size} name={props.username} />;
  }

  const hat = AVATAR_HATS[config.hat];
  const face = AVATAR_FACES[config.face];

  return (
    <span
      className="relative inline-block align-top"
      style={{ width: size, height: size }}
    >
      <Avatar
        variant={config.variant}
        size={size}
        name={config.seed || props.username}
        colors={AVATAR_PALETTES[config.palette].colors}
      />
      {hat && (
        <span
          aria-hidden
          className="absolute left-1/2 pointer-events-none select-none"
          style={{
            top: -size * 0.34,
            transform: "translateX(-50%)",
            fontSize: size * 0.5,
            lineHeight: 1,
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          }}
        >
          {hat}
        </span>
      )}
      {face && (
        <span
          aria-hidden
          className="absolute left-1/2 pointer-events-none select-none"
          style={{
            top: size * 0.26,
            transform: "translateX(-50%)",
            fontSize: size * 0.38,
            lineHeight: 1,
            textShadow: "0 1px 2px rgba(0,0,0,0.4)",
          }}
        >
          {face}
        </span>
      )}
    </span>
  );
}
