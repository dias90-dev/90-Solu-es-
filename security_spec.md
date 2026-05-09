# Security Spec

## Data Invariants
1. A user profile document can only be created by the user themselves.
2. A song history document must belong to a valid user.
3. Users can only read, update, or delete their own songs.
4. Tempo must be a number between 60 and 240.
5. All IDs must match standard regex.

## The "Dirty Dozen" Payloads
1. Create a user profile with `uid` that doesn't match `request.auth.uid`. (Fails: Identity)
2. Create a song document with an unverified email structure. (Fails: Identity/Integrity)
3. Update a song document not owned by the user. (Fails: State)
4. Insert 1MB string in `songId` path. (Fails: Path Variable)
5. Create a song with a missing `genre`. (Fails: Incomplete Data)
6. Add an unknown field `isAdmin` to user profile. (Fails: Shadow Update)
7. Update `song` with `tempo: "fast"`. (Fails: Type mismatch)
8. Provide string `createdAt` instead of timestamp. (Fails: Temporal Integrity)
9. Change `ownerId` of an existing song document. (Fails: Identity Hijack)
10. Read a song belonging to someone else. (Fails: Privacy)
11. Blanket list query across all songs without filtering `ownerId`. (Fails: Query Trust)
12. Create a song document with missing `tracks` array. (Fails: Shape constraint)
