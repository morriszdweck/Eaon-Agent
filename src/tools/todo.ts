// Session todo list — keeps multi-step work on track without burning context.

import { obj, registerTool, str } from "./index.js";

registerTool({
  subagentOk: true,
  schema: {
    name: "todo_write",
    description: "Replace the session todo list. Use for multi-step tasks: plan, track, mark done.",
    parameters: obj({
      todos: {
        type: "array",
        description: "Full todo list (replaces existing)",
        items: {
          type: "object",
          properties: {
            content: str("Task description"),
            status: str("pending | in_progress | completed", { enum: ["pending", "in_progress", "completed"] }),
          },
          required: ["content", "status"],
        },
      },
    }, ["todos"]),
  },
  async run(args, rt) {
    const todos = (args.todos ?? []) as { content: string; status: string }[];
    rt.session.todos = todos.map((t) => ({ content: String(t.content), status: t.status as any }));
    const lines = rt.session.todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`);
    rt.hooks.onNotice?.(`Todo list updated (${todos.length} items)`);
    return lines.length ? lines.join("\n") : "Todo list cleared.";
  },
});

registerTool({
  subagentOk: true,
  schema: {
    name: "todo_read",
    description: "Read the current session todo list.",
    parameters: obj({}, []),
  },
  async run(_args, rt) {
    if (!rt.session.todos.length) return "Todo list is empty.";
    return rt.session.todos.map((t, i) => `${i + 1}. [${t.status}] ${t.content}`).join("\n");
  },
});
