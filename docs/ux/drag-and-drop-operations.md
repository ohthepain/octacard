# Drag-and-drop operations

## Drag and drop operations from global packs

### Onto local folder

If the user drops a global sample pack onto a local folder, the pack is downloaded into the local folder. The audition cache is checked first for each sample—if the user has already auditioned a sample, the cached blob is used instead of re-downloading.

### Onto stack area

If the user drops a global sample pack onto the stack area, up to 8 samples from the pack are added to the stack blocks. Samples are loaded from the audition cache on demand for playback.

## Drag and drop operations from global sample files

### Drop global sample files onto local pack (folder that is a pack)

If the user drops a global sample onto a local pack, this will begin editing the pack. It will warn: "Do you want to edit this pack?" If the user confirms, the pack opens in PackView in edit mode, the sample is downloaded into the local pack folder and added to the pack.

### Drop global sample files onto local folders (folders that are not packs)

If the user drops a global sample onto a local folder, the sample is downloaded into the local folder.

## Drag local file onto local pack in the Pack Editor

The local file is added to the local pack. It appears in the Pack Editor and is added to the pack.

It will have the same name in the pack.

If the local file is dropped on the section "Drag samples from the stack or Temp Files here to add them to the pack." then the file is added to the root of the local pack.

If the local file is dropped onto a folder row in the Pack Editor, the file is added under that folder. If it is dropped on the root list area (or on a sample that already lives at pack root), it is added at pack root.

**How this maps to the database (not `PackSample`):** Project local packs use **`ProjectPack`**, **`ProjectPackFolder`**, and **`ProjectPackEntry`** (`prisma/schema.prisma`). Each row in **`ProjectPackEntry`** is one sample slot in the pack: `displayName`, `sourceRef` (where to read the audio—local virtual path, `temp://…`, `remote://…`, etc.), and optional **`folderId`**. Set **`folderId`** to the id of a **`ProjectPackFolder`** to place the entry inside that folder; use **`null`** for the pack root. The global **`PackSample`** model ties published **`Pack`** records to content-addressed **`Sample`** rows and is unrelated to editing a **project** local pack structure.
