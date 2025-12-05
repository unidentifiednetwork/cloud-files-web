export const INTERNAL_DRAG_TYPE = "application/x-fileids";

export function dragTypesInclude(dataTransfer: DataTransfer, type: string): boolean {
  const { types } = dataTransfer;
  if (!types || types.length === 0) return false;
  for (let i = 0; i < types.length; i++) {
    if (types[i] === type) return true;
  }
  return false;
}

export function isInternalDrag(dataTransfer: DataTransfer): boolean {
  if (dragTypesInclude(dataTransfer, INTERNAL_DRAG_TYPE)) return true;
  const hasFiles = dragTypesInclude(dataTransfer, "Files");
  const hasTextPlain = dragTypesInclude(dataTransfer, "text/plain");
  return !hasFiles && hasTextPlain;
}
