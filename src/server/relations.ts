import { nanoid } from "nanoid";
import { getDb } from "./db";
import { nowUnix } from "@/lib/utils";
import type { Relation, RelationType, EntityType } from "./types";

export function createRelation(data: {
  source_type: EntityType;
  source_id: string;
  target_type: EntityType;
  target_id: string;
  relation_type: RelationType;
  metadata_json?: string;
}): Relation {
  const db = getDb();
  const id = nanoid();
  const now = nowUnix();

  db.prepare(
    `INSERT OR IGNORE INTO relations (id, source_type, source_id, target_type, target_id, relation_type, metadata_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, data.source_type, data.source_id, data.target_type, data.target_id, data.relation_type, data.metadata_json ?? null, now);

  return db.prepare(
    "SELECT * FROM relations WHERE source_type = ? AND source_id = ? AND target_type = ? AND target_id = ? AND relation_type = ?",
  ).get(data.source_type, data.source_id, data.target_type, data.target_id, data.relation_type) as Relation;
}

export function getRelationsFrom(sourceType: EntityType, sourceId: string, relationType?: RelationType): Relation[] {
  const db = getDb();
  if (relationType) {
    return db
      .prepare("SELECT * FROM relations WHERE source_type = ? AND source_id = ? AND relation_type = ? ORDER BY created_at")
      .all(sourceType, sourceId, relationType) as Relation[];
  }
  return db
    .prepare("SELECT * FROM relations WHERE source_type = ? AND source_id = ? ORDER BY created_at")
    .all(sourceType, sourceId) as Relation[];
}

export function getRelationsTo(targetType: EntityType, targetId: string, relationType?: RelationType): Relation[] {
  const db = getDb();
  if (relationType) {
    return db
      .prepare("SELECT * FROM relations WHERE target_type = ? AND target_id = ? AND relation_type = ? ORDER BY created_at")
      .all(targetType, targetId, relationType) as Relation[];
  }
  return db
    .prepare("SELECT * FROM relations WHERE target_type = ? AND target_id = ? ORDER BY created_at")
    .all(targetType, targetId) as Relation[];
}

export interface TraversalResult {
  entity_type: EntityType;
  entity_id: string;
  relation_type: RelationType;
  depth: number;
}

export function traverseRelations(
  entityType: EntityType,
  entityId: string,
  maxDepth: number = 1,
  relationType?: RelationType,
): TraversalResult[] {
  const results: TraversalResult[] = [];
  const visited = new Set<string>();
  visited.add(`${entityType}:${entityId}`);

  function visit(type: EntityType, id: string, depth: number) {
    if (depth > maxDepth) return;

    const outgoing = getRelationsFrom(type, id, relationType);
    for (const rel of outgoing) {
      const key = `${rel.target_type}:${rel.target_id}`;
      if (!visited.has(key)) {
        visited.add(key);
        results.push({
          entity_type: rel.target_type,
          entity_id: rel.target_id,
          relation_type: rel.relation_type,
          depth,
        });
        visit(rel.target_type, rel.target_id, depth + 1);
      }
    }

    const incoming = getRelationsTo(type, id, relationType);
    for (const rel of incoming) {
      const key = `${rel.source_type}:${rel.source_id}`;
      if (!visited.has(key)) {
        visited.add(key);
        results.push({
          entity_type: rel.source_type,
          entity_id: rel.source_id,
          relation_type: rel.relation_type,
          depth,
        });
        visit(rel.source_type, rel.source_id, depth + 1);
      }
    }
  }

  visit(entityType, entityId, 1);
  return results;
}

export function deleteRelation(id: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM relations WHERE id = ?").run(id);
  return result.changes > 0;
}
