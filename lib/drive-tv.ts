export const TV_DRIVE_FOLDER = '1xANBzDFi26YgOwbcakrSV7qYXZ2oDXSX';
export const TV_DRIVE_URL = `https://drive.google.com/drive/folders/${TV_DRIVE_FOLDER}`;
export type TVPhoto = { id: string; name: string; album: string; src: string };
export type TVAlbum = { photos: TVPhoto[]; partial: boolean; updatedAt: string };
