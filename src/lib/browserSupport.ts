export function hasDirectoryPickerSupport(): boolean {
  if (typeof window === "undefined") return true;
  const win = window as any;
  return (
    typeof win.showDirectoryPicker === "function" ||
    typeof win.chooseFileSystemEntries === "function" ||
    typeof win.__octacardPickDirectory === "function"
  );
}
