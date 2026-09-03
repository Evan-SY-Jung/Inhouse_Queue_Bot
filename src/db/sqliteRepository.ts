import { DatabaseSync } from "node:sqlite";
import {
  ActivePanelExistsError,
  ActiveRecruitmentExistsError,
  AlreadyJoinedError,
  NotJoinedError,
  QueueFullError,
  RegistrationClosedError,
  RecruitmentNotOpenError,
} from "../domain/errors.js";
import type {
  AddQueueMemberInput,
  ClaimPanelInput,
  ClaimRecruitmentInput,
  CooldownResult,
  Panel,
  QueueMember,
  QueueMutationOptions,
  QueueMutationResult,
  Recruitment,
} from "../domain/models.js";
import type { RecruitmentRepository } from "./repository.js";
import { initializeSqliteSchema } from "./sqliteSchema.js";

type SqlRow = Record<string, string | number | null>;

export class SqliteRecruitmentRepository implements RecruitmentRepository {
  private readonly db: DatabaseSync;

  constructor(path: string) {
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA busy_timeout = 5000");
    if (path !== ":memory:") {
      this.db.exec("PRAGMA journal_mode = WAL");
    }
    initializeSqliteSchema(this.db);
    this.recoverInterruptedState(Date.now());
  }

  claimPanel(input: ClaimPanelInput): Panel {
    try {
      const result = this.db
        .prepare(
          `INSERT INTO panels
            (guild_id, category_id, creator_id, status, created_at)
           VALUES (?, ?, ?, 'CREATING', ?)`,
        )
        .run(input.guildId, input.categoryId, input.creatorId, input.now);
      return this.requirePanel(Number(result.lastInsertRowid));
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ActivePanelExistsError();
      throw error;
    }
  }

  activatePanel(panelId: number, channelId: string, messageId: string): Panel {
    const result = this.db
      .prepare(
        `UPDATE panels
         SET channel_id = ?, message_id = ?, status = 'ACTIVE'
         WHERE id = ? AND status = 'CREATING'`,
      )
      .run(channelId, messageId, panelId);
    if (result.changes !== 1) {
      throw new Error("생성 중인 패널을 활성화하지 못했습니다.");
    }
    return this.requirePanel(panelId);
  }

  abandonPanel(panelId: number, now: number): void {
    this.db
      .prepare(
        `UPDATE panels SET status = 'CLOSED', closed_at = ?
         WHERE id = ? AND status = 'CREATING'`,
      )
      .run(now, panelId);
  }

  getPanel(panelId: number): Panel | null {
    const row = this.db.prepare("SELECT * FROM panels WHERE id = ?").get(panelId);
    return row ? mapPanel(row as SqlRow) : null;
  }

  getActivePanelByCategory(guildId: string, categoryId: string): Panel | null {
    const row = this.db
      .prepare(
        `SELECT * FROM panels
         WHERE guild_id = ? AND category_id = ? AND status = 'ACTIVE'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(guildId, categoryId);
    return row ? mapPanel(row as SqlRow) : null;
  }

  listActivePanels(): Panel[] {
    return this.db
      .prepare("SELECT * FROM panels WHERE status = 'ACTIVE' ORDER BY id ASC")
      .all()
      .map((row) => mapPanel(row as SqlRow));
  }

  updatePanelMessage(panelId: number, messageId: string): void {
    this.db
      .prepare("UPDATE panels SET message_id = ? WHERE id = ? AND status = 'ACTIVE'")
      .run(messageId, panelId);
  }

  closePanelByChannel(channelId: string, now: number): void {
    this.db
      .prepare(
        `UPDATE panels SET status = 'CLOSED', closed_at = ?
         WHERE channel_id = ? AND status != 'CLOSED'`,
      )
      .run(now, channelId);
  }

  claimRecruitment(input: ClaimRecruitmentInput): Recruitment {
    try {
      return this.transaction(() => {
        const channelNumber =
          input.kind === "RESERVATION"
            ? null
            : this.nextOpenChannelNumber(
                input.guildId,
                input.categoryId,
                input.gameType,
              );
        const result = this.db
          .prepare(
            `INSERT INTO recruitments (
               panel_id, guild_id, category_id, creator_id, kind, game_type,
               channel_number, description, scheduled_at, timezone_input, status, created_at
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CREATING', ?)`,
          )
          .run(
            input.panelId,
            input.guildId,
            input.categoryId,
            input.creatorId,
            input.kind,
            input.gameType,
            channelNumber,
            input.description ?? null,
            input.scheduledAt ?? null,
            input.timezoneInput ?? null,
            input.now,
          );
        return this.requireRecruitment(Number(result.lastInsertRowid));
      });
    } catch (error) {
      if (isUniqueConstraint(error)) throw new ActiveRecruitmentExistsError();
      throw error;
    }
  }

  activateRecruitment(
    recruitmentId: number,
    channelId: string,
    messageId: string,
  ): Recruitment {
    const result = this.db
      .prepare(
        `UPDATE recruitments
         SET channel_id = ?, message_id = ?, status = 'OPEN'
         WHERE id = ? AND status = 'CREATING'`,
      )
      .run(channelId, messageId, recruitmentId);
    if (result.changes !== 1) {
      throw new Error("생성 중인 모집을 활성화하지 못했습니다.");
    }
    return this.requireRecruitment(recruitmentId);
  }

  abandonRecruitment(recruitmentId: number, now: number): void {
    this.db
      .prepare(
        `UPDATE recruitments
         SET status = 'CLOSED', closed_at = ?, channel_number = NULL
         WHERE id = ? AND status = 'CREATING'`,
      )
      .run(now, recruitmentId);
  }

  getRecruitment(recruitmentId: number): Recruitment | null {
    const row = this.db.prepare("SELECT * FROM recruitments WHERE id = ?").get(recruitmentId);
    return row ? mapRecruitment(row as SqlRow) : null;
  }

  getOpenRecruitmentByChannel(channelId: string): Recruitment | null {
    const row = this.db
      .prepare(
        `SELECT * FROM recruitments
         WHERE channel_id = ? AND status = 'OPEN'
         ORDER BY id DESC LIMIT 1`,
      )
      .get(channelId);
    return row ? mapRecruitment(row as SqlRow) : null;
  }

  listOpenRecruitments(): Recruitment[] {
    return this.db
      .prepare("SELECT * FROM recruitments WHERE status = 'OPEN' ORDER BY id ASC")
      .all()
      .map((row) => mapRecruitment(row as SqlRow));
  }

  updateRecruitmentMessage(recruitmentId: number, messageId: string): void {
    this.db
      .prepare(
        "UPDATE recruitments SET message_id = ? WHERE id = ? AND status = 'OPEN'",
      )
      .run(messageId, recruitmentId);
  }

  closeRecruitment(recruitmentId: number, now: number): void {
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM queue_members WHERE recruitment_id = ?")
        .run(recruitmentId);
      this.db
        .prepare(
          `UPDATE recruitments
           SET status = 'CLOSED', closed_at = ?, channel_number = NULL
           WHERE id = ? AND status != 'CLOSED'`,
        )
        .run(now, recruitmentId);
    });
  }

  closeRecruitmentByChannel(channelId: string, now: number): void {
    this.transaction(() => {
      this.db
        .prepare(
          `DELETE FROM queue_members
           WHERE recruitment_id IN (
             SELECT id FROM recruitments WHERE channel_id = ?
           )`,
        )
        .run(channelId);
      this.db
        .prepare(
          `UPDATE recruitments
           SET status = 'CLOSED', closed_at = ?, channel_number = NULL
           WHERE channel_id = ? AND status != 'CLOSED'`,
        )
        .run(now, channelId);
    });
  }

  toggleRegistration(recruitmentId: number): Recruitment {
    const result = this.db
      .prepare(
        `UPDATE recruitments
         SET registration_state = CASE registration_state
           WHEN 'OPEN' THEN 'CLOSED'
           ELSE 'OPEN'
         END
         WHERE id = ? AND status = 'OPEN'`,
      )
      .run(recruitmentId);
    if (result.changes !== 1) {
      throw new RecruitmentNotOpenError();
    }
    return this.requireRecruitment(recruitmentId);
  }

  listQueueMembers(recruitmentId: number): QueueMember[] {
    return this.db
      .prepare(
        `SELECT sequence, recruitment_id, user_id, display_name, riot_name, riot_tag, joined_at
         FROM queue_members WHERE recruitment_id = ? ORDER BY sequence ASC`,
      )
      .all(recruitmentId)
      .map((row) => mapQueueMember(row as SqlRow));
  }

  addQueueMember(
    input: AddQueueMemberInput,
    options: QueueMutationOptions = {},
  ): QueueMutationResult {
    return this.transaction(() => {
      this.assertAcceptingRecruitment(
        input.recruitmentId,
        options.allowClosedRegistration === true,
      );
      const existing = this.db
        .prepare(
          "SELECT sequence FROM queue_members WHERE recruitment_id = ? AND user_id = ?",
        )
        .get(input.recruitmentId, input.userId);
      if (existing) throw new AlreadyJoinedError();

      const countRow = this.db
        .prepare("SELECT COUNT(*) AS count FROM queue_members WHERE recruitment_id = ?")
        .get(input.recruitmentId) as SqlRow;
      const count = Number(countRow.count);
      if (count >= input.capacity) throw new QueueFullError(input.capacity);

      this.db
        .prepare(
          `INSERT INTO queue_members
             (recruitment_id, user_id, display_name, riot_name, riot_tag, joined_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.recruitmentId,
          input.userId,
          input.displayName.slice(0, 100),
          input.riotName?.slice(0, 32) ?? null,
          input.riotTag?.slice(0, 10) ?? null,
          input.now,
        );

      return {
        position: count + 1,
        members: this.listQueueMembers(input.recruitmentId),
      };
    });
  }

  removeQueueMember(
    recruitmentId: number,
    userId: string,
    options: QueueMutationOptions = {},
  ): QueueMutationResult {
    return this.transaction(() => {
      this.assertAcceptingRecruitment(
        recruitmentId,
        options.allowClosedRegistration === true,
      );
      const row = this.db
        .prepare(
          "SELECT sequence FROM queue_members WHERE recruitment_id = ? AND user_id = ?",
        )
        .get(recruitmentId, userId) as SqlRow | undefined;
      if (!row) throw new NotJoinedError();

      const positionRow = this.db
        .prepare(
          `SELECT COUNT(*) AS count FROM queue_members
           WHERE recruitment_id = ? AND sequence <= ?`,
        )
        .get(recruitmentId, Number(row.sequence)) as SqlRow;
      this.db
        .prepare("DELETE FROM queue_members WHERE recruitment_id = ? AND user_id = ?")
        .run(recruitmentId, userId);

      return {
        position: Number(positionRow.count),
        members: this.listQueueMembers(recruitmentId),
      };
    });
  }

  tryAcquireCooldown(
    guildId: string,
    key: string,
    now: number,
    durationMs: number,
  ): CooldownResult {
    return this.transaction(() => {
      const row = this.db
        .prepare(
          "SELECT expires_at FROM guild_cooldowns WHERE guild_id = ? AND cooldown_key = ?",
        )
        .get(guildId, key) as SqlRow | undefined;
      const expiresAt = row ? Number(row.expires_at) : 0;
      if (expiresAt > now) {
        return { acquired: false, remainingMs: expiresAt - now };
      }

      this.db
        .prepare(
          `INSERT INTO guild_cooldowns (guild_id, cooldown_key, expires_at)
           VALUES (?, ?, ?)
           ON CONFLICT(guild_id, cooldown_key)
           DO UPDATE SET expires_at = excluded.expires_at`,
        )
        .run(guildId, key, now + durationMs);
      return { acquired: true, remainingMs: 0 };
    });
  }

  tryClaimSummon(recruitmentId: number): boolean {
    const result = this.db
      .prepare(
        `UPDATE recruitments SET summon_state = 'CLAIMED'
         WHERE id = ? AND status = 'OPEN' AND summon_state = 'AVAILABLE'`,
      )
      .run(recruitmentId);
    return result.changes === 1;
  }

  releaseSummonClaim(recruitmentId: number): void {
    this.db
      .prepare(
        `UPDATE recruitments SET summon_state = 'AVAILABLE'
         WHERE id = ? AND status = 'OPEN' AND summon_state = 'CLAIMED'`,
      )
      .run(recruitmentId);
  }

  completeSummon(recruitmentId: number): void {
    this.db
      .prepare(
        `UPDATE recruitments SET summon_state = 'USED'
         WHERE id = ? AND status = 'OPEN' AND summon_state = 'CLAIMED'`,
      )
      .run(recruitmentId);
  }

  close(): void {
    this.db.close();
  }

  private nextOpenChannelNumber(
    guildId: string,
    categoryId: string,
    gameType: Recruitment["gameType"],
  ): number {
    const usedNumbers = new Set(
      this.db
        .prepare(
          `SELECT channel_number
           FROM recruitments
           WHERE guild_id = ? AND category_id = ?
             AND game_type = ?
             AND kind IN ('RIFT_NOW', 'ARAM_NOW')
             AND status IN ('CREATING', 'OPEN')
             AND channel_number IS NOT NULL`,
        )
        .all(guildId, categoryId, gameType)
        .map((row) => Number((row as SqlRow).channel_number)),
    );

    let number = 1;
    while (usedNumbers.has(number)) number += 1;
    return number;
  }

  private recoverInterruptedState(now: number): void {
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE panels SET status = 'CLOSED', closed_at = ? WHERE status = 'CREATING'",
        )
        .run(now);
      this.db
        .prepare(
          `UPDATE recruitments
           SET status = 'CLOSED', closed_at = ?, channel_number = NULL
           WHERE status = 'CREATING'`,
        )
        .run(now);
      this.db
        .prepare(
          `UPDATE recruitments SET summon_state = 'AVAILABLE'
           WHERE status = 'OPEN' AND summon_state = 'CLAIMED'`,
        )
        .run();
    });
  }

  private assertAcceptingRecruitment(
    recruitmentId: number,
    allowClosedRegistration = false,
  ): void {
    const row = this.db
      .prepare("SELECT status, registration_state FROM recruitments WHERE id = ?")
      .get(recruitmentId) as SqlRow | undefined;
    if (!row || row.status !== "OPEN") throw new RecruitmentNotOpenError();
    if (!allowClosedRegistration && row.registration_state !== "OPEN") {
      throw new RegistrationClosedError();
    }
  }

  private requirePanel(panelId: number): Panel {
    const panel = this.getPanel(panelId);
    if (!panel) throw new Error(`패널 ${panelId}을 찾지 못했습니다.`);
    return panel;
  }

  private requireRecruitment(recruitmentId: number): Recruitment {
    const recruitment = this.getRecruitment(recruitmentId);
    if (!recruitment) throw new Error(`모집 ${recruitmentId}을 찾지 못했습니다.`);
    return recruitment;
  }

  private transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
}

function mapPanel(row: SqlRow): Panel {
  return {
    id: Number(row.id),
    guildId: String(row.guild_id),
    categoryId: String(row.category_id),
    channelId: nullableString(row.channel_id),
    messageId: nullableString(row.message_id),
    creatorId: String(row.creator_id),
    status: String(row.status) as Panel["status"],
    createdAt: Number(row.created_at),
  };
}

function mapRecruitment(row: SqlRow): Recruitment {
  return {
    id: Number(row.id),
    panelId: Number(row.panel_id),
    guildId: String(row.guild_id),
    categoryId: String(row.category_id),
    channelId: nullableString(row.channel_id),
    messageId: nullableString(row.message_id),
    creatorId: String(row.creator_id),
    kind: String(row.kind) as Recruitment["kind"],
    gameType: String(row.game_type) as Recruitment["gameType"],
    channelNumber: nullableNumber(row.channel_number),
    description: nullableString(row.description),
    scheduledAt: nullableNumber(row.scheduled_at),
    timezoneInput: nullableString(row.timezone_input),
    status: String(row.status) as Recruitment["status"],
    registrationState: String(row.registration_state) as Recruitment["registrationState"],
    summonState: String(row.summon_state) as Recruitment["summonState"],
    createdAt: Number(row.created_at),
    closedAt: nullableNumber(row.closed_at),
  };
}

function mapQueueMember(row: SqlRow): QueueMember {
  return {
    sequence: Number(row.sequence),
    recruitmentId: Number(row.recruitment_id),
    userId: String(row.user_id),
    displayName: String(row.display_name),
    riotName: nullableString(row.riot_name),
    riotTag: nullableString(row.riot_tag),
    joinedAt: Number(row.joined_at),
  };
}

function nullableString(value: SqlRow[string] | undefined): string | null {
  return value == null ? null : String(value);
}

function nullableNumber(value: SqlRow[string] | undefined): number | null {
  return value == null ? null : Number(value);
}

function isUniqueConstraint(error: unknown): boolean {
  return error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
}
