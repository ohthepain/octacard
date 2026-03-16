# How we use Liveblocks

## Overview

We use Liveblocks for undo/redo and for user collaboration. Undo/redo does not require the user to be authenticated. We use Liveblocks for free and do not persist any rooms on Liveblocks servers.

## Single-user undo/redo

We create a Liveblocks room for each project even when a single user is editing. The app auto-joins the room when a project is loaded (via `ensureProjectRoom`). Room ID is `project-{projectId}`. The same room is used for single-user editing and multiplayer collaboration.

**Includes:** Project edits (stack changes, sample edits, pack settings, arrangement).

**Excludes:** Presence (follow/listen), transport state (play/stop), UI-only state.

## Storage sync

Project edits are persisted to room storage (`projectJson` on the root LiveObject). When storage changes (from local edits, undo/redo, or remote users), `useRoomStorageSync` subscribes to the root and hydrates the Zustand stores. A short ignore window after local persist avoids re-hydrating from our own writes.

## Hotkeys

- **Mod+Z** – Undo
- **Mod+Shift+Z** – Redo

Wired via `GlobalHotkeys` and Tanstack hotkeys. Buttons in the header via `UndoRedoButtons`.

## Multiplayer collaborative editing

When there is more than one user in a Liveblocks room, edits are visible to all users in that room.

## Liveblocks presence integration

When connected to a room, there is a row of user icons in the header. Each user pill/avatar should support:

- avatar
- name
- status dot
- "editing now" flash – when the user makes an edit, flash their icon if the current user isn't following them
- follow button
- listen button
- dropdown for recent edits
- show who they are following

A room shares a single project document. Each avatar should support a talk bubble for chat. When they make an edit we can pop up their edit in their chat bubble. (In the future we will transcribe voice chat.)

## Collaborative editing and sample files

When in a room, we can't make local edits using the System File Access API. If the user drags a local file into a stack block, the file has to be uploaded. When other users pick up the edit they have to download the file.

## Matchmaking

A room requires a project with a name before the room can be created. The room uses the project ID in its room name (`project-{projectId}`). The user can see a list of public rooms in global mode in the "Rooms" tab. The Rooms tab has a badge that shows the number of public rooms available.
