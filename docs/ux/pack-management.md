# Pack Management

## Delete Pack from Server

### UI

- A trash can button in the create/edit pack menu deletes the pack from the server.
- Only available when editing an existing pack (not when creating a new one).

### Business Rules

1. **Private only**: Only private packs can be deleted. Public packs must be made private first.
2. **No other purchasers**: A pack cannot be deleted if any of its samples have been purchased (added to collection) by users other than the creator. This protects buyers who have paid for content.

### Error Messages

- **Public pack**: "This pack must be private before it can be deleted. Make it private first, then try again."
- **Other purchasers**: "This pack cannot be deleted because other users have purchased samples from it."

### Side Effects

- Deleting a pack from the server also deletes all of its files from S3.
- Samples that are exclusively in this pack (not referenced by any other pack) are removed from storage and the database.
- Child packs are cascade-deleted with the parent.
