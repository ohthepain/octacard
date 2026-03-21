# Sample Packs

Sample packs are a popular way to download sample files from services like Splice and Loopmasters.

Octacard exports sample data as packs.

## Use Cases

As a user I can

- view a list of sample packs created by users under 'GLOBAL PACKS'.
- tap on a sample pack in the list under 'GLOBAL PACKS' and see the folders and samples in the pack.
- tap on a sample pack in the list under 'GLOBAL PACKS' and see the folders and samples in the pack.

As a pack creator I can

- Open a project that has 'source' sample files in it. The source sample file may or may not have regions defined.
- define sample packs within that project
- open a sample pack so that i can see it's contents in the right pane (filepane, or similar)
- define a folders and subfolders structure within sample pack
- add regions from the 'source' sample files to a sample pack via drag-and-drop
- publish the sample pack to GLOBAL PACKS so that other users can see the packs

As a user, when I publish a pack

- The sample pack is moved to an 'exported packs' list in the project.
- The user cannot edit an exported pack. The user must create a new version.

# Sample Metadata

The sample data in a sample file is identified by a hash. This is so that we know when a sample has been copied.

A pack can have its own sample metadata that is separate from the sample file.

Sample metadata can be stored in the project or the pack. When a sample is dragged into a pack the sample metadata is copied.

Two versions of a pack can have different sample metadata, and the old metadata can be saved and versioned.

When a sample is dragged from local into a sample pack, the pack gets a reference to the sample data and a reference to the sample metadata. When the sample is edited within the pack, the pack metadata is separate from the original sample metadata.
