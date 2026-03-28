import type { VideoJob } from "../../types/index.js";

/**
 * In-memory job store for tracking job status.
 * In production, this would be backed by a database.
 */
class JobStore {
  private jobs = new Map<string, VideoJob>();

  get(id: string): VideoJob | undefined {
    return this.jobs.get(id);
  }

  set(job: VideoJob): void {
    this.jobs.set(job.id, { ...job, updatedAt: new Date() });
  }

  update(id: string, updates: Partial<VideoJob>): VideoJob | undefined {
    const existing = this.jobs.get(id);
    if (!existing) return undefined;

    const updated: VideoJob = {
      ...existing,
      ...updates,
      updatedAt: new Date(),
    };
    this.jobs.set(id, updated);
    return updated;
  }

  list(): VideoJob[] {
    return Array.from(this.jobs.values()).sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );
  }

  delete(id: string): boolean {
    return this.jobs.delete(id);
  }
}

export const jobStore = new JobStore();
