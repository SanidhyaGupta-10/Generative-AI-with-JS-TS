import readlineSync from 'readline-sync';
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from 'groq-sdk/resources/chat.mjs';
import { eq, like } from 'drizzle-orm';
import { db } from './db';
import { todosTable } from './db/schema';

type Todo = {
    todo: string;
    isCompleted: boolean;
};

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
};

async function searchTodo({ search }: { search: string }) {
    const todos = await db
        .select()
        .from(todosTable)
        .where(like(todosTable.todo, `%${search}%`));
    return todos;
};

async function getAllTodos(){
    const todos = await db.select()
        .from(todosTable);
    return todos;
};

const tools = {
    getAllTodos: getAllTodos,
    addTodo: addTodo,
    toggleTodo: toggleTodo,
    deleteTodo: deleteTodo,
    searchTodo: searchTodo,
};

/**
 * System prompt that defines the AI agent's behavior and response format
 * This instructs the AI to:
 * - Act as a todo list assistant
 * - Follow a strict JSON output format
 * - Follow a plan -> action -> observation -> output workflow
 * - Only output specific JSON structures
 */
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

// Initialize conversation history with the system prompt
const messages: ChatCompletionMessageParam[] = [{ 
    role: "system", 
    content: systemPrompt
}];

/**
 * Main function that runs the interactive todo assistant
 * Handles the conversation loop, user input, and AI interactions
 */
async function run() {
  // Main loop - continues until the program is terminated
  while (true) {
    // Get user input from the console
    const query = readlineSync.question(">> ");
    // Format user message as JSON
    const userMessage = {
      type: 'user',
      user: query
    };

    // Add user message to conversation history
    messages.push({ 
      role: 'user', 
      content: JSON.stringify(userMessage) 
    });

    // Inner loop - handles the AI's multi-step reasoning for a single user query
    while (true) {
      // Send conversation history to the AI model
      const response = await client.chat.completions.create({
        model: "openai/gpt-oss-120b",
        messages: messages,
        tool_choice: "auto", // Let the model decide when to use tools
      });

      // Extract the AI's response content
      const result = response.choices[0]?.message.content;
      if (!result) break; // Break if no response received

      // Add AI response to conversation history
      messages.push({
        role: 'assistant',
        content: result
      });

      let action;
      try {
        // Clean the response by removing markdown code block markers if present
        const cleaned = result.replace(/```(?:json)?/g, '').trim();

        // Parse the JSON response
        action = JSON.parse(cleaned);
      } catch {
        // If JSON parsing fails, log error and continue to next iteration
        console.log("Failed to parse response:", result);
        continue;
      };

      // Handle different response types from the AI
      if (action.type === 'output') {
        // Output message to user and break inner loop to wait for next user input
        console.log(`🤖: ${action.output}`);
        break;
      } 
      else if (action.type === 'action') {
        // Execute a tool call
        const fn = (tools as any)[action.name];
        if (!fn) throw new Error('Invalid Tool Call');

        // Execute the tool with the provided arguments
        const observation = await fn(action.args);
        // Create observation message from the tool result
        const observationMessage = {
          type: 'observation',
          observation: observation
        };
        // Add observation to conversation history for the AI to process
        messages.push({ role: 'user', content: JSON.stringify(observationMessage) });
      } 
      else if (action.type === 'plan') {
        // Display the AI's plan to the user and continue to next AI response
        console.log(`🧠 Plan: ${action.plan}`);
      }
    };
  };
};

// Start the application
run();