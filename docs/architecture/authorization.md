# authorization

## Logged-out functionality

The following operations are allowed when the user is not logged in:

- Create stack, play samples, create pack, create project
- Search server for packs and samples, download free packs and samples
- Edit stack
- Audition samples, even if they are not free
- Drag sample into stack, even if the sample is not free
- See available livebox rooms, Enter a liveblocks "room", follow a user, play the project

## Public API endpoints (no auth required)

- `GET /api/library/search` – scope `all` or `explore` (scope `mine` requires auth)
- `GET /api/library/samples/:id/download` – for audition (sample must be in a public pack)
