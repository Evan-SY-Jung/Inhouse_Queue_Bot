import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  ActivePanelExistsError,
  ActiveRecruitmentExistsError,
  AlreadyJoinedError,
  NotJoinedError,
} from "../src/domain/errors.js";
import { SqliteRecruitmentRepository } from "../src/db/sqliteRepository.js";

function createOpenRecruitment(repository: SqliteRecruitmentRepository) {
  const panel = repository.claimPanel({
    guildId: "guild-1",
    categoryId: "category-1",
    creatorId: "admin-1",
    now: 1,
  });
  repository.activatePanel(panel.id, "panel-channel-1", "panel-message-1");
  const recruitment = repository.claimRecruitment({
    panelId: panel.id,
    guildId: "guild-1",
    categoryId: "category-1",
    creatorId: "user-1",
    kind: "RIFT_NOW",
    gameType: "RIFT",
    now: 2,
  });
  return repository.activateRecruitment(
    recruitment.id,
    "recruitment-channel-1",
    "recruitment-message-1",
  );
}

describe("SqliteRecruitmentRepository", () => {
  it("allows only one active panel per category", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    repository.claimPanel({
      guildId: "guild-1",
      categoryId: "category-1",
      creatorId: "admin-1",
      now: 1,
    });

    expect(() =>
      repository.claimPanel({
        guildId: "guild-1",
        categoryId: "category-1",
        creatorId: "admin-2",
        now: 2,
      }),
    ).toThrow(ActivePanelExistsError);
    repository.close();
  });

  it("allows one active recruitment per creator and kind", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    const recruitment = createOpenRecruitment(repository);

    expect(() =>
      repository.claimRecruitment({
        panelId: recruitment.panelId,
        guildId: recruitment.guildId,
        categoryId: recruitment.categoryId,
        creatorId: recruitment.creatorId,
        kind: "RIFT_NOW",
        gameType: "RIFT",
        now: 3,
      }),
    ).toThrow(ActiveRecruitmentExistsError);

    expect(() =>
      repository.claimRecruitment({
        panelId: recruitment.panelId,
        guildId: recruitment.guildId,
        categoryId: recruitment.categoryId,
        creatorId: recruitment.creatorId,
        kind: "ARAM_NOW",
        gameType: "ARAM",
        now: 3,
      }),
    ).not.toThrow();
    repository.close();
  });

  it("keeps queue order, prevents duplicates, and allows waiters beyond 20", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    const recruitment = createOpenRecruitment(repository);

    const first = repository.addQueueMember(recruitment.id, "member-1", "첫 번째", 10);
    const second = repository.addQueueMember(recruitment.id, "member-2", "두 번째", 11);
    expect(first.position).toBe(1);
    expect(second.position).toBe(2);
    expect(second.members.map((member) => member.userId)).toEqual(["member-1", "member-2"]);

    expect(() =>
      repository.addQueueMember(recruitment.id, "member-2", "두 번째", 12),
    ).toThrow(AlreadyJoinedError);
    for (let index = 3; index <= 23; index += 1) {
      repository.addQueueMember(
        recruitment.id,
        `member-${index}`,
        `${index} 번째`,
        10 + index,
      );
    }
    expect(repository.listQueueMembers(recruitment.id)).toHaveLength(23);

    const removed = repository.removeQueueMember(recruitment.id, "member-1");
    expect(removed.position).toBe(1);
    expect(removed.members).toHaveLength(22);
    expect(removed.members[0]?.userId).toBe("member-2");
    expect(removed.members.at(-1)?.userId).toBe("member-23");
    expect(() => repository.removeQueueMember(recruitment.id, "member-1")).toThrow(
      NotJoinedError,
    );
    repository.close();
  });

  it("assigns and reuses the smallest available number separately per game", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    const first = createOpenRecruitment(repository);
    const secondClaim = repository.claimRecruitment({
      panelId: first.panelId,
      guildId: first.guildId,
      categoryId: first.categoryId,
      creatorId: "user-2",
      kind: "RIFT_NOW",
      gameType: "RIFT",
      now: 3,
    });
    const second = repository.activateRecruitment(
      secondClaim.id,
      "recruitment-channel-2",
      "recruitment-message-2",
    );
    const aramClaim = repository.claimRecruitment({
      panelId: first.panelId,
      guildId: first.guildId,
      categoryId: first.categoryId,
      creatorId: "user-3",
      kind: "ARAM_NOW",
      gameType: "ARAM",
      now: 4,
    });
    const aram = repository.activateRecruitment(
      aramClaim.id,
      "recruitment-channel-3",
      "recruitment-message-3",
    );

    expect(first.channelNumber).toBe(1);
    expect(second.channelNumber).toBe(2);
    expect(aram.channelNumber).toBe(1);

    const secondAram = repository.claimRecruitment({
      panelId: first.panelId,
      guildId: first.guildId,
      categoryId: first.categoryId,
      creatorId: "user-4",
      kind: "ARAM_NOW",
      gameType: "ARAM",
      now: 5,
    });
    expect(secondAram.channelNumber).toBe(2);
    repository.activateRecruitment(
      secondAram.id,
      "recruitment-channel-4",
      "recruitment-message-4",
    );

    repository.closeRecruitment(second.id, 6);
    const reused = repository.claimRecruitment({
      panelId: first.panelId,
      guildId: first.guildId,
      categoryId: first.categoryId,
      creatorId: "user-5",
      kind: "RIFT_NOW",
      gameType: "RIFT",
      now: 7,
    });
    expect(reused.channelNumber).toBe(2);

    repository.activateRecruitment(
      reused.id,
      "recruitment-channel-5",
      "recruitment-message-5",
    );
    repository.closeRecruitment(first.id, 8);
    repository.closeRecruitment(aram.id, 8);
    repository.closeRecruitment(secondAram.id, 8);
    repository.closeRecruitment(reused.id, 8);
    const reset = repository.claimRecruitment({
      panelId: first.panelId,
      guildId: first.guildId,
      categoryId: first.categoryId,
      creatorId: "user-1",
      kind: "RIFT_NOW",
      gameType: "RIFT",
      now: 9,
    });
    expect(reset.channelNumber).toBe(1);
    repository.close();
  });

  it("does not consume a channel number when channel creation is abandoned", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    const panel = repository.claimPanel({
      guildId: "guild-1",
      categoryId: "category-1",
      creatorId: "admin-1",
      now: 1,
    });
    repository.activatePanel(panel.id, "panel-channel-1", "panel-message-1");
    const failed = repository.claimRecruitment({
      panelId: panel.id,
      guildId: panel.guildId,
      categoryId: panel.categoryId,
      creatorId: "user-1",
      kind: "RIFT_NOW",
      gameType: "RIFT",
      now: 2,
    });
    repository.abandonRecruitment(failed.id, 3);
    const retry = repository.claimRecruitment({
      panelId: panel.id,
      guildId: panel.guildId,
      categoryId: panel.categoryId,
      creatorId: "user-1",
      kind: "RIFT_NOW",
      gameType: "RIFT",
      now: 4,
    });

    expect(retry.channelNumber).toBe(1);
    repository.close();
  });

  it("migrates an existing database and numbers its old recruitment rows", () => {
    const directory = mkdtempSync(join(tmpdir(), "cr-inhouse-migration-test-"));
    const databasePath = join(directory, "state.sqlite");
    const oldDatabase = new DatabaseSync(databasePath);
    oldDatabase.exec(`
      CREATE TABLE panels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        channel_id TEXT UNIQUE,
        message_id TEXT,
        creator_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      CREATE TABLE recruitments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        panel_id INTEGER NOT NULL REFERENCES panels(id),
        guild_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        channel_id TEXT UNIQUE,
        message_id TEXT,
        creator_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        game_type TEXT NOT NULL,
        description TEXT,
        scheduled_at INTEGER,
        timezone_input TEXT,
        status TEXT NOT NULL,
        summon_state TEXT NOT NULL DEFAULT 'AVAILABLE',
        created_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      INSERT INTO panels
        (guild_id, category_id, channel_id, message_id, creator_id, status, created_at)
      VALUES
        ('guild-1', 'category-1', 'panel-channel-1', 'panel-message-1', 'admin-1', 'ACTIVE', 1);
      INSERT INTO recruitments
        (panel_id, guild_id, category_id, channel_id, message_id, creator_id, kind,
         game_type, status, summon_state, created_at)
      VALUES
        (1, 'guild-1', 'category-1', 'channel-1', 'message-1', 'user-1', 'RIFT_NOW',
         'RIFT', 'OPEN', 'AVAILABLE', 2),
        (1, 'guild-1', 'category-1', 'channel-2', 'message-2', 'user-2', 'RIFT_NOW',
         'RIFT', 'OPEN', 'AVAILABLE', 3),
        (1, 'guild-1', 'category-1', 'channel-3', 'message-3', 'user-3', 'ARAM_NOW',
         'ARAM', 'OPEN', 'AVAILABLE', 4);
    `);
    oldDatabase.close();

    const repository = new SqliteRecruitmentRepository(databasePath);
    expect(repository.getRecruitment(1)?.channelNumber).toBe(1);
    expect(repository.getRecruitment(2)?.channelNumber).toBe(2);
    expect(repository.getRecruitment(3)?.channelNumber).toBe(1);
    repository.close();
  });

  it("migrates shared Rift/ARAM channel numbers to separate sequences", () => {
    const directory = mkdtempSync(join(tmpdir(), "cr-inhouse-number-split-test-"));
    const databasePath = join(directory, "state.sqlite");
    const oldDatabase = new DatabaseSync(databasePath);
    oldDatabase.exec(`
      CREATE TABLE panels (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        channel_id TEXT UNIQUE,
        message_id TEXT,
        creator_id TEXT NOT NULL,
        status TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      CREATE TABLE recruitments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        panel_id INTEGER NOT NULL REFERENCES panels(id),
        guild_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        channel_id TEXT UNIQUE,
        message_id TEXT,
        creator_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        game_type TEXT NOT NULL,
        channel_number INTEGER,
        description TEXT,
        scheduled_at INTEGER,
        timezone_input TEXT,
        status TEXT NOT NULL,
        summon_state TEXT NOT NULL DEFAULT 'AVAILABLE',
        created_at INTEGER NOT NULL,
        closed_at INTEGER
      );
      CREATE UNIQUE INDEX uq_recruitments_active_channel_number
        ON recruitments(guild_id, category_id, channel_number)
        WHERE channel_number IS NOT NULL AND status IN ('CREATING', 'OPEN');
      INSERT INTO panels
        (guild_id, category_id, channel_id, message_id, creator_id, status, created_at)
      VALUES
        ('guild-1', 'category-1', 'panel-channel-1', 'panel-message-1', 'admin-1', 'ACTIVE', 1);
      INSERT INTO recruitments
        (panel_id, guild_id, category_id, channel_id, message_id, creator_id, kind,
         game_type, channel_number, status, summon_state, created_at)
      VALUES
        (1, 'guild-1', 'category-1', 'channel-1', 'message-1', 'user-1', 'RIFT_NOW',
         'RIFT', 1, 'OPEN', 'AVAILABLE', 2),
        (1, 'guild-1', 'category-1', 'channel-2', 'message-2', 'user-2', 'RIFT_NOW',
         'RIFT', 2, 'OPEN', 'AVAILABLE', 3),
        (1, 'guild-1', 'category-1', 'channel-3', 'message-3', 'user-3', 'ARAM_NOW',
         'ARAM', 3, 'OPEN', 'AVAILABLE', 4);
    `);
    oldDatabase.close();

    const repository = new SqliteRecruitmentRepository(databasePath);
    expect(repository.getRecruitment(1)?.channelNumber).toBe(1);
    expect(repository.getRecruitment(2)?.channelNumber).toBe(2);
    expect(repository.getRecruitment(3)?.channelNumber).toBe(1);
    repository.close();
  });

  it("applies a persisted guild-wide cooldown", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    expect(repository.tryAcquireCooldown("guild-1", "ALL_MENTION", 1_000, 10_000)).toEqual({
      acquired: true,
      remainingMs: 0,
    });
    expect(repository.tryAcquireCooldown("guild-1", "ALL_MENTION", 5_000, 10_000)).toEqual({
      acquired: false,
      remainingMs: 6_000,
    });
    expect(repository.tryAcquireCooldown("guild-2", "ALL_MENTION", 5_000, 10_000).acquired).toBe(
      true,
    );
    expect(repository.tryAcquireCooldown("guild-1", "ALL_MENTION", 11_000, 10_000).acquired).toBe(
      true,
    );
    repository.close();
  });

  it("claims summon atomically and supports release or permanent completion", () => {
    const repository = new SqliteRecruitmentRepository(":memory:");
    const recruitment = createOpenRecruitment(repository);

    expect(repository.tryClaimSummon(recruitment.id)).toBe(true);
    expect(repository.tryClaimSummon(recruitment.id)).toBe(false);
    repository.releaseSummonClaim(recruitment.id);
    expect(repository.tryClaimSummon(recruitment.id)).toBe(true);
    repository.completeSummon(recruitment.id);
    expect(repository.tryClaimSummon(recruitment.id)).toBe(false);
    expect(repository.getRecruitment(recruitment.id)?.summonState).toBe("USED");
    repository.close();
  });

  it("restores queue, cooldown, and summon state after a database reopen", () => {
    const directory = mkdtempSync(join(tmpdir(), "cr-inhouse-test-"));
    const databasePath = join(directory, "state.sqlite");
    const firstRepository = new SqliteRecruitmentRepository(databasePath);
    const recruitment = createOpenRecruitment(firstRepository);
    firstRepository.addQueueMember(recruitment.id, "member-1", "첫 번째", 10);
    firstRepository.tryAcquireCooldown("guild-1", "ALL_MENTION", 1_000, 10_000);
    firstRepository.tryClaimSummon(recruitment.id);
    firstRepository.completeSummon(recruitment.id);
    firstRepository.close();

    const secondRepository = new SqliteRecruitmentRepository(databasePath);
    expect(secondRepository.listQueueMembers(recruitment.id)).toHaveLength(1);
    expect(secondRepository.getRecruitment(recruitment.id)?.summonState).toBe("USED");
    expect(
      secondRepository.tryAcquireCooldown("guild-1", "ALL_MENTION", 5_000, 10_000),
    ).toEqual({ acquired: false, remainingMs: 6_000 });
    secondRepository.close();
  });
});
