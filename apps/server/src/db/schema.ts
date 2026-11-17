/** Every table, for drizzle-kit and the typed client. Tables live in their feature's *.schema.ts. */
export { authSessions, users } from "../features/auth/auth.schema";
export { userSongs } from "../features/library/library.schema";
export { loops, practiceSessions } from "../features/practice/practice.schema";
export { songs, songTracks } from "../features/songs/songs.schema";
export { sourcePieces } from "../features/sources/sources.schema";
export { songTags, tags } from "../features/tags/tags.schema";
