# Drag-and-drop operations

## Drag and drop operations on global packs

### Onto local folder

If the user drops a global sample pack onto a local folder, the pack is downloaded into the local folder. The audition cache is checked first for each sample—if the user has already auditioned a sample, the cached blob is used instead of re-downloading.

### Onto stack area

If the user drops a global sample pack onto the stack area, up to 8 samples from the pack are added to the stack blocks. Samples are loaded from the audition cache on demand for playback.

## Drag and drop operations on global sample files

### Drop onto local pack (folder that is a pack)

If the user drops a global sample onto a local pack, this will begin editing the pack. It will warn: "Do you want to edit this pack?" If the user confirms, the pack opens in PackView in edit mode, the sample is downloaded into the local pack folder and added to the pack.

### Drop onto local folders (folders that are not packs)

If the user drops a global sample onto a local folder, the sample is downloaded into the local folder.
