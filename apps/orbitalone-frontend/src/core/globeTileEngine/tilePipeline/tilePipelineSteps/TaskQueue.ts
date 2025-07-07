// src/globeTileEngine/tilePipeline/tilePipelineSteps/TaskQueue.ts

export type TaskFn = () => Promise<void>;

export interface TaskQueueItem {
  key: string;
  task: TaskFn;
  zoom: number;
  revision: number;
}

export class TaskQueue {
  private queue: TaskQueueItem[] = [];
  private busy = false;

  private static readonly MAX_PARALLEL_TASKS = 8;

  enqueue(item: TaskQueueItem): void {
    if (!this.queue.find((q) => q.key === item.key)) {
      this.queue.push(item);
    }
  }

  has(key: string): boolean {
    return this.queue.some((item) => item.key === key);
  }

  removeLowestPriority(): TaskQueueItem | undefined {
    // Remove the task with the highest screenDist (last in queue if sorted)
    return this.queue.pop();
  }

  clear(): void {
    this.queue.length = 0;
  }

  prune(predicate: (item: TaskQueueItem) => boolean): void {
    this.queue = this.queue.filter((item) => !predicate(item));
  }

  filterCurrentZoomAndRevision(zoom: number, revision: number): void {
    this.queue = this.queue.filter(
      (item) => item.zoom === zoom && item.revision === revision,
    );
  }

  isBusy(): boolean {
    return this.busy;
  }
  length(): number {
    return this.queue.length;
  }

  async process(): Promise<void> {
    if (this.busy) return;
    this.busy = true;

    while (this.queue.length > 0) {
      const tasks = this.queue.splice(0, TaskQueue.MAX_PARALLEL_TASKS);
      await Promise.all(tasks.map((item) => item.task()));
      await new Promise((res) => setTimeout(res, 0));
    }
    this.busy = false;
  }
}
