import { Vault } from "obsidian";
import { ConversationRecord } from "./types";

/**
 * 对话历史持久化管理
 * 通过 Obsidian 的 vault adapter 读写 JSON 文件
 */
export class ConversationHistory {
  private records: ConversationRecord[] = [];
  private filePath: string;
  private vault: Vault;
  private loaded: boolean = false;

  constructor(filePath: string, vault: Vault) {
    this.filePath = filePath;
    this.vault = vault;
  }

  /**
   * 从文件加载所有历史记录
   */
  async loadAll(): Promise<ConversationRecord[]> {
    if (this.loaded) return [...this.records];
    try {
      const adapter = this.vault.adapter;
      if (await adapter.exists(this.filePath)) {
        const content = await adapter.read(this.filePath);
        this.records = JSON.parse(content);
      }
    } catch (e) {
      console.warn("[AI Lexi] 加载历史对话失败:", e);
      this.records = [];
    }
    this.loaded = true;
    return [...this.records];
  }

  /**
   * 保存所有记录到文件
   */
  async saveAll(): Promise<void> {
    try {
      const adapter = this.vault.adapter;
      await adapter.write(this.filePath, JSON.stringify(this.records, null, 2));
    } catch (e) {
      console.warn("[AI Lexi] 保存历史对话失败:", e);
    }
  }

  /**
   * 添加新记录
   */
  async add(record: ConversationRecord): Promise<void> {
    await this.loadAll();
    this.records.push(record);
    await this.saveAll();
  }

  /**
   * 更新指定 ID 的记录
   */
  async update(id: string, updates: Partial<ConversationRecord>): Promise<void> {
    await this.loadAll();
    const idx = this.records.findIndex((r) => r.id === id);
    if (idx === -1) return;
    this.records[idx] = { ...this.records[idx], ...updates, updatedAt: Date.now() };
    await this.saveAll();
  }

  /**
   * 删除指定 ID 的记录
   */
  async delete(id: string): Promise<void> {
    await this.loadAll();
    this.records = this.records.filter((r) => r.id !== id);
    await this.saveAll();
  }

  /**
   * 获取所有记录（已排序，最新在前）
   */
  async getAll(): Promise<ConversationRecord[]> {
    await this.loadAll();
    return [...this.records].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /**
   * 根据 ID 获取记录
   */
  async get(id: string): Promise<ConversationRecord | undefined> {
    await this.loadAll();
    return this.records.find((r) => r.id === id);
  }
}
