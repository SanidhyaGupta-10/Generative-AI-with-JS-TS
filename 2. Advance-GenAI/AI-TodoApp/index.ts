import readlineSync from 'readline-sync';
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat.mjs';
import { eq, like } from 'drizzle-orm';
import { db } from './db';
import { todosTable } from './db/schema';

type Todo = {
    todo: string;
    isCompleted: boolean;
}

async function addTodo({ todo, isCompleted = false }: Todo) {
    todo = todo.trim();
    if(!todo){
        throw new Error("Todo cannot be empty");
    }
    const result = await db.insert(todosTable).values({
        todo,
        isCompleted,
    });
    return result;
};

async function deleteTodo({ id }: { id: number }) {
    const removeTodo = await db.delete(todosTable).where(eq(todosTable.id, id));
    return removeTodo;
};

async function toggleTodo({ id }: { id: number }) {
    const result = await db.update(todosTable)
       .set({ isCompleted: true })
       .where(eq(todosTable.id, id)); 
    return result;
}

async function searchTodo({ search }: { search: string }) {
    const todos = await db
        .select()
        .from(todosTable)
        .where(like(todosTable.todo, `%${search}%`));
    return todos;
}

async function getAllTodos(){
    const todos = await db.select()
        .from(todosTable);
    return todos;
};

export const tools = {
    getAllTodos: getAllTodos,
    addTodo: addTodo,
    toggleTodo: toggleTodo,
    deleteTodo: deleteTodo,
    searchTodo: searchTodo,
}

export const systemPrompt = `
    You are an AI To-Do list Assistant. You can manage tasks by adding, viewing, updating, and deleting tasks.
    You must strictly follow the JSON output format. Respond with ONLY ONE JSON object per message. Do not add any text before or after the JSON block.

    Wait for the user prompt and first PLAN using Available tools.
    After Planning, take the ACTION with appropriate tool and wait for Observation.
    Once you get the Observation, Return the AI response (OUTPUT).

    Todo DB Schema:
    - id: number
    - todo: string
    - completed: boolean
    - createdAt: Date Time
    - updatedAt: Date Time

    Available Tools:
    - getAllTodos(): Returns all the Todos from Database
    - addTodo(todo: string): Creates a new Todo
    - toggleTodo(id: number): Toggles the completion status of a Todo
    - deleteTodo(id: number): Deletes a Todo
    - searchTodo(search: string): Searches for a Todo

    Every time you respond, you must ONLY output ONE of the following JSON formats:

    To define a plan:
    { "type": "plan", "plan": "Description of what you intend to do next." }

    To execute an action:
    { "type": "action", "name": "addTodo", "args": { "todo": "shopping groceries"} }

    To output a message to the user:
    { "type": "output", "output": "Task added successfully." }
`


const client = new Groq({ 
    apiKey: process.env.GROQ_API_KEY 
});

export const messages: ChatCompletionMessageParam[] = [{ role: "system", content: systemPrompt}];

export async function run() {
  while (true) {
    const query = readlineSync.question(">> ");
    const userMessage = {
      type: 'user',
      user: query
    };

    messages.push({ role: 'user', content: JSON.stringify(userMessage) });

    while (true) {
      const response = await client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: messages,
        tool_choice: "auto",
      });
      const result = response.choices[0]?.message.content;
      if (!result) break;

      messages.push({
        role: 'assistant',
        content: result
      });

      let action;
      try {
        // Strip out markdown code block delimiters and parse the entire result
        const cleaned = result.replace(/```(?:json)?/g, '').trim();
        action = JSON.parse(cleaned);
      } catch {
        console.log("Failed to parse response:", result);
        continue;
      }

      if (action.type === 'output') {
        console.log(`🤖: ${action.output}`);
        break;
      } else if (action.type === 'action') {
        const fn = (tools as any)[action.name];
        if (!fn) throw new Error('Invalid Tool Call');

        const observation = await fn(action.args);
        const observationMessage = {
          type: 'observation',
          observation: observation
        };
        messages.push({ role: 'user', content: JSON.stringify(observationMessage) });
      } else if (action.type === 'plan') {
        console.log(`🧠 Plan: ${action.plan}`);
      }
    }
  }
}

run();