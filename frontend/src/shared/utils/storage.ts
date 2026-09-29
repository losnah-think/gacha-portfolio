export const STORAGE_BASE_URL = import.meta.env.VITE_STORAGE_BASE_URL || '/portfolio-assets';

export const getStorageUrl = (path: string) => {
    if (!path) return '';

    if (path.startsWith(STORAGE_BASE_URL)) {
        const storagePath = path.slice(STORAGE_BASE_URL.length).replace(/^\/+/, '');
        if (storagePath.startsWith('images/')) return `/${storagePath}`;
        return path;
    }

    if (path.startsWith('http')) return path;

    // Remove leading slash if exists
    const cleanPath = path.startsWith('/') ? path.slice(1) : path;

    if (cleanPath.startsWith('images/')) return `/${cleanPath}`;

    return `${STORAGE_BASE_URL}/${cleanPath}`;
};
