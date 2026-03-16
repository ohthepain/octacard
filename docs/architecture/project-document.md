# The Project Document

The client always has one project document open.
If the user doesn't create a project then an empty project is created by default.
The project document contains a tempo, the stack, and all of the sample edits (loop and splice points, tempo), and format settings (sample format)
The user can always create a new project to start fresh. A new project will always copy the sample format from the previous project.

## Undo/redo

We support undo/redo via liveblocks, even when the user is working alone. See ./liveblocks-integration.md

## Samples

Support platforms with no access to filesystem
How do we work without filesystem on non-Chromium platforms where this is no File System Access API? The user has to upload their files to get them into indexedDB. From there we can put them into the wave editor and stack blocks. Do we have to upload the files?
Use cases:

- Open file into waveeditor
- Open file into stack block
- Edit file
- Export file with regions using original filename
- Export sections of file using original filename with numbers appended
- Export pack
- Create and edit pack
- Don’t boot any files out of indexedDB

For platforms that don’t support the file system, the left filepane is probably always in global mode. But since we also have the cache we can have local mode focused on a ‘temp’ folder, which we will call ‘Temp Files’. We can support packs in ‘Temp Files’

Support platforms with no access to filesystem 2 - collaboration and undo/redo
Problems to solve:

1. User can export the pack the way they want it. So I think we need to introduce the concept of a ‘project’ document. Project document contains the samples, splice points, loop points, and information regarding how to export a pack. There can be multiple packs exported from a single project, for example free and paid packs. A project also contains stacks, which can also be imported as part of the pack. The project has ‘pack settings’ which determine how to export each pack.

- sample file references
- tempo / time signature
- stack blocks and their placements
- Sample loop points and splice points
- clip placements
- volumes / pan / mute / solo
- arrangement metadata
- shared transport defaults
- project-level metadata

1. The user can keep their source material
2. A project can exist in indexedDB
3. A project supports mobile devices and browsers with no File System Access API
4. A project stores loop length, tempo etc for each sample
5. A project can be public or private
6. A project can be ‘locked’ in indexedDB so that it doesn’t get lost
7. The most recent project is auto-loaded
8. A project has a name
