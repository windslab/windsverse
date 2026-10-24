/** Memoirs TV album (Story of Winds photos chosen by an admin). */
export type TVPhoto = { id: string; name: string; album: string; src: string };
export type TVAlbum = { photos: TVPhoto[]; partial: boolean; updatedAt: string };
