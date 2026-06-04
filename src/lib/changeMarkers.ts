export interface ChangeMarker {
  from: number;
  to: number;
  deleted: string;
  inserted: string;
}

const MARKER_RE = /<!--\s*([\s\S]*?)\s*\/\s*([\s\S]*?)\s*-->/g;

export function parseChangeMarkers(doc: string): ChangeMarker[] {
  const markers: ChangeMarker[] = [];
  let match;
  while ((match = MARKER_RE.exec(doc)) !== null) {
    markers.push({
      from: match.index,
      to: match.index + match[0].length,
      deleted: match[1].trim(),
      inserted: match[2].trim(),
    });
  }
  MARKER_RE.lastIndex = 0;
  return markers;
}

export function acceptChange(doc: string, marker: ChangeMarker): string {
  return doc.slice(0, marker.from) + marker.inserted + doc.slice(marker.to);
}

export function rejectChange(doc: string, marker: ChangeMarker): string {
  return doc.slice(0, marker.from) + marker.deleted + doc.slice(marker.to);
}

export function acceptAllChanges(doc: string): string {
  return doc.replace(MARKER_RE, (_match, _deleted: string, inserted: string) => inserted.trim());
}

export function rejectAllChanges(doc: string): string {
  return doc.replace(MARKER_RE, (_match, deleted: string) => deleted.trim());
}

export function countChanges(doc: string): number {
  return parseChangeMarkers(doc).length;
}
