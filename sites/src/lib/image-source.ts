import assets from './image-assets.json';
const variants = assets as Record<string, Record<string, string>>;
export const imageSource = (id: string, width = 640) => variants[id]?.[String(width)] ?? `/api/files/${encodeURIComponent(id)}`;
export const imageSources = (id: string) => variants[id] ? `${variants[id]['640']} ${variants[id].width640}w, ${variants[id]['1280']} ${variants[id].width1280}w` : undefined;
