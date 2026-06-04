import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Schema version tracking
    -- =======================================================================
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  const currentVersion =
    (db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null })?.v ?? 0;

  if (currentVersion < 1) migrateV1(db);
  if (currentVersion < 2) migrateV2(db);
  if (currentVersion < 3) migrateV3(db);
  if (currentVersion < 4) migrateV4(db);
  if (currentVersion < 5) migrateV5(db);
  if (currentVersion < 6) migrateV6(db);
  if (currentVersion < 7) migrateV7(db);
  if (currentVersion < 8) migrateV8(db);
  if (currentVersion < 9) migrateV9(db);
  if (currentVersion < 10) migrateV10(db);
  if (currentVersion < 11) migrateV11(db);
  if (currentVersion < 12) migrateV12(db);
  if (currentVersion < 13) migrateV13(db);
  if (currentVersion < 14) migrateV14(db);
  if (currentVersion < 15) migrateV15(db);
  if (currentVersion < 16) migrateV16(db);
  if (currentVersion < 17) migrateV17(db);
  if (currentVersion < 18) migrateV18(db);
  if (currentVersion < 19) migrateV19(db);
  if (currentVersion < 20) migrateV20(db);
  if (currentVersion < 21) migrateV21(db);
}

function migrateV21(db: Database.Database): void {
  // ===================================================================
  // Widen studies.mode to admit the interventional (AI-intervention
  // trial) mode, and let a readiness check be bound to a study so the
  // readiness-compare pass can diff a manuscript against the study's
  // compiled protocol/SAP/checklist.
  //
  // studies.mode carries a CHECK constraint, which SQLite cannot ALTER
  // in place — so the table is rebuilt with the widened CHECK using the
  // same foreign_keys=OFF + transaction + rename idiom as V19. studies
  // has no secondary indexes, so none need recreating. readiness_checks
  // only gains a nullable column, which ADD COLUMN handles directly.
  // ===================================================================
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS studies_v21;
        CREATE TABLE studies_v21 (
          id                    TEXT PRIMARY KEY,
          title                 TEXT NOT NULL,
          mode                  TEXT NOT NULL
                                  CHECK (mode IN ('systematic_review','retrospective_observational','interventional')),
          research_question     TEXT,
          confidentiality_mode  TEXT NOT NULL DEFAULT 'cloud_default'
                                  CHECK (confidentiality_mode IN ('cloud_default','local_only')),
          cloud_consent_at      INTEGER,
          status                TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','active','archived')),
          created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO studies_v21
          (id, title, mode, research_question, confidentiality_mode,
           cloud_consent_at, status, created_at, updated_at)
        SELECT id, title, mode, research_question, confidentiality_mode,
               cloud_consent_at, status, created_at, updated_at
        FROM studies;
        DROP TABLE studies;
        ALTER TABLE studies_v21 RENAME TO studies;

        ALTER TABLE readiness_checks
          ADD COLUMN study_id TEXT REFERENCES studies(id) ON DELETE SET NULL;

        INSERT INTO schema_version (version) VALUES (21);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV20(db: Database.Database): void {
  // Agent-proposed options for a single decision card (card_proposal pass).
  // Ephemeral-ish: replaced each time a new proposal runs for that card.
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_proposal_options (
      id                TEXT PRIMARY KEY,
      study_id          TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
      card_type         TEXT NOT NULL,
      session_id        TEXT,
      label             TEXT NOT NULL,
      value_suggestion  TEXT,
      consequence_md    TEXT,
      created_at        INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_card_proposal_options
      ON card_proposal_options(study_id, card_type, created_at);
    INSERT INTO schema_version (version) VALUES (20);
  `);
}

function migrateV19(db: Database.Database): void {
  // ===================================================================
  // Strip the dangling foreign keys to the (now-dropped) protocols table
  // from the two surviving tables that referenced it. Earlier builds of
  // V18 dropped protocols without rebuilding these, leaving sessions /
  // readiness_checks with FKs to a missing table — which makes every
  // INSERT fail with "no such table: main.protocols". This rebuild is
  // idempotent: it recreates both tables without the protocol FK.
  // ===================================================================
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS sessions_v19;
        CREATE TABLE sessions_v19 (
          id                  TEXT PRIMARY KEY,
          manuscript_id       TEXT REFERENCES manuscripts(id) ON DELETE SET NULL,
          protocol_id         TEXT,
          study_id            TEXT REFERENCES studies(id) ON DELETE SET NULL,
          workflow            TEXT NOT NULL CHECK (workflow IN ('revision','review','manuscript','methods')),
          mode                TEXT,
          provider            TEXT NOT NULL CHECK (provider IN ('openai','gemini','deepseek','ollama','lmstudio','llama_server')),
          model               TEXT,
          effort              TEXT CHECK (effort IN ('low','medium','high','xhigh','max')),
          provider_session_id TEXT,
          status              TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','running','idle','awaiting_user','completed','crashed')),
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO sessions_v19
          (id, manuscript_id, protocol_id, study_id, workflow, mode, provider,
           model, effort, provider_session_id, status, created_at, updated_at)
        SELECT id, manuscript_id, protocol_id, study_id, workflow, mode, provider,
               model, effort, provider_session_id, status, created_at, updated_at
        FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_v19 RENAME TO sessions;
        CREATE INDEX IF NOT EXISTS idx_sessions_manuscript_workflow
          ON sessions(manuscript_id, workflow, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_protocol_workflow
          ON sessions(protocol_id, workflow, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_study_workflow
          ON sessions(study_id, workflow, updated_at);

        DROP TABLE IF EXISTS readiness_checks_v19;
        CREATE TABLE readiness_checks_v19 (
          id                        TEXT PRIMARY KEY,
          manuscript_id             TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
          protocol_id               TEXT,
          session_id                TEXT,
          status                    TEXT NOT NULL DEFAULT 'running'
                                      CHECK (status IN ('running','completed','failed')),
          overall_score             INTEGER,
          summary_md                TEXT,
          effective_confidentiality TEXT NOT NULL DEFAULT 'cloud_default'
                                      CHECK (effective_confidentiality IN ('cloud_default','local_only')),
          created_at                INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at                INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO readiness_checks_v19
          (id, manuscript_id, protocol_id, session_id, status, overall_score,
           summary_md, effective_confidentiality, created_at, updated_at)
        SELECT id, manuscript_id, protocol_id, session_id, status, overall_score,
               summary_md, effective_confidentiality, created_at, updated_at
        FROM readiness_checks;
        DROP TABLE readiness_checks;
        ALTER TABLE readiness_checks_v19 RENAME TO readiness_checks;
        CREATE INDEX IF NOT EXISTS idx_readiness_checks_manuscript
          ON readiness_checks(manuscript_id, updated_at);

        INSERT INTO schema_version (version) VALUES (19);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV18(db: Database.Database): void {
  // ===================================================================
  // Retire the document-centric protocol model. The Methods Workbench
  // is now the StudyDesignState workspace (migrate V17); the protocol
  // document tables, audits, SAP drafts, and data dictionaries are dead.
  //
  // Kept: reporting_checklists (manuscript subject), readiness_checks,
  // reviewer_responses — all manuscript-stage features. sessions.protocol_id
  // and the 'protocol*' relation/CHECK values are left in place (nullable /
  // unused) to avoid another table rebuild.
  // ===================================================================
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        -- Rebuild the two surviving tables that referenced protocols so their
        -- foreign keys no longer point at a table we are about to drop.
        -- protocol_id is kept as a plain (now unused) column.
        DROP TABLE IF EXISTS sessions_v18;
        CREATE TABLE sessions_v18 (
          id                  TEXT PRIMARY KEY,
          manuscript_id       TEXT REFERENCES manuscripts(id) ON DELETE SET NULL,
          protocol_id         TEXT,
          study_id            TEXT REFERENCES studies(id) ON DELETE SET NULL,
          workflow            TEXT NOT NULL CHECK (workflow IN ('revision','review','manuscript','methods')),
          mode                TEXT,
          provider            TEXT NOT NULL CHECK (provider IN ('openai','gemini','deepseek','ollama','lmstudio','llama_server')),
          model               TEXT,
          effort              TEXT CHECK (effort IN ('low','medium','high','xhigh','max')),
          provider_session_id TEXT,
          status              TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','running','idle','awaiting_user','completed','crashed')),
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO sessions_v18
          (id, manuscript_id, protocol_id, study_id, workflow, mode, provider,
           model, effort, provider_session_id, status, created_at, updated_at)
        SELECT id, manuscript_id, protocol_id, study_id, workflow, mode, provider,
               model, effort, provider_session_id, status, created_at, updated_at
        FROM sessions;
        DROP TABLE sessions;
        ALTER TABLE sessions_v18 RENAME TO sessions;
        CREATE INDEX IF NOT EXISTS idx_sessions_manuscript_workflow
          ON sessions(manuscript_id, workflow, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_protocol_workflow
          ON sessions(protocol_id, workflow, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_study_workflow
          ON sessions(study_id, workflow, updated_at);

        DROP TABLE IF EXISTS readiness_checks_v18;
        CREATE TABLE readiness_checks_v18 (
          id                        TEXT PRIMARY KEY,
          manuscript_id             TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
          protocol_id               TEXT,
          session_id                TEXT,
          status                    TEXT NOT NULL DEFAULT 'running'
                                      CHECK (status IN ('running','completed','failed')),
          overall_score             INTEGER,
          summary_md                TEXT,
          effective_confidentiality TEXT NOT NULL DEFAULT 'cloud_default'
                                      CHECK (effective_confidentiality IN ('cloud_default','local_only')),
          created_at                INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at                INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO readiness_checks_v18
          (id, manuscript_id, protocol_id, session_id, status, overall_score,
           summary_md, effective_confidentiality, created_at, updated_at)
        SELECT id, manuscript_id, protocol_id, session_id, status, overall_score,
               summary_md, effective_confidentiality, created_at, updated_at
        FROM readiness_checks;
        DROP TABLE readiness_checks;
        ALTER TABLE readiness_checks_v18 RENAME TO readiness_checks;
        CREATE INDEX IF NOT EXISTS idx_readiness_checks_manuscript
          ON readiness_checks(manuscript_id, updated_at);

        DROP TRIGGER IF EXISTS protocols_ai;
        DROP TRIGGER IF EXISTS protocols_ad;
        DROP TRIGGER IF EXISTS protocols_au;
        DROP TRIGGER IF EXISTS protocol_assets_ai;
        DROP TRIGGER IF EXISTS protocol_assets_ad;
        DROP TRIGGER IF EXISTS protocol_assets_au;
        DROP TRIGGER IF EXISTS sap_drafts_ai;
        DROP TRIGGER IF EXISTS sap_drafts_ad;
        DROP TRIGGER IF EXISTS sap_drafts_au;

        DROP TABLE IF EXISTS protocols_fts;
        DROP TABLE IF EXISTS protocol_assets_fts;
        DROP TABLE IF EXISTS sap_drafts_fts;

        DROP TABLE IF EXISTS data_dictionary_fields;
        DROP TABLE IF EXISTS data_dictionaries;
        DROP TABLE IF EXISTS sap_drafts;
        DROP TABLE IF EXISTS protocol_audit_items;
        DROP TABLE IF EXISTS protocol_audits;
        DROP TABLE IF EXISTS protocol_assets;
        DROP TABLE IF EXISTS protocol_versions;
        DROP TABLE IF EXISTS protocols;

        INSERT INTO schema_version (version) VALUES (18);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV17(db: Database.Database): void {
  // ===================================================================
  // Methods Workbench v2 — pre-document study-design workspace.
  //
  // Replaces the document-centric protocol model (protocols.content_md +
  // audit/sap/dictionary/checklist as document scanners) with a
  // StudyDesignState: a study made of decision cards, evidence imported
  // from MDR/RW snapshots, deterministic + agent preflight findings, and
  // artifacts compiled from cards at the end.
  //
  // card_type and artifact section keys are free-text (no CHECK) so new
  // card types / study modes are data in cardSchema.ts, not migrations —
  // same rationale as the free-text session `mode`.
  //
  // The legacy protocol tables from V16 are intentionally left in place
  // (the old UI/routes are removed in app code); they are inert once the
  // /api/protocols surface is gone, and dropping them is deferred to a
  // later cleanup migration to keep this one reversible-by-ignore.
  // ===================================================================
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        -- =============================================================
        -- Studies — the pre-document design state (peer of manuscripts)
        -- =============================================================
        CREATE TABLE IF NOT EXISTS studies (
          id                    TEXT PRIMARY KEY,
          title                 TEXT NOT NULL,
          mode                  TEXT NOT NULL
                                  CHECK (mode IN ('systematic_review','retrospective_observational')),
          research_question     TEXT,
          confidentiality_mode  TEXT NOT NULL DEFAULT 'cloud_default'
                                  CHECK (confidentiality_mode IN ('cloud_default','local_only')),
          cloud_consent_at      INTEGER,
          status                TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','active','archived')),
          created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
        );

        -- =============================================================
        -- Decision cards — one row per methodological decision
        -- =============================================================
        CREATE TABLE IF NOT EXISTS design_decisions (
          id                TEXT PRIMARY KEY,
          study_id          TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
          card_type         TEXT NOT NULL,
          state             TEXT NOT NULL DEFAULT 'not_started'
                              CHECK (state IN (
                                'not_started','drafted','underspecified','conflicting',
                                'evidence_supported','needs_input','unknown','assumed','locked'
                              )),
          value_json        TEXT,
          open_question_md  TEXT,
          stale             INTEGER NOT NULL DEFAULT 0 CHECK (stale IN (0,1)),
          position          INTEGER NOT NULL DEFAULT 0,
          created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_design_decisions_unique
          ON design_decisions(study_id, card_type);
        CREATE INDEX IF NOT EXISTS idx_design_decisions_study
          ON design_decisions(study_id, position);

        -- =============================================================
        -- Evidence snapshots (verbatim MDR/RW import) + extracted items
        -- =============================================================
        CREATE TABLE IF NOT EXISTS evidence_snapshots (
          id            TEXT PRIMARY KEY,
          study_id      TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
          source        TEXT NOT NULL CHECK (source IN ('mdr','rw')),
          label         TEXT,
          raw_json      TEXT NOT NULL,
          report_md     TEXT,
          imported_at   INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_snapshots_study
          ON evidence_snapshots(study_id, imported_at);

        CREATE TABLE IF NOT EXISTS evidence_items (
          id              TEXT PRIMARY KEY,
          snapshot_id     TEXT NOT NULL REFERENCES evidence_snapshots(id) ON DELETE CASCADE,
          study_id        TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
          kind            TEXT NOT NULL CHECK (kind IN (
                            'prior_design','population','outcome','confounder',
                            'bias','measure','other'
                          )),
          label           TEXT NOT NULL,
          detail_md       TEXT,
          source_ref_json TEXT,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_evidence_items_study
          ON evidence_items(study_id, kind);

        CREATE TABLE IF NOT EXISTS decision_evidence_links (
          id                TEXT PRIMARY KEY,
          decision_id       TEXT NOT NULL REFERENCES design_decisions(id) ON DELETE CASCADE,
          evidence_item_id  TEXT NOT NULL REFERENCES evidence_items(id) ON DELETE CASCADE,
          note              TEXT,
          created_at        INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_decision_evidence_unique
          ON decision_evidence_links(decision_id, evidence_item_id);

        -- =============================================================
        -- Decision log — append-only rationale trail
        -- =============================================================
        CREATE TABLE IF NOT EXISTS decision_log (
          id                        TEXT PRIMARY KEY,
          study_id                  TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
          decision_id               TEXT REFERENCES design_decisions(id) ON DELETE SET NULL,
          card_type                 TEXT,
          action                    TEXT NOT NULL
                                      CHECK (action IN ('set','changed','locked','unlocked','cleared')),
          decision_md               TEXT,
          reason_md                 TEXT,
          rejected_alternatives_md  TEXT,
          open_concern_md           TEXT,
          evidence_ids_json         TEXT,
          created_at                INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_decision_log_study
          ON decision_log(study_id, created_at);

        -- =============================================================
        -- Preflight findings — persisted agent-produced findings only.
        -- Deterministic completeness/consistency are computed live and
        -- never stored (so they are always fresh and cost no LLM calls).
        -- =============================================================
        CREATE TABLE IF NOT EXISTS preflight_findings (
          id            TEXT PRIMARY KEY,
          study_id      TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
          session_id    TEXT,
          layer         TEXT NOT NULL CHECK (layer IN ('completeness','consistency','risk')),
          severity      TEXT NOT NULL CHECK (severity IN ('blocking','important','minor')),
          card_type     TEXT,
          title         TEXT NOT NULL,
          detail_md     TEXT,
          status        TEXT NOT NULL DEFAULT 'open'
                          CHECK (status IN ('open','resolved','dismissed')),
          created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_preflight_findings_study
          ON preflight_findings(study_id, status);

        -- =============================================================
        -- Compiled artifacts — one row per (study, kind)
        -- =============================================================
        CREATE TABLE IF NOT EXISTS study_artifacts (
          id              TEXT PRIMARY KEY,
          study_id        TEXT NOT NULL REFERENCES studies(id) ON DELETE CASCADE,
          kind            TEXT NOT NULL CHECK (kind IN (
                            'protocol','sap','data_dictionary','checklist_map','prospero_fields'
                          )),
          compiled_json   TEXT,
          override_md     TEXT,
          ready_pct       INTEGER NOT NULL DEFAULT 0,
          updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_study_artifacts_unique
          ON study_artifacts(study_id, kind);

        -- =============================================================
        -- FTS5 for agent-side search over studies + extracted evidence
        -- =============================================================
        CREATE VIRTUAL TABLE IF NOT EXISTS studies_fts USING fts5(
          title, research_question,
          content='studies', content_rowid='rowid', tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS studies_ai AFTER INSERT ON studies BEGIN
          INSERT INTO studies_fts(rowid, title, research_question)
            VALUES (NEW.rowid, NEW.title, COALESCE(NEW.research_question, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS studies_ad AFTER DELETE ON studies BEGIN
          INSERT INTO studies_fts(studies_fts, rowid, title, research_question)
            VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.research_question, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS studies_au AFTER UPDATE ON studies BEGIN
          INSERT INTO studies_fts(studies_fts, rowid, title, research_question)
            VALUES ('delete', OLD.rowid, OLD.title, COALESCE(OLD.research_question, ''));
          INSERT INTO studies_fts(rowid, title, research_question)
            VALUES (NEW.rowid, NEW.title, COALESCE(NEW.research_question, ''));
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS evidence_items_fts USING fts5(
          label, detail_md,
          content='evidence_items', content_rowid='rowid', tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS evidence_items_ai AFTER INSERT ON evidence_items BEGIN
          INSERT INTO evidence_items_fts(rowid, label, detail_md)
            VALUES (NEW.rowid, NEW.label, COALESCE(NEW.detail_md, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS evidence_items_ad AFTER DELETE ON evidence_items BEGIN
          INSERT INTO evidence_items_fts(evidence_items_fts, rowid, label, detail_md)
            VALUES ('delete', OLD.rowid, OLD.label, COALESCE(OLD.detail_md, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS evidence_items_au AFTER UPDATE ON evidence_items BEGIN
          INSERT INTO evidence_items_fts(evidence_items_fts, rowid, label, detail_md)
            VALUES ('delete', OLD.rowid, OLD.label, COALESCE(OLD.detail_md, ''));
          INSERT INTO evidence_items_fts(rowid, label, detail_md)
            VALUES (NEW.rowid, NEW.label, COALESCE(NEW.detail_md, ''));
        END;

        -- =============================================================
        -- sessions.study_id pointer for forked methods (workflow='methods')
        -- =============================================================
        ALTER TABLE sessions ADD COLUMN study_id TEXT REFERENCES studies(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_sessions_study_workflow
          ON sessions(study_id, workflow, updated_at);

        -- =============================================================
        -- Relations rebuild: add study-workspace entity + relation types
        -- =============================================================
        DROP TABLE IF EXISTS relations_v17;
        CREATE TABLE relations_v17 (
          id              TEXT PRIMARY KEY,
          source_type     TEXT NOT NULL
                            CHECK (source_type IN (
                              'manuscript','commentary','revision','review','article_ref',
                              'protocol','protocol_audit','readiness_check','reviewer_response','reporting_checklist',
                              'study','design_decision','evidence_snapshot','evidence_item','study_artifact'
                            )),
          source_id       TEXT NOT NULL,
          target_type     TEXT NOT NULL
                            CHECK (target_type IN (
                              'manuscript','commentary','revision','review','article_ref',
                              'protocol','protocol_audit','readiness_check','reviewer_response','reporting_checklist',
                              'study','design_decision','evidence_snapshot','evidence_item','study_artifact'
                            )),
          target_id       TEXT NOT NULL,
          relation_type   TEXT NOT NULL
                            CHECK (relation_type IN (
                              'responds_to','revises','references','cited_by','supports','contradicts',
                              'reports','reported_by','has_readiness_check','has_reviewer_response',
                              'has_audit','has_sap','has_data_dictionary','follows_guideline',
                              'has_decision','has_evidence_snapshot','has_evidence_item',
                              'evidence_supports','derived_from','has_artifact','depends_on'
                            )),
          metadata_json   TEXT,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        INSERT INTO relations_v17
          (id, source_type, source_id, target_type, target_id, relation_type, metadata_json, created_at)
        SELECT id, source_type, source_id, target_type, target_id, relation_type, metadata_json, created_at
        FROM relations;
        DROP TABLE relations;
        ALTER TABLE relations_v17 RENAME TO relations;
        CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_type, target_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_dedup
          ON relations(source_type, source_id, target_type, target_id, relation_type);

        INSERT INTO schema_version (version) VALUES (17);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV16(db: Database.Database): void {
  // ===================================================================
  // Methods Workbench layer.
  //
  // Protocols are study artifacts that live upstream of manuscripts:
  // the prospective counterpart to the existing reviewer-agent. Same
  // file/version/asset shape as manuscripts, plus deterministic-audit
  // tables modeled after outside_reference_audit_items, plus structured
  // SAP and data-dictionary tables, plus polymorphic reporting-checklist
  // tables that can target either a protocol or a manuscript. Readiness
  // checks and reviewer-response drafts hang off manuscripts and link
  // back to a protocol via the relations table when one exists.
  //
  // Confidentiality default is 'cloud_default' (per-protocol toggle),
  // unlike outside_manuscripts which defaults to local_only.
  //
  // Sessions are rebuilt to widen the workflow CHECK to include
  // 'methods' and to add a nullable protocol_id pointer so methods
  // sessions can attach to a protocol instead of (or in addition to)
  // a manuscript. mode stays free-text — modes for this layer include
  // 'protocol_build', 'protocol_audit', 'sap', 'data_dictionary',
  // 'reporting_checklist', 'readiness', 'reviewer_response'.
  // ===================================================================

  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        -- =============================================================
        -- Protocols (peer of manuscripts)
        -- =============================================================
        CREATE TABLE IF NOT EXISTS protocols (
          id                    TEXT PRIMARY KEY,
          title                 TEXT NOT NULL,
          content_md            TEXT NOT NULL,
          original_content_md   TEXT,
          original_file         TEXT,
          file_format           TEXT,
          study_design          TEXT,
          phase                 TEXT NOT NULL DEFAULT 'drafting'
                                  CHECK (phase IN ('drafting','registered','active','closed')),
          confidentiality_mode  TEXT NOT NULL DEFAULT 'cloud_default'
                                  CHECK (confidentiality_mode IN ('cloud_default','local_only')),
          cloud_consent_at      INTEGER,
          project_root          TEXT,
          primary_file          TEXT,
          is_git                INTEGER NOT NULL DEFAULT 0 CHECK (is_git IN (0,1)),
          journal_type          TEXT,
          research_domain       TEXT,
          status                TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','active','archived')),
          created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS protocol_versions (
          id              TEXT PRIMARY KEY,
          protocol_id     TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
          version_number  INTEGER NOT NULL,
          label           TEXT,
          content_md      TEXT NOT NULL,
          source          TEXT NOT NULL
                            CHECK (source IN ('upload','agent_edit','user_edit')),
          session_id      TEXT,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_protocol_versions_unique
          ON protocol_versions(protocol_id, version_number);
        CREATE INDEX IF NOT EXISTS idx_protocol_versions_lookup
          ON protocol_versions(protocol_id, created_at);

        CREATE TABLE IF NOT EXISTS protocol_assets (
          id              TEXT PRIMARY KEY,
          protocol_id     TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
          kind            TEXT NOT NULL
                            CHECK (kind IN (
                              'sap','data_dictionary','crf','icf',
                              'irb_letter','registration','figure','table','other'
                            )),
          label           TEXT,
          original_file   TEXT NOT NULL,
          file_format     TEXT,
          content_md      TEXT NOT NULL,
          byte_size       INTEGER,
          version_number  INTEGER,
          position        INTEGER NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_protocol_assets_lookup
          ON protocol_assets(protocol_id, position);

        -- =============================================================
        -- Protocol audits
        -- =============================================================
        CREATE TABLE IF NOT EXISTS protocol_audits (
          id            TEXT PRIMARY KEY,
          protocol_id   TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
          session_id    TEXT,
          status        TEXT NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','completed','failed')),
          summary_md    TEXT,
          created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_protocol_audits_lookup
          ON protocol_audits(protocol_id, updated_at);

        CREATE TABLE IF NOT EXISTS protocol_audit_items (
          id                TEXT PRIMARY KEY,
          audit_id          TEXT NOT NULL REFERENCES protocol_audits(id) ON DELETE CASCADE,
          protocol_id       TEXT NOT NULL REFERENCES protocols(id) ON DELETE CASCADE,
          category          TEXT NOT NULL
                              CHECK (category IN (
                                'design','outcomes','sample_size','bias',
                                'statistics','ethics','reporting','other'
                              )),
          severity          TEXT CHECK (severity IN ('minor','major','critical')),
          section_ref       TEXT,
          quoted_text       TEXT,
          finding_md        TEXT NOT NULL,
          suggested_fix_md  TEXT,
          status            TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','accepted','dismissed')),
          auto_detected     INTEGER NOT NULL DEFAULT 0 CHECK (auto_detected IN (0,1)),
          created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_protocol_audit_items_lookup
          ON protocol_audit_items(audit_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_protocol_audit_items_protocol
          ON protocol_audit_items(protocol_id);

        -- =============================================================
        -- SAP and data dictionary
        -- =============================================================
        CREATE TABLE IF NOT EXISTS sap_drafts (
          id                    TEXT PRIMARY KEY,
          protocol_id           TEXT NOT NULL UNIQUE
                                  REFERENCES protocols(id) ON DELETE CASCADE,
          outcomes_json         TEXT,
          populations_json      TEXT,
          analysis_plan_md      TEXT,
          multiplicity_md       TEXT,
          missing_data_md       TEXT,
          interim_analyses_md   TEXT,
          software_json         TEXT,
          created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS data_dictionaries (
          id            TEXT PRIMARY KEY,
          protocol_id   TEXT NOT NULL UNIQUE
                          REFERENCES protocols(id) ON DELETE CASCADE,
          created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );

        CREATE TABLE IF NOT EXISTS data_dictionary_fields (
          id                   TEXT PRIMARY KEY,
          dictionary_id        TEXT NOT NULL REFERENCES data_dictionaries(id) ON DELETE CASCADE,
          position             INTEGER NOT NULL DEFAULT 0,
          field_name           TEXT NOT NULL,
          label                TEXT,
          data_type            TEXT NOT NULL DEFAULT 'text'
                                 CHECK (data_type IN ('int','real','text','date','categorical','boolean')),
          units                TEXT,
          allowed_values_json  TEXT,
          required             INTEGER NOT NULL DEFAULT 0 CHECK (required IN (0,1)),
          derivation_md        TEXT,
          notes_md             TEXT,
          created_at           INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at           INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_data_dictionary_fields_lookup
          ON data_dictionary_fields(dictionary_id, position);

        -- =============================================================
        -- Reporting checklists (polymorphic — protocol or manuscript)
        -- =============================================================
        CREATE TABLE IF NOT EXISTS reporting_checklists (
          id            TEXT PRIMARY KEY,
          subject_type  TEXT NOT NULL CHECK (subject_type IN ('protocol','manuscript')),
          subject_id    TEXT NOT NULL,
          guideline     TEXT NOT NULL
                          CHECK (guideline IN (
                            'PRISMA','PRISMA-P','STROBE','CONSORT','SPIRIT',
                            'STARD','TRIPOD','CARE','SRQR','COREQ','ARRIVE'
                          )),
          version       TEXT,
          created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_reporting_checklists_subject
          ON reporting_checklists(subject_type, subject_id);

        CREATE TABLE IF NOT EXISTS reporting_checklist_items (
          id              TEXT PRIMARY KEY,
          checklist_id    TEXT NOT NULL REFERENCES reporting_checklists(id) ON DELETE CASCADE,
          item_key        TEXT NOT NULL,
          section         TEXT,
          prompt          TEXT NOT NULL,
          required        INTEGER NOT NULL DEFAULT 1 CHECK (required IN (0,1)),
          status          TEXT NOT NULL DEFAULT 'unaddressed'
                            CHECK (status IN ('unaddressed','addressed','partial','na')),
          evidence_md     TEXT,
          location_ref    TEXT,
          auto_detected   INTEGER NOT NULL DEFAULT 0 CHECK (auto_detected IN (0,1)),
          position        INTEGER NOT NULL DEFAULT 0,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_reporting_checklist_items_checklist
          ON reporting_checklist_items(checklist_id, position);

        -- =============================================================
        -- Manuscript readiness checks
        -- =============================================================
        CREATE TABLE IF NOT EXISTS readiness_checks (
          id                        TEXT PRIMARY KEY,
          manuscript_id             TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
          protocol_id               TEXT REFERENCES protocols(id) ON DELETE SET NULL,
          session_id                TEXT,
          status                    TEXT NOT NULL DEFAULT 'running'
                                      CHECK (status IN ('running','completed','failed')),
          overall_score             INTEGER,
          summary_md                TEXT,
          effective_confidentiality TEXT NOT NULL DEFAULT 'cloud_default'
                                      CHECK (effective_confidentiality IN ('cloud_default','local_only')),
          created_at                INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at                INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_readiness_checks_manuscript
          ON readiness_checks(manuscript_id, updated_at);

        CREATE TABLE IF NOT EXISTS readiness_check_items (
          id                TEXT PRIMARY KEY,
          check_id          TEXT NOT NULL REFERENCES readiness_checks(id) ON DELETE CASCADE,
          manuscript_id     TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
          gate              TEXT NOT NULL,
          severity          TEXT CHECK (severity IN ('minor','major','critical')),
          finding_md        TEXT NOT NULL,
          suggested_fix_md  TEXT,
          status            TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open','accepted','dismissed')),
          auto_detected     INTEGER NOT NULL DEFAULT 0 CHECK (auto_detected IN (0,1)),
          created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at        INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_readiness_check_items_check
          ON readiness_check_items(check_id, created_at);

        -- =============================================================
        -- Reviewer responses (drafts per submission round)
        -- =============================================================
        CREATE TABLE IF NOT EXISTS reviewer_responses (
          id                              TEXT PRIMARY KEY,
          manuscript_id                   TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
          session_id                      TEXT,
          round                           INTEGER NOT NULL DEFAULT 1,
          decision_letter_commentary_id   TEXT REFERENCES commentaries(id) ON DELETE SET NULL,
          status                          TEXT NOT NULL DEFAULT 'drafting'
                                            CHECK (status IN ('drafting','ready','submitted')),
          summary_md                      TEXT,
          compiled_asset_id               TEXT REFERENCES manuscript_assets(id) ON DELETE SET NULL,
          created_at                      INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at                      INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_reviewer_responses_manuscript
          ON reviewer_responses(manuscript_id, round, updated_at);

        CREATE TABLE IF NOT EXISTS reviewer_response_items (
          id                  TEXT PRIMARY KEY,
          response_id         TEXT NOT NULL REFERENCES reviewer_responses(id) ON DELETE CASCADE,
          commentary_id       TEXT REFERENCES commentaries(id) ON DELETE SET NULL,
          comment_excerpt     TEXT NOT NULL,
          response_md         TEXT,
          change_pointer_md   TEXT,
          revision_ids_json   TEXT,
          status              TEXT NOT NULL DEFAULT 'drafting'
                                CHECK (status IN ('drafting','accepted','declined')),
          position            INTEGER NOT NULL DEFAULT 0,
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );
        CREATE INDEX IF NOT EXISTS idx_reviewer_response_items_response
          ON reviewer_response_items(response_id, position);

        -- =============================================================
        -- FTS5 indexes for the new searchable bodies
        -- =============================================================
        CREATE VIRTUAL TABLE IF NOT EXISTS protocols_fts USING fts5(
          title, content_md,
          content='protocols',
          content_rowid='rowid',
          tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS protocols_ai AFTER INSERT ON protocols BEGIN
          INSERT INTO protocols_fts(rowid, title, content_md)
            VALUES (NEW.rowid, NEW.title, NEW.content_md);
        END;
        CREATE TRIGGER IF NOT EXISTS protocols_ad AFTER DELETE ON protocols BEGIN
          INSERT INTO protocols_fts(protocols_fts, rowid, title, content_md)
            VALUES ('delete', OLD.rowid, OLD.title, OLD.content_md);
        END;
        CREATE TRIGGER IF NOT EXISTS protocols_au AFTER UPDATE ON protocols BEGIN
          INSERT INTO protocols_fts(protocols_fts, rowid, title, content_md)
            VALUES ('delete', OLD.rowid, OLD.title, OLD.content_md);
          INSERT INTO protocols_fts(rowid, title, content_md)
            VALUES (NEW.rowid, NEW.title, NEW.content_md);
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS protocol_assets_fts USING fts5(
          label, content_md,
          content='protocol_assets',
          content_rowid='rowid',
          tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS protocol_assets_ai AFTER INSERT ON protocol_assets BEGIN
          INSERT INTO protocol_assets_fts(rowid, label, content_md)
            VALUES (NEW.rowid, COALESCE(NEW.label, ''), NEW.content_md);
        END;
        CREATE TRIGGER IF NOT EXISTS protocol_assets_ad AFTER DELETE ON protocol_assets BEGIN
          INSERT INTO protocol_assets_fts(protocol_assets_fts, rowid, label, content_md)
            VALUES ('delete', OLD.rowid, COALESCE(OLD.label, ''), OLD.content_md);
        END;
        CREATE TRIGGER IF NOT EXISTS protocol_assets_au AFTER UPDATE ON protocol_assets BEGIN
          INSERT INTO protocol_assets_fts(protocol_assets_fts, rowid, label, content_md)
            VALUES ('delete', OLD.rowid, COALESCE(OLD.label, ''), OLD.content_md);
          INSERT INTO protocol_assets_fts(rowid, label, content_md)
            VALUES (NEW.rowid, COALESCE(NEW.label, ''), NEW.content_md);
        END;

        CREATE VIRTUAL TABLE IF NOT EXISTS sap_drafts_fts USING fts5(
          analysis_plan_md, multiplicity_md, missing_data_md,
          content='sap_drafts',
          content_rowid='rowid',
          tokenize='porter unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS sap_drafts_ai AFTER INSERT ON sap_drafts BEGIN
          INSERT INTO sap_drafts_fts(rowid, analysis_plan_md, multiplicity_md, missing_data_md)
            VALUES (NEW.rowid,
                    COALESCE(NEW.analysis_plan_md, ''),
                    COALESCE(NEW.multiplicity_md, ''),
                    COALESCE(NEW.missing_data_md, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS sap_drafts_ad AFTER DELETE ON sap_drafts BEGIN
          INSERT INTO sap_drafts_fts(sap_drafts_fts, rowid, analysis_plan_md, multiplicity_md, missing_data_md)
            VALUES ('delete', OLD.rowid,
                    COALESCE(OLD.analysis_plan_md, ''),
                    COALESCE(OLD.multiplicity_md, ''),
                    COALESCE(OLD.missing_data_md, ''));
        END;
        CREATE TRIGGER IF NOT EXISTS sap_drafts_au AFTER UPDATE ON sap_drafts BEGIN
          INSERT INTO sap_drafts_fts(sap_drafts_fts, rowid, analysis_plan_md, multiplicity_md, missing_data_md)
            VALUES ('delete', OLD.rowid,
                    COALESCE(OLD.analysis_plan_md, ''),
                    COALESCE(OLD.multiplicity_md, ''),
                    COALESCE(OLD.missing_data_md, ''));
          INSERT INTO sap_drafts_fts(rowid, analysis_plan_md, multiplicity_md, missing_data_md)
            VALUES (NEW.rowid,
                    COALESCE(NEW.analysis_plan_md, ''),
                    COALESCE(NEW.multiplicity_md, ''),
                    COALESCE(NEW.missing_data_md, ''));
        END;

        -- =============================================================
        -- Relations rebuild: widen entity-type and relation-type CHECKs
        -- so methods-workbench entities can be linked. Preserves rows.
        -- =============================================================
        DROP TABLE IF EXISTS relations_v16;

        CREATE TABLE relations_v16 (
          id              TEXT PRIMARY KEY,
          source_type     TEXT NOT NULL
                            CHECK (source_type IN (
                              'manuscript','commentary','revision','review','article_ref',
                              'protocol','protocol_audit','readiness_check','reviewer_response','reporting_checklist'
                            )),
          source_id       TEXT NOT NULL,
          target_type     TEXT NOT NULL
                            CHECK (target_type IN (
                              'manuscript','commentary','revision','review','article_ref',
                              'protocol','protocol_audit','readiness_check','reviewer_response','reporting_checklist'
                            )),
          target_id       TEXT NOT NULL,
          relation_type   TEXT NOT NULL
                            CHECK (relation_type IN (
                              'responds_to','revises','references','cited_by','supports','contradicts',
                              'reports','reported_by','has_readiness_check','has_reviewer_response',
                              'has_audit','has_sap','has_data_dictionary','follows_guideline'
                            )),
          metadata_json   TEXT,
          created_at      INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO relations_v16
          (id, source_type, source_id, target_type, target_id, relation_type, metadata_json, created_at)
        SELECT id, source_type, source_id, target_type, target_id, relation_type, metadata_json, created_at
        FROM relations;

        DROP TABLE relations;
        ALTER TABLE relations_v16 RENAME TO relations;

        CREATE INDEX IF NOT EXISTS idx_relations_source
          ON relations(source_type, source_id);
        CREATE INDEX IF NOT EXISTS idx_relations_target
          ON relations(target_type, target_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_dedup
          ON relations(source_type, source_id, target_type, target_id, relation_type);

        -- =============================================================
        -- Sessions rebuild: widen workflow CHECK to include 'methods',
        -- add protocol_id pointer. Preserves all existing rows.
        -- =============================================================
        DROP TABLE IF EXISTS sessions_v16;

        CREATE TABLE sessions_v16 (
          id                  TEXT PRIMARY KEY,
          manuscript_id       TEXT REFERENCES manuscripts(id) ON DELETE SET NULL,
          protocol_id         TEXT REFERENCES protocols(id) ON DELETE SET NULL,
          workflow            TEXT NOT NULL CHECK (workflow IN ('revision','review','manuscript','methods')),
          mode                TEXT,
          provider            TEXT NOT NULL CHECK (provider IN ('openai','gemini','deepseek','ollama','lmstudio','llama_server')),
          model               TEXT,
          effort              TEXT CHECK (effort IN ('low','medium','high','xhigh','max')),
          provider_session_id TEXT,
          status              TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','running','idle','awaiting_user','completed','crashed')),
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO sessions_v16
          (id, manuscript_id, protocol_id, workflow, mode, provider, model, effort,
           provider_session_id, status, created_at, updated_at)
        SELECT
          id, manuscript_id, NULL, workflow, mode, provider, model, effort,
          provider_session_id, status, created_at, updated_at
        FROM sessions;

        DROP TABLE sessions;
        ALTER TABLE sessions_v16 RENAME TO sessions;

        CREATE INDEX IF NOT EXISTS idx_sessions_manuscript_workflow
          ON sessions(manuscript_id, workflow, updated_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_protocol_workflow
          ON sessions(protocol_id, workflow, updated_at);

        INSERT INTO schema_version (version) VALUES (16);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV15(db: Database.Database): void {
  // ===================================================================
  // Supplementary files attached to a manuscript — tables, appendices,
  // figures, supplements, response letters, "other". Commentaries
  // (decision letters / reviewer reports) continue to live in their own
  // table because they're rendered + queried differently across the app.
  //
  // Multi-file upload at the new-manuscript form and at the new
  // upload-revision page lands here. The agent enumerates these in its
  // system prompt and fetches full content_md on demand via the API.
  // ===================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS manuscript_assets (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL
                        CHECK (kind IN (
                          'table','appendix','figure','supplement',
                          'response_letter','other'
                        )),
      label           TEXT,
      original_file   TEXT NOT NULL,
      file_format     TEXT,
      content_md      TEXT NOT NULL,
      byte_size       INTEGER,
      version_number  INTEGER,
      position        INTEGER NOT NULL DEFAULT 0,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_manuscript_assets_lookup
      ON manuscript_assets(manuscript_id, position);

    INSERT INTO schema_version (version) VALUES (15);
  `);
}

function migrateV14(db: Database.Database): void {
  // ===================================================================
  // Versioned manuscript snapshots.
  //
  // The agent's /version command produces a new revised manuscript as a
  // row in this table. The diff tab compares any two versions. v1 is
  // always the initial upload; subsequent versions come from agent
  // revise passes or manual user edits.
  //
  // Backfill: each existing manuscript gets a v1 row built from
  // original_content_md (or current content_md as fallback).
  // ===================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS manuscript_versions (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
      version_number  INTEGER NOT NULL,
      label           TEXT,
      content_md      TEXT NOT NULL,
      source          TEXT NOT NULL
                        CHECK (source IN ('upload','agent_revise','user_edit')),
      session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_manuscript_versions_unique
      ON manuscript_versions(manuscript_id, version_number);
    CREATE INDEX IF NOT EXISTS idx_manuscript_versions_lookup
      ON manuscript_versions(manuscript_id, created_at);

    INSERT INTO manuscript_versions
      (id, manuscript_id, version_number, label, content_md, source, created_at)
    SELECT
      'mv_' || substr(lower(hex(randomblob(12))), 1, 21),
      id,
      1,
      'Initial upload',
      COALESCE(original_content_md, content_md),
      'upload',
      created_at
    FROM manuscripts
    WHERE id NOT IN (SELECT manuscript_id FROM manuscript_versions);

    INSERT INTO schema_version (version) VALUES (14);
  `);
}

function migrateV13(db: Database.Database): void {
  // ===================================================================
  // Snapshot the original manuscript content at upload time so we can
  // diff original-vs-current. content_md drifts as the agent edits the
  // project folder and syncPrimaryFileToContentMd writes back; without
  // a frozen snapshot we lose what the user started with.
  //
  // Backfill: existing rows copy current content_md as their "original".
  // For manuscripts already partway through revision this is best-effort
  // — the true original is gone — but it gives a stable baseline going
  // forward.
  // ===================================================================
  db.exec(`
    ALTER TABLE manuscripts ADD COLUMN original_content_md TEXT;

    UPDATE manuscripts
       SET original_content_md = content_md
     WHERE original_content_md IS NULL;

    INSERT INTO schema_version (version) VALUES (13);
  `);
}

function migrateV12(db: Database.Database): void {
  // ===================================================================
  // Structured peer-review form for outside (third-party) manuscripts.
  // One draft per manuscript — the local user is the single author.
  // outside_review_items continues to hold the AGENT's findings; this
  // table holds the HUMAN's structured review draft.
  // ===================================================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS outside_review_drafts (
      id                      TEXT PRIMARY KEY,
      manuscript_id           TEXT NOT NULL UNIQUE
                                REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      recommendation          TEXT
                                CHECK (recommendation IN ('accept','revise','reject')),
      critical_feedback_md    TEXT,
      methodology_notes_md    TEXT,
      confidential_md         TEXT,
      created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT INTO schema_version (version) VALUES (12);
  `);
}

function migrateV1(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Core tables
    -- =======================================================================

    CREATE TABLE IF NOT EXISTS manuscripts (
      id            TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      content_md    TEXT NOT NULL,
      original_file TEXT,
      file_format   TEXT,
      journal_type  TEXT,
      research_domain TEXT,
      research_type TEXT,
      status        TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','in_revision','in_review','completed')),
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS commentaries (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
      reviewer_label  TEXT,
      content_md      TEXT NOT NULL,
      source          TEXT,
      round           INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_commentaries_manuscript
      ON commentaries(manuscript_id);

    CREATE TABLE IF NOT EXISTS revisions (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
      commentary_id   TEXT REFERENCES commentaries(id) ON DELETE SET NULL,
      category        TEXT NOT NULL CHECK (category IN ('mechanical','rewrite')),
      status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','applied','dismissed')),
      suggestion_md   TEXT NOT NULL,
      revised_md      TEXT,
      rewrite_context TEXT,
      user_revision   TEXT,
      round           INTEGER NOT NULL DEFAULT 1,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      applied_at      INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_revisions_manuscript
      ON revisions(manuscript_id);
    CREATE INDEX IF NOT EXISTS idx_revisions_commentary
      ON revisions(commentary_id);

    CREATE TABLE IF NOT EXISTS reviews (
      id            TEXT PRIMARY KEY,
      manuscript_id TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
      category      TEXT NOT NULL
                      CHECK (category IN ('mechanical','rewrite','structural','evidence')),
      content_md    TEXT NOT NULL,
      severity      TEXT CHECK (severity IN ('minor','major','critical')),
      section_ref   TEXT,
      status        TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','applied','dismissed')),
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_manuscript
      ON reviews(manuscript_id);

    CREATE TABLE IF NOT EXISTS relations (
      id              TEXT PRIMARY KEY,
      source_type     TEXT NOT NULL
                        CHECK (source_type IN ('manuscript','commentary','revision','review','article_ref')),
      source_id       TEXT NOT NULL,
      target_type     TEXT NOT NULL
                        CHECK (target_type IN ('manuscript','commentary','revision','review','article_ref')),
      target_id       TEXT NOT NULL,
      relation_type   TEXT NOT NULL
                        CHECK (relation_type IN ('responds_to','revises','references','cited_by','supports','contradicts')),
      metadata_json   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_relations_source
      ON relations(source_type, source_id);
    CREATE INDEX IF NOT EXISTS idx_relations_target
      ON relations(target_type, target_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_dedup
      ON relations(source_type, source_id, target_type, target_id, relation_type);

    CREATE TABLE IF NOT EXISTS article_references (
      id              TEXT PRIMARY KEY,
      doi             TEXT,
      title           TEXT NOT NULL,
      authors_json    TEXT,
      year            INTEGER,
      journal         TEXT,
      abstract_md     TEXT,
      source          TEXT NOT NULL
                        CHECK (source IN ('semantic_scholar','openalex','pubmed','manual')),
      external_id     TEXT,
      metadata_json   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_article_references_doi
      ON article_references(doi) WHERE doi IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_article_references_source_ext
      ON article_references(source, external_id);

    CREATE TABLE IF NOT EXISTS domains (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      parent_id   TEXT REFERENCES domains(id) ON DELETE SET NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS journals (
      id            TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      domain_id     TEXT REFERENCES domains(id) ON DELETE SET NULL,
      guidelines_md TEXT,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id                  TEXT PRIMARY KEY,
      manuscript_id       TEXT REFERENCES manuscripts(id) ON DELETE SET NULL,
      workflow            TEXT NOT NULL CHECK (workflow IN ('revision','review')),
      provider            TEXT NOT NULL CHECK (provider IN ('openai','gemini','deepseek','ollama','lmstudio','llama_server')),
      provider_session_id TEXT,
      status              TEXT NOT NULL DEFAULT 'new'
                            CHECK (status IN ('new','running','idle','awaiting_user','completed','crashed')),
      created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS session_messages (
      id            TEXT PRIMARY KEY,
      session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      role          TEXT NOT NULL,
      content_json  TEXT NOT NULL,
      turn_seq      INTEGER NOT NULL,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_session_messages_session
      ON session_messages(session_id);

    CREATE TABLE IF NOT EXISTS revision_actions (
      id            TEXT PRIMARY KEY,
      label         TEXT NOT NULL,
      action_type   TEXT NOT NULL
                      CHECK (action_type IN ('find_replace','rewrite_pattern','style_rule')),
      config_json   TEXT NOT NULL,
      use_count     INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at  INTEGER
    );

    -- =======================================================================
    -- FTS5 virtual tables (porter + unicode61 tokenizer)
    -- =======================================================================

    CREATE VIRTUAL TABLE IF NOT EXISTS manuscripts_fts USING fts5(
      title, content_md,
      content='manuscripts',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS commentaries_fts USING fts5(
      content_md,
      content='commentaries',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS revisions_fts USING fts5(
      suggestion_md, user_revision,
      content='revisions',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS reviews_fts USING fts5(
      content_md,
      content='reviews',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    -- =======================================================================
    -- Triggers: keep FTS indexes in sync
    -- =======================================================================

    -- manuscripts
    CREATE TRIGGER IF NOT EXISTS manuscripts_ai AFTER INSERT ON manuscripts BEGIN
      INSERT INTO manuscripts_fts(rowid, title, content_md)
        VALUES (NEW.rowid, NEW.title, NEW.content_md);
    END;

    CREATE TRIGGER IF NOT EXISTS manuscripts_ad AFTER DELETE ON manuscripts BEGIN
      INSERT INTO manuscripts_fts(manuscripts_fts, rowid, title, content_md)
        VALUES ('delete', OLD.rowid, OLD.title, OLD.content_md);
    END;

    CREATE TRIGGER IF NOT EXISTS manuscripts_au AFTER UPDATE ON manuscripts BEGIN
      INSERT INTO manuscripts_fts(manuscripts_fts, rowid, title, content_md)
        VALUES ('delete', OLD.rowid, OLD.title, OLD.content_md);
      INSERT INTO manuscripts_fts(rowid, title, content_md)
        VALUES (NEW.rowid, NEW.title, NEW.content_md);
    END;

    -- commentaries
    CREATE TRIGGER IF NOT EXISTS commentaries_ai AFTER INSERT ON commentaries BEGIN
      INSERT INTO commentaries_fts(rowid, content_md)
        VALUES (NEW.rowid, NEW.content_md);
    END;

    CREATE TRIGGER IF NOT EXISTS commentaries_ad AFTER DELETE ON commentaries BEGIN
      INSERT INTO commentaries_fts(commentaries_fts, rowid, content_md)
        VALUES ('delete', OLD.rowid, OLD.content_md);
    END;

    CREATE TRIGGER IF NOT EXISTS commentaries_au AFTER UPDATE ON commentaries BEGIN
      INSERT INTO commentaries_fts(commentaries_fts, rowid, content_md)
        VALUES ('delete', OLD.rowid, OLD.content_md);
      INSERT INTO commentaries_fts(rowid, content_md)
        VALUES (NEW.rowid, NEW.content_md);
    END;

    -- revisions
    CREATE TRIGGER IF NOT EXISTS revisions_ai AFTER INSERT ON revisions BEGIN
      INSERT INTO revisions_fts(rowid, suggestion_md, user_revision)
        VALUES (NEW.rowid, NEW.suggestion_md, NEW.user_revision);
    END;

    CREATE TRIGGER IF NOT EXISTS revisions_ad AFTER DELETE ON revisions BEGIN
      INSERT INTO revisions_fts(revisions_fts, rowid, suggestion_md, user_revision)
        VALUES ('delete', OLD.rowid, OLD.suggestion_md, OLD.user_revision);
    END;

    CREATE TRIGGER IF NOT EXISTS revisions_au AFTER UPDATE ON revisions BEGIN
      INSERT INTO revisions_fts(revisions_fts, rowid, suggestion_md, user_revision)
        VALUES ('delete', OLD.rowid, OLD.suggestion_md, OLD.user_revision);
      INSERT INTO revisions_fts(rowid, suggestion_md, user_revision)
        VALUES (NEW.rowid, NEW.suggestion_md, NEW.user_revision);
    END;

    -- reviews
    CREATE TRIGGER IF NOT EXISTS reviews_ai AFTER INSERT ON reviews BEGIN
      INSERT INTO reviews_fts(rowid, content_md)
        VALUES (NEW.rowid, NEW.content_md);
    END;

    CREATE TRIGGER IF NOT EXISTS reviews_ad AFTER DELETE ON reviews BEGIN
      INSERT INTO reviews_fts(reviews_fts, rowid, content_md)
        VALUES ('delete', OLD.rowid, OLD.content_md);
    END;

    CREATE TRIGGER IF NOT EXISTS reviews_au AFTER UPDATE ON reviews BEGIN
      INSERT INTO reviews_fts(reviews_fts, rowid, content_md)
        VALUES ('delete', OLD.rowid, OLD.content_md);
      INSERT INTO reviews_fts(rowid, content_md)
        VALUES (NEW.rowid, NEW.content_md);
    END;

    -- =======================================================================
    -- Record migration version
    -- =======================================================================

    INSERT INTO schema_version (version) VALUES (1);
  `);
}

function migrateV2(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Outside review (third-party manuscript reviewing workflow)
    --
    -- These rows live in their own tables so that no cloud-bound code path
    -- (supervisor.buildSystemPrompt, ClaudeProcess, OpenAIProcess) can
    -- reach their content_md. The full manuscript body stays local; optional
    -- paragraph-level cloud assistance is gated by explicit consent.
    -- =======================================================================

    CREATE TABLE IF NOT EXISTS outside_manuscripts (
      id              TEXT PRIMARY KEY,
      title           TEXT NOT NULL,
      content_md      TEXT NOT NULL,
      original_file   TEXT,
      file_format     TEXT,
      journal_type    TEXT,
      research_domain TEXT,
      research_type   TEXT,
      status          TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','outlining','outlined','detailing','ready','failed')),
      content_hash    TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS outside_review_items (
      id                    TEXT PRIMARY KEY,
      manuscript_id         TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      parent_outline_id     TEXT REFERENCES outside_review_items(id) ON DELETE CASCADE,
      stage                 TEXT NOT NULL CHECK (stage IN ('draft','detailed')),
      category              TEXT NOT NULL
                              CHECK (category IN ('mechanical','rewrite','structural','evidence')),
      severity              TEXT CHECK (severity IN ('minor','major','critical')),
      section_ref           TEXT,
      quoted_text           TEXT,
      anchor_offset         INTEGER,
      anchor_status         TEXT NOT NULL DEFAULT 'pending'
                              CHECK (anchor_status IN ('pending','matched','unmatched')),
      critique_md           TEXT NOT NULL,
      citations_json        TEXT,
      status                TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','accepted','dismissed')),
      detail_error          TEXT,
      created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at            INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_review_items_manuscript
      ON outside_review_items(manuscript_id);
    CREATE INDEX IF NOT EXISTS idx_outside_review_items_parent
      ON outside_review_items(parent_outline_id);
    CREATE INDEX IF NOT EXISTS idx_outside_review_items_stage
      ON outside_review_items(manuscript_id, stage);

    CREATE TABLE IF NOT EXISTS outside_sessions (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL CHECK (kind IN ('outline','detail')),
      status          TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed')),
      note            TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_sessions_manuscript
      ON outside_sessions(manuscript_id);

    -- FTS over detailed critique text, used to seed future RAG.
    CREATE VIRTUAL TABLE IF NOT EXISTS outside_review_items_fts USING fts5(
      critique_md, quoted_text,
      content='outside_review_items',
      content_rowid='rowid',
      tokenize='porter unicode61'
    );

    CREATE TRIGGER IF NOT EXISTS outside_review_items_ai
      AFTER INSERT ON outside_review_items BEGIN
      INSERT INTO outside_review_items_fts(rowid, critique_md, quoted_text)
        VALUES (NEW.rowid, NEW.critique_md, COALESCE(NEW.quoted_text, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS outside_review_items_ad
      AFTER DELETE ON outside_review_items BEGIN
      INSERT INTO outside_review_items_fts(outside_review_items_fts, rowid, critique_md, quoted_text)
        VALUES ('delete', OLD.rowid, OLD.critique_md, COALESCE(OLD.quoted_text, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS outside_review_items_au
      AFTER UPDATE ON outside_review_items BEGIN
      INSERT INTO outside_review_items_fts(outside_review_items_fts, rowid, critique_md, quoted_text)
        VALUES ('delete', OLD.rowid, OLD.critique_md, COALESCE(OLD.quoted_text, ''));
      INSERT INTO outside_review_items_fts(rowid, critique_md, quoted_text)
        VALUES (NEW.rowid, NEW.critique_md, COALESCE(NEW.quoted_text, ''));
    END;

    INSERT INTO schema_version (version) VALUES (2);
  `);
}

function migrateV3(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Confidentiality controls for outside review requests.
    --
    -- local_only is the default: full text and detailed critique stay on the
    -- configured local model. paragraph_cloud_assist may send one extracted
    -- paragraph at a time to the cloud agent, and only after explicit consent.
    -- allow_external_search is separate because even article-search queries can
    -- disclose topic, claim, or method details.
    -- =======================================================================

    ALTER TABLE outside_manuscripts
      ADD COLUMN confidentiality_mode TEXT NOT NULL DEFAULT 'local_only'
        CHECK (confidentiality_mode IN ('local_only','paragraph_cloud_assist'));

    ALTER TABLE outside_manuscripts
      ADD COLUMN allow_external_search INTEGER NOT NULL DEFAULT 0
        CHECK (allow_external_search IN (0,1));

    ALTER TABLE outside_manuscripts
      ADD COLUMN cloud_consent_at INTEGER;

    INSERT INTO schema_version (version) VALUES (3);
  `);
}

function migrateV4(db: Database.Database): void {
  const cols = db
    .prepare("PRAGMA table_info(sessions)")
    .all() as Array<{ name: string }>;
  const hasModel = cols.some((c) => c.name === "model");
  const hasEffort = cols.some((c) => c.name === "effort");
  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;

  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        -- ===================================================================
        -- Session model/effort selection and Codex provider support.
        -- Rebuild is needed to widen the provider CHECK constraint.
        -- ===================================================================

        DROP TABLE IF EXISTS sessions_new;

        CREATE TABLE sessions_new (
          id                  TEXT PRIMARY KEY,
          manuscript_id       TEXT REFERENCES manuscripts(id) ON DELETE SET NULL,
          workflow            TEXT NOT NULL CHECK (workflow IN ('revision','review')),
          provider            TEXT NOT NULL CHECK (provider IN ('openai','gemini','deepseek','ollama','lmstudio','llama_server')),
          model               TEXT,
          effort              TEXT CHECK (effort IN ('low','medium','high','xhigh','max')),
          provider_session_id TEXT,
          status              TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','running','idle','awaiting_user','completed','crashed')),
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO sessions_new
          (id, manuscript_id, workflow, provider, model, effort, provider_session_id, status, created_at, updated_at)
        SELECT
          id,
          manuscript_id,
          workflow,
          provider,
          ${hasModel ? "model" : "NULL"},
          ${hasEffort ? "effort" : "NULL"},
          provider_session_id,
          status,
          created_at,
          updated_at
        FROM sessions;

        DROP TABLE sessions;
        ALTER TABLE sessions_new RENAME TO sessions;

        INSERT INTO schema_version (version) VALUES (4);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV5(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Per-manuscript user-supplied review request. Captures what the user
    -- wants from the review (focus areas, target audience, novelty claims to
    -- challenge). Threaded into the system prompt so the agent has explicit
    -- intent rather than a generic "review this critically" boilerplate.
    -- =======================================================================

    ALTER TABLE manuscripts         ADD COLUMN review_request TEXT;
    ALTER TABLE outside_manuscripts ADD COLUMN review_request TEXT;

    INSERT INTO schema_version (version) VALUES (5);
  `);
}

function migrateV6(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Diagrams produced by the agent to test article validity. Two kinds:
    --   logic     — claims/evidence/conclusions flow (mermaid flowchart)
    --   narrative — section-by-section storytelling order
    -- One row per diagram. Mermaid source is rendered client-side.
    -- =======================================================================

    CREATE TABLE IF NOT EXISTS manuscript_diagrams (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL,
      manuscript_kind TEXT NOT NULL CHECK (manuscript_kind IN ('owned','outside')),
      kind            TEXT NOT NULL CHECK (kind IN ('logic','narrative')),
      title           TEXT,
      mermaid_src     TEXT NOT NULL,
      notes_md        TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_manuscript_diagrams_ms
      ON manuscript_diagrams(manuscript_id, manuscript_kind);

    INSERT INTO schema_version (version) VALUES (6);
  `);
}

function migrateV7(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Local-first confidential review metadata.
    --
    -- Detailed review items now record whether the local agent fully resolved
    -- an issue or whether a paragraph-only cloud pass was requested.
    -- =======================================================================

    ALTER TABLE outside_manuscripts
      ADD COLUMN cloud_provider TEXT NOT NULL DEFAULT 'claude'
        CHECK (cloud_provider IN ('claude','codex'));

    ALTER TABLE outside_review_items
      ADD COLUMN resolution_state TEXT
        CHECK (resolution_state IN ('resolved','ambiguous','unresolved'));

    ALTER TABLE outside_review_items
      ADD COLUMN needs_cloud_review INTEGER NOT NULL DEFAULT 0
        CHECK (needs_cloud_review IN (0,1));

    ALTER TABLE outside_review_items
      ADD COLUMN cloud_reason TEXT;

    ALTER TABLE outside_review_items
      ADD COLUMN cloud_provider TEXT
        CHECK (cloud_provider IN ('claude','codex'));

    ALTER TABLE outside_review_items
      ADD COLUMN cloud_reviewed_at INTEGER;

    INSERT INTO schema_version (version) VALUES (7);
  `);
}

function migrateV8(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Hardened local-first review metadata.
    --
    -- These columns preserve confidence, validity, deterministic checks,
    -- cloud escalation tasking, and local/cloud adjudication state.
    -- =======================================================================

    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS outside_manuscripts_v8;

    CREATE TABLE outside_manuscripts_v8 (
      id                    TEXT PRIMARY KEY,
      title                 TEXT NOT NULL,
      content_md            TEXT NOT NULL,
      original_file         TEXT,
      file_format           TEXT,
      journal_type          TEXT,
      research_domain       TEXT,
      research_type         TEXT,
      status                TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','outlining','outlined','detailing','ready','failed')),
      content_hash          TEXT,
      created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      confidentiality_mode  TEXT NOT NULL DEFAULT 'local_only'
                              CHECK (confidentiality_mode IN ('local_only','paragraph_cloud_assist','full_cloud_review')),
      allow_external_search INTEGER NOT NULL DEFAULT 0
                              CHECK (allow_external_search IN (0,1)),
      cloud_consent_at      INTEGER,
      review_request        TEXT,
      cloud_provider        TEXT NOT NULL DEFAULT 'claude'
                              CHECK (cloud_provider IN ('claude','codex'))
    );

    INSERT INTO outside_manuscripts_v8
      (id, title, content_md, original_file, file_format, journal_type,
       research_domain, research_type, status, content_hash, created_at,
       updated_at, confidentiality_mode, allow_external_search,
       cloud_consent_at, review_request, cloud_provider)
    SELECT id, title, content_md, original_file, file_format, journal_type,
       research_domain, research_type, status, content_hash, created_at,
       updated_at, confidentiality_mode, allow_external_search,
       cloud_consent_at, review_request, cloud_provider
    FROM outside_manuscripts;

    DROP TABLE outside_manuscripts;
    ALTER TABLE outside_manuscripts_v8 RENAME TO outside_manuscripts;

    PRAGMA foreign_keys = ON;

    ALTER TABLE outside_review_items
      ADD COLUMN confidence TEXT
        CHECK (confidence IN ('low','medium','high'));

    ALTER TABLE outside_review_items
      ADD COLUMN validity TEXT
        CHECK (validity IN ('valid_issue','possible_issue','false_positive'));

    ALTER TABLE outside_review_items
      ADD COLUMN missing_inputs_json TEXT;

    ALTER TABLE outside_review_items
      ADD COLUMN cloud_task TEXT
        CHECK (cloud_task IN ('verify_issue','literature_check','stats_check','global_context_check'));

    ALTER TABLE outside_review_items
      ADD COLUMN anchor_confidence REAL;

    ALTER TABLE outside_review_items
      ADD COLUMN dedupe_key TEXT;

    ALTER TABLE outside_review_items
      ADD COLUMN deterministic_findings_json TEXT;

    ALTER TABLE outside_review_items
      ADD COLUMN adjudication_notes TEXT;

    ALTER TABLE outside_review_items
      ADD COLUMN disagreement_notes TEXT;

    CREATE INDEX IF NOT EXISTS idx_outside_review_items_dedupe
      ON outside_review_items(manuscript_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL;

    INSERT INTO schema_version (version) VALUES (8);
  `);
}

function migrateV9(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Multi-stage local-first outside review.
    --
    -- Adds persistent artifacts and tool provenance so detailed paragraph
    -- review can be grounded in full-manuscript synthesis, local search,
    -- scholarly checks, reproducibility checks, figure/table checks, and a
    -- reference audit without sending the whole manuscript to cloud unless the
    -- user explicitly enabled full-cloud review.
    -- =======================================================================

    PRAGMA foreign_keys = OFF;

    DROP TABLE IF EXISTS outside_manuscripts_v9;
    CREATE TABLE outside_manuscripts_v9 (
      id                    TEXT PRIMARY KEY,
      title                 TEXT NOT NULL,
      content_md            TEXT NOT NULL,
      original_file         TEXT,
      file_format           TEXT,
      journal_type          TEXT,
      research_domain       TEXT,
      research_type         TEXT,
      status                TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','synthesizing','synthesized','outlining','outlined','detailing','auditing','finalizing','ready','failed')),
      content_hash          TEXT,
      created_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at            INTEGER NOT NULL DEFAULT (unixepoch()),
      confidentiality_mode  TEXT NOT NULL DEFAULT 'local_only'
                              CHECK (confidentiality_mode IN ('local_only','paragraph_cloud_assist','full_cloud_review')),
      allow_external_search INTEGER NOT NULL DEFAULT 0
                              CHECK (allow_external_search IN (0,1)),
      cloud_consent_at      INTEGER,
      review_request        TEXT,
      cloud_provider        TEXT NOT NULL DEFAULT 'claude'
                              CHECK (cloud_provider IN ('claude','codex'))
    );

    INSERT INTO outside_manuscripts_v9
      (id, title, content_md, original_file, file_format, journal_type,
       research_domain, research_type, status, content_hash, created_at,
       updated_at, confidentiality_mode, allow_external_search,
       cloud_consent_at, review_request, cloud_provider)
    SELECT id, title, content_md, original_file, file_format, journal_type,
       research_domain, research_type, status, content_hash, created_at,
       updated_at, confidentiality_mode, allow_external_search,
       cloud_consent_at, review_request, cloud_provider
    FROM outside_manuscripts;

    DROP TABLE outside_manuscripts;
    ALTER TABLE outside_manuscripts_v9 RENAME TO outside_manuscripts;

    DROP TABLE IF EXISTS outside_sessions_v9;
    CREATE TABLE outside_sessions_v9 (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL CHECK (kind IN ('synthesis','outline','detail','reference_audit','finalize')),
      status          TEXT NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running','completed','failed')),
      note            TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    INSERT INTO outside_sessions_v9
      (id, manuscript_id, kind, status, note, created_at, updated_at)
    SELECT id, manuscript_id, kind, status, note, created_at, updated_at
    FROM outside_sessions;

    DROP TABLE outside_sessions;
    ALTER TABLE outside_sessions_v9 RENAME TO outside_sessions;

    PRAGMA foreign_keys = ON;

    CREATE INDEX IF NOT EXISTS idx_outside_sessions_manuscript
      ON outside_sessions(manuscript_id);

    CREATE TABLE IF NOT EXISTS outside_manuscript_artifacts (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      kind            TEXT NOT NULL CHECK (kind IN ('section','reference','figure','table','appendix')),
      label           TEXT NOT NULL,
      section_ref     TEXT,
      anchor_offset   INTEGER,
      content_text    TEXT NOT NULL,
      metadata_json   TEXT,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_artifacts_ms_kind
      ON outside_manuscript_artifacts(manuscript_id, kind);

    CREATE TABLE IF NOT EXISTS outside_tool_runs (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      stage           TEXT NOT NULL,
      tool_kind       TEXT NOT NULL CHECK (tool_kind IN ('file_search','grep','scholarly_search','web_search','python_stats','image_check','reference_audit')),
      query           TEXT,
      input_json      TEXT,
      output_json     TEXT,
      status          TEXT NOT NULL CHECK (status IN ('completed','blocked','failed')),
      error           TEXT,
      privacy_class   TEXT NOT NULL CHECK (privacy_class IN ('local','external_search','cloud_prompt')),
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_tool_runs_ms_stage
      ON outside_tool_runs(manuscript_id, stage, created_at);
    CREATE INDEX IF NOT EXISTS idx_outside_tool_runs_kind
      ON outside_tool_runs(manuscript_id, tool_kind);

    CREATE TABLE IF NOT EXISTS outside_syntheses (
      id                         TEXT PRIMARY KEY,
      manuscript_id              TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      article_summary_md         TEXT NOT NULL,
      theoretical_assessment_md  TEXT NOT NULL,
      validity_assessment_md     TEXT NOT NULL,
      review_form_json           TEXT,
      global_issues_json         TEXT,
      detail_tasks_json          TEXT,
      missing_inputs_json        TEXT,
      tool_runs_json             TEXT,
      created_at                 INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at                 INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_syntheses_ms
      ON outside_syntheses(manuscript_id, updated_at);

    CREATE TABLE IF NOT EXISTS outside_reference_audit_items (
      id               TEXT PRIMARY KEY,
      manuscript_id    TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      reference_text   TEXT NOT NULL,
      in_text_key      TEXT,
      doi              TEXT,
      status           TEXT NOT NULL,
      finding_md       TEXT NOT NULL,
      validation_json  TEXT,
      tool_run_id      TEXT REFERENCES outside_tool_runs(id) ON DELETE SET NULL,
      created_at       INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_reference_audit_ms
      ON outside_reference_audit_items(manuscript_id);

    CREATE TABLE IF NOT EXISTS outside_final_reviews (
      id                         TEXT PRIMARY KEY,
      manuscript_id              TEXT NOT NULL REFERENCES outside_manuscripts(id) ON DELETE CASCADE,
      summary_md                 TEXT NOT NULL,
      review_form_json           TEXT,
      decision                   TEXT,
      unresolved_items_json      TEXT,
      created_at                 INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at                 INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_outside_final_reviews_ms
      ON outside_final_reviews(manuscript_id, updated_at);

    INSERT INTO schema_version (version) VALUES (9);
  `);
}

function migrateV11(db: Database.Database): void {
  // ===================================================================
  // Unified "manuscript" workflow + per-turn slash-command mode.
  //
  // The two isolated workflows ('revision' and 'review') collapse into
  // one continuing thread per manuscript. The new 'manuscript' workflow
  // value lets a single session host both intents; per-turn intent is
  // carried by slash commands in the user message itself. `mode` records
  // the initial slash command for analytics/history, never enforced.
  //
  // Existing 'revision'/'review' rows remain valid and queryable.
  // ===================================================================

  const foreignKeys = db.pragma("foreign_keys", { simple: true }) as number;
  db.pragma("foreign_keys = OFF");
  try {
    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS sessions_v11;

        CREATE TABLE sessions_v11 (
          id                  TEXT PRIMARY KEY,
          manuscript_id       TEXT REFERENCES manuscripts(id) ON DELETE SET NULL,
          workflow            TEXT NOT NULL CHECK (workflow IN ('revision','review','manuscript')),
          mode                TEXT,
          provider            TEXT NOT NULL CHECK (provider IN ('openai','gemini','deepseek','ollama','lmstudio','llama_server')),
          model               TEXT,
          effort              TEXT CHECK (effort IN ('low','medium','high','xhigh','max')),
          provider_session_id TEXT,
          status              TEXT NOT NULL DEFAULT 'new'
                                CHECK (status IN ('new','running','idle','awaiting_user','completed','crashed')),
          created_at          INTEGER NOT NULL DEFAULT (unixepoch()),
          updated_at          INTEGER NOT NULL DEFAULT (unixepoch())
        );

        INSERT INTO sessions_v11
          (id, manuscript_id, workflow, mode, provider, model, effort,
           provider_session_id, status, created_at, updated_at)
        SELECT
          id, manuscript_id, workflow, NULL, provider, model, effort,
          provider_session_id, status, created_at, updated_at
        FROM sessions;

        DROP TABLE sessions;
        ALTER TABLE sessions_v11 RENAME TO sessions;

        CREATE INDEX IF NOT EXISTS idx_sessions_manuscript_workflow
          ON sessions(manuscript_id, workflow, updated_at);

        INSERT INTO schema_version (version) VALUES (11);
      `);
    })();
  } finally {
    db.pragma(`foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

function migrateV10(db: Database.Database): void {
  db.exec(`
    -- =======================================================================
    -- Folder-linked manuscripts.
    --
    -- A revision now operates on a real directory of markdown files on disk
    -- (manuscript + appendices + response letter + revision tables). The DB
    -- still indexes content_md as a lazy mirror of the primary file so FTS,
    -- prompt building, and the existing exporter keep working. project_root
    -- is the absolute path to the folder; primary_file is a relative path.
    -- is_git is recorded at link time so we can choose between git revert and
    -- snapshot-based revert at session start.
    -- =======================================================================

    ALTER TABLE manuscripts ADD COLUMN project_root TEXT;
    ALTER TABLE manuscripts ADD COLUMN primary_file TEXT;
    ALTER TABLE manuscripts ADD COLUMN is_git INTEGER NOT NULL DEFAULT 0
      CHECK (is_git IN (0,1));

    -- Lightweight pointer to revision_table_*.md files the agent creates so
    -- the UI can list past tables without scanning the folder.
    CREATE TABLE IF NOT EXISTS revision_tables (
      id              TEXT PRIMARY KEY,
      manuscript_id   TEXT NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
      session_id      TEXT REFERENCES sessions(id) ON DELETE SET NULL,
      round           INTEGER NOT NULL DEFAULT 1,
      relative_path   TEXT NOT NULL,
      created_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_revision_tables_manuscript
      ON revision_tables(manuscript_id, created_at);

    INSERT INTO schema_version (version) VALUES (10);
  `);
}
