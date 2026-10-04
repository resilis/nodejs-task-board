const MAX_TASKS = 100;
const SEEDED_TASKS = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    title: "Map the first user journey",
    status: "todo",
    createdAt: "2026-01-01T09:00:00.000Z",
    updatedAt: "2026-01-01T09:00:00.000Z"
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    title: "Review the deployment checklist",
    status: "doing",
    createdAt: "2026-01-01T09:05:00.000Z",
    updatedAt: "2026-01-01T09:05:00.000Z"
  },
  {
    id: "00000000-0000-4000-8000-000000000003",
    title: "Share the sample with your team",
    status: "done",
    createdAt: "2026-01-01T09:10:00.000Z",
    updatedAt: "2026-01-01T09:10:00.000Z"
  }
];

export class TaskLimitError extends Error {}

export class MemoryTaskStore {
  constructor() {
    this.tasks = new Map(SEEDED_TASKS.map((task) => [task.id, { ...task }]));
  }

  async ping() {}

  async listTasks() {
    return [...this.tasks.values()]
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((task) => ({ ...task }));
  }

  async createTask({ id, title, status }) {
    if (this.tasks.size >= MAX_TASKS) {
      throw new TaskLimitError("Task limit reached.");
    }
    const now = new Date().toISOString();
    const task = { id, title, status, createdAt: now, updatedAt: now };
    this.tasks.set(id, task);
    return { ...task };
  }

  async updateTask(id, changes) {
    const current = this.tasks.get(id);
    if (!current) {
      return null;
    }
    const task = {
      ...current,
      ...changes,
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, task);
    return { ...task };
  }

  async deleteTask(id) {
    return this.tasks.delete(id);
  }

  async close() {}
}
