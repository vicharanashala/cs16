export function getInitials(name) {
  const safeName = (name || 'User').trim();
  if (!safeName) return 'U';

  const words = safeName.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 'U';
  if (words.length === 1) {
    const [word] = words;
    return word.slice(0, 2).toUpperCase();
  }

  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const avatarColors = [
  'bg-slate-500',
  'bg-emerald-500',
  'bg-indigo-500',
  'bg-rose-500',
  'bg-amber-500',
  'bg-cyan-500',
  'bg-violet-500',
];

export function getAvatarColor(name) {
  const safeName = (name || 'User').trim();
  if (!safeName) return avatarColors[0];

  let hash = 0;
  for (let i = 0; i < safeName.length; i += 1) {
    hash = (hash * 31 + safeName.charCodeAt(i)) >>> 0;
  }

  return avatarColors[hash % avatarColors.length];
}
