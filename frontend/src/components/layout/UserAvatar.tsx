import { Avatar } from '@mui/material';

import { initialsOf } from '@/components/layout/user-initials';
import { darkSurfaces, fontSizes, layout, lightSurfaces } from '@/theme/tokens';

interface UserAvatarProps {
  displayName: string | undefined | null;
  size?: number;
}

/**
 * Avatar con iniciales (`.avatar-btn` / `.avatar-fallback` del prototipo):
 * círculo gris sutil con borde, nunca una foto inventada. Es decorativo: el
 * nombre accesible lo pone el control que lo contiene.
 */
export function UserAvatar({ displayName, size = layout.avatarSize }: UserAvatarProps) {
  return (
    <Avatar
      aria-hidden="true"
      sx={(theme) => ({
        width: size,
        height: size,
        fontSize: fontSizes.small,
        fontWeight: 600,
        color: 'text.primary',
        bgcolor: theme.palette.mode === 'dark' ? darkSurfaces.subtle : lightSurfaces.subtle,
        border: 2,
        borderColor: 'divider',
      })}
    >
      {initialsOf(displayName)}
    </Avatar>
  );
}
